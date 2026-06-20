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
        "in-treatment", // Patient is in the chair
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

    // 🚀 Walk-in specific tracking
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
