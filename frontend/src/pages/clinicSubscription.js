// src/pages/clinicSubscription.js
// "My Subscription" panel inside the clinic admin dashboard (classic script,
// shares the dashboard's Tailwind + DashboardUI globals).
// Clinic admins can SEE: current plan, renewal countdown, payment method,
// auto-renew state, invoices, and billing notices. They can APPLY: pay an open
// invoice, cancel, switch cycle, update the (simulated) test card,
// toggle auto-renew, and mark notices as read.
(function () {
  "use strict";

  const API = window.apiUrl("/api/v1/billing");
  const getToken = () => localStorage.getItem("token");
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });

  const DAY_MS = 86400000;
  const peso = (n, c = "PHP") => (n == null ? "—" : (c === "PHP" ? "₱" : "$") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtDate = (d) => {
    if (d == null) return "—";
    const date = new Date(d);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const toast = (msg, type) => (window.DashboardUI ? window.DashboardUI.toast(msg, type) : alert(msg));

  const STATUS_PILL = {
    active: "bg-emerald-100 text-emerald-700", trialing: "bg-sky-100 text-sky-700",
    pending: "bg-slate-100 text-slate-500", past_due: "bg-amber-100 text-amber-700",
    payment_failed: "bg-rose-100 text-rose-700", unpaid: "bg-rose-100 text-rose-700",
    paused: "bg-violet-100 text-violet-700", canceled: "bg-slate-200 text-slate-500",
    expired: "bg-slate-200 text-slate-500",
  };
  const INV_PILL = {
    paid: "bg-emerald-100 text-emerald-700", open: "bg-amber-100 text-amber-700",
    refunded: "bg-slate-200 text-slate-500", partially_refunded: "bg-sky-100 text-sky-700",
    void: "bg-slate-200 text-slate-400", uncollectible: "bg-rose-100 text-rose-700",
    draft: "bg-slate-100 text-slate-400",
  };

  let meta = null;
  let current = null; // { subscription, invoices, notifications, paymentMethod }
  let loading = false;
  // Offset between server simulation clock and local clock (ms).
  let serverOffsetMs = 0;

  const $ = (id) => document.getElementById(id);

  async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { headers: headers(), ...opts });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.success === false) {
      const error = new Error(out.message || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return out;
  }

  const methodTitle = (m) => {
    if (window.PaymongoCheckout) return window.PaymongoCheckout.methodTitle(m);
    if (m.type === "gcash") return `GCash •••• ${m.last4}`;
    if (m.type === "paymaya") return `PayMaya •••• ${m.last4}`;
    if (m.type === "grab_pay") return `GrabPay •••• ${m.last4}`;
    if (m.type === "bank") return `${m.brand} •••• ${m.last4}`;
    return `${m.brand} •••• ${m.last4}`;
  };
  async function ensureMeta() {
    if (meta) return meta;
    try {
      const res = await fetch(`${API}/meta`);
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.data) throw new Error(out.message || `Meta request failed (${res.status})`);
      meta = out.data;
    } catch (e) {
      console.error("Subscription meta load failed:", e);
      meta = { plans: [], testPaymentMethods: [] };
    }

    // Single fixed plan — no picker UI; meta is only used for pricing display.
    const cardSel = $("my-sub-card-select");
    if (cardSel && !cardSel.options.length) {
      const methods = Array.isArray(meta.testPaymentMethods) ? meta.testPaymentMethods : [];
      if (!methods.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No test methods available";
        cardSel.appendChild(option);
      }
      // Group test methods by type: Card | GCash | PayMaya | GrabPay | Bank.
      const groups = [["card", "Cards"], ["gcash", "GCash"], ["paymaya", "PayMaya"], ["grab_pay", "GrabPay"], ["bank", "Online banking"]];
      groups.forEach(([type, label]) => {
        const items = methods.filter((m) => (m.type || "card") === type);
        if (!items.length) return;
        const og = document.createElement("optgroup");
        og.label = label;
        items.forEach((m) => {
          const o = document.createElement("option");
          o.value = m.token;
          o.textContent = `${methodTitle(m)} — ${m.label}`;
          og.appendChild(o);
        });
        cardSel.appendChild(og);
      });
    }
    return meta;
  }

  function daysLeft(anchor) {
    if (!anchor) return null;
    const date = new Date(anchor);
    if (Number.isNaN(date.getTime())) return null;
    return Math.ceil((date.getTime() - (Date.now() + serverOffsetMs)) / DAY_MS);
  }

  function serverNowMs() {
    return Date.now() + serverOffsetMs;
  }

  function statusMessage(s, pm, openInv) {
    const anchor = s.nextRenewalDate || s.currentPeriodEnd || s.trialEndsAt;
    const amount = openInv?.amountDue ?? s.amount;
    const currency = openInv?.currency ?? s.currency;
    const method = pm ? methodTitle(pm) : "—";

    switch (s.status) {
      case "pending":
        return "Payment is processing — your plan activates shortly.";
      case "trialing":
        return `Free trial — no charge until ${fmtDate(s.trialEndsAt)}.`;
      case "active":
        return `All good. Next charge ${fmtDate(anchor)}: ${peso(s.amount, s.currency)} via ${method}.`;
      case "past_due":
      case "payment_failed":
      case "unpaid": {
        const failedDate = s.nextRenewalDate || s.currentPeriodEnd || s.trialEndsAt || openInv?.dueDate;
        return `Your ${fmtDate(failedDate)} payment failed. Pay ${peso(amount, currency)} to keep access.`;
      }
      case "paused":
        return "Billing is on hold. Resume anytime.";
      case "canceled":
      case "expired": {
        const endedAt = s.endedAt || s.currentPeriodEnd || s.nextRenewalDate || s.trialEndsAt;
        return `Subscription ended on ${fmtDate(endedAt)}.`;
      }
      default:
        return String(s.status || "").replace(/_/g, " ");
    }
  }

  function nextChargeLine(s, pm) {
    const anchor = s.nextRenewalDate || s.currentPeriodEnd || s.trialEndsAt;
    if (!anchor) return "—";
    return `${peso(s.amount, s.currency)} · ${fmtDate(anchor)} · ${pm ? methodTitle(pm) : "—"}`;
  }

  function renewalLabel(s, anchor) {
    if (s.status === "trialing" && s.trialEndsAt) return `Trial ends ${fmtDate(s.trialEndsAt)}`;
    if (s.cancelAtPeriodEnd) return `Ends ${fmtDate(anchor)}`;
    if (s.status === "canceled" || s.status === "expired") return `Ended ${fmtDate(s.endedAt || anchor)}`;
    return `Renews ${fmtDate(anchor)}`;
  }

  function currentFeaturePlan() {
    const plans = Array.isArray(meta?.plans) ? meta.plans : [];
    const activePlans = plans.filter((plan) => plan.isActive !== false);
    const s = current?.subscription;
    return s?.planKey
      ? activePlans.find((plan) => String(plan.key) === String(s.planKey)) || activePlans[0]
      : activePlans[0] || null;
  }

  function renderFeatures() {
    const box = $("my-sub-features");
    if (!box) return;
    box.replaceChildren();

    const plan = currentFeaturePlan();
    if (!plan) {
      const empty = document.createElement("p");
      empty.className = "px-6 py-4 text-xs text-slate-500";
      empty.textContent = meta ? "No active plans are available." : "Plan details unavailable. Check back later.";
      box.appendChild(empty);
      return;
    }

    const prices = plan.prices || {};
    const cycle = current?.subscription?.billingCycle === "yearly" ? "yearly" : "monthly";
    const features = Array.isArray(plan.features) ? plan.features.filter(Boolean) : [];
    if (!features.length) {
      const empty = document.createElement("p");
      empty.className = "px-6 py-4 text-xs text-slate-400";
      empty.textContent = "No features listed for this plan.";
      box.appendChild(empty);
    } else {
      features.forEach((feature) => {
        const item = document.createElement("div");
        item.className = "flex items-start gap-3 px-6 py-3.5 hover:bg-slate-50/60 transition-colors";
        const icon = document.createElement("div");
        icon.className = "mt-0.5 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0";
        icon.innerHTML = '<svg class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>';
        const text = document.createElement("span");
        text.className = "text-[13px] text-slate-600 font-medium";
        text.textContent = feature;
        item.append(icon, text);
        box.appendChild(item);
      });
    }
  }

  function cardExpiry(pm) {
    if (!pm || pm.type !== "card" || !pm.expMonth || !pm.expYear) return "—";
    return `${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}`;
  }

  function renderPaymentMethod(pm) {
    const current = $("my-sub-current-method");
    const expiry = $("my-sub-card-expiry");
    const warning = $("my-sub-card-warning");
    if (!current || !expiry || !warning) return;

    current.textContent = pm ? methodTitle(pm) : "—";
    expiry.textContent = `Expiry ${cardExpiry(pm)}`;
    warning.classList.add("hidden");
    warning.textContent = "";

    if (pm && pm.status === "expired") {
      warning.textContent = "Card expired — update it before your next payment.";
      warning.className = "text-xs font-semibold text-rose-700";
      warning.classList.remove("hidden");
      return;
    }
    if (!pm || pm.type !== "card") return;
    const expMonth = Number(pm.expMonth);
    const expYear = Number(pm.expYear);
    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear)) return;

    const expiryMs = new Date(expYear, expMonth, 1).getTime();
    const now = serverNowMs();
    if (pm.status === "expired" || expiryMs <= now) {
      warning.textContent = "Card expired — update it before your next payment.";
      warning.className = "text-xs font-semibold text-rose-700";
      warning.classList.remove("hidden");
    } else if (expiryMs - now <= 30 * DAY_MS) {
      warning.textContent = `Card expires in ${Math.ceil((expiryMs - now) / DAY_MS)} days — update it before your next payment.`;
      warning.className = "text-xs font-semibold text-amber-700";
      warning.classList.remove("hidden");
    }
  }

  // Navbar badge next to My Subscription. Priority: payment attention >
  // trial/renewal countdown > unread billing notices. Hidden when all clear.
  let lastBadgeState = { status: "", days: null };
  function setBadge(status, days, unread) {
    lastBadgeState = { status, days };
    const badge = $("nav-subscription-badge");
    if (!badge) return;
    const issues = ["past_due", "payment_failed", "unpaid"].includes(status);
    const urgent = issues || (days != null && days <= 7 && ["active", "trialing"].includes(status));
    const newCount = Math.max(0, Number(unread) || 0);
    let label = issues ? "Attention"
      : days != null && days <= 7 && status === "trialing" ? "Trial ending"
      : days != null && days <= 7 ? `${days}d left` : "";
    let tone = urgent ? "bg-amber-500 text-slate-950" : "bg-slate-200 text-slate-600";
    if (!label && newCount > 0) {
      label = `${newCount} new`;
      tone = "bg-indigo-600 text-white";
    }
    badge.classList.toggle("hidden", !label);
    if (!label) {
      badge.removeAttribute("aria-label");
      return;
    }
    badge.textContent = label;
    badge.className = `text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${tone}`;
    badge.setAttribute("aria-label", `Subscription: ${label}${newCount > 0 ? `, ${newCount} unread billing notices` : ""}`);
  }
  function refreshBadge() {
    setBadge(lastBadgeState.status, lastBadgeState.days, current?.unread);
  }

  function alertCard(kind, title, body, actionLabel, onAction) {
    const wrap = $("sub-alert-slot");
    if (!wrap) return;
    wrap.replaceChildren();
    if (!kind) return;
    const tones = {
      danger: "bg-rose-50 border-rose-200 text-rose-800",
      warn: "bg-amber-50 border-amber-200 text-amber-800",
      info: "bg-sky-50 border-sky-200 text-sky-800",
    };
    const box = document.createElement("div");
    box.className = `rounded-xl border px-4 py-3.5 flex flex-wrap items-center gap-3 ${tones[kind]}`;
    box.setAttribute("role", "status");
    const txt = document.createElement("div");
    txt.className = "flex-1 min-w-[200px]";
    const t = document.createElement("p");
    t.className = "text-xs font-black uppercase tracking-wider";
    t.textContent = title;
    const b = document.createElement("p");
    b.className = "text-xs mt-0.5";
    b.textContent = body;
    txt.append(t, b);
    box.appendChild(txt);
    if (actionLabel && onAction) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer";
      btn.textContent = actionLabel;
      btn.addEventListener("click", onAction);
      box.appendChild(btn);
    }
    wrap.appendChild(box);
  }

  // Subscribe cycle for the empty state (single fixed plan).
  let subCycle = "monthly";

  function render() {
    const s = current?.subscription;
    const pm = current?.paymentMethod;
    if (!s) {
      $("my-sub-plan-name").textContent = "No active subscription";
      $("my-sub-price").textContent = "One fixed plan for every clinic.";
      const pill = $("my-sub-status");
      pill.textContent = "none";
      pill.className = "text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-500";
      renderSubscribeForm();
      $("my-sub-next-charge").textContent = "—";
      $("my-sub-renewal").textContent = "—";
      $("my-sub-method").textContent = "—";
      const ar = $("my-sub-autorenew");
      if (ar) { ar.checked = false; ar.disabled = true; }
      const arLabel = $("my-sub-autorenew-label");
      if (arLabel) arLabel.textContent = "—";
      alertCard("info", "No active subscription", "Choose a test payment method and subscribe to get started.", null, null);
      setBadge("", null, current?.unread);
      renderFeatures();
      renderPaymentMethod(null);
      renderInvoices();
      renderNotifs();
      return;
    }

    $("my-sub-plan-name").textContent = `${s.planName} · ${s.billingCycle}`;
    $("my-sub-price").textContent = `${peso(s.amount, s.currency)} per ${s.billingCycle === "yearly" ? "year" : "month"}`;
    const pill = $("my-sub-status");
    pill.textContent = s.status.replace(/_/g, " ");
    pill.className = `text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_PILL[s.status] || "bg-slate-100 text-slate-500"}`;

    const anchor = s.nextRenewalDate || s.currentPeriodEnd || s.trialEndsAt;
    const days = daysLeft(anchor);
    $("my-sub-next-charge").textContent = nextChargeLine(s, pm);
    $("my-sub-renewal").textContent = renewalLabel(s, anchor);
    $("my-sub-method").textContent = pm ? methodTitle(pm) : "—";
    const ar = $("my-sub-autorenew");
    if (ar) {
      ar.disabled = false;
      ar.checked = !!s.autoRenew;
      ar.onchange = toggleAutoRenew;
    }
    const arLabel = $("my-sub-autorenew-label");
    if (arLabel) arLabel.textContent = s.autoRenew ? "On" : "Off";

    setBadge(s.status, days, current?.unread);
    renderFeatures();
    renderPaymentMethod(pm);

    // Priority alert
    const openInv = (current.invoices || []).find((i) => i.status === "open");
    const status = s.status || "unknown";
    const kind = ["past_due", "payment_failed", "unpaid"].includes(status) ? "danger"
      : ["canceled", "expired"].includes(status) ? "warn"
      : "info";
    let actionLabel = null;
    let onAction = null;
    if (["past_due", "payment_failed", "unpaid"].includes(status) && openInv) {
      actionLabel = `Pay ${peso(openInv.amountDue, openInv.currency)}`;
      onAction = () => payInvoice(openInv._id);
    } else if (["past_due", "payment_failed", "unpaid"].includes(status)) {
      actionLabel = "Update card";
      onAction = () => document.getElementById("my-sub-card-select")?.focus();
    } else if (status === "paused") {
      actionLabel = "Resume now";
      onAction = () => doAction("resume");
    } else if (status === "pending" && openInv) {
      actionLabel = "Review card";
      onAction = () => document.getElementById("my-sub-card-select")?.focus();
    } else if (status === "pending") {
      actionLabel = "Check again";
      onAction = load;
    }
    alertCard(kind, status.replace(/_/g, " "), statusMessage(s, pm, openInv), actionLabel, onAction);

    renderActions(s, openInv);
    renderInvoices();
    renderNotifs();
  }

  function renderSubscribeForm() {
    const box = $("my-sub-actions");
    box.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "flex flex-wrap items-center gap-2";
    const price = currentPlanPrice();
    const mkCycle = (cycle, label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `text-xs font-bold px-3 py-2 rounded-lg cursor-pointer ${subCycle === cycle ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`;
      b.textContent = label;
      b.addEventListener("click", () => { subCycle = cycle; renderSubscribeForm(); });
      wrap.appendChild(b);
    };
    mkCycle("monthly", "Monthly");
    mkCycle("yearly", "Yearly");
    const sub = document.createElement("button");
    sub.type = "button";
    sub.className = "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer";
    sub.textContent = `Subscribe · ${price}`;
    sub.addEventListener("click", subscribe);
    wrap.appendChild(sub);
    const hint = document.createElement("p");
    hint.className = "text-[10px] text-slate-400 w-full";
    hint.textContent = "Uses the test payment method selected in the Payment method card.";
    box.append(wrap, hint);
  }

  function currentPlanPrice() {
    const plans = meta?.plans || [];
    const p = plans.find((x) => x.key === "pro") || plans[0];
    if (!p) return "";
    const amt = subCycle === "yearly" ? p.prices.yearly : p.prices.monthly;
    return peso(amt, p.currency);
  }

  async function subscribe() {
    const tok = $("my-sub-card-select")?.value;
    if (!tok) { toast("Choose a test payment method first.", "error"); return; }
    try {
      const out = await api("/me/subscribe", { method: "POST", body: JSON.stringify({ planKey: "pro", billingCycle: subCycle, testToken: tok, autoRenew: true }) });
      toast(out.message || "Subscribed.", "success");
      await load();
    } catch (e) { toast(e.message, "error"); }
  }

  function renderActions(s, openInv) {
    const box = $("my-sub-actions");
    box.replaceChildren();
    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer ${cls}`;
      b.textContent = label;
      b.addEventListener("click", fn);
      box.appendChild(b);
    };
    if (openInv) mk(`Pay ${peso(openInv.amountDue, openInv.currency)}`, "bg-indigo-600 hover:bg-indigo-700 text-white", () => payInvoice(openInv._id));
    // Resume remains only as an escape hatch for subscriptions paused before
    // the Pause action was retired — there is no way to pause anymore.
    if (s.status === "paused") mk("Resume", "bg-emerald-600 hover:bg-emerald-700 text-white", () => doAction("resume"));
    if (["active", "trialing"].includes(s.status)) mk("Switch cycle", "bg-white border border-slate-200 hover:border-indigo-300 text-indigo-700", openChangePlanModal);
    if (!["canceled", "expired"].includes(s.status)) mk("Cancel", "bg-white border border-slate-200 hover:border-rose-300 text-rose-600", cancelFlow);
  }

  function invoicePeriodText(inv) {
    const planName = current?.subscription?.planName || "Pro";
    if (inv.periodStart && inv.periodEnd) {
      return `${planName} · ${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}`;
    }
    const descriptions = Array.isArray(inv.lineItems)
      ? inv.lineItems.map((item) => item?.description).filter(Boolean)
      : [];
    return descriptions.length ? descriptions.join(" · ") : "—";
  }

  function renderInvoices() {
    const box = $("my-sub-invoices");
    box.replaceChildren();
    const list = current?.invoices || [];
    if (!list.length) {
      box.appendChild(Object.assign(document.createElement("p"), { className: "text-xs text-slate-400", textContent: "No invoices yet." }));
      return;
    }
    list.slice(0, 8).forEach((inv) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5";
      const left = document.createElement("div");
      left.className = "min-w-0";
      const n = document.createElement("p");
      n.className = "text-xs font-bold text-slate-800 font-mono";
      n.textContent = inv.number;
      const period = document.createElement("p");
      period.className = "text-[10px] text-slate-400 mt-0.5";
      period.textContent = `Covered ${invoicePeriodText(inv)}`;
      const due = document.createElement("p");
      due.className = "text-[10px] text-slate-400 mt-1";
      due.textContent = `Due ${fmtDate(inv.dueDate)}`;
      left.append(n, period, due);
      const right = document.createElement("div");
      right.className = "text-right shrink-0";
      const amt = document.createElement("p");
      amt.className = "text-xs font-black text-slate-900";
      amt.textContent = peso(inv.amountDue, inv.currency);
      const st = document.createElement("span");
      st.className = `text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${INV_PILL[inv.status] || "bg-slate-100 text-slate-500"}`;
      st.textContent = inv.status.replace(/_/g, " ");
      right.append(amt, st);
      if (inv.status === "paid") {
        const paid = document.createElement("p");
        paid.className = "text-[10px] text-slate-500 mt-1";
        paid.textContent = `Paid ${peso(inv.amountPaid, inv.currency)} · ${fmtDate(inv.paidAt)}`;
        right.appendChild(paid);
      }
      if (inv.status === "open") {
        const pay = document.createElement("button");
        pay.type = "button";
        pay.className = "ml-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer";
        pay.textContent = "Pay";
        pay.addEventListener("click", () => payInvoice(inv._id));
        right.appendChild(pay);
      }
      row.append(left, right);
      box.appendChild(row);
    });
  }

  function renderNotifs() {
    const box = $("my-sub-notifs");
    box.replaceChildren();
    const list = current?.notifications || [];
    if (!list.length) {
      box.appendChild(Object.assign(document.createElement("p"), { className: "text-xs text-slate-400", textContent: "No billing notices. Renewal reminders and warnings from your platform admin appear here." }));
      return;
    }
    list.slice(0, 5).forEach((n) => {
      const item = document.createElement("div");
      item.className = `rounded-lg border px-3 py-2.5 ${n.read ? "border-slate-100 bg-white" : "border-indigo-200 bg-indigo-50/50"}`;
      const head = document.createElement("div");
      head.className = "flex items-center justify-between gap-2";
      const t = document.createElement("p");
      t.className = "text-[11px] font-black text-slate-700 uppercase tracking-wider";
      t.textContent = String(n.type).replace(/_/g, " ");
      const d = document.createElement("p");
      d.className = "text-[10px] text-slate-400 shrink-0";
      d.textContent = fmtDate(n.createdAt);
      head.append(t, d);
      const m = document.createElement("p");
      m.className = "text-xs text-slate-600 mt-0.5";
      m.textContent = n.message;
      item.append(head, m);
      if (!n.read) {
        const mark = document.createElement("button");
        mark.type = "button";
        mark.className = "text-[11px] font-bold text-indigo-600 hover:underline mt-1 cursor-pointer";
        mark.textContent = "Mark as read";
        mark.addEventListener("click", async () => {
          try {
            await api(`/me/notifications/${n._id}/read`, { method: "POST", body: "{}" });
            n.read = true;
            if (current && typeof current.unread === "number") {
              current.unread = Math.max(0, current.unread - 1);
            }
            renderNotifs();
            refreshBadge();
          } catch (e) { toast(e.message, "error"); }
        });
        item.appendChild(mark);
      }
      box.appendChild(item);
    });
  }

  async function load(silent = false) {
    if (loading) return;
    loading = true;
    try {
      await ensureMeta();
      const out = await api("/me/subscription");
      current = out.data;
      // Sync to the server simulation clock when provided.
      if (out.now) {
        const skew = new Date(out.now).getTime() - Date.now();
        if (Number.isFinite(skew)) serverOffsetMs = skew;
      }
      render();
    } catch (e) {
      if (silent) {
        console.warn("My Subscription background refresh failed:", e?.message || e);
      } else {
        console.error("My Subscription load failed:", e);
        toast("Couldn't load subscription. Check your connection, then retry.", "error");
        renderLoadError(e);
      }
    } finally {
      loading = false;
    }
  }

  // Quiet background refresh so the navbar badge picks up new billing
  // notices, renewals, and status changes without opening the panel.
  // Skipped while the tab is hidden; silent so it never toasts or
  // replaces panel content on failure.
  let badgePollStarted = false;
  function startBadgePoll() {
    if (badgePollStarted) return;
    badgePollStarted = true;
    setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 120000);
  }

  function renderLoadError(e) {
    try {
      const planEl = $("my-sub-plan-name");
      if (planEl && !current?.subscription) {
        planEl.textContent = "Couldn't load subscription";
        $("my-sub-price").textContent = (e && e.message) || "Request failed.";
        const box = $("my-sub-actions");
        if (box) {
          box.replaceChildren();
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer";
          retry.textContent = "Retry";
          retry.addEventListener("click", load);
          box.appendChild(retry);
        }
      }
    } catch { /* never break load path */ }
  }
  window.refreshMySubscription = load;

  async function doAction(kind) {
    const map = { resume: "/me/resume" };
    try {
      const out = await api(map[kind], { method: "POST", body: "{}" });
      toast(out.message || "Done.", "success");
      await load();
    } catch (e) { toast(e.message, "error"); }
  }

  async function payInvoice(id) {
    try {
      const out = await api(`/me/pay-invoice/${id}`, { method: "POST", body: "{}" });
      toast(out.message || "Payment processed.", out.data?.outcome === "failed" ? "error" : "success");
      await load();
    } catch (e) { toast(e.message, "error"); }
  }

  async function cancelFlow() {
    const ok = await window.DashboardUI.confirm({
      title: "Cancel subscription",
      body: "This cancels immediately and stops billing now. Access ends right away.",
      confirmLabel: "Cancel now",
      danger: true,
    });
    if (!ok) return;
    try {
      const out = await api("/me/cancel", { method: "POST", body: JSON.stringify({ atPeriodEnd: false }) });
      toast(out.message || "Canceled.", "success");
      await load();
    } catch (e) { toast(e.message, "error"); }
  }

  function openChangePlanModal() {
    const modal = $("change-plan-modal");
    const select = $("change-plan-select");
    const empty = $("change-plan-empty");
    const confirm = $("change-plan-confirm");
    const error = $("change-plan-error");
    if (!modal || !select || !empty || !confirm || !error) return;

    // Single fixed plan: the only switch is the billing cycle.
    const plans = Array.isArray(meta?.plans) ? meta.plans : [];
    const plan = plans.find((p) => p && p.key === "pro") || plans.find((p) => p && p.isActive !== false) || plans[0];
    select.replaceChildren();
    error.textContent = "";
    error.classList.add("hidden");

    if (!plan || !plan.prices) {
      empty.classList.remove("hidden");
      select.disabled = true;
      confirm.disabled = true;
    } else {
      empty.classList.add("hidden");
      select.disabled = false;
      confirm.disabled = false;
      const currentCycle = current?.subscription?.billingCycle === "yearly" ? "yearly" : "monthly";
      [
        ["monthly", `Monthly · ${peso(plan.prices.monthly, plan.currency)} per month`],
        ["yearly", `Yearly · ${peso(plan.prices.yearly, plan.currency)} per year`],
      ].forEach(([cycle, label]) => {
        const option = document.createElement("option");
        option.value = cycle;
        option.textContent = cycle === currentCycle ? `${label} (current)` : label;
        select.appendChild(option);
      });
      select.value = currentCycle;
    }

    modal.classList.remove("hidden");
    select.focus();
  }

  function closeChangePlanModal() {
    const modal = $("change-plan-modal");
    const error = $("change-plan-error");
    if (!modal) return;
    modal.classList.add("hidden");
    if (error) {
      error.textContent = "";
      error.classList.add("hidden");
    }
  }

  async function confirmChangePlan() {
    const select = $("change-plan-select");
    const error = $("change-plan-error");
    const confirm = $("change-plan-confirm");
    const billingCycle = select?.value;
    if (!billingCycle) {
      if (error) {
        error.textContent = "Choose a billing cycle to continue.";
        error.classList.remove("hidden");
      }
      return;
    }

    const originalLabel = confirm?.textContent;
    if (confirm) {
      confirm.disabled = true;
      confirm.textContent = "Switching…";
    }
    try {
      const out = await api("/me/change-cycle", { method: "POST", body: JSON.stringify({ billingCycle }) });
      toast(out.message || "Billing cycle switched.", out.success === false ? "error" : "success");
      closeChangePlanModal();
      await load();
    } catch (e) {
      const message = e?.message || "Could not switch billing cycle.";
      toast(message, "error");
      closeChangePlanModal();
    } finally {
      if (confirm) {
        confirm.disabled = false;
        confirm.textContent = originalLabel;
      }
    }
  }

  async function toggleAutoRenew() {
    if (!current?.subscription) return;
    try {
      const out = await api("/me/auto-renew", { method: "POST", body: JSON.stringify({ autoRenew: !current.subscription.autoRenew }) });
      toast(out.message, "success");
      await load();
    } catch (e) { toast(e.message, "error"); }
  }

  function bindStatic() {
    $("my-sub-card-apply")?.addEventListener("click", async () => {
      const tok = $("my-sub-card-select")?.value;
      if (!tok) return;
      try {
        const out = await api("/me/payment-method", { method: "POST", body: JSON.stringify({ testToken: tok }) });
        toast(out.message, "success");
        await load();
      } catch (e) { toast(e.message, "error"); }
    });
    $("change-plan-close")?.addEventListener("click", closeChangePlanModal);
    $("change-plan-cancel")?.addEventListener("click", closeChangePlanModal);
    $("change-plan-confirm")?.addEventListener("click", confirmChangePlan);
    $("change-plan-modal")?.addEventListener("click", (event) => {
      if (event.target && event.target.id === "change-plan-modal") closeChangePlanModal();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { bindStatic(); load(); startBadgePoll(); });
  } else {
    bindStatic(); load(); startBadgePoll();
  }
})();
