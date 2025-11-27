import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { socket } from "../socket/socket";
import axios from "axios";
import { FiSend, FiImage, FiLogOut, FiSearch, FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import { BsDot } from "react-icons/bs";
import { IoCheckmark, IoCheckmarkDone, IoTime, IoWarning } from "react-icons/io5";

// Lazy load heavy components
const FileUpload = lazy(() => import("../components/FileUpload"));

// Config
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || "https://your-backend-service.onrender.com",
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || "https://your-backend-service.onrender.com",
  APP_NAME: import.meta.env.VITE_APP_NAME || "ChatApp",
  DEBUG: import.meta.env.VITE_DEBUG === "true",
  VERSION: import.meta.env.VITE_VERSION || "1.0.0",
};

// ErrorBoundary for production error handling
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
    // Send to logging service if needed
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
                <FiRefreshCw size={16} /> Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
              >
                Try Again
              </button>
            </div>
            {config.DEBUG && this.state.errorInfo && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-gray-400">Error Details</summary>
                <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
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
  return <div className="flex justify-center items-center p-4"><div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizes[size]}`}></div></div>;
};

// API Error Handler
const handleApiError = (error, context) => {
  if (config.DEBUG) console.error(`API Error in ${context}:`, error);
  if (error.response) return error.response.data?.message || `Error: ${error.response.status}`;
  if (error.request) return "Network error: Unable to reach the server.";
  return "An unexpected error occurred.";
};

// Memoized Message Component
const MessageItem = React.memo(({ msg, currentUser }) => {
  const formatTime = (ts) => {
    const now = new Date();
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "Invalid date";
    return now.toDateString() === date.toDateString()
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "sending": return <IoTime className="text-gray-400" size={14} />;
      case "delivered": return <IoCheckmarkDone className="text-blue-300" size={14} />;
      case "failed": return <FiAlertCircle className="text-red-400" size={14} />;
      default: return <IoCheckmark className="text-gray-400" size={14} />;
    }
  };

  const handleImageError = (e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "block"; };

  return (
    <div className={`flex flex-col ${msg.sender === currentUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-xl p-3 rounded-2xl ${msg.sender === currentUser ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-200"}`}>
        {msg.fileUrl ? (
          <div className="relative">
            <img src={msg.fileUrl} alt="file" className="rounded max-h-80 object-cover" loading="lazy" onError={handleImageError} />
            <div className="hidden text-sm text-gray-500 p-2 bg-gray-800 rounded">File: {msg.fileUrl.split("/").pop()}</div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
        <span>{msg.sender}</span> • <span>{formatTime(msg.timestamp)}</span>
        {msg.sender === currentUser && <span className="ml-1">{getStatusIcon(msg.status)}</span>}
      </div>
    </div>
  );
});
MessageItem.displayName = "MessageItem";

// Chat Component
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

  // Load notification sound
  useEffect(() => {
    import("../assets/notify.mp3").then(module => { audioRef.current = new Audio(module.default); }).catch(console.warn);
  }, []);

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  const playSound = useCallback(() => { audioRef.current?.play().catch(() => {}); }, []);

  const pushLocalMessage = useCallback((msg) => { setMessages(prev => [...prev, msg]); }, []);

  const validateFile = useCallback((file) => {
    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "application/pdf", "image/webp"];
    if (file.size > maxSize) throw new Error("File size too large");
    if (!allowedTypes.includes(file.type)) throw new Error("Invalid file type");
    return true;
  }, []);

  const apiCallWithRetry = async (apiCall, retries = 3) => {
    let lastError;
    for (let i = 1; i <= retries; i++) {
      try { return await apiCall(); } 
      catch (err) { lastError = err; await new Promise(r => setTimeout(r, 500 * i)); }
    }
    throw lastError;
  };

  // Socket setup
  useEffect(() => {
    const onConnect = () => setConnectionStatus("connected");
    const onDisconnect = () => setConnectionStatus("disconnected");
    const onError = () => setConnectionStatus("error");
    const onReceiveMessage = (msg) => {
      if (msg.room !== currentRoom) setUnreadCount(prev => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
      else { setMessages(prev => [...prev, msg]); playSound(); scrollToBottom(); }
    };
    const onUserTyping = (data) => { if (data.username !== user.username && data.room === currentRoom) setTypingUsers(prev => new Set(prev).add(data.username)); };
    const onUserStopTyping = (data) => setTypingUsers(prev => { const s = new Set(prev); s.delete(data.username); return s; });
    const onUserList = (list) => setUsers(list);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.on("receive_message", onReceiveMessage);
    socket.on("user_typing", onUserTyping);
    socket.on("user_stop_typing", onUserStopTyping);
    socket.on("userList", onUserList);

    socket.emit("userConnected", user.username);
    socket.emit("join_room", { room: currentRoom, username: user.username });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.off("receive_message", onReceiveMessage);
      socket.off("user_typing", onUserTyping);
      socket.off("user_stop_typing", onUserStopTyping);
      socket.off("userList", onUserList);
    };
  }, [user, currentRoom, playSound, scrollToBottom]);

  // Send message
  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!message.trim() && !file) || loading) return;
    setLoading(true); setError(null);

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      let fileUrl = null;
      if (file) { validateFile(file); const fd = new FormData(); fd.append("file", file); const res = await apiCallWithRetry(() => axios.post(`${config.API_BASE_URL}/api/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })); fileUrl = res.data.url; setFile(null); }
      const msgData = { id: localId, room: currentRoom, sender: user.username, text: message.trim(), fileUrl, timestamp: new Date().toISOString(), status: "sending" };
      pushLocalMessage(msgData); setMessage(""); scrollToBottom();

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit("user_stop_typing", { room: currentRoom, username: user.username });

      const ack = await Promise.race([
        new Promise((resolve, reject) => socket.emit("send_message", msgData, (ack) => ack?.success ? resolve(ack) : reject(new Error(ack?.error || "Failed")))),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Send timeout")), 10000))
      ]);

      setMessages(prev => prev.map(m => m.id === localId ? { ...m, id: ack.serverId || m.id, status: "delivered" } : m));

    } catch (err) {
      setError(handleApiError(err, "sendMessage"));
      setMessages(prev => prev.map(m => m.id === localId ? { ...m, status: "failed" } : m));
    } finally { setLoading(false); }
  };

  // Load older messages
  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMoreOlder) return;
    setLoadingOlder(true); setError(null);
    try {
      const before = messages.length ? new Date(messages[0].timestamp).toISOString() : new Date().toISOString();
      const res = await apiCallWithRetry(() => axios.get(`${config.API_BASE_URL}/api/messages/${encodeURIComponent(currentRoom)}?limit=20&before=${before}`));
      if (!res.data.messages.length) setHasMoreOlder(false);
      else setMessages(prev => [...res.data.messages, ...prev]);
    } catch (err) { setError(handleApiError(err, "loadOlderMessages")); }
    finally { setLoadingOlder(false); }
  };

  // Typing indicator
  useEffect(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (message.trim()) {
      socket.emit("user_typing", { room: currentRoom, username: user.username });
      typingTimeoutRef.current = setTimeout(() => socket.emit("user_stop_typing", { room: currentRoom, username: user.username }), 1000);
    } else socket.emit("user_stop_typing", { room: currentRoom, username: user.username });
    return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [message, currentRoom, user.username]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q) || m.sender?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const onlineUsersCount = useMemo(() => users.length, [users]);

  const handleRoomSwitch = useCallback((room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room); setMessages([]); setHasMoreOlder(true); setTypingUsers(new Set());
    socket.emit("join_room", { room, username: user.username });
  }, [currentRoom, user.username]);

  const getConnectionStatusColor = () => {
    switch(connectionStatus){ case 'connected': return 'bg-green-500'; case 'disconnected': return 'bg-yellow-500'; case 'error': return 'bg-red-500'; default: return 'bg-gray-500'; }
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row w-full h-screen bg-gray-900 text-white">
        {/* Sidebar */}
        <aside className="w-full md:w-1/4 bg-gray-800 p-4 border-r border-gray-700 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">💬 {config.APP_NAME}</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`}></div>
              {config.DEBUG && <span className="text-xs text-gray-400">v{config.VERSION}</span>}
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-gray-400" />
            <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search messages..." className="w-full pl-10 pr-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {/* Rooms List */}
          <div className="flex flex-col gap-2">
            {rooms.map(r => (
              <button key={r} onClick={() => handleRoomSwitch(r)} className={`text-left px-3 py-2 rounded-lg transition-colors ${currentRoom===r?"bg-blue-600 text-white":"bg-gray-700 hover:bg-gray-600 text-gray-200"}`} aria-current={currentRoom===r?"true":"false"}>
                <div className="flex items-center justify-between">
                  <span>#{r}</span>
                  {unreadCount[r]>0 && <span className="text-xs bg-red-600 px-2 py-1 rounded-full min-w-6 text-center" aria-label={`${unreadCount[r]} unread messages`}>{unreadCount[r]}</span>}
                </div>
              </button>
            ))}
          </div>
          {/* Online Users */}
          <div className="flex-1 overflow-hidden">
            <h3 className="text-lg font-semibold mb-2">Online Users ({onlineUsersCount})</h3>
            <div className="max-h-48 overflow-y-auto space-y-2">{users.map(u=><div key={u} className="flex items-center gap-2"><BsDot className="text-green-500" /><div className="text-sm truncate">{u}</div></div>)}</div>
          </div>
          <button onClick={onLogout} className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 p-2 rounded-lg transition-colors"><FiLogOut />Logout</button>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col">
          {connectionStatus!=="connected" && <div className="bg-yellow-600 text-white p-2 text-center">Connection lost. Reconnecting...</div>}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2" onScroll={e=>{if(e.target.scrollTop===0) loadOlderMessages();}}>
            {loadingOlder && <LoadingSpinner size="sm" />}
            {filteredMessages.map(m => <MessageItem key={m.id} msg={m} currentUser={user.username} />)}
            <div ref={messagesEndRef}></div>
          </div>
          {/* Typing Indicator */}
          {typingUsers.size > 0 && <div className="px-4 py-1 text-sm text-gray-400">{[...typingUsers].join(", ")} typing...</div>}
          {/* Input */}
          <form onSubmit={sendMessage} className="flex items-center p-4 border-t border-gray-700 gap-2">
            <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
              <FileUpload onFileSelect={setFile} />
            </Suspense>
            <input type="text" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Type a message..." className="flex-1 bg-gray-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" disabled={loading} className={`p-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center ${loading?"opacity-50 cursor-not-allowed":""}`}><FiSend /></button>
          </form>
          {error && <div className="bg-red-600 text-white text-sm px-4 py-2">{error}</div>}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default Chat;
