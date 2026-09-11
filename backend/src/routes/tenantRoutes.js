import bcrypt from "bcryptjs";
import express from "express";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import PendingRegistration from "../models/pendingRegistrationModel.js";
import { uploadDocuments } from "../middlewares/uploadMiddleware.js";
import {
  protectRoute,
} from "../middlewares/authMiddleware.js";
import { sanitizeLanding, PRESET_NAMES, DEFAULT_PRESET } from "../utils/landingSanitize.js";
import { defaultLandingConfig, backfillLandingProfile } from "../utils/landingMigration.js";
import {
  generateCode,
  hashCode,
  compareCode,
  codeExpiryDate,
  pendingPurgeDate,
  isWellFormedCode,
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  MAX_RESENDS,
} from "../utils/verificationCode.js";
import { sendVerificationEmail, sendSubscriptionActiveEmail } from "../services/emailService.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { SubscriptionPlan } from "../models/billingModels.js";
import { getGateway, TEST_TOKENS, testMethodFromToken } from "../services/billing/gateway.js";
import { activatePaidSubscriptionForRegistration } from "../services/billing/billingService.js";
import { money, addCycle } from "../services/billing/helpers.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Must match the directory used by uploadMiddleware / exposed by app.js.
const LANDING_UPLOAD_DIR = path.resolve(__dirname, "../../uploads/documents");

// ==========================================
// 🏥 SECURE, EMAIL-VERIFIED CLINIC REGISTRATION
// The Clinic + CLINIC_ADMIN are created ONLY after the emailed code is verified.
//   POST /register            -> initiate (legacy alias, kept for compatibility)
//   POST /register/initiate   -> validate + email a code + store a pending record
//   POST /register/verify     -> confirm the code + create the clinic & admin
//   POST /register/resend     -> resend a fresh code (rate limited)
// ==========================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Validate + sanitize the registration payload. Returns { value } or { error }.
function validateRegistration(body) {
  const b = body && typeof body === "object" ? body : {};
  const admin = b.adminData && typeof b.adminData === "object" ? b.adminData : {};

  const clinicName = String(b.clinicName || "").trim();
  const slug = String(b.slug || "").trim().toLowerCase();
  const address = String(b.address || "").trim();
  const description = String(b.description || "").trim();
  const firstName = String(admin.firstName || "").trim();
  const lastName = String(admin.lastName || "").trim();
  const email = String(admin.email || "").trim().toLowerCase();
  const contactNumber = String(admin.contactNumber || admin.phone || "").trim();
  const password = String(admin.password || "");

  if (clinicName.length < 2 || clinicName.length > 120)
    return { error: "Clinic name must be between 2 and 120 characters." };
  if (!SLUG_RE.test(slug) || slug.length > 80)
    return { error: "Clinic URL may only contain lowercase letters, numbers, and hyphens." };
  if (!address || address.length > 200)
    return { error: "A clinic address is required (max 200 characters)." };
  if (description.length > 600)
    return { error: "Clinic description must be 600 characters or fewer." };
  if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60)
    return { error: "Administrator first and last name are required." };
  if (!EMAIL_RE.test(email) || email.length > 160)
    return { error: "A valid administrator email address is required." };
  if (!contactNumber || contactNumber.length > 30)
    return { error: "A valid contact number is required." };
  if (password.length < 8 || password.length > 128)
    return { error: "Password must be at least 8 characters." };

  return {
    value: {
      clinicName,
      slug,
      address,
      description,
      contactNumber,
      admin: { firstName, lastName, email, phone: contactNumber, password },
    },
  };
}

