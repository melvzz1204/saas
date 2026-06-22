/**
 * Dentist Clinical Workspace Controller
 * Location Path: /dentistDashboard.js
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Core State Verification Layer
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("userRole");

  const staffName = localStorage.getItem("staffName");
  const clinicName = localStorage.getItem("clinicName");

  // Guard Clause: If unauthenticated, bounce intruder back to login portal
  if (!token || userRole !== "dentist") {
    console.warn(
      "Unauthorized terminal entry vector. Redirecting to security gate...",
    );
    localStorage.clear();
    window.location.href = "/staffLogin.html"; // Adjust to your exact login file name if different
    return;
  }

  // 2. Dynamic Interface Population Matrix
  initDynamicBranding(staffName, clinicName);

  // Optional: Kick off session timers or data polling pipelines here
  startSessionClock();
});

/**
 * Hydrates UI elements safely with active local metadata
 */
function initDynamicBranding(doctorName, clinicTitle) {
  // Target Header Clinic Text Node
  const clinicTextElement = document.querySelector("h1.text-sm.font-black");
  // Target Header Doctor Badge Node (The text node inside the pill containing the pulse element)
  const doctorBadgeElement = document.querySelector(".text-\\[11px\\]");

  // Dynamic Injection 1: Clinic Text Setup
  if (clinicTextElement && clinicTitle) {
    clinicTextElement.textContent = clinicTitle.trim();
  }

  // Dynamic Injection 2: Doctor Badge Setup
  if (doctorBadgeElement && doctorName) {
    // Preserves the glowing green visual indicator bubble while overwriting text strings cleanly
    const pulseIndicator = doctorBadgeElement.querySelector(".animate-pulse");

    doctorBadgeElement.innerHTML = ""; // Wipe hardcoded string
    if (pulseIndicator) {
      doctorBadgeElement.appendChild(pulseIndicator); // Put the green pulse back
    }

    // Add the authenticated doctor's custom name string
    const textNode = document.createTextNode(` Dr. ${doctorName}`);
    doctorBadgeElement.appendChild(textNode);
  }
}

/**
 * Functional Mockup of your active operational session clock ticking upward
 */
function startSessionClock() {
  const timerDisplay = document.getElementById("session-timer");
  if (!timerDisplay) return;

  let totalSeconds = 1455; // Initial hardcoded representation: 24 minutes, 15 seconds

  setInterval(() => {
    totalSeconds++;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    // Formats tracking metrics with strict double zero padding layouts
    timerDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, 1000);
}
