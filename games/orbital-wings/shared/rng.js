// 決定的な乱数（状態を持つ。リプレイ・テストで同じ結果になる）
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.state = () => s;
  next.set = (v) => { s = v >>> 0; };
  return next;
}

// 値ノイズ（地形の細部用。座標から決まる＝どこから再開しても同じ形）
export function hash1(i, seed = 0) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u;
}
export function fbm(x, seed = 0, oct = 3) {
  let a = 0, amp = 0.5, fr = 1;
  for (let o = 0; o < oct; o++) { a += amp * vnoise(x * fr, seed + o * 17); fr *= 2.03; amp *= 0.5; }
  return a;
}
