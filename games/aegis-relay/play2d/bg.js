// AEGIS RELAY 2D — 背景（宇宙）: 星雲・星・天体・遠景の岩・雲・流れ星・ワープの光・盤面の外の飾り
// ・星雲と天体は ImageData で 1 回だけ焼く（時間分割）。毎フレームは drawImage だけ
// ・星雲は縦につながる（640 単位で一周）。色の段が出ないよう、焼くときに乱数のゆらぎ（ディザー）を入れる
import { FIELD, THEMES, AREAS } from '../shared/rules.js';
import { ART, LIGHT } from './themes2d.js';
import { TAU, lerp, clamp, smooth, rng, hexRgb, mix3, css, hueShift, fbm, NT, makeCanvas, freeCanvas } from './util.js';

const W = FIELD.W, H = FIELD.H, SKYH = 640;
const mod = (a, n) => ((a % n) + n) % n;
const STAR_COLS = ['#9db8ff', '#cfe0ff', '#ffffff', '#fff0d0', '#ffd2a8'];

export function createBackdrop(R) {
  const cache = new Map();
  let bakedK = 0, starSpr = null, flareSpr = null, streakSpr = null, cloudBase = null;

  // 星（3 層＋明るい星）。位置は固定の乱数。y は 480 単位で一周
  const SP = 480;
  const layers = [
    { par: 0.05, n: 150, a: 0.55, sz: 0 }, { par: 0.11, n: 70, a: 0.8, sz: 1 }, { par: 0.2, n: 30, a: 1, sz: 2 },
  ].map((L, li) => { const r = rng(700 + li * 31); L.stars = Array.from({ length: L.n }, () => ({ x: r() * W, y: r() * SP, col: Math.floor(r() * r() * 5 + r() * 2) % 5, ph: r() * TAU, sp: 0.6 + r() * 2.4, b: 0.5 + r() * 0.5 })); return L; });
  const flares = (() => { const r = rng(4242); return Array.from({ length: 7 }, () => ({ x: 12 + r() * (W - 24), y: r() * SP, col: Math.floor(r() * 5), ph: r() * TAU, sp: 0.4 + r(), s: 0.6 + r() * 0.8 })); })();
  const farRocks = (() => { const r = rng(909); return Array.from({ length: 16 }, (_, i) => ({ x: r() * W, y: r() * 760, i: i % 6, s: 0.5 + r() * 0.9, rot: r() * TAU, par: 0.26 + r() * 0.12 })); })();
  const cloudsLo = (() => { const r = rng(515); return Array.from({ length: 6 }, (_, i) => ({ x: r() * W, y: i * 117 + r() * 60, i: i % 3, s: 0.7 + r() * 0.7, vx: (r() - 0.5) * 3, a: 0.4 + r() * 0.3 })); })();
  const cloudsHi = (() => { const r = rng(616); return Array.from({ length: 4 }, (_, i) => ({ x: r() * W, y: i * 225 + r() * 80, i: i % 3, s: 0.9 + r() * 0.6, vx: 2 + r() * 4, a: 0.6 + r() * 0.4 })); })();
  const shooting = { t: 3, x: 0, y: 0, vx: 0, vy: 0, life: 0 }, flashFar = { t: 5, x: 0, y: 0, life: 0, col: 2 };
  const warp = (() => { const r = rng(88); return Array.from({ length: 46 }, () => ({ x: r() * W, y: r() * H, v: 0.6 + r() * 0.8, l: 0.5 + r(), w: 0.5 + r() })); })();

  function bakeCommon() {
    if (bakedK === R.K) return; bakedK = R.K;
    const K = R.K;
    for (const s of starSpr || []) freeCanvas(s); for (const s of flareSpr || []) freeCanvas(s); freeCanvas(streakSpr);
    // 星の粒（色 5 × 大きさ 2）と光条つきの星（色 5）
    starSpr = [];
    for (let sz = 1; sz <= 2; sz++) for (let ci = 0; ci < 5; ci++) {
      const rad = Math.max(1.5, (sz === 1 ? 0.55 : 0.95) * K), px = Math.ceil(rad * 2) + 2, cv = makeCanvas(px, px), c = cv.getContext('2d');
      const g = c.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, rad); const col = hexRgb(STAR_COLS[ci]);
      g.addColorStop(0, '#fff'); g.addColorStop(0.3, css(col, 0.9)); g.addColorStop(1, css(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, px, px); cv.u = px / K; starSpr.push(cv);
    }
    flareSpr = [];
    for (let ci = 0; ci < 5; ci++) {
      const ext = 9, px = Math.ceil(ext * 2 * K), cv = makeCanvas(px, px), c = cv.getContext('2d'), col = hexRgb(STAR_COLS[ci]);
      c.setTransform(K, 0, 0, K, px / 2, px / 2); c.globalCompositeOperation = 'lighter';
      let g = c.createRadialGradient(0, 0, 0, 0, 0, 3.4); g.addColorStop(0, css(col, 0.9)); g.addColorStop(0.25, css(col, 0.35)); g.addColorStop(1, css(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 3.4, 0, TAU); c.fill();
      for (let k = 0; k < 4; k++) { // 十字の光条（細いひし形）
        const len = k % 2 ? 6 : 8.5, wd = Math.max(0.16, 1.2 / K);
        c.save(); c.rotate(k * Math.PI / 2 + 0.12);
        g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, css(col, 0.9)); g.addColorStop(1, css(col, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(0, -wd * 1.6); c.lineTo(len, 0); c.lineTo(0, wd * 1.6); c.closePath(); c.fill(); c.restore();
      }
      g = c.createRadialGradient(0, 0, 0, 0, 0, 0.9); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.9, 0, TAU); c.fill();
      cv.ext = ext; flareSpr.push(cv);
    }
    // ワープ・流れ星の光の筋（縦長。上が尾、下が頭）
    { const cv = makeCanvas(8, 128), c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(160,200,255,0)'); g.addColorStop(0.7, 'rgba(190,225,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g; c.fillRect(0, 0, 8, 128); c.globalCompositeOperation = 'destination-in';
      const g2 = c.createLinearGradient(0, 0, 8, 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, '#000'); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.fillRect(0, 0, 8, 128); streakSpr = cv; }
    if (!cloudBase) cloudBase = [0, 1, 2].map(bakeCloud);
  }

  // 雲の元（白・透明度だけ）。フラクタルノイズ × だ円の落ち込み
  function bakeCloud(i) {
    const w = 256, h = 128, cv = makeCanvas(w, h), c = cv.getContext('2d'), img = c.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1, fall = 1 - (nx * nx + ny * ny * 1.2);
      const n = fbm(x * 0.9 + i * 170 + 30, y * 1.5 + i * 90 + 11) * 0.7 + fbm(x * 2.6 + 400, y * 3.4 + i * 55) * 0.3;
      const a = smooth(0.42, 0.95, n * 0.75 + fall * 0.5) * smooth(0, 0.35, fall);
      const o = (y * w + x) * 4, sh = 205 + 50 * smooth(0.3, 0.9, n - ny * 0.25); d[o] = d[o + 1] = d[o + 2] = sh; d[o + 3] = a * 255;
    }
    c.putImageData(img, 0, 0); return cv;
  }

  function palette(area, loop) {
    const th = THEMES[AREAS[area].theme], art = ART[AREAS[area].theme], hs = (loop % 9) * 38; // 周回ごとに空の色相を回す
    return { th, art, sky: th.sky.map((s) => hueShift(hexRgb(s), hs)), neb: art.neb.map((s) => hueShift(hexRgb(s), hs)), hs };
  }

  function* bakeNebula(e) {
    const NK = Math.min(R.K, R.low ? 1.5 : 2.25), w = Math.round(W * NK), h = Math.round(SKYH * NK);
    const cv = makeCanvas(w, h), c = cv.getContext('2d', { alpha: false }), CH = 24, s = (NT * 2) / h;
    const [s0, s1, s2] = e.pal.sky, [A, B, C] = e.pal.neb; let seed = 12345 + e.area * 977;
    const off = e.area * 61.7;
    for (let y0 = 0; y0 < h; y0 += CH) {
      const rows = Math.min(CH, h - y0), img = c.createImageData(w, rows), d = img.data;
      for (let j = 0; j < rows; j++) {
        const y = y0 + j, v = y * s, gy = 0.5 - 0.5 * Math.cos((y / h) * TAU);
        for (let x = 0; x < w; x++) {
          const u = x * s + off;
          const wx = fbm(u + 37.2, v + 11.7) - 0.5, wy = fbm(u + 201.3, v + 93.1) - 0.5;
          const n1 = fbm(u * 0.5 + wx * 90 + 400, v * 0.5 + wy * 90), n2 = fbm(u * 1.5 + wy * 70 + 150, v * 1.5 - wx * 70 + 310);
          const dn = fbm(u + wx * 150 + 77, v + wy * 150 + 260), fine = fbm(u * 4 + 9, v * 4 + 5);
          const g1 = smooth(0.4, 0.82, n1 + (fine - 0.5) * 0.14), g2 = smooth(0.5, 0.86, n2 + (fine - 0.5) * 0.1), core = smooth(0.52, 0.8, n1 * n2 * 2.1);
          const t = clamp(gy * 0.55 + n1 * 0.45);
          let r = (s0[0] + (s1[0] - s0[0]) * t) * 0.8, g = (s0[1] + (s1[1] - s0[1]) * t) * 0.8, b = (s0[2] + (s1[2] - s0[2]) * t) * 0.8;
          const k1 = g1 * g1 * 0.3, k2 = g2 * (0.2 + g1 * 0.5) * 0.24, k3 = core * core * 0.2, k4 = smooth(0.35, 0.75, n2) * 0.32;
          r += A[0] * k1 + B[0] * k2 + C[0] * k3 + s2[0] * k4; g += A[1] * k1 + B[1] * k2 + C[1] * k3 + s2[1] * k4; b += A[2] * k1 + B[2] * k2 + C[2] * k3 + s2[2] * k4;
          const dust = 1 - 0.62 * smooth(0.5, 0.7, dn) * (0.3 + g1); // 暗い塵の筋
          seed = (seed * 1664525 + 1013904223) >>> 0; const di = seed / 4294967296 - 0.5; // ディザー
          const o = (j * w + x) * 4; d[o] = r * dust + di; d[o + 1] = g * dust + di; d[o + 2] = b * dust + di; d[o + 3] = 255;
        }
      }
      c.putImageData(img, 0, y0); yield;
    }
    e.neb = cv;
  }

  function* bakePlanet(e) {
    const P = e.pal.art.planet, PK = Math.min(R.K, R.low ? 2 : 4);
    const extR = P.ring ? P.ring.r1 * 1.06 : P.type === 'star' ? 2.6 : 1.22, size = Math.ceil(P.R * 2 * extR * PK);
    const tmp = makeCanvas(size, size), tc = tmp.getContext('2d'), hs = e.pal.hs;
    const c0 = hueShift(hexRgb(P.c[0]), hs), c1 = hueShift(hexRgb(P.c[1]), hs), c2 = hueShift(hexRgb(P.c[2]), hs), at = hueShift(hexRgb(P.atmo), hs);
    const Rp = P.R * PK, cx = size / 2, sd = e.area * 53.1, night = P.night || 0, CH = 24;
    const lx = LIGHT.x + night * 1.1, ly = LIGHT.y, lz = LIGHT.z - night * 0.9, ll = Math.hypot(lx, ly, lz), Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;
    for (let y0 = 0; y0 < size; y0 += CH) {
      const rows = Math.min(CH, size - y0), img = tc.createImageData(size, rows), d = img.data;
      for (let j = 0; j < rows; j++) for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - cx) / Rp, dy = (y0 + j + 0.5 - cx) / Rp, r2 = dx * dx + dy * dy, o = (j * size + x) * 4;
        if (r2 < 1) {
          const nz = Math.sqrt(1 - r2), dif = dx * Lx + dy * Ly + nz * Lz, lit = smooth(-0.12, 0.32, dif) * (0.3 + 0.7 * Math.max(0, dif));
          const u = Math.atan2(dx, nz) * 100 + sd, v = Math.asin(dy) * 100 + sd * 0.7;
          let r, g, b, er = 0, eg = 0, eb = 0, spec = 0;
          if (P.type === 'gas') {
            const band = fbm(u * 0.12 + 20, v * 1.5 + fbm(u * 0.8, v * 0.8) * 26), k = smooth(0.3, 0.7, band), st = smooth(0.62, 0.8, fbm(u * 0.9 + 90, v * 1.8 + 40));
            const m = k < 0.5 ? mix3(c2, c1, k * 2) : mix3(c1, c0, k * 2 - 1); r = m[0] + st * 30; g = m[1] + st * 30; b = m[2] + st * 30;
          } else if (P.type === 'lava') {
            const n = fbm(u * 1.3, v * 1.3), n2 = fbm(u * 3.1 + 40, v * 3.1), cr = 1 - smooth(0, 0.05, Math.abs(n - 0.5)), m = mix3(c1, c0, n2);
            r = m[0]; g = m[1]; b = m[2]; const hot = cr * (0.5 + 0.5 * n2) + smooth(0.7, 0.9, n2) * 0.6; er = c2[0] * hot; eg = c2[1] * hot; eb = c2[2] * hot * 0.6;
          } else if (P.type === 'city') {
            const n = fbm(u * 0.9, v * 0.9), cell = (Math.floor(u / 5) * 7 + Math.floor(v / 5) * 13) & 7, m = mix3(c1, c0, n * 0.7 + cell * 0.04);
            const edge = Math.min(mod(u, 5), mod(v, 5)) < 0.5 ? 0.75 : 1; r = m[0] * edge; g = m[1] * edge; b = m[2] * edge;
            const li = (fbm(u * 6.1 + 7, v * 6.1) > 0.63 && n > 0.45 ? 1 : 0) * (1 - smooth(0.05, 0.4, lit)); er = at[0] * li * 0.9; eg = at[1] * li * 0.9; eb = at[2] * li * 0.7; spec = 0.3;
          } else if (P.type === 'earth') {
            const n = fbm(u * 0.8 + 11, v * 0.8 + 5) + (fbm(u * 3 + 80, v * 3) - 0.5) * 0.25, land = smooth(0.5, 0.56, n), cl = smooth(0.52, 0.78, fbm(u * 1.4 + 300 + fbm(u, v) * 30, v * 2.2 + 120));
            const m = mix3(c1, mix3(c0, [150, 140, 90], smooth(0.62, 0.8, n)), land); r = lerp(m[0], c2[0], cl); g = lerp(m[1], c2[1], cl); b = lerp(m[2], c2[2], cl); spec = (1 - land) * (1 - cl) * 0.8;
          } else if (P.type === 'star') {
            const gr = fbm(u * 4, v * 4), m = mix3(c1, c0, smooth(0.2, 1, nz) * 0.8 + gr * 0.2); r = g = b = 0; er = m[0]; eg = m[1]; eb = m[2];
          } else {
            const n = fbm(u * 0.9, v * 0.9), n2 = fbm(u * 3.3 + 60, v * 3.3 + 20), cr = fbm(u * 2.1 + 50, v * 2.1 + 90);
            const m = mix3(c1, c0, smooth(0.3, 0.72, n)); let k = 0.78 + 0.44 * n2; if (P.crater) k *= 1 - 0.4 * smooth(0.7, 0.76, cr) + 0.25 * smooth(0.66, 0.7, cr) * (1 - smooth(0.7, 0.74, cr));
            r = m[0] * k; g = m[1] * k; b = m[2] * k;
          }
          const hx = Lx, hy = Ly, hz = Lz + 1, hl = Math.hypot(hx, hy, hz), sp = spec * Math.pow(Math.max(0, (dx * hx + dy * hy + nz * hz) / hl), 40) * 200;
          const rim = Math.pow(1 - nz, 3) * (0.25 + 0.75 * smooth(-0.3, 0.5, dif)), amb = 0.035;
          d[o] = r * (lit + amb) + er + sp + at[0] * rim * 0.7; d[o + 1] = g * (lit + amb) + eg + sp + at[1] * rim * 0.7; d[o + 2] = b * (lit + amb) + eb + sp + at[2] * rim * 0.7;
          d[o + 3] = clamp((1 - Math.sqrt(r2)) * Rp + 0.5) * 255;
        } else {
          // 大気の縁光（昼の側だけ明るい）。恒星は大きなにじみ
          const r = Math.sqrt(r2), lim = P.type === 'star' ? 2.5 : 1.2;
          if (r < lim) {
            const k = 1 - (r - 1) / (lim - 1), side = P.type === 'star' ? 1 : smooth(-0.5, 0.6, (dx * Lx + dy * Ly) / r);
            d[o] = at[0]; d[o + 1] = at[1]; d[o + 2] = at[2]; d[o + 3] = (P.type === 'star' ? k * k * k * 0.75 : k * k * 0.55) * side * 255;
          }
        }
      }
      tc.putImageData(img, 0, y0); yield;
    }
    let out = tmp;
    if (P.ring) { // 環: 奥の半分 → 本体 → 手前の半分
      out = makeCanvas(size, size); const c = out.getContext('2d'), rc = hueShift(hexRgb(P.ring.col), hs), rr = rng(e.area * 7 + 3);
      const bands = Array.from({ length: 14 }, (_, i) => ({ r: lerp(P.ring.r0, P.ring.r1, (i + 0.5) / 14), a: 0.12 + rr() * 0.5 }));
      const half = (a0, a1) => { c.save(); c.translate(cx, cx); c.rotate(P.ring.rot); c.scale(1, P.ring.tilt);
        for (const bnd of bands) { c.strokeStyle = css(rc, bnd.a); c.lineWidth = ((P.ring.r1 - P.ring.r0) / 14) * Rp * 1.02; c.beginPath(); c.arc(0, 0, bnd.r * Rp, a0, a1); c.stroke(); } c.restore(); };
      half(Math.PI, TAU); c.drawImage(tmp, 0, 0); half(0, Math.PI); freeCanvas(tmp);
    }
    out.u = size / PK; e.planet = out;
  }

  // 遠景の浮遊岩（暗いシルエット＋左上のかすかな縁光）
  function bakeRocks(e) {
    const K = Math.min(R.K, 4), th = e.pal.th, dark = mix3(e.pal.sky[0], [0, 0, 0], 0.35), mid = mix3(hueShift(hexRgb(th.side), 0), e.pal.sky[1], 0.5), rimc = mix3(hexRgb(th.landHi), e.pal.sky[2], 0.5);
    e.rocks = [0, 1, 2, 3, 4, 5].map((i) => {
      const r = rng(i * 17 + 5), ext = 16, cv = makeCanvas(ext * 2 * K, ext * 2 * K), c = cv.getContext('2d'); c.setTransform(K, 0, 0, K, ext * K, ext * K);
      const n = 9 + Math.floor(r() * 4), pts = []; for (let k = 0; k < n; k++) { const a = (k / n) * TAU, rad = (7 + r() * 6) * (1 + 0.25 * Math.sin(a * 2 + i)); pts.push([Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 0.8]); }
      const path = () => { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
      path(); const g = c.createLinearGradient(-10, -9, 10, 10); g.addColorStop(0, css(mid)); g.addColorStop(0.5, css(mix3(mid, dark, 0.6))); g.addColorStop(1, css(dark)); c.fillStyle = g; c.fill();
      c.save(); c.clip(); c.lineWidth = 1.4; c.strokeStyle = css(rimc, 0.5); c.translate(0.9, 1); path(); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.5; for (let k = 0; k < 4; k++) { c.beginPath(); const a = r() * TAU; c.moveTo(Math.cos(a) * 2, Math.sin(a) * 2); c.lineTo(Math.cos(a + 0.3) * 12, Math.sin(a + 0.3) * 9); c.stroke(); }
      c.restore(); cv.ext = ext; return cv;
    });
    const cc = hueShift(hexRgb(e.pal.art.cloud), e.pal.hs);
    e.clouds = cloudBase.map((b) => { const cv = makeCanvas(b.width, b.height), c = cv.getContext('2d'); c.drawImage(b, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = css(cc); c.fillRect(0, 0, cv.width, cv.height); c.globalCompositeOperation = 'multiply'; c.drawImage(b, 0, 0); c.globalCompositeOperation = 'destination-in'; c.drawImage(b, 0, 0); return cv; });
  }

  function freeEntry(e) { R.jobs.cancel((k) => k === 'sky:' + e.k || k === 'planet:' + e.k); freeCanvas(e.neb); freeCanvas(e.planet); for (const r of e.rocks || []) freeCanvas(r); for (const r of e.clouds || []) freeCanvas(r); }
  // エリアの空を用意する（まだなら焼き始める）。次のエリアの先読みにも使う
  function ensure(area, loop, keep) {
    bakeCommon();
    const k = area + '|' + loop + '|' + R.K.toFixed(3) + (R.low ? 'L' : ''); let e = cache.get(k);
    if (!e) {
      e = { k, area, loop, neb: null, planet: null, fade: 0, pal: palette(area, loop) };
      for (const [k2, e2] of cache) if (cache.size >= 2 && e2 !== keep) { freeEntry(e2); cache.delete(k2); }
      cache.set(k, e); bakeRocks(e);
      R.jobs.add('sky:' + k, bakeNebula(e)); R.jobs.add('planet:' + k, bakePlanet(e));
    }
    return e;
  }

  let cur = null;
  function draw(c, area, loop, sc, time, dt, warpK) {
    const e = cur = ensure(area, loop, cur), K = R.K;
    if (e.fade < 1) { c.fillStyle = css(mix3(e.pal.sky[0], e.pal.sky[1], 0.4)); c.fillRect(-4, -4, W + 8, H + 8); }
    c.imageSmoothingQuality = 'low';
    if (e.neb) {
      e.fade = Math.min(1, e.fade + dt * 2.5); c.globalAlpha = e.fade;
      const nk = e.neb.height / SKYH, ys = mod(-sc * 0.1, SKYH), h1 = Math.min(H + 8, SKYH - ys);
      c.drawImage(e.neb, 0, ys * nk, e.neb.width, h1 * nk, 0, -4, W, h1);
      if (h1 < H + 8) c.drawImage(e.neb, 0, 0, e.neb.width, (H + 8 - h1) * nk, 0, -4 + h1, W, H + 8 - h1);
      c.globalAlpha = 1;
    }
    // 星（遠い層は最小 1 実ピクセルの点、近い層は光の粒）
    const px1 = 1 / K;
    for (let li = 0; li < 3; li++) {
      const L = layers[li]; if (R.low && li === 0) continue;
      for (const s of L.stars) {
        const y = mod(s.y + sc * L.par, SP) - 40; if (y < -3 || y > H + 3) continue;
        const tw = 0.62 + 0.38 * Math.sin(time * 0.05 * s.sp + s.ph);
        c.globalAlpha = L.a * s.b * tw;
        if (L.sz === 0) { const d = Math.max(px1, 0.32); c.fillStyle = STAR_COLS[s.col]; c.fillRect(s.x, y, d, d); }
        else { const sp = starSpr[(L.sz - 1) * 5 + s.col]; c.drawImage(sp, s.x - sp.u / 2, y - sp.u / 2, sp.u, sp.u); }
      }
    }
    c.globalCompositeOperation = 'lighter';
    for (const f of flares) {
      const y = mod(f.y + sc * 0.14, SP) - 40; if (y < -10 || y > H + 10) continue;
      const tw = 0.7 + 0.3 * Math.sin(time * 0.04 * f.sp + f.ph), sp = flareSpr[f.col], ext = sp.ext * f.s * (0.9 + 0.1 * tw);
      c.globalAlpha = tw; c.drawImage(sp, f.x - ext, y - ext, ext * 2, ext * 2);
    }
    // 遠くの出来事: 流れ星と、遠方の小さな閃光
    shooting.t -= dt; flashFar.t -= dt;
    if (shooting.t <= 0) { shooting.t = 4 + Math.random() * 7; shooting.life = 0.7; shooting.x = Math.random() * W; shooting.y = Math.random() * H * 0.5; const a = 0.5 + Math.random() * 0.7; shooting.vx = Math.cos(a) * 260 * (Math.random() < 0.5 ? -1 : 1); shooting.vy = Math.sin(a) * 260; }
    if (shooting.life > 0) {
      shooting.life -= dt; shooting.x += shooting.vx * dt; shooting.y += shooting.vy * dt;
      const k = Math.sin(clamp(shooting.life / 0.7) * Math.PI), ang = Math.atan2(shooting.vy, shooting.vx) - Math.PI / 2;
      c.save(); c.translate(shooting.x, shooting.y); c.rotate(ang); c.globalAlpha = k * 0.8; c.drawImage(streakSpr, -0.5, -34, 1, 34); c.restore();
    }
    if (flashFar.t <= 0) { flashFar.t = 3 + Math.random() * 6; flashFar.life = 0.9; flashFar.x = Math.random() * W; flashFar.y = Math.random() * H * 0.7; flashFar.col = Math.floor(Math.random() * 5); }
    if (flashFar.life > 0) { flashFar.life -= dt; const k = Math.sin(clamp(flashFar.life / 0.9) * Math.PI) ** 2, sp = flareSpr[flashFar.col], ext = 5 * k + 1; c.globalAlpha = k * 0.8; c.drawImage(sp, flashFar.x - ext, flashFar.y - ext, ext * 2, ext * 2); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    // 天体
    if (e.planet) {
      const P = e.pal.art.planet, u = e.planet.u, y = P.y + sc * 0.028 - 30;
      if (y - u / 2 < H) { c.globalAlpha = 0.92 * e.fade; c.drawImage(e.planet, P.x - u / 2, y - u / 2, u, u); c.globalAlpha = 1; }
    }
    // ワープの光の筋（エリアの切り替え）
    if (warpK > 0.01) drawWarp(c, time, warpK, 0, 30);
    // 遠景の岩
    c.imageSmoothingQuality = 'high';
    for (const r of farRocks) {
      const y = mod(r.y + sc * r.par, 760) - 40; if (y < -30 || y > H + 30) continue;
      const sp = e.rocks[r.i], ext = sp.ext * r.s; c.globalAlpha = 0.85;
      c.save(); c.translate(r.x, y); c.rotate(r.rot * 0.2 + Math.sin(time * 0.004 + r.rot) * 0.05); c.drawImage(sp, -ext, -ext, ext * 2, ext * 2); c.restore();
    }
    // 大陸の下を流れる雲
    c.imageSmoothingQuality = 'low';
    for (const cl of cloudsLo) {
      const y = mod(cl.y + sc * 0.5, 700) - 190, w = 150 * cl.s, h = 75 * cl.s; if (y + h < 0 || y > H) continue;
      const x = mod(cl.x + time * cl.vx * 0.016 + w, W + w * 2) - w * 1.5;
      c.globalAlpha = cl.a * 0.5; c.drawImage(e.clouds[cl.i], x, y, w, h);
    }
    c.globalAlpha = 1;
  }
  function drawWarp(c, time, k, from, to) {
    c.globalCompositeOperation = 'lighter';
    for (let i = from; i < to; i++) {
      const s = warp[i], len = (10 + 90 * k) * s.l, y = mod(s.y + time * (2 + 16 * k) * s.v, H + 140) - 20;
      c.globalAlpha = Math.min(1, k * 0.85) * (0.4 + 0.6 * s.l / 1.5); const wd = Math.max(1 / R.K, 0.5 * s.w);
      c.drawImage(streakSpr, s.x - wd / 2, y - len, wd, len);
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
  // 大陸の上を流れる薄い雲（空の敵・弾より下。軽量画質では描かない）
  function drawUpper(c, sc, time, warpK) {
    if (!cur) return;
    if (!R.low) {
      c.imageSmoothingQuality = 'low';
      for (const cl of cloudsHi) {
        const y = mod(cl.y + sc * 1.3, 900) - 260, w = 170 * cl.s, h = 85 * cl.s; if (y + h < 0 || y > H) continue;
        const x = mod(cl.x + time * cl.vx * 0.016 + w, W + w * 2) - w * 1.5;
        c.globalAlpha = cl.a * 0.16; c.drawImage(cur.clouds[cl.i], x, y, w, h);
      }
      c.globalAlpha = 1;
    }
    if (warpK > 0.01) drawWarp(c, time * 1.3, warpK * 0.6, 30, 46);
  }

  // ── 盤面の外（HUD の後ろ）: 暗い計器風の下地。HUD の邪魔をしない薄さにとどめる ──
  let margin = null;
  function bakeMargin(lay, Wp, Hp, S) {
    freeCanvas(margin);
    const ms = Wp * Hp > 2600000 ? 0.5 : 1, w = Math.ceil(Wp * ms), h = Math.ceil(Hp * ms);
    const cv = margin = makeCanvas(w, h), c = cv.getContext('2d'), img = c.createImageData(w, h), d = img.data;
    const fx0 = lay.fx * S * ms, fx1 = (lay.fx + lay.fw) * S * ms, fy0 = lay.fy * S * ms, fy1 = (lay.fy + lay.fh) * S * ms; let seed = 777;
    const ns = 300 / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (x > fx0 + 2 && x < fx1 - 2 && y > fy0 + 2 && y < fy1 - 2) { d[o + 3] = 255; continue; }
      const dx = x < fx0 ? (fx0 - x) / Math.max(1, fx0) : x > fx1 ? (x - fx1) / Math.max(1, w - fx1) : 0, n = fbm(x * ns + 40, y * ns + 90);
      const k = (1 - dx) * (1 - dx) * 0.9 + n * 0.5, vy = Math.abs(y / h - 0.5) * 2;
      seed = (seed * 1664525 + 1013904223) >>> 0; const di = seed / 4294967296 - 0.5;
      d[o] = 4 + 4 * k - vy * 1.5 + di; d[o + 1] = 6 + 7 * k - vy * 2 + di; d[o + 2] = 13 + 15 * k - vy * 4 + di; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const u = lay.u * S * ms, lw = Math.max(1, S * ms);
    c.lineWidth = lw; c.strokeStyle = 'rgba(120,180,255,.04)'; c.beginPath();
    for (let x = fx0 - 40 * u; x > 0; x -= 40 * u) { c.moveTo(x, 0); c.lineTo(x, h); } for (let x = fx1 + 40 * u; x < w; x += 40 * u) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = fy0; y < h; y += 40 * u) { c.moveTo(0, y); c.lineTo(fx0, y); c.moveTo(fx1, y); c.lineTo(w, y); } c.stroke();
    // 盤面の縁の目盛り
    c.strokeStyle = 'rgba(140,200,255,.16)'; c.beginPath();
    for (let i = 0; i <= 40; i++) { const y = fy0 + i * 8 * u, l = (i % 5 ? 2.5 : 6) * u; c.moveTo(fx0 - 3 * u, y); c.lineTo(fx0 - 3 * u - l, y); c.moveTo(fx1 + 3 * u, y); c.lineTo(fx1 + 3 * u + l, y); } c.stroke();
    // 大きな同心の弧（計器の文字盤のような飾り）
    for (const sx of [-1, 1]) {
      const ax = sx < 0 ? fx0 * 0.18 : w - (w - fx1) * 0.18, ay = h * 0.72;
      for (let k = 0; k < 4; k++) { c.strokeStyle = `rgba(120,190,255,${0.05 - k * 0.008})`; c.lineWidth = lw * (k === 0 ? 2 : 1); c.beginPath(); c.arc(ax, ay, (60 + k * 34) * u, 0, TAU); c.stroke(); }
      c.strokeStyle = 'rgba(120,190,255,.07)'; c.beginPath(); for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU, r0 = 162 * u, r1 = (k % 3 ? 166 : 172) * u; c.moveTo(ax + Math.cos(a) * r0, ay + Math.sin(a) * r0); c.lineTo(ax + Math.cos(a) * r1, ay + Math.sin(a) * r1); } c.stroke();
    }
    margin.ms = ms;
  }
  // 盤面の外を描き直す（数フレームに 1 回で足りる）。ゆっくり動く線と、盤面の縁の線
  function drawMargin(c, lay, Wp, Hp, S, time) {
    if (!margin) return;
    const fx0 = Math.round(lay.fx * S), fx1 = Math.round((lay.fx + lay.fw) * S), fy0 = Math.round(lay.fy * S), fy1 = Math.round((lay.fy + lay.fh) * S), ms = margin.ms;
    c.imageSmoothingQuality = 'low';
    const part = (x, y, w, h) => { if (w > 0 && h > 0) c.drawImage(margin, x * ms, y * ms, w * ms, h * ms, x, y, w, h); };
    part(0, 0, fx0, Hp); part(fx1, 0, Wp - fx1, Hp); part(fx0, 0, fx1 - fx0, fy0); part(fx0, fy1, fx1 - fx0, Hp - fy1);
    const u = lay.u * S, lw = Math.max(1, Math.round(S));
    for (let k = 0; k < 2; k++) { // ゆっくり動く走査線
      const y = Math.round(mod(time * 0.35 * (k ? -0.6 : 1) + k * Hp * 0.5, Hp));
      c.fillStyle = 'rgba(120,190,255,.07)'; c.fillRect(0, y, fx0 - 4 * u, lw); c.fillRect(fx1 + 4 * u, Hp - y, Wp - fx1, lw);
    }
    for (const sx of [-1, 1]) { // 文字盤の上を回る短い弧
      const ax = sx < 0 ? fx0 * 0.18 : Wp - (Wp - fx1) * 0.18, ay = Hp * 0.72, a = time * 0.004 * sx;
      c.strokeStyle = 'rgba(140,210,255,.12)'; c.lineWidth = lw * 2; c.beginPath(); c.arc(ax, ay, 94 * u, a, a + 0.9); c.stroke();
      c.strokeStyle = 'rgba(140,210,255,.08)'; c.lineWidth = lw; c.beginPath(); c.arc(ax, ay, 128 * u, -a * 0.7 + 2, -a * 0.7 + 3.4); c.stroke();
    }
    c.strokeStyle = 'rgba(70,190,255,.45)'; c.lineWidth = lw; c.strokeRect(fx0 - lw / 2, fy0 - lw / 2, fx1 - fx0 + lw, fy1 - fy0 + lw);
  }
  function reset() { for (const e of cache.values()) freeEntry(e); cache.clear(); cur = null; }
  return { draw, drawUpper, ensure: (a, l) => ensure(a, l, cur), bakeMargin, drawMargin, reset, get palette() { return cur && cur.pal; } };
}
