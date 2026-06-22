// staffDashboard.js

// ⚠️ CHANGE THIS TO YOUR ACTUAL BACKEND PORT
const API_BASE_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
  // Navigation & Identity Headers
  const clinicTitle = document.getElementById("clinic-branch-title");
  const staffBadge = document.getElementById("staff-name-badge");
  const logoutBtn = document.getElementById("staff-logout-btn");

  // Kanban Board Column Targets
  const colWaiting = document.getElementById("col-waiting");
  const colTreatment = document.getElementById("col-treatment");
  const colCompleted = document.getElementById("col-completed");

  // Telemetry Metric Counters
  const statRemaining = document.getElementById("stat-remaining");
  const statActiveChair = document.getElementById("stat-active-chair");
  const statCompleted = document.getElementById("stat-completed");
  const countWaiting = document.getElementById("count-waiting");
  const countTreatment = document.getElementById("count-treatment");
  const countCompleted = document.getElementById("count-completed");

  // Walk-In Modal Registry Selectors
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

    // Live Event Bindings for Upcoming Matrix Filters
    if (filterRange) {
      filterRange.addEventListener("change", (e) => {
        renderUpcomingTable(cachedUpcomingAppointments, e.target.value);
      });
    }

    if (btnToggleUpcoming && upcomingModal) {
      btnToggleUpcoming.addEventListener("click", () =>
        upcomingModal.classList.remove("hidden"),
      );
    }

    if (btnCloseUpcoming && upcomingModal) {
      btnCloseUpcoming.addEventListener("click", () =>
        upcomingModal.classList.add("hidden"),
      );
    }

    if (upcomingModal) {
      upcomingModal.addEventListener("click", (e) => {
        if (e.target === upcomingModal) upcomingModal.classList.add("hidden");
      });
    }

    // Set Session Scope Badges
    if (clinicTitle)
      clinicTitle.textContent =
        localStorage.getItem("clinicName") || "Apex Dental Clinic";
    if (staffBadge)
      staffBadge.textContent =
        localStorage.getItem("staffName") || "Active Staff Duty";

    // Immediate Data Sync Fetch
    fetchDailyQueue();

    if (logoutBtn) logoutBtn.addEventListener("click", handleShiftExit);

    // Setup Modal Open/Close Controls
    if (btnOpenWalkIn)
      btnOpenWalkIn.addEventListener("click", () =>
        modalWalkIn.classList.remove("hidden"),
      );
    if (btnCloseWalkIn)
      btnCloseWalkIn.addEventListener("click", () =>
        modalWalkIn.classList.add("hidden"),
      );

    // Micro-refresh loop running transparently every 60 seconds
    setInterval(fetchDailyQueue, 60000);
  }

  // 2. Fetch Data from Live API
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
      if (colWaiting) {
        colWaiting.innerHTML = `<p class="text-xs text-rose-500 font-bold p-4">⚠️ Sync connection lost.</p>`;
      }
    }
  }

  // 3. Render and Distribute Database Entries across the Kanban Architecture
  function renderKanbanBoard() {
    if (!colWaiting || !colTreatment || !colCompleted) return;

    // Flush current static content blocks safely
    colWaiting.innerHTML = "";
    colTreatment.innerHTML = "";
    colCompleted.innerHTML = "";

    // Generate accurate local date filter parameters (YYYY-MM-DD)
    const localDate = new Date();
    const todayString = localDate.toISOString().split("T")[0];

    // Filter backend objects into timeline arrays
    const todayAppointments = globalAppointmentsArray.filter(
      (a) => a.date === todayString,
    );
    cachedUpcomingAppointments = globalAppointmentsArray.filter(
      (a) => a.date > todayString,
    );

    // Filter pipeline workflows precisely matching our strict state properties
    const waitingList = todayAppointments.filter(
      (a) =>
        a.status === "Approved" ||
        a.status === "pending" ||
        a.status === "checked-in" ||
        a.status === "waiting",
    );
    const treatmentList = todayAppointments.filter(
      (a) => a.status === "in-treatment" || a.status === "treatment",
    );
    const completedList = todayAppointments.filter(
      (a) => a.status === "completed",
    );

    // Sync Telemetry Counts Live
    if (countWaiting) countWaiting.textContent = waitingList.length;
    if (countTreatment) countTreatment.textContent = treatmentList.length;
    if (countCompleted) countCompleted.textContent = completedList.length;

    if (statRemaining)
      statRemaining.textContent = `${waitingList.length} Waiting`;
    if (statActiveChair)
      statActiveChair.textContent = `${treatmentList.length} In Chair`;
    if (statCompleted)
      statCompleted.textContent = `${completedList.length} Sessions`;

    // Process Dynamic Card Generation Runs
    renderDynamicCards(waitingList, colWaiting, "waiting");
    renderDynamicCards(treatmentList, colTreatment, "treatment");
    renderDynamicCards(completedList, colCompleted, "completed");

    // Re-verify the current upcoming sort filter settings
    const currentFilterMode =
      document.getElementById("filter-upcoming-range")?.value ||
      "chronological";
    renderUpcomingTable(cachedUpcomingAppointments, currentFilterMode);
  }

  // 4. Dynamic HTML Card Generation with UX Spec Layout Engine
  function renderDynamicCards(appointments, container, type) {
    if (appointments.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-wider select-none">
          Empty Column
        </div>`;
      return;
    }

    appointments.forEach((app) => {
      const currentAppointmentId = app._id || app.id;
      const card = document.createElement("div");

      // Extract details dynamically, normalizing alternate field patterns from Mongo schemas
      const rawId =
        app.patientId?._id || app.patientId || currentAppointmentId || "NEW";
      const shortId =
        typeof rawId === "string" ? rawId.slice(-5).toUpperCase() : "WLKIN";

      let patientName = "Walk-In Patient";
      if (app.patientId && typeof app.patientId === "object") {
        patientName =
          `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`.trim();
      } else {
        patientName = app.patientName || app.firstName || patientName;
      }

      const procedure = app.service || app.treatmentName || "Consultation";

      // Target contextual doctor object reference fields safely for later
      const doctorName =
        app.doctorName ||
        (app.doctorId && typeof app.doctorId === "object"
          ? app.doctorId.name
          : null) ||
        "Dr. Santos";

      // Apply distinct UX styles and inline micro-actions per lifecycle status stage
      if (type === "waiting") {
        card.className =
          "bg-slate-50 border border-slate-200/80 p-4 rounded-xl space-y-3 hover:border-slate-300 transition-all shadow-xs flex flex-col";
        card.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <span class="text-[9px] font-mono font-black text-slate-400 uppercase tracking-wider block">ID: #PT-${shortId}</span>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide mt-0.5">${patientName}</h4>
            </div>
            <span class="text-[9px] font-bold bg-amber-100/70 border border-amber-200/60 text-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1">
              ⏱️ ${app.waitTime || "Live Queue"}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 leading-normal font-medium">Primary Issue: ${procedure}</p>
          <button data-id="${currentAppointmentId}" data-action="chair" class="action-btn w-full mt-2 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-sky-600 font-bold text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-2xs">
            Seat Patient ➡️
          </button>
        `;
      } else if (type === "treatment") {
        card.className =
          "bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-xs flex flex-col";
        card.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <span class="text-[9px] font-mono font-black text-slate-400 uppercase tracking-wider block">ID: #PT-${shortId}</span>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide mt-0.5">${patientName}</h4>
            </div>
            <span class="text-[9px] font-bold bg-sky-50 border border-sky-200 text-sky-700 px-2 py-0.5 rounded-md">
              🪑 ${app.chair || "Chair 01"}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 font-medium space-y-0.5">
            <p>Doctor: <span class="text-slate-700 font-bold">${doctorName}</span></p>
            <p>Status: <span class="text-amber-600 font-bold animate-pulse">${app.progress || "In Progress"}</span></p>
          </div>
          <button data-id="${currentAppointmentId}" data-action="complete" class="action-btn w-full mt-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-xs">
            Complete & Bill 💳
          </button>
        `;
      } else if (type === "completed") {
        const transactionTime =
          app.time ||
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        const finalPaymentAmount = app.amount || "₱1,500.00";

        card.className =
          "bg-slate-50/60 border border-slate-200/60 p-4 rounded-xl space-y-3 opacity-85 hover:opacity-100 transition-opacity flex flex-col";
        card.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <span class="text-[9px] font-mono font-black text-slate-400 uppercase tracking-wider block">ID: #PT-${shortId}</span>
              <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wide mt-0.5">${patientName}</h4>
            </div>
            <span class="text-[9px] font-mono font-bold text-slate-400">${transactionTime}</span>
          </div>
          <p class="text-[11px] font-semibold text-emerald-700">Paid Amount: ${finalPaymentAmount}</p>
          <button class="w-full mt-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px] py-1.5 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-2xs" onclick="alert('Printing document route... #PT-${shortId}')">
            Print Receipt 📄
          </button>
        `;
      }

      container.appendChild(card);
    });

    // Directly execute structural mutation listeners for newly compiled DOM elements
    bindCardActions();
  }

  // 5. State Transition Pipeline Integration Methods
  function bindCardActions() {
    document.querySelectorAll(".action-btn").forEach((button) => {
      // Remove any previously bound listeners before adding a fresh one to avoid double clicks
      const clearButton = button.cloneNode(true);
      button.parentNode.replaceChild(clearButton, button);

      clearButton.addEventListener("click", async (e) => {
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

          if (!response.ok)
            throw new Error("Could not transform system data record status.");

          await fetchDailyQueue(); // Instantly reload matching application layout states
        } catch (err) {
          alert(`Network Sync Error: ${err.message}`);
          clearButton.innerText = "Retry";
          clearButton.disabled = false;
        }
      });
    });
  }

  // 6. Upcoming Booking Analytics Data Engine
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

    const createRowHTML = (app) => {
      const dateString = new Date(app.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      let patientDisplayName = "Scheduled Patient";
      if (app.patientId && typeof app.patientId === "object") {
        patientDisplayName = `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`;
      } else {
        patientDisplayName = app.patientName || patientDisplayName;
      }

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
          <td class="p-3 text-sm font-semibold text-slate-800">${patientDisplayName.trim()}</td>
          <td class="p-3 text-sm text-slate-600 font-medium">${dateString}</td>
          <td class="p-3 text-sm font-mono text-slate-600">${app.time || "TBD"}</td>
          <td class="p-3 text-sm text-slate-600">${app.service || app.treatmentName || "Consultation"}</td>
          <td class="p-3">
            <span class="text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">${app.status}</span>
          </td>
        </tr>`;
    };

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
      </div>`;

    if (mode === "chronological") {
      container.innerHTML = createTableHTML(
        upcomingAppointments.map(createRowHTML).join(""),
      );
      return;
    }

    const groupedData = {};
    upcomingAppointments.forEach((app) => {
      const cleanDateStr = app.date.includes("T")
        ? app.date.split("T")[0]
        : app.date;
      const [partsYear, partsMonth, partsDay] = cleanDateStr.split("-");
      const d = new Date(partsYear, partsMonth - 1, partsDay);
      const groupKey =
        mode === "day"
          ? d.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

      if (!groupedData[groupKey]) groupedData[groupKey] = [];
      groupedData[groupKey].push(app);
    });

    let aggregateHTML = "";
    Object.keys(groupedData).forEach((titleKey) => {
      aggregateHTML += `
        <div class="mt-2 mb-4">
          <div class="flex items-center gap-2 mb-2 px-1">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            <h4 class="text-xs font-black text-slate-700 uppercase tracking-wider">${titleKey}</h4>
            <span class="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ml-auto">${groupedData[titleKey].length} Bookings</span>
          </div>
          ${createTableHTML(groupedData[titleKey].map(createRowHTML).join(""))}
        </div>`;
    });

    container.innerHTML = aggregateHTML;
  }

  // 7. Walk-In Intake Registry Handler
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
        await fetchDailyQueue();
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

  // Launch Engine runtime sequence
  initializeDashboard();
});
