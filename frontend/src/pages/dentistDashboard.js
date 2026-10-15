import {
  fetchPatientHistory,
  renderPatientHistoryUI,
  saveNewClinicalNote,
} from "../util/clinicalNote.js"; // Adjust path to clinicalNote.js if needed

let activeSessionId = null;
let activePatientId = null; // Required for the database
let activeProcedureName = "General Consultation"; // Required for the note
let activePatientIntake = null;
let latestQueue = []; // Last-known dentist queue snapshot (for the queue modal)
const API_BASE_URL = window.ApiBase;

// Non-blocking feedback (falls back to alert only if the shared UI is absent).
const notify = (message, type = "info") =>
  window.DashboardUI ? window.DashboardUI.toast(message, type) : window.alert(message);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch (error) {
    console.warn(
      "Invalid saved user profile; using staff session values.",
      error,
    );
    return {};
  }
}

function getStoredSession() {
  const userData = readStoredUser();
  const rawToken = localStorage.getItem("token") || "";
  const token = rawToken.replace(/['"]+/g, "");
  const clinicId = localStorage.getItem("clinicId") || userData.clinicId || "";
  const staffId =
    localStorage.getItem("staffId") ||
    localStorage.getItem("userId") ||
    userData._id ||
    userData.id ||
    userData.userId ||
    userData.staffId ||
    "";
  return { token, userData, clinicId, staffId };
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Core State Verification Layer
  const { token, userData } = getStoredSession();
  const rawRole = localStorage.getItem("userRole") || userData.role || "";
  const userRole = rawRole.toLowerCase().trim();

  const staffName =
    localStorage.getItem("staffName") ||
    [userData.firstName, userData.lastName].filter(Boolean).join(" ") ||
    userData.fullName ||
    userData.name ||
    "Doctor";
  const clinicName =
    localStorage.getItem("clinicName") ||
    userData.clinicName ||
    "Dental Clinic";

  if (!token || !["dentist", "doctor"].includes(userRole)) {
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
  bindXrayReferral();
  bindPrescription();
  bindPatientIntakeReview();

  // 5. Navigation scroll-spy for the workspace rail
  initNavScrollSpy();

  // 6. Queue / history overlay modal triggers
  bindModalTriggers();
});

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("dentist-logout-btn");
  logoutBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    localStorage.removeItem("staffId");
    localStorage.removeItem("staffName");
    localStorage.removeItem("clinicId");
    window.location.replace("/staffLogin.html");
  });
});

function initDynamicBranding(doctorName, clinicTitle) {
  const clinicTextElement = document.getElementById("clinic-title");
  const identityName = document.getElementById("dentist-identity-name");
  const avatar = document.getElementById("dentist-avatar");

  if (clinicTextElement && clinicTitle) {
    clinicTextElement.textContent = clinicTitle.trim();
  }

  const displayName = doctorName || "Doctor";

  if (identityName) {
    const firstName = String(displayName).split(" ")[0] || "";
    const hasTitle = /^dr\.?\s/i.test(String(displayName).trim());
    identityName.textContent = hasTitle
      ? String(displayName).trim()
      : `Dr. ${firstName}`;
  }

  if (avatar) {
    avatar.textContent = (String(displayName).charAt(0) || "D").toUpperCase();
  }
}

function initNavScrollSpy() {
  const anchorLink = document.querySelector(
    ".nav-link[data-scroll-target='clinical-record']",
  );
  if (!anchorLink) return;

  const recordSection = document.getElementById("clinical-record");
  if (recordSection) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          anchorLink.classList.toggle("nav-active", entry.isIntersecting);
        });
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    observer.observe(recordSection);
  }
}

// ---------------------------------------------------------------
// Overlay modal helpers (queue + history open cleanly on request,
// keeping the clinical workspace uncluttered)
// ---------------------------------------------------------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  // Refresh content each time the modal is opened.
  if (id === "queue-modal") {
    renderDentistQueueFromStore();
  } else if (id === "history-modal") {
    hydrateHistoryModal();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("hidden");
  // Only release the page lock when every overlay is closed.
  const anyOpen = [
    "queue-modal",
    "history-modal",
    "patient-intake-review",
    "xray-referral-modal",
  ].some((mid) => !document.getElementById(mid)?.classList.contains("hidden"));
  if (!anyOpen) document.body.classList.remove("overflow-hidden");
}

function bindModalTriggers() {
  const openers = [{ btn: "nav-history-btn", modal: "history-modal" }];

  openers.forEach(({ btn, modal }) => {
    document.getElementById(btn)?.addEventListener("click", () => {
      openModal(modal);
    });
  });

  const closers = [
    { btn: "close-queue-modal", modal: "queue-modal" },
    { btn: "close-history-modal", modal: "history-modal" },
  ];

  closers.forEach(({ btn, modal }) => {
    document.getElementById(btn)?.addEventListener("click", () => {
      closeModal(modal);
    });
  });

  // Click outside the dialog panel to dismiss.
  ["queue-modal", "history-modal"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", (event) => {
      if (event.target.id === id) closeModal(id);
    });
  });

  // Escape key dismisses whichever queue/history overlay is open.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    ["queue-modal", "history-modal"].forEach((id) => {
      const modal = document.getElementById(id);
      if (modal && !modal.classList.contains("hidden")) closeModal(id);
    });
  });
}

// Renders the last-known queue snapshot into the queue modal. The queue is
// cached on every fetch so opening the modal never requires another round trip.
function renderDentistQueueFromStore() {
  if (typeof window.renderDentistQueue === "function") {
    window.renderDentistQueue(latestQueue || []);
  }
}

