// Sky Climber VR — モダン音源の合成（OfflineAudioContext で事前にレンダリングして完成音源にする）。
// 曲: ステム（drums / perc / bass / chords / lead / tension）ごとにステレオのループを作る。余韻はループの頭へ折り返して継ぎ目をなくす。
// 効果音: 層を重ねた合成（打撃＝低音の胴鳴り＋ノイズ＋倍音、摩擦＝帯域ノイズ、金属＝非整数倍音）。変化違い（ラウンドロビン）つき。
// 録音・外部素材は使わない。聴感の確認はできていない（解析のみ）— docs/SOUND.md。
import { MODERN_SONGS, CHORD, STEMS } from './modern-songs.js';
import { parseMML } from './psg.js';

const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
export const canRenderModern = () => !!OAC;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let _seed = 12345; const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };

// ---------- 共通の部品 ----------
function noiseBuffer(ctx, sec = 2) { const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; return b; }
function impulse(ctx, sec = 1.8, decay = 3.2, bright = 0.6) { // 自作のリバーブ用インパルス（減衰するノイズ、高域は速く消える）
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n, w = (rnd() * 2 - 1) * Math.pow(1 - t, decay); lp += (w - lp) * (bright * (1 - t) + 0.05); d[i] = lp * (i < 200 ? i / 200 : 1); } }
  return b;
}
function mk(ctx) {
  const N = noiseBuffer(ctx);
  const K = {
    ctx, N,
    gain(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; },
    pan(p, dest) { const n = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (n.pan) n.pan.value = p; if (dest) n.connect(dest); return n; },
    filt(type, f, q, dest) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (dest) n.connect(dest); return n; },
    osc(type, f, t0, t1, dest, detune = 0) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(dest); o.start(t0); o.stop(t1); return o; },
    noise(t0, t1, dest, rate = 1) { const s = ctx.createBufferSource(); s.buffer = N; s.loop = true; s.playbackRate.value = rate; s.connect(dest); s.start(t0, rnd() * 1.5); s.stop(t1); return s; },
    // 音量の包絡: a 秒で peak、d 秒で sus へ、end で 0
    env(g, t, a, peak, d, sus, end) { const p = g.gain; p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d); p.setValueAtTime(Math.max(0.0001, sus), Math.max(t + a + d, end - 0.03)); p.linearRampToValueAtTime(0.0001, end); },
    perc(g, t, peak, dec) { const p = g.gain; p.setValueAtTime(peak, t); p.exponentialRampToValueAtTime(0.0001, t + dec); },
  };
  return K;
}
// ---------- ドラム ----------
function kick(K, dest, t, v = 1, deep = 1) {
  const g = K.gain(0, dest); K.perc(g, t, v, 0.34 * deep);
  const o = K.osc('sine', 150, t, t + 0.4 * deep, g); o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
  const c = K.gain(0, dest); K.perc(c, t, v * 0.5, 0.012); K.noise(t, t + 0.02, K.filt('highpass', 2500, 0.7, c));
}
function snare(K, dest, t, v = 1, long = 0.18) {
  const g = K.gain(0, dest); K.perc(g, t, v * 0.8, long); K.noise(t, t + long + 0.02, K.filt('bandpass', 1900, 0.6, g));
  const g2 = K.gain(0, dest); K.perc(g2, t, v * 0.6, 0.09); const o = K.osc('triangle', 200, t, t + 0.12, g2); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
}
function hat(K, dest, t, v = 0.4, open = false) { const g = K.gain(0, dest); K.perc(g, t, v, open ? 0.24 : 0.045); K.noise(t, t + (open ? 0.26 : 0.06), K.filt('highpass', open ? 6500 : 8500, 0.8, g), 1.6); }
function clap(K, dest, t, v = 0.6) { const f = K.filt('bandpass', 1300, 1.1, dest); for (const [dt, a] of [[0, 0.7], [0.011, 0.8], [0.023, 1]]) { const g = K.gain(0, f); K.perc(g, t + dt, v * a, dt > 0.02 ? 0.16 : 0.012); K.noise(t + dt, t + dt + 0.2, g); } }
function shaker(K, dest, t, v = 0.12) { const g = K.gain(0, dest); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); K.noise(t, t + 0.07, K.filt('bandpass', 6000, 1.5, g), 1.3); }
function tom(K, dest, t, f = 140, v = 0.8) { const g = K.gain(0, dest); K.perc(g, t, v, 0.28); const o = K.osc('sine', f, t, t + 0.3, g); o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); }
// ---------- 楽器 ----------
function bassNote(K, dest, t, dur, midi, inst, from) {
  const f = mtof(midi), end = t + dur;
  if (inst === 'sub') { const g = K.gain(0, dest); K.env(g, t, 0.008, 0.9, 0.12, 0.6, end); const o = K.osc('sine', f, t, end + 0.02, g); const g2 = K.gain(0, dest); K.env(g2, t, 0.005, 0.25, 0.1, 0.08, end); K.osc('triangle', f * 2, t, end + 0.02, g2); if (from) { o.frequency.setValueAtTime(mtof(from), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); } return; }
  if (inst === 'reese') { const lp = K.filt('lowpass', 500, 4, dest); lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(300, end); const g = K.gain(0, lp); K.env(g, t, 0.01, 0.55, 0.1, 0.5, end);
    for (const d of [-18, 0, 17]) { const o = K.osc('sawtooth', f, t, end + 0.02, g, d); if (from) { o.frequency.setValueAtTime(mtof(from), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); } } K.osc('sine', f / 2, t, end + 0.02, K.gain(0.5, g)); return; }
  // pluck（スラップ風）・saw（シンセウェーブの 8 分）
  const lp = K.filt('lowpass', 300, inst === 'pluck' ? 7 : 3, dest); lp.frequency.setValueAtTime(inst === 'pluck' ? 2600 : 1400, t); lp.frequency.exponentialRampToValueAtTime(inst === 'pluck' ? 260 : 420, t + (inst === 'pluck' ? 0.14 : 0.22));
  const g = K.gain(0, lp); K.env(g, t, 0.004, 0.7, 0.1, inst === 'pluck' ? 0.35 : 0.5, end);
  const o = K.osc('sawtooth', f, t, end + 0.02, g); K.osc('square', f, t, end + 0.02, K.gain(0.4, g), -5);
  if (from) { o.frequency.setValueAtTime(mtof(from), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
}
function epiano(K, dest, t, dur, midi, v = 0.3, pan = 0, tick = true) { // FM のエレピ（搬送波＋減衰する変調）
  const f = mtof(midi), end = t + Math.max(dur, 0.35) + 0.5, p = K.pan(pan, dest), g = K.gain(0, p); K.env(g, t, 0.004, v, 0.5, v * 0.25, end);
  const c = K.osc('sine', f, t, end, g); const mg = K.gain(0, c.frequency); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35); K.osc('sine', f, t, end, mg);
  if (tick) { const tg = K.gain(0, p); K.perc(tg, t, v * 0.25, 0.08); K.osc('sine', f * 14, t, t + 0.1, tg); } // 打鍵の金属音
}
function bell(K, dest, t, dur, midi, v = 0.3, pan = 0) { // FM のベル（リード用）
  const f = mtof(midi), end = t + dur + 0.6, p = K.pan(pan, dest), g = K.gain(0, p); K.env(g, t, 0.003, v, 0.3, v * 0.35, end);
  const c = K.osc('sine', f, t, end, g); const mg = K.gain(0, c.frequency); mg.gain.setValueAtTime(f * 3.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.3, t + 0.5); K.osc('sine', f * 3.5, t, end, mg);
  K.osc('triangle', f, t, end, K.gain(0.35, g));
}
function pluck(K, dest, t, dur, midi, v = 0.3, pan = 0) {
  const f = mtof(midi), end = t + Math.max(0.2, dur), p = K.pan(pan, dest), lp = K.filt('lowpass', 800, 5, p); lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
  const g = K.gain(0, lp); K.env(g, t, 0.003, v, 0.15, v * 0.2, end + 0.1); for (const d of [-9, 9]) K.osc('sawtooth', f, t, end + 0.12, g, d);
}
function lead(K, dest, t, dur, midi, v = 0.26) { // スーパーソーのリード（遅れてかかるビブラート）
  const f = mtof(midi), end = t + dur, lp = K.filt('lowpass', 3200, 1.2, dest); lp.frequency.setValueAtTime(1400, t); lp.frequency.linearRampToValueAtTime(3800, t + 0.12);
  const g = K.gain(0, lp); K.env(g, t, 0.02, v, 0.15, v * 0.8, end + 0.08);
  const lfo = K.ctx.createOscillator(); lfo.frequency.value = 5.6; const lg = K.gain(0); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + Math.min(0.25, dur * 0.5)); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.6, dur)); lfo.connect(lg); lfo.start(t); lfo.stop(end + 0.1);
  for (const [d, pn] of [[-13, -0.6], [0, 0], [13, 0.6]]) { const o = K.osc('sawtooth', f, t, end + 0.1, K.pan(pn, g), d); lg.connect(o.detune); }
  K.osc('square', f / 2, t, end + 0.1, K.gain(0.25, g));
}
function padChord(K, dest, t, dur, notes, v = 0.1, bright = 1800) {
  const end = t + dur, lp = K.filt('lowpass', bright, 0.8, dest); lp.frequency.setValueAtTime(bright * 0.5, t); lp.frequency.linearRampToValueAtTime(bright, t + dur * 0.6); lp.frequency.linearRampToValueAtTime(bright * 0.6, end);
  const g = K.gain(0, lp); K.env(g, t, 0.25, v, 0.4, v * 0.85, end + 0.3);
  notes.forEach((m, i) => { for (const [d, pn] of [[-9, -0.7], [8, 0.7]]) K.osc('sawtooth', mtof(m), t, end + 0.32, K.pan(pn * (i % 2 ? 1 : -1), g), d); });
  return g;
}
function stab(K, dest, t, dur, notes, v = 0.12) { const end = t + dur, lp = K.filt('lowpass', 4000, 2, dest); lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25); const g = K.gain(0, lp); K.env(g, t, 0.004, v, 0.2, v * 0.15, end);
  notes.forEach((m) => { for (const [d, pn] of [[-12, -0.6], [0, 0], [12, 0.6]]) K.osc('sawtooth', mtof(m + 12), t, end + 0.02, K.pan(pn, g), d); }); }

