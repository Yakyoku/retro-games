// 月影の魔城（VOIDBLOOM から複製）— 粗い PCM サンプル（すべて計算で作る。録音や既存の音源データは使わない）
// 8000Hz で合成 → 8bit に量子化。再生時は補間しないので、当時の PCM らしいざらつきが残る。
export function makeSamples() {
  let seed = 0x1234567;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1; };
  const gen = (rate, sec, fn) => {
    const n = Math.floor(rate * sec), d = new Float32Array(n);
    const st = { ph: 0, lp: 0, hp: 0, prev: 0, hpx: 0, hpy: 0 };
    for (let i = 0; i < n; i++) d[i] = fn(i / rate, i / n, st);
    // 8bit 量子化
    for (let i = 0; i < n; i++) d[i] = Math.round(Math.max(-1, Math.min(1, d[i])) * 127) / 127;
    return { rate, data: d };
  };
  const sine = (st, f, sr) => { st.ph += f / sr; return Math.sin(st.ph * Math.PI * 2); };
  const R = 16000; // 打楽器は 16kHz で作り直し（8kHz のこもりを解消。量子化は 8bit のまま当時のざらつきを残す）
  const hp = (st, x, k) => { const y = x - st.hpx + k * (st.hpy || 0); st.hpx = x; st.hpy = y; return y; };
  const metal = (t) => { let v = 0; for (const f of [3140, 4210, 5330, 6870, 8120, 9460]) v += Math.sign(Math.sin(t * 2 * Math.PI * f)); return v / 6; };
  return {
    // バスドラム: 打撃の「カチッ」＋ 150→45Hz に下がる胴鳴り
    kick: gen(R, 0.34, (t, u, st) => sine(st, 45 + 140 * Math.exp(-t * 38), R) * Math.exp(-t * 9) * 1.15 + (t < 0.006 ? rnd() * 0.9 * (1 - t / 0.006) : 0) + Math.sin(t * 2 * Math.PI * 1800) * Math.exp(-t * 160) * 0.3),
    // スネア: 胴の 185Hz と 330Hz ＋ 響き線のノイズ（高域寄り）
    snare: gen(R, 0.28, (t, u, st) => { const n = hp(st, rnd(), 0.6); return n * 0.85 * Math.exp(-t * 13) + (Math.sin(t * 2 * Math.PI * 185) * 0.5 + Math.sin(t * 2 * Math.PI * 330) * 0.25) * Math.exp(-t * 28); }),
    // ハイハット: 不協和な矩形の和（金属の響き）を高域だけ残す
    hat: gen(R, 0.07, (t, u, st) => hp(st, metal(t) * 0.6 + rnd() * 0.4, 0.2) * Math.exp(-t * 60) * 0.6),
    ohat: gen(R, 0.34, (t, u, st) => hp(st, metal(t) * 0.6 + rnd() * 0.4, 0.2) * Math.exp(-t * 8) * 0.45),
    tom: gen(R, 0.36, (t, u, st) => sine(st, 80 + 110 * Math.exp(-t * 16), R) * Math.exp(-t * 8) * 1.0 + rnd() * 0.1 * Math.exp(-t * 40)),
    crash: gen(R, 1.6, (t, u, st) => hp(st, metal(t * 0.8) * 0.5 + rnd() * 0.5, 0.3) * 0.55 * Math.exp(-t * 2.2)),
    noise: gen(R, 0.7, (t, u, st) => { st.lp += (rnd() - st.lp) * (0.5 - u * 0.4); return st.lp * Math.exp(-t * 4.5) * 1.3; }),
    metal: gen(R, 0.4, (t, u, st) => { const a = Math.sin(t * 2 * Math.PI * 517), b = Math.sin(t * 2 * Math.PI * 1373), c = Math.sin(t * 2 * Math.PI * 731); return a * b * c * 0.9 * Math.exp(-t * 8) + rnd() * 0.15 * Math.exp(-t * 30); }),
    swell: gen(R, 0.9, (t, u, st) => { st.lp += (rnd() - st.lp) * (0.08 + u * 0.5); return st.lp * Math.pow(u, 2.2) * 1.4; }),
    ring: gen(R, 0.9, (t) => (Math.sin(t * 2 * Math.PI * 2640) * 0.5 + Math.sin(t * 2 * Math.PI * 3960) * 0.3 + Math.sin(t * 2 * Math.PI * 5470) * 0.2) * Math.exp(-t * 5)),
    // 効果音用の大きめのもの（さらに低いレートで粗く）
    boom: gen(6000, 1.3, (t, u, st) => { st.lp += (rnd() - st.lp) * (0.35 - u * 0.3); return (st.lp * 1.5 + Math.sin(t * 2 * Math.PI * (55 - 30 * u)) * 0.6) * Math.exp(-t * 2.6); }),
    crunch: gen(R, 0.35, (t, u, st) => { st.lp += (rnd() - st.lp) * 0.7; return Math.sign(st.lp) * Math.min(1, Math.abs(st.lp) * 3) * Math.exp(-t * 10) * 0.7; }),
    rumble: gen(5000, 2.4, (t, u, st) => { st.lp += (rnd() - st.lp) * 0.06; return st.lp * 4 * Math.min(1, t * 6) * Math.exp(-t * 1.2); }),
  };
}
