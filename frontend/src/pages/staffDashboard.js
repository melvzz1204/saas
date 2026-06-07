/**
 * Staff Patient Flow Dashboard Logic (Kanban Edition + Walk-Ins)
 * Location Path: /src/pages/staffDashboard.js
 */

// ⚠️ CHANGE THIS TO YOUR ACTUAL BACKEND PORT
const API_BASE_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  // Navigation & Identifiers
  const clinicTitle = document.getElementById("clinic-branch-title");
  const staffBadge = document.getElementById("staff-name-badge");
  const logoutBtn = document.getElementById("staff-logout-btn");

  // Kanban Columns
  const colWaiting = document.getElementById("col-waiting");
  const colTreatment = document.getElementById("col-treatment");
  const colCompleted = document.getElementById("col-completed");

  // Telemetry Counters
  const statRemaining = document.getElementById("stat-remaining");
  const statActiveChair = document.getElementById("stat-active-chair");
  const statCompleted = document.getElementById("stat-completed");
  const countWaiting = document.getElementById("count-waiting");
  const countTreatment = document.getElementById("count-treatment");
  const countCompleted = document.getElementById("count-completed");

  // Walk-In Modal Selectors
  const modalWalkIn = document.getElementById("walkin-modal");
  const btnOpenWalkIn = document.getElementById("btn-open-walkin");
  const btnCloseWalkIn = document.getElementById("btn-close-walkin");
  const formWalkIn = document.getElementById("form-walkin");

  let cachedUpcomingAppointments = [];
  let globalAppointmentsArray = [];

  // 1. Initial State Hydration
  function initializeDashboard() {
    const upcomingModal = document.getElementById("upcoming-modal");
    const btnToggleUpcoming = document.getElementById("btn-toggle-upcoming");
    const btnCloseUpcoming = document.getElementById("btn-close-upcoming");
    const filterRange = document.getElementById("filter-upcoming-range");

    // Listen for Sort Dropdown Changes
    if (filterRange) {
      filterRange.addEventListener("change", (e) => {
        renderUpcomingTable(cachedUpcomingAppointments, e.target.value);
      });
    }

    // Open Modal Interface Window
    if (btnToggleUpcoming && upcomingModal) {
      btnToggleUpcoming.addEventListener("click", () => {
        upcomingModal.classList.remove("hidden");
      });
    }

    // Close Modal Interface Window
    if (btnCloseUpcoming && upcomingModal) {
      btnCloseUpcoming.addEventListener("click", () => {
        upcomingModal.classList.add("hidden");
      });
    }

    // Global Backdrop Overlay Click Escape Strategy
    if (upcomingModal) {
      upcomingModal.addEventListener("click", (e) => {
        if (e.target === upcomingModal) {
          upcomingModal.classList.add("hidden");
        }
      });
    }

    if (clinicTitle)
      clinicTitle.textContent =
        localStorage.getItem("clinicName") || "Apex Dental Clinic";
    if (staffBadge)
      staffBadge.textContent =
        localStorage.getItem("staffName") || "Active Staff Duty";

    fetchDailyQueue();

    if (logoutBtn) logoutBtn.addEventListener("click", handleShiftExit);

    // Setup Walk-In Modal Listeners
    if (btnOpenWalkIn)
      btnOpenWalkIn.addEventListener("click", () =>
        modalWalkIn.classList.remove("hidden"),
      );
    if (btnCloseWalkIn)
      btnCloseWalkIn.addEventListener("click", () =>
        modalWalkIn.classList.add("hidden"),
      );

    // Auto-refresh the board every 60 seconds
    setInterval(fetchDailyQueue, 60000);
  }

  // 2. Fetch Data
  async function fetchDailyQueue() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/appointments/today`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok)
        throw new Error("Could not fetch daily operations roster.");

      const data = await response.json();
      globalAppointmentsArray = data.appointments || [];

      renderKanbanBoard();
    } catch (err) {
      console.error("Board sync failed:", err);
      if (colWaiting)
        colWaiting.innerHTML = `<p class="text-xs text-rose-500 font-bold p-4">⚠️ Sync connection lost.</p>`;
    }
  }

  // 3. Render Kanban Board Structures
  function renderKanbanBoard() {
    if (!colWaiting || !colTreatment || !colCompleted) return;

    // Clear existing columns
    colWaiting.innerHTML = "";
    colTreatment.innerHTML = "";
    colCompleted.innerHTML = "";

    // Get today's date formatted as YYYY-MM-DD
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, "0");
    const day = String(localDate.getDate()).padStart(2, "0");
    const todayString = `${year}-${month}-${day}`;

    // Split the main array into "Today" and "Upcoming"
    const todayAppointments = globalAppointmentsArray.filter(
      (a) => a.date === todayString,
    );
    const upcomingAppointments = globalAppointmentsArray.filter(
      (a) => a.date > todayString,
    );

    // Save to cache for the filtering routing system
    cachedUpcomingAppointments = upcomingAppointments;

    // Filter Kanban arrays to ONLY use today's appointments
    const waitingList = todayAppointments.filter(
      (a) =>
        a.status === "Approved" ||
        a.status === "pending" ||
        a.status === "checked-in",
    );
    const treatmentList = todayAppointments.filter(
      (a) => a.status === "in-treatment",
    );
    const completedList = todayAppointments.filter(
      (a) => a.status === "completed",
    );

    // Update Header Counters
    if (countWaiting) countWaiting.textContent = waitingList.length;
    if (countTreatment) countTreatment.textContent = treatmentList.length;
    if (countCompleted) countCompleted.textContent = completedList.length;

    // Update Stat Badges/Cards
    if (statRemaining)
      statRemaining.textContent = `${waitingList.length} Waiting`;
    if (statActiveChair)
      statActiveChair.textContent = `${treatmentList.length} In Chair`;
    if (statCompleted)
      statCompleted.textContent = `${completedList.length} Sessions`;

    // Render the live Kanban columns
    renderCards(waitingList, colWaiting, "waiting");
    renderCards(treatmentList, colTreatment, "treatment");
    renderCards(completedList, colCompleted, "completed");

    // Bind click event listeners to the new cards
    bindCardActions();

    // 🚀 FIX: Pull active user select setting to prevent component regression on auto-sync refresh cycles
    const currentFilterMode =
      document.getElementById("filter-upcoming-range")?.value ||
      "chronological";

    // Build the upcoming table right below the board using the correct view context
    renderUpcomingTable(cachedUpcomingAppointments, currentFilterMode);
  }

  // 4. Render Sorted Upcoming Data Panels
  function renderUpcomingTable(upcomingAppointments, mode = "chronological") {
    const container = document.getElementById("upcoming-table-container");
    if (!container) return;

    if (upcomingAppointments.length === 0) {
      container.innerHTML = `
      <div class="text-center py-8">
        <p class="text-sm text-slate-500 italic">No future appointments scheduled in this system matrix.</p>
      </div>`;
      return;
    }

    // Helper row builder closure function
    const createRowHTML = (app) => {
      const dateObj = new Date(app.date);
      const dateString = dateObj.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const patientDisplayName =
        app.patientId && typeof app.patientId === "object"
          ? `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`
          : app.patientName || "Scheduled Patient";

      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="p-3 text-sm font-semibold text-slate-800">${patientDisplayName.trim()}</td>
        <td class="p-3 text-sm text-slate-600 font-medium">${dateString}</td>
        <td class="p-3 text-sm font-mono text-slate-600">${app.time || "TBD"}</td>
        <td class="p-3 text-sm text-slate-600">${app.service || app.treatmentName || "Consultation"}</td>
        <td class="p-3">
          <span class="text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">${app.status}</span>
        </td>
      </tr>
    `;
    };

    // Helper table skeleton wrapper structure macro
    const createTableHTML = (rows) => `
    <div class="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm mb-6">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-slate-50 border-b border-slate-200">
            <th class="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Patient</th>
            <th class="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
            <th class="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
            <th class="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Service</th>
            <th class="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${rows}</tbody>
      </table>
    </div>
  `;

    // --- RENDERING MODAL SORT ROUTER OPTIONS ---

    // MODE A: Traditional Flat Ordered List View
    if (mode === "chronological") {
      const rows = upcomingAppointments.map(createRowHTML).join("");
      container.innerHTML = createTableHTML(rows);
      return;
    }

    // MODE B & C: Segmented Group Categorization mapping routines
    const groupedData = {};

    upcomingAppointments.forEach((app) => {
      // Avoid time-zone shifting variations by parsing date string accurately
      const cleanDateStr = app.date.includes("T")
        ? app.date.split("T")[0]
        : app.date;
      const [partsYear, partsMonth, partsDay] = cleanDateStr.split("-");
      const d = new Date(partsYear, partsMonth - 1, partsDay);

      let groupKey = "";

      if (mode === "day") {
        groupKey = d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } else if (mode === "month") {
        groupKey = d.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
      }

      if (!groupedData[groupKey]) groupedData[groupKey] = [];
      groupedData[groupKey].push(app);
    });

    // Render out the dictionary into clean UI group rows blocks
    let aggregateHTML = "";
    Object.keys(groupedData).forEach((titleKey) => {
      const groupRows = groupedData[titleKey].map(createRowHTML).join("");

      aggregateHTML += `
      <div class="mt-2 mb-4">
        <div class="flex items-center gap-2 mb-2 px-1">
          <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          <h4 class="text-xs font-black text-slate-700 uppercase tracking-wider">${titleKey}</h4>
          <span class="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ml-auto">${groupedData[titleKey].length} Bookings</span>
        </div>
        ${createTableHTML(groupRows)}
      </div>
    `;
    });

    container.innerHTML = aggregateHTML;
  }

  // 5. Render Individual Patient Cards
  function renderCards(appointments, container, type) {
    if (appointments.length === 0) {
      container.innerHTML = `<div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-wider">Empty</div>`;
      return;
    }

    appointments.forEach((app) => {
      const currentAppointmentId = app._id || app.id;
      const card = document.createElement("div");
      card.className =
        "bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3 group";

      let actionHTML = "";
      let statusBadge = "";

      if (type === "waiting") {
        statusBadge = `<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">Lobby</span>`;
        actionHTML = `<button data-id="${currentAppointmentId}" data-action="chair" class="action-btn w-full py-2 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer">Call to Chair</button>`;
      } else if (type === "treatment") {
        statusBadge = `<span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md animate-pulse">In Room</span>`;
        actionHTML = `<button data-id="${currentAppointmentId}" data-action="complete" class="action-btn w-full py-2 bg-emerald-500 text-white hover:bg-emerald-600 font-bold text-[10px] uppercase rounded-lg transition-colors shadow-sm cursor-pointer">Finalize Procedure</button>`;
      } else if (type === "completed") {
        statusBadge = `<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Checked Out</span>`;
      }

      const dateString = app.date
        ? new Date(app.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : "Today";

      const timeDisplayHTML = app.isWalkIn
        ? `<span class="text-[10px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded uppercase">🚨 Walk-In</span>`
        : `<span class="text-xs font-bold font-mono text-slate-700">${dateString} | ${app.time || "Scheduled"}</span>`;

      // Safely read the ID out of the populated object or string fallback
      const rawId =
        app.patientId?._id || app.patientId || currentAppointmentId || "NEW";
      const shortId =
        typeof rawId === "string" ? rawId.slice(-5).toUpperCase() : "WLKIN";

      // Compute full patient name based on backend population
      let finalPatientName = "";
      if (app.patientId && typeof app.patientId === "object") {
        const fName = app.patientId.firstName || "";
        const lName = app.patientId.lastName || "";
        finalPatientName = `${fName} ${lName}`.trim();
      }

      // Fallback if registered locally via form inputs
      if (!finalPatientName) {
        finalPatientName =
          app.patientName || app.firstName || "Walk-In Patient";
      }

      card.innerHTML = `
      <div class="flex justify-between items-start">
          <div>
              <h4 class="text-sm font-black text-slate-900">${finalPatientName}</h4>
              <p class="text-[10px] text-slate-500 font-mono mt-0.5">Chart: #PT-${shortId}</p>
          </div>
          ${statusBadge}
      </div>

      <div class="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between border border-slate-100">
          <div class="flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase">Procedure</span>
              <span class="text-xs font-bold text-slate-700 truncate max-w-[120px]">${app.service || app.treatmentName || "Consultation"}</span>
          </div>
          <div class="text-right flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase">Time</span>
              ${timeDisplayHTML}
          </div>
      </div>

      ${actionHTML ? `<div class="pt-1">${actionHTML}</div>` : ""}
    `;

      container.appendChild(card);
    });
  }

  // 6. Kanban Action Buttons (Moving Cards)
  function bindCardActions() {
    document.querySelectorAll(".action-btn").forEach((button) => {
      button.addEventListener("click", async (e) => {
        const appointmentId = e.currentTarget.getAttribute("data-id");
        const actionType = e.currentTarget.getAttribute("data-action");
        const nextStatus =
          actionType === "chair" ? "in-treatment" : "completed";

        e.currentTarget.innerText = "Syncing...";
        e.currentTarget.disabled = true;

        try {
          const response = await fetch(
            `${API_BASE_URL}/api/v1/appointments/${appointmentId}/status`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: nextStatus }),
            },
          );

          if (!response.ok) throw new Error("Could not move patient card.");
          await fetchDailyQueue(); // Refresh board instantly
        } catch (err) {
          alert(`Network Sync Error: ${err.message}`);
          e.currentTarget.innerText = "Retry";
          e.currentTarget.disabled = false;
        }
      });
    });
  }

  // 7. Walk-In Form Submission Handler
  if (formWalkIn) {
    formWalkIn.addEventListener("submit", async (e) => {
      e.preventDefault();
      const patientName = document.getElementById("walkin-name").value.trim();
      const reason = document.getElementById("walkin-reason").value.trim();
      const submitBtn = e.target.querySelector("button[type='submit']");

      submitBtn.innerText = "Processing...";
      submitBtn.disabled = true;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/appointments/walk-in`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({
              patientName,
              treatmentName: reason,
              clinicId: localStorage.getItem("clinicId"),
            }),
          },
        );

        if (!response.ok) throw new Error("Failed to register walk-in");

        formWalkIn.reset();
        modalWalkIn.classList.add("hidden");
        await fetchDailyQueue(); // Visual update right away!
      } catch (err) {
        alert(`Error: ${err.message}`);
      } finally {
        submitBtn.innerText = "Seat in Lobby";
        submitBtn.disabled = false;
      }
    });
  }

  function handleShiftExit() {
    localStorage.clear();
    window.location.replace("/staffLogin.html");
  }

  initializeDashboard();
});
