async function registerPatient(event) {
  event.preventDefault(); // Stop form from reloading the page

  // 1. Gather fields from your input elements
  const userData = {
    firstName: document.getElementById("firstName").value,
    lastName: document.getElementById("lastName").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    dateOfBirth: document.getElementById("dateOfBirth").value,
    password: document.getElementById("password").value,
    role: "PATIENT",
  };

  // 2. Multi-tenant SaaS Configuration
  const clinicId = "YOUR_MONGODB_CLINIC_ID_STRING";

  try {
    const response = await fetch(
      "http://localhost:5000/api/v1/patients/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": clinicId,
        },
        body: JSON.stringify(userData),
      },
    );

    const result = await response.json();

    if (response.ok) {
      console.log("Registration successful:", result.data);
      alert("Registration successful!");
    } else {
      console.error("Registration failed:", result.message);
      alert(`Error: ${result.message}`);
    }
  } catch (error) {
    console.error("Network error:", error);
  }
}
