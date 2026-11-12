// VOIDBLOOM — Meta Quest 3（WebXR immersive-vr）版
// ・盤面（32 × 18 u）を 1u = 5.5cm で目の前 1.7m に浮かべる（幅 約 1.76m）。地形は奥へ最大 60cm、星は 11m 奥、星雲は 50m 先
//   → 盤面の外側まで奥行きが続き、立体視で「窓の向こうの宇宙」に見える
// ・頭を動かしても盤面は空間に固定（酔わないよう画面揺れは使わない）
// ・ロジックは大画面版と同じ shared/game-core.js（60Hz 固定）。描画は 72/90/120Hz で補間
import * as THREE from 'three';
import { createGame, step, DT, FIELD_W, FIELD_H, continueGame, nextLoop, startStage, killEnemy } from '../../shared/game-core.js';
import { STAGES } from '../../shared/stages.js';
import { BOSS } from '../../shared/bosses.js';
import { World } from '../../shared/render/world.js';
import { Input } from '../../shared/input.js';
import { GameAudio } from '../../shared/audio/audio.js';
import { ENDING_TEXT } from '../../shared/story.js';
import { makeFrameClock } from '../../shared/frame-clock.js';
const frameClock = makeFrameClock();

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const S = 0.055;                       // 1u の大きさ（m）
const DIST = +(Q.get('dist') || 1.55);  // 盤面までの距離（m）
const FB = +(Q.get('fb') || 1.15);     // XR の解像度倍率
const LS = { get(k, d) { try { const v = localStorage.getItem('voidbloom:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('voidbloom:' + k, JSON.stringify(v)); } catch {} } };
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 描画
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(FB);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 1.3, DIST + 0.75);
const anchor = new THREE.Group(); anchor.position.set(0, 1.35, 0); scene.add(anchor);   // 盤面の中心
renderer.localClippingEnabled = true;
const world = new World(renderer, { vr: true, lite: !Q.has('full'), clip: !Q.has('noclip') });
world.root.scale.setScalar(S);
world.root.position.set(-FIELD_W / 2 * S, -FIELD_H / 2 * S, 0);
anchor.add(world.root);
scene.fog = world.fog; // 奥ほど毒の色の闇に沈む（m 単位）
// 盤面の縁（宇宙を覗く窓の枠。ごく薄く）
const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(FIELD_W * S, FIELD_H * S)), new THREE.LineBasicMaterial({ color: 0x2a4a5a, transparent: true, opacity: 0.5 }));
anchor.add(frame);

// ---------------------------------------------------------------- 文字の板（キャンバスをテクスチャに）
class Panel {
  constructor(pw, ph, wMeters, transparent = true) {
    this.c = document.createElement('canvas'); this.c.width = pw; this.c.height = ph; this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wMeters, wMeters * ph / pw), new THREE.MeshBasicMaterial({ map: this.tex, transparent, depthWrite: false, depthTest: false, toneMapped: false }));
    this.mesh.renderOrder = 20; this.key = '';
  }
  draw(key, fn) { if (key === this.key) return; this.key = key; this.g.clearRect(0, 0, this.c.width, this.c.height); this.g.save(); fn(this.g, this.c.width, this.c.height); this.g.restore(); this.tex.needsUpdate = true; }
}
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Noto Sans Mono", monospace';
const hudP = new Panel(2048, 300, 1.76); hudP.mesh.position.set(0, -FIELD_H * S / 2 - 0.1, 0.18); hudP.mesh.rotation.x = -0.32; anchor.add(hudP.mesh);
const topP = new Panel(2048, 120, 1.76); topP.mesh.position.set(0, FIELD_H * S / 2 + 0.06, 0.15); topP.mesh.rotation.x = 0.12; anchor.add(topP.mesh);
const msgP = new Panel(1600, 900, 1.25); msgP.mesh.position.set(0, 0, 0.32); anchor.add(msgP.mesh);

