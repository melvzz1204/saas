document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("public-clinics-container");
  const count = document.getElementById("clinic-network-count");
  if (!container) return;

  const apiBaseUrl = window.ApiBase;

  const escapeHtml = (value) =>
    String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);

  const renderClinic = (clinic) => {
    const name = escapeHtml(clinic.name);
    const slug = encodeURIComponent(clinic.slug || "");
    const initials = escapeHtml(
      (clinic.name || "NC")
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase(),
    );

    return `<article class="clinic-card">
      <div class="clinic-card-head">
        <span class="avatar" aria-hidden="true">${initials || "NC"}</span>
        <span class="badge badge-emerald"><span aria-hidden="true">✓</span> Verified clinic</span>
      </div>
      <h3>${name}</h3>
      <p class="clinic-slug">novaclinic/${slug}</p>
      <div class="clinic-card-foot">
        <span>Approved practice</span>
        <a href="/clinicHomePage.html?clinic=${slug}">Visit clinic →</a>
      </div>
    </article>`;
  };

  const showLoading = () => {
    container.innerHTML = `<div class="clinic-card" style="grid-column: 1 / -1; align-items: center; justify-content: center; text-align: center; padding-block: var(--sp-10);">
      <p style="color: var(--text-3); font-size: var(--fs-sm);" role="status">Loading registered clinics…</p>
    </div>`;
  };

  const loadClinics = async () => {
    showLoading();
    try {
      const { data: result } = await AppFeedback.request(
        `${apiBaseUrl}/api/v1/tenants/public`,
      );
      if (!result?.success) throw new Error("Directory unavailable");
      const clinics = result.data || [];

      const label = `${clinics.length} active ${clinics.length === 1 ? "clinic" : "clinics"}`;
      count.textContent = label;
      const heroCount = document.getElementById("hero-clinic-count");
      if (heroCount) heroCount.textContent = `${clinics.length}+`;

      container.innerHTML = clinics.length
        ? clinics.map(renderClinic).join("")
        : `<div class="clinic-card" style="grid-column: 1 / -1; align-items: center; justify-content: center; text-align: center; padding-block: var(--sp-10);">
            <p style="color: var(--text-2); font-size: var(--fs-sm);">No verified clinics are available yet.</p>
            <p style="color: var(--text-3); font-size: var(--fs-xs); margin-top: var(--sp-2);">Please check back soon.</p>
          </div>`;
    } catch (error) {
      console.error("Public clinic directory request failed", error);
      count.textContent = "Clinics unavailable";
      container.innerHTML = `<div class="clinic-card" style="grid-column: 1 / -1; align-items: center; justify-content: center; text-align: center; padding-block: var(--sp-10);">
        <p style="color: var(--text-2); font-size: var(--fs-sm);">We couldn't load clinics right now.</p>
        <button type="button" id="retry-clinics" class="btn btn-primary" style="margin-top: var(--sp-4);">Try again</button>
      </div>`;
      document.getElementById("retry-clinics")?.addEventListener("click", loadClinics);
      AppFeedback.announce(
        AppFeedback.safeMessage(
          error,
          error.status ? { status: error.status } : null,
        ),
        "error",
      );
    }
  };

  loadClinics();
});