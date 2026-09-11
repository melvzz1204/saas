import express from "express";
import {
  getPublicTestimonials,
  getTestimonialStats,
  getFeaturedTestimonials,
  submitTestimonial,
  getMyTestimonial,
  getAdminTestimonials,
  moderateTestimonial,
} from "../controllers/testimonialController.js";
import {
  protectPatientRoute,
  protectAdminRoute,
} from "../middlewares/authMiddleware.js";
import { identifyTenant } from "../middlewares/tenantMiddleware.js";

const router = express.Router();

// ── Public (landing page) ───────────────────────────────────────────────
// Featured reviews across all active clinics (SaaS landing page).
router.get("/featured", getFeaturedTestimonials);

router.get("/:clinicId/testimonials", getPublicTestimonials);
router.get("/:clinicId/testimonials/stats", getTestimonialStats);

// ── Authenticated patient submission ────────────────────────────────────
// Patient submits a testimonial for their clinic (published immediately,
// no moderation).
router.post(
  "/:clinicId/testimonials",
  identifyTenant,
  protectPatientRoute,
  submitTestimonial,
);

// Patient fetches their own testimonial/status for this clinic.
router.get(
  "/:clinicId/testimonials/mine",
  identifyTenant,
  protectPatientRoute,
  getMyTestimonial,
);

// ── Clinic admin read access (display only; the moderation UI was retired —
// reviews publish automatically). The PATCH endpoint below remains solely
// for abuse takedowns.
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/:clinicId/testimonials/admin",
  identifyTenant,
  protectAdminRoute,
  getAdminTestimonials,
);
router.patch(
  "/:clinicId/testimonials/:testimonialId",
  identifyTenant,
  protectAdminRoute,
  moderateTestimonial,
);

export default router;