// Create the real Clinic + CLINIC_ADMIN. `admin.passwordHash` is ALREADY a
// bcrypt hash. Re-checks uniqueness to guard the initiate->verify race.
async function createClinicWithAdmin(data) {
  const { clinicName, slug, address, description, contactNumber, admin } = data;

  const [clinicExists, userExists] = await Promise.all([
    Clinic.findOne({ slug }).select("_id").lean(),
    User.findOne({ email: admin.email }).select("_id").lean(),
  ]);
  if (clinicExists) return { error: "This clinic URL is already taken.", status: 409 };
  if (userExists) return { error: "An account with this email already exists.", status: 409 };

  let newClinic;
  try {
    newClinic = await Clinic.create({
      name: clinicName,
      slug,
      address,
      description,
      contactNumber,
      isActive: true,
      landing: {
        draft: defaultLandingConfig({ description }, DEFAULT_PRESET),
        published: defaultLandingConfig({ description }, DEFAULT_PRESET),
      },
    });
  } catch (err) {
    // Initiate->verify race: another request claimed the slug after our check.
    if (err && err.code === 11000)
      return { error: "This clinic URL is already taken.", status: 409 };
    throw err;
  }

  try {
    const newAdmin = await User.create({
      clinicId: newClinic._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      phone: admin.phone,
      password: admin.passwordHash, // already a bcrypt hash
      role: "CLINIC_ADMIN",
      isActive: true,
    });
    return { clinic: newClinic, admin: newAdmin };
  } catch (err) {
    await Clinic.findByIdAndDelete(newClinic._id).catch(() => {});
    if (err && err.code === 11000)
      return { error: "An account with this email already exists.", status: 409 };
    throw err;
  }
}

// Non-sensitive projection of a pending record for the client (never the code).
function pendingPublic(pending) {
  const now = Date.now();
  return {
    pendingId: pending._id,
    email: pending.email,
    expiresInSeconds: Math.max(
      Math.round((new Date(pending.codeExpiresAt).getTime() - now) / 1000),
      0,
    ),
    attemptsRemaining: Math.max(MAX_VERIFY_ATTEMPTS - pending.attempts, 0),
    resendsRemaining: Math.max(MAX_RESENDS - pending.resendCount, 0),
    resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

// Per-IP abuse protection.
const initiateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many registration attempts. Please wait a few minutes and try again.",
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many verification attempts. Please wait a few minutes and try again.",
});
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many code requests. Please wait a few minutes and try again.",
});

