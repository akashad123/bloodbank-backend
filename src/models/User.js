const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { KERALA_DISTRICTS, BLOOD_GROUPS, ELIGIBILITY_GAP_DAYS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    district: { type: String, enum: KERALA_DISTRICTS, required: true },
    lastDonationDate: { type: Date, default: null },
    isEligible: { type: Boolean, default: true },
    availabilityStatus: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },
    // For Twilio alerts
    whatsappEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ─── Password Helpers ────────────────────────────────────────────────
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

userSchema.pre('save', async function () {
  // Hash password if modified
  if (this.isModified('passwordHash')) {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  }

  // Recalculate eligibility
  if (this.lastDonationDate) {
    const today = new Date();
    const last = new Date(this.lastDonationDate);
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    this.isEligible = diffDays >= ELIGIBILITY_GAP_DAYS;
  } else {
    this.isEligible = true; // Never donated → eligible
  }
});

// Remove sensitive fields from JSON output
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
