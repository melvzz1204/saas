import bcrypt from "bcryptjs";
import express from "express";
import mongoose from "mongoose"; // 👈 FIX 1: Added missing mongoose import
import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import { uploadDocuments } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

// ==========================================
// 🏥 ENDPOINT 1: Register a New Clinic Workspace & Admin
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
      // 👈 FIX 2: Hash the password before saving to MongoDB
      const hashedPassword = await bcrypt.hash(password, 10);

      // 4. STEP TWO: Create the CLINIC_ADMIN bound to this new clinic ID
      const newAdminAccount = await User.create({
        clinicId: newClinic._id, // Link them explicitly via Mongoose Object ID mapping
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: safeEmail,
        phone: phone.trim(),
        password: hashedPassword, // 👈 Saved as a bcrypt hash ($2b$10$...)
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
      clinicData = await Clinic.findById(identifier);
    } else {
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
// 📊 ENDPOINT 3: Direct ID Lookup for Patient Dashboard
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

    // 2. Query clinic collection
    const clinicData = await Clinic.findById(id);

    // 3. Fallback safety check
    if (!clinicData) {
      return res.status(404).json({
        success: false,
        message: "Target clinical location context not registered.",
      });
    }

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

router.post(
  "/:id/upload-docs",
  uploadDocuments.array("documents", 5),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No document files attached." });
      }

      const uploadedDocs = req.files.map((file) => ({
        documentName: file.originalname,
        fileUrl: `${req.protocol}://${req.get("host")}/uploads/documents/${file.filename}`,
      }));

      const clinic = await Clinic.findByIdAndUpdate(
        id,
        { $push: { submittedDocuments: { $each: uploadedDocs } } },
        { new: true },
      );

      return res.status(200).json({
        success: true,
        message:
          "Verification documents successfully submitted for SaaS review.",
        data: clinic,
      });
    } catch (error) {
      console.error("Document Upload Fault:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { slotDurationMinutes, operatingHours } = req.body;

    // 1. Structural check to ensure it's a valid 24-character hexadecimal string
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location database context structure.",
      });
    }

    // 2. Update the clinic record in MongoDB
    const updatedClinic = await Clinic.findByIdAndUpdate(
      id,
      {
        $set: {
          slotDurationMinutes: slotDurationMinutes,
          operatingHours: operatingHours,
        },
      },
      { new: true, runValidators: true },
    );

    // 3. Fallback safety check
    if (!updatedClinic) {
      return res.status(404).json({
        success: false,
        message: "Target clinical location context not registered.",
      });
    }

    // 4. Return clean JSON response
    return res.status(200).json({
      success: true,
      message: "Clinic schedule and slot duration updated successfully.",
      data: updatedClinic,
    });
  } catch (error) {
    console.error("Clinic Schedule Update Fault:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
