import express from "express";
import {
  registerClinicalStaff,
  loginClinicalStaff,
  getClinicalStaffByRole,
} from "../controllers/staffController.js";

const router = express.Router();

router.post("/register", registerClinicalStaff);
router.post("/login", loginClinicalStaff);
router.get("/", getClinicalStaffByRole);

export default router;
