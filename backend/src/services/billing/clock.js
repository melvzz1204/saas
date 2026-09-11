// src/services/billing/clock.js
// Simulation clock. Every billing time-check goes through billingNow() so the
// entire lifecycle can be demonstrated by advancing the clock instead of
// waiting for real calendar dates.
import { BillingClock } from "../../models/billingModels.js";

export async function getClock() {
  let clock = await BillingClock.findOne({ key: "billing" });
  if (!clock) clock = await BillingClock.create({ key: "billing", offsetMs: 0 });
  return clock;
}

// Current simulated time = real now + configured offset.
export async function billingNow() {
  const clock = await getClock();
  return new Date(Date.now() + (clock.offsetMs || 0));
}

export async function advanceClock(ms) {
  const clock = await getClock();
  clock.offsetMs = (clock.offsetMs || 0) + Math.max(0, Number(ms) || 0);
  await clock.save();
  return clock;
}

export async function setOffset(ms) {
  const clock = await getClock();
  clock.offsetMs = Number(ms) || 0;
  await clock.save();
  return clock;
}

export async function resetClock() {
  return setOffset(0);
}

export const DAY_MS = 24 * 60 * 60 * 1000;
