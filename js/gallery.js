// 3D "floating cards" gallery: cards sit on a slowly rotating cylinder seen from outside.
// Cards swinging to the front come closer (bigger) and into focus; those going round the
// sides/back shrink, blur and fade. Drag, scroll or move the mouse to steer.
(() => {
  const stage = document.querySelector("[data-gallery]");
  const items = window.GALLERY_ITEMS || [];
  if (!stage || !items.length) return;

  const TAU = Math.PI * 2;
  const BANDS = 3;          // horizontal rows of cards
  const PER_BAND = 12;      // cards per row around the full circle
  const COUNT = BANDS * PER_BAND;
  const BASE_SPEED = 0.045; // rad/s idle rotation
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Geometry in "design px" (1200px-wide stage), scaled by `unit`.
  const P = 1000;      // CSS perspective
  const R = 900;       // cylinder radius
  const D = 1650;      // camera distance from cylinder axis (outside the cylinder)
  const FRONT = D - R;  // depth of a card dead-centre in front: sharpest & biggest

  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const cards = [];
  for (let i = 0; i < COUNT; i++) {
    const band = i % BANDS;
    const k = Math.floor(i / BANDS);
    const item = items[(k * BANDS + band * 5) % items.length];
    const el = document.createElement("button");
    el.type = "button";
    el.className = "g-card";
    el.setAttribute("aria-label", item.title || "Photo");
    el.innerHTML = `<img src="${item.src}" alt="" decoding="async" draggable="false"><span class="g-cap"></span>`;
    el.querySelector(".g-cap").textContent = item.title || "";
    stage.appendChild(el);
    const c = {
      el, item,
      a: (k / PER_BAND) * TAU + band * (TAU / PER_BAND / BANDS) + (rand() - 0.5) * 0.12,
      r: 0.94 + rand() * 0.12,
      y: (band - (BANDS - 1) / 2) + (rand() - 0.5) * 0.25,
      s: 0.85 + rand() * 0.25,
      hover: 0, blur: -1, op: -1, z: -1,
    };
    el.addEventListener("pointerenter", () => (hovered = c));
    el.addEventListener("pointerleave", () => hovered === c && (hovered = null));
    el.addEventListener("focus", () => (hovered = c));
    el.addEventListener("blur", () => hovered === c && (hovered = null));
    el.addEventListener("click", () => { if (!dragMoved) openLightbox(item); });
    cards.push(c);
  }

  // ---- layout ----
  let unit = 1, cardW = 260, cardH = 173, bandGap = 250;
  function resize() {
    const w = stage.clientWidth;
    unit = Math.max(0.5, Math.min(1.25, w / 1200));
    stage.style.perspective = P * unit + "px";
    cardW = 260 * unit;
    cardH = cardW * 0.665;
    // rows spaced so the front (magnified) cards fill ~62% of the stage height
    bandGap = (stage.clientHeight * 0.31) / (P / FRONT) / unit;
    for (const c of cards) {
      c.el.style.width = cardW + "px";
      c.el.style.height = cardH + "px";
      c.el.style.marginLeft = -cardW / 2 + "px";
      c.el.style.marginTop = -cardH / 2 + "px";
    }
  }
  addEventListener("resize", resize);
  resize();

  // ---- interaction state ----
  let rot = 0, vel = BASE_SPEED, hovered = null;
  let yaw = 0, yawT = 0, pitch = 0, pitchT = 0;
  let dragging = false, dragMoved = false, lastX = 0, lastT = 0;

  stage.addEventListener("pointermove", (e) => {
    const b = stage.getBoundingClientRect();
    yawT = ((e.clientX - b.left) / b.width - 0.5) * 0.14;
    pitchT = ((e.clientY - b.top) / b.height - 0.5) * -40;
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    if (Math.abs(dx) > 2) dragMoved = true;
    const d = dx * 0.0035 / unit;
    rot += d;
    vel = d / Math.max(0.016, (now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true; dragMoved = false;
    lastX = e.clientX; lastT = performance.now();
    stage.classList.add("dragging");
  });
  const endDrag = () => { dragging = false; stage.classList.remove("dragging"); };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);
  stage.addEventListener("pointerleave", () => { yawT = 0; pitchT = 0; });

  // page scroll gives the ring a push
  let lastScroll = scrollY;
  addEventListener("scroll", () => {
    vel += (scrollY - lastScroll) * 0.004;
    lastScroll = scrollY;
  }, { passive: true });

  // only animate while visible
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);

  // ---- render loop ----
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (visible) {
      if (!dragging) {
        const target = hovered ? BASE_SPEED * 0.15 : BASE_SPEED;
        vel += (target - vel) * Math.min(1, dt * 2.2); // ease back to idle speed
        rot += vel * dt;
      }
      yaw += (yawT - yaw) * Math.min(1, dt * 3);
      pitch += (pitchT - pitch) * Math.min(1, dt * 3);
      render(dt);
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  function render(dt) {
    for (const c of cards) {
      const a = c.a + rot + yaw;
      const r = c.r * R;
      const cos = Math.cos(a);
      const depth = D - r * cos; // distance from camera: smallest at the front
      const el = c.el;
      c.hover += ((hovered === c ? 1 : 0) - c.hover) * Math.min(1, dt * 8);

      const x = r * Math.sin(a) * unit;
      const y = (c.y * bandGap + pitch) * unit;
      const z = (P - depth) * unit;
      const s = c.s * (1 + c.hover * 0.06);
      // front half faces outward (towards camera); back half is turned to face
      // the camera through the cylinder, so it never shows its back side
      const ry = cos >= 0 ? a : a + Math.PI;
      el.style.transform =
        `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${ry.toFixed(4)}rad) scale(${s.toFixed(3)})`;

      // depth of field: t = 0 at the very front, 1 at the very back
      const t = Math.max(0, (depth - FRONT) / (2 * R));
      let blur = Math.min(8, Math.max(0, t - 0.05) * 13) * (1 - c.hover);
      blur = Math.round(blur * 2) / 2;
      let op = 1 - 0.82 * Math.pow(Math.min(1, t), 0.85);
      op = Math.round(op * 50) / 50;
      const zi = Math.round(5000 - depth);

      if (blur !== c.blur) { el.style.filter = blur ? `blur(${blur}px)` : "none"; c.blur = blur; }
      if (op !== c.op) {
        el.style.opacity = op;
        el.style.visibility = op > 0 ? "visible" : "hidden";
        c.op = op;
      }
      if (zi !== c.z) { el.style.zIndex = zi; c.z = zi; }
    }
  }

  if (reduceMotion) render(0);
  else requestAnimationFrame(frame);

  // ---- lightbox ----
  const lb = document.querySelector(".lightbox");
  function openLightbox(item) {
    if (!lb) return;
    lb.querySelector("img").src = item.src;
    lb.querySelector("h3").textContent = item.title || "";
    lb.querySelector("p").textContent = item.caption || "";
    lb.showModal();
  }
  lb?.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
})();
