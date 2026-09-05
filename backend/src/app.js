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

// Configure CORS before JSON parsing and routes. Explicitly handling the
// preflight avoids browsers receiving a bare 204 without CORS headers.
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const isLocalOrigin =
    !requestOrigin ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);

  if (isLocalOrigin && requestOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "Content-Type, Authorization",
  );

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
