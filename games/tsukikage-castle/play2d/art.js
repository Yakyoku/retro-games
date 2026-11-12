// 月影の魔城 — 2D の絵（すべて手続き的なベクター描画。外部画像・既存作品の絵は使わない）
// 座標: 1u = 1 タイル、原点は足元中央、y 上、x は「向いている方向」が +（呼ぶ側で setTransform 済み）。
// 方針: 月光の青い縁取り・誇張した顔つき・2 段の陰影。予備動作は大きく、被弾は白く光る。
import { knightPose, knightJoints, BONES, enemyAnim } from '../shared/anim.js';

const TAU = Math.PI * 2;
export const PAL = {
  steel: ['#eef4ff', '#b8c8dc', '#7d91ab', '#46566c', '#222b38'], gold: '#d8b25a', cape: ['#3d5ec9', '#263c8a', '#16234f'],
  tunic: ['#c23a3a', '#7d1f22'], skin: ['#f0c8a0', '#c08a64'], cloth: '#2c2430', hair: '#5a3a22', plume: ['#ff5a3c', '#a8261a'],
  outline: '#0b0d14', moon: '#cfe0ff',
};
function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g; }
function seg(ctx, a, b, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
function poly(ctx, pts, fill, stroke, lw) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
function ell(ctx, x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
const OL = 0.045; // 輪郭の太さ（u）

// ================================================================ 騎士
export function drawKnight(ctx, p, time, opt = {}) {
  const P = knightPose(p, time);
  const J = knightJoints(P, 1);
  const armor = p.armor;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (P.back) return drawKnightBack(ctx, P, J, armor, time);
  // 後ろの腕・脚（暗く）
  limbDraw(ctx, J.hip, J.legB, armor ? PAL.steel[3] : PAL.cloth, armor ? 0.17 : 0.14, true, armor);
  armDraw(ctx, J.sh, J.armB, armor ? PAL.steel[3] : PAL.skin[1], armor, true);
  // マント（鎧があるとき）
  if (armor) {
    const cx = J.sh[0] - 0.12, cy = J.sh[1] + 0.02, sw = Math.sin(P.cape) * 0.55, len = 0.85 - P.crouch * 0.3;
    ctx.beginPath(); ctx.moveTo(cx + 0.1, cy); ctx.quadraticCurveTo(cx - 0.15 - sw * 0.4, cy - len * 0.5, cx - sw - 0.1, cy - len);
    ctx.lineTo(cx - sw + 0.18, cy - len + 0.06 + Math.sin(time * 7) * 0.03); ctx.quadraticCurveTo(cx + 0.05, cy - len * 0.4, cx + 0.2, cy - 0.05); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, cy, 0, cy - len, PAL.cape); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 0.7; ctx.stroke();
  }
  // 胴
  const t0 = J.hip, t1 = J.neck;
  const nx = -(t1[1] - t0[1]), ny = t1[0] - t0[0], nl = Math.hypot(nx, ny) || 1; // 胴の法線（前方向）
  const fx = nx / nl, fy = ny / nl;
  const w0 = 0.23, w1 = 0.29;
  const torso = [[t0[0] - fx * w0, t0[1] - fy * w0], [t0[0] + fx * w0 * 0.9, t0[1] + fy * w0 * 0.9], [t1[0] + fx * w1, t1[1] + fy * w1 - 0.02], [t1[0] - fx * w1 * 0.9, t1[1] - fy * w1 * 0.9]];
  if (armor) {
    poly(ctx, torso, lin(ctx, t1[0] - 0.25, t1[1], t1[0] + 0.25, t0[1], [PAL.steel[0], PAL.steel[1], PAL.steel[3]]), PAL.outline, OL);
    // 胸当ての稜線と腰の板（草摺）
    seg(ctx, [lerp(t0[0], t1[0], 0.35) + fx * 0.05, lerp(t0[1], t1[1], 0.35)], [t1[0] + fx * 0.12, t1[1] - 0.04], 0.03, 'rgba(255,255,255,0.7)');
    for (let i = 0; i < 2; i++) { const yy = t0[1] - 0.02 - i * 0.09; poly(ctx, [[t0[0] - 0.21, yy + 0.07], [t0[0] + 0.22, yy + 0.07], [t0[0] + 0.2, yy - 0.04], [t0[0] - 0.19, yy - 0.04]], i ? PAL.steel[2] : PAL.steel[1], PAL.outline, OL * 0.7); }
    ell(ctx, t0[0], t0[1] + 0.02, 0.04, 0.04, PAL.gold);
    // 肩当て
    ell(ctx, J.sh[0] + 0.03, J.sh[1] - 0.02, 0.15, 0.11, PAL.steel[1], -0.3);
  } else {
    poly(ctx, torso, lin(ctx, 0, t1[1], 0, t0[1], PAL.tunic), PAL.outline, OL);
    poly(ctx, [[t0[0] - 0.19, t0[1] + 0.02], [t0[0] + 0.19, t0[1] + 0.02], [t0[0] + 0.17, t0[1] - 0.1], [t0[0] - 0.17, t0[1] - 0.1]], '#4a3322', PAL.outline, OL * 0.6);
  }
  // 前の脚
  limbDraw(ctx, J.hip, J.legF, armor ? PAL.steel[1] : '#3b3242', armor ? 0.18 : 0.15, false, armor);
  // 頭
  drawHead(ctx, J.neck, J.head, P, armor, time, p);
  // 前の腕（投げの瞬間は武器を握る）
  armDraw(ctx, J.sh, J.armF, armor ? PAL.steel[1] : PAL.skin[0], armor, false);
  if (P.throwK > 0.2 && opt.weapon) {
    const hand = J.armF[1];
    ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(Math.atan2(hand[1] - J.armF[0][1], hand[0] - J.armF[0][0]) - Math.PI / 2 + 0.6); drawWeaponHeld(ctx, opt.weapon); ctx.restore();
  }
  if (P.dead > 0.3) { // 鎧の破片が散る代わりに、倒れた体から魂がにじむ
    ctx.globalAlpha = (P.dead - 0.3) * 0.6; ell(ctx, J.neck[0], J.neck[1] + P.dead * 0.6, 0.18, 0.26, 'rgba(190,220,255,0.6)'); ctx.globalAlpha = 1;
  }
}
const lerp = (a, b, t) => a + (b - a) * t;
function limbDraw(ctx, hip, leg, col, w, back, armor) {
  const [knee, foot] = leg;
  seg(ctx, hip, knee, w + OL * 2, PAL.outline); seg(ctx, knee, foot, w * 0.92 + OL * 2, PAL.outline);
  seg(ctx, hip, knee, w, col); seg(ctx, knee, foot, w * 0.92, col);
  if (armor) { ell(ctx, knee[0] + 0.03, knee[1], 0.08, 0.08, back ? PAL.steel[2] : PAL.steel[0]); }
  // 足（向いている方向へ伸びる靴）
  poly(ctx, [[foot[0] - 0.08, foot[1] + 0.06], [foot[0] + 0.17, foot[1] + 0.03], [foot[0] + 0.18, foot[1] - 0.05], [foot[0] - 0.09, foot[1] - 0.05]], armor ? (back ? PAL.steel[3] : PAL.steel[2]) : '#3a2618', PAL.outline, OL * 0.8);
}
function armDraw(ctx, sh, arm, col, armor, back) {
  const [el, hand] = arm;
  seg(ctx, sh, el, 0.13 + OL * 2, PAL.outline); seg(ctx, el, hand, 0.12 + OL * 2, PAL.outline);
  seg(ctx, sh, el, 0.13, col); seg(ctx, el, hand, 0.12, armor ? (back ? PAL.steel[3] : PAL.steel[2]) : col);
  ell(ctx, hand[0], hand[1], 0.075, 0.075, armor ? (back ? '#39424f' : '#56637a') : PAL.skin[back ? 1 : 0]);
}
function drawHead(ctx, neck, head, P, armor, time, p) {
  const [hx, hy] = head;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-(P.lean + P.head) * 0.6); ctx.scale(1.22, 1.22); // 小さな表示でも兜と顔の向きが分かるよう、頭を大きめに
  if (armor) {
    // 兜: 丸い鉢・前へ突き出た面頬・のぞき穴・頭頂の赤い羽根
    ctx.beginPath(); ctx.moveTo(-0.19, -0.12); ctx.quadraticCurveTo(-0.24, 0.22, 0.02, 0.24); ctx.quadraticCurveTo(0.24, 0.22, 0.25, 0.0); ctx.lineTo(0.27, -0.1); ctx.quadraticCurveTo(0.05, -0.2, -0.19, -0.12); ctx.closePath();
    ctx.fillStyle = lin(ctx, -0.2, 0.25, 0.25, -0.15, [PAL.steel[0], PAL.steel[1], PAL.steel[3]]); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    ctx.fillStyle = '#0c1018'; ctx.beginPath(); ctx.moveTo(0.04, 0.03); ctx.lineTo(0.27, 0.02); ctx.lineTo(0.26, -0.03); ctx.lineTo(0.05, -0.02); ctx.fill();
    ctx.fillStyle = 'rgba(160,220,255,0.9)'; ctx.fillRect(0.17, -0.01, 0.05, 0.02); // 目の光
    seg(ctx, [-0.05, 0.23], [0.2, 0.12], 0.025, 'rgba(255,255,255,0.75)');
    // 羽根
    const pl = P.plume;
    ctx.beginPath(); ctx.moveTo(-0.02, 0.22); ctx.quadraticCurveTo(-0.2 - pl * 0.3, 0.46, -0.42 - pl * 0.4, 0.3 + pl * 0.2); ctx.quadraticCurveTo(-0.22, 0.32, -0.08, 0.18); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 0.4, -0.4, 0.2, PAL.plume); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 0.6; ctx.stroke();
  } else {
    // 素顔: 驚いた顔（鎧を失った情けなさを少し誇張）
    ell(ctx, 0.03, 0.02, 0.19, 0.2, PAL.skin[0]); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.2, 0.04); ctx.quadraticCurveTo(-0.1, 0.3, 0.16, 0.2); ctx.quadraticCurveTo(0.05, 0.12, -0.2, 0.04); ctx.fillStyle = PAL.hair; ctx.fill();
    ell(ctx, 0.12, 0.04, 0.035, 0.05, '#fff'); ell(ctx, 0.13, 0.04, 0.018, 0.025, '#111');
    ell(ctx, 0.15, -0.1, 0.04, 0.03, '#7a2a2a');
    ell(ctx, 0.21, 0.0, 0.05, 0.04, PAL.skin[1]);
  }
  ctx.restore();
}
function drawKnightBack(ctx, P, J, armor, time) {
  // はしごを登る後ろ姿
  limbDraw(ctx, J.hip, J.legB, armor ? PAL.steel[2] : PAL.cloth, 0.17, true, armor);
  limbDraw(ctx, J.hip, J.legF, armor ? PAL.steel[2] : PAL.cloth, 0.17, true, armor);
  const t0 = J.hip, t1 = J.neck;
  poly(ctx, [[t0[0] - 0.22, t0[1]], [t0[0] + 0.22, t0[1]], [t1[0] + 0.26, t1[1]], [t1[0] - 0.26, t1[1]]], armor ? lin(ctx, -0.3, 0, 0.3, 0, [PAL.steel[2], PAL.steel[0], PAL.steel[2]]) : PAL.tunic[0], PAL.outline, OL);
  if (armor) { ctx.globalAlpha = 0.9; poly(ctx, [[t1[0] - 0.22, t1[1]], [t1[0] + 0.22, t1[1]], [t0[0] + 0.25, t0[1] - 0.15], [t0[0] - 0.25, t0[1] - 0.12]], lin(ctx, 0, t1[1], 0, t0[1], PAL.cape)); ctx.globalAlpha = 1; }
  for (const a of [J.armF, J.armB]) { const sh = [J.sh[0] + (a === J.armF ? 0.16 : -0.16), J.sh[1]]; const arm = [[sh[0] + (a === J.armF ? 0.06 : -0.06), a[0][1]], [sh[0] + (a === J.armF ? 0.05 : -0.05), a[1][1]]]; armDraw(ctx, sh, arm, armor ? PAL.steel[1] : PAL.skin[0], armor, false); }
  ctx.save(); ctx.translate(J.head[0], J.head[1]);
  ell(ctx, 0, 0.02, 0.2, 0.21, armor ? lin(ctx, -0.2, 0, 0.2, 0, [PAL.steel[2], PAL.steel[0], PAL.steel[2]]) : PAL.hair); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
  if (armor) { ctx.fillStyle = PAL.plume[0]; ctx.beginPath(); ctx.ellipse(0, 0.25, 0.06, 0.12, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
}
export function drawWeaponHeld(ctx, w) {
  ctx.save(); ctx.scale(0.8, 0.8);
  if (w === 'lance') { seg(ctx, [0, -0.5], [0, 0.6], 0.07, '#8a6a3c'); poly(ctx, [[0, 0.95], [-0.08, 0.6], [0.08, 0.6]], '#e8f0f8', PAL.outline, 0.03); }
  else if (w === 'dagger') { poly(ctx, [[0, 0.45], [-0.05, 0.08], [0.05, 0.08]], '#eef4fb', PAL.outline, 0.03); seg(ctx, [-0.1, 0.06], [0.1, 0.06], 0.05, PAL.gold); }
  else if (w === 'axe') { seg(ctx, [0, -0.2], [0, 0.5], 0.06, '#7a4e26'); poly(ctx, [[0, 0.45], [0.28, 0.55], [0.3, 0.2], [0, 0.3]], '#cfd8e2', PAL.outline, 0.03); }
  else if (w === 'torch') { seg(ctx, [0, -0.2], [0, 0.3], 0.07, '#6b4320'); ell(ctx, 0, 0.4, 0.1, 0.14, '#ffb347'); }
  ctx.restore();
}

// ================================================================ プレイヤーの武器（飛んでいる）
export function drawShot(ctx, s, time) {
  if (s.kind === 'lance') {
    seg(ctx, [-0.62, 0], [0.32, 0], 0.075 + OL, PAL.outline); seg(ctx, [-0.62, 0], [0.32, 0], 0.075, '#9a7a46');
    poly(ctx, [[0.62, 0], [0.28, -0.1], [0.32, 0], [0.28, 0.1]], lin(ctx, 0, 0.1, 0, -0.1, ['#ffffff', '#9fb6cc']), PAL.outline, 0.025);
    ctx.globalAlpha = 0.35; seg(ctx, [-1.1, 0], [-0.62, 0], 0.04, '#cfe6ff'); ctx.globalAlpha = 1;
  } else if (s.kind === 'dagger') {
    poly(ctx, [[0.38, 0], [0.0, -0.07], [0.0, 0.07]], lin(ctx, 0, 0.07, 0, -0.07, ['#ffffff', '#aebfd2']), PAL.outline, 0.025);
    seg(ctx, [-0.02, -0.11], [-0.02, 0.11], 0.05, PAL.gold); seg(ctx, [-0.25, 0], [-0.02, 0], 0.05, '#5a3a22');
    ctx.globalAlpha = 0.3; seg(ctx, [-0.9, 0], [-0.3, 0], 0.03, '#ffffff'); ctx.globalAlpha = 1;
  } else if (s.kind === 'axe') {
    ctx.save(); ctx.rotate(-s.t * 14);
    seg(ctx, [0, -0.32], [0, 0.32], 0.07, '#7a4e26');
    poly(ctx, [[0, 0.28], [0.3, 0.38], [0.32, 0.02], [0, 0.12]], lin(ctx, 0, 0.4, 0.3, 0, ['#ffffff', '#8fa2b8']), PAL.outline, 0.03);
    ctx.restore();
  } else if (s.kind === 'torch') {
    ctx.save(); ctx.rotate(-s.t * 10); seg(ctx, [0, -0.2], [0, 0.18], 0.08, '#6b4320'); ctx.restore();
    fireBlob(ctx, 0, 0.05, 0.22, time);
  }
}
export function fireBlob(ctx, x, y, r, time, k = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, `rgba(255,240,170,${0.9 * k})`); g.addColorStop(0.35, `rgba(255,140,40,${0.7 * k})`); g.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}
export function drawBurn(ctx, f, time) {
  const k = Math.min(1, f.t / 0.3, (f.life - f.t) / 0.15 + 0.2);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const ph = time * 9 + i * 1.7, x = (i - 2.5) * 0.26 + Math.sin(ph) * 0.05, h = (0.6 + 0.4 * Math.sin(ph * 1.3)) * f.h * k;
    ctx.beginPath(); ctx.moveTo(x - 0.16, 0); ctx.quadraticCurveTo(x - 0.12, h * 0.6, x + Math.sin(ph) * 0.08, h); ctx.quadraticCurveTo(x + 0.12, h * 0.5, x + 0.16, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,245,190,0.95)'); g.addColorStop(0.4, 'rgba(255,150,40,0.85)'); g.addColorStop(1, 'rgba(200,30,10,0)');
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}

// ================================================================ 敵
const EYE = (ctx, x, y, r, col = '#ffe14d') => { ell(ctx, x, y, r * 2.2, r * 2.2, 'rgba(255,220,90,0.18)'); ell(ctx, x, y, r, r, col); };
export function drawEnemy(ctx, e, time) {
  const A = enemyAnim(e, time);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (A.dead > 0) { ctx.globalAlpha = 1 - A.dead; ctx.translate(0, A.dead * 0.3); ctx.scale(1 + A.dead * 0.4, 1 - A.dead * 0.6); }
  ctx.translate(A.shake, 0);
  const fn = ENEMY_ART[e.type];
  fn && fn(ctx, e, A, time);
  if (A.flash > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,255,255,${A.flash * 0.85})`; ctx.fillRect(-2, -1, 4, 4); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1;
}
const ENEMY_ART = {
  // 亡者: 前かがみの腐った体、ぼろ布、前へ伸ばした腕。土の盛り上がりから這い出す
  ghoul(ctx, e, A, time) {
    let rise = 1;
    if (e.st === 'emerge') rise = Math.min(1, e.t / 0.7);
    if (e.st === 'sink') rise = 1 - Math.min(1, e.t / 0.6);
    if (rise < 1) { ctx.save(); ctx.beginPath(); ctx.rect(-2, 0, 4, 4); ctx.clip(); ctx.translate(0, -1.6 * (1 - rise)); }
    const w = A.walk * 1.6, s = Math.sin(w);
    seg(ctx, [0, 0.75], [-0.18 + 0.15 * s, 0.02], 0.15, '#3a4a3a'); seg(ctx, [0, 0.75], [0.12 - 0.15 * s, 0.02], 0.17, '#4d6450');
    poly(ctx, [[-0.25, 0.7], [0.25, 0.75], [0.35, 1.25], [0.05, 1.42], [-0.28, 1.2]], lin(ctx, 0, 1.4, 0, 0.7, ['#7f9a78', '#4a5f48']), PAL.outline, OL);
    poly(ctx, [[-0.28, 0.72], [0.28, 0.76], [0.22, 0.48], [0.1, 0.62], [-0.05, 0.42], [-0.2, 0.6]], '#3d2f3a', PAL.outline, OL * 0.6); // ぼろ布
    const reach = 0.2 * Math.sin(time * 4 + e.phase);
    seg(ctx, [0.2, 1.25], [0.62 + reach, 1.05], 0.11, '#6f8a68'); seg(ctx, [0.1, 1.2], [0.5 - reach, 0.95], 0.1, '#5a7356');
    ell(ctx, 0.28, 1.5, 0.21, 0.19, lin(ctx, 0, 1.7, 0, 1.3, ['#9ab493', '#5d7758'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    EYE(ctx, 0.36, 1.53, 0.04, '#d8ff6a'); ell(ctx, 0.38, 1.4, 0.07, 0.035, '#2a1a1a');
    if (rise < 1) ctx.restore();
    if (e.st === 'emerge' || e.st === 'sink') { // 土の盛り上がり
      const k = e.st === 'emerge' ? Math.min(1, e.t / 0.35) : 1 - Math.min(1, e.t / 0.6);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.6 * k, 0.28 * k, 0, Math.PI, 0, true); ctx.fillStyle = '#4b3a2a'; ctx.fill();
      for (let i = 0; i < 4; i++) ell(ctx, (i - 1.5) * 0.25 * k, 0.12 * k + Math.sin(time * 20 + i) * 0.03, 0.06, 0.05, '#6a5238');
    }
  },
  // 骸骨兵: 骨・あばら・赤い目。骨を掲げて投げる
  skeleton(ctx, e, A, time) {
    const w = A.walk * 1.4, s = e.st === 'walk' ? Math.sin(w) : 0, bone = '#e8e0c8', dk = '#a89e84';
    seg(ctx, [0, 0.78], [-0.15 + 0.2 * s, 0], 0.07, dk); seg(ctx, [0, 0.78], [0.12 - 0.2 * s, 0], 0.08, bone);
    ell(ctx, 0, 0.8, 0.14, 0.07, bone);
    seg(ctx, [0, 0.8], [0.02, 1.35], 0.06, dk);
    for (let i = 0; i < 4; i++) { const y = 1.0 + i * 0.1; ctx.beginPath(); ctx.ellipse(0.03, y, 0.18 - i * 0.01, 0.05, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = bone; ctx.lineWidth = 0.035; ctx.stroke(); }
    const raise = e.st === 'windup' ? Math.min(1, e.t / 0.4) : e.st === 'recover' ? Math.max(0, 1 - e.t * 4) : 0;
    const ha = -0.4 + raise * 2.6;
    const hx = 0.05 + Math.sin(ha) * 0.45, hy = 1.3 - Math.cos(ha) * 0.45;
    seg(ctx, [0.05, 1.32], [hx, hy], 0.06, bone);
    if (raise > 0.2) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(time * 3); drawBoneShape(ctx); ctx.restore(); }
    seg(ctx, [-0.05, 1.32], [-0.2, 0.95], 0.05, dk);
    // 頭蓋
    ell(ctx, 0.05, 1.56, 0.19, 0.18, lin(ctx, 0, 1.75, 0, 1.4, ['#fffbea', '#c9bea0'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    ctx.fillStyle = '#1a1010'; ell(ctx, 0.1, 1.58, 0.06, 0.06, '#1a1010'); ell(ctx, -0.04, 1.58, 0.05, 0.055, '#1a1010');
    EYE(ctx, 0.11, 1.58, 0.025, '#ff4030');
    ctx.fillStyle = '#e8e0c8'; ctx.fillRect(0.0, 1.38, 0.2, 0.08); for (let i = 0; i < 4; i++) { ctx.fillStyle = '#3a2a20'; ctx.fillRect(0.02 + i * 0.05, 1.38, 0.012, 0.08); }
  },
  // 夜魔: 蝙蝠の翼・角・大きな笑い口。急降下の前に翼を広げて光る
  imp(ctx, e, A, time) {
    const warn = e.st === 'warn', dive = e.st === 'dive';
    const flap = Math.sin(time * (warn ? 30 : 14) + e.phase) * (dive ? 0.2 : 1);
    if (warn) ell(ctx, 0, 0.4, 0.9, 0.7, `rgba(255,80,120,${0.2 + 0.2 * Math.sin(time * 30)})`);
    for (const side of [-1, 1]) {
      const span = dive ? 0.55 : 0.95, up = 0.35 + flap * 0.4 * (warn ? 1.3 : 1);
      ctx.beginPath(); ctx.moveTo(0, 0.45); ctx.lineTo(side * span * 0.5, 0.45 + up); ctx.lineTo(side * span, 0.3 + up * 0.6);
      ctx.quadraticCurveTo(side * span * 0.8, 0.2, side * span * 0.62, 0.28); ctx.quadraticCurveTo(side * span * 0.45, 0.12, side * span * 0.3, 0.25); ctx.quadraticCurveTo(side * 0.18, 0.2, 0, 0.35); ctx.closePath();
      ctx.fillStyle = side > 0 ? '#5a1f4a' : '#3d1434'; ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 0.7; ctx.stroke();
    }
    ell(ctx, 0, 0.38, 0.22, 0.26, lin(ctx, 0, 0.6, 0, 0.1, ['#e04a5a', '#7d1f3a'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    poly(ctx, [[0.08, 0.58], [0.2, 0.86], [0.18, 0.56]], '#f3d6a0'); poly(ctx, [[-0.08, 0.58], [-0.1, 0.86], [-0.16, 0.55]], '#d8b880');
    EYE(ctx, 0.1, 0.45, 0.04); ctx.beginPath(); ctx.arc(0.06, 0.32, 0.12, Math.PI * 0.05, Math.PI * 0.95); ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 0.03; ctx.stroke();
    seg(ctx, [-0.05, 0.12], [-0.25, -0.12 + flap * 0.04], 0.04, '#7d1f3a'); poly(ctx, [[-0.25, -0.12], [-0.33, -0.08], [-0.27, -0.2]], '#7d1f3a');
  },
  // 牙獣: 黒い毛並み・牙・光る目。溜めで身を沈めて前足で土をかく
  beast(ctx, e, A, time) {
    const wind = e.st === 'windup', ch = e.st === 'charge', rec = e.st === 'recover';
    const crouch = wind ? 0.18 * Math.min(1, e.t * 3) : 0, run = ch ? Math.sin(time * 26) : Math.sin(A.walk * 2) * 0.3;
    ctx.translate(0, -crouch);
    for (const [x, ph, c] of [[-0.5, 0, '#2a2026'], [0.45, Math.PI, '#2a2026'], [-0.35, Math.PI * 0.5, '#3c2f36'], [0.6, Math.PI * 1.5, '#3c2f36']]) {
      const a = ch ? Math.sin(time * 26 + ph) * 0.8 : wind && x > 0 ? Math.sin(time * 18) * 0.4 : run * 0.4;
      seg(ctx, [x, 0.5], [x + Math.sin(a) * 0.3, 0.02 + crouch], 0.13, c);
    }
    ctx.beginPath(); ctx.moveTo(-0.75, 0.5); ctx.quadraticCurveTo(-0.6, 1.02, 0.1, 0.98); ctx.quadraticCurveTo(0.55, 1.05, 0.72, 0.8); ctx.lineTo(0.68, 0.42); ctx.quadraticCurveTo(0, 0.3, -0.75, 0.5); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 1.0, 0, 0.3, ['#5a4652', '#241a20']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    for (let i = 0; i < 6; i++) poly(ctx, [[-0.5 + i * 0.18, 0.95], [-0.45 + i * 0.18, 1.15 + (i % 2) * 0.05], [-0.38 + i * 0.18, 0.95]], '#1a1216'); // たてがみ
    ctx.save(); ctx.translate(0.78, 0.72); ctx.rotate(wind ? 0.25 : ch ? -0.15 : 0);
    poly(ctx, [[-0.15, 0.18], [0.35, 0.08], [0.42, -0.1], [-0.1, -0.2]], '#3e2f38', PAL.outline, OL);
    poly(ctx, [[0.28, -0.1], [0.36, 0.12], [0.22, -0.05]], '#f4ecd6'); poly(ctx, [[0.1, -0.13], [0.14, 0.08], [0.04, -0.12]], '#f4ecd6');
    EYE(ctx, 0.12, 0.08, 0.04, wind || ch ? '#ff5030' : '#ffe14d');
    poly(ctx, [[-0.1, 0.18], [0.0, 0.38], [0.05, 0.15]], '#2a2026');
    ctx.restore();
    if (rec) for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; ell(ctx, 0.75 + Math.cos(a) * 0.3, 1.2 + Math.sin(a) * 0.08, 0.05, 0.05, '#ffe14d'); } // 目を回す星
    if (ch) { ctx.globalAlpha = 0.4; for (let i = 0; i < 3; i++) seg(ctx, [-0.9 - i * 0.25, 0.4 + i * 0.2], [-1.4 - i * 0.25, 0.4 + i * 0.2], 0.04, '#d8c8b0'); ctx.globalAlpha = 1; }
  },
  // 術者: 頭巾の長衣・仮面・光る手。詠唱で光の輪が縮む
  caster(ctx, e, A, time) {
    let a = 1; if (e.st === 'appear') a = Math.min(1, e.t / 0.45); if (e.st === 'vanish') a = 1 - Math.min(1, e.t / 0.4); if (e.st === 'hidden') a = 0;
    ctx.globalAlpha *= a;
    const hover = Math.sin(time * 2.5) * 0.04;
    ctx.translate(0, hover);
    ctx.beginPath(); ctx.moveTo(-0.38, 0.02); ctx.quadraticCurveTo(-0.3, 0.9, -0.2, 1.3); ctx.quadraticCurveTo(0.05, 1.75, 0.28, 1.35); ctx.quadraticCurveTo(0.36, 0.8, 0.42, 0.02);
    for (let i = 0; i < 5; i++) ctx.lineTo(0.42 - i * 0.2, 0.02 + (i % 2) * 0.08);
    ctx.closePath(); ctx.fillStyle = lin(ctx, 0, 1.7, 0, 0, ['#6b3fa0', '#2a1648']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    ell(ctx, 0.12, 1.3, 0.13, 0.15, '#e8dcc0'); ctx.fillStyle = '#1a1020'; ctx.fillRect(0.12, 1.32, 0.1, 0.03); ctx.fillRect(0.0, 1.32, 0.07, 0.03);
    seg(ctx, [0.18, 1.18], [0.26, 1.2], 0.02, '#1a1020');
    const cast = e.st === 'cast' ? Math.min(1, e.t / 0.85) : 0;
    const hx = 0.45 + cast * 0.1, hy = 1.0 + cast * 0.15;
    seg(ctx, [0.15, 1.05], [hx, hy], 0.1, '#4a2a78');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 0.1 + cast * 0.2 + 0.03 * Math.sin(time * 20);
    const g = ctx.createRadialGradient(hx + 0.08, hy, 0, hx + 0.08, hy, r * 2); g.addColorStop(0, 'rgba(255,220,255,0.95)'); g.addColorStop(0.4, 'rgba(190,90,255,0.6)'); g.addColorStop(1, 'rgba(120,40,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx + 0.08, hy, r * 2, 0, TAU); ctx.fill();
    if (cast > 0) { ctx.strokeStyle = `rgba(220,160,255,${0.8 * cast})`; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(hx + 0.08, hy, 0.9 - cast * 0.7, 0, TAU); ctx.stroke(); }
    ctx.restore();
  },
  // 跳ね鬼: ずんぐりした角のある蛙の鬼。跳ぶ前に身を縮め、着地点に影
  hopper(ctx, e, A, time) {
    if (e.st === 'under') return;
    if (e.st === 'bubble') { for (let i = 0; i < 4; i++) { const t = (time * 2 + i * 0.25) % 1; ell(ctx, (i - 1.5) * 0.25, 1.4 + t * 0.4, 0.07 * (1 - t), 0.07 * (1 - t), 'rgba(200,240,255,0.8)'); } return; }
    const air = e.st === 'hop' || e.st === 'leap';
    const sq = e.st === 'wait' ? 1 - 0.18 * Math.min(1, e.t / 0.6) : air ? 1.12 : 1;
    ctx.scale(1 / Math.sqrt(sq), sq);
    for (const s of [-1, 1]) seg(ctx, [s * 0.25, 0.25], [s * (air ? 0.4 : 0.45), air ? -0.05 : 0.02], 0.14, '#3e6a2a');
    ell(ctx, 0, 0.42, 0.45, 0.36, lin(ctx, 0, 0.8, 0, 0.05, ['#7cbf4a', '#355e22'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    ell(ctx, 0.05, 0.3, 0.3, 0.2, '#e8d27a');
    poly(ctx, [[0.18, 0.72], [0.32, 1.02], [0.3, 0.68]], '#e8e0c0'); poly(ctx, [[-0.18, 0.7], [-0.26, 0.98], [-0.3, 0.64]], '#c8c0a0');
    ell(ctx, 0.22, 0.66, 0.11, 0.11, '#fff8d0'); ell(ctx, 0.25, 0.66, 0.05, 0.07, '#1a1a10');
    ctx.beginPath(); ctx.moveTo(0.0, 0.42); ctx.quadraticCurveTo(0.25, 0.32, 0.45, 0.45); ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 0.03; ctx.stroke();
  },
  // 鉄塊鬼: 角の兜・牙・鉄の棍棒。振りかぶり → 叩きつけ → 長い硬直
  brute(ctx, e, A, time) {
    const wind = e.st === 'windup' ? Math.min(1, e.t / 0.6) : 0, smash = e.st === 'smash', rec = e.st === 'recover';
    const w = A.walk, s = e.st === 'walk' ? Math.sin(w) : 0;
    seg(ctx, [-0.25, 0.85], [-0.3 + s * 0.15, 0.02], 0.26, '#4a3a3a'); seg(ctx, [0.2, 0.85], [0.25 - s * 0.15, 0.02], 0.28, '#5a4848');
    poly(ctx, [[-0.6, 0.8], [0.55, 0.8], [0.62, 1.6], [0.25, 1.9], [-0.45, 1.85], [-0.66, 1.4]], lin(ctx, 0, 1.9, 0, 0.8, ['#8a6a6a', '#4a3434']), PAL.outline, OL);
    poly(ctx, [[-0.5, 1.15], [0.5, 1.15], [0.45, 1.6], [-0.45, 1.6]], lin(ctx, -0.5, 0, 0.5, 0, ['#5d6670', '#a8b2bc', '#5d6670']), PAL.outline, OL * 0.8); // 胸の鉄板
    for (let i = 0; i < 3; i++) ell(ctx, -0.3 + i * 0.3, 1.38, 0.04, 0.04, '#d8dde2');
    ctx.save(); ctx.translate(0.15, 2.0);
    ell(ctx, 0, 0, 0.28, 0.24, lin(ctx, 0, 0.25, 0, -0.2, ['#b4bcc6', '#5d6670'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    poly(ctx, [[-0.22, 0.12], [-0.45, 0.42], [-0.15, 0.2]], '#e8e0c8'); poly(ctx, [[0.18, 0.14], [0.36, 0.45], [0.1, 0.2]], '#e8e0c8');
    ctx.fillStyle = '#0e0a0a'; ctx.fillRect(0.02, -0.05, 0.26, 0.08); EYE(ctx, 0.2, -0.01, 0.03, rec ? '#888' : '#ff5030');
    poly(ctx, [[0.08, -0.18], [0.13, -0.05], [0.16, -0.18]], '#fff'); poly(ctx, [[0.2, -0.18], [0.24, -0.06], [0.27, -0.18]], '#fff');
    ctx.restore();
    // 棍棒
    const ang = smash ? 1.9 : wind ? -1.2 - wind * 1.0 + Math.sin(time * 40) * 0.05 * wind : rec ? 1.9 - Math.min(1, e.t) * 1.4 : 0.4;
    ctx.save(); ctx.translate(0.45, 1.55); ctx.rotate(-ang);
    seg(ctx, [0, 0], [0, 0.5], 0.14, '#7a5a5a');
    poly(ctx, [[-0.16, 0.45], [0.16, 0.45], [0.22, 1.25], [-0.22, 1.25]], lin(ctx, -0.2, 0, 0.2, 0, ['#3c434c', '#9aa4ae', '#3c434c']), PAL.outline, OL);
    for (let i = 0; i < 3; i++) { poly(ctx, [[0.2, 0.6 + i * 0.25], [0.34, 0.68 + i * 0.25], [0.2, 0.76 + i * 0.25]], '#cfd6dc'); poly(ctx, [[-0.2, 0.6 + i * 0.25], [-0.34, 0.68 + i * 0.25], [-0.2, 0.76 + i * 0.25]], '#cfd6dc'); }
    ctx.restore();
    if (smash) { ctx.globalAlpha = 0.6; ell(ctx, 1.4, 0.05, 0.9, 0.12, '#d8c8a8'); ctx.globalAlpha = 1; }
  },
  // 呪い石像: 台座の上の石の顔。口が赤く光ってから火を吐く
  turret(ctx, e, A, time) {
    const warn = e.st === 'warn' ? Math.min(1, e.t / 0.6) : 0;
    if (e.down) { ctx.scale(1, -1); ctx.translate(0, -1.2); }
    poly(ctx, [[-0.5, 0], [0.5, 0], [0.42, 0.3], [-0.42, 0.3]], lin(ctx, 0, 0.3, 0, 0, ['#8d8a96', '#4c4a56']), PAL.outline, OL);
    ctx.beginPath(); ctx.moveTo(-0.42, 0.3); ctx.quadraticCurveTo(-0.55, 1.1, -0.1, 1.25); ctx.quadraticCurveTo(0.45, 1.3, 0.5, 0.9); ctx.lineTo(0.55, 0.55); ctx.quadraticCurveTo(0.3, 0.3, 0.42, 0.3); ctx.closePath();
    ctx.fillStyle = lin(ctx, -0.4, 1.2, 0.5, 0.3, ['#b4b0bc', '#6c6876', '#3e3c48']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    poly(ctx, [[-0.3, 1.1], [-0.5, 1.5], [-0.12, 1.2]], '#7c7886', PAL.outline, OL * 0.6);
    ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.ellipse(0.28, 0.95, 0.09, 0.07, 0, 0, TAU); ctx.fill();
    EYE(ctx, 0.3, 0.95, 0.03 + warn * 0.02, warn ? '#ff6030' : '#ffb040');
    ctx.fillStyle = `rgb(${40 + warn * 215},${20 + warn * 60},20)`; ctx.beginPath(); ctx.ellipse(0.42, 0.62, 0.12, 0.08 + warn * 0.06, 0, 0, TAU); ctx.fill();
    if (warn > 0) fireBlob(ctx, 0.5, 0.62, 0.08 + warn * 0.1, time, warn);
  },
};
export function drawBoneShape(ctx) {
  seg(ctx, [-0.16, 0], [0.16, 0], 0.06, '#efe6cc');
  for (const x of [-0.18, 0.18]) for (const y of [-0.04, 0.04]) ell(ctx, x, y, 0.045, 0.045, '#efe6cc');
}

// ================================================================ 敵の弾
export function drawEShot(ctx, s, time) {
  const k = s.kind;
  if (k === 'bone') { ctx.rotate(s.t * 12); drawBoneShape(ctx); }
  else if (k === 'orb' || k === 'feather' && false) { glow(ctx, 0, 0, s.r * 1.1, [255, 200, 255], [160, 60, 230], time); }
  else if (k === 'fireball' || k === 'clod' && false) { glow(ctx, 0, 0, s.r * 1.1, [255, 240, 170], [255, 90, 20], time); }
  else if (k === 'water') { ell(ctx, 0, 0, s.r, s.r * 1.2, 'rgba(120,200,255,0.9)'); ell(ctx, -s.r * 0.3, s.r * 0.4, s.r * 0.3, s.r * 0.3, '#e8f8ff'); }
  else if (k === 'feather') { ctx.rotate(Math.atan2(s.vy, s.vx)); poly(ctx, [[0.32, 0], [0, 0.09], [-0.3, 0.03], [-0.3, -0.03], [0, -0.09]], lin(ctx, 0, 0.1, 0, -0.1, ['#f0c060', '#8a5a20']), PAL.outline, 0.02); }
  else if (k === 'clod') { ctx.rotate(s.t * 5); poly(ctx, [[-0.4, -0.2], [-0.1, -0.42], [0.35, -0.3], [0.42, 0.1], [0.1, 0.4], [-0.35, 0.25]], lin(ctx, 0, 0.4, 0, -0.4, ['#8a6a4a', '#4a3424']), PAL.outline, OL); }
  else if (k === 'wave') {
    const h = s.box.h, w = s.box.w;
    if (s.fire) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const ph = time * 14 + i; const hh = h * (0.7 + 0.3 * Math.sin(ph)); ctx.beginPath(); ctx.moveTo(-w / 2 + i * w / 4, 0); ctx.quadraticCurveTo(-w / 2 + i * w / 4 + 0.1, hh, -w / 2 + (i + 0.5) * w / 4, hh * 1.1); ctx.quadraticCurveTo(-w / 2 + (i + 1) * w / 4, hh * 0.4, -w / 2 + (i + 1) * w / 4, 0); ctx.fillStyle = 'rgba(255,140,40,0.85)'; ctx.fill(); } ctx.restore(); }
    else { for (let i = 0; i < 5; i++) poly(ctx, [[-w / 2 + i * w / 5, 0], [-w / 2 + (i + 0.5) * w / 5, h * (0.6 + 0.4 * ((i * 7) % 3) / 2)], [-w / 2 + (i + 1) * w / 5, 0]], i % 2 ? '#7a5a3a' : '#a8845a', PAL.outline, 0.02); }
  }
  else if (k === 'mark') { const a = 0.5 + 0.5 * Math.sin(time * 20); ctx.strokeStyle = `rgba(255,90,60,${0.5 + 0.5 * a})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(0, 0.03, 0.55, 0.12, 0, 0, TAU); ctx.stroke(); seg(ctx, [0, 0.2], [0, 1.0], 0.04, `rgba(255,90,60,${0.4 * a})`); }
  else if (k === 'pillar') {
    if (!s.active) { const a = 0.3 + 0.3 * Math.sin(time * 25); ctx.fillStyle = `rgba(190,150,255,${a * 0.5})`; ctx.fillRect(-0.5, 0, 1, 12); ctx.strokeStyle = `rgba(230,200,255,${a + 0.2})`; ctx.lineWidth = 0.04; ctx.strokeRect(-0.5, 0, 1, 12); }
    else { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(-0.6, 0, 0.6, 0); g.addColorStop(0, 'rgba(160,100,255,0)'); g.addColorStop(0.5, 'rgba(250,240,255,1)'); g.addColorStop(1, 'rgba(160,100,255,0)'); ctx.fillStyle = g; ctx.fillRect(-0.6, 0, 1.2, 12); ctx.restore(); }
  }
  else if (k === 'beam') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(0, 0, 0, s.box.h); g.addColorStop(0, 'rgba(255,60,40,0.2)'); g.addColorStop(0.5, 'rgba(255,240,220,1)'); g.addColorStop(1, 'rgba(255,60,40,0.2)'); ctx.fillStyle = g; ctx.fillRect(-s.box.w / 2, 0, s.box.w, s.box.h); ctx.restore(); }
  else glow(ctx, 0, 0, s.r || 0.25, [255, 220, 200], [255, 80, 60], time);
}
function glow(ctx, x, y, r, c0, c1, time) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const rr = r * (1 + 0.12 * Math.sin(time * 30));
  const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2); g.addColorStop(0, `rgba(${c0},1)`); g.addColorStop(0.35, `rgba(${c1},0.85)`); g.addColorStop(1, `rgba(${c1},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2, 0, TAU); ctx.fill(); ctx.restore();
}

// ================================================================ アイテム
export function drawItem(ctx, it, time) {
  const bob = Math.sin(time * 3 + (it.id || 0)) * 0.06 + 0.12;
  ctx.translate(0, bob);
  if (it.kind === 'weapon') {
    // 光る壺の上に武器
    glow(ctx, 0, 0.45, 0.25, [255, 250, 220], [255, 200, 90], time);
    ctx.save(); ctx.translate(0, 0.45); ctx.rotate(Math.PI / 2 - 0.5); drawWeaponHeld(ctx, it.weapon); ctx.restore();
  } else if (it.kind === 'treasure') {
    poly(ctx, [[-0.32, 0], [0.32, 0], [0.32, 0.36], [-0.32, 0.36]], lin(ctx, 0, 0.4, 0, 0, ['#c88a3a', '#6a4018']), PAL.outline, OL);
    poly(ctx, [[-0.34, 0.36], [0.34, 0.36], [0.28, 0.55], [-0.28, 0.55]], lin(ctx, 0, 0.55, 0, 0.36, ['#e0a84a', '#8a5a22']), PAL.outline, OL);
    ctx.fillStyle = PAL.gold; ctx.fillRect(-0.05, 0.25, 0.1, 0.18);
    const tw = 0.5 + 0.5 * Math.sin(time * 6); ell(ctx, 0.18, 0.6, 0.04 * tw, 0.12 * tw, '#fff6c0'); ell(ctx, 0.18, 0.6, 0.12 * tw, 0.04 * tw, '#fff6c0');
  } else if (it.kind === 'armor') {
    glow(ctx, 0, 0.45, 0.3, [220, 240, 255], [120, 170, 255], time);
    poly(ctx, [[-0.3, 0.75], [0.3, 0.75], [0.26, 0.25], [0, 0.12], [-0.26, 0.25]], lin(ctx, 0, 0.75, 0, 0.1, [PAL.steel[0], PAL.steel[2]]), PAL.outline, OL);
    seg(ctx, [0, 0.7], [0, 0.18], 0.03, 'rgba(255,255,255,0.8)');
  }
}

// ================================================================ ボス
export function drawBoss(ctx, b, time) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const flash = b.hitT > 0 ? b.hitT / 0.1 : 0;
  if (b.st === 'dying') { const k = Math.min(1, b.deadT / 2.4); ctx.globalAlpha = 1 - k * 0.9; ctx.translate(Math.sin(time * 50) * 0.08 * k, -k * 0.6); }
  BOSS_ART[b.type](ctx, b, time);
  if (flash > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`; ctx.fillRect(-4, -2, 8, 8); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1;
}
const W = (b, s) => b.st === s;
const BOSS_ART = {
  // 墓守ガルム: 巨大な猫背の墓掘り。頭巾・つぎはぎの外套・大シャベル・腰のランタン
  gravekeeper(ctx, b, time) {
    const wind = W(b, 'chargeWind') ? Math.min(1, b.t / 0.8) : 0, slamW = W(b, 'slamWind') ? Math.min(1, b.t / 0.7) : 0;
    const stun = W(b, 'stun'), charge = W(b, 'charge'), walk = Math.sin(time * 5);
    ctx.translate(0, -wind * 0.25);
    for (const [x, c, ph] of [[-0.5, '#2e2a26', 0], [0.4, '#3e3830', Math.PI]]) seg(ctx, [x, 1.2], [x + (charge ? Math.sin(time * 20 + ph) * 0.5 : walk * 0.15), 0.05], 0.42, c);
    ctx.beginPath(); ctx.moveTo(-1.1, 1.0); ctx.quadraticCurveTo(-1.3, 2.6, -0.2, 3.1); ctx.quadraticCurveTo(0.9, 3.2, 1.1, 2.2); ctx.lineTo(1.0, 1.0); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 3.1, 0, 1, ['#6a5a48', '#3a3028']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 1.5; ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 0.04; ctx.strokeRect(-0.8 + i * 0.6, 1.4 + (i % 2) * 0.6, 0.35, 0.3); }
    // 頭巾と顔
    ctx.save(); ctx.translate(0.65, 2.85); ctx.rotate(wind * 0.3);
    ell(ctx, 0, 0, 0.55, 0.5, '#4a3e32'); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 1.4; ctx.stroke();
    ell(ctx, 0.2, -0.08, 0.34, 0.3, '#c8b090');
    EYE(ctx, 0.3, 0.0, 0.07, wind || charge ? '#ff4020' : '#ffd040'); EYE(ctx, 0.05, 0.02, 0.05, wind || charge ? '#ff4020' : '#ffd040');
    ctx.beginPath(); ctx.moveTo(0.0, -0.22); ctx.quadraticCurveTo(0.25, -0.32 - wind * 0.1, 0.48, -0.2); ctx.strokeStyle = '#3a1a10'; ctx.lineWidth = 0.05; ctx.stroke();
    for (let i = 0; i < 3; i++) poly(ctx, [[0.08 + i * 0.13, -0.23], [0.12 + i * 0.13, -0.12], [0.16 + i * 0.13, -0.24]], '#f8f0d8');
    ctx.restore();
    // シャベル
    const sh = slamW ? -2.4 * slamW : W(b, 'slam') || W(b, 'recover') ? 0.9 : charge ? 1.2 : 0.3;
    ctx.save(); ctx.translate(0.9, 2.1); ctx.rotate(-sh);
    seg(ctx, [0, 0], [0, -2.0], 0.16, '#7a5a34');
    poly(ctx, [[-0.35, -1.9], [0.35, -1.9], [0.3, -2.7], [0, -2.9], [-0.3, -2.7]], lin(ctx, -0.3, 0, 0.3, 0, ['#5a636c', '#b8c2cc', '#5a636c']), PAL.outline, OL * 1.4);
    ctx.restore();
    // ランタン
    const lx = -0.9, ly = 1.5 + Math.sin(time * 3) * 0.05;
    seg(ctx, [-0.8, 1.9], [lx, ly + 0.3], 0.03, '#222');
    poly(ctx, [[lx - 0.17, ly - 0.25], [lx + 0.17, ly - 0.25], [lx + 0.2, ly + 0.25], [lx - 0.2, ly + 0.25]], '#2a2a2a', PAL.outline, OL);
    glow(ctx, lx, ly, 0.2 + wind * 0.15, [220, 255, 200], [90, 230, 120], time);
    if (stun) for (let i = 0; i < 4; i++) { const a = time * 5 + i * 1.57; ell(ctx, 0.65 + Math.cos(a) * 0.6, 3.5 + Math.sin(a) * 0.12, 0.08, 0.08, '#ffe14d'); }
  },
  // 宵の魔女ヘクセ: 箒に横座り・尖り帽・裂けた外套・鉤鼻。光の輪で斉射、急降下で着地
  witch(ctx, b, time) {
    const fan = W(b, 'fanWind') ? Math.min(1, b.t / 0.8) : 0, land = W(b, 'landed');
    ctx.translate(0, Math.sin(time * 4) * 0.05);
    if (!land) { seg(ctx, [-1.0, 0.55], [1.0, 0.75], 0.09, '#7a5a34'); for (let i = 0; i < 7; i++) seg(ctx, [-1.0, 0.55], [-1.5, 0.3 + i * 0.08 + Math.sin(time * 10 + i) * 0.03], 0.04, '#b89a50'); }
    ctx.beginPath(); ctx.moveTo(-0.5, 0.5); ctx.quadraticCurveTo(-0.6, 1.5, 0.0, 1.55); ctx.quadraticCurveTo(0.45, 1.5, 0.5, 0.6);
    for (let i = 0; i < 5; i++) ctx.lineTo(0.5 - i * 0.25, 0.5 - (i % 2) * 0.18 - Math.sin(time * 8 + i) * 0.05);
    ctx.closePath(); ctx.fillStyle = lin(ctx, 0, 1.6, 0, 0.3, ['#3a2a5a', '#150e24']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    ctx.save(); ctx.translate(0.1, 1.72);
    ell(ctx, 0.05, 0, 0.24, 0.24, '#9ac08a'); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    poly(ctx, [[0.2, 0.05], [0.48, -0.12], [0.22, -0.08]], '#8ab07a', PAL.outline, OL * 0.6);
    EYE(ctx, 0.14, 0.06, 0.04, '#ffe14d'); ctx.beginPath(); ctx.arc(0.1, -0.08, 0.1, 0.2, 2.6); ctx.strokeStyle = '#2a1010'; ctx.lineWidth = 0.03; ctx.stroke();
    poly(ctx, [[-0.42, 0.12], [0.5, 0.14], [0.05, 0.25]], '#1a1030'); poly(ctx, [[-0.2, 0.2], [0.25, 0.22], [-0.25 + Math.sin(time * 3) * 0.1, 1.0]], '#2a1a44', PAL.outline, OL * 0.7);
    ctx.restore();
    seg(ctx, [-0.05, 1.3], [-0.35, 0.9], 0.1, '#9ac08a'); for (let i = 0; i < 6; i++) seg(ctx, [-0.05, 1.3], [-0.5 + i * 0.05, 1.8], 0.04, '#8a8a9a');
    const hx = 0.55 + fan * 0.2, hy = 1.25 + fan * 0.2;
    seg(ctx, [0.2, 1.3], [hx, hy], 0.08, '#9ac08a');
    if (fan > 0) { glow(ctx, hx + 0.1, hy, 0.15 + fan * 0.2, [255, 210, 255], [200, 80, 255], time); ctx.strokeStyle = `rgba(230,170,255,${fan})`; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(hx + 0.1, hy, 1.4 - fan * 1.1, 0, TAU); ctx.stroke(); }
    if (land) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; ell(ctx, 0.1 + Math.cos(a) * 0.45, 2.15 + Math.sin(a) * 0.1, 0.06, 0.06, '#ffe14d'); }
  },
  // 沼獣ヌマヅチ: 鰭のある巨大な鯰の頭。潜る・波紋・跳び出し・岸で這う
  riverbeast(ctx, b, time) {
    if (W(b, 'submerged')) return;
    if (W(b, 'ripple')) return; // 波紋は地形側で描く
    const land = W(b, 'onLand'), open = land && b.t > 0.75 && b.t < 1.3 ? 1 : 0;
    const sw = Math.sin(time * 6) * 0.1;
    ctx.beginPath(); ctx.moveTo(-1.4, 0.2); ctx.quadraticCurveTo(-1.6 + sw, 1.0, -0.6, 1.6); ctx.quadraticCurveTo(0.6, 2.1, 1.35, 1.2); ctx.quadraticCurveTo(1.45, 0.4, 0.9, 0.1); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 2.0, 0, 0, ['#3f7a74', '#1a3a3c']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 1.4; ctx.stroke();
    ell(ctx, 0.3, 0.45, 1.0, 0.35, '#c8c890');
    for (let i = 0; i < 4; i++) poly(ctx, [[-1.0 + i * 0.45, 1.55 + i * 0.05], [-0.8 + i * 0.45, 2.05 + Math.sin(time * 5 + i) * 0.08], [-0.6 + i * 0.45, 1.6]], '#2a5a5a', PAL.outline, OL * 0.6);
    ell(ctx, 0.85, 1.3, 0.2, 0.2, '#f8f8d0'); ell(ctx, 0.9, 1.3, 0.09, 0.14, '#101010'); EYE(ctx, 0.92, 1.34, 0.02, '#fff');
    ctx.beginPath(); ctx.moveTo(1.3, 0.7); ctx.quadraticCurveTo(0.8, 0.6 - open * 0.4, 0.4, 0.75); ctx.strokeStyle = '#101818'; ctx.lineWidth = 0.08; ctx.stroke();
    if (open) ell(ctx, 1.0, 0.62, 0.25, 0.15, '#5a1a2a');
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(1.2, 0.8); ctx.quadraticCurveTo(1.7, 0.8 + s * 0.3 + sw, 2.0, 0.6 + s * 0.5); ctx.strokeStyle = '#2a4a48'; ctx.lineWidth = 0.05; ctx.stroke(); } // ひげ
  },
  // 翼の守護者: 青銅の羽根の梟頭の戦士。上空で狙い → 急降下 → 止まり木で息を整える
  warden(ctx, b, time) {
    const dw = W(b, 'diveWind') ? Math.min(1, b.t / 0.8) : 0, perch = W(b, 'perch'), dive = W(b, 'dive') || W(b, 'impact');
    const flap = perch ? 0.1 : dive ? -0.6 : Math.sin(time * 9) * 0.6 + dw * 0.8;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(0, 1.4); ctx.rotate(s * (0.3 + flap * 0.5)); ctx.scale(s, 1);
      for (let i = 0; i < 6; i++) poly(ctx, [[0.1, 0], [0.6 + i * 0.28, 0.4 - i * 0.05], [0.7 + i * 0.3, -0.25 - i * 0.12], [0.3 + i * 0.2, -0.2]], i % 2 ? '#a86a2a' : '#c88a3a', PAL.outline, OL * 0.6);
      ctx.restore();
    }
    poly(ctx, [[-0.45, 0.4], [0.45, 0.4], [0.55, 1.6], [0, 2.0], [-0.55, 1.6]], lin(ctx, 0, 2, 0, 0.4, ['#d8a858', '#6a4418']), PAL.outline, OL);
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = '#6a4418'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(0, 1.0 + i * 0.2, 0.3, 0.2, Math.PI - 0.2); ctx.stroke(); }
    for (const x of [-0.2, 0.2]) { seg(ctx, [x, 0.45], [x * 1.2, 0.05], 0.1, '#8a6a3a'); for (let k = -1; k <= 1; k++) seg(ctx, [x * 1.2, 0.05], [x * 1.2 + k * 0.1 + 0.05, -0.08], 0.03, '#2a2018'); }
    ctx.save(); ctx.translate(0, 2.1);
    ell(ctx, 0, 0, 0.45, 0.38, lin(ctx, 0, 0.4, 0, -0.3, ['#e8b868', '#8a5a20'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    poly(ctx, [[-0.4, 0.2], [-0.5, 0.6], [-0.2, 0.32]], '#8a5a20'); poly(ctx, [[0.4, 0.2], [0.5, 0.6], [0.2, 0.32]], '#8a5a20');
    for (const x of [-0.17, 0.17]) { ell(ctx, x, 0.03, 0.15, 0.15, '#fff2c0'); EYE(ctx, x + 0.03, 0.03, 0.06, dw ? '#ff3020' : '#1a1010'); }
    poly(ctx, [[0, -0.05], [0.08, -0.15], [0, -0.3], [-0.08, -0.15]], '#3a2a18');
    ctx.restore();
    if (dw > 0) { ctx.strokeStyle = `rgba(255,80,60,${0.3 + 0.4 * dw})`; ctx.lineWidth = 0.05; ctx.setLineDash([0.2, 0.15]); ctx.beginPath(); ctx.moveTo(0, 1.4); ctx.lineTo((b.tx - b.x) * (b.face || 1), -(b.y - b.floor)); ctx.stroke(); ctx.setLineDash([]); }
    if (perch) for (let i = 0; i < 3; i++) ell(ctx, (i - 1) * 0.3, 2.7 + Math.sin(time * 4 + i) * 0.1, 0.05, 0.05, 'rgba(255,255,255,0.6)');
  },
  // 炎騎士ヴァルグ: 炎をまとった黒鉄の騎士。剣を掲げると炎が走り、引いて構えると横薙ぎ
  flameknight(ctx, b, time) {
    const ww = W(b, 'waveWind') ? Math.min(1, b.t / 0.7) : 0, bw = W(b, 'ballWind') ? Math.min(1, b.t / 0.6) : 0, sw = W(b, 'slashWind') ? Math.min(1, b.t / 0.5) : 0;
    const slash = W(b, 'slash'), rec = W(b, 'recover');
    const walk = W(b, 'walk') ? Math.sin(time * 7) : 0;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { const ph = time * 8 + i * 1.3; const x = (i - 3) * 0.22, h = 0.6 + 0.3 * Math.sin(ph); ctx.beginPath(); ctx.moveTo(x - 0.2, 1.2); ctx.quadraticCurveTo(x, 1.2 + h * 1.6, x + Math.sin(ph) * 0.15, 2.6 + h); ctx.quadraticCurveTo(x + 0.1, 1.8, x + 0.2, 1.2); ctx.fillStyle = 'rgba(255,110,30,0.35)'; ctx.fill(); }
    ctx.restore();
    seg(ctx, [-0.25, 1.1], [-0.3 + walk * 0.2, 0.05], 0.24, '#2a2228'); seg(ctx, [0.2, 1.1], [0.25 - walk * 0.2, 0.05], 0.26, '#3a3036');
    poly(ctx, [[-0.5, 1.0], [0.5, 1.0], [0.6, 2.0], [0.3, 2.25], [-0.35, 2.25], [-0.6, 2.0]], lin(ctx, 0, 2.2, 0, 1.0, ['#4a4048', '#181418']), PAL.outline, OL);
    seg(ctx, [-0.3, 1.9], [0.4, 1.3], 0.05, '#ff7a2a');
    ctx.save(); ctx.translate(0.1, 2.5);
    poly(ctx, [[-0.28, -0.25], [0.32, -0.25], [0.36, 0.2], [0, 0.35], [-0.3, 0.2]], lin(ctx, 0, 0.35, 0, -0.25, ['#5a5058', '#201a20']), PAL.outline, OL);
    ctx.fillStyle = '#ff6a20'; ctx.fillRect(0.02, -0.02, 0.32, 0.07); poly(ctx, [[-0.2, 0.3], [-0.45, 0.7], [-0.1, 0.32]], '#2a2228'); poly(ctx, [[0.2, 0.32], [0.4, 0.72], [0.1, 0.33]], '#2a2228');
    ctx.restore();
    const ang = slash ? 1.6 : sw ? -1.2 * sw : ww ? -2.8 * ww : bw ? -2.0 * bw : rec ? 1.3 : 0.5;
    ctx.save(); ctx.translate(0.45, 1.9); ctx.rotate(-ang);
    seg(ctx, [0, 0], [0, -0.35], 0.08, '#2a2228'); seg(ctx, [-0.18, -0.35], [0.18, -0.35], 0.07, PAL.gold);
    poly(ctx, [[-0.08, -0.35], [0.08, -0.35], [0.05, -1.6], [0, -1.75], [-0.05, -1.6]], lin(ctx, -0.1, 0, 0.1, 0, ['#ff9a40', '#fff0c0', '#ff9a40']), PAL.outline, OL * 0.6);
    if (ww || bw) fireBlob(ctx, 0, -1.6, 0.2 + (ww + bw) * 0.2, time);
    ctx.restore();
    if (slash) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,180,80,0.8)'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.arc(0.5, 1.4, 1.5, -1.0, 1.1); ctx.stroke(); ctx.restore(); }
  },
  // 魔城の主ノクス: 角の冠・三つの目・広がる外套。段階で姿が崩れ、目が増える
  lord(ctx, b, time) {
    const ph = b.phase, ring = W(b, 'ringWind') ? Math.min(1, b.t / 0.8) : 0, sweepW = W(b, 'sweepWind') ? Math.min(1, b.t / 1.0) : 0, tired = W(b, 'tired');
    let alpha = 1; if (W(b, 'warpOut')) alpha = 1 - Math.min(1, b.t / 0.45); if (W(b, 'warpIn')) alpha = Math.min(1, b.t / 0.4);
    ctx.globalAlpha *= alpha;
    const sp = 1 + Math.sin(time * 2) * 0.05 + ring * 0.2;
    ctx.beginPath(); ctx.moveTo(0, 3.3); ctx.quadraticCurveTo(-1.6 * sp, 2.6, -1.9 * sp, 0.1);
    for (let i = 0; i < 8; i++) ctx.lineTo(-1.9 * sp + i * 0.48 * sp, 0.1 + (i % 2) * 0.3 + Math.sin(time * 5 + i) * 0.05);
    ctx.quadraticCurveTo(1.6 * sp, 2.6, 0, 3.3); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 3.3, 0, 0, ph >= 3 ? ['#5a1020', '#14040a'] : ['#2a1a4a', '#0a0612']); ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL * 1.5; ctx.stroke();
    ctx.strokeStyle = ph >= 2 ? '#ff4060' : '#8a6ad8'; ctx.lineWidth = 0.04; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-1.2 + i * 0.8, 0.4); ctx.quadraticCurveTo(-0.6 + i * 0.4, 1.6, -0.3 + i * 0.3, 2.6); ctx.stroke(); }
    ctx.save(); ctx.translate(0, 3.3);
    ell(ctx, 0, 0, 0.5, 0.55, lin(ctx, 0, 0.55, 0, -0.5, ['#d8d0e8', '#6a6080'])); ctx.strokeStyle = PAL.outline; ctx.lineWidth = OL; ctx.stroke();
    for (const s of [-1, 1]) poly(ctx, [[s * 0.3, 0.35], [s * 0.85, 1.2], [s * 0.45, 0.2]], '#2a2030', PAL.outline, OL * 0.6);
    for (let i = 0; i < 5; i++) poly(ctx, [[-0.4 + i * 0.2, 0.42], [-0.3 + i * 0.2, 0.75 + (i === 2 ? 0.2 : 0)], [-0.2 + i * 0.2, 0.42]], PAL.gold);
    const eyes = ph >= 2 ? [[-0.2, 0.05], [0.2, 0.05], [0, 0.25]] : [[-0.18, 0.05], [0.18, 0.05]];
    if (ph >= 3) eyes.push([-0.32, 0.22], [0.32, 0.22]);
    for (const [x, y] of eyes) EYE(ctx, x, y, 0.06 + sweepW * 0.04, sweepW ? '#ff3020' : '#ffd040');
    ctx.beginPath(); ctx.moveTo(-0.2, -0.25); ctx.quadraticCurveTo(0, -0.38 - ring * 0.1, 0.2, -0.25); ctx.strokeStyle = '#1a0a10'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.restore();
    const orbR = 0.25 + ring * 0.3 + Math.sin(time * 6) * 0.03;
    glow(ctx, 0, 1.7, orbR, [255, 230, 255], ph >= 3 ? [255, 60, 80] : [160, 80, 255], time);
    if (sweepW) { ctx.strokeStyle = `rgba(255,70,50,${0.4 + 0.5 * Math.sin(time * 30) ** 2})`; ctx.lineWidth = 0.06; const y = b.low ? 0.45 - (b.y - b.floor) : 1.33 - (b.y - b.floor); ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(30 * (b.dir * (b.face || 1)), y); ctx.stroke(); ctx.setLineDash([]); }
    if (tired) for (let i = 0; i < 3; i++) ell(ctx, (i - 1) * 0.4, 4.2 + Math.sin(time * 4 + i) * 0.1, 0.06, 0.06, 'rgba(255,255,255,0.5)');
  },
};
