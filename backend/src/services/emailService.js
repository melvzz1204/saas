// src/services/emailService.js
// Transactional email for the clinic email-verification flow. Two providers:
//   PRODUCTION: Resend HTTP API — set RESEND_API_KEY plus RESEND_FROM_EMAIL
//     (must be a sender/domain verified in your Resend dashboard).
//   FALLBACK:   Gmail SMTP — set EMAIL_USER (Gmail address) and EMAIL_PASS
//     (Gmail *App Password*, 16 chars, not your login password).
//   MAIL_FROM_NAME    Optional display name (default "NovaClinic").
//
// Configuration comes ONLY from environment variables (never hard-coded).
//
// Security: the verification code is included in the email body (that is its
// purpose) but is NEVER written to application logs. Only the (masked)
// recipient is logged.

import nodemailer from "nodemailer";

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    throw new Error(
      "Email service is not configured. Set EMAIL_USER and EMAIL_PASS (Gmail App Password) in the backend environment.",
    );
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedTransporter;
}

// Verify the SMTP credentials/connection. Useful in setup scripts and tests.
export async function verifyEmailTransport() {
  if (resendConfigured()) {
    // Lightweight key check: listing domains requires a valid API key.
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) {
      throw new Error(`Resend key check failed (HTTP ${res.status}).`);
    }
    return true;
  }
  const transporter = getTransporter();
  await transporter.verify();
  return true;
}

function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// RESEND_FROM_EMAIL may be a bare address ("no-reply@example.com") or an
// already-formatted sender ("MarSU SOMIS <no-reply@example.com>"). A
// preformatted value is used exactly as-is so we never nest angle brackets.
function formatResendSender(fromEmail, fromName) {
  const raw = String(fromEmail || "").trim();
  if (/<[^<>]+>/.test(raw)) return raw;
  return fromName ? `${fromName} <${raw}>` : raw;
}

async function sendViaResend({ fromEmail, fromName, to, subject, text, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: formatResendSender(fromEmail, fromName),
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      out?.message || `Resend rejected the email (HTTP ${res.status}).`,
    );
  }
  return out;
}

// Single choke point for every sender below: Resend in production,
// Gmail SMTP otherwise. Callers pass content only — sender identity is
// resolved here from the environment.
async function dispatchMail({ to, subject, text, html }) {
  const fromName = process.env.MAIL_FROM_NAME || "NovaClinic";
  if (resendConfigured()) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_USER;
    if (!fromEmail) {
      throw new Error(
        "Email service is not configured. Set RESEND_FROM_EMAIL (or EMAIL_USER) alongside RESEND_API_KEY.",
      );
    }
    await sendViaResend({ fromEmail, fromName, to, subject, text, html });
    return { provider: "resend" };
  }
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${fromName}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
  return { provider: "gmail" };
}

// Mask an email for safe logging: "jo***@gmail.com".
function maskEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!domain) return "***";
  const shown = local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function buildEmail({ code, clinicName, ttlMinutes }) {
  const safeClinic = escapeHtml(clinicName || "your clinic");
  const subject = "Your NovaClinic verification code";

  const text =
    `Verify your NovaClinic registration\n\n` +
    `Use this code to finish registering ${clinicName || "your clinic"}:\n\n` +
    `    ${code}\n\n` +
    `This code expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`;

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="text-align:center;margin-bottom:20px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:#0f766e;color:#fff;font-size:22px;font-weight:800">N</div>
      <h1 style="font-size:18px;margin:12px 0 0">Verify your registration</h1>
    </div>
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Enter this code to finish registering <strong>${safeClinic}</strong>:
    </p>
    <div style="text-align:center;margin:24px 0">
      <div style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 28px;color:#0f172a">
        ${escapeHtml(code)}
      </div>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#64748b">
      This code expires in <strong>${ttlMinutes} minutes</strong> and can be used once.
      If you didn't request this, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="font-size:11px;color:#94a3b8;text-align:center">NovaClinic · Automated message, please do not reply.</p>
  </div>`;

  return { subject, text, html };
}

// Send a verification code. Resolves on success, throws on transport failure.
export async function sendVerificationEmail({ to, code, clinicName, ttlMinutes }) {
  const { subject, text, html } = buildEmail({ code, clinicName, ttlMinutes });

  await dispatchMail({ to, subject, text, html });

  // Log only non-sensitive metadata — never the code.
  console.log(`✉️  Verification code sent to ${maskEmail(to)}`);
  return true;
}

// ---------------------------------------------------------------------------
// Application status emails (sent when a SaaS admin approves/rejects a clinic)
// ---------------------------------------------------------------------------

// Absolute URL into the frontend app, if FRONTEND_URL is configured.
function appUrl(pathAndQuery = "") {
  const base = String(process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  return base ? base + pathAndQuery : "";
}

// Shared branded HTML shell.
function brandShell(title, innerHtml) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="text-align:center;margin-bottom:20px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:#0f766e;color:#fff;font-size:22px;font-weight:800">N</div>
      <h1 style="font-size:19px;margin:12px 0 0">${escapeHtml(title)}</h1>
    </div>
    ${innerHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="font-size:11px;color:#94a3b8;text-align:center">NovaClinic · Automated message, please do not reply.</p>
  </div>`;
}

