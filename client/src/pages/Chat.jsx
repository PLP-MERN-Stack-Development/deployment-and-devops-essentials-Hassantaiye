import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { socket } from "../socket/socket";
import axios from "axios";
import { FiSend, FiImage, FiLogOut, FiSearch, FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import { BsDot } from "react-icons/bs";
import { IoCheckmark, IoCheckmarkDone, IoTime, IoWarning } from "react-icons/io5";

// Lazy load heavy components
const FileUpload = lazy(() => import("../components/FileUpload"));

// Environment configuration
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'https://your-backend-service.onrender.com',
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || 'https://your-backend-service.onrender.com',
  APP_NAME: import.meta.env.VITE_APP_NAME || 'ChatApp',
  DEBUG: import.meta.env.VITE_DEBUG === 'true',
  VERSION: import.meta.env.VITE_VERSION || '1.0.0',
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
    if (config.DEBUG) console.error("Error caught by boundary:", error, errorInfo);
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
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading spinner
const LoadingSpinner = ({ size = 'md' }) => {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return <div className={`flex justify-center items-center p-4`}>
    <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizes[size]}`}></div>
  </div>;
};

// Message item component
const MessageItem = React.memo(({ msg, currentUser }) => {
  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return isNaN(date) ? "Invalid date" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "sending": return <IoTime className="text-gray-400" size={14} />;
      case "delivered": return <IoCheckmarkDone className="text-blue-300" size={14} />;
      case "failed": return <FiAlertCircle className="text-red-400" size={14} />;
      default: return <IoCheckmark className="text-gray-400" size={14} />;
    }
  };

  return (
    <div className={`flex flex-col ${msg.sender === currentUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-xl p-3 rounded-2xl ${msg.sender === currentUser ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-200"}`}>
        {msg.fileUrl ? <img src={msg.fileUrl} alt="file" className="rounded max-h-80 object-cover" /> : msg.text}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
        <span>{msg.sender}</span> • <span>{formatMessageTime(msg.timestamp)}</span>
        {msg.sender === currentUser && <span className="ml-1">{getStatusIcon(msg.status)}</span>}
      </div>
    </div>
  );
});
MessageItem.displayName = 'MessageItem';

// Chat Component
function Chat({ user, onLogout }) {
  if (!user) return null;

  const [message, setMessage] = useState("");
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [currentRoom, setCurrentRoom] = useState("general");
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [file, setFile] = useState(null);
  const [unreadCount, setUnreadCount] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connected");

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const messages = messagesByRoom[currentRoom] || [];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const pushLocalMessage = useCallback((msg) => {
    setMessagesByRoom(prev => ({
      ...prev,
      [currentRoom]: [...(prev[currentRoom] || []), msg]
    }));
  }, [currentRoom]);

  const handleRoomSwitch = useCallback((room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room);
    setHasMoreOlder(true);
    setTypingUsers(new Set());
    setError(null);
    socket.emit("join_room", { room, username: user.username });
  }, [currentRoom, user.username]);

  useEffect(() => {
    if (!user) return;

    const onConnect = () => setConnectionStatus('connected');
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onReceiveMessage = (msg) => {
      setMessagesByRoom(prev => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg]
      }));
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
  }, [user, currentRoom]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!message.trim() && !file) || loading) return;
    setLoading(true);
    setError(null);

    try {
      let fileUrl = null;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await axios.post(`${config.API_BASE_URL}/api/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        fileUrl = res.data.url;
        setFile(null);
      }

      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
      const msgData = { id: localId, room: currentRoom, sender: user.username, text: message.trim(), fileUrl, timestamp: new Date().toISOString(), status: "sending" };
      
      pushLocalMessage(msgData);
      setMessage("");
      scrollToBottom();

      socket.emit("send_message", msgData, (ack) => {
        setMessagesByRoom(prev => ({
          ...prev,
          [currentRoom]: prev[currentRoom].map(m => m.id === localId ? { ...m, status: ack?.success ? "delivered" : "failed", id: ack?.serverId || m.id } : m)
        }));
      });
    } catch (err) {
      setError("Failed to send message.");
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    return messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()) || m.sender?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [messages, searchQuery]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row w-full h-screen bg-gray-900 text-white">
        {/* Sidebar */}
        <aside className="w-full md:w-1/4 bg-gray-800 p-4 border-r border-gray-700 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">💬 {config.APP_NAME}</h2>
            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
          </div>
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-gray-400" />
            <input type="text" placeholder="Search messages..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-2">
            {["general","random","tech","design"].map(r => (
              <button key={r} onClick={() => handleRoomSwitch(r)} className={`text-left px-3 py-2 rounded-lg transition-colors ${currentRoom === r ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <span>#{r}</span>
                  {unreadCount[r] > 0 && <span className="text-xs bg-red-600 px-2 py-1 rounded-full">{unreadCount[r]}</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            <h3 className="text-lg font-semibold mb-2">Online Users ({users.length})</h3>
            <div className="max-h-48 overflow-y-auto space-y-2">{users.map(u => <div key={u} className="flex items-center gap-2"><BsDot className="text-green-500"/>{u}</div>)}</div>
          </div>
          <button onClick={onLogout} className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 p-2 rounded-lg transition-colors">
            <FiLogOut /> Logout
          </button>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col">
          {error && <div className="bg-red-600 text-white p-3 flex items-center justify-between">{error}</div>}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {filteredMessages.map(msg => <MessageItem key={msg.id} msg={msg} currentUser={user.username} />)}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 bg-gray-800 border-t border-gray-700">
            <Suspense fallback={<div className="w-10 h-10 bg-gray-700 rounded-lg animate-pulse"></div>}>
              <FileUpload file={file} setFile={setFile} validateFile={() => true} />
            </Suspense>
            <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Type a message..." className="flex-1 px-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2">
              <FiSend /> <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default React.memo(Chat);
