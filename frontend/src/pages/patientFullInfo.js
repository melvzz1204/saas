const token = localStorage.getItem("token");
const userJson = localStorage.getItem("user");

if (!token || !userJson) {
  console.warn("⚠️ Credentials missing. Redirecting to login gate.");
  const sessionSlug = localStorage.getItem("clinicSlug") || "default";
  window.location.href = `/clinicHomePage.html?clinic=${sessionSlug}`;
}

// Helper: Securely decode JWT properties to match dashboard fallback chain
function parseJwt(tokenString) {
  try {
    if (!tokenString) return null;
    const base64Url = tokenString.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("❌ JWT Payload Decode Exception:", e);
    return null;
  }
}

const decodedToken = parseJwt(token);
const currentUser = JSON.parse(userJson || "{}");

const DYNAMIC_CLINIC_ID = currentUser.clinicId || decodedToken?.clinicId;
const verifiedPatientId =
  currentUser._id || currentUser.id || decodedToken?.userId;

const statusToast = document.getElementById("statusToast");

function showToast(message, color) {
  if (!statusToast) return;
  statusToast.style.display = "block";
  statusToast.innerText = message;
  statusToast.style.backgroundColor =
    color === "green" ? "#d1fae5" : color === "orange" ? "#ffedd5" : "#fee2e2";
  statusToast.style.color =
    color === "green" ? "#065f46" : color === "orange" ? "#9a3412" : "#991b1b";
  statusToast.style.border = `1px solid ${color === "green" ? "#10b981" : color === "orange" ? "#f97316" : "#ef4444"}`;
}

// Calculate age on-the-fly when birthdate is mutated
const birthdateInput = document.getElementById("pi_birthdate");
const ageInput = document.getElementById("pi_age");

if (birthdateInput && ageInput) {
  birthdateInput.addEventListener("change", () => {
    if (!birthdateInput.value) return;
    const birthDate = new Date(birthdateInput.value);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      calculatedAge--;
    }
    ageInput.value = calculatedAge >= 0 ? calculatedAge : 0;
  });
}

// Helpers for reading/writing radio buttons safely
function getRadioValue(name) {
  const checkedRadio = document.querySelector(`input[name="${name}"]:checked`);
  return checkedRadio ? checkedRadio.value === "true" : false;
}

function setRadioValue(name, booleanValue) {
  const valueString =
    booleanValue === true || booleanValue === "true" ? "true" : "false";
  const radio = document.querySelector(
    `input[name="${name}"][value="${valueString}"]`,
  );
  if (radio) radio.checked = true;
}

