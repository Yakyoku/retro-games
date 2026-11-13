// Web Audio の再生部（v2）。開始操作（クリック・タップ・キー・VR 入場ボタン）で init() を呼ぶ。
// 曲: shared/audio/files/*.mp3（tools/render-audio.js で事前に作った物）。ループは manifest の loopStart/loopEnd。
//     ステージ曲は「基本の層」と「緊張の層」の 2 本を同時に鳴らし、敵に見つかっている間だけ緊張の層を上げる。
// 効果音: sfx2.js で開始時に描く（短いので速い）。残響（畳み込み）へのセンド、左右の定位、別の階の音はこもらせる。
// 環境音: ステージごとのループ（空調・遠くの車・機械の電子音・雨と遠雷）。
// 系統: マスター → リミッター → { BGM, 効果音（＋残響・環境音）, 補助音 }。BGM には距離減衰・ドップラーをかけない。
import { SFX2, carHum2, ambience } from './sfx2.js';
import { SR } from './synth2.js';

export const DEFAULT_VOLUME = { master: 0.8, bgm: 0.7, sfx: 0.85, ui: 0.6, muteMaster: false, muteBgm: false, muteSfx: false, muteUi: false };
const FIRST_SFX = ['shot', 'eshot', 'hit', 'windup', 'step0', 'step1', 'step2', 'step3', 'uiMove', 'uiOk', 'jump', 'land'];

