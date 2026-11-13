// AEGIS RELAY — 3D 版（通常画面と Meta Quest 3 の WebXR）
// ・ルール・画面の流れは 2D 版と同じ（shared/app.js・sim.js）。ここは表示と入力だけ
// ・VR は「VR を開始」のボタン操作からセッションを要求。頭の動きは視点だけに反映し、自機・判定には入らない
// ・ヘッドセットを外す等でセッションが見えなくなったら一時停止（再開は自分で選ぶ → 不意の被弾を防ぐ）
import * as THREE from 'three';
import { createApp } from '../shared/app.js';
import { createInput } from '../shared/input.js';
import { createAudio } from '../shared/audio/engine.js';
import { createDomUI, computeLayout } from '../shared/ui-dom.js';
import { installNoZoom } from '../shared/no-zoom.js';
import { makeFrameClock } from '../shared/frame-clock.js';
import { otherUrl } from '../shared/sites.js';
import { createWorld3D } from './world3d.js';
import { createVrUI } from './vrui.js';
import { createPost } from './post3d.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const uiRoot = document.getElementById('ui');
const vrBtn = document.getElementById('vrgo'), vrMsg = document.getElementById('vrmsg');
const input = createInput();
const audio = createAudio();
let ui = null, world = null, vrui = null, xrSupported = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false; // 1 フレームの合計を数える（ブルームの分も含む）
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const app = createApp({
  input, audio, variant: '3d',
  hooks: {
    menuChanged: () => { ui && ui.menu(); vrui && vrui.invalidate(); },
    events: (evs, g) => world && world.onEvents(evs, g),
    settingsChanged: (k) => { if (['quality', 'renderScale', 'uiScale'].includes(k)) layout(); if (k === 'quality') world.warm(); vrui && vrui.invalidate(); },
    recenter: () => world.recenter(renderer.xr.isPresenting ? renderer.xr.getCamera() : null),
    titleExtra: () => (xrSupported && !renderer.xr.isPresenting ? [{ kind: 'action', label: 'VR で開始（Quest 3）', act: () => startXR() }] : []),
    pauseExtra: () => (renderer.xr.isPresenting ? [{ kind: 'action', label: 'VR を終了', act: () => renderer.xr.getSession()?.end() }] : []),
    otherVariant: { label: '2D 版で遊ぶ', go: () => { location.href = otherUrl('3d'); } },
  },
});
window.__app = app; window.__input = input; // 自動検証用
ui = createDomUI(uiRoot, app, { titleHint: '↑↓ で選び Enter / Z / A ボタンで決定　｜　VR は Quest 3 のブラウザで' });
world = createWorld3D(renderer, app);
vrui = createVrUI(world.scene, world.stage, app);
const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 200);
world.scene.add(camera); // カメラは基準空間の直下（stage を動かす再センタリングで頭まで動かないように）

const post = createPost(renderer, world.scene, camera); // 通常画面: MSAA → ブルーム → 周辺減光（XR と軽量画質では使わない）
let sceneCalls = 0, sceneTris = 0;
world.scene.onAfterRender = () => { sceneCalls = renderer.info.render.calls; sceneTris = renderer.info.render.triangles; }; // ブルームの分を除いた、戦域そのものの描画回数

