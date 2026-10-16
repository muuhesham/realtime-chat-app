import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Vite exposes client-side variables that start with VITE_ through import.meta.env.
// Change client/.env if the backend runs on another host or port.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

function App() {
  // Store the socket in a ref so one connection is reused across React renders.
  const socketRef = useRef(null);

  // Keep only the state needed by a basic real-time chat screen.
  const [username, setUsername] = useState("Guest");
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      const cachedMessages = localStorage.getItem("chat-messages");
      return cachedMessages ? JSON.parse(cachedMessages) : [];
    } catch {
      return [];
    }
  });
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  useEffect(() => {
    localStorage.setItem("chat-messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    // Create the Socket.IO client connection when the chat screen opens.
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // Show connection state in the UI so it is easy to verify the backend connection.
    socket.on("connect", () => setConnectionStatus("Connected"));
    socket.on("disconnect", () => setConnectionStatus("Disconnected"));
    socket.on("connect_error", () => setConnectionStatus("Connection failed"));

    // Listen for the same event that the server broadcasts to every connected client.
    socket.on("newMessage", (incomingMessage) => {
      // Accept a plain string or a small message object from the backend.
      const normalizedMessage =
        typeof incomingMessage === "string"
          ? { message: incomingMessage, username: "Guest" }
          : {
              message: incomingMessage.message || "",
              username: incomingMessage.username || "Guest",
              senderId: incomingMessage.senderId,
              createdAt: incomingMessage.createdAt,
            };

      if (normalizedMessage.message) {
        setMessages((currentMessages) => [
          ...currentMessages,
          { ...normalizedMessage, id: Date.now() + Math.random() },
        ]);
      }
    });

    // Remove listeners and close the connection when the component is unmounted.
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = (event) => {
    // Prevent the browser from refreshing the page when the form is submitted.
    event.preventDefault();
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || !socketRef.current?.connected) return;

    // This is the only event the UI sends: the backend can broadcast it as "chat message".
    socketRef.current.emit("sendMessage", {
      username: username.trim() || "Guest",
      message: trimmedMessage,
    });
    setMessageText("");
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb] px-4 py-6 text-slate-900 sm:px-6 sm:py-10">
      <section className="mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-200/60 sm:h-[min(760px,calc(100vh-5rem))]">
        {/* Keep the header focused on the room name and the live connection state. */}
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Online Chat</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span
                className={`h-2 w-2 rounded-full ${connectionStatus === "Connected" ? "bg-emerald-500" : "bg-amber-400"}`}
              />
              <span>{connectionStatus}</span>
            </div>
          </div>
          {/* <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">Socket.IO</span> */}
        </header>

        {/* Let the user provide a display name without adding account or profile complexity. */}
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-7">
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <span className="shrink-0">Name</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="min-w-0 flex-1 border-b border-slate-200 bg-transparent px-1 py-1 text-slate-800 outline-none focus:border-indigo-400"
              maxLength={30}
            />
          </label>
        </div>

        {/* Render messages received from the Socket.IO server in the order they arrive. */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-7">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
              <p>Connect to the server and send the first message.</p>
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.username === (username.trim() || "Guest");
              return (
                <div
                  key={message.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${isMine ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-gray-200 text-slate-800"}`}
                  >
                    <p
                      className={`mb-1 text-xs font-semibold ${isMine ? "" : "text-black"}`}
                    >
                      {message.username}
                    </p>
                    <p className="break-words text-bold mb-1 leading-6">
                      {message.message}
                    </p>
                    <p className="mb-1 text-xs text-slate-400">{message.createdAt}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Send text through Socket.IO; no local message is added until the server broadcasts it back. */}
        <form
          onSubmit={sendMessage}
          className="border-t border-slate-100 p-4 sm:p-5"
        >
          <div className="flex gap-2">
            <input
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Type a message..."
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />
            <button
              type="submit"
              disabled={!messageText.trim() || connectionStatus !== "Connected"}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Send
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default App;
