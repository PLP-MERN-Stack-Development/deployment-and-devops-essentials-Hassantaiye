// backend/routes/messageRoutes.js
import express from "express";
import Message from "../models/Message.js";

const router = express.Router();

/**
 * 🧩 GET /api/messages/:room
 * Fetch paginated messages for a specific room
 * Supports query params: ?page=1&limit=20
 */
router.get("/:room", async (req, res) => {
  try {
    const { room } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const skip = (page - 1) * limit;

    // Fetch most recent messages first
    const messages = await Message.find({ room })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalMessages = await Message.countDocuments({ room });

    res.status(200).json({
      success: true,
      room,
      messages: messages.reverse(), // send in chronological order
      pagination: {
        currentPage: page,
        hasMore: totalMessages > skip + messages.length,
        total: totalMessages,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load messages",
    });
  }
});

/**
 * 📨 POST /api/messages
 * Save a new message (used as fallback when socket is not available)
 */
router.post("/", async (req, res) => {
  try {
    const { sender, room, text, fileUrl } = req.body;

    if (!sender || !room) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!text && !fileUrl) {
      return res.status(400).json({ success: false, message: "Empty message" });
    }

    const message = await Message.create({
      sender,
      room,
      text: text || "",
      fileUrl: fileUrl || null,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      message,
      status: "delivered",
    });
  } catch (err) {
    console.error("❌ Error saving message:", err);
    res.status(500).json({
      success: false,
      message: "Failed to save message",
    });
  }
});

export default router;
