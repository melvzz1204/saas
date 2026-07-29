// src/middlewares/authMiddleware.js
import jwt from "jsonwebtoken";

// 1. Generic Token Authentication Guard
export const protectRoute = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access. Authentication token missing.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_saas_secret_key",
    );

    // Attach decoded user payload (id, role, clinicId) to the request object
    req.user = decoded;
    if (decoded.clinicId && !req.clinicId) {
      req.clinicId = decoded.clinicId;
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access. Invalid or expired token.",
    });
  }
};

// 2. Patient Route Guard
export const protectPatientRoute = (req, res, next) => {
  protectRoute(req, res, () => {
    next();
  });
};

// 3. Admin Route Guard (SUPER_ADMIN & CLINIC_ADMIN)
export const protectAdminRoute = (req, res, next) => {
  protectRoute(req, res, () => {
    const adminRoles = ["SUPER_ADMIN", "CLINIC_ADMIN"];

    if (!req.user || !adminRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Restricted to administrative personnel.",
      });
    }
    next();
  });
};

// 4. Staff Route Guard (Dentists, Staff & Admins)
export const protectStaffRoute = (req, res, next) => {
  protectRoute(req, res, () => {
    const staffRoles = [
      "SUPER_ADMIN",
      "CLINIC_ADMIN",
      "CLINIC_STAFF",
      "DENTIST",
      "dentist",
    ];

    if (!req.user || !staffRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Restricted to clinical staff members.",
      });
    }
    next();
  });
};
