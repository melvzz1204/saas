// adminDashboard.js

// 🛡️ SECURITY GUARD: Block unauthenticated traffic instantly
const token = localStorage.getItem("token");
const userData = JSON.parse(localStorage.getItem("user") || "null");

// 🎯 FIX 1: Expand authorization matrix to accept all allowed personnel tiers
const authorizedPersonnel = [
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "CLINIC_STAFF",
  "DENTIST",
];

if (!token || !userData || !authorizedPersonnel.includes(userData.role)) {
  console.warn("🛡️ Security Access Violation: Evicting unauthenticated user.");
  alert("Unauthorized workspace access. Please sign in.");
  localStorage.clear();
  window.location.href = "/clinicLogin.html";
}

// 🏢 EXTRACTION: Capture tenant identifier context strings safely
const clinicId = userData.clinicId;

document.addEventListener("DOMContentLoaded", () => {
  const viewLiveSiteBtn = document.getElementById("viewLiveSiteBtn");

  if (viewLiveSiteBtn) {
    viewLiveSiteBtn.addEventListener("click", () => {
      // 🎯 FIX 2: Harvest the readable workspace slug string instead of the raw database object ID
      const cachedSlug = localStorage.getItem("activeClinicSlug");

      if (!cachedSlug) {
        alert(
          "Sync Error: Clinic route context is initializing. Please wait a moment and try again.",
        );
        return;
      }

      console.log(
        `🔗 Redirecting to live patient terminal matching route slug: ${cachedSlug}`,
      );
      window.open(`/patientLogin.html?clinic=${cachedSlug}`, "_blank");
    });
  }
});

// Initialize Dashboard Components on Window Load
document.addEventListener("DOMContentLoaded", () => {
  const displayEmailEl = document.getElementById("display-user-email");
  if (displayEmailEl) displayEmailEl.textContent = userData.email;

  fetchClinicMetadata();
  fetchDashboardData();

  // Attach Event Listeners safely with optional chain verification guards
  const refreshBtn = document.getElementById("refresh-appointments");
  if (refreshBtn) refreshBtn.addEventListener("click", fetchDashboardData);

  const staffForm = document.getElementById("add-staff-form");
  if (staffForm) staffForm.addEventListener("submit", handleStaffOnboarding);

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
});

// Fetch Tenant Profile Metadata Name
async function fetchClinicMetadata() {
  if (!clinicId) return;
  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/tenants/${clinicId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const resData = await response.json();
    if (resData.success && resData.data) {
      const nameDisplayEl = document.getElementById("display-clinic-name");
      if (nameDisplayEl) nameDisplayEl.textContent = resData.data.name;

      // Cache the lookup slug inside local memory so our live button path generator reads it
      if (resData.data.slug) {
        localStorage.setItem("activeClinicSlug", resData.data.slug);
      }
    }
  } catch (err) {
    console.error("Failed to sync clinic profile strings:", err);
  }
}

// Fetch Appointments and Staff Count simultaneously
async function fetchDashboardData() {
  if (!clinicId) return;
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "x-clinic-id": clinicId, // Passes tenant context to the backend controller
    };

    // Parallel processing network requests
    const [apptRes, staffRes] = await Promise.all([
      fetch("http://localhost:5000/api/v1/admin/appointments", { headers }),
      fetch("http://localhost:5000/api/v1/admin/staff", { headers }),
    ]);

    const appts = await apptRes.json();
    const staff = await staffRes.json();

    if (appts.success) renderAppointmentsTable(appts.data);

    const kpiStaffEl = document.getElementById("kpi-total-staff");
    if (staff.success && kpiStaffEl) {
      kpiStaffEl.textContent = staff.data.length;
    }
  } catch (err) {
    console.error("Workspace data synch failure:", err);
  }
}

// Replace this function inside your adminDashboard.js file

