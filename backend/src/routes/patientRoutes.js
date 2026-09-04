import express from "express";
import {
  registerPatientController,
  loginPatientController,
  getPatientProfileController,
  getPatientProfileForStaffController,
  savePatientProfileController,
} from "../controllers/patientController.js";
import { identifyTenant } from "../middlewares/tenantMiddleware.js"; // Fixed spelling typo
import {
  protectPatientRoute,
  protectStaffRoute,
} from "../middlewares/authMiddleware.js"; // Fixed spelling typo

const router = express.Router();

router.use(identifyTenant);

router.post("/register", identifyTenant, registerPatientController);
router.post("/login", identifyTenant, loginPatientController);

// 📑 Clinical & Intake Profile Operations Matrix
router.get(
  "/profile/:patientId",
  identifyTenant,
  protectStaffRoute,
  getPatientProfileForStaffController,
);

router
  .route("/profile")
  .get(identifyTenant, protectPatientRoute, getPatientProfileController)
  .post(identifyTenant, protectPatientRoute, savePatientProfileController);
export default router;
