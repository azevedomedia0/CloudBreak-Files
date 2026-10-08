const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

const nav = document.querySelector(".nav-pill");
const onScroll = () => {
  if (!nav) return;
  nav.classList.toggle("is-compact", window.scrollY > 24);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const observeTargets = document.querySelectorAll(".features, .flow, .stories, .faq, .vault, .download");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-inview");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18 },
  );
  observeTargets.forEach((el) => io.observe(el));
} else {
  observeTargets.forEach((el) => el.classList.add("is-inview"));
}
