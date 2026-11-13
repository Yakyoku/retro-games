// AEGIS RELAY 2D — 自機「AEGIS-01」・合体時の装備（支援機 ARC が翼と砲になる）・支援機 ARC・自機の弾
// すべて新規デザイン。原点が機体の中心（＝当たり判定の中心）、上（-y）が進行方向。
// 傾き（ロール）は 9 段階を別々に焼く: 傾けた側の翼が短く見え、陰影も段階ごとに変わる
import { TAU, path, mir, circlePts, lin, rad, plate, seam, lamp, glass, nozzle, PAL, OUT } from './kit.js';

export const BANKS = 9;
const bankOf = (i) => (i - 4) / 4;
function bankX(b) { return (x) => x * (x >= 0 ? (b > 0 ? 1 - 0.4 * b : 1 + 0.12 * b) : (b < 0 ? 1 + 0.4 * b : 1 - 0.12 * b)); }
const tf = (pts, kx) => pts.map((v, i) => (i & 1 ? v : kx(v)));
// 傾きの陰影: 下がった側を暗く、上がった側を明るく
function bankShade(c, b, ext) {
  if (!b) return;
  c.globalCompositeOperation = 'source-atop';
  const dn = b > 0 ? 1 : -1, a = Math.abs(b);
  c.fillStyle = lin(c, 0, 0, dn * 15, 0, [[0, 'rgba(0,6,24,0)'], [0.2, `rgba(0,6,24,${0.1 * a})`], [1, `rgba(0,6,24,${0.42 * a})`]]); c.fillRect(dn > 0 ? 0 : -ext, -ext, ext, ext * 2);
  c.fillStyle = lin(c, 0, 0, -dn * 15, 0, [[0, 'rgba(255,255,255,0)'], [1, `rgba(255,255,255,${0.2 * a})`]]); c.fillRect(dn > 0 ? -ext : 0, -ext, ext, ext * 2);
  c.globalCompositeOperation = 'source-over';
}

function drawShip(c, b) {
  const kx = bankX(b), T = (p) => tf(p, kx);
  const hullD = ['#c9d4e8', '#7f8dab', '#353f58'];
  for (const s of [-1, 1]) {
    // 主翼（後退翼）と翼端のポッド
    plate(c, T(mir([2.4, -3.8, 5.2, -1.8, 13.6, 5.4, 14.4, 8.4, 13, 9.9, 6.2, 8.5, 2.6, 9.8], s)), PAL.steel, { spec: 0.36, specA: 0.55 });
    plate(c, T(mir([5.6, -0.9, 13.3, 5.6, 13.1, 6.7, 5.3, 0.5], s)), ['#b8f4ff', '#2ec5ff', '#0b5c9c'], { bev: 0.25, out: 0.25 });       // 前縁の青い帯
    plate(c, T(mir([6.4, 3.4, 11.4, 6.6, 11.8, 8.9, 6.6, 8], s)), hullD, { bev: 0.3, out: 0.25, spec: 0.3, specA: 0.3 });               // 翼の内板
    seam(c, T(mir([8.9, 5, 9.3, 8.6], s))); seam(c, T(mir([4.4, -0.2, 4.8, 8.9], s)));
    plate(c, T(mir([12.5, 2.3, 14.1, 3, 14.9, 9.6, 13.7, 11, 12.4, 9.7], s)), PAL.steelDk, { bev: 0.35, spec: 0.3 });
    // 吸気口
    plate(c, T(mir([2.8, -3, 5.4, -1.4, 5.2, 2, 3, 1.5], s)), ['#39445c', '#141a28', '#05070c'], { bev: 0.3, rim: false });
    path(c, T(mir([3, -2.7, 5.2, -1.3], s)), false); c.lineWidth = 0.3; c.strokeStyle = 'rgba(220,236,255,.8)'; c.stroke();
    // 尾翼
    plate(c, T(mir([2.2, 5.4, 5.8, 10.4, 5, 12.5, 2.3, 10.2], s)), hullD, { bev: 0.35, spec: 0.4, specA: 0.35 });
    // 前の小翼
    plate(c, T(mir([1.8, -9.4, 5.6, -4.6, 5, -2.9, 2.4, -4.4], s)), PAL.steelDk, { bev: 0.3, spec: 0.3 });
    nozzle(c, kx(s * 1.65), 10.6, 1.05, 1.9);
  }
  // 胴（機首 → 尾）
  plate(c, T([0, -15.2, 1.5, -11.4, 2.6, -5.2, 3, 2, 2.7, 8.6, 1.7, 11.2, -1.7, 11.2, -2.7, 8.6, -3, 2, -2.6, -5.2, -1.5, -11.4]), PAL.steel, { bev: 0.55, spec: 0.3, specW: 0.1, specA: 0.7 });
  plate(c, T([0, -15.2, 0.9, -12.6, -0.9, -12.6]), ['#bdf3ff', '#2ec5ff', '#0b5c9c'], { bev: 0.2, out: 0.25 }); // 機首の先端
  seam(c, T([-2.5, -3.2, 2.5, -3.2])); seam(c, T([-2.9, 4.6, 2.9, 4.6])); seam(c, T([0, 2.4, 0, 10.8]), 0.18, 0.5);
  plate(c, T([-1.5, 5.6, 1.5, 5.6, 1.2, 9.8, -1.2, 9.8]), hullD, { bev: 0.25, out: 0.22 });
  // キャノピー（傾けると少し横へ寄る）
  glass(c, kx(0) - b * 0.55, -7.2, 1.75, 4.1);
  // 中心の核（当たり判定の位置の目印）
  c.fillStyle = OUT; c.beginPath(); c.arc(-b * 0.3, 0.4, 1.75, 0, TAU); c.fill();
  c.fillStyle = rad(c, -b * 0.3 - 0.4, 0, 0, 1.5, ['#ffffff', '#7fe6ff', '#0b6ab0']); c.beginPath(); c.arc(-b * 0.3, 0.4, 1.3, 0, TAU); c.fill();
  // 翼端灯（左 赤・右 緑）
  lamp(c, kx(-14.1), 6.4, 0.55, 'rgba(255,70,70,1)'); lamp(c, kx(14.1), 6.4, 0.55, 'rgba(90,255,150,1)');
  bankShade(c, b, 18);
}

