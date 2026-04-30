const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const validate = require('../middleware/validate');

// ─── Token Generator ─────────────────────────────────────────────────
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// ─── Validation Rules ─────────────────────────────────────────────────
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid Indian phone number required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('bloodGroup').notEmpty().withMessage('Blood group is required'),
  body('district').notEmpty().withMessage('District is required'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── POST /api/auth/register ──────────────────────────────────────────
const register = [
  ...registerValidation,
  validate,
  async (req, res) => {
    try {
      const { name, email, phone, password, bloodGroup, district, lastDonationDate } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const user = await User.create({
        name,
        email,
        phone,
        passwordHash: password, // pre-save hook will hash it
        bloodGroup,
        district,
        lastDonationDate: lastDonationDate || null,
      });

      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: user.toSafeObject(),
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  },
];

// ─── POST /api/auth/login ─────────────────────────────────────────────
const login = [
  ...loginValidation,
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const token = generateToken(user._id);

      res.json({
        token,
        user: user.toSafeObject(),
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  },
];

// ─── GET /api/auth/me ─────────────────────────────────────────────────
const getMe = async (req, res) => {
  res.json({ user: req.user.toSafeObject ? req.user.toSafeObject() : req.user });
};

module.exports = { register, login, getMe };
