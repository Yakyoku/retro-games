// ORBITAL WINGS 2D — 絵作りの道具箱。
// ・Sprites: 動かない層を実解像度（1u = S px）の画面外キャンバスへ一度だけ描いて使い回す（S が変われば作り直す）
// ・solid / ball / seam …: 金属・石・生体の面を「上からの光」で塗る（階調・縁の光・下側の陰・輪郭・質感）
// ・glow / streak: 発光は事前に描いた放射状の絵を加算合成で重ねる（shadowBlur は使わない）
export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ease = (t) => t * t * (3 - 2 * t);

// ---- 色 -------------------------------------------------------------------
const hexCache = new Map();
export function rgb(hex) {
  let v = hexCache.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; hexCache.set(hex, v); }
  return v;
}
export function rgba(hex, a) { const v = rgb(hex); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; }
export function mix(a, b, t) {
  t = clamp(t, 0, 1);
  const p = rgb(a), q = rgb(b);
  const r = Math.round(p[0] + (q[0] - p[0]) * t), g = Math.round(p[1] + (q[1] - p[1]) * t), bl = Math.round(p[2] + (q[2] - p[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
export const lite = (c, t) => mix(c, '#ffffff', t);
export const dark = (c, t) => mix(c, '#000000', t);

// 決定的な乱数（絵の細部用。毎回同じ絵になる）
export function rnd(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- 形（beginPath から始める関数。b = [x0, y0, x1, y1] の外接箱） -----------------
export function pg(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const f = (c) => { c.beginPath(); for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]); c.closePath(); };
  f.b = [x0, y0, x1, y1]; return f;
}
// 角を丸めた多角形（r = 丸みの半径）
export function rpg(pts, r) {
  const f0 = pg(pts), n = pts.length;
  const f = (c) => {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], d = pts[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (i === 0) c.moveTo(mx, my);
      c.arcTo(b[0], b[1], (b[0] + d[0]) / 2, (b[1] + d[1]) / 2, r);
    }
    c.closePath();
  };
  f.b = f0.b; return f;
}
export function ci(x, y, r) { const f = (c) => { c.beginPath(); c.arc(x, y, r, 0, TAU); }; f.b = [x - r, y - r, x + r, y + r]; return f; }
export function el(x, y, rx, ry, rot = 0) { const f = (c) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }; const m = Math.max(rx, ry); f.b = rot ? [x - m, y - m, x + m, y + m] : [x - rx, y - ry, x + rx, y + ry]; return f; }
export function rr(x, y, w, h, r = 0) {
  const f = (c) => { c.beginPath(); if (r <= 0) { c.rect(x, y, w, h); return; } const q = Math.min(r, w / 2, h / 2); c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + h, q); c.arcTo(x + w, y + h, x, y + h, q); c.arcTo(x, y + h, x, y, q); c.arcTo(x, y, x + w, y, q); c.closePath(); };
  f.b = [x, y, x + w, y + h]; return f;
}
// 滑らかな閉曲線（点を通る。生体・岩の輪郭用）
export function blobPath(pts) {
  const f0 = pg(pts), n = pts.length;
  const f = (c) => {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (i === 0) c.moveTo(p1[0], p1[1]);
      c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    c.closePath();
  };
  f.b = [f0.b[0] - 0.1, f0.b[1] - 0.1, f0.b[2] + 0.1, f0.b[3] + 0.1]; return f;
}
export const rot2 = (pts, a) => { const co = Math.cos(a), si = Math.sin(a); return pts.map(([x, y]) => [x * co - y * si, x * si + y * co]); };
export const mirY = (pts) => pts.map(([x, y]) => [x, -y]).reverse();

