// src/pages/login.js

const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");

// src/pages/patientLogin.js

async function getActiveClinicId() {
  const pathSegments = window.location.pathname.split("/");
  let clinicSlug = pathSegments[1];

  // 🔄 SMART FALLBACK: If slug is empty, missing, or points to a system filename like 'login', force 'apex-dental'
  if (
    !clinicSlug ||
    clinicSlug === "" ||
    clinicSlug.endsWith(".html") ||
    clinicSlug === "login" ||
    clinicSlug === "index"
  ) {
    clinicSlug = "apex-dental";
  }

  console.log(
    "🔍 Login system attempting to find clinic with slug:",
    clinicSlug,
  );

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/tenants/slug/${clinicSlug}`,
    );
    const result = await response.json();

    if (response.ok && result.data) {
      return result.data._id; // Returns your real MongoDB hex string ID
    } else {
      console.error("Clinic slug not recognized by backend database.");
      return null;
    }
  } catch (error) {
    console.error("Error identifying tenant context:", error);
    return null;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  // 🔄 DYNAMIC SWITCH HERE:
  const dynamicClinicId = await getActiveClinicId();

  if (!dynamicClinicId) {
    alert(
      "❌ Error: Could not verify which dental clinic you are trying to log into.",
    );
    loginBtn.disabled = false;
    loginBtn.textContent = "Log In";
    return;
  }

  try {
    const response = await fetch(
      "http://localhost:5000/api/v1/patients/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": dynamicClinicId, // Pass the dynamic lookup ID to the backend middleware
        },
        body: JSON.stringify({ email, password }),
      },
    );

    const result = await response.json();

    if (response.ok) {
      alert("🎉 Login Successful!");

      localStorage.setItem("token", result.token);

      // 💡 PRO TIP: Save the clinic ID inside the user object session so the dashboard can access it later!
      const userSessionData = { ...result.user, clinicId: dynamicClinicId };
      localStorage.setItem("user", JSON.stringify(userSessionData));

      window.location.href = "/patientDashboard.html";
    } else {
      alert(`❌ Login Failed: ${result.message}`);
    }
  } catch (error) {
    console.error("Network Error:", error);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Log In";
  }
});
