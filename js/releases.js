// Keep each Tools card in sync with its GitHub repo's latest release: version, date,
// download links and sizes. The values written in index.html are the fallback when the
// GitHub API is unreachable (e.g. blocked networks) or rate-limited.
(() => {
  const CACHE_MS = 60 * 60 * 1000; // one API call per visitor per hour (GitHub allows 60/hour/IP)
  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;
  const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  async function latest(repo) {
    const key = `release:${repo}`;
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.r;
    } catch {}
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(res.status);
    const r = await res.json();
    const slim = { tag: r.tag_name, name: r.name, url: r.html_url, date: r.published_at,
      assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), r: slim })); } catch {}
    return slim;
  }

  for (const card of document.querySelectorAll("[data-github-release]")) {
    latest(card.dataset.githubRelease).then((r) => {
      const version = card.querySelector('[data-release="version"]');
      if (version) version.textContent = /^v/i.test(r.tag) ? r.tag : `v${r.tag}`;
      const when = card.querySelector('[data-release="date"]');
      if (when) when.textContent = ` · released ${date(r.date)}`;
      const notes = card.querySelector('[data-release="notes"]');
      if (notes) notes.href = r.url;
      // buttons say which asset they want by a word in its file name, e.g. data-asset="Setup"
      for (const btn of card.querySelectorAll("[data-asset]")) {
        const asset = r.assets.find((a) => a.name.toLowerCase().includes(btn.dataset.asset.toLowerCase()));
        if (!asset) continue;
        btn.href = asset.url;
        const size = btn.querySelector("span");
        if (size) size.textContent = mb(asset.size);
      }
    }).catch(() => { /* keep the fallback values from the HTML */ });
  }
})();
