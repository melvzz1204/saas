// tests/billingGateway.test.js
// Pure unit tests for the SIMULATED payment gateway (no DB).
import { describe, it, expect } from "vitest";
import { MockGateway } from "../src/services/billing/gateway.js";

const gw = new MockGateway();
const m = (testToken, status = "active") => ({ brand: "Visa", last4: "4242", testToken, status });

describe("MockGateway.charge — token-driven outcomes", () => {
  it("approves success tokens", async () => {
    const r = await gw.charge({ amount: 100, method: m("tok_test_visa") });
    expect(r.status).toBe("succeeded");
    expect(r.outcome).toBe("success");
    expect(r.providerRef).toMatch(/^ch_test_/);
  });

  it("declines the decline token with a failure code", async () => {
    const r = await gw.charge({ amount: 100, method: m("tok_test_decline") });
    expect(r.status).toBe("failed");
    expect(r.outcome).toBe("declined");
    expect(r.failureCode).toBe("card_declined");
  });

  it("maps insufficient funds and expired card", async () => {
    expect((await gw.charge({ amount: 1, method: m("tok_test_insufficient_funds") })).outcome).toBe("insufficient_funds");
    expect((await gw.charge({ amount: 1, method: m("tok_test_expired_card") })).outcome).toBe("expired_card");
  });

  it("returns pending with a future settle time for delayed", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const r = await gw.charge({ amount: 1, method: m("tok_test_delayed"), now });
    expect(r.status).toBe("pending");
    expect(new Date(r.settledAt).getTime()).toBeGreaterThan(now.getTime());
  });

  it("treats an expired payment method as expired_card", async () => {
    const r = await gw.charge({ amount: 1, method: m("tok_test_visa", "expired") });
    expect(r.outcome).toBe("expired_card");
    expect(r.status).toBe("failed");
  });
});

describe("MockGateway.charge — forced outcome (admin simulation)", () => {
  it("forces a decline over a success token", async () => {
    const r = await gw.charge({ amount: 100, method: m("tok_test_visa"), forcedOutcome: "declined" });
    expect(r.status).toBe("failed");
    expect(r.outcome).toBe("declined");
  });
  it("forces success over a decline token", async () => {
    const r = await gw.charge({ amount: 100, method: m("tok_test_decline"), forcedOutcome: "success" });
    expect(r.status).toBe("succeeded");
  });
  it("forces insufficient_funds", async () => {
    const r = await gw.charge({ amount: 100, method: m("tok_test_visa"), forcedOutcome: "insufficient_funds" });
    expect(r.outcome).toBe("insufficient_funds");
  });
});

describe("MockGateway.refund", () => {
  it("always succeeds with a re_test_ ref", async () => {
    const r = await gw.refund({ amount: 50 });
    expect(r.status).toBe("succeeded");
    expect(r.providerRef).toMatch(/^re_test_/);
    expect(r.amount).toBe(50);
  });
});
