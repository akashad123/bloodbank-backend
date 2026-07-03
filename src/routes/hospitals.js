const express = require('express');
const router = express.Router();
const {
  getHospitalsByDistrict,
  getAllHospitals,
  getAdminHospitals,
  createHospital,
  updateHospital,
  deleteHospital,
} = require('../controllers/hospitalController');
const { protect, requireAdmin } = require('../middleware/auth');

// ─── Admin routes (must be declared before /:district to avoid param collision) ─
router.get('/admin/my',   protect, requireAdmin, getAdminHospitals);
router.post('/admin',     protect, requireAdmin, createHospital);
router.put('/admin/:id',  protect, requireAdmin, updateHospital);
router.delete('/admin/:id', protect, requireAdmin, deleteHospital);

// ─── Public routes ─────────────────────────────────────────────────────────────
router.get('/', getAllHospitals);
router.get('/:district', getHospitalsByDistrict);

module.exports = router;
