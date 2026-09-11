// Shared feedback primitives for the clinic dashboard (light theme).
// Exposes a global `DashboardUI` so classic (non-module) page scripts can show
// non-blocking toasts, accessible confirmation dialogs, skeleton loaders, and
// empty/error states instead of blocking window.alert()/confirm() calls.
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------
  // Delegates to the global toast system (src/util/toast.js -> window.Toast),
  // which every page loads. This keeps the legacy DashboardUI.toast(message,
  // type, options) signature working across all existing call sites.
  function toast(message, type = "info", options = {}) {
    const api = window.Toast;
    if (api && typeof api.show === "function") {
      return api.show(message, type, options);
    }
    // Fallback if toast.js is missing on the page: don't crash callers.
    console.warn("[DashboardUI] window.Toast unavailable; message:", message);
    return null;
  }

  // ---------------------------------------------------------------------
  // Confirmation dialog (Promise<boolean>)
  // ---------------------------------------------------------------------
  let confirmState = null;

  function ensureConfirmModal() {
    if (confirmState) return confirmState;

    const overlay = document.createElement("div");
    overlay.className =
      "hidden fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "dashboard-confirm-title");

    const panel = document.createElement("div");
    panel.className =
      "max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xl";

    const title = document.createElement("h3");
    title.id = "dashboard-confirm-title";
    title.className = "text-sm font-bold text-slate-900 uppercase tracking-wider";

    const body = document.createElement("p");
    body.className = "text-xs text-slate-500 leading-relaxed";

    const actions = document.createElement("div");
    actions.className = "flex items-center justify-end gap-3 pt-2";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className =
      "text-xs font-bold text-slate-500 hover:text-slate-900 px-4 py-2 transition-colors cursor-pointer";
    cancel.textContent = "Cancel";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className =
      "text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer";

    actions.appendChild(cancel);
    actions.appendChild(accept);
    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    confirmState = { overlay, title, body, cancel, accept, resolver: null, lastFocus: null };

    const settle = (result) => {
      overlay.classList.add("hidden");
      const resolve = confirmState.resolver;
      confirmState.resolver = null;
      if (confirmState.lastFocus && confirmState.lastFocus.isConnected) {
        confirmState.lastFocus.focus();
      }
      if (resolve) resolve(result);
    };

    cancel.addEventListener("click", () => settle(false));
    accept.addEventListener("click", () => settle(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) settle(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) settle(false);
    });
    confirmState.settle = settle;
    return confirmState;
  }

  function confirm({ title, body, confirmLabel = "Confirm", danger = false } = {}) {
    const state = ensureConfirmModal();
    state.title.textContent = title || "Please confirm";
    state.body.textContent = body || "";
    state.accept.textContent = confirmLabel;
    state.accept.className = `${
      danger
        ? "bg-rose-600 hover:bg-rose-500"
        : "bg-indigo-600 hover:bg-indigo-500"
    } text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer`;
    state.lastFocus = document.activeElement;
    state.overlay.classList.remove("hidden");
    state.accept.focus();
    return new Promise((resolve) => {
      state.resolver = resolve;
    });
  }

  // ---------------------------------------------------------------------
  // Skeletons / empty / error states
  // ---------------------------------------------------------------------
  function skeletonRows(tbody, rows = 3, cols = 5) {
    if (!tbody) return;
    tbody.replaceChildren();
    for (let r = 0; r < rows; r += 1) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c += 1) {
        const td = document.createElement("td");
        td.className = "p-3";
        const bar = document.createElement("div");
        bar.className = "h-4 bg-slate-100 rounded animate-pulse";
        td.appendChild(bar);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function skeletonCards(container, count = 3, heightClass = "h-16") {
    if (!container) return;
    container.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      container.appendChild(
        Object.assign(document.createElement("div"), {
          className: `${heightClass} bg-slate-100 rounded-xl animate-pulse`,
        }),
      );
    }
  }

  function emptyState(container, { icon = "", title = "", message = "", actionLabel, onAction } = {}) {
    if (!container) return;
    container.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className =
      "text-center py-10 px-6 bg-slate-50 border border-slate-200/70 rounded-xl";
    if (icon) {
      const i = document.createElement("div");
      i.className = "text-2xl mb-2";
      i.textContent = icon;
      wrap.appendChild(i);
    }
    if (title) {
      const h = document.createElement("p");
      h.className = "text-sm font-bold text-slate-800";
      h.textContent = title;
      wrap.appendChild(h);
    }
    if (message) {
      const p = document.createElement("p");
      p.className = "text-xs text-slate-500 mt-1";
      p.textContent = message;
      wrap.appendChild(p);
    }
    if (actionLabel && typeof onAction === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mt-4 inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white transition-colors cursor-pointer";
      btn.textContent = actionLabel;
      btn.addEventListener("click", onAction);
      wrap.appendChild(btn);
    }
    container.appendChild(wrap);
  }

  function errorState(container, message, onRetry) {
    if (!container) return;
    container.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className =
      "text-center py-8 px-6 bg-rose-50 border border-rose-200 rounded-xl space-y-3";
    const p = document.createElement("p");
    p.className = "text-xs font-bold text-rose-700";
    p.textContent = message || "Something went wrong.";
    wrap.appendChild(p);
    if (typeof onRetry === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "inline-flex items-center rounded-lg bg-slate-900 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-white transition-colors cursor-pointer";
      btn.textContent = "Try again";
      btn.addEventListener("click", onRetry);
      wrap.appendChild(btn);
    }
    container.appendChild(wrap);
  }

  window.DashboardUI = {
    toast,
    confirm,
    skeletonRows,
    skeletonCards,
    emptyState,
    errorState,
  };
})();
