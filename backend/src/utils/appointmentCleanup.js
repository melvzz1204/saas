import cron from "node-cron";
import Appointment from "../models/appointmentModel.js";

const initAppointmentCleanupJob = () => {
  // 🧪 TEMPORARY TESTING ENGINE: Runs instantly on server boot to force synchronization
  const runCleanupLogic = async () => {
    console.log("🔄 Running appointment cleanup engine validation check...");

    try {
      // 📆 Set target baseline context date string (YYYY-MM-DD)
      const targetDateStr = "2026-06-20";
      const now = new Date();

      // Modern case-insensitive regex pattern matching for active/open statuses
      const openStatusRegex = /^(pending|approved|confirmed)$/i;

      const result = await Appointment.updateMany(
        {
          $and: [
            {
              // Catches dates that are alphabetically before today or older than right now
              $or: [{ date: { $lt: targetDateStr } }, { date: { $lt: now } }],
            },
            {
              // Matches status values case-insensitively (e.g., "APPROVED", "Approved", "approved")
              status: { $regex: openStatusRegex },
            },
          ],
        },
        {
          $set: { status: "missed" }, // Or "missed" depending on your chosen word string!
        },
      );
    } catch (error) {
      console.error("❌ Cleanup execution anomaly:", error);
    }
  };

  // 1. 🔥 Trigger immediately on server boot so we can see the test results live!
  runCleanupLogic();

  // 2. Keep the regular production schedule active
  cron.schedule("0 0 * * *", runCleanupLogic);
};

export default initAppointmentCleanupJob;
