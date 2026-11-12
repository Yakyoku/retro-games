// 鉄骨レスキュー — 手続き生成のテクスチャ（外部画像なし）。色と、高さから作る法線マップ。
// 解像度は画面での大きさと近づく距離から決める（全部を 4K にしない）: 樽 1024、鉄骨 1024、布・毛 512、遠景 2048〜4096
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
function fbm(x, y, o = 4) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * vnoise(x * f, y * f); a *= 0.5; f *= 2; } return v; }

// 高さ（0〜1 の Float32Array）から法線マップ
function normalFromHeight(hgt, w, h, strength = 2) {
  const [c, g] = canvas(w, h); const img = g.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hgt[y * w + ((x - 1 + w) % w)], r = hgt[y * w + ((x + 1) % w)];
    const u = hgt[((y - 1 + h) % h) * w + x], dn = hgt[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
    const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function tex(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

const cache = {};
export function getTextures(q = 1) {
  if (cache[q]) return cache[q];
  const T = {};
  // ---- 樽の板（縦に 8 枚の板・木目・継ぎ目）
  {
    const w = 1024 * q, h = 512 * q; const [c, g] = canvas(w, h); const hgt = new Float32Array(w * h);
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const plank = Math.floor(x / (w / 8)), u = (x % (w / 8)) / (w / 8);
      const grain = Math.sin((y / h) * 40 + fbm(x / 60 + plank * 7, y / 18) * 9) * 0.5 + 0.5;
      const seam = Math.min(1, Math.min(u, 1 - u) * 30);
      const tone = 0.72 + 0.16 * hash(plank, 3) + grain * 0.14 + (fbm(x / 140, y / 140) - 0.5) * 0.15;
      const r = 176 * tone, gg = 102 * tone, b = 52 * tone;
      const i = (y * w + x) * 4; d[i] = r * (0.55 + 0.45 * seam); d[i + 1] = gg * (0.55 + 0.45 * seam); d[i + 2] = b * (0.55 + 0.45 * seam); d[i + 3] = 255;
      hgt[y * w + x] = seam * 0.6 + grain * 0.25;
    }
    g.putImageData(img, 0, 0);
    T.wood = tex(c); T.woodN = tex(normalFromHeight(hgt, w, h, 3), { srgb: false });
  }
  // ---- 樽のふた（同心の板と金具）
  {
    const s = 512 * q; const [c, g] = canvas(s, s);
    g.fillStyle = '#9a5a2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#a8642f' : '#8f5226'; g.fillRect(0, i * s / 6, s, s / 6); }
    g.strokeStyle = '#5a3216'; g.lineWidth = 3 * q; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * s / 6); g.lineTo(s, i * s / 6); g.stroke(); }
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(60,30,10,${Math.random() * 0.12})`; g.fillRect(Math.random() * s, Math.random() * s, 20 * q, 1.5 * q); }
    g.lineWidth = 26 * q; g.strokeStyle = '#3b3f47'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 13 * q, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2a2d33'; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.beginPath(); g.arc(s / 2 + Math.cos(a) * (s / 2 - 13 * q), s / 2 + Math.sin(a) * (s / 2 - 13 * q), 6 * q, 0, 7); g.fill(); }
    T.barrelCap = tex(c);
  }
  // ---- 塗装した鋼（傷と塗りむら）。色は乗算で変える（白に近い灰色）
  {
    const s = 512 * q; const [c, g] = canvas(s, s); const hgt = new Float32Array(s * s);
    const img = g.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const n = fbm(x / 40, y / 40, 5), sc = fbm(x / 6, y / 90, 2);
      let v = 0.86 + (n - 0.5) * 0.18;
      const chip = n > 0.72 ? 0.55 : 1; v *= chip;
      const i = (y * s + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255 * Math.min(1, v + (sc - 0.5) * 0.04); d[i + 3] = 255;
      hgt[y * s + x] = n * 0.5 + (chip < 1 ? -0.3 : 0);
    }
    g.putImageData(img, 0, 0);
    T.paint = tex(c, { repeat: [1, 1] }); T.paintN = tex(normalFromHeight(hgt, s, s, 1.6), { srgb: false, repeat: [1, 1] });
  }
  // ---- 縞鋼板（足場の上面）
  {
    const s = 256 * q; const [c, g] = canvas(s, s); const hgt = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const cx = (x % (s / 4)) / (s / 4) - 0.5, cy = (y % (s / 4)) / (s / 4) - 0.5;
      const odd = (Math.floor(x / (s / 4)) + Math.floor(y / (s / 4))) % 2;
      const a = odd ? (cx + cy) : (cx - cy), b = odd ? (cx - cy) : (cx + cy);
      hgt[y * s + x] = Math.max(0, 1 - Math.abs(a) * 5 - Math.abs(b) * 1.2) > 0 ? 1 : 0;
    }
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, s, s);
    T.tread = tex(c, { repeat: [1, 1] }); T.treadN = tex(normalFromHeight(hgt, s, s, 2.2), { srgb: false, repeat: [1, 1] });
  }
  // ---- 布（綾織り）と毛（流れ）
  {
    const s = 256 * q; const [, ] = [];
    const h1 = new Float32Array(s * s), h2 = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      h1[y * s + x] = (Math.sin((x + y) * 0.9) * 0.5 + 0.5) * 0.5 + hash(x, y) * 0.2;
      h2[y * s + x] = fbm(x / 3, y / 22, 3) * 0.8 + hash(x >> 1, y >> 3) * 0.2;
    }
    T.clothN = tex(normalFromHeight(h1, s, s, 1.2), { srgb: false, repeat: [4, 4] });
    T.furN = tex(normalFromHeight(h2, s, s, 3.5), { srgb: false, repeat: [3, 3] });
  }
  // ---- 木箱
  {
    const s = 512 * q; const [c, g] = canvas(s, s);
    g.fillStyle = '#b98a4e'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#c49456' : '#ad7f45'; g.fillRect(0, i * s / 5, s, s / 5 - 3 * q); }
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(90,55,20,${Math.random() * 0.15})`; g.fillRect(Math.random() * s, Math.random() * s, 26 * q, 1.2 * q); }
    g.fillStyle = '#8a5f2c'; const bw = 44 * q;
    g.fillRect(0, 0, s, bw); g.fillRect(0, s - bw, s, bw); g.fillRect(0, 0, bw, s); g.fillRect(s - bw, 0, bw, s);
    g.save(); g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.fillRect(-s * 0.7, -bw / 2, s * 1.4, bw); g.restore();
    g.fillStyle = '#3d3d3d'; for (const [x, y] of [[bw / 2, bw / 2], [s - bw / 2, bw / 2], [bw / 2, s - bw / 2], [s - bw / 2, s - bw / 2]]) { g.beginPath(); g.arc(x, y, 7 * q, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(30,30,30,0.75)'; g.font = `bold ${64 * q}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('資材', s / 2, s / 2);
    T.crate = tex(c);
  }
  // ---- 黄黒の警告縞
  {
    const s = 256 * q; const [c, g] = canvas(s, s);
    g.fillStyle = '#f2b705'; g.fillRect(0, 0, s, s); g.fillStyle = '#1d1d1d';
    for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4 + s / 8, 0); g.lineTo(i * s / 4 + s / 8 + s, s); g.lineTo(i * s / 4 + s, s); g.fill(); }
    T.hazard = tex(c, { repeat: [1, 1] });
  }
  // ---- ベルト（向きを示す山形の矢印。オフセットを動かして流す）
  {
    const w = 256 * q, h = 128 * q; const [c, g] = canvas(w, h);
    g.fillStyle = '#26282c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8 * q) { g.fillStyle = x % (16 * q) ? '#2e3136' : '#202226'; g.fillRect(x, 0, 4 * q, h); }
    g.strokeStyle = '#e9e2c8'; g.lineWidth = 12 * q; g.lineJoin = 'miter';
    for (const ox of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(ox - 22 * q, h * 0.18); g.lineTo(ox + 18 * q, h * 0.5); g.lineTo(ox - 22 * q, h * 0.82); g.stroke(); }
    T.belt = tex(c, { repeat: [1, 1] });
  }
  // ---- 「使用禁止」の札
  {
    const w = 256, h = 160; const [c, g] = canvas(w, h);
    g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(8, 8, w - 16, h - 16); g.fillStyle = '#c8102e'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('使用禁止', w / 2, h / 2 + 2);
    T.tag = tex(c);
  }
  // ---- 装置の番号札 ①〜④
  T.num = [1, 2, 3, 4].map((n) => {
    const s = 128; const [c, g] = canvas(s, s);
    g.fillStyle = '#10151c'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#f2b705'; g.lineWidth = 8; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, 7); g.stroke();
    g.fillStyle = '#f2f2f2'; g.font = 'bold 76px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), s / 2, s / 2 + 4);
    return tex(c);
  });
  // ---- 蒸気（やわらかい雲）
  {
    const s = 128; const [c, g] = canvas(s, s);
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(240,244,250,0.45)'); gr.addColorStop(1, 'rgba(240,244,250,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    T.puff = tex(c);
  }
  // ---- 光のにじみ（作業灯）
  {
    const s = 128; const [c, g] = canvas(s, s);
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.2, 'rgba(255,210,140,0.5)'); gr.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    T.glow = tex(c);
  }
  // ---- 窓の明かり（遠くのビル）
  {
    const w = 256, h = 512; const [c, g] = canvas(w, h);
    g.fillStyle = '#1b2333'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 20) for (let x = 8; x < w; x += 18) {
      const r = hash(x, y); g.fillStyle = r > 0.62 ? `rgba(255,${200 + r * 40 | 0},${120 + r * 60 | 0},${0.55 + r * 0.4})` : 'rgba(40,52,74,0.9)'; g.fillRect(x, y, 10, 12);
    }
    T.windows = tex(c, { repeat: [1, 1] });
  }
  cache[q] = T;
  return T;
}

