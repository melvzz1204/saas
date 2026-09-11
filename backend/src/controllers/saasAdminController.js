import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import Appointment from "../models/appointmentModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
} from "../services/emailService.js";

// Create Initial SaaS Admin Account
export const createInitialSaasAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, adminSecret } =
      req.body;

    const SECRET_KEY =
      process.env.SAAS_ADMIN_SECRET || "super-secret-capstone-key";
    if (adminSecret !== SECRET_KEY) {
      return res.status(403).json({
        success: false,
        message: "Invalid admin creation secret key.",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Account with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const saasAdmin = await User.create({
      firstName,
      lastName,
      email,
      phone: phone || "0000000000", // Fallback phone number
      password: hashedPassword,
      role: "SAAS_ADMIN",
      isActive: true,
      // Notice: clinicId is omitted because SAAS_ADMIN operates globally across all clinics!
    });

    return res.status(201).json({
      success: true,
      message: "SaaS Admin account created successfully!",
      data: {
        id: saasAdmin._id,
        email: saasAdmin.email,
        role: saasAdmin.role,
      },
    });
  } catch (error) {
    console.error("🔥 Error creating SaaS Admin:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
// 1. Get Global Platform Statistics
//
// Returns all-time totals plus period-over-period growth (last 30 days vs the
// prior 30 days) and an appointment status breakdown so the dashboard can show
// trends and a patient-flow funnel instead of context-free counters.
const WINDOW_DAYS = 30;

// Percentage change helper. Returns null when there is no prior baseline so the
// UI can render "new" instead of a misleading +100%/∞.
const deltaPct = (current, previous) => {
  if (!previous) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

export const getPlatformOverview = async (req, res) => {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400000);
    const priorStart = new Date(now.getTime() - 2 * WINDOW_DAYS * 86400000);

    const countWindow = (Model, filter = {}) =>
      Promise.all([
        Model.countDocuments({ ...filter, createdAt: { $gte: windowStart } }),
        Model.countDocuments({
          ...filter,
          createdAt: { $gte: priorStart, $lt: windowStart },
        }),
      ]);

    const [
      totalClinics,
      activeClinics,
      pendingApplications,
      approvedClinics,
      totalPatients,
      totalAppointments,
      [clinicsCurrent, clinicsPrior],
      [patientsCurrent, patientsPrior],
      [apptCurrent, apptPrior],
      statusGroups,
    ] = await Promise.all([
      Clinic.countDocuments(),
      Clinic.countDocuments({ isActive: true, applicationStatus: "Approved" }),
      Clinic.countDocuments({ applicationStatus: "Pending" }),
      Clinic.countDocuments({ applicationStatus: "Approved" }),
      User.countDocuments({ role: "PATIENT" }),
      Appointment.countDocuments(),
      countWindow(Clinic),
      countWindow(User, { role: "PATIENT" }),
      countWindow(Appointment),
      Appointment.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    // Fold the rich appointment status enum into patient-flow stages.
    const byStatus = statusGroups.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    const pick = (...keys) => keys.reduce((sum, k) => sum + (byStatus[k] || 0), 0);

    const funnel = {
      scheduled: pick("Pending", "Approved"),
      inLobby: pick("checked-in", "waiting"),
      inChair: pick("in-treatment", "treatment"),
      completed: pick("completed"),
      noShow: pick("Missed"),
      cancelled: pick("cancelled", "Declined"),
    };
    const resolved = funnel.completed + funnel.noShow + funnel.cancelled;
    const noShowRate = resolved
      ? Math.round((funnel.noShow / resolved) * 1000) / 10
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalClinics,
          activeClinics,
          pendingApplications,
          approvedClinics,
          totalPatients,
          totalAppointments,
        },
        growth: {
          windowDays: WINDOW_DAYS,
          clinics: {
            current: clinicsCurrent,
            previous: clinicsPrior,
            deltaPct: deltaPct(clinicsCurrent, clinicsPrior),
          },
          patients: {
            current: patientsCurrent,
            previous: patientsPrior,
            deltaPct: deltaPct(patientsCurrent, patientsPrior),
          },
          appointments: {
            current: apptCurrent,
            previous: apptPrior,
            deltaPct: deltaPct(apptCurrent, apptPrior),
          },
        },
        appointmentFunnel: funnel,
        noShowRate,
      },
    });
  } catch (error) {
    console.error("🔥 SaaS Dashboard Metrics Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to compile platform metrics." });
  }
};

