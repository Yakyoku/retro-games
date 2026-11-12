// ツイン・ガーデン — 音（WebAudio の自作チップ音源。パルス 12.5/25/50%・三角波・ノイズ）
// 録音素材・外部 URL は使わない（すべてその場で合成）。AudioWorklet・AudioMixer 相当は使わず、標準ノードだけで組む（Safari・Quest Browser 対応）。
// 曲は「先読みスケジューラ」で AudioContext の時計に予約する。描画フレームとは独立なので、テンポ・音程はフレームレートで変わらない。
import { SONGS, parseMML } from './songs.js';

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, bgm: 0.7, sfx: 0.85, mute: false };
    this.song = null;
    this.parsed = {};
    this.sfxVoices = [];
    this.paused = false;
    this.lastSfx = {};
  }

  get ready() { return !!this.ctx; }

  /** 開始ボタンなど、ユーザーの操作の中で呼ぶ（iOS Safari・Quest は操作なしでは鳴らない） */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.bgmBus = c.createGain();
      this.sfxBus = c.createGain();
      this.bgmBus.connect(this.master); this.sfxBus.connect(this.master);
      this.master.connect(c.destination);
      this.waves = {};
      for (const [k, duty] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]]) this.waves[k] = pulseWave(c, duty);
      const n = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      const d = n.getChannelData(0);
      let s = 0x1234;
      for (let i = 0; i < d.length; i++) { s ^= s << 7; s ^= s >> 9; s ^= s << 8; s &= 0xffff; d[i] = (s / 32768) - 1; }
      this.noise = n;
      this.applyVolume();
      this.timer = setInterval(() => this.schedule(), 25);
      // 無音を 1 回鳴らして、iOS の音声を確実に開ける
      const b = c.createBuffer(1, 1, 22050), src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0);
    }
    if (this.ctx.state !== 'running' && !this.paused) this.ctx.resume().catch(() => {});
    return true;
  }

  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.mute ? 0 : this.vol.master, t, 0.02);
    this.bgmBus.gain.setTargetAtTime(this.vol.bgm, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
  }

  /** 一時停止・タブ非表示・VR の追跡喪失: 時計ごと止める（再開すると同じ位置から続く） */
  pause() { this.paused = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { this.paused = false; if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  // ───────── 曲 ─────────
  prep(name) {
    if (!this.parsed[name]) {
      const s = SONGS[name];
      const tracks = s.tracks.map((tr) => ({ ...tr, ...parseMML(tr.mml, tr.wave === 'drum') }));
      this.parsed[name] = { ...s, tracks, length: Math.max(...tracks.map((t) => t.length)) };
    }
    return this.parsed[name];
  }

  /** 同じ曲が鳴っていれば何もしない（二重再生しない）。restart=true で頭から */
  playSong(name, restart = false, fromBeat = 0) {
    if (!this.ctx || !SONGS[name]) return;
    if (this.song && this.song.name === name && !restart) return;
    this.stopSong();
    const p = this.prep(name);
    const spb = 60 / p.bpm;
    fromBeat = p.loop ? ((fromBeat % p.length) + p.length) % p.length : 0;
    const idx = p.tracks.map((tr) => { const i = tr.notes.findIndex((n) => n.t >= fromBeat - 1e-9); return i < 0 ? tr.notes.length : i; });
    this.song = { name, p, spb, t0: this.ctx.currentTime + 0.06 - fromBeat * spb, idx, loopN: 0, nodes: [] };
    this.schedule();
  }

  /** いま鳴っている曲と位置（拍）。一時停止から同じ位置で再開するのに使う */
  songPos() {
    const s = this.song;
    if (!s || !this.ctx) return null;
    return { name: s.name, beat: Math.max(0, (this.ctx.currentTime - s.t0) / s.spb) };
  }

  stopSong() {
    if (!this.song) return;
    const t = this.ctx.currentTime;
    for (const n of this.song.nodes) { try { n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(0, t, 0.01); n.o.stop(t + 0.05); } catch (e) { /* 終わっている */ } }
    this.song = null;
  }

  schedule() {
    const s = this.song;
    if (!s || !this.ctx || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.18;
    const { p, spb } = s;
    for (let k = 0; k < p.tracks.length; k++) {
      const tr = p.tracks[k];
      for (let guard = 0; guard < 64; guard++) {
        if (s.idx[k] >= tr.notes.length) {
          if (!p.loop) break;
          // 全トラックがループ末尾に着いたら次の周回へ
          if (s.idx.every((v, j) => v >= p.tracks[j].notes.length)) { s.loopN++; s.idx = p.tracks.map(() => 0); continue; }
          break;
        }
        const n = tr.notes[s.idx[k]];
        const at = s.t0 + (s.loopN * p.length + n.t) * spb;
        if (at > ahead) break;
        s.idx[k]++;
        if (at < this.ctx.currentTime - 0.05) continue; // 復帰直後など、過ぎた音は鳴らさない
        if (tr.wave === 'drum') this.drum(n.drum, at, tr.vol, this.bgmBus);
        else this.tone(tr.wave, midiHz(n.midi), at, n.d * spb, tr.vol, this.bgmBus, s.nodes);
      }
    }
    if (!p.loop && s.idx.every((v, j) => v >= p.tracks[j].notes.length) && this.ctx.currentTime > s.t0 + p.length * spb + 0.3) this.song = null;
    if (s.nodes.length > 64) s.nodes.splice(0, s.nodes.length - 64);
  }

  tone(wave, hz, at, dur, vol, bus, keep, env = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    if (wave === 'tri') o.type = 'triangle'; else if (wave === 'sine') o.type = 'sine'; else o.setPeriodicWave(this.waves[wave] || this.waves.p50);
    o.frequency.setValueAtTime(hz, at);
    if (env.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, hz * env.slide), at + dur);
    const g = c.createGain();
    const a = env.a ?? 0.004, rel = env.r ?? 0.03, sus = env.s ?? 0.7;
    const end = at + Math.max(0.02, dur * (env.gate ?? 0.9));
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + a);
    g.gain.setTargetAtTime(vol * sus, at + a, env.dcy ?? 0.08);
    g.gain.setValueAtTime(vol * sus, end);
    g.gain.linearRampToValueAtTime(0, end + rel);
    o.connect(g).connect(bus);
    o.start(at); o.stop(end + rel + 0.02);
    if (keep) keep.push({ o, g });
    return { o, g };
  }

  drum(kind, at, vol, bus) {
    const c = this.ctx;
    if (kind === 'k') {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.11);
      const g = c.createGain(); g.gain.setValueAtTime(vol * 1.6, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      o.connect(g).connect(bus); o.start(at); o.stop(at + 0.16);
      return;
    }
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    if (kind === 's') { f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; g.gain.setValueAtTime(vol * 1.1, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.13); }
    else { f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(vol * 0.45, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.035); }
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5); src.stop(at + 0.15);
  }

  noiseHit(at, dur, vol, type, freq, bus = this.sfxBus) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, at);
    const g = c.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(bus); src.start(at); src.stop(at + dur + 0.02);
  }

  // ───────── 効果音（確定したゲームイベントから 1 回だけ呼ぶ） ─────────
  sfx(name, arg = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime + 0.005, B = this.sfxBus;
    // 同じ効果音の連打は 40ms 以内なら 1 回に（同時発音の上限の代わり）
    const now = performance.now();
    if (now - (this.lastSfx[name] || 0) < 40) return;
    this.lastSfx[name] = now;
    const T = (w, hz, at, d, v, env) => this.tone(w, hz, at, d, v, B, null, env);
    switch (name) {
      case 'move': T('p50', 880, t, 0.03, 0.08, { gate: 1 }); break;
      case 'ok': T('p25', 988, t, 0.05, 0.12); T('p25', 1319, t + 0.05, 0.08, 0.12); break;
      case 'back': T('p25', 659, t, 0.05, 0.1); T('p25', 494, t + 0.05, 0.07, 0.1); break;
      case 'wrap': T('p12', 1568, t, 0.035, 0.09, { gate: 1, slide: 1.12 }); break;
      case 'unwrap': T('p12', 1175, t, 0.035, 0.07, { gate: 1, slide: 0.88 }); break;
      case 'capture': {
        // 閉じた瞬間の「パチン」＋ 捕まえた数だけ上がる音階
        this.noiseHit(t, 0.09, 0.32, 'bandpass', 3200);
        T('p50', 220, t, 0.06, 0.16, { slide: 3.5, gate: 1 });
        const n = Math.min(8, Math.max(1, arg));
        const sc = [0, 4, 7, 12, 16, 19, 24, 28];
        for (let i = 0; i < n; i++) T('p25', midiHz(76 + sc[i]), t + 0.06 + i * 0.045, 0.06, 0.12);
        break;
      }
      case 'empty': this.noiseHit(t, 0.06, 0.18, 'bandpass', 2400); T('p50', 330, t, 0.05, 0.08, { slide: 1.5 }); break;
      case 'plant': for (let i = 0; i < 4; i++) T('tri', midiHz(84 + [0, 3, 7, 12][i]), t + i * 0.05, 0.08, 0.22); break;
      case 'grow': T('tri', midiHz(91), t, 0.05, 0.12); break;
      case 'power': for (let i = 0; i < 6; i++) T('p25', midiHz(72 + [0, 4, 7, 12, 16, 19][i]), t + i * 0.06, 0.09, 0.14); break;
      case 'powerEnd': for (let i = 0; i < 3; i++) T('p25', midiHz(84 - i * 5), t + i * 0.07, 0.08, 0.12); break;
      case 'hint': T('p12', midiHz(79), t, 0.09, 0.12); T('p12', midiHz(86), t + 0.12, 0.14, 0.12); break;
      case 'chest': for (let i = 0; i < 5; i++) T('p25', midiHz(79 + [0, 5, 9, 12, 17][i]), t + i * 0.07, 0.12, 0.14); this.noiseHit(t, 0.3, 0.12, 'highpass', 6000); break;
      case 'gem': T('p12', midiHz(84 + arg * 2), t, 0.06, 0.13); T('tri', midiHz(96 + arg * 2), t + 0.05, 0.1, 0.18); break;
      case 'hit': this.noiseHit(t, 0.25, 0.4, 'lowpass', 1400); T('p50', 600, t, 0.3, 0.18, { slide: 0.2, gate: 1 }); break;
      case 'bonusHit': for (let i = 0; i < 4; i++) T('p25', midiHz(84 + [0, 7, 12, 19][i]), t + i * 0.05, 0.08, 0.14); break;
      case 'tick': T('p50', 1760, t, 0.02, 0.06, { gate: 1 }); break;
      case 'warn': T('p25', 880, t, 0.08, 0.1); break;
      default: break;
    }
  }
}

