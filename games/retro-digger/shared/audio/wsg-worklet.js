// AudioWorklet 側の入口。音源の中身は wsg-core.js（Node のテストと同じもの）。
import { WSGCore } from './wsg-core.js';

class RetroDiggerWSG extends AudioWorkletProcessor {
  constructor() {
    super();
    this.core = new WSGCore(sampleRate);
    this.core.emit = (m) => this.port.postMessage(m);
    this.port.onmessage = (e) => this.core.handle(e.data);
    this.spare = new Float32Array(128);
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const L = out[0];
    let R = out[1];
    if (!R) { if (this.spare.length < L.length) this.spare = new Float32Array(L.length); R = this.spare; }
    this.core.render(L, R, L.length);
    return true;
  }
}
registerProcessor('retro-digger-wsg', RetroDiggerWSG);