// Fetches + renders the clinical history for whichever patient is currently in
// the active chair, refreshing the history modal every time it is opened.
async function hydrateHistoryModal() {
  const container = document.getElementById("patient-history-container");
  if (!container) return;

  const patientLabel = document.getElementById("history-active-patient");

  if (!activePatientId) {
    if (patientLabel) patientLabel.textContent = "";
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
        <span class="text-2xl mb-2">📂</span>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">No Active Patient</p>
        <p class="mt-1 text-[10px] text-slate-400">Load a patient into the chair to view their history</p>
      </div>`;
    return;
  }

  const activeName =
    document.getElementById("active-patient-name")?.textContent?.trim() ||
    "Active patient";
  if (patientLabel) patientLabel.textContent = activeName;

  container.innerHTML = `
    <p class="text-xs text-slate-400 text-center p-4">Loading past records...</p>`;

  try {
    const historyData = await fetchPatientHistory(activePatientId);
    renderPatientHistoryUI(historyData, "patient-history-container");
  } catch (error) {
    container.innerHTML = `
      <p class="text-xs text-rose-600 text-center p-4 bg-rose-50 border border-rose-200 rounded-xl">
        Unable to load history: ${error.message}
      </p>`;
  }
}

async function fetchClinicalQueue() {
  const { token, userData, clinicId, staffId } = getStoredSession();
  const myDentistId = staffId;
  const myDentistEmail = String(
    userData.email || localStorage.getItem("staffEmail") || "",
  ).toLowerCase();

  if (!clinicId) {
    console.error("❌ Critical: No clinicId found in session context.");
    renderQueueError("Clinic session is missing. Please log in again.");
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
      const rawAssigned = app.dentistId || app.doctorId || app.dentist;
      const assignedId =
        rawAssigned && typeof rawAssigned === "object"
          ? rawAssigned._id || rawAssigned.id
          : rawAssigned;
      const normalizedStatus = String(app.status || "").toLowerCase();

      // Keep all assigned active workflow states in the dentist queue. The
      // active clinical case below is still restricted to in-treatment.
      const isDentistPatient = [
        "approved",
        "pending",
        "checked-in",
        "waiting",
        "in-treatment",
        "treatment",
      ].includes(normalizedStatus);

      // Some API responses provide an unpopulated dentistId, while others
      // return the populated Staff document. Compare every supported shape.
      const assignedEmail =
        rawAssigned && typeof rawAssigned === "object" ? rawAssigned.email : "";
      const dentistMatches =
        !rawAssigned ||
        String(assignedId || "") === String(myDentistId || "") ||
        (assignedEmail && assignedEmail.toLowerCase() === myDentistEmail);
      return dentistMatches && isDentistPatient;
    });

    latestQueue = myQueue;

    if (typeof window.renderDentistQueue === "function") {
      window.renderDentistQueue(myQueue);
    }

    // Only a patient moved by staff into treatment is an active clinical case.
    // Approved/checked-in patients remain available in the right-side queue.
    const activePatient = myQueue.find((app) => {
      const status = String(app.status || "").toLowerCase();
      return status === "in-treatment" || status === "treatment";
    });

    if (activePatient) {
      await hydrateActiveChairView(activePatient);
    } else {
      clearActiveChairView();
    }
  } catch (err) {
    console.error("Queue Synchronicity Fault:", err);
    renderQueueError(err.message || "Unable to load today's queue.");
    clearActiveChairView(); // Ensure it clears if fetch fails
  }
}

function renderQueueError(message) {
  ["queue-container", "right-queue-container"].forEach((id) => {
    const container = document.getElementById(id);
    if (container) {
      container.innerHTML = `<div class="p-4 text-center rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">${message}</div>`;
    }
  });
}

async function hydrateActiveChairView(patient) {
  activeSessionId = patient._id;

  // 1. EXTRACT PATIENT ID
  activePatientId =
    patient.patientId && typeof patient.patientId === "object"
      ? patient.patientId._id || patient.patientId.id
      : patient.patientId || patient.patient?._id;

  // 2. EXTRACT PROCEDURE NAME
  activeProcedureName =
    (Array.isArray(patient.services) && patient.services.length
      ? patient.services.join(" + ")
      : null) ||
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

  const statusLabel = String(patient.status || "").toLowerCase();
  const statusText =
    statusLabel === "checked-in" || statusLabel === "waiting"
      ? "Patient waiting in lobby"
      : statusLabel === "approved"
        ? "Appointment approved"
        : statusLabel === "pending"
          ? "Appointment pending clinic confirmation"
          : "Active treatment case";

  const procedureLabel = document.getElementById("active-procedure-container");
  if (procedureLabel) {
    procedureLabel.innerHTML = `${statusText}: <span class="text-slate-800 font-bold">${activeProcedureName}</span>`;
  }

  // 4. Fetch the intake. (Clinical history now loads on demand inside the
  //    Patient History modal via hydrateHistoryModal().)
  await fetchPatientIntake(activePatientId);
}
async function fetchPatientIntake(patientId) {
  const panel = document.getElementById("patient-intake-review");
  const content = document.getElementById("patient-intake-content");
  const status = document.getElementById("patient-intake-status");
  if (!panel || !content || !status || !patientId) return;

  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const clinicId = localStorage.getItem("clinicId") || userData.clinicId || "";
  const token = localStorage.getItem("token")?.replace(/["']+/g, "") || "";

  panel.classList.add("hidden");
  content.innerHTML =
    '<p class="text-xs text-slate-400">Loading patient intake...</p>';
  status.textContent = "Loading";

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/patients/profile/${patientId}`,
      {
        headers: { Authorization: `Bearer ${token}`, "x-clinic-id": clinicId },
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Unable to load intake");

    activePatientIntake = result.data;
    const profile = result.data.profile;
    const patient = result.data.patient || {};
    const completed = result.data.hasCompletedIntake;
    status.textContent = completed ? "Completed" : "Not completed";
    status.className = `text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${completed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`;
    document.getElementById("nav-intake-btn")?.classList.remove("hidden");

    const personal = profile?.personalInformation || {};
    const name = personal.name || {};
    const medical = profile?.medicalHistory || {};
    const questionnaire = medical.questionnaire || {};
    const allergies = medical.allergies || {};
    const conditions = profile?.medicalConditionsMatrix || {};
    const item = (label, value, wide = false) =>
      `<div class="${wide ? "sm:col-span-2 lg:col-span-3" : ""} bg-slate-50 border border-slate-100 rounded-xl p-3"><span class="block text-[9px] font-black uppercase tracking-wider text-slate-400">${label}</span><p class="mt-1 text-xs font-bold text-slate-700 whitespace-pre-wrap">${value || "Not provided"}</p></div>`;
    const yes = (value) =>
      value === true ? "Yes" : value === false ? "No" : "Not answered";
    const flagged = Object.entries(conditions)
      .filter(([, value]) => value === true)
      .map(([key]) => key.replace(/([A-Z])/g, " $1"));

    content.innerHTML = [
      item(
        "Patient",
        `${name.first || patient.firstName || ""} ${name.last || patient.lastName || ""}`.trim(),
      ),
      item(
        "Date of birth",
        personal.birthdate
          ? new Date(personal.birthdate).toLocaleDateString()
          : patient.dateOfBirth
            ? new Date(patient.dateOfBirth).toLocaleDateString()
            : "Not provided",
      ),
      item("Sex", personal.sex),
      item("Contact Number", personal.cellMobileNo || patient.phone),
      item("Reason for consultation", personal.reasonForConsultation, true),
      item("General health", yes(questionnaire.isInGoodHealth)),
      item(
        "Medical treatment",
        yes(questionnaire.isUnderMedicalTreatment?.status),
      ),
      item(
        "Medications",
        questionnaire.isTakingMedications?.medicationDetails ||
          yes(questionnaire.isTakingMedications?.status),
        true,
      ),
      item(
        "Allergies",
        Object.entries(allergies)
          .filter(([key, value]) => key !== "other" && value)
          .map(([key]) => key)
          .join(", ") || allergies.other,
        true,
      ),
      item("Conditions reported", flagged.join(", ") || "None reported", true),
      item("Blood pressure", medical.vitals?.bloodPressure),
      item(
        "Dental history",
        `${profile?.dentalHistory?.previousDentist || "No previous dentist listed"}; Last visit: ${profile?.dentalHistory?.lastDentalVisit || "Not provided"}`,
        true,
      ),
    ].join("");
  } catch (error) {
    activePatientIntake = null;
    status.textContent = "Unavailable";
    content.innerHTML = `<p class="text-xs text-rose-600">${error.message}</p>`;
  }
}

function openPatientIntakeModal() {
  const modal = document.getElementById("patient-intake-review");
  if (!modal || !activePatientId) return;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closePatientIntakeModal() {
  document.getElementById("patient-intake-review")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function bindPatientIntakeReview() {
  const intakeButton = document.getElementById("nav-intake-btn");
  intakeButton?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!activePatientId) {
      notify("Select an active patient before opening Patient Intake.", "warning");
      return;
    }
    openPatientIntakeModal();
  });
  document
    .getElementById("close-patient-intake")
    ?.addEventListener("click", closePatientIntakeModal);
  document
    .getElementById("patient-intake-review")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "patient-intake-review")
        closePatientIntakeModal();
    });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const intakeModal = document.getElementById("patient-intake-review");
    if (intakeModal && !intakeModal.classList.contains("hidden")) {
      closePatientIntakeModal();
    }
  });
}

