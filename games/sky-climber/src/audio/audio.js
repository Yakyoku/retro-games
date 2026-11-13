// Sky Climber VR — 音の再生（Web Audio）。
// 音源は 2 種類: モダン（modern.js: ステム分けの適応型音楽・層を重ねた効果音・高品質の掛け声）と、レトロ（PSG チップ音源＝従来のクラシック）。
// 音響モード: 'vr' = モダン音源＋空間（HRTF・残響・環境音）／'retrovr' = レトロ音源＋空間／'classic' = レトロ音源・モノラル・残響なし・環境音なし。
// バス: bgm / sfx / voice / amb / guide → まとめ → ポーズ用ローパス → バスコンプ → リミッター → 全体音量。
import { SONGS } from './music.js';
import { renderSong } from './psg.js';
import { SFX, renderSfx } from './sfx.js';
import { VOICES, synthVoice } from './voice.js';
import { MODERN_SONGS, STEMS, MODERN_SFX_NAMES, COMBO_SCALE, GRAB_MATERIAL } from './modern-songs.js';
import { canRenderModern, renderModernSong, renderModernJingle, renderModernSfx, MODERN_SFX } from './modern.js';

const BUSES = ['bgm', 'sfx', 'voice', 'amb', 'guide'];
// 鳴らす優先度（同時発音の上限を超えたら低いものから止める）
const PRIORITY = { fall: 9, hit: 9, grace: 8, windowWarn: 7, buzz: 7, dropFall: 6, birdCall: 6, windowClose: 6, zap: 8, dropBreak: 5, grab: 4, reach: 2, flap: 1, creak: 2, motor: 1, floor: 1, heart: 1, horn: 0, train: 0, gust: 0 };
const NO_DETUNE = /^(combo|ui|floor|respawn|grace|heart|loop_)/;
// ステムごとの残響の量（実行時に 1 つのリバーブへ送る）。シンセウェーブはスネアと旋律を深く
const STEM_SEND = { drums: 0.07, perc: 0.1, bass: 0, chords: 0.28, lead: 0.34, tension: 0.2 };
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class AudioEngine {
  constructor() {
    this.ctx = null; this.buf = {}; this.mbuf = {}; this.mvoice = {}; this.mjingle = {}; this.msong = null; this.mode = 'vr';
    this.vol = { master: 0.9, bgm: 0.7, sfx: 0.9, voice: 0.9, amb: 0.6, guide: 0.8 };
    this.mute = { master: false, bgm: false, sfx: false, voice: false, amb: false, guide: false };
    this.playing = []; this.lastAt = {}; this.song = null; this.songName = null; this.musicToken = 0;
    this.ambNodes = null; this.altitude = 0; this.rr = {}; this.loops = {}; this.lpos = null;
    this.intensity = { height01: 1, danger: false, oneHand: false, lives: 3, loops: {} }; this.oneHandT = 0; this.paused = false; this.nextHeart = 0; this.ambT = { horn: 4, train: 30, gust: 8 };
    this.modernReady = false; this.renderLog = [];
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  get spatial() { return this.mode !== 'classic'; }
  get soundSet() { return this.mode === 'vr' && canRenderModern() ? 'modern' : 'retro'; }
  get modern() { return this.soundSet === 'modern'; }
  // 開始操作（クリック・タップ・ボタン）の中で呼ぶ。2 回目以降は resume だけ
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.bus = {};
      this.master = c.createGain(); this.master.connect(c.destination);
      // マスター: バスコンプ（全体をまとめる）→ リミッター（音割れ防止）
      this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -2.5; this.limiter.knee.value = 2; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001; this.limiter.release.value = 0.08; this.limiter.connect(this.master);
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -15; this.comp.knee.value = 10; this.comp.ratio.value = 2.5; this.comp.attack.value = 0.012; this.comp.release.value = 0.22; this.comp.connect(this.limiter);
      this.pauseLP = c.createBiquadFilter(); this.pauseLP.type = 'lowpass'; this.pauseLP.frequency.value = 20000; this.pauseLP.Q.value = 0.5; this.pauseLP.connect(this.comp);
      this.pre = c.createGain(); this.pre.connect(this.pauseLP);
      for (const b of BUSES) { const g = c.createGain(); g.connect(this.pre); this.bus[b] = g; }
      // 残響（自作のインパルス）: 効果音と掛け声を少し送る（モダン音源のときだけ）
      this.rev = c.createConvolver(); this.rev.buffer = this.makeImpulse(1.4, 3.5); this.revOut = c.createGain(); this.revOut.gain.value = 0; this.rev.connect(this.revOut); this.revOut.connect(this.pre);
      this.musicRev = c.createGain(); this.musicRev.connect(this.rev);
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.master.connect(this.analyser);
      this.renderAll();
      this.applyVolumes();
      this.silentUnlock();
      this.tickTimer = setInterval(() => this.tick(), 120);
      if (canRenderModern()) this.modernPromise = this.renderModernAll().catch((e) => { console.warn('モダン音源の準備に失敗（レトロ音源で続行）', e); });
    }
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { /* 次の操作で再試行 */ } }
    if (this.pendingSong && this.ready) { const p = this.pendingSong; this.pendingSong = null; this.music(p.name, p.opt); }
    return this.ready;
  }
  // iOS: 本体の消音スイッチが入っていても鳴るように、無音の <audio> をループ再生しておく（Web Audio が「再生」扱いになる）
  silentUnlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      const n = 800, b = new Uint8Array(44 + n), dv = new DataView(b.buffer), w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
      const a = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))); a.loop = true; a.setAttribute('playsinline', ''); a.volume = 0.01; a.play().catch(() => {}); this.silentEl = a;
    } catch (e) { /* 対応していない環境 */ }
  }
  makeImpulse(sec, decay) { const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n, w = (Math.random() * 2 - 1) * Math.pow(1 - t, decay); lp += (w - lp) * (0.6 * (1 - t) + 0.05); d[i] = lp; } } return b; }
  mkBufFrom(chans, sr) { const b = this.ctx.createBuffer(chans.length, chans[0].length, sr); chans.forEach((d, i) => b.copyToChannel(d, i)); return b; }
  renderAll() {
    const sr = this.ctx.sampleRate;
    const mk = (pcm, srIn = sr) => { const b = this.ctx.createBuffer(1, pcm.length, srIn); b.copyToChannel(pcm, 0); return b; };
    for (const k of Object.keys(SFX)) this.buf['sfx:' + k] = mk(renderSfx(k, sr));
    for (const k of Object.keys(VOICES)) this.buf['voice:' + k] = mk(synthVoice(k, sr));
    this.mkBuf = mk;
  }
  // モダン音源の準備（裏で順に作る。できるまではレトロ音源が鳴る）
  async renderModernAll() {
    const sr = this.ctx.sampleRate, t0 = performance.now();
    for (const name of MODERN_SFX_NAMES) { const r = MODERN_SFX[name]; const list = []; for (let v = 0; v < (r.n || 1); v++) { const d = await renderModernSfx(name, v, sr); if (d) list.push(this.mkBufFrom([d], sr)); } this.mbuf[name] = list; }
    this.renderLog.push({ what: 'sfx', ms: Math.round(performance.now() - t0) });
    const t1 = performance.now();
    for (const k of Object.keys(VOICES)) { const d = synthVoice(k, sr, { lofi: false, hq: true }); let sq = 0; for (let i = 0; i < d.length; i++) sq += d[i] * d[i]; const g = Math.min(1, 0.14 / (Math.sqrt(sq / d.length) || 1)); for (let i = 0; i < d.length; i++) d[i] *= g; // ラウドネス合わせ（RMS -17dBFS）
      this.mvoice[k] = this.mkBufFrom([d], sr); await new Promise((r) => setTimeout(r, 0)); }
    this.renderLog.push({ what: 'voice', ms: Math.round(performance.now() - t1) });
    this.modernReady = true;
    for (const k of ['start', 'title', 'bird', 'crane']) await this.modernJingle(k);
  }
  async modernJingle(name) {
    if (this.mjingle[name]) return this.mjingle[name];
    if (!SONGS[name] || !canRenderModern()) return null;
    const t0 = performance.now(), r = await renderModernJingle(SONGS[name], this.ctx.sampleRate); if (!r) return null;
    this.renderLog.push({ what: 'jingle:' + name, ms: Math.round(performance.now() - t0) });
    return (this.mjingle[name] = this.mkBufFrom([r.L, r.R], r.sampleRate));
  }
  // 次に使う曲を先に作り始める（プレイ開始のジングルの間に準備する）
  prepare(name) { if (this.ready && this.modern && MODERN_SONGS[name]) this.modernSong(name); }
  async modernSong(name) {
    if (this.msong && this.msong.name === name) return this.msong;
    if (this.msongPending && this.msongPending.name === name) return this.msongPending.p;
    const p = (async () => { const r = await renderModernSong(name, this.ctx.sampleRate); if (!r) return null; const stems = {}; for (const s of STEMS) stems[s] = this.mkBufFrom(r.stems[s], r.sampleRate);
      this.renderLog.push({ what: 'song:' + name, ms: Math.round(r.ms) }); const o = { name, stems, length: r.length, bpm: r.bpm, bars: r.bars }; this.msong = o; this.msongPending = null; return o; })(); // 直前の曲のステムは手放す（メモリー節約）
    this.msongPending = { name, p }; return p;
  }
  songBuffer(name) {
    const key = 'song:' + name;
    if (!this.buf[key]) { const r = renderSong(SONGS[name], this.ctx.sampleRate); this.buf[key] = this.mkBuf(r.pcm); this.buf[key].loopSong = r.loop; }
    return this.buf[key];
  }
  setMode(m) {
    const was = this.soundSet; this.mode = m || 'vr';
    if (!this.ctx) return;
    this.applyVolumes(); this.updateAmbient(this.altitude);
    if (was !== this.soundSet) { const n = this.songName, loop = this.song && this.song.loop; if (n) { this.stopMusic(0.05); this.music(n, { loop }); } if (!this.modern) this.stopLoops(); if (this.ambNodes) this.startAmbient(this.ambNodes.theme); }
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.mute.master ? 0 : this.vol.master, t, 0.02);
    for (const b of BUSES) {
      let v = this.mute[b] ? 0 : this.vol[b];
      if (b === 'amb' && !this.spatial) v = 0; // クラシック音響では追加環境音を鳴らさない
      this.bus[b].gain.setTargetAtTime(v, t, 0.03);
    }
    this.revOut.gain.setTargetAtTime(this.modern ? 0.9 : 0, t, 0.05); // 残響はモダン音源のときだけ
    this.musicRev.gain.setTargetAtTime(this.mute.bgm ? 0 : this.vol.bgm, t, 0.03);
  }
  setVolume(bus, v) { this.vol[bus] = v; this.applyVolumes(); }
  setMute(bus, m) { this.mute[bus] = m; this.applyVolumes(); }

  // 名前の読み替え: モダンは素材別・変化違いつき、レトロは従来の 1 種類
  resolve(name, opt) {
    if (VOICES[name] && !SFX[name]) return { voice: true, key: name, buf: (this.modern && this.mvoice[name]) || this.buf['voice:' + name] };
    let n = name, rate = 1;
    if (this.modern && this.modernReady) {
      if (n === 'grab') n = 'grab_' + (opt.material || GRAB_MATERIAL[opt.kind] || 'stone');
      else if (n === 'dropBreak') n = 'break_' + ({ pot: 'pot', can: 'can', bucket: 'bucket', bottle: 'bottle' }[opt.item] || 'pot');
      else if (/^combo/.test(n)) { const k = opt.n ?? (n === 'combo3' ? 6 : n === 'combo2' ? 4 : 3); rate = Math.pow(2, COMBO_SCALE[Math.max(0, Math.min(COMBO_SCALE.length - 1, k - 3))] / 12); n = 'combo'; }
      const list = this.mbuf[n];
      if (list && list.length) { const i = (this.rr[n] = ((this.rr[n] ?? -1) + 1) % list.length); if (!NO_DETUNE.test(n)) rate *= 1 + (Math.random() - 0.5) * 0.06; return { key: n, buf: list[i], rate, modern: true }; }
    }
    if (/^grab_/.test(n)) n = 'grab'; else if (/^break_/.test(n)) n = 'dropBreak'; else if (n === 'combo') n = opt.n >= 6 ? 'combo3' : opt.n >= 4 ? 'combo2' : 'combo1';
    return { key: n, buf: this.buf['sfx:' + n], rate: 1 };
  }
  // 効果音・掛け声。opt.pos = {x,y,z}（空間に置く）、opt.warn = 予告音（距離で消えないよう直接音も足す）、opt.material / opt.item / opt.n
  play(name, opt = {}) {
    if (!this.ready) return null;
    const r = this.resolve(name, opt); const buf = r.buf; if (!buf) return null;
    const key = (r.voice ? 'voice:' : 'sfx:') + r.key;
    const now = this.ctx.currentTime;
    // 同じ音の二重発音を防ぐ（40ms 以内の再発音は 1 回にまとめる）
    if (this.lastAt[key] != null && now - this.lastAt[key] < (opt.minGap ?? 0.04)) return null;
    this.lastAt[key] = now;
    // 同時発音の上限（14）。超えたら優先度の低いものを止める
    this.playing = this.playing.filter((p) => p.end > now);
    if (this.playing.length >= 14) { this.playing.sort((a, b) => a.pri - b.pri); const v = this.playing.shift(); try { v.src.stop(); } catch (e) { /* 済 */ } }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = (r.rate || 1) * (opt.rate || 1);
    const g = this.ctx.createGain(); g.gain.value = opt.gain ?? 1;
    src.connect(g);
    const bus = this.bus[r.voice ? 'voice' : 'sfx'];
    let tail = g;
    if (this.spatial && opt.pos) {
      // 距離に応じて高域を落とす（遠い音はこもる）。HRTF は近くで大きく、遠くでもゆるやかに減衰
      let dist = 0; if (this.lpos) dist = Math.hypot(opt.pos.x - this.lpos.x, opt.pos.y - this.lpos.y, opt.pos.z - this.lpos.z);
      if (r.modern && dist > 2) { const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(1800, 16000 / (1 + (dist - 2) * 0.22)); g.connect(lp); tail = lp; }
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = opt.warn ? 3 : 2; p.rolloffFactor = opt.warn ? 0.6 : 0.9; p.maxDistance = 60;
      setPos(p, opt.pos, now);
      tail.connect(p); p.connect(bus);
      if (opt.warn) { const d = this.ctx.createGain(); d.gain.value = 0.35; g.connect(d); d.connect(bus); } // 遠くても聞こえる直接音
      // 落下物: 近づいて通り過ぎる感じ（ドップラー風に音程が下がる）
      if (r.modern && r.key === 'dropFall') { src.playbackRate.setValueAtTime(1.1, now); src.playbackRate.linearRampToValueAtTime(0.9, now + buf.duration); }
    } else g.connect(bus);
    if (this.modern) { const s = this.ctx.createGain(); s.gain.value = r.voice ? 0.14 : (opt.pos ? 0.22 : 0.12); tail.connect(s); s.connect(this.rev); }
    if (r.voice && this.modern) this.duck(0.6, buf.duration); // 掛け声の間は曲を少し下げる
    src.start(now);
    const item = { src, end: now + buf.duration / src.playbackRate.value, pri: PRIORITY[name] ?? 3, name };
    this.playing.push(item);
    src.onended = () => { item.end = 0; };
    return item;
  }
  duck(to, dur) { if (!this.song) return; const g = this.song.g.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(to * (this.paused ? 0.5 : 1), t, 0.03); g.setTargetAtTime(this.paused ? 0.5 : 1, t + dur, 0.12); }

  // 曲。同じ曲なら何もしない。モダン: ステムを重ねて鳴らし、ループ曲どうしは拍の頭で切り替える
  music(name, opt = {}) {
    if (!this.ready) { this.pendingSong = { name, opt }; return; }
    if (this.songName === name && this.song) return;
    const token = ++this.musicToken;
    if (this.modern) {
      if (MODERN_SONGS[name]) {
        this.songName = name; // 準備中も「この曲を鳴らす予定」として覚える
        let ready = false;
        this.modernSong(name).then((s) => { ready = true; if (!s || token !== this.musicToken || !this.modern) return; this.startStems(s); });
        // ステムの準備に時間がかかる端末では、2.5 秒たっても用意できなければレトロ音源の同じ面の曲でつなぐ（用意でき次第、拍の頭で入れ替える）
        setTimeout(() => { if (ready || token !== this.musicToken || !SONGS[name]) return; if (this.song && this.song.loop) return; const b = this.songBuffer(name); if (this.song) this.fadeOut(this.song, 0.2); this.startBuffer(b, name, true); this.song.placeholder = true; }, 2500);
        return;
      }
      if (SONGS[name]) { this.modernJingle(name).then((b) => { if (!b || token !== this.musicToken) return; this.stopMusic(0.08, true); this.startBuffer(b, name, opt.loop ?? false); }); this.songName = name; return; }
    }
    this.stopMusic(0.08, true);
    const buf = this.songBuffer(name);
    this.startBuffer(buf, name, opt.loop ?? buf.loopSong);
  }
  startBuffer(buf, name, loop) {
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = loop;
    const g = this.ctx.createGain(); g.gain.value = this.paused ? 0.5 : 1;
    src.connect(g); g.connect(this.bus.bgm);
    src.start(this.ctx.currentTime + 0.02);
    const song = { src, srcs: [src], g, loop, name }; this.song = song; this.songName = name;
    src.onended = () => { if (this.song === song) { this.song = null; if (this.songName === name) this.songName = null; } };
  }
  startStems(s) {
    const c = this.ctx, now = c.currentTime;
    // 切り替えの時刻: 前のループ曲があれば次の拍の頭、なければすぐ
    let at = now + 0.06;
    const old = this.song;
    if (old && old.stems && old.bpm) { const beat = 60 / old.bpm / (old.rate || 1), el = now - old.t0; at = now + (beat - (el % beat)) % beat + 0.02; }
    if (old) this.fadeOut(old, at - now + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(this.paused ? 0.5 : 1, at + 0.15); g.connect(this.bus.bgm);
    const stemG = {}, srcs = [];
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, now); g2.gain.setValueAtTime(0.0001, at); g2.gain.linearRampToValueAtTime(1, at + 0.15); g2.connect(this.musicRev); // 曲の残響への送り
    for (const k of STEMS) { const src = c.createBufferSource(); src.buffer = s.stems[k]; src.loop = true; const sg = c.createGain(); sg.gain.value = this.layerGain(k); src.connect(sg); sg.connect(g); src.start(at); srcs.push(src); stemG[k] = sg;
      const send = STEM_SEND[k] * (s.name === 'climb3' ? 1.7 : 1); if (send > 0) { const sd = c.createGain(); sd.gain.value = send; sg.connect(sd); sd.connect(g2); } }
    this.tape = false;
    this.song = { src: srcs[0], srcs, g, g2, stems: stemG, loop: true, name: s.name, t0: at, bpm: s.bpm, length: s.length, rate: 1 }; this.songName = s.name;
    this.applyRate();
  }
  // 層の音量: 低い所では骨組みだけ、登るほど旋律・打楽器が加わる。片手が続く／危険が近いと緊張の層
  layerGain(k) {
    const I = this.intensity, h = I.height01 ?? 1;
    if (k === 'lead') return smooth(h, 0.03, 0.1);
    if (k === 'perc') return smooth(h, 0.28, 0.42);
    if (k === 'chords') return 0.8 + 0.2 * smooth(h, 0.5, 0.8);
    if (k === 'tension') return I.danger ? 0.9 : this.oneHandT > 1.2 ? 0.6 : 0;
    return 1;
  }
  applyLayers() { const s = this.song; if (!s || !s.stems) return; const t = this.ctx.currentTime; for (const k of STEMS) s.stems[k].gain.setTargetAtTime(this.layerGain(k), t, k === 'tension' ? 0.25 : 0.8); }
  applyRate() { const s = this.song; if (!s || !s.stems) return; const r = this.tape ? 0.3 : (this.intensity.lives === 1 ? 1.04 : 1); s.rate = r; const t = this.ctx.currentTime; for (const src of s.srcs) src.playbackRate.setTargetAtTime(r, t, this.tape ? 0.28 : 0.4); }
  // ゲームの状況を伝える: { height01, danger, oneHand, lives, loops: { motor, creak, hum, heli } }（毎 tick 呼んでよい）
  setIntensity(I) {
    const prevLives = this.intensity.lives; Object.assign(this.intensity, I);
    const now = performance.now(); if (this._iT && now - this._iT < 100 && prevLives === this.intensity.lives) return; this._iT = now;
    if (!this.ctx) return;
    this.applyLayers(); if (prevLives !== this.intensity.lives) this.applyRate();
    if (this.modern && this.modernReady) for (const k of ['motor', 'creak', 'hum', 'heli']) this.setLoop(k, (I.loops && I.loops[k]) || 0);
  }
  // 落下: テープを止めるように曲の速さと音程が落ちる → 復帰で戻る
  tapeStop() { this.tape = true; if (this.ctx) this.applyRate(); }
  tapeStart() { this.tape = false; if (this.ctx) this.applyRate(); }
  // 一時停止: 全体をこもらせ（ローパス）、曲を下げる
  setPaused(p) {
    this.paused = p; if (!this.ctx) return; const t = this.ctx.currentTime;
    this.pauseLP.frequency.setTargetAtTime(p ? 700 : 20000, t, 0.08);
    if (this.song) { this.song.g.gain.cancelScheduledValues(t); this.song.g.gain.setTargetAtTime(p ? 0.5 : 1, t, 0.08); }
    if (p) for (const k of Object.keys(this.loops)) this.setLoop(k, 0);
  }
  setLoop(k, gain) {
    let L = this.loops[k];
    if (!L) { if (gain <= 0.01) return; const list = this.mbuf['loop_' + k]; if (!list || !list[0]) return; const src = this.ctx.createBufferSource(); src.buffer = list[0]; src.loop = true; const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.bus.sfx); src.start(); L = this.loops[k] = { src, g }; }
    L.g.gain.setTargetAtTime(this.paused ? 0 : Math.min(1, gain) * 0.7, this.ctx.currentTime, 0.2);
  }
  stopLoops() { for (const [k, L] of Object.entries(this.loops)) { try { L.src.stop(); } catch (e) { /* 済 */ } L.g.disconnect(); delete this.loops[k]; } }
  // 出来事を知らせる短い旋律（鳥の登場など）。曲は止めずに一瞬だけ下げる
  sting(name) {
    if (!this.ready) return;
    const go = (buf) => { if (!buf) return; const t = this.ctx.currentTime, src = this.ctx.createBufferSource(); src.buffer = buf; const g = this.ctx.createGain(); g.gain.value = 0.8; src.connect(g); g.connect(this.bus.bgm); src.start(t); this.duck(0.4, buf.duration * 0.7); };
    if (this.modern) this.modernJingle(name).then(go); else go(this.songBuffer(name));
  }
  fadeOut(song, fade) { const t = this.ctx.currentTime; if (song.g2) song.g2.gain.setTargetAtTime(0, t + Math.max(0, fade - 0.12), 0.04); song.g.gain.cancelScheduledValues(t); song.g.gain.setTargetAtTime(0, t + Math.max(0, fade - 0.12), 0.04); for (const src of song.srcs) { try { src.stop(t + fade + 0.1); } catch (e) { /* 済 */ } } }
  stopMusic(fade = 0.15, keepToken = false) {
    if (!keepToken) this.musicToken++;
    if (!this.song) { if (!keepToken) this.songName = null; return; }
    this.fadeOut(this.song, fade);
    this.song = null; this.songName = null;
  }
  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    this.lpos = { x: pos.x, y: pos.y, z: pos.z };
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else if (L.setPosition) { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }
  // 追加の環境音（空間モードのみ）: 交通（低い所ほど大きく、高い所ではこもる）・風（高い所ほど大きい）・雨（夜の棟）
  startAmbient(theme) {
    if (!this.ready) return;
    this.stopAmbient();
    this.tape = false; this.setPaused(false); // 新しい挑戦: 落下・一時停止の効果を戻す
    const sr = this.ctx.sampleRate, len = sr * 4;
    const brown = new Float32Array(len), white = new Float32Array(len);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; white[i] = w; b = (b + 0.02 * w) / 1.02; brown[i] = b * 3.5; }
    for (const a of [brown, white]) { const f = Math.floor(sr * 0.2); for (let i = 0; i < f; i++) { const t = i / f; a[i] = a[i] * t + a[len - f + i] * (1 - t); } }
    const mk = (pcm) => { const bb = this.ctx.createBuffer(1, pcm.length, sr); bb.copyToChannel(pcm, 0); return bb; };
    const loop = (buf, filterType, freq, q) => {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.bus.amb); s.start();
      return { s, f, g };
    };
    const n = { traffic: loop(mk(brown), 'lowpass', 380, 0.7), wind: loop(mk(white), 'bandpass', 520, 0.8) };
    if (this.modern) n.whistle = loop(mk(white), 'bandpass', 1900, 9); // 高い所の風切り音
    if (theme === 'night') n.rain = loop(mk(white), 'highpass', 3500, 0.5);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = theme === 'tower' ? 0.17 : 0.09;
    const lg = this.ctx.createGain(); lg.gain.value = theme === 'tower' ? 260 : 140; lfo.connect(lg); lg.connect(n.wind.f.frequency); if (n.whistle) { const lg2 = this.ctx.createGain(); lg2.gain.value = 500; lfo.connect(lg2); lg2.connect(n.whistle.f.frequency); } lfo.start();
    n.lfo = lfo; n.theme = theme;
    this.ambNodes = n; this.ambT = { horn: 3 + Math.random() * 5, train: 20 + Math.random() * 30, gust: 6 + Math.random() * 6 };
    this.updateAmbient(this.altitude);
  }
  updateAmbient(alt) {
    this.altitude = alt;
    const n = this.ambNodes; if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const tower = n.theme === 'tower' ? 1.5 : 1;
    n.traffic.g.gain.setTargetAtTime(Math.max(0.04, 0.55 * (1 - alt / 60)), t, 0.5);
    n.traffic.f.frequency.setTargetAtTime(Math.max(140, 420 - alt * 5), t, 0.5); // 高い所ほど街の音がこもる
    n.wind.g.gain.setTargetAtTime(Math.min(0.5, (0.06 + alt / 120) * tower), t, 0.5);
    if (n.whistle) n.whistle.g.gain.setTargetAtTime(Math.min(0.12, Math.max(0, alt - 15) / 400 * tower), t, 0.8);
    if (n.rain) n.rain.g.gain.setTargetAtTime(0.10, t, 0.5);
  }
  stopAmbient() {
    this.tape = false; if (this.paused) this.setPaused(false); this.intensity.height01 = 1; this.intensity.oneHand = false; this.intensity.danger = false;
    const n = this.ambNodes; if (!n) { this.stopLoops(); return; }
    for (const k of ['traffic', 'wind', 'rain', 'whistle']) if (n[k]) { try { n[k].s.stop(); } catch (e) { /* 済 */ } n[k].g.disconnect(); }
    try { n.lfo.stop(); } catch (e) { /* 済 */ }
    this.ambNodes = null; this.stopLoops();
  }
  // 0.12 秒ごとの見回り: 片手の継続時間・心拍・街の出来事（クラクション・電車・突風）
  tick() {
    if (!this.ready) return;
    const dt = 0.12, I = this.intensity;
    const was = this.oneHandT; this.oneHandT = I.oneHand && !this.paused ? this.oneHandT + dt : 0;
    if ((was > 1.2) !== (this.oneHandT > 1.2)) this.applyLayers();
    if (!this.modern || !this.modernReady || this.paused) return;
    const now = this.ctx.currentTime;
    if (this.oneHandT > 1.5 && this.song && this.song.stems && now >= this.nextHeart) { this.play('heart', { gain: Math.min(0.9, 0.4 + this.oneHandT * 0.08) }); this.nextHeart = now + (I.lives === 1 ? 0.58 : 0.78); }
    const n = this.ambNodes; if (!n || !this.spatial) return;
    const amb = (name, gain, pan) => { const list = this.mbuf[name]; if (!list || !list.length) return; const src = this.ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)]; src.playbackRate.value = 0.94 + Math.random() * 0.12; const g = this.ctx.createGain(); g.gain.value = gain; const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain(); if (p.pan) p.pan.value = pan; const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(500, 5000 - this.altitude * 70); src.connect(lp); lp.connect(g); g.connect(p); p.connect(this.bus.amb); src.start(); };
    const low = Math.max(0, 1 - this.altitude / 50);
    if ((this.ambT.horn -= dt) <= 0) { this.ambT.horn = 5 + Math.random() * 10; if (low > 0.05) amb('horn', 0.35 * low, Math.random() * 1.6 - 0.8); }
    if ((this.ambT.train -= dt) <= 0) { this.ambT.train = 40 + Math.random() * 40; if (low > 0.2) amb('train', 0.4 * low, Math.random() < 0.5 ? -0.7 : 0.7); }
    if ((this.ambT.gust -= dt) <= 0) { this.ambT.gust = (n.theme === 'tower' ? 5 : 9) + Math.random() * 8; const hi = Math.min(1, this.altitude / 40) * (n.theme === 'tower' ? 1 : 0.6); if (hi > 0.1) amb('gust', 0.6 * hi, Math.random() * 1.2 - 0.6); }
  }
  async suspend() { if (this.ctx && this.ctx.state === 'running') try { await this.ctx.suspend(); } catch (e) { /* 無視 */ } }
  async resume() { if (this.ctx && this.ctx.state !== 'running') try { await this.ctx.resume(); } catch (e) { /* 無視 */ } }

  // 案内音声（読み上げ）。既定はやさしい女性の声を優先。速度は設定で変えられる。読み上げの間は曲を下げる
  say(text, rate = 1.0) {
    if (this.mute.guide || this.mute.master || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = rate; u.volume = this.vol.guide * this.vol.master;
      const vs = speechSynthesis.getVoices().filter((v) => /ja/i.test(v.lang));
      const fem = vs.find((v) => /female|kyoko|nanami|haruka|ayumi|mizuki|o-ren|女性/i.test(v.name)) || vs[0];
      if (fem) u.voice = fem;
      u.onstart = () => { if (this.song) this.duck(0.45, 60); }; u.onend = u.onerror = () => { if (this.song) this.duck(1, 0); };
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* 読み上げが使えない環境 */ }
  }
}
function setPos(p, pos, t) {
  if (p.positionX) { p.positionX.setValueAtTime(pos.x, t); p.positionY.setValueAtTime(pos.y, t); p.positionZ.setValueAtTime(pos.z, t); }
  else p.setPosition(pos.x, pos.y, pos.z);
}
