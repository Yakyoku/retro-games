// Web Audio の再生部。開始操作（クリック・タップ・キー・VR 入場ボタン）で init() を呼ぶ。
// 曲と効果音は synth.js で事前に AudioBuffer へ描き出し、再生中は合成しない。
// 系統: マスター → { BGM, 効果音, 補助音 }。BGM には距離減衰・ドップラーをかけない（VR でも同じ）。
import { SONGS } from './songs.js';
import { renderSong, SFX_DEFS, carHumLoop, SR } from './synth.js';

export const DEFAULT_VOLUME = { master: 0.8, bgm: 0.7, sfx: 0.85, ui: 0.6, muteMaster: false, muteBgm: false, muteSfx: false, muteUi: false };

export class AudioEngine {
  constructor(volume = DEFAULT_VOLUME) {
    this.vol = { ...DEFAULT_VOLUME, ...volume };
    this.ctx = null; this.buffers = {}; this.bgm = null; this.jingle = null; this.hum = null; this.voices = {};
    this.ready = false; this.renderMs = 0; this.playLog = [];
  }

  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive', sampleRate: SR });
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    // 出力段のリミッター（同時発音が重なっても割れない）
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -6; this.limiter.knee.value = 4; this.limiter.ratio.value = 8; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.limiter.connect(this.master);
    this.busBgm = c.createGain(); this.busSfx = c.createGain(); this.busUi = c.createGain();
    for (const b of [this.busBgm, this.busSfx, this.busUi]) b.connect(this.limiter);
    this.applyVolume();
    // 最初の射撃から鳴るよう、効果音を先に用意してから曲を描く
    const t0 = performance.now();
    for (const [name, fn] of Object.entries(SFX_DEFS)) this.buffers['sfx:' + name] = this.toBuffer(fn());
    this.buffers['sfx:hum'] = this.toBuffer(carHumLoop().data);
    this.ready = true;
    await c.resume().catch(() => {});
    // 曲は 1 曲ずつ、間に休みを入れて描く（読み込み中の引っかかりを避ける）
    for (const [name, song] of Object.entries(SONGS)) {
      const r = renderSong(song);
      this.buffers['bgm:' + name] = this.toBuffer(r.data);
      this.buffers['bgm:' + name].loopInfo = r;
      await new Promise((res) => setTimeout(res, 0));
      if (this.pendingBgm === name) this.playBgm(name);
    }
    this.renderMs = performance.now() - t0;
    this.songsReady = true;
    if (this.pendingBgm) this.playBgm(this.pendingBgm);
  }

  toBuffer(data) {
    const b = this.ctx.createBuffer(1, data.length, SR);
    b.copyToChannel(data, 0);
    return b;
  }

  setVolume(v) { this.vol = { ...this.vol, ...v }; this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.vol;
    this.master.gain.setTargetAtTime(v.muteMaster ? 0 : v.master, t, 0.02);
    this.busBgm.gain.setTargetAtTime(v.muteBgm ? 0 : v.bgm, t, 0.02);
    this.busSfx.gain.setTargetAtTime(v.muteSfx ? 0 : v.sfx, t, 0.02);
    this.busUi.gain.setTargetAtTime(v.muteUi ? 0 : v.ui, t, 0.02);
  }

  // ---- BGM ----
  playBgm(name, { offset = 0 } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers['bgm:' + name];
    if (!buf) { this.pendingBgm = name; return; }
    this.pendingBgm = null;
    if (this.bgm && this.bgm.name === name && !this.bgm.paused) return;
    this.stopBgm(0.03);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const li = buf.loopInfo;
    if (li.loop) { src.loop = true; src.loopStart = li.loopStart; src.loopEnd = li.loopEnd; }
    const g = this.ctx.createGain(); g.gain.value = 1;
    src.connect(g).connect(this.busBgm);
    const when = this.ctx.currentTime + 0.01;
    src.start(when, offset % (li.loopEnd || buf.duration));
    this.bgm = { name, src, g, startedAt: when - offset, loopLen: li.loopEnd, paused: false };
    this.log('bgm:' + name);
  }
  stopBgm(fade = 0.05) {
    if (!this.bgm) return;
    const { src, g } = this.bgm;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
    try { src.stop(t + fade + 0.01); } catch { /* 停止済み */ }
    this.bgm = null;
  }
  bgmPosition() { return this.bgm ? (this.ctx.currentTime - this.bgm.startedAt) : 0; }
  pauseBgm() { // 一時停止: 位置を覚えて止める（再開で同じ位置から。二重再生しない）
    if (!this.bgm || this.bgm.paused) return;
    const name = this.bgm.name; const pos = this.bgmPosition();
    this.stopBgm(0.03);
    this.paused = { name, pos };
  }
  resumeBgm() { if (this.paused) { const { name, pos } = this.paused; this.paused = null; this.playBgm(name, { offset: pos }); } }
  clearPaused() { this.paused = null; }

  // ジングル（BGM を止めてから鳴らす／BGM の上に重ねて BGM を下げる）
  playJingle(name, { stopBgm = true, duck = false } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers['bgm:' + name];
    if (!buf) return;
    if (stopBgm) this.stopBgm(0.02);
    if (this.jingle) { try { this.jingle.stop(); } catch { /* */ } }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.busBgm);
    const t = this.ctx.currentTime;
    src.start(t + 0.01);
    this.jingle = src;
    if (duck && this.bgm) {
      const g = this.bgm.g.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.25, t + 0.04);
      g.setValueAtTime(0.25, t + buf.duration - 0.3); g.linearRampToValueAtTime(1, t + buf.duration);
    }
    this.log('jingle:' + name);
    return buf.duration;
  }
  stopJingle() { if (this.jingle) { try { this.jingle.stop(); } catch { /* */ } this.jingle = null; } }

  // ---- 効果音 ----
  // 同じ音は同時に max 本まで。超えたら一番古いものを止める（割込み）
  sfx(name, { gain = 1, pan = 0, max = 3, ui = false } = {}) {
    if (!this.ctx || !this.ready) return;
    const buf = this.buffers['sfx:' + name];
    if (!buf) return;
    const list = (this.voices[name] ||= []);
    while (list.length >= max) { const old = list.shift(); try { old.stop(); } catch { /* */ } }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    let node = src;
    if (gain !== 1) { const g = this.ctx.createGain(); g.gain.value = gain; node.connect(g); node = g; }
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
    node.connect(ui ? this.busUi : this.busSfx);
    src.start();
    list.push(src);
    src.onended = () => { const i = list.indexOf(src); if (i >= 0) list.splice(i, 1); };
    this.log('sfx:' + name);
  }
  ui(name) { this.sfx(name, { ui: true, max: 2 }); }

  // かごの走行音（ループ）
  setHum(on) {
    if (!this.ctx || !this.ready) return;
    if (on && !this.hum) {
      const src = this.ctx.createBufferSource(); src.buffer = this.buffers['sfx:hum']; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.busSfx);
      src.start(); g.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.04);
      this.hum = { src, g };
    } else if (!on && this.hum) {
      const { src, g } = this.hum; const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.03); try { src.stop(t + 0.2); } catch { /* */ }
      this.hum = null;
    }
  }
  stopAll() { this.stopBgm(0.03); this.stopJingle(); this.setHum(false); for (const l of Object.values(this.voices)) for (const s of l) { try { s.stop(); } catch { /* */ } } this.voices = {}; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  log(s) { this.playLog.push([this.ctx ? +this.ctx.currentTime.toFixed(3) : 0, s]); if (this.playLog.length > 200) this.playLog.shift(); }
}

