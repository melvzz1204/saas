// /src/pages/patientLogin.js

let contextClinicId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const titleElement = document.getElementById("clinic-title");
  const formElement = document.getElementById("login-form");
  const registerLink = document.getElementById("register-redirect-link");

  const urlParams = new URLSearchParams(window.location.search);
  const clinicSlug = urlParams.get("clinic");

  if (!clinicSlug) {
    showBanner(
      "This clinic link is incomplete. Return to the clinic page and try again.",
      "error",
    );
    if (titleElement) titleElement.textContent = "Identity Error";
    if (formElement) {
      formElement.style.pointerEvents = "none";
      formElement.style.opacity = "0.3";
    }
    return;
  }

  // 📝 CRITICAL FIX A: Cache clinicSlug globally into storage layers right away
  localStorage.setItem("clinicSlug", clinicSlug);

  if (registerLink) {
    registerLink.href = `/patientRegistration?clinic=${clinicSlug}`;
  }

  // 1. Fetch structural clinic metadata via your adaptive identity endpoint
  try {
    const { data: result } = await AppFeedback.request(
      `http://localhost:5000/api/v1/tenants/slug/${clinicSlug}`,
    );

    if (result.success && result.data) {
      contextClinicId = result.data._id;
      if (titleElement) titleElement.textContent = `${result.data.name}`;
    } else {
      throw new Error(
        "Target clinical location context not registered in our SaaS directory.",
      );
    }
  } catch (error) {
    console.error("Clinic context request failed", error);
    showBanner(
      AppFeedback.safeMessage(
        error,
        error.status ? { status: error.status } : null,
      ),
      "error",
    );
    if (titleElement) titleElement.textContent = "Clinic Portal";
    if (formElement) {
      formElement.style.pointerEvents = "none";
      formElement.style.opacity = "0.3";
    }
    return;
  }

  if (formElement) {
    formElement.addEventListener("submit", handlePatientLoginSubmit);
  }
});

// 🚀 Fixed & Consolidated Authentication Form Handler
async function handlePatientLoginSubmit(e) {
  e.preventDefault();

  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  if (!emailInput.value.trim()) {
    AppFeedback.showFieldError(emailInput, "Enter your email address.");
    emailInput.focus();
    return;
  }
  if (!emailInput.checkValidity()) {
    AppFeedback.showFieldError(emailInput, "Enter a valid email address.");
    emailInput.focus();
    return;
  }
  if (!passwordInput.value) {
    AppFeedback.showFieldError(passwordInput, "Enter your password.");
    passwordInput.focus();
    return;
  }
  AppFeedback.clearFieldError(emailInput);
  AppFeedback.clearFieldError(passwordInput);

  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Authorizing Token Session...";
  }

  const emailValue = document.getElementById("login-email").value;
  const passwordValue = document.getElementById("login-password").value;

  const payload = {
    email: emailValue,
    password: passwordValue,
  };

  try {
    // 🔗 Hit the central authentication node and pass the critical tenant header context!
    const { response, data: result } = await AppFeedback.request(
      "http://localhost:5000/api/v1/patients/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clinic-id": contextClinicId,
        },
        body: JSON.stringify(payload),
      },
    );

    if (result && (result.success || result.token)) {
      console.log("📥 Clean Login Server Response:", result);

      // Extract properties checking both standard root structures and data objects safely
      const cleanToken = result.token || result.data?.token;
      const userPayload = result.user || result.data?.user;

      console.log("👤 Extracted User Payload:", userPayload);

      if (!userPayload) {
        throw new Error(
          "Authentication failed: Server did not return a valid user payload structure.",
        );
      }

      // Enforce uppercase PATIENT role match rule parameters
      if (userPayload.role && userPayload.role.toUpperCase() !== "PATIENT") {
        throw new Error(
          "Access Blocked: Workspace personnel must log into the administrative hub.",
        );
      }

      showBanner(
        "Identity Verified! Syncing encrypted dashboard node...",
        "success",
      );

      // Save credentials cleanly to localStorage compartments
      localStorage.setItem("token", String(cleanToken).trim());
      localStorage.setItem("user", JSON.stringify(userPayload));

      // 📝 CRITICAL FIX B: Pass the active routing scope query param over to the dashboard page view
      const activeSlug = localStorage.getItem("clinicSlug") || "default";

      setTimeout(() => {
        window.location.href = `/patientDashboard.html?clinic=${activeSlug}`;
      }, 1500);
    } else {
      showBanner(
        `Authentication Blocked: ${result.message || "Invalid credentials"}`,
        "error",
      );
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Verify Secure Session";
      }
    }
  } catch (error) {
    console.error("Patient login request failed", error);
    showBanner(
      AppFeedback.safeMessage(
        error,
        error.status ? { status: error.status } : null,
      ),
      "error",
    );
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.removeAttribute("aria-busy");
      loginBtn.textContent = "Verify Secure Session";
    }
  }
}

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
