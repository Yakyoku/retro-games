// ORBITAL WINGS 2D — ボス 7 体の絵（C20〜C26）と、登場・崩壊の演出（C30）。
// 各ボスは「焼いた船体の層」＋「動く部位（別スプライト）」＋「発光・予告・損傷の重ね描き」。部位の位置は e.parts（当たり判定そのもの）から取る。
import { VIEW_W, VIEW_H } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { TAU, lerp, clamp, ease, rgba, mix, lite, dark, rnd, pg, rpg, ci, el, rr, blobPath, rot2, tex, solid, ball, seam, rivet, lamp, glass, shadow, crack, hazard, put, putF, glow, glowE, streak, K } from './kit2d.js';

const R01 = Math.random;
const V = (e) => e._v || (e._v = {});
const fillP = (c, sh, col) => { sh(c); c.fillStyle = col; c.fill(); };
const line = (c, pts, col, w) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
const moss = (c, list) => { for (const [x, y, r] of list) { c.fillStyle = 'rgba(58,104,52,0.8)'; c.beginPath(); c.ellipse(x, y, r, r * 0.5, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(120,170,90,0.5)'; c.beginPath(); c.ellipse(x - r * 0.2, y + r * 0.12, r * 0.5, r * 0.2, 0, 0, TAU); c.fill(); } };
const P = (e, name) => e.parts.filter((q) => q.name === name);
// 部位の補間位置・白フラッシュの減衰・被弾の火花
function pxy(R, q) { return [lerp(q.px, q.x, R.alpha), lerp(q.py, q.y, R.alpha)]; }
function fl(R, q, mat) {
  if (q._h !== undefined && q.hp < q._h) R.fx.spark(q.x - q.r * 0.8, q.y + (R01() - 0.5) * q.r, false, q.r > 0.9, mat);
  q._h = q.hp;
  q.flash = Math.max(0, (q.flash || 0) - R.dt * 5);
  return q.flash;
}
const MAT = { ignis: 'machine', warden: 'rock', colossus: 'rock', crusher: 'machine', hydra: 'flesh', nucleus: 'cell', omega: 'machine' };

// =============================================================================
// 1. IGNIS CARRIER（C20）: 上下の船体・艦橋・砲塔・噴射・中央に突き出た 3 枚の装甲板とコア
function ignis(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw;
  const hull = R.sp.get('ig_hull', 6.2, 10.2, (c) => {
    // 中央の連結部（機関）
    solid(c, rr(0.2, -1.15, 3.2, 2.3, 0.2), '#2a3040', { d: 0.08, tex: 'grit', texA: 0.35 });
    for (let k = 0; k < 5; k++) { solid(c, rr(0.9 + k * 0.42, -0.8, 0.26, 1.6, 0.06), '#465066', { g: 'cylx', d: 0, lw: 0.025 }); }
    for (const s of [1, -1]) {
      // 尾翼
      const wing = pg([[1.2, s * 2.6], [1.9, s * 4.75], [3.2, s * 4.55], [3.5, s * 3.0], [2.9, s * 2.2]]);
      solid(c, wing, '#55607a', { d: 0.07, tex: 'grit', texA: 0.3 });
      c.save(); wing(c); c.clip(); fillP(c, pg([[1.7, s * 4.2], [1.9, s * 4.8], [3.3, s * 4.6], [3.35, s * 4.05]]), '#d83a26'); c.restore();
      seam(c, [[1.9, s * 2.9], [2.4, s * 4.6]], 0.02); seam(c, [[2.7, s * 2.6], [3.0, s * 4.5]], 0.02);
      // 主船殻
      const hl = rpg([[-1.05, s * 0.62], [-1.0, s * 2.75], [-0.3, s * 3.42], [2.4, s * 3.3], [3.5, s * 2.2], [3.4, s * 0.95], [1.9, s * 0.52]], 0.14);
      shadow(c, hl, 0.4, 0.05, -0.08);
      solid(c, hl, '#74809e', { d: 0.1, hi: '#e2e9f6', lo: '#262d42', tex: 'grit', texA: 0.3, lw: 0.05 });
      // 重ねた装甲
      const p1 = rpg([[-0.9, s * 0.8], [-0.86, s * 2.6], [-0.25, s * 3.15], [0.5, s * 3.12], [0.3, s * 0.9]], 0.1);
      shadow(c, p1, 0.3, 0.04, -0.05); solid(c, p1, '#95a2c0', { d: 0.07, tex: 'brush', texA: 0.25 });
      const p2 = rpg([[0.75, s * 0.95], [0.9, s * 3.05], [2.25, s * 3.0], [3.1, s * 2.05], [3.0, s * 1.15]], 0.1);
      shadow(c, p2, 0.3, 0.04, -0.05); solid(c, p2, '#66728f', { d: 0.07, tex: 'brush', texA: 0.25 });
      c.save(); p2(c); c.clip(); fillP(c, pg([[0.6, s * 2.3], [3.2, s * 2.6], [3.2, s * 2.2], [0.6, s * 1.95]]), '#d83a26'); line(c, [[0.6, s * 2.3], [3.2, s * 2.6]], 'rgba(255,255,255,0.4)', 0.03); c.restore();
      seam(c, [[-0.3, s * 0.9], [-0.2, s * 3.1]], 0.02); seam(c, [[1.6, s * 1.0], [1.7, s * 3.0]], 0.02); seam(c, [[2.4, s * 1.1], [2.5, s * 2.8]], 0.02);
      for (const [px, py] of [[-0.7, 1.1], [-0.7, 2.4], [0.2, 1.1], [1.0, 1.2], [2.8, 1.4], [1.2, 2.8], [2.0, 2.8]]) rivet(c, px, s * py, 0.035);
      // 光線の砲（2 門。前へ突き出る）
      for (const oy of [1.3, 2.6]) { solid(c, rr(-1.62, s * oy - 0.17, 0.9, 0.34, 0.05), '#3a4358', { g: 'cyl', d: 0.02, lw: 0.03 }); solid(c, rr(-1.72, s * oy - 0.24, 0.26, 0.48, 0.06), '#232a3a', { g: 'cyl', d: 0.02, lw: 0.03 }); solid(c, rr(-0.95, s * oy - 0.3, 0.5, 0.6, 0.08), '#515c76', { d: 0.04, lw: 0.03 }); }
      // 砲塔の座
      ball(c, 0.6, s * 3.38, 0.34, '#3a4358', { lw: 0.035, spec: 0.3 });
      // 噴射口
      solid(c, rr(3.35, s * 1.55 - 0.42, 0.42, 0.84, 0.08), '#39425a', { g: 'cyl', d: 0.03, lw: 0.035 }); fillP(c, rr(3.66, s * 1.55 - 0.3, 0.1, 0.6, 0.03), '#0a0c12');
    }
    // 艦橋（上の船体の上）
    const br = rpg([[0.9, 3.3], [1.1, 4.05], [2.1, 4.05], [2.5, 3.25]], 0.08);
    solid(c, br, '#8a96b4', { d: 0.06, tex: 'brush', texA: 0.2 });
    for (let k = 0; k < 4; k++) fillP(c, rr(1.2 + k * 0.24, 3.66, 0.16, 0.16, 0.03), '#ffe7a0');
    solid(c, rr(1.5, 4.05, 0.07, 0.5, 0.02), '#5a6478', { g: 'cylx', d: 0, lw: 0.02 }); lamp(c, 1.535, 4.6, 0.045, '#ff4a3a', 2.4);
    // コアを支える枠
    c.strokeStyle = '#1a1f2c'; c.lineWidth = 0.34; c.beginPath(); c.arc(-0.15, 0, 0.95, -1.15, 1.15); c.stroke();
    c.strokeStyle = '#7a86a4'; c.lineWidth = 0.2; c.beginPath(); c.arc(-0.15, 0, 0.95, -1.1, 1.1); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.04; c.beginPath(); c.arc(-0.15, 0, 1.02, 0.2, 1.0); c.stroke();
    solid(c, rr(-2.5, -0.09, 2.6, 0.18, 0.04), '#3a4358', { g: 'cyl', d: 0.02, lw: 0.03 });        // 装甲板のレール
  }, { ox: 1.0 });
  // 噴射（後ろ＝右）
  const fl0 = 2.0 + Math.sin(now * 43) * 0.16 + (e.st === 'enter' ? 1.6 : 0);
  ctx.save(); ctx.translate(x, y);
  for (const s of [1, -1]) { ctx.save(); ctx.translate(3.72, s * 1.55); ctx.scale(-1, 1); streak(ctx, -fl0, 0, fl0, 1.3, '#4a8aff', 0.95, 'flame'); streak(ctx, -fl0 * 0.6, 0, fl0 * 0.6, 0.6, '#c8f0ff', 1, 'flame'); glow(ctx, 0, 0, 0.9, '#4a8aff', 0.6); ctx.restore(); }
  put(ctx, hull);
  if (o.lv > 0) put(ctx, R.sp.get('ig_dmg' + o.lv, 6.2, 10.2, (c) => {
    crack(c, 0.4, 2.2, 0.4, 1.8, 71, 0.04); crack(c, 1.5, -1.8, -2.6, 1.6, 72, 0.04); fillP(c, el(0.2, 2.6, 0.5, 0.3, 0.3), 'rgba(8,8,10,0.55)'); fillP(c, el(1.9, -2.6, 0.6, 0.3, -0.2), 'rgba(8,8,10,0.5)');
    if (o.lv > 1) { crack(c, -0.5, -2.4, 0.7, 2.0, 73, 0.05, '#ff8a2a'); crack(c, 2.6, 1.5, 2.4, 1.6, 74, 0.045, '#ff8a2a'); fillP(c, pg([[-0.9, 2.0], [-0.3, 2.3], [-0.2, 1.5], [-0.8, 1.3]]), '#0c0e14'); for (let k = 0; k < 3; k++) fillP(c, rr(-0.75 + k * 0.17, 1.5, 0.08, 0.6), '#ff7a2a'); }
  }, { ox: 1.0 }));
  // 艦橋の窓・航行灯
  glowE(ctx, 1.6, 3.74, 0.6, 0.2, '#ffd880', 0.5 * pw); if ((now * 1.2) % 1 < 0.2) glow(ctx, 1.535, 4.6, 0.3, '#ff4a3a', pw);
  // 砲塔（狙い撃ち）: 発射で後座
  const firing = e.st === 'spread';
  const tur = R.sp.get('ig_tur', 1.4, 0.7, (c) => { solid(c, rr(-0.1, -0.07, 0.75, 0.14, 0.02), '#9aa6bc', { g: 'cyl', d: 0.01, lw: 0.025 }); solid(c, rr(0.55, -0.1, 0.16, 0.2, 0.03), '#2a3142', { g: 'cyl', d: 0.01, lw: 0.025 }); ball(c, 0, 0, 0.26, '#6f7b98', { lw: 0.03 }); });
  const p = R.g.player;
  if (e.lastFire !== v.lf) { v.lf = e.lastFire; if (firing) v.trec = 1; }
  v.trec = Math.max(0, (v.trec || 0) - R.dt * 6);
  for (const s of [1, -1]) { const an = Math.atan2(p.y - (y + s * 3.4), p.x - (x + 0.6)); ctx.save(); ctx.translate(0.6, s * 3.38); ctx.rotate(an); ctx.translate(-v.trec * 0.12, 0); put(ctx, tur); if (v.trec > 0.5) glowE(ctx, 0.95, 0, 0.5, 0.14, '#ffe0a0', (v.trec - 0.5) * 2); ctx.restore(); if (firing) glow(ctx, 0.6, s * 3.38, 0.3, '#ff5a6a', 0.6 * pw); }
  // 光線の予告（溜め）と発射
  const ch = e.st === 'charge' ? clamp(e.charge || 0, 0, 1) : 0, beam = e.st === 'beam';
  for (const oy of [-2.6, -1.3, 1.3, 2.6]) {
    if (ch > 0) { glow(ctx, -1.75, oy, 0.25 + ch * 0.55, '#ff5a8a', 0.5 + ch * 0.5); glow(ctx, -1.75, oy, 0.12 + ch * 0.2, '#ffffff', ch); streak(ctx, -1.8 - 9, oy, 9, 0.06, '#ff3060', ch * 0.35, 'bar'); }
    else if (beam) { glow(ctx, -1.75, oy, 0.6 + 0.15 * Math.sin(now * 60), '#ff7aa0', 1); glowE(ctx, -2.3, oy, 0.9, 0.2, '#ffffff', 0.8); }
    else glow(ctx, -1.72, oy, 0.2, '#ff5a8a', 0.35 * pw);
  }
  if (ch > 0 && R.chance(60)) { const oy = [-2.6, -1.3, 1.3, 2.6][(R01() * 4) | 0], an = R01() * TAU; R.fx.ember(x - 1.75 + Math.cos(an), y + oy + Math.sin(an), -Math.cos(an) * 4, -Math.sin(an) * 4, 0.06, 0.24, 1, 0); }
  ctx.restore();
  // コア（鼓動）と装甲板
  const core = e.parts[8], [cx, cy] = pxy(R, core), open = core.isOpen(e), cf = fl(R, core), beat = Math.pow(Math.max(0, Math.sin(now * (open ? 7 : 3.5))), 6);
  const cs = R.sp.get('ig_core', 1.9, 1.9, (c) => {
    ball(c, 0, 0, 0.7, '#1c5a9a', { hi: '#bfeaff', lo: '#061a3a', lw: 0.04, line: '#04101e', spec: 0.6 });
    c.strokeStyle = 'rgba(190,235,255,0.7)'; c.lineWidth = 0.03; for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(0, 0, 0.62, 0.2 + k * 0.16, k * 1.05, 0, TAU); c.stroke(); }
    ball(c, 0, 0, 0.3, '#9fe4ff', { hi: '#ffffff', lo: '#2a8ad8', lw: 0, spec: 0 });
  });
  ctx.save(); ctx.translate(cx, cy); const sc = 1 + beat * 0.07 + cf * 0.08; ctx.scale(sc, sc); putF(ctx, R.sp, cs, cf); ctx.restore();
  glow(ctx, cx, cy, (open ? 1.6 : 1.0) + beat * 0.5, open ? '#5ad8ff' : '#2a6ad0', ((open ? 0.75 : 0.4) + beat * 0.3) * pw);
  if (open) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(160,230,255,${0.6 * pw})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(cx, cy, 0.95, 0.95 * Math.abs(Math.sin(now * 1.7)) + 0.1, now * 0.9, 0, TAU); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
  const plate = (lv) => R.sp.get('ig_plate' + lv, 0.8, 1.6, (c) => {
    const sh = rpg([[-0.2, -0.64], [0.16, -0.64], [0.24, 0], [0.16, 0.64], [-0.2, 0.64], [-0.26, 0]], 0.05);
    solid(c, sh, lv > 1 ? '#b08a72' : '#c4cee4', { g: 'cylx', d: 0.04, lw: 0.035, tex: 'brush', texA: 0.25 });
    seam(c, [[-0.24, 0.3], [0.22, 0.3]], 0.016); seam(c, [[-0.24, -0.3], [0.22, -0.3]], 0.016); for (const yy of [-0.5, 0.5]) rivet(c, 0, yy, 0.03);
    fillP(c, rr(-0.06, -0.2, 0.12, 0.4, 0.03), '#1a2030'); fillP(c, rr(-0.03, -0.16, 0.06, 0.32, 0.02), lv > 1 ? '#ff5a2a' : lv > 0 ? '#ffc04a' : '#5ad8ff');
    if (lv > 0) crack(c, -0.1, 0.5, -1.2, 0.5, 81, 0.025); if (lv > 1) { crack(c, 0.1, -0.5, 1.6, 0.6, 82, 0.03, '#ff8a2a'); fillP(c, pg([[0.24, 0.64], [0.0, 0.64], [0.2, 0.4]]), '#0a0c12'); }
  });
  for (const q of e.parts) if (q.name === 'plate' && q.alive) {
    const [qx, qy] = pxy(R, q), f = fl(R, q), dm = 1 - q.hp / q.maxHp, lv = dm > 0.66 ? 2 : dm > 0.3 ? 1 : 0;
    ctx.save(); ctx.translate(qx + f * 0.05, qy); const s2 = 1 + f * 0.06; ctx.scale(s2, s2); putF(ctx, R.sp, plate(lv), f); ctx.restore();
    glowE(ctx, qx, qy, 0.2, 0.45, lv > 1 ? '#ff5a2a' : lv > 0 ? '#ffc04a' : '#5ad8ff', 0.5 * pw);
    if (lv > 1 && R.chance(8)) R.fx.spk(qx, qy + (R01() - 0.5), -R01() * 6, (R01() - 0.5) * 8, 0.2, 0);
  }
}

// =============================================================================
// 2. GATE WARDEN（C21）: 石の門。噛み合う顎・歯車と鎖の機構・自機を追う虹彩・崩れる石片
function stoneBlock(c, sh, col, o = {}) { solid(c, sh, col, { d: 0.1, hi: lite(col, 0.45), lo: dark(col, 0.62), tex: 'grit', texA: 0.6, lw: 0.05, line: dark(col, 0.85), ...o }); }
function warden(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw, op = e.open || 0, sc = '#b8ac8a';
  const wall = R.sp.get('wd_wall', 3.4, 15, (c) => {
    stoneBlock(c, rr(1.35, -7.2, 2.75, 14.4, 0.1), '#8e8468');
    // 積み石の目地
    for (let yy = -6.4; yy < 7; yy += 1.3) { seam(c, [[1.4, yy], [4.05, yy]], 0.035, 0.6); const off = (Math.round(yy / 1.3) & 1) ? 0.6 : 0; for (let xx = 2.0 + off; xx < 4; xx += 1.2) seam(c, [[xx, yy], [xx, yy + 1.3]], 0.03, 0.5); }
    // 中央の柱（顎の案内溝）と彫刻
    fillP(c, rr(1.5, -6.6, 0.5, 13.2, 0.05), 'rgba(0,0,0,0.5)'); line(c, [[2.0, -6.6], [2.0, 6.6]], 'rgba(255,255,255,0.25)', 0.03);
    for (const s of [1, -1]) {
      const cap = rpg([[1.2, s * 5.6], [1.2, s * 6.9], [4.2, s * 6.9], [4.2, s * 5.6], [3.6, s * 5.2], [1.8, s * 5.2]], 0.12); shadow(c, cap, 0.35, 0, -0.08); stoneBlock(c, cap, '#a59a7a');
      for (let k = 0; k < 5; k++) { const xx = 1.6 + k * 0.52; seam(c, [[xx, s * 5.9], [xx + 0.26, s * 6.4], [xx + 0.52, s * 5.9]], 0.035, 0.7); }
      // 渦の紋
      c.strokeStyle = 'rgba(30,24,14,0.6)'; c.lineWidth = 0.06; c.beginPath(); for (let t = 0; t < 14; t += 0.3) { const r2 = 0.08 + t * 0.045, xx = 3.1 + Math.cos(t) * r2, yy = s * 3.6 + Math.sin(t) * r2; t ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
      crack(c, 3.6, s * 2.2, s * 1.9, 1.6, 90 + s, 0.035);
    }
    moss(c, [[1.9, 6.95, 0.4], [3.2, 6.9, 0.5], [3.9, 5.3, 0.25], [2.4, -5.25, 0.3], [3.8, -6.85, 0.4], [3.9, 0.4, 0.2]]);
  }, { ox: 2.7 });
  const jaw = (bot) => R.sp.get('wd_jaw' + (bot ? 'b' : 't'), 5.6, 4.6, (c) => {
    // 上顎の形（下顎は上下反転で作る）。原点 = 部位 jawT の中心
    const body = rpg([[-2.1, -0.95], [-2.35, 0.3], [-1.2, 1.5], [1.6, 2.1], [3.0, 1.9], [3.1, -0.3], [1.9, -0.55], [0.8, -0.95]], 0.12);
    shadow(c, body, 0.4, 0.06, -0.1);
    stoneBlock(c, body, sc);
    c.save(); body(c); c.clip();
    // 彫りの帯・目地
    fillP(c, pg([[-2.4, -0.2], [3.2, 0.5], [3.2, 0.15], [-2.4, -0.55]]), 'rgba(0,0,0,0.22)'); seam(c, [[-2.4, -0.2], [3.2, 0.5]], 0.035, 0.6);
    for (let k = 0; k < 7; k++) { const xx = -1.9 + k * 0.7; seam(c, [[xx, -0.1 + k * 0.088], [xx + 0.2, 0.55 + k * 0.088], [xx + 0.5, 0.0 + k * 0.088]], 0.035, 0.65); }
    seam(c, [[0.4, -1.0], [0.6, 2.0]], 0.035, 0.5); seam(c, [[2.0, -0.6], [2.1, 2.1]], 0.035, 0.5);
    crack(c, -1.4, 1.2, -1.0, 1.2, 95, 0.03); crack(c, 2.6, 1.6, -2.2, 1.0, 96, 0.03);
    c.restore();
    // 歯（噛み合う。上顎と下顎で半分ずらす）
    for (let k = 0; k < 4; k++) { const tx = -1.9 + k * 0.72 + (bot ? 0.36 : 0); const th = pg([[tx - 0.26, -0.9], [tx, -1.42], [tx + 0.26, -0.9]]); solid(c, th, '#e6dcb8', { d: 0.04, lw: 0.035, line: '#3a3220' }); }
    moss(c, [[0.2, 1.95, 0.4], [2.2, 2.05, 0.35]]);
  }, { ox: 0.4, oy: 0.35, flip: bot });
  ctx.save(); ctx.translate(x, y);
  put(ctx, wall);
  // 歯車と鎖（顎の開閉に合わせて回る）
  const gear = R.sp.get('wd_gear', 1.5, 1.5, (c) => { const pts = []; for (let k = 0; k < 20; k++) { const a = k / 20 * TAU, r2 = k % 2 ? 0.62 : 0.5; pts.push([Math.cos(a - 0.06) * r2, Math.sin(a - 0.06) * r2], [Math.cos(a + 0.06) * r2, Math.sin(a + 0.06) * r2]); } solid(c, pg(pts), '#8a7a4a', { g: 'flat', d: 0.03, lw: 0.035, line: '#221c0c' }); c.strokeStyle = 'rgba(255,240,190,0.4)'; c.lineWidth = 0.03; c.beginPath(); c.arc(0, 0, 0.4, 0, TAU); c.stroke(); for (let k = 0; k < 4; k++) fillP(c, ci(Math.cos(k * 1.57) * 0.25, Math.sin(k * 1.57) * 0.25, 0.08), '#221c0c'); ball(c, 0, 0, 0.12, '#c8b070', { lw: 0.025 }); });
  for (const s of [1, -1]) {
    ctx.save(); ctx.translate(1.75, s * 4.6); ctx.rotate(s * op * 5 + (e.shake ? Math.sin(now * 60) * 0.05 : 0)); put(ctx, gear); ctx.restore();
    ctx.strokeStyle = '#2a2414'; ctx.lineWidth = 0.1; ctx.setLineDash([0.16, 0.1]); ctx.lineDashOffset = -op * 2.2 * s; ctx.beginPath(); ctx.moveTo(1.75, s * 4.1); ctx.lineTo(1.75, s * (2.4 + op * 2.2)); ctx.stroke(); ctx.setLineDash([]);
  }
  // 目のくぼみ
  const sry = 0.35 + op * 1.0;
  ctx.fillStyle = '#5a5240'; ctx.beginPath(); ctx.ellipse(0.3, 0, 1.5, sry + 0.16, 0, 0, TAU); ctx.fill();          // 彫り込んだ縁
  ctx.fillStyle = '#0c0806'; ctx.beginPath(); ctx.ellipse(0.3, 0, 1.36, sry, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.35)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(0.3, -0.04, 1.44, sry + 0.1, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.restore();
  // 目（虹彩が自機を追う。開くと光る弱点）
  const eye = e.parts[6], [ex, ey] = pxy(R, eye), ef = fl(R, eye, 0), p = R.g.player;
  if (op > 0.05) {
    const es = R.sp.get('wd_eye', 2.2, 2.2, (c) => {
      ball(c, 0, 0, 0.95, '#f4ecd2', { hi: '#ffffff', lo: '#8a7a56', lw: 0.04, line: '#1a140a', spec: 0 });
      c.strokeStyle = 'rgba(200,40,40,0.45)'; c.lineWidth = 0.02; for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.3; c.beginPath(); c.moveTo(Math.cos(a) * 0.92, Math.sin(a) * 0.92); c.quadraticCurveTo(Math.cos(a + 0.3) * 0.7, Math.sin(a + 0.3) * 0.7, Math.cos(a + 0.1) * 0.5, Math.sin(a + 0.1) * 0.5); c.stroke(); }
    });
    const iris = R.sp.get('wd_iris', 1.3, 1.3, (c) => {
      ball(c, 0, 0, 0.56, '#2aa8e8', { hi: '#9fe8ff', lo: '#063a6a', lw: 0.035, line: '#04182a', spec: 0 });
      c.strokeStyle = 'rgba(4,30,60,0.55)'; c.lineWidth = 0.022; for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 0.2, Math.sin(a) * 0.2); c.lineTo(Math.cos(a + 0.05) * 0.53, Math.sin(a + 0.05) * 0.53); c.stroke(); }
      c.strokeStyle = 'rgba(200,245,255,0.6)'; c.lineWidth = 0.03; c.beginPath(); c.arc(0, 0, 0.3, 0, TAU); c.stroke();
    });
    const an = Math.atan2(p.y - ey, p.x - ex), look = 0.3 * op, ix = Math.cos(an) * look, iy = Math.sin(an) * look;
    ctx.save(); ctx.translate(ex, ey);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0.1, 0, 1.36, 0.35 + op * 1.0, 0, 0, TAU); ctx.clip();       // まぶた（くぼみ）の内側だけ
    const s2 = 1 + ef * 0.06; ctx.scale(s2, s2);
    putF(ctx, R.sp, es, ef);
    ctx.save(); ctx.translate(ix, iy); put(ctx, iris);
    const pr = 0.2 + 0.05 * Math.sin(now * 3) - ef * 0.08; ctx.fillStyle = '#02060c'; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-0.18, 0.2, 0.09, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
    glow(ctx, ix, iy, 1.3, '#4ac8ff', (0.25 + 0.2 * Math.sin(now * 5)) * op * pw);
    ctx.restore();
  }
  // 顎（上下）
  for (const [i, bot] of [[0, false], [2, true]]) { const q = e.parts[i], [jx, jy] = pxy(R, q); ctx.save(); ctx.translate(jx, jy); put(ctx, jaw(bot)); ctx.restore(); }
  if (o.lv > 0) { ctx.save(); ctx.translate(x, y); put(ctx, R.sp.get('wd_dmg' + o.lv, 3.4, 15, (c) => { crack(c, 2.2, 3.0, -1.4, 2.4, 97, 0.05); crack(c, 3.4, -3.4, 1.8, 2.2, 98, 0.05); if (o.lv > 1) { crack(c, 2.8, 5.8, -1.7, 3.0, 99, 0.06, '#4ac8ff'); crack(c, 2.0, -5.6, 1.3, 3.0, 100, 0.06, '#4ac8ff'); fillP(c, pg([[4.1, 2.0], [3.5, 2.4], [3.7, 1.4], [4.1, 1.2]]), '#0c0806'); } }, { ox: 2.7 })); ctx.restore(); }
  // 震え（予告）・開閉中: 石片と砂が落ちる
  const moving = e.shake || (e.st === 'open' && op < 1) || e.st === 'close';
  if (moving && R.chance(e.shake ? 40 : 18)) { const s = R01() < 0.5 ? 1 : -1; R.fx.smoke(x + R01() * 3.5 - 1.5, y + s * (1 + R01() * 5), (R01() - 0.5), -0.5, 0.3, 0.7, 0.45, 'dust'); if (R01() < 0.5) R.fx.debris(x + R01() * 3 - 1.5, y + s * (1 + R01() * 4), (R01() - 0.5) * 2, 0, 0.08 + R01() * 0.07, 1.0, 'rock'); }
  if (e.shake) R.fx.shake(0.08);
  if (op >= 1 && !v.opened) { v.opened = true; R.fx.shake(0.25); for (let i = 0; i < 10; i++) R.fx.smoke(x + R01() * 3 - 1, y + (R01() < 0.5 ? 1 : -1) * 3.2, (R01() - 0.5) * 3, (R01() - 0.5), 0.4, 0.8, 0.5, 'dust'); }
  if (op < 0.5) v.opened = false;
}

