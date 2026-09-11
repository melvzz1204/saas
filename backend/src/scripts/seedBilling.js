// src/scripts/seedBilling.js
// Seeds subscription PLANS (always) and, on demand, realistic SIMULATED sample
// data across multiple clinics and subscription states. Driving the real
// billingService means the sample data is internally consistent (invoices,
// attempts, notifications, audit + webhook events all line up).
//
// CLI:  node src/scripts/seedBilling.js         (plans + sample data)
//       node src/scripts/seedBilling.js --reset (wipe billing collections first)
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import {
  SubscriptionPlan,
  Subscription,
  Invoice,
  PaymentAttempt,
  Refund,
  PaymentMethod,
  BillingNotification,
  WebhookEvent,
  AuditLog,
} from "../models/billingModels.js";
import {
  createSubscription,
  renewSubscription,
  cancelSubscription,
  pauseSubscription,
  configureNextOutcome,
  issueRefund,
} from "../services/billing/billingService.js";
import { DAY_MS } from "../services/billing/clock.js";

// Single fixed product: Professional at ₱3,000/mo or ₱25,000/yr (save ₱11,000),
// with a 14-day trial. Legacy multi-plan keys are deactivated, never deleted.
const PLANS = [
  {
    key: "pro", name: "Professional", sortOrder: 1, currency: "PHP",
    description: "One simple plan for every clinic. Full access, all features included.",
    prices: { monthly: 3000, yearly: 25000 }, trialDays: 14, gracePeriodDays: 7,
    features: ["Unlimited staff", "Landing page builder", "Online booking", "Analytics", "Priority support"],
  },
];

const LEGACY_PLAN_KEYS = ["starter", "enterprise"];

export async function seedPlans() {
  for (const p of PLANS) {
    // isActive:true is set explicitly (not left to the schema default) so a
    // pre-existing inactive "pro" document can never block new sales.
    await SubscriptionPlan.updateOne({ key: p.key }, { $set: { ...p, isActive: true } }, { upsert: true });
  }
  // Deactivate legacy plans (keep documents for history, hide from new sales).
  await SubscriptionPlan.updateMany(
    { key: { $in: LEGACY_PLAN_KEYS } },
    { $set: { isActive: false } },
  );
  // Migrate live subscriptions that still reference a legacy plan key.
  await Subscription.updateMany(
    { planKey: { $in: LEGACY_PLAN_KEYS } },
    { $set: { planKey: "pro", planName: "Professional" } },
  );
  return SubscriptionPlan.find().sort({ sortOrder: 1 }).lean();
}

async function ensureSampleClinic(index, name, slug) {
  let clinic = await Clinic.findOne({ slug });
  if (!clinic) {
    clinic = await Clinic.create({
      name, slug, address: `${100 + index} Sample Ave, Metro City`,
      contactNumber: `0917000000${index}`, isActive: true, applicationStatus: "Approved",
      description: "Simulated clinic for billing demo.",
    });
  }
  const email = `sim-clinic-${index}@example.com`;
  const existingUser = await User.findOne({ email });
  if (!existingUser) {
    await User.create({
      clinicId: clinic._id, firstName: "Sim", lastName: `Admin ${index}`,
      email, phone: clinic.contactNumber, role: "CLINIC_ADMIN",
      password: await bcrypt.hash("password123", 10), isActive: true,
    });
  }
  return clinic;
}

async function billingCollectionsReset() {
  await Promise.all([
    Subscription.deleteMany({}), Invoice.deleteMany({}), PaymentAttempt.deleteMany({}),
    Refund.deleteMany({}), PaymentMethod.deleteMany({}), BillingNotification.deleteMany({}),
    WebhookEvent.deleteMany({}), AuditLog.deleteMany({ entityType: { $in: ["Subscription", "Invoice", "Refund", "PaymentAttempt", "BillingClock"] } }),
  ]);
}

