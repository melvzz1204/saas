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
      if (modalTitle) modalTitle.textContent = `${result.data.name}`;
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
        clinicId: resolvedTenantId, // 👈 ADD THIS LINE HERE
        firstName: document.getElementById("firstName").value.trim(),
        lastName: document.getElementById("lastName").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        dateOfBirth: document.getElementById("dateOfBirth").value,
        password: document.getElementById("password").value,
        role: "PATIENT",
      };

      const requiredFields = [
        "firstName",
        "lastName",
        "email",
        "phone",
        "dateOfBirth",
        "password",
      ];
      const firstInvalid = requiredFields.find((field) => !payload[field]);
      if (firstInvalid) {
        const field = document.getElementById(firstInvalid);
        AppFeedback.showFieldError(
          field,
          "This field is required. Please provide it to continue.",
        );
        field?.focus();
        resetSubmitButton(submitBtn);
        return;
      }
      const emailField = document.getElementById("email");
      if (!emailField.checkValidity()) {
        AppFeedback.showFieldError(emailField, "Enter a valid email address.");
        emailField.focus();
        resetSubmitButton(submitBtn);
        return;
      }

      try {
        const { response, data: result } = await AppFeedback.request(
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

        if (response.ok && (result.success || result.data)) {
          // 🎯 Targets your exact visual modal notice text container element!
          showModalBanner(
            "✓ Registration successfully. Routing to login page.",
            "success",
          );

          // Clear text entries immediately
          registrationForm.reset();

          // ⏳ Let them see the validation indicator, then pull the modal view down smoothly
          // and hand them straight to sign in so they can book right away.
          setTimeout(() => {
            const registerModal = document.getElementById("register-modal");
            if (registerModal) {
              registerModal.classList.add("hidden");
            }

            const loginModal = document.getElementById("login-modal");
            if (loginModal) {
              loginModal.classList.remove("hidden");
              document.getElementById("login-email")?.focus();
            } else {
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
          console.warn("Patient registration rejected", {
            status: response.status,
            result,
          });
          showModalBanner(
            response.status === 403
              ? "Registration is not available for this clinic. Please contact the clinic directly."
              : "Please review the highlighted information and try again.",
            "error",
          );
          resetSubmitButton(submitBtn);
        }
      } catch (error) {
        console.error("Patient registration request failed", error);
        showModalBanner(
          AppFeedback.safeMessage(
            error,
            error.status ? { status: error.status } : null,
          ),
          "error",
        );
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
