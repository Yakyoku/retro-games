// ORBITAL WINGS 3D — 材質（すべて計算で作る。外部の画像なし）
// ・金属／石／生体の 3 種: 色の模様（パネル線・ひび・しわ）＋法線＋粗さ・金属度（金属は発光マスクも）を 512px で 1 回だけ生成
// ・金属の映り込み用の小さな環境マップ（計算で作った景色を PMREM に通す）
// ・光の粒（スプライト）のアトラス、機体の標識（デカール）
// ・シェーダー: シールドの六角格子、噴射炎、光線の螺旋、半透明の膜（細胞）
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- 継ぎ目の出ないノイズ ---------------------------------------------------------
function noiseFn(seed) {
  const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const w = (a, p) => ((a % p) + p) % p;
  const n2 = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(w(xi, per), w(yi, per)), b = h(w(xi + 1, per), w(yi, per)), c = h(w(xi, per), w(yi + 1, per)), d = h(w(xi + 1, per), w(yi + 1, per));
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (x, y, per, oct = 4) => { let s = 0, a = 0.5, t = 0; for (let i = 0; i < oct; i++) { s += n2(x, y, per) * a; t += a; x *= 2; y *= 2; per *= 2; a *= 0.5; } return s / t; };
  return { h, n2, fbm };
}
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texFrom(cv, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// 高さ（Float32Array, N×N）→ 法線マップ
function normalTex(H, N, strength) {
  const cv = canvas(N, N), ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
  const at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = 1 / Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    d[i] = (-dx * l * 0.5 + 0.5) * 255; d[i + 1] = (dy * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(cv, false);
}
function grayTex(N, fn, srgb) {   // fn(i) → [r,g,b] 0..1
  const cv = canvas(N, N), ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
  for (let i = 0; i < N * N; i++) { const c = fn(i); d[i * 4] = c[0] * 255; d[i * 4 + 1] = c[1] * 255; d[i * 4 + 2] = c[2] * 255; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return texFrom(cv, srgb);
}

// ---- 金属: パネル線・リベット・排気スリット・窓の灯り -----------------------------------
function metalSet(N = 512) {
  const R = rng(7), nz = noiseFn(11);
  const A = new Float32Array(N * N).fill(1), H = new Float32Array(N * N).fill(0.5), RO = new Float32Array(N * N).fill(0.8), ME = new Float32Array(N * N).fill(1), EM = new Float32Array(N * N);
  const px = (x, y) => (((y % N) + N) % N) * N + (((x % N) + N) % N);
  const rect = (x0, y0, x1, y1, fn) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn(px(x, y), x, y); };
  // 板割り（タイルの外周も線になるので継ぎ目が出ない）
  const panels = [];
  (function split(x0, y0, x1, y1, d) {
    const w = x1 - x0, h = y1 - y0;
    if (d > 0 && (w > 150 || h > 150 || (R() < 0.75 && Math.max(w, h) > 90))) {
      if (w > h * (0.7 + R() * 0.6)) { const m = Math.round((x0 + w * (0.35 + R() * 0.3)) / 16) * 16; split(x0, y0, m, y1, d - 1); split(m, y0, x1, y1, d - 1); }
      else { const m = Math.round((y0 + h * (0.35 + R() * 0.3)) / 16) * 16; split(x0, y0, x1, m, d - 1); split(x0, m, x1, y1, d - 1); }
    } else panels.push([x0, y0, x1, y1]);
  })(0, 0, N, N, 6);
  for (const [x0, y0, x1, y1] of panels) {
    const tone = 0.86 + R() * 0.14, raise = R() < 0.3 ? 0.12 : 0, ro = 0.72 + R() * 0.28, kind = R(), w = x1 - x0, h = y1 - y0;
    rect(x0, y0, x1, y1, (i, x, y) => {
      const e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);   // 板の縁からの距離
      A[i] = tone * (e < 2 ? 0.45 : e < 5 ? 1.08 : 1); H[i] = 0.5 + raise - (e < 2 ? 0.5 : e < 4 ? 0.12 : 0); RO[i] = e < 2 ? 1 : ro; ME[i] = e < 2 ? 0.55 : 1;
    });
    // リベット（四隅と長辺）
    const riv = (cx, cy) => rect(cx - 3, cy - 3, cx + 4, cy + 4, (i, x, y) => { const r = Math.hypot(x - cx, y - cy); if (r < 3.2) { H[i] += 0.25 * (1 - r / 3.2); A[i] *= r > 2 ? 0.7 : 1.1; RO[i] = 0.6; } });
    if (w > 40 && h > 40) { for (const cx of [x0 + 9, x1 - 10]) for (const cy of [y0 + 9, y1 - 10]) riv(cx, cy); if (w > 110) for (let cx = x0 + 9 + 24; cx < x1 - 24; cx += 24) { riv(cx, y0 + 9); riv(cx, y1 - 10); } }
    if (kind < 0.16 && w > 56 && h > 44) {         // 排気スリット
      for (let sy = y0 + 14; sy < y1 - 14; sy += 9) rect(x0 + 14, sy, x1 - 14, sy + 4, (i) => { A[i] = 0.16; H[i] = 0.1; RO[i] = 1; ME[i] = 0.4; });
    } else if (kind < 0.42 && w > 48 && h > 32) {  // 窓の灯り（発光マスク）
      for (let sy = y0 + 12; sy < y1 - 12; sy += 12) for (let sx = x0 + 12; sx < x1 - 16; sx += 14) if (R() < 0.62) rect(sx, sy, sx + 8, sy + 4, (i) => { EM[i] = 0.75 + R() * 0.25; A[i] = 0.5; H[i] -= 0.08; });
    } else if (kind < 0.52 && w > 60 && h > 60) {  // 丸いハッチ
      const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1, rr = Math.min(w, h) * 0.3;
      rect(x0 + 6, y0 + 6, x1 - 6, y1 - 6, (i, x, y) => { const r = Math.hypot(x - cx, y - cy); if (Math.abs(r - rr) < 1.6) { A[i] = 0.36; H[i] = 0.1; RO[i] = 1; } else if (r < rr) { H[i] += 0.06; A[i] *= 0.94; } });
    }
  }
  // 細かな擦り傷と汚れ
  for (let k = 0; k < 150; k++) {
    let x = R() * N, y = R() * N; const a = (R() - 0.5) * 0.7 + (R() < 0.5 ? 0 : Math.PI / 2), l = 8 + R() * 40;
    for (let t = 0; t < l; t++) { const i = px(Math.round(x), Math.round(y)); A[i] = Math.min(1.25, A[i] * 1.12); RO[i] *= 0.7; x += Math.cos(a); y += Math.sin(a); }
  }
  const albedo = grayTex(N, (i) => { const x = i % N, y = (i / N) | 0; const g = clamp(A[i] * (0.8 + 0.28 * nz.fbm(x / 64, y / 64, 8, 4)) * (0.94 + 0.06 * nz.n2(x / 3, y / 3, N)), 0, 1); return [g, g, g * 1.01 > 1 ? 1 : g * 1.01]; }, true);
  const orm = grayTex(N, (i) => { const x = i % N, y = (i / N) | 0; return [EM[i], clamp(RO[i] * (0.82 + 0.3 * nz.fbm(x / 40 + 9, y / 40, 12, 3)), 0.05, 1), ME[i]]; }, false);
  return { map: albedo, orm, normal: normalTex(H, N, 2.6) };
}
// ---- 石: 風化・ひび・層 -----------------------------------------------------------
function stoneSet(N = 512) {
  const nz = noiseFn(23), H = new Float32Array(N * N), A = new Float32Array(N * N), G = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * 8, v = y / N * 8;
    const base = nz.fbm(u, v, 8, 5);
    const wx = u + (nz.fbm(u + 3, v + 7, 8, 3) - 0.5) * 1.6, wy = v + (nz.fbm(u + 11, v + 1, 8, 3) - 0.5) * 1.6;
    const cr = Math.abs(nz.fbm(wx * 0.75, wy * 0.75, 6, 3) - 0.5) * 2;           // 0 に近い所がひび
    const crack = 1 - sstep(0.0, 0.035, cr);
    const strata = 0.5 + 0.5 * Math.sin((v + (base - 0.5) * 1.2) * TAU * 1.5);
    const pit = sstep(0.62, 0.8, nz.fbm(u * 3, v * 3, 24, 2));
    const i = y * N + x;
    H[i] = base * 0.6 + strata * 0.08 - crack * 0.5 - pit * 0.22;
    A[i] = clamp((0.74 + base * 0.36 + strata * 0.05) * (1 - crack * 0.6) * (1 - pit * 0.14), 0, 1);
    G[i] = sstep(0.5, 0.78, nz.fbm(u * 0.5 + 20, v * 0.5 + 5, 4, 5)) * (0.6 + 0.4 * nz.fbm(u * 2 + 7, v * 2, 16, 3)) * (1 - crack);  // 苔のむら
  }
  const albedo = grayTex(N, (i) => { const a = A[i], m = G[i] * 0.55; return [a * (1 - m * 0.45), a * (1 - m * 0.12), a * (1 - m * 0.55)]; }, true);
  return { map: albedo, normal: normalTex(H, N, 5) };
}
// ---- 生体: しわ・血管 -------------------------------------------------------------
function fleshSet(N = 512) {
  const nz = noiseFn(41), H = new Float32Array(N * N), A = new Float32Array(N * N), V = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * 8, v = y / N * 8;
    const w1 = nz.fbm(u, v, 8, 4), w2 = nz.fbm(u + 5, v + 9, 8, 4);
    const fold = 0.5 + 0.5 * Math.sin((u + (w1 - 0.5) * 3.2) * TAU * 0.75 + (w2 - 0.5) * 5);
    const vein = 1 - sstep(0.0, 0.05, Math.abs(nz.fbm(u * 0.6 + (w2 - 0.5), v * 0.6 + (w1 - 0.5), 6, 3) - 0.5) * 2);
    const pore = nz.n2(u * 10, v * 10, 80);
    const i = y * N + x;
    H[i] = fold * 0.5 + w1 * 0.3 + vein * 0.25 + pore * 0.05;
    A[i] = clamp(0.72 + fold * 0.22 + w1 * 0.12, 0, 1); V[i] = vein;
  }
  const albedo = grayTex(N, (i) => { const a = A[i], v = V[i]; return [a * (1 - v * 0.25), a * (1 - v * 0.62), a * (1 - v * 0.45)]; }, true);
  return { map: albedo, normal: normalTex(H, N, 3.2) };
}

