require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const { KERALA_DISTRICTS } = require('./src/config/constants');

const seedAdmins = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding...\n');

    const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';

    for (const district of KERALA_DISTRICTS) {
      const emailSlug = district.toLowerCase().replace(/\s+/g, '');
      const email = `admin.${emailSlug}@bloodbank.kerala`;

      const existing = await User.findOne({ email });
      if (existing) {
        console.log(`⏭  Admin already exists: ${email}`);
        continue;
      }

      await User.create({
        name: `${district} Admin`,
        email,
        phone: '9000000000',
        passwordHash: password, // pre-save hook hashes it
        role: 'admin',
        bloodGroup: 'O+',
        district,
      });

      console.log(`✅ Created admin: ${email}`);
    }

    console.log('\n🎉 All 14 district admins seeded!');
    console.log(`🔑 Password for all: ${password}`);
    console.log('\nAdmin Emails:');
    KERALA_DISTRICTS.forEach((d) => {
      const slug = d.toLowerCase().replace(/\s+/g, '');
      console.log(`  admin.${slug}@bloodbank.kerala`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedAdmins();