// 2. Get All Registered Tenants (Clinics)
export const getPlatformTenants = async (req, res) => {
  try {
    const clinics = await Clinic.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: clinics,
    });
  } catch (error) {
    console.error("🔥 SaaS Tenant Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tenant directory.",
    });
  }
};

// 3. Toggle Tenant Active Status (Suspend/Activate Clinics)
export const toggleTenantStatus = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { isActive } = req.body;

    const updatedClinic = await Clinic.findByIdAndUpdate(
      clinicId,
      { isActive },
      { new: true },
    );

    if (!updatedClinic) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant workspace not found." });
    }

    return res.status(200).json({
      success: true,
      message: `Clinic status successfully updated to ${isActive ? "Active" : "Suspended"}.`,
      data: updatedClinic,
    });
  } catch (error) {
    console.error("🔥 SaaS Tenant Status Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to modify tenant status." });
  }
};

// 4. Get Pending Clinic Applications
export const getPendingApplications = async (req, res) => {
  try {
    const pendingClinics = await Clinic.find({
      applicationStatus: "Pending",
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: pendingClinics,
    });
  } catch (error) {
    console.error("🔥 Error fetching pending applications:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to retrieve applications." });
  }
};

// 5. Review Application (Approve/Reject with Notification)
export const reviewApplication = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'Approved' or 'Rejected'.",
      });
    }

    if (
      status === "Rejected" &&
      (!rejectionReason || rejectionReason.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        message: "A rejection reason must be provided to notify the tenant.",
      });
    }

    const updateData = {
      applicationStatus: status,
      isActive: status === "Approved",
    };

    if (status === "Rejected") {
      updateData.rejectionReason = rejectionReason.trim();
      updateData.$push = {
        notifications: {
          type: "ApplicationRejected",
          message: `Your clinic application needs attention: ${rejectionReason.trim()}`,
        },
      };
    } else {
      updateData.rejectionReason = "";
      updateData.$push = {
        notifications: {
          type: "ApplicationApproved",
          message:
            "Your clinic application has been approved. You can now use your clinic workspace.",
        },
      };
    }

    const updatedClinic = await Clinic.findByIdAndUpdate(clinicId, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedClinic) {
      return res
        .status(404)
        .json({ success: false, message: "Clinic application not found." });
    }

    const adminUser = await User.findOne({
      clinicId: updatedClinic._id,
      role: "CLINIC_ADMIN",
    });

    // Notify the clinic administrator by email. Email delivery must never break
    // the review response — the in-app notification above is the source of truth.
    if (adminUser?.email) {
      try {
        if (status === "Approved") {
          await sendApplicationApprovedEmail({
            to: adminUser.email,
            clinicName: updatedClinic.name,
            slug: updatedClinic.slug,
          });
        } else {
          await sendApplicationRejectedEmail({
            to: adminUser.email,
            clinicName: updatedClinic.name,
            reason: updatedClinic.rejectionReason,
          });
        }
      } catch (mailErr) {
        console.error(
          `Application ${status.toLowerCase()} email failed for clinic ${updatedClinic._id}:`,
          mailErr.message,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: `Clinic application has been successfully ${status.toLowerCase()}.`,
      data: updatedClinic,
    });
  } catch (error) {
    console.error("🔥 Error reviewing application:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during review process.",
    });
  }
};
export const loginSaasAdmin = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both email and password.",
      });
    }

    // 1. Locate user
    const user = await User.findOne({ email });

    if (!user || user.role !== "SAAS_ADMIN") {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials or unauthorized access.",
      });
    }

    // 2. Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // 3. Generate JWT Token (shared fallback; JWT_SECRET required in prod)
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "fallback_saas_secret_key",
      { expiresIn: "1d" },
    );

    return res.status(200).json({
      success: true,
      message: "SaaS Admin authentication successful.",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("🔥 SaaS Admin Login Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
