// src/scripts/migrateLanding.js
// One-shot, idempotent migration: back-fills `landing.draft` and
// `landing.published` on every clinic from its existing profile fields
// (currently `description`) and applies safe defaults for the new merged
// landing-page settings. Safe to re-run at any time.
//
// Usage:  cd backend && node src/scripts/migrateLanding.js
// (requires MONGO_URI in backend/.env)

import dotenv from "dotenv";
import mongoose from "mongoose";
import Clinic from "../models/clinicModel.js";
import { landingUpdateFromClinic } from "../utils/landingMigration.js";

dotenv.config();

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not set in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`🍃 Connected: ${mongoose.connection.host}`);

  const cursor = Clinic.find({}).cursor();
  let updated = 0;
  let skipped = 0;

  for await (const clinic of cursor) {
    const landing = landingUpdateFromClinic(clinic.toObject());
    const before = JSON.stringify(clinic.landing || {});
    const after = JSON.stringify(landing);
    if (before === after) {
      skipped += 1;
      continue;
    }
    clinic.landing = landing;
    await clinic.save();
    updated += 1;
  }

  console.log(`✅ Migration complete. ${updated} updated, ${skipped} already current.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("💥 Migration failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});