// ---------- 曲のステムを作る ----------
function stepTime(song, bar, step) { const s16 = 60 / song.bpm / 4; return (bar * 16 + step) * s16 + (step % 2 ? (song.swing || 0) * s16 : 0); }
function kickTimes(song) { const out = []; for (let b = 0; b < song.bars; b++) { const p = song.drums.kick || ''; for (let i = 0; i < 16; i++) if (p[i] === 'x') out.push(stepTime(song, b, i)); } return out; }
function buildStem(K, song, stem, out) {
  const ctx = K.ctx, s16 = 60 / song.bpm / 4, bar = s16 * 16, len = song.bars * bar, st = song.style;
  // 空間系: テンポ同期のディレイ（付点 8 分）はステムに焼き込む
  // 残響は実行時に 1 つの畳み込みリバーブへステムごとの量で送る（audio.js の STEM_SEND）。ここでは焼き込まない（レンダリングを速くするため）
  const dl = ctx.createDelay(1.5); dl.delayTime.value = s16 * 3; const fb = K.gain(0.34); dl.connect(fb); fb.connect(dl); const dlp = K.filt('lowpass', 2800, 0.5, K.gain(0.3, out)); dl.connect(dlp);
  // サイドチェイン: キックのたびに音量を下げて戻す（ポンピング）
  const duck = K.gain(1, out); const sc = song.sidechain || 0;
  if (sc) for (const t of kickTimes(song)) { duck.gain.setValueAtTime(1 - sc, Math.max(0, t - 0.002)); duck.gain.linearRampToValueAtTime(1, t + s16 * 3.2); }
  const D = song.drums;
  const each = (pat, fn) => { for (let b = 0; b < song.bars; b++) { const p = Array.isArray(pat) ? pat[b % pat.length] : pat; if (!p) continue; for (let i = 0; i < 16; i++) if (p[i] === 'x') fn(stepTime(song, b, i), b, i); } };
  if (stem === 'drums') {
    const bus = K.gain(0.9, out);
    each(D.kick, (t) => kick(K, bus, t, 1, st === 'house' ? 1.1 : 1));
    each(D.snare, (t) => snare(K, bus, t, 0.85, st === 'synthwave' ? 0.3 : 0.17));
    each(D.hat, (t, b, i) => hat(K, K.pan(0.25, bus), t, (i % 4 === 0 ? 0.3 : 0.2) * (st === 'lofi' ? 0.6 : 1)));
    if (st === 'house') each(D.clap, (t) => clap(K, bus, t, 0.6));
    if (D.ghost) each(D.ghost, (t) => snare(K, bus, t, 0.22, 0.07));
    if (song.vinyl) { const g = K.gain(0.02, out); K.noise(0, len + 0.5, K.filt('bandpass', 3500, 0.4, g)); for (let i = 0; i < song.bars * 6; i++) { const t = rnd() * len, cg = K.gain(0, out); K.perc(cg, t, 0.12 * rnd(), 0.004); K.noise(t, t + 0.01, K.filt('highpass', 3000, 1, K.pan(rnd() * 2 - 1, cg))); } }
  } else if (stem === 'perc') {
    const bus = K.gain(0.8, out);
    each(D.shaker || 'x.x.x.x.x.x.x.x.', (t, b, i) => shaker(K, K.pan(-0.4, bus), t, i % 4 === 2 ? 0.16 : 0.09));
    each(D.ohat || '..x...x...x...x.', (t) => hat(K, K.pan(0.35, bus), t, 0.22, true));
    if (st !== 'house') each(D.clap || '....x.......x...', (t) => clap(K, bus, t, 0.45));
    each(D.tom || [null, null, null, null, null, null, null, '..........x.x.xx'], (t, b, i) => tom(K, K.pan((i - 12) * 0.2, bus), t, 190 - (i - 10) * 14, 0.7));
    // 4 小節ごとの逆再生風の吸い込み（次の小節へのつなぎ）
    for (let b = 3; b < song.bars; b += 4) { const t0 = (b + 0.5) * bar, t1 = (b + 1) * bar, g = K.gain(0, bus); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t1 - 0.01); g.gain.linearRampToValueAtTime(0.0001, t1); const f = K.filt('bandpass', 800, 1.2, g); f.frequency.setValueAtTime(600, t0); f.frequency.exponentialRampToValueAtTime(7000, t1); K.noise(t0, t1, f); }
  } else if (stem === 'bass') {
    const bus = K.gain(0.75, duck); let prev = null;
    for (let b = 0; b < song.bars; b++) { const root = song.chords[b][0] - 12 - (song.chords[b][0] > 52 ? 12 : 0); for (const [step, n, off] of song.bass) { const m = root + off; bassNote(K, bus, stepTime(song, b, step), n * s16 * 0.92, m, song.bassInst, prev != null && prev !== m && step === 0 ? prev : null); prev = m; } }
  } else if (stem === 'chords') {
    const bus = K.gain(1, duck);
    const arpBus = K.gain(1, bus); arpBus.connect(K.gain(0.4, dl));
    for (let b = 0; b < song.bars; b++) {
      const [root, type] = song.chords[b], notes = CHORD[type].map((x) => root + x + (root < 50 ? 12 : 0));
      if (song.chordInst === 'pad') padChord(K, bus, b * bar, bar, notes, 0.07, st === 'synthwave' ? 2200 : 1500 + 600 * (b % 4) / 3);
      const p = song.chordRhythm;
      if (song.chordInst !== 'pad') for (let i = 0; i < 16; i++) if (p[i] === 'x') {
        const t = stepTime(song, b, i);
        if (song.chordInst === 'epiano') notes.forEach((m, k) => epiano(K, bus, t + k * 0.008, s16 * 2.5, m, 0.13, (k - 1.5) * 0.3, false));
        else stab(K, bus, t, s16 * 3, notes, 0.09);
      }
      // 16 分のアルペジオ（シンセウェーブ）
      if (song.arp) for (let i = 0; i < 16; i++) { const m = notes[[0, 1, 2, 1][i % 4]] + 12, t = stepTime(song, b, i); pluck(K, arpBus, t, s16 * 0.9, m, 0.07, i % 2 ? 0.5 : -0.5); }
    }
  } else if (stem === 'lead') {
    const bus = K.gain(1, out); bus.connect(K.gain(song.leadInst === 'lead' ? 0.25 : 0.3, dl)); // 旋律はディレイへ送る
    const ev = parseMML(song.lead, song.bpm).events, fn = { bell, pluck, lead }[song.leadInst] || lead;
    for (const e of ev) { if (song.leadInst === 'lead') lead(K, bus, e.t, e.gate, e.midi, 0.2); else fn(K, bus, e.t, e.gate, e.midi, 0.3, 0.15); }
  } else if (stem === 'tension') {
    // 緊張の層: 根音と 5 度の 16 分の刻み（高域）と、低いうなり。片手のとき・危険が近いときだけ重ねる
    const bus = K.gain(1, out);
    for (let b = 0; b < song.bars; b++) { const root = song.chords[b][0] + 24; for (let i = 0; i < 16; i++) { const t = stepTime(song, b, i), m = root + (i % 4 === 2 ? 7 : i % 8 === 5 ? 12 : 0); pluck(K, bus, t, s16 * 0.7, m, i % 4 === 0 ? 0.11 : 0.06, i % 2 ? 0.6 : -0.6); }
      const g = K.gain(0, bus); K.env(g, b * bar, 0.3, 0.16, 0.2, 0.14, (b + 1) * bar + 0.05); const lp = K.filt('lowpass', 220, 3, g); const o = K.osc('sawtooth', mtof(song.chords[b][0] - 12), b * bar, (b + 1) * bar + 0.1, lp); const trem = K.ctx.createOscillator(); trem.frequency.value = 60 / song.bpm * 8; const tg = K.gain(60, lp.frequency); trem.connect(tg); trem.start(b * bar); trem.stop((b + 1) * bar + 0.1); void o; }
  }
  return len;
}
// 余韻をループの頭へ折り返す（継ぎ目で音が切れない）
function fold(buf, loopLen) { const n = Math.round(loopLen * buf.sampleRate), ch = buf.numberOfChannels, out = []; for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c), o = new Float32Array(n); o.set(d.subarray(0, n)); for (let i = n; i < d.length; i++) o[(i - n) % n] += d[i]; out.push(o); } return out; }
const peakOf = (arrs) => { let p = 0; for (const a of arrs) for (let i = 0; i < a.length; i += 3) { const v = Math.abs(a[i]); if (v > p) p = v; } return p; };

