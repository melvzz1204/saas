// src/routes/billingRoutes.js
// SIMULATED billing API. Three audiences:
//   - public  : GET /meta, GET /plans  (render plan cards / test cards)
//   - clinic  : /me/*   (subscribe, view, cancel/pause/resume, pay invoice)
//   - admin   : /admin/*(full console + manual actions + run cycle + clock)
import express from "express";
import mongoose from "mongoose";
import { protectRoute, protectSaasAdminRoute } from "../middlewares/authMiddleware.js";
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
  SUBSCRIPTION_STATUSES,
  BILLING_CYCLES,
  INVOICE_STATUSES,
  PAYMENT_OUTCOMES,
  NOTIFICATION_TYPES,
} from "../models/billingModels.js";
import { TEST_PAYMENT_METHODS, TEST_TOKENS } from "../services/billing/gateway.js";
import {
  createSubscription,
  createPaymentMethod,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  changePlan,
  changeBillingCycle,
  extendTrial,
  configureNextOutcome,
  retryPayment,
  markInvoicePaid,
  issueRefund,
  reconcileRegistrationSubscription,
  processWebhookEvent,
} from "../services/billing/billingService.js";
import { runBillingCycle } from "../services/billing/billingEngine.js";
import { getClock, advanceClock, resetClock, billingNow, DAY_MS } from "../services/billing/clock.js";
import { seedBillingSampleData } from "../scripts/seedBilling.js";
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import { notify, audit, emitWebhook } from "../services/billing/recorders.js";
import { sendSubscriptionWarningEmail } from "../services/emailService.js";

const router = express.Router();

// Express 4 does not catch async handler rejections — without this, a single
// throw (e.g. a validation error mid-charge) becomes an unhandled rejection
// and the request hangs forever. Wrap every route so failures always answer
// with JSON instead.
for (const m of ["get", "post", "patch", "put", "delete"]) {
  const orig = router[m].bind(router);
  router[m] = (path, ...handlers) =>
    orig(
      path,
      ...handlers.map((h) =>
        typeof h === "function" && h.length < 4
          ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
          : h,
      ),
    );
}

const actorFrom = (req, type) => ({
  type,
  id: req.user?._id || req.user?.id,
  email: req.user?.email,
});

// Clinic guard: authenticated CLINIC_ADMIN/SUPER_ADMIN; resolves clinicId.
function ensureClinic(req, res, next) {
  const role = String(req.user?.role || "").toUpperCase();
  if (!["CLINIC_ADMIN", "SUPER_ADMIN", "SAAS_ADMIN"].includes(role)) {
    return res.status(403).json({ success: false, message: "Clinic administrator access required." });
  }
  const clinicId = req.clinicId || req.user?.clinicId || req.body?.clinicId || req.query?.clinicId;
  if (!clinicId) return res.status(400).json({ success: false, message: "Clinic context is required." });
  req.resolvedClinicId = String(clinicId);
  next();
}

// ---------- helpers ----------
function buildFilter(query, { clinicField = "clinicId" } = {}) {
  const f = {};
  if (query.clinicId && mongoose.Types.ObjectId.isValid(query.clinicId)) f[clinicField] = query.clinicId;
  if (query.status) f.status = query.status;
  if (query.plan) f.planKey = query.plan;
  if (query.type) f.type = query.type;
  if (query.outcome) f.outcome = query.outcome;
  if (query.from || query.to) {
    f.createdAt = {};
    if (query.from) f.createdAt.$gte = new Date(query.from);
    if (query.to) f.createdAt.$lte = new Date(query.to);
  }
  return f;
}
const clampLimit = (v) => Math.min(Math.max(parseInt(v, 10) || 50, 1), 200);

// ============================ PUBLIC ============================
router.get("/meta", async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  res.json({
    success: true,
    simulated: true,
    data: {
      plans,
      testPaymentMethods: TEST_PAYMENT_METHODS,
      enums: {
        subscriptionStatuses: SUBSCRIPTION_STATUSES,
        billingCycles: BILLING_CYCLES,
        invoiceStatuses: INVOICE_STATUSES,
        paymentOutcomes: PAYMENT_OUTCOMES,
        notificationTypes: NOTIFICATION_TYPES,
      },
    },
  });
});

