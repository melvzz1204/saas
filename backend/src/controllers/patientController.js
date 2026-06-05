import { registerUser, loginUser } from "../services/patientService.js";

export const registerPatientController = async (req, res, next) => {
  try {
    const result = await registerUser(req.clinicId, req.body);

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully!",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
export const loginPatientController = async (req, res) => {
  try {
    const { email, password } = req.body;

    // req.clinicId comes directly from your identifyTenant middleware
    const result = await loginUser(req.clinicId, email, password);

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};
