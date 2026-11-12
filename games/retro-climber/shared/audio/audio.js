// 鉄骨レスキュー — 音の再生（Web Audio で端末内合成。録音素材・外部 API は使わない）。
// 系統: 曲（music）・効果音（sfx）・追加の環境音（ambient）を別の音量で調整できる。
// 曲は先読みスケジューラー（0.12 秒先まで予約）で鳴らす。ループの継ぎ目は拍で計算するので隙間が出ない。
// VR では位置に意味がある効果音だけ PannerNode（HRTF）で鳴らし、曲・結果音は頭の向きに依存させない。
// 危険の音（danger）は距離で弱めすぎない（rolloff を小さく、最低音量を確保）。
import { parseMML } from './mml.js';
import { SONGS } from './songs.js';
import { SFX } from './sfx.js';

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

export class GameAudio {
  constructor() {
    this.ctx = null; this.ready = false;
    this.vol = { master: 0.8, music: 0.7, sfx: 0.9, ambient: 0.4 };
    this.ambientOn = true; this.spatial = false;
    this.song = null; this.songName = null; this.timer = null;
    this.channels = {}; this.parsed = {};
    for (const [k, s] of Object.entries(SONGS)) this.parsed[k] = s.tracks.map(parseMML);
    this.stats = { played: 0, interrupted: 0 };
  }
  // ユーザー操作の中で呼ぶ（iPad Safari・Quest Browser はこれがないと鳴らない）
  unlock() {
    if (!AC) return false;
    if (!this.ctx) {
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain(); this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -6; this.limiter.knee.value = 6; this.limiter.ratio.value = 4; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
      this.master.connect(this.limiter); this.limiter.connect(c.destination);
      this.bus = { music: c.createGain(), sfx: c.createGain(), ambient: c.createGain() };
      for (const b of Object.values(this.bus)) b.connect(this.master);
      this.waves = [0.125, 0.25, 0.5].map((d) => this.pulseWave(d));
      this.noise = this.makeNoise();
      this.applyVolume();
      // 無音を一度鳴らして経路を開く（iOS）
      const o = c.createBufferSource(); o.buffer = c.createBuffer(1, 1, 22050); o.connect(c.destination); o.start();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.ready = true;
    return true;
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master * 0.9, t, 0.02);
    this.bus.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.02);
    this.bus.sfx.gain.setTargetAtTime(this.vol.sfx * 0.6, t, 0.02);
    this.bus.ambient.gain.setTargetAtTime(this.ambientOn ? this.vol.ambient * 0.5 : 0, t, 0.05);
  }

  pulseWave(duty) {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { re[k] = 0; im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty); }
    // 帯域を抑えるため高次を少し丸める（にじまない程度）
    for (let k = 1; k < n; k++) im[k] *= Math.pow(0.985, k);
    return this.ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }
  makeNoise() {
    // 当時の基板のような周期の短いノイズ（15bit LFSR を 1 サンプルずつ）
    const c = this.ctx, len = c.sampleRate * 1, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let r = 1, hold = 0, v = 0; const step = Math.max(1, Math.round(c.sampleRate / 22050));
    for (let i = 0; i < len; i++) {
      if (hold-- <= 0) { hold = step - 1; const bit = (r ^ (r >> 1)) & 1; r = (r >> 1) | (bit << 14); v = r & 1 ? 0.8 : -0.8; }
      d[i] = v;
    }
    return buf;
  }
  // 1 つの音（オシレーターかノイズ）を予約する
  voice(dst, w, f0, f1, t0, d, v, curve = 'exp', steps = 0, vib = 0, release = 0.012) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.004);
    g.gain.setValueAtTime(v, Math.max(t0 + 0.004, t0 + d - release));
    g.gain.linearRampToValueAtTime(0, t0 + d);
    g.connect(dst);
    let src;
    if (w === 4) {
      src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(Math.max(40, f0), t0);
      if (f1 !== f0) bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + d);
      src.connect(bp); bp.connect(g);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + d + 0.02);
    } else {
      src = c.createOscillator();
      if (w === 3) src.type = 'triangle'; else src.setPeriodicWave(this.waves[w] || this.waves[2]);
      const fr = src.frequency;
      fr.setValueAtTime(Math.max(20, f0), t0);
      if (f1 !== f0) {
        if (curve === 'step' && steps > 1) for (let i = 1; i < steps; i++) fr.setValueAtTime(f0 + (f1 - f0) * (i / (steps - 1)), t0 + d * i / steps);
        else if (curve === 'lin') fr.linearRampToValueAtTime(f1, t0 + d);
        else fr.exponentialRampToValueAtTime(Math.max(20, f1), t0 + d);
      }
      if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.06; l.connect(lg); lg.connect(fr); l.start(t0); l.stop(t0 + d + 0.02); }
      src.connect(g);
      src.start(t0); src.stop(t0 + d + 0.02);
    }
    return { src, g };
  }

  // ---------------------------------------------------------- 効果音
  // 同じ系統で鳴っている音より優先度が低ければ鳴らさない。高ければ前の音を止めて割り込む
  play(name, opt = {}) {
    if (!this.ready || !this.ctx) return false;
    const def = SFX[name]; if (!def) return false;
    const c = this.ctx, now = c.currentTime;
    const ch = this.channels[def.ch];
    if (ch && ch.end > now && ch.pri > def.pri) return false;
    if (ch && ch.end > now) { for (const n of ch.nodes) { try { n.g.gain.cancelScheduledValues(now); n.g.gain.setTargetAtTime(0, now, 0.004); n.src.stop(now + 0.03); } catch {} } this.stats.interrupted++; }
    let dst = this.bus.sfx;
    if (this.spatial && def.pos && opt.pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = def.danger ? 4 : 2.5; p.rolloffFactor = def.danger ? 0.25 : 0.6; p.maxDistance = 40;
      const [x, y, z] = opt.pos;
      if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
      p.connect(this.bus.sfx); dst = p;
    }
    let t = now + 0.005; const nodes = [];
    for (const s of def.seg) {
      const start = s.par ? t - (def.seg[def.seg.indexOf(s) - 1]?.d || 0) : t;
      if (s.v > 0 && s.f > 0) nodes.push(this.voice(dst, s.w, s.f, s.to ?? s.f, start, s.d, s.v * (opt.gain ?? 1), s.curve, s.steps, s.vib));
      if (!s.par) t += s.d;
    }
    this.channels[def.ch] = { pri: def.pri, end: t, nodes };
    this.stats.played++;
    return true;
  }
  setListener(m) {
    // VR: 頭の位置と向き（three の Matrix4.elements）を聞き手へ
    if (!this.ctx) return;
    const L = this.ctx.listener, e = m;
    const pos = [e[12], e[13], e[14]], fw = [-e[8], -e[9], -e[10]], up = [e[4], e[5], e[6]];
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(pos[0], t); L.positionY.setValueAtTime(pos[1], t); L.positionZ.setValueAtTime(pos[2], t);
      L.forwardX.setValueAtTime(fw[0], t); L.forwardY.setValueAtTime(fw[1], t); L.forwardZ.setValueAtTime(fw[2], t);
      L.upX.setValueAtTime(up[0], t); L.upY.setValueAtTime(up[1], t); L.upZ.setValueAtTime(up[2], t);
    } else { L.setPosition(...pos); L.setOrientation(...fw, ...up); }
  }

  // ---------------------------------------------------------- 曲
  music(name, { restart = false } = {}) {
    if (!this.ready || !this.ctx) { this.pending = name; return; }
    if (this.songName === name && !restart && this.song) return;
    this.stopMusic();
    if (!name) return;
    const song = SONGS[name]; if (!song) return;
    const tracks = this.parsed[name];
    const spb = 60 / tracks[0].tempo;
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = 1; gain.connect(this.bus.music);
    this.song = { name, tracks, spb, t0: c.currentTime + 0.06, loop: song.loop, beats: Math.max(...tracks.map((t) => t.beats)), idx: tracks.map(() => 0), lap: 0, gain, nodes: [] };
    this.songName = name;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 40);
  }
  schedule() {
    const s = this.song; if (!s || !this.ctx) return;
    const ahead = this.ctx.currentTime + 0.12;
    let finished = true;
    s.tracks.forEach((tr, ti) => {
      for (;;) {
        if (s.idx[ti] >= tr.notes.length) {
          if (!s.loop) break;
          if (s.tracks.every((t2, k) => s.idx[k] >= t2.notes.length)) { s.idx = s.tracks.map(() => 0); s.lap++; }
          else break;
        }
        const n = tr.notes[s.idx[ti]];
        const at = s.t0 + (s.lap * s.beats + n.t) * s.spb;
        if (at > ahead) { finished = false; break; }
        const d = n.d * s.spb * (n.q / 8);
        const node = this.voice(s.gain, n.w, n.f, n.f, at, Math.max(0.03, d), (n.v / 15) * 0.42, 'exp', 0, 0, Math.min(0.03, d * 0.3));
        s.nodes.push(node); if (s.nodes.length > 64) s.nodes.shift();
        s.idx[ti]++;
        finished = false;
      }
    });
    if (!s.loop && finished && this.ctx.currentTime > s.t0 + s.beats * s.spb + 0.3) { const cb = s.onEnd; this.stopMusic(); cb && cb(); }
  }
  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.song && this.ctx) {
      const now = this.ctx.currentTime;
      this.song.gain.gain.setTargetAtTime(0, now, 0.01);
      for (const n of this.song.nodes) { try { n.src.stop(now + 0.05); } catch {} }
      const g = this.song.gain; setTimeout(() => { try { g.disconnect(); } catch {} }, 200);
    }
    this.song = null; this.songName = null;
  }
  musicDuration(name) { const tr = this.parsed[name]; return tr ? Math.max(...tr.map((t) => t.beats)) * 60 / tr[0].tempo : 0; }

  // ---------------------------------------------------------- 追加の環境音（工事現場の風と遠い金属音。補助・既定は控えめ）
  ambient(on) {
    if (!this.ready || !this.ctx) return;
    if (on && !this.amb) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.25;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      const g = c.createGain(); g.gain.value = 0.12;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
      src.connect(lp); lp.connect(g); g.connect(this.bus.ambient); src.start(); lfo.start();
      this.amb = { src, lfo, g };
      this.ambTimer = setInterval(() => {
        if (!this.amb || Math.random() > 0.35) return;
        const t = c.currentTime + 0.02, f = [180, 240, 320][Math.floor(Math.random() * 3)];
        this.voice(this.bus.ambient, 3, f, f * 0.98, t, 0.35, 0.05);
      }, 1700);
    } else if (!on && this.amb) {
      try { this.amb.src.stop(); this.amb.lfo.stop(); } catch {}
      clearInterval(this.ambTimer); this.amb = null;
    }
  }
}
