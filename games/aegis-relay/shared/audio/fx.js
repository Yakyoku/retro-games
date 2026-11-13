// AEGIS RELAY — 空間系とマスター（S11 リバーブ / S12 ディレイ / S15 コンプレッサー＋リミッター）
import { SR, alloc, mkRng, filter } from './dsp.js';

// 残響のインパルス応答を計算で作る: 初期反射（まばらな粒）＋ 減衰するノイズ（時間とともに高域が減る）。左右は別の乱数
export function reverbIR(sec = 1.7) {
  const mk = (seed) => {
    const x = alloc(sec), r = mkRng(seed), pre = Math.round(0.012 * SR);
    for (let i = pre; i < x.length; i++) { const t = (i - pre) / SR; x[i] = r() * Math.exp(-t / (sec * 0.2)) * Math.min(1, t / 0.006); }
    filter(x, 'lp', (t) => 1400 + 9000 * Math.exp(-t / 0.35), 0.6); filter(x, 'hp', 220);
    for (let k = 0; k < 9; k++) { const i = pre + Math.round((0.004 + 0.045 * (0.5 + 0.5 * r())) * SR); x[i] += (0.7 - k * 0.05) * (r() > 0 ? 1 : -1); }
    let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    const g = 1 / Math.sqrt(e); for (let i = 0; i < x.length; i++) x[i] *= g; // エネルギーを 1 に
    const fo = Math.round(0.08 * SR); for (let i = 0; i < fo; i++) x[x.length - 1 - i] *= i / fo;
    return x;
  };
  return { l: mk(1201), r: mk(4507) };
}

// 音割れ防止の最終段: ±0.6 までは直線、その先はなめらかに 0.93 へ近づく（出力は必ず 0.93 以下）
export function softClipCurve(n = 2049, knee = 0.6, ceil = 0.93) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// マスター: 入力 → コンプレッサー（音圧をそろえる）→ リミッター → ソフトクリップ → 全体の音量 → 出力
export function createMaster(ctx, bypass = false) {
  const input = ctx.createGain(), comp = ctx.createDynamicsCompressor(), lim = ctx.createDynamicsCompressor();
  const pre = ctx.createGain(), clip = ctx.createWaveShaper(), out = ctx.createGain();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.012; comp.release.value = 0.16;
  lim.threshold.value = -5; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.09;
  input.gain.value = 0.42; pre.gain.value = 0.8; // コンプレッサーの自動の持ち上げ（ブラウザ内蔵）を見込んだ入口と出口の音量
  clip.curve = softClipCurve();
  if (bypass) input.connect(out); // 検証用: マスター処理を通さずに録る（声部ごとの音量を測るため）
  else { input.connect(comp); comp.connect(lim); lim.connect(pre); }
  pre.connect(clip); clip.connect(out); out.connect(ctx.destination);
  return { input, pre, out, comp, lim };
}

// 共用のリバーブ（コンボルバー 1 個を曲と効果音で分け合う）
export function createReverb(ctx, dest, ir) {
  const input = ctx.createGain(), ret = ctx.createGain(); ret.gain.value = 0.9;
  let conv = null;
  if (ctx.createConvolver) {
    try {
      // コンボルバーの波形は、出力と同じ標本化周波数でなければならない（44.1kHz の機器など）→ 合わせて作り直す
      const sr = ctx.sampleRate, k = SR / sr, n = Math.floor(ir.l.length / k), g = Math.sqrt(k);
      const b = ctx.createBuffer(2, n, sr);
      [ir.l, ir.r].forEach((x, c) => { const d = b.getChannelData(c); for (let i = 0; i < n; i++) { const p = i * k, j = Math.floor(p), f = p - j; d[i] = (x[j] * (1 - f) + (x[j + 1] || 0) * f) * g; } });
      conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = b;
      input.connect(conv); conv.connect(ret); ret.connect(dest);
    } catch { conv = null; /* 残響なしで続ける */ }
  }
  return { input };
}

// テンポに合ったディレイ（付点 8 分。左 → 右 → 左…と跳ねる）。曲ごとに作り、曲が変わったら余韻ごと片づける
export function createDelay(ctx, dest, spb) {
  const input = ctx.createGain(), d = spb * 0.75;
  const dl = ctx.createDelay(1.5), dr = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
  dl.delayTime.value = d; dr.delayTime.value = d; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 3800; hp.type = 'highpass'; hp.frequency.value = 350;
  const pl = pan(ctx, -0.65), pr = pan(ctx, 0.65);
  input.connect(hp); hp.connect(dl); dl.connect(pl); pl.connect(dest);
  dl.connect(lp); lp.connect(dr); dr.connect(pr); pr.connect(dest); dr.connect(fb); fb.connect(dl);
  return { input, dispose() { for (const n of [input, hp, dl, dr, fb, lp, pl, pr]) { try { n.disconnect(); } catch { /* 済 */ } } } };
}

// 左右の定位（-1〜1）。StereoPanner が無い環境では定位なしで通す
export function pan(ctx, v) {
  if (!ctx.createStereoPanner) return ctx.createGain();
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p;
}
