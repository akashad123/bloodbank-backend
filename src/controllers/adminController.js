const User = require('../models/User');
const Request = require('../models/Request');
const Notification = require('../models/Notification');

// ─── GET /api/admin/analytics ─────────────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const district = req.user.district;

    const [totalDonors, eligibleDonors, activeRequests, inactiveRequests, fulfilledRequests, totalRequests] =
      await Promise.all([
        User.countDocuments({ district, isQualifiedDonor: true }),
        User.countDocuments({ district, isEligibleToDonate: true, availabilityStatus: true }),
        Request.countDocuments({ district, status: { $in: ['pending', 'assigned', 'accepted', 'completed'] } }),
        Request.countDocuments({ district, status: { $in: ['fulfilled', 'cancelled'] } }),
        Request.countDocuments({ district, status: 'fulfilled' }),
        Request.countDocuments({ district }),
      ]);

    // Blood group breakdown
    const bloodGroupBreakdown = await User.aggregate([
      { $match: { district, isEligibleToDonate: true } },
      { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Recent requests (last 10)
    const recentRequests = await Request.find({ district })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('createdBy', 'name');

    res.json({
      district,
      stats: {
        totalDonors,
        eligibleDonors,
        activeRequests,
        inactiveRequests,
        totalRequests,
        fulfillmentRate: totalRequests > 0 ? ((fulfilledRequests / totalRequests) * 100).toFixed(1) : 0,
      },
      bloodGroupBreakdown,
      recentRequests,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Error fetching analytics' });
  }
};

// ─── GET /api/admin/users ─────────────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { bloodGroup, eligibleOnly, screeningStatus, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = { district: req.user.district, isQualifiedDonor: true };
    if (bloodGroup) query.bloodGroup = bloodGroup;
    if (eligibleOnly === 'true') { query.isEligibleToDonate = true; query.availabilityStatus = true; }

    // Filter by pre-screening eligibility status
    if (screeningStatus === 'eligible') {
      query['donorEligibility.eligibilityStatus'] = 'eligible';
    } else if (screeningStatus === 'ineligible') {
      query['donorEligibility.eligibilityStatus'] = 'ineligible';
    } else if (screeningStatus === 'none') {
      // Users who have not completed screening (null or missing subdocument)
      query['donorEligibility.eligibilityStatus'] = null;
    }

    const [users, total] = await Promise.all([
      User.find(query).select('-passwordHash').sort({ name: 1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// ─── PUT /api/admin/users/:id/toggle ──────────────────────────────────
const toggleUserAvailability = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, district: req.user.district });
    if (!user) return res.status(404).json({ message: 'User not found in your district' });

    user.availabilityStatus = !user.availabilityStatus;
    await user.save();

    res.json({ message: `User ${user.availabilityStatus ? 'enabled' : 'disabled'}`, user: user.toSafeObject() });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling user' });
  }
};

// ─── GET /api/admin/all-users ─────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const { search, bloodGroup, donorStatus, eligibility, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = { 
      district: req.user.district,
      role: { $nin: ['admin', 'super_admin', 'district_admin'] } 
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (bloodGroup) query.bloodGroup = bloodGroup;

    if (donorStatus === 'qualified') query.isQualifiedDonor = true;
    else if (donorStatus === 'not_qualified') query.isQualifiedDonor = false;

    if (eligibility === 'eligible') query.isEligibleToDonate = true;
    else if (eligibility === 'waiting') query.donorStatus = 'Waiting Period Active';
    else if (eligibility === 'not_eligible') {
      query.isEligibleToDonate = false;
      query.donorStatus = { $ne: 'Waiting Period Active' };
    }

    const [users, total] = await Promise.all([
      User.find(query).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// ─── DELETE /api/admin/all-users/:id ──────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const district = req.user.district;

    const userToDelete = await User.findOne({ _id: userId, district });
    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found in your district' });
    }

    if (['admin', 'super_admin', 'district_admin'].includes(userToDelete.role)) {
      return res.status(403).json({ message: 'Cannot delete administrator accounts' });
    }

    // Validation: Check for active requests created by or assigned to this user
    const activeStatuses = ['pending', 'assigned', 'accepted', 'completed'];
    
    const activeRequests = await Request.findOne({
      $or: [
        { createdBy: userId, status: { $in: activeStatuses } },
        { assignedDonor: userId, status: { $in: activeStatuses } }
      ]
    });

    if (activeRequests) {
      return res.status(400).json({ 
        message: 'Cannot delete user. User is involved in an active blood request workflow.' 
      });
    }

    // Preserve historical donor references in fulfilled/cancelled requests
    await Request.updateMany(
      { assignedDonor: userId },
      { 
        $set: { 
          assignedDonorName: userToDelete.name,
          assignedDonorPhone: userToDelete.phone
        }
      }
    );

    // Note: Request.createdBy historical requests are naturally preserved 
    // by Request.contactName and Request.contactPhone.

    // Delete associated Notification and Certificate records
    const Certificate = require('../models/Certificate');
    await Notification.deleteMany({ recipient: userId });
    await Certificate.deleteMany({ donorId: userId });

    // Finally, delete the user account
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

module.exports = { getAnalytics, getUsers, toggleUserAvailability, getAllUsers, deleteUser };
