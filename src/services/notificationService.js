const Notification = require('../models/Notification');

/**
 * Create one or more in-app notifications and emit socket events.
 *
 * @param {object}  io         - Socket.IO server instance (may be null)
 * @param {Array}   recipients - Array of user ObjectId(s)
 * @param {string}  type       - Notification type enum value
 * @param {string}  title      - Short title
 * @param {string}  message    - Full message body
 * @param {ObjectId} requestId - (optional) related request id
 */
const notify = async (io, recipients, type, title, message, requestId = null) => {
  if (!recipients || recipients.length === 0) return;

  const docs = recipients.map((userId) => ({
    recipient: userId,
    type,
    title,
    message,
    requestId,
  }));

  await Notification.insertMany(docs);

  if (io) {
    recipients.forEach((userId) => {
      io.to(`user_${userId}`).emit('new_notification', { title, message, requestId });
    });
  }
};

module.exports = { notify };
