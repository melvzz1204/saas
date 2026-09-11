// src/routes/landingRoutes.js
// Public, read-only catalog of the landing-page building blocks that are
// developer-defined in code: the layout TEMPLATES and the theme PRESETS.
//
// The admin dashboard fetches this so it no longer has to hard-code duplicate
// copies of the template/preset constants (which previously drifted from the
// backend source of truth). Everything served here is non-sensitive.

import express from "express";
import { LANDING_TEMPLATES, DEFAULT_TEMPLATE } from "../utils/landingTemplates.js";
import {
  LANDING_PRESETS,
  DEFAULT_PRESET,
  PRESET_NAMES,
  TYPOGRAPHY_CHOICES,
  SOCIAL_PLATFORMS,
  ALLOWED_SECTIONS,
} from "../utils/landingSanitize.js";

const router = express.Router();

// GET /api/v1/landing/catalog
router.get("/catalog", (req, res) => {
  // Expose templates as an ordered array with resolved preset lists so the
  // client can render pickers without re-deriving "*".
  const templates = Object.values(LANDING_TEMPLATES).map((tmpl) => ({
    id: tmpl.id,
    name: tmpl.name,
    description: tmpl.description,
    thumbnail: tmpl.thumbnail,
    supportedSections: [...tmpl.supportedSections],
    defaultSectionOrder: [...tmpl.defaultSectionOrder],
    defaultPreset: tmpl.defaultPreset,
    presets:
      tmpl.presets === "*" || !Array.isArray(tmpl.presets)
        ? [...PRESET_NAMES]
        : tmpl.presets.filter((p) => PRESET_NAMES.includes(p)),
  }));

  return res.status(200).json({
    success: true,
    data: {
      templates,
      defaultTemplate: DEFAULT_TEMPLATE,
      presets: LANDING_PRESETS,
      defaultPreset: DEFAULT_PRESET,
      typographyChoices: TYPOGRAPHY_CHOICES,
      socialPlatforms: SOCIAL_PLATFORMS,
      sections: ALLOWED_SECTIONS,
    },
  });
});

export default router;
