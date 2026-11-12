// 効果音の設計図（すべて今回の自作）。1 つの効果音は「層」の配列で、層ごとに効果音用の声を 1 つ使う。
// 層: { segs: [区間...], pan: 定位のずれ, at: 開始の遅れ(秒) }
// 区間: { w 波形, f 周波数Hz, f2 終わりの周波数(指数で滑らせる), d 長さ(秒), v 音量0〜15, v2 終わりの音量,
//         vib: [速さHz, 深さ半音], jit: [跳ぶ回数/秒, 幅半音]（周波数をでたらめに跳ばしてノイズ風にする）,
//         trem: [速さHz, 深さ0〜1] }
// meta: prio 優先度（声が足りないとき低いものから止める）, mono 同じ名前は 1 つだけ, gap 連打の最短間隔(秒)
import { NOISE } from './waves.js';

const semis = (f, s) => f * Math.pow(2, s / 12);
const N = NOISE;

export const SFX = {
  'ui-move': () => [{ segs: [{ w: 1, f: 1175, d: 0.022, v: 8 }, { w: 1, f: 1568, d: 0.03, v: 7, v2: 0 }] }],
  'ui-select': () => [{ segs: [{ w: 1, f: 784, d: 0.04, v: 10 }, { w: 1, f: 1175, d: 0.04, v: 10 }, { w: 1, f: 1568, d: 0.09, v: 10, v2: 0 }] }],
  'ui-back': () => [{ segs: [{ w: 0, f: 988, f2: 740, d: 0.07, v: 9, v2: 7 }, { w: 0, f: 494, d: 0.08, v: 7, v2: 0 }] }],
  'ui-pause': () => [{ segs: [{ w: 4, f: 1047, d: 0.07, v: 10, v2: 4 }, { w: 4, f: 1047, d: 0.04, v: 0 },
    { w: 4, f: 784, d: 0.07, v: 10, v2: 4 }, { w: 4, f: 784, d: 0.04, v: 0 }, { w: 4, f: 1047, d: 0.12, v: 9, v2: 0 }] }],
  // 掘る: ごく小さくて短いザッという音（連続して掘っても 0.09 秒に 1 回まで）
  dig: () => [{ segs: [{ w: N, f: 260 + Math.random() * 90, f2: 180, d: 0.045, v: 4, v2: 0, jit: [1800, 7] }] }],
  // ポンプ発射: もりが伸びるシュッ
  'pump-shot': () => [{ segs: [{ w: 0, f: 420, f2: 1650, d: 0.11, v: 10, v2: 7 }, { w: 0, f: 1650, f2: 1500, d: 0.03, v: 6, v2: 0 }] }],
  'pump-hit': () => [
    { segs: [{ w: 0, f: 1900, f2: 950, d: 0.05, v: 11, v2: 6 }, { w: 3, f: 950, d: 0.04, v: 6, v2: 0 }] },
    { at: 0.01, segs: [{ w: N, f: 900, d: 0.04, v: 7, v2: 0, jit: [2500, 6] }] }],
  'pump-miss': () => [{ segs: [{ w: 2, f: 1400, f2: 340, d: 0.15, v: 8, v2: 3 }, { w: 2, f: 330, d: 0.03, v: 3, v2: 0 }] }],
  // ポンプの空気: ゴムのような「プシュッ」。段階ごとに 4 半音ずつ上がる
  'pump-air': (o) => {
    const st = Math.max(1, Math.min(5, o.stage | 0 || 1)), f = semis(170, (st - 1) * 4);
    return [
      { segs: [{ w: 3, f, f2: f * 1.6, d: 0.13, v: 12, v2: 9, vib: [26, 0.6] }, { w: 3, f: f * 1.6, f2: f * 1.45, d: 0.05, v: 8, v2: 0 }] },
      { pan: 0.1, segs: [{ w: N, f: 1500 + st * 200, d: 0.1, v: 4, v2: 0, jit: [3000, 8] }] }];
  },
  detach: () => [{ segs: [{ w: 0, f: 620, f2: 1250, d: 0.05, v: 9, v2: 6 }, { w: 0, f: 1250, d: 0.025, v: 5, v2: 0 }] }],
  deflate: () => [{ segs: [{ w: 3, f: 520, f2: 300, d: 0.13, v: 8, v2: 0, vib: [18, 0.8] }] }],
  'recover-warn': () => [{ segs: [{ w: 4, f: 300, f2: 340, d: 0.42, v: 7, v2: 4, vib: [9, 1.6], trem: [9, 0.4] }] }],
  // 破裂: かわいく「ポンッ」。上がる短いはじけ + ノイズの粒 + 小さな鈴
  pop: () => [
    { segs: [{ w: 0, f: 700, f2: 2100, d: 0.035, v: 13, v2: 12 }, { w: 0, f: 2100, f2: 900, d: 0.05, v: 10, v2: 0 }] },
    { segs: [{ w: N, f: 1300, f2: 600, d: 0.09, v: 11, v2: 0, jit: [3500, 9] }] },
    { at: 0.05, pan: 0.15, segs: [{ w: 7, f: 1568, d: 0.03, v: 8 }, { w: 7, f: 2093, d: 0.16, v: 8, v2: 0 }] }],
  'ghost-warn': () => [{ segs: [{ w: 7, f: 700, f2: 880, d: 0.38, v: 5, v2: 4, vib: [12, 1.2], trem: [12, 0.6] }] }],
  'ghost-on': () => [{ segs: [{ w: 5, f: 1200, f2: 300, d: 0.3, v: 7, v2: 2, vib: [7, 0.8] }] }],
  'ghost-off': () => [{ segs: [{ w: 5, f: 300, f2: 1100, d: 0.25, v: 3, v2: 7, vib: [7, 0.8] }, { w: 5, f: 1100, d: 0.04, v: 6, v2: 0 }] }],
  // 火を吐く前のため: 約 0.8 秒、脈打ちながら上がる。予告としてはっきり聞こえるように
  'fire-charge': () => [
    { segs: [{ w: 6, f: 110, f2: 330, d: 0.8, v: 9, v2: 13, trem: [13, 0.55] }, { w: 6, f: 330, d: 0.04, v: 10, v2: 0 }] },
    { segs: [{ w: N, f: 180, f2: 700, d: 0.8, v: 3, v2: 9, jit: [2200, 6] }, { w: N, f: 700, d: 0.04, v: 7, v2: 0 }] }],
  // 火の息: 低いうなりと高いざわめきを重ねる（約 0.8 秒）
  'fire-breath': () => [
    { segs: [{ w: N, f: 70, f2: 55, d: 0.8, v: 13, v2: 0, jit: [900, 5] }] },
    { segs: [{ w: N, f: 2300, f2: 1600, d: 0.75, v: 7, v2: 0, jit: [4000, 7] }] }],
  'rock-shake': () => [{ segs: [{ w: 2, f: 170, d: 0.36, v: 7, v2: 5, jit: [40, 2], trem: [22, 0.7] }, { w: 2, f: 170, d: 0.03, v: 5, v2: 0 }] }],
  'rock-fall': () => [{ segs: [{ w: 0, f: 1400, f2: 260, d: 0.6, v: 8, v2: 6 }, { w: 0, f: 260, d: 0.04, v: 6, v2: 0 }] }],
  'rock-land': () => [
    { segs: [{ w: 6, f: 125, f2: 42, d: 0.2, v: 15, v2: 0 }] },
    { segs: [{ w: N, f: 90, d: 0.1, v: 9, v2: 0, jit: [700, 6] }] }],
  // 岩でつぶす: 数（opts.stage）が多いほど回数が増え、音も高くなる
  'rock-crush': (o) => {
    const n = Math.max(1, Math.min(8, o.stage | 0 || 1)), segs = [];
    for (let k = 0; k < Math.min(n, 4); k++) {
      const f = semis(640, k * 3 + (n - 1) * 2);
      segs.push({ w: 2, f, f2: f * 0.3, d: 0.08, v: 12, v2: 2 }, { w: 2, f: f * 0.3, d: 0.02, v: 0 });
    }
    return [{ segs }, { segs: [{ w: N, f: 400, d: 0.12, v: 8, v2: 0, jit: [1500, 6] }] }];
  },
  'score-pop': () => [{ segs: [{ w: 7, f: 2093, d: 0.035, v: 7 }, { w: 7, f: 2637, d: 0.09, v: 7, v2: 0 }] }],
  extra: () => [{ segs: [[1047, 1319, 1568, 2093], [1175, 1480, 1760, 2349]].flat()
    .map((f, k) => ({ w: 1, f, d: 0.055, v: k === 7 ? 11 : 10, v2: k === 7 ? 0 : 8 })).concat([{ w: 1, f: 2349, d: 0.14, v: 9, v2: 0 }]) }],
  // VR の移動補助: ごく控えめなスッという風
  step: () => [{ segs: [{ w: N, f: 900, f2: 500, d: 0.12, v: 3, v2: 0, jit: [2800, 8] }] }],
  'tutorial-ok': () => [{ segs: [{ w: 7, f: 1319, d: 0.08, v: 9, v2: 6 }, { w: 7, f: 1760, d: 0.2, v: 9, v2: 0 }] }],
};

export const SFX_META = {
  dig: { gap: 0.09, prio: 0, mono: true },
  step: { gap: 0.12, prio: 0, mono: true },
  'score-pop': { gap: 0.05, prio: 0 },
  'ui-move': { gap: 0.03, prio: 1, mono: true },
  'pump-air': { prio: 2, mono: true },
  'fire-charge': { prio: 3, mono: true },
  'fire-breath': { prio: 3, mono: true },
  'rock-fall': { prio: 2, mono: true },
  'rock-shake': { prio: 1, mono: true },
  pop: { prio: 3 }, 'rock-crush': { prio: 3 }, extra: { prio: 4, mono: true },
  'recover-warn': { prio: 2, mono: true }, 'ghost-warn': { prio: 2 },
};

// 効果音の長さ（秒）。テストと音確認ページで使う
export function sfxLength(name, opts = {}) {
  return Math.max(...SFX[name](opts).map((l) => (l.at || 0) + l.segs.reduce((s, g) => s + g.d, 0)));
}
