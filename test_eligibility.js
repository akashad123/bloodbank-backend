require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const cases = [
  { name: 'Case 1', ageConfirmed: true, weight: 65, expected: true },
  { name: 'Case 2', ageConfirmed: false, weight: 65, expected: false },
  { name: 'Case 3', ageConfirmed: true, weight: 49, expected: false },
  { name: 'Case 4', ageConfirmed: false, weight: 49, expected: false },
  { name: 'Case 5', ageConfirmed: true, weight: 50, expected: true }
];

async function runTests() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bloodbank_test');
  
  for (const c of cases) {
    const user = new User({
      name: c.name,
      phone: Math.random().toString().slice(2, 12),
      passwordHash: 'dummy',
      donorEligibility: {
        ageConfirmed: c.ageConfirmed,
        weight: c.weight,
        eligibilityStatus: 'eligible', // Simulating a frontend that tries to force 'eligible'
        screenedAt: new Date()
      }
    });

    await user.save();
    console.log(`${c.name}: 18+=${c.ageConfirmed}, Weight=${c.weight}`);
    console.log(`  Expected Donor: ${c.expected}`);
    console.log(`  Actual Donor: ${user.isQualifiedDonor}`);
    if (user.isQualifiedDonor === c.expected) {
      console.log('  ✅ PASS');
    } else {
      console.log('  ❌ FAIL');
    }
  }
  
  await mongoose.disconnect();
}

runTests().catch(console.error);
