// src/controllers/treatmentController.js
import mongoose from "mongoose";
import Treatment from "../models/treatmentModel.js";
import DentalService from "../models/dentalServicePrice.js";

// 1. Complete Dental Procedure Session
export const completeProcedure = async (req, res) => {
  try {
    const { treatmentId, treatedTooth, clinicalNotes, billingAmount } =
      req.body;
    const dentistId = req.user?.id || req.user?._id;
    const clinicId = req.user?.clinicId || req.clinicId;

    if (!treatmentId || !clinicalNotes) {
      return res.status(400).json({
        success: false,
        message:
          "Missing parameters: treatment tracking target or clinical notes required.",
      });
    }

    let finalBillingAmount = billingAmount;
    if (finalBillingAmount === undefined || finalBillingAmount === null) {
      const existingSession = await Treatment.findById(treatmentId);
      if (existingSession?.procedureName) {
        const serviceNames = String(existingSession.procedureName)
          .split(/\s*\+\s*|\s*,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        const matchedServices = serviceNames.length
          ? await DentalService.find({ name: { $in: serviceNames } })
              .select("basePricePhp")
              .lean()
          : [];
        // Fall back to per-name lookup when the joined name didn't match
        // (e.g. legacy single-service records).
        if (matchedServices.length === 0 && serviceNames.length === 1) {
          const single = await DentalService.findOne({
            name: serviceNames[0],
          }).select("basePricePhp").lean();
          if (single) matchedServices.push(single);
        }
        if (matchedServices.length) {
          finalBillingAmount = matchedServices.reduce(
            (sum, s) => sum + Number(s.basePricePhp || 0),
            0,
          );
        } else {
          const single = await DentalService.findOne({
            name: existingSession.procedureName,
          }).select("basePricePhp").lean();
          if (single) finalBillingAmount = single.basePricePhp;
        }
      }
    }

    const activeSession = await Treatment.findOneAndUpdate(
      { _id: treatmentId, clinicId: clinicId, dentistId: dentistId },
      {
        $set: {
          treatedTooth: treatedTooth ? parseInt(treatedTooth) : null,
          clinicalNotes: clinicalNotes.trim(),
          billingAmount: Number(finalBillingAmount || 0),
          status: "COMPLETED_PENDING_BILL",
        },
      },
      { new: true },
    );

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message:
          "Active treatment instance window not found or token context mismatch.",
      });
    }

    let updatedAppointment = null;
    if (activeSession.appointmentId) {
      try {
        updatedAppointment = await mongoose
          .model("Appointment")
          .findByIdAndUpdate(
            activeSession.appointmentId,
            { $set: { status: "COMPLETED_PENDING_BILL" } },
            { new: true },
          )
          .populate("patientId")
          .populate("dentistId");
      } catch (dbError) {
        console.error("⚠️ Mongoose cross-sync warning:", dbError.message);
      }
    }

    // Real-time WebSocket emission
    const ioInstance = global.io;
    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: "Patient procedure finalized by clinical operator.",
        appointmentId: activeSession.appointmentId,
      });

      // 👇 NEW: Notify the patient directly!
      if (updatedAppointment && updatedAppointment.patientId) {
        const patientRoomId = String(
          updatedAppointment.patientId._id || updatedAppointment.patientId,
        );

        let doctorName = "Your doctor";
        if (updatedAppointment.dentistId) {
          doctorName =
            updatedAppointment.dentistId.fullName ||
            `Dr. ${updatedAppointment.dentistId.firstName || ""} ${updatedAppointment.dentistId.lastName || ""}`.trim();
        }

        ioInstance.to(patientRoomId).emit("status_updated", {
          appointmentId: updatedAppointment._id,
          status: "COMPLETED_PENDING_BILL",
          dentistName: doctorName,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "Procedure finalized successfully. Patient routed to checkout queue.",
      session: activeSession,
    });
  } catch (error) {
    console.error("Exception in completeProcedure controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal runtime server pipeline fault.",
    });
  }
};

// 2. Get Active Dentist Queue (With Dynamic Patient Population)
export const getDentistQueue = async (req, res) => {
  try {
    const dentistId = req.user?.id || req.user?._id;
    const clinicId = req.user?.clinicId || req.clinicId;

    // Fetch patients actively in chair for this dentist & clinic workspace
    const treatments = await Treatment.find({
      clinicId: clinicId,
      dentistId: dentistId,
      status: "IN_CHAIR",
    })
      .populate({
        path: "appointmentId",
        populate: {
          path: "patientId",
          select: "firstName lastName email phone dateOfBirth gender",
        },
      })
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: treatments.length,
      treatments,
    });
  } catch (error) {
    console.error("Critical error in getDentistQueue controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal framework exception.",
    });
  }
};
