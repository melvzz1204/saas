// /src/pages/clinicHomepage.js
// Public clinic landing page controller — renders profile, services, dentists,
// testimonials and wires booking / auth / navigation UI.

const API_BASE_URL = window.location.origin.includes("localhost")
  ? "http://localhost:5000"
  : window.location.origin;

const URL_PARAMS = new URLSearchParams(window.location.search);
const CLINIC_SLUG =
  URL_PARAMS.get("clinic") || localStorage.getItem("clinicSlug");

let cachedServices = [];
let cachedTestimonials = [];
const INITIAL_TESTIMONIAL_COUNT = 3;

// Ordered day list for rendering operating hours consistently.
const WEEK_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Fallback hours used when a clinic has not configured operating hours yet.
const DEFAULT_HOURS = [
  { day: "Monday", openTime: "08:00", closeTime: "17:00", isClosed: false },
  { day: "Tuesday", openTime: "08:00", closeTime: "17:00", isClosed: false },
  { day: "Wednesday", openTime: "08:00", closeTime: "17:00", isClosed: false },
  { day: "Thursday", openTime: "08:00", closeTime: "17:00", isClosed: false },
  { day: "Friday", openTime: "08:00", closeTime: "17:00", isClosed: false },
  { day: "Saturday", openTime: "08:00", closeTime: "12:00", isClosed: false },
  { day: "Sunday", openTime: "", closeTime: "", isClosed: true },
];

document.addEventListener("DOMContentLoaded", async () => {
  if (!CLINIC_SLUG) {
    showHomepageError("No clinic specified. Use the ?clinic=slug URL parameter.");
    return;
  }

  localStorage.setItem("clinicSlug", CLINIC_SLUG);

  // 1. Resolve the clinic profile (slug -> id -> full record with hours/contact).
  const clinic = await loadClinicProfile(CLINIC_SLUG);
  const clinicId = localStorage.getItem("clinicId");

  // 2. Load dynamic public content in parallel.
  await Promise.all([
    loadClinicDentists(clinicId),
    loadClinicTestimonials(clinicId),
    loadServicesCatalog(),
  ]);

  // 3. Wire UI: auth controls, booking CTAs, modals, mobile menu.
  setupDynamicAuthControls();
  bindActionButtons();
  setupModals();
  setupMobileMenu();

  // 4. Live-refresh testimonials when patients publish new reviews.
  setupTestimonialLiveUpdates(clinicId);
});

// =========================================================================
// 🏥 CLINIC PROFILE (name, address, phone, operating hours)
// =========================================================================
async function loadClinicProfile(slug) {
  const slugResult = await fetchJson(
    `${API_BASE_URL}/api/v1/tenants/slug/${encodeURIComponent(slug)}`,
  );
  const slugData = slugResult?.data || slugResult;

  if (!slugData?._id) {
    showHomepageError(
      "We couldn't find this clinic. Please check the link and try again.",
    );
    return null;
  }

  localStorage.setItem("clinicId", slugData._id);
  const clinicName = slugData.name || "Dental Practice";

  // Best-effort fetch of the full clinic record (address, phone, hours).
  const fullResult = await fetchJson(
    `${API_BASE_URL}/api/v1/tenants/${slugData._id}`,
  );
  const full = fullResult?.data || {};

  renderClinicIdentity(clinicName);
  renderContactInfo(full);
  updateDOMText(
    "clinic-description",
    String(full.description || "Our clinic provides trusted, personalized care for every smile.").trim(),
  );
  renderHours(full.operatingHours);
  applyLandingConfig(full);

  document.title = `${clinicName} | Book Your Appointment`;
  return full;
}

function renderClinicIdentity(name) {
  updateDOMText("clinic-title", name);
  updateDOMText("header-clinic-name", name);
  updateDOMText("footer-clinic-name", name);
}

// =========================================================================
// 🎨 LANDING PAGE BUILDER — apply published (or draft in preview) config
// =========================================================================
const SAFE_MEDIA_URL = /^(\/uploads\/|https?:\/\/)/i;
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const CUSTOMIZABLE_SECTIONS = [
  "services",
  "dentists",
  "testimonials",
  "visit",
  "pricing",
];

// Element ids that back the static section texts (eyebrow / heading / intro).
const SECTION_TEXT_ELEMENT_IDS = {
  services: { eyebrow: "services-eyebrow", heading: "services-title", intro: "services-intro" },
  dentists: { eyebrow: "dentists-eyebrow", heading: "dentists-title", intro: "dentists-intro" },
  testimonials: { eyebrow: "testimonials-eyebrow", heading: "testimonials-title", intro: "testimonials-intro" },
  visit: { eyebrow: "visit-eyebrow", heading: "visit-title", intro: "visit-intro" },
  pricing: { eyebrow: "pricing-eyebrow", heading: "pricing-title", intro: "pricing-intro" },
};

const TYPOGRAPHY_FONT_STACK = {
  default: "",
  clean: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
  elegant: "Georgia, 'Times New Roman', serif",
  rounded: "'Nunito', 'Quicksand', 'Segoe UI', system-ui, sans-serif",
};

const SOCIAL_ICON_PATHS = {
  facebook:
    '<path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.62.77-1.62 1.56v1.87h2.76l-.44 2.9h-2.32V22c4.78-.76 8.44-4.92 8.44-9.94Z"/>',
  instagram:
    '<path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23a3.7 3.7 0 0 1-.9 1.38 3.7 3.7 0 0 1-1.38.9c-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/>',
  twitter:
    '<path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93L18.9 1.15Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z"/>',
  linkedin:
    '<path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/>',
  website:
    '<path d="M12 2.25c-5.39 0-9.75 4.36-9.75 9.75s4.36 9.75 9.75 9.75 9.75-4.36 9.75-9.75S17.39 2.25 12 2.25ZM2.25 12a9.75 9.75 0 0 1 2.65-6.63c.55.63 1.04 1.71 1.38 2.96.25.93.28 1.84.28 2.67 0 1.96.75 3.21 1.2 3.76.34.42.82.63 1.38.6.58-.03 1.06-.29 1.42-.62.34-.32.55-.77.72-1.22.15-.4.24-.86.33-1.3.08-.4.16-.81.31-1.18.33-.8.9-1.5 1.63-2.06.73-.55 1.56-.89 2.38-1.24.5-.21 1-.44 1.52-.6.51-.15 1.03-.22 1.55-.14.05.02.1.02.15.02v.01A9.75 9.75 0 1 1 2.25 12Z"/>',
};

