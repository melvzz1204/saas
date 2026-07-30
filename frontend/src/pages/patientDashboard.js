const API_PRICING_URL = "http://localhost:5000/api/v1/dental-price/services";
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

    const services = resData.data;

    if (!services || services.length === 0) {
      if (serviceSelect)
        serviceSelect.innerHTML =
          '<option value="" disabled>No services available</option>';
      if (pricingLedgerBody) {
        pricingLedgerBody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-slate-400 italic">No treatment paths defined.</td></tr>`;
      }
      return;
    }

    if (serviceSelect) {
      serviceSelect.innerHTML = services
        .map((service, index) => {
          const formattedPrice = `₱${Number(service.basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return `<option value="${service.name}" data-price="${formattedPrice}" ${index === 0 ? "selected" : ""}>${service.name}</option>`;
        })
        .join("");

      if (services[0] && formPriceIndicator) {
        const firstPriceFormatted = `₱${Number(services[0].basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        formPriceIndicator.textContent = firstPriceFormatted;
      }
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

// 4. Load Isolated Tenant Bookings (Fixed & Restored)
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

// 5. Submit New Appointment Action
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
// 📅 DYNAMIC TIME SLOT ENGINE (With Same-Day Time Filtering)
// =========================================================================

let slotFetchController = null;

function setupDynamicTimeSlots() {
  const dateInput = document.getElementById("booking-date");
  const timeSelect = document.getElementById("booking-time");
  const submitBtn = document.getElementById("book-btn");

  if (!dateInput || !timeSelect) return;

  // 1. Get exact local date for 'today' in YYYY-MM-DD
  const localToday = new Date();
  const year = localToday.getFullYear();
  const month = String(localToday.getMonth() + 1).padStart(2, "0");
  const day = String(localToday.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  // Block past dates in the calendar input
  dateInput.setAttribute("min", todayStr);
  if (!dateInput.value) dateInput.value = todayStr;

  dateInput.addEventListener("change", async (e) => {
    const selectedDate = e.target.value;

    if (
      !selectedDate ||
      !DYNAMIC_CLINIC_ID ||
      DYNAMIC_CLINIC_ID === "undefined"
    )
      return;

    if (slotFetchController) {
      slotFetchController.abort();
    }
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
        `http://localhost:5000/api/v1/appointments/available-slots?date=${selectedDate}&clinicId=${DYNAMIC_CLINIC_ID}`,
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch slots");
      }

      const data = await response.json();
      let slots = data.slots || [];
      const totalOriginalSlots = slots.length;

      // 🛡️ THE FIX: Same-Day Time Filter
      if (selectedDate === todayStr) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Keep only slots that are in the future
        slots = slots.filter((time24) => {
          const [slotHour, slotMinute] = time24.split(":").map(Number);
          if (currentHour < slotHour) return true;
          if (currentHour === slotHour && currentMinute < slotMinute)
            return true;
          return false;
        });
      }

      timeSelect.innerHTML = "";

      // 🎯 UX: Check if slots were removed because time passed
      if (totalOriginalSlots > 0 && slots.length === 0) {
        timeSelect.innerHTML = `<option value="">Time slots for today have passed.</option>`;
        timeSelect.disabled = true;
      }
      // Normal closed or fully booked state
      else if (slots.length === 0) {
        timeSelect.innerHTML = `<option value="">❌ Fully booked or closed on this date</option>`;
        timeSelect.disabled = true;
      }
      // Render valid slots
      else {
        timeSelect.innerHTML = `<option value="" disabled selected>-- Choose an Available Time --</option>`;

        slots.forEach((time24) => {
          const option = document.createElement("option");
          option.value = time24;
          option.textContent = format12HourTime(time24);
          timeSelect.appendChild(option);
        });

        timeSelect.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      if (err.name === "AbortError") return;

      console.error("Error loading dynamic slots:", err);
      timeSelect.classList.add(
        "border-rose-500",
        "text-rose-600",
        "bg-rose-50",
      );
      timeSelect.innerHTML = `<option value="">⚠️ Network error. Please click the date again.</option>`;
      timeSelect.disabled = true;
      if (submitBtn) submitBtn.disabled = true;

      setTimeout(() => {
        timeSelect.classList.remove(
          "border-rose-500",
          "text-rose-600",
          "bg-rose-50",
        );
      }, 3000);
    }
  });
}

// Quick helper to format times beautifully for patients
function format12HourTime(time24) {
  let [hours, minutes] = time24.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

// 🚀 Unified Sequential App Initialization Lifecycle
async function initializeDashboard() {
  renderGreeting();
  setupAuthButton();

  // Replaced the old initializeBookingCalendar() with the new dynamic engine
  setupDynamicTimeSlots();

  await fetchClinicName();
  await syncDynamicPricingElements();
  await loadPatientBookings();
}

initializeDashboard();

// =========================================================================
// ⚡ REAL-TIME PATIENT PIPELINE REACTION ENGINE
// =========================================================================
const socket = io("http://localhost:5000", {
  transports: ["websocket"],
  upgrade: false,
});

socket.on("pipeline-update", async () => {
  await loadPatientBookings();
});
