// 鉄骨レスキュー — アプリ本体（起動・画面遷移・2D 表示・HUD・音と入力の配線）。VR は vr.js。
// 画面遷移: 読み込み → タイトル（入口）→ モード・難易度 → チュートリアル／第1〜4面 → 救出・エンディング → 結果 → 再挑戦／タイトル
import * as THREE from 'three';
import { createGame, step, startStage, miss, hudInfo, DT } from '../shared/core.js';
import { STAGES, TUTORIAL } from '../shared/stages.js';
import { DIFFICULTY, DIFF_ORDER, SCORE } from '../shared/config.js';
import { World } from '../shared/render/world.js';
import { Input, padLabels } from '../shared/input.js';
import { Save } from '../shared/save.js';
import { GameAudio } from '../shared/audio/audio.js';
import { EVENT_SFX } from '../shared/audio/sfx.js';
import { Bot, ROUTES } from '../shared/bot.js';
import { makeFrameClock } from '../shared/frame-clock.js';
import { installNoZoom } from '../shared/no-zoom.js';
import { MenuView, bar } from './menus.js';
import { Touch } from './touch.js';
import { VRMode } from './vr.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const SPEED = DEBUG ? Math.max(1, Math.min(20, +(Q.get('speed') || 1))) : 1;   // デバッグ専用の倍速（自動確認用）
const $ = (id) => document.getElementById(id);
const loadMsg = (m, k) => { $('load-msg').textContent = m; if (k != null) $('load-bar').style.width = `${Math.round(k * 100)}%`; };

// ---------------------------------------------------------------- 基盤
const save = new Save();
const S = save.settings;
const audio = new GameAudio();
const input = new Input();
const touch = new Touch();
input.touch = touch;
const frameClock = makeFrameClock();

loadMsg('描画を準備しています…', 0.2);
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
} catch (e) {
  loadMsg('この端末では WebGL（3D 描画）を使えないため、ゲームを開始できません。\n別のブラウザーか端末でお試しください。', 1);
  $('load-retry').hidden = false; $('load-retry').onclick = () => location.reload();
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
const scene = new THREE.Scene();
const cam2d = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
cam2d.position.set(8, 8, 40);

// 画質: auto は画面の実ピクセルで決める（4K なら ultra）。大画面とQuestは別々の設定
function qualityLevel() {
  if (S.quality !== 'auto') return S.quality;
  const px = screen.width * devicePixelRatio;
  return px >= 3000 ? 'ultra' : 'high';
}
let quality = qualityLevel();
let dynScale = 1;  // 自動のときだけ、重い端末で描画倍率を下げる（下限 0.6）
function pixelRatio() {
  const dpr = devicePixelRatio || 1;
  const base = quality === 'ultra' ? Math.min(dpr, 3) : quality === 'standard' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
  return base * (S.quality === 'auto' ? dynScale : 1);
}
let world = new World({ quality, vr: false });
const stageHolder = new THREE.Group(); scene.add(stageHolder);
stageHolder.add(world.root); scene.add(world.env);

// 得点の数字（板）
const pops = new THREE.Group(); world.root.add(pops);
const popTex = new Map();
function popTexture(n) {
  if (popTex.has(n)) return popTex.get(n);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.font = '900 86px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#2a0f05'; g.strokeText(String(n), 128, 66); g.fillStyle = n >= 1000 ? '#7ff3ff' : n >= 300 ? '#7dff9a' : '#ffe14a'; g.fillText(String(n), 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; popTex.set(n, t); return t;
}
const popSprites = [];
for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })); s.renderOrder = 30; s.scale.set(1.0, 0.5, 1); s.visible = false; pops.add(s); popSprites.push(s); }

function resize() {
  const w = innerWidth, h = innerHeight;
  if (!renderer.xr.isPresenting) { renderer.setPixelRatio(pixelRatio()); renderer.setSize(w, h, false); }
  fitCamera();
}
function fitCamera() {
  const st = world.stage || STAGES[0];
  const W = st.width, H = st.height;
  const aspect = innerWidth / innerHeight;
  const topPad = 2.0, bot = 1.0, side = 1.2;
  let vw = W + side * 2, vh = H + topPad + bot;
  if (vw / vh < aspect) vw = vh * aspect; else vh = vw / aspect;
  const cx = W / 2, cy = (H + topPad - bot) / 2 - 0.2;
  cam2d.left = -vw / 2; cam2d.right = vw / 2; cam2d.top = vh / 2; cam2d.bottom = -vh / 2;
  // わずかに見下ろす（10°）。正投影なので移動と判定は平面のまま、足場の上面と奥行きが見える
  const pitch = THREE.MathUtils.degToRad(10);
  cam2d.position.set(cx, cy + Math.sin(pitch) * 40, Math.cos(pitch) * 40); cam2d.lookAt(cx, cy, 0); cam2d.updateProjectionMatrix();
}
installNoZoom(resize);

