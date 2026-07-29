// src/routes/adminRoutes.js
import express from "express";
import {
  addStaffMember,
  getClinicStaff,
  loginAdmin,
} from "../controllers/adminController.js"; //[cite: 18]
import { registerClinicalStaff } from "../controllers/staffController.js"; //[cite: 18]
import {
  getAdminAppointments,
  modifyAppointmentStatus,
} from "../controllers/appointmentController.js"; //[cite: 18]
import { identifyTenant } from "../middlewares/tenantMiddleware.js";
import { protectAdminRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

// 🔐 Authentication Node
router.post("/login", loginAdmin); //[cite: 18]

// Apply dynamic tenant context & authentication protection to all admin endpoints
router.use(identifyTenant);

// 📅 Live Appointment Queue Management
router.get("/appointments", protectAdminRoute, getAdminAppointments); //[cite: 18]
router.patch(
  "/appointments/:appointmentId",
  protectAdminRoute,
  modifyAppointmentStatus,
); //[cite: 18]

// 🩺 Internal Clinic Staff Framework
router.post("/staff", protectAdminRoute, addStaffMember); //[cite: 18]
router.get("/staff", protectAdminRoute, getClinicStaff); //[cite: 18]
router.post("/staff/register", protectAdminRoute, registerClinicalStaff); //[cite: 18]

export default router;
