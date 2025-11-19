// backend/socket/index.js
import Message from "../models/Message.js";

export default function socketHandler(io) {
  const users = new Map(); // socket.id → { username, room }
  const usernameToSocket = new Map(); // username → socket.id

  io.on("connection", (socket) => {
    console.log(`🟢 Socket connected: ${socket.id}`);

    // 🧩 User connects
    socket.on("userConnected", (username) => {
      if (!username) return;

      users.set(socket.id, { username, room: null });
      usernameToSocket.set(username, socket.id);

      io.emit("userList", Array.from(users.values()).map((u) => u.username));
      io.emit("userJoined", { username });

      console.log(`✅ ${username} connected`);
    });

    // 🏠 Join room
    socket.on("join_room", ({ room, username }) => {
      const user = users.get(socket.id);
      if (!user) return;

      user.room = room;
      socket.join(room);

      io.to(room).emit("userJoinedRoom", { username, room });
      console.log(`🏠 ${username} joined ${room}`);
    });

    // 💬 Send message (text or image)
    socket.on("send_message", async (data, ack) => {
      try {
        const { room, sender, text, fileUrl } = data;

        if (!room || (!text && !fileUrl)) {
          console.warn("⚠️ Message ignored: missing text or room");
          if (ack) ack({ status: "error", message: "Invalid data" });
          return;
        }

        // Save to DB
        const message = await Message.create({
          sender,
          text,
          room,
          fileUrl: fileUrl || null,
          timestamp: new Date(),
        });

        const msgObj = message.toJSON();

        // Broadcast to users in the room
        io.to(room).emit("receive_message", msgObj);

        // Notify
        io.to(room).emit("notify_message", {
          sender,
          text: text || "📎 Sent a file",
          room,
          timestamp: new Date(),
        });

        // Acknowledge delivery to sender
        if (ack) ack({ status: "delivered", message: msgObj });
      } catch (err) {
        console.error("❌ Error saving message:", err);
        if (ack) ack({ status: "error", message: err.message });
      }
    });

    // 📜 Load previous messages (pagination)
    socket.on("load_messages", async ({ room, page = 1, limit = 20 }) => {
      try {
        const skip = (page - 1) * limit;
        const messages = await Message.find({ room })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        socket.emit("load_messages", messages.reverse());
      } catch (err) {
        console.error("❌ Error loading messages:", err);
      }
    });

    // ✍️ Typing indicator
    socket.on("user_typing", ({ room, username }) => {
      socket.to(room).emit("user_typing", { username });
    });

    socket.on("user_stop_typing", ({ room, username }) => {
      socket.to(room).emit("user_stop_typing", { username });
    });

    // 🔒 Private messaging
    socket.on("private_message", ({ to, sender, text }) => {
      const targetSocket = usernameToSocket.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit("private_message", {
          sender,
          text,
          timestamp: new Date(),
          isPrivate: true,
        });
      }
    });

    // 🔁 Reconnection (recover user state)
    socket.on("reconnect_user", (username) => {
      if (username && usernameToSocket.has(username)) {
        usernameToSocket.set(username, socket.id);
        users.set(socket.id, { username, room: null });
        console.log(`♻️ ${username} reconnected with new socket ID`);
      }
    });

    // ❌ Disconnect
    socket.on("disconnect", () => {
      const user = users.get(socket.id);
      if (user) {
        io.emit("userLeft", { username: user.username });
        usernameToSocket.delete(user.username);
        users.delete(socket.id);
        console.log(`🔴 ${user.username} disconnected`);
      } else {
        console.log(`🔴 Unknown socket ${socket.id} disconnected`);
      }

      io.emit("userList", Array.from(users.values()).map((u) => u.username));
    });
  });
}
