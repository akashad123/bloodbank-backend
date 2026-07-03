const Hospital = require('../models/Hospital');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a lean hospital object safe to return to clients.
 */
const formatHospital = (h) => ({
  _id:       h._id,
  name:      h.name,
  district:  h.district,
  address:   h.address,
  phone:     h.phone,
  email:     h.email || '',
  status:    h.status,
  createdBy: h.createdBy,
  createdAt: h.createdAt,
  updatedAt: h.updatedAt,
});

// ─── PUBLIC ENDPOINTS ─────────────────────────────────────────────────────────

/**
 * GET /api/hospitals/:district
 * Public — returns active, non-deleted hospitals for a district.
 * Used by CreateRequest / EditRequest dropdowns.
 */
const getHospitalsByDistrict = async (req, res) => {
  try {
    const { district } = req.params;
    const hospitals = await Hospital.find({
      district,
      status: 'active',
      isDeleted: false,
    })
      .select('name district -_id')
      .sort({ name: 1 })
      .lean();

    res.json({ hospitals });
  } catch (error) {
    console.error('[GET /hospitals/:district] error:', error);
    res.status(500).json({ message: 'Error fetching hospitals' });
  }
};

/**
 * GET /api/hospitals
 * Public — returns all districts with their active hospitals.
 * Kept for chatbot / lookup purposes.
 */
const getAllHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find({ status: 'active', isDeleted: false })
      .select('name district -_id')
      .sort({ district: 1, name: 1 })
      .lean();

    // Group by district
    const grouped = {};
    hospitals.forEach((h) => {
      if (!grouped[h.district]) grouped[h.district] = [];
      grouped[h.district].push({ name: h.name, district: h.district });
    });

    const result = Object.entries(grouped).map(([district, list]) => ({
      district,
      hospitals: list,
    }));

    res.json({ districts: result });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hospitals' });
  }
};

// ─── ADMIN ENDPOINTS ──────────────────────────────────────────────────────────

/**
 * GET /api/hospitals/admin/my
 * Admin-only — returns ALL (active + inactive, non-deleted) hospitals
 * in the requesting admin's district.
 */
const getAdminHospitals = async (req, res) => {
  try {
    const { district } = req.user;
    const hospitals = await Hospital.find({ district, isDeleted: false })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ hospitals: hospitals.map(formatHospital) });
  } catch (error) {
    console.error('[GET /hospitals/admin/my] error:', error);
    res.status(500).json({ message: 'Error fetching hospitals' });
  }
};

/**
 * POST /api/hospitals/admin
 * Admin-only — create a new hospital in the admin's district.
 * District is always auto-filled from req.user.district (cannot be overridden).
 * Validates: no duplicate name within the same district.
 */
const createHospital = async (req, res) => {
  try {
    const { district } = req.user;
    const { name, address, phone, email, status } = req.body;

    // Required field validation
    if (!name?.trim())    return res.status(400).json({ message: 'Hospital name is required' });
    if (!address?.trim()) return res.status(400).json({ message: 'Address is required' });
    if (!phone?.trim())   return res.status(400).json({ message: 'Contact number is required' });

    // Duplicate name check within same district (case-insensitive)
    const exists = await Hospital.findOne({
      district,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      isDeleted: false,
    });
    if (exists) {
      return res.status(409).json({
        message: `A hospital named "${name.trim()}" already exists in ${district}`,
      });
    }

    const hospital = await Hospital.create({
      name:      name.trim(),
      district,
      address:   address.trim(),
      phone:     phone.trim(),
      email:     email?.trim() || '',
      status:    status || 'active',
      createdBy: req.user._id,
    });

    res.status(201).json({ hospital: formatHospital(hospital) });
  } catch (error) {
    console.error('[POST /hospitals/admin] error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Hospital name already exists in this district' });
    }
    res.status(500).json({ message: 'Error creating hospital' });
  }
};

/**
 * PUT /api/hospitals/admin/:id
 * Admin-only — update a hospital. District is locked and cannot be changed.
 * Admin can only update hospitals within their own district.
 */
const updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const { district } = req.user;
    const { name, address, phone, email, status } = req.body;

    // Find hospital and verify district ownership
    const hospital = await Hospital.findOne({ _id: id, isDeleted: false });
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }
    if (hospital.district !== district) {
      return res.status(403).json({ message: 'You can only manage hospitals in your district' });
    }

    // If name is changing, check for duplicates
    if (name?.trim() && name.trim().toLowerCase() !== hospital.name.toLowerCase()) {
      const exists = await Hospital.findOne({
        district,
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        isDeleted: false,
        _id: { $ne: id },
      });
      if (exists) {
        return res.status(409).json({
          message: `A hospital named "${name.trim()}" already exists in ${district}`,
        });
      }
    }

    // Apply updates — district field is deliberately excluded
    if (name?.trim())    hospital.name    = name.trim();
    if (address?.trim()) hospital.address = address.trim();
    if (phone?.trim())   hospital.phone   = phone.trim();
    if (email !== undefined) hospital.email = email?.trim() || '';
    if (status)          hospital.status  = status;

    await hospital.save();
    res.json({ hospital: formatHospital(hospital) });
  } catch (error) {
    console.error('[PUT /hospitals/admin/:id] error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Hospital name already exists in this district' });
    }
    res.status(500).json({ message: 'Error updating hospital' });
  }
};

/**
 * DELETE /api/hospitals/admin/:id
 * Admin-only — soft delete. Sets isDeleted = true.
 * Hospital disappears from all dropdowns and public listings.
 * Admin can only delete hospitals in their own district.
 */
const deleteHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const { district } = req.user;

    const hospital = await Hospital.findOne({ _id: id, isDeleted: false });
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }
    if (hospital.district !== district) {
      return res.status(403).json({ message: 'You can only manage hospitals in your district' });
    }

    hospital.isDeleted = true;
    await hospital.save();

    res.json({ message: `"${hospital.name}" has been removed successfully` });
  } catch (error) {
    console.error('[DELETE /hospitals/admin/:id] error:', error);
    res.status(500).json({ message: 'Error deleting hospital' });
  }
};

module.exports = {
  getHospitalsByDistrict,
  getAllHospitals,
  getAdminHospitals,
  createHospital,
  updateHospital,
  deleteHospital,
};
