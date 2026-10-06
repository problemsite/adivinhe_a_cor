// ============================================================
//  ADIVINHE A COR — painel ADM
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SLOTS = Game.SLOTS;
  const S = { players: {}, game: {}, picks: {}, results: {}, imageIndex: {} };

  function toast(msg, bad) {
    const t = document.createElement("div"); t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg;
    $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  window.addEventListener("db-error", (e) => toast(e.detail, true));
  const busy = (on, txt) => { $("#busy").textContent = txt || "Processando…"; $("#busy").classList.toggle("on", on); };
  const newId = () => "img_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nameOf = (k) => Game.displayName(S.players[k], k);
  function av(p, k) {
    const has = Game.hasPlayer(p);
    if (!has) return `<div class="av empty">${Game.slotLabel(k)}</div>`;
    if (p.photo) return `<div class="av ${k}"><img src="${p.photo}"></div>`;
    return `<div class="av ${k}">${esc(p.name && p.name.trim() ? p.name.trim()[0].toUpperCase() : Game.slotLabel(k))}</div>`;
  }
  const ordered = () => Object.keys(S.imageIndex).sort((a, b) => (S.imageIndex[a].order || 0) - (S.imageIndex[b].order || 0) || a.localeCompare(b));

  $("#modePill").textContent = DB.mode === "local" ? "MODO TESTE LOCAL (configure o Firebase em js/firebase-config.js)" : "Firebase conectado";
  $("#modePill").className = "pill " + (DB.mode === "local" ? "local" : "fb");
  DB.ready.catch((e) => toast("Erro no Firebase: " + e.message, true));

  // ---------------- PARTIDA ----------------
  const PH = { lobby: "Lobby", round: "Escolhendo", reveal: "Revelação", final: "Final" };
  function renderGame() {
    const g = S.game || {}, ph = g.phase || "lobby";
    $("#stPhase").textContent = PH[ph] || ph;
    $("#stRound").textContent = ph === "lobby" ? "—" : ph === "final" ? `${g.total}/${g.total}` : `${(g.round || 0) + 1}/${g.total || "?"}`;
    const sc = Game.scores(S.results, g.seq);
    $("#stScore").innerHTML = ph === "lobby" ? "—" : `<span style="color:#93c5fd">${sc.p1}</span> x <span style="color:#fca5a5">${sc.p2}</span>`;
    $("#bStart").disabled = !Object.keys(S.imageIndex).length;
    $("#bStart").textContent = ph === "lobby" ? "▶ Iniciar partida" : "▶ Reiniciar partida do zero";
    $("#bReveal").disabled = ph !== "round";
    $("#bNext").disabled = ph !== "reveal";
    renderImages();
  }
  $("#bStart").addEventListener("click", async () => {
    const ph = (S.game && S.game.phase) || "lobby";
    if (ph !== "lobby" && !confirm("Reiniciar a partida do zero? O placar atual será perdido.")) return;
    const p = S.players;
    if (!(Game.hasPlayer(p.p1) && Game.hasPlayer(p.p2)) && !confirm("Não há 2 jogadores no lobby. Iniciar mesmo assim?")) return;
    await DB.update("", { picks: null, results: null });
    const r = await Game.startGame(true);
    if (!r.ok) toast(r.reason || "Não foi possível iniciar", true); else toast("Partida iniciada!");
  });
  $("#bReveal").addEventListener("click", async () => {
    const g = S.game; if (g.phase !== "round") return;
    const ok = await Game.finishRound(g.seq, g.round, true);
    toast(ok ? "Revelando…" : "Não foi possível revelar", !ok);
  });
  $("#bNext").addEventListener("click", async () => { const g = S.game; if (g.phase === "reveal") await Game.nextRound(g.seq, g.round); });
  $("#bLobby").addEventListener("click", async () => {
    if (!confirm("Voltar os dois jogadores ao lobby e apagar o progresso da partida?")) return;
    await Game.resetProgress(); toast("Todos de volta ao lobby. Progresso apagado.");
  });
  $("#bKickAll").addEventListener("click", async () => {
    if (!confirm("Expulsar os DOIS jogadores (apaga as vagas no banco) e apagar o progresso?")) return;
    await Game.kickAll(); toast("Jogadores expulsos e progresso apagado.");
  });
  $("#bWipe").addEventListener("click", async () => {
    if (!confirm("Apagar TUDO do jogo no banco: jogadores, partida E TODAS AS IMAGENS. Tem certeza?")) return;
    if (!confirm("Última confirmação: apagar todas as imagens também?")) return;
    await DB.wipeAll(); toast("Tudo apagado.");
  });

  // ---------------- JOGADORES ----------------
  function renderPlayers() {
    const sc = Game.scores(S.results, S.game.seq), ph = (S.game && S.game.phase) || "lobby";
    $("#players").innerHTML = SLOTS.map((k) => {
      const p = S.players[k], has = Game.hasPlayer(p);
      const num = k === "p1" ? 1 : 2;
      if (!has) return `<div class="pcard ${k}"><div class="hd">${av(null, k)}<div><div class="nm" style="opacity:.5">Jogador ${num} — vaga livre</div><div class="meta">ninguém entrou ainda</div></div></div></div>`;
      const online = DB.mode === "local" ? "" : `<span><span class="dot ${p.online !== false ? "on" : ""}"></span>${p.online !== false ? "online" : "offline"}</span>`;
      return `<div class="pcard ${k}">
        <div class="hd">${av(p, k)}<div style="min-width:0"><div class="nm">${esc(nameOf(k))}</div>
        <div class="meta">${online}<span class="${p.ready ? "tagok" : "tagno"}">${ph === "lobby" ? (p.ready ? "pronto no lobby" : "não está pronto") : "na partida"}</span>${ph !== "lobby" ? `<span>· ${sc[k]} pts</span>` : ""}</div></div></div>
        <div class="row"><button class="btn red sm" data-kick="${k}">🚪 Expulsar</button></div>
      </div>`;
    }).join("");
  }
  $("#players").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-kick]"); if (!b) return;
    const k = b.dataset.kick;
    if (!confirm(`Expulsar ${nameOf(k)}? A vaga dele é apagada do banco e o progresso da partida também.`)) return;
    await Game.kick(k); toast(`${nameOf(k)} foi expulso. Progresso apagado.`);
  });

  // ---------------- AO VIVO ----------------
  let liveRec = null, liveId = null, picksOff = null, picksKey = null, liveQueued = false;
  function syncLive() {
    const g = S.game || {}, ph = g.phase || "lobby";
    const key = ph === "round" || ph === "reveal" ? `${g.seq}/${g.round}` : null;
    if (key !== picksKey) {
      if (picksOff) picksOff();
      picksKey = key; S.picks = {};
      picksOff = key ? DB.on("picks/" + key, (v) => { S.picks = v || {}; renderLive(); }) : null;
    }
    const id = key ? (g.order || [])[g.round] : null;
    if (id !== liveId) {
      liveId = id; liveRec = null;
      if (id) DB.get("images/" + id).then((d) => d && Recolor.load(d.src, d.mask, d.hex)).then((rec) => { if (liveId === id) { liveRec = rec; renderLive(); } }).catch(() => {});
    }
    renderLive();
  }
  function renderLive() {
    const g = S.game || {}, ph = g.phase || "lobby";
    if (!picksKey) {
      $("#liveName").textContent = "";
      $("#liveTarget").innerHTML = "";
      $("#live").innerHTML = `<div class="empty-msg" style="grid-column:1/-1">Nenhum round acontecendo agora.</div>`;
      return;
    }
    const idx = S.imageIndex[liveId] || {};
    $("#liveName").textContent = `round ${g.round + 1} · ${idx.name || ""}`;
    if (!$("#liveTarget").dataset.k || $("#liveTarget").dataset.k !== liveId) {
      $("#liveTarget").dataset.k = liveId;
      $("#liveTarget").innerHTML = `Cor original: <div class="sw" id="tgtSw" title="clique para ver" style="background:${idx.hex}"></div><span id="tgtHex" style="filter:blur(5px);cursor:pointer">${idx.hex}</span> <small>(clique para mostrar/esconder)</small>`;
      const tog = () => { $("#tgtSw").classList.toggle("show"); $("#tgtHex").style.filter = $("#tgtSw").classList.contains("show") ? "none" : "blur(5px)"; };
      $("#tgtSw").onclick = tog; $("#tgtHex").onclick = tog;
    }
    if (!$("#live").querySelector("canvas")) {
      $("#live").innerHTML = SLOTS.map((k) => `<div class="lcard ${k}"><canvas id="lv-${k}"></canvas><div class="inf" id="li-${k}"></div></div>`).join("");
    }
    SLOTS.forEach((k) => {
      const pk = S.picks[k];
      const hex = (pk && pk.hex) || "#7F7F7F";
      $("#li-" + k).innerHTML = `<div class="sw" style="background:${hex}"></div><div><b>${esc(nameOf(k))}</b><br>${hex} · ${pk && pk.ready ? '<span class="tagok">PRONTO ✓</span>' : '<span class="tagno">escolhendo…</span>'}</div>`;
    });
    if (!liveQueued) {
      liveQueued = true;
      requestAnimationFrame(() => {
        liveQueued = false;
        if (!liveRec) return;
        SLOTS.forEach((k) => { const cv = $("#lv-" + k); if (cv) liveRec.renderTo(cv, (S.picks[k] && S.picks[k].hex) || "#7F7F7F"); });
      });
    }
  }

  // ---------------- RESULTADOS ----------------
  function renderResults() {
    const g = S.game || {}, rs = (S.results && S.results[g.seq]) || {};
    const keys = Object.keys(rs).map(Number).sort((a, b) => a - b);
    if (!keys.length) { $("#results").innerHTML = `<div class="empty-msg">Ainda sem resultados nesta partida.</div>`; return; }
    const cell = (d) => `<span class="sw" style="background:${d.hex}"></span>${d.hex} <small style="color:var(--mut)" title="ΔE = diferença de cor (0 = idêntica)">${d.acc}% · ΔE ${d.dE}</small>`;
    $("#results").innerHTML = `<table><tr><th>#</th><th>Imagem</th><th>Original</th><th>${esc(nameOf("p1"))}</th><th>${esc(nameOf("p2"))}</th><th>Vencedor</th></tr>` +
      keys.map((i) => {
        const r = rs[i], id = (g.order || [])[i], nm = (S.imageIndex[id] && S.imageIndex[id].name) || "?";
        const w = r.winner === "tie" ? "Empate" : nameOf(r.winner);
        return `<tr><td>${i + 1}</td><td>${esc(nm)}</td><td><span class="sw" style="background:${r.target}"></span>${r.target}</td><td>${cell(r.p1)}</td><td>${cell(r.p2)}</td><td class="${r.winner === "p1" ? "win1" : r.winner === "p2" ? "win2" : ""}">${esc(w)}</td></tr>`;
      }).join("") + `</table>`;
  }

  // ---------------- IMAGENS ----------------
  function renderImages() {
    const ids = ordered(), g = S.game || {};
    const cur = (g.phase === "round" || g.phase === "reveal") ? (g.order || [])[g.round] : null;
    $("#imgCount").textContent = `${ids.length} ${ids.length === 1 ? "rodada" : "rodadas"}`;
    if (!ids.length) { $("#imgs").innerHTML = `<div class="empty-msg">Nenhuma imagem ainda. Clique em "＋ Nova imagem" ou importe o arquivo de exemplo (rodadas-exemplo/bob-esponja.json).</div>`; return; }
    $("#imgs").innerHTML = ids.map((id, i) => {
      const x = S.imageIndex[id];
      return `<div class="irow ${id === cur ? "current" : ""}"><div class="n">${i + 1}</div><img src="${x.thumb || ""}" alt=""><div class="t"><b>${esc(x.name || "sem nome")}</b><span><i class="sw" style="background:${x.hex}"></i>${x.hex} · início: ${x.start ? `<i class="sw" style="background:${x.start}"></i>${x.start}` : "automático 🎲"}${id === cur ? " · <b style='color:var(--gold);display:inline'>no ar</b>" : ""}</span></div>
        <div class="acts">
          <button class="btn ghost sm" data-up="${id}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn ghost sm" data-down="${id}" ${i === ids.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn blue sm" data-edit="${id}">✏️ Editar</button>
          <button class="btn ghost sm" data-exp="${id}" title="Exportar .json">⬇</button>
          <button class="btn red sm" data-del="${id}">🗑</button>
        </div></div>`;
    }).join("");
  }
  $("#imgs").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const ids = ordered();
    if (b.dataset.up || b.dataset.down) {
      const id = b.dataset.up || b.dataset.down, i = ids.indexOf(id), j = b.dataset.up ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const upd = {}; ids.forEach((x, n) => { upd[`imageIndex/${x}/order`] = n; upd[`images/${x}/order`] = n; });
      await DB.update("", upd);
    } else if (b.dataset.edit) openEditorExisting(b.dataset.edit);
    else if (b.dataset.del) {
      const id = b.dataset.del;
      if (!confirm(`Apagar a imagem "${S.imageIndex[id].name}"?`)) return;
      await DB.update("", { ["images/" + id]: null, ["imageIndex/" + id]: null });
      toast("Imagem apagada.");
    } else if (b.dataset.exp) {
      const id = b.dataset.exp; busy(true, "Exportando…");
      const d = await DB.get("images/" + id); busy(false);
      download(`${(d.name || "rodada").replace(/[^\w\-]+/g, "_")}.json`, { tipo: "adivinhe-a-cor-rodada", name: d.name, hex: d.hex, start: d.start || "", frame: d.frame || null, w: d.w, h: d.h, src: d.src, mask: d.mask, thumb: S.imageIndex[id].thumb });
    }
  });
  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("#bExportAll").addEventListener("click", async () => {
    const ids = ordered(); if (!ids.length) return toast("Nada para exportar.", true);
    busy(true, "Exportando…");
    const rodadas = [];
    for (const id of ids) { const d = await DB.get("images/" + id); if (d) rodadas.push({ name: d.name, hex: d.hex, start: d.start || "", frame: d.frame || null, w: d.w, h: d.h, src: d.src, mask: d.mask, thumb: S.imageIndex[id].thumb }); }
    busy(false);
    download("adivinhe-a-cor-rodadas.json", { tipo: "adivinhe-a-cor-pacote", rodadas });
  });
  $("#bImport").addEventListener("click", () => $("#fImport").click());
  $("#fImport").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files); e.target.value = "";
    let n = 0; busy(true, "Importando…");
    try {
      for (const f of files) {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data) ? data : data.rodadas ? data.rodadas : [data];
        for (const r of list) {
          if (!r || !r.src || !r.mask || !r.hex) continue;
          const thumb = await makeThumb(r.src, r.mask);
          await saveImage(newId(), { name: r.name || "Sem nome", hex: r.hex.toUpperCase(), start: r.start || "", frame: r.frame || null, w: r.w, h: r.h, src: r.src, mask: r.mask, thumb }, nextOrder());
          n++;
        }
      }
      toast(n ? `${n} ${n === 1 ? "rodada importada" : "rodadas importadas"}!` : "Nenhuma rodada válida no arquivo.", !n);
    } catch (err) { console.error(err); toast("Arquivo inválido: " + err.message, true); }
    busy(false);
  });
  const nextOrder = () => { const v = Object.values(S.imageIndex).map((x) => x.order || 0); return v.length ? Math.max(...v) + 1 : 0; };
  async function saveImage(id, d, order) {
    const rev = Date.now();
    await DB.update("", {
      ["images/" + id]: { name: d.name, hex: d.hex, start: d.start || "", frame: d.frame || null, w: d.w, h: d.h, src: d.src, mask: d.mask, order, rev },
      ["imageIndex/" + id]: { name: d.name, hex: d.hex, start: d.start || "", frame: d.frame || null, thumb: d.thumb, order, rev }
    });
    // cópia local imediata (o listener atualiza em seguida)
    S.imageIndex[id] = { name: d.name, hex: d.hex, start: d.start || "", frame: d.frame || null, thumb: d.thumb, order, rev };
  }
  // miniatura quadrada centralizada na parte pintável (o personagem)
  async function makeThumb(src, maskSrc) {
    const im = await Recolor.loadImg(src);
    const W = im.naturalWidth, H = im.naturalHeight;
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (maskSrc) {
      const mk = await Recolor.loadImg(maskSrc);
      const t = document.createElement("canvas"); t.width = W; t.height = H;
      const tx = t.getContext("2d", { willReadFrequently: true }); tx.drawImage(mk, 0, 0, W, H);
      const d = tx.getImageData(0, 0, W, H).data;
      let a = W, b = H, c = -1, e = -1;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4] > 127) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; }
      if (c >= 0) { x0 = a; y0 = b; x1 = c; y1 = e; }
    }
    let side = Math.max(x1 - x0, y1 - y0) * 1.08;
    side = Math.min(side, W, H);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const sx = Math.min(Math.max(cx - side / 2, 0), W - side), sy = Math.min(Math.max(cy - side / 2, 0), H - side);
    const c = document.createElement("canvas"); c.width = c.height = 220;
    c.getContext("2d").drawImage(im, sx, sy, side, side, 0, 0, 220, 220);
    return c.toDataURL("image/jpeg", 0.82);
  }

  // ============================================================
  //  EDITOR DE MÁSCARA
  // ============================================================
  const E = { id: null, w: 0, h: 0, src: "", pixels: null, lab: null, mask: null, undo: [], tool: "wand", sub: false, zoom: 1, fit: 1, rec: null, recDirty: true };
  const edImg = $("#edImg"), edOv = $("#edOv"), stage = $("#stage"), wrap = $("#edWrap");

  $("#bNew").addEventListener("click", () => $("#fNew").click());
  $("#fNew").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      busy(true, "Preparando imagem…");
      try {
        // reduz para no máx. 1200px e salva como JPEG (é exatamente o que os jogadores vão ver)
        const im = await Recolor.loadImg(rd.result);
        const s = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        const src = c.toDataURL("image/jpeg", 0.9);
        await openEditor({ id: null, name: f.name.replace(/\.[^.]+$/, ""), src, maskSrc: null, hex: "#808080" });
      } catch (err) { toast("Não consegui abrir a imagem: " + err.message, true); }
      busy(false);
    };
    rd.readAsDataURL(f);
  });
  async function openEditorExisting(id) {
    busy(true, "Abrindo…");
    const d = await DB.get("images/" + id);
    busy(false);
    if (!d) return toast("Imagem não encontrada", true);
    openEditor({ id, name: d.name, src: d.src, maskSrc: d.mask, hex: d.hex, start: d.start || "", frame: d.frame || null });
  }
  async function openEditor(o) {
    busy(true, "Abrindo editor…");
    const im = await Recolor.loadImg(o.src);
    const w = im.naturalWidth, h = im.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0);
    E.pixels = x.getImageData(0, 0, w, h).data;
    E.mask = new Uint8Array(w * h);
    if (o.maskSrc) {
      const mk = await Recolor.loadImg(o.maskSrc);
      x.clearRect(0, 0, w, h); x.drawImage(mk, 0, 0, w, h);
      const md = x.getImageData(0, 0, w, h).data;
      for (let i = 0; i < w * h; i++) E.mask[i] = md[i * 4] > 127 ? 1 : 0;
    }
    E.lab = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { const l = Color.rgbToLab(E.pixels[i * 4], E.pixels[i * 4 + 1], E.pixels[i * 4 + 2]); E.lab[i * 3] = l[0]; E.lab[i * 3 + 1] = l[1]; E.lab[i * 3 + 2] = l[2]; }
    Object.assign(E, { id: o.id, w, h, src: o.src, undo: [], rec: null, recDirty: true });
    edImg.width = edOv.width = w; edImg.height = edOv.height = h;
    edImg.getContext("2d").drawImage(im, 0, 0);
    $("#edName").value = o.name || "";
    $("#edTitle").textContent = o.id ? "Editar imagem" : "Nova imagem";
    setHex(o.hex || "#808080");
    setStart(o.start || "");
    E.frame = o.frame && o.frame.z ? { ...o.frame } : null;
    setTimeout(initFrame, 50);
    $("#prevOn").checked = false;
    $("#editor").classList.add("on");
    busy(false);
    requestAnimationFrame(() => { layoutStage(); drawOverlay(); });
  }
  function layoutStage() {
    const ww = wrap.clientWidth - 40, wh = wrap.clientHeight - 40;
    E.fit = Math.min(ww / E.w, wh / E.h);
    stage.style.width = E.w * E.fit * E.zoom + "px";
    stage.style.height = E.h * E.fit * E.zoom + "px";
  }
  window.addEventListener("resize", () => { if ($("#editor").classList.contains("on")) layoutStage(); });

  function drawOverlay() {
    const ctx = edOv.getContext("2d"), { w, h, mask } = E;
    const id = ctx.createImageData(w, h), d = id.data;
    let n = 0;
    const show = $("#showMask").checked && !$("#prevOn").checked;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        n++;
        if (!show) continue;
        const edge = (x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w]);
        const p = i * 4;
        if (edge) { const on = ((x + y) >> 2) & 1; d[p] = on ? 255 : 20; d[p + 1] = on ? 255 : 20; d[p + 2] = on ? 255 : 20; d[p + 3] = 255; }
        else { d[p] = 255; d[p + 1] = 0; d[p + 2] = 190; d[p + 3] = 120; }
      }
    }
    ctx.putImageData(id, 0, 0);
    $("#edInfo").textContent = `${n.toLocaleString("pt-BR")} pixels selecionados (${((n / (w * h)) * 100).toFixed(1)}% da imagem)`;
    E.recDirty = true;
    if ($("#prevOn").checked) drawPreview();
    if (!E.frame) drawFrame();
  }
  let ovQueued = false;
  function queueOverlay() { if (ovQueued) return; ovQueued = true; requestAnimationFrame(() => { ovQueued = false; drawOverlay(); }); }

  function drawPreview() {
    const ctx = edImg.getContext("2d");
    if (!$("#prevOn").checked) {
      const id = ctx.createImageData(E.w, E.h); id.data.set(E.pixels); ctx.putImageData(id, 0, 0); return;
    }
    if (!E.rec) E.rec = new Recolor(E.pixels, E.w, E.h, E.mask, $("#origHex").value);
    else if (E.recDirty) E.rec.setMask(E.mask);
    E.recDirty = false;
    E.rec.setBase(curHex());
    ctx.drawImage(E.rec.render($("#prevColor").value), 0, 0);
  }
  $("#prevOn").addEventListener("change", () => { drawPreview(); drawOverlay(); });
  $("#prevColor").addEventListener("input", () => { $("#prevOn").checked = true; drawPreview(); drawOverlay(); });
  $("#prevGray").addEventListener("click", () => { $("#prevColor").value = "#7f7f7f"; $("#prevOn").checked = true; drawPreview(); drawOverlay(); });
  $("#showMask").addEventListener("change", drawOverlay);

  // ---- cor original ----
  const curHex = () => (Color.hexToRgb($("#origHex").value) ? $("#origHex").value.toUpperCase() : "#808080");
  function setHex(h) { $("#origHex").value = h.toUpperCase(); $("#origSw").style.background = h; if ($("#prevOn").checked) drawPreview(); }
  $("#origHex").addEventListener("input", (e) => { let v = e.target.value.trim(); if (v && v[0] !== "#") v = "#" + v; if (Color.hexToRgb(v) && v.length === 7) { $("#origSw").style.background = v; if ($("#prevOn").checked) drawPreview(); } });
  function autoHex() {
    const { mask, pixels } = E, bins = new Map();
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const p = i * 4, k = ((pixels[p] >> 3) << 10) | ((pixels[p + 1] >> 3) << 5) | (pixels[p + 2] >> 3);
      let b = bins.get(k); if (!b) { b = [0, 0, 0, 0]; bins.set(k, b); }
      b[0]++; b[1] += pixels[p]; b[2] += pixels[p + 1]; b[3] += pixels[p + 2];
    }
    let best = null; bins.forEach((b) => { if (!best || b[0] > best[0]) best = b; });
    if (!best) return null;
    return Color.rgbToHex(best[1] / best[0], best[2] / best[0], best[3] / best[0]);
  }
  // ---- enquadramento ----
  const frBox = $("#frBox"), frCv = $("#frCv");
  function maskBox() {
    let x0 = E.w, y0 = E.h, x1 = -1, y1 = -1;
    for (let i = 0; i < E.mask.length; i++) if (E.mask[i]) { const x = i % E.w, y = (i / E.w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? { x0: 0, y0: 0, x1: E.w - 1, y1: E.h - 1 } : { x0, y0, x1, y1 };
  }
  function curFrame() {
    // frame efetivo (se automático, calcula o equivalente para poder ajustar a partir dele)
    if (E.frame) return E.frame;
    const cw = frBox.clientWidth, ch = frBox.clientHeight;
    const L = Recolor.layout(cw, ch, E.w, E.h, maskBox(), null);
    return { cx: (cw / 2 - L.left) / L.s / E.w, cy: (ch / 2 - L.top) / L.s / E.h, z: 1 };
  }
  function drawFrame() {
    if (!E.w || !frBox.clientWidth) return;
    if (frCv.width !== E.w || frCv.height !== E.h) { frCv.width = E.w; frCv.height = E.h; }
    frCv.getContext("2d").drawImage(edImg, 0, 0);
    Recolor.fit(frCv, { w: E.w, h: E.h, box: maskBox() }, E.frame);
    const f = curFrame();
    $("#frZ").value = f.z; $("#frZv").textContent = f.z.toFixed(2) + "x";
    $("#frTag").textContent = E.frame ? "manual" : "automático";
  }
  function initFrame() { drawFrame(); }
  function setFrame(f) {
    const cw = frBox.clientWidth, ch = frBox.clientHeight;
    f.z = Math.min(3, Math.max(0.3, f.z));
    // prende o centro para não sobrar borda quando zoom >= 1 (mesma regra do jogo)
    const L = Recolor.layout(cw, ch, E.w, E.h, maskBox(), f);
    f.cx = (cw / 2 - L.left) / L.s / E.w; f.cy = (ch / 2 - L.top) / L.s / E.h;
    E.frame = { cx: +f.cx.toFixed(4), cy: +f.cy.toFixed(4), z: +f.z.toFixed(3) };
    drawFrame();
  }
  let frDrag = null;
  frBox.addEventListener("pointerdown", (e) => { const f = curFrame(); frDrag = { x: e.clientX, y: e.clientY, f: { ...f } }; frBox.setPointerCapture(e.pointerId); frBox.classList.add("drag"); });
  frBox.addEventListener("pointermove", (e) => {
    if (!frDrag) return;
    const cw = frBox.clientWidth, ch = frBox.clientHeight, s = Math.max(cw / E.w, ch / E.h) * frDrag.f.z;
    setFrame({ cx: frDrag.f.cx - (e.clientX - frDrag.x) / s / E.w, cy: frDrag.f.cy - (e.clientY - frDrag.y) / s / E.h, z: frDrag.f.z });
  });
  const frUp = () => { frDrag = null; frBox.classList.remove("drag"); };
  frBox.addEventListener("pointerup", frUp); frBox.addEventListener("pointercancel", frUp);
  frBox.addEventListener("wheel", (e) => { e.preventDefault(); const f = curFrame(); setFrame({ ...f, z: f.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }); }, { passive: false });
  $("#frZ").addEventListener("input", (e) => { const f = curFrame(); setFrame({ ...f, z: +e.target.value }); });
  $("#frAuto").addEventListener("click", () => { E.frame = null; drawFrame(); });
  $("#frWhole").addEventListener("click", () => {
    const cw = frBox.clientWidth, ch = frBox.clientHeight;
    const z = Math.min(cw / E.w, ch / E.h) / Math.max(cw / E.w, ch / E.h);
    setFrame({ cx: 0.5, cy: 0.5, z });
  });

  // ---- cor inicial ----
  function setStart(h) {
    const auto = !h || !Color.hexToRgb(h);
    $("#startAuto").checked = auto;
    const v = auto ? Game.farColor(curHex()) : h.toUpperCase();
    $("#startHex").value = v; $("#startSw").style.background = v; $("#startPick").value = v.toLowerCase();
    $("#startRow").style.opacity = auto ? 0.4 : 1;
  }
  const curStart = () => ($("#startAuto").checked ? "" : (Color.hexToRgb($("#startHex").value) ? $("#startHex").value.toUpperCase() : ""));
  const manualStart = (v) => { $("#startAuto").checked = false; $("#startRow").style.opacity = 1; $("#startHex").value = v.toUpperCase(); $("#startSw").style.background = v; $("#startPick").value = v.toLowerCase(); };
  $("#startAuto").addEventListener("change", (e) => { $("#startRow").style.opacity = e.target.checked ? 0.4 : 1; });
  $("#startRand").addEventListener("click", () => manualStart(Game.farColor(curHex())));
  $("#startPick").addEventListener("input", (e) => manualStart(e.target.value));
  $("#startHex").addEventListener("input", (e) => { let v = e.target.value.trim(); if (v && v[0] !== "#") v = "#" + v; if (v.length === 7 && Color.hexToRgb(v)) { $("#startAuto").checked = false; $("#startRow").style.opacity = 1; $("#startSw").style.background = v; $("#startPick").value = v.toLowerCase(); } });
  $("#edAuto").addEventListener("click", () => { const h = autoHex(); if (h) { setHex(h); toast("Cor detectada: " + h); } else toast("Selecione a área primeiro.", true); });
  let dropMode = false;
  $("#edDrop").addEventListener("click", () => { dropMode = !dropMode; $("#edDrop").style.outline = dropMode ? "2px solid #fff" : ""; stage.style.cursor = dropMode ? "copy" : ""; });

  // ---- ferramentas ----
  document.querySelectorAll(".tool").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tool").forEach((x) => x.classList.toggle("on", x === b));
    E.tool = b.dataset.tool; updateCursor();
  }));
  $("#mAdd").addEventListener("click", () => { E.sub = false; $("#mAdd").classList.add("on"); $("#mSub").classList.remove("on", "sub"); });
  $("#mSub").addEventListener("click", () => { E.sub = true; $("#mSub").classList.add("on", "sub"); $("#mAdd").classList.remove("on"); });
  $("#tol").addEventListener("input", (e) => ($("#tolV").textContent = e.target.value));
  $("#br").addEventListener("input", (e) => { $("#brV").textContent = e.target.value; });
  $("#zm").addEventListener("input", (e) => { E.zoom = +e.target.value; $("#zmV").textContent = E.zoom + "x"; layoutStage(); });
  wrap.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return; e.preventDefault();
    E.zoom = Math.min(5, Math.max(1, E.zoom + (e.deltaY < 0 ? 0.25 : -0.25)));
    $("#zm").value = E.zoom; $("#zmV").textContent = E.zoom + "x"; layoutStage();
  }, { passive: false });

  function pushUndo() { E.undo.push(E.mask.slice()); if (E.undo.length > 25) E.undo.shift(); }
  $("#edUndo").addEventListener("click", undo);
  function undo() { const m = E.undo.pop(); if (m) { E.mask = m; drawOverlay(); } }
  $("#edClear").addEventListener("click", () => { pushUndo(); E.mask.fill(0); drawOverlay(); });
  $("#edFill").addEventListener("click", () => {
    // preenche buracos PEQUENOS (manchas, sombras) dentro da seleção — não preenche olhos/boca grandes
    pushUndo();
    const { w, h, mask } = E, seen = new Uint8Array(w * h), maxArea = Math.max(50, Math.round(w * h * 0.004));
    let filled = 0;
    const st = new Int32Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (mask[s] || seen[s]) continue;
      let sp = 0, touches = false; const comp = [];
      st[sp++] = s; seen[s] = 1;
      while (sp) {
        const i = st[--sp]; comp.push(i);
        const x = i % w, y = (i / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
        if (x > 0 && !mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; st[sp++] = i - 1; }
        if (x < w - 1 && !mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; st[sp++] = i + 1; }
        if (y > 0 && !mask[i - w] && !seen[i - w]) { seen[i - w] = 1; st[sp++] = i - w; }
        if (y < h - 1 && !mask[i + w] && !seen[i + w]) { seen[i + w] = 1; st[sp++] = i + w; }
      }
      if (!touches && comp.length <= maxArea) { comp.forEach((i) => (mask[i] = 1)); filled += comp.length; }
    }
    drawOverlay(); toast(filled ? `${filled} pixels de buracos preenchidos` : "Nenhum buraco pequeno encontrado");
  });

  function imgXY(e) {
    const r = edOv.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * E.w), Math.floor(((e.clientY - r.top) / r.height) * E.h)];
  }
  function selectByColor(x, y, global, subtract) {
    const { w, h, lab, mask } = E;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const tol = +$("#tol").value, t2 = tol * tol, s = (y * w + x) * 3;
    const L0 = lab[s], a0 = lab[s + 1], b0 = lab[s + 2], val = subtract ? 0 : 1;
    const near = (i) => { const k = i * 3, dl = lab[k] - L0, da = lab[k + 1] - a0, db = lab[k + 2] - b0; return dl * dl + da * da + db * db <= t2; };
    if (global) { for (let i = 0; i < w * h; i++) if (near(i)) mask[i] = val; return; }
    const seen = new Uint8Array(w * h), st = new Int32Array(w * h); let sp = 0;
    const s0 = y * w + x; st[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const i = st[--sp]; mask[i] = val;
      const xx = i % w, yy = (i / w) | 0;
      const nb = [xx > 0 ? i - 1 : -1, xx < w - 1 ? i + 1 : -1, yy > 0 ? i - w : -1, yy < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !seen[j]) { seen[j] = 1; if (near(j)) st[sp++] = j; }
    }
  }
  function stamp(cx, cy, val) {
    const r = +$("#br").value / 2, { w, h, mask } = E, r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[y * w + x] = val;
  }
  let painting = null;
  edOv.addEventListener("pointerdown", (e) => {
    const [x, y] = imgXY(e);
    if (dropMode) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= E.w || yy >= E.h) continue; const p = (yy * E.w + xx) * 4; r += E.pixels[p]; g += E.pixels[p + 1]; b += E.pixels[p + 2]; n++; }
      setHex(Color.rgbToHex(r / n, g / n, b / n)); dropMode = false; $("#edDrop").style.outline = ""; stage.style.cursor = ""; return;
    }
    pushUndo();
    if (E.tool === "wand" || E.tool === "global") {
      selectByColor(x, y, E.tool === "global", E.sub || e.shiftKey || e.button === 2);
      drawOverlay();
    } else {
      const val = E.tool === "brush" && !e.shiftKey ? 1 : 0;
      painting = { x, y, val }; edOv.setPointerCapture(e.pointerId);
      stamp(x, y, val); queueOverlay();
    }
  });
  edOv.addEventListener("contextmenu", (e) => e.preventDefault());
  edOv.addEventListener("pointermove", (e) => {
    moveCursor(e);
    if (!painting) return;
    const [x, y] = imgXY(e);
    const dist = Math.hypot(x - painting.x, y - painting.y), step = Math.max(1, +$("#br").value / 4), n = Math.ceil(dist / step);
    for (let i = 1; i <= n; i++) stamp(painting.x + ((x - painting.x) * i) / n, painting.y + ((y - painting.y) * i) / n, painting.val);
    painting.x = x; painting.y = y; queueOverlay();
  });
  edOv.addEventListener("pointerup", () => (painting = null));
  edOv.addEventListener("pointerleave", () => ($("#brushCur").style.display = "none"));
  function moveCursor(e) {
    const c = $("#brushCur");
    if (E.tool !== "brush" && E.tool !== "erase") { c.style.display = "none"; return; }
    const r = stage.getBoundingClientRect(), s = r.width / E.w, d = +$("#br").value * s;
    c.style.display = "block"; c.style.width = c.style.height = d + "px";
    c.style.left = e.clientX - r.left + "px"; c.style.top = e.clientY - r.top + "px";
    c.style.borderColor = E.tool === "erase" ? "#ff6b81" : "#fff";
  }
  function updateCursor() { stage.style.cursor = E.tool === "wand" || E.tool === "global" ? "crosshair" : "none"; }
  updateCursor();
  window.addEventListener("keydown", (e) => {
    if (!$("#editor").classList.contains("on") || e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if (e.key === "[") { $("#br").value = Math.max(2, +$("#br").value - 4); $("#brV").textContent = $("#br").value; }
    if (e.key === "]") { $("#br").value = Math.min(150, +$("#br").value + 4); $("#brV").textContent = $("#br").value; }
  });

  $("#edCancel").addEventListener("click", () => { if (E.undo.length && !confirm("Descartar as alterações?")) return; $("#editor").classList.remove("on"); });
  $("#edSave").addEventListener("click", async () => {
    const n = E.mask.reduce((a, b) => a + b, 0);
    if (!n) return toast("Selecione a parte que os jogadores vão pintar!", true);
    const hex = curHex();
    if (!Color.hexToRgb($("#origHex").value)) return toast("Cor original inválida.", true);
    busy(true, "Salvando…");
    try {
      const c = document.createElement("canvas"); c.width = E.w; c.height = E.h;
      const x = c.getContext("2d"), id = x.createImageData(E.w, E.h);
      for (let i = 0; i < E.mask.length; i++) { const v = E.mask[i] ? 255 : 0, p = i * 4; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255; }
      x.putImageData(id, 0, 0);
      const mask = c.toDataURL("image/png");
      const thumb = await makeThumb(E.src, mask);
      const imgId = E.id || newId();
      const order = E.id && S.imageIndex[E.id] ? S.imageIndex[E.id].order || 0 : nextOrder();
      await saveImage(imgId, { name: $("#edName").value.trim() || "Sem nome", hex, start: curStart(), frame: E.frame || null, w: E.w, h: E.h, src: E.src, mask, thumb }, order);
      $("#editor").classList.remove("on");
      toast("Imagem salva!");
    } catch (err) { console.error(err); toast("Erro ao salvar: " + err.message, true); }
    busy(false);
  });

  // ---------------- assinaturas ----------------
  function startAdm() {
  DB.on("players", (v) => { S.players = v || {}; renderPlayers(); renderLive(); renderResults(); });
  DB.on("game", (g) => { S.game = g || { phase: "lobby" }; renderGame(); renderPlayers(); syncLive(); renderResults(); });
  DB.on("results", (v) => { S.results = v || {}; renderGame(); renderPlayers(); renderResults(); });
  DB.on("imageIndex", (v) => { S.imageIndex = v || {}; renderGame(); });
  if (DB.mode === "local") renderOpen({ open: true });
  else firebase.database().ref("controle/sites/adivinhe_a_cor").on("value", (sn) => renderOpen(sn.val() || {}));
  }

  // ---------------- jogo liberado / bloqueado (mesmo controle da trava) ----------------
  let isOpen = false;
  function renderOpen(c) {
    const open = !!(c && c.open === true && (!c.until || c.until > Date.now()));
    isOpen = open;
    $("#openBox").className = "openbox " + (open ? "open" : "closed");
    $("#openTitle").textContent = open ? "🔓 Jogo LIBERADO" : "🔒 Jogo BLOQUEADO";
    $("#openSub").innerHTML = (open ? (c.until ? "Liberado até " + new Date(c.until).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ". " : "Qualquer pessoa com o link pode jogar. ") : "Ninguém consegue ver nem jogar. ");
    $("#bOpen").textContent = open ? "Bloquear jogo" : "Liberar jogo";
    $("#bOpen").className = "btn " + (open ? "red" : "green");
  }
  $("#bOpen").addEventListener("click", async () => {
    if (DB.mode === "local") return toast("No modo local o jogo fica sempre liberado.");
    try {
      const r = firebase.database().ref("controle/sites/adivinhe_a_cor");
      const cur = (await r.once("value")).val();
      if (!cur) await r.set({ open: !isOpen, escrita: { players: true, game: true, picks: true, results: true, back: true } });
      else await r.update({ open: !isOpen, until: null });
      toast(!isOpen ? "Jogo liberado!" : "Jogo bloqueado.");
    } catch (e) { toast("Sem permissão: " + e.message, true); }
  });

  // ---------------- entrada: só ADM (a trava cuida da tela trancada) ----------------
  if (DB.mode === "local" || !window.Trava) startAdm();
  else Trava.ready.then(() => { if (Trava.admin) startAdm(); });

  window.__ADM = { S, E, openEditor };
})();
