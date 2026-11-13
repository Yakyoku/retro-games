// 効果音 v2（重ねて作る。ステレオ）。銃声 = 撃鉄のクリック＋破裂の胴鳴り＋低い衝撃＋スライドの金属音＋残響の尾、のように層で組む。
import { SR, SVF, noiseGen, rng, buf } from './synth2.js';
const TAU = Math.PI * 2;

// 層の部品
function noise(L, R, at, len, { fc = 2000, res = 0.3, mode = 'bp', decay = 0.05, gain = 0.5, sweepTo = null, pan = 0, attack = 0.0005, seed = 1 } = {}) {
  const s0 = Math.floor(at * SR), n = Math.floor(len * SR); const f = new SVF(); const nz = noiseGen(seed + s0);
  for (let k = 0; k < n && s0 + k < L.length; k++) {
    const t = k / SR; if ((k & 15) === 0) f.set(sweepTo ? fc * Math.pow(sweepTo / fc, t / len) : fc, res);
    const env = Math.min(1, t / attack) * Math.exp(-t / decay) * (k > n - 64 ? (n - k) / 64 : 1);
    const v = f.run(nz(), mode) * env * gain;
    L[s0 + k] += v * (1 - Math.max(0, pan)); R[s0 + k] += v * (1 + Math.min(0, pan));
  }
}
function tone(L, R, at, len, { f0 = 440, f1 = null, type = 'sine', decay = 0.1, gain = 0.4, pan = 0, attack = 0.001, curve = 1, fmRatio = 0, fmIndex = 0 } = {}) {
  const s0 = Math.floor(at * SR), n = Math.floor(len * SR); let ph = 0, mph = 0;
  for (let k = 0; k < n && s0 + k < L.length; k++) {
    const t = k / SR; const u = k / n;
    const f = f1 ? f0 * Math.pow(f1 / f0, Math.pow(u, curve)) : f0;
    const mod = fmRatio ? Math.sin(TAU * mph) * fmIndex * Math.exp(-t / decay) : 0; mph += f * fmRatio / SR;
    let x;
    if (type === 'sine') x = Math.sin(TAU * ph + mod); else if (type === 'tri') { const p = (ph % 1); x = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; } else if (type === 'saw') x = 2 * (ph % 1) - 1; else x = (ph % 1) < 0.5 ? 1 : -1;
    ph += f / SR;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay) * (k > n - 64 ? (n - k) / 64 : 1);
    const v = x * env * gain;
    L[s0 + k] += v * (1 - Math.max(0, pan)); R[s0 + k] += v * (1 + Math.min(0, pan));
  }
}
function metal(L, R, at, len, { base = 2400, n = 5, decay = 0.08, gain = 0.15, seed = 3 } = {}) { // 金属の響き（不協和な正弦の束）
  const r = rng(seed);
  for (let i = 0; i < n; i++) tone(L, R, at + r() * 0.004, len, { f0: base * (1 + r() * 1.7), decay: decay * (0.5 + r()), gain: gain / n * 2, pan: (r() - 0.5) * 0.6 });
}
function finish(LR, gain = 1) { // 簡単な残響の尾（短い多重反射）と正規化
  const [L, R] = LR; const taps = [[0.011, 0.35, 0.3], [0.019, 0.28, -0.3], [0.031, 0.2, 0.2], [0.047, 0.14, -0.2], [0.071, 0.09, 0.1]];
  const oL = Float32Array.from(L), oR = Float32Array.from(R);
  for (const [d, g, p] of taps) { const o = Math.floor(d * SR); for (let k = 0; k + o < L.length; k++) { oL[k + o] += L[k] * g * (1 - Math.max(0, p)); oR[k + o] += R[k] * g * (1 + Math.min(0, p)); } }
  let pk = 0; for (let k = 0; k < oL.length; k++) pk = Math.max(pk, Math.abs(oL[k]), Math.abs(oR[k]));
  const s = pk > 0 ? (0.9 * gain) / pk : 1; for (let k = 0; k < oL.length; k++) { oL[k] = Math.tanh(oL[k] * s); oR[k] = Math.tanh(oR[k] * s); }
  return [oL, oR];
}

