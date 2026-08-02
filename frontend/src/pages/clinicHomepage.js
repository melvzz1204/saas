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

  // 1. Fetch tenant metadata (this saves clinicId to localStorage)
  await fetchTenantMetadata(CLINIC_SLUG);

  // 2. Fetch and render Dentists using the resolved clinicId
  const clinicId = localStorage.getItem("clinicId");
  await loadClinicDentists(clinicId);

  // 3. Fetch treatment catalog directly from /api/v1/dental-price/services
  await fetchServicesCatalog();

  // 4. Bind UI auth and actions
  setupDynamicAuthControls();
  bindActionButtons();
});

// =========================================================================
// 🦷 LOAD DYNAMIC CLINIC DENTISTS
// =========================================================================
async function loadClinicDentists(clinicId) {
  const container = document.getElementById("dentists-container");
  if (!container) return;

  if (!clinicId) {
    container.innerHTML = `
      <p class="col-span-full text-center text-xs text-slate-400 py-6">
        No clinic specified to load dentist profiles.
      </p>
    `;
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/staff/public/dentists?clinicId=${clinicId}`,
      {
        headers: {
          "X-Clinic-ID": clinicId, // Ensures backend tenant isolation works
        },
      },
    );
    const data = await response.json();

    if (!data.success || !data.dentists || data.dentists.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-8">
          <p class="text-xs text-slate-400 font-medium">No active dentists found for this clinic location.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.dentists
      .map((dentist) => {
        const imageUrl =
          dentist.profileImage && dentist.profileImage !== "default-avatar.png"
            ? `${API_BASE_URL}/uploads/${dentist.profileImage}`
            : `${API_BASE_URL}/uploads/default-avatar.png`;

        return `
        <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col h-full group text-center">
          <div class="relative w-16 h-16 mx-auto mb-3">
            <img
              src="${imageUrl}"
              alt="Dr. ${dentist.fullName}"
              class="w-full h-full rounded-full object-cover border border-slate-100 group-hover:border-indigo-200 transition-colors duration-300"
              onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(dentist.fullName)}&background=6366f1&color=fff'"
            />
          </div>
          <span class="inline-block px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold tracking-wider uppercase mb-2 mx-auto">
            ${dentist.specialization || "General Dentistry"}
          </span>
          <h3 class="text-base font-black text-slate-900 tracking-tight">Dr. ${dentist.fullName}</h3>
          <p class="text-xs text-slate-500 leading-relaxed my-2 line-clamp-2 flex-grow">
            "${dentist.bio || "Dedicated to providing exceptional dental care and creating beautiful smiles."}"
          </p>
          <div class="flex justify-between items-center border-t border-slate-100 pt-3 mt-2 text-slate-600">
            <div class="text-center w-1/2 border-r border-slate-100">
              <span class="block font-bold text-slate-800 text-xs">${dentist.experienceYears || 0}+ Yrs</span>
              <span class="block text-[9px] uppercase text-slate-400 tracking-wider">Experience</span>
            </div>
            <div class="text-center w-1/2">
   <span class="block font-bold text-slate-800 text-xs truncate max-w-full" title="${dentist.licenseNumber || "N/A"}">
  ${dentist.licenseNumber || "N/A"}
</span>              <span class="block text-[9px] uppercase text-slate-400 tracking-wider">License #</span>
            </div>
          </div>
          <button type="button" class="dentist-book-btn mt-4 w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 rounded-xl transition-colors uppercase tracking-wider cursor-pointer">
            Book Consultation
          </button>
        </div>
      `;
      })
      .join("");

    // Safely bind the dentist booking buttons
    container.querySelectorAll(".dentist-book-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const registerModal = document.getElementById("register-modal");
        if (registerModal) {
          registerModal.classList.remove("hidden");
          document.body.classList.add("overflow-hidden");
        } else {
          const urlParams = new URLSearchParams(window.location.search);
          const safeSlug =
            urlParams.get("clinic") || localStorage.getItem("clinicSlug") || "";
          window.location.href = `/clinicLogin.html?clinic=${safeSlug}`;
        }
      });
    });
  } catch (error) {
    console.error("Error loading clinic dentists:", error);
    container.innerHTML = `
      <p class="col-span-full text-center text-xs text-red-400 py-6">
        Unable to load dentist profiles right now.
      </p>
    `;
  }
}

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
      // 🎯 Store all services, but filter active ones for display
      cachedServices = json.data;

      // Filter for services that are explicitly active / available
      const activeServices = cachedServices.filter(
        (s) =>
          s.isAvailable !== false &&
          s.status !== "Inactive" &&
          s.status !== "Disabled",
      );

      if (activeServices.length === 0) {
        updateMatrixStatus(
          "No service tracks currently available in practice ledger.",
        );
        updateEstimatorDropdownState("No treatments currently available");
        return;
      }

      renderTreatmentMatrix(activeServices);
      setupMatrixSearch();
      populateSessionEstimator(activeServices);
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
    updateMatrixStatus("No matching active treatments found.");
    return;
  }

  tableBody.innerHTML = services
    .map((service) => {
      const formattedPrice = `₱${Number(
        service.basePricePhp || 0,
      ).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const categoryLabel = service.slug
        ? service.slug.replace(/-/g, " ")
        : "GENERAL SERVICE";

      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <td class="py-4 px-6">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-0.5">
            ${categoryLabel}
          </span>
          <span class="font-bold text-slate-800 text-sm">
            ${service.name || "Treatment Track"}
          </span>
        </td>
        <td class="py-4 px-6 text-xs text-slate-600 leading-relaxed max-w-md">
          ${service.description || "Standard clinical treatment procedure."}
        </td>
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
  const selectEl = document.getElementById("booking-service");

  if (!selectEl) return;

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

  selectEl.addEventListener("change", (e) => {
    const selectedService = services[e.target.value];
    if (!selectedService) return;

    const formattedPrice = `₱${Number(
      selectedService.basePricePhp || 0,
    ).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    updateDOMText("form-price-indicator", formattedPrice);
  });
}

// -------------------------------------------------------------------------
// 📊 MATRIX TABLE RENDERER
// -------------------------------------------------------------------------
/* function renderTreatmentMatrix(services) {
  const tableBody = document.getElementById("treatment-matrix-body");
  if (!tableBody) return;

  if (services.length === 0) {
    updateMatrixStatus("No matching treatments found.");
    return;
  }

  tableBody.innerHTML = services
    .map((service) => {
      const formattedPrice = `₱${Number(
        service.basePricePhp || 0,
      ).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const categoryLabel = service.slug
        ? service.slug.replace(/-/g, " ")
        : "GENERAL SERVICE";

      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <td class="py-4 px-6">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-0.5">
            ${categoryLabel}
          </span>
          <span class="font-bold text-slate-800 text-sm">
            ${service.name || "Treatment Track"}
          </span>
        </td>
        <td class="py-4 px-6 text-xs text-slate-600 leading-relaxed max-w-md">
          ${service.description || "Standard clinical treatment procedure."}
        </td>
        <td class="py-4 px-6 text-right whitespace-nowrap">
          <span class="font-mono font-black text-slate-900 text-sm bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-200/60">
            ${formattedPrice}
          </span>
        </td>
      </tr>`;
    })
    .join("");
} */

// =========================================================================
// 🧮 SESSION ESTIMATOR DROPDOWN POPULATOR & COST CALCULATOR
// =========================================================================
/* function populateSessionEstimator(services) {
  const selectEl = document.getElementById("booking-service");

  if (!selectEl) return;

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

  selectEl.addEventListener("change", (e) => {
    const selectedService = cachedServices[e.target.value];
    if (!selectedService) return;

    const formattedPrice = `₱${Number(
      selectedService.basePricePhp || 0,
    ).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    updateDOMText("form-price-indicator", formattedPrice);
  });
} */

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
        // Safely evaluate slug on click[cite: 6]
        const urlParams = new URLSearchParams(window.location.search);
        const safeSlug =
          urlParams.get("clinic") || localStorage.getItem("clinicSlug") || "";

        const token = localStorage.getItem("token");
        const targetUrl = token
          ? `/patientDashboard.html?clinic=${safeSlug}`
          : `/clinicLogin.html?clinic=${safeSlug}`;
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
