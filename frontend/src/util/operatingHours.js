// 1. Renamed to APP_BASE_URL to avoid colliding with booking.js!
const APP_BASE_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  initOperatingHoursModule();
});

function initOperatingHoursModule() {
  const saveBtn = document.getElementById("btn-save-hours");

  // Live toggle for Open/Closed status on ALL days
  document.querySelectorAll(".day-closed-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const row = e.target.closest("[data-day]");
      updateDayRowUI(row, e.target.checked);
    });
  });

  // Load existing hours from server on startup
  loadClinicOperatingHours();

  // Save hours when button is clicked
  if (saveBtn) {
    saveBtn.addEventListener("click", saveClinicOperatingHours);
  }
}

// Helper: Safely resolve clinicId from both localStorage locations
function getResolvedClinicId() {
  const directId = localStorage.getItem("clinicId");
  if (directId && directId !== "undefined") return directId;

  try {
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    if (userData.clinicId && userData.clinicId !== "undefined") {
      return userData.clinicId;
    }
  } catch (e) {
    console.error("Error parsing user object from localStorage", e);
  }
  return "";
}

// Helper: Toggles row UI, inputs, and status badges dynamically
function updateDayRowUI(row, isClosed) {
  const timeInputsContainer = row.querySelector(".day-time-inputs");
  const openInput = row.querySelector(".time-open");
  const closeInput = row.querySelector(".time-close");
  const statusBadge = row.querySelector(".status-badge");

  if (isClosed) {
    timeInputsContainer.classList.add("opacity-30", "pointer-events-none");
    openInput.disabled = true;
    closeInput.disabled = true;
    statusBadge.textContent = "Closed";
    statusBadge.className =
      "status-badge text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 w-20 text-center";
  } else {
    timeInputsContainer.classList.remove("opacity-30", "pointer-events-none");
    openInput.disabled = false;
    closeInput.disabled = false;
    statusBadge.textContent = "Open";
    statusBadge.className =
      "status-badge text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 w-20 text-center";
  }
}

// Fetch current operating hours from database
async function loadClinicOperatingHours() {
  const rawToken = localStorage.getItem("token");
  const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
  const clinicId = getResolvedClinicId();

  if (!clinicId) {
    console.warn("⚠️ loadClinicOperatingHours: No valid clinicId found.");
    return;
  }

  try {
    // 🎯 Updated to use APP_BASE_URL
    const response = await fetch(`${APP_BASE_URL}/api/v1/tenants/${clinicId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-clinic-id": clinicId,
      },
    });

    if (!response.ok) throw new Error("Could not load clinic settings.");

    const data = await response.json();
    const clinic = data.clinic || data.data || data;

    if (clinic.slotDurationMinutes) {
      const slotSelect = document.getElementById("slot-duration");
      if (slotSelect) slotSelect.value = clinic.slotDurationMinutes;
    }

    if (clinic.operatingHours && Array.isArray(clinic.operatingHours)) {
      clinic.operatingHours.forEach((item) => {
        const row = document.querySelector(`[data-day="${item.day}"]`);
        if (row) {
          const checkbox = row.querySelector(".day-closed-checkbox");
          const openInput = row.querySelector(".time-open");
          const closeInput = row.querySelector(".time-close");

          checkbox.checked = !!item.isClosed;
          if (item.openTime) openInput.value = item.openTime;
          if (item.closeTime) closeInput.value = item.closeTime;

          updateDayRowUI(row, checkbox.checked);
        }
      });
    }
  } catch (err) {
    console.error("Error loading operating hours:", err);
  }
}

// Save updated schedule to backend
async function saveClinicOperatingHours() {
  const rawToken = localStorage.getItem("token");
  const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
  const clinicId = getResolvedClinicId();
  const saveBtn = document.getElementById("btn-save-hours");

  if (!clinicId) {
    alert("❌ Save Error: Clinic ID is missing or invalid. Please re-login.");
    return;
  }

  const slotDuration =
    parseInt(document.getElementById("slot-duration").value, 10) || 30;

  const operatingHours = [];
  document.querySelectorAll("[data-day]").forEach((row) => {
    const day = row.getAttribute("data-day");
    const isClosed = row.querySelector(".day-closed-checkbox").checked;
    const openTime = row.querySelector(".time-open").value;
    const closeTime = row.querySelector(".time-close").value;

    operatingHours.push({ day, openTime, closeTime, isClosed });
  });

  try {
    saveBtn.disabled = true;
    saveBtn.innerHTML = "Saving... ⏳";

    // 🎯 Updated to use APP_BASE_URL
    const response = await fetch(`${APP_BASE_URL}/api/v1/tenants/${clinicId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-clinic-id": clinicId,
      },
      body: JSON.stringify({
        slotDurationMinutes: slotDuration,
        operatingHours: operatingHours,
      }),
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const htmlText = await response.text();
      console.error("❌ Non-JSON Server Response:", htmlText);
      throw new Error(
        `Server returned status ${response.status} (${response.statusText}). Check backend server logs.`,
      );
    }

    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Failed to save schedule.");

    alert("✅ Operating hours and slot settings saved successfully!");
  } catch (err) {
    alert(`Save Error: ${err.message}`);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      <span>Save Schedule</span>
    `;
  }
}