async function initiateHandler(req, res) {
  try {
    const { value, error } = validateRegistration(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    // Duplicate checks against LIVE collections.
    const [clinicExists, userExists] = await Promise.all([
      Clinic.findOne({ slug: value.slug }).select("_id").lean(),
      User.findOne({ email: value.admin.email }).select("_id").lean(),
    ]);
    if (userExists)
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please sign in instead.",
      });
    if (clinicExists)
      return res.status(409).json({
        success: false,
        message: "This clinic URL is already taken. Please choose another.",
      });

    // Per-email send cooldown (guards against email bombing via repeated initiate).
    const existing = await PendingRegistration.findOne({ email: value.admin.email });
    if (existing) {
      const waitMs =
        RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - new Date(existing.lastSentAt).getTime());
      if (waitMs > 0)
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        });
      // A paid pending is still alive: do NOT silently charge again. Point the
      // client at verify/resend so a retry never double-charges for the same
      // email+slug. Pass allowRecharge:true to intentionally start over.
      const stillAlive =
        existing.payment?.providerRef &&
        existing.purgeAt &&
        new Date(existing.purgeAt).getTime() > Date.now();
      if (stillAlive && existing.slug === value.slug && !req.body?.allowRecharge) {
        return res.status(409).json({
          success: false,
          message:
            "You already have a pending registration with a completed payment. Enter the code we emailed, or resend a new code instead of paying again.",
          data: {
            pendingId: existing._id,
            email: existing.email,
            paymentRef: existing.payment?.providerRef,
          },
        });
      }
    }

    // ---- Subscription plan + up-front payment (SIMULATED gateway) ----
    // Payment happens BEFORE the account is created. Only on a successful charge
    // do we store the pending registration and send the verification code.
    // Single fixed product: Professional ₱3,000/mo or ₱25,000/yr.
    // planKey from the client is ignored (kept for backward compat).
    const billingCycle = ["monthly", "yearly"].includes(req.body.billingCycle) ? req.body.billingCycle : "monthly";
    const testToken = String(req.body.testToken || "");
    let plan = await SubscriptionPlan.findOne({ key: "pro", isActive: true });
    if (!plan) {
      // Self-heal: boot seeding may have been skipped or failed (e.g. the
      // server started before this migration). Re-seed once and retry before
      // telling the user the plan is unavailable.
      try {
        const { seedPlans } = await import("../scripts/seedBilling.js");
        await seedPlans();
        plan = await SubscriptionPlan.findOne({ key: "pro", isActive: true });
      } catch (seedErr) {
        console.error("Plan self-heal seed failed:", seedErr.message);
      }
    }
    if (!plan)
      return res.status(400).json({ success: false, message: "The Professional plan is currently unavailable. Please try again." });
    if (!(testToken in TEST_TOKENS))
      return res.status(400).json({ success: false, message: "Please choose a (test) payment method." });

    const chargeAmount = money(billingCycle === "yearly" ? plan.prices.yearly : plan.prices.monthly);
    const method = testMethodFromToken(testToken);
    const charge = await getGateway().charge({ amount: chargeAmount, currency: plan.currency, method, forcedOutcome: "" });
    if (charge.status !== "succeeded") {
      const reason =
        charge.outcome === "delayed"
          ? "the payment is still processing — please use a method that settles immediately"
          : charge.failureMessage || "the payment was declined";
      return res.status(402).json({
        success: false,
        message: `Payment could not be completed: ${reason}. Your account was not created.`,
        data: { paymentOutcome: charge.outcome },
      });
    }

    const code = generateCode();
    const [passwordHash, codeHash] = await Promise.all([
      bcrypt.hash(value.admin.password, 10),
      hashCode(code),
    ]);
    const now = new Date();

    const doc = {
      email: value.admin.email,
      clinicName: value.clinicName,
      slug: value.slug,
      address: value.address,
      description: value.description,
      contactNumber: value.contactNumber,
      admin: {
        firstName: value.admin.firstName,
        lastName: value.admin.lastName,
        email: value.admin.email,
        phone: value.admin.phone,
        passwordHash,
      },
      codeHash,
      codeExpiresAt: codeExpiryDate(now),
      attempts: 0,
      resendCount: 0,
      lastSentAt: now,
      purgeAt: pendingPurgeDate(now),
      // Paid subscription captured for activation at verify time.
      subscriptionPlanKey: plan.key,
      planName: plan.name,
      billingCycle,
      payment: {
        providerRef: charge.providerRef,
        amount: chargeAmount,
        currency: plan.currency,
        testToken,
        type: method.type || "card",
        provider: method.provider || method.brand,
        brand: method.brand,
        last4: method.last4,
        paidAt: now,
      },
    };

    // A fresh initiate replaces any prior pending record for this email
    // (handles interrupted/abandoned attempts cleanly).
    const pending = await PendingRegistration.findOneAndUpdate(
      { email: value.admin.email },
      { $set: doc },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    try {
      await sendVerificationEmail({
        to: value.admin.email,
        code,
        clinicName: value.clinicName,
        ttlMinutes: CODE_TTL_MINUTES,
      });
    } catch (mailErr) {
      console.error("Verification email failed:", mailErr.message);
      // Payment already succeeded and the pending (with code hash) is stored.
      // Return the pendingId so the client can RESEND a code instead of
      // re-initiating (which would charge a second time).
      return res.status(502).json({
        success: false,
        message:
          "Payment was received but we couldn't send the verification email. Use Resend code instead of paying again.",
        data: {
          pendingId: pending._id,
          email: pending.email,
          paymentRef: pending.payment?.providerRef,
          ...pendingPublic(pending),
        },
      });
    }

    // Separate confirmation that the subscription has been paid & is active (best-effort).
    try {
      await sendSubscriptionActiveEmail({
        to: value.admin.email,
        clinicName: value.clinicName,
        planName: plan.name,
        amount: chargeAmount,
        currency: plan.currency,
        billingCycle,
        nextRenewalDate: addCycle(now, billingCycle),
        reference: charge.providerRef,
      });
    } catch (mailErr) {
      console.error("Subscription confirmation email failed:", mailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Payment received for the ${plan.name} plan. We sent a ${CODE_LENGTH}-digit verification code to ${value.admin.email}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      data: {
        ...pendingPublic(pending),
        plan: { key: plan.key, name: plan.name, billingCycle, amount: chargeAmount, currency: plan.currency },
        paymentRef: charge.providerRef,
      },
    });
  } catch (err) {
    console.error("Registration initiate error:", err);
    return res.status(500).json({
      success: false,
      message: "Could not start registration. Please try again.",
    });
  }
}

