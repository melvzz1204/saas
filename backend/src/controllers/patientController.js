import { registerUser, loginUser } from "../services/patientService.js";

// 📝 Patient Registration Controller
export const registerPatientController = async (req, res, next) => {
  try {
    // req.clinicId is injected cleanly by your tenant context middleware
    const result = await registerUser(req.clinicId, req.body);

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

    // Execute core authentication business logic via service layer
    const result = await loginUser(req.clinicId, email, password);

    // 🛡️ CRITICAL SANITIZATION GATES:
    // Force native MongoDB BSON Binary ObjectIds to render as explicit, unclipped 24-character strings.
    // This stops the browser network pipeline from truncating them into an ellipsis representation!
    const cleanPatientId = result.user._id ? result.user._id.toString() : "";
    const cleanClinicId = (
      result.user.clinicId ||
      req.clinicId ||
      ""
    ).toString();

    console.log("🌟 BACKEND TRANSIT MATRIX CHECK:");
    console.log("-> Outbound Patient ID String:", cleanPatientId);
    console.log("-> Outbound Clinic ID String:", cleanClinicId);

    // 🚀 UNIFIED DELIVERABLE: Wraps token and user data perfectly for the frontend fetch layer
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      data: {
        token: result.token,
        user: {
          _id: cleanPatientId,
          clinicId: cleanClinicId, // 🔗 Crucial tenant boundary anchor!
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          email: result.user.email,
          role: result.user.role || "PATIENT",
        },
      },
    });
  } catch (error) {
    console.error("❌ Authentication Layer Exception Caught:", error.message);
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};
