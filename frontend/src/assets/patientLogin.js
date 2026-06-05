async function loginPatient(event) {
  event.preventDefault();

  const credentials = {
    email: document.getElementById("loginEmail").value,
    password: document.getElementById("loginPassword").value,
  };

  const clinicId = "YOUR_MONGODB_CLINIC_ID_STRING";

  try {
    const response = await fetch(
      "http://localhost:5000/api/v1/patients/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-ID": clinicId,
        },
        body: JSON.stringify(credentials),
      },
    );

    const result = await response.json();

    if (response.ok) {
      console.log("Login successful:", result.data);

      // Save token and user info to browser storage
      localStorage.setItem("token", result.data.token);
      localStorage.setItem("user", JSON.stringify(result.data.patient));

      alert("Login successful! Redirecting...");
      // window.location.href = '/dashboard.html'; // Redirect to dashboard
    } else {
      alert(`Login failed: ${result.message}`);
    }
  } catch (error) {
    console.error("Network error:", error);
  }
}