router.get("/plans", async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  res.json({ success: true, simulated: true, data: plans });
});

// ============================ CLINIC ============================
router.get("/me/subscription", protectRoute, ensureClinic, async (req, res) => {
  const clinicId = req.resolvedClinicId;
  const subscription = await Subscription.findOne({ clinicId }).sort({ createdAt: -1 }).lean();
  const [invoices, notifications, method] = await Promise.all([
    Invoice.find({ clinicId }).sort({ createdAt: -1 }).limit(10).lean(),
    BillingNotification.find({ clinicId }).sort({ createdAt: -1 }).limit(20).lean(),
    subscription?.paymentMethodId ? PaymentMethod.findById(subscription.paymentMethodId).lean() : null,
  ]);
  const unread = await BillingNotification.countDocuments({ clinicId, read: false });
  // Server simulation clock so countdowns stay consistent after clock advances.
  const { billingNow } = await import("../services/billing/clock.js");
  res.json({ success: true, simulated: true, data: { subscription, invoices, notifications, unread, paymentMethod: method }, now: await billingNow() });
});

router.post("/me/subscribe", protectRoute, ensureClinic, async (req, res) => {
  const { planKey, billingCycle, testToken, autoRenew } = req.body || {};
  const result = await createSubscription({
    clinicId: req.resolvedClinicId,
    planKey,
    billingCycle,
    testToken,
    autoRenew: autoRenew !== false,
    actor: actorFrom(req, "clinic"),
  });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.status(201).json({
    success: true,
    simulated: true,
    message:
      result.outcome === "active" ? "Subscription active — payment successful."
      : result.outcome === "trialing" ? "Trial started."
      : result.outcome === "pending" ? "Payment is processing (delayed)."
      : "Subscription created, but the first payment failed. Update your method and retry.",
    data: result,
  });
});

async function loadOwnSub(req, res) {
  const sub = await Subscription.findOne({ clinicId: req.resolvedClinicId }).sort({ createdAt: -1 });
  if (!sub) res.status(404).json({ success: false, message: "No subscription found for this clinic." });
  return sub;
}

router.post("/me/cancel", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  await cancelSubscription(sub, { atPeriodEnd: !!req.body?.atPeriodEnd, actor: actorFrom(req, "clinic") });
  res.json({ success: true, message: "Subscription canceled.", data: sub });
});
router.post("/me/pause", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  await pauseSubscription(sub, { actor: actorFrom(req, "clinic") });
  res.json({ success: true, message: "Subscription paused.", data: sub });
});
router.post("/me/resume", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  await resumeSubscription(sub, { actor: actorFrom(req, "clinic") });
  res.json({ success: true, message: "Subscription resumed.", data: sub });
});

router.post("/me/pay-invoice/:invoiceId", protectRoute, ensureClinic, async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.invoiceId, clinicId: req.resolvedClinicId });
  if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found." });
  const result = await retryPayment(invoice, { actor: actorFrom(req, "clinic") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, message: `Payment ${result.outcome}.`, data: result });
});

router.post("/me/change-plan", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  if (["canceled", "expired"].includes(sub.status)) return res.status(409).json({ success: false, message: "This subscription is closed. Start a new one to change plans." });
  const result = await changePlan(sub, req.body?.planKey, { actor: actorFrom(req, "clinic") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, message: `Plan changed to ${result.subscription.planName}.`, data: result.subscription });
});