// Curated spots on the page that get the branding color (primary = CTAs,
// secondary = section eyebrows). Applied via <style id="clinic-brand-style">.
function applyBranding(landing) {
  const primary = String(landing.primaryColor || "").trim();
  const secondary = String(landing.secondaryColor || "").trim();
  const headerBackground = String(landing.headerBackground || "").trim();
  const footerBackground = String(landing.footerBackground || "").trim();
  const typography = TYPOGRAPHY_FONT_STACK[landing.typography] ? landing.typography : "default";

  const rules = [];
  if (HEX_COLOR.test(primary)) {
    rules.push(
      `.book-treatment-btn{background-color:${primary}!important;border-color:${primary}!important;}`,
      `.book-treatment-btn:hover{filter:brightness(0.92);}`,
      `#clinic-tagline{color:${primary}!important;}`,
    );
  }
  if (HEX_COLOR.test(secondary)) {
    rules.push(
      `#hero-eyebrow, #services-eyebrow, #dentists-eyebrow, #testimonials-eyebrow, #visit-eyebrow, #pricing-eyebrow{color:${secondary}!important;}`,
    );
  }
  if (HEX_COLOR.test(headerBackground)) {
    rules.push(`#site-header{background-color:${headerBackground}!important;}`);
  }
  if (HEX_COLOR.test(footerBackground)) {
    rules.push(`#site-footer{background-color:${footerBackground}!important;}`);
  }
  const fontStack = TYPOGRAPHY_FONT_STACK[typography];
  if (typography !== "default" && fontStack) {
    rules.push(
      `body.landing-typography-${typography} h1, body.landing-typography-${typography} h2, body.landing-typography-${typography} h3, body.landing-typography-${typography} .font-serif{font-family:${fontStack}!important;}`,
    );
  }

  const styleEl = document.getElementById("clinic-brand-style");
  if (styleEl) styleEl.textContent = rules.join("\n");

  ["clean", "elegant", "rounded"].forEach((name) =>
    document.body.classList.remove(`landing-typography-${name}`),
  );
  if (typography !== "default") document.body.classList.add(`landing-typography-${typography}`);
}

function applyLogo(landing) {
  const logo = String(landing.logoUrl || "").trim();
  const logoImg = document.getElementById("clinic-logo");
  const logoFallback = document.getElementById("clinic-logo-fallback");
  if (logo && SAFE_MEDIA_URL.test(logo) && logoImg) {
    logoImg.src = logo;
    logoImg.classList.remove("hidden");
    logoFallback?.classList.add("hidden");
  } else if (logoFallback) {
    logoFallback.classList.remove("hidden");
    logoImg?.classList.add("hidden");
  }
}

function applySectionTexts(sectionTexts) {
  const texts = sectionTexts && typeof sectionTexts === "object" ? sectionTexts : {};
  Object.entries(SECTION_TEXT_ELEMENT_IDS).forEach(([section, elementIds]) => {
    const text = texts[section] || {};
    if (text.eyebrow) updateDOMText(elementIds.eyebrow, text.eyebrow);
    if (text.heading) updateDOMText(elementIds.heading, text.heading);
    if (text.intro) updateDOMText(elementIds.intro, text.intro);
  });
}

