const API_BASE_URL = "http://localhost:5000"; // TODO: move to env var before deploying

// ==========================================
// 1. HELPER: Get Security Headers
// ==========================================
function getAuthHeaders() {
  const rawToken = localStorage.getItem("token");
  const token = rawToken ? rawToken.replace(/['"]+/g, "") : "";
  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const clinicId = localStorage.getItem("clinicId") || userData.clinicId || "";

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-clinic-id": clinicId,
  };
}

// Helper: Safely extract dentist name from populated object or fallback
function getDentistName(dentistId) {
  if (!dentistId || typeof dentistId !== "object") {
    return "Clinical Provider";
  }

  if (dentistId.firstName || dentistId.lastName) {
    const name =
      `${dentistId.firstName || ""} ${dentistId.lastName || ""}`.trim();
    return name.toLowerCase().startsWith("dr.") ? name : `Dr. ${name}`;
  }

  if (dentistId.name) {
    return dentistId.name.toLowerCase().startsWith("dr.")
      ? dentistId.name
      : `Dr. ${dentistId.name}`;
  }

  return "Clinical Provider";
}

function getSpecialization(dentistId) {
  return dentistId && typeof dentistId === "object" && dentistId.specialization
    ? dentistId.specialization
    : "General Dentistry";
}

export async function fetchPatientHistory(patientId = null) {
  const token = localStorage.getItem("token")?.replace(/['"]+/g, "");
  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const clinicId = localStorage.getItem("clinicId") || userData.clinicId || "";
  const rawRole = localStorage.getItem("userRole") || userData.role || "";
  const userRole = rawRole.toUpperCase();

  let endpoint = "";

  // 1. PATIENTS: Always use /my-notes
  if (userRole === "PATIENT" || !patientId) {
    endpoint = "http://localhost:5000/api/v1/clinical-notes/my-notes";
  }
  // 2. DENTISTS / STAFF / ADMIN: Use /patient/:patientId
  else {
    // Prevent 404 by validating the patientId before making the request
    if (!patientId || patientId === "undefined" || patientId === "null") {
      console.warn("⚠️ Patient ID missing or invalid. Skipping fetch.");
      return [];
    }
    endpoint = `http://localhost:5000/api/v1/clinical-notes/patient/${patientId}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-clinic-id": clinicId,
      },
    });

    if (!response.ok) {
      console.error(
        `HTTP Error ${response.status} when fetching clinical history from ${endpoint}`,
      );
      return [];
    }

    const data = await response.json();
    // Handles various response structures (array or wrapped object)
    return (
      data.notes ||
      data.data ||
      data.clinicalNotes ||
      (Array.isArray(data) ? data : [])
    );
  } catch (error) {
    console.error("Failed to fetch patient clinical history:", error);
    return [];
  }
}
// 🎨 RENDER CLINICAL RECORDS UI
export function renderPatientHistoryUI(
  notes,
  containerId = "my-history-container",
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!notes || notes.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white space-y-2">
        <span class="text-3xl">🗂️</span>
        <h3 class="text-xs font-bold text-slate-600 uppercase tracking-wider">No Clinical Records Found</h3>
        <p class="text-xs text-slate-400">You do not have any past clinical notes or treatments on file yet.</p>
      </div>`;
    return;
  }

  container.innerHTML = notes
    .map((note) => {
      // 1. Entry Date
      const dateObj = new Date(note.createdAt);
      const formattedDate = !isNaN(dateObj.getTime())
        ? dateObj
            .toLocaleDateString("en-US", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })
            .toUpperCase()
        : "N/A";

      // 2. Doctor / Provider Info
      const dentistObj =
        typeof note.dentistId === "object" && note.dentistId !== null
          ? note.dentistId
          : null;
      const dentistName = dentistObj
        ? `Dr. ${dentistObj.firstName || ""} ${dentistObj.lastName || ""}`.trim()
        : "Clinical Provider";
      const specialization = dentistObj?.specialization || "General Dentistry";

      // 3. Treated Teeth (Supports `treatedTeeth` array [24, 38] or `teeth`)
      const rawTeeth = note.treatedTeeth || note.teeth || [];
      const teethBadges =
        Array.isArray(rawTeeth) && rawTeeth.length > 0
          ? rawTeeth
              .map((t) => {
                const toothNum =
                  typeof t === "object" ? t.toothNumber || t.id : t;
                return `<span class="inline-flex items-center gap-1.5 bg-white border border-teal-200 text-teal-700 text-xs font-bold px-3 py-1 rounded-lg shadow-2xs">🦷 Tooth ${toothNum}</span>`;
              })
              .join(" ")
          : null;

      // 4. Next Visit / Follow-Up Date Parsing
      const rawNextVisit =
        note.nextVisitDate || note.nextVisit || note.followUpDate;
      let formattedNextVisit = null;
      if (rawNextVisit) {
        const nvDate = new Date(rawNextVisit);
        if (!isNaN(nvDate.getTime())) {
          formattedNextVisit = nvDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          });
        }
      }

      return `
      <div class="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4 mb-4">

        <!-- Card Header -->
        <div class="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            <span class="text-[10px] font-black text-teal-600 bg-teal-50 border border-teal-200/60 px-2.5 py-1 rounded-md uppercase tracking-wider">
              ${formattedDate}
            </span>
            <h4 class="text-sm font-black text-slate-800 mt-2">Clinical Treatment Entry</h4>
          </div>
          <div class="text-right">
            <p class="text-xs font-bold text-slate-800">${dentistName}</p>
            <p class="text-[10px] font-semibold text-slate-400">${specialization}</p>
          </div>
        </div>

        <!-- Treated Teeth Box -->
        ${
          teethBadges
            ? `
        <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">TREATED TEETH</span>
          <div class="flex flex-wrap gap-2">${teethBadges}</div>
        </div>`
            : ""
        }

        <!-- Medical Details Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">CHIEF COMPLAINT</span>
            <p class="text-xs font-medium text-slate-700">${note.chiefComplaint || "N/A"}</p>
          </div>

          <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">TREATMENT RENDERED</span>
            <p class="text-xs font-medium text-slate-700">${note.treatmentRendered || "N/A"}</p>
          </div>

          ${
            note.assessment
              ? `
          <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">ASSESSMENT / DIAGNOSIS</span>
            <p class="text-xs font-medium text-slate-700">${note.assessment}</p>
          </div>`
              : ""
          }

          ${
            note.progressNotes
              ? `
          <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">PROGRESS NOTES</span>
            <p class="text-xs font-medium text-slate-700">${note.progressNotes}</p>
          </div>`
              : ""
          }
        </div>

        <!-- Doctor Recommendations -->
        ${
          note.recommendations
            ? `
        <div class="bg-sky-50/70 p-3.5 rounded-xl border border-sky-100/80">
          <span class="block text-[10px] font-black text-sky-600 uppercase tracking-wider mb-1">DOCTOR'S RECOMMENDATIONS</span>
          <p class="text-xs font-medium text-sky-900 italic">${note.recommendations}</p>
        </div>`
            : ""
        }

        <!-- Recommended Next Visit Date Banner -->
        ${
          formattedNextVisit
            ? `
        <div class="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200/80 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="text-lg">📅</span>
            <div>
              <span class="block text-[10px] font-black text-emerald-700 uppercase tracking-wider">RECOMMENDED FOLLOW-UP VISIT</span>
              <p class="text-xs font-extrabold text-emerald-950">${formattedNextVisit}</p>
            </div>
          </div>
          <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-md uppercase tracking-wider">Scheduled</span>
        </div>`
            : ""
        }

      </div>
      `;
    })
    .join("");
}

