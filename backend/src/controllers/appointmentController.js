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
export const getAvailableSlots = async (req, res) => {
  try {
    const { date, clinicId } = req.query;

    if (!date || !clinicId) {
      return res
        .status(400)
        .json({ message: "Date and clinicId are required fields." });
    }

    // 1. Fetch the clinic configuration
    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res
        .status(404)
        .json({ message: "Clinic not found in the system." });
    }

    // 2. Figure out what day of the week the requested date is
    // Assuming date format is "YYYY-MM-DD"
    const dateObj = new Date(date);
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

    // 3. Find the operating hours for that specific day
    const todayHours = clinic.operatingHours.find((h) => h.day === dayName);

    // If there are no hours defined for this day, or it's marked as closed, return empty array
    if (!todayHours || todayHours.isClosed) {
      return res.status(200).json({ slots: [] });
    }

    const { openTime, closeTime } = todayHours;
    const slotDuration = clinic.slotDurationMinutes || 30; // Fallback to 30 mins if not set

    // 4. Fetch all active appointments for this exact date and clinic
    const bookedAppointments = await Appointment.find({
      clinicId: clinicId,
      date: date,
      status: { $nin: ["Cancelled", "Rejected"] }, // Don't block slots if the appointment was cancelled
    });

    // Create an array of just the taken time strings (e.g., ["09:00", "10:30"])
    const bookedTimes = bookedAppointments.map((app) => app.time);

    // 5. Pure JavaScript Time Math Helpers
    // Converts "09:30" into total minutes (570)
    const timeToMins = (timeString) => {
      const [h, m] = timeString.split(":").map(Number);
      return h * 60 + m;
    };

    // Converts total minutes (570) back into "09:30"
    const minsToTime = (mins) => {
      const h = Math.floor(mins / 60)
        .toString()
        .padStart(2, "0");
      const m = (mins % 60).toString().padStart(2, "0");
      return `${h}:${m}`;
    };

    let currentMins = timeToMins(openTime);
    const closeMins = timeToMins(closeTime);
    const availableSlots = [];

    // 6. Generate slots until we hit the close time
    while (currentMins + slotDuration <= closeMins) {
      const timeString = minsToTime(currentMins);

      // Only push the slot if it is NOT in the bookedTimes array
      if (!bookedTimes.includes(timeString)) {
        availableSlots.push(timeString);
      }

      // Jump forward by the slot duration
      currentMins += slotDuration;
    }

    // 7. Send the available slots to the frontend
    res.status(200).json({ slots: availableSlots });
  } catch (error) {
    console.error("Error generating time slots:", error);
    res.status(500).json({
      message: "Server error while generating available slots.",
      error: error.message,
    });
  }
};