// Maps a tooth number to its anatomical name
function getToothDescription(toothId) {
  const toothNum = parseInt(toothId);
  if (isNaN(toothNum)) return "Unknown Tooth";

  // Quadrant 1: Maxillary Right (Upper Right)
  if (toothNum >= 11 && toothNum <= 18)
    return `Maxillary Right (Upper) - Tooth ${toothNum}`;
  // Quadrant 2: Maxillary Left (Upper Left)
  if (toothNum >= 21 && toothNum <= 28)
    return `Maxillary Left (Upper) - Tooth ${toothNum}`;
  // Quadrant 3: Mandibular Left (Lower Left)
  if (toothNum >= 31 && toothNum <= 38)
    return `Mandibular Left (Lower) - Tooth ${toothNum}`;
  // Quadrant 4: Mandibular Right (Lower Right)
  if (toothNum >= 41 && toothNum <= 48)
    return `Mandibular Right (Lower) - Tooth ${toothNum}`;

  return `Tooth ${toothNum}`;
}
function clearActiveChairView() {
  activeSessionId = null;
  activePatientId = null;
  activePatientIntake = null;
  activeProcedureName = "General Consultation";
  document.getElementById("nav-intake-btn")?.classList.add("hidden");
  closePatientIntakeModal();

  const nameElement = document.getElementById("active-patient-name");
  if (nameElement) nameElement.textContent = "No Active Case";

  const procedureLabel = document.getElementById("active-procedure-container");
  if (procedureLabel) {
    procedureLabel.innerHTML = `Status: <span class="text-slate-400 font-bold">Idle Workspace</span>`;
  }

  // Clear the history panel
  const historyLabel = document.getElementById("history-active-patient");
  if (historyLabel) historyLabel.textContent = "";
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
      notify(
        "No patient is loaded in the active chair. Seat a patient first.",
        "error",
      );
      return;
    }

    const token = localStorage.getItem("token");
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    const clinicId =
      localStorage.getItem("clinicId") || userData.clinicId || "";
    const submitBtn = form.querySelector('button[type="submit"]');

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sealing Clinical Records... ⏳";

      // --- NEW STEP A: AUTO-INJECT TEETH DATA ---
      const selectedTeeth = window.getSelectedTeeth
        ? window.getSelectedTeeth()
        : [];
      if (selectedTeeth.length > 0) {
        // Map the IDs to their anatomical names using the function we made
        const teethDescriptions = selectedTeeth
          .map((id) => {
            return typeof getToothDescription === "function"
              ? getToothDescription(id)
              : `Tooth ${id}`;
          })
          .join(", ");

        // Grab the treatment text box
        const treatmentInput = document.getElementById("treatmentRendered");
        if (treatmentInput) {
          const originalText = treatmentInput.value.trim();
          // Inject the beautiful tooth string at the top of the text!
          treatmentInput.value = `[Targeted Areas: ${teethDescriptions}]\n${originalText}`;
        }
      }
      // ------------------------------------------

      // --- STEP B: POST TO CLINICAL NOTES USING SHARED MODULE ---
      const savedNote = await saveNewClinicalNote(
        activePatientId,
        activeSessionId,
      );

      if (!savedNote) {
        throw new Error("Failed to save clinical note to record history.");
      }

      // --- STEP C: UPDATE APPOINTMENT STATUS ---
      const noteText = document.getElementById("assessment").value;

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
            treatedTooth: selectedTeeth.length > 0 ? selectedTeeth[0] : null,
            billingAmount: 250.0,
          }),
        },
      );

      const statusData = await statusResponse.json();
      if (!statusResponse.ok)
        throw new Error(
          statusData.message || "Failed to finalize appointment status.",
        );

      notify("Procedure completed. Clinical note saved to medical history.", "success");

      // ✅ ADDED THIS HERE: Instantly clear all input fields in the form!
      if (typeof clearClinicalNoteForm === "function") {
        clearClinicalNoteForm();
      }

      // Clear the badges from the UI after successful save
      const badgeContainer = document.getElementById("selected-teeth-display");
      if (badgeContainer)
        badgeContainer.innerHTML =
          "No teeth selected yet. Click the Odontogram to assign teeth to this record.";

      await fetchClinicalQueue();
    } catch (err) {
      notify(`Update failed: ${err.message}`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Complete Procedure & Release Patient ✅";
    }
  });
}

