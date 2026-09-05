import { fetchPatientHistory } from "../util/clinicalNote.js";

const API_PRICING_URL = "http://localhost:5000/api/v1/dental-price/services";
const API_BASE_URL = "http://localhost:5000";
const token = localStorage.getItem("token");
const userJson = localStorage.getItem("user");

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

const isLoggedIn = !!(
  token &&
  userJson &&
  verifiedPatientId &&
  verifiedPatientId !== "undefined"
);

// DOM Element Registry Links
const userGreeting = document.getElementById("user-greeting");
const bookingForm = document.getElementById("booking-form");
const bookingsTableBody = document.getElementById("bookings-table-body");
const clinicNameHeading = document.getElementById("clinic-name-heading");
const authBtn = document.getElementById("auth-btn");

// 🎯 DYNAMIC WELCOME GREETING
function renderGreeting() {
  if (!userGreeting) return;

  let displayName = "";

  if (isLoggedIn && currentUser?.firstName) {
    displayName =
      `${currentUser.firstName} ${currentUser.lastName || ""}`.trim();
  } else if (
    isLoggedIn &&
    decodedToken?.name &&
    decodedToken.name.toLowerCase() !== "clinica climen"
  ) {
    displayName = decodedToken.name;
  }

  if (!displayName || displayName.toLowerCase() === "clinica climen") {
    displayName = isLoggedIn ? "Valued Patient" : "Guest Patient";
  }

  userGreeting.textContent = `👋 Welcome, ${displayName}`;
}

// 🎯 DYNAMIC NAVIGATION AUTH TOGGLE ENGINE
function setupAuthButton() {
  if (!authBtn) return;

  const contextSlug = localStorage.getItem("clinicSlug") || "default";

  if (isLoggedIn) {
    authBtn.className =
      "inline-flex items-center justify-center px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200/40 text-rose-600 text-xs font-bold rounded-xl tracking-wide transition-all uppercase cursor-pointer shadow-xs active:scale-[0.98]";
    authBtn.innerHTML = `
      <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
      </svg>
      Log Out
    `;

    authBtn.addEventListener("click", () => {
      localStorage.clear();
      alert("Logged out safely.");
      window.location.href = `/clinicHomePage.html?clinic=${contextSlug}`;
    });
  } else {
    authBtn.className =
      "inline-flex items-center justify-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl tracking-wide transition-all uppercase cursor-pointer shadow-md active:scale-[0.98]";
    authBtn.innerHTML = `
      <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h16.5a1.5 1.5 0 001.5-1.5V12a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 12v8.25a1.5 1.5 0 001.5 1.5z" />
      </svg>
      Log In
    `;

    authBtn.addEventListener("click", () => {
      window.location.href = `/clinicHomePage.html?clinic=${contextSlug}`;
    });
  }
}

