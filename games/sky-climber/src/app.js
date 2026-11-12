// Sky Climber VR — 本体。画面遷移（起動→トップ→操作方式・難易度→練習→ビル選択→プレイ→屋上到達→次のビル→4 棟達成）、
// 60Hz 固定のゲーム進行と補間描画、入力の振り分け（VR 直接／VR クラシック／ゲームパッド／キーボード／タッチ）、
// 音と振動、VR 内メニュー、一時停止と安全な復帰、自動画質を扱う。
import * as THREE from 'three';
import { World, QUALITY, QUALITY_ORDER } from './render/world.js';
import { Game, Run } from './core/game.js';
import { BUILDINGS, stageById, WIN } from './core/stages.js';
import { TICK, DIFFICULTY, RULES } from './core/config.js';
import { classicBot } from './core/bot.js';
import { AudioEngine } from './audio/audio.js';
import { CLIMB_SONG, CLEAR_SONG } from './audio/music.js';
import { Store } from './core/save.js';
import { GamepadInput } from './input/gamepad.js';
import { KeyboardInput } from './input/keyboard.js';
import { TouchInput } from './input/touch.js';
import { XRInput } from './input/xr.js';
import { makeRepeat } from './input/dirs.js';
import { VRPanel, WristHUD } from './ui/vrui.js';
import { makeFrameClock } from './frame-clock.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

