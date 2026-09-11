// /src/util/landingAuth.js
// Accessible sign-in / register / forgot-password modal for the landing page.
// - Opens from any [data-auth="login"|"register"] trigger
// - Backdrop click, Escape, and the close button all dismiss it
// - Focus is trapped inside the dialog while open and returned to the
//   triggering element on close
// - Login/register flows are the single canonical clinic auth entry point
//   (POST /api/v1/admin/login, POST /api/v1/tenants/register/*).
//   The legacy standalone clinicLogin page was removed; this modal is it.
(function () {
  "use strict";

  const VIEWS = {
    login: {
      title: "Sign in",
      desc: "Welcome back to your clinic workspace.",
    },
    register: {
      title: "Register your clinic",
      desc: "Set up your workspace — approval usually takes within 24 hours.",
    },
    verify: {
      title: "Verify your email",
      desc: "Enter the code we emailed to finish creating your workspace.",
    },
    "register-success": {
      title: "Application received",
      desc: "Your clinic workspace has been created.",
    },
    forgot: {
      title: "Forgot password?",
      desc: "We'll help you get back into your account.",
    },
  };

  // Views that switchView can toggle (element id = `auth-<name>-view`).
  const ALL_VIEWS = ["login", "register", "verify", "register-success", "forgot"];

  // Pending email-verification state (in memory only; never persisted).
  let pendingId = null;
  let pendingEmail = "";
  let pendingDocs = { business: null, medical: null };
  // Reassigned by setupVerify(); called by the register submit handler.
  let showVerifyView = () => {};

  const REMEMBER_KEY = "novaclinic_remember_email";

  let modal = null;
  let panel = null;
  let banner = null;
  let lastTrigger = null;

  // ---------------------------------------------------------------------
  // Field-level errors (design-system class, aria wired)
  // ---------------------------------------------------------------------
  function showFieldError(field, message) {
    if (!field) return;
    field.setAttribute("aria-invalid", "true");
    let hint = document.getElementById(`${field.id}-error`);
    if (!hint) {
      hint = document.createElement("p");
      hint.id = `${field.id}-error`;
      hint.className = "field-error";
      const anchor = field.closest(".pw-wrap") || field;
      anchor.insertAdjacentElement("afterend", hint);
    }
    hint.textContent = message;
    field.setAttribute("aria-describedby", hint.id);
  }

  function clearFieldError(field) {
    if (!field) return;
    field.removeAttribute("aria-invalid");
    const hint = document.getElementById(`${field.id}-error`);
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
  }

  function clearFormErrors(form) {
    if (!form) return;
    form.querySelectorAll("[aria-invalid='true']").forEach((field) => {
      field.removeAttribute("aria-invalid");
      const hint = document.getElementById(`${field.id}-error`);
      if (hint) {
        hint.textContent = "";
        hint.hidden = true;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Banner (success / error feedback inside the dialog)
  // ---------------------------------------------------------------------
  function showBanner(message, type) {
    if (!banner) return;
    banner.className =
      type === "success"
        ? "banner banner-success block"
        : "banner banner-error block";
    banner.replaceChildren();
    const text = document.createElement("span");
    text.textContent = message;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "banner-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss message");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", hideBanner);
    banner.append(text, dismiss);
  }

  function hideBanner() {
    if (!banner) return;
    banner.className = "banner hidden";
    banner.textContent = "";
  }

  // ---------------------------------------------------------------------
  // View switching
  // ---------------------------------------------------------------------
  function switchView(view) {
    const meta = VIEWS[view];
    if (!modal) return;
    const title = document.getElementById("auth-modal-title");
    const desc = document.getElementById("auth-modal-desc");
    if (meta && title) title.textContent = meta.title;
    if (meta && desc) desc.textContent = meta.desc;
    ALL_VIEWS.forEach((name) => {
      const el = document.getElementById(`auth-${name}-view`);
      if (el) el.hidden = name !== view;
    });
    hideBanner();
    clearFormErrors(document.getElementById("auth-login-form"));
    clearFormErrors(document.getElementById("auth-register-form"));
    if (view === "register") window.__authResetStep?.();

    // Prefill remembered email on the login view.
    if (view === "login") {
      const emailInput = document.getElementById("auth-login-email");
      const remember = document.getElementById("auth-remember");
      const remembered = localStorage.getItem(REMEMBER_KEY) || "";
      if (emailInput && !emailInput.value && remembered) {
        emailInput.value = remembered;
      }
      if (remember) remember.checked = Boolean(remembered);
    }
  }

  // ---------------------------------------------------------------------
  // Open / close with animation, scroll lock, focus management
  // ---------------------------------------------------------------------
  function openModal(view) {
    if (!modal) return;
    switchView(view || "login");
    modal.hidden = false;
    // Force a reflow so the enter transition plays from the hidden state.
    void modal.offsetWidth;
    modal.classList.add("open");
    document.body.classList.add("no-scroll");

    // Close the mobile menu in case the trigger lived inside it.
    const menu = document.getElementById("mobile-menu");
    const toggle = document.getElementById("menu-toggle");
    if (menu && menu.classList.contains("open")) {
      menu.classList.remove("open");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
      }
    }

    focusFirstInView();
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.remove("open");
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
      modal.hidden = true;
    }, 200);
    if (lastTrigger && lastTrigger.isConnected) {
      lastTrigger.focus();
    }
  }

  function focusFirstInView() {
    const view = panel && panel.querySelector(".auth-view:not([hidden])");
    const target =
      (view && view.querySelector("input, select, textarea, button")) ||
      panel;
    if (target) target.focus({ preventScroll: true });
  }

  function focusableElements() {
    if (!panel) return [];
    const view = panel.querySelector(".auth-view:not([hidden])");
    const root = view || panel;
    return Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Password visibility toggles (native, matches landing design system)
  // ---------------------------------------------------------------------
  const EYE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path>' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path>' +
    "</svg>";
  const EYE_OFF_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"></path>' +
    "</svg>";

  function upgradePasswordField(input) {
    if (!input || input.dataset.pwBound === "true") return;
    const wrap = input.closest(".pw-wrap");
    if (!wrap) return;
    if (wrap.querySelector(".pw-toggle")) {
      input.dataset.pwBound = "true";
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle";
    btn.setAttribute("aria-label", "Show password");
    btn.title = "Show / Hide password";
    btn.innerHTML = EYE_SVG + EYE_OFF_SVG;
    btn.querySelector("svg:last-of-type").style.display = "none";

    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.querySelectorAll("svg").forEach((svg) => {
        svg.style.display = show ? "none" : "";
      });
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus({ preventScroll: true });
    });

    wrap.appendChild(btn);
    input.dataset.pwBound = "true";
  }

  function setupPasswordToggles() {
    document
      .querySelectorAll("#auth-modal input[type='password']")
      .forEach(upgradePasswordField);
  }

  // ---------------------------------------------------------------------
  // LOGIN — clinic sign-in (POST /api/v1/admin/login + role gate)
  // ---------------------------------------------------------------------
  function setupLogin() {
    const form = document.getElementById("auth-login-form");
    if (!form) return;
    const emailInput = document.getElementById("auth-login-email");
    const passwordInput = document.getElementById("auth-login-password");
    const remember = document.getElementById("auth-remember");

    form.addEventListener("input", (e) => {
      if (e.target.matches("input")) clearFieldError(e.target);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn?.disabled) return;
      hideBanner();

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email) {
        showFieldError(emailInput, "Enter your workspace email.");
        emailInput.focus();
        return;
      }
      if (!emailInput.checkValidity()) {
        showFieldError(
          emailInput,
          "Enter a valid email address, such as you@clinic.com.",
        );
        emailInput.focus();
        return;
      }
      if (!password) {
        showFieldError(passwordInput, "Enter your password.");
        passwordInput.focus();
        return;
      }
      clearFieldError(emailInput);
      clearFieldError(passwordInput);

      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
      submitBtn.textContent = "Signing in…";

      try {
        // Same endpoint and payload as the standalone clinic login page.
        const { response, data: result } = await AppFeedback.request(
          "http://localhost:5000/api/v1/admin/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          },
        );

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Invalid credential validation response from server.",
          );
        }

        const user = result.user;
        const token = result.token;
        if (!user || !token) {
          throw new Error("Malformatted profile identity metadata structure received.");
        }

        // Role gate — patients authenticate through the client dashboard.
        const authorizedRoles = [
          "SUPER_ADMIN",
          "CLINIC_ADMIN",
          "CLINIC_STAFF",
          "DENTIST",
        ];
        if (!authorizedRoles.includes(user.role)) {
          throw new Error(
            "Access Denied: Patient credentials must authenticate using the client dashboard terminal.",
          );
        }

        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));

        if (remember && remember.checked) {
          localStorage.setItem(REMEMBER_KEY, email);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }

        showBanner(
          "✓ Session initialized successfully. Routing to administrative control platform...",
          "success",
        );
        setTimeout(() => {
          window.location.href = "adminClinicDashboard.html";
        }, 1200);
      } catch (err) {
        console.error("Clinic login request failed", err);
        showBanner(
          AppFeedback?.safeMessage(
            err,
            err.status ? { status: err.status } : null,
          ) || "We couldn't sign you in right now. Please try again.",
          "error",
        );
      } finally {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
        submitBtn.textContent = "Sign in";
      }
    });
  }

  // ---------------------------------------------------------------------
  // REGISTER — checkout-wizard flow (Clinic → Account → Docs → Plan & Pay)
  // ---------------------------------------------------------------------
  function formatSlug(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function setupRegister() {
    const form = document.getElementById("auth-register-form");
    if (!form) return;
    const nameInput = document.getElementById("auth-clinic-name");
    const slugInput = document.getElementById("auth-clinic-slug");
    const descriptionInput = document.getElementById("auth-clinic-description");
    const businessLicenseInput = document.getElementById("auth-business-license");
    const medicalLicenseInput = document.getElementById("auth-medical-license");
    const confirmPasswordInput = document.getElementById("auth-admin-confirm-password");
    const summary = document.getElementById("auth-register-summary");
    const submitLabel = form.querySelector(".submit-label");
    const spinner = form.querySelector(".button-spinner");
    const descriptionCount = document.getElementById("auth-clinic-description-count");

    // ---- Checkout wizard state ----
    let authStep = 1;
    const authSteps = Array.from(form.querySelectorAll(".auth-step"));
    const authDots = Array.from(document.querySelectorAll("#auth-stepper .step"));
    const authProgress = document.getElementById("auth-progress");
    const authBack = document.getElementById("auth-back");
    const authNext = document.getElementById("auth-next");
    const authPay = document.getElementById("auth-pay");
    const paintAuthStep = () => {
      authSteps.forEach((s) => { s.hidden = Number(s.dataset.step) !== authStep; });
      authDots.forEach((d) => {
        const n = Number(d.dataset.goto);
        d.classList.toggle("active", n === authStep);
        d.classList.toggle("done", n < authStep);
        const dot = d.querySelector(".step-dot");
        if (dot) dot.textContent = n < authStep ? "✓" : String(n);
      });
      if (authProgress) authProgress.style.width = `${(authStep / 4) * 100}%`;
      if (authBack) authBack.style.visibility = authStep === 1 ? "hidden" : "visible";
      const last = authStep === 4;
      if (authNext) authNext.hidden = last;
      if (authPay) authPay.hidden = !last;
    };
    const gotoAuthStep = (n) => {
      if (n < authStep || validateAuthStep(authStep)) {
        authStep = Math.min(Math.max(n, 1), 4);
        if (summary) summary.className = "banner hidden";
        paintAuthStep();
      }
    };
    authDots.forEach((d) => d.addEventListener("click", () => gotoAuthStep(Number(d.dataset.goto))));
    authBack?.addEventListener("click", () => gotoAuthStep(authStep - 1));
    authNext?.addEventListener("click", () => gotoAuthStep(authStep + 1));
    paintAuthStep();
    window.__authResetStep = () => { authStep = 1; paintAuthStep(); };

    // Subscription plan + simulated payment (cards, not dropdowns).
    const planSelect = document.getElementById("auth-plan");
    const cycleSelect = document.getElementById("auth-cycle");
    const cardSelect = document.getElementById("auth-testcard");
    const planCards = document.getElementById("auth-plan-cards");
    const cardList = document.getElementById("auth-card-list");
    const orderSummary = document.getElementById("auth-order-summary");
    const cyclePills = Array.from(document.querySelectorAll(".auth-cycle"));
    let billingMeta = null;
    let authMethodType = "card";
    const AUTH_TABS = (window.PaymongoCheckout
      ? window.PaymongoCheckout.METHOD_TABS
      : [
        { type: "card", label: "Card" },
        { type: "gcash", label: "GCash" },
        { type: "paymaya", label: "PayMaya" },
        { type: "grab_pay", label: "GrabPay" },
        { type: "bank", label: "Bank" },
      ]);
    const pesoFmt = (n, c = "PHP") => (c === "PHP" ? "₱" : "$") + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const currentPlan = () => {
      const plans = billingMeta?.plans || [];
      return plans.find((p) => p.key === "pro") || plans.find((p) => p.key === planSelect.value) || plans[0];
    };
    const currentAmount = () => { const p = currentPlan(); return p ? (cycleSelect.value === "yearly" ? p.prices.yearly : p.prices.monthly) : 0; };
    const yearlySave = () => { const p = currentPlan(); return p ? Math.max((p.prices.monthly * 12) - p.prices.yearly, 0) : 0; };
    const methodTitle = (m) => {
      if (window.PaymongoCheckout) return window.PaymongoCheckout.methodTitle(m);
      if (m.type === "gcash") return `GCash •••• ${m.last4}`;
      if (m.type === "paymaya") return `PayMaya •••• ${m.last4}`;
      if (m.type === "grab_pay") return `GrabPay •••• ${m.last4}`;
      if (m.type === "bank") return `${m.brand} •••• ${m.last4}`;
      return `${m.brand} •••• ${m.last4}`;
    };
    const paintPlanCards = () => {
      // Single fixed product.
      if (!billingMeta || !planCards) return;
      const p = currentPlan(); if (!p) return;
      planSelect.value = p.key;
      const amt = cycleSelect.value === "yearly" ? p.prices.yearly : p.prices.monthly;
      planCards.innerHTML = "";
      const b = document.createElement("div");
      b.className = "plan-card active";
      const save = cycleSelect.value === "yearly" && yearlySave() > 0 ? ` · save ${pesoFmt(yearlySave(), p.currency)}` : "";
      b.innerHTML = `<div class="plan-name"></div><div class="plan-price">${pesoFmt(amt, p.currency)}</div><div class="plan-meta">Professional · per ${cycleSelect.value === "yearly" ? "year" : "month"}${save}${p.trialDays ? ` · ${p.trialDays}-day trial` : ""}</div>`;
      b.querySelector(".plan-name").textContent = `${p.name} — fixed plan`;
      planCards.appendChild(b);
    };
    const paintCardList = () => {
      if (!billingMeta || !cardList) return;
      const methods = billingMeta.testPaymentMethods;
      const visible = methods.filter((m) => (m.type || "card") === authMethodType);
      if (!visible.some((m) => m.token === cardSelect.value) && visible.length) cardSelect.value = visible[0].token;
      if (window.PaymongoCheckout) {
        window.PaymongoCheckout.renderShell(cardList, {
          methods,
          activeType: authMethodType,
          activeToken: cardSelect.value,
          plan: null,
          cycle: cycleSelect.value,
          onType: (t) => { authMethodType = t; paintCardList(); },
          onToken: (tok) => { cardSelect.value = tok; paintCardList(); },
        });
        return;
      }
      cardList.innerHTML = "";
      const tabs = document.createElement("div");
      tabs.style.cssText = "display:flex;gap:.4rem;margin-bottom:.6rem;flex-wrap:wrap";
      AUTH_TABS.forEach((t) => {
        const has = methods.some((m) => (m.type || "card") === t.type);
        if (!has) return;
        const tb = document.createElement("button");
        tb.type = "button";
        tb.className = `btn btn-secondary${authMethodType === t.type ? " active" : ""}`;
        tb.style.cssText = authMethodType === t.type ? "border-color:var(--accent)" : "";
        tb.textContent = t.label;
        tb.addEventListener("click", () => { authMethodType = t.type; paintCardList(); });
        tabs.appendChild(tb);
      });
      cardList.appendChild(tabs);
      visible.forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `card-option${cardSelect.value === m.token ? " active" : ""}`;
        b.innerHTML = `<span class="card-chip"></span><span class="card-main"><span class="card-num"></span><br><span class="card-sub"></span></span>`;
        b.querySelector(".card-chip").textContent = (m.provider || m.brand).slice(0, 4).toUpperCase();
        b.querySelector(".card-num").textContent = methodTitle(m);
        const sub = b.querySelector(".card-sub"); sub.textContent = m.label;
        sub.style.color = /decline|insufficient|expired|error/i.test(m.label) ? "var(--amber)" : "var(--accent-2)";
        b.addEventListener("click", () => { cardSelect.value = m.token; paintCardList(); });
        cardList.appendChild(b);
      });
    };
    const paintOrder = () => {
      if (!orderSummary || !currentPlan()) return;
      const p = currentPlan();
      const save = cycleSelect.value === "yearly" && yearlySave() > 0 ? ` (save ${pesoFmt(yearlySave(), p.currency)})` : "";
      orderSummary.innerHTML = `<div style="display:flex;justify-content:space-between"><span></span><strong></strong></div><div style="display:flex;justify-content:space-between;color:var(--text-3)"><span>Total due today</span><strong class="total"></strong></div>`;
      orderSummary.querySelector("span").textContent = `${p.name} (${cycleSelect.value}${save})`;
      orderSummary.querySelector("strong").textContent = pesoFmt(currentAmount(), p.currency);
      orderSummary.querySelector(".total").textContent = pesoFmt(currentAmount(), p.currency);
    };
    const refreshPrice = () => { paintPlanCards(); paintOrder(); };
    (async () => {
      try {
        const out = await (await fetch("http://localhost:5000/api/v1/billing/meta")).json();
        billingMeta = out.data;
        const pro = billingMeta.plans.find((p) => p.key === "pro") || billingMeta.plans[0];
        if (planSelect) { planSelect.innerHTML = `<option value="${pro.key}">${pro.name}</option>`; planSelect.value = pro.key; }
        if (cardSelect) cardSelect.innerHTML = billingMeta.testPaymentMethods.map((m) => `<option value="${m.token}">${m.brand} •••• ${m.last4}</option>`).join("");
        const firstOk = billingMeta.testPaymentMethods.find((m) => /succeed/i.test(m.label)) || billingMeta.testPaymentMethods[0];
        if (firstOk) { cardSelect.value = firstOk.token; authMethodType = firstOk.type || "card"; }
        paintPlanCards(); paintCardList(); paintOrder();
      } catch {
        // Loud failure: an empty Plan & Pay step looks "unselectable". Show why.
        if (planCards) planCards.innerHTML = `<div class="banner banner-error block">Couldn't load plans. Is the backend running on http://localhost:5000? <button type="button" id="auth-retry-meta" class="switch-link">Retry</button></div>`;
        document.getElementById("auth-retry-meta")?.addEventListener("click", () => window.location.reload());
      }
    })();
    cyclePills.forEach((b) => b.addEventListener("click", () => {
      cycleSelect.value = b.dataset.cycle;
      cyclePills.forEach((x) => x.classList.toggle("active", x === b));
      paintPlanCards(); paintOrder();
    }));

    // Slug preview + password strength + file names
    const slugPreview = document.getElementById("auth-slug-preview");
    const pwInput = document.getElementById("auth-admin-password");
    const pwBar = document.getElementById("auth-pw-strength");
    const bizFile = document.getElementById("auth-business-license");
    const medFile = document.getElementById("auth-medical-license");
    const bizName = document.getElementById("auth-business-file-name");
    const medName = document.getElementById("auth-medical-file-name");
    const showFile = (input, el, fallback) => {
      const f = input?.files?.[0];
      if (el) el.textContent = f ? `✓ ${f.name}` : fallback;
    };
    bizFile?.addEventListener("change", () => showFile(bizFile, bizName, "Mayor's Permit, DTI/SEC, or equivalent."));
    medFile?.addEventListener("change", () => showFile(medFile, medName, "PRC / professional / facility license."));
    pwInput?.addEventListener("input", () => {
      const v = pwInput.value; let s = 0;
      if (v.length >= 8) s += 1; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s += 1;
      if (/\d/.test(v)) s += 1; if (/[^A-Za-z0-9]/.test(v)) s += 1;
      if (pwBar) pwBar.style.width = `${(Math.min(s, 4) / 4) * 100}%`;
    });

    const fields = Array.from(form.querySelectorAll("input:not([type='hidden'])"));
    if (descriptionInput) fields.push(descriptionInput);
    const updateDescriptionCount = () => {
      if (descriptionInput && descriptionCount) {
        descriptionCount.textContent = `${descriptionInput.value.length} / 600`;
      }
    };
    descriptionInput?.addEventListener("input", updateDescriptionCount);
    const setError = (field, message) => {
      if (!field) return;
      const error = document.getElementById(`${field.id}-error`);
      if (message) {
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", error.id);
        error.textContent = message;
        error.hidden = false;
      } else {
        field.removeAttribute("aria-invalid");
        if (error) {
          error.textContent = "";
          error.hidden = true;
        }
      }
    };

    const validateField = (field) => {
      if (!field) return true;
      let message = "";
      if (!field.value.trim() && field.required && field.type !== "file") {
        message = "This field is required.";
      } else if (field.type === "email" && field.value && !field.checkValidity()) {
        message = "Enter a valid email address.";
      } else if (field.type === "tel" && field.value && !field.checkValidity()) {
        message = "Enter a valid phone number.";
      } else if (field.id === "auth-admin-password" && field.value.length < 8) {
        message = "Use at least 8 characters.";
      } else if (field === confirmPasswordInput && field.value !== document.getElementById("auth-admin-password").value) {
        message = "Passwords do not match.";
      } else if (field.type === "file" && field.required && !field.files?.length) {
        message = "Choose a file to continue.";
      }
      setError(field, message);
      return !message;
    };

    // Live auto-generated slug from the clinic name.
    if (nameInput && slugInput) {
      nameInput.addEventListener("input", (e) => {
        if (!slugInput.dataset.edited) {
          slugInput.value = formatSlug(e.target.value);
        }
        if (slugPreview) slugPreview.textContent = slugInput.value || formatSlug(e.target.value) || "your-clinic";
      });
      slugInput.addEventListener("input", (e) => {
        slugInput.dataset.edited = "true";
        e.target.value = formatSlug(e.target.value);
      });
    }

    // Per-step validation for the wizard (mirrors the standalone portal).
    function validateAuthStep(n) {
      const stepIds = {
        1: ["auth-clinic-name", "auth-clinic-address"],
        2: ["auth-admin-firstname", "auth-admin-lastname", "auth-admin-email", "auth-admin-phone", "auth-admin-password", "auth-admin-confirm-password"],
        3: ["auth-business-license", "auth-medical-license"],
        4: [],
      };
      let ok = true;
      for (const id of stepIds[n] || []) {
        const f = document.getElementById(id);
        if (f && !validateField(f)) ok = false;
      }
      if (!ok && summary) {
        summary.textContent = n === 3
          ? "Both licenses are required — upload Business + Medical license."
          : "Please complete the highlighted fields to continue.";
        summary.className = "banner banner-error block";
      } else if (summary) {
        summary.className = "banner hidden";
      }
      return ok;
    }

    form.addEventListener("input", (e) => {
      if (e.target.matches("input")) {
        clearFieldError(e.target);
        validateField(e.target);
      }
    });

    form.addEventListener("blur", (e) => {
      if (e.target.matches("input")) validateField(e.target);
    }, true);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideBanner();

      const submitBtn = form.querySelector("button[type='submit']");

      const valid = fields.every(validateField);
      if (!valid) {
        if (summary) {
          summary.textContent = "Check the highlighted fields and try again.";
          summary.className = "banner banner-error block";
        }
        form.querySelector("[aria-invalid='true']")?.focus();
        return;
      }
      if (summary) summary.className = "banner hidden";

      // Step 0: both approval documents are mandatory.
      const requiredDocuments = [businessLicenseInput, medicalLicenseInput];
      if (requiredDocuments.some((input) => !input?.files?.length)) {
        showBanner(
          "Business License and Medical License documents are both required for approval.",
          "error",
        );
        return;
      }

      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
      if (submitLabel) submitLabel.textContent = "Processing payment…";
      if (spinner) spinner.hidden = false;

      const payload = {
      clinicName: nameInput.value.trim(),
      // Keep the slug as an internal routing key for existing public URLs.
      slug: slugInput.value.trim() || formatSlug(nameInput.value),
      address: document.getElementById("auth-clinic-address").value.trim(),
      description: descriptionInput?.value.trim() || "",
      // Subscription + simulated payment (charged before the account is created).
      planKey: planSelect?.value || "",
      billingCycle: cycleSelect?.value || "monthly",
      testToken: cardSelect?.value || "",
          adminData: {
          firstName: document.getElementById("auth-admin-firstname").value.trim(),
          lastName: document.getElementById("auth-admin-lastname").value.trim(),
          email: document.getElementById("auth-admin-email").value.trim(),
          contactNumber: document.getElementById("auth-admin-phone").value.trim(),
          password: document.getElementById("auth-admin-password").value,
        },
      };

      try {
        // Keep the chosen approval documents for upload AFTER verification.
        pendingDocs = {
          business: businessLicenseInput.files[0],
          medical: medicalLicenseInput.files[0],
        };

        // STEP 1: Start registration — the server emails a verification code.
        // The clinic + admin are only created once the code is verified.
        const initiateResponse = await fetch(
          "http://localhost:5000/api/v1/tenants/register/initiate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const initiateResult = await initiateResponse.json().catch(() => ({}));

        if (!initiateResponse.ok || !initiateResult.success) {
          // 409 (paid pending exists) / 502 (paid but email failed): recover by
          // jumping to the verify step instead of charging again.
          const existingId = initiateResult?.data?.pendingId;
          if (existingId && (initiateResponse.status === 409 || initiateResponse.status === 502)) {
            pendingId = existingId;
            pendingEmail = initiateResult.data.email || payload.adminData.email;
            pendingDocs = {
              business: businessLicenseInput.files[0],
              medical: medicalLicenseInput.files[0],
            };
            showVerifyView(initiateResult.data, initiateResult.message);
            return;
          }
          throw new Error(
            initiateResult.message || "Failed to start registration.",
          );
        }

        pendingId = initiateResult.data.pendingId;
        pendingEmail = initiateResult.data.email;
        showVerifyView(initiateResult.data, initiateResult.message);
      } catch (error) {
        console.error("Registration Error:", error);
        showBanner(
          error.message || "An error occurred during registration.",
          "error",
        );
      } finally {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
        if (submitLabel) submitLabel.textContent = "Register clinic";
        if (spinner) spinner.hidden = true;
      }
    });
  }

  // ---------------------------------------------------------------------
  // VERIFY — enter the emailed code, then create the clinic + upload docs
  // ---------------------------------------------------------------------
  function setupVerify() {
    const view = document.getElementById("auth-verify-view");
    if (!view) return;
    const codeInput = document.getElementById("auth-verify-code");
    const submitBtn = document.getElementById("auth-verify-submit");
    const resendBtn = document.getElementById("auth-verify-resend");
    const restartBtn = document.getElementById("auth-verify-restart");
    const meta = document.getElementById("auth-verify-meta");
    const bannerEl = document.getElementById("auth-verify-banner");
    const emailEl = document.getElementById("auth-verify-email");
    const codeError = document.getElementById("auth-verify-code-error");
    const submitLabel = submitBtn?.querySelector(".submit-label");
    const spinner = submitBtn?.querySelector(".button-spinner");
    let resendTimer = null;

    const setVerifyBanner = (msg, type) => {
      if (!bannerEl) return;
      const cls = type === "error" ? "banner-error" : type === "warn" ? "banner-warn" : "banner-success";
      bannerEl.className = `banner ${cls} block`;
      bannerEl.textContent = msg;
    };
    const hideVerifyBanner = () => {
      if (bannerEl) {
        bannerEl.className = "banner hidden";
        bannerEl.textContent = "";
      }
    };
    const setMeta = (d = {}) => {
      if (!meta) return;
      const parts = [];
      if (d.expiresInSeconds != null)
        parts.push(`Code expires in ~${Math.max(Math.ceil(d.expiresInSeconds / 60), 1)} min`);
      if (d.attemptsRemaining != null)
        parts.push(`${d.attemptsRemaining} attempt${d.attemptsRemaining === 1 ? "" : "s"} left`);
      meta.textContent = parts.join(" · ");
    };
    const cooldown = (seconds) => {
      clearInterval(resendTimer);
      let remaining = Math.max(Number(seconds) || 0, 0);
      if (!resendBtn) return;
      const tick = () => {
        if (remaining <= 0) {
          clearInterval(resendTimer);
          resendBtn.disabled = false;
          resendBtn.textContent = "Resend code";
          return;
        }
        resendBtn.disabled = true;
        resendBtn.textContent = `Resend in ${remaining}s`;
        remaining -= 1;
      };
      tick();
      resendTimer = setInterval(tick, 1000);
    };

    const otpBoxes = Array.from(document.querySelectorAll("#auth-otp-boxes .otp"));
    const paidBadge = document.getElementById("auth-paid-badge");
    const otpValue = () => otpBoxes.map((b) => b.value).join("");
    const syncCode = () => { if (codeInput) codeInput.value = otpValue(); };
    otpBoxes.forEach((box, i) => {
      box.addEventListener("input", () => {
        box.value = box.value.replace(/\D/g, "").slice(0, 1);
        syncCode();
        if (codeError) codeError.hidden = true;
        if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
        if (otpValue().length === 6) submitBtn?.click();
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && i > 0) otpBoxes[i - 1].focus();
        if (e.key === "Enter") { e.preventDefault(); submitBtn?.click(); }
      });
      box.addEventListener("paste", (e) => {
        e.preventDefault();
        const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
        t.split("").forEach((ch, j) => { if (otpBoxes[i + j]) otpBoxes[i + j].value = ch; });
        syncCode();
        otpBoxes[Math.min(i + t.length, 5)]?.focus();
        if (otpValue().length === 6) submitBtn?.click();
      });
    });

    // Exposed to the register submit handler.
    showVerifyView = (data, message) => {
      if (emailEl) emailEl.textContent = pendingEmail;
      hideVerifyBanner();
      if (message) setVerifyBanner(message, "success");
      if (paidBadge && data?.plan) {
        paidBadge.hidden = false;
        paidBadge.textContent = `✅ Paid for ${data.plan.name} (${data.plan.billingCycle}) · Ref ${data.paymentRef || ""}`;
      }
      setMeta(data);
      otpBoxes.forEach((b) => (b.value = ""));
      syncCode();
      switchView("verify");
      cooldown((data && data.resendCooldownSeconds) || 60);
      setTimeout(() => otpBoxes[0]?.focus(), 60);
    };

    submitBtn?.addEventListener("click", async () => {
      hideVerifyBanner();
      const code = (codeInput?.value || "").trim();
      if (!/^\d{6}$/.test(code)) {
        if (codeError) {
          codeError.textContent = "Enter the 6-digit code from your email.";
          codeError.hidden = false;
        }
        return;
      }
      if (!pendingId) {
        setVerifyBanner("Your session expired. Please start over.", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
      if (submitLabel) submitLabel.textContent = "Verifying…";
      if (spinner) spinner.hidden = false;

      try {
        const res = await fetch("http://localhost:5000/api/v1/tenants/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingId, code }),
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          if (result?.data?.attemptsRemaining != null)
            setMeta({ attemptsRemaining: result.data.attemptsRemaining });
          throw new Error(result.message || "Verification failed.");
        }

        const clinicId = result.data?._id || result.data?.clinic?._id;
        if (!clinicId) throw new Error("Verified, but the clinic ID could not be resolved.");
        if (!pendingDocs.business || !pendingDocs.medical)
          throw new Error(`Verified (clinic ID ${clinicId}), but the license files were lost. Sign in and resubmit both documents from your dashboard.`);

        // Upload the two approval documents captured at registration time.
        if (submitLabel) submitLabel.textContent = "Uploading documents…";
        const fd = new FormData();
        fd.append("documents", pendingDocs.business);
        fd.append("documents", pendingDocs.medical);
        const up = await fetch(`http://localhost:5000/api/v1/tenants/${clinicId}/upload-docs`, {
          method: "POST",
          body: fd,
        });
        const upResult = await up.json().catch(() => ({}));
        if (!up.ok || !upResult.success)
          throw new Error(`${upResult.message || "Document upload failed."} Your workspace was created (clinic ID ${clinicId}) — sign in and resubmit both documents.`);

        clearInterval(resendTimer);
        const successEmail = document.getElementById("auth-register-success-email");
        if (successEmail) {
          const subActive = result.data?.subscription?.status === "active";
          const warn = result.data?.activationWarning || (!subActive ? "Subscription activation needs attention — contact support with your payment reference. Do NOT pay again." : "");
          successEmail.textContent = `We'll send updates to ${pendingEmail}.${warn ? ` ${warn}` : ""}`;
        }
        const registerForm = document.getElementById("auth-register-form");
        registerForm?.reset();
        const slugInput = document.getElementById("auth-clinic-slug");
        if (slugInput) delete slugInput.dataset.edited;
        pendingId = null;
        pendingDocs = { business: null, medical: null };
        switchView("register-success");
        focusFirstInView();
      } catch (err) {
        setVerifyBanner(err.message || "Verification failed.", "error");
        otpBoxes.forEach((b) => (b.value = ""));
        syncCode();
        otpBoxes[0]?.focus();
      } finally {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
        if (submitLabel) submitLabel.textContent = "Verify & create workspace";
        if (spinner) spinner.hidden = true;
      }
    });

    resendBtn?.addEventListener("click", async () => {
      if (resendBtn.disabled || !pendingId) return;
      hideVerifyBanner();
      resendBtn.disabled = true;
      try {
        const res = await fetch("http://localhost:5000/api/v1/tenants/register/resend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingId }),
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
          if (result.retryAfterSeconds) cooldown(result.retryAfterSeconds);
          else resendBtn.disabled = false;
          throw new Error(result.message || "Could not resend the code.");
        }
        setVerifyBanner(result.message, "success");
        setMeta(result.data);
        otpBoxes.forEach((b) => (b.value = ""));
        syncCode();
        otpBoxes[0]?.focus();
        cooldown((result.data && result.data.resendCooldownSeconds) || 60);
      } catch (err) {
        setVerifyBanner(err.message || "Could not resend the code.", "error");
      }
    });

    restartBtn?.addEventListener("click", () => {
      clearInterval(resendTimer);
      pendingId = null;
      switchView("register");
      window.__authResetStep?.();
    });
  }

  // ---------------------------------------------------------------------
  // Wire up triggers, switches, close actions, keyboard + focus trap
  // ---------------------------------------------------------------------
  function bind() {
    modal = document.getElementById("auth-modal");
    if (!modal) return;
    panel = modal.querySelector(".modal-panel");
    banner = document.getElementById("auth-banner");

    setupPasswordToggles();
    setupLogin();
    setupRegister();
    setupVerify();

    // Any [data-auth="login"|"register"] opens the dialog.
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-auth]");
      if (!trigger) return;
      e.preventDefault();
      lastTrigger = trigger;
      openModal(trigger.dataset.auth);
    });

    // In-dialog switches (login ↔ register ↔ forgot).
    modal.addEventListener("click", (e) => {
      const switcher = e.target.closest("[data-auth-switch]");
      if (switcher) {
        e.preventDefault();
        switchView(switcher.dataset.authSwitch);
        focusFirstInView();
        return;
      }
      // Backdrop or close button.
      if (e.target.closest("[data-auth-close]")) {
        closeModal();
      }
    });

    // Escape closes the dialog.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) {
        closeModal();
      }
    });

    // Focus trap: Tab / Shift+Tab cycle inside the visible view.
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = focusableElements();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // QA/demo hook: ?auth=login or ?auth=register auto-opens the dialog.
    const authParam = new URLSearchParams(window.location.search).get("auth");
    if (authParam === "login" || authParam === "register") {
      openModal(authParam);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
