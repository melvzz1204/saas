const API_PRICING_URL = "http://localhost:5000/api/v1/dental-price/services";
const token = localStorage.getItem("token");
const userJson = localStorage.getItem("user");

if (!token || !userJson) {
  console.warn("⚠️ Credentials missing. Redirecting to login gate.");
  const sessionSlug = localStorage.getItem("clinicSlug") || "default";
  window.location.href = `/patientLogin.html?clinic=${sessionSlug}`;
}

// 🛡️ HELPER: Safely decodes JWT strings without character truncation
function parseJwt(tokenString) {
  try {
    if (!tokenString) return null;
    const base64Url = tokenString.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("❌ JWT Payload Decode Exception Error:", e);
    return null;
  }
}

// 🔗 Resolve Identity Framework
const decodedToken = parseJwt(token);
const currentUser = JSON.parse(userJson || "{}");

const DYNAMIC_CLINIC_ID = currentUser.clinicId || decodedToken?.clinicId;
const verifiedPatientId =
  currentUser._id || currentUser.id || decodedToken?.userId;

// DOM Element Registry Links
const userGreeting = document.getElementById("user-greeting");
const bookingForm = document.getElementById("booking-form");
const bookingsTableBody = document.getElementById("bookings-table-body");
const clinicNameHeading = document.getElementById("clinic-name-heading");
const logoutBtn = document.getElementById("logout-btn");

// UI Display Greeting Initialization
if (userGreeting && currentUser.firstName) {
  userGreeting.textContent = `👋 Welcome, ${currentUser.firstName} ${currentUser.lastName}`;
}

// 1. Fetch Clinic Meta Context Dynamically
async function fetchClinicName() {
  if (!DYNAMIC_CLINIC_ID || DYNAMIC_CLINIC_ID === "undefined") {
    console.error("❌ Error: No clinic context found in user session.");
    if (clinicNameHeading)
      clinicNameHeading.textContent = "Dental Clinic Portal";
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/tenants/${DYNAMIC_CLINIC_ID}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const result = await response.json();

    if (response.ok && result.data) {
      if (clinicNameHeading) clinicNameHeading.textContent = result.data.name;
      document.title = `${result.data.name} | Patient Dashboard`;
      if (result.data.slug) {
        localStorage.setItem("clinicSlug", result.data.slug);
      }
    } else {
      if (clinicNameHeading)
        clinicNameHeading.textContent = "Dental Clinic Portal";
    }
  } catch (error) {
    console.error("Failed to fetch clinic name:", error);
    if (clinicNameHeading)
      clinicNameHeading.textContent = "Dental Clinic Portal";
  }
}

