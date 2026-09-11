// src/models/billingModels.js
// ============================================================================
// SIMULATED billing domain (NOT a real payment gateway).
// All money moves are mocked; no real card data is ever stored or processed.
// Amounts are stored in MAJOR currency units (e.g. 1500.00 PHP). Mock provider
// identifiers are clearly namespaced with `_test_`.
//
// This whole module is designed so the *subscription logic* is provider-agnostic:
// swapping the MockGateway (services/billing/gateway.js) for a real provider
// requires no schema changes here.
// ============================================================================
import mongoose from "mongoose";

const { Schema } = mongoose;

// ---- Enums (exported for reuse by services & the /meta endpoint) -----------
export const SUBSCRIPTION_STATUSES = [
  "pending", // created, awaiting first successful payment
  "trialing", // in free trial
  "active", // paid & current
  "past_due", // a renewal charge failed, within grace period
  "payment_failed", // last attempt failed (transient, ret/y pending)
  "unpaid", // grace period elapsed without payment
  "paused", // temporarily suspended by admin/clinic
  "canceled", // ended by request
  "expired", // ended by lifecycle (unpaid too long / period ended)
];

export const BILLING_CYCLES = ["monthly", "yearly"];
export const CURRENCIES = ["PHP", "USD"];

export const INVOICE_STATUSES = [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
  "refunded",
  "partially_refunded",
];

export const PAYMENT_ATTEMPT_STATUSES = ["processing", "succeeded", "failed", "pending"];
export const PAYMENT_OUTCOMES = [
  "success",
  "declined",
  "insufficient_funds",
  "expired_card",
  "duplicate",
  "delayed",
  "error",
];

export const REFUND_STATUSES = ["pending", "succeeded", "failed"];

export const NOTIFICATION_TYPES = [
  "subscription_created",
  "payment_successful",
  "payment_failed",
  "payment_due_soon",
  "payment_overdue",
  "subscription_renewed",
  "subscription_canceled",
  "subscription_paused",
  "subscription_resumed",
  "trial_ending",
  "refund_issued",
  "payment_method_expiring",
];

// ---- Subscription Plan -----------------------------------------------------
const planSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    currency: { type: String, enum: CURRENCIES, default: "PHP" },
    // Price per billing cycle (major units).
    prices: {
      monthly: { type: Number, default: 0 },
      yearly: { type: Number, default: 0 },
    },
    trialDays: { type: Number, default: 0 },
    gracePeriodDays: { type: Number, default: 7 },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ---- Payment Method (SIMULATED — no PAN/CVV ever) --------------------------
const paymentMethodSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    providerRef: { type: String, required: true }, // pm_test_...
    type: { type: String, enum: ["card", "gcash", "paymaya", "grab_pay", "bank"], default: "card" },
    provider: { type: String, default: "" }, // e.g. Visa, GCash, PayMaya, BPI
    brand: { type: String, default: "Visa" }, // simulated brand
    last4: { type: String, default: "4242" }, // from a TEST token only
    expMonth: { type: Number, default: 12 },
    expYear: { type: Number, default: 2030 },
    // The clearly-labelled TEST token that drives simulated behavior.
    testToken: { type: String, default: "tok_test_visa" },
    isDefault: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "expired", "removed"], default: "active" },
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true },
);
paymentMethodSchema.methods.isExpired = function isExpired(asOf = new Date()) {
  const end = new Date(this.expYear, this.expMonth, 1); // first day AFTER expiry month
  return end <= asOf;
};

// ---- Subscription ----------------------------------------------------------
const subscriptionSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    clinicName: { type: String, default: "" }, // snapshot for notifications/admin
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    planKey: { type: String, required: true },
    planName: { type: String, default: "" },
    providerRef: { type: String, required: true }, // sub_test_...
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: "pending", index: true },
    billingCycle: { type: String, enum: BILLING_CYCLES, default: "monthly" },
    currency: { type: String, enum: CURRENCIES, default: "PHP" },
    amount: { type: Number, default: 0 }, // price snapshot for the current cycle

    paymentMethodId: { type: Schema.Types.ObjectId, ref: "PaymentMethod" },

    startDate: { type: Date },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    nextRenewalDate: { type: Date, index: true },
    trialEndsAt: { type: Date },

    autoRenew: { type: Boolean, default: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date },
    pausedAt: { type: Date },
    resumedAt: { type: Date },
    endedAt: { type: Date },

    gracePeriodDays: { type: Number, default: 7 },
    gracePeriodEndsAt: { type: Date },
    failedPaymentCount: { type: Number, default: 0 },

    // SIMULATION control: forces the outcome of the NEXT payment attempt.
    // One of PAYMENT_OUTCOMES, or "" to fall back to the payment method token.
    nextPaymentOutcome: { type: String, default: "" },

    // Notification bookkeeping so we don't resend the same lifecycle nudge.
    lastTrialEndingNotifiedAt: { type: Date },
    lastDueSoonNotifiedPeriod: { type: String, default: "" },
    lastOverdueNotifiedPeriod: { type: String, default: "" },
    lastPmExpiringNotifiedAt: { type: Date },

    simulated: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// ---- Invoice ---------------------------------------------------------------
const invoiceSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", index: true },
    number: { type: String, required: true }, // INV-YYYY-xxxxx
    providerRef: { type: String, required: true }, // in_test_...
    currency: { type: String, enum: CURRENCIES, default: "PHP" },
    amountDue: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    amountRefunded: { type: Number, default: 0 },
    status: { type: String, enum: INVOICE_STATUSES, default: "open", index: true },
    lineItems: {
      type: [{ description: String, amount: Number }],
      default: [],
    },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    dueDate: { type: Date, index: true },
    attemptCount: { type: Number, default: 0 },
    paidAt: { type: Date },
    // Idempotency: exactly one invoice per subscription per period.
    idempotencyKey: { type: String, required: true, unique: true },
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Snapshot of the payment method used for an attempt. Declared as an explicit
// sub-schema because an inline `{ type: String, ... }` object would make
// Mongoose compile `method` itself as a String path (the `type`-key pitfall),
// rejecting every attempt write with "Cast to string failed".
const paymentMethodSnapshotSchema = new Schema(
  {
    type: { type: String, default: "card" },
    provider: { type: String, default: "" },
    brand: { type: String, default: "" },
    last4: { type: String, default: "" },
    testToken: { type: String, default: "" },
  },
  { _id: false },
);

// ---- Payment Attempt (a mock "charge") -------------------------------------
const paymentAttemptSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    providerRef: { type: String, required: true }, // ch_test_...
    amount: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, default: "PHP" },
    status: { type: String, enum: PAYMENT_ATTEMPT_STATUSES, default: "processing" },
    outcome: { type: String, enum: PAYMENT_OUTCOMES, default: "success" },
    failureCode: { type: String, default: "" },
    failureMessage: { type: String, default: "" },
    // Snapshot of the method used.
    method: { type: paymentMethodSnapshotSchema, default: () => ({}) },
    // Idempotency: duplicate charge requests with the same key return the same result.
    idempotencyKey: { type: String, required: true, unique: true },
    settledAt: { type: Date }, // for delayed/pending attempts
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// ---- Refund ----------------------------------------------------------------
const refundSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    paymentAttemptId: { type: Schema.Types.ObjectId, ref: "PaymentAttempt" },
    providerRef: { type: String, required: true }, // re_test_...
    amount: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, default: "PHP" },
    type: { type: String, enum: ["full", "partial"], default: "full" },
    reason: { type: String, default: "" },
    status: { type: String, enum: REFUND_STATUSES, default: "succeeded" },
    idempotencyKey: { type: String, required: true, unique: true },
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// ---- Notification ----------------------------------------------------------
const notificationSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    clinicName: { type: String, default: "" },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription" },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    message: { type: String, required: true },
    subscriptionStatus: { type: String, default: "" },
    amount: { type: Number, default: null },
    currency: { type: String, default: "PHP" },
    dueDate: { type: Date, default: null },
    recommendedAction: { type: String, default: "" },
    read: { type: Boolean, default: false },
    // Simulated delivery log (email/SMS). NEVER a real send from here.
    channels: {
      type: [{ channel: String, to: String, sentAt: Date }],
      default: [],
    },
    // Idempotency for lifecycle notifications.
    dedupeKey: { type: String, unique: true, sparse: true },
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// ---- Webhook Event (provider-style, replayable & idempotent) ---------------
const webhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true }, // evt_test_...
    type: { type: String, required: true, index: true }, // e.g. invoice.payment_succeeded
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic" },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["pending", "processed", "failed"], default: "processed" },
    processedAt: { type: Date },
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// ---- Audit Log -------------------------------------------------------------
const auditLogSchema = new Schema(
  {
    actorType: { type: String, enum: ["system", "admin", "clinic"], default: "system" },
    actorId: { type: String, default: "" },
    actorEmail: { type: String, default: "" },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: "" },
    entityId: { type: String, default: "" },
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic" },
    summary: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// ---- Billing Clock (simulation clock singleton) ----------------------------
const billingClockSchema = new Schema(
  {
    key: { type: String, default: "billing", unique: true },
    // Milliseconds added to the real clock. Advancing the clock == fast-forward.
    offsetMs: { type: Number, default: 0 },
    lastRunAt: { type: Date },
  },
  { timestamps: true },
);

// Reuse existing models across hot-reload / multiple imports.
export const SubscriptionPlan =
  mongoose.models.SubscriptionPlan || mongoose.model("SubscriptionPlan", planSchema);
export const PaymentMethod =
  mongoose.models.PaymentMethod || mongoose.model("PaymentMethod", paymentMethodSchema);
export const Subscription =
  mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
export const PaymentAttempt =
  mongoose.models.PaymentAttempt || mongoose.model("PaymentAttempt", paymentAttemptSchema);
export const Refund = mongoose.models.Refund || mongoose.model("Refund", refundSchema);
export const BillingNotification =
  mongoose.models.BillingNotification ||
  mongoose.model("BillingNotification", notificationSchema);
export const WebhookEvent =
  mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", webhookEventSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
export const BillingClock =
  mongoose.models.BillingClock || mongoose.model("BillingClock", billingClockSchema);
