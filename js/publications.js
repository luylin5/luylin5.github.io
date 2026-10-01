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

  const link = (p) => `https://doi.org/${p.doi}`;
  const linksHTML = (p) => `<span class="pub-links">${p.pdf ? `<a href="${p.pdf}" target="_blank" rel="noopener">PDF</a>` : ""}<a href="${link(p)}" target="_blank" rel="noopener">DOI</a><button type="button" class="cite" data-i="${pubs.indexOf(p)}">Cite</button></span>`;

  // BibTeX built from the data file: "Given Family" → "Family, Given"; <sub>/<sup> → LaTeX
  function bibtex(p) {
    const tex = (h) => h.replace(/<sub>(.*?)<\/sub>/g, "$$_{$1}$$").replace(/<sup>(.*?)<\/sup>/g, "$$^{$1}$$")
      .replace(/<[^>]+>/g, "").replace(/&amp;/g, "\\&");
    const family = (a) => a.trim().split(/\s+/).pop();
    const authors = p.authors.map((a) => {
      const parts = a.trim().split(/\s+/);
      return parts.length > 1 ? `${parts.pop()}, ${parts.join(" ")}` : a;
    }).join(" and ");
    const firstWord = tex(p.title).replace(/[^A-Za-z ]/g, "").split(" ").find((w) => w.length > 3) || "paper";
    const key = (family(p.authors[0]) + p.year + firstWord).replace(/[^A-Za-z0-9]/g, "");
    const isBook = /chapter/i.test(p.venue);
    const fields = [
      ["author", authors],
      ["title", `{${tex(p.title)}}`],
      [isBook ? "booktitle" : "journal", tex(p.venue).replace(/^Book chapter in /, "").replace(/, World Scientific$/, "")],
      ["year", p.year],
      ["volume", p.volume],
      ["pages", p.pages && String(p.pages).replace("-", "--")],
      ["doi", p.doi],
    ].filter(([, v]) => v);
    const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n");
    return `@${isBook ? "incollection" : "article"}{${key},\n${body}\n}`;
  }

  async function copyCite(btn) {
    const text = bibtex(pubs[+btn.dataset.i]);
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied ✓";
    } catch {
      // clipboard blocked: show the BibTeX so it can be copied by hand
      window.prompt("BibTeX (copy with Ctrl+C):", text);
    }
    btn.classList.add("done");
    setTimeout(() => { btn.textContent = "Cite"; btn.classList.remove("done"); }, 1600);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#publications .cite");
    if (btn) copyCite(btn);
  });

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
            <a class="pub-title" href="${link(p)}" target="_blank" rel="noopener">${p.title}</a>
            <div class="authors">${authorsHTML(p)}</div>
            <div class="venue">${citeHTML(p)} ${linksHTML(p)}</div>
          </li>`).join("")}
      </ol>`).join("");
    const count = document.getElementById("pub-count");
    if (count) count.textContent = pubs.length;
  }
})();
