import express from "express";
import {
  bookAppointment,
  getPatientAppointments,
  getTodayAppointments,
  createWalkInAppointment,
  updateAppointmentStatus,
} from "../controllers/appointmentController.js";

const router = express.Router();

// Define clean routes mapped straight to their controllers
router.post("/book", bookAppointment);
router.get("/patient/:patientId", getPatientAppointments);
router.post("/walk-in", createWalkInAppointment);
router.patch("/:id/status", updateAppointmentStatus);
router.get("/today", getTodayAppointments);

export default router;
