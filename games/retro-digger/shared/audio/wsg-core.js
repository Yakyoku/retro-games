// 音源の中身（ナムコ WSG 方式を参考にした自作の波形メモリ音源 + 曲の順送り + 洞窟の環境音）。
// AudioWorklet の中でも、ScriptProcessor の予備経路でも、Node のテストでも同じこのクラスを動かす。
// Web Audio の API は一切使わない（数値の配列に書き込むだけ）。
//
// 時代の基板との違い（意図した逸脱）:
//  - 原作の基板は 3 音。ここでは曲用 3 声 + 効果音用 4 声の計 7 声にし、効果音が曲の声を奪わないようにした。
//  - 音量は 4 ビット（0〜15）の段で決めるが、段の切り替わりは 1.5ms でならしてクリックを防ぐ。
//  - 波形の読み出しは 2 倍の細かさで平均し、出力に軽い低域通過・直流除去・リミッターをかける。
import { WAVES, STEPS } from './waves.js';
import { TRACKS, JINGLES, JINGLE_TAIL, PPQ } from './tracks.js';
import { SFX, SFX_META } from './sfx-defs.js';
import { midiToHz } from './mml.js';

export const MUSIC_VOICES = 3;
export const SFX_VOICES = 4;
const CTRL = 16;             // 制御の更新間隔（サンプル）
const MUSIC_LEVEL = 0.27;    // 1 声の最大の大きさ
const SFX_LEVEL = 0.3;

// 洞窟の環境音の設定（現代的な控えめの音。WSG ではなく正弦とノイズで作る）
export const AMB = {
  soil:    { lp: 170, air: 0.05, lfo: 0.07, drip: [1.6, 4.5], f: [900, 1400], rise: 1.7, dec: 0.05, amp: 0.07, partial: 0, fb: 0.3, mix: 0.35, crackle: 0 },
  crystal: { lp: 420, air: 0.03, lfo: 0.05, drip: [0.7, 2.2], f: [1800, 3200], rise: 1.25, dec: 0.13, amp: 0.05, partial: 2.76, fb: 0.45, mix: 0.5, crackle: 0 },
  volcano: { lp: 85, air: 0.085, lfo: 0.11, drip: [1.2, 3.5], f: [120, 260], rise: 2.2, dec: 0.09, amp: 0.08, partial: 0, fb: 0.25, mix: 0.3, crackle: 2.5 },
};

function voice() {
  return { ph: 0, inc: 0, f: 0, w: 0, vol: 0, tgt: 0, gl: 1, gr: 1,
    // 曲用
    on: false, level: 0, decay: 0, sus: 0, gate: 0, vib: 0, vph: 0, age: 0,
    // 効果音用
    segs: null, si: 0, t: 0, len: 0, cf: 0, fr: 1, cv: 0, dv: 0, delay: 0, name: '', prio: 0, start: 0, gain: 1,
    vibR: 0, vibD: 0, jitHz: 0, jitS: 0, jitAcc: 0, jitOff: 0, tremR: 0, tremD: 0, tph: 0 };
}
const balance = (v, p) => { p = Math.max(-1, Math.min(1, p || 0)); v.gl = Math.min(1, 1 - p); v.gr = Math.min(1, 1 + p); };

export class WSGCore {
  constructor(sampleRate = 48000) {
    const sr = (this.sr = sampleRate);
    this.frame = 0;
    this.mv = Array.from({ length: MUSIC_VOICES }, voice);
    this.sv = Array.from({ length: SFX_VOICES }, voice);
    this.seq = null; this.saved = null; this.walking = false;
    this.vols = { master: 0.8, bgm: 0.7, sfx: 0.9, amb: 0.5 }; this.muted = false;
    this.gm = 0; this.gs = 0; this.ga = 0;
    this.kVol = 1 - Math.exp(-1 / (sr * 0.0015));
    this.kGain = 1 - Math.exp(-1 / (sr * 0.02));
    this.kLP = 1 - Math.exp((-2 * Math.PI * 9000) / sr);
    this.lp = [0, 0, 0, 0]; this.dc = [0, 0, 0, 0]; this.lim = 0;
    this.kRel = 1 - Math.exp(-1 / (sr * 0.12));
    this.last = Object.create(null); this.queue = [];
    this.seed = 0x1234567; this.emit = () => {};
    this.posTimer = 0;
    // 環境音
    this.amb = null; this.ambLvl = 0; this.ambTgt = 0; this.kAmb = 0;
    this.drips = Array.from({ length: 8 }, () => ({ on: false, ph: 0, f: 0, fr: 1, ftop: 0, env: 0, dec: 1, pan: 0, partial: 0, noise: false }));
    const dl = Math.ceil(sr * 0.4);
    this.dlL = new Float32Array(dl); this.dlR = new Float32Array(dl); this.dlPos = 0;
    this.dlTapL = Math.round(sr * 0.27); this.dlTapR = Math.round(sr * 0.33); this.dlLp = [0, 0];
  }

