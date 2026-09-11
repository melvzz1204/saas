// src/services/billing/recorders.js
// Cross-cutting recorders: audit log, (idempotent) notifications, webhook events.
import {
  AuditLog,
  BillingNotification,
  WebhookEvent,
} from "../../models/billingModels.js";
import { mockId } from "./helpers.js";

export async function audit(entry) {
  try {
    await AuditLog.create({
      actorType: entry.actorType || "system",
      actorId: entry.actorId ? String(entry.actorId) : "",
      actorEmail: entry.actorEmail || "",
      action: entry.action,
      entityType: entry.entityType || "",
      entityId: entry.entityId ? String(entry.entityId) : "",
      clinicId: entry.clinicId,
      summary: entry.summary || "",
      metadata: entry.metadata || {},
    });
  } catch (err) {
    console.error("audit log failed:", err.message);
  }
}

// Emit a provider-style webhook event (persisted, replayable). Emission itself
// is naturally unique (random eventId); *processing* incoming events is deduped
// by eventId in billingService.processWebhookEvent.
export async function emitWebhook(type, { clinicId, payload = {} } = {}) {
  try {
    return await WebhookEvent.create({
      eventId: mockId("evt"),
      type,
      clinicId,
      payload,
      status: "processed",
      processedAt: new Date(),
    });
  } catch (err) {
    console.error("webhook emit failed:", err.message);
    return null;
  }
}

// Default "recommended action" copy per notification type.
const RECOMMENDED_ACTION = {
  subscription_created: "No action needed. Your subscription is set up.",
  payment_successful: "No action needed. A receipt is available in your invoices.",
  payment_failed: "Update your payment method and retry the payment.",
  payment_due_soon: "Ensure your payment method is valid before the due date.",
  payment_overdue: "Pay the outstanding invoice now to avoid service interruption.",
  subscription_renewed: "No action needed. Your plan renewed successfully.",
  subscription_canceled: "Reactivate anytime from your billing settings.",
  subscription_paused: "Resume your subscription when you're ready.",
  subscription_resumed: "No action needed. Your subscription is active again.",
  trial_ending: "Add or confirm a payment method to continue after the trial.",
  refund_issued: "No action needed. The refund has been recorded.",
  payment_method_expiring: "Update your card details before it expires.",
};

// Create a notification. If `dedupeKey` is supplied, it is idempotent — repeated
// lifecycle triggers (e.g. "due soon") never create duplicates.
// `channels` optionally simulates email/SMS delivery as LOGS (never a real send).
export async function notify(data) {
  const doc = {
    clinicId: data.clinicId,
    clinicName: data.clinicName || "",
    subscriptionId: data.subscriptionId,
    invoiceId: data.invoiceId,
    type: data.type,
    message: data.message,
    subscriptionStatus: data.subscriptionStatus || "",
    amount: data.amount == null ? null : data.amount,
    currency: data.currency || "PHP",
    dueDate: data.dueDate || null,
    recommendedAction: data.recommendedAction || RECOMMENDED_ACTION[data.type] || "",
    dedupeKey: data.dedupeKey || undefined,
    channels: [],
  };

  // Simulated multi-channel delivery (logged only).
  const sentAt = new Date();
  for (const ch of data.simulateChannels || []) {
    if (!ch?.to) continue;
    doc.channels.push({ channel: ch.channel, to: ch.to, sentAt });
    console.log(
      `[SIM ${String(ch.channel).toUpperCase()}] to=${ch.to} type=${data.type} clinic="${doc.clinicName}"`,
    );
  }

  if (doc.dedupeKey) {
    const existing = await BillingNotification.findOne({ dedupeKey: doc.dedupeKey }).lean();
    if (existing) return { notification: existing, created: false };
    try {
      const created = await BillingNotification.create(doc);
      return { notification: created, created: true };
    } catch (err) {
      if (err && err.code === 11000) {
        const again = await BillingNotification.findOne({ dedupeKey: doc.dedupeKey }).lean();
        return { notification: again, created: false };
      }
      throw err;
    }
  }

  const created = await BillingNotification.create(doc);
  return { notification: created, created: true };
}
