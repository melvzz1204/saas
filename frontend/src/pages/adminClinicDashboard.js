// src/pages/adminClinicDashboard.js

const token = localStorage.getItem("token");
const userData = JSON.parse(localStorage.getItem("user") || "null");

const authorizedPersonnel = [
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "CLINIC_STAFF",
  "DENTIST",
];

if (!token || !userData || !authorizedPersonnel.includes(userData.role)) {
  console.warn("🛡️ Security Access Violation: Evicting unauthenticated user.");
  localStorage.clear();
  window.location.href = "/index.html?auth=login";
}

const clinicId = userData.clinicId;
let globalTreatmentsData = [];
let globalAppointmentsData = [];

// Start clinic-admin dashboards locked until application status is verified.
if (userData?.role === "CLINIC_ADMIN") setApplicationLock(true);

document.addEventListener("DOMContentLoaded", () => {
  // 1. Render logged-in user context profiles
  const displayEmailEl = document.getElementById("display-user-email");
  if (displayEmailEl) displayEmailEl.textContent = userData.email;

  // 2. Initial Data Sync Triggers
  fetchClinicMetadata();
  fetchApplicationStatus();
  // An application can be approved in the SaaS admin console while this page
  // remains open, so re-check status without requiring a new login.
  window.setInterval(fetchApplicationStatus, 30000);

  // 3. View Patient Live Terminal Site Event Listener
  const viewLiveSiteBtn = document.getElementById("viewLiveSiteBtn");
  if (viewLiveSiteBtn) {
    viewLiveSiteBtn.addEventListener("click", () => {
      const cachedSlug = localStorage.getItem("activeClinicSlug") || "default";

      // Seed the necessary context keys internally
      localStorage.setItem("clinicSlug", cachedSlug);

      console.log(
        `🔗 Redirecting to live patient login with clinic tracking parameter: ${cachedSlug}`,
      );

      // Include the 'clinic' query parameter so patientLogin.js can parse the workspace context
      window.open(
        `/clinicHomePage.html?clinic=${encodeURIComponent(cachedSlug)}`,
        "_blank",
      );
    });
  }

  // 4. Data Refresh / Synchronization Click Listeners
  const refreshAppointmentsBtn = document.getElementById(
    "refresh-appointments",
  );
  if (refreshAppointmentsBtn) {
    refreshAppointmentsBtn.addEventListener("click", fetchDashboardData);
  }

  const refreshStaffBtn = document.getElementById("refresh-staff");
  if (refreshStaffBtn) {
    refreshStaffBtn.addEventListener("click", fetchDashboardData);
  }

  // 5. Staff Onboarding Form Submit Binder
  const staffForm = document.getElementById("add-staff-form");
  if (staffForm) staffForm.addEventListener("submit", handleStaffOnboarding);

  // 6. Logout Core Trigger Link (main sidebar + gated takeover topbar)
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  const gatedLogoutBtn = document.getElementById("gated-logout-btn");
  if (gatedLogoutBtn) gatedLogoutBtn.addEventListener("click", handleLogout);

  setupLandingBuilder();

  // Deep link support: opening the dashboard with #/landing-page jumps
  // straight to the merged landing/profile editor.
  if (window.location.hash === "#/landing-page") {
    document.getElementById("nav-landing")?.click();
  }
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#/landing-page") {
      document.getElementById("nav-landing")?.click();
    }
  });
});

// =========================================================================
// 📊 METRICS & CODES SYNCHRONIZATION ENGINES
// =========================================================================

async function fetchClinicMetadata() {
  if (!clinicId) return;
  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}`),
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const resData = await response.json();
    if (resData.success && resData.data) {
      const nameDisplayEl = document.getElementById("display-clinic-name");
      if (nameDisplayEl) nameDisplayEl.textContent = resData.data.name;

      if (resData.data.slug) {
        localStorage.setItem("activeClinicSlug", resData.data.slug);
      }
    }
  } catch (err) {
    console.error("Failed to sync clinic profile strings:", err);
  }

  // The merged landing/profile endpoint back-fills any legacy profile data and
  // returns a complete draft + published pair.
  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}/landing`),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const resData = await response.json();
    if (resData.success && resData.data?.draft) {
      landingHydrateModel(resData.data.draft);
      landingRenderBuilder();
    }
  } catch (err) {
    console.error("Failed to load landing editor settings:", err);
  }
}

