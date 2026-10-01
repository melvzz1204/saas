// tests/registrationVerify.test.js
// Integration tests for the email-verified clinic registration flow.
//
// Requires a REAL but DISPOSABLE MongoDB (its database is dropped in afterAll):
//   TEST_MONGO_URI=mongodb://localhost:27017/dentacloud-test npm test
// When TEST_MONGO_URI is unset the suite is skipped so unit tests still run.
//
// The email service is mocked so no real mail is sent; the mock captures the
// generated code (which never leaves the server in production) so the tests can
// exercise the verify/resend paths.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";

const { sentCodes } = vi.hoisted(() => ({ sentCodes: [] }));

vi.mock("../src/services/emailService.js", () => ({
  sendVerificationEmail: async ({ to, code }) => {
    sentCodes.push({ to, code });
    return true;
  },
  sendSubscriptionActiveEmail: async () => true,
  verifyEmailTransport: async () => true,
}));

import { buildTestApp } from "./helpers/testApp.js";
import Clinic from "../src/models/clinicModel.js";
import User from "../src/models/userModel.js";
import PendingRegistration from "../src/models/pendingRegistrationModel.js";
import { Subscription } from "../src/models/billingModels.js";
import { seedPlans } from "../src/scripts/seedBilling.js";
import { createSubscription } from "../src/services/billing/billingService.js";
import { __resetRateLimit } from "../src/middlewares/rateLimit.js";

const TEST_MONGO_URI = process.env.TEST_MONGO_URI;
const BASE = "/api/v1/tenants";

let counter = 0;
function validPayload(over = {}) {
  counter += 1;
  return {
    clinicName: "Bright Smile Dental",
    slug: `bright-smile-${counter}`,
    address: "1 Main Street",
    description: "Gentle care",
    // No payment at registration (pay-after-approval). Billing preference only.
    billingCycle: "monthly",
    adminData: {
      firstName: "Jo",
      lastName: "Doe",
      email: `jo${counter}@example.com`,
      contactNumber: "09171234567",
      password: "supersecret1",
    },
    ...over,
  };
}

function otherCode(code) {
  return code === "000000" ? "111111" : "000000";
}

