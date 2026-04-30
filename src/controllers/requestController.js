const { body } = require('express-validator');
const Request = require('../models/Request');
const User = require('../models/User');
const validate = require('../middleware/validate');
const matchingService = require('../services/matchingService');
const { notify } = require('../services/notificationService');
const smsService = require('../services/smsService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format date only — "29 Apr 2026" */
const fmtDateOnly = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Format time only — "03:45 PM" */
const fmtTimeOnly = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

/** Format full datetime — "29 Apr 2026, 03:45 PM" */
const fmtDate = (d) => `${fmtDateOnly(d)}, ${fmtTimeOnly(d)}`;

// ─── POST /api/requests ───────────────────────────────────────────────────────
const createRequest = [
  body('bloodGroup').notEmpty().withMessage('Blood group is required'),
  body('units').isInt({ min: 1 }).withMessage('Units must be at least 1'),
  body('hospital').trim().notEmpty().withMessage('Hospital name is required'),
  body('district').notEmpty().withMessage('District is required'),
  body('urgency').optional().isIn(['normal', 'emergency']),
  body('contactName').trim().notEmpty().withMessage('Contact name is required'),
  body('contactPhone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid Indian phone number required'),
  validate,
  async (req, res) => {
    try {
      const { bloodGroup, units, hospital, district, urgency, contactName, contactPhone, additionalInfo } =
        req.body;

      const request = await Request.create({
        bloodGroup,
        units,
        hospital,
        district,
        urgency: urgency || 'normal',
        contactName,
        contactPhone,
        additionalInfo,
        createdBy: req.user._id,
      });

      // ── Match donors at creation time ────────────────────────────────────
      try {
        const donors = await User.find({
          bloodGroup: request.bloodGroup,
          district: request.district,
          isEligible: true,
          availabilityStatus: true,
          role: 'user',
          _id: { $ne: req.user._id }, // exclude requester themselves
        }).select('_id name phone whatsappEnabled');

        if (donors.length > 0) {
          request.matchedDonors = donors.map((d) => d._id);
          await request.save();

          const io = req.app.get('io');
          const urgencyLabel = urgency === 'emergency' ? '🚨 EMERGENCY' : '🩸 Blood Request';
          const notifTitle = `${urgencyLabel} — ${bloodGroup} Needed in ${district}`;
          const notifMsg = `${units} unit(s) of ${bloodGroup} needed at ${hospital}, ${district}. Contact: ${contactName} (${contactPhone}).`;

          await notify(io, donors.map((d) => d._id), 'blood_request', notifTitle, notifMsg, request._id);

          // WhatsApp / SMS for opted-in donors (fire-and-forget)
          donors
            .filter((d) => d.whatsappEnabled && d.phone)
            .forEach((donor) =>
              smsService.sendSMS(donor.phone, `${notifTitle}\n${notifMsg}`).catch(() => {})
            );

          console.log(`[createRequest] Matched & notified ${donors.length} donors for request ${request._id}`);
        }
      } catch (matchErr) {
        // Matching errors must NOT block the API response
        console.error('[createRequest] Matching error (non-fatal):', matchErr.message);
      }

      res.status(201).json({ request, message: 'Request created — pending admin approval' });
    } catch (error) {
      console.error('Create request error:', error);
      res.status(500).json({ message: 'Error creating request' });
    }
  },
];

// ─── GET /api/requests ────────────────────────────────────────────────────────
const getRequests = async (req, res) => {
  try {
    const { bloodGroup, urgency, status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = {};

    if (req.user.role === 'admin') {
      query.district = req.user.district;
      if (status) query.status = status;
    } else {
      query.createdBy = req.user._id;
    }

    if (bloodGroup && bloodGroup.trim()) query.bloodGroup = bloodGroup.trim();
    if (urgency && urgency.trim()) query.urgency = urgency.trim();

    const [requests, total] = await Promise.all([
      Request.find(query)
        .populate('createdBy', 'name email phone district')
        .populate('assignedDonor', 'name phone bloodGroup district')
        .sort({ urgency: -1, createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      Request.countDocuments(query),
    ]);

    res.json({ requests, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('[GET /requests] error:', error);
    res.status(500).json({ message: 'Error fetching requests' });
  }
};

// ─── GET /api/requests/my ─────────────────────────────────────────────────────
const getMyRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = { createdBy: req.user._id };

    const [requests, total] = await Promise.all([
      Request.find(query)
        .populate('createdBy', 'name email phone district')
        .populate('assignedDonor', 'name phone bloodGroup district')
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      Request.countDocuments(query),
    ]);

    res.json({ requests, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('[GET /requests/my] error:', error);
    res.status(500).json({ message: 'Error fetching my requests' });
  }
};

// ─── GET /api/requests/:id ────────────────────────────────────────────────────
const getRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('createdBy', 'name email phone district')
      .populate('matchedDonors', 'name phone bloodGroup district')
      .populate('assignedDonor', 'name phone bloodGroup district');

    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (req.user.role === 'admin') {
      if (request.district !== req.user.district) {
        return res.status(403).json({ message: 'Access denied: Admin district mismatch' });
      }
    } else {
      if (request.createdBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied: You can only view your own requests' });
      }
    }

    res.json({ request });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching request' });
  }
};

// ─── PUT /api/requests/:id ────────────────────────────────────────────────────
const updateRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isOwner = request.createdBy.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to edit this request' });
    }

    if (isOwner && request.status !== 'pending') {
      return res.status(400).json({ message: 'Cannot edit a request that is already approved/rejected' });
    }

    const { bloodGroup, units, hospital, urgency, contactName, contactPhone, additionalInfo } = req.body;
    if (bloodGroup) request.bloodGroup = bloodGroup;
    if (units) request.units = units;
    if (hospital) request.hospital = hospital;
    if (urgency) request.urgency = urgency;
    if (contactName) request.contactName = contactName;
    if (contactPhone) request.contactPhone = contactPhone;
    if (additionalInfo !== undefined) request.additionalInfo = additionalInfo;

    await request.save();
    res.json({ request, message: 'Request updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating request' });
  }
};

// ─── DELETE /api/requests/:id ─────────────────────────────────────────────────
const deleteRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isOwner = request.createdBy.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this request' });
    }

    await request.deleteOne();
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting request' });
  }
};

