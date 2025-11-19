import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import morgan from "morgan";

// Load env vars
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes and config
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import socketHandler from "./socket/index.js";

// Connect to MongoDB
connectDB();

const app = express();

// Trust proxy for Render
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:", "https:"],
    },
  },
}));

// Compression
app.use(compression());

// Rate limiting - more generous for Render
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS - configure for your frontend URL
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'https://your-frontend-app.onrender.com' // Your frontend Render URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsing
app.use(express.json({ limit: process.env.MAX_JSON_SIZE || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_URL_ENCODED_SIZE || '10mb' }));

// Data sanitization
app.use(mongoSanitize());

// Logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Ensure uploads directory exists
import fs from 'fs';
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check endpoint for Render
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "Chat Backend API",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Chat Backend API is running successfully",
    environment: process.env.NODE_ENV,
    version: "1.0.0",
    documentation: "https://github.com/your-repo/docs",
    timestamp: new Date().toISOString()
  });
});

// Create HTTP server
const server = http.createServer(app);

// Socket.IO with production settings
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  }
});

// Initialize socket handler
socketHandler(io);

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  if (error.code === 11000) {
    return res.status(400).json({ message: 'Duplicate field value entered' });
  }
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(val => val.message);
    return res.status(400).json({ message: 'Validation error', errors: messages });
  }
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token' });
  }
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired' });
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl 
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Server running in ${process.env.NODE_ENV || 'development'} mode
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 Process ID: ${process.pid}
🕒 Started at: ${new Date().toISOString()}
  `);
});

export { app, server, io };