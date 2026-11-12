// ORBITAL WINGS — AudioWorklet 側。音源（chip.js）をオーディオスレッドで回す。
// chip.js などは相対パスで import する（AudioWorklet のモジュール読み込みは Chrome / Safari 14.1+ / Quest Browser で可）。
// 読み込みに失敗したら audio.js がメインスレッドの ScriptProcessor に切り替える。
//
// 受け取るメッセージ:
//   {type:'music', id, restart}  {type:'stop'}  {type:'sfx', name}  {type:'vol', master, bgm, sfx}
//   {type:'pause', on}  {type:'arrange', on}  {type:'query', req}
// 送るメッセージ: {type:'ready'}  {type:'ended', id}  {type:'loop', id, n}  {type:'pos', req, ...musicPosition()}
import { ChipSynth } from './chip.js';

class OrbitalChipProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = new ChipSynth(sampleRate);
    this.port.onmessage = (e) => this.onMessage(e.data);
    this.port.postMessage({ type: 'ready', sampleRate });
  }
  onMessage(m) {
    const sy = this.synth;
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'music': sy.playMusic(m.id, { restart: !!m.restart }); break;
      case 'stop': sy.stopMusic(); break;
      case 'sfx': sy.sfx(m.name); break;
      case 'vol': sy.setVolumes(m); break;
      case 'pause': sy.setPaused(!!m.on); break;
      case 'arrange': sy.setArrange(!!m.on); break;
      case 'query': this.port.postMessage({ type: 'pos', req: m.req, ...sy.musicPosition(), playing: sy.isMusicPlaying() }); break;
      default: break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const L = out[0], R = out[1] || null;
    this.synth.renderStereo(L, R, 0, L.length);
    for (let c = 2; c < out.length; c++) out[c].set(L);
    if (this.synth.events.length) {
      for (const e of this.synth.drainEvents()) if (e.type === 'ended' || e.type === 'loop') this.port.postMessage({ type: e.type, id: e.id, n: e.n });
    }
    return true;
  }
}

registerProcessor('orbital-chip', OrbitalChipProcessor);
