// src/routes/adminRoutes.js
import express from "express";
import {
  addStaffMember,
  getClinicStaff,
  loginAdmin,
} from "../controllers/adminController.js";
import { registerClinicalStaff } from "../controllers/staffController.js";

// 🎯 FIX: Import the populated appointment engines from the appointment controller file
import {
  getAdminAppointments,
  modifyAppointmentStatus,
} from "../controllers/appointmentController.js";

const router = express.Router();

// 🔐 Authentication Node
router.post("/login", loginAdmin);

// 📅 Live Appointment Queue Management (Connected to your Populated Mongoose Controller)
router.get("/appointments", getAdminAppointments);
router.patch("/appointments/:appointmentId", modifyAppointmentStatus);

// 🩺 Internal Clinic Staff Framework
router.post("/staff", addStaffMember);
router.get("/staff", getClinicStaff);
router.post("/staff/register", registerClinicalStaff);

export default router;
