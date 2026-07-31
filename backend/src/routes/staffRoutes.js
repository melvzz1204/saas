// src/routes/staffRoutes.js
import express from "express";
import {
  registerClinicalStaff,
  loginClinicalStaff,
  getClinicalStaffByRole,
<<<<<<< HEAD
=======
  resetStaffPin,
>>>>>>> Test
} from "../controllers/staffController.js"; //[cite: 22]
import { identifyTenant } from "../middlewares/tenantMiddleware.js";
import { protectStaffRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", registerClinicalStaff); //[cite: 22]
router.post("/login", loginClinicalStaff); //[cite: 22]
<<<<<<< HEAD
=======
router.post("/reset-pin", resetStaffPin);
>>>>>>> Test

// Dynamic fetch based on authenticated staff token context
router.get("/", identifyTenant, protectStaffRoute, getClinicalStaffByRole); //[cite: 22]

export default router;
