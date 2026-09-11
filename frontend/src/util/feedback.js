/* Shared, user-safe feedback helpers for all browser flows. */
(function () {
  const messages = {
    network:
      "We couldn't connect right now. Check your connection and try again.",
    server: "We couldn't load this information right now. Please try again.",
    timeout: "This is taking longer than expected. Please try again.",
    unauthorized:
      "You don't have access to this area. Please sign in with an authorized account.",
    forbidden:
      "You don't have permission to complete this action. Please contact your clinic administrator.",
    unexpected:
      "Something went wrong. Your information is safe; please try again.",
  };

  function classify(error, response) {
    const status = response?.status || error?.status;
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    if (error?.name === "AbortError" || error?.code === "TIMEOUT")
      return "timeout";
    if (
      !response &&
      (error instanceof TypeError ||
        /network|fetch|connect/i.test(error?.message || ""))
    )
      return "network";
    if (status >= 500) return "server";
    return "unexpected";
  }

  function safeMessage(error, response) {
    const status = response?.status || error?.status;
    // Prefer explicit server-provided feedback for client errors (4xx).
    // These are intentional validation/conflict responses (e.g. "An account
    // with this email address already exists.") and should be shown verbatim
    // instead of being replaced by a generic "something went wrong" message.
    if (status && status >= 400 && status < 500) {
      const serverMessage =
        error?.data?.message ||
        error?.data?.error ||
        response?.data?.message ||
        "";
      if (typeof serverMessage === "string" && serverMessage.trim()) {
        return serverMessage.trim();
      }
    }
    return messages[classify(error, response)] || messages.unexpected;
  }

  async function request(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        /* Empty/non-JSON response is handled below. */
      }
      if (!response.ok) {
        const error = new Error("Request failed");
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function announce(text, type = "status") {
    let live = document.getElementById("app-live-region");
    if (!live) {
      live = document.createElement("div");
      live.id = "app-live-region";
      live.className = "sr-only";
      live.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
      live.setAttribute("role", type === "error" ? "alert" : "status");
      document.body.appendChild(live);
    }
    live.textContent = text;
  }

  function setPanel(element, { message, type = "error", retry } = {}) {
    if (!element) return;
    const styles =
      type === "empty"
        ? "bg-slate-50 border-slate-200 text-slate-600"
        : type === "success"
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-rose-50 border-rose-200 text-rose-700";
    element.className = `p-4 rounded-xl border text-sm text-center ${styles}`;
    element.setAttribute("role", type === "error" ? "alert" : "status");
    element.innerHTML = `<p>${message}</p>${retry ? '<button type="button" data-feedback-retry class="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500">Try again</button>' : ""}`;
    if (retry)
      element
        .querySelector("[data-feedback-retry]")
        .addEventListener("click", retry);
    announce(message, type === "error" ? "error" : "status");
  }

  function showFieldError(field, message) {
    if (!field) return false;
    field.setAttribute("aria-invalid", "true");
    let hint = document.getElementById(`${field.id}-error`);
    if (!hint) {
      hint = document.createElement("p");
      hint.id = `${field.id}-error`;
      hint.className = "mt-1 text-xs font-medium text-rose-700";
      field.insertAdjacentElement("afterend", hint);
    }
    hint.textContent = message;
    field.setAttribute("aria-describedby", hint.id);
    return true;
  }

  function clearFieldError(field) {
    if (!field) return;
    field.removeAttribute("aria-invalid");
    const hint = document.getElementById(`${field.id}-error`);
    if (hint) hint.remove();
  }

  window.AppFeedback = {
    classify,
    safeMessage,
    request,
    announce,
    setPanel,
    showFieldError,
    clearFieldError,
    messages,
  };
})();
