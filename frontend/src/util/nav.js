// Clinic dashboard navigation controller.
// Progressive enhancement: the panels work as an ARIA tablist so the existing
// click-to-switch behaviour also becomes keyboard operable and screen-reader
// friendly, and the desktop sidebar becomes an accessible off-canvas drawer on
// mobile (previously the nav was `hidden md:flex`, i.e. absent on phones).

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("clinic-sidebar");
  const navList = document.getElementById("sidebar-nav");
  const allNavItems = Array.from(document.querySelectorAll(".nav-item"));

  // Role-based scoping: hide management sections from non-admin roles that land
  // on this workspace so each role sees only what it is permitted to act on.
  let currentRole = "";
  try {
    currentRole = String(
      (JSON.parse(localStorage.getItem("user") || "null") || {}).role || "",
    ).toUpperCase();
  } catch {
    currentRole = "";
  }
  allNavItems.forEach((item) => {
    const allowed = item.getAttribute("data-roles");
    if (
      allowed &&
      currentRole &&
      !allowed
        .split(",")
        .map((r) => r.trim().toUpperCase())
        .includes(currentRole)
    ) {
      item.classList.add("hidden");
      item.setAttribute("aria-hidden", "true");
      item.tabIndex = -1;
    }
  });

  // Only operate the tablist model over the currently visible tabs.
  const navItems = allNavItems.filter(
    (item) => !item.classList.contains("hidden"),
  );
  const panels = Array.from(document.querySelectorAll(".dashboard-panel"));
  const title = document.getElementById("dashboard-title");
  const subtitle = document.getElementById("dashboard-subtitle");

  const metaMap = {
    "panel-appointments": {
      title: "Operations Overview",
      sub: "Real-time scheduling and medical provider routing execution paths",
    },
    "panel-staff": {
      title: "Staff Management",
      sub: "Onboard practitioners and manage clinical team access",
    },
    "panel-pricing": {
      title: "Dental Pricing Menu",
      sub: "Configure treatments and the prices shown to patients",
    },
    "panel-hours": {
      title: "Operating Hours",
      sub: "Manage open days and appointment slot durations",
    },
    "panel-landing": {
      title: "Landing Page Builder",
      sub: "Customize your public clinic page — profiles, branding, content, and sections",
    },
    "panel-testimonials": {
      title: "Patient feedback",
      sub: "Patient reviews publish automatically",
    },
    "panel-reports": {
      title: "Reports",
      sub: "Export financial and operational reports",
    },
    "panel-subscription": {
      title: "My Subscription",
      sub: "Plan, renewal, invoices, and billing notices for this clinic",
    },
  };

  // Screen-reader announcement region for panel changes.
  let liveRegion = document.getElementById("dashboard-live-region");
  if (!liveRegion) {
    liveRegion = document.createElement("div");
    liveRegion.id = "dashboard-live-region";
    liveRegion.className = "sr-only";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("role", "status");
    document.body.appendChild(liveRegion);
  }

  const ACTIVE_CLASS =
    "nav-item group flex items-center justify-between bg-indigo-100 text-indigo-900 px-3 py-2.5 rounded-xl text-[13px] font-semibold border border-indigo-200/80 cursor-pointer transition-all shadow-sm";
  const IDLE_CLASS =
    "nav-item group flex items-center justify-between text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 px-3 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all";

  // -----------------------------------------------------------------------
  // ARIA wiring (tablist / tab / tabpanel + roving tabindex)
  // -----------------------------------------------------------------------
  if (navList) {
    navList.setAttribute("role", "tablist");
    navList.setAttribute("aria-label", "Dashboard sections");
    navList.setAttribute("aria-orientation", "vertical");
  }

  navItems.forEach((item) => {
    const targetId = item.getAttribute("data-target");
    const panel = targetId ? document.getElementById(targetId) : null;
    item.setAttribute("role", "tab");
    if (!item.id) item.id = `tab-${targetId}`;
    if (targetId) item.setAttribute("aria-controls", targetId);
    const isActive = panel ? !panel.classList.contains("hidden") : false;
    item.setAttribute("aria-selected", isActive ? "true" : "false");
    item.tabIndex = isActive ? 0 : -1;
    if (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", item.id);
      panel.setAttribute("tabindex", "-1");
    }
  });

  // -----------------------------------------------------------------------
  // Activation
  // -----------------------------------------------------------------------
  function activate(item, { focusPanel = false } = {}) {
    // Respect the rejected/pending application lock (set by the dashboard app).
    if (document.body.classList.contains("application-locked")) return;

    const targetId = item.getAttribute("data-target");
    const targetPanel = targetId ? document.getElementById(targetId) : null;

    navItems.forEach((nav) => {
      nav.className = IDLE_CLASS;
      nav.setAttribute("aria-selected", "false");
      nav.tabIndex = -1;
      nav.querySelector(".active-dot")?.classList.add("hidden");
    });

    item.className = ACTIVE_CLASS;
    item.setAttribute("aria-selected", "true");
    item.tabIndex = 0;
    item.querySelector(".active-dot")?.classList.remove("hidden");

    panels.forEach((panel) => panel.classList.add("hidden"));
    if (targetPanel) {
      targetPanel.classList.remove("hidden");
      if (focusPanel) targetPanel.focus();
    }

    const meta = metaMap[targetId];
    if (title) title.textContent = meta ? meta.title : "Dashboard Overview";
    if (subtitle)
      subtitle.textContent = meta ? meta.sub : "Viewing system configuration";
    if (meta) liveRegion.textContent = `${meta.title} panel shown`;

    // The KPI stats strip belongs to the operations views; hide it while the
    // Landing Page Builder or My Subscription is active so only the focused
    // workspace shows.
    const kpiStats = document.getElementById("kpi-stats");
    if (kpiStats) {
      kpiStats.classList.toggle(
        "hidden",
        targetId === "panel-landing" || targetId === "panel-subscription",
      );
    }
    if (
      targetId === "panel-subscription" &&
      typeof window.refreshMySubscription === "function"
    ) {
      window.refreshMySubscription();
    }

    closeDrawer();
  }

  navItems.forEach((item, index) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      activate(item);
    });

    // Standard tablist keyboard model.
    item.addEventListener("keydown", (e) => {
      let nextIndex = null;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          nextIndex = (index + 1) % navItems.length;
          break;
        case "ArrowUp":
        case "ArrowLeft":
          nextIndex = (index - 1 + navItems.length) % navItems.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = navItems.length - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          activate(item, { focusPanel: true });
          return;
        default:
          return;
      }
      e.preventDefault();
      const next = navItems[nextIndex];
      next.focus();
      activate(next);
    });
  });

  // -----------------------------------------------------------------------
  // Mobile off-canvas drawer
  // -----------------------------------------------------------------------
  const toggle = document.getElementById("sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

  function openDrawer() {
    if (!sidebar) return;
    sidebar.classList.remove("-translate-x-full");
    backdrop?.classList.remove("hidden");
    toggle?.setAttribute("aria-expanded", "true");
    toggle?.setAttribute("aria-label", "Close navigation menu");
    document.body.classList.add("sidebar-open");
    // Move focus to the first tab for immediate keyboard access.
    navItems[0]?.focus();
  }

  function closeDrawer() {
    if (!sidebar || isDesktop()) return;
    sidebar.classList.add("-translate-x-full");
    backdrop?.classList.add("hidden");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", "Open navigation menu");
    document.body.classList.remove("sidebar-open");
  }

  toggle?.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  backdrop?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Reset drawer state when resizing up to desktop.
  window.addEventListener("resize", () => {
    if (isDesktop()) {
      backdrop?.classList.add("hidden");
      document.body.classList.remove("sidebar-open");
      toggle?.setAttribute("aria-expanded", "false");
    }
  });

  // Deep link: ?panel=<panel-id> opens a section directly (used by the
  // retired subscription.html redirect shim).
  try {
    const target = new URLSearchParams(window.location.search).get("panel");
    if (target) {
      const item = navItems.find(
        (nav) => nav.getAttribute("data-target") === target,
      );
      if (item) activate(item);
    }
  } catch {
    /* non-browser or malformed query — stay on the default panel */
  }

  // Preserve existing staff onboarding form binding.
  const addStaffForm = document.getElementById("add-staff-form");
  if (addStaffForm && typeof handleStaffOnboarding === "function") {
    addStaffForm.addEventListener("submit", handleStaffOnboarding);
  }
});