// ---- 光の粒のアトラス（4×4、各 256px。明るさだけを持ち、色は粒ごとに付ける） ----------------------
export const SP = { glow: 0, core: 1, ring: 2, smokeA: 3, smokeB: 4, streak: 5, star: 6, burst: 7, disc: 8, shadow: 9, fire: 10, ring2: 11, halo: 12, beam: 13, arc: 14, trail: 15 };
function spriteAtlas() {
  const C = 256, N = C * 4, cv = canvas(N, N), ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
  const nz = noiseFn(77);
  const g = (x, s) => Math.exp(-(x / s) * (x / s));
  const fns = [
    (u, v, r) => Math.pow(Math.max(0, 1 - r), 2.4),
    (u, v, r) => sstep(0.62, 0.42, r) + 0.45 * Math.pow(Math.max(0, 1 - r), 3),
    (u, v, r) => (g(r - 0.8, 0.045) + 0.3 * g(r - 0.8, 0.14)) * sstep(1, 0.93, r),
    (u, v, r, a) => clamp((1 - r) * 1.5 - nz.fbm(u * 2.2 + 4, v * 2.2 + 4, 16, 4) * 0.9, 0, 1) * (0.55 + 0.6 * nz.fbm(u * 3 + 9, v * 3, 16, 3)),
    (u, v, r, a) => clamp((1 - r) * 1.6 - nz.fbm(u * 1.7 + 14, v * 1.7 + 2, 16, 4) * 1.0, 0, 1) * (0.5 + 0.7 * nz.fbm(u * 4 + 1, v * 4 + 7, 16, 3)),
    (u, v) => g(v, 0.16) * Math.pow((u + 1) / 2, 1.6) * sstep(1, 0.8, u),
    (u, v, r) => clamp(Math.max(g(v, 0.045) * Math.exp(-Math.abs(u) * 2.6), g(u, 0.045) * Math.exp(-Math.abs(v) * 2.6)) + 0.6 * Math.pow(Math.max(0, 1 - r * 1.6), 2), 0, 1) * sstep(1, 0.85, Math.max(Math.abs(u), Math.abs(v))),
    (u, v, r, a) => clamp(Math.pow(Math.abs(Math.cos(a * 4)), 10) * Math.pow(Math.max(0, 1 - r), 1.6) * 1.4 + Math.pow(Math.abs(Math.cos(a * 4 + 0.6)), 24) * Math.pow(Math.max(0, 1 - r * 1.4), 2) + Math.pow(Math.max(0, 1 - r * 2.2), 2), 0, 1),
    (u, v, r) => sstep(0.94, 0.84, r),
    (u, v, r) => Math.pow(sstep(1, 0.15, r), 1.4),
    (u, v, r, a) => { const n = nz.fbm(Math.cos(a) * 1.6 + 8 + r * 1.5, Math.sin(a) * 1.6 + 8, 16, 4); return clamp((1 - r * (0.95 + n * 0.5)) * 2.4, 0, 1) * (0.55 + 0.75 * nz.fbm(u * 2.5 + 30, v * 2.5 + 3, 16, 3)); },
    (u, v, r) => (g(r - 0.82, 0.03) + g(r - 0.6, 0.025) * 0.8 + 0.15 * g(r - 0.7, 0.2)) * (0.6 + 0.4 * (Math.cos(Math.atan2(v, u) * 12) > 0.2 ? 1 : 0.2)),
    (u, v, r) => g(r - 0.68, 0.17) * sstep(1, 0.9, r),
    (u, v) => (g(v, 0.36) * 0.75 + g(v, 0.12) * 0.5) * sstep(1, 0.86, Math.abs(u)) * sstep(1, 0.8, Math.abs(v)),
    (u, v) => { const o = (nz.fbm(u * 3 + 50, 3, 64, 4) - 0.5) * 1.1 * sstep(1, 0.6, Math.abs(u)); return clamp(g(v - o, 0.045) + 0.35 * g(v - o, 0.16), 0, 1) * sstep(1, 0.85, Math.abs(u)); },
    (u, v) => { const k = (u + 1) / 2; return g(v, 0.07 + 0.32 * k * k) * Math.pow(k, 1.3) * sstep(1, 0.72, u) + g(Math.hypot(u - 0.66, v), 0.2) * 0.6; },
  ];
  for (let f = 0; f < 16; f++) {
    const ox = (f % 4) * C, oy = ((f / 4) | 0) * C, fn = fns[f];
    for (let y = 2; y < C - 2; y++) for (let x = 2; x < C - 2; x++) {
      const u = (x - 2) / (C - 5) * 2 - 1, v = -((y - 2) / (C - 5) * 2 - 1), r = Math.hypot(u, v);
      const b = clamp(fn(u, v, r, Math.atan2(v, u)), 0, 1) * 255, i = ((oy + y) * N + ox + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = b; d[i + 3] = 255;
    }
  }
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// ---- 機体の標識（デカール）。本作オリジナルの記号だけ ---------------------------------------
export const DECAL = { name: [0, 0.5, 0.5, 1], mark: [0.5, 0.5, 0.75, 1], num: [0.75, 0.5, 1, 1], hazard: [0, 0.25, 0.5, 0.5], arrows: [0.5, 0.25, 1, 0.5], caution: [0, 0, 0.5, 0.25], bars: [0.5, 0, 1, 0.25] };
function decalAtlas() {
  const W = 512, Hh = 256, cv = canvas(W, Hh), c = cv.getContext('2d');
  c.clearRect(0, 0, W, Hh);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  const text = (s, x, y, px, fill, stroke) => { c.font = `900 ${px}px "Arial Narrow", Arial, sans-serif`; if (stroke) { c.lineWidth = px * 0.16; c.strokeStyle = stroke; c.strokeText(s, x, y); } c.fillStyle = fill; c.fillText(s, x, y); };
  text('OW-07', 128, 66, 78, '#f4f6fa', '#10141c');
  // 部隊章: 輪と翼形（独自の図案）
  c.save(); c.translate(320, 64);
  c.fillStyle = '#10141c'; c.beginPath(); c.arc(0, 0, 56, 0, TAU); c.fill();
  c.fillStyle = '#f4f6fa'; c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.fill();
  c.fillStyle = '#1e56e0'; c.beginPath(); c.arc(0, 0, 42, 0, TAU); c.fill();
  c.fillStyle = '#f4f6fa'; c.beginPath(); c.moveTo(34, 0); c.lineTo(-22, 26); c.lineTo(-8, 4); c.lineTo(-30, 0); c.lineTo(-8, -4); c.lineTo(-22, -26); c.closePath(); c.fill();
  c.fillStyle = '#e8402a'; c.beginPath(); c.arc(-2, 0, 6, 0, TAU); c.fill();
  c.restore();
  text('07', 448, 66, 96, '#f4f6fa', '#10141c');
  // 警戒の縞
  c.save(); c.beginPath(); c.rect(0, 128, 256, 64); c.clip(); c.fillStyle = '#f2c21a'; c.fillRect(0, 128, 256, 64); c.fillStyle = '#15130f';
  for (let x = -64; x < 300; x += 40) { c.beginPath(); c.moveTo(x, 192); c.lineTo(x + 20, 192); c.lineTo(x + 84, 128); c.lineTo(x + 64, 128); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = '#e8402a'; for (let k = 0; k < 5; k++) { const x = 276 + k * 46; c.beginPath(); c.moveTo(x, 136); c.lineTo(x + 26, 160); c.lineTo(x, 184); c.lineTo(x + 14, 184); c.lineTo(x + 40, 160); c.lineTo(x + 14, 136); c.closePath(); c.fill(); }
  c.fillStyle = '#e8402a'; c.fillRect(4, 198, 248, 52); c.fillStyle = '#10141c'; c.fillRect(8, 202, 240, 44); text('CAUTION', 128, 226, 40, '#f2c21a');
  for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#f4f6fa' : '#e8402a'; c.fillRect(262 + k * 41, 200, 33, 48); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---- 環境マップ（計算で作った景色 → PMREM）。金属の映り込み用 ------------------------------
function envMap(renderer) {
  const sc = new THREE.Scene();
  const g = new THREE.SphereGeometry(50, 32, 16), n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i) / 50, a = Math.atan2(g.attributes.position.getZ(i), g.attributes.position.getX(i));
    // 上は冷たい空、地平に明るい帯、下は暖かい照り返し
    if (y > 0) c.setRGB(0.10 + 0.5 * Math.pow(1 - y, 5), 0.14 + 0.6 * Math.pow(1 - y, 5), 0.26 + 0.75 * Math.pow(1 - y, 4));
    else c.setRGB(0.34 * Math.pow(1 + y, 3) + 0.05, 0.22 * Math.pow(1 + y, 3) + 0.035, 0.16 * Math.pow(1 + y, 3) + 0.03);
    c.multiplyScalar(0.8 + 0.2 * Math.sin(a * 3));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // 光源の板（くっきりした反射の筋になる）
  const lamp = (x, y, z, w, h, r, gg, b) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(r, gg, b), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); };
  lamp(-12, 26, 22, 26, 10, 9, 9, 10); lamp(30, 12, 10, 8, 22, 4, 5, 7); lamp(-30, 4, -14, 8, 18, 5, 3.4, 2.4); lamp(4, -22, 16, 30, 8, 2.2, 1.5, 1.1); lamp(0, 8, -34, 40, 6, 2, 2.6, 4);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.035, 1, 120);
  pm.dispose();
  sc.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt.texture;
}

