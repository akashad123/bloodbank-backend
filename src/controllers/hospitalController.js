const Hospital = require('../models/Hospital');
const { DISTRICT_HOSPITALS } = require('../config/constants');

// ─── GET /api/hospitals/:district ────────────────────────────────────────────
const getHospitalsByDistrict = async (req, res) => {
  try {
    const { district } = req.params;

    // Fast path: use constants (avoids DB round-trip for known districts)
    const staticList = DISTRICT_HOSPITALS[district];
    if (staticList) {
      return res.json({ hospitals: staticList.map((name) => ({ name, district })) });
    }

    // Fallback: query MongoDB (handles any admin-added hospitals)
    const hospitals = await Hospital.find({ district })
      .select('name -_id')
      .sort({ name: 1 })
      .lean();

    if (!hospitals.length) {
      return res.status(404).json({ message: `No hospitals found for district: ${district}` });
    }

    res.json({ hospitals });
  } catch (error) {
    console.error('[GET /hospitals/:district] error:', error);
    res.status(500).json({ message: 'Error fetching hospitals' });
  }
};

// ─── GET /api/hospitals (all districts) ─────────────────────────────────────
const getAllHospitals = async (req, res) => {
  try {
    // Return the full static map grouped by district
    const result = Object.entries(DISTRICT_HOSPITALS).map(([district, names]) => ({
      district,
      hospitals: names.map((name) => ({ name, district })),
    }));
    res.json({ districts: result });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hospitals' });
  }
};

module.exports = { getHospitalsByDistrict, getAllHospitals };
