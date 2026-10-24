import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Vite exposes client-side variables that start with VITE_ through import.meta.env.
// Change client/.env if the backend runs on another host or port.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

const formatMessageTime = (createdAt) => {
  if (!createdAt) return "Now";
  const match = String(createdAt).match(/^(\d{1,2}:\d{2})(?::\d{2})?(\s?[AP]M)?$/i);
  return match ? `${match[1]}${match[2] || ""}` : createdAt;
};

const getStoredUsername = () => {
  try {
    return localStorage.getItem("chat-username")?.trim() || "";
  } catch {
    return "";
  }
};

function App() {
  // Store the socket in a ref so one connection is reused across React renders.
  const socketRef = useRef(null);
  // Keep the current name available to Socket.IO callbacks without reconnecting.
  const usernameRef = useRef(getStoredUsername() || "Guest");
  // Keep the delayed stop-typing action so it can be reset after each keystroke.
  const stopTypingTimerRef = useRef(null);
  // Keep the latest message visible as messages arrive.
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const messageInputRef = useRef(null);

  // Keep only the state needed by a basic real-time chat screen.
  const [username, setUsername] = useState(() => getStoredUsername() || "Guest");
  const [isEditingName, setIsEditingName] = useState(() => !getStoredUsername());
  const [messageText, setMessageText] = useState("");
  const [publicMessages, setPublicMessages] = useState([]);
  const [privateChats, setPrivateChats] = useState({});
  const [activeConversationId, setActiveConversationId] = useState("general");
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("chat-dark-mode") === "true";
    } catch {
      return false;
    }
  });

  const privateRecipientId =
    activeConversationId === "general" ? "" : activeConversationId;
  const privateRecipient = privateChats[privateRecipientId];
  const messages =
    activeConversationId === "general"
      ? publicMessages
      : privateRecipient?.messages || [];

  const joinChat = () => {
    // Register the current client with the backend's online-users list.
    socketRef.current?.emit("joinChat", usernameRef.current.trim() || "Guest");
  };

  const handleUsernameChange = (event) => {
    setUsername(event.target.value);
  };

  const saveUsername = () => {
    const displayName = username.trim();
    if (!displayName) {
      toast.info("Please enter a name first.");
      return;
    }
    usernameRef.current = displayName;
    setUsername(displayName);
    localStorage.setItem("chat-username", displayName);
    setIsEditingName(false);
    joinChat();
  };

  useEffect(() => {
    // Older versions stored private messages alongside public messages.
    try {
      localStorage.removeItem("chat-messages");
    } catch {
      toast.error("Unable to clear messages saved by the previous version.");
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowScrollDown(false);
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("chat-dark-mode", String(darkMode));
  }, [darkMode]);

  const openPrivateChat = (user) => {
    if (!user?.senderId || user.senderId === socketRef.current?.id) return;
    setPrivateChats((currentChats) => ({
      ...currentChats,
      [user.senderId]: currentChats[user.senderId] || {
        username: user.username || "Unknown user",
        messages: [],
      },
    }));
    setActiveConversationId(user.senderId);
  };

  const addPrivateMessage = (privateMessage, recipientId, recipientUsername) => {
    const conversationId =
      privateMessage.senderId === socketRef.current?.id
        ? recipientId
        : privateMessage.senderId;
    if (!conversationId) return;

    setPrivateChats((currentChats) => {
      const currentChat = currentChats[conversationId] || {
        username:
          privateMessage.senderId === socketRef.current?.id
            ? recipientUsername
            : privateMessage.username,
        messages: [],
      };

      return {
        ...currentChats,
        [conversationId]: {
          ...currentChat,
          username:
            currentChat.username ||
            (privateMessage.senderId === socketRef.current?.id
              ? recipientUsername
              : privateMessage.username) ||
            "Unknown user",
          messages: [
            ...currentChat.messages,
            { ...privateMessage, id: Date.now() + Math.random(), isPrivate: true },
          ],
        },
      };
    });
  };

  const chatContacts = [
    ...Object.entries(privateChats).map(([senderId, chat]) => ({
      senderId,
      username: chat.username,
    })),
    ...onlineUsers
      .filter((user) => user.senderId !== socketRef.current?.id)
      .filter((user) => !privateChats[user.senderId])
      .map((user) => ({ senderId: user.senderId, username: user.username })),
  ];

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

    // Keep direct messages in the conversation with their sender only.
    socket.on("newPrivateMessage", (privateMessage) => {
      if (!privateMessage?.message) return;
      addPrivateMessage(privateMessage, socket.id);
    });

    // Keep the sender's copy in the conversation with its selected recipient.
    socket.on("privateMessageSent", (privateMessage) => {
      if (!privateMessage?.message) return;
      addPrivateMessage(
        privateMessage,
        privateMessage.recipientId,
        privateMessage.recipientUsername,
      );
    });

    // Mark the matching sent message as seen when its sender receives messageRead.
    socket.on("messageRead", ({ messageId }) => {
      setPublicMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.messageId === messageId ? { ...message, isRead: true } : message,
        ),
      );
    });

    // Display the name provided by another client while they are typing.
    socket.on("userTyping", (user) => {
      if (user.senderId !== socket.id) setTypingUser(user);
    });

    // Hide the typing indicator when that client stops typing.
    socket.on("userStopTyping", ({ senderId, isPrivate, recipientId }) => {
      setTypingUser((currentUser) =>
        currentUser?.senderId === senderId &&
        currentUser?.isPrivate === isPrivate &&
        (!isPrivate || currentUser?.recipientId === recipientId)
          ? null
          : currentUser,
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
        setPublicMessages((currentMessages) => [
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
    socketRef.current.emit("stopTyping", {
      recipientId: privateRecipientId || undefined,
    });

    // Never fall back to the public room if the selected recipient goes offline.
    if (privateRecipientId) {
      socketRef.current.emit("privateMessage", {
        recipientId: privateRecipientId,
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
        recipientId: privateRecipientId || undefined,
      });

      // Mark typing as stopped after a short pause between keystrokes.
      stopTypingTimerRef.current = setTimeout(() => {
        socketRef.current?.emit("stopTyping", {
          recipientId: privateRecipientId || undefined,
        });
      }, 900);
    } else if (socketRef.current?.connected) {
      // Stop immediately when the message input is cleared.
      socketRef.current.emit("stopTyping", {
        recipientId: privateRecipientId || undefined,
      });
    }
  };

  const handleMessageBlur = () => {
    // Stop typing when the user leaves the message input.
    clearTimeout(stopTypingTimerRef.current);
    socketRef.current?.emit("stopTyping", {
      recipientId: privateRecipientId || undefined,
    });
  };

  const replyPrivately = (message) => {
    if (!message.isPrivate || message.senderId === socketRef.current?.id) return;
    openPrivateChat({ senderId: message.senderId, username: message.username });
    messageInputRef.current?.focus();
  };

  const handleMessagesScroll = () => {
    const list = messagesListRef.current;
    if (!list) return;
    setShowScrollDown(list.scrollHeight - list.scrollTop - list.clientHeight > 48);
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  const visibleTypingUser =
    typingUser &&
    (typingUser.isPrivate
      ? typingUser.recipientId === socketRef.current?.id &&
        typingUser.senderId === activeConversationId
      : activeConversationId === "general")
      ? typingUser
      : null;

  return (
    <main className={`relative min-h-screen min-h-[100dvh] overflow-hidden transition-colors ${darkMode ? "bg-slate-950 text-slate-100" : "bg-[#f4f6fb] text-slate-900"}`}>
      <div className={`pointer-events-none absolute -left-24 top-10 h-72 w-72 rotate-12 rounded-[42%] border-[22px] ${darkMode ? "border-indigo-500/10" : "border-indigo-300/30"}`} />
      <div className={`pointer-events-none absolute -right-20 bottom-4 h-80 w-80 -rotate-12 rounded-[48%] border-[26px] ${darkMode ? "border-violet-400/10" : "border-violet-300/30"}`} />
      <div className={`pointer-events-none absolute left-[12%] top-[18%] h-24 w-40 rotate-45 rounded-full border-[14px] ${darkMode ? "border-sky-400/10" : "border-sky-300/25"}`} />
      {/* This container renders notification toasts received from Socket.IO. */}
      <ToastContainer position="top-right" autoClose={3000} theme={darkMode ? "dark" : "light"} />
      <section className={`relative z-10 flex h-screen h-[100dvh] w-full flex-col overflow-hidden ${darkMode ? "bg-slate-900" : "bg-white"}`}>
        {/* Keep the header focused on the room name and the live connection state. */}
        <header className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-7 sm:py-4 ${darkMode ? "border-slate-800 bg-gradient-to-r from-slate-900 to-indigo-950/40" : "border-slate-100 bg-gradient-to-r from-white to-indigo-50/40"}`}>
          <div>
            <h1 className="text-base font-bold tracking-tight sm:text-lg">Online Chat</h1>
            <div className={`mt-1 flex items-center gap-2 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              <span
                className={`h-2 w-2 rounded-full ${connectionStatus === "Connected" ? "bg-emerald-500" : "bg-amber-400"}`}
              />
              <span>{connectionStatus}</span>
            </div>
            <p className={`mt-1 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>{onlineUsers.length} online</p>
          </div>
          <button type="button" onClick={() => setDarkMode((current) => !current)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${darkMode ? "border-slate-700 bg-slate-800 text-amber-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`} aria-label="Toggle dark mode">
            {darkMode ? "☀ Light" : "◐ Dark"}
          </button>
        </header>

        {/* A saved name stays locked until the user explicitly chooses to edit it. */}
        <div className={`border-b px-4 py-3 ${darkMode ? "border-slate-800 bg-slate-900/70" : "border-slate-100 bg-slate-50/70"} sm:px-7`}>
          <label className={`flex items-center gap-2 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            <span className="shrink-0">Name</span>
            <input
              value={username}
              onChange={handleUsernameChange}
              disabled={!isEditingName}
              placeholder="Choose a display name"
              className={`min-w-0 flex-1 border-b bg-transparent px-1 py-1 outline-none focus:border-indigo-400 disabled:border-transparent disabled:font-semibold disabled:opacity-100 ${darkMode ? "border-slate-700 text-slate-100" : "border-slate-200 text-slate-800"}`}
              maxLength={30}
            />
            {isEditingName ? <button type="button" onClick={saveUsername} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700">Save</button> : <button type="button" onClick={() => setIsEditingName(true)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-white text-slate-600 hover:bg-slate-100"}`}>Edit</button>}
          </label>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className={`w-[76px] shrink-0 overflow-y-auto border-r px-2 py-3 ${darkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/70"}`} aria-label="Conversations">
            <button
              type="button"
              onClick={() => setActiveConversationId("general")}
              title="General chat"
              aria-label="General chat"
              className={`mb-4 flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition ${activeConversationId === "general" ? "bg-indigo-600 text-white" : darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-white"}`}
            >
              <span className="text-lg" aria-hidden="true">#</span>
              <span>General</span>
            </button>
            <p className={`mb-2 text-center text-[9px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Direct</p>
            <div className="space-y-1">
              {chatContacts.map((contact) => (
                <button
                  type="button"
                  key={contact.senderId}
                  onClick={() => openPrivateChat(contact)}
                  title={`Private chat with ${contact.username}`}
                  aria-label={`Private chat with ${contact.username}`}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] transition ${activeConversationId === contact.senderId ? "bg-violet-600 text-white" : darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-white"}`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                    {contact.username?.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="w-full truncate">{contact.username}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className={`flex items-center justify-between border-b px-4 py-3 ${darkMode ? "border-slate-800 text-slate-200" : "border-slate-100 text-slate-700"}`}>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {activeConversationId === "general"
                    ? "General chat"
                    : privateRecipient?.username || "Private chat"}
                </h2>
                {activeConversationId !== "general" && (
                  <p className={`mt-0.5 text-[11px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    Private conversation
                  </p>
                )}
              </div>
              {activeConversationId !== "general" && (
                <button
                  type="button"
                  onClick={() => setActiveConversationId("general")}
                  className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  General
                </button>
              )}
            </div>

            {/* Only the active conversation's messages are rendered here. */}
            <div ref={messagesListRef} onScroll={handleMessagesScroll} className="relative flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:space-y-4 sm:px-7 sm:py-6">
          {messages.length === 0 ? (
            <div className={`flex h-full flex-col items-center justify-center text-center text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${darkMode ? "bg-slate-800" : "bg-indigo-50"}`}>💬</span>
              <p className="font-medium">No messages yet</p><p className="mt-1 text-xs">Send the first message to start the conversation.</p>
            </div>
          ) : (
            messages.map((message) => {
              // Align outgoing message placement with the stable socket ID from the server.
              const isMine = message.senderId === socketRef.current?.id;
              const canReplyPrivately = message.isPrivate && !isMine;
              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                >
                  {!isMine && (
                    <button
                      type="button"
                      onClick={() => replyPrivately(message)}
                      disabled={!canReplyPrivately}
                      title={canReplyPrivately ? `Reply privately to ${message.username}` : message.username}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm transition ${canReplyPrivately ? "hover:scale-105 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-100" : "cursor-default opacity-75"}`}
                    >
                      {message.username?.trim().charAt(0).toUpperCase() || "?"}
                    </button>
                  )}
                  <div
                    className={`max-w-[calc(100%_-_3rem)] sm:max-w-[80%] rounded-2xl px-3 py-2.5 text-sm shadow-sm sm:px-4 sm:py-3 ${isMine ? "rounded-br-sm bg-gradient-to-br from-indigo-600 to-blue-600 text-white" : darkMode ? "rounded-bl-sm border border-slate-700 bg-slate-800 text-slate-100" : "rounded-bl-sm border border-slate-100 bg-slate-50 text-slate-800"}`}
                  >
                    <p
                      className={`mb-1 text-xs font-semibold ${isMine ? "" : darkMode ? "text-white" : "text-black"}`}
                    >
                      {message.username}
                    </p>
                    <p className="mb-1 break-all whitespace-pre-wrap font-medium leading-6">
                      {message.message}
                    </p>
                    {message.isPrivate && (
                      <p className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${isMine ? "bg-white/15 text-blue-100" : darkMode ? "bg-violet-500/15 text-violet-300" : "bg-violet-100 text-violet-700"}`}>
                        {isMine
                          ? "Private message sent"
                          : `Private message from ${message.username}`}
                      </p>
                    )}
                    <p className={`mb-1 text-xs ${isMine ? "text-blue-100" : "text-slate-400"}`}>{formatMessageTime(message.createdAt)}</p>
                    {isMine && message.isRead && (
                      <p className="text-xs text-blue-100">Seen</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {showScrollDown && <button type="button" onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })} className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-indigo-700">↓ Latest messages</button>}

        {/* Show the Socket.IO typing event received from another connected user. */}
        <div className={`h-6 px-4 text-xs italic ${darkMode ? "text-slate-500" : "text-slate-400"} sm:px-7`}>
          {visibleTypingUser && `${visibleTypingUser.username} is typing...`}
        </div>

        {/* Send text through Socket.IO; no local message is added until the server broadcasts it back. */}
        <form
          onSubmit={sendMessage}
          className={`border-t p-3 ${darkMode ? "border-slate-800" : "border-slate-100"} sm:p-5`}
        >
          {privateRecipient && <div className={`mb-2 rounded-xl px-3 py-2 text-xs ${darkMode ? "bg-violet-500/15 text-violet-200" : "bg-violet-50 text-violet-700"}`}><span>Private conversation with <strong>{privateRecipient.username}</strong></span></div>}
          <div className="flex items-end gap-2">
            <textarea
              ref={messageInputRef}
              value={messageText}
              onChange={handleMessageChange}
              onBlur={handleMessageBlur}
              onKeyDown={handleComposerKeyDown}
              placeholder="Type a message..."
              maxLength={500}
              rows={1}
              className={`min-w-0 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:px-4 sm:py-3 ${darkMode ? "border-slate-700 bg-slate-800 text-slate-100 focus:bg-slate-800" : "border-slate-200 bg-slate-50 focus:bg-white"}`}
            />
            <button
              type="submit"
              disabled={!messageText.trim() || connectionStatus !== "Connected"}
              className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-500 sm:px-4 sm:py-3"
              aria-label="Send message"
            >
              ➤
            </button>
          </div>
        </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
