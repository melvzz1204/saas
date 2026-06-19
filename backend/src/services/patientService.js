import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const registerUser = async (clinicId, userData) => {
  const { firstName, lastName, email, phone, dateOfBirth, password } = userData;

  if (
    !firstName ||
    !lastName ||
    !email ||
    !phone ||
    !dateOfBirth ||
    !password
  ) {
    throw new Error("All registration fields are required.");
  }

  const existingUser = await User.findOne({ clinicId, email });
  if (existingUser) {
    throw new Error("This email is already registered at this clinic.");
  }

  const newUser = await User.create({
    clinicId,
    firstName,
    lastName,
    email,
    phone,
    dateOfBirth,
    password,
    role: "PATIENT", // Hardcoded here to ensure this route only spawns patients
  });

  return {
    id: newUser._id,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
    email: newUser.email,
    role: newUser.role,
  };
};

// 🔗 Inside your /services/patientService.js
export const loginUser = async (clinicId, email, password) => {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const user = await User.findOne({ clinicId, email });
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Invalid email or password.");
  }

  // ✨ FIXED: Use process.env.JWT_SECRET so it matches your middleware validation key!
  const secretKey = process.env.JWT_SECRET || "YOUR_JWT_SECRET";

  const token = jwt.sign(
    { userId: user._id, clinicId: user.clinicId, role: user.role },
    secretKey,
    { expiresIn: "1d" },
  );

  return {
    token,
    user: {
      _id: user._id, // Keep schema naming consistent
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  };
};
