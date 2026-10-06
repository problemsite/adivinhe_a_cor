// ============================================================
//  ADIVINHE A COR — lógica da tela do jogador
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SLOTS = Game.SLOTS;

  // id deste navegador (no modo local é por aba, para testar 2 jogadores no mesmo PC)
  const idStore = DB.mode === "local" ? sessionStorage : localStorage;
  let cid = idStore.getItem("adc_cid");
  if (!cid) { cid = Math.random().toString(36).slice(2) + Date.now().toString(36); idStore.setItem("adc_cid", cid); }

  const S = {
    me: null, players: {}, game: { phase: "lobby" }, picks: {}, results: {}, imageIndex: {},
    screen: "loading", token: 0, viewKey: null, gotGame: false, gotPlayers: false,
    round: null, scoreOverride: null, finishing: null, leaving: false
  };
  const newToken = () => ++S.token;
  const alive = (t) => t === S.token;

  // ---------------- utilidades de UI ----------------
  function showScreen(name, instant) {
    $$(".screen").forEach((el) => {
      const on = el.id === "scr-" + name;
      if (instant) el.classList.add("instant");
      el.classList.toggle("show", on);
      if (instant) { void el.offsetWidth; el.classList.remove("instant"); }
    });
    S.screen = name;
  }
  function toast(msg, bad) {
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 3400);
  }
  window.addEventListener("db-error", (e) => toast(e.detail, true));

  function avatarHTML(p, k, cls = "") {
    const has = Game.hasPlayer(p);
    let inner;
    if (has && p.photo) inner = `<img src="${p.photo}" alt="">`;
    else if (has && p.name && p.name.trim()) inner = `<span>${esc(p.name.trim()[0].toUpperCase())}</span>`;
    else inner = `<span>${Game.slotLabel(k)}</span>`;
    return `<div class="avatar ${k} ${cls}">${inner}</div>`;
  }
  const nameOf = (k) => Game.displayName(S.players[k], k);
  const imageCount = () => Object.keys(S.imageIndex || {}).length;

  function letters(text, colors) {
    let i = 0;
    return text.split("").map((ch) => {
      if (ch === " ") return `<span class="sp"></span>`;
      const col = colors ? `style="--i:${i};color:${colors[i % colors.length]}"` : `style="--i:${i}"`;
      i++;
      return `<span class="ch" ${col}>${esc(ch)}</span>`;
    }).join("");
  }
  function buildTitle() {
    const a = "Adivinhe a".split("").map((ch, i) => ch === " " ? `<span class="sp"></span>` : `<span class="ch" style="--i:${i}">${ch}</span>`).join("");
    const cols = ["#FF3B5C", "#FFB800", "#3BA0FF"];
    const b = "COR".split("").map((ch, j) => `<span class="ch cor" style="--i:${10 + j};color:${cols[j]}">${ch}</span>`).join("");
    $("#title").innerHTML = a + `<span class="sp"></span>` + b;
  }

  // ---------------- LOBBY ----------------
  const slotSig = {};
  function renderLobby() {
    SLOTS.forEach((k) => {
      const el = $("#slot-" + k), p = S.players[k], has = Game.hasPlayer(p), mine = S.me === k;
      const g = S.game || {}, waitFinal = (g.phase || "lobby") !== "lobby";
      const wentBack = !!(S.back && S.back[g.seq] && S.back[g.seq][k]);
      const sig = JSON.stringify([has, p && p.name, p && p.photo && p.photo.length, p && p.ready, p && p.online, mine, !!S.me, waitFinal, wentBack]);
      if (slotSig[k] === sig) return;
      slotSig[k] = sig;
      const label = Game.slotLabel(k), num = k === "p1" ? 1 : 2;
      if (!has) {
        el.className = `slot ${k}`;
        el.innerHTML = `<div class="tag">JOGADOR ${num}</div>
          <div class="avatar empty"><span>${label}</span></div>
          <div class="name" style="opacity:.45">Vaga livre</div>
          <div class="state"></div>
          <div class="acts">${S.me ? "" : `<button class="btn ${k} small" data-join="${k}">ENTRAR COMO ${label}</button>`}</div>`;
      } else {
        el.className = `slot ${k} filled ${p.ready ? "ready" : ""}`;
        el.innerHTML = `<div class="tag">JOGADOR ${num}</div>
          ${DB.mode === "firebase" ? `<div class="online ${p.online !== false ? "on" : ""}" title="${p.online !== false ? "online" : "offline"}"></div>` : ""}
          ${mine ? `<div class="me-tag">VOCÊ</div>` : ""}
          ${avatarHTML(p, k)}
          <div class="name">${esc(nameOf(k))}</div>
          <div class="state">${waitFinal ? (wentBack ? "voltou ao lobby ✓" : `<span class="dots-anim">vendo o resultado</span>`) : p.ready ? `<span class="ready-badge">PRONTO!</span>` : `<span class="dots-anim">se preparando</span>`}</div>
          <div class="acts">${mine ? `<button class="btn ghost small" data-edit="1">✏️ Editar</button><button class="btn ghost small" data-leave="1">Sair</button>` : ""}</div>`;
      }
    });
    const rb = $("#readyBtn");
    if (S.me && (S.game.phase || "lobby") === "lobby") {
      const p = S.players[S.me];
      rb.style.display = "";
      rb.classList.toggle("on", !!p.ready);
      rb.textContent = p.ready ? "PRONTO! ✔ (clique p/ cancelar)" : "ESTOU PRONTO!";
    } else rb.style.display = "none";
    renderLobbyStatus();
  }
  function renderLobbyStatus() {
    const st = $("#lobbyStatus"); if (!st) return;
    const n = imageCount(), p = S.players;
    const h1 = Game.hasPlayer(p.p1), h2 = Game.hasPlayer(p.p2);
    let msg;
    const phNow = (S.game && S.game.phase) || "lobby";
    if (S.me && phNow === "final") {
      const other = S.me === "p1" ? "p2" : "p1";
      msg = `Esperando <b>${esc(nameOf(other))}</b> voltar ao lobby…`;
    } else if (!n) msg = "⚠️ O ADM ainda não cadastrou nenhuma imagem.";
    else if (!S.me && h1 && h2) msg = "Sala cheia — você está assistindo 👀";
    else if (!S.me) msg = "Escolha uma vaga para entrar!";
    else {
      const other = S.me === "p1" ? "p2" : "p1";
      if (!Game.hasPlayer(p[other])) msg = "Esperando o outro jogador entrar…";
      else if (p.p1.ready && p.p2.ready) msg = "<b>Os dois estão prontos! Começando…</b>";
      else if (!p[S.me].ready) msg = "Clique em <b>ESTOU PRONTO!</b> quando estiver preparado";
      else msg = `Esperando <b>${esc(nameOf(other))}</b> ficar pronto…`;
    }
    st.innerHTML = msg + (n ? ` · <b>${n}</b> ${n === 1 ? "rodada" : "rodadas"}` : "");
  }

  $(".slots").addEventListener("click", async (e) => {
    const j = e.target.closest("[data-join]"), ed = e.target.closest("[data-edit]"), lv = e.target.closest("[data-leave]");
    if (j) {
      const k = j.dataset.join; SFX.click();
      const r = await DB.txn("players/" + k, (cur) => {
        if (cur && cur.cid && cur.cid !== cid) return;
        return cur && cur.cid === cid ? cur : { cid, name: "", photo: "", ready: false, online: true, t: Date.now() };
      });
      if (!r.committed) { toast("Essa vaga já foi pega!", true); SFX.error(); return; }
      SFX.join();
      setTimeout(openProfile, 250);
    } else if (ed) { SFX.click(); openProfile(); }
    else if (lv) {
      SFX.click(); S.leaving = true;
      await DB.remove("players/" + S.me);
    }
  });
  $("#readyBtn").addEventListener("click", async () => {
    if (!S.me) return;
    const p = S.players[S.me];
    if (!p.ready && !imageCount()) { toast("O ADM precisa cadastrar imagens antes!", true); SFX.error(); return; }
    p.ready ? SFX.unready() : SFX.ready();
    await DB.update("players/" + S.me, { ready: !p.ready });
  });

  let autoTimer = null;
  function checkAutoStart() {
    const p = S.players;
    const ok = S.me && Game.hasPlayer(p.p1) && Game.hasPlayer(p.p2) && p.p1.ready && p.p2.ready && (S.game.phase || "lobby") === "lobby" && imageCount() > 0;
    if (ok && !autoTimer) {
      autoTimer = setTimeout(async () => {
        autoTimer = null;
        const pp = S.players;
        if (pp.p1 && pp.p1.ready && pp.p2 && pp.p2.ready && (S.game.phase || "lobby") === "lobby") {
          const r = await Game.startGame();
          if (!r.ok && r.reason) toast(r.reason, true);
        }
      }, S.me === "p1" ? 1300 : 2300);
    }
    if (!ok && autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  // ---------------- PERFIL (nome + foto com zoom/recorte) ----------------
  const Crop = { img: null, w: 0, h: 0, zoom: 1, base: 1, ox: 0, oy: 0, changed: false, removed: false };
  const cropEl = $("#crop"), cropImg = $("#cropImg");
  const V = () => cropEl.clientWidth;
  function cropPlaceholder() {
    const k = S.me || "p1", nm = $("#nameIn").value.trim();
    $("#cropPh").textContent = nm ? nm[0].toUpperCase() : Game.slotLabel(k);
  }
  function cropApply() {
    if (!Crop.img) { cropImg.style.display = "none"; $("#cropPh").style.display = ""; return; }
    cropImg.style.display = ""; $("#cropPh").style.display = "none";
    const v = V(), sc = Crop.base * Crop.zoom;
    Crop.ox = Math.min(0, Math.max(v - Crop.w * sc, Crop.ox));
    Crop.oy = Math.min(0, Math.max(v - Crop.h * sc, Crop.oy));
    cropImg.style.width = Crop.w + "px"; cropImg.style.height = Crop.h + "px";
    cropImg.style.transform = `translate(${Crop.ox}px, ${Crop.oy}px) scale(${sc})`;
  }
  function cropLoad(src, isNew) {
    const im = new Image();
    im.onload = () => {
      Crop.img = im; Crop.w = im.naturalWidth; Crop.h = im.naturalHeight;
      const v = V(); Crop.base = Math.max(v / Crop.w, v / Crop.h); Crop.zoom = 1; $("#zoom").value = 1;
      Crop.ox = (v - Crop.w * Crop.base) / 2; Crop.oy = (v - Crop.h * Crop.base) / 2;
      cropImg.src = src; Crop.removed = false; if (isNew) Crop.changed = true;
      cropApply();
    };
    im.src = src;
  }
  function setZoom(z) {
    const v = V(), old = Crop.base * Crop.zoom;
    Crop.zoom = Math.min(4, Math.max(1, z)); $("#zoom").value = Crop.zoom;
    const sc = Crop.base * Crop.zoom;
    const cx = (v / 2 - Crop.ox) / old, cy = (v / 2 - Crop.oy) / old;
    Crop.ox = v / 2 - cx * sc; Crop.oy = v / 2 - cy * sc; Crop.changed = true;
    cropApply();
  }
  $("#zoom").addEventListener("input", (e) => { if (Crop.img) setZoom(+e.target.value); });
  cropEl.addEventListener("wheel", (e) => { if (!Crop.img) return; e.preventDefault(); setZoom(Crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  let drag = null;
  cropEl.addEventListener("pointerdown", (e) => {
    if (!Crop.img) { $("#fileIn").click(); return; }
    drag = { x: e.clientX, y: e.clientY, ox: Crop.ox, oy: Crop.oy }; cropEl.setPointerCapture(e.pointerId); cropEl.classList.add("dragging");
  });
  cropEl.addEventListener("pointermove", (e) => { if (!drag) return; Crop.ox = drag.ox + e.clientX - drag.x; Crop.oy = drag.oy + e.clientY - drag.y; Crop.changed = true; cropApply(); });
  const endDrag = () => { drag = null; cropEl.classList.remove("dragging"); };
  cropEl.addEventListener("pointerup", endDrag); cropEl.addEventListener("pointercancel", endDrag);
  $("#pickPhoto").addEventListener("click", () => { SFX.click(); $("#fileIn").click(); });
  $("#fileIn").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => cropLoad(rd.result, true); rd.readAsDataURL(f);
    e.target.value = "";
  });
  $("#rmPhoto").addEventListener("click", () => { SFX.click(); Crop.img = null; Crop.removed = true; Crop.changed = true; cropPlaceholder(); cropApply(); });
  $("#nameIn").addEventListener("input", cropPlaceholder);
  $("#nameIn").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pfSave").click(); });
  function openProfile() {
    if (!S.me) return;
    const p = S.players[S.me] || {};
    $("#pfTitle").textContent = `Perfil — Jogador ${S.me === "p1" ? 1 : 2}`;
    cropEl.style.setProperty("--pc", S.me === "p1" ? "var(--p1)" : "var(--p2)");
    $("#nameIn").value = p.name || "";
    Crop.img = null; Crop.changed = false; Crop.removed = false; Crop.zoom = 1; $("#zoom").value = 1;
    cropPlaceholder(); cropApply();
    $("#profileModal").classList.add("on");
    if (p.photo) setTimeout(() => cropLoad(p.photo, false), 60);
    setTimeout(() => $("#nameIn").focus(), 200);
  }
  const closeProfile = () => $("#profileModal").classList.remove("on");
  $("#pfCancel").addEventListener("click", () => { SFX.click(); closeProfile(); });
  $("#pfSave").addEventListener("click", async () => {
    if (!S.me) return closeProfile();
    const p = S.players[S.me] || {};
    let photo = p.photo || "";
    if (Crop.removed && !Crop.img) photo = "";
    else if (Crop.img && Crop.changed) {
      const out = document.createElement("canvas"); out.width = out.height = 256;
      const c = out.getContext("2d"), v = V(), sc = Crop.base * Crop.zoom;
      c.fillStyle = "#fff"; c.fillRect(0, 0, 256, 256);
      c.setTransform(256 / v, 0, 0, 256 / v, 0, 0);
      c.drawImage(Crop.img, Crop.ox, Crop.oy, Crop.w * sc, Crop.h * sc);
      photo = out.toDataURL("image/jpeg", 0.86);
    }
    const name = $("#nameIn").value.trim().slice(0, 16);
    await DB.update("players/" + S.me, { name, photo });
    SFX.pop(); closeProfile();
  });

  // ---------------- SELETOR DE COR (3 barras: matiz, saturação, brilho) ----------------
  const Pk = { h: 0, s: 0, v: 0.5, hex: "#7F7F7F", enabled: true, off: 0 };
  const barH = $("#barH"), barS = $("#barS"), barB = $("#barB");
  const rgbCss = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  function pkPaint() {
    const kt = (t) => `calc(var(--u)*2.2 + (100% - var(--u)*4.4) * ${t})`;
    barH.querySelector(".knob").style.top = kt(((((Pk.h - Pk.off) % 360) + 360) % 360) / 360);
    barS.querySelector(".knob").style.top = kt(1 - Pk.s);
    barB.querySelector(".knob").style.top = kt(1 - Pk.v);
    barS.style.background = `linear-gradient(to bottom, ${rgbCss(Color.hsvToRgb(Pk.h, 1, Pk.v))}, ${rgbCss(Color.hsvToRgb(Pk.h, 0, Pk.v))})`;
    barB.style.background = `linear-gradient(to bottom, ${rgbCss(Color.hsvToRgb(Pk.h, Pk.s, 1))}, #000)`;
    const sw = $("#swatch");
    sw.style.background = Pk.hex;
    const rgb = Color.hexToRgb(Pk.hex);
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    sw.classList.toggle("light", lum > 0.62);
  }
  function pkSetHex(hex, silent) {
    const rgb = Color.hexToRgb(hex); if (!rgb) return false;
    const [h, s, v] = Color.rgbToHsv(rgb[0], rgb[1], rgb[2]);
    if (s > 0.001 && v > 0.001) Pk.h = h;
    Pk.s = s; Pk.v = v; Pk.hex = Color.rgbToHex(rgb[0], rgb[1], rgb[2]);
    pkPaint();
    if (!silent) onPickChange();
    return true;
  }
  function pkFromHSV() {
    const rgb = Color.hsvToRgb(Pk.h, Pk.s, Pk.v);
    Pk.hex = Color.rgbToHex(rgb[0], rgb[1], rgb[2]);
    pkPaint(); onPickChange();
  }
  function dragBar(el, fn) {
    let on = false;
    const at = (e) => {
      const r = el.getBoundingClientRect(), pad = el.querySelector(".knob").offsetHeight * 0.61;
      fn(Math.min(1, Math.max(0, (e.clientY - r.top - pad) / (r.height - pad * 2))));
    };
    el.addEventListener("pointerdown", (e) => { if (!Pk.enabled) return; on = true; el.setPointerCapture(e.pointerId); el.classList.add("drag"); SFX.tick(); at(e); });
    el.addEventListener("pointermove", (e) => { if (on) at(e); });
    const up = () => { on = false; el.classList.remove("drag"); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  dragBar(barH, (y) => { Pk.h = (Pk.off + Math.min(359.9, y * 360)) % 360; pkFromHSV(); });
  // o arco-íris começa num ponto sorteado a cada round (nada de decorar a posição das cores)
  function setHueOffset(off) {
    Pk.off = off;
    const stops = [];
    for (let i = 0; i <= 12; i++) stops.push(`hsl(${(off + i * 30) % 360}, 100%, 50%) ${(i / 12) * 100}%`);
    barH.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
  }
  setHueOffset(0);
  dragBar(barS, (y) => { Pk.s = 1 - y; pkFromHSV(); });
  dragBar(barB, (y) => { Pk.v = 1 - y; pkFromHSV(); });
  // roda do mouse = ajuste fino
  [[barH, "h", 360, -1], [barS, "s", 1, 1], [barB, "v", 1, 1]].forEach(([el, k, max, dir]) => {
    el.addEventListener("wheel", (e) => {
      if (!Pk.enabled) return; e.preventDefault();
      const step = (e.deltaY < 0 ? 1 : -1) * dir * max * 0.006;
      Pk[k] = k === "h" ? (Pk.h + step + 360) % 360 : Math.min(1, Math.max(0, Pk[k] + step));
      pkFromHSV();
    }, { passive: false });
  });

  let renderQueued = false, lastWrite = 0, writeTimer = null, pulseT = 0;
  function onPickChange() {
    if (!S.round) return;
    S.round.hex = Pk.hex; S.round.touched = true;
    queueRender();
    const now = performance.now();
    if (S.me && !S.round.ready) {
      clearTimeout(writeTimer);
      const wait = 160 - (now - lastWrite);
      if (wait <= 0) writePick(); else writeTimer = setTimeout(writePick, wait);
    }
  }
  function writePick() {
    if (!S.me || !S.round || S.round.ready) return;
    lastWrite = performance.now();
    DB.set(`picks/${S.round.seq}/${S.round.r}/${S.me}`, { hex: S.round.hex, ready: false, touched: !!S.round.touched, t: Date.now() });
  }
  function queueRender() {
    if (renderQueued) return; renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const R = S.round; if (!R || !R.rec) return;
      const cv = $("#playCanvas");
      const key = R.seq + "_" + R.r + "_" + JSON.stringify(frameOf(R.id));
      if (cv.width !== R.rec.w || cv.height !== R.rec.h) { cv.width = R.rec.w; cv.height = R.rec.h; }
      cv.getContext("2d").drawImage(R.rec.render(R.hex), 0, 0);
      if (cv._key !== key) { cv._key = key; Recolor.fit(cv, R.rec, frameOf(R.id)); } else Recolor.backdrop(cv);
    });
  }
  function applyPanelState() {
    const pnl = $("#picker"), R = S.round;
    pnl.classList.toggle("spect", !S.me);
    pnl.classList.toggle("locked", !!(S.me && R && R.ready));
    Pk.enabled = !!(S.me && R && !R.ready);
    const other = S.me === "p1" ? "p2" : "p1";
    $("#waitTxt").textContent = S.me ? `Esperando ${nameOf(other)}` : "";
  }
  async function setReady(v) {
    if (!S.me || !S.round || S.game.phase !== "round") return;
    clearTimeout(writeTimer);
    S.round.ready = v;
    applyPanelState();
    await DB.set(`picks/${S.round.seq}/${S.round.r}/${S.me}`, { hex: S.round.hex, ready: v, touched: !!S.round.touched, t: Date.now() });
    if (v) {
      SFX.ready();
      const b = $("#picker").getBoundingClientRect();
      FX.confetti(b.right - 70, b.bottom - 70, { count: 60, colors: [S.round.hex, "#ffffff", S.round.hex], power: 12 });
    } else SFX.unready();
  }
  // "Tem certeza?" — depois de confirmar não dá mais pra mudar
  const cfModal = $("#confirmModal");
  function openConfirm() {
    if (!S.me || !S.round || S.round.ready || S.game.phase !== "round") return;
    $("#cfSw").style.background = Pk.hex;
    cfModal.classList.add("on"); SFX.pop();
  }
  function closeConfirm() { cfModal.classList.remove("on"); }
  $("#doneBtn").addEventListener("click", openConfirm);
  $("#cfNo").addEventListener("click", () => { SFX.click(); closeConfirm(); });
  $("#cfYes").addEventListener("click", () => { closeConfirm(); setReady(true); });
  cfModal.addEventListener("click", (e) => { if (e.target === cfModal) closeConfirm(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeConfirm(); });

  // ---------------- mini placar ----------------
  function scoresNow() { return S.scoreOverride || Game.scores(S.results, S.game.seq); }
  function renderMinis(prefix) {
    const sc = scoresNow();
    SLOTS.forEach((k) => {
      const el = $(`#${prefix}-${k}`); if (!el) return;
      let st = "", ok = false;
      if (prefix === "pm") {
        const pk = S.picks && S.picks[k];
        if (pk && pk.ready) { st = "PRONTO ✓"; ok = true; } else st = `<span class="dots-anim">escolhendo</span>`;
      } else st = k === S.me ? "você" : "";
      el.innerHTML = `${avatarHTML(S.players[k], k)}<div class="info"><div class="nm">${esc(nameOf(k))}</div><div class="st ${ok ? "ok" : ""}">${st}</div></div><div class="sc">${sc[k]}</div>`;
    });
  }
  function renderAllMinis() { if (S.screen === "play") renderMinis("pm"); if (S.screen === "reveal") renderMinis("rm"); }

  // ---------------- dados das imagens ----------------
  const frameOf = (id) => (S.imageIndex[id] && S.imageIndex[id].frame) || null;
  const imgCache = {};
  function loadImage(id) {
    const rev = (S.imageIndex[id] && S.imageIndex[id].rev) || 0;
    const key = id + ":" + rev;
    if (!imgCache[key]) {
      imgCache[key] = DB.get("images/" + id).then((d) => {
        if (!d) throw new Error("imagem não encontrada");
        return Recolor.load(d.src, d.mask, d.hex).then((rec) => { rec.hex = d.hex; rec.name = d.name; return rec; });
      });
      imgCache[key].catch(() => { delete imgCache[key]; });
    }
    return imgCache[key];
  }

  // ---------------- overlays ----------------
  function hideOverlays() {
    $("#intro").classList.remove("on", "out");
    const s = $("#suspense"); s.classList.remove("on", "dim", "out");
  }
  async function playIntro(o) {
    const ov = $("#intro");
    ov.classList.remove("out"); ov.classList.add("on");
    const icR = $("#icRound"), icS = $("#icSub"), icP = $("#icPlayers"), icL = $("#icLead");
    icR.className = "ic-round"; icS.className = "ic-sub"; icL.className = "ic-lead";
    icR.textContent = o.title; icS.textContent = o.sub || ""; icS.style.display = o.sub ? "" : "none";
    icL.textContent = "";
    if (o.players) {
      const sc = o.scores, lead = sc.p1 > sc.p2 ? "p1" : sc.p2 > sc.p1 ? "p2" : null;
      icP.innerHTML = SLOTS.map((k, i) => `${i === 1 ? `<div class="ic-vs">VS</div>` : ""}<div class="ic-p ${k} ${lead === k ? "lead" : ""}">${avatarHTML(S.players[k], k)}<div><div class="nm">${esc(nameOf(k))}</div><div class="pt">${sc[k]} <small style="font-size:.4em">pts</small></div></div></div>`).join("");
      icL.textContent = lead ? `${nameOf(lead)} está na frente!` : o.r === 0 ? "Que comece a disputa!" : `Empatados em ${sc.p1} a ${sc.p2}!`;
    } else icP.innerHTML = "";
    SFX.whoosh();
    await FX.paintRain($("#introCanvas"), { duration: 1100 });
    if (!alive(o.tok)) return;
    icR.classList.add("slam"); SFX.slam();
    await sleep(330); if (!alive(o.tok)) return;
    if (o.sub) { icS.classList.add("pop"); SFX.pop(); }
    if (o.players) {
      await sleep(380); if (!alive(o.tok)) return;
      $(".ic-p.p1").classList.add("in"); SFX.whoosh();
      await sleep(140); $(".ic-vs").classList.add("in"); $(".ic-p.p2").classList.add("in");
      await sleep(520); if (!alive(o.tok)) return;
      icL.classList.add("in"); SFX.pop();
      await sleep(1250);
    } else await sleep(900);
  }
  async function introOut(tok) {
    const ov = $("#intro");
    ov.classList.add("out");
    await sleep(580);
    if (alive(tok)) ov.classList.remove("on", "out");
  }

  // ---------------- FLUXO ----------------
  let picksOff = null, picksKey = null;
  function subscribePicks(key) {
    if (key === picksKey) return;
    if (picksOff) picksOff();
    picksKey = key; S.picks = {};
    if (!key) { picksOff = null; return; }
    picksOff = DB.on("picks/" + key, (v) => { const prev = S.picks; S.picks = v || {}; onPicks(prev); });
  }
  function onPicks(prev) {
    const R = S.round;
    // restaura a escolha depois de recarregar a página
    if (R && !R.restored && S.me && R.seq === S.game.seq && R.r === S.game.round) {
      R.restored = true;
      const mine = S.picks[S.me];
      if (mine) { R.hex = mine.hex || R.hex; R.ready = !!mine.ready; R.touched = !!mine.touched; if (S.screen === "play") { pkSetHex(R.hex, true); queueRender(); applyPanelState(); } }
    }
    // som quando o outro fica pronto
    SLOTS.forEach((k) => {
      if (k !== S.me && S.picks[k] && S.picks[k].ready && !(prev[k] && prev[k].ready) && S.screen === "play") SFX.pop();
    });
    if (S.screen === "play") {
      const before = JSON.stringify(SLOTS.map((k) => !!(prev[k] && prev[k].ready)));
      const now = JSON.stringify(SLOTS.map((k) => !!(S.picks[k] && S.picks[k].ready)));
      if (before !== now) {
        renderMinis("pm");
        SLOTS.forEach((k) => { if (S.picks[k] && S.picks[k].ready && !(prev[k] && prev[k].ready)) { const el = $("#pm-" + k); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); } });
      }
    }
    // revelação: confirmação dos dois para seguir
    if (S.game.phase === "reveal") {
      SLOTS.forEach((k) => { if (k !== S.me && S.picks[k] && S.picks[k].next && !(prev[k] && prev[k].next) && S.revealDone) SFX.pop(); });
      renderConfirm();
      const g2 = S.game;
      if (S.me && S.picks.p1 && S.picks.p1.next && S.picks.p2 && S.picks.p2.next) {
        const key = "n" + g2.seq + "_" + g2.round;
        if (S.advancing !== key) {
          S.advancing = key;
          setTimeout(() => Game.nextRound(g2.seq, g2.round).catch(console.error), S.me === "p1" ? 60 : 800);
        }
      }
    }
    // os dois prontos -> revela
    const g = S.game;
    if (g.phase === "round" && S.me && S.picks.p1 && S.picks.p1.ready && S.picks.p2 && S.picks.p2.ready) {
      const key = g.seq + "_" + g.round;
      if (S.finishing !== key) {
        S.finishing = key;
        setTimeout(() => Game.finishRound(g.seq, g.round).catch(console.error), S.me === "p1" ? 60 : 800);
      }
    }
  }

  function route() {
    if (!S.gotGame || !S.gotPlayers) return;
    const g = S.game || {}, ph = g.phase || "lobby";
    subscribePicks(ph === "round" || ph === "reveal" ? `${g.seq}/${g.round}` : null);
    if (ph === "lobby" || iWentBack()) {
      if (S.viewKey !== "lobby") { S.viewKey = "lobby"; goLobby(); }
      else if (S.screen === "lobby") renderLobby();
      return;
    }
    const key = ph + "_" + g.seq + "_" + (ph === "final" ? "" : g.round);
    if (S.viewKey === key) return;
    S.viewKey = key;
    if (ph === "round") startRound(g);
    else if (ph === "reveal") startReveal(g);
    else if (ph === "final") startFinal(g);
  }

  function goLobby() {
    newToken(); hideOverlays(); FX.clear(); closeConfirm();
    S.round = null; S.scoreOverride = null;
    Object.keys(slotSig).forEach((k) => delete slotSig[k]);
    renderLobby();
    showScreen("lobby");
  }

  async function startRound(g) {
    const tok = newToken();
    const seq = g.seq, r = g.round, total = g.total || (g.order || []).length, id = (g.order || [])[r];
    S.scoreOverride = null;
    const target = (S.imageIndex[id] && S.imageIndex[id].hex) || "#808080";
    S.round = { seq, r, id, rec: null, hex: (g.starts && g.starts[r]) || Game.farColor(target), ready: false, touched: false, restored: false, hueOff: 0 };
    const recP = loadImage(id);
    recP.catch(() => {});
    if (g.order && g.order[r + 1]) loadImage(g.order[r + 1]).catch(() => {});
    $("#suspense").classList.remove("on", "dim", "out");
    await playIntro({ title: `ROUND ${r + 1}`, sub: `de ${total}`, players: true, scores: Game.scores(S.results, seq), tok, r });
    if (!alive(tok)) return;
    await Promise.race([recP.catch(() => null), sleep(2500)]);
    if (!alive(tok)) return;
    // monta a tela de jogo por baixo da cortina
    $("#playRound").textContent = `ROUND ${r + 1} de ${total}`;
    renderMinis("pm");
    $("#imgCard").classList.add("loading");
    setHueOffset(S.round.hueOff);
    pkSetHex(S.round.hex, true);
    // grava a cor inicial (se o jogador nem mexer, é ela que vale)
    if (S.me && !S.round.ready && !S.round.touched) {
      const mine = S.picks && S.picks[S.me];
      if (!mine) DB.set(`picks/${seq}/${r}/${S.me}`, { hex: S.round.hex, ready: false, touched: false, t: Date.now() });
    }
    applyPanelState();
    showScreen("play", true);
    const show = (rec) => {
      if (!alive(tok) || !rec) return;
      S.round.rec = rec;
      $("#imgCard").classList.remove("loading");
      queueRender();
    };
    recP.then(show).catch((e) => toast("Erro ao carregar a imagem: " + e.message, true));
    await introOut(tok);
  }

  async function startReveal(g) {
    const tok = newToken();
    const seq = g.seq, r = g.round, total = g.total || (g.order || []).length, id = (g.order || [])[r];
    clearTimeout(writeTimer); closeConfirm();
    if (S.round && S.round.seq === seq && S.round.r === r) S.round.ready = true;
    else S.round = { seq, r, id, ready: true, restored: true, hex: "#7F7F7F" };
    applyPanelState();
    $("#intro").classList.remove("on", "out");
    // espera o resultado
    let res = null;
    for (let i = 0; i < 40 && alive(tok); i++) { res = S.results && S.results[seq] && S.results[seq][r]; if (res) break; await sleep(100); }
    if (!res) res = await DB.get(`results/${seq}/${r}`);
    if (!alive(tok) || !res) return;
    const rec = await loadImage(id).catch(() => null);
    if (!alive(tok)) return;

    // placar antes deste round
    const full = Game.scores(S.results, seq);
    const before = { p1: full.p1, p2: full.p2 };
    if (res.winner === "p1" || res.winner === "tie") before.p1 = Math.max(0, before.p1 - 1);
    if (res.winner === "p2" || res.winner === "tie") before.p2 = Math.max(0, before.p2 - 1);
    S.scoreOverride = before;

    // SUSPENSE
    const sus = $("#suspense"), ring = $("#susRing");
    ring.classList.remove("fast");
    sus.classList.remove("out", "dim"); sus.classList.add("on");
    requestAnimationFrame(() => sus.classList.add("dim"));
    SFX.drumroll(2.7);
    await sleep(1700); if (!alive(tok)) return;
    ring.classList.add("fast");
    await sleep(1050); if (!alive(tok)) return;

    // monta a tela de revelação
    $("#revRound").textContent = `ROUND ${r + 1} de ${total}`;
    renderMinis("rm");
    const card = (kind) => {
      const isO = kind === "orig";
      const d = isO ? { hex: res.target } : res[kind];
      const rgb = Color.hexToRgb(d.hex);
      const who = isO ? `<b>⭐ ORIGINAL</b>` : `${avatarHTML(S.players[kind], kind)}<b>${esc(nameOf(kind))}</b>`;
      return `<div class="rwrap ${kind}" id="rw-${kind}">
        <div class="crown">👑</div>
        ${isO || d.dE < 25 ? "" : `<div class="lose-tag">ficou longe… 😵</div>`}
        <div class="rcard" id="rc-${kind}">
        <div class="face">
          <div class="who">${who}</div>
          <div class="pic"><canvas></canvas></div>
          <div class="data">
            <div class="chip" style="background:${d.hex}"></div>
            <div class="codes"><div class="hex">${d.hex}</div><div class="rgb">${Color.rgbStr(rgb)}</div></div>
            ${isO ? "" : `<div class="acc"><div class="pct">${String(d.acc).replace(".", ",")}%</div><div class="de">${closeLabel(d.dE)}</div></div>`}
          </div>
          ${isO ? "" : `<div class="bar"><i></i></div>`}
        </div>
        <div class="back">?</div>
        </div>
      </div>`;
    };
    $("#revealRow").innerHTML = card("p1") + card("orig") + card("p2");
    if (rec) {
      rec.renderTo($("#rc-p1 canvas"), res.p1.hex);
      rec.renderTo($("#rc-p2 canvas"), res.p2.hex);
      rec.drawOriginal($("#rc-orig canvas"));
      ["p1", "orig", "p2"].forEach((k) => Recolor.fit($(`#rc-${k} canvas`), rec, frameOf(id)));
    }
    const vd = $("#verdict"); vd.className = "verdict"; vd.innerHTML = "";
    const nb = $("#nextBtn"); nb.classList.remove("show", "waiting-other");
    S.revealDone = false;
    nb.dataset.label = r + 1 >= total ? "VER RESULTADO FINAL 🏆" : "PRÓXIMO ROUND ▶";
    nb.textContent = nb.dataset.label;
    nb.style.display = S.me ? "" : "none";
    $("#confirmRow").innerHTML = "";
    showScreen("reveal", true);
    sus.classList.add("out");
    setTimeout(() => { if (alive(tok)) sus.classList.remove("on", "dim", "out"); }, 520);

    const c1 = $("#rc-p1"), c0 = $("#rc-orig"), c2 = $("#rc-p2");
    ["p1", "orig", "p2"].forEach((k, i) => setTimeout(() => $("#rw-" + k).classList.add("in"), i * 110));
    SFX.whoosh();
    await sleep(500); if (!alive(tok)) return;
    [c1, c2].forEach((c) => c.classList.add("shake"));
    await sleep(450); if (!alive(tok)) return;
    c1.classList.remove("shake"); c1.classList.add("flipped"); SFX.flip();
    await sleep(750); if (!alive(tok)) return;
    c2.classList.remove("shake"); c2.classList.add("flipped"); SFX.flip();
    await sleep(800); if (!alive(tok)) return;
    vd.innerHTML = `E a cor original é… <small>🥁</small>`; vd.classList.add("show");
    c0.classList.add("shake"); SFX.drumroll(0.9);
    await sleep(1000); if (!alive(tok)) return;
    c0.classList.remove("shake"); c0.classList.add("flipped"); SFX.reveal(); FX.flash();
    vd.innerHTML = `${res.target}! <small>${Color.rgbStr(Color.hexToRgb(res.target))}</small>`;
    await sleep(900); if (!alive(tok)) return;
    vd.classList.remove("show");
    // precisão
    ["p1", "p2"].forEach((k) => {
      const c = $("#rc-" + k);
      c.querySelector(".acc").classList.add("show");
      c.querySelector(".bar i").style.width = res[k].acc + "%";
    });
    SFX.pop();
    await sleep(1200); if (!alive(tok)) return;

    // vencedor
    const W = res.winner;
    const winners = W === "tie" ? ["p1", "p2"] : [W];
    if (W !== "tie") { $("#rw-" + (W === "p1" ? "p2" : "p1")).classList.add("lose"); }
    winners.forEach((k) => {
      const c = $("#rw-" + k); c.classList.add("win");
      const b = c.getBoundingClientRect();
      FX.confetti(b.left + b.width / 2, b.top + b.height * 0.4, { count: 110, colors: [res[k].hex, k === "p1" ? "#3b82f6" : "#ef4444", "#ffc531", "#ffffff"], power: 16 });
    });
    if (W === "tie") {
      SFX.tie();
      vd.innerHTML = `EMPATE! Os dois pontuam 🤝<small>Os dois ficaram exatamente à mesma distância da cor original.</small>`;
    } else {
      SFX.win();
      const L = W === "p1" ? "p2" : "p1";
      vd.innerHTML = `${esc(nameOf(W))} ganhou o round! 🎉<small>Precisão de ${String(res[W].acc).replace(".", ",")}% contra ${String(res[L].acc).replace(".", ",")}% de ${esc(nameOf(L))}</small>`;
    }
    await sleep(250); if (!alive(tok)) return;
    vd.classList.add("show");
    let arrived = 0;
    winners.forEach((k) => {
      FX.flyText("+1", $("#rc-" + k), $(`#rm-${k} .sc`), () => {
        if (!alive(tok)) return;
        S.scoreOverride[k] += 1;
        if (++arrived === winners.length) S.scoreOverride = null;
        renderMinis("rm");
        const el = $("#rm-" + k); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
        SFX.ready();
      });
    });
    await sleep(1300); if (!alive(tok)) return;
    S.revealDone = true;
    nb.classList.add("show");
    renderConfirm();
  }

  // texto fácil de entender no lugar do número técnico (ΔE)
  function closeLabel(dE) {
    if (dE < 1) return "IDÊNTICA! 🤯";
    if (dE < 3) return "quase igual!";
    if (dE < 10) return "bem perto";
    if (dE < 25) return "mais ou menos";
    return "bem longe…";
  }
  // ---- os dois precisam confirmar para seguir ----
  function renderConfirm() {
    if (S.screen !== "reveal" || !S.revealDone) return;
    const row = $("#confirmRow"), nb = $("#nextBtn");
    row.innerHTML = SLOTS.map((k) => {
      const ok = !!(S.picks[k] && S.picks[k].next);
      return `<span class="cchip ${ok ? "ok" : ""}">${avatarHTML(S.players[k], k)}${esc(nameOf(k))} ${ok ? "✔ confirmou" : "⏳ aguardando"}</span>`;
    }).join("");
    if (S.me) {
      const mine = !!(S.picks[S.me] && S.picks[S.me].next);
      const other = S.me === "p1" ? "p2" : "p1";
      nb.classList.toggle("waiting-other", mine);
      nb.textContent = mine ? `✔ CONFIRMADO — esperando ${nameOf(other)}` : nb.dataset.label;
    }
  }
  $("#nextBtn").addEventListener("click", async () => {
    const g = S.game; if (g.phase !== "reveal" || !S.me) return;
    const mine = !!(S.picks[S.me] && S.picks[S.me].next);
    SFX.click();
    await DB.update(`picks/${g.seq}/${g.round}/${S.me}`, { next: !mine });
  });

  async function startFinal(g) {
    const tok = newToken();
    const seq = g.seq, total = g.total || (g.order || []).length;
    S.scoreOverride = null;
    $("#suspense").classList.remove("on", "dim", "out");
    await playIntro({ title: "FIM DE JOGO!", sub: "", players: false, tok });
    if (!alive(tok)) return;
    const sc = Game.scores(S.results, seq);
    const champ = sc.p1 > sc.p2 ? "p1" : sc.p2 > sc.p1 ? "p2" : null;
    $("#finalTitle").innerHTML = letters(champ ? "TEMOS UM CAMPEÃO!" : "DEU EMPATE!", ["#FFB800", "#FF3B5C", "#3BA0FF", "#2EE59D", "#A45CFF", "#FF6AD5"]);
    const pod = (k) => {
      const isC = champ ? k === champ : true;
      return `<div class="pod ${isC ? "champ" : "loser"}">${isC ? `<div class="crown2">👑</div>` : ""}${avatarHTML(S.players[k], k)}<div class="nm">${esc(nameOf(k))}</div><div class="pts">${sc[k]} <small>pts</small></div></div>`;
    };
    $("#podium").innerHTML = champ === "p2" ? pod("p1") + pod("p2") : pod("p1") + pod("p2");
    $("#finalMsg").textContent = champ ? `${nameOf(champ)} venceu por ${Math.max(sc.p1, sc.p2)} a ${Math.min(sc.p1, sc.p2)}!` : `Empate em ${sc.p1} a ${sc.p2}!`;
    const rs = (S.results && S.results[seq]) || {};
    let chips = "";
    for (let i = 0; i < total; i++) {
      const x = rs[i]; if (!x) continue;
      const w = x.winner === "p1" ? "w1" : x.winner === "p2" ? "w2" : "wt";
      const id = (g.order || [])[i], nm = (S.imageIndex[id] && S.imageIndex[id].name) || "";
      const who = x.winner === "tie"
        ? `<span class="rc-av tie">🤝</span><b>Empate</b>`
        : `${avatarHTML(S.players[x.winner], x.winner, "rc-av")}<b>${esc(nameOf(x.winner))}</b>`;
      chips += `<div class="rcard2 ${w}" style="--d:${i * 0.06}s">
        <div class="rc-sw" style="--tc:${x.target}">${S.imageIndex[id] && S.imageIndex[id].thumb ? `<img src="${S.imageIndex[id].thumb}" alt="">` : ""}<span class="rc-n">${i + 1}</span></div>
        <div class="rc-info"><span class="rc-nm">${esc(nm) || "Round " + (i + 1)}</span><div class="rc-win">${who}</div></div>
      </div>`;
    }
    $("#roundChips").innerHTML = chips;
    $("#againBtn").style.display = S.me ? "" : "none";
    renderBackInfo();
    showScreen("final", true);
    await introOut(tok);
    if (!alive(tok)) return;
    SFX.fanfare();
    const cols = champ === "p1" ? ["#3b82f6", "#93c5fd", "#ffc531", "#fff"] : champ === "p2" ? ["#ef4444", "#fca5a5", "#ffc531", "#fff"] : FX.PAL;
    FX.rain(cols, 260);
    const a = $(".pod.champ .avatar");
    if (a) { const b = a.getBoundingClientRect(); FX.confetti(b.left + b.width / 2, b.top + b.height / 2, { count: 160, colors: cols, power: 20 }); }
  }
  // cada um volta ao lobby sozinho; a partida só zera quando os dois voltarem
  function iWentBack() {
    const g = S.game || {};
    return !!(S.me && g.phase === "final" && S.back && S.back[g.seq] && S.back[g.seq][S.me]);
  }
  function renderBackInfo() {
    const g = S.game || {}, b = (S.back && S.back[g.seq]) || {};
    const el = $("#backInfo"); if (!el) return;
    const gone = SLOTS.filter((k) => b[k] && k !== S.me);
    el.innerHTML = gone.map((k) => `<span class="cchip ok">${avatarHTML(S.players[k], k)}${esc(nameOf(k))} já voltou ao lobby</span>`).join("");
  }
  $("#againBtn").addEventListener("click", async () => {
    const g = S.game; if (!S.me || g.phase !== "final") return;
    SFX.click();
    await DB.set(`back/${g.seq}/${S.me}`, true);
  });

  // ---------------- assinaturas ----------------
  let stopPresence = null;
  const lastReady = {};
  function startSubs() {
  DB.on("players", (v) => {
    const prevPlayers = S.players;
    S.players = v || {};
    const prevMe = S.me;
    S.me = SLOTS.find((k) => S.players[k] && S.players[k].cid === cid) || null;
    if (prevMe !== S.me) {
      if (stopPresence) { stopPresence(); stopPresence = null; }
      if (S.me) stopPresence = DB.presence("players/" + S.me);
      if (prevMe && !S.me && !S.leaving) toast("Você foi removido da partida pelo ADM.", true);
      S.leaving = false;
      if (!S.me) closeProfile();
      applyPanelState();
      $("#nextBtn").style.display = S.me ? "" : "none";
      $("#againBtn").style.display = S.me ? "" : "none";
    }
    if (S.screen === "lobby") {
      SLOTS.forEach((k) => {
        const p = S.players[k], pp = prevPlayers[k];
        if (k !== S.me && Game.hasPlayer(p) && !Game.hasPlayer(pp) && S.gotPlayers) SFX.join();
        if (k !== S.me && p && p.ready && !lastReady[k] && S.gotPlayers) SFX.ready();
      });
    }
    SLOTS.forEach((k) => (lastReady[k] = !!(S.players[k] && S.players[k].ready)));
    S.gotPlayers = true;
    if (S.screen === "lobby") renderLobby();
    renderAllMinis();
    checkAutoStart();
    route();
  });
  DB.on("game", (g) => { S.game = g || { phase: "lobby" }; S.gotGame = true; route(); checkAutoStart(); });
  DB.on("results", (v) => { S.results = v || {}; renderAllMinis(); });
  DB.on("back", (v) => {
    S.back = v || {};
    renderBackInfo(); renderLobbyStatus(); route();
    const g = S.game || {}, b = (S.back && S.back[g.seq]) || {};
    if (g.phase === "final" && S.me && b.p1 && b.p2 && S.resetting !== g.seq) {
      S.resetting = g.seq;
      setTimeout(() => { const gg = S.game || {}; if (gg.phase === "final" && gg.seq === g.seq) Game.resetProgress().catch(console.error); }, S.me === "p1" ? 60 : 900);
    }
  });
  DB.on("imageIndex", (v) => { S.imageIndex = v || {}; renderLobbyStatus(); checkAutoStart(); });
  }

  // ---------------- jogo liberado / bloqueado (controlado pelo ADM) ----------------
  let subsStarted = false, wasClosed = false;
  function setLocked(on) { $("#lockScreen").classList.toggle("on", on); }
  if (DB.mode === "local") { startSubs(); subsStarted = true; }
  else {
    DB.on("settings/open", (v) => {
      const open = v === true;
      if (!open) { wasClosed = true; setLocked(true); return; }
      if (wasClosed && subsStarted) { location.reload(); return; }
      setLocked(false);
      if (!subsStarted) { subsStarted = true; startSubs(); }
    }, () => setLocked(true));
  }

  // ---------------- início ----------------
  buildTitle();
  FX.bgPaint($("#bgPaint"));
  if (DB.mode === "local") $("#modeBadge").innerHTML = `<span class="mode-badge">MODO TESTE LOCAL</span>`;
  $("#muteBtn").textContent = SFX.muted ? "🔇" : "🔊";
  $("#muteBtn").addEventListener("click", () => { $("#muteBtn").textContent = SFX.toggle() ? "🔇" : "🔊"; });
  DB.ready.catch((e) => toast("Erro no Firebase: " + e.message, true));
  window.addEventListener("resize", () => {
    if (S.round && S.round.rec) {
      Recolor.fit($("#playCanvas"), S.round.rec, frameOf(S.round.id));
      $$("#revealRow canvas").forEach((c) => Recolor.fit(c, S.round.rec, frameOf(S.round.id)));
    }
  });

  // para testes
  window.__ADC = { S, setHex: (h) => pkSetHex(h), setReady };
})();
