// NIGHT SHAFT サウンドエンジン v2（純粋な計算。ブラウザの Worker でも Node でも同じ波形を作る）。
// ステレオ 44.1kHz。発振器: 帯域制限ノコギリ波・矩形波（PWM）・三角波・正弦波・2 オペレーター FM・ユニゾン（スーパーソウ）・ノイズ。
// 1 音ごとに ADSR・状態変数フィルター（TPT SVF、エンベロープとキートラック）・ピッチエンベロープ・ビブラート・グライド。
// ドラムは合成（キック・スネア・クラップ・ハイハット・タム・クラッシュ・シェイカー）。
// バス: パン、リバーブ（Freeverb 型）とテンポ同期のピンポンディレイへのセンド、キックによるサイドチェイン、マスターのコンプレッサーとソフトクリップ。
export const SR = 44100;
const TAU = Math.PI * 2;
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- 乱数（決定的） ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- MML ----------
// o4 < > l8 v12 q7（ゲート 1-8）t（トラックごとのテンポ無し）
// 音: c d e f g a b（+ # -）長さ（. 付点）、r 休符、& タイ、{c e g}4 和音、[ ... ]3 繰り返し、| は区切り（無視）
// ドラム（drum: true のトラック）: k キック s スネア c クラップ h ハット o オープンハット t 低タム u 高タム x クラッシュ y ライド z シェイカー
function expandRepeats(src) {
  let s = src; const re = /\[([^\[\]]*)\](\d*)/;
  while (re.test(s)) s = s.replace(re, (_, body, n) => Array(Number(n || 2)).fill(body).join(' '));
  return s;
}
export function parseMML(src, tempo, drum = false) {
  const s = expandRepeats(src.replace(/;[^\n]*/g, ' '));
  const ev = []; let i = 0, oct = 4, len = 8, vol = 12, gate = 7, t = 0;
  const beat = 60 / tempo;
  const num = () => { const m = /^\d+/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return Number(m[0]); };
  const dur = () => { const n = num(); let d = (4 / (n || len)) * beat; let add = d / 2; while (s[i] === '.') { d += add; add /= 2; i++; } return d; };
  const noteAt = () => { const ch = s[i++].toLowerCase(); let m = NOTE[ch]; while (s[i] === '+' || s[i] === '#' || s[i] === '-') { m += s[i] === '-' ? -1 : 1; i++; } return (oct + 1) * 12 + m; };
  while (i < s.length) {
    const ch = s[i].toLowerCase();
    if (/\s|\|/.test(ch)) { i++; continue; }
    if (drum && 'kschotuxyz'.includes(ch)) { i++; const d = dur(); ev.push({ t, dur: d, drum: ch, vol, gate }); t += d; continue; }
    i++;
    if (ch === 'o') oct = num();
    else if (ch === '<') oct--;
    else if (ch === '>') oct++;
    else if (ch === 'l') len = num();
    else if (ch === 'v') vol = num();
    else if (ch === 'q') gate = num();
    else if (ch === 'r') t += dur();
    else if (ch === '{') {
      const notes = []; let o0 = oct;
      while (i < s.length && s[i] !== '}') {
        const c2 = s[i].toLowerCase();
        if (/\s/.test(c2)) { i++; continue; }
        if (c2 === '<') { oct--; i++; continue; } if (c2 === '>') { oct++; i++; continue; }
        if (c2 === 'o') { i++; oct = num(); continue; }
        if (c2 in NOTE) notes.push(noteAt()); else i++;
      }
      i++; oct = o0;
      const d = dur();
      for (const m of notes) ev.push({ t, dur: d, midi: m, vol, gate });
      t += d;
    } else if (ch in NOTE) {
      i--; const m = noteAt(); const d = dur();
      const last = ev[ev.length - 1];
      if (last && last.tie && last.midi === m) { last.dur += d; last.tie = false; }
      else ev.push({ t, dur: d, midi: m, vol, gate });
      t += d;
      if (s[i] === '&') { ev[ev.length - 1].tie = true; i++; }
    }
  }
  return { events: ev, length: t };
}

