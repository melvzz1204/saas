import mongoose from "mongoose";

const clinicalNoteSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant", // or "Clinic" depending on your model name
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dentistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },
    treatedTeeth: {
      type: [Number],
      default: [],
    },
    chiefComplaint: {
      type: String,
      required: [true, "Chief complaint is required"],
      trim: true,
    },
    assessment: {
      type: String,
      required: [true, "Clinical assessment/diagnosis is required"],
      trim: true,
    },
    treatmentRendered: {
      type: String,
      required: [true, "Treatment rendered is required"],
      trim: true,
    },
    progressNotes: {
      type: String,
      trim: true,
      default: "",
    },
    recommendations: {
      type: String,
      trim: true,
      default: "",
    },
    nextVisitDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Auto-generates createdAt & updatedAt
  },
);

export default mongoose.model("ClinicalNote", clinicalNoteSchema);
