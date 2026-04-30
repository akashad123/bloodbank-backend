const Notification = require('../models/Notification');

// ─── GET /api/notifications ───────────────────────────────────────────
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('requestId', 'bloodGroup hospital urgency status'),
      Notification.countDocuments({ recipient: req.user._id }),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    res.json({ notifications, total, unreadCount, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications' });
  }
};

// ─── GET /api/notifications/unread-count ─────────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching unread count' });
  }
};

// ─── PUT /api/notifications/:id/read ─────────────────────────────────
const markRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    res.json({ notification });
  } catch (error) {
    res.status(500).json({ message: 'Error marking notification as read' });
  }
};

// ─── PUT /api/notifications/read-all ─────────────────────────────────
const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Error marking all as read' });
  }
};

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead };
