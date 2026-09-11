import mongoose from "mongoose";

// A clinic registration that has been submitted but NOT yet email-verified.
// The real Clinic + CLINIC_ADMIN documents are only created once the emailed
// verification code is confirmed (see tenantRoutes /register/verify). Storing
// the pending submission here — rather than creating a disabled clinic — keeps
// unverified/abandoned attempts out of the live collections entirely.
//
// Security notes:
// - `codeHash` is a bcrypt hash; the plain code is never stored or logged.
// - `admin.passwordHash` is already-bcrypt-hashed at initiate time, so the raw
//   password is never persisted here either.
// - `purgeAt` drives a TTL index so abandoned records self-delete.
const pendingRegistrationSchema = new mongoose.Schema(
  {
    // Admin email that receives the code; one active pending record per email.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    // Clinic profile captured at submit time.
    clinicName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true, maxlength: 600 },
    contactNumber: { type: String, default: "", trim: true },
    admin: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, default: "", trim: true },
      // bcrypt hash — NOT the plaintext password.
      passwordHash: { type: String, required: true },
    },
    // bcrypt hash of the current verification code.
    codeHash: { type: String, required: true },
    codeExpiresAt: { type: Date, required: true },

    // Subscription selected and PAID up-front at initiate time (before the
    // Clinic/Subscription records exist). The real subscription is created on
    // verify using this pre-charged payment. No real card data is stored.
    subscriptionPlanKey: { type: String, default: "" },
    planName: { type: String, default: "" },
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    payment: {
      providerRef: { type: String, default: "" }, // ch_test_...
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "PHP" },
      testToken: { type: String, default: "" },
      type: { type: String, default: "card" }, // card | gcash | paymaya | bank
      provider: { type: String, default: "" },
      brand: { type: String, default: "" },
      last4: { type: String, default: "" },
      paidAt: { type: Date },
    },
    // Wrong-code attempts against the CURRENT code (reset when a new code is sent).
    attempts: { type: Number, default: 0 },
    // How many times a fresh code has been re-sent for this registration.
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    // Hard expiry for the whole pending record (TTL index below).
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL: Mongo removes the document once `purgeAt` passes.
pendingRegistrationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PendingClinicRegistration", pendingRegistrationSchema);
