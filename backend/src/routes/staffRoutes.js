import multer from "multer";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve from the backend project root (not process cwd) and ensure the
// directory exists. `backend/public/uploads/` is gitignored, so a fresh
// production clone (Render) won't have it — without this, multer throws
// ENOENT and Express returns HTML "Internal Server Error" instead of JSON.
const staffUploadDir = path.resolve(__dirname, "../../public/uploads");
if (!fs.existsSync(staffUploadDir)) {
  fs.mkdirSync(staffUploadDir, { recursive: true });
}

// 1. Set up Multer storage (absolute path, safe filenames, image-only)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, staffUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "");
    cb(null, `profileImage-${uniqueSuffix}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Invalid file type. Only JPG, PNG, WEBP, GIF images allowed."), false);
};
export const uploadStaffImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Wrap upload.single() so Multer errors return JSON (not Express HTML error page)
export const handleStaffImageUpload = (req, res, next) => {
  uploadStaffImage.single("profileImage")(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Profile image exceeds 5MB limit."
          : err.message || "Profile image upload failed.";
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};

// 2. Parse multipart/form-data from the admin dashboard onboarding form
router.post("/register", handleStaffImageUpload, registerClinicalStaff);

router.post("/login", loginClinicalStaff);
router.post("/reset-pin", resetStaffPin);
router.get("/public/dentists", getClinicDentists);

// Dynamic fetch based on authenticated staff token context
router.get("/", identifyTenant, protectStaffRoute, getClinicalStaffByRole);

export default router;
