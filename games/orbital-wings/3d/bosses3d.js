// ORBITAL WINGS 3D — 7 体のボス（造形と描画）。Render3D に混ぜ込んで使う（drawBoss の this は Render3D）
// 部位の位置・開閉・予告・フェーズは shared/bosses.js の状態をそのまま使う（描いた物 = 当たる物）。
// 画面は +z 側（手前）から見るので、細部は ±z の面に載せる（VR で裏へ回っても同じに見えるよう鏡写し）。
import * as THREE from 'three';
import { VIEW_H, DEPTH } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { extrude, rbox, box, sph, hemi, cyl, cone, torus, ico, lathe, tube, displace, ModelBuilder, nozzle, PAINT, ARMOR, CHROME, DARK, RUBBER, BRONZE } from './kit.js';
import { DECAL, SP } from './materials3d.js';

const PI = Math.PI, TAU = PI * 2, HH = VIEW_H / 2;
const H = (i, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = Math.random, rr = (a, b) => a + (b - a) * Math.random();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

// =================================================================================
// 1. IGNIS CARRIER — 上下 2 つの装甲艦体でコアを挟む空母
// =================================================================================
function ignisHull() {
  const m = new ModelBuilder(0.42), A = '#b4bed4', B2 = '#5a6480', D = '#2a3142', RD = '#d8402a';
  for (const s of [1, -1]) {
    const sc = [1, s, 1];
    m.m(extrude([[-1.6, 0.9], [-0.6, 3.0], [2.6, 4.4], [3.6, 3.2], [3.4, 1.0], [2.0, 0.4]], 2.5, 0.12, 2), B2, [0, 0, 0], [0, 0, 0], sc, ARMOR);
    m.m(extrude([[-1.4, 1.02], [-0.5, 2.82], [2.5, 4.12], [3.3, 3.1], [3.1, 1.12], [1.9, 0.58]], 3.0, 0.1, 2), A, [0, 0, 0], [0, 0, 0], sc, PAINT);
    m.m(extrude([[-0.4, 2.42], [2.2, 3.62], [2.4, 3.22], [-0.2, 2.12]], 3.08, 0.03), RD, [0, 0, 0], [0, 0, 0], sc, PAINT);
    m.m(extrude([[-1.05, 1.22], [-0.5, 2.3], [0.5, 2.3], [0.9, 1.2], [0.2, 0.92]], 3.12, 0.05), '#8f9ab4', [0, 0, 0], [0, 0, 0], sc, ARMOR);        // 前部の重ね装甲
    m.m(extrude([[1.4, 1.2], [1.5, 2.6], [2.9, 3.1], [3.0, 1.3]], 3.14, 0.05), '#77829c', [0, 0, 0], [0, 0, 0], sc, ARMOR);                      // 機関部の装甲
    // 光線砲（前縁から突き出る 2 門）
    for (const [x, y] of [[-1.45, 1.3], [-0.85, 2.6]]) {
      m.m(cyl(0.3, 0.34, 0.5, 12), D, [x + 0.15, s * y, 0], [0, 0, PI / 2], 1, ARMOR);
      m.m(cyl(0.2, 0.24, 0.3, 12), '#8a93a5', [x - 0.15, s * y, 0], [0, 0, PI / 2], 1, CHROME);
      m.e(cyl(0.15, 0.15, 0.04, 12), '#ff8cd0', [x - 0.31, s * y, 0], [0, 0, PI / 2], 1, 1.8);
    }
    // 翼の付け根の砲塔の台座
    m.m(cyl(0.5, 0.6, 0.3, 12), D, [0.6, s * 3.42, 0], [0, 0, 0.42 * s], 1, ARMOR);
    // 後部の安定翼とアンテナ
    m.m(extrude([[2.0, 4.1], [3.2, 5.3], [3.7, 5.3], [3.3, 3.5]], 0.14, 0.04), B2, [0, 0, 0.7], [0, 0, 0], sc, ARMOR);
    m.m(extrude([[2.0, 4.1], [3.2, 5.3], [3.7, 5.3], [3.3, 3.5]], 0.14, 0.04), B2, [0, 0, -0.7], [0, 0, 0], sc, ARMOR);
    m.m(cyl(0.02, 0.02, 1.1, 5), '#c8ccd8', [2.7, s * 5.0, 0], [0, 0, 0], 1, CHROME);
    m.e(sph(0.05, 6, 5), '#ff3020', [2.7, s * 5.55, 0], [0, 0, 0], 1, 3);
    // 噴射口（上下に 2 基ずつ）
    for (const z of [0.7, -0.7]) nozzle(m, 3.45, s * 2.2, z, 0.42, 0.4, '#20242e', '#5aa0ff', 1);
    m.mirror((zs) => {
      // 舷側の細部: 艦橋の張り出しと窓の灯り、配管、排熱口、警告灯
      m.m(rbox(1.3, 0.5, 0.2, 0.06), D, [1.3, s * 3.0, zs * 1.52], [0, 0, s * 0.42], 1, ARMOR);
      m.m(box(1.1, 0.3, 0.03), '#0a0c12', [1.3, s * 3.0, zs * 1.63], [0, 0, s * 0.42], 1, { r: 0.4, m: 0.8, e: '#ffd890', ei: 1.5, k: 1, uv: 2.2 });
      m.m(tube([[-1.0, s * 1.3, zs * 1.52], [0.2, s * 1.0, zs * 1.6], [1.6, s * 0.9, zs * 1.6], [3.0, s * 1.3, zs * 1.5]], 0.06, 14, 6), '#8a93a5', [0, 0, 0], [0, 0, 0], 1, CHROME);
      for (let k = 0; k < 4; k++) m.m(box(0.06, 0.5, 0.04), '#06080c', [1.8 + k * 0.2, s * 2.0, zs * 1.585], [0, 0, 0], 1, RUBBER);
      m.e(sph(0.06, 6, 5), '#ff3020', [-1.1, s * 1.5, zs * 1.5], [0, 0, 0], 1, 3);
      m.d(1.5, 0.3, DECAL.bars, [0.4, s * 1.72, zs * 1.572], [0, zs > 0 ? 0 : PI, s * 0.3]);
    });
  }
  // 中央の機関部・コアの檻・装甲板のレール
  m.m(rbox(3.0, 1.7, 2.2, 0.12), '#394356', [1.1, 0, 0], [0, 0, 0], 1, ARMOR);
  for (let k = 0; k < 5; k++) m.m(rbox(0.16, 1.9, 2.4, 0.04), D, [0.2 + k * 0.5, 0, 0], [0, 0, 0], 1, ARMOR);
  for (const s of [1, -1]) {
    m.m(rbox(2.0, 0.14, 1.9, 0.04), D, [-1.3, s * 0.86, 0], [0, 0, 0], 1, ARMOR);
    m.e(box(1.8, 0.03, 0.06), '#ff8a3a', [-1.3, s * 0.78, 0.9], [0, 0, 0], 1, 1.4);
    m.e(box(1.8, 0.03, 0.06), '#ff8a3a', [-1.3, s * 0.78, -0.9], [0, 0, 0], 1, 1.4);
  }
  m.m(torus(0.95, 0.09, 20, 6), '#8a93a5', [-0.15, 0, 0], [0, PI / 2, 0], 1, CHROME);
  m.mirror((zs) => { m.m(torus(0.5, 0.07, 14, 6), '#8a93a5', [0.9, 0, zs * 1.12], [0, 0, 0], 1, CHROME); m.e(cyl(0.38, 0.38, 0.04, 14), '#5aa0ff', [0.9, 0, zs * 1.11], [PI / 2, 0, 0], 1, 1.3); });
  nozzle(m, 2.6, 0, 0, 0.6, 0.5, '#20242e', '#5aa0ff', 1);
  return m.build();
}
function ignisPlate(dmg) {
  const m = new ModelBuilder(0.7);
  m.m(rbox(0.34, 1.5, 1.6, 0.06), dmg === 2 ? '#3a3c44' : '#8a96b0', [0, 0, 0], [0, 0, dmg === 2 ? 0.12 : 0], 1, ARMOR);
  if (dmg < 2) {
    m.m(rbox(0.4, 1.1, 1.2, 0.05), dmg ? '#5f6470' : '#a8b4cc', [0, 0, 0], [0, 0, 0], 1, PAINT);
    m.m(rbox(0.42, 0.16, 1.66, 0.03), '#f2c21a', [0, 0.62, 0], [0, 0, 0], 1, PAINT); m.m(rbox(0.42, 0.16, 1.66, 0.03), '#f2c21a', [0, -0.62, 0], [0, 0, 0], 1, PAINT);
    m.mirror((s) => { m.e(box(0.1, 0.7, 0.02), dmg ? '#ff5030' : '#7ad8ff', [0, 0, s * 0.81], [0, 0, 0], 1, 1.8); });
  } else { m.m(rbox(0.3, 0.5, 1.3, 0.04), '#22242a', [0.02, -0.5, 0.1], [0.2, 0, -0.3], 1, DARK); m.e(box(0.06, 0.3, 1.0), '#ff6a20', [0, 0.1, 0], [0.1, 0, 0.12], 1, 1.4); }
  return m.build();
}
function ignisCore() {
  const m = new ModelBuilder(1);
  m.e(ico(0.46, 2), '#3ab0ff', [0, 0, 0], [0, 0, 0], 1, 1.9);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; m.m(rbox(0.16, 0.3, 0.16, 0.04), '#c8d2e6', [Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0], [0, 0, a + PI / 2], 1, CHROME); }
  return m.build();
}
function coreRing(R = 0.66, col = '#c8d2e6') {
  const m = new ModelBuilder(1);
  m.m(torus(R, 0.05, 24, 6), col, [0, 0, 0], [0, 0, 0], 1, CHROME);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; m.m(rbox(0.2, 0.14, 0.14, 0.03), '#5a6480', [Math.cos(a) * R, Math.sin(a) * R, 0], [0, 0, a + PI / 2], 1, ARMOR); }
  return m.build();
}
function ignisTurret() {   // −x 向きの連装砲塔
  const m = new ModelBuilder(1);
  m.m(sph(0.46, 14, 10), '#77829c', [0, 0, 0], [0, 0, 0], [1, 0.8, 1.1], ARMOR);
  m.mirror((s) => { m.m(cyl(0.07, 0.08, 0.8, 8), '#c8ccd8', [-0.6, 0, s * 0.16], [0, 0, PI / 2], 1, CHROME); m.m(cyl(0.1, 0.1, 0.12, 8), '#20242e', [-1.0, 0, s * 0.16], [0, 0, PI / 2], 1, DARK); });
  m.e(box(0.04, 0.08, 0.3), '#ff4a2a', [-0.42, 0.16, 0], [0, 0, 0.3], 1, 2);
  return m.build();
}

