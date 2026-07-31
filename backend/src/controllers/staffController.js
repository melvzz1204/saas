// src/controllers/staffController.js
import Staff from "../models/staffModel.js";

import jwt from "jsonwebtoken";

export const registerClinicalStaff = async (req, res) => {
  try {
    // 🎯 FIX: Added accessPin to the destructuring so it doesn't throw a ReferenceError
    const {
      fullName,
      role,
      specialization,
      email,
      phone,
      accessPin,
      licenseNumber,
      experienceYears,
      bio,
    } = req.body;

    const clinicId = req.headers["x-clinic-id"];

    // 1. Data Sanitization and Validation Guard
    if (!fullName || !role || !email || !phone || !accessPin || !clinicId) {
      return res.status(400).json({
        success: false,
        message: "Payload integrity check failed: Missing required parameters.",
      });
    }

    // 2. Cross-Collision Duplication Verification
    const explicitEmailConflict = await Staff.findOne({
      email: email.toLowerCase().trim(),
    });
    if (explicitEmailConflict) {
      return res.status(409).json({
        success: false,
        message:
          "A staff member is already registered with this email address.",
      });
    }

    // 3. Hydrate Instance Matching the Passwordless Architecture
    const freshStaffNode = new Staff({
      clinicId: clinicId,
      fullName: fullName.trim(),
      specialization: specialization
        ? specialization.trim()
        : "General Dentistry",
      role,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      accessPin: accessPin.toString(),

      // 🎯 FIX: We are now actually passing the new variables into the Mongoose document!
      licenseNumber: licenseNumber ? licenseNumber.trim() : "",
      experienceYears: experienceYears ? parseInt(experienceYears, 10) : 0,
      bio: bio ? bio.trim() : "",

      // 🎯 FIX: Check if Multer caught a file. If yes, save the filename. If no, use default.
      profileImage: req.file ? req.file.filename : "default-avatar.png",
    });

    // 4. Commit to Persistent Database Engine
    await freshStaffNode.save();

    // 5. Return success frame back to your admin dashboard
    return res.status(201).json({
      success: true,
      message: "Clinical personnel records saved successfully.",
      staff: {
        id: freshStaffNode._id,
        fullName: freshStaffNode.fullName,
        role: freshStaffNode.role,
        email: freshStaffNode.email,
      },
    });
  } catch (error) {
    console.error(
      "Critical Exception Caught inside staff register controller:",
      error,
    );
    return res.status(500).json({
      success: false,
      message:
        "Internal framework exception: Failed to write staff configuration data structure.",
    });
  }
};
export const loginClinicalStaff = async (req, res) => {
  try {
    const { email, accessPin } = req.body;

    if (!email || !accessPin) {
      return res.status(400).json({
        success: false,
        message:
          "Login failed: Missing email address or security access PIN code.",
      });
    }

    // 🏢 1. UPDATE: Add .populate("clinicId") here to extract full clinic profile data
    const currentStaffNode = await Staff.findOne({
      email: email.toLowerCase().trim(),
    }).populate("clinicId");

    if (!currentStaffNode) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid credentials. Verify workspace email or terminal PIN entry.",
      });
    }

    if (currentStaffNode.accessPin !== accessPin.toString()) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid credentials. Verify workspace email or terminal PIN entry.",
      });
    }

    if (currentStaffNode.status !== "Active") {
      return res.status(403).json({
        success: false,
        message:
          "Access Suspended: Current profile record node is locked down or inactive.",
      });
    }

    const token = jwt.sign(
      {
        id: currentStaffNode._id,
        role: "CLINIC_STAFF",
        clinicId: currentStaffNode.clinicId._id, // Extract ID from populated object safely
      },
      process.env.JWT_SECRET || "fallback_security_string_key",
      { expiresIn: "12h" },
    );

    // 🎯 2. EXTRACTION: Pull out the dynamic clinic name safely from the database document
    // (Adjust '.name' if your Clinic Schema uses a different key name like '.clinicName')
    const registeredClinicName = currentStaffNode.clinicId
      ? currentStaffNode.clinicId.name
      : "Apex Dental Practice";

    // 3. Return response with the custom clinicName included!
    return res.status(200).json({
      success: true,
      message: "Duty station terminal authentication verified successfully.",
      token,
      clinicName: registeredClinicName, // 👈 THIS IS SENT TO YOUR FRONTEND NOW!
      staff: {
        id: currentStaffNode._id,
        fullName: currentStaffNode.fullName,
        role: currentStaffNode.role,
        clinicId: currentStaffNode.clinicId._id,
      },
    });
  } catch (error) {
    console.error(
      "Critical Exception Caught inside staff login controller node:",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Internal runtime ecosystem server failure.",
    });
  }
};

