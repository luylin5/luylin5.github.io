// Keep each Tools card in sync with its GitHub repo's releases: latest version, date,
// download links and sizes, plus the total download count across all versions.
// The values written in index.html are the fallback when the GitHub API is unreachable
// (e.g. blocked networks) or rate-limited; the download count is then simply not shown.
(() => {
  const CACHE_MS = 60 * 60 * 1000; // one API call per visitor per hour (GitHub allows 60/hour/IP)
  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;
  const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  async function releases(repo) {
    const key = `releases.v2:${repo}`;
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.r;
    } catch {}
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(res.status);
    const slim = (await res.json()).filter((r) => !r.draft).map((r) => ({
      tag: r.tag_name, name: r.name, url: r.html_url, date: r.published_at, pre: r.prerelease,
      assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size, n: a.download_count })),
    }));
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), r: slim })); } catch {}
    return slim;
  }

  for (const card of document.querySelectorAll("[data-github-release]")) {
    releases(card.dataset.githubRelease).then((all) => {
      // newest full release (the API lists newest first)
      const r = all.find((x) => !x.pre);
      if (!r) return;
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
      // total downloads over every version; hover shows the per-version breakdown
      const count = card.querySelector('[data-release="downloads"]');
      if (count) {
        // label by tag, or by release name when the tag carries no version (e.g. "PXRD")
        const label = (x) => (/\d/.test(x.tag) ? x.tag : x.name || x.tag);
        const per = all.map((x) => [label(x), x.assets.reduce((s, a) => s + a.n, 0)]);
        const total = per.reduce((s, [, n]) => s + n, 0);
        count.textContent = `⬇ ${total.toLocaleString("en")} download${total === 1 ? "" : "s"}`;
        count.title = per.map(([tag, n]) => `${tag}: ${n.toLocaleString("en")}`).join("\n");
        count.hidden = false;
      }
    }).catch(() => { /* keep the fallback values from the HTML */ });
  }
})();
