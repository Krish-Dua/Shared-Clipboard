import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";

import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e7, // 10MB socket buffer limit (large files stream over HTTP)
});

// Root uploads directory: ./uploads/<roomId>/<filename>
const UPLOAD_ROOT = path.join(__dirname, "../uploads");
if (fs.existsSync(UPLOAD_ROOT)) {
  try {
    fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
  } catch (err) {
    console.error("Failed to clean uploads on startup:", err);
  }
}
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const rawRoomId = req.query.roomId || req.body.roomId || "default";
    const safeRoomId = String(rawRoomId).replace(/[^a-zA-Z0-9_-]/g, "");
    const roomDir = path.join(UPLOAD_ROOT, safeRoomId);
    if (!fs.existsSync(roomDir)) {
      fs.mkdirSync(roomDir, { recursive: true });
    }
    cb(null, roomDir);
  },
  filename: (req, file, cb) => {
    const uniquePrefix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const safeOriginal = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${uniquePrefix}-${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
  },
});

const serverRooms = new Map();

function deleteFileAndCleanEmptyRoomDir(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("/api/files/")) return;
  const parts = dataUrl.replace("/api/files/", "").split("/");
  if (parts.length === 2) {
    const safeRoomId = parts[0].replace(/[^a-zA-Z0-9_-]/g, "");
    const safeFilename = path.basename(parts[1]);
    const roomDir = path.join(UPLOAD_ROOT, safeRoomId);
    const filePath = path.join(roomDir, safeFilename);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error("Failed to delete file:", filePath, err);
      }
    }

    // If room directory has no more files left, delete the room directory as well
    if (fs.existsSync(roomDir)) {
      try {
        const remaining = fs.readdirSync(roomDir);
        if (remaining.length === 0) {
          fs.rmSync(roomDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error("Failed to clean empty room directory:", roomDir, err);
      }
    }
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, username, creatorKey }) => {
    const room = serverRooms.get(roomId);

    if (!room) {
      socket.emit("room-not-found", {
        message: `Room #${roomId} does not exist or has closed.`,
      });
      return;
    }

    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
      room.cleanupTimeout = null;
    }

    socket.join(roomId);
    socket.room = roomId;
    socket.username = username;
    room.users.set(socket.id, username);

    const masterKey = process.env.MASTER_KEY;
    const isCreator = Boolean(
      (room.creatorKey && creatorKey === room.creatorKey) ||
      (Boolean(masterKey) && creatorKey === masterKey)
    );
    socket.emit("room-creator-status", { isCreator });

    socket.emit("get-clips", room.clips);

    io.to(roomId).emit("room-users-count", Array.from(room.users.values()));
  });

  socket.on("send-clip", (clip) => {
    if (!socket.room) return;
    const room = serverRooms.get(socket.room);
    if (!room) return;

    if (clip.file && clip.file.size > 500 * 1024 * 1024) return;
    room.clips.unshift(clip);

    while (room.clips.length > 100) {
      room.clips.pop();
    }

    const MAX_ROOM_BYTES = 510 * 1024 * 1024; // 510MB total files per room
    let totalFileBytes = 0;
    const evictedClipIds = [];
    room.clips = room.clips.filter((c) => {
      if (!c.file) return true;
      const size = c.file.size || 0;
      if (totalFileBytes + size <= MAX_ROOM_BYTES) {
        totalFileBytes += size;
        return true;
      }
      // Over 510MB: discard older file and unlink from disk (and remove room folder if empty)
      evictedClipIds.push(c.id);
      deleteFileAndCleanEmptyRoomDir(c.file?.dataUrl);
      return false; 
    });

    // Notify room users so evicted cards smoothly vanish from everyone's UI
    evictedClipIds.forEach((clipId) => {
      io.to(socket.room).emit("clip-deleted", { clipId });
    });

    io.to(socket.room).emit("receive-clip", clip);
  });

  socket.on("delete-clip", ({ clipId, creatorKey }) => {
    if (!socket.room) return;
    const room = serverRooms.get(socket.room);
    if (!room) return;

    const masterKey = process.env.MASTER_KEY;
    const isAuthorized =
      (room.creatorKey && creatorKey === room.creatorKey) ||
      (Boolean(masterKey) && creatorKey === masterKey);
    if (!isAuthorized) return;

    const clipToDelete = room.clips.find((c) => c.id === clipId);
    deleteFileAndCleanEmptyRoomDir(clipToDelete?.file?.dataUrl);

    room.clips = room.clips.filter((c) => c.id !== clipId);
    io.to(socket.room).emit("clip-deleted", { clipId });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (socket.room) {
      const room = serverRooms.get(socket.room);
      if (room) {
        room.users.delete(socket.id);
        io.to(socket.room).emit(
          "room-users-count",
          Array.from(room.users.values()),
        );

        if (room.users.size === 0) {
          room.cleanupTimeout = setTimeout(
            () => {
              const current = serverRooms.get(socket.room);
              if (current && current.users.size === 0) {
                const safeRoomId = String(socket.room).replace(/[^a-zA-Z0-9_-]/g, "");
                const roomDir = path.join(UPLOAD_ROOT, safeRoomId);
                fs.rm(roomDir, { recursive: true, force: true }, () => {});
                serverRooms.delete(socket.room);
              }
            },
            1000 * 60 * 10,
          );
        }
      }
    }
  });
});

app.use(cors());

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  }),
);
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "../Frontend/dist")));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

// Upload route with 500MB limit per file
app.post("/api/upload", (req, res) => {
  const rawRoomId = req.query.roomId || req.body.roomId || "default";
  const safeRoomId = String(rawRoomId).replace(/[^a-zA-Z0-9_-]/g, "");

  if (!serverRooms.has(safeRoomId)) {
    return res.status(404).json({ success: false, message: `Room #${safeRoomId} does not exist or has expired.` });
  }

  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, message: "File exceeds 500MB size limit." });
    }
    if (err || !req.file) {
      return res.status(400).json({ success: false, message: err?.message || "Upload failed." });
    }

    const fileUrl = `/api/files/${safeRoomId}/${req.file.filename}`;

    return res.status(200).json({
      success: true,
      fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  });
});

// File serving route
app.get("/api/files/:roomId/:filename", (req, res) => {
  const safeRoomId = String(req.params.roomId).replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_ROOT, safeRoomId, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "File not found or expired." });
  }

  if (req.query.download === "true") {
    // Strip timestamp and hash prefix so user downloads clean original name
    const originalName = safeFilename.split("-").slice(2).join("-") || safeFilename;
    return res.download(filePath, originalName);
  }

  res.sendFile(filePath);
});

app.post("/api/checkRoomAvailability", (req, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required .",
    });
  }

  const roomExists = serverRooms.has(roomId);
  if (roomExists) {
    return res.status(200).json({
      success: false,
      message: `Room ID ${roomId} is already active .`,
    });
  }

  const creatorKey = crypto.randomUUID();
  serverRooms.set(roomId, { users: new Map(), clips: [], creatorKey });

  return res.status(200).json({
    success: true,
    message: `Room ID ${roomId} is available .`,
    creatorKey,
  });
});

app.post("/api/checkIfRoomExistToJoin", (req, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required .",
    });
  }

  const roomExists = serverRooms.has(roomId);
  if (!roomExists) {
    return res.status(200).json({
      success: false,
      message: `Room with ID ${roomId} doesn't exist .`,
    });
  }

  return res.status(200).json({
    success: true,
    message: `Room with ID ${roomId} is available to join .`,
  });
});

app.get("{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/dist/index.html"));
});

app.use(notFound);
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
