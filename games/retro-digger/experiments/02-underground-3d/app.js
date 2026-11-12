// 3D 坑道モード（通常 3D ＋ Meta Quest 3 の WebXR 没入型 VR）。ゲーム進行と世界は共通で、視点・入力・UI を切り替える。
import * as THREE from 'three';
import { createGame3D, createTutorial3D, step3d, nextStage3D, TUTORIAL_STEPS_3D, isSolidAt, circleFree } from '../../shared/game3d.js';
import { createWorld3D } from '../../shared/render3d.js';
import { drawMinimap } from '../../shared/minimap.js';
import { createVRMenu, createWristPanel } from '../../shared/vrui.js';
import { createInput } from '../../shared/input.js';
import { createMenu, CREDIT } from '../../shared/ui.js';
import { makeFrameClock } from '../../shared/frame-clock.js';
import { loadAudio, EVENT_SFX } from '../../shared/audio-safe.js';
import { DIFFICULTIES, DIFFICULTY_IDS, RULES, TUNE3D as T } from '../../shared/config.js';
import { STAGES_3D } from '../../shared/stages.js';
import { makeScore } from '../../shared/rules.js';
import * as save from '../../shared/save.js';

const DEBUG = /[?&]debug=1/.test(location.search);
const WANT_VR = /[?&]vr=1/.test(location.search);
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const $ = (id) => document.getElementById(id);
const S = save.settings();
const quality = S.quality === 'auto' ? (IS_QUEST ? 'standard' : 'high') : S.quality;

// ---------- 描画の準備 ----------
const cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(quality === 'high' ? 1.2 : 1.0);
const maxDpr = quality === 'high' ? 2 : 1.25;
function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
  renderer.setSize(innerWidth, innerHeight, false);
  world.resize(innerWidth, innerHeight);
}
const world = createWorld3D(renderer, { quality });
const { scene, rig, camera } = world;
addEventListener('resize', resize);

const input = createInput();
const audio = await loadAudio(S);
const menu = createMenu(document.body, { onSound: (n) => audio.play(n) });
const vrMenu = createVRMenu((n) => audio.play(n)); scene.add(vrMenu.mesh);
$('loading').remove();
resize();

let mode = 'menu';      // 'menu' | 'play' | 'paused'
let g = null, run = null;
let acc = 0, simT = 0;
const clock = makeFrameClock();
let unlocked = false;
async function ensureAudio() { if (unlocked) return; unlocked = true; try { await audio.unlock(); } catch {} }
addEventListener('pointerdown', ensureAudio, { capture: true });
addEventListener('keydown', ensureAudio, { capture: true });
function toast(t, ms = 1800) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), ms); }
const inXR = () => renderer.xr.isPresenting;
const playMode = () => (inXR() ? 'vr' : '3d');
const recKey = (kind) => save.recordKey(run && run.mode || playMode(), run ? run.difficulty : S.difficulty, kind === 'practice' ? 'practice' : 'run', S.vrMove);
const diffName = () => DIFFICULTIES[S.difficulty].label;

// ---------- 視点（通常 3D） ----------
let yaw = 0, pitch = 0, dragLook = false, lastMouse = null;
let mouseDown = false;
cv.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (mode === 'play' && !inXR()) {
    if (document.pointerLockElement !== cv && cv.requestPointerLock) { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { dragLook = true; }); } catch { dragLook = true; } }
    mouseDown = true;
  }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (mode !== 'play' || inXR()) return;
  const locked = document.pointerLockElement === cv;
  if (!locked && !(dragLook && mouseDown)) return;
  const k = 0.0023 * S.mouseSens;
  yaw -= e.movementX * k; pitch -= e.movementY * k * (S.invertY ? -1 : 1);
  pitch = Math.max(-1.35, Math.min(1.35, pitch));
});
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === cv;
  if (hadLock && !locked && mode === 'play') pause(); // 解除されたら一時停止
  hadLock = locked;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- VR の入力 ----------
const hands = { left: null, right: null }; // { src, ctrl, grip, prev: {} }
const ctrlObjs = [0, 1].map((i) => {
  const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 6).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.7 }));
  laser.visible = false; ctrl.add(laser);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8a4a26, roughness: 0.7 }));
  glove.scale.set(1, 0.8, 1.3); grip.add(glove);
  const o = { ctrl, grip, laser, glove, src: null, prev: {} };
  ctrl.addEventListener('connected', (e) => { o.src = e.data; hands[e.data.handedness] = o; layoutHands(); });
  ctrl.addEventListener('disconnected', () => { if (o.src) hands[o.src.handedness] = null; o.src = null; if (mode === 'play' && inXR()) pause(); });
  return o;
});
const wrist = createWristPanel();
const domHand = () => hands[S.leftHanded ? 'left' : 'right'] || hands.right || hands.left;
const offHand = () => hands[S.leftHanded ? 'right' : 'left'];
function layoutHands() {
  const d = domHand(), o = offHand();
  for (const h of ctrlObjs) { h.glove.visible = true; }
  if (d) { d.grip.add(world.nozzle); world.nozzle.position.set(0, -0.01, 0.02); world.nozzle.rotation.set(-0.35, 0, 0); d.glove.visible = false; }
  if (o) { o.grip.add(wrist.mesh); wrist.mesh.position.set(0, 0.06, 0.06); wrist.mesh.rotation.set(-1.1, 0, 0); }
}
function padOf(h) { return h && h.src && h.src.gamepad; }
function btn(h, i) { const gp = padOf(h); return !!(gp && gp.buttons[i] && gp.buttons[i].pressed); }
function axes(h) { const gp = padOf(h); if (!gp) return [0, 0]; const a = gp.axes; return a.length >= 4 ? [a[2], a[3]] : [a[0] || 0, a[1] || 0]; }
function edge(h, key, now) { if (!h) return false; const was = h.prev[key]; h.prev[key] = now; return now && !was; }

