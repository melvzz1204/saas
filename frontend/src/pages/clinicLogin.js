// /src/pages/clinicLogin.js

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("business-login-form");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const errorBox = document.getElementById("error-box");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Clear background visibility flags and error texts before validation processing
    errorBox.classList.add("hidden");
    errorBox.className =
      "hidden text-xs p-3.5 rounded-lg font-medium bg-rose-500/10 border border-rose-500/20 text-rose-400";
    errorBox.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      // 📡 Dispatches payload directly to the remap route handling unified user collections
      const response = await fetch("http://localhost:5000/api/v1/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      // Catch early server validation exceptions (like a 401 Unauthenticated status code)
      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Invalid credential validation response from server.",
        );
      }

      // Safe Extraction: Pulling elements directly from top level JSON dictionary structure
      const user = result.user;
      const token = result.token;

      if (!user || !token) {
        throw new Error(
          "Malformatted profile identity metadata structure received.",
        );
      }

      // 🛡️ ROLE VALIDATION GATE: Confirm incoming record meets authorization roles
      const authorizedRoles = [
        "SUPER_ADMIN",
        "CLINIC_ADMIN",
        "CLINIC_STAFF",
        "DENTIST",
      ];
      if (!authorizedRoles.includes(user.role)) {
        throw new Error(
          "Access Denied: Patient credentials must authenticate using the client dashboard terminal.",
        );
      }

      // 💾 Cache verification credentials into persistent browser application storage memory
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      // Swap standard warning styling alerts to clean workspace confirmation templates
      errorBox.className =
        "block text-xs p-3.5 rounded-lg font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-400";
      errorBox.textContent =
        "✓ Session initialized successfully. Routing to administrative control platform...";
      errorBox.classList.remove("hidden");

      // 🚀 Perform seamless client routing redirect to administration app deck panel after 1.2s delay
      setTimeout(() => {
        window.location.href = "adminClinicDashboard.html";
      }, 1200);
    } catch (err) {
      // Catch exceptions and inject clear warnings back into the HTML message component panel
      errorBox.className =
        "block text-xs p-3.5 rounded-lg font-medium bg-rose-500/10 border border-rose-500/20 text-rose-400";
      errorBox.textContent = `❌ Authentication Failed: ${err.message}`;
      errorBox.classList.remove("hidden");
    }
  });
});
