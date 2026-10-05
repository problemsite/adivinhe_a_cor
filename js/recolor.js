// ============================================================
//  Recolor: pinta a região da máscara com a cor escolhida,
//  preservando sombras, manchas e contornos da imagem original.
// ============================================================
window.Recolor = (function () {
  function loadImg(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("Falha ao carregar imagem"));
      im.src = src;
    });
  }

  // dilata máscara binária em 1px (8 vizinhos)
  function dilate(m, w, h) {
    const o = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (m[i]) { o[i] = 1; continue; }
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            if (m[yy * w + xx]) { hit = 1; break; }
          }
        }
        o[i] = hit;
      }
    }
    return o;
  }

  class Recolor {
    // pixels: Uint8ClampedArray RGBA; mask: Uint8Array (0/1) w*h
    constructor(pixels, w, h, mask, baseHex) {
      this.w = w; this.h = h;
      this.orig = new Uint8ClampedArray(pixels);
      this.canvas = document.createElement("canvas");
      this.canvas.width = w; this.canvas.height = h;
      this.ctx = this.canvas.getContext("2d");
      this.out = this.ctx.createImageData(w, h);
      this.out.data.set(this.orig);
      this.setMask(mask);
      this.setBase(baseHex);
    }
    setMask(mask) {
      const { w, h } = this;
      const d1 = dilate(mask, w, h), d2 = dilate(d1, w, h);
      const idx = [], al = [];
      for (let i = 0; i < w * h; i++) {
        if (d1[i]) { idx.push(i); al.push(1); }
        else if (d2[i]) { idx.push(i); al.push(0.5); }
      }
      this.idx = Int32Array.from(idx);
      this.alpha = Float32Array.from(al);
      this.Ls = new Float32Array(idx.length);
      this.Cs = new Float32Array(idx.length);
      const o = this.orig;
      for (let k = 0; k < idx.length; k++) {
        const p = idx[k] * 4;
        const lab = Color.rgbToLab(o[p], o[p + 1], o[p + 2]);
        this.Ls[k] = lab[0];
        this.Cs[k] = Math.hypot(lab[1], lab[2]);
      }
      // restaura pixels fora da máscara
      this.out.data.set(o);
      this.count = idx.length;
      // caixa da área pintável (usada para o enquadramento automático)
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      this.box = x1 >= x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    }
    setBase(hex) {
      const rgb = Color.hexToRgb(hex) || [128, 128, 128];
      const lab = Color.rgbToLab(rgb[0], rgb[1], rgb[2]);
      this.Lb = Math.min(99, Math.max(1, lab[0]));
      this.Cb = Math.max(4, Math.hypot(lab[1], lab[2]));
    }
    render(hex) {
      const rgb = Color.hexToRgb(hex) || [128, 128, 128];
      const [Lp, ap, bp] = Color.rgbToLab(rgb[0], rgb[1], rgb[2]);
      const { idx, alpha, Ls, Cs, Lb, Cb, orig } = this;
      const D = this.out.data, tmp = [0, 0, 0];
      // mantém sombras/brilhos: pixel na luminosidade da cor base vira exatamente a cor escolhida
      const kLo = Lp / Math.max(Lb, 8), kHi = (100 - Lp) / Math.max(100 - Lb, 8), invCb = 1 / Cb;
      for (let k = 0, n = idx.length; k < n; k++) {
        const L = Ls[k];
        let Ln = Lp + (L - Lb) * (L <= Lb ? kLo : kHi);
        if (Ln < 0) Ln = 0; else if (Ln > 100) Ln = 100;
        let t = Cs[k] * invCb; if (t > 1.15) t = 1.15;
        Color.labToRgbInto(Ln, ap * t, bp * t, tmp, 0);
        const p = idx[k] * 4, a = alpha[k];
        if (a >= 1) { D[p] = tmp[0]; D[p + 1] = tmp[1]; D[p + 2] = tmp[2]; }
        else {
          D[p] = orig[p] + (tmp[0] - orig[p]) * a;
          D[p + 1] = orig[p + 1] + (tmp[1] - orig[p + 1]) * a;
          D[p + 2] = orig[p + 2] + (tmp[2] - orig[p + 2]) * a;
        }
      }
      this.ctx.putImageData(this.out, 0, 0);
      return this.canvas;
    }
    renderTo(target, hex) {
      this.render(hex);
      target.width = this.w; target.height = this.h;
      target.getContext("2d").drawImage(this.canvas, 0, 0);
    }
    drawOriginal(target) {
      target.width = this.w; target.height = this.h;
      const c = target.getContext("2d");
      const id = c.createImageData(this.w, this.h);
      id.data.set(this.orig);
      c.putImageData(id, 0, 0);
    }

    // carrega a partir das dataURLs salvas (src = imagem, mask = PNG preto/branco)
    static async load(src, maskSrc, baseHex) {
      const [im, mk] = await Promise.all([loadImg(src), loadImg(maskSrc)]);
      const w = im.naturalWidth, h = im.naturalHeight;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      const pixels = x.getImageData(0, 0, w, h).data;
      x.clearRect(0, 0, w, h);
      x.drawImage(mk, 0, 0, w, h);
      const md = x.getImageData(0, 0, w, h).data;
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) mask[i] = md[i * 4] > 127 ? 1 : 0;
      return new Recolor(pixels, w, h, mask, baseHex);
    }
  }
  // Enquadramento: frame = { cx, cy, z } (centro em fração da imagem; z = zoom relativo ao "preencher").
  // Sem frame = automático (preenche o quadro centralizando a parte pintável).
  Recolor.layout = function (cw, ch, W, H, box, frame) {
    const cover = Math.max(cw / W, ch / H);
    let s, cx, cy;
    if (frame && frame.z) {
      s = cover * frame.z; cx = frame.cx * W; cy = frame.cy * H;
    } else {
      s = cover;
      const view = (len, v, a, z) => {
        let off = (a + z) / 2 - v / 2;
        if (z - a <= v) off = Math.min(Math.max(off, z - v + 4), a - 4);
        return Math.min(Math.max(off, 0), Math.max(0, len - v)) + v / 2;
      };
      cx = view(W, cw / s, box.x0, box.x1); cy = view(H, ch / s, box.y0, box.y1);
    }
    const dw = W * s, dh = H * s;
    let left = cw / 2 - cx * s, top = ch / 2 - cy * s;
    left = dw >= cw ? Math.min(0, Math.max(cw - dw, left)) : Math.min(cw - dw, Math.max(0, left));
    top = dh >= ch ? Math.min(0, Math.max(ch - dh, top)) : Math.min(ch - dh, Math.max(0, top));
    return { left, top, dw, dh, s, gaps: dw < cw - 1 || dh < ch - 1 };
  };
  Recolor.fit = function (canvas, rec, frame) {
    const box = canvas.parentElement; if (!box || !rec) return;
    const cw = box.clientWidth, ch = box.clientHeight; if (!cw || !ch) return;
    const L = Recolor.layout(cw, ch, rec.w, rec.h, rec.box || { x0: 0, y0: 0, x1: rec.w, y1: rec.h }, frame);
    Object.assign(canvas.style, { position: "absolute", inset: "auto", left: L.left + "px", top: L.top + "px", width: L.dw + "px", height: L.dh + "px", objectFit: "fill", zIndex: 1 });
    canvas._gaps = L.gaps;
    Recolor.backdrop(canvas);
  };
  // fundo desfocado da própria imagem (já pintada) quando ela não preenche o quadro todo
  Recolor.backdrop = function (canvas) {
    const box = canvas.parentElement; if (!box) return;
    let bg = box.querySelector(":scope > canvas.bg-blur");
    if (!canvas._gaps) { if (bg) bg.style.display = "none"; return; }
    if (!bg) {
      bg = document.createElement("canvas"); bg.className = "bg-blur";
      Object.assign(bg.style, { position: "absolute", left: "-8%", top: "-8%", width: "116%", height: "116%", objectFit: "cover", filter: "blur(18px) brightness(.55) saturate(1.1)", zIndex: 0, pointerEvents: "none" });
      box.insertBefore(bg, box.firstChild);
    }
    bg.style.display = "";
    const k = 96 / Math.max(canvas.width, canvas.height || 1);
    bg.width = Math.max(1, Math.round(canvas.width * k)); bg.height = Math.max(1, Math.round(canvas.height * k));
    bg.getContext("2d").drawImage(canvas, 0, 0, bg.width, bg.height);
  };
  Recolor.loadImg = loadImg;
  Recolor.dilate = dilate;
  return Recolor;
})();