// =================================================================================
// 2. GATE WARDEN — 石の門。顎が上下に開くと目が現れる
// =================================================================================
function wardenGate() {
  const m = new ModelBuilder(0.45), S1 = '#a09474', S2 = '#857a5e', S3 = '#5c543f';
  m.s(rbox(2.4, 14, 4.0, 0.1), S3, [2.75, 0, 0]);
  // 石積み（段ごとにずらす）
  for (let r = 0; r < 10; r++) {
    const y = -6.3 + r * 1.4, off = r % 2 ? 0.5 : 0;
    for (let c = 0; c < 2; c++) m.s(rbox(1.3, 1.3, 4.24, 0.08), (r + c) % 2 ? S1 : S2, [2.1 + c * 1.3 + (off ? 0.0 : 0.02), y, 0], [0, 0, 0]);
  }
  for (const s of [1, -1]) {
    m.s(rbox(3.2, 0.7, 4.6, 0.12), S2, [2.7, s * 6.9, 0]); m.s(rbox(2.9, 0.3, 4.4, 0.08), S3, [2.7, s * 6.4, 0]);
    // 目のまわりの彫刻の帯と光る紋
    m.mirror((z) => {
      m.s(rbox(0.5, 12.4, 0.24, 0.08), S3, [1.62, 0, z * 2.14]); m.s(rbox(0.5, 12.4, 0.24, 0.08), S3, [3.85, 0, z * 2.14]);
      for (let k = 0; k < 3; k++) m.e(rbox(0.5, 0.12, 0.04, 0.02), '#58d2ff', [2.75, s * (2.6 + k * 1.4), z * 2.14], [0, 0, k % 2 ? 0.5 : -0.5], 1, 1.0);
      m.s(rbox(1.1, 1.1, 0.2, 0.08), S2, [2.75, s * 4.7, z * 2.1], [0, 0, PI / 4]);
      m.e(cyl(0.2, 0.2, 0.06, 6), '#58d2ff', [2.75, s * 4.7, z * 2.21], [PI / 2, 0, 0], 1, 1.3);
      m.s(sph(1, 10, 6), '#5d7a3c', [2.3 + s * 0.4, s * 6.5 + 0.75, z * 1.6], [0, 0, 0], [0.9, 0.12, 0.6]);
    });
  }
  // 目の座（暗い窪みと石の輪）
  m.s(sph(1, 18, 12), '#120c08', [1.45, 0, 0], [0, 0, 0], [0.45, 1.4, 1.45]);
  m.s(torus(1.5, 0.22, 20, 6), S2, [1.3, 0, 0], [0, PI / 2, 0], [1.06, 1, 1]);
  return m.build();
}
function wardenJaw(s) {
  const m = new ModelBuilder(0.45), sc = [1, s, 1];
  m.s(extrude([[-2.1, 0], [-0.4, 0.3], [1.8, 1.6], [1.8, 3.6], [-0.8, 2.4]], 3.3, 0.16, 2), '#a89c7a', [0, 0, 0], [0, 0, 0], sc);
  m.s(extrude([[-1.6, 0.7], [-0.5, 2.2], [1.6, 3.2], [1.6, 2.2], [-0.4, 0.9]], 3.5, 0.08), '#8a7f62', [0, 0, 0], [0, 0, 0], sc);
  m.m(extrude([[-2.14, -0.02], [-0.4, 0.26], [1.8, 1.56], [1.8, 1.86], [-0.44, 0.56], [-2.0, 0.3]], 3.4, 0.05), '#b08a3c', [0, 0, 0], [0, 0, 0], sc, BRONZE);   // 噛み合わせの青銅の縁
  for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) m.s(cone(0.2, 0.6, 4), '#e8dcae', [-1.75 + k * 0.5, s * (-0.1 + k * 0.07), -1.05 + j * 0.7], [s > 0 ? PI : 0, PI / 4, 0]);
  m.mirror((z) => {
    m.s(torus(0.8, 0.1, 14, 5, PI), '#6e6450', [0.4, s * 2.1, z * 1.72], [0, 0, s > 0 ? 0.6 : PI - 0.6]);
    m.s(torus(0.5, 0.08, 12, 5, PI), '#6e6450', [0.4, s * 2.1, z * 1.72], [0, 0, s > 0 ? 0.6 : PI - 0.6]);
    m.e(sph(0.14, 8, 6), '#58d2ff', [0.4, s * 2.1, z * 1.76], [0, 0, 0], 1, 1.6);
    for (let k = 0; k < 3; k++) m.s(box(0.5, 0.05, 0.04), '#2a251a', [-0.9 + k * 0.5, s * (0.75 + k * 0.32), z * 1.67], [0, 0, s * 0.55]);
  });
  return m.build();
}
function wardenGear() {
  const m = new ModelBuilder(0.8);
  m.m(cyl(0.6, 0.6, 0.22, 16), '#b08a3c', [0, 0, 0], [PI / 2, 0, 0], 1, BRONZE);
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; m.m(rbox(0.2, 0.22, 0.22, 0.03), '#8a6a28', [Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0], [0, 0, a], 1, BRONZE); }
  m.m(cyl(0.2, 0.2, 0.3, 8), '#3a3020', [0, 0, 0], [PI / 2, 0, 0], 1, DARK);
  for (let k = 0; k < 4; k++) m.m(box(0.9, 0.08, 0.26), '#8a6a28', [0, 0, 0], [0, 0, k * PI / 4], 1, BRONZE);
  return m.build();
}
function eyeball(R, sclera, iris, slit) {   // −x を向く目（虹彩・瞳孔つき）
  const m = new ModelBuilder(1);
  m.f(sph(R, 20, 14), sclera, [0, 0, 0], [0, 0, 0], 1, { r: 0.12, e: sclera, ei: 0.18 });
  m.e(cyl(R * 0.6, R * 0.6, 0.04, 20), iris, [-R * 0.82, 0, 0], [0, 0, PI / 2], 1, 1.6);
  m.e(sph(R * 0.62, 16, 10), iris, [-R * 0.5, 0, 0], [0, 0, 0], [0.62, 1, 1], 0.9);          // 角膜のふくらみ（横からも瞳の向きが分かる）
  m.m(sph(R * 0.3, 12, 8), '#020204', [-R * 0.82, 0, 0], [0, 0, 0], slit ? [0.5, 1, 0.34] : [0.5, 1, 1], { r: 0.05, m: 0.5 });
  m.e(sph(R * 0.07, 6, 5), '#ffffff', [-R * 0.93, R * 0.2, R * 0.16], [0, 0, 0], 1, 3);
  m.m(torus(R * 0.62, 0.035, 20, 5), '#0a1420', [-R * 0.5, 0, 0], [0, PI / 2, 0], 1, RUBBER);
  return m.build();
}

