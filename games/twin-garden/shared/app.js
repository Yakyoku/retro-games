// ツイン・ガーデン — アプリ本体（2D 版・VR 版で共通）。画面遷移・固定 tick・保存・音・一時停止をまとめる。
// 描画（view）と画面表示（ui）はページごとに差し替える。
//   view: { setGame(game), onEvents(events, game), render(game, alpha, dtSec, now) }
//   ui:   { showMenu(def, focus), hideMenu(), hud(game, app), banner(game, app), flash(text) }
import { Game } from './core/game.js';
import { FixedStepper } from './core/stepper.js';
import { STAGES, LESSONS } from './core/stages.js';
import { Input } from './ui/input.js';
import { Store } from './ui/save.js';
import { buildMenu } from './ui/menus.js';
import { Audio, playEvents } from './audio/audio.js';

export class App {
  constructor({ variant, view, ui }) {
    this.variant = variant;
    this.store = new Store(`twin-garden.${variant}.v1`);
    const S = this.store.data.settings;
    this.input = new Input(S.keys);
    this.audio = new Audio();
    this.audio.setVolume({ master: S.master, bgm: S.bgm, sfx: S.sfx, mute: S.mute });
    this.view = view; this.ui = ui;
    this.stepper = new FixedStepper();
    this.game = null;
    this.screen = 'title';   // title | menu | play | pause
    this.menuId = 'title'; this.focus = 0;
    this.inXR = false;
    this.lastT = 0;
    this.listeners = [];
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause('hidden'); else this.wake(); });
    addEventListener('blur', () => this.autoPause('blur'));
    addEventListener('pagehide', () => this.autoPause('hidden'));
  }

  on(f) { this.listeners.push(f); }
  emitChange(what) { for (const f of this.listeners) f(what, this); }

  boot() {
    this.openMenu('title');
    const loop = (now) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  /** VR 側から: XR のアニメーションループに切り替えるときに使う */
  setLoopDriver(fn) {
    cancelAnimationFrame(this.raf);
    if (fn) fn((now, frame) => this.frame(now, frame));
    else { const loop = (now) => { this.frame(now); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  }

  frame(now, xrFrame) {
    const dt = this.lastT ? Math.min(0.25, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    this.input.poll(now);
    if (this.preFrame) this.preFrame(dt, xrFrame);
    for (const cmd of this.input.takeMenu()) this.command(cmd);
    if (this.screen === 'play' && this.game) {
      this.stepper.advance(dt, () => {
        this.game.step(this.input.dir());
        if (this.game.events.length) this.handleEvents(this.game.events);
      });
    }
    if (this.game) this.ui.hud(this.game, this);
    this.view.render(this.game, this.screen === 'play' ? this.stepper.alpha : 1, dt, now, xrFrame);
  }

  handleEvents(ev) {
    playEvents(this.audio, this.game, ev);
    this.view.onEvents(ev, this.game);
    if (this.ui.onEvents) this.ui.onEvents(ev, this.game, this);
    for (const e of ev) {
      if (e.type === 'gameover' || e.type === 'complete') this.finishRun(e.type);
    }
  }

  // ───────── メニュー ─────────
  command(cmd) {
    if (this.screen === 'play') {
      if (cmd === 'pause' || cmd === 'back') this.pause();
      return;
    }
    if (this.capturing) return;
    const def = this.menuDef;
    if (!def) return;
    const n = def.items.length;
    if (cmd === 'up') { this.focus = (this.focus - 1 + n) % n; this.audio.sfx('move'); this.refreshMenu(); }
    else if (cmd === 'down') { this.focus = (this.focus + 1) % n; this.audio.sfx('move'); this.refreshMenu(); }
    else if (cmd === 'left' || cmd === 'right') {
      const it = def.items[this.focus];
      if (it && it.adj) { it.adj(cmd === 'left' ? -1 : 1); this.audio.sfx('move'); this.refreshMenu(); }
    } else if (cmd === 'ok') this.activate(this.focus);
    else if (cmd === 'back' || cmd === 'pause') {
      if (def.back === 'resume') this.resume();
      else if (def.back) { this.audio.sfx('back'); this.openMenu(def.back); }
    }
  }

  activate(i) {
    this.audio.unlock();
    const it = this.menuDef?.items[i];
    if (!it) return;
    this.focus = i;
    this.audio.sfx('ok');
    if (it.act) it.act(); else if (it.adj) { it.adj(1); this.refreshMenu(); }
  }

  openMenu(id) {
    const def = buildMenu(this, id);
    if (!def) return;
    if (id === 'title') this.settingsBack = null;
    this.menuId = id; this.menuDef = def; this.focus = def.focus ?? 0;
    if (this.screen !== 'pause') this.screen = this.game && (this.game.phase === 'gameover' || this.game.phase === 'complete') ? 'menu' : (this.game ? this.screen : 'title');
    if (!this.game) this.screen = 'title';
    if (this.screen === 'play') this.screen = 'pause';
    this.ui.showMenu(def, this.focus, this);
    if (id === 'title' && !this.game && this.audio.ready) this.audio.playSong('title');
  }
  refreshMenu() { if (this.menuDef) { this.menuDef = buildMenu(this, this.menuId); this.ui.showMenu(this.menuDef, this.focus, this); } }

  // ───────── 進行 ─────────
  startGame(difficulty, mode, stage = 0) {
    this.audio.unlock();
    if (!mode) mode = difficulty === 'practice' ? 'lesson' : 'arcade';
    this.lastStart = { difficulty, mode, stage };
    if (mode === 'arcade') { this.store.data.settings.lastDifficulty = difficulty; this.store.save(); }
    this.game = new Game({ difficulty, mode, startStage: stage, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
    this.nextLesson = null;
    this.view.setGame(this.game);
    this.stepper.reset();
    this.input.releaseAll();
    this.screen = 'play';
    this.ui.hideMenu(this);
    this.handleEvents(this.game.events); // 最初の stage イベント
    this.emitChange('start');
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    this.input.releaseAll();
    // 曲は止めて位置を覚える（効果音・メニューの音は鳴らせる）
    this.pausedSong = this.audio.songPos();
    this.audio.stopSong();
    this.settingsBack = 'pause';
    this.openMenu('pause');
    this.audio.sfx('back');
    this.emitChange('pause');
  }

  resume() {
    if (this.screen !== 'pause' || !this.game) return;
    this.screen = 'play';
    this.ui.hideMenu(this);
    this.stepper.reset();
    this.input.releaseAll();
    this.game.latch = [true, true]; // 復帰時に押しっぱなしのキーで勝手に動かない
    this.audio.resume();
    const ps = this.pausedSong;
    if (ps && ['meadow', 'dusk', 'moon', 'bonus', 'power'].includes(ps.name)) this.audio.playSong(ps.name, true, ps.beat);
    this.pausedSong = null;
    this.emitChange('resume');
  }

  /** タブ非表示・フォーカス喪失・VR の追跡喪失: 一時停止し、非表示なら音声全体も止める */
  autoPause(why) {
    if (this.screen === 'play') this.pause();
    if (why === 'hidden') this.audio.pause();
  }
  wake() { this.audio.resume(); }

  toTitle() {
    this.audio.unlock();
    this.audio.resume();
    this.game = null;
    this.view.setGame(null);
    this.screen = 'title';
    this.audio.stopSong();
    this.openMenu('title');
    this.audio.playSong('title');
    this.emitChange('title');
  }

  finishRun(kind) {
    const g = this.game, r = g.result, st = this.store.data;
    this.lastNewRecord = false;
    if (g.mode === 'arcade') {
      if (r.score > st.high[g.diffId]) { st.high[g.diffId] = r.score; this.lastNewRecord = true; }
      st.reached[g.diffId] = Math.max(st.reached[g.diffId], Math.min(STAGES.length, g.stageIndex + (kind === 'complete' ? 0 : 1)));
    } else if (g.mode === 'stagePractice') {
      const k = String(g.startStage + 1);
      if (r.score > (st.practice[k] || 0)) { st.practice[k] = r.score; this.lastNewRecord = true; }
    } else if (g.mode === 'lesson' && kind === 'complete') {
      st.lessonsDone = Math.max(st.lessonsDone, g.stageIndex);
    }
    this.store.save();
    // 練習は 1 課ずつ: 次の課へ進める
    if (g.mode === 'lesson') this.nextLesson = null;
    this.lastResultTitle = kind === 'complete' ? (g.mode === 'arcade' ? '[全|ぜん]12[面|めん]クリア！' : 'クリア！') : 'ゲームオーバー';
    setTimeout(() => {
      if (this.game !== g) return;
      this.screen = 'menu';
      this.openMenu(kind === 'complete' ? 'result' : 'gameover');
      this.emitChange('end');
    }, kind === 'complete' ? 2600 : 1800);
  }

  resultLines() {
    const g = this.game; if (!g || !g.result) return [];
    const r = g.result, st = this.store.data;
    const d = { easy: 'やさしい', normal: '[標準|ひょうじゅん]', hard: '[難|むずか]しい', practice: '[練習|れんしゅう]' }[g.diffId];
    const lines = [`[得点|とくてん] ${r.score}${this.lastNewRecord ? '　★[新記録|しんきろく]' : ''}`];
    if (g.mode === 'arcade') lines.push(`${d}　ハイスコア ${st.high[g.diffId]}　[到達|とうたつ] ${r.stage}[面|めん]`);
    else lines.push(g.mode === 'lesson' ? '[練習|れんしゅう]（[記録|きろく]は[別|べつ]）' : `${g.startStage + 1}[面|めん]の[練習|れんしゅう]（[通常|つうじょう]の[記録|きろく]とは[別|べつ]）`);
    lines.push(`[捕獲|ほかく] ${r.stats.captures}[回|かい]　[最高倍率|さいこうばいりつ] ×${r.stats.bestMult.toFixed(2)}　[宝箱|たからばこ] ${r.stats.chests}　ボーナス ${r.stats.bonuses}`);
    return lines;
  }

  // ───────── 設定 ─────────
  setVol(k, d) {
    const S = this.store.data.settings;
    S[k] = Math.round(Math.min(1, Math.max(0, S[k] + d * 0.1)) * 10) / 10;
    this.audio.setVolume({ [k]: S[k] });
    this.store.save();
  }
  setSetting(k, v) {
    const S = this.store.data.settings;
    S[k] = v;
    if (k === 'mute') this.audio.setVolume({ mute: v });
    this.store.save();
    this.refreshMenu();
    this.emitChange('setting:' + k);
  }
  captureKey(k) {
    this.capturing = k;
    this.refreshMenu();
    this.input.capture = (code) => {
      this.capturing = null;
      if (code) {
        // 同じキーがほかに割り当てられていたら入れ替える
        const keys = this.input.keys;
        for (const [kk, vv] of Object.entries(keys)) if (vv === code && kk !== k) keys[kk] = keys[k];
        keys[k] = code;
        this.store.data.settings.keys = { ...keys };
        this.store.save();
      }
      this.refreshMenu();
    };
  }

  // VR 版が上書きする
  enterVR() {}
  exitVR() {}
}

export { STAGES, LESSONS };
