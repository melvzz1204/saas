// /src/pages/landingTestimonials.js
// Loads featured, approved patient testimonials for the SaaS landing page.
// Falls back to the labeled sample cards already in the HTML when the API
// returns nothing (or the request fails), so the section never looks broken.

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.getElementById("saas-testimonials-grid");
    const meta = document.getElementById("saas-testimonials-meta");
    const status = document.getElementById("saas-testimonials-status");
    const fallbackNote = document.getElementById(
      "saas-testimonials-fallback-note",
    );
    if (!grid) return;

    const apiBaseUrl = window.location.origin.includes("localhost")
      ? "http://localhost:5000"
      : window.location.origin;

    const escapeHtml = (value) =>
      String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]);

    const announce = (message) => {
      if (status) status.textContent = message;
      AppFeedback?.announce?.(message);
    };

    const createStars = (rating) => {
      const count = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)));
      const solid = "★".repeat(count);
      const hollow = "☆".repeat(5 - count);
      return `<p class="stars" aria-label="${count} out of 5 stars">${solid}${hollow}</p>`;
    };

    const patientLabel = (testimonial) => {
      if (testimonial.anonymous === true) return "Anonymous patient";
      const first = String(testimonial.patientFirstName || "").trim();
      const initial = String(
        testimonial.patientLastNameInitial || "",
      ).trim();
      if (first) return initial ? `${first} ${initial}.` : first;
      return "Verified patient";
    };

    const initials = (testimonial) => {
      if (testimonial.anonymous === true) return "★";
      const first = String(testimonial.patientFirstName || "P")
        .trim()
        .charAt(0)
        .toUpperCase();
      const initial = String(
        testimonial.patientLastNameInitial || "",
      ).trim();
      return initial ? `${first}${initial}` : first;
    };

    const clinicLink = (testimonial) => {
      const name = escapeHtml(
        testimonial.clinicName || "Clinic on Novaclinic",
      );
      const slug = escapeHtml(testimonial.clinicSlug || "");
      if (!slug) return `<span>${name}</span>`;
      return `<a href="/clinicHomePage.html?clinic=${slug}">${name} →</a>`;
    };

    const render = (testimonials, total) => {
      grid.innerHTML = testimonials
        .map(
          (testimonial) => `
            <article class="testimonial">
              ${createStars(testimonial.rating)}
              <blockquote>“${escapeHtml(testimonial.reviewText)}”</blockquote>
              <div class="testimonial-meta">
                <span class="avatar" aria-hidden="true">${escapeHtml(initials(testimonial))}</span>
                <div>
                  <strong>
                    ${escapeHtml(patientLabel(testimonial))}
                    ${
                      testimonial.verified === true
                        ? '<span class="badge badge-emerald" style="margin-left: var(--sp-2); font-size: 0.65rem;">✓ Verified</span>'
                        : ""
                    }
                  </strong>
                  <span>${clinicLink(testimonial)}</span>
                </div>
              </div>
            </article>`,
        )
        .join("");

      if (meta) {
        meta.textContent =
          total > 0
            ? `${total} approved ${total === 1 ? "review" : "reviews"}`
            : "Live";
      }
      fallbackNote?.classList.add("hidden");
      announce(
        `${testimonials.length} approved ${
          testimonials.length === 1 ? "review" : "reviews"
        } loaded`,
      );
    };

    const showFallback = () => {
      // Sample cards in the HTML stay visible; surface an honest note.
      fallbackNote?.classList.remove("hidden");
      if (meta) meta.textContent = "Sample feedback";
      announce("No published reviews yet — showing sample feedback");
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/clinics/featured`, {
        headers: { Accept: "application/json" },
      });
      const result = await response.json();

      const testimonials = result?.data?.testimonials || [];
      const total = Number(result?.data?.total || testimonials.length);

      if (!Array.isArray(testimonials) || testimonials.length === 0) {
        showFallback();
        return;
      }

      render(testimonials, total);
    } catch (error) {
      console.warn("Featured testimonials request failed:", error.message);
      showFallback();
    }
  });
})();