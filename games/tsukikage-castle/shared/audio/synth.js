// 月影の魔城 — 音源と曲の再生器（純粋な JS。AudioWorklet でも Node でも動く）
// 同じリポジトリの VOIDBLOOM（games/bio-hshooter）の自作 FM 音源を複製し、1980 年代中盤のアーケード基板に多い
// 「FM ＋ 矩形波（PSG）＋ 粗い PCM」の構成へ広げた。実在の音源チップの再現ではない（どのチップかも断定しない）。
//   FM 4 オペレータ × 6（曲 0〜3 / 効果音 4・5）・矩形波 × 3（曲 0〜1 / 効果音 2）・PCM（8bit・補間なし）× 3（曲 0〜1 / 効果音 2）
// 残響（エコー）は付けない（当時の素朴な鳴り方を優先。依頼の「過剰なリバーブを加えない」）。

export const FM_CH = 6, PSG_CH = 3, PCM_CH = 3, TPQ = 48; // 4 分音符 = 48 tick
// 矩形波の音色: 減衰（dB/秒）・持続の大きさ（0〜1）・離したあとの減衰・ビブラート（cent）・デューティ比
export const PSG_PATCHES = [
  { name: 'SQ LEAD', decay: 6, sus: 0.75, rel: 40, vib: 12, duty: 0.5, uni: 7 },
  { name: 'SQ PLUCK', decay: 38, sus: 0.0, rel: 60, vib: 0, duty: 0.5 },
  { name: 'SQ ORGAN', decay: 0, sus: 1, rel: 50, vib: 4, duty: 0.5 },
  { name: 'SQ ECHO', decay: 18, sus: 0.25, rel: 30, vib: 0, duty: 0.5 },
  { name: 'SQ THIN', decay: 10, sus: 0.6, rel: 40, vib: 14, duty: 0.25, uni: 5 },
  { name: 'SQ NARROW', decay: 22, sus: 0.3, rel: 50, vib: 0, duty: 0.125 },
];
const SINE_BITS = 12, SINE_N = 1 << SINE_BITS, SINE_MASK = SINE_N - 1;
const SINE = new Float32Array(SINE_N);
for (let i = 0; i < SINE_N; i++) SINE[i] = Math.sin((i / SINE_N) * Math.PI * 2);
const DB_N = 1400; // 0.1dB 刻み 0〜140dB
const DB2LIN = new Float32Array(DB_N + 1);
for (let i = 0; i <= DB_N; i++) DB2LIN[i] = Math.pow(10, -(i / 10) / 20);
const MOD_DEPTH = 2.0;                            // 変調の深さ（位相の周期数）
const FB_TABLE = [0, 1 / 128, 1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2];
const MUL = (m) => (m === 0 ? 0.5 : m);

// アルゴリズム: 各オペレータの変調元と、出力に出すオペレータ（0 = M1, 1 = M2, 2 = C1, 3 = C2 の順に計算）
// [mods: op ごとの変調元リスト, carriers]
export const ALGS = [
  [[[], [0], [1], [2]], [3]],             // 0: 1→2→3→4
  [[[], [], [0, 1], [2]], [3]],           // 1: (1+2)→3→4
  [[[], [], [1], [0, 2]], [3]],           // 2: (1 + 2→3)→4
  [[[], [0], [], [1, 2]], [3]],           // 3: (1→2 + 3)→4
  [[[], [0], [], [2]], [1, 3]],           // 4: 1→2, 3→4
  [[[], [0], [0], [0]], [1, 2, 3]],       // 5: 1→(2,3,4)
  [[[], [0], [], []], [1, 2, 3]],         // 6: 1→2, 3, 4
  [[[], [], [], []], [0, 1, 2, 3]],       // 7: 1+2+3+4
];

const rateSec = (r) => 0.0006 * Math.pow(2, (31 - Math.max(0, Math.min(31, r))) / 2.35); // AR: 31 → 0.6ms, 0 → 約 6 秒
const rateDbps = (r) => (r <= 0 ? 0 : 2.2 * Math.pow(2, Math.min(31, r) / 3.0));       // DR: 31 → 2800 dB/s

