// src/pages/adminClinicDashboard.js

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

const clinicId = userData.clinicId;
let globalTreatmentsData = [];
let globalAppointmentsData = [];

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
      const cachedSlug = localStorage.getItem("activeClinicSlug") || "default";

      // Seed the necessary context keys internally
      localStorage.setItem("clinicSlug", cachedSlug);

      console.log(
        `🔗 Redirecting to live patient login with clinic tracking parameter: ${cachedSlug}`,
      );

      // Include the 'clinic' query parameter so patientLogin.js can parse the workspace context
      window.open(
        `/clinicHomePage.html?clinic=${encodeURIComponent(cachedSlug)}`,
        "_blank",
      );
    });
  }

  // 4. Data Refresh / Synchronization Click Listeners
  const refreshAppointmentsBtn = document.getElementById(
    "refresh-appointments",
  );
  if (refreshAppointmentsBtn) {
    refreshAppointmentsBtn.addEventListener("click", fetchDashboardData);
  }

  const refreshStaffBtn = document.getElementById("refresh-staff");
  if (refreshStaffBtn) {
    refreshStaffBtn.addEventListener("click", fetchDashboardData);
  }

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

async function fetchDashboardData() {
  if (!clinicId) return;
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "x-clinic-id": clinicId,
    };

    const [apptRes, staffRes, servicesRes] = await Promise.all([
      fetch("http://localhost:5000/api/v1/admin/appointments", { headers }),
      fetch("http://localhost:5000/api/v1/admin/staff", { headers }),
      fetch("http://localhost:5000/api/v1/dental-price/services", {
        headers,
      }).catch((err) => {
        console.warn("⚠️ Services fetch dropped early:", err);
        return null;
      }),
    ]);

    if (servicesRes && servicesRes.ok) {
      const servicesJson = await servicesRes.json();
      if (servicesJson && servicesJson.success) {
        globalTreatmentsData = servicesJson.data || [];
        console.log(
          "💎 Live Pricing Cache Synced Successfully:",
          globalTreatmentsData,
        );
      }
    } else {
      console.warn(
        "⚠️ Services endpoint returned error status. Check backend routing.",
      );
      globalTreatmentsData = [];
    }

    const appts = await apptRes.json();
    const staff = await staffRes.json();

    if (appts.success) {
      globalAppointmentsData = appts.data || [];
      renderAppointmentsTable(appts.data);
    }

    if (staff.success) {
      const kpiStaffEl = document.getElementById("kpi-total-staff");
      if (kpiStaffEl) kpiStaffEl.textContent = staff.data.length;

      // Render staff rows into the active staff directory table
      renderStaffTable(staff.data);
    }
  } catch (err) {
    console.error("Workspace data synch failure:", err);
  }
}

