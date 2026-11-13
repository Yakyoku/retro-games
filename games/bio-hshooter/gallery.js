// 設定資料ギャラリー: すべてのモデルを、ゲームと同じ材質・同じ動きで回して見る
import * as THREE from 'three';
import { createGame, spawnEnemy } from './shared/game-core.js';
import { ENEMY } from './shared/enemies.js';
import { BOSS } from './shared/bosses.js';
import { buildPlayer, buildPod, buildBit, buildEnemy } from './shared/render/models.js';
import { materials, makeEnvironment, U } from './shared/render/materials.js';
import { LORE, STAGE_LORE } from './shared/lore.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070c);
const env = makeEnvironment(renderer);
for (const m of Object.values(materials())) if (m.isMeshStandardMaterial) m.envMap = env;
scene.add(new THREE.HemisphereLight(0x3a5878, 0x120814, 1.0));
const key = new THREE.DirectionalLight(0xcfe6ff, 2.8); key.position.set(-6, 10, 12); scene.add(key);
const rim = new THREE.DirectionalLight(0xff60c0, 1.2); rim.position.set(8, -4, -10); scene.add(rim);
const under = new THREE.DirectionalLight(0x7dff4a, 1.0); under.position.set(3, -10, 6); scene.add(under);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
const pivot = new THREE.Group(); scene.add(pivot);
const grid = new THREE.GridHelper(40, 40, 0x1a2a3a, 0x0c141c); grid.position.y = -4; scene.add(grid);

const game = createGame({ invincible: true });
game.player.x = -30; game.player.y = 9;
const entries = [
  ['自機・装備', [['player', 'SABLE WREN'], ['pod', 'SEED'], ['bit', 'SPORELET']]],
  ['敵', Object.keys(ENEMY).map((k) => [k, ENEMY[k].name])],
  ['ボス', Object.keys(BOSS).map((k) => [k, BOSS[k].name])],
];
let cur = null, model = null, ent = null, dist = 8;
const nav = document.getElementById('nav');
for (const [cat, list] of entries) {
  const h = document.createElement('h3'); h.textContent = cat; nav.appendChild(h);
  for (const [id, name] of list) {
    const b = document.createElement('button'); b.dataset.id = id;
    b.innerHTML = `${name}<small>${(LORE[id] || {}).ja || ''}</small>`;
    b.onclick = () => select(id); nav.appendChild(b);
  }
}
function select(id) {
  cur = id;
  for (const b of nav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === id);
  if (model) pivot.remove(model.obj);
  ent = null;
  if (id === 'player') { model = buildPlayer(); ent = game.player; ent.charge = 0; dist = 5; }
  else if (id === 'pod') { model = buildPod(); ent = { level: 2, color: 'C', state: 'front', t: 0 }; dist = 4.5; }
  else if (id === 'bit') { model = buildBit(); ent = { side: 1 }; dist = 3; }
  else {
    const isBoss = !!BOSS[id];
    game.enemies = []; game.boss = null; game.stage = game.stage;
    ent = spawnEnemy(game, { type: id, x: 0, sx: 20, y: 9, drop: 'C', on: null }, 0, { x: 20, y: 9 });
    for (let k = 0; k < 200; k++) { (isBoss ? BOSS : ENEMY)[id].update(ent, game); ent.t++; }
    model = buildEnemy(ent);
    dist = isBoss ? 16 : Math.max(4, ent.r * 6 + (ent.parts ? 8 : 0));
  }
  pivot.add(model.obj);
  const L = LORE[id] || {}, def = ENEMY[id] || BOSS[id];
  const name = L.name || (def && def.name) || id;
  document.getElementById('info').innerHTML = `<div class="en">${L.cat || (BOSS[id] ? 'BOSS' : 'ENEMY')}</div><h2>${name}</h2><div>${L.ja || ''}</div>` +
    (def ? `<div class="stat"><span>耐久 ${def.hp}</span><span>得点 ${def.score}</span><span>当たり半径 ${def.r}u</span></div>` : '<div class="stat"></div>') +
    `<p>${L.text || ''}</p>` +
    (id === 'pod' ? `<p>${LORE.laserC.name}: ${LORE.laserC.text}<br>${LORE.laserM.name}: ${LORE.laserM.text}<br>${LORE.laserA.name}: ${LORE.laserA.text}</p>` : '') +
    (id === 'player' ? `<p>${LORE.burst.name}: ${LORE.burst.text}</p>` : '') +
    `<div class="stages">${STAGE_LORE.join('<br>')}</div><p style="margin-top:20px"><a href="./">← 入口へ</a></p>`;
  location.hash = id;
}
let rotY = -0.5, rotX = 0.15, drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, rotY, rotX]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (drag) { rotY = drag[2] + (e.clientX - drag[0]) * 0.01; rotX = Math.max(-1.2, Math.min(1.2, drag[3] + (e.clientY - drag[1]) * 0.01)); } });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { dist *= e.deltaY > 0 ? 1.1 : 0.9; e.preventDefault(); }, { passive: false });
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
let t0 = performance.now(), lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio())) resize();
  const t = (now - t0) / 1000; U.time.value = t; const dt = Math.min(0.1, Math.max(1e-3, t - lastT)); lastT = t;
  if (!drag) rotY += 0.004;
  pivot.rotation.set(rotX, rotY, 0);
  camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
  if (model && ent) {
    if (ENEMY[cur] || BOSS[cur]) { ent.t++; (BOSS[cur] || ENEMY[cur]).update(ent, game); game.ebullets.length = 0; game.enemies = game.enemies.filter((x) => x === ent); if (ent.inv) ent.inv = 0; }
    if (cur === 'player') { ent.tilt = Math.sin(t) * 0.8; ent.alive = true; ent.inv = 0; ent.charge = (Math.sin(t * 0.7) * 0.5 + 0.5); }
    // 自機と SEED は上下に動いているつもりで傾きを見せる
    const ctx = { vx: Math.cos(t * 0.9) * 6, vy: Math.sin(t * 1.3) * 9, hit: 0 };
    model.anim(ent, t, 1, dt, ctx);
  }
  renderer.render(scene, camera);
}
select(location.hash.slice(1) || 'player');
requestAnimationFrame(frame);
window.__gallery = { select };
