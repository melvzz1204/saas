import ClinicalNote from "../models/ClinicalNote.js";

// =========================================================================
// 📝 1. CREATE CLINICAL NOTE (Dentist / Staff Only)
// =========================================================================
export const createClinicalNote = async (req, res) => {
  try {
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

    // Populate dentist name for immediate UI feedback
    const populatedNote = await newNote.populate([
      { path: "dentistId", select: "firstName lastName fullName email" },
      { path: "patientId", select: "firstName lastName fullName email" },
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