// 1 曲ぶんのステムをレンダリング。戻り値: { stems: { 名前: [L, R] }, length（秒）, sampleRate, ms }
export async function renderModernSong(name, sampleRate = 44100) {
  const song = MODERN_SONGS[name]; if (!song || !OAC) return null;
  const t0 = performance.now(), loopLen = song.bars * 16 * (60 / song.bpm / 4), tail = 2.0, stems = {};
  // ステムは同時にレンダリングする（OfflineAudioContext は別スレッドで動くので、複数コアを使える）
  await Promise.all(STEMS.map(async (stem) => {
    _seed = 1000 + stem.length * 77 + name.length;
    const ctx = new OAC(2, Math.ceil((loopLen + tail) * sampleRate), sampleRate), K = mk(ctx);
    buildStem(K, song, stem, ctx.destination);
    stems[stem] = fold(await ctx.startRendering(), loopLen);
  }));
  // ラウドネス合わせ: 全ステムを重ねたときの最大値が 0.82 になるように全体を同じ倍率で調整
  const n = stems.drums[0].length, mix = [new Float32Array(n), new Float32Array(n)];
  for (const s of STEMS) for (let c = 0; c < 2; c++) { const d = stems[s][c], m = mix[c]; for (let i = 0; i < n; i++) m[i] += d[i]; }
  let pk = 0; for (const m of mix) for (let i = 0; i < n; i++) { const v = Math.abs(m[i]); if (v > pk) pk = v; }
  const k = 0.82 / (pk || 1); for (const s of STEMS) for (const d of stems[s]) for (let i = 0; i < n; i++) d[i] *= k;
  return { stems, length: n / sampleRate, sampleRate, ms: performance.now() - t0, bpm: song.bpm, bars: song.bars };
}

