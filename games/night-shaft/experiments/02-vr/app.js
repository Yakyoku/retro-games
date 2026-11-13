// NIGHT SHAFT VR 版（Meta Quest 3 のブラウザ・WebXR immersive-vr）。WebXR が無い環境では「画面で遊ぶ（3D）」で同じゲームを確認できる。
// 頭の追跡（XR カメラ）は書き換えない。移動・乗車・テレポートはすべて「移動リグ（dolly）」を動かして表す。
import * as THREE from 'three';
import { installErrorOverlay } from '../../shared/ui/error-overlay.js';
import { Game, STAGES } from '../../shared/core/game.js';
import { DIFF, W, CAR_W, FLOOR_H, level, floorOf, E as EN, P as PL } from '../../shared/core/const.js';
import { Save } from '../../shared/core/save.js';
import { AudioEngine, playGameEvents, DEFAULT_VOLUME } from '../../shared/audio/engine.js';
import { STAGE_SONG } from '../../shared/audio/songs2.js';
import { LOOK } from '../../shared/art/palette.js';
import { Animator, enemyAnimState } from '../../shared/art/pose.js';
import { World3D, lampLight, ZB, ZF, ESC_Z0, ESC_Z1 } from './world3d.js';
import { Person3D, makeGunModel, makeHandModel } from './chars3d.js';
import { MenuPanel, WristHud, MessagePanel } from './vrui.js';

installErrorOverlay('NIGHT SHAFT VR');
const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');
const save = new Save('vr');
const S = save.data.settings; const VS = S.vr;
const audio = new AudioEngine({ ...DEFAULT_VOLUME, ...(S.volume || {}) });
const SITE_2D = 'https://night-shaft-2d.netlify.app/';
$('#link-2d').href = SITE_2D;

// VR 用のチュートリアルのヒント（2D 版の同じ場所に対応）
const VR_HINTS = [
  '左スティックを倒して床を狙い、戻すとテレポート。右の昇降路へ',
  'かごの中で右スティックを上下（または操作盤をレイで押す）。離すと次の階で止まる',
  '敵はバイザーが光ってから撃つ。右トリガーで射撃。しゃがむ（A／本当にしゃがむ）と高い弾をよけられる',
  '赤いドア（書類マーク）を左手のレイで指して左トリガー。書類を回収',
  'かごに戻って 4 階へ',
  '遮蔽物は弾を止める。しゃがんで隠れられる',
  'エスカレーターの「下り」の看板をレイで押すと下の階へ',
  '天井の照明を撃つと落ちる。下の敵を倒せる',
  'かごが居ない昇降路は赤いレーザーで閉じている。横のボタンをレイで押すとかごを呼べる',
  '低い弾は横へ動く（本当に動くか Y）とよけられる。近くの敵には X でキック',
  '書類をすべて持って、1 階の右の出口へ',
];

// ---- three の基本 ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('#view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060b);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 900);
camera.rotation.order = 'YXZ';
const dolly = new THREE.Group(); dolly.add(camera); scene.add(dolly);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a3026, 1.25));
const sun = new THREE.DirectionalLight(0xfff0dd, 0.7); sun.position.set(3, 10, 6); scene.add(sun);
const rimLight = new THREE.DirectionalLight(0x6fa0ff, 0.55); rimLight.position.set(-4, 5, -8); scene.add(rimLight); // 背後からの青い縁取り光
addEventListener('resize', () => { if (renderer.xr.isPresenting) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// 暗転（XR では頭の周りの黒い球、画面では DOM）とビネット
const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }));
fadeMesh.renderOrder = 100; camera.add(fadeMesh);
const vignette = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.9, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false }));
vignette.position.z = -0.3; vignette.renderOrder = 99; camera.add(vignette);
let fadeV = 0, fadeTarget = 0, fadeColor = 0x000000, vigV = 0;
function setFade(v, color = 0x000000) { fadeTarget = v; fadeColor = color; }

// ---- 状態 ----
let mode = 'none';   // xr | flat
let state = 'top';   // top | play | menu
let game = null, world = null;
let run = null;      // { stage, difficulty, score, lives, stageStartScore }
let menuModel = null, menuBack = null;
let virtualCrouch = false, standH = 1.62, snapLock = false, teleporting = null, carStick = 0, carBtnDir = 0, carPulse = 0, playTime = 0, bgmAt = 0;
let audioOn = false, rigPending = 0;

// ---- コントローラー ----
const hands = { left: null, right: null };
const ctrls = [0, 1].map((i) => {
  const ray = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  dolly.add(ray); dolly.add(grip);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.8 }));
  line.scale.z = 4; line.visible = false; ray.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.visible = false; scene.add(dot);
  const c = { i, ray, grip, line, dot, src: null, hand: null, prev: {}, model: null };
  ray.addEventListener('connected', (e) => { c.src = e.data; c.hand = e.data.handedness; hands[c.hand] = c; attachModels(); });
  ray.addEventListener('disconnected', () => { if (c.hand && hands[c.hand] === c) hands[c.hand] = null; const wasGun = c.hand === gunHandName(); c.src = null; c.hand = null; if (wasGun && state === 'play') { pauseGame(); msg.set('コントローラーが切断されました。もう一度接続してください', 4); } });
  return c;
});
const gunModel = makeGunModel(); const handModel = makeHandModel();
const gunHandName = () => (VS.leftHanded ? 'left' : 'right');
const rayHandName = () => (VS.leftHanded ? 'right' : 'left');
function attachModels() {
  for (const c of ctrls) { if (c.model) { c.model.removeFromParent(); c.model = null; } }
  const gh = hands[gunHandName()], rh = hands[rayHandName()];
  // 銃は「指している向き」（target ray）に取り付ける。弾もこの向きに飛ぶので、見た目と照準がずれない
  if (gh) { gh.ray.add(gunModel); gunModel.rotation.set(0, 0, 0); gunModel.position.set(0, -0.035, 0.06); gh.model = gunModel; gh.modelOn = gh.ray; }
  if (rh) { rh.grip.add(handModel); handModel.rotation.set(-0.4, 0, 0); rh.model = handModel; rh.grip.add(wrist.mesh); wrist.mesh.position.set(0, 0.035, 0.09); wrist.mesh.rotation.set(-Math.PI / 2 - 0.5, 0, 0); }
}

// ---- VR の UI ----
const menuPanel = new MenuPanel(); menuPanel.mesh.visible = false; scene.add(menuPanel.mesh);
const wrist = new WristHud();
const msg = new MessagePanel(); scene.add(msg.mesh);
const flatGun = makeGunModel(); flatGun.scale.setScalar(0.8); flatGun.position.set(0.2, -0.19, -0.42); flatGun.visible = false; camera.add(flatGun);

// テレポートの弧と目印
const arcGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, () => new THREE.Vector3()));
const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x7fe0ff })); arc.visible = false; arc.frustumCulled = false; scene.add(arc);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 32), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);

