const express = require('express');
const router = express.Router();
const { getHospitalsByDistrict, getAllHospitals } = require('../controllers/hospitalController');

router.get('/', getAllHospitals);
router.get('/:district', getHospitalsByDistrict);

module.exports = router;