// ---------------------------------------------------------------- 状態
let run = null;          // 遊んでいる回: { g, mode, practice, ... }
let demo = null, demoBot = null;
let screenName = 'loading';
let paused = false;
let acc = 0, lastNow = 0, timeSec = 0;
const vr = new VRMode({ renderer, scene, stageHolder, getWorld: () => world, input, audio, save, app: null });
let wantMode = '2d';

// ---------------------------------------------------------------- 音の準備（最初の操作で開く）
function unlockAudio() {
  if (audio.unlock()) {
    applyVolumes();
    if (audio.pending) { const p = audio.pending; audio.pending = null; audio.music(p); }
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { passive: true });
function applyVolumes() {
  audio.ambientOn = S.ambient;
  audio.spatial = vr.active && S.vrSpatialAudio;
  audio.setVolume({ master: S.volMaster / 10, music: S.volMusic / 10, sfx: S.volSfx / 10, ambient: S.volAmbient / 10 });
}

// ---------------------------------------------------------------- メニュー
const titleMenu = new MenuView($('title-menu'), (s) => audio.play(s));
const panelMenu = new MenuView($('panel-menu'), (s) => audio.play(s));
let activeMenu = null, panelBack = null, panelModel = null;

function show(id, on) { $(id).classList.toggle('show', on); }
function setScreen(name) {
  screenName = name;
  show('title', name === 'title');
  show('panel', name === 'panel');
  $('hud').classList.toggle('show', name === 'play' || (name === 'panel' && !!run));
  touch.show(name === 'play');
  activeMenu = name === 'title' ? titleMenu : name === 'panel' ? panelMenu : null;
  vr.setMenu(name === 'title' ? titleModel() : name === 'panel' ? panelModel : null);
}
function titleModel() { return { title: '鉄骨レスキュー', sub: 'IRON SUMMIT  2D / VR', menu: titleMenu, note: 'このゲームはClaudeセッションで制作しました。', lines: [recordsLine()] }; }
function openPanel({ title, html = '', lines = null, items, hint = '', back = null, sel = 0 }) {
  $('panel-title').textContent = title;
  $('panel-body').innerHTML = html;
  $('panel-hint').textContent = hint;
  panelMenu.set(items, sel);
  panelBack = back;
  panelModel = { title, lines: lines || htmlToLines(html), menu: panelMenu, hint };
  setScreen('panel');
}
function htmlToLines(html) {
  if (!html) return [];
  const d = document.createElement('div'); d.innerHTML = html.replace(/<\/(p|tr|li|div|h3)>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<\/t[dh]>/g, '　');
  return d.textContent.split('\n').map((s) => s.trim()).filter(Boolean);
}

function recordsLine() {
  const d = S.difficulty;
  const r2 = save.data.records[`2d:${d}`], r3 = save.data.records[`vr:${d}`];
  return `最高記録（${DIFFICULTY[d].label}）  2D ${r2.hi.toLocaleString()} ／ VR ${r3.hi.toLocaleString()}　　解放 ${save.data.unlocked}/4 面`;
}

function showTitle() {
  if (run) endRun(false);
  paused = false;
  const items = [
    { label: '2Dで遊ぶ', primary: true, act: () => modeMenu('2d') },
    { label: '3D VRで遊ぶ', primary: true, note: vr.supportText(), act: () => tryVR() },
    { label: '遊び方・操作', act: () => helpPanel(showTitle) },
    { label: '設定', act: () => settingsPanel(showTitle) },
  ];
  titleMenu.set(items, wantMode === 'vr' ? 1 : 0);
  $('title-records').textContent = recordsLine();
  setScreen('title');
  startDemo();
  audio.music('title');
}

function modeMenu(mode, sel = 0) {
  wantMode = mode;
  const unlocked = save.data.unlocked;
  let practiceStage = Math.min(unlocked, 4) - 1;
  const items = [
    { label: '難易度', value: () => DIFFICULTY[S.difficulty].label, lr: (d) => { const i = DIFF_ORDER.indexOf(S.difficulty); save.setSetting('difficulty', DIFF_ORDER[(i + d + 3) % 3]); } },
    { label: '最初から（通しプレイ）', primary: true, act: () => beginRun({ mode, stage: 0, practice: false }) },
    { label: 'チュートリアル', note: save.data.tutorialDone ? '済' : 'おすすめ', act: () => beginRun({ mode, stage: 'tutorial', practice: true }) },
    { label: '面を選んで練習', value: () => `${STAGES[practiceStage].name}`, lr: (d) => { practiceStage = (practiceStage + d + unlocked) % unlocked; }, act: () => beginRun({ mode, stage: practiceStage, practice: true }) },
    { label: 'もどる', act: showTitle },
  ];
  const d = DIFFICULTY[S.difficulty];
  openPanel({ title: mode === 'vr' ? '3D VR' : '2D クラシック', items, sel: sel || 1, back: showTitle,
    html: `<p class="center">残機 ${d.lives}　各面 ${d.time} 秒　${d.midCheckpoint ? '中間地点から復帰' : '面の最初から復帰'}<br>練習（面選択・チュートリアル）は記録に残りません。</p>`,
    hint: '◀▶ で切り替え　決定で開始' });
}

function helpPanel(back) {
  const pl = padLabels(input.padId);
  const html = `
  <table>
  <tr><th>目的</th><td>樽や危険をかわし、はしごで上へ。1〜3 面は最上段の足場に着けばクリア。4 面は装置 ①〜④ を順に解除してミナを救出。</td></tr>
  <tr><th>キーボード</th><td><kbd>←</kbd><kbd>→</kbd>/<kbd>A</kbd><kbd>D</kbd> 移動　<kbd>↑</kbd><kbd>↓</kbd>/<kbd>W</kbd><kbd>S</kbd> はしご　<kbd>Space</kbd> ジャンプ　<kbd>F</kbd> 道具・装置　<kbd>Esc</kbd> ポーズ</td></tr>
  <tr><th>ゲームパッド</th><td>左スティック／十字キー 移動・昇降　${pl.south} ジャンプ　${pl.west} 道具・装置　${pl.start} ポーズ　${pl.east} もどる<br><small>（接続中: ${input.padConnected ? pl.family : 'なし'}）</small></td></tr>
  <tr><th>タッチ</th><td>左のスティックで移動・昇降、右の大きいボタンでジャンプ、小さいボタンで道具・装置。右上 Ⅱ でポーズ</td></tr>
  <tr><th>Quest</th><td>左スティック 移動　右スティック左右 30° 回転　右 A ジャンプ　はしごの前でグリップ つかむ／もう一度で離す　つかんで左スティック上下 昇降　右トリガー 道具・装置・決定　右 B ポーズ<br>俯瞰の模型: 左スティック左右で移動・上下で昇降、右スティックで模型を回して見る</td></tr>
  <tr><th>得点</th><td>跳び越し ${SCORE.jumpOver}　ハンマーで破壊 ${SCORE.smash}　装置 ${SCORE.device}　面クリア ${SCORE.clear}＋残り秒×${SCORE.perSecond}</td></tr>
  <tr><th>ハンマー</th><td>拾うと 8 秒。地上でだけ振れる（0.45 秒ごと）。持ったままジャンプ・昇降できるが、その間は振れない</td></tr>
  <tr><th>ミス</th><td>当たる・落ちる・時間切れで残機が 1 減り、復帰後 2 秒は無敵。ミスするとその復帰点のあとに取った得点は消える</td></tr>
  </table>`;
  openPanel({ title: '遊び方・操作', html, items: [{ label: 'もどる', act: back }], back });
}

function settingsPanel(back, sel = 0) {
  const vol = (k, label) => ({ label, value: () => bar(S[k]), lr: (d) => { save.setSetting(k, Math.max(0, Math.min(10, S[k] + d))); applyVolumes(); } });
  const cyc = (k, label, opts, names, after) => ({ label, value: () => names[opts.indexOf(S[k])] ?? String(S[k]), lr: (d) => { const i = opts.indexOf(S[k]); save.setSetting(k, opts[(i + d + opts.length) % opts.length]); after && after(); } });
  const items = [
    vol('volMaster', '全体の音量'), vol('volMusic', '曲'), vol('volSfx', '効果音'), vol('volAmbient', '工事現場の環境音'),
    cyc('ambient', '環境音', [true, false], ['あり', 'なし'], () => { applyVolumes(); audio.ambient(S.ambient && screenName === 'play'); }),
    cyc('quality', '画質（大画面）', ['auto', 'ultra', 'high', 'standard'], ['自動', 'Ultra（4K）', 'High', 'Standard'], () => { quality = qualityLevel(); dynScale = 1; resize(); }),
    cyc('vrView', 'VR の視点', ['first', 'model'], ['体験（一人称）', '俯瞰の模型'], () => vr.applySettings()),
    cyc('vrMoveBasis', 'VR の移動の基準', ['head', 'stage'], ['頭の向き', '舞台の左右'], () => vr.applySettings()),
    cyc('vrStance', 'VR の姿勢', ['standing', 'seated'], ['立って', '座って'], () => vr.applySettings()),
    { label: 'VR の高さ補正', value: () => `${S.vrHeight >= 0 ? '+' : ''}${Math.round(S.vrHeight * 100)} cm`, lr: (d) => { save.setSetting('vrHeight', Math.max(-0.6, Math.min(0.6, Math.round((S.vrHeight + d * 0.05) * 100) / 100))); vr.applySettings(); } },
    cyc('vrVignette', 'VR の周辺減光', [true, false], ['あり', 'なし']),
    cyc('vrQuality', 'VR の画質（Quest）', ['high', 'standard'], ['Quest High', 'Standard'], () => vr.applySettings()),
    cyc('vrRefresh', 'VR のリフレッシュレート', [72, 90], ['72Hz', '90Hz'], () => vr.applySettings()),
    cyc('vrSpatialAudio', 'VR の位置音響', [true, false], ['あり', 'なし（2D と同じ）'], applyVolumes),
    cyc('showFps', 'FPS 表示', [false, true], ['なし', 'あり']),
    { label: '記録と設定を初期化', act: () => confirmPanel('記録・設定・解放面をすべて初期化します。よろしいですか？', () => { save.reset(); Object.assign(S, save.settings); location.reload(); }, () => settingsPanel(back, 15)) },
    { label: 'もどる', act: back },
  ];
  openPanel({ title: '設定', items, sel, back, hint: save.recovered ? `保存データを復旧しました（${save.fixes.join('、')}）` : '設定はこの端末に保存されます' });
}

function confirmPanel(msg, yes, no) {
  openPanel({ title: '確認', html: `<p class="center">${msg}</p>`, items: [{ label: 'はい', act: yes }, { label: 'いいえ', act: no }], sel: 1, back: no });
}
function messagePanel(title, html, items, back) { openPanel({ title, html, items, back: back || items[items.length - 1].act }); }

// ---------------------------------------------------------------- 遊ぶ回
function beginRun({ mode, stage, practice }) {
  if (mode === 'vr' && !vr.active) { pendingRun = { mode, stage, practice }; tryVR(true); return; }
  stopDemo();
  const g = createGame({ difficulty: S.difficulty, stage: stage === 'tutorial' ? 0 : stage, practice, mode, seed: (Date.now() & 0x7fffffff) >>> 0, ladderNeedsGrab: mode === 'vr' && S.vrView === 'first' });
  if (stage === 'tutorial') startStage(g, 'tutorial');
  run = { g, mode, practice, tutorial: stage === 'tutorial', stageStartScore: g.score, musicKey: '', switched: false, startStage: stage };
  setupStage();
  paused = false;
  setScreen('play');
}
let pendingRun = null;
function calmRun(g) { g.boss = g.boss ? { ...g.boss, timer: 1e9 } : null; g.bots.forEach((b) => (b.alive = false)); g.stage = { ...g.stage, dispensers: [], vents: [] }; g.dispT = []; }

function setupStage() {
  const g = run.g;
  if (DEBUG && Q.has('calm')) calmRun(g);
  if (world.vr !== (run.mode === 'vr')) rebuildWorld(run.mode === 'vr');
  world.build(g.stage);
  world.capture(g); world.capture(g);
  run.stageStartScore = g.score; run.stageStartLives = g.lives;
  fitCamera();
  vr.onStage(g);
  $('hud-stage').textContent = g.stage.name;
  $('hud-stage-sub').textContent = g.stage.sub;
  banner(`${g.stage.name}\n<small>${g.stage.sub}　—　READY</small>`, g.stage.tutorial ? 1.0 : 2.2);
  audio.ambient(S.ambient);
}
function rebuildWorld(isVR) {
  stageHolder.remove(world.root); scene.remove(world.env);
  world.clearStatic();
  world = new World({ quality: isVR ? 'high' : quality, vr: isVR });
  stageHolder.add(world.root); scene.add(world.env); world.root.add(pops);
}

function endRun(recordIt = true) {
  if (!run) return;
  if (recordIt) finishRecord();
  run = null;
  audio.ambient(false);
}
function finishRecord() {
  const g = run.g;
  const reached = g.stage.tutorial ? 0 : g.stageIdx + 1;
  const cleared = g.phase === 'ending';
  if (!run.practice && !run.switched && g.runFromStart) {
    return save.recordRun({ mode: run.mode, difficulty: g.difficulty, score: g.score, stageReached: reached, cleared, practice: false });
  }
  return false;
}

function pauseGame(reason = '') {
  if (!run || paused || screenName !== 'play') return;
  paused = true; input.releaseAll();
  audio.play('pause'); audio.stopMusic(); audio.ambient(false);
  pauseMenu(reason);
}
function pauseMenu(reason = '', sel = 0) {
  const other = run.mode === 'vr' ? '2D に切り替える' : '3D VR に切り替える';
  const items = [
    { label: '再開', primary: true, act: resumeGame },
    { label: '遊び方・操作', act: () => helpPanel(() => pauseMenu(reason, 1)) },
    { label: '設定', act: () => settingsPanel(() => pauseMenu(reason, 2)) },
  ];
  if (run.mode === 'vr') {
    items.push({ label: 'VR の視点', value: () => (S.vrView === 'first' ? '体験（一人称）' : '俯瞰の模型'), lr: () => { save.setSetting('vrView', S.vrView === 'first' ? 'model' : 'first'); vr.applySettings(); run.g.ladderNeedsGrab = S.vrView === 'first'; } });
    items.push({ label: 'リセンター（正面を合わせる）', act: () => { vr.recenter(); pauseMenu(reason, 4); } });
  }
  items.push({ label: other, act: () => switchModeConfirm() });
  items.push({ label: 'タイトルへ', act: () => confirmPanel('タイトルへ戻ります。この回の得点は記録に残します（練習を除く）。', () => { endRun(true); if (vr.active) vr.exit(); showTitle(); }, () => pauseMenu(reason)) });
  openPanel({ title: 'ポーズ', html: reason ? `<p class="center">${reason}</p>` : '', items, sel, back: resumeGame, hint: `${run.g.stage.name}　SCORE ${run.g.score.toLocaleString()}　${run.practice || run.switched ? '練習扱い' : '通しプレイ'}` });
}
function resumeGame() {
  if (!run) return;
  paused = false; input.releaseAll();
  run.musicKey = '';
  setScreen('play');
  audio.ambient(S.ambient);
}

function switchModeConfirm() {
  const to = run.mode === 'vr' ? '2D' : '3D VR';
  confirmPanel(`${to} に切り替えます。<br>今の面（${run.g.stage.name}）の最初から再開します。解放済みの面と設定はそのまま、得点はこの面の開始時に戻り、以後は練習扱い（記録に残らない）になります。`,
    () => doSwitchMode(), () => pauseMenu());
}
async function doSwitchMode() {
  const g = run.g;
  const toVR = run.mode !== 'vr';
  if (toVR) {
    const ok = await vr.enter();
    if (!ok) { messagePanel('VR を開始できません', `<p class="center">${vr.lastError || 'この端末・ブラウザーでは VR を開始できませんでした。'}</p>`, [{ label: '2D で続ける', act: () => pauseMenu() }]); return; }
  } else if (vr.active) vr.exit();
  run.mode = toVR ? 'vr' : '2d';
  run.switched = true; run.practice = true; g.practice = true;
  g.score = run.stageStartScore;
  g.ladderNeedsGrab = toVR && S.vrView === 'first';
  const idx = g.stage.tutorial ? 'tutorial' : g.stageIdx;
  startStage(g, idx);
  if (DEBUG && Q.has('calm')) calmRun(g);
  setupStage();
  applyVolumes();
  paused = false; setScreen('play');
}

async function tryVR(fromRun = false) {
  unlockAudio();
  const sup = await vr.isSupported();
  if (!sup) {
    messagePanel('3D VR を使えません', `<p class="center">${vr.lastError || 'この端末・ブラウザーは WebXR の immersive-vr に対応していません。'}<br>Meta Quest 3 の Meta Quest Browser で、このページ（HTTPS）を開いてください。</p>`,
      [{ label: '2D で遊ぶ', act: () => { pendingRun = null; modeMenu('2d'); } }, { label: 'タイトルへ', act: showTitle }]);
    return;
  }
  const ok = await vr.enter();
  if (!ok) {
    messagePanel('VR を開始できません', `<p class="center">${vr.lastError || 'VR の開始が許可されませんでした。'}</p>`, [{ label: 'もう一度', act: () => tryVR(fromRun) }, { label: '2D で遊ぶ', act: () => modeMenu('2d') }, { label: 'タイトルへ', act: showTitle }]);
    return;
  }
  applyVolumes();
  if (pendingRun) { const p = pendingRun; pendingRun = null; beginRun(p); }
  else modeMenu('vr');
}
vr.onExit = () => {
  // VR 終了: 遊んでいたら 2D でポーズして待つ（追跡喪失・入力切断と同じ扱い）
  applyVolumes();
  if (run && run.mode === 'vr') { paused = false; screenName = 'play'; pauseGame('VR を終了しました。「2D に切り替える」で続けるか、「3D VR に切り替える」で再入場できます。'); }
  else if (screenName === 'title' || !run) showTitle();
};
vr.onPauseRequest = (why) => pauseGame(why);

// ---------------------------------------------------------------- タイトルの背景（自動で登るデモ）
function startDemo() {
  demo = createGame({ difficulty: 'easy', stage: 0, practice: true, seed: 7 });
  demo.player.invT = 1e9;
  demoBot = new Bot(ROUTES.girders);
  if (world.vr && !vr.active) rebuildWorld(false);
  world.build(demo.stage); world.capture(demo); fitCamera();
}
function stopDemo() { demo = null; demoBot = null; }

// ---------------------------------------------------------------- HUD・演出
let bannerT = 0;
function banner(html, sec = 2) { const b = $('hud-banner'); b.innerHTML = html.replace(/\n/g, '<br>'); b.hidden = false; bannerT = sec; vr.banner(htmlToLines(html.replace(/\n/g, '<br>')), sec); }
const hudCache = {};
function hudSet(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHUD(dt) {
  if (!run) return;
  const h = hudInfo(run.g);
  const rec = save.data.records[`${run.mode}:${run.g.difficulty}`];
  hudSet('hud-score', h.score.toLocaleString());
  hudSet('hud-hi', Math.max(rec.hi, run.practice ? 0 : h.score).toLocaleString());
  hudSet('hud-time', h.stage.tutorial ? '—' : String(h.time));
  $('hud-time').classList.toggle('low', h.time <= 30 && !h.stage.tutorial);
  hudSet('hud-lives', h.stage.tutorial ? '∞' : '⛑'.repeat(Math.max(0, h.lives)) || '0');
  $('hud-practice').hidden = !(run.practice || run.switched);
  $('hud-practice').textContent = run.tutorial ? 'チュートリアル' : '練習';
  $('hud-hammer').hidden = !(h.hammer > 0); if (h.hammer > 0) hudSet('hud-hammer-t', h.hammer.toFixed(1) + ' 秒');
  const dev = h.nextDevice && h.devices.length && !h.stage.tutorial;
  $('hud-device').hidden = !dev;
  if (dev) hudSet('hud-device', `装置 ${h.devices.map((d) => (d.done ? '●' : d.order === h.nextDevice ? '◎' : '○')).join(' ')}　次は ${'①②③④'[Math.min(4, h.nextDevice) - 1] || '—'}`);
  const tut = $('hud-tutorial');
  if (h.tutorialStep) { tut.hidden = false; hudSet('hud-tutorial', `${h.tutorialIndex + 1}/${h.stage.steps.length}　${h.tutorialStep.text}`); } else tut.hidden = true;
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('hud-banner').hidden = true; }
  vr.hud(h, rec, run);
}

function handleEvents(g) {
  for (const e of g.events) {
    const name = EVENT_SFX[e.type];
    if (name) audio.play(name, { pos: e.x != null ? vr.worldPos(e.x, e.y ?? 0) : null });
    switch (e.type) {
      case 'miss': if (DEBUG) console.log('[t] miss', e.cause, g.stage.id, g.player.x.toFixed(2), g.player.y.toFixed(2), g.player.state); banner(e.cause === 'time' ? '時間切れ！' : e.cause === 'fall' ? '落ちた！' : e.cause === 'crush' ? 'はさまれた！' : 'ミス！', 1.8); vr.onMiss(); break;
      case 'respawn': vr.onRespawn(); break;
      case 'clear': banner(`クリア！\n<small>ボーナス ${e.bonus.toLocaleString()}</small>`, 3); break;
      case 'rescue': banner(`救出成功！\n<small>ボーナス ${e.bonus.toLocaleString()}</small>`, 4); break;
      case 'checkpoint': banner('中間地点', 1.2); break;
      case 'deviceWrong': banner(`順番が違う！ 次は ${'①②③④'[e.need - 1]}`, 1.2); break;
      case 'device': if (g.nextDevice <= 4 && !g.stage.tutorial) banner(`装置 ${'①②③④'[e.order - 1]} 解除`, 1.0); break;
      case 'go': banner('GO!', 0.7); break;
      case 'tutorialDone': banner('チュートリアル完了！', 2); break;
      case 'hammer': vr.haptic(1, 0.4, 60); break;
      case 'smash': vr.haptic(1, 0.8, 80); break;
      case 'jump': vr.haptic(1, 0.15, 20); break;
    }
  }
}

function musicFor(g) {
  switch (g.phase) {
    case 'intro': return ['start', 'intro' + g.stage.id];
    case 'play': return g.player.hammerT > 0 ? ['hammer', 'h'] : [g.stage.tutorial ? 'training' : 'stage', 'p' + g.stage.id];
    case 'dying': return ['miss', 'd' + g.stats.misses];
    case 'clear': case 'stageDone': return ['clear', 'c' + g.stage.id];
    case 'rescue': case 'ending': return ['rescue', 'r'];
    case 'gameover': return ['gameover', 'go'];
    default: return [null, g.phase];
  }
}

function afterTick() {
  const g = run.g;
  handleEvents(g);
  const [song, key] = musicFor(g);
  if (key !== run.musicKey && !paused) { run.musicKey = key; if (song) audio.music(song, { restart: true }); else audio.stopMusic(); }
  if (g.phase === 'stageDone') {
    const next = g.stageIdx + 1;
    save.unlock(next + 1);
    if (next < STAGES.length) { startStage(g, next); setupStage(); }
  } else if (g.phase === 'ending' && !run.endShown) {
    run.endShown = true; save.unlock(4); setTimeout(() => endingPanel(), 400);
  } else if (g.phase === 'gameover' && !run.endShown) {
    run.endShown = true; setTimeout(() => resultsPanel('ゲームオーバー'), 2600);
  } else if (g.phase === 'tutorialDone' && !run.endShown) {
    run.endShown = true; save.data.tutorialDone = true; save.save();
    setTimeout(() => messagePanel('チュートリアル完了', '<p class="center">移動・ジャンプ・はしご・危険の見分け・ハンマー・装置を体験しました。<br>本番では樽が次々に転がってきます。周期を読んで進もう。</p>',
      [{ label: '第1面から始める', act: () => { const m = run.mode; endRun(false); beginRun({ mode: m, stage: 0, practice: false }); } }, { label: 'もう一度', act: () => { const m = run.mode; endRun(false); beginRun({ mode: m, stage: 'tutorial', practice: true }); } }, { label: 'タイトルへ', act: () => { endRun(false); if (vr.active) vr.exit(); showTitle(); } }]), 1200);
  }
}

function endingPanel() {
  const g = run.g;
  messagePanel('エンディング', `<p class="center">最後のボルトが外れ、ゴンザは足場ごと地上の砂山へ転がり落ちた。<br>ミナ「来てくれると思ってた！」<br>夜明けの鉄骨の上で、二人は町を見下ろした。</p><p class="big">${g.score.toLocaleString()}</p>`,
    [{ label: '結果へ', act: () => resultsPanel('救出成功') }]);
}
function resultsPanel(title) {
  const g = run.g, mode = run.mode;
  const before = save.data.records[`${mode}:${g.difficulty}`].hi;
  const isRecord = finishRecord() && g.score > before;
  const counted = !run.practice && !run.switched && g.runFromStart;
  const reached = g.stage.tutorial ? 'チュートリアル' : g.stage.name;
  const html = `<p class="big">${g.score.toLocaleString()}</p>
    <p class="center">${isRecord ? '★ 最高記録を更新！<br>' : ''}到達: ${reached}　ミス ${g.stats.misses} 回　ジャンプ ${g.stats.jumps} 回　破壊 ${g.stats.smashes}<br>
    ${counted ? `記録（${mode === 'vr' ? 'VR' : '2D'}・${DIFFICULTY[g.difficulty].label}）: ${save.data.records[`${mode}:${g.difficulty}`].hi.toLocaleString()}` : '練習扱いのため記録には残りません'}</p>`;
  const again = { mode, stage: run.practice && !run.switched ? (g.stage.tutorial ? 'tutorial' : g.stageIdx) : 0, practice: run.practice && !run.switched };
  run.recorded = true;
  messagePanel(title, html, [
    { label: 'もう一度', act: () => { run = null; beginRun(again); } },
    { label: 'タイトルへ', act: () => { run = null; if (vr.active) vr.exit(); showTitle(); } },
  ]);
}

// ---------------------------------------------------------------- 入力（メニュー操作）
function menuInput(o) {
  const m = activeMenu; if (!m) return;
  if (o.pressed.up) m.move(-1);
  if (o.pressed.down) m.move(1);
  if (o.pressed.left) m.lr(-1);
  if (o.pressed.right) m.lr(1);
  if (o.pressed.confirm || (o.pressed.jump && input.lastDevice === 'pad')) m.confirm();
  else if (o.pressed.back || (o.pressed.pause && screenName === 'panel')) { if (screenName === 'panel' && panelBack) { audio.play('menuBack'); panelBack(); } }
}

// ---------------------------------------------------------------- 非表示・フォーカス喪失
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { input.releaseAll(); pauseGame('画面が隠れたので一時停止しました。'); audio.suspend(); }
  else audio.resume();
});
addEventListener('blur', () => { input.releaseAll(); if (!vr.active) pauseGame('ウィンドウのフォーカスが外れたので一時停止しました。'); });
input.onPadChange = (on) => { if (!on) pauseGame('ゲームパッドが切断されました。'); };

