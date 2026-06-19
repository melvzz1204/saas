// src/models/patientFullInfoModel.js
import mongoose from "mongoose";

const patientFullInfoSchema = new mongoose.Schema(
  {
    // 🔗 Reference to the Core Authentication User Document
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Guarantees a clean 1:1 relationship
    },
    // Multi-tenant isolation matching your User model architecture
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },

    // 01/ PERSONAL INFORMATION
    personalInformation: {
      name: {
        // Pulled initially from User, but overrideable if they write updates
        last: { type: String, required: true, trim: true },
        first: { type: String, required: true, trim: true },
        middle: { type: String, required: false },
      },
      birthdate: { type: Date, required: true }, // Derived initially from user's dateOfBirth
      age: { type: Number, required: false },
      sex: { type: String, enum: ["M", "F", ""], default: "" },
      religion: { type: String },
      nationality: { type: String },
      nickname: { type: String },
      homeAddress: { type: String },
      homeNo: { type: String },
      occupation: { type: String },
      officeNo: { type: String },
      faxNo: { type: String },
      dentalInsurance: { type: String },
      effectiveDate: { type: Date },
      cellMobileNo: { type: String, required: true, trim: true }, // Derived from user's phone
      emailAddress: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      }, // Derived from user's email

      minorContingency: {
        parentGuardianName: { type: String },
        occupation: { type: String },
      },
      referredBy: { type: String },
      reasonForConsultation: { type: String },
    },

    // 02/ DENTAL HISTORY (Optional)
    dentalHistory: {
      previousDentist: { type: String },
      lastDentalVisit: { type: String },
    },

    // 03/ MEDICAL HISTORY (Optional)
    medicalHistory: {
      physician: {
        name: { type: String },
        specialty: { type: String },
        officeAddress: { type: String },
        officeNumber: { type: String },
      },
      questionnaire: {
        isInGoodHealth: { type: Boolean, default: null },
        isUnderMedicalTreatment: {
          status: { type: Boolean, default: null },
          conditionDescription: { type: String },
        },
        hasSeriousIllnessOrSurgery: {
          status: { type: Boolean, default: null },
          illnessOrOperationDescription: { type: String },
        },
        hasBeenHospitalized: {
          status: { type: Boolean, default: null },
          whenAndWhyDescription: { type: String },
        },
        isTakingMedications: {
          status: { type: Boolean, default: null },
          medicationDetails: { type: String },
        },
        usesTobacco: { type: Boolean, default: null },
        usesAlcoholOrDrugs: { type: Boolean, default: null },
      },
      allergies: {
        localAnesthetic: { type: Boolean, default: false },
        penicillinAntibiotics: { type: Boolean, default: false },
        sulfaDrugs: { type: Boolean, default: false },
        aspirin: { type: Boolean, default: false },
        latex: { type: Boolean, default: false },
        other: { type: String },
      },
      forWomenOnly: {
        isPregnant: { type: Boolean, default: false },
        isNursing: { type: Boolean, default: false },
        isTakingBirthControlPills: { type: Boolean, default: false },
      },
      vitals: {
        bleedingTime: { type: String },
        bloodType: { type: String },
        bloodPressure: { type: String },
      },
    },

    // 04/ MEDICAL CONDITIONS MATRIX (All default to false safely)
    medicalConditionsMatrix: {
      highBloodPressure: { type: Boolean, default: false },
      lowBloodPressure: { type: Boolean, default: false },
      epilepsyConvulsions: { type: Boolean, default: false },
      aidsOrHivInfection: { type: Boolean, default: false },
      sexuallyTransmittedDisease: { type: Boolean, default: false },
      stomachTroubleUlcers: { type: Boolean, default: false },
      faintingSeizure: { type: Boolean, default: false },
      rapidWeightLoss: { type: Boolean, default: false },
      radiationTherapy: { type: Boolean, default: false },
      jointReplacementImplant: { type: Boolean, default: false },
      heartSurgery: { type: Boolean, default: false },
      heartAttack: { type: Boolean, default: false },
      thyroidProblem: { type: Boolean, default: false },
      heartDisease: { type: Boolean, default: false },
      heartMurmur: { type: Boolean, default: false },
      hepatitisLiverDisease: { type: Boolean, default: false },
      rheumaticFever: { type: Boolean, default: false },
      hayFeverAllergies: { type: Boolean, default: false },
      respiratoryProblems: { type: Boolean, default: false },
      hepatitisJaundice: { type: Boolean, default: false },
      tuberculosis: { type: Boolean, default: false },
      swollenAnkles: { type: Boolean, default: false },
      kidneyDisease: { type: Boolean, default: false },
      diabetes: { type: Boolean, default: false },
      chestPain: { type: Boolean, default: false },
      stroke: { type: Boolean, default: false },
      cancerTumors: { type: Boolean, default: false },
      anemia: { type: Boolean, default: false },
      angina: { type: Boolean, default: false },
      asthma: { type: Boolean, default: false },
      emphysema: { type: Boolean, default: false },
      bleedingProblems: { type: Boolean, default: false },
      bloodDiseases: { type: Boolean, default: false },
      headInjuries: { type: Boolean, default: false },
      arthritisRheumatism: { type: Boolean, default: false },
      otherConditionsDetails: { type: String },
    },

    // 05/ CERTIFICATION
    submissionMetadata: {
      patientSignatureTextOrDataUrl: { type: String },
      dateSigned: { type: Date },
    },
  },
  { timestamps: true },
);

// Optimize search queries targeting records for specific users inside specific clinics
patientFullInfoSchema.index({ clinicId: 1, userId: 1 }, { unique: true });

export default mongoose.model("PatientFullInfo", patientFullInfoSchema);
