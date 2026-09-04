/**
 * /src/util/passwordToggle.js
 * ------------------------------------------------------------------
 * Automatic "Show / Hide" (eye) toggle for every password field.
 *
 * - Wraps each <input type="password"> in a relative container (only once)
 * - Injects a right-aligned eye / eye-slash toggle button that swaps
 *   the field type between password and text
 * - Pushes the input's right padding so typed text never slides under
 *   the eye icon
 * - Adapts icon colors to light vs dark themed inputs
 * - Re-scans the DOM so password inputs added later by dynamic modals
 *   get the toggle automatically too
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  var EYE_OPEN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4 eye-open hidden" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path>' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path>' +
    "</svg>";

  var EYE_CLOSED_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4 eye-closed" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"></path>' +
    "</svg>";

  function parseRgb(color) {
    if (!color) return null;
    var m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function isLightText(color) {
    var rgb = parseRgb(color);
    if (!rgb) return false;
    var luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return luminance >= 150;
  }

  function upgradePasswordField(input) {
    if (!input || input.dataset.pwToggleBound === "true") return;

    // Keep a single wrapper per field so re-scans never double-wrap.
    var wrapper = input.closest(".pw-toggle-wrap");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "relative pw-toggle-wrap";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }
    wrapper.style.position = "relative";
    wrapper.style.zIndex = "1";

    // The original password fields can have a leading key/lock icon as a
    // sibling before the input. Keep that icon above the newly added wrapper;
    // otherwise the input background can paint over it.
    var leadingIcon = wrapper.previousElementSibling;
    if (leadingIcon && leadingIcon.querySelector("svg")) {
      leadingIcon.style.position = "absolute";
      leadingIcon.style.zIndex = "2";
      leadingIcon.style.pointerEvents = "none";
    }

    // Ensure enough right padding so characters don't run under the eye icon.
    var pr = parseFloat(window.getComputedStyle(input).paddingRight) || 0;
    if (pr < 28) {
      input.style.paddingRight = "2.5rem";
    }

    // A toggle button already exists for this wrapper.
    if (wrapper.querySelector(".password-toggle-btn")) {
      input.dataset.pwToggleBound = "true";
      return;
    }

    // Pick readable icon colors based on the input's text color. Inline colors
    // are used as a fallback so the icon stays visible even if Tailwind's CDN
    // has not generated the utility class yet.
    var onDark = isLightText(window.getComputedStyle(input).color);
    var iconColor = onDark ? "#e2e8f0" : "#475569";
    var iconHoverColor = onDark ? "#ffffff" : "#0f172a";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "password-toggle-btn absolute inset-y-0 right-0 flex items-center pr-3 pl-1.5 transition-colors focus:outline-none cursor-pointer select-none";
    btn.style.color = iconColor;
    btn.addEventListener("mouseenter", function () {
      btn.style.color = iconHoverColor;
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.color = iconColor;
    });
    btn.setAttribute("aria-label", "Show password");
    btn.title = "Show / Hide password";
    btn.innerHTML = EYE_OPEN_SVG + EYE_CLOSED_SVG;

    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";

      var open = btn.querySelector(".eye-open");
      var closed = btn.querySelector(".eye-closed");
      if (open) open.classList.toggle("hidden", !show);
      if (closed) closed.classList.toggle("hidden", show);

      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus({ preventScroll: true });
    });

    wrapper.appendChild(btn);
    input.dataset.pwToggleBound = "true";
  }

  function scan() {
    var fields = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < fields.length; i++) {
      upgradePasswordField(fields[i]);
    }
  }

  function boot() {
    scan();

    // Watch for password inputs injected later (dynamic modals / renders).
    if (window.MutationObserver && !window.__pwToggleObserverStarted) {
      window.__pwToggleObserverStarted = true;
      var observer = new MutationObserver(function (mutations) {
        var needsScan = false;
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType !== 1) continue;
            if (
              (node.matches && node.matches('input[type="password"]')) ||
              (node.querySelector &&
                node.querySelector('input[type="password"]'))
            ) {
              needsScan = true;
              break;
            }
          }
          if (needsScan) break;
        }
        if (needsScan) scan();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
