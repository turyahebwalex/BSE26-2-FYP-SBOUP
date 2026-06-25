const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const passport = require('passport');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { configurePassport } = require('./config/passport');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const notificationService = require('./services/notification.service');
const logger = require('./utils/logger');
const { handleMulterError } = require('./middleware/upload');
const User = require('./models/User');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const profileRoutes = require('./routes/profile.routes');
const opportunityRoutes = require('./routes/opportunity.routes');
const applicationRoutes = require('./routes/application.routes');
const matchingRoutes = require('./routes/matching.routes');
const learningRoutes = require('./routes/learning.routes');
const messageRoutes = require('./routes/message.routes');
const reportRoutes = require('./routes/report.routes');
const adminRoutes = require('./routes/admin.routes');
const cvRoutes = require('./routes/cv.routes');
const chatbotRoutes = require('./routes/chatbot.routes');
const notificationRoutes = require('./routes/notification.routes');
const skillRoutes = require('./routes/skill.routes');
const companyRoutes = require('./routes/company.routes');

// Load environment variables
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ─── Create upload directories (inside /app/uploads) ────────────────────────
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const uploadDirs = ['avatars', 'messages', 'temp', 'documents', 'applications'];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(uploadsRoot, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map((s) => s.trim()),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Core Express Middleware ──────────────────────────────────────────────────

// Helmet: allow cross-origin resource loading so mobile clients can fetch
// uploaded images/documents from /uploads/*
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    origin: true,
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
  })
);

app.use(compression());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(mongoSanitize());
app.use(hpp());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ─── Static file serving for uploads (corrected to use /app/uploads) ─────────
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadsRoot, {
    index: false,
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.pdf':  'application/pdf',
        '.doc':  'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif':  'image/gif',
        '.webp': 'image/webp',
      };
      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }
      const inlineTypes = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      res.setHeader(
        'Content-Disposition',
        inlineTypes.includes(ext) ? 'inline' : 'attachment'
      );
    },
  })
);

const srcUploadsRoot = path.join(__dirname, 'uploads');
if (fs.existsSync(srcUploadsRoot)) {
  app.use('/uploads', express.static(srcUploadsRoot));
  console.log(`Also serving static files from: ${srcUploadsRoot}`);
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use('/api/', (req, res, next) => {
  if (req.headers.upgrade === 'websocket') return next();
  return apiLimiter(req, res, next);
});

// ─── Passport ─────────────────────────────────────────────────────────────────
configurePassport();
// Mount Passport's Express middleware. Required by passport >= 0.6 for the
// web Google OAuth redirect flow (GET /api/auth/google); without it
// passport.authenticate() throws "passport.initialize() middleware not in use".
app.use(passport.initialize());

app.set('io', io);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/profiles',      profileRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/applications',  applicationRoutes);
app.use('/api/matching',      matchingRoutes);
app.use('/api/learning',      learningRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/cv',            cvRoutes);
app.use('/api/chatbot',       chatbotRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/skills',        skillRoutes);
app.use('/api/companies',     companyRoutes);
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SBOUP Application Services',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Multer error handler ─────────────────────────────────────────────────────
app.use(handleMulterError);

// ─── Generic error handling ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Socket.IO Auth Middleware ────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user || user.accountStatus !== 'active') {
      return next(new Error('Invalid or inactive user'));
    }

    socket.user   = user;
    socket.userId = user._id.toString();
    next();
  } catch (error) {
    logger.error('Socket auth error:', error.message);
    next(new Error('Authentication failed'));
  }
});

// ─── Socket.IO Connection Handler ────────────────────────────────────────────
io.on('connection', (socket) => {
  const userId = socket.userId;

  logger.info(`User connected: ${userId} (${socket.user.fullName})`);

  socket.join(`user:${userId}`);

  User.findByIdAndUpdate(userId, {
    isOnline: true,
    lastSeenAt: new Date(),
    $addToSet: { socketIds: socket.id },
  }).catch((err) => logger.error('Error updating online status:', err));

  socket.broadcast.emit('user_status_changed', {
    userId,
    isOnline: true,
    lastSeenAt: new Date(),
  });

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
    logger.debug(`User ${userId} joined conversation ${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
    logger.debug(`User ${userId} left conversation ${conversationId}`);
  });

  socket.on('typing', (data) => {
    const { receiverId, isTyping } = data;
    if (receiverId) {
      socket.to(`user:${receiverId}`).emit('typing_status', {
        userId,
        userName: socket.user.fullName,
        isTyping,
        conversationId: data.conversationId,
      });
    }
  });

  socket.on('message_delivered', async (data) => {
    const { messageIds } = data;
    if (messageIds?.length) {
      try {
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { deliveredStatus: true, status: 'delivered' }
        );
      } catch (error) {
        logger.error('Error marking messages as delivered:', error);
      }
    }
  });

  socket.on('message_read', async (data) => {
    const { messageIds, senderId } = data;
    if (messageIds?.length && senderId) {
      try {
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { readStatus: true, status: 'read', readAt: new Date() }
        );

        socket.to(`user:${senderId}`).emit('message_read_receipt', {
          messageIds,
          readerId: userId,
          readAt: new Date(),
        });
      } catch (error) {
        logger.error('Error marking messages as read:', error);
      }
    }
  });

  socket.on('ping', () => socket.emit('pong'));

  socket.on('disconnect', async () => {
    logger.info(`User disconnected: ${userId}`);
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeenAt: new Date(),
        $pull: { socketIds: socket.id },
      });

      io.emit('user_status_changed', {
        userId,
        isOnline: false,
        lastSeenAt: new Date(),
      });
    } catch (error) {
      logger.error('Error updating offline status:', error);
    }
  });
});

// ─── Notification service ─────────────────────────────────────────────────────
const setupSocketService = () => {
  global.io = io;
  notificationService.registerIO(io);
  logger.info('Socket.IO service initialized');
};

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected successfully');

    await connectRedis();
    logger.info('Redis connected successfully');

    setupSocketService();

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`SBOUP Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`API available at http://localhost:${PORT}/api`);
      logger.info(`Uploads served from ${uploadsRoot} at http://localhost:${PORT}/uploads`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM: closing server');
  server.close(() => { logger.info('Server closed'); process.exit(0); });
});

process.on('SIGINT', () => {
  logger.info('SIGINT: closing server');
  server.close(() => { logger.info('Server closed'); process.exit(0); });
});

startServer();

module.exports = { app, server, io };