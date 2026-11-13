// AEGIS RELAY 2D — 空の敵 7 種とジェミニ。すべて新規デザイン。原点が中心、下（+y）が進行方向。
// 回る部分・動く部分は別の絵として焼き、描画側で実時間で回す（羽・刃・装甲の輪・砲身・可変翼）
import { TAU, path, mir, circlePts, lin, rad, plate, seam, lamp, glass, nozzle, PAL, OUT } from './kit.js';

const eye = (c, x, y, r, cols) => { c.fillStyle = OUT; c.beginPath(); c.arc(x, y, r * 1.3, 0, TAU); c.fill(); c.fillStyle = rad(c, x - r * 0.3, y - r * 0.3, 0, r, cols); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };

// スカウト: 小型の矢じり形戦闘機
function scout(c) {
  const P = ['#e4ecfb', '#8fa0c2', '#2f3b58'], D = ['#9aa8c4', '#566482', '#1c2438'];
  for (const s of [-1, 1]) {
    plate(c, mir([2, -1.5, 8.4, -6.4, 9, -3.4, 3.4, 4.8, 2, 3.5], s), P, { spec: 0.4 });
    plate(c, mir([4, -1.2, 7.6, -4, 7.8, -2.6, 4.2, 1.8], s), ['#ff9a9a', '#e0403a', '#6a1010'], { bev: 0.2, out: 0.2 });
    plate(c, mir([1.4, -7.6, 3.4, -8.6, 3, -4, 1.6, -3.4], s), D, { bev: 0.3 });
  }
  plate(c, [0, 9.4, 2.3, 3, 2.7, -4.2, 1.5, -7.4, -1.5, -7.4, -2.7, -4.2, -2.3, 3], P, { spec: 0.32, specA: 0.6 });
  seam(c, [-2.5, -2.4, 2.5, -2.4]);
  glass(c, 0, 3.6, 1.35, 2.5, ['#2a0408', '#a01c1c', '#ff5a4a', '#ffe0d0']);
  nozzle(c, 0, -8.4, 1.2, 1.5);
}
// ウィーバー: 胴（静止）と、回る三枚羽
function weaverHub(c) {
  const P = ['#d8ffe8', '#3fb87c', '#0e4a30'];
  plate(c, circlePts(0, 0, 4.6, 4.6, 6, TAU / 12), P, { spec: 0.3, specA: 0.6 });
  plate(c, circlePts(0, 0, 3, 3, 6, 0), ['#6ad8a0', '#1c7a4c', '#06281a'], { bev: 0.3, out: 0.25 });
  eye(c, 0, 0, 1.5, ['#ffffff', '#9cffd0', '#0c8a50']);
}
function weaverRotor(c) {
  const P = ['#eafff2', '#74d8a4', '#156a44'];
  for (let k = 0; k < 3; k++) {
    c.save(); c.rotate((k * TAU) / 3);
    plate(c, [1.6, -4.2, 5.4, -6.6, 6.4, -9.6, 2.6, -10.2, -1.2, -7.4, -1.7, -4.4], P, { bev: 0.4, spec: 0.4 });      // 鎌形の羽
    plate(c, [1.2, -6.2, 4.6, -7.6, 5, -9, 2.4, -9.2, 0, -7.2], ['#b8ffd8', '#3fb87c', '#0e4a30'], { bev: 0.2, out: 0.18 });
    c.restore();
  }
  c.lineWidth = 0.7; c.strokeStyle = OUT; c.beginPath(); c.arc(0, 0, 5.1, 0, TAU); c.stroke(); c.lineWidth = 0.35; c.strokeStyle = '#9cffd0'; c.stroke();
}
// スライサー: 回る刃の円盤と、静止した核
function slicerDisc(c) {
  const P = ['#fff0d0', '#ff9a4a', '#7a2c0a'];
  for (let k = 0; k < 6; k++) { c.save(); c.rotate((k * TAU) / 6); plate(c, [-2.6, -6.2, 0.4, -9.4, 3.6, -7, 2.6, -5.6], ['#ffffff', '#ffd0a0', '#b85a1c'], { bev: 0.3, spec: 0.4, specA: 0.7 }); c.restore(); }
  plate(c, circlePts(0, 0, 7, 7, 24), P, { spec: 0.3, specA: 0.5 });
  c.lineWidth = 0.9; c.strokeStyle = 'rgba(60,20,4,.7)'; c.beginPath(); c.arc(0, 0, 5.2, 0, TAU); c.stroke();
  for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6 + 0.5; c.fillStyle = '#4a1a06'; c.beginPath(); c.arc(Math.cos(a) * 5.2, Math.sin(a) * 5.2, 0.55, 0, TAU); c.fill(); seam(c, [Math.cos(a + 0.5) * 3.4, Math.sin(a + 0.5) * 3.4, Math.cos(a + 0.5) * 6.6, Math.sin(a + 0.5) * 6.6], 0.18, 0.5); }
}
function slicerHub(c) {
  plate(c, circlePts(0, 0, 3.3, 3.3, 8, TAU / 16), PAL.gun, { bev: 0.4, spec: 0.3 });
  eye(c, 0, 0, 1.5, ['#ffffff', '#ffc070', '#c84a10']);
}
// ガンナー: 双胴の砲艦（砲身は別）
function gunner(c) {
  const P = ['#efe0ff', '#9a6ad8', '#3a1c6a'], D = ['#b090e0', '#5c3a98', '#1e0e3a'];
  plate(c, [-5, -4.5, 5, -4.5, 5.6, 1.6, -5.6, 1.6], D, { bev: 0.4 });
  for (const s of [-1, 1]) {
    plate(c, mir([3.4, -8.6, 7.6, -9.6, 9.6, -5, 9.4, 3.4, 7.6, 7.2, 4.4, 7.2, 3, 3], s), P, { spec: 0.34, specA: 0.55 });
    plate(c, mir([4.6, -6.6, 7.6, -7.2, 8.2, -3, 4.8, -2.4], s), D, { bev: 0.25, out: 0.22 });
    seam(c, mir([3.6, 0.6, 9.2, 0.2], s));
    nozzle(c, s * 6.3, -10.6, 1.3, 1.5);
    lamp(c, s * 8.3, 1.8, 0.5, 'rgba(255,120,255,1)');
  }
  plate(c, [-2.6, -6.4, 2.6, -6.4, 3.4, 2, 0, 5.4, -3.4, 2], P, { spec: 0.3 });
  glass(c, 0, 0.4, 1.5, 2.3, ['#1a0630', '#6a2cb0', '#c890ff', '#f4e4ff']);
}
function gunBarrel(c) { // 原点 = 砲の付け根。下（+y）へ伸びる
  plate(c, [-1.25, -1, 1.25, -1, 1.05, 5.6, -1.05, 5.6], PAL.gun, { bev: 0.3, spec: 0.3, specA: 0.5 });
  plate(c, [-1.5, 5, 1.5, 5, 1.5, 6.6, -1.5, 6.6], ['#e8d8ff', '#8a68c8', '#2e1858'], { bev: 0.25, out: 0.25 });
}
// スピナー: 四枚の水晶の刃（回る）と核
function spinnerBlades(c) {
  for (let k = 0; k < 4; k++) {
    c.save(); c.rotate((k * TAU) / 4);
    path(c, [0, -9.2, 2.7, -2.6, 0, -0.6, -2.7, -2.6]); c.fillStyle = lin(c, -2.7, -9, 2.7, -1, ['#ffffff', '#9ae8ff', '#1c7ac0']); c.fill();
    path(c, [0, -9.2, 2.7, -2.6, 0, -0.6]); c.fillStyle = 'rgba(8,60,120,.42)'; c.fill();                 // 右の面は暗い
    path(c, [0, -9.2, -0.9, -3.4, 0, -0.6]); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();            // 稜線の反射
    path(c, [0, -9.2, 2.7, -2.6, 0, -0.6, -2.7, -2.6]); c.lineWidth = 0.4; c.strokeStyle = OUT; c.stroke();
    c.restore();
  }
}
function spinnerCore(c) {
  plate(c, circlePts(0, 0, 3, 3, 8, TAU / 16), ['#c8f4ff', '#3a8ac8', '#0a2c50'], { bev: 0.4, spec: 0.3 });
  eye(c, 0, 0, 1.6, ['#ffffff', '#b8f4ff', '#2a9ae0']);
}
// ダイバー: 可変翼の突撃機（翼は別。突進の前にたたむ）
function diverBody(c) {
  const P = ['#ffe0e6', '#e0405e', '#5a0f20'], D = ['#c8687c', '#8a1c34', '#30060e'];
  plate(c, [0, 10.6, 2.5, 3, 2.9, -4, 1.7, -8.6, -1.7, -8.6, -2.9, -4, -2.5, 3], P, { spec: 0.3, specA: 0.65 });
  plate(c, [0, 10.6, 1.1, 6.4, -1.1, 6.4], ['#ffffff', '#ffd0a0', '#e06a20'], { bev: 0.2, out: 0.22 });
  plate(c, [-1.9, -7.6, 1.9, -7.6, 2.3, -3.6, -2.3, -3.6], D, { bev: 0.3, out: 0.25 });
  seam(c, [-2.6, 0.2, 2.6, 0.2]);
  glass(c, 0, 3.4, 1.25, 2.2, ['#200408', '#801020', '#ff6a80', '#ffe4e8']);
  for (const s of [-1, 1]) nozzle(c, s * 1.1, -9.8, 0.85, 1.5);
}
function diverWing(c, s) { // 原点 = 翼の付け根（回転の軸）
  const P = ['#ffd0d8', '#c83450', '#4a0c1a'];
  plate(c, mir([-0.4, -2.6, 7.6, -7.6, 8.6, -5, 3, 2.6, -0.4, 3.4], s), P, { spec: 0.4, specA: 0.5 });
  plate(c, mir([2.6, -2.4, 6.8, -5.2, 7.2, -4, 3, -0.4], s), ['#ffe8a0', '#e0a030', '#6a4008'], { bev: 0.2, out: 0.2 });
}
// ランサー: 大型の槍形艦（砲門は別。せり出す）
function lancer(c) {
  const P = ['#f4ecd0', '#b0a478', '#4a4430'], D = ['#a89c74', '#6a6044', '#26221a'];
  for (const s of [-1, 1]) {
    plate(c, mir([3.4, -3, 11, -7.4, 12.8, -10.6, 12.2, -1.6, 5, 5], s), P, { spec: 0.36 });
    plate(c, mir([5.4, -2.4, 10.6, -5.4, 11, -3, 6, 1.4], s), D, { bev: 0.3, out: 0.25 });
    plate(c, mir([3, -13.6, 5.6, -15, 5.6, -9, 3.4, -8], s), D, { bev: 0.3 });
    seam(c, mir([8.2, -5.6, 8.6, 0.8], s));
    nozzle(c, s * 4.3, -15.8, 1.2, 1.6);
    lamp(c, s * 11.8, -8.6, 0.6, 'rgba(255,220,120,1)');
  }
  plate(c, [0, 17.6, 2.2, 8.4, 3.7, 2, 4.1, -8, 2.3, -13.4, -2.3, -13.4, -4.1, -8, -3.7, 2, -2.2, 8.4], P, { bev: 0.6, spec: 0.3, specW: 0.1, specA: 0.7 });
  plate(c, [0, 17.6, 1.3, 11, 0, 9.4, -1.3, 11], ['#ffffff', '#ffe08a', '#c08010'], { bev: 0.25, out: 0.25 });   // 槍の穂先
  seam(c, [-3.9, -2, 3.9, -2]); seam(c, [-3.3, 4.4, 3.3, 4.4]); seam(c, [0, -12.6, 0, -6.4], 0.18, 0.5);
  plate(c, [-2.5, -6, 2.5, -6, 2.9, 0.6, -2.9, 0.6], D, { bev: 0.35, out: 0.25 });                                  // 艦橋
  for (let k = 0; k < 3; k++) { c.fillStyle = '#ffe9a8'; c.fillRect(-1.6 + k * 1.25, -4.6, 0.75, 0.75); c.fillRect(-1.6 + k * 1.25, -2.9, 0.75, 0.75); }
  glass(c, 0, 4.4, 1.3, 2.1, ['#2a2004', '#a07810', '#ffd870', '#fff8dc']);
}
function lancerPod(c, s) { // 砲門（原点 = 取り付け位置。下へ砲身）
  plate(c, mir([-1.8, -3, 1.8, -3.6, 2.4, 2, -1.6, 2.6], s), PAL.gun, { bev: 0.35, spec: 0.3 });
  plate(c, [-0.85, 2, 0.85, 2, 0.75, 6.2, -0.75, 6.2], PAL.gun, { bev: 0.25 });
  lamp(c, 0, -0.6, 0.45, 'rgba(255,200,90,1)');
}
// ジェミニ: 半身（合わせ目が噛み合う歯の形）
function twinHalf(c, s) {
  const P = ['#eef0ff', '#7a84d8', '#22265e'], D = ['#9aa2e8', '#4a52a4', '#14173c'];
  const arc = (r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push(Math.cos(a) * r * s, Math.sin(a) * r); } return s > 0 ? o : o; };
  // 外殻の装甲 3 枚
  for (let k = 0; k < 3; k++) {
    const a0 = -Math.PI / 2 + 0.08 + k * 1.02, a1 = a0 + 0.94, outer = arc(10.4, a0, a1, 6), inner = arc(6.6, a1, a0, 6); let pts = outer.concat(inner);
    if (s < 0) { const q = []; for (let i = pts.length - 2; i >= 0; i -= 2) q.push(pts[i], pts[i + 1]); pts = q; }
    plate(c, pts, P, { bev: 0.5, spec: 0.3 + k * 0.15, specA: 0.5 });
  }
  // 内側の本体と、噛み合う歯
  let body = [0.6, -7.4, 2.4, -7.4, 6.2, -4, 7, 0, 6.2, 4, 2.4, 7.4, 0.6, 7.4, 0.6, 4.6, -1.2, 4.6, -1.2, 1.6, 0.6, 1.6, 0.6, -1.6, -1.2, -1.6, -1.2, -4.6, 0.6, -4.6];
  plate(c, mir(body, s), D, { bev: 0.4, spec: 0.4, specA: 0.35 });
  c.strokeStyle = 'rgba(255,90,180,.35)'; c.lineWidth = 1.5; path(c, mir([1.6, -6.2, 1.6, 6.2], s), false); c.stroke(); c.strokeStyle = '#ffc0e4'; c.lineWidth = 0.45; c.stroke();
  eye(c, s * 4, 0, 1.5, ['#ffffff', '#ff9ad0', '#c81c7a']);
  lamp(c, s * 8.6, -5.2, 0.5, 'rgba(255,120,200,1)'); lamp(c, s * 8.6, 5.2, 0.5, 'rgba(255,120,200,1)');
}
// ジェミニ合体形: 核の本体と、回る装甲の輪 2 つ
function twinCore(c) {
  const P = ['#eef0ff', '#6a74d0', '#1c2054'];
  plate(c, circlePts(0, 0, 9.4, 9.4, 12, TAU / 24), P, { bev: 0.6, spec: 0.3, specA: 0.55 });
  plate(c, circlePts(0, 0, 6.6, 6.6, 12, 0), ['#8088d8', '#3a4294', '#0e1030'], { bev: 0.4, out: 0.3 });
  for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; seam(c, [Math.cos(a) * 6.8, Math.sin(a) * 6.8, Math.cos(a) * 9.2, Math.sin(a) * 9.2], 0.2, 0.55); }
  c.strokeStyle = 'rgba(255,90,180,.4)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -6.2); c.lineTo(0, 6.2); c.stroke(); c.strokeStyle = '#ffc0e4'; c.lineWidth = 0.4; c.stroke(); // 合わせ目
  eye(c, 0, 0, 3.2, ['#ffffff', '#ff8ac8', '#b01068']);
}
function ringArmor(c, r0, r1, n, gapA, pal) {
  for (let k = 0; k < n; k++) {
    const a0 = (k * TAU) / n + gapA / 2, a1 = ((k + 1) * TAU) / n - gapA / 2, pts = [];
    for (let i = 0; i <= 6; i++) { const a = a0 + ((a1 - a0) * i) / 6; pts.push(Math.cos(a) * r1, Math.sin(a) * r1); }
    for (let i = 6; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / 6; pts.push(Math.cos(a) * r0, Math.sin(a) * r0); }
    plate(c, pts, pal, { bev: 0.4, spec: 0.5, specA: 0.4 });
    const am = (a0 + a1) / 2; c.fillStyle = '#ff9ad0'; c.beginPath(); c.arc(Math.cos(am) * (r0 + r1) / 2, Math.sin(am) * (r0 + r1) / 2, 0.5, 0, TAU); c.fill();
  }
}

