// src/controllers/adminController.js
import Appointment from "../models/appointmentModel.js";
import User from "../models/userModel.js"; // 🎯 FIX 1: Import your unified User model
import Staff from "../models/staffModel.js"; // Kept for directory lookup if needed
import jwt from "jsonwebtoken";

// 1. Get All Clinic Appointments
export const getClinicAppointments = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"];
    if (!clinicId)
      return res
        .status(400)
        .json({ success: false, message: "Missing clinic context header." });

    const appointments = await Appointment.find({ clinicId }).sort({
      date: 1,
      time: 1,
    });
    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Update Appointment Status
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
    if (!updatedAppointment)
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found." });
    return res.status(200).json({ success: true, data: updatedAppointment });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Add Staff Member
export const addStaffMember = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"];
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
    const clinicId = req.headers["x-clinic-id"];
    if (!clinicId)
      return res
        .status(400)
        .json({ success: false, message: "Missing clinic context header." });
    const staff = await Staff.find({ clinicId }).sort({ role: 1 });
    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================================
// 🔒 5. Authenticate Clinic Admins / Staff (PRODUCTION REMAPPED)
// =========================================================================
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Fields required." });
    }

    // 🎯 FIX 2: Look inside the unified User collection where registration saved them
    const accountUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    // Guardrail: If user is missing completely, fail early
    if (!accountUser) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    // 🎯 FIX 3: Enforce administrative authorization wall strings
    const allowedRoles = [
      "SUPER_ADMIN",
      "CLINIC_ADMIN",
      "CLINIC_STAFF",
      "DENTIST",
    ];
    if (!allowedRoles.includes(accountUser.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Access Denied: Customer accounts are restricted from staff terminals.",
      });
    }

    // 🎯 FIX 4: Call your built-in user schema schema helper comparison method
    const isMatch = await accountUser.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    // 🎯 FIX 5: Issue a clean JWT token signed using account identity metrics
    const token = jwt.sign(
      {
        id: accountUser._id,
        role: accountUser.role,
        clinicId: accountUser.clinicId, // Pass the critical multi-tenant anchor field
      },
      process.env.JWT_SECRET || "fallback_saas_secret_key",
      { expiresIn: "1d" },
    );

    // Filter sensitive fields out of response profile return
    const sanitizedUser = {
      _id: accountUser._id,
      clinicId: accountUser.clinicId,
      firstName: accountUser.firstName,
      lastName: accountUser.lastName,
      email: accountUser.email,
      role: accountUser.role,
      isActive: accountUser.isActive,
    };

    return res.status(200).json({ success: true, token, user: sanitizedUser });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
