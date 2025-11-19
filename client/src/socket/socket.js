// socket.js - Socket.io client setup

import { io } from "socket.io-client";
import { useEffect, useState, useCallback } from "react";

// ✅ Backend socket server URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// ✅ Create socket instance (autoConnect = false so you can control login)
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  withCredentials: true,
});

// ✅ React hook for managing socket connection and events
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);

  /**
   * 🔗 Connect user to socket
   * @param {string} username
   */
  const connect = useCallback((username) => {
    if (!socket.connected) socket.connect();
    if (username) socket.emit("userConnected", username);
  }, []);

  /**
   * 🔌 Disconnect user from socket
   */
  const disconnect = useCallback(() => {
    socket.disconnect();
  }, []);

  /**
   * 💬 Send global message
   */
  const sendMessage = useCallback((sender, text) => {
    socket.emit("sendMessage", { sender, text });
  }, []);

  /**
   * 🔒 Send private message
   */
  const sendPrivateMessage = useCallback((to, sender, text) => {
    socket.emit("private_message", { to, sender, text });
  }, []);

  /**
   * 🏠 Join specific chat room
   */
  const joinRoom = useCallback((roomId) => {
    socket.emit("join_room", roomId);
  }, []);

  /**
   * ✍️ Notify typing status
   */
  const setTyping = useCallback((isTyping) => {
    socket.emit("typing", isTyping);
  }, []);

  // 📡 Event listeners
  useEffect(() => {
    const onConnect = () => {
      console.log("✅ Connected to Socket.io server");
      setIsConnected(true);
    };

    const onDisconnect = () => {
      console.log("❌ Disconnected from Socket.io server");
      setIsConnected(false);
    };

    const onLoadMessages = (msgs) => {
      setMessages(msgs);
    };

    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    const onPrivateMessage = (message) => {
      setMessages((prev) => [...prev, { ...message, isPrivate: true }]);
    };

    const onSystemMessage = (msg) => {
      setMessages((prev) => [
        ...prev,
        { sender: "System", text: msg.text, system: true },
      ]);
    };

    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    // ✅ Register socket events
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("loadMessages", onLoadMessages);
    socket.on("receiveMessage", onReceiveMessage);
    socket.on("private_message", onPrivateMessage);
    socket.on("systemMessage", onSystemMessage);
    socket.on("userList", onUserList);
    socket.on("typing_users", onTypingUsers);

    // 🧹 Cleanup when component unmounts
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("loadMessages", onLoadMessages);
      socket.off("receiveMessage", onReceiveMessage);
      socket.off("private_message", onPrivateMessage);
      socket.off("systemMessage", onSystemMessage);
      socket.off("userList", onUserList);
      socket.off("typing_users", onTypingUsers);
    };
  }, []);

  return {
    socket,
    isConnected,
    messages,
    users,
    typingUsers,
    lastMessage,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    joinRoom,
    setTyping,
  };
};

export default socket;
