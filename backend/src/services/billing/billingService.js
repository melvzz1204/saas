// src/services/billing/billingService.js
// ============================================================================
// Core SIMULATED subscription/billing orchestration. Provider-agnostic: the
// only "provider" call is gateway.charge()/refund(). Every money-moving action
// is idempotent, audited, emits a webhook event, and produces notifications.
// ============================================================================
import mongoose from "mongoose";
import Clinic from "../../models/clinicModel.js";
import User from "../../models/userModel.js";
import {
  SubscriptionPlan,
  Subscription,
  Invoice,
  PaymentMethod,
  PaymentAttempt,
  Refund,
} from "../../models/billingModels.js";
import { getGateway, TEST_PAYMENT_METHODS, TEST_TOKENS } from "./gateway.js";
import { billingNow } from "./clock.js";
import { audit, notify, emitWebhook } from "./recorders.js";
import {
  mockId,
  money,
  invoiceNumber,
  addCycle,
  addDays,
  periodKey,
  formatMoney,
} from "./helpers.js";

const ACTIVEISH = ["pending", "trialing", "active", "past_due", "payment_failed", "paused", "unpaid"];

// ---- helpers ---------------------------------------------------------------
function priceFor(plan, cycle) {
  return money(cycle === "yearly" ? plan.prices.yearly : plan.prices.monthly);
}

function testMethodProfile(token) {
  const known = TEST_PAYMENT_METHODS.find((m) => m.token === token);
  if (known) return { type: known.type || "card", provider: known.provider || known.brand, brand: known.brand, last4: known.last4, testToken: token };
  return { type: "card", provider: "Visa", brand: "Visa", last4: "4242", testToken: "tok_test_visa" };
}

async function contactChannels(clinicId, subscription) {
  const channels = [];
  const email = subscription?.metadata?.notifyEmail;
  const phone = subscription?.metadata?.notifyPhone;
  if (email) channels.push({ channel: "email", to: email });
  if (phone) channels.push({ channel: "sms", to: phone });
  return channels;
}

// ---- payment methods -------------------------------------------------------
export async function createPaymentMethod(clinicId, testToken = "tok_test_visa") {
  const profile = testMethodProfile(testToken);
  // Expired-method tokens yield an already-expired method to make that path real.
  const expired = testToken === "tok_test_expired_card" || testToken === "tok_test_gcash_expired";
  const now = await billingNow();
  return PaymentMethod.create({
    clinicId,
    providerRef: mockId("pm"),
    type: profile.type || "card",
    provider: profile.provider || profile.brand,
    brand: profile.brand,
    last4: profile.last4,
    expMonth: expired ? 1 : 12,
    expYear: expired ? now.getUTCFullYear() - 1 : now.getUTCFullYear() + 3,
    testToken: profile.testToken,
    isDefault: true,
    status: expired ? "expired" : "active",
  });
}

// ---- invoice generation (idempotent per subscription+period) ---------------
export async function generateInvoice(subscription, periodStart, periodEnd, { reason = "subscription" } = {}) {
  const idempotencyKey = `${subscription._id}:${periodKey(periodStart)}`;
  const existing = await Invoice.findOne({ idempotencyKey });
  if (existing) return existing;

  const now = await billingNow();
  const doc = {
    clinicId: subscription.clinicId,
    subscriptionId: subscription._id,
    number: invoiceNumber(),
    providerRef: mockId("in"),
    currency: subscription.currency,
    amountDue: subscription.amount,
    amountPaid: 0,
    status: "open",
    lineItems: [
      {
        description: `${subscription.planName} (${subscription.billingCycle}) — ${reason}`,
        amount: subscription.amount,
      },
    ],
    periodStart,
    periodEnd,
    dueDate: periodStart <= now ? now : periodStart,
    idempotencyKey,
  };
  try {
    const invoice = await Invoice.create(doc);
    await emitWebhook("invoice.created", { clinicId: subscription.clinicId, payload: { invoiceId: invoice._id, number: invoice.number } });
    return invoice;
  } catch (err) {
    if (err && err.code === 11000) return Invoice.findOne({ idempotencyKey });
    throw err;
  }
}