// 2. Fetch Live Dynamic Pricing & Populate UI Form/Ledger
async function syncDynamicPricingElements() {
  const serviceSelect = document.getElementById("booking-service");
  const pricingLedgerBody = document.getElementById("pricing-ledger-body");
  const formPriceIndicator = document.getElementById("form-price-indicator");

  try {
    const response = await fetch(API_PRICING_URL);
    if (!response.ok) throw new Error("Could not sync price schemas.");

    const resData = await response.json();
    if (!resData.success)
      throw new Error(resData.message || "Database structural error.");

    const services = resData.data;

    if (services.length === 0) {
      if (serviceSelect)
        serviceSelect.innerHTML =
          '<option value="" disabled>No services available</option>';
      if (pricingLedgerBody) {
        pricingLedgerBody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-slate-400 italic">No treatment paths defined.</td></tr>`;
      }
      return;
    }

    // Map values into booking dropdown options
    if (serviceSelect) {
      serviceSelect.innerHTML = services
        .map((service, index) => {
          const formattedPrice = `₱${Number(service.basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return `<option value="${service.name}" data-price="${formattedPrice}" ${index === 0 ? "selected" : ""}>${service.name}</option>`;
        })
        .join("");

      // Trigger fallback initialization text value on setup mount
      if (services[0] && formPriceIndicator) {
        const firstPriceFormatted = `₱${Number(services[0].basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        formPriceIndicator.textContent = firstPriceFormatted;
      }
    }

    // Map values into reference catalog ledger table
    if (pricingLedgerBody) {
      pricingLedgerBody.innerHTML = services
        .map((service) => {
          const formattedPrice = `₱${Number(service.basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return `
            <tr class="hover:bg-slate-50/40 transition-colors">
                <td class="py-4 px-5 font-bold text-slate-900">${service.name}</td>
                <td class="py-4 px-5 text-slate-400">${service.description || "No descriptive scope provided."}</td>
                <td class="py-4 px-5 text-right font-black text-slate-900 whitespace-nowrap">${formattedPrice}</td>
            </tr>
          `;
        })
        .join("");
    }
  } catch (err) {
    console.error("❌ Patient Portal Sync Error:", err);
    if (pricingLedgerBody) {
      pricingLedgerBody.innerHTML = `
        <tr>
            <td colspan="3" class="py-6 text-center text-rose-500 font-semibold bg-rose-50/40">
                Error linking backend catalogue: ${err.message}
            </td>
        </tr>`;
    }
  }
}

// 3. Load Isolated Tenant Bookings
async function loadPatientBookings() {
  if (!bookingsTableBody) return;

  if (!verifiedPatientId || verifiedPatientId === "undefined") {
    console.error(
      "❌ Session Error: Patient unique ID is missing from localStorage user payload.",
    );
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-amber-500 font-semibold">Session Error: Please log out and log back in to refresh your keys.</td></tr>`;
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/appointments/patient/${verifiedPatientId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": DYNAMIC_CLINIC_ID,
          "x-clinic-id": DYNAMIC_CLINIC_ID,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const result = await response.json();
    if (response.ok && result.data) {
      renderBookingsList(result.data);
    } else {
      bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">Failed to load appointments history.</td></tr>`;
    }
  } catch (error) {
    console.error("Error connecting to bookings engine:", error);
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-rose-400 italic">Network error connecting to database.</td></tr>`;
  }
}

// 4. Render Table DOM Content
function renderBookingsList(appointmentsList) {
  bookingsTableBody.innerHTML = "";
  let pendingCount = 0;
  let nextConfirmedVisit = "None Scheduled";

  if (!appointmentsList || appointmentsList.length === 0) {
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">No appointments found. Use the panel on the left to schedule your first session!</td></tr>`;
    const statPending = document.getElementById("stat-pending");
    const statNextVisit = document.getElementById("stat-next-visit");
    if (statPending) statPending.textContent = "0";
    if (statNextVisit) statNextVisit.textContent = "None Scheduled";
    return;
  }

  appointmentsList.forEach((booking) => {
    let badgeClass = "";
    const localizedStatus = booking.status
      ? booking.status.toLowerCase()
      : "pending";

    if (
      localizedStatus === "approved" ||
      localizedStatus === "confirmed" ||
      localizedStatus === "accepted"
    ) {
      badgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
      nextConfirmedVisit = `${booking.date} at ${booking.time}`;
    } else if (localizedStatus === "pending") {
      badgeClass = "bg-amber-50 text-amber-700 border border-amber-200";
      pendingCount++;
    } else {
      badgeClass = "bg-rose-50 text-rose-700 border border-rose-200";
    }

    const row = document.createElement("tr");
    row.className = "hover:bg-slate-50 transition-colors";
    row.innerHTML = `
      <td class="py-4 px-4 font-semibold text-slate-900">${booking.service}</td>
      <td class="py-4 px-4 text-slate-600">${booking.date} <span class="mx-1 text-slate-300">|</span> ${booking.time}</td>
      <td class="py-4 px-4">
        <span class="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${badgeClass}">
          ${booking.status}
        </span>
      </td>
    `;
    bookingsTableBody.appendChild(row);
  });

  const statPending = document.getElementById("stat-pending");
  const statNextVisit = document.getElementById("stat-next-visit");
  if (statPending) statPending.textContent = pendingCount;
  if (statNextVisit) statNextVisit.textContent = nextConfirmedVisit;
}

// 5. Submit New Appointment Action
if (bookingForm) {
  bookingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      patientId: verifiedPatientId,
      service: document.getElementById("booking-service").value,
      date: document.getElementById("booking-date").value,
      time: document.getElementById("booking-time").value,
    };

    try {
      const response = await fetch(
        "http://localhost:5000/api/v1/appointments/book",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Clinic-ID": DYNAMIC_CLINIC_ID,
            "x-clinic-id": DYNAMIC_CLINIC_ID,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (response.ok) {
        alert(
          "🚀 Appointment request submitted! Awaiting administrator approval.",
        );
        bookingForm.reset();
        await loadPatientBookings();
      } else {
        alert(`❌ Booking Failed: ${result.message}`);
      }
    } catch (error) {
      console.error("Booking Error:", error);
      alert("❌ Could not connect to booking system.");
    }
  });
}

// 6. Logout Handler
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    const contextSlug = localStorage.getItem("clinicSlug") || "default";
    localStorage.clear();
    alert("Logged out safely.");
    window.location.href = `/patientLogin.html?clinic=${contextSlug}`;
  });
}

// 🚀 Unified Sequential App Initialization Lifecycle
async function initializeDashboard() {
  console.log("⚓ LIVE MONITOR ENGINE ACTIVE:");
  console.log("-> Loaded Patient Hex:", verifiedPatientId);
  console.log("-> Loaded Tenant Hex:", DYNAMIC_CLINIC_ID);

  await fetchClinicName();
  await syncDynamicPricingElements(); // Safely running inside initialization loop sequence
  await loadPatientBookings();
}

// Run this when your patient booking modal or view mounts
function initializeBookingCalendar() {
  const dateInput = document.getElementById("booking-date");
  if (!dateInput) return;

  // 📆 Get real-time current date in local "YYYY-MM-DD" format
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  const minDateString = `${year}-${month}-${day}`;

  // Enforce the baseline timeline boundary on the input element
  dateInput.setAttribute("min", minDateString);
}
// Locate your form submit listener function inside patientDashboard.js
document
  .getElementById("booking-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedDateStr = document.getElementById("booking-date").value; // YYYY-MM-DD
    const selectedTimeStr = document.getElementById("booking-time").value; // e.g., "09:00 AM"

    const selectedDateTime = new Date(`${selectedDateStr} ${selectedTimeStr}`);
    const currentSystemTime = new Date(); // Real time evaluation node

    // 🛡️ Double-layer verification check block
    if (selectedDateTime < currentSystemTime) {
      alert(
        "⚠️ Booking Window Error: The selected structural time window has already passed for today. Please pick a later slot.",
      );
      return; // Halt form transmission
    }

    // ... your existing fetch/axios submission logic can continue safely here ...
  });

// Trigger bootstrap routine once script parsing evaluates
initializeDashboard();
// =========================================================================
// ⚡ REAL-TIME PATIENT PIPELINE REACTION ENGINE
// =========================================================================
const socket = io("http://localhost:5000", {
  transports: ["websocket"],
  upgrade: false,
});

socket.on("connect", () => {
  console.log("🟢 Patient Dashboard linked to real-time live sync pipeline!");
});

socket.on("connect_error", (err) => {
  console.error("🔴 Patient Live Sync Error:", err.message);
});

// Intercept pipeline updates from the clinic network
socket.on("pipeline-update", async (data) => {
  console.log("🔔 Clinic Pipeline Event Intercepted:", data.message);

  // 🎯 Dynamically check for whatever naming convention your patient dashboard uses:
  if (typeof fetchPatientAppointments === "function") {
    console.log("🔄 Re-fetching patient personalized booking ledger...");
    await fetchPatientAppointments();
  } else if (typeof loadDashboardData === "function") {
    console.log("🔄 Re-fetching patient workspace container...");
    await loadDashboardData();
  } else {
    // Fallback: If data functions are wrapped/unreachable, do a clean page soft-refresh
    console.log(
      "⚠️ Scoped wrapper detected. Executing page state soft-refresh fallback...",
    );
    window.location.reload();
  }
});
// =========================================================================