// ---------- 画面（DOM と VR で同じ項目を出す） ----------
let lastScreen = null;
function show(screen) {
  lastScreen = screen;
  if (inXR()) { menu.hide(); vrMenu.show(screen); vrMenu.place(camera); }
  else { vrMenu.hide(); menu.show(screen); }
}
function hideMenus() { menu.hide(); vrMenu.hide(); }

function titleScreen() {
  mode = 'menu'; $('hud').hidden = true; audio.music.start('title'); audio.amb.stop();
  if (document.pointerLockElement) document.exitPointerLock();
  const xrOk = xrSupported;
  const m = inXR() ? 'vr' : '3d';
  const hi = save.getRecord(save.recordKey(m, S.difficulty, 'run', S.vrMove)).hi;
  show({
    kicker: inXR() ? 'VR · META QUEST 3' : 'FIRST PERSON 3D', title: '地底探検：ポンプ・パトロール', credit: true,
    text: inXR() ? `利き手トリガーで掘る／ポンプ。反対の手のスティックで移動。\nハイスコア（${diffName()}・${S.vrMove === 'step' ? '快適移動' : 'スムーズ移動'}）: ${hi.toLocaleString()}`
      : `一人称で坑道を掘り進み、敵を膨らませ、天井の岩を落とす。\nハイスコア（${diffName()}）: ${hi.toLocaleString()}`,
    items: [
      ...(!inXR() && xrOk ? [{ label: 'VR で始める（Meta Quest 3）', sub: 'ヘッドセットの中でメニューが開きます', action: enterVR }] : []),
      { label: '難易度', kind: 'choice', get: () => S.difficulty, set: (v) => { save.setSetting('difficulty', v); titleScreen(); }, options: DIFFICULTY_IDS.map((id) => ({ value: id, label: DIFFICULTIES[id].label })) },
      { label: '通しプレイ', sub: '1〜6 面を続けて遊ぶ', action: () => startRun('run') },
      { label: '練習（ステージ選択）', action: practiceScreen },
      { label: '遊び方（チュートリアル）', action: () => startTutorial(null) },
      { label: '操作方法', action: helpScreen },
      { label: '設定', action: () => settingsScreen(titleScreen) },
      inXR() ? { label: 'VR を終わる', back: true, action: () => renderer.xr.getSession() && renderer.xr.getSession().end() }
        : { label: 'トップページへ戻る', back: true, action: () => { location.href = '../../'; } },
    ],
    onBack: () => {},
  });
}
function practiceScreen() {
  const m = playMode(); const n = DEBUG ? 6 : save.unlocked(m, S.difficulty);
  show({ kicker: 'PRACTICE · ' + diffName(), title: '練習するステージ',
    items: [...STAGES_3D.map((st, i) => ({ label: `${i + 1}. ${st.name}`, sub: i < n ? st.goal : 'まだ選べません', disabled: i >= n, action: () => startRun('practice', i) })), { label: '戻る', back: true, action: titleScreen }],
    onBack: titleScreen });
}
function helpScreen() {
  const vr = inXR();
  show({ kicker: 'HOW TO PLAY', title: '操作方法', wide: true, html: !vr,
    text: vr
      ? '利き手トリガー: 土を狙えば掘る／敵を狙えばポンプ（押したときに決まり、離すまで変わらない）\n反対の手のスティック: 移動（快適移動は 1 歩ずつフェード）\n利き手スティック左右: 向きを変える\nA／X: マップ　B／Y: 一時停止・設定'
      : '<table><tr><td>移動</td><td>WASD／矢印・左スティック</td></tr><tr><td>視点</td><td>マウス（画面をクリックで固定、Esc で解除＝一時停止）・右スティック</td></tr>' +
        '<tr><td>掘る／ポンプ</td><td>左クリック・Space・右トリガー（押した瞬間に狙っている物で決まる）</td></tr><tr><td>マップ</td><td>M・Y ボタン</td></tr><tr><td>一時停止</td><td>Esc／P・メニューボタン</td></tr></table>' +
        '\n<b>ルール</b>　木の支えを全部掘ると、天井の岩が揺れてから落ちる。床の赤い輪が落ちる場所。膨らんで止まった敵は安全。炎は土の壁で止まる。',
    items: [{ label: '戻る', back: true, action: titleScreen }], onBack: titleScreen });
}
function settingsScreen(back) {
  const vol = (k, label) => ({ label, kind: 'slider', get: () => S.vol[k], set: (v) => { S.vol[k] = v; save.persist(); audio.setVolumes(S.vol); } });
  show({ kicker: 'SETTINGS', title: '設定',
    items: [
      { label: 'VR の移動', kind: 'choice', get: () => S.vrMove, set: (v) => save.setSetting('vrMove', v), options: [{ value: 'step', label: '快適（ステップ）' }, { value: 'smooth', label: 'スムーズ' }] },
      { label: 'スムーズ移動の速さ', kind: 'choice', get: () => S.vrSpeed, set: (v) => save.setSetting('vrSpeed', v), options: [{ value: 0.7, label: 'ゆっくり' }, { value: 1.0, label: 'ふつう' }, { value: 1.3, label: 'はやい' }] },
      { label: '移動中の周辺暗転', kind: 'toggle', get: () => S.vrVignette, set: (v) => save.setSetting('vrVignette', v) },
      { label: '向きを変える角度', kind: 'choice', get: () => S.snapTurn, set: (v) => save.setSetting('snapTurn', v), options: [{ value: 30, label: '30°' }, { value: 45, label: '45°' }] },
      { label: '左利き', kind: 'toggle', get: () => S.leftHanded, set: (v) => { save.setSetting('leftHanded', v); layoutHands(); } },
      vol('master', '全体の音量'), vol('bgm', '音楽'), vol('sfx', '効果音'), vol('amb', '環境音'),
      { label: 'マウス感度', kind: 'choice', get: () => S.mouseSens, set: (v) => save.setSetting('mouseSens', v), options: [{ value: 0.6, label: '低' }, { value: 1.0, label: '中' }, { value: 1.5, label: '高' }] },
      { label: '画質（次に開いたとき）', kind: 'choice', get: () => S.quality, set: (v) => save.setSetting('quality', v), options: [{ value: 'auto', label: '自動' }, { value: 'high', label: '高画質' }, { value: 'standard', label: '標準' }] },
      { label: 'FPS を表示', kind: 'toggle', get: () => S.showFps, set: (v) => save.setSetting('showFps', v) },
      { label: '戻る', back: true, action: back }],
    onBack: back });
}

