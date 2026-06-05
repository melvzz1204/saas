import express from "express";
import {
  bookAppointment,
  getPatientAppointments,
} from "../controllers/appointmentController.js";

const router = express.Router();

// Define clean routes mapped straight to their controllers
router.post("/book", bookAppointment);
router.get("/patient/:patientId", getPatientAppointments);

export default router;
