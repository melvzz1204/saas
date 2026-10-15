import express from "express";
import {
  createPrescription,
  getPatientPrescriptions,
  getAppointmentPrescriptions,
  getMyPrescriptions,
  cancelPrescription,
} from "../controllers/prescriptionController.js";
import { protectRoute, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protectRoute);

// Dentist / staff writes a prescription
router.post(
  "/",
  authorize("DENTIST", "Dentist", "STAFF", "staff", "ADMIN", "admin", "CLINIC_ADMIN", "SUPER_ADMIN"),
  createPrescription,
);

// Dentist / staff views one patient's prescriptions
router.get(
  "/patient/:patientId",
  authorize("DENTIST", "Dentist", "STAFF", "staff", "ADMIN", "admin", "CLINIC_ADMIN", "SUPER_ADMIN"),
  getPatientPrescriptions,
);

// Prescriptions for one appointment
router.get("/appointment/:appointmentId", getAppointmentPrescriptions);

// Patient views their own prescriptions
router.get("/my-prescriptions", authorize("PATIENT"), getMyPrescriptions);

// Dentist cancels a prescription
router.patch(
  "/:id/cancel",
  authorize("DENTIST", "Dentist", "STAFF", "staff", "ADMIN", "admin", "CLINIC_ADMIN", "SUPER_ADMIN"),
  cancelPrescription,
);

export default router;
