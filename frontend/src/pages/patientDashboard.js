import { fetchPatientHistory } from "../util/clinicalNote.js";

const API_PRICING_URL = window.apiUrl("/api/v1/dental-price/services");
const API_BASE_URL = window.ApiBase;
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

const rawClinicId = currentUser.clinicId || decodedToken?.clinicId || "";
const DYNAMIC_CLINIC_ID = ["", "null", "undefined"].includes(
  String(rawClinicId).trim().toLowerCase(),
)
  ? ""
  : String(rawClinicId).trim();
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
const appointmentsCards = document.getElementById("appointments-cards");
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
      const redirectHome = () => {
        window.location.href = `/clinicHomePage.html?clinic=${contextSlug}`;
      };
      if (window.Toast) {
        window.Toast.info("You have been logged out safely.");
        // Give the toast a moment before navigation so it is actually seen.
        setTimeout(redirectHome, 900);
      } else {
        redirectHome();
      }
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
  if (!DYNAMIC_CLINIC_ID) {
    if (clinicNameHeading)
      clinicNameHeading.textContent = "Dental Clinic Portal";
    return;
  }

  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/tenants/${DYNAMIC_CLINIC_ID}`),
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
    const { data: resData } = await AppFeedback.request(API_PRICING_URL);

    if (!resData?.success)
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
    console.error("Patient pricing request failed", err);
    if (pricingLedgerBody) {
      pricingLedgerBody.innerHTML = `
        <tr><td colspan="3" class="py-6 text-center text-rose-700 font-semibold bg-rose-50/40">
          We couldn't load treatment information right now.<br>
          <button type="button" id="retry-pricing" class="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs text-white">Try again</button>
        </td></tr>`;
      document
        .getElementById("retry-pricing")
        ?.addEventListener("click", syncDynamicPricingElements);
    }
    AppFeedback?.announce(
      AppFeedback.safeMessage(err, err.status ? { status: err.status } : null),
      "error",
    );
  }
}

// 3. Render Appointments as Rich Cards
function getAppointmentStatusBadge(status) {
  const s = status ? status.toLowerCase() : "pending";
  if (["approved", "confirmed", "accepted"].includes(s)) {
    return {
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      label: status || "Approved",
    };
  }
  if (["pending"].includes(s)) {
    return {
      cls: "bg-amber-50 text-amber-700 border border-amber-200",
      label: status || "Pending",
    };
  }
  if (["cancelled", "missed"].includes(s)) {
    return {
      cls: "bg-slate-100 text-slate-600 border border-slate-200",
      label: s === "missed" ? "Missed" : "Cancelled",
    };
  }
  if (["completed", "done"].includes(s)) {
    return {
      cls: "bg-sky-50 text-sky-700 border border-sky-200",
      label: "Completed",
    };
  }
  return {
    cls: "bg-rose-50 text-rose-700 border border-rose-200",
    label: status || "Unknown",
  };
}

function formatCurrency(value) {
  const num = Number(value || 0);
  return `₱${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAppointmentDateTime(dateStr, timeStr) {
  // `date` is stored as YYYY-MM-DD — format directly to avoid timezone shifts.
  const fmt = (raw) => {
    const str = String(raw || "");
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }
    return str || "TBD";
  };
  const timeFmt = (t) => {
    if (!t) return "";
    const [h, m] = String(t).split(":").map(Number);
    if (isNaN(h)) return t;
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = h % 12 || 12;
    return `${hh}:${String(m || 0).padStart(2, "0")} ${ampm}`;
  };
  return { date: fmt(dateStr), time: timeFmt(timeStr) };
}

function renderDoctorName(booking) {
  const d = booking.dentistId;
  if (!d) return "To be assigned";
  if (typeof d === "object") {
    if (d.fullName) return `Dr. ${d.fullName}`;
    const n = `${d.firstName || ""} ${d.lastName || ""}`.trim();
    return n ? `Dr. ${n}` : "To be assigned";
  }
  return booking.dentistName || "To be assigned";
}

