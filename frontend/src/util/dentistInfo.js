document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("staff-role");
  const dentistFields = document.getElementById("dentist-fields-container");
  const licenseInput = document.getElementById("reg-license");

  if (roleSelect && dentistFields) {
    roleSelect.addEventListener("change", (e) => {
      if (e.target.value === "Dentist") {
        dentistFields.classList.remove("hidden");
        licenseInput.setAttribute("required", "true");
      } else {
        dentistFields.classList.add("hidden");
        licenseInput.removeAttribute("required");
      }
    });
  }
});
