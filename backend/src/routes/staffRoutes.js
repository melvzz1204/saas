import multer from "multer";
import express from "express";
import {
  registerClinicalStaff,
  loginClinicalStaff,
  getClinicalStaffByRole,
  resetStaffPin,
  getClinicDentists,
} from "../controllers/staffController.js";
import { identifyTenant } from "../middlewares/tenantMiddleware.js";
import { protectStaffRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

// 1. Set up basic Multer storage FIRST (before the routes)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/"); // Make sure this folder exists in your backend!
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

// 2. 🎯 THE FIX: Add upload.single() right here to your actual controller!
router.post("/register", upload.single("profileImage"), registerClinicalStaff);

router.post("/login", loginClinicalStaff);
router.post("/reset-pin", resetStaffPin);
router.get("/public/dentists", getClinicDentists);

// Dynamic fetch based on authenticated staff token context
router.get("/", identifyTenant, protectStaffRoute, getClinicalStaffByRole);

export default router;
