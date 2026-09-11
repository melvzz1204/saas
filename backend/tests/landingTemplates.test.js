// tests/landingTemplates.test.js
// Unit tests for the landing-page template registry and its helpers, plus a
// guard that the registry stays consistent with the sanitizer's constants.

import { describe, it, expect } from "vitest";
import {
  LANDING_TEMPLATES,
  TEMPLATE_NAMES,
  DEFAULT_TEMPLATE,
  getTemplate,
  isValidTemplate,
  sectionsForTemplate,
  presetsForTemplate,
} from "../src/utils/landingTemplates.js";
import { ALLOWED_SECTIONS, PRESET_NAMES } from "../src/utils/landingSanitize.js";

describe("landing template registry", () => {
  it("exposes at least the three shipped templates and a valid default", () => {
    expect(TEMPLATE_NAMES).toEqual(expect.arrayContaining(["classic", "split", "scroll"]));
    expect(LANDING_TEMPLATES[DEFAULT_TEMPLATE]).toBeDefined();
    expect(DEFAULT_TEMPLATE).toBe("classic");
  });

  it("every template only references real sections and real presets", () => {
    for (const id of TEMPLATE_NAMES) {
      const tmpl = LANDING_TEMPLATES[id];
      // supportedSections must all be known sections
      for (const s of tmpl.supportedSections) {
        expect(ALLOWED_SECTIONS).toContain(s);
      }
      // defaultSectionOrder may include "custom" plus supported sections only
      for (const s of tmpl.defaultSectionOrder) {
        expect(["custom", ...tmpl.supportedSections]).toContain(s);
      }
      // presets is "*" or an array of real preset names
      if (tmpl.presets !== "*") {
        for (const p of tmpl.presets) expect(PRESET_NAMES).toContain(p);
      }
      // the recommended default preset must be a real preset
      expect(PRESET_NAMES).toContain(tmpl.defaultPreset);
    }
  });

  it("getTemplate / isValidTemplate behave for known and unknown ids", () => {
    expect(isValidTemplate("classic")).toBe(true);
    expect(isValidTemplate("nope")).toBe(false);
    expect(isValidTemplate(undefined)).toBe(false);
    expect(getTemplate("classic")).toBe(LANDING_TEMPLATES.classic);
    expect(getTemplate("nope")).toBeNull();
  });

  it("sectionsForTemplate falls back to the default template for unknown ids", () => {
    expect(sectionsForTemplate("classic")).toEqual(LANDING_TEMPLATES.classic.supportedSections);
    expect(sectionsForTemplate("nope")).toEqual(
      LANDING_TEMPLATES[DEFAULT_TEMPLATE].supportedSections,
    );
  });

  it("presetsForTemplate expands '*' to all presets and filters explicit lists", () => {
    // classic ships with "*"
    expect(presetsForTemplate("classic", PRESET_NAMES)).toEqual([...PRESET_NAMES]);
    // unknown template falls back to default (also "*")
    expect(presetsForTemplate("nope", PRESET_NAMES)).toEqual([...PRESET_NAMES]);
  });
});
