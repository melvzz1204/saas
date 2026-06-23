// src/controllers/treatmentController.js
import mongoose from "mongoose";
import Treatment from "../models/treatmentModel.js";

// Handles the form submission from the Dentist Dashboard
export const completeProcedure = async (req, res) => {
  try {
    const { treatmentId, treatedTooth, clinicalNotes, billingAmount } =
      req.body;

    const dentistId = req.user.id;
    const clinicId = req.user.clinicId;

    if (!treatmentId || !clinicalNotes) {
      return res.status(400).json({
        success: false,
        message:
          "Missing parameters: treatment tracking target or clinical validation prose missing.",
      });
    }

    // 1. Find and update the active treatment tracking session
    const activeSession = await Treatment.findOneAndUpdate(
      { _id: treatmentId, clinicId: clinicId, dentistId: dentistId },
      {
        $set: {
          treatedTooth: treatedTooth ? parseInt(treatedTooth) : null,
          clinicalNotes: clinicalNotes.trim(),
          billingAmount: billingAmount || 150.0,
          status: "COMPLETED_PENDING_BILL",
        },
      },
      { new: true },
    );

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message:
          "Active treatment instance window not found or mismatch on security tokens.",
      });
    }

    // 2. Cross-sync the parent appointment collection state securely
    if (activeSession.appointmentId) {
      try {
        await mongoose.model("Appointment").findByIdAndUpdate(
          activeSession.appointmentId,
          { $set: { status: "COMPLETED_PENDING_BILL" } }, // Syncing the parent status!
        );
        console.log(
          `🔄 Parent appointment ${activeSession.appointmentId} synced to COMPLETED_PENDING_BILL.`,
        );
      } catch (dbError) {
        console.error("⚠️ Mongoose cross-sync warning:", dbError.message);
      }
    }

    // =============================================================
    // ⚡ REAL-TIME PIPELINE WEBSOCKET EMISSION
    // =============================================================
    const ioInstance = global.io; // Grab the socket server instance from the Node global scope context

    if (ioInstance) {
      ioInstance.emit("pipeline-update", {
        message: "Patient procedure finalized by clinical operator.",
        appointmentId: activeSession.appointmentId,
      });
      console.log(
        "⚡ Broadcast sent: pipeline-update dispatched downstream successfully!",
      );
    } else {
      console.log(
        "❌ CRITICAL: Could not find the socket 'io' instance on global scope!",
      );
    }
    // =============================================================

    return res.status(200).json({
      success: true,
      message:
        "Procedure finalized successfully. Patient routing matrix updated to checkout queue.",
      session: activeSession,
    });
  } catch (error) {
    console.error(
      "Exception caught inside complete procedure engine controller:",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Internal runtime server pipeline fault.",
    });
  }
};

export const getDentistQueue = async (req, res) => {
  try {
    const dentistId = req.user.id;
    const clinicId = req.user.clinicId;

    // 🎯 Only fetch patients actively in the chair right now
    const treatments = await Treatment.find({
      clinicId: clinicId,
      dentistId: dentistId,
      status: "IN_CHAIR",
    }).sort({ createdAt: 1 });

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