// ── 画質 ──
// 自動: フレーム時間の中央値で判断し、段階的に下げる。上げ下げを繰り返さないよう、下げたら戻さない（M27）
const AUTO_STEPS = [1, 0.85, 0.72, 0.6];
let autoStep = 0, slowWins = 0; const ftBuf = new Float32Array(90); let ftN = 0;
function pixelRatio() {
  const q = app.settings.quality, dpr = devicePixelRatio || 1;
  if (q === 'big') return Math.min(3, dpr);
  if (q === 'quest') return Math.min(2, dpr);
  if (q === 'light') return 1;
  if (q === 'manual') return dpr * app.settings.renderScale;
  return Math.max(0.6, Math.min(2, dpr) * AUTO_STEPS[autoStep]);
}
const usePost = () => !renderer.xr.isPresenting && app.settings.quality !== 'light';
function layout() {
  const lay = computeLayout(innerWidth, innerHeight); ui.place(lay);
  const pr = pixelRatio();
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight, pr);
  camera.aspect = innerWidth / innerHeight; fitCamera(lay); ui.menu();
}
// 通常画面のカメラ: 斜め上から戦域全体が盤面の枠（3:4 の長方形）に収まる距離へ。
// 自機の左右位置へごく弱く寄る（M18）ので、その分のずれを見込んで合わせる
const camBase = new THREE.Vector3(), camCenter = new THREE.Vector3(), camOff = new THREE.Vector3(), CAM_EASE = 0.028;
let camX = 0;
function fitCamera(lay) {
  world.placeBoard(false);
  const center = camCenter.set(0, 0.72 + app.settings.vrHeight, -1.05 * app.settings.vrDist);
  const dir = new THREE.Vector3(0, 0.66, 0.75).normalize(); // 見下ろし約 41°
  const corners = world.boardCorners();
  // 盤面の枠の位置（画面の中心からのずれ）も考えて、少しずつ離す
  const ndcX = (lay.fw / lay.w) * 0.98, ndcY = (lay.fh / lay.h) * 0.98;
  let d = 0.6;
  for (let i = 0; i < 80; i++) {
    let ok = true;
    for (const ox of [-CAM_EASE, 0, CAM_EASE]) {
      camera.position.copy(center).addScaledVector(dir, d); camera.position.x += ox; camera.lookAt(center); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      if (!corners.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) <= ndcX && Math.abs(p.y) <= ndcY; })) ok = false;
    }
    if (ok) break; d += 0.04;
  }
  camBase.copy(center).addScaledVector(dir, d);
  camera.position.copy(camBase); camera.lookAt(center);
}
installNoZoom(layout);

// ── WebXR ──
async function checkXR() {
  try { xrSupported = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { xrSupported = false; }
  vrBtn.style.display = xrSupported ? 'block' : 'none';
  if (params.has('vr')) {
    vrBtn.classList.add('big');
    if (!xrSupported) vrMsg.textContent = 'この端末・ブラウザでは VR を開始できません（Quest 3 のブラウザで開いてください）。通常画面で遊べます。';
  }
  app.refresh();
}
checkXR();
let session = null;
async function startXR() {
  if (session || !xrSupported) return;
  audio.unlock();
  const q = app.settings.quality;
  renderer.xr.setFramebufferScaleFactor(q === 'big' ? 1.2 : q === 'light' ? 0.8 : q === 'manual' ? app.settings.renderScale : 1.0);
  try {
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
  } catch (e) { vrMsg.textContent = 'VR を開始できませんでした: ' + (e.message || e); session = null; return; }
  session.addEventListener('end', onXREnd);
  session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') { app.pause('xr-hidden'); input.clear(); } });
  session.addEventListener('inputsourceschange', () => input.clear());
  await renderer.xr.setSession(session);
  renderer.xr.setFoveation(q === 'light' ? 1 : q === 'big' ? 0.2 : 0.4);
  try { const rates = session.supportedFrameRates; if (rates && session.updateTargetFrameRate) { const want = q === 'light' ? 72 : 90; const pick = [...rates].includes(want) ? want : Math.max(...[...rates].filter((r) => r <= 90)); await session.updateTargetFrameRate(pick); } } catch { /* 対応しない */ }
  vrBtn.style.display = 'none'; uiRoot.style.display = 'none'; world.warm();
  setTimeout(() => world.recenter(renderer.xr.getCamera()), 300);
  vrui.invalidate(); app.refresh();
}
function onXREnd() {
  session = null; input.clear();
  if (app.screen === 'play') app.pause('xr-end');
  uiRoot.style.display = ''; vrBtn.style.display = xrSupported ? 'block' : 'none'; vrBtn.classList.remove('big');
  world.recenter(null); world.warm(); layout(); app.refresh();
}
vrBtn.addEventListener('click', () => startXR());
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); world.scene.add(c); vrui.addLaser(c); c.addEventListener('connected', (e) => { c.userData.src = e.data; }); c.addEventListener('disconnected', () => { c.userData.src = null; input.clear(); }); }
// stage を動かすと controller もずれるので、controller は scene 直下（XR の基準空間）に置き、レーザーの当たりは world 座標で取る