// ---- 質感の模様（オーバーレイで重ねる灰色のノイズ） ------------------------------
const texCache = {};
function texCanvas(kind) {
  if (texCache[kind]) return texCache[kind];
  const N = 192, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'), im = c.createImageData(N, N), d = im.data;
  const h = (x, y, s) => { let v = Math.imul(((x % s) + s) % s * 374761393 + ((y % s) + s) % s * 668265263 + s * 1013, 1274126177); v ^= v >>> 15; v = Math.imul(v, 2246822519); return ((v ^ (v >>> 13)) >>> 0) / 4294967296; };
  const vn = (x, y, cells) => { const fx = x / N * cells, fy = y / N * cells, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
    return lerp(lerp(h(ix, iy, cells), h(ix + 1, iy, cells), sx), lerp(h(ix, iy + 1, cells), h(ix + 1, iy + 1, cells), sx), sy); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v;
    if (kind === 'grit') v = 0.5 + (vn(x, y, 32) - 0.5) * 0.45 + (vn(x, y, 12) - 0.5) * 0.45 + (vn(x, y, 4) - 0.5) * 0.35 + (h(x, y, N) - 0.5) * 0.1;
    else if (kind === 'blot') v = 0.5 + (vn(x, y, 6) - 0.5) * 0.9 + (vn(x, y, 16) - 0.5) * 0.5;
    else v = 0.5 + (vn(x * 4, y, 24) - 0.5) * 0.5 + (h(x, y, N) - 0.5) * 0.2;      // brush: 横に流れる筋（磨いた金属）
    const g = clamp(v, 0, 1) * 255, i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  return (texCache[kind] = cv);
}
// 形の内側に模様を重ねる（1u あたり 48 模様画素。rot で模様も回せる）
export function tex(c, sh, kind = 'grit', a = 0.5, rot = 0) {
  c.save(); sh(c); c.clip();
  c.rotate(rot); c.scale(1 / 48, 1 / 48);
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = a;
  c.fillStyle = c.createPattern(texCanvas(kind), 'repeat');
  c.fillRect(-2000, -2000, 4000, 4000);
  c.restore();
}

// ---- 面の塗り（光は画面の上から。K.ly = -1 のとき上下反転の絵を描いている） ---------
export const K = { ly: 1 };
// col: 基本色。o: { hi, lo（明暗の端）, d（縁の帯の太さ u）, ao, rim（強さ 0..1）, line, lw, g: 'v'|'cyl'|'cylx'|'flat', tex, texA }
export function solid(c, sh, col, o = {}) {
  const [x0, y0, x1, y1] = sh.b, ly = K.ly;
  const top = ly > 0 ? y1 : y0, bot = ly > 0 ? y0 : y1;
  const hi = o.hi ?? lite(col, 0.42), lo = o.lo ?? dark(col, 0.55);
  let g;
  if (o.g === 'cylx') { g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, lo); g.addColorStop(0.28, hi); g.addColorStop(0.55, col); g.addColorStop(1, dark(lo, 0.3)); }
  else if (o.g === 'cyl') { g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, col); g.addColorStop(0.22, hi); g.addColorStop(0.55, col); g.addColorStop(1, dark(lo, 0.25)); }
  else if (o.g === 'flat') { g = col; }
  else { g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, hi); g.addColorStop(o.mid ?? 0.4, col); g.addColorStop(1, lo); }
  sh(c); c.fillStyle = g; c.fill();
  if (o.tex) tex(c, sh, o.tex, o.texA ?? 0.45, o.texRot ?? 0);
  const d = o.d ?? 0.05;
  if (d > 0) {
    c.save(); sh(c); c.clip();
    c.lineJoin = 'round';
    c.save(); c.translate(0.25 * d, d * ly); sh(c); c.restore();
    c.strokeStyle = `rgba(0,0,0,${o.ao ?? 0.42})`; c.lineWidth = d * 2.2; c.stroke();
    c.save(); c.translate(-0.25 * d, -d * ly); sh(c); c.restore();
    c.strokeStyle = `rgba(255,255,255,${o.rim ?? 0.5})`; c.lineWidth = d * 1.1; c.stroke();
    c.restore();
  }
  const lw = o.lw ?? 0.03;
  if (lw > 0) { sh(c); c.strokeStyle = o.line ?? dark(col, 0.78); c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
}
// 球（ずらした光点・縁の反射光・輪郭）
export function ball(c, x, y, r, col, o = {}) {
  const ly = K.ly;
  const g = c.createRadialGradient(x - r * 0.3, y + r * 0.38 * ly, r * 0.05, x, y, r);
  g.addColorStop(0, o.hi ?? lite(col, 0.65)); g.addColorStop(0.45, col); g.addColorStop(0.92, o.lo ?? dark(col, 0.6)); g.addColorStop(1, mix(o.lo ?? dark(col, 0.6), o.bounce ?? col, 0.35));
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
  if (o.tex) tex(c, ci(x, y, r), o.tex, o.texA ?? 0.4);
  if (o.lw !== 0) { c.strokeStyle = o.line ?? dark(col, 0.78); c.lineWidth = o.lw ?? 0.03; c.stroke(); }
  if (o.spec !== 0) { c.fillStyle = `rgba(255,255,255,${o.spec ?? 0.7})`; c.beginPath(); c.ellipse(x - r * 0.36, y + r * 0.42 * ly, r * 0.2, r * 0.11, -0.6 * ly, 0, TAU); c.fill(); }
}
// パネル線（暗い溝＋その下の細い反射）
export function seam(c, pts, w = 0.018, a = 0.6) {
  const ly = K.ly;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y - w * 0.9 * ly) : c.moveTo(x, y - w * 0.9 * ly)));
  c.strokeStyle = `rgba(255,255,255,${a * 0.38})`; c.lineWidth = w; c.stroke();
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = `rgba(8,10,20,${a})`; c.lineWidth = w; c.stroke();
}
export function rivet(c, x, y, r = 0.025) {
  const ly = K.ly;
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(x, y - r * 0.5 * ly, r, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x, y + r * 0.3 * ly, r * 0.7, 0, TAU); c.fill();
}
// 焼き込みの灯り（点滅しない小さな灯り・窓。動く光は glow() を上に重ねる）
export function lamp(c, x, y, r, col, halo = 2.6) {
  const g = c.createRadialGradient(x, y, 0, x, y, r * halo);
  g.addColorStop(0, rgba(col, 0.75)); g.addColorStop(0.4, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * halo, 0, TAU); c.fill();
  c.fillStyle = lite(col, 0.75); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - r * 0.2, y + r * 0.25 * K.ly, r * 0.45, 0, TAU); c.fill();
}
// ガラス（操縦席・目の表面・レンズ）
export function glass(c, sh, col, a = 1) {
  const [x0, y0, x1, y1] = sh.b, ly = K.ly, top = ly > 0 ? y1 : y0, bot = ly > 0 ? y0 : y1;
  const g = c.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, rgba(lite(col, 0.75), a)); g.addColorStop(0.45, rgba(col, a)); g.addColorStop(1, rgba(dark(col, 0.7), a));
  sh(c); c.fillStyle = g; c.fill();
  c.strokeStyle = rgba(dark(col, 0.8), a); c.lineWidth = 0.025; c.stroke();
  c.save(); sh(c); c.clip();
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse((x0 + x1) / 2 + (x1 - x0) * 0.12, top - (top - bot) * 0.22, (x1 - x0) * 0.26, Math.abs(top - bot) * 0.1, 0, 0, TAU); c.fill();
  c.restore();
}
// 影（落ち影・くぼみ）
export function shadow(c, sh, a = 0.4, dx = 0, dy = -0.06) { c.save(); c.translate(dx, dy * K.ly); sh(c); c.fillStyle = `rgba(0,0,0,${a})`; c.fill(); c.restore(); }
// ひび（枝分かれする折れ線。溝の暗さ＋片側の明るい縁）
export function crack(c, x, y, ang, len, seed, w = 0.03, glowCol = null) {
  const r = rnd(seed);
  const go = (x, y, a, len, w, depth) => {
    const pts = [[x, y]]; let n = Math.max(2, Math.round(len / 0.22));
    for (let i = 0; i < n; i++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; pts.push([x, y]); if (depth < 2 && r() < 0.3) go(x, y, a + (r() < 0.5 ? 0.8 : -0.8), len * 0.45, w * 0.7, depth + 1); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (glowCol) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.strokeStyle = rgba(glowCol, 0.35); c.lineWidth = w * 4; c.stroke(); }
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0] + w * 0.5, p[1] - w * 0.6 * K.ly) : c.moveTo(p[0] + w * 0.5, p[1] - w * 0.6 * K.ly))); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = w * 0.7; c.stroke();
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.strokeStyle = glowCol ? lite(glowCol, 0.3) : 'rgba(6,4,10,0.85)'; c.lineWidth = w; c.stroke();
  };
  go(x, y, ang, len, w, 0);
}
// 黄黒の警告帯（sh の内側に斜めの縞）
export function hazard(c, sh, w = 0.22) {
  const [x0, y0, x1, y1] = sh.b;
  c.save(); sh(c); c.clip();
  c.fillStyle = '#f2c21e'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.fillStyle = '#16130e';
  for (let x = x0 - (y1 - y0) - w; x < x1 + w; x += w * 2) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x + w, y0); c.lineTo(x + w + (y1 - y0), y1); c.lineTo(x + (y1 - y0), y1); c.fill(); }
  const g = c.createLinearGradient(0, K.ly > 0 ? y1 : y0, 0, K.ly > 0 ? y0 : y1); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.restore();
  sh(c); c.strokeStyle = '#0c0a08'; c.lineWidth = 0.03; c.stroke();
}