function applySocialLinks(links) {
  const socialLinks = Array.isArray(links) ? links : [];
  const wrap = document.getElementById("clinic-social-links-wrap");
  const container = document.getElementById("clinic-social-links");
  if (!wrap || !container) return;

  const valid = socialLinks.filter(
    (link) => SOCIAL_ICON_PATHS[link?.platform] && /^https?:\/\//i.test(String(link?.url || "")),
  );

  if (!valid.length) {
    wrap.classList.add("hidden");
    container.replaceChildren();
    return;
  }

  wrap.classList.remove("hidden");
  container.replaceChildren();
  valid.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.setAttribute("aria-label", link.platform);
    anchor.className =
      "flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-teal-500 text-slate-200 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400";
    anchor.innerHTML = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SOCIAL_ICON_PATHS[link.platform]}</svg>`;
    container.appendChild(anchor);
  });
}

// Applies one landing config to the document. Used by the published config on
// load and by the dashboard's live preview posts (draft).
function applyLandingContent(landing) {
  const config = landing && typeof landing === "object" ? landing : {};

  applyBranding(config);
  applyLogo(config);

  if (config.tagline) updateDOMText("clinic-tagline", config.tagline);

  // Description comes from the merged profile when set, otherwise falls back
  // to the clinic record (which loadClinicProfile already rendered).
  if (String(config.description || "").trim()) {
    updateDOMText("clinic-description", String(config.description).trim());
  }
  if (config.heroEyebrow) updateDOMText("hero-eyebrow", config.heroEyebrow);

  applySectionTexts(config.sectionTexts);
  applySocialLinks(config.socialLinks);

  // Section visibility.
  const hidden = Array.isArray(config.hiddenSections) ? config.hiddenSections : [];
  CUSTOMIZABLE_SECTIONS.forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.classList.toggle("hidden", hidden.includes(key));
  });
  const customEl = document.getElementById("clinic-custom-blocks");
  if (customEl) customEl.classList.toggle("hidden", hidden.includes("custom"));

  // Section ordering (moves custom blocks + built-in sections).
  reorderSections(Array.isArray(config.sectionOrder) ? config.sectionOrder : []);

  // Custom content blocks (rendered after reorder so #clinic-custom-blocks is
  // already in the correct position).
  renderCustomBlocks(
    Array.isArray(config.blocks) ? config.blocks : [],
    hidden.includes("custom"),
  );
}

function applyLandingConfig(full) {
  const preview = URL_PARAMS.get("preview") === "1";
  const landing =
    (preview ? full?.landing?.draft : full?.landing?.published) ||
    full?.landing?.published ||
    {};
  applyLandingContent(landing);
  if (preview) showPreviewBanner();
}

// Default element order: matches the static HTML sequence.
const SECTION_DEFAULT_ORDER = [
  "clinic-custom-blocks",
  "services",
  "dentists",
  "testimonials",
  "visit",
  "pricing",
];
let previousSectionOrder = "";

function reorderSections(order) {
  // "custom" maps to the #clinic-custom-blocks element. De-duplicate while
  // preserving first occurrence, dropping unknown keys.
  const normalized = (Array.isArray(order) ? order : [])
    .filter((key) => SECTION_DEFAULT_ORDER.includes(key))
    .reduce((acc, key) => { if (!acc.includes(key)) acc.push(key); return acc; }, []);

  // Append any sections not mentioned in the order at the end, in their
  // original relative sequence — so nothing is silently dropped.
  normalized.push(
    ...SECTION_DEFAULT_ORDER.filter((k) => !normalized.includes(k)),
  );

  const orderKey = normalized.join(",");
  if (orderKey === previousSectionOrder) return; // no-op for identical order
  previousSectionOrder = orderKey;

  // Anchor: the final CTA band, which should always stay after the reorderable
  // sections. We insert the ordered sections before it so the CTA (and any
  // following content) is never displaced.
  const anchor = document.getElementById("final-cta-title")?.closest("section");
  if (!anchor) return;

  // Insert each section immediately before the anchor, in the desired order.
  // The browser moves existing nodes rather than re-creating them.
  for (const key of normalized) {
    const el = document.getElementById(key);
    if (el) anchor.before(el);
  }
}

const BLOCK_BG_STYLES = {
  none: "",
  muted: "bg-slate-100/80 rounded-2xl p-8 sm:p-10 lg:p-12",
  brand: "bg-teal-50/80 rounded-2xl p-8 sm:p-10 lg:p-12",
};

function renderCustomBlocks(blocks, isHidden = false) {
  const container = document.getElementById("clinic-custom-blocks");
  if (!container) return;
  container.replaceChildren();

  const valid = blocks.filter((b) => b && (b.heading || b.body || b.imageUrl));
  if (!valid.length || isHidden) {
    container.classList.add("hidden");
    if (!valid.length) return;
  } else {
    container.classList.remove("hidden");
  }

  valid.forEach((block, index) => {
    const heading = String(block.heading || "");
    const body = String(block.body || "");
    const align = block.align === "center" ? "center" : "left";
    const bgClass = BLOCK_BG_STYLES[block.background] || "";
    const imageOk =
      block.type === "image" && SAFE_MEDIA_URL.test(String(block.imageUrl || ""));

    const makeText = () => {
      const col = document.createElement("div");
      col.className = align === "center" ? "text-center" : "";
      if (heading) {
        const h = document.createElement("h2");
        h.className =
          "text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight";
        if (align === "center") h.className += " mx-auto";
        h.textContent = heading;
        col.appendChild(h);
      }
      if (body) {
        const p = document.createElement("p");
        p.className =
          "mt-3 text-slate-600 leading-relaxed whitespace-pre-line";
        if (align === "center") {
          p.className += " max-w-2xl mx-auto";
        } else {
          p.className += " max-w-prose";
        }
        p.textContent = body;
        col.appendChild(p);
      }
      return col;
    };

    let wrap;
    if (imageOk) {
      wrap = document.createElement("div");
      wrap.className =
        "grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center";
      const imgCol = document.createElement("div");
      const img = document.createElement("img");
      img.src = block.imageUrl;
      img.alt = heading;
      img.loading = "lazy";
      img.className =
        "w-full rounded-2xl shadow-md object-cover max-h-96";
      imgCol.appendChild(img);
      const textCol = makeText();
      // Alternate image/text sides for visual rhythm.
      if (index % 2 === 1) {
        wrap.appendChild(textCol);
        wrap.appendChild(imgCol);
      } else {
        wrap.appendChild(imgCol);
        wrap.appendChild(textCol);
      }
    } else {
      wrap = makeText();
      // Only constrain width for centered text; left-aligned text keeps the
      // natural max-prose body width and stays left.
      if (align !== "center") {
        wrap.className = "max-w-3xl";
      }
    }

    if (bgClass) {
      wrap.className += " " + bgClass;
    }

    container.appendChild(wrap);
  });
}

function showPreviewBanner() {
  if (document.getElementById("clinic-preview-banner")) return;
  const bar = document.createElement("div");
  bar.id = "clinic-preview-banner";
  bar.setAttribute("role", "status");
  bar.className =
    "fixed bottom-0 inset-x-0 z-50 bg-amber-500 text-slate-900 text-xs font-bold text-center py-2 px-4";
  bar.textContent = "Preview mode — showing unpublished draft changes.";
  document.body.appendChild(bar);
}

function renderContactInfo(clinic) {
  const address = String(clinic?.address || "").trim();
  const phone = String(clinic?.contactNumber || "").trim();

  if (address) {
    updateDOMText("clinic-address", address);
    updateDOMText("footer-address-text", address);
  } else {
    document.getElementById("visit-address-row")?.classList.add("hidden");
    document.getElementById("footer-address")?.classList.add("hidden");
  }

  if (phone) {
    const telHref = `tel:${phone.replace(/[^\d+]/g, "")}`;
    ["nav-phone-link", "mobile-phone-link", "clinic-phone", "footer-phone", "final-call-btn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = telHref;
    });
    ["nav-phone-number", "mobile-phone-number", "footer-phone-number"].forEach((id) => {
      updateDOMText(id, phone);
    });
    updateDOMText("final-call-number", `Call ${phone}`);
  } else {
    ["nav-phone-link", "mobile-phone-link", "visit-phone-row", "final-call-btn", "footer-phone"].forEach((id) => {
      document.getElementById(id)?.classList.add("hidden");
    });
  }
}

// -------------------------------------------------------------------------
// 🕘 OPERATING HOURS
// -------------------------------------------------------------------------
function normalizeHours(rawHours) {
  if (!Array.isArray(rawHours) || rawHours.length === 0) return DEFAULT_HOURS;

  const byDay = new Map(
    rawHours
      .filter((row) => row && row.day)
      .map((row) => [row.day, row]),
  );

  return WEEK_ORDER.map((day) => byDay.get(day) || { day, isClosed: true });
}

function formatClock(time24) {
  if (!time24) return "";
  const [hour = 0, minute = 0] = String(time24).split(":").map(Number);
  if (Number.isNaN(hour)) return time24;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute > 0
    ? `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`
    : `${displayHour} ${suffix}`;
}

function renderHours(rawHours) {
  const hours = normalizeHours(rawHours);
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0
  const list = document.getElementById("hours-list");
  if (!list) return;

  list.innerHTML = hours
    .map((row, index) => {
      const isToday = index === todayIndex;
      const label = row.isClosed ? "Closed" : `${formatClock(row.openTime)} – ${formatClock(row.closeTime)}`;
      return `
        <div class="flex justify-between items-center gap-4 py-3 border-b border-slate-100 ${isToday ? "bg-teal-50/70 -mx-3 px-3 rounded-xl border-teal-100" : ""}">
          <span class="flex items-center gap-2 font-semibold ${isToday ? "text-teal-800" : "text-slate-500"}">
            ${isToday ? '<span class="h-2 w-2 rounded-full bg-teal-500" aria-hidden="true"></span>' : ""}
            ${row.day}
            ${isToday ? '<span class="text-[10px] font-bold uppercase tracking-wider text-teal-700">· Today</span>' : ""}
          </span>
          <span class="font-bold ${row.isClosed ? "text-slate-400" : "text-slate-800"}">${label}</span>
        </div>`;
    })
    .join("");

  // Footer summary (Mon–Fri / Saturday / Sunday).
  const footerHours = document.getElementById("footer-hours");
  if (footerHours) {
    const weekdays = hours.slice(0, 5);
    const saturday = hours[5];
    const sunday = hours[6];

    const allSame = weekdays.every((d) => d.isClosed === weekdays[0].isClosed &&
      d.openTime === weekdays[0].openTime && d.closeTime === weekdays[0].closeTime);

    const row = (label, row) =>
      `<li class="flex justify-between gap-6">
         <span class="text-slate-400">${label}</span>
         <span class="font-semibold text-slate-200">${row.isClosed ? "Closed" : `${formatClock(row.openTime)} – ${formatClock(row.closeTime)}`}</span>
       </li>`;

    footerHours.innerHTML = `${row(allSame ? "Mon – Fri" : "Weekdays", weekdays[0])}
      ${saturday ? row("Saturday", saturday) : ""}
      ${sunday ? row("Sunday", sunday) : ""}`;
  }

  // Hero "open today" chip.
  const todayRow = hours[todayIndex];
  const chip = document.getElementById("hero-open-chip");
  const chipLabel = chip?.querySelector("span:last-child");
  if (chip && chipLabel) {
    chipLabel.textContent = todayRow?.isClosed
      ? "Closed today — book ahead"
      : `Open today · ${formatClock(todayRow?.openTime)} – ${formatClock(todayRow?.closeTime)}`;
  }
}

// =========================================================================
// 💎 TREATMENT CATALOG & PRICING
// =========================================================================
function getServiceCategory(slug = "") {
  const s = slug.toLowerCase();
  if (/(clean|exam|xray|x-ray|fluoride|sealant)/.test(s))
    return { label: "Preventive care", icon: "shield" };
  if (/(fill|crown|bridge|inlay|onlay)/.test(s))
    return { label: "Restorative", icon: "tooth" };
  if (/(root|extract|implant|graft|surg)/.test(s))
    return { label: "Surgical & endodontic", icon: "plus" };
  if (/(whiten|vene|brace|aligner|cosmetic)/.test(s))
    return { label: "Cosmetic & orthodontics", icon: "sparkles" };
  if (/(gum|periodont|deep-clean)/.test(s))
    return { label: "Gum therapy", icon: "heart" };
  return { label: "General dentistry", icon: "tooth" };
}

const CATEGORY_ICONS = {
  shield:
    '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />',
  tooth:
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7.5-4.7-9.75-9.25C.9 9.1 2.4 5.6 5.9 5.6c2 0 3.35 1.1 4.35 2.4.4-.53.9-1 1.4-1.4.9-.5 1.9-.8 2.9-.8" />',
  plus:
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />',
  sparkles:
    '<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />',
  heart:
    '<path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />',
};

async function loadServicesCatalog() {
  const clinicId = localStorage.getItem("clinicId");
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (clinicId) headers["x-clinic-id"] = clinicId;
  if (CLINIC_SLUG) headers["x-clinic-slug"] = CLINIC_SLUG;

  try {
    const { data: json } = await AppFeedback.request(
      `${API_BASE_URL}/api/v1/dental-price/services`,
      { method: "GET", headers },
    );

    if (json.success && Array.isArray(json.data)) {
      cachedServices = json.data;
      const active = cachedServices.filter(
        (s) => s.isAvailable !== false && s.status !== "Inactive" && s.status !== "Disabled",
      );

      if (active.length === 0) {
        showServicesStatus("No treatments are currently listed for this clinic.");
        updateMatrixStatus("No treatments currently listed for this clinic.");
        return;
      }

      renderServiceCards(active);
      renderTreatmentMatrix(active);
      setupMatrixSearch();
      updateDOMText("stat-services", `${active.length}+`);
    } else {
      throw new Error(json.message || "Invalid service payload.");
    }
  } catch (error) {
    console.error("Clinic services request failed", error);
    showServicesStatus(
      "We couldn't load our treatments right now.",
      true,
      loadServicesCatalog,
    );
    updateMatrixStatus(
      "We couldn't load treatment information right now. Please try again.",
    );
  }
}

function formatPrice(value) {
  return `₱${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function showServicesStatus(message, isError = false, retry) {
  const status = document.getElementById("services-status");
  const container = document.getElementById("services-container");
  if (!status) return;

  container?.classList.add("hidden");
  status.classList.remove("hidden");
  status.className = `rounded-2xl border p-10 text-center text-sm ${
    isError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-500"
  }`;
  status.innerHTML = `<p>${message}</p>${
    retry
      ? '<button type="button" id="retry-services" class="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-700">Try again</button>'
      : ""
  }`;
  document.getElementById("retry-services")?.addEventListener("click", retry);
}

function renderServiceCards(services) {
  const status = document.getElementById("services-status");
  const container = document.getElementById("services-container");
  if (!container) return;

  container.innerHTML = services
    .map((service) => {
      const category = getServiceCategory(service.slug);
      return `
        <article class="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-900/5 transition-all">
          <div class="flex items-start justify-between gap-3">
            <span aria-hidden="true"
              class="flex items-center justify-center w-11 h-11 rounded-xl bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-colors">
              <svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                ${CATEGORY_ICONS[category.icon] || CATEGORY_ICONS.tooth}
              </svg>
            </span>
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${category.label}</span>
          </div>
          <h3 class="mt-4 text-base font-extrabold tracking-tight text-slate-900">${escapeHtml(service.name || "Treatment")}</h3>
          <p class="mt-1.5 text-sm text-slate-600 leading-relaxed flex-grow">${escapeHtml(service.description || "")}</p>
          <div class="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <p>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Starting at</span>
              <span class="block text-lg font-extrabold text-slate-900 tracking-tight">${formatPrice(service.basePricePhp)}</span>
            </p>
            <button type="button"
              class="book-treatment-btn inline-flex items-center gap-1.5 bg-slate-900 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
              Book
            </button>
          </div>
        </article>`;
    })
    .join("");

  status?.classList.add("hidden");
  container.classList.remove("hidden");
}

function renderTreatmentMatrix(services) {
  const tableBody = document.getElementById("treatment-matrix-body");
  if (!tableBody) return;

  if (!services.length) {
    updateMatrixStatus("No matching treatments found.");
    return;
  }

  tableBody.innerHTML = services
    .map((service) => {
      const category = getServiceCategory(service.slug);
      return `
        <tr class="border-b border-slate-100 hover:bg-teal-50/40 transition-colors">
          <td class="py-4 px-6">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-teal-700 mb-0.5">${category.label}</span>
            <span class="font-bold text-slate-800 text-sm">${escapeHtml(service.name || "Treatment")}</span>
          </td>
          <td class="py-4 px-6 text-sm text-slate-600 leading-relaxed max-w-md">${escapeHtml(service.description || "")}</td>
          <td class="py-4 px-6 text-right whitespace-nowrap">
            <span class="font-mono font-black text-slate-900 text-sm bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">${formatPrice(service.basePricePhp)}</span>
          </td>
        </tr>`;
    })
    .join("");
}

function setupMatrixSearch() {
  const searchInput = document.getElementById("treatment-search-input");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = cachedServices.filter((s) =>
      [s.name, s.description, s.slug].some((field) =>
        String(field || "").toLowerCase().includes(query),
      ),
    );
    renderTreatmentMatrix(filtered);
  });
}