// =================================================================================
// 3. COLOSSUS — 巨大な石の顔。目から光線、口からリング
// =================================================================================
function colossusHead() {
  const m = new ModelBuilder(0.36), S1 = '#9692a4', S2 = '#77738a', S3 = '#4f4b62';
  m.s(extrude([[5.4, 4.8], [5.4, -4.8], [1.6, -5.0], [-0.3, -4.2], [-1.2, -3.1], [-0.6, -2.0], [-0.6, -0.6], [-1.8, -0.6], [-2.5, 0.6], [-1.4, 1.35], [-1.8, 2.7], [-0.7, 4.2], [1.4, 5.2]], 5.7, 0.36, 2), S1, [0, 0, 0]);
  m.s(extrude([[-1.92, 2.72], [-0.76, 4.3], [1.4, 5.34], [1.7, 4.5], [-0.3, 3.6], [-1.3, 2.4]], 6.1, 0.12, 2), S3, [0, 0, 0]);                 // 冠の帯
  m.m(extrude([[-1.8, 2.5], [-1.2, 2.3], [-0.2, 3.5], [1.7, 4.4], [1.75, 4.64], [-0.34, 3.74], [-1.36, 2.56]], 6.2, 0.05), '#b08a3c', [0, 0, 0], [0, 0, 0], 1, BRONZE);
  m.s(extrude([[-0.2, 4.7], [1.2, 6.3], [2.6, 5.2], [1.4, 5.1]], 0.6, 0.1), S2, [0, 0, 0]);                                                   // とさか
  m.s(extrude([[-1.95, 2.02], [0.6, 2.44], [0.72, 1.72], [-1.62, 1.5]], 6.14, 0.08), S3, [0, 0, 0]);                                           // 眉
  for (const x of [1.9, 3.1, 4.3]) m.s(rbox(0.5, 9.3, 5.9, 0.1), S2, [x, 0, 0]);
  for (const y of [-3.2, -1.2, 0.8, 2.8]) m.s(box(3.9, 0.1, 5.96), '#2a2834', [3.5, y, 0]);
  m.mirror((z) => {
    m.s(box(1.5, 0.62, 0.3), '#14121c', [-0.6, 1.3, z * 2.82]);                                                                              // 目のくぼみ
    m.e(sph(1, 14, 8), '#ff5a96', [-0.62, 1.28, z * 2.9], [0, 0, 0], [0.6, 0.22, 0.12], 1.6);
    m.s(sph(1, 10, 6), '#14121c', [-0.82, 1.28, z * 2.96], [0, 0, 0], [0.16, 0.2, 0.08]);
    m.s(extrude([[-2.56, 0.5], [-1.5, 1.3], [-1.2, 1.2], [-1.6, 0.2], [-2.2, -0.2]], 0.5, 0.12), S1, [0, 0, z * 2.6]);                          // 小鼻
    m.s(rbox(2.2, 2.4, 0.3, 0.12), S2, [0.5, -0.4, z * 2.86], [0, 0, 0.3]);                                                                   // 頬の板
    for (let k = 0; k < 4; k++) m.e(box(1.3 - k * 0.22, 0.07, 0.03), '#c86aff', [0.5, 0.3 - k * 0.42, z * 3.02], [0, 0, 0.3], 1, 0.7);
    m.s(cyl(1.25, 1.25, 0.3, 20), S3, [3.0, 0.9, z * 2.95], [PI / 2, 0, 0]);                                                                  // 耳の円盤
    m.s(torus(0.86, 0.12, 18, 6), S1, [3.0, 0.9, z * 3.12], [0, 0, 0]); m.s(torus(0.46, 0.1, 14, 6), S1, [3.0, 0.9, z * 3.12], [0, 0, 0]);
    m.e(sph(0.18, 8, 6), '#c86aff', [3.0, 0.9, z * 3.14], [0, 0, 0], 1, 1.3);
    m.m(lathe([[0.12, 0], [0.3, -0.5], [0.24, -1.1], [0.0, -1.4]], 8), '#b08a3c', [3.0, -0.5, z * 3.05], [0, 0, 0], 1, BRONZE);                   // 耳飾り
    m.s(sph(1, 10, 6), '#5d7a3c', [2.2, 5.0 - 0.1, z * 1.6], [0, 0, 0.22], [1.6, 0.14, 1.0]);                                                  // 苔
    m.s(sph(1, 10, 6), '#4d6a34', [4.4, 4.82, z * 1.2], [0, 0, 0], [1.0, 0.12, 1.2]);
    // 風化のひび
    for (const [pts] of [[[[1.2, 4.6], [1.5, 3.9], [1.2, 3.3], [1.6, 2.7]]], [[[4.9, -1.0], [4.2, -1.5], [4.4, -2.3], [3.8, -2.9]]], [[[-0.4, -2.6], [0.3, -3.0], [0.2, -3.7]]]]) {
      for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; m.s(box(Math.hypot(x1 - x0, y1 - y0) + 0.04, 0.07, 0.05), '#1c1a24', [(x0 + x1) / 2, (y0 + y1) / 2, z * 2.86], [0, 0, Math.atan2(y1 - y0, x1 - x0)]); }
    }
  });
  for (let k = 0; k < 9; k++) m.s(rbox(0.3, 0.44, 0.44, 0.05), '#d8d2c0', [-1.5 + (k % 2) * 0.06, -0.72, -2.2 + k * 0.55], [0, 0, 0.12]);       // 上の歯
  m.e(box(1.0, 1.6, 4.4), '#ff3aa0', [0.0, -1.5, 0], [0, 0, 0], 1, 0.8);                                                                      // 喉の奥
  return m.build();
}
function colossusJaw() {
  const m = new ModelBuilder(0.36);
  m.s(extrude([[-2.4, 0], [-0.6, 0], [-0.6, -0.6], [-0.3, -2.4], [1.6, -3.0], [3.0, -2.6], [3.0, 0.2], [-0.6, 0.2]], 5.9, 0.28, 2), '#827e90', [0, 0, 0]);
  m.s(extrude([[-2.46, -0.06], [-1.9, -0.7], [-0.8, -0.8], [-0.74, -0.08]], 6.06, 0.1), '#5d596e', [0, 0, 0]);                               // 下唇
  for (let k = 0; k < 8; k++) m.s(rbox(0.3, 0.4, 0.44, 0.05), '#d8d2c0', [-2.0, 0.12, -1.92 + k * 0.55], [0, 0, -0.12]);
  m.mirror((z) => {
    m.m(cyl(0.5, 0.5, 0.2, 14), '#b08a3c', [2.3, -0.5, z * 3.0], [PI / 2, 0, 0], 1, BRONZE);
    for (let k = 0; k < 4; k++) m.s(box(0.1, 1.4, 0.06), '#3a3848', [-0.1 + k * 0.5, -1.7, z * 2.97], [0, 0, 0.12]);
  });
  m.m(lathe([[0.4, 0], [0.5, -0.4], [0.2, -0.9], [0, -1.0]], 8), '#b08a3c', [0.2, -2.7, 0], [0, 0, -0.2], [1, 1, 3], BRONZE);                     // 顎飾り
  return m.build();
}
function colossusCracks(lv) {  // 損傷で現れる光るひび
  const m = new ModelBuilder(0.36);
  const sets = [[[[-1.3, 2.0], [-0.4, 2.6], [0.3, 2.3], [0.9, 3.0], [1.9, 3.2]], [[0.9, 3.0], [0.7, 3.8]], [[-0.5, -0.2], [0.4, 0.4], [1.3, 0.2], [1.9, 0.9]], [[1.3, 0.2], [1.6, -0.8], [2.4, -1.3]]],
    [[[2.4, -1.3], [3.3, -1.1], [3.9, -2.0], [4.8, -2.2]], [[1.9, 3.2], [2.9, 2.8], [3.6, 3.5], [4.6, 3.3]], [[0.4, 0.4], [0.2, 1.3]], [[1.6, -0.8], [0.9, -1.6], [1.2, -2.6]], [[2.9, 2.8], [3.2, 1.9]]]];
  m.mirror((z) => { for (const pts of sets[lv]) for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; m.e(box(Math.hypot(x1 - x0, y1 - y0) + 0.05, 0.09, 0.06), '#ff4ab0', [(x0 + x1) / 2, (y0 + y1) / 2, z * 3.04], [0, 0, Math.atan2(y1 - y0, x1 - x0)], 1, 1.7); } });
  return m.build();
}

// =================================================================================
// 4. TWIN CRUSHER — 上下の腕で挟む圧搾機。コアは上下に割れる殻の中
// =================================================================================
function crusherBody() {
  const m = new ModelBuilder(0.42), O = '#8a6a44', D = '#3d3024', Y = '#f2c21a';
  m.m(extrude([[-0.2, 1.3], [0.6, 2.9], [3.4, 2.9], [3.6, -2.9], [0.6, -2.9], [-0.2, -1.3]], 2.8, 0.12, 2), O, [0, 0, 0], [0, 0, 0], 1, ARMOR);
  m.m(rbox(0.34, 5.4, 3.0, 0.05), Y, [2.4, 0, 0], [0, 0, 0], 1, PAINT);
  m.m(rbox(1.2, 6.2, 2.4, 0.1), D, [3.3, 0, 0], [0, 0, 0], 1, ARMOR);
  for (const s of [1, -1]) {
    // コアを抱える腕木と油圧シリンダー
    m.m(extrude([[-1.5, 1.25], [-1.3, 1.7], [0.6, 2.2], [0.6, 1.3], [-0.6, 1.1]], 2.2, 0.1), D, [0, 0, 0], [0, 0, 0], [1, s, 1], ARMOR);
    m.m(cyl(0.34, 0.34, 1.5, 14), '#d0d6e2', [1.4, s * 3.3, 0.7], [0, 0, 0], 1, CHROME); m.m(cyl(0.34, 0.34, 1.5, 14), '#d0d6e2', [1.4, s * 3.3, -0.7], [0, 0, 0], 1, CHROME);
    m.m(rbox(1.4, 0.4, 2.4, 0.08), D, [1.4, s * 3.0, 0], [0, 0, 0], 1, ARMOR);
    m.m(cyl(0.22, 0.26, 1.3, 10), D, [2.8, s * 3.4, 0], [0, 0, 0], 1, DARK);                                                              // 排気筒
    m.mirror((z) => {
      m.d(2.2, 0.5, DECAL.hazard, [1.2, s * 2.45, z * 1.41], [0, z > 0 ? 0 : PI, 0]);
      m.m(rbox(1.5, 1.0, 0.16, 0.05), '#6a5236', [1.3, s * 1.3, z * 1.42], [0, 0, 0], 1, ARMOR);
      m.m(cyl(0.3, 0.3, 0.1, 14), '#d0d6e2', [1.0, s * 1.3, z * 1.5], [PI / 2, 0, 0], 1, CHROME);
      m.e(cyl(0.22, 0.22, 0.11, 12), '#ffd890', [1.0, s * 1.3, z * 1.505], [PI / 2, 0, 0], 1, 1.2);                                         // 圧力計
      m.m(box(0.04, 0.2, 0.02), '#1a1410', [1.0, s * 1.3 + 0.06, z * 1.57], [0, 0, 0.6], 1, RUBBER);
      m.m(tube([[0.4, s * 2.6, z * 1.42], [0.0, s * 1.9, z * 1.3], [-0.6, s * 1.5, z * 1.0]], 0.07, 10, 6), '#b06a2a', [0, 0, 0], [0, 0, 0], 1, { r: 0.3, m: 1 });
      for (let k = 0; k < 4; k++) m.m(box(0.5, 0.06, 0.03), '#06080c', [2.2 + (k % 2) * 0.0, s * (0.5 + k * 0.22), z * 1.41], [0, 0, 0], 1, RUBBER);
      m.e(sph(0.09, 8, 6), '#ff5028', [0.4, s * 2.75, z * 1.3], [0, 0, 0], 1, 2.6);
    });
  }
  m.m(torus(1.0, 0.12, 20, 6), '#d0d6e2', [0.1, 0, 0], [0, PI / 2, 0], 1, CHROME);
  m.m(cyl(0.5, 0.7, 0.9, 12), D, [0.4, 0, 0], [0, 0, PI / 2], 1, ARMOR);
  return m.build();
}
function crusherShell() {   // 上半分の殻（下は裏返して使う）。閉じると球になってコアを包む
  const m = new ModelBuilder(0.8);
  m.m(hemi(0.98, 18, 8), '#6a5236', [0, 0.02, 0], [0, 0, 0], 1, ARMOR);
  m.m(torus(0.98, 0.08, 18, 6), '#f2c21a', [0, 0.06, 0], [PI / 2, 0, 0], 1, PAINT);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; m.m(rbox(0.24, 0.5, 0.12, 0.03), '#3d3024', [Math.cos(a) * 0.72, 0.62, Math.sin(a) * 0.72], [Math.sin(a) * 0.7, -a, -Math.cos(a) * 0.7], 1, ARMOR); }
  m.m(cyl(0.2, 0.2, 0.5, 10), '#d0d6e2', [0.3, 1.1, 0], [0, 0, 0], 1, CHROME);
  return m.build();
}
function crusherCore() {
  const m = new ModelBuilder(1);
  m.e(ico(0.52, 2), '#ff8a3a', [0, 0, 0], [0, 0, 0], 1, 1.9);
  m.m(torus(0.62, 0.06, 18, 6), '#d0d6e2', [0, 0, 0], [PI / 2, 0, 0], 1, CHROME);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; m.m(cone(0.07, 0.2, 5), '#fff0c0', [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], [0, -a, -PI / 2], 1, CHROME); }
  return m.build();
}
function crusherSeg() {     // 腕の節（判定の球 r 1.05 の列に合わせた丸い柱。高さ 1.15）
  const m = new ModelBuilder(0.6);
  m.m(cyl(0.96, 0.96, 1.15, 16), '#b08a54', [0, 0, 0], [0, 0, 0], 1, ARMOR);
  m.m(cyl(1.05, 1.05, 0.22, 16), '#3d3024', [0, -0.45, 0], [0, 0, 0], 1, ARMOR);
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; m.m(cyl(0.1, 0.1, 1.15, 8), '#d0d6e2', [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0], [0, 0, 0], 1, CHROME); }
  return m.build();
}
function crusherHead() {    // 腕の先（−y が打撃面。上の腕用。下の腕は裏返す）
  const m = new ModelBuilder(0.6);
  m.m(cyl(1.08, 1.08, 0.5, 16), '#f2c21a', [0, 0.1, 0], [0, 0, 0], 1, PAINT);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; m.m(box(0.3, 0.52, 0.06), '#15130f', [Math.cos(a) * 1.07, 0.1, Math.sin(a) * 1.07], [0, -a + PI / 2, 0.5], 1, RUBBER); }
  m.m(new THREE.SphereGeometry(1.05, 18, 8, 0, TAU, PI / 2, PI / 2), '#6a6f7c', [0, -0.12, 0], [0, 0, 0], [1, 0.9, 1], { r: 0.34, m: 0.95 });
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; m.m(cone(0.14, 0.32, 6), '#d0d6e2', [Math.cos(a) * 0.6, -0.88, Math.sin(a) * 0.6], [PI, 0, 0], 1, CHROME); }
  return m.build();
}

