// Interactive 3D crystal structures (3Dmol.js, self-hosted in js/vendor/), shown as a row
// of cards, one viewer each. The library and files load when the section scrolls into view.
(() => {
  const root = document.querySelector("[data-structures]");
  if (!root) return;

  const PAPERS = {
    natchem26: { label: "Nat. Chem. 2026", doi: "10.1038/s41557-026-02248-w" },
    chem23: { label: "Chem 2023", doi: "10.1016/j.chempr.2023.03.019" },
    jacs25: { label: "J. Am. Chem. Soc. 2025", doi: "10.1021/jacs.5c03074" },
    jacs23: { label: "J. Am. Chem. Soc. 2023", doi: "10.1021/jacs.3c09491" },
  };

  // groups: MOL2 substructure ids (column 7 of each ATOM line)
  const STRUCTURES = [
    {
      title: "TAHPMe·N₁₂Cl₁₂",
      subtitle: "Ionic-cluster SBU",
      views: [
        { label: "Cluster", file: "structures/web/tahpme-sbu.xyz", format: "xyz", hbonds: true },
        { label: "Packing", file: "structures/web/tahpme-cell.xyz", format: "xyz", cell: "structures/web/tahpme-cell.json" },
      ],
      caption: "An N₁₂Cl₁₂ cluster (Cl⁻ in green) linking 12 TAHPMe cations; switch to Packing for the R-3c unit cell.",
      papers: ["natchem26"],
    },
    {
      title: "Δ-MOC-68 · CB[10]",
      subtitle: "Ring-on-cage assembly",
      views: [{
        file: "structures/web/moc68-cb10.mol2", format: "mol2",
        guests: [3, 4, 9, 10], guestColor: "greenCarbon",
        extras: [1, 5, 6, 7, 8, 11, 12, 13, 14], // BF₄⁻ and water
      }],
      caption: "Chiral Δ-MOC-68 with four cucurbit[10]uril rings (green carbons).",
      papers: ["chem23", "jacs25"],
    },
    {
      title: "MOC-16-Zn · calix[4]arene",
      subtitle: "Multipocket host",
      views: [{
        file: "structures/web/moc16zn-calix4.mol2", format: "mol2",
        guests: [4, 5, 6, 7, 8, 9, 10], guestColor: "orangeCarbon",
        extras: [2, 3], // SiF₆²⁻, BF₄⁻
      }],
      caption: "Zn₈Pd₆ cage hosting seven calix[4]arene guests (orange carbons) in its pockets.",
      papers: ["jacs23"],
    },
  ];

  const METALS = ["Zn", "Pd", "Ru", "Fe", "Co", "Ni", "Os", "Pt", "Cu"];
  const MODELS = { stick: "Stick", ballstick: "Ball & stick", sphere: "Space-filling", line: "Wireframe" };
  const cache = {};
  const loadText = (url) => (cache[url] ??= fetch(url).then((r) => r.text()));

  // MOL2: substructure id per atom, in file order
  function mol2Groups(text) {
    const out = [];
    let inAtoms = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("@<TRIPOS>")) { inAtoms = line.startsWith("@<TRIPOS>ATOM"); continue; }
      if (inAtoms && line.trim()) out.push(+line.trim().split(/\s+/)[6]);
    }
    return out;
  }

  function styleFor(kind, colorscheme) {
    const c = colorscheme ? { colorscheme } : {};
    switch (kind) {
      case "ballstick": return { stick: { radius: 0.12, ...c }, sphere: { scale: 0.24, ...c } };
      case "sphere": return { sphere: { scale: 1.0, ...c } };
      case "line": return { line: { linewidth: 1.5, ...c } };
      default: return { stick: { radius: 0.14, ...c } };
    }
  }

  // ---- one card ----
  function makeCard(s) {
    const v0 = s.views[0];
    const el = document.createElement("article");
    el.className = "st-card";
    el.innerHTML = `
      <header class="st-head">
        <div><h3>${s.title}</h3><p>${s.subtitle}</p></div>
        <button type="button" class="st-expand" aria-label="Enlarge viewer" title="Enlarge">⤢</button>
      </header>
      ${s.views.length > 1 ? `<div class="st-views" role="tablist">${s.views.map((v, i) =>
        `<button type="button" data-v="${i}" aria-selected="${i === 0}">${v.label}</button>`).join("")}</div>` : ""}
      <div class="st-viewer"></div>
      <div class="st-controls">
        <select class="st-model" aria-label="Model">${Object.entries(MODELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
        <label><input type="checkbox" class="st-h"> H</label>
        ${v0.guests ? `<label><input type="checkbox" class="st-guests" checked> Guests</label>` : ""}
        ${v0.extras ? `<label><input type="checkbox" class="st-extras"> Ions</label>` : ""}
        <label class="st-cell-wrap" hidden><input type="checkbox" class="st-cell" checked> Cell</label>
      </div>
      <p class="st-caption">${s.caption}
        <span class="st-papers">${s.papers.map((k) => `<a href="https://doi.org/${PAPERS[k].doi}" target="_blank" rel="noopener">${PAPERS[k].label}</a>`).join("")}</span>
      </p>`;
    const q = (sel) => el.querySelector(sel);
    const ctl = { model: q(".st-model"), h: q(".st-h"), guests: q(".st-guests"), extras: q(".st-extras"), cell: q(".st-cell") };
    let viewer, model, view, shapes = [];

    function applyStyle() {
      if (!model) return;
      const kind = ctl.model.value, showH = ctl.h.checked;
      const noH = showH ? {} : { not: { elem: "H" } };
      viewer.setStyle({}, {});
      viewer.setStyle({ ...noH }, styleFor(kind));
      if (view.guests && ctl.guests?.checked) viewer.setStyle({ resi: view.guests, ...noH }, styleFor(kind, view.guestColor));
      if (view.extras && !ctl.extras?.checked) viewer.setStyle({ resi: view.extras }, {});
      // in stick / wireframe modes, mark metal centres and halide ions with small spheres
      if (kind === "stick" || kind === "line") {
        viewer.addStyle({ elem: METALS }, { sphere: { scale: 0.32 } });
        viewer.addStyle({ predicate: (a) => a.elem === "Cl" && !a.bonds.length }, { sphere: { scale: 0.45 } });
      }
      drawShapes();
    }

    async function drawShapes() {
      shapes.forEach((sh) => viewer.removeShape(sh));
      shapes = [];
      const atoms = model.selectedAtoms({});
      // N–H···Cl hydrogen bonds (dashed), only when H atoms are shown
      if (view.hbonds && ctl.h.checked && ctl.model.value !== "sphere") {
        const cl = atoms.filter((a) => a.elem === "Cl");
        for (const h of atoms) {
          if (h.elem !== "H" || h.bonds.length !== 1 || atoms[h.bonds[0]].elem !== "N") continue;
          for (const c of cl) if (Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z) < 2.6) shapes.push(viewer.addCylinder({
            start: { x: h.x, y: h.y, z: h.z }, end: { x: c.x, y: c.y, z: c.z },
            radius: 0.04, color: "#4a9e5c", dashed: true, dashLength: 0.18, gapLength: 0.14,
          }));
        }
      }
      if (view.cell && ctl.cell.checked) {
        const p = JSON.parse(await loadText(view.cell)).cellCorners.map(([x, y, z]) => ({ x, y, z }));
        // corners are ordered (i,j,k) ∈ {0,1}³ → edges join corners differing in one bit
        for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) {
          const b = a ^ bit;
          if (a < b) shapes.push(viewer.addCylinder({ start: p[a], end: p[b], radius: 0.08, color: "#8a857b" }));
        }
      }
      viewer.render();
    }

    function resetView() {
      viewer.zoomTo();
      viewer.zoom(view.cell ? 1.0 : 1.12);
      viewer.render();
    }

    async function show(i) {
      view = s.views[i];
      el.querySelectorAll(".st-views button").forEach((b, j) => b.setAttribute("aria-selected", i === j));
      q(".st-cell-wrap").hidden = !view.cell;
      el.classList.add("loading");
      const text = await loadText(view.file);
      viewer.clear();
      shapes = [];
      model = viewer.addModel(text, view.format);
      if (view.format === "mol2") {
        const groups = mol2Groups(text);
        model.selectedAtoms({}).forEach((a, k) => { a.resi = groups[k]; });
      }
      applyStyle();
      resetView();
      el.classList.remove("loading");
    }

    function init() {
      viewer = $3Dmol.createViewer(q(".st-viewer"), { backgroundColor: "white", antialias: true });
      [ctl.model, ctl.h, ctl.guests, ctl.extras].forEach((c) => c?.addEventListener("change", applyStyle));
      ctl.cell.addEventListener("change", drawShapes);
      el.querySelector(".st-views")?.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]");
        if (b) show(+b.dataset.v);
      });
      q(".st-expand").addEventListener("click", () => {
        const on = el.classList.toggle("expanded");
        q(".st-expand").setAttribute("aria-label", on ? "Shrink viewer" : "Enlarge viewer");
        requestAnimationFrame(() => { viewer.resize(); resetView(); });
        if (on) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return show(0);
    }

    return { el, init, spin: (on) => viewer && viewer.spin(on ? "y" : false, 0.35), resize: () => viewer && viewer.resize() };
  }

  const grid = root.querySelector(".st-grid");
  const cards = STRUCTURES.map(makeCard);
  cards.forEach((c) => grid.appendChild(c.el));

  function start() {
    cards.forEach((c) => c.init().then(() => c.spin(true)));
    addEventListener("resize", () => cards.forEach((c) => c.resize()));
    // pause spinning while the section is off-screen
    new IntersectionObserver(([e]) => cards.forEach((c) => c.spin(e.isIntersecting))).observe(root);
  }

  // lazy-load the library when the section approaches the viewport
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const s = document.createElement("script");
    s.src = "js/vendor/3Dmol-min.js";
    s.onload = start;
    s.onerror = () => { grid.insertAdjacentHTML("beforebegin", '<p class="muted">The 3D viewer could not be loaded.</p>'); };
    document.head.appendChild(s);
  }, { rootMargin: "300px" });
  io.observe(root);
})();
