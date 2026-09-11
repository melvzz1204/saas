// src/utils/billingCron.js
// Periodic, idempotent billing tick. Uses the simulation clock, so in normal
// operation this advances real time; in demos you can instead advance the clock
// and use the admin "Run billing cycle now" action for instant results.
import cron from "node-cron";
import { runBillingCycle } from "../services/billing/billingEngine.js";

export default function initBillingJobs() {
  // Every 15 minutes. Safe to run repeatedly (all effects are idempotent).
  cron.schedule("*/15 * * * *", async () => {
    try {
      const summary = await runBillingCycle({ actor: { type: "system" } });
      console.log("💳 [billing] cycle tick:", JSON.stringify(summary));
    } catch (err) {
      console.error("💳 [billing] cycle error:", err.message);
    }
  });
  console.log("💳 [billing] simulated billing cron scheduled (*/15 min).");
}
