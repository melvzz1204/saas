// adminDashboard.js

// =========================================================================
// 🛡️ SECURITY GUARD: Block unauthenticated traffic instantly
// =========================================================================
const token = localStorage.getItem("token");
const userData = JSON.parse(localStorage.getItem("user") || "null");

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

// Extraction: Capture tenant identifier context strings safely
const clinicId = userData.clinicId;

// =========================================================================
// 🔌 UNIFIED INITIALIZATION LAYER (DOM Content Loaded)
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Render logged-in user context profiles
  const displayEmailEl = document.getElementById("display-user-email");
  if (displayEmailEl) displayEmailEl.textContent = userData.email;

  // 2. Initial Data Sync Triggers
  fetchClinicMetadata();
  fetchDashboardData();

  // 3. View Patient Live Terminal Site Event Listener
  const viewLiveSiteBtn = document.getElementById("viewLiveSiteBtn");
  if (viewLiveSiteBtn) {
    viewLiveSiteBtn.addEventListener("click", () => {
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

  // 4. Data Refresh / Synchronization Click Listener
  const refreshBtn = document.getElementById("refresh-appointments");
  if (refreshBtn) refreshBtn.addEventListener("click", fetchDashboardData);

  // 5. Staff Onboarding Form Submit Binder
  const staffForm = document.getElementById("add-staff-form");
  if (staffForm) staffForm.addEventListener("submit", handleStaffOnboarding);

  // 6. Logout Core Trigger Link
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
});

// =========================================================================
// 📊 METRICS & CODES SYNCHRONIZATION ENGINES
// =========================================================================

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
      "x-clinic-id": clinicId,
    };

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

// Render Data Collections Matrix Into the UI Dashboard Viewport Layout
function renderAppointmentsTable(appointments) {
  const tableBody = document.getElementById("appointment-table-body");
  if (!tableBody) return;

  console.log("📥 Raw Appointments Array received from Server:", appointments);

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

      let calculatedPatientName = "Walk-In Patient";
      if (appt.patientName) {
        calculatedPatientName = appt.patientName;
      } else if (appt.patientId && typeof appt.patientId === "object") {
        const fname = appt.patientId.firstName || "";
        const lname = appt.patientId.lastName || "";
        calculatedPatientName =
          `${fname} ${lname}`.trim() || "Registered Patient";
      } else if (appt.userId && typeof appt.userId === "object") {
        calculatedPatientName =
          `${appt.userId.firstName || ""} ${appt.userId.lastName || ""}`.trim();
      }

      const calculatedService =
        appt.service || appt.reason || "General Consultation";

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
      fetchDashboardData();
    } else {
      alert(`Action error: ${result.message}`);
    }
  } catch (err) {
    console.error("Failed to dispatch patch operation:", err);
  }
}

// Explicitly bind target functions to the browser window dictionary space for inline HTML buttons
window.modifyAppointmentStatus = modifyAppointmentStatus;

// =========================================================================
// 🪪 PASSWORDLESS STAFF ONBOARDING FORM SUBSYSTEM (POST INTERACTION)
// =========================================================================
async function handleStaffOnboarding(e) {
  e.preventDefault();

  const pinRevealBox = document.getElementById("pin-reveal-box");
  const generatedPinDisplay = document.getElementById("generated-pin-display");

  // Reset/Hide modal state block if executing a brand new registration chain
  if (pinRevealBox) pinRevealBox.classList.add("hidden");

  // 🔑 GENERATE A SECURE 6-DIGIT ACCESS PIN AUTOMATICALLY
  const autoGeneratedPin = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();

  const payload = {
    fullName: document.getElementById("staff-name").value.trim(), // 👈 Ensure this says 'fullName'
    specialization: document.getElementById("staff-spec").value.trim(),
    role: document.getElementById("staff-role").value,
    email: document.getElementById("staff-email").value.trim(),
    phone: document.getElementById("staff-phone").value.trim(),
    accessPin: autoGeneratedPin,
  };

  try {
    // Hits the correct versioned admin route context processing layer
    const response = await fetch(
      "http://localhost:5000/api/v1/admin/staff/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify(payload),
      },
    );

    // Handle structural layout network exceptions to avoid unexpected parser failures
    if (!response.ok) {
      const errorText = await response.text();
      let parseMessage = "Failed to compile registration parameters.";
      try {
        const errJson = JSON.parse(errorText);
        parseMessage = errJson.message || parseMessage;
      } catch {
        parseMessage = errorText || parseMessage;
      }
      throw new Error(parseMessage);
    }

    const result = await response.json();

    if (result.success) {
      // 🌟 REVEAL SECURE PIN: Display credentials securely to the admin operator
      if (pinRevealBox && generatedPinDisplay) {
        generatedPinDisplay.textContent = autoGeneratedPin;
        pinRevealBox.classList.remove("hidden");
      }

      // Reset fields smoothly
      document.getElementById("add-staff-form").reset();

      // Update global metrics arrays and KPI dashboard elements instantly
      fetchDashboardData();
    } else {
      alert(`Onboarding failure: ${result.message}`);
    }
  } catch (err) {
    console.error("Failed to commit provider entry:", err);
    alert(`Registration Error: ${err.message}`);
  }
}

// Handle Logout Actions clean down
function handleLogout() {
  localStorage.clear();
  window.location.href = "/clinicLogin.html";
}
