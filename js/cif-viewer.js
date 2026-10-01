// "CIF" button on selected publications: opens a panel under the paper with one 3D card per
// deposited crystal structure (data built by tools-dev/build_cifs.py → structures/cif/).
// Browsers allow only ~16 live WebGL contexts, so a card creates its viewer when it scrolls
// near the viewport and releases it when it scrolls far away (papers can have 30+ structures).
(() => {
  const list = document.getElementById("pub-selected");
  if (!list) return;
  const { load, styleFor, decorate, drawBox, modelOptions } = window.Mol3D;
  const MAX_ATOMS = 60000; // larger packings are disabled to keep the viewer responsive
  const PACKINGS = [[1, 1, 1, "Unit cell"], [2, 2, 1, "2 × 2 × 1"], [2, 2, 2, "2 × 2 × 2"]];

  const nearViewport = new IntersectionObserver((items) => {
    for (const it of items) it.target.card[it.isIntersecting ? "activate" : "deactivate"]();
  }, { rootMargin: "250px 0px" });

  fetch("structures/cif/manifest.json").then((r) => (r.ok ? r.json() : {})).then((manifest) => {
    for (const li of list.querySelectorAll("li.pub[data-doi]")) {
      const entries = manifest[li.dataset.doi];
      if (!entries?.length) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cif-toggle";
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = entries.length > 1 ? `CIF (${entries.length})` : "CIF";
      li.querySelector(".pub-links").appendChild(btn);
      btn.addEventListener("click", () => toggle(li, btn, entries));
    }
  }).catch(() => {});

  function toggle(li, btn, entries) {
    let panel = li.querySelector(".cif-panel");
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", open);
    if (panel) { panel.hidden = !open; return; } // hidden cards stop intersecting → viewers released

    panel = document.createElement("div");
    panel.className = "cif-panel";
    panel.innerHTML = `<p class="cif-note">${entries.length} crystal structure${entries.length > 1 ? "s" : ""} ·
      drag to rotate, scroll to zoom</p><div class="st-grid"></div>`;
    li.appendChild(panel);
    const grid = panel.querySelector(".st-grid");
    load().then(() => {
      for (const e of entries) {
        const card = makeCard(e);
        grid.appendChild(card.el);
        nearViewport.observe(card.el);
      }
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, () => { grid.textContent = "The 3D viewer could not be loaded."; });
  }

  // unit-cell data → MOL2 text for an na × nb × nc block of cells (bonds kept per copy)
  function supercellMol2(d, [na, nb, nc]) {
    const n = d.el.length, [A, B, C] = d.cell;
    const atoms = [], bonds = [];
    let copy = 0;
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) for (let k = 0; k < nc; k++, copy++) {
      const t = [0, 1, 2].map((q) => i * A[q] + j * B[q] + k * C[q]);
      for (let a = 0; a < n; a++) {
        const x = d.xyz[3 * a] + t[0], y = d.xyz[3 * a + 1] + t[1], z = d.xyz[3 * a + 2] + t[2];
        atoms.push(`${copy * n + a + 1} ${d.el[a]} ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)} ${d.el[a]} 1 C 0`);
      }
      for (let b = 0; b < d.bonds.length; b += 2) {
        bonds.push(`${bonds.length + 1} ${copy * n + d.bonds[b] + 1} ${copy * n + d.bonds[b + 1] + 1} 1`);
      }
    }
    return `@<TRIPOS>MOLECULE\ncell\n${atoms.length} ${bonds.length} 0 0 0\nSMALL\nNO_CHARGES\n\n` +
      `@<TRIPOS>ATOM\n${atoms.join("\n")}\n@<TRIPOS>BOND\n${bonds.join("\n")}\n`;
  }

  // corners of cell (i,j,k) in Cartesian space, ordered (u,v,w) ∈ {0,1}³ for drawBox
  const cellCorners = ([A, B, C], i, j, k) => [0, 1].flatMap((u) => [0, 1].flatMap((v) => [0, 1].map((w) => {
    const f = [i + u, j + v, k + w];
    return { x: f[0] * A[0] + f[1] * B[0] + f[2] * C[0], y: f[0] * A[1] + f[1] * B[1] + f[2] * C[1], z: f[0] * A[2] + f[1] * B[2] + f[2] * C[2] };
  })));

  function makeCard(e) {
    const el = document.createElement("article");
    el.className = "st-card";
    const [a, b, c, al, be, ga] = e.cell;
    el.innerHTML = `
      <header class="st-head">
        <div><h3>${e.label}</h3><p>CCDC ${e.ccdc} · ${e.sg.replace(/ /g, "")}</p></div>
        <button type="button" class="st-expand" aria-label="Enlarge viewer" title="Enlarge">⤢</button>
      </header>
      <div class="st-views" role="tablist">${PACKINGS.map(([x, y, z, label], i) => {
        const tooBig = e.atoms * x * y * z > MAX_ATOMS;
        return `<button type="button" data-p="${i}" aria-selected="${i === 0}" ${tooBig ? 'disabled title="Too many atoms to display smoothly"' : ""}>${label}</button>`;
      }).join("")}</div>
      <div class="st-viewer"></div>
      <div class="st-controls">
        <select class="st-model" aria-label="Model">${modelOptions()}</select>
        <label><input type="checkbox" class="st-h"> H</label>
        <label><input type="checkbox" class="st-cell" checked> Cell</label>
        <label><input type="checkbox" class="st-spin" checked> Spin</label>
      </div>
      <p class="st-caption">a ${a}, b ${b}, c ${c} Å; α ${al}°, β ${be}°, γ ${ga}°
        <span class="st-papers">
          <a href="${e.cif}" download="CCDC_${e.ccdc}.cif">Download CIF</a>
          <a href="https://www.ccdc.cam.ac.uk/structures/Search?Ccdcid=${e.ccdc}" target="_blank" rel="noopener">CCDC ${e.ccdc}</a>
        </span>
      </p>`;
    const q = (s) => el.querySelector(s);
    let viewer = null, data = null, packing = PACKINGS[0], shapes = [], token = 0;

    function applyStyle() {
      if (!viewer) return;
      const kind = q(".st-model").value;
      viewer.setStyle({}, {});
      viewer.setStyle(q(".st-h").checked ? {} : { not: { elem: "H" } }, styleFor(kind));
      decorate(viewer, kind);
      shapes.forEach((s) => viewer.removeShape(s));
      shapes = [];
      if (q(".st-cell").checked) {
        for (let i = 0; i < packing[0]; i++) for (let j = 0; j < packing[1]; j++) for (let k = 0; k < packing[2]; k++) {
          shapes.push(...drawBox(viewer, cellCorners(data.cell, i, j, k), "#8a857b", 0.06 * packing[0]));
        }
      }
      viewer.render();
    }

    function build() {
      if (!viewer) return;
      el.classList.add("loading");
      const my = ++token;
      setTimeout(() => { // let the "loading" state paint before a large model is built
        if (!viewer || my !== token) return;
        viewer.clear();
        shapes = [];
        viewer.addModel(supercellMol2(data, packing), "mol2", { keepH: true });
        applyStyle();
        viewer.zoomTo();
        viewer.render();
        spin();
        el.classList.remove("loading");
      }, 30);
    }

    const spin = () => viewer && viewer.spin(q(".st-spin").checked ? "y" : false, 0.3);

    async function activate() {
      if (viewer) return;
      const host = document.createElement("div");
      host.className = "st-canvas";
      q(".st-viewer").replaceChildren(host);
      viewer = $3Dmol.createViewer(host, { backgroundColor: "white", antialias: true });
      data ??= await fetch(e.data).then((r) => r.json());
      build();
    }

    function deactivate() {
      if (!viewer) return;
      token++;
      viewer.spin(false);
      viewer.clear();
      // free the WebGL context so other cards can use one
      const canvas = q(".st-viewer canvas");
      const gl = canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      q(".st-viewer").replaceChildren();
      viewer = null;
    }

    q(".st-views").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-p]:not([disabled])");
      if (!b) return;
      q(".st-views").querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x === b));
      packing = PACKINGS[+b.dataset.p];
      build();
    });
    q(".st-model").addEventListener("change", applyStyle);
    q(".st-h").addEventListener("change", applyStyle);
    q(".st-cell").addEventListener("change", applyStyle);
    q(".st-spin").addEventListener("change", spin);
    q(".st-expand").addEventListener("click", () => {
      el.classList.toggle("expanded");
      requestAnimationFrame(() => { if (viewer) { viewer.resize(); viewer.zoomTo(); viewer.render(); } });
    });
    addEventListener("resize", () => viewer && viewer.resize());

    el.card = { activate, deactivate };
    return { el };
  }
})();
