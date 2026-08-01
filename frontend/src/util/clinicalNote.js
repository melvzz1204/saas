const API_BASE_URL = "http://localhost:5000";

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

  // Handle firstName / lastName schema
  if (dentistId.firstName || dentistId.lastName) {
    const name =
      `${dentistId.firstName || ""} ${dentistId.lastName || ""}`.trim();
    return name.toLowerCase().startsWith("dr.") ? name : `Dr. ${name}`;
  }

  // Handle single 'name' field schema
  if (dentistId.name) {
    return dentistId.name.toLowerCase().startsWith("dr.")
      ? dentistId.name
      : `Dr. ${dentistId.name}`;
  }

  return "Clinical Provider";
}

// Helper: Safely extract specialization
function getSpecialization(dentistId) {
  return typeof dentistId === "object" && dentistId?.specialization
    ? dentistId.specialization
    : "General Dentistry";
}

// ==========================================
// 2. FETCH: Get History for a Specific Patient
// ==========================================
export async function fetchPatientHistory(patientId) {
  if (!patientId) {
    console.warn("Cannot fetch notes: No patient ID provided.");
    return [];
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/clinical-notes/patient/${patientId}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to fetch clinical notes.");
    }

    return data.data || [];
  } catch (error) {
    console.error("Error fetching patient history:", error);
    return [];
  }
}

// ==========================================
// 3. RENDER: Inject Notes into the UI
// ==========================================
export function renderPatientHistoryUI(notes, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with ID '${containerId}' not found in the DOM.`);
    return;
  }

  // Handle empty state
  if (!notes || notes.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
        <span class="text-2xl mb-2">📂</span>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">No Clinical History</p>
        <p class="text-[10px] text-slate-400 mt-1">This patient has no previous records.</p>
      </div>`;
    return;
  }

  // Map the notes into HTML cards (matching your schema fields)
  container.innerHTML = notes
    .map((note) => {
      // Format the date neatly
      const dateObj = new Date(note.createdAt);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      // Safely extract dentist details using helpers
      const dentistName = getDentistName(note.dentistId);
      const specialization = getSpecialization(note.dentistId);

      // Format next visit date if present
      const formattedNextVisit = note.nextVisitDate
        ? new Date(note.nextVisitDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null;

      return `
      <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-xs mb-3 hover:border-sky-300 transition-colors">

        <!-- Header -->
        <div class="flex justify-between items-start border-b border-slate-100 pb-2 mb-3">
          <div>
            <span class="text-xs font-black text-slate-800 tracking-tight">${formattedDate}</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md inline-block">
              ${dentistName}
            </span>
            <span class="block text-[9px] font-semibold text-slate-400 mt-0.5">${specialization}</span>
          </div>
        </div>

        <!-- Clinical Details -->
        <div class="space-y-2 text-xs">
          <div>
            <span class="font-black text-slate-400 uppercase text-[9px] tracking-wider block mb-0.5">Chief Complaint</span>
            <span class="text-slate-700 font-medium">${note.chiefComplaint || "N/A"}</span>
          </div>

          <div>
            <span class="font-black text-slate-400 uppercase text-[9px] tracking-wider block mb-0.5">Assessment</span>
            <span class="text-slate-700 font-medium">${note.assessment || "N/A"}</span>
          </div>

          <div>
            <span class="font-black text-slate-400 uppercase text-[9px] tracking-wider block mb-0.5">Treatment Rendered</span>
            <span class="text-slate-700 font-medium">${note.treatmentRendered || "N/A"}</span>
          </div>

          ${
            note.progressNotes
              ? `
            <div>
              <span class="font-black text-slate-400 uppercase text-[9px] tracking-wider block mb-0.5">Progress Notes</span>
              <span class="text-slate-700 font-medium">${note.progressNotes}</span>
            </div>
          `
              : ""
          }

          ${
            note.recommendations
              ? `
            <div class="bg-slate-50 p-2 rounded-lg mt-2 border border-slate-100">
              <span class="font-black text-slate-500 uppercase text-[9px] tracking-wider block mb-0.5">Recommendations</span>
              <span class="text-slate-600 italic text-[11px]">${note.recommendations}</span>
            </div>
          `
              : ""
          }

          ${
            formattedNextVisit
              ? `
            <div class="bg-teal-50/60 text-teal-800 p-2 rounded-lg mt-2 border border-teal-100 text-[11px] font-semibold flex items-center gap-1.5">
              <span>📅</span>
              <span>Next Recommended Visit: ${formattedNextVisit}</span>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
    })
    .join("");
}
