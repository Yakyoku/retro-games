// シード付き乱数（mulberry32）。状態は数値 1 つなので、ゲーム状態に含めて再現できる。
export function makeRng(seed) {
  const r = { s: seed >>> 0 };
  r.next = () => {
    let t = (r.s = (r.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r.next();
  return r;
}

/** 文字列・数値の FNV-1a ハッシュ（再現試験の比較用） */
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
