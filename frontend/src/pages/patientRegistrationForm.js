/**
 * Patient Modal Registration Controller
 * Location Path: /src/pages/patientRegistrationForm.js
 */

const URL_PARAMS_CONTEXT = new URLSearchParams(window.location.search);
const CLINIC_SLUG_TOKEN = URL_PARAMS_CONTEXT.get("clinic");
const API_GATEWAY_NODE = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", async () => {
  const registrationForm = document.getElementById("registration-form");
  const modalTitle = document.getElementById("modal-clinic-title");
  let resolvedTenantId = null;

  if (!CLINIC_SLUG_TOKEN) {
    showModalBanner(
      "Configuration Failure: Missing operational clinical slug context parameters.",
      "error",
    );
    disableRegistrationState(registrationForm);
    return;
  }

  // 1. Resolve tenant identity details to bind the incoming account cleanly
  try {
    const response = await fetch(
      `${API_GATEWAY_NODE}/api/v1/tenants/slug/${CLINIC_SLUG_TOKEN}`,
    );
    const result = await response.json();

    if (result.success && result.data) {
      resolvedTenantId = result.data._id;
      if (modalTitle) modalTitle.textContent = `Join ${result.data.name}`;
    } else {
      throw new Error("The requested clinic directory node is unregistered.");
    }
  } catch (err) {
    showModalBanner(err.message, "error");
    disableRegistrationState(registrationForm);
    return;
  }

  // 2. Form Submission Pipeline Interceptor
  if (registrationForm) {
    registrationForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn = document.getElementById("submit-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Compiling Secure Record...";
      }

      // Collect inputs using your exact layout IDs
      const payload = {
        firstName: document.getElementById("firstName").value.trim(),
        lastName: document.getElementById("lastName").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        dateOfBirth: document.getElementById("dateOfBirth").value,
        password: document.getElementById("password").value,
        role: "PATIENT",
      };

      try {
        const response = await fetch(
          `${API_GATEWAY_NODE}/api/v1/patients/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-clinic-id": resolvedTenantId,
            },
            body: JSON.stringify(payload),
          },
        );

        const result = await response.json();

        if (response.ok && (result.success || result.data)) {
          // 🎯 Targets your exact visual modal notice text container element!
          showModalBanner(
            "✓ Registration successfully. Routing to login page.",
            "success",
          );

          // Clear text entries immediately
          registrationForm.reset();

          // ⏳ Let them see the validation indicator, then pull the modal view down smoothly
          setTimeout(() => {
            const registerModal = document.getElementById("register-modal");
            if (registerModal) {
              registerModal.classList.add("hidden");
              document.body.classList.remove("overflow-hidden");
            }

            // Clean modal banner state quietly for their next portal access cycle
            const modalBanner = document.getElementById(
              "registration-status-banner",
            );
            if (modalBanner) modalBanner.classList.add("hidden");

            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Register Account";
            }
          }, 2500);
        } else {
          showModalBanner(
            `Processing Blocked: ${result.message || "Invalid account payload dimensions."}`,
            "error",
          );
          resetSubmitButton(submitBtn);
        }
      } catch (error) {
        showModalBanner(error.message, "error");
        resetSubmitButton(submitBtn);
      }
    });
  }
});

// Dynamic Banner Injection Engine mapped directly to your modal layer selector
function showModalBanner(text, type) {
  const banner = document.getElementById("registration-status-banner"); // ✅ FIX: Target correct modal block
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

function resetSubmitButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = "Register Account";
}

function disableRegistrationState(form) {
  if (!form) return;
  form.style.pointerEvents = "none";
  form.style.opacity = "0.3";
}
