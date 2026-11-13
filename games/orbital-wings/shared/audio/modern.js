// ORBITAL WINGS — 「モダン」音源（ブラウザ API を使わない。AudioWorklet・ScriptProcessor・Node で同じコードが動く）
//
//   曲の声   … 4 オペレーター FM ／ 仮想アナログ（鋸・矩形・PWM・スーパーソー・三角・サイン・波形メモリ・ノイズ）
//               → 状態変数フィルター（エンベロープ・LFO・キー追従）→ 音量エンベロープ → 定位
//   打楽器   … 合成（キック・スネア・ハット・タム・クラッシュ・クラップ・リム・ライド）。キックがサイドチェインを叩く
//   効果音   … 層を重ねた専用の声（サイン・三角・鋸・矩形・ノイズ・FM・金属・破片）。優先度つきで曲の声は奪わない
//   空間     … 8 本の遅延線による残響（FDN）＋テンポ同期のピンポン・ディレイ（どちらもセンド）
//   マスター … 直流カット → バス圧縮 → ソフトクリップ → 先読みリミッター
//
// 音の計算（renderStereo）の中では配列もオブジェクトも作らない。すべて作成時に確保する。
// 同じ操作・同じ標本化周波数なら毎回同じ音になる（乱数は内部の決まった列）。
// 曲も効果音もこの作品のために作ったもの。既存のゲームの音や旋律は使っていない。

import { compileModernSong, TPQ } from './mml.js';
import { MSONGS } from './songs2.js';
import { PATCHES, DRUMKIT, WAVETABLES } from './patches.js';
import { MSFX } from './sfx2.js';

const CHUNK = 64;                 // 制御の刻み（標本数）。48kHz で 1.3ms
const LN2 = Math.LN2;
const N_MUSIC = 32, N_SFXV = 48, N_INST = 12;
const SINE = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) SINE[i] = Math.sin(2 * Math.PI * i / 4096);
// 位相（周回数。負でもよい、|x| < 64）→ サイン
function fsin(x) { x += 64; const f = (x - (x | 0)) * 4096; const i = f | 0; const a = SINE[i]; return a + (f - i) * (SINE[i + 1] - a); }

const OSC = { sine: 0, tri: 1, saw: 2, pulse: 3, super: 4, wt: 5 };
const FLT = { none: 0, lp: 1, bp: 2, hp: 3 };
const STYPE = { sine: 0, tri: 1, saw: 2, pulse: 3, noise: 4, fm: 5, dust: 6, metal: 7 };
const METAL = [1, 1.3420, 1.2312, 1.6532, 1.9523, 2.1523];
// アルゴリズムごとの「音として出るオペレーター」（op1..op4）
const FM_CAR = [[1, 0, 0, 0], [1, 0, 1, 0], [1, 0, 0, 0], [1, 0, 1, 1], [1, 1, 1, 1]];

const rate60 = (sec, sr) => 1 - Math.exp(-6.9 / (Math.max(sec, 0.0005) * sr));   // 1 標本あたり（sec で -60dB）

// ---------------------------------------------------------------- 音色を数値だけの形にする
function compilePatch(name, d, sr) {
  const a = d.amp || {}, f = d.flt || null, v = d.vib || null;
  const p = {
    name, fm: d.type === 'fm', stereo: false,
    aInc: 1 / (Math.max(a.a ?? 0.003, 0.0005) * sr), aDC: rate60(a.d ?? 0.3, sr), aS: a.s ?? 1, aRC: rate60(a.r ?? 0.12, sr),
    fType: f ? FLT[f.type || 'lp'] : 0, fCut: f ? f.cut : 0, fK: f ? 2 - 1.94 * Math.min(1, f.res ?? 0.1) : 2,
    fEnv: f ? f.env ?? 0 : 0, fAInc: f ? 1 / (Math.max(f.a ?? 0.002, 0.0005) * sr) : 0, fDK: f ? 6.9 / (Math.max(f.d ?? 0.2, 0.001) * sr) : 0,
    fS: f ? f.s ?? 0 : 0, fRK: f ? 6.9 / (Math.max(f.r ?? 0.2, 0.001) * sr) : 0, fKt: f ? f.kt ?? 0.3 : 0,
    fLfoR: f ? f.lfoR ?? 0 : 0, fLfoD: f ? f.lfoD ?? 0 : 0, fVel: f ? f.vel ?? 0.3 : 0,
    vibR: v ? v.rate : 0, vibD: v ? v.depth : 0, vibDelay: v ? (v.delay ?? 0.15) * sr : 0, vibRamp: v ? (v.ramp ?? 0.2) * sr : 1,
    porta: d.porta ?? 0, bend: d.bend ?? 0, bendT: (d.bendT ?? 0.03) * sr,
    gain: d.gain ?? 0.2, pan: d.pan ?? 0, rev: d.rev ?? 0, dly: d.dly ?? 0, duck: !!d.duck, drive: d.drive ?? 0,
    sub: d.sub ?? 0, noise: d.noise ?? 0, osc: [], alg: d.alg ?? 0, fb: d.fb ?? 0, ops: [], free: !!d.free,
  };
  if (p.fm) {
    const car = FM_CAR[p.alg];
    for (let j = 0; j < 4; j++) {
      const o = (d.ops && d.ops[j]) || { r: 1, l: 0 };
      p.ops.push({
        ratio: (o.r ?? 1) * Math.pow(2, (o.det ?? 0) / 1200), lvl: car[j] ? (o.l ?? 0) : (o.l ?? 0) / (2 * Math.PI), car: !!car[j],
        aInc: 1 / (Math.max(o.a ?? 0.002, 0.0005) * sr), dK: 6.9 / (Math.max(o.d ?? 0.3, 0.001) * sr), s: o.s ?? 1, rK: 6.9 / (Math.max(o.r2 ?? o.rel ?? 0.15, 0.001) * sr),
        vel: o.vel ?? (car[j] ? 0 : 0.5), ks: o.ks ?? (car[j] ? 0 : 0.5),
      });
    }
  } else {
    const list = (d.osc || [{ w: 'saw' }]).slice().sort((x, y) => (x.w === 'super' ? 1 : 0) - (y.w === 'super' ? 1 : 0));
    for (const o of list) {
      const c = {
        type: OSC[o.w] ?? 2, ratio: Math.pow(2, ((o.semi ?? 0) * 100 + (o.det ?? 0)) / 1200), lvl: o.lvl ?? 1,
        pw: o.pw ?? 0.5, pwmD: o.pwm ?? 0, pwmR: o.pwmRate ?? 0.6, tbl: null, n: 1, mul: null, gl: null, gr: null,
      };
      if (c.type === OSC.wt) c.tbl = WAVETABLES[o.table || 'organ'];
      if (c.type === OSC.super) {
        const n = c.n = o.n ?? 5, spread = o.spread ?? 22, width = o.width ?? 0.8;
        c.mul = new Float64Array(n); c.gl = new Float64Array(n); c.gr = new Float64Array(n);
        const norm = 1 / Math.sqrt(n);
        for (let m = 0; m < n; m++) {
          const k = n > 1 ? (m / (n - 1)) * 2 - 1 : 0;                 // -1..1
          c.mul[m] = Math.pow(2, (k * spread * (0.6 + 0.4 * Math.abs(k))) / 1200);
          const pos = (m % 2 ? 1 : -1) * Math.abs(k) * width;          // 交互に左右へ
          c.gl[m] = norm * Math.min(1, 1 - pos); c.gr[m] = norm * Math.min(1, 1 + pos);
        }
        if (width > 0) p.stereo = true;
      }
      p.osc.push(c);
    }
  }
  return p;
}

function compileDrum(key, d, sr) {
  const t = d.tone || null, n = d.noise || null, m = d.metal || null;
  return {
    key, slot: d.slot ?? key, gain: d.gain ?? 0.5, pan: d.pan ?? 0, rev: d.rev ?? 0.05, sc: !!d.sc, drive: d.drive ?? 0,
    tLvl: t ? t.lvl ?? 1 : 0, f0: t ? t.f0 : 0, f1: t ? t.f1 : 0, pK: t ? Math.exp(-1 / ((t.pt ?? 0.03) * sr)) : 0,
    tDC: t ? rate60(t.d ?? 0.2, sr) : 0, tHold: t ? (t.hold ?? 0) * sr : 0, f2r: t ? t.f2 ?? 0 : 0, lvl2: t ? t.lvl2 ?? 0 : 0,
    nLvl: n ? n.lvl ?? 1 : 0, nType: n ? FLT[n.type || 'hp'] : 0, nCut: n ? n.cut : 1000, nK: n ? 2 - 1.9 * (n.res ?? 0.1) : 2,
    nDC: n ? rate60(n.d ?? 0.1, sr) : 0, bursts: n ? n.bursts ?? 0 : 0, gap: n ? Math.round((n.gap ?? 0.011) * sr) : 0, bDC: n ? rate60(n.bd ?? 0.012, sr) : 0,
    mLvl: m ? m.lvl ?? 1 : 0, mBase: m ? m.base ?? 320 : 0, mType: m ? FLT[m.type || 'hp'] : 0, mCut: m ? m.cut : 6000, mK: m ? 2 - 1.9 * (m.res ?? 0.2) : 2,
    mDC: m ? rate60(m.d ?? 0.05, sr) : 0,
  };
}

