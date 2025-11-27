import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { socket } from "../socket/socket";
import axios from "axios";
import { FiSend, FiImage, FiLogOut, FiSearch, FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import { BsDot } from "react-icons/bs";
import { IoCheckmark, IoCheckmarkDone, IoTime, IoWarning } from "react-icons/io5";

// Lazy load FileUpload component
const FileUpload = lazy(() => import("../components/FileUpload"));

// Configuration
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || "https://your-backend-service.onrender.com",
  APP_NAME: import.meta.env.VITE_APP_NAME || "ChatApp",
  DEBUG: import.meta.env.VITE_DEBUG === "true",
  VERSION: import.meta.env.VITE_VERSION || "1.0.0",
};

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (config.DEBUG) console.error("Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
          <div className="text-center p-8 bg-gray-800 rounded-lg max-w-md">
            <IoWarning className="text-yellow-500 text-4xl mx-auto mb-4" />
            <h2 className="text-xl text-white mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-4">
              {config.DEBUG ? this.state.error?.toString() : "Please try refreshing the page."}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2"
              >
                <FiRefreshCw size={16} />
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading Spinner
const LoadingSpinner = ({ size = "md" }) => {
  const sizes = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" };
  return (
    <div className="flex justify-center items-center p-4">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizes[size]}`}></div>
    </div>
  );
};

// Message Component
const MessageItem = React.memo(({ msg, currentUser }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Invalid date";
    const now = new Date();
    if (now.toDateString() === date.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "sending": return <IoTime className="text-gray-400" size={14} />;
      case "delivered": return <IoCheckmarkDone className="text-blue-300" size={14} />;
      case "failed": return <FiAlertCircle className="text-red-400" size={14} />;
      default: return <IoCheckmark className="text-gray-400" size={14} />;
    }
  };

  const handleImageError = (e) => {
    e.target.style.display = "none";
    e.target.nextSibling.style.display = "block";
  };

  return (
    <div className={`flex flex-col ${msg.sender === currentUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-xl p-3 rounded-2xl ${msg.sender === currentUser ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-200"}`}>
        {msg.fileUrl ? (
          <div className="relative">
            <img src={msg.fileUrl} alt="Uploaded" className="rounded max-h-80 object-cover" onError={handleImageError} />
            <div className="hidden text-sm text-gray-500 p-2 bg-gray-800 rounded">
              File: {msg.fileUrl.split("/").pop()}
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
        <span>{msg.sender}</span>
        <span>•</span>
        <span>{formatTime(msg.timestamp)}</span>
        {msg.sender === currentUser && <span className="ml-1">{getStatusIcon(msg.status)}</span>}
      </div>
    </div>
  );
});

MessageItem.displayName = "MessageItem";

function Chat({ user, onLogout }) {
  if (!user) return null;

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [rooms] = useState(["general", "random", "tech", "design"]);
  const [currentRoom, setCurrentRoom] = useState("general");
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [file, setFile] = useState(null);
  const [unreadCount, setUnreadCount] = useState({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("connected");

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    import("../assets/notify.mp3").then(module => {
      audioRef.current = new Audio(module.default);
    }).catch(err => config.DEBUG && console.warn("Failed to load sound", err));
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  // Socket event listeners
  useEffect(() => {
    const onConnect = () => setConnectionStatus("connected");
    const onDisconnect = () => setConnectionStatus("disconnected");
    const onReceiveMessage = (msg) => {
      if (msg.room !== currentRoom) {
        setUnreadCount(prev => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
      } else {
        setMessages(prev => [...prev, msg]);
        playSound();
        scrollToBottom();
      }
    };
    const onUserTyping = (data) => {
      if (data.username !== user.username && data.room === currentRoom) {
        setTypingUsers(prev => new Set(prev).add(data.username));
      }
    };
    const onUserStopTyping = (data) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.username);
        return newSet;
      });
    };
    const onUserList = (list) => setUsers(list);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("receive_message", onReceiveMessage);
    socket.on("user_typing", onUserTyping);
    socket.on("user_stop_typing", onUserStopTyping);
    socket.on("userList", onUserList);

    socket.emit("userConnected", user.username);
    socket.emit("join_room", { room: currentRoom, username: user.username });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("receive_message", onReceiveMessage);
      socket.off("user_typing", onUserTyping);
      socket.off("user_stop_typing", onUserStopTyping);
      socket.off("userList", onUserList);
    };
  }, [user.username, currentRoom, playSound, scrollToBottom]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() && !file) return;

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const msgData = {
      id: localId,
      room: currentRoom,
      sender: user.username,
      text: message.trim(),
      fileUrl: null,
      timestamp: new Date().toISOString(),
      status: "sending",
    };

    try {
      // File upload
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await axios.post(`${config.API_BASE_URL}/api/upload`, fd);
        msgData.fileUrl = res.data.url;
        setFile(null);
      }

      // Add locally
      setMessages(prev => [...prev, msgData]);
      setMessage("");
      scrollToBottom();

      // Emit to socket
      socket.emit("send_message", msgData);

      // Mark as delivered
      setMessages(prev => prev.map(m => m.id === localId ? { ...m, status: "delivered" } : m));

    } catch (err) {
      console.error("Send message error:", err);
      setMessages(prev => prev.map(m => m.id === localId ? { ...m, status: "failed" } : m));
      setError(err.message || "An unexpected error occurred");
    }
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q) || m.sender?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const onlineUsersCount = useMemo(() => users.length, [users]);

  const handleRoomSwitch = useCallback((room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room);
    setMessages([]);
    setHasMoreOlder(true);
    setTypingUsers(new Set());
    socket.emit("join_room", { room, username: user.username });
  }, [currentRoom, user.username]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row w-full h-screen bg-gray-900 text-white">
        {/* Sidebar */}
        <aside className="w-full md:w-1/4 bg-gray-800 p-4 border-r border-gray-700 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">💬 {config.APP_NAME}</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connectionStatus === "connected" ? "bg-green-500" : "bg-yellow-500"}`}></div>
              {config.DEBUG && <span className="text-xs text-gray-400">v{config.VERSION}</span>}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Rooms */}
          <div className="flex flex-col gap-2">
            {rooms.map(r => (
              <button
                key={r}
                onClick={() => handleRoomSwitch(r)}
                className={`text-left px-3 py-2 rounded-lg transition-colors ${
                  currentRoom === r ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>#{r}</span>
                  {unreadCount[r] > 0 && <span className="text-xs bg-red-600 px-2 py-1 rounded-full min-w-6 text-center">{unreadCount[r]}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Online Users */}
          <div className="flex-1 overflow-hidden">
            <h3 className="text-lg font-semibold mb-2">Online Users ({onlineUsersCount})</h3>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {users.map(u => (
                <div key={u} className="flex items-center gap-2">
                  <BsDot className="text-green-500" />
                  <div className="text-sm truncate">{u}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Logout */}
          <button onClick={onLogout} className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 p-2 rounded-lg">
            <FiLogOut />
            Logout
          </button>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {filteredMessages.map(msg => <MessageItem key={msg.id} msg={msg} currentUser={user.username} />)}
            {typingUsers.size > 0 && <div className="text-sm text-gray-400 italic">{Array.from(typingUsers).join(", ")} {typingUsers.size === 1 ? "is" : "are"} typing...</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 bg-gray-800 border-t border-gray-700">
            <Suspense fallback={<div className="w-10 h-10 bg-gray-700 rounded-lg animate-pulse"></div>}>
              <FileUpload file={file} setFile={setFile} />
            </Suspense>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2">
              <FiSend /> Send
            </button>
          </form>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default React.memo(Chat);