export const getClinicalStaffByRole = async (req, res) => {
  try {
    // 1. Destructure role and optional clinic selectors from the query
    const { role, clinicName, clinicId } = req.query;

    // 2. Also check if your authentication middleware populated req.user from the JWT token
    const tokenClinicName = req.user?.clinicName;
    const tokenClinicId = req.user?.clinicId;

    const filter = {};

    // Build role filter
    if (role) {
      filter.role = { $regex: new RegExp(`^${role}$`, "i") };
    }

    // 🎯 THE FIX: Constrain the search to the active clinic context only!
    // We prioritize secure token data over easily spoofed URL query parameters
    const activeClinicId = tokenClinicId || clinicId;
    const activeClinicName = tokenClinicName || clinicName;

    if (activeClinicId) {
      filter.clinicId = activeClinicId; // Mapped by database ID string
    } else if (activeClinicName) {
      // Mapped by name string (case-insensitive regex to protect against typos)
      filter.clinicName = {
        $regex: new RegExp(`^${activeClinicName.trim()}$`, "i"),
      };
    }

    // Query your Staff model collection with the isolated clinic workspace filter
    const staff = await Staff.find(filter).select("-password"); // Hide password hashes safely

    return res.status(200).json({
      success: true,
      count: staff.length,
      staff,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================================
// 🔑 RESET STAFF ACCESS PIN
// =========================================================================
export const resetStaffPin = async (req, res) => {
  try {
    const { staffId } = req.body;
    const clinicId = req.headers["x-clinic-id"]; // Extra security: ensure admin owns this staff

    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: "Staff ID is required.",
      });
    }

    // 1. Generate a new random 6-digit PIN (Matches your onboarding logic)
    const tempPin = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Update the Staff document in the database
    // We check clinicId too so an admin can't reset a PIN for a different clinic's staff
    const updatedStaff = await Staff.findOneAndUpdate(
      { _id: staffId, clinicId: clinicId },
      {
        accessPin: tempPin,
        // mustChangePin: true // Uncomment if you add this to your schema later
      },
      { new: true },
    );

    if (!updatedStaff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found in your clinic directory.",
      });
    }

    // 3. Return the new temporary PIN to the Admin dashboard
    res.status(200).json({
      success: true,
      message: "Security PIN reset successfully.",
      tempPin, // This matches what the frontend expects!
    });
  } catch (error) {
    console.error("Reset PIN Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error resetting staff PIN.",
    });
  }
};

// =========================================================================
// 🦷 NEW: FETCH PUBLIC DENTIST PROFILES (For Patient Dashboard)
// =========================================================================
export const getClinicDentists = async (req, res) => {
  try {
    const { clinicId } = req.query;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: "Clinic ID is required to fetch dentists.",
      });
    }

    // Find all active Dentists for this specific clinic
    const dentists = await Staff.find({
      clinicId: clinicId,
      role: "Dentist",
      status: "Active",
    }).select("-accessPin -__v -createdAt -updatedAt"); // Exclude sensitive fields

    res.status(200).json({
      success: true,
      dentists: dentists,
    });
  } catch (error) {
    console.error("Error fetching clinic dentists:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while loading dentist profiles.",
    });
  }
};
