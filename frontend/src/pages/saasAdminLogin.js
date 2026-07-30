document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("saas-admin-login-form");
  const errorBox = document.getElementById("error-box");
  const submitBtn = document.getElementById("submit-btn");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset error box state
    errorBox.classList.add("hidden");
    errorBox.innerText = "";

    const email = document.getElementById("saas-admin-email").value.trim();
    const password = document
      .getElementById("saas-admin-password")
      .value.trim();

    submitBtn.disabled = true;
    submitBtn.innerText = "Authenticating Root Credentials...";

    try {
      const response = await fetch(
        "http://localhost:5000/api/v1/saas-admin/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "SaaS Admin authentication failed.");
      }

      // Store JWT token and platform admin identity
      localStorage.setItem("saasAdminToken", result.token);
      localStorage.setItem("saasAdminUser", JSON.stringify(result.user));

      // Redirect directly to the Master SaaS Admin Dashboard
      window.location.href = "/saasAdminDashboard.html";
    } catch (error) {
      console.error("🔥 SaaS Admin Authentication Fault:", error);
      errorBox.innerText = error.message;
      errorBox.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Authenticate Session";
    }
  });
});
