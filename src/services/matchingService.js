const User = require('../models/User');
const Notification = require('../models/Notification');
const twilioService = require('./twilioService');

/**
 * Match eligible donors to a blood request and notify them.
 * Called when a request is approved by admin.
 */
const matchAndNotify = async (request, io) => {
  try {
    // Find matching donors
    const donors = await User.find({
      bloodGroup: request.bloodGroup,
      district: request.district,
      isEligible: true,
      availabilityStatus: true,
      role: 'user',
    });

    if (donors.length === 0) {
      console.log(`No matching donors found for request ${request._id}`);
      return { matched: 0 };
    }

    // Save matched donor IDs to request
    request.matchedDonors = donors.map((d) => d._id);
    await request.save();

    // Create in-app notifications + send WhatsApp/SMS for each donor
    const urgencyLabel = request.urgency === 'emergency' ? '🚨 EMERGENCY' : '🩸 Blood Request';
    const notificationTitle = `${urgencyLabel} — ${request.bloodGroup} Needed`;
    const notificationMessage = `${request.units} unit(s) of ${request.bloodGroup} blood urgently needed at ${request.hospital}, ${request.district}. Contact: ${request.contactName} (${request.contactPhone}).`;

    const notifDocs = donors.map((donor) => ({
      recipient: donor._id,
      type: 'blood_request',
      title: notificationTitle,
      message: notificationMessage,
      requestId: request._id,
    }));

    await Notification.insertMany(notifDocs);

    // Emit real-time socket event to each donor
    if (io) {
      donors.forEach((donor) => {
        io.to(`user_${donor._id}`).emit('new_notification', {
          title: notificationTitle,
          message: notificationMessage,
          requestId: request._id,
          urgency: request.urgency,
        });
      });
    }

    // Send WhatsApp/SMS alerts
    const alertPromises = donors
      .filter((d) => d.whatsappEnabled && d.phone)
      .map((donor) =>
        twilioService.sendWhatsAppAlert(donor.phone, {
          donorName: donor.name,
          bloodGroup: request.bloodGroup,
          units: request.units,
          hospital: request.hospital,
          district: request.district,
          contactName: request.contactName,
          contactPhone: request.contactPhone,
          urgency: request.urgency,
        })
      );

    await Promise.allSettled(alertPromises); // Don't fail if Twilio errors

    console.log(`Matched ${donors.length} donors for request ${request._id}`);
    return { matched: donors.length };
  } catch (error) {
    console.error('Matching service error:', error);
    throw error;
  }
};

module.exports = { matchAndNotify };