class Op {
  constructor() { this.phase = 0; this.out = 0; this.state = 4; this.att = 140; this.lin = 0; this.p = null; this.inc = 0; }
}
class Channel {
  constructor() {
    this.ops = [new Op(), new Op(), new Op(), new Op()];
    this.patch = null; this.alg = 7; this.fb = 0; this.fb1 = 0; this.fb2 = 0;
    this.note = 60; this.bend = 0; this.slide = 0; this.vol = 1; this.panL = 1; this.panR = 1; this.vib = 0; this.detune = 0;
    this.echo = 0; this.on = false; this.owner = 'music'; this.velAmp = 1;
  }
}

export class FMSynth {
  constructor(sr = 48000) {
    this.sr = sr;
    this.fm = Array.from({ length: FM_CH }, () => new Channel());
    this.pcm = Array.from({ length: PCM_CH }, () => ({ buf: null, pos: 0, step: 0, vol: 0, panL: 1, panR: 1, echo: 0, owner: 'music' }));
    this.psg = Array.from({ length: PSG_CH }, () => ({ on: false, note: 60, bend: 0, slide: 0, ph: 0, lvl: 0, p: PSG_PATCHES[0], vol: 0, owner: 'music', panL: 1, panR: 1, stage: 0, detune: 0, dMul: 1, rMul: 0.999 }));
    this.patches = [];
    this.samples = {};
    this.lfoPhase = 0; this.lfoRate = 5.2 / sr;
    this.master = 1.4; this.musicVol = 1; this.sfxVol = 1;
    // エコー（宇宙の残響。当時の基板には無いが、静けさのために薄く足す）
    this.dlen = Math.floor(sr * 0.75); this.dL = new Float32Array(this.dlen); this.dR = new Float32Array(this.dlen); this.dpos = 0;
    this.dtime = Math.floor(sr * 0.33); this.dfb = 0.28; this.dmix = 0.22; // 旋律だけに付ける拍に合った短い反復（当時の作曲で使われた「チャンネルのエコー」の再現。全体の残響は付けない）
    this.lpL = 0; this.lpR = 0; this.lpK = 1 - Math.exp(-2 * Math.PI * 11500 / sr); // 出力の低域通過（基板の DAC 後段のこもり）
    this.seq = null; this.sfx = []; this.idleFade = 1;
    this.meter = new Float32Array(FM_CH + PCM_CH + PSG_CH);
  }

  // ---------- 音色・サンプル ----------
  setPatches(list) { this.patches = list; }
  setSamples(map) { this.samples = map; }

  programChannel(c, patch) {
    if (!patch) return;
    c.patch = patch; c.alg = patch.alg; c.fb = patch.fb || 0; c.vib = patch.vib || 0;
  }

  noteFreq(c) { return 440 * Math.pow(2, (c.note + c.bend - 69) / 12 + c.detune / 1200); }

  keyOn(ch, note, vel = 1) {
    const c = this.fm[ch]; if (!c.patch) return;
    c.note = note; c.bend = 0; c.on = true; c.velAmp = vel;
    for (let i = 0; i < 4; i++) {
      const o = c.ops[i], p = c.patch.ops[i];
      o.p = p;
      const ks = (p.ks || 0) * Math.max(0, note - 48) / 12;
      o.arInc = 1 - Math.exp(-1 / (rateSec(p.ar + ks) * this.sr / 5));
      o.d1 = rateDbps(p.d1r + ks) / this.sr; o.d2 = rateDbps(p.d2r + ks) / this.sr; o.rr = rateDbps(p.rr * 2 + 1 + ks) / this.sr;
      o.sl = (p.d1l || 0) * 3; o.tlLin = DB2LIN[Math.min(DB_N, Math.round((p.tl || 0) * 7.5))];
      const wasOff = o.state === 4;
      if (wasOff || c.patch.reset !== false) o.phase = 0;
      if (wasOff) o.lin = 0; else if (o.state !== 0) o.lin = DB2LIN[Math.min(DB_N, (o.att * 10) | 0)];
      o.state = 0;
      if (p.ar >= 31) { o.lin = 1; o.att = 0; o.state = 1; }
    }
    c.fb1 = c.fb2 = 0;
  }
  keyOff(ch) { const c = this.fm[ch]; c.on = false; for (const o of c.ops) if (o.state < 3) { if (o.state === 0) o.att = o.lin > 0 ? -20 * Math.log10(o.lin) : 140; o.state = 3; } }