// ---- スプライトの置き場 ------------------------------------------------------
export class Sprites {
  constructor() { this.map = new Map(); this.S = 0; this.built = 0; }
  setScale(S) { if (S !== this.S) { this.S = S; this.map.clear(); } }
  // key ごとに 1 回だけ paint(c) を呼ぶ。w, h: 絵の大きさ（u）。o.ox, o.oy: 絵の中心に置くローカル座標。o.flip: 上下反転（天井用。光は上からのまま）
  get(key, w, h, paint, o) {
    let s = this.map.get(key);
    if (s) return s;
    const S = this.S, ox = o?.ox ?? 0, oy = o?.oy ?? 0, flip = !!o?.flip;
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.ceil(w * S) + 2); cv.height = Math.max(2, Math.ceil(h * S) + 2);
    const c = cv.getContext('2d');
    c.setTransform(S, 0, 0, flip ? S : -S, cv.width / 2 - ox * S, cv.height / 2 + (flip ? -oy : oy) * S);
    c.lineJoin = 'round'; c.lineCap = 'round';
    K.ly = flip ? -1 : 1;
    paint(c);
    K.ly = 1;
    s = { cv, w: cv.width / S, h: cv.height / S, ox, oy: flip ? -oy : oy, white: null };
    this.map.set(key, s); this.built++;
    return s;
  }
  // 白い影絵（被弾の白フラッシュ用）。必要になった時に作る
  white(s) {
    if (s.white) return s.white;
    const cv = document.createElement('canvas'); cv.width = s.cv.width; cv.height = s.cv.height;
    const c = cv.getContext('2d'); c.drawImage(s.cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
    return (s.white = cv);
  }
}
// 現在の変換（y 上向き）へスプライトを置く
export function put(ctx, s) { ctx.scale(1, -1); ctx.drawImage(s.cv, s.ox - s.w / 2, -s.oy - s.h / 2, s.w, s.h); ctx.scale(1, -1); }
// 白フラッシュつき（f: 0..1）
export function putF(ctx, sp, s, f) {
  ctx.scale(1, -1);
  ctx.drawImage(s.cv, s.ox - s.w / 2, -s.oy - s.h / 2, s.w, s.h);
  if (f > 0.04) { const a = ctx.globalAlpha; ctx.globalAlpha = a * Math.min(1, f * 0.85); ctx.drawImage(sp.white(s), s.ox - s.w / 2, -s.oy - s.h / 2, s.w, s.h); ctx.globalAlpha = a; }
  ctx.scale(1, -1);
}

