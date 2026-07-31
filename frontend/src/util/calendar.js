document.addEventListener("DOMContentLoaded", () => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  let currentNavDate = new Date();
  const immutableToday = new Date();
  immutableToday.setHours(0, 0, 0, 0);

  let chosenDateStr = "";
  let dynamicClosedDays = []; // 🎯 NEW: Will hold the closed days from the database

  const monthYearLabel = document.getElementById("calendar-month-year");
  const daysGrid = document.getElementById("calendar-days-grid");
  const hiddenDateInput = document.getElementById("booking-date");

  // Navigational track direction controllers
  document.getElementById("prev-month-btn").addEventListener("click", () => {
    currentNavDate.setMonth(currentNavDate.getMonth() - 1);
    renderCalendarGrid();
  });
  document.getElementById("next-month-btn").addEventListener("click", () => {
    currentNavDate.setMonth(currentNavDate.getMonth() + 1);
    renderCalendarGrid();
  });

  // 🎯 NEW: Fetch operating hours from backend to determine closed days
  async function fetchClinicClosedDays() {
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    const clinicId =
      localStorage.getItem("clinicId") || userData.clinicId || "";
    if (!clinicId) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/v1/tenants/${clinicId}`,
      );
      if (response.ok) {
        const data = await response.json();
        const clinic = data.clinic || data.data || data;

        if (clinic.operatingHours) {
          // Map string days to JavaScript Date integer equivalents
          const dayMap = {
            sunday: 0,
            monday: 1,
            tuesday: 2,
            wednesday: 3,
            thursday: 4,
            friday: 5,
            saturday: 6,
          };

          dynamicClosedDays = clinic.operatingHours
            .filter((oh) => oh.isClosed)
            .map((oh) => dayMap[oh.day.toLowerCase()])
            .filter((val) => val !== undefined);

          // Refresh the calendar visually now that we know the closed days
          renderCalendarGrid();
        }
      }
    } catch (e) {
      console.error("Failed to fetch clinic hours for calendar", e);
    }
  }

  function renderCalendarGrid() {
    daysGrid.innerHTML = "";

    const year = currentNavDate.getFullYear();
    const month = currentNavDate.getMonth();

    monthYearLabel.textContent = `${months[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
      const blankNode = document.createElement("div");
      daysGrid.appendChild(blankNode);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateCell = document.createElement("button");
      dateCell.type = "button";
      dateCell.textContent = day;

      const paddedMonth = String(month + 1).padStart(2, "0");
      const paddedDay = String(day).padStart(2, "0");
      const iterationDateStr = `${year}-${paddedMonth}-${paddedDay}`;
      const iterationDate = new Date(year, month, day);

      // 🎯 FIXED: Uses the dynamic list of closed days fetched from the database
      const isClosedDay = dynamicClosedDays.includes(iterationDate.getDay());

      dateCell.className =
        "py-1.5 font-bold rounded-lg transition-all text-center cursor-pointer select-none focus:outline-none ";

      if (iterationDate < immutableToday) {
        dateCell.className +=
          "text-slate-200 cursor-not-allowed pointer-events-none";
      } else if (isClosedDay) {
        dateCell.className +=
          "bg-red-50 text-red-400 cursor-not-allowed pointer-events-none opacity-60";
        dateCell.title = "Clinic is closed on this day";
      } else {
        const todayYear = immutableToday.getFullYear();
        const todayMonth = String(immutableToday.getMonth() + 1).padStart(
          2,
          "0",
        );
        const todayDay = String(immutableToday.getDate()).padStart(2, "0");
        const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

        if (iterationDateStr === chosenDateStr) {
          dateCell.className += "bg-teal-600 text-white shadow-xs scale-105";
        } else if (iterationDateStr === todayStr) {
          dateCell.className +=
            "bg-teal-50 text-teal-600 border border-teal-200/60 hover:bg-teal-100/50";
        } else {
          dateCell.className += "text-slate-700 hover:bg-slate-200/70";
        }

        dateCell.addEventListener("click", () => {
          // 🎯 FIXED SPAM CLICK: Ignore click if booking.js is currently fetching slots!
          if (window.isFetchingSlots) return;
          window.isFetchingSlots = true; // Lock immediately

          chosenDateStr = iterationDateStr;
          hiddenDateInput.value = iterationDateStr;
          hiddenDateInput.dispatchEvent(new Event("change"));
          renderCalendarGrid();
        });
      }

      daysGrid.appendChild(dateCell);
    }
  }

  // Build the initial blank calendar
  renderCalendarGrid();

  // Trigger the background fetch for closed days
  fetchClinicClosedDays();

  // Prefetch time slots for today
  const initialYear = immutableToday.getFullYear();
  const initialMonth = String(immutableToday.getMonth() + 1).padStart(2, "0");
  const initialDay = String(immutableToday.getDate()).padStart(2, "0");
  const initialDateStr = `${initialYear}-${initialMonth}-${initialDay}`;

  chosenDateStr = initialDateStr;
  hiddenDateInput.value = initialDateStr;
  hiddenDateInput.dispatchEvent(new Event("change"));
});
