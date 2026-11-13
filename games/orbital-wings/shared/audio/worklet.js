// ORBITAL WINGS — AudioWorklet 側。音源（core.js = モダン音源＋レトロ音源）をオーディオスレッドで回す。
// 相対パスで import する（AudioWorklet のモジュール読み込みは Chrome / Safari 14.1+ / Quest Browser で可）。
// 読み込みに失敗したら audio.js がメインスレッドの ScriptProcessor に切り替える。
//
// 受け取るメッセージ:
//   {type:'music', id, restart, lead, fade, mode}  {type:'stop', fade, tape}  {type:'sfx', name, pan, step, pitch, gain}
//   {type:'vol', master, bgm, sfx}  {type:'pause', on}  {type:'engine', mode}  {type:'intensity', n}  {type:'layer', name, on}  {type:'query', req}
// 送るメッセージ: {type:'ready'}  {type:'ended', id}  {type:'loop', id, n}  {type:'pos', req, ...musicPosition()}  {type:'load', v}
import { SoundCore } from './core.js';

class OrbitalProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.core = new SoundCore(sampleRate);
    this.opt = { pan: 0, step: undefined, pitch: undefined, gain: undefined };
    this.acc = 0; this.frames = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
    this.port.postMessage({ type: 'ready', sampleRate });
  }
  onMessage(m) {
    const c = this.core;
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'music': c.playMusic(m.id, m); break;
      case 'stop': c.stopMusic(m); break;
      case 'sfx': c.sfx(m.name, m); break;
      case 'vol': c.setVolumes(m); break;
      case 'pause': c.setPaused(!!m.on); break;
      case 'engine': c.setMode(m.mode); break;
      case 'intensity': c.setIntensity(m.n); break;
      case 'layer': c.setLayer(m.name, m.on); break;
      case 'query': this.port.postMessage({ type: 'pos', req: m.req, ...c.musicPosition(), playing: c.isMusicPlaying(), engine: c.mode }); break;
      default: break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const L = out[0], R = out[1] || null;
    const t0 = Date.now();
    this.core.renderStereo(L, R, 0, L.length);
    this.acc += Date.now() - t0; this.frames += L.length;
    for (let c = 2; c < out.length; c++) out[c].set(L);
    if (this.core.eventCount) {
      for (const e of this.core.drainEvents()) if (e.type === 'ended' || e.type === 'loop') this.port.postMessage({ type: e.type, id: e.id, n: e.n });
    }
    if (this.frames >= sampleRate * 2) { this.port.postMessage({ type: 'load', v: this.acc / (this.frames / sampleRate * 1000) }); this.acc = 0; this.frames = 0; }
    return true;
  }
}

registerProcessor('orbital-synth', OrbitalProcessor);
