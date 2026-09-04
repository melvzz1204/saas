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
      const staffProfile = data.staff || {};
      const assignedRole = String(staffProfile.role || "").trim();
      const normalizedRole = assignedRole.toLowerCase();

      if (
        !data.token ||
        !staffProfile.id ||
        !staffProfile.clinicId ||
        !normalizedRole
      ) {
        throw new Error(
          "The staff login response is missing required session data.",
        );
      }

      // Persistence Matrix Write operations
      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", normalizedRole);
      localStorage.setItem("staffName", staffProfile.fullName || "Doctor");
      localStorage.setItem("staffId", String(staffProfile.id));
      localStorage.setItem("staffPhone", staffProfile.phone || "");
      localStorage.setItem(
        "staffLicenseNumber",
        staffProfile.licenseNumber || "",
      );
      localStorage.setItem(
        "staffEmail",
        staffProfile.email || email.toLowerCase(),
      );
      localStorage.setItem("clinicId", String(staffProfile.clinicId)); // Cache tenant context for staff operational requests
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: staffProfile.id,
          fullName: staffProfile.fullName,
          email: staffProfile.email || email.toLowerCase(),
          phone: staffProfile.phone || "",
          licenseNumber: staffProfile.licenseNumber || "",
          specialization: staffProfile.specialization || "",
          role: normalizedRole,
          clinicId: staffProfile.clinicId,
        }),
      );
      localStorage.setItem(
        "clinicName",
        data.clinicName || "Apex Dental Practice",
      );

      // =============================================================
      // 🚀 ROLE-BASED PIPELINE REDIRECTION SWITCH MATRIX
      // =============================================================
      if (normalizedRole === "dentist" || normalizedRole === "doctor") {
        // Clinical operators get pushed to the dental chair cockpit view
        window.location.href = "/dentistDashboard.html";
      } else if (normalizedRole === "receptionist") {
        // Front desk staff route directly to lobby scheduling boards
        window.location.href = "/staffDashboard.html";
      } else if (normalizedRole === "staff") {
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
