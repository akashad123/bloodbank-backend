const express = require('express');
const router = express.Router();
const { getAnalytics, getUsers, toggleUserAvailability, getAllUsers, deleteUser } = require('../controllers/adminController');
const { protect, requireAdmin } = require('../middleware/auth');

router.use(protect, requireAdmin);

router.get('/analytics', getAnalytics);
router.get('/users', getUsers);
router.put('/users/:id/toggle', toggleUserAvailability);

router.get('/all-users', getAllUsers);
router.delete('/all-users/:id', deleteUser);

module.exports = router;
