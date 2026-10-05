// ============================================================
//  Camada de dados: Firebase Realtime Database OU modo teste local
//  API: DB.ready, DB.on(path, cb) -> off, DB.get, DB.set, DB.update,
//       DB.remove, DB.txn(path, fn) -> {committed, value},
//       DB.presence(path), DB.mode ("firebase" | "local")
// ============================================================
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const ROOT = window.DB_ROOT || "adivinheacor";
  const isLocal = !cfg.apiKey || /COLE_AQUI/i.test(cfg.apiKey);
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const split = (p) => (p || "").split("/").filter(Boolean);

  // ---------------- MODO LOCAL ----------------
  function makeLocal() {
    const KEY = "adivinheacor_localdb_v1";
    let tree = load();
    const subs = new Set();
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function getAt(path) {
      let n = tree;
      for (const k of split(path)) { if (n == null || typeof n !== "object") return null; n = n[k]; }
      return n === undefined ? null : n;
    }
    function prune(obj, parts) {
      if (!parts.length) return;
      const [h, ...t] = parts;
      if (obj[h] && typeof obj[h] === "object") {
        prune(obj[h], t);
        if (!Object.keys(obj[h]).length) delete obj[h];
      }
    }
    function setAt(path, val) {
      const parts = split(path);
      val = clone(val);
      if (!parts.length) { tree = val && typeof val === "object" ? val : {}; return; }
      let n = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (n[parts[i]] == null || typeof n[parts[i]] !== "object") n[parts[i]] = {};
        n = n[parts[i]];
      }
      const last = parts[parts.length - 1];
      if (val === null) { delete n[last]; prune(tree, parts.slice(0, -1)); }
      else n[last] = val;
    }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(tree)); }
      catch (e) { console.warn(e); window.dispatchEvent(new CustomEvent("db-error", { detail: "Armazenamento local cheio (modo teste). Use o Firebase de verdade para muitas imagens." })); }
      notify();
    }
    function notify() {
      subs.forEach((s) => {
        const v = getAt(s.path);
        const j = JSON.stringify(v);
        if (j !== s.last) { s.last = j; try { s.cb(clone(v)); } catch (e) { console.error(e); } }
      });
    }
    window.addEventListener("storage", (e) => { if (e.key === KEY) { tree = load(); notify(); } });
    const join = (base, rel) => split(base).concat(split(rel)).join("/");
    return {
      mode: "local",
      ready: Promise.resolve(),
      on(path, cb) {
        const s = { path, cb, last: undefined };
        subs.add(s);
        setTimeout(() => { if (subs.has(s)) { const v = getAt(path); s.last = JSON.stringify(v); cb(clone(v)); } }, 0);
        return () => subs.delete(s);
      },
      async get(path) { tree = load(); return clone(getAt(path)); },
      async set(path, val) { tree = load(); setAt(path, val); save(); },
      async update(path, obj) { tree = load(); for (const k in obj) setAt(join(path, k), obj[k]); save(); },
      async remove(path) { tree = load(); setAt(path, null); save(); },
      async txn(path, fn) {
        tree = load();
        const r = fn(clone(getAt(path)));
        if (r === undefined) return { committed: false, value: clone(getAt(path)) };
        setAt(path, r); save();
        return { committed: true, value: clone(r) };
      },
      presence() { return () => {}; },
      async wipeAll() { tree = {}; save(); }
    };
  }

  // ---------------- FIREBASE ----------------
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }
  function makeFirebase() {
    const V = "10.12.2";
    const base = `https://www.gstatic.com/firebasejs/${V}/`;
    let db;
    const ready = (async () => {
      await loadScript(base + "firebase-app-compat.js");
      await loadScript(base + "firebase-auth-compat.js");
      await loadScript(base + "firebase-database-compat.js");
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      try { await firebase.auth().signInAnonymously(); }
      catch (e) { console.warn("Auth anônima não ativada (ok se as regras estiverem abertas):", e.message); }
      db = firebase.database();
    })();
    const ref = (p) => db.ref(split(ROOT).concat(split(p)).join("/"));
    return {
      mode: "firebase",
      ready,
      on(path, cb) {
        let off = false, r, h;
        ready.then(() => {
          if (off) return;
          r = ref(path); h = (s) => cb(s.val());
          r.on("value", h, (err) => console.error("leitura negada", path, err));
        });
        return () => { off = true; if (r) r.off("value", h); };
      },
      async get(path) { await ready; const s = await ref(path).once("value"); return s.val(); },
      async set(path, val) { await ready; return ref(path).set(val); },
      async update(path, obj) { await ready; return ref(path).update(obj); },
      async remove(path) { await ready; return ref(path).remove(); },
      async txn(path, fn) {
        await ready;
        await ref(path).once("value"); // aquece o cache (evita abortar com valor nulo)
        const r = await ref(path).transaction((cur) => { const v = fn(cur); return v; }, undefined, false);
        return { committed: r.committed, value: r.snapshot.val() };
      },
      // marca online/offline. Retorna função que cancela.
      presence(path) {
        let cancelled = false, conn, h;
        ready.then(() => {
          if (cancelled) return;
          conn = db.ref(".info/connected");
          h = (s) => {
            if (!s.val() || cancelled) return;
            const r = ref(path);
            r.onDisconnect().update({ online: false });
            // só marca online se a vaga ainda existir (evita criar vaga fantasma)
            r.transaction((cur) => (cur && cur.cid ? Object.assign(cur, { online: true }) : undefined), undefined, false);
          };
          conn.on("value", h);
        });
        return () => {
          cancelled = true;
          if (conn) conn.off("value", h);
          ready.then(() => ref(path).onDisconnect().cancel());
        };
      },
      async wipeAll() { await ready; return ref("").remove(); }
    };
  }

  window.DB = isLocal ? makeLocal() : makeFirebase();
})();