function pulseWave(c, duty) {
  const N = 64, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  // 位相を揃えるため cos 成分を使う（矩形のデューティ比）
  for (let n = 1; n < N; n++) { re[n] = im[n]; im[n] = 0; }
  return c.createPeriodicWave(re, im, { disableNormalization: false });
}

/** ゲームイベント → 効果音・曲（AUDIO_REFERENCE.md の対応表と同じ） */
export function playEvents(audio, game, events) {
  for (const e of events) {
    switch (e.type) {
      case 'wrap': audio.sfx('wrap'); break;
      case 'unwrap': audio.sfx('unwrap'); break;
      case 'capture': audio.sfx(e.items.length ? 'capture' : 'empty', e.n || e.items.length); break;
      case 'plant': audio.sfx('plant'); break;
      case 'power': audio.sfx('power'); audio.playSong('power', true); break;
      case 'powerEnd': audio.sfx('powerEnd'); audio.playSong(game.def.theme, true); break;
      case 'hint': audio.sfx('hint'); break;
      case 'chest': audio.sfx('chest'); break;
      case 'gem': audio.sfx('gem', e.count); break;
      case 'bonusHit': audio.sfx('bonusHit'); break;
      case 'miss': audio.sfx('hit'); audio.stopSong(); setTimeout(() => audio.playSong('miss', true), 260); break;
      case 'clear': audio.playSong('clear', true); break;
      case 'stage': audio.playSong('start', true); break;
      case 'go': audio.playSong(game.kind === 'bonus' ? 'bonus' : game.def.theme, true); break;
      case 'bonusStart': audio.playSong('start', true); break;
      case 'bonusEnd': audio.playSong('bonusEnd', true); break;
      case 'gameover': audio.playSong('gameover', true); break;
      case 'complete': audio.playSong('ending', true); break;
      default: break;
    }
  }
}