function renderAppointmentsTable(appointments) {
  const tableBody = document.getElementById("appointment-table-body");
  if (!tableBody) return;

  console.log("📥 Raw Appointments Array received from Server:", appointments);

  const totalApptsEl = document.getElementById("kpi-total-appointments");
  const pendingApptsEl = document.getElementById("kpi-pending-bookings");
  const todayBookingsEl = document.getElementById("kpi-today-bookings");
  const monthlyBookingsEl = document.getElementById("kpi-monthly-bookings");

  if (totalApptsEl) totalApptsEl.textContent = appointments.length;

  const pendingCount = appointments.filter(
    (a) => a.status && a.status.toLowerCase() === "pending",
  ).length;
  if (pendingApptsEl) pendingApptsEl.textContent = pendingCount;

  const now = new Date();
  const dynamicToday = now.toISOString().split("T")[0];
  const dynamicMonth = dynamicToday.substring(0, 7);

  const todayCount = appointments.filter((appt) => {
    if (!appt.date) return false;
    const cleanDate = String(appt.date).trim().split("T")[0];
    return cleanDate === dynamicToday;
  }).length;

  const monthlyCount = appointments.filter((appt) => {
    if (!appt.date) return false;
    const cleanDate = String(appt.date).trim().split("T")[0];
    return cleanDate.startsWith(dynamicMonth);
  }).length;

  if (todayBookingsEl) todayBookingsEl.textContent = todayCount;
  if (monthlyBookingsEl) monthlyBookingsEl.textContent = monthlyCount;

  if (appointments.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">No appointments allocated for this specific clinic location.</td></tr>`;
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

      if (currentStatus === "confirmed" || currentStatus === "approved") {
        statusClass =
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      } else if (
        ["cancelled", "rejected", "declined"].includes(currentStatus)
      ) {
        statusClass = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      } else if (["missed", "no-show"].includes(currentStatus)) {
        statusClass =
          "bg-slate-500/10 text-slate-400 border border-slate-500/20";
      }

      const matchedTreatment = (
        typeof globalTreatmentsData !== "undefined" ? globalTreatmentsData : []
      ).find((t) => {
        if (!t.name) return false;
        const dbName = t.name.toLowerCase().trim();
        const apptService = calculatedService.toLowerCase().trim();
        const dbSlug = t.slug ? t.slug.toLowerCase().trim() : "";

        if (dbName === apptService || dbSlug === apptService) return true;
        return dbName.includes(apptService) || apptService.includes(dbName);
      });

      const calculatedFee =
        matchedTreatment && matchedTreatment.basePricePhp !== undefined
          ? `₱${Number(matchedTreatment.basePricePhp).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "₱0.00";

      return `
        <tr class="hover:bg-slate-900/10 transition-colors">
          <td class="p-4 font-bold text-slate-700">${calculatedPatientName}</td>
          <td class="p-4 font-mono text-[11px] text-slate-400 uppercase">${appt.date} @ ${appt.time}</td>
          <td class="p-4 text-slate-400 truncate max-w-[150px]">${calculatedService}</td>
          <td class="p-4">
              <span class="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                  ${calculatedFee}
              </span>
          </td>
          <td class="p-4">
              <span class="px-2.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${statusClass}">
                  ${appt.status}
              </span>
          </td>
          <td class="p-4 text-right space-x-1">
           ${
             currentStatus === "pending"
               ? `
               <button onclick="modifyAppointmentStatus('${appt._id}', 'Approved')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-bold text-[10px] tracking-wide transition-colors">Approve</button>
               <button onclick="modifyAppointmentStatus('${appt._id}', 'Declined')" class="bg-rose-50 hover:bg-rose-100 text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-200 px-2.5 py-1 rounded-md font-bold text-[10px] tracking-wide uppercase transition-colors cursor-pointer shadow-sm shadow-slate-100">Declined</button>
             `
               : currentStatus === "approved" || currentStatus === "confirmed"
                 ? `
               <button onclick="modifyAppointmentStatus('${appt._id}', 'Missed')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 px-2.5 py-1 rounded font-bold text-[10px] tracking-wide transition-colors">Mark Missed</button>
             `
                 : `<span class="text-[11px] text-slate-500 font-medium capitalize">${currentStatus}</span>`
           }
          </td>
        </tr>`;
    })
    .join("");
}

async function modifyAppointmentStatus(appointmentId, newStatus) {
  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/admin/appointments/${appointmentId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
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
window.modifyAppointmentStatus = modifyAppointmentStatus;

async function handleStaffOnboarding(e) {
  e.preventDefault();

  const pinRevealBox = document.getElementById("pin-reveal-box");
  const generatedPinDisplay = document.getElementById("generated-pin-display");
  if (pinRevealBox) pinRevealBox.classList.add("hidden");

  // Generate 6-digit access PIN
  const autoGeneratedPin = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();

  // Initialize FormData
  const formElement = e.target;
  const formData = new FormData(formElement);

  // Extract core inputs
  const staffName = document.getElementById("staff-name")?.value.trim() || "";
  const roleSelect = document.getElementById("staff-role")?.value || "";
  const emailValue = document.getElementById("staff-email")?.value.trim() || "";
  const phoneValue = document.getElementById("staff-phone")?.value.trim() || "";

  if (!staffName || !roleSelect || !emailValue || !phoneValue) {
    alert("⚠️ Please fill in all core fields (Name, Role, Email, and Phone).");
    return;
  }

  formData.set("fullName", staffName);
  formData.set("role", roleSelect);
  formData.set("email", emailValue);
  formData.set("phone", phoneValue);
  formData.set("accessPin", autoGeneratedPin);

  if (typeof clinicId !== "undefined" && clinicId) {
    formData.set("clinicId", clinicId);
  }

  // 🎯 Dynamic Specialization & Dentist Payload Cleanup
  if (roleSelect === "Dentist") {
    const specValue = document.getElementById("staff-spec")?.value.trim();
    formData.set("specialization", specValue || "General Dentistry");

    const licenseInput = document.getElementById("reg-license")?.value.trim();
    if (!licenseInput) {
      alert("⚠️ License Number is required for Dentist registrations.");
      return;
    }

    const expValue = document.getElementById("reg-experience")?.value.trim();
    if (expValue && !isNaN(expValue)) {
      formData.set("experienceYears", parseInt(expValue, 10));
    } else {
      formData.delete("experienceYears");
    }

    const imageInput = document.getElementById("reg-image");
    if (!imageInput || !imageInput.files || imageInput.files.length === 0) {
      formData.delete("profileImage");
    }
  } else {
    // Role is "Staff": Set non-clinical specialization & delete dentist-only keys
    formData.set("specialization", "General Support Staff");
    formData.delete("licenseNumber");
    formData.delete("experienceYears");
    formData.delete("bio");
    formData.delete("profileImage");
  }

  try {
    const response = await fetch(
      "http://localhost:5000/api/v1/staff/register",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${typeof token !== "undefined" ? token : ""}`,
          "x-clinic-id": typeof clinicId !== "undefined" ? clinicId : "",
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      let parseMessage = "Failed to submit staff registration.";
      try {
        const errJson = JSON.parse(errorText);
        parseMessage = errJson.message || parseMessage;
      } catch {
        parseMessage = errorText || parseMessage;
      }
      throw new Error(parseMessage);
    }

    const result = await response.json();
    if (result.success || response.status === 201 || response.status === 200) {
      alert("✅ Staff member successfully added!");

      if (pinRevealBox && generatedPinDisplay) {
        generatedPinDisplay.textContent = autoGeneratedPin;
        pinRevealBox.classList.remove("hidden");
      }

      formElement.reset();

      // Reset hidden sections
      const specContainer = document.getElementById("specialization-container");
      const dentistFields = document.getElementById("dentist-fields-container");
      if (specContainer) specContainer.classList.add("hidden");
      if (dentistFields) dentistFields.classList.add("hidden");

      if (typeof fetchDashboardData === "function") {
        fetchDashboardData();
      }
    } else {
      alert(`Onboarding failure: ${result.message || "Unknown error."}`);
    }
  } catch (err) {
    console.error("Failed to register staff:", err);
    alert(`Registration Error: ${err.message}`);
  }
}

