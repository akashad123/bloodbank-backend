const express = require('express');
const router = express.Router();
const { getAnalytics, getUsers, toggleUserAvailability } = require('../controllers/adminController');
const { protect, requireAdmin } = require('../middleware/auth');

router.use(protect, requireAdmin);

router.get('/analytics', getAnalytics);
router.get('/users', getUsers);
router.put('/users/:id/toggle', toggleUserAvailability);

module.exports = router;