// ---------- プレイ ----------
function startRun(kind, stageIndex = 0) {
  run = { kind, difficulty: S.difficulty, mode: playMode() };
  const tk = inXR() ? '3d' : '3d';
  if (kind === 'run' && !S.tutorialDone[tk]) { startTutorial(() => startRun(kind, stageIndex)); return; }
  g = createGame3D({ difficulty: S.difficulty, stageIndex, score: makeScore(), seed: Date.now() & 0xffff });
  beginStage();
}
function startTutorial(after) {
  run = { kind: 'tutorial', difficulty: S.difficulty, mode: playMode(), after };
  g = createTutorial3D({ difficulty: 'easy', score: makeScore() });
  g.tutTargets = TUTORIAL_STEPS_3D.map((s) => s.target);
  beginStage();
}
async function beginStage() {
  hideMenus(); $('hud').hidden = inXR(); mode = 'play'; input.reset(); g._trig = true;
  placeAtStart();
  updateHud(true);
  audio.music.stop(); audio.amb.start(g.map.theme);
  if (!g.tut) { g.holdStart = true; banner(`STAGE ${g.stageIndex + 1}　${g.map.name}`, g.map.goal); await audio.jingle('start'); g.holdStart = false; }
  audio.music.start(g.tut ? 'tutorial' : 'stage-' + g.map.theme);
}
// 開始・復活位置に立たせる（VR は頭の位置が開始点に来るように rig を動かす）
function placeAtStart(pos) {
  const P = g.player; const [x, z] = pos || [P.sx, P.sz];
  if (inXR()) {
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    // 向き: 開始時の向きへ（頭のヨーを打ち消す）
    const d = new THREE.Vector3(); camera.getWorldDirection(d); const headYaw = Math.atan2(-d.x, -d.z);
    const turn = P.yaw - headYaw; rotateRigAroundHead(turn);
    camera.getWorldPosition(head);
    rig.position.x += x - head.x; rig.position.z += z - head.z;
    P.x = P.bx = x; P.z = P.bz = z;
  } else { yaw = P.yaw; pitch = 0; P.x = P.bx = x; P.z = P.bz = z; }
}
function rotateRigAroundHead(a) {
  const head = new THREE.Vector3(); camera.getWorldPosition(head);
  rig.rotation.y += a;
  rig.updateMatrixWorld(true);
  const h2 = new THREE.Vector3(); camera.getWorldPosition(h2);
  rig.position.x += head.x - h2.x; rig.position.z += head.z - h2.z;
}
function pause() {
  if (mode !== 'play') return;
  mode = 'paused'; audio.suspend(); input.reset(); stepFade.t = -1;
  if (document.pointerLockElement) document.exitPointerLock();
  show({ kicker: 'PAUSE', title: '一時停止', credit: true,
    items: [
      { label: '続ける', action: resume },
      { label: 'マップを見る', action: () => { mapBig = true; resume(); } },
      { label: '設定', action: () => settingsScreen(() => { mode = 'play'; pause(); }) },
      ...(g.tut ? [{ label: 'チュートリアルを飛ばす', action: finishTutorial }] : [{ label: 'この面をやり直す', action: retryStage }]),
      { label: 'タイトルへ', back: true, action: () => { audio.resume(); audio.music.stop(); titleScreen(); } },
    ], onBack: resume });
}
function resume() { hideMenus(); mode = 'play'; input.reset(); audio.resume(); $('hud').hidden = inXR(); for (const h of ctrlObjs) h.prev = { trig: true }; if (g) g._trig = true; }
function retryStage() { audio.resume(); g = createGame3D({ difficulty: run.difficulty, stageIndex: g.stageIndex, score: makeScore(), seed: Date.now() & 0xffff }); beginStage(); }
function finishTutorial() { S.tutorialDone['3d'] = true; save.persist(); audio.resume(); const a = run.after; if (a) a(); else titleScreen(); }