// ---- 敵・弾・火花の見た目 ----
const enemyModels = new Map(); const pool = [[], [], []];
const ebPool = []; const ebMap = new WeakMap(); const pbPool = []; const projectiles = []; const sparks = [];
const ebGeo = new THREE.SphereGeometry(0.07, 12, 8), ebMat = new THREE.MeshBasicMaterial({ color: 0xffe0c0 });
const ebHaloMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.45, depthWrite: false });
const trailMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.55, depthWrite: false });
const pbMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0 });
const sparkGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
function getEnemyModel(e) {
  let m = enemyModels.get(e.id);
  if (!m) { m = pool[e.type].pop() || new Person3D(LOOK.guard[e.type] || LOOK.guard[0]); scene.add(m.root); enemyModels.set(e.id, m); m.root.visible = true; m.z = 0; m.anim = new Animator(e.id); }
  return m;
}
function spark(pos, color = 0xffd27a, n = 10) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(pos);
    m.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), t: 0, life: 0.3 + Math.random() * 0.3 };
    scene.add(m); sparks.push(m);
  }
}

// ---- 対応状況の確認（トップページ） ----
const stageSel = $('#sel-stage');
STAGES.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${s.name}${save.unlocked(i) ? '' : '（未解放）'}`; o.disabled = !save.unlocked(i); stageSel.appendChild(o); });
stageSel.value = save.data.cleared.includes(0) ? '1' : '0';
$('#sel-diff').value = S.difficulty;
$('#sel-diff').addEventListener('change', (e) => { S.difficulty = e.target.value; save.write(); });
$('#hi-line').textContent = `ハイスコア ${save.data.hi.toLocaleString()}${save.ok ? '' : '（この端末では保存できません）'}`;
let xrSupported = false;
(async () => {
  const st = $('#vr-status'); const det = $('#xr-detail');
  if (!('xr' in navigator)) { st.textContent = 'このブラウザは WebXR に対応していません（Quest 3 のブラウザで開いてください）'; det.textContent = '「画面で遊ぶ（3D）」で同じゲームを確認できます。'; return; }
  if (!isSecureContext) { st.textContent = 'HTTPS で開く必要があります'; return; }
  try { xrSupported = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { xrSupported = false; det.textContent = '確認中にエラー: ' + e.message; }
  $('#btn-vr').disabled = !xrSupported;
  st.textContent = xrSupported ? 'ヘッドセットで没入型 VR を開始します' : 'この端末では没入型 VR が使えません（Quest 3 のブラウザで開いてください）';
})();
$('#btn-vr').addEventListener('click', () => enterXR());
$('#btn-flat').addEventListener('click', () => enterFlat());

async function initAudio() { if (!audioOn) { audioOn = true; await audio.init(); } else audio.resume(); }

// ---- XR に入る・出る ----
async function enterXR() {
  await initAudio();
  const scale = { high: 1.25, standard: 1.0, light: 0.8 }[VS.scale] || 1.0;
  renderer.xr.setFramebufferScaleFactor(scale);
  let session;
  try { session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }); }
  catch (e) { $('#xr-detail').textContent = 'VR を開始できませんでした: ' + e.message; return; }
  await renderer.xr.setSession(session);
  renderer.xr.setFoveation(VS.scale === 'high' ? 0.25 : 0.5);
  mode = 'xr';
  document.body.classList.add('playing');
  session.addEventListener('end', onXrEnd);
  session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible' && state === 'play') pauseGame(); });
  applyRefreshRate(session);
  xrInfo.session = session;
  flatGun.visible = false;
  startRun(Number(stageSel.value), S.difficulty);
}
const xrInfo = { session: null, fb: '', rates: '' };
function applyRefreshRate(session) {
  try {
    const rates = session.supportedFrameRates ? [...session.supportedFrameRates] : [];
    xrInfo.rates = rates.join('/');
    const want = VS.refresh === 90 && rates.includes(90) ? 90 : rates.includes(72) ? 72 : null;
    if (want && session.updateTargetFrameRate) session.updateTargetFrameRate(want).catch(() => {});
  } catch { /* 対応していない */ }
}
function onXrEnd() {
  if (state === 'play') pauseGame(true);
  mode = 'none'; state = 'top';
  document.body.classList.remove('playing');
  menuPanel.hide(); audio.stopAll();
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
}

// ---- 画面（3D）で遊ぶ ----
let yaw = 0, pitch = 0; const keys = new Set();
async function enterFlat() {
  await initAudio();
  mode = 'flat';
  document.body.classList.add('playing');
  $('#flat-ui').hidden = false; flatGun.visible = true;
  startRun(Number(stageSel.value), S.difficulty);
  requestLock();
}
function requestLock() { const p = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); }
renderer.domElement.addEventListener('click', () => { if (mode === 'flat' && state === 'play') { if (document.pointerLockElement !== renderer.domElement) requestLock(); else flatFire(); } });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  $('#lock-hint').hidden = locked || state !== 'play' || mode !== 'flat';
  if (!locked && mode === 'flat' && state === 'play') pauseGame();
});
addEventListener('mousemove', (e) => { if (document.pointerLockElement !== renderer.domElement) return; yaw -= e.movementX * 0.0022; pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.0022)); });
addEventListener('mousedown', (e) => { if (mode === 'flat' && state === 'play' && document.pointerLockElement === renderer.domElement && e.button === 0) keys.add('Mouse0'); });
addEventListener('mouseup', (e) => { if (e.button === 0) keys.delete('Mouse0'); });
addEventListener('keydown', (e) => {
  if (mode !== 'flat') return;
  keys.add(e.code);
  if (state === 'play') {
    if (e.code === 'KeyE') flatInteract();
    if (e.code === 'KeyC') virtualCrouch = !virtualCrouch;
    if (e.code === 'KeyF') game.vrKick();
    if (e.code === 'KeyQ') game.vrDodge();
  } else if (state === 'menu') flatMenuKey(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (mode === 'flat' && state === 'play') pauseGame(); });

// ---- ゲームの進行 ----
function startRun(stage, difficulty) { run = { stage, difficulty, score: 0, lives: DIFF[difficulty].lives }; startStage(); }
function startStage() {
  run.stageStartScore = run.score;
  if (world) world.dispose();
  for (const m of enemyModels.values()) { m.root.visible = false; scene.remove(m.root); }
  enemyModels.clear(); for (const p of projectiles) scene.remove(p.mesh); projectiles.length = 0;
  game = new Game({ stageIndex: run.stage, difficulty: run.difficulty, mode: 'vr', score: run.score, lives: run.lives });
  world = new World3D(scene, game);
  state = 'play'; playTime = 0; virtualCrouch = false; carStick = 0; carPulse = 0;
  closeMenu();
  if (mode === 'xr') rigPending = 3; else placeRigAtPlayer(true); // XR は頭の姿勢が届いてから合わせる
  audio.stopAll(); audio.clearPaused(); audio.setIntensity(0);
  audio.setStage(run.stage, STAGE_SONG[run.stage]);
  const d = audio.playJingle('start') || 0; bgmAt = d ? d - 0.35 : 0.01;
  showMsg(`${STAGES[run.stage].name}　書類 ${game.docTotal} 件を回収せよ`, 4, '#7fe0ff');
  setFade(1); fadeV = 1; setTimeout(() => setFade(0), 120);
}
// プレイヤーの位置へリグを合わせる（頭の追跡はそのまま。リグだけ動かす）
const headW = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
function headWorld(out) {
  // XR でも、リグ（dolly）の子のカメラに頭の姿勢が入る。renderer.xr.getCamera() はリグを含まない
  return camera.getWorldPosition(out);
}
function placeRigAtPlayer(faceCorridor) {
  const p = game.player;
  if (mode === 'xr') {
    if (faceCorridor) { // 正面（廊下の +x 方向）を向くようにリグを回す
      const xc = camera; xc.getWorldDirection(fwd);
      const headYaw = Math.atan2(-fwd.x, -fwd.z);
      dolly.rotation.y += -Math.PI / 2 - headYaw;
      dolly.updateMatrixWorld(true);
    }
    headWorld(headW);
    dolly.position.x += p.x - headW.x; dolly.position.z += 0 - headW.z;
    dolly.position.y = rigY();
  } else { yaw = -Math.PI / 2; pitch = 0; }
}
const rigY = () => game.player.y + (VS.seated ? 0.45 : 0) + VS.heightOffset - (virtualCrouch && mode === 'xr' ? 0.55 : 0);
function retryStage() { run.score = run.stageStartScore; run.lives = DIFF[run.difficulty].lives; startStage(); }
function pauseGame(silent) {
  if (state !== 'play') return;
  state = 'menu';
  audio.pauseBgm(); audio.setHum(false); audio.stopJingle();
  teleporting = null; arc.visible = marker.visible = false; keys.clear();
  if (!silent) openMenu(pauseModel(), resumeGame);
}
function resumeGame() {
  state = 'play'; closeMenu();
  if (playTime >= bgmAt) audio.resumeBgm(); else audio.clearPaused();
  if (mode === 'flat') requestLock();
}

// ---- メニューのモデル（VR の板と PC の DOM で共通） ----
const it = (label, act, o = {}) => ({ label, act, ...o });
function pauseModel() {
  const left = game.remainingDocFloors();
  return { title: '一時停止', sub: `${STAGES[run.stage].name}・${DIFF[run.difficulty].label}・書類 ${game.docsGot}/${game.docTotal}${left.length ? '（残り ' + left.map((f) => f + 'F').join('・') + '）' : ''}`,
    items: [it('再開', 'resume', { primary: true }), it('設定', 'settings'), it('操作方法', 'help'), it('リトライ', 'retry', { sub: 'このステージを最初から（残機は初期値）' }), it('タイトルへ', 'title'),
      ...(mode === 'xr' ? [it('VR を終了', 'exitxr')] : [it('トップページへ', 'exitflat')])] };
}
function titleModel() {
  const st = Number(stageSel.value);
  return { title: 'NIGHT SHAFT', sub: 'このゲームは、Claude Codeのクラウドセッションで制作しました。独自に制作したオリジナル作品です（非公式・既存作品の再制作ではありません）。',
    items: [it('スタート', 'startsel', { primary: true }), it('ステージ', 'stagesel', { val: STAGES[st].name, adj: true }), it('難易度', 'diffsel', { val: DIFF[S.difficulty].label, adj: true }),
      it('設定', 'settings'), it('操作方法', 'help'), it('クレジット', 'credits'), ...(mode === 'xr' ? [it('VR を終了', 'exitxr')] : [it('トップページへ', 'exitflat')])] };
}
function settingsModel() {
  const pct = (v) => Math.round(v * 100) + '%';
  const fb = xrFramebuffer();
  return { title: '設定', sub: `◀ ▶ で変更（すぐ保存）。${fb ? `描画バッファ ${fb}` : ''}${xrInfo.rates ? `・対応リフレッシュ ${xrInfo.rates}Hz` : ''}`,
    items: [
      it('移動', 'loco', { val: VS.locomotion === 'teleport' ? 'テレポート' : '連続移動', adj: true }),
      it('スナップターン', 'snap', { val: VS.snap + '°', adj: true }),
      it('利き手', 'hand', { val: VS.leftHanded ? '左（銃は左手）' : '右（銃は右手）', adj: true }),
      it('姿勢', 'seat', { val: VS.seated ? '座って遊ぶ' : '立って遊ぶ', adj: true }),
      it('身長の補正', 'height', { val: (VS.heightOffset >= 0 ? '+' : '') + Math.round(VS.heightOffset * 100) + 'cm', adj: true }),
      it('正面をリセット', 'recenter'),
      it('移動時のビネット', 'vig', { val: VS.comfortVignette ? 'オン' : 'オフ', adj: true }),
      it('画質（次の入場から）', 'scale', { val: { high: '高精細', standard: '標準', light: '軽量' }[VS.scale], adj: true }),
      it('リフレッシュレート', 'refresh', { val: VS.refresh + 'Hz', adj: true, sub: '90Hz は対応時のみ' }),
      it('BGM', 'vbgm', { val: audio.vol.muteBgm ? 'ミュート' : pct(audio.vol.bgm), adj: true }),
      it('効果音', 'vsfx', { val: audio.vol.muteSfx ? 'ミュート' : pct(audio.vol.sfx), adj: true }),
      it('補助音（メニュー）', 'vui', { val: audio.vol.muteUi ? 'オフ' : 'オン', adj: true }),
      it('戻る', 'back'),
    ] };
}
function xrFramebuffer() {
  const s = xrInfo.session; const l = s && s.renderState && s.renderState.baseLayer;
  return l ? `${l.framebufferWidth}×${l.framebufferHeight}` : '';
}
function helpModel() {
  const L = VS.leftHanded;
  return { title: '操作方法', sub: `${L ? '左' : '右'}トリガー: 射撃／${L ? '右' : '左'}トリガー: レイでドア・ボタン・メニュー／${L ? '右' : '左'}スティック: テレポート／${L ? '左' : '右'}スティック: 左右ターン・上下でかご／A: しゃがみ B: 一時停止 X: キック Y: 横よけ（左利きでは入れ替え）。ジャンプは不要。本当にしゃがむ・横へ動くでも回避できます。`,
    items: [it('戻る', 'back', { primary: true })] };
}
function creditsModel() {
  return { title: 'クレジット', sub: 'このゲームは、Claude Codeのクラウドセッションで制作しました。企画・プログラム・3D モデル・作曲・効果音もすべてこのセッションで制作したオリジナルです。1980年代のアーケード・アクションの遊び方に着想を得ていますが、特定作品の公式版・移植・再制作ではなく、ゲーム会社・Anthropic の制作・監修・認定は受けていません。',
    items: [it('戻る', 'back', { primary: true })] };
}
function resultModel() {
  const last = run.stage >= STAGES.length - 1;
  return { title: last ? '全ステージ達成！' : 'ステージクリア', sub: `${STAGES[run.stage].name}から脱出。スコア ${game.score.toLocaleString()}・書類 ${game.docsGot}/${game.docTotal}・撃破 ${game.kills}・残機 ${game.lives}・ハイスコア ${save.data.hi.toLocaleString()}`,
    items: last ? [it('タイトルへ', 'title', { primary: true })] : [it('次のステージへ', 'next', { primary: true, sub: STAGES[run.stage + 1].name }), it('タイトルへ', 'title')] };
}
function gameoverModel() {
  return { title: 'ゲームオーバー', sub: `${STAGES[run.stage].name}・スコア ${game.score.toLocaleString()}・書類 ${game.docsGot}/${game.docTotal}・ハイスコア ${save.data.hi.toLocaleString()}`,
    items: [it('リトライ', 'retry', { primary: true }), it('タイトルへ', 'title')] };
}
const cycle = (arr, v, dx) => arr[(arr.indexOf(v) + (dx || 1) + arr.length) % arr.length];
function vol(k, dx) {
  const v = { ...audio.vol }; const mk = 'mute' + k[0].toUpperCase() + k.slice(1);
  if (k === 'ui') v.muteUi = !v.muteUi; else if (!dx) v[mk] = !v[mk]; else { v[k] = Math.max(0, Math.min(1, Math.round((v[k] + dx * 0.1) * 10) / 10)); v[mk] = false; }
  audio.setVolume(v); S.volume = audio.vol; save.write();
}
const ACT = {
  resume: () => resumeGame(),
  settings: () => openMenu(settingsModel(), () => openMenu(menuStackTop())),
  help: () => openMenu(helpModel(), () => openMenu(menuStackTop())),
  credits: () => openMenu(creditsModel(), () => openMenu(titleModel())),
  back: () => (menuBack ? menuBack() : openMenu(menuStackTop())),
  retry: () => retryStage(),
  title: () => { audio.stopAll(); state = 'menu'; openMenu(titleModel(), null); },
  next: () => { run.stage++; startStage(); },
  exitxr: () => { const s = renderer.xr.getSession(); if (s) s.end(); },
  exitflat: () => { state = 'top'; mode = 'none'; closeMenu(); audio.stopAll(); document.body.classList.remove('playing'); $('#flat-ui').hidden = true; document.exitPointerLock && document.exitPointerLock(); },
  startsel: () => startRun(Number(stageSel.value), S.difficulty),
  stagesel: (dx) => { const opts = STAGES.map((_, i) => i).filter((i) => save.unlocked(i)); stageSel.value = String(cycle(opts, Number(stageSel.value), dx)); openMenu(titleModel(), null, true); },
  diffsel: (dx) => { S.difficulty = cycle(['easy', 'normal', 'hard'], S.difficulty, dx); save.write(); $('#sel-diff').value = S.difficulty; openMenu(titleModel(), null, true); },
  loco: (dx) => { VS.locomotion = cycle(['teleport', 'smooth'], VS.locomotion, dx); refreshSettings(); },
  snap: (dx) => { VS.snap = cycle([30, 45, 15], VS.snap, dx); refreshSettings(); },
  hand: (dx) => { VS.leftHanded = !VS.leftHanded; attachModels(); refreshSettings(); },
  seat: () => { VS.seated = !VS.seated; refreshSettings(); },
  height: (dx) => { VS.heightOffset = Math.max(-0.3, Math.min(0.3, Math.round((VS.heightOffset + (dx || 1) * 0.05) * 100) / 100)); refreshSettings(); },
  recenter: () => { if (game) placeRigAtPlayer(true); refreshSettings(); },
  vig: () => { VS.comfortVignette = !VS.comfortVignette; refreshSettings(); },
  scale: (dx) => { VS.scale = cycle(['high', 'standard', 'light'], VS.scale, dx); refreshSettings(); },
  refresh: () => { VS.refresh = VS.refresh === 90 ? 72 : 90; if (xrInfo.session) applyRefreshRate(xrInfo.session); refreshSettings(); },
  vbgm: (dx) => { vol('bgm', dx); refreshSettings(); }, vsfx: (dx) => { vol('sfx', dx); refreshSettings(); }, vui: () => { vol('ui', 0); refreshSettings(); },
};
let menuStack = [];
function menuStackTop() { return state === 'play' || (game && game.phase === 'play' && menuStack.includes('pause')) ? pauseModel() : game && game.phase === 'play' ? pauseModel() : titleModel(); }
function refreshSettings() { save.write(); openMenu(settingsModel(), menuBack, true); }
function openMenu(model, onBack, keepFocus) {
  const f = menuPanel.focus;
  menuModel = model; menuBack = onBack;
  if (model.title === '一時停止') menuStack = ['pause'];
  if (mode === 'xr') {
    menuPanel.show(model); if (keepFocus) { menuPanel.focus = f; menuPanel.draw(); }
    if (!keepFocus) placeInFront(menuPanel.mesh, 1.3, -0.1);
  } else renderFlatMenu(model, keepFocus);
}
function closeMenu() { menuModel = null; menuPanel.hide(); $('#fmenu').hidden = true; $('#fmenu').innerHTML = ''; }
function runAct(item, dx = 0) {
  if (!item || item.disabled) return;
  audio.ui(dx ? 'uiMove' : 'uiOk');
  const fn = ACT[item.act]; if (fn) fn(dx);
}
function placeInFront(mesh, dist, dy) {
  headWorld(headW);
  const xc = camera;
  xc.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0); fwd.normalize();
  mesh.position.copy(headW).addScaledVector(fwd, dist); mesh.position.y = headW.y + dy;
  mesh.lookAt(headW.x, mesh.position.y, headW.z);
}

// PC 画面の DOM メニュー
let flatFocus = 0;
function renderFlatMenu(model, keep) {
  const el = $('#fmenu'); el.hidden = false;
  if (!keep) flatFocus = Math.max(0, model.items.findIndex((i) => i.primary));
  el.innerHTML = `<div class="panel"><h2>${model.title}</h2>${model.sub ? `<p class="sub">${model.sub}</p>` : ''}${model.items.map((i, k) =>
    `<button class="mi${i.primary ? ' primary' : ''}${k === flatFocus ? ' focus' : ''}" data-k="${k}" ${i.disabled ? 'disabled' : ''}><span>${i.label}${i.sub ? `<small>${i.sub}</small>` : ''}</span>${i.val != null ? `<span class="val">${i.adj ? '◀ ' + i.val + ' ▶' : i.val}</span>` : ''}</button>`).join('')}</div>`;
  el.querySelectorAll('.mi').forEach((b) => b.addEventListener('click', (e) => {
    const k = Number(b.dataset.k); flatFocus = k; const item = model.items[k];
    const r = b.getBoundingClientRect(); const dx = item.adj ? (e.clientX < r.left + r.width * 0.6 ? -1 : 1) : 0;
    runAct(item, dx);
  }));
  $('#lock-hint').hidden = true;
}
function flatMenuKey(code) {
  if (!menuModel) return;
  const n = menuModel.items.length;
  if (code === 'ArrowDown' || code === 'KeyS') { flatFocus = (flatFocus + 1) % n; renderFlatMenu(menuModel, true); audio.ui('uiMove'); }
  if (code === 'ArrowUp' || code === 'KeyW') { flatFocus = (flatFocus - 1 + n) % n; renderFlatMenu(menuModel, true); audio.ui('uiMove'); }
  const item = menuModel.items[flatFocus];
  if ((code === 'ArrowLeft' || code === 'ArrowRight') && item.adj) runAct(item, code === 'ArrowRight' ? 1 : -1);
  if (code === 'Enter' || code === 'Space') runAct(item, 0);
  if (code === 'Escape' && menuBack) menuBack();
}

function showMsg(text, sec = 3, color) {
  if (mode === 'xr') { msg.set(text, sec, color); placeInFront(msg.mesh, 1.6, -0.35); }
  else { const m = $('#fmsg'); m.textContent = text; m.hidden = false; clearTimeout(showMsg.t); showMsg.t = setTimeout(() => (m.hidden = true), sec * 1000); }
}

// ---- 入力（XR） ----
const ray = new THREE.Raycaster();
const mat4 = new THREE.Matrix4();
function rayFrom(obj) {
  mat4.identity().extractRotation(obj.matrixWorld);
  ray.ray.origin.setFromMatrixPosition(obj.matrixWorld);
  ray.ray.direction.set(0, 0, -1).applyMatrix4(mat4);
  ray.far = 30;
  return ray;
}
function btn(c, i) { const g = c && c.src && c.src.gamepad; return !!(g && g.buttons[i] && g.buttons[i].pressed); }
function axes(c) { const g = c && c.src && c.src.gamepad; if (!g) return [0, 0]; const a = g.axes; return a.length >= 4 ? [a[2], a[3]] : [a[0] || 0, a[1] || 0]; }
function edge(c, name, now) { const was = c.prev[name]; c.prev[name] = now; return now && !was; }

// UI の板にレイが当たっているか
function uiHit(c) {
  if (!c) return null;
  const r = rayFrom(c.ray);
  if (menuPanel.mesh.visible) {
    const h = r.intersectObject(menuPanel.mesh, false)[0];
    if (h) return { panel: 'menu', hit: h, info: menuPanel.hit(h.uv) };
  }
  return null;
}

function xrInput(dt) {
  const gh = hands[gunHandName()], rh = hands[rayHandName()];
  const menuOpen = !!menuModel;
  for (const c of ctrls) { c.line.visible = false; c.dot.visible = false; }
  // 光線とメニュー操作（どちらの手でも）
  for (const c of [rh, gh]) {
    if (!c) continue;
    const showRay = c === rh || menuOpen;
    if (!showRay) continue;
    c.line.visible = true;
    const u = uiHit(c);
    const trig = btn(c, 0);
    if (u) {
      c.dot.visible = true; c.dot.position.copy(u.hit.point); c.line.scale.z = u.hit.distance;
      if (u.info && u.info.index !== menuPanel.focus) { menuPanel.focus = u.info.index; menuPanel.draw(); audio.ui('uiMove'); }
      if (edge(c, 'trig', trig) && u.info) runAct(u.info.item, u.info.dx);
      c.uiBlock = true; continue;
    }
    c.uiBlock = false;
    c.line.scale.z = 4;
    if (c === rh && !menuOpen && state === 'play') {
      const h = worldRayHit(c);
      if (h) { c.dot.visible = true; c.dot.position.copy(h.point); c.line.scale.z = h.distance; c.line.material.color.set(0x7fffb0); } else c.line.material.color.set(0x7fe0ff);
      if (edge(c, 'trig', trig) && h) useInteractable(h.obj);
    } else edge(c, 'trig', trig);
  }
  if (state !== 'play') {
    // メニュー中: 銃の手の上ボタン（B）で戻る。押しっぱなしの同じ押下では反応しない（一時停止した直後に戻らない）
    const back = gh ? edge(gh, 'b5', btn(gh, 5)) : false;
    if (gh) edge(gh, 'b4', btn(gh, 4));
    if (rh) { edge(rh, 'b4', btn(rh, 4)); edge(rh, 'b5', btn(rh, 5)); }
    if (back && menuModel && menuBack) menuBack();
    return;
  }

  // 射撃（UI を指している間・メニュー中は撃たない）
  if (gh && !gh.uiBlock && btn(gh, 0)) tryFire(gh);
  if (gh) gh.prev.trig = btn(gh, 0);
  // ボタン
  if (gh && edge(gh, 'b4', btn(gh, 4))) { virtualCrouch = !virtualCrouch; }
  if (gh && edge(gh, 'b5', btn(gh, 5))) { pauseGame(); return; }
  if (rh && edge(rh, 'b4', btn(rh, 4))) game.vrKick();
  if (rh && edge(rh, 'b5', btn(rh, 5))) game.vrDodge();
  // 右スティック: 左右ターン・上下でかご
  const [tx, ty] = axes(gh);
  if (Math.abs(tx) > 0.7 && !snapLock) { snapTurn(Math.sign(tx)); snapLock = true; }
  if (Math.abs(tx) < 0.3) snapLock = false;
  carStick = Math.abs(ty) > 0.6 ? -Math.sign(ty) : 0;
  // 左スティック: テレポート／連続移動
  const [mx, my] = axes(rh);
  if (VS.locomotion === 'teleport') {
    if (my < -0.6 && rh) { teleporting = teleporting || {}; aimTeleport(rh); }
    else if (teleporting && Math.hypot(mx, my) < 0.3) { if (teleporting.ok) doTeleport(teleporting.x, teleporting.z); teleporting = null; arc.visible = marker.visible = false; }
  } else if (Math.hypot(mx, my) > 0.2) {
    const xc = camera; xc.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = tmp.set(-fwd.z, 0, fwd.x);
    const sp = 2.2 * dt;
    dolly.position.addScaledVector(fwd, -my * sp).addScaledVector(right, mx * sp);
    vigBoost = 1;
  }
}
let vigBoost = 0;
function snapTurn(dir) {
  headWorld(headW);
  const a = -dir * VS.snap * Math.PI / 180;
  // 頭の位置を中心にリグを回す
  dolly.position.sub(headW).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(headW);
  dolly.rotation.y += a;
}
function fireInterval() { return PL.fireInterval; }
let lastFire = 0;
function tryFire(c) {
  const now = performance.now() / 1000;
  if (now - lastFire < fireInterval() || game.player.state !== 'play') return;
  lastFire = now;
  const muzzle = gunModel.userData.muzzle; const o = new THREE.Vector3(); muzzle.getWorldPosition(o);
  const q = new THREE.Quaternion(); muzzle.getWorldQuaternion(q);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  fireProjectile(o, dir, gunModel);
  if (c.src && c.src.gamepad && c.src.gamepad.hapticActuators && c.src.gamepad.hapticActuators[0]) c.src.gamepad.hapticActuators[0].pulse(0.4, 40).catch?.(() => {});
}
function flatFire() {
  const now = performance.now() / 1000;
  if (now - lastFire < fireInterval() || game.player.state !== 'play') return;
  lastFire = now;
  const o = new THREE.Vector3(); flatGun.userData.muzzle.getWorldPosition(o);
  camera.getWorldDirection(fwd);
  const target = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 25);
  fireProjectile(o, target.sub(o).normalize(), flatGun);
}
function fireProjectile(o, dir, gun) {
  const m = pbPool.pop() || new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.25, 2, 6), pbMat);
  m.position.copy(o); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); scene.add(m);
  projectiles.push({ mesh: m, p: o.clone(), v: dir.clone().multiplyScalar(38), life: 1.2, L: level(game.playerFloor) });
  game.vrShot(o.y, Math.sign(dir.x) || game.player.face);
  gun.userData.flash.visible = true; setTimeout(() => (gun.userData.flash.visible = false), 45);
}

// 世界の操作対象（ドア・呼び出しボタン・かごの操作盤・エスカレーターの看板）
function worldRayHit(c) {
  const r = rayFrom(c.ray); r.far = 6;
  const objs = world.interact.filter((o) => o.mesh.visible && (o.floor == null || Math.abs(o.floor - game.playerFloor) === 0 || o.kind === 'carBtn'));
  const hits = r.intersectObjects(objs.map((o) => o.mesh), false);
  if (!hits.length) return null;
  const obj = objs.find((o) => o.mesh === hits[0].object);
  return { obj, point: hits[0].point, distance: hits[0].distance };
}
function useInteractable(o) {
  const p = game.player; const f = floorOf(p.y);
  if (p.state !== 'play') return;
  if (o.kind === 'door' && !o.door.collected && o.floor === f && Math.abs(o.door.x - p.x) < 2.8 && pathClear(p.x, o.door.x)) { p.x = o.door.x; game.enterDoor(o.door); setFade(1); setTimeout(() => setFade(0), 900); }
  else if (o.kind === 'call') { if (game.vrCall(o.car)) audio.sfx('call'); }
  else if (o.kind === 'carBtn') { const c = game.cars[o.car]; if (p.support && p.support.car === c) { carBtnDir = o.dir; carPulse = 0.12; } }
  else if (o.kind === 'esc' && o.floor === f) {
    const x = o.dir > 0 ? o.esc.xBot : o.esc.xTop;
    if (Math.abs(x - p.x) < 3 && pathClear(p.x, x)) { p.x = x; game.startEsc(o.esc, o.dir); }
  }
}
function pathClear(a, b) { const y = game.player.y; for (let x = Math.min(a, b); x <= Math.max(a, b); x += 0.15) { const s = game.supportAt(x, y); if (!s || s.kind === 'roof') return false; } return true; }

// テレポート
function aimTeleport(c) {
  const p = game.player; const L = p.y;
  mat4.identity().extractRotation(c.ray.matrixWorld);
  const o = new THREE.Vector3().setFromMatrixPosition(c.ray.matrixWorld);
  const v = new THREE.Vector3(0, 0, -1).applyMatrix4(mat4).multiplyScalar(7.5);
  const pts = arcGeo.attributes.position;
  let hit = null; const q = o.clone();
  for (let i = 0; i < 40; i++) {
    const t = i * 0.035;
    q.set(o.x + v.x * t, o.y + v.y * t - 4.9 * t * t, o.z + v.z * t);
    if (!hit && q.y <= L + 0.01) { hit = q.clone(); hit.y = L; }
    pts.setXYZ(i, hit && !(q.y > L) ? hit.x : q.x, hit && !(q.y > L) ? L : q.y, hit && !(q.y > L) ? hit.z : q.z);
  }
  pts.needsUpdate = true; arc.visible = true;
  if (!hit) { marker.visible = false; teleporting.ok = false; return; }
  const ok = canStand(hit.x, hit.z) && Math.hypot(hit.x - p.x, hit.z - p.z) < 7 && pathClear(p.x, hit.x);
  teleporting.ok = ok; teleporting.x = hit.x; teleporting.z = hit.z;
  marker.visible = true; marker.position.set(hit.x, L + 0.02, hit.z);
  const colr = ok ? 0x7fe0ff : 0xff4a4a; marker.material.color.set(colr); arc.material.color.set(colr);
}
function canStand(x, z) {
  const p = game.player;
  if (x < 0.35 || x > W - 0.35 || Math.abs(z) > 1.7) return false;
  const s = game.supportAt(x, p.y);
  if (!s || s.kind === 'roof') return false;
  if (s.kind === 'car' && !game.carAligned(s.car) && !(p.support && p.support.car === s.car)) return false;
  return !blocked3D(x, z);
}
function blockers() {
  const f = game.playerFloor; const out = [];
  const L = level(f);
  for (const c of game.byFloor[f].covers) out.push([c.x - c.w / 2 - 0.22, c.x + c.w / 2 + 0.22, -0.72, 2.2]);
  for (const e of game.stage.escalators) {
    const dir = Math.sign(e.xTop - e.xBot);
    if (e.upper === f) { const xa = e.xBot + (e.xTop - e.xBot) * 0.3; out.push([Math.min(xa, e.xTop) - 0.1, Math.max(xa, e.xTop) + 0.1, ESC_Z0 - 0.25, 2.2]); }
    if (e.upper - 1 === f) { const xa = e.xBot + dir * 0.55; out.push([Math.min(xa, e.xTop) - 0.05, Math.max(xa, e.xTop) + 0.05, ESC_Z0 - 0.25, 2.2]); }
  }
  void L;
  return out;
}
function blocked3D(x, z) { return blockers().some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3]); }
function resolveXZ(x, z) {
  z = Math.max(-1.72, Math.min(1.72, z));
  for (const b of blockers()) {
    if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) {
      const dl = x - b[0], dr = b[1] - x, dz = z - b[2];
      if (dz <= Math.min(dl, dr)) z = b[2]; else if (dl < dr) x = b[0]; else x = b[1];
    }
  }
  return [x, z];
}
function doTeleport(x, z) {
  const p = game.player;
  setFade(1); fadeV = Math.max(fadeV, 0.85);
  setTimeout(() => setFade(0), 90);
  p.x = x;
  headWorld(headW);
  dolly.position.x += x - headW.x; dolly.position.z += z - headW.z;
}

// ---- 入力（画面・ゲームパッド） ----
const padPrev = {};
function flatInput(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
  const b = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
  const pe = (i) => { const now = b(i); const was = padPrev[i]; padPrev[i] = now; return now && !was; };
  if (state === 'menu') {
    if (gp) { if (pe(13)) flatMenuKey('ArrowDown'); if (pe(12)) flatMenuKey('ArrowUp'); if (pe(14)) flatMenuKey('ArrowLeft'); if (pe(15)) flatMenuKey('ArrowRight'); if (pe(0)) flatMenuKey('Enter'); if (pe(1)) flatMenuKey('Escape'); if (pe(9) && menuBack) menuBack(); }
    return;
  }
  if (state !== 'play') return;
  let mx = 0, mz = 0;
  if (keys.has('KeyW')) mz += 1; if (keys.has('KeyS')) mz -= 1; if (keys.has('KeyD')) mx += 1; if (keys.has('KeyA')) mx -= 1;
  if (gp) {
    const dz = (v) => (Math.abs(v) > 0.18 ? v : 0);
    mx += dz(gp.axes[0] || 0); mz -= dz(gp.axes[1] || 0);
    yaw -= dz(gp.axes[2] || 0) * dt * 2.6; pitch = Math.max(-1.4, Math.min(1.4, pitch - dz(gp.axes[3] || 0) * dt * 2.2));
    if (b(7) || b(5)) flatFire();
    if (pe(0)) flatInteract(); if (pe(1)) virtualCrouch = !virtualCrouch; if (pe(2)) game.vrKick(); if (pe(3)) game.vrDodge(); if (pe(9)) { pauseGame(); return; }
  }
  carStick = keys.has('ArrowUp') || b(12) ? 1 : keys.has('ArrowDown') || b(13) ? -1 : 0;
  if (keys.has('Mouse0')) flatFire();
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); const r = new THREE.Vector3(-f.z, 0, f.x);
  const sp = 3.0 * dt;
  flatPos.x += (f.x * mz + r.x * mx) * sp; flatPos.z += (f.z * mz + r.z * mx) * sp;
}
const flatPos = { x: 0, z: 0 };
function flatInteract() {
  const r = rayFrom(camera); r.far = 4;
  const objs = world.interact.filter((o) => o.mesh.visible);
  const hits = r.intersectObjects(objs.map((o) => o.mesh), false);
  if (hits.length) { useInteractable(objs.find((o) => o.mesh === hits[0].object)); return; }
  game.vrInteract();
}

// ---- 1 フレーム ----
const clock = new THREE.Timer();
let fpsAcc = 0, fpsN = 0, fps = 0, frameMs = 0;
renderer.setAnimationLoop(loop);
function loop(time, frame) {
  clock.update(time); const dt = Math.min(0.1, clock.getDelta());
  const t0 = performance.now();
  const t = time / 1000;
  if (mode === 'xr') xrInput(dt); else if (mode === 'flat') flatInput(dt);

  if (game && state === 'play') {
    const p = game.player;
    // 頭（追跡）の位置 → ゲームの希望位置
    let hx, hz, crouch;
    if (mode === 'xr' && rigPending > 0) {
      // 最初の数フレームは XR カメラの姿勢がまだ無いので、頭の位置をゲームに渡さない
      if (--rigPending === 0) placeRigAtPlayer(true);
      game.setVrControl({ x: p.x, z: 0, crouch: false, face: p.face, carDir: 0 });
    } else if (mode === 'xr') {
      headWorld(headW);
      const local = headW.y - dolly.position.y + (virtualCrouch ? 0.55 : 0) - (VS.seated ? 0.45 : 0) - VS.heightOffset;
      standH = Math.max(standH * 0.9995, Math.min(2.1, local));
      crouch = virtualCrouch || (local < standH * 0.7 && local > 0.3);
      [hx, hz] = [headW.x, headW.z];
      const xc = camera; xc.getWorldDirection(fwd);
      game.setVrControl({ x: hx, z: hz, crouch, face: Math.abs(fwd.x) > 0.2 ? Math.sign(fwd.x) : p.face, carDir: carStick || (carPulse > 0 ? carBtnDir : 0) });
    } else {
      if (flatPos.init !== game) { flatPos.x = p.x; flatPos.z = 0; flatPos.init = game; }
      crouch = virtualCrouch;
      const fx = -Math.sin(yaw);
      game.setVrControl({ x: flatPos.x, z: flatPos.z, crouch, face: Math.abs(fx) > 0.2 ? Math.sign(fx) : p.face, carDir: carStick || (carPulse > 0 ? carBtnDir : 0) });
    }
    carPulse = Math.max(0, carPulse - dt);
    const prevX = p.x, prevY = p.y;
    game.step(dt, {});
    playTime += dt;
    if (bgmAt && playTime >= bgmAt && game.phase === 'play') { audio.playBgm('stage'); bgmAt = 0; }
    // ゲームが決めた位置にリグを合わせる（壁・穴・走行中のかご・エスカレーター）
    if (mode === 'xr') {
      headWorld(headW);
      const [rx, rz] = resolveXZ(p.x, headW.z);
      if (rx !== p.x) p.x = rx;
      dolly.position.x += p.x - headW.x; dolly.position.z += rz - headW.z;
      p.z = rz;
      dolly.position.y = rigY();
    } else {
      const [rx, rz] = resolveXZ(p.x, flatPos.z);
      p.x = rx; p.z = rz; flatPos.x = rx; flatPos.z = rz;
      camera.position.set(p.x, p.y + (crouch ? 1.05 : 1.62), p.z);
      camera.rotation.set(pitch, yaw, 0);
      dolly.position.set(0, 0, 0); dolly.rotation.set(0, 0, 0);
    }
    const forced = p.state === 'esc' || (p.support && p.support.car && p.support.car.state === 'moving') || Math.abs(p.y - prevY) > 1e-4;
    if (forced || vigBoost) vigV = Math.min(1, vigV + dt * 4); else vigV = Math.max(0, vigV - dt * 3);
    vigBoost = 0;
    void prevX;
    const evs = game.drainEvents();
    handleEvents(evs);
    playGameEvents(audio, game, evs, { panOf: (x) => Math.max(-0.7, Math.min(0.7, (x - p.x) / 10)) });
    if (game.phase === 'clear' && game.phaseT > 2.4) toResult();
    if (game.phase === 'gameover' && game.phaseT > 2.6) toGameover();
    // ヒント
    if (game.stage.hints && game.hint) { const i = game.stage.hints.findIndex((h) => h.text === game.hint); if (i >= 0 && i !== lastHint) { lastHint = i; showMsg(mode === 'xr' ? VR_HINTS[i] : flatHint(VR_HINTS[i]), 6); } }
    if (p.state === 'door') setFade(1);
    else if (game.phase === 'dead') setFade(0.6, 0x400000);
    else if (fadeTarget > 0 && !teleportFadeHold()) setFade(0);
  }
  if (world) { world.update(dt, t); updateEnemies(dt, t); updateBullets(dt); updateProjectiles(dt); }
  updateSparks(dt);
  // 暗転・ビネット
  fadeV += (fadeTarget - fadeV) * Math.min(1, dt * 14);
  fadeMesh.material.opacity = mode === 'xr' ? fadeV : 0; fadeMesh.material.color.set(fadeColor);
  $('#fade').style.opacity = mode === 'flat' ? fadeV : 0;
  vignette.material.opacity = mode === 'xr' && VS.comfortVignette ? vigV * 0.85 : 0;
  // UI
  if (mode === 'xr' && game) { wrist.draw(game, save.data.hi); }
  if (msg.t > 0) { msg.t -= dt; if (msg.t <= 0) msg.mesh.visible = false; else if (mode === 'xr') followLazy(msg.mesh, 1.6, -0.35, dt); }
  if (mode === 'flat' && game) flatHud();
  renderer.render(scene, camera);
  frameMs = performance.now() - t0;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (DEBUG) debugInfo(); }
}
let lastHint = -1;
const teleportFadeHold = () => false;
const flatHint = (s) => s.replace('左スティックを倒して床を狙い、戻すとテレポート', 'WASD で移動').replace('右スティックを上下（または操作盤をレイで押す）', '↑↓ キー（または操作盤を見て E）').replace('左手のレイで指して左トリガー', '見て E').replace('右トリガーで射撃', '左クリックで射撃').replace('（A／本当にしゃがむ）', '（C）').replace('看板をレイで押すと', '看板を見て E で').replace('横のボタンをレイで押すと', '横のボタンを見て E で').replace('（本当に動くか Y）', '（A/D で横へ、または Q）').replace('X でキック', 'F でキック');
function followLazy(mesh, dist, dy, dt) {
  headWorld(headW); const xc = camera; xc.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const target = tmp.copy(headW).addScaledVector(fwd, dist); target.y = headW.y + dy;
  if (mesh.position.distanceTo(target) > 0.6) mesh.position.lerp(target, Math.min(1, dt * 2));
  mesh.lookAt(headW.x, mesh.position.y, headW.z);
}

function handleEvents(evs) {
  for (const ev of evs) {
    if (ev.type === 'needDocs') showMsg(`書類があと ${ev.left} 件：${ev.floors.map((f) => f + 'F').join('・')}`, 3, '#e0414f');
    if (ev.type === 'doc') showMsg(ev.got === ev.total ? '書類をすべて回収！ 1 階の出口へ' : `書類 ${ev.got}/${ev.total}　+${ev.pts}`, 2.5, '#ffd36b');
    if (ev.type === 'kill') { const m = enemyModels.get(ev.id); spark(new THREE.Vector3(ev.x, ev.y + 1.2, m ? m.z : 0), 0xffd27a, 14); }
    if (ev.type === 'lightCrash') spark(new THREE.Vector3(ev.x, level(ev.floor) + 0.1, 0), 0xd8f2ff, 18);
    if (ev.type === 'miss') { const s = hands[gunHandName()]; const h = s && s.src && s.src.gamepad && s.src.gamepad.hapticActuators; if (h && h[0]) h[0].pulse(0.8, 200); }
    if (ev.type === 'respawn') { setFade(1); fadeV = 1; setTimeout(() => setFade(0), 150); }
  }
}
function toResult() {
  state = 'menu';
  run.score = game.score; run.lives = game.lives;
  save.markCleared(run.stage); save.submitScore(run.score);
  if (run.stage >= STAGES.length - 1) audio.playJingle('allclear');
  openMenu(resultModel(), null);
}
function toGameover() { state = 'menu'; save.submitScore(game.score); openMenu(gameoverModel(), null); }

// ---- 敵・弾の見た目 ----
function updateEnemies(dt, t) {
  const pf = game.playerFloor;
  const seen = new Set();
  for (const e of game.enemies) {
    const ef = Math.round(e.y / FLOOR_H) + 1;
    if (Math.abs(ef - pf) > 1) continue;
    seen.add(e.id);
    const m = getEnemyModel(e);
    const nearCover = game.byFloor[ef] && game.byFloor[ef].covers.some((c) => Math.abs(c.x - e.x) < c.w / 2 + 0.6);
    m.z += ((nearCover ? -1.15 : 0) - m.z) * Math.min(1, dt * 3);
    const st = enemyAnimState(e, game, t);
    const kind = st.kind;
    m.update(e.x, e.y, m.z, st, dt);
    m.setBrightness(lampLight(game, Math.max(1, Math.min(game.stage.floors, ef)), e.x, e.y + 1.2, m.z) * 0.9);
    m.setVisor(e.state === 'windup' ? 1 - Math.max(0, e.t) / game.D.windup : 0);
    m.root.visible = !(kind === 'dead' && e.deadT > 1.0 && Math.floor(e.deadT * 16) % 2);
    e._z = m.z;
  }
  for (const [id, m] of enemyModels) if (!seen.has(id)) { scene.remove(m.root); pool[LOOK.guard.indexOf(m.look)]?.push(m); enemyModels.delete(id); }
}
function updateBullets() {
  let i = 0;
  for (const b of game.eBullets) {
    let o = ebPool[i];
    if (!o) {
      o = new THREE.Group(); o.add(new THREE.Mesh(ebGeo, ebMat)); const halo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), ebHaloMat); o.add(halo);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.005, 0.8, 8), trailMat); tr.rotation.z = Math.PI / 2; o.add(tr); o.userData.tr = tr;
      scene.add(o); ebPool.push(o);
    }
    let info = ebMap.get(b);
    if (!info) { const src = game.enemies.find((e) => e.id === b.from); info = { x0: b.x, z0: src && src._z != null ? src._z : 0, d: Math.max(1, Math.abs(game.player.x - b.x)) }; ebMap.set(b, info); }
    const k = Math.min(1, Math.abs(b.x - info.x0) / info.d);
    o.position.set(b.x, b.y, info.z0 + ((b.z || 0) - info.z0) * k);
    o.userData.tr.position.x = -b.dir * 0.42;
    o.visible = true; i++;
  }
  for (; i < ebPool.length; i++) ebPool[i].visible = false;
}
const box = new THREE.Box3(), seg = new THREE.Ray(), hitP = new THREE.Vector3();
function updateProjectiles(dt) {
  for (let k = projectiles.length - 1; k >= 0; k--) {
    const pr = projectiles[k];
    const from = pr.p.clone(); const step = pr.v.clone().multiplyScalar(dt); const len = step.length();
    const to = from.clone().add(step);
    seg.origin.copy(from); seg.direction.copy(step).normalize();
    let best = null;
    const consider = (d, kind, obj) => { if (d != null && d <= len && (!best || d < best.d)) best = { d, kind, obj }; };
    const L = pr.L;
    for (const e of game.enemies) {
      if (!e.alive || e.state === 'spawn' || Math.abs(e.y - L) > 0.2) continue;
      const h = e.stance === 'crouch' ? EN.hCrouch : EN.h; const z = e._z || 0;
      box.min.set(e.x - 0.27, e.y, z - 0.25); box.max.set(e.x + 0.27, e.y + h, z + 0.25);
      if (seg.intersectBox(box, hitP)) consider(hitP.distanceTo(from), 'enemy', e);
    }
    for (const l of game.byFloor[floorOf(L)].lights) {
      if (l.state !== 'on') continue;
      const c = new THREE.Vector3(l.x, L + 2.38, 0); const sph = new THREE.Sphere(c, 0.3);
      if (seg.intersectSphere(sph, hitP)) consider(hitP.distanceTo(from), 'light', l);
    }
    for (const c of game.byFloor[floorOf(L)].covers) { box.min.set(c.x - c.w / 2, L, -0.5); box.max.set(c.x + c.w / 2, L + c.h, 1.7); if (seg.intersectBox(box, hitP)) consider(hitP.distanceTo(from), 'cover'); }
    const out = to.x < 0 || to.x > W || to.z < ZB || to.z > ZF || to.y < L || to.y > L + FLOOR_H;
    pr.life -= dt;
    if (best) {
      const at = from.clone().addScaledVector(seg.direction, best.d);
      if (best.kind === 'enemy') { game.vrHitEnemy(best.obj.id); spark(at, 0xffe0a0, 8); }
      else if (best.kind === 'light') game.vrHitLight(best.obj.id);
      else { spark(at, 0xffcf8a, 6); audio.sfx('bulletCover', { max: 2 }); }
      scene.remove(pr.mesh); pbPool.push(pr.mesh); projectiles.splice(k, 1); continue;
    }
    if (out || pr.life <= 0) { spark(to, 0xffe9a0, 4); scene.remove(pr.mesh); pbPool.push(pr.mesh); projectiles.splice(k, 1); continue; }
    pr.p.copy(to); pr.mesh.position.copy(to);
  }
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const m = sparks[i]; const u = m.userData; u.t += dt; u.v.y -= 9 * dt; m.position.addScaledVector(u.v, dt);
    if (u.t > u.life) { scene.remove(m); m.material.dispose(); sparks.splice(i, 1); }
  }
}

function flatHud() {
  const g = game; const left = g.remainingDocFloors();
  const html = `<b>${g.score.toLocaleString()}</b>　書類 <b>${g.docsGot}/${g.docTotal}</b>　<b>${g.playerFloor}F</b>　残機 ${'●'.repeat(Math.max(0, g.lives - (g.phase === 'dead' ? 1 : 0)))}<br>${left.map((f) => `<span class="chip">${f}F</span>`).join('')}${g.player.ctx ? `<br>E: ${({ door: '書類を回収', escDown: 'エスカレーターで下へ', escUp: 'エスカレーターで上へ', call: 'かごを呼ぶ', car: '↑↓ でかごを動かす' })[g.player.ctx.kind] || ''}` : ''}`;
  if (flatHud.last !== html) { $('#fhud').innerHTML = html; flatHud.last = html; }
}
function debugInfo() {
  const d = $('#debug'); d.hidden = false;
  const i = renderer.info.render;
  d.textContent = `fps ${fps.toFixed(1)} frame ${frameMs.toFixed(2)}ms calls ${i.calls} tris ${i.triangles}\nmode ${mode} state ${state} xr-fb ${xrFramebuffer() || '-'} rates ${xrInfo.rates || '-'}\nfloor ${game ? game.playerFloor : '-'} enemies ${game ? game.enemies.length : 0}`;
}
window.__ns = { teleportTo: (x, z = 0) => doTeleport(x, z), get game() { return game; }, get projectiles() { return projectiles.length; }, get state() { return state; }, get mode() { return mode; }, renderer, scene, camera, dolly, enterFlat, startRun, audio, setYaw: (y, p = 0) => { yaw = y; pitch = p; } };
$('#loading').hidden = true;
