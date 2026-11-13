// AEGIS RELAY 2D — 地上の標的（砲台・トーチカ・格納庫・ラティス・エリアコア・シジル）と敵弾
// 壊せる標的は「暗い太い輪郭＋明るい縁＋灯」を持つ（飾りの遺跡は持たない）。動く部分は別の絵
import { TAU, path, mir, circlePts, lin, rad, plate, seam, lamp, PAL, OUT } from './kit.js';

const ST = ['#aeb6c6', '#5c6474', '#1c2028'], ST2 = ['#dfe5f0', '#8a93a6', '#343a48'];
function baseShadow(c, pts) { c.save(); c.translate(0.9, 1.2); path(c, pts); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill(); c.restore(); }

// 砲台: 八角の装甲の基部（四隅に警告灯の台座）
function turretBase(c) {
  const oct = circlePts(0, 0, 9.4, 9.4, 8, TAU / 16);
  baseShadow(c, oct); plate(c, oct, ST, { bev: 0.7, spec: 0.3, specA: 0.35, out: 0.6 });
  plate(c, circlePts(0, 0, 7, 7, 8, TAU / 16), ['#6c7484', '#3a4050', '#12151c'], { bev: 0.45, out: 0.3 });
  for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + TAU / 8; c.fillStyle = '#0c0e14'; c.beginPath(); c.arc(Math.cos(a) * 7.9, Math.sin(a) * 7.9, 0.95, 0, TAU); c.fill(); seam(c, [Math.cos(a + 0.78) * 5, Math.sin(a + 0.78) * 5, Math.cos(a + 0.78) * 6.9, Math.sin(a + 0.78) * 6.9], 0.2, 0.6); }
  c.lineWidth = 0.5; c.strokeStyle = '#ffb060'; c.beginPath(); c.arc(0, 0, 5.3, 0, TAU); c.stroke();
}
function turretHead(c) { // 原点 = 旋回の軸。砲身は下（+y）
  c.save(); c.translate(0.6, 0.9); c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(0, 0, 4.4, 0, TAU); c.fill(); c.fillRect(-1.6, 0, 3.2, 10); c.restore();
  for (const s of [-1, 1]) { plate(c, [s * 1.05 - 0.75, 2, s * 1.05 + 0.75, 2, s * 1.05 + 0.65, 9.6, s * 1.05 - 0.65, 9.6], PAL.gun, { bev: 0.22, spec: 0.3, specA: 0.5, out: 0.3 }); c.fillStyle = '#ff8a3d'; c.fillRect(s * 1.05 - 0.65, 8.7, 1.3, 0.7); }
  plate(c, [-2.3, 1.2, 2.3, 1.2, 2.5, 4.6, -2.5, 4.6], ST, { bev: 0.3, out: 0.3 });
  plate(c, circlePts(0, 0, 4.2, 4.2, 10, 0), ST2, { bev: 0.6, spec: 0.3, specA: 0.6 });
  plate(c, circlePts(0, -0.4, 2, 2, 8, 0), ['#ffd0a0', '#e06a20', '#5a2004'], { bev: 0.3, out: 0.3 });
}
// トーチカ: 六角の基部・開く装甲 6 枚・三連装砲
function bunkerBase(c) {
  const hex = circlePts(0, 0, 12.2, 12.2, 6, TAU / 12);
  baseShadow(c, hex); plate(c, hex, ST, { bev: 0.8, spec: 0.3, specA: 0.3, out: 0.65 });
  plate(c, circlePts(0, 0, 8.6, 8.6, 6, TAU / 12), ['#4a5060', '#22262e', '#06080c'], { bev: 0.5, out: 0.3 });
  c.fillStyle = rad(c, 0, 0, 1, 8, ['rgba(255,120,60,.55)', 'rgba(255,80,40,.2)', 'rgba(255,60,30,0)']); c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill(); // 装甲が開くと見える内部の光
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; c.fillStyle = '#0c0e14'; c.beginPath(); c.arc(Math.cos(a) * 10.4, Math.sin(a) * 10.4, 0.85, 0, TAU); c.fill(); }
}
function bunkerPetal(c) { // 上（-y）方向の 1 枚。描画側で 6 方向に回して置く
  plate(c, [-4.3, -8.4, 4.3, -8.4, 2.2, -3.4, -2.2, -3.4], ST2, { bev: 0.5, spec: 0.35, specA: 0.5, out: 0.4 });
  seam(c, [-2.6, -6.8, 2.6, -6.8], 0.2, 0.55);
  c.fillStyle = '#ffb060'; c.fillRect(-0.9, -5.4, 1.8, 0.5);
}
function bunkerGun(c) { // 三連装（下向き）
  for (const a of [-0.42, 0, 0.42]) { c.save(); c.rotate(a); plate(c, [-0.8, 2, 0.8, 2, 0.7, 9.2 - Math.abs(a) * 2, -0.7, 9.2 - Math.abs(a) * 2], PAL.gun, { bev: 0.22, spec: 0.3, out: 0.3 }); c.fillStyle = '#ff8a3d'; c.fillRect(-0.7, 8.2 - Math.abs(a) * 2, 1.4, 0.7); c.restore(); }
  plate(c, circlePts(0, 0, 4.4, 4.4, 6, 0), ST2, { bev: 0.6, spec: 0.3, specA: 0.6 });
  plate(c, circlePts(0, 0, 2.2, 2.2, 6, TAU / 12), ['#ffd0a0', '#e06a20', '#5a2004'], { bev: 0.3, out: 0.3 });
}
// 格納庫: 金色の枠・中の暗い格納部・左右に開くハッチ
function dockBase(c) {
  const box = []; c.beginPath(); c.roundRect(-12.4, -9.4, 24.8, 18.8, 3.4);
  c.save(); c.translate(0.9, 1.3); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill(); c.restore();
  const oct = [-9.4, -9.4, 9.4, -9.4, 12.4, -6.4, 12.4, 6.4, 9.4, 9.4, -9.4, 9.4, -12.4, 6.4, -12.4, -6.4];
  plate(c, oct, PAL.gold, { bev: 0.8, spec: 0.3, specA: 0.6, out: 0.65 });
  plate(c, [-8.6, -6.6, 8.6, -6.6, 8.6, 6.6, -8.6, 6.6], ['#2a2010', '#120c04', '#000000'], { bev: 0.4, rim: false, out: 0.35 });
  c.fillStyle = rad(c, 0, 0, 0, 8, ['rgba(255,220,120,.7)', 'rgba(255,180,60,.25)', 'rgba(255,160,40,0)']); c.fillRect(-8.4, -6.4, 16.8, 12.8);  // 中の支援機の光
  c.lineWidth = 0.45; c.strokeStyle = '#ffe9a8'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.moveTo(-5, 0); c.lineTo(5, 0); c.moveTo(0, -4.4); c.lineTo(0, 4.4); c.stroke();
  for (const s of [-1, 1]) for (const t of [-1, 1]) { c.fillStyle = '#3a2606'; c.beginPath(); c.arc(s * 10.6, t * 7.7, 0.75, 0, TAU); c.fill(); }
}
function dockDoor(c, s) { // 片側のハッチ（原点 = 閉じたときの中心側の辺）
  plate(c, mir([0, -6.4, 8.4, -6.4, 8.4, 6.4, 0, 6.4], s), PAL.goldDk, { bev: 0.5, spec: 0.35, specA: 0.45, out: 0.35 });
  for (let k = -1; k <= 1; k++) seam(c, mir([1.4, k * 3.6, 7.2, k * 3.6], s), 0.2, 0.5);
  c.fillStyle = 'rgba(20,12,0,.75)'; for (let k = 0; k < 4; k++) { path(c, mir([0.3, -6 + k * 3.3, 1.5, -6 + k * 3.3, 0.3, -4.6 + k * 3.3], s)); c.fill(); }
}
// ラティス・パネル: 暗いガラスの板に回路
export const PANEL_TRACE = [-4.2, -4.2, -0.6, -4.2, -0.6, -0.4, 3.4, -0.4, 3.4, 3.8, -4, 3.8]; // 光が流れる道筋
function panel(c) {
  const sq = [-7, -7, 7, -7, 7, 7, -7, 7];
  baseShadow(c, sq); plate(c, sq, ['#5c7088', '#2a3a4c', '#0a1018'], { bev: 0.7, out: 0.55 });
  plate(c, [-5.6, -5.6, 5.6, -5.6, 5.6, 5.6, -5.6, 5.6], ['#16324a', '#0a1826', '#02060c'], { bev: 0.35, rim: false, out: 0.3, spec: 0.3, specA: 0.22 });
  path(c, PANEL_TRACE, false); c.lineWidth = 1.2; c.strokeStyle = 'rgba(100,230,255,.22)'; c.stroke(); c.lineWidth = 0.42; c.strokeStyle = '#8ff0ff'; c.stroke();
  for (let i = 0; i < PANEL_TRACE.length; i += 4) { c.fillStyle = '#d8fbff'; c.beginPath(); c.arc(PANEL_TRACE[i], PANEL_TRACE[i + 1], 0.6, 0, TAU); c.fill(); }
  for (const s of [-1, 1]) for (const t of [-1, 1]) { c.fillStyle = '#9fb4c8'; c.beginPath(); c.arc(s * 6.2, t * 6.2, 0.4, 0, TAU); c.fill(); }
}
// エリアコア: 基部・外装甲（損傷で段階的に欠ける）・回る輪 2 つ・核の座
function coreBase(c) {
  const R = 22.6, pts = circlePts(0, 0, R, R, 16, TAU / 32);
  baseShadow(c, pts); plate(c, pts, ['#8a92a6', '#3e4454', '#101218'], { bev: 0.9, spec: 0.28, specA: 0.3, out: 0.8 });
  plate(c, circlePts(0, 0, 13.6, 13.6, 16, 0), ['#3a4050', '#181b24', '#020306'], { bev: 0.6, rim: false, out: 0.4 });
  for (let k = 0; k < 8; k++) { const a = k * TAU / 8; seam(c, [Math.cos(a) * 14, Math.sin(a) * 14, Math.cos(a) * 22, Math.sin(a) * 22], 0.25, 0.6); }
  c.fillStyle = rad(c, 0, 0, 2, 13, ['rgba(255,80,170,.6)', 'rgba(255,60,150,.2)', 'rgba(255,60,150,0)']); c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
}
function coreArmor(c, stage) { // 8 枚の外装甲。stage が進むと欠ける
  const keep = [[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 3, 4, 5, 7], [0, 3, 4, 7], [3, 7]][stage];
  for (const k of keep) {
    const a0 = k * TAU / 8 + 0.07, a1 = (k + 1) * TAU / 8 - 0.07, pts = [];
    for (let i = 0; i <= 5; i++) { const a = a0 + (a1 - a0) * i / 5; pts.push(Math.cos(a) * 21.4, Math.sin(a) * 21.4); }
    for (let i = 5; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 5; pts.push(Math.cos(a) * 14.8, Math.sin(a) * 14.8); }
    plate(c, pts, ST2, { bev: 0.7, spec: 0.5, specA: 0.4, out: 0.45 });
    const am = (a0 + a1) / 2; seam(c, [Math.cos(a0 + 0.1) * 18, Math.sin(a0 + 0.1) * 18, Math.cos(a1 - 0.1) * 18, Math.sin(a1 - 0.1) * 18], 0.22, 0.5);
    c.fillStyle = '#ff9ad0'; c.beginPath(); c.arc(Math.cos(am) * 19.8, Math.sin(am) * 19.8, 0.6, 0, TAU); c.fill();
  }
}
function coreRing(c, r0, r1, n, pal) {
  for (let k = 0; k < n; k++) {
    const a0 = k * TAU / n + 0.16, a1 = (k + 1) * TAU / n - 0.16, pts = [];
    for (let i = 0; i <= 6; i++) { const a = a0 + (a1 - a0) * i / 6; pts.push(Math.cos(a) * r1, Math.sin(a) * r1); }
    for (let i = 6; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 6; pts.push(Math.cos(a) * r0, Math.sin(a) * r0); }
    plate(c, pts, pal, { bev: 0.4, spec: 0.5, specA: 0.5, out: 0.35 });
  }
}
function coreNucleus(c) {
  c.fillStyle = OUT; c.beginPath(); c.arc(0, 0, 6.6, 0, TAU); c.fill();
  c.fillStyle = rad(c, -1.4, -1.6, 0.2, 6.4, ['#ffffff', '#ffb0dc', '#ff4fa8', '#7a0a44']); c.beginPath(); c.arc(0, 0, 5.9, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(-2, -2.4, 1.6, 1, -0.6, 0, TAU); c.fill();
}
// 現れたシジル（白い星形の印）
function sigil(c) {
  for (const [w, col] of [[1.8, 'rgba(255,255,255,.18)'], [0.55, '#ffffff']]) {
    c.lineWidth = w; c.strokeStyle = col; c.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k * 3 * TAU) / 8 - Math.PI / 2; k ? c.lineTo(Math.cos(a) * 9.4, Math.sin(a) * 9.4) : c.moveTo(Math.cos(a) * 9.4, Math.sin(a) * 9.4); } // 八芒の星
    c.moveTo(11, 0); c.arc(0, 0, 11, 0, TAU); c.moveTo(2.6, 0); c.arc(0, 0, 2.6, 0, TAU);
    for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8 + TAU / 16; c.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); c.lineTo(Math.cos(a) * 12.4, Math.sin(a) * 12.4); } c.stroke();
  }
}
// 敵弾: 暗い縁 → 桃色の光 → 白い芯（どの背景・爆発の上でも読める）。当たり半径 2.4
function bullet(c) {
  c.fillStyle = 'rgba(16,0,10,.9)'; c.beginPath(); c.arc(0, 0, 3.7, 0, TAU); c.fill();
  c.fillStyle = rad(c, 0, 0, 0.8, 3, ['#ffd0ea', '#ff4fa8', '#e01c88']); c.beginPath(); c.arc(0, 0, 2.95, 0, TAU); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 1.35, 0, TAU); c.fill();
}

