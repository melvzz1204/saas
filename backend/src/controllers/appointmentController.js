// src/controllers/appointmentController.js
import Appointment from "../models/appointmentModel.js";

// @desc    Book a new appointment
// @route   POST /api/v1/appointments/book
export const bookAppointment = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"];

    const { patientId, service, date, time } = req.body;

    if (!clinicId || !patientId || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking details or tenant headers.",
      });
    }

    const newAppointment = await Appointment.create({
      clinicId,
      patientId,
      service,
      date,
      time,
      status: "Pending",
    });

    return res.status(201).json({ success: true, data: newAppointment });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all appointments for a specific patient (Tenant Isolated)
// @route   GET /api/v1/appointments/patient/:patientId
export const getPatientAppointments = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"];
    const { patientId } = req.params;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: "Missing X-Clinic-ID context header.",
      });
    }

    // Tenant Isolation lookup logic
    const appointments = await Appointment.find({ patientId, clinicId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
