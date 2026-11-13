// AEGIS RELAY — 効果音（モダン音源。すべてこの作品のために新しく設計し、計算で波形を作る。録音・既存作品の音は使わない）
// make(variant): 波形（モノラル Float32Array, 48kHz）を返す。起動時に 1 回だけ計算して AudioBuffer にする。
// 再生時は「音源 → 音量 → 左右の定位」のノード 3 個だけ（S28）。
//   pri: 優先度（発音数の上限に達したとき、低い音から止める）  gap: 同じ音の最短間隔(ms)  gain: 音量
//   voices: この音の同時発音数の上限  rnd: 高さのゆらぎ（半音）  vary: 波形の種類数（毎回ちがうものを選ぶ）
//   duck: [下げ幅(0〜1), 秒] 大きな音の間だけ曲を少し下げる（S29）  wet: 残響を多めに  ui: メニューの音（定位しない）
import { alloc, osc, bell, noise, filter, shape, mix, drive, finish, perc, mkRng, hz } from './dsp.js';

// 破片のぱらぱらという音: 短いノイズの粒を不規則に並べる
function debris(sec, seed, from, to, n, fc = 5000) {
  const x = alloc(sec), r = mkRng(seed);
  for (let i = 0; i < n; i++) {
    const t0 = from + (to - from) * (0.5 + 0.5 * r()) ** 1.5, g = filter(noise(0.012, seed * 7 + i), 'bp', fc * (0.6 + 0.4 * (r() + 1)), 2);
    shape(g, perc(0.003, 0.0003)); mix(x, g, 0.25 + 0.25 * (r() + 1) * (1 - (t0 - from) / (to - from + 1e-6)), Math.min(t0, sec - 0.02));
  }
  return x;
}
// 爆発（S25）: 低い衝撃 ＋ ノイズ ＋ 破片。size 0=小 1=中 2=大
function boom(size, v) {
  const sec = [0.42, 0.7, 1.3][size], x = alloc(sec), seed = 100 + size * 10 + v;
  const f0 = [150, 115, 85][size], f1 = [52, 42, 30][size], tp = [0.05, 0.07, 0.1][size], ta = [0.09, 0.15, 0.33][size];
  osc(x, { dur: sec, f: (t) => f1 + (f0 - f1) * Math.exp(-t / tp), amp: (t) => Math.exp(-t / ta) * (t < 0.002 ? t / 0.002 : 1) });
  const n = noise(sec, seed); const c0 = [3200, 4200, 5200][size], c1 = [500, 300, 160][size], tn = [0.1, 0.19, 0.38][size];
  filter(n, 'lp', (t) => c1 + (c0 - c1) * Math.exp(-t / (tn * 0.7)), 0.9); filter(n, 'hp', 90);
  shape(n, (t) => Math.exp(-t / tn) * (t < 0.001 ? t / 0.001 : 1)); mix(x, n, [0.9, 1.0, 1.1][size]);
  if (size === 2) { const n2 = filter(noise(0.6, seed + 5), 'lp', (t) => 200 + 2500 * Math.exp(-t / 0.15)); shape(n2, perc(0.2, 0.004)); mix(x, n2, 0.7, 0.13 + 0.03 * v); }
  mix(x, debris(sec, seed + 9, 0.04, sec * 0.75, [5, 10, 18][size], [5200, 4500, 3800][size]), [0.35, 0.4, 0.45][size]);
  return finish(drive(x, [1.6, 2.0, 2.6][size]), 0.92, 0.03);
}
// ベルで音を順に鳴らす（アルペジオ）＋ 高いきらめき（S26）
function chime(notes, step, hold, { sparkle = 0, seed = 5, ratio = 3.5, idx = 1.8, tail = 0.5, saw = 0 } = {}) {
  const sec = step * notes.length + hold + tail, x = alloc(sec), r = mkRng(seed);
  notes.forEach((m, i) => {
    const last = i === notes.length - 1, d = last ? hold + tail : step * 2.5 + 0.1;
    bell(x, { t0: i * step, dur: Math.min(d, sec - i * step), f: hz(m), amp: 0.5, ratio, idx, tau: last ? 0.3 + hold * 0.5 : 0.14 });
    if (saw) { const s = alloc(d); osc(s, { dur: d, wave: 'saw', f: hz(m), amp: perc(last ? 0.25 : 0.07, 0.003) }); filter(s, 'lp', (t) => 900 + 5000 * Math.exp(-t / 0.08)); mix(x, s, saw, i * step); }
  });
  for (let i = 0; i < sparkle; i++) { // きらめき: 高い短いベルを不規則に
    const t0 = step * notes.length * 0.5 + (0.5 + 0.5 * r()) * (sec - step * notes.length * 0.5 - 0.15), m = notes[(i * 3) % notes.length] + 24 + (i % 2 ? 7 : 0);
    bell(x, { t0, dur: 0.12, f: hz(Math.min(m, 108)), amp: 0.13, ratio: 2, idx: 0.8, tau: 0.04 });
  }
  return x;
}