function afterClear() {
  mode = 'menu'; if (document.pointerLockElement) document.exitPointerLock();
  if (g.tut) { show({ kicker: 'TUTORIAL', title: 'チュートリアル完了', text: '本番の敵は道をたどって追ってくる。体が揺れて砂の輪郭になったら、土を通り抜けてくる合図。', items: [{ label: run.after ? '通しプレイを始める' : 'タイトルへ', action: finishTutorial }], onBack: finishTutorial }); return; }
  const idx = g.stageIndex;
  save.unlock(run.mode, run.difficulty, idx + 2);
  if (run.kind === 'practice') {
    const better = save.submitRecord(recKey('practice'), g.score.score, idx + 1);
    show({ kicker: 'PRACTICE CLEAR', title: `${idx + 1}. ${STAGES_3D[idx].name} クリア`, text: `得点 ${g.score.score.toLocaleString()}${better ? '　練習の最高記録！' : ''}`,
      items: [...(idx + 1 < 6 ? [{ label: `次の面を練習`, action: () => startRun('practice', idx + 1) }] : []), { label: 'もう一度', action: () => startRun('practice', idx) }, { label: 'タイトルへ', back: true, action: titleScreen }], onBack: titleScreen });
    return;
  }
  if (idx + 1 >= STAGES_3D.length) {
    const better = save.submitRecord(recKey('run'), g.score.score, 6);
    audio.jingle(better ? 'highscore' : 'allclear');
    show({ kicker: 'ALL CLEAR', title: '全 6 面クリア！', credit: true, text: `最終得点 ${g.score.score.toLocaleString()}　残機 ${g.lives}${better ? '\nハイスコア更新！' : ''}`,
      items: [{ label: '新しく挑戦する', action: () => startRun('run') }, { label: 'タイトルへ', back: true, action: titleScreen }], onBack: titleScreen });
    return;
  }
  show({ kicker: `STAGE ${idx + 1} CLEAR`, title: `${STAGES_3D[idx].name} クリア`, text: `得点 ${g.score.score.toLocaleString()}（クリア +${RULES.score.clear}）　残機 ${g.lives}\n次: ${idx + 2}. ${STAGES_3D[idx + 1].name}`,
    items: [{ label: '次の面へ', action: () => { nextStage3D(g); beginStage(); } }, { label: 'タイトルへ（記録して終わる）', back: true, action: () => { save.submitRecord(recKey('run'), g.score.score, idx + 1); titleScreen(); } }], onBack: () => {} });
}
function gameOver() {
  mode = 'menu'; if (document.pointerLockElement) document.exitPointerLock();
  const better = save.submitRecord(recKey(run.kind), g.score.score, g.stageIndex);
  show({ kicker: 'GAME OVER', title: 'ゲームオーバー', text: `得点 ${g.score.score.toLocaleString()}　${g.stageIndex + 1} 面まで${better ? '\nハイスコア更新！' : ''}`,
    items: [{ label: '新しく挑戦する', action: () => startRun(run.kind, run.kind === 'practice' ? g.stageIndex : 0) }, { label: 'タイトルへ', back: true, action: titleScreen }], onBack: titleScreen });
}

// ---------- 音 ----------
function onEvents() {
  const head = new THREE.Vector3(); camera.getWorldPosition(head);
  const d = new THREE.Vector3(); camera.getWorldDirection(d); const hy = Math.atan2(d.x, d.z);
  for (const e of g.events) {
    const name = EVENT_SFX[e.type];
    let pan = 0, gain = 1;
    const src = e.enemy || e.rock;
    if (src) { const a = Math.atan2(src.x - head.x, src.z - head.z) - hy; pan = Math.max(-1, Math.min(1, -Math.sin(a))) * 0.8; gain = Math.max(0.35, 1 - Math.hypot(src.x - head.x, src.z - head.z) / 25); }
    if (name) audio.play(name, { pan, gain, stage: e.stage || (e.count | 0) });
    if (e.type === 'digging') audio.play('dig', { gain: 0.6 });
    if (e.type === 'pop' || e.type === 'rock-crush') audio.play('score-pop');
    if (e.type === 'miss') { audio.music.stop(); audio.jingle('miss'); }
    if (e.type === 'respawn') audio.music.start('stage-' + g.map.theme);
    if (e.type === 'miss-soft') toast('あぶない！ 開始位置に戻ります');
    if (e.type === 'clear') { audio.music.stop(); if (!g.tut) audio.jingle('clear'); }
    if (e.type === 'gameover') { audio.music.stop(); audio.jingle('gameover'); }
    if (e.type === 'extra') toast('残機が 1 つ増えた！');
  }
}

