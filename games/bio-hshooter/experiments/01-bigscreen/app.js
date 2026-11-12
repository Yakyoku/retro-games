// VOIDBLOOM 大画面版（50 インチ 4K 向け）
// ・描画は盤面 16:9 をネイティブ解像度で（devicePixelRatio をそのまま。重いときだけ自動で下げる）
// ・ロジックは 60Hz 固定、描画は表示の更新間隔（120Hz なども）で補間
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGame, step, DT, FIELD_W, FIELD_H, continueGame, nextLoop, startStage, killEnemy } from '../../shared/game-core.js';
import { STAGES } from '../../shared/stages.js';
import { BOSS } from '../../shared/bosses.js';
import { World } from '../../shared/render/world.js';
import { Input } from '../../shared/input.js';
import { TouchControls, isTouchDevice } from '../../shared/touch.js';
import { installNoZoom } from '../../shared/no-zoom.js';
const TOUCH = isTouchDevice();
import { GameAudio } from '../../shared/audio/audio.js';
import { ENDING_TEXT } from '../../shared/story.js';
import { makeFrameClock } from '../../shared/frame-clock.js';
const frameClock = makeFrameClock();
let camY = FIELD_H / 2, camT = 0;

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const $ = (id) => document.getElementById(id);
const LS = { get(k, d) { try { const v = localStorage.getItem('voidbloom:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('voidbloom:' + k, JSON.stringify(v)); } catch {} } };
const opts = Object.assign({ master: 8, music: 8, sfx: 9, scale: 'auto', bloom: true, fps: false }, LS.get('opts', {}));

// ---------------------------------------------------------------- 描画の準備
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
scene.fog = null;
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 4000);
const CAM_Z = (FIELD_H / 2) / Math.tan(THREE.MathUtils.degToRad(15));
camera.position.set(FIELD_W / 2, FIELD_H / 2, CAM_Z);
const world = new World(renderer, { vr: false, lite: Q.has('lite') || TOUCH }); // スマートフォンは粒子などを控えめに
scene.add(world.root);

let composer, bloomPass, rt;
let scale = opts.scale === 'auto' ? 1 : +opts.scale, baseDpr = window.devicePixelRatio || 1;
function setupComposer() {
  const w = canvas.clientWidth, h = canvas.clientHeight, pr = Math.min(baseDpr * scale, 2.5);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  rt && rt.dispose();
  rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.7, 0.45, 0.86);
  bloomPass.enabled = opts.bloom;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  world.setViewportHeight(h * pr, pr);
}
function resize() {
  const u = Math.min(innerHeight / 100, innerWidth / 177.7778);
  $('stage').style.setProperty('--u', u + 'px');
  document.documentElement.style.setProperty('--u', u + 'px');
  baseDpr = Math.min(window.devicePixelRatio || 1, TOUCH ? 2 : 4); // スマートフォンは描画倍率を 2 までに
  setupComposer();
}
// 画面の大きさが変わったら（iPad のツールバー・回転・分割表示も含めて）盤面を合わせ直す。拡大ジェスチャーは止める
const layout = installNoZoom(resize); // 最初の 1 回もここで呼ばれる

// ---------------------------------------------------------------- 状態
const touch = new TouchControls(document.body); // 画面全体に置く（横長のスマホでは盤面の左右の黒帯にボタンが来る）
const input = new Input(touch);
const audio = new GameAudio();
audio.setVolume({ master: opts.master / 10, music: opts.music / 10, sfx: opts.sfx / 10 });
let hi = LS.get('hi', 50000);
let screen = 'boot', game = null, demo = null, acc = 0, menuIdx = 0, contT = 0, endingT = 0, bannerT = 0;
function newDemo() { const d = createGame({ stage: Math.floor(Math.random() * STAGES.length), seed: Date.now() & 0xffff }); d.spawnIdx = d.stage.spawns.length; d.player.alive = false; d.player.x = -50; d.scrollSpeed *= 1.4; d.events.length = 0; return d; }
demo = newDemo();

function show(id, on) { $(id).hidden = !on; }
function setScreen(s) {
  screen = s;
  for (const id of ['boot', 'title', 'pause', 'cont', 'ending']) show(id, id === s);
  show('hud', s === 'play' || s === 'pause' || s === 'cont');
  if (s === 'title') { buildMenu(); audio.music('title'); $('hi2').textContent = String(hi).padStart(8, '0'); }
}

// ---------------------------------------------------------------- メニュー
let menuMode = 'main', practice = 0;
const SCALES = ['auto', '1', '0.85', '0.7', '0.5'];
function menuItems() {
  if (menuMode === 'main') return [
    { t: 'GAME START', go: () => startGame(0) },
    { t: 'PRACTICE', v: `STAGE ${practice + 1}  ${STAGES[practice].name}`, go: () => startGame(practice), lr: (d) => { practice = (practice + d + STAGES.length) % STAGES.length; } },
    { t: 'OPTIONS', go: () => { menuMode = 'opt'; menuIdx = 0; } },
    { t: 'SOUND TEST', go: () => { location.href = '../../sound-test.html'; } },
    { t: 'GALLERY', go: () => { location.href = '../../gallery.html'; } },
    { t: 'EXIT', go: () => { location.href = '../../'; } },
  ];
  const vol = (k, label) => ({ t: label, v: '■'.repeat(opts[k]) + '□'.repeat(10 - opts[k]), lr: (d) => { opts[k] = Math.max(0, Math.min(10, opts[k] + d)); applyOpts(); } });
  return [
    vol('master', 'MASTER'), vol('music', 'MUSIC'), vol('sfx', 'SE'),
    { t: 'RENDER SCALE', v: opts.scale === 'auto' ? 'AUTO（重いと自動で下げる）' : Math.round(+opts.scale * 100) + '%', lr: (d) => { opts.scale = SCALES[(SCALES.indexOf(opts.scale) + d + SCALES.length) % SCALES.length]; scale = opts.scale === 'auto' ? 1 : +opts.scale; applyOpts(); setupComposer(); } },
    { t: 'BLOOM', v: opts.bloom ? 'ON' : 'OFF', lr: () => { opts.bloom = !opts.bloom; bloomPass.enabled = opts.bloom; applyOpts(); } },
    { t: 'FPS', v: opts.fps ? 'ON' : 'OFF', lr: () => { opts.fps = !opts.fps; applyOpts(); } },
    { t: 'BACK', go: () => { menuMode = 'main'; menuIdx = 2; } },
  ];
}
function applyOpts() { LS.set('opts', opts); audio.setVolume({ master: opts.master / 10, music: opts.music / 10, sfx: opts.sfx / 10 }); buildMenu(); }
function buildMenu() {
  const ul = $('menu'); ul.innerHTML = '';
  menuItems().forEach((it, k) => {
    const li = document.createElement('li'); li.className = k === menuIdx ? 'on' : '';
    li.innerHTML = it.t + (it.v ? `<span class="val">${it.lr ? '◀ ' : ''}${it.v}${it.lr ? ' ▶' : ''}</span>` : '');
    // 左右で値を変える項目は、値の左半分を押すと戻す・右半分で進める（指でもマウスでも）
    li.onclick = (ev) => { menuIdx = k; const r = li.getBoundingClientRect(); if (it.lr && !(it.go && ev.clientX < r.left + r.width * 0.45)) it.lr(ev.clientX < r.left + r.width * 0.72 ? -1 : 1); else if (it.go) it.go(); audio.sfx('select'); buildMenu(); };
    li.onmouseenter = () => { if (menuIdx !== k) { menuIdx = k; buildMenu(); } };
    ul.appendChild(li);
  });
  $('help').textContent = (TOUCH && input.lastDevice !== 'key' && input.lastDevice !== 'pad') ? '左半分をなぞって移動 ／ 右の「撃つ」（長押しで溜め）・SEED・連射 ／ 右上 Ⅱ で一時停止 ／ メニューは指で選ぶ'
    : input.lastDevice === 'pad'
    ? '左スティック 移動 ／ A 撃つ（長押しで溜め） ／ B・LB・RB SEED 切り離し・呼び戻し ／ X・RT 連射 ／ START 一時停止'
    : '矢印・WASD 移動 ／ Z 撃つ（長押しで溜め） ／ X SEED 切り離し・呼び戻し ／ C 連射 ／ Esc 一時停止 ／ F フルスクリーン';
}
function menuNav(inp, items, rebuild) {
  if (inp.pressed.up) { menuIdx = (menuIdx - 1 + items.length) % items.length; audio.sfx('select'); rebuild(); }
  if (inp.pressed.down) { menuIdx = (menuIdx + 1) % items.length; audio.sfx('select'); rebuild(); }
  const it = items[menuIdx];
  if (it && it.lr && (inp.pressed.left || inp.pressed.right)) { it.lr(inp.pressed.left ? -1 : 1); audio.sfx('select'); rebuild(); }
  if (it && (inp.pressed.fire || inp.pressed.start) && it.go) { audio.sfx('start'); it.go(); rebuild(); }
}
const pauseItems = () => [
  { t: 'RESUME', go: () => setScreen('play') },
  { t: 'RESTART STAGE', go: () => { startStage(game, game.stageIndex, 0, false); onEvents(game); setScreen('play'); } },
  { t: 'TITLE', go: () => { game = null; setScreen('title'); } },
];
function buildPause() { const ul = $('pmenu'); ul.innerHTML = ''; pauseItems().forEach((it, k) => { const li = document.createElement('li'); li.className = k === menuIdx ? 'on' : ''; li.textContent = it.t; li.onclick = () => { menuIdx = k; it.go(); }; ul.appendChild(li); }); }

function startGame(stage) {
  game = createGame({ stage, hi, seed: (Date.now() & 0xffffff) >>> 0, invincible: DEBUG && Q.has('inv') });
  acc = 0;
  setScreen('play');
  banner(`STAGE ${stage + 1}`, STAGES[stage].name);
}
function banner(a, b, sec = 3) { const el = $('banner'); el.innerHTML = `${a}<small>${b || ''}</small>`; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; bannerT = sec; }

// ---------------------------------------------------------------- 起動（音の許可を取る）
async function boot(e) {
  if (screen !== 'boot') return;
  if (e && e.pointerType === 'touch') { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation.lock('landscape'); } catch {} }
  await audio.init();
  setScreen('title');
}
addEventListener('pointerdown', boot);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
  if (DEBUG && game) debugKey(e.code);
  boot();
});