// Switch billing cycle (monthly <-> yearly). Restarts the period today and
// charges the new amount immediately — no proration.
router.post("/me/change-cycle", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  const result = await changeBillingCycle(sub, req.body?.billingCycle, { actor: actorFrom(req, "clinic") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  if (result.unchanged) return res.json({ success: true, message: "Already on that billing cycle.", data: result.subscription });
  const messages = { switched: `Switched to ${result.subscription.billingCycle} billing — new period started today.`, pending: "Switch charge is processing (delayed).", payment_failed: "Switch charge failed — update your method and retry." };
  res.json({ success: result.outcome !== "payment_failed", message: messages[result.outcome] || "Billing cycle updated.", data: result });
});

router.post("/me/payment-method", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  const { testToken } = req.body || {};
  if (!testToken || !(testToken in TEST_TOKENS)) return res.status(400).json({ success: false, message: "Choose a valid test payment method." });
  const method = await createPaymentMethod(req.resolvedClinicId, testToken);
  await PaymentMethod.updateMany({ clinicId: req.resolvedClinicId, _id: { $ne: method._id } }, { $set: { isDefault: false } });
  sub.paymentMethodId = method._id;
  sub.nextPaymentOutcome = "";
  await sub.save();
  await audit({ actorType: "clinic", actorId: req.user?._id || req.user?.id, actorEmail: req.user?.email, action: "subscription.payment_method_updated", entityType: "Subscription", entityId: sub._id, clinicId: sub.clinicId, summary: `Payment method updated to ${method.brand} •••• ${method.last4}` });
  res.json({ success: true, message: `Payment method updated to ${method.brand} •••• ${method.last4}.`, data: { subscription: sub, paymentMethod: method } });
});

router.post("/me/auto-renew", protectRoute, ensureClinic, async (req, res) => {
  const sub = await loadOwnSub(req, res); if (!sub) return;
  const autoRenew = req.body?.autoRenew !== false && req.body?.autoRenew !== "false";
  sub.autoRenew = !!autoRenew;
  if (sub.autoRenew && sub.status === "active" && !sub.nextRenewalDate && sub.currentPeriodEnd) sub.nextRenewalDate = sub.currentPeriodEnd;
  if (!sub.autoRenew) sub.nextRenewalDate = sub.nextRenewalDate; // keep date, engine skips non-auto
  await sub.save();
  await audit({ actorType: "clinic", actorId: req.user?._id || req.user?.id, actorEmail: req.user?.email, action: "subscription.auto_renew_toggled", entityType: "Subscription", entityId: sub._id, clinicId: sub.clinicId, summary: `Auto-renew turned ${sub.autoRenew ? "on" : "off"}` });
  res.json({ success: true, message: `Automatic renewal turned ${sub.autoRenew ? "on" : "off"}.`, data: sub });
});

