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
  maxHttpBufferSize: 1e7, // 10MB socket buffer limit
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

function broadcastRoomUsers(roomId) {
  const room = serverRooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit(
    "room-users-count",
    Array.from(room.users.entries()).map(([id, u]) => ({
      socketId: id,
      username: u.username,
      isAdmin: Boolean(u.isCreator),
    }))
  );
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, username, creatorKey, memberKey }) => {
    const room = serverRooms.get(roomId);
    if (!room) {
      socket.emit("room-not-found", {
        message: `Room #${roomId} does not exist or has closed.`,
      });
      return;
    }

    const masterKey = process.env.MASTER_KEY;
    const isCreator = Boolean(
      (room.creatorKey && creatorKey === room.creatorKey) ||
      (Boolean(masterKey) && creatorKey === masterKey)
    );

    if (!room.members) room.members = new Set();
    if (!room.pendingKnocks) room.pendingKnocks = new Map();

    const isApprovedMember = Boolean(memberKey && room.members.has(memberKey));

    // If room is locked and user is neither creator nor approved member, hold in waiting room
    if (room.isLocked && !isCreator && !isApprovedMember) {
      socket.room = roomId;
      socket.username = username;
      socket.memberKey = memberKey;

      const reqKey = memberKey || username;
      const existingKnock = room.pendingKnocks.get(reqKey);
      if (existingKnock?.disconnectTimeout) {
        clearTimeout(existingKnock.disconnectTimeout);
      }
      const isNewRequest = !existingKnock;
      room.pendingKnocks.set(reqKey, { socketId: socket.id, username, memberKey });

      socket.emit("room-locked-waiting");

      // Notify admin (include isNew flag so sound plays only once)
      for (const [adminSocketId, u] of room.users) {
        if (u.isCreator) {
          io.to(adminSocketId).emit("knock-request", {
            socketId: socket.id,
            username,
            memberKey,
            isNew: isNewRequest,
          });
        }
      }
      return;
    }

    // Auto-approve member if room is currently unlocked or they are creator
    if (memberKey) {
      room.members.add(memberKey);
    }

    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
      room.cleanupTimeout = null;
    }

    // Clean up stale or duplicate sockets for this user reconnecting
    for (const [id, u] of room.users) {
      if (id !== socket.id) {
        const s = io.sockets.sockets.get(id);
        if (!s || !s.connected || u.username === username || (isCreator && u.isCreator)) {
          room.users.delete(id);
          if (s) {
            s.leave(roomId);
            s.disconnect(true);
          }
        }
      }
    }

    socket.join(roomId);
    socket.room = roomId;
    socket.username = username;
    socket.memberKey = memberKey;
    room.users.set(socket.id, { username, isCreator, memberKey });

    socket.emit("room-creator-status", { isCreator });
    socket.emit("room-lock-status", { isLocked: Boolean(room.isLocked) });
    socket.emit("get-clips", room.clips);
    broadcastRoomUsers(roomId);

    // If creator joined, replay any current pending knocks without sound
    if (isCreator && room.pendingKnocks && room.pendingKnocks.size > 0) {
      for (const req of room.pendingKnocks.values()) {
        socket.emit("knock-request", {
          socketId: req.socketId,
          username: req.username,
          memberKey: req.memberKey,
          isNew: false,
        });
      }
    }
  });

  socket.on("toggle-lock-room", ({ creatorKey }) => {
    const room = serverRooms.get(socket.room);
    if (!room || (room.creatorKey !== creatorKey && creatorKey !== process.env.MASTER_KEY)) return;

    room.isLocked = !room.isLocked;
    io.to(socket.room).emit("room-lock-status", { isLocked: room.isLocked });
  });

  socket.on("cancel-knock", ({ roomId, memberKey }) => {
    const targetRoomId = socket.room || roomId;
    const room = serverRooms.get(targetRoomId);
    if (!room || !room.pendingKnocks) return;

    const reqKey = memberKey || socket.memberKey || socket.id;
    const pending = room.pendingKnocks.get(reqKey);
    if (pending?.disconnectTimeout) {
      clearTimeout(pending.disconnectTimeout);
    }
    room.pendingKnocks.delete(reqKey);

    for (const [adminSocketId, u] of room.users) {
      if (u.isCreator) {
        io.to(adminSocketId).emit("knock-canceled", { socketId: socket.id, memberKey: reqKey });
      }
    }
  });

  socket.on("approve-knock", ({ targetSocketId, memberKey, creatorKey }) => {
    const room = serverRooms.get(socket.room);
    if (!room || (room.creatorKey !== creatorKey && creatorKey !== process.env.MASTER_KEY)) return;

    // Find pending knock info
    const reqKey = memberKey || Array.from(room.pendingKnocks?.entries() || []).find(([k, v]) => v.socketId === targetSocketId)?.[0];
    const pendingItem = reqKey && room.pendingKnocks ? room.pendingKnocks.get(reqKey) : null;
    const actualTargetSocketId = pendingItem?.socketId || targetSocketId;
    const finalMemberKey = memberKey || pendingItem?.memberKey;

    if (reqKey && room.pendingKnocks) {
      if (pendingItem?.disconnectTimeout) {
        clearTimeout(pendingItem.disconnectTimeout);
      }
      room.pendingKnocks.delete(reqKey);
    }

    // Permanently approve member for this room session
    if (finalMemberKey) {
      room.members.add(finalMemberKey);
    }

    let targetSocket = io.sockets.sockets.get(actualTargetSocketId);
    if (targetSocket) {
      if (targetSocket.memberKey) room.members.add(targetSocket.memberKey);
      targetSocket.join(socket.room);
      room.users.set(targetSocket.id, {
        username: targetSocket.username,
        isCreator: false,
        memberKey: targetSocket.memberKey || finalMemberKey,
      });

      targetSocket.emit("knock-approved");
      targetSocket.emit("room-creator-status", { isCreator: false });
      targetSocket.emit("room-lock-status", { isLocked: Boolean(room.isLocked) });
      targetSocket.emit("get-clips", room.clips);
      broadcastRoomUsers(socket.room);
    }
  });

  socket.on("deny-knock", ({ targetSocketId, memberKey, creatorKey }) => {
    const room = serverRooms.get(socket.room);
    if (!room || (room.creatorKey !== creatorKey && creatorKey !== process.env.MASTER_KEY)) return;

    const reqKey = memberKey || Array.from(room.pendingKnocks?.entries() || []).find(([k, v]) => v.socketId === targetSocketId)?.[0];
    const pendingItem = reqKey && room.pendingKnocks ? room.pendingKnocks.get(reqKey) : null;
    const actualTargetSocketId = pendingItem?.socketId || targetSocketId;

    if (reqKey && room.pendingKnocks) {
      if (pendingItem?.disconnectTimeout) {
        clearTimeout(pendingItem.disconnectTimeout);
      }
      room.pendingKnocks.delete(reqKey);
    }

    const targetSocket = io.sockets.sockets.get(actualTargetSocketId);
    if (targetSocket) {
      targetSocket.emit("knock-denied", { message: "The host declined your request to join." });
    }
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

    const MAX_ROOM_BYTES = 510 * 1024 * 1024;
    let totalFileBytes = 0;
    const evictedClipIds = [];
    room.clips = room.clips.filter((c) => {
      if (!c.file) return true;
      const size = c.file.size || 0;
      if (totalFileBytes + size <= MAX_ROOM_BYTES) {
        totalFileBytes += size;
        return true;
      }
      evictedClipIds.push(c.id);
      deleteFileAndCleanEmptyRoomDir(c.file?.dataUrl);
      return false; 
    });

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

  socket.on("kick-user", ({ targetSocketId, creatorKey }) => {
    const room = serverRooms.get(socket.room);
    if (!room || (room.creatorKey !== creatorKey && creatorKey !== process.env.MASTER_KEY)) return;

    const targetUser = room.users.get(targetSocketId);
    if (targetUser?.memberKey) {
      room.members.delete(targetUser.memberKey);
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      if (targetSocket.memberKey) room.members.delete(targetSocket.memberKey);
      targetSocket.emit("kicked-from-room", { message: "You were kicked by the room admin." });
      targetSocket.leave(socket.room);
    }

    room.users.delete(targetSocketId);
    broadcastRoomUsers(socket.room);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (socket.room) {
      const room = serverRooms.get(socket.room);
      if (room) {
        const reqKey = socket.memberKey || socket.username || socket.id;

        // If this socket had a pending knock, provide a 4-second grace period for reload
        if (room.pendingKnocks && room.pendingKnocks.has(reqKey)) {
          const timeoutId = setTimeout(() => {
            const currentRoom = serverRooms.get(socket.room);
            if (currentRoom && currentRoom.pendingKnocks && currentRoom.pendingKnocks.has(reqKey)) {
              const pending = currentRoom.pendingKnocks.get(reqKey);
              if (pending?.socketId === socket.id) {
                currentRoom.pendingKnocks.delete(reqKey);
                for (const [adminSocketId, u] of currentRoom.users) {
                  if (u.isCreator) {
                    io.to(adminSocketId).emit("knock-canceled", { socketId: socket.id, memberKey: reqKey });
                  }
                }
              }
            }
          }, 4000);

          const pending = room.pendingKnocks.get(reqKey);
          if (pending) pending.disconnectTimeout = timeoutId;
        }

        room.users.delete(socket.id);
        broadcastRoomUsers(socket.room);

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
            1000 * 60 * 10
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
  })
);
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "../Frontend/dist")));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
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
  serverRooms.set(roomId, {
    users: new Map(),
    clips: [],
    creatorKey,
    isLocked: false,
    members: new Set(),
    pendingKnocks: new Map(),
  });

  return res.status(200).json({
    success: true,
    message: `Room ID ${roomId} is available .`,
    creatorKey,
  });
});

app.post("/api/checkIfRoomExistToJoin", (req, res) => {
  const { roomId } = req.body;
  if (!roomId) {
    return res.status(400).json({ success: false, message: "Room ID is required." });
  }
  if (!serverRooms.has(roomId)) {
    return res.status(200).json({ success: false, message: `Room with ID ${roomId} doesn't exist.` });
  }
  return res.status(200).json({ success: true, message: `Room with ID ${roomId} is available to join.` });
});

app.get("{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/dist/index.html"));
});

app.use(notFound);
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