  psgOn(ch, note, patch, vol) {
    const v = this.psg[ch]; v.p = PSG_PATCHES[patch] || PSG_PATCHES[0]; v.note = note; v.bend = 0; v.on = true; v.vol = vol; v.lvl = 1; v.stage = 1; v.age = 0; v.ph2 = v.ph2 || 0.37;
    v.dMul = Math.pow(10, -v.p.decay / 20 / this.sr); v.rMul = Math.pow(10, -v.p.rel / 20 / this.sr);
  }
  psgOff(ch) { const v = this.psg[ch]; v.on = false; if (v.stage !== 0) v.stage = 2; }
  pcmPlay(ch, name, pitch = 0, vol = 1, pan = 3) {
    const v = this.pcm[ch], smp = this.samples[name]; if (!smp) return;
    v.buf = smp.data; v.pos = 0; v.step = (smp.rate / this.sr) * Math.pow(2, pitch / 12); v.vol = vol;
    v.panL = pan & 1 ? 1 : 0; v.panR = pan & 2 ? 1 : 0;
  }

  // ---------- 曲 ----------
  playSong(song, opts = {}) {
    for (let ch = 0; ch < FM_CH; ch++) { if (this.fm[ch].owner === 'music') this.keyOff(ch); }
    for (let ch = 0; ch < PSG_CH; ch++) { if (this.psg[ch].owner === 'music') this.psgOff(ch); }
    this.idleFade = 1;
    if (!song) { this.seq = null; return; }
    const tracks = song.tracks.map((t) => ({ ...t, i: 0, tick: 0, base: 0, done: false, offAt: -1, vol: 12, pan: 3, gate: 7, patch: 0, echo: 0, detune: 0, vib: -1 }));
    this.seq = { song, tracks, tick: 0, acc: 0, spt: this.sr * 60 / (song.tempo * TPQ), fade: 1, fadeStep: 0 };
    this.dtime = Math.max(1, Math.min(this.dlen - 1, Math.floor(this.sr * ((song.echoBeats ?? 0.75) * 60 / song.tempo))));
    this.dfb = song.echoFb ?? 0.28;
    if (opts.fadeIn) { this.seq.fade = 0; this.seq.fadeStep = 1 / (this.sr * opts.fadeIn); }
  }
  fadeOut(sec = 1.5) { if (this.seq) this.seq.fadeStep = -1 / (this.sr * sec); }

  seqTick() {
    const q = this.seq;
    for (const t of q.tracks) {
      if (t.done) continue;
      if (t.kind === 'fm' && t.offAt >= 0 && t.tick >= t.offAt) { if (this.fm[t.ch].owner === 'music') this.keyOff(t.ch); t.offAt = -1; }
      if (t.kind === 'psg' && t.offAt >= 0 && t.tick >= t.offAt) { if (this.psg[t.ch].owner === 'music') this.psgOff(t.ch); t.offAt = -1; }
      for (;;) {
        if (t.i < t.events.length) {
          const ev = t.events[t.i];
          if (t.tick >= t.base + ev[0]) { t.i++; this.applyEvent(t, ev); continue; }
          break;
        }
        if (t.tick >= t.base + t.endTick) {
          if (t.loopIdx >= 0 && t.endTick > t.loopTick) { t.base += t.endTick - t.loopTick; t.i = t.loopIdx; continue; }
          t.done = true;
        }
        break;
      }
      t.tick++;
    }
    q.tick++;
  }

