import express from "express";
import { registerClinicController } from "../controllers/tenantController.js";
import Clinic from "../models/clinicModel.js";

const router = express.Router();

// This handles: POST http://localhost:5000/api/v1/tenants/register
router.post("/register", registerClinicController);

router.get("/:id", async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);
    if (!clinic) {
      return res
        .status(404)
        .json({ success: false, message: "Clinic not found" });
    }
    return res.status(200).json({ success: true, data: clinic });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/slug/:slug", async (req, res) => {
  try {
    // Look up the unique slug in MongoDB
    const clinic = await Clinic.findOne({
      slug: req.params.slug.toLowerCase(),
    });

    if (!clinic) {
      return res
        .status(404)
        .json({ success: false, message: "Clinic not found" });
    }

    return res.status(200).json({ success: true, data: clinic });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
