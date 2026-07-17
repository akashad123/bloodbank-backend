const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const validate = require('../middleware/validate');

// ─── Token Generator ──────────────────────────────────────────────────────────
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// ─── Helper: Generate a strong random internal password ──────────────────────
// Users never see this. It is hashed before storage via the pre-save hook.
const generateInternalPassword = () => crypto.randomBytes(32).toString('hex');

// ─── Validation Rules ─────────────────────────────────────────────────────────

// Donor registration — only name + phone required
const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be under 100 characters'),

  body('phone')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number'),

  // Optional fields — validate only if present
  body('bloodGroup')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Invalid blood group'),

  body('district')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('District cannot be empty if provided'),
];

// Flexible login — accepts phone (donor) OR email+password (admin)
const loginValidation = [
  body('phone')
    .optional()
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number'),

  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email required')
    .normalizeEmail(),

  body('password')
    .optional()
    .notEmpty()
    .withMessage('Password is required for email login'),
];

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Donor self-registration: name + phone required, bloodGroup + district optional.
// A strong random password is auto-generated and hashed — never exposed.
const register = [
  ...registerValidation,
  validate,
  async (req, res) => {
    try {
      const { name, phone, bloodGroup, district, lastDonationDate, donorEligibility } = req.body;

      // Prevent duplicate phone numbers
      const existingUser = await User.findOne({ phone: phone.trim() });
      if (existingUser) {
        return res.status(400).json({
          message: 'This phone number is already registered. Please sign in.',
        });
      }

      // Auto-generate a strong random password — user never sees this
      const internalPassword = generateInternalPassword();

      const userRole = 'user';

      const user = await User.create({
        name: name.trim(),
        phone: phone.trim(),
        passwordHash: internalPassword, // pre-save hook hashes this
        bloodGroup: bloodGroup || null,
        district: district || null,
        lastDonationDate: lastDonationDate || null,
        donorEligibility: donorEligibility || null,
        role: userRole,
      });

      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: user.toSafeObject(),
      });
    } catch (error) {
      console.error('Register error:', error);

      // Handle MongoDB duplicate key error (race condition safety)
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        const msg =
          field === 'phone'
            ? 'This phone number is already registered. Please sign in.'
            : 'This account already exists.';
        return res.status(400).json({ message: msg });
      }

      res.status(500).json({ message: 'Server error during registration' });
    }
  },
];

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Flexible login supports two flows:
//   1. Donor flow  → phone only (passwordless feel, phone is the identity)
//   2. Admin flow  → email + password (backward compatible with seed admins)
const login = [
  ...loginValidation,
  validate,
  async (req, res) => {
    try {
      const { phone, email, password } = req.body;

      // ── Flow 1: Phone-only donor login ───────────────────────────────
      if (phone && !email) {
        const user = await User.findOne({ phone: phone.trim() });
        if (!user) {
          return res.status(404).json({
            message: 'This mobile number is not registered. Please register first.',
          });
        }

        const token = generateToken(user._id);
        return res.json({ token, user: user.toSafeObject() });
      }

      // ── Flow 2: Email + password admin login ─────────────────────────
      if (email && password) {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = generateToken(user._id);
        return res.json({ token, user: user.toSafeObject() });
      }

      // ── Neither flow satisfied ────────────────────────────────────────
      return res.status(400).json({
        message: 'Please provide a phone number, or email and password to sign in.',
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during sign in' });
    }
  },
];

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Returns current authenticated user (token verified by protect middleware)
const getMe = async (req, res) => {
  res.json({ user: req.user.toSafeObject ? req.user.toSafeObject() : req.user });
};

module.exports = { register, login, getMe };