  rand() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }

  // ---- 外からの命令 ----
  handle(m) {
    if (!m || typeof m !== 'object') return;
    if (m.at != null && m.at > this.frame) { this.queue.push(m); this.queue.sort((a, b) => a.at - b.at); return; }
    switch (m.type) {
      case 'vol':
        for (const k of ['master', 'bgm', 'sfx', 'amb']) if (Number.isFinite(m[k])) this.vols[k] = Math.max(0, Math.min(1, m[k]));
        if (m.muted != null) this.muted = !!m.muted;
        break;
      case 'walk': this.walking = !!m.on; break;
      case 'music': this.startMusic(m.name); break;
      case 'musicStop':
        if (this.seq && this.seq.jingle) this.saved = null; else { this.seq = null; this.releaseMusic(); }
        break;
      case 'jingle': this.startJingle(m.name, m.id); break;
      case 'sfx': this.playSfx(m.name, m.opts || {}); break;
      case 'amb': this.startAmb(m.kind); break;
      case 'ambStop': this.ambTgt = 0; this.kAmb = 1 - Math.exp(-1 / (this.sr * 0.5)); break;
      case 'stopAll': this.stopAll(); break;
    }
  }

  makeSeq(tr, extra) {
    return { tr, spt: (this.sr * 60) / (tr.bpm * PPQ), left: 0, tick: -1, ptr: tr.ch.map(() => 0), ended: false, tail: 0, ...extra };
  }
  startMusic(name) {
    const tr = TRACKS[name];
    if (!tr) return;
    const s = this.makeSeq(tr, { name, jingle: false });
    if (this.seq && this.seq.jingle) { this.saved = s; return; }
    this.releaseMusic();
    this.seq = s;
  }
  startJingle(name, id) {
    const tr = JINGLES[name];
    if (!tr) { this.emit({ type: 'jingleEnd', id }); return; }
    if (this.seq && this.seq.jingle) this.emit({ type: 'jingleEnd', id: this.seq.id });
    else if (this.seq) this.saved = this.seq;
    this.releaseMusic();
    this.seq = this.makeSeq(tr, { name, jingle: true, id });
  }
  releaseMusic() { for (const v of this.mv) { v.on = false; v.tgt = 0; } }

  stopAll() {
    if (this.seq && this.seq.jingle) this.emit({ type: 'jingleEnd', id: this.seq.id });
    this.seq = null; this.saved = null; this.queue.length = 0;
    this.releaseMusic();
    for (const v of this.sv) { v.segs = null; v.tgt = 0; }
    this.ambTgt = 0; this.kAmb = 1 - Math.exp(-1 / (this.sr * 0.03));
  }

  // ---- 効果音 ----
  playSfx(name, opts) {
    const def = SFX[name];
    if (typeof def !== 'function') return;   // 知らない名前は黙って無視
    const meta = SFX_META[name] || {}, prio = meta.prio ?? 1;
    if (meta.gap && this.last[name] != null && this.frame - this.last[name] < meta.gap * this.sr) return;
    this.last[name] = this.frame;
    if (meta.mono) for (const v of this.sv) if (v.name === name && v.segs) { v.segs = null; v.tgt = 0; }
    const gain = Number.isFinite(opts.gain) ? Math.max(0, Math.min(1, opts.gain)) : 1;
    for (const layer of def(opts)) {
      let pick = null;
      for (const v of this.sv) if (!v.segs && (!pick || v.vol < pick.vol)) pick = v;
      if (!pick) for (const v of this.sv) if (v.prio <= prio && (!pick || v.prio < pick.prio || (v.prio === pick.prio && v.start < pick.start))) pick = v;
      if (!pick) continue;
      Object.assign(pick, { segs: layer.segs, si: 0, delay: Math.round((layer.at || 0) * this.sr), name, prio, start: this.frame, gain, tgt: 0 });
      balance(pick, (opts.pan || 0) + (layer.pan || 0));
      this.startSeg(pick);
    }
  }
  startSeg(v) {
    const g = v.segs[v.si];
    v.len = Math.max(CTRL, Math.round(g.d * this.sr)); v.t = 0;
    v.cf = g.f; v.fr = Math.pow((g.f2 ?? g.f) / g.f, CTRL / v.len);
    v.cv = g.v; v.dv = (((g.v2 ?? g.v) - g.v) * CTRL) / v.len; v.w = g.w;
    [v.vibR, v.vibD] = g.vib || [0, 0]; [v.jitHz, v.jitS] = g.jit || [0, 0]; [v.tremR, v.tremD] = g.trem || [0, 0];
  }
  ctrlSfx(v) {
    if (!v.segs) { v.tgt = 0; return; }
    if (v.delay > 0) { v.delay -= CTRL; v.tgt = 0; return; }
    let semi = 0, amp = 1;
    if (v.vibR) { v.vph += (2 * Math.PI * v.vibR * CTRL) / this.sr; semi += v.vibD * Math.sin(v.vph); }
    if (v.jitHz) { v.jitAcc += (v.jitHz * CTRL) / this.sr; if (v.jitAcc >= 1) { v.jitAcc %= 1; v.jitOff = (this.rand() * 2 - 1) * v.jitS; } semi += v.jitOff; }
    if (v.tremR) { v.tph += (2 * Math.PI * v.tremR * CTRL) / this.sr; amp = 1 - v.tremD * (0.5 + 0.5 * Math.sin(v.tph)); }
    v.inc = (v.cf * Math.pow(2, semi / 12) * STEPS) / this.sr;
    v.tgt = Math.round(Math.max(0, Math.min(15, v.cv)) * amp) * v.gain;
    v.cf *= v.fr; v.cv += v.dv; v.t += CTRL;
    if (v.t >= v.len) { if (++v.si < v.segs.length) this.startSeg(v); else { v.segs = null; v.name = ''; } }
  }

  // ---- 曲 ----
  advancing() { const s = this.seq; return !!s && !s.ended && (!s.tr.gated || this.walking); }
  tick() {
    const s = this.seq;
    s.tick++;
    if (s.tick >= s.tr.ticks) {
      if (s.tr.loop) { s.tick = 0; s.ptr.fill(0); }
      else { s.ended = true; s.tail = Math.round(JINGLE_TAIL * this.sr); this.releaseMusic(); return; }
    }
    s.tr.ch.forEach((ch, i) => {
      const ev = ch.events;
      while (s.ptr[i] < ev.length && ev[s.ptr[i]].t === s.tick) this.noteOn(this.mv[i], ev[s.ptr[i]++], ch, s.spt);
    });
  }
  noteOn(v, e, ch, spt) {
    v.f = midiToHz(e.n); v.w = e.w; v.level = e.v; v.decay = ((ch.decay || 0) * CTRL) / this.sr;
    v.sus = Math.min(ch.sus ?? e.v, e.v); v.gate = e.g * spt; v.on = true; v.age = 0; v.vib = ch.vib || 0;
    balance(v, ch.pan); v.inc = (v.f * STEPS) / this.sr;
  }
  ctrlMusic(v, adv) {
    if (v.on && adv) {
      v.gate -= CTRL; v.age += CTRL;
      v.level = Math.max(v.sus, v.level - v.decay);
      if (v.gate <= 0) v.on = false;
    }
    v.tgt = v.on && adv ? Math.round(v.level) : 0;
    let mul = 1;
    if (v.vib && v.age > this.sr * 0.14) { v.vph += (2 * Math.PI * 5.5 * CTRL) / this.sr; mul = Math.pow(2, (v.vib * Math.sin(v.vph)) / 12); }
    v.inc = (v.f * mul * STEPS) / this.sr;
  }

  // ---- 環境音 ----
  startAmb(kind) {
    const cfg = AMB[kind];
    if (!cfg) return;
    this.amb = { cfg, kind, n: [0, 0, 0, 0], lfo: 0, next: Math.round(this.sr * 0.6), kLp: 1 - Math.exp((-2 * Math.PI * cfg.lp) / this.sr) };
    this.ambTgt = 1; this.kAmb = 1 - Math.exp(-1 / (this.sr * 0.8));
  }
  spawnDrip(cfg, noise) {
    const d = this.drips.find((x) => !x.on);
    if (!d) return;
    const sr = this.sr;
    d.on = true; d.noise = noise; d.ph = 0; d.pan = this.rand() * 1.6 - 0.8; d.partial = cfg.partial;
    if (noise) { d.env = cfg.amp * (0.3 + 0.4 * this.rand()); d.dec = Math.exp(-1 / (sr * 0.004)); return; }
    d.f = cfg.f[0] + (cfg.f[1] - cfg.f[0]) * this.rand(); d.ftop = d.f * cfg.rise;
    d.fr = Math.pow(cfg.rise, 1 / (sr * 0.03));
    d.env = cfg.amp * (0.5 + 0.5 * this.rand()); d.dec = Math.exp(-1 / (sr * cfg.dec));
  }
  renderAmb(out, i) {
    const a = this.amb, c = a.cfg, sr = this.sr;
    if (--a.next <= 0) { this.spawnDrip(c, false); a.next = Math.round(sr * (c.drip[0] + (c.drip[1] - c.drip[0]) * this.rand())); }
    if (c.crackle && this.rand() < c.crackle / sr) this.spawnDrip(c, true);
    a.lfo += (2 * Math.PI * c.lfo) / sr;
    const sw = c.air * (0.7 + 0.3 * Math.sin(a.lfo)), n = a.n, k = a.kLp;
    n[0] += (this.rand() * 2 - 1 - n[0]) * k; n[1] += (n[0] - n[1]) * k;
    n[2] += (this.rand() * 2 - 1 - n[2]) * k; n[3] += (n[2] - n[3]) * k;
    // 2 段の低域通過で小さくなった分を戻す（おおよそ）
    const comp = Math.min(12, Math.sqrt(sr / (4 * c.lp)));
    let dl = 0, dr = 0;
    for (const d of this.drips) {
      if (!d.on) continue;
      let s;
      if (d.noise) s = (this.rand() * 2 - 1) * d.env;
      else {
        d.ph += (2 * Math.PI * d.f) / sr; if (d.f < d.ftop) d.f *= d.fr;
        s = (Math.sin(d.ph) + (d.partial ? 0.35 * Math.sin(d.ph * d.partial) : 0)) * d.env;
      }
      d.env *= d.dec; if (d.env < 1e-5) d.on = false;
      dl += s * (1 - Math.max(0, d.pan)); dr += s * (1 + Math.min(0, d.pan));
    }
    // 雫だけに薄いこだま（主な音色には残響をかけない）
    const L = this.dlL, R = this.dlR, len = L.length, p = this.dlPos;
    const eL = L[(p - this.dlTapL + len) % len], eR = R[(p - this.dlTapR + len) % len];
    this.dlLp[0] += (eL - this.dlLp[0]) * 0.35; this.dlLp[1] += (eR - this.dlLp[1]) * 0.35;
    L[p] = dl + this.dlLp[1] * c.fb; R[p] = dr + this.dlLp[0] * c.fb; this.dlPos = (p + 1) % len;
    out[0] = n[1] * sw * comp + dl + this.dlLp[0] * c.mix;
    out[1] = n[3] * sw * comp + dr + this.dlLp[1] * c.mix;
  }

  // ---- 書き出し ----
  render(outL, outR, n) {
    const W = WAVES, kv = this.kVol, kg = this.kGain, kLP = this.kLP, lp = this.lp, dc = this.dc, vols = this.vols;
    const mute = this.muted ? 0 : vols.master;
    const tm = mute * vols.bgm, ts = mute * vols.sfx, ta = mute * vols.amb;
    const amb = [0, 0];
    for (let i = 0; i < n; i++) {
      while (this.queue.length && this.queue[0].at <= this.frame) { const m = this.queue.shift(); m.at = null; this.handle(m); }
      const s = this.seq, adv = this.advancing();
      if (s) {
        if (s.ended) {
          if (--s.tail <= 0) { this.emit({ type: 'jingleEnd', id: s.id }); this.seq = this.saved; this.saved = null; }
        } else if (adv && --s.left <= 0) { s.left += s.spt; this.tick(); }
      }
      if ((this.frame & (CTRL - 1)) === 0) {
        const a2 = this.advancing();
        for (const v of this.mv) this.ctrlMusic(v, a2);
        for (const v of this.sv) this.ctrlSfx(v);
        if (this.seq && !this.seq.jingle && ++this.posTimer >= 256) { this.posTimer = 0; this.emit({ type: 'pos', name: this.seq.name, tick: this.seq.tick, ticks: this.seq.tr.ticks, running: a2 }); }
      }
      let ml = 0, mr = 0, sl = 0, sr = 0;
      for (const v of this.mv) {
        v.vol += (v.tgt - v.vol) * kv;
        if (v.vol < 1e-4 && !v.tgt) { v.vol = 0; continue; }
        const w = W[v.w] || W[0], h = v.inc * 0.5;
        const x = ((w[(v.ph | 0) & 31] + w[((v.ph + h) | 0) & 31]) * 0.5 - 7.5) / 7.5 * (v.vol / 15);
        v.ph = (v.ph + v.inc) % STEPS;
        ml += x * v.gl; mr += x * v.gr;
      }
      for (const v of this.sv) {
        v.vol += (v.tgt - v.vol) * kv;
        if (v.vol < 1e-4 && !v.tgt) { v.vol = 0; continue; }
        const w = W[v.w] || W[0], h = v.inc * 0.5;
        const x = ((w[(v.ph | 0) & 31] + w[((v.ph + h) | 0) & 31]) * 0.5 - 7.5) / 7.5 * (v.vol / 15);
        v.ph = (v.ph + v.inc) % STEPS;
        sl += x * v.gl; sr += x * v.gr;
      }
      this.gm += (tm - this.gm) * kg; this.gs += (ts - this.gs) * kg; this.ga += (ta - this.ga) * kg;
      let l = (ml * MUSIC_LEVEL) * this.gm + (sl * SFX_LEVEL) * this.gs;
      let r = (mr * MUSIC_LEVEL) * this.gm + (sr * SFX_LEVEL) * this.gs;
      // やわらかい低域通過（2 段）
      lp[0] += (l - lp[0]) * kLP; lp[1] += (lp[0] - lp[1]) * kLP; l = lp[1];
      lp[2] += (r - lp[2]) * kLP; lp[3] += (lp[2] - lp[3]) * kLP; r = lp[3];
      // 環境音（別の系統）
      this.ambLvl += (this.ambTgt - this.ambLvl) * this.kAmb;
      if (this.amb) {
        this.renderAmb(amb, i);
        l += amb[0] * this.ambLvl * this.ga; r += amb[1] * this.ambLvl * this.ga;
        if (!this.ambTgt && this.ambLvl < 1e-3) { this.amb = null; this.ambLvl = 0; }
      }
      // 直流除去
      const yl = l - dc[0] + 0.9995 * dc[1]; dc[0] = l; dc[1] = yl;
      const yr = r - dc[2] + 0.9995 * dc[3]; dc[2] = r; dc[3] = yr;
      // リミッター（瞬時に効いて 0.12 秒で戻る）と最終の安全装置
      const pk = Math.max(Math.abs(yl), Math.abs(yr));
      this.lim = pk > this.lim ? pk : this.lim + (pk - this.lim) * this.kRel;
      const g = this.lim > 0.85 ? 0.85 / this.lim : 1;
      outL[i] = clip(yl * g); outR[i] = clip(yr * g);
      this.frame++;
    }
  }

  // テスト用: いま鳴っている声の数
  activeVoices() { return { music: this.mv.filter((v) => v.vol > 1e-3).length, sfx: this.sv.filter((v) => v.segs || v.vol > 1e-3).length }; }
}

function clip(x) {
  if (!(x === x)) return 0; // NaN を通さない
  const a = Math.abs(x);
  if (a <= 0.9) return x;
  return Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}