// ==========================================
// 4. POST: Save New Clinical Note
// ==========================================
export async function saveNewClinicalNote(patientId, appointmentId) {
  const selectedTeeth = window.getSelectedTeeth
    ? window.getSelectedTeeth()
    : [];

  // Safely grab and trim inputs from HTML
  const getValue = (id) => document.getElementById(id)?.value?.trim() || "";

  const chiefComplaint = getValue("chiefComplaint");
  const assessment = getValue("assessment");
  const treatmentRendered = getValue("treatmentRendered");
  const progressNotes = getValue("progressNotes");
  const recommendations = getValue("recommendations");

  // ✅ ADD THIS: Grab the next visit date from the form
  const nextVisitDate = getValue("nextVisitDate");

  // 🛑 Client-side validation: Catch missing fields BEFORE hitting the backend
  const missingFields = [];
  if (!patientId) missingFields.push("Active Patient Context");
  if (!chiefComplaint) missingFields.push("Chief Complaint");
  if (!assessment) missingFields.push("Assessment");
  if (!treatmentRendered) missingFields.push("Treatment Rendered");

  if (missingFields.length > 0) {
    throw new Error(
      `Please fill in all required fields: ${missingFields.join(", ")}`,
    );
  }

  const notePayload = {
    patientId: patientId,
    appointmentId: appointmentId,
    chiefComplaint,
    assessment,
    treatmentRendered,
    progressNotes,
    recommendations,
    treatedTeeth: selectedTeeth,
    // ✅ ADD THIS: Send it to the backend
    nextVisitDate: nextVisitDate || null,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/clinical-notes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(notePayload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save clinical note.");
    }

    return data.data;
  } catch (error) {
    console.error("Error saving clinical note:", error);
    throw error;
  }
}
