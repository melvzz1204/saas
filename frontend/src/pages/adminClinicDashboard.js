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

  // 5. Staff Onboarding Form Submit Binder (Safely synced with HTML element ID)
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

    // Include the service/price route into your concurrent Promise block
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

    // 1. Parse the structural services array data FIRST to establish the global pricing cache
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

    // 2. Parse the appointments and staff lists
    const appts = await apptRes.json();
    const staff = await staffRes.json();

    // 3. Render downstream components safely now that pricing structures are verified
    if (appts.success) {
      renderAppointmentsTable(appts.data);
    }

    const kpiStaffEl = document.getElementById("kpi-total-staff");
    if (staff.success && kpiStaffEl) {
      kpiStaffEl.textContent = staff.data.length;
    }
  } catch (err) {
    console.error("Workspace data synch failure:", err);
  }
}

function renderAppointmentsTable(appointments) {
  const tableBody = document.getElementById("appointment-table-body");
  if (!tableBody) return;

  console.log("📥 Raw Appointments Array received from Server:", appointments);

  // 1. Grab all active UI element counters
  const totalApptsEl = document.getElementById("kpi-total-appointments");
  const pendingApptsEl = document.getElementById("kpi-pending-bookings");
  const todayBookingsEl = document.getElementById("kpi-today-bookings");
  const monthlyBookingsEl = document.getElementById("kpi-monthly-bookings");

  // 2. Set total overall bookings counter
  if (totalApptsEl) totalApptsEl.textContent = appointments.length;

  // 3. Filter Pending Metrics
  const pendingCount = appointments.filter(
    (a) => a.status && a.status.toLowerCase() === "pending",
  ).length;
  if (pendingApptsEl) pendingApptsEl.textContent = pendingCount;

  // =========================================================================
  // 📆 CALENDAR CALCULATION ENGINE (STRICT MATCH - ZERO TIMEZONE DROPS)
  // =========================================================================
  const now = new Date();
  const dynamicToday = now.toISOString().split("T")[0];
  const dynamicMonth = dynamicToday.substring(0, 7);

  // Count Today's Bookings exclusively
  const todayCount = appointments.filter((appt) => {
    if (!appt.date) return false;
    const cleanDate = String(appt.date).trim().split("T")[0];

    return cleanDate === dynamicToday;
  }).length;

  // Count ALL Bookings for this Month
  const monthlyCount = appointments.filter((appt) => {
    if (!appt.date) return false;
    const cleanDate = String(appt.date).trim().split("T")[0];
    return cleanDate.startsWith(dynamicMonth);
  }).length;

  console.log(
    `📊 Live Computed Counts -> Today (${dynamicToday}):`,
    todayCount,
    ` | Month (${dynamicMonth}):`,
    monthlyCount,
  );
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
        currentStatus === "cancelled" ||
        currentStatus === "rejected" ||
        currentStatus === "declined"
      ) {
        statusClass = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      } else if (currentStatus === "missed" || currentStatus === "no-show") {
        // 🎨 Sleek slate/gray badge look for unattended appointments
        statusClass =
          "bg-slate-500/10 text-slate-400 border border-slate-500/20";
      }
      // 🆕 FIXED RELATIONAL FUZZY LOOKUP PIPELINE
      const matchedTreatment = (
        typeof globalTreatmentsData !== "undefined" ? globalTreatmentsData : []
      ).find((t) => {
        if (!t.name) return false;

        const dbName = t.name.toLowerCase().trim();
        const apptService = calculatedService.toLowerCase().trim();
        const dbSlug = t.slug ? t.slug.toLowerCase().trim() : "";

        // Absolute text match or slug match
        if (dbName === apptService || dbSlug === apptService) return true;

        // Partial matching safety fallback (e.g., matching "Consultation" with "General Consultation")
        return dbName.includes(apptService) || apptService.includes(dbName);
      });

      // Format price correctly matching back to controller target property: "basePricePhp"
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
</tr>
    `;
    })
    .join("");
}
// Fetch Appointments, Staff Count, and Dental Service Prices simultaneously
async function fetchDashboardData() {
  if (!clinicId) return;
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "x-clinic-id": clinicId,
    };

    // 1. Fetch primary dashboard records concurrently
    const [apptRes, staffRes] = await Promise.all([
      fetch("http://localhost:5000/api/v1/admin/appointments", { headers }),
      fetch("http://localhost:5000/api/v1/admin/staff", { headers }),
    ]);

    const appts = await apptRes.json();
    const staff = await staffRes.json();

    // 2. Isolated block for your specific Controller route schema
    try {
      // ⚠️ Note: Adjust this URL route to match your exact backend server router setup for getServices
      const servicesRes = await fetch(
        "http://localhost:5000/api/v1/dental-price/services",
        { headers },
      );
      if (servicesRes && servicesRes.ok) {
        const servicesJson = await servicesRes.json();
        if (servicesJson && servicesJson.success) {
          globalTreatmentsData = servicesJson.data || [];
        }
      }
    } catch (serviceErr) {
      console.warn(
        "⚠️ dentalServicePriceController endpoint is unreachable. Defaulting to ₱0.00:",
        serviceErr,
      );
      globalTreatmentsData = [];
    }

    // 3. Render downstream interface views safely
    if (appts.success) renderAppointmentsTable(appts.data);

    const kpiStaffEl = document.getElementById("kpi-total-staff");
    if (staff.success && kpiStaffEl) {
      kpiStaffEl.textContent = staff.data.length;
    }
  } catch (err) {
    console.error("Workspace data synch failure:", err);
  }
}
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

async function handleStaffOnboarding(e) {
  e.preventDefault();

  const pinRevealBox = document.getElementById("pin-reveal-box");
  const generatedPinDisplay = document.getElementById("generated-pin-display");

  // Hide the previous PIN layout at the start of a new request
  if (pinRevealBox) pinRevealBox.classList.add("hidden");

  // 🔑 GENERATE A SECURE 6-DIGIT ACCESS PIN AUTOMATICALLY
  const autoGeneratedPin = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();

  const staffNameValue = document.getElementById("staff-name").value.trim();

  // 🎯 FIXED PAYLOAD: Satisfies backend validation rules
  const payload = {
    name: staffNameValue,
    fullName: staffNameValue,
    specialization:
      document.getElementById("staff-spec").value.trim() || "General Dentistry",
    role: document.getElementById("staff-role").value,
    email: document.getElementById("staff-email").value.trim(),
    phone: document.getElementById("staff-phone").value.trim(),
    accessPin: autoGeneratedPin,
    clinicId: clinicId, // Ensure 'clinicId' is defined in your outer scope
  };

  try {
    const response = await fetch(
      "http://localhost:5000/api/v1/admin/staff/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // Ensure 'token' is defined in your outer scope
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify(payload),
      },
    );

    // 1. Check HTTP Status First
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

    // 2. Flexible Backend Verification Checklist
    // Adapts to: { success: true }, { status: "success" }, or status code 200/201 returning data
    const isSuccessful =
      result.success === true ||
      result.status === "success" ||
      response.status === 201 ||
      response.status === 200;

    if (isSuccessful) {
      // 3. Render the PIN to the UI instantly
      if (pinRevealBox && generatedPinDisplay) {
        generatedPinDisplay.textContent = autoGeneratedPin;
        pinRevealBox.classList.remove("hidden");
      }

      // Reset fields smoothly using the accurate element ID
      const staffForm = document.getElementById("add-staff-form");
      if (staffForm) staffForm.reset();

      // Update metrics instantly
      if (typeof fetchDashboardData === "function") {
        fetchDashboardData();
      }
    } else {
      alert(
        `Onboarding failure: ${result.message || "Unknown API verification error."}`,
      );
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