class App {
  constructor() {
    this.store = new Store();
    this.settings = this.store.settings();
    this.progress = this.store.progress();
    this.audio = new AudioEngine();
    this.applyAudioSettings();
    this.world = new World($('#view'));
    this.pad = new GamepadInput(); this.kb = new KeyboardInput(); this.touch = new TouchInput($('#touch'));
    this.xr = new XRInput(this.world.renderer);
    this.rep = makeRepeat();
    this.clock = makeFrameClock();
    this.screen = 'boot'; this.paused = false; this.overlay = null;
    this.acc = 0; this.game = null; this.run = null; this.vr = false;
    this.prevPose = null; this.curPose = null;
    this.lastInputKind = 'kb';
    this.idle = 0; this.sinceHit = 9; this.ganbare = false;
    this.perf = { frames: [], long: 0, lastAdjust: 0, log: [] };
    this.calib = { seat: 0, headZ: 0, armScale: this.settings.reach };
    this.vrPanel = new VRPanel(0.9, 0.62); this.vrPanel.mesh.visible = false; this.world.camera.add(this.vrPanel.mesh); this.vrPanel.mesh.position.set(0, -0.05, -0.85);
    this.hud = new WristHUD();
    this.rayLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.8, depthTest: false }));
    this.rayLine.renderOrder = 30; this.rayLine.visible = false;
    this.fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fadeMesh.renderOrder = 40; this.fadeMesh.position.z = -0.2; this.world.camera.add(this.fadeMesh);
    this.vignette = this.makeVignette(); this.world.camera.add(this.vignette);
    this.bindDom();
    this.pad.onDisconnect = () => { if (this.screen === 'play' && !this.vr) { this.pause('コントローラーの接続が切れました。つなぎ直すと続けられます。'); } this.toast('ゲームパッドの接続が切れました'); };
    this.pad.onConnect = (g) => { this.toast(`ゲームパッドを認識しました（${this.pad.labels.ok} 決定・${this.pad.labels.back} 戻る・${this.pad.labels.start} 一時停止）`); this.updatePadLabels(); };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.screen === 'play') this.pause('タブが非表示になったので一時停止しました。'); this.audio.suspend(); }
      else this.audio.resume();
    });
    this.xr.onVisibility = (v) => { if (v !== 'visible' && this.screen === 'play') this.pause('ヘッドセットのメニューまたは装着の中断で一時停止しました。'); };
    this.xr.onEnd = () => this.onXREnd();
    addEventListener('resize', () => this.world.resize());
    if (!this.store.ok) setTimeout(() => this.toast(this.store.error, 8000), 1200);
  }

  // ---------- 起動 ----------
  async boot() {
    this.setLoad(0.1, '描画の準備…');
    try { this.world.setQuality(this.pickQuality(false)); }
    catch (e) { this.fail('WebGL2 を初期化できませんでした。ブラウザーのハードウェアアクセラレーションを有効にしてください。', e); return; }
    await new Promise((r) => setTimeout(r, 30));
    this.setLoad(0.35, 'ビルを建てています…');
    // トップページの代表映像: 昼の市街地のビルを主人公が自動で登る
    this.attract = new Game({ stageId: 'b1', noHazards: false, difficulty: 'beginner' });
    this.attractBot = classicBot(this.attract);
    for (let i = 0; i < 60 * 9; i++) this.attract.step({ classic: this.attractBot() });
    await new Promise((r) => setTimeout(r, 30));
    try { this.world.setStage(this.attract); } catch (e) { this.fail('3D の素材を作れませんでした。', e); return; }
    this.setLoad(0.8, '日本語の文字を読み込み中…');
    try { await Promise.race([document.fonts.load('800 32px "Noto Sans JP"'), new Promise((r) => setTimeout(r, 2500))]); await document.fonts.load('500 24px "Noto Sans JP"'); } catch (e) { /* システムの字体で続ける */ }
    const ok = await this.xr.ready;
    $('#btn-vr').disabled = !ok;
    $('#vr-note').textContent = ok ? 'このブラウザーで VR を始められます（Meta Quest Browser 推奨）' : (window.isSecureContext ? 'このブラウザーは WebXR の VR に対応していません。Quest 3 の Meta Quest Browser で開いてください。' : 'HTTPS で開いたときだけ VR を始められます。');
    this.setLoad(1, '');
    this.world.renderer.setAnimationLoop((t, f) => this.loop(t, f));
    this.show('top');
    this.refreshTop();
    window.__sky = this;
  }
  setLoad(p, msg) { $('#load-bar').style.width = Math.round(p * 100) + '%'; $('#load-msg').textContent = msg; }
  fail(msg, e) { console.error(e); $('#load-msg').textContent = msg; $('#load-retry').hidden = false; window.__showError?.(msg, e && e.stack); }
  pickQuality(xr) {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    if (xr) return 'questHigh';
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch) return 'standard';
    const px = screen.width * (window.devicePixelRatio || 1);
    return px >= 2500 ? 'pcHigh' : 'standard';
  }

  // ---------- DOM の画面 ----------
  bindDom() {
    const on = (sel, fn) => $$(sel).forEach((b) => b.addEventListener('click', (e) => { this.audio.unlock(); this.audio.play('uiOk'); fn(e, b); }));
    on('#btn-flat', () => { this.vr = false; this.show('setup'); });
    on('#btn-vr', () => this.enterVR());
    on('#btn-continue', () => this.continueRun());
    on('#btn-settings, .open-settings', () => this.openSettings());
    on('#btn-help, .open-help', () => this.openOverlay('help'));
    on('.close-overlay', () => this.closeOverlay());
    on('#btn-setup-next', () => { this.saveSettings(); this.show('calib'); });
    on('#btn-practice', () => this.startPractice());
    on('#btn-skip-practice', () => this.show('select'));
    on('.back-top', () => this.toTop());
    on('#btn-pause', () => this.pause());
    on('#btn-resume', () => this.resume());
    on('#btn-retry', () => this.retryBuilding());
    on('#btn-next', () => this.nextBuilding());
    on('#btn-over-retry', () => this.retryBuilding(true));
    on('#btn-final-again', () => { this.run = null; this.show('select'); });
    on('#load-retry', () => location.reload());
    // 難易度・操作方式・画質の選択（トップと設定で共通の data-set）
    $$('[data-set]').forEach((el) => {
      const key = el.dataset.set;
      const evt = el.tagName === 'INPUT' && el.type === 'range' ? 'input' : 'change';
      if (el.tagName === 'BUTTON') el.addEventListener('click', () => { this.setSetting(key, el.dataset.val); this.audio.unlock(); this.audio.play('uiMove'); });
      else el.addEventListener(evt, () => { const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; this.setSetting(key, v); });
    });
    $('#hud').addEventListener('pointerdown', () => this.audio.unlock());
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: false, passive: true });
    this.syncSettingsUI();
  }
  setSetting(key, v) {
    const s = this.settings;
    if (key.startsWith('vol.')) { s.vol[key.slice(4)] = v; this.audio.setVolume(key.slice(4), v); }
    else if (key.startsWith('mute.')) { s.mute[key.slice(5)] = v; this.audio.setMute(key.slice(5), v); }
    else { s[key] = ['reach', 'speed', 'pull', 'grabAssist', 'height', 'guideRate'].includes(key) ? +v : v; }
    if (key === 'quality') { const q = this.pickQuality(this.vr); this.world.setQuality(q); if (this.game || this.attract) this.reloadStageVisual(); }
    if (key === 'audioMode') this.audio.setMode(v);
    this.saveSettings(); this.syncSettingsUI();
  }
  saveSettings() { if (!this.store.saveSettings(this.settings)) this.toast(this.store.error); }
  syncSettingsUI() {
    const s = this.settings;
    $$('[data-set]').forEach((el) => {
      const key = el.dataset.set;
      const val = key.startsWith('vol.') ? s.vol[key.slice(4)] : key.startsWith('mute.') ? s.mute[key.slice(5)] : s[key];
      if (el.tagName === 'BUTTON') el.classList.toggle('sel', String(val) === el.dataset.val), el.setAttribute('aria-pressed', String(String(val) === el.dataset.val));
      else if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
      const out = el.parentElement?.querySelector('output'); if (out && el.type === 'range') out.textContent = key.startsWith('vol.') ? Math.round(val * 100) + '%' : key === 'height' ? val + 'cm' : (+val).toFixed(2) + '×';
    });
  }
  applyAudioSettings() { for (const [k, v] of Object.entries(this.settings.vol)) this.audio.vol[k] = v; for (const [k, v] of Object.entries(this.settings.mute)) this.audio.mute[k] = v; this.audio.mode = this.settings.audioMode; }
  show(name) {
    this.screen = name;
    $$('.screen').forEach((el) => el.classList.toggle('show', el.id === 'scr-' + name));
    document.body.dataset.screen = name;
    this.touch.setVisible(name === 'play');
    if (name === 'top') { this.refreshTop(); this.audio.music('title', { loop: false }); }
    if (name === 'select') this.refreshSelect();
    if (name === 'calib') { $('#calib-vr').hidden = !this.vr; $('#calib-flat').hidden = this.vr; }
    if (this.vr) this.drawVRScreen();
    requestAnimationFrame(() => this.focusFirst());
  }
  focusFirst() { const root = this.overlay ? $('#ov-' + this.overlay) : $('#scr-' + this.screen); const f = root?.querySelector('[autofocus]:not([disabled]):not([hidden])') || root?.querySelector('button:not([disabled]):not([hidden])'); if (f && !this.vr) f.focus({ preventScroll: true }); }
  openOverlay(n) { this.overlay = n; $$('.overlay').forEach((o) => o.classList.toggle('show', o.id === 'ov-' + n)); this.focusFirst(); if (this.vr) this.drawVRScreen(); }
  closeOverlay() { const was = this.overlay; this.overlay = null; $$('.overlay').forEach((o) => o.classList.remove('show')); if (was === 'settings' && this.screen === 'play' && this.paused) this.openOverlay('pause'); else this.focusFirst(); if (this.vr) this.drawVRScreen(); }
  openSettings() { this.syncSettingsUI(); this.openOverlay('settings'); }
  toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms); }
  updatePadLabels() { const l = this.pad.labels; $$('.pad-ok').forEach((e) => (e.textContent = l.ok)); $$('.pad-back').forEach((e) => (e.textContent = l.back)); $$('.pad-start').forEach((e) => (e.textContent = l.start)); }
  refreshTop() {
    const r = this.progress.run;
    $('#btn-continue').hidden = !r;
    if (r) $('#btn-continue').querySelector('small').textContent = `${BUILDINGS[r.index]?.ja ?? ''}から・${r.score.toLocaleString()} 点・残り ${r.lives}`;
    const best = this.store.allBest(), rows = Object.entries(best).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $('#best-list').innerHTML = rows.length ? rows.map(([k, v]) => { const [d, c] = k.split('|'); return `<li><b>${v.toLocaleString()}</b> ${DIFFICULTY[d]?.ja ?? d}・${controlJa(c)}</li>`; }).join('') : '<li>まだ記録がありません</li>';
  }
  refreshSelect() {
    const list = $('#bld-list'); list.innerHTML = '';
    BUILDINGS.forEach((b, i) => {
      const unlocked = i === 0 || this.progress.cleared[BUILDINGS[i - 1].id] || DEBUG;
      const el = document.createElement('button'); el.className = 'bld t-' + b.theme; el.disabled = !unlocked; el.dataset.idx = i;
      el.innerHTML = `<span class="no">${i + 1}</span><strong>${b.ja}</strong><em>${b.en}</em><span class="d">${b.desc}</span><span class="h">${b.floors} 階・約 ${Math.round(b.floors * 2.6)}m${this.progress.cleared[b.id] ? '・クリア済み' : ''}</span>${unlocked ? '' : '<span class="lock">前のビルをクリアすると登れます</span>'}`;
      el.addEventListener('click', () => { this.audio.unlock(); this.audio.play('uiOk'); this.startRun(i); });
      list.appendChild(el);
    });
  }

  // ---------- 進行 ----------
  controlKind() { return this.vr ? (this.settings.vrControl === 'direct' ? 'vr-direct' : 'vr-classic') : this.lastInputKind === 'pad' ? 'flat-pad' : this.lastInputKind === 'touch' ? 'flat-touch' : 'flat-kb'; }
  newGame(stageId, run) {
    const s = this.settings, direct = this.vr && s.vrControl === 'direct';
    const g = new Game({ stageId, difficulty: s.difficulty, control: direct ? 'direct' : 'classic', run, reachMul: s.reach, speedMul: s.speed, pull: s.pull, grabAssist: s.grabAssist, gripMode: s.gripMode });
    if (g.solver) g.solver.offset.z = 0.42 - this.calib.headZ;
    return g;
  }
  startPractice() { this.run = null; this.beginGame(this.newGame('practice', { score: 0, lives: RULES.lives }), true); }
  startRun(i) { this.run = new Run({ difficulty: this.settings.difficulty, control: this.controlKind(), startIndex: i }); this.beginGame(this.newGame(this.run.stageId, this.run)); }
  continueRun() {
    const r = this.progress.run; if (!r) return;
    this.settings.difficulty = r.difficulty;
    this.run = new Run({ difficulty: r.difficulty, control: r.control, startIndex: r.index, score: r.score, lives: r.lives });
    if (this.vr) this.beginGame(this.newGame(this.run.stageId, this.run)); else { this.show('select'); this.toast(`続きから: ${BUILDINGS[r.index].ja}。カードを選んでください`); }
  }
  beginGame(g, practice = false) {
    this.game = g; this.practice = practice; this.attract = null;
    this.reloadStageVisual();
    this.prevPose = this.capture(); this.curPose = this.capture();
    this.acc = 0; this.paused = false; this.sinceHit = 9; this.idle = 0; this.ganbare = false; this.resumeGuard = 0;
    this.world.updateFlatCamera(0, g.climber.body, { snap: true });
    this.show('play'); this.closeOverlay();
    this.audio.stopMusic(); this.audio.music('start', { loop: false });
    this.startT = performance.now(); this.songT = 1.7;
    this.audio.startAmbient(g.def.theme);
    $('#hud-stage').textContent = g.def.ja;
    this.banner(practice ? '練習壁' : g.def.ja, practice ? '左右の手を交互に。窓と落下物を体験しよう' : 'スタート！');
    if (practice) this.audio.say(this.vr && this.settings.vrControl === 'direct' ? '窓枠に手を近づけて、グリップを握ってつかみます。つかんだ手を下へ引くと体が上がります。' : '左右の手を交互に上へ伸ばして登ります。片手は必ず窓枠をつかんでおきましょう。', this.settings.guideRate);
    if (this.vr) this.positionRigForStart();
  }
  reloadStageVisual() { this.world.setQuality(this.pickQuality(this.vr)); this.world.setStage(this.game || this.attract); if (this.vr) this.attachVRBits(); }
  retryBuilding(fromOver = false) {
    const id = this.game.def.id;
    if (this.practice) return this.startPractice();
    if (fromOver || !this.run) this.run = new Run({ difficulty: this.settings.difficulty, control: this.controlKind(), startIndex: BUILDINGS.findIndex((b) => b.id === id) });
    else { this.run.lives = Math.max(this.run.lives, 1); }
    this.beginGame(this.newGame(id, this.run));
  }
  nextBuilding() {
    if (this.practice || !this.run) return this.show('select');
    if (this.run.done) return this.show('final');
    this.beginGame(this.newGame(this.run.stageId, this.run));
  }
  toTop() {
    this.paused = false; this.closeOverlay(); this.game = null; this.audio.stopAmbient();
    this.attract = new Game({ stageId: 'b1', difficulty: 'beginner' }); this.attractBot = classicBot(this.attract);
    for (let i = 0; i < 60 * 9; i++) this.attract.step({ classic: this.attractBot() });
    this.reloadStageVisual();
    this.show('top');
  }
  pause(msg) {
    if (this.screen !== 'play' || this.paused) return;
    if (['clear', 'over'].includes(this.game?.state)) return;
    this.paused = true; $('#pause-msg').textContent = msg || '';
    this.openOverlay('pause'); this.audio.play('uiBack');
    if (this.audio.song) this.audio.song.g.gain.value = 0.35;
  }
  resume() {
    if (!this.paused) return;
    this.paused = false; this.closeOverlay(); this.clock = makeFrameClock(); this.acc = 0;
    this.resumeGuard = 1.2; // 復帰直後の 1.2 秒は、握り直さなくても保持を外さない（直後の落下を防ぐ）
    if (this.audio.song) this.audio.song.g.gain.value = 1;
    this.banner('再開', '');
  }
  onClear() {
    const g = this.game;
    this.audio.stopMusic(0.05); this.audio.music(CLEAR_SONG[g.def.id], { loop: false });
    this.audio.play('yatta');
    setTimeout(() => {
      if (this.game !== g) return;
      if (this.practice) { this.fillResult(g, true); this.show('result'); return; }
      this.progress.cleared[g.def.id] = true;
      this.run.finishBuilding(g);
      if (this.run.done) { this.progress.run = null; this.fillFinal(); this.store.submitBest(this.run.difficulty, this.run.control, this.run.score) && (this.newBest = true); this.store.saveProgress(this.progress); this.audio.music('allclear', { loop: false }); this.show('final'); }
      else { this.progress.run = { index: this.run.index, score: this.run.score, lives: this.run.lives, difficulty: this.run.difficulty, control: this.run.control }; this.store.saveProgress(this.progress); this.fillResult(g, false); this.show('result'); }
    }, 3600);
  }
  onGameOver() {
    const g = this.game;
    this.audio.stopMusic(0.05); this.audio.music('gameover', { loop: false });
    const isNew = this.run ? this.store.submitBest(this.run.difficulty, this.run.control, this.run.score) : false;
    this.progress.run = null; this.store.saveProgress(this.progress);
    setTimeout(() => { if (this.game !== g) return; $('#over-score').textContent = (this.run?.score ?? 0).toLocaleString(); $('#over-best').textContent = isNew ? '自己ベスト更新！' : `自己ベスト ${this.store.best(this.run?.difficulty, this.run?.control).toLocaleString()} 点`; $('#over-height').textContent = `${g.maxMeters}m（${g.def.ja}）`; this.show('over'); }, 2200);
  }
  fillResult(g, practice) {
    $('#res-title').textContent = practice ? '練習完了！' : `${g.def.ja} 屋上到達！`;
    $('#res-stats').innerHTML = `<li>到達 <b>${g.maxMeters}m</b></li><li>時間 <b>${fmtTime(g.time)}</b></li><li>落下 <b>${g.falls}</b> 回・命中 <b>${g.hits}</b> 回</li><li>得点 <b>${g.run.score.toLocaleString()}</b>（クリア +${RULES.clearBonus}）</li>`;
    $('#btn-next').textContent = practice ? 'ビル選択へ' : `次のビル: ${BUILDINGS[this.run.index]?.ja ?? ''}`;
  }
  fillFinal() {
    $('#fin-score').textContent = this.run.score.toLocaleString();
    $('#fin-list').innerHTML = this.run.results.map((r) => `<li>${stageById(r.id).ja}: ${r.meters}m・${fmtTime(r.time)}・落下 ${r.falls}</li>`).join('');
    $('#fin-best').textContent = this.newBest ? '自己ベスト更新！' : `自己ベスト ${this.store.best(this.run.difficulty, this.run.control).toLocaleString()} 点（${DIFFICULTY[this.run.difficulty].ja}・${controlJa(this.run.control)}）`;
  }
  banner(a, b) { const el = $('#banner'); el.querySelector('b').textContent = a; el.querySelector('span').textContent = b; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); this.vrBanner = { a, b, t: 2.2 }; this.vrBannerDrawn = false; }

  // ---------- 1 フレーム ----------
  loop(t, frame) {
    const dt = this.clock(t);
    this.trackPerf(dt);
    const pad = this.pad.poll(), kb = this.kb.poll(), tc = this.touch.poll();
    if (pad.connected && (pad.L || pad.R || Object.values(pad.edge).some(Boolean))) this.lastInputKind = 'pad';
    else if (kb.any) this.lastInputKind = 'kb';
    else if (tc.L || tc.R) this.lastInputKind = 'touch';
    const xi = this.vr ? this.xr.poll() : null; this.lastXI = xi;
    this.handleUIInput(dt, pad, kb, xi);
    if (kb.edge.debug) $('#debug').hidden = !$('#debug').hidden;
    const g = this.game;
    if (g && this.screen === 'play') {
      const trackingLost = this.vr && (!xi?.head || xi.head.emulated);
      if (!this.paused && !trackingLost) {
        this.acc = Math.min(this.acc + dt, 0.25);
        if (this.songT > 0) { this.songT -= dt; if (this.songT <= 0) this.audio.music(this.practice ? 'practice' : CLIMB_SONG[g.def.theme], { loop: true }); }
        while (this.acc >= TICK) {
          this.acc -= TICK;
          this.prevPose = this.curPose;
          g.step(this.buildInput(pad, kb, tc, xi));
          this.curPose = this.capture();
          this.handleEvents(g.takeEvents());
          this.resumeGuard = Math.max(0, this.resumeGuard - TICK);
        }
        this.sinceHit += dt;
        const moving = (pad.L || pad.R || kb.L || kb.R || tc.L || tc.R || this.vrMoving);
        this.idle = moving ? 0 : this.idle + dt;
        if (this.idle > 6 && !this.ganbare && g.state === 'play' && g.climber.heldCount() === 2) { this.audio.play('ganbare'); this.ganbare = true; }
        if (moving) this.ganbare = false;
      } else if (trackingLost && !this.paused) { this.toastOnce('追跡が途切れています。周りを明るくするか、コントローラーを視界に戻してください', 'track'); }
      this.updateHUD(g);
    } else if (this.attract) {
      // トップの代表映像: 自動で登り、屋上に着いたら下からやり直す
      this.acc = Math.min(this.acc + dt, 0.25);
      while (this.acc >= TICK) { this.acc -= TICK; this.prevPose = this.curPose || this.capture(this.attract); this.attract.step({ classic: this.attractBot() }); this.curPose = this.capture(this.attract); this.attract.takeEvents(); }
      if (this.attract.state === 'clear' || this.attract.time > 240) { this.attract = new Game({ stageId: 'b1', difficulty: 'beginner' }); this.attractBot = classicBot(this.attract); this.world.game = this.attract; this.prevPose = this.curPose = null; }
    }
    const G = g || this.attract;
    if (G && this.curPose) {
      const a = Math.max(0, Math.min(1, this.acc / TICK));
      const interp = lerpPose(this.prevPose || this.curPose, this.curPose, a);
      const view = { mode: this.vr ? 'xr' : 'flat', interp, sinceHit: this.sinceHit, idle: this.idle, markers: this.settings.markers && g ? this.markersFor(G, interp, xi) : [] };
      this.world.update(dt, G, view);
      if (this.vr) this.updateVR(dt, G, interp, xi);
      else {
        // トップ等の画面: 主人公を画面の右寄りに置き、下から見上げてビルの高さを見せる
        const menu = this.screen !== 'play';
        const off = menu ? V(-1.4 + Math.sin(t / 7000) * 0.5, -1.3, 5.2) : undefined, lo = menu ? V(-2.3, 1.3, 0) : undefined;
        this.world.updateFlatCamera(dt, interp.body, { offset: off, lookOffset: lo });
      }
      this.updateFade(dt, G);
    }
    this.world.render();
    if (DEBUG) this.drawDebug(dt);
  }
  capture(g = this.game) { const c = g.climber; return { body: { ...c.body }, hands: { L: { x: c.hands.L.x, y: c.hands.L.y }, R: { x: c.hands.R.x, y: c.hands.R.y } } }; }
  buildInput(pad, kb, tc, xi) {
    const g = this.game;
    if (g.control === 'direct') {
      const s = this.settings, seat = this.calib.seat;
      const head = xi?.head ? { x: xi.head.x, y: xi.head.y + seat, z: xi.head.z } : { x: 0, y: 1.6, z: 0 };
      const ctrl = {};
      this.vrMoving = false;
      for (const side of ['L', 'R']) {
        const c = xi?.[side];
        if (!c || c.x == null) { ctrl[side] = { valid: false }; continue; }
        // 到達距離の補助: 肩からの距離を伸ばす（腕の長さの設定）
        const sh = { x: head.x + (side === 'L' ? -0.18 : 0.18), y: head.y - 0.25, z: head.z + 0.05 };
        const k = s.reach;
        const p = { x: sh.x + (c.x - sh.x) * k, y: sh.y + (c.y + seat - sh.y) * k, z: sh.z + (c.z - sh.z) * k };
        let grip = s.gripMode === 'toggle' ? c.grip : c.grip;
        if (this.resumeGuard > 0 && g.solver.hands[side].held) grip = true;
        ctrl[side] = { ...p, valid: c.valid, grip };
        if (c.grip) this.vrMoving = true;
      }
      return { head, ctrl };
    }
    const fromXR = (side) => { const c = xi?.[side]; if (!c) return null; const m = Math.hypot(c.stick.x, c.stick.y); if (m < 0.5) return null; const a = Math.round(Math.atan2(c.stick.y, c.stick.x) / (Math.PI / 4)) * (Math.PI / 4); return { x: Math.cos(a), y: Math.sin(a) }; };
    // クラシック: どの入力機器でも「左の操作＝左手、右の操作＝右手」。同じ手に複数の入力があれば最初の 1 つだけ（二重に効かない）
    const L = (this.vr && fromXR('L')) || pad.L || kb.L || tc.L || null;
    const R = (this.vr && fromXR('R')) || pad.R || kb.R || tc.R || null;
    this.vrMoving = !!(L || R);
    return { classic: { L, R } };
  }
  handleEvents(evs) {
    const g = this.game, A = this.audio, b = g.b;
    const wpos = (i) => { const w = b.windows[i]; return { x: w.x, y: w.y + WIN.y0 + 0.7, z: 0 }; };
    for (const e of evs) {
      switch (e.type) {
        case 'reach': A.play('reach', { pos: handPos(g, e.side), gain: 0.7 }); break;
        case 'grab': A.play('grab', { pos: handPos(g, e.side) }); this.haptic(e.side, 0.35, 30); if (Math.random() < 0.12 && g.climber.hands[e.side].y > 3) A.play('yoisho', { minGap: 3 }); break;
        case 'release': if (e.reason === 'window') { A.play('itte'); this.haptic(e.side, 0.8, 80); } break;
        case 'windowWarn': A.play('windowWarn', { pos: wpos(e.win), warn: true, minGap: 0.2 }); break;
        case 'windowClose': A.play('windowClose', { pos: wpos(e.win), gain: 0.9 }); break;
        case 'windowOpen': A.play('windowOpen', { pos: wpos(e.win), gain: 0.5 }); break;
        case 'dropWarn': A.play('kora', { pos: { x: e.x, y: e.y, z: 0.1 }, warn: true, minGap: 0.5 }); break;
        case 'dropFall': A.play('hoi', { pos: { x: e.x, y: e.y, z: 0.1 } }); A.play('dropFall', { pos: { x: e.x, y: e.y, z: 0.3 }, warn: true }); break;
        case 'dropBreak': A.play('dropBreak', { pos: { x: e.x, y: e.y, z: 0.3 } }); this.world.burst(e.x, e.y, e.item); break;
        case 'birdWarn': A.play('birdCall', { pos: { x: e.x, y: e.y, z: 0.4 }, warn: true }); A.sting?.('bird'); break;
        case 'birdFly': A.play('flap', { pos: { x: e.x, y: e.y, z: 0.4 } }); break;
        case 'zoneWarn': A.play('buzz', { pos: { x: e.x, y: e.y, z: 0.2 }, warn: true }); break;
        case 'zoneOn': A.play('zap', { pos: { x: e.x, y: e.y, z: 0.2 } }); break;
        case 'hit': A.play('hit'); A.play(e.kind === 'bird' ? 'wa' : 'itte', { minGap: 0.3 }); this.sinceHit = 0; if (e.side) this.haptic(e.side, 1, 120); this.world.burst(e.x, e.y, e.kind === 'neon' ? 'spark' : 'glass'); if (!this.vr) this.pad.rumble(120, 0.8); break;
        case 'combo': A.play(e.n >= 6 ? 'combo3' : e.n >= 4 ? 'combo2' : 'combo1'); this.popCombo(e); break;
        case 'grace': A.play('grace'); break;
        case 'fall': A.play('fall'); A.play('are', { minGap: 0.5 }); if (!this.vr) this.pad.rumble(300, 1); this.haptic('L', 0.6, 200); this.haptic('R', 0.6, 200); break;
        case 'respawn': A.play('respawn'); this.banner(e.ledge ? '安全区画から再開' : '最初から再開', this.practice ? '練習は何度でも' : `残り ${g.run.lives}`); if (this.vr) this.positionRigForStart(); break;
        case 'mantle': A.play('yoisho'); break;
        case 'clear': this.banner('屋上到達！', `+${RULES.clearBonus} 点`); this.onClear(); break;
        case 'gameover': this.banner('ゲームオーバー', ''); this.onGameOver(); break;
        case 'meter': if (e.m % 10 === 0) A.play('floor'); break;
      }
    }
    if (this.vr) this.audio.updateAmbient(g.climber.body.y); else this.audio.updateAmbient(g.climber.body.y);
  }
  haptic(side, i, ms) { if (this.vr) this.xr.pulse(side, i, ms); }
  toastOnce(msg, key) { if (this.toasted === key) return; this.toasted = key; this.toast(msg); setTimeout(() => { if (this.toasted === key) this.toasted = null; }, 6000); }
  popCombo(e) { const el = $('#combo-pop'); el.textContent = `コンボ ×${e.n}  +${e.pts}`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  updateHUD(g) {
    const h = Math.max(0, Math.floor(g.climber.body.y - 1.45));
    $('#hud-height').textContent = `${h}m / ${Math.round(g.top)}m`;
    $('#hud-score').textContent = g.run.score.toLocaleString();
    $('#hud-lives').textContent = this.practice ? '∞' : '♥'.repeat(Math.max(0, g.run.lives));
    $('#hud-combo').textContent = g.combo >= 2 ? `×${g.combo}` : '';
    $('#hud-prog').style.height = Math.min(100, (g.climber.body.y / (g.top + 1.45)) * 100) + '%';
  }
  // 保持点の目印: 手の近く（1.2m 以内）の、つかめる保持点
  markersFor(g, P, xi) {
    const out = [], c = g.climber, seen = new Set();
    const targets = new Set(['L', 'R'].map((s) => c.hands[s].reach?.to).filter((v) => v != null));
    for (const h of c.index.near(P.body.x, P.body.y + 0.3, 1.25)) {
      if (out.length >= 48) break;
      const avail = g.hz.holdAvailable(h); const w = h.win >= 0 ? g.hz.win[h.win] : null;
      const closing = w && w.active && w.state === 'closing';
      if (!avail) continue;
      const d = Math.hypot(h.x - P.body.x, h.y - P.body.y - 0.3);
      out.push({ x: h.x, y: h.y, state: targets.has(h.id) ? 'target' : closing ? 'closing' : 'ok', a: Math.max(0.15, 1 - d / 1.3) * 0.75 });
      seen.add(h.id);
    }
    if (this.vr && g.control === 'direct') for (const s of ['L', 'R']) { const k = this.lastCtrlWorld?.[s]; if (!k) continue; const hd = g.findGrab(k); if (hd && !g.solver.hands[s].held) out.push({ x: hd.x, y: hd.y, state: 'grab', a: 1 }); }
    return out;
  }

  // ---------- 落下・壁への接近の暗転、ビネット ----------
  updateFade(dt, g) {
    let target = 0;
    if (g.state === 'fall') target = this.settings.fallFx ? Math.min(1, g.stateT / RULES.fallAnim) * 0.95 : 0.95;
    if (g.state === 'respawn') target = 1 - Math.min(1, g.stateT / RULES.fadeTime);
    if (this.vr && this.headWallFade) target = Math.max(target, this.headWallFade);
    if (this.vr && this.paused) target = Math.max(target, 0.55);
    this.world.fade += (target - this.world.fade) * (1 - Math.exp(-dt * 12));
    this.fadeMesh.material.opacity = this.world.fade; this.fadeMesh.visible = this.world.fade > 0.005;
    $('#fade').style.opacity = this.vr ? 0 : this.world.fade;
    // ビネット（VR で身体が動くときだけ視野の外側を暗く）
    if (this.vignette) { const mv = this.vr && this.settings.vignette ? Math.min(1, (this.rigSpeed || 0) / 1.2) : 0; this.vignette.material.uniforms.uAmt.value += (mv - this.vignette.material.uniforms.uAmt.value) * (1 - Math.exp(-dt * 8)); this.vignette.visible = this.vignette.material.uniforms.uAmt.value > 0.01; }
  }
  makeVignette() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { uAmt: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uAmt; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(0.55, 1.05, d) * uAmt * 0.85); }' }));
    m.position.z = -0.25; m.renderOrder = 35; m.visible = false; return m;
  }

  // ---------- VR ----------
  async enterVR() {
    try {
      await this.audio.unlock();
      this.vr = true;
      this.world.setQuality(this.pickQuality(true));
      this.world.renderer.xr.setFramebufferScaleFactor(this.world.quality.xrScale);
      await this.xr.start();
      const fv = this.world.quality.foveation; try { this.world.renderer.xr.setFoveation(fv); } catch (e) { /* 非対応 */ }
      this.audio.setMode(this.settings.audioMode);
      this.attachVRBits();
      this.world.scene.add(this.rayLine);
      this.vrScreen = 'vr-setup';
      if (this.screen === 'play' && this.game) { this.positionRigForStart(); this.pause('VR を開始しました。'); }
      else this.show('setup');
      this.perf.xrRate = this.xr.rate; this.perf.xrRates = this.xr.rates;
      this.toast(`VR 開始（${this.xr.rate ? this.xr.rate + 'Hz' : 'リフレッシュレート不明'}）`);
    } catch (e) { this.vr = false; this.toast('VR を開始できませんでした: ' + (e.message || e), 6000); console.error(e); }
  }
  onXREnd() {
    this.vr = false; this.rayLine.visible = false; this.vrPanel.mesh.visible = false;
    this.world.rig.position.set(0, 0, 0); this.world.camera.position.set(0, 2, 4); this.world.resize();
    if (this.screen === 'play') this.pause('VR を終了しました。通常 3D で続けるか、もう一度 VR を始められます。');
    this.audio.resume();
  }
  attachVRBits() {
    if (!this.world.fpHands) return;
    this.world.stageRoot.add(this.hud.mesh);
  }
  positionRigForStart() {
    const g = this.game; if (!g) return;
    const xi = this.xr.poll(); const head = xi.head || { x: 0, y: 1.6, z: 0 };
    if (g.solver) { g.solver.offset.z = 0.42 - head.z; this.calib.headZ = head.z; g.solver.offset.x = g.climber.body.x - head.x; }
  }
  updateVR(dt, g, P, xi) {
    const rig = this.world.rig, seat = this.calib.seat;
    let rx, ry, rz;
    if (g.solver) { rx = g.solver.offset.x; ry = g.solver.offset.y + seat; rz = g.solver.offset.z; }
    else { const head = xi?.head || { x: 0, y: 1.6, z: 0 }; rx = P.body.x - head.x; ry = P.body.y + 0.2 - head.y; rz = 0.42 - (this.calib.headZ || head.z); }
    const prev = rig.position.clone();
    if (this.screen !== 'play') { rx = rig.position.x; ry = this.game ? ry : 0; rz = this.game ? rz : 4.5; if (!this.game) { rx = 1.5; ry = 6; } }
    rig.position.set(rx, ry, rz);
    this.rigSpeed = prev.distanceTo(rig.position) / Math.max(dt, 1e-3);
    // 頭が壁に近すぎる → 暗転（頭の姿勢は上書きしない）
    const headW = xi?.head ? V(xi.head.x + rx, xi.head.y + ry, xi.head.z + rz) : null;
    this.headWallFade = headW && this.game ? Math.max(0, Math.min(1, (0.14 - headW.z) / 0.08)) : 0;
    if (headW) this.audio.setListener(headW, V(0, 0, -1).applyQuaternion(xi.head.q), V(0, 1, 0).applyQuaternion(xi.head.q));
    // 一人称の手
    this.lastCtrlWorld = {};
    const fp = this.world.fpHands;
    for (const s of ['L', 'R']) {
      const c = xi?.[s];
      const held = g.climber.hands[s].hold != null ? g.b.holds[g.climber.hands[s].hold] : null;
      if (!c || c.x == null) { fp.hands[s].g.visible = !!held; if (held) fp.set(s, V(held.x, held.y - 0.06, 0.07), new THREE.Quaternion(), 0.9, V(held.x, held.y - 0.06, 0.07)); continue; }
      fp.hands[s].g.visible = true;
      const k = this.settings.reach, head = xi.head || { x: 0, y: 1.6, z: 0 };
      const sh = { x: head.x + (s === 'L' ? -0.18 : 0.18), y: head.y - 0.25, z: head.z + 0.05 };
      const local = V(sh.x + (c.x - sh.x) * k, sh.y + (c.y - sh.y) * k, sh.z + (c.z - sh.z) * k);
      const world = local.clone().add(V(rx, ry, rz));
      this.lastCtrlWorld[s] = { x: world.x, y: world.y, z: world.z };
      const curl = held ? 0.9 : c.grip ? 0.75 : c.trigger ? 0.45 : 0.15;
      fp.set(s, world, c.q, curl, held ? V(held.x, held.y - 0.06, 0.07) : null);
    }
    // 手首の HUD（左手の甲）
    const lh = fp.hands.L.hand.group;
    this.hud.mesh.visible = this.screen === 'play' && fp.hands.L.g.visible;
    if (this.hud.mesh.visible) {
      this.hud.mesh.position.copy(lh.position).add(V(0, -0.02, 0.06).applyQuaternion(lh.quaternion));
      if (headW) this.hud.mesh.lookAt(headW);
      this.hud.draw({ height: Math.max(0, Math.floor(g.climber.body.y - 1.45)), score: g.run.score, lives: this.practice ? 9 : g.run.lives, combo: g.combo, label: g.def.ja });
    }
    // VR 内メニュー: 光線とトリガー
    const menu = this.vrMenuActive();
    this.vrPanel.mesh.visible = menu || (this.vrBanner && this.vrBanner.t > 0);
    if (this.vrBanner && this.vrBanner.t > 0 && !menu) { this.vrBanner.t -= dt; if (!this.vrBannerDrawn) { this.vrPanel.draw({ title: this.vrBanner.a, sub: this.vrBanner.b }); this.vrBannerDrawn = true; } if (this.vrBanner.t <= 0) { this.vrBannerDrawn = false; if (!menu) this.vrPanel.mesh.visible = false; } }
    this.rayLine.visible = menu;
    if (menu && xi) {
      const src = (xi.R && xi.R.ray) ? xi.R : xi.L;
      if (src?.ray) {
        const o = src.ray.origin.clone().add(V(rx, ry, rz)), d = V(0, 0, -1).applyQuaternion(src.ray.q);
        const h = this.vrPanel.hit(o, d);
        this.vrPanel.setHover(h.index);
        this.rayLine.position.copy(o); this.rayLine.quaternion.copy(src.ray.q); this.rayLine.scale.setScalar(h.point ? h.point.distanceTo(o) : 2);
        const pressed = (xi.R?.edge.trigger) || (xi.L?.edge.trigger) || (xi.R?.edge.a);
        if (pressed && h.index >= 0) { this.audio.play('uiOk'); this.vrAction(this.vrPanel.items[h.index].id); }
      }
    }
    // 一時停止: B/Y ボタン
    if (this.screen === 'play' && !this.paused && (xi?.L?.edge.b || xi?.R?.edge.b)) this.pause();
  }
  vrMenuActive() { return this.vr && (this.screen !== 'play' || this.paused || this.overlay); }
  // VR 内の画面（DOM の画面と同じ遷移を、板の上のボタンで）
  drawVRScreen() {
    if (!this.vr) return;
    if (this.screen === 'play' && !this.paused && !this.overlay) { this.vrBannerDrawn = false; return; } // プレイ中はメニューを描かない（バナーだけ）
    this.vrBanner = null;
    const s = this.settings, P = this.vrPanel;
    const diff = Object.values(DIFFICULTY).map((d) => ({ id: 'diff:' + d.id, label: d.ja, sel: s.difficulty === d.id }));
    if (this.paused || this.overlay === 'pause') return P.draw({ title: '一時停止', sub: $('#pause-msg').textContent || '', buttons: [{ id: 'resume', label: '再開' }, { id: 'retry', label: 'このビルを最初から' }, { id: 'vrset', label: '設定' }, { id: 'top', label: 'タイトルへ' }], cols: 2 });
    if (this.overlay === 'settings') return P.draw({ title: '設定', sub: 'VR の操作と快適さ',
      buttons: [{ id: 'ctl', label: s.vrControl === 'direct' ? '操作: 直接つかむ' : '操作: クラシック', sub: 'スティックで手を動かす方式と切替' }, { id: 'grip', label: s.gripMode === 'hold' ? '保持: 握り続ける' : '保持: 押して切替' },
        { id: 'stance', label: s.stance === 'stand' ? '姿勢: 立って' : '姿勢: 座って' }, { id: 'reach', label: `到達距離 ${s.reach.toFixed(2)}×`, sub: '押すたびに 1.0→1.15→1.3' },
        { id: 'vig', label: s.vignette ? 'ビネット: 入' : 'ビネット: 切' }, { id: 'amode', label: s.audioMode === 'vr' ? '音響: VR' : '音響: クラシック' },
        { id: 'qual', label: `画質: ${s.quality === 'auto' ? '自動' : QUALITY[s.quality].ja}` }, { id: 'close', label: '閉じる' }], cols: 2, bh: 70 });
    switch (this.screen) {
      case 'setup': return P.draw({ title: 'SKY CLIMBER VR', sub: '操作方式と難易度', buttons: [
        { id: 'ctl:direct', label: '直接つかむ（標準）', sub: 'グリップで窓枠を握り、引いて登る', sel: s.vrControl === 'direct' }, { id: 'ctl:classic', label: 'クラシック', sub: '左右のスティックで左右の手', sel: s.vrControl === 'classic' },
        ...diff, { id: 'next', label: '次へ' }], cols: 2, bh: 82, footer: '本ゲームはClaude Codeのクラウドセッションで制作しました。' });
      case 'calib': return P.draw({ title: 'キャリブレーション', lines: [{ text: 'まっすぐ立つ（または座る）姿勢で「測る」を押してください。頭の高さと前後の位置を記録し、座っている場合は届く高さを補います。' }],
        buttons: [{ id: 'measure:stand', label: '立って測る' }, { id: 'measure:seat', label: '座って測る' }, { id: 'practice', label: '練習壁で練習' }, { id: 'select', label: '練習をとばす' }], cols: 2 });
      case 'select': return P.draw({ title: 'ビル選択', buttons: BUILDINGS.map((b, i) => ({ id: 'bld:' + i, label: `${i + 1}. ${b.ja}`, sub: `${b.floors} 階・${this.progress.cleared[b.id] ? 'クリア済み' : (i === 0 || this.progress.cleared[BUILDINGS[i - 1].id] || DEBUG) ? '登れます' : '前のビルをクリア'}`, disabled: !(i === 0 || this.progress.cleared[BUILDINGS[i - 1].id] || DEBUG) })).concat([{ id: 'practice', label: '練習壁' }, { id: 'top', label: 'タイトルへ' }]), cols: 2, bh: 76 });
      case 'result': return P.draw({ title: $('#res-title').textContent, lines: $$('#res-stats li').map((l) => ({ text: l.textContent })), buttons: [{ id: 'next', label: $('#btn-next').textContent }, { id: 'top', label: 'タイトルへ' }], cols: 2 });
      case 'final': return P.draw({ title: '4 棟すべて制覇！', sub: `${$('#fin-score').textContent} 点`, lines: $$('#fin-list li').map((l) => ({ text: l.textContent, size: 26 })).concat([{ text: $('#fin-best').textContent, color: '#ffd34a', bold: true }]), buttons: [{ id: 'select', label: 'もう一度' }, { id: 'top', label: 'タイトルへ' }], cols: 2 });
      case 'over': return P.draw({ title: 'ゲームオーバー', sub: `${$('#over-score').textContent} 点・${$('#over-height').textContent}`, lines: [{ text: $('#over-best').textContent, color: '#ffd34a' }], buttons: [{ id: 'overretry', label: 'このビルから再挑戦' }, { id: 'top', label: 'タイトルへ' }], cols: 2 });
      case 'top': default: return P.draw({ title: 'SKY CLIMBER VR', sub: 'VR を始めました', buttons: [{ id: 'gosetup', label: 'はじめる' }, { id: 'exitvr', label: 'VR を終了' }], cols: 2, footer: '本ゲームはClaude Codeのクラウドセッションで制作しました。' });
    }
  }
  vrAction(id) {
    const s = this.settings;
    const [k, v] = id.split(':');
    if (k === 'diff') this.setSetting('difficulty', v);
    else if (k === 'ctl' && v) this.setSetting('vrControl', v);
    else if (id === 'ctl') this.setSetting('vrControl', s.vrControl === 'direct' ? 'classic' : 'direct');
    else if (id === 'grip') this.setSetting('gripMode', s.gripMode === 'hold' ? 'toggle' : 'hold');
    else if (id === 'stance') this.setSetting('stance', s.stance === 'stand' ? 'seat' : 'stand');
    else if (id === 'reach') this.setSetting('reach', s.reach >= 1.29 ? 1.0 : s.reach >= 1.14 ? 1.3 : 1.15);
    else if (id === 'vig') this.setSetting('vignette', !s.vignette);
    else if (id === 'amode') this.setSetting('audioMode', s.audioMode === 'vr' ? 'classic' : 'vr');
    else if (id === 'qual') { const order = ['auto', ...QUALITY_ORDER]; this.setSetting('quality', order[(order.indexOf(s.quality) + 1) % order.length]); }
    else if (id === 'close') this.closeOverlay();
    else if (id === 'next') { if (this.screen === 'setup') this.show('calib'); else this.nextBuilding(); }
    else if (k === 'measure') {
      const xi = this.xr.poll(); const hy = xi.head ? xi.head.y : 1.6;
      this.settings.stance = v === 'seat' ? 'seat' : 'stand';
      const standEye = (s.height / 100) * 0.93;
      this.calib.seat = v === 'seat' ? Math.max(0, standEye - hy) : 0;
      this.calib.headZ = xi.head ? xi.head.z : 0;
      this.saveSettings(); this.toast(v === 'seat' ? `座位: 目の高さを ${this.calib.seat.toFixed(2)}m 補います` : `立位: 目の高さ ${hy.toFixed(2)}m を記録しました`);
      this.audio.play('respawn');
    }
    else if (id === 'practice') this.startPractice();
    else if (id === 'select') { this.run = null; this.show('select'); }
    else if (k === 'bld') this.startRun(+v);
    else if (id === 'top') this.toTop();
    else if (id === 'gosetup') this.show('setup');
    else if (id === 'exitvr') this.xr.end();
    else if (id === 'resume') this.resume();
    else if (id === 'retry') this.retryBuilding();
    else if (id === 'overretry') this.retryBuilding(true);
    else if (id === 'vrset') this.openOverlay('settings');
    this.drawVRScreen();
  }

  // ---------- ゲームパッド・キーボードでの画面操作 ----------
  handleUIInput(dt, pad, kb, xi) {
    if (this.vr) return;
    const start = pad.edge.start || kb.edge.pause;
    if (start) { if (this.screen === 'play') { if (this.paused) this.resume(); else this.pause(); } else if (this.overlay) this.closeOverlay(); }
    const inMenu = this.overlay || this.screen !== 'play' || this.paused;
    if (!inMenu) return;
    const nx = pad.nav.x, ny = pad.nav.y;
    const mv = [['r', nx > 0], ['l', nx < 0], ['u', ny > 0], ['d', ny < 0]].find(([k, h]) => this.rep(k, h, dt) && h);
    for (const [k, h] of [['r', nx > 0], ['l', nx < 0], ['u', ny > 0], ['d', ny < 0]]) if (!h) this.rep(k, false, dt);
    if (mv) { this.moveFocus(mv[0]); this.audio.play('uiMove'); }
    const root = this.overlay ? $('#ov-' + this.overlay) : $('#scr-' + this.screen);
    if (pad.edge.ok) { const a = document.activeElement; if (a && a !== document.body && root?.contains(a)) { if (a.type === 'range') { /* 左右で値を変える */ } else a.click(); } else this.focusFirst(); }
    if (pad.edge.back || kb.edge.back) { this.audio.play('uiBack'); if (this.overlay) { if (this.overlay === 'pause') this.resume(); else this.closeOverlay(); } else if (['setup', 'calib', 'select', 'help'].includes(this.screen)) this.show(this.screen === 'select' ? 'calib' : this.screen === 'calib' ? 'setup' : 'top'); }
  }
  moveFocus(dir) {
    const root = this.overlay ? $('#ov-' + this.overlay) : $('#scr-' + this.screen);
    if (!root) return;
    const els = Array.from(root.querySelectorAll('button:not([disabled]):not([hidden]), input, select')).filter((e) => e.offsetParent !== null);
    if (!els.length) return;
    const a = document.activeElement;
    if (!els.includes(a)) { els[0].focus(); return; }
    if (a.type === 'range' && (dir === 'l' || dir === 'r')) { const st = +a.step || 0.05; a.value = +a.value + (dir === 'r' ? st : -st); a.dispatchEvent(new Event('input')); return; }
    const r0 = a.getBoundingClientRect(), c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let best = null, bs = Infinity;
    for (const e of els) { if (e === a) continue; const r = e.getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; const dx = c.x - c0.x, dy = c.y - c0.y;
      const ok = dir === 'r' ? dx > 4 : dir === 'l' ? dx < -4 : dir === 'u' ? dy < -4 : dy > 4; if (!ok) continue;
      const main = dir === 'r' || dir === 'l' ? Math.abs(dx) : Math.abs(dy), side = dir === 'r' || dir === 'l' ? Math.abs(dy) : Math.abs(dx); const sc = main + side * 2.5; if (sc < bs) { bs = sc; best = e; } }
    (best || a).focus(); best?.scrollIntoView?.({ block: 'nearest' });
  }

  // ---------- 性能の記録と自動画質 ----------
  trackPerf(dt) {
    const p = this.perf; p.frames.push(dt); if (p.frames.length > 240) p.frames.shift();
    if (dt > 0.05) p.long++;
    if (this.settings.quality !== 'auto' || this.screen !== 'play' || this.paused) return;
    const now = performance.now(); if (now - p.lastAdjust < 8000 || p.frames.length < 200) return;
    const sorted = [...p.frames].sort((a, b) => a - b), p90 = sorted[Math.floor(sorted.length * 0.9)];
    const target = this.vr ? 1 / (this.xr.rate || 72) : 1 / 60;
    const i = QUALITY_ORDER.indexOf(this.world.quality.id);
    // 下げるのは 90% 値が目標の 1.25 倍を超えたときだけ。上げ直しはしない（頻繁に往復させない）
    if (p90 > target * 1.25 && i < QUALITY_ORDER.length - 1) {
      const nq = QUALITY_ORDER[i + 1]; p.log.push({ t: Math.round(now / 1000), from: this.world.quality.id, to: nq, p90 }); p.lastAdjust = now; p.frames = [];
      this.world.setQuality(nq); this.toast(`動きを滑らかにするため、画質を「${QUALITY[nq].ja}」に下げました（設定で固定できます）`);
    }
  }
  drawDebug(dt) {
    const p = this.perf, el = $('#debug'); if (el.hidden) el.hidden = false;
    if ((this.dbgT = (this.dbgT || 0) + dt) < 0.25) return; this.dbgT = 0;
    const s = [...p.frames].sort((a, b) => a - b), avg = s.reduce((a, b) => a + b, 0) / (s.length || 1), p95 = s[Math.floor(s.length * 0.95)] || 0;
    const info = this.world.renderer.info, ds = this.world.drawSize(), mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '-';
    el.textContent = `FPS ${(1 / avg).toFixed(1)}  p95 ${(p95 * 1000).toFixed(1)}ms  長いフレーム ${p.long}\n描画 ${info.render.calls} 回  三角形 ${(info.render.triangles / 1000).toFixed(0)}k  テクスチャ ${info.memory.textures}\n描画バッファ ${ds.w}×${ds.h}（CSS ${ds.css.w}×${ds.css.h}・DPR ${ds.dpr}）  画質 ${this.world.quality.id}\nJS ヒープ ${mem}  XR ${this.vr ? (this.xr.rate || '?') + 'Hz' : '-'}  状態 ${this.game?.state ?? '-'}`;
  }
}
function lerpPose(a, b, t) {
  const L = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  // 復帰などの大きな跳び（1m 超）は補間しない
  const jump = Math.hypot(a.body.x - b.body.x, a.body.y - b.body.y) > 1;
  if (jump) return b;
  return { body: L(a.body, b.body), hands: { L: L(a.hands.L, b.hands.L), R: L(a.hands.R, b.hands.R) } };
}
function handPos(g, s) { const h = g.climber.hands[s]; return { x: h.x, y: h.y, z: 0.1 }; }
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function controlJa(c) { return { 'vr-direct': 'VR 直接', 'vr-classic': 'VR クラシック', 'flat-pad': 'ゲームパッド', 'flat-kb': 'キーボード', 'flat-touch': 'タッチ' }[c] || c; }

const app = new App();
app.boot();
