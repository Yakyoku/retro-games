// VOIDBLOOM — AudioWorklet（音声スレッドで FM 音源と曲の再生器を回す。テンポのずれが出ない）
import { FMSynth } from './fm-core.js';

class VoidbloomFM extends AudioWorkletProcessor {
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
      case 'fade': sy.fadeOut(m.sec || 1.5); break;
      case 'sfx': sy.playSfx(this.sfx[m.id]); break;
      case 'patch': sy.patches[m.index] = m.patch; break;
      case 'note': if (m.on) { sy.fm[m.ch].owner = 'test'; sy.programChannel(sy.fm[m.ch], sy.patches[m.patch]); sy.fm[m.ch].vol = 0.8; sy.fm[m.ch].panL = sy.fm[m.ch].panR = 1; sy.keyOn(m.ch, m.note); } else { sy.keyOff(m.ch); sy.fm[m.ch].owner = 'music'; } break;
      case 'vol': if (m.music != null) sy.musicVol = m.music; if (m.sfx != null) sy.sfxVol = m.sfx; break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    this.sy.render(L, R, L.length);
    if ((++this.frame & 15) === 0) {
      const q = this.sy.seq;
      this.port.postMessage({ type: 'meter', meter: Array.from(this.sy.meter), song: q ? q.song.id : null, tick: q ? q.tick : 0 });
    }
    return true;
  }
}
registerProcessor('voidbloom-fm', VoidbloomFM);
