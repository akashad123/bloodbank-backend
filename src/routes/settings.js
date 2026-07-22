const express = require('express');
const router = express.Router();
const { getContacts, updateContacts } = require('../controllers/settingsController');
const { protect, requireAdmin } = require('../middleware/auth');

// Public route to get contacts
router.get('/contacts', getContacts);

// Protected admin route to update contacts
router.put('/contacts', protect, requireAdmin, updateContacts);

module.exports = router;
