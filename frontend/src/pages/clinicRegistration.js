// src/pages/clinicRegistration.js
document.addEventListener("DOMContentLoaded", () => {
  const registrationForm = document.getElementById("clinic-registration-form");
  const nameInput = document.getElementById("clinic-name");
  const slugInput = document.getElementById("clinic-slug");
  const slugPreview = document.getElementById("slug-preview");
  const notificationBox = document.getElementById("notification-box");

  // Helper: Enforce lowercase and trim logic matching the Mongoose schema requirements
  const formatSlug = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Strip out special characters
      .replace(/[\s_-]+/g, "-") // Turn spaces/underscores into clean dashes
      .replace(/^-+|-+$/g, ""); // Clean dangling edge dashes
  };

  // Auto-generate safe slug while the user types the name
  nameInput.addEventListener("input", (e) => {
    if (!slugInput.dataset.edited) {
      const cleanSlug = formatSlug(e.target.value);
      slugInput.value = cleanSlug;
      slugPreview.textContent = cleanSlug || "...";
    }
  });

  // Handle manual slug edits
  slugInput.addEventListener("input", (e) => {
    slugInput.dataset.edited = "true";
    e.target.value = formatSlug(e.target.value);
    slugPreview.textContent = e.target.value || "...";
  });

  // Form Submission
  registrationForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset notification box visibility and colors
    notificationBox.className = "hidden text-xs p-3.5 rounded-lg font-medium";
    notificationBox.textContent = "";

    // 1. Build the composite payload matching your multi-tenant controllers (dateOfBirth removed)
    const payload = {
      clinicName: nameInput.value.trim(),
      slug: slugInput.value.trim(),
      adminData: {
        firstName: document.getElementById("admin-firstname").value.trim(),
        lastName: document.getElementById("admin-lastname").value.trim(),
        email: document.getElementById("admin-email").value.trim(),
        phone: document.getElementById("admin-phone").value.trim(),
        password: document.getElementById("admin-password").value,
      },
    };

    try {
      // 2. Dispatch data payload to backend endpoint
      const response = await fetch(
        "http://localhost:5000/api/v1/tenants/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      // 3. Evaluate server validation state response
      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Failed to provision workspace partition.",
        );
      }

      // 4. Render Success feedback status UI
      notificationBox.className =
        "block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3.5 rounded-lg font-medium";
      notificationBox.textContent = `Success! Workspace and Administrator account provisioned. Redirecting to staff login...`;

      // 5. 🎯 Smoothly forward to the staff login gate after a short interval delay
      setTimeout(() => {
        window.location.href = "/clinicLogin.html";
      }, 2000);
    } catch (error) {
      console.error("Workspace Provisioning Crash:", error);
      // Render Error UI alert
      notificationBox.className =
        "block bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3.5 rounded-lg font-medium";
      notificationBox.textContent = error.message;
    }
  });
});
