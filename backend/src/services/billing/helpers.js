// src/services/billing/helpers.js
// Small shared utilities for the simulated billing domain.
import crypto from "crypto";

// Clearly-namespaced mock identifiers (e.g. sub_test_9f2a...). The `_test_`
// marker makes it obvious in logs/DB that nothing here is a real charge.
export function mockId(prefix) {
  return `${prefix}_test_${crypto.randomBytes(9).toString("hex")}`;
}

// Round to 2 decimals to avoid float drift in the simulation.
export function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function invoiceNumber(seq = crypto.randomInt(10000, 99999)) {
  const year = new Date().getUTCFullYear();
  return `INV-${year}-${seq}`;
}

// Advance a date by one billing cycle.
export function addCycle(date, cycle) {
  const d = new Date(date);
  if (cycle === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Stable period key for idempotency/dedupe (per subscription per period).
export function periodKey(date) {
  return new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
}

export function formatMoney(amount, currency = "PHP") {
  const symbol = currency === "PHP" ? "₱" : currency === "USD" ? "$" : "";
  return `${symbol}${money(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