// ---------------------------------------------------------------- デバッグ
const fpsBox = $('hud-fps');
let fpsAcc = 0, fpsN = 0, fpsShow = 0, slowT = 0, frameTimes = [];
if (DEBUG) addEventListener('keydown', (e) => {
  if (!run) return;
  const g = run.g;
  if (e.code === 'KeyI') g.player.invT = g.player.invT > 100 ? 0 : 1e9;
  if (e.code === 'KeyN' && !g.stage.tutorial) { g.phase = 'stageDone'; }
  if (e.code === 'KeyK') miss(g, 'barrel');
  if (e.code === 'KeyT') g.time = 5;
  if (e.code === 'KeyB' && g.devices.length) for (const d of g.devices) if (!d.done) { g.player.x = d.x; g.player.y = d.y; g.player.plat = d.plat; g.player.state = 'ground'; break; }
});
let autoBot = null;
window.__game = { get run() { return run; }, get screen() { return screenName; }, get world() { return world; }, renderer, save, audio, vr,
  start: (o) => beginRun({ mode: '2d', stage: 0, practice: false, ...o }), auto: (on = true) => { autoBot = on ? 'auto' : null; }, menu: () => activeMenu, title: () => showTitle() };

// ---------------------------------------------------------------- ループ
let prevFrame = performance.now();
function loop(now, xrFrame) {
  const dt = frameClock(now);
  timeSec += dt;
  const o = input.poll();
  if (screenName === 'play' && run && !paused) {
    if (o.pressed.pause) pauseGame();
    else {
      acc += dt * SPEED;
      let n = 0;
      while (acc >= DT && n < 5 * SPEED) {
        let gi = Input.toGame(o);
        if (vr.active) gi = vr.gameInput(gi, run.g);
        if (autoBot && run.g.stage) {
          if (autoBot === 'auto' || autoBot.stage !== run.g.stage.id || autoBot.gen !== run.g.snapshot) autoBot = { bot: new Bot(ROUTES[run.g.stage.id]), stage: run.g.stage.id, gen: run.g.snapshot };
          gi = autoBot.bot.input(run.g);
        }
        step(run.g, gi);
        // 同じ tick の押下を次の tick で繰り返さない
        o.pressed = {};
        world.capture(run.g);
        afterTick();
        if (!run) break;
        acc -= DT; n++;
      }
      if (acc > DT * 5 * SPEED) acc = 0;
    }
  } else if (demo && screenName !== 'play') {
    acc += dt;
    while (acc >= DT) {
      step(demo, demoBot.input(demo)); world.capture(demo); acc -= DT;
      if (demoBot.done || demo.phase !== 'play' && demo.phase !== 'intro') { if (demo.phase === 'clear' || demoBot.done) startDemo(); }
    }
    menuInput(o);
  } else {
    acc = 0;
    menuInput(o);
  }
  if (screenName === 'panel' && run) { /* ポーズ中は進めない */ }
  const g = run ? run.g : demo;
  if (g && world.stage) {
    world.update(g, Math.min(1, acc / DT), screenName === 'play' && !paused ? dt : dt * 0.25, timeSec);
    // 得点の数字
    popSprites.forEach((s, i) => {
      const p = g.pops[i];
      if (!p) { s.visible = false; return; }
      s.visible = true; s.material.map = popTexture(p.n); s.material.needsUpdate = s.material.map !== s.userData.map; s.userData.map = s.material.map;
      s.position.set(p.x, p.y + p.t * 0.9, 0.9); s.material.opacity = Math.min(1, (1 - p.t) * 2.5);
    });
  }
  updateHUD(dt);
  if (vr.active) { vr.frame(dt, timeSec, run, xrFrame, o, activeMenu); renderer.render(scene, vr.camera); }
  else renderer.render(scene, cam2d);
  // 計測（平均だけでなく、遅いフレームの割合も）
  const ft = now - prevFrame; prevFrame = now;
  frameTimes.push(ft); if (frameTimes.length > 240) frameTimes.shift();
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) {
    fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (S.quality === 'auto' && !renderer.xr.isPresenting && screenName === 'play') {
      if (fpsShow < 48) { slowT += 0.5; if (slowT >= 2 && dynScale > 0.6) { dynScale = Math.max(0.6, dynScale * 0.85); resize(); slowT = 0; } } else slowT = 0;
    }
    if (S.showFps || DEBUG) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0, p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      const size = new THREE.Vector2(); renderer.getDrawingBufferSize(size);
      const info = renderer.info.render;
      fpsBox.hidden = false;
      fpsBox.textContent = `${fpsShow.toFixed(0)} fps  p95 ${p95.toFixed(1)}ms  p99 ${p99.toFixed(1)}ms\n内部 ${size.x}×${size.y}（倍率 ${renderer.getPixelRatio().toFixed(2)}）画質 ${quality}${S.quality === 'auto' ? ` ×${dynScale.toFixed(2)}` : ''}\n描画 ${info.calls} 回  三角形 ${info.triangles}${vr.active ? '\n' + vr.stats() : ''}`;
    } else fpsBox.hidden = true;
  }
}

// ---------------------------------------------------------------- 起動
async function boot() {
  loadMsg('面を組み立てています…', 0.5);
  await new Promise((r) => setTimeout(r, 0));
  resize();
  startDemo();
  loadMsg('準備ができました', 1);
  renderer.setAnimationLoop(loop);
  await new Promise((r) => setTimeout(r, 60));
  $('loading').classList.remove('show');
  showTitle();
  if (Q.get('start')) beginRun({ mode: '2d', stage: Q.get('start') === 'tutorial' ? 'tutorial' : Math.max(0, Math.min(3, +Q.get('start') - 1)), practice: Q.get('start') !== '1' });
  if (Q.has('autoplay')) autoBot = 'auto';
}
boot().catch((e) => {
  loadMsg(`起動に失敗しました: ${e.message}\n「もう一度読み込む」を押してください。`, 1);
  $('load-retry').hidden = false; $('load-retry').onclick = () => location.reload();
  throw e;
});
