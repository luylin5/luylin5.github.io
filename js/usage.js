// How many copies of a tool are in use, from its anonymous usage counter (Crystery: stats.luyulin.com,
// counted from v0.7.1 on). An element with data-usage="<address>" shows the number of installs; hover shows
// how many of them were used in the last 30 days. It stays hidden while the counter has nothing or cannot be reached.
(() => {
  const CACHE_MS = 60 * 60 * 1000;
  const plural = (n, word) => `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;

  async function usage(url) {
    const key = `usage.v1:${url}`;
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.u;
    } catch {}
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const u = await res.json();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), u })); } catch {}
    return u;
  }

  for (const el of document.querySelectorAll("[data-usage]")) {
    usage(el.dataset.usage).then(({ installs, active30 }) => {
      if (!installs) return;
      el.textContent = `👤 ${plural(installs, "user")}`;
      el.title = `${active30.toLocaleString("en")} in the last 30 days`;
      el.hidden = false;
    }).catch(() => { /* stays hidden */ });
  }
})();
