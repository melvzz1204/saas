

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("saas-admin-login-form");
  const errorBox = document.getElementById("error-box");
  const submitBtn = document.getElementById("submit-btn");
  const emailInput = document.getElementById("saas-admin-email");
  const passwordInput = document.getElementById("saas-admin-password");

  if (!loginForm) return;

  const showError = (message) => {
    errorBox.innerText = message;
    errorBox.classList.remove("hidden");
    errorBox.setAttribute("role", "alert");
    window.AppFeedback?.announce(message, "assertive");
  };

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    errorBox.innerText = "";
    AppFeedback?.clearFieldError(emailInput);
    AppFeedback?.clearFieldError(passwordInput);

    if (!emailInput.value.trim()) {
      AppFeedback?.showFieldError(
        emailInput,
        "Enter your administrator email.",
      );
      emailInput.focus();
      return;
    }
    if (!emailInput.validity.valid) {
      AppFeedback?.showFieldError(
        emailInput,
        "Enter a valid administrator email.",
      );
      emailInput.focus();
      return;
    }
    if (!passwordInput.value) {
      AppFeedback?.showFieldError(
        passwordInput,
        "Enter your administrator password.",
      );
      passwordInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.innerText = "Signing in…";

    try {
      const { data: result } = await AppFeedback.request(
        window.apiUrl("/api/v1/saas-admin/login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailInput.value.trim(),
            password: passwordInput.value,
          }),
        },
      );

      if (!result?.success || !result.token)
        throw Object.assign(new Error("Authentication failed"), {
          status: 401,
        });
      localStorage.setItem("saasAdminToken", result.token);
      localStorage.setItem("saasAdminUser", JSON.stringify(result.user));
      window.location.href = "/saasAdminDashboard.html";
    } catch (error) {
      console.error("SaaS admin authentication request failed", error);
      showError(
        AppFeedback?.safeMessage(error) ||
          "We couldn't sign you in right now. Please try again.",
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
      submitBtn.innerText = "Authenticate Session";
    }
  });
});