function renderBookingsList(appointmentsList) {
  const container = appointmentsCards;
  if (!container) return;

  container.innerHTML = "";
  const statPending = document.getElementById("stat-pending");
  const statNextVisit = document.getElementById("stat-next-visit");
  const statBalance = document.getElementById("stat-balance");

  let pendingCount = 0;
  let totalBalance = 0;
  let nextConfirmedVisit = "None Scheduled";

  if (!appointmentsList || appointmentsList.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-14 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white space-y-3">
        <span class="text-4xl" aria-hidden="true">🗓️</span>
        <p class="text-sm font-bold text-slate-700">No appointments found</p>
        <p class="text-xs text-slate-500">Use the Book Appointment panel to schedule your first session.</p>
      </div>`;
    if (statPending) statPending.textContent = "0";
    if (statNextVisit) statNextVisit.textContent = "None Scheduled";
    if (statBalance) statBalance.textContent = formatCurrency(0);
    return;
  }

  const statusOrder = ["Pending", "Approved", "checked-in", "in-treatment"];
  const sorted = [...appointmentsList].sort((a, b) => {
    const ai = statusOrder.indexOf(a.status);
    const bi = statusOrder.indexOf(b.status);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  sorted.forEach((booking) => {
    const badge = getAppointmentStatusBadge(booking.status);
    const dt = formatAppointmentDateTime(booking.date, booking.time);
    const billing = booking.billing || {};
    const amount = Number(billing.amount || 0);
    const unpaid = billing.status === "unpaid";
    if (unpaid) totalBalance += amount;

    const s = booking.status ? booking.status.toLowerCase() : "pending";
    if (["approved", "confirmed", "accepted"].includes(s)) {
      nextConfirmedVisit = `${booking.date} at ${booking.time}`;
    }
    if (s === "pending") pendingCount++;

    const cancellable = ![
      "completed",
      "done",
      "cancelled",
      "missed",
    ].includes(s);
    const reschedulable = cancellable;

    const card = document.createElement("div");
    card.className =
      "bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col gap-4 hover:border-teal-200 transition-colors";

    card.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Service</span>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${badge.cls}">${badge.label}</span>
          </div>
          <h3 class="text-base font-black text-slate-900">${booking.service || "General Consultation"}</h3>
          <p class="text-xs text-slate-500 mt-0.5">${renderDoctorName(booking)}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm font-black text-slate-800">${dt.date}</p>
          <p class="text-xs font-bold text-teal-700">${dt.time}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
        <div>
          <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
          <p class="text-xs font-bold text-slate-700 mt-0.5 capitalize">${badge.label}</p>
        </div>
        <div>
          <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</span>
          <p class="text-xs font-bold text-slate-700 mt-0.5">${formatCurrency(amount)}</p>
        </div>
        <div>
          <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment</span>
          <p class="mt-0.5">
            ${
              unpaid
                ? `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">● Unpaid</span>`
                : `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">● Settled</span>`
            }
          </p>
        </div>
      </div>

      ${
        (unpaid || cancellable || reschedulable)
          ? `<div class="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
              ${
                unpaid
                  ? `<span class="inline-flex items-center text-[11px] font-bold text-indigo-700"><span aria-hidden="true">💳</span>&nbsp;Please settle at the front desk</span>`
                  : ""
              }
              ${
                reschedulable
                  ? `<button type="button" data-resched-id="${booking._id}" data-service="${escAttr(booking.service || "")}" class="btn-rs btn-base text-xs px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">Reschedule</button>`
                  : ""
              }
              ${
                cancellable
                  ? `<button type="button" data-cancel-id="${booking._id}" class="btn-cx btn-base text-xs px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100">Cancel</button>`
                  : ""
              }
            </div>`
          : ""
      }
    `;

    container.appendChild(card);
  });

  if (statPending) statPending.textContent = String(pendingCount);
  if (statNextVisit) statNextVisit.textContent = nextConfirmedVisit;
  if (statBalance) statBalance.textContent = formatCurrency(totalBalance);

  bindAppointmentActions();
}

function escAttr(value) {
  return String(value === null || value === undefined ? "" : value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ]),
  );
}

// ────────────────────────────────────────────────
// APPOINTMENT SELF-SERVICE: RESCHEDULE / CANCEL
// ────────────────────────────────────────────────
async function cancelAppointmentById(appointmentId) {
  const confirmed = window.confirm(
    "Are you sure you want to cancel this appointment? This action cannot be undone.",
  );
  if (!confirmed) return;

  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/appointments/${appointmentId}/cancel`),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": DYNAMIC_CLINIC_ID,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Unable to cancel appointment.");

    window.Toast?.success("Your appointment has been cancelled.");
    await loadPatientBookings();
  } catch (error) {
    console.error("Cancel appointment failed:", error);
    window.Toast?.error(error.message);
  }
}

