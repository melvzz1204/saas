import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import tenantRoutes from "./routes/tenantRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import dentalServicePrice from "./routes/dentalServicePriceRoutes.js";
import initAppointmentCleanupJob from "./utils/appointmentCleanup.js";
import treatmentRoutes from "./routes/treatmentRoutes.js";
import saasAdminRoutes from "./routes/saasAdminRoutes.js";
import clinicalNoteRoutes from "./routes/clinicalNoteRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
initAppointmentCleanupJob();

// 1. Configure CORS First
app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verification documents are stored in ../uploads/documents by multer.
// Mount this directory explicitly so URLs saved as /uploads/documents/... are viewable.
app.use(
  "/uploads/documents",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../uploads/documents")),
);

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../public/uploads")),
);

// API Routes
app.use("/api/v1/tenants", tenantRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/appointments", appointmentRoutes);
app.use("/api/v1/staff", staffRoutes);
app.use("/api/v1/treatments", treatmentRoutes);
app.use("/api/v1/dental-price", dentalServicePrice);
app.use("/api/v1/saas-admin", saasAdminRoutes);
app.use("/api/v1/clinical-notes", clinicalNoteRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running smoothly" });
});

export default app;