// ─── PUT /api/requests/:id/status (Admin only — fulfilled only) ───────────────
const updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (status !== 'fulfilled') {
      return res.status(400).json({ message: "Only 'fulfilled' is accepted here" });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.district !== req.user.district) {
      return res.status(403).json({ message: 'This request belongs to another district' });
    }

    if (request.status !== 'assigned') {
      return res.status(400).json({ message: 'Only assigned requests can be marked fulfilled' });
    }

    request.status = 'fulfilled';
    request.fulfilledAt = new Date();
    await request.save();

    const io = req.app.get('io');
    const creatorId = request.createdBy;
    const fulfilledAt = fmtDate(new Date());

    // ── Notify requester ──────────────────────────────────────────────────────
    await notify(
      io, [creatorId], 'request_fulfilled',
      '🎉 Blood Request Fulfilled',
      `Your blood request has been fulfilled successfully.\n\n` +
      `🏥 Hospital: ${request.hospital}\n` +
      `📍 Location: ${request.district}\n` +
      `🩸 Blood Group: ${request.bloodGroup} · ${request.units} unit(s)\n` +
      `✅ Fulfilled on: ${fulfilledAt}\n\n` +
      `Thank you for using RedConnect!`,
      request._id
    );
    smsService.sendSMS(
      request.contactPhone,
      `🎉 Your blood request (${request.bloodGroup}) at ${request.hospital}, ${request.district} has been FULFILLED on ${fulfilledAt}. Thank you!`
    ).catch(() => {});

    // ── Notify assigned donor ─────────────────────────────────────────────────
    if (request.assignedDonor) {
      await notify(
        io, [request.assignedDonor], 'request_fulfilled',
        '🎉 Donation Completed — Thank You!',
        `The blood donation you were assigned to has been completed.\n\n` +
        `🏥 Hospital: ${request.hospital}\n` +
        `📍 Location: ${request.district}\n` +
        `🩸 Blood Group: ${request.bloodGroup}\n` +
        `✅ Completed on: ${fulfilledAt}\n\n` +
        `Your contribution has saved a life. Thank you!`,
        request._id
      );
    }

    res.json({ request, message: 'Request fulfilled successfully' });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Error updating status' });
  }
};