// ---------------------------------------------------------------- ゲームのイベント
function onEvents(s) {
  const ev = s.events;
  audio.handle(ev);
  world.handle(ev);
  for (const e of ev) {
    if (e.t === 'stage' && game) banner(`STAGE ${e.index + 1}`, e.name);
    else if (e.t === 'boss') { $('warnname').textContent = e.name; show('warn', true); setTimeout(() => show('warn', false), 2600); }
    else if (e.t === 'clear') banner('STAGE CLEAR', STAGES[e.index].ja + ' を浄化した', 5);
    else if (e.t === 'gameover') { contT = 10; setScreen('cont'); }
    else if (e.t === 'complete') { endingT = 0; $('roll').textContent = ENDING_TEXT(s); setScreen('ending'); }
    else if (e.t === 'extend') banner('EXTEND', '', 1.5);
    else if (e.t === 'sfx' && e.id === 'death' && touch.visible) touch.vibrate(120);
  }
  ev.length = 0;
  if (s.score > hi) { hi = s.score; }
}

// ---------------------------------------------------------------- HUD
const fmt = (n) => String(Math.floor(n)).padStart(8, '0');
let hudCache = {};
function hud(s) {
  const set = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('score', fmt(s.score)); set('hi', fmt(Math.max(hi, s.score)));
  set('stname', `${s.loop > 1 ? 'LOOP ' + s.loop + ' · ' : ''}STAGE ${s.stageIndex + 1} ${s.stage.name}`);
  const lv = `${s.lives}|${s.player.speedLv}`;
  if (hudCache.lives !== lv) { hudCache.lives = lv; $('lives').innerHTML = '<i></i>'.repeat(Math.min(8, s.lives)) + `<span class="spd">SPEED ${'▸'.repeat(s.player.speedLv + 1)}</span>`; }
  const ch = Math.round(s.player.charge * 100);
  if (hudCache.beam !== ch) { hudCache.beam = ch; $('beam').style.width = ch + '%'; $('beam').parentElement.classList.toggle('full', ch >= 100); }
  const pod = s.pod;
  const eq = (pod ? `SEED ${pod.level ? '<b style="background:' + ({ C: '#4fe3ff', M: '#ff4fb4', A: '#ffb347' })[pod.color] + '">' + ({ C: 'LANCE', M: 'RICOCHET', A: 'CRAWLER' })[pod.color] + ' ' + 'Ⅰ Ⅱ Ⅲ'.split(' ')[pod.level - 1] + '</b>' : '—'} ${pod.state === 'front' ? '前' : pod.state === 'back' ? '後' : '離'}` : 'SEED なし') + (s.bits.length ? ` · SPORELET ×${s.bits.length}` : '');
  if (hudCache.eq !== eq) { hudCache.eq = eq; $('equip').innerHTML = eq; }
  const b = s.boss;
  show('bossbar', !!b && !b.dying);
  if (b) { set('bossname', BOSS[b.type].name); $('bosshp').style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%'; }
}

// ---------------------------------------------------------------- デバッグ
function debugKey(code) {
  if (code === 'KeyI') game.opts.invincible = !game.opts.invincible;
  if (code === 'KeyN') startStage(game, (game.stageIndex + 1) % STAGES.length, 0, true);
  if (code === 'KeyB' && game.boss) killEnemy(game, game.boss);
  if (code === 'KeyG') { game.scrollX = game.stage.bossStop - 8; game.spawnIdx = game.stage.spawns.findIndex((x) => x.x >= game.stage.bossStop + 20); }
  if (code === 'KeyE') { for (const k of ['C', 'C', 'C', 'B', 'B', 'S']) game.items.push({ id: Math.random(), kind: k, x: game.player.x, y: game.player.y, px: game.player.x, py: game.player.y, t: 0 }); }
}

// ---------------------------------------------------------------- ループ
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, slowT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = frameClock(now); last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; autoScale(); }
  const inp = input.poll();
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) show('banner', false); }

  let s = game || demo;
  if (screen === 'title') {
    if (menuMode === 'main' && inp.pressed.back) { /* なし */ }
    if (menuMode === 'opt' && inp.pressed.back) { menuMode = 'main'; menuIdx = 2; buildMenu(); }
    menuNav(inp, menuItems(), buildMenu);
  } else if (screen === 'play') {
    if (inp.pressed.pause) { setScreen('pause'); menuIdx = 0; buildPause(); audio.sfx('pause'); }
    else {
      acc += dt;
      let n = 0;
      while (acc >= DT && n++ < 8) { step(game, inp); acc -= DT; onEvents(game); }
      if (acc > DT * 8) acc = 0;
    }
  } else if (screen === 'pause') {
    if (inp.pressed.pause) setScreen('play');
    else menuNav(inp, pauseItems(), buildPause);
  } else if (screen === 'cont') {
    contT -= dt; $('count').textContent = Math.max(0, Math.ceil(contT - 1));
    if (inp.pressed.fire || inp.pressed.start || inp.touchTap) { continueGame(game); onEvents(game); setScreen('play'); acc = 0; }
    else if (contT <= 1) { LS.set('hi', hi); game = null; setScreen('title'); }
    acc += dt; while (acc >= DT) { step(game || demo, {}); acc -= DT; if (game) onEvents(game); }
  } else if (screen === 'ending') {
    endingT += dt;
    acc += dt; while (acc >= DT) { step(game, {}); acc -= DT; game.events.length = 0; }
    if (endingT > 6 && (inp.pressed.fire || inp.pressed.start || inp.touchTap)) { LS.set('hi', hi); nextLoop(game); onEvents(game); setScreen('play'); }
    if (endingT > 40) { LS.set('hi', hi); game = null; setScreen('title'); }
  }
  if (!game) {
    s = demo; acc += screen === 'play' ? 0 : dt;
    while (acc >= DT) { step(demo, {}); acc -= DT; demo.events.length = 0; }
    if (demo.scrollX > demo.stage.bossStop - 2) demo = newDemo();
  }
  if (game && game.score >= hi) LS.set('hi', game.score);

  renderer.info.reset();
  const alpha = Math.max(0, Math.min(1, acc / DT));
  world.sync(s, alpha, dt);
  // カメラ: わずかに自機の高さを追い、揺れを足す
  const py = s.player && s.player.alive ? s.player.y : FIELD_H / 2;
  const sh = s.shake || 0;
  // カメラ: 自機の高さを遅れて追う（減衰）。揺れは乱数ではなく周期の違う正弦の和（高リフレッシュでも震えに見えない）
  camT += dt;
  camY = FIELD_H / 2 + ((camY - FIELD_H / 2) - (py - FIELD_H / 2) * 0.05) * Math.exp(-3 * dt) + (py - FIELD_H / 2) * 0.05;
  const shx = sh * 0.5 * (Math.sin(camT * 47) + 0.6 * Math.sin(camT * 29 + 1.3)), shy = sh * 0.5 * (Math.sin(camT * 41 + 2.1) + 0.6 * Math.sin(camT * 33));
  camera.position.set(FIELD_W / 2 + shx, camY + shy, CAM_Z);
  camera.lookAt(FIELD_W / 2 + shx * 0.3, FIELD_H / 2 + (camY - FIELD_H / 2) * 0.6, 0);
  renderer.toneMappingExposure = 1.05 + (s.flash || 0) * 0.04;
  if (opts.bloom) composer.render(); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  touch.update(screen === 'play', game ? game.player.charge : 0);
  document.body.classList.toggle('touching', touch.visible);
  if (game && (screen === 'play' || screen === 'pause' || screen === 'cont')) hud(game);
  if (DEBUG || opts.fps) {
    show('debug', true);
    const i = renderer.info.render;
    $('debug').textContent = `FPS ${fps.toFixed(0)}  scale ${(renderer.getPixelRatio()).toFixed(2)}  ${renderer.domElement.width}×${renderer.domElement.height}\ncalls ${i.calls} tris ${(i.triangles / 1000).toFixed(0)}k` +
      (game ? `\nscroll ${game.scrollX.toFixed(1)} enemies ${game.enemies.length} bullets ${game.ebullets.length} shots ${game.shots.length}\n${game.opts.invincible ? 'INVINCIBLE ' : ''}[I]無敵 [N]次の面 [G]ボス前へ [B]ボス撃破 [E]装備` : '') + `\naudio ${audio.mode || '-'}  pad ${input.padName ? input.padName.slice(0, 40) : '-'}`;
  }
}
// 重いときだけ描画解像度を下げる（AUTO のとき）
function autoScale() {
  if (opts.scale !== 'auto') return;
  if (fps < 50) slowT++; else slowT = Math.max(0, slowT - 1);
  if (slowT >= 2 && scale > 0.55) { scale = Math.max(0.55, scale * 0.85); slowT = 0; setupComposer(); }
}

setScreen('boot');
requestAnimationFrame(frame);
window.__vb = { get game() { return game; }, world, renderer, audio };
