// ORBITAL WINGS — 音の窓口（メインスレッド側）
//
//   const audio = new AudioEngine();
//   button.addEventListener('pointerup', () => audio.unlock());   // 最初のユーザー操作の中で呼ぶ
//   audio.playMusic('stage1', { lead: true });   // lead: 開始ファンファーレから切れ目なく面の曲へ
//   audio.sfx('explode_m', { pan: -0.3 });       // pan: 画面の左右（-1〜1。控えめに使う）
//   audio.setEngine('retro');                    // 'modern'（既定）| 'retro'（従来の PSG・波形メモリ音源）
//   audio.setIntensity(2); audio.setLayer('danger', true);   // 動的な曲（ボスの体力・残機）
//
// - AudioContext は 1 つだけ。unlock() の前に呼んだ playMusic・音量などは覚えておき、unlock 後に反映する
//   （unlock 前の sfx は捨てる。古い効果音が後でまとめて鳴らないように）
// - AudioWorklet が使えない・読めない場合は ScriptProcessorNode でメインスレッドに同じ音源（core.js）を回す
// - 曲の状態（どこまで進んだか）は音源の中にある。タブを隠すと AudioContext ごと止め、戻すとそこから続く（二重再生しない）
// - iOS Safari: 'interrupted'（電話・他アプリ）や 'suspended' になったら、次のタッチ・クリック・キーで resume する
import { SONGS } from './songs.js';
import { SFX } from './sfx.js';
import { MSFX } from './sfx2.js';

const WORKLET_NAME = 'orbital-synth';

