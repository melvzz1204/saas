const API_BASE_URL = "http://localhost:5000/api/v1/dental-price";
const ADMIN_ID_DEFAULT = "admin_climen_master";

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements - Table
  const pricingTableBody = document.getElementById("pricing-table-body");
  const refreshPricesBtn = document.getElementById("refresh-prices");
  const kpiPricingTiers = document.getElementById("kpiPricingTiers");
  // DOM Elements - Forms
  const addPriceForm = document.getElementById("add-price-form");
  const editPriceForm = document.getElementById("edit-price-form");

  // ==========================================
  // 1. FETCH & RENDER PRICING LEDGER FROM MONGO
  // ==========================================
  async function loadDentalServices() {
    try {
      pricingTableBody.innerHTML = `
              <tr>
                  <td colspan="5" class="p-8 text-center text-slate-400 font-medium">
                      <span class="inline-block animate-pulse">Syncing clinical network ledger...</span>
                  </td>
              </tr>`;

      const response = await fetch(`${API_BASE_URL}/services`);
      if (!response.ok) throw new Error("Failed to pull pricing schema.");

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Database error.");

      const services = result.data;

      // Update KPI item count dynamically
      if (kpiPricingTiers) kpiPricingTiers.textContent = services.length;

      // 🎯 DELEGATE TO renderPricingTable TO INCLUDE THE TOGGLE SWITCH
      renderPricingTable(services);
    } catch (error) {
      console.error("❌ Fetch Error:", error);
      pricingTableBody.innerHTML = `
              <tr>
                  <td colspan="5" class="p-8 text-center text-rose-500 font-medium bg-rose-50/30">
                      Error linking backend network: ${error.message}
                  </td>
              </tr>`;
    }
  }

  if (addPriceForm) {
    addPriceForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const servicePayload = {
        name: document.getElementById("add-name").value.trim(),
        slug: document.getElementById("add-slug").value.toLowerCase().trim(),
        description: document.getElementById("add-desc").value.trim(),
        basePricePhp: Number(document.getElementById("add-price").value),
        adminId: ADMIN_ID_DEFAULT,
      };

      try {
        const response = await fetch(`${API_BASE_URL}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(servicePayload),
        });

        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Failed execution loop.");

        alert(`🎉 ${data.message}`);
        addPriceForm.reset();
        loadDentalServices(); // Instant runtime synchronization refresh
      } catch (error) {
        alert(`❌ Action Rejected: ${error.message}`);
      }
    });
  }

  // ==========================================
  // 3. EDIT/MODIFY EXISTING COST RATES (PATCH)
  // ==========================================
  if (editPriceForm) {
    editPriceForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const slug = document
        .getElementById("edit-slug")
        .value.toLowerCase()
        .trim();
      const newPrice = Number(document.getElementById("edit-price").value);

      try {
        const response = await fetch(`${API_BASE_URL}/update`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, newPrice, adminId: ADMIN_ID_DEFAULT }),
        });

        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Failed execution loop.");

        alert(`✅ ${data.message}`);
        editPriceForm.reset();
        loadDentalServices(); // Instant runtime synchronization refresh
      } catch (error) {
        alert(`❌ Modification Fault: ${error.message}`);
      }
    });
  }

  // Bind manually click trigger actions
  if (refreshPricesBtn)
    refreshPricesBtn.addEventListener("click", loadDentalServices);

  // Initial runtime boot fetch sequence
  loadDentalServices();
});

// ==========================================
// 4. GLOBAL HELPER: AUTO-POPULATE EDIT INPUTS
// ==========================================
window.populateEditFields = function (slug, currentPrice) {
  const editSlugInput = document.getElementById("edit-slug");
  const editPriceInput = document.getElementById("edit-price");

  if (editSlugInput && editPriceInput) {
    editSlugInput.value = slug;
    editPriceInput.value = currentPrice;

    // Provide visual focus hints to show it loaded
    editPriceInput.focus();
    editPriceInput.select();
  }
};
// Function to render the treatment ledger with toggle switches
function renderPricingTable(services) {
  const tbody = document.getElementById("pricing-table-body");
  if (!tbody) return;

  if (!services || services.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400 italic font-medium">
          No treatment services registered.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = services
    .map((service) => {
      // Default to true if isAvailable is undefined in MongoDB
      const isAvailable = service.isAvailable !== false;

      return `
        <tr class="hover:bg-slate-50/50 transition-colors">
          <!-- 1. TREATMENT SERVICE ITEM -->
          <td class="p-3.5 pl-5 font-bold text-slate-800">
            ${service.name}
            <p class="text-[10px] text-slate-400 font-normal">${service.description || ""}</p>
          </td>

          <!-- 2. REFERENCE CODE -->
          <td class="p-3.5 font-mono text-slate-500 text-xs">${service.slug}</td>

          <!-- 3. CURRENT RATE -->
          <td class="p-3.5 font-bold text-slate-900">
            ₱${Number(service.basePricePhp || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>

          <!-- 4. AVAILABLE (TOGGLE SWITCH CHECKBOX) -->
          <td class="p-3.5 text-center">
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                class="sr-only peer service-toggle-checkbox"
                data-id="${service._id}"
                data-slug="${service.slug}"
                ${isAvailable ? "checked" : ""}
              >
              <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </td>

          <!-- 5. ACTIONS (EDIT RATE BUTTON) -->
          <td class="p-3.5 pr-5 text-right">
           <button
            type="button"
            data-slug="${service.slug}"
            data-price="${service.basePricePhp}"
            class="edit-rate-btn px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors">
            Edit Rate
          </button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Attach dynamic listener to toggle switches
  attachToggleEventListeners();
}

// Attach change handlers to handle real-time API updates on toggle switch
function attachToggleEventListeners() {
  const toggles = document.querySelectorAll(".service-toggle-checkbox");

  toggles.forEach((checkbox) => {
    checkbox.addEventListener("change", async (e) => {
      const serviceId = e.target.dataset.id;
      const newStatus = e.target.checked;

      try {
        const response = await fetch(
          `http://localhost:5000/api/v1/dental-price/toggle/${serviceId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${typeof token !== "undefined" ? token : ""}`,
            },
            body: JSON.stringify({ isAvailable: newStatus }),
          },
        );

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Failed to update service availability.",
          );
        }
      } catch (err) {
        console.error("Toggle error:", err);
        alert(`⚠️ ${err.message}`);
        e.target.checked = !newStatus; // Revert switch if error
      }
    });
  });
}
document.addEventListener("click", (event) => {
  const editBtn = event.target.closest(".edit-rate-btn");
  if (!editBtn) return;

  const slug = editBtn.dataset.slug;
  const price = editBtn.dataset.price;

  populateEditForm(slug, price);
});
// ==========================================
// 🎯 POPULATE MODIFY OPERATIONAL RATES FORM
// ==========================================
function populateEditForm(slug, basePricePhp) {
  console.log("Populating rate form for:", slug, basePricePhp);

  // 1. Target the form inputs (adjust IDs if yours are slightly different)
  const slugInput =
    document.getElementById("service-slug") ||
    document.getElementById("referenceCode") ||
    document.getElementById("edit-slug");

  const priceInput =
    document.getElementById("service-price") ||
    document.getElementById("newBaseFee") ||
    document.getElementById("edit-price");

  // 2. Populate values into the form
  if (slugInput) slugInput.value = slug;
  if (priceInput) priceInput.value = basePricePhp;

  // 3. Smooth scroll directly down to the form card
  const formCard =
    slugInput?.closest("form") ||
    slugInput?.closest(".bg-white") ||
    document.getElementById("modify-rates-card");

  if (formCard) {
    formCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // 4. Highlight & focus the fee field so you can start typing immediately
  if (priceInput) {
    priceInput.focus();
    priceInput.select();
  }
}

// 🎯 CRITICAL FOR VITE / ES MODULES: Expose globally to window
window.populateEditForm = populateEditForm;

// 🎯 CRITICAL: Expose globally so line 243 & inline onclick can see it
window.populateEditForm = populateEditForm;

// ==========================================
// 🚀 HANDLE FEE MODIFICATION & FULL PAGE RELOAD
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const form =
    document.getElementById("modify-fee-form") ||
    document.querySelector("#modify-rates-card form");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. Get input values
    const slugInput =
      document.getElementById("service-slug") ||
      document.getElementById("referenceCode") ||
      document.getElementById("edit-slug");

    const priceInput =
      document.getElementById("service-price") ||
      document.getElementById("newBaseFee") ||
      document.getElementById("edit-price");

    const slug = slugInput?.value?.trim();
    const newPrice = parseFloat(priceInput?.value);

    // Validation
    if (!slug) {
      alert("⚠️ Please select a service track first by clicking 'Edit Rate'.");
      return;
    }

    if (isNaN(newPrice) || newPrice < 0) {
      alert("⚠️ Please enter a valid price amount.");
      return;
    }

    // 2. Auth & Endpoint Config
    const clinicId = localStorage.getItem("clinicId");
    const token = localStorage.getItem("token");

    const API_BASE_URL = window.location.origin.includes("localhost")
      ? "http://localhost:5000"
      : window.location.origin;

    try {
      // Send update request
      const response = await fetch(
        `${API_BASE_URL}/api/v1/dental-price/update`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
            ...(clinicId && { "x-clinic-id": clinicId }),
          },
          body: JSON.stringify({
            slug: slug,
            newPrice: newPrice,
            basePricePhp: newPrice,
          }),
        },
      );

      const result = await response.json();

      if (response.ok && (result.success || result.data)) {
        alert(
          `✅ Success! Rate for '${slug}' updated to ₱${newPrice.toLocaleString(
            "en-US",
            { minimumFractionDigits: 2 },
          )}`,
        );

        // 🎯 REFRESH PAGE TO REFLECT NEW PRICE EVERYWHERE
        window.location.reload();
      } else {
        alert(
          `❌ Update Failed: ${
            result.message || "Could not update service rate."
          }`,
        );
      }
    } catch (error) {
      console.error("Error updating service rate:", error);
      alert("❌ Network Error: Failed to connect to server backend.");
    }
  });
});
