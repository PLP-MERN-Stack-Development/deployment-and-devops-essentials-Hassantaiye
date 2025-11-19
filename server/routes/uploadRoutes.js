import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Configure multer for file storage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // store in /uploads folder
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// 📤 Upload endpoint
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

  const fileUrl = `/uploads/${req.file.filename}`;
  res.status(200).json({
    success: true,
    fileUrl,
    message: "File uploaded successfully",
  });
});

export default router;
