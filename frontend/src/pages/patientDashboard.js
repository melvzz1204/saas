// src/pages/dashboard.js

// 1. Protection Guard: Check if user is logged in
const token = localStorage.getItem("token");
const userJson = localStorage.getItem("user");

if (!token || !userJson) {
  // If no credentials exist, boot them back to the login screen immediately
  alert("Unauthorized access. Please log in first.");
  window.location.href = "/index.html";
}

const currentUser = JSON.parse(userJson);

// Extracting the clinic ID dynamically from the user session data!
const DYNAMIC_CLINIC_ID = currentUser.clinicId;

// Elements
const userGreeting = document.getElementById("user-greeting");
if (userGreeting) {
  userGreeting.textContent = `👋 Welcome, ${currentUser.firstName} ${currentUser.lastName}`;
}

const bookingForm = document.getElementById("booking-form");
const bookingsTableBody = document.getElementById("bookings-table-body");
const clinicNameHeading = document.getElementById("clinic-name-heading");

// 2. Fetch clinic metadata directly using our session context
async function fetchClinicName() {
  if (!DYNAMIC_CLINIC_ID) {
    console.error("No clinic context found in user session.");
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
      // Set the navbar title to the real database name (e.g., "Apex Dental Care")
      if (clinicNameHeading) {
        clinicNameHeading.textContent = result.data.name;
      }
      document.title = `${result.data.name} | Patient Dashboard`; // Changes browser tab title too!
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

// Find this section inside loadPatientBookings() in your dashboard.js file:

async function loadPatientBookings() {
  if (!bookingsTableBody) return;

  // 🔄 FIX: Check for both _id and id properties safely!
  const patientId = currentUser._id || currentUser.id;

  // 🛡️ Guard Clause: Prevent hitting the backend if the ID is totally missing
  if (!patientId || patientId === "undefined") {
    console.error(
      "❌ Session Error: Patient unique ID is missing from localStorage user payload.",
    );
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-amber-500 font-semibold">Session Error: Please clear your browser cache and log in again.</td></tr>`;
    return;
  }

  try {
    // 🔄 FIX: Use the validated patientId variable here
    const response = await fetch(
      `http://localhost:5000/api/v1/appointments/patient/${patientId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": DYNAMIC_CLINIC_ID,
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
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-rose-400 italic">Network error connecting to system database.</td></tr>`;
  }
}
// 4. Render database rows inside the UI Table
function renderBookingsList(appointmentsList) {
  bookingsTableBody.innerHTML = "";

  let pendingCount = 0;
  let nextConfirmedVisit = "None Scheduled";

  if (appointmentsList.length === 0) {
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">No appointments found. Use the panel on the left to schedule your first session!</td></tr>`;

    const statPending = document.getElementById("stat-pending");
    const statNextVisit = document.getElementById("stat-next-visit");
    if (statPending) statPending.textContent = "0";
    if (statNextVisit) statNextVisit.textContent = "None Scheduled";
    return;
  }

  appointmentsList.forEach((booking) => {
    let badgeClass = "";
    if (booking.status === "Approved") {
      badgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
      nextConfirmedVisit = `${booking.date} at ${booking.time}`;
    } else if (booking.status === "Pending") {
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
        <span class="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${badgeClass}">
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

// Inside patientDashboard.js -> bookingForm.addEventListener("submit", ...)

if (bookingForm) {
  bookingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const service = document.getElementById("booking-service").value;
    const date = document.getElementById("booking-date").value;
    const time = document.getElementById("booking-time").value;

    const verifiedPatientId = currentUser._id || currentUser.id;

    const payload = {
      patientId: verifiedPatientId, // 💥 This guarantees the key gets populated!
      service,
      date,
      time,
    };

    try {
      const response = await fetch(
        "http://localhost:5000/api/v1/appointments/book",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Clinic-ID": DYNAMIC_CLINIC_ID,
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
        loadPatientBookings(); // Hot-reload table view directly from MongoDB
      } else {
        alert(`❌ Booking Failed: ${result.message}`);
      }
    } catch (error) {
      console.error("Booking Error:", error);
      alert(
        "❌ Could not connect to booking system. Check if server is running.",
      );
    }
  });
}

// 6. Handle Logout (Session Destruction)
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.clear(); // Flush out token, user profile payload, and clinic contexts
    alert("Logged out safely.");
    window.location.href = "/index.html";
  });
}

// Initialize layout data engines on initialization
fetchClinicName();
loadPatientBookings();
