require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./src/config/db');

// ─────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const requestRoutes = require('./src/routes/requests');
const adminRoutes = require('./src/routes/admin');
const chatbotRoutes = require('./src/routes/chatbot');
const notificationRoutes = require('./src/routes/notifications');
const hospitalRoutes = require('./src/routes/hospitals');
const certificateRoutes = require('./src/routes/certificates');
const settingsRoutes = require('./src/routes/settings');

// ─────────────────────────────────────────────────────────────────────
// App Init
// ─────────────────────────────────────────────────────────────────────
const app = express();

// Trust reverse proxy (Render / Heroku / Nginx)
app.set('trust proxy', 1);

const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────
// Production Environment Validation
// ─────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.error(
    'WARNING: FRONTEND_URL environment variable is missing in production.'
  );
}

// ─────────────────────────────────────────────────────────────────────
// CORS Configuration
// ─────────────────────────────────────────────────────────────────────

const dynamicCorsOrigin = (origin, callback) => {
  // Allow requests without an Origin header
  // Examples: Postman, server-to-server requests, health checks
  if (!origin) {
    return callback(null, true);
  }

  // Production frontend URLs
  const allowedProductionOrigins = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL
  ].filter(Boolean);

  // Allow configured production origins
  if (allowedProductionOrigins.includes(origin)) {
    return callback(null, true);
  }

  // Allow localhost during development
  if (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  ) {
    return callback(null, true);
  }

  return callback(new Error('Not allowed by CORS'), false);
};

// ─────────────────────────────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: {
    origin: dynamicCorsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make Socket.IO accessible inside controllers
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
  });

  socket.on('disconnect', () => {
    // Connection closed
  });
});

// ─────────────────────────────────────────────────────────────────────
// Database
// ─────────────────────────────────────────────────────────────────────

connectDB();

// ─────────────────────────────────────────────────────────────────────
// Middlewares
// ─────────────────────────────────────────────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin: dynamicCorsOrigin,
    credentials: true
  })
);

app.use(express.json({ limit: '10kb' }));

app.use(
  express.urlencoded({
    extended: true
  })
);

// ─────────────────────────────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────────────────────────────

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // Production: 200 requests / 15 minutes
  // Development: effectively unrestricted for testing
  max: process.env.NODE_ENV === 'production' ? 200 : 10000,

  message: {
    message: 'Too many requests, please try again later.'
  }
});

app.use('/api/', limiter);

// ─────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);

app.use('/api/requests', requestRoutes);

app.use('/api/admin', adminRoutes);

app.use('/api/chatbot', chatbotRoutes);

app.use('/api/notifications', notificationRoutes);

app.use('/api/hospitals', hospitalRoutes);

app.use('/api/certificates', certificateRoutes);

app.use('/api/settings', settingsRoutes);

// ─────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date()
  });
});

// ─────────────────────────────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found'
  });
});

// ─────────────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

// ─────────────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`BloodBank Server running on http://localhost:${PORT}`);
    console.log(`Socket.io listening on port ${PORT}`);
    console.log('DYFI Mokeri East MC — Ready and Online!');
  }
});