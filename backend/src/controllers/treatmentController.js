// src/controllers/treatmentController.js
import Treatment from "../models/treatmentModel.js";

// Handles the form submission from the Dentist Dashboard
export const completeProcedure = async (req, res) => {
  try {
    const { treatmentId, treatedTooth, clinicalNotes, billingAmount } =
      req.body;

    // Auth metadata pulled straight from your verified JWT token middleware
    const dentistId = req.user.id;
    const clinicId = req.user.clinicId;

    if (!treatmentId || !clinicalNotes) {
      return res.status(400).json({
        success: false,
        message:
          "Missing parameters: treatment tracking target or clinical validation prose missing.",
      });
    }

    // Find the active chair record and update it to release the patient to checkout
    const activeSession = await Treatment.findOneAndUpdate(
      { _id: treatmentId, clinicId: clinicId, dentistId: dentistId },
      {
        $set: {
          treatedTooth: treatedTooth ? parseInt(treatedTooth) : null,
          clinicalNotes: clinicalNotes.trim(),
          billingAmount: billingAmount || 150.0, // Fallback base fee if empty
          status: "COMPLETED_PENDING_BILL", // ⚡ This state change shifts the front-desk Kanban column!
        },
      },
      { new: true }, // Return updated document structure
    );

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message:
          "Active treatment instance window not found or mismatch on security tokens.",
      });
    }

    // NOTE: If using WebSockets (Socket.io), trigger the event right here:
    // req.io.to(clinicId).emit("kanban_update", { event: "RELEASE_PATIENT", data: activeSession });

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
