import express from "express";
import {
  getServices,
  updateServicePrice,
  addServicePrice,
} from "../controllers/dentalServicePriceController.js";

const router = express.Router();

router.route("/services").get(getServices);

router.route("/update").patch(updateServicePrice);

router.route("/add").post(addServicePrice);

export default router;
