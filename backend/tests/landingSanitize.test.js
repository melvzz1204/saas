// tests/landingSanitize.test.js
// Pure unit tests for the landing editor's server-side sanitizer.

import { describe, it, expect } from "vitest";
import {
  sanitizeLanding,
  TYPOGRAPHY_CHOICES,
  SOCIAL_PLATFORMS,
  LIMITS,
} from "../src/utils/landingSanitize.js";
import { DEFAULT_TEMPLATE } from "../src/utils/landingTemplates.js";

describe("sanitizeLanding", () => {
  it("rejects non-object payloads", () => {
    expect(sanitizeLanding(null).error).toBeDefined();
    expect(sanitizeLanding("x").error).toBeDefined();
    expect(sanitizeLanding([]).value).toBeDefined();
  });

  it("defaults the template and keeps a valid one", () => {
    // Missing / unknown -> default template, and it's always present in output.
    expect(sanitizeLanding({}).value.template).toBe(DEFAULT_TEMPLATE);
    expect(sanitizeLanding({ template: "does-not-exist" }).value.template).toBe(DEFAULT_TEMPLATE);
    expect(sanitizeLanding({ template: "split" }).value.template).toBe("split");
    expect(sanitizeLanding({ template: "scroll" }).value.template).toBe("scroll");
  });

  it("keeps a preset that is compatible with the chosen template", () => {
    const value = sanitizeLanding({ template: "split", preset: "luxury-elegant" }).value;
    expect(value.template).toBe("split");
    expect(value.preset).toBe("luxury-elegant");
  });

  it("drops an unknown preset to Custom while preserving colors", () => {
    const value = sanitizeLanding({
      template: "classic",
      preset: "not-a-preset",
      primaryColor: "#123456",
    }).value;
    expect(value.preset).toBe("");
    expect(value.primaryColor).toBe("#123456");
  });

  it("rejects invalid primary and secondary colors", () => {
    expect(sanitizeLanding({ primaryColor: "red" }).error).toContain("hex");
    expect(sanitizeLanding({ primaryColor: "#fff" }).error).toBeUndefined();
    expect(sanitizeLanding({ secondaryColor: "#123456" }).error).toBeUndefined();
    expect(sanitizeLanding({ secondaryColor: "notacolor" }).error).toContain("hex");
  });

  it("accepts header/footer backgrounds and rejects invalid hex", () => {
    expect(sanitizeLanding({
      headerBackground: "#ffffff",
      footerBackground: "#0f172a",
    }).value).toMatchObject({ headerBackground: "#ffffff", footerBackground: "#0f172a" });
    expect(sanitizeLanding({ headerBackground: "white" }).error).toContain("hex");
    expect(sanitizeLanding({ footerBackground: "#00" }).error).toContain("hex");
    expect(sanitizeLanding({ headerBackground: "" }).error).toBeUndefined();
  });

  it("defaults typography and rejects unknown choices", () => {
    expect(sanitizeLanding({ typography: "nonsense" }).value.typography).toBe("default");
    for (const choice of TYPOGRAPHY_CHOICES) {
      expect(sanitizeLanding({ typography: choice }).value.typography).toBe(choice);
    }
  });

  it("truncates description and heroEyebrow to their limits", () => {
    const longDescription = "a".repeat(LIMITS.description + 50);
    const longEyebrow = "b".repeat(LIMITS.heroEyebrow + 50);
    const value = sanitizeLanding({
      description: longDescription,
      heroEyebrow: longEyebrow,
    }).value;
    expect(value.description.length).toBe(LIMITS.description);
    expect(value.heroEyebrow.length).toBe(LIMITS.heroEyebrow);
  });

  it("keeps only known section text keys and sanitizes lengths", () => {
    const value = sanitizeLanding({
      sectionTexts: {
        services: {
          eyebrow: " Eyebrow ",
          heading: "h".repeat(300),
          intro: "i".repeat(500),
        },
        dentists: { eyebrow: "Dent" },
        unknown: { eyebrow: "drop me" },
      },
    }).value;

    expect(value.sectionTexts.services.eyebrow).toBe("Eyebrow");
    expect(value.sectionTexts.services.heading.length).toBe(LIMITS.sectionHeading);
    expect(value.sectionTexts.services.intro.length).toBe(LIMITS.sectionIntro);
    expect(value.sectionTexts.dentists.eyebrow).toBe("Dent");
    expect(value.sectionTexts.unknown).toBeUndefined();
  });

  it("validates social links (platform + http(s) url) and caps count", () => {
    const ok = sanitizeLanding({
      socialLinks: [
        { platform: "facebook", url: "https://facebook.com/myclinic" },
        { platform: "instagram", url: "https://instagram.com/myclinic" },
      ],
    });
    expect(ok.error).toBeUndefined();
    expect(ok.value.socialLinks).toHaveLength(2);

    expect(
      sanitizeLanding({ socialLinks: [{ platform: "facebook", url: "javascript:alert(1)" }] }).error,
    ).toContain("Social");
    expect(
      sanitizeLanding({ socialLinks: [{ platform: "myspace", url: "https://x.com" }] }).error,
    ).toContain("Social");

    const tooMany = Array.from({ length: LIMITS.maxSocialLinks + 1 }, () => ({
      platform: "website",
      url: "https://example.com",
    }));
    expect(sanitizeLanding({ socialLinks: tooMany }).error).toContain("5");
  });

  it("drops blank social link rows instead of erroring", () => {
    const value = sanitizeLanding({
      socialLinks: [
        { platform: "facebook", url: "" },
        { platform: "instagram", url: "https://instagram.com/myclinic" },
      ],
    });
    expect(value.error).toBeUndefined();
    expect(value.value.socialLinks).toHaveLength(1);
    expect(value.value.socialLinks[0].platform).toBe("instagram");
  });

  it("preserves existing block/hidden/section-order behavior", () => {
    const value = sanitizeLanding({
      blocks: [
        { type: "text", heading: "Hi", body: "Body", background: "muted", align: "center" },
        { type: "image", imageUrl: "/uploads/documents/a.png" },
      ],
      hiddenSections: ["services", "services", "nope"],
      sectionOrder: ["custom", "pricing", "services", "pricing"],
    }).value;

    expect(value.blocks).toHaveLength(2);
    expect(value.blocks[0].background).toBe("muted");
    expect(value.blocks[0].align).toBe("center");
    // de-duplicated + unknown dropped
    expect(value.hiddenSections).toEqual(["services"]);
    expect(value.sectionOrder).toEqual(["custom", "pricing", "services"]);
  });

  it("constrains hidden/ordered sections to what the chosen template supports", () => {
    const value = sanitizeLanding({
      template: "split",
      hiddenSections: ["services", "bogus-section"],
      sectionOrder: ["custom", "services", "bogus-section", "pricing"],
    }).value;
    expect(value.template).toBe("split");
    // Unknown sections are stripped; valid ones (supported by the template) stay.
    expect(value.hiddenSections).toEqual(["services"]);
    expect(value.sectionOrder).toEqual(["custom", "services", "pricing"]);
  });

  it("rejects invalid colors/blocks and too many blocks", () => {
    expect(sanitizeLanding({ blocks: Array.from({ length: LIMITS.maxBlocks + 1 }, () => ({})) }).error).toContain("12");
    expect(sanitizeLanding({ blocks: [{ type: "image", imageUrl: "evil://x" }] }).error).toContain("not allowed");
  });
});