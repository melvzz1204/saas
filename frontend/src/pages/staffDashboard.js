const API_BASE_URL = "http://localhost:5000";

const rawGlobalToken = localStorage.getItem("token");
const globalToken = rawGlobalToken ? rawGlobalToken.replace(/['"]+/g, "") : "";

if (!globalToken || globalToken === "null" || globalToken === "undefined") {
  console.warn("🛡️ No active session found. Redirecting to login.");
  window.location.replace("/staffLogin.html");
}

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. DOM Elements ---
  const clinicTitle = document.getElementById("clinic-branch-title");
  const staffBadge = document.getElementById("staff-name-badge");
  const logoutBtn = document.getElementById("staff-logout-btn");
  const colWaiting = document.getElementById("col-waiting");
  const colTreatment = document.getElementById("col-treatment");
  const colCompleted = document.getElementById("col-completed");
  const statRemaining = document.getElementById("stat-remaining");
  const statActiveChair = document.getElementById("stat-active-chair");
  const statCompleted = document.getElementById("stat-completed");
  const countWaiting = document.getElementById("count-waiting");
  const countTreatment = document.getElementById("count-treatment");
  const countCompleted = document.getElementById("count-completed");
  const modalWalkIn = document.getElementById("walkin-modal");
  const btnOpenWalkIn = document.getElementById("btn-open-walkin");
  const btnCloseWalkIn = document.getElementById("btn-close-walkin");
  const formWalkIn = document.getElementById("form-walkin");

  let cachedUpcomingAppointments = [];
  let globalAppointmentsArray = [];

  // --- 2. Real-Time Sockets ---
  const socket = io(API_BASE_URL);
  socket.on("pipeline-update", async (data) => {
    console.log("🔔 Real-time sync notification intercepted:", data.message);
    if (typeof fetchDailyQueue === "function") {
      await fetchDailyQueue();
    } else {
      window.location.reload();
    }
  });

  // --- 3. Core Functions ---
  /*  async function fetchAvailableDentists() {
    const dentistDropdown = document.getElementById("modal-dentist-dropdown");
    if (!dentistDropdown) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/staff?role=dentist`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok)
        throw new Error("Failed to populate operator roster records.");

      const data = await response.json();
      const dentists = data.staff || data.data || data || [];

      dentistDropdown.innerHTML = `<option value="">-- Choose Operator --</option>`;

      dentists.forEach((doc) => {
        const option = document.createElement("option");
        option.value = doc._id || doc.id;

        let rawName = "Unknown Operator";
        if (doc.fullName) rawName = doc.fullName;
        else if (doc.name) rawName = doc.name;
        else if (doc.firstName || doc.lastName)
          rawName = `${doc.firstName || ""} ${doc.lastName || ""}`.trim();

        option.textContent = rawName.startsWith("Dr.")
          ? rawName
          : `Dr. ${rawName}`;
        dentistDropdown.appendChild(option);
      });
      console.log(
        `🍏 Successfully mapped ${dentists.length} operators to cache dropdown container.`,
      );
    } catch (err) {
      console.error("⚠️ Dynamic dentist sync failed:", err);
    }
  }
 */

  async function fetchAvailableDentists() {
    const dentistDropdown = document.getElementById("modal-dentist-dropdown");
    if (!dentistDropdown) return;

    const clinicName = localStorage.getItem("clinicName");
    const clinicId = localStorage.getItem("clinicId");
    const rawToken = localStorage.getItem("token");

    // 1. Clean the token of any accidental stringified quotes
    const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";

    try {
      let url = `${API_BASE_URL}/api/v1/staff?role=dentist`;
      if (clinicId) {
        url += `&clinicId=${clinicId}`;
      } else if (clinicName) {
        url += `&clinicName=${encodeURIComponent(clinicName)}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-clinic-id": clinicId || "", // 👈 CRITICAL: Backend middleware likely requires this!
        },
      });

      // 2. If the backend rejects the request, parse the exact error message
      if (!response.ok) {
        let serverError = "Unknown backend error";
        try {
          const errJson = await response.json();
          serverError = errJson.message || JSON.stringify(errJson);
        } catch {
          serverError = await response.text();
        }
        throw new Error(
          `Failed to populate operator registry lists. Server says: ${serverError}`,
        );
      }

      const data = await response.json();
      const dentists =
        data.staff ||
        data.users ||
        data.data ||
        (Array.isArray(data) ? data : []);

      dentistDropdown.innerHTML = `<option value="">-- Choose Operator --</option>`;

      dentists.forEach((doc) => {
        const option = document.createElement("option");
        option.value = doc._id || doc.id;

        let rawName = "";
        if (doc.fullName) rawName = doc.fullName;
        else if (doc.name) rawName = doc.name;
        else if (doc.firstName || doc.lastName) {
          rawName = `${doc.firstName || ""} ${doc.lastName || ""}`;
        }

        rawName = rawName.trim() || "Unknown Operator";

        option.textContent = rawName.startsWith("Dr.")
          ? rawName
          : `Dr. ${rawName}`;
        dentistDropdown.appendChild(option);
      });
    } catch (err) {
      console.error("⚠️ Error rendering dynamic operator lists:", err);
    }
  }

  function renderUpcomingSidebar(appointments) {
    const colUpcoming = document.getElementById("col-upcoming");
    const countUpcoming = document.getElementById("count-upcoming");
    if (!colUpcoming) return;

    const localDate = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const todayString = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}`;

    const expectedPatients = appointments.filter((app) => {
      return (
        app.date === todayString &&
        (app.status === "Approved" || app.status === "pending")
      );
    });

    if (countUpcoming) countUpcoming.textContent = expectedPatients.length;
    colUpcoming.innerHTML = "";

    if (expectedPatients.length === 0) {
      colUpcoming.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 mt-2">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">No remaining arrivals</span>
      </div>`;
      return;
    }

    expectedPatients.forEach((app) => {
      const patientName = app.patientId
        ? `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`.trim()
        : app.patientName || "Walk-In Patient";

      const card = document.createElement("div");
      card.className =
        "bg-white border border-slate-200/80 rounded-xl p-3.5 flex flex-col gap-3 transition-all hover:border-slate-300 hover:shadow-sm animate-in fade-in zoom-in-95 duration-150";
      card.innerHTML = `
      <div class="flex flex-col">
        <span class="text-xs font-bold text-slate-800">${patientName}</span>
        <div class="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          <span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">${app.time || "No Time Set"}</span>
          <span class="truncate">${app.service || "General Consult"}</span>
        </div>
      </div>
      <button onclick="executeLobbyCheckIn('${app._id || app.id}')"
              class="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] py-1.5 px-3 rounded-md shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1">
        📥 Check In
      </button>`;
      colUpcoming.appendChild(card);
    });
  }

  async function fetchDailyQueue() {
    try {
      const clinicId = localStorage.getItem("clinicId");
      let url = `${API_BASE_URL}/api/v1/appointments/today`;

      // Append clinicId as a query parameter if it exists
      if (clinicId) {
        url += `?clinicId=${clinicId}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
          "x-clinic-id": clinicId || "", // Also send it as a header just in case!
        },
      });

      if (!response.ok)
        throw new Error("Could not fetch daily operations roster.");

      const data = await response.json();
      globalAppointmentsArray = data.appointments || [];

      renderUpcomingSidebar(globalAppointmentsArray);
      renderKanbanBoard();
    } catch (err) {
      console.error("Board sync failed:", err);
      if (colWaiting) {
        colWaiting.innerHTML = `<p class="text-xs text-rose-500 font-bold p-4">⚠️ Sync connection lost. Check login session.</p>`;
      }
    }
  }

  // 1. Global state to track which patient is currently paying
  window.activeCheckoutAppointmentId = null;

  // 2. This is the exact function your button calls to open the modal
  window.triggerCheckoutSettlement = function (appointmentId) {
    window.activeCheckoutAppointmentId = appointmentId;
    const checkoutModal = document.getElementById("checkout-modal"); // Make sure this matches your modal's container ID

    if (checkoutModal) {
      checkoutModal.classList.remove("hidden"); // Opens the modal
    } else {
      console.error("Checkout modal not found in HTML!");
    }
  };

  // 3. This function wires up the buttons inside the modal itself
  // 1. Global state to track which patient is currently paying
  window.activeCheckoutAppointmentId = null;

  // 2. Function to open the modal
  window.triggerCheckoutSettlement = function (appointmentId) {
    window.activeCheckoutAppointmentId = appointmentId;
    const checkoutModal = document.getElementById("checkout-modal");

    if (checkoutModal) {
      checkoutModal.classList.remove("hidden");
    } else {
      console.error("Checkout modal not found in HTML!");
    }
  };

  // 3. The newly updated modal binding function
  function bindCheckoutModal() {
    const checkoutModal = document.getElementById("checkout-modal");
    const btnCloseCheckout = document.getElementById("btn-close-checkout");
    const btnConfirmCheckout = document.getElementById("btn-confirm-checkout");
    const paymentChannelSelect = document.getElementById(
      "modal-checkout-method",
    );

    const closeCheckoutModal = () => {
      if (checkoutModal) checkoutModal.classList.add("hidden");
      window.activeCheckoutAppointmentId = null;
      if (paymentChannelSelect) paymentChannelSelect.value = "Cash";
    };

    if (btnCloseCheckout) {
      btnCloseCheckout.onclick = closeCheckoutModal;
    }

    if (btnConfirmCheckout) {
      btnConfirmCheckout.onclick = async () => {
        if (!window.activeCheckoutAppointmentId) {
          alert("Error: No patient selected for checkout.");
          return;
        }

        const selectedMethod = paymentChannelSelect
          ? paymentChannelSelect.value
          : "Cash";
        const token = localStorage.getItem("token");

        try {
          btnConfirmCheckout.disabled = true;
          btnConfirmCheckout.innerHTML = "Processing... ⏳";

          // 🎯 FIXED: Updated to match your EXACT backend route and payload
          // Note: Make sure the base URL '/api/v1/appointments' matches where you mounted the router!
          const response = await fetch(
            `http://localhost:5000/api/v1/appointments/settle-payment`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                appointmentId: window.activeCheckoutAppointmentId,
                paymentMethod: selectedMethod,
                finalAmount: 1500.0, // You can replace this with a dynamic amount later if needed
              }),
            },
          );

          const data = await response.json();

          if (!response.ok)
            throw new Error(data.message || "Failed to process payment.");

          alert(`✅ ${data.message || "Payment captured successfully!"}`);

          closeCheckoutModal();

          // Refresh the kanban board
          if (typeof fetchDailyQueue === "function") {
            await fetchDailyQueue();
          }
        } catch (err) {
          alert(`Billing Error: ${err.message}`);
        } finally {
          btnConfirmCheckout.disabled = false;
          btnConfirmCheckout.innerHTML = "Confirm Payment 💵";
        }
      };
    }
  }
  function renderKanbanBoard() {
    if (!colWaiting || !colTreatment || !colCompleted) return;

    colWaiting.innerHTML = "";
    colTreatment.innerHTML = "";
    colCompleted.innerHTML = "";

    const localDate = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const todayString = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}`;

    const todayAppointments = globalAppointmentsArray.filter(
      (a) =>
        a.date === todayString ||
        (!a.date &&
          (a.status === "checked-in" ||
            a.status === "in-treatment" ||
            a.status === "COMPLETED_PENDING_BILL")),
    );

    cachedUpcomingAppointments = globalAppointmentsArray.filter(
      (a) => a.date > todayString,
    );

    const waitingList = todayAppointments.filter(
      (a) => a.status === "checked-in" || a.status === "waiting",
    );
    const treatmentList = todayAppointments.filter(
      (a) => a.status === "in-treatment" || a.status === "treatment",
    );
    const completedList = todayAppointments.filter(
      (a) => a.status === "completed" || a.status === "COMPLETED_PENDING_BILL",
    );

    if (countWaiting) countWaiting.textContent = waitingList.length;
    if (countTreatment) countTreatment.textContent = treatmentList.length;
    if (countCompleted) countCompleted.textContent = completedList.length;

    if (statRemaining)
      statRemaining.textContent = `${waitingList.length} Waiting`;
    if (statActiveChair)
      statActiveChair.textContent = `${treatmentList.length} In Chair`;
    if (statCompleted)
      statCompleted.textContent = `${completedList.length} Sessions`;

    renderDynamicCards(waitingList, colWaiting, "waiting");
    renderDynamicCards(treatmentList, colTreatment, "treatment");
    renderDynamicCards(completedList, colCompleted, "completed");

    const currentFilterMode =
      document.getElementById("filter-upcoming-range")?.value ||
      "chronological";
    renderUpcomingTable(cachedUpcomingAppointments, currentFilterMode);
  }

  function renderDynamicCards(appointments, container, type) {
    if (appointments.length === 0) {
      container.innerHTML = `
      <div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-wider select-none">
        Empty Column
      </div>`;
      return;
    }

    container.innerHTML = "";

    appointments.forEach((app) => {
      const currentAppointmentId = app._id || app.id;
      const card = document.createElement("div");

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

      let doctorName = "Unassigned Operator";
      if (app.doctorName) {
        doctorName = app.doctorName;
      } else if (app.dentistId) {
        if (typeof app.dentistId === "object") {
          doctorName = `Dr. ${app.dentistId.fullName || "Operator"}`;
        } else if (typeof app.dentistId === "string") {
          const dentistDropdown = document.getElementById(
            "modal-dentist-dropdown",
          );
          const matchingOption = dentistDropdown
            ? dentistDropdown.querySelector(`option[value="${app.dentistId}"]`)
            : null;
          doctorName = matchingOption
            ? matchingOption.textContent
            : `Dr. Operator (ID: ${app.dentistId.slice(-4).toUpperCase()})`;
        }
      }

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
        </button>`;
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
        </button>`;
      } else if (type === "completed") {
        const transactionTime =
          app.time ||
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        const isPendingBill = app.status === "COMPLETED_PENDING_BILL";

        if (isPendingBill) {
          card.className =
            "bg-amber-50/50 border border-amber-200 p-4 rounded-xl space-y-3 flex flex-col shadow-xs";
          card.innerHTML = `
          <div class="flex justify-between items-start">
            <div>
              <span class="text-[9px] font-mono font-black text-amber-500 uppercase tracking-wider block">UNPAID • ID: #PT-${shortId}</span>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide mt-0.5">${patientName}</h4>
            </div>
            <span class="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-sm uppercase">Checkout</span>
          </div>
          <div class="text-[11px] text-slate-500 font-medium space-y-0.5">
            <p>Procedure: <span class="text-slate-700 font-bold">${procedure}</span></p>
            <p>Doctor: <span class="text-slate-700 font-semibold">${doctorName}</span></p>
          </div>
          <button onclick="triggerCheckoutSettlement('${currentAppointmentId}')" class="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] py-2 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-xs">
            Collect Payment 💳
          </button>`;
        } else {
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
          </button>`;
        }
      }
      container.appendChild(card);
    });

    if (typeof window.bindCardActions === "function") {
      window.bindCardActions();
    }
  }
  window.bindCardActions = function () {
    const actionButtons = document.querySelectorAll(".action-btn");
    actionButtons.forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const appointmentId = btn.getAttribute("data-id");
        const actionType = btn.getAttribute("data-action");
        if (!appointmentId) return;
        if (actionType === "chair") {
          window.activeTargetAppointmentId = appointmentId;
          const targetModal = document.getElementById("dentist-assign-modal");
          if (targetModal) {
            targetModal.classList.remove("hidden");
          } else {
            console.error(
              "❌ ERROR: '#dentist-assign-modal' could not be found in the DOM.",
            );
          }
          return;
        } else if (actionType === "complete") {
          const confirmComplete = confirm(
            "Is the treatment finished? Send patient to billing queue?",
          );
          if (confirmComplete) {
            await window.executeStatusTransition(
              appointmentId,
              "COMPLETED_PENDING_BILL",
            );
          }
        }
      };
    });
    const btnConfirm = document.getElementById("btn-confirm-assign");
    const btnCancel = document.getElementById("btn-cancel-assign");
    const dentistDropdown = document.getElementById("modal-dentist-dropdown");
    if (btnConfirm) {
      btnConfirm.onclick = async (e) => {
        e.preventDefault();
        const chosenDentistId = dentistDropdown?.value;
        if (!chosenDentistId) {
          alert("Please select a Doctor from the dropdown before confirming.");
          return;
        }
        if (!window.activeTargetAppointmentId) {
          alert(
            "Error: Lost track of patient context tracking signature. Please re-open.",
          );
          return;
        }
        btnConfirm.innerText = "Syncing...";
        btnConfirm.disabled = true;
        await window.executeStatusTransition(
          window.activeTargetAppointmentId,
          "in-treatment",
          chosenDentistId,
        );
        btnConfirm.innerText = "Confirm & Seat ➡️";
        btnConfirm.disabled = false;
        document.getElementById("dentist-assign-modal").classList.add("hidden");
        if (dentistDropdown) dentistDropdown.value = "";
        window.activeTargetAppointmentId = null;
      };
    }
    if (btnCancel) {
      btnCancel.onclick = (e) => {
        e.preventDefault();
        document.getElementById("dentist-assign-modal").classList.add("hidden");
        if (dentistDropdown) dentistDropdown.value = "";
        window.activeTargetAppointmentId = null;
      };
    }
  };
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
      let patientDisplayName =
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

  function handleShiftExit() {
    localStorage.clear();
    window.location.replace("/staffLogin.html");
  }

  async function executeStatusTransition(
    appointmentId,
    nextStatus,
    assignedDentistId = null,
  ) {
    const rawToken = localStorage.getItem("token");
    const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
    const clinicId = localStorage.getItem("clinicId") || "";

    try {
      const payload = { status: nextStatus };
      if (assignedDentistId) {
        payload.dentistId = assignedDentistId;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/appointments/${appointmentId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-clinic-id": clinicId, // 👈 Required tenant context header
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Could not transform status.");
      }

      await fetchDailyQueue();
    } catch (err) {
      alert(`Network Sync Error: ${err.message}`);
    }
  }

  // --- 4. Window Expose for HTML Buttons ---
  window.fetchDailyQueue = fetchDailyQueue;
  window.executeStatusTransition = executeStatusTransition;

  window.triggerCheckoutSettlement = function (appointmentId) {
    const targetApp = globalAppointmentsArray.find(
      (a) => (a._id || a.id) === appointmentId,
    );
    if (!targetApp) {
      alert(
        "Record instance out of sync. Force refresh dashboard configuration.",
      );
      return;
    }
    let patientName =
      targetApp.patientId && typeof targetApp.patientId === "object"
        ? `${targetApp.patientId.firstName || ""} ${targetApp.patientId.lastName || ""}`.trim()
        : targetApp.patientName || targetApp.firstName || "Walk-In Patient";

    document.getElementById("modal-checkout-app-id").value = appointmentId;
    document.getElementById("modal-checkout-name").textContent = patientName;
    document.getElementById("modal-checkout-amount").value = 1500;
    document.getElementById("checkout-modal").classList.remove("hidden");
  };

  window.closeCheckoutModal = function () {
    const modal = document.getElementById("checkout-modal");
    if (modal) modal.classList.add("hidden");
  };

  window.submitCheckoutPayment = async function () {
    const appIdInput = document.getElementById("modal-checkout-app-id");
    const amountInput = document.getElementById("modal-checkout-amount");
    const methodInput = document.getElementById("modal-checkout-method");

    if (!appIdInput || !amountInput || !methodInput) {
      alert("Billing DOM elements missing. Cannot complete transaction.");
      return;
    }

    // 1. Safely extract token and clinic ID
    const rawToken = localStorage.getItem("token");
    const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
    const clinicId = localStorage.getItem("clinicId") || "";

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/appointments/settle-payment`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-clinic-id": clinicId, // 👈 REQUIRED: Tenant context header
          },
          body: JSON.stringify({
            appointmentId: appIdInput.value,
            finalAmount: parseFloat(amountInput.value) || 0,
            paymentMethod: methodInput.value,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Settlement processing failure.");

      window.closeCheckoutModal();
      alert(
        `🎉 Invoice settled via ${methodInput.value}! Status upgraded to completed archive logs.`,
      );
      await fetchDailyQueue();
    } catch (err) {
      alert(`Billing Engine Exception: ${err.message}`);
    }
  };

  window.executeLobbyCheckIn = async function (appointmentId) {
    const rawToken = localStorage.getItem("token");
    const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
    const clinicId = localStorage.getItem("clinicId") || "";

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/appointments/${appointmentId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-clinic-id": clinicId, // 👈 Required tenant context header
          },
          body: JSON.stringify({ status: "checked-in" }),
        },
      );

      if (!response.ok) {
        let serverError = "Failed to finalize check-in.";
        try {
          const errJson = await response.json();
          serverError = errJson.message || serverError;
        } catch {
          serverError = await response.text();
        }
        throw new Error(serverError);
      }

      await fetchDailyQueue();
    } catch (err) {
      alert(`Check-in pipeline failure: ${err.message}`);
    }
  };
  if (typeof formWalkIn !== "undefined" && formWalkIn) {
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
        if (modalWalkIn) modalWalkIn.classList.add("hidden");
        await fetchDailyQueue();
      } catch (err) {
        alert(`Error: ${err.message}`);
      } finally {
        submitBtn.innerText = "Seat in Lobby";
        submitBtn.disabled = false;
      }
    });
  }
  function initializeDashboard() {
    const upcomingModal = document.getElementById("upcoming-modal");
    const btnToggleUpcoming = document.getElementById("btn-toggle-upcoming");
    const btnCloseUpcoming = document.getElementById("btn-close-upcoming");
    const filterRange = document.getElementById("filter-upcoming-range");

    if (filterRange) {
      filterRange.addEventListener("change", (e) => {
        renderUpcomingTable(cachedUpcomingAppointments, e.target.value);
      });
    }

    if (btnToggleUpcoming && upcomingModal)
      btnToggleUpcoming.addEventListener("click", () =>
        upcomingModal.classList.remove("hidden"),
      );
    if (btnCloseUpcoming && upcomingModal)
      btnCloseUpcoming.addEventListener("click", () =>
        upcomingModal.classList.add("hidden"),
      );
    if (upcomingModal)
      upcomingModal.addEventListener("click", (e) => {
        if (e.target === upcomingModal) upcomingModal.classList.add("hidden");
      });

    if (clinicTitle)
      clinicTitle.textContent =
        localStorage.getItem("clinicName") || "Apex Dental Clinic";
    if (staffBadge)
      staffBadge.textContent =
        localStorage.getItem("staffName") || "Active Staff Duty";

    if (logoutBtn) logoutBtn.addEventListener("click", handleShiftExit);
    if (btnOpenWalkIn)
      btnOpenWalkIn.addEventListener("click", () =>
        modalWalkIn.classList.remove("hidden"),
      );
    if (btnCloseWalkIn)
      btnCloseWalkIn.addEventListener("click", () =>
        modalWalkIn.classList.add("hidden"),
      );

    // Boot up the network requests!
    (async () => {
      await fetchAvailableDentists();
      await fetchDailyQueue();
    })();

    // Refresh data behind the scenes every minute
    setInterval(async () => {
      await fetchDailyQueue();
    }, 60000);
  }
  window.activeCheckoutAppointmentId = null;
  function bindCheckoutModal() {
    const checkoutModal = document.getElementById("checkout-modal");
    const btnCloseCheckout = document.getElementById("btn-close-checkout");
    const btnConfirmCheckout = document.getElementById("btn-confirm-checkout");
    const paymentChannelSelect = document.getElementById(
      "modal-checkout-method",
    );

    // Close modal function
    const closeCheckoutModal = () => {
      if (checkoutModal) checkoutModal.classList.add("hidden");
      window.activeCheckoutAppointmentId = null;
      if (paymentChannelSelect) paymentChannelSelect.value = "Cash"; // Reset to default
    };

    if (btnCloseCheckout) btnCloseCheckout.onclick = closeCheckoutModal;

    // Process the payment when confirm is clicked
    if (btnConfirmCheckout) {
      btnConfirmCheckout.onclick = async () => {
        if (!window.activeCheckoutAppointmentId) {
          alert("Error: No patient selected for checkout.");
          return;
        }

        const selectedMethod = paymentChannelSelect
          ? paymentChannelSelect.value
          : "Cash";

        // 1. Safely extract token and clinic ID
        const rawToken = localStorage.getItem("token");
        const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
        const clinicId = localStorage.getItem("clinicId") || "";

        try {
          btnConfirmCheckout.disabled = true;
          btnConfirmCheckout.innerHTML = "Processing... ⏳";

          // 2. Pass x-clinic-id in the headers
          const response = await fetch(
            `${API_BASE_URL}/api/v1/appointments/${window.activeCheckoutAppointmentId}/checkout`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "x-clinic-id": clinicId, // 👈 REQUIRED: Tenant context header
              },
              body: JSON.stringify({
                status: "checked-out",
                paymentMethod: selectedMethod,
              }),
            },
          );

          const data = await response.json();

          if (!response.ok)
            throw new Error(data.message || "Failed to process payment.");

          alert(`✅ Payment captured successfully via ${selectedMethod}!`);

          closeCheckoutModal();

          // Refresh the kanban board to move the card to the Checked Out column
          if (typeof window.fetchDailyQueue === "function") {
            await window.fetchDailyQueue();
          } else if (typeof fetchDailyQueue === "function") {
            await fetchDailyQueue();
          }
        } catch (err) {
          alert(`Billing Error: ${err.message}`);
        } finally {
          btnConfirmCheckout.disabled = false;
          btnConfirmCheckout.innerHTML = "Confirm Payment 💵";
        }
      };
    }
  }
  bindCheckoutModal();
  initializeDashboard();
});
