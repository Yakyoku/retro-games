// ORBITAL WINGS 3D — 環境のテクスチャを手続きで焼く（地形の色・法線・発光、空、天体、粒子、光の網）
// どれも面の切り替え時に 1 回だけ作り、面が変わるときに dispose する。大きさは最大 1024。
import * as THREE from 'three';
import { makeRng } from '../shared/rng.js';
import { fbm2, TAU, lerp, clamp01 } from './envKit3d.js';

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const c2d = (c) => c.getContext('2d', { willReadFrequently: true });
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
// 端をまたぐ絵を 9 回描いて継ぎ目をなくす
function tile(x, S, fn) { for (let dy = -S; dy <= S; dy += S) for (let dx = -S; dx <= S; dx += S) { x.save(); x.translate(dx, dy); fn(); x.restore(); } }
function tex(canvas, o = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = o.wrapS ?? THREE.RepeatWrapping; t.wrapT = o.wrapT ?? THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 1; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---- 繰り返せる雑音の板（256）。全面で使い回す --------------------------------------------
let _noise, _noiseD;
export function noiseTile() {
  if (_noise) return _noise;
  const S = 256, c = cv(S), x = c2d(c), im = x.createImageData(S, S), d = im.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = fbm2(i / 32, j / 32, 7, 5, 8, 8) * 255, o = (j * S + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  x.putImageData(im, 0, 0); _noise = c; _noiseD = d;
  return c;
}
// ちぎれ雲の抜き型（アルファ）。星雲・雲の形を崩すのに使う
let _wisp;
function wispMask() {
  if (_wisp) return _wisp;
  const S = 256, c = cv(S), x = c2d(c), im = x.createImageData(S, S), d = im.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = fbm2(i / 40, j / 40, 21, 5), b = fbm2(i / 14 + a * 3, j / 14 - a * 2, 33, 3);
    const v = clamp01((a * 0.65 + b * 0.5 - 0.36) * 3.2), o = (j * S + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = v * 255;
  }
  x.putImageData(im, 0, 0); _wisp = c;
  return c;
}

// 円錐の最大値合成＝ボロノイ模様（細胞・割れた岩盤）。戻り値: canvas と種の位置
function voronoi(S, n, rng, R, stops) {
  const c = cv(S), x = c2d(c), seeds = [];
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'lighten';
  const g = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < g * g; i++) {
    const px = ((i % g) + 0.15 + rng() * 0.7) * S / g, py = (Math.floor(i / g) + 0.15 + rng() * 0.7) * S / g, r = R * (0.85 + rng() * 0.3);
    seeds.push([px, py, r]);
    tile(x, S, () => {
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      for (const [t, v] of stops) gr.addColorStop(t, grey(v));
      x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  return { c, seeds };
}
// ゆらぐ折れ線
function wavy(x, x0, y0, len, amp, rng, step = 16, vertical = false) {
  x.beginPath();
  let y = y0;
  for (let t = 0; t <= len; t += step) { y += (rng() - 0.5) * amp; if (vertical) (t ? x.lineTo(y, x0 + t) : x.moveTo(y, x0 + t)); else (t ? x.lineTo(x0 + t, y) : x.moveTo(x0 + t, y)); }
  x.stroke();
}
function crack(x, px, py, n, rng, w = 1.5) {
  let a = rng() * TAU;
  x.lineWidth = w; x.beginPath(); x.moveTo(px, py);
  for (let i = 0; i < n; i++) { a += (rng() - 0.5) * 1.3; px += Math.cos(a) * 9; py += Math.sin(a) * 9; x.lineTo(px, py); }
  x.stroke();
}
function glowStroke(x, color, w, fn) {   // 光る線: にじみ＋芯
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
  x.shadowColor = color; x.shadowBlur = w * 5; x.strokeStyle = rgba(color, 0.55); x.lineWidth = w * 2.2; fn();
  x.shadowBlur = w * 2; x.strokeStyle = color; x.lineWidth = w; fn();
  x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = Math.max(0.6, w * 0.4); fn();
  x.restore();
}
function glowDot(x, px, py, r, color, a = 1) {
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
}

// ---- 地形の材質 -----------------------------------------------------------------------
// 高さ（512 の濃淡）を面ごとの絵で作り、そこから法線マップと色を導く。発光は別の板。
const H = 512;
const TERRAIN = {
  // 火山岩: 割れた岩盤＋層理、割れ目に溶岩
  rock(h, e, rng, cfg) {
    const v = voronoi(H, 30, rng, 120, [[0, 255], [0.55, 215], [0.86, 120], [1, 0]]);
    h.globalAlpha = 0.85; h.globalCompositeOperation = 'multiply'; h.drawImage(v.c, 0, 0); h.globalCompositeOperation = 'source-over';
    h.globalAlpha = 0.28; h.strokeStyle = '#000';
    for (let i = 0; i < 16; i++) { h.lineWidth = 1.5 + rng() * 4; const y = rng() * H; tile(h, H, () => wavy(h, 0, y, H, 9, makeRng(i + 3), 20)); }
    h.globalAlpha = 0.5; h.fillStyle = '#000';
    for (let i = 0; i < 70; i++) { const px = rng() * H, py = rng() * H, r = 1 + rng() * 3; h.beginPath(); h.arc(px, py, r, 0, TAU); h.fill(); }
    h.globalAlpha = 1;
    // 溶岩: ボロノイの境目のうち、雑音で選んだ帯だけ光らせる
    const vd = c2d(v.c).getImageData(0, 0, H, H).data, im = e.createImageData(H, H), d = im.data, [r, g, b] = rgb(cfg.emis);
    for (let j = 0; j < H; j++) for (let i = 0; i < H; i++) {
      const o = (j * H + i) * 4, m = clamp01((fbm2(i / 64, j / 64, 5, 3, 8, 8) - 0.47) * 6);
      const k = Math.pow(1 - vd[o] / 255, 2.4) * m;
      d[o] = Math.min(255, r * k * 1.5 + 255 * k * k * k); d[o + 1] = Math.min(255, g * k * 1.3 + 200 * k * k * k); d[o + 2] = b * k; d[o + 3] = 255;
    }
    e.putImageData(im, 0, 0);
    return { strength: 3.2 };
  },
  // 石積み: 段ごとにずれた切石、目地、欠け、光る紋様
  masonry(h, e, rng, cfg) {
    h.fillStyle = grey(52); h.fillRect(0, 0, H, H);
    const rows = 8, rh = H / rows, glyphs = [];
    for (let r = 0; r < rows; r++) {
      let px = rng() * 80;
      const x0 = px;
      while (px < x0 + H - 30) {
        let w = 70 + rng() * 90; if (px + w > x0 + H - 40) w = x0 + H - px;
        const v = 130 + rng() * 80, y = r * rh;
        tile(h, H, () => {
          h.fillStyle = grey(v); h.fillRect(px + 3, y + 3, w - 6, rh - 6);
          h.strokeStyle = grey(v + 30, 0.7); h.lineWidth = 2; h.strokeRect(px + 5, y + 5, w - 10, rh - 10);
          h.fillStyle = grey(v - 26, 0.6); h.fillRect(px + 3, y + rh - 9, w - 6, 6);
        });
        if (rng() < 0.07 && w > 80) glyphs.push([px + w / 2, y + rh / 2]);
        px += w;
      }
    }
    h.strokeStyle = '#000'; h.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) { const px = rng() * H, py = rng() * H; tile(h, H, () => crack(h, px, py, 8 + rng() * 10, makeRng(i + 40), 1.6)); }
    h.fillStyle = '#000'; h.globalAlpha = 0.45;
    for (let i = 0; i < 46; i++) { const px = rng() * H, py = Math.round(rng() * rows) * rh + (rng() - 0.5) * 8, r = 2 + rng() * 6; tile(h, H, () => { h.beginPath(); h.arc(px, py, r, 0, TAU); h.fill(); }); }
    h.globalAlpha = 1;
    // 紋様（格子点を結ぶ文字のような線）
    e.fillStyle = '#000'; e.fillRect(0, 0, H, H);
    for (const [gx, gy] of glyphs) {
      const pts = []; for (let i = 0; i < 5; i++) pts.push([gx + (Math.floor(rng() * 4) - 1.5) * 9, gy + (Math.floor(rng() * 4) - 1.5) * 9]);
      const path = () => { e.beginPath(); pts.forEach(([a, b], i) => (i ? e.lineTo(a, b) : e.moveTo(a, b))); e.stroke(); e.beginPath(); e.arc(gx, gy, 19, 0, TAU); e.stroke(); };
      tile(e, H, () => glowStroke(e, cfg.emis, 2.2, path));
      h.strokeStyle = grey(30); h.lineWidth = 4; tile(h, H, () => { h.beginPath(); pts.forEach(([a, b], i) => (i ? h.lineTo(a, b) : h.moveTo(a, b))); h.stroke(); h.beginPath(); h.arc(gx, gy, 19, 0, TAU); h.stroke(); });
    }
    return { strength: 2.6, noise: 0.22 };
  },
  // 彫られた巨石: 大きな切石、のみ跡、渦の帯、ひび。発光は小さな象嵌
  carved(h, e, rng, cfg) {
    h.fillStyle = grey(60); h.fillRect(0, 0, H, H);
    const B = 128;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const px = c * B + (r & 1) * 64, py = r * B, v = 140 + rng() * 60;
      tile(h, H, () => {
        h.fillStyle = grey(v); h.fillRect(px + 4, py + 4, B - 8, B - 8);
        h.strokeStyle = grey(v + 34, 0.8); h.lineWidth = 3; h.strokeRect(px + 7, py + 7, B - 14, B - 14);
        if (r === 1) { h.strokeStyle = grey(v - 60); h.lineWidth = 5; for (let k = 0; k < 3; k++) h.strokeRect(px + 26 + k * 13, py + 26 + k * 13, B - 52 - k * 26, B - 52 - k * 26); }
        else if (r === 3 && (c & 1)) { h.strokeStyle = grey(v - 60); h.lineWidth = 5; h.beginPath(); for (let a = 0; a < 14; a += 0.25) h.lineTo(px + 64 + Math.cos(a) * a * 3.2, py + 64 + Math.sin(a) * a * 3.2); h.stroke(); }
      });
    }
    h.strokeStyle = '#000'; h.globalAlpha = 0.22; h.lineWidth = 1.5;
    for (let i = 0; i < 380; i++) { const px = rng() * H, py = rng() * H, l = 5 + rng() * 9; h.beginPath(); h.moveTo(px, py); h.lineTo(px + l, py + l * 0.6); h.stroke(); }
    h.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) { const px = rng() * H, py = rng() * H; tile(h, H, () => crack(h, px, py, 12 + rng() * 14, makeRng(i + 60), 2)); }
    h.globalAlpha = 1;
    e.fillStyle = '#000'; e.fillRect(0, 0, H, H);
    for (let r = 0; r < 4; r += 2) for (let c = 0; c < 4; c++) { const px = c * B + 64 + (((r + 1) & 1) * 64), py = (r + 1) * B + 64; tile(e, H, () => { glowDot(e, px - 0, py, 12, cfg.emis, 0.9); }); h.fillStyle = grey(20); tile(h, H, () => { h.beginPath(); h.arc(px, py, 5, 0, TAU); h.fill(); }); }
    return { strength: 2.8, noise: 0.25 };
  },
  // 金属板: 不ぞろいの板、継ぎ目、リベット、通気口、表示灯
  plates(h, e, rng, cfg) {
    h.fillStyle = grey(46); h.fillRect(0, 0, H, H);
    e.fillStyle = '#000'; e.fillRect(0, 0, H, H);
    const G = 64, used = new Set();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (used.has(r * 8 + c)) continue;
      let w = 1 + Math.floor(rng() * 3), hh = rng() < 0.3 ? 2 : 1;
      if (c + w > 8) w = 8 - c; if (r + hh > 8) hh = 8 - r;
      for (let a = 0; a < hh; a++) for (let b = 0; b < w; b++) if (used.has((r + a) * 8 + c + b)) { w = b || 1; hh = 1; }
      for (let a = 0; a < hh; a++) for (let b = 0; b < w; b++) used.add((r + a) * 8 + c + b);
      const px = c * G, py = r * G, W = w * G, HH2 = hh * G, v = 132 + rng() * 60, kind = rng();
      h.fillStyle = grey(v); h.fillRect(px + 3, py + 3, W - 6, HH2 - 6);
      h.strokeStyle = grey(v + 40, 0.8); h.lineWidth = 2; h.strokeRect(px + 5, py + 5, W - 10, HH2 - 10);
      h.fillStyle = grey(235);
      for (const [a, b] of [[10, 10], [W - 10, 10], [10, HH2 - 10], [W - 10, HH2 - 10]]) { h.beginPath(); h.arc(px + a, py + b, 3.4, 0, TAU); h.fill(); }
      if (kind < 0.2 && W >= 128) { h.fillStyle = grey(30); for (let k = 0; k < 6; k++) h.fillRect(px + 22, py + 16 + k * 6, W - 44, 3); }
      else if (kind < 0.36) { h.fillStyle = grey(v - 34); h.fillRect(px + 16, py + 16, W - 32, HH2 - 32); h.strokeStyle = grey(20); h.strokeRect(px + 16, py + 16, W - 32, HH2 - 32); }
      else if (kind < 0.5) { const lx = px + W / 2, ly = py + HH2 / 2; e.fillStyle = cfg.emis; e.shadowColor = cfg.emis; e.shadowBlur = 12; e.fillRect(lx - 9, ly - 4, 18, 8); e.shadowBlur = 0; e.fillStyle = 'rgba(255,255,255,.8)'; e.fillRect(lx - 6, ly - 2, 12, 4); h.fillStyle = grey(25); h.fillRect(lx - 12, ly - 7, 24, 14); }
    }
    for (const y of [150, 406]) { h.fillStyle = grey(215); h.fillRect(0, y - 7, H, 14); h.fillStyle = grey(110); h.fillRect(0, y + 3, H, 4); for (let k = 0; k < 8; k++) { h.fillStyle = grey(250); h.fillRect(k * 64 + 28, y - 9, 8, 18); } }
    glowStroke(e, cfg.emis2 || cfg.emis, 1.6, () => { e.setLineDash([26, 38]); e.beginPath(); e.moveTo(0, 150); e.lineTo(H, 150); e.stroke(); e.setLineDash([]); });
    return { strength: 2.4, noise: 0.16, blur: 0.6 };
  },
  // 肉の皺: うねる畝、血管、発光斑
  flesh(h, e, rng, cfg) {
    h.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const y = rng() * H, w = 14 + rng() * 26, ph = rng() * TAU, f = 1 + Math.floor(rng() * 3), am = 8 + rng() * 22;
      h.strokeStyle = grey(i & 1 ? 235 : 20, 0.33); h.lineWidth = w;
      tile(h, H, () => { h.beginPath(); for (let t = 0; t <= H; t += 8) h.lineTo(t, y + Math.sin(t / H * TAU * f + ph) * am); h.stroke(); });
    }
    e.fillStyle = '#000'; e.fillRect(0, 0, H, H);
    for (let i = 0; i < 7; i++) {
      const sr = makeRng(i + 90); let px = rng() * H, py = rng() * H, a = rng() * TAU; const pts = [[px, py]];
      for (let k = 0; k < 26; k++) { a += (sr() - 0.5) * 0.9; px += Math.cos(a) * 12; py += Math.sin(a) * 12; pts.push([px, py]); }
      h.strokeStyle = grey(245, 0.6); h.lineWidth = 7; tile(h, H, () => { h.beginPath(); pts.forEach(([u, v], k) => (k ? h.lineTo(u, v) : h.moveTo(u, v))); h.stroke(); });
      e.globalAlpha = 0.5; tile(e, H, () => glowStroke(e, cfg.emis2 || cfg.emis, 1.4, () => { e.beginPath(); pts.forEach(([u, v], k) => (k ? e.lineTo(u, v) : e.moveTo(u, v))); e.stroke(); }));
      e.globalAlpha = 1;
      for (let k = 3; k < pts.length; k += 5 + Math.floor(sr() * 5)) { const [u, v] = pts[k], r = 10 + sr() * 12; tile(e, H, () => glowDot(e, u, v, r, cfg.emis, 0.95)); tile(h, H, () => { h.fillStyle = grey(255, 0.7); h.beginPath(); h.arc(u, v, r * 0.5, 0, TAU); h.fill(); }); }
    }
    return { strength: 5.5, noise: 0.12, blur: 4 };
  },
  // 細胞膜: 細胞の仕切りと核
  membrane(h, e, rng, cfg) {
    const v = voronoi(H, 22, rng, 150, [[0, 255], [0.3, 225], [0.75, 130], [1, 0]]);
    h.globalAlpha = 0.9; h.drawImage(v.c, 0, 0); h.globalAlpha = 1;
    const vd = c2d(v.c).getImageData(0, 0, H, H).data, im = e.createImageData(H, H), d = im.data, [r, g, b] = rgb(cfg.emis2 || cfg.emis);
    for (let o = 0; o < H * H * 4; o += 4) { const k = Math.pow(1 - vd[o] / 255, 5) * 0.55; d[o] = r * k; d[o + 1] = g * k; d[o + 2] = b * k; d[o + 3] = 255; }
    e.putImageData(im, 0, 0);
    for (const [px, py, rr] of v.seeds) {
      if (rng() < 0.4) continue;
      const ox = px + (rng() - 0.5) * 16, oy = py + (rng() - 0.5) * 16, r2 = rr * (0.1 + rng() * 0.08);
      tile(h, H, () => { h.fillStyle = grey(70); h.beginPath(); h.arc(ox, oy, r2 * 1.5, 0, TAU); h.fill(); h.fillStyle = grey(255); h.beginPath(); h.arc(ox, oy, r2, 0, TAU); h.fill(); });
      tile(e, H, () => glowDot(e, ox, oy, r2 * 2.6, cfg.emis, 0.9));
    }
    return { strength: 3.0, noise: 0.1, blur: 1.2 };
  },
  // 要塞の装甲: 整った板、はめ込み、配管、走る光
  armor(h, e, rng, cfg) {
    h.fillStyle = grey(40); h.fillRect(0, 0, H, H);
    e.fillStyle = '#000'; e.fillRect(0, 0, H, H);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      const px = c * 128 + (r & 1) * 64, py = r * 64, v = 150 + rng() * 40, kind = rng();
      tile(h, H, () => {
        h.fillStyle = grey(v); h.fillRect(px + 2, py + 2, 124, 60);
        h.strokeStyle = grey(v + 36, 0.9); h.lineWidth = 2; h.strokeRect(px + 4, py + 4, 120, 56);
        if (kind < 0.35) { h.fillStyle = grey(v - 40); h.fillRect(px + 14, py + 12, 100, 40); h.strokeStyle = grey(24); h.strokeRect(px + 14, py + 12, 100, 40); }
        else if (kind < 0.5) { h.fillStyle = grey(26); for (let k = 0; k < 9; k++) h.fillRect(px + 20 + k * 10, py + 14, 5, 36); }
        h.fillStyle = grey(240); for (const [a, b] of [[9, 9], [119, 9], [9, 55], [119, 55]]) h.fillRect(px + a - 2, py + b - 2, 4, 4);
      });
      if (kind > 0.86) tile(e, H, () => { e.fillStyle = cfg.emis2 || cfg.emis; e.shadowColor = e.fillStyle; e.shadowBlur = 10; e.fillRect(px + 100, py + 26, 12, 8); e.shadowBlur = 0; });
    }
    for (const y of [96, 352]) {
      h.fillStyle = grey(225); h.fillRect(0, y - 9, H, 18); h.fillStyle = grey(100); h.fillRect(0, y + 5, H, 4); h.fillStyle = grey(30); h.fillRect(0, y - 2, H, 4);
      glowStroke(e, cfg.emis, 2, () => { e.setLineDash([40, 24]); e.beginPath(); e.moveTo(0, y); e.lineTo(H, y); e.stroke(); e.setLineDash([]); });
    }
    return { strength: 2.2, noise: 0.12, blur: 0.5 };
  },
};