function showRescheduleDialog(appointmentId, serviceName) {
  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Reschedule appointment");

  // Build a date+time picker using the same clinic logic
  const picker = buildReschedulePicker(appointmentId, serviceName, overlay);

  overlay.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
      <div class="p-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-black text-slate-900 uppercase tracking-wider">Reschedule Appointment</h3>
          <p class="text-xs text-slate-500 mt-0.5">${escAttr(serviceName || "Appointment")}</p>
        </div>
        <button type="button" class="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-200/60" aria-label="Close">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="p-5">${picker}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("button[aria-label='Close']").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  initReschedulePicker(overlay, appointmentId);
}

// Builds the inner reschedule picker markup (date calendar + time dropdown)
function buildReschedulePicker(appointmentId, serviceName, overlay) {
  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const now = new Date();
  let nav = new Date(now.getFullYear(), now.getMonth(), 1);
  let chosenDate = "";

  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return `
    <div class="space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-black text-slate-800 uppercase tracking-wide" data-rs-cal-label>${monthNames[nav.getMonth()]} ${nav.getFullYear()}</span>
          <div class="flex space-x-1">
            <button type="button" data-rs-prev class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer" aria-label="Previous month">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
            </button>
            <button type="button" data-rs-next class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer" aria-label="Next month">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
          <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-sm" data-rs-grid></div>
      </div>
      <div>
        <label class="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Time</label>
        <select data-rs-time class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all cursor-pointer" disabled>
          <option value="">Select a date first...</option>
        </select>
      </div>
      <div data-rs-error class="hidden text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3" role="alert"></div>
      <button type="button" data-rs-submit class="btn-base w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold py-3 rounded-xl uppercase tracking-wider" disabled>Confirm New Time</button>
    </div>
  `;
}