// ゲームの出来事 → 音（2D 版・VR 版共通の対応表。AUDIO_REFERENCE.md の表と同じ）
export function playGameEvents(audio, game, events, { panOf = () => 0 } = {}) {
  let humWanted = game.cars.some((c) => c.state === 'moving' && Math.abs(c.y - game.player.y) < 3.2 * 3);
  for (const ev of events) {
    const pan = ev.x != null ? panOf(ev.x, ev.y) : 0;
    switch (ev.type) {
      case 'shot': audio.sfx('shot', { pan, max: 3 }); break;
      case 'eshot': audio.sfx('eshot', { pan, max: 3 }); break;
      case 'windup': audio.sfx('windup', { pan, gain: 0.9, max: 2 }); break;
      case 'kill': audio.sfx(ev.cause === 'kick' ? 'kick' : ev.cause === 'env' && game.cars.some((c) => c.dy > 0) ? 'crush' : 'kill', { pan }); if (ev.cause === 'kick') audio.sfx('kill', { pan, gain: 0.6 }); break;
      case 'kickSwing': audio.sfx('kickSwing'); break;
      case 'jump': audio.sfx('jump', { max: 1 }); break;
      case 'land': if (ev.drop > 0.5) audio.sfx('land', { max: 1 }); break;
      case 'lightHit': audio.sfx('lightHit', { pan }); break;
      case 'lightCrash': audio.sfx('lightCrash', { pan }); break;
      case 'carStart': audio.sfx('carStart', { max: 1 }); break;
      case 'carStop': if (Math.abs(game.cars[ev.car].y - game.player.y) < 7) audio.sfx('carStop', { max: 1 }); break;
      case 'carPass': if (game.player.support && game.player.support.car === game.cars[ev.car]) audio.sfx('carPass', { max: 1 }); break;
      case 'carWarn': if (Math.abs(game.cars[ev.car].y - game.player.y) < 7) audio.sfx('carWarn', { max: 1 }); break;
      case 'carLimit': audio.sfx('carLimit', { max: 1 }); break;
      case 'call': audio.sfx('call', { max: 1 }); break;
      case 'doorWarn': audio.sfx('doorWarn', { max: 2 }); break;
      case 'spawn': audio.sfx('doorOpen', { max: 2 }); break;
      case 'doorEnter': audio.sfx('doorEnter', { max: 1 }); break;
      case 'doc': audio.playJingle('doc', { stopBgm: false, duck: true }); break;
      case 'bulletCover': audio.sfx('bulletCover', { pan, max: 2 }); break;
      case 'needDocs': audio.sfx('needDocs', { max: 1 }); break;
      case 'dodge': audio.sfx('dodge', { max: 1 }); break;
      case 'miss': audio.setHum(false); audio.playJingle(ev.cause === 'crush' ? 'miss' : 'miss'); if (ev.cause === 'crush') audio.sfx('crush'); break;
      case 'respawn': audio.playBgm('stage'); break;
      case 'clear': audio.setHum(false); audio.playJingle('clear'); break;
      case 'gameover': audio.setHum(false); audio.playJingle('gameover'); break;
      default: break;
    }
  }
  if (game.phase !== 'play') humWanted = false;
  audio.setHum(humWanted);
}
