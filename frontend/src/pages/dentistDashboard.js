import {
  fetchPatientHistory,
  renderPatientHistoryUI,
} from "../util/clinicalNote.js"; // Adjust path to clinicalNote.js if needed

let activeSessionId = null;
let activePatientId = null; // Required for the database
let activeProcedureName = "General Consultation"; // Required for the note
const API_BASE_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Core State Verification Layer
  let token = localStorage.getItem("token");
  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const rawRole = localStorage.getItem("userRole") || userData.role || "";
  const userRole = rawRole.toLowerCase();

  const staffName =
    localStorage.getItem("staffName") || userData.firstName || "Doctor";
  const clinicName = localStorage.getItem("clinicName") || "Dental Clinic";

  if (token) token = token.replace(/['"]+/g, "");

  if (!token || userRole !== "dentist") {
    console.warn(
      "Unauthorized terminal entry vector. Redirecting to security gate...",
    );
    localStorage.clear();
    window.location.href = "/staffLogin.html";
    return;
  }

  // 2. Dynamic Interface Population Matrix
  initDynamicBranding(staffName, clinicName);

  // 3. Live Pipeline Fetch Integration
  await fetchClinicalQueue();

  // 4. Form Action Processing Submission Bind
  bindProcedureSubmission();

  // Kick off background operations session clock
  startSessionClock();
});

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("dentist-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Are you sure you want to log out of the dashboard?")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("clinicId");
        window.location.href = "/staffLogin.html";
      }
    });
  }
});

function initDynamicBranding(doctorName, clinicTitle) {
  const clinicTextElement = document.querySelector("h1.text-sm.font-black");
  const doctorBadgeElement = document.querySelector(".text-\\[10px\\]");

  if (clinicTextElement && clinicTitle) {
    clinicTextElement.textContent = clinicTitle.trim();
  }

  if (doctorBadgeElement && doctorName) {
    const pulseIndicator = doctorBadgeElement.querySelector(".animate-pulse");
    doctorBadgeElement.innerHTML = "";
    if (pulseIndicator) {
      doctorBadgeElement.appendChild(pulseIndicator);
    }
    const textNode = document.createTextNode(` Dr. ${doctorName}`);
    doctorBadgeElement.appendChild(textNode);
  }
}

async function fetchClinicalQueue() {
  const rawToken = localStorage.getItem("token");
  const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  let clinicId = localStorage.getItem("clinicId") || userData.clinicId || "";

  const myDentistId =
    userData._id ||
    userData.id ||
    localStorage.getItem("userId") ||
    localStorage.getItem("staffId");

  if (!clinicId) {
    console.error("❌ Critical: No clinicId found in session context.");
    return;
  }

  try {
    let url = `${API_BASE_URL}/api/v1/appointments/today`;
    if (clinicId) {
      url += `?clinicId=${clinicId}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-clinic-id": clinicId,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch appointments.`);
    }

    const data = await response.json();
    const allAppointments = data.appointments || data.data || [];

    const myQueue = allAppointments.filter((app) => {
      const rawAssigned = app.dentistId || app.doctorId;
      const assignedId =
        rawAssigned && typeof rawAssigned === "object"
          ? rawAssigned._id || rawAssigned.id
          : rawAssigned;
      return String(assignedId) === String(myDentistId);
    });

    if (typeof renderDentistQueue === "function") {
      renderDentistQueue(myQueue);
    }

    if (myQueue.length > 0) {
      const activePatient = myQueue.find(
        (app) => app.status === "in-treatment" || app.status === "treatment",
      );

      if (activePatient) {
        hydrateActiveChairView(activePatient);
      } else {
        clearActiveChairView();
      }
    } else {
      clearActiveChairView();
    }
  } catch (err) {
    console.error("Queue Synchronicity Fault:", err);
    clearActiveChairView(); // Ensure it clears if fetch fails
  }
}

async function hydrateActiveChairView(patient) {
  activeSessionId = patient._id;

  // 1. EXTRACT PATIENT ID
  activePatientId =
    patient.patientId && typeof patient.patientId === "object"
      ? patient.patientId._id || patient.patientId.id
      : patient.patientId;

  // 2. EXTRACT PROCEDURE NAME
  activeProcedureName =
    patient.procedureName ||
    patient.service ||
    patient.treatmentName ||
    "General Consultation";

  // 3. SET DISPLAY NAME
  let displayName = "Unknown Patient";
  if (patient.patientId && typeof patient.patientId === "object") {
    if (patient.patientId.fullName) {
      displayName = patient.patientId.fullName;
    } else {
      displayName =
        `${patient.patientId.firstName || ""} ${patient.patientId.lastName || ""}`.trim();
    }
  } else if (patient.patientName || patient.fullName || patient.firstName) {
    displayName = patient.patientName || patient.fullName || patient.firstName;
  }

  const nameElement = document.getElementById("active-patient-name");
  if (nameElement) nameElement.textContent = displayName;

  const procedureLabel = document.getElementById("active-procedure-container");
  if (procedureLabel) {
    procedureLabel.innerHTML = `Assigned Procedure: <span class="text-slate-800 font-bold">${activeProcedureName}</span>`;
  }

  // 4. FETCH AND RENDER CLINICAL HISTORY
  const historyContainer = document.getElementById("patient-history-container");
  if (historyContainer && activePatientId) {
    historyContainer.innerHTML = `<p class="text-xs text-slate-400 text-center p-4">Loading past records...</p>`;
    const historyData = await fetchPatientHistory(activePatientId);
    renderPatientHistoryUI(historyData, "patient-history-container");
  }
}

