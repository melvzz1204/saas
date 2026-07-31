// src/routes/appointmentRoutes.js
import express from "express";
import {
  bookAppointment,
  getPatientAppointments,
  getTodayAppointments,
  createWalkInAppointment,
  updateAppointmentStatus,
  settlePayment,
} from "../controllers/appointmentController.js"; //[cite: 19]
import { identifyTenant } from "../middlewares/tenantMiddleware.js";
import { protectPatientRoute } from "../middlewares/authMiddleware.js";
<<<<<<< HEAD
=======
import { getAvailableSlots } from "../controllers/appointmentController.js";
>>>>>>> Test

const router = express.Router();

router.use(identifyTenant);

router.post("/book", bookAppointment); //[cite: 19]
router.get("/patient/:patientId", getPatientAppointments); //[cite: 19]
router.post("/walk-in", createWalkInAppointment); //[cite: 19]
router.patch("/:id/status", updateAppointmentStatus); //[cite: 19]
router.get("/today", getTodayAppointments); //[cite: 19]
router.patch("/settle-payment", protectPatientRoute, settlePayment); //[cite: 19]
<<<<<<< HEAD
=======
router.get("/available-slots", getAvailableSlots);
>>>>>>> Test

export default router;
