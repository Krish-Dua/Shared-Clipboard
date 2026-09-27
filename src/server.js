import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";



dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
  },
});

const serverRooms= new Map();


io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(cookieParser());


app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running ."
    });
});

app.post("/api/checkRoomAvailability", (req, res) => {
    const {roomId} = req.body;
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "Room ID is required ."
      })
    }

    const roomExists = serverRooms.has(roomId)
    if (roomExists) {
      return res.status(200).json({
        success: false,
        message: `Room ID ${roomId} is already active .`
      }); 
    }

    serverRooms.set(roomId, {users:new Set(), clips:[]})

    return res.status(200).json({
      success: true,
      message: `Room ID ${roomId} is available .`
    });

    
});



app.post("/api/checkIfRoomExistToJoin", (req, res) => {
    const {roomId} = req.body;
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "Room ID is required ."
      })
    }

    const roomExists = serverRooms.has(roomId)
    if (!roomExists) {
      return res.status(200).json({
        success: false,
        message: `Room with ID ${roomId} doesn't exist .`
      }); 
    }

    return res.status(200).json({
      success: true,
      message: `Room with ID ${roomId} is available to join .`
    });
});

app.use(notFound);

app.use(errorHandler);


server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});