// src/controllers/appointmentController.js
import mongoose from "mongoose";
import Appointment from "../models/appointmentModel.js";
import Treatment from "../models/treatmentModel.js";
import DentalService from "../models/dentalServicePrice.js";
import Clinic from "../models/clinicModel.js";
// 1. Book Appointment
export const bookAppointment = async (req, res) => {
  try {
    const { patientId, service, date, time } = req.body;

    let rawClinicId =
      req.body.clinicId || req.headers["x-clinic-id"] || req.clinicId;

    if (typeof rawClinicId === "string" && rawClinicId.includes(",")) {
      rawClinicId = rawClinicId.split(",")[0];
    }

    const clinicId = String(rawClinicId || "").trim();
    const cleanPatientId = String(patientId || "").trim();

    if (!clinicId || !cleanPatientId || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking details or tenant headers.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(clinicId) ||
      !mongoose.Types.ObjectId.isValid(cleanPatientId)
    ) {
      return res.status(422).json({
        success: false,
        message: `Unprocessable Entity: Invalid Hex Format. (Clinic: ${clinicId}, Patient: ${cleanPatientId})`,
      });
    }

    const newAppointment = await Appointment.create({
      clinicId: new mongoose.Types.ObjectId(clinicId),
      patientId: new mongoose.Types.ObjectId(cleanPatientId),
      service,
      date,
      time,
      status: "Pending",
    });

    // WebSockets Broadcast
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: "A new appointment reservation has been added.",
        appointmentId: newAppointment._id,
      });
    }

    return res.status(201).json({ success: true, data: newAppointment });
  } catch (error) {
    console.error("❌ bookAppointment Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Get Patient Appointments (With Dynamic Population)
export const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(422).json({
        success: false,
        message: "Unprocessable Entity: Malformed patient routing parameter.",
      });
    }

    const appointments = await Appointment.find({
      patientId: new mongoose.Types.ObjectId(String(patientId).trim()),
    })
      .populate("clinicId", "name slug address phone")
      .populate("dentistId", "fullName specialization")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("❌ Exception inside getPatientAppointments:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Get Admin Appointments
export const getAdminAppointments = async (req, res) => {
  try {
    let tenantClinicId = req.headers["x-clinic-id"] || req.clinicId;

    if (typeof tenantClinicId === "string" && tenantClinicId.includes(",")) {
      tenantClinicId = tenantClinicId.split(",")[0];
    }

    const cleanClinicId = String(tenantClinicId || "").trim();

    if (!cleanClinicId || !mongoose.Types.ObjectId.isValid(cleanClinicId)) {
      return res.status(400).json({
        success: false,
        message: "Tenant identification contextual header is required.",
      });
    }

    const appointments = await Appointment.find({
      clinicId: new mongoose.Types.ObjectId(cleanClinicId),
    })
      .populate("patientId", "firstName lastName email phone")
      .populate("dentistId", "fullName specialization")
      .sort({ date: 1, time: 1 });

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("❌ Exception inside getAdminAppointments:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Modify Appointment Status
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

    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Appointment status reassigned to ${updatedAppointment.status}.`,
        appointmentId: updatedAppointment._id,
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

// 5. Get Today's Appointments
export const getTodayAppointments = async (req, res) => {
  try {
    const clinicId = req.headers["x-clinic-id"] || req.user?.clinicId;
    const today = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const dateString = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const query = {
      $or: [
        { date: { $gte: dateString } },
        {
          status: {
            $in: ["checked-in", "in-treatment", "COMPLETED_PENDING_BILL"],
          },
        },
      ],
      status: {
        $in: [
          "Approved",
          "pending",
          "checked-in",
          "in-treatment",
          "completed",
          "COMPLETED_PENDING_BILL",
        ],
      },
    };

    if (clinicId && mongoose.Types.ObjectId.isValid(String(clinicId))) {
      query.clinicId = new mongoose.Types.ObjectId(String(clinicId));
    }

    const allAppointments = await Appointment.find(query)
      .populate("patientId", "firstName lastName email phone")
      .populate("dentistId", "fullName specialization")
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

// 6. Create Walk-In Appointment
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

    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Walk-in patient ${patientName} checked into triage registry.`,
        appointmentId: newWalkIn._id,
      });
    }

    return res.status(201).json({ success: true, appointment: newWalkIn });
  } catch (error) {
    console.error("Walk-in creation error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error handling walk-in." });
  }
};

