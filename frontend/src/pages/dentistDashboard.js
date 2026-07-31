let activeSessionId = null;
const API_BASE_URL = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Core State Verification Layer
  let token = localStorage.getItem("token");

  // Safely parse the user object in case data is stored there instead
  const userData = JSON.parse(localStorage.getItem("user") || "{}");

  // Grab the role, checking both possible locations and converting to lowercase
  const rawRole = localStorage.getItem("userRole") || userData.role || "";
  const userRole = rawRole.toLowerCase();

  // Grab the names, falling back to the user object if necessary
  const staffName =
    localStorage.getItem("staffName") || userData.firstName || "Doctor";
  const clinicName = localStorage.getItem("clinicName") || "Dental Clinic";

  // Clean the token just in case it has quotes around it from JSON stringification
  if (token) token = token.replace(/['"]+/g, "");

  // Guard Clause: Check against lowercase "dentist"
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

      // 1. Confirm intention so they don't accidentally click it while working
      const confirmLogout = confirm(
        "Are you sure you want to log out of the dashboard?",
      );

      if (confirmLogout) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("clinicId");

        // 🎯 Change this path to match your actual dentist login page!
        window.location.href = "/staffLogin.html";
      }
    });
  }
});
function initDynamicBranding(doctorName, clinicTitle) {
  const clinicTextElement = document.querySelector("h1.text-sm.font-black");
  // 🎯 FIXED: Changed to 10px to match your actual HTML file
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

<<<<<<< HEAD
  // The ID of the currently logged-in dentist
  const myDentistId = userData._id || userData.id;
=======
  // 🎯 FIXED 1: Added fallback variables in case the login script saves the ID differently
  const myDentistId =
    userData._id ||
    userData.id ||
    localStorage.getItem("userId") ||
    localStorage.getItem("staffId");
>>>>>>> Test

  if (!clinicId) {
    console.error("❌ Critical: No clinicId found in session context.");
    return;
  }

  try {
<<<<<<< HEAD
    // 1. Use the working appointments route instead of the missing dentist route
=======
>>>>>>> Test
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
<<<<<<< HEAD
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch appointments.`);
    }

    const data = await response.json();
    const allAppointments = data.appointments || data.data || [];

    // 2. Filter the queue so this dentist only sees their assigned patients
    const myQueue = allAppointments.filter((app) => {
      // Handle cases where dentistId is populated as an object vs a raw string
      const assignedId =
        app.dentistId && typeof app.dentistId === "object"
          ? app.dentistId._id
          : app.dentistId;

      return assignedId === myDentistId;
    });

    console.log("📥 Filtered Dentist Queue loaded:", myQueue);

    // 3. Render the UI
    if (typeof renderDentistQueue === "function") {
      renderDentistQueue(myQueue);
    }
=======
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch appointments.`);
    }

    const data = await response.json();
    const allAppointments = data.appointments || data.data || [];

    // 2. Filter the queue so this dentist only sees their assigned patients
    const myQueue = allAppointments.filter((app) => {
      // Safely grab the assigned ID whether it's nested or raw
      const rawAssigned = app.dentistId || app.doctorId;
      const assignedId =
        rawAssigned && typeof rawAssigned === "object"
          ? rawAssigned._id || rawAssigned.id
          : rawAssigned;

      // 🎯 FIXED 2: Force both IDs into Strings to prevent Type Mismatch failures!
      return String(assignedId) === String(myDentistId);
    });

    console.log("📥 Filtered Dentist Queue loaded:", myQueue);

    // 3. Render the UI
    if (typeof renderDentistQueue === "function") {
      renderDentistQueue(myQueue);
    }

    // 🎯 FIXED 3: Specifically target the patient who is actively "in-treatment"
    if (myQueue.length > 0) {
      const activePatient = myQueue.find(
        (app) => app.status === "in-treatment" || app.status === "treatment",
      );

      if (activePatient) {
        // Load the patient actively in the chair
        hydrateActiveChairView(activePatient);
      } else {
        // No one is currently in the chair
        clearActiveChairView();
      }
    } else {
      clearActiveChairView();
    }
