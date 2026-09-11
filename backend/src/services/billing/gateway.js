// src/services/billing/gateway.js
// ============================================================================
// SIMULATED payment gateway. This is the ONLY place that "talks to a provider".
// `getGateway()` is the single integration point — the subscription logic in
// billingService/engine never calls a provider directly, only this interface:
//
//   gateway.charge({ amount, currency, method, idempotencyKey, forcedOutcome })
//   gateway.refund({ amount, currency, idempotencyKey })
//
// TESTING MODE (default, pure mock — no network, no keys, no real money):
//   getGateway() returns PayMongoMockGateway, which behaves EXACTLY like
//   MockGateway (same TEST_TOKENS scenarios) but labels refs PayMongo-style
//   (pi_test_*/pay_test_*/src_test_*/pm_test_*) and adds centavos.
// To use the legacy ch_test_* refs set PAYMONGO_MOCK=false.
// To go live later, point getGateway() at a real PayMongo adapter —
// billingService/engine code stays unchanged.
//
// No real card data is ever handled: behavior is driven by clearly-labelled
// TEST tokens or an admin-forced outcome.
// ============================================================================
import { mockId, money } from "./helpers.js";

// TEST tokens -> outcome. These are the "magic" test methods of the simulation
// (cards, e-wallets, and online banking). No real money ever moves.
export const TEST_TOKENS = {
  tok_test_visa: "success",
  tok_test_success: "success",
  tok_test_mastercard: "success",
  tok_test_decline: "declined",
  tok_test_insufficient_funds: "insufficient_funds",
  tok_test_expired_card: "expired_card",
  tok_test_delayed: "delayed",
  tok_test_error: "error",
  tok_test_gcash: "success",
  tok_test_gcash_decline: "declined",
  tok_test_paymaya: "success",
  tok_test_paymaya_insufficient: "insufficient_funds",
  tok_test_bank: "success",
  tok_test_bank_delayed: "delayed",
  tok_test_gcash_expired: "expired_card",
  tok_test_grabpay: "success",
  tok_test_grabpay_decline: "declined",
};

// Human-friendly catalog surfaced to the UI so users can pick a scenario.
export const TEST_PAYMENT_METHODS = [
  { token: "tok_test_visa", type: "card", provider: "Visa", brand: "Visa", last4: "4242", label: "Visa — always succeeds" },
  { token: "tok_test_mastercard", type: "card", provider: "Mastercard", brand: "Mastercard", last4: "5555", label: "Mastercard — always succeeds" },
  { token: "tok_test_decline", type: "card", provider: "Visa", brand: "Visa", last4: "0002", label: "Generic decline" },
  { token: "tok_test_insufficient_funds", type: "card", provider: "Visa", brand: "Visa", last4: "9995", label: "Insufficient funds" },
  { token: "tok_test_expired_card", type: "card", provider: "Visa", brand: "Visa", last4: "0069", label: "Expired card" },
  { token: "tok_test_delayed", type: "card", provider: "Visa", brand: "Visa", last4: "0077", label: "Delayed / async settlement" },
  { token: "tok_test_error", type: "card", provider: "Visa", brand: "Visa", last4: "0119", label: "Processing error" },
  { token: "tok_test_gcash", type: "gcash", provider: "GCash", brand: "GCash", last4: "0917", label: "GCash — always succeeds" },
  { token: "tok_test_gcash_decline", type: "gcash", provider: "GCash", brand: "GCash", last4: "0918", label: "GCash — declined" },
  { token: "tok_test_gcash_expired", type: "gcash", provider: "GCash", brand: "GCash", last4: "0919", label: "GCash — expired/unlinked" },
  { token: "tok_test_paymaya", type: "paymaya", provider: "PayMaya", brand: "PayMaya", last4: "0918", label: "PayMaya — always succeeds" },
  { token: "tok_test_paymaya_insufficient", type: "paymaya", provider: "PayMaya", brand: "PayMaya", last4: "0920", label: "PayMaya — insufficient balance" },
  { token: "tok_test_bank", type: "bank", provider: "BPI", brand: "BPI Bank", last4: "1234", label: "Online banking — always succeeds" },
  { token: "tok_test_bank_delayed", type: "bank", provider: "BDO", brand: "BDO Bank", last4: "5678", label: "Online banking — delayed settlement" },
  { token: "tok_test_grabpay", type: "grab_pay", provider: "GrabPay", brand: "GrabPay", last4: "0910", label: "GrabPay — always succeeds" },
  { token: "tok_test_grabpay_decline", type: "grab_pay", provider: "GrabPay", brand: "GrabPay", last4: "0911", label: "GrabPay — declined" },
];

const OUTCOME_TO_FAILURE = {
  declined: { code: "card_declined", message: "The card was declined." },
  insufficient_funds: { code: "insufficient_funds", message: "The card has insufficient funds." },
  expired_card: { code: "expired_card", message: "The card has expired." },
  error: { code: "processing_error", message: "An error occurred while processing the payment." },
};

const DELAYED_SETTLE_SECONDS = 60; // pending attempts settle ~1 min later (sim)

