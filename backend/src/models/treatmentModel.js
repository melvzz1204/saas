// src/models/treatmentModel.js
import mongoose from "mongoose";

const treatmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    dentistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff", // Links directly to your existing Staff model
      required: true,
    },
    procedureName: {
      type: String,
      required: true,
      default: "Routine Examination",
    },
    // Captures the exact FDI 2-digit number selected from the 16-tooth UI map
    treatedTooth: {
      type: Number,
      required: false, // Optional, since some procedures are mouth-wide
    },
    clinicalNotes: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["IN_CHAIR", "COMPLETED_PENDING_BILL", "SETTLED"],
      default: "IN_CHAIR",
    },
    billingAmount: {
      type: Number,
      required: true,
      default: 0.0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Treatment", treatmentSchema);
