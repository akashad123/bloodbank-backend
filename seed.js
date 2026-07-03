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

    for (let i = 0; i < KERALA_DISTRICTS.length; i++) {
      const district = KERALA_DISTRICTS[i];
      const emailSlug = district.toLowerCase().replace(/\s+/g, '');
      const email = `admin.${emailSlug}@bloodbank.kerala`;

      // Each district admin gets a unique phone number (9000000001 to 9000000014)
      // Pad index+1 to ensure valid Indian mobile format starting with 9
      const phone = `900000000${String(i + 1).padStart(1, '0')}`;
      // For i >= 9: 9000000010 etc.
      const adminPhone = i < 9 ? `900000000${i + 1}` : `90000000${i + 1}`;

      const existing = await User.findOne({ email });
      if (existing) {
        console.log(`⏭  Admin already exists: ${email}`);
        continue;
      }

      // Check if phone already taken (re-seed safety)
      const phoneExists = await User.findOne({ phone: adminPhone });
      if (phoneExists) {
        console.log(`⏭  Phone already in use for: ${district}`);
        continue;
      }

      await User.create({
        name: `${district} Admin`,
        email,
        phone: adminPhone,
        passwordHash: password, // pre-save hook hashes this
        role: 'admin',
        bloodGroup: 'O+',
        district,
      });

      console.log(`✅ Created admin: ${email} | Phone: ${adminPhone}`);
    }

    console.log('\n🎉 All 14 district admins seeded!');
    console.log(`🔑 Password for all: ${password}`);
    console.log('\nAdmin Login Credentials:');
    KERALA_DISTRICTS.forEach((d, i) => {
      const slug = d.toLowerCase().replace(/\s+/g, '');
      const phone = i < 9 ? `900000000${i + 1}` : `90000000${i + 1}`;
      console.log(`  ${d}: admin.${slug}@bloodbank.kerala | Phone: ${phone}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedAdmins();
