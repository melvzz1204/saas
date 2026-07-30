document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");
  const panels = document.querySelectorAll(".dashboard-panel");
  const title = document.getElementById("dashboard-title");
  const subtitle = document.getElementById("dashboard-subtitle");

  const metaMap = {
    "panel-appointments": {
      title: "Operations Overview",
      sub: "Real-time scheduling and medical provider routing execution paths",
    },
    // ... your other panels ...

    // Add your new panel ID here! (Example below)
    "panel-clinic-hours": {
      title: "Clinic Operating Hours",
      sub: "Manage open slots and appointment durations",
    },
  };
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetPanelId = item.getAttribute("data-target");

      navItems.forEach((nav) => {
        nav.className =
          "nav-item group flex items-center justify-between text-slate-600 hover:bg-slate-50 hover:text-slate-900 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all";
        nav.querySelector(".active-dot").classList.add("hidden");
      });

      item.className =
        "nav-item group flex items-center justify-between bg-slate-100 text-slate-900 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200/50 cursor-pointer transition-all";
      item.querySelector(".active-dot").classList.remove("hidden");

      panels.forEach((panel) => panel.classList.add("hidden"));

      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.remove("hidden");
      }

      // 🛡️ SAFETY CHECK: Only update titles if the map exists, otherwise use fallback
      const meta = metaMap[targetPanelId];
      if (meta) {
        title.textContent = meta.title;
        subtitle.textContent = meta.sub;
      } else {
        title.textContent = "Dashboard Overview";
        subtitle.textContent = "Viewing system configurations";
      }
    });
  });
  const addStaffForm = document.getElementById("add-staff-form");
  if (addStaffForm && typeof handleStaffOnboarding === "function") {
    addStaffForm.addEventListener("submit", handleStaffOnboarding);
  }
});