function handleLogout() {
  localStorage.clear();
  window.location.href = "/clinicLogin.html";
}

// Render Staff Array into the Active Staff Directory Table
function renderStaffTable(staffList) {
  const tbody = document.getElementById("staff-table-body");
  if (!tbody) return;

  if (!staffList || staffList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400 italic font-medium">
          No active staff members registered for this clinic context.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = staffList
    .map((member) => {
      const displayName =
        member.fullName ||
        member.name ||
        `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
        "Staff Member";

      return `
    <tr class="hover:bg-slate-50/50 transition-colors">
      <td class="p-3.5 pl-5">
        <div class="font-bold text-slate-900">${displayName}</div>
      </td>
      <td class="p-3.5">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
          ${member.role || "Staff"}
        </span>
      </td>
      <td class="p-3.5 text-slate-600 font-medium">
        ${member.specialization || "General Dentistry"}
      </td>
      <td class="p-3.5 text-slate-600">
        <div>${member.email || "—"}</div>
        <div class="text-[10px] text-slate-400">${member.phone || "N/A"}</div>
      </td>
      <td class="p-3.5 pr-5 text-right space-x-2">
        <!-- 🎯 NEW RESET PIN BUTTON -->
        <button onclick="handleResetStaffPassword('${member._id}')" class="text-[11px] text-amber-600 hover:text-amber-800 font-bold uppercase tracking-wider cursor-pointer">
          Reset PIN
        </button>
        <!-- EXISTING DEACTIVATE BUTTON -->
        <button onclick="removeStaffMember('${member._id}')" class="text-[11px] text-rose-600 hover:text-rose-800 font-bold uppercase tracking-wider cursor-pointer">
          Deactivate
        </button>
      </td>
    </tr>`;
    })
    .join("");
}

// Staff Deactivation Handler
async function removeStaffMember(staffId) {
  if (!confirm("Are you sure you want to deactivate this staff member?"))
    return;

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/admin/staff/${staffId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
        },
      },
    );

    const resData = await response.json();
    if (resData.success || response.ok) {
      fetchDashboardData();
    } else {
      alert(
        `Deactivation error: ${resData.message || "Unable to remove staff member."}`,
      );
    }
  } catch (err) {
    console.error("Failed to deactivate staff member:", err);
  }
}
window.removeStaffMember = removeStaffMember;

// Real-time Event Subscription Layout
const socket = io("http://localhost:5000", {
  transports: ["websocket"],
  upgrade: false,
});
// =========================================================================
// 🔑 STAFF PIN RESET HANDLER (WITH CUSTOM POPUP MODAL)
// =========================================================================

async function handleResetStaffPassword(staffId) {
  if (
    !confirm(
      "Are you sure you want to generate a new temporary PIN for this staff member?",
    )
  ) {
    return;
  }

  try {
    const token = localStorage.getItem("token").replace(/['"]+/g, "");

    const response = await fetch(
      "http://localhost:5000/api/v1/staff/reset-pin",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify({ staffId }),
      },
    );

    const data = await response.json();

    if (response.ok || data.success) {
      // 🎯 Open the pop-up modal with the generated PIN!
      openResetPinModal(data.tempPin);
    } else {
      alert(`❌ Failed to reset PIN: ${data.message}`);
    }
  } catch (err) {
    console.error("Reset failed:", err);
    alert("Network error resetting PIN. Please try again.");
  }
}
window.handleResetStaffPassword = handleResetStaffPassword;

// 🎯 Modal Helper Functions
function openResetPinModal(tempPin) {
  const modal = document.getElementById("reset-pin-modal");
  const pinDisplay = document.getElementById("reset-modal-pin-display");
  const copyBtnText = document.getElementById("copy-btn-text");

  if (pinDisplay) pinDisplay.textContent = tempPin;
  if (copyBtnText) copyBtnText.textContent = "Copy PIN";

  if (modal) modal.classList.remove("hidden");
}

function closeResetPinModal() {
  const modal = document.getElementById("reset-pin-modal");
  if (modal) modal.classList.add("hidden");
}

async function copyResetPinToClipboard() {
  const pinText = document.getElementById(
    "reset-modal-pin-display",
  )?.textContent;
  const copyBtnText = document.getElementById("copy-btn-text");

  if (!pinText) return;

  try {
    await navigator.clipboard.writeText(pinText);
    if (copyBtnText) copyBtnText.textContent = "Copied! ✓";

    // Reset button label back to 'Copy PIN' after 2.5 seconds
    setTimeout(() => {
      if (copyBtnText) copyBtnText.textContent = "Copy PIN";
    }, 2500);
  } catch (err) {
    console.error("Clipboard copy failed:", err);
  }
}
// =========================================================================
// 📊 FINANCIAL & OPERATIONAL REPORT GENERATOR (CSV EXPORT)
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("export-report-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", generateClinicReportCSV);
  }
});

function generateClinicReportCSV() {
  if (!globalAppointmentsData || globalAppointmentsData.length === 0) {
    alert("No appointment data available to generate a report.");
    return;
  }

  let totalRealizedRevenue = 0;
  let totalLostRevenue = 0;
  let totalPendingRevenue = 0;

  let confirmedCount = 0;
  let missedCount = 0;
  let pendingCount = 0;

  // 1. Calculate Metrics & Prepare Flat Data
  const rowData = globalAppointmentsData.map((appt) => {
    const currentStatus = appt.status ? appt.status.toLowerCase() : "pending";

    // Calculate Patient Name
    let patientName = "Walk-In Patient";
    if (appt.patientName) patientName = appt.patientName;
    else if (appt.patientId && typeof appt.patientId === "object") {
      patientName =
        `${appt.patientId.firstName || ""} ${appt.patientId.lastName || ""}`.trim();
    } else if (appt.userId && typeof appt.userId === "object") {
      patientName =
        `${appt.userId.firstName || ""} ${appt.userId.lastName || ""}`.trim();
    }

    const serviceName = appt.service || appt.reason || "General Consultation";

    // Calculate Fee based on globalTreatmentsData
    const matchedTreatment = globalTreatmentsData.find((t) => {
      if (!t.name) return false;
      const dbName = t.name.toLowerCase().trim();
      return dbName.includes(serviceName.toLowerCase().trim());
    });

    const rawFee =
      matchedTreatment && matchedTreatment.basePricePhp
        ? Number(matchedTreatment.basePricePhp)
        : 0;

    // Accumulate Financial & Ops Totals
    if (["confirmed", "approved"].includes(currentStatus)) {
      totalRealizedRevenue += rawFee;
      confirmedCount++;
    } else if (
      ["cancelled", "rejected", "declined", "missed", "no-show"].includes(
        currentStatus,
      )
    ) {
      totalLostRevenue += rawFee;
      if (["missed", "no-show"].includes(currentStatus)) missedCount++;
    } else if (currentStatus === "pending") {
      totalPendingRevenue += rawFee;
      pendingCount++;
    }

    return [
      `"${patientName}"`,
      `"${appt.date || "N/A"}"`,
      `"${appt.time || "N/A"}"`,
      `"${serviceName}"`,
      `"PHP ${rawFee.toFixed(2)}"`,
      `"${appt.status || "Pending"}"`,
    ].join(",");
  });

  // 2. Format the CSV Document
  const dateStr = new Date().toISOString().split("T")[0];
  let csvContent = "data:text/csv;charset=utf-8,";

  // --- SECTION: Financial & Operations Summary ---
  csvContent += "CLINIC FINANCIAL & OPERATIONS SUMMARY\n";
  csvContent += `Report Generated On:,${dateStr}\n\n`;

  csvContent += "FINANCIAL DASHBOARD\n";
  csvContent += `Realized Revenue (Approved/Confirmed):,PHP ${totalRealizedRevenue.toFixed(2)}\n`;
  csvContent += `Pending Pipeline (Waiting Approval):,PHP ${totalPendingRevenue.toFixed(2)}\n`;
  csvContent += `Lost Revenue (Missed/Cancelled):,PHP ${totalLostRevenue.toFixed(2)}\n\n`;

  csvContent += "OPERATIONS & ATTENDANCE\n";
  csvContent += `Total Processed Appointments:,${globalAppointmentsData.length}\n`;
  csvContent += `Completed / Approved:,${confirmedCount}\n`;
  csvContent += `No-Shows / Missed:,${missedCount}\n`;
  csvContent += `Pending Actions Needed:,${pendingCount}\n\n`;

  // --- SECTION: Raw Operations Data (The Itinerary) ---
  csvContent += "RAW APPOINTMENT LOG\n";
  csvContent +=
    "Patient Name,Date,Time,Service Requested,Expected Fee,Status\n";
  csvContent += rowData.join("\n");

  // 3. Trigger the Browser Download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Clinic_Report_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Attach helpers to global window object
window.openResetPinModal = openResetPinModal;
window.closeResetPinModal = closeResetPinModal;
window.copyResetPinToClipboard = copyResetPinToClipboard;
window.handleResetStaffPassword = handleResetStaffPassword;
socket.on("pipeline-update", async () => {
  if (typeof fetchDashboardData === "function") {
    await fetchDashboardData();
  } else {
    window.location.reload();
  }
});
