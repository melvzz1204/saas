const APP_BASE_URL = "http://localhost:5000";
window.isFetchingSlots = false;

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("change", async (e) => {
    if (e.target.id === "booking-date" || e.target.id === "booking-dentist") {
      const dateInput = document.getElementById("booking-date");
      const timeSelect = document.getElementById("booking-time");
      const dentistSelect = document.getElementById("booking-dentist");

      if (dateInput && dateInput.value) {
        await fetchAvailableTimes(dateInput.value, timeSelect, dentistSelect);
      }
    }
  });
});

async function fetchAvailableTimes(selectedDate, timeSelect, dentistSelect) {
  if (!timeSelect || !selectedDate) return;

  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const clinicId =
    localStorage.getItem("clinicId") ||
    userData.clinicId ||
    getClinicIdFromUrl();
  const dentistId = dentistSelect ? dentistSelect.value : null;

  if (!clinicId) return;

  if (!dentistId || dentistId === "") {
    timeSelect.innerHTML = `<option value="" disabled selected>Please select a dentist first...</option>`;
    timeSelect.disabled = true;
    window.isFetchingSlots = false;
    return;
  }

  try {
    window.isFetchingSlots = true;
    timeSelect.innerHTML = `<option value="">Loading times... ⏳</option>`;
    timeSelect.disabled = true;

    const rawToken = localStorage.getItem("token");
    const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";

    const response = await fetch(
      `${APP_BASE_URL}/api/v1/appointments/available-slots?date=${selectedDate}&clinicId=${clinicId}&dentistId=${dentistId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": clinicId,
          Authorization: token ? `Bearer ${token}` : "",
        },
      },
    );

    const data = await response.json();

    // 🚨 DEBUGGING: This will print the exact backend payload to your console
    console.log("🔍 RAW BACKEND RESPONSE:", data);

    if (!response.ok) throw new Error(data.message || "Failed to fetch slots");

    const slotsArray =
      data.slots || (data.data && data.data.slots) || data.availableSlots || [];
    const bookedArray =
      data.bookedSlots || (data.data && data.data.bookedSlots) || [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const isToday = selectedDate === todayStr;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    timeSelect.innerHTML = `<option value="" disabled selected>-- Select a Time --</option>`;

    if (Array.isArray(slotsArray) && slotsArray.length > 0) {
      slotsArray.forEach((slotItem) => {
        let timeString =
          typeof slotItem === "object" ? slotItem.time : slotItem;

        // 🎯 Format slot to both 24h and 12h formats to guarantee a match against bookedArray
        const formatted12h = formatTo12Hour(timeString);

        // Check if the slot matches ANY string inside bookedArray (case-insensitive)
        let isBooked = bookedArray.some(
          (booked) =>
            booked === timeString ||
            booked.toLowerCase() === formatted12h.toLowerCase(),
        );

        let isPast = false;

        if (isToday) {
          const [slotHour, slotMinute] = timeString.split(":").map(Number);
          if (
            slotHour < currentHour ||
            (slotHour === currentHour && slotMinute <= currentMinute)
          ) {
            isPast = true;
          }
        }

        const option = document.createElement("option");
        option.value = timeString;

        // 🎯 Apply disabled states with clear labels
        if (isBooked) {
          option.textContent = `${formatted12h} (Booked)`;
          option.disabled = true;
        } else if (isPast) {
          option.textContent = `${formatted12h} (Passed)`;
          option.disabled = true;
        } else {
          option.textContent = formatted12h;
        }

        timeSelect.appendChild(option);
      });
      timeSelect.disabled = false;
    }
  } catch (err) {
    console.error("Slot fetch error:", err);
    timeSelect.innerHTML = `<option value="" disabled>⚠️ Error: ${err.message}</option>`;
    timeSelect.disabled = true;
  } finally {
    window.isFetchingSlots = false;
  }
}

function formatTo12Hour(time24) {
  try {
    let [hours, minutes] = time24.split(":");
    hours = parseInt(hours, 10);
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return time24;
  }
}

function getClinicIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("clinicId") || "";
}
