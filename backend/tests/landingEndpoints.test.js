// tests/landingEndpoints.test.js
// Integration tests for the REST landing/profile endpoints.
//
// Requires a real MongoDB for the test database. Point the suite at it with:
//   TEST_MONGO_URI=mongodb://localhost:27017/novaclinic-test npm test
// When TEST_MONGO_URI is unset the suite is skipped so the unit tests still run.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { buildTestApp } from "./helpers/testApp.js";
import Clinic from "../src/models/clinicModel.js";
import { defaultLandingConfig } from "../src/utils/landingMigration.js";

const TEST_MONGO_URI = process.env.TEST_MONGO_URI;
const JWT_SECRET = "test_secret_key";

function tokenFor(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

describe.skipIf(!TEST_MONGO_URI)("Landing + profile endpoints", () => {
  let app;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGO_URI);
    app = buildTestApp();
  });

  afterAll(async () => {
    await mongoose.connection?.dropDatabase?.().catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Clinic.deleteMany({});
  });

  async function makeClinic(overrides = {}) {
    return Clinic.create({
      name: "Smile Dental",
      slug: `smile-${Date.now()}`,
      address: "1 Main St",
      description: "Legacy description",
      contactNumber: "123",
      applicationStatus: "Approved",
      landing: {
        draft: defaultLandingConfig({ description: "Legacy description" }),
        published: defaultLandingConfig({ description: "Legacy description" }),
      },
      ...overrides,
    });
  }

  it("rejects requests without a token", async () => {
    const clinic = await makeClinic();
    const res = await request(app).get(`/api/v1/tenants/${clinic._id}/landing`);
    expect(res.status).toBe(401);
  });

  it("forbids a clinic admin editing another clinic's landing", async () => {
    const clinic = await makeClinic();
    const otherClinic = await makeClinic({ slug: "other-dental" });
    const stranger = tokenFor({
      id: new mongoose.Types.ObjectId(),
      role: "CLINIC_ADMIN",
      clinicId: otherClinic._id.toString(),
    });

    const res = await request(app)
      .get(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${stranger}`);

    expect(res.status).toBe(403);
  });

  it("GET returns merged draft + published + clinic description", async () => {
    const clinic = await makeClinic();
    const admin = tokenFor({
      id: new mongoose.Types.ObjectId(),
      role: "CLINIC_ADMIN",
      clinicId: clinic._id.toString(),
    });

    const res = await request(app)
      .get(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.draft).toBeDefined();
    expect(res.body.data.published).toBeDefined();
    expect(res.body.data.clinicDescription).toBe("Legacy description");
    // migrated description matches the clinic record
    expect(res.body.data.draft.description).toBe("Legacy description");
  });

  it("PATCH validates the new fields and persists a sanitized draft", async () => {
    const clinic = await makeClinic();
    const admin = tokenFor({
      id: new mongoose.Types.ObjectId(),
      role: "CLINIC_ADMIN",
      clinicId: clinic._id.toString(),
    });

    const bad = await request(app)
      .patch(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ secondaryColor: "red" });
    expect(bad.status).toBe(400);

    const good = await request(app)
      .patch(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${admin}`)
      .send({
        template: "split",
        preset: "luxury-elegant",
        description: "Updated profile blurb",
        heroEyebrow: "Welcome",
        secondaryColor: "#be123c",
        typography: "elegant",
        sectionTexts: {
          services: { eyebrow: "Our Care", heading: "Treatments", intro: "All in one roof." },
        },
        socialLinks: [{ platform: "facebook", url: "https://facebook.com/smile" }],
      });
    expect(good.status).toBe(200);

    const fresh = await Clinic.findById(clinic._id).lean();
    expect(fresh.landing.draft.template).toBe("split");
    expect(fresh.landing.draft.preset).toBe("luxury-elegant");
    expect(fresh.landing.draft.description).toBe("Updated profile blurb");
    expect(fresh.landing.draft.secondaryColor).toBe("#be123c");
    expect(fresh.landing.draft.typography).toBe("elegant");
    expect(fresh.landing.draft.sectionTexts.services.heading).toBe("Treatments");
    expect(fresh.landing.draft.socialLinks[0].url).toBe("https://facebook.com/smile");
  });

  it("publish carries the chosen template from draft to published", async () => {
    const clinic = await makeClinic();
    const admin = tokenFor({
      id: new mongoose.Types.ObjectId(),
      role: "CLINIC_ADMIN",
      clinicId: clinic._id.toString(),
    });

    await request(app)
      .patch(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ template: "scroll" });

    const pub = await request(app)
      .post(`/api/v1/tenants/${clinic._id}/landing/publish`)
      .set("Authorization", `Bearer ${admin}`);
    expect(pub.status).toBe(200);

    const fresh = await Clinic.findById(clinic._id).lean();
    expect(fresh.landing.published.template).toBe("scroll");
  });

  it("publish copies draft to published", async () => {
    const clinic = await makeClinic();
    const admin = tokenFor({
      id: new mongoose.Types.ObjectId(),
      role: "CLINIC_ADMIN",
      clinicId: clinic._id.toString(),
    });

    await request(app)
      .patch(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ description: "New published blurb", secondaryColor: "#1d4ed8" });

    const pub = await request(app)
      .post(`/api/v1/tenants/${clinic._id}/landing/publish`)
      .set("Authorization", `Bearer ${admin}`);
    expect(pub.status).toBe(200);

    const fresh = await Clinic.findById(clinic._id).lean();
    expect(fresh.landing.published.description).toBe("New published blurb");
    expect(fresh.landing.published.secondaryColor).toBe("#1d4ed8");
  });

  it("rejects invalid social links on save", async () => {
    const clinic = await makeClinic();
    const admin = tokenFor({
      id: new mongoose.Types.ObjectId(),
      role: "CLINIC_ADMIN",
      clinicId: clinic._id.toString(),
    });

    const res = await request(app)
      .patch(`/api/v1/tenants/${clinic._id}/landing`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ socialLinks: [{ platform: "facebook", url: "javascript:alert(1)" }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Social");
  });
});