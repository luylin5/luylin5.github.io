// Visitor statistics via GoatCounter (cookie-free, no personal data → no consent banner).
// Loads the counting script and adds a small stats button in the bottom-right corner that
// shows the total visit count and links to the public GoatCounter dashboard.
//
// Setup (once): sign up at https://www.goatcounter.com/signup with the code below, then in
// the GoatCounter settings enable "Allow adding visitor counts on your website" (for the
// total shown in the panel) and make the dashboard viewable by anyone (for the full stats).
(() => {
  const GOATCOUNTER = "yulinlu"; // ← your GoatCounter code: https://<code>.goatcounter.com
  const base = `https://${GOATCOUNTER}.goatcounter.com`;

  // counting script (it ignores localhost, so local previews are not counted)
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `${base}/count`;
  document.head.appendChild(s);

  // ---- floating button + panel ----
  const wrap = document.createElement("div");
  wrap.className = "stats";
  wrap.innerHTML = `
    <button type="button" class="stats-btn" aria-expanded="false" aria-controls="stats-panel" title="Site statistics">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      <span class="sr-only">Site statistics</span>
    </button>
    <div class="stats-panel" id="stats-panel" role="dialog" aria-label="Site statistics" hidden>
      <p class="stats-title">Site statistics</p>
      <p class="stats-total"><span class="stats-num">—</span><span class="stats-unit">visits so far</span></p>
      <a class="stats-link" href="${base}" target="_blank" rel="noopener">
        Full statistics →<small>visitor locations, daily visitors, referrers, devices</small>
      </a>
      <p class="stats-note">Privacy-friendly: no cookies, no personal data (GoatCounter).</p>
      <div class="stats-app" hidden>
        <p class="stats-title">Crystery users</p>
        <p class="stats-total"><span class="stats-num stats-app-num">—</span><span class="stats-unit">users</span></p>
        <p class="stats-note stats-app-active"></p>
        <ul class="stats-countries"></ul>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const btn = wrap.querySelector(".stats-btn");
  const panel = wrap.querySelector(".stats-panel");
  const num = wrap.querySelector(".stats-num");
  let loaded = false;

  async function loadTotal() {
    loaded = true;
    try {
      const r = await fetch(`${base}/counter/TOTAL.json`);
      if (!r.ok) throw new Error(r.status);
      num.textContent = (await r.json()).count;
    } catch {
      num.textContent = "—";
      wrap.querySelector(".stats-unit").textContent = "count not available yet";
      loaded = false; // try again next time the panel opens
    }
  }

  // Crystery's users (its anonymous usage counter): the total, those of the last 30 days, and by country.
  const USAGE = "https://stats.luyulin.com/public";
  const app = wrap.querySelector(".stats-app");
  let appLoaded = false;
  const regionName = (() => {
    try { const names = new Intl.DisplayNames(["en"], { type: "region" }); return (code) => names.of(code) || code; }
    catch { return (code) => code; }
  })();
  async function loadApp() {
    appLoaded = true;
    try {
      const r = await fetch(USAGE);
      if (!r.ok) throw new Error(r.status);
      const { installs, active30, countries = [] } = await r.json();
      if (!installs) return;
      app.querySelector(".stats-app-num").textContent = installs.toLocaleString("en");
      app.querySelector(".stats-app-active").textContent = `${active30.toLocaleString("en")} in the last 30 days`;
      // the six largest countries, the rest together; a bar for each, as wide as its share of the largest
      const named = countries.filter((c) => c.country);
      const shown = named.slice(0, 6);
      const rest = installs - shown.reduce((s, c) => s + c.n, 0);
      const rows = [...shown.map((c) => [regionName(c.country), c.n]), ...(rest > 0 ? [["Other", rest]] : [])];
      const top = Math.max(...rows.map(([, n]) => n), 1);
      const list = app.querySelector(".stats-countries");
      list.replaceChildren(...rows.map(([name, n]) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="stats-country"></span><span class="stats-count"></span><span class="stats-bar"><i></i></span>`;
        li.querySelector(".stats-country").textContent = name;
        li.querySelector(".stats-count").textContent = n.toLocaleString("en");
        li.querySelector("i").style.width = `${Math.max(4, Math.round((n / top) * 100))}%`;
        return li;
      }));
      app.hidden = false;
    } catch {
      appLoaded = false; // try again next time the panel opens
    }
  }

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open);
    if (open && !loaded) loadTotal();
    if (open && !appLoaded) loadApp();
  }
  btn.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
})();