// ============================================================
//  Operações do jogo (usadas pelo jogo e pelo ADM)
// ============================================================
window.Game = {
  SLOTS: ["p1", "p2"],
  slotLabel: (k) => (k === "p1" ? "J1" : "J2"),
  hasPlayer: (p) => !!(p && p.cid),
  displayName(p, k) { return (p && p.name && p.name.trim()) || this.slotLabel(k); },

  scores(results, seq) {
    const sc = { p1: 0, p2: 0 };
    const rs = (results && results[seq]) || {};
    Object.values(rs).forEach((r) => {
      if (!r) return;
      if (r.winner === "p1" || r.winner === "tie") sc.p1++;
      if (r.winner === "p2" || r.winner === "tie") sc.p2++;
    });
    return sc;
  },

  computeResult(picks, targetHex) {
    const t = Color.hexToRgb(targetHex);
    const out = { target: targetHex.toUpperCase() };
    ["p1", "p2"].forEach((k) => {
      const hex = ((picks && picks[k] && picks[k].hex) || "#7F7F7F").toUpperCase();
      const d = Color.deltaE2000Rgb(Color.hexToRgb(hex), t);
      out[k] = { hex, dE: Math.round(d * 100) / 100, acc: Color.accuracy(d), chose: !!(picks && picks[k] && picks[k].touched) };
    });
    if (out.p1.dE < out.p2.dE) out.winner = "p1";
    else if (out.p2.dE < out.p1.dE) out.winner = "p2";
    else out.winner = "tie";
    return out;
  },

  async imageOrder() {
    const idx = (await DB.get("imageIndex")) || {};
    return Object.keys(idx).sort((a, b) => (idx[a].order || 0) - (idx[b].order || 0) || a.localeCompare(b));
  },

  // sorteia uma cor bem longe da cor original (tom oposto + diferença grande)
  farColor(targetHex) {
    const t = Color.hexToRgb(targetHex) || [128, 128, 128];
    const [th, ts] = Color.rgbToHsv(t[0], t[1], t[2]);
    let best = null, bestScore = -1;
    for (let i = 0; i < 80; i++) {
      const h = Math.random() * 360, sat = 0.35 + Math.random() * 0.65, v = 0.3 + Math.random() * 0.7;
      const rgb = Color.hsvToRgb(h, sat, v);
      const dE = Color.deltaE2000Rgb(rgb, t);
      let hd = Math.abs(h - th); hd = Math.min(hd, 360 - hd);
      if (dE >= 40 && (ts <= 0.15 || hd >= 110)) return Color.rgbToHex(rgb[0], rgb[1], rgb[2]);
      const score = dE + (ts > 0.15 ? hd * 0.12 : 0);
      if (score > bestScore) { bestScore = score; best = rgb; }
    }
    return Color.rgbToHex(best[0], best[1], best[2]);
  },

  async startGame(force) {
    const idx = (await DB.get("imageIndex")) || {};
    const order = Object.keys(idx).sort((a, b) => (idx[a].order || 0) - (idx[b].order || 0) || a.localeCompare(b));
    if (!order.length) return { ok: false, reason: "Nenhuma imagem cadastrada no ADM." };
    // cor inicial de cada round: a mesma para os dois jogadores
    const starts = order.map((id) => {
      const x = idx[id] || {};
      return x.start && Color.hexToRgb(x.start) ? x.start.toUpperCase() : this.farColor(x.hex || "#808080");
    });
    const r = await DB.txn("game", (g) => {
      g = g || {};
      if (!force && g.phase && g.phase !== "lobby") return;
      return { phase: "round", round: 0, order, starts, total: order.length, seq: (g.seq || 0) + 1, t: Date.now() };
    });
    return { ok: r.committed };
  },

  async finishRound(seq, round, force) {
    const g = await DB.get("game");
    if (!g || g.seq !== seq || g.round !== round || g.phase !== "round") return false;
    const id = g.order[round];
    const img = await DB.get("imageIndex/" + id);
    const picks = (await DB.get(`picks/${seq}/${round}`)) || {};
    if (!force && !(picks.p1 && picks.p1.ready && picks.p2 && picks.p2.ready)) return false;
    const res = this.computeResult(picks, (img && img.hex) || "#808080");
    await DB.set(`results/${seq}/${round}`, res);
    const t = await DB.txn("game", (cur) => {
      if (!cur || cur.seq !== seq || cur.round !== round || cur.phase !== "round") return;
      cur.phase = "reveal"; cur.t = Date.now(); return cur;
    });
    return t.committed;
  },

  async nextRound(seq, round) {
    const t = await DB.txn("game", (cur) => {
      if (!cur || cur.seq !== seq || cur.round !== round || cur.phase !== "reveal") return;
      if (round + 1 >= (cur.total || 0)) cur.phase = "final";
      else { cur.round = round + 1; cur.phase = "round"; }
      cur.t = Date.now();
      return cur;
    });
    return t.committed;
  },

  // volta todo mundo pro lobby e apaga o progresso (mantém os jogadores)
  async resetProgress() {
    const players = (await DB.get("players")) || {};
    const upd = { picks: null, results: null, back: null };
    this.SLOTS.forEach((k) => {
      if (this.hasPlayer(players[k])) upd[`players/${k}/ready`] = false;
      else if (players[k]) upd[`players/${k}`] = null; // limpa vaga fantasma
    });
    await DB.txn("game", (g) => ({ phase: "lobby", round: 0, total: 0, seq: ((g && g.seq) || 0) + 1, t: Date.now() }));
    await DB.update("", upd);
  },

  // expulsa (apaga a vaga no Firebase) e apaga o progresso
  async kick(k) {
    await DB.remove(`players/${k}`);
    await this.resetProgress();
  },
  async kickAll() {
    await DB.remove("players");
    await this.resetProgress();
  }
};
