// ツイン・ガーデン VR — 3D／WebXR 版の入口（Meta Quest 3 のブラウザーで単体動作。PC では通常の 3D 画面）
import * as THREE from 'three';
import { App } from '/shared/app.js';
import { DomUI } from '/shared/ui/dom-ui.js';
import { C, DT } from '/shared/core/config.js';
import { Renderer3D } from './scene.js';
import { VRUI } from './vrui.js';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const root = document.getElementById('app');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r187 では PCFSoft は廃止（PCF に統合）
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const r3 = new Renderer3D(renderer);
const vrui = new VRUI(r3.scene);
const dom = new DomUI(root);

// ───────── 計測（?debug=1 で HUD に出す。Quest 実機の記録用） ─────────
const perf = { last: 0, buf: new Float32Array(600), i: 0, n: 0, text: '' };
function perfTick(now) {
  if (perf.last) { perf.buf[perf.i] = now - perf.last; perf.i = (perf.i + 1) % perf.buf.length; perf.n = Math.min(perf.n + 1, perf.buf.length); }
  perf.last = now;
  if (perf.n > 30 && (perf.i % 30) === 0) {
    const a = Array.from(perf.buf.subarray(0, perf.n)).sort((x, y) => x - y);
    const avg = a.reduce((s, v) => s + v, 0) / a.length, p95 = a[Math.floor(a.length * 0.95)], p99 = a[Math.floor(a.length * 0.99)];
    const sess = renderer.xr.getSession();
    const bl = sess && sess.renderState.baseLayer;
    const fb = bl ? `${bl.framebufferWidth}×${bl.framebufferHeight}` : `${renderer.domElement.width}×${renderer.domElement.height}`;
    const hz = sess && sess.frameRate ? `${sess.frameRate}Hz` : '';
    perf.text = `${(1000 / avg).toFixed(0)}fps 平均${avg.toFixed(1)} p95 ${p95.toFixed(1)} p99 ${p99.toFixed(1)}ms ${fb} ${hz} ${app.store.data.settings.vrQuality}`;
    if (debug && !app.inXR) debugBox.textContent = perf.text;
  }
}

// ───────── 画面表示（通常は DOM、VR 中は板） ─────────
const ui = {
  showMenu: (def, focus, a) => { dom.showMenu(def, focus, a); vrui.showMenu(def, focus); },
  hideMenu: (a) => { dom.hideMenu(a); vrui.hideMenu(); },
  hud: (g, a) => { dom.hud(g, a); if (a.inXR) vrui.hud(g, debug ? perf.text : ''); },
};
const view = {
  setGame: (g) => r3.setGame(g),
  onEvents: (ev, g) => { r3.onEvents(ev, g); haptics(ev); },
  render: (g, alpha, dt, now) => {
    perfTick(now);
    fadeTick(dt);
    if (!app.inXR) { if (!g) vrui.hud(null); }
    r3.render(g, alpha, dt);
  },
};

const app = new App({ variant: 'vr', view, ui });
window.__app = app; window.__r3 = r3; window.__vrui = vrui;

// ───────── 設定の反映 ─────────
function applySettings() {
  const S = app.store.data.settings;
  r3.setMode({ scale: S.vrScale, posture: S.vrPosture, h: S.tableHeight, d: S.tableDist, size: S.tableSize, inXR: app.inXR, eye: app.inXR ? eyeY : 0 });
  vrui.place(r3.garden, r3.s, S.vrScale === 'immersive' && app.inXR);
  const ultra = S.vrQuality === 'ultra';
  r3.setShadowSize(app.inXR ? (ultra ? 2048 : 1024) : 2048);
  if (!app.inXR) resize();
}
app.on((what) => {
  if (what.startsWith('setting:')) {
    const k = what.slice(8);
    if (k === 'vrScale' && app.inXR) fadeSwitch(); else applySettings();
  }
});