// ---------- 発振器 ----------
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function oscSample(type, ph, dt, pw) {
  switch (type) {
    case 'saw': return 2 * ph - 1 - blep(ph, dt);
    case 'square': { let v = ph < pw ? 1 : -1; v += blep(ph, dt); v -= blep((ph - pw + 1) % 1, dt); return v; }
    case 'tri': return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    case 'sine': return Math.sin(TAU * ph);
    default: return 0;
  }
}

// ---------- フィルター（TPT 状態変数） ----------
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.1); }
  set(fc, res) {
    fc = Math.min(SR * 0.45, Math.max(20, fc));
    const g = Math.tan(Math.PI * fc / SR); const k = 2 - 2 * Math.min(0.97, res);
    this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2; this.k = k;
  }
  run(x, mode) {
    const v3 = x - this.ic2; const v1 = this.a1 * this.ic1 + this.a2 * v3; const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return mode === 'hp' ? x - this.k * v1 - v2 : mode === 'bp' ? v1 : v2;
  }
}
function adsr(t, gateLen, e) {
  const { a = 0.005, d = 0.1, s = 0.7, r = 0.1 } = e;
  let v;
  if (t < a) v = t / a; else if (t < a + d) v = 1 - (1 - s) * (t - a) / d; else v = s;
  if (t > gateLen) { const rt = t - gateLen; const at = Math.min(gateLen, a + d); const lv = gateLen < a ? gateLen / a : gateLen < a + d ? 1 - (1 - s) * (gateLen - a) / d : s; void at; v = lv * Math.max(0, 1 - rt / r); }
  return v;
}

// ---------- 1 音 ----------
// inst: { osc: [{ type, gain, oct, detune(セント), pw }], uni: { n, cents }, fm: { ratio, index, decay }, amp: ADSR, flt: { type, fc, res, env, a, d, s, r, key },
//         pitch: { semi, decay }, vib: { rate, cents, delay }, gain, pan, width }
export function renderNote(L, R, start, ev, inst, tempoGain = 1) {
  const gateLen = ev.dur * (ev.gate / 8);
  const rel = (inst.amp && inst.amp.r) || 0.1;
  const n = Math.floor((gateLen + rel) * SR);
  const vel = (ev.vol / 15) * (inst.gain ?? 0.3) * tempoGain;
  const f0 = midiHz(ev.midi);
  const oscs = inst.osc || [{ type: 'saw', gain: 1 }];
  const uni = inst.uni || { n: 1, cents: 0 };
  const voices = [];
  const R0 = rng((ev.midi * 7919 + Math.round(ev.t * 1000)) | 0);
  for (const o of oscs) for (let u = 0; u < uni.n; u++) {
    const spread = uni.n > 1 ? (u / (uni.n - 1) - 0.5) * 2 : 0;
    voices.push({ o, ph: R0(), mul: Math.pow(2, ((o.oct || 0) * 1200 + (o.detune || 0) + spread * uni.cents) / 1200), pan: spread * (inst.width ?? 0.6), g: (o.gain ?? 1) / Math.sqrt(uni.n) });
  }
  const flt = inst.flt; const fL = new SVF(), fR = new SVF();
  const fm = inst.fm; let mph = 0;
  const pan = inst.pan || 0;
  const key = flt ? Math.pow(f0 / 261.6, flt.key ?? 0.5) : 1;
  for (let k = 0; k < n && start + k < L.length; k++) {
    const t = k / SR;
    const env = adsr(t, gateLen, inst.amp || {});
    if (env <= 0 && t > gateLen) break;
    let f = f0;
    if (inst.pitch) f *= Math.pow(2, inst.pitch.semi * Math.exp(-t / inst.pitch.decay) / 12);
    if (inst.vib && t > inst.vib.delay) f *= Math.pow(2, inst.vib.cents * Math.sin(TAU * inst.vib.rate * t) * Math.min(1, (t - inst.vib.delay) * 3) / 1200);
    if (flt && (k & 15) === 0) {
      const fe = adsr(t, gateLen, flt);
      const fc = flt.fc * key + flt.env * fe;
      fL.set(fc, flt.res); fR.set(fc, flt.res);
    }
    let l = 0, r = 0;
    let fmv = 0;
    if (fm) { mph += f * fm.ratio / SR; mph -= Math.floor(mph); fmv = Math.sin(TAU * mph) * fm.index * (fm.decay ? Math.exp(-t / fm.decay) * (1 - (fm.sustain || 0)) + (fm.sustain || 0) : 1); }
    for (const v of voices) {
      const dt = f * v.mul / SR;
      let ph = v.ph;
      let x;
      if (fm) x = Math.sin(TAU * ph + fmv);
      else if (v.o.type === 'noise') x = R0() * 2 - 1;
      else x = oscSample(v.o.type, ph, dt, v.o.pw ?? 0.5);
      ph += dt; if (ph >= 1) ph -= Math.floor(ph); v.ph = ph;
      const g = v.g * x;
      l += g * (1 - Math.max(0, v.pan));
      r += g * (1 + Math.min(0, v.pan));
    }
    if (flt) { l = fL.run(l, flt.type || 'lp'); r = fR.run(r, flt.type || 'lp'); }
    const a = env * vel;
    L[start + k] += l * a * (1 - Math.max(0, pan));
    R[start + k] += r * a * (1 + Math.min(0, pan));
  }
}