export function defineGround(A) {
  A.define('turretBase', 12, turretBase); A.define('turretHead', 12, turretHead);
  A.define('bunkerBase', 15, bunkerBase); A.define('bunkerPetal', 10, bunkerPetal); A.define('bunkerGun', 11, bunkerGun);
  A.define('dockBase', 15, dockBase); A.define('dockDoorL', 10, (c) => dockDoor(c, -1)); A.define('dockDoorR', 10, (c) => dockDoor(c, 1));
  A.define('panel', 9.5, panel);
  A.define('coreBase', 26, coreBase); for (let s = 0; s < 4; s++) A.define('coreArmor' + s, 23, (c) => coreArmor(c, s));
  A.define('coreRingA', 14.5, (c) => coreRing(c, 10.6, 13.2, 3, ['#f0e0ff', '#9a70d8', '#3a1c6a']));
  A.define('coreRingB', 11, (c) => coreRing(c, 7.4, 9.6, 4, ['#ffe0f0', '#d860a8', '#5a1040']));
  // 破片（鋼・金）。撃破のとき回りながら散る
  const shard = (pts, pal) => (c) => plate(c, pts, pal, { bev: 0.3, spec: 0.4, specA: 0.5, out: 0.3 });
  [[-2.4, -1, 0.6, -2.2, 2.6, 0.2, 0.4, 1.8, -1.8, 1.2], [-2, -1.6, 2.2, -0.8, 1.2, 1.6, -1.4, 1], [-1.2, -2.4, 1.6, -1.4, 2.2, 1.8, -0.6, 2.2, -2, 0.2]].forEach((pts, i) => { A.define('shard' + i, 3.4, shard(pts, ST2)); A.define('shardG' + i, 3.4, shard(pts, PAL.gold)); });
  A.define('coreNucleus', 7.5, coreNucleus); A.define('sigil', 13, sigil); A.define('bullet', 4.5, bullet);
}
