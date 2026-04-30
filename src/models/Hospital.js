const mongoose = require('mongoose');

/**
 * Hospital schema — district-scoped list of hospitals.
 * Seeded from DISTRICT_HOSPITALS constants.
 */
const hospitalSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: false }
);

// Compound index for fast district queries
hospitalSchema.index({ district: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