function compileSfx(name, d, sr, index) {
  const layers = (d.layers || []).map((L) => {
    const f = L.f || [440, 440, 0.01], fl = L.flt || null, fm = L.fm || null;
    return {
      t: Math.round((L.t ?? 0) * sr), type: STYPE[L.type || 'sine'], f0: f[0], f1: f[1] ?? f[0], fN: Math.max(1, Math.round((f[2] ?? 0.05) * sr)),
      aInc: 1 / (Math.max(L.a ?? 0.001, 0.0003) * sr), hold: Math.round((L.h ?? 0) * sr), dC: rate60(L.d ?? 0.1, sr), g: L.g ?? 0.5,
      pw: L.pw ?? 0.5, mr: fm ? fm[0] : 0, idx0: fm ? fm[1] / (2 * Math.PI) : 0, idx1: fm ? (fm[2] ?? fm[1]) / (2 * Math.PI) : 0, idxN: fm ? Math.max(1, Math.round((fm[3] ?? 0.1) * sr)) : 1,
      fT: fl ? FLT[fl[0]] : 0, c0: fl ? fl[1] : 0, c1: fl ? fl[2] ?? fl[1] : 0, cN: fl ? Math.max(1, Math.round((fl[3] ?? 0.1) * sr)) : 1, fk: fl ? 2 - 1.9 * Math.min(1, fl[4] ?? 0.1) : 2,
      pan: L.pan ?? 0, rev: L.rev ?? 0, dly: L.dly ?? 0, vibR: L.vib ? L.vib[0] : 0, vibD: L.vib ? L.vib[1] : 0,
      amR: L.am ? L.am[0] : 0, amD: L.am ? L.am[1] : 0, det: L.det ?? 0, dens: L.dens ?? 0.02, fix: !!L.fix,
    };
  }).sort((x, y) => x.t - y.t);
  let len = 0;
  for (const L of d.layers || []) len = Math.max(len, (L.t ?? 0) + (L.a ?? 0.001) + (L.h ?? 0) + (L.d ?? 0.1));
  return {
    name, index, pri: d.pri ?? 3, gain: d.gain ?? 1, layers, seconds: len, poly: d.poly ?? 1,
    vary: d.vary ?? 0, gvar: d.gvar ?? 0, rr: d.rr || null, steps: d.steps || null,
    duck: d.duck ? d.duck[0] : 0, duckN: d.duck ? Math.round(d.duck[1] * sr) : 0, gapN: Math.max(Math.round(sr / 55), Math.round((d.gap ?? 0) * sr)),
    ui: !!d.ui, count: 0, lastStart: -1e12, lastIdx: -1,
  };
}

// ---------------------------------------------------------------- 声
class MVoice {
  constructor(i) {
    this.i = i; this.on = false; this.p = null; this.trk = null; this.note = 60; this.noteT = 60; this.vel = 1; this.gate = 0; this.rel = false; this.serial = 0;
    this.env = 0; this.est = 0; this.fe = 0; this.fst = 0; this.ic1 = 0; this.ic2 = 0; this.jc1 = 0; this.jc2 = 0;
    this.vibT = 0; this.lfo = 0; this.flfo = 0; this.bend = 0; this.det = 0; this.cutOct = 0; this.gl = 0.7; this.gr = 0.7; this.duck = false;
    this.ph = new Float64Array(24); this.pwm = 0; this.subPh = 0; this.rng = 1 + i * 7919;
    this.oe = new Float64Array(4); this.ol = new Float64Array(4); this.os = new Int8Array(4); this.f1 = 0; this.f2 = 0; this.modK = 1;
  }
}
class DVoice {
  constructor() {
    this.on = false; this.d = null; this.t = 0; this.ph = 0; this.ph2 = 0; this.f = 100; this.te = 0; this.ne = 0; this.me = 0; this.vel = 1;
    this.bLeft = 0; this.bCnt = 0; this.n1 = 0; this.n2 = 0; this.m1 = 0; this.m2 = 0; this.mph = new Float64Array(6); this.gl = 0.7; this.gr = 0.7; this.rng = 12345;
    this.tk = 1; this.nk = 1;
  }
}
class SVoice {
  constructor(i) {
    this.i = i; this.on = false; this.inst = -1; this.pri = 0; this.L = null; this.ph = 0; this.mph = 0; this.f = 440; this.fLn = 0; this.fLeft = 0; this.f1 = 440;
    this.idx = 0; this.idxLn = 0; this.idxLeft = 0; this.idx1 = 0; this.env = 0; this.st = 0; this.hold = 0; this.g = 0; this.kill = false;
    this.cut = 1000; this.cLn = 0; this.cLeft = 0; this.c1 = 1000; this.ic1 = 0; this.ic2 = 0; this.gl = 0.7; this.gr = 0.7;
    this.vph = 0; this.aph = 0; this.rng = 777 + i * 104729; this.sph = new Float64Array(6); this.serial = 0; this.fresh = false;
  }
}
class SInst {
  constructor(i) { this.i = i; this.on = false; this.def = null; this.pri = 0; this.serial = 0; this.t = 0; this.next = 0; this.pan = 0; this.pitch = 1; this.gain = 1; this.nv = 0; this.seed = 1; this.paused = false; }
}
class Track {
  constructor() { this.c = null; this.ev = null; this.idx = 0; this.loopIdx = 0; this.wait = 0; this.done = true; this.patch = null; this.lastV = null; this.prevLeg = false; this.g = 1; this.lg = 1; this.lgT = 1; this.layer = 0; this.gain = 1; this.pan = 0; this.drum = false; this.name = ''; }
}

export class ModernSynth {
  constructor(sampleRate = 48000) {
    const sr = this.sr = this.sampleRate = sampleRate;
    this.patches = {}; for (const k of Object.keys(PATCHES)) this.patches[k] = compilePatch(k, PATCHES[k], sr);
    this.drumDefs = {}; for (const k of Object.keys(DRUMKIT)) this.drumDefs[k] = compileDrum(k, DRUMKIT[k], sr);
    this.sfxDefs = {}; let si = 0; for (const k of Object.keys(MSFX)) this.sfxDefs[k] = compileSfx(k, MSFX[k], sr, si++);
    this.mv = Array.from({ length: N_MUSIC }, (_, i) => new MVoice(i));
    this.dv = {}; for (const k of Object.keys(this.drumDefs)) { const s = this.drumDefs[k].slot; if (!this.dv[s]) this.dv[s] = new DVoice(); }
    this.dvList = Object.values(this.dv);
    this.sv = Array.from({ length: N_SFXV }, (_, i) => new SVoice(i));
    this.si = Array.from({ length: N_INST }, (_, i) => new SInst(i)); this.siSeed = new Int32Array(N_INST);
    this.tracks = Array.from({ length: 20 }, () => new Track());
    const B = () => new Float32Array(CHUNK);
    this.tL = B(); this.tR = B(); this.mL = B(); this.mR = B(); this.dL = B(); this.dR = B(); this.rvL = B(); this.rvR = B(); this.dl = B();
    this.sL = B(); this.sR = B(); this.srL = B(); this.srR = B(); this.sdl = B();
    // 残響（FDN 8 本）
    const s = sr / 48000;
    this.fdnLen = [1423, 1637, 1877, 2053, 2311, 2543, 2789, 3001].map((n) => Math.round(n * s) | 1);
    this.fdn = this.fdnLen.map((n) => new Float32Array(n));
    this.fdnPos = new Int32Array(8); this.fdnLp = new Float64Array(8); this.fdnG = new Float64Array(8);
    this.apLen = [Math.round(149 * s), Math.round(389 * s), Math.round(211 * s), Math.round(457 * s)];
    this.ap = this.apLen.map((n) => new Float32Array(n)); this.apPos = new Int32Array(4);
    this.preLen = Math.round(0.014 * sr); this.preL = new Float32Array(this.preLen); this.preR = new Float32Array(this.preLen); this.prePos = 0;
    // ディレイ
    this.dlMax = Math.round(1.2 * sr); this.dlBufL = new Float32Array(this.dlMax); this.dlBufR = new Float32Array(this.dlMax); this.dlPos = 0;
    // リミッター
    this.laN = Math.round(0.0025 * sr); this.laL = new Float32Array(this.laN); this.laR = new Float32Array(this.laN); this.laG = new Float32Array(this.laN); this.laPos = 0;
    this._cache = new Map();
    this.evPool = Array.from({ length: 16 }, () => ({ type: '', id: '', n: 0, sample: 0 })); this.evCount = 0;
    this.layers = { danger: false };
    this.songState = { id: '', comp: null, n: 0, tick: 0, loops: 0, ending: false, endN: 0, startSample: 0, introMarked: false, spt: 1.5, tickLeft: 0.5, transpose: 0, chain: null, loop: false, rush: 1.04 };
    this.reset();
  }

  static get songIds() { return Object.keys(MSONGS); }
  static get sfxNames() { return Object.keys(MSFX); }

  reset() {
    const sr = this.sr;
    for (const v of this.mv) v.on = false;
    for (const v of this.dvList) v.on = false;
    for (const v of this.sv) { v.on = false; v.inst = -1; }
    for (const i of this.si) i.on = false;
    for (const k of Object.keys(this.sfxDefs)) { const d = this.sfxDefs[k]; d.count = 0; d.lastStart = -1e12; d.lastIdx = -1; }
    for (const b of this.fdn) b.fill(0); for (const b of this.ap) b.fill(0);
    this.fdnPos.fill(0); this.fdnLp.fill(0); this.apPos.fill(0); this.preL.fill(0); this.preR.fill(0); this.prePos = 0;
    this.dlBufL.fill(0); this.dlBufR.fill(0); this.dlPos = 0; this.dlLpL = 0; this.dlLpR = 0;
    this.laL.fill(0); this.laR.fill(0); this.laG.fill(1); this.laPos = 0; this.laSum = this.laN; this.laMin = 1; this.laHold = 0;
    this.song = null; this.pending = null; this.paused = false; this.samplePos = 0; this.serial = 0; this.steals = 0;
    this.fade = 0; this.fadeTarget = 0; this.fadeStep = 1 / (0.01 * sr);
    this.tape = 1; this.tapeStep = 0; this.tempoMul = 1;
    this.vol = { master: 1, bgm: 1, sfx: 1 }; this.gM = 1; this.gS = 1; this.gMaster = 1;
    this.intensity = 0; this.layers.danger = false;
    this.scEnv = 0; this.scSm = 0; this.scDepth = 0.3; this.scRel = Math.exp(-1 / (0.11 * sr));
    this.sfxDuck = 1; this.pauseG = 1;
    this.lpCut = 20000; this.lpMix = 0; this.lpL1 = 0; this.lpL2 = 0; this.lpR1 = 0; this.lpR2 = 0;
    this.shL = 0; this.shR = 0; this.shK = 1 - Math.exp(-2 * Math.PI * 3200 / sr);
    this.dcxL = 0; this.dcyL = 0; this.dcxR = 0; this.dcyR = 0; this.dcR = Math.exp(-2 * Math.PI * 16 / sr);
    this.cEnv = 0; this.cAtt = 1 - Math.exp(-1 / (0.012 * sr)); this.cRel = 1 - Math.exp(-1 / (0.16 * sr));
    this.revIn1 = 0; this.revIn2 = 0; this.revHp = 1 - Math.exp(-2 * Math.PI * 220 / sr);
    this.revT60 = 1.5; this.revDamp = 0.35; this.revLvl = 0.9; this.dlyN = Math.round(0.3 * sr); this.dlyFb = 0.38; this.dlyLvl = 0.8;
    this._setReverb(1.5, 0.35);
    this.rng = 0x1234abcd; this.cInc = 0.01;
    this.evCount = 0; this.peakVoices = 0; this.grMin = 1;
  }
  _setReverb(t60, damp) {
    this.revT60 = t60; this.revDamp = damp;
    for (let i = 0; i < 8; i++) this.fdnG[i] = Math.pow(10, -3 * this.fdnLen[i] / (this.sr * t60));
  }
  _rand() { let s = this.rng; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.rng = s; return (s | 0) * 4.656612873e-10; }