// ---------------------------------------------------------------- 状態
const input = new Input();
const audio = new GameAudio();
const vol = LS.get('opts', { master: 8, music: 8, sfx: 9 });
audio.setVolume({ master: (vol.master ?? 8) / 10, music: (vol.music ?? 8) / 10, sfx: (vol.sfx ?? 9) / 10 });
let hi = LS.get('hi', 50000);
let screen = 'title', game = null, demo = null, acc = 0, menuIdx = 0, practice = 0, contT = 0, endingT = 0, banner = null, bannerT = 0, warnT = 0, warnName = '';
let inXR = false, flatMode = false, needRecenter = 0;
function newDemo() { const d = createGame({ stage: Math.floor(Math.random() * STAGES.length), seed: Date.now() & 0xffff }); d.spawnIdx = d.stage.spawns.length; d.player.alive = false; d.player.x = -50; d.scrollSpeed *= 1.4; d.events.length = 0; return d; }
demo = newDemo();

const menu = () => [
  { t: 'GAME START', go: () => startGame(0) },
  { t: `PRACTICE  ◀ STAGE ${practice + 1} ${STAGES[practice].name} ▶`, go: () => startGame(practice), lr: (d) => { practice = (practice + d + STAGES.length) % STAGES.length; } },
  { t: `MUSIC  ${'■'.repeat(vol.music ?? 8)}${'□'.repeat(10 - (vol.music ?? 8))}`, lr: (d) => { vol.music = Math.max(0, Math.min(10, (vol.music ?? 8) + d)); LS.set('opts', Object.assign(LS.get('opts', {}), vol)); audio.setVolume({ music: vol.music / 10 }); } },
  { t: 'EXIT', go: () => { if (inXR) renderer.xr.getSession().end(); else location.href = '../../'; } },
];
const pauseMenu = () => [
  { t: 'RESUME', go: () => { screen = 'play'; } },
  { t: 'RESTART STAGE', go: () => { startStage(game, game.stageIndex, 0, false); onEvents(game); screen = 'play'; } },
  { t: 'RECENTER（盤面を目の前に）', go: () => { recenter(); screen = 'play'; } },
  { t: 'TITLE', go: () => { game = null; screen = 'title'; audio.music('title'); } },
];
function startGame(stage) { game = createGame({ stage, hi, seed: (Date.now() & 0xffffff) >>> 0, invincible: DEBUG && Q.has('inv') }); acc = 0; screen = 'play'; setBanner(`STAGE ${stage + 1}`, STAGES[stage].name); }
function setBanner(a, b, sec = 3) { banner = [a, b || '']; bannerT = sec; }

// ---------------------------------------------------------------- XR 入力
let gripT = 0;
const prev = {};
function pollXR() {
  const o = { x: 0, y: 0, fire: false, pod: false, rapid: false, pause: false, start: false, up: false, down: false, left: false, right: false, back: false };
  const session = renderer.xr.getSession();
  let grips = 0;
  if (session) for (const src of session.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    const m = Math.hypot(ax, ay); if (m < 0.18) { ax = 0; ay = 0; } else { const k = Math.min(1, (m - 0.18) / 0.72) / m; ax *= k; ay *= k; }
    if (src.handedness === 'left' || (Math.abs(ax) + Math.abs(ay) > Math.abs(o.x) + Math.abs(o.y))) { if (src.handedness === 'left' || !o.x) { o.x = ax; o.y = -ay; } }
    if (b(0)) { o.fire = true; o.start = true; }
    if (b(4)) o.pod = true;       // A / X
    if (b(5)) { o.rapid = true; o.back = true; }   // B / Y
    if (b(3)) o.pause = true;     // スティック押し込み
    if (b(1)) grips++;
    o.up = o.up || ay < -0.6; o.down = o.down || ay > 0.6; o.left = o.left || ax < -0.6; o.right = o.right || ax > 0.6;
  }
  gripT = grips >= 2 ? gripT + 1 : 0;
  if (gripT === 50) { recenter(); haptic(0.4, 60); }
  o.pressed = {};
  for (const k of ['fire', 'pod', 'rapid', 'pause', 'start', 'up', 'down', 'left', 'right', 'back']) { o.pressed[k] = o[k] && !prev[k]; prev[k] = o[k]; }
  return o;
}
function haptic(v, ms) {
  const session = renderer.xr.getSession(); if (!session) return;
  for (const src of session.inputSources) { const h = src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0]; if (h && h.pulse) h.pulse(v, ms).catch(() => {}); }
}
// 盤面を今の頭の正面に置き直す（向きは左右の回転だけ合わせる）
function recenter() {
  const cam = renderer.xr.getCamera();
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  cam.getWorldPosition(p); cam.getWorldQuaternion(q);
  if (p.lengthSq() < 1e-6) return false; // まだ頭の位置が取れていない
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const yaw = e.y;
  anchor.position.set(p.x - Math.sin(yaw) * DIST, Math.max(0.8, p.y - 0.08), p.z - Math.cos(yaw) * DIST);
  anchor.rotation.set(0, yaw, 0);
  return true;
}

