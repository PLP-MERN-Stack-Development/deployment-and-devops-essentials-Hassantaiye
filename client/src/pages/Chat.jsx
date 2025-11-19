import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { socket } from "../socket/socket";
import axios from "axios";
import { FiSend, FiImage, FiLogOut, FiSearch, FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import { BsDot } from "react-icons/bs";
import { IoCheckmark, IoCheckmarkDone, IoTime, IoWarning } from "react-icons/io5";

// Lazy load heavy components
const FileUpload = lazy(() => import("../components/FileUpload"));

// Environment configuration with production defaults
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'https://your-backend-service.onrender.com',
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || 'https://your-backend-service.onrender.com',
  APP_NAME: import.meta.env.VITE_APP_NAME || 'ChatApp',
  DEBUG: import.meta.env.VITE_DEBUG === 'true',
  VERSION: import.meta.env.VITE_VERSION || '1.0.0',
};

// Error Boundary Component with production error reporting
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
    
    if (config.DEBUG) {
      console.error('Error caught by boundary:', error, errorInfo);
    }
    
    // In production, you would send this to your error reporting service
    if (config.API_BASE_URL.includes('render.com') || !config.DEBUG) {
      // Example: Send to error reporting service
      this.reportError(error, errorInfo);
    }
  }

  reportError = async (error, errorInfo) => {
    try {
      // You can send errors to your backend for logging
      await fetch(`${config.API_BASE_URL}/api/logs/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error.toString(),
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      // Silent fail for error reporting errors
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
          <div className="text-center p-8 bg-gray-800 rounded-lg max-w-md">
            <IoWarning className="text-yellow-500 text-4xl mx-auto mb-4" />
            <h2 className="text-xl text-white mb-2">Something went wrong</h2>
            <p className="text-gray-400 mb-4">
              {config.DEBUG ? this.state.error?.toString() : 'Please try refreshing the page.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2"
              >
                <FiRefreshCw size={16} />
                Refresh Page
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
                <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading component for Suspense
const LoadingSpinner = ({ size = 'md' }) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };
  
  return (
    <div className="flex justify-center items-center p-4">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizes[size]}`}></div>
    </div>
  );
};

// Enhanced error handling utility
const handleApiError = (error, context) => {
  if (config.DEBUG) {
    console.error(`API Error in ${context}:`, error);
  }
  
  if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
    return 'Unable to connect to server. Please check your internet connection.';
  }
  
  if (error.response) {
    const status = error.response.status;
    switch (status) {
      case 401:
        return 'Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'Requested resource not found.';
      case 429:
        return 'Too many requests. Please wait a moment.';
      case 500:
        return 'Server error. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return error.response.data?.message || `Error: ${status}`;
    }
  } else if (error.request) {
    return 'Network error: Unable to reach the server.';
  } else {
    return 'An unexpected error occurred.';
  }
};