// ---------- ドラム ----------
function noiseGen(seed) { const r = rng(seed); return () => r() * 2 - 1; }
export function drumHit(L, R, start, kind, vel = 1, opt = {}) {
  const pan = opt.pan || 0;
  const put = (k, v) => { if (start + k < L.length) { L[start + k] += v * (1 - Math.max(0, pan)); R[start + k] += v * (1 + Math.min(0, pan)); } };
  const nz = noiseGen((start * 31 + kind.charCodeAt(0)) | 0);
  if (kind === 'k') { // キック: ピッチが落ちる正弦＋クリック
    const n = Math.floor(0.42 * SR); let ph = 0; const hp = new SVF(); hp.set(3500, 0.1);
    for (let k = 0; k < n; k++) { const t = k / SR; const f = 46 + 130 * Math.exp(-t / 0.035); ph += f / SR; const body = Math.sin(TAU * ph) * Math.exp(-t / 0.22); const click = hp.run(nz(), 'hp') * Math.exp(-t / 0.004) * 0.6; put(k, Math.tanh((body * 1.4 + click)) * 0.9 * vel); }
  } else if (kind === 's' || kind === 'c') { // スネア／クラップ
    const n = Math.floor(0.35 * SR); const bp = new SVF(); bp.set(kind === 's' ? 2200 : 1300, 0.45); let ph = 0;
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      let env = kind === 's' ? Math.exp(-t / 0.11) : (t < 0.03 ? Math.exp(-((t % 0.01)) / 0.004) : Math.exp(-(t - 0.03) / 0.13));
      const tone = kind === 's' ? Math.sin(TAU * (ph += (185 + 60 * Math.exp(-t / 0.02)) / SR)) * Math.exp(-t / 0.06) * 0.7 : 0;
      put(k, (bp.run(nz(), 'bp') * 2.2 * env + tone) * 0.55 * vel);
    }
  } else if (kind === 'h' || kind === 'o' || kind === 'z') { // ハット（金属的な矩形群＋ノイズ）
    const n = Math.floor((kind === 'o' ? 0.45 : kind === 'z' ? 0.09 : 0.07) * SR); const hp = new SVF(); hp.set(kind === 'z' ? 5000 : 7500, 0.3);
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800]; const ph = fr.map(() => 0);
    for (let k = 0; k < n; k++) {
      const t = k / SR; let m = 0; for (let j = 0; j < 6; j++) { ph[j] += fr[j] * 8 / SR; m += (ph[j] % 1) < 0.5 ? 1 : -1; }
      const env = Math.exp(-t / (kind === 'o' ? 0.16 : kind === 'z' ? 0.03 : 0.022));
      put(k, hp.run(m * 0.12 + nz() * (kind === 'z' ? 0.9 : 0.5), 'hp') * env * 0.32 * vel);
    }
  } else if (kind === 't' || kind === 'u') {
    const n = Math.floor(0.4 * SR); let ph = 0; const base = kind === 't' ? 95 : 150;
    for (let k = 0; k < n; k++) { const t = k / SR; ph += (base + base * 0.8 * Math.exp(-t / 0.05)) / SR; put(k, Math.sin(TAU * ph) * Math.exp(-t / 0.18) * 0.6 * vel); }
  } else if (kind === 'x' || kind === 'y') {
    const n = Math.floor((kind === 'x' ? 1.8 : 0.6) * SR); const hp = new SVF(); hp.set(kind === 'x' ? 4500 : 6000, 0.2);
    for (let k = 0; k < n; k++) { const t = k / SR; put(k, hp.run(nz(), 'hp') * Math.exp(-t / (kind === 'x' ? 0.55 : 0.2)) * 0.35 * vel); }
  }
}

