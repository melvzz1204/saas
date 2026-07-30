document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("saasAdminToken");

  // 1. Authentication Check
  if (!token) {
    window.location.href = "/saasAdminLogin.html";
    return;
  }

  // Display Admin Info
  const user = JSON.parse(localStorage.getItem("saasAdminUser") || "{}");
  if (user.firstName) {
    document.getElementById("admin-name-display").innerText =
      `${user.firstName} ${user.lastName}`;
  }

  // Logout Handler
  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("saasAdminToken");
    localStorage.removeItem("saasAdminUser");
    window.location.href = "/saasAdminLogin.html";
  });

  // State variables
  let targetRejectClinicId = null;

  // Initialize Data
  fetchDashboardMetrics();
  fetchPendingApplications();
  fetchAllTenants();

  // API Call Helper
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    const response = await fetch(
      `http://localhost:5000/api/v1/saas-admin${endpoint}`,
      {
        ...options,
        headers,
      },
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Request failed.");
    }
    return result;
  }

  // 📊 Fetch Platform Statistics
  async function fetchDashboardMetrics() {
    try {
      const res = await apiFetch("/dashboard-stats");
      const { metrics } = res.data;

      document.getElementById("stat-total-clinics").innerText =
        metrics.totalClinics || 0;
      document.getElementById("stat-active-clinics").innerText =
        metrics.activeClinics || 0;
      document.getElementById("stat-total-patients").innerText =
        metrics.totalPatients || 0;
      document.getElementById("stat-total-appointments").innerText =
        metrics.totalAppointments || 0;
    } catch (err) {
      console.error("Failed to load metrics:", err);
    }
  }

  // 📋 Fetch Pending Applications
  async function fetchPendingApplications() {
    const container = document.getElementById("pending-applications-container");
    const badge = document.getElementById("pending-count-badge");

    try {
      const res = await apiFetch("/applications/pending");
      const clinics = res.data || [];

      badge.innerText = `${clinics.length} Pending`;

      if (clinics.length === 0) {
        container.innerHTML = `
          <div class="text-center py-8 bg-slate-950/40 border border-slate-800/60 rounded-xl">
            <p class="text-xs text-slate-500 font-semibold">✨ No pending clinic applications to review.</p>
          </div>`;
        return;
      }

      container.innerHTML = clinics
        .map((clinic) => renderPendingCard(clinic))
        .join("");

      // Attach Event Listeners to Action Buttons
      clinics.forEach((clinic) => {
        const approveBtn = document.getElementById(`approve-btn-${clinic._id}`);
        const rejectBtn = document.getElementById(`reject-btn-${clinic._id}`);

        if (approveBtn) {
          approveBtn.addEventListener("click", () =>
            processApplication(clinic._id, "Approved"),
          );
        }
        if (rejectBtn) {
          rejectBtn.addEventListener("click", () =>
            openRejectionModal(clinic._id),
          );
        }
      });
    } catch (err) {
      console.error("Failed to fetch pending applications:", err);
      container.innerHTML = `<div class="text-center py-6 text-rose-400 text-xs">Failed to load pending applications.</div>`;
    }
  }

  // Render HTML Card for a Pending Clinic
  function renderPendingCard(clinic) {
    const docs = clinic.submittedDocuments || [];

    const docsListHtml =
      docs.length > 0
        ? docs
            .map(
              (doc) => `
          <a href="${doc.fileUrl}" target="_blank" rel="noopener noreferrer"
             class="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950/50 border border-indigo-800/40 px-3 py-1.5 rounded-lg transition-all">
            <span>📄 ${doc.documentName}</span>
            <span class="text-[10px]">↗</span>
          </a>
        `,
            )
            .join("")
        : `<span class="text-xs text-slate-500 italic">No verification documents attached.</span>`;

    return `
      <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-3">
          <div>
            <h3 class="text-sm font-bold text-white">${clinic.name}</h3>
            <p class="text-[11px] text-slate-400 font-mono">Slug: ${clinic.slug} | Created: ${new Date(clinic.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Uploaded Credentials:</p>
            <div class="flex flex-wrap gap-2">${docsListHtml}</div>
          </div>
        </div>

        <div class="flex items-center space-x-3 shrink-0">
          <button id="reject-btn-${clinic._id}" class="bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer">
            Reject
          </button>
          <button id="approve-btn-${clinic._id}" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20 transition-all cursor-pointer">
            Approve Clinic
          </button>
        </div>
      </div>
    `;
  }

  // 🏢 Fetch All Tenants
  async function fetchAllTenants() {
    const tbody = document.getElementById("tenants-table-body");

    try {
      const res = await apiFetch("/tenants");
      const clinics = res.data || [];

      if (clinics.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-500">No registered tenants found.</td></tr>`;
        return;
      }

      tbody.innerHTML = clinics
        .map(
          (clinic) => `
        <tr class="hover:bg-slate-900/40 transition-colors">
          <td class="p-3 font-semibold text-white">${clinic.name}</td>
          <td class="p-3 font-mono text-slate-400">${clinic.slug}</td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              clinic.applicationStatus === "Approved"
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                : clinic.applicationStatus === "Rejected"
                  ? "bg-rose-950 text-rose-400 border border-rose-800"
                  : "bg-amber-950 text-amber-400 border border-amber-800"
            }">
              ${clinic.applicationStatus || "Pending"}
            </span>
          </td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${clinic.isActive ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-800 text-slate-400"}">
              ${clinic.isActive ? "Active" : "Suspended"}
            </span>
          </td>
          <td class="p-3 text-right">
            <button onclick="window.toggleTenant('${clinic._id}', ${!clinic.isActive})"
              class="text-[11px] font-bold ${clinic.isActive ? "text-rose-400 hover:underline" : "text-emerald-400 hover:underline"}">
              ${clinic.isActive ? "Suspend" : "Activate"}
            </button>
          </td>
        </tr>
      `,
        )
        .join("");
    } catch (err) {
      console.error("Failed to load tenants directory:", err);
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-rose-400">Failed to load tenants.</td></tr>`;
    }
  }

  // Handle Application Process (Approve / Reject)
  async function processApplication(clinicId, status, rejectionReason = "") {
    try {
      await apiFetch(`/applications/${clinicId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, rejectionReason }),
      });

      // Refresh Dashboard Data
      fetchDashboardMetrics();
      fetchPendingApplications();
      fetchAllTenants();
    } catch (err) {
      alert(err.message || "Failed to update application status.");
    }
  }

  // Toggle Tenant Active State (Global function for inline onclick)
  window.toggleTenant = async (clinicId, isActive) => {
    try {
      await apiFetch(`/tenants/${clinicId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      fetchDashboardMetrics();
      fetchAllTenants();
    } catch (err) {
      alert(err.message || "Failed to toggle tenant status.");
    }
  };

  // Rejection Modal Handlers
  const modal = document.getElementById("rejection-modal");
  const reasonInput = document.getElementById("rejection-reason-input");

  function openRejectionModal(clinicId) {
    targetRejectClinicId = clinicId;
    reasonInput.value = "";
    modal.classList.remove("hidden");
  }

  document
    .getElementById("cancel-rejection-btn")
    .addEventListener("click", () => {
      modal.classList.add("hidden");
      targetRejectClinicId = null;
    });

  document
    .getElementById("confirm-rejection-btn")
    .addEventListener("click", async () => {
      const reason = reasonInput.value.trim();
      if (!reason) {
        alert("Please enter a reason for rejection.");
        return;
      }

      if (targetRejectClinicId) {
        await processApplication(targetRejectClinicId, "Rejected", reason);
        modal.classList.add("hidden");
        targetRejectClinicId = null;
      }
    });
});