// 7. Update Appointment Status
export const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, dentistId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(422)
        .json({ success: false, message: "Malformed appointment ID format." });
    }

    const updatePayload = { status };
    if (dentistId && mongoose.Types.ObjectId.isValid(dentistId)) {
      updatePayload.dentistId = String(dentistId);
    }

    const appointment = await Appointment.findByIdAndUpdate(id, updatePayload, {
      new: true,
    })
      .populate("patientId")
      .populate("dentistId");

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found." });
    }

    if (status === "in-treatment") {
      const pName = appointment.patientId
        ? `${appointment.patientId.firstName || ""} ${appointment.patientId.lastName || ""}`.trim()
        : appointment.patientName || "Walk-In Patient";

      let targetClinicId = appointment.clinicId || req.user?.clinicId;
      let targetDentistId = appointment.dentistId || dentistId;

      if (!targetDentistId && req.user?.role === "dentist") {
        targetDentistId = req.user.id;
      }

      const validClinic = mongoose.Types.ObjectId.isValid(
        String(targetClinicId),
      )
        ? new mongoose.Types.ObjectId(String(targetClinicId))
        : null;

      const validDentist = mongoose.Types.ObjectId.isValid(
        String(targetDentistId),
      )
        ? new mongoose.Types.ObjectId(String(targetDentistId))
        : null;

      try {
        await Treatment.findOneAndUpdate(
          { appointmentId: appointment._id },
          {
            clinicId: validClinic,
            dentistId: validDentist,
            patientName: pName,
            procedureName:
              appointment.service ||
              appointment.treatmentName ||
              "General Consultation",
            status: "IN_CHAIR",
            createdAt: new Date(),
          },
          { upsert: true, new: true },
        );
      } catch (treatmentError) {
        console.error("⚠️ Treatment sync error:", treatmentError.message);
      }
    }

    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Appointment status updated to ${appointment.status}.`,
        appointmentId: appointment._id,
      });
    }

    return res.status(200).json({ success: true, appointment });
  } catch (error) {
    console.error("❌ Critical 500 Fault in updateAppointmentStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server data modification exception.",
    });
  }
};

// 8. Create Standard Appointment
export const createAppointment = async (req, res) => {
  try {
    const { date, time, service, patientId, clinicId } = req.body;
    const appointmentDateTime = new Date(`${date} ${time}`);
    const systemNow = new Date();

    if (appointmentDateTime < systemNow) {
      return res.status(400).json({
        success: false,
        message: "The selected date or time slot has already passed.",
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

// 9. Settle Payment
export const settlePayment = async (req, res) => {
  try {
    const { appointmentId, finalAmount } = req.body;

    if (!appointmentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing appointment target ID." });
    }

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { $set: { status: "completed" } },
      { new: true },
    );

    if (!updatedAppointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment record context not found.",
      });
    }

    let calculatedBilling = finalAmount;
    if (calculatedBilling === undefined || calculatedBilling === null) {
      const existingTreatment = await Treatment.findOne({ appointmentId });
      if (existingTreatment && existingTreatment.billingAmount) {
        calculatedBilling = existingTreatment.billingAmount;
      } else {
        const matchedService = await DentalService.findOne({
          name: updatedAppointment.service,
        });
        calculatedBilling = matchedService ? matchedService.basePricePhp : 0;
      }
    }

    const updatedTreatment = await Treatment.findOneAndUpdate(
      { appointmentId: appointmentId },
      {
        $set: {
          status: "DONE",
          billingAmount: Number(calculatedBilling),
        },
      },
      { new: true },
    );

    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Appointment status updated to ${updatedAppointment.status}.`,
        appointmentId: updatedAppointment._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice settled cleanly.",
      appointment: updatedAppointment,
      treatment: updatedTreatment,
    });
  } catch (error) {
    console.error("🔥 SYSTEM TRANSACTION FAULT LOG:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server billing engine exception: ${error.message}`,
    });
  }
};

function generateDynamicTimeSlots(startTimeStr, endTimeStr, intervalMinutes) {
  if (!startTimeStr || !endTimeStr || !intervalMinutes) return [];
  const slots = [];

  const [startHour, startMin] = startTimeStr.split(":").map(Number);
  const [endHour, endMin] = endTimeStr.split(":").map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes + intervalMinutes <= endMinutes) {
    const hh = String(Math.floor(currentMinutes / 60)).padStart(2, "0");
    const mm = String(currentMinutes % 60).padStart(2, "0");

    slots.push(`${hh}:${mm}`);
    currentMinutes += intervalMinutes;
  }

  return slots;
}

export const getAvailableSlots = async (req, res) => {
  try {
    const { date, clinicId, dentistId } = req.query;

    if (!date || !clinicId) {
      return res.status(400).json({
        success: false,
        message: "Missing date or clinicId query parameter.",
      });
    }

    // 1. Fetch clinic configuration from DB
    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res
        .status(404)
        .json({ success: false, message: "Clinic not found." });
    }

    // 2. Timezone-safe day of the week calculation
    const [year, month, day] = date.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day); // Local midnight parsing
    const daysOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayName = daysOfWeek[dateObj.getDay()];

    // 3. Find day-specific operating hours
    const daySchedule = clinic.operatingHours?.find(
      (h) => h.day.toLowerCase() === dayName.toLowerCase(),
    );

    // If day is closed or missing operating hours
    if (!daySchedule || daySchedule.isClosed) {
      return res.status(200).json({
        success: true,
        slots: [],
        bookedSlots: [],
        message: `Clinic is closed on ${dayName}s.`,
      });
    }

    // 4. Extract schedule params with fallback defaults
    const openTime = daySchedule.openTime || "09:00";
    const closeTime = daySchedule.closeTime || "17:00";
    const slotInterval = clinic.slotDurationMinutes || 30;

    // 5. Generate dynamic slots
    const generatedSlots = generateDynamicTimeSlots(
      openTime,
      closeTime,
      slotInterval,
    );

    // 6. Fetch booked appointments
    const query = {
      clinicId: new mongoose.Types.ObjectId(clinicId),
      date: { $regex: date, $options: "i" },
      status: { $nin: ["cancelled", "Declined"] },
    };

    if (dentistId && mongoose.Types.ObjectId.isValid(dentistId)) {
      query.$or = [
        { dentistId: new mongoose.Types.ObjectId(dentistId) },
        { dentistId: null },
        { dentistId: { $exists: false } },
      ];
    }

    const existingAppointments = await Appointment.find(query);
    const bookedTimes = existingAppointments.map((appt) => appt.time);

    // 7. Return configured slots and booked times
    return res.status(200).json({
      success: true,
      slots: generatedSlots,
      bookedSlots: bookedTimes,
    });
  } catch (error) {
    console.error("❌ Error generating slots:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
