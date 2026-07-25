const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/loginRateLimiter');

// ─── Auth-Specific Network Limiter (Layer 1) ──────────────────────────────────
// Protects against volumetric endpoint flooding and bots
const authNetworkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // relaxed from 10 to 100
  message: {
    message: 'Too many requests from this IP. Please wait 15 minutes and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
router.post('/register', authNetworkLimiter, register);
// Layer 1: authNetworkLimiter (flooding protection)
// Layer 2: loginRateLimiter (progressive auth failure tracking)
router.post('/login', authNetworkLimiter, loginRateLimiter, login);
router.get('/me', protect, getMe);

module.exports = router;
