// ============================================================
//  ADIVINHE A COR — lógica da tela do jogador
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SLOTS = Game.SLOTS;

  // id deste navegador (no modo local é por aba, para testar vários jogadores no mesmo PC)
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
  const colorOf = (k) => Game.COLORS[k] || "#8b84c9";
  // quem joga a partida atual (no lobby = quem entrou)
  const parts = () => Game.parts(S.game, S.players);
  // ordem de "quem age primeiro" (evita que todos gravem ao mesmo tempo)
  const myDelay = (base, step) => base + Math.max(0, parts().indexOf(S.me)) * step;
  const joinNames = (ks) => { const n = ks.map((k) => esc(nameOf(k))); return n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " e " + n[n.length - 1]; };
  const pct = (v) => String(v).replace(".", ",");

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
  // só quem entrou + UM espaço livre para o próximo (até encher a sala com 8)
  function lobbyKeys() {
    const act = Game.active(S.players), ph = (S.game && S.game.phase) || "lobby";
    const free = SLOTS.filter((k) => !act.includes(k));
    const vis = act.slice();
    if (ph === "lobby" && free.length) vis.push(free[0]);
    return vis.sort((x, y) => Game.slotNum(x) - Game.slotNum(y));
  }
  const slotSig = {};
  function renderLobby() {
    const box = $(".slots"), vis = lobbyKeys(), n = vis.length;
    const size = n <= 2 ? "s2" : n <= 4 ? "s4" : "s8";
    box.dataset.n = n; box.className = "slots " + size;
    // monta/reaproveita os cartões na ordem certa
    const keep = new Set(vis);
    box.querySelectorAll(".slot").forEach((el) => { if (!keep.has(el.dataset.k)) { delete slotSig[el.dataset.k]; el.remove(); } });
    let vs = box.querySelector(".vs");
    // sem "VS": cada um entra no seu espaço
    if (vs) { vs.remove(); vs = null; }
    vis.forEach((k, i) => {
      let el = $("#slot-" + k);
      if (!el) { el = document.createElement("div"); el.id = "slot-" + k; el.dataset.k = k; el.className = "slot " + k; delete slotSig[k]; }
      if (i === 1 && vs) box.appendChild(vs);
      box.appendChild(el);
    });
    vis.forEach((k) => {
      const el = $("#slot-" + k), p = S.players[k], has = Game.hasPlayer(p), mine = S.me === k;
      const g = S.game || {}, waitFinal = (g.phase || "lobby") !== "lobby";
      const wentBack = !!(S.back && S.back[g.seq] && S.back[g.seq][k]);
      const sig = JSON.stringify([size, has, p && p.name, p && p.photo && p.photo.length, p && p.ready, p && p.online, mine, !!S.me, waitFinal, wentBack]);
      if (slotSig[k] === sig) return;
      const isNew = !(k in slotSig);
      slotSig[k] = sig;
      const label = Game.slotLabel(k), num = Game.slotNum(k), small = size === "s8";
      if (!has) {
        el.className = `slot ${k} free${isNew ? " pop" : ""}`;
        const canJoin = !S.me && !waitFinal;
        el.innerHTML = `<div class="tag">JOGADOR ${num}</div>
          <div class="avatar empty"><span>${label}</span></div>
          <div class="info"><div class="name" style="opacity:.45">Vaga livre</div>
          <div class="state"></div>
          <div class="acts">${canJoin ? `<button class="btn ${k} small" data-join="${k}">ENTRAR NO LOBBY</button>` : ""}</div></div>`;
      } else {
        el.className = `slot ${k} filled ${p.ready ? "ready" : ""}${isNew ? " pop" : ""}`;
        el.innerHTML = `<div class="tag">JOGADOR ${num}</div>
          ${DB.mode === "firebase" ? `<div class="online ${p.online !== false ? "on" : ""}" title="${p.online !== false ? "online" : "offline"}"></div>` : ""}
          ${mine ? `<div class="me-tag">VOCÊ</div>` : ""}
          ${avatarHTML(p, k)}
          <div class="info"><div class="name">${esc(nameOf(k))}</div>
          <div class="state">${waitFinal ? (wentBack ? "voltou ao lobby ✓" : `<span class="dots-anim">vendo o resultado</span>`) : p.ready ? `<span class="ready-badge">PRONTO!</span>` : `<span class="dots-anim">se preparando</span>`}</div>
          <div class="acts">${mine ? `<button class="btn ghost small" data-edit="1">✏️ Editar</button><button class="btn ghost small" data-leave="1">Sair</button>` : ""}</div></div>`;
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
    const n = imageCount(), p = S.players, act = Game.active(p);
    let msg;
    const phNow = (S.game && S.game.phase) || "lobby";
    if (S.me && phNow === "final") {
      const b = (S.back && S.back[S.game.seq]) || {};
      const wait = parts().filter((k) => k !== S.me && !b[k]);
      msg = wait.length === 1 ? `Esperando <b>${esc(nameOf(wait[0]))}</b> voltar ao lobby…` : `Esperando <b>${wait.length} jogadores</b> voltarem ao lobby…`;
    } else if (!n) msg = "⚠️ O ADM ainda não cadastrou nenhuma imagem.";
    else if (!S.me && act.length >= Game.MAX) msg = "Sala cheia — você está assistindo 👀";
    else if (!S.me) msg = "Escolha uma vaga para entrar!";
    else {
      const notReady = act.filter((k) => !p[k].ready);
      if (act.length < Game.MIN) msg = "Esperando outro jogador entrar…";
      else if (!notReady.length) msg = act.length === 2 ? "<b>Os dois estão prontos! Começando…</b>" : "<b>Todos prontos! Começando…</b>";
      else if (!p[S.me].ready) msg = "Clique em <b>ESTOU PRONTO!</b> quando estiver preparado";
      else if (notReady.length === 1) msg = `Esperando <b>${esc(nameOf(notReady[0]))}</b> ficar pronto…`;
      else msg = `Esperando <b>${notReady.length} jogadores</b> ficarem prontos…`;
    }
    st.innerHTML = msg + (n ? ` · <b>${n}</b> ${n === 1 ? "rodada" : "rodadas"}` : "");
  }

  $(".slots").addEventListener("click", async (e) => {
    const j = e.target.closest("[data-join]"), ed = e.target.closest("[data-edit]"), lv = e.target.closest("[data-leave]");
    if (j) {
      // primeiro escolhe nome e foto; a vaga só é ocupada ao clicar em ENTRAR NO LOBBY
      SFX.click();
      if (((S.game && S.game.phase) || "lobby") !== "lobby") return;
      openProfile(j.dataset.join);
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
  // começa sozinho quando TODOS os que entraram (2 ou mais) estão prontos
  const allReady = () => { const act = Game.active(S.players); return act.length >= Game.MIN && act.every((k) => S.players[k].ready); };
  function checkAutoStart() {
    const ok = S.me && allReady() && (S.game.phase || "lobby") === "lobby" && imageCount() > 0;
    if (ok && !autoTimer) {
      autoTimer = setTimeout(async () => {
        autoTimer = null;
        if (allReady() && (S.game.phase || "lobby") === "lobby") {
          const r = await Game.startGame();
          if (!r.ok && r.reason) toast(r.reason, true);
        }
      }, myDelay(1300, 500));
    }
    if (!ok && autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  // ---------------- PERFIL (nome + foto com zoom/recorte) ----------------
  const Crop = { img: null, w: 0, h: 0, zoom: 1, base: 1, ox: 0, oy: 0, changed: false, removed: false };
  const cropEl = $("#crop"), cropImg = $("#cropImg");
  const V = () => cropEl.clientWidth;
  function cropPlaceholder() {
    const k = S.me || S.joinK || "p1", nm = $("#nameIn").value.trim();
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
  function openProfile(joinK) {
    if (!S.me && !joinK) return;
    S.joinK = S.me ? null : joinK;
    const k = S.me || S.joinK, p = (S.me && S.players[S.me]) || {};
    $("#pfTitle").textContent = S.me ? `Perfil — Jogador ${Game.slotNum(S.me)}` : "Entrar no lobby";
    $("#pfSave").textContent = S.me ? "SALVAR" : "ENTRAR NO LOBBY";
    cropEl.style.setProperty("--pc", colorOf(k));
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
    if (!S.me && !S.joinK) return closeProfile();
    const p = (S.me && S.players[S.me]) || {};
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
    if (!S.me) {
      // entra agora: tenta a vaga escolhida; se alguém pegou antes, a próxima livre
      if (((S.game && S.game.phase) || "lobby") !== "lobby") return closeProfile();
      $("#pfSave").disabled = true;
      const tryK = [S.joinK].concat(SLOTS.filter((x) => x !== S.joinK && !Game.hasPlayer(S.players[x])));
      let ok = null;
      for (const k of tryK) {
        const r = await DB.txn("players/" + k, (cur) => {
          if (cur && cur.cid && cur.cid !== cid) return;
          return { cid, name, photo, ready: false, online: true, t: Date.now() };
        });
        if (r.committed) { ok = k; break; }
      }
      $("#pfSave").disabled = false;
      if (!ok) { toast("A sala está cheia!", true); SFX.error(); return closeProfile(); }
      S.joinK = null; SFX.join(); closeProfile();
      return;
    }
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
      if (cv._key !== key) { cv._key = key; playZoom.z = 1; playZoom.cx = playZoom.cy = null; Recolor.Zoom.add(playZoom, cv, R.rec, frameOf(R.id)); }
      Recolor.backdrop(cv);
    });
  }
  function applyPanelState() {
    const pnl = $("#picker"), R = S.round;
    pnl.classList.toggle("spect", !S.me);
    pnl.classList.toggle("locked", !!(S.me && R && R.ready));
    Pk.enabled = !!(S.me && R && !R.ready);
    renderWaitTxt();
  }
  function renderWaitTxt() {
    const wait = parts().filter((k) => k !== S.me && !(S.picks[k] && S.picks[k].ready));
    $("#waitTxt").textContent = !S.me ? "" : wait.length === 1 ? `Esperando ${nameOf(wait[0])}` : wait.length ? `Esperando ${wait.length} jogadores` : "Todos confirmaram!";
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

  // ---------------- mini placar (topo) ----------------
  // 2 jogadores: um de cada lado do round. 3 ou mais: fileira compacta ao lado do round.
  function scoresNow() { return S.scoreOverride || Game.scores(S.results, S.game.seq); }
  function buildTop(prefix) {
    const top = $(`#${prefix === "pm" ? "playTop" : "revTop"}`), ks = parts(), n = ks.length;
    const sig = ks.join(",");
    if (top.dataset.sig === sig) return;
    top.dataset.sig = sig;
    const pill = top.querySelector(".round-pill");
    top.querySelectorAll(".mini, .tb-players").forEach((el) => el.remove());
    top.classList.toggle("multi", n > 2);
    top.classList.toggle("many", n > 5);
    top.style.setProperty("--n", n);
    const mk = (k, rev) => { const d = document.createElement("div"); d.className = `mini ${k}${rev ? " rev" : ""}${n > 2 ? " compact" : ""}`; d.id = `${prefix}-${k}`; return d; };
    if (n <= 2) {
      top.insertBefore(mk(ks[0] || "p1"), pill);
      top.appendChild(mk(ks[1] || "p2", true));
    } else {
      const row = document.createElement("div"); row.className = "tb-players";
      ks.forEach((k) => row.appendChild(mk(k)));
      top.appendChild(row);
    }
  }
  function renderMinis(prefix) {
    buildTop(prefix);
    const sc = scoresNow(), ks = parts(), compact = ks.length > 2;
    ks.forEach((k) => {
      const el = $(`#${prefix}-${k}`); if (!el) return;
      let st = "", ok = false;
      if (prefix === "pm") {
        const pk = S.picks && S.picks[k];
        if (pk && pk.ready) { st = "PRONTO ✓"; ok = true; } else st = `<span class="dots-anim">escolhendo</span>`;
      } else st = k === S.me ? "você" : "";
      el.classList.toggle("ok", ok);
      el.classList.toggle("me", k === S.me);
      el.title = nameOf(k);
      el.innerHTML = compact
        ? `${avatarHTML(S.players[k], k)}${ok ? `<i class="okb">✓</i>` : ""}<div class="nm">${esc(nameOf(k))}</div><div class="sc">${sc[k] || 0}</div>`
        : `${avatarHTML(S.players[k], k)}<div class="info"><div class="nm">${esc(nameOf(k))}</div><div class="st ${ok ? "ok" : ""}">${st}</div></div><div class="sc">${sc[k] || 0}</div>`;
    });
  }
  function renderAllMinis() { if (S.screen === "play") renderMinis("pm"); if (S.screen === "reveal") renderMinis("rm"); }
  function bump(el) { if (!el) return; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

  // ---------------- zoom nas imagens (rodinha, arrastar, dois cliques volta) ----------------
  const playZoom = Recolor.Zoom.group(), revZoom = Recolor.Zoom.group();
  Recolor.Zoom.bind($("#imgCard"), playZoom);

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
      const sc = o.scores, ks = parts(), n = ks.length;
      const max = Math.max(0, ...ks.map((k) => sc[k] || 0));
      const leaders = ks.filter((k) => (sc[k] || 0) === max);
      const lead = leaders.length === 1 ? leaders[0] : null;
      const crowned = max > 0 && leaders.length < n ? leaders : [];
      if (n <= 2) {
        // 2 jogadores: o "VS" de sempre
        const [a, b] = [ks[0] || "p1", ks[1] || "p2"];
        icP.className = "ic-players duo";
        icP.innerHTML = [a, b].map((k, i) => `${i === 1 ? `<div class="ic-vs">VS</div>` : ""}<div class="ic-p ${k} ${i ? "r" : "l"} ${lead === k ? "lead" : ""}">${avatarHTML(S.players[k], k)}<div><div class="nm">${esc(nameOf(k))}</div><div class="pt">${sc[k] || 0} <small style="font-size:.4em">pts</small></div></div></div>`).join("");
        icL.textContent = lead ? `${nameOf(lead)} está na frente!` : o.r === 0 ? "Que comece a disputa!" : `Empatados em ${sc[a] || 0} a ${sc[b] || 0}!`;
      } else {
        // 3 a 8: placar em fileira, do 1º ao último
        const rk = Game.ranking(sc, ks);
        icP.className = "ic-players grid " + (n <= 4 ? "g4" : "g8");
        icP.innerHTML = rk.map((x, i) => `<div class="ic-c ${x.k} ${crowned.includes(x.k) ? "lead" : ""}" style="--d:${i}">
          ${max > 0 ? `<div class="pl">${x.place}º</div>` : ""}${avatarHTML(S.players[x.k], x.k)}<div class="nm">${esc(nameOf(x.k))}</div><div class="pt">${x.pts} <small>pts</small></div></div>`).join("");
        icL.textContent = lead && max > 0 ? `${nameOf(lead)} está na frente!` : o.r === 0 || max === 0 ? "Que comece a disputa!"
          : leaders.length === n ? `Todos empatados com ${max} ${max === 1 ? "ponto" : "pontos"}!` : `Empate na frente: ${leaders.map(nameOf).join(", ").replace(/, ([^,]*)$/, " e $1")}!`;
      }
    } else { icP.innerHTML = ""; icP.className = "ic-players"; }
    SFX.whoosh();
    await FX.paintRain($("#introCanvas"), { duration: 1100 });
    if (!alive(o.tok)) return;
    icR.classList.add("slam"); SFX.slam();
    await sleep(330); if (!alive(o.tok)) return;
    if (o.sub) { icS.classList.add("pop"); SFX.pop(); }
    if (o.players) {
      await sleep(380); if (!alive(o.tok)) return;
      SFX.whoosh();
      if (icP.classList.contains("duo")) {
        $(".ic-p.l").classList.add("in");
        await sleep(140); $(".ic-vs").classList.add("in"); $(".ic-p.r").classList.add("in");
        await sleep(520);
      } else {
        icP.querySelectorAll(".ic-c").forEach((el) => el.classList.add("in"));
        await sleep(520 + icP.children.length * 60);
      }
      if (!alive(o.tok)) return;
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
    const ks = parts();
    const was = (k, f) => !!(prev[k] && prev[k][f]), is = (k, f) => !!(S.picks[k] && S.picks[k][f]);
    // som quando outro jogador fica pronto
    ks.forEach((k) => { if (k !== S.me && is(k, "ready") && !was(k, "ready") && S.screen === "play") SFX.pop(); });
    if (S.screen === "play") {
      if (ks.some((k) => is(k, "ready") !== was(k, "ready"))) {
        renderMinis("pm"); renderWaitTxt();
        ks.forEach((k) => { if (is(k, "ready") && !was(k, "ready")) bump($("#pm-" + k)); });
      }
    }
    // revelação: todos confirmam para seguir
    if (S.game.phase === "reveal") {
      ks.forEach((k) => { if (k !== S.me && is(k, "next") && !was(k, "next") && S.revealDone) SFX.pop(); });
      renderConfirm();
      const g2 = S.game;
      if (S.me && ks.length && ks.every((k) => is(k, "next"))) {
        const key = "n" + g2.seq + "_" + g2.round;
        if (S.advancing !== key) {
          S.advancing = key;
          setTimeout(() => Game.nextRound(g2.seq, g2.round).catch(console.error), myDelay(60, 450));
        }
      }
    }
    // todos prontos -> revela
    const g = S.game;
    if (g.phase === "round" && S.me && ks.length && ks.every((k) => is(k, "ready"))) {
      const key = g.seq + "_" + g.round;
      if (S.finishing !== key) {
        S.finishing = key;
        setTimeout(() => Game.finishRound(g.seq, g.round).catch(console.error), myDelay(60, 450));
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

    const ks = Game.resultKeys(res).length ? Game.resultKeys(res) : parts();
    const n = ks.length, multi = n > 2;
    const winners = Game.winnersOf(res).filter((k) => ks.includes(k));

    // placar antes deste round
    const before = Object.assign({}, Game.scores(S.results, seq));
    winners.forEach((k) => (before[k] = Math.max(0, (before[k] || 0) - 1)));
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
      return `<div class="rwrap ${kind}${multi && !isO ? " compact" : ""}" id="rw-${kind}">
        <div class="crown">👑</div>
        ${isO || d.dE < 25 ? "" : `<div class="lose-tag">ficou longe… 😵</div>`}
        <div class="rcard" id="rc-${kind}">
        <div class="face">
          <div class="who">${who}${isO ? "" : `<span class="rank"></span>`}</div>
          <div class="pic"><canvas></canvas></div>
          <div class="data">
            <div class="chip" style="background:${d.hex}"></div>
            <div class="codes"><div class="hex">${d.hex}</div><div class="rgb">${Color.rgbStr(rgb)}</div></div>
            ${isO ? "" : `<div class="acc"><div class="pct">${pct(d.acc)}%</div><div class="de">${closeLabel(d.dE)}</div></div>`}
          </div>
          ${isO ? "" : `<div class="bar"><i></i></div>`}
        </div>
        <div class="back">?</div>
        </div>
      </div>`;
    };
    const row = $("#revealRow");
    if (!multi) {
      // 2 jogadores: jogador | original | jogador
      row.className = "reveal-row duo";
      row.style.gridTemplateColumns = "";
      row.innerHTML = card(ks[0]) + card("orig") + card(ks[1]);
    } else {
      // 3 a 8: original grande à esquerda + grade com os jogadores
      const cols = n <= 4 ? n : Math.ceil(n / 2), rows = n <= 4 ? 1 : 2;
      row.className = `reveal-row multi r${rows}`;
      row.style.setProperty("--cols", cols); row.style.setProperty("--rows", rows);
      row.style.gridTemplateColumns = `minmax(0, ${rows === 2 ? 1.6 : 1.25}fr) minmax(0, ${cols}fr)`;
      row.innerHTML = card("orig") + `<div class="rv-grid">${ks.map(card).join("")}</div>`;
    }
    revZoom.z = 1; revZoom.cx = revZoom.cy = null; revZoom.items = [];
    if (rec) {
      ks.forEach((k) => rec.renderTo($(`#rc-${k} canvas`), res[k].hex));
      rec.drawOriginal($("#rc-orig canvas"));
      ["orig"].concat(ks).forEach((k) => { const cv = $(`#rc-${k} canvas`); Recolor.Zoom.bind(cv.parentElement, revZoom); Recolor.Zoom.add(revZoom, cv, rec, frameOf(id)); });
    }
    const vd = $("#verdict"); vd.className = "verdict" + (multi ? " multi" : ""); vd.innerHTML = "";
    const nb = $("#nextBtn"); nb.classList.remove("show", "waiting-other");
    S.revealDone = false;
    nb.dataset.label = r + 1 >= total ? "VER RESULTADO FINAL 🏆" : "PRÓXIMO ROUND ▶";
    nb.textContent = nb.dataset.label;
    nb.style.display = S.me ? "" : "none";
    $("#confirmRow").innerHTML = "";
    showScreen("reveal", true);
    sus.classList.add("out");
    setTimeout(() => { if (alive(tok)) sus.classList.remove("on", "dim", "out"); }, 520);
    // a caixa só tem tamanho depois de aparecer
    requestAnimationFrame(() => Recolor.Zoom.apply(revZoom));

    const c0 = $("#rc-orig"), pc = ks.map((k) => $("#rc-" + k));
    const order = multi ? ["orig"].concat(ks) : [ks[0], "orig", ks[1]];
    order.forEach((k, i) => setTimeout(() => { const w = $("#rw-" + k); if (w) w.classList.add("in"); }, i * (multi ? 70 : 110)));
    SFX.whoosh();
    await sleep(500 + (multi ? n * 40 : 0)); if (!alive(tok)) return;
    pc.forEach((c) => c.classList.add("shake"));
    await sleep(450); if (!alive(tok)) return;
    // vira as cartas dos jogadores, uma de cada vez
    const step = multi ? Math.max(260, Math.min(450, 1700 / n)) : 750;
    for (let i = 0; i < pc.length; i++) {
      pc[i].classList.remove("shake"); pc[i].classList.add("flipped"); SFX.flip();
      await sleep(i === pc.length - 1 ? 800 : step); if (!alive(tok)) return;
    }
    vd.innerHTML = `E a cor original é… <small>🥁</small>`; vd.classList.add("show");
    c0.classList.add("shake"); SFX.drumroll(0.9);
    await sleep(1000); if (!alive(tok)) return;
    c0.classList.remove("shake"); c0.classList.add("flipped"); SFX.reveal(); FX.flash();
    vd.innerHTML = `${res.target}! <small>${Color.rgbStr(Color.hexToRgb(res.target))}</small>`;
    await sleep(900); if (!alive(tok)) return;
    vd.classList.remove("show");
    // precisão (e a colocação, com 3 ou mais)
    const byDist = ks.slice().sort((a, b) => res[a].dE - res[b].dE);
    let place = 0, last = null;
    const placeOf = {};
    byDist.forEach((k, i) => { if (res[k].dE !== last) { place = i + 1; last = res[k].dE; } placeOf[k] = place; });
    ks.forEach((k) => {
      const c = $("#rc-" + k);
      c.querySelector(".acc").classList.add("show");
      c.querySelector(".bar i").style.width = res[k].acc + "%";
      if (multi) { const rk = c.querySelector(".rank"); rk.textContent = placeOf[k] + "º"; rk.classList.add("show"); }
    });
    SFX.pop();
    await sleep(1200); if (!alive(tok)) return;

    // vencedor(es): o mais perto; empate = todos os empatados pontuam
    const losers = ks.filter((k) => !winners.includes(k));
    if (winners.length < ks.length) losers.forEach((k) => $("#rw-" + k).classList.add(multi ? "lose-soft" : "lose"));
    winners.forEach((k) => {
      const c = $("#rw-" + k); c.classList.add("win");
      const b = c.getBoundingClientRect();
      FX.confetti(b.left + b.width / 2, b.top + b.height * 0.4, { count: Math.max(50, Math.round(110 / Math.sqrt(winners.length))), colors: [res[k].hex, colorOf(k), "#ffc531", "#ffffff"], power: multi ? 13 : 16 });
    });
    if (winners.length > 1) {
      SFX.tie();
      vd.innerHTML = !multi
        ? `EMPATE! Os dois pontuam 🤝<small>Os dois ficaram exatamente à mesma distância da cor original.</small>`
        : winners.length === ks.length ? `EMPATE GERAL! Todos pontuam 🤝<small>Todo mundo ficou à mesma distância da cor original.</small>`
        : `EMPATE! ${joinNames(winners)} pontuam 🤝<small>Ficaram exatamente à mesma distância da cor original.</small>`;
    } else if (winners.length === 1) {
      SFX.win();
      const W = winners[0];
      if (!multi) {
        const L = ks.find((k) => k !== W);
        vd.innerHTML = `${esc(nameOf(W))} ganhou o round! 🎉<small>Precisão de ${pct(res[W].acc)}% contra ${pct(res[L].acc)}% de ${esc(nameOf(L))}</small>`;
      } else {
        const S2 = byDist.find((k) => k !== W);
        vd.innerHTML = `${esc(nameOf(W))} ganhou o round! 🎉<small>Precisão de ${pct(res[W].acc)}% · 2º lugar: ${esc(nameOf(S2))} com ${pct(res[S2].acc)}%</small>`;
      }
    }
    await sleep(250); if (!alive(tok)) return;
    vd.classList.add("show");
    let arrived = 0;
    winners.forEach((k, i) => {
      setTimeout(() => {
        if (!alive(tok)) return;
        FX.flyText("+1", $("#rc-" + k), $(`#rm-${k} .sc`), () => {
          if (!alive(tok)) return;
          S.scoreOverride[k] = (S.scoreOverride[k] || 0) + 1;
          if (++arrived === winners.length) S.scoreOverride = null;
          renderMinis("rm");
          bump($("#rm-" + k));
          SFX.ready();
        });
      }, i * 120);
    });
    await sleep(1300 + winners.length * 120); if (!alive(tok)) return;
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
  // ---- todos precisam confirmar para seguir ----
  function renderConfirm() {
    if (S.screen !== "reveal" || !S.revealDone) return;
    const row = $("#confirmRow"), nb = $("#nextBtn"), ks = parts(), compact = ks.length > 2;
    row.classList.toggle("compact", compact);
    row.innerHTML = ks.map((k) => {
      const ok = !!(S.picks[k] && S.picks[k].next);
      return compact
        ? `<span class="cchip mini-c ${ok ? "ok" : ""}" title="${esc(nameOf(k))}">${avatarHTML(S.players[k], k)}<i>${ok ? "✔" : "⏳"}</i></span>`
        : `<span class="cchip ${ok ? "ok" : ""}">${avatarHTML(S.players[k], k)}${esc(nameOf(k))} ${ok ? "✔ confirmou" : "⏳ aguardando"}</span>`;
    }).join("");
    if (S.me) {
      const mine = !!(S.picks[S.me] && S.picks[S.me].next);
      const wait = ks.filter((k) => k !== S.me && !(S.picks[k] && S.picks[k].next));
      nb.classList.toggle("waiting-other", mine);
      nb.textContent = mine ? (wait.length === 1 ? `✔ CONFIRMADO — esperando ${nameOf(wait[0])}` : wait.length ? `✔ CONFIRMADO — esperando ${wait.length} jogadores` : "✔ CONFIRMADO") : nb.dataset.label;
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
    const sc = Game.scores(S.results, seq), ks = parts(), n = ks.length;
    const rk = Game.ranking(sc, ks);
    const champs = rk.filter((x) => x.place === 1).map((x) => x.k);
    const champ = champs.length === 1 ? champs[0] : null;
    $("#finalTitle").innerHTML = letters(champ ? "TEMOS UM CAMPEÃO!" : "DEU EMPATE!", ["#FFB800", "#FF3B5C", "#3BA0FF", "#2EE59D", "#A45CFF", "#FF6AD5"]);
    const podEl = $("#podium");
    if (n <= 2) {
      podEl.className = "podium duo";
      const pod = (k) => {
        const isC = champs.includes(k);
        return `<div class="pod ${isC ? "champ" : "loser"}">${isC ? `<div class="crown2">👑</div>` : ""}${avatarHTML(S.players[k], k)}<div class="nm">${esc(nameOf(k))}</div><div class="pts">${sc[k] || 0} <small>pts</small></div></div>`;
      };
      podEl.innerHTML = ks.map(pod).join("");
      const [a, b] = ks;
      $("#finalMsg").textContent = champ ? `${nameOf(champ)} venceu por ${Math.max(sc[a], sc[b])} a ${Math.min(sc[a], sc[b])}!` : `Empate em ${sc[a] || 0} a ${sc[b] || 0}!`;
    } else {
      // pódio com os 3 primeiros (2º · 1º · 3º) e o resto em fileira embaixo
      podEl.className = "podium multi";
      const top3 = rk.slice(0, 3), rest = rk.slice(3);
      const vis = [top3[1], top3[0], top3[2]].filter(Boolean);
      const pod = (x) => `<div class="pod p-${Math.min(3, x.place)} ${x.place === 1 ? "champ" : ""}">
        ${x.place === 1 ? `<div class="crown2">👑</div>` : ""}${avatarHTML(S.players[x.k], x.k)}<div class="nm">${esc(nameOf(x.k))}</div>
        <div class="pts">${x.pts} <small>pts</small></div><div class="step ${x.k}">${x.place}º</div></div>`;
      podEl.innerHTML = `<div class="pod-top">${vis.map(pod).join("")}</div>` +
        (rest.length ? `<div class="pod-rest">${rest.map((x, i) => `<div class="pr ${x.k}" style="--d:${i}"><span class="pl">${x.place}º</span>${avatarHTML(S.players[x.k], x.k)}<b>${esc(nameOf(x.k))}</b><span class="pp">${x.pts}</span></div>`).join("")}</div>` : "");
      const pts = rk[0].pts, ptxt = `${pts} ${pts === 1 ? "ponto" : "pontos"}`;
      $("#finalMsg").textContent = champ ? `${nameOf(champ)} venceu com ${ptxt}!` : `${champs.map(nameOf).join(", ").replace(/, ([^,]*)$/, " e $1")} empataram com ${ptxt}!`;
    }
    const rs = (S.results && S.results[seq]) || {};
    let chips = "";
    for (let i = 0; i < total; i++) {
      const x = rs[i]; if (!x) continue;
      const ws = Game.winnersOf(x);
      const id = (g.order || [])[i], nm = (S.imageIndex[id] && S.imageIndex[id].name) || "";
      const who = ws.length !== 1
        ? `<span class="rc-av tie">🤝</span><b>Empate</b>`
        : `${avatarHTML(S.players[ws[0]], ws[0], "rc-av")}<b>${esc(nameOf(ws[0]))}</b>`;
      chips += `<div class="rcard2" style="--d:${i * 0.06}s;--wc:${ws.length === 1 ? colorOf(ws[0]) : "var(--gold)"}">
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
    const cols = champ ? [colorOf(champ), "#ffffff", "#ffc531", colorOf(champ)] : FX.PAL;
    FX.rain(cols, n > 4 ? 200 : 260);
    champs.forEach((k) => {
      const a = document.querySelector(`.pod.champ .avatar.${k}`); if (!a) return;
      const b = a.getBoundingClientRect();
      FX.confetti(b.left + b.width / 2, b.top + b.height / 2, { count: Math.round(160 / champs.length), colors: [colorOf(k), "#ffc531", "#ffffff", colorOf(k)], power: 20 });
    });
  }
  // cada um volta ao lobby sozinho; a partida só zera quando todos voltarem
  function iWentBack() {
    const g = S.game || {};
    return !!(S.me && g.phase === "final" && S.back && S.back[g.seq] && S.back[g.seq][S.me]);
  }
  function renderBackInfo() {
    const g = S.game || {}, b = (S.back && S.back[g.seq]) || {};
    const el = $("#backInfo"); if (!el) return;
    const gone = parts().filter((k) => b[k] && k !== S.me);
    el.innerHTML = gone.length > 2
      ? `<span class="cchip ok">${gone.map((k) => avatarHTML(S.players[k], k)).join("")} ${gone.length} já voltaram ao lobby</span>`
      : gone.map((k) => `<span class="cchip ok">${avatarHTML(S.players[k], k)}${esc(nameOf(k))} já voltou ao lobby</span>`).join("");
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
    const ks = parts();
    if (g.phase === "final" && S.me && ks.length && ks.every((k) => b[k]) && S.resetting !== g.seq) {
      S.resetting = g.seq;
      setTimeout(() => { const gg = S.game || {}; if (gg.phase === "final" && gg.seq === g.seq) Game.resetProgress().catch(console.error); }, myDelay(60, 450));
    }
  });
  DB.on("imageIndex", (v) => { S.imageIndex = v || {}; renderLobbyStatus(); checkAutoStart(); });
  }

  // ---------------- liberado/bloqueado: controlado pela trava (/trava.js) ----------------
  startSubs();

  // ---------------- início ----------------
  buildTitle();
  FX.bgPaint($("#bgPaint"));
  if (DB.mode === "local") $("#modeBadge").innerHTML = `<span class="mode-badge">MODO TESTE LOCAL</span>`;
  $("#muteBtn").textContent = SFX.muted ? "🔇" : "🔊";
  $("#muteBtn").addEventListener("click", () => { $("#muteBtn").textContent = SFX.toggle() ? "🔇" : "🔊"; });
  DB.ready.catch((e) => toast("Erro no Firebase: " + e.message, true));
  window.addEventListener("resize", () => { Recolor.Zoom.apply(playZoom); Recolor.Zoom.apply(revZoom); });

  // para testes
  window.__ADC = { S, setHex: (h) => pkSetHex(h), setReady, playZoom, revZoom };
})();
