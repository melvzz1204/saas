// src/scripts/seedDemo.js
// Creates ONE demo clinic + clinic admin + dentist + staff + patient.
// Idempotent: re-running updates instead of duplicating.
// CLI: node src/scripts/seedDemo.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import Staff from "../models/staffModel.js";

const DEMO = {
  clinic: { name: "Demo Smile Dental Clinic", slug: "demo-smile-dental" },
  admin: { firstName: "Demo", lastName: "Admin", email: "demo.admin@dentacloud.test", password: "Demo1234!" },
  dentist: { fullName: "Demo Dentist", email: "demo.dentist@dentacloud.test", pin: "123456" },
  staff: { fullName: "Demo Staff", email: "demo.staff@dentacloud.test", pin: "123456" },
  patient: { firstName: "Demo", lastName: "Patient", email: "demo.patient@dentacloud.test", password: "Demo1234!" },
};

async function main() {
  const dotenv = await import("dotenv");
  dotenv.default.config();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing in backend/.env");
  await mongoose.connect(process.env.MONGO_URI);

  // 1. Clinic (Approved so logins + booking work immediately)
  const clinic = await Clinic.findOneAndUpdate(
    { slug: DEMO.clinic.slug },
    {
      $set: {
        name: DEMO.clinic.name,
        slug: DEMO.clinic.slug,
        address: "123 Demo St, Quezon City",
        contactNumber: "09171234567",
        description: "Demo clinic for testing.",
        isActive: true,
        applicationStatus: "Approved",
        slotDurationMinutes: 30,
      },
      $setOnInsert: {
        operatingHours: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => ({
          day, openTime: "09:00", closeTime: "17:00", isClosed: false,
        })).concat([{ day: "Sunday", openTime: "09:00", closeTime: "17:00", isClosed: true }]),
      },
    },
    { upsert: true, new: true },
  );

  const pwHash = await bcrypt.hash(DEMO.admin.password, 10);
  const patientHash = await bcrypt.hash(DEMO.patient.password, 10);

  // 2. Clinic admin (User, password login)
  await User.findOneAndUpdate(
    { email: DEMO.admin.email },
    {
      $set: {
        clinicId: clinic._id, firstName: DEMO.admin.firstName, lastName: DEMO.admin.lastName,
        email: DEMO.admin.email, phone: "09171234567", role: "CLINIC_ADMIN",
        password: pwHash, isActive: true,
      },
    },
    { upsert: true },
  );

  // 3. Dentist (Staff, PIN login)
  await Staff.findOneAndUpdate(
    { email: DEMO.dentist.email },
    {
      $set: {
        clinicId: clinic._id, fullName: DEMO.dentist.fullName, role: "Dentist",
        specialization: "General Dentistry", email: DEMO.dentist.email,
        phone: "09171234568", accessPin: DEMO.dentist.pin, status: "Active",
        licenseNumber: "DEMO-DENT-001", experienceYears: 5,
        bio: "Demo dentist account.",
      },
    },
    { upsert: true },
  );

  // 4. Staff / receptionist (Staff, PIN login)
  await Staff.findOneAndUpdate(
    { email: DEMO.staff.email },
    {
      $set: {
        clinicId: clinic._id, fullName: DEMO.staff.fullName, role: "Staff",
        email: DEMO.staff.email, phone: "09171234569",
        accessPin: DEMO.staff.pin, status: "Active", bio: "Demo front-desk account.",
      },
    },
    { upsert: true },
  );

  // 5. Patient (User, password login)
  await User.findOneAndUpdate(
    { email: DEMO.patient.email },
    {
      $set: {
        clinicId: clinic._id, firstName: DEMO.patient.firstName, lastName: DEMO.patient.lastName,
        email: DEMO.patient.email, phone: "09171234570", role: "PATIENT",
        password: patientHash, isActive: true,
      },
    },
    { upsert: true },
  );

  console.log("DEMO_SEED_OK", JSON.stringify({
    clinic: `${clinic.name} (${clinic.slug}) [${clinic._id}]`,
    admin: `${DEMO.admin.email} / ${DEMO.admin.password}`,
    dentist: `${DEMO.dentist.email} / PIN ${DEMO.dentist.pin}`,
    staff: `${DEMO.staff.email} / PIN ${DEMO.staff.pin}`,
    patient: `${DEMO.patient.email} / ${DEMO.patient.password}`,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("DEMO_SEED_FAIL:", e?.message || e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
