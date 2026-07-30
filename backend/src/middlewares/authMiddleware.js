import User from "../models/userModel.js";
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
export const protectSaasAdminRoute = async (req, res, next) => {
  try {
    let token;

    // 1. Extract Bearer Token from headers
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated. Token missing.",
      });
    }

    // 2. Verify JWT signature
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback-secret-key",
    );

    // 3. Retrieve user from database
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed. Admin account not found.",
      });
    }

    // 4. Verify SaaS Admin clearance
    if (user.role !== "SUPER_ADMIN" && user.role !== "SAAS_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access Denied. SaaS Administrator clearance required.",
      });
    }

    // 5. Attach user object to request and proceed
    req.user = user;
    next();
  } catch (error) {
    console.error("🔥 SaaS Admin Auth Error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Not authenticated. Invalid or expired token.",
    });
  }
};
