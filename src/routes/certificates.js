const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getMyCertificates,
  getCertificateById,
  getMyCertificateCount,
  getUnseenCertificateCount,
  markAllCertificatesSeen,
} = require('../controllers/certificateController');

// All certificate routes require authentication
router.use(protect);

// GET /api/certificates/my — all certificates for logged-in donor
router.get('/my', getMyCertificates);

// GET /api/certificates/count — total count for dashboard widget
router.get('/count', getMyCertificateCount);

// GET /api/certificates/unseen-count — count of new/unseen certificates (badge)
router.get('/unseen-count', getUnseenCertificateCount);

// PUT /api/certificates/mark-seen — mark all certificates as seen (clear badge)
router.put('/mark-seen', markAllCertificatesSeen);

// GET /api/certificates/:id — single certificate by certificateId string
router.get('/:id', getCertificateById);

module.exports = router;
