// AEGIS RELAY — 楽器（モダン音源。S01〜S06）
// ・リード / パッド / スタブ: デチューンした 7 本ののこぎり波（スーパーソー）。7 本ぶんを起動時に 1 つの
//   ステレオ波形（ループ）に計算しておき、1 音 = 音源 1 個で鳴らす（Quest でもノード数が増えない）
// ・ベース: サブ（正弦）＋ のこぎり波・矩形波（明るさが音量エンベロープで減る）→ 声部のローパス
// ・プラック（アルペジオ）: のこぎり波（素早く減る）＋矩形波 → 声部のローパス
// ・ベル: FM（搬送波＋変調波。変調の深さが時間で減る）
// どの音も「アタック数 ms・リリース数十 ms」の音量エンベロープを持ち、クリックを出さない。
import { SR, alloc, waveAt, filter, hz } from './dsp.js';

// スーパーソーの波形表。base（MIDI 番号）ごとに 2 秒のループ（各のこぎり波の周波数を 0.5Hz 刻みに丸める → 継ぎ目が合う）
export const SAW_BASES = [45, 57, 69, 81];
const DETUNE = [-23, -13, -5, 0, 6, 14, 22]; // セント
const PANS = [-0.9, 0.7, -0.4, 0, 0.45, -0.65, 0.9];
export function superSawTable(base) {
  const sec = 2, n = sec * SR, l = alloc(sec), r = alloc(sec), f0 = hz(base);
  const used = new Set();
  DETUNE.forEach((c, k) => {
    let f = Math.round(f0 * 2 ** (c / 1200) * sec) / sec;
    while (used.has(f)) f += (c >= 0 ? 1 : -1) / sec; used.add(f);
    const dp = f / SR, gl = Math.cos((PANS[k] + 1) * Math.PI / 4), gr = Math.sin((PANS[k] + 1) * Math.PI / 4), a = k === 3 ? 0.5 : 0.36;
    let p = (k * 0.6180339) % 1;
    for (let i = 0; i < n; i++) { const v = waveAt('saw', p, dp) * a; l[i] += v * gl; r[i] += v * gr; p += dp; if (p >= 1) p -= 1; }
  });
  // 高く移調して鳴らしても折り返さないよう、上を落としておく（ループなのでフィルターの立ち上がりは 2 周して捨てる）
  for (const ch of [l, r]) {
    const tmp = new Float32Array(n * 2); tmp.set(ch); tmp.set(ch, n);
    filter(filter(tmp, 'lp', 9500, 0.6), 'lp', 11000, 0.8); ch.set(tmp.subarray(n));
    let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(ch[i])); for (let i = 0; i < n; i++) ch[i] *= 0.9 / m;
  }
  return { base, l, r };
}

const DEF = {
  lead:  { kind: 'saw', atk: 0.006, dec: 0.25, sus: 0.78, rel: 0.07, sub: 0.22, vib: 11 },
  harm:  { kind: 'saw', atk: 0.01, dec: 0.2, sus: 0.7, rel: 0.07 },
  pad:   { kind: 'saw', atk: 0.16, dec: 0.6, sus: 0.85, rel: 0.4 },
  stab:  { kind: 'saw', atk: 0.004, dec: 0.09, sus: 0.25, rel: 0.05 },
  bass:  { kind: 'bass' },
  arp:   { kind: 'pluck', tau: 0.09 },
  pulse: { kind: 'pluck', tau: 0.05 },
  bell:  { kind: 'fm', ratio: 3.5, idx: 2.2, tau: 0.45 },
  glass: { kind: 'fm', ratio: 2, idx: 1.3, tau: 0.3 },
};
export const INSTRUMENTS = Object.keys(DEF);

function pulseWave(ctx, duty) {
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) { re[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty); im[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty)); }
  return ctx.createPeriodicWave(re, im);
}