// ---------------------------------------------------------------- 開始
async function enterVR() {
  await audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    session.addEventListener('end', () => { inXR = false; $('ui').hidden = false; });
    await renderer.xr.setSession(session);
    if (renderer.xr.setFoveation) renderer.xr.setFoveation(+(Q.get('fov') || 0.35));
    if (session.updateTargetFrameRate && session.supportedFrameRates) {
      const rates = Array.from(session.supportedFrameRates); const want = rates.includes(90) ? 90 : Math.max(...rates);
      session.updateTargetFrameRate(want).catch(() => {});
    }
    inXR = true; $('ui').hidden = true;
    needRecenter = 1;
    if (screen === 'title') audio.music('title');
  } catch (err) { $('msg').textContent = 'VR を開始できませんでした: ' + err.message; }
}
$('enter').onclick = enterVR;
$('flat').onclick = async () => { await audio.init(); flatMode = true; $('ui').hidden = true; audio.music('title'); };
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    $('enter').disabled = !ok; $('enter').textContent = ok ? 'VR 空間に入る' : 'このブラウザは VR に未対応';
    if (!ok) $('msg').textContent = 'Quest 3 のブラウザで開いてください（PC では「VR なしで試す」で動作確認できます）';
  }).catch(() => { $('enter').textContent = 'VR に未対応'; });
} else { $('enter').textContent = 'このブラウザは VR に未対応'; $('msg').textContent = 'WebXR が使えません。Quest 3 のブラウザで開いてください。'; }
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !flatMode) return; if (DEBUG && game) debugKey(e.code); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------------------------------------------------------------- イベント
function onEvents(s) {
  const ev = s.events;
  audio.handle(ev); world.handle(ev);
  for (const e of ev) {
    if (e.t === 'stage' && game) setBanner(`STAGE ${e.index + 1}`, e.name);
    else if (e.t === 'boss') { warnName = e.name; warnT = 2.6; }
    else if (e.t === 'clear') setBanner('STAGE CLEAR', STAGES[e.index].ja + ' を浄化した', 5);
    else if (e.t === 'gameover') { contT = 10; screen = 'cont'; }
    else if (e.t === 'complete') { endingT = 0; screen = 'ending'; }
    else if (e.t === 'extend') setBanner('EXTEND', '', 1.5);
    else if (e.t === 'sfx' && (e.id === 'death')) haptic(1, 250);
    else if (e.t === 'sfx' && e.id === 'burst') haptic(0.25 + (e.lv || 1) * 0.12, 60 + (e.lv || 1) * 25);
    else if (e.t === 'sfx' && e.id === 'podAttach') haptic(0.3, 30);
  }
  ev.length = 0;
  if (s.score > hi) hi = s.score;
}
function debugKey(code) {
  if (code === 'KeyI') game.opts.invincible = !game.opts.invincible;
  if (code === 'KeyN') startStage(game, (game.stageIndex + 1) % STAGES.length, 0, true);
  if (code === 'KeyB' && game.boss) killEnemy(game, game.boss);
  if (code === 'KeyG') { game.scrollX = game.stage.bossStop - 8; game.spawnIdx = game.stage.spawns.findIndex((x) => x.x >= game.stage.bossStop + 20); }
  if (code === 'KeyE') for (const k of ['C', 'C', 'C', 'B', 'B', 'S']) game.items.push({ id: Math.random(), kind: k, x: game.player.x, y: game.player.y, px: game.player.x, py: game.player.y, t: 0 });
}

