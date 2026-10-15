import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const app = express();
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // configration options [cors]
  origin: "http://localhost:5173",
  methods: ["GET", "POST"],
});

app.get('/health', (_req, res) => {
    res.status(200).json({
         status: 'ok',
         timestamp: new Date().toISOString(),
         uptime: process.uptime(),
         memoryUsage: process.memoryUsage(),
    });
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