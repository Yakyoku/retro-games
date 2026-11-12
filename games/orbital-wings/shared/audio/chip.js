// ORBITAL WINGS — 音源の中身（ブラウザ API を使わない。Node でもそのまま動く）
//
// 1985 年ごろの業務用基板の「つくり」をまねる（曲や音そのものはまねない）:
//   PSG-A  … AY-3-8910 相当（矩形波 3 音 + 共有ノイズ + エンベロープ）→ 曲
//   WAVE   … K005289 風の波形メモリ音源 2 音（32 サンプル × 4bit、12bit 周期、4bit 音量）→ 曲
//   PSG-B  … もう 1 個の AY-3-8910 相当 → 効果音だけ（だから効果音が曲の音を奪わない）
// 内部は PSG のクロック 1.789772MHz / 16 = 約 111.86kHz で回し、
// 2 段の 1 次ローパス（各 13kHz、合わせて約 8kHz で -3dB。基板の出力フィルタ相当）と
// 出力 1 サンプル分の平均で間引き、直流カット → ピーク抑え（リミッタ）の順に通す。
// 既定は「忠実」モード: モノラル（左右同じ）、残響なし。arrange を入れると軽い左右の広がりとエコーだけ足す。

import { compileSong } from './mml.js';
import { SONGS, INSTRUMENTS, WAVES, DRUMS } from './songs.js';
import { SFX } from './sfx.js';

export const PSG_CLOCK = 1789772;
export const TICK_RATE = PSG_CLOCK / 16;
export const FRAME_RATE = 60;
// AY-3-8910 の 16 段の音量（対数。実機の測定値として広く使われている表）
export const AY_VOLUME = [0, 0.00999465934234, 0.0144502937362, 0.0210574502174, 0.0307011520562, 0.0455481803616,
  0.0644998855573, 0.107362478065, 0.126588845655, 0.20498970016, 0.292210269322, 0.372838941024,
  0.492530708782, 0.635324635691, 0.805584802014, 1];

// 周波数 → 周期レジスタ値
export const psgPeriod = (hz) => Math.max(1, Math.min(4095, Math.round(PSG_CLOCK / (16 * hz))));
export const wavePeriod = (hz) => Math.max(1, Math.min(4095, Math.round(PSG_CLOCK / (32 * hz))));
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 混ぜる時の重み（1 チャンネル最大で ±0.5 の振れ幅）
const GAIN_PSG_A = 0.34, GAIN_WAVE = 0.36, GAIN_PSG_B = 0.52;

