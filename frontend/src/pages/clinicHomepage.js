// /src/pages/clinicHomepage.js

const API_BASE_URL = window.location.origin.includes("localhost")
  ? "http://localhost:5000"
  : window.location.origin;

const URL_PARAMS = new URLSearchParams(window.location.search);
const CLINIC_SLUG =
  URL_PARAMS.get("clinic") || localStorage.getItem("clinicSlug");

let cachedServices = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!CLINIC_SLUG) {
    showHomepageError("No clinic specified in URL parameter (?clinic=slug).");
    updateMatrixStatus("Error: Missing clinic workspace parameter.");
    return;
  }

  localStorage.setItem("clinicSlug", CLINIC_SLUG);

  // 1. Fetch tenant metadata (if required for header context)
  await fetchTenantMetadata(CLINIC_SLUG);

  // 2. Fetch treatment catalog directly from /api/v1/dental-price/services
  await fetchServicesCatalog();

  // 3. Bind UI auth and actions
  setupDynamicAuthControls();
  bindActionButtons();
});

// =========================================================================
// 🌐 1. TENANT METADATA
// =========================================================================
async function fetchTenantMetadata(slug) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/tenants/slug/${slug}`);
    if (!response.ok) return;

    const result = await response.json();
    const tenantData = result.data || result;

    if (tenantData?._id) {
      localStorage.setItem("clinicId", tenantData._id);
    }

    updateDOMText("clinic-name-header", tenantData.name || "Dental Practice");
    updateDOMText(
      "clinic-hero-title",
      tenantData.name || "Your Trusted Dental Clinic",
    );
    updateDOMText(
      "clinic-description",
      tenantData.description || "Providing high-quality dental care.",
    );

    document.title = `${tenantData.name || "Clinic"} | Treatment Catalogue & Pricing`;
  } catch (error) {
    console.warn("⚠️ Clinic lookup notice:", error.message);
  }
}

// =========================================================================
// 💎 PRICING MATRIX & SESSION ESTIMATOR ENGINE
// =========================================================================
async function fetchServicesCatalog() {
  const clinicId = localStorage.getItem("clinicId");

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (clinicId) headers["x-clinic-id"] = clinicId;
  if (CLINIC_SLUG) headers["x-clinic-slug"] = CLINIC_SLUG;

  const endpoint = `${API_BASE_URL}/api/v1/dental-price/services`;

  try {
    const response = await fetch(endpoint, { method: "GET", headers });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }

    const json = await response.json();

    if (json.success && Array.isArray(json.data)) {
      cachedServices = json.data;

      console.log(
        `✅ Loaded ${cachedServices.length} treatment tracks into memory.`,
      );

      if (cachedServices.length === 0) {
        updateMatrixStatus(
          "No service tracks currently registered in practice ledger.",
        );
        updateEstimatorDropdownState("No treatments available");
        return;
      }

      // 1. Render Pricing Table
      renderTreatmentMatrix(cachedServices);
      setupMatrixSearch();

      // 2. Populate Interactive Session Estimator Dropdown
      populateSessionEstimator(cachedServices);
    } else {
      throw new Error(json.message || "Invalid payload format.");
    }
  } catch (error) {
    console.error("❌ Services Fetch Error:", error);
    updateMatrixStatus(`Unable to sync treatment ledger: ${error.message}`);
    updateEstimatorDropdownState("Failed to load treatments");
  }
}

// -------------------------------------------------------------------------
// 📊 MATRIX TABLE RENDERER
// -------------------------------------------------------------------------
function renderTreatmentMatrix(services) {
  const tableBody = document.getElementById("treatment-matrix-body");
  if (!tableBody) return;

  if (services.length === 0) {
    updateMatrixStatus("No matching treatments found.");
    return;
  }

  tableBody.innerHTML = services
    .map((service) => {
      // Maps basePricePhp from Mongoose schema projection
      const formattedPrice = `₱${Number(
        service.basePricePhp || 0,
      ).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      // Formatting slug into readable category label
      const categoryLabel = service.slug
        ? service.slug.replace(/-/g, " ")
        : "GENERAL SERVICE";

      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <!-- SERVICE CATEGORY & NAME -->
        <td class="py-4 px-6">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-0.5">
            ${categoryLabel}
          </span>
          <span class="font-bold text-slate-800 text-sm">
            ${service.name || "Treatment Track"}
          </span>
        </td>

        <!-- CLINICAL TREATMENT SCOPE -->
        <td class="py-4 px-6 text-xs text-slate-600 leading-relaxed max-w-md">
          ${service.description || "Standard clinical treatment procedure."}
        </td>

        <!-- FIXED PRICE -->
        <td class="py-4 px-6 text-right whitespace-nowrap">
          <span class="font-mono font-black text-slate-900 text-sm bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-200/60">
            ${formattedPrice}
          </span>
        </td>
      </tr>`;
    })
    .join("");
}

// =========================================================================
// 🧮 SESSION ESTIMATOR DROPDOWN POPULATOR & COST CALCULATOR
// =========================================================================
function populateSessionEstimator(services) {
  // Target the correct HTML select ID
  const selectEl = document.getElementById("booking-service");

  if (!selectEl) {
    console.warn("⚠️ Could not find #booking-service <select> in the DOM.");
    return;
  }

  // Build <option> elements
  const optionsHtml = services
    .map((service, index) => {
      const price = Number(service.basePricePhp || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      return `<option value="${index}">
        ${service.name} — ₱${price}
      </option>`;
    })
    .join("");

  selectEl.innerHTML = `
    <option value="" disabled selected>-- Select treatment track --</option>
    ${optionsHtml}
  `;

  // Update cost on selection change
  selectEl.addEventListener("change", (e) => {
    const selectedService = cachedServices[e.target.value];
    if (!selectedService) return;

    const formattedPrice = `₱${Number(
      selectedService.basePricePhp || 0,
    ).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    // Target the price indicator element in HTML
    updateDOMText("form-price-indicator", formattedPrice);
  });

  console.log(
    "✅ Interactive Session Estimator dropdown successfully populated.",
  );
}