  // ------------------------------------------------------------ 曲
  compiled(id) {
    if (!this._cache.has(id)) { const s = MSONGS[id]; if (!s) return null; this._cache.set(id, compileModernSong(id, s)); }
    return this._cache.get(id);
  }
  _wanted() {
    const p = this.pending;
    if (p) return p.act === 'play' ? p.id : null;
    const s = this.song; if (!s || s.ending) return null;
    return s.chain ? s.chain : s.id;
  }
  // 同じ曲が鳴っている間にもう一度呼んでも頭に戻らない（{restart:true} で頭から）
  // opts: restart / fade（前の曲を消す秒数）/ mode 'tape'（テープを止めるように落とす）/ lead（開始ファンファーレから切れ目なくつなぐ）
  playMusic(id, opts = {}) {
    if (!MSONGS[id]) return false;
    if (!opts.restart && this._wanted() === id) return true;
    const lead = opts.lead && MSONGS[id].lead ? MSONGS[id].lead : null;
    if (this.song && this.fade > 0.001) {
      this.pending = { act: 'play', id, lead, ended: false };
      if (opts.mode === 'tape') this.tapeStep = 1 / ((opts.fade ?? 1.1) * this.sr);
      else { this.fadeTarget = 0; this.fadeStep = 1 / (Math.max(0.005, opts.fade ?? 0.3) * this.sr); }
    } else { this.pending = null; this._begin(id, lead); }
    return true;
  }
  stopMusic(opts = {}) {
    if (this.song) {
      this.pending = { act: 'stop', id: null, lead: null, ended: false };
      if (opts.tape) this.tapeStep = 1 / ((opts.fade ?? 1.1) * this.sr);
      else { this.fadeTarget = 0; this.fadeStep = 1 / (Math.max(0.005, opts.fade ?? 0.35) * this.sr); }
      if (this.fade <= 0) this._doPending();
    } else this.pending = null;
  }
  _begin(id, lead) {
    if (lead) { this._startSong(lead.song, { transpose: lead.transpose || 0, tempo: lead.tempo || 0, chain: id }); }
    else this._startSong(id, {});
  }
  isMusicPlaying() { return !!this.song && !this.song.ending && !(this.pending && this.pending.act === 'stop'); }
  get currentMusic() { return this.song ? this.song.id : null; }
  musicPosition() {
    const s = this.song; if (!s) return { id: null, frame: 0, tick: 0, loops: 0, seconds: 0, bar: 0, lead: false };
    const sec = (this.samplePos - s.startSample) / this.sr;
    return { id: s.chain || s.id, frame: Math.floor(sec * 60), tick: s.tick, loops: s.loops, seconds: sec, bar: Math.floor(s.tick / (TPQ * 4)), lead: !!s.chain };
  }
  _startSong(id, o) {
    const comp = this.compiled(id), def = MSONGS[id];
    if (o.keep) { for (const v of this.mv) if (v.on && !v.rel) this._noteOff(v); }
    else { for (const v of this.mv) v.on = false; for (const v of this.dvList) v.on = false; }
    const n = comp.tracks.length;
    for (let i = 0; i < n; i++) {
      const t = this.tracks[i], c = comp.tracks[i];
      t.c = c; t.ev = c.events; t.idx = 0; t.loopIdx = Math.max(0, c.loopIndex); t.wait = 0; t.done = c.events.length === 0;
      t.patch = this.patches[c.patch] || this.patches.lead_saw; t.lastV = null; t.prevLeg = false; t.layer = c.layer; t.gain = c.gain; t.pan = c.pan; t.drum = c.drum; t.name = c.name;
      t.lgT = this._layerOn(c.layer) ? 1 : 0; t.lg = t.lgT; t.g = t.gain * t.lg;
    }
    const tempo = o.tempo || comp.tempo;
    const st = this.songState, start = o.keep && this.song ? this.song.startSample : this.samplePos;
    st.id = id; st.comp = comp; st.n = n; st.tick = 0; st.loops = 0; st.ending = false; st.endN = 0; st.startSample = start; st.introMarked = false;
    st.spt = this.sr * 60 / (tempo * TPQ); st.tickLeft = 0; st.transpose = o.transpose || 0; st.chain = o.chain || null; st.loop = comp.loop; st.rush = def.rush ?? 1.04;
    this.song = st;
    this.scDepth = def.duck ?? 0.3;
    const fx = def.fx || {};
    this._setReverb(fx.t60 ?? 1.5, fx.damp ?? 0.35); this.revLvl = fx.rev ?? 0.9;
    const beat = 60 / tempo;
    this.dlyN = Math.max(64, Math.min(this.dlMax - 1, Math.round((fx.dlyBeats ?? 0.75) * beat * this.sr)));
    this.dlyFb = fx.dlyFb ?? 0.36; this.dlyLvl = fx.dly ?? 0.8;
    if (!o.keep) { this.fade = 0; this.fadeTarget = 1; this.fadeStep = 1 / (0.006 * this.sr); this.tape = 1; this.tapeStep = 0; this.tempoMul = 1; }
    this._event('start', id, 0);
  }
  _layerOn(layer) { return typeof layer === 'number' ? this.intensity >= layer : !!this.layers[layer]; }
  _doPending() {
    const p = this.pending; this.pending = null;
    this.tape = 1; this.tapeStep = 0;
    if (!p) return;
    if (p.act === 'stop') {
      const id = this.song && this.song.id;
      for (const v of this.mv) v.on = false; for (const v of this.dvList) v.on = false;
      this.song = null;
      if (p.ended && id) this._event('ended', id, 0);
    } else this._begin(p.id, p.lead);
  }
  // 動的な曲: 強さ 0〜2（層 1・2 が順に加わる。2 でわずかに速くなる）と、名前つきの層（'danger' = 残機が最後）
  setIntensity(n) { this.intensity = Math.max(0, Math.min(2, n | 0)); this._retarget(); }
  setLayer(name, on) { this.layers[name] = !!on; this._retarget(); }
  _retarget() { const s = this.song; if (!s) return; for (let i = 0; i < s.n; i++) { const t = this.tracks[i]; t.lgT = this._layerOn(t.layer) ? 1 : 0; } }

  _allocVoice() {
    const mv = this.mv; let best = null, bl = 1e9;
    for (let i = 0; i < mv.length; i++) { const v = mv[i]; if (!v.on) return v; }
    for (let i = 0; i < mv.length; i++) { const v = mv[i]; const l = v.env + (v.rel ? 0 : 2); if (l < bl) { bl = l; best = v; } }
    this.steals++;
    return best;
  }
  _noteOff(v) { v.rel = true; v.est = 3; v.fst = 3; v.os[0] = v.os[1] = v.os[2] = v.os[3] = 3; }
  _noteOn(t, e) {
    const song = this.song, p = this.patches[e.inst] || t.patch;
    const gate = e.leg ? e.len + 1 : Math.max(1, Math.floor(e.len * e.q / 8));
    const leg = t.prevLeg && t.lastV && t.lastV.on && !t.lastV.rel && t.lastV.trk === t && !e.ms;
    t.prevLeg = e.leg;
    if (t.lgT === 0 && t.lg < 0.01) { t.lastV = null; return; }      // 消えている層は鳴らさない
    if (leg) { const v = t.lastV; v.noteT = e.m + song.transpose; v.gate = gate; if (v.p.porta <= 0) v.note = v.noteT; return; }
    const cnt = e.ms ? e.ms.length : 1;
    for (let k = 0; k < cnt; k++) {
      const m = (e.ms ? e.ms[k] : e.m) + song.transpose;
      const v = this._allocVoice();
      v.on = true; v.p = p; v.trk = t; v.noteT = m; v.note = p.porta > 0 && t.lastV && t.lastV.trk === t && cnt === 1 ? t.lastV.noteT : m;
      const vel = e.vol / 15; v.vel = vel * vel; v.gate = gate; v.rel = false; v.serial = ++this.serial;
      v.env = 0; v.est = 0; v.fe = 0; v.fst = 0; v.ic1 = v.ic2 = v.jc1 = v.jc2 = 0;
      v.vibT = 0; v.bend = p.bend; v.det = e.det; v.cutOct = e.cut / 12; v.duck = p.duck; v.f1 = v.f2 = 0;
      let pan = t.pan + p.pan + e.pan; if (pan > 1) pan = 1; else if (pan < -1) pan = -1;
      if (p.stereo) { v.gl = Math.min(1, 1 - pan); v.gr = Math.min(1, 1 + pan); }
      else { const a = (pan + 1) * Math.PI / 4; v.gl = Math.cos(a) * 1.414; v.gr = Math.sin(a) * 1.414; }
      const ph = v.ph;
      if (p.free) { for (let j = 0; j < 24; j++) { let s = v.rng; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; v.rng = s; ph[j] = (s >>> 8) / 16777216; } }
      else { for (let j = 0; j < 24; j++) ph[j] = 0; v.subPh = 0; }
      if (p.fm) {
        for (let j = 0; j < 4; j++) { v.oe[j] = 0; v.ol[j] = 0; v.os[j] = 0; }
        const hz = 440 * Math.exp((m - 69) / 12 * LN2);
        v.modK = hz > 260 ? Math.sqrt(260 / hz) : 1;             // 高い音ほど変調を浅く（折り返しを抑える）
      }
      t.lastV = v;
    }
  }
  _drumOn(t, e) {
    const d = this.drumDefs[e.d]; if (!d) return;
    if (t.lgT === 0 && t.lg < 0.01) return;
    const v = this.dv[d.slot];
    const r = this._rand();
    v.on = true; v.d = d; v.t = 0; v.f = d.f0; const vel = e.vol / 15; v.vel = vel * vel * (1 + 0.06 * r) * t.g;
    v.te = 1; v.ne = d.bursts ? 0 : 1; v.me = 1; v.bLeft = d.bursts; v.bCnt = 0;
    v.tk = 1 + 0.01 * r; v.nk = 1 + 0.05 * this._rand();
    let pan = d.pan + e.pan + t.pan; if (pan > 1) pan = 1; else if (pan < -1) pan = -1;
    const a = (pan + 1) * Math.PI / 4; v.gl = Math.cos(a) * 1.414; v.gr = Math.sin(a) * 1.414;
    if (d.sc && !this.paused) this.scEnv = 1;
  }

