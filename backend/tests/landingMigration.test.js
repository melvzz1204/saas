// tests/landingMigration.test.js
// Pure unit tests for the idempotent landing/profile back-fill.

import { describe, it, expect } from "vitest";
import {
  defaultLandingConfig,
  normalizeLandingSide,
  backfillLandingProfile,
  DEFAULT_SECTION_ORDER,
} from "../src/utils/landingMigration.js";
import { LANDING_PRESETS, DEFAULT_PRESET } from "../src/utils/landingSanitize.js";

const BASE_PRESET = LANDING_PRESETS[DEFAULT_PRESET];

describe("defaultLandingConfig", () => {
  it("seeds description from clinic profile seed", () => {
    const cfg = defaultLandingConfig({ description: " Modern care. " });
    expect(cfg.description).toBe("Modern care.");
    // A brand-new config is styled from the default preset (clean-clinical).
    expect(cfg.typography).toBe(BASE_PRESET.typography);
    expect(cfg.sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
    expect(cfg.socialLinks).toEqual([]);
  });

  it("defaults the template to classic and honors an explicit valid template", () => {
    expect(defaultLandingConfig({ description: "x" }).template).toBe("classic");
    expect(defaultLandingConfig({ description: "x" }, undefined, "split").template).toBe("split");
    // Unknown templates fall back to classic.
    expect(defaultLandingConfig({ description: "x" }, undefined, "bogus").template).toBe("classic");
  });
});

describe("normalizeLandingSide", () => {
  it("fills description from the clinic when missing", () => {
    const side = normalizeLandingSide({ description: "" }, "Legacy description");
    expect(side.description).toBe("Legacy description");
  });

  it("preserves an existing description override", () => {
    const side = normalizeLandingSide({ description: "My own text" }, "Legacy");
    expect(side.description).toBe("My own text");
  });

  it("adds safe defaults for every key", () => {
    const side = normalizeLandingSide(null, "");
    // With no preset context, a side is normalized against the default preset,
    // so every key exists and is styled (rather than blank).
    expect(side.primaryColor).toBe(BASE_PRESET.primaryColor);
    expect(side.secondaryColor).toBe(BASE_PRESET.secondaryColor);
    expect(side.typography).toBe(BASE_PRESET.typography);
    expect(Array.isArray(side.blocks)).toBe(true);
    expect(side.sectionTexts.services).toBeDefined();
  });

  it("defaults legacy sides to the classic template and preserves a valid one", () => {
    expect(normalizeLandingSide(null, "").template).toBe("classic");
    expect(normalizeLandingSide({ template: "scroll" }, "").template).toBe("scroll");
    expect(normalizeLandingSide({ template: "bogus" }, "").template).toBe("classic");
  });
});

describe("backfillLandingProfile", () => {
  it("is idempotent: returns changed=false when already normalized", () => {
    const clinic = {
      description: "d",
      landing: {
        draft: defaultLandingConfig({ description: "d" }),
        published: defaultLandingConfig({ description: "d" }),
      },
    };
    const first = backfillLandingProfile(clinic);
    expect(first.changed).toBe(false);
  });

  it("reports changed and back-fills legacy clinics", () => {
    const clinic = {
      description: "Legacy profile text",
      landing: {
        draft: { tagline: "Hi" }, // sparse legacy draft
      },
    };
    const { draft, published, changed } = backfillLandingProfile(clinic);
    expect(changed).toBe(true);
    expect(draft.description).toBe("Legacy profile text");
    expect(published.description).toBe("Legacy profile text");
    // Kept pre-existing draft data
    expect(draft.tagline).toBe("Hi");
    // The published side had no tagline, so it is seeded from the default preset.
    expect(published.tagline).toBe(BASE_PRESET.tagline);
  });

  it("handles clinics with no landing field at all", () => {
    const { draft, published, changed } = backfillLandingProfile({ description: "x" });
    expect(changed).toBe(true);
    expect(draft.sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
    expect(published.description).toBe("x");
  });
});