// ---- charge an invoice (idempotent per idempotencyKey) ---------------------
export async function chargeInvoice({ subscription, invoice, method, idempotencyKey, forcedOutcome = "", actor }) {
  // Idempotency: an identical charge request returns the original attempt.
  const priorAttempt = await PaymentAttempt.findOne({ idempotencyKey });
  if (priorAttempt) {
    return { attempt: priorAttempt, duplicate: true };
  }

  const now = await billingNow();
  const gateway = getGateway();
  const effectiveForced = forcedOutcome || subscription.nextPaymentOutcome || "";
  const result = await gateway.charge({
    amount: invoice.amountDue,
    currency: invoice.currency,
    method,
    forcedOutcome: effectiveForced,
    now,
  });

  let attempt;
  try {
    attempt = await PaymentAttempt.create({
      clinicId: subscription.clinicId,
      subscriptionId: subscription._id,
      invoiceId: invoice._id,
      providerRef: result.providerRef,
      amount: invoice.amountDue,
      currency: invoice.currency,
      status: result.status,
      outcome: result.outcome,
      failureCode: result.failureCode,
      failureMessage: result.failureMessage,
      method: { type: method?.type || "card", provider: method?.provider || method?.brand, brand: method?.brand, last4: method?.last4, testToken: method?.testToken },
      idempotencyKey,
      settledAt: result.settledAt || null,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const again = await PaymentAttempt.findOne({ idempotencyKey });
      return { attempt: again, duplicate: true };
    }
    throw err;
  }

  invoice.attemptCount += 1;
  await invoice.save();

  // Consume a forced outcome so it only applies to this one attempt.
  if (subscription.nextPaymentOutcome) {
    subscription.nextPaymentOutcome = "";
    await subscription.save();
  }

  await audit({
    actorType: actor?.type || "system",
    actorId: actor?.id,
    actorEmail: actor?.email,
    action: "payment.attempted",
    entityType: "PaymentAttempt",
    entityId: attempt._id,
    clinicId: subscription.clinicId,
    summary: `Charge ${formatMoney(invoice.amountDue, invoice.currency)} → ${result.status} (${result.outcome})`,
    metadata: { invoice: invoice.number, outcome: result.outcome },
  });

  return { attempt, duplicate: false };
}

// ---- apply results ---------------------------------------------------------
export async function applySuccessfulPayment(subscription, invoice, attempt, { renewal = false, actor } = {}) {
  const now = await billingNow();

  invoice.status = invoice.amountRefunded > 0 ? invoice.status : "paid";
  invoice.amountPaid = invoice.amountDue;
  invoice.paidAt = now;
  await invoice.save();

  const wasActive = subscription.status === "active";
  subscription.status = "active";
  subscription.currentPeriodStart = invoice.periodStart;
  subscription.currentPeriodEnd = invoice.periodEnd;
  subscription.nextRenewalDate = subscription.autoRenew ? invoice.periodEnd : null;
  subscription.failedPaymentCount = 0;
  subscription.gracePeriodEndsAt = null;
  if (!subscription.startDate) subscription.startDate = invoice.periodStart;
  await subscription.save();

  const channels = await contactChannels(subscription.clinicId, subscription);

  await notify({
    clinicId: subscription.clinicId,
    clinicName: subscription.clinicName,
    subscriptionId: subscription._id,
    invoiceId: invoice._id,
    type: "payment_successful",
    message: `Payment of ${formatMoney(invoice.amountDue, invoice.currency)} for ${subscription.planName} was successful.`,
    subscriptionStatus: subscription.status,
    amount: invoice.amountDue,
    currency: invoice.currency,
    dueDate: invoice.periodEnd,
    dedupeKey: `payment_successful:${invoice._id}`,
    simulateChannels: channels,
  });
  await emitWebhook("invoice.payment_succeeded", {
    clinicId: subscription.clinicId,
    payload: { invoiceId: invoice._id, attemptId: attempt._id, amount: invoice.amountDue },
  });

  if (renewal || wasActive) {
    await notify({
      clinicId: subscription.clinicId,
      clinicName: subscription.clinicName,
      subscriptionId: subscription._id,
      invoiceId: invoice._id,
      type: "subscription_renewed",
      message: `Your ${subscription.planName} subscription renewed until ${new Date(invoice.periodEnd).toISOString().slice(0, 10)}.`,
      subscriptionStatus: subscription.status,
      amount: invoice.amountDue,
      currency: invoice.currency,
      dueDate: invoice.periodEnd,
      dedupeKey: `subscription_renewed:${invoice._id}`,
      simulateChannels: channels,
    });
    await emitWebhook("customer.subscription.updated", {
      clinicId: subscription.clinicId,
      payload: { subscriptionId: subscription._id, status: "active", event: "renewed" },
    });
  }

  return subscription;
}

export async function applyFailedPayment(subscription, invoice, attempt, { renewal = false, actor } = {}) {
  const now = await billingNow();
  subscription.failedPaymentCount += 1;

  if (renewal || subscription.status === "active" || subscription.status === "past_due") {
    // A previously-active subscription enters the grace period.
    subscription.status = "past_due";
    if (!subscription.gracePeriodEndsAt) {
      subscription.gracePeriodEndsAt = addDays(now, subscription.gracePeriodDays);
    }
  } else {
    // First-ever payment failed.
    subscription.status = "payment_failed";
    subscription.gracePeriodEndsAt = addDays(now, subscription.gracePeriodDays);
  }
  await subscription.save();

  const channels = await contactChannels(subscription.clinicId, subscription);
  await notify({
    clinicId: subscription.clinicId,
    clinicName: subscription.clinicName,
    subscriptionId: subscription._id,
    invoiceId: invoice._id,
    type: "payment_failed",
    message: `Payment of ${formatMoney(invoice.amountDue, invoice.currency)} failed: ${attempt.failureMessage || "declined"}.`,
    subscriptionStatus: subscription.status,
    amount: invoice.amountDue,
    currency: invoice.currency,
    dueDate: subscription.gracePeriodEndsAt,
    recommendedAction: "Update your payment method and retry the payment before the grace period ends.",
    dedupeKey: `payment_failed:${attempt._id}`,
    simulateChannels: channels,
  });
  await emitWebhook("invoice.payment_failed", {
    clinicId: subscription.clinicId,
    payload: { invoiceId: invoice._id, attemptId: attempt._id, code: attempt.failureCode },
  });
  return subscription;
}

// ---- create subscription ---------------------------------------------------
export const SINGLE_PLAN_KEY = "pro";

export async function createSubscription({ clinicId, planKey = SINGLE_PLAN_KEY, billingCycle = "monthly", testToken = "tok_test_visa", autoRenew = true, actor }) {
  if (!mongoose.Types.ObjectId.isValid(String(clinicId))) {
    return { error: "Invalid clinic id.", status: 400 };
  }
  const clinic = await Clinic.findById(clinicId).lean();
  if (!clinic) return { error: "Clinic not found.", status: 404 };

  // Single fixed product: anything missing falls back to "pro"; anything else
  // is rejected so legacy plan keys can't create new subscriptions.
  const effectiveKey = String(planKey || SINGLE_PLAN_KEY).toLowerCase();
  const plan = await SubscriptionPlan.findOne({ key: effectiveKey, isActive: true });
  if (!plan) return { error: "Subscription plan not found.", status: 404 };
  if (!["monthly", "yearly"].includes(billingCycle)) return { error: "Invalid billing cycle.", status: 400 };
  if (!(testToken in TEST_TOKENS)) return { error: "Unknown test payment token.", status: 400 };

  // One current subscription per clinic (idempotent against double-submit).
  const current = await Subscription.findOne({ clinicId, status: { $in: ACTIVEISH } });
  if (current) {
    const msg = current.status === "pending"
      ? "This clinic already has a pending subscription setup. Complete or cancel it before starting a new one — do not pay again."
      : "This clinic already has an active subscription.";
    return { error: msg, status: 409, subscription: current };
  }

  const now = await billingNow();
  const amount = priceFor(plan, billingCycle);
  const method = await createPaymentMethod(clinicId, testToken);
  const adminUser = await User.findOne({ clinicId, role: "CLINIC_ADMIN" }).select("email").lean();

  const trial = plan.trialDays > 0;
  const trialEndsAt = trial ? addDays(now, plan.trialDays) : null;

  const subscription = await Subscription.create({
    clinicId,
    clinicName: clinic.name,
    planId: plan._id,
    planKey: plan.key,
    planName: plan.name,
    providerRef: mockId("sub"),
    status: trial ? "trialing" : "pending",
    billingCycle,
    currency: plan.currency,
    amount,
    paymentMethodId: method._id,
    startDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: trial ? trialEndsAt : addCycle(now, billingCycle),
    nextRenewalDate: trial ? trialEndsAt : addCycle(now, billingCycle),
    trialEndsAt,
    autoRenew,
    gracePeriodDays: plan.gracePeriodDays,
    metadata: { notifyEmail: adminUser?.email || "", notifyPhone: clinic.contactNumber || "" },
  });

  const channels = await contactChannels(clinicId, subscription);
  await audit({
    actorType: actor?.type || "clinic",
    actorId: actor?.id,
    actorEmail: actor?.email,
    action: "subscription.created",
    entityType: "Subscription",
    entityId: subscription._id,
    clinicId,
    summary: `Created ${plan.name} (${billingCycle}) subscription — ${trial ? "trial" : "immediate charge"}`,
    metadata: { planKey: plan.key, amount, trial },
  });
  await emitWebhook("customer.subscription.created", {
    clinicId,
    payload: { subscriptionId: subscription._id, planKey: plan.key, status: subscription.status },
  });
  await notify({
    clinicId,
    clinicName: clinic.name,
    subscriptionId: subscription._id,
    type: "subscription_created",
    message: trial
      ? `Your ${plan.name} trial has started and ends on ${trialEndsAt.toISOString().slice(0, 10)}.`
      : `Your ${plan.name} subscription was created.`,
    subscriptionStatus: subscription.status,
    amount,
    currency: subscription.currency,
    dueDate: subscription.nextRenewalDate,
    dedupeKey: `subscription_created:${subscription._id}`,
    simulateChannels: channels,
  });

  // Trial: no immediate charge.
  if (trial) {
    return { subscription, invoice: null, attempt: null, outcome: "trialing" };
  }

  // Immediate first charge.
  const invoice = await generateInvoice(subscription, subscription.currentPeriodStart, subscription.currentPeriodEnd, { reason: "initial" });
  const { attempt } = await chargeInvoice({
    subscription,
    invoice,
    method,
    idempotencyKey: `charge:${invoice._id}:1`,
    actor,
  });

  if (attempt.status === "succeeded") {
    await applySuccessfulPayment(subscription, invoice, attempt, { renewal: false, actor });
    return { subscription, invoice, attempt, outcome: "active" };
  }
  if (attempt.status === "pending") {
    // Delayed settlement — stays pending; engine settles later.
    return { subscription, invoice, attempt, outcome: "pending" };
  }
  await applyFailedPayment(subscription, invoice, attempt, { renewal: false, actor });
  return { subscription, invoice, attempt, outcome: "payment_failed" };
}

// ---- renewal (called by the engine at nextRenewalDate) ---------------------
export async function renewSubscription(subscription, { actor } = {}) {
  const method = await PaymentMethod.findById(subscription.paymentMethodId);
  const start = subscription.currentPeriodEnd || (await billingNow());
  const end = addCycle(start, subscription.billingCycle);
  const invoice = await generateInvoice(subscription, start, end, { reason: "renewal" });

  if (invoice.status === "paid") return { subscription, invoice, outcome: "already_paid" };

  const { attempt } = await chargeInvoice({
    subscription,
    invoice,
    method,
    idempotencyKey: `charge:${invoice._id}:${invoice.attemptCount + 1}`,
    actor,
  });

  if (attempt.status === "succeeded") {
    await applySuccessfulPayment(subscription, invoice, attempt, { renewal: true, actor });
    return { subscription, invoice, attempt, outcome: "renewed" };
  }
  if (attempt.status === "pending") return { subscription, invoice, attempt, outcome: "pending" };
  await applyFailedPayment(subscription, invoice, attempt, { renewal: true, actor });
  return { subscription, invoice, attempt, outcome: "past_due" };
}

// ---- start billing when a trial ends ---------------------------------------
export async function startTrialBilling(subscription, { actor } = {}) {
  const method = await PaymentMethod.findById(subscription.paymentMethodId);
  const start = subscription.trialEndsAt || (await billingNow());
  const end = addCycle(start, subscription.billingCycle);
  const invoice = await generateInvoice(subscription, start, end, { reason: "post-trial" });
  const { attempt } = await chargeInvoice({
    subscription,
    invoice,
    method,
    idempotencyKey: `charge:${invoice._id}:${invoice.attemptCount + 1}`,
    actor,
  });
  if (attempt.status === "succeeded") {
    await applySuccessfulPayment(subscription, invoice, attempt, { renewal: false, actor });
    return { subscription, invoice, attempt, outcome: "active" };
  }
  if (attempt.status === "pending") return { subscription, invoice, attempt, outcome: "pending" };
  await applyFailedPayment(subscription, invoice, attempt, { renewal: false, actor });
  return { subscription, invoice, attempt, outcome: "payment_failed" };
}

// ---- settle delayed/pending attempts ---------------------------------------
export async function settlePendingAttempts({ actor } = {}) {
  const now = await billingNow();
  const pending = await PaymentAttempt.find({ status: "pending", settledAt: { $lte: now } });
  const settled = [];
  for (const attempt of pending) {
    attempt.status = "succeeded";
    attempt.outcome = "success";
    await attempt.save();
    const invoice = await Invoice.findById(attempt.invoiceId);
    const subscription = await Subscription.findById(attempt.subscriptionId);
    if (invoice && subscription && invoice.status !== "paid") {
      const renewal = subscription.status === "active" || subscription.status === "past_due";
      await applySuccessfulPayment(subscription, invoice, attempt, { renewal, actor });
    }
    settled.push(attempt._id);
  }
  return settled;
}

// ---- lifecycle actions -----------------------------------------------------
export async function cancelSubscription(subscription, { atPeriodEnd = false, actor } = {}) {
  const now = await billingNow();
  if (atPeriodEnd) {
    subscription.cancelAtPeriodEnd = true;
    subscription.autoRenew = false;
  } else {
    subscription.status = "canceled";
    subscription.canceledAt = now;
    subscription.autoRenew = false;
    subscription.nextRenewalDate = null;
    subscription.endedAt = now;
  }
  await subscription.save();
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.canceled", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: atPeriodEnd ? "Cancel at period end" : "Canceled immediately" });
  await emitWebhook("customer.subscription.deleted", { clinicId: subscription.clinicId, payload: { subscriptionId: subscription._id, atPeriodEnd } });
  await notify({
    clinicId: subscription.clinicId, clinicName: subscription.clinicName, subscriptionId: subscription._id,
    type: "subscription_canceled",
    message: atPeriodEnd ? `Your ${subscription.planName} subscription will end on ${new Date(subscription.currentPeriodEnd).toISOString().slice(0, 10)}.` : `Your ${subscription.planName} subscription has been canceled.`,
    subscriptionStatus: subscription.status, amount: subscription.amount, currency: subscription.currency,
    dueDate: subscription.currentPeriodEnd,
    dedupeKey: `subscription_canceled:${subscription._id}:${periodKey(now)}`,
    simulateChannels: await contactChannels(subscription.clinicId, subscription),
  });
  return subscription;
}

export async function pauseSubscription(subscription, { actor } = {}) {
  const now = await billingNow();
  // Remember what we paused from so resume can restore trialing vs active.
  subscription.metadata = subscription.metadata || {};
  subscription.metadata.pausedFrom = subscription.status;
  subscription.status = "paused";
  subscription.pausedAt = now;
  subscription.autoRenew = false;
  await subscription.save();
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.paused", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: "Paused" });
  await emitWebhook("customer.subscription.paused", { clinicId: subscription.clinicId, payload: { subscriptionId: subscription._id } });
  await notify({
    clinicId: subscription.clinicId, clinicName: subscription.clinicName, subscriptionId: subscription._id,
    type: "subscription_paused", message: `Your ${subscription.planName} subscription is paused.`,
    subscriptionStatus: "paused", amount: subscription.amount, currency: subscription.currency,
    dedupeKey: `subscription_paused:${subscription._id}:${periodKey(now)}`,
    simulateChannels: await contactChannels(subscription.clinicId, subscription),
  });
  return subscription;
}

export async function resumeSubscription(subscription, { actor } = {}) {
  const now = await billingNow();
  const pausedFrom = subscription.metadata?.pausedFrom;
  // Restore trialing when the trial window is still in the future.
  const trialAlive = subscription.trialEndsAt && new Date(subscription.trialEndsAt) > now;
  subscription.status = pausedFrom === "trialing" && trialAlive ? "trialing" : "active";
  subscription.resumedAt = now;
  subscription.autoRenew = true;
  subscription.pausedAt = null;
  if (subscription.metadata) delete subscription.metadata.pausedFrom;
  if (!subscription.nextRenewalDate) subscription.nextRenewalDate = subscription.currentPeriodEnd || addCycle(now, subscription.billingCycle);
  await subscription.save();
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.resumed", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: "Resumed" });
  await emitWebhook("customer.subscription.resumed", { clinicId: subscription.clinicId, payload: { subscriptionId: subscription._id } });
  await notify({
    clinicId: subscription.clinicId, clinicName: subscription.clinicName, subscriptionId: subscription._id,
    type: "subscription_resumed", message: `Your ${subscription.planName} subscription has resumed.`,
    subscriptionStatus: "active", amount: subscription.amount, currency: subscription.currency,
    dueDate: subscription.nextRenewalDate,
    dedupeKey: `subscription_resumed:${subscription._id}:${periodKey(now)}`,
    simulateChannels: await contactChannels(subscription.clinicId, subscription),
  });
  return subscription;
}

export async function changePlan(subscription, newPlanKey, { actor } = {}) {
  const plan = await SubscriptionPlan.findOne({ key: String(newPlanKey).toLowerCase(), isActive: true });
  if (!plan) return { error: "Target plan not found.", status: 404 };
  const oldName = subscription.planName;
  subscription.planId = plan._id;
  subscription.planKey = plan.key;
  subscription.planName = plan.name;
  subscription.amount = priceFor(plan, subscription.billingCycle);
  subscription.gracePeriodDays = plan.gracePeriodDays;
  await subscription.save();
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.plan_changed", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: `Plan ${oldName} → ${plan.name}` });
  await emitWebhook("customer.subscription.updated", { clinicId: subscription.clinicId, payload: { subscriptionId: subscription._id, event: "plan_changed", planKey: plan.key } });
  return { subscription };
}

// ---- switch billing cycle (monthly <-> yearly) -----------------------------
// Single-plan product: this IS "change plan" for clinics. The switch restarts
// the billing period today and charges the new cycle amount immediately via
// the stored method (same semantics as subscribing). Mid-period remainder is
// not prorated — callers must surface that in UI copy.
export async function changeBillingCycle(subscription, newCycle, { actor } = {}) {
  if (!["monthly", "yearly"].includes(newCycle)) return { error: "Invalid billing cycle.", status: 400 };
  if (["canceled", "expired"].includes(subscription.status))
    return { error: "This subscription is closed. Start a new one to change billing.", status: 409 };
  if (!["active", "trialing"].includes(subscription.status))
    return { error: "Settle or cancel the current subscription before switching cycles.", status: 409 };
  if (subscription.billingCycle === newCycle) return { subscription, unchanged: true };

  const plan = await SubscriptionPlan.findOne({ key: subscription.planKey, isActive: true });
  if (!plan) return { error: "Subscription plan not found.", status: 404 };

  const oldCycle = subscription.billingCycle;
  const now = await billingNow();
  subscription.billingCycle = newCycle;
  subscription.amount = priceFor(plan, newCycle);
  subscription.gracePeriodDays = plan.gracePeriodDays;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = addCycle(now, newCycle);
  subscription.nextRenewalDate = subscription.autoRenew ? subscription.currentPeriodEnd : subscription.nextRenewalDate;
  await subscription.save();

  const method = await PaymentMethod.findById(subscription.paymentMethodId);
  const invoice = await generateInvoice(subscription, subscription.currentPeriodStart, subscription.currentPeriodEnd, { reason: "cycle-switch" });
  const { attempt } = await chargeInvoice({
    subscription,
    invoice,
    method,
    idempotencyKey: `cycle:${invoice._id}`,
    actor,
  });

  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.cycle_changed", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: `Cycle ${oldCycle} → ${newCycle} (${formatMoney(subscription.amount, subscription.currency)})`, metadata: { from: oldCycle, to: newCycle } });
  await emitWebhook("customer.subscription.updated", { clinicId: subscription.clinicId, payload: { subscriptionId: subscription._id, event: "cycle_changed", billingCycle: newCycle } });

  if (attempt.status === "succeeded") {
    await applySuccessfulPayment(subscription, invoice, attempt, { renewal: false, actor });
    return { subscription, invoice, attempt, outcome: "switched" };
  }
  if (attempt.status === "pending") return { subscription, invoice, attempt, outcome: "pending" };
  await applyFailedPayment(subscription, invoice, attempt, { renewal: false, actor });
  return { subscription, invoice, attempt, outcome: "payment_failed" };
}

export async function extendTrial(subscription, days, { actor } = {}) {
  const now = await billingNow();
  const base = subscription.trialEndsAt && subscription.trialEndsAt > now ? subscription.trialEndsAt : now;
  subscription.trialEndsAt = addDays(base, Math.max(1, Number(days) || 0));
  subscription.status = "trialing";
  subscription.currentPeriodEnd = subscription.trialEndsAt;
  subscription.nextRenewalDate = subscription.trialEndsAt;
  await subscription.save();
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.trial_extended", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: `Trial extended to ${subscription.trialEndsAt.toISOString().slice(0, 10)}` });
  return { subscription };
}

export async function configureNextOutcome(subscription, outcome, { actor } = {}) {
  subscription.nextPaymentOutcome = outcome || "";
  await subscription.save();
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "subscription.next_outcome_set", entityType: "Subscription", entityId: subscription._id, clinicId: subscription.clinicId, summary: `Next payment outcome forced to "${outcome || "(default)"}"` });
  return { subscription };
}