// ---------- HUD ----------
let hudKey = '', mapBig = false;
function updateHud(force) {
  if (!g) return;
  const hi = Math.max(g.score.score, save.getRecord(recKey(run.kind)).hi);
  const goal = g.tut ? TUTORIAL_STEPS_3D[g.tut.step].text : '';
  const key = [g.score.score, hi, g.lives, g.stageIndex, goal].join('|');
  if (force || key !== hudKey) {
    hudKey = key;
    $('h-score').textContent = g.score.score.toLocaleString(); $('h-hi').textContent = hi.toLocaleString();
    $('h-lives').innerHTML = '<i></i>'.repeat(Math.min(8, g.lives));
    $('h-stage').textContent = g.tut ? 'TUTORIAL' : `STAGE ${g.stageIndex + 1} / 6`; $('h-sname').textContent = g.tut ? 'れんしゅう' : g.map.name;
    $('h-diff').textContent = (run.kind === 'practice' ? '練習・' : '') + DIFFICULTIES[run.difficulty].label;
    $('h-goal').textContent = goal;
    wristDirty = true;
  }
  const cross = $('cross'); const k = g.act || (g.aim ? g.aim.kind : 'none'); cross.className = 'cross ' + (k === 'dig' || k === 'pump' ? k : '');
}
let wristDirty = true, wristT = 0, bannerText = null, bannerT = 0;
function banner(a, b) { bannerText = [a, b]; bannerT = 3.0; if (!inXR()) toast(a + (b ? '　' + b : ''), 2600); }
function drawWrist(t) {
  const c = wrist.ctx, W = wrist.canvas.width, Hh = wrist.canvas.height;
  c.clearRect(0, 0, W, Hh);
  c.fillStyle = 'rgba(14,9,7,0.9)'; c.beginPath(); c.roundRect(0, 0, W, Hh, 40); c.fill();
  c.fillStyle = '#ffc93c'; c.font = '700 34px ui-monospace, monospace'; c.fillText(g.tut ? 'TUTORIAL' : `STAGE ${g.stageIndex + 1}/6`, 30, 56);
  c.fillStyle = '#fff'; c.font = '900 64px ui-monospace, monospace'; c.fillText(g.score.score.toLocaleString(), 30, 130);
  c.fillStyle = '#ffd9b0'; for (let i = 0; i < Math.min(8, g.lives); i++) { c.beginPath(); c.arc(50 + i * 52, 180, 20, 0, 7); c.fill(); }
  drawMinimap(c, g, 40, 230, W - 80, { yaw: headYaw(), t });
  if (mapBig) { c.fillStyle = '#ffc93c'; c.font = '700 28px system-ui'; c.fillText('A/X: マップを閉じる', 30, Hh - 24); }
  wrist.tex.needsUpdate = true;
}
function headYaw() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return Math.atan2(-d.x, -d.z); }
// VR の大きなマップ・面の案内（目の前の板）
const bigCanvas = document.createElement('canvas'); bigCanvas.width = bigCanvas.height = 900;
const bigTex = new THREE.CanvasTexture(bigCanvas); bigTex.colorSpace = THREE.SRGBColorSpace;
const bigPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: bigTex, transparent: true, depthTest: false }));
bigPanel.renderOrder = 40; bigPanel.visible = false; scene.add(bigPanel);
const bannerCanvas = document.createElement('canvas'); bannerCanvas.width = 1400; bannerCanvas.height = 300;
const bannerTex = new THREE.CanvasTexture(bannerCanvas); bannerTex.colorSpace = THREE.SRGBColorSpace;
const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, depthTest: false }));
bannerMesh.renderOrder = 41; bannerMesh.visible = false; scene.add(bannerMesh);
function placeInFront(mesh, dist, dy) {
  const p = new THREE.Vector3(); camera.getWorldPosition(p); const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize();
  mesh.position.copy(p).addScaledVector(d, dist); mesh.position.y = p.y + dy; mesh.lookAt(p.x, mesh.position.y, p.z);
}

// ---------- 快適移動（ステップとフェード） ----------
const stepFade = { t: -1, dir: null, cool: 0 };
let snapArmed = true, headFade = 0;