// ---------------------------------------------------------------- 板の描画
const fmt = (n) => String(Math.floor(n)).padStart(8, '0');
function drawHUD(s, fps) {
  const errs = window.__errors || [];
  const pod = s ? s.pod : null;
  const key = s ? [s.score, s.lives, s.player.speedLv, Math.round(s.player.charge * 40), pod && pod.level, pod && pod.color, pod && pod.state, s.bits.length, errs.length, DEBUG ? Math.round(fps) : 0].join('|') : 'none' + errs.length;
  hudP.draw(key, (g, W, H) => {
    if (!s) return;
    g.fillStyle = 'rgba(4,10,16,.72)'; g.beginPath(); g.roundRect(8, 8, W - 16, H - 16, 28); g.fill();
    g.strokeStyle = 'rgba(79,227,255,.35)'; g.lineWidth = 3; g.stroke();
    g.font = `700 64px ${MONO}`; g.textBaseline = 'middle';
    // 残機
    for (let k = 0; k < Math.min(8, s.lives); k++) { const x = 60 + k * 70; g.fillStyle = '#dff4ff'; g.beginPath(); g.moveTo(x, 90); g.lineTo(x + 50, 110); g.lineTo(x, 130); g.closePath(); g.fill(); }
    g.fillStyle = '#9fffef'; g.font = `600 40px ${MONO}`; g.fillText('SPEED ' + '▸'.repeat(s.player.speedLv + 1), 60, 200);
    // 溜め
    const bx = 620, bw = 800, by = 82, bh = 56;
    g.fillStyle = '#7fd7ff'; g.font = `600 40px ${MONO}`; g.fillText('BEAM', bx, by - 34 + 4);
    g.strokeStyle = '#5fa8c8'; g.lineWidth = 4; g.strokeRect(bx, by, bw, bh);
    const ch = s.player.charge; const grd = g.createLinearGradient(bx, 0, bx + bw, 0); grd.addColorStop(0, '#1a6fa0'); grd.addColorStop(0.7, '#4fe3ff'); grd.addColorStop(1, '#ffffff');
    g.fillStyle = ch >= 1 ? '#e6fbff' : grd; g.fillRect(bx + 4, by + 4, (bw - 8) * ch, bh - 8);
    // 装備
    g.textAlign = 'right'; g.font = `700 46px ${MONO}`;
    const cname = { C: 'LANCE', M: 'RICOCHET', A: 'CRAWLER' }, ccol = { C: '#4fe3ff', M: '#ff4fb4', A: '#ffb347' };
    if (pod) { g.fillStyle = pod.level ? ccol[pod.color] : '#cccccc'; g.fillText(`SEED ${pod.level ? cname[pod.color] + ' ' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][pod.level - 1] : '—'} ${pod.state === 'front' ? '前' : pod.state === 'back' ? '後' : '離'}`, W - 60, 110); }
    else { g.fillStyle = '#7d8b99'; g.fillText('SEED なし', W - 60, 110); }
    g.fillStyle = '#7dffb0'; g.font = `600 40px ${MONO}`; if (s.bits.length) g.fillText(`SPORELET ×${s.bits.length}`, W - 60, 200);
    if (DEBUG) { g.fillStyle = '#9f9'; g.fillText(`${Math.round(fps)} fps  e${s.enemies.length} b${s.ebullets.length}`, W - 60, 260); }
    g.textAlign = 'left';
    if (errs.length) { g.fillStyle = '#ff6080'; g.font = `600 30px ${MONO}`; g.fillText('ERROR: ' + String(errs[errs.length - 1]).split('\n').slice(0, 2).join(' / ').slice(0, 110), 40, 262); }
  });
  topP.draw(s ? [s.score, Math.max(hi, s.score), s.stageIndex, s.loop, s.boss ? Math.round(s.boss.hp / s.boss.maxHp * 50) : -1].join('|') : 'none', (g, W, H) => {
    if (!s) return;
    g.font = `700 60px ${MONO}`; g.textBaseline = 'middle'; g.shadowColor = '#000'; g.shadowBlur = 12;
    g.fillStyle = '#7fd7ff'; g.fillText('1P', 20, 60); g.fillStyle = '#fff'; g.fillText(fmt(s.score), 110, 60);
    g.textAlign = 'center'; g.fillStyle = '#7fd7ff'; g.fillText('HI', W / 2 - 200, 60); g.fillStyle = '#fff'; g.fillText(fmt(Math.max(hi, s.score)), W / 2 + 60, 60);
    g.textAlign = 'right'; g.font = `600 42px ${MONO}`; g.fillStyle = '#9fb2c4'; g.fillText(`STAGE ${s.stageIndex + 1} ${s.stage.name}`, W - 20, 60);
    if (s.boss && !s.boss.dying) { g.textAlign = 'center'; g.fillStyle = '#ff4fb4'; g.fillRect(W / 2 - 400, 106, 800 * Math.max(0, s.boss.hp / s.boss.maxHp), 10); }
  });
}
function drawMsg(lines, key, opts = {}) {
  msgP.mesh.visible = true;
  msgP.draw(key, (g, W, H) => {
    if (opts.dim) { g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.roundRect(0, 0, W, H, 40); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#000'; g.shadowBlur = 18;
    let y = opts.top ?? H / 2 - (lines.length - 1) * 40;
    for (const L of lines) {
      const [text, size = 56, color = '#e3edf5', weight = 600] = Array.isArray(L) ? L : [L];
      g.font = `${weight} ${size}px ${MONO}`; g.fillStyle = color;
      if (color === 'logo') { const gr = g.createLinearGradient(W / 2 - 600, 0, W / 2 + 600, 0); gr.addColorStop(0, '#f0f9ff'); gr.addColorStop(0.35, '#8fe6ff'); gr.addColorStop(0.7, '#ff8fd0'); gr.addColorStop(1, '#ffcf8f'); g.fillStyle = gr; }
      g.fillText(text, W / 2, y); y += size * 1.35;
    }
  });
}
function menuLines(items) { return items.map((it, k) => [(k === menuIdx ? '▶ ' : '  ') + it.t, 52, k === menuIdx ? '#ffffff' : '#7d8b99', k === menuIdx ? 700 : 500]); }
function menuNav(inp, items) {
  if (inp.pressed.up) { menuIdx = (menuIdx - 1 + items.length) % items.length; audio.sfx('select'); }
  if (inp.pressed.down) { menuIdx = (menuIdx + 1) % items.length; audio.sfx('select'); }
  const it = items[menuIdx];
  if (it && it.lr && (inp.pressed.left || inp.pressed.right)) { it.lr(inp.pressed.left ? -1 : 1); audio.sfx('select'); }
  if (it && (inp.pressed.fire || inp.pressed.start) && it.go) { audio.sfx('start'); menuIdx = Math.min(menuIdx, 9); it.go(); }
}

// ---------------------------------------------------------------- ループ
let last = performance.now(), fps = 72, fAcc = 0, fN = 0;
renderer.setAnimationLoop((now) => {
  const dt = frameClock(now); last = now;
  fAcc += dt; fN++; if (fAcc > 0.5) { fps = fN / fAcc; fAcc = 0; fN = 0; }
  if (inXR && needRecenter && ++needRecenter > 3 && recenter()) needRecenter = 0;
  const inp = inXR ? pollXR() : input.poll();
  const active = inXR || flatMode;
  if (bannerT > 0) bannerT -= dt;
  if (warnT > 0) warnT -= dt;
  let s = game || demo;
  msgP.mesh.visible = false;

  if (screen === 'title') {
    if (active) menuNav(inp, menu());
    drawMsg([['VOIDBLOOM', 150, 'logo', 800], ['虚空に咲いた金属の花を焼き払え', 40, '#9fb2c4'], ['', 30], ...menuLines(menu()), ['', 20], ['左スティック 選ぶ ／ トリガー 決定', 34, '#7d8b99'], [`HI-SCORE ${fmt(hi)}     MADE WITH CLAUDE`, 30, '#c9b6ff']], 'title' + menuIdx + practice + vol.music + hi, { top: 150 });
  } else if (screen === 'play') {
    if (inp.pressed.pause) { screen = 'pause'; menuIdx = 0; audio.sfx('pause'); }
    else { acc += dt; let n = 0; while (acc >= DT && n++ < 6) { step(game, inp); acc -= DT; onEvents(game); } if (acc > DT * 6) acc = 0; }
  } else if (screen === 'pause') {
    if (inp.pressed.pause) screen = 'play'; else menuNav(inp, pauseMenu());
    drawMsg([['PAUSE', 110, '#ffffff', 800], ['', 30], ...menuLines(pauseMenu())], 'pause' + menuIdx, { dim: true });
  } else if (screen === 'cont') {
    contT -= dt;
    if (inp.pressed.fire || inp.pressed.start) { continueGame(game); onEvents(game); screen = 'play'; acc = 0; }
    else if (contT <= 1) { LS.set('hi', hi); game = null; screen = 'title'; audio.music('title'); }
    if (game) { acc += dt; while (acc >= DT) { step(game, {}); acc -= DT; onEvents(game); } }
    drawMsg([['CONTINUE?', 110, '#ffffff', 800], [String(Math.max(0, Math.ceil(contT - 1))), 220, '#ff8fd0', 800], ['トリガーで続ける（得点は 0 に戻ります）', 42, '#cfd8e0']], 'cont' + Math.ceil(contT), { dim: true });
  } else if (screen === 'ending') {
    endingT += dt;
    acc += dt; while (acc >= DT) { step(game, {}); acc -= DT; game.events.length = 0; }
    drawMsg(ENDING_TEXT(game).split('\n').map((l) => [l, 40, '#e3edf5', 500]), 'end', { dim: true, top: 80 });
    if (endingT > 6 && (inp.pressed.fire || inp.pressed.start)) { LS.set('hi', hi); nextLoop(game); onEvents(game); screen = 'play'; }
    if (endingT > 40) { LS.set('hi', hi); game = null; screen = 'title'; audio.music('title'); }
  }
  if (!game) { s = demo; acc += dt; while (acc >= DT) { step(demo, {}); acc -= DT; demo.events.length = 0; } if (demo.scrollX > demo.stage.bossStop - 2) demo = newDemo(); }
  if (game && game.score >= hi) LS.set('hi', game.score);
  if ((screen === 'play') && (bannerT > 0 || warnT > 0)) {
    if (warnT > 0) drawMsg([['WARNING', 160, Math.floor(warnT * 4) % 2 ? '#ff3d6e' : '#7a1030', 800], [warnName, 48, '#ffc0d0']], 'warn' + Math.floor(warnT * 4));
    else drawMsg([[banner[0], 110, '#ffffff', 700], [banner[1], 48, '#9fb2c4']], 'ban' + banner.join());
  }

  const alpha = Math.max(0, Math.min(1, acc / DT));
  world.sync(s, alpha, dt);
  if (inXR) { const l = renderer.xr.getSession().renderState.baseLayer; if (l) world.setViewportHeight(l.framebufferHeight, 1); }
  else world.setViewportHeight(innerHeight * renderer.getPixelRatio(), renderer.getPixelRatio());
  hudP.mesh.visible = topP.mesh.visible = !!game;
  drawHUD(game, fps);
  if (!inXR) camera.lookAt(anchor.position);
  renderer.render(scene, camera);
  if (DEBUG && !inXR) $('hud2d').textContent = `FPS ${fps.toFixed(0)} calls ${renderer.info.render.calls} tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n${game ? 'scroll ' + game.scrollX.toFixed(1) + ' e' + game.enemies.length + ' b' + game.ebullets.length + (game.opts.invincible ? ' INV' : '') : ''}\naudio ${audio.mode || '-'}`;
});
window.__vb = { get game() { return game; }, world, renderer, audio, recenter };