  _tick() {
    const song = this.song, mv = this.mv, tracks = this.tracks;
    for (let i = 0; i < mv.length; i++) { const v = mv[i]; if (v.on && !v.rel && v.gate > 0 && --v.gate === 0) this._noteOff(v); }
    if (song.ending) return;
    let allDone = true;
    for (let i = 0; i < song.n; i++) {
      const t = tracks[i];
      if (t.done) continue;
      while (t.wait <= 0) {
        if (t.idx >= t.ev.length) {
          if (song.loop) {
            t.idx = t.loopIdx;
            if (i === 0) { song.loops++; this._event('loop', song.id, song.loops); }
            if (t.idx >= t.ev.length) { t.done = true; break; }
          } else { t.done = true; break; }
        }
        const e = t.ev[t.idx++];
        if (e.t === 'n') this._noteOn(t, e); else if (e.t === 'd') this._drumOn(t, e); else { t.prevLeg = false; }
        t.wait = e.len;
      }
      if (!t.done) { t.wait--; allDone = false; }
    }
    song.tick++;
    if (!song.introMarked && song.loop && song.tick - 1 === song.comp.loopTick) { song.introMarked = true; this._event('loopStart', song.id, 0); }
    if (allDone) {
      if (song.chain) { const next = song.chain; this._startSong(next, { keep: true }); this.song.tickLeft = 0; this._tick(); }
      else { song.ending = true; song.endN = 0; }
    }
  }

  // ------------------------------------------------------------ 効果音
  // opts: pan（-1〜1。画面の左右）/ step（段。ゲージの位置やシールドの残り）/ pitch（半音）/ gain
  // 決まり: 同じ名前を同じフレーム（1/55 秒以内）に何度呼んでも 1 回分。同じ名前は poly（ふつう 1）個までしか重ならない。
  //         空きが無ければ、自分以下の優先度で一番低い（同じなら一番古い）音を止めて鳴らす。高い音しか無ければ鳴らさない。
  sfx(name, opts) {
    const def = this.sfxDefs[name];
    if (!def) return -1;
    const si = this.si;
    if (this.samplePos - def.lastStart < def.gapN && def.lastIdx >= 0 && si[def.lastIdx].on && si[def.lastIdx].def === def) return def.lastIdx;
    let pick = -1, same = 0, oldest = -1;
    for (let i = 0; i < si.length; i++) { const s = si[i]; if (s.on && s.def === def) { same++; if (oldest < 0 || s.serial < si[oldest].serial) oldest = i; } }
    if (same >= def.poly) pick = oldest;
    if (pick < 0) for (let i = 0; i < si.length; i++) if (!si[i].on) { pick = i; break; }
    if (pick < 0) {
      for (let i = 0; i < si.length; i++) {
        const s = si[i]; if (s.pri > def.pri) continue;
        if (pick < 0 || s.pri < si[pick].pri || (s.pri === si[pick].pri && s.serial < si[pick].serial)) pick = i;
      }
    }
    if (pick < 0) return -1;
    const s = si[pick];
    if (s.on) this._killInst(pick);
    def.count++;
    let h = (def.index * 0x9e3779b1 + def.count * 0x85ebca6b) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    const r1 = ((h & 0xffff) / 32768) - 1, r2 = (((h >>> 16) & 0xffff) / 32768) - 1;
    let cents = def.vary * r1;
    if (def.rr) cents += def.rr[def.count % def.rr.length];
    let semi = 0;
    if (opts) {
      if (def.steps && typeof opts.step === 'number') semi += def.steps[Math.max(0, Math.min(def.steps.length - 1, opts.step | 0))];
      if (typeof opts.pitch === 'number') semi += opts.pitch;
    }
    s.on = true; s.def = def; s.pri = def.pri; s.serial = ++this.serial; s.t = 0; s.next = 0; s.nv = 0; this.siSeed[pick] = h | 1;
    s.pan = opts && typeof opts.pan === 'number' && isFinite(opts.pan) ? Math.max(-1, Math.min(1, opts.pan)) : 0;
    s.pitch = Math.exp((semi / 12 + cents / 1200) * LN2);
    s.gain = def.gain * (1 + def.gvar * r2) * (opts && typeof opts.gain === 'number' ? Math.max(0, Math.min(2, opts.gain)) : 1);
    def.lastStart = this.samplePos; def.lastIdx = pick;
    return pick;
  }
  _killInst(i) {
    const sv = this.sv;
    for (let k = 0; k < sv.length; k++) { const v = sv[k]; if (v.on && v.inst === i) { v.kill = true; v.inst = -1; v.pri = -1; } }
    this.si[i].on = false;
  }
  sfxActive() { return this.si.map((s) => (s.on ? s.def.name : null)); }
  _sfxStart(inst, L) {
    const sv = this.sv; let v = null;
    for (let i = 0; i < sv.length; i++) if (!sv[i].on) { v = sv[i]; break; }
    if (!v) {
      let b = -1;
      for (let i = 0; i < sv.length; i++) { const x = sv[i]; if (x.pri > inst.pri) continue; if (b < 0 || x.pri < sv[b].pri || (x.pri === sv[b].pri && x.serial < sv[b].serial)) b = i; }
      if (b < 0) return;
      v = sv[b];
    }
    // 実数の計算は _sfxVoice の最初の刻みで行う（ここは呼ばれる回数が少なく最適化されにくいので、整数と参照だけ書く）
    v.on = true; v.inst = inst.i; v.pri = inst.pri; v.L = L; v.serial = ++this.serial; v.kill = false; v.fresh = true;
  }

  // ------------------------------------------------------------ 設定
  setVolumes(v = {}) {
    for (const k of ['master', 'bgm', 'sfx']) if (typeof v[k] === 'number' && isFinite(v[k])) this.vol[k] = Math.max(0, Math.min(1, v[k]));
  }
  // 一時停止: 曲は止めずにこもらせて下げる（ローパス）。鳴っていた効果音は消す。解除でなめらかに戻る。
  // 一時停止中に鳴らした効果音（ポーズ音・メニュー音）は鳴る。
  setPaused(on) {
    on = !!on; if (on === this.paused) return;
    this.paused = on;
    if (on) for (let i = 0; i < this.si.length; i++) if (this.si[i].on) this._killInst(i);
  }

  // ------------------------------------------------------------ 波形を作る
  render(out, offset = 0, n = out.length - offset) { this.renderStereo(out, null, offset, n); }

  renderStereo(L, R, offset = 0, n = L.length - offset) {
    let done = 0;
    while (done < n) {
      let c = n - done; if (c > CHUNK) c = CHUNK;
      let song = this.song;
      if (song) {
        const rate = this.tape * this.tempoMul;
        if (song.tickLeft <= 0) { this._tick(); song = this.song; song.tickLeft += song.spt; }
        const lim = Math.ceil(song.tickLeft / (rate > 0.02 ? rate : 0.02));
        if (lim < c) c = lim < 1 ? 1 : lim;
        song.tickLeft -= c * rate;
      }
      this._chunk(c);
      this._master(L, R, offset + done, c);
      done += c; this.samplePos += c;
    }
  }

  _chunk(n) {
    const mL = this.mL, mR = this.mR, dL = this.dL, dR = this.dR, rvL = this.rvL, rvR = this.rvR, dl = this.dl;
    const sL = this.sL, sR = this.sR, srL = this.srL, srR = this.srR, sdl = this.sdl;
    for (let i = 0; i < n; i++) { mL[i] = 0; mR[i] = 0; dL[i] = 0; dR[i] = 0; rvL[i] = 0; rvR[i] = 0; dl[i] = 0; sL[i] = 0; sR[i] = 0; srL[i] = 0; srR[i] = 0; sdl[i] = 0; }
    const song = this.song, sr = this.sr;
    if (song) {
      // 層の出入り（0.4 秒）と、強さ 2 のときの加速
      const st = n / (0.4 * sr);
      for (let i = 0; i < song.n; i++) { const t = this.tracks[i]; if (t.lg !== t.lgT) { const d = t.lgT - t.lg; t.lg += d > st ? st : d < -st ? -st : d; } t.g = t.gain * t.lg; }
      const tt = this.intensity >= 2 && song.loop ? song.rush : 1;
      if (this.tempoMul !== tt) { const d = tt - this.tempoMul, s2 = n / (2 * sr) * 0.05; this.tempoMul += d > s2 ? s2 : d < -s2 ? -s2 : d; }
      if (this.tapeStep > 0) {
        this.tape -= this.tapeStep * n;
        if (this.tape <= 0.05) { this.tape = 0.05; this.tapeStep = 0; this.fadeTarget = 0; this.fadeStep = 1 / (0.03 * sr); }
      }
      if (song.ending) {
        song.endN += n;
        let any = false; for (let i = 0; i < this.mv.length; i++) if (this.mv[i].on) { any = true; break; }
        if (!any) for (let i = 0; i < this.dvList.length; i++) if (this.dvList[i].on) { any = true; break; }
        if ((!any && song.endN > 0.15 * sr) || song.endN > 5 * sr) { if (!this.pending) { for (const v of this.mv) v.on = false; for (const v of this.dvList) v.on = false; const id = song.id; this.song = null; this._event('ended', id, 0); } }
      }
    }
    let nv = 0;
    const mv = this.mv;
    for (let i = 0; i < mv.length; i++) if (mv[i].on) { this._voice(mv[i], n); nv++; }
    const dvl = this.dvList;
    for (let i = 0; i < dvl.length; i++) if (dvl[i].on) this._drum(dvl[i], n);
    // 効果音: 始まる時刻が来た層を鳴らし始める
    const si = this.si, sv = this.sv;
    for (let i = 0; i < si.length; i++) si[i].nv = 0;
    for (let i = 0; i < sv.length; i++) { const v = sv[i]; if (v.on) { nv++; if (v.inst >= 0) si[v.inst].nv++; } }
    let duck = 0;
    for (let i = 0; i < si.length; i++) {
      const s = si[i]; if (!s.on) continue;
      const ls = s.def.layers;
      while (s.next < ls.length && ls[s.next].t <= s.t) { this._sfxStart(s, ls[s.next]); s.next++; s.nv++; }
      if (s.t < s.def.duckN && s.def.duck > duck) duck = s.def.duck;
      s.t += n;
      if (s.next >= ls.length && s.nv === 0) s.on = false;
    }
    for (let i = 0; i < sv.length; i++) if (sv[i].on) this._sfxVoice(sv[i], n);
    if (nv > this.peakVoices) this.peakVoices = nv;
    // 大きな効果音の間は曲を少し下げる（すばやく下げ、ゆっくり戻す）
    const tgt = 1 - duck, k = tgt < this.sfxDuck ? 1 - Math.exp(-n / (0.025 * sr)) : 1 - Math.exp(-n / (0.45 * sr));
    this.sfxDuck += (tgt - this.sfxDuck) * k;
    const pg = this.paused ? 0.45 : 1;
    this.pauseG += (pg - this.pauseG) * (1 - Math.exp(-n / (0.08 * sr)));
    // 曲全体のローパス（一時停止・曲の切り替え）
    let lt = 20000;
    if (this.paused) lt = 520;
    else if (this.pending && this.tapeStep === 0 && this.fadeTarget === 0) lt = 180 * Math.pow(100, this.fade);
    else if (this.tapeStep > 0 || this.tape < 1) lt = 400 + 19600 * this.tape * this.tape;
    const lk = 1 - Math.exp(-n / ((lt < this.lpCut ? 0.05 : 0.09) * sr));
    this.lpCut *= Math.exp(Math.log(lt / this.lpCut) * lk);
  }

