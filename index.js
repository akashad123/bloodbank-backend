require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./src/config/db');

// Routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const requestRoutes = require('./src/routes/requests');
const adminRoutes = require('./src/routes/admin');
const chatbotRoutes = require('./src/routes/chatbot');
const notificationRoutes = require('./src/routes/notifications');
const hospitalRoutes = require('./src/routes/hospitals');
const certificateRoutes = require('./src/routes/certificates');

// ─── App Init ─────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ✅ DEFINE FIRST (IMPORTANT)
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173'
];

// ─── Socket.io ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
});

// Make io accessible to controllers
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// ─── Connect Database ─────────────────────────────────────────────────
connectDB();

// ─── Middlewares ──────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://bloodbank-frontend-eugr.onrender.com"
  ],
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 10000,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─── Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/certificates', certificateRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// ─── 404 & Error Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

// ─── Start Server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 BloodBank Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io listening on port ${PORT}`);
  console.log(`🏥 DYFI Mokeri East MC — Ready and Online!\n`);
});