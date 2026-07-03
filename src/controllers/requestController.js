const { body } = require('express-validator');
const Request = require('../models/Request');
const User = require('../models/User');
const validate = require('../middleware/validate');
const matchingService = require('../services/matchingService');
const { notify } = require('../services/notificationService');
const smsService = require('../services/smsService');
const { createCertificateForDonor } = require('./certificateController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format date only — "29 Apr 2026" */
const fmtDateOnly = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Format time only — "03:45 PM" */
const fmtTimeOnly = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

/** Format full datetime — "29 Apr 2026, 03:45 PM" */
const fmtDate = (d) => `${fmtDateOnly(d)}, ${fmtTimeOnly(d)}`;

/**
 * Sanitizes request objects based on user role to protect privacy.
 * Non-admins cannot see:
 * - Direct contact phone of request unless they created it.
 * - Phone or email of other donors (assigned or matched).
 */
const sanitizeRequests = (requests, userId, role) => {
  const isArray = Array.isArray(requests);
  const list = isArray ? requests : [requests];

  const sanitized = list.map(req => {
    const r = req.toObject ? req.toObject() : { ...req };
    if (role !== 'admin') {
      const createdById = r.createdBy?._id || r.createdBy;
      const isOwner = createdById && createdById.toString() === userId.toString();

      if (isOwner) {
        // Owner sees their own request info, but must not see assigned donor's phone/email
        if (r.assignedDonor) {
          const donorObj = r.assignedDonor.toObject ? r.assignedDonor.toObject() : { ...r.assignedDonor };
          delete donorObj.phone;
          delete donorObj.email;
          r.assignedDonor = donorObj;
        }
        if (r.matchedDonors) {
          r.matchedDonors = r.matchedDonors.map(d => {
            const dObj = d.toObject ? d.toObject() : { ...d };
            delete dObj.phone;
            delete dObj.email;
            return dObj;
          });
        }
      } else {
        // Non-owner / Donor: Cannot see requester's contact details, only name.
        r.contactPhone = 'Admin Mediated';
        if (r.createdBy) {
          const creatorObj = r.createdBy.toObject ? r.createdBy.toObject() : { ...r.createdBy };
          delete creatorObj.phone;
          delete creatorObj.email;
          r.createdBy = creatorObj;
        }
        // Cannot see other donors' phone/email (only their own if they are assigned)
        if (r.assignedDonor) {
          const donorObj = r.assignedDonor.toObject ? r.assignedDonor.toObject() : { ...r.assignedDonor };
          const donorId = donorObj._id || donorObj;
          if (donorId.toString() !== userId.toString()) {
            delete donorObj.phone;
            delete donorObj.email;
          }
          r.assignedDonor = donorObj;
        }
        if (r.matchedDonors) {
          r.matchedDonors = r.matchedDonors.map(d => {
            const dObj = d.toObject ? d.toObject() : { ...d };
            const donorId = dObj._id || dObj;
            if (donorId.toString() !== userId.toString()) {
              delete dObj.phone;
              delete dObj.email;
            }
            return dObj;
          });
        }
      }
    }
    return r;
  });

  return isArray ? sanitized : sanitized[0];
};

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
          role: 'donor',
          _id: { $ne: req.user._id }, // exclude requester themselves
        }).select('_id name phone whatsappEnabled');

        if (donors.length > 0) {
          request.matchedDonors = donors.map((d) => d._id);
          await request.save();

          const io = req.app.get('io');
          const urgencyLabel = urgency === 'emergency' ? '🚨 EMERGENCY' : '🩸 Blood Request';
          const notifTitle = `${urgencyLabel} — ${bloodGroup} Needed in ${district}`;
          const notifMsg = `${units} unit(s) of ${bloodGroup} needed at ${hospital}, ${district}. Please coordinate with DYFI Mokeri East MC volunteers.`;

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

    const sanitized = sanitizeRequests(requests, req.user._id, req.user.role);
    res.json({ requests: sanitized, total, page: Number(page), pages: Math.ceil(total / limit) });
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

    const sanitized = sanitizeRequests(requests, req.user._id, req.user.role);
    res.json({ requests: sanitized, total, page: Number(page), pages: Math.ceil(total / limit) });
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
      const isOwner = request.createdBy?._id.toString() === req.user._id.toString();
      const isAssignedDonor = request.assignedDonor?._id.toString() === req.user._id.toString() || request.assignedDonor?.toString() === req.user._id.toString();
      const isMatchedDonor = request.matchedDonors?.some(m => m._id.toString() === req.user._id.toString() || m.toString() === req.user._id.toString());
      
      if (!isOwner && !isAssignedDonor && !isMatchedDonor) {
        return res.status(403).json({ message: 'Access denied: You are not authorized to view this request' });
      }
    }

    const requestObj = sanitizeRequests(request, req.user._id, req.user.role);
    res.json({ request: requestObj });
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