export function bakeTerrain(cfg, pal, aniso = 4) {
  const t0 = performance.now(), rng = makeRng(cfg.seed || 1), N = noiseTile();
  const hc = cv(H), h = c2d(hc), ec = cv(H), e = c2d(ec);
  h.fillStyle = grey(150); h.fillRect(0, 0, H, H);
  h.globalAlpha = 0.6; h.globalCompositeOperation = 'overlay'; h.drawImage(N, 0, 0, H, H); h.globalAlpha = 1; h.globalCompositeOperation = 'source-over';
  e.fillStyle = '#000'; e.fillRect(0, 0, H, H);
  const r = TERRAIN[cfg.kind](h, e, rng, cfg) || {};
  // 高さを少しぼかしてから読む
  let hd;
  if (r.blur !== 0) { const bc = cv(H), b = c2d(bc); b.filter = `blur(${r.blur ?? 0.8}px)`; tile(b, H, () => b.drawImage(hc, 0, 0)); hd = b.getImageData(0, 0, H, H).data; }
  else hd = h.getImageData(0, 0, H, H).data;
  // 法線マップと色（暗 → 基調 → 明の 3 色を高さと雑音で混ぜ、くぼみは暗く）
  const nc = cv(H), nx = c2d(nc), nim = nx.createImageData(H, H), nd = nim.data;
  const ac = cv(H), ax = c2d(ac), aim = ax.createImageData(H, H), ad = aim.data;
  const ed = e.getImageData(0, 0, H, H).data;
  const cD = rgb(cfg.pal?.[2] || pal.ground[2]), cM = rgb(cfg.pal?.[0] || pal.ground[0]), cL = rgb(cfg.pal?.[1] || pal.ground[1]);
  const S = r.strength ?? 2.5, M = H - 1, nz = r.noise ?? 0.3;
  noiseTile();
  for (let j = 0; j < H; j++) for (let i = 0; i < H; i++) {
    const o = (j * H + i) * 4;
    const l = hd[(j * H + ((i - 1) & M)) * 4], rr = hd[(j * H + ((i + 1) & M)) * 4], u = hd[(((j - 1) & M) * H + i) * 4], dn = hd[(((j + 1) & M) * H + i) * 4];
    const dx = (rr - l) / 255 * S, dy = (dn - u) / 255 * S, il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    nd[o] = (-dx * il * 0.5 + 0.5) * 255; nd[o + 1] = (dy * il * 0.5 + 0.5) * 255; nd[o + 2] = (il * 0.5 + 0.5) * 255; nd[o + 3] = 255;
    const n1 = _noiseD[(((j * 2) & 255) * 256 + ((i * 2) & 255)) * 4] / 255, n2 = _noiseD[(((j * 5 + 77) & 255) * 256 + ((i * 5 + 31) & 255)) * 4] / 255;
    let t = hd[o] / 255 * (1 - nz) + n1 * nz + (n2 - 0.5) * 0.12;
    t = clamp01(t * 1.15 - 0.12 - Math.min(0.3, (Math.abs(dx) + Math.abs(dy)) * 0.12));
    const em = Math.max(ed[o], ed[o + 1], ed[o + 2]) / 255, dk = 1 - em * 0.5;
    for (let k = 0; k < 3; k++) ad[o + k] = (t < 0.5 ? lerp(cD[k], cM[k], t * 2) : lerp(cM[k], cL[k], t * 2 - 1)) * dk;
    ad[o + 3] = 255;
  }
  nx.putImageData(nim, 0, 0); ax.putImageData(aim, 0, 0);
  // 色は 1024 に引き伸ばし、細かい粒を重ねる
  const A = cv(1024), a = c2d(A);
  a.imageSmoothingQuality = 'high'; a.drawImage(ac, 0, 0, 1024, 1024);
  a.globalCompositeOperation = 'overlay'; a.globalAlpha = 0.42; a.drawImage(N, 0, 0, 256, 256, 0, 0, 512, 512); a.drawImage(N, 0, 0, 256, 256, 512, 0, 512, 512); a.drawImage(N, 0, 0, 256, 256, 0, 512, 512, 512); a.drawImage(N, 0, 0, 256, 256, 512, 512, 512, 512);
  a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1;
  const out = { map: tex(A, { aniso }), normalMap: tex(nc, { data: true, aniso }), emissiveMap: tex(ec, { aniso: Math.min(2, aniso) }) };
  out.ms = performance.now() - t0;
  return out;
}

