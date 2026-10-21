import "./style.css";

function setupEditorialMotion(): void {
  if (
    !("IntersectionObserver" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) return;

  const sections = document.querySelectorAll<HTMLElement>(
    ".step, .invariant, .section-topline, .proof-main, .developer-grid"
  );
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      element.classList.remove("will-reveal");
      element.classList.add("is-revealed");
      observer.unobserve(element);
    }
  }, { threshold: 0.07, rootMargin: "0px 0px -5% 0px" });

  for (const section of sections) {
    section.classList.add("will-reveal");
    observer.observe(section);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupEditorialMotion();
});

if (document.readyState === "complete" || document.readyState === "interactive") {
  setupEditorialMotion();
}
