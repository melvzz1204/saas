// src/routes/treatmentRoutes.js
import express from "express";
import { completeProcedure } from "../controllers/treatmentController.js";
import { protectPatientRoute } from "../middlewares/authMiddleware.js";
const router = express.Router();

router.patch("/complete-session", protectPatientRoute, completeProcedure);
export default router;