// ---------- 1 tick 分の入力を作る ----------
function buildInput(inp, dt) {
  const P = g.player;
  const out = { move: null, step: null, locomoting: false, aim: null, trigger: false, body: null };
  if (inXR()) {
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    out.body = [head.x, head.z];
    const dh = domHand(), oh = offHand();
    // 狙い: 利き手のコントローラーの向き
    if (dh) {
      const o = new THREE.Vector3(), q = new THREE.Quaternion(); dh.ctrl.getWorldPosition(o); dh.ctrl.getWorldQuaternion(q);
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      out.aim = { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] };
      out.trigger = btn(dh, 0);
    }
    const [sx, sy] = axes(oh);
    const mag = Math.hypot(sx, sy);
    const hy = headYaw();
    // スティックの向きを頭の向きに合わせて水平の方向へ
    const fx = -Math.sin(hy), fz = -Math.cos(hy), rx = Math.cos(hy), rz = -Math.sin(hy);
    const wx = fx * -sy + rx * sx, wz = fz * -sy + rz * sx;
    if (S.vrMove === 'smooth') {
      if (mag > 0.2) { const sp = T.moveSpeed * S.vrSpeed * Math.min(1, (mag - 0.2) / 0.7) * dt / Math.max(1e-3, Math.hypot(wx, wz)); out.move = [wx * sp, wz * sp]; out.locomoting = true; }
    } else {
      stepFade.cool = Math.max(0, stepFade.cool - dt);
      if (mag > 0.7 && stepFade.t < 0 && stepFade.cool <= 0) { stepFade.t = 0; stepFade.dir = [wx, wz]; }
      if (stepFade.t >= T.stepFade / 2 && stepFade.dir) { out.step = [stepFade.dir[0], stepFade.dir[1], T.stepDist]; stepFade.dir = null; }
      out.locomoting = mag > 0.7;
    }
    // スナップターン（利き手スティック左右）
    const [tx] = axes(dh);
    if (snapArmed && Math.abs(tx) > 0.7) { rotateRigAroundHead(-Math.sign(tx) * S.snapTurn * Math.PI / 180); snapArmed = false; }
    if (Math.abs(tx) < 0.3) snapArmed = true;
  } else {
    // 通常 3D: WASD／矢印＋左スティック、マウス／右スティックで視点
    const a = inp.axes; const held = inp.heldDirs;
    let mx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + a.lx, mz = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0) + a.ly;
    const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
    yaw -= a.rx * 2.6 * dt * S.mouseSens; pitch -= a.ry * 2.0 * dt * S.mouseSens * (S.invertY ? -1 : 1); pitch = Math.max(-1.35, Math.min(1.35, pitch));
    if (L > 0.05) {
      const sp = T.moveSpeed * dt; const s = Math.sin(yaw), c = Math.cos(yaw);
      out.move = [(mx * c + mz * s) * sp, (-mx * s + mz * c) * sp]; out.locomoting = L > 0.3;
    }
    const o = new THREE.Vector3(); camera.getWorldPosition(o); const d = new THREE.Vector3(); camera.getWorldDirection(d);
    out.aim = { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] };
    out.trigger = mouseDown || inp.pump || a.rt > 0.5;
    P.yaw = yaw;
  }
  return out;
}