export const SFX2 = {
  // 主人公の銃: 鋭いクリック＋胴鳴り＋低い衝撃＋スライド＋尾
  shot() { const b = buf(0.5); noise(...b, 0, 0.004, { fc: 6000, mode: 'hp', decay: 0.002, gain: 1.4 }); noise(...b, 0, 0.12, { fc: 1400, res: 0.25, decay: 0.035, gain: 1.2, sweepTo: 600 }); tone(...b, 0, 0.12, { f0: 160, f1: 48, decay: 0.05, gain: 0.9 }); metal(...b, 0.045, 0.08, { base: 3000, decay: 0.02, gain: 0.25 }); noise(...b, 0.02, 0.45, { fc: 900, mode: 'lp', decay: 0.13, gain: 0.25 }); return finish(b, 0.95); },
  // 敵の銃: 低く重い（主人公の銃と聞き分けられる）
  eshot() { const b = buf(0.6); noise(...b, 0, 0.005, { fc: 4000, mode: 'hp', decay: 0.003, gain: 1.0 }); noise(...b, 0, 0.16, { fc: 800, res: 0.3, decay: 0.05, gain: 1.3, sweepTo: 350 }); tone(...b, 0, 0.16, { f0: 120, f1: 38, decay: 0.07, gain: 1.0 }); noise(...b, 0.02, 0.55, { fc: 600, mode: 'lp', decay: 0.18, gain: 0.3 }); return finish(b, 0.9); },
  // 構え（撃ってくる合図）: 撃鉄を起こす 2 つの金属音＋バイザーの充電音
  windup() { const b = buf(0.35); metal(...b, 0, 0.05, { base: 3600, decay: 0.012, gain: 0.5, seed: 9 }); metal(...b, 0.07, 0.05, { base: 2600, decay: 0.012, gain: 0.45, seed: 11 }); tone(...b, 0.02, 0.3, { f0: 900, f1: 2200, decay: 0.4, gain: 0.12, curve: 0.6 }); return finish(b, 0.55); },
  // 弾が近くをかすめる
  whizz() { const b = buf(0.3); noise(...b, 0, 0.28, { fc: 3000, res: 0.6, decay: 0.12, gain: 0.8, sweepTo: 900, attack: 0.05, pan: 0.3 }); return finish(b, 0.5); },
  shell() { const b = buf(0.35); metal(...b, 0, 0.06, { base: 5200, decay: 0.03, gain: 0.35, seed: 5 }); metal(...b, 0.09, 0.05, { base: 4800, decay: 0.02, gain: 0.25, seed: 6 }); metal(...b, 0.15, 0.04, { base: 5000, decay: 0.015, gain: 0.15, seed: 7 }); return finish(b, 0.35); },
  // 撃破: 鈍い衝撃＋布
  hit() { const b = buf(0.4); tone(...b, 0, 0.18, { f0: 110, f1: 55, decay: 0.07, gain: 1.0 }); noise(...b, 0, 0.2, { fc: 1800, res: 0.2, decay: 0.05, gain: 0.8 }); noise(...b, 0, 0.35, { fc: 400, mode: 'lp', decay: 0.1, gain: 0.5 }); return finish(b, 0.8); },
  bodyfall() { const b = buf(0.5); tone(...b, 0, 0.2, { f0: 80, f1: 45, decay: 0.08, gain: 1.0 }); noise(...b, 0, 0.3, { fc: 500, mode: 'lp', decay: 0.08, gain: 0.8 }); noise(...b, 0.08, 0.3, { fc: 1200, res: 0.2, decay: 0.06, gain: 0.3 }); return finish(b, 0.6); },
  kick() { const b = buf(0.35); noise(...b, 0, 0.12, { fc: 800, res: 0.3, decay: 0.05, gain: 0.5, sweepTo: 3000, attack: 0.04 }); tone(...b, 0.05, 0.2, { f0: 180, f1: 50, decay: 0.06, gain: 1.1 }); noise(...b, 0.05, 0.1, { fc: 3500, mode: 'hp', decay: 0.01, gain: 0.9 }); return finish(b, 0.9); },
  kickSwing() { const b = buf(0.3); noise(...b, 0, 0.25, { fc: 600, res: 0.4, decay: 0.1, gain: 0.8, sweepTo: 2600, attack: 0.06 }); return finish(b, 0.45); },
  jump() { const b = buf(0.3); noise(...b, 0, 0.22, { fc: 700, res: 0.35, decay: 0.08, gain: 0.7, sweepTo: 2000, attack: 0.02 }); tone(...b, 0, 0.05, { f0: 140, f1: 90, decay: 0.03, gain: 0.3 }); return finish(b, 0.35); },
  land() { const b = buf(0.3); tone(...b, 0, 0.12, { f0: 95, f1: 50, decay: 0.05, gain: 1.0 }); noise(...b, 0, 0.15, { fc: 1500, res: 0.2, decay: 0.03, gain: 0.5 }); return finish(b, 0.5); },
  // 足音（4 種。かかと→つま先の 2 打）
  step0() { const b = buf(0.15); noise(...b, 0, 0.04, { fc: 2200, res: 0.3, decay: 0.008, gain: 0.8, seed: 21 }); tone(...b, 0, 0.04, { f0: 150, decay: 0.012, gain: 0.4 }); noise(...b, 0.035, 0.03, { fc: 3500, res: 0.3, decay: 0.006, gain: 0.4, seed: 22 }); return finish(b, 0.28); },
  step1() { const b = buf(0.15); noise(...b, 0, 0.04, { fc: 2000, res: 0.3, decay: 0.009, gain: 0.8, seed: 23 }); tone(...b, 0, 0.04, { f0: 140, decay: 0.012, gain: 0.4 }); noise(...b, 0.04, 0.03, { fc: 3200, res: 0.3, decay: 0.006, gain: 0.35, seed: 24 }); return finish(b, 0.26); },
  step2() { const b = buf(0.15); noise(...b, 0, 0.04, { fc: 2500, res: 0.3, decay: 0.007, gain: 0.8, seed: 25 }); tone(...b, 0, 0.04, { f0: 160, decay: 0.012, gain: 0.4 }); noise(...b, 0.03, 0.03, { fc: 3800, res: 0.3, decay: 0.006, gain: 0.4, seed: 26 }); return finish(b, 0.27); },
  step3() { const b = buf(0.15); noise(...b, 0, 0.04, { fc: 1800, res: 0.3, decay: 0.009, gain: 0.8, seed: 27 }); tone(...b, 0, 0.04, { f0: 130, decay: 0.012, gain: 0.4 }); noise(...b, 0.045, 0.03, { fc: 3000, res: 0.3, decay: 0.006, gain: 0.35, seed: 28 }); return finish(b, 0.25); },
  // 照明: ガラスが割れる鋭い音＋火花 → 落ちて砕ける
  lightHit() { const b = buf(0.5); metal(...b, 0, 0.3, { base: 3800, n: 7, decay: 0.06, gain: 0.5, seed: 31 }); noise(...b, 0, 0.12, { fc: 7000, mode: 'hp', decay: 0.03, gain: 0.6 }); for (let i = 0; i < 6; i++) noise(...b, 0.03 + i * 0.03, 0.02, { fc: 6000, mode: 'hp', decay: 0.004, gain: 0.4, seed: 40 + i }); return finish(b, 0.6); },
  lightCrash() { const b = buf(1.0); const r = rng(77); for (let i = 0; i < 18; i++) metal(...b, r() * 0.25, 0.25, { base: 2500 + r() * 4000, n: 3, decay: 0.05, gain: 0.25, seed: 50 + i }); noise(...b, 0, 0.6, { fc: 5000, mode: 'hp', decay: 0.15, gain: 0.8 }); tone(...b, 0, 0.3, { f0: 90, f1: 50, decay: 0.1, gain: 0.7 }); metal(...b, 0.02, 0.6, { base: 700, n: 4, decay: 0.25, gain: 0.3, seed: 99 }); return finish(b, 0.85); },
  // かご: モーターの立ち上がり＋継電器の音 / 到着のブレーキと 2 音のチャイム
  carStart() { const b = buf(0.6); metal(...b, 0, 0.05, { base: 1800, decay: 0.01, gain: 0.5, seed: 61 }); tone(...b, 0.02, 0.55, { f0: 45, f1: 95, type: 'saw', decay: 0.4, gain: 0.25, attack: 0.15 }); return finish(b, 0.5); },
  carStop() { const b = buf(1.4); noise(...b, 0, 0.3, { fc: 3000, res: 0.2, decay: 0.08, gain: 0.3, sweepTo: 1200 }); metal(...b, 0.05, 0.06, { base: 1500, decay: 0.015, gain: 0.4, seed: 62 }); tone(...b, 0.18, 1.0, { f0: 1318.5, decay: 0.45, gain: 0.3, fmRatio: 3, fmIndex: 1.2 }); tone(...b, 0.45, 0.9, { f0: 1046.5, decay: 0.5, gain: 0.3, fmRatio: 3, fmIndex: 1.2 }); return finish(b, 0.5); },
  carPass() { const b = buf(0.2); tone(...b, 0, 0.15, { f0: 1760, decay: 0.05, gain: 0.3, fmRatio: 2, fmIndex: 0.8 }); return finish(b, 0.2); },
  carWarn() { const b = buf(0.6); for (const t of [0, 0.22]) tone(...b, t, 0.16, { f0: 1975, decay: 0.12, gain: 0.35, type: 'square', attack: 0.004 }); return finish(b, 0.4); },
  carLimit() { const b = buf(0.3); tone(...b, 0, 0.18, { f0: 220, f1: 180, decay: 0.12, gain: 0.5, type: 'square' }); return finish(b, 0.35); },
  call() { const b = buf(0.5); metal(...b, 0, 0.03, { base: 4000, decay: 0.006, gain: 0.5, seed: 71 }); tone(...b, 0.03, 0.4, { f0: 1568, decay: 0.15, gain: 0.3, fmRatio: 2, fmIndex: 1 }); tone(...b, 0.12, 0.35, { f0: 2093, decay: 0.15, gain: 0.25, fmRatio: 2, fmIndex: 1 }); return finish(b, 0.4); },
  // 通常ドア: カードリーダーの音と解錠 → 空気圧の開閉
  doorWarn() { const b = buf(0.6); tone(...b, 0, 0.1, { f0: 880, decay: 0.06, gain: 0.35, type: 'square' }); tone(...b, 0.12, 0.1, { f0: 660, decay: 0.06, gain: 0.35, type: 'square' }); metal(...b, 0.3, 0.06, { base: 1400, decay: 0.012, gain: 0.5, seed: 81 }); return finish(b, 0.45); },
  doorOpen() { const b = buf(0.7); noise(...b, 0, 0.55, { fc: 1500, res: 0.3, decay: 0.2, gain: 0.7, sweepTo: 600, attack: 0.03 }); metal(...b, 0.5, 0.05, { base: 1100, decay: 0.012, gain: 0.4, seed: 82 }); return finish(b, 0.5); },
  doorEnter() { const b = buf(0.6); metal(...b, 0, 0.05, { base: 2000, decay: 0.01, gain: 0.5, seed: 83 }); noise(...b, 0.05, 0.4, { fc: 900, res: 0.3, decay: 0.12, gain: 0.6, sweepTo: 1800 }); return finish(b, 0.5); },
  docGrab() { const b = buf(0.6); noise(...b, 0, 0.25, { fc: 3500, res: 0.4, decay: 0.05, gain: 0.6, sweepTo: 5000 }); noise(...b, 0.08, 0.2, { fc: 2800, res: 0.4, decay: 0.05, gain: 0.4 }); return finish(b, 0.4); },
  bulletCover() { const b = buf(0.5); metal(...b, 0, 0.05, { base: 2600, decay: 0.012, gain: 0.5, seed: 91 }); tone(...b, 0.01, 0.4, { f0: 3400, f1: 1500, decay: 0.15, gain: 0.25, curve: 0.5 }); return finish(b, 0.45); },
  needDocs() { const b = buf(0.6); for (const t of [0, 0.2]) tone(...b, t, 0.16, { f0: 196, decay: 0.15, gain: 0.5, fmRatio: 1.5, fmIndex: 2 }); return finish(b, 0.45); },
  crush() { const b = buf(0.8); tone(...b, 0, 0.4, { f0: 70, f1: 35, decay: 0.15, gain: 1.0, type: 'saw' }); metal(...b, 0, 0.5, { base: 600, n: 6, decay: 0.15, gain: 0.5, seed: 95 }); noise(...b, 0, 0.6, { fc: 800, res: 0.2, decay: 0.2, gain: 0.7 }); return finish(b, 0.85); },
  dodge() { const b = buf(0.3); noise(...b, 0, 0.25, { fc: 900, res: 0.4, decay: 0.1, gain: 0.8, sweepTo: 3000, attack: 0.04 }); return finish(b, 0.4); },
  spot() { const b = buf(0.3); tone(...b, 0, 0.2, { f0: 1200, f1: 1800, decay: 0.12, gain: 0.25, fmRatio: 2, fmIndex: 0.6 }); return finish(b, 0.25); },
  // 補助音（メニュー）
  uiMove() { const b = buf(0.12); tone(...b, 0, 0.08, { f0: 1760, decay: 0.03, gain: 0.3, fmRatio: 2, fmIndex: 0.5 }); return finish(b, 0.2); },
  uiOk() { const b = buf(0.4); tone(...b, 0, 0.2, { f0: 1046.5, decay: 0.1, gain: 0.3, fmRatio: 2, fmIndex: 0.8 }); tone(...b, 0.07, 0.3, { f0: 1568, decay: 0.15, gain: 0.3, fmRatio: 2, fmIndex: 0.8 }); return finish(b, 0.3); },
  uiBack() { const b = buf(0.3); tone(...b, 0, 0.2, { f0: 1046.5, f1: 700, decay: 0.1, gain: 0.3, fmRatio: 2, fmIndex: 0.6 }); return finish(b, 0.25); },
};

