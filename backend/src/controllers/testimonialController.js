import mongoose from "mongoose";
import Testimonial from "../models/testimonialModel.js";

const isValidClinicId = (clinicId) =>
  mongoose.Types.ObjectId.isValid(String(clinicId || "").trim());

const isWholeNumber = (value) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 5;

const sanitizeReviewText = (text) => {
  const cleaned = String(text || "")
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[\u0000-\u001F\u007F]/g, "") // strip control chars
    .trim();
  return cleaned.slice(0, 1000);
};

// =========================================================================
// ⭐ PUBLIC: List approved testimonials for the landing page
// =========================================================================
export const getPublicTestimonials = async (req, res) => {
  const clinicId = String(req.params.clinicId || "").trim();

  if (!isValidClinicId(clinicId)) {
    return res.status(400).json({
      success: false,
      message: "A valid clinic ID is required to fetch testimonials.",
    });
  }

  try {
    const testimonials = await Testimonial.find({
      clinicId: new mongoose.Types.ObjectId(clinicId),
      status: "approved",
    })
      .select(
        "rating reviewText isAnonymous isVerifiedPatient patientFirstName patientLastNameInitial createdAt reviewedAt",
      )
      .sort({ reviewedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    const safeTestimonials = testimonials.map((testimonial) => ({
      rating: testimonial.rating,
      reviewText: testimonial.reviewText,
      anonymous: testimonial.isAnonymous === true,
      verified: testimonial.isVerifiedPatient === true,
      // Consent-based display: only expose first name + last initial when the
      // patient explicitly opted out of anonymity (never full names or emails).
      patientFirstName: testimonial.isAnonymous
        ? ""
        : testimonial.patientFirstName || "",
      patientLastNameInitial: testimonial.isAnonymous
        ? ""
        : testimonial.patientLastNameInitial || "",
      date: testimonial.reviewedAt || testimonial.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: safeTestimonials,
    });
  } catch (error) {
    console.error("Public Testimonials Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load approved patient experiences.",
    });
  }
};

// =========================================================================
// 📊 PUBLIC: Average rating + count for the landing page summary
// =========================================================================
export const getTestimonialStats = async (req, res) => {
  const clinicId = String(req.params.clinicId || "").trim();

  if (!isValidClinicId(clinicId)) {
    return res.status(400).json({
      success: false,
      message: "A valid clinic ID is required to compute rating statistics.",
    });
  }

  try {
    const [aggregate] = await Testimonial.aggregate([
      {
        $match: {
          clinicId: new mongoose.Types.ObjectId(clinicId),
          status: "approved",
        },
      },
      {
        $group: {
          _id: null,
          average: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        average: aggregate ? Number(aggregate.average.toFixed(1)) : 0,
        count: aggregate ? aggregate.count : 0,
      },
    });
  } catch (error) {
    console.error("Testimonial Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to compute clinic rating statistics.",
    });
  }
};

// =========================================================================
// ✍️ AUTHENTICATED: Patient submits a new testimonial (published immediately)
// =========================================================================
export const submitTestimonial = async (req, res) => {
  const clinicId = String(req.params.clinicId || req.clinicId || "").trim();

  if (!isValidClinicId(clinicId)) {
    return res.status(400).json({
      success: false,
      message: "A valid clinic ID is required to submit a testimonial.",
    });
  }

  const { rating, reviewText, isAnonymous } = req.body || {};

  // 1. Validate rating strictly (whole number 1-5)
  if (!isWholeNumber(Number(rating))) {
    return res.status(400).json({
      success: false,
      message: "Rating must be a whole number from 1 to 5.",
    });
  }

  // 2. Validate review text (10-1000 chars after sanitization)
  const cleanedText = sanitizeReviewText(reviewText);
  if (cleanedText.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Please write at least 10 characters of feedback.",
    });
  }
  if (cleanedText.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Feedback must be 1000 characters or fewer.",
    });
  }

  // 3. Resolve patient identity from the authenticated token
  const patientId = req.user?._id || req.user?.id || req.user?.userId || null;

  // 3b. Capture privacy-safe display snapshot (first name + last initial)
  const patientFirstName = String(req.user?.firstName || req.user?.name || "")
    .trim()
    .slice(0, 50);
  const patientLastName = String(req.user?.lastName || "").trim();
  const patientLastNameInitial = patientLastName
    ? patientLastName.charAt(0).toUpperCase()
    : "";

  try {
    const testimonial = await Testimonial.create({
      clinicId: new mongoose.Types.ObjectId(clinicId),
      patientId,
      rating: Number(rating),
      reviewText: cleanedText,
      isAnonymous: isAnonymous === true,
      // Only verified accounts can submit; mark verified for known patients
      isVerifiedPatient: Boolean(patientId),
      // Reviews are published immediately — no clinic moderation required.
      status: "approved",
      reviewedAt: new Date(),
      patientFirstName,
      patientLastNameInitial,
    });

    // 🔔 Real-time notification to clinic admins
    if (global.io) {
      global.io.to(`clinic-${clinicId}`).emit("testimonial:new", {
        testimonialId: testimonial._id.toString(),
        clinicId,
        rating: testimonial.rating,
        status: testimonial.status,
        message: "A new patient testimonial has been published.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Thank you! Your feedback is now live on the clinic page.",
      data: {
        _id: testimonial._id.toString(),
        rating: testimonial.rating,
        status: testimonial.status,
        reviewedAt: testimonial.reviewedAt,
      },
    });
  } catch (error) {
    console.error("Submit Testimonial Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to save your feedback right now. Please try again.",
    });
  }
};

