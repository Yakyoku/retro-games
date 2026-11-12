// Sky Climber VR — 音の再生（Web Audio）。合成済みの完成音源を AudioBuffer にして鳴らす。
// バス: bgm（曲）/ sfx（原作を基準にした効果音）/ voice（掛け声）/ amb（追加の環境音）/ guide（案内音声）。それぞれ音量とミュート。
// 音響モード: classic = モノラル・残響なし・音程の揺らぎなし・環境音なし。vr = 同じ音源を空間に置き、風・交通の層を高度で変える。
import { SONGS } from './music.js';
import { renderSong } from './psg.js';
import { SFX, renderSfx } from './sfx.js';
import { VOICES, synthVoice } from './voice.js';

const BUSES = ['bgm', 'sfx', 'voice', 'amb', 'guide'];
// 鳴らす優先度（同時発音の上限を超えたら低いものから止める）
const PRIORITY = { fall: 9, hit: 9, grace: 8, windowWarn: 7, buzz: 7, dropFall: 6, birdCall: 6, windowClose: 6, zap: 8, dropBreak: 5, grab: 4, reach: 2, flap: 1, creak: 2, motor: 1, floor: 1 };

export class AudioEngine {
  constructor() {
    this.ctx = null; this.buf = {}; this.mode = 'vr';
    this.vol = { master: 0.9, bgm: 0.7, sfx: 0.9, voice: 0.9, amb: 0.6, guide: 0.8 };
    this.mute = { master: false, bgm: false, sfx: false, voice: false, amb: false, guide: false };
    this.playing = []; this.lastAt = {}; this.song = null; this.songName = null;
    this.ambNodes = null; this.altitude = 0;
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  // 開始操作（クリック・タップ・ボタン）の中で呼ぶ。2 回目以降は resume だけ
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.bus = {};
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      // 音割れ防止の緩いリミッター
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -6; this.comp.knee.value = 6; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.12;
      this.comp.connect(this.master);
      for (const b of BUSES) { const g = this.ctx.createGain(); g.connect(this.comp); this.bus[b] = g; }
      this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.master.connect(this.analyser);
      this.renderAll();
      this.applyVolumes();
    }
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { /* 次の操作で再試行 */ } }
    return this.ready;
  }
  renderAll() {
    const sr = this.ctx.sampleRate;
    const mk = (pcm, srIn = sr) => { const b = this.ctx.createBuffer(1, pcm.length, srIn); b.copyToChannel(pcm, 0); return b; };
    for (const k of Object.keys(SFX)) this.buf['sfx:' + k] = mk(renderSfx(k, sr));
    for (const k of Object.keys(VOICES)) this.buf['voice:' + k] = mk(synthVoice(k, sr));
    this.mkBuf = mk;
  }
  songBuffer(name) {
    const key = 'song:' + name;
    if (!this.buf[key]) { const r = renderSong(SONGS[name], this.ctx.sampleRate); this.buf[key] = this.mkBuf(r.pcm); this.buf[key].loopSong = r.loop; }
    return this.buf[key];
  }
  setMode(m) { this.mode = m; this.applyVolumes(); if (this.ctx) this.updateAmbient(this.altitude); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.mute.master ? 0 : this.vol.master, t, 0.02);
    for (const b of BUSES) {
      let v = this.mute[b] ? 0 : this.vol[b];
      if (b === 'amb' && this.mode === 'classic') v = 0; // クラシック音響では追加環境音を鳴らさない
      this.bus[b].gain.setTargetAtTime(v, t, 0.03);
    }
  }
  setVolume(bus, v) { this.vol[bus] = v; this.applyVolumes(); }
  setMute(bus, m) { this.mute[bus] = m; this.applyVolumes(); }

  // 効果音・掛け声。opt.pos = {x,y,z}（VR 音響のときだけ空間に置く）、opt.warn = 予告音（距離で消えないよう直接音も足す）
  play(name, opt = {}) {
    if (!this.ready) return null;
    const isVoice = !!VOICES[name] && !SFX[name];
    const key = (isVoice ? 'voice:' : 'sfx:') + name;
    const buf = this.buf[key]; if (!buf) return null;
    const now = this.ctx.currentTime;
    // 同じ音の二重発音を防ぐ（40ms 以内の再発音は 1 回にまとめる）
    if (this.lastAt[key] != null && now - this.lastAt[key] < (opt.minGap ?? 0.04)) return null;
    this.lastAt[key] = now;
    // 同時発音の上限（12）。超えたら優先度の低いものを止める
    this.playing = this.playing.filter((p) => p.end > now);
    if (this.playing.length >= 12) {
      this.playing.sort((a, b) => a.pri - b.pri);
      const v = this.playing.shift(); try { v.src.stop(); } catch (e) { /* 済 */ }
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = opt.gain ?? 1;
    src.connect(g);
    const bus = this.bus[isVoice ? 'voice' : 'sfx'];
    if (this.mode === 'vr' && opt.pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = opt.warn ? 3 : 1.5; p.rolloffFactor = opt.warn ? 0.6 : 1; p.maxDistance = 60;
      setPos(p, opt.pos, now);
      g.connect(p); p.connect(bus);
      if (opt.warn) { const d = this.ctx.createGain(); d.gain.value = 0.35; g.connect(d); d.connect(bus); } // 遠くても聞こえる直接音
    } else g.connect(bus);
    src.start(now);
    const item = { src, end: now + buf.duration, pri: PRIORITY[name] ?? 3, name };
    this.playing.push(item);
    src.onended = () => { item.end = 0; };
    return item;
  }
  // 曲。同じ曲なら何もしない。切替は短いフェード
  music(name, { loop } = {}) {
    if (!this.ready) { this.pendingSong = name; return; }
    if (this.songName === name && this.song) return;
    this.stopMusic(0.08);
    const buf = this.songBuffer(name);
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = loop ?? buf.loopSong;
    const g = this.ctx.createGain(); g.gain.value = 1;
    src.connect(g); g.connect(this.bus.bgm);
    src.start(this.ctx.currentTime + 0.02);
    this.song = { src, g }; this.songName = name;
    src.onended = () => { if (this.song && this.song.src === src) { this.song = null; this.songName = null; } };
  }
  // 出来事を知らせる短い旋律（鳥の登場など）。曲は止めずに一瞬だけ下げる
  sting(name) {
    if (!this.ready) return;
    const buf = this.songBuffer(name), t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.bus.bgm); src.start(t);
    if (this.song) { const g = this.song.g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(0.3, t, 0.03); g.setTargetAtTime(1, t + buf.duration, 0.1); }
  }
  stopMusic(fade = 0.15) {
    if (!this.song) return;
    const { src, g } = this.song, t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, fade / 3); try { src.stop(t + fade + 0.05); } catch (e) { /* 済 */ }
    this.song = null; this.songName = null;
  }
  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else if (L.setPosition) { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }
  // 追加の環境音（VR 音響のみ）: 交通（低い所ほど大きい）・風（高い所ほど大きい）・雨（夜の棟）
  startAmbient(theme) {
    if (!this.ready) return;
    this.stopAmbient();
    const sr = this.ctx.sampleRate, len = sr * 4;
    const brown = new Float32Array(len), white = new Float32Array(len);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; white[i] = w; b = (b + 0.02 * w) / 1.02; brown[i] = b * 3.5; }
    // 継ぎ目を目立たなくする: 末尾 0.2 秒を先頭へ重ねる
    for (const a of [brown, white]) { const f = Math.floor(sr * 0.2); for (let i = 0; i < f; i++) { const t = i / f; a[i] = a[i] * t + a[len - f + i] * (1 - t); } }
    const mk = (pcm) => { const bb = this.ctx.createBuffer(1, pcm.length, sr); bb.copyToChannel(pcm, 0); return bb; };
    const loop = (buf, filterType, freq, q) => {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.bus.amb); s.start();
      return { s, f, g };
    };
    const n = { traffic: loop(mk(brown), 'lowpass', 380, 0.7), wind: loop(mk(white), 'bandpass', 520, 0.8) };
    if (theme === 'night') n.rain = loop(mk(white), 'highpass', 3500, 0.5);
    // 風のうなり: ゆっくりした LFO でフィルターを動かす
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = theme === 'tower' ? 0.17 : 0.09;
    const lg = this.ctx.createGain(); lg.gain.value = theme === 'tower' ? 260 : 140; lfo.connect(lg); lg.connect(n.wind.f.frequency); lfo.start();
    n.lfo = lfo; n.theme = theme;
    this.ambNodes = n;
    this.updateAmbient(this.altitude);
  }
  updateAmbient(alt) {
    this.altitude = alt;
    const n = this.ambNodes; if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const towerBoost = n.theme === 'tower' ? 1.5 : 1;
    n.traffic.g.gain.setTargetAtTime(Math.max(0, 0.55 * (1 - alt / 55)), t, 0.5);
    n.wind.g.gain.setTargetAtTime(Math.min(0.5, (0.06 + alt / 120) * towerBoost), t, 0.5);
    if (n.rain) n.rain.g.gain.setTargetAtTime(0.10, t, 0.5);
  }
  stopAmbient() {
    const n = this.ambNodes; if (!n) return;
    for (const k of ['traffic', 'wind', 'rain']) if (n[k]) { try { n[k].s.stop(); } catch (e) { /* 済 */ } n[k].g.disconnect(); }
    try { n.lfo.stop(); } catch (e) { /* 済 */ }
    this.ambNodes = null;
  }
  async suspend() { if (this.ctx && this.ctx.state === 'running') try { await this.ctx.suspend(); } catch (e) { /* 無視 */ } }
  async resume() { if (this.ctx && this.ctx.state !== 'running') try { await this.ctx.resume(); } catch (e) { /* 無視 */ } }

  // 案内音声（読み上げ）。既定はやさしい女性の声を優先。速度は設定で変えられる
  say(text, rate = 1.0) {
    if (this.mute.guide || this.mute.master || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = rate; u.volume = this.vol.guide * this.vol.master;
      const vs = speechSynthesis.getVoices().filter((v) => /ja/i.test(v.lang));
      const fem = vs.find((v) => /female|kyoko|nanami|haruka|ayumi|mizuki|女性/i.test(v.name)) || vs[0];
      if (fem) u.voice = fem;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* 読み上げが使えない環境 */ }
  }
}
function setPos(p, pos, t) {
  if (p.positionX) { p.positionX.setValueAtTime(pos.x, t); p.positionY.setValueAtTime(pos.y, t); p.positionZ.setValueAtTime(pos.z, t); }
  else p.setPosition(pos.x, pos.y, pos.z);
}
