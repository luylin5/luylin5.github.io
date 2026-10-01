// Shared helpers for the 3D structure viewers (js/structures.js and js/cif-viewer.js).
window.Mol3D = (() => {
  let loading = null;
  // load the self-hosted 3Dmol.js once, on first use
  const load = () => (loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "js/vendor/3Dmol-min.js";
    s.onload = () => resolve(window.$3Dmol);
    s.onerror = reject;
    document.head.appendChild(s);
  }));

  const MODELS = { stick: "Stick", ballstick: "Ball & stick", sphere: "Space-filling", line: "Wireframe" };
  const METALS = ["Zn", "Pd", "Ru", "Fe", "Co", "Ni", "Os", "Pt", "Cu", "Ag", "Cd", "Ir", "Rh", "Au", "Zr"];

  function styleFor(kind, colorscheme) {
    const c = colorscheme ? { colorscheme } : {};
    switch (kind) {
      case "ballstick": return { stick: { radius: 0.12, ...c }, sphere: { scale: 0.24, ...c } };
      case "sphere": return { sphere: { scale: 1.0, ...c } };
      case "line": return { line: { linewidth: 1.5, ...c } };
      default: return { stick: { radius: 0.14, ...c } };
    }
  }

  // in stick / wireframe modes, mark metal centres and free halide ions with small spheres
  function decorate(viewer, kind) {
    if (kind !== "stick" && kind !== "line") return;
    viewer.addStyle({ elem: METALS }, { sphere: { scale: 0.32 } });
    viewer.addStyle({ predicate: (a) => ["Cl", "Br", "I"].includes(a.elem) && !a.bonds.length }, { sphere: { scale: 0.45 } });
  }

  // straight-line box edges between 8 corners ordered (i,j,k) ∈ {0,1}³
  function drawBox(viewer, corners, color = "#8a857b", radius = 0.08) {
    const shapes = [];
    for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) {
      const b = a ^ bit;
      if (a < b) shapes.push(viewer.addCylinder({ start: corners[a], end: corners[b], radius, color }));
    }
    return shapes;
  }

  const modelOptions = () => Object.entries(MODELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");

  return { load, styleFor, decorate, drawBox, modelOptions };
})();
