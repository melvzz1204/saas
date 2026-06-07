// src/models/appointmentModel.js
import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    // ⚠️ Changed to optional: Walk-ins might not have an app account yet!
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // 🚀 NEW: Store basic info for walk-ins who aren't registered users
    patientName: {
      type: String,
    },
    phone: {
      type: String,
    },
    service: {
      type: String,
      required: true,
      enum: [
        "General Checkup",
        "Tooth Extraction",
        "Root Canal Treatment",
        "Dental Braces Adjustment",
        "Teeth Whitening",
        "Walk-In Consult", // 🚀 NEW: Added to allow fast-track walk-ins
      ],
    },
    date: {
      type: String,
      // ⚠️ Changed to optional: Walk-ins don't book a specific future date
    },
    time: {
      type: String,
      // ⚠️ Changed to optional: Walk-ins don't have a scheduled slot
    },

    // 🔄 UNIFIED STATUS: Combined your booking statuses with the live-flow statuses
    status: {
      type: String,
      required: true,
      enum: [
        "Pending", // Web booking waiting for approval
        "Approved", // Web booking confirmed
        "Declined", // Web booking rejected
        "checked-in", // Patient is in the lobby
        "in-treatment", // Patient is in the chair
        "completed", // Session finished
        "cancelled", // Patient left or cancelled
      ],
      default: "Pending",
    },

    notes: {
      type: String,
      default: "",
    },

    // 🚀 NEW: Walk-in specific tracking
    isWalkIn: {
      type: Boolean,
      default: false,
    },
    checkInTime: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }, // Keeps createdAt and updatedAt working
);

export default mongoose.model("Appointment", appointmentSchema);
