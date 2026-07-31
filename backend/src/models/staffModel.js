// src/models/staffModel.js
import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    fullName: {
      // 👈 The controller must match this exact key name!
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["Dentist", "Staff"],
    },
    specialization: {
      type: String,
      default: "General Dentistry",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true, // ⚠️ Note: Phone is required, so the form cannot submit blank phone numbers!
    },
    accessPin: {
      // 🔑 ADD THIS LINE so your passwordless PIN can actually be saved!
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "On Leave", "Inactive"],
      default: "Active",
    },
    licenseNumber: {
      type: String,
      required: function () {
        return this.role === "Dentist";
      }, // Only required if the user is a dentist
      trim: true,
    },
    experienceYears: {
      type: Number,
      default: 0,
    },
    bio: {
      type: String,
      maxLength: 500,
      trim: true,
    },
    profileImage: {
      type: String,
      default: "default-avatar.png", // Stores the file path or Cloudinary/AWS URL
    },
  },
  { timestamps: true },
);

export default mongoose.model("Staff", staffSchema);
