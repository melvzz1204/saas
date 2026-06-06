// src/routes/tenantRoutes.js
import express from "express";
import mongoose from "mongoose";
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js"; // 🎯 Imported to handle simultaneous CLINIC_ADMIN creation

const router = express.Router();

// ==========================================
// 🚀 ENDPOINT 1: Register a New Clinic Workspace & Admin
// POST /api/v1/tenants/register
// ==========================================
router.post("/register", async (req, res) => {
  try {
    // Matches the exact payload structure dispatched by clinicRegistration.js
    const { clinicName, slug, adminData } = req.body;

    // 1. Thorough Validation Checks
    if (!clinicName || !slug || !adminData) {
      return res.status(400).json({
        success: false,
        message:
          "Clinic name and unique URL identification slug are required fields.",
      });
    }

    const { firstName, lastName, email, phone, password } = adminData;
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing tenant administrator data parameters.",
      });
    }

    const safeSlug = slug.toLowerCase().trim();
    const safeEmail = email.toLowerCase().trim();

    // 2. Prevent unique key index collision crashes on Clinic collection
    const clinicExists = await Clinic.findOne({ slug: safeSlug });
    if (clinicExists) {
      return res.status(409).json({
        success: false,
        message: "This system slug is already taken.",
      });
    }

    // 3. STEP ONE: Create the Clinic Parent Record
    const newClinic = await Clinic.create({
      name: clinicName.trim(), // Maps frontend 'clinicName' to schema 'name'
      slug: safeSlug,
      isActive: true,
    });

    try {
      // 4. STEP TWO: Create the CLINIC_ADMIN bound to this new clinic ID
      const newAdminAccount = await User.create({
        clinicId: newClinic._id, // Link them explicitly via Mongoose Object ID mapping
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: safeEmail,
        phone: phone.trim(),
        password: password, // Pre-save hook inside userModel hashes this cleanly
        role: "CLINIC_ADMIN",
        isActive: true,
      });

      return res.status(201).json({
        success: true,
        message:
          "Tenant instance workspace and administrative ownership account successfully deployed.",
        data: {
          clinic: {
            _id: newClinic._id,
            name: newClinic.name,
            slug: newClinic.slug,
          },
          admin: {
            _id: newAdminAccount._id,
            email: newAdminAccount.email,
            role: newAdminAccount.role,
          },
        },
      });
    } catch (userError) {
      // Rollback Strategy: Delete the provisioned clinic if the admin account generation breaks
      await Clinic.findByIdAndDelete(newClinic._id);
      throw userError;
    }
  } catch (error) {
    console.error("Workspace Deployment Fail:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "An administrator with this email already exists inside this workspace boundary.",
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 🔍 ENDPOINT 2: Resolve Location Context via Slug or ID
// GET /api/v1/tenants/slug/:identifier
// ==========================================
router.get("/slug/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    let clinicData = null;

    // Check if the identifier matches a 24-character hex MongoDB ObjectID structure
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);

    if (isObjectId) {
      // 🎯 Query your clinic database collection directly using the hex ID
      clinicData = await Clinic.findById(identifier);
    } else {
      // 🎯 Query using your clean slug string field
      clinicData = await Clinic.findOne({
        slug: identifier.toLowerCase().trim(),
      });
    }

    if (!clinicData) {
      return res.status(404).json({
        success: false,
        message:
          "Target clinical location context not registered in our SaaS directory.",
      });
    }

    // Send the perfect structural layout back to patientLogin.js
    return res.status(200).json({
      success: true,
      data: {
        _id: clinicData._id,
        name: clinicData.name,
        slug: clinicData.slug,
      },
    });
  } catch (error) {
    console.error("SaaS Identity Resolution Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error resolving location context identifiers.",
    });
  }
});

// ==========================================
// 🎯 ENDPOINT 3: Direct ID Lookup for Patient Dashboard
// GET /api/v1/tenants/:id
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Structural check to ensure it's a valid 24-character hexadecimal string
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location database context structure.",
      });
    }

    // 2. Query your clinic collection using the imported Clinic model
    const clinicData = await Clinic.findById(id);

    // 3. Fallback safety check
    if (!clinicData) {
      return res.status(404).json({
        success: false,
        message: "Target clinical location context not registered.",
      });
    }

    // 4. Return the complete document wrapper back to patientDashboard.js
    return res.status(200).json({
      success: true,
      data: clinicData,
    });
  } catch (error) {
    console.error("Dashboard Metadata Resolution Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error resolving location context identifiers.",
    });
  }
});

export default router;
