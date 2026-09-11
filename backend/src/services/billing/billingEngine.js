// src/services/billing/billingEngine.js
// The automatic background worker. runBillingCycle() is safe to run repeatedly
// (idempotent) and is what both the cron tick and the admin "Run billing cycle
// now" action call. It uses the simulation clock, so advancing the clock lets
// you demonstrate the whole lifecycle instantly.
import {
  Subscription,
  Invoice,
  PaymentMethod,
} from "../../models/billingModels.js";
import { billingNow, getClock, DAY_MS } from "./clock.js";
import { addDays, periodKey, formatMoney } from "./helpers.js";
import { notify, audit } from "./recorders.js";
import {
  renewSubscription,
  startTrialBilling,
  settlePendingAttempts,
  cancelSubscription,
} from "./billingService.js";

const DUE_SOON_DAYS = 3;
const TRIAL_ENDING_DAYS = 3;
const PM_EXPIRING_DAYS = 14;

async function contacts(sub) {
  const ch = [];
  if (sub?.metadata?.notifyEmail) ch.push({ channel: "email", to: sub.metadata.notifyEmail });
  if (sub?.metadata?.notifyPhone) ch.push({ channel: "sms", to: sub.metadata.notifyPhone });
  return ch;
}

export async function runBillingCycle({ actor } = {}) {
  const now = await billingNow();
  const summary = {
    now,
    settled: 0,
    trialsEndingNotified: 0,
    trialsCharged: 0,
    renewed: 0,
    renewalFailed: 0,
    dueSoonNotified: 0,
    overdueNotified: 0,
    movedToUnpaid: 0,
    expired: 0,
    canceledAtPeriodEnd: 0,
    pmExpiringNotified: 0,
  };

  // 0) Settle any delayed/pending charges that have reached their settle time.
  summary.settled = (await settlePendingAttempts({ actor })).length;

  // 1) TRIALS
  const trialing = await Subscription.find({ status: "trialing" });
  for (const sub of trialing) {
    if (!sub.trialEndsAt) continue;
    // Trial ending soon.
    if (sub.trialEndsAt > now && sub.trialEndsAt - now <= TRIAL_ENDING_DAYS * DAY_MS) {
      const res = await notify({
        clinicId: sub.clinicId, clinicName: sub.clinicName, subscriptionId: sub._id,
        type: "trial_ending",
        message: `Your ${sub.planName} trial ends on ${sub.trialEndsAt.toISOString().slice(0, 10)}.`,
        subscriptionStatus: "trialing", amount: sub.amount, currency: sub.currency, dueDate: sub.trialEndsAt,
        dedupeKey: `trial_ending:${sub._id}:${periodKey(sub.trialEndsAt)}`,
        simulateChannels: await contacts(sub),
      });
      if (res.created) summary.trialsEndingNotified += 1;
    }
    // Trial ended.
    if (sub.trialEndsAt <= now) {
      if (sub.autoRenew) {
        await startTrialBilling(sub, { actor });
        summary.trialsCharged += 1;
      } else {
        sub.status = "expired";
        sub.endedAt = now;
        await sub.save();
        summary.expired += 1;
      }
    }
  }

  // 2) RENEWALS (active + auto-renew + due)
  const dueRenewals = await Subscription.find({
    status: "active",
    autoRenew: true,
    nextRenewalDate: { $lte: now },
  });
  for (const sub of dueRenewals) {
    if (sub.cancelAtPeriodEnd) {
      await cancelSubscription(sub, { atPeriodEnd: false, actor });
      summary.canceledAtPeriodEnd += 1;
      continue;
    }
    const res = await renewSubscription(sub, { actor });
    if (res.outcome === "renewed") summary.renewed += 1;
    else if (res.outcome === "past_due") summary.renewalFailed += 1;
  }

  // 3) DUE SOON (active, upcoming renewal within window)
  const upcoming = await Subscription.find({
    status: "active",
    autoRenew: true,
    nextRenewalDate: { $gt: now, $lte: new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS) },
  });
  for (const sub of upcoming) {
    const res = await notify({
      clinicId: sub.clinicId, clinicName: sub.clinicName, subscriptionId: sub._id,
      type: "payment_due_soon",
      message: `Your ${sub.planName} renewal of ${formatMoney(sub.amount, sub.currency)} is due on ${sub.nextRenewalDate.toISOString().slice(0, 10)}.`,
      subscriptionStatus: "active", amount: sub.amount, currency: sub.currency, dueDate: sub.nextRenewalDate,
      dedupeKey: `payment_due_soon:${sub._id}:${periodKey(sub.nextRenewalDate)}`,
      simulateChannels: await contacts(sub),
    });
    if (res.created) summary.dueSoonNotified += 1;
  }

  // 4) PAST DUE -> overdue notice; grace elapsed -> unpaid; horizon -> expired
  const pastDue = await Subscription.find({ status: { $in: ["past_due", "payment_failed", "unpaid"] } });
  for (const sub of pastDue) {
    const graceEnd = sub.gracePeriodEndsAt || now;
    // Overdue reminder while within grace.
    if (now <= graceEnd) {
      const res = await notify({
        clinicId: sub.clinicId, clinicName: sub.clinicName, subscriptionId: sub._id,
        type: "payment_overdue",
        message: `Payment for ${sub.planName} is overdue. Please pay before ${graceEnd.toISOString().slice(0, 10)} to avoid suspension.`,
        subscriptionStatus: sub.status, amount: sub.amount, currency: sub.currency, dueDate: graceEnd,
        recommendedAction: "Pay the outstanding invoice now to avoid service interruption.",
        dedupeKey: `payment_overdue:${sub._id}:${periodKey(graceEnd)}`,
        simulateChannels: await contacts(sub),
      });
      if (res.created) summary.overdueNotified += 1;
    } else if (sub.status !== "unpaid" && now <= addDays(graceEnd, sub.gracePeriodDays)) {
      // Grace elapsed -> service suspended (unpaid).
      sub.status = "unpaid";
      await sub.save();
      summary.movedToUnpaid += 1;
      await audit({ actorType: "system", action: "subscription.unpaid", entityType: "Subscription", entityId: sub._id, clinicId: sub.clinicId, summary: "Grace period elapsed; marked unpaid" });
    } else if (now > addDays(graceEnd, sub.gracePeriodDays)) {
      // Expiry horizon passed.
      sub.status = "expired";
      sub.endedAt = now;
      await sub.save();
      summary.expired += 1;
      await audit({ actorType: "system", action: "subscription.expired", entityType: "Subscription", entityId: sub._id, clinicId: sub.clinicId, summary: "Unpaid past expiry horizon; expired" });
    }
  }

  // 5) PAYMENT METHOD EXPIRING (active subscriptions)
  const activeSubs = await Subscription.find({ status: { $in: ["active", "trialing", "past_due"] } });
  for (const sub of activeSubs) {
    const pm = await PaymentMethod.findById(sub.paymentMethodId);
    if (!pm || pm.status === "removed") continue;
    const expiryDate = new Date(pm.expYear, pm.expMonth, 1);
    if (expiryDate > now && expiryDate - now <= PM_EXPIRING_DAYS * DAY_MS) {
      const res = await notify({
        clinicId: sub.clinicId, clinicName: sub.clinicName, subscriptionId: sub._id,
        type: "payment_method_expiring",
        message: `Your ${pm.brand} card ending ${pm.last4} expires soon (${pm.expMonth}/${pm.expYear}).`,
        subscriptionStatus: sub.status, amount: null, currency: sub.currency,
        recommendedAction: "Update your card details before it expires to avoid failed renewals.",
        dedupeKey: `pm_expiring:${pm._id}:${pm.expYear}-${pm.expMonth}`,
        simulateChannels: await contacts(sub),
      });
      if (res.created) summary.pmExpiringNotified += 1;
    }
  }

  const clock = await getClock();
  clock.lastRunAt = new Date();
  await clock.save();

  await audit({ actorType: actor?.type || "system", actorId: actor?.id, actorEmail: actor?.email, action: "billing.cycle_run", entityType: "BillingClock", summary: `Billing cycle run @ ${now.toISOString()}`, metadata: summary });
  return summary;
}
