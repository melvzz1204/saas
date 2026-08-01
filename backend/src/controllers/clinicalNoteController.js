import ClinicalNote from "../models/ClinicalNote.js";

// controllers/clinicalNoteController.js
export const createClinicalNote = async (req, res) => {
  try {
    // 1. Prevent Patients from saving notes as the dentist
    if (req.user.role === "PATIENT") {
      return res.status(403).json({
        success: false,
        message:
          "Forbidden: Only clinical staff and dentists can create notes.",
      });
    }

    const {
      patientId,
      appointmentId,
      chiefComplaint,
      assessment,
      treatmentRendered,
      progressNotes,
      recommendations,
      nextVisitDate,
    } = req.body;

    const dentistId = req.user._id || req.user.id;
    const clinicId = req.headers["x-clinic-id"] || req.user.clinicId;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: "Clinic workspace context (clinicId) is missing.",
      });
    }

    if (!patientId || !chiefComplaint || !assessment || !treatmentRendered) {
      return res.status(400).json({
        success: false,
        message:
          "Please fill in all required fields (Patient, Complaint, Assessment, Treatment).",
      });
    }

    // 2. Create the clinical note
    const newNote = await ClinicalNote.create({
      clinicId,
      patientId,
      dentistId,
      appointmentId: appointmentId || null,
      chiefComplaint,
      assessment,
      treatmentRendered,
      progressNotes,
      recommendations,
      nextVisitDate: nextVisitDate || null,
    });

    // 3. Populate dentist & patient details for immediate UI rendering
    const populatedNote = await newNote.populate([
      { path: "dentistId", select: "firstName lastName specialization email" },
      { path: "patientId", select: "firstName lastName email" },
    ]);

    return res.status(201).json({
      success: true,
      message: "Clinical assessment saved successfully.",
      data: populatedNote,
    });
  } catch (error) {
    console.error("❌ Error saving clinical note:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving progress note.",
      error: error.message,
    });
  }
};

// =========================================================================
// 🦷 2. GET ALL NOTES FOR A SPECIFIC PATIENT (Dentist View)
// =========================================================================
export const getPatientHistoryForDentist = async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.headers["x-clinic-id"] || req.user.clinicId;

    if (!patientId) {
      return res
        .status(400)
        .json({ success: false, message: "Patient ID is required." });
    }

    const notes = await ClinicalNote.find({ patientId, clinicId })
      .populate("dentistId", "firstName lastName fullName specialization")
      .populate("appointmentId", "date time status")
      .sort({ createdAt: -1 }); // Newest first

    return res.status(200).json({
      success: true,
      count: notes.length,
      data: notes,
    });
  } catch (error) {
    console.error("❌ Error retrieving patient history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching clinical history.",
      error: error.message,
    });
  }
};

// =========================================================================
// 👤 3. GET LOGGED-IN PATIENT'S OWN NOTES (Patient View)
// =========================================================================
export const getMyClinicalNotes = async (req, res) => {
  try {
    const patientId = req.user._id || req.user.id;
    const clinicId = req.headers["x-clinic-id"] || req.user.clinicId;

    const query = { patientId };
    if (clinicId) query.clinicId = clinicId;

    const notes = await ClinicalNote.find(query)
      .populate(
        "dentistId",
        "firstName lastName fullName specialization profileImage",
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: notes.length,
      data: notes,
    });
  } catch (error) {
    console.error("❌ Error fetching patient records:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving your clinical records.",
      error: error.message,
    });
  }
};

/* export const getMyNotes = async (req, res) => {
  try {
    const targetPatientId = req.params.patientId || req.user._id;

    const notes = await ClinicalNote.find({ patientId: targetPatientId })
      .populate("dentistId", "firstName lastName role specialization")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
 */