// -------------------------------------------------------------------------
// 🔎 SEARCH FILTER ENGINE
// -------------------------------------------------------------------------
function setupMatrixSearch() {
  const searchInput = document.getElementById("treatment-search-input");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = cachedServices.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const desc = (s.description || "").toLowerCase();
      const slug = (s.slug || "").toLowerCase();
      return (
        name.includes(query) || desc.includes(query) || slug.includes(query)
      );
    });

    renderTreatmentMatrix(filtered);
  });
}

// =========================================================================
// 🔐 3. AUTHENTICATION CONTROLS
// =========================================================================
function setupDynamicAuthControls() {
  const navAuthContainer = document.getElementById("nav-auth-container");
  if (!navAuthContainer) return;

  const token = localStorage.getItem("token");
  const userData = JSON.parse(localStorage.getItem("user") || "null");

  if (token && userData && userData.role?.toUpperCase() === "PATIENT") {
    const displayName = userData.firstName || "Patient";
    navAuthContainer.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-xs font-bold text-slate-700">👋 Hi, ${displayName}</span>
        <a href="/patientDashboard.html?clinic=${CLINIC_SLUG}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl uppercase tracking-wider">
          Dashboard
        </a>
      </div>`;
  } else {
    navAuthContainer.innerHTML = `
      <div class="flex items-center gap-2">
        <a href="/clinicLogin.html?clinic=${CLINIC_SLUG}" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">Sign In</a>
        <a href="/patientRegistration?clinic=${CLINIC_SLUG}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl text-white uppercase tracking-wider">Register</a>
      </div>`;
  }
}

function bindActionButtons() {
  document
    .querySelectorAll(".book-treatment-btn, #hero-book-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const token = localStorage.getItem("token");
        const targetUrl = token
          ? `/patientDashboard.html?clinic=${CLINIC_SLUG}`
          : `/clinicLogin.html?clinic=${CLINIC_SLUG}`;
        window.location.href = targetUrl;
      });
    });
}

// -------------------------------------------------------------------------
// 🛠 HELPERS (Consolidated)
// -------------------------------------------------------------------------
function updateEstimatorDropdownState(message) {
  const selectEl = document.getElementById("booking-service");
  if (selectEl) {
    selectEl.innerHTML = `<option value="" disabled selected>${message}</option>`;
  }
}

function updateMatrixStatus(msg) {
  const tbody = document.getElementById("treatment-matrix-body");
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-500 italic text-sm">${msg}</td></tr>`;
}

function populateEstimatorError(msg) {
  updateEstimatorDropdownState(msg);
}

function populateEstimatorEmpty() {
  updateEstimatorDropdownState("No treatments available");
}

function updateDOMText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showHomepageError(msg) {
  const banner = document.getElementById("homepage-error-banner");
  if (banner) {
    banner.textContent = msg;
    banner.classList.remove("hidden");
  }
}
