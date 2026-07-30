import bcrypt from "bcryptjs";
import Appointment from "../models/appointmentModel.js";
import User from "../models/userModel.js";
import Staff from "../models/staffModel.js";
import jwt from "jsonwebtoken";

// 1. Get All Clinic Appointments (With Dynamic Population)
export const getClinicAppointments = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"] || req.user?.clinicId;
    if (!clinicId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing clinic context header." });
    }

    // Dynamic fetch: Hydrate patient & dentist profiles
    const appointments = await Appointment.find({ clinicId })
      .populate("patientId", "firstName lastName email phone dateOfBirth")
      .populate(
        "assignedDentist dentistId",
        "fullName specialization email phone",
      )
      .sort({ date: 1, time: 1 });

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Update Appointment Action
export const updateAppointmentAction = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status, notes, assignedDentist } = req.body;
    const updateFields = {};
    if (status) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    if (assignedDentist) updateFields.assignedDentist = assignedDentist;

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      updateFields,
      { new: true },
    );

    if (!updatedAppointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found." });
    }

    return res.status(200).json({ success: true, data: updatedAppointment });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Add Staff Member
export const addStaffMember = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"] || req.user?.clinicId;
    const { fullName, role, specialization, email, phone } = req.body;

    if (!clinicId || !fullName || !role || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Missing required staff registration details.",
      });
    }

    const newStaff = await Staff.create({
      clinicId,
      fullName,
      role,
      specialization: role === "Dentist" ? specialization : "N/A",
      email,
      phone,
    });

    return res.status(201).json({ success: true, data: newStaff });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Get Clinic Staff Directory
export const getClinicStaff = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"] || req.user?.clinicId;
    if (!clinicId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing clinic context header." });
    }

    const staff = await Staff.find({ clinicId })
      .populate("clinicId", "name slug")
      .sort({ role: 1 });

    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Authenticate Clinic Admins / Staff
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const cleanEmail = email.trim();

    // 1. Case-insensitive search (Fixes uppercase/lowercase mismatch in DB)
    const accountUser = await User.findOne({
      email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
    });

    if (!accountUser) {
      console.log(
        `❌ Login Failed: No user account found with email "${cleanEmail}"`,
      );
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // 2. Role Clearance Verification
    const allowedRoles = [
      "SUPER_ADMIN",
      "CLINIC_ADMIN",
      "CLINIC_STAFF",
      "DENTIST",
    ];

    if (!allowedRoles.includes(accountUser.role)) {
      console.log(
        `⚠️ Login Blocked: User "${cleanEmail}" has role "${accountUser.role}" which cannot use staff portal.`,
      );
      return res.status(403).json({
        success: false,
        message:
          "Access Denied: Customer accounts are restricted from staff terminals.",
      });
    }

    // 3. Password Verification
    const isMatch = await bcrypt.compare(password, accountUser.password);

    if (!isMatch) {
      console.log(
        `❌ Login Failed: Password mismatch for user "${cleanEmail}"`,
      );
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // 4. Generate JWT Token
    const token = jwt.sign(
      {
        id: accountUser._id,
        role: accountUser.role,
        clinicId: accountUser.clinicId,
      },
      process.env.JWT_SECRET || "fallback_saas_secret_key",
      { expiresIn: "1d" },
    );

    const sanitizedUser = {
      _id: accountUser._id,
      clinicId: accountUser.clinicId,
      firstName: accountUser.firstName,
      lastName: accountUser.lastName,
      email: accountUser.email,
      role: accountUser.role,
      isActive: accountUser.isActive,
    };

    console.log(`✅ Login Success: "${cleanEmail}" (${accountUser.role})`);

    return res.status(200).json({ success: true, token, user: sanitizedUser });
  } catch (error) {
    console.error("🔥 Admin Login Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials." });
    }

    // 🛑 If the user is a SaaS Admin, bypass clinic-level checks
    if (user.role === "SAAS_ADMIN") {
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || "fallback-secret-key",
        { expiresIn: "1d" },
      );

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
      });
    }

    // --- Standard Clinic User Logic Below ---
    // (Check active status, clinic status, tenant restrictions, etc.)
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
