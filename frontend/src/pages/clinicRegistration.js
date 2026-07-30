// src/pages/clinicRegistration.js
document.addEventListener("DOMContentLoaded", () => {
  const registrationForm = document.getElementById("clinic-registration-form");
  const nameInput = document.getElementById("clinic-name");
  const slugInput = document.getElementById("clinic-slug");
  const notificationBox = document.getElementById("notification-box");

  if (!registrationForm) return;

  // 1. Helper: Format clean slug string
  const formatSlug = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/[\s_-]+/g, "-") // Convert spaces to hyphens
      .replace(/^-+|-+$/g, ""); // Trim edge hyphens
  };

  // Live auto-generate slug as user types clinic name
  if (nameInput && slugInput) {
    nameInput.addEventListener("input", (e) => {
      if (!slugInput.dataset.edited) {
        slugInput.value = formatSlug(e.target.value);
      }
    });

    slugInput.addEventListener("input", (e) => {
      slugInput.dataset.edited = "true";
      e.target.value = formatSlug(e.target.value);
    });
  }

  // 2. Form Submission Handler (Single, unified handler)
  registrationForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset notification state
    notificationBox.className =
      "hidden text-xs p-3.5 rounded-xl font-bold border text-center";
    notificationBox.innerText = "";

    const submitBtn = registrationForm.querySelector("button[type='submit']");
    const fileInput = document.getElementById("clinic-documents");

    submitBtn.disabled = true;
    submitBtn.innerText = "Deploying Workspace...";

    // Construct Payload
    const payload = {
      clinicName: nameInput.value.trim(),
      slug: slugInput.value.trim(),
      adminData: {
        firstName: document.getElementById("admin-firstname").value.trim(),
        lastName: document.getElementById("admin-lastname").value.trim(),
        email: document.getElementById("admin-email").value.trim(),
        phone: document.getElementById("admin-phone").value.trim(),
        password: document.getElementById("admin-password").value.trim(),
      },
    };

    try {
      // STEP 1: Register Tenant Clinic Workspace
      const registerResponse = await fetch(
        "http://localhost:5000/api/v1/tenants/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const registerResult = await registerResponse.json();

      if (!registerResponse.ok || !registerResult.success) {
        throw new Error(
          registerResult.message || "Failed to deploy clinic workspace.",
        );
      }

      // Safely extract Clinic ID regardless of backend payload structure
      const createdClinicId =
        registerResult.data?._id ||
        registerResult.data?.clinic?._id ||
        registerResult.data?.id;

      if (!createdClinicId) {
        throw new Error(
          "Workspace registered, but target Clinic ID could not be resolved.",
        );
      }

      // STEP 2: Upload Documents (If any files were attached)
      if (fileInput && fileInput.files.length > 0) {
        submitBtn.innerText = "Uploading Verification Credentials...";

        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append("documents", fileInput.files[i]);
        }

        const uploadResponse = await fetch(
          `http://localhost:5000/api/v1/tenants/${createdClinicId}/upload-docs`,
          {
            method: "POST",
            body: formData, // Browser automatically sets multipart/form-data headers
          },
        );

        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadResult.success) {
          throw new Error(
            uploadResult.message ||
              "Workspace created, but document upload failed.",
          );
        }
      }

      // Render Success Message
      notificationBox.className =
        "block bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3.5 rounded-xl font-bold text-center";
      notificationBox.innerText =
        "✨ Clinic registered successfully! Verification documents uploaded and pending SaaS review.";

      registrationForm.reset();
      if (slugInput) delete slugInput.dataset.edited;

      // Close modal after 3 seconds
      setTimeout(() => {
        const modal = document.getElementById("clinic-register-modal");
        if (modal) modal.classList.add("hidden");
        document.body.classList.remove("overflow-hidden");
      }, 3000);
    } catch (error) {
      console.error("❌ Registration Error:", error);
      notificationBox.className =
        "block bg-rose-50 border border-rose-200 text-rose-600 text-xs p-3.5 rounded-xl font-bold text-center";
      notificationBox.innerText =
        error.message || "An error occurred during registration.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Register clinic";
    }
  });
});
