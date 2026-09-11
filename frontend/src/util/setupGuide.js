// src/util/setupGuide.js
// Persistent floating setup prompts (Dental Pricing + Operating Hours).
//
// Whenever the clinic has an item unconfigured, a floating card appears
// bottom-right with a "Set up now" shortcut into the right panel — on every
// login, not just the first. Dismissing (×) hides the card for the current
// session only; it returns on next load until the item is actually
// configured. Never nags on fetch errors, so a down backend stays silent.
// ---------------------------------------------------------------------------
(function () {
  "use strict";

  function authHeaders() {
    const raw = localStorage.getItem("token");
    const token = raw ? raw.replace(/['"]+/g, "") : "";
    let clinicId = "";
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      clinicId = user.clinicId || localStorage.getItem("clinicId") || "";
    } catch {
      clinicId = localStorage.getItem("clinicId") || "";
    }
    return { token, clinicId };
  }

  // Session-only dismissals: × hides a card until the next full page load.
  // Nothing persists — an unconfigured item always comes back.
  const dismissedThisSession = new Set();

  function canShow() {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (!["SUPER_ADMIN", "CLINIC_ADMIN"].includes(user.role)) return false;
    } catch {
      return false;
    }
    if (document.body.classList.contains("application-locked")) return false;
    return true;
  }

  // Pricing counts as configured when at least one treatment exists.
  async function isPricingConfigured() {
    const { token, clinicId } = authHeaders();
    if (!token || !clinicId) return true; // can't tell — don't nag
    const res = await fetch(window.apiUrl("/api/v1/dental-price/services"), {
      headers: { Authorization: `Bearer ${token}`, "x-clinic-id": clinicId },
    });
    if (!res.ok) throw new Error(`pricing check: HTTP ${res.status}`);
    const out = await res.json();
    const list = out?.data || out || [];
    return Array.isArray(list) && list.length > 0;
  }

  // Hours count as configured once a schedule has been saved at least once.
  async function isHoursConfigured() {
    const { token, clinicId } = authHeaders();
    if (!token || !clinicId) return true; // can't tell — don't nag
    const res = await fetch(window.apiUrl(`/api/v1/tenants/${clinicId}`), {
      headers: { Authorization: `Bearer ${token}`, "x-clinic-id": clinicId },
    });
    if (!res.ok) throw new Error(`hours check: HTTP ${res.status}`);
    const out = await res.json();
    const clinic = out?.clinic || out?.data || out;
    return Array.isArray(clinic?.operatingHours) && clinic.operatingHours.length > 0;
  }

  const ITEMS = [
    {
      key: "pricing",
      dot: "bg-emerald-500",
      title: "Set up dental pricing",
      body: "Add your treatments and prices so bookings and invoices show real fees.",
      target: "panel-pricing",
      check: isPricingConfigured,
    },
    {
      key: "hours",
      dot: "bg-indigo-500",
      title: "Set your operating hours",
      body: "Configure open days and hours so patients can only book real slots.",
      target: "panel-hours",
      check: isHoursConfigured,
    },
  ];

  function goToPanel(target) {
    const trigger = document.querySelector(`[data-target="${target}"]`);
    if (trigger) trigger.click();
  }

  function buildCard(item) {
    const card = document.createElement("div");
    card.className =
      "bg-white border border-slate-200 rounded-xl shadow-lg p-4 flex gap-3";
    card.setAttribute("role", "status");
    card.dataset.setupCard = item.key;

    const dot = document.createElement("span");
    dot.className = `mt-1 w-2 h-2 rounded-full shrink-0 ${item.dot}`;
    dot.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "min-w-0 flex-1";

    const title = document.createElement("p");
    title.className = "text-xs font-black text-slate-900";
    title.textContent = item.title;

    const text = document.createElement("p");
    text.className = "text-[11px] text-slate-500 mt-0.5 leading-relaxed";
    text.textContent = item.body;

    const setup = document.createElement("button");
    setup.type = "button";
    setup.className =
      "mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors";
    setup.textContent = "Set up now";
    setup.addEventListener("click", () => goToPanel(item.target));

    body.append(title, text, setup);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className =
      "text-slate-400 hover:text-slate-700 text-sm leading-none p-1 cursor-pointer shrink-0";
    dismiss.setAttribute("aria-label", `Dismiss: ${item.title}`);
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", () => {
      dismissedThisSession.add(item.key);
      card.remove();
    });

    card.append(dot, body, dismiss);
    return card;
  }

  // Reconcile cards with reality: add a card for every unconfigured,
  // non-dismissed item; remove cards whose item just got configured
  // (e.g. the admin saved pricing/hours mid-session).
  async function sync() {
    if (!canShow()) return;
    const slot = document.getElementById("setup-guide-slot");
    if (!slot) return;
    for (const item of ITEMS) {
      const existing = slot.querySelector(`[data-setup-card="${item.key}"]`);
      if (dismissedThisSession.has(item.key)) {
        existing?.remove();
        continue;
      }
      let configured = true;
      try {
        configured = await item.check();
      } catch (err) {
        console.warn(`Setup guide check skipped (${item.key}):`, err?.message || err);
        continue;
      }
      if (configured) {
        existing?.remove();
      } else if (!existing) {
        slot.appendChild(buildCard(item));
      }
    }
  }

  function boot() {
    sync();
    // Re-check periodically while the tab is visible so a mid-session save
    // clears its card without a reload — and anything still unconfigured
    // keeps showing on every login.
    setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