router.get("/me/notifications", protectRoute, ensureClinic, async (req, res) => {
  const items = await BillingNotification.find({ clinicId: req.resolvedClinicId }).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.post("/me/notifications/:id/read", protectRoute, ensureClinic, async (req, res) => {
  await BillingNotification.updateOne({ _id: req.params.id, clinicId: req.resolvedClinicId }, { $set: { read: true } });
  res.json({ success: true });
});

// ============================ ADMIN ============================
router.use("/admin", protectSaasAdminRoute);

router.get("/admin/overview", async (req, res) => {
  const [subs, invoices, attempts, refunds, clock] = await Promise.all([
    Subscription.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    // Revenue must reflect cash collected, not list price: sum amountPaid.
    Invoice.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amountPaid" } } }]),
    PaymentAttempt.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Refund.aggregate([{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } }]),
    getClock(),
  ]);
  const now = await billingNow();
  res.json({ success: true, simulated: true, data: { subscriptions: subs, invoices, attempts, refunds: refunds[0] || { count: 0, amount: 0 }, clock: { offsetMs: clock.offsetMs, simulatedNow: now, lastRunAt: clock.lastRunAt } } });
});

router.get("/admin/subscriptions", async (req, res) => {
  const items = await Subscription.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.get("/admin/plans", async (req, res) => {
  res.json({ success: true, data: await SubscriptionPlan.find().sort({ sortOrder: 1 }).lean() });
});
router.get("/admin/invoices", async (req, res) => {
  const items = await Invoice.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.get("/admin/payment-attempts", async (req, res) => {
  const items = await PaymentAttempt.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.get("/admin/refunds", async (req, res) => {
  const items = await Refund.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.get("/admin/notifications", async (req, res) => {
  const items = await BillingNotification.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.get("/admin/webhooks", async (req, res) => {
  const f = {};
  if (req.query.type) f.type = req.query.type;
  const items = await WebhookEvent.find(f).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});
router.get("/admin/audit", async (req, res) => {
  const items = await AuditLog.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(clampLimit(req.query.limit)).lean();
  res.json({ success: true, data: items });
});

// --- admin create subscription on behalf of a clinic ---
router.post("/admin/subscriptions", async (req, res) => {
  const { clinicId, planKey, billingCycle, testToken, autoRenew } = req.body || {};
  const result = await createSubscription({ clinicId, planKey, billingCycle, testToken, autoRenew: autoRenew !== false, actor: actorFrom(req, "admin") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.status(201).json({ success: true, data: result });
});

// --- admin subscription actions ---
async function loadSub(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { res.status(400).json({ success: false, message: "Invalid subscription id." }); return null; }
  const sub = await Subscription.findById(req.params.id);
  if (!sub) { res.status(404).json({ success: false, message: "Subscription not found." }); return null; }
  return sub;
}
router.post("/admin/subscriptions/:id/cancel", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  await cancelSubscription(sub, { atPeriodEnd: !!req.body?.atPeriodEnd, actor: actorFrom(req, "admin") });
  res.json({ success: true, data: sub });
});
router.post("/admin/subscriptions/:id/pause", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  await pauseSubscription(sub, { actor: actorFrom(req, "admin") });
  res.json({ success: true, data: sub });
});
router.post("/admin/subscriptions/:id/resume", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  await resumeSubscription(sub, { actor: actorFrom(req, "admin") });
  res.json({ success: true, data: sub });
});
router.post("/admin/subscriptions/:id/change-plan", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  const result = await changePlan(sub, req.body?.planKey, { actor: actorFrom(req, "admin") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, data: result.subscription });
});
router.post("/admin/subscriptions/:id/change-cycle", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  const result = await changeBillingCycle(sub, req.body?.billingCycle, { actor: actorFrom(req, "admin") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  if (result.unchanged) return res.json({ success: true, message: "Already on that billing cycle.", data: result.subscription });
  res.json({ success: result.outcome !== "payment_failed", message: `Switched to ${result.subscription.billingCycle} billing.`, data: result });
});
router.post("/admin/subscriptions/:id/extend-trial", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  const result = await extendTrial(sub, req.body?.days ?? 7, { actor: actorFrom(req, "admin") });
  res.json({ success: true, data: result.subscription });
});
router.post("/admin/subscriptions/:id/next-outcome", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  const result = await configureNextOutcome(sub, req.body?.outcome || "", { actor: actorFrom(req, "admin") });
  res.json({ success: true, data: result.subscription });
});

// --- admin invoice actions ---
async function loadInvoice(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { res.status(400).json({ success: false, message: "Invalid invoice id." }); return null; }
  const inv = await Invoice.findById(req.params.id);
  if (!inv) { res.status(404).json({ success: false, message: "Invoice not found." }); return null; }
  return inv;
}
router.post("/admin/invoices/:id/retry", async (req, res) => {
  const inv = await loadInvoice(req, res); if (!inv) return;
  const result = await retryPayment(inv, { forcedOutcome: req.body?.forcedOutcome || "", actor: actorFrom(req, "admin") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, data: result });
});
// --- reconcile an interrupted registration activation (NO new charge) ---
// Repairs `pending sub + open invoice + zero succeeded attempts` left when
// verify's activation died midway. Records the prepaid charge and activates.
router.post("/admin/subscriptions/sync-registration", async (req, res) => {
  const { clinicId, paymentRef } = req.body || {};
  const result = await reconcileRegistrationSubscription({
    clinicId,
    paymentRef: String(paymentRef || ""),
    actor: actorFrom(req, "admin"),
  });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({
    success: true,
    message: result.duplicate ? "Subscription already active." : "Registration payment reconciled — subscription active. No new charge was made.",
    data: result,
  });
});
router.post("/admin/invoices/:id/mark-paid", async (req, res) => {
  const inv = await loadInvoice(req, res); if (!inv) return;
  const result = await markInvoicePaid(inv, { actor: actorFrom(req, "admin") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, data: result });
});
router.post("/admin/invoices/:id/refund", async (req, res) => {
  const inv = await loadInvoice(req, res); if (!inv) return;
  const result = await issueRefund({ invoice: inv, amount: req.body?.amount, reason: req.body?.reason || "", actor: actorFrom(req, "admin") });
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, data: result });
});

// --- webhook replay (idempotency demo) ---
router.post("/admin/webhooks/:eventId/replay", async (req, res) => {
  const result = await processWebhookEvent(req.params.eventId);
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  res.json({ success: true, alreadyProcessed: result.alreadyProcessed, data: result.event });
});

// --- simulation controls ---
router.post("/admin/run-cycle", async (req, res) => {
  const summary = await runBillingCycle({ actor: actorFrom(req, "admin") });
  res.json({ success: true, message: "Billing cycle executed.", data: summary });
});
router.get("/admin/clock", async (req, res) => {
  const clock = await getClock();
  res.json({ success: true, data: { offsetMs: clock.offsetMs, simulatedNow: await billingNow(), lastRunAt: clock.lastRunAt } });
});
router.post("/admin/clock/advance", async (req, res) => {
  const days = Number(req.body?.days);
  const ms = Number.isFinite(days) ? days * DAY_MS : Number(req.body?.ms) || 0;
  const clock = await advanceClock(ms);
  res.json({ success: true, message: `Advanced simulated clock by ${ms} ms.`, data: { offsetMs: clock.offsetMs, simulatedNow: await billingNow() } });
});
router.post("/admin/clock/reset", async (req, res) => {
  await resetClock();
  res.json({ success: true, message: "Simulated clock reset to real time.", data: { simulatedNow: await billingNow() } });
});

// --- clinics x subscription overview (for the SaaS admin console) ---
// Returns every clinic (paginated) joined with its latest subscription,
// open-invoice count, and computed days-left so the admin can spot trials
// ending / renewals due / overdue at a glance.
router.get("/admin/clinics-overview", async (req, res) => {
  const limit = clampLimit(req.query.limit || 100);
  const search = String(req.query.search || "").trim();
  const subStatus = String(req.query.status || "").trim();
  const plan = String(req.query.plan || "").trim();
  const expiringWithinDays = req.query.expiringWithinDays === "" ? null : Number(req.query.expiringWithinDays);

  const clinicFilter = {};
  if (search) {
    clinicFilter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ];
  }
  const clinics = await Clinic.find(clinicFilter).sort({ createdAt: -1 }).limit(200).lean();
  const clinicIds = clinics.map((c) => c._id);
  const now = await billingNow();

  // Best subscription per clinic. A stray `pending` row must never mask a paid
  // `active`/`trialing` one, so rank by status first, newest wins ties.
  const STATUS_RANK = { active: 0, trialing: 1, past_due: 2, payment_failed: 2, unpaid: 2, pending: 3, paused: 4 };
  const rankOf = (s) => STATUS_RANK[s.status] ?? 5;
  const subs = await Subscription.find({ clinicId: { $in: clinicIds } }).sort({ createdAt: -1 }).lean();
  const latestByClinic = new Map();
  for (const s of subs) {
    const k = String(s.clinicId);
    const cur = latestByClinic.get(k);
    if (!cur || rankOf(s) < rankOf(cur)) latestByClinic.set(k, s);
  }
  const openCounts = await Invoice.aggregate([
    { $match: { clinicId: { $in: clinicIds }, status: "open" } },
    { $group: { _id: "$clinicId", count: { $sum: 1 }, amount: { $sum: "$amountDue" } } },
  ]);
  const openByClinic = new Map(openCounts.map((o) => [String(o._id), o]));

  let rows = clinics.map((c) => {
    const sub = latestByClinic.get(String(c._id)) || null;
    const anchor = sub ? sub.nextRenewalDate || sub.trialEndsAt || sub.currentPeriodEnd : null;
    const daysLeft = anchor ? Math.ceil((new Date(anchor).getTime() - now.getTime()) / DAY_MS) : null;
    const open = openByClinic.get(String(c._id)) || { count: 0, amount: 0 };
    return {
      clinic: { _id: c._id, name: c.name, slug: c.slug, applicationStatus: c.applicationStatus, isActive: c.isActive, contactNumber: c.contactNumber },
      subscription: sub,
      daysLeft,
      renewalDate: anchor,
      openInvoices: open.count,
      openAmount: open.amount,
    };
  });

  if (subStatus) rows = rows.filter((r) => (r.subscription ? r.subscription.status === subStatus : subStatus === "none"));
  if (plan) rows = rows.filter((r) => r.subscription && r.subscription.planKey === plan);
  if (Number.isFinite(expiringWithinDays)) {
    rows = rows.filter((r) => r.daysLeft != null && r.daysLeft <= expiringWithinDays);
  }
  rows = rows.slice(0, limit);
  res.json({ success: true, simulated: true, data: rows, now });
});

// --- manually warn / notify a clinic about its subscription ---
// Creates an in-app BillingNotification and, when channel includes email,
// ALSO sends a real Gmail warning. Failures to send mail never fail the request.
const NOTIFY_KINDS = {
  expiring_soon: { type: "payment_due_soon", action: "Please renew before the due date to avoid interruption." },
  overdue: { type: "payment_overdue", action: "Pay the outstanding invoice now to avoid service interruption." },
  trial_ending: { type: "trial_ending", action: "Add or confirm a payment method to continue after the trial." },
  custom: { type: "payment_due_soon", action: "" },
};
router.post("/admin/subscriptions/:id/notify", async (req, res) => {
  const sub = await loadSub(req, res); if (!sub) return;
  const kind = NOTIFY_KINDS[req.body?.kind] ? req.body.kind : "custom";
  const customMessage = String(req.body?.message || "").trim().slice(0, 600);
  const channel = String(req.body?.channel || "both").toLowerCase(); // inapp | email | both
  const mapping = NOTIFY_KINDS[kind];

  const anchor = sub.nextRenewalDate || sub.trialEndsAt || sub.currentPeriodEnd;
  const defaultMessage = {
    expiring_soon: `Heads up — your ${sub.planName} subscription renews on ${anchor ? new Date(anchor).toISOString().slice(0, 10) : "soon"}. No action is needed if your payment method is up to date.`,
    overdue: `Your ${sub.planName} payment is overdue. Please settle it as soon as possible to avoid interruption.`,
    trial_ending: `Your ${sub.planName} trial ends on ${anchor ? new Date(anchor).toISOString().slice(0, 10) : "soon"}. Confirm your payment method to keep going.`,
    custom: `An update about your ${sub.planName} subscription.`,
  }[kind];
  const message = customMessage || defaultMessage;

  const { notification } = await notify({
    clinicId: sub.clinicId,
    clinicName: sub.clinicName,
    subscriptionId: sub._id,
    type: mapping.type,
    message,
    subscriptionStatus: sub.status,
    amount: sub.amount,
    currency: sub.currency,
    dueDate: anchor || null,
    recommendedAction: mapping.action,
    simulateChannels: [],
  });

  let emailed = false;
  let emailError = "";
  if (channel === "email" || channel === "both") {
    const admin = await User.findOne({ clinicId: sub.clinicId, role: "CLINIC_ADMIN" }).select("email").lean();
    if (admin?.email) {
      try {
        await sendSubscriptionWarningEmail({
          to: admin.email,
          clinicName: sub.clinicName,
          kind,
          planName: sub.planName,
          amount: sub.amount,
          currency: sub.currency,
          dueDate: anchor,
          message,
        });
        emailed = true;
      } catch (e) {
        emailError = e.message || "Email failed.";
      }
    } else {
      emailError = "No clinic admin email on file.";
    }
  }

  await audit({
    actorType: "admin", actorId: req.user?._id || req.user?.id, actorEmail: req.user?.email,
    action: "subscription.notified", entityType: "Subscription", entityId: sub._id, clinicId: sub.clinicId,
    summary: `Manual ${kind} notice to ${sub.clinicName} (email: ${emailed ? "sent" : "skipped"})`,
    metadata: { kind, emailed, emailError },
  });
  await emitWebhook("subscription.notice_sent", { clinicId: sub.clinicId, payload: { subscriptionId: sub._id, kind, emailed } });

  res.json({ success: true, message: emailed ? "Notice saved + email sent." : emailError ? `Notice saved. Email not sent: ${emailError}` : "Notice saved (in-app only).", data: { notification, emailed, emailError } });
});

// --- sample data (idempotent) ---
router.post("/admin/seed", async (req, res) => {
  const result = await seedBillingSampleData({ reset: !!req.body?.reset });
  res.json({ success: true, message: "Sample billing data ready.", data: result });
});

// Final safety net for the async wrapper above: JSON 500, never a hang.
router.use((err, req, res, next) => {
  console.error("Billing route error:", err?.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: "Billing request failed. Please try again." });
});

export default router;
