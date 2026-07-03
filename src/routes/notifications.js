const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  dismissOne,
  dismissAll,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
router.delete('/dismiss-all', dismissAll);   // dismiss all – must be before /:id
router.delete('/:id/dismiss', dismissOne);   // dismiss single

module.exports = router;