// ---------- ループ ----------
let fpsN = 0, fpsT = 0, fps = 0, frameMs = 0, lostT = 0;
const tmp = new THREE.Vector3();
renderer.setAnimationLoop((now, frame) => {
  const t0 = performance.now();
  input.poll();
  const inp = input.read();
  const dt = clock(now);
  const xr = inXR();
  // メニュー操作
  if (!xr && menu.open) menu.handle(inp);
  if (xr) vrMenuInput(dt);
  if (xr && frame && mode === 'play') { // 追跡の喪失 → 一時停止
    const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (!pose || pose.emulatedPosition) { lostT += dt; if (lostT > 0.5) { pause(); toast('位置の追跡が途切れたので一時停止しました'); } } else lostT = 0;
  }
  if (mode === 'play' && g) {
    if (!xr && (inp.pressed.has('pause') || (inp.pressed.has('back') && inp.device === 'gamepad'))) pause();
    else if (!xr && inp.pressed.has('map')) mapBig = !mapBig;
    if (mode === 'play' && !g.holdStart) {
      if (stepFade.t >= 0) { stepFade.t += dt; if (stepFade.t >= T.stepFade) { stepFade.t = -1; stepFade.cool = T.stepCooldown; } }
      acc = Math.min(acc + dt, 0.25);
      while (acc >= RULES.tick) {
        const P = g.player; const bx = P.x, bz = P.z;
        const ti = buildInput(inp, RULES.tick);
        step3d(g, ti);
        if (xr && ti.body) { // ロジックが動かした分だけ rig を動かす（頭の実際の動きはそのまま）
          rig.position.x += P.x - ti.body[0]; rig.position.z += P.z - ti.body[1];
        }
        void bx; void bz;
        onEvents();
        inp.pressed.clear();
        acc -= RULES.tick; simT += RULES.tick;
        if (g.phase === 'clear' || g.phase === 'over') break;
      }
      audio.music.setWalking(g.phase === 'play' && g.player.moved > 0.001 && !g.tut);
      if (g.phase === 'clear' && g.phaseT >= RULES.clearDuration * 0.6) afterClear();
      else if (g.phase === 'over') { g.phase = 'overShown'; setTimeout(gameOver, 1800); }
    }
    updateHud();
  } else audio.music.setWalking(false);
  // 視点
  if (!xr && g) { rig.position.set(g.player.x, 0, g.player.z); rig.rotation.set(0, 0, 0); camera.position.set(0, T.eye, 0); camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
  if (!xr && !g) { rig.position.set(0, 0, 0); }
  // 道具の位置
  if (!xr) { if (world.nozzle.parent !== camera) camera.add(world.nozzle); world.nozzle.position.set(0.17, -0.16, -0.36); world.nozzle.rotation.set(0.08, 0.12, 0); world.nozzle.scale.setScalar(0.65); world.nozzle.visible = !!g && mode === 'play'; }
  else world.nozzle.visible = true;
  if (g) {
    const handPos = new THREE.Vector3(); world.nozzle.localToWorld(handPos.copy(world.nozzle.userData.muzzle));
    const o = new THREE.Vector3(); camera.getWorldPosition(o);
    world.update(g, mode === 'play' ? acc / RULES.tick : 1, simT, mode === 'play' ? dt : 0, { aimO: o, handPos, vr: xr });
  }
  // VR: レーザー・頭が壁に入ったときの暗転・周辺暗転・ステップのフェード
  if (xr) {
    for (const h of ctrlObjs) h.laser.visible = false;
    const dh = domHand();
    if (dh && mode === 'play' && g && g.aim) {
      const k = g.act || g.aim.kind; dh.laser.visible = true;
      const len = g.aim.enemy && k !== 'dig' ? g.aim.enemyT : g.aim.cell ? Math.min(6, g.aim.cell.t) : 6;
      dh.laser.scale.set(1, 1, Math.max(0.05, len)); dh.laser.material.color.set(k === 'pump' ? 0x5fe0b5 : k === 'dig' ? 0xffc93c : 0xaaaaaa);
    }
    camera.getWorldPosition(tmp);
    const inWall = g && (isSolidAt(g.map, tmp.x, tmp.z) || !circleFree(g, tmp.x, tmp.z, 0.12));
    headFade += ((inWall ? 0.92 : 0) - headFade) * Math.min(1, dt * 12);
    let f = headFade;
    if (stepFade.t >= 0) f = Math.max(f, 1 - Math.abs(stepFade.t / (T.stepFade / 2) - 1));
    world.setFade(f);
    const moving = S.vrMove === 'smooth' && S.vrVignette && g && g.player.locoT > 0;
    world.setVignette(moving ? 0.85 : 0);
    wristT += dt; if (g && (wristDirty || wristT > 0.1)) { drawWrist(simT); wristT = 0; wristDirty = false; }
    wrist.mesh.visible = !!g;
    // 大きなマップ
    bigPanel.visible = mapBig && !!g && mode === 'play';
    if (bigPanel.visible) { const c = bigCanvas.getContext('2d'); c.clearRect(0, 0, 900, 900); drawMinimap(c, g, 40, 40, 820, { full: true, yaw: headYaw(), t: simT }); bigTex.needsUpdate = true; if (!bigPanel.userData.placed) { placeInFront(bigPanel, 1.2, -0.15); bigPanel.userData.placed = true; } }
    else bigPanel.userData.placed = false;
    // 面の案内
    bannerT -= dt; bannerMesh.visible = bannerT > 0 && !!bannerText;
    if (bannerMesh.visible) {
      if (bannerMesh.userData.text !== bannerText) {
        const c = bannerCanvas.getContext('2d'); c.clearRect(0, 0, 1400, 300); c.fillStyle = 'rgba(14,9,7,0.85)'; c.beginPath(); c.roundRect(0, 0, 1400, 300, 40); c.fill();
        c.fillStyle = '#ffc93c'; c.font = '900 76px system-ui, "Noto Sans JP", sans-serif'; c.textAlign = 'center'; c.fillText(bannerText[0], 700, 120);
        c.fillStyle = '#fff'; c.font = '600 44px system-ui, "Noto Sans JP", sans-serif'; c.fillText(bannerText[1] || '', 700, 210);
        bannerTex.needsUpdate = true; bannerMesh.userData.text = bannerText; placeInFront(bannerMesh, 1.8, 0.35);
      }
    }
    vrMenu.tick();
  } else {
    world.setFade(0); world.setVignette(0);
    const mc = $('mapc');
    if (g && mode === 'play') { mc.classList.toggle('big', mapBig); const c = mc.getContext('2d'); c.clearRect(0, 0, mc.width, mc.height); drawMinimap(c, g, 24, 30, mc.width - 48, { full: mapBig, yaw, t: simT }); }
  }
  if (!g) idleScene(now / 1000);
  renderer.render(scene, camera);
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
  fpsN++; if (now - fpsT > 500) { fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now;
    if ((S.showFps || DEBUG) && g) { const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); $('h-diff').textContent = `${fps}fps · CPU ${frameMs.toFixed(1)}ms · ${sz.x}×${sz.y} · ${renderer.info.render.calls} draws`; } }
});

// タイトルの背景: 最初の面をゆっくり見回す
let idleG = null;
function idleScene(t) {
  if (!idleG) { idleG = createGame3D({ difficulty: 'easy' }); idleG.phase = 'play'; }
  if (!inXR()) { rig.position.set(idleG.player.x, 0, idleG.player.z); camera.position.set(0, T.eye, 0); camera.rotation.set(-0.05, idleG.player.yaw + Math.sin(t * 0.2) * 0.8, 0, 'YXZ'); }
  const o = new THREE.Vector3(); camera.getWorldPosition(o);
  world.update(idleG, 1, t, 1 / 60, { aimO: o, handPos: null });
}

