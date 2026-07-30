// src/models/userModel.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // 👈 Ensures stored emails are always lowercased
      trim: true,
    },
    password: { type: String, required: true },
    phone: {
      type: String,
      required: function () {
        return this.role !== "SAAS_ADMIN";
      },
    },
    role: {
      type: String,
      enum: ["PATIENT", "CLINIC_ADMIN", "DENTIST", "STAFF", "SAAS_ADMIN"],
      required: true,
    },
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: function () {
        return this.role !== "SAAS_ADMIN";
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.models.User || mongoose.model("User", userSchema);
