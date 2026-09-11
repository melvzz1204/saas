import mongoose from "mongoose";

const testimonialSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number from 1 to 5.",
      },
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    // Reviews publish automatically — no moderation. Everything submitted is
    // `approved` unless explicitly taken down for abuse.
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    isVerifiedPatient: {
      type: Boolean,
      default: false,
    },
    // Privacy-safe display snapshot captured at submission time so admins can
    // identify the author without exposing the full patient record publicly.
    patientFirstName: {
      type: String,
      default: "",
      trim: true,
    },
    patientLastNameInitial: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

testimonialSchema.index({ clinicId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Testimonial", testimonialSchema);
