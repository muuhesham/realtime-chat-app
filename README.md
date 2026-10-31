# Realtime Chat App

A full-stack real-time chat application built with React, Socket.IO, and Express.

![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

## Features

- Public room messaging
- Private one-to-one conversations
- Online user list
- Unique, case-insensitive usernames
- Typing indicators and read receipts
- Message validation with a 500-character limit
- Username validation and a configurable 30-user room capacity
- Responsive light and dark themes

## Tech Stack

**Frontend**

- React
- Vite
- Tailwind CSS
- Socket.IO Client
- React Toastify

**Backend**

- Node.js
- Express
- Socket.IO
- dotenv
- CORS

## Project Structure

```text
realtime-chat-app/
├── src/
│   ├── index.js      # Express and Socket.IO server
│   ├── env.js        # Environment configuration
│   └── cors.js       # CORS configuration
├── client/
│   └── src/
│       ├── App.jsx   # Chat interface
│       └── main.jsx  # React entry point
├── .env.example
└── package.json
```

## Prerequisites

- Node.js 18 or newer
- npm

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/muuhesham/realtime-chat-app.git
cd realtime-chat-app
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Install frontend dependencies

```bash
cd client
npm install
cd ..
```

### 4. Configure the environment

Create a root `.env` file:

```env
PORT=3000
HOST=localhost
```

Create `client/.env`:

```env
VITE_SOCKET_URL=http://localhost:3000
```

Update the allowed frontend origin in `src/cors.js` if the Vite URL changes.

### 5. Start the backend

```bash
npm run dev
```

### 6. Start the frontend

```bash
cd client
npm run dev
```

Open `http://localhost:5173`.

## Available Backend Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the backend with nodemon |
| `npm start` | Start the backend with Node.js |

## Available Frontend Scripts

Run these commands from the `client` directory:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build |

## Socket Events

| Event | Direction | Purpose |
| --- | --- | --- |
| `joinChat` | Client to server | Register an online username |
| `joinSuccess` | Server to client | Confirm a successful join |
| `joinError` | Server to client | Return a join validation error |
| `onlineUser` | Server to clients | Broadcast the online user list |
| `sendMessage` | Client to server | Send a public message |
| `newMessage` | Server to clients | Broadcast a public message |
| `privateMessage` | Client to server | Send a private message |
| `newPrivateMessage` | Server to recipient | Deliver a private message |
| `typing` | Client to server | Notify typing activity |
| `messageSeen` | Client to server | Send a read receipt |