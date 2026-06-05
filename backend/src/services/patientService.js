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

export const loginUser = async (clinicId, email, password) => {
  // 1. Validation: Ensure both fields are present
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  // 2. Find the user by email AND clinicId (SaaS boundary rule)
  const user = await User.findOne({ clinicId, email });
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  // 3. Verify Password (assuming your userModel hashes passwords using bcrypt)
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Invalid email or password.");
  }

  // 4. Generate a JWT Token signed with a secret key
  // (In production, replace 'YOUR_JWT_SECRET' with process.env.JWT_SECRET)
  const token = jwt.sign(
    { userId: user._id, clinicId: user.clinicId, role: user.role },
    "YOUR_JWT_SECRET",
    { expiresIn: "1d" }, // Token lasts for 1 day
  );

  // 5. Return the token and user data (no password!)
  return {
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  };
};
