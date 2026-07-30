import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";
import Appointment from "../models/appointmentModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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
export const getPlatformOverview = async (req, res) => {
  try {
    const [totalClinics, totalPatients, totalAppointments] = await Promise.all([
      Clinic.countDocuments(),
      User.countDocuments({ role: "PATIENT" }),
      Appointment.countDocuments(),
    ]);

    const activeClinics = await Clinic.countDocuments({ isActive: true });

    return res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalClinics,
          activeClinics,
          totalPatients,
          totalAppointments,
        },
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
      updateData.rejectionReason = rejectionReason;
    }

    const updatedClinic = await Clinic.findByIdAndUpdate(clinicId, updateData, {
      new: true,
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

    if (adminUser) {
      if (status === "Rejected") {
        console.log(
          `[EMAIL DISPATCH] To: ${adminUser.email} - Subject: Action Required: Application Rejected - Reason: ${rejectionReason}`,
        );
      } else if (status === "Approved") {
        console.log(
          `[EMAIL DISPATCH] To: ${adminUser.email} - Subject: Welcome to the Platform! Your clinic is approved.`,
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

    // 3. Generate JWT Token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "fallback-secret-key",
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