// 合体時の装備: 外翼の延長・左右の砲（弾の出る位置 ±7）・接合部の光
function drawArcGear(c, b) {
  const kx = bankX(b), T = (p) => tf(p, kx);
  for (const s of [-1, 1]) {
    plate(c, T(mir([13.2, 2.6, 16, 2.2, 21.4, 6.6, 23, 11.4, 21.2, 13.2, 16.6, 11.6, 13.2, 10.6], s)), PAL.gold, { spec: 0.35, specA: 0.6 });
    plate(c, T(mir([15, 5.2, 19.8, 8.2, 20.8, 11.2, 16.2, 10], s)), PAL.goldDk, { bev: 0.3, out: 0.25 });
    plate(c, T(mir([14.2, 3.2, 16, 3, 20.6, 6.8, 20.2, 7.6, 14.4, 4.2], s)), ['#fff6cf', '#ffe08a', '#c8901c'], { bev: 0.2, out: 0.2 });
    seam(c, T(mir([17.6, 6.4, 18.2, 11.6], s)));
    nozzle(c, kx(s * 17.4), 11.2, 1.1, 1.7);
    // 砲
    plate(c, T(mir([5.6, -3.4, 8.4, -3.4, 9, 3.8, 5, 3.8], s)), PAL.gold, { bev: 0.4, spec: 0.3, specA: 0.6 });
    plate(c, T(mir([6.2, -10.8, 7.8, -10.8, 8, -3.2, 6, -3.2], s)), PAL.gun, { bev: 0.3, spec: 0.25, specA: 0.5 });
    plate(c, T(mir([5.9, -11.6, 8.1, -11.6, 8.1, -10.2, 5.9, -10.2], s)), PAL.goldDk, { bev: 0.2, out: 0.25 });
    // 接合部の光（噛み合った継ぎ目）
    c.lineWidth = 0.9; c.strokeStyle = 'rgba(255,220,120,.35)'; path(c, T(mir([13.1, 4.4, 13.1, 10.2], s)), false); c.stroke();
    c.lineWidth = 0.4; c.strokeStyle = '#fff8d8'; c.stroke();
    lamp(c, kx(s * 7), 1.2, 0.5, 'rgba(255,230,140,1)');
  }
  bankShade(c, b, 24);
}