// 遠景の空と街並み（面ごとに時間帯を変える）。2D の背景板と VR の円筒パノラマの両方に使う
export function skylineTexture(theme, w = 4096, h = 1024) {
  const [c, g] = canvas(w, h);
  const sky = g.createLinearGradient(0, 0, 0, h);
  for (const [k, col] of theme.sky) sky.addColorStop(k, col);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // 太陽・月
  if (theme.sun) { const [sx, sy, sr, col] = theme.sun; const gr = g.createRadialGradient(sx * w, sy * h, 0, sx * w, sy * h, sr * h * 3); gr.addColorStop(0, col); gr.addColorStop(0.25, col.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = col; g.beginPath(); g.arc(sx * w, sy * h, sr * h, 0, 7); g.fill(); }
  // 雲
  for (let i = 0; i < 40; i++) {
    const x = hash(i, 1) * w, y = (0.08 + hash(i, 2) * 0.35) * h, r = (40 + hash(i, 3) * 120) * (w / 4096);
    g.fillStyle = theme.cloud; g.beginPath(); g.ellipse(x, y, r * 2.6, r * 0.5, 0, 0, 7); g.fill();
  }
  // 街並み 3 層（奥ほど空の色に近く）
  for (let layer = 0; layer < 3; layer++) {
    const base = h * (0.62 + layer * 0.08), col = theme.city[layer];
    let x = 0, k = layer * 100;
    while (x < w) {
      const bw = (60 + hash(k, 5) * 160) * (w / 4096), bh = (80 + hash(k, 6) * (360 - layer * 90)) * (h / 1024);
      g.fillStyle = col; g.fillRect(x, base - bh, bw, h - base + bh);
      if (hash(k, 9) > 0.7) { g.fillRect(x + bw * 0.4, base - bh - 40 * (h / 1024), 4, 40 * (h / 1024)); }
      // 窓
      if (layer > 0) for (let wy = base - bh + 10; wy < h - 6; wy += 14 * (h / 1024)) for (let wx = x + 6; wx < x + bw - 6; wx += 11 * (w / 4096)) {
        const r = hash(wx | 0, wy | 0); if (r > theme.lit) { g.fillStyle = theme.window; g.fillRect(wx, wy, 5 * (w / 4096), 7 * (h / 1024)); }
      }
      x += bw + hash(k, 7) * 8; k++;
    }
  }
  // 遠くのクレーン
  g.strokeStyle = theme.city[0]; g.lineWidth = 6 * (w / 4096);
  for (const cx of [0.18, 0.55, 0.83]) {
    const X = cx * w, B = h * 0.62, T = h * 0.22;
    g.beginPath(); g.moveTo(X, B); g.lineTo(X, T); g.lineTo(X + 0.12 * w, T); g.moveTo(X - 0.03 * w, T); g.lineTo(X, T); g.moveTo(X + 0.09 * w, T); g.lineTo(X + 0.09 * w, T + 0.12 * h); g.stroke();
    for (let y = T; y < B; y += 18) { g.beginPath(); g.moveTo(X - 6, y); g.lineTo(X + 6, y + 9); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export const THEMES = {
  tutorial:  { sky: [[0, '#6fb7ea'], [0.6, '#bfe3f2'], [1, '#e9f4ee']], cloud: 'rgba(255,255,255,0.55)', city: ['#9fb8c9', '#7f9cb2', '#5e7f98'], window: 'rgba(255,240,190,0.0)', lit: 2, sun: [0.75, 0.2, 0.05, 'rgba(255,250,220,1)'] },
  girders:   { sky: [[0, '#2f7fd0'], [0.55, '#8ccbf0'], [1, '#f4e2b5']], cloud: 'rgba(255,255,255,0.5)', city: ['#8aa6c2', '#6683a3', '#40597a'], window: 'rgba(255,236,170,0.7)', lit: 0.97, sun: [0.8, 0.18, 0.05, 'rgba(255,248,215,1)'] },
  conveyors: { sky: [[0, '#3a4f8f'], [0.5, '#e98b5a'], [1, '#ffcf7a']], cloud: 'rgba(255,190,140,0.45)', city: ['#a26a64', '#6f4a5a', '#3f2d43'], window: 'rgba(255,214,140,0.6)', lit: 0.9, sun: [0.3, 0.55, 0.07, 'rgba(255,200,120,1)'] },
  elevators: { sky: [[0, '#16244a'], [0.6, '#5a4d8a'], [1, '#d78b7c']], cloud: 'rgba(170,150,210,0.35)', city: ['#4b4870', '#2f2f52', '#1c1d36'], window: 'rgba(255,220,150,0.55)', lit: 0.86, sun: null },
  summit:    { sky: [[0, '#070b1f'], [0.55, '#1a2350'], [1, '#3b3970']], cloud: 'rgba(120,130,190,0.22)', city: ['#2a3058', '#1b1f3e', '#10132a'], window: 'rgba(255,226,160,0.5)', lit: 0.88, sun: [0.7, 0.14, 0.035, 'rgba(240,240,255,1)'] },
};
