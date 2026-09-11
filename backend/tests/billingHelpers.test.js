// tests/billingHelpers.test.js
// Pure unit tests for billing helpers (no DB).
import { describe, it, expect } from "vitest";
import { money, addCycle, addDays, periodKey, mockId, formatMoney } from "../src/services/billing/helpers.js";

describe("money", () => {
  it("rounds to 2 decimals without float drift", () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(1.239)).toBe(1.24);
    expect(money(2499)).toBe(2499);
  });
});

describe("addCycle", () => {
  it("adds one month for monthly", () => {
    const d = addCycle(new Date("2026-01-15T00:00:00Z"), "monthly");
    expect(d.toISOString().slice(0, 10)).toBe("2026-02-15");
  });
  it("adds one year for yearly", () => {
    const d = addCycle(new Date("2026-01-15T00:00:00Z"), "yearly");
    expect(d.toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});

describe("addDays / periodKey", () => {
  it("adds days", () => {
    expect(addDays(new Date("2026-01-01T00:00:00Z"), 14).toISOString().slice(0, 10)).toBe("2026-01-15");
  });
  it("periodKey is a YYYY-MM-DD string", () => {
    expect(periodKey(new Date("2026-03-09T10:30:00Z"))).toBe("2026-03-09");
  });
});

describe("mockId / formatMoney", () => {
  it("namespaces test ids", () => {
    expect(mockId("sub")).toMatch(/^sub_test_[0-9a-f]+$/);
  });
  it("formats currency", () => {
    expect(formatMoney(2499, "PHP")).toBe("₱2,499.00");
    expect(formatMoney(10, "USD")).toBe("$10.00");
  });
});
