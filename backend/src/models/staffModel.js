// src/models/staffModel.js
import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic", // 🔗 This binds the staff member strictly to your specific Clinic model
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["Dentist", "Receptionist", "Dental Hygienist"], // Only allows these valid company positions
    },
    specialization: {
      type: String,
      default: "General Dentistry", // e.g., Orthodontics, Pediatrics, Oral Surgery
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
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "On Leave", "Inactive"],
      default: "Active",
    },
  },
  { timestamps: true }, // Automatically creates 'createdAt' and 'updatedAt' fields for audit logs
);

export default mongoose.model("Staff", staffSchema);