// ─── Helper: Fulfill Request and Process Certificate/Donor Eligibility ──────
const fulfillAndCertificate = async (request, io) => {
  request.status = 'fulfilled';
  request.fulfilledAt = new Date();
  await request.save();

  const fulfilledAt = fmtDate(new Date());

  // 1. Update donor availability/eligibility and generate certificate
  if (request.assignedDonor) {
    const donor = await User.findById(request.assignedDonor);
    if (donor) {
      donor.lastDonationDate = new Date();
      // userSchema pre-save hook will automatically recalculate eligibility
      await donor.save();

      await createCertificateForDonor({
        donorId:      request.assignedDonor,
        donorName:    donor.name,
        bloodGroup:   donor.bloodGroup,
        district:     donor.district,
        hospital:     request.hospital,
        requestId:    request._id,
        donationDate: new Date(),
      });
    }
  }

  // 2. Notify requester
  await notify(
    io, [request.createdBy], 'request_fulfilled',
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

  // 3. Notify assigned donor
  if (request.assignedDonor) {
    await notify(
      io, [request.assignedDonor], 'request_fulfilled',
      '🎉 Donation Completed — Certificate Issued!',
      `The blood donation you were assigned to has been completed.\n\n` +
      `🏥 Hospital: ${request.hospital}\n` +
      `📍 Location: ${request.district}\n` +
      `🩸 Blood Group: ${request.bloodGroup}\n` +
      `✅ Completed on: ${fulfilledAt}\n\n` +
      `🏅 Your donation certificate has been generated! View it in your dashboard.\n` +
      `Your contribution has saved a life. Thank you!`,
      request._id
    );
  }
};

// ─── PUT /api/requests/:id/status (Admin only) ───────────────────────────────
const updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['accepted', 'completed', 'fulfilled'].includes(status)) {
      return res.status(400).json({ message: "Invalid status value requested. Must be 'accepted', 'completed', or 'fulfilled'." });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.district !== req.user.district) {
      return res.status(403).json({ message: 'This request belongs to another district' });
    }

    const io = req.app.get('io');

    if (status === 'fulfilled') {
      if (!['assigned', 'accepted', 'completed'].includes(request.status)) {
        return res.status(400).json({ message: 'Only assigned, accepted, or completed requests can be marked fulfilled' });
      }
      await fulfillAndCertificate(request, io);
    } else if (status === 'accepted') {
      if (request.status !== 'assigned') {
        return res.status(400).json({ message: 'Can only mark as accepted when status is assigned' });
      }
      request.status = 'accepted';
      await request.save();

      // Notify requester
      await notify(
        io, [request.createdBy], 'donor_accepted',
        '🤝 Donor Accepted Your Request (Updated by Admin)',
        `A matching donor has accepted your blood request for ${request.bloodGroup}.\n\n` +
        `For coordination contact:\n` +
        `Rahul Tacholi – 9946709455\n` +
        `Abhinav PP – 8606839418\n` +
        `Shinantu – 8086849291\n\n` +
        `The admin team will coordinate the donation process securely.`,
        request._id
      );

      // Notify donor
      if (request.assignedDonor) {
        await notify(
          io, [request.assignedDonor], 'donor_accepted',
          '🤝 Assignment Accepted by Admin',
          `Admin has marked your assignment for the request at ${request.hospital} as accepted.`,
          request._id
        );
      }
    } else if (status === 'completed') {
      if (request.status !== 'accepted') {
        return res.status(400).json({ message: 'Can only mark as completed when status is accepted' });
      }
      request.status = 'completed';
      await request.save();

      // Notify requester
      await notify(
        io, [request.createdBy], 'donation_completed',
        '🏆 Donation Marked as Completed',
        `The blood donation has been marked as completed.\n\n` +
        `Admin verification is pending. Once verified, the request will be marked fulfilled.`,
        request._id
      );

      // Notify donor
      if (request.assignedDonor) {
        await notify(
          io, [request.assignedDonor], 'donation_completed',
          '🏆 Donation Marked as Completed by Admin',
          `Admin has marked your donation as completed for the request at ${request.hospital}.`,
          request._id
        );
      }
    }

    res.json({ request: sanitizeRequests(request, req.user._id, req.user.role), message: `Request status updated to ${status} successfully` });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Error updating status' });
  }
};

