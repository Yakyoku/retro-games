// Sky Climber VR — 手続き生成のテクスチャ（外部画像なし）。外壁は「1 区画（窓 1 列 × 1 階）」単位で模様を描き、
// 窓の下の雨だれ・階ごとの目地・パネルの継ぎ目・傷が窓の格子と一致するようにする。
// 高さマップから法線マップを作り、粗さマップも同じ模様から作る（形状・法線・粗さ・光の組合せで質感を出す）。
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// 値ノイズ（タイル可能）
function makeNoise(seed, size) {
  const r = makeRng(seed), g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  const s = (x, y) => g[((y % size + size) % size) * size + ((x % size + size) % size)];
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (s(xi, yi) * (1 - u) + s(xi + 1, yi) * u) * (1 - v) + (s(xi, yi + 1) * (1 - u) + s(xi + 1, yi + 1) * u) * v; };
}
function fbm(n, x, y, oct, per) { let a = 0, amp = 0.5, f = 1; for (let o = 0; o < oct; o++) { a += amp * n(x * f, y * f, per * f); amp *= 0.5; f *= 2; } return a; }

export const THEME_WALL = {
  practice: { base: [196, 190, 178], joint: 0.55, stain: 0.25, tile: false },
  day:      { base: [214, 200, 176], joint: 0.6, stain: 0.35, tile: true, tileCol: [228, 214, 190] },
  dusk:     { base: [176, 120, 96],  joint: 0.7, stain: 0.30, brick: true },
  night:    { base: [120, 124, 132], joint: 0.6, stain: 0.45, wet: true },
  tower:    { base: [200, 206, 212], joint: 0.4, stain: 0.15, panel: true },
};

