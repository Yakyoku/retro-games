// 地形: 床と天井の高さ（x の関数を 0.5u ごとに標本化）＋ 壊れない箱（blocks）＋ 脈動（細胞空間）
export const NONE_FLOOR = -4, NONE_CEIL = 22;
const STEP = 0.5, X0 = -40;

export function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
export function ramp(x, x0, x1, a, b) { return a + (b - a) * smooth((x - x0) / (x1 - x0)); }
export function bump(x, xc, w, h) { const d = Math.abs(x - xc) / (w / 2); return d >= 1 ? 0 : h * (1 - d * d) * (1 - d * 0.35); }
export function cone(x, xc, w, h, crater = 0) {
  const d = Math.abs(x - xc) / (w / 2);
  if (d >= 1) return 0;
  let y = h * Math.pow(1 - d, 1.15);
  if (crater && d < crater) y -= (crater - d) / crater * h * 0.12;   // 火口のくぼみ
  return y;
}

export function buildTerrain({ length, fn, blocks = [], pulse = null }) {
  const n = Math.ceil((length + 120 - X0) / STEP);
  const floor = new Float32Array(n), ceil = new Float32Array(n);
  for (let i = 0; i < n; i++) { const [f, c] = fn(X0 + i * STEP); floor[i] = f; ceil[i] = c; }
  // 箱を 8u ごとの棚に振り分ける
  const buckets = new Map();
  for (const b of blocks) for (let k = Math.floor(b.x0 / 8); k <= Math.floor(b.x1 / 8); k++) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(b); }
  const sample = (arr, x) => {
    let fi = (x - X0) / STEP; if (fi < 0) fi = 0; if (fi > n - 2) fi = n - 2;
    const i = fi | 0, f = fi - i; return arr[i] * (1 - f) + arr[i + 1] * f;
  };
  const pulseAt = (x, t) => {
    if (!pulse) return 0;
    let a = 0;
    for (const p of pulse) if (x > p.x0 && x < p.x1) {
      const edge = Math.min(1, (x - p.x0) / 6, (p.x1 - x) / 6);
      a += Math.sin(t * p.speed + x * p.freq) * p.amp * edge;
    }
    return a;
  };
  const EMPTY = [];
  return {
    length, floor, ceil, step: STEP, x0: X0, n, blocks, pulse,
    floorBase: (x) => sample(floor, x), ceilBase: (x) => sample(ceil, x),
    floorAt(x, t = 0) { const f = sample(floor, x); return f <= NONE_FLOOR + 0.01 ? f : f + pulseAt(x, t); },
    ceilAt(x, t = 0) { const c = sample(ceil, x); return c >= NONE_CEIL - 0.01 ? c : c - pulseAt(x + 3.1, t); },
    pulseAt,
    blocksNear(x) { return buckets.get(Math.floor(x / 8)) || EMPTY; },
  };
}