function initReschedulePicker(overlay, appointmentId) {
  const grid = overlay.querySelector("[data-rs-grid]");
  const label = overlay.querySelector("[data-rs-cal-label]");
  const prevBtn = overlay.querySelector("[data-rs-prev]");
  const nextBtn = overlay.querySelector("[data-rs-next]");
  const timeSelect = overlay.querySelector("[data-rs-time]");
  const errorEl = overlay.querySelector("[data-rs-error]");
  const submitBtn = overlay.querySelector("[data-rs-submit]");

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let nav = new Date(today.getFullYear(), today.getMonth(), 1);
  let chosenDate = "";

  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  function renderGrid() {
    label.textContent = `${monthNames[nav.getMonth()]} ${nav.getFullYear()}`;
    grid.innerHTML = "";
    const firstDay = new Date(nav.getFullYear(), nav.getMonth(), 1).getDay();
    const totalDays = new Date(nav.getFullYear(), nav.getMonth() + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement("div"));

    for (let day = 1; day <= totalDays; day++) {
      const cellDate = new Date(nav.getFullYear(), nav.getMonth(), day);
      const cellStr = fmtDate(cellDate);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = day;
      btn.className =
        "py-1.5 rounded-lg transition-all text-center cursor-pointer select-none focus:outline-none " +
        (cellDate < today
          ? "text-slate-200 cursor-not-allowed pointer-events-none"
          : cellStr === chosenDate
            ? "bg-teal-600 text-white scale-105 shadow-xs"
            : "text-slate-700 hover:bg-slate-200/70");
      if (cellDate >= today) {
        btn.addEventListener("click", () => {
          chosenDate = cellStr;
          timeSelect.innerHTML = `<option value="">Loading available times...</option>`;
          timeSelect.disabled = true;
          submitBtn.disabled = true;
          renderGrid();
          loadRescheduleSlots(cellStr);
        });
      }
      grid.appendChild(btn);
    }
  }

  async function loadRescheduleSlots(dateStr) {
    if (errorEl) errorEl.classList.add("hidden");
    // Reuse the patient's currently selected dentist for slot availability
    const dentistId = document.getElementById("booking-dentist")?.value || "";
    try {
      const url = window.apiUrl(`/api/v1/appointments/available-slots?date=${dateStr}&clinicId=${DYNAMIC_CLINIC_ID}&dentistId=${dentistId}`);
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": DYNAMIC_CLINIC_ID,
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load slots");
      const slots = data.slots || [];
      const booked = data.bookedSlots || [];
      const available = data.availableSlots || data.slots || [];

      timeSelect.innerHTML = "";

      if (!slots.length) {
        timeSelect.innerHTML = `<option value="">No available slots on this date.</option>`;
        timeSelect.disabled = true;
        submitBtn.disabled = true;
        return;
      }

      const isToday = dateStr === fmtDate(new Date());
      const now = new Date();
      const freeSlots = slots.filter((t) => {
        if (booked.includes(t)) return false;
        if (isToday) {
          const [h, m] = t.split(":").map(Number);
          if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))
            return false;
        }
        return true;
      });

      if (!freeSlots.length) {
        timeSelect.innerHTML = `<option value="">No remaining slots for this date.</option>`;
        timeSelect.disabled = true;
        submitBtn.disabled = true;
        return;
      }

      timeSelect.innerHTML = `<option value="" disabled selected>-- Choose a Time --</option>`;
      freeSlots.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = format12HourTime(t);
        timeSelect.appendChild(opt);
      });
      timeSelect.disabled = false;
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = e.message || "Could not load available times.";
        errorEl.classList.remove("hidden");
      }
      timeSelect.innerHTML = "";
      timeSelect.disabled = true;
      submitBtn.disabled = true;
    }
  }

  timeSelect.addEventListener("change", () => {
    submitBtn.disabled = !timeSelect.value;
  });

  submitBtn.addEventListener("click", async () => {
    const newTime = timeSelect.value;
    if (!chosenDate || !newTime) return;
    const dentistId = document.getElementById("booking-dentist")?.value || "";
    try {
      const res = await fetch(
        window.apiUrl(`/api/v1/appointments/${appointmentId}/reschedule`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-clinic-id": DYNAMIC_CLINIC_ID,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ date: chosenDate, time: newTime, dentistId }),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Reschedule failed.");
      window.Toast?.success("Your appointment has been rescheduled and is pending approval.");
      overlay.remove();
      await loadPatientBookings();
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = e.message;
        errorEl.classList.remove("hidden");
      } else {
        window.Toast?.error(e.message);
      }
    }
  });

  prevBtn.addEventListener("click", () => {
    if (nav.getMonth() === today.getMonth() && nav.getFullYear() === today.getFullYear()) return;
    nav = new Date(nav.getFullYear(), nav.getMonth() - 1, 1);
    renderGrid();
  });
  nextBtn.addEventListener("click", () => {
    nav = new Date(nav.getFullYear(), nav.getMonth() + 1, 1);
    renderGrid();
  });

  renderGrid();
}

function bindAppointmentActions() {
  document.querySelectorAll(".btn-cx").forEach((btn) => {
    btn.removeEventListener("click", onCancelClick);
    btn.addEventListener("click", onCancelClick);
  });
  document.querySelectorAll(".btn-rs").forEach((btn) => {
    btn.removeEventListener("click", onRescheduleClick);
    btn.addEventListener("click", onRescheduleClick);
  });
}

function onCancelClick(e) {
  const id = e.currentTarget.getAttribute("data-cancel-id");
  if (id) cancelAppointmentById(id);
}

function onRescheduleClick(e) {
  const id = e.currentTarget.getAttribute("data-resched-id");
  const service = e.currentTarget.getAttribute("data-service");
  if (id) showRescheduleDialog(id, service);
}

