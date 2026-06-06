// /src/pages/patientRegistrationForm.js

// 🎯 FIX: Declare both contextClinicId and urlParams globally at the top level
let contextClinicId = null;
const urlParams = new URLSearchParams(window.location.search);

document.addEventListener("DOMContentLoaded", async () => {
  const titleElement = document.getElementById("clinic-title");
  const formElement = document.getElementById("registration-form");

  const clinicSlug = urlParams.get("clinic");

  if (!clinicSlug) {
    showBanner(
      "Invalid Portal Link: Missing workspace identifier code.",
      "error",
    );
    titleElement.textContent = "Access Portal Error";
    formElement.style.pointerEvents = "none";
    formElement.style.opacity = "0.3";
    return;
  }

  // 2. Fetch the true Clinic Data from your backend tenant router via Slug lookup
  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/tenants/slug/${clinicSlug}`,
    );
    const result = await response.json();

    if (result.success && result.data) {
      contextClinicId = result.data._id; // 🔗 Safely store your bound Mongo clinicId
      titleElement.textContent = `${result.data.name} Patient Portal`;
    } else {
      throw new Error(
        "Specified clinic workspace does not exist inside our SaaS directory.",
      );
    }
  } catch (error) {
    showBanner(error.message, "error");
    titleElement.textContent = "Portal Offline";
    formElement.style.pointerEvents = "none";
    formElement.style.opacity = "0.3";
    return;
  }

  // 3. Attach Submit Request Listener to Form
  formElement.addEventListener("submit", handlePatientSubmit);
});

// 🚀 Form Submission Handler
async function handlePatientSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Processing Registration...";

  // Construct payload, injecting the dynamically resolved contextClinicId
  const payload = {
    clinicId: contextClinicId,
    firstName: document.getElementById("firstName").value,
    lastName: document.getElementById("lastName").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    dateOfBirth: document.getElementById("dateOfBirth").value,
    password: document.getElementById("password").value,
    role: "PATIENT",
  };

  try {
    // Fire straight into your app's patient entry route file
    const response = await fetch(
      "http://localhost:5000/api/v1/patients/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": contextClinicId,
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json();

    if (result.success) {
      showBanner(
        "🎉 Registration complete! Redirecting to login context...",
        "success",
      );
      document.getElementById("registration-form").reset();

      // Smooth handoff to your system login portal after 2.5 seconds
      setTimeout(() => {
        // 🎯 Safely reads urlParams globally now with no reference errors!
        window.location.href = `/patientLogin.html?clinic=${urlParams.get("clinic") || ""}`;
      }, 2500);
    } else {
      showBanner(`Registration Blocked: ${result.message}`, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Register Account Node";
    }
  } catch (error) {
    showBanner(`Network Connection Failed: ${error.message}`, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Register Account Node";
  }
}

// UI helper to toggle styling on notification banners
function showBanner(text, type) {
  const banner = document.getElementById("status-banner");
  if (!banner) return;

  banner.textContent = text;
  banner.classList.remove(
    "hidden",
    "bg-rose-500/10",
    "text-rose-400",
    "border-rose-500/20",
    "bg-emerald-500/10",
    "text-emerald-400",
    "border-emerald-500/20",
  );

  if (type === "error") {
    banner.classList.add(
      "bg-rose-500/10",
      "text-rose-400",
      "border",
      "border-rose-500/20",
    );
  } else {
    banner.classList.add(
      "bg-emerald-500/10",
      "text-emerald-400",
      "border",
      "border-emerald-500/20",
    );
  }
}