// 表示の切り替えは短い暗転で（一時停止中に行う）
const fade = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }));
fade.renderOrder = 100; r3.camera.add(fade);
const fadeState = { t: -1, done: false };
function fadeSwitch() { fadeState.t = 0; fadeState.done = false; }
// 描画ループの経過時間で進める（XR のフレームでも確実に進む）
function fadeTick(dt) {
  if (fadeState.t < 0) return;
  fadeState.t += dt;
  const u = fadeState.t / 0.5; // 0.25 秒で暗く → 切り替え → 0.25 秒で明るく
  fade.material.opacity = u < 0.5 ? u * 2 : Math.max(0, 2 - u * 2);
  if (u >= 0.5 && !fadeState.done) { fadeState.done = true; applySettings(); }
  if (u >= 1) { fadeState.t = -1; fade.material.opacity = 0; }
}

// ───────── 通常の 3D 画面 ─────────
function resize() {
  const W = root.clientWidth, H = root.clientHeight;
  const hudH = dom.hudEl.getBoundingClientRect().height || 0;
  canvas.style.position = 'absolute'; canvas.style.left = '0'; canvas.style.top = hudH + 'px';
  canvas.style.width = W + 'px'; canvas.style.height = (H - hudH) + 'px';
  dom.hudEl.style.left = '0'; dom.hudEl.style.right = '0'; dom.hudEl.style.top = '0';
  if (!renderer.xr.isPresenting) {
    renderer.setPixelRatio(Math.max(1, devicePixelRatio || 1) * (app.store.data.settings.quality === 'auto' ? autoScale : 1));
    renderer.setSize(W, Math.max(1, H - hudH), false);
    r3.fitCamera(W / Math.max(1, H - hudH));
  }
}
let autoScale = 1;
addEventListener('resize', resize);
new ResizeObserver(resize).observe(root);
app.on((w) => { if (['start', 'title', 'end', 'pause', 'resume'].includes(w)) setTimeout(resize, 0); });

// ───────── WebXR ─────────
const ctrl = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  c.userData = { src: null, hand: null, armed: true, prev: {}, rep: {}, target: null };
  c.addEventListener('connected', (e) => { c.userData.src = e.data; c.userData.hand = e.data.handedness; });
  c.addEventListener('disconnected', () => { c.userData.src = null; c.userData.hand = null; c.userData.target = null; });
  c.addEventListener('select', () => onSelect(c));
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: i ? 0x7cc1ff : 0xff8a8e, transparent: true, opacity: 0.85 }));
  ray.scale.z = 3; ray.visible = false; c.add(ray); c.userData.ray = ray;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.visible = false; r3.scene.add(dot); c.userData.dot = dot;
  r3.scene.add(c);
  // 手元の目印（自前の簡単なモデル。外部のコントローラーモデルは読み込まない）
  const grip = renderer.xr.getControllerGrip(i);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: i ? 0x3f9dff : 0xff4f57, roughness: 0.4 }));
  grip.add(body); r3.scene.add(grip);
  return c;
});
window.__ctrl = ctrl;
const ray = new THREE.Raycaster();
const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpP = new THREE.Plane(), tmpHit = new THREE.Vector3();

function handOf(side) { return ctrl.find((c) => c.userData.hand === side); }
function setRay(c) { tmpM.identity().extractRotation(c.matrixWorld); ray.ray.origin.setFromMatrixPosition(c.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM); }

function onSelect(c) {
  if (!app.inXR || app.screen === 'play') return;
  setRay(c);
  const hit = ray.intersectObject(vrui.menu.mesh, false)[0];
  if (hit) { const i = vrui.rowAt(hit.uv); if (i >= 0) { app.focus = i; app.activate(i); } }
}