// ctx 用の音色セットを作る。tables は superSawTable の結果（AudioBuffer へ写す）
export function createInstruments(ctx, tables) {
  const saws = tables.map((t) => { const b = ctx.createBuffer(2, t.l.length, SR); b.getChannelData(0).set(t.l); b.getChannelData(1).set(t.r); return { base: t.base, buf: b }; });
  const pw = pulseWave(ctx, 0.3);
  const sawFor = (midi) => saws.reduce((a, b) => (Math.abs(b.base - midi) < Math.abs(a.base - midi) ? b : a));
  let lfo = null; // ビブラート用の共通 LFO（長いリードの音だけにつなぐ）
  const vibLfo = () => { if (!lfo) { lfo = ctx.createOscillator(); lfo.frequency.value = 5.6; lfo.start(); } return lfo; };

  // 音量エンベロープ（ADSR）。戻り値は止める時刻
  function adsr(g, t, dur, peak, d) {
    const p = g.gain, end = t + Math.max(dur, d.atk + 0.01);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + d.atk);
    p.setTargetAtTime(peak * d.sus, t + d.atk, d.dec / 3);
    p.setTargetAtTime(0, end, d.rel / 3);
    return end + d.rel * 2.2;
  }
  const VOICE = {
    // スーパーソー: 波形表のループを、高さに合わせた速さで再生
    saw(dest, t, dur, midi, vel, d) {
      const tab = sawFor(midi), s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = tab.buf; s.loop = true; s.playbackRate.value = 2 ** ((midi - tab.base) / 12);
      s.connect(g); g.connect(dest);
      const stop = adsr(g, t, dur, vel * 0.5, d);
      s.start(t, ((midi * 0.137 + t * 3.1) % 1) * 1.9); s.stop(stop);
      if (d.sub) { // 1 オクターブ下の矩形波で芯を足す
        const o = ctx.createOscillator(), og = ctx.createGain(); o.setPeriodicWave(pw); o.frequency.value = hz(midi - 12);
        o.connect(og); og.connect(dest); adsr(og, t, dur, vel * d.sub * 0.5, d); o.start(t); o.stop(stop);
      }
      if (d.vib && dur > 0.42 && s.detune) { // 長い音は遅れてビブラート
        const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + 0.16); vg.gain.linearRampToValueAtTime(d.vib, t + 0.4);
        vibLfo().connect(vg); vg.connect(s.detune); s.onended = () => { try { vg.disconnect(); } catch { /* 済 */ } };
      }
      return 2;
    },
    // ベース（S04）: サブ（正弦）＋ 上の層（のこぎり波＋矩形波）。
    // 上の層は「明るい音が素早く減り、丸い音が残る」音量エンベロープで、フィルターが閉じる動きを表す。
    // （1 音ごとにフィルターを動かすと係数の計算が重いので、ローパスは声部の出口に 1 個だけ置く → Quest でも軽い）
    bass(dest, t, dur, midi, vel) {
      const f = hz(midi), sub = ctx.createOscillator(), saw = ctx.createOscillator(), sq = ctx.createOscillator(), g = ctx.createGain(), sg = ctx.createGain(), bg = ctx.createGain(), qg = ctx.createGain();
      sub.frequency.value = f; saw.type = 'sawtooth'; saw.frequency.value = f; saw.detune.value = 7; sq.setPeriodicWave(pw); sq.frequency.value = f; sq.detune.value = -5;
      sg.gain.value = 0.5; qg.gain.value = 0.42;
      bg.gain.setValueAtTime(0.25 + 0.6 * vel, t); bg.gain.setTargetAtTime(0.28, t + 0.004, 0.07);
      sub.connect(sg); sg.connect(g); saw.connect(bg); bg.connect(g); sq.connect(qg); qg.connect(g); g.connect(dest);
      const stop = adsr(g, t, dur, vel * 0.55, { atk: 0.004, dec: 0.3, sus: 0.7, rel: 0.05 });
      for (const o of [sub, saw, sq]) { o.start(t); o.stop(stop); }
      return 3;
    },
    // プラック（S06 のアルペジオ・緊張の層）: 明るいのこぎり波が素早く減り、丸い矩形波が少し残る
    pluck(dest, t, dur, midi, vel, d) {
      const f = hz(midi), a = ctx.createOscillator(), b = ctx.createOscillator(), ag = ctx.createGain(), g = ctx.createGain();
      a.type = 'sawtooth'; a.frequency.value = f; b.setPeriodicWave(pw); b.frequency.value = f; b.detune.value = -9;
      ag.gain.setValueAtTime(1, t); ag.gain.setTargetAtTime(0.12, t + 0.003, d.tau * 0.5);
      a.connect(ag); ag.connect(g); b.connect(g); g.connect(dest);
      const p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(vel * 0.3, t + 0.003); p.setTargetAtTime(0, t + 0.003, d.tau);
      const stop = t + Math.max(dur, 0.03) + d.tau * 3; p.setTargetAtTime(0, t + Math.max(dur, 0.03), 0.015);
      a.start(t); b.start(t); a.stop(stop); b.stop(stop);
      return 2;
    },
    // FM ベル（S03）
    fm(dest, t, dur, midi, vel, d) {
      const f = hz(midi), c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      c.frequency.value = f; m.frequency.value = f * d.ratio;
      const k = Math.min(1, 1400 / f); // 高い音ほど変調を浅く（きつくならない・折り返さない）
      mg.gain.setValueAtTime(f * d.idx * k, t); mg.gain.setTargetAtTime(f * d.idx * k * 0.12, t, d.tau * 0.35);
      m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(dest);
      const p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(vel * 0.42, t + 0.003); p.setTargetAtTime(0, t + 0.003, d.tau);
      const end = t + Math.max(dur, 0.08); p.setTargetAtTime(0, end, 0.05);
      const stop = end + 0.25; c.start(t); m.start(t); c.stop(stop); m.stop(stop);
      return 2;
    },
  };
  return {
    // 1 音を予約する。inst は DEF の名前。発音を始めたノード数を返す（テスト・計測用）
    play(inst, dest, t, dur, midi, vel) { const d = DEF[inst] || DEF.lead; return VOICE[d.kind](dest, t, dur, midi, vel, d); },
    dispose() { if (lfo) { try { lfo.stop(); lfo.disconnect(); } catch { /* 済 */ } lfo = null; } },
  };
}