  _voice(v, n) {
    const p = v.p, sr = this.sr, tL = this.tL, tR = this.tR;
    if (v.note !== v.noteT) { const d = v.noteT - v.note; if (p.porta <= 0 || (d < 0.02 && d > -0.02)) v.note = v.noteT; else v.note += d * (1 - Math.exp(-n / (p.porta * sr))); }
    let cents = v.det;
    if (p.vibD > 0) { v.vibT += n; const t = v.vibT - p.vibDelay; if (t > 0) { v.lfo += p.vibR * n / sr; v.lfo -= (v.lfo | 0); cents += p.vibD * (t < p.vibRamp ? t / p.vibRamp : 1) * fsin(v.lfo); } }
    if (v.bend !== 0) { cents += v.bend; v.bend *= Math.exp(-n / p.bendT); if (v.bend < 1 && v.bend > -1) v.bend = 0; }
    const inc = 440 * Math.exp(((v.note - 69) / 12 + cents / 1200) * LN2) * this.tape / sr;
    const st = p.stereo;
    this.cInc = inc;      // 実数を引数で渡すと箱（HeapNumber）が作られるので、欄で渡す
    if (p.fm) this._fm(v, p, n); else this._va(v, p, n);
    if (p.fType) {
      if (v.fst === 0) { v.fe += n * p.fAInc; if (v.fe >= 1) { v.fe = 1; v.fst = 1; } }
      else if (v.fst === 1) v.fe += (p.fS - v.fe) * (1 - Math.exp(-n * p.fDK));
      else v.fe *= Math.exp(-n * p.fRK);
      let oct = p.fEnv * v.fe * (1 - p.fVel + p.fVel * v.vel) + p.fKt * (v.note - 60) / 12 + v.cutOct;
      if (p.fLfoD) { v.flfo += p.fLfoR * n / sr; v.flfo -= (v.flfo | 0); oct += p.fLfoD * fsin(v.flfo); }
      let fc = p.fCut * Math.exp(oct * LN2); if (fc < 30) fc = 30; else if (fc > 0.42 * sr) fc = 0.42 * sr;
      const g = Math.tan(Math.PI * fc / sr), k = p.fK, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2, ty = p.fType;
      let c1 = v.ic1, c2 = v.ic2;
      if (ty === 1) {
        for (let i = 0; i < n; i++) { const v3 = tL[i] - c2, v1 = a1 * c1 + a2 * v3, v2 = c2 + a2 * c1 + a3 * v3; c1 = 2 * v1 - c1; c2 = 2 * v2 - c2; tL[i] = v2; }
      } else {
        for (let i = 0; i < n; i++) {
          const x = tL[i], v3 = x - c2, v1 = a1 * c1 + a2 * v3, v2 = c2 + a2 * c1 + a3 * v3;
          c1 = 2 * v1 - c1; c2 = 2 * v2 - c2;
          tL[i] = ty === 2 ? v1 : x - k * v1 - v2;
        }
      }
      v.ic1 = c1; v.ic2 = c2;
      if (st) {
        c1 = v.jc1; c2 = v.jc2;
        for (let i = 0; i < n; i++) {
          const x = tR[i], v3 = x - c2, v1 = a1 * c1 + a2 * v3, v2 = c2 + a2 * c1 + a3 * v3;
          c1 = 2 * v1 - c1; c2 = 2 * v2 - c2;
          tR[i] = ty === 1 ? v2 : ty === 2 ? v1 : x - k * v1 - v2;
        }
        v.jc1 = c1; v.jc2 = c2;
      }
    }
    const g = v.vel * p.gain * v.trk.g, gl = g * v.gl, gr = g * v.gr, rv = p.rev, dly = p.dly * 0.5, drv = p.drive;
    const bL = v.duck ? this.dL : this.mL, bR = v.duck ? this.dR : this.mR, rvL = this.rvL, rvR = this.rvR, dl = this.dl;
    const aInc = p.aInc, aS = p.aS, aDC = p.aDC, aRC = p.aRC;
    let env = v.env, est = v.est;
    if (drv > 0) {
      for (let i = 0; i < n; i++) {
        if (est === 0) { env += aInc; if (env >= 1) { env = 1; est = 1; } } else if (est === 1) env += (aS - env) * aDC; else env -= env * aRC;
        let x = tL[i] * drv; if (x > 3) x = 3; else if (x < -3) x = -3; x = x * (27 + x * x) / (27 + 9 * x * x);
        let y = x;
        if (st) { y = tR[i] * drv; if (y > 3) y = 3; else if (y < -3) y = -3; y = y * (27 + y * y) / (27 + 9 * y * y); }
        const l = x * env * gl, r = y * env * gr;
        bL[i] += l; bR[i] += r; rvL[i] += l * rv; rvR[i] += r * rv; dl[i] += (l + r) * dly;
      }
    } else if (st) {
      for (let i = 0; i < n; i++) {
        if (est === 0) { env += aInc; if (env >= 1) { env = 1; est = 1; } } else if (est === 1) env += (aS - env) * aDC; else env -= env * aRC;
        const l = tL[i] * env * gl, r = tR[i] * env * gr;
        bL[i] += l; bR[i] += r; rvL[i] += l * rv; rvR[i] += r * rv; dl[i] += (l + r) * dly;
      }
    } else if (rv === 0 && dly === 0) {
      for (let i = 0; i < n; i++) {
        if (est === 0) { env += aInc; if (env >= 1) { env = 1; est = 1; } } else if (est === 1) env += (aS - env) * aDC; else env -= env * aRC;
        const x = tL[i] * env;
        bL[i] += x * gl; bR[i] += x * gr;
      }
    } else {
      const gs = (gl + gr) * dly, rl = gl * rv, rr = gr * rv;
      for (let i = 0; i < n; i++) {
        if (est === 0) { env += aInc; if (env >= 1) { env = 1; est = 1; } } else if (est === 1) env += (aS - env) * aDC; else env -= env * aRC;
        const x = tL[i] * env;
        bL[i] += x * gl; bR[i] += x * gr; rvL[i] += x * rl; rvR[i] += x * rr; dl[i] += x * gs;
      }
    }
    v.env = env; v.est = est;
    if ((est === 3 || aS === 0) && est !== 0 && env < 5e-4) { v.on = false; if (v.trk.lastV === v) v.trk.lastV = null; }
  }

