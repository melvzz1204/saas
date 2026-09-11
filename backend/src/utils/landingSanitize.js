// src/utils/landingSanitize.js
// Shared sanitization for the self-service landing page editor. Kept in its own
// module so it can be unit-tested without pulling in the router, and so the
// dashboard routes and any future admin routes share a single source of truth.

import {
  LANDING_TEMPLATES,
  DEFAULT_TEMPLATE,
  isValidTemplate,
  sectionsForTemplate,
  presetsForTemplate,
} from "./landingTemplates.js";

export const ALLOWED_SECTIONS = [
  "services",
  "dentists",
  "testimonials",
  "visit",
  "pricing",
];

export const ORDERABLE_SECTIONS = [
  "custom",
  ...ALLOWED_SECTIONS,
];

export const BLOCK_BACKGROUNDS = ["none", "muted", "brand"];
export const BLOCK_ALIGNMENTS = ["left", "center"];

export const SECTION_TEXT_KEYS = [
  "services",
  "dentists",
  "testimonials",
  "visit",
  "pricing",
];
export const TYPOGRAPHY_CHOICES = ["default", "clean", "elegant", "rounded"];
export const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "twitter",
  "linkedin",
  "website",
];

// Curated landing page presets. Each preset bundles colors, typography,
// section text defaults, section order, and pre-populated content blocks.
export const LANDING_PRESETS = {
  "clean-clinical": {
    name: "Clean & Clinical",
    primaryColor: "#0f766e",
    secondaryColor: "#14b8a6",
    headerBackground: "#ffffff",
    footerBackground: "#0f172a",
    typography: "clean",
    tagline: "Gentle, modern dentistry for every smile",
    heroEyebrow: "Welcome to",
    sectionOrder: ["custom", "services", "dentists", "testimonials", "visit", "pricing"],
    hiddenSections: [],
    sectionTexts: {
      services: { eyebrow: "Our Services", heading: "Comprehensive Dental Care", intro: "From routine checkups to advanced treatments, we offer a full range of dental services tailored to your needs." },
      dentists: { eyebrow: "Meet Our Dentists", heading: "Expert Team, Personalized Care", intro: "Our experienced dentists are dedicated to providing you with the highest standard of care in a comfortable environment." },
      testimonials: { eyebrow: "Patient Reviews", heading: "What Our Patients Say", intro: "See what our patients have to say about their experience at our clinic." },
      visit: { eyebrow: "Visit Us", heading: "We're Here to Help", intro: "Located in the heart of the community, our clinic is easy to reach and always welcoming." },
      pricing: { eyebrow: "Pricing", heading: "Transparent Pricing", intro: "We believe in clear, honest pricing so you can focus on your dental health." },
    },
    blocks: [
      { type: "text", heading: "Why Choose Us?", body: "With years of experience and a passion for dental excellence, we combine the latest technology with a compassionate approach to ensure your comfort at every visit.", background: "muted", align: "left" },
    ],
  },
  "warm-family": {
    name: "Warm & Family",
    primaryColor: "#ea580c",
    secondaryColor: "#f59e0b",
    headerBackground: "#fff7ed",
    footerBackground: "#1c1917",
    typography: "rounded",
    tagline: "Caring for your family's smiles",
    heroEyebrow: "A Family Affair",
    sectionOrder: ["custom", "services", "dentists", "testimonials", "visit", "pricing"],
    hiddenSections: [],
    sectionTexts: {
      services: { eyebrow: "Family Dental Services", heading: "Dental Care for Every Age", intro: "From your child's first visit to grandparent's dentures, we provide gentle care the whole family can trust." },
      dentists: { eyebrow: "Meet Our Dentists", heading: "Friendly Faces, Skilled Hands", intro: "Our dentists love working with families and make every visit a positive experience for kids and adults alike." },
      testimonials: { eyebrow: "Happy Families", heading: "Real Families, Real Smiles", intro: "Hear from families who trust us with their dental health." },
      visit: { eyebrow: "Visit Us", heading: "Your Family's Second Home", intro: "We designed our clinic to feel warm and welcoming for the whole family." },
      pricing: { eyebrow: "Pricing", heading: "Fair & Friendly Prices", intro: "We offer flexible payment options so quality dental care is always within reach." },
    },
    blocks: [
      { type: "text", heading: "A Place Where Families Thrive", body: "Our clinic is designed to make dental visits fun and stress-free. With games, kid-friendly decor, and gentle techniques, even the littlest patients look forward to their appointments.", background: "brand", align: "center" },
    ],
  },
  "luxury-elegant": {
    name: "Luxury & Elegant",
    primaryColor: "#1e3a5f",
    secondaryColor: "#d4a843",
    headerBackground: "#f8fafc",
    footerBackground: "#0f172a",
    typography: "elegant",
    tagline: "Premium dental care, crafted with precision",
    heroEyebrow: "Excellence in Dentistry",
    sectionOrder: ["custom", "services", "dentists", "testimonials", "visit", "pricing"],
    hiddenSections: [],
    sectionTexts: {
      services: { eyebrow: "Premium Services", heading: "Artistry Meets Science", intro: "Experience dental care that transcends the ordinary. Our advanced treatments deliver results that are as beautiful as they are healthy." },
      dentists: { eyebrow: "Our Dentists", heading: "Master Clinicians", intro: "Board-certified specialists with decades of experience in cosmetic, restorative, and implant dentistry." },
      testimonials: { eyebrow: "Testimonials", heading: "Words from Discerning Patients", intro: "Our patients choose us for our unparalleled attention to detail and transformative results." },
      visit: { eyebrow: "Visit Us", heading: "Where Luxury Meets Comfort", intro: "Our boutique clinic offers a serene environment designed for your relaxation and peace of mind." },
      pricing: { eyebrow: "Pricing", heading: "Investment in Your Smile", intro: "We provide detailed treatment plans with transparent pricing so you can make informed decisions." },
    },
    blocks: [
      { type: "text", heading: "Redefining the Standard of Care", body: "Every detail matters. From the finest materials to the most advanced techniques, we create smiles that inspire confidence for a lifetime.", background: "muted", align: "left" },
    ],
  },
  "bright-energetic": {
    name: "Bright & Energetic",
    primaryColor: "#e11d48",
    secondaryColor: "#06b6d4",
    headerBackground: "#fef2f2",
    footerBackground: "#1e1b4b",
    typography: "rounded",
    tagline: "Big smiles start here",
    heroEyebrow: "Welcome!",
    sectionOrder: ["custom", "services", "dentists", "testimonials", "visit", "pricing"],
    hiddenSections: [],
    sectionTexts: {
      services: { eyebrow: "Services", heading: "Dental Care That Pops", intro: "From whitening to braces, we offer treatments that keep your smile bright and your confidence high." },
      dentists: { eyebrow: "Meet the Team", heading: "Fun & Friendly Dentists", intro: "We believe dental visits should be exciting. Our team brings energy and expertise to every appointment." },
      testimonials: { eyebrow: "Reviews", heading: "Patient Love", intro: "Our patients can't stop smiling about their results. See what they have to say!" },
      visit: { eyebrow: "Visit Us", heading: "Let's Get Started", intro: "Ready for a brighter smile? Book your appointment today and feel the difference." },
      pricing: { eyebrow: "Pricing", heading: "No Surprises", intro: "Clear pricing with no hidden fees. We make it easy to get the smile you've always wanted." },
    },
    blocks: [
      { type: "text", heading: "Your Brightest Smile Starts Today", body: "We're passionate about giving you the smile you've always wanted. With modern techniques and a fun atmosphere, the dentist's office has never felt better.", background: "brand", align: "center" },
    ],
  },
  "minimal-pure": {
    name: "Minimal & Pure",
    primaryColor: "#334155",
    secondaryColor: "#94a3b8",
    headerBackground: "#ffffff",
    footerBackground: "#f1f5f9",
    typography: "clean",
    tagline: "Precision. Clarity. Care.",
    heroEyebrow: "Modern Dentistry",
    sectionOrder: ["custom", "services", "dentists", "testimonials", "visit", "pricing"],
    hiddenSections: [],
    sectionTexts: {
      services: { eyebrow: "Services", heading: "Essential Dental Care", intro: "We focus on what matters: thorough exams, precise treatments, and preventive care that keeps your teeth healthy for life." },
      dentists: { eyebrow: "Our Dentists", heading: "Skilled & Dedicated", intro: "Our team brings years of experience and a commitment to excellence to every patient interaction." },
      testimonials: { eyebrow: "Reviews", heading: "Patient Feedback", intro: "See why patients trust us for their dental needs." },
      visit: { eyebrow: "Visit Us", heading: "Find Us", intro: "Conveniently located with ample parking, our clinic makes visiting easy." },
      pricing: { eyebrow: "Pricing", heading: "Transparent Pricing", intro: "Clear, straightforward pricing with no surprises. We believe in honest communication." },
    },
    blocks: [
      { type: "text", heading: "Simplicity in Practice", body: "We strip away the unnecessary and focus on what truly matters: excellent dental care delivered with clarity and care.", background: "none", align: "left" },
    ],
  },
};

