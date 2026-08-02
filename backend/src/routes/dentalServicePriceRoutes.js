import express from "express";
import {
  getServices,
  updateServicePrice,
  addServicePrice,
  toggleServiceAvailability,
} from "../controllers/dentalServicePriceController.js";

const router = express.Router();

router.route("/services").get(getServices);
router.route("/update").patch(updateServicePrice);
router.route("/add").post(addServicePrice);
router.route("/toggle/:id").patch(toggleServiceAvailability);

export default router;
