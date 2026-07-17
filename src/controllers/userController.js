const User = require('../models/User');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { ELIGIBILITY_GAP_DAYS } = require('../config/constants');

// ─── GET /api/users/donors ────────────────────────────────────────────
// Admin: list all donors in their district
const getDonors = async (req, res) => {
  try {
    const { district, bloodGroup, eligibleOnly } = req.query;

    const query = { isQualifiedDonor: true };

    // Admin sees only their district unless super-querying
    if (req.user.role === 'admin') {
      query.district = req.user.district;
    } else if (district) {
      query.district = district;
    }

    if (bloodGroup) query.bloodGroup = bloodGroup;
    if (eligibleOnly === 'true') query.isEligibleToDonate = true;

    const donors = await User.find(query).select('-passwordHash').sort({ name: 1 });

    // Sanitize phone numbers for non-admins to prevent direct user-to-user exposure
    const sanitizedDonors = donors.map((d) => {
      const obj = d.toSafeObject ? d.toSafeObject() : d.toObject();
      if (req.user.role !== 'admin') {
        obj.phone = 'Admin Mediated';
      }
      return obj;
    });

    res.json({ donors: sanitizedDonors, count: sanitizedDonors.length });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching donors' });
  }
};

// ─── PUT /api/users/profile ───────────────────────────────────────────
const updateProfile = [
  body('name').optional().trim().notEmpty(),
  body('phone').optional().matches(/^[6-9]\d{9}$/),
  body('bloodGroup').optional().notEmpty(),
  body('district').optional().notEmpty(),
  body('lastDonationDate').optional({ values: 'falsy' }).isISO8601(),
  validate,
  async (req, res) => {
    try {
      const { name, phone, bloodGroup, district, lastDonationDate, whatsappEnabled } = req.body;

      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (name) user.name = name;
      if (phone) user.phone = phone;
      if (bloodGroup) {
        user.bloodGroup = bloodGroup;
        if (user.role === 'requester') {
          user.role = 'donor';
        }
      }
      if (district) user.district = district;
      if (lastDonationDate !== undefined) user.lastDonationDate = lastDonationDate || null;
      if (whatsappEnabled !== undefined) user.whatsappEnabled = whatsappEnabled;

      await user.save(); // triggers eligibility recalculation

      res.json({ user: user.toSafeObject(), message: 'Profile updated successfully' });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ message: 'Error updating profile' });
    }
  },
];

// ─── PUT /api/users/availability ─────────────────────────────────────
const toggleAvailability = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.availabilityStatus = !user.availabilityStatus;
    await user.save();

    res.json({
      availabilityStatus: user.availabilityStatus,
      message: `You are now ${user.availabilityStatus ? 'available' : 'unavailable'} for donation`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling availability' });
  }
};

// ─── GET /api/users/eligibility ───────────────────────────────────────
const getEligibility = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const today = new Date();

    let daysLeft = 0;
    let daysSinceDonation = null;

    if (user.lastDonationDate) {
      daysSinceDonation = Math.floor((today - new Date(user.lastDonationDate)) / (1000 * 60 * 60 * 24));
      daysLeft = Math.max(0, ELIGIBILITY_GAP_DAYS - daysSinceDonation);
    }

    res.json({
      isEligible: user.isEligible,
      lastDonationDate: user.lastDonationDate,
      daysSinceDonation,
      daysUntilEligible: daysLeft,
      availabilityStatus: user.availabilityStatus,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching eligibility' });
  }
};

module.exports = { getDonors, updateProfile, toggleAvailability, getEligibility };
