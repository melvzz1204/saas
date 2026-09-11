// src/components/paymongoCheckout.js
// Shared PayMongo-style checkout skin (TESTING MODE ONLY — pure mock).
// Used by: index registration modal (auth modal),
// and the clinic dashboard payment-method card.
// Classic script → exposes window.PaymongoCheckout. No dependencies; injects
// its own <style> once so it renders identically on Tailwind pages and the
// landing design-system pages.
//
// Contract with callers (unchanged backend payload):
//   - hidden selects stay the source of truth: planSelect (="pro"),
//     cardSelect (testToken), cycleSelect (monthly|yearly).
//   - component only READS billingMeta (/billing/meta) and WRITES those selects.
(function () {
  "use strict";

  const METHOD_TABS = [
    { type: "card", label: "Card", icon: "💳" },
    { type: "gcash", label: "GCash", icon: "G" },
    { type: "paymaya", label: "PayMaya", icon: "M" },
    { type: "grab_pay", label: "GrabPay", icon: "G" },
    { type: "bank", label: "Bank", icon: "🏦" },
  ];

  const TYPE_BADGE = {
    card: "background:#1e293b",
    gcash: "background:#007dff",
    paymaya: "background:#5b2d82",
    grab_pay: "background:#00b14f",
    bank: "background:#0f766e",
  };

  function methodTitle(m) {
    if (!m) return "—";
    if (m.type === "gcash") return `GCash •••• ${m.last4}`;
    if (m.type === "paymaya") return `PayMaya •••• ${m.last4}`;
    if (m.type === "grab_pay") return `GrabPay •••• ${m.last4}`;
    if (m.type === "bank") return `${m.brand} •••• ${m.last4}`;
    return `${m.brand} •••• ${m.last4}`;
  }

  // Disabled mock fields shown per method, PayMongo-checkout style.
  function mockFieldsHint(m) {
    if (!m) return "";
    if (m.type === "card") return "4242 4242 4242 4242 · 12/30 · 123";
    if (m.type === "gcash" || m.type === "paymaya" || m.type === "grab_pay") return "09XX XXX XXXX · OTP auto-approved (test)";
    if (m.type === "bank") return "Online banking · account ••••" + m.last4;
    return "";
  }

  function isFail(m) {
    return /decline|insufficient|expired|error/i.test(m.label || "");
  }

  function ensureStyles() {
    if (document.getElementById("pm-checkout-styles")) return;
    const st = document.createElement("style");
    st.id = "pm-checkout-styles";
    st.textContent = `
      .pm-shell{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff}
      .pm-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.6rem .8rem;background:#0f172a;color:#fff;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
      .pm-head .pm-test{background:#f59e0b;color:#0f172a;border-radius:999px;padding:1px 8px;font-size:10px}
      .pm-tabs{display:flex;gap:.4rem;padding:.6rem .8rem 0;flex-wrap:wrap}
      .pm-tab{flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:.5rem .25rem;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:11px;font-weight:800;color:#64748b;cursor:pointer}
      .pm-tab .pm-ico{width:26px;height:18px;border-radius:4px;color:#fff;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center}
      .pm-tab.active{border-color:#2563eb;background:#eff6ff;color:#1e3a8a;box-shadow:0 0 0 2px rgba(37,99,235,.15)}
      .pm-methods{padding:.6rem .8rem;display:grid;gap:.45rem}
      .pm-method{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;border:1px solid #e2e8f0;border-radius:10px;padding:.55rem .7rem;background:#fff;cursor:pointer}
      .pm-method:hover{border-color:#94a3b8}
      .pm-method.active{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 2px rgba(37,99,235,.12)}
      .pm-method .pm-num{font-size:12px;font-weight:800;color:#0f172a}
      .pm-method .pm-sub{font-size:10px}
      .pm-method .pm-hint{font-size:10px;color:#94a3b8;font-family:monospace}
      .pm-method .pm-dot{margin-left:auto;width:14px;height:14px;border-radius:999px;border:2px solid #cbd5e1;flex:0 0 auto}
      .pm-method.active .pm-dot{border-color:#2563eb;background:#2563eb}
      .pm-summary{margin:0 .8rem .8rem;border:1px dashed #cbd5e1;border-radius:10px;padding:.6rem .75rem;font-size:12px;color:#334155;display:grid;gap:.2rem;background:#f8fafc}
      .pm-summary .pm-total{display:flex;justify-content:space-between;font-weight:900;color:#0f172a}
      .pm-foot{padding:0 .8rem .7rem;font-size:10px;color:#94a3b8;text-align:center}
    `;
    document.head.appendChild(st);
  }

  // Render the full PayMongo shell into `mount`.
  // opts: { methods, activeType, activeToken, plan, cycle, onType(type), onToken(token) }
  function renderShell(mount, opts) {
    ensureStyles();
    const { methods, activeType, activeToken, plan, cycle } = opts;
    mount.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "pm-shell";

    const head = document.createElement("div");
    head.className = "pm-head";
    const brand = document.createElement("span");
    brand.textContent = "Pay with PayMongo";
    const test = document.createElement("span");
    test.className = "pm-test";
    test.textContent = "TEST MODE";
    head.append(brand, test);
    shell.appendChild(head);

    const tabs = document.createElement("div");
    tabs.className = "pm-tabs";
    tabs.setAttribute("role", "tablist");
    METHOD_TABS.forEach((t) => {
      const has = methods.some((m) => (m.type || "card") === t.type);
      if (!has) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pm-tab" + (activeType === t.type ? " active" : "");
      b.setAttribute("role", "tab");
      const ico = document.createElement("span");
      ico.className = "pm-ico";
      ico.style.cssText = TYPE_BADGE[t.type] || TYPE_BADGE.card;
      ico.textContent = t.icon;
      const lbl = document.createElement("span");
      lbl.textContent = t.label;
      b.append(ico, lbl);
      b.addEventListener("click", () => opts.onType(t.type));
      tabs.appendChild(b);
    });
    shell.appendChild(tabs);

    const list = document.createElement("div");
    list.className = "pm-methods";
    methods
      .filter((m) => (m.type || "card") === activeType)
      .forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pm-method" + (activeToken === m.token ? " active" : "");
        const left = document.createElement("span");
        left.style.cssText = "flex:1;min-width:0";
        const num = document.createElement("span");
        num.className = "pm-num";
        num.textContent = methodTitle(m);
        const sub = document.createElement("span");
        sub.className = "pm-sub";
        sub.style.color = isFail(m) ? "#b45309" : "#047857";
        sub.textContent = m.label;
        const hint = document.createElement("span");
        hint.className = "pm-hint";
        hint.textContent = mockFieldsHint(m);
        left.append(num, document.createElement("br"), sub, document.createElement("br"), hint);
        const dot = document.createElement("span");
        dot.className = "pm-dot";
        b.append(left, dot);
        b.addEventListener("click", () => opts.onToken(m.token));
        list.appendChild(b);
      });
    shell.appendChild(list);

    if (plan) {
      const amt = cycle === "yearly" ? plan.prices.yearly : plan.prices.monthly;
      const save = cycle === "yearly" ? Math.max(plan.prices.monthly * 12 - plan.prices.yearly, 0) : 0;
      const sym = plan.currency === "PHP" ? "₱" : "$";
      const fmt = (n) => sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sum = document.createElement("div");
      sum.className = "pm-summary";
      sum.innerHTML =
        `<div style="display:flex;justify-content:space-between"><span>${plan.name} (${cycle})</span><strong>${fmt(amt)}</strong></div>` +
        `<div style="display:flex;justify-content:space-between;color:#64748b"><span>${plan.trialDays ? plan.trialDays + "-day trial included" : ""}</span><span>per ${cycle === "yearly" ? "year" : "month"}</span></div>` +
        (save ? `<div class="pm-total"><span>You save</span><span>${fmt(save)}</span></div>` : "") +
        `<div class="pm-total"><span>Total due today</span><span class="pm-due">${fmt(amt)}</span></div>`;
      shell.appendChild(sum);
    }

    const foot = document.createElement("div");
    foot.className = "pm-foot";
    foot.textContent = "Secured by PayMongo (SIMULATED) — no real money moves. Test methods only.";
    shell.appendChild(foot);

    mount.appendChild(shell);
  }

  window.PaymongoCheckout = {
    METHOD_TABS,
    methodTitle,
    mockFieldsHint,
    renderShell,
  };
})();