// =========================================================================
// 👤 AUTHENTICATED: Patient fetches all their testimonials for this clinic
// =========================================================================
export const getMyTestimonial = async (req, res) => {
  const clinicId = String(req.params.clinicId || req.clinicId || "").trim();

  if (!isValidClinicId(clinicId)) {
    return res.status(400).json({
      success: false,
      message: "A valid clinic ID is required.",
    });
  }

  const patientId = req.user?._id || req.user?.id || req.user?.userId || null;
  if (!patientId) {
    return res.status(401).json({
      success: false,
      message: "Patient identity could not be resolved from the session.",
    });
  }

  try {
    const testimonials = await Testimonial.find({
      clinicId: new mongoose.Types.ObjectId(clinicId),
      patientId,
    })
      .sort({ createdAt: -1 })
      .select(
        "rating reviewText isAnonymous isVerifiedPatient status createdAt reviewedAt",
      )
      .lean();

    return res.status(200).json({
      success: true,
      data: testimonials.map((t) => ({
        _id: t._id.toString(),
        rating: t.rating,
        reviewText: t.reviewText,
        isAnonymous: t.isAnonymous === true,
        isVerifiedPatient: t.isVerifiedPatient === true,
        status: t.status,
        createdAt: t.createdAt,
        reviewedAt: t.reviewedAt,
      })),
    });
  } catch (error) {
    console.error("Get My Testimonial Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load your feedback right now. Please try again.",
    });
  }
};

