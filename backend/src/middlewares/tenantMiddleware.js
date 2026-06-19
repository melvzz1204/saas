// Inside your tenantMiddleware.js
export const identifyTenant = (req, res, next) => {
  let clinicId = req.headers["x-clinic-id"] || req.headers["X-Clinic-ID"];

  // 🛡️ Safe Split Check: If duplicate headers are sent, grab only the first valid 24-char segment
  if (clinicId && clinicId.includes(",")) {
    clinicId = clinicId.split(",")[0].trim();
  }

  console.log(
    "TENANT MIDDLEWARE DEBUG -> Sanitized Clinic ID Header:",
    clinicId,
  );

  if (!clinicId || clinicId === "undefined" || clinicId === "null") {
    return res.status(400).json({
      success: false,
      message:
        "Access Denied: Missing X-Clinic-ID header. Tenant context required.",
    });
  }

  req.clinicId = clinicId;
  next();
};
