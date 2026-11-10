// VOIDBLOOM — 音の窓口（メインスレッド側）。AudioWorklet が使えなければ ScriptProcessor で同じ音源を回す。
import { FMSynth } from './fm-core.js';
import { PATCHES } from './patches.js';
import { makeSamples } from './pcm.js';
import { getSongs } from './songs.js';
import { SFX } from './sfx.js';

export class GameAudio {
  constructor() { this.ctx = null; this.ready = false; this.node = null; this.local = null; this.meter = []; this.current = null; this.vol = { master: 0.8, music: 0.8, sfx: 0.9 }; this.onMeter = null; }

  // ユーザー操作（クリック・キー・ボタン）の中で呼ぶこと
  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return this; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return this;
    this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
    this.out = this.ctx.createGain(); this.out.gain.value = this.vol.master; this.out.connect(this.ctx.destination);
    const songs = getSongs(), samples = makeSamples();
    try {
      if (!this.ctx.audioWorklet) throw new Error('AudioWorklet なし');
      await this.ctx.audioWorklet.addModule(new URL('./fm-worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'voidbloom-fm', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.port.postMessage({ type: 'init', patches: PATCHES, samples, songs, sfx: SFX });
      this.node.port.onmessage = (e) => { if (e.data.type === 'meter') { this.meter = e.data.meter; this.onMeter && this.onMeter(e.data); } };
      this.node.connect(this.out);
      this.mode = 'worklet';
    } catch (err) {
      // 予備: メインスレッドで回す
      const sy = new FMSynth(this.ctx.sampleRate); sy.setPatches(PATCHES); sy.setSamples(samples);
      this.local = { sy, songs };
      const sp = this.ctx.createScriptProcessor(1024, 0, 2);
      sp.onaudioprocess = (e) => { const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1); sy.render(L, R, L.length); this.meter = Array.from(sy.meter); };
      sp.connect(this.out); this.node = sp; this.mode = 'script';
      console.warn('[audio] AudioWorklet が使えないので ScriptProcessor で再生します:', err && err.message);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    this.ready = true;
    this.setVolume(this.vol);
    if (this.pendingSong !== undefined) { this.music(this.pendingSong); this.pendingSong = undefined; }
    return this;
  }
  post(m) {
    if (!this.ready) return;
    if (this.mode === 'worklet') this.node.port.postMessage(m);
    else {
      const sy = this.local.sy;
      if (m.type === 'song') sy.playSong(m.id ? this.local.songs[m.id] : null, { fadeIn: m.fadeIn });
      else if (m.type === 'fade') sy.fadeOut(m.sec);
      else if (m.type === 'sfx') sy.playSfx(SFX[m.id]);
      else if (m.type === 'vol') { if (m.music != null) sy.musicVol = m.music; if (m.sfx != null) sy.sfxVol = m.sfx; }
      else if (m.type === 'note') { if (m.on) { sy.fm[m.ch].owner = 'test'; sy.programChannel(sy.fm[m.ch], sy.patches[m.patch]); sy.fm[m.ch].vol = 0.8; sy.keyOn(m.ch, m.note); } else { sy.keyOff(m.ch); sy.fm[m.ch].owner = 'music'; } }
      else if (m.type === 'patch') sy.patches[m.index] = m.patch;
    }
  }
  music(id, opts = {}) {
    if (!this.ready) { this.pendingSong = id; return; }
    if (id === this.current && !opts.restart) return;
    this.current = id;
    this.post({ type: 'song', id, fadeIn: opts.fadeIn });
  }
  fade(sec = 1.5) { this.current = null; this.post({ type: 'fade', sec }); }
  sfx(id) { if (SFX[id]) this.post({ type: 'sfx', id }); }
  setVolume(v) {
    Object.assign(this.vol, v);
    if (this.out) this.out.gain.setTargetAtTime(this.vol.master, this.ctx.currentTime, 0.02);
    this.post({ type: 'vol', music: this.vol.music, sfx: this.vol.sfx });
  }
  // ゲームのイベント列から音を鳴らす
  handle(events) {
    let n = 0;
    for (const ev of events) {
      if (ev.t === 'sfx') { if (n++ < 10) this.sfx(ev.id === 'burst' ? 'burst' : ev.id); if (ev.id === 'death') this.sfx('deathFm'); }
      else if (ev.t === 'music') { if (ev.id) this.music(ev.id, { restart: ev.restart }); else this.fade(1.2); }
    }
  }
}
