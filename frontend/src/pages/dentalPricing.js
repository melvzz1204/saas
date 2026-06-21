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
                    <td colspan="4" class="p-8 text-center text-slate-400 font-medium">
                        <span class="inline-block animate-pulse">Syncing clinical network ledger...</span>
                    </td>
                </tr>`;

      const response = await fetch(`${API_BASE_URL}/services`);
      if (!response.ok) throw new Error("Failed to pull pricing schema.");

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Database error.");

      const services = result.data;

      // Update the KPI dashboard item count dynamically!
      if (kpiPricingTiers) kpiPricingTiers.textContent = services.length;

      if (services.length === 0) {
        pricingTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="p-8 text-center text-slate-400 italic">
                            No operational treatment tracks found. Add one on the right panel!
                        </td>
                    </tr>`;
        return;
      }

      // Render matching rows into the Table Body
      pricingTableBody.innerHTML = services
        .map(
          (service) => `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="p-3.5 pl-5">
                        <p class="font-bold text-slate-800">${service.name}</p>
                        <p class="text-[11px] text-slate-400 font-medium max-w-xs truncate">${service.description || "No description provided."}</p>
                    </td>
                    <td class="p-3.5 font-mono text-[11px] text-slate-500 font-semibold">${service.slug}</td>
                    <td class="p-3.5 font-bold text-slate-900">
                        ₱${Number(service.basePricePhp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td class="p-3.5 pr-5 text-right">
                        <button
                            onclick="populateEditFields('${service.slug}', ${service.basePricePhp})"
                            class="bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-bold px-2.5 py-1 rounded border border-slate-200/60 hover:border-emerald-200 text-[11px] transition-all cursor-pointer">
                            Edit Rate
                        </button>
                    </td>
                </tr>
            `,
        )
        .join("");
    } catch (error) {
      console.error("❌ Fetch Error:", error);
      pricingTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-8 text-center text-rose-500 font-medium bg-rose-50/30">
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
