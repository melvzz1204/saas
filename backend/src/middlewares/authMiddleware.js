import User from "../models/userModel.js";
import Clinic from "../models/clinicModel.js";
import jwt from "jsonwebtoken";

// Single shared dev fallback so tokens issued by one guard verify in another.
// Production MUST set JWT_SECRET (see warn below).
const FALLBACK_JWT_SECRET = "fallback_saas_secret_key";
if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠️ [AUTH] JWT_SECRET is not set — using insecure dev fallback. Set JWT_SECRET in production.",
  );
}
const jwtSecret = () => process.env.JWT_SECRET || FALLBACK_JWT_SECRET;

// 1. Generic Token Authentication Guard (Resilient Hybrid Fallback)
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

    // Verify JWT Signature
    const decoded = jwt.verify(token, jwtSecret());

    // Extract ID from any common key name
    const targetId = decoded.id || decoded._id || decoded.userId;

    let dbUser = null;
    if (targetId) {
      try {
        dbUser = await User.findById(targetId).select("-password").lean();
      } catch (dbErr) {
        // DB lookup optional; fall back to JWT payload
      }
    }

    // Fall back to decoded JWT payload if DB user isn't found
    req.user = dbUser ? { ...decoded, ...dbUser } : decoded;

    // Attach clinic context
    if ((req.user.clinicId || decoded.clinicId) && !req.clinicId) {
      req.clinicId = req.user.clinicId || decoded.clinicId;
    }

    next();
  } catch (error) {
    console.error("🔥 protectRoute Error:", error.message);
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
    const userRole = String(
      req.user?.role || req.user?.userRole || "",
    ).toUpperCase();

    if (!req.user || !adminRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Restricted to administrative personnel.",
      });
    }
    if (userRole === "CLINIC_ADMIN") {
      Clinic.findById(req.user.clinicId)
        .select("applicationStatus")
        .lean()
        .then((clinic) => {
          if (["Rejected", "Pending"].includes(clinic?.applicationStatus)) {
            return res.status(423).json({
              success: false,
              code: "CLINIC_APPLICATION_LOCKED",
              applicationStatus: clinic.applicationStatus,
              message:
                clinic.applicationStatus === "Rejected"
                  ? "Your clinic application was rejected. Resubmit both verification documents to continue."
                  : "Your clinic application is pending review.",
            });
          }
          next();
        })
        .catch((error) => {
          console.error("Clinic application status check failed:", error);
          return res.status(503).json({
            success: false,
            message: "Unable to verify clinic application status.",
          });
        });
      return;
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
    ];

    const userRole = String(
      req.user?.role || req.user?.userRole || "",
    ).toUpperCase();

    if (!req.user || !staffRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Restricted to clinical staff members.",
      });
    }
    next();
  });
};

// 5. SaaS Admin Guard
export const protectSaasAdminRoute = async (req, res, next) => {
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
        message: "Not authenticated. Token missing.",
      });
    }

    const decoded = jwt.verify(token, jwtSecret());

    const user = await User.findById(decoded.id || decoded._id).select(
      "-password",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed. Admin account not found.",
      });
    }

    if (user.role !== "SUPER_ADMIN" && user.role !== "SAAS_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access Denied. SaaS Administrator clearance required.",
      });
    }

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

// 5. Dynamic Role Authorization Guard (With Diagnostic Logging)
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. Debug Log: Print user payload to backend terminal
    console.log("🔍 [AUTH CHECK] req.user payload:", req.user);

    // Extract role from any common property name
    const rawRole =
      req.user?.role ||
      req.user?.userRole ||
      req.user?.type ||
      req.user?.roleName;

    // Deny by default: a missing role must never satisfy a role gate.
    if (!rawRole) {
      console.warn(
        "🔒 [ACCESS DENIED] No role found in req.user | Required: [" +
          targetRoles.join(", ") +
          "]",
      );
      return res.status(403).json({
        success: false,
        message:
          "Access denied: You do not have permission to perform this action.",
      });
    }

    const userRole = String(rawRole).toUpperCase().trim();
    const targetRoles = allowedRoles.map((r) => String(r).toUpperCase().trim());

    // Expand staff/dentist synonyms
    const staffSynonyms = [
      "DENTIST",
      "DOCTOR",
      "STAFF",
      "CLINIC_STAFF",
      "ADMIN",
      "CLINIC_ADMIN",
      "SUPER_ADMIN",
    ];
    const isTargetingStaff = targetRoles.some((r) => staffSynonyms.includes(r));
    const isUserStaff = staffSynonyms.includes(userRole);

    if (!targetRoles.includes(userRole) && !(isTargetingStaff && isUserStaff)) {
      console.warn(
        `🔒 [ACCESS DENIED] User Role: "${userRole}" | Required: [${targetRoles.join(", ")}]`,
      );
      return res.status(403).json({
        success: false,
        message:
          "Access denied: You do not have permission to perform this action.",
      });
    }

    next();
  };
};
