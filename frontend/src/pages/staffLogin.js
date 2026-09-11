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

    const emailInput = document.getElementById("staff-email");
    const pinInput = document.getElementById("staff-pin");
    const email = emailInput.value.trim();
    const pin = pinInput.value.trim();
    const submitBtn = loginForm.querySelector("button[type='submit']");

    if (!email) {
      AppFeedback.showFieldError(emailInput, "Enter your workspace email.");
      emailInput.focus();
      return;
    }
    if (!emailInput.checkValidity()) {
      AppFeedback.showFieldError(emailInput, "Enter a valid email address.");
      emailInput.focus();
      return;
    }
    if (!pin) {
      AppFeedback.showFieldError(pinInput, "Enter your access PIN.");
      pinInput.focus();
      return;
    }
    AppFeedback.clearFieldError(emailInput);
    AppFeedback.clearFieldError(pinInput);
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.textContent = "Signing in…";

    try {
      // 🚀 LINKED: Points directly to your active Port 5000 login node layout
      const { response, data } = await AppFeedback.request(
        "http://localhost:5000/api/v1/staff/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, accessPin: pin }),
        },
      );

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
      console.error("Staff login request failed", err);
      showError(
        AppFeedback.safeMessage(
          err,
          err.status ? { status: err.status } : null,
        ),
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
      submitBtn.textContent = "Enter Duty Station";
    }
  });

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.classList.remove("hidden");
    }
  }
});
