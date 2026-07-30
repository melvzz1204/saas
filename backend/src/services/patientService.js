// src/services/patientService.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

// 1. Register Patient Service
export const registerUser = async (clinicId, userData) => {
  const { firstName, lastName, email, phone, password } = userData;

  if (!clinicId) {
    throw new Error("Missing tenant context: clinicId is required.");
  }

  if (!firstName || !lastName || !email || !phone || !password) {
    throw new Error(
      "All fields (firstName, lastName, email, phone, password) are required.",
    );
  }

  const cleanEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    throw new Error("An account with this email address already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newPatient = await User.create({
    clinicId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: cleanEmail,
    phone: phone.trim(),
    password: hashedPassword,
    role: "PATIENT",
    isActive: true,
  });

  return {
    _id: newPatient._id,
    clinicId: newPatient.clinicId,
    firstName: newPatient.firstName,
    lastName: newPatient.lastName,
    email: newPatient.email,
    role: newPatient.role,
  };
};

// 2. Login Patient Service
export const loginUser = async (clinicId, email, password) => {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const cleanEmail = email.toLowerCase().trim();

  // 1. Find patient user document
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new Error("Invalid credentials.");
  }

  // 2. Role check
  if (user.role !== "PATIENT") {
    throw new Error(
      "Unauthorized access. Account is not registered as a patient.",
    );
  }

  // 3. Password comparison
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Invalid credentials.");
  }

  // 4. Optional tenant check
  if (
    clinicId &&
    user.clinicId &&
    user.clinicId.toString() !== clinicId.toString()
  ) {
    throw new Error("Account is not registered under this clinic location.");
  }

  // 5. Sign JWT Token
  const token = jwt.sign(
    {
      id: user._id,
      userId: user._id,
      role: user.role,
      clinicId: user.clinicId,
    },
    process.env.JWT_SECRET || "fallback_saas_secret_key",
    { expiresIn: "7d" },
  );

  return {
    token,
    user,
  };
};
