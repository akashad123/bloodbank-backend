const express = require('express');
const router = express.Router();
const { getDonors, updateProfile, toggleAvailability, getEligibility } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.get('/donors', protect, getDonors);
router.put('/profile', protect, updateProfile);
router.put('/availability', protect, toggleAvailability);
router.get('/eligibility', protect, getEligibility);

module.exports = router;