// ---- 空（1024×512。横は 90°、縦は ±24° ぶん。球には鏡映しで 4 回貼る） ------------------------
export function bakeSky(cfg) {
  const W = 1024, Hh = 512, c = cv(W, Hh), x = c2d(c), rng = makeRng(cfg.seed || 5);
  const g = x.createLinearGradient(0, 0, 0, Hh);
  for (const [t, col] of cfg.stops) g.addColorStop(t, col);
  x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  // 色のにじみ（大きな光の染み）
  x.globalCompositeOperation = 'screen';
  for (const [px, py, r, col, a] of cfg.blooms || []) { const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); x.fillStyle = gr; x.fillRect(px - r, py - r, r * 2, r * 2); }
  // 星雲: 色の塊を重ね、ちぎれ雲の型で抜く
  for (const nb of cfg.neb || []) {
    const nc = cv(W, Hh), n = c2d(nc);
    n.globalCompositeOperation = 'lighter';
    for (let i = 0; i < nb.count; i++) {
      const t = rng(), px = nb.x + (t - 0.5) * nb.w + (rng() - 0.5) * nb.spread, py = nb.y + (t - 0.5) * nb.slope * nb.w + (rng() - 0.5) * nb.spread * 0.6, r = nb.r * (0.5 + rng());
      const col = nb.cols[Math.floor(rng() * nb.cols.length)], gr = n.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, rgba(col, nb.a)); gr.addColorStop(1, rgba(col, 0)); n.fillStyle = gr; n.fillRect(px - r, py - r, r * 2, r * 2);
    }
    n.globalCompositeOperation = 'destination-in';
    const wm = wispMask(), s = nb.scale || 2.2, ox = rng() * 100, oy = rng() * 100;
    const pc = cv(W, Hh), p = c2d(pc); p.fillStyle = p.createPattern(wm, 'repeat'); p.save(); p.translate(-ox, -oy); p.scale(s, s * (nb.sy || 0.7)); p.fillRect(0, 0, W, Hh * 2); p.restore();
    n.drawImage(pc, 0, 0);
    x.globalCompositeOperation = nb.mode || 'screen'; x.drawImage(nc, 0, 0);
  }
  // 地平線のもや
  x.globalCompositeOperation = 'source-over';
  if (cfg.haze) { const [col, y0, y1, a] = cfg.haze, gr = x.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, a)); gr.addColorStop(1, rgba(col, a)); x.fillStyle = gr; x.fillRect(0, y0, W, Hh - y0); }
  return tex(c, { wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, aniso: 2 });
}

