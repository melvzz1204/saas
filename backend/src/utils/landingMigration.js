// src/utils/landingMigration.js
// Idempotent back-fill of the merged landing + profile settings for clinics
// that were created before the landing editor existed. All legacy profile data
// reachable from the clinic record (e.g. `description`) is preserved by copying
// it into the landing draft/published settings when those are empty.
//
// The function is pure (it never touches the database) so it can be unit-tested
// and reused by the migration script, the register handler, and the read route.

import {
  ORDERABLE_SECTIONS,
  defaultSectionTexts,
  LANDING_PRESETS,
  DEFAULT_PRESET,
} from "./landingSanitize.js";
import { isValidTemplate, DEFAULT_TEMPLATE } from "./landingTemplates.js";

export const DEFAULT_SECTION_ORDER = [...ORDERABLE_SECTIONS];

export function defaultLandingConfig(seed = {}, presetName, templateName) {
  const effective = presetName && LANDING_PRESETS[presetName] ? presetName : DEFAULT_PRESET;
  const preset = LANDING_PRESETS[effective];
  const effectiveTemplate = isValidTemplate(templateName) ? templateName : DEFAULT_TEMPLATE;
  // Deep-clone nested structures so callers can mutate without touching the preset constant.
  const clonedSectionTexts = {};
  for (const [k, v] of Object.entries(preset.sectionTexts || {})) {
    clonedSectionTexts[k] = { ...v };
  }
  return {
    template: effectiveTemplate,
    preset: effective,
    logoUrl: "",
    primaryColor: preset.primaryColor,
    secondaryColor: preset.secondaryColor,
    headerBackground: preset.headerBackground,
    footerBackground: preset.footerBackground,
    typography: preset.typography,
    tagline: preset.tagline,
    description: String(seed.description || "").trim(),
    heroEyebrow: preset.heroEyebrow,
    sectionTexts: clonedSectionTexts,
    socialLinks: [],
    blocks: (preset.blocks || []).map((b) => ({ ...b })),
    hiddenSections: [...(preset.hiddenSections || [])],
    sectionOrder: [...(preset.sectionOrder || ORDERABLE_SECTIONS)],
  };
}

// Normalize one landing side (draft or published). Guarantees every key exists
// with a safe default, filling `description` from the clinic when missing.
export function normalizeLandingSide(side, clinicDescription, presetName) {
  const current =
    side && typeof side === "object" ? side : {};

  const fallbackDescription = String(clinicDescription || "").trim();

  // Resolve effective preset: explicit current.preset (including "" for Custom) wins,
  // otherwise the passed presetName, otherwise DEFAULT_PRESET.
  const hasCurrentPreset = current.preset !== undefined && current.preset !== null && String(current.preset).trim() !== "" ? String(current.preset).trim() : (current.preset === "" ? "" : null);
  const effectivePresetName = hasCurrentPreset !== null ? hasCurrentPreset : (presetName && String(presetName).trim() ? String(presetName).trim() : DEFAULT_PRESET);
  const isValidPreset = effectivePresetName && LANDING_PRESETS[effectivePresetName];
  const preset = isValidPreset ? LANDING_PRESETS[effectivePresetName] : LANDING_PRESETS[DEFAULT_PRESET];
  const resolvedPresetName = isValidPreset ? effectivePresetName : (effectivePresetName === "" ? "" : DEFAULT_PRESET);

  // Deep-clone sectionTexts so mutating the returned config never mutates LANDING_PRESETS.
  const cloneSectionTexts = (src) => {
    const base = src && typeof src === "object" ? src : preset.sectionTexts || defaultSectionTexts();
    const out = {};
    for (const k of Object.keys(preset.sectionTexts || {})) {
      const v = base[k] || {};
      out[k] = { eyebrow: String(v.eyebrow || ""), heading: String(v.heading || ""), intro: String(v.intro || "") };
    }
    // Include any extra keys from base (future-proof).
    for (const k of Object.keys(base)) {
      if (!out[k]) {
        const v = base[k] || {};
        out[k] = { eyebrow: String(v.eyebrow || ""), heading: String(v.heading || ""), intro: String(v.intro || "") };
      }
    }
    return out;
  };

  // Preserve an existing valid template; otherwise default legacy clinics to
  // "classic" so their page renders exactly as it did before templates existed.
  const resolvedTemplate = isValidTemplate(current.template)
    ? current.template
    : DEFAULT_TEMPLATE;

  return {
    template: resolvedTemplate,
    preset: resolvedPresetName,
    logoUrl: String(current.logoUrl || "").trim(),
    primaryColor: String(current.primaryColor || preset.primaryColor || "").trim(),
    secondaryColor: String(current.secondaryColor || preset.secondaryColor || "").trim(),
    headerBackground: String(current.headerBackground || preset.headerBackground || "").trim(),
    footerBackground: String(current.footerBackground || preset.footerBackground || "").trim(),
    typography: current.typography || preset.typography || "default",
    tagline: String(current.tagline || preset.tagline || "").trim(),
    description: String(current.description || fallbackDescription).trim(),
    heroEyebrow: String(current.heroEyebrow || preset.heroEyebrow || "").trim(),
    sectionTexts: current.sectionTexts ? cloneSectionTexts(current.sectionTexts) : cloneSectionTexts(null),
    socialLinks: Array.isArray(current.socialLinks) ? current.socialLinks : [],
    blocks: Array.isArray(current.blocks) ? current.blocks : (preset.blocks || []).map((b) => ({ ...b })),
    hiddenSections: Array.isArray(current.hiddenSections)
      ? current.hiddenSections
      : [...(preset.hiddenSections || [])],
    sectionOrder:
      Array.isArray(current.sectionOrder) && current.sectionOrder.length
        ? current.sectionOrder
        : [...(preset.sectionOrder || ORDERABLE_SECTIONS)],
  };
}

// Idempotent: returns a cloned { draft, published } pair safe to save, plus a
// boolean describing whether anything changed versus the supplied clinic.
export function backfillLandingProfile(clinic) {
  const source = clinic && typeof clinic === "object" ? clinic : {};
  const rawLanding = source.landing && typeof source.landing === "object"
    ? source.landing
    : {};

  const description = String(source.description || "").trim();

  // Preserve "" (Custom) — don't let || coerce it to DEFAULT_PRESET.
  const rawPreset = (() => {
    const d = rawLanding.draft?.preset;
    if (d === "" || (typeof d === "string" && d.trim() !== "")) return String(d).trim();
    const p = rawLanding.published?.preset;
    if (p === "" || (typeof p === "string" && p.trim() !== "")) return String(p).trim();
    return DEFAULT_PRESET;
  })();
  const draft = normalizeLandingSide(rawLanding.draft, description, rawPreset);
  const published = normalizeLandingSide(rawLanding.published, description, rawPreset);

  const changed =
    JSON.stringify(draft) !== JSON.stringify(rawLanding.draft || {}) ||
    JSON.stringify(published) !== JSON.stringify(rawLanding.published || {});

  return { draft, published, changed };
}

// Convenience wrapper for scripts: accepts a raw clinic document (mongoose or
// plain) and produces the updated `landing` sub-document object to $set.
export function landingUpdateFromClinic(clinic) {
  const { draft, published } = backfillLandingProfile(clinic);
  return { draft, published };
}