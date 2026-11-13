// AEGIS RELAY — 旧チップ音源（設定「サウンド: クラシック」で使う。S30）
// 最初の版の音源をそのまま残したもの: 矩形波 3 声（デューティ 12.5/25/50%）＋ ノイズ 1 声、効果音用に矩形波 1・ノイズ 1。モノラル・エフェクトなし。
// 効果音が鳴っている間、曲の ch2（内声）と ch3（打楽器）は効果音に譲る。
// AudioContext・出力先・予約の時計は engine.js から受け取る（engine.js の pump() から schedule を呼ぶ）。
import { parseMML } from './mml.js';
import { SONGS } from './chip-songs.js';
import { SFX } from './chip-sfx.js';

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const volGain = (v) => (v <= 0 ? 0 : 10 ** ((v - 15) * 1.5 / 20)); // 1 段 1.5dB（16 段）

function pulseWave(ctx, duty) {
  const N = 64, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    re[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
    im[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// 15 bit LFSR のノイズ（長周期 = 白っぽい / 短周期 = 金属的）。録音ではなく計算で作る
function lfsrBuffer(ctx, short) {
  const sr = ctx.sampleRate, len = sr; const buf = ctx.createBuffer(1, len, sr); const d = buf.getChannelData(0);
  let reg = 0x7fff; const clock = 22000; let acc = 0, out = 1;
  for (let i = 0; i < len; i++) {
    acc += clock / sr;
    while (acc >= 1) { acc -= 1; const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1; reg = (reg >> 1) | (bit << 14); out = reg & 1 ? 1 : -1; }
    d[i] = out * 0.5;
  }
  return buf;
}

// 曲を「拍 → 秒」の音符列に変換し、ループ情報をそろえる
export function compileSong(song) {
  const spb = 60 / song.tempo;
  const tracks = song.tracks.map((tr) => {
    const p = parseMML(tr.mml);
    return { ch: tr.ch, notes: p.notes.map((n) => ({ ...n, t: n.t * spb, dur: n.dur * spb })), len: p.length * spb, loopAt: (p.loopAt ?? 0) * spb };
  });
  const drumNotes = []; const pat = song.drums?.loop || ''; const step16 = spb / 4;
  for (let i = 0; i < pat.length; i++) if (pat[i] !== '.') drumNotes.push({ t: i * step16, k: pat[i] });
  const len = Math.max(...tracks.map((t) => t.len), pat.length * step16);
  const loopAt = song.once ? null : Math.min(...tracks.map((t) => t.loopAt));
  return { tracks, drums: drumNotes, len, loopAt, once: !!song.once, spb };
}

export function createChip(ctx, busMusic, busSe, opts = {}) {
  const chGain = []; // 曲の各声部の音量（効果音に譲るときに 0）
  let music = null; // 再生中の曲 { name, comp, t0, nextIdx..., loopN }
  const seBusy = { tone: { until: 0, pri: -1, nodes: [] }, noise: { until: 0, pri: -1, nodes: [] } };
  const lastSe = {};
  for (let c = 0; c < 4; c++) { const g = ctx.createGain(); g.connect(busMusic); chGain.push(g); }
  const waves = [0.125, 0.25, 0.5, 0.375].map((d) => pulseWave(ctx, d));
  const noiseL = lfsrBuffer(ctx, false), noiseS = lfsrBuffer(ctx, true);

  // 1 音（矩形波）。アタック 2ms・リリース 12ms でクリックを防ぐ
  function tone(dest, t, dur, hz, gain, duty, opts = {}) {
    const o = ctx.createOscillator(); o.setPeriodicWave(waves[duty] || waves[1]);
    const g = ctx.createGain(); o.connect(g); g.connect(dest);
    o.frequency.setValueAtTime(hz, t);
    if (opts.sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), t + dur);
    if (opts.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = opts.vib[0]; lg.gain.value = hz * opts.vib[1]; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const decay = opts.decay ?? 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    if (decay > 0) g.gain.setTargetAtTime(gain * (opts.sustain ?? 0.5), t + 0.002, decay);
    g.gain.setValueAtTime(decay > 0 ? gain * (opts.sustain ?? 0.5) : gain, t + Math.max(0.004, dur - 0.012));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function noise(dest, t, dur, rate, gain, short, opts = {}) {
    const s = ctx.createBufferSource(); s.buffer = short ? noiseS : noiseL; s.loop = true;
    s.playbackRate.setValueAtTime(rate, t);
    if (opts.rateTo) s.playbackRate.exponentialRampToValueAtTime(Math.max(0.01, opts.rateTo), t + dur);
    const g = ctx.createGain(); s.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, opts.decay ?? dur / 3);
    g.gain.setValueAtTime(0.0001, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    return s;
  }

  // ── 曲 ──
  const AHEAD = 0.18;
  function schedule() {
    if (!music || !ctx) return;
    const until = ctx.currentTime + AHEAD;
    const c = music.comp;
    for (;;) {
      // ループ n 回目の基準時刻
      // 0 回目は先頭から。k 回目（k≥1）はループ位置以降を t0 + len + (k-1)(len-loopAt) から鳴らす
      const base = music.loopN === 0 ? music.t0 : music.t0 + c.len + (music.loopN - 1) * (c.len - c.loopAt) - c.loopAt;
      let pending = false;
      for (const tr of c.tracks) {
        const idxKey = 'i' + tr.ch;
        while (music[idxKey] < tr.notes.length) {
          const n = tr.notes[music[idxKey]];
          const at = base + n.t;
          if (at > until) { pending = true; break; }
          if (at + n.dur > ctx.currentTime) {
            const g = n.gate / 8;
            tone(chGain[tr.ch], Math.max(at, ctx.currentTime), n.dur * g, midiHz(n.midi), volGain(n.vol) * 0.32, n.duty, { decay: tr.ch === 1 ? 0.12 : 0.25, sustain: tr.ch === 0 ? 0.75 : 0.55 });
          }
          music[idxKey]++;
        }
        if (music[idxKey] < tr.notes.length) pending = true;
      }
      while (music.iD < c.drums.length) {
        const d = c.drums[music.iD]; const at = base + d.t;
        if (at > until) { pending = true; break; }
        if (at > ctx.currentTime - 0.01) {
          const t = Math.max(at, ctx.currentTime);
          if (d.k === 'k') noise(chGain[3], t, 0.09, 0.25, 0.3, false, { rateTo: 0.08, decay: 0.03 });
          else if (d.k === 's') noise(chGain[3], t, 0.12, 1.0, 0.22, false, { decay: 0.04 });
          else noise(chGain[3], t, 0.03, 2.2, 0.08, true, { decay: 0.01 });
        }
        music.iD++;
      }
      if (music.iD < c.drums.length) pending = true;
      if (pending) return;
      const endAt = base + c.len;
      if (c.once) { if (ctx.currentTime > endAt) { const cb = music.onEnd; music = null; cb && cb(); } return; }
      // 次のループへ: ループ位置より後の音符から
      music.loopN++;
      for (const tr of c.tracks) music['i' + tr.ch] = tr.notes.findIndex((n) => n.t >= c.loopAt - 1e-6);
      music.iD = Math.max(0, c.drums.findIndex((n) => n.t >= c.loopAt - 1e-6));
      if (endAt > until) return;
    }
  }
  const compiled = {};
  function playMusic(name, onEnd) {
    if (music && music.name === name && !SONGS[name].once) return; // 同じ曲は二重に始めない
    stopMusic();
    const comp = compiled[name] || (compiled[name] = compileSong(SONGS[name]));
    music = { name, comp, t0: ctx.currentTime + 0.05, loopN: 0, iD: 0, onEnd };
    for (const tr of comp.tracks) music['i' + tr.ch] = 0;
    for (const g of chGain) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(1, ctx.currentTime); }
    schedule();
  }
  function stopMusic() {
    music = null;
    // 予約済みの音は短くフェードして止める（声部の音量を一瞬 0 → 次の曲の頭で 1）
    for (const g of chGain) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, 0.008); }
    // 先読み分（最大 AHEAD 秒）を確実に切るため、声部ゲインを差し替える
    for (let c = 0; c < 4; c++) { const old = chGain[c]; setTimeout(() => old.disconnect(), 80); const g = ctx.createGain(); g.connect(busMusic); chGain[c] = g; }
  }

  // ── 効果音 ──
  // SFX[name] = { lane: 'tone'|'noise'|'both', pri, minGap(ms), play(api, t) }
  function se(name, arg) {
    if (ctx.state !== 'running' && !opts.offline) return;
    const d = SFX[name]; if (!d) return;
    const now = ctx.currentTime, nowMs = now * 1000;
    if (lastSe[name] != null && nowMs - lastSe[name] < (d.minGap ?? 30)) return; // 同じ音の二重発音を防ぐ
    const lanes = d.lane === 'both' ? ['tone', 'noise'] : [d.lane];
    for (const ln of lanes) { const L = seBusy[ln]; if (now < L.until && d.pri < L.pri) return; } // 優先度の低い音は鳴らさない
    lastSe[name] = nowMs;
    for (const ln of lanes) { const L = seBusy[ln]; for (const n of L.nodes) { try { n.stop(); } catch { /* 済 */ } } L.nodes = []; }
    const api = {
      tone: (t, dur, hz, g, duty, o) => { const n = tone(busSe, now + t, dur, hz, g * 0.32, duty, o); seBusy.tone.nodes.push(n); },
      noise: (t, dur, rate, g, short, o) => { const n = noise(busSe, now + t, dur, rate, g * 0.4, short, o); seBusy.noise.nodes.push(n); },
    };
    d.play(api, arg);
    const len = d.len;
    for (const ln of lanes) { seBusy[ln].until = now + len; seBusy[ln].pri = d.pri; }
    // 曲の声部を譲る（ch2 ← 矩形波の効果音、ch3 ← ノイズの効果音）
    const duck = (ch) => { const g = chGain[ch].gain; g.cancelScheduledValues(now); g.setTargetAtTime(0, now, 0.004); g.setTargetAtTime(1, now + len, 0.01); };
    if (lanes.includes('tone')) duck(2);
    if (lanes.includes('noise')) duck(3);
  }

  return { playMusic, stopMusic, se, pump: schedule, get musicName() { return music?.name || null; } };
}