// =================================================================================
// 5. HYDRA BRAIN — しわのある脳・血管・まぶたのある目・3 本の触手
// =================================================================================
function hydraBrain() {
  const m = new ModelBuilder(0.5);
  const fold = (x, y, z) => {
    const w = Math.sin(y * 7 + 2.2 * Math.sin(x * 5 + z * 3)) * Math.sin(x * 6 + 2.0 * Math.sin(z * 6 + y * 2));
    return 1 + 0.045 * w - 0.1 * Math.exp(-(z * z) / 0.012) * (x < 0.7 ? 1 : 0.3);
  };
  m.f(displace(sph(1, 44, 30), fold), '#d05a78', [1.0, 0, 0], [0, 0, 0], [3.0, 3.6, 2.8], { r: 0.3 });
  for (const s of [1, -1]) m.f(displace(sph(1, 24, 16), (x, y, z) => 1 + 0.05 * Math.sin(y * 16 + 2 * Math.sin(x * 7))), '#a83a56', [1.9, s * 2.4, -0.2], [0, 0, 0], [1.7, 1.5, 1.9], { r: 0.34 });
  m.f(lathe([[0.9, 0], [0.7, -1.0], [0.45, -2.0], [0.2, -2.6]], 10), '#8a2a44', [3.4, -0.4, 0], [0, 0, 1.0], 1, { r: 0.35 });                    // 脳幹
  // 血管（表面を這う）
  for (let k = 0; k < 9; k++) {
    const pts = [], a0 = H(k, 1) * TAU, tilt = H(k, 2) * 2 - 1;
    for (let i = 0; i <= 6; i++) {
      const t = -1.1 + i / 6 * 2.2 + (H(k * 7 + i, 3) - 0.5) * 0.2, b = a0 + i * 0.2 * tilt + (H(k * 5 + i, 4) - 0.5) * 0.25;
      const dx = Math.cos(t) * Math.cos(b), dy = Math.sin(t), dz = Math.cos(t) * Math.sin(b);
      if (dx < -0.5) continue;
      pts.push([1.0 + dx * 3.06, dy * 3.67, dz * 2.86]);
    }
    if (pts.length > 2) m.f(tube(pts, 0.07 + H(k, 6) * 0.05, 18, 5), k % 3 ? '#5a0c20' : '#3a1a5a', [0, 0, 0], [0, 0, 0], 1, { r: 0.25, e: k % 3 ? '#ff2a4a' : '#7a3aff', ei: 0.35 });
  }
  // 目の座（暗い窪みと肉の縁）
  m.f(sph(1, 16, 12), '#1a0408', [-1.25, 0, 0], [0, 0, 0], [0.8, 1.02, 1.02], { r: 0.2 });
  m.f(torus(1.04, 0.2, 20, 8), '#8a2a44', [-1.5, 0, 0], [0, PI / 2, 0], 1, { r: 0.3 });
  for (let k = 0; k < 7; k++) { const a = H(k, 9) * TAU, b = (H(k, 8) - 0.5) * 2; m.f(sph(0.16 + H(k, 7) * 0.14, 8, 6), '#e88a9a', [1.0 + Math.cos(b) * Math.cos(a) * 2.9, Math.sin(b) * 3.5, Math.abs(Math.cos(b) * Math.sin(a)) * 2.7 * (k % 2 ? 1 : -1)], [0, 0, 0], 1, { r: 0.18, e: '#ff5a7a', ei: 0.4 }); }
  return m.build();
}
function hydraLid() {       // 上まぶた（下は鏡写し）。目の中心を軸に回って開く
  const m = new ModelBuilder(0.8);
  m.f(new THREE.SphereGeometry(0.98, 14, 6, -PI / 2, PI, 0, PI / 2), '#b84a64', [0, 0, 0], [0, 0, 0], 1, { r: 0.3 });
  m.f(tube([[0, 0.02, -0.98], [-0.7, 0.02, -0.7], [-1.0, 0.02, 0], [-0.7, 0.02, 0.7], [0, 0.02, 0.98]], 0.07, 14, 5), '#6a1830', [0, 0, 0], [0, 0, 0], 1, { r: 0.3 });
  return m.build();
}
function hydraLidB() {
  const m = new ModelBuilder(0.8);
  m.f(new THREE.SphereGeometry(0.98, 14, 6, -PI / 2, PI, PI / 2, PI / 2), '#b84a64', [0, 0, 0], [0, 0, 0], 1, { r: 0.3 });
  m.f(tube([[0, -0.02, -0.98], [-0.7, -0.02, -0.7], [-1.0, -0.02, 0], [-0.7, -0.02, 0.7], [0, -0.02, 0.98]], 0.07, 14, 5), '#6a1830', [0, 0, 0], [0, 0, 0], 1, { r: 0.3 });
  return m.build();
}
function hydraTip() {       // 触手の先（−x が口。半径 0.62）
  const m = new ModelBuilder(1.2);
  m.f(displace(sph(0.6, 16, 12), (x, y, z) => 1 + 0.06 * Math.sin(y * 10) * Math.sin(z * 10 + x * 4)), '#e8607e', [0, 0, 0], [0, 0, 0], 1, { r: 0.22 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; m.f(cone(0.14, 0.6, 6), '#f0e0c8', [-0.6, Math.cos(a) * 0.3, Math.sin(a) * 0.3], [0, 0, PI / 2 + Math.cos(a) * 0.35], 1, { r: 0.3 }); }
  m.e(sph(0.2, 8, 6), '#ffb060', [-0.5, 0, 0], [0, 0, 0], 1, 1.8);
  m.mirror((s) => { m.f(sph(0.2, 10, 8), '#2a0612', [-0.1, 0.22, s * 0.46], [0, 0, 0], [1, 1, 0.6], { r: 0.1 }); m.e(sph(0.1, 8, 6), '#ffe24a', [-0.1, 0.22, s * 0.55], [0, 0, 0], [1, 1, 0.5], 2.2); });
  return m.build();
}

// =================================================================================
// 6. NUCLEUS — 膜細胞の輪に守られた核
// =================================================================================
function nucCore() {
  const m = new ModelBuilder(0.9);
  m.f(displace(sph(1.08, 28, 20), (x, y, z) => 1 + 0.045 * Math.sin(x * 9 + 2 * Math.sin(y * 7)) * Math.sin(z * 8 + y * 3)), '#ff9a3a', [0, 0, 0], [0, 0, 0], 1, { r: 0.24, e: '#ff5a10', ei: 0.55 });
  for (let k = 0; k < 6; k++) {   // 染色質のひも
    const pts = []; const a0 = H(k, 11) * TAU;
    for (let i = 0; i <= 5; i++) { const t = -1 + i * 0.4, b = a0 + i * 0.5 * (k % 2 ? 1 : -1); pts.push([Math.cos(t) * Math.cos(b) * 1.12, Math.sin(t) * 1.12, Math.cos(t) * Math.sin(b) * 1.12]); }
    m.f(tube(pts, 0.07, 16, 5), '#8a2a10', [0, 0, 0], [0, 0, 0], 1, { r: 0.3, e: '#ff3a10', ei: 0.3 });
  }
  for (let k = 0; k < 8; k++) { const u = H(k, 12) * 2 - 1, a = H(k, 13) * TAU, r = Math.sqrt(1 - u * u); m.e(sph(0.13, 8, 6), '#fff0a0', [Math.cos(a) * r * 1.08, u * 1.08, Math.sin(a) * r * 1.08], [0, 0, 0], [1, 1, 1], 1.5); m.f(torus(0.17, 0.045, 10, 5), '#c85a20', [Math.cos(a) * r * 1.1, u * 1.1, Math.sin(a) * r * 1.1], [Math.asin(-u), a + PI / 2, 0], 1); }
  return m.build();
}
function nucOrg() {         // 漂う小器官
  const m = new ModelBuilder(1.5);
  m.f(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), '#7ad8a0', [0, 0, 0], [0, 0, PI / 2], 1, { r: 0.22, e: '#30c080', ei: 0.4 });
  for (let k = 0; k < 3; k++) m.f(torus(0.165, 0.025, 10, 4), '#2a8a60', [-0.12 + k * 0.12, 0, 0], [0, PI / 2, 0], 1);
  return m.build();
}

