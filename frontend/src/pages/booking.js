const APP_BASE_URL = "http://localhost:5000";

// 🎯 FIXED: Made globally accessible so calendar.js can read it
window.isFetchingSlots = false;

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("booking-date");
  const timeSelect = document.getElementById("booking-time");

  if (dateInput && timeSelect) {
    dateInput.addEventListener("change", async (e) => {
      const selectedDate = e.target.value;
      await fetchAvailableTimes(selectedDate, timeSelect);
    });
  }
});

async function fetchAvailableTimes(selectedDate, timeSelect) {
  if (!timeSelect || !selectedDate) return;

  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const clinicId =
    localStorage.getItem("clinicId") ||
    userData.clinicId ||
    getClinicIdFromUrl();

  if (!clinicId) {
    console.error("No Clinic ID found for booking.");
    return;
  }

  try {
    // 🎯 FIXED: UI loading state triggers immediately
    timeSelect.innerHTML = `<option value="">Loading available times... ⏳</option>`;
    timeSelect.disabled = true;

    const response = await fetch(
      `${APP_BASE_URL}/api/v1/appointments/available-slots?date=${selectedDate}&clinicId=${clinicId}`,
    );

    if (!response.ok) throw new Error("Failed to fetch slots");

    const data = await response.json();
    timeSelect.innerHTML = `<option value="">-- Select a Time --</option>`;

    if (data.slots && data.slots.length > 0) {
      data.slots.forEach((timeString) => {
        const option = document.createElement("option");
        option.value = timeString;
        option.textContent = formatTo12Hour(timeString);
        timeSelect.appendChild(option);
      });
      timeSelect.disabled = false;
    } else {
      timeSelect.innerHTML = `<option value="">❌ Fully booked or closed</option>`;
      timeSelect.disabled = true;
    }
  } catch (err) {
    console.error("Slot fetch error:", err);
  } finally {
    // 🎯 FIXED: Release the global lock so the user can click the calendar again
    window.isFetchingSlots = false;
  }
}

function formatTo12Hour(time24) {
  let [hours, minutes] = time24.split(":");
  hours = parseInt(hours, 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function getClinicIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("clinicId") || "";
}
