// /src/util/landing.js
// Landing page interactions: mobile menu, scroll-reveal, and header shadow.
// All motion is disabled automatically when the user prefers reduced motion.

document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------------------
  // Mobile navigation
  // ---------------------------------------------------------------------
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation menu" : "Open navigation menu",
      );
    });

    // Close the menu after tapping any link inside it.
    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
      });
    });

    // Close on Escape.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Scroll-reveal (IntersectionObserver, reduced-motion safe)
  // ---------------------------------------------------------------------
  const revealEls = document.querySelectorAll(".reveal");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // QA/testing hook: ?reveal=all renders everything visible immediately
  // (used for full-page screenshots and content verification).
  const forceRevealAll = new URLSearchParams(window.location.search).get(
    "reveal",
  ) === "all";

  if (
    revealEls.length &&
    "IntersectionObserver" in window &&
    !prefersReducedMotion &&
    !forceRevealAll
  ) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    // Reduced motion or no observer support: show everything immediately.
    revealEls.forEach((el) => el.classList.add("visible"));
  }

  // ---------------------------------------------------------------------
  // Header shadow on scroll
  // ---------------------------------------------------------------------
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
});