// =============================================================================
// 3. COLOSSUS（C22）: 巨大な顔。深い彫り・ひび・目の光線の溜め・口の奥の光
function colossus(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw, m = e.mouth || 0, ey0 = e.eyes || 0;
  const stone = '#8c8898', dk = '#2c2a36', lt = '#d6d0e8';
  const head = R.sp.get('co_head', 11.6, 11.4, (c) => {
    // 背後の控え壁（当たらない飾り。暗く沈める）
    for (const [bx, by, bw, bh] of [[5.3, -5.6, 1.6, 9.4], [6.6, -5.6, 1.3, 6.4]]) { solid(c, rr(bx, by, bw, bh, 0.08), '#3a3846', { d: 0.08, tex: 'grit', texA: 0.5, lw: 0.04, hi: '#5a5868', lo: '#16151c' }); for (let yy = by + 1.2; yy < by + bh; yy += 1.3) seam(c, [[bx, yy], [bx + bw, yy]], 0.035, 0.5); }
    fillP(c, pg([[-2.45, -0.6], [-0.2, -0.6], [-0.2, -2.6], [-2.3, -2.6]]), '#0e0a14');       // 口の奥
    const sh = pg([[5.6, 5.0], [5.6, -5.0], [1.6, -5.25], [-0.2, -4.5], [-0.25, -1.3], [-0.6, -0.72], [-2.45, -0.62], [-2.3, -0.2], [-2.05, 0.1], [-2.95, 0.55], [-2.35, 1.5], [-1.75, 1.85], [-2.1, 2.3], [-2.05, 2.95], [-0.8, 4.5], [1.4, 5.45]]);
    stoneBlock(c, sh, stone, { hi: lt, lo: dk, d: 0.14, mid: 0.42 });
    c.save(); sh(c); c.clip();
    // 冠（額の上の帯と飾り）
    fillP(c, pg([[-1.9, 3.2], [5.7, 3.9], [5.7, 3.3], [-2.1, 2.6]]), 'rgba(0,0,0,0.25)'); seam(c, [[-1.9, 3.2], [5.7, 3.9]], 0.05, 0.7); seam(c, [[-2.1, 2.6], [5.7, 3.3]], 0.05, 0.7);
    for (let k = 0; k < 10; k++) { const xx = -1.5 + k * 0.72, yy = 2.95 + k * 0.064; solid(c, pg([[xx - 0.22, yy], [xx, yy + 0.28], [xx + 0.22, yy], [xx, yy - 0.28]]), '#b8a04a', { g: 'flat', d: 0.03, lw: 0.03, line: '#2a2208' }); }
    for (let k = 0; k < 7; k++) { const xx = -0.4 + k * 0.9; seam(c, [[xx, 4.0 + k * 0.05], [xx + 0.1, 5.4]], 0.04, 0.5); }
    // 眉の張り出し・目のくぼみ・頬骨・鼻筋
    fillP(c, pg([[-2.1, 2.34], [0.9, 2.75], [1.1, 2.3], [-1.8, 1.92]]), lite(stone, 0.4));
    fillP(c, pg([[-1.95, 1.94], [1.0, 2.3], [1.2, 1.3], [0.2, 0.92], [-1.9, 1.2]]), '#15131c'); line(c, [[-1.9, 1.2], [0.2, 0.92], [1.2, 1.3]], 'rgba(255,255,255,0.3)', 0.045);
    fillP(c, pg([[-2.6, 0.7], [-1.9, 1.2], [-1.4, 0.5], [-2.1, 0.1]]), 'rgba(255,255,255,0.13)');
    line(c, [[-1.3, 1.0], [-1.0, 0.2], [-1.4, -0.4]], 'rgba(0,0,0,0.4)', 0.09); line(c, [[0.3, 0.7], [0.9, -0.6], [0.4, -2.2]], 'rgba(0,0,0,0.3)', 0.1); line(c, [[0.42, 0.7], [1.02, -0.6], [0.52, -2.2]], 'rgba(255,255,255,0.14)', 0.05);
    // 耳と耳飾り
    const ear = rpg([[2.3, 2.3], [3.3, 2.5], [3.5, -1.2], [2.6, -1.6]], 0.2); shadow(c, ear, 0.4, -0.08, -0.08); stoneBlock(c, ear, mix(stone, lt, 0.2), { d: 0.08 }); fillP(c, rr(2.72, -0.6, 0.36, 2.2, 0.16), 'rgba(0,0,0,0.4)');
    solid(c, ci(3.0, -2.2, 0.42), '#b8a04a', { d: 0.05, lw: 0.04, line: '#2a2208' }); fillP(c, ci(3.0, -2.2, 0.18), '#15131c');
    // 石の継ぎ目・雨だれ・ひび
    for (const xx of [1.9, 4.2]) seam(c, [[xx, 5.4], [xx + 0.25, -5.2]], 0.045, 0.5);
    seam(c, [[-0.2, -2.9], [5.6, -3.1]], 0.045, 0.5); seam(c, [[0.9, 0.3], [5.6, 0.1]], 0.04, 0.4);
    c.strokeStyle = 'rgba(20,18,28,0.22)'; c.lineWidth = 0.08; for (const [xx, y0, y1] of [[0.6, 2.2, 0.9], [1.5, 0.0, -2.4], [3.9, 3.0, 0.6], [4.8, 0.0, -2.6], [2.4, -1.8, -4.4]]) { c.beginPath(); c.moveTo(xx, y0); c.lineTo(xx + 0.05, y1); c.stroke(); }
    crack(c, 0.4, 5.3, -1.5, 2.6, 101, 0.045); crack(c, 4.9, 1.6, 3.5, 1.8, 102, 0.04); crack(c, 1.4, -3.0, -1.9, 1.6, 103, 0.04); crack(c, -1.6, 0.4, 0.2, 0.9, 104, 0.03);
    moss(c, [[0.4, 5.25, 0.5], [2.0, 5.3, 0.6], [3.8, 5.05, 0.5], [5.2, 4.2, 0.3], [5.3, -4.7, 0.5], [3.3, -5.0, 0.4], [3.3, 2.5, 0.2], [-1.3, 4.0, 0.2]]);
    c.restore();
  }, { ox: 2.6 });
  const jaw = R.sp.get('co_jaw', 3.6, 4.4, (c) => {
    // 下顎（口が開くと下がる）。原点 = ボスの中心
    const j = pg([[-2.5, -1.62], [-0.25, -1.52], [-0.15, -4.4], [-0.4, -4.55], [-1.4, -3.5], [-1.75, -2.6]]);
    stoneBlock(c, j, stone, { hi: lt, lo: dk, d: 0.12 });
    for (let k = 0; k < 5; k++) { const tx = -2.25 + k * 0.42; solid(c, pg([[tx - 0.17, -1.62], [tx, -1.22], [tx + 0.17, -1.6]]), '#e2dcec', { d: 0.03, lw: 0.03, line: '#2c2a36' }); }
    seam(c, [[-2.3, -2.0], [-0.3, -1.9]], 0.04, 0.5); crack(c, -1.0, -2.2, -1.3, 1.2, 105, 0.035);
  }, { ox: -1.3, oy: -2.9 });
  ctx.save(); ctx.translate(x, y);
  putF(ctx, R.sp, head, 0);
  // 口の奥の光（弱点。奥から何層も）
  const mo = e.parts[4], mf = fl(R, mo, 2);
  if (m > 0.03) {
    const my = -1.1 - m * 0.45;
    glowE(ctx, -1.3, my, 1.3, 0.3 + m * 0.6, '#ff2a9a', (0.5 + m * 0.5) * pw); glowE(ctx, -1.0, my, 0.7, 0.2 + m * 0.4, '#ff8ad0', m * pw);
    const beat = 0.5 + 0.5 * Math.sin(now * 9); glow(ctx, -1.5, my, 0.3 + m * 0.4 + beat * 0.1 + mf * 0.4, '#ffffff', m * 0.9);
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,170,220,${0.5 * m})`; ctx.lineWidth = 0.04; for (let k = 0; k < 3; k++) { const u = ((now * 1.3 + k / 3) % 1); ctx.beginPath(); ctx.ellipse(-1.5 + u * 0.9, my, 0.1 + u * 0.25, (0.2 + m * 0.5) * (1 - u * 0.3), 0, 0, TAU); ctx.stroke(); } ctx.globalCompositeOperation = 'source-over';
  }
  ctx.save(); ctx.translate(-m * 0.08, -m * 0.9); putF(ctx, R.sp, jaw, mf * 0.6); ctx.restore();
  ctx.fillStyle = '#e2dcec'; for (let k = 0; k < 5; k++) { const tx = -2.25 + k * 0.42 + 0.2; ctx.beginPath(); ctx.moveTo(tx - 0.16, -0.66); ctx.lineTo(tx, -1.0); ctx.lineTo(tx + 0.16, -0.67); ctx.fill(); }       // 上の歯
  if (o.lv > 0) put(ctx, R.sp.get('co_dmg' + o.lv, 9.0, 11.4, (c) => {
    crack(c, 1.5, 3.5, -1.2, 3.0, 106, 0.06, o.lv > 1 ? '#ff5ac8' : null); crack(c, 4.0, -1.0, 2.2, 2.6, 107, 0.055); crack(c, 2.6, 1.0, -0.4, 2.0, 108, 0.05);
    if (o.lv > 1) { crack(c, 0.6, -2.0, 0.9, 3.2, 109, 0.07, '#ff5ac8'); crack(c, 4.6, 4.0, -2.3, 3.0, 110, 0.06, '#ff5ac8'); fillP(c, pg([[5.6, 2.2], [4.9, 2.5], [5.0, 1.5], [5.6, 1.2]]), '#0e0a14'); fillP(c, pg([[-0.9, 4.4], [-0.3, 4.3], [-0.5, 3.7]]), '#0e0a14'); }
  }, { ox: 1.35 }));
  // 目: 光線の溜め（光が集まり、筋が伸びる）
  const ex = -0.75, eyy = 1.5;
  const ea = (0.55 + 0.1 * Math.sin(now * 3) + ey0 * 0.45 + (e.st === 'eyes' && e.stT >= 40 ? 0.3 * Math.sin(now * 50) : 0)) * pw;
  glowE(ctx, ex, eyy, 0.9 + ey0 * 0.5, 0.36 + ey0 * 0.2, ey0 > 0 ? '#ff3a5a' : '#ff5ac8', ea); glow(ctx, ex - 0.4, eyy - 0.1, 0.18 + ey0 * 0.3, '#ffffff', ea);
  if (ey0 > 0) { streak(ctx, ex - 9.6, eyy - 0.25, 9, 0.06, '#ff3050', ey0 * 0.4, 'bar'); glowE(ctx, ex - 0.6, eyy - 0.25, 2.2 * ey0, 0.07, '#ffffff', ey0 * 0.8); glowE(ctx, ex - 0.6, eyy - 0.25, 0.07, 1.2 * ey0, '#ffffff', ey0 * 0.6); if (R.chance(70)) { const an = R01() * TAU; R.fx.ember(x + ex - 0.5 + Math.cos(an) * 1.3, y + eyy + Math.sin(an) * 1.3, -Math.cos(an) * 5, -Math.sin(an) * 5, 0.07, 0.25, 1, 0); } }
  if (o.lv > 1) glow(ctx, 2.0, 1.0, 3.5, '#ff5ac8', 0.1 + 0.05 * Math.sin(now * 4));
  ctx.restore();
  if (e.shake) { R.fx.shake(0.1); if (R.chance(40)) R.fx.smoke(x + R01() * 6 - 2, y + 5, (R01() - 0.5), -1, 0.35, 0.8, 0.45, 'dust'); if (R.chance(20)) R.fx.debris(x - 1.5 + R01(), y - 1, -1 - R01() * 2, 1, 0.1, 0.9, 'rock'); }
  if (e.st === 'pebbles' && R.chance(20)) R.fx.smoke(x - 1 + R01(), y + 3.4, -1, 0.5, 0.3, 0.6, 0.4, 'dust');
}

// =============================================================================
// 4. TWIN CRUSHER（C23）: 油圧の腕・火花・コアのシャッター・蒸気
function crusher(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw, g = R.g, sh0 = e.shutter || 0;
  const body = R.sp.get('cr_body', 5.4, 6.6, (c) => {
    const main = rpg([[-1.0, 1.25], [0.2, 3.0], [3.3, 3.0], [3.6, 1.8], [3.6, -1.8], [3.3, -3.0], [0.2, -3.0], [-1.0, -1.25]], 0.16);
    solid(c, main, '#8a6e4a', { d: 0.11, hi: '#e6c896', lo: '#2e2014', tex: 'grit', texA: 0.4, lw: 0.05 });
    for (const s of [1, -1]) {
      const pl = rpg([[-0.6, s * 1.35], [0.4, s * 2.75], [2.0, s * 2.75], [2.0, s * 1.2]], 0.1); shadow(c, pl, 0.35, 0.04, -0.06); solid(c, pl, '#b08a56', { d: 0.07, tex: 'brush', texA: 0.25 });
      hazard(c, rr(0.5, s * 2.62 - 0.14, 1.4, 0.28, 0.04), 0.18);
      seam(c, [[0.9, s * 1.3], [0.9, s * 2.6]], 0.022); for (const [px, py] of [[-0.2, 1.6], [0.5, 1.45], [1.7, 1.45], [1.7, 2.3]]) rivet(c, px, s * py, 0.04);
      // 油圧の筒（側面）
      solid(c, rr(2.3, s * 1.0 - 0.2 + (s > 0 ? 0 : -1.4), 0.4, 1.8, 0.08), '#39424e', { g: 'cylx', d: 0, lw: 0.035 }); solid(c, rr(2.38, s * 2.45 - 0.3, 0.24, 0.6, 0.04), '#c8ced8', { g: 'cylx', d: 0, lw: 0.025 });
      fillP(c, rr(3.0, s * 2.0 - 0.3, 0.42, 0.6, 0.05), '#14161c'); for (let k = 0; k < 3; k++) line(c, [[3.04, s * 2.0 - 0.2 + k * 0.2], [3.38, s * 2.0 - 0.2 + k * 0.2]], 'rgba(255,255,255,0.25)', 0.03);       // 排気口
    }
    hazard(c, rr(2.72, -1.0, 0.3, 2.0, 0.04), 0.2);
    // コアの枠（シャッターの座）
    solid(c, ci(-0.4, 0, 1.12), '#4a3c2a', { d: 0.08, lw: 0.05 }); fillP(c, ci(-0.4, 0, 0.86), '#0a0806');
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; rivet(c, -0.4 + Math.cos(a) * 0.99, Math.sin(a) * 0.99, 0.035); }
  }, { ox: 1.3 });
  ctx.save(); ctx.translate(x, y);
  put(ctx, body);
  if (o.lv > 0) put(ctx, R.sp.get('cr_dmg' + o.lv, 5.4, 6.6, (c) => { crack(c, 1.0, 2.2, -1.9, 1.6, 111, 0.045); crack(c, 2.6, -1.4, 2.6, 1.4, 112, 0.04); fillP(c, el(1.4, -2.0, 0.5, 0.26, 0.2), 'rgba(8,6,4,0.55)'); if (o.lv > 1) { crack(c, 0.4, -2.4, 0.9, 2.0, 113, 0.05, '#ff8a2a'); crack(c, 3.0, 1.0, 2.0, 1.6, 114, 0.05, '#ff8a2a'); fillP(c, pg([[3.6, 0.6], [3.1, 0.8], [3.2, 0.1], [3.6, -0.1]]), '#0a0806'); } }, { ox: 1.3 }));
  // コア（シャッターの奥で脈打つ）
  const core = e.parts[3], cf = fl(R, core), beat = Math.pow(Math.max(0, Math.sin(now * 6)), 4);
  const cs = R.sp.get('cr_core', 1.8, 1.8, (c) => { ball(c, 0, 0, 0.74, '#ff8a2a', { hi: '#fff6d0', lo: '#8a2a04', lw: 0.035, line: '#2a0a00', spec: 0.5 }); c.strokeStyle = 'rgba(90,20,0,0.6)'; c.lineWidth = 0.04; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 0.36, Math.sin(a) * 0.36); c.lineTo(Math.cos(a) * 0.72, Math.sin(a) * 0.72); c.stroke(); } ball(c, 0, 0, 0.32, '#fff0c0', { hi: '#ffffff', lo: '#ffb040', lw: 0, spec: 0 }); });
  ctx.save(); ctx.translate(-0.4, 0); const s2 = 1 + beat * 0.05 + cf * 0.07; ctx.scale(s2, s2); putF(ctx, R.sp, cs, cf); ctx.restore();
  glow(ctx, -0.4, 0, 1.2 + beat * 0.4, '#ff8a2a', (0.25 + sh0 * 0.5 + beat * 0.2) * pw);
  // シャッター（6 枚の羽根が回りながら開く絞り）
  const blade = R.sp.get('cr_blade', 1.2, 1.2, (c) => { solid(c, pg([[0, 0], [0.92, -0.08], [0.82, 0.5], [0.3, 0.62]]), '#7a6a52', { g: 'flat', d: 0.035, lw: 0.035, line: '#1a140c', hi: '#c8b890' }); hazard(c, pg([[0.62, 0.12], [0.86, 0.1], [0.8, 0.44], [0.6, 0.48]]), 0.08); rivet(c, 0.3, 0.3, 0.03); }, { ox: 0.45, oy: 0.25 });
  ctx.save(); ctx.translate(-0.4, 0); ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.clip();
  for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate(k / 6 * TAU + sh0 * 0.5); ctx.translate(sh0 * 0.74, 0); ctx.rotate(-0.55); put(ctx, blade); ctx.restore(); }
  ctx.restore();
  // 動作灯・蒸気
  const moving = e.st === 'open' && sh0 < 1 || e.st === 'shut';
  for (const s of [1, -1]) { glow(ctx, 1.2, s * 2.62, 0.5, e.warn ? '#ff4a2a' : '#ffc04a', (e.warn ? 0.5 + 0.5 * Math.sin(now * 25) : 0.3) * pw); if ((moving || e.st === 'slam') && R.chance(30)) R.fx.smoke(x + 3.3, y + s * 2.0, 1.5 + R01() * 2, s * R01(), 0.4, 0.7, 0.5, 'steam'); }
  ctx.restore();
  // 腕（画面の上下から閉じる柱）: 予告 → 挟む
  const ax = g.camX + e.armX - (g.scrollD || 0) * (1 - R.alpha);
  if (e.warn) {
    // 予告: 赤い帯と、挟む高さへ向かう矢印、標的の印
    const a = 0.3 + 0.2 * Math.sin(now * 22);
    ctx.fillStyle = `rgba(255,50,30,${a * 0.5})`; ctx.fillRect(ax - 1.08, 0, 2.16, VIEW_H);
    ctx.strokeStyle = `rgba(255,120,60,${a + 0.3})`; ctx.lineWidth = 0.07; ctx.beginPath();
    for (const s of [1, -1]) for (let k = 0; k < 6; k++) { const u = ((now * 1.4 + k / 6) % 1), yy = e.clampY + s * (1.2 + (1 - u) * 8); ctx.moveTo(ax - 0.6, yy + s * 0.4); ctx.lineTo(ax, yy); ctx.lineTo(ax + 0.6, yy + s * 0.4); }
    ctx.stroke();
    ctx.strokeStyle = '#ffde6a'; ctx.lineWidth = 0.06; ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.moveTo(ax - 1.6, e.clampY); ctx.lineTo(ax + 1.6, e.clampY); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ax, e.clampY, 0.5 + 0.2 * Math.sin(now * 12), 0, TAU); ctx.stroke();
  }
  const seg = R.sp.get('cr_seg', 2.4, 1.3, (c) => {
    solid(c, rr(-1.05, -0.575, 2.1, 1.15), '#9a7c50', { g: 'cylx', d: 0, lw: 0.04, hi: '#f0d8a8', lo: '#3a2a18', tex: 'brush', texA: 0.22 });
    for (const sx of [-1, 1]) solid(c, rr(sx * 0.62 - 0.13, -0.575, 0.26, 1.15), '#c2c8d2', { g: 'cylx', d: 0, lw: 0.02 });
    fillP(c, rr(-1.05, -0.575, 2.1, 0.09), 'rgba(0,0,0,0.5)'); fillP(c, rr(-1.05, 0.48, 2.1, 0.06), 'rgba(255,255,255,0.25)');
    solid(c, rr(-0.32, -0.3, 0.64, 0.6, 0.06), '#5a462c', { d: 0.04, lw: 0.03 }); for (const xx of [-0.9, 0.9]) { rivet(c, xx, 0.3, 0.035); rivet(c, xx, -0.3, 0.035); }
  });
  const hd = (flip) => R.sp.get('cr_head' + (flip ? 'b' : 't'), 2.7, 2.3, (c) => {
    // 上の腕の先端（下向きの歯）。原点 = 先端の部位の中心
    solid(c, rr(-1.2, -0.62, 2.4, 1.32, 0.08), '#5a4630', { d: 0.08, lw: 0.045, tex: 'grit', texA: 0.4 });
    hazard(c, rr(-1.2, -0.62, 2.4, 0.5, 0.05), 0.24);
    for (let k = -2; k <= 2; k++) solid(c, pg([[k * 0.44 - 0.2, -0.62], [k * 0.44 + 0.2, -0.62], [k * 0.44, -1.05]]), '#d8dce4', { d: 0.03, lw: 0.035, line: '#1a140c' });
    for (const xx of [-0.9, 0, 0.9]) rivet(c, xx, 0.4, 0.04);
  }, { flip });
  for (const arm of ['armT', 'armB']) {
    const qs = P(e, arm), top = arm === 'armT', s = top ? 1 : -1;
    const [hx, hy] = pxy(R, qs[0]), [, ty] = pxy(R, qs[qs.length - 1]);
    if ((top && hy > VIEW_H + 2) || (!top && hy < -2)) continue;
    for (let i = qs.length - 1; i >= 1; i--) { const yy = hy + s * i * 1.15; ctx.save(); ctx.translate(ax, yy); put(ctx, seg); ctx.restore(); }
    ctx.save(); ctx.translate(ax, hy); put(ctx, hd(!top)); ctx.restore();
    glowE(ctx, ax, hy - s * 0.3, 1.0, 0.16, '#ff4a2a', e.st === 'slam' ? 0.6 : 0.15);
  }
  // 挟んだ瞬間の火花と揺れ
  if ((e.armExt || 0) >= 1 && !v.slam) { v.slam = true; R.fx.shake(0.45); for (let i = 0; i < 24; i++) R.fx.spk(ax + (R01() - 0.5) * 2, e.clampY, (R01() - 0.5) * 22, (R01() - 0.5) * 6, 0.25 + R01() * 0.2, 0, 2); R.fx.flashAt(ax, e.clampY, 1.6, 0.12, 4); R.fx.ring(ax, e.clampY, 0.3, 3, 0.3, 0, 0.8); for (let i = 0; i < 6; i++) R.fx.smoke(ax + (R01() - 0.5) * 2, e.clampY, (R01() - 0.5) * 5, (R01() - 0.5), 0.4, 0.6, 0.5, 'steam'); }
  if ((e.armExt || 0) < 0.5) v.slam = false;
  if (e.st === 'slam' && R.chance(30)) R.fx.spk(ax + (R01() - 0.5) * 2, e.clampY, (R01() - 0.5) * 14, (R01() - 0.5) * 4, 0.2, 0, 2);
}

// =============================================================================
// 5. HYDRA BRAIN（C24）: 脳の皺・血管・節と吸盤のある触手・自機を追う瞳
function vein(c, x, y, a, len, seed, col, w = 0.05) {
  const r = rnd(seed);
  const go = (x, y, a, len, w, d) => { c.beginPath(); c.moveTo(x, y); const n = Math.max(3, (len / 0.25) | 0); for (let i = 0; i < n; i++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; c.lineTo(x, y); if (d < 2 && r() < 0.28) { c.strokeStyle = col; c.lineWidth = w; c.stroke(); go(x, y, a + (r() < 0.5 ? 0.7 : -0.7), len * 0.5, w * 0.65, d + 1); c.beginPath(); c.moveTo(x, y); } } c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  c.lineCap = 'round'; c.lineJoin = 'round'; go(x, y, a, len, w, 0);
}
function hydra(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw, p = R.g.player, a = R.alpha;
  const seg = (r) => R.sp.get('hy_seg' + r.toFixed(2), r * 2.6, r * 2.6, (c) => {
    ball(c, 0, 0, r, '#a8324e', { hi: '#ff9ab0', lo: '#3c0a1a', bounce: '#ff7a9a', line: '#28040e', lw: 0.04, tex: 'blot', texA: 0.45, spec: 0.7 });
    c.save(); ci(0, 0, r)(c); c.clip(); c.strokeStyle = 'rgba(40,4,14,0.5)'; c.lineWidth = 0.04; c.beginPath(); c.ellipse(0, 0, r * 0.35, r * 1.1, 0, 0, TAU); c.stroke();
    for (const yy of [-0.48, 0.48]) { ball(c, r * 0.1, yy * r, r * 0.22, '#ffc0cc', { lo: '#b04a66', lw: 0.02, spec: 0 }); fillP(c, ci(r * 0.1, yy * r, r * 0.09), '#5a1026'); }
    c.restore();
  });
  const tipS = R.sp.get('hy_tip', 1.7, 1.7, (c) => {
    for (let k = 0; k < 5; k++) { c.save(); c.rotate(k / 5 * TAU + 0.3); solid(c, el(0.4, 0, 0.3, 0.23), '#e0607e', { d: 0.03, hi: '#ffc8d4', lo: '#7a1030', line: '#28040e', lw: 0.025 }); c.restore(); }
    ball(c, 0, 0, 0.42, '#fff0c0', { hi: '#ffffff', lo: '#c08a30', line: '#28040e', lw: 0.03, spec: 0 }); ball(c, 0, 0, 0.27, '#ff9a2a', { hi: '#ffe0a0', lo: '#8a3a00', lw: 0.02, spec: 0 });
  });
  // 触手（体の後ろ）
  e.arms.forEach((arm, k) => {
    const alive = arm.tip.alive; let lx = 0, ly = 0;
    for (let i = 0; i < arm.segs.length; i++) {
      const q = arm.segs[i]; if (!q.alive) continue;
      const [qx, qy] = pxy(R, q), nx = arm.segs[Math.min(i + 1, arm.segs.length - 1)], an = Math.atan2(nx.y - q.y, nx.x - q.x) || arm.base;
      const pu = 1 + 0.07 * Math.sin(now * 5 - i * 0.8 + k * 2);
      ctx.save(); ctx.translate(qx, qy); ctx.rotate(an); ctx.scale(pu, pu); put(ctx, seg(Math.round((q.r + 0.12) * 20) / 20)); ctx.restore();
      lx = qx; ly = qy;
    }
    if (alive) {
      const q = arm.tip, [tx, ty] = pxy(R, q), f = fl(R, q, 2), an = Math.atan2(p.y - ty, p.x - tx), s2 = 1 + f * 0.1;
      ctx.save(); ctx.translate(tx, ty); ctx.scale(s2, s2); ctx.save(); ctx.rotate(now * 0.7 + k); putF(ctx, R.sp, tipS, f); ctx.restore();
      ctx.fillStyle = '#1a0408'; ctx.beginPath(); ctx.ellipse(Math.cos(an) * 0.1, Math.sin(an) * 0.1, 0.1, 0.14, an, 0, TAU); ctx.fill();
      glow(ctx, 0, 0, 0.6, '#ff9a2a', (0.3 + 0.15 * Math.sin(now * 6 + k)) * pw);
      ctx.restore();
    } else {      // ちぎれた断面
      glow(ctx, lx, ly, 0.5, '#ff3a6a', 0.5); if (R.chance(6)) R.fx.debris(lx, ly, (R01() - 0.5) * 2, -1, 0.08, 0.7, 'flesh');
    }
  });
  // 脳
  const brain = R.sp.get('hy_brain', 6.2, 8.6, (c) => {
    const out = blobPath([[-1.75, 0], [-1.6, 1.3], [-0.7, 2.5], [0.3, 3.5], [1.6, 3.95], [2.8, 3.4], [3.35, 2.2], [3.2, 0.9], [3.45, 0], [3.2, -0.9], [3.35, -2.2], [2.8, -3.4], [1.6, -3.95], [0.3, -3.5], [-0.7, -2.5], [-1.6, -1.3]]);
    solid(c, out, '#c2506e', { d: 0.14, hi: '#ffb4c6', lo: '#3e0c1e', tex: 'blot', texA: 0.5, line: '#1e040c', lw: 0.06, mid: 0.38 });
    c.save(); out(c); c.clip();
    // 皺（うねる溝を敷き詰める）
    const q = rnd(505);
    for (let n = 0; n < 60; n++) {
      let px = -1.6 + q() * 5, py = -3.8 + q() * 7.6, an = q() * TAU; const pts = [[px, py]];
      const len = 5 + (q() * 8 | 0); for (let i = 0; i < len; i++) { an += Math.sin(i * 1.3 + n) * 0.75; px += Math.cos(an) * 0.24; py += Math.sin(an) * 0.24; pts.push([px, py]); }
      c.beginPath(); pts.forEach((p2, i) => (i ? c.lineTo(p2[0] - 0.02, p2[1] - 0.05) : c.moveTo(p2[0] - 0.02, p2[1] - 0.05))); c.strokeStyle = 'rgba(255,200,215,0.3)'; c.lineWidth = 0.07; c.stroke();
      c.beginPath(); pts.forEach((p2, i) => (i ? c.lineTo(p2[0], p2[1]) : c.moveTo(p2[0], p2[1]))); c.strokeStyle = 'rgba(74,10,32,0.62)'; c.lineWidth = 0.075; c.stroke();
    }
    // 左右の半球の溝
    c.strokeStyle = 'rgba(40,4,16,0.75)'; c.lineWidth = 0.13; c.beginPath(); c.moveTo(-1.0, 0.2); c.bezierCurveTo(0.4, 0.5, 1.6, -0.4, 3.5, 0.05); c.stroke();
    // 血管
    vein(c, 3.2, 2.6, 3.6, 3.0, 201, 'rgba(210,30,60,0.75)', 0.07); vein(c, 3.2, -2.4, 2.7, 3.0, 202, 'rgba(70,90,220,0.7)', 0.07); vein(c, 0.6, 3.6, -1.2, 2.4, 203, 'rgba(70,90,220,0.6)', 0.055); vein(c, 0.4, -3.6, 1.2, 2.4, 204, 'rgba(210,30,60,0.7)', 0.055);
    c.restore();
    // 艶
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(0.9, 3.2, 1.1, 0.22, -0.1, 0, TAU); c.fill(); c.beginPath(); c.ellipse(-0.6, 1.9, 0.5, 0.12, 0.8, 0, TAU); c.fill();
    // 触手の付け根
    for (const oy of [2.4, 0, -2.4]) { if (oy === 0) continue; ball(c, -0.75, oy, 0.62, '#8a2440', { hi: '#f08aa4', lo: '#30081a', line: '#28040e', lw: 0.04, tex: 'blot', texA: 0.4 }); }
    // 目のまわりの肉
    solid(c, el(-1.35, 0, 1.22, 1.12), '#a8324e', { d: 0.1, hi: '#ff9ab0', lo: '#3c0a1a', line: '#1e040c', lw: 0.05, tex: 'blot', texA: 0.4 });
    fillP(c, el(-1.4, 0, 0.98, 0.93), '#1c0410');
  }, { ox: 0.85 });
  const pu = 1 + (e.pulse || 0) * 0.1 + Math.sin(now * 2.2) * 0.02;
  ctx.save(); ctx.translate(x, y); ctx.scale(pu, pu);
  put(ctx, brain);
  if (o.lv > 0) put(ctx, R.sp.get('hy_dmg' + o.lv, 6.2, 8.6, (c) => { for (const [bx, by, br] of o.lv > 1 ? [[1.2, 2.2, 0.6], [2.4, -1.2, 0.7], [0.4, -2.6, 0.5], [2.6, 1.4, 0.4]] : [[1.2, 2.2, 0.5], [2.4, -1.2, 0.5]]) { const g2 = c.createRadialGradient(bx, by, 0, bx, by, br); g2.addColorStop(0, 'rgba(30,0,10,0.85)'); g2.addColorStop(0.6, 'rgba(90,10,40,0.6)'); g2.addColorStop(1, 'rgba(90,10,40,0)'); c.fillStyle = g2; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill(); crack(c, bx, by, bx * 2, br * 1.6, bx * 10 | 0, 0.03, '#ff3a6a'); } }, { ox: 0.85 }));
  // 血管の脈（膨らむ予告で強く光る）
  const beat = Math.pow(Math.max(0, Math.sin(now * 4)), 3);
  glowE(ctx, 1.2, 0, 3.2, 3.8, '#ff3a6a', (0.1 + beat * 0.1 + (e.pulse || 0) * 0.45) * pw);
  if ((e.pulse || 0) > 0.1) glow(ctx, 0.6, 0, 2 + e.pulse * 2.5, '#ffb0c8', e.pulse * 0.5 * pw);
  // 目（まぶたが開く。瞳孔が自機を追う）
  const eye = e.parts[3], ef = fl(R, eye, 2), eo = e.eye || 0;
  if (eo > 0.03) {
    const eb = R.sp.get('hy_eye', 2.0, 2.0, (c) => {
      ball(c, 0, 0, 0.9, '#fff2c8', { hi: '#ffffff', lo: '#b08a40', lw: 0.03, line: '#1e040c', spec: 0 });
      vein(c, 0.85, 0.2, 2.9, 0.6, 211, 'rgba(210,40,60,0.6)', 0.022); vein(c, 0.6, -0.65, 2.3, 0.6, 212, 'rgba(210,40,60,0.6)', 0.022); vein(c, -0.5, 0.75, -0.9, 0.5, 213, 'rgba(210,40,60,0.6)', 0.022);
    });
    const ir = R.sp.get('hy_iris', 1.3, 1.3, (c) => { ball(c, 0, 0, 0.55, '#ffc82a', { hi: '#fff6a0', lo: '#9a4a00', lw: 0.035, line: '#3a1a00', spec: 0 }); c.strokeStyle = 'rgba(120,50,0,0.5)'; c.lineWidth = 0.02; for (let k = 0; k < 30; k++) { const an = k / 30 * TAU; c.beginPath(); c.moveTo(Math.cos(an) * 0.16, Math.sin(an) * 0.16); c.lineTo(Math.cos(an) * 0.52, Math.sin(an) * 0.52); c.stroke(); } });
    const an = Math.atan2(p.y - y, p.x - (x - 1.4)), ix = Math.cos(an) * 0.26, iy = Math.sin(an) * 0.26;
    ctx.save(); ctx.translate(-1.4, 0); ctx.beginPath(); ctx.ellipse(0, 0, 0.96, 0.06 + eo * 0.86, 0, 0, TAU); ctx.clip();
    putF(ctx, R.sp, eb, ef);
    ctx.translate(ix, iy); put(ctx, ir);
    ctx.fillStyle = '#120206'; ctx.beginPath(); ctx.ellipse(0, 0, 0.1 + ef * 0.1, 0.42 - ef * 0.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-0.2, 0.22, 0.08, 0, TAU); ctx.fill();
    ctx.restore();
    glow(ctx, -1.4 + ix, iy, 1.2, '#ffd24a', 0.3 * eo * pw);
  }
  // まぶたの縁
  ctx.strokeStyle = '#6a1430'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.ellipse(-1.4, 0, 0.98, 0.07 + eo * 0.87, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,170,190,0.6)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.ellipse(-1.4, 0.03, 0.98, 0.07 + eo * 0.87, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  ctx.restore();
  if (R.chance(4)) R.fx.debris(x + R01() * 3 - 1, y - 3.4, 0, -0.6, 0.07, 0.8, 'flesh');
}

// =============================================================================
// 6. NUCLEUS（C25）: 半透明の膜細胞の輪・核の内部構造・分裂（芽）・突進の変形
function nucleus(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw, gl = e.glow || 0;
  // 突進の変形（進む向きに伸び、止まると縮む）
  const vx = x - (v.lx ?? x); v.lx = x; v.str = lerp(v.str || 0, clamp(-vx * 1.6, -0.25, 0.3), 0.25);
  const sx = 1 + v.str, sy = 1 - v.str * 0.6;
  // 細胞質（当たらない薄い膜。輪の内側だけ）
  const gel = R.sp.get('nu_gel', 6.2, 6.2, (c) => {
    const g = c.createRadialGradient(0, 0, 0.6, 0, 0, 2.95); g.addColorStop(0, 'rgba(120,255,210,0.2)'); g.addColorStop(0.7, 'rgba(60,200,160,0.1)'); g.addColorStop(1, 'rgba(60,200,160,0.02)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 2.95, 0, TAU); c.fill();
    const q = rnd(606);       // 小器官（ミトコンドリア風・小胞）
    for (let n = 0; n < 16; n++) { const an = q() * TAU, d = 1.5 + q() * 0.9, ox = Math.cos(an) * d, oy = Math.sin(an) * d, rot = q() * 3; if (n % 3) { c.save(); c.translate(ox, oy); c.rotate(rot); c.fillStyle = 'rgba(40,150,120,0.4)'; c.beginPath(); c.ellipse(0, 0, 0.24, 0.11, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(190,255,230,0.45)'; c.lineWidth = 0.02; c.stroke(); c.beginPath(); for (let k = -2; k <= 2; k++) { c.moveTo(k * 0.08, -0.07); c.lineTo(k * 0.08 + 0.03, 0.07); } c.stroke(); c.restore(); } else { c.strokeStyle = 'rgba(190,255,230,0.4)'; c.lineWidth = 0.025; c.beginPath(); c.arc(ox, oy, 0.12, 0, TAU); c.stroke(); } }
  });
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); ctx.rotate(e.rot * 0.5); ctx.globalAlpha = 0.9; put(ctx, gel); ctx.globalAlpha = 1; ctx.restore();
  glow(ctx, x, y, 3.6 + gl * 0.6, '#3affc0', (0.14 + gl * 0.35) * pw);
  // 膜細胞の輪（再生する）
  const cell = (hurt) => R.sp.get('nu_cell' + (hurt ? 'h' : ''), 1.7, 1.7, (c) => {
    const col = hurt ? '#c8f0a0' : '#5adcb0', r = 0.73;
    const g = c.createRadialGradient(-0.16, 0.2, 0.05, 0, 0, r); g.addColorStop(0, rgba(lite(col, 0.55), 0.6)); g.addColorStop(0.72, rgba(col, 0.48)); g.addColorStop(0.9, rgba(lite(col, 0.5), 0.92)); g.addColorStop(1, rgba(dark(col, 0.3), 0.95));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.strokeStyle = rgba(dark(col, 0.6), 0.9); c.lineWidth = 0.03; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.025; c.beginPath(); c.arc(0, 0, r - 0.1, 0.4, 2.2); c.stroke();
    ball(c, 0.08, 0.02, 0.24, '#157a58', { hi: '#7af0c0', lo: '#06281e', lw: 0.02 }); fillP(c, ci(0.12, 0.0, 0.08), '#04140e');
    for (const [px, py, pr] of [[-0.36, -0.2, 0.08], [0.3, 0.34, 0.06], [-0.2, 0.4, 0.05], [0.38, -0.28, 0.08]]) { c.fillStyle = rgba(dark(col, 0.45), 0.55); c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-0.3, 0.44, 0.2, 0.07, -0.6, 0, TAU); c.fill();
    if (hurt) { crack(c, -0.4, 0.3, -0.5, 0.7, 61, 0.025); crack(c, 0.3, -0.4, 2.2, 0.5, 62, 0.02); }
  });
  for (const q of e.parts) if (q.free) {
    const [qx, qy] = pxy(R, q);
    if (!q.alive) { const k = Math.min(1, q.regen / 380); ctx.strokeStyle = `rgba(160,255,220,${0.1 + k * 0.4})`; ctx.lineWidth = 0.04; ctx.setLineDash([0.16, 0.12]); ctx.beginPath(); ctx.arc(qx, qy, 0.72 * (0.2 + 0.8 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([]); if (k > 0.8) glow(ctx, qx, qy, 0.6, '#7af0c8', (k - 0.8) * 3); q._h = undefined; v['g' + q.i] = 0; continue; }
    const f = fl(R, q, 3), grow = v['g' + q.i] = Math.min(1, (v['g' + q.i] ?? 1) + R.dt * 3);
    const w = Math.sin(now * 3 + q.i * 1.7) * 0.05, s = grow * (1 + f * 0.08);
    ctx.save(); ctx.translate(qx, qy); ctx.rotate(e.rot + q.i / 18 * TAU); ctx.scale(s * (1 + w), s * (1 - w)); putF(ctx, R.sp, cell(q.hp < q.maxHp * 0.6), f); ctx.restore();
  }
  // 核: 外膜 → 回る染色糸 → 核小体
  const core = e.parts[0], cf = fl(R, core, 3), beat = Math.pow(Math.max(0, Math.sin(now * 5)), 3);
  const shell = R.sp.get('nu_shell', 2.8, 2.8, (c) => {
    const g = c.createRadialGradient(-0.3, 0.35, 0.1, 0, 0, 1.17); g.addColorStop(0, 'rgba(255,240,170,0.75)'); g.addColorStop(0.6, 'rgba(255,150,50,0.6)'); g.addColorStop(0.9, 'rgba(255,200,120,0.95)'); g.addColorStop(1, 'rgba(140,40,0,0.95)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1.17, 0, TAU); c.fill(); c.strokeStyle = '#5a1a00'; c.lineWidth = 0.04; c.stroke();
    for (let k = 0; k < 14; k++) { const an = k / 14 * TAU; fillP(c, ci(Math.cos(an) * 1.05, Math.sin(an) * 1.05, 0.05), 'rgba(90,20,0,0.6)'); }      // 核膜孔
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(-0.45, 0.7, 0.34, 0.1, -0.6, 0, TAU); c.fill();
  });
  const chrom = R.sp.get('nu_chrom', 2.2, 2.2, (c) => {
    const q = rnd(707); c.lineCap = 'round';
    for (let n = 0; n < 7; n++) { let an = q() * TAU, px = Math.cos(an) * 0.3, py = Math.sin(an) * 0.3; c.beginPath(); c.moveTo(px, py); for (let i = 0; i < 9; i++) { an += (q() - 0.5) * 2.2; px = clamp(px + Math.cos(an) * 0.2, -0.75, 0.75); py = clamp(py + Math.sin(an) * 0.2, -0.75, 0.75); c.lineTo(px, py); } c.strokeStyle = 'rgba(140,30,0,0.75)'; c.lineWidth = 0.09; c.stroke(); c.strokeStyle = 'rgba(255,230,150,0.6)'; c.lineWidth = 0.03; c.stroke(); }
  });
  const nucl = R.sp.get('nu_nucl', 1.0, 1.0, (c) => { ball(c, 0, 0, 0.38, '#ffe27a', { hi: '#ffffff', lo: '#e0601a', lw: 0.03, line: '#5a1a00' }); });
  const sc = 1 + beat * 0.05 + cf * 0.08;
  ctx.save(); ctx.translate(x, y); ctx.scale(sx * sc, sy * sc);
  putF(ctx, R.sp, shell, cf);
  ctx.save(); ctx.rotate(now * 0.8); put(ctx, chrom); ctx.restore();
  ctx.save(); ctx.translate(Math.cos(now * 1.3) * 0.18, Math.sin(now * 1.7) * 0.14); put(ctx, nucl); ctx.restore();
  ctx.restore();
  glow(ctx, x, y, 2.0 + beat * 0.4 + gl, '#ff7a2a', (0.22 + beat * 0.12 + gl * 0.4) * pw);
  // 分裂（細胞を生む）: 核の左に芽がふくらむ
  if (e.st === 'spawn') { const t = e.stT, k = t < 20 ? t / 20 : t < 50 ? (t - 20) / 30 : 0, up = t < 20 ? 1 : -1; if (k > 0) { glow(ctx, x - 3.5 * k, y + up * 2 * k, 0.9 * k, '#7af0c8', 0.8); if (R.chance(40)) R.fx.bubbleP(x - 3 * k + (R01() - 0.5), y + up * 2 * k + (R01() - 0.5), 0, 0.5, 0.14, 0.5); } }
  if (e.shake && R.chance(60)) R.fx.bubbleP(x + (R01() - 0.5) * 6, y + (R01() - 0.5) * 6, -2, 0, 0.16, 0.4);
  if (R.chance(6)) R.fx.bubbleP(x + (R01() - 0.5) * 5, y + (R01() - 0.5) * 5, 0, 0.6, 0.1 + R01() * 0.1, 0.9);
}

// =============================================================================
// 7. OMEGA CORE（C26）: 3 つの姿 — ①砲台の並ぶ要塞の壁 ②外板が飛び、回る障壁に守られたコア ③焼け落ちた壁を離れて脈打つ中枢
function omega(R, e, x, y, v, o) {
  const ctx = R.ctx, now = R.now, pw = o.pw, ph = e.phase;
  const wall = (lv) => R.sp.get('om_wall' + lv, 6.0, 15.4, (c) => {
    // lv 0: 無傷の装甲壁、1: 外板が剥がれて骨組みが見える、2: 焼け落ちた残骸
    const base = lv === 2 ? '#2b2a30' : '#1a1f2c';
    solid(c, rr(0.35, -7.5, 4.7, 15, 0.1), base, { d: 0.1, lw: 0.05, tex: 'grit', texA: 0.4 });
    // 骨組み（外板の下）
    for (let yy = -6.9; yy < 7; yy += 1.38) { solid(c, rr(0.5, yy, 4.4, 0.22, 0.03), lv === 2 ? '#3a3636' : '#39435a', { g: 'cyl', d: 0, lw: 0.025 }); }
    for (const xx of [1.3, 2.7, 4.1]) solid(c, rr(xx, -7.3, 0.24, 14.6, 0.03), lv === 2 ? '#3a3636' : '#39435a', { g: 'cylx', d: 0, lw: 0.025 });
    if (lv > 0) for (let k = 0; k < 9; k++) { const q = rnd(800 + k), px = 0.8 + q() * 3.6, py = -6.6 + q() * 13; c.strokeStyle = ['#c84a2a', '#3a6ad0', '#c8a82a'][k % 3]; c.lineWidth = 0.05; c.beginPath(); c.moveTo(px, py); c.bezierCurveTo(px + 0.5, py - 0.6, px - 0.4, py - 1.0, px + 0.3, py - 1.5); c.stroke(); }      // 垂れた配線
    // 外板
    const q = rnd(900);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 3; col++) {
      const px = 0.5 + col * 1.5, py = -7.25 + row * 1.82, keep = q();
      if (lv === 1 && keep < 0.42) continue; if (lv === 2 && keep < 0.8) continue;
      if (Math.abs(py + 0.9) < 1.4 && col < 2) continue;                      // コアの窓
      const pl = rr(px, py, 1.44, 1.74, 0.06);
      if (lv > 0) { c.save(); c.translate(px + 0.72, py + 0.87); c.rotate((q() - 0.5) * 0.14 * lv); c.translate(-px - 0.72, -py - 0.87); }
      solid(c, pl, lv === 2 ? '#4a4648' : col === 0 ? '#8795b6' : '#65728f', { d: 0.07, hi: lv === 2 ? '#7a7474' : '#dfe8f8', tex: 'grit', texA: lv === 2 ? 0.7 : 0.3, lw: 0.04 });
      for (const [rx, ry] of [[0.14, 0.14], [1.3, 0.14], [0.14, 1.6], [1.3, 1.6]]) rivet(c, px + rx, py + ry, 0.035);
      if ((row + col) % 3 === 0) fillP(c, rr(px + 0.3, py + 0.6, 0.84, 0.5, 0.04), 'rgba(0,0,0,0.3)');
      if (lv > 0) { crack(c, px + 0.3, py + 1.4, -0.9, 1.1, 950 + row * 3 + col, 0.03, lv === 2 ? '#ff5a2a' : null); c.restore(); }
    }
    // 上下の端・警告帯
    for (const s of [1, -1]) { solid(c, rr(0.2, s * 7.1 - 0.4, 5.0, 0.8, 0.1), lv === 2 ? '#3a3636' : '#4a566e', { d: 0.07, lw: 0.045 }); if (lv < 2) hazard(c, rr(0.4, s * 7.1 - 0.12, 4.6, 0.24, 0.03), 0.2); }
    // 光線の発生器の座（3 基）と砲台の座（4 基）
    for (const oy of [-3.9, 0, 3.9]) { if (oy === 0) continue; solid(c, rpg([[0.2, oy - 0.62], [1.1, oy - 0.5], [1.1, oy + 0.5], [0.2, oy + 0.62]], 0.08), lv === 2 ? '#3a3636' : '#39435a', { d: 0.05, lw: 0.04 }); ball(c, 0.52, oy, 0.36, '#10141e', { spec: 0.2, lw: 0.03 }); }
    for (const oy of [5.6, 2.2, -2.2, -5.6]) { solid(c, rr(-0.5, oy - 0.3, 1.2, 0.6, 0.06), lv === 2 ? '#2c2a2c' : '#2c3548', { d: 0.04, lw: 0.035 }); if (lv > 0) { fillP(c, el(-0.3, oy, 0.5, 0.36, 0.2), 'rgba(6,6,8,0.75)'); crack(c, -0.3, oy, 0.5, 0.8, 980 + oy * 2 | 0, 0.03, '#ff7a2a'); } }       // 壊れた砲台の跡
    // コアの窓枠
    solid(c, ci(0.4, 0, 1.5), lv === 2 ? '#3a3636' : '#4a566e', { d: 0.09, lw: 0.05 }); fillP(c, ci(0.4, 0, 1.18), '#06080e');
    for (let k = 0; k < 12; k++) { const an = k / 12 * TAU; rivet(c, 0.4 + Math.cos(an) * 1.34, Math.sin(an) * 1.34, 0.04); }
    if (lv === 2) { fillP(c, pg([[5.05, 3.0], [4.2, 3.4], [4.5, 2.2], [5.05, 2.0]]), '#06080e'); fillP(c, pg([[0.35, -5.0], [1.0, -4.6], [0.7, -4.0], [0.35, -3.9]]), '#06080e'); }
  }, { ox: 2.5 });
  const wlv = ph === 1 ? 0 : ph === 2 ? 1 : 2;
  ctx.save(); ctx.translate(x, y);
  put(ctx, wall(wlv));
  // 壁の灯り（フェーズで色が変わる）・焼け跡の火
  const lc = ph === 1 ? '#4ab0ff' : ph === 2 ? '#ffb040' : '#ff3a2a';
  for (let k = 0; k < 6; k++) { const yy = -6.3 + k * 2.52, on = ph === 3 ? (Math.sin(now * 13 + k * 5) > 0.3 ? 0.6 : 0) : 0.5 + 0.3 * Math.sin(now * 3 + k); glow(ctx, 4.7, yy, 0.3, lc, on * pw); }
  if (ph === 3) { for (const [fx2, fy2] of [[1.6, 4.4], [3.2, -2.6], [2.0, -5.6], [3.8, 1.6]]) glow(ctx, fx2, fy2, 1.2 + 0.2 * Math.sin(now * 9 + fx2), '#ff5a1a', 0.35); }
  // 光線の発生器: 溜めと発射（フェーズ 1）
  const ch = e.st === 'charge' ? clamp(e.charge || 0, 0, 1) : 0, beam = ph === 1 && e.st === 'beam';
  for (const oy of [-3.9, 0, 3.9]) {
    if (ph !== 1) { if (oy !== 0) glow(ctx, 0.52, oy, 0.25, '#ff3a2a', 0.2 * pw); continue; }
    if (ch > 0) { glow(ctx, 0.5, oy, 0.3 + ch * 0.7, '#ffb040', 0.5 + ch * 0.5); glow(ctx, 0.5, oy, 0.14 + ch * 0.24, '#ffffff', ch); streak(ctx, 0.5 - 12, oy, 12, 0.07, '#ff5030', ch * 0.4, 'bar'); }
    else if (beam) { glow(ctx, 0.5, oy, 0.8 + 0.2 * Math.sin(now * 60), '#ff9a6a', 1); glowE(ctx, -0.3, oy, 1.2, 0.24, '#ffffff', 0.8); }
    else if (oy !== 0) glow(ctx, 0.52, oy, 0.24, '#ffb040', 0.4 * pw);
  }
  if (ch > 0 && R.chance(70)) { const oy = [-3.9, 0, 3.9][(R01() * 3) | 0], an = R01() * TAU; R.fx.ember(x + 0.5 + Math.cos(an) * 1.2, y + oy + Math.sin(an) * 1.2, -Math.cos(an) * 5, -Math.sin(an) * 5, 0.07, 0.24, 4, 0); }
  ctx.restore();
  // 砲台（フェーズ 1）: 自機を狙う砲身、発射で後座
  const gunS = R.sp.get('om_gun', 1.9, 1.9, (c) => { ball(c, 0, 0, 0.82, '#7b88a8', { hi: '#e6eefb', lo: '#222a3c', lw: 0.04, tex: 'brush', texA: 0.2, spec: 0.5 }); c.strokeStyle = 'rgba(10,14,24,0.6)'; c.lineWidth = 0.02; c.beginPath(); c.arc(0, 0, 0.58, 0, TAU); c.stroke(); ball(c, 0, 0, 0.3, '#141a28', { spec: 0, lw: 0.03 }); lamp(c, 0, 0, 0.15, '#4ab0ff', 2); });
  const gunB = R.sp.get('om_gunb', 1.6, 0.7, (c) => { solid(c, rr(0, -0.15, 1.1, 0.3, 0.03), '#8b98b8', { g: 'cyl', d: 0.02, lw: 0.03 }); solid(c, rr(0.95, -0.2, 0.24, 0.4, 0.05), '#27303f', { g: 'cyl', d: 0.02, lw: 0.03 }); solid(c, rr(0.4, -0.19, 0.1, 0.38, 0.02), '#48546e', { g: 'cyl', d: 0.01, lw: 0.02 }); }, { ox: 0.6 });
  const p = R.g.player;
  for (const q of e.parts) if (q.name === 'gun') {
    if (!q.alive) { if (R.chance(5)) R.fx.smoke(q.x, q.y, -0.5, 0.8, 0.35, 0.9, 0.5); continue; }
    const [qx, qy] = pxy(R, q), f = fl(R, q), an = Math.atan2(p.y - qy, p.x - qx), dm = 1 - q.hp / q.maxHp;
    const tf = (e.t + q.oy * 13 | 0) % R.g.fireInterval(60); if (tf < 2 && ph === 1 && e.st !== 'enter') q._rec = 1; q._rec = Math.max(0, (q._rec || 0) - R.dt * 5);
    ctx.save(); ctx.translate(qx, qy); const s2 = 1 + f * 0.06; ctx.scale(s2, s2);
    ctx.save(); ctx.rotate(an); ctx.translate(-q._rec * 0.2, 0); putF(ctx, R.sp, gunB, f); if (q._rec > 0.6) glowE(ctx, 1.5, 0, 0.6, 0.18, '#ffe0a0', (q._rec - 0.6) * 2.5); ctx.restore();
    putF(ctx, R.sp, gunS, f); glow(ctx, 0, 0, 0.36, dm > 0.6 ? '#ff4a2a' : '#4ab0ff', (0.5 + 0.2 * Math.sin(now * 6 + q.oy)) * pw);
    ctx.restore();
    if (dm > 0.5 && R.chance(10)) R.fx.smoke(qx, qy + 0.4, -0.5, 1, 0.3, 0.7, 0.5);
    if (dm > 0.75 && R.chance(8)) R.fx.spk(qx, qy, (R01() - 0.5) * 8, R01() * 6, 0.2, 0);
  }
  // コア（フェーズ 1: 重い扉の奥で暗い／フェーズ 2: 露出して青く輝く）
  const core = e.parts[7];
  if (core.alive) {
    const [cx, cy] = pxy(R, core), cf = fl(R, core), p2 = ph >= 2, beat = Math.pow(Math.max(0, Math.sin(now * 6)), 4);
    const cs = R.sp.get('om_core', 2.2, 2.2, (c) => { ball(c, 0, 0, 1.0, '#2a7ad8', { hi: '#d8f4ff', lo: '#06143a', lw: 0.045, line: '#040a1a', spec: 0.6 }); c.strokeStyle = 'rgba(200,240,255,0.7)'; c.lineWidth = 0.035; for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(0, 0, 0.9, 0.3 + k * 0.22, k * 1.05, 0, TAU); c.stroke(); } ball(c, 0, 0, 0.42, '#bff0ff', { hi: '#ffffff', lo: '#3a9ae8', lw: 0, spec: 0 }); });
    ctx.save(); ctx.translate(cx, cy); const s2 = 1 + (p2 ? beat * 0.05 : 0) + cf * 0.07; ctx.scale(s2, s2); putF(ctx, R.sp, cs, cf);
    if (!p2) {      // 閉じた扉（4 枚の楔）
      const door = R.sp.get('om_door', 1.4, 1.4, (c) => { solid(c, pg([[0.04, 0.04], [1.14, 0.04], [1.14, 0.5], [0.5, 1.14], [0.04, 1.14]]), '#5a6680', { d: 0.06, lw: 0.04, tex: 'brush', texA: 0.25 }); hazard(c, pg([[0.75, 0.1], [1.08, 0.1], [1.08, 0.44], [0.75, 0.44]]), 0.1); rivet(c, 0.25, 0.25, 0.04); }, { ox: 0.6, oy: 0.6 });
      for (let k = 0; k < 4; k++) { ctx.save(); ctx.rotate(k * Math.PI / 2); put(ctx, door); ctx.restore(); }
      glow(ctx, 0, 0, 0.5, '#4ab0ff', (0.4 + 0.2 * Math.sin(now * 3)) * pw);
    }
    ctx.restore();
    if (p2) { glow(ctx, cx, cy, 2.2 + beat * 0.5, '#4ab0ff', (0.6 + beat * 0.3) * pw); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(160,220,255,0.6)'; ctx.lineWidth = 0.05; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(cx, cy, 1.3, 1.3 * Math.abs(Math.sin(now * 1.4 + k * 1.5)) + 0.12, now * (k ? -0.8 : 1.1), 0, TAU); ctx.stroke(); } ctx.globalCompositeOperation = 'source-over'; }
  }
  // 回る障壁（フェーズ 2）: 節を光の棒でつなぐ 2 本の腕
  if (ph === 2) {
    const node = R.sp.get('om_bar', 1.2, 1.2, (c) => { ball(c, 0, 0, 0.5, '#e8b84a', { hi: '#fff6c8', lo: '#6a4408', lw: 0.04, line: '#2a1a00', spec: 0.7 }); c.strokeStyle = '#2a1a00'; c.lineWidth = 0.04; c.beginPath(); c.arc(0, 0, 0.3, 0, TAU); c.stroke(); fillP(c, ci(0, 0, 0.16), '#fff0b0'); });
    for (let k = 0; k < 2; k++) {
      const bs = e.parts.filter((q) => q.name === 'bar' && q.k === k), [x0, y0] = pxy(R, bs[0]), [x1, y1] = pxy(R, bs[3]), an = Math.atan2(y1 - y0, x1 - x0);
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(an); streak(ctx, -1.2, 0, Math.hypot(x1 - x0, y1 - y0) + 1.4, 0.7, '#ffb040', 0.75, 'bar'); ctx.restore();
      for (const q of bs) { const [qx, qy] = pxy(R, q); ctx.save(); ctx.translate(qx, qy); ctx.rotate(an); put(ctx, node); ctx.restore(); glow(ctx, qx, qy, 0.7, '#ffc04a', 0.5 + 0.2 * Math.sin(now * 12 + q.i)); }
      if (R.chance(20)) R.fx.ember(x1, y1, (R01() - 0.5) * 2, (R01() - 0.5) * 2, 0.07, 0.4, 4, 0);
    }
  }
  // 中枢（フェーズ 3）: 壁を離れて飛ぶ、脈打つ赤い心臓。配線の尾と鼓動の輪
  const h = e.parts[8];
  if (h.vis && h.alive) {
    const [hx, hy] = pxy(R, h), hf = fl(R, h), t = now * 7.5, b1 = Math.pow(Math.max(0, Math.sin(t)), 8), b2 = Math.pow(Math.max(0, Math.sin(t - 0.9)), 8), beat = Math.max(b1, b2 * 0.7);
    const tr = v.tr || (v.tr = []); if (tr.length && Math.hypot(tr[0] - hx, tr[1] - hy) > 1.2) tr.length = 0; tr.unshift(hx, hy); if (tr.length > 32) tr.length = 32;
    // 尾（切れた配線が後ろに流れる）
    ctx.lineCap = 'round';
    for (let k = 0; k < 5; k++) { ctx.strokeStyle = ['#7a1a2a', '#4a1020', '#a82a3a', '#3a2a5a', '#7a1a2a'][k]; ctx.lineWidth = 0.1 - k * 0.008; ctx.beginPath(); for (let i = 0; i < tr.length; i += 2) { const u = i / 32, an = k * 1.26 + now * 0.5, px = tr[i] + Math.cos(an + u * 5) * (0.55 + u * 0.5), py = tr[i + 1] + Math.sin(an + u * 5) * (0.55 + u * 0.5); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
    for (let i = 8; i < tr.length; i += 8) glow(ctx, tr[i], tr[i + 1], 0.9, '#ff2a5a', 0.25 * (1 - i / tr.length));
    const hs = R.sp.get('om_heart', 2.0, 2.0, (c) => {
      ball(c, 0, 0, 0.85, '#d81e48', { hi: '#ff9ab0', lo: '#3a0414', lw: 0.045, line: '#1a0208', tex: 'blot', texA: 0.4, spec: 0.6 });
      c.save(); ci(0, 0, 0.85)(c); c.clip();
      vein(c, 0.7, 0.4, 3.4, 1.2, 301, 'rgba(60,0,20,0.7)', 0.05); vein(c, -0.2, -0.8, 1.2, 1.2, 302, 'rgba(60,0,20,0.7)', 0.05); vein(c, -0.7, 0.3, -0.4, 1.0, 303, 'rgba(255,170,190,0.5)', 0.03);
      c.restore();
      // 機械の枠（割れた殻の名残）
      for (let k = 0; k < 3; k++) { c.save(); c.rotate(k * 2.1 + 0.4); solid(c, pg([[0.62, -0.22], [0.98, -0.16], [0.98, 0.16], [0.62, 0.22]]), '#6a7690', { d: 0.03, lw: 0.03 }); c.restore(); }
      ball(c, 0, 0, 0.3, '#ffd0dc', { hi: '#ffffff', lo: '#ff5a8a', lw: 0, spec: 0 });
    });
    const s2 = 1 + beat * 0.14 + hf * 0.08;
    glow(ctx, hx, hy, 2.4 + beat * 0.9, '#ff2a5a', (0.5 + beat * 0.4) * pw);
    ctx.save(); ctx.translate(hx, hy); ctx.scale(s2, s2); putF(ctx, R.sp, hs, hf); ctx.restore();
    glow(ctx, hx, hy, 0.6 + beat * 0.4, '#ffffff', 0.5 + beat * 0.5);
    if (b1 > 0.9 && !v.bt) { v.bt = true; R.fx.ring(hx, hy, 0.8, 2.6, 0.4, 2, 0.6); } if (b1 < 0.3) v.bt = false;
    if (R.chance(14)) R.fx.spk(hx, hy, (R01() - 0.5) * 9, (R01() - 0.5) * 9, 0.2, 2, 0);
  }
  // フェーズ移行の演出（外板・殻が飛ぶ）
  if (v.ph !== undefined && ph > v.ph) {
    for (let i = 0; i < 26; i++) R.fx.debris(x + 0.5 + R01() * 3, y + (R01() - 0.5) * 13, -3 - R01() * 8, (R01() - 0.3) * 8, 0.16 + R01() * 0.16, 1.2);
    for (let i = 0; i < 5; i++) R.fx.explode(x + 1 + R01() * 2.5, y + (R01() - 0.5) * 12, i ? 'm' : 'l');
  }
  v.ph = ph;
  if (ph === 3 && R.chance(14)) R.fx.fire(x + 1 + R01() * 3, y + (R01() - 0.5) * 13, -0.3, 1.2, 0.5, 0.5);
  if (ph >= 2 && R.chance(ph * 5)) R.fx.smoke(x + 1 + R01() * 3, y + (R01() - 0.5) * 13, -0.4, 1, 0.5, 1.2, 0.5);
  if (ph >= 2 && R.chance(8)) R.fx.spk(x + 0.5 + R01() * 4, y + (R01() - 0.5) * 13, (R01() - 0.5) * 8, (R01() - 0.3) * 8, 0.2, 1);
}

// =============================================================================
const B = { ignis, warden, colossus, crusher, hydra, nucleus, omega };
// 登場（C30）: 灯りを落として滑り込み、定位置で起動（光が入り、輪が広がる）。撃破: 震えながら沈み、最後に消える
export function drawBoss(R, e, x, y) {
  const d = B[e.type]; if (!d) return;
  const ctx = R.ctx, v = V(e), mat = MAT[e.type], now = R.now;
  if (e.st === 'enter') {
    v.pw = 0; v.on = false;
    // 登場の気配: 材質ごとの塵・蒸気・泡
    if (R.chance(30)) { const px = x + (R01() - 0.3) * 5, py = y + (R01() - 0.5) * 9; if (mat === 'rock') R.fx.smoke(px, py, 1, -0.5, 0.4, 0.9, 0.4, 'dust'); else if (mat === 'cell') R.fx.bubbleP(px, py, 1.5, 0.3, 0.16, 0.7); else if (mat === 'flesh') R.fx.smoke(px, py, 1, 0, 0.4, 0.8, 0.35, 'mistF'); else R.fx.smoke(px + 3, py, 2.5, 0, 0.4, 0.7, 0.35, 'steam'); }
  } else {
    if (!v.on) { v.on = true; if (v.pw === 0) { R.fx.ring(x, y, 1, 8, 0.6, mat === 'flesh' ? 2 : mat === 'cell' ? 3 : 4, 0.6); R.fx.flash(0.14); R.fx.shake(0.3); } }
    v.pw = Math.min(1, (v.pw ?? 1) + R.dt * 1.4);
  }
  const [hp, mx] = BOSS[e.type].bossHp(e), ratio = mx ? hp / mx : 1;
  const o = { pw: v.pw, lv: ratio < 0.34 ? 2 : ratio < 0.67 ? 1 : 0, dead: e.dead, k: 0 };
  if (e.type === 'omega') o.lv = 0;
  ctx.save();
  if (e.dead) {
    const k = o.k = clamp(1 - (e.linger || 0) / 160, 0, 1);
    o.lv = 2; o.pw = (Math.sin(now * 37) > 0.2 ? 1 : 0.15) * (1 - k);
    ctx.translate(Math.sin(now * 61) * 0.09 * (1 - k * 0.5), -k * k * 2.2);
    if (k > 0.88) ctx.globalAlpha = clamp(1 - (k - 0.88) / 0.1, 0, 1);
  }
  if (e.shake) ctx.translate(Math.sin(now * 70) * 0.07, Math.cos(now * 53) * 0.03);
  if (ctx.globalAlpha > 0.02) d(R, e, x, y, v, o);
  ctx.restore(); ctx.globalAlpha = 1;
  // 損傷に応じた煙・火花（装甲の部位から）
  if (o.lv > 0 && !e.dead && e.type !== 'omega' && e.type !== 'nucleus' && R.chance(o.lv * 7)) {
    const ps = e.parts.filter((q) => q.armor && !q.free); if (ps.length) { const q = ps[(R01() * ps.length) | 0], px = q.x + (R01() - 0.5) * q.r * 1.4, py = q.y + (R01() - 0.5) * q.r * 1.4;
      if (mat === 'machine') { R.fx.smoke(px, py, 0.6, 0.9, 0.4 + o.lv * 0.1, 1.0, 0.5); if (o.lv > 1 && R01() < 0.5) R.fx.spk(px, py, (R01() - 0.5) * 9, (R01() - 0.2) * 8, 0.22, 0); if (o.lv > 1 && R01() < 0.3) R.fx.fire(px, py, 0.4, 0.8, 0.45, 0.4); }
      else if (mat === 'rock') { R.fx.smoke(px, py, 0, -0.6, 0.3, 0.8, 0.4, 'dust'); if (R01() < 0.4) R.fx.debris(px, py, (R01() - 0.5) * 2, 0, 0.08, 0.9, 'rock'); }
      else R.fx.debris(px, py, (R01() - 0.5) * 2, -0.5, 0.08, 0.8, 'flesh'); }
  }
}
// 崩壊中の誘爆（k: 0→1 で激しくなる。final = 最後の大爆発）
export function bossCollapse(R, e, k, final) {
  const fx = R.fx, mat = MAT[e.type] || 'machine';
  const ps = e.parts.filter((q) => (q.alive || q.armor) && q.vis !== false && q.y > -2 && q.y < VIEW_H + 2);
  const pick = () => ps.length ? ps[(R01() * ps.length) | 0] : e;
  if (final) {
    fx.explode(e.x, e.y, 'l', mat); for (let i = 0; i < 4; i++) { const q = pick(); fx.explode(q.x + (R01() - 0.5) * 2, q.y + (R01() - 0.5) * 2, i < 2 ? 'l' : 'm', mat); }
    fx.ring(e.x, e.y, 1, 16, 0.9, 4, 0.9); fx.ring(e.x, e.y, 0.5, 10, 0.6, MAT[e.type] === 'flesh' ? 2 : 0, 0.8);
    for (let i = 0; i < 30; i++) { const an = R01() * TAU, sp = 4 + R01() * 12; fx.debris(e.x + (R01() - 0.5) * 3, e.y + (R01() - 0.5) * 4, Math.cos(an) * sp, Math.sin(an) * sp + 3, 0.14 + R01() * 0.2, 1.4 + R01() * 0.6, mat === 'cell' ? 'cell' : mat === 'flesh' ? 'flesh' : mat === 'rock' ? 'rock' : 'machine'); }
    return;
  }
  const q = pick(), r = q.r || 1;
  fx.explode(q.x + (R01() - 0.5) * r * 1.6, q.y + (R01() - 0.5) * r * 1.6, R01() < 0.25 + k * 0.4 ? 'm' : 's', mat);
  if (R01() < 0.5) fx.debris(q.x, q.y, (R01() - 0.5) * 8, R01() * 6, 0.14 + R01() * 0.12, 1.2, mat === 'rock' ? 'rock' : mat === 'machine' ? 'machine' : mat);
}
