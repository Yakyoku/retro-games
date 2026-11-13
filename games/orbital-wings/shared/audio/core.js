// ORBITAL WINGS — 音源の切り替え（「モダン」既定 ／「レトロ」= 従来の PSG・波形メモリ音源）
// AudioWorklet・ScriptProcessor・Node のどれからも同じ形で使う。ブラウザ API は使わない。
//   const core = new SoundCore(sampleRate);
//   core.setMode('retro'); core.playMusic('stage1', { lead: true }); core.sfx('shot', { pan: -0.2 }); core.renderStereo(L, R, 0, n);
// 切り替えると、鳴っていた曲は新しい音源で頭から鳴り直す。古い音源は 0.4 秒かけて消える（重ねて計算する）。
import { ModernSynth } from './modern.js';
import { ChipSynth } from './chip.js';
import { SFX } from './sfx.js';
import { RETRO_ALIAS } from './sfx2.js';

const TMP = 256;

export class SoundCore {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.modern = new ModernSynth(sampleRate);
    this.retro = new ChipSynth(sampleRate);
    this.mode = 'modern'; this.cur = this.modern; this.old = null; this.oldLeft = 0;
    this.tl = new Float32Array(TMP); this.tr = new Float32Array(TMP);
    this._music = null;
  }
  setMode(mode) {
    mode = mode === 'retro' ? 'retro' : 'modern';
    if (mode === this.mode) return;
    const prev = this.cur, next = mode === 'retro' ? this.retro : this.modern;
    const id = prev.isMusicPlaying() ? this._music : null;
    prev.stopMusic();
    this.old = prev; this.oldLeft = Math.round(0.4 * this.sampleRate);
    this.mode = mode; this.cur = next;
    next.setVolumes(prev.vol); next.setPaused(prev.paused);
    if (id) next.playMusic(id, { restart: true });
  }
  playMusic(id, opts = {}) {
    this._music = id;
    if (this.mode === 'retro') return this.retro.playMusic(id, { restart: !!opts.restart });
    return this.modern.playMusic(id, opts);
  }
  stopMusic(opts) { this._music = null; if (this.mode === 'retro') this.retro.stopMusic(); else this.modern.stopMusic(opts); }
  sfx(name, opts) {
    if (this.mode === 'retro') {
      const n = SFX[name] ? name : RETRO_ALIAS[name];
      return n ? this.retro.sfx(n) : -1;
    }
    return this.modern.sfx(name, opts);
  }
  setVolumes(v) { this.modern.setVolumes(v); this.retro.setVolumes(v); }
  setPaused(on) { this.cur.setPaused(on); }
  setIntensity(n) { this.modern.setIntensity(n); }
  setLayer(name, on) { this.modern.setLayer(name, on); }
  isMusicPlaying() { return this.cur.isMusicPlaying(); }
  musicPosition() { return this.cur.musicPosition(); }
  get eventCount() { return this.mode === 'retro' ? this.retro.events.length : this.modern.evCount; }
  drainEvents() { return this.cur.drainEvents(); }

  renderStereo(L, R, offset = 0, n = L.length - offset) {
    this.cur.renderStereo(L, R, offset, n);
    if (this.old) {
      // 切り替え直後: 古い音源の消え際を重ねる
      const tl = this.tl, tr = this.tr;
      let done = 0;
      while (done < n && this.oldLeft > 0) {
        const c = Math.min(TMP, n - done, this.oldLeft);
        this.old.renderStereo(tl, tr, 0, c);
        const g0 = this.oldLeft / (0.4 * this.sampleRate), g1 = (this.oldLeft - c) / (0.4 * this.sampleRate);
        for (let i = 0; i < c; i++) {
          const g = g0 + (g1 - g0) * i / c;
          let l = L[offset + done + i] + tl[i] * g; if (l > 0.98) l = 0.98; else if (l < -0.98) l = -0.98; L[offset + done + i] = l;
          if (R) { let r = R[offset + done + i] + tr[i] * g; if (r > 0.98) r = 0.98; else if (r < -0.98) r = -0.98; R[offset + done + i] = r; }
        }
        done += c; this.oldLeft -= c;
      }
      if (this.oldLeft <= 0) { this.old.drainEvents(); this.old = null; }
    }
  }
}