function updateMatrixStatus(msg) {
  const tbody = document.getElementById("treatment-matrix-body");
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-500 italic text-sm">${msg}</td></tr>`;
}

// =========================================================================
// 🦷 CLINIC DENTISTS
// =========================================================================
async function loadClinicDentists(clinicId) {
  const container = document.getElementById("dentists-container");
  if (!container) return;

  if (!clinicId) {
    container.innerHTML = `
      <p class="col-span-full text-center text-sm text-slate-400 py-8">
        No clinic selected to load dentist profiles.
      </p>`;
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/staff/public/dentists?clinicId=${clinicId}`,
      { headers: { "X-Clinic-ID": clinicId } },
    );
    const data = await response.json();

    if (!data.success || !data.dentists || data.dentists.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-8">
          <p class="text-sm text-slate-400 font-medium">Dentist profiles will appear here soon.</p>
        </div>`;
      return;
    }

    container.innerHTML = data.dentists
      .map((dentist) => {
        const imageUrl =
          dentist.profileImage && dentist.profileImage !== "default-avatar.png"
            ? `${API_BASE_URL}/uploads/${dentist.profileImage}`
            : `${API_BASE_URL}/uploads/default-avatar.png`;

        return `
          <article class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:shadow-teal-900/5 hover:border-teal-300 transition-all duration-300 flex flex-col group">
            <div class="relative h-44 bg-gradient-to-br from-teal-50 to-emerald-50">
              <img
                src="${imageUrl}"
                alt="Dr. ${escapeHtml(dentist.fullName)}"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-cover"
                onerror="this.onerror=null;this.closest('div').innerHTML='<div class=\\'w-full h-full flex items-center justify-center\\'><span class=\\'text-5xl font-extrabold text-teal-300\\'>${escapeHtml((dentist.fullName || "D")[0].toUpperCase())}</span></div>';"
              />
              <span class="absolute bottom-3 left-3 inline-block px-2.5 py-1 rounded-full bg-white/95 backdrop-blur text-teal-800 text-[10px] font-bold tracking-wider uppercase shadow-sm">
                ${escapeHtml(dentist.specialization || "General Dentistry")}
              </span>
            </div>
            <div class="p-5 flex flex-col flex-grow">
              <h3 class="text-lg font-extrabold tracking-tight text-slate-900">Dr. ${escapeHtml(dentist.fullName)}</h3>
              <p class="text-xs text-slate-500 leading-relaxed mt-2 line-clamp-2 flex-grow">
                ${escapeHtml(dentist.bio || "Dedicated to providing exceptional dental care and creating beautiful smiles.")}
              </p>
              <div class="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600">
                <span class="flex items-center gap-1.5 font-bold text-slate-800">
                  <svg class="w-4 h-4 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                  </svg>
                  ${dentist.experienceYears || 0}+ yrs
                </span>
                <span class="text-slate-300">·</span>
                <span class="text-slate-500 truncate" title="${escapeHtml(dentist.licenseNumber || "")}">
                  Lic. ${escapeHtml(dentist.licenseNumber || "N/A")}
                </span>
              </div>
              <button type="button"
                class="dentist-book-btn mt-4 w-full bg-slate-900 hover:bg-teal-700 text-white text-sm font-bold py-3 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
                Book a consultation
              </button>
            </div>
          </article>`;
      })
      .join("");

    container.querySelectorAll(".dentist-book-btn").forEach((btn) => {
      btn.addEventListener("click", goToBooking);
    });

    // Hydrate the "years of experience" stat from real dentist data.
    const totalYears = data.dentists.reduce(
      (sum, d) => sum + (Number(d.experienceYears) || 0),
      0,
    );
    if (totalYears > 0) updateDOMText("stat-years", `${totalYears}+`);
  } catch (error) {
    console.error("Clinic dentist directory request failed", error);
    container.innerHTML = `
      <div class="col-span-full text-center py-8">
        <p class="text-sm text-rose-700 font-medium" role="alert">We couldn't load provider profiles right now.</p>
        <button type="button" id="retry-dentists"
          class="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-700">Try again</button>
      </div>`;
    document.getElementById("retry-dentists")?.addEventListener("click", () =>
      loadClinicDentists(clinicId),
    );
  }
}