// 4. Load Isolated Tenant Bookings
async function loadPatientBookings() {
  if (!appointmentsCards && !bookingsTableBody) return;

  if (!isLoggedIn) {
    const container = appointmentsCards || bookingsTableBody;
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-14 text-center space-y-3">
        <span class="text-3xl" aria-hidden="true">🔒</span>
        <p class="text-sm font-bold text-slate-700 uppercase tracking-wide">Secure Appointment History Ledger</p>
        <p class="text-xs text-slate-500 max-w-xs leading-relaxed">
          Please sign in to verify your identity and view your scheduled clinic sessions.
        </p>
      </div>
    `;

    const statNextVisit = document.getElementById("stat-next-visit");
    const statBalance = document.getElementById("stat-balance");
    if (statNextVisit) statNextVisit.textContent = "Sign In Required";
    if (statBalance) statBalance.textContent = "—";
    return;
  }

  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/appointments/patient/${verifiedPatientId}`),
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

    if (response.status === 401 || response.status === 403) {
      const container = appointmentsCards || bookingsTableBody;
      container.innerHTML = renderAppointmentMessage(
        response.status === 401
          ? "Please sign in again to view your appointments."
          : "You don't have permission to view these appointments.",
      );
      return;
    }
    if (response.ok && (result.data || result.success)) {
      renderBookingsList(result.data || []);
    } else {
      const container = appointmentsCards || bookingsTableBody;
      container.innerHTML = renderAppointmentMessage(
        "We couldn't load your appointments right now.",
      );
      document
        .getElementById("retry-bookings")
        ?.addEventListener("click", loadPatientBookings);
    }
  } catch (error) {
    console.error("Patient appointments request failed", error);
    const container = appointmentsCards || bookingsTableBody;
    container.innerHTML = renderAppointmentMessage(
      "We couldn't load your appointments right now.",
    );
    document
      .getElementById("retry-bookings")
      ?.addEventListener("click", loadPatientBookings);
    AppFeedback?.announce(
      AppFeedback.safeMessage(
        error,
        error.status ? { status: error.status } : null,
      ),
      "error",
    );
  }
}

