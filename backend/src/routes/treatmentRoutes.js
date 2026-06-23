// src/routes/treatmentRoutes.js
import express from "express";
import { completeProcedure } from "../controllers/treatmentController.js";
import { protectPatientRoute } from "../middlewares/authMiddleware.js";
import { getDentistQueue } from "../controllers/treatmentController.js";
const router = express.Router();

router.patch("/complete-session", protectPatientRoute, completeProcedure);
router.get("/queue", protectPatientRoute, getDentistQueue);
export default router;
