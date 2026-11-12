// 3D モデル（外部ファイルなし。2D 版の横顔を押し出し、球・円柱・箱を組み合わせて計算で作る）
// 向き: +x が前（右）、y が上、z が手前（three の座標）。単位はゲームの 1u。
import * as THREE from 'three';
import { extrude, ModelBuilder } from './kit.js';

const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r0, r1, h, n = 14) => new THREE.CylinderGeometry(r0, r1, h, n);
const PI = Math.PI;

// 自機: 鋭い機首・後退翼・垂直尾翼・腹びれ・2 基の噴射口。白銀に青、赤い線、水色の操縦席
function ship() {
  const m = new ModelBuilder();
  m.body(extrude([[1.02, 0.0], [0.55, 0.11], [0.0, 0.2], [-0.7, 0.22], [-0.9, 0.18], [-0.9, -0.18], [-0.7, -0.2], [0.0, -0.17], [0.55, -0.08]], 0.34, 0.04), '#e4e8f0');
  // 主翼（水平・左右）
  for (const s of [1, -1]) {
    m.body(extrude([[0.3, 0], [-0.45, 0.95 * s], [-0.82, 0.95 * s], [-0.66, 0]], 0.05, 0.015), '#c8d0de', [0, -0.07, 0], [PI / 2, 0, 0]);
    m.body(B(0.32, 0.03, 0.22), '#2f6bff', [-0.5, -0.03, 0.6 * s], [0, -0.35 * s, 0]);
    m.body(B(0.25, 0.02, 0.04), '#e8402a', [-0.62, -0.03, 0.9 * s]);
  }
  m.body(extrude([[0.25, -0.1], [-0.55, -0.55], [-0.82, -0.55], [-0.62, -0.12]], 0.05, 0.015), '#7a8498');   // 腹びれ
  m.body(extrude([[-0.2, 0.12], [-0.6, 0.55], [-0.84, 0.55], [-0.7, 0.12]], 0.06, 0.015), '#b8c2d4');     // 尾翼
  m.body(B(1.1, 0.04, 0.37), '#e8402a', [0.0, -0.06, 0]);                                                   // 赤い線
  for (const z of [0.13, -0.13]) { m.body(C(0.1, 0.11, 0.34), '#30384a', [-0.82, 0, z], [0, 0, PI / 2]); m.glow(C(0.07, 0.07, 0.02), '#9fd8ff', [-1.0, 0, z], [0, 0, PI / 2]); }
  m.body(S(1, 18, 10), '#38c8ff', [0.22, 0.12, 0], [0, 0, -0.08], [0.3, 0.09, 0.12]);                       // 操縦席
  m.glow(S(1, 10, 6), '#d8fbff', [0.27, 0.17, 0.0], [0, 0, -0.1], [0.12, 0.02, 0.06]);
  return m.build();
}
// 小型編隊機: 前に突き出た二本の爪と丸い胴（-x が前）
function dart(red) {
  const m = new ModelBuilder();
  const body = red ? '#e8402a' : '#4aa8c8', dark = red ? '#6a1008' : '#163a4c';
  m.body(extrude([[-0.55, 0.18], [0.05, 0.44], [0.35, 0.2], [0.35, -0.2], [0.05, -0.44], [-0.55, -0.18], [-0.1, 0]], 0.3, 0.03), dark);
  m.body(extrude([[-0.45, 0.14], [0.05, 0.36], [0.28, 0.16], [0.28, -0.16], [0.05, -0.36], [-0.45, -0.14], [-0.05, 0]], 0.42, 0.03), body);
  m.glow(S(0.13, 10, 8), '#ffe24a', [0.12, 0, 0]);
  m.body(S(0.24, 12, 8), body, [0.15, 0, 0], [0, 0, 0], [1, 0.8, 1.2]);
  return m.build();
}
function wheel(red) {
  const m = new ModelBuilder();
  m.body(new THREE.TorusGeometry(0.5, 0.11, 8, 20), red ? '#d83a20' : '#8a96b4');
  for (let i = 0; i < 4; i++) m.body(B(0.9, 0.08, 0.08), '#cfd8ee', [0, 0, 0], [0, 0, i * PI / 4]);
  m.glow(S(0.15, 10, 8), '#ff5a3a');
  m.body(C(0.42, 0.42, 0.06, 20), '#20263a', [0, 0, 0], [PI / 2, 0, 0]);
  return m.build();
}
function turretBase(dark = '#3a4252') {
  const m = new ModelBuilder();
  m.body(B(1.4, 0.45, 1.2), dark, [0, -0.33, 0]);
  m.body(new THREE.SphereGeometry(0.55, 16, 8, 0, PI * 2, 0, PI / 2), '#6a7488', [0, -0.1, 0]);
  m.glow(S(0.13, 8, 6), '#ff4a2a', [0, 0.12, 0.45]);
  return m.build();
}
function barrel(len = 0.95, r = 0.1, col = '#aab4c8') {
  const m = new ModelBuilder();
  m.body(C(r, r * 1.2, len, 10), col, [len / 2, 0, 0], [0, 0, -PI / 2]);
  m.body(C(r * 1.4, r * 1.4, 0.12, 10), '#2a3040', [len - 0.04, 0, 0], [0, 0, -PI / 2]);
  return m.build();
}
function walkerBody() {
  const m = new ModelBuilder();
  m.body(S(1, 16, 10), '#c8962a', [0, 0.12, 0], [0, 0, 0], [0.55, 0.36, 0.42]);
  m.body(B(0.35, 0.1, 0.5), '#2a1e0a', [-0.45, 0.02, 0]);
  m.glow(S(0.1, 8, 6), '#ff3a2a', [-0.32, 0.2, 0.3]);
  return m.build();
}
function hatchBody(flesh) {
  const m = new ModelBuilder();
  m.body(extrude([[-1.2, -0.7], [1.2, -0.7], [0.95, 0.35], [-0.95, 0.35]], 1.6, 0.05), flesh ? '#8a2a40' : '#5a6478');
  m.body(B(1.4, 0.1, 1.2), flesh ? '#4a0a1a' : '#1a1e2a', [0, 0.38, 0]);
  return m.build();
}
function heavy(red) {
  const m = new ModelBuilder();
  m.body(extrude([[-1.5, 0], [-0.6, 0.85], [1.2, 0.95], [1.5, 0.3], [1.5, -0.3], [1.2, -0.95], [-0.6, -0.85]], 1.0, 0.06), '#20283a');
  m.body(extrude([[-1.3, 0], [-0.5, 0.7], [1.1, 0.78], [1.3, 0.25], [1.3, -0.25], [1.1, -0.78], [-0.5, -0.7]], 1.3, 0.05), red ? '#c8402a' : '#6a7a9c');
  m.body(C(0.12, 0.14, 0.7, 10), '#2a3346', [-1.5, 0, 0], [0, 0, PI / 2]);
  for (const y of [0.47, -0.47]) m.body(C(0.07, 0.08, 0.5, 8), '#2a3346', [-1.25, y, 0], [0, 0, PI / 2]);
  m.glow(S(0.22, 12, 8), '#ff5028', [-0.2, 0, 0.62]);
  m.glow(B(0.18, 1.0, 0.8), '#78c8ff', [1.4, 0, 0]);
  return m.build();
}
function drone() {
  const m = new ModelBuilder();
  m.body(new THREE.OctahedronGeometry(0.42), '#b85adc', [0, 0, 0], [0, 0, 0], [1.1, 0.75, 0.75]);
  m.glow(S(0.1, 8, 6), '#ffffff', [0.12, 0, 0.25]);
  return m.build();
}
function rock(seed, stone) {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + 0.3 * Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453 % 1);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const m = new ModelBuilder();
  m.body(g, stone ? '#8a8270' : '#4a3028');
  if (!stone) m.glow(B(0.9, 0.06, 0.06), '#ff8a2a', [0, 0.1, 0.8], [0, 0, 0.5]);
  return m.build();
}
function capsule() {
  const m = new ModelBuilder();
  m.body(new THREE.CapsuleGeometry(0.34, 0.56, 6, 14), '#ff4a1a', [0, 0, 0], [0, 0, PI / 2]);
  m.body(C(0.37, 0.37, 0.2, 18), '#2a4cff', [0, 0, 0], [0, 0, PI / 2]);
  m.glow(S(1, 10, 6), '#fff2e0', [-0.15, 0.18, 0.2], [0, 0, 0], [0.22, 0.06, 0.08]);
  m.addv(S(1.05, 14, 10), '#802010');
  return m.build();
}
function stonehead() {
  const m = new ModelBuilder();
  m.body(extrude([[1.6, -1.9], [1.7, 2.3], [-0.6, 2.4], [-1.1, 1.8], [-1.2, 0.9], [-1.75, 0.2], [-1.4, -0.1], [-1.35, -0.2], [-0.6, -0.1], [-0.6, -0.5], [1.6, -0.6]], 2.6, 0.12), '#8c8898');
  m.body(extrude([[-1.05, 1.2], [0.1, 1.45], [0.2, 1.15], [-0.95, 0.95]], 2.8, 0.03), '#3a3846');
  m.glow(S(1, 10, 6), '#ff78d2', [-0.4, 0.95, 1.3], [0, 0, 0], [0.22, 0.08, 0.06]);
  m.body(B(0.12, 3.6, 2.7), '#6a6676', [0.45, 0.2, 0]);
  return m.build();
}
function stonejaw() {
  const m = new ModelBuilder();
  m.body(extrude([[-1.45, 0], [-0.6, 0], [-0.55, -0.5], [1.5, -0.5], [1.5, 0.1], [-0.6, 0.1]], 2.5, 0.06), '#7c7888');
  return m.build();
}