// =================================================================================
// 7. OMEGA CORE — 要塞の壁（砲台）→ 回る障壁 → 露出した中枢
// =================================================================================
function omegaWall(phase) {
  const m = new ModelBuilder(0.4), W1 = '#56637f', W2 = '#3f4a62', D = '#232a3a', LIT = phase === 1 ? '#9ad4ff' : '#ff5a3a';
  const gone = (i, y) => (phase === 3 ? H(i, 5) < 0.42 || Math.abs(y) < 2.6 : phase === 2 ? Math.abs(y) < 2.3 && H(i, 5) < 0.75 : false);
  // 芯の構造
  if (phase < 3) m.m(rbox(3.4, 15, 4.0, 0.12), D, [3.25, 0, 0], [0, 0, 0], 1, ARMOR);
  else for (const [y, h, x, w] of [[-5.2, 4.6, 3.3, 3.3], [0.0, 5.0, 3.9, 2.2], [5.0, 5.0, 3.3, 3.3]]) m.m(rbox(w, h, 4.0, 0.14), D, [x, y, 0], [0, 0, (y ? 0.02 : -0.03)], 1, ARMOR);
  // 舷側の装甲板（±z の面。12 段 × 3 列）
  let i = 0;
  for (let r = 0; r < 12; r++) for (let c = 0; c < 3; c++) {
    const y = -6.85 + r * 1.245, x = 1.55 + c * 1.45, id = i++;
    if (gone(id, y) && c < 2) continue;
    const tilt = phase > 1 && H(id, 7) < 0.3 ? (H(id, 8) - 0.5) * 0.3 : 0, col = (r + c) % 2 ? W1 : W2, lit = H(id, 3) < 0.3;
    m.mirror((z) => {
      m.m(rbox(1.36, 1.16, 0.3, 0.06), tilt ? '#33363e' : col, [x, y, z * 2.16], [tilt, 0, tilt], 1, tilt ? DARK : ARMOR);
      if (lit && !tilt) m.m(box(1.0, 0.5, 0.03), '#0a0c12', [x, y, z * 2.32], [0, 0, 0], 1, { r: 0.4, m: 0.8, e: LIT, ei: 1.5, k: 1, uv: 2.4 });
    });
  }
  // 前面（−x）の装甲と機器
  for (let r = 0; r < 12; r++) {
    const y = -6.85 + r * 1.245;
    if (gone(100 + r, y)) continue;
    m.m(rbox(0.5, 1.16, 4.3, 0.06), r % 2 ? W1 : W2, [0.86, y, 0], [0, 0, 0], 1, ARMOR);
  }
  // 縦の配管と支柱
  m.mirror((z) => {
    for (const x of [2.25, 3.72]) m.m(cyl(0.09, 0.09, phase === 3 ? 9 : 14.6, 8), '#aab4c8', [x, phase === 3 ? -2.5 : 0, z * 2.36], [0, 0, 0], 1, CHROME);
    m.m(rbox(0.5, 15.2, 0.5, 0.08), D, [4.75, 0, z * 2.0], [0, 0, 0], 1, ARMOR);
    if (phase < 3) for (const y of [-6.2, 6.2]) m.d(2.4, 0.5, DECAL.hazard, [2.9, y, z * 2.33], [0, z > 0 ? 0 : PI, 0]);
  });
  for (const s of [1, -1]) {
    m.m(rbox(4.8, 0.5, 4.7, 0.1), W2, [2.8, s * 7.45, 0], [0, 0, 0], 1, ARMOR);
    // 光線の発振器（上下）と砲台の台座
    if (phase === 1) { m.m(cyl(0.62, 0.72, 0.5, 14), D, [0.55, s * 3.9, 0], [0, 0, PI / 2], 1, ARMOR); m.m(torus(0.5, 0.08, 16, 6), '#aab4c8', [0.3, s * 3.9, 0], [0, PI / 2, 0], 1, CHROME); m.e(cyl(0.4, 0.4, 0.05, 14), '#ffc878', [0.29, s * 3.9, 0], [0, 0, PI / 2], 1, 1.3); }
    for (const y of [2.2, 5.6]) { m.m(cyl(0.7, 0.8, 0.5, 14), D, [0.45, s * y, 0], [0, 0, PI / 2], 1, ARMOR); if (phase > 1) m.e(cyl(0.3, 0.3, 0.52, 8), '#ff5a20', [0.44, s * y, 0], [0, 0, PI / 2], 1, 0.9); }
  }
  // コアの座
  m.m(torus(1.3, 0.16, 24, 6), '#aab4c8', [0.75, 0, 0], [0, PI / 2, 0], 1, CHROME);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; m.m(rbox(0.5, 0.36, 0.3, 0.05), D, [0.72, Math.cos(a) * 1.42, Math.sin(a) * 1.42], [a, 0, 0], 1, ARMOR); }
  if (phase >= 2) {
    // 剥き出しの内部: 導管と赤い非常灯、溶けた縁
    m.mirror((z) => {
      for (let k = 0; k < 5; k++) m.m(tube([[1.2 + k * 0.6, -2.4, z * 2.0], [1.4 + k * 0.6, -0.8 + H(k, 21), z * 2.14], [1.2 + k * 0.6, 0.9, z * 2.06], [1.5 + k * 0.6, 2.4, z * 2.0]], 0.07, 12, 5), k % 2 ? '#b06a2a' : '#6a7488', [0, 0, 0], [0, 0, 0], 1, CHROME);
      for (let k = 0; k < 4; k++) m.e(box(0.9, 0.06, 0.04), '#ff3a20', [1.7 + (k % 2) * 1.4, -1.8 + k * 1.2, z * 2.06], [0, 0, 0], 1, 1.6);
    });
  }
  if (phase === 3) {
    m.mirror((z) => {
      for (let k = 0; k < 7; k++) m.e(box(0.5 + H(k, 31) * 0.8, 0.1, 0.1), '#ff7a20', [1.4 + H(k, 32) * 3.0, -2.6 + H(k, 33) * 5.2, z * (1.5 + H(k, 34) * 0.6)], [0, 0, H(k, 35) * 3], 1, 1.8);
      for (let k = 0; k < 4; k++) m.m(tube([[1.6 + k * 0.8, 2.4, z * 1.9], [1.5 + k * 0.8, 1.4, z * 2.2], [1.9 + k * 0.8, 0.6 - H(k, 41), z * 2.1]], 0.05, 8, 4), '#1a1c22', [0, 0, 0], [0, 0, 0], 1, RUBBER);
    });
  }
  return m.build();
}
function omegaGun(dead) {   // −x 向きの砲台（r 0.85）
  const m = new ModelBuilder(0.9);
  if (dead) {
    m.m(hemi(0.7, 12, 6), '#2a2c32', [0.2, 0, 0], [0, 0, PI / 2], [1, 1, 1], DARK);
    m.m(cyl(0.12, 0.14, 0.6, 8), '#33363e', [-0.3, -0.2, 0.1], [0.3, 0, PI / 2 + 0.6], 1, DARK);
    m.e(ico(0.3, 0), '#ff6a20', [0, 0, 0], [0, 0, 0], 1, 1.4);
    return m.build();
  }
  m.m(sph(0.8, 18, 12), '#8898ba', [0, 0, 0], [0, 0, 0], 1, ARMOR);
  m.m(torus(0.8, 0.07, 18, 6), '#3f4a62', [0, 0, 0], [PI / 2, 0, 0], 1, ARMOR);
  m.m(rbox(0.7, 0.5, 1.0, 0.08), '#56637f', [-0.45, 0, 0], [0, 0, 0], 1, PAINT);
  m.mirror((s) => {
    m.m(cyl(0.16, 0.19, 0.5, 10), '#232a3a', [-0.9, 0, s * 0.26], [0, 0, PI / 2], 1, ARMOR);
    m.m(cyl(0.11, 0.12, 0.9, 10), '#c8ccd8', [-1.3, 0, s * 0.26], [0, 0, PI / 2], 1, CHROME);
    m.m(cyl(0.16, 0.16, 0.16, 10), '#232a3a', [-1.72, 0, s * 0.26], [0, 0, PI / 2], 1, DARK);
    m.e(sph(0.12, 8, 6), '#4ab0ff', [-0.3, 0.3, s * 0.52], [0, 0, 0], 1, 2.4);
  });
  return m.build();
}
function omegaPetal() {     // コアを覆う装甲の花弁（6 枚で半球。+y 側の 1 枚）
  const m = new ModelBuilder(0.9);
  const g = new THREE.SphereGeometry(1.1, 6, 8, PI - PI / 6 + 0.03, PI / 3 - 0.06, 0.05, PI / 2 - 0.05); g.rotateZ(PI / 2);
  m.m(g, '#6a7a9a', [0, 0, 0], [0, 0, 0], 1, ARMOR);
  const g2 = new THREE.SphereGeometry(1.14, 4, 6, PI - PI / 12, PI / 6, 0.3, PI / 2 - 0.5); g2.rotateZ(PI / 2);
  m.m(g2, '#3f4a62', [0, 0, 0], [0, 0, 0], 1, ARMOR);
  m.e(box(0.5, 0.05, 0.05), '#7ad8ff', [-0.62, 0.98, 0], [0, 0, -0.9], 1, 1.4);
  return m.build();
}
function omegaReactor() {
  const m = new ModelBuilder(1);
  m.e(ico(0.72, 2), '#bfe0ff', [0, 0, 0], [0, 0, 0], 1, 1.7);
  for (let k = 0; k < 3; k++) m.m(torus(0.8, 0.05, 20, 5), '#8898ba', [0, 0, 0], [k * PI / 3, k * 0.9, 0], 1, CHROME);
  return m.build();
}
function omegaBar() {       // 回る障壁の節（r 0.5。腕の向きは +x）
  const m = new ModelBuilder(1);
  m.m(cyl(0.5, 0.5, 0.6, 6), '#c8a23a', [0, 0, 0], [0, 0, PI / 2], 1, { r: 0.3, m: 0.9 });
  m.m(rbox(0.3, 1.06, 0.5, 0.06), '#3f4a62', [0, 0, 0], [0, 0, 0], 1, ARMOR);
  m.e(box(0.62, 0.1, 0.1), '#ffe08a', [0, 0, 0.44], [0, 0, 0], 1, 1.6); m.e(box(0.62, 0.1, 0.1), '#ffe08a', [0, 0, -0.44], [0, 0, 0], 1, 1.6);
  return m.build();
}
function omegaHeart() {     // 露出した中枢（r 0.85）
  const m = new ModelBuilder(1);
  m.e(displace(ico(0.66, 2), (x, y, z) => 1 + 0.08 * Math.sin(x * 9) * Math.sin(y * 8 + z * 6)), '#ff3a6a', [0, 0, 0], [0, 0, 0], 1, 1.7);
  for (let k = 0; k < 5; k++) { const a = H(k, 51) * TAU, b = H(k, 52) * PI - PI / 2; m.m(rbox(0.36, 0.3, 0.12, 0.04), '#3f4a62', [Math.cos(b) * Math.cos(a) * 0.72, Math.sin(b) * 0.72, Math.cos(b) * Math.sin(a) * 0.72], [b, -a, 0], 1, ARMOR); }
  for (let k = 0; k < 4; k++) m.m(tube([[0.5, (k - 1.5) * 0.2, 0], [1.1, (k - 1.5) * 0.4, (k % 2 ? 0.3 : -0.3)], [1.7, (k - 1.5) * 0.5 - 0.3, 0]], 0.05, 8, 4), '#1a1c22', [0, 0, 0], [0, 0, 0], 1, RUBBER);
  return m.build();
}
function omegaCage() {      // 壊れた檻の輪
  const m = new ModelBuilder(1);
  m.m(torus(1.0, 0.07, 18, 6, PI * 1.3), '#aab4c8', [0, 0, 0], [0, 0, 0], 1, CHROME);
  m.m(rbox(0.26, 0.2, 0.2, 0.04), '#3f4a62', [1.0, 0, 0], [0, 0, 0], 1, ARMOR);
  m.e(sph(0.07, 6, 5), '#ffd0dc', [-0.58, 0.81, 0], [0, 0, 0], 1, 2.4);
  return m.build();
}