function ctaButton(href, label) {
  if (!href) return "";
  return `<div style="text-align:center;margin:24px 0">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">${escapeHtml(label)}</a>
  </div>`;
}

// Sent when a clinic application is APPROVED.
export async function sendApplicationApprovedEmail({ to, clinicName, slug }) {
  const name = clinicName || "your clinic";
  const loginUrl = appUrl("/index.html?auth=login");
  const publicUrl = slug ? appUrl(`/clinicHomePage.html?clinic=${encodeURIComponent(slug)}`) : "";

  const subject = `🎉 ${name} is approved on NovaClinic`;

  const text =
    `Great news — ${name} has been approved!\n\n` +
    `Your clinic workspace is now active. Sign in with your administrator email and password to start managing appointments, staff, and your public page.\n\n` +
    (loginUrl ? `Sign in: ${loginUrl}\n` : "") +
    (publicUrl ? `Your public page: ${publicUrl}\n` : "");

  const inner = `
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Great news — <strong>${escapeHtml(name)}</strong> has been <strong style="color:#0f766e">approved</strong>!
    </p>
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Your clinic workspace is now active. Sign in with your administrator email and password to
      start managing appointments, staff, pricing, and your public clinic page.
    </p>
    ${ctaButton(loginUrl, "Sign in to your dashboard")}
    ${publicUrl ? `<p style="font-size:13px;line-height:1.6;color:#64748b;text-align:center">Your public page: <a href="${escapeHtml(publicUrl)}" style="color:#0f766e">${escapeHtml(publicUrl)}</a></p>` : ""}
  `;

  await dispatchMail({
    to,
    subject,
    text,
    html: brandShell("Your clinic is approved", inner),
  });

  console.log(`✉️  Approval email sent to ${maskEmail(to)}`);
  return true;
}

// Sent when a clinic application is REJECTED.
export async function sendApplicationRejectedEmail({ to, clinicName, reason }) {
  const name = clinicName || "your clinic";
  const loginUrl = appUrl("/index.html?auth=login");
  const safeReason = String(reason || "").trim() || "Additional information is required.";

  const subject = `Action needed: ${name} application`;

  const text =
    `Your application for ${name} needs attention.\n\n` +
    `Reason: ${safeReason}\n\n` +
    `Please sign in with your administrator account to review the details and resubmit corrected documents.\n` +
    (loginUrl ? `Sign in: ${loginUrl}\n` : "");

  const inner = `
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Thanks for registering <strong>${escapeHtml(name)}</strong>. We reviewed your application and it needs
      a few corrections before we can approve it.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:#991b1b"><strong>What needs attention</strong></p>
      <p style="margin:6px 0 0;font-size:14px;color:#7f1d1d;line-height:1.6">${escapeHtml(safeReason)}</p>
    </div>
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Sign in with your administrator account to review the details and resubmit corrected documents.
    </p>
    ${ctaButton(loginUrl, "Sign in to resubmit")}
  `;

  await dispatchMail({
    to,
    subject,
    text,
    html: brandShell("Your application needs attention", inner),
  });

  console.log(`✉️  Rejection email sent to ${maskEmail(to)}`);
  return true;
}

