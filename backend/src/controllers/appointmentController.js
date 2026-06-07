// src/controllers/appointmentController.js
import mongoose from "mongoose";
import Appointment from "../models/appointmentModel.js";

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
// 1. Fetch all appointments for the dashboard
export const getTodayAppointments = async (req, res) => {
  try {
    // Get today's date formatted EXACTLY like your database string ("YYYY-MM-DD")
    const today = new Date();
    const dateString = today.toISOString().split("T")[0]; // Creates e.g. "2026-06-07"

    // Fetch appointments that are today OR in the future, including "Approved"
    // 🚀 FIX: Added .populate() to hydrate patientId with user account fields
    const allAppointments = await Appointment.find({
      date: { $gte: dateString }, // Lexicographical string comparison works great for YYYY-MM-DD
      status: {
        $in: ["Approved", "pending", "checked-in", "in-treatment", "completed"],
      },
    })
      .populate({
        path: "patientId",
        select: "firstName lastName", // Pulls only these fields from the User collection
      })
      .sort({ date: 1, time: 1 });

    return res
      .status(200)
      .json({ success: true, appointments: allAppointments });
  } catch (error) {
    console.error("Error fetching board data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error fetching board data" });
  }
};

// 2. Add a new walk-in patient
export const createWalkInAppointment = async (req, res) => {
  try {
    const { patientName, treatmentName, clinicId } = req.body;

    const newWalkIn = await Appointment.create({
      patientName,
      treatmentName: treatmentName || "Walk-In Consult",
      clinicId,
      isWalkIn: true,
      status: "checked-in",
      time: "WALK-IN",
      service: "Walk-In Consult",
    });

    return res.status(201).json({ success: true, appointment: newWalkIn });
  } catch (error) {
    console.error("Walk-in creation error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error handling walk-in." });
  }
};

// 3. Update Status (Moving cards on the Kanban board)
export const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updated = await Appointment.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );

    if (!updated)
      return res.status(404).json({ success: false, message: "Not found" });
    return res.status(200).json({ success: true, appointment: updated });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error updating status" });
  }
};
