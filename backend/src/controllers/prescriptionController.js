// src/controllers/prescriptionController.js
import mongoose from "mongoose";
import Prescription from "../models/prescriptionModel.js";

const isValidId = (id) => id && mongoose.Types.ObjectId.isValid(String(id));

// 1. Dentist creates a prescription for the active patient
export const createPrescription = async (req, res) => {
  try {
    const { patientId, patientName, appointmentId, diagnosis, medications, advice } = req.body;

    const rawClinicId = req.body.clinicId || req.headers["x-clinic-id"] || req.user?.clinicId;
    const clinicId = String(rawClinicId || "").trim();

    // Dentist identity comes from the Staff-model JWT (id) or explicit body
    const rawDentistId = req.body.dentistId || req.user?.id || req.user?._id;
    const dentistId = String(rawDentistId || "").trim();

    if (!clinicId || !isValidId(clinicId)) {
      return res.status(400).json({ success: false, message: "Clinic context is required." });
    }
    if (!dentistId || !isValidId(dentistId)) {
      return res.status(401).json({ success: false, message: "Unable to verify dentist identity." });
    }
    if ((!patientId || !isValidId(patientId)) && !patientName?.trim()) {
      return res.status(400).json({ success: false, message: "Patient is required." });
    }
    const meds = Array.isArray(medications)
      ? medications.map((m) => ({
          name: String(m?.name || "").trim(),
          dosage: String(m?.dosage || "").trim(),
          frequency: String(m?.frequency || "").trim(),
          duration: String(m?.duration || "").trim(),
          quantity: String(m?.quantity || "").trim(),
          instructions: String(m?.instructions || "").trim(),
        })).filter((m) => m.name)
      : [];
    if (!meds.length) {
      return res.status(400).json({ success: false, message: "At least one medication is required." });
    }

    const doc = await Prescription.create({
      clinicId: new mongoose.Types.ObjectId(clinicId),
      patientId: isValidId(patientId) ? new mongoose.Types.ObjectId(String(patientId)) : null,
      patientName: String(patientName || "").trim(),
      dentistId: new mongoose.Types.ObjectId(dentistId),
      appointmentId: isValidId(appointmentId) ? new mongoose.Types.ObjectId(String(appointmentId)) : null,
      diagnosis: String(diagnosis || "").trim(),
      medications: meds,
      advice: String(advice || "").trim(),
      status: "Active",
    });

    const populated = await Prescription.findById(doc._id)
      .populate("dentistId", "fullName specialization")
      .populate("patientId", "firstName lastName");

    if (global.io) {
      global.io.emit("pipeline-update", {
        message: `New prescription issued for ${populated.patientName || "patient"}.`,
        prescriptionId: populated._id,
      });
    }

    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("❌ createPrescription Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Dentist/staff views all prescriptions of one patient
export const getPatientPrescriptions = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!isValidId(patientId)) {
      return res.status(422).json({ success: false, message: "Malformed patient ID." });
    }
    const list = await Prescription.find({ patientId: new mongoose.Types.ObjectId(String(patientId)) })
      .populate("dentistId", "fullName specialization")
      .populate("clinicId", "name")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Prescriptions linked to one appointment
export const getAppointmentPrescriptions = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    if (!isValidId(appointmentId)) {
      return res.status(422).json({ success: false, message: "Malformed appointment ID." });
    }
    const list = await Prescription.find({ appointmentId: new mongoose.Types.ObjectId(String(appointmentId)) })
      .populate("dentistId", "fullName specialization")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Patient views their own prescriptions (ownership enforced via token)
export const getMyPrescriptions = async (req, res) => {
  try {
    const rawId = req.user?._id || req.user?.id || req.user?.userId;
    if (!isValidId(rawId)) {
      return res.status(401).json({ success: false, message: "Unable to verify patient identity." });
    }
    const list = await Prescription.find({
      patientId: new mongoose.Types.ObjectId(String(rawId)),
      status: "Active",
    })
      .populate("dentistId", "fullName specialization")
      .populate("clinicId", "name")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: list });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Dentist cancels a prescription
export const cancelPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(422).json({ success: false, message: "Malformed prescription ID." });
    }
    const updated = await Prescription.findByIdAndUpdate(id, { status: "Cancelled" }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Prescription not found." });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
