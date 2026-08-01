import express from "express";
import {
  createClinicalNote,
  getPatientHistoryForDentist,
  getMyClinicalNotes,
} from "../controllers/clinicalNoteController.js";

// ✅ FIXED: Changed 'protect' to 'protectRoute' to match your middleware file
import { protectRoute, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Require authentication for all routes
router.use(protectRoute);

// 1. Submit Note (Dentists & Staff only)
router.post(
  "/",
  authorize(
    "DENTIST",
    "Dentist",
    "STAFF",
    "staff",
    "ADMIN",
    "admin",
    "CLINIC_ADMIN",
    "SUPER_ADMIN",
  ),
  createClinicalNote,
);

// 2. Dentist views full history of a returning patient
router.get(
  "/patient/:patientId",
  authorize(
    "DENTIST",
    "Dentist",
    "STAFF",
    "staff",
    "ADMIN",
    "admin",
    "CLINIC_ADMIN",
    "SUPER_ADMIN",
  ),
  getPatientHistoryForDentist,
);

// 3. Patient views their own notes dashboard
router.get("/my-notes", authorize("PATIENT"), getMyClinicalNotes);

export default router;
