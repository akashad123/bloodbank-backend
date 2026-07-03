const { v4: uuidv4 } = require('uuid');
const Certificate = require('../models/Certificate');

// ─── Helper: Generate unique certificate ID ────────────────────────────────────
// Format: DYFI-YYYYMM-XXXX (e.g. DYFI-202506-A3F7)
const generateCertificateId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const unique = uuidv4().replace(/-/g, '').toUpperCase().slice(0, 6);
  return `DYFI-${year}${month}-${unique}`;
};

// ─── Internal: Create certificate after fulfillment ───────────────────────────
// Called directly from requestController — not exposed as HTTP endpoint.
const createCertificateForDonor = async ({ donorId, donorName, bloodGroup, district, hospital, requestId, donationDate }) => {
  try {
    const certificateId = generateCertificateId();

    const cert = await Certificate.create({
      certificateId,
      donorId,
      donorName,
      bloodGroup,
      district,
      hospital,
      requestId,
      donationDate: donationDate || new Date(),
    });

    console.log(`[Certificate] Created: ${certificateId} for donor ${donorName} (${donorId})`);
    return cert;
  } catch (err) {
    // Non-fatal — log but don't crash the fulfillment flow
    console.error('[Certificate] Creation failed (non-fatal):', err.message);
    return null;
  }
};

// ─── GET /api/certificates/my ─────────────────────────────────────────────────
// Returns all certificates belonging to the authenticated donor.
const getMyCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find({ donorId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('requestId', 'hospital district bloodGroup units');

    res.json({ certificates, total: certificates.length });
  } catch (err) {
    console.error('[GET /certificates/my] error:', err);
    res.status(500).json({ message: 'Error fetching certificates' });
  }
};

// ─── GET /api/certificates/:id ────────────────────────────────────────────────
// Returns a single certificate — only accessible by the owning donor or admin.
const getCertificateById = async (req, res) => {
  try {
    const cert = await Certificate.findOne({ certificateId: req.params.id })
      .populate('donorId', 'name email')
      .populate('requestId', 'hospital district bloodGroup units');

    if (!cert) return res.status(404).json({ message: 'Certificate not found' });

    // Ownership check
    const isOwner = cert.donorId._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ certificate: cert });
  } catch (err) {
    console.error('[GET /certificates/:id] error:', err);
    res.status(500).json({ message: 'Error fetching certificate' });
  }
};

// ─── GET /api/certificates/count ─────────────────────────────────────────────
// Quick count for dashboard widgets.
const getMyCertificateCount = async (req, res) => {
  try {
    const count = await Certificate.countDocuments({ donorId: req.user._id });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching count' });
  }
};

// ─── GET /api/certificates/unseen-count ──────────────────────────────────────
// Returns the count of certificates not yet seen by the donor.
// Used to power the sidebar badge on the Certificates menu item.
const getUnseenCertificateCount = async (req, res) => {
  try {
    const count = await Certificate.countDocuments({
      donorId: req.user._id,
      isSeenByCertOwner: false,
    });
    res.json({ count });
  } catch (err) {
    console.error('[GET /certificates/unseen-count] error:', err);
    res.status(500).json({ message: 'Error fetching unseen certificate count' });
  }
};

// ─── PUT /api/certificates/mark-seen ─────────────────────────────────────────
// Marks all of the donor's certificates as seen, clearing the sidebar badge.
// Called automatically when the donor visits the Certificates page.
const markAllCertificatesSeen = async (req, res) => {
  try {
    await Certificate.updateMany(
      { donorId: req.user._id, isSeenByCertOwner: false },
      { isSeenByCertOwner: true }
    );
    res.json({ message: 'All certificates marked as seen' });
  } catch (err) {
    console.error('[PUT /certificates/mark-seen] error:', err);
    res.status(500).json({ message: 'Error marking certificates as seen' });
  }
};

module.exports = {
  createCertificateForDonor,
  getMyCertificates,
  getCertificateById,
  getMyCertificateCount,
  getUnseenCertificateCount,
  markAllCertificatesSeen,
};