// ---- admin: retry a failed invoice ----------------------------------------
export async function retryPayment(invoice, { forcedOutcome = "", actor } = {}) {
  const subscription = await Subscription.findById(invoice.subscriptionId);
  if (!subscription) return { error: "Subscription not found.", status: 404 };
  if (invoice.status === "paid") return { error: "Invoice is already paid.", status: 409 };
  const method = await PaymentMethod.findById(subscription.paymentMethodId);

  const { attempt } = await chargeInvoice({
    subscription,
    invoice,
    method,
    idempotencyKey: `charge:${invoice._id}:${invoice.attemptCount + 1}`,
    forcedOutcome,
    actor,
  });
  if (attempt.status === "succeeded") {
    const renewal = subscription.status === "past_due" || subscription.status === "active" || subscription.status === "unpaid";
    await applySuccessfulPayment(subscription, invoice, attempt, { renewal, actor });
    return { subscription, invoice, attempt, outcome: "paid" };
  }
  if (attempt.status === "pending") return { subscription, invoice, attempt, outcome: "pending" };
  await applyFailedPayment(subscription, invoice, attempt, { renewal: true, actor });
  return { subscription, invoice, attempt, outcome: "failed" };
}

// ---- admin: mark invoice paid (manual/offline) -----------------------------
export async function markInvoicePaid(invoice, { actor } = {}) {
  if (invoice.status === "paid") return { error: "Invoice already paid.", status: 409 };
  const subscription = await Subscription.findById(invoice.subscriptionId);
  const now = await billingNow();
  const attempt = await PaymentAttempt.create({
    clinicId: invoice.clinicId,
    subscriptionId: invoice.subscriptionId,
    invoiceId: invoice._id,
    providerRef: mockId("ch"),
    amount: invoice.amountDue,
    currency: invoice.currency,
    status: "succeeded",
    outcome: "success",
    method: { type: "manual", brand: "Manual", last4: "----", testToken: "manual" },
    idempotencyKey: `manual:${invoice._id}:${now.getTime()}`,
    settledAt: now,
  });
  if (subscription) {
    const renewal = subscription.status !== "pending" && subscription.status !== "payment_failed";
    await applySuccessfulPayment(subscription, invoice, attempt, { renewal, actor });
  } else {
    invoice.status = "paid";
    invoice.amountPaid = invoice.amountDue;
    invoice.paidAt = now;
    await invoice.save();
  }
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "invoice.marked_paid", entityType: "Invoice", entityId: invoice._id, clinicId: invoice.clinicId, summary: `Invoice ${invoice.number} marked paid manually` });
  return { invoice, attempt };
}