// =========================================================================
// ⭐ PATIENT TESTIMONIALS
// =========================================================================
function normalizeRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 1 && rating <= 5
    ? Math.round(rating)
    : null;
}

function getSafePatientLabel(testimonial) {
  if (testimonial?.anonymous === true || testimonial?.isAnonymous === true) {
    return "Anonymous patient";
  }

  const firstName = String(
    testimonial?.patientFirstName ||
      testimonial?.firstName ||
      testimonial?.patient?.firstName ||
      "",
  ).trim();
  const lastName = String(
    testimonial?.patientLastNameInitial ||
      testimonial?.lastName ||
      testimonial?.patient?.lastName ||
      "",
  ).trim();

  if (firstName) {
    return lastName ? `${firstName} ${lastName.charAt(0).toUpperCase()}.` : firstName;
  }
  return "Anonymous patient";
}

function getReviewText(testimonial) {
  return String(
    testimonial?.reviewText ||
      testimonial?.review ||
      testimonial?.comment ||
      "",
  ).trim();
}

function formatReviewDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

function createStars(rating, labelPrefix = "Rating") {
  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center gap-0.5";
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", `${labelPrefix}: ${rating} out of 5 stars`);

  for (let index = 1; index <= 5; index += 1) {
    const star = document.createElement("span");
    star.className = index <= rating ? "text-amber-400" : "text-slate-300";
    star.setAttribute("aria-hidden", "true");
    star.textContent = index <= rating ? "★" : "☆";
    wrapper.appendChild(star);
  }

  const numericRating = document.createElement("span");
  numericRating.className = "sr-only";
  numericRating.textContent = `${rating} out of 5 stars`;
  wrapper.appendChild(numericRating);
  return wrapper;
}

