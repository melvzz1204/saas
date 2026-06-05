import express from "express";
import {
  registerPatientController,
  loginPatientController,
} from "../controllers/patientController.js";
import { identifyTenant } from "../midllewares/tenantMiddleware.js";

const router = express.Router();

router.post("/register", identifyTenant, registerPatientController);
router.post("/login", identifyTenant, loginPatientController);

export default router;
