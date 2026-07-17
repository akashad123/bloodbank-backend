const mongoose = require('mongoose');
const { KERALA_DISTRICTS, BLOOD_GROUPS } = require('../config/constants');

const requestSchema = new mongoose.Schema(
  {
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    units: { type: Number, required: true, min: 1 },
    hospital: { type: String, required: true, trim: true },
    district: { type: String, enum: KERALA_DISTRICTS, required: true },
    urgency: { type: String, enum: ['normal', 'emergency'], default: 'normal' },
    status: {
      type: String,
      enum: ['pending', 'assigned', 'accepted', 'completed', 'fulfilled', 'cancelled'],
      default: 'pending',
    },
    contactName: { type: String, required: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    additionalInfo: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    matchedDonors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignedDonor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: null },
    adminNote: { type: String, default: null },
    fulfilledAt: { type: Date, default: null },
    closureReason: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Request', requestSchema);
