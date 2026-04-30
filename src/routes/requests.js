const express = require('express');
const router = express.Router();
const {
  createRequest, getRequests, getRequest, getMyRequests,
  updateRequest, deleteRequest, updateRequestStatus, assignDonor, getRequestMatches,
} = require('../controllers/requestController');
const { protect, requireAdmin } = require('../middleware/auth');

router.route('/')
  .get(protect, getRequests)
  .post(protect, createRequest);

router.get('/my', protect, getMyRequests);

router.route('/:id')
  .get(protect, getRequest)
  .put(protect, updateRequest)
  .delete(protect, deleteRequest);

router.put('/:id/status', protect, requireAdmin, updateRequestStatus);
router.patch('/:id/assign-donor', protect, requireAdmin, assignDonor);
router.get('/:id/matches', protect, requireAdmin, getRequestMatches);

module.exports = router;