// ---- 発光（加算合成の放射・筋） ------------------------------------------------
const glowCache = new Map();
function glowCanvas(col) {
  let cv = glowCache.get(col);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgba(lite(col, 0.85), 1)); g.addColorStop(0.12, rgba(lite(col, 0.45), 0.85)); g.addColorStop(0.35, rgba(col, 0.38)); g.addColorStop(0.65, rgba(col, 0.1)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  glowCache.set(col, cv); return cv;
}
export function glow(ctx, x, y, r, col, a = 1) {
  if (a <= 0.01 || r <= 0) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(glowCanvas(col), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
export function glowE(ctx, x, y, rx, ry, col, a = 1) {
  if (a <= 0.01) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(glowCanvas(col), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
// 筋（左が尾・右が頭。レーザー・弾の尾・噴射）。kind: 'tail'（尾が細く消える）| 'bar'（両端が丸い棒）| 'flame'
const streakCache = new Map();
function streakCanvas(col, kind) {
  const key = col + kind; let cv = streakCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  const im = c.createImageData(256, 64), d = im.data, p = rgb(col);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
    const u = x / 255, v = Math.abs(y - 31.5) / 31.5;
    let len, wid;
    if (kind === 'tail') { len = Math.pow(u, 1.6) * (u > 0.94 ? (1 - u) / 0.06 : 1); wid = 0.25 + 0.75 * u; }
    else if (kind === 'flame') { len = Math.pow(u, 0.8) * (u > 0.97 ? (1 - u) / 0.03 : 1); wid = 0.15 + 0.85 * Math.pow(u, 0.7); }
    else { const e = Math.min(u, 1 - u) / 0.08; len = e < 1 ? e : 1; wid = 1; }
    const q = v / wid;
    const core = q < 1 ? Math.pow(1 - q, 2.2) : 0;           // 外光
    const hot = q < 0.32 ? 1 - q / 0.32 : 0;                // 白い芯
    const a = clamp(len * (core * 0.75 + hot * 0.9), 0, 1);
    const i = (y * 256 + x) * 4, w = hot * len;
    d[i] = p[0] + (255 - p[0]) * w; d[i + 1] = p[1] + (255 - p[1]) * w; d[i + 2] = p[2] + (255 - p[2]) * w; d[i + 3] = a * 255;
  }
  c.putImageData(im, 0, 0);
  streakCache.set(key, cv); return cv;
}
// (x0,y) から右へ len、太さ wid（現在の変換の x 軸方向）。回したい時は呼ぶ側で rotate
export function streak(ctx, x0, y, len, wid, col, a = 1, kind = 'tail', add = true) {
  if (a <= 0.01) return;
  if (add) ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(streakCanvas(col, kind), x0, y - wid / 2, len, wid);
  ctx.globalAlpha = 1; if (add) ctx.globalCompositeOperation = 'source-over';
}