function createTestimonialCard(testimonial) {
  const article = document.createElement("article");
  article.className =
    "h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg hover:shadow-teal-900/5 hover:border-teal-300 transition-all flex flex-col gap-4";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-3";

  const identity = document.createElement("div");
  const name = document.createElement("h3");
  name.className = "text-sm font-extrabold text-slate-900";
  name.textContent = getSafePatientLabel(testimonial);
  identity.appendChild(name);

  if (testimonial?.verified === true || testimonial?.isVerifiedPatient === true) {
    const verified = document.createElement("p");
    verified.className = "mt-1 text-[11px] font-bold uppercase tracking-wide text-teal-700";
    verified.textContent = "✓ Verified patient";
    identity.appendChild(verified);
  }

  header.append(identity, createStars(testimonial.normalizedRating));

  const review = document.createElement("blockquote");
  review.className = "text-sm leading-6 text-slate-600 flex-grow";
  review.textContent = `“${getReviewText(testimonial)}”`;

  article.append(header, review);

  const dateLabel = formatReviewDate(
    testimonial?.reviewDate || testimonial?.createdAt || testimonial?.date,
  );
  if (dateLabel) {
    const time = document.createElement("time");
    time.className = "text-xs font-semibold text-slate-400";
    time.textContent = dateLabel;
    article.appendChild(time);
  }

  return article;
}

function hydrateRatingUI(average, count) {
  const rounded = Number(average).toFixed(1);
  updateDOMText("hero-rating-value", rounded);
  updateDOMText("hero-rating-count", rounded);
  updateDOMText("hero-review-count", `${count} ${count === 1 ? "review" : "reviews"}`);
  updateDOMText("stat-rating", rounded);
}

function updateTestimonialSummary(testimonials) {
  const averageElement = document.getElementById("testimonials-average");
  const starsElement = document.getElementById("testimonials-stars");
  const countElement = document.getElementById("testimonials-count");
  if (!averageElement || !starsElement || !countElement) return;

  const applyStats = (averageRating, totalCount) => {
    if (!totalCount || totalCount <= 0) {
      averageElement.textContent = "—";
      starsElement.replaceChildren();
      starsElement.setAttribute("aria-label", "Average rating not yet available");
      countElement.textContent = "No approved reviews yet";
      return;
    }
    const displayedAverage = Number(averageRating).toFixed(1);
    averageElement.textContent = displayedAverage;
    starsElement.replaceChildren(
      createStars(Math.round(Number(averageRating)), "Average rating"),
    );
    starsElement.setAttribute(
      "aria-label",
      `Average rating: ${displayedAverage} out of 5 from ${totalCount} reviews`,
    );
    countElement.textContent = `${totalCount} approved ${totalCount === 1 ? "review" : "reviews"}`;
    hydrateRatingUI(averageRating, totalCount);
  };

  if (testimonials?.isStats) {
    applyStats(testimonials.averageRating, testimonials.totalCount);
    return;
  }

  if (!testimonials.length) {
    applyStats(0, 0);
    return;
  }

  const preciseAverage =
    testimonials.reduce((sum, item) => sum + item.normalizedRating, 0) /
    testimonials.length;
  applyStats(preciseAverage, testimonials.length);
}