if (typeof io !== "undefined") {
  const socketToken = getStoredSession().token;
  const socket = io(window.socketUrl(), {
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
  const rightQueueContainer = document.getElementById("right-queue-container");
  const rightQueueCount = document.getElementById("right-queue-count");

  const waitingPatients = queue.filter((app) => {
    const status = String(app.status || "").toLowerCase();
    return [
      "approved",
      "pending",
      "checked-in",
      "waiting",
      "in-treatment",
      "treatment",
    ].includes(status);
  });

  const countText = `${waitingPatients.length}`;
  if (queueCount) queueCount.textContent = countText;
  const rightQueueNumber = rightQueueCount?.querySelector("span:last-child");
  if (rightQueueNumber) rightQueueNumber.textContent = countText;

  const renderCards = (container) => {
    if (!container) return;

    if (waitingPatients.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-wider">
          No patients waiting
        </div>`;
      return;
    }

    container.innerHTML = "";

    waitingPatients.forEach((app, index) => {
      const isNext = index === 0;
      const status = String(app.status || "").toLowerCase();
      const statusLabel =
        status === "approved" ? "Approved" : status.replace("-", " ");

      let patientName = "Unknown Patient";
      if (app.patientId && typeof app.patientId === "object") {
        patientName =
          `${app.patientId.firstName || ""} ${app.patientId.lastName || ""}`.trim();
      } else {
        patientName = app.patientName || app.firstName || "Walk-In Patient";
      }

      const procedure = (Array.isArray(app.services) && app.services.length ? app.services.join(" + ") : null) || app.service || app.treatmentName || "Consultation";

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
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] text-slate-500 font-medium truncate">Procedure: <span class="text-slate-700">${procedure}</span></p>
          <span class="shrink-0 text-[9px] font-black uppercase text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">${statusLabel}</span>
        </div>
        <p class="text-[10px] text-slate-400">${app.date || "Today"}</p>
      `;

      container.appendChild(card);
    });
  };

  renderCards(queueContainer);
  renderCards(rightQueueContainer);
};
window.updateSelectedTeethUI = function () {
  const container = document.getElementById("selected-teeth-display");
  if (!container) return;

  // Grab the selected array (e.g., ["11", "12"])
  const selectedTeeth = window.getSelectedTeeth
    ? window.getSelectedTeeth()
    : [];

  if (selectedTeeth.length === 0) {
    container.innerHTML =
      "No teeth selected yet. Click the Odontogram to assign teeth to this record.";
    return;
  }

  // Generate HTML badges for each selected tooth
  container.innerHTML = selectedTeeth
    .map((toothId) => {
      const description = getToothDescription(toothId);
      return `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold shadow-sm">
        🦷 ${description}
      </span>
    `;
    })
    .join("");
};
// Watch for clicks on the page (specifically targeting the Odontogram)
document.addEventListener("click", (e) => {
  // Use a tiny 50ms delay to let teeth.js finish selecting the tooth first
  setTimeout(() => {
    if (typeof window.updateSelectedTeethUI === "function") {
      window.updateSelectedTeethUI();
    }

    if (typeof autoFillTreatmentRendered === "function") {
      autoFillTreatmentRendered();
    }
  }, 50);
});
// 🦷 Update Treatment Rendered Field
function autoFillTreatmentRendered() {
  const treatmentInput = document.getElementById("treatmentRendered");
  if (!treatmentInput) return;

  // Assuming you still have this function from your clinicalNote.js setup
  const selectedTeeth = window.getSelectedTeeth
    ? window.getSelectedTeeth()
    : [];

  if (selectedTeeth.length === 0) {
    treatmentInput.value = "";
    return;
  }

  // Format the teeth into a readable string
  const teethList = selectedTeeth.join(", ");

  // You can customize this template to match your preferred clinical format
  treatmentInput.value = `[Targeted Areas: Tooth ${teethList}] - `;
}
// 🧹 Clear all form fields
function clearClinicalNoteForm() {
  const fields = [
    "chiefComplaint",
    "assessment",
    "treatmentRendered",
    "progressNotes",
    "recommendations",
    "nextVisitDate",
  ];

  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  if (typeof window.clearSelectedTeeth === "function") {
    window.clearSelectedTeeth();
  }
}
document.addEventListener("click", (e) => {
  // Use a tiny 50ms delay to let teeth.js finish selecting the tooth first
  setTimeout(() => {
    if (typeof window.updateSelectedTeethUI === "function") {
      window.updateSelectedTeethUI();
    }

    if (typeof autoFillTreatmentRendered === "function") {
      autoFillTreatmentRendered();
    }
  }, 50);
});

function bindXrayReferral() {
  const openButton = document.getElementById("order-xray-btn");
  const modal = document.getElementById("xray-referral-modal");
  const form = document.getElementById("xray-referral-form");
  if (!openButton || !modal || !form) return;

  const getSessionUser = () => JSON.parse(localStorage.getItem("user") || "{}");
  const setValue = (id, value) => {
    const field = document.getElementById(id);
    if (field && value) {
      if ("value" in field) field.value = value;
      else field.textContent = value;
    }
  };
  const today = new Date().toISOString().slice(0, 10);

  const closeModal = () => {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  };

  openButton.addEventListener("click", () => {
    if (!activePatientId) {
      notify(
        "Start an active patient treatment before creating an X-ray referral.",
        "warning",
      );
      return;
    }

    const user = getSessionUser();
    const intake = activePatientIntake || {};
    const patientProfile = intake.patient || {};
    const personal = intake.profile?.personalInformation || {};
    const patientName = personal.name || {};
    const patientAddress = personal.homeAddress || personal.address || "";
    const dentistName =
      localStorage.getItem("staffName") ||
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      "Dentist";

    setValue(
      "xray-clinic-name",
      localStorage.getItem("clinicName") || user.clinicName || "Dental Clinic",
    );
    setValue("xray-referral-date", today);
    setValue("xray-dentist-name", dentistName);
    setValue(
      "xray-dentist-contact",
      user.phone ||
        localStorage.getItem("staffPhone") ||
        user.email ||
        localStorage.getItem("staffEmail") ||
        "Not provided",
    );
    setValue(
      "xray-dentist-license",
      user.licenseNumber ||
        localStorage.getItem("staffLicenseNumber") ||
        "Not provided",
    );
    setValue(
      "xray-patient-name",
      [patientName.firstName, patientName.lastName].filter(Boolean).join(" ") ||
        patientProfile.fullName ||
        document.getElementById("active-patient-name")?.textContent.trim() ||
        "Not provided",
    );
    setValue("xray-patient-id", activePatientId);
    setValue(
      "xray-patient-dob",
      personal.birthdate || patientProfile.dateOfBirth || "Not provided",
    );
    setValue(
      "xray-patient-sex",
      personal.sex || patientProfile.sex || "Not provided",
    );
    setValue(
      "xray-patient-contact",
      personal.cellMobileNo || patientProfile.phone || "Not provided",
    );
    setValue(
      "xray-patient-email",
      personal.emailAddress || patientProfile.email || "Not provided",
    );
    setValue("xray-patient-address", patientAddress || "Not provided");
    const selectedTeeth = window.getSelectedTeeth
      ? window.getSelectedTeeth()
      : [];
    if (selectedTeeth.length)
      setValue(
        "xray-area",
        selectedTeeth.map((tooth) => `Tooth ${tooth}`).join(", "),
      );
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    document.getElementById("xray-type")?.focus();
  });

  document
    .getElementById("close-xray-modal")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-xray-referral")
    ?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  const readReferralValues = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll("input, select, textarea, [id]").forEach((field) => {
      if (!field.id) return;
      values[field.id] =
        "value" in field ? field.value.trim() : field.textContent.trim();
    });
    return values;
  };

  document
    .getElementById("download-xray-pdf")
    ?.addEventListener("click", () => {
      if (!form.reportValidity()) return;
      const values = readReferralValues();
      downloadReferralPdf(values);
    });
}

