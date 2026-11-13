// AEGIS RELAY 2D — 共通の小道具（乱数・色・ノイズ・時間分割の仕事・キャンバス）
// ・ノイズは 512×512 の「つながるフラクタルノイズ」を起動時に 1 回だけ作り、以後は表引き（高速）
// ・重い焼き込みは jobs に積み、1 フレームあたり数ミリ秒ずつ進める（引っかかりを出さない）
export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeBack = (t) => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ── 色 ──
export function hexRgb(h) { const n = parseInt(h.slice(1), 16); return h.length === 4 ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const css = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${a})`;
// 色相を回す（周回ごとの空の色がえ）。YIQ の回転で近似
export function hueShift(c, deg) {
  if (!deg) return c;
  const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const [r, g, b] = c;
  const y = 0.299 * r + 0.587 * g + 0.114 * b, i = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b;
  const i2 = i * cs - q * sn, q2 = i * sn + q * cs;
  return [clamp(y + 0.956 * i2 + 0.621 * q2, 0, 255), clamp(y - 0.272 * i2 - 0.647 * q2, 0, 255), clamp(y - 1.106 * i2 + 1.703 * q2, 0, 255)];
}

// ── つながるフラクタルノイズ（表）──
export const NT = 512;
const NM = NT - 1;
export const FBM = new Float32Array(NT * NT);
(function buildFbm() {
  const r = rng(90210);
  let amp = 1, tot = 0;
  for (let o = 0; o < 6; o++) {
    const P = 8 << o, cell = NT / P, lat = new Float32Array(P * P);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < NT; y++) {
      const gy = y / cell, y0 = Math.floor(gy), fy0 = gy - y0, fy = fy0 * fy0 * (3 - 2 * fy0), ya = (y0 % P) * P, yb = ((y0 + 1) % P) * P;
      for (let x = 0; x < NT; x++) {
        const gx = x / cell, x0 = Math.floor(gx), fx0 = gx - x0, fx = fx0 * fx0 * (3 - 2 * fx0), xa = x0 % P, xb = (x0 + 1) % P;
        const a = lat[ya + xa], b = lat[ya + xb], c = lat[yb + xa], d = lat[yb + xb];
        FBM[y * NT + x] += amp * (a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  let mn = 1e9, mxv = -1e9;
  for (let i = 0; i < FBM.length; i++) { const v = FBM[i] / tot; FBM[i] = v; if (v < mn) mn = v; if (v > mxv) mxv = v; }
  const k = 1 / (mxv - mn);
  for (let i = 0; i < FBM.length; i++) FBM[i] = (FBM[i] - mn) * k;
})();
// 0..1 のフラクタルノイズ（座標は表の画素単位。512 で一周）
export function fbm(u, v) {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const xi = x0 & NM, yi = (y0 & NM) * NT, xj = (xi + 1) & NM, yj = (((y0 & NM) + 1) & NM) * NT;
  const a = FBM[yi + xi], b = FBM[yi + xj], c = FBM[yj + xi], d = FBM[yj + xj];
  return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
}

// ── キャンバス ──
export const mem = { px: 0 }; // 焼いたキャンバスの総画素数（目安）
export function makeCanvas(w, h) {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  mem.px += cv.width * cv.height; return cv;
}
export function freeCanvas(cv) { if (!cv) return; mem.px -= cv.width * cv.height; cv.width = cv.height = 0; }

// ── 時間分割の仕事 ──
// add(key, generator) で積み、run(ms) で予算ぶんだけ進める。finish(key) はその場で最後までやる
export function createJobs() {
  const q = [], stats = {}; // stats: 仕事の種類ごとの回数・合計時間・1 回ぶん（1 区切り）の最長時間（計測用）
  function* timed(key, gen) {
    const kind = String(key).split(':')[0], st = stats[kind] || (stats[kind] = { n: 0, ms: 0, maxStep: 0 }); let r;
    do { const t0 = performance.now(); r = gen.next(); const d = performance.now() - t0; st.ms += d; if (d > st.maxStep) st.maxStep = d; if (!r.done) yield; } while (!r.done);
    st.n++;
  }
  return {
    stats,
    add(key, gen, front = false) { const j = { key, gen: timed(key, gen), done: false }; if (front) q.unshift(j); else q.push(j); return j; },
    has(key) { return q.some((j) => j.key === key); },
    cancel(pred) { for (let i = q.length - 1; i >= 0; i--) if (pred(q[i].key)) q.splice(i, 1); },
    finish(key) { const i = q.findIndex((j) => j.key === key); if (i < 0) return; const j = q[i]; q.splice(i, 1); while (!j.gen.next().done); },
    run(ms) {
      const t0 = performance.now(); let n = 0;
      while (q.length && performance.now() - t0 < ms) { const j = q[0]; if (j.gen.next().done) { q.shift(); n++; } }
      return n;
    },
    get pending() { return q.length; },
  };
}
