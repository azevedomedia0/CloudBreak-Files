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

/** Point Download for Mac at the latest universal DMG on GitHub Releases. */
const downloadMac = document.getElementById("download-mac");
const downloadMeta = document.getElementById("download-meta");
if (downloadMac) {
  fetch("https://api.github.com/repos/azevedomedia0/CloudBreak-Files/releases/latest")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((rel) => {
      const dmg = (rel.assets || []).find((a) => /\.dmg$/i.test(a.name));
      if (!dmg?.browser_download_url) return;
      downloadMac.href = dmg.browser_download_url;
      downloadMac.setAttribute("download", dmg.name);
      if (downloadMeta) {
        const ver = String(rel.tag_name || rel.name || "").replace(/^v/, "");
        downloadMeta.hidden = false;
        downloadMeta.textContent = ver
          ? `Latest: v${ver} · universal macOS (Apple Silicon + Intel (MacOS Big Sur or Later))`
          : "Latest notarized macOS build";
      }
    })
    .catch(() => {
      /* Keep the Releases page fallback on the anchor. */
    });
}
