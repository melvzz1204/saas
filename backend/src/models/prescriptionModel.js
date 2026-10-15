// src/models/prescriptionModel.js
// Dentist-issued prescription (reseta) for a patient.
import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. Amoxicillin
    dosage: { type: String, default: "", trim: true }, // e.g. 500mg
    frequency: { type: String, default: "", trim: true }, // e.g. 3x a day
    duration: { type: String, default: "", trim: true }, // e.g. 7 days
    quantity: { type: String, default: "", trim: true }, // e.g. 21 capsules
    instructions: { type: String, default: "", trim: true }, // e.g. Take after meals
  },
  { _id: false },
);

const prescriptionSchema = new mongoose.Schema(
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
      default: null, // null for walk-ins without an account
      index: true,
    },
    patientName: { type: String, default: "", trim: true },
    dentistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },
    diagnosis: { type: String, default: "", trim: true },
    medications: {
      type: [medicationSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one medication is required.",
      },
    },
    advice: { type: String, default: "", trim: true }, // general instructions
    status: {
      type: String,
      enum: ["Active", "Cancelled"],
      default: "Active",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Prescription", prescriptionSchema);
