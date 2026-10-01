// Renders window.PUBLICATIONS into #pub-selected and #pub-all.
(() => {
  const pubs = window.PUBLICATIONS || [];
  const names = window.MY_NAMES || [];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function authorsHTML(p) {
    return p.authors.map((a, i) => {
      let s = esc(a);
      if ((p.equal || []).includes(i)) s += "<sup>†</sup>";
      if ((p.corresponding || []).includes(i)) s += "<sup>✉</sup>";
      return names.includes(a) ? `<b>${s}</b>` : s;
    }).join(", ");
  }

  function citeHTML(p) {
    // `venue` may contain trusted markup (e.g. <i>) from the data file
    let s = `<i>${p.venue}</i> <b>${p.year}</b>`;
    if (p.volume) s += `, ${esc(p.volume)}`;
    if (p.pages) s += `, ${esc(p.pages)}`;
    return s;
  }

  const isFirst = (p) => names.includes(p.authors[0]);
  const isCoFirst = (p) => (p.equal || []).some((i) => names.includes(p.authors[i]));
  // co-first authorship is already shown by † on the names, so it gets no extra tag
  const roleTag = (p) => isFirst(p) && !isCoFirst(p) ? '<span class="tag">First author</span>' : "";
  const link = (p) => `https://doi.org/${p.doi}`;
  const linksHTML = (p) => `<span class="pub-links">${p.pdf ? `<a href="${p.pdf}" target="_blank" rel="noopener">PDF</a>` : ""}<a href="${link(p)}" target="_blank" rel="noopener">DOI</a></span>`;

  // Selected
  const sel = document.getElementById("pub-selected");
  if (sel) {
    sel.innerHTML = pubs.filter((p) => p.selected).map((p) => `
      <li class="pub">
        ${p.toc
          ? `<button type="button" class="pub-toc" data-i="${pubs.indexOf(p)}" aria-label="Enlarge graphic"><img src="${p.toc}" alt="" loading="lazy"></button>`
          : `<div class="pub-badge"><span>${esc(p.venue)}</span><span>${p.year}</span></div>`}
        <div>
          <h3><a href="${link(p)}" target="_blank" rel="noopener">${p.title}</a></h3>
          <p class="authors">${authorsHTML(p)}</p>
          <p class="venue">${citeHTML(p)}${p.note ? ` <span class="tag">${esc(p.note)}</span>` : ""}</p>
          <p>${linksHTML(p)}</p>
        </div>
      </li>`).join("");
  }

  // click a TOC graphic to enlarge it (lightbox lives in gallery.js)
  sel?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pub-toc");
    if (!btn) return;
    const p = pubs[+btn.dataset.i];
    const plain = (h) => h.replace(/<[^>]+>/g, "");
    if (window.openLightbox) {
      window.openLightbox({ src: p.toc, title: plain(p.title), caption: `${plain(p.venue)} ${p.year}`, link: link(p) });
    } else {
      window.open(link(p), "_blank", "noopener");
    }
  });

  // Full list, grouped by year
  const all = document.getElementById("pub-all");
  if (all) {
    const years = [...new Set(pubs.map((p) => p.year))].sort((a, b) => b - a);
    let n = pubs.length;
    all.innerHTML = years.map((y) => `
      <h3 class="pub-year">${y}</h3>
      <ol class="pub-list">
        ${pubs.filter((p) => p.year === y).map((p) => `
          <li value="${n--}">
            <a class="pub-title" href="${link(p)}" target="_blank" rel="noopener">${p.title}</a>${roleTag(p) ? " " + roleTag(p) : ""}
            <div class="authors">${authorsHTML(p)}</div>
            <div class="venue">${citeHTML(p)}${p.pdf ? " " + linksHTML(p) : ""}</div>
          </li>`).join("")}
      </ol>`).join("");
    const count = document.getElementById("pub-count");
    if (count) count.textContent = pubs.length;
  }
})();