function renderAppointmentMessage(message) {
  return `
    <div class="flex flex-col items-center justify-center py-14 text-center space-y-3">
      <span class="text-3xl" aria-hidden="true">🗓️</span>
      <p class="text-sm font-bold text-slate-700">${message}</p>
      <button type="button" id="retry-bookings"
        class="btn-base text-xs px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl">Try again</button>
    </div>`;
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
      let dentistName = dentistObj?.fullName || "";
      if (!dentistName) {
        dentistName = `${dentistObj?.firstName || ""} ${dentistObj?.lastName || ""}`.trim();
      }
      if (dentistName) {
        dentistName = dentistName.toLowerCase().startsWith("dr.")
          ? dentistName
          : `Dr. ${dentistName}`;
      } else {
        dentistName = "Clinical Provider";
      }
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
      window.Toast?.warning("Please log in to book an appointment.");
      return;
    }

    const selectedDateStr = document.getElementById("booking-date").value;
    const selectedTimeStr = document.getElementById("booking-time").value;

    const selectedDateTime = new Date(`${selectedDateStr} ${selectedTimeStr}`);
    if (selectedDateTime < new Date()) {
      window.Toast?.warning(
        "The selected time window has passed. Please pick a future slot.",
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
        window.apiUrl("/api/v1/appointments/book"),
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
        window.Toast?.success(
          "Appointment request submitted! Awaiting administrator approval.",
        );
        bookingForm.reset();
        await loadPatientBookings();
      } else {
        window.Toast?.error(`Booking failed: ${result.message}`);
      }
    } catch (error) {
      console.error("Booking Error:", error);
      window.Toast?.error("Could not connect to the booking system.");
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

    if (!selectedDate || !selectedDentistId || !DYNAMIC_CLINIC_ID) {
      timeSelect.innerHTML = `<option value="" disabled selected>Please select a dentist and date...</option>`;
      timeSelect.disabled = true;
      if (submitBtn) submitBtn.disabled = true;
      const fullyBookedNotice = document.getElementById("fully-booked-notice");
      const afterHoursNotice = document.getElementById("after-hours-notice");
      if (fullyBookedNotice) fullyBookedNotice.classList.add("hidden");
      if (afterHoursNotice) afterHoursNotice.classList.add("hidden");
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
        window.apiUrl(`/api/v1/appointments/available-slots?date=${selectedDate}&clinicId=${DYNAMIC_CLINIC_ID}&dentistId=${selectedDentistId}`),
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
      const availableSlots = data.availableSlots || [];

      // 🚫 Detect if this dentist is fully booked for the selected date
      const fullyBooked =
        data.fullyBooked === true ||
        (slots.length > 0 &&
          Array.isArray(availableSlots) &&
          availableSlots.length === 0);

      const fullyBookedNotice = document.getElementById("fully-booked-notice");
      const afterHoursNotice = document.getElementById("after-hours-notice");
      if (fullyBookedNotice) fullyBookedNotice.classList.add("hidden");
      if (afterHoursNotice) afterHoursNotice.classList.add("hidden");

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

      // 🚫 FULLY BOOKED: Render every slot as unavailable and show the notice
      if (fullyBooked && slots.length > 0) {
        timeSelect.innerHTML = `<option value="" disabled selected>-- Choose an Available Time --</option>`;
        slots.forEach((time24) => {
          const option = document.createElement("option");
          option.value = time24;
          option.textContent = `${format12HourTime(time24)} (Booked)`;
          option.disabled = true;
          timeSelect.appendChild(option);
        });
        timeSelect.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        if (fullyBookedNotice) fullyBookedNotice.classList.remove("hidden");
        return;
      }

      // 🎯 2. RENDER REMAINING SLOTS
      if (slots.length === 0) {
        timeSelect.innerHTML = isToday
          ? `<option value="">❌ All remaining times for today have passed or are full.</option>`
          : `<option value="">❌ Clinic is closed or fully booked on this date.</option>`;
        timeSelect.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        if (afterHoursNotice) afterHoursNotice.classList.remove("hidden");
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
      window.apiUrl(`/api/v1/staff/public/dentists?clinicId=${DYNAMIC_CLINIC_ID}`),
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
const socket = io(window.socketUrl(), {
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

  if (DYNAMIC_CLINIC_ID) {
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

// =========================================================================
// ⭐ PATIENT REVIEW / TESTIMONIAL SUBMISSION MODULE
// =========================================================================
let reviewModuleBound = false;

function renderStarRating(rating) {
  document
    .querySelectorAll("#review-star-input .review-star")
    .forEach((star) => {
      const starValue = Number(star.dataset.rating);
      star.textContent = starValue <= rating ? "★" : "☆";
      star.className = `review-star text-3xl leading-none transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md p-0.5 ${
        starValue <= rating
          ? "text-amber-500"
          : "text-slate-300 hover:text-amber-400"
      }`;
    });
}

function showReviewFeedback(message, type = "error") {
  const feedback = document.getElementById("review-form-feedback");
  if (!feedback) return;
  feedback.classList.remove("hidden");
  feedback.className = `p-3 rounded-xl border text-xs font-semibold ${
    type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-rose-50 border-rose-200 text-rose-700"
  }`;
  feedback.textContent = message;
  AppFeedback?.announce(message, type === "success" ? "status" : "error");
}

// Load the patient's existing submissions and render their status cards.
async function loadPatientReviewStatus() {
  const form = document.getElementById("review-form");
  const existingCard = document.getElementById("review-existing-card");
  if (!form || !existingCard) return;

  if (!isLoggedIn) {
    form.classList.remove("hidden");
    existingCard.classList.add("hidden");
    existingCard.innerHTML = `
      <div class="flex flex-col items-center text-center p-4">
        <span class="text-2xl mb-2">🔒</span>
        <p class="text-xs font-bold text-slate-700 uppercase tracking-wide">Sign in required</p>
        <p class="text-[11px] text-slate-400 mt-1">Please sign in to share your feedback.</p>
      </div>`;
    return;
  }

  if (!DYNAMIC_CLINIC_ID) {
    showReviewFeedback(
      "Clinic context is missing. Please sign out and sign back in.",
      "error",
    );
    return;
  }

  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/clinics/${encodeURIComponent(
        DYNAMIC_CLINIC_ID,
      )}/testimonials/mine`),
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
    if (!response.ok)
      throw new Error(result.message || `HTTP ${response.status}`);

    const existing = result.data || [];
    if (!existing || existing.length === 0) {
      form.classList.remove("hidden");
      existingCard.classList.add("hidden");
      return;
    }

    // Multiple submissions found — show them all. Keep the form visible.
    form.classList.remove("hidden");
    existingCard.classList.remove("hidden");
    existingCard.innerHTML = `
      <div class="space-y-4">
        <p class="text-xs font-black text-slate-800 uppercase tracking-wider">Your previous reviews (${existing.length})</p>
        ${existing
          .map(
            (item) => `
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-amber-500 text-sm" aria-hidden="true">${"★".repeat(item.rating)}${"☆".repeat(5 - item.rating)}</span>
              <span class="text-xs font-bold text-slate-700">${item.rating}/5</span>
              ${item.isAnonymous ? '<span class="text-[10px] font-semibold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-md">Anonymous</span>' : ''}
            </div>
            <blockquote class="text-sm italic text-slate-600">"${item.reviewText}"</blockquote>
            <p class="text-[10px] text-slate-400">${new Date(item.reviewedAt || item.createdAt).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
          </div>
        `,
          )
          .join("")}
      </div>
      <p class="text-[11px] text-slate-400 mt-2">You can submit additional reviews below.</p>`;
  } catch (error) {
    console.error("Unable to load your testimonial status:", error);
    showReviewFeedback(
      AppFeedback?.safeMessage
        ? AppFeedback.safeMessage(
            error,
            error.status ? { status: error.status } : null,
          )
        : "Unable to load your review status. Please try again.",
      "error",
    );
  }
}

// Called every time the Reviews tab is opened (bound once, status refreshed each time).
window.loadPatientReviewModule = function () {
  const form = document.getElementById("review-form");
  if (!form) return;

  if (!reviewModuleBound) {
    reviewModuleBound = true;

    // ── 1. Star rating input ────────────────────────────────────────────
    const starButtons = document.querySelectorAll(
      "#review-star-input .review-star",
    );
    const ratingInput = document.getElementById("review-rating");
    const ratingHint = document.getElementById("review-rating-hint");
    starButtons.forEach((star) => {
      star.addEventListener("click", () => {
        const rating = Number(star.dataset.rating);
        if (ratingInput) ratingInput.value = rating;
        renderStarRating(rating);
        if (ratingHint)
          ratingHint.textContent = `${rating} star${rating > 1 ? "s" : ""} selected`;
        AppFeedback?.clearFieldError(ratingInput);
      });
    });

    // ── 2. Character counter ────────────────────────────────────────────
    const textarea = document.getElementById("review-text");
    const counter = document.getElementById("review-char-counter");
    textarea?.addEventListener("input", () => {
      if (counter)
        counter.textContent = `${textarea.value.length} / 1000 characters`;
    });

    // ── 3. Submit handler ───────────────────────────────────────────────
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const feedback = document.getElementById("review-form-feedback");
      if (feedback) feedback.classList.add("hidden");

      const rating = Number(ratingInput?.value || 0);
      const reviewText = (textarea?.value || "").trim();
      const isAnonymous =
        document.getElementById("review-anonymous")?.checked === true;
      const submitBtn = document.getElementById("review-submit-btn");

      // Client-side validation mirrors the backend rules
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        AppFeedback?.showFieldError(
          ratingInput,
          "Please select a star rating from 1 to 5.",
        );
        showReviewFeedback(
          "Please select a star rating from 1 to 5 before submitting.",
        );
        document.getElementById("review-star-input")?.focus();
        return;
      }
      if (reviewText.length < 10) {
        AppFeedback?.showFieldError(
          textarea,
          "Please write at least 10 characters of feedback.",
        );
        showReviewFeedback("Please write at least 10 characters of feedback.");
        textarea?.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
      }

      try {
        const response = await fetch(
          window.apiUrl(`/api/v1/clinics/${encodeURIComponent(
            DYNAMIC_CLINIC_ID,
          )}/testimonials`),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-clinic-id": DYNAMIC_CLINIC_ID,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ rating, reviewText, isAnonymous }),
          },
        );

        const result = await response.json();

        if (!response.ok)
          throw new Error(result.message || `HTTP ${response.status}`);

        showReviewFeedback(
          result.message || "Thank you for your feedback!",
          "success",
        );
        form.reset();
        renderStarRating(0);
        if (ratingInput) ratingInput.value = "";
        if (counter) counter.textContent = "0 / 1000 characters";
        if (ratingHint)
          ratingHint.textContent = "Tap a star to rate your visit";

        // Refresh the status to show the new review
        await loadPatientReviewStatus();
      } catch (error) {
        console.error("Review submission failed:", error);
        showReviewFeedback(
          AppFeedback?.safeMessage
            ? AppFeedback.safeMessage(
                error,
                error.status ? { status: error.status } : null,
              )
            : "Unable to submit your review right now. Please try again.",
          "error",
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Review";
        }
      }
    });
  }

  // Refresh the existing-submission status every time the tab opens
  loadPatientReviewStatus();
};

// If the patient arrived via #reviews (landing page "Share your experience"),
// open the tab once the module has loaded.
if (window.location.hash === "#reviews" && typeof switchTab === "function") {
  switchTab("tab-reviews");
}