export function defineEnemies(A) {
  A.define('scout', 11, scout);
  A.define('weaverHub', 6, weaverHub); A.define('weaverRotor', 11, weaverRotor);
  A.define('slicerDisc', 11, slicerDisc); A.define('slicerHub', 5, slicerHub);
  A.define('gunner', 13, gunner); A.define('gunBarrel', 8, gunBarrel);
  A.define('spinnerBlades', 10.5, spinnerBlades); A.define('spinnerCore', 4.5, spinnerCore);
  A.define('diverBody', 12, diverBody); A.define('diverWingL', 10, (c) => diverWing(c, -1)); A.define('diverWingR', 10, (c) => diverWing(c, 1));
  A.define('lancer', 19, lancer); A.define('lancerPodL', 8, (c) => lancerPod(c, -1)); A.define('lancerPodR', 8, (c) => lancerPod(c, 1));
  A.define('twinL', 12, (c) => twinHalf(c, -1)); A.define('twinR', 12, (c) => twinHalf(c, 1));
  A.define('twinCore', 11, twinCore);
  A.define('twinRingA', 14, (c) => ringArmor(c, 10.2, 12.6, 4, 0.34, ['#eef0ff', '#8a94e0', '#2a2e6a']));
  A.define('twinRingB', 17, (c) => ringArmor(c, 13.2, 15.6, 6, 0.3, ['#d8dcff', '#5a64c0', '#181c4c']));
}