async function fetchApplicationStatus() {
  const panel = document.getElementById("application-review-panel");
  const pendingPanel = document.getElementById("application-pending-panel");
  const reason = document.getElementById("application-rejection-reason");
  const form = document.getElementById("application-resubmit-form");
  if (!panel || !clinicId) return;
  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}`),
      {
        headers: { Authorization: `Bearer ${token}`, "x-clinic-id": clinicId },
      },
    );
    const result = await response.json();
    const clinic = result.data;
    const status = clinic?.applicationStatus;
    const isLocked = status === "Rejected" || status === "Pending";
    setApplicationLock(isLocked);
    if (status === "Rejected") {
      panel.classList.remove("hidden");
      reason.textContent =
        clinic.rejectionReason || "Please upload valid verification documents.";
      renderPreviousDocs(clinic?.submittedDocuments || []);
    } else {
      panel.classList.add("hidden");
    }
    pendingPanel?.classList.toggle("hidden", status !== "Pending");
    // Takeover: hide the entire dashboard chrome when gated so only the
    // required action (or pending notice) is visible.
    if (status === "Rejected") setGatedMode("rejected", clinic);
    else if (status === "Pending") setGatedMode("pending", clinic);
    else setGatedMode(null, clinic);
    if (status === "Approved") fetchDashboardData();
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      initResubmitSlots();
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const feedback = document.getElementById(
          "application-resubmit-feedback",
        );
        const progress = document.getElementById("resubmit-progress");
        const submitBtn = document.getElementById(
          "application-resubmit-submit",
        );
        const businessInput = document.getElementById(
          "application-resubmit-business",
        );
        const medicalInput = document.getElementById(
          "application-resubmit-medical",
        );
        const businessFile = businessInput?.files?.[0];
        const medicalFile = medicalInput?.files?.[0];
        if (!businessFile || !medicalFile) {
          showResubmitFeedback(
            "Attach both documents — Business License and Medical License.",
            "error",
          );
          return;
        }
        const formData = new FormData();
        // Backend maps index 0 -> Business, index 1 -> Medical. Order matters.
        formData.append("documents", businessFile);
        formData.append("documents", medicalFile);
        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading…";
        progress?.classList.remove("hidden");
        hideResubmitFeedback();
        try {
          const upload = await fetch(
            window.apiUrl(`/api/v1/tenants/${clinicId}/resubmit-docs`),
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "x-clinic-id": clinicId,
              },
              body: formData,
            },
          );
          const uploadResult = await upload.json();
          if (!upload.ok || !uploadResult.success)
            throw new Error(uploadResult.message || "Resubmission failed.");
          showResubmitFeedback(
            "✅ Corrected documents submitted. Your application is now pending review.",
            "success",
          );
          submitBtn.textContent = "Submitted ✓";
          setTimeout(() => {
            panel.classList.add("hidden");
            resetResubmitSlots();
            pendingPanel?.classList.remove("hidden");
            setApplicationLock(true);
          }, 1400);
        } catch (error) {
          showResubmitFeedback(
            error.message || "Resubmission failed.",
            "error",
          );
          submitBtn.disabled = false;
          submitBtn.textContent = "Resubmit for review";
        } finally {
          progress?.classList.add("hidden");
        }
      });
    }
  } catch (error) {
    console.error("Failed to load clinic application status:", error);
    setApplicationLock(true);
  }
}

// ---- Resubmit UX helpers (two-slot uploads) ----
const RESUBMIT_MAX_BYTES = 5 * 1024 * 1024;
const RESUBMIT_ALLOWED_EXT = ["pdf", "png", "jpg", "jpeg", "webp"];

function resubmitFileError(file) {
  if (!file) return "";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!RESUBMIT_ALLOWED_EXT.includes(ext))
    return `“${file.name}” isn't accepted. Use PDF, JPG, PNG, or WEBP.`;
  if (file.size > RESUBMIT_MAX_BYTES)
    return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`;
  return "";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function showResubmitFeedback(message, type) {
  const feedback = document.getElementById("application-resubmit-feedback");
  if (!feedback) return;
  feedback.className =
    type === "success"
      ? "block rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs font-bold text-emerald-700"
      : "block rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-700";
  feedback.textContent = message;
}

function hideResubmitFeedback() {
  const feedback = document.getElementById("application-resubmit-feedback");
  if (!feedback) return;
  feedback.className = "hidden text-xs font-semibold";
  feedback.textContent = "";
}

function updateResubmitReadiness() {
  const businessFile = document.getElementById("application-resubmit-business")
    ?.files?.[0];
  const medicalFile = document.getElementById("application-resubmit-medical")
    ?.files?.[0];
  const ready = [businessFile, medicalFile].filter(Boolean).length;
  const hint = document.getElementById("resubmit-step-hint");
  const submitBtn = document.getElementById("application-resubmit-submit");
  if (hint) hint.textContent = `${ready} of 2 ready`;
  if (submitBtn) {
    submitBtn.disabled = ready !== 2;
    if (ready === 2 && submitBtn.textContent.startsWith("Attach")) {
      submitBtn.textContent = "Resubmit for review →";
    } else if (ready !== 2 && !submitBtn.disabled) {
      submitBtn.textContent = "Attach both documents to continue";
    }
  }
}

function paintSlot(kind, file, errorMsg) {
  const isBiz = kind === "business";
  const drop = document.getElementById(
    isBiz ? "drop-business" : "drop-medical",
  );
  const chip = document.getElementById(
    isBiz ? "business-file-chip" : "medical-file-chip",
  );
  const nameEl = document.getElementById(
    isBiz ? "business-file-name" : "medical-file-name",
  );
  const metaEl = document.getElementById(
    isBiz ? "business-file-meta" : "medical-file-meta",
  );
  const errEl = document.getElementById(
    isBiz ? "business-file-error" : "medical-file-error",
  );
  if (errorMsg) {
    if (errEl) {
      errEl.textContent = errorMsg;
      errEl.classList.remove("hidden");
    }
    drop?.classList.add("border-rose-400", "bg-rose-50/40");
    drop?.classList.remove("border-emerald-400");
  } else {
    errEl?.classList.add("hidden");
    drop?.classList.remove("border-rose-400", "bg-rose-50/40");
  }
  if (file && !errorMsg) {
    chip?.classList.remove("hidden");
    chip?.classList.add("flex");
    if (nameEl)
      nameEl.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    if (metaEl) metaEl.textContent = "Ready to upload ✓";
    drop?.classList.add("border-emerald-400");
  } else if (!file) {
    chip?.classList.add("hidden");
    chip?.classList.remove("flex");
    drop?.classList.remove("border-emerald-400");
  }
  updateResubmitReadiness();
}

function setSlotFile(kind, file) {
  const input = document.getElementById(
    kind === "business"
      ? "application-resubmit-business"
      : "application-resubmit-medical",
  );
  if (!input) return;
  if (!file) {
    input.value = "";
    paintSlot(kind, null, "");
    return;
  }
  const err = resubmitFileError(file);
  if (err) {
    input.value = "";
    paintSlot(kind, null, err);
    return;
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  paintSlot(kind, file, "");
}

function resetResubmitSlots() {
  ["business", "medical"].forEach((kind) => {
    const input = document.getElementById(
      kind === "business"
        ? "application-resubmit-business"
        : "application-resubmit-medical",
    );
    if (input) input.value = "";
    paintSlot(kind, null, "");
    const metaDefaults = {
      business:
        "Mayor's Permit, DTI/SEC, or equivalent · PDF/JPG/PNG/WEBP · max 5MB",
      medical:
        "PRC, professional, or facility license · PDF/JPG/PNG/WEBP · max 5MB",
    };
    const metaEl = document.getElementById(
      kind === "business" ? "business-file-meta" : "medical-file-meta",
    );
    if (metaEl) metaEl.textContent = metaDefaults[kind];
  });
  hideResubmitFeedback();
  const submitBtn = document.getElementById("application-resubmit-submit");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Attach both documents to continue";
  }
  updateResubmitReadiness();
}

function initResubmitSlots() {
  const configs = [
    {
      kind: "business",
      inputId: "application-resubmit-business",
      dropId: "drop-business",
      removeId: "business-file-remove",
    },
    {
      kind: "medical",
      inputId: "application-resubmit-medical",
      dropId: "drop-medical",
      removeId: "medical-file-remove",
    },
  ];
  configs.forEach(({ kind, inputId, dropId, removeId }) => {
    const input = document.getElementById(inputId);
    const drop = document.getElementById(dropId);
    input?.addEventListener("change", () =>
      setSlotFile(kind, input.files?.[0] || null),
    );
    document
      .getElementById(removeId)
      ?.addEventListener("click", () => setSlotFile(kind, null));
    if (drop && !drop.dataset.dndBound) {
      drop.dataset.dndBound = "true";
      ["dragenter", "dragover"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          drop.classList.add("border-indigo-500", "bg-indigo-50/50");
        }),
      );
      ["dragleave", "drop"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          drop.classList.remove("border-indigo-500", "bg-indigo-50/50");
        }),
      );
      drop.addEventListener("drop", (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) setSlotFile(kind, file);
      });
    }
  });
  updateResubmitReadiness();
}

function renderPreviousDocs(docs) {
  const list = document.getElementById("application-previous-docs");
  if (!list) return;
  list.replaceChildren();
  if (!docs.length) {
    const li = document.createElement("li");
    li.className = "text-xs text-slate-400 italic";
    li.textContent = "No documents on file yet.";
    list.appendChild(li);
    return;
  }
  docs.slice(-4).forEach((doc) => {
    const li = document.createElement("li");
    li.className =
      "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "📄";
    const text = document.createElement("span");
    text.className = "min-w-0 flex-1 truncate font-semibold text-slate-600";
    text.textContent = `${doc.documentType || "Document"} — ${doc.documentName || "file"}`;
    li.append(icon, text);
    if (doc.fileUrl && /^https?:\/\//i.test(doc.fileUrl)) {
      const link = document.createElement("a");
      link.href = doc.fileUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className =
        "shrink-0 text-[11px] font-bold text-indigo-600 hover:underline";
      link.textContent = "View ↗";
      li.appendChild(link);
    }
    list.appendChild(li);
  });
}

// Gated takeover: when the application is Rejected or Pending, hide the whole
// dashboard (sidebar, KPIs, panels) so only the required action is visible.
// Pass null to restore the full dashboard (Approved).
function setGatedMode(mode, clinic) {
  const normalized = mode === "rejected" || mode === "pending" ? mode : null;
  document.body.classList.toggle("app-gated", !!normalized);
  document.body.classList.toggle(
    "app-gated-rejected",
    normalized === "rejected",
  );
  document.body.classList.toggle("app-gated-pending", normalized === "pending");

  // Keep the takeover topbar in sync so the user still sees context + sign out.
  const gatedName = document.getElementById("gated-clinic-name");
  if (gatedName)
    gatedName.textContent =
      clinic?.name ||
      document.getElementById("display-clinic-name")?.textContent ||
      "Clinic workspace";
  const gatedEmail = document.getElementById("gated-user-email");
  if (gatedEmail) {
    const email =
      document.getElementById("display-user-email")?.textContent ||
      userData?.email ||
      "";
    gatedEmail.textContent =
      normalized === "rejected"
        ? `${email} · Rejected — action required`
        : normalized === "pending"
          ? `${email} · Pending review`
          : email;
  }

  // Move keyboard focus to the visible action for screen readers.
  if (normalized) {
    const target =
      normalized === "rejected"
        ? document
            .getElementById("application-review-panel")
            ?.querySelector("h2")
        : document
            .getElementById("application-pending-panel")
            ?.querySelector("h2");
    if (target) {
      if (!target.hasAttribute("tabindex"))
        target.setAttribute("tabindex", "-1");
      setTimeout(() => {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* noop */
        }
      }, 60);
    }
  }
}

function setApplicationLock(locked) {
  document.body.classList.toggle("application-locked", locked);
  document
    .querySelectorAll(
      ".nav-item, #viewLiveSiteBtn, #nav-staff-login, #dashboard-panels button, #dashboard-panels input, #dashboard-panels select, #dashboard-panels textarea, #dashboard-panels a",
    )
    .forEach((element) => {
      const isResubmissionControl = element.closest(
        "#application-review-panel",
      );
      if (element.id === "logout-btn" || isResubmissionControl) return;
      if (element.matches("a, button")) {
        element.setAttribute("aria-disabled", locked ? "true" : "false");
        element.tabIndex = locked ? -1 : 0;
      }
      if ("disabled" in element) element.disabled = locked;
    });
  document
    .getElementById("dashboard-panels")
    ?.classList.toggle("dashboard-locked", locked);
}

document.addEventListener(
  "click",
  (event) => {
    if (!document.body.classList.contains("application-locked")) return;
    if (
      event.target.closest(
        "#application-review-panel, #application-pending-panel, #logout-btn, #gated-topbar",
      )
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);

async function fetchDashboardData() {
  if (!clinicId) return;
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "x-clinic-id": clinicId,
    };

    const [apptRes, staffRes, servicesRes] = await Promise.all([
      fetch(window.apiUrl("/api/v1/admin/appointments"), { headers }),
      fetch(window.apiUrl("/api/v1/admin/staff"), { headers }),
      fetch(window.apiUrl("/api/v1/dental-price/services"), {
        headers,
      }).catch((err) => {
        console.warn("⚠️ Services fetch dropped early:", err);
        return null;
      }),
    ]);

    if (servicesRes && servicesRes.ok) {
      const servicesJson = await servicesRes.json();
      if (servicesJson && servicesJson.success) {
        globalTreatmentsData = servicesJson.data || [];
        console.log(
          "💎 Live Pricing Cache Synced Successfully:",
          globalTreatmentsData,
        );
      }
    } else {
      console.warn(
        "⚠️ Services endpoint returned error status. Check backend routing.",
      );
      globalTreatmentsData = [];
    }

    const appts = await apptRes.json();
    const staff = await staffRes.json();

    if (appts.success) {
      globalAppointmentsData = appts.data || [];
      renderAppointmentsTable(appts.data);
    }

    if (staff.success) {
      const kpiStaffEl = document.getElementById("kpi-total-staff");
      if (kpiStaffEl) kpiStaffEl.textContent = staff.data.length;

      // Live attention badge: staff not in Active status (On Leave /
      // Inactive) need a review. Refreshed on every pipeline update.
      const staffAttention = (staff.data || []).filter(
        (m) => String(m.status || "Active") !== "Active",
      ).length;
      setNavCountBadge("nav-staff-badge", staffAttention, "flagged");

      // Render staff rows into the active staff directory table
      renderStaffTable(staff.data);
    }
  } catch (err) {
    console.error("Workspace data synch failure:", err);
  }
}

// ---------------------------------------------------------------------------
// Navbar notification badges (Appointments Queue + Staff Management)
// ---------------------------------------------------------------------------
// Shows e.g. "2 new" on a nav badge; hides it at zero. Tone is baked into
// the markup (indigo for bookings, amber for staff attention).
function setNavCountBadge(id, count, label) {
  const badge = document.getElementById(id);
  if (!badge) return;
  if (!count) {
    badge.classList.add("hidden");
    badge.removeAttribute("aria-label");
    return;
  }
  badge.classList.remove("hidden");
  badge.textContent = `${count} ${label}`;
  badge.setAttribute("aria-label", `${count} ${label}`);
}

// Pending booking ids seen so far. Null until the first load so the initial
// fetch establishes a baseline instead of toasting for old bookings.
let knownPendingIds = null;

function bookingPatientName(appt) {
  if (appt.patientName) return appt.patientName;
  if (appt.patientId && typeof appt.patientId === "object") {
    return (
      `${appt.patientId.firstName || ""} ${appt.patientId.lastName || ""}`.trim() ||
      "Registered Patient"
    );
  }
  if (appt.userId && typeof appt.userId === "object") {
    return (
      `${appt.userId.firstName || ""} ${appt.userId.lastName || ""}`.trim() ||
      "Registered Patient"
    );
  }
  return "Walk-In Patient";
}

function notifyNewBooking(appt) {
  const when = [appt.date, appt.time].filter(Boolean).join(" @ ");
  const detail = [appt.service || appt.reason || "General Consultation", when]
    .filter(Boolean)
    .join(" · ");
  const message = `New booking: ${bookingPatientName(appt)}${detail ? ` — ${detail}` : ""}`;
  if (window.DashboardUI && typeof window.DashboardUI.toast === "function") {
    window.DashboardUI.toast(message, "info");
  }
}

function renderAppointmentsTable(appointments) {
  if (!Array.isArray(appointments)) appointments = [];
  const tableBody = document.getElementById("appointment-table-body");
  if (!tableBody) return;

  console.log("📥 Raw Appointments Array received from Server:", appointments);

  const totalApptsEl = document.getElementById("kpi-total-appointments");
  const pendingApptsEl = document.getElementById("kpi-pending-bookings");
  const todayBookingsEl = document.getElementById("kpi-today-bookings");
  const monthlyBookingsEl = document.getElementById("kpi-monthly-bookings");

  if (totalApptsEl) totalApptsEl.textContent = appointments.length;

  const pendingAppts = appointments.filter(
    (a) => a.status && a.status.toLowerCase() === "pending",
  );
  const pendingCount = pendingAppts.length;
  if (pendingApptsEl) pendingApptsEl.textContent = pendingCount;

  // Navbar badge: count of unapproved bookings. Toasts only for bookings that
  // arrived after the baseline load; approving/declining re-fetches, so the
  // badge clears automatically once nothing is pending.
  const pendingIds = new Set(pendingAppts.map((a) => String(a._id)));
  if (knownPendingIds === null) {
    knownPendingIds = pendingIds;
  } else {
    for (const appt of pendingAppts) {
      if (!knownPendingIds.has(String(appt._id))) notifyNewBooking(appt);
    }
    knownPendingIds = pendingIds;
  }
  setNavCountBadge("nav-appointments-badge", pendingCount, "new");

  const now = new Date();
  const dynamicToday = now.toISOString().split("T")[0];
  const dynamicMonth = dynamicToday.substring(0, 7);

  const todayCount = appointments.filter((appt) => {
    if (!appt.date) return false;
    const cleanDate = String(appt.date).trim().split("T")[0];
    return cleanDate === dynamicToday;
  }).length;

  const monthlyCount = appointments.filter((appt) => {
    if (!appt.date) return false;
    const cleanDate = String(appt.date).trim().split("T")[0];
    return cleanDate.startsWith(dynamicMonth);
  }).length;

  if (todayBookingsEl) todayBookingsEl.textContent = todayCount;
  if (monthlyBookingsEl) monthlyBookingsEl.textContent = monthlyCount;

  if (appointments.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">No appointments allocated for this specific clinic location.</td></tr>`;
    return;
  }

  tableBody.innerHTML = appointments
    .map((appt) => {
      const currentStatus = appt.status ? appt.status.toLowerCase() : "pending";
      let calculatedPatientName = "Walk-In Patient";

      if (appt.patientName) {
        calculatedPatientName = appt.patientName;
      } else if (appt.patientId && typeof appt.patientId === "object") {
        const fname = appt.patientId.firstName || "";
        const lname = appt.patientId.lastName || "";
        calculatedPatientName =
          `${fname} ${lname}`.trim() || "Registered Patient";
      } else if (appt.userId && typeof appt.userId === "object") {
        calculatedPatientName =
          `${appt.userId.firstName || ""} ${appt.userId.lastName || ""}`.trim();
      }

      const calculatedService =
        appt.service || appt.reason || "General Consultation";
      let statusClass =
        "bg-amber-500/10 text-amber-400 border border-amber-500/20";

      if (currentStatus === "confirmed" || currentStatus === "approved") {
        statusClass =
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      } else if (
        ["cancelled", "rejected", "declined"].includes(currentStatus)
      ) {
        statusClass = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      } else if (["missed", "no-show"].includes(currentStatus)) {
        statusClass =
          "bg-slate-500/10 text-slate-400 border border-slate-500/20";
      }

      const matchedTreatment = (
        typeof globalTreatmentsData !== "undefined" ? globalTreatmentsData : []
      ).find((t) => {
        if (!t.name) return false;
        const dbName = t.name.toLowerCase().trim();
        const apptService = calculatedService.toLowerCase().trim();
        const dbSlug = t.slug ? t.slug.toLowerCase().trim() : "";

        if (dbName === apptService || dbSlug === apptService) return true;
        return dbName.includes(apptService) || apptService.includes(dbName);
      });

      const calculatedFee =
        matchedTreatment && matchedTreatment.basePricePhp !== undefined
          ? `₱${Number(matchedTreatment.basePricePhp).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "₱0.00";

      return `
        <tr class="hover:bg-slate-900/10 transition-colors">
          <td class="p-4 font-bold text-slate-700">${calculatedPatientName}</td>
          <td class="p-4 font-mono text-[11px] text-slate-400 uppercase">${appt.date} @ ${appt.time}</td>
          <td class="p-4 text-slate-400 truncate max-w-[150px]">${calculatedService}</td>
          <td class="p-4">
              <span class="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                  ${calculatedFee}
              </span>
          </td>
          <td class="p-4">
              <span class="px-2.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${statusClass}">
                  ${appt.status}
              </span>
          </td>
          <td class="p-4 text-right space-x-1">
           ${
             currentStatus === "pending"
               ? `
               <button onclick="modifyAppointmentStatus('${appt._id}', 'Approved')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-bold text-[10px] tracking-wide transition-colors">Approve</button>
               <button onclick="modifyAppointmentStatus('${appt._id}', 'Declined')" class="bg-rose-50 hover:bg-rose-100 text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-200 px-2.5 py-1 rounded-md font-bold text-[10px] tracking-wide uppercase transition-colors cursor-pointer shadow-sm shadow-slate-100">Declined</button>
             `
               : currentStatus === "approved" || currentStatus === "confirmed"
                 ? `
               <button onclick="modifyAppointmentStatus('${appt._id}', 'Missed')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 px-2.5 py-1 rounded font-bold text-[10px] tracking-wide transition-colors">Mark Missed</button>
             `
                 : `<span class="text-[11px] text-slate-500 font-medium capitalize">${currentStatus}</span>`
           }
          </td>
        </tr>`;
    })
    .join("");
}

async function modifyAppointmentStatus(appointmentId, newStatus) {
  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/admin/appointments/${appointmentId}`),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify({ status: newStatus }),
      },
    );

    const result = await response.json();
    if (result.success) {
      fetchDashboardData();
    } else {
      window.DashboardUI.toast(`Action error: ${result.message}`, "error");
    }
  } catch (err) {
    console.error("Failed to dispatch patch operation:", err);
  }
}
window.modifyAppointmentStatus = modifyAppointmentStatus;