// =========================================================================
// 🛡️ ADMIN: List all testimonials for the clinic feedback panel (read-only)
// =========================================================================
export const getAdminTestimonials = async (req, res) => {
  const clinicId = String(req.params.clinicId || req.clinicId || "").trim();

  if (!isValidClinicId(clinicId)) {
    return res.status(400).json({
      success: false,
      message: "A valid clinic ID is required.",
    });
  }

  try {
    const testimonials = await Testimonial.find({
      clinicId: new mongoose.Types.ObjectId(clinicId),
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Map patient identity safely (only first name + last initial for display)
    const safeTestimonials = testimonials.map((t) => ({
      _id: t._id.toString(),
      rating: t.rating,
      reviewText: t.reviewText,
      status: t.status,
      anonymous: t.isAnonymous === true,
      verified: t.isVerifiedPatient === true,
      patient: {
        firstName: t.patientFirstName || "",
        lastNameInitial: t.patientLastNameInitial || "",
      },
      date: t.reviewedAt || t.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: safeTestimonials,
    });
  } catch (error) {
    console.error("Admin Testimonials Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load testimonials for review.",
    });
  }
};

// =========================================================================
// 🌐 PUBLIC: Featured approved testimonials across all active clinics
// (feeds the SaaS landing page with authentic, clinic-attributed reviews)
// =========================================================================
export const getFeaturedTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.aggregate([
      { $match: { status: "approved" } },
      {
        $lookup: {
          from: "clinics",
          localField: "clinicId",
          foreignField: "_id",
          as: "clinic",
        },
      },
      { $unwind: "$clinic" },
      { $match: { "clinic.isActive": true } },
      { $sort: { reviewedAt: -1, createdAt: -1 } },
      { $limit: 6 },
      {
        $project: {
          rating: 1,
          reviewText: 1,
          isAnonymous: 1,
          isVerifiedPatient: 1,
          patientFirstName: 1,
          patientLastNameInitial: 1,
          date: { $ifNull: ["$reviewedAt", "$createdAt"] },
          clinicName: "$clinic.name",
          clinicSlug: "$clinic.slug",
        },
      },
    ]);

    const safeTestimonials = testimonials.map((testimonial) => ({
      rating: testimonial.rating,
      reviewText: testimonial.reviewText,
      anonymous: testimonial.isAnonymous === true,
      verified: testimonial.isVerifiedPatient === true,
      // Consent-based display: first name + last initial only, never for anonymous.
      patientFirstName: testimonial.isAnonymous
        ? ""
        : testimonial.patientFirstName || "",
      patientLastNameInitial: testimonial.isAnonymous
        ? ""
        : testimonial.patientLastNameInitial || "",
      date: testimonial.date,
      clinicName: testimonial.clinicName || "",
      clinicSlug: testimonial.clinicSlug || "",
    }));

    const total = await Testimonial.countDocuments({ status: "approved" });

    return res.status(200).json({
      success: true,
      data: {
        testimonials: safeTestimonials,
        total,
      },
    });
  } catch (error) {
    console.error("Featured Testimonials Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load featured patient experiences.",
    });
  }
};

// =========================================================================
// 🛡️ RESERVED: abuse takedown (no moderation UI — reviews auto-publish).
// Kept so harmful content can still be removed if ever reported.
// =========================================================================
export const moderateTestimonial = async (req, res) => {
  const clinicId = String(req.params.clinicId || req.clinicId || "").trim();
  const testimonialId = String(req.params.testimonialId || "").trim();
  const { status } = req.body || {};

  if (
    !isValidClinicId(clinicId) ||
    !mongoose.Types.ObjectId.isValid(testimonialId)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid clinic ID and testimonial ID are required.",
    });
  }

  const allowedStatuses = ["approved", "rejected", "pending"];
  if (!allowedStatuses.includes(String(status || "").toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "Status must be one of: approved, rejected, pending.",
    });
  }

  try {
    const testimonial = await Testimonial.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(testimonialId),
        clinicId: new mongoose.Types.ObjectId(clinicId),
      },
      {
        status: String(status).toLowerCase(),
        reviewedAt: new Date(),
      },
      { new: true },
    );

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: "Testimonial not found for this clinic.",
      });
    }

    // 🔔 Real-time update so the landing page can refresh
    if (global.io) {
      global.io.to(`clinic-${clinicId}`).emit("testimonial:moderated", {
        testimonialId: testimonial._id.toString(),
        clinicId,
        status: testimonial.status,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Testimonial ${testimonial.status}.`,
      data: {
        _id: testimonial._id.toString(),
        status: testimonial.status,
        reviewedAt: testimonial.reviewedAt,
      },
    });
  } catch (error) {
    console.error("Moderate Testimonial Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update the testimonial. Please try again.",
    });
  }
};
