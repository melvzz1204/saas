// src/controllers/appointmentController.js
import mongoose from "mongoose";
import Appointment from "../models/appointmentModel.js";

// @desc     Book a new appointment
// @route    POST /api/v1/appointments/book
export const bookAppointment = async (req, res) => {
  try {
    const { patientId, service, date, time } = req.body;

    // 1. Capture raw clinic ID string from fallback channels
    let rawClinicId =
      req.body.clinicId || req.headers["x-clinic-id"] || req.clinicId;

    // If the string contains a comma, split it and take the first clean ID!
    if (typeof rawClinicId === "string" && rawClinicId.includes(",")) {
      console.log(
        "⚠️ Array duplication detected in header string. Splitting parameters...",
      );
      rawClinicId = rawClinicId.split(",")[0];
    }

    // Trim and cast to clean strings
    const clinicId = String(rawClinicId || "").trim();
    const cleanPatientId = String(patientId || "").trim();

    console.log("📥 [SANITISED CONTROLLER INTAKE]:");
    console.log("-> Cleaned clinicId:", clinicId);
    console.log("-> Cleaned patientId:", cleanPatientId);

    // 2. Structural Field Existence Gate
    if (!clinicId || !cleanPatientId || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking details or tenant headers.",
      });
    }

    // 3. 🛡️ DEFENSIVE SECURITY GUARD
    if (
      !mongoose.Types.ObjectId.isValid(clinicId) ||
      !mongoose.Types.ObjectId.isValid(cleanPatientId)
    ) {
      return res.status(422).json({
        success: false,
        message: `Unprocessable Entity: Invalid Hex Format. (Clinic: ${clinicId}, Patient: ${cleanPatientId})`,
      });
    }

    // Create and commit document to Mongo DB
    const newAppointment = await Appointment.create({
      clinicId: new mongoose.Types.ObjectId(clinicId),
      patientId: new mongoose.Types.ObjectId(cleanPatientId),
      service,
      date,
      time,
      status: "Pending",
    });

    return res.status(201).json({ success: true, data: newAppointment });
  } catch (error) {
    console.error("❌ bookAppointment Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc     Get all appointments for a specific patient (Tenant Isolated via Patient Context)
// @route    GET /api/v1/appointments/patient/:patientId
export const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;

    // 🛡️ DEFENSIVE SECURITY GUARD: Validate the patient parameter string layout format
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(422).json({
        success: false,
        message:
          "Unprocessable Entity: Malformed patient routing parameter signatures detected.",
      });
    }

    // Query strictly by patientId.
    const appointments = await Appointment.find({
      patientId: new mongoose.Types.ObjectId(String(patientId).trim()),
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("❌ Exception inside getPatientAppointments:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================================
// 🏢 ADMINISTRATIVE WORKSPACE CONTROLLERS (ADDED FOR ADMIN DASHBOARD SYNC)
// =========================================================================

// @desc     Get all appointments for a specific clinic location (Multi-Tenant Isolated)
// @route    GET /api/v1/admin/appointments
export const getAdminAppointments = async (req, res) => {
  try {
    // Read the isolating multi-tenant header directly out of the incoming request pipeline
    let tenantClinicId = req.headers["x-clinic-id"] || req.clinicId;

    if (typeof tenantClinicId === "string" && tenantClinicId.includes(",")) {
      tenantClinicId = tenantClinicId.split(",")[0];
    }

    const cleanClinicId = String(tenantClinicId || "").trim();

    if (!cleanClinicId || !mongoose.Types.ObjectId.isValid(cleanClinicId)) {
      return res.status(400).json({
        success: false,
        message: "Tenant identification contextual header context is required.",
      });
    }

    // 🎯 THE FIX: Query records within this specific clinic context and populate structural profile info
    const appointments = await Appointment.find({
      clinicId: new mongoose.Types.ObjectId(cleanClinicId),
    })
      .populate("patientId", "firstName lastName email phone") // 🔗 Joins identity collection documents dynamically
      .sort({ date: 1, time: 1 }); // Order chronologically by scheduled visit dates

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("❌ Exception inside getAdminAppointments:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc     Modify scheduling statuses (Confirm or Cancel appointments)
// @route    PATCH /api/v1/admin/appointments/:appointmentId
export const modifyAppointmentStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;

    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(422).json({
        success: false,
        message: "Malformed database routing parameters passed.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Target state updates must be declared.",
      });
    }

    // Track down the scheduling record node and apply updates
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { status: status },
      { new: true, runValidators: true },
    );

    if (!updatedAppointment) {
      return res.status(404).json({
        success: false,
        message: "No scheduling record matched the provided signature.",
      });
    }

    return res.status(200).json({ success: true, data: updatedAppointment });
  } catch (error) {
    console.error(
      "❌ Exception inside modifyAppointmentStatus:",
      error.message,
    );
    return res.status(500).json({ success: false, message: error.message });
  }
};