async function handleStaffOnboarding(e) {
  e.preventDefault();

  const pinRevealBox = document.getElementById("pin-reveal-box");
  const generatedPinDisplay = document.getElementById("generated-pin-display");
  if (pinRevealBox) pinRevealBox.classList.add("hidden");

  // Generate 6-digit access PIN
  const autoGeneratedPin = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();

  // Initialize FormData
  const formElement = e.target;
  const formData = new FormData(formElement);

  // Extract core inputs
  const staffName = document.getElementById("staff-name")?.value.trim() || "";
  const roleSelect = document.getElementById("staff-role")?.value || "";
  const emailValue = document.getElementById("staff-email")?.value.trim() || "";
  const phoneValue = document.getElementById("staff-phone")?.value.trim() || "";

  if (!staffName || !roleSelect || !emailValue || !phoneValue) {
    window.DashboardUI.toast(
      "Please fill in all core fields (Name, Role, Email, and Contact Number).",
      "warning",
    );
    return;
  }

  formData.set("fullName", staffName);
  formData.set("role", roleSelect);
  formData.set("email", emailValue);
  formData.set("phone", phoneValue);
  formData.set("accessPin", autoGeneratedPin);

  if (typeof clinicId !== "undefined" && clinicId) {
    formData.set("clinicId", clinicId);
  }

  // 🎯 Dynamic Specialization & Dentist Payload Cleanup
  if (roleSelect === "Dentist") {
    const specValue = document.getElementById("staff-spec")?.value.trim();
    formData.set("specialization", specValue || "General Dentistry");

    const licenseInput = document.getElementById("reg-license")?.value.trim();
    if (!licenseInput) {
      window.DashboardUI.toast(
        "License Number is required for Dentist registrations.",
        "warning",
      );
      return;
    }

    const expValue = document.getElementById("reg-experience")?.value.trim();
    if (expValue && !isNaN(expValue)) {
      formData.set("experienceYears", parseInt(expValue, 10));
    } else {
      formData.delete("experienceYears");
    }

    const imageInput = document.getElementById("reg-image");
    if (!imageInput || !imageInput.files || imageInput.files.length === 0) {
      formData.delete("profileImage");
    }
  } else {
    // Role is "Staff": Set non-clinical specialization & delete dentist-only keys
    formData.set("specialization", "General Support Staff");
    formData.delete("licenseNumber");
    formData.delete("experienceYears");
    formData.delete("bio");
    formData.delete("profileImage");
  }

  try {
    const response = await fetch(
        window.apiUrl("/api/v1/staff/register"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${typeof token !== "undefined" ? token : ""}`,
          "x-clinic-id": typeof clinicId !== "undefined" ? clinicId : "",
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      let parseMessage = "Failed to submit staff registration.";
      try {
        const errJson = JSON.parse(errorText);
        parseMessage = errJson.message || parseMessage;
      } catch {
        parseMessage = errorText || parseMessage;
      }
      throw new Error(parseMessage);
    }

    const result = await response.json();
    if (result.success || response.status === 201 || response.status === 200) {
      window.DashboardUI.toast("Staff member successfully added.", "success");

      if (pinRevealBox && generatedPinDisplay) {
        generatedPinDisplay.textContent = autoGeneratedPin;
        pinRevealBox.classList.remove("hidden");
      }

      formElement.reset();

      // Reset hidden sections
      const specContainer = document.getElementById("specialization-container");
      const dentistFields = document.getElementById("dentist-fields-container");
      if (specContainer) specContainer.classList.add("hidden");
      if (dentistFields) dentistFields.classList.add("hidden");

      if (typeof fetchDashboardData === "function") {
        fetchDashboardData();
      }
    } else {
      window.DashboardUI.toast(
        `Onboarding failure: ${result.message || "Unknown error."}`,
        "error",
      );
    }
  } catch (err) {
    console.error("Failed to register staff:", err);
    window.DashboardUI.toast(`Registration error: ${err.message}`, "error");
  }
}

function handleLogout() {
  localStorage.clear();
  window.location.href = "/index.html?auth=login";
}

// Render Staff Array into the Active Staff Directory Table
function renderStaffTable(staffList) {
  const tbody = document.getElementById("staff-table-body");
  if (!tbody) return;

  if (!staffList || staffList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400 italic font-medium">
          No active staff members registered for this clinic context.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = staffList
    .map((member) => {
      const displayName =
        member.fullName ||
        member.name ||
        `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
        "Staff Member";

      return `
    <tr class="hover:bg-slate-50/50 transition-colors">
      <td class="p-3.5 pl-5">
        <div class="font-bold text-slate-900">${displayName}</div>
      </td>
      <td class="p-3.5">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
          ${member.role || "Staff"}
        </span>
      </td>
      <td class="p-3.5 text-slate-600 font-medium">
        ${member.specialization || "General Dentistry"}
      </td>
      <td class="p-3.5 text-slate-600">
        <div>${member.email || "—"}</div>
        <div class="text-[10px] text-slate-400">${member.phone || "N/A"}</div>
      </td>
      <td class="p-3.5 pr-5 text-right space-x-2">
        <!-- 🎯 NEW RESET PIN BUTTON -->
        <button onclick="handleResetStaffPassword('${member._id}')" class="text-[11px] text-amber-600 hover:text-amber-800 font-bold uppercase tracking-wider cursor-pointer">
          Reset PIN
        </button>
        <!-- EXISTING DEACTIVATE BUTTON -->
        <button onclick="removeStaffMember('${member._id}')" class="text-[11px] text-rose-600 hover:text-rose-800 font-bold uppercase tracking-wider cursor-pointer">
          Deactivate
        </button>
      </td>
    </tr>`;
    })
    .join("");
}

// Staff Deactivation Handler
async function removeStaffMember(staffId) {
  const ok = await window.DashboardUI.confirm({
    title: "Deactivate staff member",
    body: "This staff member will lose workspace access. You can re-add them later.",
    confirmLabel: "Deactivate",
    danger: true,
  });
  if (!ok) return;

  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/admin/staff/${staffId}`),
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
        },
      },
    );

    const resData = await response.json();
    if (resData.success || response.ok) {
      fetchDashboardData();
    } else {
      window.DashboardUI.toast(
        `Deactivation error: ${resData.message || "Unable to remove staff member."}`,
        "error",
      );
    }
  } catch (err) {
    console.error("Failed to deactivate staff member:", err);
  }
}
window.removeStaffMember = removeStaffMember;

// Real-time Event Subscription Layout
const socket = io(window.socketUrl(), {
  transports: ["websocket"],
  upgrade: false,
});
// =========================================================================
// 🔑 STAFF PIN RESET HANDLER (WITH CUSTOM POPUP MODAL)
// =========================================================================

async function handleResetStaffPassword(staffId) {
  const ok = await window.DashboardUI.confirm({
    title: "Reset staff PIN",
    body: "Generate a new temporary access PIN for this staff member? Their current PIN will stop working immediately.",
    confirmLabel: "Generate PIN",
  });
  if (!ok) return;

  try {
    const token = localStorage.getItem("token").replace(/['"]+/g, "");

    const response = await fetch(
      window.apiUrl("/api/v1/staff/reset-pin"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify({ staffId }),
      },
    );

    const data = await response.json();

    if (response.ok || data.success) {
      // 🎯 Open the pop-up modal with the generated PIN!
      openResetPinModal(data.tempPin);
    } else {
      window.DashboardUI.toast(`Failed to reset PIN: ${data.message}`, "error");
    }
  } catch (err) {
    console.error("Reset failed:", err);
    window.DashboardUI.toast(
      "Network error resetting PIN. Please try again.",
      "error",
    );
  }
}
window.handleResetStaffPassword = handleResetStaffPassword;

// 🎯 Modal Helper Functions
function openResetPinModal(tempPin) {
  const modal = document.getElementById("reset-pin-modal");
  const pinDisplay = document.getElementById("reset-modal-pin-display");
  const copyBtnText = document.getElementById("copy-btn-text");

  if (pinDisplay) pinDisplay.textContent = tempPin;
  if (copyBtnText) copyBtnText.textContent = "Copy PIN";

  if (modal) modal.classList.remove("hidden");
}

function closeResetPinModal() {
  const modal = document.getElementById("reset-pin-modal");
  if (modal) modal.classList.add("hidden");
}

async function copyResetPinToClipboard() {
  const pinText = document.getElementById(
    "reset-modal-pin-display",
  )?.textContent;
  const copyBtnText = document.getElementById("copy-btn-text");

  if (!pinText) return;

  try {
    await navigator.clipboard.writeText(pinText);
    if (copyBtnText) copyBtnText.textContent = "Copied! ✓";

    // Reset button label back to 'Copy PIN' after 2.5 seconds
    setTimeout(() => {
      if (copyBtnText) copyBtnText.textContent = "Copy PIN";
    }, 2500);
  } catch (err) {
    console.error("Clipboard copy failed:", err);
  }
}
// =========================================================================
// 📊 FINANCIAL & OPERATIONAL REPORT GENERATOR (CSV EXPORT)
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("export-report-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", generateClinicReportCSV);
  }
});

function generateClinicReportCSV() {
  if (!globalAppointmentsData || globalAppointmentsData.length === 0) {
    window.DashboardUI.toast(
      "No appointment data available to generate a report.",
      "info",
    );
    return;
  }

  let totalRealizedRevenue = 0;
  let totalLostRevenue = 0;
  let totalPendingRevenue = 0;

  let confirmedCount = 0;
  let missedCount = 0;
  let pendingCount = 0;

  // 1. Calculate Metrics & Prepare Flat Data
  const rowData = globalAppointmentsData.map((appt) => {
    const currentStatus = appt.status ? appt.status.toLowerCase() : "pending";

    // Calculate Patient Name
    let patientName = "Walk-In Patient";
    if (appt.patientName) patientName = appt.patientName;
    else if (appt.patientId && typeof appt.patientId === "object") {
      patientName =
        `${appt.patientId.firstName || ""} ${appt.patientId.lastName || ""}`.trim();
    } else if (appt.userId && typeof appt.userId === "object") {
      patientName =
        `${appt.userId.firstName || ""} ${appt.userId.lastName || ""}`.trim();
    }

    const serviceName = appt.service || appt.reason || "General Consultation";

    // Calculate Fee based on globalTreatmentsData
    const matchedTreatment = globalTreatmentsData.find((t) => {
      if (!t.name) return false;
      const dbName = t.name.toLowerCase().trim();
      return dbName.includes(serviceName.toLowerCase().trim());
    });

    const rawFee =
      matchedTreatment && matchedTreatment.basePricePhp
        ? Number(matchedTreatment.basePricePhp)
        : 0;

    // Accumulate Financial & Ops Totals
    if (["confirmed", "approved"].includes(currentStatus)) {
      totalRealizedRevenue += rawFee;
      confirmedCount++;
    } else if (
      ["cancelled", "rejected", "declined", "missed", "no-show"].includes(
        currentStatus,
      )
    ) {
      totalLostRevenue += rawFee;
      if (["missed", "no-show"].includes(currentStatus)) missedCount++;
    } else if (currentStatus === "pending") {
      totalPendingRevenue += rawFee;
      pendingCount++;
    }

    return [
      `"${patientName}"`,
      `"${appt.date || "N/A"}"`,
      `"${appt.time || "N/A"}"`,
      `"${serviceName}"`,
      `"PHP ${rawFee.toFixed(2)}"`,
      `"${appt.status || "Pending"}"`,
    ].join(",");
  });

  // 2. Format the CSV Document
  const dateStr = new Date().toISOString().split("T")[0];
  let csvContent = "data:text/csv;charset=utf-8,";

  // --- SECTION: Financial & Operations Summary ---
  csvContent += "CLINIC FINANCIAL & OPERATIONS SUMMARY\n";
  csvContent += `Report Generated On:,${dateStr}\n\n`;

  csvContent += "FINANCIAL DASHBOARD\n";
  csvContent += `Realized Revenue (Approved/Confirmed):,PHP ${totalRealizedRevenue.toFixed(2)}\n`;
  csvContent += `Pending Pipeline (Waiting Approval):,PHP ${totalPendingRevenue.toFixed(2)}\n`;
  csvContent += `Lost Revenue (Missed/Cancelled):,PHP ${totalLostRevenue.toFixed(2)}\n\n`;

  csvContent += "OPERATIONS & ATTENDANCE\n";
  csvContent += `Total Processed Appointments:,${globalAppointmentsData.length}\n`;
  csvContent += `Completed / Approved:,${confirmedCount}\n`;
  csvContent += `No-Shows / Missed:,${missedCount}\n`;
  csvContent += `Pending Actions Needed:,${pendingCount}\n\n`;

  // --- SECTION: Raw Operations Data (The Itinerary) ---
  csvContent += "RAW APPOINTMENT LOG\n";
  csvContent +=
    "Patient Name,Date,Time,Service Requested,Expected Fee,Status\n";
  csvContent += rowData.join("\n");

  // 3. Trigger the Browser Download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Clinic_Report_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Attach helpers to global window object
window.openResetPinModal = openResetPinModal;
window.closeResetPinModal = closeResetPinModal;
window.copyResetPinToClipboard = copyResetPinToClipboard;
window.handleResetStaffPassword = handleResetStaffPassword;
socket.on("pipeline-update", async () => {
  if (typeof fetchDashboardData === "function") {
    await fetchDashboardData();
  } else {
    window.location.reload();
  }
});

// =========================================================================
// ⭐ PATIENT FEEDBACK MODULE (read-only — reviews publish automatically,
// no moderation; the list below mirrors what patients see publicly)
// =========================================================================

function testimonialStars(rating) {
  const value = Math.min(5, Math.max(1, Number(rating) || 0));
  return `<span class="text-amber-500 text-sm" aria-hidden="true">${"★".repeat(
    value,
  )}${"☆".repeat(5 - value)}</span>
    <span class="sr-only">${value} out of 5 stars</span>`;
}

async function loadTestimonials() {
  const list = document.getElementById("testimonials-moderation-list");
  if (!list || !clinicId) return;

  try {
    const response = await fetch(
      window.apiUrl(`/api/v1/clinics/${encodeURIComponent(
        clinicId,
      )}/testimonials/admin`),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": clinicId,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || `HTTP ${response.status}`);

    const testimonials = result.data || [];
    if (testimonials.length === 0) {
      list.innerHTML = `
        <div class="bg-white border border-slate-200/80 rounded-xl p-8 text-center">
          <span class="text-2xl block mb-2">⭐</span>
          <p class="text-xs font-bold text-slate-600 uppercase tracking-wider">No patient feedback yet</p>
          <p class="text-[11px] text-slate-400 mt-1">New reviews appear here automatically the moment patients submit them</p>
        </div>`;
      return;
    }

    list.innerHTML = testimonials
      .map((t) => {
        const patientLabel = t.anonymous
          ? "Anonymous"
          : `${t.patient?.firstName || "Patient"} ${
              t.patient?.lastNameInitial ? `${t.patient.lastNameInitial}.` : ""
            }`.trim();
        const verifiedBadge =
          t.verified === true
            ? '<span class="text-[10px] font-bold uppercase tracking-wide text-indigo-600 ml-2">✓ Verified</span>'
            : "";
        const dateLabel = t.date
          ? new Date(t.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";

        return `
        <div class="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-3" data-testimonial-id="${t._id}">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-black text-slate-900 text-sm truncate">${patientLabel}</span>
              ${verifiedBadge}
            </div>
            <div class="flex items-center gap-3">
              ${testimonialStars(t.rating)}
              <span class="text-xs font-bold text-slate-700">${t.rating}/5</span>
            </div>
          </div>
          <blockquote class="text-sm leading-6 text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3.5">"${t.reviewText}"</blockquote>
          <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span class="text-[11px] font-semibold text-slate-400">${dateLabel || ""}</span>
          </div>
        </div>`;
      })
      .join("");
  } catch (error) {
    console.error("Unable to load testimonials:", error);
    list.innerHTML = `
      <div class="bg-white border border-rose-200 rounded-xl p-8 text-center">
        <p class="text-xs font-bold text-rose-700">Could not load patient feedback.</p>
        <p class="text-[11px] text-rose-500 mt-1">${
          typeof AppFeedback?.safeMessage === "function"
            ? AppFeedback.safeMessage(
                error,
                error.status ? { status: error.status } : null,
              )
            : "Please try again."
        }</p>
        <button type="button" id="retry-testimonials"
          class="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 transition-colors cursor-pointer">Try again</button>
      </div>`;
    document
      .getElementById("retry-testimonials")
      ?.addEventListener("click", loadTestimonials);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("testimonials-moderation-list");
  const refreshBtn = document.getElementById("refresh-testimonials");

  if (list) {
    refreshBtn?.addEventListener("click", loadTestimonials);

    // Load once the panel exists (nav.js hides/shows panels)
    loadTestimonials();
  }
});

// Join the clinic's real-time room to receive new testimonial notifications
socket.on("connect", () => {
  if (clinicId) {
    socket.emit("join_clinic_room", clinicId);
  }
});

socket.on("testimonial:new", () => {
  // New patient feedback arrived (already live) — refresh the list
  loadTestimonials();
});

// =========================================================================
// 🎨 LANDING PAGE BUILDER
// =========================================================================
const LANDING_SECTIONS = [
  { key: "custom", label: "Custom content blocks" },
  { key: "services", label: "Services & treatment catalog" },
  { key: "dentists", label: "Meet the dentists" },
  { key: "testimonials", label: "Patient reviews" },
  { key: "visit", label: "Visit us (address & hours)" },
  { key: "pricing", label: "Pricing table" },
];
const LANDING_BLOCK_BACKGROUNDS = [
  { value: "none", label: "None" },
  { value: "muted", label: "Soft gray" },
  { value: "brand", label: "Brand tint" },
];
const LANDING_BLOCK_ALIGNMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
];
const LANDING_PRESETS = {
  "clean-clinical": {
    name: "Clean & Clinical",
    primaryColor: "#0f766e",
    secondaryColor: "#14b8a6",
    headerBackground: "#ffffff",
    footerBackground: "#0f172a",
    typography: "clean",
    tagline: "Gentle, modern dentistry for every smile",
    heroEyebrow: "Welcome to",
    sectionOrder: [
      "custom",
      "services",
      "dentists",
      "testimonials",
      "visit",
      "pricing",
    ],
    hiddenSections: [],
    sectionTexts: {
      services: {
        eyebrow: "Our Services",
        heading: "Comprehensive Dental Care",
        intro:
          "From routine checkups to advanced treatments, we offer a full range of dental services tailored to your needs.",
      },
      dentists: {
        eyebrow: "Meet Our Dentists",
        heading: "Expert Team, Personalized Care",
        intro:
          "Our experienced dentists are dedicated to providing you with the highest standard of care in a comfortable environment.",
      },
      testimonials: {
        eyebrow: "Patient Reviews",
        heading: "What Our Patients Say",
        intro:
          "See what our patients have to say about their experience at our clinic.",
      },
      visit: {
        eyebrow: "Visit Us",
        heading: "We're Here to Help",
        intro:
          "Located in the heart of the community, our clinic is easy to reach and always welcoming.",
      },
      pricing: {
        eyebrow: "Pricing",
        heading: "Transparent Pricing",
        intro:
          "We believe in clear, honest pricing so you can focus on your dental health.",
      },
    },
    blocks: [
      {
        type: "text",
        heading: "Why Choose Us?",
        body: "With years of experience and a passion for dental excellence, we combine the latest technology with a compassionate approach to ensure your comfort at every visit.",
        background: "muted",
        align: "left",
      },
    ],
  },
  "warm-family": {
    name: "Warm & Family",
    primaryColor: "#ea580c",
    secondaryColor: "#f59e0b",
    headerBackground: "#fff7ed",
    footerBackground: "#1c1917",
    typography: "rounded",
    tagline: "Caring for your family's smiles",
    heroEyebrow: "A Family Affair",
    sectionOrder: [
      "custom",
      "services",
      "dentists",
      "testimonials",
      "visit",
      "pricing",
    ],
    hiddenSections: [],
    sectionTexts: {
      services: {
        eyebrow: "Family Dental Services",
        heading: "Dental Care for Every Age",
        intro:
          "From your child's first visit to grandparent's dentures, we provide gentle care the whole family can trust.",
      },
      dentists: {
        eyebrow: "Meet Our Dentists",
        heading: "Friendly Faces, Skilled Hands",
        intro:
          "Our dentists love working with families and make every visit a positive experience for kids and adults alike.",
      },
      testimonials: {
        eyebrow: "Happy Families",
        heading: "Real Families, Real Smiles",
        intro: "Hear from families who trust us with their dental health.",
      },
      visit: {
        eyebrow: "Visit Us",
        heading: "Your Family's Second Home",
        intro:
          "We designed our clinic to feel warm and welcoming for the whole family.",
      },
      pricing: {
        eyebrow: "Pricing",
        heading: "Fair & Friendly Prices",
        intro:
          "We offer flexible payment options so quality dental care is always within reach.",
      },
    },
    blocks: [
      {
        type: "text",
        heading: "A Place Where Families Thrive",
        body: "Our clinic is designed to make dental visits fun and stress-free. With games, kid-friendly decor, and gentle techniques, even the littlest patients look forward to their appointments.",
        background: "brand",
        align: "center",
      },
    ],
  },
  "luxury-elegant": {
    name: "Luxury & Elegant",
    primaryColor: "#1e3a5f",
    secondaryColor: "#d4a843",
    headerBackground: "#f8fafc",
    footerBackground: "#0f172a",
    typography: "elegant",
    tagline: "Premium dental care, crafted with precision",
    heroEyebrow: "Excellence in Dentistry",
    sectionOrder: [
      "custom",
      "services",
      "dentists",
      "testimonials",
      "visit",
      "pricing",
    ],
    hiddenSections: [],
    sectionTexts: {
      services: {
        eyebrow: "Premium Services",
        heading: "Artistry Meets Science",
        intro:
          "Experience dental care that transcends the ordinary. Our advanced treatments deliver results that are as beautiful as they are healthy.",
      },
      dentists: {
        eyebrow: "Our Dentists",
        heading: "Master Clinicians",
        intro:
          "Board-certified specialists with decades of experience in cosmetic, restorative, and implant dentistry.",
      },
      testimonials: {
        eyebrow: "Testimonials",
        heading: "Words from Discerning Patients",
        intro:
          "Our patients choose us for our unparalleled attention to detail and transformative results.",
      },
      visit: {
        eyebrow: "Visit Us",
        heading: "Where Luxury Meets Comfort",
        intro:
          "Our boutique clinic offers a serene environment designed for your relaxation and peace of mind.",
      },
      pricing: {
        eyebrow: "Pricing",
        heading: "Investment in Your Smile",
        intro:
          "We provide detailed treatment plans with transparent pricing so you can make informed decisions.",
      },
    },
    blocks: [
      {
        type: "text",
        heading: "Redefining the Standard of Care",
        body: "Every detail matters. From the finest materials to the most advanced techniques, we create smiles that inspire confidence for a lifetime.",
        background: "muted",
        align: "left",
      },
    ],
  },
  "bright-energetic": {
    name: "Bright & Energetic",
    primaryColor: "#e11d48",
    secondaryColor: "#06b6d4",
    headerBackground: "#fef2f2",
    footerBackground: "#1e1b4b",
    typography: "rounded",
    tagline: "Big smiles start here",
    heroEyebrow: "Welcome!",
    sectionOrder: [
      "custom",
      "services",
      "dentists",
      "testimonials",
      "visit",
      "pricing",
    ],
    hiddenSections: [],
    sectionTexts: {
      services: {
        eyebrow: "Services",
        heading: "Dental Care That Pops",
        intro:
          "From whitening to braces, we offer treatments that keep your smile bright and your confidence high.",
      },
      dentists: {
        eyebrow: "Meet the Team",
        heading: "Fun & Friendly Dentists",
        intro:
          "We believe dental visits should be exciting. Our team brings energy and expertise to every appointment.",
      },
      testimonials: {
        eyebrow: "Reviews",
        heading: "Patient Love",
        intro:
          "Our patients can't stop smiling about their results. See what they have to say!",
      },
      visit: {
        eyebrow: "Visit Us",
        heading: "Let's Get Started",
        intro:
          "Ready for a brighter smile? Book your appointment today and feel the difference.",
      },
      pricing: {
        eyebrow: "Pricing",
        heading: "No Surprises",
        intro:
          "Clear pricing with no hidden fees. We make it easy to get the smile you've always wanted.",
      },
    },
    blocks: [
      {
        type: "text",
        heading: "Your Brightest Smile Starts Today",
        body: "We're passionate about giving you the smile you've always wanted. With modern techniques and a fun atmosphere, the dentist's office has never felt better.",
        background: "brand",
        align: "center",
      },
    ],
  },
  "minimal-pure": {
    name: "Minimal & Pure",
    primaryColor: "#334155",
    secondaryColor: "#94a3b8",
    headerBackground: "#ffffff",
    footerBackground: "#f1f5f9",
    typography: "clean",
    tagline: "Precision. Clarity. Care.",
    heroEyebrow: "Modern Dentistry",
    sectionOrder: [
      "custom",
      "services",
      "dentists",
      "testimonials",
      "visit",
      "pricing",
    ],
    hiddenSections: [],
    sectionTexts: {
      services: {
        eyebrow: "Services",
        heading: "Essential Dental Care",
        intro:
          "We focus on what matters: thorough exams, precise treatments, and preventive care that keeps your teeth healthy for life.",
      },
      dentists: {
        eyebrow: "Our Dentists",
        heading: "Skilled & Dedicated",
        intro:
          "Our team brings years of experience and a commitment to excellence to every patient interaction.",
      },
      testimonials: {
        eyebrow: "Reviews",
        heading: "Patient Feedback",
        intro: "See why patients trust us for their dental needs.",
      },
      visit: {
        eyebrow: "Visit Us",
        heading: "Find Us",
        intro:
          "Conveniently located with ample parking, our clinic makes visiting easy.",
      },
      pricing: {
        eyebrow: "Pricing",
        heading: "Transparent Pricing",
        intro:
          "Clear, straightforward pricing with no surprises. We believe in honest communication.",
      },
    },
    blocks: [
      {
        type: "text",
        heading: "Simplicity in Practice",
        body: "We strip away the unnecessary and focus on what truly matters: excellent dental care delivered with clarity and care.",
        background: "none",
        align: "left",
      },
    ],
  },
};
const LANDING_COLOR_SWATCHES = [
  ...new Set(
    Object.values(LANDING_PRESETS).flatMap((p) =>
      [p.primaryColor, p.secondaryColor].filter(Boolean),
    ),
  ),
];
const LANDING_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LANDING_TYPOGRAPHIES = ["default", "clean", "elegant", "rounded"];
const LANDING_SOCIAL_PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter / X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "website", label: "Website" },
];
// Static sections whose eyebrow / heading / intro can be edited.
const LANDING_SECTION_TEXT_KEYS = [
  { key: "services", label: "Services" },
  { key: "dentists", label: "Meet the dentists" },
  { key: "testimonials", label: "Patient reviews" },
  { key: "pricing", label: "Pricing" },
  { key: "visit", label: "Visit us" },
];

// Whole-page layout templates. Populated from GET /api/v1/landing/catalog on
// load (see landingLoadCatalog); this is the fallback if that fetch fails so
// the builder still works offline. Kept in sync with backend/src/utils/landingTemplates.js.
let LANDING_TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    description:
      "A timeless, trust-first layout: centered hero, service cards, and clearly separated sections.",
    thumbnail: "/clinic-templates/thumbnails/classic.svg",
    presets: [
      "clean-clinical",
      "warm-family",
      "luxury-elegant",
      "bright-energetic",
      "minimal-pure",
    ],
    defaultPreset: "clean-clinical",
  },
  {
    id: "split",
    name: "Split Hero",
    description:
      "A bold two-column hero with a booking panel, followed by alternating full-width sections.",
    thumbnail: "/clinic-templates/thumbnails/split.svg",
    presets: [
      "clean-clinical",
      "warm-family",
      "luxury-elegant",
      "bright-energetic",
      "minimal-pure",
    ],
    defaultPreset: "luxury-elegant",
  },
  {
    id: "scroll",
    name: "Single Scroll",
    description:
      "A single-page storytelling scroll with large stacked sections and a sticky booking bar.",
    thumbnail: "/clinic-templates/thumbnails/scroll.svg",
    presets: [
      "clean-clinical",
      "warm-family",
      "luxury-elegant",
      "bright-energetic",
      "minimal-pure",
    ],
    defaultPreset: "bright-energetic",
  },
];
const LANDING_DEFAULT_TEMPLATE = "classic";

function landingTemplateById(id) {
  return LANDING_TEMPLATES.find((t) => t.id === id) || null;
}

// Fetch the developer-defined template + preset catalog from the backend so the
// dashboard never drifts from the server's source of truth. Falls back silently
// to the hardcoded LANDING_TEMPLATES above if the request fails.
async function landingLoadCatalog() {
  try {
    const res = await fetch(window.apiUrl("/api/v1/landing/catalog"));
    const data = await res.json();
    if (
      data?.success &&
      Array.isArray(data.data?.templates) &&
      data.data.templates.length
    ) {
      LANDING_TEMPLATES = data.data.templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        thumbnail: t.thumbnail,
        presets: Array.isArray(t.presets) ? t.presets : [],
        defaultPreset: t.defaultPreset,
      }));
    }
  } catch {
    // Keep the fallback catalog.
  }
}

function landingDefaults() {
  return {
    template: LANDING_DEFAULT_TEMPLATE,
    preset: "",
    logoUrl: "",
    primaryColor: "",
    secondaryColor: "",
    headerBackground: "",
    footerBackground: "",
    typography: "default",
    tagline: "",
    description: "",
    heroEyebrow: "",
    sectionTexts: {},
    socialLinks: [],
    blocks: [],
    hiddenSections: [],
    sectionOrder: [],
  };
}
let landingModel = landingDefaults();

function landingSectionTextDefaults() {
  return { eyebrow: "", heading: "", intro: "" };
}

function landingHydrateModel(draft) {
  const d = draft || {};
  const sectionTexts = {};
  LANDING_SECTION_TEXT_KEYS.forEach(({ key }) => {
    const st = (
      d.sectionTexts && typeof d.sectionTexts === "object" ? d.sectionTexts : {}
    )[key];
    sectionTexts[key] = {
      eyebrow: st?.eyebrow || "",
      heading: st?.heading || "",
      intro: st?.intro || "",
    };
  });
  const presetName = d.preset && LANDING_PRESETS[d.preset] ? d.preset : "";
  landingModel = {
    template: landingTemplateById(d.template)
      ? d.template
      : LANDING_DEFAULT_TEMPLATE,
    preset: presetName,
    logoUrl: d.logoUrl || "",
    primaryColor:
      d.primaryColor || LANDING_PRESETS[presetName]?.primaryColor || "",
    secondaryColor:
      d.secondaryColor || LANDING_PRESETS[presetName]?.secondaryColor || "",
    headerBackground:
      d.headerBackground || LANDING_PRESETS[presetName]?.headerBackground || "",
    footerBackground:
      d.footerBackground || LANDING_PRESETS[presetName]?.footerBackground || "",
    typography: LANDING_TYPOGRAPHIES.includes(d.typography)
      ? d.typography
      : LANDING_PRESETS[presetName]?.typography || "default",
    tagline: d.tagline || LANDING_PRESETS[presetName]?.tagline || "",
    description: d.description || "",
    heroEyebrow:
      d.heroEyebrow || LANDING_PRESETS[presetName]?.heroEyebrow || "",
    sectionTexts,
    socialLinks: Array.isArray(d.socialLinks)
      ? d.socialLinks.map((l) => ({
          platform: LANDING_SOCIAL_PLATFORMS.some(
            (p) => p.value === l?.platform,
          )
            ? l.platform
            : "website",
          url: l?.url || "",
        }))
      : [],
    blocks:
      Array.isArray(d.blocks) && d.blocks.length
        ? d.blocks.map((b) => ({
            type: b.type === "image" ? "image" : "text",
            heading: b.heading || "",
            body: b.body || "",
            imageUrl: b.imageUrl || "",
            background: ["none", "muted", "brand"].includes(b.background)
              ? b.background
              : "none",
            align: ["left", "center"].includes(b.align) ? b.align : "left",
          }))
        : [...(LANDING_PRESETS[presetName]?.blocks || [])],
    hiddenSections:
      Array.isArray(d.hiddenSections) && d.hiddenSections.length
        ? d.hiddenSections.slice()
        : [...(LANDING_PRESETS[presetName]?.hiddenSections || [])],
    sectionOrder:
      Array.isArray(d.sectionOrder) && d.sectionOrder.length
        ? d.sectionOrder.slice()
        : [...(LANDING_PRESETS[presetName]?.sectionOrder || [])],
  };
}

function landingExpandHex(h) {
  return (
    "#" +
    h
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")
  );
}

function applyPreset(presetName, silent = false) {
  const preset = LANDING_PRESETS[presetName];
  if (!preset) return;
  landingModel.preset = presetName;
  landingModel.primaryColor = preset.primaryColor;
  landingModel.secondaryColor = preset.secondaryColor;
  landingModel.headerBackground = preset.headerBackground;
  landingModel.footerBackground = preset.footerBackground;
  landingModel.typography = preset.typography;
  landingModel.tagline = preset.tagline;
  landingModel.heroEyebrow = preset.heroEyebrow;
  if (preset.sectionTexts) {
    const cloned = {};
    for (const [k, v] of Object.entries(preset.sectionTexts)) {
      cloned[k] = { ...v };
    }
    landingModel.sectionTexts = cloned;
  }
  if (preset.sectionOrder) {
    landingModel.sectionOrder = [...preset.sectionOrder];
  }
  if (preset.hiddenSections) {
    landingModel.hiddenSections = [...preset.hiddenSections];
  }
  if (preset.blocks) {
    landingModel.blocks = [...preset.blocks.map((b) => ({ ...b }))];
  }
  if (!silent) {
    landingRenderBuilder();
    landingPushPreview();
  }
}

// Switch the whole-page layout. Colors/text/content are layout-agnostic and
// carry over; we only change which template renders them. If the live preview
// is open, reload it with the newly chosen (possibly unsaved) layout.
function applyTemplate(templateId) {
  if (!landingTemplateById(templateId)) return;
  if (landingModel.template === templateId) return;
  landingModel.template = templateId;
  landingRenderTemplateCards();
  landingReloadPreviewTemplate();
  landingSetStatus("Template changed — Save or Publish to make it live.");
}

function landingReloadPreviewTemplate() {
  const wrap = document.getElementById("landing-preview-wrap");
  const frame = document.getElementById("landing-preview-frame");
  if (!wrap || !frame || wrap.classList.contains("hidden")) return;
  const slug = localStorage.getItem("activeClinicSlug");
  if (!slug) return;
  // `template=` is the loader's forceTemplate override, so the preview reflects
  // the chosen layout even before the draft is saved.
  frame.src = `/clinicHomePage.html?clinic=${encodeURIComponent(slug)}&template=${encodeURIComponent(landingModel.template)}`;
}

function landingRenderTemplateCards() {
  const wrap = document.getElementById("landing-template-cards");
  if (!wrap) return;
  wrap.replaceChildren();

  const current = landingModel.template || LANDING_DEFAULT_TEMPLATE;
  LANDING_TEMPLATES.forEach((tpl) => {
    const active = current === tpl.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `landing-template-card${active ? " landing-template-active" : ""}`;
    btn.setAttribute("aria-pressed", active ? "true" : "false");

    const badge = active
      ? '<span class="landing-template-badge">Selected</span>'
      : "";
    const thumb = tpl.thumbnail
      ? `<img src="${tpl.thumbnail}" alt="" class="landing-template-thumb" loading="lazy" />`
      : "";
    // Text nodes are set via textContent below to avoid injecting names/descriptions as HTML.
    btn.innerHTML = `
      ${thumb}
      <span class="landing-template-name"><span class="landing-template-name-text"></span>${badge}</span>
      <span class="landing-template-desc"></span>
    `;
    btn.querySelector(".landing-template-name-text").textContent =
      tpl.name || tpl.id;
    btn.querySelector(".landing-template-desc").textContent =
      tpl.description || "";
    btn.addEventListener("click", () => applyTemplate(tpl.id));
    wrap.appendChild(btn);
  });
}

function setupLandingBuilder() {
  const panel = document.getElementById("panel-landing");
  if (!panel || panel.dataset.ready) return;
  panel.dataset.ready = "true";

  // Pull the developer-defined template/preset catalog from the backend, then
  // refresh the pickers (falls back silently to the bundled catalog).
  landingLoadCatalog().then(() => {
    landingRenderTemplateCards();
    landingRenderPresetCards();
  });

  const presetWrap = document.getElementById("landing-color-presets");
  const secondaryPresetWrap = document.getElementById(
    "landing-secondary-presets",
  );
  LANDING_COLOR_SWATCHES.forEach((hex) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = hex;
    b.setAttribute("aria-label", `Use color ${hex}`);
    b.className = "w-6 h-6 rounded-full border border-slate-200 cursor-pointer";
    b.style.backgroundColor = hex;
    b.addEventListener("click", () => landingSetColor(hex, "primary"));
    presetWrap?.appendChild(b);

    const s = document.createElement("button");
    s.type = "button";
    s.title = hex;
    s.setAttribute("aria-label", `Use color ${hex} for secondary accent`);
    s.className = "w-6 h-6 rounded-full border border-slate-200 cursor-pointer";
    s.style.backgroundColor = hex;
    s.addEventListener("click", () => landingSetColor(hex, "secondary"));
    secondaryPresetWrap?.appendChild(s);
  });

  document
    .getElementById("landing-color-input")
    ?.addEventListener("input", (e) =>
      landingSetColor(e.target.value, "primary"),
    );
  document
    .getElementById("landing-color-hex")
    ?.addEventListener("input", (e) => {
      const v = e.target.value.trim();
      if (LANDING_HEX_RE.test(v)) landingSetColor(v, "primary");
      else landingModel.primaryColor = v;
    });
  document
    .getElementById("landing-secondary-input")
    ?.addEventListener("input", (e) =>
      landingSetColor(e.target.value, "secondary"),
    );
  document
    .getElementById("landing-secondary-hex")
    ?.addEventListener("input", (e) => {
      const v = e.target.value.trim();
      if (LANDING_HEX_RE.test(v)) landingSetColor(v, "secondary");
      else landingModel.secondaryColor = v;
    });
  document
    .getElementById("landing-typography")
    ?.addEventListener("change", (e) => {
      landingModel.typography = LANDING_TYPOGRAPHIES.includes(e.target.value)
        ? e.target.value
        : "default";
      landingPushPreview();
    });
  document
    .getElementById("landing-header-input")
    ?.addEventListener("input", (e) =>
      landingSetColor(e.target.value, "headerBackground"),
    );
  document
    .getElementById("landing-header-hex")
    ?.addEventListener("input", (e) => {
      const v = e.target.value.trim();
      if (LANDING_HEX_RE.test(v)) landingSetColor(v, "headerBackground");
      else landingModel.headerBackground = v;
    });
  document
    .getElementById("landing-footer-input")
    ?.addEventListener("input", (e) =>
      landingSetColor(e.target.value, "footerBackground"),
    );
  document
    .getElementById("landing-footer-hex")
    ?.addEventListener("input", (e) => {
      const v = e.target.value.trim();
      if (LANDING_HEX_RE.test(v)) landingSetColor(v, "footerBackground");
      else landingModel.footerBackground = v;
    });
  document
    .getElementById("landing-tagline-input")
    ?.addEventListener("input", (e) => {
      landingModel.tagline = e.target.value;
      landingPushPreview();
    });
  document
    .getElementById("landing-logo-input")
    ?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        e.target.value = "";
        return;
      }
      // Client-side square crop before upload.
      const blob = await landingOpenCrop(file, { aspectRatio: 1 });
      e.target.value = "";
      if (!blob) return;
      const url = await landingUploadImage(blob);
      if (url) {
        const previous = landingModel.logoUrl;
        landingModel.logoUrl = url;
        landingRenderLogo();
        landingPushPreview();
        window.DashboardUI?.toast(
          "Logo uploaded. Save the draft to keep it.",
          "success",
        );
        if (previous && previous !== url) landingCleanupImage(previous);
      }
    });

  const descriptionInput = document.getElementById("landing-description");
  descriptionInput?.addEventListener("input", (e) => {
    landingModel.description = e.target.value;
    const count = document.getElementById("landing-description-count");
    if (count) count.textContent = `${e.target.value.length} / 600`;
    landingPushPreview();
  });
  document
    .getElementById("landing-hero-eyebrow")
    ?.addEventListener("input", (e) => {
      landingModel.heroEyebrow = e.target.value;
      landingPushPreview();
    });

  document
    .getElementById("landing-add-text")
    ?.addEventListener("click", () => landingAddBlock("text"));
  document
    .getElementById("landing-add-image")
    ?.addEventListener("click", () => landingAddBlock("image"));
  document
    .getElementById("landing-add-social")
    ?.addEventListener("click", () => {
      landingModel.socialLinks.push({ platform: "facebook", url: "" });
      landingRenderSocialLinks();
      landingPushPreview();
    });
  document
    .getElementById("landing-save-btn")
    ?.addEventListener("click", () => landingSaveDraft());
  document
    .getElementById("landing-publish-btn")
    ?.addEventListener("click", landingPublish);
  document
    .getElementById("landing-preview-btn")
    ?.addEventListener("click", landingPreview);
  document
    .getElementById("landing-preview-close")
    ?.addEventListener("click", () => {
      const wrap = document.getElementById("landing-preview-wrap");
      const frame = document.getElementById("landing-preview-frame");
      if (wrap) wrap.classList.add("hidden");
      if (frame) frame.src = "";
    });
  document
    .getElementById("landing-preview-frame")
    ?.addEventListener("load", () => {
      // Re-apply the in-memory draft whenever the preview (re)loads — including
      // after a template switch navigates the iframe to a different layout.
      landingPushPreview();
    });

  // Crop dialog buttons.
  document
    .getElementById("landing-crop-apply")
    ?.addEventListener("click", landingCropApply);
  document
    .getElementById("landing-crop-cancel")
    ?.addEventListener("click", () => landingCloseCrop(null));
  document
    .getElementById("landing-crop-cancel-btn")
    ?.addEventListener("click", () => landingCloseCrop(null));
  document
    .getElementById("landing-crop-modal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "landing-crop-modal") landingCloseCrop(null);
    });

  // Default section order = current DOM order (used until the admin reorders).
  if (!landingModel.sectionOrder.length) {
    landingModel.sectionOrder = LANDING_SECTIONS.map((s) => s.key);
  }

  landingRenderBuilder();
}

function landingSetColor(hex, which = "primary") {
  const value = String(hex || "").trim();
  landingModel[which] = value;
  const inputIds = {
    primary: ["landing-color-input", "landing-color-hex"],
    secondary: ["landing-secondary-input", "landing-secondary-hex"],
    headerBackground: ["landing-header-input", "landing-header-hex"],
    footerBackground: ["landing-footer-input", "landing-footer-hex"],
  }[which];
  const input = document.getElementById(inputIds?.[0]);
  const textInput = document.getElementById(inputIds?.[1]);
  if (input && LANDING_HEX_RE.test(value)) {
    input.value = value.length === 4 ? landingExpandHex(value) : value;
  }
  if (textInput) textInput.value = value;
  landingPushPreview();
}

function landingRenderPresetCards() {
  const wrap = document.getElementById("landing-preset-cards");
  if (!wrap) return;
  wrap.replaceChildren();

  // "Custom" option
  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = `landing-preset-card ${landingModel.preset === "" ? "landing-preset-active" : ""}`;
  customBtn.innerHTML = `<span class="landing-preset-name">✨ Custom</span><span class="landing-preset-desc">Build your own design</span>`;
  customBtn.addEventListener("click", () => {
    landingModel.preset = "";
    landingRenderPresetCards();
    landingPushPreview();
  });
  wrap.appendChild(customBtn);

  // Preset cards — limited to those the selected template supports.
  const activeTemplate = landingTemplateById(landingModel.template);
  const allowedPresets =
    activeTemplate &&
    Array.isArray(activeTemplate.presets) &&
    activeTemplate.presets.length
      ? activeTemplate.presets
      : Object.keys(LANDING_PRESETS);
  Object.entries(LANDING_PRESETS)
    .filter(([key]) => allowedPresets.includes(key))
    .forEach(([key, preset]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `landing-preset-card ${landingModel.preset === key ? "landing-preset-active" : ""}`;
      btn.style.borderColor =
        landingModel.preset === key ? preset.primaryColor : "";
      btn.innerHTML = `
      <div class="landing-preset-colors">
        <span class="landing-preset-swatch" style="background:${preset.primaryColor}"></span>
        <span class="landing-preset-swatch" style="background:${preset.secondaryColor}"></span>
        <span class="landing-preset-swatch" style="background:${preset.footerBackground}"></span>
      </div>
      <span class="landing-preset-name">${preset.name}</span>
    `;
      btn.addEventListener("click", () => {
        applyPreset(key);
      });
      wrap.appendChild(btn);
    });
}

function landingRenderBuilder() {
  const tagline = document.getElementById("landing-tagline-input");
  const colorHex = document.getElementById("landing-color-hex");
  const colorInput = document.getElementById("landing-color-input");
  const secondaryHex = document.getElementById("landing-secondary-hex");
  const secondaryInput = document.getElementById("landing-secondary-input");
  const headerHex = document.getElementById("landing-header-hex");
  const headerInput = document.getElementById("landing-header-input");
  const footerHex = document.getElementById("landing-footer-hex");
  const footerInput = document.getElementById("landing-footer-input");
  const typography = document.getElementById("landing-typography");
  const description = document.getElementById("landing-description");
  const descriptionCount = document.getElementById("landing-description-count");
  const heroEyebrow = document.getElementById("landing-hero-eyebrow");

  if (tagline) tagline.value = landingModel.tagline || "";
  if (colorHex) colorHex.value = landingModel.primaryColor || "";
  if (colorInput && LANDING_HEX_RE.test(landingModel.primaryColor)) {
    colorInput.value =
      landingModel.primaryColor.length === 4
        ? landingExpandHex(landingModel.primaryColor)
        : landingModel.primaryColor;
  }
  if (secondaryHex) secondaryHex.value = landingModel.secondaryColor || "";
  if (secondaryInput && LANDING_HEX_RE.test(landingModel.secondaryColor)) {
    secondaryInput.value =
      landingModel.secondaryColor.length === 4
        ? landingExpandHex(landingModel.secondaryColor)
        : landingModel.secondaryColor;
  }
  if (headerHex) headerHex.value = landingModel.headerBackground || "";
  if (headerInput && LANDING_HEX_RE.test(landingModel.headerBackground)) {
    headerInput.value =
      landingModel.headerBackground.length === 4
        ? landingExpandHex(landingModel.headerBackground)
        : landingModel.headerBackground;
  }
  if (footerHex) footerHex.value = landingModel.footerBackground || "";
  if (footerInput && LANDING_HEX_RE.test(landingModel.footerBackground)) {
    footerInput.value =
      landingModel.footerBackground.length === 4
        ? landingExpandHex(landingModel.footerBackground)
        : landingModel.footerBackground;
  }
  if (typography) typography.value = landingModel.typography || "default";
  if (description) {
    description.value = landingModel.description || "";
    if (descriptionCount)
      descriptionCount.textContent = `${(landingModel.description || "").length} / 600`;
  }
  if (heroEyebrow) heroEyebrow.value = landingModel.heroEyebrow || "";

  landingRenderLogo();
  landingRenderTemplateCards();
  landingRenderPresetCards();
  landingRenderSections();
  landingRenderBlocks();
  landingRenderSectionTexts();
  landingRenderSocialLinks();
}

function landingRenderSectionTexts() {
  const wrap = document.getElementById("landing-section-texts");
  if (!wrap) return;
  wrap.replaceChildren();

  LANDING_SECTION_TEXT_KEYS.forEach(({ key, label }) => {
    const values =
      landingModel.sectionTexts[key] || landingSectionTextDefaults();

    const details = document.createElement("details");
    details.className =
      "border border-slate-200 rounded-xl bg-slate-50/60 open:bg-white";
    details.open = false;

    const summary = document.createElement("summary");
    summary.className =
      "flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer hover:text-indigo-600 list-none";
    summary.innerHTML = `<span>${label}</span><span class="text-slate-300 select-none" aria-hidden="true">▾</span>`;
    details.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pb-4";

    const makeInput = (field, placeholder, maxlength) => {
      const wrapCol = document.createElement("div");
      const lbl = document.createElement("label");
      lbl.className = "block text-[10px] font-bold text-slate-500 mb-1";
      lbl.textContent = placeholder;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = maxlength;
      input.value = values[field] || "";
      input.className =
        "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500";
      input.addEventListener("input", () => {
        landingModel.sectionTexts[key] =
          landingModel.sectionTexts[key] || landingSectionTextDefaults();
        landingModel.sectionTexts[key][field] = input.value;
        landingPushPreview();
      });
      wrapCol.append(lbl, input);
      return wrapCol;
    };

    grid.append(
      makeInput("eyebrow", "Eyebrow", 120),
      makeInput("heading", "Heading", 160),
      makeInput("intro", "Intro", 300),
    );
    details.appendChild(grid);
    wrap.appendChild(details);
  });
}

function landingRenderSocialLinks() {
  const wrap = document.getElementById("landing-social-links");
  if (!wrap) return;
  wrap.replaceChildren();

  if (!landingModel.socialLinks.length) {
    const empty = document.createElement("p");
    empty.className = "text-xs text-slate-400 italic py-1.5";
    empty.textContent =
      "No social links yet. Add a link to show your profiles in the footer.";
    wrap.appendChild(empty);
    return;
  }

  landingModel.socialLinks.forEach((link, index) => {
    const row = document.createElement("div");
    row.className =
      "flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white";

    const select = document.createElement("select");
    select.className =
      "bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-500";
    LANDING_SOCIAL_PLATFORMS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.value;
      opt.textContent = p.label;
      if (link.platform === p.value) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      link.platform = select.value;
      landingPushPreview();
    });

    const url = document.createElement("input");
    url.type = "url";
    url.placeholder = "https://facebook.com/yourclinic";
    url.value = link.url || "";
    url.className =
      "flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500";
    url.addEventListener("input", () => {
      link.url = url.value;
      landingPushPreview();
    });

    const remove = landingIconButton("✕", "Remove social link", () => {
      landingModel.socialLinks.splice(index, 1);
      landingRenderSocialLinks();
      landingPushPreview();
    });
    remove.classList.add("text-rose-500", "shrink-0");

    row.append(select, url, remove);
    wrap.appendChild(row);
  });
}

function landingRenderLogo() {
  const preview = document.getElementById("landing-logo-preview");
  if (!preview) return;
  if (landingModel.logoUrl) {
    preview.src = landingModel.logoUrl;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
  }
}

function landingRenderSections() {
  const wrap = document.getElementById("landing-sections");
  if (!wrap) return;
  wrap.replaceChildren();

  // Render sections in the configured order (falling back to LANDING_SECTIONS).
  const order = landingModel.sectionOrder.length
    ? landingModel.sectionOrder
    : LANDING_SECTIONS.map((s) => s.key);
  const byKey = new Map(LANDING_SECTIONS.map((s) => [s.key, s]));

  order.forEach((key, position) => {
    const meta = byKey.get(key);
    if (!meta) return;
    const { label } = meta;

    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50";
    row.dataset.sectionKey = key;

    const left = document.createElement("div");
    left.className = "flex items-center gap-2.5 min-w-0";

    const handle = document.createElement("span");
    handle.className =
      "cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none text-sm";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "⋮⋮";

    const span = document.createElement("span");
    span.className = "text-xs font-semibold text-slate-700 truncate";
    span.textContent = label;

    const reorder = document.createElement("span");
    reorder.className =
      "text-[10px] font-bold text-slate-300 whitespace-nowrap";
    reorder.textContent = `${position + 1}`;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "w-4 h-4 accent-indigo-600 cursor-pointer shrink-0";
    cb.title =
      key === "custom"
        ? "Show/hide custom content blocks"
        : "Show/hide section";
    cb.checked = !landingModel.hiddenSections.includes(key);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        landingModel.hiddenSections = landingModel.hiddenSections.filter(
          (s) => s !== key,
        );
      } else if (!landingModel.hiddenSections.includes(key)) {
        landingModel.hiddenSections.push(key);
      }
      landingPushPreview();
    });

    left.append(handle, span, reorder);
    row.append(left, cb);
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("[data-section-key]").forEach((row) => {
    row.ondragstart = (ev) => {
      ev.dataTransfer.setData("text/plain", row.dataset.sectionKey);
      ev.dataTransfer.effectAllowed = "move";
      row.classList.add("opacity-50");
    };
    row.ondragend = () => row.classList.remove("opacity-50");
    row.ondragover = (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      row.classList.add("ring-2", "ring-indigo-300");
    };
    row.ondragleave = () => row.classList.remove("ring-2", "ring-indigo-300");
    row.ondrop = (ev) => {
      ev.preventDefault();
      row.classList.remove("ring-2", "ring-indigo-300");
      const fromKey = ev.dataTransfer.getData("text/plain");
      const toKey = row.dataset.sectionKey;
      if (!fromKey || fromKey === toKey) return;
      const arr = landingModel.sectionOrder.slice();
      const fromIdx = arr.indexOf(fromKey);
      const toIdx = arr.indexOf(toKey);
      if (fromIdx === -1 || toIdx === -1) return;
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, fromKey);
      landingModel.sectionOrder = arr;
      landingRenderSections();
      // Provide accessible move buttons (re-render adds the ↑/↓), plus preview.
      landingMoveSection(fromKey, 0, true);
    };
  });
}

function landingMoveSection(key, delta, skipRender = false) {
  const arr = landingModel.sectionOrder.slice();
  const idx = arr.indexOf(key);
  if (idx === -1) return;
  const target = idx + delta;
  if (target < 0 || target >= arr.length) return;
  arr.splice(idx, 1);
  arr.splice(target, 0, key);
  landingModel.sectionOrder = arr;
  if (!skipRender) landingRenderSections();
  landingPushPreview();
}

function landingRenderBlocks() {
  const wrap = document.getElementById("landing-blocks");
  if (!wrap) return;
  wrap.replaceChildren();
  if (!landingModel.blocks.length) {
    const empty = document.createElement("p");
    empty.className = "text-xs text-slate-400 italic py-2";
    empty.textContent =
      "No custom blocks yet. Add a text or image block to enrich your page.";
    wrap.appendChild(empty);
    return;
  }
  landingModel.blocks.forEach((block, index) =>
    wrap.appendChild(landingRenderBlockCard(block, index)),
  );

  // Drop targets for drag-to-reorder blocks.
  const cards = [...wrap.querySelectorAll("[data-block-index]")];
  cards.forEach((card) => {
    card.ondragover = (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      card.classList.add("ring-2", "ring-indigo-300");
    };
    card.ondragleave = () => card.classList.remove("ring-2", "ring-indigo-300");
    card.ondrop = (ev) => {
      ev.preventDefault();
      card.classList.remove("ring-2", "ring-indigo-300");
      const fromIndex = Number(ev.dataTransfer.getData("text/plain"));
      const toIndex = Number(card.dataset.blockIndex);
      if (
        !Number.isFinite(fromIndex) ||
        !Number.isFinite(toIndex) ||
        fromIndex === toIndex
      ) {
        return;
      }
      landingMoveBlock(fromIndex, toIndex - fromIndex);
    };
  });
}

function landingMoveBlock(fromIndex, delta) {
  const target = fromIndex + delta;
  if (target < 0 || target >= landingModel.blocks.length) return;
  const [moved] = landingModel.blocks.splice(fromIndex, 1);
  landingModel.blocks.splice(target, 0, moved);
  landingRenderBlocks();
  landingPushPreview();
}

function landingIconButton(label, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.className =
    "w-7 h-7 grid place-items-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs cursor-pointer";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function landingRenderBlockCard(block, index) {
  const card = document.createElement("div");
  card.className =
    "border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60";
  card.draggable = true;
  card.dataset.blockIndex = String(index);

  const head = document.createElement("div");
  head.className = "flex items-center justify-between";
  const badgeWrap = document.createElement("div");
  badgeWrap.className = "flex items-center gap-2";
  const handle = document.createElement("span");
  handle.className =
    "cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none text-sm";
  handle.setAttribute("aria-hidden", "true");
  handle.textContent = "⋮⋮";
  const badge = document.createElement("span");
  badge.className =
    "text-[10px] font-black uppercase tracking-wider text-indigo-600";
  badge.textContent = block.type === "image" ? "Image block" : "Text block";
  badgeWrap.append(handle, badge);
  const controls = document.createElement("div");
  controls.className = "flex items-center gap-1";
  const del = landingIconButton("✕", "Remove block", () =>
    landingRemoveBlock(index),
  );
  del.classList.add("text-rose-500");
  controls.append(
    landingIconButton("↑", "Move up", () => landingMoveBlock(index, -1)),
    landingIconButton("↓", "Move down", () => landingMoveBlock(index, 1)),
    del,
  );
  head.append(badgeWrap, controls);
  card.appendChild(head);

  // Drag-to-reorder within the blocks list.
  card.ondragstart = (ev) => {
    ev.dataTransfer.setData("text/plain", String(index));
    ev.dataTransfer.effectAllowed = "move";
    card.classList.add("opacity-50");
  };
  card.ondragend = () => card.classList.remove("opacity-50");

  const heading = document.createElement("input");
  heading.type = "text";
  heading.maxLength = 120;
  heading.value = block.heading || "";
  heading.placeholder = "Heading (optional)";
  heading.className =
    "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500";
  heading.addEventListener("input", () => {
    block.heading = heading.value;
    landingPushPreview();
  });
  card.appendChild(heading);

  const body = document.createElement("textarea");
  body.rows = 3;
  body.maxLength = 1500;
  body.value = block.body || "";
  body.placeholder = "Paragraph text";
  body.className =
    "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500";
  body.addEventListener("input", () => {
    block.body = body.value;
    landingPushPreview();
  });
  card.appendChild(body);

  if (block.type === "image") {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3";
    const img = document.createElement("img");
    img.className =
      "w-12 h-12 rounded-lg object-cover border border-slate-200" +
      (block.imageUrl ? "" : " hidden");
    if (block.imageUrl) img.src = block.imageUrl;
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp";
    file.className =
      "block w-full text-xs text-slate-600 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer";
    file.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) {
        e.target.value = "";
        return;
      }
      // Client-side crop (free aspect) before upload.
      const blob = await landingOpenCrop(f, {});
      e.target.value = "";
      if (!blob) return;
      const url = await landingUploadImage(blob);
      if (url) {
        const previous = block.imageUrl;
        block.imageUrl = url;
        img.src = url;
        img.classList.remove("hidden");
        landingPushPreview();
        if (previous && previous !== url) landingCleanupImage(previous);
      }
    });
    row.append(img, file);
    card.appendChild(row);
  }

  // Style controls: background + alignment, unless the block has an image
  // (image blocks handle their own layout).
  if (block.type !== "image") {
    const styleRow = document.createElement("div");
    styleRow.className = "grid grid-cols-1 sm:grid-cols-2 gap-3 items-end";

    const bgWrap = document.createElement("div");
    const bgLabel = document.createElement("label");
    bgLabel.className = "block text-[10px] font-bold text-slate-500 mb-1";
    bgLabel.textContent = "Background";
    const bgSel = document.createElement("select");
    bgSel.className =
      "w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-500";
    LANDING_BLOCK_BACKGROUNDS.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (block.background === o.value) opt.selected = true;
      bgSel.appendChild(opt);
    });
    bgSel.addEventListener("change", () => {
      block.background = bgSel.value;
      landingPushPreview();
    });
    bgWrap.append(bgLabel, bgSel);

    const alignWrap = document.createElement("div");
    const alignLabel = document.createElement("label");
    alignLabel.className = "block text-[10px] font-bold text-slate-500 mb-1";
    alignLabel.textContent = "Text alignment";
    const alignSel = document.createElement("select");
    alignSel.className =
      "w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-500";
    LANDING_BLOCK_ALIGNMENTS.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (block.align === o.value) opt.selected = true;
      alignSel.appendChild(opt);
    });
    alignSel.addEventListener("change", () => {
      block.align = alignSel.value;
      landingPushPreview();
    });
    alignWrap.append(alignLabel, alignSel);

    styleRow.append(bgWrap, alignWrap);
    card.appendChild(styleRow);
  }

  return card;
}

function landingAddBlock(type) {
  if (landingModel.blocks.length >= 12) {
    window.DashboardUI?.toast(
      "You can add up to 12 content blocks.",
      "warning",
    );
    return;
  }
  landingModel.blocks.push({
    type,
    heading: "",
    body: "",
    imageUrl: "",
    background: "none",
    align: "left",
  });
  landingRenderBlocks();
  landingPushPreview();
}

function landingRemoveBlock(index) {
  const removed = landingModel.blocks[index];
  landingModel.blocks.splice(index, 1);
  landingRenderBlocks();
  landingPushPreview();
  if (removed?.imageUrl) landingCleanupImage(removed.imageUrl);
}

// Best-effort cleanup of an orphaned uploaded image (replaced before saving).
// The server only deletes it if nothing (draft/published/documents) references it.
async function landingCleanupImage(url) {
  if (!url || !clinicId) return;
  try {
    await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}/landing/image`),
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      },
    );
  } catch {
    // Non-fatal: orphan cleanup is best-effort.
  }
}