// ---- 天体（1024×512 に 2 コマ。惑星・月・恒星・輪） ------------------------------------------
function planet(x, cx, cy, R, o, rng) {
  const lx = o.light?.[0] ?? -0.5, ly = o.light?.[1] ?? -0.4;
  if (o.atmo) { const g = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.22); g.addColorStop(0, rgba(o.atmo, 0.55)); g.addColorStop(1, rgba(o.atmo, 0)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.25, 0, TAU); x.fill(); }
  const ring = (front) => {
    if (!o.ring) return;
    x.save(); x.translate(cx, cy); x.rotate(o.ring.tilt ?? -0.35); x.scale(1, o.ring.k ?? 0.28);
    x.beginPath(); x.rect(-R * 3, front ? 0 : -R * 3, R * 6, R * 3); x.clip();
    for (let i = 0; i < 9; i++) { const rr = R * (1.35 + i * 0.085); x.strokeStyle = rgba(o.ring.col, 0.15 + 0.4 * ((i * 7) % 5) / 5); x.lineWidth = R * 0.06; x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.stroke(); }
    x.restore();
  };
  ring(false);
  x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
  x.fillStyle = o.base; x.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (o.bands) for (let i = 0; i < 22; i++) { const y = cy - R + rng() * R * 2, hh = R * (0.03 + rng() * 0.1); x.fillStyle = rgba(o.bands[i % o.bands.length], 0.25 + rng() * 0.3); x.beginPath(); x.ellipse(cx, y, R * 1.1, hh, (o.tilt ?? 0.15), 0, TAU); x.fill(); }
  if (o.blots) for (let i = 0; i < 60; i++) { const a = rng() * TAU, d = Math.sqrt(rng()) * R, r = R * (0.04 + rng() * 0.16); x.fillStyle = rgba(o.blots[i % o.blots.length], 0.2 + rng() * 0.3); x.beginPath(); x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, TAU); x.fill(); }
  if (o.craters) for (let i = 0; i < o.craters; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * R * 0.9, r = R * (0.03 + rng() * rng() * 0.14), px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = Math.max(1, r * 0.2); x.beginPath(); x.arc(px - lx * r * 0.2, py - ly * r * 0.2, r, Math.atan2(-ly, -lx) - 1.2, Math.atan2(-ly, -lx) + 1.2); x.stroke();
  }
  if (o.lava) { x.globalCompositeOperation = 'lighter'; for (let i = 0; i < 26; i++) { x.strokeStyle = rgba(o.lava, 0.5); x.shadowColor = o.lava; x.shadowBlur = 8; const px = cx + (rng() - 0.5) * R * 1.6, py = cy + (rng() - 0.5) * R * 1.6; crack(x, px, py, 6 + rng() * 10, rng, 1.6); } x.shadowBlur = 0; x.globalCompositeOperation = 'source-over'; }
  // 明暗（光の側を明るく、反対側を落とす）と縁の大気光
  let g = x.createRadialGradient(cx + lx * R * 0.55, cy + ly * R * 0.55, R * 0.1, cx + lx * R * 0.2, cy + ly * R * 0.2, R * 1.25);
  g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(0.78, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0.94)');
  x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (o.atmo) { g = x.createRadialGradient(cx, cy, R * 0.8, cx, cy, R); g.addColorStop(0, rgba(o.atmo, 0)); g.addColorStop(1, rgba(o.atmo, 0.6)); x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2); x.globalCompositeOperation = 'source-over'; }
  x.restore();
  ring(true);
}
function sun(x, cx, cy, R, o) {
  x.save(); x.globalCompositeOperation = 'lighter';
  let g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 3.2); g.addColorStop(0, rgba(o.glow, 0.7)); g.addColorStop(0.3, rgba(o.glow, 0.22)); g.addColorStop(1, rgba(o.glow, 0));
  x.fillStyle = g; x.fillRect(cx - R * 3.3, cy - R * 3.3, R * 6.6, R * 6.6);
  x.translate(cx, cy);
  for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 4 + i * 0.4); const gr = x.createLinearGradient(-R * 3, 0, R * 3, 0); gr.addColorStop(0, rgba(o.glow, 0)); gr.addColorStop(0.5, rgba(o.glow, 0.5)); gr.addColorStop(1, rgba(o.glow, 0)); x.fillStyle = gr; x.fillRect(-R * 3, -R * 0.04, R * 6, R * 0.08); }
  x.restore();
  g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, o.core); g.addColorStop(1, rgba(o.glow, 0.9));
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
  if (o.bars) { x.fillStyle = o.bars; x.globalAlpha = 0.5; for (let i = 0; i < 5; i++) x.fillRect(cx - R, cy + R * (0.15 + i * 0.17), R * 2, R * (0.03 + i * 0.022)); x.globalAlpha = 1; }
}
export function bakeBodies(list) {
  const c = cv(1024, 512), x = c2d(c), rng = makeRng(77 + list.length);
  list.forEach((b, i) => {
    if (i > 1) return;
    const cx = 256 + i * 512, cy = 256;
    x.save(); x.beginPath(); x.rect(i * 512, 0, 512, 512); x.clip();
    if (b.type === 'sun') sun(x, cx, cy, 70, b); else planet(x, cx, cy, b.ring ? 120 : 190, b, rng);
    x.restore();
  });
  return tex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

// ---- 粒子の絵（256 に 4×4 コマ。全面で使い回す） ----------------------------------------------
// 0 柔らかい点 / 1 火の粉 / 2 泡 / 3 胞子 / 4 煙 / 5 火花 / 6 塵 / 7 雲
let _sprites;
export function spriteAtlas() {
  if (_sprites) return _sprites;
  const c = cv(256), x = c2d(c), rng = makeRng(9);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 32); x.beginPath(); x.rect(-32, -32, 64, 64); x.clip(); fn(); x.restore(); };
  const rad = (r, stops) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r); for (const [t, col] of stops) g.addColorStop(t, col); x.fillStyle = g; x.fillRect(-32, -32, 64, 64); };
  cell(0, () => rad(30, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]));
  cell(1, () => rad(28, [[0, 'rgba(255,255,255,1)'], [0.16, 'rgba(255,240,200,1)'], [0.4, 'rgba(255,170,90,.45)'], [1, 'rgba(255,120,40,0)']]));
  cell(2, () => { rad(30, [[0, 'rgba(255,255,255,.05)'], [0.72, 'rgba(255,255,255,.12)'], [0.86, 'rgba(255,255,255,.9)'], [0.95, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]); x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(-10, -12, 6, 3.4, -0.7, 0, TAU); x.fill(); });
  cell(3, () => { rad(22, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1.4; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.2; x.beginPath(); x.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); x.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); x.stroke(); } });
  const puff = (n, a) => { for (let i = 0; i < n; i++) { const px = (rng() - 0.5) * 30, py = (rng() - 0.5) * 30, r = 9 + rng() * 11, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } };
  cell(4, () => puff(16, 0.3));
  cell(5, () => { rad(10, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-28, 0); x.lineTo(28, 0); x.moveTo(0, -18); x.lineTo(0, 18); x.stroke(); });
  cell(6, () => rad(14, [[0, 'rgba(255,255,255,.9)'], [0.5, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]));
  cell(7, () => { x.scale(1, 0.5); puff(22, 0.22); });
  const t = tex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  _sprites = t;
  return t;
}

// ---- 光の網（コースティクス）の模様（256・繰り返し） -------------------------------------------
let _caustic;
export function causticTex() {
  if (_caustic) return _caustic;
  const S = 256, v = voronoi(S, 26, makeRng(4), 78, [[0, 0], [0.55, 26], [0.85, 110], [1, 255]]);
  // 最大値合成では境目が暗くなるので、白黒を逆にした円錐を「暗い方」で重ねて境目を明るくする
  const c = cv(S), x = c2d(c), rng = makeRng(4);
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'darken';
  for (const [px, py, r] of v.seeds) tile(x, S, () => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, grey(0)); g.addColorStop(0.5, grey(18)); g.addColorStop(0.82, grey(90)); g.addColorStop(1, grey(255)); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); });
  rng();
  _caustic = tex(c, { data: true });
  return _caustic;
}
