const mongoose = require('mongoose');

/**
 * Hospital schema — district-scoped, admin-managed hospitals.
 * Each hospital belongs to exactly one district and is managed
 * only by that district's admin. Soft-delete via isDeleted flag.
 */
const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true,
      index: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    // Soft delete — keeps hospital in DB for audit/history
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Which admin created this hospital entry
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Unique per district (case-insensitive check done in controller)
hospitalSchema.index({ district: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