function downloadReferralPdf(values) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) {
    notify(
      "PDF download is unavailable. Please refresh the page and try again.",
      "error",
    );
    return;
  }

  // A5 keeps the referral compact while preserving a professional, readable layout.
  const pdf = new JsPdf({ unit: "mm", format: "a5", orientation: "portrait" });
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = 12;
  const field = (id, fallback = "Not provided") =>
    String(values[id] || fallback).trim();

  const ensureSpace = (height = 12) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const addSection = (title) => {
    ensureSpace(9);
    pdf.setFillColor(240, 249, 255);
    pdf.roundedRect(margin, y - 3.5, contentWidth, 7, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(3, 105, 161);
    pdf.text(title.toUpperCase(), margin + 3, y + 1);
    y += 8;
  };

  const addField = (
    label,
    value,
    fallback = "____________________",
    size = 10,
  ) => {
    ensureSpace(9);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), margin, y);
    y += 3.2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size - 1);
    pdf.setTextColor(15, 23, 42);
    const lines = pdf.splitTextToSize(value || "Not provided", contentWidth);
    pdf.text(lines, margin, y);
    y += Math.max(4.5, lines.length * 3.6) + 2;
  };

  const addCallout = (label, value) => {
    ensureSpace(18);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(margin, y - 3, contentWidth, 15, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), margin + 3, y + 1);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 118, 110);
    pdf.text(value, margin + 3, y + 8);
    y += 19;
  };

  pdf.setFillColor(15, 118, 110);
  pdf.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  pdf.text(field("xray-clinic-name", "Dental Clinic"), margin + 5, y + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("DIAGNOSTIC IMAGING REFERRAL", margin + 5, y + 14);
  pdf.setFontSize(7);
  pdf.text(
    `Referral date: ${field("xray-referral-date")}`,
    pageWidth - margin - 45,
    y + 8,
  );
  pdf.text(
    `Priority: ${field("xray-urgency")}`,
    pageWidth - margin - 45,
    y + 14,
  );
  y += 29;

  addSection("Patient identification");
  addField("Patient name", field("xray-patient-name"), "", 10);

  addSection("Examination requested");
  addCallout("Requested imaging", field("xray-type"));
  addField("Tooth / region", field("xray-area"), "", 10);

  addSection("Clinical indication");
  addField("Diagnostic question", field("xray-indication"), "", 10);
  addField("Relevant findings / history", field("xray-history"), "", 9);
  addField("Special instructions", field("xray-notes"), "", 9);

  addSection("Referring clinician");
  addField("Dentist", field("xray-dentist-name"), "", 10);
  addField("Contact", field("xray-dentist-contact"), "", 9);
  addField("Professional license", field("xray-dentist-license"), "", 9);
  ensureSpace(22);
  pdf.setDrawColor(51, 65, 85);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y + 8, margin + 55, y + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  pdf.text("Referring dentist signature", margin, y + 12);
  pdf.text(
    "Please attach relevant prior images or reports when available.",
    margin,
    y + 19,
  );

  const safeName = field("xray-patient-name", "patient")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  pdf.save(`dental-xray-referral-${safeName || "patient"}.pdf`);
}