// かごの走行音（1 秒ちょうどのループ。モーターのうなり＋ワイヤーのきしみ）
export function carHum2() {
  const n = SR; const L = new Float32Array(n), R = new Float32Array(n); const nz = noiseGen(5); const f = new SVF(); f.set(300, 0.3);
  for (let k = 0; k < n; k++) {
    const t = k / n; const trem = 0.8 + 0.2 * Math.sin(TAU * 7 * t);
    const v = (Math.sin(TAU * 55 * t) * 0.3 + Math.sin(TAU * 110 * t) * 0.12 + Math.sin(TAU * 165 * t) * 0.05) * trem + f.run(nz(), 'lp') * 0.08;
    L[k] = v * 0.6; R[k] = v * 0.6;
  }
  return [L, R];
}
// 環境音（ステージごと、ループ用に 12 秒）: 空調のうなり・遠くの車・サーバーの電子音・雨と雷
export function ambience(kind) {
  const sec = 12; const n = sec * SR; const L = new Float32Array(n), R = new Float32Array(n); const nzL = noiseGen(11), nzR = noiseGen(12);
  const fL = new SVF(), fR = new SVF(); fL.set(kind === 'rain' ? 2500 : 240, 0.1); fR.set(kind === 'rain' ? 2600 : 250, 0.1);
  for (let k = 0; k < n; k++) {
    const t = k / SR; const sw = 0.85 + 0.15 * Math.sin(TAU * t / sec);
    L[k] = fL.run(nzL(), kind === 'rain' ? 'bp' : 'lp') * (kind === 'rain' ? 0.5 : 0.9) * sw + Math.sin(TAU * 60 * t) * 0.03;
    R[k] = fR.run(nzR(), kind === 'rain' ? 'bp' : 'lp') * (kind === 'rain' ? 0.5 : 0.9) * sw + Math.sin(TAU * 60 * t) * 0.03;
  }
  const r = rng(kind.length * 17);
  if (kind === 'office') for (let i = 0; i < 4; i++) tone(L, R, r() * (sec - 3), 2.5, { f0: 90 + r() * 30, f1: 60, decay: 1.2, gain: 0.05, attack: 1.0, pan: r() - 0.5 }); // 遠くの車
  if (kind === 'lab') for (let i = 0; i < 10; i++) tone(L, R, r() * (sec - 0.3), 0.12, { f0: 2000 + r() * 2000, decay: 0.04, gain: 0.03, type: 'square', pan: r() * 2 - 1 }); // 機械の電子音
  if (kind === 'rain') { const at = 3 + r() * 5; noise(L, R, at, 3.5, { fc: 120, mode: 'lp', decay: 1.2, gain: 1.8, attack: 0.3, seed: 7 }); } // 遠雷
  // ループの継ぎ目をなめらかに（両端 0.5 秒をクロスフェード）
  const x = Math.floor(0.5 * SR);
  for (let k = 0; k < x; k++) { const a = k / x; L[k] = L[k] * a + L[n - x + k] * (1 - a); R[k] = R[k] * a + R[n - x + k] * (1 - a); }
  return [L.subarray(0, n - x), R.subarray(0, n - x)];
}