  _va(v, p, n) {
    const inc = this.cInc;
    const tL = this.tL, tR = this.tR, ph = v.ph, oscs = p.osc, sr = this.sr;
    // サブ（1 オクターブ下のサイン）とノイズ
    if (p.sub > 0) { let t = v.subPh; const d = inc * 0.5, l = p.sub; for (let i = 0; i < n; i++) { t += d; if (t >= 1) t -= 1; tL[i] = l * fsin(t); } v.subPh = t; }
    else for (let i = 0; i < n; i++) tL[i] = 0;
    if (p.noise > 0) { let s = v.rng; const l = p.noise * 4.656612873e-10; for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; tL[i] += (s | 0) * l; } v.rng = s; }
    let k = 0, copied = false;
    for (let j = 0; j < oscs.length; j++) {
      const o = oscs[j], dt = inc * o.ratio, lvl = o.lvl;
      if (dt >= 0.5) { k += o.n; continue; }
      switch (o.type) {
        case 0: { let t = ph[k]; for (let i = 0; i < n; i++) { t += dt; if (t >= 1) t -= 1; tL[i] += lvl * fsin(t); } ph[k++] = t; break; }
        case 1: { let t = ph[k]; for (let i = 0; i < n; i++) { t += dt; if (t >= 1) t -= 1; tL[i] += lvl * (t < 0.5 ? 4 * t - 1 : 3 - 4 * t); } ph[k++] = t; break; }
        case 2: {
          let t = ph[k];
          for (let i = 0; i < n; i++) {
            t += dt; if (t >= 1) t -= 1;
            let s = 2 * t - 1;
            if (t < dt) { const x = t / dt; s -= x + x - x * x - 1; } else if (t > 1 - dt) { const x = (t - 1) / dt; s -= x * x + x + x + 1; }
            tL[i] += s * lvl;
          }
          ph[k++] = t; break;
        }
        case 3: {
          let w = o.pw;
          if (o.pwmD) { v.pwm += o.pwmR * n / sr; v.pwm -= (v.pwm | 0); w += o.pwmD * fsin(v.pwm); }
          const dc = 2 * w - 1;
          let t = ph[k];
          for (let i = 0; i < n; i++) {
            t += dt; if (t >= 1) t -= 1;
            let s = t < w ? 1 : -1;
            if (t < dt) { const x = t / dt; s += x + x - x * x - 1; } else if (t > 1 - dt) { const x = (t - 1) / dt; s += x * x + x + x + 1; }
            let u = t - w; if (u < 0) u += 1;
            if (u < dt) { const x = u / dt; s -= x + x - x * x - 1; } else if (u > 1 - dt) { const x = (u - 1) / dt; s -= x * x + x + x + 1; }
            tL[i] += (s - dc) * lvl;
          }
          ph[k++] = t; break;
        }
        case 4: {
          const st = p.stereo;
          if (st && !copied) { for (let i = 0; i < n; i++) tR[i] = tL[i]; copied = true; }
          for (let m = 0; m < o.n; m++) {
            const d2 = dt * o.mul[m], gl = lvl * o.gl[m], gr = lvl * o.gr[m];
            let t = ph[k];
            if (st) {
              for (let i = 0; i < n; i++) {
                t += d2; if (t >= 1) t -= 1;
                let s = 2 * t - 1;
                if (t < d2) { const x = t / d2; s -= x + x - x * x - 1; } else if (t > 1 - d2) { const x = (t - 1) / d2; s -= x * x + x + x + 1; }
                tL[i] += s * gl; tR[i] += s * gr;
              }
            } else {
              for (let i = 0; i < n; i++) {
                t += d2; if (t >= 1) t -= 1;
                let s = 2 * t - 1;
                if (t < d2) { const x = t / d2; s -= x + x - x * x - 1; } else if (t > 1 - d2) { const x = (t - 1) / d2; s -= x * x + x + x + 1; }
                tL[i] += s * gl;
              }
            }
            ph[k++] = t;
          }
          break;
        }
        default: {
          const tb = o.tbl; let t = ph[k];
          for (let i = 0; i < n; i++) { t += dt; if (t >= 1) t -= 1; const f = t * 1024, q = f | 0, a = tb[q]; tL[i] += lvl * (a + (f - q) * (tb[q + 1] - a)); }
          ph[k++] = t;
        }
      }
    }
    if (p.stereo && !copied) for (let i = 0; i < n; i++) tR[i] = tL[i];
  }

  _fm(v, p, n) {
    const inc = this.cInc;
    const ops = p.ops, oe = v.oe, ol = v.ol, os = v.os, ph = v.ph, tL = this.tL;
    for (let j = 0; j < 4; j++) {
      const o = ops[j]; let e = oe[j];
      if (os[j] === 0) { e += n * o.aInc; if (e >= 1) { e = 1; os[j] = 1; } }
      else if (os[j] === 1) e += (o.s - e) * (1 - Math.exp(-n * o.dK));
      else e *= Math.exp(-n * o.rK);
      oe[j] = e;
    }
    const o0 = ops[0], o1 = ops[1], o2 = ops[2], o3 = ops[3], vel = v.vel, mk = v.modK;
    const t0 = oe[0] * o0.lvl * (1 - o0.vel + o0.vel * vel) * (o0.car ? 1 : 1 - o0.ks + o0.ks * mk);
    const t1 = oe[1] * o1.lvl * (1 - o1.vel + o1.vel * vel) * (o1.car ? 1 : 1 - o1.ks + o1.ks * mk);
    const t2 = oe[2] * o2.lvl * (1 - o2.vel + o2.vel * vel) * (o2.car ? 1 : 1 - o2.ks + o2.ks * mk);
    const t3 = oe[3] * o3.lvl * (1 - o3.vel + o3.vel * vel) * (o3.car ? 1 : 1 - o3.ks + o3.ks * mk);
    let l0 = ol[0], l1 = ol[1], l2 = ol[2], l3 = ol[3];
    const d0 = (t0 - l0) / n, d1 = (t1 - l1) / n, d2 = (t2 - l2) / n, d3 = (t3 - l3) / n;
    const i0 = inc * o0.ratio, i1 = inc * o1.ratio, i2 = inc * o2.ratio, i3 = inc * o3.ratio;
    let p0 = ph[0], p1 = ph[1], p2 = ph[2], p3 = ph[3], f1 = v.f1, f2 = v.f2;
    const fb = p.fb * 0.5 * mk, alg = p.alg;
    for (let i = 0; i < n; i++) {
      l0 += d0; l1 += d1; l2 += d2; l3 += d3;
      p0 += i0; if (p0 >= 1) p0 -= 1; p1 += i1; if (p1 >= 1) p1 -= 1; p2 += i2; if (p2 >= 1) p2 -= 1; p3 += i3; if (p3 >= 1) p3 -= 1;
      const s4 = fsin(p3 + fb * (f1 + f2)); f2 = f1; f1 = s4;
      const x4 = l3 * s4;
      let x;
      switch (alg) {
        case 0: x = l0 * fsin(p0 + l1 * fsin(p1 + l2 * fsin(p2 + x4))); break;
        case 1: x = l0 * fsin(p0 + l1 * fsin(p1)) + l2 * fsin(p2 + x4); break;
        case 2: x = l0 * fsin(p0 + l1 * fsin(p1) + l2 * fsin(p2) + x4); break;
        case 3: x = l0 * fsin(p0 + l1 * fsin(p1)) + l2 * fsin(p2) + x4; break;
        default: x = l0 * fsin(p0) + l1 * fsin(p1) + l2 * fsin(p2) + x4;
      }
      tL[i] = x;
    }
    ol[0] = l0; ol[1] = l1; ol[2] = l2; ol[3] = l3; ph[0] = p0; ph[1] = p1; ph[2] = p2; ph[3] = p3; v.f1 = f1; v.f2 = f2;
  }

  _drum(v, n) {
    const d = v.d, sr = this.sr, tape = this.tape, mph = v.mph;
    const mL = this.mL, mR = this.mR, rvL = this.rvL, rvR = this.rvR;
    const g = d.gain * v.vel, gl = g * v.gl, gr = g * v.gr, rv = d.rev;
    let ph = v.ph, ph2 = v.ph2, f = v.f, te = v.te, ne = v.ne, me = v.me, t = v.t, rng = v.rng;
    let n1 = v.n1, n2 = v.n2, m1 = v.m1, m2 = v.m2, bLeft = v.bLeft, bCnt = v.bCnt;
    const tLvl = d.tLvl, f1 = d.f1, pK = d.pK, tDC = d.tDC * v.tk, tHold = d.tHold, f2r = d.f2r, lvl2 = d.lvl2, drv = d.drive;
    const nLvl = d.nLvl, nTy = d.nType, nDC = d.nDC * v.nk, bDC = d.bDC, gap = d.gap, nk = d.nK;
    let gq = Math.tan(Math.PI * Math.min(d.nCut, 0.42 * sr) / sr); const na1 = 1 / (1 + gq * (gq + nk)), na2 = gq * na1, na3 = gq * na2;
    const mLvl = d.mLvl, mTy = d.mType, mk = d.mK, mDC = d.mDC * v.nk, mb = d.mBase * tape / sr;
    gq = Math.tan(Math.PI * Math.min(d.mCut, 0.42 * sr) / sr); const ma1 = 1 / (1 + gq * (gq + mk)), ma2 = gq * ma1, ma3 = gq * ma2;
    const q0 = mb * METAL[0], q1 = mb * METAL[1], q2 = mb * METAL[2], q3 = mb * METAL[3], q4 = mb * METAL[4], q5 = mb * METAL[5];
    let a0 = mph[0], a1 = mph[1], a2 = mph[2], a3 = mph[3], a4 = mph[4], a5 = mph[5];
    const fk = tape / sr;
    for (let i = 0; i < n; i++) {
      let x = 0;
      if (tLvl > 0) {
        f = f1 + (f - f1) * pK;
        ph += f * fk; if (ph >= 1) ph -= 1;
        let s = fsin(ph);
        if (lvl2 > 0) { ph2 += f * f2r * fk; if (ph2 >= 1) ph2 -= 1; s += lvl2 * fsin(ph2); }
        x += s * te * tLvl;
        if (t >= tHold) te -= te * tDC;
      }
      if (nLvl > 0) {
        if (bLeft > 0 && --bCnt <= 0) { ne = 1; bLeft--; bCnt = gap; }
        rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
        const w = (rng | 0) * 4.656612873e-10, v3 = w - n2, v1 = na1 * n1 + na2 * v3, v2 = n2 + na2 * n1 + na3 * v3;
        n1 = 2 * v1 - n1; n2 = 2 * v2 - n2;
        x += (nTy === 1 ? v2 : nTy === 2 ? v1 : w - nk * v1 - v2) * ne * nLvl;
        ne -= ne * (bLeft > 0 ? bDC : nDC);
      }
      if (mLvl > 0) {
        a0 += q0; if (a0 >= 1) a0 -= 1; a1 += q1; if (a1 >= 1) a1 -= 1; a2 += q2; if (a2 >= 1) a2 -= 1;
        a3 += q3; if (a3 >= 1) a3 -= 1; a4 += q4; if (a4 >= 1) a4 -= 1; a5 += q5; if (a5 >= 1) a5 -= 1;
        const w = ((a0 < 0.5 ? 1 : -1) + (a1 < 0.5 ? 1 : -1) + (a2 < 0.5 ? 1 : -1) + (a3 < 0.5 ? 1 : -1) + (a4 < 0.5 ? 1 : -1) + (a5 < 0.5 ? 1 : -1)) * 0.1667;
        const v3 = w - m2, v1 = ma1 * m1 + ma2 * v3, v2 = m2 + ma2 * m1 + ma3 * v3;
        m1 = 2 * v1 - m1; m2 = 2 * v2 - m2;
        x += (mTy === 2 ? v1 : w - mk * v1 - v2) * me * mLvl;
        me -= me * mDC;
      }
      if (drv > 0) { x *= drv; if (x > 3) x = 3; else if (x < -3) x = -3; x = x * (27 + x * x) / (27 + 9 * x * x); }
      t++;
      const l = x * gl, r = x * gr;
      mL[i] += l; mR[i] += r; rvL[i] += l * rv; rvR[i] += r * rv;
    }
    v.ph = ph; v.ph2 = ph2; v.f = f; v.te = te; v.ne = ne; v.me = me; v.t = t; v.rng = rng; v.n1 = n1; v.n2 = n2; v.m1 = m1; v.m2 = m2; v.bLeft = bLeft; v.bCnt = bCnt;
    mph[0] = a0; mph[1] = a1; mph[2] = a2; mph[3] = a3; mph[4] = a4; mph[5] = a5;
    if (bLeft <= 0 && (tLvl <= 0 || te < 2e-4) && (nLvl <= 0 || ne < 2e-4) && (mLvl <= 0 || me < 2e-4)) v.on = false;
  }

  _sfxVoice(v, n) {
    const L = v.L, sr = this.sr, tL = this.tL;
    if (v.fresh) {
      v.fresh = false;
      const inst = this.si[v.inst < 0 ? 0 : v.inst], seeds = this.siSeed;
      let s = seeds[inst.i]; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; seeds[inst.i] = s;
      const r = (s | 0) * 4.656612873e-10;
      const pm = L.fix ? 1 : inst.pitch * Math.exp(r * L.det / 1200 * LN2);
      v.ph = 0; v.mph = 0; v.f = L.f0 * pm; v.f1 = L.f1 * pm; v.fLeft = L.fN; v.fLn = Math.log(L.f1 / L.f0) / L.fN;
      v.idx = L.idx0; v.idx1 = L.idx1; v.idxLeft = L.idxN; v.idxLn = L.idx0 > 0 && L.idx1 > 0 ? Math.log(L.idx1 / L.idx0) / L.idxN : 0;
      v.env = 0; v.st = 0; v.hold = L.hold; v.g = L.g * inst.gain;
      v.cut = L.c0; v.c1 = L.c1; v.cLeft = L.cN; v.cLn = L.fT ? Math.log(L.c1 / L.c0) / L.cN : 0; v.ic1 = 0; v.ic2 = 0;
      let pan = inst.pan + L.pan; if (pan > 1) pan = 1; else if (pan < -1) pan = -1;
      const a = (pan + 1) * Math.PI / 4; v.gl = Math.cos(a) * 1.414; v.gr = Math.sin(a) * 1.414;
      v.vph = 0; v.aph = 0; v.rng = (s ^ 0x5bd1e995) | 1;
      for (let j = 0; j < 6; j++) v.sph[j] = j * 0.137;
    }
    // 高さ・変調・フィルターの動き（刻みごと）
    if (v.fLeft > 0) { const k = v.fLeft < n ? v.fLeft : n; v.f *= Math.exp(v.fLn * k); v.fLeft -= k; if (v.fLeft <= 0) v.f = v.f1; }
    let f = v.f;
    if (L.vibD) { v.vph += L.vibR * n / sr; v.vph -= (v.vph | 0); f *= Math.exp(L.vibD * fsin(v.vph) / 1200 * LN2); }
    const dt = f / sr < 0.49 ? f / sr : 0.49;
    switch (L.type) {
      case 0: { let t = v.ph; for (let i = 0; i < n; i++) { t += dt; if (t >= 1) t -= 1; tL[i] = fsin(t); } v.ph = t; break; }
      case 1: { let t = v.ph; for (let i = 0; i < n; i++) { t += dt; if (t >= 1) t -= 1; tL[i] = t < 0.5 ? 4 * t - 1 : 3 - 4 * t; } v.ph = t; break; }
      case 2: {
        let t = v.ph;
        for (let i = 0; i < n; i++) {
          t += dt; if (t >= 1) t -= 1; let s = 2 * t - 1;
          if (t < dt) { const x = t / dt; s -= x + x - x * x - 1; } else if (t > 1 - dt) { const x = (t - 1) / dt; s -= x * x + x + x + 1; }
          tL[i] = s;
        }
        v.ph = t; break;
      }
      case 3: {
        let t = v.ph; const w = L.pw, dc = 2 * w - 1;
        for (let i = 0; i < n; i++) {
          t += dt; if (t >= 1) t -= 1; let s = t < w ? 1 : -1;
          if (t < dt) { const x = t / dt; s += x + x - x * x - 1; } else if (t > 1 - dt) { const x = (t - 1) / dt; s += x * x + x + x + 1; }
          let u = t - w; if (u < 0) u += 1;
          if (u < dt) { const x = u / dt; s -= x + x - x * x - 1; } else if (u > 1 - dt) { const x = (u - 1) / dt; s -= x * x + x + x + 1; }
          tL[i] = s - dc;
        }
        v.ph = t; break;
      }
      case 4: { let s = v.rng; for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; tL[i] = (s | 0) * 4.656612873e-10; } v.rng = s; break; }
      case 5: {
        if (v.idxLeft > 0) { const k = v.idxLeft < n ? v.idxLeft : n; if (v.idxLn !== 0) v.idx *= Math.exp(v.idxLn * k); v.idxLeft -= k; if (v.idxLeft <= 0) v.idx = v.idx1; }
        let t = v.ph, m = v.mph; const dm = dt * L.mr < 0.49 ? dt * L.mr : 0.49, ix = v.idx;
        for (let i = 0; i < n; i++) { t += dt; if (t >= 1) t -= 1; m += dm; if (m >= 1) m -= 1; tL[i] = fsin(t + ix * fsin(m)); }
        v.ph = t; v.mph = m; break;
      }
      case 6: {   // 破片: まばらなパルス
        let s = v.rng; const th = L.dens * 2147483648 * 2;
        for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const u = s >>> 0; tL[i] = u < th ? ((u & 1) ? 3 : -3) : 0; }
        v.rng = s; break;
      }
      default: {  // 金属: 整数比でない矩形波 6 本
        const sp = v.sph;
        for (let i = 0; i < n; i++) tL[i] = 0;
        for (let j = 0; j < 6; j++) { let t = sp[j]; const d2 = dt * METAL[j] < 0.49 ? dt * METAL[j] : 0.49; for (let i = 0; i < n; i++) { t += d2; if (t >= 1) t -= 1; tL[i] += t < 0.5 ? 0.1667 : -0.1667; } sp[j] = t; }
      }
    }
    if (L.fT) {
      if (v.cLeft > 0) { const k = v.cLeft < n ? v.cLeft : n; v.cut *= Math.exp(v.cLn * k); v.cLeft -= k; if (v.cLeft <= 0) v.cut = v.c1; }
      let fc = v.cut; if (fc < 30) fc = 30; else if (fc > 0.42 * sr) fc = 0.42 * sr;
      const g = Math.tan(Math.PI * fc / sr), k = L.fk, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2, ty = L.fT;
      let c1 = v.ic1, c2 = v.ic2;
      for (let i = 0; i < n; i++) {
        const x = tL[i], v3 = x - c2, v1 = a1 * c1 + a2 * v3, v2 = c2 + a2 * c1 + a3 * v3;
        c1 = 2 * v1 - c1; c2 = 2 * v2 - c2;
        tL[i] = ty === 1 ? v2 : ty === 2 ? v1 : x - k * v1 - v2;
      }
      v.ic1 = c1; v.ic2 = c2;
    }
    let g = v.g;
    if (L.amD) { v.aph += L.amR * n / sr; v.aph -= (v.aph | 0); g *= 1 - L.amD * (0.5 + 0.5 * fsin(v.aph)); }
    const gl = g * v.gl, gr = g * v.gr, rv = L.rev, dly = L.dly * 0.5, aInc = L.aInc, dC = L.dC, kill = v.kill;
    const sL = this.sL, sR = this.sR, srL = this.srL, srR = this.srR, sdl = this.sdl;
    let env = v.env, st = v.st, hold = v.hold;
    for (let i = 0; i < n; i++) {
      if (kill) env -= env * 0.012;
      else if (st === 0) { env += aInc; if (env >= 1) { env = 1; st = hold > 0 ? 1 : 2; } }
      else if (st === 1) { if (--hold <= 0) st = 2; }
      else env -= env * dC;
      const x = tL[i] * env, l = x * gl, r = x * gr;
      sL[i] += l; sR[i] += r; srL[i] += l * rv; srR[i] += r * rv; sdl[i] += (l + r) * dly;
    }
    v.env = env; v.st = st; v.hold = hold;
    if ((st === 2 || kill) && env < 3e-4) { v.on = false; v.inst = -1; }
  }

  _master(L, R, off, n) {
    const sr = this.sr;
    const mL = this.mL, mR = this.mR, dL = this.dL, dR = this.dR, rvL = this.rvL, rvR = this.rvR, dl = this.dl;
    const sL = this.sL, sR = this.sR, srL = this.srL, srR = this.srR, sdl = this.sdl;
    const vol = this.vol;
    // 音量はなめらかに（刻みの中は直線）
    const gMt = vol.bgm * this.sfxDuck * this.pauseG, gSt = vol.sfx, gOt = vol.master;
    let gM = this.gM, gS = this.gS, gO = this.gMaster;
    const kk = 1 - Math.exp(-n / (0.012 * sr));
    const gMd = (gMt - gM) * kk / n, gSd = (gSt - gS) * kk / n, gOd = (gOt - gO) * kk / n;
    let fade = this.fade; const fT = this.fadeTarget, fStep = this.fadeStep;
    let scEnv = this.scEnv, scSm = this.scSm; const scRel = this.scRel, scDepth = this.scDepth;
    // 残響
    const fdn = this.fdn, fl = this.fdnLen, fp = this.fdnPos, flp = this.fdnLp, fg = this.fdnG, damp = this.revDamp, revLvl = this.revLvl;
    const b0 = fdn[0], b1 = fdn[1], b2 = fdn[2], b3 = fdn[3], b4 = fdn[4], b5 = fdn[5], b6 = fdn[6], b7 = fdn[7];
    let p0 = fp[0], p1 = fp[1], p2 = fp[2], p3 = fp[3], p4 = fp[4], p5 = fp[5], p6 = fp[6], p7 = fp[7];
    let z0 = flp[0], z1 = flp[1], z2 = flp[2], z3 = flp[3], z4 = flp[4], z5 = flp[5], z6 = flp[6], z7 = flp[7];
    const ap = this.ap, apl = this.apLen, app = this.apPos;
    const ap0 = ap[0], ap1 = ap[1], ap2 = ap[2], ap3 = ap[3];
    let q0 = app[0], q1 = app[1], q2 = app[2], q3 = app[3];
    const preL = this.preL, preR = this.preR, preLen = this.preLen; let prePos = this.prePos;
    let rh1 = this.revIn1, rh2 = this.revIn2; const rhp = this.revHp;
    // ディレイ
    const dbl = this.dlBufL, dbr = this.dlBufR, dMax = this.dlMax, dN = this.dlyN, dFb = this.dlyFb, dLvl = this.dlyLvl;
    let dPos = this.dlPos, dlpL = this.dlLpL, dlpR = this.dlLpR;
    // 曲のローパス
    const lg = Math.tan(Math.PI * Math.min(this.lpCut, 0.42 * sr) / sr), lk = 1.3, la1 = 1 / (1 + lg * (lg + lk)), la2 = lg * la1, la3 = lg * la2;
    const lpOn = this.lpCut < 17000; let lpMix = this.lpMix; const lpT = lpOn ? 1 : 0;
    let shL = this.shL, shR = this.shR; const shK = this.shK;
    let lL1 = this.lpL1, lL2 = this.lpL2, lR1 = this.lpR1, lR2 = this.lpR2;
    // マスター
    let dcxL = this.dcxL, dcyL = this.dcyL, dcxR = this.dcxR, dcyR = this.dcyR; const dcR = this.dcR;
    let cEnv = this.cEnv; const cAtt = this.cAtt, cRel = this.cRel;
    const laL = this.laL, laR = this.laR, laG = this.laG, laN = this.laN; let laPos = this.laPos, laSum = this.laSum, laMin = this.laMin, laHold = this.laHold;
    const laRel = 1 - Math.exp(-1 / (0.09 * sr));
    const CEIL = 0.85, THR = 0.3, MAKEUP = 1.12;
    let grMin = this.grMin;
    for (let i = 0; i < n; i++) {
      gM += gMd; gS += gSd; gO += gOd;
      if (fade !== fT) { const d = fT - fade; fade += d > fStep ? fStep : d < -fStep ? -fStep : d; }
      // サイドチェイン（キックで低音・和音の層を下げる）
      scEnv *= scRel; scSm += (scEnv - scSm) * 0.004;
      const sc = 1 - scDepth * scSm;
      const gm = gM * fade;
      let xl = (mL[i] + dL[i] * sc) * gm, xr = (mR[i] + dR[i] * sc) * gm;
      // ディレイ（ピンポン）
      const rp = dPos - dN < 0 ? dPos - dN + dMax : dPos - dN;
      const el = dbl[rp], er = dbr[rp];
      dlpL += (el - dlpL) * 0.45; dlpR += (er - dlpR) * 0.45;
      dbl[dPos] = dl[i] * gm + sdl[i] * gS + dlpR * dFb; dbr[dPos] = dlpL * dFb;
      if (++dPos >= dMax) dPos = 0;
      // 残響: 低域を抜いて前置き遅延 → 拡散 → FDN
      let il = rvL[i] * gm + srL[i] * gS + el * 0.25, ir = rvR[i] * gm + srR[i] * gS + er * 0.25;
      rh1 += (il - rh1) * rhp; il -= rh1; rh2 += (ir - rh2) * rhp; ir -= rh2;
      const pl = preL[prePos], pr = preR[prePos]; preL[prePos] = il; preR[prePos] = ir; if (++prePos >= preLen) prePos = 0;
      let a = ap0[q0], y = pl - 0.6 * a; ap0[q0] = y; if (++q0 >= apl[0]) q0 = 0; let dlIn = a + 0.6 * y;
      a = ap1[q1]; y = dlIn - 0.6 * a; ap1[q1] = y; if (++q1 >= apl[1]) q1 = 0; dlIn = a + 0.6 * y;
      a = ap2[q2]; y = pr - 0.6 * a; ap2[q2] = y; if (++q2 >= apl[2]) q2 = 0; let drIn = a + 0.6 * y;
      a = ap3[q3]; y = drIn - 0.6 * a; ap3[q3] = y; if (++q3 >= apl[3]) q3 = 0; drIn = a + 0.6 * y;
      z0 += (b0[p0] - z0) * (1 - damp); z1 += (b1[p1] - z1) * (1 - damp); z2 += (b2[p2] - z2) * (1 - damp); z3 += (b3[p3] - z3) * (1 - damp);
      z4 += (b4[p4] - z4) * (1 - damp); z5 += (b5[p5] - z5) * (1 - damp); z6 += (b6[p6] - z6) * (1 - damp); z7 += (b7[p7] - z7) * (1 - damp);
      const hs = (z0 + z1 + z2 + z3 + z4 + z5 + z6 + z7) * 0.25;
      b0[p0] = (z0 - hs) * fg[0] + dlIn; b1[p1] = (z1 - hs) * fg[1] + drIn; b2[p2] = (z2 - hs) * fg[2] - dlIn; b3[p3] = (z3 - hs) * fg[3] - drIn;
      b4[p4] = (z4 - hs) * fg[4] + dlIn; b5[p5] = (z5 - hs) * fg[5] + drIn; b6[p6] = (z6 - hs) * fg[6] - dlIn; b7[p7] = (z7 - hs) * fg[7] - drIn;
      if (++p0 >= fl[0]) p0 = 0; if (++p1 >= fl[1]) p1 = 0; if (++p2 >= fl[2]) p2 = 0; if (++p3 >= fl[3]) p3 = 0;
      if (++p4 >= fl[4]) p4 = 0; if (++p5 >= fl[5]) p5 = 0; if (++p6 >= fl[6]) p6 = 0; if (++p7 >= fl[7]) p7 = 0;
      const wl = (z0 - z2 + z4 - z6) * 0.35 * revLvl, wr = (z1 - z3 + z5 - z7) * 0.35 * revLvl;
      xl += el * dLvl + wl; xr += er * dLvl + wr;
      // 曲の高域を少し持ち上げる（3kHz から上を約 +3dB。こもりを防ぐ）
      shL += (xl - shL) * shK; xl += 0.42 * (xl - shL); shR += (xr - shR) * shK; xr += 0.42 * (xr - shR);
      // 曲のローパス（一時停止・切り替え）
      if (lpMix !== lpT) { lpMix += (lpT - lpMix) * 0.002; if (lpMix < 0.0005 && lpT === 0) lpMix = 0; else if (lpMix > 0.9995 && lpT === 1) lpMix = 1; }
      if (lpMix > 0) {
        let v3 = xl - lL2, v1 = la1 * lL1 + la2 * v3, v2 = lL2 + la2 * lL1 + la3 * v3; lL1 = 2 * v1 - lL1; lL2 = 2 * v2 - lL2; xl += (v2 - xl) * lpMix;
        v3 = xr - lR2; v1 = la1 * lR1 + la2 * v3; v2 = lR2 + la2 * lR1 + la3 * v3; lR1 = 2 * v1 - lR1; lR2 = 2 * v2 - lR2; xr += (v2 - xr) * lpMix;
      }
      xl += sL[i] * gS; xr += sR[i] * gS;
      // 直流カット
      y = xl - dcxL + dcR * dcyL; dcxL = xl; dcyL = y; xl = y;
      y = xr - dcxR + dcR * dcyR; dcxR = xr; dcyR = y; xr = y;
      // バス圧縮（2:1、左右連動）
      const al = xl < 0 ? -xl : xl, ar = xr < 0 ? -xr : xr, pk = al > ar ? al : ar;
      cEnv += (pk - cEnv) * (pk > cEnv ? cAtt : cRel);
      const cg = (cEnv > THR ? Math.sqrt(THR / cEnv) : 1) * MAKEUP;
      xl *= cg; xr *= cg;
      // ソフトクリップ
      if (xl > 0.7) xl = 0.7 + 0.3 * Math.tanh((xl - 0.7) / 0.3); else if (xl < -0.7) xl = -0.7 - 0.3 * Math.tanh((-xl - 0.7) / 0.3);
      if (xr > 0.7) xr = 0.7 + 0.3 * Math.tanh((xr - 0.7) / 0.3); else if (xr < -0.7) xr = -0.7 - 0.3 * Math.tanh((-xr - 0.7) / 0.3);
      // 先読みリミッター: 2.5ms 先のピークを見て、そこまでになめらかに下げておく
      const a2 = xl < 0 ? -xl : xl, a3 = xr < 0 ? -xr : xr, p = a2 > a3 ? a2 : a3;
      const need = p > CEIL ? CEIL / p : 1;
      if (need <= laMin) { laMin = need; laHold = laN; }
      else if (laHold > 0) laHold--;
      else { laMin += (1 - laMin) * laRel; if (laMin > need) laMin = need; }
      laSum += laMin - laG[laPos]; laG[laPos] = laMin;
      const ol = laL[laPos], or = laR[laPos]; laL[laPos] = xl; laR[laPos] = xr;
      if (++laPos >= laN) laPos = 0;
      let lgn = laSum / laN; if (lgn > 1) lgn = 1; if (lgn < grMin) grMin = lgn;
      let outL = ol * lgn * gO, outR = or * lgn * gO;
      if (outL > 0.98) outL = 0.98; else if (outL < -0.98) outL = -0.98;
      if (outR > 0.98) outR = 0.98; else if (outR < -0.98) outR = -0.98;
      if (R) { L[off + i] = outL; R[off + i] = outR; } else L[off + i] = 0.5 * (outL + outR);
    }
    // 状態を戻す（ごく小さい値は 0 に。非正規化数で遅くならないように）
    this.gM = gM; this.gS = gS; this.gMaster = gO; this.fade = fade; this.scEnv = Z(scEnv); this.scSm = Z(scSm);
    fp[0] = p0; fp[1] = p1; fp[2] = p2; fp[3] = p3; fp[4] = p4; fp[5] = p5; fp[6] = p6; fp[7] = p7;
    flp[0] = Z(z0); flp[1] = Z(z1); flp[2] = Z(z2); flp[3] = Z(z3); flp[4] = Z(z4); flp[5] = Z(z5); flp[6] = Z(z6); flp[7] = Z(z7);
    app[0] = q0; app[1] = q1; app[2] = q2; app[3] = q3; this.prePos = prePos; this.revIn1 = Z(rh1); this.revIn2 = Z(rh2);
    this.dlPos = dPos; this.dlLpL = Z(dlpL); this.dlLpR = Z(dlpR);
    this.shL = Z(shL); this.shR = Z(shR);
    this.lpMix = lpMix; this.lpL1 = Z(lL1); this.lpL2 = Z(lL2); this.lpR1 = Z(lR1); this.lpR2 = Z(lR2);
    this.dcxL = dcxL; this.dcyL = Z(dcyL); this.dcxR = dcxR; this.dcyR = Z(dcyR); this.cEnv = Z(cEnv);
    this.laPos = laPos; this.laSum = laSum; this.laMin = laMin; this.laHold = laHold; this.grMin = grMin;
    if (fade <= 0 && this.pending) this._doPending();
  }

  // 知らせ（'start' 'loopStart' 'loop' 'ended'）。音の計算の中では作り置きの入れ物に書くだけ
  _event(type, id, n) { if (this.evCount < this.evPool.length) { const e = this.evPool[this.evCount++]; e.type = type; e.id = id; e.n = n; e.sample = this.samplePos; } }
  drainEvents() { const out = []; for (let i = 0; i < this.evCount; i++) out.push({ ...this.evPool[i] }); this.evCount = 0; return out; }
  get events() { return this.evCount ? this.evPool.slice(0, this.evCount) : EMPTY; }
}
const EMPTY = [];
// ごく小さい値を 0 にする（非正規化数で遅くならないように）
function Z(x) { return x < 1e-15 && x > -1e-15 ? 0 : x; }