// ---- まとめ: テクスチャと材質 ------------------------------------------------------
export function buildMaterials(renderer, clip) {
  const metal = metalSet(), stone = stoneSet(), flesh = fleshSet();
  const env = envMap(renderer);
  const tex = { metal, stone, flesh, env, sprites: spriteAtlas(), decal: decalAtlas() };
  // 頂点ごとの発光（emi）と質感（pbr: 粗さ・金属度・発光マスク）を標準の材質に足す
  const patch = (mat, hasOrm) => {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 emi;\nattribute vec3 pbr;\nvarying vec3 vEmi;\nvarying vec3 vPbr;\nvarying float vFlash;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmi = emi; vPbr = pbr;\n#ifdef USE_INSTANCING_COLOR\nvFlash = max(instanceColor.r - 1.0, 0.0);\n#else\nvFlash = 0.0;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEmi;\nvarying vec3 vPbr;\nvarying float vFlash;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * vPbr.x, 0.045, 1.0);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vPbr.y;')
        .replace('#include <emissivemap_fragment>', hasOrm
          ? '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmi * mix(1.0, texelRoughness.r, vPbr.z) + vec3(vFlash);'
          : '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmi + vec3(vFlash);');
    };
    mat.customProgramCacheKey = () => (hasOrm ? 'ow-orm' : 'ow-emi');
    return mat;
  };
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, clippingPlanes: clip, envMap: env, envMapIntensity: 0.95, ...o });
  const M = {
    metal: patch(std({ map: metal.map, roughnessMap: metal.orm, metalnessMap: metal.orm, normalMap: metal.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 1 }), true),
    stone: patch(std({ map: stone.map, normalMap: stone.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 1, envMapIntensity: 0.5 }), false),
    flesh: patch(std({ map: flesh.map, normalMap: flesh.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, metalness: 1, envMapIntensity: 0.9 }), false),
    decal: new THREE.MeshStandardMaterial({ map: tex.decal, alphaTest: 0.5, roughness: 0.6, metalness: 0.2, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
  };
  return { tex, M };
}

// ---- シェーダー材質 --------------------------------------------------------------
const CLIP_V = '#include <clipping_planes_pars_vertex>', CLIP_F = '#include <clipping_planes_pars_fragment>';
// 光の粒（ビルボード／軸に沿う帯／戦場の面に寝かせた板）。加算と通常の合成を 1 つの材質で（前乗算）
export function spriteMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uBox: { value: new THREE.Vector2(16.5, 9.2) } },
    vertexShader: `
      attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aD;
      uniform vec2 uBox; varying vec2 vUv; varying vec4 vCol; varying float vI;
      void main() {
        vec2 q = position.xy; float mode = aB.w;
        float sc = length(modelViewMatrix[0].xyz);
        vec4 mv = modelViewMatrix * vec4(aA.xyz, 1.0);
        float c = cos(aB.z), s = sin(aB.z);
        if (mode < 0.5) { vec2 o = q * aB.xy; mv.xy += vec2(c * o.x - s * o.y, s * o.x + c * o.y) * sc; }
        else if (mode < 1.5) { vec3 av = (modelViewMatrix * vec4(aC.xyz, 0.0)).xyz; vec3 sd = cross(av, mv.xyz); sd = sd / max(length(sd), 1e-6); mv.xyz += av * q.x + sd * (q.y * aB.x * sc); }
        else if (mode < 2.5) { vec2 o = q * aB.xy; mv = modelViewMatrix * vec4(aA.xyz + vec3(c * o.x - s * o.y, s * o.x + c * o.y, 0.0), 1.0); }
        else { vec2 o = q * aB.xy; mv = modelViewMatrix * vec4(aA.xyz + vec3(o.x, 0.0, o.y), 1.0); }
        float f = aA.w;
        vUv = (vec2(mod(f, 4.0), floor(f / 4.0)) + vec2(q.x + 0.5, 0.5 - q.y)) * 0.25;
        vCol = aD; vI = aC.w;
        gl_Position = (abs(aA.x) > uBox.x || abs(aA.y) > uBox.y) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; varying float vI;
      void main() {
        float t = texture2D(uMap, vUv).r;
        gl_FragColor = vec4(vCol.rgb * (t * vI), t * vCol.a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, toneMapped: false,
  });
}
// シールド: 六角格子のエネルギー面。被弾で波紋、残量で色が変わる
export function shieldMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(0x4ab8ff) }, uHit: { value: [new THREE.Vector4(1, 0, 0, 9), new THREE.Vector4(1, 0, 0, 9)] }, uPow: { value: 1 } },
    vertexShader: `${CLIP_V}
      varying vec3 vN; varying vec3 vVN; varying vec3 vV;
      void main() { vN = normalize(position); vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vVN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `${CLIP_F}
      uniform float uTime; uniform vec3 uCol; uniform vec4 uHit[2]; uniform float uPow;
      varying vec3 vN; varying vec3 vVN; varying vec3 vV;
      float hexEdge(vec2 p) { vec2 r = vec2(1.0, 1.7320508), h = r * 0.5; vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; g = abs(g); return 0.5 - max(dot(g, vec2(0.5, 0.8660254)), g.x); }
      void main() {
        #include <clipping_planes_fragment>
        vec3 n = normalize(vN);
        vec2 p = vec2(atan(n.z, n.x) * 3.2, asin(clamp(n.y, -1.0, 1.0)) * 3.6);
        float e = hexEdge(p * 1.15 + vec2(uTime * 0.2, 0.0));
        float line = smoothstep(0.05, 0.0, e);
        float fres = pow(1.0 - abs(dot(normalize(vVN), normalize(vV))), 2.2);
        float rip = 0.0;
        for (int i = 0; i < 2; i++) { float d = acos(clamp(dot(n, normalize(uHit[i].xyz)), -1.0, 1.0)); float t = uHit[i].w; rip += (0.5 + 0.5 * sin(d * 16.0 - t * 22.0)) * exp(-d * 2.2) * exp(-t * 3.5) * step(d, t * 5.0 + 0.3) * 2.6; }
        float front = smoothstep(-0.42, 0.08, n.x);
        float scan = 0.75 + 0.25 * sin(n.y * 26.0 - uTime * 5.0);
        float a = (fres * 0.34 + line * (0.07 + 0.36 * fres) * scan + 0.008 + rip * (0.5 + line)) * front * uPow;
        gl_FragColor = vec4(mix(uCol, vec3(1.0), clamp(rip * 0.5 + fres * fres * 0.3, 0.0, 0.8)) * a, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clipping: true, clippingPlanes: clip, toneMapped: false,
  });
}
// 噴射炎: 芯・外炎・衝撃ダイヤ（形は −x へ伸びる円錐。インスタンスの色と大きさで使い回す）
export function exhaustMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `${CLIP_V}
      varying vec2 vUv; varying vec3 vC; varying float vF; varying float vPh;
      void main() { vUv = uv; vC = instanceColor;
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        vPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].y * 1.7;
        vec4 mvPosition = modelViewMatrix * wp;
        vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vF = abs(dot(n, normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `${CLIP_F}
      uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vF; varying float vPh;
      void main() {
        #include <clipping_planes_fragment>
        float k = 1.0 - vUv.y;                      // 0 = 噴射口, 1 = 先端
        float edge = pow(vF, 1.7);                  // 輪郭に近いほど薄い（中身の詰まった円錐に見せない）
        float body = pow(1.0 - k, 1.9);
        float dia = pow(abs(sin(k * 13.0 - 0.5)), 8.0) * pow(1.0 - k, 2.0);                 // 衝撃ダイヤ
        float fl = 0.8 + 0.2 * sin(uTime * 61.0 + vPh * 9.0 + k * 20.0) * sin(uTime * 37.0 + vPh);
        vec3 col = (vC * (body * edge * 0.75) + vec3(1.0) * (pow(edge, 4.0) * body * body * 0.45 + dia * edge * 0.4)) * 0.5;
        gl_FragColor = vec4(col * fl, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clipping: true, clippingPlanes: clip, toneMapped: false, side: THREE.DoubleSide,
  });
}
// 光線のまわりを回る螺旋（円柱は y 軸向き、長さ 1。インスタンスの大きさで伸ばす）
export function spiralMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `${CLIP_V}
      varying vec2 vUv; varying vec3 vC; varying float vLen; varying float vF;
      void main() { vUv = uv; vC = instanceColor; vLen = length(instanceMatrix[1].xyz) / max(length(instanceMatrix[0].xyz), 1e-4);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vF = abs(dot(n, normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `${CLIP_F}
      uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vLen; varying float vF;
      void main() {
        #include <clipping_planes_fragment>
        float s = 0.5 + 0.5 * sin(6.2831853 * (vUv.x * 2.0 + vUv.y * vLen * 0.22 - uTime * 3.2));
        float band = pow(s, 5.0);
        float ends = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        gl_FragColor = vec4(vC * (band * (0.35 + 0.65 * (1.0 - vF)) * ends), 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clipping: true, clippingPlanes: clip, toneMapped: false, side: THREE.DoubleSide,
  });
}
// 半透明の膜（細胞・胞子・核の外側）: 縁が光り、内側は薄い。表面がゆっくり波打つ
export function bubbleMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `${CLIP_V}
      uniform float uTime; varying vec3 vC; varying vec3 vN; varying vec3 vV;
      void main() { vC = instanceColor;
        float ph = instanceMatrix[3].x * 1.3 + instanceMatrix[3].y * 2.1;
        vec3 p = position * (1.0 + 0.06 * sin(position.y * 5.0 + uTime * 3.0 + ph) * sin(position.x * 4.0 - uTime * 2.3 + ph));
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `${CLIP_F}
      varying vec3 vC; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        vec3 n = normalize(vN), v = normalize(vV);
        float ndv = abs(dot(n, v));
        float rim = pow(1.0 - ndv, 2.0);
        float spec = pow(max(dot(n, normalize(v + vec3(-0.35, 0.75, 0.55))), 0.0), 48.0);
        float a = 0.16 + 0.7 * rim;
        vec3 col = vC * (0.5 + 0.9 * rim) + vec3(1.0) * (spec * 0.9 + rim * rim * 0.25);
        gl_FragColor = vec4(col * a + vec3(spec * 0.5), a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, clipping: true, clippingPlanes: clip, toneMapped: false,
  });
}
