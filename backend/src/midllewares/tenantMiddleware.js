export const identifyTenant = (req, res, next) => {
  const clinicId = req.headers["x-clinic-id"];

  if (!clinicId) {
    return res.status(400).json({
      success: false,
      message:
        "Access Denied: Missing X-Clinic-ID header. Tenant context required.",
    });
  }

  req.clinicId = clinicId;

  next();
};
