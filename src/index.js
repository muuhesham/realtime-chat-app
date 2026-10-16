import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { corsOptions } from './cors.js';
import cors from 'cors';
import { PORT, HOST } from './env.js';


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // configration options [cors]
  cors: corsOptions,
});

app.use(express.json());
app.use(cors(corsOptions));

app.get('/health', (_req, res) => {
    const healthStatus = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
    res.status(200).json(healthStatus);
});

app.get('/', (_req, res) => {
    res.status(200).json({
        message: 'Welcome to the Socket.IO server!',
    });
});

app.get('/*splat', (req, res) => {
    res.status(404).json({
      error: `Route '${req.originalUrl}' not found!`,
    });
});

// basic structure of socket.io server
io.on('connection', (socket) => {
    const userId = socket.id;
    console.log(`User connected: ${userId}`);
    socket.on('sendMessage', (data) => {
        // console.log(`Received message from ${userId}: ${JSON.stringify(data)}`);

        const message = {
            message: data.message,
            username: data.username,
            senderId: userId,
            createdAt: new Date().toLocaleTimeString(),
        };
        // socket.emit('newMessage', message);
        io.emit('newMessage', message);
        // socket.broadcast.emit("newMessage", message);
    });
    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${userId} - Reason: ${reason}`);
    });
});

// listen on http server not on express app
httpServer.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});