// ---------- エフェクト ----------
export function reverb(inL, inR, { room = 0.82, damp = 0.25, wet = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const n = inL.length; const oL = new Float32Array(n), oR = new Float32Array(n);
  for (const [inp, out, spread] of [[inL, oL, 0], [inR, oR, 23]]) {
    const cb = combs.map((d) => ({ b: new Float32Array(d + spread), i: 0, s: 0 }));
    const ab = aps.map((d) => ({ b: new Float32Array(d + spread), i: 0 }));
    for (let k = 0; k < n; k++) {
      const x = (inL[k] + inR[k]) * 0.015;
      let y = 0;
      for (const c of cb) { const o = c.b[c.i]; c.s = o * (1 - damp) + c.s * damp; c.b[c.i] = x + c.s * room; c.i = (c.i + 1) % c.b.length; y += o; }
      for (const a of ab) { const o = a.b[a.i]; const v = -y + o; a.b[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.b.length; y = v; }
      out[k] = y * wet;
    }
    void inp;
  }
  return [oL, oR];
}
export function pingPong(inL, inR, delaySec, fb = 0.35, lp = 0.5) {
  const n = inL.length; const d = Math.floor(delaySec * SR);
  const oL = new Float32Array(n), oR = new Float32Array(n);
  const bL = new Float32Array(d), bR = new Float32Array(d); let i = 0, sL = 0, sR = 0;
  for (let k = 0; k < n; k++) {
    const yl = bL[i], yr = bR[i];
    sL += (yl - sL) * lp; sR += (yr - sR) * lp;
    bL[i] = (inL[k] + inR[k]) * 0.5 + sR * fb; bR[i] = sL * fb;
    oL[k] = yl; oR[k] = yr; i = (i + 1) % d;
  }
  return [oL, oR];
}
function compressor(L, R, { thr = 0.5, ratio = 4, att = 0.003, rel = 0.12, makeup = 1 } = {}) {
  let env = 0; const aA = Math.exp(-1 / (att * SR)), aR = Math.exp(-1 / (rel * SR));
  for (let k = 0; k < L.length; k++) {
    const x = Math.max(Math.abs(L[k]), Math.abs(R[k]));
    env = x > env ? aA * env + (1 - aA) * x : aR * env + (1 - aR) * x;
    let g = 1; if (env > thr) g = Math.pow(env / thr, 1 / ratio - 1);
    L[k] = Math.tanh(L[k] * g * makeup * 0.95); R[k] = Math.tanh(R[k] * g * makeup * 0.95);
  }
}

// ---------- 曲 ----------
// song: { tempo, loop, bars, tracks: [{ inst | drum:true, mml, send(リバーブ), delay(ディレイ), duck(サイドチェイン 0..1), pan, stem: 'base'|'hot' }], master }
export function renderSong(song, { stem = null, pre: preIn = null } = {}) {
  const tracks = song.tracks.filter((tr) => !stem || (tr.stem || 'base') === stem);
  const parsed = song.tracks.map((tr) => ({ tr, p: parseMML(tr.mml, song.tempo, !!tr.drum) }));
  const length = Math.max(...parsed.map((x) => x.p.length));
  const n = Math.ceil(length * SR);
  const tail = Math.floor(2.5 * SR);
  const N = n + tail;
  const L = new Float32Array(N), Rr = new Float32Array(N);
  const sL = new Float32Array(N), sR = new Float32Array(N); // リバーブ
  const dL = new Float32Array(N), dR = new Float32Array(N); // ディレイ
  // サイドチェイン（キックの位置から）
  const duck = new Float32Array(N).fill(1);
  for (const { tr, p } of parsed) if (tr.drum) for (const e of p.events) if (e.drum === 'k') {
    const s0 = Math.round(e.t * SR); for (let k = 0; k < 0.3 * SR && s0 + k < N; k++) duck[s0 + k] = Math.min(duck[s0 + k], 1 - 0.85 * Math.exp(-k / SR / 0.09));
  }
  for (const { tr, p } of parsed) {
    if (!tracks.includes(tr)) continue;
    const tL = new Float32Array(N), tR = new Float32Array(N);
    for (const e of p.events) {
      const s0 = Math.round(e.t * SR);
      if (e.drum) drumHit(tL, tR, s0, e.drum, (e.vol / 12) * (tr.gain ?? 1), { pan: (tr.pans && tr.pans[e.drum]) || 0 });
      else renderNote(tL, tR, s0, e, tr.inst);
    }
    const dk = tr.duck || 0; const pan = tr.pan || 0;
    for (let k = 0; k < N; k++) {
      const g = dk ? 1 - dk * (1 - duck[k]) : 1;
      const l = tL[k] * g * (1 - Math.max(0, pan)), r = tR[k] * g * (1 + Math.min(0, pan));
      L[k] += l; Rr[k] += r;
      if (tr.send) { sL[k] += l * tr.send; sR[k] += r * tr.send; }
      if (tr.delay) { dL[k] += l * tr.delay; dR[k] += r * tr.delay; }
    }
  }
  const m = song.master || {};
  const [rL, rR] = reverb(sL, sR, { room: m.room ?? 0.84, damp: m.damp ?? 0.3 });
  const [eL, eR] = pingPong(dL, dR, (60 / song.tempo) * (m.delayBeats ?? 0.75), m.delayFb ?? 0.38);
  for (let k = 0; k < N; k++) { L[k] += rL[k] * (m.rev ?? 1) + eL[k]; Rr[k] += rR[k] * (m.rev ?? 1) + eR[k]; }
  // ループ: はみ出した余韻を先頭へ足し戻す
  let outN = N;
  if (song.loop) { for (let k = 0; k < tail; k++) { L[k] += L[n + k]; Rr[k] += Rr[n + k]; } outN = n; }
  let oL = L.subarray(0, outN), oR = Rr.subarray(0, outN);
  // マスター: 低域の濁りを切り、コンプレッサー → 音量をそろえる（RMS 目標）
  const hp1 = new SVF(), hp2 = new SVF(); hp1.set(28, 0.1); hp2.set(28, 0.1);
  for (let k = 0; k < outN; k++) { oL[k] = hp1.run(oL[k], 'hp'); oR[k] = hp2.run(oR[k], 'hp'); }
  let rms = 0; for (let k = 0; k < outN; k += 4) rms += oL[k] * oL[k] + oR[k] * oR[k]; rms = Math.sqrt(rms / (outN / 2));
  const target = m.loud ?? 0.17; const pre = preIn ?? (rms > 1e-6 ? target / rms : 1);
  for (let k = 0; k < outN; k++) { oL[k] *= pre; oR[k] *= pre; }
  if (stem !== 'hot') compressor(oL, oR, { thr: 0.45, ratio: 3.5, makeup: 1.0 });
  else for (let k = 0; k < outN; k++) { oL[k] = Math.tanh(oL[k]); oR[k] = Math.tanh(oR[k]); }
  return { L: Float32Array.from(oL), R: Float32Array.from(oR), loop: !!song.loop, loopEnd: n / SR, length: outN / SR, pre };
}

// 効果音用の小さな道具
export function buf(sec) { const n = Math.ceil(sec * SR); return [new Float32Array(n), new Float32Array(n)]; }
export { SVF, noiseGen, rng, oscSample };