function showTestimonialStatus(message, isError = false) {
  const status = document.getElementById("testimonials-status");
  const grid = document.getElementById("testimonials-grid");
  if (!status || !grid) return;

  grid.classList.add("hidden");
  status.className = `rounded-2xl border p-8 text-center ${
    isError
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-500"
  }`;
  status.replaceChildren();
  const text = document.createElement("p");
  text.className = "text-sm font-semibold leading-relaxed";
  text.textContent = message;
  status.appendChild(text);
  status.classList.remove("hidden");
}

function renderTestimonials(limit = INITIAL_TESTIMONIAL_COUNT) {
  const status = document.getElementById("testimonials-status");
  const grid = document.getElementById("testimonials-grid");
  const readAllButton = document.getElementById("read-all-reviews-btn");
  if (!status || !grid || !readAllButton) return;

  grid.replaceChildren(
    ...cachedTestimonials.slice(0, limit).map(createTestimonialCard),
  );
  status.classList.add("hidden");
  grid.classList.remove("hidden");

  const hasHiddenReviews = cachedTestimonials.length > limit;
  readAllButton.classList.toggle("hidden", !hasHiddenReviews);
  readAllButton.setAttribute("aria-expanded", String(!hasHiddenReviews));
}

async function loadClinicTestimonials(clinicId) {
  document.getElementById("share-experience-btn")?.classList.remove("hidden");

  if (!clinicId || ["null", "undefined"].includes(String(clinicId).toLowerCase())) {
    updateTestimonialSummary([]);
    showTestimonialStatus(
      "Approved patient experiences are not available for this clinic yet.",
    );
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/clinics/${encodeURIComponent(clinicId)}/testimonials`,
      { headers: { Accept: "application/json", "x-clinic-id": clinicId } },
    );

    if (response.status === 404) {
      updateTestimonialSummary([]);
      showTestimonialStatus(
        "Approved patient experiences will appear here when available.",
      );
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    const source = Array.isArray(result)
      ? result
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.testimonials)
          ? result.testimonials
          : [];

    cachedTestimonials = source
      .filter((item) => {
        const status = String(item?.status || "").toLowerCase();
        return (
          (!status || status === "approved" || status === "published") &&
          normalizeRating(item?.rating) !== null &&
          getReviewText(item).length > 0
        );
      })
      .map((item) => ({ ...item, normalizedRating: normalizeRating(item.rating) }));

    const stats = await fetchTestimonialStats(clinicId);
    updateTestimonialSummary(stats || cachedTestimonials);

    if (cachedTestimonials.length === 0) {
      showTestimonialStatus(
        "No approved patient experiences have been published yet.",
      );
      return;
    }
    renderTestimonials();
  } catch (error) {
    console.error("Unable to load patient testimonials:", error);
    updateTestimonialSummary([]);
    showTestimonialStatus(
      "Patient experiences could not be loaded right now. Please try again later.",
      true,
    );
  }
}

async function fetchTestimonialStats(clinicId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/clinics/${encodeURIComponent(clinicId)}/testimonials/stats`,
      { headers: { Accept: "application/json", "x-clinic-id": clinicId } },
    );
    if (!response.ok) return null;
    const result = await response.json();
    const stats = result?.data || result;
    const { average, count } = stats || {};
    if (average == null || count == null) return null;
    return {
      averageRating: Number(average),
      totalCount: Number(count),
      isStats: true,
    };
  } catch {
    return null;
  }
}

function bindTestimonialActions() {
  const readAllButton = document.getElementById("read-all-reviews-btn");
  const shareButton = document.getElementById("share-experience-btn");

  readAllButton?.addEventListener("click", () => {
    renderTestimonials(cachedTestimonials.length);
    readAllButton.classList.add("hidden");
  });

  shareButton?.addEventListener("click", () => {
    const token = localStorage.getItem("token");
    if (token) {
      window.location.href = `/patientDashboard.html?clinic=${encodeURIComponent(CLINIC_SLUG || "")}#reviews`;
      return;
    }
    openModal("login-modal");
    document.getElementById("login-email")?.focus();
  });
}

// =========================================================================
// 🔐 AUTH & BOOKING
// =========================================================================
function getCurrentPatient() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const userData = JSON.parse(localStorage.getItem("user") || "null");
  if (!userData || String(userData.role || "").toUpperCase() !== "PATIENT") {
    return null;
  }
  return userData;
}

function goToBooking() {
  const patient = getCurrentPatient();
  if (patient) {
    window.location.href = `/patientDashboard.html?clinic=${encodeURIComponent(CLINIC_SLUG)}`;
    return;
  }
  // Not signed in — keep the visitor on this page and open sign in right here.
  // (Signing in redirects to the patient dashboard where they can book.)
  openModal("login-modal");
}

