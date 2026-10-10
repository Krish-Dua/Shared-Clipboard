import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

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
  maxHttpBufferSize: 1e8, // 100MB buffer limit so files/PDFs are not rejected by Socket.IO
});

const serverRooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    const room = serverRooms.get(roomId);

    if (!room) {
      socket.emit("room-not-found", { message: `Room #${roomId} does not exist or has closed.` });
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

    socket.emit("get-clips", room.clips);

    io.to(roomId).emit("room-users-count", Array.from(room.users.values()));
  });

  socket.on("send-clip", (clip) => {
    if (!socket.room) return;
    const room = serverRooms.get(socket.room);
    if (!room) return;

    room.clips.unshift(clip);

    while (room.clips.length > 100) {
      room.clips.pop();
    }

    let fileCount = 0;
    room.clips = room.clips.filter((c) => {
      if (!c.file) return true;
      fileCount++;
      return fileCount <= 10;
    });

    io.to(socket.room).emit("receive-clip", clip);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (socket.room) {
      const room = serverRooms.get(socket.room);
      if (room) {
        room.users.delete(socket.id);
        io.to(socket.room).emit("room-users-count", Array.from(room.users.values()));

        if (room.users.size === 0) {
          room.cleanupTimeout = setTimeout(() => {
            const current = serverRooms.get(socket.room);
            if (current && current.users.size === 0) {
              serverRooms.delete(socket.room);
            }
          }, 1000 * 60 * 10);
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
    status: "ok"
  });
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

  serverRooms.set(roomId, { users: new Map(), clips: [] });

  return res.status(200).json({
    success: true,
    message: `Room ID ${roomId} is available .`,
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
