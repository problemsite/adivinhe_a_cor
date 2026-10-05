// ============================================================
//  Utilidades de cor: HEX/RGB/HSV, sRGB <-> Lab, ΔE2000
// ============================================================
window.Color = (function () {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function hexToRgb(h) {
    h = String(h || "").trim().replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function rgbStr(rgb) { return `RGB(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`; }

  // HSV: h 0-360, s 0-1, v 0-1
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, mx ? d / mx : 0, mx];
  }

  // sRGB -> linear (tabela) e linear -> sRGB (tabela de 4096)
  const S2L = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const LUTN = 4096;
  const L2S = new Uint8ClampedArray(LUTN + 1);
  for (let i = 0; i <= LUTN; i++) { const c = i / LUTN; L2S[i] = Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); }

  const Xn = 0.95047, Zn = 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  function rgbToLab(r, g, b) {
    const R = S2L[r], G = S2L[g], B = S2L[b];
    const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / Xn;
    const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / Zn;
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  // escreve RGB em out[o..o+2]
  function labToRgbInto(L, a, b, out, o) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const fx3 = fx * fx * fx, fy3 = fy * fy * fy, fz3 = fz * fz * fz;
    const x = (fx3 > 0.008856 ? fx3 : (fx - 16 / 116) / 7.787) * Xn;
    const y = fy3 > 0.008856 ? fy3 : (fy - 16 / 116) / 7.787;
    const z = (fz3 > 0.008856 ? fz3 : (fz - 16 / 116) / 7.787) * Zn;
    let R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    let G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
    let B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    out[o] = L2S[(R <= 0 ? 0 : R >= 1 ? LUTN : (R * LUTN) | 0)];
    out[o + 1] = L2S[(G <= 0 ? 0 : G >= 1 ? LUTN : (G * LUTN) | 0)];
    out[o + 2] = L2S[(B <= 0 ? 0 : B >= 1 ? LUTN : (B * LUTN) | 0)];
  }

  // CIEDE2000
  function deltaE2000(l1, l2) {
    const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    let h1p = Math.atan2(b1, a1p) * deg; if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(b2, a2p) * deg; if (h2p < 0) h2p += 360;
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p) {
      if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
      else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
    const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTh * rad) * Rc;
    return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
  }
  const deltaE2000Rgb = (c1, c2) => deltaE2000(rgbToLab(c1[0], c1[1], c1[2]), rgbToLab(c2[0], c2[1], c2[2]));
  // precisão em % (ΔE 0 = 100%, ΔE 50+ = 0%)
  const accuracy = (dE) => Math.max(0, Math.round((100 - dE * 2) * 10) / 10);

  return { clamp, hexToRgb, rgbToHex, rgbStr, hsvToRgb, rgbToHsv, rgbToLab, labToRgbInto, deltaE2000, deltaE2000Rgb, accuracy, S2L };
})();
