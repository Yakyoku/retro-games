// AEGIS RELAY — 音づくりの計算部品（純粋な JavaScript。AudioContext が無くても動く → Node のテストでも検査できる）
// ドラムと効果音は、起動時にここで波形を計算して AudioBuffer に入れる（録音・サンプル素材は使わない）。
export const SR = 48000; // 事前計算の標本化周波数（再生時にブラウザが出力のレートへ変換する）
export const TAU = Math.PI * 2;

// 種つきの乱数（-1〜1）。毎回同じ波形になる
export function mkRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2147483648 - 1; };
}
export const alloc = (sec) => new Float32Array(Math.max(1, Math.ceil(sec * SR)));
const fnOf = (v) => (typeof v === 'function' ? v : () => v);

// 折り返し雑音を抑える段差の補正（PolyBLEP）
function blep(p, dp) {
  if (p < dp) { const x = p / dp; return x + x - x * x - 1; }
  if (p > 1 - dp) { const x = (p - 1) / dp; return x * x + x + x + 1; }
  return 0;
}
export function waveAt(wave, p, dp, duty = 0.5) {
  switch (wave) {
    case 'saw': return 2 * p - 1 - blep(p, dp);
    case 'square': { let q = p + 1 - duty; if (q >= 1) q -= 1; return (p < duty ? 1 : -1) + blep(p, dp) - blep(q, dp); }
    case 'tri': return 4 * Math.abs(p - 0.5) - 1;
    default: return Math.sin(TAU * p);
  }
}
// 発振器を out に足す。f・amp は数値か t（秒）の関数
export function osc(out, { t0 = 0, dur, wave = 'sine', f, amp = 1, duty = 0.5, phase = 0 }) {
  const F = fnOf(f), A = fnOf(amp);
  const i0 = Math.round(t0 * SR), n = Math.min(out.length - i0, Math.round(dur * SR));
  let p = phase;
  for (let i = 0; i < n; i++) {
    const t = i / SR, dp = Math.min(0.45, F(t) / SR);
    out[i0 + i] += waveAt(wave, p, dp, duty) * A(t);
    p += dp; if (p >= 1) p -= 1;
  }
  return out;
}
// FM のベル: 搬送波 f、変調波 f×ratio。変調の深さが時間で減る → 打った瞬間だけ金属的
export function bell(out, { t0 = 0, dur, f, amp = 1, ratio = 3.5, idx = 2.2, tau = 0.25, atk = 0.002 }) {
  const i0 = Math.round(t0 * SR), n = Math.min(out.length - i0, Math.round(dur * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = (t < atk ? t / atk : Math.exp(-(t - atk) / tau)) * Math.min(1, (dur - t) / 0.01);
    out[i0 + i] += Math.sin(TAU * f * t + idx * Math.exp(-t / (tau * 0.6)) * Math.sin(TAU * f * ratio * t)) * e * amp;
  }
  return out;
}
export function noise(sec, seed = 1) { const r = mkRng(seed), x = alloc(sec); for (let i = 0; i < x.length; i++) x[i] = r(); return x; }

// 双二次フィルター（その場で書き換える）。fc・q は数値か t の関数（16 標本ごとに係数を更新）
export function filter(x, type, fc, q = 0.707) {
  const F = fnOf(fc), Q = fnOf(q);
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 15) === 0) {
      const w = TAU * Math.min(SR * 0.45, Math.max(10, F(i / SR))) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * Q(i / SR));
      const a0 = 1 + al;
      if (type === 'lp') { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = b0; }
      else { b0 = al / a0; b1 = 0; b2 = -al / a0; } // bp
      a1 = -2 * c / a0; a2 = (1 - al) / a0;
    }
    const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; x[i] = y;
  }
  return x;
}
export function shape(x, env) { for (let i = 0; i < x.length; i++) x[i] *= env(i / SR); return x; }
export function mix(dst, src, gain = 1, t0 = 0) {
  const i0 = Math.round(t0 * SR), n = Math.min(src.length, dst.length - i0);
  for (let i = 0; i < n; i++) dst[i0 + i] += src[i] * gain;
  return dst;
}
export function drive(x, k) { const n = Math.tanh(k); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k) / n; return x; }
// 仕上げ: 直流を除く → 最大値をそろえる → 頭と尻を短くフェード（クリック防止）→ 無音の尻を切る
export function finish(x, peak = 0.9, fadeOut = 0.012) {
  let dc = 0; for (let i = 0; i < x.length; i++) dc += x[i]; dc /= x.length;
  let m = 0; for (let i = 0; i < x.length; i++) { x[i] -= dc; const a = Math.abs(x[i]); if (a > m) m = a; }
  const g = m > 0 ? peak / m : 1;
  let end = x.length; while (end > 256 && Math.abs(x[end - 1]) * g < 4e-4) end--;
  const y = x.subarray(0, end); const fi = Math.round(0.0008 * SR), fo = Math.min(end, Math.round(fadeOut * SR));
  for (let i = 0; i < end; i++) y[i] *= g;
  for (let i = 0; i < fi && i < end; i++) y[i] *= i / fi;
  for (let i = 0; i < fo; i++) y[end - 1 - i] *= i / fo;
  return y;
}
export const perc = (tau, atk = 0.001) => (t) => (t < atk ? t / atk : Math.exp(-(t - atk) / tau));
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