  applyEvent(t, ev) {
    const [, type, a, b, c2] = ev;
    const fm = t.kind === 'fm';
    const own = fm ? this.fm[t.ch].owner === 'music' : t.kind === 'psg' ? this.psg[t.ch].owner === 'music' : this.pcm[t.ch].owner === 'music';
    switch (type) {
      case 'n': // ノート: a = MIDI, b = 長さ tick, c2 = ゲート長 tick
        if (t.kind === 'psg') {
          if (!own) break;
          this.psgOn(t.ch, a, t.patch, volCurve(t.vol) * 0.9); const v = this.psg[t.ch]; v.panL = t.pan & 1 ? 1 : 0.55; v.panR = t.pan & 2 ? 1 : 0.55; v.detune = t.detune; v.echo = t.echo;
          t.offAt = t.tick + c2;
        } else if (fm) {
          if (!own) break;
          const c = this.fm[t.ch];
          this.programChannel(c, this.patches[t.patch]);
          c.vol = volCurve(t.vol); c.panL = t.pan & 1 ? 1 : 0; c.panR = t.pan & 2 ? 1 : 0; c.echo = t.echo; c.detune = t.detune; c.slide = 0;
          if (t.vib >= 0) c.vib = t.vib;
          this.keyOn(t.ch, a, 1);
          t.offAt = t.tick + c2;
        } else if (own) {
          this.pcmPlay(t.ch, a, b || 0, volCurve(t.vol), t.pan); this.pcm[t.ch].echo = t.echo;
        }
        break;
      case '@': t.patch = a; break;
      case 'v': t.vol = a; break;
      case 'p': t.pan = a; break;
      case 'y': t.echo = a / 9; break;
      case 'D': t.detune = a; break;
      case 'M': t.vib = a; break;
      case 't': this.seq.spt = this.sr * 60 / (a * TPQ); break;
    }
  }

  // ---------- 効果音 ----------
  // prog: { ch: 'fm' | 'pcm', steps: [[tick, kind, ...]], prio }
  playSfx(prog, slot, tr = 0) {
    if (!prog) return;
    const chs = prog.ch === 'pcm' ? [2] : prog.ch === 'psg' ? [2] : [5, 4];
    let ch = slot ?? null;
    if (ch == null) {
      // 空いている枠、なければ優先度の低いもの・古いもの
      const busy = this.sfx.filter((x) => x.kind === prog.ch);
      ch = chs.find((c) => !busy.some((x) => x.ch === c));
      if (ch == null) {
        const victim = busy.filter((x) => (x.prog.prio || 0) <= (prog.prio || 0)).sort((a, b) => a.start - b.start)[0];
        if (!victim) return;
        ch = victim.ch; this.sfx.splice(this.sfx.indexOf(victim), 1);
      }
    }
    const v = { prog, ch, kind: prog.ch, i: 0, t: 0, acc: 0, spt: this.sr / 120, start: this.sfxClock = (this.sfxClock || 0) + 1, tr };
    if (prog.ch === 'fm') { const c = this.fm[ch]; c.owner = 'sfx'; this.keyOff(ch); } else if (prog.ch === 'psg') { this.psg[ch].owner = 'sfx'; this.psgOff(ch); } else this.pcm[ch].owner = 'sfx';
    this.sfx.push(v);
  }
  sfxTick(v) {
    const steps = v.prog.steps;
    while (v.i < steps.length && steps[v.i][0] <= v.t) {
      const s = steps[v.i++];
      if (v.kind === 'fm') {
        const c = this.fm[v.ch];
        if (s[1] === 'on') { this.programChannel(c, this.patches[s[3]]); c.vol = (s[4] ?? 1) * this.sfxVol; c.panL = c.panR = 1; c.echo = s[6] || 0; c.detune = 0; c.slide = (s[5] || 0) / this.sr; this.keyOn(v.ch, s[2] + (v.tr || 0), 1); }
        else if (s[1] === 'off') this.keyOff(v.ch);
        else if (s[1] === 'slide') c.slide = s[2] / this.sr;
      } else if (v.kind === 'psg') {
        const q = this.psg[v.ch];
        if (s[1] === 'on') { this.psgOn(v.ch, s[2] + (v.tr || 0), s[3] || 0, (s[4] ?? 1) * this.sfxVol * 0.9); q.slide = (s[5] || 0) / this.sr; q.panL = q.panR = 1; q.echo = 0; }
        else if (s[1] === 'off') this.psgOff(v.ch);
        else if (s[1] === 'slide') q.slide = s[2] / this.sr;
      } else if (s[1] === 'pcm') { this.pcmPlay(v.ch, s[2], s[3] || 0, (s[4] ?? 1) * this.sfxVol, 3); this.pcm[v.ch].echo = s[5] || 0; }
    }
    v.t++;
    return v.i >= steps.length && v.t > (v.prog.len || 0);
  }

