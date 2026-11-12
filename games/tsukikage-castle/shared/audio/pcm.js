// 月影の魔城（VOIDBLOOM から複製）— 粗い PCM サンプル（すべて計算で作る。録音や既存の音源データは使わない）
// 8000Hz で合成 → 8bit に量子化。再生時は補間しないので、当時の PCM らしいざらつきが残る。
export function makeSamples() {
  let seed = 0x1234567;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1; };
  const gen = (rate, sec, fn) => {
    const n = Math.floor(rate * sec), d = new Float32Array(n);
    const st = { ph: 0, lp: 0, hp: 0, prev: 0 };
    for (let i = 0; i < n; i++) d[i] = fn(i / rate, i / n, st);
    // 8bit 量子化
    for (let i = 0; i < n; i++) d[i] = Math.round(Math.max(-1, Math.min(1, d[i])) * 127) / 127;
    return { rate, data: d };
  };
  const sine = (st, f, sr) => { st.ph += f / sr; return Math.sin(st.ph * Math.PI * 2); };
  const R = 8000;
  return {
    kick: gen(R, 0.28, (t, u, st) => sine(st, 46 + 110 * Math.exp(-t * 32), R) * Math.exp(-t * 11) * 1.1 + (t < 0.004 ? rnd() * 0.6 : 0)),
    snare: gen(R, 0.22, (t, u, st) => { st.lp += (rnd() - st.lp) * 0.55; return (st.lp * 0.9 * Math.exp(-t * 16) + sine(st, 186, R) * 0.45 * Math.exp(-t * 30)); }),
    hat: gen(R, 0.06, (t) => rnd() * Math.exp(-t * 70) * 0.55),
    ohat: gen(R, 0.3, (t, u, st) => { const x = rnd(); const y = x - st.prev; st.prev = x; return y * 0.4 * Math.exp(-t * 9); }),
    tom: gen(R, 0.32, (t, u, st) => sine(st, 82 + 90 * Math.exp(-t * 14), R) * Math.exp(-t * 9) * 0.95),
    crash: gen(R, 1.4, (t, u, st) => { const x = rnd(); const y = x - st.prev * 0.5; st.prev = x; return y * 0.5 * Math.exp(-t * 2.6); }),
    noise: gen(R, 0.7, (t, u, st) => { st.lp += (rnd() - st.lp) * (0.5 - u * 0.4); return st.lp * Math.exp(-t * 4.5) * 1.3; }),
    metal: gen(R, 0.4, (t, u, st) => { const a = Math.sin(t * 2 * Math.PI * 517), b = Math.sin(t * 2 * Math.PI * 1373), c = Math.sin(t * 2 * Math.PI * 731); return a * b * c * 0.9 * Math.exp(-t * 8) + rnd() * 0.15 * Math.exp(-t * 30); }),
    swell: gen(R, 0.9, (t, u, st) => { st.lp += (rnd() - st.lp) * (0.08 + u * 0.5); return st.lp * Math.pow(u, 2.2) * 1.4; }),
    // 効果音用の大きめのもの（さらに低いレートで粗く）
    boom: gen(6000, 1.3, (t, u, st) => { st.lp += (rnd() - st.lp) * (0.35 - u * 0.3); return (st.lp * 1.5 + Math.sin(t * 2 * Math.PI * (55 - 30 * u)) * 0.6) * Math.exp(-t * 2.6); }),
    crunch: gen(R, 0.35, (t, u, st) => { st.lp += (rnd() - st.lp) * 0.7; return Math.sign(st.lp) * Math.min(1, Math.abs(st.lp) * 3) * Math.exp(-t * 10) * 0.7; }),
    rumble: gen(5000, 2.4, (t, u, st) => { st.lp += (rnd() - st.lp) * 0.06; return st.lp * 4 * Math.min(1, t * 6) * Math.exp(-t * 1.2); }),
  };
}
