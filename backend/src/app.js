import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import tenantRoutes from "./routes/tenantRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/tenants", tenantRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/appointments", appointmentRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running smoothly" });
});

export default app;