export class AudioEngine {
  constructor(volume = DEFAULT_VOLUME, base = null) {
    this.vol = { ...DEFAULT_VOLUME, ...volume };
    this.base = base || new URL('./files/', import.meta.url).href;
    this.ctx = null; this.buffers = {}; this.music = {}; this.bgm = null; this.jingle = null; this.hum = null; this.voices = {};
    this.ready = false; this.renderMs = 0; this.playLog = []; this.stageSong = 'stage1'; this.intensity = 0; this.amb = null; this.manifest = null;
  }

  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive', sampleRate: SR });
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.limiter = c.createDynamicsCompressor();
    Object.assign(this.limiter, {}); this.limiter.threshold.value = -4; this.limiter.knee.value = 3; this.limiter.ratio.value = 10; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.15;
    this.limiter.connect(this.master);
    this.busBgm = c.createGain(); this.busSfx = c.createGain(); this.busUi = c.createGain();
    for (const b of [this.busBgm, this.busSfx, this.busUi]) b.connect(this.limiter);
    // 効果音の残響（生成した室内の響き）
    this.verb = c.createConvolver(); this.verb.buffer = this.makeIR(1.5); this.verbGain = c.createGain(); this.verbGain.gain.value = 0.2;
    this.verb.connect(this.verbGain).connect(this.busSfx);
    this.applyVolume();
    const t0 = performance.now();
    for (const n of FIRST_SFX) this.buffers['sfx:' + n] = this.toBuffer(SFX2[n]());
    this.ready = true;
    c.resume().catch(() => {});
    // 残りは裏で続ける（呼び出し側を待たせない。VR の入場はボタンを押した直後でないと許可されないため）
    this.bg = this.initRest(t0);
  }
  async initRest(t0) {
    const music = this.loadMusic(); // 曲の取得・デコードは並行して始める
    const rest = Object.keys(SFX2).filter((n) => !FIRST_SFX.includes(n));
    for (const n of rest) { this.buffers['sfx:' + n] = this.toBuffer(SFX2[n]()); await idle(); }
    this.buffers['sfx:hum'] = this.toBuffer(carHum2());
    for (const k of ['office', 'lab', 'rain']) { this.buffers['amb:' + k] = this.toBuffer(ambience(k)); await idle(); }
    this.renderMs = performance.now() - t0;
    if (this.pendingAmb) this.setAmbience(this.pendingAmb);
    await music;
  }

  async loadMusic() {
    try { this.manifest = await (await fetch(this.base + 'manifest.json')).json(); } catch (e) { this.loadError = String(e); return; }
    const order = ['title', 'start', this.stageSong, 'doc', 'miss', 'clear', 'stage1', 'stage2', 'stage3', 'gameover', 'allclear'];
    const seen = new Set();
    for (const name of order) {
      if (seen.has(name) || !this.manifest[name]) continue; seen.add(name);
      await this.loadSong(name);
      if (this.pendingBgm === name) this.playBgm(name);
    }
    this.songsReady = true;
    if (this.pendingBgm) this.playBgm(this.pendingBgm);
  }
  async loadSong(name) {
    if (this.music[name]) return this.music[name];
    const m = this.manifest[name];
    const get = async (f) => { const r = await fetch(this.base + f); if (!r.ok) throw new Error(f + ' ' + r.status); return await this.ctx.decodeAudioData(await r.arrayBuffer()); };
    try {
      const main = await get(m.file);
      const hot = m.hot ? await get(m.hot) : null;
      this.music[name] = { ...m, main, hot };
    } catch (e) { this.loadError = String(e); }
    return this.music[name];
  }

  makeIR(sec) {
    const n = Math.floor(sec * SR); const b = this.ctx.createBuffer(2, n, SR);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let s = 0; for (let k = 0; k < n; k++) { const t = k / SR; s = s * 0.6 + (Math.random() * 2 - 1) * 0.4; d[k] = s * Math.exp(-t / (sec * 0.28)) * (k < 200 ? k / 200 : 1); } }
    return b;
  }
  toBuffer([L, R]) { const b = this.ctx.createBuffer(2, L.length, SR); b.copyToChannel(L, 0); b.copyToChannel(R, 1); return b; }

  setVolume(v) { this.vol = { ...this.vol, ...v }; this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime; const v = this.vol;
    this.master.gain.setTargetAtTime(v.muteMaster ? 0 : v.master, t, 0.02);
    this.busBgm.gain.setTargetAtTime(v.muteBgm ? 0 : v.bgm, t, 0.02);
    this.busSfx.gain.setTargetAtTime(v.muteSfx ? 0 : v.sfx, t, 0.02);
    this.busUi.gain.setTargetAtTime(v.muteUi ? 0 : v.ui, t, 0.02);
  }
  setStage(stageIndex, songName) {
    this.stageSong = songName;
    const kind = ['office', 'office', 'lab', 'rain'][stageIndex] || 'office';
    if (this.verbGain) this.verbGain.gain.setTargetAtTime([0.2, 0.2, 0.28, 0.16][stageIndex] ?? 0.2, this.ctx.currentTime, 0.1);
    this.setAmbience(kind);
  }

  // ---- BGM ----
  playBgm(name, { offset = 0 } = {}) {
    if (!this.ctx) return;
    if (name === 'stage') name = this.stageSong;
    const m = this.music[name];
    if (!m) { this.pendingBgm = name; return; }
    this.pendingBgm = null;
    if (this.bgm && this.bgm.name === name) return;
    this.stopBgm(0.04);
    const when = this.ctx.currentTime + 0.02;
    const loopLen = m.loopEnd - m.loopStart;
    const start = (buf, gain) => {
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      if (m.loop) { src.loop = true; src.loopStart = m.loopStart; src.loopEnd = m.loopEnd; }
      const g = this.ctx.createGain(); g.gain.value = gain; src.connect(g).connect(this.busBgm);
      src.start(when, m.loop ? m.loopStart + (offset % loopLen) : offset);
      return { src, g };
    };
    const main = start(m.main, 1);
    const hot = m.hot ? start(m.hot, this.intensity) : null;
    this.bgm = { name, main, hot, startedAt: when - offset, loopLen };
    this.log('bgm:' + name);
  }
  stopBgm(fade = 0.05) {
    if (!this.bgm) return;
    const t = this.ctx.currentTime;
    for (const s of [this.bgm.main, this.bgm.hot]) if (s) { s.g.gain.cancelScheduledValues(t); s.g.gain.setValueAtTime(s.g.gain.value, t); s.g.gain.linearRampToValueAtTime(0, t + fade); try { s.src.stop(t + fade + 0.01); } catch { /* */ } }
    this.bgm = null;
  }
  bgmPosition() { return this.bgm ? (this.ctx.currentTime - this.bgm.startedAt) : 0; }
  pauseBgm() { if (!this.bgm) return; const name = this.bgm.name, pos = this.bgmPosition(); this.stopBgm(0.03); this.paused = { name, pos }; if (this.amb) this.amb.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); }
  resumeBgm() { if (this.paused) { const { name, pos } = this.paused; this.paused = null; this.playBgm(name, { offset: pos }); } if (this.amb) this.amb.g.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.2); }
  clearPaused() { this.paused = null; }
  // 緊張の層（0..1）。急に変わらないよう 0.8 秒かけて追従
  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.bgm && this.bgm.hot) this.bgm.hot.g.gain.setTargetAtTime(this.intensity * 0.9, this.ctx.currentTime, 0.8);
  }

  playJingle(name, { stopBgm = true, duck = false } = {}) {
    if (!this.ctx) return 0;
    const m = this.music[name];
    if (!m) return 0;
    if (stopBgm) this.stopBgm(0.03);
    this.stopJingle();
    const src = this.ctx.createBufferSource(); src.buffer = m.main;
    const g = this.ctx.createGain(); src.connect(g).connect(this.busBgm);
    const t = this.ctx.currentTime; src.start(t + 0.01);
    this.jingle = src;
    if (duck && this.bgm) for (const s of [this.bgm.main, this.bgm.hot]) if (s) { const gg = s.g.gain; const v = gg.value; gg.cancelScheduledValues(t); gg.setValueAtTime(v, t); gg.linearRampToValueAtTime(v * 0.3, t + 0.05); gg.setValueAtTime(v * 0.3, t + 1.4); gg.linearRampToValueAtTime(v, t + 2.2); }
    this.log('jingle:' + name);
    return m.length;
  }
  stopJingle() { if (this.jingle) { try { this.jingle.stop(); } catch { /* */ } this.jingle = null; } }

  // ---- 環境音 ----
  setAmbience(kind) {
    if (!this.ctx || !this.buffers['amb:' + kind]) { this.pendingAmb = kind; return; }
    if (this.amb && this.amb.kind === kind) return;
    if (this.amb) { const a = this.amb; a.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => { try { a.src.stop(); } catch { /* */ } }, 1500); }
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers['amb:' + kind]; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.busSfx); src.start();
    g.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.5);
    this.amb = { kind, src, g };
  }

  // ---- 効果音 ----
  // muffle: 0..1（別の階の音はこもらせる）、verb: 残響へのセンド量
  sfx(name, { gain = 1, pan = 0, max = 3, ui = false, muffle = 0, verb = 0.35, delay = 0, rate = 1 } = {}) {
    if (!this.ctx || !this.ready) return;
    const buf = this.buffers['sfx:' + name];
    if (!buf) return;
    const list = (this.voices[name] ||= []);
    while (list.length >= max) { const old = list.shift(); try { old.stop(); } catch { /* */ } }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    let node = src;
    const g = this.ctx.createGain(); g.gain.value = gain * (muffle ? 1 - muffle * 0.55 : 1); node.connect(g); node = g;
    if (muffle) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400 - muffle * 1900; node.connect(f); node = f; }
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
    node.connect(ui ? this.busUi : this.busSfx);
    if (!ui && verb > 0) { const s = this.ctx.createGain(); s.gain.value = verb; node.connect(s).connect(this.verb); }
    src.start(this.ctx.currentTime + delay);
    list.push(src);
    src.onended = () => { const i = list.indexOf(src); if (i >= 0) list.splice(i, 1); };
    this.log('sfx:' + name);
  }
  ui(name) { this.sfx(name, { ui: true, max: 2, verb: 0 }); }
  step(gain = 1, pan = 0) { this.sfx('step' + Math.floor(Math.random() * 4), { gain: 0.55 * gain, pan, max: 2, verb: 0.15, rate: 0.94 + Math.random() * 0.12 }); }

  setHum(on) {
    if (!this.ctx || !this.buffers['sfx:hum']) return;
    if (on && !this.hum) {
      const src = this.ctx.createBufferSource(); src.buffer = this.buffers['sfx:hum']; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.busSfx);
      src.start(); g.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.06);
      this.hum = { src, g };
    } else if (!on && this.hum) {
      const { src, g } = this.hum; const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.05); try { src.stop(t + 0.3); } catch { /* */ }
      this.hum = null;
    }
  }
  stopAll() { this.stopBgm(0.03); this.stopJingle(); this.setHum(false); for (const l of Object.values(this.voices)) for (const s of l) { try { s.stop(); } catch { /* */ } } this.voices = {}; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  log(s) { this.playLog.push([this.ctx ? +this.ctx.currentTime.toFixed(3) : 0, s]); if (this.playLog.length > 200) this.playLog.shift(); }
}
const idle = () => new Promise((res) => setTimeout(res, 0));