export class AudioEngine {
  constructor(opts = {}) {
    this.ctx = null;
    this.node = null;
    this.out = null;
    this.backend = null;          // 'worklet' | 'script' | 'none'
    this.synth = null;            // script のときだけ
    this._unlocking = null;
    this._music = null;           // 最後に頼まれた曲（null = 止める）
    this._restartNext = false;
    this._vol = { master: 1, bgm: 0.8, sfx: 0.9 };
    this._muted = false;
    this._paused = false;
    this._engine = opts.engine === 'retro' ? 'retro' : 'modern';
    this._musicOpts = null; this._intensity = 0; this._layers = {};
    this.load = 0;                // 音の計算にかかった時間の割合（0〜1。2 秒ごとに更新）
    this._hidden = false;
    this._req = 0; this._waiters = new Map();
    this.onMusicEnd = null;       // (id) => {}  1 回で終わる曲が終わったとき
    this._onGesture = () => this._resumeIfNeeded();
    if (opts.autoVisibility !== false && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.suspendForHidden(); else this.resumeFromHidden(); });
    }
  }

  get state() {
    return {
      unlocked: !!this.node, backend: this.backend, context: this.ctx ? this.ctx.state : 'none',
      music: this._music, muted: this._muted, paused: this._paused, engine: this._engine, intensity: this._intensity, layers: { ...this._layers }, hidden: this._hidden, load: this.load,
      volumes: { ...this._vol },
    };
  }

  // ユーザー操作（クリック・タッチ・キー）の中で呼ぶ。何度呼んでもよい
  unlock() {
    if (this.ctx) { this._resumeIfNeeded(); return this._unlocking || Promise.resolve(!!this.node); }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { this.backend = 'none'; return Promise.resolve(false); }
    // ここまでは同期で（ユーザー操作の中で）行う。iOS は操作の中で resume と無音の再生が要る
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
    this.ctx = ctx;
    try { const b = ctx.createBuffer(1, 1, ctx.sampleRate); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch { /* 古い Safari */ }
    const resumed = ctx.resume ? ctx.resume().catch(() => {}) : Promise.resolve();
    this.out = ctx.createGain();
    this.out.gain.value = this._muted ? 0 : 1;
    this.out.connect(ctx.destination);
    ctx.onstatechange = () => { if (ctx.state !== 'running' && !this._hidden) this._listenGestures(true); };
    this._listenGestures(true);
    this._unlocking = (async () => {
      await this._createNode();
      await resumed;
      this._applyAll();
      return !!this.node;
    })();
    return this._unlocking;
  }

  async _createNode() {
    const ctx = this.ctx;
    try {
      if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet なし');
      await ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
      const node = new AudioWorkletNode(ctx, WORKLET_NAME, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => this._onMessage(e.data);
      node.onprocessorerror = () => { console.warn('[audio] AudioWorklet が止まったので ScriptProcessor に切り替えます'); this._fallback(); };
      node.connect(this.out);
      this.node = node; this.backend = 'worklet';
    } catch (err) {
      console.warn('[audio] AudioWorklet が使えないので ScriptProcessor で鳴らします:', err && err.message);
      await this._fallback();
    }
  }

  async _fallback() {
    const ctx = this.ctx;
    if (this.node) { try { this.node.disconnect(); } catch { /* 無視 */ } }
    try {
      const { SoundCore } = await import('./core.js');
      const sy = new SoundCore(ctx.sampleRate);
      const sp = ctx.createScriptProcessor(2048, 1, 2);
      sp.onaudioprocess = (e) => {
        const ob = e.outputBuffer, L = ob.getChannelData(0), R = ob.numberOfChannels > 1 ? ob.getChannelData(1) : null;
        const t0 = performance.now();
        sy.renderStereo(L, R, 0, L.length);
        this._acc += performance.now() - t0; this._accN += L.length;
        if (this._accN >= ctx.sampleRate * 2) { this.load = this._acc / (this._accN / ctx.sampleRate * 1000); this._acc = 0; this._accN = 0; }
        if (sy.eventCount) for (const ev of sy.drainEvents()) if (ev.type === 'ended') this._onMessage({ type: 'ended', id: ev.id });
      };
      sp.connect(this.out);
      this._acc = 0; this._accN = 0;
      this.synth = sy; this.node = sp; this.backend = 'script';
      this._applyAll();
    } catch (err) {
      console.warn('[audio] 音を出せません:', err && err.message);
      this.node = null; this.backend = 'none';
    }
  }

  _onMessage(m) {
    if (!m) return;
    if (m.type === 'ended') {
      if (this._music === m.id) this._music = null;
      if (typeof this.onMusicEnd === 'function') { try { this.onMusicEnd(m.id); } catch (e) { console.error(e); } }
    } else if (m.type === 'load') { this.load = m.v;
    } else if (m.type === 'pos') {
      const w = this._waiters.get(m.req); if (w) { this._waiters.delete(m.req); const { type, req, ...pos } = m; w(pos); }
    }
  }

  _post(m) {
    if (!this.node) return;
    if (this.backend === 'worklet') { this.node.port.postMessage(m); return; }
    const sy = this.synth; if (!sy) return;
    switch (m.type) {
      case 'music': sy.playMusic(m.id, m); break;
      case 'stop': sy.stopMusic(m); break;
      case 'sfx': sy.sfx(m.name, m); break;
      case 'vol': sy.setVolumes(m); break;
      case 'pause': sy.setPaused(!!m.on); break;
      case 'engine': sy.setMode(m.mode); break;
      case 'intensity': sy.setIntensity(m.n); break;
      case 'layer': sy.setLayer(m.name, m.on); break;
      case 'query': this._onMessage({ type: 'pos', req: m.req, ...sy.musicPosition(), playing: sy.isMusicPlaying(), engine: sy.mode }); break;
      default: break;
    }
  }

  _applyAll() {
    this._post({ type: 'engine', mode: this._engine });
    this._post({ type: 'vol', ...this._vol });
    this._post({ type: 'pause', on: this._paused });
    this._post({ type: 'intensity', n: this._intensity });
    for (const k of Object.keys(this._layers)) this._post({ type: 'layer', name: k, on: this._layers[k] });
    if (this._music) { this._post({ type: 'music', id: this._music, ...(this._musicOpts || {}), restart: this._restartNext || !!(this._musicOpts && this._musicOpts.restart) }); this._restartNext = false; this._musicOpts = null; }
  }

  // 同じ曲が鳴っている間にもう一度呼んでも頭には戻らない。{restart:true} で頭から
  // opts: restart / lead（開始ファンファーレを前に付けて切れ目なくつなぐ）/ fade（前の曲を消す秒数）/ mode: 'tape'（テープを止めるように落とす）
  playMusic(id, opts = {}) {
    if (!SONGS[id]) { console.warn('[audio] 知らない曲', id); return; }
    this._music = id;
    const o = { restart: !!opts.restart, lead: !!opts.lead };
    if (typeof opts.fade === 'number') o.fade = opts.fade;
    if (opts.mode === 'tape') o.mode = 'tape';
    if (!this.node) { this._restartNext = this._restartNext || o.restart; this._musicOpts = o; return; }
    this._post({ type: 'music', id, ...o });
  }
  // opts: fade（秒）/ tape（テープを止めるように落とす）
  stopMusic(opts = {}) {
    this._music = null; this._restartNext = false; this._musicOpts = null;
    const m = { type: 'stop' };
    if (typeof opts.fade === 'number') m.fade = opts.fade;
    if (opts.tape) m.tape = true;
    this._post(m);
  }
  // opts: pan（-1〜1）/ step（段: ゲージの位置・シールドの残り）/ pitch（半音）/ gain（0〜2）
  sfx(name, opts) {
    if (!MSFX[name] && !SFX[name]) return;
    if (!this.node || this._hidden || !this.ctx || this.ctx.state !== 'running') return;
    const m = { type: 'sfx', name };
    if (opts) { for (const k of ['pan', 'step', 'pitch', 'gain']) if (typeof opts[k] === 'number' && isFinite(opts[k])) m[k] = opts[k]; }
    this._post(m);
  }
  setVolumes(v = {}) {
    for (const k of ['master', 'bgm', 'sfx']) if (typeof v[k] === 'number' && isFinite(v[k])) this._vol[k] = Math.max(0, Math.min(1, v[k]));
    this._post({ type: 'vol', ...this._vol });
  }
  setMuted(on) {
    this._muted = !!on;
    if (this.out && this.ctx) { const g = this.out.gain; g.cancelScheduledValues(this.ctx.currentTime); g.setTargetAtTime(this._muted ? 0 : 1, this.ctx.currentTime, 0.01); }
  }
  // モダン音源: 曲は止めずにこもらせる（ローパス）。レトロ音源: 従来どおり曲を止めて消す
  setPaused(on) { this._paused = !!on; this._post({ type: 'pause', on: this._paused }); }
  // 音源の切り替え: 'modern'（既定）| 'retro'。鳴っている曲は新しい音源で頭から鳴り直す
  setEngine(mode) { this._engine = mode === 'retro' ? 'retro' : 'modern'; this._post({ type: 'engine', mode: this._engine }); }
  // 動的な曲: 強さ 0〜2（ボスの体力・フェーズ）と名前つきの層（'danger' = 残機が最後）。モダン音源だけ
  setIntensity(n) { n = Math.max(0, Math.min(2, n | 0)); if (n === this._intensity) return; this._intensity = n; this._post({ type: 'intensity', n }); }
  setLayer(name, on) { on = !!on; if (!!this._layers[name] === on) return; this._layers[name] = on; this._post({ type: 'layer', name, on }); }
  // 旧 API（アレンジモードは廃止。呼んでも何もしない）
  setArrange() {}

  // タブが隠れた: AudioContext ごと止める（音源の時間も止まるので、戻すと同じ位置から続く）
  suspendForHidden() {
    this._hidden = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }
  resumeFromHidden() {
    this._hidden = false;
    this._resumeIfNeeded();
  }

  // 曲の位置を問い合わせる（Promise）
  musicPosition() {
    if (!this.node) return Promise.resolve({ id: null, frame: 0, tick: 0, loops: 0, seconds: 0, playing: false });
    const req = ++this._req;
    return new Promise((res) => { this._waiters.set(req, res); this._post({ type: 'query', req }); setTimeout(() => { if (this._waiters.delete(req)) res(null); }, 500); });
  }

  _resumeIfNeeded() {
    const ctx = this.ctx;
    if (!ctx || this._hidden || ctx.state === 'closed') return;
    if (ctx.state !== 'running') {
      // iOS の 'interrupted' もここで resume を試す（操作の中なら通る）
      ctx.resume().then(() => { if (ctx.state === 'running') this._listenGestures(false); }).catch(() => {});
    } else this._listenGestures(false);
  }
  _listenGestures(on) {
    if (typeof window === 'undefined' || on === this._gestures) return;
    this._gestures = on;
    const evs = ['touchend', 'pointerup', 'mousedown', 'keydown'];
    for (const e of evs) {
      if (on) window.addEventListener(e, this._onGesture, { capture: true, passive: true });
      else window.removeEventListener(e, this._onGesture, { capture: true });
    }
  }
}
