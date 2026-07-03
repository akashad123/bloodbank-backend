const mongoose = require('mongoose');

/**
 * Certificate Schema
 * Stores metadata for each blood donation certificate generated after fulfillment.
 * The actual PDF is generated client-side from this data.
 */
const certificateSchema = new mongoose.Schema(
  {
    // Unique human-readable certificate ID e.g. "DYFI-2024-ABCD1234"
    certificateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Reference to the donor user
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Snapshot fields — kept denormalized so certificate is self-contained
    donorName: { type: String, required: true, trim: true },
    bloodGroup: { type: String, required: true },
    district:   { type: String, required: true },
    hospital:   { type: String, required: true },

    // The blood request this certificate is for
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request',
      required: true,
    },

    // Date the donation was completed / certificate was issued
    donationDate: { type: Date, required: true, default: Date.now },

    // Tracks whether the donor has viewed this certificate (used for sidebar badge)
    isSeenByCertOwner: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Certificate', certificateSchema);
