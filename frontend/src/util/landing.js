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

  const reveal = (el) => el.classList.add("visible");
  const revealAll = () => revealEls.forEach(reveal);

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
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    revealEls.forEach((el) => observer.observe(el));

    // -------------------------------------------------------------------
    // Reliability guards for reveal-gated CTAs (e.g. "Register your clinic")
    //
    // publicClinics.js injects a tall, variable-height clinic grid ABOVE
    // several reveal wrappers *after* this observer takes its first
    // measurements. That late layout shift — together with the browser's
    // scroll restoration on reload — can otherwise leave a CTA stranded at
    // opacity:0 until the next reload. These guards guarantee visibility
    // regardless of async timing.
    // -------------------------------------------------------------------

    // Reveal anything already within the viewport right now. Uses a plain
    // rect check so it is immune to the observer's intersection-ratio
    // threshold (which a very tall element can never reach on small screens).
    const revealInView = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      revealEls.forEach((el) => {
        if (el.classList.contains("visible")) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < vh && rect.bottom > 0) {
          reveal(el);
          observer.unobserve(el);
        }
      });
    };

    // Re-check once the clinic directory has injected its grid (layout is
    // now settled) and again after the window fully loads.
    document.addEventListener("clinics:loaded", revealInView);
    window.addEventListener("load", revealInView);

    // Absolute safety net: never leave content hidden. If the observer's
    // timing was thrown off, force everything visible after a short delay.
    window.setTimeout(revealAll, 4000);
  } else {
    // Reduced motion, no observer support, or ?reveal=all: show everything.
    revealAll();
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