export class PaymentGateway {
  // eslint-disable-next-line no-unused-vars
  async charge(_params) {
    throw new Error("charge() not implemented");
  }
  // eslint-disable-next-line no-unused-vars
  async refund(_params) {
    throw new Error("refund() not implemented");
  }
}

export class MockGateway extends PaymentGateway {
  resolveOutcome({ method, forcedOutcome }) {
    if (forcedOutcome && forcedOutcome !== "success" && forcedOutcome in { ...OUTCOME_TO_FAILURE, delayed: 1, duplicate: 1 })
      return forcedOutcome;
    if (forcedOutcome === "success") return "success";

    // Expired method (by date or status) declines as expired_card.
    if (method?.status === "expired") return "expired_card";

    const token = method?.testToken || "tok_test_visa";
    return TEST_TOKENS[token] || "success";
  }

  async charge({ amount, currency = "PHP", method, forcedOutcome = "", now = new Date() }) {
    const outcome = this.resolveOutcome({ method, forcedOutcome });
    const base = {
      providerRef: mockId("ch"),
      amount: money(amount),
      currency,
      outcome,
      failureCode: "",
      failureMessage: "",
      settledAt: null,
    };

    if (outcome === "success" || outcome === "duplicate") {
      return { ...base, status: "succeeded", outcome: "success", settledAt: new Date(now) };
    }
    if (outcome === "delayed") {
      return {
        ...base,
        status: "pending",
        settledAt: new Date(new Date(now).getTime() + DELAYED_SETTLE_SECONDS * 1000),
      };
    }
    const failure = OUTCOME_TO_FAILURE[outcome] || OUTCOME_TO_FAILURE.error;
    return { ...base, status: "failed", failureCode: failure.code, failureMessage: failure.message };
  }

  async refund({ amount, currency = "PHP", now = new Date() }) {
    // The mock provider always accepts refunds.
    return {
      providerRef: mockId("re"),
      amount: money(amount),
      currency,
      status: "succeeded",
      settledAt: new Date(now),
    };
  }
}

// ---- PayMongo-shaped pure mock (TESTING MODE ONLY) --------------------------
// Behaves EXACTLY like MockGateway (same TEST_TOKENS scenarios, same delayed
// window) but labels refs PayMongo-style and adds centavos, so a future swap
// to real PayMongo test keys only changes `getGateway()` below.
export function toCentavos(amountMajor) {
  return Math.round(money(amountMajor) * 100);
}
export function fromCentavos(centavos) {
  return money(centavos / 100);
}

export const PAYMONGO_TYPES = {
  card: "card",
  gcash: "gcash",
  paymaya: "paymaya",
  grab_pay: "grab_pay",
  bank: "dob",
};

export function paymongoTypeFor(method) {
  const kind = method?.type || "card";
  return PAYMONGO_TYPES[kind] || "card";
}

export class PayMongoMockGateway extends MockGateway {
  async charge({ amount, currency = "PHP", method, forcedOutcome = "", now = new Date() }) {
    const result = await super.charge({ amount, currency, method, forcedOutcome, now });
    const pmType = paymongoTypeFor(method);
    const pid = mockId("pi");
    const payId = mockId("pay");
    const srcId = ["gcash", "paymaya", "grab_pay", "dob"].includes(pmType) ? mockId("src") : null;
    const pmId = mockId("pm");
    return {
      ...result,
      providerRef: pid,
      amountCentavos: toCentavos(amount),
      paymongo: {
        paymentIntentId: pid,
        paymentId: payId,
        sourceId: srcId,
        paymentMethodId: pmId,
        paymentMethodType: pmType,
        legacyChargeRef: result.providerRef,
        intentStatus:
          result.status === "succeeded"
            ? "succeeded"
            : result.status === "pending"
              ? "awaiting_next_action"
              : "payment_failed",
      },
    };
  }

  async refund({ amount, currency = "PHP", now = new Date() }) {
    const result = await super.refund({ amount, currency, now });
    return {
      ...result,
      amountCentavos: toCentavos(amount),
      paymongo: { refundId: result.providerRef, status: "succeeded" },
    };
  }
}

let singleton = null;
// Single seam: testing mode (default) returns the PayMongo-shaped mock.
// Set PAYMONGO_MOCK=false for legacy ch_test_* refs. To go live, return a
// real PayMongo adapter here — billingService/engine stay unchanged.
export function getGateway() {
  if (!singleton) {
    singleton = String(process.env.PAYMONGO_MOCK || "true").toLowerCase() === "false"
      ? new MockGateway()
      : new PayMongoMockGateway();
  }
  return singleton;
}
// Test hook: reset the cached gateway between cases.
export function __resetGateway() {
  singleton = null;
}

// Build a lightweight (DB-less) simulated method object from a test token —
// used to charge BEFORE a clinic/payment-method record exists (registration).
export function testMethodFromToken(token) {
  const m = TEST_PAYMENT_METHODS.find((x) => x.token === token) || TEST_PAYMENT_METHODS[0];
  return { type: m.type || "card", provider: m.provider || m.brand, brand: m.brand, last4: m.last4, testToken: m.token, status: "active" };
}