// ---- refunds (full & partial, idempotent) ----------------------------------
export async function issueRefund({ invoice, amount, reason = "", actor, idempotencyKey }) {
  if (invoice.status !== "paid" && invoice.status !== "partially_refunded") {
    return { error: "Only paid invoices can be refunded.", status: 409 };
  }
  const maxRefundable = money(invoice.amountPaid - invoice.amountRefunded);
  const refundAmount = amount == null ? maxRefundable : money(amount);
  if (refundAmount <= 0 || refundAmount > maxRefundable) {
    return { error: `Refund amount must be between 0 and ${formatMoney(maxRefundable, invoice.currency)}.`, status: 400 };
  }

  const key = idempotencyKey || `refund:${invoice._id}:${refundAmount}`;
  const prior = await Refund.findOne({ idempotencyKey: key });
  if (prior) return { refund: prior, invoice, duplicate: true };

  const gateway = getGateway();
  const now = await billingNow();
  const lastAttempt = await PaymentAttempt.findOne({ invoiceId: invoice._id, status: "succeeded" }).sort({ createdAt: -1 });
  const result = await gateway.refund({ amount: refundAmount, currency: invoice.currency, now });

  let refund;
  try {
    refund = await Refund.create({
      clinicId: invoice.clinicId,
      invoiceId: invoice._id,
      paymentAttemptId: lastAttempt?._id,
      providerRef: result.providerRef,
      amount: refundAmount,
      currency: invoice.currency,
      type: refundAmount >= maxRefundable ? "full" : "partial",
      reason,
      status: result.status,
      idempotencyKey: key,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const again = await Refund.findOne({ idempotencyKey: key });
      return { refund: again, invoice, duplicate: true };
    }
    throw err;
  }

  invoice.amountRefunded = money(invoice.amountRefunded + refundAmount);
  invoice.status = invoice.amountRefunded >= invoice.amountPaid ? "refunded" : "partially_refunded";
  await invoice.save();

  const subscription = await Subscription.findById(invoice.subscriptionId);
  await audit({ actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email, action: "refund.issued", entityType: "Refund", entityId: refund._id, clinicId: invoice.clinicId, summary: `${refund.type} refund ${formatMoney(refundAmount, invoice.currency)} on ${invoice.number}` });
  await emitWebhook("charge.refunded", { clinicId: invoice.clinicId, payload: { invoiceId: invoice._id, refundId: refund._id, amount: refundAmount } });
  await notify({
    clinicId: invoice.clinicId, clinicName: subscription?.clinicName || "", subscriptionId: invoice.subscriptionId, invoiceId: invoice._id,
    type: "refund_issued",
    message: `A ${refund.type} refund of ${formatMoney(refundAmount, invoice.currency)} was issued for ${invoice.number}.`,
    subscriptionStatus: subscription?.status || "", amount: refundAmount, currency: invoice.currency,
    dedupeKey: `refund_issued:${refund._id}`,
    simulateChannels: subscription ? await contactChannels(invoice.clinicId, subscription) : [],
  });
  return { refund, invoice, duplicate: false };
}

// ---- registration: activate a subscription that was PAID up-front ----------
// Called from /register/verify after the Clinic+Admin are created. The charge
// already happened at initiate time (before the account existed), so we record
// it as a succeeded payment and bring the subscription up as active.
export async function activatePaidSubscriptionForRegistration({ clinic, planKey, billingCycle = "monthly", payment = {}, adminEmail = "", actor } = {}) {
  const plan = await SubscriptionPlan.findOne({ key: String(planKey).toLowerCase() });
  if (!plan) return { error: "Plan not found." };

  // Idempotency: never create a second subscription for the same clinic.
  const existing = await Subscription.findOne({ clinicId: clinic._id, status: { $in: ACTIVEISH } });
  if (existing) return { subscription: existing, duplicate: true };

  const now = await billingNow();
  const method = await createPaymentMethod(clinic._id, payment.testToken || "tok_test_visa");
  const end = addCycle(now, billingCycle);
  const amount = money(payment.amount);

  const subscription = await Subscription.create({
    clinicId: clinic._id,
    clinicName: clinic.name,
    planId: plan._id,
    planKey: plan.key,
    planName: plan.name,
    providerRef: mockId("sub"),
    status: "pending", // applySuccessfulPayment flips this to "active" below
    billingCycle,
    currency: payment.currency || plan.currency,
    amount,
    paymentMethodId: method._id,
    startDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: end,
    nextRenewalDate: end,
    autoRenew: true,
    gracePeriodDays: plan.gracePeriodDays,
    metadata: { notifyEmail: adminEmail || "", notifyPhone: clinic.contactNumber || "" },
  });

  const invoice = await generateInvoice(subscription, now, end, { reason: "initial (paid at registration)" });
  const attempt = await PaymentAttempt.create({
    clinicId: clinic._id,
    subscriptionId: subscription._id,
    invoiceId: invoice._id,
    providerRef: payment.providerRef || mockId("ch"),
    amount,
    currency: subscription.currency,
    status: "succeeded",
    outcome: "success",
    method: { type: payment.type || "card", provider: payment.provider || payment.brand, brand: payment.brand, last4: payment.last4, testToken: payment.testToken },
    idempotencyKey: `reg:${invoice._id}`,
    settledAt: payment.paidAt || now,
  });
  invoice.attemptCount += 1;
  await invoice.save();

  await audit({
    actorType: actor?.type || "system", actorId: actor?.id, actorEmail: actor?.email,
    action: "subscription.created", entityType: "Subscription", entityId: subscription._id, clinicId: clinic._id,
    summary: `Created ${plan.name} (${billingCycle}) — paid at registration`, metadata: { planKey: plan.key, amount, prepaid: true },
  });
  await emitWebhook("customer.subscription.created", { clinicId: clinic._id, payload: { subscriptionId: subscription._id, planKey: plan.key, status: "active", prepaid: true } });
  await notify({
    clinicId: clinic._id, clinicName: clinic.name, subscriptionId: subscription._id, type: "subscription_created",
    message: `Your ${plan.name} subscription is active.`, subscriptionStatus: "active", amount, currency: subscription.currency,
    dueDate: end, dedupeKey: `subscription_created:${subscription._id}`,
    simulateChannels: adminEmail ? [{ channel: "email", to: adminEmail }] : [],
  });

  // Marks the invoice paid + emits payment_successful (single source of truth).
  await applySuccessfulPayment(subscription, invoice, attempt, { renewal: false, actor });
  return { subscription, invoice, attempt, duplicate: false };
}

// ---- reconcile an interrupted registration activation ----------------------
// Repairs the `pending subscription + open invoice + zero succeeded attempts`
// state left when verify's activation died midway (the prepaid charge at
// initiate already succeeded, so this MUST NOT touch the gateway — no second
// charge). Idempotent: a second call returns the already-active subscription.
export async function reconcileRegistrationSubscription({ clinicId, paymentRef = "", actor } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(clinicId))) {
    return { error: "Invalid clinic id.", status: 400 };
  }
  const clinic = await Clinic.findById(clinicId).lean();
  if (!clinic) return { error: "Clinic not found.", status: 404 };

  const subscription = await Subscription.findOne({ clinicId }).sort({ createdAt: -1 });
  if (!subscription) return { error: "No subscription found for this clinic.", status: 404 };
  if (subscription.status === "active") return { subscription, duplicate: true };

  const invoice = await Invoice.findOne({
    clinicId,
    subscriptionId: subscription._id,
    status: "open",
  }).sort({ createdAt: -1 });
  if (!invoice) {
    return { error: "No open invoice to reconcile (nothing to activate).", status: 409 };
  }
  const succeeded = await PaymentAttempt.findOne({
    invoiceId: invoice._id,
    status: "succeeded",
  }).select("_id").lean();
  if (succeeded) {
    return { error: "Invoice already has a successful payment; run the billing cycle instead.", status: 409 };
  }

  const now = await billingNow();
  const method = await PaymentMethod.findById(subscription.paymentMethodId).lean();
  const attempt = await PaymentAttempt.create({
    clinicId,
    subscriptionId: subscription._id,
    invoiceId: invoice._id,
    providerRef: paymentRef || mockId("ch"),
    amount: invoice.amountDue,
    currency: invoice.currency,
    status: "succeeded",
    outcome: "success",
    failureMessage: "",
    method: {
      type: method?.type || "card",
      provider: method?.provider || method?.brand || "",
      brand: method?.brand || "",
      last4: method?.last4 || "",
      testToken: method?.testToken || "",
    },
    // Unique per invoice: safe to retry, never duplicates the charge record.
    idempotencyKey: `reconcile:${invoice._id}`,
    settledAt: now,
  }).catch(async (err) => {
    if (err && err.code === 11000) return PaymentAttempt.findOne({ idempotencyKey: `reconcile:${invoice._id}` });
    throw err;
  });
  invoice.attemptCount += 1;
  await invoice.save();

  await audit({
    actorType: actor?.type || "admin", actorId: actor?.id, actorEmail: actor?.email,
    action: "subscription.reconciled", entityType: "Subscription", entityId: subscription._id, clinicId,
    summary: `Reconciled interrupted registration activation against prepaid ${paymentRef || attempt.providerRef}; no new charge`,
    metadata: { paymentRef: paymentRef || null, invoice: invoice.number },
  });

  const renewal = subscription.status !== "pending" && subscription.status !== "payment_failed";
  await applySuccessfulPayment(subscription, invoice, attempt, { renewal, actor });
  return { subscription, invoice, attempt, duplicate: false };
}

// ---- webhook processing (idempotent by eventId) ----------------------------
export async function processWebhookEvent(eventId) {
  const { WebhookEvent } = await import("../../models/billingModels.js");
  const event = await WebhookEvent.findOne({ eventId });
  if (!event) return { error: "Event not found.", status: 404 };
  if (event.status === "processed" && event.processedAt) {
    return { event, alreadyProcessed: true };
  }
  event.status = "processed";
  event.processedAt = await billingNow();
  await event.save();
  return { event, alreadyProcessed: false };
}
