// SaaS Master Console dashboard controller.
// Security note: every value that originates from tenant input (clinic name,
// address, document names, slugs, etc.) is rendered with textContent / DOM APIs
// — never string-interpolated into innerHTML — because this screen runs in the
// highest-privilege (super-admin) session where stored XSS would be critical.

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("saasAdminToken");

  // 1. Authentication check
  if (!token) {
    window.location.href = "/saasAdminLogin.html";
    return;
  }

  const user = JSON.parse(localStorage.getItem("saasAdminUser") || "{}");
  if (user.firstName) {
    setText(
      "admin-name-display",
      `${user.firstName} ${user.lastName || ""}`.trim(),
    );
  }

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    localStorage.removeItem("saasAdminToken");
    localStorage.removeItem("saasAdminUser");
    window.location.href = "/saasAdminLogin.html";
  });

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  let allTenants = [];
  let latestMetrics = null;
  let tenantSort = { key: "createdAt", dir: "desc" };
  let targetRejectClinicId = null;

  const numberFmt = new Intl.NumberFormat();

  // -----------------------------------------------------------------------
  // Tiny DOM + formatting helpers
  // -----------------------------------------------------------------------
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // Only allow http(s) document links; anything else is treated as unavailable
  // so a crafted fileUrl (e.g. javascript:) can never become a clickable href.
  function safeHttpUrl(fileUrl) {
    if (!fileUrl) return null;
    try {
      const url = new URL(fileUrl, window.ApiBase);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  }

  function daysSince(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  // -----------------------------------------------------------------------
  // Toasts (replace alert()) — delegates to the global window.Toast system
  // (src/util/toast.js). The original dark-theme #toast-container markup is
  // superseded by the shared, self-contained notification system.
  // -----------------------------------------------------------------------
  function toast(message, type = "info") {
    if (window.Toast) {
      return window.Toast.show(message, type);
    }
    console.warn("[saasAdmin] window.Toast unavailable; message:", message);
    return null;
  }

  // -----------------------------------------------------------------------
  // Confirmation dialog (replace window.confirm / unguarded destructive click)
  // -----------------------------------------------------------------------
  const confirmModal = document.getElementById("confirm-modal");
  let confirmResolver = null;

  function confirmDialog({ title, body, confirmLabel = "Confirm", danger }) {
    setText("confirm-title", title);
    setText("confirm-body", body);
    const accept = document.getElementById("confirm-accept-btn");
    accept.textContent = confirmLabel;
    accept.className = danger
      ? "bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
      : "bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer";
    confirmModal.classList.remove("hidden");
    accept.focus();
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(result) {
    confirmModal.classList.add("hidden");
    if (confirmResolver) {
      confirmResolver(result);
      confirmResolver = null;
    }
  }

  document
    .getElementById("confirm-accept-btn")
    ?.addEventListener("click", () => closeConfirm(true));
  document
    .getElementById("confirm-cancel-btn")
    ?.addEventListener("click", () => closeConfirm(false));
  confirmModal?.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeConfirm(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !confirmModal.classList.contains("hidden")) {
      closeConfirm(false);
    }
  });

  // -----------------------------------------------------------------------
  // API helper
  // -----------------------------------------------------------------------
  async function apiFetch(endpoint, options = {}) {
    const response = await fetch(
      window.apiUrl(`/api/v1/saas-admin${endpoint}`),
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      },
    );
    let result = null;
    try {
      result = await response.json();
    } catch {
      /* non-JSON response handled below */
    }
    if (response.status === 401) {
      localStorage.removeItem("saasAdminToken");
      localStorage.removeItem("saasAdminUser");
      window.location.href = "/saasAdminLogin.html";
      throw new Error("Session expired.");
    }
    if (!response.ok || !result) {
      throw new Error((result && result.message) || "Request failed.");
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Reusable error / empty state builders
  // -----------------------------------------------------------------------
  function errorState(message, onRetry) {
    const wrap = el(
      "div",
      "text-center py-6 space-y-3 border border-rose-900/50 bg-rose-950/20 rounded-xl",
    );
    wrap.appendChild(el("p", "text-rose-300 text-xs font-semibold", message));
    if (onRetry) {
      const btn = el(
        "button",
        "text-[11px] font-bold text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg cursor-pointer",
        "Retry",
      );
      btn.addEventListener("click", onRetry);
      wrap.appendChild(btn);
    }
    return wrap;
  }

  // =======================================================================
  // 📊 Platform metrics: KPI deltas, funnel, no-show rate
  // =======================================================================
  async function fetchDashboardMetrics() {
    try {
      const res = await apiFetch("/dashboard-stats");
      const data = res.data || {};
      latestMetrics = data.metrics || {};

      setText("stat-total-clinics", numberFmt.format(latestMetrics.totalClinics || 0));
      setText("stat-active-clinics", numberFmt.format(latestMetrics.activeClinics || 0));
      setText("stat-total-patients", numberFmt.format(latestMetrics.totalPatients || 0));
      setText("stat-total-appointments", numberFmt.format(latestMetrics.totalAppointments || 0));

      const share = latestMetrics.totalClinics
        ? Math.round((latestMetrics.activeClinics / latestMetrics.totalClinics) * 100)
        : 0;
      setText("stat-active-share", `${share}% live`);

      const growth = data.growth || {};
      renderDelta("delta-clinics", growth.clinics);
      renderDelta("delta-patients", growth.patients);
      renderDelta("delta-appointments", growth.appointments);

      setText("stat-noshow-rate", `${data.noShowRate ?? 0}%`);
      renderFunnel(data.appointmentFunnel || {});

      // Attention feed depends on both metrics and the tenant list.
      renderAttention();
    } catch (err) {
      console.error("Failed to load metrics:", err);
      ["delta-clinics", "delta-patients", "delta-appointments"].forEach((id) =>
        setText(id, "unavailable"),
      );
      toast("Couldn't load platform metrics.", "error");
    }
  }

  function renderDelta(id, growth) {
    const node = document.getElementById(id);
    if (!node) return;
    if (!growth) {
      node.textContent = "—";
      node.className = "text-xs font-semibold text-slate-500";
      return;
    }
    if (growth.deltaPct === null) {
      node.textContent = `+${growth.current} new`;
      node.className = "text-xs font-semibold text-emerald-400";
      return;
    }
    const up = growth.deltaPct >= 0;
    node.textContent = `${up ? "▲" : "▼"} ${Math.abs(growth.deltaPct)}% · 30d`;
    node.className = `text-xs font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`;
  }

  function renderFunnel(funnel) {
    const container = document.getElementById("funnel-container");
    if (!container) return;
    clear(container);

    const stages = [
      { key: "scheduled", label: "Scheduled", color: "bg-indigo-500" },
      { key: "inLobby", label: "In lobby", color: "bg-sky-500" },
      { key: "inChair", label: "In chair", color: "bg-purple-500" },
      { key: "completed", label: "Completed", color: "bg-emerald-500" },
      { key: "noShow", label: "No-show", color: "bg-amber-500" },
      { key: "cancelled", label: "Cancelled", color: "bg-rose-500" },
    ];
    const max = Math.max(1, ...stages.map((s) => funnel[s.key] || 0));
    const total = stages.reduce((sum, s) => sum + (funnel[s.key] || 0), 0);

    if (!total) {
      container.appendChild(
        el(
          "p",
          "text-xs text-slate-500 italic py-2",
          "No appointment activity recorded yet.",
        ),
      );
      return;
    }

    stages.forEach((stage) => {
      const value = funnel[stage.key] || 0;
      const row = el("div", "space-y-1");
      const head = el("div", "flex items-center justify-between text-[11px]");
      head.appendChild(el("span", "text-slate-300 font-semibold", stage.label));
      head.appendChild(el("span", "text-slate-400 tabular-nums", numberFmt.format(value)));
      row.appendChild(head);
      const track = el("div", "h-2 bg-slate-800 rounded-full overflow-hidden");
      const bar = el("div", `${stage.color} h-full rounded-full`);
      bar.style.width = `${Math.round((value / max) * 100)}%`;
      track.appendChild(bar);
      row.appendChild(track);
      container.appendChild(row);
    });
  }

  // =======================================================================
  // 🚨 Needs-attention feed (rules-based, from data already fetched)
  // =======================================================================
  function renderAttention() {
    const feed = document.getElementById("attention-feed");
    const badge = document.getElementById("attention-count-badge");
    if (!feed) return;

    const items = [];

    allTenants.forEach((clinic) => {
      const status = clinic.applicationStatus || "Pending";
      if (status === "Pending") {
        const age = daysSince(clinic.createdAt);
        if (age >= 7) {
          items.push({
            severity: "high",
            title: `${clinic.name} — application waiting ${age} days`,
            detail: "Review verification documents to unblock onboarding.",
            focus: { section: "pending" },
          });
        }
      } else if (status === "Rejected") {
        items.push({
          severity: "med",
          title: `${clinic.name} — application rejected`,
          detail: "Awaiting corrected document resubmission.",
          focus: { search: clinic.name },
        });
      }
      if (status === "Approved" && clinic.isActive === false) {
        items.push({
          severity: "med",
          title: `${clinic.name} — approved tenant is suspended`,
          detail: "Confirm this suspension is intentional.",
          focus: { search: clinic.name },
        });
      }
    });

    if (latestMetrics && (latestMetrics.totalAppointments || 0) > 0) {
      const rate = Number(document.getElementById("stat-noshow-rate")?.textContent.replace("%", "")) || 0;
      if (rate >= 20) {
        items.push({
          severity: "high",
          title: `Platform no-show rate is ${rate}%`,
          detail: "Elevated no-shows signal scheduling or reminder issues.",
        });
      }
    }

    // Highest severity first.
    items.sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1));

    if (badge) {
      badge.textContent = String(items.length);
      badge.className = items.length
        ? "bg-amber-950 border border-amber-800 text-amber-300 text-xs font-bold px-3 py-1 rounded-full"
        : "bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full";
    }

    clear(feed);
    if (!items.length) {
      feed.appendChild(
        el(
          "p",
          "text-xs text-slate-500 italic py-4 text-center",
          "All clear — no exceptions across the platform right now.",
        ),
      );
      return;
    }

    items.forEach((item) => {
      const dotColor = item.severity === "high" ? "bg-rose-500" : "bg-amber-500";
      const card = el(
        "button",
        "w-full text-left flex items-start gap-3 bg-slate-950/60 border border-slate-800 hover:border-slate-600 rounded-xl p-3.5 transition-colors cursor-pointer",
      );
      card.appendChild(el("span", `mt-1 w-2 h-2 rounded-full shrink-0 ${dotColor}`));
      const body = el("div", "min-w-0");
      body.appendChild(el("p", "text-xs font-bold text-white truncate", item.title));
      body.appendChild(el("p", "text-[11px] text-slate-400", item.detail));
      card.appendChild(body);
      card.addEventListener("click", () => {
        if (item.focus?.search) {
          const search = document.getElementById("tenant-search");
          if (search) {
            search.value = item.focus.search;
            renderTenants();
            document.getElementById("tenants-table-body")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else if (item.focus?.section === "pending") {
          document.getElementById("pending-applications-container")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      feed.appendChild(card);
    });
  }

  // =======================================================================
  // 📋 Pending applications
  // =======================================================================
  async function fetchPendingApplications() {
    const container = document.getElementById("pending-applications-container");
    const badge = document.getElementById("pending-count-badge");
    if (!container) return;

    renderSkeleton(container, 2, "h-24");

    try {
      const res = await apiFetch("/applications/pending");
      const clinics = res.data || [];
      if (badge) badge.textContent = `${clinics.length} Pending`;

      clear(container);
      if (clinics.length === 0) {
        const empty = el(
          "div",
          "text-center py-8 bg-slate-950/40 border border-slate-800/60 rounded-xl",
        );
        empty.appendChild(
          el(
            "p",
            "text-xs text-slate-500 font-semibold",
            "No pending clinic applications. New submissions appear here automatically.",
          ),
        );
        container.appendChild(empty);
        return;
      }
      clinics.forEach((clinic) =>
        container.appendChild(renderPendingCard(clinic)),
      );
    } catch (err) {
      console.error("Failed to fetch pending applications:", err);
      clear(container);
      container.appendChild(
        errorState("Failed to load pending applications.", fetchPendingApplications),
      );
    }
  }

  function renderPendingCard(clinic) {
    const card = el(
      "div",
      "bg-slate-950/80 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4",
    );

    const left = el("div", "space-y-3 min-w-0");
    const idBlock = el("div");
    idBlock.appendChild(el("h3", "text-sm font-bold text-white", clinic.name));
    idBlock.appendChild(
      el(
        "p",
        "text-[11px] text-slate-400 font-mono",
        `Slug: ${clinic.slug || "—"} | Created: ${formatDate(clinic.createdAt)}`,
      ),
    );
    idBlock.appendChild(
      el(
        "p",
        "text-[11px] text-slate-400",
        `Address: ${clinic.address || "Not provided"} · Contact: ${clinic.contactNumber || "Not provided"}`,
      ),
    );
    left.appendChild(idBlock);

    const docsBlock = el("div");
    docsBlock.appendChild(
      el(
        "p",
        "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1",
        "Uploaded credentials:",
      ),
    );
    const docsWrap = el("div", "flex flex-wrap gap-2");
    const docs = clinic.submittedDocuments || [];
    if (docs.length === 0) {
      docsWrap.appendChild(
        el("span", "text-xs text-slate-500 italic", "No verification documents attached."),
      );
    } else {
      docs.forEach((doc) => {
        const href = safeHttpUrl(doc.fileUrl);
        const label = `${doc.documentType || "Verification Document"}: ${doc.documentName || "View document"}`;
        if (href) {
          const link = el(
            "a",
            "inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950/50 border border-indigo-800/40 px-3 py-1.5 rounded-lg transition-all",
          );
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.appendChild(el("span", null, `\uD83D\uDCC4 ${label}`));
          link.appendChild(el("span", "text-[10px]", "\u2197"));
          docsWrap.appendChild(link);
        } else {
          const span = el(
            "span",
            "inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg opacity-60",
          );
          span.appendChild(el("span", null, `\uD83D\uDCC4 ${label}`));
          span.appendChild(el("span", "text-[10px]", "Unavailable"));
          docsWrap.appendChild(span);
        }
      });
    }
    docsBlock.appendChild(docsWrap);
    left.appendChild(docsBlock);
    card.appendChild(left);

    const actions = el("div", "flex items-center space-x-3 shrink-0");
    const rejectBtn = el(
      "button",
      "bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer",
      "Reject",
    );
    rejectBtn.addEventListener("click", () => openRejectionModal(clinic._id));
    const approveBtn = el(
      "button",
      "bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20 transition-all cursor-pointer",
      "Approve Clinic",
    );
    approveBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Approve clinic",
        body: `Approve "${clinic.name}"? This activates their workspace and grants full dashboard access.`,
        confirmLabel: "Approve",
      });
      if (ok) processApplication(clinic._id, "Approved");
    });
    actions.appendChild(rejectBtn);
    actions.appendChild(approveBtn);
    card.appendChild(actions);

    return card;
  }

  // =======================================================================
  // 🏢 Tenant directory: search / filter / sort / export
  // =======================================================================
  async function fetchAllTenants() {
    const tbody = document.getElementById("tenants-table-body");
    if (!tbody) return;
    renderTableSkeleton(tbody, 5, 7);
    try {
      const res = await apiFetch("/tenants");
      allTenants = res.data || [];
      renderTenants();
      renderAttention();
    } catch (err) {
      console.error("Failed to load tenants directory:", err);
      clear(tbody);
      const tr = el("tr");
      const td = el("td", "py-6");
      td.colSpan = 7;
      td.appendChild(errorState("Failed to load tenants.", fetchAllTenants));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function getFilteredTenants() {
    const q = (document.getElementById("tenant-search")?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("tenant-status-filter")?.value || "";

    let rows = allTenants.filter((c) => {
      const matchesQ =
        !q ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.slug || "").toLowerCase().includes(q);
      const matchesStatus = !statusFilter || (c.applicationStatus || "Pending") === statusFilter;
      return matchesQ && matchesStatus;
    });

    const { key, dir } = tenantSort;
    rows = rows.slice().sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "createdAt") {
        av = new Date(av).getTime() || 0;
        bv = new Date(bv).getTime() || 0;
      } else {
        av = String(av || "").toLowerCase();
        bv = String(bv || "").toLowerCase();
      }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function renderTenants() {
    const tbody = document.getElementById("tenants-table-body");
    if (!tbody) return;
    const rows = getFilteredTenants();

    setText(
      "tenant-result-count",
      `· ${rows.length} of ${allTenants.length} shown`,
    );
    updateSortIndicators();

    clear(tbody);
    if (rows.length === 0) {
      const tr = el("tr");
      const td = el("td", "text-center py-6 text-slate-500");
      td.colSpan = 7;
      td.textContent = allTenants.length
        ? "No tenants match your filters."
        : "No registered tenants found.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((clinic) => tbody.appendChild(renderTenantRow(clinic)));
  }

  function statusBadge(status) {
    const s = status || "Pending";
    const cls =
      s === "Approved"
        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
        : s === "Rejected"
          ? "bg-rose-950 text-rose-400 border border-rose-800"
          : "bg-amber-950 text-amber-400 border border-amber-800";
    return el("span", `px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`, s);
  }

  function renderTenantRow(clinic) {
    const tr = el("tr", "hover:bg-slate-900/40 transition-colors");
    tr.dataset.clinicId = String(clinic._id || "");

    tr.appendChild(el("td", "p-3 font-semibold text-white", clinic.name));
    tr.appendChild(el("td", "p-3 font-mono text-slate-400", clinic.slug || "—"));

    const statusTd = el("td", "p-3");
    statusTd.appendChild(statusBadge(clinic.applicationStatus));
    tr.appendChild(statusTd);

    const wsTd = el("td", "p-3");
    wsTd.appendChild(
      el(
        "span",
        `px-2 py-0.5 rounded-full text-[10px] font-bold ${
          clinic.isActive
            ? "bg-emerald-900/30 text-emerald-400"
            : "bg-slate-800 text-slate-400"
        }`,
        clinic.isActive ? "Active" : "Suspended",
      ),
    );
    tr.appendChild(wsTd);

    const subTd = el("td", "p-3");
    subTd.dataset.subCell = "1";
    subTd.appendChild(el("span", "text-[11px] text-slate-600", "—"));
    tr.appendChild(subTd);

    tr.appendChild(el("td", "p-3 text-slate-400 tabular-nums", formatDate(clinic.createdAt)));

    const actionTd = el("td", "p-3 text-right");
    const btn = el(
      "button",
      `text-[11px] font-bold ${clinic.isActive ? "text-rose-400 hover:underline" : "text-emerald-400 hover:underline"} cursor-pointer`,
      clinic.isActive ? "Suspend" : "Activate",
    );
    btn.addEventListener("click", () => toggleTenant(clinic));
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);

    return tr;
  }

  function updateSortIndicators() {
    document.querySelectorAll(".tenant-sort").forEach((btn) => {
      const arrow = btn.querySelector(".sort-arrow");
      if (!arrow) return;
      if (btn.dataset.sort === tenantSort.key) {
        arrow.textContent = tenantSort.dir === "asc" ? "▲" : "▼";
        arrow.className = "sort-arrow text-indigo-400";
      } else {
        arrow.textContent = "";
        arrow.className = "sort-arrow text-slate-600";
      }
    });
  }

  document.querySelectorAll(".tenant-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (tenantSort.key === key) {
        tenantSort.dir = tenantSort.dir === "asc" ? "desc" : "asc";
      } else {
        tenantSort = { key, dir: key === "createdAt" ? "desc" : "asc" };
      }
      renderTenants();
    });
  });

  document.getElementById("tenant-search")?.addEventListener("input", renderTenants);
  document.getElementById("tenant-status-filter")?.addEventListener("change", renderTenants);
  document.getElementById("export-tenants-btn")?.addEventListener("click", exportTenantsCsv);

  function exportTenantsCsv() {
    const rows = getFilteredTenants();
    if (!rows.length) {
      toast("Nothing to export for the current filters.", "info");
      return;
    }
    const header = ["Clinic Name", "Clinic Code", "Application Status", "Workspace", "Created"];
    const csvValue = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(csvValue).join(",")];
    rows.forEach((c) => {
      lines.push(
        [
          c.name,
          c.slug,
          c.applicationStatus || "Pending",
          c.isActive ? "Active" : "Suspended",
          formatDate(c.createdAt),
        ]
          .map(csvValue)
          .join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} tenant record(s).`, "success");
  }

  // =======================================================================
  // Mutations
  // =======================================================================
  async function processApplication(clinicId, status, rejectionReason = "") {
    try {
      await apiFetch(`/applications/${clinicId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, rejectionReason }),
      });
      toast(`Application ${status.toLowerCase()}.`, "success");
      fetchDashboardMetrics();
      fetchPendingApplications();
      fetchAllTenants();
    } catch (err) {
      toast(err.message || "Failed to update application status.", "error");
    }
  }

  async function toggleTenant(clinic) {
    const suspending = clinic.isActive;
    const ok = await confirmDialog({
      title: suspending ? "Suspend tenant" : "Activate tenant",
      body: suspending
        ? `Suspend "${clinic.name}"? Their workspace will be locked and staff cannot sign in until reactivated.`
        : `Reactivate "${clinic.name}"? Their workspace access will be restored.`,
      confirmLabel: suspending ? "Suspend" : "Activate",
      danger: suspending,
    });
    if (!ok) return;
    try {
      await apiFetch(`/tenants/${clinic._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !clinic.isActive }),
      });
      toast(
        `${clinic.name} ${suspending ? "suspended" : "activated"}.`,
        "success",
      );
      fetchDashboardMetrics();
      fetchAllTenants();
    } catch (err) {
      toast(err.message || "Failed to toggle tenant status.", "error");
    }
  }

  // -----------------------------------------------------------------------
  // Rejection modal
  // -----------------------------------------------------------------------
  const rejectionModal = document.getElementById("rejection-modal");
  const reasonInput = document.getElementById("rejection-reason-input");

  function openRejectionModal(clinicId) {
    targetRejectClinicId = clinicId;
    if (reasonInput) reasonInput.value = "";
    rejectionModal?.classList.remove("hidden");
    reasonInput?.focus();
  }

  document.getElementById("cancel-rejection-btn")?.addEventListener("click", () => {
    rejectionModal?.classList.add("hidden");
    targetRejectClinicId = null;
  });

  document.getElementById("confirm-rejection-btn")?.addEventListener("click", async () => {
    const reason = (reasonInput?.value || "").trim();
    if (!reason) {
      toast("Please enter a reason for rejection.", "error");
      return;
    }
    if (targetRejectClinicId) {
      await processApplication(targetRejectClinicId, "Rejected", reason);
      rejectionModal?.classList.add("hidden");
      targetRejectClinicId = null;
    }
  });

  rejectionModal?.addEventListener("click", (e) => {
    if (e.target === rejectionModal) {
      rejectionModal.classList.add("hidden");
      targetRejectClinicId = null;
    }
  });

  // -----------------------------------------------------------------------
  // Skeleton helpers
  // -----------------------------------------------------------------------
  function renderSkeleton(container, count, heightClass) {
    clear(container);
    for (let i = 0; i < count; i += 1) {
      container.appendChild(
        el("div", `${heightClass} bg-slate-800/40 rounded-xl animate-pulse`),
      );
    }
  }

  function renderTableSkeleton(tbody, rows, cols) {
    clear(tbody);
    for (let r = 0; r < rows; r += 1) {
      const tr = el("tr");
      for (let c = 0; c < cols; c += 1) {
        const td = el("td", "p-3");
        td.appendChild(el("div", "h-4 bg-slate-800/40 rounded animate-pulse"));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  // =======================================================================
  // 🧭 SaaS navbar tabs
  // =======================================================================
  const TAB_HASH = { overview: "overview", applications: "applications", tenants: "tenants", subscriptions: "subscriptions", billing: "billing" };
  function setSaasTab(name, push = true) {
    const valid = TAB_HASH[name] ? name : "overview";
    document.querySelectorAll(".saas-tab").forEach((b) => {
      const active = b.dataset.saasTab === valid;
      b.setAttribute("aria-selected", active ? "true" : "false");
      b.className = `saas-tab whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 ${active ? "text-white border-indigo-500" : "text-slate-400 hover:text-white border-transparent"}`;
    });
    document.querySelectorAll("[data-saas-panel]").forEach((p) => {
      p.classList.toggle("hidden", p.dataset.saasPanel !== valid);
    });
    if (push) history.replaceState(null, "", `#/${valid}`);
    if (valid === "subscriptions") fetchSubsOverview();
    if (valid === "billing") fetchBillingActivity();
  }
  document.querySelectorAll(".saas-tab").forEach((b) => b.addEventListener("click", () => setSaasTab(b.dataset.saasTab)));
  const initialTab = (location.hash || "").replace("#/", "");
  setSaasTab(TAB_HASH[initialTab] ? initialTab : "overview", false);

  // =======================================================================
  // 💳 Subscriptions (clinics x subscription + warnings + actions)
  // =======================================================================
  const BILLING_API = window.apiUrl("/api/v1/billing");
  async function billingFetch(path, options = {}) {
    const res = await fetch(`${BILLING_API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
    });
    const out = await res.json().catch(() => null);
    if (res.status === 401) {
      localStorage.removeItem("saasAdminToken");
      localStorage.removeItem("saasAdminUser");
      window.location.href = "/saasAdminLogin.html";
      throw new Error("Session expired.");
    }
    if (!res.ok || !out || out.success === false) throw new Error((out && out.message) || "Billing request failed.");
    return out;
  }

  let subRows = [];
  let subMeta = null;
  let notifySubId = null;

  const pesoFmt = (n, c = "PHP") => n == null ? "—" : (c === "PHP" ? "₱" : "$") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (v) => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(); };
  function daysChip(days) {
    if (days == null) return el("span", "text-[10px] text-slate-500", "—");
    const cls = days < 0 ? "bg-rose-950 text-rose-300 border border-rose-800"
      : days <= 3 ? "bg-rose-950 text-rose-300 border border-rose-800"
      : days <= 7 ? "bg-amber-950 text-amber-300 border border-amber-800"
      : "bg-slate-800 text-slate-300 border border-slate-700";
    const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "due today" : `${days}d left`;
    return el("span", `px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`, label);
  }
  function subStatusBadge(s) {
    const map = {
      active: "bg-emerald-950 text-emerald-300 border border-emerald-800",
      trialing: "bg-sky-950 text-sky-300 border border-sky-800",
      past_due: "bg-amber-950 text-amber-300 border border-amber-800",
      payment_failed: "bg-rose-950 text-rose-300 border border-rose-800",
      unpaid: "bg-rose-950 text-rose-300 border border-rose-800",
      paused: "bg-violet-950 text-violet-300 border border-violet-800",
      canceled: "bg-slate-800 text-slate-400 border border-slate-700",
      expired: "bg-slate-800 text-slate-400 border border-slate-700",
      pending: "bg-slate-800 text-slate-300 border border-slate-700",
    };
    return el("span", `px-2 py-0.5 rounded-full text-[10px] font-bold ${map[s] || map.pending}`, (s || "none").replace(/_/g, " "));
  }

  async function ensureSubMeta() {
    if (subMeta) return subMeta;
    const out = await billingFetch("/meta");
    subMeta = out.data;
    const statusSel = document.getElementById("sub-status-filter");
    if (statusSel && statusSel.options.length <= 1) {
      subMeta.enums.subscriptionStatuses.forEach((s) => {
        const o = document.createElement("option"); o.value = s; o.textContent = s.replace(/_/g, " "); statusSel.appendChild(o);
      });
      const none = document.createElement("option"); none.value = "none"; none.textContent = "no subscription"; statusSel.appendChild(none);
    }
    return subMeta;
  }

  function subFilters() {
    return {
      search: (document.getElementById("sub-search")?.value || "").trim().toLowerCase(),
      status: document.getElementById("sub-status-filter")?.value || "",
      expiringOnly: document.getElementById("sub-expiring-only")?.checked || false,
    };
  }

  async function fetchSubsOverview() {
    const tbody = document.getElementById("subs-table-body");
    try {
      await ensureSubMeta();
      const out = await billingFetch("/admin/clinics-overview?limit=200");
      subRows = out.data || [];
      paintTenantSubBadges();
      renderSubKpis();
      renderSubsTable();
    } catch (err) {
      console.error("Subscriptions overview failed:", err);
      if (tbody) {
        clear(tbody);
        const tr = el("tr"); const td = el("td", "text-center py-6 text-slate-500"); td.colSpan = 6;
        td.appendChild(errorState("Couldn't load subscriptions.", fetchSubsOverview));
        tr.appendChild(td); tbody.appendChild(tr);
      }
    }
  }

  function filteredSubRows() {
    const f = subFilters();
    return subRows.filter((r) => {
      if (f.search && !((r.clinic.name || "").toLowerCase().includes(f.search) || (r.clinic.slug || "").toLowerCase().includes(f.search))) return false;
      if (f.status && (r.subscription ? r.subscription.status !== f.status : f.status !== "none")) return false;
      if (f.expiringOnly && !(r.daysLeft != null && r.daysLeft <= 7)) return false;
      return true;
    });
  }

  function renderSubKpis() {
    const wrap = document.getElementById("sub-kpis");
    if (!wrap) return;
    const withSub = subRows.filter((r) => r.subscription);
    const active = withSub.filter((r) => r.subscription.status === "active");
    const trials = withSub.filter((r) => r.subscription.status === "trialing");
    const risk = withSub.filter((r) => ["past_due", "payment_failed", "unpaid"].includes(r.subscription.status));
    const expiring = withSub.filter((r) => r.daysLeft != null && r.daysLeft <= 7 && ["active", "trialing"].includes(r.subscription.status));
    const cards = [
      ["Active subs", String(active.length), "text-emerald-300"],
      ["Trials", String(trials.length), "text-sky-300"],
      ["Expiring ≤ 7d", String(expiring.length), expiring.length ? "text-amber-300" : "text-slate-300"],
      ["Past due / unpaid", String(risk.length), risk.length ? "text-rose-300" : "text-slate-300"],
    ];
    clear(wrap);
    cards.forEach(([label, val, cls]) => {
      const card = el("div", "bg-slate-950/60 border border-slate-800 rounded-xl p-3.5");
      card.appendChild(el("p", "text-[10px] font-bold text-slate-500 uppercase tracking-wider", label));
      card.appendChild(el("p", `text-xl font-black tabular-nums mt-1 ${cls}`, val));
      wrap.appendChild(card);
    });
    const badge = document.getElementById("nav-sub-alert");
    const alertCount = expiring.length + risk.length;
    if (badge) {
      badge.classList.toggle("hidden", !alertCount);
      badge.textContent = String(alertCount);
    }
  }

  function renderSubsTable() {
    const tbody = document.getElementById("subs-table-body");
    if (!tbody) return;
    const rows = filteredSubRows();
    clear(tbody);
    if (!rows.length) {
      const tr = el("tr"); const td = el("td", "text-center py-6 text-slate-500 text-xs"); td.colSpan = 6;
      td.textContent = subRows.length ? "No subscriptions match your filters." : "No clinics found.";
      tr.appendChild(td); tbody.appendChild(tr); return;
    }
    rows.forEach((r) => tbody.appendChild(renderSubRow(r)));
  }

  function renderSubRow(r) {
    const tr = el("tr", "hover:bg-slate-900/40 transition-colors");
    const c = r.clinic, s = r.subscription;
    const clinicTd = el("td", "p-3");
    clinicTd.appendChild(el("p", "font-semibold text-white", c.name));
    clinicTd.appendChild(el("p", "font-mono text-[10px] text-slate-500", c.slug || "—"));
    tr.appendChild(clinicTd);

    if (!s) {
      tr.appendChild(el("td", "p-3 text-slate-500 text-xs", "—"));
      tr.appendChild(el("td", "p-3 text-slate-500 text-xs", "—"));
      tr.appendChild(el("td", "p-3", "")).lastChild.appendChild(el("span", "px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700", "no subscription"));
      tr.appendChild(el("td", "p-3", "")).lastChild.appendChild(daysChip(null));
      const act = el("td", "p-3 text-right");
      act.appendChild(el("span", "text-[11px] text-slate-600", "Clinic subscribes from its dashboard"));
      tr.appendChild(act);
      return tr;
    }

    tr.appendChild(el("td", "p-3 text-slate-300", `${s.planName || s.planKey} · ${s.billingCycle}`));
    tr.appendChild(el("td", "p-3 text-slate-200 tabular-nums", pesoFmt(s.amount, s.currency)));
    const st = el("td", "p-3"); st.appendChild(subStatusBadge(s.status)); tr.appendChild(st);
    const renew = el("td", "p-3");
    renew.appendChild(el("p", "text-slate-300 tabular-nums", fmtDate(r.renewalDate)));
    renew.appendChild(daysChip(r.daysLeft));
    tr.appendChild(renew);

    const act = el("td", "p-3 text-right whitespace-nowrap");
    const viewBtn = el("button", "text-[11px] font-bold text-indigo-300 hover:underline cursor-pointer mr-2", "View");
    viewBtn.addEventListener("click", () => openSubDrawer(r));
    const warnBtn = el("button", "text-[11px] font-bold text-amber-300 hover:underline cursor-pointer mr-2", "Warn");
    warnBtn.addEventListener("click", () => openNotifyModal(s._id, c.name, s));
    act.appendChild(viewBtn); act.appendChild(warnBtn);
    // Interrupted registration activation: reconcile the prepaid charge
    // (no new charge) instead of retrying payment.
    if (s.status === "pending") {
      const syncBtn = el("button", "text-[11px] font-bold text-emerald-300 hover:underline cursor-pointer mr-2", "Sync");
      syncBtn.title = "Reconcile prepaid registration payment — no new charge";
      syncBtn.addEventListener("click", () => syncRegistration(c._id));
      act.appendChild(syncBtn);
    }
    // Resume remains only for rows paused before the Pause action was retired.
    if (s.status === "paused") {
      const b = el("button", "text-[11px] font-bold text-emerald-300 hover:underline cursor-pointer mr-2", "Resume");
      b.addEventListener("click", () => subAction(s._id, "resume"));
      act.appendChild(b);
    }
    if (["active", "trialing"].includes(s.status)) {
      const b = el("button", "text-[11px] font-bold text-sky-300 hover:underline cursor-pointer mr-2", "Switch cycle");
      b.title = "Switch monthly ↔ yearly (restarts period, charges now)";
      b.addEventListener("click", () => switchCycleFlow(s._id, c.name, s.billingCycle));
      act.appendChild(b);
    }
    if (!["canceled", "expired"].includes(s.status)) {
      const b = el("button", "text-[11px] font-bold text-rose-300 hover:underline cursor-pointer", "Cancel");
      b.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Cancel subscription", body: `Cancel ${c.name}'s ${s.planName} subscription immediately?`, confirmLabel: "Cancel", danger: true });
        if (ok) subAction(s._id, "cancel");
      });
      act.appendChild(b);
    }
    tr.appendChild(act);
    return tr;
  }

  // Fill the Tenant Directory's Subscription column from the same data.
  function paintTenantSubBadges() {
    const byClinic = new Map(subRows.map((r) => [String(r.clinic._id), r]));
    document.querySelectorAll("#tenants-table-body tr[data-clinic-id]").forEach((tr) => {
      const cell = tr.querySelector("[data-sub-cell]");
      if (!cell) return;
      clear(cell);
      const row = byClinic.get(tr.dataset.clinicId);
      if (!row?.subscription) {
        cell.appendChild(el("span", "text-[11px] text-slate-600", "—"));
      } else {
        cell.appendChild(subStatusBadge(row.subscription.status));
        cell.appendChild(el("p", "text-[10px] text-slate-500 mt-0.5", `${row.subscription.planName || ""}${row.daysLeft != null ? ` · ${row.daysLeft}d` : ""}`));
      }
    });
  }

  async function syncRegistration(clinicId) {
    try {
      const out = await billingFetch("/admin/subscriptions/sync-registration", { method: "POST", body: JSON.stringify({ clinicId }) });
      toast(out.message || "Synced.", "success");
      fetchSubsOverview();
      const drawer = document.getElementById("sub-drawer");
      if (drawer && !drawer.classList.contains("hidden") && drawer.dataset.subId) refreshDrawer(drawer.dataset.subId);
    } catch (e) { toast(e.message, "error"); }
  }

  async function subAction(id, action, body = {}) {
    try {
      const map = {
        resume: [`/admin/subscriptions/${id}/resume`, {}],
        cancel: [`/admin/subscriptions/${id}/cancel`, { atPeriodEnd: false }],
      };
      const [path, payload] = map[action] || [];
      if (!path) return;
      await billingFetch(path, { method: "POST", body: JSON.stringify({ ...payload, ...body }) });
      toast(`Subscription ${action}d.`, "success");
      fetchSubsOverview();
      if (!document.getElementById("sub-drawer")?.classList.contains("hidden")) refreshDrawer(id);
    } catch (e) { toast(e.message, "error"); }
  }

  async function switchCycleFlow(subId, clinicName, currentCycle) {
    const next = currentCycle === "yearly" ? "monthly" : "yearly";
    const ok = await confirmDialog({
      title: "Switch billing cycle",
      body: `Switch ${clinicName || "this clinic"} from ${currentCycle} to ${next}? The period restarts today and the new amount is charged immediately (no proration).`,
      confirmLabel: `Switch to ${next}`,
    });
    if (!ok) return;
    try {
      const out = await billingFetch(`/admin/subscriptions/${subId}/change-cycle`, { method: "POST", body: JSON.stringify({ billingCycle: next }) });
      toast(out.message || "Billing cycle switched.", out.success === false ? "error" : "success");
      fetchSubsOverview();
      if (!document.getElementById("sub-drawer")?.classList.contains("hidden")) refreshDrawer(subId);
    } catch (e) { toast(e.message, "error"); }
  }

  // Clinic subscription creation lives in the Billing Admin Console
  // (simulation lab). Clinics otherwise subscribe themselves from their own
  // dashboard, so the ops console intentionally has no create action.

  // ---- detail drawer ----
  function openSubDrawer(row) {
    const drawer = document.getElementById("sub-drawer");
    setText("sub-drawer-title", row.clinic.name);
    setText("sub-drawer-sub", `${row.subscription.planName} · ${row.subscription.billingCycle} · ${row.subscription.status}`);
    drawer.dataset.subId = row.subscription._id;
    drawer.classList.remove("hidden");
    refreshDrawer(row.subscription._id);
  }
  async function refreshDrawer(subId) {
    const body = document.getElementById("sub-drawer-body");
    clear(body);
    body.appendChild(el("p", "text-xs text-slate-500", "Loading details…"));
    try {
      const [subs, invoices, notifs] = await Promise.all([
        billingFetch("/admin/subscriptions?limit=200"),
        billingFetch(`/admin/invoices?limit=50`),
        billingFetch(`/admin/notifications?limit=50`),
      ]);
      const sub = (subs.data || []).find((s) => String(s._id) === String(subId));
      if (!sub) { clear(body); body.appendChild(el("p", "text-xs text-slate-500", "Subscription not found.")); return; }
      const invs = (invoices.data || []).filter((i) => String(i.subscriptionId) === String(subId)).slice(0, 5);
      const notes = (notifs.data || []).filter((n) => String(n.subscriptionId) === String(subId)).slice(0, 8);
      clear(body);

      const facts = el("div", "grid grid-cols-2 gap-2 text-xs");
      [["Status", (sub.status || "").replace(/_/g, " ")], ["Amount", pesoFmt(sub.amount, sub.currency)], ["Renews", fmtDate(sub.nextRenewalDate)], ["Trial ends", fmtDate(sub.trialEndsAt)], ["Auto-renew", sub.autoRenew ? "on" : "off"]].forEach(([k, v]) => {
        const cell = el("div", "bg-slate-950/60 border border-slate-800 rounded-xl p-3");
        cell.appendChild(el("p", "text-[10px] font-bold text-slate-500 uppercase tracking-wider", k));
        cell.appendChild(el("p", "text-slate-200 font-bold mt-0.5", v));
        facts.appendChild(cell);
      });
      body.appendChild(facts);

      const actions = el("div", "flex flex-wrap gap-2");
      const mkBtn = (label, cls, fn) => { const b = el("button", `text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer ${cls}`, label); b.addEventListener("click", fn); return b; };
      actions.appendChild(mkBtn("Warn clinic", "bg-amber-500 text-slate-950 hover:bg-amber-400", () => openNotifyModal(sub._id, sub.clinicName, sub)));
      if (sub.status === "pending") actions.appendChild(mkBtn("Sync prepaid", "bg-emerald-600 text-white hover:bg-emerald-500", async () => {
        const row = subRows.find((x) => String(x.subscription?._id) === String(sub._id));
        await syncRegistration(row?.clinic?._id || sub.clinicId);
      }));
      if (sub.status === "paused") actions.appendChild(mkBtn("Resume", "bg-emerald-600 text-white", () => subAction(sub._id, "resume")));
      if (["active", "trialing"].includes(sub.status)) actions.appendChild(mkBtn("Switch cycle", "bg-sky-600 text-white hover:bg-sky-500", () => switchCycleFlow(sub._id, sub.clinicName, sub.billingCycle)));
      body.appendChild(actions);

      const sec = (title) => { const h = el("h4", "text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-2", title); body.appendChild(h); };
      sec("Invoices");
      if (!invs.length) body.appendChild(el("p", "text-xs text-slate-500", "No invoices."));
      invs.forEach((inv) => {
        const row = el("div", "flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs");
        row.appendChild(el("span", "text-slate-300 font-mono", `${inv.number} · ${inv.status}`));
        const right = el("div", "flex items-center gap-2");
        right.appendChild(el("span", "text-slate-200 font-bold tabular-nums", pesoFmt(inv.amountDue, inv.currency)));
        if (inv.status === "open") {
          const retry = el("button", "text-[11px] font-bold text-indigo-300 hover:underline cursor-pointer", "Retry");
          retry.addEventListener("click", async () => {
            try { await billingFetch(`/admin/invoices/${inv._id}/retry`, { method: "POST", body: "{}" }); toast("Retry processed.", "success"); fetchSubsOverview(); refreshDrawer(sub._id); } catch (e) { toast(e.message, "error"); }
          });
          const paid = el("button", "text-[11px] font-bold text-emerald-300 hover:underline cursor-pointer", "Mark paid");
          paid.addEventListener("click", async () => {
            try { await billingFetch(`/admin/invoices/${inv._id}/mark-paid`, { method: "POST", body: "{}" }); toast("Marked paid.", "success"); fetchSubsOverview(); refreshDrawer(sub._id); } catch (e) { toast(e.message, "error"); }
          });
          right.appendChild(retry); right.appendChild(paid);
        }
        if (["paid", "partially_refunded"].includes(inv.status)) {
          const ref = el("button", "text-[11px] font-bold text-rose-300 hover:underline cursor-pointer", "Refund");
          ref.addEventListener("click", async () => {
            try { await billingFetch(`/admin/invoices/${inv._id}/refund`, { method: "POST", body: JSON.stringify({ reason: "Admin refund" }) }); toast("Refunded.", "success"); fetchSubsOverview(); refreshDrawer(sub._id); } catch (e) { toast(e.message, "error"); }
          });
          right.appendChild(ref);
        }
        row.appendChild(right);
        body.appendChild(row);
      });

      sec("Notifications to this clinic");
      if (!notes.length) body.appendChild(el("p", "text-xs text-slate-500", "None yet."));
      notes.forEach((n) => {
        const item = el("div", "bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2");
        item.appendChild(el("p", "text-[11px] font-bold text-slate-200", `${String(n.type).replace(/_/g, " ")} · ${new Date(n.createdAt).toLocaleString()}`));
        item.appendChild(el("p", "text-[11px] text-slate-400", n.message));
        body.appendChild(item);
      });
    } catch (e) {
      clear(body);
      body.appendChild(errorState(e.message, () => refreshDrawer(subId)));
    }
  }
  document.getElementById("sub-drawer-close")?.addEventListener("click", () => document.getElementById("sub-drawer")?.classList.add("hidden"));
  document.getElementById("sub-drawer-backdrop")?.addEventListener("click", () => document.getElementById("sub-drawer")?.classList.add("hidden"));

  // ---- notify modal ----
  const KIND_DEFAULTS = {
    expiring_soon: "Heads up — your subscription renews soon. Please make sure your payment method is up to date so there's no interruption.",
    trial_ending: "Your trial ends soon. Confirm your payment method to keep your workspace running without a gap.",
    overdue: "Your subscription payment is overdue. Please settle it as soon as possible to avoid suspension.",
    custom: "",
  };
  function openNotifyModal(subId, clinicName, sub) {
    notifySubId = subId;
    setText("notify-sub", `${clinicName} · ${sub?.planName || ""} · renews ${fmtDate(sub?.nextRenewalDate || sub?.trialEndsAt)}`);
    const kindSel = document.getElementById("notify-kind");
    const msg = document.getElementById("notify-message");
    const applyDefault = () => { if (!msg.value.trim() || msg.dataset.auto === "1") { msg.value = KIND_DEFAULTS[kindSel.value] || ""; msg.dataset.auto = "1"; } };
    kindSel.onchange = applyDefault;
    msg.oninput = () => { msg.dataset.auto = msg.value.trim() ? "0" : "1"; };
    msg.value = KIND_DEFAULTS[kindSel.value] || ""; msg.dataset.auto = "1";
    document.getElementById("notify-modal")?.classList.remove("hidden");
  }
  document.getElementById("notify-cancel")?.addEventListener("click", () => document.getElementById("notify-modal")?.classList.add("hidden"));
  document.getElementById("notify-send")?.addEventListener("click", async () => {
    if (!notifySubId) return;
    const kind = document.getElementById("notify-kind")?.value || "custom";
    const channel = document.getElementById("notify-channel")?.value || "both";
    const message = document.getElementById("notify-message")?.value.trim() || "";
    try {
      const out = await billingFetch(`/admin/subscriptions/${notifySubId}/notify`, { method: "POST", body: JSON.stringify({ kind, channel, message }) });
      toast(out.message || "Notice sent.", "success");
      document.getElementById("notify-modal")?.classList.add("hidden");
      fetchSubsOverview();
    } catch (e) { toast(e.message, "error"); }
  });

  // ---- subscriptions toolbar ----
  document.getElementById("sub-search")?.addEventListener("input", renderSubsTable);
  document.getElementById("sub-status-filter")?.addEventListener("change", renderSubsTable);
  document.getElementById("sub-expiring-only")?.addEventListener("change", renderSubsTable);
  document.getElementById("sub-refresh")?.addEventListener("click", fetchSubsOverview);
  document.getElementById("sub-run-cycle")?.addEventListener("click", async () => {
    try {
      const out = await billingFetch("/admin/run-cycle", { method: "POST", body: "{}" });
      const parts = Object.entries(out.data || {}).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => `${k}:${v}`);
      toast("Cycle run. " + (parts.join(", ") || "no changes"), "success");
      fetchSubsOverview(); fetchBillingActivity();
    } catch (e) { toast(e.message, "error"); }
  });

  // =======================================================================
  // 🧾 Billing activity tab
  // =======================================================================
  async function fetchBillingActivity() {
    const inv = document.getElementById("billing-invoices");
    const notifs = document.getElementById("billing-notifs");
    try {
      const [i, n] = await Promise.all([
        billingFetch("/admin/invoices?limit=8"),
        billingFetch("/admin/notifications?limit=8"),
      ]);
      if (inv) {
        clear(inv);
        (i.data || []).forEach((x) => {
          const row = el("div", "flex items-center justify-between gap-2 text-xs bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2");
          row.appendChild(el("span", "text-slate-300 font-mono", `${x.number} · ${x.status}`));
          row.appendChild(el("span", "text-slate-200 font-bold tabular-nums", pesoFmt(x.amountDue, x.currency)));
          inv.appendChild(row);
        });
        if (!(i.data || []).length) inv.appendChild(el("p", "text-xs text-slate-500", "No invoices."));
      }
      if (notifs) {
        clear(notifs);
        (n.data || []).forEach((x) => {
          const item = el("div", "text-xs bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2");
          item.appendChild(el("p", "font-bold text-slate-200", `${String(x.type).replace(/_/g, " ")} · ${x.clinicName || ""}`));
          item.appendChild(el("p", "text-slate-400", x.message));
          notifs.appendChild(item);
        });
        if (!(n.data || []).length) notifs.appendChild(el("p", "text-xs text-slate-500", "No notifications."));
      }
    } catch (e) {
      console.error("Billing activity failed:", e);
    }
  }
  document.getElementById("billing-refresh")?.addEventListener("click", fetchBillingActivity);

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  fetchDashboardMetrics();
  fetchPendingApplications();
  fetchAllTenants();
});
