import { registerUser, loginUser } from "../services/patientService.js";
import PatientFullInfo from "../models/patientFullInfoModel.js";
import User from "../models/userModel.js";

// src/controllers/patientController.js
<<<<<<< HEAD
// src/controllers/patientController.js

=======
>>>>>>> Test
export const registerPatientController = async (req, res) => {
  try {
    // 👈 FALLBACK RESOLVER: Reads from middleware, headers, or body
    const clinicId =
      req.clinicId || req.headers["x-clinic-id"] || req.body?.clinicId;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: "Missing tenant context: clinicId is required.",
      });
    }

    const result = await registerUser(clinicId, req.body);

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully!",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// 🔐 Patient Login Controller
export const loginPatientController = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(req.clinicId, email, password);

    const cleanPatientId = result.user._id ? result.user._id.toString() : "";
    const cleanClinicId = (
      result.user.clinicId ||
      req.clinicId ||
      ""
    ).toString();

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      data: {
        token: result.token,
        user: {
          _id: cleanPatientId,
          clinicId: cleanClinicId,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          email: result.user.email,
          role: result.user.role || "PATIENT",
        },
      },
    });
  } catch (error) {
    console.error("❌ Auth Error:", error.message);
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

// 📑 Inside your backend patientController.js
export const getPatientProfileController = async (req, res) => {
  try {
    // ✨ FIX: Added req.user?.userId to match your JWT payload signature!
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    const clinicId = req.clinicId || req.user?.clinicId;

    console.log("CONTROLLER DEBUG -> Resolved Patient ID:", userId);
    console.log("CONTROLLER DEBUG -> Resolved Clinic ID:", clinicId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing Patient Identity context from authentication token.",
      });
    }

    // 1. Check if the detailed medical/intake profile already exists
    let profile = await PatientFullInfo.findOne({ userId, clinicId });

    if (profile) {
      return res.status(200).json({
        success: true,
        isNewForm: false,
        message: "Detailed patient profile retrieved.",
        data: profile,
      });
    }

    // 2. Profile doesn't exist yet: Fetch core account to pre-fill form safely
    const baseUser = await User.findById(userId);
    if (!baseUser) {
      return res.status(404).json({
        success: false,
        message: "Base user account profile not found.",
      });
    }

    // SAFE DATE EXTRACTION WRAPPER: Prevents system 400 crashes
    let safeBirthdate = "";
    if (baseUser.dateOfBirth) {
      if (baseUser.dateOfBirth instanceof Date) {
        safeBirthdate = baseUser.dateOfBirth.toISOString().split("T")[0];
      } else {
        safeBirthdate = String(baseUser.dateOfBirth).split("T")[0];
      }
    }

    // 3. Inject matching baseline properties for your frontend form fields
    const prefilledData = {
      userId: baseUser._id.toString(),
      clinicId: (baseUser.clinicId || clinicId).toString(),
      firstName: baseUser.firstName || "",
      lastName: baseUser.lastName || "",
      emailAddress: baseUser.email || "",
      birthdate: safeBirthdate,
      cellMobileNo: baseUser.phone || "",
    };

    return res.status(200).json({
      success: true,
      isNewForm: true,
      message: "No existing profile found. Injection payload generated.",
      data: prefilledData,
    });
  } catch (error) {
    console.error("❌ Profile Retrieval Layer Exception:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load or compile patient intake configuration.",
      error: error.message,
    });
  }
};
// 💾 Save / Update Intake Form (Upsert)
export const savePatientProfileController = async (req, res) => {
  try {
    const userId =
      req.user?._id || req.user?.id || req.body.userId || req.body.patientId;
    const clinicId = req.clinicId || req.user?.clinicId || req.body.clinicId;

    if (!userId || !clinicId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing crucial identity tags (userId or clinicId) from session.",
      });
    }

    const finalFormPayload = {
      ...req.body,
      userId: userId.toString(),
      clinicId: clinicId.toString(),
    };

    const savedProfile = await PatientFullInfo.findOneAndUpdate(
      { userId, clinicId },
      finalFormPayload,
      { new: true, upsert: true, runValidators: true },
    );

    return res.status(200).json({
      success: true,
      message: "Detailed patient record logged successfully!",
      data: savedProfile,
    });
  } catch (error) {
    console.error("❌ Profile Saving Layer Exception:", error.message);
    return res.status(400).json({
      success: false,
      message: "Failed to persist detailed patient record.",
      error: error.message,
    });
  }
};