// XR コントローラー: 左スティック=移動、右トリガー=射撃、A=決定、B=戻る/ポーズ、Y=ポーズ
const xrPrev = {};
let triggerClick = false;
function pollXR() {
  triggerClick = false;
  const s = renderer.xr.getSession(); if (!s) return;
  let mx = 0, my = 0, fire = false;
  for (const src of s.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const h = src.handedness, b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (i, name) => { const k = h + i, now = b(i); if (now && !xrPrev[k]) input.push(name); xrPrev[k] = now; return now && !xrPrev['_' + k]; };
    const ax = gp.axes[2] ?? gp.axes[0] ?? 0, ay = gp.axes[3] ?? gp.axes[1] ?? 0;
    if (h === 'left' || (h !== 'right' && !mx && !my)) {
      const m = Math.hypot(ax, ay); if (m > 0.18) { const k = (m - 0.18) / (1 - 0.18) / m; mx = ax * k; my = ay * k; }
      const dir = ay < -0.6 ? 'up' : ay > 0.6 ? 'down' : ax < -0.6 ? 'left' : ax > 0.6 ? 'right' : null;
      if (dir && dir !== xrPrev.stick && app.screen !== 'play') input.push(dir); xrPrev.stick = dir;
      edge(5, 'pause'); edge(4, 'back');
    }
    if (h === 'right') {
      fire = b(0);
      const tNow = b(0); if (tNow && !xrPrev.trig) triggerClick = true; xrPrev.trig = tNow;
      edge(4, 'ok'); edge(5, 'back');
    }
  }
  input.ext.mx = mx; input.ext.my = my; input.ext.fire = fire && app.screen === 'play';
  input.device = 'xr';
}

// ── 音・フォーカス ──
const unlock = () => { audio.unlock(); if (app.screen === 'title' && !audio.musicName) audio.playMusic('title'); };
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
// XR 中はページの blur で止めない（Quest のブラウザは XR 中に blur が来ることがある）。代わりにセッションの visibilitychange を使う
addEventListener('blur', () => { if (!renderer.xr.isPresenting) app.pause('blur'); });
document.addEventListener('visibilitychange', () => {
  if (renderer.xr.isPresenting) return;
  if (document.hidden) { app.pause('hidden'); audio.suspend(); } else if (app.screen !== 'pause' && app.screen !== 'settings') audio.resume();
});
if (app.debug) addEventListener('keydown', (e) => { const m = { KeyI: 'debugInv', KeyN: 'debugNext', KeyC: 'debugCore' }[e.code]; if (m) input.push(m); });

