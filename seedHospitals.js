/**
 * seedHospitals.js
 * ─────────────────────────────────────────────────────────────────────
 * One-time migration: seeds the static DISTRICT_HOSPITALS constants
 * into MongoDB so district admins can manage them going forward.
 *
 * Usage:
 *   node seedHospitals.js
 *
 * Safe to re-run — uses upsert, existing records are not duplicated.
 * ─────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('./src/models/Hospital');
const { DISTRICT_HOSPITALS } = require('./src/config/constants');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    let created = 0;
    let skipped = 0;

    for (const [district, hospitalNames] of Object.entries(DISTRICT_HOSPITALS)) {
      for (const name of hospitalNames) {
        try {
          // Use updateOne with upsert to avoid duplicate key errors on re-run
          const result = await Hospital.updateOne(
            { district, name },
            {
              $setOnInsert: {
                name,
                district,
                address: `${district}, Kerala`,   // Placeholder — admin can update
                phone:   '0000000000',             // Placeholder — admin should update
                email:   '',
                status:  'active',
                isDeleted: false,
              },
            },
            { upsert: true }
          );

          if (result.upsertedCount > 0) {
            console.log(`  ✅ Created: ${name} (${district})`);
            created++;
          } else {
            console.log(`  ⏭  Exists:  ${name} (${district})`);
            skipped++;
          }
        } catch (err) {
          console.error(`  ❌ Error for ${name} (${district}):`, err.message);
        }
      }
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`🎉 Seeding complete!`);
    console.log(`   Created: ${created} hospitals`);
    console.log(`   Skipped: ${skipped} (already existed)`);
    console.log('─────────────────────────────────────────');
    console.log('\n⚠️  Note: Seeded hospitals have placeholder address/phone.');
    console.log('   District admins should update them via the Admin → Hospitals panel.\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
};

seed();
