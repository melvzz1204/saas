/**
 * Staff Day-to-Day Operation Flow Dashboard Logic
 * Location Path: /src/pages/staffDashboard.js
 */

document.addEventListener("DOMContentLoaded", () => {
  // UI DOM Element Selectors
  const clinicTitle = document.getElementById("clinic-branch-title");
  const staffBadge = document.getElementById("staff-name-badge");
  const logoutBtn = document.getElementById("staff-logout-btn");
  const queueTbody = document.getElementById("staff-queue-tbody");
  const queueFilter = document.getElementById("queue-filter");

  // Live Metrics Indicators
  const statRemaining = document.getElementById("stat-remaining");
  const statCompleted = document.getElementById("stat-completed");
  const statActiveChair = document.getElementById("stat-active-chair");

  // Central Data Cache Store state
  let globalAppointmentsArray = [];
  const currentStaffId = localStorage.getItem("staffId");

  // 1. Initial State Hydration System Run
  function initializeDashboard() {
    // Hydrate Layout Identity Elements from localStorage cache matrix
    if (clinicTitle)
      clinicTitle.textContent =
        localStorage.getItem("clinicName") || "Apex Dental Clinic";
    if (staffBadge)
      staffBadge.textContent =
        localStorage.getItem("staffName") || "Active Staff Duty Node";

    // Fetch Data Array Pipelines from backend collections
    fetchDailyQueue();

    // Attach Persistent Event Listeners
    if (logoutBtn) logoutBtn.addEventListener("click", handleShiftExit);
    if (queueFilter) queueFilter.addEventListener("change", renderQueueTable);
  }

  // 2. Queue Data Fetch Module Engine
  async function fetchDailyQueue() {
    try {
      // Adjust resource parameters based on actual SaaS API configurations
      const response = await fetch("/api/appointments/today", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok)
        throw new Error("Could not fetch daily operations roster.");

      const data = await response.json();
      globalAppointmentsArray = data.appointments || [];

      // Execute template renders and live counter re-calculations
      renderQueueTable();
      calculateMetrics();
    } catch (err) {
      console.error("Roster queue injection breakdown:", err);
      if (queueTbody) {
        queueTbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-8 text-center text-rose-400 font-bold tracking-wide">
                            ⚠️ Failed to synchronize live workflow records from node server.
                        </td>
                    </tr>`;
      }
    }
  }

  // 3. Mathematical Telemetry Counter Processor
  function calculateMetrics() {
    if (!globalAppointmentsArray.length) return;

    // Filter and evaluate arrays matching target requirements
    const remaining = globalAppointmentsArray.filter(
      (app) => app.status !== "completed",
    ).length;
    const completed = globalAppointmentsArray.filter(
      (app) => app.status === "completed",
    ).length;
    const activeInChair = globalAppointmentsArray.find(
      (app) => app.status === "in-treatment",
    );

    // Inject computed dynamic elements safely back into context spaces
    if (statRemaining) statRemaining.textContent = `${remaining} Patients`;
    if (statCompleted) statCompleted.textContent = `${completed} Sessions`;
    if (statActiveChair) {
      statActiveChair.textContent = activeInChair
        ? `${activeInChair.patientName}`
        : "No Active Chair";
    }
  }

  // 4. HTML Table Generation Node Engine
  function renderQueueTable() {
    if (!queueTbody) return;
    queueTbody.innerHTML = "";

    const selectedFilter = queueFilter ? queueFilter.value : "all";

    // Filter rows based on matching filter choices
    const filteredData = globalAppointmentsArray.filter((app) => {
      if (selectedFilter === "assigned")
        return app.assignedStaffId === currentStaffId;
      if (selectedFilter === "completed") return app.status === "completed";
      return true; // "all" configuration catches outstanding array instances
    });

    if (filteredData.length === 0) {
      queueTbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-8 text-center text-slate-400 italic">
                        No operations or appointments match current filter selections.
                    </td>
                </tr>`;
      return;
    }

    // Dynamically append UI nodes to the DOM container loop
    filteredData.forEach((appointment) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/60 transition-colors";

      // Generate conditional button actions based on appointment state tracking markers
      let actionButtonsHTML = "";
      if (
        appointment.status === "pending" ||
        appointment.status === "confirmed"
      ) {
        actionButtonsHTML = `
                    <button data-id="${appointment.id}" data-action="chair" class="action-btn px-2.5 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 font-bold text-[10px] uppercase rounded-lg tracking-wide transition-all cursor-pointer">
                        Call to Chair
                    </button>`;
      } else if (appointment.status === "in-treatment") {
        actionButtonsHTML = `
                    <button data-id="${appointment.id}" data-action="complete" class="action-btn px-2.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-[10px] uppercase rounded-lg tracking-wide transition-all cursor-pointer shadow-xs">
                        Mark Done
                    </button>`;
      } else if (appointment.status === "completed") {
        actionButtonsHTML = `<span class="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center justify-end">✓ Finalized</span>`;
      }

      tr.innerHTML = `
                <td class="py-4 px-6">
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-950">${appointment.patientName}</span>
                        <span class="text-[10px] text-slate-400">Chart Access: #PT-${appointment.patientId}</span>
                    </div>
                </td>
                <td class="py-4 px-6 text-slate-500">
                    <span class="bg-slate-100 px-2 py-1 rounded-md font-mono font-bold text-slate-700">${appointment.timeSlot}</span>
                </td>
                <td class="py-4 px-6">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold">
                        ${appointment.treatmentName}
                    </span>
                </td>
                <td class="py-4 px-6 text-right">
                    <div class="inline-flex items-center space-x-2">
                        ${actionButtonsHTML}
                    </div>
                </td>
            `;

      queueTbody.appendChild(tr);
    });

    // Register action listeners for interactive row buttons
    bindRowActionListeners();
  }

  // 5. Grid Inline Status Row Click Event Bindings
  function bindRowActionListeners() {
    document.querySelectorAll(".action-btn").forEach((button) => {
      button.addEventListener("click", async (e) => {
        const appointmentId = e.currentTarget.getAttribute("data-id");
        const actionType = e.currentTarget.getAttribute("data-action");

        // Determine target workflow status matching intent
        const nextStatus =
          actionType === "chair" ? "in-treatment" : "completed";

        try {
          const response = await fetch(
            `/api/appointments/${appointmentId}/status`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: nextStatus }),
            },
          );

          if (!response.ok) throw new Error("Could not sync workflow state.");

          // Refresh internal structures cleanly upon success
          await fetchDailyQueue();
        } catch (err) {
          alert(`Error completing step assignment operation: ${err.message}`);
        }
      });
    });
  }

  // 6. Shift Clean Execution Logout Function
  function handleShiftExit() {
    localStorage.clear(); // Safely clear tracking states out of active memory footprints
    window.location.replace("/staffLogin.html");
  }

  // Fire Up Execution Pipelines
  initializeDashboard();
});
