// 月影の魔城 — 2D の絵（すべて手続き的なベクター描画。外部画像・既存作品の絵は使わない）
// 座標: 1u = 1 タイル、原点は足元中央、y 上、x は「向いている方向」が +（呼ぶ側で setTransform 済み）。
// 方針: 月光の青い縁取り・誇張した顔つき・2 段の陰影。予備動作は大きく、被弾は白く光る。

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

// 騎士と魔物は figures.js（作り直し版）
export { drawKnight, drawEnemy } from './figures.js';
import { boneShape, glowDot } from './figures.js';
// ボスの目: 発光（色は 16 進）
const EYE = (ctx, x, y, r, col = '#ffe14d') => { const n = parseInt(col.slice(1), 16); glowDot(ctx, x, y, r, `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`); };

export function drawWeaponHeld(ctx, w) {
  ctx.save(); ctx.scale(0.8, 0.8);
  if (w === 'lance') { seg(ctx, [0, -0.5], [0, 0.6], 0.07, '#8a6a3c'); poly(ctx, [[0, 0.95], [-0.08, 0.6], [0.08, 0.6]], '#e8f0f8', PAL.outline, 0.03); }
  else if (w === 'dagger') { poly(ctx, [[0, 0.45], [-0.05, 0.08], [0.05, 0.08]], '#eef4fb', PAL.outline, 0.03); seg(ctx, [-0.1, 0.06], [0.1, 0.06], 0.05, PAL.gold); }
  else if (w === 'axe') { seg(ctx, [0, -0.2], [0, 0.5], 0.06, '#7a4e26'); poly(ctx, [[0, 0.45], [0.28, 0.55], [0.3, 0.2], [0, 0.3]], '#cfd8e2', PAL.outline, 0.03); }
  else if (w === 'torch') { seg(ctx, [0, -0.2], [0, 0.3], 0.07, '#6b4320'); ell(ctx, 0, 0.4, 0.1, 0.14, '#ffb347'); }
  ctx.restore();
}

// ================================================================ プレイヤーの武器（飛んでいる）
import { drawShotNew, drawBurnNew, drawItemNew, drawEShotNew, drawHeld } from './fx.js';
export function drawShot(ctx, s, time) { return drawShotNew(ctx, s, time); }

export function fireBlob(ctx, x, y, r, time, k = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, `rgba(255,240,170,${0.9 * k})`); g.addColorStop(0.35, `rgba(255,140,40,${0.7 * k})`); g.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}
export function drawBurn(ctx, f, time) { return drawBurnNew(ctx, f, time); }


export function drawBoneShape(ctx) { boneShape(ctx); }

// ================================================================ 敵の弾
export function drawEShot(ctx, s, time) { return drawEShotNew(ctx, s, time); }

function glow(ctx, x, y, r, c0, c1, time) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const rr = r * (1 + 0.12 * Math.sin(time * 30));
  const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2); g.addColorStop(0, `rgba(${c0},1)`); g.addColorStop(0.35, `rgba(${c1},0.85)`); g.addColorStop(1, `rgba(${c1},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2, 0, TAU); ctx.fill(); ctx.restore();
}

// ================================================================ アイテム
export function drawItem(ctx, it, time) { return drawItemNew(ctx, it, time); }


// ================================================================ ボス
// ボスは bosses.js（作り直し版）。旧版の BOSS_ART は残さない
import { drawBossNew } from './bosses.js';
export function drawBoss(ctx, b, time) { drawBossNew(ctx, b, time); }
