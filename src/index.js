import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { corsOptions } from './cors.js';
import cors from 'cors';
import { PORT, HOST } from './env.js';


const app = express();
app.use(express.json());
app.use(cors(corsOptions));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // configration options [cors]
  origin: corsOptions.origin,
  methods: corsOptions.methods,
});

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
    socket.on('chat-message', (data) => {
        // if (!data || data.message || !data.username) {
        //     console.error('Invalid message data received');
        //     return;
        // }
        // io.to.emit('chat-message', {

        // });
        // io.emit('chat-message', {
        //     message: data.text,
        //     username: data.username,
        //     senderId: userId 
        // });
        console.log(`Received message from ${userId}: ${data}`);
    });
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
    });
});

// listen on http server not on express app
httpServer.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});