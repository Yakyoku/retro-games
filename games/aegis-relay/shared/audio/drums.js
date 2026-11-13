// AEGIS RELAY — ドラムの音（すべて計算で作る。S07〜S10）
// 起動時に 1 回だけ波形を作り、曲の中では AudioBufferSource で鳴らす（1 打 = ノード 2 個）。
import { SR, TAU, alloc, osc, noise, filter, shape, mix, drive, finish, perc, mkRng } from './dsp.js';

// 金属的な響きのもと: 互いに倍音関係にない矩形波を重ねる（周波数はこの作品で決めた値）
const METAL = [317, 421, 543, 687, 811, 1049];
function metal(sec, mul) {
  const x = alloc(sec);
  METAL.forEach((f, i) => osc(x, { dur: sec, wave: 'square', f: f * mul, amp: 0.16, phase: (i * 0.37) % 1 }));
  return x;
}
function tom(f0, sec, seed) {
  const x = alloc(sec);
  osc(x, { dur: sec, f: (t) => f0 * (1 + 0.55 * Math.exp(-t / 0.035)), amp: perc(sec * 0.3, 0.002) });
  osc(x, { dur: sec, f: (t) => f0 * 1.5 * (1 + 0.4 * Math.exp(-t / 0.03)), amp: (t) => 0.25 * Math.exp(-t / 0.05) });
  const n = filter(noise(0.05, seed), 'bp', 2200, 0.8); shape(n, perc(0.012)); mix(x, n, 0.35);
  return finish(drive(x, 1.4), 0.9);
}

export const DRUMS = {
  // キック: 音程が落ちる正弦（胴）＋ 叩いた瞬間のクリック（S07）
  kick() {
    const x = alloc(0.42);
    osc(x, { dur: 0.42, f: (t) => 47 + 95 * Math.exp(-t / 0.045) + 180 * Math.exp(-t / 0.006), amp: (t) => (t < 0.0015 ? t / 0.0015 : Math.exp(-(t - 0.0015) / 0.12)) });
    const c = filter(noise(0.03, 11), 'hp', 2500); shape(c, perc(0.004, 0.0003)); mix(x, c, 0.4);
    return finish(drive(x, 2.2), 0.95);
  },
  // スネア: 胴鳴り（正弦 2 本）＋ 響き線のノイズ（S08）
  snare() {
    const x = alloc(0.32);
    osc(x, { dur: 0.2, f: (t) => 182 + 90 * Math.exp(-t / 0.012), amp: (t) => 0.75 * Math.exp(-t / 0.055) });
    osc(x, { dur: 0.15, f: (t) => 331 + 60 * Math.exp(-t / 0.01), amp: (t) => 0.4 * Math.exp(-t / 0.035) });
    const n = filter(filter(noise(0.32, 21), 'hp', 1400), 'bp', 4300, 0.5); shape(n, perc(0.085, 0.0006)); mix(x, n, 1.5);
    return finish(drive(x, 1.6), 0.95);
  },
  // クラップ: 帯域を絞ったノイズを短く 3 回＋尾
  clap() {
    const n = filter(noise(0.3, 31), 'bp', 1700, 1.1);
    shape(n, (t) => { let e = 0; for (const d of [0, 0.011, 0.023]) if (t >= d) e += Math.exp(-(t - d) / 0.005); return e + (t > 0.03 ? 0.7 * Math.exp(-(t - 0.03) / 0.07) : 0); });
    return finish(n, 0.9);
  },
  // ハイハット（閉）（S09）
  hatC() { const x = metal(0.09, 9.1); mix(x, noise(0.09, 41), 0.35); filter(filter(x, 'hp', 7500), 'hp', 6000); shape(x, perc(0.016, 0.0004)); return finish(x, 0.8); },
  // ハイハット（開）
  hatO() { const x = metal(0.42, 9.1); mix(x, noise(0.42, 42), 0.35); filter(filter(x, 'hp', 7000), 'hp', 5500); shape(x, perc(0.11, 0.0006)); return finish(x, 0.8); },
  // クラッシュシンバル
  crash() {
    const x = metal(1.9, 6.3); mix(x, metal(1.9, 8.7), 0.6); mix(x, noise(1.9, 43), 0.8);
    filter(filter(x, 'hp', 3800), 'lp', 15000); shape(x, (t) => (t < 0.002 ? t / 0.002 : 0.65 * Math.exp(-t / 0.5) + 0.35 * Math.exp(-t / 0.12)));
    return finish(x, 0.85, 0.05);
  },
  // ライドシンバル（刻み用。細く長め）
  ride() { const x = metal(0.6, 7.4); filter(filter(x, 'bp', 6200, 1.2), 'hp', 4000); osc(x, { dur: 0.25, f: 5210, amp: (t) => 0.05 * Math.exp(-t / 0.06) }); shape(x, perc(0.2, 0.0006)); return finish(x, 0.7, 0.03); },
  // タム（高・中・低）（S10）
  tomH: () => tom(205, 0.3, 51), tomM: () => tom(150, 0.36, 52), tomL: () => tom(104, 0.45, 53),
  // シェイカー（合体中の上の層で使う）
  shaker() { const x = filter(noise(0.07, 61), 'hp', 6500); shape(x, (t) => (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.014))); return finish(x, 0.6); },
  // 盛り上げ用: だんだん大きくなるノイズ（サビの直前に、終わりが小節の頭に合うように鳴らす）
  rise() {
    const sec = RISE_SEC, x = noise(sec, 71);
    filter(x, 'bp', (t) => 900 + 7000 * (t / sec) ** 2, 1.4); shape(x, (t) => (t / sec) ** 2.5 * Math.min(1, (sec - t) / 0.02));
    return finish(x, 0.8, 0.02);
  },
};
export const RISE_SEC = 1.4;
export const DRUM_NAMES = Object.keys(DRUMS);
void SR; void TAU; void mkRng;