// Inside your patientFullInfo.js file
async function fetchPatientIntakeRecord() {
  // Pre-seed known read-only account details from local session storage immediately
  if (document.getElementById("pi_firstName"))
    document.getElementById("pi_firstName").value = currentUser.firstName || "";
  if (document.getElementById("pi_lastName"))
    document.getElementById("pi_lastName").value = currentUser.lastName || "";
  if (document.getElementById("pi_emailAddress"))
    document.getElementById("pi_emailAddress").value = currentUser.email || "";

  try {
    // 🌟 Read dynamically from localStorage where your login file saved it!
    const savedToken = localStorage.getItem("token");

    // Diagnostic validation alert
    if (!savedToken || savedToken === "undefined") {
      throw new Error(
        "No valid JWT authorization token found in localStorage. Please log in again.",
      );
    }

    const response = await fetch(
      `http://localhost:5000/api/v1/patients/profile`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${savedToken}`, // 👈 Sends the freshly pulled token string

          "x-clinic-id": DYNAMIC_CLINIC_ID,
        },
      },
    );

    if (response.status === 401) {
      throw new Error("Not authorized, token invalid or expired");
    }

    const result = await response.json();

    if (response.ok && result.data) {
      populateFormFields(result.data);
    } else {
      console.warn(
        "No active intake document found on server. Rendering clean workflow.",
      );
    }
  } catch (error) {
    console.warn(
      "⚠️ Backend fetch failed:",
      error.message,
      ". Using session memory baseline.",
    );
    showToast(
      `Bypass Notice: Injecting local account details (${error.message || "Offline"}).`,
      "orange",
    );
  }
}

// Maps incoming JSON structures to explicit element node configurations
function populateFormFields(data) {
  if (!data) return;

  // Personal Information
  if (data.lastName)
    document.getElementById("pi_lastName").value = data.lastName;
  if (data.firstName)
    document.getElementById("pi_firstName").value = data.firstName;
  if (data.middleName)
    document.getElementById("pi_middleName").value = data.middleName || "";
  if (data.birthdate) {
    document.getElementById("pi_birthdate").value =
      data.birthdate.split("T")[0];
    document.getElementById("pi_birthdate").dispatchEvent(new Event("change")); // Force calculate age
  }
  if (data.sex) document.getElementById("pi_sex").value = data.sex;
  if (data.religion)
    document.getElementById("pi_religion").value = data.religion || "";
  if (data.nationality)
    document.getElementById("pi_nationality").value = data.nationality || "";
  if (data.nickname)
    document.getElementById("pi_nickname").value = data.nickname || "";
  if (data.homeAddress)
    document.getElementById("pi_homeAddress").value = data.homeAddress || "";
  if (data.homeNo)
    document.getElementById("pi_homeNo").value = data.homeNo || "";
  if (data.occupation)
    document.getElementById("pi_occupation").value = data.occupation || "";
  if (data.officeNo)
    document.getElementById("pi_officeNo").value = data.officeNo || "";
  if (data.faxNo) document.getElementById("pi_faxNo").value = data.faxNo || "";
  if (data.dentalInsurance)
    document.getElementById("pi_dentalInsurance").value =
      data.dentalInsurance || "";
  if (data.effectiveDate)
    document.getElementById("pi_effectiveDate").value =
      data.effectiveDate.split("T")[0] || "";
  if (data.cellMobileNo)
    document.getElementById("pi_cellMobileNo").value = data.cellMobileNo || "";

  // Minor details
  if (data.minorParentName)
    document.getElementById("pi_minor_parentName").value =
      data.minorParentName || "";
  if (data.minorParentOccupation)
    document.getElementById("pi_minor_parentOccupation").value =
      data.minorParentOccupation || "";
  if (data.referredBy)
    document.getElementById("pi_referredBy").value = data.referredBy || "";
  if (data.reasonForConsultation)
    document.getElementById("pi_reasonForConsultation").value =
      data.reasonForConsultation || "";

  // Dental History
  if (data.previousDentist)
    document.getElementById("dh_previousDentist").value =
      data.previousDentist || "";
  if (data.lastDentalVisit)
    document.getElementById("dh_lastDentalVisit").value =
      data.lastDentalVisit || "";

  // Medical History - Physician
  if (data.physicianName)
    document.getElementById("mh_physician_name").value =
      data.physicianName || "";
  if (data.physicianSpecialty)
    document.getElementById("mh_physician_specialty").value =
      data.physicianSpecialty || "";
  if (data.physicianOfficeAddress)
    document.getElementById("mh_physician_officeAddress").value =
      data.physicianOfficeAddress || "";
  if (data.physicianOfficeNumber)
    document.getElementById("mh_physician_officeNumber").value =
      data.physicianOfficeNumber || "";

  // Questionnaire Radios
  setRadioValue("mh_q_goodHealth", data.qGoodHealth);
  setRadioValue("mh_q_treatmentStatus", data.qTreatmentStatus);
  if (data.qTreatmentDesc)
    document.getElementById("mh_q_treatmentDesc").value =
      data.qTreatmentDesc || "";
  setRadioValue("mh_q_illnessStatus", data.qIllnessStatus);
  if (data.qIllnessDesc)
    document.getElementById("mh_q_illnessDesc").value = data.qIllnessDesc || "";
  setRadioValue("mh_q_hospitalStatus", data.qHospitalStatus);
  if (data.qHospitalDesc)
    document.getElementById("mh_q_hospitalDesc").value =
      data.qHospitalDesc || "";
  setRadioValue("mh_q_medicationStatus", data.qMedicationStatus);
  if (data.qMedicationDesc)
    document.getElementById("mh_q_medicationDesc").value =
      data.qMedicationDesc || "";
  setRadioValue("mh_q_tobacco", data.qTobacco);
  setRadioValue("mh_q_drugs", data.qDrugs);

  // Allergenic Profile Checkboxes
  document.getElementById("mh_al_localAnesthetic").checked =
    !!data.alLocalAnesthetic;
  document.getElementById("mh_al_penicillinAntibiotics").checked =
    !!data.alPenicillinAntibiotics;
  document.getElementById("mh_al_sulfaDrugs").checked = !!data.alSulfaDrugs;
  document.getElementById("mh_al_aspirin").checked = !!data.alAspirin;
  document.getElementById("mh_al_latex").checked = !!data.alLatex;
  if (data.alOther)
    document.getElementById("mh_al_other").value = data.alOther || "";

  // Women Fields
  document.getElementById("mh_w_isPregnant").checked = !!data.wIsPregnant;
  document.getElementById("mh_w_isNursing").checked = !!data.wIsNursing;
  document.getElementById("mh_w_isTakingBirthControlPills").checked =
    !!data.wIsTakingBirthControlPills;

  // Vitals
  if (data.vBleedingTime)
    document.getElementById("mh_v_bleedingTime").value =
      data.vBleedingTime || "";
  if (data.vBloodType)
    document.getElementById("mh_v_bloodType").value = data.vBloodType || "";
  if (data.vBloodPressure)
    document.getElementById("mh_v_bloodPressure").value =
      data.vBloodPressure || "";

  // Matrix Checkboxes
  const matrixFields = [
    "highBloodPressure",
    "lowBloodPressure",
    "epilepsyConvulsions",
    "aidsOrHivInfection",
    "sexuallyTransmittedDisease",
    "stomachTroubleUlcers",
    "faintingSeizure",
    "rapidWeightLoss",
    "radiationTherapy",
    "jointReplacementImplant",
    "heartSurgery",
    "heartAttack",
    "thyroidProblem",
    "heartDisease",
    "heartMurmur",
    "hepatitisLiverDisease",
    "rheumaticFever",
    "hayFeverAllergies",
    "respiratoryProblems",
    "hepatitisJaundice",
    "tuberculosis",
    "swollenAnkles",
    "kidneyDisease",
    "diabetes",
    "chestPain",
    "stroke",
    "cancerTumors",
    "anemia",
    "angina",
    "asthma",
    "emphysema",
    "bleedingProblems",
    "bloodDiseases",
    "headInjuries",
    "arthritisRheumatism",
  ];

  matrixFields.forEach((field) => {
    const el = document.getElementById(`mx_${field}`);
    if (el && data.matrix) el.checked = !!data.matrix[field];
  });
  if (
    data.matrix?.otherConditionsDetails &&
    document.getElementById("mx_otherConditionsDetails")
  ) {
    document.getElementById("mx_otherConditionsDetails").value =
      data.matrix.otherConditionsDetails;
  }

  // Signature Metadata
  if (data.signature)
    document.getElementById("sm_signature").value = data.signature || "";
  if (data.dateSigned)
    document.getElementById("sm_dateSigned").value =
      data.dateSigned.split("T")[0];
}

// ==========================================
// 4. COLLECT AND SUBMIT INTAKE DATA FORM
// ==========================================
const intakeForm = document.getElementById("patientIntakeForm");

if (intakeForm) {
  intakeForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Package form elements into a clean, normalized payload object
    const payload = {
      patientId: verifiedPatientId,
      clinicId: DYNAMIC_CLINIC_ID,

      // Personal Info
      lastName: document.getElementById("pi_lastName").value,
      firstName: document.getElementById("pi_firstName").value,
      middleName: document.getElementById("pi_middleName").value,
      birthdate: document.getElementById("pi_birthdate").value,
      sex: document.getElementById("pi_sex").value,
      religion: document.getElementById("pi_religion").value,
      nationality: document.getElementById("pi_nationality").value,
      nickname: document.getElementById("pi_nickname").value,
      homeAddress: document.getElementById("pi_homeAddress").value,
      homeNo: document.getElementById("pi_homeNo").value,
      occupation: document.getElementById("pi_occupation").value,
      officeNo: document.getElementById("pi_officeNo").value,
      faxNo: document.getElementById("pi_faxNo").value,
      dentalInsurance: document.getElementById("pi_dentalInsurance").value,
      effectiveDate: document.getElementById("pi_effectiveDate").value || null,
      cellMobileNo: document.getElementById("pi_cellMobileNo").value,
      minorParentName: document.getElementById("pi_minor_parentName").value,
      minorParentOccupation: document.getElementById(
        "pi_minor_parentOccupation",
      ).value,
      referredBy: document.getElementById("pi_referredBy").value,
      reasonForConsultation: document.getElementById("pi_reasonForConsultation")
        .value,

      // Dental History
      previousDentist: document.getElementById("dh_previousDentist").value,
      lastDentalVisit: document.getElementById("dh_lastDentalVisit").value,

      // Medical History - Physician
      physicianName: document.getElementById("mh_physician_name").value,
      physicianSpecialty: document.getElementById("mh_physician_specialty")
        .value,
      physicianOfficeAddress: document.getElementById(
        "mh_physician_officeAddress",
      ).value,
      physicianOfficeNumber: document.getElementById(
        "mh_physician_officeNumber",
      ).value,

      // Questionnaire Radios
      qGoodHealth: getRadioValue("mh_q_goodHealth"),
      qTreatmentStatus: getRadioValue("mh_q_treatmentStatus"),
      qTreatmentDesc: document.getElementById("mh_q_treatmentDesc").value,
      qIllnessStatus: getRadioValue("mh_q_illnessStatus"),
      qIllnessDesc: document.getElementById("mh_q_illnessDesc").value,
      qHospitalStatus: getRadioValue("mh_q_hospitalStatus"),
      qHospitalDesc: document.getElementById("mh_q_hospitalDesc").value,
      qMedicationStatus: getRadioValue("mh_q_medicationStatus"),
      qMedicationDesc: document.getElementById("mh_q_medicationDesc").value,
      qTobacco: getRadioValue("mh_q_tobacco"),
      qDrugs: getRadioValue("mh_q_drugs"),

      // Allergenic Profiles Checkboxes
      alLocalAnesthetic: document.getElementById("mh_al_localAnesthetic")
        .checked,
      alPenicillinAntibiotics: document.getElementById(
        "mh_al_penicillinAntibiotics",
      ).checked,
      alSulfaDrugs: document.getElementById("mh_al_sulfaDrugs").checked,
      alAspirin: document.getElementById("mh_al_aspirin").checked,
      alLatex: document.getElementById("mh_al_latex").checked,
      alOther: document.getElementById("mh_al_other").value,

      // Women Data
      wIsPregnant: document.getElementById("mh_w_isPregnant").checked,
      wIsNursing: document.getElementById("mh_w_isNursing").checked,
      wIsTakingBirthControlPills: document.getElementById(
        "mh_w_isTakingBirthControlPills",
      ).checked,

      // Vitals
      vBleedingTime: document.getElementById("mh_v_bleedingTime").value,
      vBloodType: document.getElementById("mh_v_bloodType").value,
      vBloodPressure: document.getElementById("mh_v_bloodPressure").value,

      // Sub-Document Conditions Matrix Object
      matrix: {
        highBloodPressure: document.getElementById("mx_highBloodPressure")
          .checked,
        lowBloodPressure: document.getElementById("mx_lowBloodPressure")
          .checked,
        epilepsyConvulsions: document.getElementById("mx_epilepsyConvulsions")
          .checked,
        aidsOrHivInfection: document.getElementById("mx_aidsOrHivInfection")
          .checked,
        sexuallyTransmittedDisease: document.getElementById(
          "mx_sexuallyTransmittedDisease",
        ).checked,
        stomachTroubleUlcers: document.getElementById("mx_stomachTroubleUlcers")
          .checked,
        faintingSeizure: document.getElementById("mx_faintingSeizure").checked,
        rapidWeightLoss: document.getElementById("mx_rapidWeightLoss").checked,
        radiationTherapy: document.getElementById("mx_radiationTherapy")
          .checked,
        jointReplacementImplant: document.getElementById(
          "mx_jointReplacementImplant",
        ).checked,
        heartSurgery: document.getElementById("mx_heartSurgery").checked,
        heartAttack: document.getElementById("mx_heartAttack").checked,
        thyroidProblem: document.getElementById("mx_thyroidProblem").checked,
        heartDisease: document.getElementById("mx_heartDisease").checked,
        heartMurmur: document.getElementById("mx_heartMurmur").checked,
        hepatitisLiverDisease: document.getElementById(
          "mx_hepatitisLiverDisease",
        ).checked,
        rheumaticFever: document.getElementById("mx_rheumaticFever").checked,
        hayFeverAllergies: document.getElementById("mx_hayFeverAllergies")
          .checked,
        respiratoryProblems: document.getElementById("mx_respiratoryProblems")
          .checked,
        hepatitisJaundice: document.getElementById("mx_hepatitisJaundice")
          .checked,
        tuberculosis: document.getElementById("mx_tuberculosis").checked,
        swollenAnkles: document.getElementById("mx_swollenAnkles").checked,
        kidneyDisease: document.getElementById("mx_kidneyDisease").checked,
        diabetes: document.getElementById("mx_diabetes").checked,
        chestPain: document.getElementById("mx_chestPain").checked,
        stroke: document.getElementById("mx_stroke").checked,
        cancerTumors: document.getElementById("mx_cancerTumors").checked,
        anemia: document.getElementById("mx_anemia").checked,
        angina: document.getElementById("mx_angina").checked,
        asthma: document.getElementById("mx_asthma").checked,
        emphysema: document.getElementById("mx_emphysema").checked,
        bleedingProblems: document.getElementById("mx_bleedingProblems")
          .checked,
        bloodDiseases: document.getElementById("mx_bloodDiseases").checked,
        headInjuries: document.getElementById("mx_headInjuries").checked,
        arthritisRheumatism: document.getElementById("mx_arthritisRheumatism")
          .checked,
        otherConditionsDetails: document.getElementById(
          "mx_otherConditionsDetails",
        ).value,
      },

      // Signature values
      signature: document.getElementById("sm_signature").value,
      dateSigned: document.getElementById("sm_dateSigned").value,
    };

    try {
      showToast("Saving legal medical record changes...", "orange");

      const response = await fetch(
        "http://localhost:5000/api/v1/patients/profile",
        {
          method: "POST", // Swap out for 'PUT' if your backend profile router design updates documents dynamically
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Clinic-ID": DYNAMIC_CLINIC_ID,
            "x-clinic-id": DYNAMIC_CLINIC_ID,
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (response.ok) {
        showToast(
          "🚀 Clinical intake records uploaded and secured successfully!",
          "green",
        );
        alert(
          "Success: Medical record saved under Smile Dental Clinic database.",
        );
      } else {
        showToast(
          `❌ Submission Rejected: ${result.message || "Invalid Data Validation"}`,
          "red",
        );
      }
    } catch (error) {
      console.error("Submission Error Matrix:", error);
      showToast(
        "❌ Connection Failure: Database save request rejected.",
        "red",
      );
    }
  });
}

// ==========================================
// 5. LIFECYCLE INITIALIZATION ON MOUNT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("⚓ INTAKE ENGINE LIFECYCLE ACTIVE:");
  console.log("-> Sync Patient ID:", verifiedPatientId);
  console.log("-> Sync Clinic Context ID:", DYNAMIC_CLINIC_ID);

  fetchPatientIntakeRecord();
});
