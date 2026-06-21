document.addEventListener("DOMContentLoaded", () => {
  // Select the carousel wrapper section directly using its position
  const carouselSection =
    document.querySelector("section relative.w-full.h-screen") ||
    document.querySelector("section");
  const slides = document.querySelectorAll(".carousel-slide");
  const indicators = document.querySelectorAll(".indicator");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  let currentIndex = 0;
  const totalSlides = slides.length;
  let autoPlayTimer = null;
  const autoPlayInterval = 4000; // 4 seconds

  function updateCarousel(newIndex) {
    // Manage circular boundary loops
    if (newIndex >= totalSlides) currentIndex = 0;
    else if (newIndex < 0) currentIndex = totalSlides - 1;
    else currentIndex = newIndex;

    // Update Slide Classes seamlessly
    slides.forEach((slide, idx) => {
      if (idx === currentIndex) {
        // Make slide visible and bring to top layer
        slide.classList.remove("opacity-0", "z-0");
        slide.classList.add("opacity-100", "z-10");
      } else {
        // Hide slide and drop layer priority
        slide.classList.remove("opacity-100", "z-10");
        slide.classList.add("opacity-0", "z-0");
      }
    });

    // Sync indicator dots color styles
    indicators.forEach((dot, idx) => {
      if (idx === currentIndex) {
        dot.classList.remove("bg-zinc-600");
        dot.classList.add("bg-white");
      } else {
        dot.classList.remove("bg-white");
      }
    });
  }

  // Auto Play Execution Core Engine
  function startAutoPlay() {
    if (!autoPlayTimer) {
      autoPlayTimer = setInterval(() => {
        updateCarousel(currentIndex + 1);
      }, autoPlayInterval);
    }
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
  }

  // Interactive Control Click Bindings
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      stopAutoPlay();
      updateCarousel(currentIndex + 1);
      startAutoPlay();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      stopAutoPlay();
      updateCarousel(currentIndex - 1);
      startAutoPlay();
    });
  }

  indicators.forEach((indicator) => {
    indicator.addEventListener("click", (e) => {
      stopAutoPlay();
      const slideIndex = parseInt(e.target.getAttribute("data-slide"));
      updateCarousel(slideIndex);
      startAutoPlay();
    });
  });

  // Smart Hover Pause Framework
  if (carouselSection) {
    carouselSection.addEventListener("mouseenter", () => {
      stopAutoPlay();
    });
    carouselSection.addEventListener("mouseleave", () => {
      startAutoPlay();
    });
  }

  // Initialize layout stack display on run
  updateCarousel(0);
  startAutoPlay();
});
