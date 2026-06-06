// src/pages/patientDashboard.js

// 1. Initial Validation Gates
const token = localStorage.getItem("token");
const userJson = localStorage.getItem("user");

if (!token || !userJson) {
  console.warn("⚠️ Credentials missing. Redirecting to login gate.");
  // Fallback to cached slug context or default configuration parameter if empty
  const sessionSlug = localStorage.getItem("clinicSlug") || "default";
  window.location.href = `/patientLogin.html?clinic=${sessionSlug}`;
}

// 🛡️ HELPER: Safely decodes JWT strings without character truncation
function parseJwt(tokenString) {
  try {
    if (!tokenString) return null;

    // Split the token to target the payload section (index 1)
    const base64Url = tokenString.split(".")[1];
    if (!base64Url) return null;

    // Convert base64url format to standard base64 strings safely
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

    // Use an advanced clean binary decoding matrix to preserve character lengths
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

// Fallback Chain: Pull from user object, if missing, harvest instantly from the token!
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

// 2. Fetch Clinic Meta Context Dynamically
async function fetchClinicName() {
  if (!DYNAMIC_CLINIC_ID || DYNAMIC_CLINIC_ID === "undefined") {
    console.error("❌ Error: No clinic context found in user session.");
    if (clinicNameHeading)
      clinicNameHeading.textContent = "Dental Clinic Portal";
    return;
  }

  try {
    // 🎯 FIX: Patched endpoint URL from /api/v1/clinic to /api/v1/tenants matching your backend router geometry
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

      // 🎯 Cache the live clinic slug dynamically to protect session redirects
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

  // Replace Section 4 inside /src/pages/patientDashboard.js

  appointmentsList.forEach((booking) => {
    let badgeClass = "";

    // 🎯 FIX: Convert the incoming status string to lowercase to bypass capitalization or terminology mismatches
    const localizedStatus = booking.status
      ? booking.status.toLowerCase()
      : "pending";

    if (
      localizedStatus === "approved" ||
      localizedStatus === "confirmed" ||
      localizedStatus === "accepted"
    ) {
      // 🟢 Approved / Confirmed Styling
      badgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
      nextConfirmedVisit = `${booking.date} at ${booking.time}`;
    } else if (localizedStatus === "pending") {
      // 🟡 Pending Styling
      badgeClass = "bg-amber-50 text-amber-700 border border-amber-200";
      pendingCount++;
    } else {
      // 🔴 Declined / Cancelled Styling
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
    // 🎯 Read the slug context value BEFORE wiping data from localStorage
    const contextSlug = localStorage.getItem("clinicSlug") || "default";

    localStorage.clear();
    alert("Logged out safely.");

    // 🚀 Forward dynamically back to their specific clinic context portal entry
    window.location.href = `/patientLogin.html?clinic=${contextSlug}`;
  });
}

// 🚀 Sequential App Initialization Lifecycle
async function initializeDashboard() {
  console.log("⚓ LIVE MONITOR ENGINE ACTIVE:");
  console.log("-> Loaded Patient Hex:", verifiedPatientId);
  console.log("-> Loaded Tenant Hex:", DYNAMIC_CLINIC_ID);

  await fetchClinicName();
  await loadPatientBookings();
}

// Fire system initialization
initializeDashboard();
