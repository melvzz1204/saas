// src/pages/patientRegistration.js

const registrationForm = document.getElementById("registration-form");

async function getActiveClinicId() {
  const pathSegments = window.location.pathname.split("/");
  let clinicSlug = pathSegments[1];

  // 🔄 SMART FALLBACK: If slug is empty, missing, or just a filename, force 'apex-dental'
  if (
    !clinicSlug ||
    clinicSlug === "" ||
    clinicSlug.endsWith(".html") ||
    clinicSlug === "register"
  ) {
    clinicSlug = "apex-dental";
  }

  console.log("🔍 System is attempting to find clinic with slug:", clinicSlug);

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/tenants/slug/${clinicSlug}`,
    );
    const result = await response.json();

    if (response.ok && result.data) {
      return result.data._id; // Returns your real 6a2127a732ade6c6dd4f3dae ID!
    } else {
      console.error("Clinic slug not recognized by backend database.");
      return null;
    }
  } catch (error) {
    console.error("Error identifying tenant context:", error);
    return null;
  }
}
async function handleRegistration(event) {
  event.preventDefault();

  // Find the submit button to provide visual feedback
  const submitBtn = registrationForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering...";
  }

  const userData = {
    firstName: document.getElementById("firstName").value,
    lastName: document.getElementById("lastName").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    dateOfBirth: document.getElementById("dateOfBirth").value,
    password: document.getElementById("password").value,
    role: "PATIENT",
  };

  // 🔄 DYNAMIC SWITCH HERE: Fetching the ID dynamically instead of hardcoding
  const dynamicClinicId = await getActiveClinicId();

  if (!dynamicClinicId) {
    alert(
      "❌ Error: Could not determine which dental clinic you are registering for.",
    );
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
    }
    return;
  }

  try {
    const response = await fetch(
      "http://localhost:5000/api/v1/patients/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": dynamicClinicId, // Passing dynamic context header
        },
        body: JSON.stringify(userData),
      },
    );

    const result = await response.json();

    if (response.ok) {
      alert("🎉 Registered successfully!");
      registrationForm.reset(); // Clears out the form inputs cleanly

      // Optional: Send them straight to login after a successful registration
      window.location.href = "/login.html";
    } else {
      alert(`❌ Error: ${result.message}`);
    }
  } catch (error) {
    console.error("Connection issue:", error);
    alert("❌ Network error. Check if your backend server is online.");
  } finally {
    // Re-enable the button if registration fails
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register";
    }
  }
}

// 3. THE BINDING STEP: Tell the form to listen for the 'submit' event safely
if (registrationForm) {
  registrationForm.addEventListener("submit", handleRegistration);
}
