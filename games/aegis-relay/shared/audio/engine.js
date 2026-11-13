// AEGIS RELAY — 音源（Web Audio）。2D 版・3D 版で同じものを使う。
// ■ モダン音源（初期値）
//   曲: 減算式シンセ・スーパーソー・FM ベル・サブ入りベース・パッド・アルペジオ ＋ 計算で作ったドラム（instruments.js / drums.js）
//   空間: 計算で作った残響（コンボルバー 1 個を共用）、テンポに合ったディレイ、声部ごとの定位、キックに合わせたサイドチェイン（fx.js）
//   効果音: 起動時に波形を計算 → 再生は「音源 → 音量 → 定位」の 3 ノード。発音数の上限・優先度・最短間隔・曲のダッキング（sfx.js）
//   マスター: コンプレッサー → リミッター → ソフトクリップ（出力は必ず ±0.93 以内 → 音割れしない）
// ■ 旧チップ音源（設定「サウンド: クラシック」）: chip.js（矩形波 3 声＋ノイズ。モノラル・エフェクトなし）
// ■ 共通の約束
//   ・発音時刻は AudioContext の時計で先読み予約する → 描画レートやフレーム落ちでテンポが変わらない
//   ・ポーズ・タブ非表示・VR の非表示では ctx.suspend()。再開すると同じ位置から続く（予約を取り直さない → 二重再生しない）
//   ・曲の切り替えは「世代」ごとの出口を短くフェードして切る → 先読み済みの音が残らない
//   ・状況で足す層（合体中・残り 1 機）とコアの曲への切り替えは、小節の頭でそろえる
//   ・AudioWorklet は使わない。録音・音声ファイル・外部 URL も使わない
import { SONGS, CHIP_SONG } from './songs.js';
import { compileSong } from './arrange.js';
import { SFX, CHIP_NAME } from './sfx.js';
import { DRUMS } from './drums.js';
import { SR } from './dsp.js';
import { superSawTable, SAW_BASES, createInstruments } from './instruments.js';
import { reverbIR, createMaster, createReverb, createDelay, pan } from './fx.js';
import { createChip } from './chip.js';
export { compileSong };

// ── 波形の事前計算（ページで 1 回。AudioContext が無くても進められるので、最初の操作の前に少しずつ済ませる）──
const raw = { drums: {}, sfx: {}, saws: [], ir: null };
const jobs = [
  ...Object.keys(DRUMS).map((k) => () => { raw.drums[k] = DRUMS[k](); }),
  ...SAW_BASES.map((b) => () => { raw.saws.push(superSawTable(b)); }),
  () => { raw.ir = reverbIR(); },
  ...Object.keys(SFX).map((k) => () => { raw.sfx[k] = Array.from({ length: SFX[k].vary || 1 }, (_, v) => SFX[k].make(v)); }),
];
let jobI = 0;
export function precompute(maxMs = Infinity) { // 残りがあれば true
  const t0 = Date.now();
  while (jobI < jobs.length) { jobs[jobI++](); if (Date.now() - t0 >= maxMs) break; }
  return jobI < jobs.length;
}

// 声部ごとの音量・定位（S13）・残響とディレイへ送る量・ローパス・サイドチェインの深さ（S14）
const TRACKS = {
  lead:   { vol: 1.25, pan: 0, rev: 0.16, dly: 0.2, lp: 7500 },
  harm:   { vol: 0.8, pan: 0.35, rev: 0.2, dly: 0.1, lp: 5500 },
  bell:   { vol: 0.8, pan: -0.3, rev: 0.35, dly: 0.25 },
  spark:  { vol: 0.6, pan: 0.35, rev: 0.4, dly: 0.3 },
  bass:   { vol: 0.6, pan: 0, lp: 1900, sc: 0.4 },
  pad:    { vol: 0.56, pan: 0, rev: 0.3, lp: 2600, sc: 0.55 },
  arp:    { vol: 0.8, pan: -0.45, rev: 0.15, dly: 0.3, lp: 6000 },
  stab:   { vol: 1.0, pan: 0.45, rev: 0.2, lp: 4500, sc: 0.25 },
  danger: { vol: 1.0, pan: 0.2, rev: 0.1, dly: 0.2, lp: 5000 },
  kick:   { vol: 0.55, pan: 0 },
  snare:  { vol: 0.75, pan: 0, rev: 0.13 },
  hat:    { vol: 1.0, pan: 0.28, rev: 0.03 },
  cym:    { vol: 1.0, pan: -0.25, rev: 0.2 },
  tom:    { vol: 0.5, pan: 0, rev: 0.15 },
};
const DRUM_PAN = { tomH: -0.35, tomM: 0.05, tomL: 0.4, ride: 0.5, clap: 0.1 };
const AHEAD = 0.5;        // 先読みする秒数（画面の処理が一瞬止まっても曲が欠けないよう長め。効果音は先読みしない）
const MAX_SE = 10;        // 効果音の同時発音数の上限（S29）
const LAYER = { dock: 1, danger: 2 };