function renderAppointmentsTable(appointments) {
  const tableBody = document.getElementById("appointment-table-body");
  if (!tableBody) return;

  // Debugging log: Open your browser console (F12) to see exactly what fields your backend is sending!
  console.log("📥 Raw Appointments Array received from Server:", appointments);

  // Update Core Metrics Cards
  const totalApptsEl = document.getElementById("kpi-total-appointments");
  const pendingApptsEl = document.getElementById("kpi-pending-appointments");

  if (totalApptsEl) totalApptsEl.textContent = appointments.length;

  const pendingCount = appointments.filter(
    (a) => a.status && a.status.toLowerCase() === "pending",
  ).length;

  if (pendingApptsEl) pendingApptsEl.textContent = pendingCount;

  if (appointments.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">No appointments allocated for this specific clinic location.</td></tr>`;
    return;
  }

  tableBody.innerHTML = appointments
    .map((appt) => {
      const currentStatus = appt.status ? appt.status.toLowerCase() : "pending";

      // 🎯 FIX 1: Dynamically resolve populated names from Mongoose relational objects
      let calculatedPatientName = "Walk-In Patient";
      if (appt.patientName) {
        calculatedPatientName = appt.patientName;
      } else if (appt.patientId && typeof appt.patientId === "object") {
        // If the backend used .populate('patientId')
        const fname = appt.patientId.firstName || "";
        const lname = appt.patientId.lastName || "";
        calculatedPatientName =
          `${fname} ${lname}`.trim() || "Registered Patient";
      } else if (appt.userId && typeof appt.userId === "object") {
        calculatedPatientName =
          `${appt.userId.firstName || ""} ${appt.userId.lastName || ""}`.trim();
      }

      // 🎯 FIX 2: Resolve 'service' vs 'reason' property naming differences
      const calculatedService =
        appt.service || appt.reason || "General Consultation";

      // Standard status pills colors logic
      let statusClass =
        "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      if (currentStatus === "confirmed" || currentStatus === "approved")
        statusClass =
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      if (currentStatus === "cancelled" || currentStatus === "rejected")
        statusClass = "bg-rose-500/10 text-rose-400 border border-rose-500/20";

      return `
      <tr class="hover:bg-slate-900/40 transition-colors">
        <td class="p-4 font-semibold text-white">${calculatedPatientName}</td>
        <td class="p-4 font-mono text-[11px] text-slate-400">${new Date(appt.date).toLocaleDateString()} @ ${appt.time}</td>
        <td class="p-4 text-slate-400 truncate max-w-[150px]">${calculatedService}</td>
        <td class="p-4"><span class="px-2.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${statusClass}">${appt.status}</span></td>
        <td class="p-4 text-right space-x-1">
          ${
            currentStatus === "pending"
              ? `
            <button onclick="modifyAppointmentStatus('${appt._id}', 'Approved')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-bold text-[10px] tracking-wide transition-colors">Approve</button>
            <button onclick="modifyAppointmentStatus('${appt._id}', 'Declined')" class="bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 px-2.5 py-1 rounded font-bold text-[10px] tracking-wide transition-colors">Cancel</button>
          `
              : `<span class="text-[11px] text-slate-600 font-medium">Session Finalized</span>`
          }
        </td>
      </tr>
    `;
    })
    .join("");
}

// Handle Live Action Patch Requests (Approve/Cancel Appointments)
async function modifyAppointmentStatus(appointmentId, newStatus) {
  try {
    console.log(
      `Sending status patch sequence: [${newStatus}] for document reference: ${appointmentId}`,
    );
    const response = await fetch(
      `http://localhost:5000/api/v1/admin/appointments/${appointmentId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      },
    );

    const result = await response.json();
    if (result.success) {
      fetchDashboardData(); // Reload stats smoothly
    } else {
      alert(`Action error: ${result.message}`);
    }
  } catch (err) {
    console.error("Failed to dispatch patch operation:", err);
  }
}

// 🎯 FIX 3: Explicitly bind target functions to the browser window dictionary space
// This guarantees that inline onclick template button calls work seamlessly under module loaders
window.modifyAppointmentStatus = modifyAppointmentStatus;

// Handle Form Submit (Staff Member Registration Onboarding)
async function handleStaffOnboarding(e) {
  e.preventDefault();

  const payload = {
    fullName: document.getElementById("staff-name").value,
    specialization: document.getElementById("staff-spec").value,
    role: document.getElementById("staff-role").value,
    email: document.getElementById("staff-email").value,
    phone: document.getElementById("staff-phone").value,
  };

  try {
    const response = await fetch("http://localhost:5000/api/v1/admin/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-clinic-id": clinicId,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result.success) {
      alert(
        "🎉 Medical Provider Registered Successfully inside Workspace Context!",
      );
      document.getElementById("add-staff-form").reset();
      fetchDashboardData(); // Refresh metrics list counters
    } else {
      alert(`Onboarding failure: ${result.message}`);
    }
  } catch (err) {
    console.error("Failed to commit provider entry:", err);
  }
}

// Handle Logout Actions clean down
function handleLogout() {
  localStorage.clear();
  window.location.href = "/clinicLogin.html";
}