export const BOSS_MODELS = {
  ignisHull, ignisPlate0: () => ignisPlate(0), ignisPlate1: () => ignisPlate(1), ignisPlateX: () => ignisPlate(2), ignisCore, coreRing: () => coreRing(), ignisTurret,
  wardenGate, wardenJawT: () => wardenJaw(1), wardenJawB: () => wardenJaw(-1), wardenGear, wardenEye: () => eyeball(0.92, '#cfe8f4', '#58d2ff', false),
  colossusHead, colossusJaw, colossusCracks0: () => colossusCracks(0), colossusCracks1: () => colossusCracks(1),
  crusherBody, crusherShell, crusherCore, crusherSeg, crusherHead,
  hydraBrain, hydraLid, hydraLidB, hydraTip, hydraEye: () => eyeball(0.84, '#ffe890', '#ff9a20', true),
  nucCore, nucOrg,
  omegaWall1: () => omegaWall(1), omegaWall2: () => omegaWall(2), omegaWall3: () => omegaWall(3), omegaGun: () => omegaGun(false), omegaGunX: () => omegaGun(true),
  omegaPetal, omegaReactor, omegaBar, omegaHeart, omegaCage,
};

// =================================================================================
// 描画（部位の位置・状態は shared/bosses.js のものをそのまま使う）
// =================================================================================
const T3 = [0, 0, 0];
const gray = (v) => { const g = clamp((v * 255) | 0, 0, 255); return (g << 16) | (g << 8) | g; };
const mixc = (a, b, t) => { const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t) | 0, g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t) | 0, bl = (a & 255) + (((b & 255) - (a & 255)) * t) | 0; return (r << 16) | (g << 8) | bl; };
const wrap = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };

export class Bosses3D {
  drawBoss(e, a, g) {
    const b = this.b, S = this.sp, now = this.now, cam = this.cam, HW = 16, pl = g.player;
    let x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a); const z = lerp(e.pz, e.z, a);
    let dy = 0, dx = 0, dk = 0;
    if (e.dead) { dk = Math.min(1, (160 - (e.linger || 0)) / 160); dx = Math.sin(now * 60) * 0.1 * dk; dy = -dk * 2; }
    if (e.shake) dx += Math.sin(now * 70) * 0.08;
    x += dx; y += dy;
    const lx = x - cam - HW, ly = y - HH, lz = -z;
    // 部位の位置（補間つき）→ T3
    const P = (q) => { T3[0] = lerp(q.px, q.x, a) - cam - HW + dx; T3[1] = lerp(q.py, q.y, a) - HH + dy; T3[2] = -lerp(q.pz, q.z, a); return T3; };
    const fl = (q) => { q.flash = Math.max(0, (q.flash || 0) - 4.8 * this.dt); return q.flash; };
    const hp = BOSS[e.type].bossHp(e), hk = e.dead ? 0 : hp[0] / (hp[1] || 1);
    const tint = gray(e.dead ? 1 - dk * 0.5 : 0.74 + 0.26 * Math.min(1, hk * 1.6));
    const entering = e.st === 'enter';
    const beat = Math.pow(Math.max(0, Math.sin(now * 5)), 6);
    // 損傷: 体力が減ると煙と火花
    if (!e.dead && hk < 0.5 && this.every(hk < 0.25 ? 9 : 4)) { const q = e.parts[(rnd() * Math.min(e.parts.length, 6)) | 0]; if (q.vis !== false) { this.smokePuff(q.x + rr(-1, 1), q.y + rr(-1, 1), q.z + rr(-1, 1), rr(0.9, 1.6), 0x2a2630, 0.5, 1.2, 1.2, 0.55); if (hk < 0.25) this.sparks(q.x + rr(-1, 1), q.y + rr(-1, 1), q.z + 1, 4, 0xffc060, 0, TAU, 2, 8); } }
    switch (e.type) {
      case 'ignis': {
        this.M3('ignisHull', lx, ly, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.3, tint);
        // 噴射（登場中は長い）
        const el = entering ? 3.4 : 1.7 + 0.15 * Math.sin(now * 31);
        for (let s = -1; s <= 1; s += 2) for (let zz = -1; zz <= 1; zz += 2) this.exh(lx + 3.75, ly + s * 2.2, lz + zz * 0.7, el, 0.4, 0x5aa0ff, PI, 1);
        this.exh(lx + 3.0, ly, lz, el * 0.8, 0.55, 0x5aa0ff, PI, 1);
        S.put(SP.glow, lx + 4.0, ly + 2.2, lz, 3, 3, 0, 0x4a90ff, 0.6); S.put(SP.glow, lx + 4.0, ly - 2.2, lz, 3, 3, 0, 0x4a90ff, 0.6);
        // 光線砲の溜めと発射
        const ch = e.charge || 0, firing = e.st === 'beam';
        for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 2; k++) {
          const ex = lx + (k ? -1.18 : -1.78), ey = ly + s * (k ? 2.6 : 1.3);
          S.put(SP.glow, ex, ey, lz, 0.7 + ch * 1.6, 0.7 + ch * 1.6, 0, 0xff6ac0, 0.3 + ch * 1.2);
          if (ch > 0.1) { S.put(SP.ring2, ex, ey, lz, 2.2 - ch * 1.3, 2.2 - ch * 1.3, now * 6 + k, 0xffa0e0, ch); S.put(SP.star, ex, ey, lz, ch * 2.2, ch * 2.2, now * 3, 0xffd0f0, ch); }
          if (firing) S.put(SP.burst, ex - 0.2, ey, lz, 2.0, 2.0, now * 20, 0xffc0e8, 1.2);
        }
        // 翼の砲塔（自機を向く）
        for (let s = -1; s <= 1; s += 2) { const tx = x + 0.6, ty = y + s * 3.5; this.M3('ignisTurret', lx + 0.6, ly + s * 3.55, lz, s < 0 ? PI : 0, 0, clamp(wrap(Math.atan2(pl.y - ty, pl.x - tx) - PI), -0.7, 0.7), 1, 1, 1, 0, tint); if (e.st === 'spread' && e.stT % g.fireInterval(18) < 3) S.put(SP.burst, lx - 0.5, ly + s * 3.55, lz, 1.6, 1.6, PI, 0xffd080, 1.2); }
        // 装甲板（損傷で色が変わり、壊れると残骸が燻る）
        for (let i = 5; i < 8; i++) {
          const q = e.parts[i], t = P(q);
          if (q.alive) this.M3(q.hp < q.maxHp * 0.5 ? 'ignisPlate1' : 'ignisPlate0', t[0], t[1], t[2], 0, 0, 0, 1, 1, 1, fl(q));
          else { this.M3('ignisPlateX', t[0], t[1] - 0.4, t[2], 0, 0, 0.3, 1, 0.5, 1); if (!e.dead && this.every(2)) this.smokePuff(q.x, q.y, q.z + 0.5, 0.6, 0x2a2630, 0.4, 0.8, 0.8, 0.45); }
        }
        // コア: 鼓動する炉心と 2 つの輪
        const c = e.parts[8], t = P(c), open = c.isOpen(e), cf = fl(c), cs = 1 + beat * (open ? 0.1 : 0.03);
        this.M3('ignisCore', t[0], t[1], t[2], now * 0.7, 0, now * 0.4, cs, cs, cs, cf, open ? 0xffffff : 0x5a6a80);
        this.M3('coreRing', t[0], t[1], t[2], now * 1.3, 0.5, 0, 1, 1, 1, cf); this.M3('coreRing', t[0], t[1], t[2], 0.4, now * 1.7, PI / 2, 0.86, 0.86, 0.86, cf);
        S.put(SP.glow, t[0], t[1], t[2], (open ? 3.2 : 1.8) + beat * 0.8, (open ? 3.2 : 1.8) + beat * 0.8, 0, open ? 0x5ad8ff : 0x2a6a9a, open ? 0.9 + beat * 0.5 : 0.4);
        if (open) S.put(SP.star, t[0], t[1], t[2] + 0.5, 2.4 + beat, 2.4 + beat, now, 0xbfe8ff, 0.5 + beat * 0.5);
        break;
      }
      case 'warden': {
        const o = e.open, eye = e.parts[6];
        this.M3('wardenGate', lx, ly, lz, 0, 0, 0, 1, 1, 1, 0, tint);
        this.M3('wardenJawT', lx, ly + 1.0 + o * 2.2, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.3, tint);
        this.M3('wardenJawB', lx, ly - 1.0 - o * 2.2, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.3, tint);
        // 顎の機構（青銅の歯車が回る）
        for (let s = -1; s <= 1; s += 2) for (let zz = -1; zz <= 1; zz += 2) this.M3('wardenGear', lx + 2.0, ly + s * (1.9 + o * 1.1), lz + zz * 2.2, 0, 0, s * o * 3.2 + (zz > 0 ? 0 : 0.3), 1, 1, 1, 0, tint);
        // 目（虹彩が自機を追う）
        if (o > 0.04) {
          const s = Math.min(1, 0.25 + o), ex = x + 0.2;
          this.M3('wardenEye', lx + 0.2, ly, lz, now * 0.0, clamp((pl.z - z) * 0.12, -0.5, 0.5), clamp(wrap(Math.atan2(pl.y - y, pl.x - ex) - PI), -0.6, 0.6), s, s, s, fl(eye));
          S.put(SP.glow, lx - 0.4, ly, lz, 3.6 * o, 3.6 * o, 0, 0x58d2ff, 0.6 * o + beat * 0.2);
          if (o >= 1) S.put(SP.star, lx - 0.7, ly, lz, 2.4, 2.4, now * 0.6, 0xbfeeff, 0.5);
        }
        for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) S.put(SP.glow, lx + 2.75, ly + s * (2.6 + k * 1.4), lz + 2.2, 0.8, 0.5, 0, 0x58d2ff, 0.25 + o * 0.4);
        // 崩れる石片と砂（震え・開閉のとき）
        if ((e.shake || (o > 0.02 && o < 0.98)) && this.every(30)) { const s = rnd() < 0.5 ? 1 : -1; this.smokePuff(x + rr(-1.8, 1.5), y + s * (1.0 + o * 2.2), z + rr(-1.5, 1.5), 0.6, 0x9a8a6a, rr(-0.5, 0.5), -1.5, 0.7, 0.45); const q = this.P(3, x + rr(-1.8, 1.5), y + s * (1.0 + o * 2.2), z + rr(-1.5, 1.5), rr(-1, 1), rr(-1, 0), 0, 0.9, rr(0.05, 0.11), 0xa89c7a); q.g = 9; q.vr = rr(-8, 8); q.I = 0; }
        break;
      }
      case 'colossus': {
        const m = e.mouth, ey = e.eyes || 0, mo = e.parts[4];
        this.M3('colossusHead', lx, ly, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.25, tint);
        this.M3('colossusJaw', lx, ly - 0.6 - m * 0.9, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.25, tint);
        if (hk < 0.66) this.M3('colossusCracks0', lx, ly, lz, 0, 0, 0, 1, 1, 1);          // 損傷で光るひびが広がる
        if (hk < 0.33) this.M3('colossusCracks1', lx, ly, lz, 0, 0, 0, 1, 1, 1);
        // 目: 光線の溜め（光が強まり、輪が縮む）
        for (let s = -1; s <= 1; s += 2) { S.put(SP.glow, lx - 0.62, ly + 1.28, lz + s * 3.0, 2.0 + ey * 2.4, 1.0 + ey * 1.6, 0, ey > 0.3 ? 0xff3a4a : 0xff78c8, 0.5 + ey * 0.9); if (ey > 0.1) S.put(SP.star, lx - 0.7, ly + 1.28, lz + s * 3.05, ey * 3.4, ey * 3.4, now * 2, 0xffc0d0, ey); }
        if (ey > 0.05) { S.put(SP.glow, lx - 1.7, ly + 1.25, lz, 1 + ey * 2, 1 + ey * 2, 0, 0xff3a5a, ey); S.put(SP.ring2, lx - 1.7, ly + 1.25, lz, 3 - ey * 2, 3 - ey * 2, now * 5, 0xff90a8, ey); }
        // 口の奥の光
        if (m > 0.05) { const t = P(mo), mf = fl(mo); S.put(SP.glow, t[0], t[1], t[2], 3.4 + m * 1.6, 1.6 + m * 2.4, 0, mf > 0.3 ? 0xffffff : 0xff4ab0, 0.5 + m * 0.7); S.put(SP.halo, t[0] - 0.3, t[1], t[2], 2.2 * m, 3.0 * m, 0, 0xffa0e0, m * 0.6); S.put(SP.star, t[0] + 0.5, t[1], t[2] + 1.5, 2 * m, 2 * m, now, 0xffd0f0, m * 0.5); }
        if ((e.shake || e.st === 'pebbles') && this.every(20)) this.smokePuff(x + rr(-2, 3), y + rr(-4, 5), z + rr(-2.5, 2.5), 0.9, 0x8a8494, rr(-0.5, 0.5), -1.2, 0.8, 0.4);
        break;
      }
      case 'crusher': {
        const c = e.parts[3], s = e.shutter, cf = fl(c);
        this.M3('crusherBody', lx, ly, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.25, tint);
        // コア（上下の殻が開くと現れる）
        const cs = 1 + beat * 0.06 * s;
        this.M3('crusherCore', lx - 0.4, ly, lz, 0, now * 1.5, 0, cs, cs, cs, cf);
        this.M3('crusherShell', lx - 0.4, ly + s * 0.85, lz, 0, 0, 0, 1, 1, 1, 0, tint);
        this.M3('crusherShell', lx - 0.4, ly - s * 0.85, lz, PI, 0, 0, 1, 1, 1, 0, tint);
        S.put(SP.glow, lx - 0.4, ly, lz, 1.2 + s * 2.4, 1.2 + s * 2.4, 0, 0xff8a3a, 0.25 + s * 0.8 + beat * 0.2 * s);
        // 蒸気（排気筒）と警告灯
        if (this.every(e.st === 'slam' || e.st === 'retract' ? 16 : 3)) { const sd = rnd() < 0.5 ? 1 : -1; this.smokePuff(x + 2.8, y + sd * 4.1, z, 0.8, 0xc8c8d0, 0.4, sd * 1.6, 0.9, 0.35); }
        const bk = e.warn ? 0.5 + 0.5 * Math.sin(now * 25) : 0.3;
        for (let sd = -1; sd <= 1; sd += 2) S.put(SP.glow, lx + 0.4, ly + sd * 2.75, lz + 1.35, 0.9, 0.9, 0, 0xff5028, bk);
        // 予告: 挟む位置に赤い柱と照準の輪
        const ax = g.camX + e.armX - cam - HW;
        if (e.warn) {
          b.spiral.put3(ax, 0, 0, 1.05, VIEW_H, 1.05, Q, 0xff5028, 0.5 + 0.3 * Math.sin(now * 25));
          S.axis(SP.beam, ax, 0, 0, 0, VIEW_H, 0, 2.6, 0xff3a18, 0.22 + 0.12 * Math.sin(now * 25));
          S.put(SP.ring2, ax, e.clampY - HH, 0, 3.4 - (e.stT % 20) * 0.06, 3.4 - (e.stT % 20) * 0.06, now * 3, 0xffde6a, 1);
          S.axis(SP.beam, ax, e.clampY - HH, 0, 4.4, 0, 0, 0.1, 0xffde6a, 0.9);
        }
        // 腕（丸い節の柱。先端は打撃頭）。閉じた瞬間に火花
        for (let i = 4; i < 18; i++) {
          const q = e.parts[i], t = P(q), top = q.arm === 'T';
          if (Math.abs(t[1]) > HH + 1.4) continue;
          this.M3(q.i === 0 ? 'crusherHead' : 'crusherSeg', t[0], t[1], t[2], top ? 0 : PI, 0, 0, 1, 1, 1, 0, tint);
          if (q.i === 0) this.wallShadow(t[0], t[1] + (top ? 4 : -4), 2.6, 10, 0.4);
        }
        if (e.st === 'slam' && e.armExt >= 1 && e.stT < 22 && this.every(60)) { this.sparks(g.camX + e.armX + rr(-0.8, 0.8), e.clampY, rr(-0.6, 0.6), 3, 0xffd080, 0, TAU, 4, 14); if (e.stT < 14) this.shake(0.12, 0.2); }
        if (e.st === 'retract' && this.every(14)) this.smokePuff(g.camX + e.armX + rr(-1, 1), e.clampY + rr(-2, 2), rr(-1, 1), 0.9, 0xc8c8d0, 0, rr(-1, 1), 0.7, 0.35);
        break;
      }
      case 'hydra': {
        // 触手: 節は隣の節の向きに合わせる。先端は口を前へ
        for (let k = 0; k < e.arms.length; k++) {
          const arm = e.arms[k]; let ox = lx - 0.6, oy = ly + arm.oy;
          for (let i = 0; i < arm.segs.length; i++) {
            const q = arm.segs[i], t = P(q), ang = Math.atan2(t[1] - oy, t[0] - ox), r = q.r + 0.12;
            if (q.alive) this.M3('tentSeg', t[0], t[1], t[2], k, 0, ang, r, r, r, 0, mixc(0x8a3044, 0xe07088, 0.5 + 0.5 * Math.sin(now * 3 - i * 0.7 + k)));
            ox = t[0]; oy = t[1];
          }
          if (arm.tip.alive) {
            const t = P(arm.tip), tf = fl(arm.tip), ang = Math.atan2(t[1] - oy, t[0] - ox);
            this.M3('hydraTip', t[0], t[1], t[2], 0, 0, ang + PI, 1, 1, 1, tf);
            S.put(SP.glow, t[0] + Math.cos(ang) * 0.5, t[1] + Math.sin(ang) * 0.5, t[2], 1.0, 1.0, 0, 0xffb060, 0.6 + 0.3 * Math.sin(now * 7 + k));
            this.wallShadow(t[0], t[1], 1.6, 1.6, 0.4);
          } else if (!e.dead && this.every(2)) { const q = arm.segs[2]; this.smokePuff(q.x, q.y, q.z, 0.5, 0x5a2038, 0, 0.5, 0.8, 0.4); }
        }
        // 脳（予告で膨らみ、鼓動する）
        const sc = 1 + (e.pulse || 0) * 0.12 + Math.sin(now * 2) * 0.02 + beat * 0.015;
        this.M3('hydraBrain', lx, ly, lz, 0, 0, 0, sc, sc, sc, e.flash * 0.25, tint);
        S.put(SP.glow, lx + 1.0, ly, lz + 1.5, 9, 10, 0, 0xff2a5a, 0.1 + (e.pulse || 0) * 0.5 + beat * 0.08);
        if (e.pulse > 0.05) S.put(SP.ring2, lx + 0.5, ly, lz, 13 - e.pulse * 4, 13 - e.pulse * 4, now * 2, 0xff7a9a, e.pulse * 0.35);
        // 目: まぶたが開き、瞳孔が自機を追う
        const op = e.eye, eye = e.parts[3], ex = lx - 1.4 * sc, th = op * 1.2;
        if (op > 0.04) { this.M3('hydraEye', ex, ly, lz, 0, clamp((pl.z - z) * 0.12, -0.5, 0.5), clamp(wrap(Math.atan2(pl.y - y, pl.x - (x - 1.4)) - PI), -0.6, 0.6), 1, 1, 1, fl(eye)); S.put(SP.glow, ex - 0.6, ly, lz, 2.6 * op, 2.6 * op, 0, 0xffb040, 0.5 * op); }
        this.M3('hydraLid', ex, ly, lz, 0, 0, -th, sc, sc, sc, 0, tint);
        this.M3('hydraLidB', ex, ly, lz, 0, 0, th, sc, sc, sc, 0, tint);
        break;
      }
      case 'nucleus': {
        // 膜細胞の輪（壊れると輪から再生＝分裂して戻る）
        for (let i = 1; i < e.parts.length; i++) {
          const q = e.parts[i], t = P(q);
          if (!q.alive) {
            const k = Math.min(1, q.regen / 380);
            S.put(SP.ring, t[0], t[1], t[2], 0.2 + 1.5 * k, 0.2 + 1.5 * k, 0, 0xa0ffdc, 0.2 + k * 0.5);
            if (k > 0.7) { const r = 0.72 * (k - 0.7) / 0.3 * 0.7; b.bubble.put3(t[0], t[1], t[2], r, r, r, Q, 0xa0ffdc, 0.7); }
            continue;
          }
          const qf = fl(q);
          this.M3('cellCore', t[0], t[1], t[2], i, now * 0.5 + i, 0, 0.66, 0.66, 0.66, qf, q.hp < q.maxHp * 0.5 ? 0xffffff : 0xb0c8b8);
          b.bubble.put3(t[0], t[1], t[2], 0.76, 0.76 + 0.03 * Math.sin(now * 3 + i), 0.76, Q, q.hp < q.maxHp * 0.5 ? 0xc8f8b0 : 0x5adca0, 1);
        }
        // 外の膜: 突進で前後に伸び、予告で震える
        const gl = e.glow || 0, lun = e.st === 'lunge' ? (e.stT < 30 ? -0.06 * Math.abs(Math.sin(now * 40)) : e.stT < 60 ? 0.22 : Math.max(0, 0.22 - (e.stT - 60) * 0.01)) : 0;
        const R = 2.5 + gl * 0.25;
        b.bubble.put3(lx, ly, lz, R * (1 + lun), R * (1 - lun * 0.6), R * 0.9, Q, 0x2ad898, 0.55);
        // 漂う小器官
        for (let k = 0; k < 7; k++) { const an = -e.rot * 2.2 + k * 0.9, rad = 1.5 + (k % 3) * 0.3; this.M3('nucOrg', lx + Math.cos(an) * rad * (1 + lun), ly + Math.sin(an) * rad, lz + Math.sin(an * 1.7 + k) * 1.2, k, an, an + PI / 2, 1, 1, 1); }
        // 核: 鼓動・染色質・核小体
        const c = e.parts[0], cf = fl(c), cs = 1 + beat * 0.05 + gl * 0.06;
        this.M3('nucCore', lx, ly, lz, now * 0.25, now * 0.4, 0, cs, cs, cs, cf, tint);
        b.bubble.put3(lx, ly, lz, 1.34 * cs, 1.34 * cs, 1.34 * cs, Q, 0xffb060, 0.8);
        S.put(SP.glow, lx, ly, lz, 3.6 + gl * 1.6, 3.6 + gl * 1.6, 0, 0xff8a2a, 0.3 + gl * 0.3 + beat * 0.12);
        S.put(SP.glow, lx, ly, lz, 9, 9, 0, 0x20c080, 0.08 + gl * 0.14);
        if (gl > 0.05) S.put(SP.ring2, lx, ly, lz, 12 - gl * 4, 12 - gl * 4, now * 2, 0x60e0b0, gl * 0.35);
        if (e.st === 'lunge' && e.stT >= 30 && e.stT < 60) for (let k = 1; k <= 3; k++) S.axis(SP.trail, lx + 2 + k * 1.6, ly, lz, -4, 0, 0, 4.4 - k * 0.6, 0x3affb0, 0.35 - k * 0.08);
        break;
      }
      case 'omega': {
        const ph = e.phase, ch = e.charge || 0;
        this.M3(ph === 1 ? 'omegaWall1' : ph === 2 ? 'omegaWall2' : 'omegaWall3', lx, ly, lz, 0, 0, 0, 1, 1, 1, e.flash * 0.2, tint);
        if (ph === 1) for (let s = -1; s <= 1; s++) {   // 光線の発振器（上下）とコアの前（中央）
          const ex = lx + (s ? 0.25 : -0.7), ey2 = ly + s * 3.9;
          S.put(SP.glow, ex, ey2, lz, 1.0 + ch * 2.2, 1.0 + ch * 2.2, 0, 0xffc878, 0.25 + ch * 1.2);
          if (ch > 0.1) { S.put(SP.ring2, ex, ey2, lz, 3 - ch * 1.8, 3 - ch * 1.8, now * 6, 0xffe0a0, ch); S.put(SP.star, ex, ey2, lz, ch * 3, ch * 3, now * 3, 0xfff0d0, ch); }
          if (e.st === 'beam') S.put(SP.burst, ex - 0.3, ey2, lz, 2.6, 2.6, now * 20, 0xffe0b0, 1.3);
        }
        // 砲台（自機を向く）。壊れると残骸が燃える
        for (let i = 3; i < 7; i++) {
          const q = e.parts[i], t = P(q);
          if (q.alive) { this.M3('omegaGun', t[0], t[1], t[2], 0, 0, clamp(wrap(Math.atan2(pl.y - q.y, pl.x - q.x) - PI), -0.5, 0.5), 1, 1, 1, fl(q), tint); S.put(SP.glow, t[0] - 0.3, t[1] + 0.3, t[2] + 0.55, 0.6, 0.6, 0, 0x4ab0ff, 0.8); }
          else { this.M3('omegaGunX', t[0] + 0.3, t[1], t[2], i, 0, 0, 1, 1, 1); S.put(SP.fire, t[0], t[1] + 0.3, t[2] + 0.4, 1.0 + 0.15 * Math.sin(now * 9 + i), 1.3 + 0.2 * Math.sin(now * 7 + i), Math.sin(now * 3 + i) * 0.3, 0xff7a20, 0.6, 0.1); if (!e.dead && this.every(3)) this.smokePuff(q.x, q.y + 0.4, q.z, 0.8, 0x2a2630, 0.5, 1.2, 1.0, 0.5); }
        }
        // コア: フェーズ 1 は装甲の花弁が閉じ、フェーズ 2 で開いて炉心が現れる
        const core = e.parts[7];
        this.petal = lerp(this.petal ?? 0, ph >= 2 ? 1 : 0, 1 - Math.pow(0.03, this.dt));
        if (core.alive) {
          const t = P(core), cx = t[0], cy = t[1], cz = t[2], cf = fl(core), op = this.petal;
          const rs = 0.86 + beat * 0.05 * op;
          this.M3('omegaReactor', cx, cy, cz, now * 0.8, now * 0.5, 0, rs, rs, rs, cf, ph >= 2 ? 0xffffff : 0x4a5a78);
          for (let k = 0; k < 6; k++) { _e.set(k * TAU / 6 + (ph >= 2 ? now * 0.3 : 0), 0, -op * 1.15, 'XYZ'); _q.setFromEuler(_e); this.MQ('omegaPetal', cx, cy, cz, _q, 1, 1, 1, cf * 0.5, tint); }
          S.put(SP.glow, cx - 0.3, cy, cz, 2 + op * 3, 2 + op * 3, 0, ph >= 2 ? 0x4ab0ff : 0x2a4a7a, 0.4 + op * 0.6 + beat * 0.2 * op);
          if (ph === 2) {
            // 回る障壁（装甲の節が連なる棒）と光の芯
            for (let i = 9; i < 17; i++) { const q = e.parts[i]; if (!q.vis) continue; const tt = P(q); this.M3('omegaBar', tt[0], tt[1], tt[2], 0, 0, e.rot + q.k * PI, 1, 1, 1); }
            for (let k = 0; k < 2; k++) { const an = e.rot + k * PI, c2 = Math.cos(an), s2 = Math.sin(an); S.axis(SP.beam, cx + c2 * 2.5, cy + s2 * 2.5, cz, c2 * 2.6, s2 * 2.6, 0, 1.5, 0xffc040, 0.7); S.axis(SP.arc, cx + c2 * 2.5, cy + s2 * 2.5, cz + 0.5, c2 * 2.4 * (Math.sin(now * 31 + k) > 0 ? 1 : -1), s2 * 2.4, 0, 1.2, 0xfff0c0, 0.8); }
            S.put(SP.star, cx - 0.9, cy, cz, 3 + beat, 3 + beat, now * 0.7, 0xbfe0ff, 0.6);
          }
        }
        // フェーズ 3: 壁は残骸になり、中枢が飛び出して鼓動する
        const h = e.parts[8];
        if (ph === 3) {
          if (!e.dead && this.every(10)) { const fy = rr(-6, 6); this.smokePuff(x + rr(1, 4), y + fy, z + rr(-2, 2), rr(1, 2), 0x1a1a20, 0.3, 1.5, 1.6, 0.6); if (rnd() < 0.5) this.ember(x + rr(1, 4), y + fy, z + rr(-2, 2), rr(-1, 1), rr(1, 4), 0xff7a20, 1.0); }
          for (let k = 0; k < 5; k++) S.put(SP.fire, lx + 1.6 + (k * 0.83) % 2.6, ly - 5 + k * 2.4 + Math.sin(now * 5 + k) * 0.15, lz + 2.2, 1.3 + 0.2 * Math.sin(now * 9 + k), 2.0 + 0.3 * Math.sin(now * 7 + k * 2), Math.sin(now * 3 + k) * 0.3, 0xff6a18, 0.6, 0.1);
          if (h.vis && h.alive) {
            const t = P(h), hx = t[0], hy = t[1], hz = t[2], hf = fl(h), bt = 1 + Math.max(0, Math.sin(now * 7)) * 0.14;
            this.M3('omegaHeart', hx, hy, hz, 0, now * 0.6, Math.sin(now * 0.9) * 0.3, bt, bt, bt, hf);
            this.M3('omegaCage', hx, hy, hz, now * 1.1, now * 0.7, 0, 1.05, 1.05, 1.05, hf); this.M3('omegaCage', hx, hy, hz, 1.2, now * -0.9, now * 1.3, 1.2, 1.2, 1.2, hf);
            b.bubble.put3(hx, hy, hz, 1.1 * bt, 1.1 * bt, 1.1 * bt, Q, 0xff5a8a, 0.6);
            S.put(SP.glow, hx, hy, hz, 4.2 * bt, 4.2 * bt, 0, 0xff2a5e, 0.8); S.put(SP.star, hx, hy, hz, 3.2 * bt, 3.2 * bt, now, 0xffc0d0, 0.6);
            for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + now * 1.6; _q.setFromAxisAngle(AX, an * 2); b.shard.put3(hx + Math.cos(an) * 1.5, hy + Math.sin(an) * 1.5, hz + Math.sin(an * 2) * 0.4, 0.3, 0.2, 0.24, _q, 0x8898ba, 1); S.axis(SP.trail, hx + Math.cos(an - 0.2) * 1.5, hy + Math.sin(an - 0.2) * 1.5, hz, -Math.sin(an) * -0.7, Math.cos(an) * 0.7, 0, 0.3, 0xff8ab0, 0.7); }
            if (this.every(8)) { const an = rnd() * TAU, q = this.P(11, h.x + Math.cos(an) * 1.2, h.y + Math.sin(an) * 1.2, h.z, 0, 0, 0, 0.12, 1.3, 0xffc0d8); q.ax = Math.cos(an) * 2; q.ay = Math.sin(an) * 2; q.I = 1.3; }
            this.wallShadow(hx, hy, 2.4, 2.4, 0.45);
          }
        }
        break;
      }
    }
    // 登場: 目標の位置に着くまで警告の光が走る
    if (entering) S.put(SP.star, lx - 2.5, ly, lz, 5 + 2 * Math.sin(now * 9), 5 + 2 * Math.sin(now * 9), now * 0.5, 0xffffff, 0.35);
    // ボスの影（奥の壁）
    this.wallShadow(lx + 1, ly, 9, 11, 0.4);
  }
}
const Q = new THREE.Quaternion(), AX = new THREE.Vector3(0.5, 0.6, 0.62).normalize();
export function installBosses(Target) { for (const k of Object.getOwnPropertyNames(Bosses3D.prototype)) if (k !== 'constructor') Target.prototype[k] = Bosses3D.prototype[k]; }