router.post("/register", initiateLimiter, initiateHandler);
router.post("/register/initiate", initiateLimiter, initiateHandler);

router.post("/register/verify", verifyLimiter, async (req, res) => {
  try {
    const { pendingId, code } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(pendingId || "")))
      return res.status(400).json({
        success: false,
        message: "Invalid or expired registration session. Please register again.",
      });
    if (!isWellFormedCode(String(code == null ? "" : code)))
      return res.status(400).json({
        success: false,
        message: `Enter the ${CODE_LENGTH}-digit code from your email.`,
      });

    const pending = await PendingRegistration.findById(pendingId);
    if (!pending)
      return res.status(404).json({
        success: false,
        message: "This registration session has expired. Please register again.",
      });

    if (new Date(pending.codeExpiresAt).getTime() < Date.now())
      return res.status(410).json({
        success: false,
        message: "This code has expired. Request a new one to continue.",
      });

    if (pending.attempts >= MAX_VERIFY_ATTEMPTS)
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new code.",
      });

    const ok = await compareCode(String(code).trim(), pending.codeHash);
    if (!ok) {
      pending.attempts += 1;
      await pending.save();
      const remaining = Math.max(MAX_VERIFY_ATTEMPTS - pending.attempts, 0);
      if (remaining <= 0)
        return res.status(429).json({
          success: false,
          message: "Too many incorrect attempts. Please request a new code.",
        });
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        data: { attemptsRemaining: remaining },
      });
    }

    // Correct code -> create the real clinic + admin, then invalidate the pending.
    const result = await createClinicWithAdmin({
      clinicName: pending.clinicName,
      slug: pending.slug,
      address: pending.address,
      description: pending.description,
      contactNumber: pending.contactNumber,
      admin: {
        firstName: pending.admin.firstName,
        lastName: pending.admin.lastName,
        email: pending.admin.email,
        phone: pending.admin.phone,
        passwordHash: pending.admin.passwordHash,
      },
    });

    if (result.error) {
      // Slug/email was taken between initiate and verify — discard the pending.
      // Surface the pre-paid paymentRef so support can reconcile/refund.
      const paymentRef = pending.payment?.providerRef || "";
      await PendingRegistration.deleteOne({ _id: pending._id }).catch(() => {});
      return res.status(result.status || 409).json({
        success: false,
        message: `${result.error} Your payment (${paymentRef}) is recorded — contact support for a refund or retry with a different URL.`,
        data: { paymentRef },
      });
    }

    // Single-use: deleting the pending permanently invalidates the code.
    await PendingRegistration.deleteOne({ _id: pending._id }).catch(() => {});

    // Bring the pre-paid subscription up as active (payment already happened
    // at initiate). Never let this fail the account creation — but never fail
    // silently either: any partial state is reported with the paymentRef so
    // support can reconcile without a second charge.
    let subscription = null;
    let activationWarning = "";
    const prepaidRef = pending.payment?.providerRef || "";
    if (pending.subscriptionPlanKey && prepaidRef) {
      try {
        const act = await activatePaidSubscriptionForRegistration({
          clinic: result.clinic,
          planKey: pending.subscriptionPlanKey,
          billingCycle: pending.billingCycle,
          payment: pending.payment,
          adminEmail: result.admin.email,
          actor: { type: "system" },
        });
        if (!act.error && act.subscription) {
          subscription = {
            status: act.subscription.status,
            planName: act.subscription.planName,
            amount: act.subscription.amount,
            currency: act.subscription.currency,
            nextRenewalDate: act.subscription.nextRenewalDate,
          };
          if (act.subscription.status !== "active") {
            activationWarning = `Subscription is ${act.subscription.status}, not active.`;
          }
        } else {
          activationWarning =
            act.error || "Subscription activation did not complete.";
        }
      } catch (subErr) {
        console.error("Subscription activation after verify failed:", subErr.message);
        activationWarning = `Subscription activation was interrupted (${subErr.message || "unknown error"}). Your payment ${prepaidRef} is recorded.`;
      }
    } else {
      activationWarning = "No prepaid payment was recorded for this registration.";
    }

    return res.status(201).json({
      success: true,
      message: subscription && subscription.status === "active"
        ? "Email verified. Your clinic workspace has been created and your subscription is active."
        : "Email verified. Your clinic workspace has been created. We received your payment but subscription activation needs attention — contact support with your payment reference. Do NOT pay again.",
      data: {
        _id: result.clinic._id,
        clinic: {
          _id: result.clinic._id,
          name: result.clinic.name,
          slug: result.clinic.slug,
        },
        admin: {
          _id: result.admin._id,
          email: result.admin.email,
          role: result.admin.role,
        },
        subscription,
        paymentRef: prepaidRef,
        activationWarning,
      },
    });
  } catch (err) {
    console.error("Registration verify error:", err);
    return res.status(500).json({
      success: false,
      message: "Could not verify the code. Please try again.",
    });
  }
});