// ---------------------------------------------------------------- AY-3-8910 相当
export class PSG {
  constructor() { this.reg = new Uint8Array(16); this.tp = new Int32Array(3); this.tc = new Int32Array(3); this.tb = new Uint8Array(3); this.lvl = new Float64Array(3); this.reset(); }
  reset() {
    this.reg.fill(0); this.reg[7] = 0x3f;
    this.tp.fill(1); this.tc.fill(0); this.tb.fill(0); this.lvl.fill(0);
    this.np = 1; this.nc = 0; this.lfsr = 1; this.nb = 1;
    this.ep = 1; this.ec = 0; this.eStep = 0; this.eAtt = 0; this.eHold = 1; this.eAlt = 0; this.eHolding = 1; this.envLevel = 0;
    this.o0 = 0; this.o1 = 0; this.o2 = 0;
  }
  write(r, v) {
    r &= 15; v &= 0xff; const reg = this.reg; reg[r] = v;
    if (r < 6) { const ch = r >> 1; this.tp[ch] = (((reg[ch * 2 + 1] & 15) << 8) | reg[ch * 2]) || 1; }
    else if (r === 6) this.np = (v & 31) || 1;
    else if (r >= 8 && r <= 10) this.lvl[r - 8] = 0.5 * AY_VOLUME[v & 15];
    else if (r === 11 || r === 12) this.ep = ((reg[12] << 8) | reg[11]) || 1;
    else if (r === 13) this.envReset(v & 15);
  }
  read(r) { return this.reg[r & 15]; }
  envReset(shape) {
    this.eAtt = (shape & 4) ? 15 : 0;
    if (!(shape & 8)) { this.eHold = 1; this.eAlt = this.eAtt ? 1 : 0; } else { this.eHold = shape & 1; this.eAlt = (shape >> 1) & 1; }
    this.eStep = 15; this.eHolding = 0; this.ec = 0;
    this.envLevel = 0.5 * AY_VOLUME[this.eStep ^ this.eAtt];
  }
  envStep() {
    if (this.eHolding) return;
    this.eStep--;
    if (this.eStep < 0) {
      if (this.eHold) { if (this.eAlt) this.eAtt ^= 15; this.eHolding = 1; this.eStep = 0; }
      else { if (this.eAlt) this.eAtt ^= 15; this.eStep = 15; }
    }
    this.envLevel = 0.5 * AY_VOLUME[this.eStep ^ this.eAtt];
  }
  tick() {
    const tp = this.tp, tc = this.tc, tb = this.tb;
    for (let i = 0; i < 3; i++) {
      let c = tc[i] + 2; const p = tp[i];
      if (c >= p) { c -= p; if (c >= p) c %= p; tb[i] ^= 1; }
      tc[i] = c;
    }
    if (++this.nc >= this.np) {
      this.nc = 0; const l = this.lfsr;
      this.lfsr = (l >> 1) | (((l ^ (l >> 3)) & 1) << 16);
      this.nb = this.lfsr & 1;
    }
    if (++this.ec >= this.ep) { this.ec = 0; this.envStep(); }
    const reg = this.reg, mix = reg[7], nb = this.nb, ev = this.envLevel, lvl = this.lvl;
    let l = (reg[8] & 16) ? ev : lvl[0];
    this.o0 = ((tb[0] | (mix & 1)) & (nb | ((mix >> 3) & 1))) ? l : -l;
    l = (reg[9] & 16) ? ev : lvl[1];
    this.o1 = ((tb[1] | ((mix >> 1) & 1)) & (nb | ((mix >> 4) & 1))) ? l : -l;
    l = (reg[10] & 16) ? ev : lvl[2];
    this.o2 = ((tb[2] | ((mix >> 2) & 1)) & (nb | ((mix >> 5) & 1))) ? l : -l;
  }
}

// ---------------------------------------------------------------- 波形メモリ音源 1 音
export class WaveChannel {
  constructor() { this.tbl = new Float64Array(32); this.raw = new Uint8Array(32); this.reset(); }
  reset() { this.period = 1; this.c = 0; this.pos = 0; this.vol = 0; this.lvl = 0; this.raw.fill(8); this.tbl.fill(0); this.name = ''; }
  setTable(samples) { for (let i = 0; i < 32; i++) { const v = samples[i] & 15; this.raw[i] = v; this.tbl[i] = (v - 7.5) / 15; } }
  setPeriod(p) { this.period = (p & 4095) || 1; }
  setVolume(v) { this.vol = v & 15; this.lvl = this.vol / 15; }
  tick() {
    let c = this.c + 16; const p = this.period;
    if (c >= p) { let pos = this.pos; do { c -= p; pos = (pos + 1) & 31; } while (c >= p); this.pos = pos; }
    this.c = c;
  }
  get out() { return this.tbl[this.pos] * this.lvl; }
}

// 曲の 1 トラック分の再生状態
function newTrack(key, comp) {
  return { key, ev: comp.events, idx: 0, loopIdx: Math.max(0, comp.loopIndex), wait: 0, gate: 0, done: comp.events.length === 0,
    cur: null, inst: INSTRUMENTS.lead, keyOn: false, envPos: 0, nf: 0, lastEnv: 0, outVol: 0, prevLeg: false,
    drum: null, dpos: 0, dvol: 15, waveName: '' };
}

const SLEW_SEC = 0.005; // 曲の開始・停止・一時停止の 5ms フェード

