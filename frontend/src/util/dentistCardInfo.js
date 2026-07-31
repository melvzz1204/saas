async function loadDentistProfiles() {
  const container = document.getElementById("dentist-cards-container");
  if (!container) return;

  try {
    const clinicId = localStorage.getItem("clinicId");

    // 🛑 Update this URL to match your specific patient-facing route for fetching dentists
    const response = await fetch(
      `http://localhost:5000/api/v1/staff/public/dentists?clinicId=${clinicId}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      },
    );

    if (!response.ok) throw new Error("Failed to load dentist profiles");

    const data = await response.json();
    const dentists = data.dentists || data.data || [];

    if (dentists.length === 0) {
      container.innerHTML = `<p class="col-span-full text-center text-gray-500 italic">No specialists available at the moment.</p>`;
      return;
    }

    container.innerHTML = dentists
      .map((dentist) => {
        const imageUrl =
          dentist.profileImage && dentist.profileImage !== "default-avatar.png"
            ? `http://localhost:5000/uploads/${dentist.profileImage.replace(/^public[\\/]/, "").replace(/^uploads[\\/]/, "")}`
            : `http://localhost:5000/uploads/default-avatar.png`;

        return `

        <div class="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 flex flex-col h-full group">

          <!-- Compact Avatar -->
          <div class="relative w-16 h-16 mx-auto mb-3">
            <img
              src="${imageUrl}"
              alt="Dr. ${dentist.fullName}"
              class="w-full h-full rounded-full object-cover border border-gray-100 group-hover:border-blue-200 transition-colors duration-300"
              onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(dentist.fullName)}&background=random'"
            />
          </div>

          <!-- Minimalist Header Info -->
          <h3 class="text-base text-gray-800 font-semibold mb-0.5 tracking-tight text-center">Dr. ${dentist.fullName}</h3>
          <p class="text-[11px] text-blue-500 font-medium uppercase tracking-widest mb-3 text-center">${dentist.specialization}</p>

          <!-- Tighter Bio (2 lines max) -->
          <p class="text-xs text-gray-500 leading-relaxed mb-4 line-clamp-2 flex-grow text-center">
            "${dentist.bio || "Dedicated to providing exceptional dental care and creating beautiful smiles."}"
          </p>

          <!-- Compact Footer Stats -->
          <div class="flex justify-between items-center border-t border-gray-50 pt-3 mt-auto px-2">
            <div class="text-center w-1/2 border-r border-gray-50">
              <span class="block font-semibold text-gray-700 text-sm">${dentist.experienceYears || 0}+</span>
              <span class="block text-[10px] uppercase text-gray-400 tracking-wider">Years</span>
            </div>
            <div class="text-center w-1/2">
              <span class="block font-semibold text-gray-700 text-sm">#${dentist.licenseNumber ? dentist.licenseNumber.slice(-4) : "N/A"}</span>
              <span class="block text-[10px] uppercase text-gray-400 tracking-wider">License</span>
            </div>
          </div>

        </div>
      `;
      })
      .join("");
  } catch (error) {
    console.error("Error fetching dentists:", error);
    container.innerHTML = `<p class="col-span-full text-center text-red-500">Could not load profiles at this time.</p>`;
  }
}

// Ensure this runs when the dashboard loads
document.addEventListener("DOMContentLoaded", () => {
  loadDentistProfiles();
});
