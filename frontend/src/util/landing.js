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
    const setOpen = (isOpen) => {
      menu.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation menu" : "Open navigation menu",
      );
    };

    toggle.addEventListener("click", () => {
      setOpen(!menu.classList.contains("open"));
    });

    // Close the menu after tapping any link or button inside it.
    menu.querySelectorAll("a, button").forEach((el) => {
      el.addEventListener("click", () => setOpen(false));
    });

    // Close on Escape.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close when resizing up to desktop nav or tapping outside.
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024 && menu.classList.contains("open")) {
        setOpen(false);
      }
    });
    document.addEventListener("click", (e) => {
      if (
        menu.classList.contains("open") &&
        !menu.contains(e.target) &&
        !toggle.contains(e.target)
      ) {
        setOpen(false);
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