export class ChipSynth {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.ticksPerSample = TICK_RATE / sampleRate;
    this.samplesPerFrame = sampleRate / FRAME_RATE;
    this.psgA = new PSG(); this.psgB = new PSG();
    this.wave = [new WaveChannel(), new WaveChannel()];
    this.lpA = 1 - Math.exp(-2 * Math.PI * 13000 / TICK_RATE);
    this.dcR = Math.exp(-2 * Math.PI * 20 / sampleRate);
    this.limRel = Math.exp(-1 / (0.15 * sampleRate));
    this.fadeStep = 1 / (SLEW_SEC * sampleRate);
    this.volStep = 1 / (0.02 * sampleRate);
    this.echoLen = Math.max(1, Math.round(0.17 * sampleRate));
    this.echoL = new Float32Array(this.echoLen); this.echoR = new Float32Array(this.echoLen);
    this._cache = new Map();
    this.events = [];
    this.reset();
  }

  static get songIds() { return Object.keys(SONGS); }
  static get sfxNames() { return Object.keys(SFX); }

  reset() {
    this.psgA.reset(); this.psgB.reset(); this.wave[0].reset(); this.wave[1].reset();
    this.frameAcc = 0; this.tickAcc = 0; this.frameNo = 0; this.samplePos = 0;
    this.song = null; this.pending = null; this.paused = false; this.arrange = false;
    this.fade = 0; this.fadeTarget = 0;
    this.vol = { master: 1, bgm: 1, sfx: 1 }; this.volNow = { master: 1, bgm: 1, sfx: 1 };
    this.sfxCh = [null, null, null]; this.sfxGain = [1, 1, 1]; this.sfxKill = [false, false, false]; this.sfxSerial = 0;
    // フィルタの状態（m=曲 左, n=曲 右, s=効果音）
    this.m1 = 0; this.m2 = 0; this.n1 = 0; this.n2 = 0; this.s1 = 0; this.s2 = 0;
    this.dcxL = 0; this.dcyL = 0; this.dcxR = 0; this.dcyR = 0; this.limEnv = 0;
    this.echoL.fill(0); this.echoR.fill(0); this.echoPos = 0;
    this.events.length = 0;
  }

  // ------------------------------------------------------------ レジスタ直接
  writePSG(chip, reg, value) { (chip ? this.psgB : this.psgA).write(reg, value); }
  readPSG(chip, reg) { return (chip ? this.psgB : this.psgA).read(reg); }
  setWaveTable(ch, samples) { this.wave[ch & 1].setTable(samples); }
  setWavePeriod(ch, p) { this.wave[ch & 1].setPeriod(p); }
  setWaveVolume(ch, v) { this.wave[ch & 1].setVolume(v); }

  // ------------------------------------------------------------ 曲
  compiled(id) {
    if (!this._cache.has(id)) { const s = SONGS[id]; if (!s) return null; this._cache.set(id, compileSong(id, s)); }
    return this._cache.get(id);
  }
  // 同じ曲が鳴っている間にもう一度呼んでも頭に戻らない（{restart:true} で頭から）
  playMusic(id, opts = {}) {
    if (!SONGS[id]) return false;
    const cur = this.pending && this.pending.act === 'play' ? this.pending.id : (this.pending && this.pending.act === 'stop' ? null : (this.song && !this.song.ending ? this.song.id : null));
    if (!opts.restart && cur === id) return true;
    if (this.song && this.fade > 0) { this.pending = { act: 'play', id }; this.fadeTarget = 0; }
    else { this.pending = null; this._startSong(id); }
    return true;
  }
  stopMusic() {
    if (this.song) { this.pending = { act: 'stop' }; this.fadeTarget = 0; if (this.fade <= 0) this._doPending(); }
    else this.pending = null;
  }
  isMusicPlaying() { return !!this.song && !this.song.ending && !(this.pending && this.pending.act === 'stop'); }
  get currentMusic() { return this.song ? this.song.id : null; }
  musicPosition() {
    const s = this.song; if (!s) return { id: null, frame: 0, tick: 0, loops: 0, seconds: 0 };
    return { id: s.id, frame: s.frame, tick: s.tick, loops: s.loops, seconds: s.frame / FRAME_RATE };
  }
  _startSong(id) {
    const comp = this.compiled(id);
    this._silenceMusic();
    const tracks = [];
    for (const key of Object.keys(comp.tracks)) tracks.push(newTrack(key, comp.tracks[key]));
    this.song = { id, comp, tracks, tickAcc: 0, tick: 0, frame: 0, loops: 0, ending: false, endFrames: 0, startSample: this.samplePos, introMarked: false };
    this.psgA.write(7, 0x3f);
    this.fade = 0; this.fadeTarget = this.paused ? 0 : 1;
    this._event({ type: 'start', id, sample: this.samplePos });
  }
  _silenceMusic() {
    const a = this.psgA; a.write(8, 0); a.write(9, 0); a.write(10, 0); a.write(7, 0x3f);
    this.wave[0].setVolume(0); this.wave[1].setVolume(0);
  }
  _doPending() {
    const p = this.pending; this.pending = null;
    if (!p) return;
    if (p.act === 'stop') { const id = this.song && this.song.id; this._silenceMusic(); this.song = null; if (p.ended && id) this._event({ type: 'ended', id, sample: this.samplePos }); }
    else if (p.act === 'play') this._startSong(p.id);
  }

  _trackTick(t, song) {
    if (t.done) return;
    while (t.wait <= 0) {
      if (t.idx >= t.ev.length) {
        if (song.comp.loop) {
          t.idx = t.loopIdx;
          if (t === song.tracks[0]) { song.loops++; this._event({ type: 'loop', id: song.id, n: song.loops, sample: this.samplePos }); }
        } else { t.done = true; t.keyOn = false; return; }
        if (t.idx >= t.ev.length) { t.done = true; return; }
      }
      const e = t.ev[t.idx++];
      if (e.t === 'n') {
        const legato = t.prevLeg && t.keyOn && t.cur;
        t.cur = e; t.inst = INSTRUMENTS[e.inst] || INSTRUMENTS.lead;
        if (!legato) { t.envPos = 0; t.nf = 0; }
        t.keyOn = true; t.gate = e.leg ? e.len : Math.max(1, Math.floor(e.len * e.q / 8)); t.prevLeg = e.leg; t.wait = e.len;
      } else if (e.t === 'd') {
        t.drum = DRUMS[e.d]; t.dpos = 0; t.dvol = e.vol; t.wait = e.len;
      } else { t.keyOn = false; t.prevLeg = false; t.wait = e.len; }
    }
    t.wait--;
    if (t.gate > 0 && --t.gate === 0) t.keyOn = false;
  }

  _musicFrame() {
    const song = this.song;
    if (!song.ending) {
      song.tickAcc += song.comp.tpf;
      while (song.tickAcc >= 1) {
        song.tickAcc -= 1;
        for (const t of song.tracks) this._trackTick(t, song);
        song.tick++;
        if (!song.introMarked && song.comp.loop && song.tick === song.comp.loopTick) { song.introMarked = true; this._event({ type: 'loopStart', id: song.id, sample: this.samplePos }); }
      }
      if (song.tracks.every((t) => t.done)) song.ending = true;
    }
    let anyVol = 0;
    for (const t of song.tracks) anyVol += this._trackOutput(t);
    song.frame++;
    if (song.ending) {
      song.endFrames++;
      if ((anyVol === 0 || song.endFrames > 120) && !this.pending) { this.pending = { act: 'stop', ended: true }; this.fadeTarget = 0; }
    }
  }

  _trackOutput(t) {
    const key = t.key;
    if (key === 'D') {
      const a = this.psgA; let vol = 0;
      if (t.drum && t.dpos < t.drum.length) {
        const f = t.drum[t.dpos++];
        vol = Math.max(0, f[2] - (15 - t.dvol));
        let mix = a.reg[7] | 0x24;
        if (f[0] > 0) { a.write(4, f[0] & 255); a.write(5, f[0] >> 8); mix &= ~0x04; }
        if (f[1] > 0) { a.write(6, f[1]); mix &= ~0x20; }
        a.write(7, mix);
      }
      a.write(10, vol); t.outVol = vol; return vol;
    }
    const inst = t.inst, e = t.cur;
    let v = 0;
    if (e) {
      if (t.keyOn) { const env = inst.env; v = env[Math.min(t.envPos, env.length - 1)]; t.envPos++; t.lastEnv = v; }
      else { t.lastEnv = Math.max(0, t.lastEnv - (inst.rel || 2)); v = t.lastEnv; }
    }
    const vol = e ? Math.max(0, Math.min(15, v - (15 - e.vol))) : 0;
    let freq = 440;
    if (e && vol > 0) {
      let semi = e.m;
      if (e.arp) semi += e.arp[Math.floor(t.nf / (inst.arpRate || 1)) % e.arp.length];
      let cents = e.det;
      const vib = inst.vib;
      if (vib && t.nf >= vib[0]) { const k = t.nf - vib[0]; const ramp = Math.min(1, k / 10); cents += vib[1] * ramp * Math.sin(2 * Math.PI * k / vib[2]); }
      const bend = inst.bend;
      if (bend && t.nf < bend[1]) cents += bend[0] * (1 - t.nf / bend[1]);
      if (inst.slide) cents += inst.slide * t.nf;
      freq = midiHz(semi) * Math.pow(2, cents / 1200);
    }
    if (e) t.nf++;
    if (key[0] === 'A') {
      const ch = key.charCodeAt(1) - 48, a = this.psgA;
      if (vol > 0) { const p = psgPeriod(freq); a.write(ch * 2, p & 255); a.write(ch * 2 + 1, p >> 8); }
      a.write(7, (a.reg[7] | (9 << ch)) & ~(1 << ch));
      a.write(8 + ch, vol);
    } else {
      const w = this.wave[key.charCodeAt(1) - 48];
      const wn = inst.wave || 'bass';
      if (w.name !== wn) { w.setTable(WAVES[wn]); w.name = wn; }
      if (vol > 0) w.setPeriod(wavePeriod(freq));
      w.setVolume(vol);
    }
    t.outVol = vol;
    return vol;
  }

  // ------------------------------------------------------------ 効果音（PSG-B の 3 音）
  // 優先度: 新しい音の pri 以上… ではなく「新しい音の pri 以下」の音だけ奪える（同じ pri なら一番古いもの）。
  // 同じ効果音（同じ定義）をもう一度鳴らすと、重ねずに同じチャンネルで頭から鳴らし直す。
  sfx(name) {
    const def = SFX[name];
    if (!def) return -1;
    const ch = this.sfxCh;
    let pick = -1;
    for (let i = 0; i < 3; i++) if (ch[i] && ch[i].def === def) { pick = i; break; }
    if (pick < 0) for (let i = 0; i < 3; i++) if (!ch[i] && !this.sfxKill[i]) { pick = i; break; }
    if (pick < 0) for (let i = 0; i < 3; i++) if (!ch[i]) { pick = i; break; }
    if (pick < 0) {
      let best = -1;
      for (let i = 0; i < 3; i++) {
        const c = ch[i]; if (c.pri > def.pri) continue;
        if (best < 0 || c.pri < ch[best].pri || (c.pri === ch[best].pri && c.serial < ch[best].serial)) best = i;
      }
      pick = best;
    }
    if (pick < 0) return -1;
    const prev = ch[pick];
    if (prev && prev.def === def && prev.pos === 0) return pick; // 同じフレームに何度呼ばれても 1 回分
    ch[pick] = { name, def, pos: 0, pri: def.pri, serial: ++this.sfxSerial };
    this.sfxKill[pick] = false;
    return pick;
  }
  sfxActive() { return this.sfxCh.map((c) => (c ? c.name : null)); }
  _sfxFrame() {
    const b = this.psgB;
    for (let i = 0; i < 3; i++) {
      const s = this.sfxCh[i];
      if (!s) continue;
      const f = s.def.frames[s.pos++];
      if (!f) { b.write(8 + i, 0); b.write(7, b.reg[7] | (9 << i)); this.sfxCh[i] = null; continue; }
      let mix = b.reg[7] | (9 << i);
      if (f.p > 0) { b.write(i * 2, f.p & 255); b.write(i * 2 + 1, (f.p >> 8) & 15); mix &= ~(1 << i); }
      if (f.n > 0) { b.write(6, f.n & 31); mix &= ~(8 << i); }
      if (f.e) { b.write(11, f.e[1] & 255); b.write(12, (f.e[1] >> 8) & 255); b.write(13, f.e[0]); }
      b.write(7, mix);
      b.write(8 + i, f.v >= 16 ? 16 : Math.max(0, f.v | 0));
    }
  }
  _killSfx() { for (let i = 0; i < 3; i++) if (this.sfxCh[i]) this.sfxKill[i] = true; }

  // ------------------------------------------------------------ 設定
  setVolumes(v = {}) {
    for (const k of ['master', 'bgm', 'sfx']) if (typeof v[k] === 'number' && isFinite(v[k])) this.vol[k] = Math.max(0, Math.min(1, v[k]));
  }
  // 一時停止: 曲の進行を止めて曲を消す（5ms フェード）。鳴っている効果音も止める。
  // 一時停止中に新しく鳴らした効果音（ポーズ音など）は鳴る。解除すると同じ位置から続く。
  setPaused(on) {
    on = !!on; if (on === this.paused) return;
    this.paused = on;
    if (on) { this.fadeTarget = 0; this._killSfx(); }
    else if (this.song && !(this.pending && this.pending.act === 'stop')) this.fadeTarget = 1;
  }
  setArrange(on) { this.arrange = !!on; }

  // ------------------------------------------------------------ 波形を作る
  _frame() {
    this.frameNo++;
    if (this.song && !this.paused && !this.pending) this._musicFrame();
    this._sfxFrame();
  }

  render(out, offset = 0, n = out.length - offset) { this.renderStereo(out, null, offset, n); }

  renderStereo(L, R, offset = 0, n = L.length - offset) {
    const A = this.psgA, B = this.psgB, W0 = this.wave[0], W1 = this.wave[1];
    const lpA = this.lpA, dcR = this.dcR, vol = this.vol, vn = this.volNow, vs = this.volStep;
    const sg = this.sfxGain, sk = this.sfxKill;
    let m1 = this.m1, m2 = this.m2, n1 = this.n1, n2 = this.n2, s1 = this.s1, s2 = this.s2;
    for (let s = 0; s < n; s++) {
      if (this.frameAcc <= 0) {
        this.m1 = m1; this.m2 = m2; this.n1 = n1; this.n2 = n2; this.s1 = s1; this.s2 = s2;
        this._frame(); this.frameAcc += this.samplesPerFrame;
      }
      this.frameAcc -= 1;
      // 音量・フェードをなめらかに動かす
      if (vn.master !== vol.master || vn.bgm !== vol.bgm || vn.sfx !== vol.sfx) {
        let d = vol.master - vn.master; vn.master += Math.abs(d) <= vs ? d : (d > 0 ? vs : -vs);
        d = vol.bgm - vn.bgm; vn.bgm += Math.abs(d) <= vs ? d : (d > 0 ? vs : -vs);
        d = vol.sfx - vn.sfx; vn.sfx += Math.abs(d) <= vs ? d : (d > 0 ? vs : -vs);
      }
      const fd = this.fadeTarget - this.fade;
      this.fade += Math.abs(fd) <= this.fadeStep ? fd : (fd > 0 ? this.fadeStep : -this.fadeStep);
      if (this.fade <= 0 && this.pending) this._doPending();
      for (let i = 0; i < 3; i++) {
        const t = sk[i] ? 0 : 1, d = t - sg[i];
        sg[i] += Math.abs(d) <= this.fadeStep ? d : (d > 0 ? this.fadeStep : -this.fadeStep);
        if (sk[i] && sg[i] <= 0) { sk[i] = false; sg[i] = 1; if (this.sfxCh[i]) { this.sfxCh[i] = null; B.write(8 + i, 0); B.write(7, B.reg[7] | (9 << i)); } }
      }
      const gM = this.fade * vn.bgm, gS = vn.sfx * GAIN_PSG_B;
      const g0 = sg[0] * gS, g1 = sg[1] * gS, g2 = sg[2] * gS;
      const arr = this.arrange;
      this.tickAcc += this.ticksPerSample;
      const k = this.tickAcc | 0; this.tickAcc -= k;
      let accL = 0, accR = 0, accS = 0;
      for (let j = 0; j < k; j++) {
        A.tick(); B.tick(); W0.tick(); W1.tick();
        const w0 = W0.out * GAIN_WAVE, w1 = W1.out * GAIN_WAVE;
        const a0 = A.o0 * GAIN_PSG_A, a1 = A.o1 * GAIN_PSG_A, a2 = A.o2 * GAIN_PSG_A;
        let xl, xr;
        if (arr) { xl = a0 + a1 * 1.25 + a2 * 0.85 + w0 + w1 * 0.75; xr = a0 + a1 * 0.75 + a2 * 1.15 + w0 + w1 * 1.25; }
        else xl = a0 + a1 + a2 + w0 + w1;
        m1 += lpA * (xl * gM - m1); m2 += lpA * (m1 - m2); accL += m2;
        if (arr) { n1 += lpA * (xr * gM - n1); n2 += lpA * (n1 - n2); accR += n2; }
        const xs = B.o0 * g0 + B.o1 * g1 + B.o2 * g2;
        s1 += lpA * (xs - s1); s2 += lpA * (s1 - s2); accS += s2;
      }
      let ml, mr, sx;
      if (k > 0) { ml = accL / k; mr = arr ? accR / k : ml; sx = accS / k; } else { ml = m2; mr = arr ? n2 : m2; sx = s2; }
      if (arr) {
        // 軽いピンポン・エコー（曲だけ）
        const p = this.echoPos, dl = this.echoL[p], dr = this.echoR[p];
        this.echoL[p] = ml + dr * 0.3; this.echoR[p] = mr + dl * 0.3;
        this.echoPos = p + 1 >= this.echoLen ? 0 : p + 1;
        ml += dl * 0.16; mr += dr * 0.16;
      }
      let xl = (ml + sx) * vn.master, xr = (mr + sx) * vn.master;
      // 直流カット
      let y = xl - this.dcxL + dcR * this.dcyL; this.dcxL = xl; this.dcyL = y; xl = y;
      if (arr) { y = xr - this.dcxR + dcR * this.dcyR; this.dcxR = xr; this.dcyR = y; xr = y; } else xr = xl;
      // ピーク抑え: 0.8 を超えそうなら全体を下げ、ゆっくり戻す。最後に柔らかく丸める
      const pk = Math.max(Math.abs(xl), Math.abs(xr));
      this.limEnv = pk > this.limEnv ? pk : this.limEnv * this.limRel;
      if (this.limEnv > 0.8) { const g = 0.8 / this.limEnv; xl *= g; xr *= g; }
      xl = softClip(xl); xr = softClip(xr);
      if (arr && !R) xl = 0.5 * (xl + xr);
      L[offset + s] = xl;
      if (R) R[offset + s] = xr;
      this.samplePos++;
    }
    this.m1 = m1; this.m2 = m2; this.n1 = n1; this.n2 = n2; this.s1 = s1; this.s2 = s2;
  }

  // 次のイベント（'start' 'loopStart' 'loop' 'ended'）を取り出す
  drainEvents() { const e = this.events.slice(); this.events.length = 0; return e; }
  _event(e) { if (this.events.length < 256) this.events.push(e); }
}

function softClip(x) {
  const a = Math.abs(x);
  if (a <= 0.85) return x;
  const y = 0.85 + 0.13 * Math.tanh((a - 0.85) / 0.13);
  return x < 0 ? -y : y;
}