>>>>>>> Test
  } catch (err) {
    console.error("Queue Synchronicity Fault:", err);
  }
}

function hydrateActiveChairView(patient) {
  activeSessionId = patient._id;

  // 🎯 FIXED: Robust Name Extraction here too
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

  const displayProcedure =
    patient.procedureName ||
    patient.service ||
    patient.treatmentName ||
    "General Consultation";

  const nameElement = document.getElementById("active-patient-name");
  if (nameElement) nameElement.textContent = displayName;

  const procedureLabel = document.getElementById("active-procedure-container");
  if (procedureLabel) {
    procedureLabel.innerHTML = `Assigned Procedure: <span class="text-slate-800 font-bold">${displayProcedure}</span>`;
  }
}

function clearActiveChairView() {
  activeSessionId = null;

  const nameElement = document.getElementById("active-patient-name");
  if (nameElement) nameElement.textContent = "No Active Case";

  const procedureLabel = document.getElementById("active-procedure-container");
  if (procedureLabel) {
    procedureLabel.innerHTML = `Status: <span class="text-slate-400 font-bold">Idle Workspace</span>`;
  }
}

function bindProcedureSubmission() {
  const form = document.getElementById("clinical-notes-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!activeSessionId) {
      alert(
        "Operational pipeline exception: No patient loaded into active chair station context.",
      );
      return;
    }

    const token = localStorage.getItem("token");

    // 🎯 FIX: Extract the clinicId safely from local storage
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    const clinicId =
      localStorage.getItem("clinicId") || userData.clinicId || "";

    const submitBtn = form.querySelector('button[type="submit"]');
    const noteText = form.querySelector("textarea").value;
    const selectedTooth = window.activeSelectedTooth || null;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sealing Clinical Records...";

      const response = await fetch(
        `http://localhost:5000/api/v1/appointments/${activeSessionId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-clinic-id": clinicId, // 🎯 FIX: Added the missing tenant context header
          },
          body: JSON.stringify({
            status: "COMPLETED_PENDING_BILL",
            clinicalNotes: noteText,
            treatedTooth: selectedTooth,
            billingAmount: 250.0,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok)
        throw new Error(data.message || "Failed to commit record updates.");

      alert(
        `🎉 Success! Clinical notes updated. Transferred to checkout queue.`,
      );

      form.reset();
      if (window.clearToothSelection) window.clearToothSelection();

      await fetchClinicalQueue();
    } catch (err) {
      alert(`Pipeline update failure: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Complete Procedure & Release Patient 💳";
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
// 🎯 NEW: Function to render the assigned patient queue
window.renderDentistQueue = function (queue) {
  const queueContainer = document.getElementById("queue-container");
  const queueCount = document.getElementById("queue-count");

  if (!queueContainer || !queueCount) return;

  // Filter for patients who are assigned to this dentist and currently waiting
  const waitingPatients = queue.filter(
    (app) => app.status === "checked-in" || app.status === "waiting",
  );

  // Update the top right count badge
  queueCount.textContent = `${waitingPatients.length} Left`;

  // If the queue is empty, show a blank state
  if (waitingPatients.length === 0) {
    queueContainer.innerHTML = `
      <div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-wider">
        No patients waiting
      </div>`;
    return;
  }

  // Clear the "Contacting data stream..." loader
  queueContainer.innerHTML = "";

  // Render a card for each waiting patient
  waitingPatients.forEach((app, index) => {
    // We highlight the person at index 0 because they are strictly "Next Up"
    const isNext = index === 0;

    // Safely extract the patient's name
    let patientName = "Unknown Patient";
    if (app.patientId && typeof app.patientId === "object") {
      patientName =
        `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`.trim();
    } else {
      patientName = app.patientName || app.firstName || "Walk-In Patient";
    }

    const procedure = app.service || app.treatmentName || "Consultation";

    // Create the visual card
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
