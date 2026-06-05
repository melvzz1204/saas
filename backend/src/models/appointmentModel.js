// src/models/appointmentModel.js
import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Points to your patient/user record
      required: true,
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
      ],
    },
    date: {
      type: String, // Storing as YYYY-MM-DD for simple UI formatting
      required: true,
    },
    time: {
      type: String, // Storing slot names like "09:00 AM"
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["Pending", "Approved", "Declined"],
      default: "Pending",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Appointment", appointmentSchema);
