// 3D "floating cards" gallery: cards sit on a slowly rotating cylinder seen from outside.
// Cards swinging to the front come closer (bigger) and into focus; those going round the
// sides/back shrink, blur and fade. Hovering a card swings it to the centre and zooms it.
// Drag, scroll or move the mouse to steer. Items (js/gallery-data.js) can be images or
// muted looping videos of any aspect ratio.
(() => {
  const stage = document.querySelector("[data-gallery]");
  const items = window.GALLERY_ITEMS || [];
  if (!stage || !items.length) return;

  const TAU = Math.PI * 2;
  const BANDS = 2;          // horizontal rows of cards
  const PER_BAND = 8;       // cards per row around the full circle
  const COUNT = BANDS * PER_BAND;
  const BASE_SPEED = 0.045; // rad/s idle rotation
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Geometry in "design px" (1200px-wide stage), scaled by `unit`.
  const P = 1000;      // CSS perspective
  const R = 900;       // cylinder radius
  const D = 1500;      // camera distance from cylinder axis (outside the cylinder)
  const FRONT = D - R;  // depth of a card dead-centre in front: sharpest & biggest
  const CARD_AREA = 300 * 200; // every card has about the same area, whatever its shape
  const FRONT_BOOST = 0.3;  // extra magnification for the card passing dead-centre
  const HOVER_SCALE = 0.35; // extra magnification for the focused (hovered) card
  // Cards are laid out at their LARGEST on-screen size and only ever scaled down, so the
  // browser rasterises them sharply (scaling a small layer up is what makes it blurry).
  const K = (P / FRONT) * (1 + FRONT_BOOST) * (1 + HOVER_SCALE) * 1.1;

  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const cards = [];
  let tallest = 0;
  for (let i = 0; i < COUNT; i++) {
    const band = i % BANDS;
    const k = Math.floor(i / BANDS);
    // shift each row so neighbouring cards (across and between rows) differ
    const item = items[(k + band * Math.ceil(items.length / 2)) % items.length];
    const aspect = item.aspect || 1.5;
    const w = Math.sqrt(CARD_AREA * aspect), h = w / aspect;
    tallest = Math.max(tallest, h);

    const el = document.createElement("button");
    el.type = "button";
    el.className = item.type === "video" ? "g-card g-video" : "g-card";
    el.setAttribute("aria-label", item.title || "Gallery item");
    let video = null;
    if (item.type === "video") {
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      if (item.poster) video.poster = item.poster;
      el.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      el.appendChild(img);
    }
    const cap = document.createElement("span");
    cap.className = "g-cap";
    cap.textContent = item.title || "";
    el.appendChild(cap);
    stage.appendChild(el);

    const c = {
      el, item, video, w, h, playing: false,
      a: (k / PER_BAND) * TAU + band * (TAU / PER_BAND / BANDS) + (rand() - 0.5) * 0.12,
      r: 0.94 + rand() * 0.12,
      y: (band - (BANDS - 1) / 2) + (rand() - 0.5) * 0.12,
      s: 0.9 + rand() * 0.18,
      hover: 0, blur: -1, op: -1, z: -1,
    };
    el.addEventListener("pointerenter", (e) => onEnter(c, e));
    el.addEventListener("pointerleave", () => pending === c && (pending = null));
    el.addEventListener("focus", () => focusCard(c));
    el.addEventListener("click", () => {
      if (dragMoved) return;
      // on touch, the first tap brings a card to the centre, the second opens it
      if (lastPointerType === "touch" && focused !== c) return focusCard(c);
      openLightbox(item);
    });
    cards.push(c);
  }
  const bandGap = tallest * 1.22; // rows never overlap, even for tall covers

  // ---- layout ----
  let unit = 1;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    // fit the tallest, fully magnified front card (top row) inside the stage:
    // (row offset incl. jitter + half card at max random scale and boost), with a little margin
    const frontHalf = (bandGap * 0.56 + tallest * 0.5 * 1.08 * (1 + FRONT_BOOST)) * (P / FRONT);
    unit = Math.max(0.4, Math.min(1.25, w / 1200, (h / 2) * 0.94 / frontHalf));
    stage.style.perspective = P * unit + "px";
    for (const c of cards) {
      const cw = c.w * unit * K, ch = c.h * unit * K;
      c.el.style.width = cw + "px";
      c.el.style.height = ch + "px";
      c.el.style.marginLeft = -cw / 2 + "px";
      c.el.style.marginTop = -ch / 2 + "px";
    }
  }
  addEventListener("resize", resize);
  resize();

  // ---- interaction state ----
  let rot = 0, vel = BASE_SPEED;
  let yaw = 0, yawT = 0, pitch = 0, pitchT = 0;
  let dragging = false, dragMoved = false, lastX = 0, lastT = 0, lastPointerType = "mouse";
  // focus: the card brought to the centre. `pending` waits a moment (hover intent) so
  // merely sweeping the mouse across the ring doesn't yank it around.
  let focused = null, pending = null, pendingSince = 0, settled = true;

  function onEnter(c, e) {
    if (dragging || e.pointerType === "touch") return;
    pending = c;
    pendingSince = performance.now();
  }
  function focusCard(c) {
    focused = c;
    pending = null;
    settled = false;
    yawT = 0;
  }
  const release = () => { focused = null; pending = null; };

  stage.addEventListener("pointermove", (e) => {
    const b = stage.getBoundingClientRect();
    if (!focused) {
      yawT = ((e.clientX - b.left) / b.width - 0.5) * 0.14;
      pitchT = ((e.clientY - b.top) / b.height - 0.5) * -40;
    }
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    if (Math.abs(dx) > 2) { dragMoved = true; release(); }
    const d = dx * 0.0035 / unit;
    rot += d;
    vel = d / Math.max(0.016, (now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
  });
  stage.addEventListener("pointerdown", (e) => {
    lastPointerType = e.pointerType;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true; dragMoved = false;
    lastX = e.clientX; lastT = performance.now();
    stage.classList.add("dragging");
  });
  const endDrag = () => { dragging = false; stage.classList.remove("dragging"); };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);
  stage.addEventListener("pointerleave", () => { yawT = 0; pitchT = 0; release(); });

  // page scroll gives the ring a push
  let lastScroll = scrollY;
  addEventListener("scroll", () => {
    if (!focused) vel += (scrollY - lastScroll) * 0.004;
    lastScroll = scrollY;
  }, { passive: true });

  // only animate (and play videos) while visible
  let visible = true;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (!visible) for (const c of cards) setPlaying(c, false);
  }).observe(stage);

  // Videos only play while their card faces the front, so at most a few decode at once.
  function setPlaying(c, on) {
    if (!c.video || c.playing === on) return;
    c.playing = on;
    if (on) {
      if (!c.video.src) c.video.src = c.item.preview || c.item.src;
      c.video.play().catch(() => {});
    } else {
      c.video.pause();
    }
  }

  // ---- render loop ----
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (visible) {
      // hover intent: switch focus once the pointer has rested on a card briefly,
      // and not while the previous card is still swinging in
      if (pending && pending !== focused && settled && now - pendingSince > 90) focusCard(pending);

      if (focused) {
        // swing the focused card to dead-centre along the shortest way round
        const target = -focused.a + TAU * Math.round((rot + focused.a) / TAU);
        const diff = target - rot;
        rot += diff * Math.min(1, dt * 7);
        vel = 0;
        if (Math.abs(diff) < 0.02) settled = true;
      } else if (!dragging) {
        vel += (BASE_SPEED - vel) * Math.min(1, dt * 2.2); // ease back to idle speed
        rot += vel * dt;
        settled = true;
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
      c.hover += ((focused === c ? 1 : 0) - c.hover) * Math.min(1, dt * 7);

      const x = r * Math.sin(a) * unit;
      // the focused card also moves to the vertical centre, so its zoom never clips
      const y = (c.y * bandGap * (1 - 0.85 * c.hover) + pitch) * unit;
      const z = (P - depth) * unit;
      // smooth bump as the card passes the front (cos → 1)
      const f = Math.min(1, Math.max(0, (cos - 0.75) / 0.25));
      const boost = 1 + FRONT_BOOST * f * f * (3 - 2 * f);
      const s = (c.s * boost * (1 + c.hover * HOVER_SCALE)) / K;
      // front half faces outward (towards camera); back half is turned to face
      // the camera through the cylinder, so it never shows its back side
      const ry = cos >= 0 ? a : a + Math.PI;
      el.style.transform =
        `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${ry.toFixed(4)}rad) scale(${s.toFixed(4)})`;

      // depth of field: t = 0 at the very front, 1 at the very back.
      // (blur is applied before the scale-down, hence the larger px values)
      const t = Math.max(0, (depth - FRONT) / (2 * R));
      let blur = Math.min(10, Math.max(0, t - 0.12) * 16) * (1 - c.hover);
      blur = Math.round(blur);
      let op = 1 - 0.8 * Math.pow(Math.min(1, t), 0.85);
      op = Math.round(op * 50) / 50;
      const zi = c.hover > 0.05 ? 9000 : Math.round(5000 - depth);

      if (blur !== c.blur) { el.style.filter = blur ? `blur(${blur}px)` : "none"; c.blur = blur; }
      if (op !== c.op) {
        el.style.opacity = op;
        el.style.visibility = op > 0 ? "visible" : "hidden";
        c.op = op;
      }
      if (zi !== c.z) { el.style.zIndex = zi; c.z = zi; }
      const isF = focused === c;
      if (isF !== c.isF) { el.classList.toggle("is-focused", isF); c.isF = isF; }
      if (c.video && !reduceMotion) setPlaying(c, cos > 0.35);
    }
  }

  if (reduceMotion) render(0);
  else requestAnimationFrame(frame);

  // ---- lightbox ----
  const lb = document.querySelector(".lightbox");
  if (!lb) return;
  const lbImg = lb.querySelector("img");
  const lbVideo = lb.querySelector("video");
  const lbLink = lb.querySelector(".lb-link");
  function openLightbox(item) {
    const isVideo = item.type === "video";
    lbImg.hidden = isVideo;
    lbVideo.hidden = !isVideo;
    if (isVideo) {
      lbVideo.src = item.src;
      lbVideo.poster = item.poster || "";
      lbVideo.play().catch(() => {});
    } else {
      lbImg.src = item.src;
    }
    lb.querySelector("h3").textContent = item.title || "";
    lb.querySelector("p").textContent = item.caption || "";
    lbLink.hidden = !item.link;
    if (item.link) lbLink.href = item.link;
    lb.showModal();
  }
  lb.addEventListener("close", () => { lbVideo.pause(); lbVideo.removeAttribute("src"); lbVideo.load(); });
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
})();
