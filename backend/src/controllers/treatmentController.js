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

    // Dynamic price fallback: Query basePricePhp from service catalog if billingAmount is omitted
    let finalBillingAmount = billingAmount;

    if (finalBillingAmount === undefined || finalBillingAmount === null) {
      const existingSession = await Treatment.findById(treatmentId);
      if (existingSession?.procedureName) {
        const matchingService = await DentalService.findOne({
          name: existingSession.procedureName,
        });
        if (matchingService) {
          finalBillingAmount = matchingService.basePricePhp;
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

    // Cross-sync parent appointment collection status
    if (activeSession.appointmentId) {
      try {
        await mongoose
          .model("Appointment")
          .findByIdAndUpdate(activeSession.appointmentId, {
            $set: { status: "COMPLETED_PENDING_BILL" },
          });
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