// ─── PUT /api/requests/:id/verify (Admin only) ───────────────────────────────
const verifyRequestCompletion = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.district !== req.user.district) {
      return res.status(403).json({ message: 'This request belongs to another district' });
    }

    if (request.status !== 'completed') {
      return res.status(400).json({ message: 'Request is not marked as completed by donor' });
    }

    const io = req.app.get('io');
    await fulfillAndCertificate(request, io);

    res.json({ request: sanitizeRequests(request, req.user._id, req.user.role), message: 'Donation verified and request fulfilled successfully' });
  } catch (error) {
    console.error('Verify request error:', error);
    res.status(500).json({ message: 'Error verifying donation completion' });
  }
};

// ─── GET /api/requests/assigned (Donor assigned requests) ──────────────────────
const getAssignedRequests = async (req, res) => {
  try {
    const requests = await Request.find({
      assignedDonor: req.user._id,
      status: { $in: ['assigned', 'accepted', 'completed'] },
    })
      .populate('createdBy', 'name phone')
      .sort({ updatedAt: -1 });

    const sanitized = sanitizeRequests(requests, req.user._id, req.user.role);
    res.json({ requests: sanitized });
  } catch (error) {
    console.error('[getAssignedRequests] error:', error);
    res.status(500).json({ message: 'Error fetching assigned requests' });
  }
};

// ─── PUT /api/requests/:id/accept (Donor accepts assignment) ─────────────────
const acceptRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.assignedDonor?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not assigned to this request' });
    }

    if (request.status !== 'assigned') {
      return res.status(400).json({ message: 'Request cannot be accepted in its current status' });
    }

    request.status = 'accepted';
    await request.save();

    const io = req.app.get('io');

    // Notify requester
    await notify(
      io, [request.createdBy], 'donor_accepted',
      '🤝 Donor Accepted Your Request',
      `A matching donor has accepted your blood request for ${request.bloodGroup}.\n\n` +
      `For coordination contact:\n` +
      `Rahul Tacholi – 9946709455\n` +
      `Abhinav PP – 8606839418\n` +
      `Shinantu – 8086849291\n\n` +
      `The admin team will coordinate the donation process securely.`,
      request._id
    );

    // Notify admins of this district
    const admins = await User.find({ district: request.district, role: 'admin' }).select('_id');
    const adminIds = admins.map(a => a._id);
    await notify(
      io, adminIds, 'donor_accepted',
      '🤝 Donor Accepted Assignment',
      `Donor ${req.user.name} has accepted the assignment for the request at ${request.hospital}.`,
      request._id
    );

    res.json({ request, message: 'Request accepted successfully' });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ message: 'Error accepting request' });
  }
};

// ─── PUT /api/requests/:id/reject (Donor rejects assignment) ─────────────────
const rejectRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.assignedDonor?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not assigned to this request' });
    }

    if (request.status !== 'assigned') {
      return res.status(400).json({ message: 'Request cannot be rejected in its current status' });
    }

    // Reset status to pending, clear assignment
    request.status = 'pending';
    request.assignedDonor = null;
    request.assignedAt = null;
    await request.save();

    const io = req.app.get('io');

    // Notify admins of this district so they can assign another donor
    const admins = await User.find({ district: request.district, role: 'admin' }).select('_id');
    const adminIds = admins.map(a => a._id);
    await notify(
      io, adminIds, 'donor_rejected',
      '❌ Donor Rejected Assignment',
      `Donor ${req.user.name} has rejected the assignment for the request at ${request.hospital}. The request is now pending again.`,
      request._id
    );

    res.json({ request: sanitizeRequests(request, req.user._id, req.user.role), message: 'Request rejected successfully' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ message: 'Error rejecting request' });
  }
};

