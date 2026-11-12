// 32 ステップ × 4 ビット（0〜15）の波形表。ナムコ WSG（3 音・波形 PROM 方式）の「形式」に合わせた自作の波形で、
// 原作の PROM の中身は使っていない（数式から作っている）。
export const STEPS = 32;

function make(fn) {
  const raw = [];
  for (let i = 0; i < STEPS; i++) raw.push(fn((i + 0.5) / STEPS));
  const lo = Math.min(...raw), hi = Math.max(...raw);
  return Uint8Array.from(raw, (v) => Math.max(0, Math.min(15, Math.round(((v - lo) / (hi - lo || 1)) * 15))));
}
const S = (x) => Math.sin(2 * Math.PI * x);

// 疑似乱数（再現できるように種を固定）
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rnd = lcg(0x5eed);

export const WAVES = [
  make((x) => (x < 0.5 ? 1 : -1)),                          // 0 矩形 50%（明るい主旋律）
  make((x) => (x < 0.25 ? 1 : -1)),                         // 1 パルス 25%（鼻にかかった高音）
  make((x) => 1 - 2 * x + 0.35 * S(2 * x)),                 // 2 のこぎり寄り（荒い音）
  make((x) => (x < 0.5 ? 4 * x - 1 : 3 - 4 * x)),           // 3 三角（やわらかい副旋律）
  make((x) => S(x) + 0.6 * S(2 * x) + 0.25 * S(4 * x)),     // 4 オルガン（倍音 2・4）
  make((x) => S(x) + 0.55 * S(3 * x)),                      // 5 中空（奇数倍音）
  make((x) => S(x) + 0.35 * S(2 * x) + (x < 0.5 ? 0.3 : -0.3)), // 6 ベース（太い矩形寄り）
  make((x) => S(x)),                                        // 7 正弦（4 ビットに量子化）
  make(() => rnd() * 2 - 1),                                // 8 ノイズ表（周波数を揺らして噪音にする）
];
export const NOISE = 8;
