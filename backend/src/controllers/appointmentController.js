import mongoose from "mongoose";
import Appointment from "../models/appointmentModel.js";
import Treatment from "../models/treatmentModel.js";

export const bookAppointment = async (req, res) => {
  try {
    const { patientId, service, date, time } = req.body;

    let rawClinicId =
      req.body.clinicId || req.headers["x-clinic-id"] || req.clinicId;

    if (typeof rawClinicId === "string" && rawClinicId.includes(",")) {
      console.log(
        "⚠️ Array duplication detected in header string. Splitting parameters...",
      );
      rawClinicId = rawClinicId.split(",")[0];
    }

    const clinicId = String(rawClinicId || "").trim();
    const cleanPatientId = String(patientId || "").trim();

    console.log("📥 [SANITISED CONTROLLER INTAKE]:");
    console.log("-> Cleaned clinicId:", clinicId);
    console.log("-> Cleaned patientId:", cleanPatientId);

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

    // ⚡ REAL-TIME BROADCAST: Announce new appointment entry context
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message:
          "A new appointment reservation has been compiled into the clinic directory.",
        appointmentId: newAppointment._id,
      });
      console.log(
        "⚡ Broadcast sent: new appointment allocation dispatched downstream.",
      );
    }

    return res.status(201).json({ success: true, data: newAppointment });
  } catch (error) {
    console.error("❌ bookAppointment Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(422).json({
        success: false,
        message:
          "Unprocessable Entity: Malformed patient routing parameter signatures detected.",
      });
    }

    const appointments = await Appointment.find({
      patientId: new mongoose.Types.ObjectId(String(patientId).trim()),
    }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("❌ Exception inside getPatientAppointments:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

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
        message: "Tenant identification contextual header context is required.",
      });
    }

    const appointments = await Appointment.find({
      clinicId: new mongoose.Types.ObjectId(cleanClinicId),
    })
      .populate("patientId", "firstName lastName email phone")
      .sort({ date: 1, time: 1 });

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

    // ⚡ REAL-TIME BROADCAST: Administrative administrative layout mutations
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Appointment layout structural status reassigned to ${updatedAppointment.status}.`,
        appointmentId: updatedAppointment._id,
      });
      console.log(
        "⚡ Broadcast sent: status layout sync dispatched downstream.",
      );
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

export const getTodayAppointments = async (req, res) => {
  try {
    const today = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const dateString = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const allAppointments = await Appointment.find({
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
    })
      .populate({ path: "patientId", select: "firstName lastName" })
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

    // ⚡ REAL-TIME BROADCAST: Instantly draw new active walk-in patient profile on the board
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Walk-in patient ${patientName} checked into triage registry.`,
        appointmentId: newWalkIn._id,
      });
      console.log(
        "⚡ Broadcast sent: walk-in allocation sync dispatched downstream.",
      );
    }

    return res.status(201).json({ success: true, appointment: newWalkIn });
  } catch (error) {
    console.error("Walk-in creation error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error handling walk-in." });
  }
};

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
        console.log(
          `✨ Treatment session successfully synchronized for patient: ${pName}`,
        );
      } catch (treatmentError) {
        console.error(
          "⚠️ Non-fatal core sync failure inside Treatment update block:",
          treatmentError.message,
        );
      }
    }

    // ⚡ REAL-TIME BROADCAST: Fixed error targeting to correct 'appointment' parameters
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Appointment status updated to ${appointment.status}.`,
        appointmentId: appointment._id,
      });
      console.log(
        "⚡ Broadcast sent: appointment pipeline sync dispatched downstream.",
      );
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

export const createAppointment = async (req, res) => {
  try {
    const { date, time, service } = req.body;
    const appointmentDateTime = new Date(`${date} ${time}`);
    const systemNow = new Date();

    if (appointmentDateTime < systemNow) {
      return res.status(400).json({
        success: false,
        message:
          "Booking failure: The selected date or time slot has already passed.",
      });
    }
    // ... continue processing valid appointment saving logic ...
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const settlePayment = async (req, res) => {
  try {
    const { appointmentId, finalAmount, paymentMethod } = req.body;

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

    const TreatmentModel = mongoose.model("Treatment");
    const updatedTreatment = await TreatmentModel.findOneAndUpdate(
      { appointmentId: appointmentId },
      {
        $set: {
          status: "DONE",
          billingAmount: finalAmount || 1500.0,
        },
      },
      { new: true },
    );

    console.log(
      `¼ Processing checkout logs: ${appointmentId}. Treatment Log Synced: ${!!updatedTreatment}`,
    );

    // ⚡ REAL-TIME BROADCAST: Balanced ledger reconciliation tracking
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: `Appointment status updated to ${updatedAppointment.status}.`,
        appointmentId: updatedAppointment._id,
      });
      console.log(
        "⚡ Broadcast sent: appointment pipeline sync dispatched downstream.",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Invoice settled cleanly. Record compiled and locked.",
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