function clearActiveChairView() {
  activeSessionId = null;
  activePatientId = null;
  activeProcedureName = "General Consultation";

  const nameElement = document.getElementById("active-patient-name");
  if (nameElement) nameElement.textContent = "No Active Case";

  const procedureLabel = document.getElementById("active-procedure-container");
  if (procedureLabel) {
    procedureLabel.innerHTML = `Status: <span class="text-slate-400 font-bold">Idle Workspace</span>`;
  }

  // Clear the history panel
  const historyContainer = document.getElementById("patient-history-container");
  if (historyContainer) {
    historyContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
          <span class="text-2xl mb-2">📂</span>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">No Active Patient</p>
      </div>`;
  }
}

function bindProcedureSubmission() {
  const form = document.getElementById("clinical-notes-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!activeSessionId || !activePatientId) {
      alert(
        "Operational pipeline exception: No patient loaded into active chair station context.",
      );
      return;
    }

    const token = localStorage.getItem("token");
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    const clinicId =
      localStorage.getItem("clinicId") || userData.clinicId || "";

    const submitBtn = form.querySelector('button[type="submit"]');
    const noteText = form.querySelector("textarea").value;
    const selectedTooth = window.activeSelectedTooth || null;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sealing Clinical Records... ⏳";

      // --- STEP A: POST TO CLINICAL NOTES ---
      const notePayload = {
        patientId: activePatientId,
        appointmentId: activeSessionId,
        chiefComplaint: `Patient scheduled for ${activeProcedureName}`,
        assessment: noteText,
        treatmentRendered: `Performed ${activeProcedureName}${
          selectedTooth ? ` on Tooth #${selectedTooth}` : ""
        }`,
        progressNotes: noteText,
        recommendations:
          "Maintain routine oral hygiene and follow-up as needed.",
      };

      const noteResponse = await fetch(
        `${API_BASE_URL}/api/v1/clinical-notes`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-clinic-id": clinicId,
          },
          body: JSON.stringify(notePayload),
        },
      );

      const noteData = await noteResponse.json();

      if (!noteResponse.ok) {
        throw new Error(
          noteData.message || "Failed to save clinical note to record history.",
        );
      }

      // --- STEP B: UPDATE APPOINTMENT STATUS ---
      const statusResponse = await fetch(
        `${API_BASE_URL}/api/v1/appointments/${activeSessionId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-clinic-id": clinicId,
          },
          body: JSON.stringify({
            status: "COMPLETED_PENDING_BILL",
            clinicalNotes: noteText,
            treatedTooth: selectedTooth,
            billingAmount: 250.0,
          }),
        },
      );

      const statusData = await statusResponse.json();

      if (!statusResponse.ok) {
        throw new Error(
          statusData.message || "Failed to finalize appointment status.",
        );
      }

      alert("🎉 Procedure completed! Clinical note saved to medical history.");

      form.reset();
      if (window.clearToothSelection) window.clearToothSelection();

      await fetchClinicalQueue();
    } catch (err) {
      alert(`Pipeline update failure: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Complete Procedure & Release Patient ✅";
    }
  });
}

function startSessionClock() {
  const timerDisplay = document.getElementById("session-timer");
  if (!timerDisplay) return;

  let totalSeconds = 1455;
  setInterval(() => {
    totalSeconds++;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, 1000);
}

const socketToken = localStorage.getItem("token");

if (typeof io !== "undefined") {
  const socket = io("http://localhost:5000", {
    transports: ["websocket"],
    upgrade: false,
    auth: {
      token: socketToken ? `Bearer ${socketToken}` : null,
    },
  });

  socket.on("connect", () => {
    console.log("🟢 Dentist Dashboard safely authenticated!");
  });

  socket.on("connect_error", (err) => {
    console.error("🔴 Dentist Live Sync Security Error:", err.message);
  });

  socket.on("pipeline-update", async (data) => {
    console.log("🔔 Clinical Event Intercepted:", data.message);
    if (typeof fetchClinicalQueue === "function") {
      await fetchClinicalQueue();
    }
  });
}

window.renderDentistQueue = function (queue) {
  const queueContainer = document.getElementById("queue-container");
  const queueCount = document.getElementById("queue-count");

  if (!queueContainer || !queueCount) return;

  const waitingPatients = queue.filter(
    (app) => app.status === "checked-in" || app.status === "waiting",
  );

  queueCount.textContent = `${waitingPatients.length} Left`;

  if (waitingPatients.length === 0) {
    queueContainer.innerHTML = `
      <div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-wider">
        No patients waiting
      </div>`;
    return;
  }

  queueContainer.innerHTML = "";

  waitingPatients.forEach((app, index) => {
    const isNext = index === 0;

    let patientName = "Unknown Patient";
    if (app.patientId && typeof app.patientId === "object") {
      patientName =
        `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`.trim();
    } else {
      patientName = app.patientName || app.firstName || "Walk-In Patient";
    }

    const procedure = app.service || app.treatmentName || "Consultation";

    const card = document.createElement("div");
    card.className = `p-4 rounded-xl border transition-all flex flex-col gap-2 ${
      isNext
        ? "bg-sky-50 border-sky-200 shadow-sm scale-[1.02]"
        : "bg-white border-slate-200 hover:border-slate-300"
    }`;

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          ${isNext ? `<span class="text-[9px] font-black text-sky-600 uppercase tracking-wider mb-1 block">👉 Next Up</span>` : ""}
          <h4 class="text-xs font-bold text-slate-800 uppercase">${patientName}</h4>
        </div>
        <span class="text-[9px] font-bold bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md">
          ${app.time || "Live"}
        </span>
      </div>
      <p class="text-[11px] text-slate-500 font-medium truncate">Procedure: <span class="text-slate-700">${procedure}</span></p>
    `;

    queueContainer.appendChild(card);
  });
};