// ---------- VR メニューの操作（レーザー＋トリガー、スティック上下＋A） ----------
let menuStickArmed = true;
function vrMenuInput(dt) {
  // 一時停止・マップのボタン（システム予約ボタンは使わない）。A/X = buttons[4]、B/Y = buttons[5]
  for (const h of [hands.left, hands.right]) {
    if (!h) continue;
    const a = edge(h, 'a', btn(h, 4)), b = edge(h, 'b', btn(h, 5));
    if (mode === 'play') { if (b) pause(); else if (a) mapBig = !mapBig; }
    else if (vrMenu.open && b) vrMenu.back();
  }
  if (!vrMenu.open) { for (const h of ctrlObjs) if (h.src) h.prev.trig = btn(h, 0); return; }
  let hovered = -1;
  for (const h of ctrlObjs) {
    if (!h.src) continue;
    const o = new THREE.Vector3(), q = new THREE.Quaternion(); h.ctrl.getWorldPosition(o); h.ctrl.getWorldQuaternion(q);
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const hit = vrMenu.pick(o, d);
    h.laser.visible = true; h.laser.scale.z = hit ? o.distanceTo(hit.point) : 1.5; h.laser.material.color.set(hit && hit.idx >= 0 ? 0xffc93c : 0xffffff);
    if (hit && hit.idx >= 0) hovered = hit.idx;
    if (edge(h, 'trig', btn(h, 0)) && hit && hit.idx >= 0) vrMenu.activate(hit.idx, hit.side);
  }
  vrMenu.setHover(hovered);
  // スティック上下で選び、A（どちらの手でも）で決定
  let sy = 0; for (const h of [hands.left, hands.right]) { const [, y] = axes(h); if (Math.abs(y) > Math.abs(sy)) sy = y; }
  if (menuStickArmed && Math.abs(sy) > 0.7) { vrMenu.move(sy > 0 ? 1 : -1); menuStickArmed = false; }
  if (Math.abs(sy) < 0.3) menuStickArmed = true;
  for (const h of [hands.left, hands.right]) if (h && h.prev.a && !h.prev.aUsed) { h.prev.aUsed = true; vrMenu.activate(vrMenu.focus, 1); }
  for (const h of [hands.left, hands.right]) if (h && !h.prev.a) h.prev.aUsed = false;
}

// ---------- WebXR の開始・終了 ----------
let xrSupported = false;
async function enterVR() {
  if (!navigator.xr) { toast('このブラウザは WebXR に対応していません'); return; }
  try {
    await ensureAudio();
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    session.addEventListener('end', onXREnd);
    session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') { if (mode === 'play') pause(); audio.suspend(); } else audio.resume(); });
    await renderer.xr.setSession(session);
    try { renderer.xr.setFoveation(quality === 'high' ? 0.3 : 0.6); } catch {}
    try { if (session.updateTargetFrameRate && session.supportedFrameRates && [...session.supportedFrameRates].includes(72)) await session.updateTargetFrameRate(72); } catch {}
    rig.rotation.set(0, 0, 0); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
    input.reset();
    xrInfo(session);
    setTimeout(() => { if (mode === 'play' && g) { placeAtStart([g.player.x, g.player.z]); pause(); } else titleScreen(); }, 300);
  } catch (e) {
    toast('VR を開始できませんでした: ' + (e && e.message || e), 4000);
  }
}
function xrInfo(session) {
  const l = session.renderState.baseLayer; if (!l) return;
  window.__xrInfo = { framebuffer: [l.framebufferWidth, l.framebufferHeight], perEye: [l.framebufferWidth / 2, l.framebufferHeight], frameRate: session.frameRate || null };
  if (DEBUG) toast(`VR 描画 ${l.framebufferWidth}×${l.framebufferHeight}（片眼 ${l.framebufferWidth / 2}×${l.framebufferHeight}）${session.frameRate ? ' ' + session.frameRate + 'Hz' : ''}`, 5000);
}
function onXREnd() {
  // VR を出たら安全に一時停止し、入力を初期化して HTML のメニューへ
  vrMenu.hide(); bigPanel.visible = false; bannerMesh.visible = false;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  for (const h of ctrlObjs) { h.prev = {}; }
  input.reset();
  if (mode === 'play') pause();
  else if (lastScreen) setTimeout(() => show(lastScreen), 0);
  else titleScreen();
  resize();
}
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => { xrSupported = ok; if (mode === 'menu' && !g) titleScreen(); if (WANT_VR && !ok) toast('このブラウザでは VR を使えません。通常の 3D で遊べます', 4000); }).catch(() => {});
} else if (WANT_VR) toast('このブラウザは WebXR に対応していません。通常の 3D で遊べます', 4000);

// タブ非表示・フォーカス喪失で一時停止
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'play' && !inXR()) pause(); if (!inXR()) audio.suspend(); } });
addEventListener('blur', () => { if (mode === 'play' && !inXR()) pause(); });

if (DEBUG) {
  window.__game = () => g; window.__world = world; window.__renderer = renderer;
  addEventListener('keydown', (e) => { if (!g || mode !== 'play') return; if (e.code === 'KeyN') for (const en of g.enemies) en.alive = false; if (e.code === 'KeyI') { g.player.guard = 9999; toast('無敵'); } });
}
window.__credit = CREDIT;
titleScreen();
