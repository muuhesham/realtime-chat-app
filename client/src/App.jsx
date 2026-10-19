import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Vite exposes client-side variables that start with VITE_ through import.meta.env.
// Change client/.env if the backend runs on another host or port.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

function App() {
  // Store the socket in a ref so one connection is reused across React renders.
  const socketRef = useRef(null);
  // Keep the current name available to Socket.IO callbacks without reconnecting.
  const usernameRef = useRef("Guest");
  // Keep the delayed stop-typing action so it can be reset after each keystroke.
  const stopTypingTimerRef = useRef(null);

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
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [privateRecipientId, setPrivateRecipientId] = useState("");

  const joinChat = () => {
    // Register the current client with the backend's online-users list.
    socketRef.current?.emit("joinChat", usernameRef.current.trim() || "Guest");
  };

  const handleUsernameChange = (event) => {
    // Save the latest display name for the next joinChat event.
    usernameRef.current = event.target.value;
    setUsername(event.target.value);
  };

  useEffect(() => {
    localStorage.setItem("chat-messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    // Create the Socket.IO client connection when the chat screen opens.
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // Show connection state in the UI so it is easy to verify the backend connection.
    socket.on("connect", () => {
      setConnectionStatus("Connected");
      joinChat();
    });
    socket.on("disconnect", () => setConnectionStatus("Disconnected"));
    socket.on("connect_error", () => setConnectionStatus("Connection failed"));

    // Turn backend notification events into small toast messages in the UI.
    socket.on("notification", ({ type, message }) => {
      if (!message) return;
      if (type === "welcome") toast.success(message);
      else if (type === "info") toast.info(message);
      else toast(message);
    });

    // Support the server's join event and its disconnect update event.
    const updateOnlineUsers = (users) => {
      setOnlineUsers(Array.isArray(users) ? users : []);
    };
    socket.on("onlineUser", updateOnlineUsers);
    socket.on("onlineUsers", updateOnlineUsers);

    // Add private messages received from another user to the current message list.
    socket.on("newPrivateMessage", (privateMessage) => {
      if (!privateMessage?.message) return;
      setMessages((currentMessages) => [
        ...currentMessages,
        { ...privateMessage, id: Date.now() + Math.random(), isPrivate: true },
      ]);
    });

    // Add the sender's private message after the backend confirms it was sent.
    socket.on("privateMessageSent", (privateMessage) => {
      if (!privateMessage?.message) return;
      setMessages((currentMessages) => [
        ...currentMessages,
        { ...privateMessage, id: Date.now() + Math.random(), isPrivate: true },
      ]);
    });

    // Mark the matching sent message as seen when its sender receives messageRead.
    socket.on("messageRead", ({ messageId }) => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.messageId === messageId ? { ...message, isRead: true } : message,
        ),
      );
    });

    // Display the name provided by another client while they are typing.
    socket.on("userTyping", (user) => {
      // Identify the typing client by socket ID, while keeping the name only for display.
      if (user.senderId !== socket.id) setTypingUser(user);
    });

    // Hide the typing indicator when that client stops typing.
    socket.on("userStopTyping", ({ senderId }) => {
      setTypingUser((currentUser) =>
        currentUser?.senderId === senderId ? null : currentUser,
      );
    });

    // Listen for the same event that the server broadcasts to every connected client.
    socket.on("newMessage", (incomingMessage) => {
      // Accept a plain string or a small message object from the backend.
      const normalizedMessage =
        typeof incomingMessage === "string"
          ? { message: incomingMessage, username: "Guest" }
          : {
              message: incomingMessage.message || "",
              username: incomingMessage.username || "Guest",
              messageId: incomingMessage.messageId,
              senderId: incomingMessage.senderId,
              createdAt: incomingMessage.createdAt,
            };

      if (normalizedMessage.message) {
        setMessages((currentMessages) => [
          ...currentMessages,
          { ...normalizedMessage, id: Date.now() + Math.random() },
        ]);

        // Confirm receipt only for a message sent by another Socket.IO client.
        if (
          normalizedMessage.messageId &&
          normalizedMessage.senderId !== socket.id
        ) {
          socket.emit("messageSeen", normalizedMessage.messageId);
        }
      }
    });

    // Remove listeners and close the connection when the component is unmounted.
    return () => {
      clearTimeout(stopTypingTimerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = (event) => {
    // Prevent the browser from refreshing the page when the form is submitted.
    event.preventDefault();
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || !socketRef.current?.connected) return;

    // Tell other clients that this user is no longer typing before sending the message.
    clearTimeout(stopTypingTimerRef.current);
    socketRef.current.emit("stopTyping");

    // Send privately only when an online recipient has been selected.
    if (privateRecipientId) {
      socketRef.current.emit("privateMessage", {
        reciverId: privateRecipientId,
        message: trimmedMessage,
      });
    } else {
      socketRef.current.emit("sendMessage", {
        message: trimmedMessage,
      });
    }
    setMessageText("");
  };

  const handleMessageChange = (event) => {
    const nextMessage = event.target.value;
    setMessageText(nextMessage);
    clearTimeout(stopTypingTimerRef.current);

    // Only emit typing when there is text, matching the backend validation rule.
    if (nextMessage.trim() && socketRef.current?.connected) {
      socketRef.current.emit("typing", {
        message: nextMessage,
      });

      // Mark typing as stopped after a short pause between keystrokes.
      stopTypingTimerRef.current = setTimeout(() => {
        socketRef.current?.emit("stopTyping");
      }, 900);
    } else if (socketRef.current?.connected) {
      // Stop immediately when the message input is cleared.
      socketRef.current.emit("stopTyping");
    }
  };

  const handleMessageBlur = () => {
    // Stop typing when the user leaves the message input.
    clearTimeout(stopTypingTimerRef.current);
    socketRef.current?.emit("stopTyping");
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb] px-4 py-6 text-slate-900 sm:px-6 sm:py-10">
      {/* This container renders notification toasts received from Socket.IO. */}
      <ToastContainer position="top-right" autoClose={3000} />
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
            {onlineUsers.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {onlineUsers.length} online: {onlineUsers.map((user) => user.username).join(", ")}
              </p>
            )}
          </div>
          {/* <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">Socket.IO</span> */}
        </header>

        {/* Let the user provide a display name without adding account or profile complexity. */}
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-7">
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <span className="shrink-0">Name</span>
            <input
              value={username}
              onChange={handleUsernameChange}
              onBlur={joinChat}
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
              // Align outgoing message placement with the stable socket ID from the server.
              const isMine = message.senderId === socketRef.current?.id;
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
                    {message.isPrivate && (
                      <p className={`mb-1 text-xs font-semibold ${isMine ? "text-blue-100" : "text-slate-500"}`}>
                        {isMine
                          ? "Private message sent"
                          : `Private message from ${message.username}`}
                      </p>
                    )}
                    <p className="mb-1 text-xs text-slate-400">{message.createdAt}</p>
                    {isMine && message.isRead && (
                      <p className="text-xs text-blue-100">Seen</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Show the Socket.IO typing event received from another connected user. */}
        <div className="h-6 px-5 text-xs italic text-slate-400 sm:px-7">
          {typingUser && `${typingUser.username} is typing...`}
        </div>

        {/* Send text through Socket.IO; no local message is added until the server broadcasts it back. */}
        <form
          onSubmit={sendMessage}
          className="border-t border-slate-100 p-4 sm:p-5"
        >
          {/* Pick an online user to use the backend's privateMessage event. */}
          <select
            value={privateRecipientId}
            onChange={(event) => setPrivateRecipientId(event.target.value)}
            className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-indigo-400"
          >
            <option value="">Public chat</option>
            {onlineUsers
              .filter((user) => user.senderId !== socketRef.current?.id)
              .map((user) => (
                <option key={user.senderId} value={user.senderId}>
                  Private message to {user.username}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <input
              value={messageText}
              onChange={handleMessageChange}
              onBlur={handleMessageBlur}
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
