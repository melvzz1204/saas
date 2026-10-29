// src/models/appointmentModel.js
import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    // ⚠️ Optional: Walk-ins might not have an app account yet!
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // 🚀 Store basic info for walk-ins who aren't registered users
    patientName: {
      type: String,
    },
    phone: {
      type: String,
    },
    service: {
      type: String,
      required: true,
      trim: true, // 💡 Dynamic fallback: strips accidental whitespaces automatically!
    },
    // 🆕 MULTI-SERVICE: one appointment can hold many services (e.g. cleaning + braces)
    // `service` is kept as legacy display / first-service fallback for old docs + old UI.
    services: {
      type: [String],
      default: [],
    },
    date: {
      type: String,
      // ⚠️ Optional: Walk-ins don't book a specific future date
    },
    time: {
      type: String,
    },

    // 🔄 UNIFIED STATUS: Kept the enum here since operational steps are fixed
    status: {
      type: String,
      required: true,
      enum: [
        "Pending", // Web booking waiting for approval
        "Approved", // Web booking confirmed
        "Declined", // Web booking rejected
        "checked-in", // Patient is in the lobby
        "waiting", // Legacy lobby state used by the staff board
        "in-treatment", // Patient is in the chair
        "treatment", // Legacy chair state
        "completed", // Session finished
        "cancelled", //Patient left or cancelled
        "Missed", // Missed
      ],
      default: "Pending",
    },

    notes: {
      type: String,
      default: "",
    },

    // 💰 Editable billing amount (used for walk-ins / manual overrides)
    amount: {
      type: Number,
      default: null,
    },

    // 🚀 Walk-in specific tracking
    isWalkIn: {
      type: Boolean,
      default: false,
    },
    checkInTime: {
      type: Date,
      default: Date.now,
    },
    dentistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
  },
  { timestamps: true }, // Keeps createdAt and updatedAt working
);

export default mongoose.model("Appointment", appointmentSchema);