export function createAudio(opt = {}) {
  let ctx = null, master = null, reverb = null, inst = null, chip = null, timer = null;
  let busMusic = null, duck = null, musicRev = null, busSe = null, busSeWet = null, seRev = null, seOut = null, chipMusic = null, chipSe = null;
  const drumBuf = {}, sfxBuf = {};
  const vol = { master: 0.8, bgm: 0.7, se: 0.8, mute: false };
  let style = 'modern', failed = false;
  let music = null, prev = null;        // 再生中の曲と、小節の頭まで鳴らし終える途中の前の曲
  let cur = null;                       // { name, onEnd }（音源の種類によらない「いまの曲」）
  let chainAt = null;                   // ジングルの終わりにぴったり続けて次の曲を始めるための時刻
  const dying = [];                     // 片づけ待ちの世代 { gen, at }
  const want = { 1: false, 2: false };  // 層の希望（合体中・緊張）
  const voices = [];                    // 鳴っている効果音
  const lastSe = {}, variantI = {};
  const stats = { notes: 0, nodes: 0, se: 0, seDropped: 0, seStolen: 0, songs: 0 };
  const compiled = {};
  const comp = (name) => compiled[name] || (compiled[name] = compileSong(SONGS[name]));
  const offline = !!opt.context;

  // 最初の操作の前から、手のあいた時間に波形を計算しておく
  if (!offline && typeof setTimeout === 'function') { const step = () => { if (precompute(6)) setTimeout(step, 30); }; setTimeout(step, 300); }

  function ensure() {
    if (ctx) return ctx;
    if (failed) return null;
    let c = opt.context;
    if (!c) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; c = new AC({ latencyHint: 'interactive' }); }
    // 配線の途中で失敗したら、音なしで遊べるようにする（半端な状態を残さない）
    try { ctx = c; build(); } catch (e) { ctx = null; failed = true; try { if (!opt.context) c.close(); } catch { /* 済 */ } console.warn('[audio] 初期化に失敗（音なしで続行）', e); return null; }
    return ctx;
  }
  function build() {
    precompute();
    master = createMaster(ctx, !!opt.bypassMaster);
    reverb = createReverb(ctx, master.input, raw.ir);
    // 曲: 世代の出口 → 曲の音量 → ダッキング → マスター。残響へ送る分にも同じ音量を掛ける
    busMusic = ctx.createGain(); duck = ctx.createGain(); musicRev = ctx.createGain();
    busMusic.connect(duck); duck.connect(master.input); musicRev.connect(reverb.input);
    // 効果音: 乾いた音（残響少し）と、ボーナスなどの響かせる音（残響多め）
    seOut = ctx.createGain(); seRev = ctx.createGain(); busSe = ctx.createGain(); busSeWet = ctx.createGain();
    seOut.connect(master.input); seRev.connect(reverb.input);
    busSe.connect(seOut); busSeWet.connect(seOut);
    const s1 = ctx.createGain(), s2 = ctx.createGain(); s1.gain.value = 0.07; s2.gain.value = 0.3; busSe.connect(s1); s1.connect(seRev); busSeWet.connect(s2); s2.connect(seRev);
    // 旧チップ音源はコンプレッサーを通さず、最終段（ソフトクリップ）の手前へ
    chipMusic = ctx.createGain(); chipSe = ctx.createGain(); chipMusic.connect(master.pre); chipSe.connect(master.pre);
    for (const [k, x] of Object.entries(raw.drums)) drumBuf[k] = toBuf(x);
    for (const [k, list] of Object.entries(raw.sfx)) sfxBuf[k] = list.map(toBuf);
    inst = createInstruments(ctx, raw.saws);
    chip = createChip(ctx, chipMusic, chipSe, { offline });
    applyVol();
    if (!offline && !timer) timer = setInterval(pump, 25);
  }
  function toBuf(x) { const b = ctx.createBuffer(1, x.length, SR); b.getChannelData(0).set(x); return b; }
  function applyVol() {
    if (!ctx) return;
    const t = ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.01);
    set(master.out.gain, vol.mute ? 0 : vol.master);
    set(busMusic.gain, vol.bgm); set(musicRev.gain, vol.bgm); set(seOut.gain, vol.se); set(seRev.gain, vol.se);
    set(chipMusic.gain, vol.bgm * 0.85); set(chipSe.gain, vol.se * 0.85); // 旧音源は元の 0.55 倍だとモダンより 10dB 小さいので、少し上げてそろえる
  }
  const running = () => ctx && (offline || ctx.state === 'running');

  // ── 曲の「世代」: 1 回の再生ぶんの配線（声部ごとの入口 → ローパス → サイドチェイン → 定位 → 出口・送り）──
  function makeGen(c) {
    const dry = ctx.createGain(), rev = ctx.createGain(), dly = ctx.createGain();
    dry.connect(busMusic); rev.connect(musicRev);
    const delay = createDelay(ctx, busMusic, c.spb); dly.connect(delay.input);
    const tracks = {}, nodes = [dry, rev, dly];
    const used = new Set(c.events.map((e) => e.tr));
    for (const name of used) {
      const d = { ...TRACKS[name], ...(c.mix[name] || {}) };
      const input = ctx.createGain(); input.gain.value = d.vol; let tail = input; nodes.push(input);
      if (d.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = d.lp; f.Q.value = 0.7; tail.connect(f); tail = f; nodes.push(f); }
      let sc = null; if (d.sc) { sc = ctx.createGain(); tail.connect(sc); tail = sc; nodes.push(sc); }
      const p = pan(ctx, d.pan || 0); tail.connect(p); p.connect(dry); nodes.push(p);
      if (d.rev) { const g = ctx.createGain(); g.gain.value = d.rev; p.connect(g); g.connect(rev); nodes.push(g); }
      if (d.dly) { const g = ctx.createGain(); g.gain.value = d.dly; p.connect(g); g.connect(dly); nodes.push(g); }
      tracks[name] = { input, sc, depth: d.sc || 0 };
    }
    return { dry, rev, dly, tracks, delay, nodes };
  }
  // 世代を at で切る（短いフェード）。先読み済みの音も一緒に消える。残響とディレイの余韻は残り、あとで片づける
  function retire(gen, at, fade = 0.012) {
    const t = Math.max(at, ctx.currentTime);
    for (const g of [gen.dry, gen.rev, gen.dly]) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(1, t); g.gain.linearRampToValueAtTime(0, t + fade); }
    dying.push({ gen, at: t + fade + 5 });
  }
  function sweep() {
    for (let i = dying.length - 1; i >= 0; i--) if (ctx.currentTime > dying[i].at) {
      const { gen } = dying[i]; for (const n of gen.nodes) { try { n.disconnect(); } catch { /* 済 */ } } gen.delay.dispose(); dying.splice(i, 1);
    }
  }

  // ── 予約 ──
  function fire(M, e, at, dur) {
    const tk = M.gen.tracks[e.tr]; if (!tk || (opt.solo && !opt.solo.includes(e.tr))) return; // opt.solo は検証用（声部を単独で録る）
    stats.notes++; opt.onNote?.(e, at, M);
    if (e.k) {
      const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = drumBuf[e.k]; g.gain.value = e.v; s.connect(g);
      if (DRUM_PAN[e.k] && ctx.createStereoPanner) { const p = pan(ctx, DRUM_PAN[e.k]); g.connect(p); p.connect(tk.input); } else g.connect(tk.input);
      s.start(at); stats.nodes++;
      if (e.k === 'kick') for (const t of Object.values(M.gen.tracks)) if (t.sc) { // サイドチェイン: キックの瞬間に沈めて、すぐ戻す
        const p = t.sc.gain; p.setTargetAtTime(1 - t.depth * e.v, Math.max(ctx.currentTime, at - 0.004), 0.004); p.setTargetAtTime(1, at + 0.035, 0.085);
      }
    } else stats.nodes += inst.play(e.inst, tk.input, at, dur, e.m, e.v);
  }
  const layerOn = (M, L, at) => { let on = false; for (const s of M.layers[L]) if (s.t <= at + 1e-6) on = s.on; return on; };
  const baseOf = (M) => (M.loopN === 0 ? M.t0 : M.t0 + M.comp.len + (M.loopN - 1) * (M.comp.len - M.comp.loopAt) - M.comp.loopAt);
  function run(M, until) {
    const c = M.comp, ev = c.events, now = ctx.currentTime;
    for (;;) {
      // ループ k 回目（k≥1）は、ループ位置より後ろを t0 + len + (k-1)(len-loopAt) から鳴らす
      const base = baseOf(M);
      while (M.idx < ev.length) {
        const e = ev[M.idx], at = base + e.t;
        if (M.endAt != null && at >= M.endAt - 1e-4) { M.done = true; return; }
        if (at > until) return;
        M.idx++;
        if (e.L && !layerOn(M, e.L, at)) continue;
        const late = now - at;
        if (late > 0.05 && !(e.d > late + 0.12)) continue; // 間に合わなかった短い音は鳴らさない（長い音は残りを鳴らす）
        fire(M, e, Math.max(at, now), late > 0 ? e.d - late : e.d);
      }
      const endAt = base + c.len;
      if (c.once) {
        if (!M.ended && now >= endAt - 0.12) { // ジングルの終わり: 続きの曲を「ちょうど終わりの時刻」から始められるようにして知らせる
          M.ended = true;
          if (music === M) { music = null; cur = null; dying.push({ gen: M.gen, at: endAt + 4 }); chainAt = endAt; try { M.onEnd?.(); } finally { chainAt = null; } }
        }
        return;
      }
      M.loopN++; M.idx = c.loopIdx;
    }
  }
  let lastPump = 0;
  function pump() {
    if (!ctx) return;
    lastPump = ctx.currentTime;
    sweep();
    if (style === 'chip') { chip.pump(); return; }
    const until = ctx.currentTime + AHEAD;
    if (prev) { run(prev, until); if (prev.done || ctx.currentTime > prev.endAt) prev = null; }
    if (music) run(music, until);
  }

  function nextBar(M, t) { const bar = M.comp.bar; return M.t0 + Math.ceil((t - M.t0) / bar - 1e-9) * bar; }
  // 曲を始める。o.sync: 'bar' = いまの曲の次の小節の頭で切り替える / o.skipIntro: イントロを飛ばしてループの頭から
  function playMusic(name, onEnd, o = {}) {
    if (!SONGS[name] || !ensure()) return;
    if (cur && cur.name === name && !SONGS[name].once) return; // 同じ曲は二重に始めない
    if (style === 'chip') {
      stopMusic(); cur = { name, onEnd }; stats.songs++;
      chip.playMusic(CHIP_SONG[name], () => { cur = null; onEnd?.(); });
      return;
    }
    const c = comp(name); if (c.loopIdx == null) c.loopIdx = c.once ? 0 : Math.max(0, c.events.findIndex((e) => e.t >= c.loopAt - 1e-6));
    let start = ctx.currentTime + 0.06;
    if (chainAt != null) start = Math.max(chainAt, ctx.currentTime + 0.02); // ジングルに続けて（前の曲の余韻は切らない）
    else if (o.sync === 'bar' && music && !music.comp.once) {
      start = nextBar(music, ctx.currentTime + 0.05);
      const old = music; old.endAt = start; prev = old; retire(old.gen, start - 0.006); music = null;
    } else stopMusic();
    const M = { name, comp: c, gen: makeGen(c), t0: start, idx: 0, loopN: 0, onEnd, endAt: null, layers: { 1: [{ t: -Infinity, on: want[1] }], 2: [{ t: -Infinity, on: want[2] }] } };
    if (o.skipIntro && !c.once && c.loopAt > 0) { M.t0 = start - c.len; M.loopN = 1; M.idx = c.loopIdx; }
    music = M; cur = { name, onEnd }; stats.songs++;
    pump();
  }
  function stopMusic(fade = 0.012) {
    cur = null;
    if (!ctx) return;
    if (chip.musicName) chip.stopMusic();
    if (prev) { retire(prev.gen, ctx.currentTime, fade); prev = null; }
    if (music) { retire(music.gen, ctx.currentTime, fade); music = null; }
  }
  // 層の出し入れ（合体中・残り 1 機）。次の小節の頭から効く。全部の層が同じ時間軸なのでずれない
  function setLayers(o) {
    if (ctx && !offline && ctx.currentTime - lastPump > 0.02) pump(); // 毎フレーム呼ばれるので、タイマーが遅れたときの補充も兼ねる
    for (const [k, L] of Object.entries(LAYER)) {
      if (o[k] == null || want[L] === !!o[k]) continue;
      want[L] = !!o[k];
      if (music && ctx) { const list = music.layers[L]; list.push({ t: nextBar(music, ctx.currentTime + AHEAD + 0.03), on: want[L] }); if (list.length > 6) list.splice(0, list.length - 6); }
    }
  }

  // ── 効果音 ──
  // arg: 数値（鎖の枚数 n）または { n, x }。x は盤面の横位置 0〜240 → 左右の定位（S28）
  function se(name, arg) {
    if (!ensure() || !running()) return;
    if (style === 'chip') { const n = name in CHIP_NAME ? CHIP_NAME[name] : name; if (n) chip.se(n, typeof arg === 'object' && arg ? arg.n : arg); return; }
    const d = SFX[name]; if (!d) return;
    const now = ctx.currentTime, a = typeof arg === 'object' && arg ? arg : { n: arg };
    if (lastSe[name] != null && (now - lastSe[name]) * 1000 < d.gap) { stats.seDropped++; return; } // 同じ音の連打を間引く
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
    const steal = (v) => { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.004); try { v.src.stop(now + 0.03); } catch { /* 済 */ } voices.splice(voices.indexOf(v), 1); stats.seStolen++; };
    const same = voices.filter((v) => v.name === name);
    if (same.length >= d.voices) steal(same[0]);
    if (voices.length >= MAX_SE) { // 上限: いちばん優先度の低い（同じなら古い）音を止める。新しい音のほうが低ければ鳴らさない
      let lo = voices[0]; for (const v of voices) if (v.pri < lo.pri) lo = v;
      if (lo.pri > d.pri) { stats.seDropped++; return; }
      steal(lo);
    }
    lastSe[name] = now;
    const list = sfxBuf[name], vi = (variantI[name] = ((variantI[name] ?? -1) + 1 + (list.length > 2 && Math.random() < 0.5 ? 1 : 0)) % list.length);
    const semis = (d.rnd ? (Math.random() * 2 - 1) * d.rnd : 0) + (name === 'chainStep' ? (Math.max(1, Math.min(9, a.n || 1)) - 1) * 2 : 0);
    const src = ctx.createBufferSource(), g = ctx.createGain(), rate = 2 ** (semis / 12);
    src.buffer = list[vi]; src.playbackRate.value = rate;
    g.gain.value = d.gain * (d.rnd ? 0.88 + Math.random() * 0.24 : 1);
    const p = pan(ctx, d.ui || a.x == null ? 0 : (a.x / 240 * 2 - 1) * 0.8);
    src.connect(g); g.connect(p); p.connect(d.wet ? busSeWet : busSe);
    src.start(now);
    voices.push({ name, pri: d.pri, end: now + list[vi].duration / rate, src, g }); stats.se++;
    if (d.duck) { const q = duck.gain; q.cancelScheduledValues(now); q.setTargetAtTime(1 - d.duck[0], now, 0.015); q.setTargetAtTime(1, now + d.duck[1], 0.22); } // 大きな音の間だけ曲を下げる
  }

  function setStyle(s) {
    s = s === 'chip' ? 'chip' : 'modern';
    if (s === style) return;
    if (!ctx) { style = s; return; }
    const keep = cur; stopMusic(0.03); style = s;
    if (keep) playMusic(keep.name, keep.onEnd, { skipIntro: false });
  }

  return {
    unlock() { const c = ensure(); if (c && !offline && c.state !== 'running') c.resume(); return c; },
    get ready() { return !!running(); },
    get ctx() { return ctx; },
    playMusic, stopMusic, se, setLayers, setStyle, pump,
    get style() { return style; },
    get musicName() { return cur?.name || null; },
    setVolumes(v) { Object.assign(vol, v); applyVol(); },
    // 検証・デバッグ用の内部状態
    get stats() { return { ...stats, voices: voices.length, dying: dying.length, loopN: music?.loopN ?? null, layers: { ...want } }; },
    // 検証用: 実際の最終出力（リミッター・全体の音量の後）を seconds 秒ぶん録る。{ sr, l, r, pcm（左右の平均）}
    tap(seconds) {
      if (!ensure()) return Promise.resolve(null);
      return new Promise((res) => {
        const n = Math.round(ctx.sampleRate * seconds), l = new Float32Array(n), r = new Float32Array(n); let i = 0;
        const sp = ctx.createScriptProcessor(4096, 2, 2); master.out.connect(sp); sp.connect(ctx.destination);
        sp.onaudioprocess = (e) => {
          const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.getChannelData(1), k = Math.min(a.length, n - i);
          l.set(a.subarray(0, k), i); r.set(b.subarray(0, k), i); i += k;
          e.outputBuffer.getChannelData(0).fill(0); e.outputBuffer.getChannelData(1).fill(0);
          if (i >= n) { sp.onaudioprocess = null; master.out.disconnect(sp); sp.disconnect(); const pcm = new Float32Array(n); for (let j = 0; j < n; j++) pcm[j] = (l[j] + r[j]) / 2; res({ sr: ctx.sampleRate, l, r, pcm }); }
        };
      });
    },
    suspend() { if (ctx && ctx.state === 'running') return ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') return ctx.resume(); },
  };
}
