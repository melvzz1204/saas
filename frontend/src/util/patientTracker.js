// src/util/patientTracker.js

let trackerHideTimer = null;

// Finished statuses that keep the tracker hidden on page load
const FINISHED_STATUSES = ["completed", "paid", "settled", "payment_completed"];

export async function initPatientTracker() {
  console.log("🔍 Patient Tracker Initializing...");

  const trackerEl = document.getElementById("live-status-tracker");

  if (!trackerEl) {
    console.warn("⚠️ Element #live-status-tracker not found in DOM.");
    return;
  }

  // 1. Check local storage for patient ID
  const rawUserData = localStorage.getItem("user");
  let patientId = null;

  if (rawUserData) {
    try {
      const user = JSON.parse(rawUserData);
      patientId = user._id || user.id;
    } catch (e) {
      console.warn("⚠️ localStorage 'user' is not valid JSON:", rawUserData);
    }
  }

  if (!patientId) {
    console.warn("⚠️ No patientId found in localStorage.");
    trackerEl.classList.add("hidden");
    return;
  }

  // 2. Fetch today's appointment status
  try {
    const token = localStorage.getItem("token");
    let clinicId = localStorage.getItem("clinicId");

    if (!clinicId && rawUserData) {
      try {
        const userObj = JSON.parse(rawUserData);
        clinicId = userObj.clinicId || userObj.clinic;
      } catch (e) {}
    }

    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (clinicId) headers["x-clinic-id"] = clinicId;

    const API_BASE_URL =
      window.location.hostname === "localhost"
        ? "http://localhost:5000"
        : window.location.origin;

    // 🎯 Properly declared fetch request
    const res = await fetch(
      `${API_BASE_URL}/api/v1/appointments/today?patientId=${patientId}`,
      { headers },
    );

    if (res && res.ok) {
      const data = await res.json();
      console.log("📊 API Today Appointment Data:", data);

      const rawStatus =
        data?.status || data?.appointment?.status || data?.data?.status;
      const doctorName =
        data?.dentistName || data?.doctorName || data?.appointment?.dentistName;

      if (rawStatus) {
        const cleanStatus = String(rawStatus).toLowerCase().trim();

        if (FINISHED_STATUSES.includes(cleanStatus)) {
          console.log(
            `ℹ️ Appointment status is '${cleanStatus}' (Completed). Hiding tracker on page load.`,
          );
          trackerEl.classList.add("hidden");
        } else {
          console.log(
            `✅ Active appointment found ('${cleanStatus}'). Displaying tracker.`,
          );
          trackerEl.classList.remove("hidden", "opacity-0");
          trackerEl.classList.add("opacity-100");
          updateTrackerUI(cleanStatus, doctorName);
        }
      } else {
        console.log("ℹ️ No active appointment status found for today.");
        trackerEl.classList.add("hidden");
      }
    } else {
      console.warn(
        `⚠️ Endpoint returned status ${res ? res.status : "unknown"}`,
      );
      trackerEl.classList.add("hidden");
    }
  } catch (err) {
    console.warn("⚠️ API fetch error:", err);
    trackerEl.classList.add("hidden");
  }

  // 3. WebSocket Listener for Live Updates
  if (typeof io !== "undefined") {
    try {
      const APP_BASE_URL =
        window.location.hostname === "localhost"
          ? "http://localhost:5000"
          : window.location.origin;
      const socket = io(APP_BASE_URL);

      socket.emit("join_patient_room", patientId);
      socket.on("status_updated", (data) => {
        console.log("⚡ Live Socket Update Received:", data);

        // 1. Find the main tracker container (make sure the ID matches your HTML)
        const trackerEl = document.getElementById("patient-tracker-container"); // Change ID if yours is different

        // 2. Un-hide it instantly!
        if (trackerEl) {
          trackerEl.classList.remove("hidden", "opacity-0");
          trackerEl.classList.add("opacity-100");
        }

        // 3. Update the text
        updateTrackerUI(data.status, data.dentistName);
      });
    } catch (err) {
      console.warn("⚠️ Socket connection error:", err);
    }
  }
}

// 🟡 UI UPDATE FUNCTION
function updateTrackerUI(rawStatus, doctorName) {
  const msgEl = document.getElementById("live-status-message");
  if (!msgEl) return;

  // 👇 ADDED THIS: Force any incoming status to be lowercase so it always matches!
  const cleanStatus = String(rawStatus).toLowerCase().trim();

  let docString = "the doctor";
  if (doctorName && !doctorName.toLowerCase().includes("your doctor")) {
    docString = `<b>Dr. ${doctorName.replace(/^Dr\.\s*/i, "")}</b>`;
  }

  const isExpected = [
    "expected",
    "expected_today",
    "expected today",
    "pending",
  ].includes(cleanStatus);
  const isApproved = ["approved", "confirmed"].includes(cleanStatus);
  const isCheckedIn = ["checked-in", "checked_in"].includes(cleanStatus);
  const isInTreatment = ["in-treatment", "in_treatment", "in_chair"].includes(
    cleanStatus,
  );

  // Because of our fix above, this will now catch "COMPLETED_PENDING_BILL"
  const isCompletedPendingBill = ["completed_pending_bill"].includes(
    cleanStatus,
  );

  // Because of our fix above, this will now catch "DONE"
  const isPaid = [
    "completed",
    "paid",
    "settled",
    "payment_completed",
    "done",
  ].includes(cleanStatus);

  const todayDateFormatted = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (isExpected) {
    updateSteps("expected");
    msgEl.innerHTML = `<strong>📅 Appointment Scheduled</strong><br><span class="text-sm">Your appointment with ${docString} is set for <b>${todayDateFormatted}</b>. Please check in at the front desk when you arrive.</span>`;
  } else if (isApproved) {
    updateSteps("expected");
    msgEl.innerHTML = `<strong>🎉 Appointment Confirmed</strong><br><span class="text-sm">Your visit is approved for <b>${todayDateFormatted}</b>. Please arrive a few minutes early and we’ll be ready to welcome you.</span>`;
  } else if (isCheckedIn) {
    updateSteps("lobby");
    msgEl.innerHTML = `<strong>🕒 You’re Checked In</strong><br><span class="text-sm">Please relax in the waiting area. We’ll notify you as soon as the dental chair is ready.</span>`;
  } else if (isInTreatment) {
    updateSteps("chair");
    msgEl.innerHTML = `<strong>🩺 Your Turn Is Ready</strong><br><span class="text-sm">Please proceed to the dental chair. ${docString} is ready to see you.</span>`;
  } else if (isCompletedPendingBill) {
    updateSteps("bill");
    msgEl.innerHTML = `<strong>🧾 Treatment Complete</strong><br><span class="text-sm">Please proceed to the front desk to review and settle your account.</span>`;
  } else if (isPaid) {
    updateSteps("chair");
    msgEl.innerHTML = `<strong>✅ Visit Complete</strong><br><span class="text-sm">Thank you for visiting us. Please keep your receipt and follow the care instructions provided by the clinic.</span>`;
  } else {
    updateSteps("expected");
    msgEl.innerHTML = `Your appointment status is currently: <b>${cleanStatus}</b>. Please see the front desk.`;
  }
}
function updateSteps(stepName) {
  console.log(`👣 Moving tracker highlight to step: ${stepName}`);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPatientTracker);
} else {
  initPatientTracker();
}