// Sent right after a successful up-front subscription payment at registration.
export async function sendSubscriptionActiveEmail({ to, clinicName, planName, amount, currency = "PHP", billingCycle, nextRenewalDate, reference }) {
  const name = clinicName || "your clinic";
  const symbol = currency === "PHP" ? "₱" : currency === "USD" ? "$" : "";
  const amt = `${symbol}${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const renew = nextRenewalDate ? new Date(nextRenewalDate).toISOString().slice(0, 10) : "—";

  const subject = `Payment received — ${planName} subscription is active`;

  const text =
    `Thank you! We received your payment for ${name}.\n\n` +
    `Plan: ${planName} (${billingCycle})\n` +
    `Amount paid: ${amt}\n` +
    `Status: Active\n` +
    `Next renewal: ${renew}\n` +
    `Reference: ${reference}\n\n` +
    `This is a SIMULATED payment for a test environment — no real card was charged.\n` +
    `Finish by entering the verification code we emailed you separately.`;

  const inner = `
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Thank you! We received your payment for <strong>${escapeHtml(name)}</strong> and your subscription is
      <strong style="color:#0f766e">active</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#64748b">Plan</td><td style="padding:6px 0;text-align:right;font-weight:700">${escapeHtml(planName)} (${escapeHtml(billingCycle)})</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700">${amt}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Status</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0f766e">Active</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Next renewal</td><td style="padding:6px 0;text-align:right;font-weight:700">${renew}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px">${escapeHtml(reference || "")}</td></tr>
    </table>
    <p style="font-size:13px;line-height:1.6;color:#64748b">
      Enter the verification code from our other email to finish creating your workspace.
    </p>
    <p style="font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px">
      🧪 Simulated payment environment — no real card was charged.
    </p>`;

  await dispatchMail({
    to,
    subject,
    text,
    html: brandShell("Subscription payment received", inner),
  });

  console.log(`✉️  Subscription-active email sent to ${maskEmail(to)}`);
  return true;
}

// Sent when a SaaS admin manually warns a clinic (expiring soon / overdue /
// trial ending / custom). `kind` controls the subject line + heading.
export async function sendSubscriptionWarningEmail({ to, clinicName, kind = "custom", planName, amount, currency = "PHP", dueDate, message }) {
  const name = clinicName || "your clinic";
  const loginUrl = appUrl("/index.html?auth=login");
  const symbol = currency === "PHP" ? "₱" : currency === "USD" ? "$" : "";
  const amt = amount == null ? "" : `${symbol}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const due = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : "";

  const HEADINGS = {
    expiring_soon: "Your subscription is expiring soon",
    overdue: "Your subscription payment is overdue",
    trial_ending: "Your trial is ending soon",
    custom: "A message about your subscription",
  };
  const SUBJECTS = {
    expiring_soon: `⏳ ${name} subscription renews soon`,
    overdue: `⚠️ ${name} subscription payment overdue`,
    trial_ending: `⏳ ${name} trial ends soon`,
    custom: `About your ${name} subscription`,
  };
  const heading = HEADINGS[kind] || HEADINGS.custom;
  const subject = SUBJECTS[kind] || SUBJECTS.custom;

  const text =
    `${heading}\n\n` +
    (message ? `${message}\n\n` : "") +
    (planName ? `Plan: ${planName}\n` : "") +
    (amt ? `Amount: ${amt}\n` : "") +
    (due ? `Renewal / due date: ${due}\n` : "") +
    (loginUrl ? `\nManage your subscription: ${loginUrl}\n` : "");

  const inner = `
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Hi <strong>${escapeHtml(name)}</strong> team,
    </p>
    ${message ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:12px 0"><p style="margin:0;font-size:14px;color:#0f172a;line-height:1.6">${escapeHtml(message)}</p></div>` : ""}
    <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:14px">
      ${planName ? `<tr><td style="padding:4px 0;color:#64748b">Plan</td><td style="padding:4px 0;text-align:right;font-weight:700">${escapeHtml(planName)}</td></tr>` : ""}
      ${amt ? `<tr><td style="padding:4px 0;color:#64748b">Amount</td><td style="padding:4px 0;text-align:right;font-weight:700">${amt}</td></tr>` : ""}
      ${due ? `<tr><td style="padding:4px 0;color:#64748b">Renewal / due date</td><td style="padding:4px 0;text-align:right;font-weight:700">${due}</td></tr>` : ""}
    </table>
    ${ctaButton(loginUrl, "Manage subscription")}
  `;

  await dispatchMail({
    to,
    subject,
    text,
    html: brandShell(heading, inner),
  });

  console.log(`✉️  Subscription warning (${kind}) sent to ${maskEmail(to)}`);
  return true;
}
