// ============================================================
//  Sons sintetizados (sem arquivos) — WebAudio
// ============================================================
window.SFX = (function () {
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem("adc_muted") === "1"; } catch (e) {}
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, () => ac(), { once: false, passive: true }));

  function tone(freq, dur, type = "sine", vol = 0.3, slideTo = null, delay = 0) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.2, filterFreq = 1200, delay = 0, type = "bandpass") {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = buf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = filterFreq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t);
  }
  return {
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem("adc_muted", muted ? "1" : "0"); } catch (e) {} return muted; },
    click() { tone(660, 0.07, "triangle", 0.18, 880); },
    pop() { tone(380, 0.12, "sine", 0.35, 900); },
    tick() { tone(1200, 0.04, "square", 0.06); },
    splat(i = 0) { noise(0.12, 0.12, 500 + Math.random() * 700, i * 0.0); tone(180 + Math.random() * 120, 0.09, "sine", 0.12, 60); },
    whoosh() { noise(0.45, 0.22, 900, 0, "bandpass"); },
    slam() { tone(110, 0.35, "sawtooth", 0.25, 45); noise(0.25, 0.3, 300, 0, "lowpass"); },
    ready() { tone(523, 0.1, "triangle", 0.25); tone(784, 0.16, "triangle", 0.25, null, 0.08); },
    unready() { tone(500, 0.12, "triangle", 0.2, 300); },
    drumroll(sec = 2.4) {
      const n = Math.floor(sec * 22);
      for (let i = 0; i < n; i++) noise(0.05, 0.08 + (i / n) * 0.18, 250, (i / 22) * (1 - i / (n * 4)), "lowpass");
    },
    reveal() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, "triangle", 0.22, null, i * 0.06)); },
    flip() { tone(240, 0.08, "square", 0.08, 520); noise(0.06, 0.08, 2500); },
    win() {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i === 6 ? 0.6 : 0.16, "square", 0.12, null, i * 0.09));
    },
    tie() { [440, 440, 554].forEach((f, i) => tone(f, 0.18, "triangle", 0.2, null, i * 0.14)); },
    fanfare() {
      [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, i === 6 ? 0.9 : 0.18, "sawtooth", 0.12, null, i * 0.12));
    },
    join() { tone(660, 0.1, "sine", 0.3, 990); tone(990, 0.15, "sine", 0.2, null, 0.08); },
    error() { tone(200, 0.2, "square", 0.15, 120); }
  };
})();
