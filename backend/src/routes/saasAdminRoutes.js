import express from "express";
import {
  createInitialSaasAdmin,
  loginSaasAdmin,
  getPlatformOverview,
  getPlatformTenants,
  toggleTenantStatus,
  getPendingApplications,
  reviewApplication,
} from "../controllers/saasAdminController.js";
import { protectSaasAdminRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

// 🔓 PUBLIC ROUTES (Must sit BEFORE middleware layer)
router.post("/setup-admin", createInitialSaasAdmin);
router.post("/login", loginSaasAdmin); // 👈 2. Place login route HERE!

// 🔒 PROTECTED ROUTES (Everything below this line requires a valid JWT token)
router.use(protectSaasAdminRoute);

// 📊 Global Platform Metrics
router.get("/dashboard-stats", getPlatformOverview);

// 🏥 Tenant Management
router.get("/tenants", getPlatformTenants);
router.patch("/tenants/:clinicId/status", toggleTenantStatus);

// 📋 Application Vetting
router.get("/applications/pending", getPendingApplications);
router.patch("/applications/:clinicId/review", reviewApplication);

export default router;
