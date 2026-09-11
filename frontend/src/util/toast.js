// Global toast notification system.
// Exposes a `window.Toast` singleton that any page script (classic or module)
// can call with a single function: Toast.success("Saved.") / Toast.error("...").
//
// - Self-contained: injects its own scoped CSS, so it looks identical on every
//   dashboard whether or not Tailwind is loaded on that page.
// - Accessible: one polite aria-live region; errors additionally use
//   role="alert" (assertive). Close buttons are real focusable buttons.
// - Configurable globally (Toast.configure) or per call (options object).
(function () {
  "use strict";

  const STYLE_ID = "nvx-toast-styles";
  const REGION_ID = "nvx-toast-region";

  const POSITIONS = [
    "bottom-right",
    "bottom-left",
    "bottom-center",
    "top-right",
    "top-left",
    "top-center",
  ];

  const TYPES = ["success", "error", "warning", "info"];

  const DEFAULTS = {
    duration: 5000, // ms; 0 = sticky until dismissed
    position: "bottom-right",
    maxVisible: 4, // oldest toast is dismissed when exceeded
    stacking: "stack", // "stack" | "replace" (dismiss existing first)
    newestOnTop: false, // prepend instead of append
    closeButton: true,
    pauseOnHover: true,
    progress: true, // thin lifetime bar; only when duration > 0
  };

  const config = { ...DEFAULTS };

  // Heroicons-style outline paths (aria-hidden; the toast text carries meaning).
  const ICONS = {
    success:
      '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />',
    error:
      '<path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />',
    warning:
      '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />',
    info: '<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />',
  };

  const CLOSE_ICON =
    '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />';

  const CSS = `
.nvx-toast-region {
  position: fixed;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: min(384px, calc(100vw - 32px));
  pointer-events: none;
}
.nvx-toast-region--bottom-right { right: 16px; bottom: 16px; }
.nvx-toast-region--bottom-left { left: 16px; bottom: 16px; }
.nvx-toast-region--bottom-center { left: 50%; bottom: 16px; transform: translateX(-50%); }
.nvx-toast-region--top-right { right: 16px; top: 16px; }
.nvx-toast-region--top-left { left: 16px; top: 16px; }
.nvx-toast-region--top-center { left: 50%; top: 16px; transform: translateX(-50%); }

.nvx-toast {
  --nvx-accent: #2563eb;
  --nvx-accent-soft: #eff6ff;
  --nvx-enter-y: 14px;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  margin-top: 10px;
  padding: 12px 14px 14px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-left: 3px solid var(--nvx-accent);
  border-radius: 14px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.05),
    0 10px 30px rgba(15, 23, 42, 0.12),
    0 24px 48px rgba(15, 23, 42, 0.08);
  font-family: inherit;
  text-align: left;
  overflow: hidden;
  pointer-events: auto;
  animation: nvx-toast-in 0.32s cubic-bezier(0.21, 1.02, 0.55, 1) both;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.nvx-toast:first-child { margin-top: 0; }

.nvx-toast--success { --nvx-accent: #059669; --nvx-accent-soft: #ecfdf5; }
.nvx-toast--error { --nvx-accent: #dc2626; --nvx-accent-soft: #fef2f2; }
.nvx-toast--warning { --nvx-accent: #d97706; --nvx-accent-soft: #fffbeb; }
.nvx-toast--info { --nvx-accent: #2563eb; --nvx-accent-soft: #eff6ff; }

.nvx-toast-region--top-right .nvx-toast,
.nvx-toast-region--top-left .nvx-toast,
.nvx-toast-region--top-center .nvx-toast { --nvx-enter-y: -14px; }

@keyframes nvx-toast-in {
  from { opacity: 0; transform: translateY(var(--nvx-enter-y, 14px)) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.nvx-toast__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--nvx-accent-soft);
  color: var(--nvx-accent);
}
.nvx-toast__icon svg { width: 17px; height: 17px; }

.nvx-toast__content { flex: 1 1 auto; min-width: 0; padding-top: 1px; }
.nvx-toast__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.4;
  color: #0f172a;
}
.nvx-toast__message {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.55;
  color: #475569;
  overflow-wrap: anywhere;
}
.nvx-toast__title + .nvx-toast__message { margin-top: 2px; }

.nvx-toast__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: -2px -4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.nvx-toast__close svg { width: 14px; height: 14px; }
.nvx-toast__close:hover { background: #f1f5f9; color: #0f172a; }
.nvx-toast__close:focus-visible {
  outline: 2px solid var(--nvx-accent);
  outline-offset: 2px;
}

.nvx-toast__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.5px;
  background: var(--nvx-accent);
  opacity: 0.85;
  transform-origin: left;
  animation-name: nvx-toast-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes nvx-toast-progress {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Hover/tap pauses both the countdown timer and the progress bar. */
.nvx-toast--paused .nvx-toast__progress { animation-play-state: paused; }

/* Exit: fade + slide first, then collapse height so remaining toasts glide up. */
.nvx-toast--leaving {
  opacity: 0 !important;
  transform: translateY(8px) scale(0.97) !important;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    height 0.24s cubic-bezier(0.4, 0, 0.2, 1) 0.12s,
    margin-top 0.24s cubic-bezier(0.4, 0, 0.2, 1) 0.12s,
    padding-top 0.24s cubic-bezier(0.4, 0, 0.2, 1) 0.12s,
    padding-bottom 0.24s cubic-bezier(0.4, 0, 0.2, 1) 0.12s,
    border-top-width 0.24s cubic-bezier(0.4, 0, 0.2, 1) 0.12s,
    border-bottom-width 0.24s cubic-bezier(0.4, 0, 0.2, 1) 0.12s;
}
.nvx-toast--collapse {
  height: 0 !important;
  min-height: 0 !important;
  margin-top: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-top-width: 0 !important;
  border-bottom-width: 0 !important;
}

/* Small screens: toasts span nearly the full width regardless of placement. */
@media (max-width: 640px) {
  .nvx-toast-region--bottom-right,
  .nvx-toast-region--bottom-left,
  .nvx-toast-region--bottom-center {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    transform: none;
  }
  .nvx-toast-region--top-right,
  .nvx-toast-region--top-left,
  .nvx-toast-region--top-center {
    left: 12px;
    right: 12px;
    top: 12px;
    width: auto;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nvx-toast { animation: none; transition: none; }
  .nvx-toast--leaving { transition: opacity 0.01s linear; }
  .nvx-toast__progress { display: none; }
}
`;

  let region = null;
  let uid = 0;
  const live = new Map(); // id -> entry (insertion order = creation order)

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function normalizePosition(position) {
    return POSITIONS.includes(position) ? position : DEFAULTS.position;
  }

  function applyRegionPosition() {
    if (!region) return;
    region.className = `nvx-toast-region nvx-toast-region--${normalizePosition(config.position)}`;
  }

  function ensureRegion() {
    if (region && region.isConnected) return region;
    injectStyles();
    region = document.createElement("div");
    region.id = REGION_ID;
    region.className = "nvx-toast-region";
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", "Notifications");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
    applyRegionPosition();
    return region;
  }

  // ---------------------------------------------------------------------
  // Countdown timers (pause-aware)
  // ---------------------------------------------------------------------
  function startTimer(entry) {
    if (!entry.duration || entry.duration <= 0 || entry.timer) return;
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => dismiss(entry.id), entry.remaining);
  }

  function stopTimer(entry) {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.remaining -= Date.now() - entry.startedAt;
    if (entry.remaining < 0) entry.remaining = 0;
    entry.timer = null;
  }

  function pauseEntry(entry) {
    if (entry.leaving || entry.paused) return;
    stopTimer(entry);
    entry.paused = true;
    entry.el.classList.add("nvx-toast--paused");
  }

  function resumeEntry(entry) {
    if (entry.leaving || !entry.paused) return;
    entry.paused = false;
    startTimer(entry);
    entry.el.classList.remove("nvx-toast--paused");
  }

  // Pause countdowns while the tab is hidden so toasts don't vanish unseen.
  // On return, toasts under the cursor stay paused until the pointer leaves.
  document.addEventListener("visibilitychange", () => {
    live.forEach((entry) => {
      if (document.hidden) pauseEntry(entry);
      else if (!entry.hovered) resumeEntry(entry);
    });
  });

  // ---------------------------------------------------------------------
  // Dismissal (animated exit, then collapse so the stack glides shut)
  // ---------------------------------------------------------------------
  function dismiss(id) {
    const entry = live.get(id);
    if (!entry || entry.leaving) return false;
    entry.leaving = true;

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    const { el } = entry;
    el.classList.add("nvx-toast--leaving");

    // Pin the current height, then collapse it on the next frame so the
    // remaining toasts slide closed smoothly instead of snapping.
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.classList.add("nvx-toast--collapse");

    const remove = () => {
      if (entry.removed) return;
      entry.removed = true;
      live.delete(id);
      el.remove();
    };
    el.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 500); // fallback (e.g. reduced-motion / hidden tab)
    return true;
  }

  function dismissAll() {
    [...live.keys()].forEach((id) => dismiss(id));
  }

  // ---------------------------------------------------------------------
  // Show
  // ---------------------------------------------------------------------
  function show(message, type = "info", options = {}) {
    const opts = {
      ...config,
      ...(options && typeof options === "object" ? options : {}),
    };

    const tone = TYPES.includes(type) ? type : "info";
    const duration = Math.max(0, Number(opts.duration) || 0);
    const title = typeof opts.title === "string" ? opts.title.trim() : "";
    const text = String(message == null ? "" : message).trim() || "Notification";

    if (opts.stacking === "replace") dismissAll();

    const container = ensureRegion();
    applyRegionPosition();

    const el = document.createElement("div");
    el.className = `nvx-toast nvx-toast--${tone}`;
    // Errors interrupt (assertive) via role="alert"; others are status updates.
    el.setAttribute("role", tone === "error" ? "alert" : "status");

    const icon = document.createElement("span");
    icon.className = "nvx-toast__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">${ICONS[tone]}</svg>`;
    el.appendChild(icon);

    const content = document.createElement("div");
    content.className = "nvx-toast__content";
    if (title) {
      const heading = document.createElement("p");
      heading.className = "nvx-toast__title";
      heading.textContent = title;
      content.appendChild(heading);
    }
    const body = document.createElement("p");
    body.className = "nvx-toast__message";
    body.textContent = text; // textContent — never inject caller HTML
    content.appendChild(body);
    el.appendChild(content);

    if (opts.closeButton) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "nvx-toast__close";
      close.setAttribute("aria-label", "Dismiss notification");
      close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">${CLOSE_ICON}</svg>`;
      close.addEventListener("click", () => dismiss(id));
      el.appendChild(close);
    }

    if (opts.progress && duration > 0) {
      const bar = document.createElement("span");
      bar.className = "nvx-toast__progress";
      bar.setAttribute("aria-hidden", "true");
      bar.style.animationDuration = `${duration}ms`;
      el.appendChild(bar);
    }

    const entry = {
      id: `nvx-toast-${++uid}`,
      el,
      duration,
      remaining: duration,
      startedAt: 0,
      timer: null,
      paused: false,
      hovered: false,
      leaving: false,
      removed: false,
    };

    if (opts.pauseOnHover) {
      el.addEventListener("mouseenter", () => {
        entry.hovered = true;
        pauseEntry(entry);
      });
      el.addEventListener("mouseleave", () => {
        entry.hovered = false;
        resumeEntry(entry);
      });
    }

    live.set(entry.id, entry);

    if (opts.newestOnTop) {
      container.prepend(el);
    } else {
      container.appendChild(el);
    }

    // Overflow: dismiss the oldest visible toasts beyond the cap.
    if (opts.maxVisible > 0) {
      const visible = [...live.values()].filter((e) => !e.leaving);
      visible
        .slice(0, Math.max(0, visible.length - opts.maxVisible))
        .forEach((e) => dismiss(e.id));
    }

    startTimer(entry);

    return {
      id: entry.id,
      element: el,
      dismiss: () => dismiss(entry.id),
    };
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  function configure(partial = {}) {
    if (partial && typeof partial === "object") {
      Object.assign(config, partial);
    }
    applyRegionPosition();
    return { ...config };
  }

  const Toast = {
    show,
    success: (message, options) => show(message, "success", options),
    error: (message, options) => show(message, "error", options),
    warning: (message, options) => show(message, "warning", options),
    info: (message, options) => show(message, "info", options),
    dismiss,
    dismissAll,
    configure,
  };

  window.Toast = Toast;
})();
