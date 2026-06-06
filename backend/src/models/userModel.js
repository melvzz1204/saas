// src/models/userModel.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: function () {
        return this.role !== "SUPER_ADMIN";
      },
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: function () {
        // 🎯 Dynamically required for Patients, completely optional for CLINIC_ADMIN
        return this.role === "PATIENT";
      },
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "CLINIC_ADMIN",
        "CLINIC_STAFF",
        "DENTIST",
        "PATIENT",
      ],
      default: "PATIENT",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// SaaS Index Rules
userSchema.index(
  { clinicId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { clinicId: { $exists: true } },
  },
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { clinicId: { $exists: false } },
  },
);

// Automatically hash password before saving to MongoDB
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Helper method to compare passwords during login
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