// ---- ボスの本体 ----
function ignisHull() {
  const m = new ModelBuilder();
  for (const s of [1, -1]) {
    m.body(extrude([[-1.6, s * 0.9], [-0.6, s * 3.0], [2.6, s * 4.4], [3.6, s * 3.2], [3.4, s * 1.0], [2.0, s * 0.4]].map(([x, y]) => [x, y]), 2.6, 0.08), '#5a6480');
    m.body(extrude([[-1.4, s * 1.0], [-0.5, s * 2.8], [2.5, s * 4.1], [3.3, s * 3.1], [3.1, s * 1.1], [1.9, s * 0.55]], 3.1, 0.06), '#b8c2d8');
    m.body(extrude([[-0.4, s * 2.4], [2.2, s * 3.6], [2.4, s * 3.2], [-0.2, s * 2.1]], 3.2, 0.02), '#e8402a');
  }
  m.body(B(3.2, 1.9, 2.4), '#3a4458', [1.0, 0, 0]);
  m.glow(B(0.4, 1.4, 1.8), '#5aa0ff', [3.2, 0, 0]);
  return m.build();
}
function wardenPillar() {
  const m = new ModelBuilder();
  m.body(B(2.6, 14, 4.2), '#8a8064', [2.7, 0, 0]);
  for (let y = -6; y < 7; y += 1.4) m.body(B(2.7, 0.08, 4.3), '#3a3428', [2.7, y, 0]);
  m.body(S(1, 18, 12), '#100a06', [0.2, 0, 0], [0, 0, 0], [1.4, 1.5, 1.6]);
  return m.build();
}
function wardenJaw(s) {
  const m = new ModelBuilder();
  m.body(extrude([[-2.1, 0], [-0.4, s * 0.3], [1.8, s * 1.6], [1.8, s * 3.6], [-0.8, s * 2.4]], 3.4, 0.08), '#a89c7a');
  for (let k = 0; k < 4; k++) m.body(extrude([[-1.7 + k * 0.5, s * 0.2], [-1.45 + k * 0.5, -s * 0.35], [-1.2 + k * 0.5, s * 0.28]], 2.6, 0.02), '#e8dcae');
  return m.build();
}
function colossusHead() {
  const m = new ModelBuilder();
  m.body(extrude([[5.4, 4.8], [5.4, -4.8], [1.6, -5.0], [-0.3, -4.2], [-1.2, -3.1], [-0.6, -2.0], [-0.6, -0.6], [-1.8, -0.6], [-2.5, 0.6], [-1.4, 1.35], [-1.8, 2.7], [-0.7, 4.2], [1.4, 5.2]], 6.0, 0.2), '#8c8898');
  m.body(extrude([[-1.9, 2.0], [0.6, 2.4], [0.7, 1.7], [-1.6, 1.5]], 6.2, 0.04), '#2a2834');
  for (const x of [1.2, 2.4, 3.6]) m.body(B(0.1, 9.2, 6.1), '#5a5666', [x, 0, 0]);
  return m.build();
}
function colossusJaw() {
  const m = new ModelBuilder();
  m.body(extrude([[-2.4, 0], [-0.6, 0], [-0.6, -0.6], [-0.3, -2.4], [1.6, -3.0], [3.0, -2.6], [3.0, 0.2], [-0.6, 0.2]], 5.6, 0.1), '#7c7888');
  return m.build();
}
function crusherBody() {
  const m = new ModelBuilder();
  m.body(extrude([[-0.8, 1.2], [0.4, 3.0], [3.4, 3.0], [3.6, -3.0], [0.4, -3.0], [-0.8, -1.2]], 3.0, 0.08), '#8a6a44');
  m.body(B(0.3, 5.2, 3.1), '#ffcf2a', [2.35, 0, 0]);
  m.body(B(1.8, 2.2, 2.6), '#4a3a2a', [-0.4, 0, -0.3]);
  return m.build();
}
function hydraBrain() {
  const m = new ModelBuilder();
  m.body(S(1, 24, 18), '#c84a66', [1.0, 0, 0], [0, 0, 0], [3.0, 3.6, 2.8]);
  for (const s of [1, -1]) m.body(S(1, 16, 12), '#a83a56', [1.8, s * 2.4, -0.4], [0, 0, 0], [1.7, 1.5, 1.8]);
  for (let k = 0; k < 6; k++) m.body(new THREE.TorusGeometry(2.7, 0.07, 6, 30, PI), '#7a1a30', [1.0, -2.5 + k, 0.2], [PI / 2, 0, 0], [1, 1, 0.9]);
  m.body(S(1, 16, 10), '#2a0610', [-1.45, 0, 1.2], [0, 0, 0], [1.0, 1.0, 0.6]);
  return m.build();
}
function omegaWall() {
  const m = new ModelBuilder();
  m.body(B(4.4, 15, 4.6), '#4a5670', [2.8, 0, 0]);
  for (let y = -6.6; y < 7; y += 1.1) m.body(B(4.5, 0.06, 4.7), '#bfe0ff', [2.8, y, 0]);
  for (const y of [-3.9, 0, 3.9]) m.body(C(0.5, 0.6, 0.6, 14), '#2a3346', [0.6, y, 0], [0, 0, PI / 2]);
  return m.build();
}
function zapperEmitter() {
  const m = new ModelBuilder();
  m.body(S(0.75, 14, 10), '#3a4256');
  m.body(C(0.5, 0.8, 0.4, 12), '#2a3042', [0, 0, 0]);
  return m.build();
}
function cannonBase() {
  const m = new ModelBuilder();
  m.body(S(0.9, 16, 12), '#4a5670');
  m.body(B(2.4, 0.4, 1.8), '#2a3346', [0, -0.8, 0]);
  m.glow(S(0.25, 10, 8), '#4ab0ff', [0, 0, 0.85]);
  return m.build();
}
function popper() {
  const m = new ModelBuilder();
  m.body(new THREE.SphereGeometry(0.62, 14, 8, 0, PI * 2, 0, PI / 2), '#4a8a4a');
  m.body(B(0.9, 0.14, 1.2), '#1a2a1a', [0, 0.22, 0]);
  for (const x of [-0.26, 0.26]) m.glow(B(0.2, 0.08, 0.05), '#ffde4a', [x, 0.25, 0.6]);
  return m.build();
}
function pebble() {
  const m = new ModelBuilder();
  m.body(S(0.6, 14, 10), '#9a96a8');
  for (const x of [-0.22, 0.22]) m.glow(B(0.14, 0.07, 0.05), '#ff7ad0', [x, 0.15, 0.58]);
  m.body(B(0.4, 0.08, 0.05), '#3a3846', [0, -0.25, 0.58]);
  return m.build();
}

const FACTORIES = {
  ship, dart: () => dart(false), dartRed: () => dart(true), wheel: () => wheel(false), wheelRed: () => wheel(true),
  turretBase: () => turretBase(), barrel: () => barrel(), cannonBarrel: () => barrel(1.4, 0.2, '#8898ba'), walker: walkerBody,
  hatch: () => hatchBody(false), hatchFlesh: () => hatchBody(true), heavy: () => heavy(false), heavyRed: () => heavy(true),
  drone, rock0: () => rock(1, false), rock1: () => rock(2, false), stone0: () => rock(3, true), capsule, stonehead, stonejaw,
  ignisHull, wardenPillar, wardenJawT: () => wardenJaw(1), wardenJawB: () => wardenJaw(-1), colossusHead, colossusJaw, crusherBody, hydraBrain, omegaWall,
  zapperEmitter, cannonBase, popper, pebble,
};
const cache = new Map();
export function modelGeo(name) {
  if (!cache.has(name)) cache.set(name, FACTORIES[name]());
  return cache.get(name);
}
export const MODEL_NAMES = Object.keys(FACTORIES);