// 短い曲（ジングル）: 既存の自作の旋律（music.js の MML）をモダンな音色で鳴らし直す。a=ベル/リード、b=エレピ、c=ベース、ドラム=合成キット
export async function renderModernJingle(retroSong, sampleRate = 44100) {
  if (!OAC) return null;
  const tracks = retroSong.tracks.map((tr) => ({ ...tr, ...parseMML(tr.mml, retroSong.bpm) }));
  const len = Math.max(...tracks.map((t) => t.length)), tail = 2.2;
  const ctx = new OAC(2, Math.ceil((len + tail) * sampleRate), sampleRate), K = mk(ctx); _seed = 4242 + retroSong.id.length;
  const out = K.gain(1, ctx.destination), rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 1.8, 3); rev.connect(K.gain(0.4, out));
  const slow = retroSong.bpm < 110;
  for (const tr of tracks) for (const e of tr.events) {
    const t = e.t + 0.01, d = e.gate, m = e.midi + (retroSong.transpose || 0);
    if (tr.drums) { if (e.inst === 'kick') kick(K, out, t, 0.9); else if (e.inst === 'hat') hat(K, out, t, 0.25); else { snare(K, out, t, 0.6); snare(K, K.gain(0.4, rev), t, 0.5); } }
    else if (tr.ch === 'a') { if (slow) { lead(K, out, t, d, m, 0.2); lead(K, rev, t, d, m, 0.08); } else { bell(K, out, t, d, m, 0.34, 0.1); bell(K, rev, t, d, m, 0.14, 0); pluck(K, out, t, d, m + 12, 0.08, -0.4); } }
    else if (tr.ch === 'b') { epiano(K, out, t, d, m, 0.16, 0.4); epiano(K, rev, t, d, m, 0.06, 0); }
    else bassNote(K, K.gain(0.7, out), t, Math.max(0.08, d), m, 'pluck');
  }
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.8 / (pk || 1); for (let i = 0; i < L.length; i++) { L[i] *= k; R[i] *= k; }
  return { L, R, sampleRate, length: L.length / sampleRate };
}

