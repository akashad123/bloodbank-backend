const express = require('express');
const router = express.Router();
const {
  createRequest, getRequests, getRequest, getMyRequests,
  updateRequest, deleteRequest, updateRequestStatus, assignDonor, getRequestMatches,
  getAssignedRequests, acceptRequest, rejectRequest, completeRequest, verifyRequestCompletion,
} = require('../controllers/requestController');
const { protect, requireAdmin } = require('../middleware/auth');

router.route('/')
  .get(protect, getRequests)
  .post(protect, createRequest);

router.get('/my', protect, getMyRequests);
router.get('/assigned', protect, getAssignedRequests);

router.route('/:id')
  .get(protect, getRequest)
  .put(protect, updateRequest)
  .delete(protect, deleteRequest);

router.put('/:id/status', protect, requireAdmin, updateRequestStatus);
router.patch('/:id/assign-donor', protect, requireAdmin, assignDonor);
router.get('/:id/matches', protect, requireAdmin, getRequestMatches);

router.put('/:id/accept', protect, acceptRequest);
router.put('/:id/reject', protect, rejectRequest);
router.put('/:id/complete', protect, completeRequest);
router.put('/:id/verify', protect, requireAdmin, verifyRequestCompletion);

module.exports = router;


