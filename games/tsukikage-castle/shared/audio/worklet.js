// 月影の魔城 — AudioWorklet（音声スレッドで音源と曲の再生器を回す。メインスレッドが重くてもテンポがずれない）
import { FMSynth } from './synth.js';

class CastleSynth extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sy = new FMSynth(sampleRate);
    this.songs = {}; this.sfx = {}; this.frame = 0;
    this.port.onmessage = (e) => this.onMsg(e.data);
  }
  onMsg(m) {
    const sy = this.sy;
    switch (m.type) {
      case 'init': sy.setPatches(m.patches); sy.setSamples(m.samples); this.songs = m.songs; this.sfx = m.sfx; break;
      case 'song': sy.playSong(m.id ? this.songs[m.id] : null, { fadeIn: m.fadeIn }); break;
      case 'fade': sy.fadeOut(m.sec || 1.0); break;
      case 'sfx': sy.playSfx(this.sfx[m.id], undefined, m.tr || 0); break;
      case 'vol': if (m.music != null) sy.musicVol = m.music; if (m.sfx != null) sy.sfxVol = m.sfx; break;
      case 'stopAll': sy.playSong(null); sy.sfx.length = 0; for (let c = 0; c < sy.fm.length; c++) sy.keyOff(c); for (let c = 0; c < sy.psg.length; c++) sy.psgOff(c); break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    this.sy.render(L, R, L.length);
    if ((++this.frame & 31) === 0) {
      const q = this.sy.seq;
      this.port.postMessage({ type: 'meter', song: q ? q.song.id : null, tick: q ? q.tick : 0, peak: Math.max(...this.sy.meter) });
    }
    return true;
  }
}
registerProcessor('tsukikage-synth', CastleSynth);
