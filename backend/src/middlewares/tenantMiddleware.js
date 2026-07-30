// src/middlewares/tenantMiddleware.js
export const identifyTenant = (req, res, next) => {
  // 🔓 1. Bypass tenant context requirement for public authentication routes
  const publicPaths = ["/login", "/setup-admin", "/register"];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  // 🔒 2. Extract tenant ID from headers or user token context for protected routes
  const clinicId = req.headers["x-clinic-id"] || req.user?.clinicId;

  if (!clinicId) {
    return res.status(400).json({
      success: false,
      message:
        "Access Denied: Missing X-Clinic-ID header. Tenant context required.",
    });
  }

  // Attach clinicId to request
  req.clinicId = clinicId;
  next();
};
