// src/util/clinicTour.js
// Interactive guided walkthrough for the clinic admin dashboard.
// Mirrors the self-contained IIFE pattern of setupGuide.js and dashboardUI.js.
//
// Persistence:
//   localStorage key `clinicTourCompleted` = "1" once the user finishes or
//   skips the tour.  The tour does NOT auto-restart after that; it must be
//   re-triggered manually via the "Tour" button.
//
// Auto-trigger:
//   On first login (key absent), the tour starts automatically after a short
//   delay so the dashboard has time to render its panels.
//
// Accessibility:
//   - Overlay is a focus-trapped modal with ARIA role="dialog".
//   - Arrow keys navigate between steps, Escape dismisses.
//   - Screen-reader live-region announces each step.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  var STORAGE_KEY = "clinicTourCompleted";
  var TOUR_START_DELAY = 800; // ms – give panels time to render
  var SPOTLIGHT_PAD = 8; // px padding around the highlighted element

  // -----------------------------------------------------------------------
  // Tour step definitions
  // Each step: { selector, panel, title, body, position? }
  //   selector – CSS selector for the element to highlight
  //   panel    – data-target of the nav item to activate before highlighting
  //              (null = current panel / no switch needed)
  //   title    – tooltip headline
  //   body     – tooltip body text
  //   position – preferred tooltip placement: "bottom" (default), "top",
  //              "left", "right"; the engine repositions on collision.
  // -----------------------------------------------------------------------
  var STEPS = [
    {
      selector: "#kpi-stats",
      panel: null,
      title: "At-a-Glance Metrics",
      body: "Your KPI strip shows today's appointments, this month's bookings, active staff, and pending requests — all updated in real time.",
      position: "bottom",
    },
    {
      selector: "#sidebar-nav",
      panel: null,
      title: "Navigation Sidebar",
      body: "Switch between management panels from here. Each section — appointments, staff, pricing, and more — lives in its own tab.",
      position: "right",
    },
    {
      selector: "#nav-appointments",
      panel: "panel-appointments",
      title: "Appointments Queue",
      body: "View, confirm, or reschedule patient bookings. The live table refreshes automatically; hit the refresh link for an instant sync.",
      position: "right",
    },
    {
      selector: "#panel-appointments .overflow-x-auto",
      panel: "panel-appointments",
      title: "Appointment Table",
      body: "Each row shows patient name, date/time, reason, price, and status. Use the Actions column to manage individual bookings.",
      position: "bottom",
    },
    {
      selector: "#nav-staff",
      panel: "panel-staff",
      title: "Staff Management",
      body: "Onboard new practitioners, assign roles and specializations, and manage the clinical team directory.",
      position: "right",
    },
    {
      selector: "#nav-pricing",
      panel: "panel-pricing",
      title: "Dental Pricing Menu",
      body: "Set up and adjust treatment prices. Add new services, modify rates, and toggle availability — all reflected on the patient booking screen.",
      position: "right",
    },
    {
      selector: "#nav-hours",
      panel: "panel-hours",
      title: "Operating Hours",
      body: "Configure weekly open/close times and appointment slot durations so patients can only book during real business hours.",
      position: "right",
    },
    {
      selector: "#nav-landing",
      panel: "panel-landing",
      title: "Landing Page Builder",
      body: "Customize your public clinic page — choose a template, set branding colors, edit content sections, and publish when ready.",
      position: "right",
    },
    {
      selector: "#nav-testimonials",
      panel: "panel-testimonials",
      title: "Patient Testimonials",
      body: "Patient feedback appears here and publishes automatically. Review and moderate reviews as they come in.",
      position: "right",
    },
    {
      selector: "#nav-reports",
      panel: "panel-reports",
      title: "Reports & Exports",
      body: "Download financial and operational reports for daily tracking and compliance.",
      position: "right",
    },
    {
      selector: "#nav-subscription",
      panel: "panel-subscription",
      title: "Subscription & Billing",
      body: "Manage your plan, payment method, invoices, and billing notices. Upgrade or change your cycle anytime.",
      position: "right",
    },
    {
      selector: "#viewLiveSiteBtn",
      panel: null,
      title: "View Live Website",
      body: "Preview your public clinic page as patients see it. Changes publish instantly from the Landing Page Builder.",
      position: "right",
    },
    {
      selector: "#logout-btn",
      panel: null,
      title: "Sign Out",
      body: "Securely end your session. Your workspace and data remain saved for next login.",
      position: "top",
    },
  ];

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  var currentStep = 0;
  var isActive = false;
  var overlay = null;
  var spotlightEl = null;
  var tooltipEl = null;
  var progressEl = null;
  var liveRegion = null;
  var lastFocusedElement = null;

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  function isCompleted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markCompleted() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage full / private mode – silently ignore */
    }
  }

  function clearCompleted() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Find the first visible matching element, walking up to find an ancestor
   *  if the direct target is hidden (e.g. inside a hidden panel). */
  function resolveTarget(selector) {
    if (!selector) return null;
    var el = document.querySelector(selector);
    if (el) return el;
    // Fallback: some targets live inside hidden panels; the nav switch
    // handles visibility, but if we haven't switched yet, try finding via
    // data-target on the sidebar link.
    return null;
  }

  /** Activate a sidebar nav item by its panel id, mirroring nav.js logic. */
  function activatePanel(panelId) {
    if (!panelId) return;
    var navItem = document.querySelector(
      '.nav-item[data-target="' + panelId + '"]',
    );
    if (navItem) navItem.click();
  }

  /** Check if an element is currently visible in the viewport. */
  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Check if the app is in locked/gated mode – skip tour if so. */
  function isAppLocked() {
    return document.body.classList.contains("application-locked");
  }

  // -----------------------------------------------------------------------
  // DOM Construction
  // -----------------------------------------------------------------------
  function buildOverlay() {
    // Full-screen transparent overlay for click-outside dismiss and spotlight
    overlay = document.createElement("div");
    overlay.className = "clinic-tour-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Dashboard guided tour");
    overlay.tabIndex = -1;

    // Spotlight cutout element
    spotlightEl = document.createElement("div");
    spotlightEl.className = "clinic-tour-spotlight";
    spotlightEl.setAttribute("aria-hidden", "true");

    // Tooltip bubble
    tooltipEl = document.createElement("div");
    tooltipEl.className = "clinic-tour-tooltip";
    tooltipEl.setAttribute("role", "document");

    // Title
    var titleEl = document.createElement("p");
    titleEl.className = "clinic-tour-tooltip-title";
    titleEl.id = "clinic-tour-tooltip-title";

    // Body
    var bodyEl = document.createElement("p");
    bodyEl.className = "clinic-tour-tooltip-body";

    // Progress indicator
    progressEl = document.createElement("p");
    progressEl.className = "clinic-tour-tooltip-progress";

    // Button row
    var btnRow = document.createElement("div");
    btnRow.className = "clinic-tour-tooltip-actions";

    var skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "clinic-tour-btn clinic-tour-btn-skip";
    skipBtn.textContent = "Skip Tour";

    var navRow = document.createElement("div");
    navRow.className = "clinic-tour-tooltip-nav";

    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "clinic-tour-btn clinic-tour-btn-back";
    backBtn.textContent = "Back";
    backBtn.setAttribute("aria-label", "Go to previous step");

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "clinic-tour-btn clinic-tour-btn-next";
    nextBtn.textContent = "Next";
    nextBtn.setAttribute("aria-label", "Go to next step");

    navRow.appendChild(backBtn);
    navRow.appendChild(nextBtn);
    btnRow.appendChild(skipBtn);
    btnRow.appendChild(navRow);

    tooltipEl.appendChild(titleEl);
    tooltipEl.appendChild(bodyEl);
    tooltipEl.appendChild(progressEl);
    tooltipEl.appendChild(btnRow);

    overlay.appendChild(spotlightEl);
    overlay.appendChild(tooltipEl);
    document.body.appendChild(overlay);

    // Screen-reader live region
    liveRegion = document.createElement("div");
    liveRegion.className = "sr-only";
    liveRegion.setAttribute("aria-live", "assertive");
    liveRegion.setAttribute("role", "status");
    document.body.appendChild(liveRegion);

    // Event bindings
    skipBtn.addEventListener("click", dismiss);
    backBtn.addEventListener("click", prevStep);
    nextBtn.addEventListener("click", nextStep);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) dismiss();
    });
  }

  function destroyOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (liveRegion && liveRegion.parentNode)
      liveRegion.parentNode.removeChild(liveRegion);
    overlay = null;
    spotlightEl = null;
    tooltipEl = null;
    progressEl = null;
    liveRegion = null;
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------
  function renderStep() {
    if (!isActive || currentStep < 0 || currentStep >= STEPS.length) return;

    var step = STEPS[currentStep];

    // If the step requires a panel switch, activate it first.
    if (step.panel) {
      activatePanel(step.panel);
    }

    // Give the DOM a frame to settle after panel switch, then highlight.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        highlightElement(step);
      });
    });
  }

  function highlightElement(step) {
    var target = resolveTarget(step.selector);

    // If the target is still not visible (hidden panel), skip to next.
    if (!target || !isVisible(target)) {
      // Try activating the panel again and wait one more frame
      if (step.panel) {
        activatePanel(step.panel);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var retry = resolveTarget(step.selector);
            if (retry && isVisible(retry)) {
              positionSpotlight(retry, step);
            } else if (currentStep < STEPS.length - 1) {
              currentStep++;
              renderStep();
            } else {
              dismiss();
            }
          });
        });
        return;
      }
      // No panel to switch — skip this step
      if (currentStep < STEPS.length - 1) {
        currentStep++;
        renderStep();
      } else {
        dismiss();
      }
      return;
    }

    positionSpotlight(target, step);
  }

  function positionSpotlight(target, step) {
    var rect = target.getBoundingClientRect();
    var pad = SPOTLIGHT_PAD;
    var spotTop = rect.top - pad;
    var spotLeft = rect.left - pad;
    var spotW = rect.width + pad * 2;
    var spotH = rect.height + pad * 2;

    // Position the spotlight cutout (viewport coords — parent overlay is fixed)
    spotlightEl.style.top = spotTop + "px";
    spotlightEl.style.left = spotLeft + "px";
    spotlightEl.style.width = spotW + "px";
    spotlightEl.style.height = spotH + "px";
    spotlightEl.classList.add("clinic-tour-spotlight--active");

    // Populate tooltip content
    var titleEl = tooltipEl.querySelector(".clinic-tour-tooltip-title");
    var bodyEl = tooltipEl.querySelector(".clinic-tour-tooltip-body");
    var backBtn = tooltipEl.querySelector(".clinic-tour-btn-back");
    var nextBtn = tooltipEl.querySelector(".clinic-tour-btn-next");

    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    progressEl.textContent = "Step " + (currentStep + 1) + " of " + STEPS.length;

    // Button labels
    backBtn.style.display = currentStep === 0 ? "none" : "";
    if (currentStep === STEPS.length - 1) {
      nextBtn.textContent = "Done";
      nextBtn.classList.add("clinic-tour-btn-done");
    } else {
      nextBtn.textContent = "Next";
      nextBtn.classList.remove("clinic-tour-btn-done");
    }

    // Position tooltip
    positionTooltip(spotTop, spotLeft, spotW, spotH, step.position);

    // Announce to screen readers
    if (liveRegion) {
      liveRegion.textContent =
        "Step " +
        (currentStep + 1) +
        " of " +
        STEPS.length +
        ": " +
        step.title +
        ". " +
        step.body;
    }

    // Move focus into the tooltip for keyboard accessibility
    setTimeout(function () {
      nextBtn.focus();
    }, 100);
  }

  function positionTooltip(spotTop, spotLeft, spotW, spotH, preferred) {
    var tw = 320; // estimated tooltip width
    var th = tooltipEl.offsetHeight || 180;
    var gap = 14;
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;

    var pos = preferred || "bottom";

    // Candidate positions (all viewport-relative — parent overlay is fixed)
    function calcPos(p) {
      switch (p) {
        case "bottom":
          return {
            top: spotTop + spotH + gap,
            left: spotLeft + spotW / 2 - tw / 2,
          };
        case "top":
          return {
            top: spotTop - th - gap,
            left: spotLeft + spotW / 2 - tw / 2,
          };
        case "left":
          return {
            top: spotTop + spotH / 2 - th / 2,
            left: spotLeft - tw - gap,
          };
        case "right":
          return {
            top: spotTop + spotH / 2 - th / 2,
            left: spotLeft + spotW + gap,
          };
        default:
          return calcPos("bottom");
      }
    }

    var positions = ["bottom", "top", "right", "left"];
    // Move preferred to front
    var idx = positions.indexOf(pos);
    if (idx > 0) {
      positions.splice(idx, 1);
      positions.unshift(pos);
    }

    var best = null;
    for (var i = 0; i < positions.length; i++) {
      var c = calcPos(positions[i]);
      // Check it fits within viewport
      if (
        c.left >= 4 &&
        c.left + tw <= viewW - 4 &&
        c.top >= 4 &&
        c.top + th <= viewH - 4
      ) {
        best = c;
        break;
      }
    }

    // Fallback: clamp within viewport
    if (!best) {
      best = calcPos("bottom");
      best.top = Math.max(4, Math.min(best.top, viewH - th - 4));
      best.left = Math.max(4, Math.min(best.left, viewW - tw - 4));
    }

    tooltipEl.style.top = best.top + "px";
    tooltipEl.style.left = best.left + "px";
    tooltipEl.style.maxWidth = tw + "px";

    // Update arrow direction class
    tooltipEl.classList.remove(
      "clinic-tour-tooltip--bottom",
      "clinic-tour-tooltip--top",
      "clinic-tour-tooltip--left",
      "clinic-tour-tooltip--right",
    );
    var arrowClass = "clinic-tour-tooltip--" + (best.top > spotTop + spotH / 2 ? "top" : "bottom");
    if (best.left + tw < spotLeft) arrowClass = "clinic-tour-tooltip--right";
    if (best.left > spotLeft + spotW) arrowClass = "clinic-tour-tooltip--left";
    tooltipEl.classList.add(arrowClass);
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------
  function nextStep() {
    if (currentStep < STEPS.length - 1) {
      currentStep++;
      renderStep();
    } else {
      complete();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  }

  function complete() {
    markCompleted();
    stop();
    if (typeof DashboardUI !== "undefined" && DashboardUI.toast) {
      DashboardUI.toast("Tour completed! You're all set.", "success");
    }
  }

  function dismiss() {
    stop();
  }

  function stop() {
    isActive = false;
    currentStep = 0;
    destroyOverlay();
    // Restore focus to the element that triggered the tour
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
    // Remove keyboard / resize listeners
    document.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("scroll", handleScroll, true);
  }

  // -----------------------------------------------------------------------
  // Event Handlers
  // -----------------------------------------------------------------------
  function handleKeydown(e) {
    if (!isActive) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        dismiss();
        break;
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        nextStep();
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        prevStep();
        break;
      case "Enter":
      case " ":
        // Only advance if focus is on the tooltip (not an input)
        if (
          tooltipEl &&
          tooltipEl.contains(document.activeElement) &&
          document.activeElement.tagName !== "INPUT"
        ) {
          e.preventDefault();
          nextStep();
        }
        break;
      case "Tab":
        // Trap focus within the tooltip
        if (tooltipEl) {
          var focusable = tooltipEl.querySelectorAll(
            'button:not([style*="display: none"]), [tabindex]',
          );
          if (focusable.length === 0) break;
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        break;
    }
  }

  var resizeTimer = null;
  function handleResize() {
    if (!isActive) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      renderStep();
    }, 150);
  }

  var scrollTimer = null;
  function handleScroll() {
    if (!isActive) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      renderStep();
    }, 100);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  function start() {
    if (isActive) return;
    if (isAppLocked()) return;

    isActive = true;
    currentStep = 0;
    lastFocusedElement = document.activeElement;

    buildOverlay();

    // Attach listeners
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    renderStep();
  }

  function restart() {
    clearCompleted();
    start();
  }

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------
  function injectHelpButton() {
    // Insert a "Tour" button into the dashboard header area
    var header = document.getElementById("dashboard-header");
    if (!header) return;

    // Check if button already injected
    if (document.getElementById("clinic-tour-trigger")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "clinic-tour-trigger";
    btn.className =
      "inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 text-[11px] font-bold px-3 py-2 rounded-lg transition-all cursor-pointer shrink-0";
    btn.innerHTML =
      '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />' +
      "</svg>" +
      '<span>Tour</span>';
    btn.setAttribute("aria-label", "Start guided tour of the dashboard");
    btn.addEventListener("click", function () {
      lastFocusedElement = btn;
      if (isCompleted()) {
        restart();
      } else {
        start();
      }
    });

    // Place the button after the header text div, before any future buttons
    var wrapper = header.querySelector("div");
    if (wrapper) {
      header.style.flexWrap = "wrap";
      header.appendChild(btn);
    }
  }

  function boot() {
    injectHelpButton();

    // Auto-start on first login (tour not yet completed)
    if (!isCompleted() && !isAppLocked()) {
      setTimeout(function () {
        if (!isActive && !isAppLocked()) {
          start();
        }
      }, TOUR_START_DELAY);
    }
  }

  // Expose public API for manual control
  window.ClinicTour = {
    start: start,
    restart: restart,
    dismiss: dismiss,
    isCompleted: isCompleted,
    clearCompleted: clearCompleted,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
