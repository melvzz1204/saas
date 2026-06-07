// src/controllers/staffController.js
import Staff from "../models/staffModel.js";
import jwt from "jsonwebtoken";

export const registerClinicalStaff = async (req, res) => {
  try {
    // 🎯 FIX: Destructure 'fullName' instead of 'name' from the incoming body
    const { fullName, specialization, role, email, phone, accessPin } =
      req.body;
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
      fullName: fullName.trim(), // 🎯 FIX: Matches your model specification perfectly now
      specialization: specialization
        ? specialization.trim()
        : "General Dentistry",
      role,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      accessPin: accessPin.toString(),
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
