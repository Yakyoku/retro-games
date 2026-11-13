// 月影の魔城 — 音の窓口（メインスレッド）。AudioWorklet が使えなければ ScriptProcessor で同じ音源を回す。
// 曲・効果音・環境音の音量とミュートは別々（設定に保存）。最初のユーザー操作の中で init() を呼ぶこと。
import { FMSynth, TPQ } from './synth.js';
import { PATCHES } from './patches.js';
import { makeSamples } from './pcm.js';
import { getSongs } from './songs.js';
import { SFX, AUDIO_EVENTS, songFor } from './sfx.js';

export class GameAudio {
  constructor() {
    this.ctx = null; this.ready = false; this.current = null; this.pending = undefined; this.last = {}; this.peak = 0; this.songTick = 0;
    this.vol = { music: 0.75, sfx: 0.85, ambient: 0.5, muteMusic: false, muteSfx: false, muteAmbient: false };
    this.ambientKind = null; this.thenTimer = null; this.log = [];
  }
  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return this; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return this;
    this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
    // 出力の仕上げ: 30Hz 以下を切る → 7kHz 以上を 3dB 和らげる → 軽い圧縮（音量の山をそろえ、効果音で音が割れない）
    this.out = this.ctx.createGain(); this.out.gain.value = 1.0;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30;
    const sh = this.ctx.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 7000; sh.gain.value = -3;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18;
    const make = this.ctx.createGain(); make.gain.value = 1.25;
    this.out.connect(hp); hp.connect(sh); sh.connect(comp); comp.connect(make); make.connect(this.ctx.destination);
    this.songs = getSongs();
    const samples = makeSamples();
    try {
      if (!this.ctx.audioWorklet) throw new Error('AudioWorklet なし');
      await this.ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'tsukikage-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.port.postMessage({ type: 'init', patches: PATCHES, samples, songs: this.songs, sfx: SFX });
      this.node.port.onmessage = (e) => { if (e.data.type === 'meter') { this.peak = e.data.peak; this.songTick = e.data.tick; this.playing = e.data.song; } };
      this.node.connect(this.out); this.mode = 'worklet';
    } catch (err) {
      const sy = new FMSynth(this.ctx.sampleRate); sy.setPatches(PATCHES); sy.setSamples(samples);
      this.local = sy;
      const sp = this.ctx.createScriptProcessor(1024, 0, 2);
      sp.onaudioprocess = (e) => { sy.render(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), e.outputBuffer.length); this.peak = Math.max(...sy.meter); this.playing = sy.seq && sy.seq.song.id; };
      sp.connect(this.out); this.node = sp; this.mode = 'script';
      console.warn('[audio] ScriptProcessor で再生します:', err && err.message);
    }
    this.makeAmbient();
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    this.ready = true;
    this.applyVolume();
    if (this.pending !== undefined) { const p = this.pending; this.pending = undefined; this.music(p.id, p.opts); }
    return this;
  }
  post(m) {
    if (!this.ready) return;
    if (this.mode === 'worklet') { this.node.port.postMessage(m); return; }
    const sy = this.local;
    if (m.type === 'song') sy.playSong(m.id ? this.songs[m.id] : null, { fadeIn: m.fadeIn });
    else if (m.type === 'fade') sy.fadeOut(m.sec);
    else if (m.type === 'sfx') sy.playSfx(SFX[m.id], undefined, m.tr || 0);
    else if (m.type === 'vol') { if (m.music != null) sy.musicVol = m.music; if (m.sfx != null) sy.sfxVol = m.sfx; }
    else if (m.type === 'stopAll') sy.playSong(null);
  }
  // 曲: 同じ曲の二重再生をしない。then: 短い曲の後に続ける曲
  music(id, opts = {}) {
    if (!this.ready) { this.pending = { id, opts }; return; }
    clearTimeout(this.thenTimer);
    if (id === this.current && !opts.restart) return;
    this.current = id;
    this.post({ type: 'song', id, fadeIn: opts.fadeIn });
    this.log.push({ t: performance.now(), song: id });
    if (opts.then && id) this.thenTimer = setTimeout(() => this.music(opts.then), this.duration(id) * 1000);
  }
  duration(id) { const s = this.songs && this.songs[id]; if (!s) return 0; const end = Math.max(...s.tracks.map((t) => t.endTick)); return end / (s.tempo * TPQ / 60); }
  fade(sec = 1) { this.current = null; this.post({ type: 'fade', sec }); }
  sfx(id, tr = 0) {
    if (!id || !SFX[id]) return;
    this.post({ type: 'sfx', id, tr });
  }
  // 大きな出来事（鎧破壊・死亡・ボス撃破）の瞬間だけ曲を少し下げて効果音を立てる
  duck(k = 0.55, sec = 0.6) {
    if (!this.ready) return;
    this.ducked = k; this.applyVolume();
    clearTimeout(this.duckTimer); this.duckTimer = setTimeout(() => { this.ducked = 1; this.applyVolume(); }, sec * 1000);
  }
  setPaused(on) { this.pausedK = on ? 0.35 : 1; this.applyVolume(); }
  // ゲームの出来事の配列をまとめて鳴らす（同じ tick・短い間隔の重複は捨てる）
  events(list, stageIndex) {
    const now = performance.now();
    for (const e of list) {
      const s = songFor(e, stageIndex);
      if (s !== undefined) { if (s === null) this.fade(0.3); else this.music(s); }
      const m = AUDIO_EVENTS[e.type];
      if (!m) continue;
      const ids = m.by ? [m.by(e)] : m.sfx;
      for (const id of ids) {
        if (!id) continue;
        if (m.throttle && now - (this.last[id] || 0) < m.throttle) continue;
        this.last[id] = now;
        // 連続する同じ音は少しだけ音程を揺らす（機械的な繰り返しに聞こえない）
        const jit = e.type === 'fire' || e.type === 'enemyHit' || e.type === 'clink' || e.type === 'eShot' ? Math.round((Math.random() - 0.5) * 2) : 0;
        this.sfx(id, jit);
      }
      if (e.type === 'armorBreak' || e.type === 'death' || e.type === 'bossDie') this.duck(e.type === 'bossDie' ? 0.4 : 0.55, e.type === 'bossDie' ? 1.4 : 0.7);
    }
  }
  // ---- 環境音（風・水滴・溶岩のうなり）。曲や効果音とは別の音量
  makeAmbient() {
    const c = this.ctx, n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let s = 7; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    this.amb = { src: c.createBufferSource(), filt: c.createBiquadFilter(), gain: c.createGain(), lfo: c.createOscillator(), lfoGain: c.createGain() };
    const a = this.amb;
    a.src.buffer = buf; a.src.loop = true; a.filt.type = 'bandpass'; a.filt.frequency.value = 400; a.filt.Q.value = 0.7; a.gain.gain.value = 0;
    a.lfo.frequency.value = 0.13; a.lfoGain.gain.value = 180; a.lfo.connect(a.lfoGain); a.lfoGain.connect(a.filt.frequency);
    a.src.connect(a.filt); a.filt.connect(a.gain); a.gain.connect(this.out); a.src.start(); a.lfo.start();
  }
  ambient(kind) {
    this.ambientKind = kind;
    if (!this.amb) return;
    const P = { graveyard: [420, 0.8, 0.05], village: [520, 0.9, 0.04], cave: [900, 4, 0.03], tower: [360, 0.8, 0.05], fortress: [140, 1.2, 0.07], citadel: [220, 1.0, 0.05] }[kind];
    const t = this.ctx.currentTime;
    if (!P) { this.amb.gain.gain.setTargetAtTime(0, t, 0.3); return; }
    this.amb.filt.frequency.setTargetAtTime(P[0], t, 0.5); this.amb.filt.Q.setTargetAtTime(P[1], t, 0.5);
    this.amb.level = P[2];
    this.applyVolume();
  }
  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); }
  applyVolume() {
    const v = this.vol;
    this.post({ type: 'vol', music: v.muteMusic ? 0 : v.music * (this.ducked ?? 1) * (this.pausedK ?? 1), sfx: v.muteSfx ? 0 : v.sfx });
    if (this.amb && this.ctx) this.amb.gain.gain.setTargetAtTime(this.ambientKind && !v.muteAmbient ? (this.amb.level || 0) * v.ambient * 4 : 0, this.ctx.currentTime, 0.4);
  }
  // フォーカス喪失・VR 開始/終了・復帰
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume().catch(() => {}); }
}