export const SFX = {
  // ── 射撃（S24）: アタック（クリック）＋ 胴（下がる矩形波）＋ 尾（やわらかい正弦）──
  shot: { pri: 1, gap: 50, gain: 0.42, voices: 3, rnd: 0.7, vary: 2, make(v) {
    const x = alloc(0.17);
    const c = filter(noise(0.02, 3 + v), 'hp', 5000); shape(c, perc(0.0025, 0.0003)); mix(x, c, 0.3);
    const b = alloc(0.12); osc(b, { dur: 0.12, wave: 'square', duty: 0.3, f: (t) => 560 + (1900 + v * 160) * Math.exp(-t / 0.03), amp: perc(0.03, 0.001) }); filter(b, 'lp', 5200); mix(x, b, 0.55);
    osc(x, { dur: 0.17, f: (t) => 260 + 700 * Math.exp(-t / 0.07), amp: (t) => 0.4 * Math.exp(-t / 0.05) * Math.min(1, t / 0.002) });
    return finish(x, 0.85);
  } },
  shotDocked: { pri: 1, gap: 50, gain: 0.46, voices: 3, rnd: 0.6, vary: 2, make(v) {
    const x = alloc(0.22);
    const c = filter(noise(0.02, 13 + v), 'hp', 4000); shape(c, perc(0.003, 0.0003)); mix(x, c, 0.3);
    const b = alloc(0.16); for (const d of [1, 1.013, 0.5]) osc(b, { dur: 0.16, wave: 'saw', f: (t) => (400 + (1500 + v * 120) * Math.exp(-t / 0.038)) * d, amp: perc(0.042, 0.001) });
    filter(b, 'lp', (t) => 1500 + 5000 * Math.exp(-t / 0.05)); mix(x, b, 0.33);
    osc(x, { dur: 0.2, f: (t) => 88 + 90 * Math.exp(-t / 0.03), amp: (t) => 0.55 * Math.exp(-t / 0.05) * Math.min(1, t / 0.002) });
    return finish(drive(x, 1.3), 0.88);
  } },
  eshot: { pri: 0, gap: 130, gain: 0.3, voices: 2, rnd: 1, make() {
    const x = alloc(0.13); osc(x, { dur: 0.13, wave: 'tri', f: (t) => 380 + 420 * (t / 0.13), amp: perc(0.04, 0.004) });
    const n = filter(noise(0.13, 17), 'bp', 1500, 2); shape(n, perc(0.03, 0.003)); mix(x, n, 0.3);
    return finish(x, 0.8);
  } },
  // ── 命中・撃破 ──
  hit: { pri: 2, gap: 40, gain: 0.45, voices: 2, rnd: 1.5, make() {
    const x = alloc(0.1); osc(x, { dur: 0.1, f: 1870, amp: perc(0.018) }); osc(x, { dur: 0.1, f: 2930, amp: (t) => 0.6 * Math.exp(-t / 0.012) });
    const n = filter(noise(0.05, 23), 'bp', 3600, 1.5); shape(n, perc(0.008, 0.0003)); mix(x, n, 0.8);
    return finish(x, 0.85);
  } },
  kill:     { pri: 3, gap: 55, gain: 0.5, voices: 3, rnd: 1.5, vary: 3, make: (v) => boom(0, v) },
  killMid:  { pri: 4, gap: 70, gain: 0.58, voices: 2, rnd: 1.2, vary: 3, make: (v) => boom(1, v) },
  killBig:  { pri: 6, gap: 110, gain: 0.72, voices: 2, rnd: 1, vary: 2, duck: [0.3, 0.45], make: (v) => boom(2, v) },
  // エリアコアの破壊: 連鎖する爆発 ＋ 長い地鳴り ＋ 上がっていくきらめき
  killCore: { pri: 10, gap: 1500, gain: 0.85, voices: 1, duck: [0.55, 1.8], wet: true, make() {
    const x = alloc(2.8);
    [0, 0.22, 0.5, 0.85].forEach((t0, i) => mix(x, boom(2, i % 2), 1 - i * 0.15, t0));
    const r = filter(noise(2.6, 301), 'lp', (t) => 120 + 500 * Math.exp(-t / 0.8)); shape(r, (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.9)); mix(x, r, 1.6);
    [76, 80, 83, 88, 92].forEach((m, i) => bell(x, { t0: 0.9 + i * 0.09, dur: 1.2, f: hz(m), amp: 0.14, tau: 0.5, idx: 1.2 }));
    return finish(drive(x, 1.8), 0.92, 0.06);
  } },
  die: { pri: 10, gap: 600, gain: 0.8, voices: 1, duck: [0.6, 1.2], wet: true, make() {
    const x = alloc(1.7);
    mix(x, boom(2, 1), 0.9);
    const s = alloc(1.1); for (const d of [1, 1.02]) osc(s, { dur: 1.1, wave: 'saw', f: (t) => (60 + 900 * Math.exp(-t / 0.3)) * d * (1 + 0.04 * Math.sin(t * 60)), amp: (t) => Math.exp(-t / 0.35) });
    filter(s, 'lp', (t) => 400 + 4000 * Math.exp(-t / 0.3), 2); mix(x, s, 0.45);
    mix(x, debris(1.7, 77, 0.2, 1.4, 22, 3500), 0.5);
    return finish(drive(x, 2), 0.92, 0.05);
  } },
  // ── 自機・支援機 ──
  respawn: { pri: 7, gap: 300, gain: 0.5, voices: 1, wet: true, make() {
    const x = chime([72, 76, 79, 84], 0.075, 0.12, { sparkle: 4, seed: 9, saw: 0.12, tail: 0.3 });
    const n = filter(noise(0.4, 81), 'bp', (t) => 500 + 5000 * (t / 0.4), 1.5); shape(n, (t) => (t / 0.4) ** 2 * Math.min(1, (0.4 - t) / 0.03)); mix(x, n, 0.25);
    return finish(x, 0.85);
  } },
  partnerFree: { pri: 7, gap: 300, gain: 0.5, voices: 1, wet: true, make() {
    const x = alloc(0.8);
    [[88, 0], [93, 0.11], [88, 0.22], [93, 0.33]].forEach(([m, t0], i) => bell(x, { t0, dur: 0.4, f: hz(m), amp: 0.5 - i * 0.06, ratio: 2, idx: 1.5, tau: 0.12 }));
    return finish(x, 0.85);
  } },
  partnerLost: { pri: 4, gap: 300, gain: 0.42, voices: 1, make() {
    const x = alloc(0.5); bell(x, { dur: 0.3, f: hz(77), amp: 0.5, ratio: 2, idx: 1.2, tau: 0.1 }); bell(x, { t0: 0.14, dur: 0.36, f: hz(72), amp: 0.5, ratio: 2, idx: 1.2, tau: 0.13 });
    return finish(x, 0.8);
  } },
  // 合体（S26）: 低い衝撃 → 和音を駆け上がる → 伸ばす和音＋きらめき
  dock: { pri: 9, gap: 400, gain: 0.62, voices: 1, duck: [0.35, 0.7], wet: true, make() {
    const x = chime([55, 60, 64, 67, 72, 76, 79], 0.055, 0.35, { sparkle: 10, seed: 21, saw: 0.16, tail: 0.5 });
    osc(x, { dur: 0.3, f: (t) => 60 + 120 * Math.exp(-t / 0.03), amp: (t) => 0.7 * Math.exp(-t / 0.08) });
    for (const m of [72, 76, 79, 84]) bell(x, { t0: 0.39, dur: 0.75, f: hz(m), amp: 0.2, tau: 0.3, idx: 1.4 });
    return finish(x, 0.9);
  } },
  // ── ジェミニ ──
  twinAppear: { pri: 8, gap: 600, gain: 0.55, voices: 1, make() {
    const x = alloc(0.95);
    for (let i = 0; i < 3; i++) { const s = alloc(0.26); osc(s, { dur: 0.26, wave: 'saw', f: (t) => 392 * (1 + t / 0.26 * 0.5) * (1 + i * 0.12), amp: (t) => Math.min(1, t / 0.01) * Math.min(1, (0.26 - t) / 0.03) }); filter(s, 'lp', 2600, 2); mix(x, s, 0.5, i * 0.3); }
    return finish(x, 0.8);
  } },
  twinBreak: { pri: 9, gap: 400, gain: 0.58, voices: 1, duck: [0.3, 0.6], wet: true, make: () => finish(chime([64, 68, 71, 76, 80, 83, 88], 0.06, 0.3, { sparkle: 9, seed: 31, saw: 0.12 }), 0.9) },
  twinLocked: { pri: 8, gap: 400, gain: 0.55, voices: 1, make() {
    const x = alloc(0.85);
    const s = alloc(0.8); for (const f of [110, 116.5, 55]) osc(s, { dur: 0.8, wave: 'saw', f, amp: (t) => Math.min(1, t / 0.005) * Math.exp(-t / 0.3) });
    filter(s, 'lp', (t) => 300 + 3000 * Math.exp(-t / 0.15), 3); mix(x, s, 0.5);
    bell(x, { dur: 0.3, f: 311, amp: 0.5, ratio: 1.41, idx: 4, tau: 0.08 });
    return finish(drive(x, 1.5), 0.88);
  } },
  // ── ラティス（鎖）: 1 枚ごとに再生の高さを上げる（engine が n から決める）──
  chainStep: { pri: 5, gap: 25, gain: 0.45, voices: 3, make() {
    const x = alloc(0.22); bell(x, { dur: 0.22, f: hz(69), amp: 0.6, ratio: 2, idx: 1.6, tau: 0.07 }); bell(x, { dur: 0.1, f: hz(81), amp: 0.2, ratio: 3, idx: 1, tau: 0.03 });
    return finish(x, 0.85);
  } },
  chainBonus: { pri: 9, gap: 400, gain: 0.6, voices: 1, duck: [0.35, 0.8], wet: true, make: () => finish(chime([72, 74, 76, 79, 81, 84, 86, 88, 91], 0.055, 0.35, { sparkle: 12, seed: 41, saw: 0.14 }), 0.9) },
  chainFail: { pri: 5, gap: 300, gain: 0.42, voices: 1, make() {
    const x = alloc(0.4);
    [[64, 0, 0.13], [59, 0.15, 0.22]].forEach(([m, t0, d]) => { const s = alloc(d); osc(s, { dur: d, wave: 'square', duty: 0.25, f: hz(m), amp: (t) => Math.min(1, t / 0.004) * Math.min(1, (d - t) / 0.03) }); filter(s, 'lp', 1800); mix(x, s, 0.5, t0); });
    return finish(x, 0.8);
  } },
  // ── シジル ──
  sigilPing: { pri: 3, gap: 50, gain: 0.34, voices: 2, rnd: 0.3, wet: true, make() {
    const x = alloc(0.3); bell(x, { dur: 0.3, f: hz(100), amp: 0.5, ratio: 1.5, idx: 0.9, tau: 0.09 }); bell(x, { dur: 0.2, f: hz(107), amp: 0.25, ratio: 2, idx: 0.5, tau: 0.05 });
    return finish(x, 0.8);
  } },
  sigil: { pri: 10, gap: 600, gain: 0.6, voices: 1, duck: [0.4, 1.2], wet: true, make: () => finish(chime([69, 74, 76, 81, 86, 88, 93, 88, 93], 0.085, 0.5, { sparkle: 14, seed: 51, ratio: 2, idx: 1.4, tail: 0.6 }), 0.9) },
  // ── そのほか ──
  dive: { pri: 2, gap: 220, gain: 0.4, voices: 2, rnd: 1, make() {
    const x = alloc(0.42); osc(x, { dur: 0.42, f: (t) => 520 + 1900 * Math.exp(-t / 0.16), amp: (t) => Math.min(1, t / 0.02) * Math.min(1, (0.42 - t) / 0.12) * 0.6 });
    const n = filter(noise(0.42, 91), 'bp', (t) => 800 + 3500 * Math.exp(-t / 0.16), 3); shape(n, (t) => Math.min(1, t / 0.03) * Math.min(1, (0.42 - t) / 0.15)); mix(x, n, 0.8);
    return finish(x, 0.8);
  } },
  extend: { pri: 10, gap: 600, gain: 0.6, voices: 1, duck: [0.35, 0.9], wet: true, make() {
    const x = chime([79, 84, 88, 91, 96], 0.06, 0.1, { sparkle: 6, seed: 61, saw: 0.1, tail: 0.2 });
    for (let i = 0; i < 6; i++) bell(x, { t0: 0.32 + i * 0.07, dur: 0.2, f: hz(i % 2 ? 100 : 96), amp: 0.32, ratio: 2, idx: 1.2, tau: 0.07 }); // トリル
    return finish(x, 0.9);
  } },
  coreMiss: { pri: 9, gap: 900, gain: 0.5, voices: 1, make() {
    const x = alloc(0.95);
    for (let i = 0; i < 3; i++) { const s = alloc(0.2); for (const f of [196, 207.7]) osc(s, { dur: 0.2, wave: 'square', f, amp: (t) => Math.min(1, t / 0.004) * Math.min(1, (0.2 - t) / 0.03) }); filter(s, 'lp', 1500); mix(x, s, 0.5, i * 0.3); }
    return finish(x, 0.8);
  } },
  // エリアコアが近い（曲の切り替えに合わせる上昇音）
  coreAlert: { pri: 8, gap: 2000, gain: 0.6, voices: 1, wet: true, make() {
    const x = alloc(0.9); const s = alloc(0.9); for (const d of [1, 1.01, 1.5]) osc(s, { dur: 0.9, wave: 'saw', f: (t) => (220 + 440 * (t / 0.9) ** 2) * d, amp: (t) => (t / 0.9) ** 1.5 * Math.min(1, (0.9 - t) / 0.03) });
    filter(s, 'lp', (t) => 600 + 5000 * (t / 0.9), 2); mix(x, s, 0.4);
    const n = filter(noise(0.9, 97), 'hp', 3000); shape(n, (t) => (t / 0.9) ** 3 * Math.min(1, (0.9 - t) / 0.02)); mix(x, n, 0.3);
    return finish(x, 0.85);
  } },
  // ── メニュー（S27。この作品で足した UI の音）──
  uiMove: { ui: true, pri: 3, gap: 30, gain: 0.4, voices: 2, make() { const x = alloc(0.07); bell(x, { dur: 0.07, f: hz(86), amp: 0.5, ratio: 2, idx: 0.8, tau: 0.02 }); const c = filter(noise(0.01, 5), 'hp', 6000); shape(c, perc(0.002)); mix(x, c, 0.12); return finish(x, 0.8); } },
  uiOk:   { ui: true, pri: 4, gap: 60, gain: 0.4, voices: 1, wet: true, make() { const x = alloc(0.4); bell(x, { dur: 0.2, f: hz(79), amp: 0.5, ratio: 2, idx: 1.2, tau: 0.06 }); bell(x, { t0: 0.07, dur: 0.33, f: hz(86), amp: 0.5, ratio: 2, idx: 1.2, tau: 0.11 }); bell(x, { t0: 0.07, dur: 0.33, f: hz(91), amp: 0.2, ratio: 2, idx: 1, tau: 0.09 }); return finish(x, 0.85); } },
  uiBack: { ui: true, pri: 4, gap: 60, gain: 0.36, voices: 1, make() { const x = alloc(0.3); bell(x, { dur: 0.15, f: hz(81), amp: 0.5, ratio: 2, idx: 1, tau: 0.05 }); bell(x, { t0: 0.07, dur: 0.23, f: hz(74), amp: 0.5, ratio: 2, idx: 1, tau: 0.08 }); return finish(x, 0.8); } },
  pause:  { ui: true, pri: 5, gap: 100, gain: 0.4, voices: 1, make() { const x = alloc(0.22); bell(x, { dur: 0.12, f: hz(88), amp: 0.5, ratio: 2, idx: 1, tau: 0.04 }); bell(x, { t0: 0.06, dur: 0.16, f: hz(76), amp: 0.5, ratio: 2, idx: 1, tau: 0.05 }); osc(x, { dur: 0.1, f: (t) => 90 + 80 * Math.exp(-t / 0.02), amp: (t) => 0.4 * Math.exp(-t / 0.04) }); return finish(x, 0.85); } },
};
// 旧チップ音源での呼び名（S30）。チップ音源に無い音は近いもので代用、null は無音
export const CHIP_NAME = { killMid: 'kill', killCore: 'killBig', coreAlert: null };
