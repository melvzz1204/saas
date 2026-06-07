import express from "express";
import {
  registerClinicalStaff,
  loginClinicalStaff,
} from "../controllers/staffController.js";

const router = express.Router();

router.post("/register", registerClinicalStaff);
router.post("/login", loginClinicalStaff);

export default router;