export const PRESET_NAMES = Object.keys(LANDING_PRESETS);
export const DEFAULT_PRESET = "clean-clinical";

export const LIMITS = {
  maxBlocks: 12,
  tagline: 160,
  description: 600,
  heroEyebrow: 120,
  sectionEyebrow: 120,
  sectionHeading: 160,
  sectionIntro: 300,
  heading: 120,
  body: 1500,
  maxSocialLinks: 5,
  socialUrl: 300,
};

export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const SAFE_URL = /^(\/uploads\/|https?:\/\/)/i;
export const HTTP_URL = /^https?:\/\/\S+$/i;

// A single text field group (eyebrow / heading / intro) per section.
export function emptySectionText() {
  return { eyebrow: "", heading: "", intro: "" };
}

export function defaultSectionTexts() {
  const texts = {};
  SECTION_TEXT_KEYS.forEach((key) => {
    texts[key] = emptySectionText();
  });
  return texts;
}

export function sanitizeSectionText(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    eyebrow: String(value.eyebrow || "").trim().slice(0, LIMITS.sectionEyebrow),
    heading: String(value.heading || "").trim().slice(0, LIMITS.sectionHeading),
    intro: String(value.intro || "").trim().slice(0, LIMITS.sectionIntro),
  };
}

// Normalize and validate a landing config payload.
// Returns { value } on success or { error } with a human-readable message.
export function sanitizeLanding(input) {
  if (!input || typeof input !== "object") return { error: "Invalid payload." };

  // Resolve the layout template first — preset and section validity depend on it.
  const template = isValidTemplate(input.template) ? String(input.template) : DEFAULT_TEMPLATE;

  // Validate the preset name if provided, and ensure it is compatible with the
  // chosen template. An unknown or incompatible preset falls back to "" (Custom),
  // which never wipes the clinic's colors/text — it just clears the "preset" tag.
  const allowedPresets = presetsForTemplate(template, PRESET_NAMES);
  const requestedPreset =
    input.preset && PRESET_NAMES.includes(String(input.preset)) ? String(input.preset) : "";
  const preset = requestedPreset && allowedPresets.includes(requestedPreset) ? requestedPreset : "";

  const primaryColor = String(input.primaryColor || "").trim();
  if (primaryColor && !HEX_COLOR.test(primaryColor)) {
    return { error: "Primary color must be a hex value like #0f766e." };
  }

  const secondaryColor = String(input.secondaryColor || "").trim();
  if (secondaryColor && !HEX_COLOR.test(secondaryColor)) {
    return { error: "Secondary color must be a hex value like #0f766e." };
  }

  const headerBackground = String(input.headerBackground || "").trim();
  if (headerBackground && !HEX_COLOR.test(headerBackground)) {
    return { error: "Header background must be a hex value like #ffffff." };
  }

  const footerBackground = String(input.footerBackground || "").trim();
  if (footerBackground && !HEX_COLOR.test(footerBackground)) {
    return { error: "Footer background must be a hex value like #0f172a." };
  }

  const typography = TYPOGRAPHY_CHOICES.includes(input.typography)
    ? input.typography
    : "default";

  const logoUrl = String(input.logoUrl || "").trim();
  if (logoUrl && !SAFE_URL.test(logoUrl)) {
    return { error: "Logo URL is not allowed." };
  }

  const tagline = String(input.tagline || "").trim().slice(0, LIMITS.tagline);
  const description = String(input.description || "").trim().slice(0, LIMITS.description);
  const heroEyebrow = String(input.heroEyebrow || "").trim().slice(0, LIMITS.heroEyebrow);

  // Section text (eyebrow / heading / intro) — known keys only.
  const rawSectionTexts = input.sectionTexts || {};
  const sectionTexts = defaultSectionTexts();
  SECTION_TEXT_KEYS.forEach((key) => {
    if (rawSectionTexts[key] && typeof rawSectionTexts[key] === "object") {
      sectionTexts[key] = sanitizeSectionText(rawSectionTexts[key]);
    }
  });

  // Social links — at most LIMITS.maxSocialLinks, https(s) URLs only. Entries
  // with a blank URL are dropped (the dashboard treats blank = not yet set).
  const socialLinks = [];
  if (Array.isArray(input.socialLinks)) {
    const filled = input.socialLinks.filter((link) => String(link?.url || "").trim().length > 0);
    if (filled.length > LIMITS.maxSocialLinks) {
      return {
        error: `A landing page can have at most ${LIMITS.maxSocialLinks} social links.`,
      };
    }
    for (const link of filled) {
      const platform = link?.platform;
      const url = String(link?.url || "").trim();
      if (!SOCIAL_PLATFORMS.includes(platform) || !HTTP_URL.test(url)) {
        return {
          error: "Social links must use a supported platform and a valid http(s) URL.",
        };
      }
      socialLinks.push({
        platform,
        url: url.slice(0, LIMITS.socialUrl),
      });
    }
  }

  const rawBlocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (rawBlocks.length > LIMITS.maxBlocks) {
    return {
      error: `A landing page can have at most ${LIMITS.maxBlocks} content blocks.`,
    };
  }
  const blocks = [];
  for (const b of rawBlocks) {
    const type = b && b.type === "image" ? "image" : "text";
    const imageUrl = String(b?.imageUrl || "").trim();
    if (imageUrl && !SAFE_URL.test(imageUrl)) {
      return { error: "A block image URL is not allowed." };
    }
    blocks.push({
      type,
      heading: String(b?.heading || "").trim().slice(0, LIMITS.heading),
      body: String(b?.body || "").trim().slice(0, LIMITS.body),
      imageUrl,
      background: BLOCK_BACKGROUNDS.includes(b?.background) ? b.background : "none",
      align: BLOCK_ALIGNMENTS.includes(b?.align) ? b.align : "left",
    });
  }

  // Sections available for THIS template. "custom" (content blocks) is always
  // orderable. Hidden/ordered sections are constrained to what the layout supports.
  const templateSections = sectionsForTemplate(template);
  const templateHideable = new Set(templateSections);
  const templateOrderable = new Set(["custom", ...templateSections]);

  const hiddenSections = [];
  {
    const hiddenSeen = new Set();
    if (Array.isArray(input.hiddenSections)) {
      for (const s of input.hiddenSections) {
        if (templateHideable.has(s) && !hiddenSeen.has(s)) {
          hiddenSeen.add(s);
          hiddenSections.push(s);
        }
      }
    }
  }

  // Section order: keep only keys the template supports, de-duplicated, preserving order.
  const seen = new Set();
  const sectionOrder = (Array.isArray(input.sectionOrder) ? input.sectionOrder : [])
    .filter((s) => templateOrderable.has(s) && !seen.has(s) && seen.add(s));

  return {
    value: {
      template,
      preset,
      logoUrl,
      primaryColor,
      secondaryColor,
      headerBackground,
      footerBackground,
      typography,
      tagline,
      description,
      heroEyebrow,
      sectionTexts,
      socialLinks,
      blocks,
      hiddenSections,
      sectionOrder,
    },
  };
}