async function landingUploadImage(fileOrBlob) {
  try {
    const fd = new FormData();
    // Give the upload a real filename (multer drives the stored extension from
    // originalname) — cropped blobs have none by default.
    const isBlob =
      typeof Blob !== "undefined" &&
      fileOrBlob instanceof Blob &&
      !fileOrBlob.name;
    const name = isBlob
      ? `cropped-${Date.now()}.${(fileOrBlob.type || "image/jpeg").split("/")[1] || "jpg"}`
      : fileOrBlob.name;
    fd.append("image", fileOrBlob, name);
    const res = await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}/landing/upload`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      },
    );
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.message || "Upload failed.");
    return data.url;
  } catch (err) {
    window.DashboardUI?.toast(err.message || "Image upload failed.", "error");
    return null;
  }
}

// Cropper.js crop dialog ------------------------------------------------------
let landingCropCropper = null;
let landingCropResolver = null;

// Opens the crop modal for a selected file. Resolves with a cropped Blob, or
// null when the user cancels.
function landingOpenCrop(file, { aspectRatio } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("landing-crop-modal");
    const image = document.getElementById("landing-crop-image");
    if (!modal || !image || typeof Cropper === "undefined" || !file) {
      resolve(null);
      return;
    }
    landingCropResolver = resolve;
    image.src = URL.createObjectURL(file);
    if (landingCropCropper) {
      landingCropCropper.destroy();
      landingCropCropper = null;
    }
    landingCropCropper = new Cropper(image, {
      viewMode: 1,
      autoCropArea: 1,
      checkOrientation: true,
      aspectRatio: Number.isFinite(aspectRatio) ? aspectRatio : NaN,
    });
    modal.classList.remove("hidden");
  });
}

async function landingCropApply() {
  if (!landingCropCropper) {
    landingCloseCrop(null);
    return;
  }
  let blob = null;
  try {
    const canvas = landingCropCropper.getCroppedCanvas({
      maxWidth: 1600,
      maxHeight: 1600,
      imageSmoothingQuality: "high",
    });
    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  } catch {
    blob = null;
  }
  landingCloseCrop(blob);
}

function landingCloseCrop(result) {
  const modal = document.getElementById("landing-crop-modal");
  const image = document.getElementById("landing-crop-image");
  if (modal) modal.classList.add("hidden");
  if (landingCropCropper) {
    landingCropCropper.destroy();
    landingCropCropper = null;
  }
  if (image) {
    URL.revokeObjectURL(image.src);
    image.src = "";
  }
  if (landingCropResolver) {
    landingCropResolver(result);
    landingCropResolver = null;
  }
}

async function landingSaveDraft() {
  const hexInputs = {
    "landing-color-hex": "Primary color must be a hex value like #0f766e.",
    "landing-secondary-hex":
      "Secondary color must be a hex value like #0d9488.",
    "landing-header-hex": "Header background must be a hex value like #ffffff.",
    "landing-footer-hex": "Footer background must be a hex value like #0f172a.",
  };
  for (const [id, message] of Object.entries(hexInputs)) {
    const input = document.getElementById(id);
    if (input && input.value && !LANDING_HEX_RE.test(input.value.trim())) {
      window.DashboardUI?.toast(message, "warning");
      return false;
    }
  }
  // Social link URLs must be absolute http(s) links.
  const badSocial = landingModel.socialLinks.find(
    (link) => link.url && !/^https?:\/\//i.test(link.url.trim()),
  );
  if (badSocial) {
    window.DashboardUI?.toast(
      "Social links must be full URLs starting with http:// or https://.",
      "warning",
    );
    return false;
  }
  try {
    const res = await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}/landing`),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(landingModel),
      },
    );
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.message || "Save failed.");
    landingSetStatus("Draft saved.");
    window.DashboardUI?.toast("Landing page draft saved.", "success");
    return true;
  } catch (err) {
    window.DashboardUI?.toast(
      err.message || "Could not save the draft.",
      "error",
    );
    return false;
  }
}