describe.skipIf(!TEST_MONGO_URI)("Email-verified clinic registration", () => {
  let app;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGO_URI);
    await seedPlans();
    app = buildTestApp();
  });

  afterAll(async () => {
    await mongoose.connection?.dropDatabase?.().catch(() => {});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    sentCodes.length = 0;
    __resetRateLimit();
    await Promise.all([
      Clinic.deleteMany({}),
      User.deleteMany({}),
      PendingRegistration.deleteMany({}),
      Subscription.deleteMany({}),
    ]);
  });

  it("starts registration with NO payment — code emailed, nothing created yet", async () => {
    const res = await request(app)
      .post(`${BASE}/register/initiate`)
      .send(validPayload({ testToken: "tok_test_decline" })); // payment fields are ignored now
    expect(res.status).toBe(200);
    expect(sentCodes).toHaveLength(1); // code emailed without any charge
    expect(await PendingRegistration.countDocuments()).toBe(1);
    expect(await Clinic.countDocuments()).toBe(0);
  });

  it("initiate stores a pending record, emails a code, creates nothing, and collects no payment", async () => {
    const res = await request(app).post(`${BASE}/register/initiate`).send(validPayload());
    expect(res.status).toBe(200);
    expect(res.body.data.pendingId).toBeDefined();
    expect(res.body.data.plan.name).toBeDefined();
    expect(res.body.data).not.toHaveProperty("paymentRef"); // no charge at registration
    expect(res.body.data).not.toHaveProperty("code"); // never returned
    expect(sentCodes).toHaveLength(1);
    expect(await Clinic.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
    expect(await PendingRegistration.countDocuments()).toBe(1);
    const pending = await PendingRegistration.findOne({}).lean();
    expect(pending.payment?.providerRef || "").toBe("");
  });

  it("rejects malformed payloads (short password, bad slug, bad email)", async () => {
    expect((await request(app).post(`${BASE}/register/initiate`).send(validPayload({ adminData: { ...validPayload().adminData, password: "short" } }))).status).toBe(400);
    expect((await request(app).post(`${BASE}/register/initiate`).send(validPayload({ slug: "Bad Slug!" }))).status).toBe(400);
    expect((await request(app).post(`${BASE}/register/initiate`).send(validPayload({ adminData: { ...validPayload().adminData, email: "nope" } }))).status).toBe(400);
  });

  it("verifies the correct code, creates a Pending clinic + admin, and is single-use", async () => {
    const payload = validPayload();
    const init = await request(app).post(`${BASE}/register/initiate`).send(payload);
    const { pendingId } = init.body.data;
    const code = sentCodes[0].code;

    const verify = await request(app).post(`${BASE}/register/verify`).send({ pendingId, code });
    expect(verify.status).toBe(201);
    expect(verify.body.data.clinic.slug).toBe(payload.slug);
    expect(await Clinic.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
    expect(await PendingRegistration.countDocuments()).toBe(0);

    // Pay-after-approval: NO subscription is created at verify time, and the
    // clinic is Pending + inactive until a super-admin approves it.
    expect(verify.body.data.subscription).toBeNull();
    const clinic = await Clinic.findOne({ slug: payload.slug }).lean();
    expect(clinic.applicationStatus).toBe("Pending");
    expect(clinic.isActive).toBe(false);
    expect(await Subscription.countDocuments()).toBe(0);

    // Reusing the same code now fails (pending was deleted on success).
    const reuse = await request(app).post(`${BASE}/register/verify`).send({ pendingId, code });
    expect(reuse.status).toBe(404);
  });

  it("blocks subscribing while Pending; allows it after approval (pay-after-approval)", async () => {
    const payload = validPayload();
    const init = await request(app).post(`${BASE}/register/initiate`).send(payload);
    const verify = await request(app)
      .post(`${BASE}/register/verify`)
      .send({ pendingId: init.body.data.pendingId, code: sentCodes[0].code });
    const clinicId = verify.body.data.clinic._id;

    // Pending clinic tries to subscribe -> blocked, nothing charged/created.
    const blocked = await createSubscription({
      clinicId,
      planKey: "pro",
      billingCycle: "monthly",
      testToken: "tok_test_visa",
      actor: { type: "clinic" },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.error).toMatch(/approv/i);
    expect(await Subscription.countDocuments()).toBe(0);

    // Super-admin approves -> subscribing works (pro plan starts with a trial).
    await Clinic.updateOne(
      { _id: clinicId },
      { $set: { applicationStatus: "Approved", isActive: true } },
    );
    const ok = await createSubscription({
      clinicId,
      planKey: "pro",
      billingCycle: "monthly",
      testToken: "tok_test_visa",
      actor: { type: "clinic" },
    });
    expect(ok.error).toBeUndefined();
    expect(ok.subscription.status).toBe("trialing");
  });

  it("stores the admin password as a bcrypt hash (not plaintext)", async () => {
    const payload = validPayload();
    const init = await request(app).post(`${BASE}/register/initiate`).send(payload);
    await request(app).post(`${BASE}/register/verify`).send({ pendingId: init.body.data.pendingId, code: sentCodes[0].code });
    const user = await User.findOne({ email: payload.adminData.email }).lean();
    expect(user.password).not.toBe(payload.adminData.password);
    expect(user.password.startsWith("$2")).toBe(true); // bcrypt signature
  });

  it("rejects an incorrect code and reports remaining attempts", async () => {
    const init = await request(app).post(`${BASE}/register/initiate`).send(validPayload());
    const res = await request(app)
      .post(`${BASE}/register/verify`)
      .send({ pendingId: init.body.data.pendingId, code: otherCode(sentCodes[0].code) });
    expect(res.status).toBe(400);
    expect(res.body.data.attemptsRemaining).toBe(4);
    expect(await Clinic.countDocuments()).toBe(0);
  });

  it("locks verification after the maximum number of attempts", async () => {
    const init = await request(app).post(`${BASE}/register/initiate`).send(validPayload());
    const pendingId = init.body.data.pendingId;
    const wrong = otherCode(sentCodes[0].code);
    let last;
    for (let i = 0; i < 5; i += 1) {
      last = await request(app).post(`${BASE}/register/verify`).send({ pendingId, code: wrong });
    }
    expect(last.status).toBe(429);
  });

  it("treats an expired code as expired (410)", async () => {
    const init = await request(app).post(`${BASE}/register/initiate`).send(validPayload());
    const pendingId = init.body.data.pendingId;
    await PendingRegistration.updateOne({ _id: pendingId }, { $set: { codeExpiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post(`${BASE}/register/verify`).send({ pendingId, code: sentCodes[0].code });
    expect(res.status).toBe(410);
  });

  it("check-email flags free, pending, and taken addresses without creating anything", async () => {
    const free = await request(app)
      .post(`${BASE}/register/check-email`)
      .send({ email: "fresh-address@example.com" });
    expect(free.status).toBe(200);
    expect(free.body.data).toMatchObject({ available: true });

    expect(
      (await request(app).post(`${BASE}/register/check-email`).send({ email: "not-an-email" })).status,
    ).toBe(400);

    const payload = validPayload();
    const init = await request(app).post(`${BASE}/register/initiate`).send(payload);
    const pending = await request(app)
      .post(`${BASE}/register/check-email`)
      .send({ email: payload.adminData.email });
    expect(pending.body.data).toMatchObject({ available: false, code: "PENDING_EXISTS" });

    await request(app)
      .post(`${BASE}/register/verify`)
      .send({ pendingId: init.body.data.pendingId, code: sentCodes[0].code });
    const taken = await request(app)
      .post(`${BASE}/register/check-email`)
      .send({ email: payload.adminData.email });
    expect(taken.body.data).toMatchObject({ available: false, code: "EMAIL_EXISTS" });
    expect(await Clinic.countDocuments()).toBe(1);
  });

  it("blocks a duplicate email that already has an account", async () => {
    const payload = validPayload();
    const init = await request(app).post(`${BASE}/register/initiate`).send(payload);
    await request(app).post(`${BASE}/register/verify`).send({ pendingId: init.body.data.pendingId, code: sentCodes[0].code });

    // Re-register with the same admin email (different slug) -> 409.
    const dup = await request(app)
      .post(`${BASE}/register/initiate`)
      .send(validPayload({ slug: "different-slug", adminData: { ...payload.adminData } }));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("EMAIL_EXISTS");
    expect(dup.body.message).toMatch(/already exists/i);
  });

  it("enforces the resend cooldown", async () => {
    const init = await request(app).post(`${BASE}/register/initiate`).send(validPayload());
    const resend = await request(app).post(`${BASE}/register/resend`).send({ pendingId: init.body.data.pendingId });
    expect(resend.status).toBe(429); // still within the 60s cooldown
  });

  it("resend issues a NEW code and invalidates the old one", async () => {
    const init = await request(app).post(`${BASE}/register/initiate`).send(validPayload());
    const pendingId = init.body.data.pendingId;
    const oldCode = sentCodes[0].code;

    // Bypass the cooldown for the test by backdating lastSentAt.
    await PendingRegistration.updateOne({ _id: pendingId }, { $set: { lastSentAt: new Date(Date.now() - 120000) } });

    const resend = await request(app).post(`${BASE}/register/resend`).send({ pendingId });
    expect(resend.status).toBe(200);
    const newCode = sentCodes[1].code;

    // The old code should no longer work (new hash stored). If codes happen to
    // collide, skip that impossible-to-distinguish case.
    if (newCode !== oldCode) {
      const oldTry = await request(app).post(`${BASE}/register/verify`).send({ pendingId, code: oldCode });
      expect(oldTry.status).toBe(400);
    }
    const ok = await request(app).post(`${BASE}/register/verify`).send({ pendingId, code: newCode });
    expect(ok.status).toBe(201);
  });
});
