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

  // Assign interactive navigational track direction controllers
  document.getElementById("prev-month-btn").addEventListener("click", () => {
    currentNavDate.setMonth(currentNavDate.getMonth() - 1);
    renderCalendarGrid();
  });
  document.getElementById("next-month-btn").addEventListener("click", () => {
    currentNavDate.setMonth(currentNavDate.getMonth() + 1);
    renderCalendarGrid();
  });

  // Strip hours/minutes from today's reference for pure date cell comparison
  immutableToday.setHours(0, 0, 0, 0);

  let chosenDateStr = "";

  const monthYearLabel = document.getElementById("calendar-month-year");
  const daysGrid = document.getElementById("calendar-days-grid");
  const hiddenDateInput = document.getElementById("booking-date");

  function renderCalendarGrid() {
    daysGrid.innerHTML = "";

    const year = currentNavDate.getFullYear();
    const month = currentNavDate.getMonth();

    monthYearLabel.textContent = `${months[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // 1. Render blank space padding nodes for empty offsetting alignments
    for (let i = 0; i < firstDayIndex; i++) {
      const blankNode = document.createElement("div");
      daysGrid.appendChild(blankNode);
    }

    // 2. Generate interactive date grid selection cells
    for (let day = 1; day <= totalDays; day++) {
      const dateCell = document.createElement("button");
      dateCell.type = "button";
      dateCell.textContent = day;

      // Generate comparison strings in YYYY-MM-DD
      const paddedMonth = String(month + 1).padStart(2, "0");
      const paddedDay = String(day).padStart(2, "0");
      const iterationDateStr = `${year}-${paddedMonth}-${paddedDay}`;

      // Create date object for mathematical before/after validation checks
      const iterationDate = new Date(year, month, day);

      // Base Tailwind cell layout parameters
      dateCell.className =
        "py-1.5 font-bold rounded-lg transition-all text-center cursor-pointer select-none focus:outline-none ";

      // 🛡️ Past Date Disabling Logic (Compares day milestones accurately)
      if (iterationDate < immutableToday) {
        dateCell.className +=
          "text-slate-200 cursor-not-allowed pointer-events-none";
      } else {
        // Formulate standard string conversions for active date highlights
        const todayYear = immutableToday.getFullYear();
        const todayMonth = String(immutableToday.getMonth() + 1).padStart(
          2,
          "0",
        );
        const todayDay = String(immutableToday.getDate()).padStart(2, "0");
        const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

        // Formatting for current active/selected date variants
        if (iterationDateStr === chosenDateStr) {
          dateCell.className += "bg-teal-600 text-white shadow-xs scale-105";
        } else if (iterationDateStr === todayStr) {
          dateCell.className +=
            "bg-teal-50 text-teal-600 border border-teal-200/60 hover:bg-teal-100/50";
        } else {
          dateCell.className += "text-slate-700 hover:bg-slate-200/70";
        }

        // Interactive Click Event Handler
        dateCell.addEventListener("click", () => {
          chosenDateStr = iterationDateStr;
          hiddenDateInput.value = iterationDateStr;
          filterTimeSlots(iterationDateStr);
          renderCalendarGrid(); // Refresh layout to sync state highlighting classes
        });
      }

      daysGrid.appendChild(dateCell);
    }
  }

  // Fire up initialization build process loops
  renderCalendarGrid();

  // 🆕 Prefilter time slots for today on initialization mount
  const initialYear = immutableToday.getFullYear();
  const initialMonth = String(immutableToday.getMonth() + 1).padStart(2, "0");
  const initialDay = String(immutableToday.getDate()).padStart(2, "0");
  filterTimeSlots(`${initialYear}-${initialMonth}-${initialDay}`);
});

function filterTimeSlots(selectedDateStr) {
  const timeSelect = document.getElementById("booking-time");
  const timeContainer = document.getElementById("time-select-container");
  const afterHoursNotice = document.getElementById("after-hours-notice");
  const submitBtn = document.getElementById("book-btn");

  if (!timeSelect || !timeContainer || !afterHoursNotice) return;

  const options = timeSelect.options;

  // 📆 Dynamically calculate today's local date string (YYYY-MM-DD)
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const immutableTodayStr = `${year}-${month}-${day}`;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  let validSlotsAvailable = false;

  // 1. Loop through options to flag validity if date is today
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const dataTime = option.getAttribute("data-time");
    if (!dataTime) continue;

    const [slotHour, slotMinute] = dataTime.split(":").map(Number);

    if (selectedDateStr === immutableTodayStr) {
      if (
        currentHour > slotHour ||
        (currentHour === slotHour && currentMinute >= slotMinute)
      ) {
        option.style.display = "none";
        option.disabled = true;
      } else {
        option.style.display = "block";
        option.disabled = false;
        validSlotsAvailable = true;
      }
    } else {
      option.style.display = "block";
      option.disabled = false;
      validSlotsAvailable = true;
    }
  }

  // 2. 🛡️ AFTER-HOURS SWITCH NODE
  if (
    selectedDateStr === immutableTodayStr &&
    (currentHour >= 17 || !validSlotsAvailable)
  ) {
    timeContainer.classList.add("hidden");
    afterHoursNotice.classList.remove("hidden");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Please Select a Valid Date";
      submitBtn.className =
        "w-full bg-slate-200 text-slate-400 text-xs font-bold py-3.5 rounded-xl cursor-not-allowed uppercase tracking-wider mt-2 transition-all";
    }
  } else {
    timeContainer.classList.remove("hidden");
    afterHoursNotice.classList.add("hidden");

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Booking Request";
      submitBtn.className =
        "w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-3.5 rounded-xl shadow-lg shadow-teal-900/10 transition-all uppercase tracking-wider mt-2 cursor-pointer active:scale-[0.99]";
    }

    for (let i = 0; i < options.length; i++) {
      if (!options[i].disabled && options[i].value !== "") {
        timeSelect.selectedIndex = i;
        break;
      }
    }
  }
}