router.post("/register/resend", resendLimiter, async (req, res) => {
  try {
    const { pendingId } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(String(pendingId || "")))
      return res.status(400).json({
        success: false,
        message: "Invalid or expired registration session. Please register again.",
      });

    const pending = await PendingRegistration.findById(pendingId);
    if (!pending)
      return res.status(404).json({
        success: false,
        message: "This registration session has expired. Please register again.",
      });

    if (pending.resendCount >= MAX_RESENDS)
      return res.status(429).json({
        success: false,
        message: "You've reached the resend limit. Please register again.",
      });

    const waitMs =
      RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - new Date(pending.lastSentAt).getTime());
    if (waitMs > 0)
      return res.status(429).json({
        success: false,
        message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });

    const code = generateCode();
    const now = new Date();
    pending.codeHash = await hashCode(code);
    pending.codeExpiresAt = codeExpiryDate(now);
    pending.attempts = 0; // fresh code -> fresh attempt budget
    pending.resendCount += 1;
    pending.lastSentAt = now;
    pending.purgeAt = pendingPurgeDate(now);
    await pending.save();

    try {
      await sendVerificationEmail({
        to: pending.email,
        code,
        clinicName: pending.clinicName,
        ttlMinutes: CODE_TTL_MINUTES,
      });
    } catch (mailErr) {
      console.error("Resend email failed:", mailErr.message);
      return res.status(502).json({
        success: false,
        message: "We couldn't resend the email right now. Please try again shortly.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `A new ${CODE_LENGTH}-digit code is on its way to ${pending.email}.`,
      data: pendingPublic(pending),
    });
  } catch (err) {
    console.error("Registration resend error:", err);
    return res.status(500).json({
      success: false,
      message: "Could not resend the code. Please try again.",
    });
  }
});

// ==========================================
// 🌐 ENDPOINT 2: Public Approved Clinic Directory
// GET /api/v1/tenants/public
// ==========================================
router.get("/public", async (req, res) => {
  try {
    const clinics = await Clinic.find({
      applicationStatus: "Approved",
      isActive: true,
    })
      .select("name slug description createdAt")
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();

  return res.status(200).json({
      success: true,
      data: clinics,
    });
  } catch (error) {
    console.error("Public Clinic Directory Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load the public clinic directory.",
    });
  }
});

