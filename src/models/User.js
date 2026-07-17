const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { KERALA_DISTRICTS, BLOOD_GROUPS, ELIGIBILITY_GAP_DAYS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    // ─── Core Identity ─────────────────────────────────────────────────
    name: { type: String, required: true, trim: true },

    // Email is optional — used only for admin accounts (legacy + seed)
    // sparse: true allows multiple documents to have no email (null/undefined) without violating unique
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    // Phone is the primary unique identifier for donor accounts
    phone: { type: String, required: true, unique: true, trim: true },

    // Password is always present — auto-generated for donors, manually set for admins
    passwordHash: { type: String, required: true },

    // ─── Role & Permissions ────────────────────────────────────────────
    role: { type: String, enum: ['user', 'donor', 'requester', 'admin'], default: 'user' },

    // ─── Donor Profile (optional at registration, can be updated later) ─
    bloodGroup: { type: String, enum: [...BLOOD_GROUPS, null], default: null },
    district: { type: String, enum: [...KERALA_DISTRICTS, null], default: null },

    // ─── Donation Tracking ─────────────────────────────────────────────
    lastDonationDate: { type: Date, default: null },
    isQualifiedDonor: { type: Boolean, default: false },
    isEligibleToDonate: { type: Boolean, default: false },

    // ─── Availability & Notifications ──────────────────────────────────
    availabilityStatus: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },

    // For Twilio alerts (future integration)
    whatsappEnabled: { type: Boolean, default: false },

    // ─── Donor Eligibility Pre-Screening Data ──────────────────────────
    donorEligibility: {
      ageConfirmed: { type: Boolean, default: null },
      medications: { type: Boolean, default: null },
      medicationDetails: { type: String, default: null },
      height: { type: Number, default: null },
      weight: { type: Number, default: null },
      smoking: { type: String, enum: ['Yes', 'No', 'Occasionally', null], default: null },
      alcohol: { type: String, enum: ['Yes', 'No', 'Occasionally', null], default: null },
      eligibilityStatus: { type: String, enum: ['eligible', 'ineligible', null], default: null },
      screenedAt: { type: Date, default: null }
    },
    donorStatus: {
      type: String,
      enum: ['Pending Screening', 'Screening Failed', 'Eligibility Unknown', 'Waiting Period Active', 'Eligible to Donate', null],
      default: null
    },
  },
  { timestamps: true }
);

// ─── Password Helpers ─────────────────────────────────────────────────────────

// Compare plain password against stored bcrypt hash
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

// Pre-save: hash password if modified, recalculate eligibility
userSchema.pre('save', async function () {
  // Hash password only when it has been modified (new or changed)
  if (this.isModified('passwordHash')) {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  }

  // Recalculate donation eligibility based on screening and last donation date
  if (this.role === 'admin') {
    this.isQualifiedDonor = false;
    this.isEligibleToDonate = false;
    this.donorStatus = null;
  } else {
    const screeningStatus = this.donorEligibility?.eligibilityStatus;

    if (!screeningStatus) {
      this.isQualifiedDonor = false;
      this.isEligibleToDonate = false;
      this.donorStatus = 'Pending Screening';
    } else if (screeningStatus === 'ineligible') {
      this.isQualifiedDonor = false;
      this.isEligibleToDonate = false;
      this.donorStatus = 'Screening Failed';
    } else if (screeningStatus === 'eligible') {
      this.isQualifiedDonor = true;
      
      if (!this.lastDonationDate) {
        this.isEligibleToDonate = true;
        this.donorStatus = 'Eligible to Donate';
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const last = new Date(this.lastDonationDate);
        last.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < ELIGIBILITY_GAP_DAYS) {
          this.isEligibleToDonate = false;
          this.donorStatus = 'Waiting Period Active';
        } else {
          this.isEligibleToDonate = true;
          this.donorStatus = 'Eligible to Donate';
        }
      }
    }
  }
});

// ─── Safe Serialization ───────────────────────────────────────────────────────

// Remove sensitive fields before sending to client
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