async function landingPublish() {
  const ok = await window.DashboardUI.confirm({
    title: "Publish landing page",
    body: "Publish your current draft? These changes go live on your public clinic page immediately.",
    confirmLabel: "Publish",
  });
  if (!ok) return;
  const saved = await landingSaveDraft();
  if (!saved) return;
  try {
    const res = await fetch(
      window.apiUrl(`/api/v1/tenants/${clinicId}/landing/publish`),
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.message || "Publish failed.");
    landingSetStatus("Published — live on your public page.");
    window.DashboardUI?.toast("Landing page published.", "success");
  } catch (err) {
    window.DashboardUI?.toast(err.message || "Could not publish.", "error");
  }
}

function landingPreview() {
  const slug = localStorage.getItem("activeClinicSlug");
  const frame = document.getElementById("landing-preview-frame");
  const wrap = document.getElementById("landing-preview-wrap");
  if (!slug) {
    window.DashboardUI?.toast(
      "Your public page address isn't ready yet.",
      "warning",
    );
    return;
  }
  // `template=` forces the loader to render the currently-selected layout, even
  // if the draft hasn't been saved yet.
  const tpl = encodeURIComponent(
    landingModel.template || LANDING_DEFAULT_TEMPLATE,
  );
  if (frame && wrap) {
    wrap.classList.remove("hidden");
    // Load the public page in the iframe (the parent admin page posts draft
    // updates to it via postMessage in live-preview mode).
    frame.src = `/clinicHomePage.html?clinic=${encodeURIComponent(slug)}&template=${tpl}`;
  } else {
    window.open(
      `/clinicHomePage.html?clinic=${encodeURIComponent(slug)}&preview=1&template=${tpl}`,
      "_blank",
    );
  }
}

function landingPushPreview() {
  // Send the current draft to the embedded preview iframe (if it's loaded on
  // the same origin). Used to make edits appear without a reload.
  const frame = document.getElementById("landing-preview-frame");
  if (!frame || !frame.contentWindow) return;
  try {
    frame.contentWindow.postMessage(
      { type: "landing-preview-update", draft: landingModel },
      window.location.origin,
    );
  } catch {
    // If the frame is not yet loaded or cross-origin, ignore.
  }
}

function landingSetStatus(text) {
  const el = document.getElementById("landing-status");
  if (el) el.textContent = text;
}
