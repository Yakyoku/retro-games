// ORBITAL WINGS 2D — 背景の道具箱（色・ノイズ・焼き込み用の小さな絵）。すべて手続き生成で外部素材は使わない
import { hash1 } from '../shared/rng.js';

export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
export const sstep = (a, b, x) => smooth((x - a) / (b - a));

// ---- 色 -----------------------------------------------------------------------
export function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
const h2 = (v) => (v < 16 ? '0' : '') + v.toString(16);
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + h2(Math.round(lerp(A[0], B[0], t))) + h2(Math.round(lerp(A[1], B[1], t))) + h2(Math.round(lerp(A[2], B[2], t)));
}
// 明るさを掛ける（f<1 で暗く、f>1 で明るく）
export function lum(hex, f) { const A = rgb(hex); return '#' + h2(clamp(Math.round(A[0] * f), 0, 255)) + h2(clamp(Math.round(A[1] * f), 0, 255)) + h2(clamp(Math.round(A[2] * f), 0, 255)); }

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

// ---- ノイズ ---------------------------------------------------------------------
// 継ぎ目なく並ぶ 2 次元の値ノイズ（fbm）。n×n の Float32Array（0..1）
export function tileNoise(n, seed, oct = 4, base = 4) {
  const out = new Float32Array(n * n);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = base << o;
    const lat = new Float32Array(f * f);
    for (let i = 0; i < f * f; i++) lat[i] = hash1(i, seed + o * 31);
    for (let y = 0; y < n; y++) {
      const fy = y / n * f, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty), r0 = (iy % f) * f, r1 = ((iy + 1) % f) * f;
      for (let x = 0; x < n; x++) {
        const fx = x / n * f, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), c0 = ix % f, c1 = (ix + 1) % f;
        const a = lat[r0 + c0], b = lat[r0 + c1], c = lat[r1 + c0], d = lat[r1 + c1];
        out[y * n + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// ノイズを「白＋不透明度」の絵にする（雲・霧・星雲・汚れの型。色は tint() で付ける）
export function cloudCanvas(n, seed, lo = 0.4, hi = 0.75, oct = 5, base = 3, pow = 1) {
  const d = tileNoise(n, seed, oct, base);
  const cv = canvas(n, n), c = cv.getContext('2d'), im = c.createImageData(n, n), p = im.data;
  for (let i = 0; i < d.length; i++) {
    let t = (d[i] - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t; t = t * t * (3 - 2 * t);
    if (pow !== 1) t = Math.pow(t, pow);
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = 255; p[i * 4 + 3] = t * 255;
  }
  c.putImageData(im, 0, 0);
  return cv;
}
// 網目状の光（コースティクス・細胞壁）: セル雑音の境目を明るくした、継ぎ目のない絵
export function cellCanvas(n, seed, cells = 6, width = 0.12, pow = 1.6) {
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push((i + hash1(j * cells + i, seed)) / cells, (j + hash1(j * cells + i, seed + 5)) / cells);
  const cv = canvas(n, n), c = cv.getContext('2d'), im = c.createImageData(n, n), p = im.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, ci = (u * cells) | 0, cj = (v * cells) | 0;
    let d1 = 9, d2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ((ci + di) % cells + cells) % cells, jj = ((cj + dj) % cells + cells) % cells, k = (jj * cells + ii) * 2;
      let dx = pts[k] - u, dy = pts[k + 1] - v;
      if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
      if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    let t = 1 - (Math.sqrt(d2) - Math.sqrt(d1)) * cells / width; t = t < 0 ? 0 : t;
    const i = (y * n + x) * 4;
    p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = Math.pow(t, pow) * 255;
  }
  c.putImageData(im, 0, 0);
  return cv;
}
// 白い型に色を付けた複製を返す
export function tint(src, color) {
  const cv = canvas(src.width, src.height), c = cv.getContext('2d');
  c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'destination-in'; c.drawImage(src, 0, 0);
  return cv;
}
// フィルム粒子（白黒の点。弱い不透明度で重ねる）
export function grainTile(n, seed, a = 0.5) {
  const cv = canvas(n, n), c = cv.getContext('2d'), im = c.createImageData(n, n), p = im.data;
  for (let i = 0; i < n * n; i++) {
    const v = hash1(i, seed) - 0.5;
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v > 0 ? 255 : 0; p[i * 4 + 3] = Math.abs(v) * 2 * a * 255;
  }
  c.putImageData(im, 0, 0);
  return cv;
}
// 周期 P（単位 u）の 1 次元ノイズ。P*f0 は整数にする
export function pnoise1(x, n, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash1(((i % n) + n) % n, seed) * (1 - u) + hash1((((i + 1) % n) + n) % n, seed) * u;
}
export function pfbm1(x, P, seed, oct = 4, f0 = 0.125) {
  let a = 0, amp = 0.5, fr = f0, tot = 0;
  for (let o = 0; o < oct; o++) { a += amp * pnoise1(x * fr, Math.max(1, Math.round(P * fr)), seed + o * 17); tot += amp; fr *= 2; amp *= 0.5; }
  return a / tot;
}

// ---- 焼き込み用の小さな絵 ----------------------------------------------------------
// 放射状の光（中心が明るく外へ消える）。core>0 で白い芯
export function glowSprite(px, color, core = 0, fall = 2) {
  px = Math.max(8, Math.round(px));
  const cv = canvas(px, px), c = cv.getContext('2d'), r = px / 2;
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  for (let i = 0; i <= 8; i++) { const t = i / 8; g.addColorStop(t, rgba(color, Math.pow(1 - t, fall))); }
  c.fillStyle = g; c.fillRect(0, 0, px, px);
  if (core > 0) {
    const g2 = c.createRadialGradient(r, r, 0, r, r, r * core);
    g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.7)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g2; c.fillRect(0, 0, px, px);
  }
  return cv;
}
// 光条つきの星
export function starSprite(px, color) {
  px = Math.max(12, Math.round(px));
  const cv = glowSprite(px, color, 0.22, 3), c = cv.getContext('2d'), r = px / 2;
  c.globalCompositeOperation = 'lighter';
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const g = c.createLinearGradient(r - dx * r, r - dy * r, r + dx * r, r + dy * r);
    g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; const w = Math.max(1, px * 0.035);
    if (dx) c.fillRect(0, r - w / 2, px, w); else c.fillRect(r - w / 2, 0, w, px);
  }
  return cv;
}
// 煙・蒸気のかたまり（柔らかい円の重ね）
export function puffSprite(px, color, seed = 1) {
  px = Math.max(16, Math.round(px));
  const cv = canvas(px, px), c = cv.getContext('2d'), r = px / 2;
  for (let i = 0; i < 9; i++) {
    const a = hash1(i, seed) * TAU, d = hash1(i, seed + 1) * r * 0.42, rr = r * (0.3 + hash1(i, seed + 2) * 0.28);
    const x = r + Math.cos(a) * d, y = r + Math.sin(a) * d;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rgba(color, 0.5)); g.addColorStop(0.6, rgba(color, 0.22)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, px, px);
  }
  return cv;
}
// 泡（縁の屈折と映り込み）
export function bubbleSprite(px, color) {
  px = Math.max(12, Math.round(px));
  const cv = canvas(px, px), c = cv.getContext('2d'), r = px / 2;
  const g = c.createRadialGradient(r, r, r * 0.45, r, r, r * 0.96);
  g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.75, rgba(color, 0.16)); g.addColorStop(0.93, rgba(color, 0.75)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g; c.fillRect(0, 0, px, px);
  const g2 = c.createRadialGradient(r * 0.62, r * 0.6, 0, r * 0.62, r * 0.6, r * 0.3);
  g2.addColorStop(0, 'rgba(255,255,255,0.95)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g2; c.fillRect(0, 0, px, px);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(1, px * 0.03); c.beginPath(); c.arc(r, r, r * 0.74, 0.5, 1.5); c.stroke();
  return cv;
}

// 惑星・月・恒星（輪・大気の縁の光・クレーター・帯）。px は一辺、半径は px*o.r/2
export function planetSprite(px, o) {
  px = Math.round(px);
  const cv = canvas(px, px), c = cv.getContext('2d'), cx = px / 2, cy = px / 2, R = px / 2 * (o.r || 0.6);
  const [lx, ly] = o.light || [-0.6, -0.5];
  const ring = (front) => {
    if (!o.ring) return;
    const q = o.ring;
    c.save(); c.translate(cx, cy); c.rotate(q.tilt || -0.35);
    c.beginPath(); if (front) c.rect(-px, 0, px * 2, px); else c.rect(-px, -px, px * 2, px); c.clip();
    for (let i = 0; i < 14; i++) {
      const t = i / 13, rr = R * lerp(q.rIn, q.rOut, t);
      c.strokeStyle = rgba(i % 3 ? q.c : (q.c2 || q.c), (q.a || 0.5) * (0.35 + 0.65 * hash1(i, o.seed || 3)) * (i === 5 || i === 9 ? 0.15 : 1));
      c.lineWidth = R * (q.rOut - q.rIn) / 13 * 0.9;
      c.beginPath(); c.ellipse(0, 0, rr, rr * (q.flat || 0.22), 0, 0, TAU); c.stroke();
    }
    c.restore();
  };
  // 外側の大気（にじむ光）
  if (o.atmo) {
    const g = c.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.28);
    g.addColorStop(0, rgba(o.atmo, 0.55)); g.addColorStop(0.35, rgba(o.atmo, 0.18)); g.addColorStop(1, rgba(o.atmo, 0));
    c.fillStyle = g; c.fillRect(0, 0, px, px);
  }
  ring(false);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  const g = c.createRadialGradient(cx + lx * R * 0.5, cy + ly * R * 0.5, R * 0.05, cx, cy, R * 1.05);
  g.addColorStop(0, o.base[0]); g.addColorStop(0.55, o.base[1]); g.addColorStop(1, o.base[2]);
  c.fillStyle = g; c.fillRect(0, 0, px, px);
  if (o.tex) {
    // 模様（帯なら横に引き伸ばす）
    c.save(); c.translate(cx, cy); c.rotate(o.bandTilt || 0);
    for (let k = 0; k < (o.texN || 2); k++) {
      c.globalAlpha = o.texA || 0.35;
      const sx = o.bands ? R * 6 : R * 2.2, sy = o.bands ? R * (0.5 + k * 0.35) : R * 2.2;
      c.drawImage(k ? o.tex2 || o.tex : o.tex, -sx / 2 + (k ? R * 0.3 : 0), -R - (k ? R * 0.1 : 0), sx, sy);
      if (o.bands) c.drawImage(o.tex, -sx / 2, -R + sy * 0.9, sx, sy * 1.3);
    }
    c.restore(); c.globalAlpha = 1;
  }
  for (let i = 0; i < (o.craters || 0); i++) {
    const a = hash1(i, (o.seed || 1) + 40) * TAU, d = Math.sqrt(hash1(i, (o.seed || 1) + 41)) * R * 0.9, rr = R * (0.03 + hash1(i, (o.seed || 1) + 42) ** 2 * 0.16);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, sq = Math.sqrt(Math.max(0.05, 1 - (d / R) ** 2));
    c.save(); c.translate(x, y); c.rotate(a); c.scale(sq, 1);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = Math.max(1, rr * 0.18); c.beginPath(); c.arc(-lx * rr * 0.15, -ly * rr * 0.15, rr, 0, TAU); c.stroke();
    c.restore();
  }
  if (o.cracks) {
    // 光る割れ目（溶岩の月など）
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, al, col] of [[0.05, 0.25, o.cracks], [0.02, 0.7, o.cracks], [0.008, 0.9, '#fff2c0']]) {
      c.strokeStyle = rgba(col, al); c.lineWidth = Math.max(0.7, R * w);
      for (let i = 0; i < 11; i++) {
        let a = hash1(i, 71) * TAU, d = Math.sqrt(hash1(i, 72)) * R * 0.8, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, dir = hash1(i, 73) * TAU;
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 7; k++) { dir += (hash1(i * 13 + k, 74) - 0.5) * 1.6; x += Math.cos(dir) * R * 0.11; y += Math.sin(dir) * R * 0.11; c.lineTo(x, y); }
        c.stroke();
      }
    }
  }
  // 影の側（昼夜の境）
  const sh = c.createRadialGradient(cx + lx * R * 0.75, cy + ly * R * 0.75, R * 0.55, cx + lx * R * 0.3, cy + ly * R * 0.3, R * 1.75);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.45, `rgba(0,0,6,${0.5 * (o.shade ?? 1)})`); sh.addColorStop(0.8, `rgba(0,0,6,${0.96 * (o.shade ?? 1)})`);
  c.fillStyle = sh; c.fillRect(0, 0, px, px);
  // 縁の光（大気）
  if (o.atmo) {
    const rg = c.createRadialGradient(cx - lx * R * 0.12, cy - ly * R * 0.12, R * 0.8, cx - lx * R * 0.12, cy - ly * R * 0.12, R * 1.08);
    rg.addColorStop(0, rgba(o.atmo, 0)); rg.addColorStop(1, rgba(o.atmo, 0.75));
    c.fillStyle = rg; c.fillRect(0, 0, px, px);
  }
  c.restore();
  ring(true);
  return cv;
}
