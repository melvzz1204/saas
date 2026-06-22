/**
 * Staff Terminal Authentication Controller
 * Location Path: /src/pages/staffLogin.js
 */

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("staff-login-form");
  const errorBox = document.getElementById("error-box");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset state indicator error frames
    errorBox.classList.add("hidden");
    errorBox.textContent = "";

    const email = document.getElementById("staff-email").value.trim();
    const pin = document.getElementById("staff-pin").value.trim();

    // Structural validation sanity checks before transmission
    if (!email || !pin) {
      showError("Authentication values cannot be empty entries.");
      return;
    }

    try {
      // 🚀 LINKED: Points directly to your active Port 5000 login node layout
      const response = await fetch("http://localhost:5000/api/v1/staff/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Passing accessPin key name to match your backend expectations
        body: JSON.stringify({ email, accessPin: pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Invalid credentials. Check email or terminal PIN.",
        );
      }

      // Extract details from your matching backend response pattern
      const staffProfile = data.staff;
      const assignedRole = staffProfile.role; // 🧠 Extracts: "Dentist" or "Receptionist"

      // Persistence Matrix Write operations
      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", assignedRole.toLowerCase()); // Dynamic role tracking ("dentist"/"receptionist")
      localStorage.setItem("staffName", staffProfile.fullName);
      localStorage.setItem("staffId", staffProfile.id);
      localStorage.setItem("clinicId", staffProfile.clinicId); // Cache tenant context for staff operational requests
      localStorage.setItem(
        "clinicName",
        data.clinicName || "Apex Dental Practice",
      );

      // =============================================================
      // 🚀 ROLE-BASED PIPELINE REDIRECTION SWITCH MATRIX
      // =============================================================
      if (assignedRole === "Dentist") {
        // Clinical operators get pushed to the dental chair cockpit view
        window.location.href = "/dentistDashboard.html";
      } else if (assignedRole === "Receptionist") {
        // Front desk staff route directly to lobby scheduling boards
        window.location.href = "/staffDashboard.html";
      } else if (assignedRole === "Staff") {
        window.location.href = "/staffDashboard.html";
      } else {
        // Fallback catchall for alternate operational deck roles (e.g., Dental Hygienist)
        window.location.href = "/staffDashboard.html";
      }

      // =============================================================
    } catch (err) {
      console.error("Staff login intercept error:", err);
      showError(
        err.message ||
          "Network system timed out. Please contact system administrator.",
      );
    }
  });

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.classList.remove("hidden");
    }
  }
});
