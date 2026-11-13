// Sky Climber VR — キャラクター設定資料（回して見る・姿勢と表情を切り替える）。?model=&pose=&yaw=&zoom= で直接指定できる
import * as THREE from 'three';
import { makeMaterials, ClimberModel, ResidentModel, BirdModel, HelicopterModel, FirstPersonHands, loadCharacterModels } from './render/characters.js';
const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1c3a66);
const pm = new THREE.PMREMGenerator(r); const env = new THREE.Scene(); env.background = new THREE.Color(0x8fb8e8); env.add(new THREE.HemisphereLight(0xffffff, 0x445566, 3)); scene.environment = pm.fromScene(env, 0.04).texture;
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a3020, 1.2));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(-2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fd4ff, 1.5); rim.position.set(2, 2, -3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x24364f, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
await loadCharacterModels();
const M = makeMaterials();
const models = { climber: '主人公 ソラ', oyaji: '住人 おやじ', obachan: '住人 おばちゃん', bird: 'カモメ', heli: 'ヘリとパイロット', hands: '手袋（VR の手）' };
const poses = { climb: '登る', reach: '伸ばす', strain: '片手で耐える', hit: '驚く', fall: '落ちる', joy: '喜ぶ', stand: '立つ' };
let cur = q.get('model') || 'climber', pose = q.get('pose') || 'climb', obj = null, yaw = +(q.get('yaw') ?? 0.6), pitch = 0.1, zoom = +(q.get('zoom') ?? 1), t = 0;
function build() {
  if (obj) scene.remove(obj.group);
  obj = cur === 'climber' ? new ClimberModel(M) : cur === 'oyaji' ? new ResidentModel(M, 'oyaji') : cur === 'obachan' ? new ResidentModel(M, 'obachan') : cur === 'bird' ? new BirdModel(M) : cur === 'hands' ? new FirstPersonHands(M) : new HelicopterModel(M);
  obj.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  if (cur === 'bird') obj.group.position.y = 1.0; if (cur === 'heli') obj.group.position.y = 1.0; if (cur === 'oyaji' || cur === 'obachan') obj.group.position.y = 0.9;
  scene.add(obj.group); ui();
}
function ui() {
  document.getElementById('models').innerHTML = Object.entries(models).map(([k, v]) => `<button data-m="${k}" class="${k === cur ? 'sel' : ''}">${v}</button>`).join(' ');
  document.getElementById('poses').innerHTML = cur === 'climber' ? Object.entries(poses).map(([k, v]) => `<button data-p="${k}" class="${k === pose ? 'sel' : ''}">${v}</button>`).join(' ') : cur.startsWith('o') ? ['idle', 'lean', 'throw', 'close', 'angry'].map((k) => `<button data-p="${k}" class="${k === pose ? 'sel' : ''}">${k}</button>`).join(' ') : '';
  document.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { cur = b.dataset.m; pose = cur === 'climber' ? 'climb' : 'lean'; build(); }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { pose = b.dataset.p; obj.first = true; ui(); }));
}
// 主人公の姿勢: 壁の前（z=0）で、保持点にかけた手を動かす
function climberState(dt) {
  const s = Math.sin(t * 1.2);
  const body = { x: 0, y: 1.45 };
  const hands = { L: { x: -0.25, y: 2.0, z: 0.08, held: true, curl: 0.92 }, R: { x: 0.25, y: 2.0, z: 0.08, held: true, curl: 0.92 } };
  let expr = 'calm', mode = 'climb', look = new THREE.Vector3(0, 2.6, -0.5);
  if (pose === 'climb') { hands.L.y = 1.95 + s * 0.25; hands.R.y = 1.95 - s * 0.25; body.y = 1.45 + 0.05 * Math.sin(t * 2.4); }
  if (pose === 'reach') { hands.R = { x: 0.35, y: 2.25 + s * 0.05, z: 0.12, held: false, reach: true, curl: 0.05 }; expr = 'reach'; look = new THREE.Vector3(0.4, 2.5, 0); }
  if (pose === 'strain') { hands.R = { x: 0.2, y: 1.2, z: 0.25, held: false, curl: 0.3 }; hands.L.x = -0.05; hands.L.y = 2.05; body.x = 0.05; expr = 'strain'; }
  if (pose === 'hit') { expr = 'surprise'; look = cam.position.clone(); if ((t % 2) < dt * 1.5) obj.impulse('hit', 'R'); }
  if (pose === 'fall') { mode = 'fall'; expr = 'fall'; body.y = 1.6; hands.L.held = hands.R.held = false; look = cam.position.clone(); }
  if (pose === 'joy') { mode = 'joy'; expr = 'joy'; body.y = 1.45; look = cam.position.clone(); }
  if (pose === 'stand') { body.y = 1.45; hands.L = { x: -0.32, y: 0.95, z: 0.38, held: false, curl: 0.35 }; hands.R = { x: 0.32, y: 0.95, z: 0.38, held: false, curl: 0.35 }; look = cam.position.clone(); expr = 'calm'; }
  const feet = pose === 'stand' || pose === 'joy' ? { L: { x: -0.12, y: 0.0 }, R: { x: 0.12, y: 0.0 } } : { L: { x: -0.15, y: 0.72 }, R: { x: 0.18, y: 0.45 } };
  return { body, hands, expr, look, mode, feet, floorY: 0, wind: 1 };
}
let drag = null;
addEventListener('pointerdown', (e) => { if (e.target.tagName === 'CANVAS') drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', (e) => { if (!drag) return; yaw -= (e.clientX - drag.x) * 0.008; pitch = Math.max(-0.4, Math.min(0.8, pitch + (e.clientY - drag.y) * 0.005)); drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => (drag = null));
addEventListener('wheel', (e) => { zoom = Math.max(0.25, Math.min(2.5, zoom * (e.deltaY > 0 ? 1.1 : 0.9))); });
build();
let last = performance.now();
r.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  const w = innerWidth, h = innerHeight; r.setSize(w, h, false); cam.aspect = w / h;
  if (cur === 'climber') obj.update(dt, climberState(dt)); else if (cur === 'oyaji' || cur === 'obachan') obj.update(dt, pose, (Math.sin(t) + 1) / 2); else if (cur === 'hands') { const c = (Math.sin(t * 1.5) + 1) / 2; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0, 0)); obj.set('L', new THREE.Vector3(-0.12, 1.4, 0), q, c, null, dt); obj.set('R', new THREE.Vector3(0.12, 1.4, 0), q, 1 - c, null, dt); }
  else obj.update(dt, 1);
  const tgt = cur === 'climber' ? new THREE.Vector3(0, 1.25, 0.3) : cur === 'heli' ? new THREE.Vector3(0, 1, 0) : cur === 'hands' ? new THREE.Vector3(0, 1.42, 0) : cur === 'bird' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1.4, 0);
  const dist = (cur === 'climber' ? 3.4 : cur === 'heli' ? 9 : cur === 'hands' ? 0.9 : cur === 'bird' ? 2.2 : 1.9) * zoom;
  if (q.has('focus') && cur === 'climber') tgt.set(0, 1.62, 0.2);
  cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(tgt); cam.updateProjectionMatrix();
  r.render(scene, cam);
});
window.__gal = { set: (m, p) => { cur = m; pose = p; build(); }, get obj() { return obj; } };