// ── ループ（通常画面も XR も setAnimationLoop）──
const clock = makeFrameClock();
let frames = 0, ftSum = 0, lastT = 0; const stats = { fps: 0, ms: 0, median: 0 };
renderer.setAnimationLoop((t) => {
  const dt = clock(t);
  const rawDt = lastT ? Math.min(0.25, (t - lastT) / 1000) : 1 / 60; lastT = t;
  const xr = renderer.xr.isPresenting;
  if (xr) pollXR(); else { input.ext.fire = input.ext.fire && false; }
  const alpha = app.update(dt);
  world.frame(alpha, dt, xr);
  vrui.place(world); vrui.frame(xr, triggerClick);
  renderer.info.reset();
  if (!xr) {
    ui.frame();
    // カメラ: 自機の左右位置へごく弱く、なめらかに寄る（M18）＋減衰する正弦の揺れ（M16）。VR では何も動かさない
    camX += (world.playerX() * CAM_EASE - camX) * (1 - Math.exp(-2.2 * dt));
    world.shakeOffset(camOff, dt);
    camera.position.copy(camBase); camera.position.x += camX; camera.lookAt(camCenter); camera.position.add(camOff);
    if (usePost()) post.render(dt); else renderer.render(world.scene, camera);
  } else renderer.render(world.scene, camera);
  frames++; ftSum += rawDt; ftBuf[ftN % ftBuf.length] = rawDt; ftN++;
  if (ftSum > 1) { stats.fps = frames / ftSum; stats.ms = (ftSum / frames) * 1000; frames = 0; ftSum = 0; if (app.debug) debugLine(); }
  if (ftN % ftBuf.length === 0) adapt();
});
function adapt() {
  const s = Array.from(ftBuf).sort((a, b) => a - b); stats.median = s[s.length >> 1] * 1000;
  if (renderer.xr.isPresenting || app.settings.quality !== 'auto' || app.screen !== 'play' || world.jobs.pending) { slowWins = 0; return; }
  if (stats.median > 1000 / 50) { slowWins++; if (slowWins >= 2 && autoStep < AUTO_STEPS.length - 1) { autoStep++; slowWins = 0; layout(); } } else slowWins = 0;
}
const dbg = document.createElement('div'); dbg.style.cssText = 'position:absolute;left:8px;top:6px;font:12px monospace;color:#9cffd0;pointer-events:none;white-space:pre';
if (app.debug) document.body.appendChild(dbg);
function debugLine() {
  const info = renderer.info; const gl = renderer.getContext();
  const xr = renderer.xr.isPresenting, bl = xr ? renderer.xr.getSession()?.renderState?.baseLayer : null, m = info.memory;
  dbg.textContent = `FPS ${stats.fps.toFixed(1)}  ${stats.ms.toFixed(2)}ms（中央値 ${stats.median.toFixed(1)}ms）  描画 ${sceneCalls}（全体 ${info.render.calls}） 三角形 ${sceneTris}\n` +
    (xr ? `XR 描画バッファ ${bl?.framebufferWidth ?? '?'}×${bl?.framebufferHeight ?? '?'}  レート ${renderer.xr.getSession()?.frameRate ?? '?'}Hz` : `出力 ${Math.round(innerWidth * devicePixelRatio)}×${Math.round(innerHeight * devicePixelRatio)}  内部 ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}  倍率 ${renderer.getPixelRatio().toFixed(2)}${usePost() ? '  ブルーム' : ''}`) +
    `\n形 ${m.geometries} テクスチャ ${m.textures} プログラム ${info.programs?.length ?? '?'}  準備 ${world.stats.warmMs.toFixed(0)}ms 地形 ${world.stats.buildMs.toFixed(0)}ms`;
}
window.__stats = () => ({ ...stats, calls: sceneCalls, tris: sceneTris, allCalls: renderer.info.render.calls, buf: [renderer.getContext().drawingBufferWidth, renderer.getContext().drawingBufferHeight], xr: renderer.xr.isPresenting, post: usePost(), mem: world.memory(), programs: renderer.info.programs?.length, world: { ...world.stats }, jobs: world.jobs.pending });
window.__world = world; window.__cam = { base: camBase, center: camCenter }; // 自動検証用（カメラを寄せて細部を確かめる）
document.fonts.load("800 16px 'AR Sans'").finally(() => layout());
// 自動検証用（VR の開始・終了をスクリプトから呼ぶ）
window.__xr = { start: () => startXR(), end: () => renderer.xr.getSession()?.end(), get rate() { return renderer.xr.getSession()?.frameRate; }, get presenting() { return renderer.xr.isPresenting; } };