function escapeReferralText(value = "") {
  const text = String(value);
  return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

// ============================================================
// 💊 PATIENT PRESCRIPTION (RESeta)
// ============================================================

// ============================================================
// 💊 PATIENT PRESCRIPTION (RESeta)
// ============================================================
let rxHistoryCache = [];

function rxSession() {
  const { token, userData, clinicId, staffId } = getStoredSession();
  return { token, userData, clinicId, dentistId: staffId };
}

function bindPrescription() {
  document.getElementById("write-rx-btn")?.addEventListener("click", openRxModal);
  document.getElementById("close-rx-modal")?.addEventListener("click", closeRxModal);
  document.getElementById("cancel-rx")?.addEventListener("click", closeRxModal);
  document.getElementById("rx-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "rx-modal") closeRxModal();
  });
  document.getElementById("rx-add-med")?.addEventListener("click", () => addMedRow());
  document.getElementById("rx-form")?.addEventListener("submit", submitRxForm);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("rx-modal");
    if (modal && !modal.classList.contains("hidden")) closeRxModal();
  });
  // Delegated actions inside the issued-prescriptions list
  document.getElementById("rx-history-list")?.addEventListener("click", async (e) => {
    const dlBtn = e.target.closest("[data-rx-pdf]");
    const cxBtn = e.target.closest("[data-rx-cancel]");
    if (dlBtn) {
      const rx = rxHistoryCache.find((r) => String(r._id) === dlBtn.dataset.rxPdf);
      if (rx) downloadRxPdf(rx);
    } else if (cxBtn) {
      await cancelRx(cxBtn.dataset.rxCancel);
    }
  });
}

function openRxModal() {
  if (!activePatientId) {
    notify("Load a patient into the chair before writing a prescription.", "warning");
    return;
  }
  const modal = document.getElementById("rx-modal");
  if (!modal) return;
  const name = document.getElementById("active-patient-name")?.textContent?.trim() || "Active patient";
  document.getElementById("rx-patient-name").textContent = name;
  document.getElementById("rx-diagnosis").value = "";
  document.getElementById("rx-advice").value = "";
  document.getElementById("rx-meds").innerHTML = "";
  addMedRow();
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  loadRxHistory();
}

function closeRxModal() {
  document.getElementById("rx-modal")?.classList.add("hidden");
  const anyOpen = ["queue-modal", "history-modal", "patient-intake-review", "xray-referral-modal"].some(
    (mid) => !document.getElementById(mid)?.classList.contains("hidden"),
  );
  if (!anyOpen) document.body.classList.remove("overflow-hidden");
}

