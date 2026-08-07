const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Automatically migrate and recalculate eligibility/status for all users
    const User = require('../models/User');
    const allUsers = await User.find({});

    for (const u of allUsers) {
      if (u.role === 'user') {
        const hasEligibility = u.donorEligibility && u.donorEligibility.eligibilityStatus;
        u.role = hasEligibility ? 'donor' : 'requester';
      }
      // Trigger pre-save hook to update isEligible and donorStatus
      await u.save();
    }

  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