function setupDynamicAuthControls() {
  const patient = getCurrentPatient();
  const navContainer = document.getElementById("nav-auth-container");
  const mobileContainer = document.getElementById("mobile-auth-container");

  if (patient) {
    const displayName = patient.firstName || "Patient";
    if (navContainer) {
      navContainer.innerHTML = `
        <a href="/patientDashboard.html?clinic=${encodeURIComponent(CLINIC_SLUG)}"
          class="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-teal-700 transition-colors">
          <span class="hidden xl:inline">Hi, ${escapeHtml(displayName)}</span>
          <span class="bg-slate-100 hover:bg-teal-50 px-3.5 py-2 rounded-xl transition-colors">Dashboard</span>
        </a>`;
    }
    if (mobileContainer) {
      mobileContainer.innerHTML = `
        <a href="/patientDashboard.html?clinic=${encodeURIComponent(CLINIC_SLUG)}"
          class="block text-center px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold transition-colors">
          Go to my dashboard
        </a>`;
    }
    return;
  }

  if (navContainer) {
    navContainer.innerHTML = `
      <button type="button" id="nav-signin-btn"
        class="text-sm font-bold text-slate-700 hover:text-teal-700 transition-colors cursor-pointer bg-transparent border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded-lg px-2 py-1.5">
        Sign in
      </button>`;
    document.getElementById("nav-signin-btn")?.addEventListener("click", () => {
      openModal("login-modal");
    });
  }
  if (mobileContainer) {
    mobileContainer.innerHTML = `
      <button type="button" id="mobile-signin-btn"
        class="block w-full text-center px-4 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold transition-colors hover:border-teal-300 cursor-pointer bg-transparent">
        Sign in to my account
      </button>`;
    document.getElementById("mobile-signin-btn")?.addEventListener("click", () => {
      closeMobileMenu();
      openModal("login-modal");
    });
  }
}

function bindActionButtons() {
  bindTestimonialActions();

  document.querySelectorAll(".book-treatment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeMobileMenu();
      goToBooking();
    });
  });
}

// =========================================================================
// 🪟 MODAL CONTROLLER (focus management + Escape + backdrop)
// =========================================================================
let lastFocusedElement = null;

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  lastFocusedElement = document.activeElement;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // Move focus into the dialog (first field, or the dialog itself).
  const focusTarget = modal.querySelector("input, select, textarea, button");
  (focusTarget || modal).focus?.();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.add("hidden");
  const loginHidden = document
    .getElementById("login-modal")
    ?.classList.contains("hidden");
  const registerHidden = document
    .getElementById("register-modal")
    ?.classList.contains("hidden");
  if (loginHidden && registerHidden) {
    document.body.classList.remove("overflow-hidden");
  }
  lastFocusedElement?.focus?.();
}

function setupModals() {
  const loginModal = document.getElementById("login-modal");
  const registerModal = document.getElementById("register-modal");

  const swap = (from, to) => {
    closeModal(from);
    openModal(to);
  };

  document.getElementById("open-register-btn")?.addEventListener("click", () =>
    swap("login-modal", "register-modal"),
  );
  document.getElementById("switch-to-login-btn")?.addEventListener("click", () =>
    swap("register-modal", "login-modal"),
  );
  document.getElementById("close-login-btn")?.addEventListener("click", () =>
    closeModal("login-modal"),
  );
  document.getElementById("close-register-btn")?.addEventListener("click", () =>
    closeModal("register-modal"),
  );

  [loginModal, registerModal].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (loginModal && !loginModal.classList.contains("hidden")) {
      closeModal("login-modal");
    } else if (registerModal && !registerModal.classList.contains("hidden")) {
      closeModal("register-modal");
    } else {
      closeMobileMenu();
    }
  });
}

// =========================================================================
// 📱 MOBILE NAVIGATION
// =========================================================================
function closeMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  const btn = document.getElementById("mobile-menu-btn");
  if (!menu?.classList.contains("hidden")) {
    menu?.classList.add("hidden");
  }
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Open navigation menu");
  }
  document.getElementById("menu-open-icon")?.classList.remove("hidden");
  document.getElementById("menu-close-icon")?.classList.add("hidden");
}

function setupMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  const btn = document.getElementById("mobile-menu-btn");
  if (!menu || !btn) return;

  btn.addEventListener("click", () => {
    const isOpen = !menu.classList.contains("hidden");
    if (isOpen) {
      closeMobileMenu();
      return;
    }
    menu.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "Close navigation menu");
    document.getElementById("menu-open-icon")?.classList.add("hidden");
    document.getElementById("menu-close-icon")?.classList.remove("hidden");
  });

  document.querySelectorAll(".mobile-nav-link").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });
}

// =========================================================================
// ⚡ REAL-TIME TESTIMONIAL UPDATES
// =========================================================================
function setupTestimonialLiveUpdates(clinicId) {
  if (
    !clinicId ||
    ["null", "undefined"].includes(String(clinicId).toLowerCase()) ||
    typeof io === "undefined"
  ) {
    return;
  }

  let reconnectTimer = null;
  const socket = io(API_BASE_URL, {
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1500,
  });

  socket.on("connect", () => {
    socket.emit("join_clinic_room", clinicId);
  });

  const refresh = () => {
    loadClinicTestimonials(clinicId);
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.on("testimonial:new", refresh);
}

// =========================================================================
// 🛠 HELPERS
// =========================================================================
async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Request failed:", url, error.message);
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function updateDOMText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showHomepageError(msg) {
  const banner = document.getElementById("homepage-error-banner");
  if (banner) {
    banner.textContent = msg;
    banner.classList.remove("hidden");
  }
}

// =========================================================================
// 📡 LIVE PREVIEW — admin dashboard pushes draft config via postMessage
// =========================================================================
window.addEventListener("message", (event) => {
  if (event.data?.type !== "landing-preview-update") return;
  const draft = event.data.draft;
  if (!draft || typeof draft !== "object") return;

  // Normalize the preview payload to the same shape used by the published
  // config, then apply it via the shared renderer.
  const landing = {
    primaryColor: draft.primaryColor || "",
    secondaryColor: draft.secondaryColor || "",
    typography: draft.typography || "default",
    logoUrl: draft.logoUrl || "",
    tagline: draft.tagline || "",
    description: draft.description || "",
    heroEyebrow: draft.heroEyebrow || "",
    sectionTexts: draft.sectionTexts || {},
    socialLinks: Array.isArray(draft.socialLinks) ? draft.socialLinks : [],
    blocks: Array.isArray(draft.blocks) ? draft.blocks : [],
    hiddenSections: Array.isArray(draft.hiddenSections)
      ? draft.hiddenSections
      : [],
    sectionOrder: Array.isArray(draft.sectionOrder)
      ? draft.sectionOrder
      : [],
  };

  applyLandingContent(landing);
  showPreviewBanner();
});