// 支援機 ARC（単独で飛ぶ姿）: 核をはさんで翼と砲がたたまれている
function drawArc(c) {
  for (const s of [-1, 1]) {
    plate(c, mir([2.6, -2.4, 9.6, 0.6, 11.6, 5.4, 9.6, 6.8, 4.6, 4.8, 2.4, 4.4], s), PAL.gold, { spec: 0.35, specA: 0.6 });
    plate(c, mir([4.6, 1, 8.8, 2.8, 9.6, 5, 5.4, 3.8], s), PAL.goldDk, { bev: 0.3, out: 0.25 });
    plate(c, mir([3.3, -9.6, 4.9, -9.6, 5.1, -2, 3.1, -2], s), PAL.gun, { bev: 0.3, spec: 0.25 });
    plate(c, mir([3, -10.4, 5.2, -10.4, 5.2, -9, 3, -9], s), PAL.goldDk, { bev: 0.2, out: 0.25 });
    nozzle(c, s * 6.6, 5.6, 1, 1.5);
  }
  plate(c, circlePts(0, 0, 4.2, 4.2, 8, TAU / 16), PAL.gold, { bev: 0.5, spec: 0.3, specA: 0.7 });
  c.fillStyle = OUT; c.beginPath(); c.arc(0, 0, 2.5, 0, TAU); c.fill();
  c.fillStyle = rad(c, -0.5, -0.5, 0, 2.2, ['#ffffff', '#ffe9a0', '#c8801c']); c.beginPath(); c.arc(0, 0, 2, 0, TAU); c.fill();
}
function drawArcRing(c) {
  for (let k = 0; k < 3; k++) {
    const a0 = (k * TAU) / 3 + 0.2, a1 = a0 + 1.5;
    c.lineWidth = 1.5; c.strokeStyle = OUT; c.beginPath(); c.arc(0, 0, 12.2, a0 - 0.03, a1 + 0.03); c.stroke();
    c.lineWidth = 0.95; c.strokeStyle = '#d8a030'; c.beginPath(); c.arc(0, 0, 12.2, a0, a1); c.stroke();
    c.lineWidth = 0.35; c.strokeStyle = '#fff6cf'; c.beginPath(); c.arc(0, 0, 12.45, a0, a1); c.stroke();
    lamp(c, Math.cos(a1) * 12.2, Math.sin(a1) * 12.2, 0.6, 'rgba(255,230,140,1)');
  }
}

// 自機の弾: 白い芯＋色の縁＋下へ伸びる残像。合体時は太い金色
function drawShot(c, docked) {
  const w = docked ? 1.9 : 1.45, col = docked ? ['rgba(255,214,110,0)', 'rgba(255,200,80,.55)', '#ffe9a8'] : ['rgba(60,190,255,0)', 'rgba(70,200,255,.55)', '#a8f4ff'];
  c.fillStyle = lin(c, 0, 13, 0, -9, [[0, col[0]], [0.55, col[1]], [1, col[2]]]);
  c.beginPath(); c.moveTo(-w * 0.35, 13); c.quadraticCurveTo(-w * 1.5, 0, -w, -6.5); c.quadraticCurveTo(0, -10.5, w, -6.5); c.quadraticCurveTo(w * 1.5, 0, w * 0.35, 13); c.closePath(); c.fill();
  c.fillStyle = lin(c, 0, 6, 0, -8.5, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,.9)'], [1, '#fff']]);
  c.beginPath(); c.moveTo(-w * 0.12, 7); c.quadraticCurveTo(-w * 0.62, -2, -w * 0.45, -6.5); c.quadraticCurveTo(0, -9, w * 0.45, -6.5); c.quadraticCurveTo(w * 0.62, -2, w * 0.12, 7); c.closePath(); c.fill();
}
// 推進炎（上が噴射口。白い芯・青い外炎）。長さは描画側で伸び縮みさせる
function drawFlame(c, v, warm) {
  const w = 1.5 + v * 0.12, L = 10;
  const out = warm ? ['rgba(255,190,90,.95)', 'rgba(255,120,40,.5)', 'rgba(255,80,20,0)'] : ['rgba(120,220,255,.95)', 'rgba(50,130,255,.5)', 'rgba(30,60,255,0)'];
  c.fillStyle = lin(c, 0, 0, 0, L, [[0, out[0]], [0.45, out[1]], [1, out[2]]]);
  c.beginPath(); c.moveTo(-w, 0); c.bezierCurveTo(-w * 1.5, L * 0.3, -w * (0.5 + v * 0.15), L * 0.7, (v - 1) * 0.25, L); c.bezierCurveTo(w * (0.5 - v * 0.1), L * 0.7, w * 1.5, L * 0.3, w, 0); c.closePath(); c.fill();
  c.fillStyle = lin(c, 0, 0, 0, L * 0.6, [[0, '#ffffff'], [0.5, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]);
  c.beginPath(); c.moveTo(-w * 0.5, 0); c.quadraticCurveTo(-w * 0.5, L * 0.35, (v - 1) * 0.1, L * 0.6); c.quadraticCurveTo(w * 0.5, L * 0.35, w * 0.5, 0); c.closePath(); c.fill();
}

export function definePlayer(A) {
  for (let i = 0; i < BANKS; i++) { A.define('ship' + i, 18, (c) => drawShip(c, bankOf(i))); A.define('gear' + i, 24, (c) => drawArcGear(c, bankOf(i))); }
  A.define('arc', 14, drawArc); A.define('arcRing', 14, drawArcRing);
  A.define('shot', 14, (c) => drawShot(c, false)); A.define('shotD', 14, (c) => drawShot(c, true));
  for (let v = 0; v < 3; v++) { A.define('flame' + v, 11, (c) => { c.translate(0, -5); drawFlame(c, v, false); }); A.define('flameW' + v, 11, (c) => { c.translate(0, -5); drawFlame(c, v, true); }); }
}