// ─── PATCH /api/requests/:id/assign-donor (Admin only) ───────────────────────
const assignDonor = async (req, res) => {
  try {
    const { donorId } = req.body;
    if (!donorId) return res.status(400).json({ message: 'donorId is required' });

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.district !== req.user.district) {
      return res.status(403).json({ message: 'This request belongs to another district' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Can only assign a donor to pending requests' });
    }

    const donor = await User.findById(donorId).select('name phone district bloodGroup');
    if (!donor) return res.status(404).json({ message: 'Donor not found' });

    request.assignedDonor = donorId;
    request.assignedAt = new Date();
    request.status = 'assigned';  // advance lifecycle: pending → assigned
    await request.save();

    const io = req.app.get('io');

    const assignDate = fmtDateOnly(request.assignedAt);
    const assignTime = fmtTimeOnly(request.assignedAt);

    // ── Notify the donor ──────────────────────────────────────────────────
    await notify(
      io, [donorId], 'donor_assigned',
      '🩸 You Have Been Assigned to Donate Blood',
      `You have been assigned to donate blood.\n\n` +
      `🏥 Hospital: ${request.hospital} • ${request.district}\n` +
      `📅 Date: ${assignDate} • Time: ${assignTime}\n\n` +
      `📞 Requester Contact: ${request.contactName} — ${request.contactPhone}\n` +
      `📞 Donor Contact (You): ${donor.phone}\n\n` +
      `Please coordinate and report to the hospital. Thank you!`,
      request._id
    );
    smsService.sendSMS(
      donor.phone,
      `🩸 You've been assigned to donate ${request.bloodGroup} blood.\nHospital: ${request.hospital}, ${request.district}\nDate: ${assignDate} | Time: ${assignTime}\nRequester: ${request.contactName} (${request.contactPhone})\nYour phone on record: ${donor.phone}`
    ).catch(() => {});

    // ── Notify the requester ──────────────────────────────────────────────
    await notify(
      io, [request.createdBy], 'donor_assigned',
      '✅ A Donor Has Been Assigned to Your Request',
      `A donor has been assigned for your blood request.\n\n` +
      `🏥 Hospital: ${request.hospital} • ${request.district}\n` +
      `🩸 Blood Group: ${request.bloodGroup}\n\n` +
      `📞 Requester Contact (You): ${request.contactPhone}\n` +
      `📞 Donor Contact: ${donor.name} — ${donor.phone}\n\n` +
      `The donor will contact you soon. Please be available.`,
      request._id
    );
    smsService.sendSMS(
      request.contactPhone,
      `✅ A donor (${donor.name}, ${donor.phone}) has been assigned for your ${request.bloodGroup} blood request at ${request.hospital}, ${request.district}. They will contact you shortly.`
    ).catch(() => {});

    res.json({ request, message: 'Donor assigned successfully' });
  } catch (error) {
    console.error('Assign donor error:', error);
    res.status(500).json({ message: 'Error assigning donor' });
  }
};

// ─── GET /api/requests/:id/matches (Admin only) ──────────────────────────────
const getRequestMatches = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.district !== req.user.district) {
      return res.status(403).json({ message: 'This request belongs to another district' });
    }

    // If we already have saved matchedDonors, populate & return them
    if (request.matchedDonors && request.matchedDonors.length > 0) {
      const donors = await User.find({ _id: { $in: request.matchedDonors } })
        .select('name phone bloodGroup district isEligible availabilityStatus');
      return res.json({ donors, total: donors.length });
    }

    // Otherwise run a live query
    const donors = await User.find({
      bloodGroup: request.bloodGroup,
      district: request.district,
      isEligible: true,
      availabilityStatus: true,
      role: 'user',
    }).select('name phone bloodGroup district isEligible availabilityStatus');

    res.json({ donors, total: donors.length });
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ message: 'Error fetching matched donors' });
  }
};

module.exports = {
  createRequest,
  getRequests,
  getMyRequests,
  getRequest,
  updateRequest,
  deleteRequest,
  updateRequestStatus,
  assignDonor,
  getRequestMatches,
};