// ゲームの出来事 → 音（2D 版・VR 版共通の対応表。AUDIO_REFERENCE.md の表と同じ）
export function playGameEvents(audio, game, events, { panOf = () => 0 } = {}) {
  const p = game.player;
  let humWanted = game.cars.some((c) => c.state === 'moving' && Math.abs(c.y - p.y) < 3.2 * 3);
  const muf = (y) => (y == null ? 0 : Math.min(1, Math.max(0, (Math.abs(y - p.y) - 1.5) / 3)));
  for (const ev of events) {
    const pan = ev.x != null ? panOf(ev.x, ev.y) : 0;
    const muffle = muf(ev.y);
    switch (ev.type) {
      case 'shot': audio.sfx('shot', { pan, max: 3, verb: 0.45 }); audio.sfx('shell', { pan, max: 2, delay: 0.32, gain: 0.7, verb: 0.1 }); break;
      case 'eshot': audio.sfx('eshot', { pan, max: 3, muffle, verb: 0.5 }); break;
      case 'windup': audio.sfx('windup', { pan, gain: 0.9, max: 2, muffle }); break;
      case 'spot': audio.sfx('spot', { pan, gain: 0.6, max: 1 }); break;
      case 'kill': {
        const crushed = ev.cause === 'env' && game.cars.some((c) => c.dy > 0);
        audio.sfx(ev.cause === 'kick' ? 'kick' : crushed ? 'crush' : 'hit', { pan, muffle });
        audio.sfx('bodyfall', { pan, muffle, delay: 0.5, gain: 0.8, max: 2 });
        break;
      }
      case 'kickSwing': audio.sfx('kickSwing'); break;
      case 'jump': audio.sfx('jump', { max: 1 }); break;
      case 'land': if (ev.drop > 0.5) audio.sfx('land', { max: 1, gain: Math.min(1, 0.4 + ev.drop / 4) }); break;
      case 'lightHit': audio.sfx('lightHit', { pan, muffle }); break;
      case 'lightCrash': audio.sfx('lightCrash', { pan, muffle }); break;
      case 'carStart': audio.sfx('carStart', { max: 1 }); break;
      case 'carStop': { const c = game.cars[ev.car]; if (Math.abs(c.y - p.y) < 7) audio.sfx('carStop', { max: 1, pan: panOf(c.x), muffle: muf(c.y) }); break; }
      case 'carPass': if (p.support && p.support.car === game.cars[ev.car]) audio.sfx('carPass', { max: 1, verb: 0.1 }); break;
      case 'carWarn': { const c = game.cars[ev.car]; if (Math.abs(c.y - p.y) < 7) audio.sfx('carWarn', { max: 1, pan: panOf(c.x), muffle: muf(c.y) }); break; }
      case 'carLimit': audio.sfx('carLimit', { max: 1 }); break;
      case 'call': audio.sfx('call', { max: 1 }); break;
      case 'doorWarn': audio.sfx('doorWarn', { max: 2, pan: (() => { const d = game.doors.find((q) => q.id === ev.door); return d ? panOf(d.x) : 0; })() }); break;
      case 'spawn': audio.sfx('doorOpen', { max: 2 }); break;
      case 'doorEnter': audio.sfx('doorEnter', { max: 1 }); break;
      case 'doc': audio.sfx('docGrab', { max: 1 }); audio.playJingle('doc', { stopBgm: false, duck: true }); break;
      case 'bulletCover': audio.sfx('bulletCover', { pan, max: 2 }); break;
      case 'needDocs': audio.sfx('needDocs', { max: 1 }); break;
      case 'dodge': audio.sfx('dodge', { max: 1 }); break;
      case 'miss': audio.setHum(false); audio.playJingle('miss'); if (ev.cause === 'crush') audio.sfx('crush'); break;
      case 'respawn': audio.playBgm('stage'); break;
      case 'clear': audio.setHum(false); audio.setIntensity(0); audio.playJingle('clear'); break;
      case 'gameover': audio.setHum(false); audio.setIntensity(0); audio.playJingle('gameover'); break;
      default: break;
    }
  }
  // 敵の弾が近くをかすめた
  for (const b of game.eBullets) {
    if (b.wz || Math.abs(b.y - (p.y + 1.0)) > 1.2) continue;
    if (Math.abs(b.x - p.x) < 0.9) { b.wz = true; audio.sfx('whizz', { pan: Math.sign(b.dir) * -0.4, max: 2, gain: 0.8 }); }
  }
  // 緊張の層: 同じ階で見つかっている敵の数
  if (game.phase === 'play') {
    const alert = game.enemies.filter((e) => e.alive && Math.abs(e.y - p.y) < 0.6 && (e.state === 'alert' || e.state === 'windup' || e.state === 'cool')).length;
    const target = alert ? Math.min(1, 0.55 + alert * 0.2) : 0;
    if (Math.abs(target - (audio._intTarget ?? -1)) > 0.05) { audio._intTarget = target; audio.setIntensity(target); }
  }
  if (game.phase !== 'play') humWanted = false;
  audio.setHum(humWanted);
}
