// tests/helpers/testApp.js
// Minimal express app that mounts the tenant routes so endpoint tests can run
// without importing the full server (no cron jobs, no websockets).

import express from "express";
import tenantRoutes from "../../src/routes/tenantRoutes.js";

export function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/v1/tenants", tenantRoutes);
  return app;
}