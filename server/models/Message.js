// backend/models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      trim: true,
      default: "",
    },
    room: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String, // e.g. image, audio, video, or document URL
      default: null,
    },
    delivered: {
      type: Boolean,
      default: true, // Set to true when acknowledged by server
    },
    readBy: {
      type: [String], // usernames of users who have read the message
      default: [],
    },
  },
  {
    timestamps: { createdAt: "timestamp", updatedAt: false }, // automatically adds timestamp
  }
);

export default mongoose.model("Message", messageSchema);
