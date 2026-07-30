const APP_BASE_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("booking-date");
  const timeSelect = document.getElementById("booking-time");

  if (dateInput && timeSelect) {
    // Listen for the calendar dispatching the 'change' event
    dateInput.addEventListener("change", async (e) => {
      const selectedDate = e.target.value;
      await fetchAvailableTimes(selectedDate, timeSelect);
    });
  }
});

async function fetchAvailableTimes(selectedDate, timeSelect) {
  if (!timeSelect || !selectedDate) return;

  // Resolve clinicId based on your data structure
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
    // UI: Show loading state
    timeSelect.innerHTML = `<option value="">Loading available times... ⏳</option>`;
    timeSelect.disabled = true;

    // Fetch slots based on saved operating hours
    const response = await fetch(
      `${APP_BASE_URL}/api/v1/appointments/available-slots?date=${selectedDate}&clinicId=${clinicId}`,
    );

    if (!response.ok) throw new Error("Failed to fetch slots");

    const data = await response.json();

    // UI: Clear loading state
    timeSelect.innerHTML = `<option value="">-- Select a Time --</option>`;

    // Populate the dropdown with the newly saved hours
    if (data.slots && data.slots.length > 0) {
      data.slots.forEach((timeString) => {
        const option = document.createElement("option");
        option.value = timeString;
        option.textContent = formatTo12Hour(timeString);
        timeSelect.appendChild(option);
      });
      timeSelect.disabled = false; // Unlock the dropdown
    } else {
      timeSelect.innerHTML = `<option value="">❌ Fully booked or closed</option>`;
      timeSelect.disabled = true;
    }
  } catch (err) {
    console.error("Slot fetch error:", err);
    timeSelect.innerHTML = `<option value="">Error loading slots. Try again.</option>`;
    timeSelect.disabled = true;
  }
}

// Helper: Make times patient-friendly (converts 14:30 to 2:30 PM)
function formatTo12Hour(time24) {
  let [hours, minutes] = time24.split(":");
  hours = parseInt(hours, 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

// Helper: Extract Clinic ID from URL if applicable
function getClinicIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("clinicId") || "";
}
