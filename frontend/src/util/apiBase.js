// src/util/apiBase.js
// Single source of truth for the backend origin. Classic script → sets
// window.ApiBase / window.apiUrl / window.socketUrl. Load BEFORE any page
// script that calls the API.
//
// Resolution order:
//   1. window.VITE_API_URL — baked at build time (`VITE_API_URL=... npm run
//      build`), e.g. the Render backend URL. Trailing slashes are stripped.
//   2. Same-origin (window.location.origin) — covers the single-service
//      deployment where the backend serves the frontend bundle.
//   3. http://localhost:5000 — local development fallback only.
//
(function () {
  "use strict";

  function str(value) {
    return String(value == null ? "" : value).trim().replace(/\/+$/, "");
  }

  function resolveBase() {
    // Injected at build time via `<script>window.VITE_API_URL="%VITE_API_URL%"</script>`
    // in each HTML page. When the variable is unset, Vite leaves the literal
    // placeholder text behind — treat that (and anything non-URL) as empty.
    const raw = typeof window.VITE_API_URL !== "undefined" ? str(window.VITE_API_URL) : "";
    const baked = raw && !/%/.test(raw) && /^https?:\/\//i.test(raw) ? raw : "";
    if (baked) return baked;
    try {
      const host = String(window.location.hostname || "").toLowerCase();
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        return str(window.location.origin);
      }
    } catch {
      /* non-browser context — fall through to localhost */
    }
    return "http://localhost:5000";
  }

  const base = resolveBase();

  window.ApiBase = base;
  window.apiUrl = function apiUrl(path) {
    const clean = String(path || "");
    return base + (clean.startsWith("/") ? clean : `/${clean}`);
  };
  window.socketUrl = function socketUrl() {
    return base;
  };
})();
