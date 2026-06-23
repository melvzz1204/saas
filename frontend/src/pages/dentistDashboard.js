let activeSessionId = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Core State Verification Layer
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("userRole");
  const staffName = localStorage.getItem("staffName");
  const clinicName = localStorage.getItem("clinicName");

  // Guard Clause: If unauthenticated, bounce intruder back to login portal
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
  const token = localStorage.getItem("token");
  const manifestContainer = document.querySelector(
    ".flex-1.overflow-y-auto.space-y-3",
  );
  const countBadge = document.querySelector(".bg-slate-100.text-slate-600");

  if (!manifestContainer) return;

  try {
    // 🎯 FIXED: Re-routed to the Appointments database!
    const response = await fetch(
      "http://localhost:5000/api/v1/appointments/today",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = await response.json();

    if (!response.ok)
      throw new Error(data.message || "Failed to fetch active pipeline.");

    // Extract the appointments array
    const rawList = data.appointments || data.data || data || [];

    // Filter for patients currently in treatment
    const queue = rawList.filter((item) => {
      const s = (item.status || "").toLowerCase();
      return s === "in_chair" || s === "in-treatment" || s === "treatment";
    });

    if (countBadge) {
      countBadge.textContent = `${queue.length} Left`;
    }

    manifestContainer.innerHTML = "";

    if (queue.length === 0) {
      manifestContainer.innerHTML = `<p class="text-xs font-semibold text-slate-400 text-center py-8">No assigned patients in queue.</p>`;
      clearActiveChairView();
      return;
    }

    let activePatient = queue[0];

    if (activePatient) {
      hydrateActiveChairView(activePatient);
    } else {
      clearActiveChairView();
    }

    queue.forEach((item) => {
      const isCurrent = activePatient && activePatient._id === item._id;
      const timeString = new Date(
        item.createdAt || item.date || Date.now(),
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      let displayName = "Unknown Patient";
      if (item.patientId && typeof item.patientId === "object") {
        if (item.patientId.fullName) {
          displayName = item.patientId.fullName;
        } else {
          displayName =
            `${item.patientId.firstName || ""} ${item.patientId.lastName || ""}`.trim();
        }
      } else if (item.patientName || item.fullName || item.firstName) {
        displayName = item.patientName || item.fullName || item.firstName;
      }

      const displayProcedure =
        item.procedureName ||
        item.service ||
        item.treatmentName ||
        "General Consultation";

      const card = document.createElement("div");
      card.className = isCurrent
        ? "border-2 border-sky-500 bg-sky-50/20 p-4 rounded-xl space-y-1 relative"
        : "border border-slate-200 bg-white p-4 rounded-xl space-y-1 hover:border-slate-300 transition-colors cursor-pointer";

      card.innerHTML = `
        ${isCurrent ? '<span class="absolute top-3 right-3 text-[9px] font-black uppercase text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-sm">In Chair</span>' : ""}
        <p class="text-[9px] font-mono font-bold text-slate-400">${timeString}</p>
        <h4 class="text-xs font-black ${isCurrent ? "text-slate-800" : "text-slate-700"} uppercase tracking-wide">${displayName}</h4>
        <p class="text-[11px] text-slate-500 font-medium">${displayProcedure}</p>
      `;

      if (!isCurrent) {
        card.addEventListener("click", () => {
          hydrateActiveChairView(item);
          fetchClinicalQueue();
        });
      }

      manifestContainer.appendChild(card);
    });
  } catch (err) {
    console.error("Queue Synchronicity Fault:", err);
    manifestContainer.innerHTML = `<p class="text-xs text-rose-500 font-bold p-4">Error sync tracking data matrix maps.</p>`;
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
          },
          body: JSON.stringify({
            // 🎯 FIXED: This sends the patient to the Staff's Yellow Billing Queue instead of skipping it!
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