function addMedRow(prefill = {}) {
  const wrap = document.getElementById("rx-meds");
  if (!wrap) return;
  const row = document.createElement("div");
  row.className = "rx-med-row grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3";
  const val = (k) => String(prefill[k] || "").replace(/"/g, "&quot;");
  row.innerHTML = `
    <input data-m="name" class="referral-input sm:col-span-2" placeholder="Medicine name *" value="${val("name")}" />
    <input data-m="dosage" class="referral-input" placeholder="Dosage (e.g. 500mg)" value="${val("dosage")}" />
    <input data-m="frequency" class="referral-input" placeholder="Frequency (e.g. 3x a day)" value="${val("frequency")}" />
    <input data-m="duration" class="referral-input" placeholder="Duration (e.g. 7 days)" value="${val("duration")}" />
    <div class="flex gap-2">
      <input data-m="quantity" class="referral-input" placeholder="Qty (e.g. 21 caps)" value="${val("quantity")}" />
      <button type="button" class="rx-remove shrink-0 w-10 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 font-black cursor-pointer" title="Remove">×</button>
    </div>
    <input data-m="instructions" class="referral-input sm:col-span-3" placeholder="Instructions (e.g. Take after meals)" value="${val("instructions")}" />`;
  row.querySelector(".rx-remove").addEventListener("click", () => {
    if (wrap.children.length > 1) row.remove();
    else notify("At least one medicine row is required.", "warning");
  });
  wrap.appendChild(row);
}

function collectMeds() {
  const meds = [];
  document.querySelectorAll("#rx-meds .rx-med-row").forEach((row) => {
    const get = (k) => row.querySelector(`[data-m="${k}"]`)?.value.trim() || "";
    const name = get("name");
    if (!name) return;
    meds.push({ name, dosage: get("dosage"), frequency: get("frequency"), duration: get("duration"), quantity: get("quantity"), instructions: get("instructions") });
  });
  return meds;
}

async function submitRxForm(e) {
  e.preventDefault();
  const { token, clinicId, dentistId } = rxSession();
  const meds = collectMeds();
  if (!meds.length) {
    notify("Add at least one medicine with a name.", "error");
    return;
  }
  const patientName = document.getElementById("active-patient-name")?.textContent?.trim() || "";
  const btn = document.getElementById("save-rx-btn");
  try {
    btn.disabled = true;
    btn.textContent = "Saving... ⏳";
    const res = await fetch(window.apiUrl("/api/v1/prescriptions"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-clinic-id": clinicId },
      body: JSON.stringify({
        clinicId, dentistId, patientId: activePatientId, patientName,
        appointmentId: activeSessionId,
        diagnosis: document.getElementById("rx-diagnosis").value.trim(),
        medications: meds,
        advice: document.getElementById("rx-advice").value.trim(),
      }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.message || "Failed to save prescription.");
    notify("Prescription saved to patient record. 💊", "success");
    document.getElementById("rx-diagnosis").value = "";
    document.getElementById("rx-advice").value = "";
    document.getElementById("rx-meds").innerHTML = "";
    addMedRow();
    await loadRxHistory();
  } catch (err) {
    notify(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Prescription 💊";
  }
}

async function loadRxHistory() {
  const list = document.getElementById("rx-history-list");
  if (!list || !activePatientId) return;
  const { token, clinicId } = rxSession();
  list.innerHTML = `<p class="text-xs text-slate-400">Loading...</p>`;
  try {
    const res = await fetch(window.apiUrl(`/api/v1/prescriptions/patient/${activePatientId}`), {
      headers: { Authorization: `Bearer ${token}`, "x-clinic-id": clinicId },
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.message || "Failed to load prescriptions.");
    rxHistoryCache = out.data || [];
    if (!rxHistoryCache.length) {
      list.innerHTML = `<p class="text-xs text-slate-400 italic">No prescriptions issued yet for this patient.</p>`;
      return;
    }
    list.innerHTML = "";
    rxHistoryCache.forEach((rx) => {
      const meds = (rx.medications || []).map((m) => m.name).filter(Boolean).join(", ");
      const date = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
      const cancelled = rx.status === "Cancelled";
      const item = document.createElement("div");
      item.className = `flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${cancelled ? "border-slate-200 bg-slate-50 opacity-70" : "border-teal-200 bg-teal-50/50"}`;
      item.innerHTML = `
        <div class="flex-1 min-w-[180px]">
          <p class="text-xs font-bold text-slate-800">${meds || "Prescription"} ${cancelled ? '<span class="text-rose-500">(Cancelled)</span>' : ""}</p>
          <p class="text-[10px] text-slate-400">${date}${rx.diagnosis ? " · " + rx.diagnosis : ""}</p>
        </div>
        <button type="button" data-rx-pdf="${rx._id}" class="text-[11px] font-bold text-sky-700 bg-white border border-sky-200 px-3 py-1.5 rounded-lg hover:bg-sky-50 cursor-pointer">PDF ⬇</button>
        ${cancelled ? "" : `<button type="button" data-rx-cancel="${rx._id}" class="text-[11px] font-bold text-rose-600 bg-white border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 cursor-pointer">Cancel</button>`}`;
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="text-xs text-rose-600">${err.message}</p>`;
  }
}

async function cancelRx(id) {
  const { token, clinicId } = rxSession();
  try {
    const res = await fetch(window.apiUrl(`/api/v1/prescriptions/${id}/cancel`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-clinic-id": clinicId },
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.message || "Failed to cancel.");
    notify("Prescription cancelled.", "success");
    await loadRxHistory();
  } catch (err) {
    notify(err.message, "error");
  }
}

function downloadRxPdf(rx) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) {
    notify("PDF download is unavailable. Please refresh the page and try again.", "error");
    return;
  }
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const clinicName = localStorage.getItem("clinicName") || user.clinicName || "Dental Clinic";
  const dentistName = localStorage.getItem("staffName") || `${user.firstName || ""} ${user.lastName || ""}`.trim() || rx.dentistId?.fullName || "Dentist";
  const license = user.licenseNumber || localStorage.getItem("staffLicenseNumber") || "Not provided";
  const patientName = rx.patientName || document.getElementById("active-patient-name")?.textContent?.trim() || "Patient";
  const dateStr = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : new Date().toLocaleDateString();

  const pdf = new JsPdf({ unit: "mm", format: "a5", orientation: "portrait" });
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = 12;
  const ensureSpace = (h = 12) => { if (y + h > pageHeight - margin) { pdf.addPage(); y = margin; } };

  pdf.setFillColor(13, 148, 136);
  pdf.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(255, 255, 255);
  pdf.text(clinicName, margin + 5, y + 8);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
  pdf.text("MEDICAL PRESCRIPTION", margin + 5, y + 14);
  pdf.setFontSize(7);
  pdf.text(`Date: ${dateStr}`, pageWidth - margin - 42, y + 10);
  y += 29;

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(13, 148, 136);
  pdf.text("PATIENT", margin, y); y += 5;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42);
  pdf.text(patientName, margin, y); y += 8;

  if (rx.diagnosis) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(13, 148, 136);
    pdf.text("DIAGNOSIS", margin, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42);
    const dl = pdf.splitTextToSize(rx.diagnosis, contentWidth);
    pdf.text(dl, margin, y); y += dl.length * 4.5 + 4;
  }

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(13, 148, 136);
  pdf.text("Rx", margin, y); y += 6;
  (rx.medications || []).forEach((m, i) => {
    ensureSpace(20);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42);
    pdf.text(`${i + 1}. ${m.name || ""}${m.dosage ? " " + m.dosage : ""}`, margin + 2, y); y += 4.5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(71, 85, 105);
    const parts = [m.frequency, m.duration && `for ${m.duration}`, m.quantity && `Qty: ${m.quantity}`].filter(Boolean).join(" · ");
    if (parts) { pdf.text(parts, margin + 6, y); y += 4; }
    if (m.instructions) {
      const il = pdf.splitTextToSize(`Sig: ${m.instructions}`, contentWidth - 6);
      pdf.text(il, margin + 6, y); y += il.length * 3.6 + 2;
    }
    y += 2;
  });

  if (rx.advice) {
    ensureSpace(14);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(13, 148, 136);
    pdf.text("ADVICE", margin, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42);
    const al = pdf.splitTextToSize(rx.advice, contentWidth);
    pdf.text(al, margin, y); y += al.length * 4 + 6;
  }

  ensureSpace(26);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42);
  pdf.text(dentistName.startsWith("Dr") ? dentistName : `Dr. ${dentistName}`, margin, y); y += 4;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139);
  pdf.text(`License: ${license}`, margin, y); y += 8;
  pdf.setDrawColor(51, 65, 85); pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + 55, y);
  pdf.text("Dentist signature", margin, y + 4);

  const safeName = patientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  pdf.save(`prescription-${safeName || "patient"}.pdf`);
}

function buildXrayReferral(values) {
  const field = (id) => escapeReferralText(values[id] || "Not provided");
  const date = field("xray-referral-date");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dental X-ray Referral - ${field("xray-patient-name")}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;line-height:1.45;font-size:13px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:14px}.clinic{font-size:23px;font-weight:800;color:#0f172a}.tag{color:#0f766e;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase}.meta{text-align:right;color:#475569;font-size:11px}.section{margin-top:20px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden}.section h2{background:#f1f5f9;border-bottom:1px solid #cbd5e1;font-size:11px;letter-spacing:1px;margin:0;padding:8px 10px;text-transform:uppercase}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}.label{color:#64748b;font-size:10px;font-weight:bold;text-transform:uppercase}.value{margin-top:2px;white-space:pre-wrap;min-height:18px}.request{padding:12px}.request strong{font-size:17px;color:#0f766e}.signature{margin-top:55px;width:260px;border-top:1px solid #334155;padding-top:7px;font-size:11px}@media print{body{font-size:12px}.section{break-inside:avoid}}</style></head><body><header class="header"><div><div class="tag">Diagnostic imaging referral</div><div class="clinic">${field("xray-clinic-name")}</div><div>Referral from dental clinic</div></div><div class="meta"><strong>Referral date</strong><br>${date}<br><br><strong>Priority</strong><br>${field("xray-urgency")}</div></header><section class="section"><h2>Patient details</h2><div class="grid"><div><div class="label">Patient name</div><div class="value">${field("xray-patient-name")}</div></div><div><div class="label">Patient ID</div><div class="value">${field("xray-patient-id")}</div></div></div></section><section class="section"><h2>Examination requested</h2><div class="request"><strong>${field("xray-type")}</strong><br><span class="label">Tooth / area</span><div class="value">${field("xray-area")}</div></div></section><section class="section"><h2>Clinical information</h2><div class="grid"><div style="grid-column:1/-1"><div class="label">Clinical indication / question</div><div class="value">${field("xray-indication")}</div></div><div style="grid-column:1/-1"><div class="label">Relevant findings / history</div><div class="value">${field("xray-history")}</div></div><div style="grid-column:1/-1"><div class="label">Additional instructions</div><div class="value">${field("xray-notes")}</div></div></div></section><div class="signature">Referring dentist<br><strong>Dr. ${field("xray-dentist-name")}</strong></div></body></html>`;
}