// ─── PUT /api/requests/:id/complete (Donor marks donation completed) ─────────
const completeRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (request.assignedDonor?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not assigned to this request' });
    }

    if (request.status !== 'accepted') {
      return res.status(400).json({ message: 'You must accept the request first' });
    }

    request.status = 'completed';
    await request.save();

    const io = req.app.get('io');

    // Notify requester
    await notify(
      io, [request.createdBy], 'donation_completed',
      '🏆 Donation Marked as Completed',
      `The donor (${req.user.name}) has marked the blood donation as completed.\n\n` +
      `Admin verification is pending. Once verified, the request will be marked fulfilled.`,
      request._id
    );

    // Notify admins of this district
    const admins = await User.find({ district: request.district, role: 'admin' }).select('_id');
    const adminIds = admins.map(a => a._id);
    await notify(
      io, adminIds, 'donation_completed',
      '🏆 Donation Marked as Completed',
      `Donor ${req.user.name} has marked their donation as completed for the request at ${request.hospital}. Please verify and fulfill.`,
      request._id
    );

    res.json({ request: sanitizeRequests(request, req.user._id, req.user.role), message: 'Donation marked as completed. Pending admin verification.' });
  } catch (error) {
    console.error('Complete request error:', error);
    res.status(500).json({ message: 'Error completing request' });
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

    if (!['pending', 'assigned', 'accepted'].includes(request.status)) {
      return res.status(400).json({ message: 'Can only assign a donor to pending, assigned, or accepted requests' });
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
      '🩸 Blood Donation Assignment',
      `Hospital: ${request.hospital} – ${request.district}\n\n` +
      `Date & Time:\n${assignDate} – ${assignTime}\n\n` +
      `Blood Group Required:\n${request.bloodGroup}\n\n` +
      `For coordination contact:\n` +
      `Rahul Tacholi – 9946709455\n` +
      `Abhinav PP – 8606839418\n` +
      `Shinantu – 8086849291\n\n` +
      `Please contact the admin team for further instructions.`,
      request._id
    );
    smsService.sendSMS(
      donor.phone,
      `🩸 Blood Donation Assignment\nHospital: ${request.hospital} – ${request.district}\nDate & Time: ${assignDate} – ${assignTime}\nBlood Group: ${request.bloodGroup}\nFor coordination contact:\nRahul Tacholi – 9946709455\nAbhinav PP – 8606839418\nShinantu – 8086849291\nPlease contact the admin team for further instructions.`
    ).catch(() => {});

    // ── Notify the requester ──────────────────────────────────────────────
    await notify(
      io, [request.createdBy], 'donor_assigned',
      '✅ Donor Assigned Successfully',
      `A matching donor has been assigned for your request.\n\n` +
      `For coordination contact:\n` +
      `Rahul Tacholi – 9946709455\n` +
      `Abhinav PP – 8606839418\n` +
      `Shinantu – 8086849291\n\n` +
      `The admin team will coordinate the donation process securely.`,
      request._id
    );
    smsService.sendSMS(
      request.contactPhone,
      `✅ Donor Assigned Successfully\nA matching donor has been assigned for your request.\nFor coordination contact:\nRahul Tacholi – 9946709455\nAbhinav PP – 8606839418\nShinantu – 8086849291\nThe admin team will coordinate the donation process securely.`
    ).catch(() => {});

    res.json({ request: sanitizeRequests(request, req.user._id, req.user.role), message: 'Donor assigned successfully' });
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
      role: 'donor',
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
  getAssignedRequests,
  acceptRequest,
  rejectRequest,
  completeRequest,
  verifyRequestCompletion,
};
