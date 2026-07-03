const Notification = require('../models/Notification');

// ─── GET /api/notifications ───────────────────────────────────────────
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const baseQuery = { recipient: req.user._id, isDismissed: { $ne: true } };

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(baseQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('requestId', 'bloodGroup hospital urgency status'),
      Notification.countDocuments(baseQuery),
      Notification.countDocuments({ recipient: req.user._id, isRead: false, isDismissed: { $ne: true } }),
    ]);

    res.json({ notifications, total, unreadCount, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications' });
  }
};

// ─── GET /api/notifications/unread-count ─────────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
      isDismissed: { $ne: true },
    });
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

// ─── DELETE /api/notifications/:id ───────────────────────────────────
// Soft-dismiss a single notification so it no longer appears
const dismissOne = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isDismissed: true, isRead: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification dismissed' });
  } catch (error) {
    res.status(500).json({ message: 'Error dismissing notification' });
  }
};

// ─── DELETE /api/notifications ───────────────────────────────────────
// Soft-dismiss ALL notifications for the current user
const dismissAll = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isDismissed: { $ne: true } },
      { isDismissed: true, isRead: true }
    );
    res.json({ message: 'All notifications dismissed' });
  } catch (error) {
    res.status(500).json({ message: 'Error dismissing all notifications' });
  }
};

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead, dismissOne, dismissAll };

