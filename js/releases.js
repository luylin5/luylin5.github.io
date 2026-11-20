// Keep each Tools card in sync with its GitHub repo's releases: latest version, date,
// download links and sizes, plus the total download count across all versions.
// The values written in index.html are the fallback when the GitHub API is unreachable
// (e.g. blocked networks) or rate-limited; the download count is then simply not shown.
(() => {
  const CACHE_MS = 60 * 60 * 1000; // one API call per visitor per hour (GitHub allows 60/hour/IP)
  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;
  const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // the value under key in localStorage while younger than CACHE_MS, else load() again
  async function cached(key, load) {
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.r;
    } catch {}
    const r = await load();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), r })); } catch {}
    return r;
  }

  function releases(repo) {
    return cached(`releases.v2:${repo}`, async () => {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(res.status);
      return (await res.json()).filter((r) => !r.draft).map((r) => ({
        tag: r.tag_name, name: r.name, url: r.html_url, date: r.published_at, pre: r.prerelease,
        assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size, n: a.download_count })),
      }));
    });
  }

  for (const card of document.querySelectorAll("[data-github-release]")) {
    releases(card.dataset.githubRelease).then((all) => {
      // newest first by publish date: the API orders by the tag's commit date, which ties when
      // every tag points at the same commit (as in Crystery-release), leaving the order arbitrary
      all.sort((a, b) => b.date.localeCompare(a.date));
      const r = all.find((x) => !x.pre);
      if (!r) return;
      const version = card.querySelector('[data-release="version"]');
      // tags may carry a product prefix, e.g. "Crystery-0.1.0" → v0.1.0
      const ver = (r.tag.match(/\d+(\.\d+)+/) || [r.tag.replace(/^v/i, "")])[0];
      if (version) version.textContent = `v${ver}`;
      const when = card.querySelector('[data-release="date"]');
      if (when) when.textContent = ` · released ${date(r.date)}`;
      const notes = card.querySelector('[data-release="notes"]');
      if (notes) notes.href = r.url;
      // buttons say which asset they want by a word in its file name, e.g. data-asset="Setup";
      // data-keep-href keeps the link from the HTML (e.g. the releases page) and only updates the size
      for (const btn of card.querySelectorAll("[data-asset]")) {
        const asset = r.assets.find((a) => a.name.toLowerCase().includes(btn.dataset.asset.toLowerCase()));
        if (!asset) continue;
        if (!("keepHref" in btn.dataset)) btn.href = asset.url;
        const size = btn.querySelector("span");
        if (size) size.textContent = mb(asset.size);
      }
      // a mirror (e.g. the China download on dl.luyulin.com) follows the latest release when the API answers;
      // the link written in the HTML stays for visitors who cannot reach GitHub
      for (const btn of card.querySelectorAll("[data-mirror]")) {
        btn.href = btn.dataset.mirror.replace(/\{tag\}/g, r.tag).replace(/\{version\}/g, ver);
      }
      // total downloads over every version; hover shows the per-version breakdown
      // data-mirror-stats="<address>": a mirror's downloads by tag (stats.luyulin.com/public's "mirror") are added in
      const count = card.querySelector('[data-release="downloads"]');
      if (count) {
        // label by tag, or by release name when the tag carries no version (e.g. "PXRD")
        const label = (x) => (/\d/.test(x.tag) ? x.tag : x.name || x.tag);
        const show = (extra = {}) => {
          const per = all.map((x) => [label(x), x.assets.reduce((s, a) => s + a.n, 0) + (extra[x.tag] || 0)]);
          const total = per.reduce((s, [, n]) => s + n, 0);
          count.textContent = `⬇ ${total.toLocaleString("en")} download${total === 1 ? "" : "s"}`;
          count.title = per.map(([tag, n]) => `${tag}: ${n.toLocaleString("en")}`).join("\n");
          count.hidden = false;
        };
        show();
        if (count.dataset.mirrorStats) {
          cached(`mirror.v1:${count.dataset.mirrorStats}`, async () => {
            const res = await fetch(count.dataset.mirrorStats);
            if (!res.ok) throw new Error(res.status);
            return (await res.json()).mirror?.tags || {};
          }).then(show).catch(() => { /* GitHub's numbers alone */ });
        }
      }
    }).catch(() => { /* keep the fallback values from the HTML */ });
  }
})();