// ==========================================
// 🔍 ENDPOINT 3: Resolve Location Context via Slug or ID
// GET /api/v1/tenants/slug/:identifier
// ==========================================
router.get("/slug/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    let clinicData = null;

    // Check if the identifier matches a 24-character hex MongoDB ObjectID structure
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);

    if (isObjectId) {
      clinicData = await Clinic.findById(identifier);
    } else {
      clinicData = await Clinic.findOne({
        slug: identifier.toLowerCase().trim(),
      });
    }

    if (!clinicData) {
      return res.status(404).json({
        success: false,
        message:
          "Target clinical location context not registered in our SaaS directory.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: clinicData._id,
        name: clinicData.name,
        slug: clinicData.slug,
      },
    });
  } catch (error) {
    console.error("SaaS Identity Resolution Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error resolving location context identifiers.",
    });
  }
});

// ==========================================
// 📊 ENDPOINT 3: Direct ID Lookup for Patient Dashboard
// GET /api/v1/tenants/:id
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Structural check to ensure it's a valid 24-character hexadecimal string
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location database context structure.",
      });
    }

    // 2. Query clinic collection
    const clinicData = await Clinic.findById(id);

    // 3. Fallback safety check
    if (!clinicData) {
      return res.status(404).json({
        success: false,
        message: "Target clinical location context not registered.",
      });
    }

    return res.status(200).json({
      success: true,
      data: clinicData,
    });
  } catch (error) {
    console.error("Dashboard Metadata Resolution Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error resolving location context identifiers.",
    });
  }
});

