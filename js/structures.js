// Interactive 3D crystal-structure viewer (3Dmol.js, self-hosted in js/vendor/).
// The library and structure files are only fetched once the section scrolls into view.
(() => {
  const root = document.querySelector("[data-structures]");
  if (!root) return;

  // groups: MOL2 substructure ids (column 7 of each ATOM line)
  const STRUCTURES = [
    {
      id: "sbu",
      tab: "N₁₂Cl₁₂ cluster",
      file: "structures/web/tahpme-sbu.xyz",
      format: "xyz",
      hbonds: true,
      caption: "One N₁₂Cl₁₂ ionic cluster (Cl⁻ as green spheres) and the 12 TAHPMe cations it links — a high-connectivity secondary building unit. Dashed lines: N–H···Cl hydrogen bonds.",
      paper: { label: "Nat. Chem. 2026", doi: "10.1038/s41557-026-02248-w" },
    },
    {
      id: "cell",
      tab: "Crystal packing",
      file: "structures/web/tahpme-cell.xyz",
      format: "xyz",
      cell: "structures/web/tahpme-cell.json",
      caption: "Unit-cell contents of TAHPMe·N₁₂Cl₁₂ (space group R-3c); disordered heptane solvent omitted.",
      paper: { label: "Nat. Chem. 2026", doi: "10.1038/s41557-026-02248-w" },
    },
    {
      id: "moc68",
      tab: "Δ-MOC-68 · CB[10]",
      file: "structures/web/moc68-cb10.mol2",
      format: "mol2",
      guests: [3, 4, 9, 10],
      guestColor: "greenCarbon",
      extras: [1, 5, 6, 7, 8, 11, 12, 13, 14], // BF₄⁻ and water
      caption: "Δ-MOC-68 with four cucurbit[10]uril rings (green carbons).",
    },
    {
      id: "moc16",
      tab: "MOC-16-Zn · calix[4]arene",
      file: "structures/web/moc16zn-calix4.mol2",
      format: "mol2",
      guests: [4, 5, 6, 7, 8, 9, 10],
      guestColor: "orangeCarbon",
      extras: [2, 3], // SiF₆²⁻, BF₄⁻
      caption: "Zn₈Pd₆ cage MOC-16-Zn hosting seven calix[4]arene guests (orange carbons) in its pockets.",
    },
  ];

  const METALS = ["Zn", "Pd", "Ru", "Fe", "Co", "Ni", "Os", "Pt", "Cu"];
  const MODELS = {
    stick: { label: "Stick" },
    ballstick: { label: "Ball & stick" },
    sphere: { label: "Space-filling" },
    line: { label: "Wireframe" },
  };

  const $ = (s) => root.querySelector(s);
  const tabs = $(".st-tabs");
  const viewerEl = $(".st-viewer");
  const caption = $(".st-caption");
  const modelSel = $(".st-model");
  const hBox = $(".st-h");
  const guestBox = $(".st-guests");
  const extraBox = $(".st-extras");
  const cellBox = $(".st-cell");
  const spinBox = $(".st-spin");

  for (const [k, m] of Object.entries(MODELS)) modelSel.add(new Option(m.label, k));
  modelSel.value = "stick";
  tabs.innerHTML = STRUCTURES.map((s, i) =>
    `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}">${s.tab}</button>`).join("");

  let viewer = null, model = null, current = null, hbondShapes = [], cellShapes = [];
  const cache = {};

  async function loadText(url) {
    if (!cache[url]) cache[url] = fetch(url).then((r) => r.text());
    return cache[url];
  }

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

  function applyStyle() {
    if (!model) return;
    const s = current, kind = modelSel.value;
    const showH = hBox.checked;
    const noH = showH ? {} : { not: { elem: "H" } };
    const guests = s.guests && guestBox.checked ? s.guests : [];
    const hideExtras = s.extras && !extraBox.checked ? s.extras : [];

    viewer.setStyle({}, {});
    viewer.setStyle({ ...noH }, styleFor(kind));
    if (guests.length) viewer.setStyle({ resi: guests, ...noH }, styleFor(kind, s.guestColor));
    if (hideExtras.length) viewer.setStyle({ resi: hideExtras }, {});
    // in stick / wireframe modes, mark metal centres and halide ions with small spheres
    if (kind === "stick" || kind === "line") {
      viewer.addStyle({ elem: METALS }, { sphere: { scale: 0.32 } });
      viewer.addStyle({ predicate: (a) => a.elem === "Cl" && !a.bonds.length }, { sphere: { scale: 0.45 } });
    }
    drawHbonds(s.hbonds && showH && kind !== "sphere");
    viewer.render();
  }

  function drawHbonds(on) {
    hbondShapes.forEach((sh) => viewer.removeShape(sh));
    hbondShapes = [];
    if (!on) return;
    const atoms = model.selectedAtoms({});
    const cl = atoms.filter((a) => a.elem === "Cl");
    const nh = atoms.filter((a) => a.elem === "H" && a.bonds.length === 1 && atoms[a.bonds[0]].elem === "N");
    for (const h of nh) for (const c of cl) {
      const d = Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z);
      if (d < 2.6) hbondShapes.push(viewer.addCylinder({
        start: { x: h.x, y: h.y, z: h.z }, end: { x: c.x, y: c.y, z: c.z },
        radius: 0.04, color: "#4a9e5c", dashed: true, dashLength: 0.18, gapLength: 0.14, fromCap: 1, toCap: 1,
      }));
    }
  }

  async function drawCell(on) {
    cellShapes.forEach((sh) => viewer.removeShape(sh));
    cellShapes = [];
    if (!on || !current.cell) return;
    const meta = JSON.parse(await loadText(current.cell));
    const p = meta.cellCorners.map(([x, y, z]) => ({ x, y, z }));
    // corners are ordered (i,j,k) ∈ {0,1}³ → edges join corners differing in one bit
    for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) {
      const b = a ^ bit;
      if (a < b) cellShapes.push(viewer.addCylinder({ start: p[a], end: p[b], radius: 0.08, color: "#8a857b", fromCap: 1, toCap: 1 }));
    }
  }

  async function show(i) {
    current = STRUCTURES[i];
    tabs.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", i === j));
    guestBox.closest("label").hidden = !current.guests;
    extraBox.closest("label").hidden = !current.extras;
    cellBox.closest("label").hidden = !current.cell;
    root.classList.add("loading");

    const text = await loadText(current.file);
    viewer.clear();
    hbondShapes = []; cellShapes = [];
    model = viewer.addModel(text, current.format);
    if (current.format === "mol2") {
      const groups = mol2Groups(text);
      model.selectedAtoms({}).forEach((a, k) => { a.resi = groups[k]; });
    }
    applyStyle();
    await drawCell(cellBox.checked);
    viewer.zoomTo();
    viewer.zoom(current.cell ? 1.0 : 1.15);
    viewer.render();
    setSpin();

    const link = current.paper ? ` <a href="https://doi.org/${current.paper.doi}" target="_blank" rel="noopener">${current.paper.label} →</a>` : "";
    caption.innerHTML = current.caption + link;
    root.classList.remove("loading");
  }

  function setSpin() {
    viewer.spin(spinBox.checked ? "y" : false, 0.4);
  }

  function init() {
    viewer = $3Dmol.createViewer(viewerEl, { backgroundColor: "white", antialias: true });
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (b) show(+b.dataset.i);
    });
    [modelSel, hBox, guestBox, extraBox].forEach((el) => el.addEventListener("change", applyStyle));
    cellBox.addEventListener("change", async () => { await drawCell(cellBox.checked); viewer.render(); });
    spinBox.addEventListener("change", setSpin);
    $(".st-reset").addEventListener("click", () => { viewer.zoomTo(); viewer.zoom(current.cell ? 1.0 : 1.15); viewer.render(); });
    addEventListener("resize", () => viewer.resize());
    // pause the spin while the section is off-screen
    new IntersectionObserver(([e]) => {
      if (!viewer) return;
      if (e.isIntersecting) setSpin(); else viewer.spin(false);
    }).observe(root);
    show(0);
  }

  // lazy-load the library when the section approaches the viewport
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const s = document.createElement("script");
    s.src = "js/vendor/3Dmol-min.js";
    s.onload = init;
    s.onerror = () => { caption.textContent = "The 3D viewer could not be loaded."; };
    document.head.appendChild(s);
  }, { rootMargin: "300px" });
  io.observe(root);
})();
