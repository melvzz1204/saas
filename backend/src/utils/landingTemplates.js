// src/utils/landingTemplates.js
// Registry of selectable landing-page LAYOUTS ("templates"). This is the layer
// ABOVE presets: a template defines the whole page a clinic gets (structure,
// hero style, section framing), while a preset (see landingSanitize.js) themes
// it (colors, fonts, copy). A clinic first picks a template, then a preset.
//
// Templates are developer-defined in code. This is intentionally a LEAF module:
// it must NOT import from landingSanitize.js. landingSanitize.js imports FROM
// here, so keeping this dependency-free avoids a circular import (which, with
// ESM const bindings, would throw a temporal-dead-zone ReferenceError).
//
// The list of core sections below mirrors ALLOWED_SECTIONS in landingSanitize.js.
// It is duplicated here (rather than imported) to keep this a leaf module; the
// tests/landingTemplates.test.js suite cross-checks that the two stay in sync.

const CORE_SECTIONS = ["services", "dentists", "testimonials", "visit", "pricing"];

// `file` is the frontend template document the public loader (clinicHomePage.html)
// resolves to for this layout. `presets: "*"` means every registered preset is
// compatible with the layout (presets are theme-only, so this is the norm).
export const LANDING_TEMPLATES = {
  classic: {
    id: "classic",
    name: "Classic",
    description:
      "A timeless, trust-first layout: centered hero, service cards, and clearly separated sections. A dependable all-rounder for any clinic.",
    thumbnail: "/clinic-templates/thumbnails/classic.svg",
    file: "clinic-templates/classic.html",
    supportedSections: [...CORE_SECTIONS],
    defaultSectionOrder: ["custom", "services", "dentists", "testimonials", "visit", "pricing"],
    presets: "*",
    defaultPreset: "clean-clinical",
  },
  split: {
    id: "split",
    name: "Split Hero",
    description:
      "A bold two-column hero with a booking panel, followed by alternating full-width sections. Modern and conversion-focused.",
    thumbnail: "/clinic-templates/thumbnails/split.svg",
    file: "clinic-templates/split.html",
    supportedSections: [...CORE_SECTIONS],
    defaultSectionOrder: ["custom", "services", "dentists", "testimonials", "pricing", "visit"],
    presets: "*",
    defaultPreset: "luxury-elegant",
  },
  scroll: {
    id: "scroll",
    name: "Single Scroll",
    description:
      "A single-page storytelling scroll with large stacked sections and a sticky booking bar. Friendly, immersive, and mobile-first.",
    thumbnail: "/clinic-templates/thumbnails/scroll.svg",
    file: "clinic-templates/scroll.html",
    supportedSections: [...CORE_SECTIONS],
    defaultSectionOrder: ["custom", "services", "testimonials", "dentists", "visit", "pricing"],
    presets: "*",
    defaultPreset: "bright-energetic",
  },
};

export const TEMPLATE_NAMES = Object.keys(LANDING_TEMPLATES);
export const DEFAULT_TEMPLATE = "classic";

export function getTemplate(id) {
  return LANDING_TEMPLATES[id] || null;
}

export function isValidTemplate(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(LANDING_TEMPLATES, id);
}

// Sections a given template supports. Falls back to the default template for an
// unknown id so callers always get a usable list.
export function sectionsForTemplate(id) {
  const tmpl = LANDING_TEMPLATES[id] || LANDING_TEMPLATES[DEFAULT_TEMPLATE];
  return [...tmpl.supportedSections];
}

// Presets compatible with a template. `allPresetNames` is supplied by the caller
// (landingSanitize) so this module stays dependency-free; "*" expands to every
// known preset, and an explicit array is filtered down to known presets.
export function presetsForTemplate(id, allPresetNames = []) {
  const tmpl = LANDING_TEMPLATES[id] || LANDING_TEMPLATES[DEFAULT_TEMPLATE];
  if (tmpl.presets === "*" || !Array.isArray(tmpl.presets)) return [...allPresetNames];
  return tmpl.presets.filter((p) => allPresetNames.includes(p));
}
