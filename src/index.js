import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { corsOptions } from "./cors.js";
import cors from "cors";
import { PORT, HOST } from "./env.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
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

io.on("connection", (socket) => {
  const userId = socket.id;
  console.log(`User connected: ${userId}`);
  socket.on("sendMessage", (data) => {
    if(!data || typeof data?.message !== 'string') return;
    const msg = data.message.trim();
    if(!msg || msg.length > 500) return;

    const message = {
      messageId: Date.now() + Math.random(),
      message: msg,
      username: onlineUsers.get(userId) || "Guest",
      senderId: userId,
      createdAt: new Date().toLocaleTimeString(),
    };
    messageSenders.set(message.messageId, message.senderId);
    io.emit("newMessage", message);
  });

  // online-offline
  socket.on('joinChat', (username) =>{
    if(typeof username !== 'string' || !username.trim()) return;
    const displayName = username.trim();
    const isNewUser = !onlineUsers.has(userId);

    if (onlineUsers.get(userId) === displayName) return;
    onlineUsers.set(userId, displayName);

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
    if (typeof data.recipientId === "string") {
      if (!onlineUsers.has(data.recipientId) || data.recipientId === userId) return;
      io.to(data.recipientId).emit("userTyping", {
        username,
        senderId: userId,
        recipientId: data.recipientId,
        isPrivate: true,
      });
      return;
    }
    socket.broadcast.emit("userTyping", {
      username,
      senderId: userId,
      isPrivate: false,
    });
  });
  socket.on("stopTyping", (data) => {
    const username = onlineUsers.get(userId);
    if (!username) return;
    if (typeof data?.recipientId === "string") {
      if (!onlineUsers.has(data.recipientId) || data.recipientId === userId) return;
      io.to(data.recipientId).emit("userStopTyping", {
        senderId: userId,
        recipientId: data.recipientId,
        isPrivate: true,
      });
      return;
    }
    socket.broadcast.emit("userStopTyping", {
      username,
      senderId: userId,
      isPrivate: false,
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
    const recipientId = data?.recipientId || data?.reciverId;
    if (
      !data ||
      typeof recipientId !== "string" ||
      typeof data.message !== "string" ||
      !data.message.trim() ||
      data.message.trim().length > 500
    )
      return;
    const message = data.message;

    if(!onlineUsers.has(recipientId) || recipientId === userId){
     socket.emit("notification", {
       type: "error",
       message: recipientId === userId ? "You cannot message yourself." : "User is offline",
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
    
     io.to(recipientId).emit('newPrivateMessage', privateMsg);
     // Include the recipient only in the sender's copy so the client can
     // place the message in the correct direct-message conversation.
     socket.emit('privateMessageSent', {
       ...privateMsg,
       recipientId,
       recipientUsername: onlineUsers.get(recipientId),
     });
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