// スティック・ボタン → ゲームの方向とメニューのコマンド
let xrDir = null;
app.input.extra.push(() => (app.inXR ? xrDir : null));
app.preFrame = (dt, frame) => {
  if (!app.inXR) { xrDir = null; return; }
  // 追跡が切れたら一時停止（ゲームを進めない）
  if (frame) {
    const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
    // 入った直後に目の高さを測り、庭とメニューをその高さに合わせる
    if (pose && !eyeY) { eyeY = pose.transform.position.y || 1.2; applySettings(); }
    if (!pose || pose.emulatedPosition) { if (app.screen === 'play' && !pose) app.autoPause('blur'); }
  }
  const S = app.store.data.settings;
  const menuOpen = app.screen !== 'play';
  const out = { r: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
  let hovered = -1;
  for (const c of ctrl) {
    const u = c.userData, src = u.src;
    u.ray.visible = !!src && (menuOpen || S.vrControl === 'direct');
    u.dot.visible = false;
    if (!src || !src.gamepad) continue;
    const gp = src.gamepad, ax = gp.axes;
    const sx = ax.length >= 4 ? ax[2] : ax[0] || 0, sy = ax.length >= 4 ? ax[3] : ax[1] || 0;
    const dz = Math.hypot(sx, sy) > 0.18 ? 1 : 0;
    const btn = (k) => !!(gp.buttons[k] && gp.buttons[k].pressed);
    const trig = gp.buttons[0] ? gp.buttons[0].value > 0.5 : false;
    if (!trig) u.armed = true;
    const side = u.hand === 'left' ? 'r' : u.hand === 'right' ? 'b' : null;
    // メニュー用（押した瞬間・上下は繰り返し）
    const cur = { up: sy < -0.6, down: sy > 0.6, left: sx < -0.6, right: sx > 0.6, ok: btn(4), back: btn(5) };
    const now = performance.now();
    for (const k of Object.keys(cur)) {
      if (cur[k] && !u.prev[k]) { pushCmd(k, menuOpen); u.rep[k] = now + 380; }
      else if (cur[k] && menuOpen && ['up', 'down', 'left', 'right'].includes(k) && now > u.rep[k]) { pushCmd(k, menuOpen); u.rep[k] = now + 120; }
    }
    u.prev = cur;
    if (menuOpen) {
      setRay(c);
      const hit = ray.intersectObject(vrui.menu.mesh, false)[0];
      if (hit) { const i = vrui.rowAt(hit.uv); if (i >= 0) hovered = i; u.ray.scale.z = hit.distance; u.dot.visible = true; u.dot.position.copy(hit.point); }
      else u.ray.scale.z = 3;
      continue;
    }
    if (!side) continue;
    if (S.vrControl === 'stick') {
      // 盤面基準: 奥へ倒す（sy < 0）と庭の奥（盤面の y が小さい方）へ。頭の向きは使わない
      if (dz) { out[side].x = sx; out[side].y = sy; }
    } else if (trig && u.armed) {
      // 直接操作: レーザーと庭の面の交点へ、通常の速さで向かう（瞬間移動しない）
      setRay(c);
      tmpP.setFromNormalAndCoplanarPoint(tmpV.set(0, 1, 0), r3.garden.position);
      if (ray.ray.intersectPlane(tmpP, tmpHit)) {
        const local = r3.garden.worldToLocal(tmpHit.clone());
        const tx = local.x + 12, ty = local.z + 9;
        if (!u.target) u.target = { x: tx, y: ty };
        const k = 1 - Math.exp(-dt / 0.06); // 手ぶれを抑える
        u.target.x += (tx - u.target.x) * k; u.target.y += (ty - u.target.y) * k;
        const me = app.game ? (side === 'r' ? app.game.red : app.game.blue) : null;
        if (me) {
          const dx = u.target.x - me.x, dy = u.target.y - me.y, d = Math.hypot(dx, dy), step = C.playerSpeed * DT;
          if (d > 0.04) { const m = Math.min(1, d / step); out[side].x = (dx / d) * m; out[side].y = (dy / d) * m; }
        }
        u.ray.scale.z = tmpHit.distanceTo(ray.ray.origin); u.dot.visible = true; u.dot.position.copy(tmpHit);
      }
    } else u.target = null;
  }
  if (menuOpen) vrui.setHover(hovered);
  xrDir = menuOpen ? null : out;
};
function pushCmd(k, menuOpen) {
  if (!menuOpen) { if (k === 'back') app.input.queue.push('pause'); return; }
  app.input.queue.push(k);
}

function haptics(ev) {
  if (!app.inXR) return;
  for (const e of ev) {
    const strong = e.type === 'miss' ? [1, 160] : e.type === 'capture' && e.items.length ? [0.45, 50] : e.type === 'chest' || e.type === 'power' ? [0.7, 90] : null;
    if (!strong) continue;
    for (const c of ctrl) { const a = c.userData.src?.gamepad?.hapticActuators?.[0]; if (a && a.pulse) a.pulse(strong[0], strong[1]).catch?.(() => {}); }
  }
}

// ───────── VR の開始・終了 ─────────
let session = null;
let eyeY = 0; // VR に入ったときの目の高さ（m）
app.enterVR = async () => {
  if (session || !navigator.xr) return;
  try {
    const S = app.store.data.settings;
    const ultra = S.vrQuality === 'ultra';
    renderer.xr.setFramebufferScaleFactor(ultra ? 1.35 : 1.0);
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
    session.addEventListener('end', onEnd);
    session.addEventListener('visibilitychange', () => { if (session && session.visibilityState !== 'visible') app.autoPause('blur'); });
    session.addEventListener('inputsourceschange', () => app.input.releaseAll());
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation(ultra ? 0.15 : 0.5);
    if (session.supportedFrameRates && session.updateTargetFrameRate) {
      const rates = Array.from(session.supportedFrameRates);
      const want = rates.includes(90) ? 90 : rates.includes(72) ? 72 : null;
      if (want) session.updateTargetFrameRate(want).catch(() => {});
    }
    app.inXR = true;
    vrui.group.visible = true;
    applySettings();
    app.audio.unlock(); app.audio.resume();
    if (app.screen === 'play') app.pause(); else app.refreshMenu();
    app.emitChange('xr');
  } catch (e) {
    session = null;
    dom.$('toast').hidden = false; dom.$('toast').textContent = 'VR を開始できませんでした: ' + (e && e.message || e);
    setTimeout(() => { dom.$('toast').hidden = true; }, 5000);
  }
};
app.exitVR = () => { if (session) session.end(); };
function onEnd() {
  session = null;
  eyeY = 0;
  app.inXR = false;
  vrui.group.visible = false;
  for (const c of ctrl) { c.userData.target = null; c.userData.armed = false; }
  if (app.screen === 'play') app.pause();
  applySettings();
  app.refreshMenu();
  app.emitChange('xr');
}

// 機能の検出（対応していなければ、通常の 3D 表示で遊べることを伝える）
async function detect() {
  if (!window.isSecureContext) { app.xrNote = 'VR には HTTPS が必要です（通常の 3D 表示で遊べます）'; return; }
  if (!navigator.xr) { app.xrNote = 'このブラウザーは WebXR に対応していません。通常の 3D 表示で遊べます（Quest のブラウザーで開くと VR で遊べます）'; return; }
  try { app.xrSupported = await navigator.xr.isSessionSupported('immersive-vr'); } catch (_) { app.xrSupported = false; }
  if (!app.xrSupported) app.xrNote = 'この端末では VR を開始できません。通常の 3D 表示で遊べます';
}

const debugBox = document.createElement('div');
if (debug) { debugBox.className = 'debug'; root.appendChild(debugBox); }

await detect();
applySettings();
app.setLoopDriver((f) => renderer.setAnimationLoop((t, frame) => f(t, frame)));
app.openMenu('title');
addEventListener('pointerdown', () => app.audio.unlock(), { passive: true });
addEventListener('keydown', () => app.audio.unlock(), { passive: true });