  // ---------- 出力 ----------
  render(L, R, n, off = 0) {
    const sr = this.sr, fmc = this.fm, pcm = this.pcm; let q = this.seq;
    const dL = this.dL, dR = this.dR, dlen = this.dlen;
    for (let k = 0; k < n; k++) {
      if (q) {
        q.acc += 1;
        while (q.acc >= q.spt) { q.acc -= q.spt; this.seqTick(); }
        if (q && q.fadeStep) { q.fade += q.fadeStep; if (q.fade >= 1) { q.fade = 1; q.fadeStep = 0; } if (q.fade <= 0) { q.fade = 0; q.fadeStep = 0; this.seq = null; q = null; this.idleFade = 0; for (let c = 0; c < FM_CH; c++) if (fmc[c].owner === 'music') this.keyOff(c); for (let c = 0; c < PSG_CH; c++) if (this.psg[c].owner === 'music') this.psgOff(c); } }
      }
      if (this.sfx.length) {
        for (let j = this.sfx.length - 1; j >= 0; j--) {
          const v = this.sfx[j]; v.acc += 1;
          let done = false;
          while (v.acc >= v.spt) { v.acc -= v.spt; if (this.sfxTick(v)) { done = true; break; } }
          if (done) {
            if (v.kind === 'fm') { this.keyOff(v.ch); this.fm[v.ch].owner = 'release'; v.rel = 0; }
            else if (v.kind === 'psg') { this.psgOff(v.ch); this.psg[v.ch].owner = 'release'; }
            else this.pcm[v.ch].owner = 'music';
            this.sfx.splice(j, 1);
          }
        }
      }
      this.lfoPhase += this.lfoRate; if (this.lfoPhase >= 1) this.lfoPhase -= 1;
      const lfo = SINE[(this.lfoPhase * SINE_N) & SINE_MASK];
      const mfade = (q ? q.fade : this.idleFade) * this.musicVol;
      let sl = 0, sr2 = 0, el = 0, er = 0;
      for (let ci = 0; ci < FM_CH; ci++) {
        const c = fmc[ci];
        if (!c.patch) continue;
        const ops = c.ops;
        if (ops[0].state === 4 && ops[1].state === 4 && ops[2].state === 4 && ops[3].state === 4) { if (c.owner === 'release') c.owner = 'music'; continue; }
        if (c.slide) c.bend += c.slide;
        const f = 440 * Math.pow(2, (c.note + c.bend - 69) / 12 + (c.detune + c.vib * lfo) / 1200) / sr;
        const alg = ALGS[c.alg], mods = alg[0], cars = alg[1];
        let outSum = 0;
        for (let i = 0; i < 4; i++) {
          const o = ops[i], p = o.p;
          if (!p) continue;
          // 包絡線
          let amp;
          switch (o.state) {
            case 0: o.lin += (1.0 - o.lin) * o.arInc; if (o.lin >= 0.999) { o.lin = 1; o.att = 0; o.state = 1; } amp = o.lin; break;
            case 1: o.att += o.d1; if (o.att >= o.sl) { o.att = o.sl; o.state = 2; } amp = DB2LIN[(o.att * 10) | 0]; break;
            case 2: o.att += o.d2; if (o.att >= 96) { o.att = 140; o.state = 4; } amp = DB2LIN[Math.min(DB_N, (o.att * 10) | 0)]; break;
            case 3: o.att += o.rr; if (o.att >= 96) { o.att = 140; o.state = 4; } amp = DB2LIN[Math.min(DB_N, (o.att * 10) | 0)]; break;
            default: amp = 0;
          }
          // 位相と変調
          o.phase += f * MUL(p.mul) * (1 + (p.dt || 0) * 0.0007);
          if (o.phase >= 1) o.phase -= Math.floor(o.phase);
          let m = 0;
          const ms = mods[i];
          for (let j = 0; j < ms.length; j++) m += ops[ms[j]].out;
          if (i === 0 && c.fb) m = (c.fb1 + c.fb2) * 0.5 * FB_TABLE[c.fb] * 4;
          else m *= MOD_DEPTH;
          const ph = o.phase + m;
          const v = SINE[((ph - Math.floor(ph)) * SINE_N) & SINE_MASK] * amp * o.tlLin;
          o.out = v;
          if (i === 0) { c.fb2 = c.fb1; c.fb1 = v; }
        }
        for (let j = 0; j < cars.length; j++) outSum += ops[cars[j]].out;
        const g = outSum * c.vol * c.velAmp * (c.owner === 'music' ? mfade : 1) / Math.max(1, cars.length * 0.7);
        this.meter[ci] = Math.max(this.meter[ci] * 0.9995, Math.abs(g));
        sl += g * c.panL; sr2 += g * c.panR;
        if (c.echo) { el += g * c.panL * c.echo; er += g * c.panR * c.echo; }
      }
      for (let si = 0; si < PSG_CH; si++) {
        const v = this.psg[si];
        if (v.stage === 0) { if (v.owner === 'release') v.owner = 'music'; continue; }
        if (v.stage === 1) { if (v.lvl > v.p.sus) { v.lvl *= v.dMul; if (v.lvl < v.p.sus) v.lvl = v.p.sus; } }
        else { v.lvl *= v.rMul; if (v.lvl < 0.0005) { v.lvl = 0; v.stage = 0; continue; } }
        if (v.slide) v.bend += v.slide;
        // ビブラートは音の出だしから 0.25 秒かけて深くなる（長い音だけ揺れる）
        v.age++; const vd = Math.min(1, v.age / (sr * 0.25));
        const f = 440 * Math.pow(2, (v.note + v.bend - 69) / 12 + (v.detune + v.p.vib * vd * lfo) / 1200);
        const dt1 = f / sr; v.ph += dt1; if (v.ph >= 1) v.ph -= Math.floor(v.ph);
        // 帯域制限した矩形波（PolyBLEP）: 高い音の折り返しノイズを抑え、耳に刺さる硬さを取る
        const D = v.p.duty;
        let sq = (v.ph < D ? 1 : -1) + blep(v.ph, dt1) - blep((v.ph - D + 1) % 1, dt1);
        if (v.p.uni) { const dt2 = dt1 * Math.pow(2, v.p.uni / 1200); v.ph2 += dt2; if (v.ph2 >= 1) v.ph2 -= Math.floor(v.ph2); sq = (sq + (v.ph2 < D ? 1 : -1) + blep(v.ph2, dt2) - blep((v.ph2 - D + 1) % 1, dt2)) * 0.62; } // 少しずらした 2 本目（厚み）
        const amp = Math.round(v.lvl * 15) / 15; // 4bit 相当の音量段階
        const g = sq * amp * v.vol * 0.75 * (v.owner === 'music' ? mfade : 1);
        if (v.echo) { el += g * v.panL * v.echo; er += g * v.panR * v.echo; }
        this.meter[FM_CH + PCM_CH + si] = Math.max(this.meter[FM_CH + PCM_CH + si] * 0.9995, Math.abs(g));
        sl += g * v.panL; sr2 += g * v.panR;
      }
      for (let pi = 0; pi < PCM_CH; pi++) {
        const v = pcm[pi];
        if (!v.buf) continue;
        const idx = v.pos | 0; // 補間しない（粗さを残す）
        if (idx >= v.buf.length) { v.buf = null; continue; }
        const g = v.buf[idx] * v.vol * (v.owner === 'music' ? mfade : 1);
        v.pos += v.step;
        this.meter[FM_CH + pi] = Math.max(this.meter[FM_CH + pi] * 0.9995, Math.abs(g));
        sl += g * v.panL; sr2 += g * v.panR;
        if (v.echo) { el += g * v.echo; er += g * v.echo; }
      }
      // エコー（左右交差）
      const rp = (this.dpos - this.dtime + dlen) % dlen;
      const yl = dL[rp], yr = dR[rp];
      dL[this.dpos] = el * 0.6 + yr * this.dfb; dR[this.dpos] = er * 0.6 + yl * this.dfb;
      this.dpos = (this.dpos + 1) % dlen;
      let ol = (sl + yl * this.dmix * 3) * this.master * 0.32, or = (sr2 + yr * this.dmix * 3) * this.master * 0.32;
      this.lpL += (ol - this.lpL) * this.lpK; this.lpR += (or - this.lpR) * this.lpK;
      L[off + k] = softclip(this.lpL); R[off + k] = softclip(this.lpR);
    }
  }
}

function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
function softclip(x) { return x > 1.2 ? 1 : x < -1.2 ? -1 : x - (x * x * x) / 4.32 * (Math.abs(x) > 0.6 ? 1 : 0.35); }
export const volCurve = (v) => (v <= 0 ? 0 : Math.pow(10, -(15 - Math.min(15, v)) * 2.4 / 20));
