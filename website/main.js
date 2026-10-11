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

/** Point Linux buttons at the newest release that ships a .deb / Flatpak. */
const downloadLinuxDeb = document.getElementById("download-linux-deb");
const downloadLinuxFlatpak = document.getElementById("download-linux-flatpak");
const downloadMetaLinux = document.getElementById("download-meta-linux");
if (downloadLinuxDeb || downloadLinuxFlatpak) {
  fetch("https://api.github.com/repos/azevedomedia0/CloudBreak-Files/releases?per_page=20")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((releases) => {
      const linux = (releases || []).find((rel) =>
        (rel.assets || []).some((a) => /\.deb$/i.test(a.name)),
      );
      if (!linux) return;
      const deb = (linux.assets || []).find((a) => /\.deb$/i.test(a.name));
      const flatpak = (linux.assets || []).find((a) => /\.flatpak$/i.test(a.name));
      if (deb?.browser_download_url && downloadLinuxDeb) {
        downloadLinuxDeb.href = deb.browser_download_url;
        downloadLinuxDeb.setAttribute("download", deb.name);
      }
      if (flatpak?.browser_download_url && downloadLinuxFlatpak) {
        downloadLinuxFlatpak.href = flatpak.browser_download_url;
        downloadLinuxFlatpak.setAttribute("download", flatpak.name);
      }
      if (downloadMetaLinux) {
        const ver = String(linux.tag_name || linux.name || "").replace(/^v/, "");
        downloadMetaLinux.hidden = false;
        downloadMetaLinux.textContent = ver
          ? `Linux: v${ver} · .deb (amd64) and Flatpak bundle`
          : "Latest Linux .deb and Flatpak";
      }
    })
    .catch(() => {
      /* Keep the hardcoded release URLs on the anchors. */
    });
}
