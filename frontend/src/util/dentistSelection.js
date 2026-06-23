// dentistSelection.js

// 🚨 1. Define the missing backend base URL (adjust if your backend is hosted elsewhere)
const API_BASE_URL = "http://localhost:5000";

// 2. Fetch available operators directly from backend API
async function fetchAvailableDentists() {
  const dentistDropdown = document.getElementById("modal-dentist-dropdown");
  if (!dentistDropdown) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/staff?role=dentist`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok)
      throw new Error("Failed to populate operator registry lists.");

    const data = await response.json();
    const dentists =
      data.staff ||
      data.users ||
      data.data ||
      (Array.isArray(data) ? data : []);

    // Clear old hardcoded blueprint options while preserving the default fallback choice
    dentistDropdown.innerHTML = `<option value="">-- Choose Operator --</option>`;

    dentists.forEach((doc) => {
      const option = document.createElement("option");
      option.value = doc._id || doc.id;

      let rawName = "";

      // Robust Name Extraction Engine
      if (doc.fullName) rawName = doc.fullName;
      else if (doc.name) rawName = doc.name;
      else if (doc.firstName || doc.lastName) {
        rawName = `${doc.firstName || ""} ${doc.lastName || ""}`;
      } else if (doc.userId && typeof doc.userId === "object") {
        if (doc.userId.fullName) rawName = doc.userId.fullName;
        else
          rawName = `${doc.userId.firstName || ""} ${doc.userId.lastName || ""}`;
      } else if (doc.user && typeof doc.user === "object") {
        if (doc.user.fullName) rawName = doc.user.fullName;
        else rawName = `${doc.user.firstName || ""} ${doc.user.lastName || ""}`;
      }

      rawName = rawName.trim();

      if (!rawName) {
        rawName = "Unknown Operator";
      }

      option.textContent = rawName.startsWith("Dr.")
        ? rawName
        : `Dr. ${rawName}`;
      dentistDropdown.appendChild(option);
    });

    console.log(
      `📡 Successfully synced ${dentists.length} active clinical operators to dropdown allocation node.`,
    );
  } catch (err) {
    console.error("⚠️ Error rendering dynamic operator lists:", err);
  }
}

// 3. State Transition Pipeline Integration Methods with Operator Assignment Interception
function bindCardActions() {
  const assignModal = document.getElementById("dentist-assign-modal");
  const dentistDropdown = document.getElementById("modal-dentist-dropdown");
  const btnCancel = document.getElementById("btn-cancel-assign");
  const btnConfirm = document.getElementById("btn-confirm-assign");

  if (!assignModal) {
    console.error(
      "❌ ERROR: '#dentist-assign-modal' is missing from the DOM! Check your HTML placement.",
    );
  } else {
    console.log("✅ Modal successfully found and ready for delegated actions.");
    // Populate dropdown with dynamic live data right away
    fetchAvailableDentists();
  }

  window.activeTargetAppointmentId = window.activeTargetAppointmentId || null;

  const closeModal = () => {
    if (assignModal) assignModal.classList.add("hidden");
    if (dentistDropdown) dentistDropdown.value = "";
    window.activeTargetAppointmentId = null;
  };

  if (btnCancel) btnCancel.onclick = closeModal;

  // Global Event Delegation Gate catches updates flawlessly across Kanban redraws
  document.body.onclick = async (e) => {
    const button = e.target.closest(".action-btn");
    if (!button) return;

    const appointmentId = button.getAttribute("data-id");
    const actionType = button.getAttribute("data-action");

    console.log(
      `⚡ Delegated Click Captured -> Action: ${actionType}, ID: ${appointmentId}`,
    );

    if (actionType === "chair") {
      window.activeTargetAppointmentId = appointmentId;
      if (assignModal) assignModal.classList.remove("hidden");
      return;
    }

    if (actionType === "complete") {
      await executeStatusTransition(appointmentId, "completed");
    }
  };

  if (btnConfirm) {
    btnConfirm.onclick = async () => {
      const chosenDentistId = dentistDropdown?.value;
      if (!chosenDentistId) {
        alert("Please select an operator to handle this case matrix.");
        return;
      }

      if (!window.activeTargetAppointmentId) {
        alert(
          "Error: Loss of appointment tracking context signatures. Please close and re-seat.",
        );
        return;
      }

      btnConfirm.innerText = "Syncing...";
      btnConfirm.disabled = true;

      await executeStatusTransition(
        window.activeTargetAppointmentId,
        "in-treatment",
        chosenDentistId,
      );

      btnConfirm.innerText = "Confirm & Seat ➡️";
      btnConfirm.disabled = false;
      closeModal();
    };
  }
}

async function executeStatusTransition(
  appointmentId,
  nextStatus,
  assignedDentistId = null,
) {
  try {
    const payload = { status: nextStatus };
    if (assignedDentistId) {
      payload.dentistId = assignedDentistId;
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/appointments/${appointmentId}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok)
      throw new Error("Could not transform system data record status.");

    // Safely call fetchDailyQueue by ensuring it looks at the global window object
    if (typeof window.fetchDailyQueue === "function") {
      await window.fetchDailyQueue();
    } else if (typeof window.fetchDailyAppointments === "function") {
      await window.fetchDailyAppointments();
    }
  } catch (err) {
    alert(`Network Sync Error: ${err.message}`);
  }
}
async function processCheckout(appointmentId, totalAmount) {
  // 1. Grab the selected payment channel from your HTML snippet
  const paymentChannel = document.getElementById("modal-checkout-method").value;
  const token = localStorage.getItem("token");

  try {
    const response = await fetch(
      `http://localhost:5000/api/v1/appointments/${appointmentId}/checkout`,
      {
        method: "PATCH", // or POST, depending on your backend
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "paid", // or whatever your final status is
          paymentMethod: paymentChannel,
          amount: totalAmount,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Checkout failed.");
    }

    alert(`✅ Payment of ${totalAmount} via ${paymentChannel} successful!`);

    // Close the modal and refresh the dashboard queues here
    // closeModal();
    // fetchDailyQueue();
  } catch (err) {
    alert(`Billing Error: ${err.message}`);
  }
}
window.bindCardActions = bindCardActions;
window.fetchAvailableDentists = fetchAvailableDentists;
window.executeStatusTransition = executeStatusTransition;
