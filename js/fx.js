// ============================================================
//  Efeitos: confete, pingos de tinta, "+1" voando
// ============================================================
window.FX = (function () {
  const PAL = ["#FF3B5C", "#FFB800", "#2EE59D", "#3BA0FF", "#A45CFF", "#FF6AD5", "#00E1FF", "#FF7A2F", "#B6FF3B"];
  const fx = () => document.getElementById("fx");
  let parts = [], running = false;

  function sizeCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, W, H };
  }

  function loop() {
    const cv = fx(); if (!cv) return;
    const { c, W, H } = sizeCanvas(cv);
    c.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.life > 0 && p.y < H + 60);
    for (const p of parts) {
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      c.save(); c.globalAlpha = Math.min(1, p.life / 30);
      c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = p.color;
      if (p.shape === 0) c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else { c.beginPath(); c.arc(0, 0, p.s / 2.4, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; c.clearRect(0, 0, W, H); }
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }

  function confetti(x, y, opt = {}) {
    const n = opt.count || 120, colors = opt.colors || PAL, power = opt.power || 14, spread = opt.spread || Math.PI * 2, dir = opt.dir ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = power * (0.4 + Math.random() * 0.8);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.32, drag: 0.985, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        s: 8 + Math.random() * 10, color: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.7 ? 0 : 1, life: 140 + Math.random() * 80 });
    }
    kick();
  }
  function rain(colors, n = 220) {
    const W = window.innerWidth;
    for (let i = 0; i < n; i++) {
      parts.push({ x: Math.random() * W, y: -20 - Math.random() * 400, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, g: 0.12, drag: 0.99, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        s: 9 + Math.random() * 10, color: (colors || PAL)[(Math.random() * (colors || PAL).length) | 0], shape: Math.random() < 0.7 ? 0 : 1, life: 400 });
    }
    kick();
  }

  // ---------- pingos de tinta caindo ----------
  function blobPath(c, x, y, r, shape, k) {
    const n = shape.length;
    const pts = shape.map((m, i) => { const a = (i / n) * Math.PI * 2; return [x + Math.cos(a) * r * m * k, y + Math.sin(a) * r * m * k]; });
    c.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let m0 = mid(pts[n - 1], pts[0]);
    c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], m = mid(p, q); c.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
    c.closePath();
  }
  function paintRain(cv, opt = {}) {
    const dur = opt.duration || 1150;
    const { c, W, H } = sizeCanvas(cv);
    const big = Math.max(W, H);
    // distribui os pingos numa grade (com sorteio dentro de cada célula) para cobrir a tela toda, sem buracos
    const cols = Math.max(4, Math.round(W / 190)), rows = Math.max(3, Math.round(H / 190));
    const cw = W / cols, ch = H / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
    for (let i = cells.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const extra = 10;
    const N = cells.length + extra;
    const minR = Math.hypot(cw, ch) * 0.95;
    const drops = [];
    for (let i = 0; i < N; i++) {
      const cell = cells[i];
      const shape = []; const nn = 16;
      for (let j = 0; j < nn; j++) shape.push(0.82 + Math.random() * 0.36);
      const sats = []; const ns = 4 + ((Math.random() * 6) | 0);
      for (let j = 0; j < ns; j++) sats.push({ a: Math.random() * Math.PI * 2, d: 1.05 + Math.random() * 0.6, r: 0.04 + Math.random() * 0.1 });
      const speed = H * (2.8 + Math.random() * 1.8);
      const x = cell ? (cell[0] + 0.15 + Math.random() * 0.7) * cw : Math.random() * W;
      const landY = cell ? (cell[1] + 0.15 + Math.random() * 0.7) * ch : H * (0.04 + Math.random() * 0.94);
      const delay = Math.random() * 0.5 * (dur / 1150);
      const r = cell ? Math.max(minR, big * (0.07 + Math.random() * 0.08)) : big * (0.06 + Math.random() * 0.07);
      drops.push({ x, landY, delay, speed, r, color: PAL[(Math.random() * PAL.length) | 0], shape, sats, w: 9 + Math.random() * 9, landed: false, landT: delay + (landY + 80) / speed });
    }
    drops.sort((a, b) => a.landT - b.landT);
    const bgColor = opt.bg || "#1b1438";
    let soundCount = 0;
    const gen = (cv._gen = (cv._gen || 0) + 1);
    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        if (cv._gen !== gen) return resolve();
        const t = (now - t0) / 1000;
        c.clearRect(0, 0, W, H);
        // fundo que vai cobrindo a tela
        const bgA = Math.min(1, Math.max(0, (t - 0.45) / 0.4));
        if (bgA > 0) { c.globalAlpha = bgA; c.fillStyle = bgColor; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
        for (const d of drops) {
          const tl = t - d.delay; if (tl < 0) continue;
          const y = -80 + tl * d.speed;
          if (t < d.landT) {
            // gota caindo com rastro
            const g = c.createLinearGradient(d.x, y - d.w * 5, d.x, y);
            g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, d.color);
            c.fillStyle = g;
            c.beginPath(); c.ellipse(d.x, y - d.w * 2, d.w * 0.55, d.w * 3, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = d.color; c.beginPath(); c.arc(d.x, y, d.w, 0, Math.PI * 2); c.fill();
          } else {
            if (!d.landed) { d.landed = true; if (soundCount++ < 9 && opt.sound !== false) SFX.splat(); }
            const st = t - d.landT;
            const p = Math.min(1, st / 0.2);
            const k = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); // easeOutBack
            c.fillStyle = d.color;
            blobPath(c, d.x, d.landY, d.r, d.shape, Math.max(0, k));
            c.fill();
            for (const s of d.sats) {
              const sk = Math.max(0, Math.min(1, (st - 0.04) / 0.2));
              c.beginPath(); c.arc(d.x + Math.cos(s.a) * d.r * s.d * (0.6 + 0.4 * sk), d.landY + Math.sin(s.a) * d.r * s.d * (0.6 + 0.4 * sk), d.r * s.r * sk, 0, Math.PI * 2); c.fill();
            }
            // brilho
            c.fillStyle = "rgba(255,255,255,0.18)";
            c.beginPath(); c.arc(d.x - d.r * 0.3 * k, d.landY - d.r * 0.35 * k, d.r * 0.18 * Math.max(0, k), 0, Math.PI * 2); c.fill();
          }
        }
        // véu para o texto ficar legível
        const vA = Math.min(1, Math.max(0, (t - 0.7) / 0.4)) * 0.38;
        if (vA > 0) {
          const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, big * 0.7);
          g.addColorStop(0, `rgba(12,8,30,${vA})`); g.addColorStop(1, `rgba(12,8,30,${vA * 1.6})`);
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }
        if (t * 1000 < dur + 250) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
      setTimeout(() => resolve(), dur * 0.85); // libera o texto antes do fim da animação
    });
  }

  function flyText(text, from, to, onArrive) {
    const el = document.createElement("div");
    el.className = "plus1"; el.textContent = text;
    document.body.appendChild(el);
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = b.left + b.width / 2, ey = b.top + b.height / 2;
    const t0 = performance.now(), D = 900;
    function f(now) {
      const p = Math.min(1, (now - t0) / D);
      const e = p < 0.25 ? 0 : (p - 0.25) / 0.75;
      const ee = e * e * (3 - 2 * e);
      const x = sx + (ex - sx) * ee, y = sy + (ey - sy) * ee - Math.sin(ee * Math.PI) * 120 - (p < 0.25 ? p * 120 : 30);
      const s = p < 0.25 ? 0.4 + p * 3.2 : 1.2 - ee * 0.6;
      el.style.left = x + "px"; el.style.top = y + "px"; el.style.transform = `translate(-50%,-50%) scale(${s}) rotate(${(1 - ee) * -12}deg)`;
      if (p < 1) requestAnimationFrame(f); else { el.remove(); onArrive && onArrive(); }
    }
    requestAnimationFrame(f);
  }

  function flash() { const f = document.getElementById("flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }

  function clear() { parts.forEach((p) => (p.life = Math.min(p.life, 25))); }

  // ---------- respingos de tinta no fundo ----------
  function makeSplat(x, y, r, color, alpha, drips) {
    const shape = []; for (let j = 0; j < 14; j++) shape.push(0.78 + Math.random() * 0.4);
    const sats = []; const ns = 3 + ((Math.random() * 6) | 0);
    for (let j = 0; j < ns; j++) sats.push({ a: Math.random() * Math.PI * 2, d: 1.1 + Math.random() * 0.7, r: 0.05 + Math.random() * 0.12 });
    const dr = [];
    for (let j = 0; j < drips; j++) dr.push({ dx: (Math.random() - 0.5) * 1.1, len: 0.2 + Math.random() * 0.55, w: 0.13 + Math.random() * 0.08, bend: (Math.random() - 0.5) * 0.18 });
    return { x, y, r, color, alpha, shape, sats, dr };
  }
  // desenha o respingo inteiro opaco numa camada separada e depois aplica a transparência de uma vez
  // (assim gotas e escorridos se fundem com o respingo, sem "emendas" mais escuras)
  const off = document.createElement("canvas");
  function drawSplat(c, s, k = 1, aMul = 1) {
    const pad = s.r * 2.2 * k + 4;
    const bx = Math.floor(s.x - pad), by = Math.floor(s.y - pad), bw = Math.ceil(pad * 2), bh = Math.ceil(pad * 2 + s.r * 1.6 * k);
    if (off.width < bw || off.height < bh) { off.width = Math.max(off.width, bw); off.height = Math.max(off.height, bh); }
    const o = off.getContext("2d");
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, bw, bh);
    o.translate(-bx, -by);
    o.fillStyle = s.color;
    blobPath(o, s.x, s.y, s.r, s.shape, k); o.fill();
    for (const t of s.sats) { o.beginPath(); o.arc(s.x + Math.cos(t.a) * s.r * t.d * k, s.y + Math.sin(t.a) * s.r * t.d * k, s.r * t.r * k, 0, Math.PI * 2); o.fill(); }
    // escorridos: saem de dentro do respingo, descem curvinhos e terminam numa gota redonda
    for (const d of s.dr) {
      const w = s.r * d.w * k, x0 = s.x + d.dx * s.r * 0.55 * k, y0 = s.y + s.r * 0.25 * k;
      const L = s.r * (0.75 + d.len) * k, ex = x0 + d.bend * s.r * k, ey = y0 + L;
      o.beginPath();
      o.moveTo(x0 - w / 2, y0);
      o.bezierCurveTo(x0 - w / 2, y0 + L * 0.5, ex - w * 0.38, ey - L * 0.35, ex - w * 0.38, ey);
      o.lineTo(ex + w * 0.38, ey);
      o.bezierCurveTo(ex + w * 0.38, ey - L * 0.35, x0 + w / 2, y0 + L * 0.5, x0 + w / 2, y0);
      o.closePath(); o.fill();
      o.beginPath(); o.arc(ex, ey, w * 0.62, 0, Math.PI * 2); o.fill();
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    c.save(); c.globalAlpha = s.alpha * aMul;
    c.drawImage(off, 0, 0, bw, bh, bx, by, bw, bh);
    c.restore();
  }
  let bgState = null;
  function bgPaint(cv) {
    if (!cv) return;
    const layout = [];
    for (let i = 0; i < 16; i++) {
      // mais nas bordas, menos no meio
      let x = Math.random(), y = Math.random();
      if (Math.random() < 0.6) { if (Math.random() < 0.5) x = Math.random() < 0.5 ? Math.random() * 0.18 : 0.82 + Math.random() * 0.18; else y = Math.random() < 0.5 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2; }
      layout.push({ x, y, r: 0.05 + Math.random() * 0.09, color: PAL[(Math.random() * PAL.length) | 0], alpha: 0.1 + Math.random() * 0.1, drips: Math.random() < 0.55 ? 1 + ((Math.random() * 3) | 0) : 0 });
    }
    bgState = { cv, layout, base: null, plops: [], next: performance.now() + 1200, raf: 0 };
    const build = () => {
      const { W, H } = sizeCanvas(cv);
      const big = Math.max(W, H);
      bgState.splats = layout.map((l) => makeSplat(l.x * W, l.y * H, l.r * big, l.color, l.alpha, l.drips));
      bgState.W = W; bgState.H = H;
      drawBg();
    };
    window.addEventListener("resize", build);
    build();
    loopBg();
  }
  function drawBg() {
    const st = bgState; if (!st) return;
    const c = st.cv.getContext("2d");
    c.clearRect(0, 0, st.W, st.H);
    st.splats.forEach((s) => drawSplat(c, s));
    const now = performance.now();
    st.plops = st.plops.filter((p) => now - p.t0 < p.life);
    st.plops.forEach((p) => {
      const e = (now - p.t0) / 1000;
      const g = Math.min(1, e / 0.22), k = 1 + 2.7 * Math.pow(g - 1, 3) + 1.7 * Math.pow(g - 1, 2);
      const fade = Math.min(1, (p.life - (now - p.t0)) / 1800);
      drawSplat(c, p.s, Math.max(0, k), fade);
    });
  }
  function loopBg() {
    const st = bgState; if (!st) return;
    const now = performance.now();
    if (now > st.next && !document.hidden) {
      st.next = now + 2200 + Math.random() * 2600;
      const W = st.W, H = st.H, big = Math.max(W, H);
      st.plops.push({ t0: now, life: 7000, s: makeSplat(Math.random() * W, Math.random() * H, big * (0.025 + Math.random() * 0.045), PAL[(Math.random() * PAL.length) | 0], 0.16 + Math.random() * 0.1, Math.random() < 0.5 ? 1 + ((Math.random() * 2) | 0) : 0) });
    }
    if (st.plops.length) drawBg();
    setTimeout(() => requestAnimationFrame(loopBg), st.plops.some((p) => now - p.t0 < 400) ? 0 : 50);
  }

  return { PAL, confetti, rain, paintRain, flyText, flash, sizeCanvas, clear, bgPaint };
})();