// Initial uploads right after email verification. This endpoint is intentionally
// unauthenticated (the new admin has no token yet), so it is tightly scoped:
// only Pending clinics with <2 docs and created recently may use it. Anything
// else must go through the authenticated resubmit-docs flow below.
router.post(
  "/:id/upload-docs",
  uploadDocuments.array("documents", 5),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid clinic id.",
        });
      }

      const existingClinic = await Clinic.findById(id)
        .select("applicationStatus submittedDocuments createdAt")
        .lean();
      if (!existingClinic) {
        return res.status(404).json({
          success: false,
          message: "Clinic not found.",
        });
      }
      if (existingClinic.applicationStatus !== "Pending") {
        return res.status(403).json({
          success: false,
          message:
            "Initial upload is only available while the application is Pending. Sign in to resubmit documents.",
        });
      }
      if ((existingClinic.submittedDocuments || []).length >= 2) {
        return res.status(409).json({
          success: false,
          message:
            "Documents were already submitted. Sign in as the clinic administrator to resubmit.",
        });
      }
      if (
        existingClinic.createdAt &&
        Date.now() - new Date(existingClinic.createdAt).getTime() >
          2 * 60 * 60 * 1000
      ) {
        return res.status(410).json({
          success: false,
          message:
            "This upload session has expired. Sign in as the clinic administrator to resubmit.",
        });
      }

      if (!req.files || req.files.length < 2) {
        return res.status(400).json({
          success: false,
          message:
            "Both Business License and Medical License documents are required.",
        });
      }

      const uploadedDocs = req.files.map((file, index) => ({
        documentName: file.originalname,
        documentType: index === 0 ? "Business License" : "Medical License",
        fileUrl: `${req.protocol}://${req.get("host")}/uploads/documents/${file.filename}`,
      }));

      const clinic = await Clinic.findByIdAndUpdate(
        id,
        {
          $push: { submittedDocuments: { $each: uploadedDocs } },
          $set: {
            applicationStatus: "Pending",
            rejectionReason: "",
          },
        },
        { new: true, runValidators: true },
      );

      return res.status(200).json({
        success: true,
        message:
          "Verification documents successfully submitted for SaaS review.",
        data: clinic,
      });
    } catch (error) {
      console.error("Document Upload Fault:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);
// Clinic administrators can resubmit corrected documents after a rejection.
router.post(
  "/:id/resubmit-docs",
  protectRoute,
  uploadDocuments.array("documents", 5),
  async (req, res) => {
    try {
      const { id } = req.params;
      const role = String(req.user?.role || "").toUpperCase();
      const ownsClinic = String(req.user?.clinicId || req.clinicId || "") === String(id);
      if (role !== "SUPER_ADMIN" && !(role === "CLINIC_ADMIN" && ownsClinic)) {
        return res.status(403).json({
          success: false,
          message: "Only the clinic administrator can resubmit this application.",
        });
      }
      const currentClinic = await Clinic.findById(id).select("applicationStatus").lean();
      if (currentClinic?.applicationStatus !== "Rejected" && role !== "SUPER_ADMIN") {
        return res.status(409).json({
          success: false,
          message: "Only rejected applications can be resubmitted.",
        });
      }
      if (!req.files || req.files.length !== 2) {
        return res.status(400).json({
          success: false,
          message: "Attach exactly two files: Business License first and Medical License second.",
        });
      }

      const uploadedDocs = req.files.map((file, index) => ({
        documentName: file.originalname,
        documentType: index === 0 ? "Business License" : "Medical License",
        fileUrl: `${req.protocol}://${req.get("host")}/uploads/documents/${file.filename}`,
      }));
      const clinic = await Clinic.findByIdAndUpdate(
        id,
        {
          $push: { submittedDocuments: { $each: uploadedDocs } },
          $set: { applicationStatus: "Pending", rejectionReason: "" },
        },
        { new: true, runValidators: true },
      );
      if (!clinic)
        return res
          .status(404)
          .json({ success: false, message: "Clinic not found." });
      return res.status(200).json({
        success: true,
        message: "Corrected documents resubmitted for review.",
        data: clinic,
      });
    } catch (error) {
      console.error("Document Resubmission Fault:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

router.patch("/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { slotDurationMinutes, operatingHours, description } = req.body;

    // 1. Structural check to ensure it's a valid 24-character hexadecimal string
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location database context structure.",
      });
    }

    const role = String(req.user?.role || "").toUpperCase();
    const ownsClinic = String(req.user?.clinicId || req.clinicId || "") === String(id);
    console.log("[DASHBOARD-PATCH] role=", role, "| urlId=", id, "| user.clinicId=", req.user?.clinicId, "| req.clinicId=", req.clinicId, "| ownsClinic=", ownsClinic, "| user.id=", req.user?._id ?? req.user?.id);
    if (role !== "SUPER_ADMIN" && !(role === "CLINIC_ADMIN" && ownsClinic)) {
      return res.status(403).json({
        success: false,
        message: "Only the clinic administrator can update this profile.",
      });
    }

    if (description !== undefined && String(description).trim().length > 600) {
      return res.status(400).json({
        success: false,
        message: "Clinic description must be 600 characters or fewer.",
      });
    }

    const update = {};
    if (slotDurationMinutes !== undefined) update.slotDurationMinutes = slotDurationMinutes;
    if (operatingHours !== undefined) update.operatingHours = operatingHours;
    if (description !== undefined) update.description = String(description).trim();

    // 2. Update the clinic record in MongoDB
    const updatedClinic = await Clinic.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true },
    );

    // 3. Fallback safety check
    if (!updatedClinic) {
      return res.status(404).json({
        success: false,
        message: "Target clinical location context not registered.",
      });
    }

    // 4. Return clean JSON response
    return res.status(200).json({
      success: true,
      message: description !== undefined
        ? "Clinic profile updated successfully."
        : "Clinic schedule and slot duration updated successfully.",
      data: updatedClinic,
    });
  } catch (error) {
    console.error("Clinic Schedule Update Fault:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// 🎨 LANDING PAGE BUILDER (read / draft / publish / upload)
// ==========================================

// Owner guard shared by all landing routes.
function ownsClinicOr403(req, res, id) {
  const role = String(req.user?.role || "").toUpperCase();
  const owns = String(req.user?.clinicId || req.clinicId || "") === String(id);
  if (role !== "SUPER_ADMIN" && !(role === "CLINIC_ADMIN" && owns)) {
    res.status(403).json({
      success: false,
      message: "Only the clinic administrator can edit this landing page.",
    });
    return false;
  }
  return true;
}

// Read the combined landing + profile settings. Lazily back-fills migrated
// values from the clinic record so existing profiles are seamless.
router.get("/:id/landing", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid clinic id." });
    }
    if (!ownsClinicOr403(req, res, id)) return;

    const clinic = await Clinic.findById(id);
    if (!clinic)
      return res.status(404).json({ success: false, message: "Clinic not found." });

    const { draft, published, changed } = backfillLandingProfile(clinic);
    if (changed) {
      clinic.landing = { draft, published };
      await clinic.save({ validateBeforeSave: false });
    }

    return res.status(200).json({
      success: true,
      data: {
        draft,
        published,
        clinicDescription: clinic.description || "",
      },
    });
  } catch (error) {
    console.error("Landing read error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Save the working draft.
router.patch("/:id/landing", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid clinic id." });
    }
    if (!ownsClinicOr403(req, res, id)) return;

    const { value, error } = sanitizeLanding(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const clinic = await Clinic.findByIdAndUpdate(
      id,
      { $set: { "landing.draft": value } },
      { new: true, runValidators: true },
    );
    if (!clinic)
      return res.status(404).json({ success: false, message: "Clinic not found." });

    return res.status(200).json({
      success: true,
      message: "Landing page draft saved.",
      data: clinic.landing,
    });
  } catch (error) {
    console.error("Landing draft save error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Publish the draft: copy draft -> published.
router.post("/:id/landing/publish", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid clinic id." });
    }
    if (!ownsClinicOr403(req, res, id)) return;

    const clinic = await Clinic.findById(id);
    if (!clinic)
      return res.status(404).json({ success: false, message: "Clinic not found." });

    clinic.landing.published = clinic.landing.draft.toObject
      ? clinic.landing.draft.toObject()
      : clinic.landing.draft;
    await clinic.save();

    return res.status(200).json({
      success: true,
      message: "Landing page published.",
      data: clinic.landing,
    });
  } catch (error) {
    console.error("Landing publish error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Upload a landing image (logo or content block). Returns a servable URL.
router.post(
  "/:id/landing/upload",
  protectRoute,
  uploadDocuments.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ownsClinicOr403(req, res, id)) return;
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No image file received." });
      }
      if (!req.file.mimetype.startsWith("image/")) {
        return res
          .status(400)
          .json({ success: false, message: "Only image files are allowed." });
      }
      const url = `${req.protocol}://${req.get("host")}/uploads/documents/${req.file.filename}`;
      return res.status(200).json({ success: true, url });
    } catch (error) {
      console.error("Landing image upload error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

// Delete an uploaded landing image — but only if it is not referenced by the
// clinic's draft, published landing, or verification documents. This safely
// cleans up orphaned images (e.g. a logo replaced before saving) while never
// removing a file that is still live.
router.delete("/:id/landing/image", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid clinic id." });
    }
    if (!ownsClinicOr403(req, res, id)) return;

    const { url } = req.body || {};
    const filename = String(url || "").split("/").pop();
    // Reject anything that isn't a bare filename (no traversal).
    if (!filename || /[\\/]/.test(filename) || filename.includes("..")) {
      return res.status(400).json({ success: false, message: "Invalid image reference." });
    }

    const clinic = await Clinic.findById(id).lean();
    if (!clinic)
      return res.status(404).json({ success: false, message: "Clinic not found." });

    const referenced = [];
    const collect = (cfg) => {
      if (!cfg) return;
      if (cfg.logoUrl) referenced.push(cfg.logoUrl);
      (cfg.blocks || []).forEach((b) => b.imageUrl && referenced.push(b.imageUrl));
    };
    collect(clinic.landing?.draft);
    collect(clinic.landing?.published);
    (clinic.submittedDocuments || []).forEach(
      (d) => d.fileUrl && referenced.push(d.fileUrl),
    );

    if (referenced.some((u) => String(u).split("/").pop() === filename)) {
      return res
        .status(409)
        .json({ success: false, message: "Image is still in use." });
    }

    const filePath = path.join(LANDING_UPLOAD_DIR, filename);
    // Confirm the resolved path is inside the uploads directory.
    if (!filePath.startsWith(LANDING_UPLOAD_DIR)) {
      return res.status(400).json({ success: false, message: "Invalid path." });
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.status(200).json({ success: true, message: "Image removed." });
  } catch (error) {
    console.error("Landing image delete error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;