// 外壁のテクスチャ一式: map（色）, normalMap, roughnessMap。1 枚が「窓 2 列 × 2 階」（ばらつきのため 4 区画ぶん）
export function makeWallTextures(theme, { size = 2048, colW, floorH, win, seed = 7 }) {
  const T = THEME_WALL[theme] || THEME_WALL.day;
  const W = size, H = Math.round(size * (2 * floorH) / (2 * colW));
  const ppm = W / (2 * colW); // 1m あたりの画素
  const hgt = new Float32Array(W * H), col = new Float32Array(W * H * 3), rough = new Float32Array(W * H);
  const n1 = makeNoise(seed, 64), n2 = makeNoise(seed + 1, 256), rng = makeRng(seed + 2);
  const per = 64;
  const idx = (x, y) => ((y % H + H) % H) * W + ((x % W + W) % W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    // 大小 2 つのノイズで、ムラと細かな凹凸
    const big = fbm((a, b) => n1(a, b), u * 8, v * 8 * H / W, 4, per);
    const fine = n2(x * 0.5, y * 0.5);
    let h = 0.5 + (big - 0.5) * 0.25 + (fine - 0.5) * 0.18;
    let c = T.base.map((k) => k / 255 * (0.88 + 0.22 * big));
    let r = 0.82 + 0.12 * fine;
    const mx = (x / ppm) % colW, my = (H - 1 - y) / ppm % floorH; // 区画内の位置（m）、my は下から
    // タイル貼り（昼）・レンガ（夕方）・金属パネル（超高層）
    if (T.tile) { const tx = (x / ppm) / 0.30, ty = ((H - y) / ppm) / 0.15; const gx = Math.abs(tx - Math.round(tx)), gy = Math.abs(ty - Math.round(ty));
      if (gx < 0.035 || gy < 0.07) { h -= 0.18; c = c.map((k) => k * 0.82); r = 0.95; } else { c = c.map((k, i) => k * 0.6 + (T.tileCol[i] / 255) * 0.4 * (0.9 + 0.2 * n1(Math.floor(tx) * 3.1, Math.floor(ty) * 1.7))); r = 0.55 + 0.2 * fine; } }
    if (T.brick) { const by = ((H - y) / ppm) / 0.075, row = Math.floor(by), bx = (x / ppm) / 0.23 + (row % 2) * 0.5; const gx = Math.abs(bx - Math.round(bx)), gy = Math.abs(by - Math.round(by));
      if (gx < 0.05 || gy < 0.1) { h -= 0.25; c = [0.62, 0.58, 0.52]; r = 0.97; } else { const t = n1(Math.floor(bx) * 5.3, row * 2.1); c = c.map((k) => k * (0.8 + 0.35 * t)); } }
    if (T.panel) { const px = (x / ppm) % (colW / 2), py = ((H - y) / ppm) % (floorH / 2); if (px < 0.012 || py < 0.012) { h -= 0.3; c = c.map((k) => k * 0.6); r = 0.6; } else { r = 0.35 + 0.15 * big; } }
    // 階の目地（打継ぎ）と、区画の継ぎ目
    if (my < 0.025 || mx < 0.012) { h -= 0.35 * T.joint; c = c.map((k) => k * (1 - 0.3 * T.joint)); r = 0.95; }
    // 雨だれ: 窓台の両端から下へ伸びる汚れ
    const sillX0 = colW / 2 - win.w / 2, sillX1 = colW / 2 + win.w / 2;
    for (const sx of [sillX0 + 0.05, sillX1 - 0.05, colW / 2]) {
      const dx = Math.abs(mx - sx), below = win.y0 - my;
      if (below > 0 && below < 1.6 && dx < 0.09) {
        const s = (1 - dx / 0.09) * (1 - below / 1.6) * T.stain * (0.6 + 0.6 * n1(x * 0.05, 3));
        c = c.map((k) => k * (1 - s * 0.55)); r = Math.min(1, r + s * 0.2);
      }
    }
    // 窓の上の庇の下のすす
    if (my > win.y1 && my < win.y1 + 0.12 && mx > sillX0 && mx < sillX1) { c = c.map((k) => k * 0.85); }
    // 濡れた壁（夜）: 縦の筋状に粗さが下がる
    if (T.wet) { const wv = n1(x * 0.02, y * 0.002); r = Math.max(0.12, r - (wv > 0.55 ? (wv - 0.55) * 2.2 : 0)); c = c.map((k) => k * (wv > 0.55 ? 0.82 : 1)); }
    const i = idx(x, y); hgt[i] = h; rough[i] = r; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  // 傷・欠け（小さな点）
  for (let k = 0; k < 160; k++) { const cx = rng.int(0, W - 1), cy = rng.int(0, H - 1), rad = rng.range(1, 4);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const d = Math.hypot(x, y); if (d < rad) { const i = idx(cx + x, cy + y); hgt[i] -= 0.25 * (1 - d / rad); col[i * 3] *= 0.85; col[i * 3 + 1] *= 0.85; col[i * 3 + 2] *= 0.85; } } }
  // 細いひび
  for (let k = 0; k < 14; k++) { let x = rng.int(0, W), y = rng.int(0, H), a = rng.range(0, Math.PI * 2);
    for (let s = 0; s < rng.int(40, 160); s++) { a += rng.range(-0.5, 0.5); x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5; const i = idx(Math.round(x), Math.round(y)); hgt[i] -= 0.3; col[i * 3] *= 0.75; col[i * 3 + 1] *= 0.75; col[i * 3 + 2] *= 0.75; } }
  const toTex = (fill, srgb) => { const cv = canvas(W, H), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H); fill(img.data); ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  const map = toTex((d) => { for (let i = 0; i < W * H; i++) { d[i * 4] = Math.min(255, col[i * 3] * 255); d[i * 4 + 1] = Math.min(255, col[i * 3 + 1] * 255); d[i * 4 + 2] = Math.min(255, col[i * 3 + 2] * 255); d[i * 4 + 3] = 255; } }, true);
  const strength = 2.2;
  const normalMap = toTex((d) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x;
    const dx = (hgt[idx(x + 1, y)] - hgt[idx(x - 1, y)]) * strength, dy = (hgt[idx(x, y + 1)] - hgt[idx(x, y - 1)]) * strength;
    const l = Math.hypot(dx, dy, 1); d[i * 4] = (-dx / l * 0.5 + 0.5) * 255; d[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255; d[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255; } }, false);
  const roughnessMap = toTex((d) => { for (let i = 0; i < W * H; i++) { const v = Math.max(0, Math.min(1, rough[i])) * 255; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }, false);
  return { map, normalMap, roughnessMap, repeatW: 2 * colW, repeatH: 2 * floorH };
}

// 布の織り目の法線（服・手袋・カーテン用）
export function makeFabricNormal(size = 256, kind = 'weave') {
  const cv = canvas(size, size), ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const hf = (x, y) => kind === 'knit'
    ? Math.sin(x * 0.8) * 0.5 + Math.sin((y + Math.abs(Math.sin(x * 0.4)) * 4) * 0.9) * 0.5
    : (Math.sin(x * 1.2) * ((Math.floor(y / 3) % 2) ? 1 : -1) + Math.sin(y * 1.2) * ((Math.floor(x / 3) % 2) ? 1 : -1)) * 0.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = hf(x + 1, y) - hf(x - 1, y), dy = hf(x, y + 1) - hf(x, y - 1), l = Math.hypot(dx * 0.5, dy * 0.5, 1), i = (y * size + x) * 4;
    d[i] = (-dx * 0.5 / l * 0.5 + 0.5) * 255; d[i + 1] = (dy * 0.5 / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}

// 文字やロゴを描いたテクスチャ（看板・ネオン・VR の UI）
export function makeTextTexture(draw, w, h, srgb = true) {
  const cv = canvas(w, h), ctx = cv.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return { tex: t, canvas: cv, ctx };
}

// 遠景のビルの窓（発光の模様）
export function makeFacadeTexture(seed, { lit = 0.4, night = false, size = 512, tint = [200, 205, 210] } = {}) {
  const r = makeRng(seed);
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = `rgb(${tint.join(',')})`; ctx.fillRect(0, 0, w, h);
    const cols = 8, rows = 16, cw = w / cols, ch = h / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const on = r.chance(lit);
      ctx.fillStyle = night ? (on ? `hsl(${r.range(35, 50)},${r.range(60, 90)}%,${r.range(55, 75)}%)` : '#0b0e14') : (on ? '#6b7f95' : '#3b4a5c');
      ctx.fillRect(i * cw + cw * 0.15, j * ch + ch * 0.2, cw * 0.7, ch * 0.6);
    }
  }, size, size * 2).tex;
}
