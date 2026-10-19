import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { corsOptions } from "./cors.js";
import cors from "cors";
import { PORT, HOST } from "./env.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // configration options [cors]
  cors: corsOptions,
});

app.use(express.json());
app.use(cors(corsOptions));

app.get("/health", (_req, res) => {
  const healthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  };
  res.status(200).json(healthStatus);
});

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Welcome to the Socket.IO server!",
  });
});

app.get("/*splat", (req, res) => {
  res.status(404).json({
    error: `Route '${req.originalUrl}' not found!`,
  });
});

// memory
const messageSenders = new Map();
const onlineUsers = new Map();

// basic structure of socket.io server
io.on("connection", (socket) => {
  const userId = socket.id;
  console.log(`User connected: ${userId}`);
  socket.on("sendMessage", (data) => {
    // console.log(`Received message from ${userId}: ${JSON.stringify(data)}`);

    if(!data || typeof data?.message !== 'string') return;
    const msg = data.message.trim();
    if(!msg || msg.length > 500) return;

    const message = {
      messageId: Date.now() + Math.random(),
      message: msg,
      // Use the server's socket-ID mapping; never trust a display name from the client.
      username: onlineUsers.get(userId) || "Guest",
      senderId: userId,
      createdAt: new Date().toLocaleTimeString(),
    };
    messageSenders.set(message.messageId, message.senderId);
    // socket.emit('newMessage', message);
    io.emit("newMessage", message);
    // socket.broadcast.emit("newMessage", message);
  });

  // online-offline
  socket.on('joinChat', (username) =>{
    if(typeof username !== 'string' || !username.trim()) return;
    const displayName = username.trim();
    const isNewUser = !onlineUsers.has(userId);

    // Do not broadcast an unchanged name, but allow a socket ID to update its display name.
    if (onlineUsers.get(userId) === displayName) return;
    onlineUsers.set(userId, displayName);

    // Only show join notifications for a new socket connection, not for a name update.
    if (isNewUser) {
      socket.emit('notification', {
          type: 'welcome',
          message: `Welcome to the chat, ${displayName}`
      });
      socket.broadcast.emit("notification", {
          type: "info",
          message: `${displayName} joined the chat`,
      });
    }

    io.emit('onlineUser', Array.from(onlineUsers, ([senderId, username]) => ({
      senderId,
      username
    })));
  });

  // Typing
  socket.on("typing", (data) => {
    const username = onlineUsers.get(userId);
    if (!username || typeof data?.message !== "string" || !data.message.trim()) return;
    // send to all users without the sender
    socket.broadcast.emit("userTyping", {
      username,
      senderId: userId,
    });
  });
  socket.on("stopTyping", () => {
    const username = onlineUsers.get(userId);
    if (!username) return;
    // send to all users without the sender
    socket.broadcast.emit("userStopTyping", {
      username,
      senderId: userId,
    });
  });

  // Seen
  socket.on("messageSeen", (messageId) => {
    const senderId = messageSenders.get(messageId);
    if (!senderId || senderId === userId) return;
    io.to(senderId).emit("messageRead", {
      messageId,
    });
  });

  // private msg
  socket.on('privateMessage', (data) => {
    if (
      !data ||
      typeof data.reciverId !== "string" ||
      typeof data.message !== "string" ||
      !data.message.trim() ||
      data.message.trim().length > 500
    )
      return;
    const {reciverId, message} = data;

    if(!onlineUsers.has(reciverId)){
     socket.emit("notification", {
       type: "error",
       message: `User is offline`,
     });
     return;
    }

     const privateMsg = {
       messageId: Date.now() + Math.random(),
       senderId: userId,
       username: onlineUsers.get(userId) || "Guest",
       message: message.trim(),
       createdAt: new Date().toLocaleTimeString(),
     };
    
     io.to(reciverId).emit('newPrivateMessage', privateMsg);
     socket.emit('privateMessageSent', privateMsg);
     socket.emit('notification', {
        type: 'info',
        message: `Private Message send Successfully!`
     })
  });

  socket.on("disconnect", (reason) => {
    onlineUsers.delete(userId);
    io.emit('onlineUser', Array.from(onlineUsers, ([senderId, username]) => ({
        senderId, username
    })));
    console.log(`User disconnected: ${userId} - Reason: ${reason}`);
  });
});

// listen on http server not on express app
httpServer.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
