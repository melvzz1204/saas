// src/controllers/tenantController.js
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// 1. Unified Registration Handler
export const registerClinicController = async (req, res) => {
  try {
    const {
      name,
      slug,
      adminFirstName,
      adminLastName,
      email,
      phone,
      dateOfBirth,
      password,
    } = req.body;

    // Validation: Ensure clinic data is present
    if (!name || !slug || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required clinic registration fields.",
      });
    }

    // Check if clinic slug already exists
    const existingClinic = await Clinic.findOne({
      slug: slug.toLowerCase().trim(),
    });
    if (existingClinic) {
      return res.status(400).json({
        success: false,
        message: "This clinic URL slug is already taken.",
      });
    }

    // Create the Clinic
    const newClinic = await Clinic.create({
      name,
      slug: slug.toLowerCase().trim(),
    });

    // Create the Clinic Administrator User linked to this new clinic
    const newAdmin = await User.create({
      clinicId: newClinic._id,
      firstName: adminFirstName || "Clinic",
      lastName: adminLastName || "Admin",
      email: email.toLowerCase().trim(),
      phone: phone || "000-0000",
      dateOfBirth: dateOfBirth || new Date(),
      password, // Hashed automatically by your userModel pre-save hook
      role: "CLINIC_ADMIN", // 👈 Saved as CLINIC_ADMIN
    });

    return res.status(201).json({
      success: true,
      message: "SaaS Clinic Registered Successfully!",
      data: {
        clinicId: newClinic._id,
        clinicName: newClinic.name,
        adminEmail: newAdmin.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Dedicated Tenant Login Handler
export const loginTenantController = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password.",
      });
    }

    // Find the user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    // Generate SaaS Access Token
    const token = jwt.sign(
      { id: user._id, role: user.role, clinicId: user.clinicId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role, // Will pass "CLINIC_ADMIN" straight to your UI
          clinicId: user.clinicId,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