// ---------- 効果音 ----------
// レシピ: (K, out, v=変化違いの番号) => 長さ（秒）。level は正規化後の最大値、loop はループ素材
const modal = (K, out, t, partials, v = 0.4) => { for (const [f, dec, a] of partials) { const g = K.gain(0, out); K.perc(g, t, v * a, dec); K.osc('sine', f, t, t + dec + 0.02, g); } };
const thump = (K, out, t, f0, f1, v, dec) => { const g = K.gain(0, out); K.perc(g, t, v, dec); const o = K.osc('sine', f0, t, t + dec + 0.02, g); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec * 0.6); };
const burst = (K, out, t, type, f, q, v, dec, rate = 1) => { const g = K.gain(0, out); K.perc(g, t, v, dec); K.noise(t, t + dec + 0.02, K.filt(type, f, q, g), rate); };
const sweep = (K, out, t, dur, f0, f1, q, v, shape = 0.3) => { const g = K.gain(0, out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * shape); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); const f = K.filt('bandpass', f0, q, g); f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); K.noise(t, t + dur + 0.02, f); };
export const MODERN_SFX = {
  // 手を伸ばす: 空気を切るウーシュ
  reach: { n: 3, level: 0.45, f: (K, o, v) => { sweep(K, o, 0, 0.16, 500 + v * 150, 2600 + v * 400, 1.4, 0.8, 0.45); return 0.2; } },
  // つかむ（素材別）: 石の窓台＝低い胴鳴り＋ざらつき、金属＝非整数倍音、鉄骨＝低く長い響き、コンクリート＝鈍い音
  grab_stone: { n: 3, level: 0.7, f: (K, o, v) => { thump(K, o, 0, 190 - v * 15, 90, 0.9, 0.09); burst(K, o, 0, 'bandpass', 2400 + v * 300, 0.8, 0.5, 0.035); burst(K, o, 0.004, 'lowpass', 700, 0.7, 0.4, 0.07); return 0.16; } },
  grab_metal: { n: 3, level: 0.6, f: (K, o, v) => { const d = 1 + v * 0.045; modal(K, o, 0, [[830 * d, 0.22, 1], [1930 * d, 0.16, 0.6], [3120 * d, 0.1, 0.4], [4480 * d, 0.06, 0.25]], 0.5); thump(K, o, 0, 220, 120, 0.6, 0.05); burst(K, o, 0, 'highpass', 4000, 0.7, 0.3, 0.015); return 0.3; } },
  grab_steel: { n: 3, level: 0.65, f: (K, o, v) => { const d = 1 + v * 0.04; modal(K, o, 0, [[412 * d, 0.45, 1], [1012 * d, 0.3, 0.5], [1690 * d, 0.2, 0.35], [2540 * d, 0.12, 0.2]], 0.5); thump(K, o, 0, 150, 70, 0.8, 0.08); return 0.5; } },
  grab_concrete: { n: 3, level: 0.7, f: (K, o, v) => { thump(K, o, 0, 130 - v * 8, 60, 1, 0.12); burst(K, o, 0, 'lowpass', 1200, 0.6, 0.5, 0.05); burst(K, o, 0.01, 'bandpass', 3200, 1, 0.2, 0.06); return 0.2; } },
  // 窓: サッシがカタカタ鳴る予告、閉まる衝撃とガラスの震え、開く摺動
  windowWarn: { n: 2, level: 0.6, f: (K, o, v) => { for (let i = 0; i < 9; i++) { const t = i * 0.052 + (i % 2) * 0.008; burst(K, o, t, 'bandpass', 1100 + (i % 3) * 260 + v * 120, 2.5, 0.7 - i * 0.03, 0.022); thump(K, o, t, 300, 180, 0.25, 0.02); } const g = K.gain(0, o); K.env(g, 0, 0.05, 0.12, 0.1, 0.1, 0.48); const os = K.osc('sawtooth', 620, 0, 0.5, K.filt('bandpass', 1500, 6, g)); os.frequency.linearRampToValueAtTime(760 + v * 60, 0.45); return 0.52; } },
  windowClose: { n: 2, level: 0.85, f: (K, o, v) => { thump(K, o, 0, 110, 48, 1, 0.22); burst(K, o, 0, 'lowpass', 1600, 0.6, 0.9, 0.07); modal(K, o, 0.01, [[2350 + v * 90, 0.3, 0.4], [3470, 0.22, 0.3], [5210, 0.15, 0.2]], 0.3); for (let i = 0; i < 5; i++) burst(K, o, 0.05 + i * 0.03, 'highpass', 5000, 1, 0.12 - i * 0.02, 0.012); return 0.45; } },
  windowOpen: { n: 1, level: 0.4, f: (K, o) => { sweep(K, o, 0, 0.26, 900, 2400, 3, 0.6, 0.3); thump(K, o, 0.24, 240, 150, 0.5, 0.04); return 0.32; } },
  // 落下物: 風を切る下降音（口笛のような成分＋空気の音）
  dropFall: { n: 1, level: 0.55, f: (K, o) => { const g = K.gain(0, o); K.env(g, 0, 0.06, 0.5, 0.2, 0.4, 0.95); const os = K.osc('sine', 1700, 0, 1, g); os.frequency.setValueAtTime(1750, 0); os.frequency.exponentialRampToValueAtTime(520, 0.95); const l = K.ctx.createOscillator(); l.frequency.value = 9; const lg = K.gain(25, os.detune); l.connect(lg); l.start(0); l.stop(1); sweep(K, o, 0, 0.95, 3000, 700, 2, 0.35, 0.5); return 1.0; } },
  // 割れる（素材別）
  break_pot: { n: 2, level: 0.8, f: (K, o, v) => { thump(K, o, 0, 220, 90, 0.8, 0.08); burst(K, o, 0, 'bandpass', 2600, 0.7, 0.9, 0.09); for (let i = 0; i < 14; i++) { const t = 0.01 + rnd() * 0.3; modal(K, o, t, [[1800 + rnd() * 4200 + v * 100, 0.03 + rnd() * 0.06, 1]], 0.22 * (1 - t * 2)); } burst(K, o, 0.05, 'lowpass', 900, 0.6, 0.3, 0.25); return 0.5; } },
  break_can: { n: 2, level: 0.7, f: (K, o, v) => { for (const [t, a] of [[0, 1], [0.13, 0.55], [0.22, 0.32], [0.28, 0.18]]) { modal(K, o, t, [[1240 + v * 60, 0.09, 1], [2710, 0.07, 0.7], [4150, 0.05, 0.5], [6900, 0.03, 0.3]], 0.4 * a); burst(K, o, t, 'highpass', 3500, 0.8, 0.4 * a, 0.02); } return 0.45; } },
  break_bucket: { n: 2, level: 0.8, f: (K, o, v) => { modal(K, o, 0, [[310 + v * 15, 0.4, 1], [742, 0.28, 0.6], [1335, 0.18, 0.4]], 0.5); thump(K, o, 0, 160, 70, 0.7, 0.1); const g = K.gain(0, o); g.gain.setValueAtTime(0.0001, 0.01); g.gain.linearRampToValueAtTime(0.8, 0.05); g.gain.exponentialRampToValueAtTime(0.0001, 0.6); const f = K.filt('lowpass', 5000, 0.7, g); f.frequency.setValueAtTime(6000, 0.02); f.frequency.exponentialRampToValueAtTime(500, 0.6); K.noise(0.01, 0.62, f); for (let i = 0; i < 8; i++) { const t = 0.1 + rnd() * 0.4; thump(K, o, t, 900 + rnd() * 900, 400, 0.12, 0.03); } return 0.7; } },
  break_bottle: { n: 2, level: 0.8, f: (K, o, v) => { burst(K, o, 0, 'highpass', 4500, 0.8, 1, 0.07); thump(K, o, 0, 400, 200, 0.4, 0.03); for (let i = 0; i < 22; i++) { const t = rnd() * 0.42; modal(K, o, t, [[3200 + rnd() * 7000 + v * 150, 0.02 + rnd() * 0.08, 1]], 0.2 * (1 - t * 1.6)); } burst(K, o, 0.06, 'bandpass', 7000, 2, 0.25, 0.3); return 0.55; } },
  // カモメの声（鼻にかかった「キャー」を 3 回）と羽音
  birdCall: { n: 2, level: 0.6, f: (K, o, v) => { for (let k = 0; k < 3; k++) { const t = k * 0.24, d = 0.2 - k * 0.02, g = K.gain(0, o); K.env(g, t, 0.02, 0.6 - k * 0.1, 0.05, 0.4, t + d); const f1 = K.filt('bandpass', 2300, 5, g), f2 = K.filt('bandpass', 3400, 7, g); const os = K.ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(820 + v * 60, t); os.frequency.linearRampToValueAtTime(1350 + v * 80, t + d * 0.35); os.frequency.linearRampToValueAtTime(900, t + d); os.connect(f1); os.connect(f2); os.start(t); os.stop(t + d + 0.02); const n = K.gain(0.12, f1); K.noise(t, t + d, n); } return 0.75; } },
  flap: { n: 3, level: 0.4, f: (K, o, v) => { for (let i = 0; i < 3; i++) { const t = i * 0.085; sweep(K, o, t, 0.07, 500 + v * 80, 180, 0.9, 0.8 - i * 0.15, 0.25); } return 0.3; } },
  // ネオン: 帯電のうなり（電源のハムとパチパチ）、放電
  buzz: { n: 1, level: 0.5, f: (K, o) => { const g = K.gain(0, o); K.env(g, 0, 0.1, 0.5, 0.1, 0.5, 0.7); const lp = K.filt('lowpass', 1800, 2, g); K.osc('sawtooth', 100, 0, 0.72, lp); K.osc('square', 50, 0, 0.72, K.gain(0.5, lp)); const am = K.ctx.createOscillator(); am.type = 'square'; am.frequency.value = 23; const ag = K.gain(0.4, g.gain); am.connect(ag); am.start(0); am.stop(0.72); for (let i = 0; i < 16; i++) burst(K, o, rnd() * 0.68, 'highpass', 5000, 1, 0.3 * rnd(), 0.006); return 0.74; } },
  zap: { n: 2, level: 0.8, f: (K, o, v) => { for (let i = 0; i < 5; i++) { const t = i * 0.07 + rnd() * 0.02, g = K.gain(0, o); K.perc(g, t, 0.7 - i * 0.1, 0.06); const os = K.osc('sawtooth', 2400, t, t + 0.07, K.filt('highpass', 900, 1, g)); os.frequency.setValueAtTime(2800 - v * 200 - i * 200, t); os.frequency.exponentialRampToValueAtTime(240, t + 0.06); burst(K, o, t, 'highpass', 3000, 0.7, 0.6, 0.03); } thump(K, o, 0, 90, 50, 0.6, 0.2); return 0.48; } },
  creak: { n: 2, level: 0.45, f: (K, o, v) => { const g = K.gain(0, o); K.env(g, 0, 0.08, 0.5, 0.1, 0.45, 0.62); const f = K.filt('bandpass', 620 + v * 80, 9, g); const os = K.osc('sawtooth', 84, 0, 0.64, f); os.frequency.setValueAtTime(70, 0); os.frequency.linearRampToValueAtTime(118 + v * 10, 0.3); os.frequency.linearRampToValueAtTime(82, 0.62); const f2 = K.filt('bandpass', 1480, 12, K.gain(0.5, g)); os.connect(f2); return 0.66; } },
  motor: { n: 1, level: 0.35, f: (K, o) => { const g = K.gain(0, o); K.env(g, 0, 0.05, 0.5, 0.1, 0.5, 0.5); K.osc('sawtooth', 58, 0, 0.52, K.filt('lowpass', 500, 2, g)); K.osc('triangle', 410, 0, 0.52, K.gain(0.15, g)); return 0.54; } },
  // 命中: 重い衝撃＋歪んだ破裂＋音程の落下
  hit: { n: 2, level: 0.9, f: (K, o, v) => { thump(K, o, 0, 170, 42, 1, 0.26); burst(K, o, 0, 'bandpass', 1500 + v * 200, 0.6, 0.9, 0.06); const g = K.gain(0, o); K.perc(g, 0, 0.45, 0.2); const os = K.osc('square', 880, 0, 0.22, K.filt('lowpass', 2400, 1, g)); os.frequency.setValueAtTime(950, 0); os.frequency.exponentialRampToValueAtTime(110, 0.18); burst(K, o, 0.02, 'highpass', 4000, 0.7, 0.3, 0.1); return 0.34; } },
  // 落下: 風の吸い込みと、落ちていく音程
  fall: { n: 1, level: 0.7, f: (K, o) => { sweep(K, o, 0, 1.25, 2600, 260, 1.3, 0.8, 0.25); const g = K.gain(0, o); K.env(g, 0, 0.05, 0.4, 0.3, 0.3, 1.2); const os = K.osc('triangle', 900, 0, 1.25, g); os.frequency.setValueAtTime(980, 0); os.frequency.exponentialRampToValueAtTime(95, 1.2); const l = K.ctx.createOscillator(); l.frequency.value = 7; l.connect(K.gain(30, os.detune)); l.start(0); l.stop(1.25); return 1.3; } },
  grace: { n: 1, level: 0.55, f: (K, o) => { for (let i = 0; i < 3; i++) { const t = i * 0.1, g = K.gain(0, o); K.env(g, t, 0.005, 0.6, 0.02, 0.5, t + 0.065); K.osc('square', i % 2 ? 1568 : 1976, t, t + 0.07, K.filt('lowpass', 5000, 0.7, g)); } return 0.34; } },
  // コンボ: FM のベル（基準は C6。再生時に音階で音程を上げる）
  combo: { n: 1, level: 0.5, f: (K, o) => { bell(K, o, 0, 0.12, 84, 0.6, 0); pluck(K, o, 0, 0.1, 96, 0.15, 0); return 0.8; } },
  respawn: { n: 1, level: 0.55, f: (K, o) => { [72, 76, 79, 84, 88].forEach((m, i) => bell(K, o, i * 0.06, 0.1, m, 0.4, (i - 2) * 0.3)); sweep(K, o, 0, 0.35, 800, 6000, 1.5, 0.25, 0.8); return 0.95; } },
  uiMove: { n: 1, level: 0.3, f: (K, o) => { modal(K, o, 0, [[1560, 0.04, 1], [3120, 0.02, 0.4]], 0.6); return 0.07; } },
  uiOk: { n: 1, level: 0.45, f: (K, o) => { bell(K, o, 0, 0.05, 81, 0.5); bell(K, o, 0.06, 0.08, 88, 0.5); return 0.5; } },
  uiBack: { n: 1, level: 0.4, f: (K, o) => { bell(K, o, 0, 0.05, 79, 0.5); bell(K, o, 0.06, 0.08, 72, 0.45); return 0.5; } },
  floor: { n: 1, level: 0.3, f: (K, o) => { bell(K, o, 0, 0.1, 96, 0.5); return 0.6; } },
  // 心拍（片手のとき）: ドッ・クン
  heart: { n: 1, level: 0.6, f: (K, o) => { thump(K, o, 0, 70, 38, 1, 0.13); thump(K, o, 0.17, 58, 34, 0.7, 0.15); return 0.4; } },
  // 街: 遠いクラクション（2 音）・遠い電車・突風
  horn: { n: 3, level: 0.4, f: (K, o, v) => { const d = 0.35 + v * 0.12, g = K.gain(0, o); K.env(g, 0, 0.03, 0.5, 0.05, 0.45, d); const lp = K.filt('lowpass', 1400, 0.7, g); K.osc('sawtooth', 392 + v * 22, 0, d + 0.02, lp); K.osc('sawtooth', 494 + v * 27, 0, d + 0.02, lp); return d + 0.05; } },
  train: { n: 1, level: 0.4, f: (K, o) => { const g = K.gain(0, o); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.6, 1.4); g.gain.linearRampToValueAtTime(0.0001, 3.4); K.noise(0, 3.5, K.filt('lowpass', 420, 0.8, g), 0.6); for (let i = 0; i < 14; i++) { const t = 0.3 + i * 0.21; thump(K, o, t, 95, 60, 0.25 * Math.sin(Math.PI * i / 14), 0.05); thump(K, o, t + 0.06, 85, 55, 0.2 * Math.sin(Math.PI * i / 14), 0.05); } return 3.5; } },
  gust: { n: 2, level: 0.5, f: (K, o, v) => { sweep(K, o, 0, 2.2, 300 + v * 80, 900 + v * 200, 0.8, 0.8, 0.45); sweep(K, o, 0.2, 1.8, 1500, 2600, 1.6, 0.25, 0.5); return 2.3; } },
  // ループ素材（距離で音量を変える）: ゴンドラのモーター、クレーンのきしみ、ネオンのハム、ヘリのローター
  loop_motor: { n: 1, level: 0.4, loop: 2, f: (K, o) => { const lp = K.filt('lowpass', 420, 2, o); K.osc('sawtooth', 55, 0, 2.4, lp); K.osc('sawtooth', 82.5, 0, 2.4, K.gain(0.5, lp)); K.osc('triangle', 440, 0, 2.4, K.gain(0.06, o)); const g = K.gain(0.15, o); K.noise(0, 2.4, K.filt('bandpass', 1800, 1, g)); return 2.4; } },
  loop_creak: { n: 1, level: 0.4, loop: 3, f: (K, o) => { for (const t of [0.1, 1.5]) { const g = K.gain(0, o); K.env(g, t, 0.15, 0.5, 0.2, 0.4, t + 0.9); const f = K.filt('bandpass', 540, 10, g), os = K.osc('sawtooth', 76, t, t + 0.95, f); os.frequency.setValueAtTime(64, t); os.frequency.linearRampToValueAtTime(t < 1 ? 104 : 58, t + 0.9); os.connect(K.filt('bandpass', 1310, 14, K.gain(0.5, g))); } const g = K.gain(0.05, o); K.noise(0, 3.4, K.filt('lowpass', 300, 1, g)); return 3.4; } },
  loop_hum: { n: 1, level: 0.3, loop: 2, f: (K, o) => { const lp = K.filt('lowpass', 1500, 1, o); K.osc('sawtooth', 100, 0, 2.4, lp); K.osc('square', 50, 0, 2.4, K.gain(0.4, lp)); K.osc('sine', 4000, 0, 2.4, K.gain(0.02, o)); return 2.4; } },
  loop_heli: { n: 1, level: 0.6, loop: 2, f: (K, o) => { const g = K.gain(0, o); for (let i = 0; i < 26; i++) { const t = i * (2 / 22); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.07); } K.noise(0, 2.4, K.filt('lowpass', 520, 1.2, g), 0.8); K.osc('sawtooth', 44, 0, 2.4, K.filt('lowpass', 260, 2, K.gain(0.6, g))); const w = K.gain(0.12, o); K.noise(0, 2.4, K.filt('bandpass', 2600, 2, w)); K.osc('sine', 640, 0, 2.4, K.gain(0.04, o)); return 2.4; } },
};
// 効果音 1 つ（変化違い v）をレンダリングして Float32Array（モノラル）で返す
export async function renderModernSfx(name, v = 0, sampleRate = 44100) {
  const r = MODERN_SFX[name]; if (!r || !OAC) return null;
  _seed = 777 + name.length * 131 + v * 17;
  const probe = { len: 4 };
  const ctx = new OAC(1, Math.ceil(4 * sampleRate), sampleRate), K = mk(ctx);
  const len = r.f(K, ctx.destination, v) + 0.03; probe.len = len;
  const buf = await ctx.startRendering(); let d = buf.getChannelData(0).slice(0, Math.min(buf.length, Math.ceil(len * sampleRate)));
  if (r.loop) { // ループ素材: 末尾 0.4 秒を先頭へ重ねて継ぎ目をなくす
    const n = Math.round(r.loop * sampleRate), f = d.length - n, o = d.slice(0, n); for (let i = 0; i < f && i < n; i++) { const t = i / f; o[i] = o[i] * t + d[n + i] * (1 - t); } d = o;
  } else { const fo = Math.min(d.length, Math.floor(0.012 * sampleRate)); for (let i = 0; i < fo; i++) d[d.length - 1 - i] *= i / fo; }
  let pk = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
  let k = (r.level ?? 0.7) / (pk || 1);
  // ラウドネス合わせ: 持続する音は最大値が同じでも大きく聞こえるので、RMS が -18dBFS を超えないように下げる
  let sq = 0; for (let i = 0; i < d.length; i++) sq += d[i] * d[i]; const rms = Math.sqrt(sq / d.length) * k; if (rms > 0.126) k *= 0.126 / rms;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return d;
}
export { peakOf };