// 1. Fetch Clinic Meta Context Dynamically
async function fetchClinicName() {
  if (!DYNAMIC_CLINIC_ID || DYNAMIC_CLINIC_ID === "undefined") {
    if (clinicNameHeading)
      clinicNameHeading.textContent = "Dental Clinic Portal";
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/tenants/${DYNAMIC_CLINIC_ID}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const result = await response.json();

    if (response.ok && result.data) {
      if (clinicNameHeading) clinicNameHeading.textContent = result.data.name;
      document.title = `${result.data.name} | Patient Dashboard`;
      if (result.data.slug) {
        localStorage.setItem("clinicSlug", result.data.slug);
      }
    } else if (clinicNameHeading) {
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

    const rawServices = resData.data || [];

    // 🎯 FILTER: Keep only available/active services
    const services = rawServices.filter(
      (s) =>
        s.isAvailable !== false &&
        s.status !== "Inactive" &&
        s.status !== "Disabled",
    );

    if (!services || services.length === 0) {
      if (serviceSelect)
        serviceSelect.innerHTML =
          '<option value="" disabled selected>No active services available for booking</option>';
      if (pricingLedgerBody) {
        pricingLedgerBody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-slate-400 italic">No treatment paths currently available.</td></tr>`;
      }
      return;
    }

    if (serviceSelect) {
      serviceSelect.innerHTML =
        '<option value="" disabled selected>-- Select an available service --</option>' +
        services
          .map((service) => {
            const formattedPrice = `₱${Number(service.basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            return `<option value="${service.name}" data-price="${formattedPrice}">${service.name}</option>`;
          })
          .join("");

      // Update price indicator when selection changes
      serviceSelect.addEventListener("change", (e) => {
        const selectedOption =
          serviceSelect.options[serviceSelect.selectedIndex];
        if (selectedOption && formPriceIndicator) {
          formPriceIndicator.textContent =
            selectedOption.getAttribute("data-price") || "₱0.00";
        }
      });
    }

    if (pricingLedgerBody) {
      pricingLedgerBody.innerHTML = services
        .map((service) => {
          const formattedPrice = `₱${Number(service.basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return `
            <tr class="hover:bg-slate-50/40 transition-colors">
                <td class="py-4 px-5 font-bold text-slate-900">${service.name}</td>
                <td class="py-4 px-5 text-slate-400">${service.description || "No descriptive scope provided."}</td>
                <td class="py-4 px-5 text-right font-black text-slate-900 whitespace-nowrap">${formattedPrice}</td>
            </tr>`;
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

// 3. Render Appointments Table
function renderBookingsList(appointmentsList) {
  if (!bookingsTableBody) return;
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

    if (["approved", "confirmed", "accepted"].includes(localizedStatus)) {
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
      </td>`;
    bookingsTableBody.appendChild(row);
  });

  const statPending = document.getElementById("stat-pending");
  const statNextVisit = document.getElementById("stat-next-visit");
  if (statPending) statPending.textContent = pendingCount;
  if (statNextVisit) statNextVisit.textContent = nextConfirmedVisit;
}

// 4. Load Isolated Tenant Bookings
async function loadPatientBookings() {
  if (!bookingsTableBody) return;

  if (!isLoggedIn) {
    bookingsTableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-10 text-center">
          <div class="flex flex-col items-center justify-center space-y-2.5">
            <span class="text-xl">🔒</span>
            <p class="text-xs font-bold text-slate-700 uppercase tracking-wide">Secure Appointment History Ledger</p>
            <p class="text-[11px] text-slate-400 max-w-xs leading-relaxed -mt-1">
              Please sign in to verify your identity parameters and view your historical scheduled clinic sessions.
            </p>
          </div>
        </td>
      </tr>
    `;

    const statNextVisit = document.getElementById("stat-next-visit");
    if (statNextVisit) statNextVisit.textContent = "Sign In Required";
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/appointments/patient/${verifiedPatientId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": DYNAMIC_CLINIC_ID,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const result = await response.json();
    if (response.ok && (result.data || result.success)) {
      renderBookingsList(result.data || []);
    } else {
      bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">Failed to load appointments history.</td></tr>`;
    }
  } catch (error) {
    console.error("Error connecting to bookings engine:", error);
    bookingsTableBody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-rose-400 italic">Network error connecting to database.</td></tr>`;
  }
}

// 5. Render Full Patient Clinical History Cards (Matches Database Model Schema)
function renderPatientDashboardNotes(notes) {
  const container = document.getElementById("my-history-container");
  if (!container) return;

  if (!Array.isArray(notes) || notes.length === 0) {
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
        ? dateObj.toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "N/A";

      // 2. Doctor Info
      const dentistObj =
        typeof note.dentistId === "object" && note.dentistId !== null
          ? note.dentistId
          : null;
      const dentistName = dentistObj
        ? `Dr. ${dentistObj.firstName || ""} ${dentistObj.lastName || ""}`.trim()
        : "Clinical Provider";
      const specialization = dentistObj?.specialization || "General Dentistry";

      // 3. Next Visit Date (Checks `nextVisitDate`, `nextVisit`, or `followUpDate`)
      const rawNextVisit =
        note.nextVisitDate || note.nextVisit || note.followUpDate;
      let formattedNextVisit = null;

      if (rawNextVisit) {
        const nextDate = new Date(rawNextVisit);
        if (!isNaN(nextDate.getTime())) {
          formattedNextVisit = nextDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          });
        }
      }

      // 4. Treated Teeth Array (`treatedTeeth` or fallback `teeth`)
      const rawTeeth = note.treatedTeeth || note.teeth || [];
      const teethList =
        Array.isArray(rawTeeth) && rawTeeth.length > 0
          ? rawTeeth
              .map((t) => {
                const toothNum =
                  typeof t === "object" ? t.toothNumber || t.id : t;
                return `<span class="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xs">🦷 Tooth ${toothNum}</span>`;
              })
              .join(" ")
          : null;

      return `
      <div class="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4 mb-4">

        <!-- Header -->
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

        <!-- Treated Teeth Badges -->
        ${
          teethList
            ? `
        <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Treated Teeth</span>
          <div class="flex flex-wrap gap-1.5">${teethList}</div>
        </div>`
            : ""
        }

        <!-- Main Details Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">

          <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Chief Complaint</span>
            <p class="text-xs font-medium text-slate-700">${note.chiefComplaint || "N/A"}</p>
          </div>

          <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Treatment Rendered</span>
            <p class="text-xs font-medium text-slate-700">${note.treatmentRendered || "N/A"}</p>
          </div>

          ${
            note.assessment
              ? `
            <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
              <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Assessment / Diagnosis</span>
              <p class="text-xs font-medium text-slate-700">${note.assessment}</p>
            </div>
          `
              : ""
          }

          ${
            note.progressNotes
              ? `
           <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
              <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Progress Notes</span>
              <p class="text-xs font-medium text-slate-700">${note.progressNotes}</p>
            </div>
          `
              : ""
          }

        </div>

        <!-- Doctor's Recommendations -->
        ${
          note.recommendations
            ? `
          <div class="bg-sky-50/70 p-3.5 rounded-xl border border-sky-100/80">
            <span class="block text-[10px] font-black text-sky-600 uppercase tracking-wider mb-1">Doctor's Recommendations</span>
            <p class="text-xs font-medium text-sky-900 italic">${note.recommendations}</p>
          </div>
        `
            : ""
        }

        <!-- Follow-up Visit Banner -->
        ${
          formattedNextVisit
            ? `
          <div class="flex items-center gap-2 text-xs font-bold text-teal-800 bg-teal-50/90 border border-teal-200/70 p-3 rounded-xl shadow-xs">
            <span>📅</span>
            <span>Recommended Follow-up Visit: <strong>${formattedNextVisit}</strong></span>
          </div>
        `
            : ""
        }

      </div>
    `;
    })
    .join("");
}

// 6. Load Clinical History Data
async function loadPatientClinicalHistory() {
  if (!verifiedPatientId) return;

  try {
    const historyData = await fetchPatientHistory(verifiedPatientId);
    renderPatientDashboardNotes(historyData);
  } catch (error) {
    console.error("❌ Error loading clinical history:", error);
  }
}

// 7. Submit New Appointment Action
if (bookingForm) {
  bookingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isLoggedIn) {
      alert(
        "⚠️ Authentication Required: Please log in to book an appointment.",
      );
      return;
    }

    const selectedDateStr = document.getElementById("booking-date").value;
    const selectedTimeStr = document.getElementById("booking-time").value;

    const selectedDateTime = new Date(`${selectedDateStr} ${selectedTimeStr}`);
    if (selectedDateTime < new Date()) {
      alert(
        "⚠️ Booking Window Error: The selected time window has passed. Please pick a future slot.",
      );
      return;
    }

    const payload = {
      patientId: verifiedPatientId,
      dentistId: document.getElementById("booking-dentist").value,
      service: document.getElementById("booking-service").value,
      date: selectedDateStr,
      time: selectedTimeStr,
    };

    try {
      const response = await fetch(
        "http://localhost:5000/api/v1/appointments/book",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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

// =========================================================================
// 📅 DYNAMIC TIME SLOT ENGINE (UPDATED FOR DENTIST SELECTION)
// =========================================================================
let slotFetchController = null;

function setupDynamicTimeSlots() {
  const dateInput = document.getElementById("booking-date");
  const timeSelect = document.getElementById("booking-time");
  const dentistSelect = document.getElementById("booking-dentist"); // ✅ NEW
  const submitBtn = document.getElementById("book-btn");

  if (!dateInput || !timeSelect) return;

  const localToday = new Date();
  const year = localToday.getFullYear();
  const month = String(localToday.getMonth() + 1).padStart(2, "0");
  const day = String(localToday.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  dateInput.setAttribute("min", todayStr);
  if (!dateInput.value) dateInput.value = todayStr;

  // ✅ Cleaned up: Completely hides past hours for today
  const fetchAvailableSlots = async () => {
    const selectedDate = dateInput.value;
    const selectedDentistId = dentistSelect ? dentistSelect.value : null;

    if (
      !selectedDate ||
      !selectedDentistId ||
      !DYNAMIC_CLINIC_ID ||
      DYNAMIC_CLINIC_ID === "undefined"
    ) {
      timeSelect.innerHTML = `<option value="" disabled selected>Please select a dentist and date...</option>`;
      timeSelect.disabled = true;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    if (slotFetchController) slotFetchController.abort();
    slotFetchController = new AbortController();
    const { signal } = slotFetchController;

    try {
      timeSelect.classList.remove(
        "border-rose-500",
        "text-rose-600",
        "bg-rose-50",
      );
      timeSelect.innerHTML = `<option value="">Loading available times... ⏳</option>`;
      timeSelect.disabled = true;
      if (submitBtn) submitBtn.disabled = true;

      const safeToken = token ? token.replace(/['"]+/g, "") : "";

      const response = await fetch(
        `http://localhost:5000/api/v1/appointments/available-slots?date=${selectedDate}&clinicId=${DYNAMIC_CLINIC_ID}&dentistId=${selectedDentistId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${safeToken}`,
            "x-clinic-id": DYNAMIC_CLINIC_ID,
          },
          signal,
        },
      );

      if (!response.ok) throw new Error("Failed to fetch slots");

      const data = await response.json();
      let slots = data.slots || [];
      const bookedSlots = data.bookedSlots || [];

      // 🎯 1. FILTER OUT PAST HOURS (If the user selected today's date)
      const isToday = selectedDate === todayStr;
      if (isToday) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        slots = slots.filter((time24) => {
          const [slotHour, slotMinute] = time24.split(":").map(Number);
          // Keep only future times
          if (currentHour < slotHour) return true;
          if (currentHour === slotHour && currentMinute < slotMinute)
            return true;
          return false; // Drops passed times completely!
        });
      }

      // 🎯 2. RENDER REMAINING SLOTS
      if (slots.length === 0) {
        timeSelect.innerHTML = isToday
          ? `<option value="">❌ All remaining times for today have passed or are full.</option>`
          : `<option value="">❌ Clinic is closed or fully booked on this date.</option>`;
      } else {
        timeSelect.innerHTML = `<option value="" disabled selected>-- Choose an Available Time --</option>`;

        slots.forEach((time24) => {
          const option = document.createElement("option");
          option.value = time24;

          const isBooked = bookedSlots.includes(time24);

          if (isBooked) {
            option.textContent = `${format12HourTime(time24)} (Booked)`;
            option.disabled = true;
          } else {
            option.textContent = format12HourTime(time24);
          }

          timeSelect.appendChild(option);
        });

        timeSelect.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Error loading dynamic slots:", err);
      timeSelect.innerHTML = `<option value="">⚠️ Network error.</option>`;
    }
  };
  // ✅ Trigger fetch when EITHER the date OR the dentist changes
  dateInput.addEventListener("change", fetchAvailableSlots);
  if (dentistSelect) {
    dentistSelect.addEventListener("change", fetchAvailableSlots);
  }
}

function format12HourTime(time24) {
  let [hours, minutes] = time24.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

// 🎯 NEW: Fetch Dentists for the Clinic
async function populateDentistDropdown() {
  const dentistSelect = document.getElementById("booking-dentist");
  if (!dentistSelect || !DYNAMIC_CLINIC_ID) return;

  try {
    // ✅ Pointing to your public route! No token needed since it is public.
    const response = await fetch(
      `http://localhost:5000/api/v1/staff/public/dentists?clinicId=${DYNAMIC_CLINIC_ID}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": DYNAMIC_CLINIC_ID,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Backend Error Details:", errorData);
      throw new Error(
        errorData.message || `Server returned ${response.status}`,
      );
    }

    const result = await response.json();
    // ✅ Adjust result mapping depending on how your backend sends the data back
    const dentists = result.data || result.dentists || result.staff || [];

    if (dentists.length === 0) {
      dentistSelect.innerHTML =
        '<option value="" disabled>No dentists available</option>';
      return;
    }

    dentistSelect.innerHTML =
      '<option value="" disabled selected>-- Choose your Dentist --</option>' +
      dentists
        .map((dentist) => {
          // Grab the correct ID
          const actualId =
            dentist._id ||
            dentist.id ||
            dentist.userId ||
            dentist.staffId ||
            "";

          // ✅ Use fullName exactly as it appears in your database!
          const displayName = dentist.fullName || "Unknown Name";

          return `<option value="${actualId}">Dr. ${displayName}</option>`;
        })
        .join("");
  } catch (error) {
    console.error("Error loading dentists:", error);
    dentistSelect.innerHTML =
      '<option value="" disabled>Error loading providers</option>';
  }
}

// 🚀 Unified Sequential App Initialization Lifecycle
async function initializeDashboard() {
  renderGreeting();
  setupAuthButton();
  setupDynamicTimeSlots();

  await fetchClinicName();
  await syncDynamicPricingElements();
  await loadPatientBookings();
  await loadPatientClinicalHistory();
  await populateDentistDropdown();
}

initializeDashboard();

// 2. Helper to display the Live Approval Banner on the Dashboard
function displayLiveApprovalBanner(appointmentData) {
  const statusTracker = document.getElementById("live-status-tracker");
  const statusMessage = document.getElementById("live-status-message");

  if (!statusTracker || !statusMessage) return;

  const apptDate = appointmentData.date || "today";
  const apptTime = appointmentData.time
    ? format12HourTime(appointmentData.time)
    : "";

  // Format live status message with a clear next step for the patient.
  statusMessage.innerHTML = `<strong>🎉 Appointment Confirmed</strong><br><span class="text-sm">Your visit is booked for <strong>${apptDate}${apptTime ? " at " + apptTime : ""}</strong>. Please arrive a few minutes early and check in at the front desk.</span>`;

  // Highlight steps in the UI tracker
  const stepExpected = document.getElementById("step-expected");
  if (stepExpected) {
    stepExpected.classList.add("text-teal-600", "font-black");
    stepExpected.classList.remove("text-slate-400");
  }

  // Show the tracker container
  statusTracker.classList.remove("hidden");
  statusTracker.classList.add("block");
}

function formatDoctorName(doctorName) {
  let docString = "the doctor";
  if (doctorName && !doctorName.toLowerCase().includes("your doctor")) {
    docString = `<b>Dr. ${doctorName.replace(/^Dr\.\s*/i, "")}</b>`;
  }
  return docString;
}

function triggerLiveStatusBanner(statusType, payload = {}) {
  const tracker = document.getElementById("live-status-tracker");
  const messageEl = document.getElementById("live-status-message");

  if (!tracker || !messageEl) return;

  const rawStatus = (statusType || "").toLowerCase();
  const docString = formatDoctorName(
    payload.doctorName || payload.dentistName || payload.doctor,
  );

  // 🎯 Dynamic Banner Content & Styling
  if (["in-treatment", "in-chair", "ready"].includes(rawStatus)) {
    messageEl.innerHTML = `<strong>🩺 Your Turn Is Ready</strong><br><span class="text-sm">Please proceed to the dental chair. ${docString} is ready to see you.</span>`;
  } else if (["completed", "paid", "payment-successful"].includes(rawStatus)) {
    messageEl.innerHTML = `<strong>✅ Visit Complete</strong><br><span class="text-sm">Thank you for visiting us. Please keep your receipt and follow the care instructions provided by the clinic.</span>`;
  } else if (["in-lobby", "checked-in"].includes(rawStatus)) {
    messageEl.innerHTML = `<strong>🕒 You’re Checked In</strong><br><span class="text-sm">Please make yourself comfortable in the waiting area. ${docString} will call you when the dental chair is ready.</span>`;
  } else {
    // Default / fallback approval notice
    messageEl.innerHTML = `<strong>🔔 Appointment Update</strong><br><span class="text-sm">Your appointment status has changed. Please check with the front desk if you need assistance.</span>`;
  }

  // Clear existing timer if another event fires quickly
  if (trackerDismissTimer) clearTimeout(trackerDismissTimer);

  // Reveal banner with smooth slide-down animation
  tracker.classList.remove("hidden");
  setTimeout(() => {
    tracker.classList.remove("opacity-0", "-translate-y-2");
    tracker.classList.add("opacity-100", "translate-y-0");
  }, 20);

  // Auto-dismiss after 6 seconds
  trackerDismissTimer = setTimeout(() => {
    window.dismissLiveTracker();
  }, 6000);
}
// =========================================================================
// ⚡ REAL-TIME PATIENT PIPELINE & LIVE STATUS ENGINE
// =========================================================================
const socket = io("http://localhost:5000", {
  transports: ["websocket"],
  upgrade: false,
});

let trackerDismissTimer = null;

/**
 * 1. Smoothly Dismiss Tracker Banner
 */
window.dismissLiveTracker = function () {
  const tracker = document.getElementById("live-status-tracker");
  if (!tracker) return;

  if (trackerDismissTimer) {
    clearTimeout(trackerDismissTimer);
    trackerDismissTimer = null;
  }

  // Fade out and slide up
  tracker.classList.remove("opacity-100", "translate-y-0");
  tracker.classList.add("opacity-0", "-translate-y-2");

  setTimeout(() => {
    tracker.classList.add("hidden");
  }, 300);
};

/**
 * 2. Master Dynamic Live Status Banner Engine
 */
function handleLiveStatusUpdate(data) {
  const tracker = document.getElementById("live-status-tracker");
  const messageEl = document.getElementById("live-status-message");
  if (!tracker || !messageEl) return;

  // Extract status and appointment object securely
  const appt = data.appointment || data;
  const status = (
    data.status ||
    data.stage ||
    appt.status ||
    appt.stage ||
    ""
  ).toLowerCase();

  // Extract and format Doctor Name dynamically
  const doctorName =
    appt.doctorName || appt.dentistName || appt.doctor || data.doctorName || "";
  let docString = "the doctor";
  if (doctorName && !doctorName.toLowerCase().includes("your doctor")) {
    docString = `<b>Dr. ${doctorName.replace(/^Dr\.\s*/i, "")}</b>`;
  }

  let customMessage = "";
  let shouldShowBanner = false;

  // 🎯 Map Statuses to Dynamic Banner Messages
  if (
    ["in-treatment", "in-chair", "in_treatment", "ready", "called"].includes(
      status,
    )
  ) {
    customMessage = `<strong>🩺 Your Turn Is Ready</strong><br><span class="text-sm">Please proceed to the dental chair. ${docString} is ready to see you.</span>`;
    shouldShowBanner = true;
  } else if (
    ["completed", "paid", "payment-successful", "payment_received"].includes(
      status,
    )
  ) {
    customMessage = `<strong>✅ Visit Complete</strong><br><span class="text-sm">Thank you for visiting us. Please keep your receipt and follow the care instructions provided by the clinic.</span>`;
    shouldShowBanner = true;
  } else if (["approved", "confirmed", "accepted"].includes(status)) {
    const apptDate = appt.date || "today";
    const apptTime = appt.time ? format12HourTime(appt.time) : "";
    customMessage = `<strong>🎉 Appointment Confirmed</strong><br><span class="text-sm">Your visit is booked for <strong>${apptDate}${apptTime ? " at " + apptTime : ""}</strong>. Please arrive a few minutes early and check in at the front desk.</span>`;
    shouldShowBanner = true;
  } else if (["in-lobby", "checked-in", "in_lobby"].includes(status)) {
    customMessage = `<strong>🕒 You’re Checked In</strong><br><span class="text-sm">Please make yourself comfortable in the waiting area. ${docString} will call you when the dental chair is ready.</span>`;
    shouldShowBanner = true;
  }

  // If status is irrelevant or not mapped, skip banner
  if (!shouldShowBanner) return;

  // Update UI Message Text
  messageEl.innerHTML = customMessage;

  // Reset timer if another update arrives fast
  if (trackerDismissTimer) {
    clearTimeout(trackerDismissTimer);
  }

  // Show banner with smooth CSS slide-down
  tracker.classList.remove("hidden");
  setTimeout(() => {
    tracker.classList.remove("opacity-0", "-translate-y-2");
    tracker.classList.add("opacity-100", "translate-y-0");
  }, 20);

  // Auto-dismiss automatically after 6 seconds
  trackerDismissTimer = setTimeout(() => {
    window.dismissLiveTracker();
  }, 6000);
}

// =========================================================================
// 🔌 SOCKET CONNECT & LISTENERS
// =========================================================================

// Join patient & clinic rooms upon connection
socket.on("connect", () => {
  console.log("🔌 Connected to Socket server:", socket.id);

  if (verifiedPatientId && verifiedPatientId !== "undefined") {
    socket.emit("join-room", verifiedPatientId);
    socket.emit("join-patient-room", verifiedPatientId);
  }

  if (DYNAMIC_CLINIC_ID && DYNAMIC_CLINIC_ID !== "undefined") {
    socket.emit("join-clinic", DYNAMIC_CLINIC_ID);
  }
});

// Listen for targeted appointment status updates
socket.on("status_updated", async (data) => {
  console.log("⚡ Live appointment status update received:", data);

  // Reload appointments list & clinical history automatically
  await loadPatientBookings();
  await loadPatientClinicalHistory();

  // Process live banner update
  handleLiveStatusUpdate(data);
});

// Listen for general pipeline updates from clinic admin actions
socket.on("pipeline-update", async (data) => {
  console.log("⚡ Pipeline update triggered:", data);

  // Reload appointments list & clinical history automatically
  await loadPatientBookings();
  await loadPatientClinicalHistory();

  // Process live banner update
  handleLiveStatusUpdate(data);
});