export async function seedBillingSampleData({ reset = false } = {}) {
  await seedPlans();
  if (reset) await billingCollectionsReset();

  const clinics = [];
  const specs = [
    ["SIM — Smile Central", "sim-smile-central"],
    ["SIM — Bright Dental", "sim-bright-dental"],
    ["SIM — Pearl Ortho", "sim-pearl-ortho"],
    ["SIM — Coastal Care", "sim-coastal-care"],
    ["SIM — Metro Dentists", "sim-metro-dentists"],
    ["SIM — Family Smiles", "sim-family-smiles"],
  ];
  for (let i = 0; i < specs.length; i += 1) {
    clinics.push(await ensureSampleClinic(i + 1, specs[i][0], specs[i][1]));
  }

  const created = [];
  const makeIfAbsent = async (clinic, fn) => {
    const existing = await Subscription.findOne({ clinicId: clinic._id });
    if (existing) return { skipped: true, clinic: clinic.name, status: existing.status };
    return fn(clinic);
  };

  // All samples use the single Professional plan (₱3,000/mo) with varied
  // payment methods to cover every lifecycle state.
  // 1) Active — Pro monthly, Visa (success).
  created.push(await makeIfAbsent(clinics[0], async (c) => {
    const r = await createSubscription({ clinicId: c._id, planKey: "pro", billingCycle: "monthly", testToken: "tok_test_visa", actor: { type: "system" } });
    return { clinic: c.name, status: r.subscription?.status };
  }));

  // 2) Trialing — Pro monthly has a 14-day trial.
  created.push(await makeIfAbsent(clinics[1], async (c) => {
    const r = await createSubscription({ clinicId: c._id, planKey: "pro", billingCycle: "monthly", testToken: "tok_test_gcash", actor: { type: "system" } });
    return { clinic: c.name, status: r.subscription?.status };
  }));

  // 3) Payment failed on first charge — Pro, declined card.
  created.push(await makeIfAbsent(clinics[2], async (c) => {
    const r = await createSubscription({ clinicId: c._id, planKey: "pro", billingCycle: "monthly", testToken: "tok_test_decline", actor: { type: "system" } });
    return { clinic: c.name, status: r.subscription?.status };
  }));

  // 4) Past due — active, then a forced failed renewal (in grace period).
  created.push(await makeIfAbsent(clinics[3], async (c) => {
    const r = await createSubscription({ clinicId: c._id, planKey: "pro", billingCycle: "monthly", testToken: "tok_test_paymaya", actor: { type: "system" } });
    const sub = r.subscription;
    sub.nextRenewalDate = new Date(Date.now() - DAY_MS);
    await sub.save();
    await configureNextOutcome(sub, "declined", { actor: { type: "system" } });
    const rr = await renewSubscription(sub, { actor: { type: "system" } });
    return { clinic: c.name, status: rr.subscription?.status };
  }));

  // 5) Canceled — active (yearly) then canceled + a partial refund on the paid invoice.
  created.push(await makeIfAbsent(clinics[4], async (c) => {
    const r = await createSubscription({ clinicId: c._id, planKey: "pro", billingCycle: "yearly", testToken: "tok_test_bank", actor: { type: "system" } });
    const paidInvoice = await Invoice.findOne({ subscriptionId: r.subscription._id, status: "paid" });
    if (paidInvoice) await issueRefund({ invoice: paidInvoice, amount: Math.round(paidInvoice.amountPaid * 0.25), reason: "Goodwill (sample)", actor: { type: "system" } });
    await cancelSubscription(r.subscription, { atPeriodEnd: false, actor: { type: "system" } });
    return { clinic: c.name, status: "canceled" };
  }));

  // 6) Paused — active then paused.
  created.push(await makeIfAbsent(clinics[5], async (c) => {
    const r = await createSubscription({ clinicId: c._id, planKey: "pro", billingCycle: "monthly", testToken: "tok_test_visa", actor: { type: "system" } });
    // Pro has a 14-day trial; pause directly to demo trialing->paused.
    await pauseSubscription(r.subscription, { actor: { type: "system" } });
    return { clinic: c.name, status: "paused" };
  }));

  return { plans: PLANS.length, clinics: clinics.length, subscriptions: created };
}

// Allow running directly as a script.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seedBilling.js")) {
  (async () => {
    const dotenv = await import("dotenv");
    dotenv.default.config();
    if (!process.env.MONGO_URI) {
      console.error("MONGO_URI missing in backend/.env");
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    const reset = process.argv.includes("--reset");
    const result = await seedBillingSampleData({ reset });
    console.log("✅ Billing seed complete:", JSON.stringify(result, null, 2));
    await mongoose.disconnect();
    process.exit(0);
  })().catch(async (e) => {
    console.error("💥 Billing seed failed:", e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
}
