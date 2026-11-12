// ORBITAL WINGS — 効果音（PSG-B 専用。曲の音は奪わない）
//
// 1 つの効果音 = フレーム（1/60 秒）ごとのレジスタの書き込み手順。
//   { p: トーン周期（0 = トーンを使わない）, n: ノイズ周期 1〜31（0 = 使わない）, v: 音量 0〜15（16 = ハードウェアエンベロープ）,
//     e: [形, 周期]（このフレームでエンベロープを書き直す。形 0 = ＼＿、8 = のこぎり繰り返し、10 = 三角、14 = ／＼） }
// pri: 優先度。PSG-B の 3 チャンネルが埋まっていたら、自分以下の優先度の音（同じなら一番古い音）を止めて鳴らす。
//      自分より高い音しか鳴っていなければ鳴らさない。同じ効果音を重ねて呼ぶと、重ねずに同じチャンネルで頭から鳴らし直す。
// ノイズ周期とエンベロープは 3 チャンネルで 1 つを共有する（実機と同じ。後から書いた方が勝つ）。
//
// ■ オプションの弾の決まり
//   'option_shot' という音は無い。オプション（0〜4 個）が一緒に撃っても、ゲームは 1 回の斉射につき
//   sfx('shot')（ダブルなら 'double'、レーザーなら 'laser'）を 1 回だけ呼ぶ。
//   念のため音源側でも、同じフレーム内に同じ効果音を何回呼んでも 1 回分しか鳴らない（tests で確認）。
// 'gauge' は 'capsule' と同じ音（同じ定義なので、続けて取ると同じチャンネルで鳴らし直す）。

const CLOCK = 1789772;
const P = (hz) => Math.max(1, Math.min(4095, Math.round(CLOCK / (16 * hz))));
const lerp = (a, b, t) => a + (b - a) * t;
const expo = (a, b, t) => a * Math.pow(b / a, t);
// n フレーム、fn(i, t) が 1 フレーム分を返す（t = 0〜1）
const make = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, n > 1 ? i / (n - 1) : 0));
const vdec = (v0, t, pow = 1) => Math.max(0, Math.round(v0 * Math.pow(1 - t, pow)));
// 音を順に（[周波数, フレーム数, 音量]...）
const notes = (list, decay = 0) => list.flatMap(([hz, n, v]) => make(n, (i) => ({ p: hz ? P(hz) : 0, n: 0, v: hz ? Math.max(0, v - i * decay) : 0 })));

function def(pri, frames) { return { pri, frames }; }

const capsule = def(5, notes([[1318, 3, 13], [1568, 3, 13], [1976, 3, 12], [2637, 6, 12]], 1));

export const SFX = {
  // ---- 自機の攻撃
  shot: def(2, make(6, (i, t) => ({ p: P(expo(1900, 850, t)), n: 0, v: [13, 12, 11, 9, 6, 3][i] }))),
  double: def(2, make(7, (i, t) => ({ p: P(expo(1500, 600, t)), n: i < 2 ? 2 : 0, v: [13, 13, 11, 10, 8, 5, 2][i] }))),
  laser: def(3, make(22, (i, t) => ({ p: P(expo(2800, 1400, (i % 6) / 5) * (1 - 0.15 * t)), n: 0, v: i < 14 ? 12 : vdec(12, (i - 14) / 8) }))),
  missile: def(2, make(12, (i, t) => ({ p: P(expo(300, 120, t)), n: Math.round(lerp(6, 14, t)), v: vdec(12, t, 0.8) }))),
  // ---- 取得・装備
  capsule,
  gauge: capsule,
  powerup: def(6, [...notes([[784, 3, 13], [988, 3, 13], [1175, 3, 13], [1568, 3, 13], [1175, 3, 12], [1568, 3, 12], [1976, 3, 12]]),
    ...make(14, (i, t) => ({ p: P(2349 * (1 + 0.01 * Math.sin(i * 1.7))), n: 0, v: vdec(13, t) }))]),
  deny: def(5, notes([[233, 7, 12], [0, 2, 0], [175, 10, 12]], 0.5)),
  shield_on: def(6, make(40, (i, t) => ({ p: P(expo(300, 1800, t) * (1 + 0.04 * Math.sin(i * 1.3))), n: 0, v: i < 30 ? 12 : vdec(12, (i - 30) / 10) }))),
  shield_hit: def(4, make(7, (i, t) => ({ p: P(expo(3200, 2200, t)), n: i < 3 ? 2 : 0, v: [13, 12, 10, 8, 6, 3, 1][i] }))),
  // ---- 敵
  enemy_hit: def(1, [{ p: P(2600), n: 0, v: 9 }, { p: P(2300), n: 0, v: 7 }, { p: P(2100), n: 0, v: 4 }]),
  explode_s: def(3, make(16, (i, t) => ({ p: 0, n: Math.round(lerp(8, 20, t)), v: vdec(14, t, 1.2) }))),
  explode_m: def(4, make(26, (i, t) => ({ p: i < 4 ? P(expo(180, 70, i / 3)) : 0, n: Math.round(lerp(12, 28, t)), v: vdec(15, t, 1.1) }))),
  explode_l: def(5, make(56, (i, t) => ({ p: 0, n: Math.round(lerp(14, 31, t)), v: 16, e: i === 0 ? [0, 6200] : null }))),
  boss_explode: def(8, make(180, (i, t) => {
    const k = i % 22; // 22 フレームごとに爆発を打ち直し、だんだん低く長く
    return { p: 0, n: Math.round(lerp(10, 31, Math.min(1, k / 18 + t * 0.4))), v: 16, e: k === 0 ? [0, Math.round(lerp(2400, 9000, t))] : null };
  })),
  player_die: def(9, make(76, (i, t) => ({ p: P(expo(900, 60, Math.min(1, t * 1.4))), n: Math.round(lerp(6, 31, t)), v: i < 50 ? 15 - Math.floor(i / 10) : vdec(10, (i - 50) / 26) }))),
  ring: def(3, make(20, (i, t) => ({ p: P(1250 * (1 + 0.03 * Math.sin(i * 2.4))), n: 0, v: vdec(13, t, 1.3) }))),
  warning: def(7, make(96, (i) => { const k = i % 24; return { p: P(k < 12 ? 880 : 660), n: 0, v: (k % 12) < 9 ? 12 : 0 }; })),
  checkpoint: def(4, notes([[1047, 5, 12], [1568, 12, 12]], 0.7)),
  extend: def(7, notes([[1047, 4, 13], [1319, 4, 13], [1568, 4, 13], [2093, 4, 13], [0, 2, 0], [1568, 4, 12], [2093, 14, 12]], 0.4)),
  // ---- 画面操作
  cursor: def(2, notes([[1600, 3, 11]], 3)),
  select: def(3, notes([[1047, 3, 12], [2093, 6, 12]], 1.5)),
  cancel: def(3, notes([[1047, 3, 12], [523, 6, 12]], 1.5)),
  pause: def(6, notes([[1568, 4, 12], [0, 2, 0], [1175, 4, 12], [0, 2, 0], [1568, 4, 12], [0, 2, 0], [2093, 8, 12]], 1)),
};

export const SFX_NAMES = Object.keys(SFX);
export const OPTION_SHOT_RULE = 'オプションの弾は音を足さない: 1 回の斉射につき shot / double / laser を 1 回だけ鳴らす';