// Memoized Message Component for better performance
const MessageItem = React.memo(({ msg, currentUser }) => {
  const formatMessageTime = (timestamp) => {
    try {
      const now = new Date();
      const messageDate = new Date(timestamp);
      
      if (isNaN(messageDate.getTime())) {
        return 'Invalid date';
      }
      
      if (now.toDateString() === messageDate.toDateString()) {
        return messageDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else {
        return messageDate.toLocaleDateString() + ' ' + messageDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'sending': return <IoTime className="text-gray-400" size={14} />;
      case 'delivered': return <IoCheckmarkDone className="text-blue-300" size={14} />;
      case 'failed': return <FiAlertCircle className="text-red-400" size={14} />;
      default: return <IoCheckmark className="text-gray-400" size={14} />;
    }
  };

  const handleImageError = (e) => {
    e.target.style.display = 'none';
    e.target.nextSibling.style.display = 'block';
  };

  return (
    <div className={`flex flex-col ${msg.sender === currentUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-xl p-3 rounded-2xl ${msg.sender === currentUser ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-200"}`}>
        {msg.fileUrl ? (
          <div className="relative">
            <img 
              src={msg.fileUrl} 
              alt="Uploaded file" 
              className="rounded max-h-80 object-cover"
              loading="lazy"
              onError={handleImageError}
            />
            <div className="hidden text-sm text-gray-500 p-2 bg-gray-800 rounded">
              File: {msg.fileUrl.split('/').pop()}
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
        <span>{msg.sender}</span>
        <span>•</span>
        <span>{formatMessageTime(msg.timestamp)}</span>
        {msg.sender === currentUser && (
          <span className="ml-1">{getStatusIcon(msg.status)}</span>
        )}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

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
  const [connectionStatus, setConnectionStatus] = useState('connected');

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // Lazy load audio with error handling
  useEffect(() => {
    import("../assets/notify.mp3")
      .then(module => {
        audioRef.current = new Audio(module.default);
      })
      .catch(err => {
        if (config.DEBUG) {
          console.warn('Failed to load notification sound:', err);
        }
      });
  }, []);

  // Enhanced utility functions
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const playSound = useCallback(() => { 
    try { 
      if (audioRef.current) {
        audioRef.current.currentTime = 0; 
        audioRef.current.play().catch(() => {}); 
      }
    } catch {} 
  }, []);

  const pushLocalMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Enhanced file validation
  const validateFile = useCallback((file) => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = [
      'image/jpeg', 
      'image/png', 
      'image/gif', 
      'application/pdf',
      'image/webp'
    ];
    
    if (file.size > maxSize) {
      throw new Error(`File size too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
    }
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Allowed: JPEG, PNG, GIF, PDF, WebP');
    }
    
    return true;
  }, []);

  // Enhanced API call with retry logic
  const apiCallWithRetry = async (apiCall, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) break;
        
        if (config.DEBUG) {
          console.warn(`API call failed, retrying... (${attempt}/${maxRetries})`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
        );
      }
    }
    
    throw lastError;
  };

  // Enhanced load older messages with retry
  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMoreOlder) return;
    
    setLoadingOlder(true);
    setError(null);

    try {
      const before = messages.length ? new Date(messages[0].timestamp).toISOString() : new Date().toISOString();
      
      const res = await apiCallWithRetry(() => 
        axios.get(
          `${config.API_BASE_URL}/api/messages/${encodeURIComponent(currentRoom)}?limit=20&before=${before}`,
          { timeout: 10000 }
        )
      );
      
      const older = res.data.messages || [];
      
      if (older.length === 0) {
        setHasMoreOlder(false);
      } else {
        setMessages((prev) => [...older, ...prev]);
      }
    } catch (err) {
      const errorMessage = handleApiError(err, 'loadOlderMessages');
      setError(errorMessage);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Enhanced socket connection management
  useEffect(() => {
    if (!user) return;

    const onConnect = () => {
      setConnectionStatus('connected');
      if (config.DEBUG) {
        console.log('Socket connected');
      }
    };

    const onDisconnect = (reason) => {
      setConnectionStatus('disconnected');
      if (config.DEBUG) {
        console.log('Socket disconnected:', reason);
      }
    };

    const onConnectError = (error) => {
      setConnectionStatus('error');
      if (config.DEBUG) {
        console.error('Socket connection error:', error);
      }
    };

    const onReceiveMessage = (msg) => {
      if (msg.room !== currentRoom) {
        setUnreadCount((prev) => ({ 
          ...prev, 
          [msg.room]: (prev[msg.room] || 0) + 1 
        }));
      } else {
        setMessages((prev) => [...prev, msg]);
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

    // Socket event listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("receive_message", onReceiveMessage);
    socket.on("user_typing", onUserTyping);
    socket.on("user_stop_typing", onUserStopTyping);
    socket.on("userList", onUserList);

    // Emit connection events
    socket.emit("userConnected", user.username);
    socket.emit("join_room", { room: currentRoom, username: user.username });

    return () => {
      // Cleanup event listeners
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("receive_message", onReceiveMessage);
      socket.off("user_typing", onUserTyping);
      socket.off("user_stop_typing", onUserStopTyping);
      socket.off("userList", onUserList);
    };
  }, [user, currentRoom, playSound, scrollToBottom]);

  // Enhanced send message with better error handling
  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!message.trim() && !file) || loading) return;

    setLoading(true);
    setError(null);

    try {
      let fileUrl = null;
      if (file) {
        validateFile(file);
        const formData = new FormData();
        formData.append("file", file);
        
        const res = await apiCallWithRetry(() =>
          axios.post(`${config.API_BASE_URL}/api/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000, // 30 seconds for file uploads
            onUploadProgress: (progressEvent) => {
              // You could add a progress bar here
              if (config.DEBUG) {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                console.log(`Upload Progress: ${percentCompleted}%`);
              }
            }
          })
        );
        fileUrl = res.data.url;
        setFile(null);
      }

      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const msgData = { 
        id: localId, 
        room: currentRoom, 
        sender: user.username, 
        text: message.trim(), 
        fileUrl, 
        timestamp: new Date().toISOString(), 
        status: "sending" 
      };
      
      pushLocalMessage(msgData);
      setMessage("");
      scrollToBottom();

      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socket.emit("user_stop_typing", { room: currentRoom, username: user.username });

      // Send message with timeout
      const sendPromise = new Promise((resolve, reject) => {
        socket.emit("send_message", msgData, (ack) => {
          if (ack?.success) {
            resolve(ack);
          } else {
            reject(new Error(ack?.error || 'Failed to send message'));
          }
        });
      });

      // Add timeout for send confirmation
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Send timeout')), 10000)
      );

      const ack = await Promise.race([sendPromise, timeoutPromise]);
      
      setMessages((prev) => prev.map((m) => 
        m.id === localId ? { ...m, id: ack.serverId || m.id, status: "delivered" } : m
      ));
      
    } catch (err) {
      const errorMessage = handleApiError(err, 'sendMessage');
      setError(errorMessage);
      
      // Mark message as failed
      setMessages((prev) => prev.map((m) => 
        m.id === localId ? { ...m, status: "failed" } : m
      ));
    } finally {
      setLoading(false);
    }
  };

  // Enhanced message loading with retry
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await apiCallWithRetry(() =>
          axios.get(
            `${config.API_BASE_URL}/api/messages/${encodeURIComponent(currentRoom)}?limit=50`,
            { timeout: 15000 }
          )
        );
        
        setMessages(res.data.messages || []);
        scrollToBottom();
        
        // Clear unread count when switching to room
        setUnreadCount(prev => ({ ...prev, [currentRoom]: 0 }));
      } catch (err) {
        const errorMessage = handleApiError(err, 'fetchMessages');
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMessages();
  }, [currentRoom, scrollToBottom]);

  // Enhanced typing indicator
  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (message.trim()) {
      socket.emit("user_typing", { room: currentRoom, username: user.username });
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("user_stop_typing", { room: currentRoom, username: user.username });
      }, 1000);
    } else {
      socket.emit("user_stop_typing", { room: currentRoom, username: user.username });
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, currentRoom, user.username]);

  // Memoized values for performance
  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => 
      m.text?.toLowerCase().includes(q) || 
      m.sender?.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  const onlineUsersCount = useMemo(() => users.length, [users]);

  // Enhanced room switch handler
  const handleRoomSwitch = useCallback((room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room);
    setMessages([]);
    setHasMoreOlder(true);
    setTypingUsers(new Set());
    socket.emit("join_room", { room, username: user.username });
  }, [currentRoom, user.username]);

  // Connection status indicator
  const getConnectionStatusColor = () => {
    switch(connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'disconnected': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
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
              {config.DEBUG && (
                <span className="text-xs text-gray-400">v{config.VERSION}</span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Rooms List */}
          <div className="flex flex-col gap-2">
            {rooms.map((r) => (
              <button
                key={r}
                onClick={() => handleRoomSwitch(r)}
                className={`text-left px-3 py-2 rounded-lg transition-colors ${
                  currentRoom === r 
                    ? "bg-blue-600 text-white" 
                    : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                }`}
                aria-current={currentRoom === r ? "true" : "false"}
              >
                <div className="flex items-center justify-between">
                  <span>#{r}</span>
                  {unreadCount[r] > 0 && (
                    <span 
                      className="text-xs bg-red-600 px-2 py-1 rounded-full min-w-6 text-center"
                      aria-label={`${unreadCount[r]} unread messages`}
                    >
                      {unreadCount[r]}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Online Users */}
          <div className="flex-1 overflow-hidden">
            <h3 className="text-lg font-semibold mb-2">Online Users ({onlineUsersCount})</h3>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {users.map((u) => (
                <div key={u} className="flex items-center gap-2">
                  <BsDot className="text-green-500" />
                  <div className="text-sm truncate">{u}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Logout Button */}
          <button 
            onClick={onLogout} 
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 p-2 rounded-lg transition-colors"
          >
            <FiLogOut />
            Logout
          </button>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col">
          {/* Connection Status Banner */}
          {connectionStatus !== 'connected' && (
            <div className="bg-yellow-600 text-white p-2 text-center text-sm">
              {connectionStatus === 'disconnected' 
                ? 'Connecting...' 
                : 'Connection issues. Some features may be unavailable.'}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-600 text-white p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FiAlertCircle />
                <span>{error}</span>
              </div>
              <button 
                onClick={() => setError(null)} 
                className="text-white hover:text-gray-200 p-1"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {/* Room Header */}
          <div className="bg-gray-800 p-4 border-b border-gray-700">
            <h1 className="text-xl font-bold">#{currentRoom}</h1>
            <p className="text-sm text-gray-400">
              {onlineUsersCount} user{onlineUsersCount !== 1 ? 's' : ''} online
              {connectionStatus !== 'connected' && ' • Reconnecting...'}
            </p>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {/* Load Older Messages */}
            {hasMoreOlder && (
              <div className="flex justify-center">
                <button 
                  onClick={loadOlderMessages} 
                  disabled={loadingOlder}
                  className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {loadingOlder ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Loading...
                    </>
                  ) : (
                    'Load older messages'
                  )}
                </button>
              </div>
            )}

            {/* Loading State */}
            {loading && messages.length === 0 && (
              <div className="flex justify-center items-center h-32">
                <LoadingSpinner size="lg" />
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredMessages.length === 0 && (
              <div className="flex justify-center items-center h-32 text-gray-500">
                No messages yet. Start the conversation!
              </div>
            )}

            {/* Messages */}
            {filteredMessages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} currentUser={user.username} />
            ))}

            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
              <div className="text-sm text-gray-400 italic">
                {Array.from(typingUsers).join(', ')} 
                {typingUsers.size === 1 ? ' is' : ' are'} typing...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 bg-gray-800 border-t border-gray-700">
            <Suspense fallback={<div className="w-10 h-10 bg-gray-700 rounded-lg animate-pulse"></div>}>
              <FileUpload file={file} setFile={setFile} validateFile={validateFile} />
            </Suspense>
            <input
              type="text"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
              }}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={loading || connectionStatus !== 'connected'}
              maxLength={1000}
            />
            <button 
              type="submit" 
              disabled={loading || connectionStatus !== 'connected' || (!message.trim() && !file)}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors flex items-center gap-2 min-w-20 justify-center"
            >
              {loading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <FiSend /> 
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </button>
          </form>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default React.memo(Chat);