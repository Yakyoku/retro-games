// ORBITAL WINGS 2D — 自機・装備・弾・雑魚敵の絵。
// 動かない層は Sprites に焼き、動く部位・発光は毎フレーム上に重ねる。当たり判定（e.r など）と見た目の大きさを合わせる。
// R = Render2D（ctx, sp, fx, now, dt, cam, g, pal を持つ）
import { VIEW_W, VIEW_H, SHIELD } from '../shared/config.js';
import { TAU, lerp, clamp, ease, rgba, mix, lite, dark, rnd, pg, rpg, ci, el, rr, blobPath, rot2, mirY, tex, solid, ball, seam, rivet, lamp, glass, shadow, crack, hazard, put, putF, glow, glowE, streak, K } from './kit2d.js';

const R01 = Math.random;
const V = (e) => e._v || (e._v = {});
const line = (c, pts, col, w) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
const fillP = (c, sh, col) => { sh(c); c.fillStyle = col; c.fill(); };

// =============================================================================
// 自機（C1〜C3）
// k: -1（上昇中＝機体の腹が見える）〜 +1（下降中＝背が見える）。7 枚のロール絵を作る
function paintShip(c, k) {
  const phi = 0.42 + k * 0.4, sn = Math.sin(phi), cs = Math.cos(k * 0.75);
  const hull = '#dde3ee', blue = '#2f6bff', red = '#e8402a', dk = '#232a3a';
  // 奥の主翼（胴の向こう側。背が見えるほど上に出る）
  if (sn > 0.12) { const fy = 0.1 + 0.62 * sn; solid(c, pg([[0.16, 0.08], [-0.5, fy], [-0.8, fy], [-0.6, 0.08]]), '#8791a6', { d: 0.025, rim: 0.3 }); lamp(c, -0.66, fy, 0.022, '#3aff8a', 2.2); }
  // 垂直尾翼（ロールで見かけの高さが変わる）
  const fh = 0.5 * cs + 0.05, fb = 0.15;
  solid(c, pg([[-0.14, fb], [-0.5, fb + fh], [-0.8, fb + fh], [-0.74, fb]]), '#c3ccdc', { d: 0.028 });
  fillP(c, pg([[-0.415, fb + fh * 0.6], [-0.5, fb + fh * 0.84], [-0.775, fb + fh * 0.84], [-0.76, fb + fh * 0.6]]), blue);
  fillP(c, pg([[-0.5, fb + fh * 0.9], [-0.52, fb + fh], [-0.8, fb + fh], [-0.795, fb + fh * 0.9]]), red);
  seam(c, [[-0.3, fb + 0.02], [-0.62, fb + fh * 0.5]], 0.012, 0.45);
  // 噴射口（2 基）
  for (const oy of [0.04, -0.21]) { solid(c, rr(-1.0, oy, 0.16, 0.17, 0.03), '#4a5266', { g: 'cyl', d: 0.015 }); fillP(c, rr(-1.0, oy + 0.035, 0.035, 0.1, 0.01), '#bfeaff'); }
  // 胴体
  const fus = rpg([[1.06, -0.01], [0.52, 0.1], [0.05, 0.2], [-0.62, 0.22], [-0.9, 0.17], [-0.9, -0.17], [-0.6, -0.21], [0.0, -0.18], [0.55, -0.09]], 0.035);
  solid(c, fus, hull, { d: 0.04, lo: '#6a748a', hi: '#ffffff', mid: 0.36, tex: 'brush', texA: 0.18 });
  c.save(); fus(c); c.clip();
  fillP(c, pg([[1.1, -0.06], [0.2, -0.115], [-0.95, -0.13], [-0.95, -0.3], [1.1, -0.3]]), 'rgba(40,52,84,0.55)');           // 腹側の暗い塗り分け
  fillP(c, pg([[1.1, 0.05], [0.72, 0.12], [0.6, -0.12], [1.1, -0.1]]), 'rgba(47,107,255,0.9)');                              // 機首の青
  line(c, [[0.74, -0.035], [-0.6, -0.1]], red, 0.036);
  c.restore();
  seam(c, [[0.6, 0.085], [0.62, -0.1]], 0.012); seam(c, [[-0.22, 0.2], [-0.26, -0.19]], 0.012); seam(c, [[-0.58, 0.215], [-0.58, -0.2]], 0.012);
  seam(c, [[-0.22, 0.02], [-0.58, 0.02]], 0.01, 0.4);
  for (const [x, y] of [[-0.3, 0.16], [-0.5, 0.17], [-0.66, 0.17], [0.4, 0.07]]) rivet(c, x, y, 0.012);
  // 機体番号
  c.save(); c.translate(-0.47, 0.065); c.scale(0.01, -0.01); c.font = 'bold 11px sans-serif'; c.fillStyle = 'rgba(30,40,70,0.85)'; c.fillText('07', 0, 0); c.restore();
  // エアインテーク（暗い口と縁）
  fillP(c, pg([[0.14, -0.085], [-0.2, -0.07], [-0.27, -0.19], [0.03, -0.185]]), '#0c0f18');
  line(c, [[0.14, -0.085], [-0.2, -0.07]], 'rgba(255,255,255,0.75)', 0.018); line(c, [[0.14, -0.085], [0.03, -0.185]], '#8a94a8', 0.02);
  // 操縦席
  const cy = 0.118 - k * 0.025;
  glass(c, el(0.2, cy, 0.31, 0.088 + Math.max(0, k) * 0.02, -0.08), '#2ab8f0');
  line(c, [[0.12, cy + 0.085], [0.1, cy - 0.06]], 'rgba(20,30,50,0.7)', 0.014);
  // 手前の主翼（背が見えるほど下へ広がる。腹が見える時は薄い板）
  const ty = -0.06 - Math.max(0.07, 0.92 * sn), top = k > -0.2;
  const wing = pg([[0.3, -0.06], [-0.5, ty], [-0.86, ty], [-0.62, -0.06]]);
  shadow(c, wing, 0.25, 0, -0.03);
  solid(c, wing, top ? '#cdd5e3' : '#77819a', { d: 0.03, hi: top ? '#ffffff' : '#a2acc0' });
  if (sn > 0.25) {
    c.save(); wing(c); c.clip();
    fillP(c, pg([[-0.14, lerp(-0.06, ty, 0.42)], [-0.52, lerp(-0.06, ty, 0.9)], [-0.8, lerp(-0.06, ty, 0.9)], [-0.52, lerp(-0.06, ty, 0.42)]]), top ? blue : '#1c3c8a');
    c.restore();
    seam(c, [[-0.02, lerp(-0.06, ty, 0.3)], [-0.7, lerp(-0.06, ty, 0.3)]], 0.011, 0.45);
    seam(c, [[-0.3, -0.07], [-0.66, ty + 0.01]], 0.011, 0.4);
  }
  lamp(c, -0.68, ty, 0.026, '#ff3a3a', 2.4);
}
const SHIP_N = 3;                 // ロール絵は -3..+3 の 7 枚
function shipSprite(R, b) { return R.sp.get('ship' + b, 2.5, 2.3, (c) => paintShip(c, b / SHIP_N)); }

// 噴射（芯・外炎・衝撃ダイヤ・残像）。ローカル座標（機首 +x）で呼ぶ
function thruster(R, vx, boost) {
  const ctx = R.ctx, t = R.now;
  const acc = Math.max(0, vx), dec = Math.max(0, -vx);
  const fl = 1 + Math.sin(t * 61) * 0.07 + Math.sin(t * 37.3) * 0.05;
  const L = (0.72 + acc * 0.6 - dec * 0.36 + boost * 1.5) * fl;
  const outer = dec > 0.3 ? '#ff8a3a' : acc > 0.3 || boost > 0.1 ? '#7a6dff' : '#3a8aff';
  const core = dec > 0.3 ? '#ffe2a8' : '#c8f2ff';
  for (const oy of [0.125, -0.125]) {
    streak(ctx, -0.92 - L * 2.1, oy, L * 2.1, 0.22, outer, 0.2 + boost * 0.2, 'tail');       // 残像
    streak(ctx, -0.92 - L, oy, L, 0.36, outer, 0.95, 'flame');                               // 外炎
    streak(ctx, -0.92 - L * 0.62, oy, L * 0.62, 0.17, core, 1, 'flame');                     // 芯
    for (let k = 0; k < 4; k++) {                                                            // 衝撃ダイヤ
      const dx = L * (0.14 + 0.17 * k) * (1 + Math.sin(t * 43 + k) * 0.04), s = 1 - k * 0.2;
      glowE(ctx, -0.92 - dx, oy, 0.075 * s, 0.05 * s, '#ffffff', 0.95 - k * 0.2);
    }
  }
  glow(ctx, -0.95, 0, 0.42 + boost * 0.3, outer, 0.55);
  return L;
}

export function drawPlayer(R, g) {
  const p = g.player, ctx = R.ctx, a = R.alpha, now = R.now, dt = R.dt, fx = R.fx;
  // オプション（軌跡の光の帯つき）
  const st = R.pv || (R.pv = { tilt: 0, trails: [], enter: 0, ghosts: [], hitT: 9, hitLeft: 0, muzzle: 9, absorb: [] });
  for (let i = 0; i < g.power.options; i++) {
    const o = g.optionPos(i), po = g.prevOpt?.[i] || o;
    drawOption(R, st, i, lerp(po.x, o.x, a), lerp(po.y, o.y, a), now + i * 0.37);
  }
  st.trails.length = Math.min(st.trails.length, g.power.options);
  st.muzzle += dt; st.hitT += dt;
  if (!p.alive) { st.ghosts.length = 0; return; }
  const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a);
  R.px = x; R.py = y;
  st.tilt = clamp(lerp(st.tilt, -(p.vy || 0), 1 - Math.exp(-dt * 11)) || 0, -1, 1);
  const b = Math.round(st.tilt * SHIP_N), spr = shipSprite(R, b);
  const entering = p.enter > 0, leaving = g.state === 'stageclear' && g.clearTimer > 120;
  const boost = entering ? 0.8 : leaving ? 1.3 : 0;
  // 面クリアの飛び去り: 残像を引く（開始時に輪と閃光）
  if (leaving) {
    if (!st.leave) { st.leave = true; fx.ring(x - 0.6, y, 0.3, 3.2, 0.5, 1, 0.9); fx.flashAt(x - 0.9, y, 1.6, 0.18, 1); fx.shake(0.2); }
    st.ghosts.push(x, y); if (st.ghosts.length > 16) st.ghosts.splice(0, 2);
    for (let i = 0; i < st.ghosts.length; i += 2) { ctx.globalAlpha = 0.05 + 0.3 * (i / st.ghosts.length); ctx.save(); ctx.translate(st.ghosts[i], st.ghosts[i + 1]); put(ctx, spr); ctx.restore(); }
    ctx.globalAlpha = 1;
    streak(ctx, x - 9, y, 8.2, 0.9, '#5a8aff', 0.5, 'tail');
  } else { st.leave = false; st.ghosts.length = 0; }
  // 登場: 速度線と、定位置に着いた瞬間の輪
  if (entering) {
    const k = p.enter / 40;
    for (let i = 0; i < 5; i++) { const yy = y + Math.sin(i * 2.4 + 1) * 0.5; streak(ctx, x - 1.5 - k * 7 - i * 0.7, yy, 1.2 + k * 6, 0.08, '#cfe8ff', 0.5 * k, 'tail'); }
    streak(ctx, x - 1 - k * 8, y, k * 8, 0.7, '#5a8aff', 0.45 * k, 'tail');
  }
  if (st.enter > 0 && !entering) { fx.ring(x, y, 0.4, 2.2, 0.35, 1, 0.7); fx.glint(x + 0.9, y, 0.9, 0.3); }
  st.enter = p.enter;
  ctx.save(); ctx.translate(x, y); ctx.rotate(st.tilt * -0.1);
  const L = thruster(R, p.vx || 0, boost);
  put(ctx, spr);
  // 翼端灯の点滅・機首の閃光（発射）
  const sn = Math.sin(0.42 + (b / SHIP_N) * 0.4), ty = -0.06 - Math.max(0.07, 0.92 * sn);
  if ((now * 1.6) % 1 < 0.18) glow(ctx, -0.68, ty, 0.2, '#ff4a4a', 1);
  if (st.muzzle < 0.07) { const k = 1 - st.muzzle / 0.07; glow(ctx, 1.05, 0, 0.55 * k + 0.2, st.mcol || '#ffe890', k); glowE(ctx, 1.25, 0, 0.7 * k, 0.09, '#ffffff', k); }
  // 無敵中: 輪郭の明滅（点滅で姿を消さない）
  if (p.invuln > 0 && !entering) {
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(now * 28); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(0.02, 0, 1.28, 0.6, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  // 熱の粒子
  if (R.chance(26 + boost * 60 + Math.max(0, p.vx || 0) * 30)) fx.hot(x - 0.95 - R01() * L * 0.8, y + (R01() < 0.5 ? 0.125 : -0.125), -3 - R01() * 3, (R01() - 0.5) * 0.6, 0.1 + R01() * 0.08, 0.25 + R01() * 0.2, true);
  if (g.power.shield > 0 || st.hitT < 0.45) drawShield(R, st, x, y, g.power.shield);
  // カプセルの吸い込み（取得時）
  for (let i = st.absorb.length - 1; i >= 0; i--) {
    const q = st.absorb[i]; q.t += dt; const k = q.t / 0.32;
    if (k >= 1) { st.absorb.splice(i, 1); fx.ring(x, y, 0.2, 1.5, 0.3, 5, 0.8); fx.glint(x, y, 1.2, 0.3); continue; }
    const e = k * k, cx = lerp(q.x - R.cam + R.cam, x, e), cy = lerp(q.y, y, e);
    glow(ctx, cx, cy, 0.7 * (1 - k) + 0.15, '#ff6a3a', 1);
    for (let j = 0; j < 6; j++) { const an = j / 6 * TAU + k * 9, rr2 = (1 - k) * 1.1; glow(ctx, cx + Math.cos(an) * rr2, cy + Math.sin(an) * rr2, 0.16, '#ffd080', 1 - k * 0.5); }
  }
}

// ---- オプション（C4）: 核・回る輪・プラズマの揺らぎ・光の帯 ------------------------------
function drawOption(R, st, i, x, y, t) {
  const ctx = R.ctx, cam = R.cam, dt = R.dt;
  // 軌跡（画面上の位置の履歴。後ろへ流れる）
  const tr = st.trails[i] || (st.trails[i] = []);
  for (let k = 0; k < tr.length; k += 2) tr[k] -= dt * 2.4;
  if (tr.length && Math.hypot(tr[0] - (x - cam), tr[1] - y) > 3) tr.length = 0;
  tr.unshift(x - cam, y); if (tr.length > 24) tr.length = 24;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let k = 2; k < tr.length; k += 2) {
    const u = 1 - k / tr.length;
    ctx.strokeStyle = `rgba(255,${(90 + 70 * u) | 0},30,${0.3 * u * u})`; ctx.lineWidth = 0.3 * u + 0.02;
    ctx.beginPath(); ctx.moveTo(tr[k - 2] + cam, tr[k - 1]); ctx.lineTo(tr[k] + cam, tr[k + 1]); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  const pul = 1 + Math.sin(t * 11) * 0.06;
  glow(ctx, x, y, 1.05 * pul, '#ff5a1a', 0.85);
  // 輪の奥半分 → 核 → 手前半分
  const tiltA = 0.5 + Math.sin(t * 1.3) * 0.25, ra = t * 2.2, rx = 0.47, ry = 0.47 * Math.abs(Math.sin(t * 1.9)) * 0.85 + 0.06;
  const ringHalf = (a0, a1, al) => { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,220,150,${al})`; ctx.lineWidth = 0.055; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, tiltA, a0, a1); ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = 0.02; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; };
  ringHalf(Math.PI, TAU, 0.5);
  const core = R.sp.get('optcore', 0.9, 0.9, (c) => {
    ball(c, 0, 0, 0.3, '#ff9a2a', { hi: '#fffbe6', lo: '#c8300a', line: 'rgba(120,20,0,0.5)', lw: 0.02, spec: 0.9 });
    const gq = c.createRadialGradient(0, 0, 0, 0, 0, 0.2); gq.addColorStop(0, 'rgba(255,255,240,0.95)'); gq.addColorStop(1, 'rgba(255,240,180,0)'); c.fillStyle = gq; c.beginPath(); c.arc(0, 0, 0.2, 0, TAU); c.fill();
  });
  ctx.save(); ctx.translate(x, y); ctx.scale(pul, pul); put(ctx, core); ctx.restore();
  // プラズマの揺らぎ（波打つ縁）
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,190,110,0.75)'; ctx.lineWidth = 0.035; ctx.beginPath();
  for (let k = 0; k <= 28; k++) { const an = k / 28 * TAU, rr2 = 0.36 * (1.04 + 0.13 * Math.sin(an * 5 + t * 14) + 0.07 * Math.sin(an * 9 - t * 23)); k ? ctx.lineTo(x + Math.cos(an) * rr2, y + Math.sin(an) * rr2) : ctx.moveTo(x + Math.cos(an) * rr2, y + Math.sin(an) * rr2); }
  ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
  ringHalf(0, Math.PI, 0.95);
  const ga = ra * 1.7; glow(ctx, x + Math.cos(ga) * rx * Math.cos(tiltA) - Math.sin(ga) * ry * Math.sin(tiltA), y + Math.cos(ga) * rx * Math.sin(tiltA) + Math.sin(ga) * ry * Math.cos(tiltA), 0.13, '#ffffff', 0.9);
  if (st.muzzle < 0.06) glow(ctx, x + 0.45, y, 0.4, st.mcol || '#ffe890', 1 - st.muzzle / 0.06);
}

// ---- シールド（C5）: 六角格子のエネルギー面。残量で色が変わり、被弾で波紋 ----------------------
const SH_COL = ['#ff4a4a', '#ff4a4a', '#ff9a3a', '#ffe04a', '#5affc0', '#4ad0ff'];
function shieldSprite(R, n) {
  const col = SH_COL[n];
  return R.sp.get('shield' + n, 2.9, 3.2, (c) => {
    const Rr = SHIELD.radius, lens = (cc) => { cc.beginPath(); cc.arc(0, 0, Rr, -1.22, 1.22); cc.arc(-0.62, 0, Rr * 1.14, 0.98, -0.98, true); cc.closePath(); };
    c.save(); lens(c); c.clip();
    const g = c.createRadialGradient(-0.3, 0, 0.5, 0, 0, Rr); g.addColorStop(0, rgba(col, 0.02)); g.addColorStop(0.75, rgba(col, 0.2)); g.addColorStop(1, rgba(lite(col, 0.4), 0.7));
    c.fillStyle = g; c.fillRect(-2, -2, 4, 4);
    // 六角格子
    c.strokeStyle = rgba(lite(col, 0.5), 0.8); c.lineWidth = 0.022;
    const h = 0.13, w = h * Math.sqrt(3);
    for (let row = -14; row <= 14; row++) for (let q = 0; q < 12; q++) {
      const cx = q * w + (row & 1 ? w / 2 : 0) - 0.2, cy = row * h * 1.5;
      c.beginPath(); for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + Math.PI / 6; k ? c.lineTo(cx + Math.cos(an) * h, cy + Math.sin(an) * h) : c.moveTo(cx + Math.cos(an) * h, cy + Math.sin(an) * h); } c.closePath(); c.stroke();
    }
    c.restore();
    c.beginPath(); c.arc(0, 0, Rr, -1.22, 1.22); c.strokeStyle = rgba(col, 0.35); c.lineWidth = 0.14; c.stroke();
    c.strokeStyle = lite(col, 0.75); c.lineWidth = 0.035; c.stroke();
  });
}
function drawShield(R, st, x, y, n) {
  const ctx = R.ctx, now = R.now, hit = st.hitT < 0.45 ? 1 - st.hitT / 0.45 : 0;
  const lv = n > 0 ? n : st.hitLeft > 0 ? st.hitLeft : 1, col = SH_COL[clamp(lv, 1, 5)];
  ctx.save(); ctx.translate(x, y);
  if (n > 0) {
    const s = 1 + hit * 0.06;
    ctx.scale(s, s);
    ctx.globalAlpha = 0.72 + 0.16 * Math.sin(now * 6) + hit * 0.2; put(ctx, shieldSprite(R, clamp(n, 1, 5))); ctx.globalAlpha = 1;
    // 面を流れる光
    const sa = ((now * 0.9) % 1) * 2.6 - 1.3;
    glow(ctx, Math.cos(sa) * SHIELD.radius, Math.sin(sa) * SHIELD.radius, 0.34, col, 0.55);
    glowE(ctx, SHIELD.radius * 0.96, 0, 0.3, 1.25, col, 0.25 + hit * 0.5);
  } else {
    // 割れて消える（最後の 1 枚）
    ctx.globalAlpha = hit; put(ctx, shieldSprite(R, 1)); ctx.globalAlpha = 1;
  }
  if (hit > 0) {
    // 波紋: 当たった前面から面に沿って広がる弧
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) { const u = clamp((1 - hit) * 1.5 - k * 0.25, 0, 1); if (u <= 0 || u >= 1) continue; ctx.strokeStyle = rgba('#ffffff', (1 - u) * 0.9); ctx.lineWidth = 0.07 * (1 - u) + 0.02;
      ctx.beginPath(); ctx.arc(0, 0, SHIELD.radius + 0.03, 0.08 + u * 1.1, 0.2 + u * 1.15); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, SHIELD.radius + 0.03, -0.2 - u * 1.15, -0.08 - u * 1.1); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    glow(ctx, SHIELD.radius, 0, 0.9 * hit, '#ffffff', hit);
  }
  ctx.restore();
}

// ---- カプセル（C6）: 金属の殻・発光する芯・回転・きらめき --------------------------------
export function drawCapsule(R, c0) {
  const ctx = R.ctx, now = R.now, a = R.alpha, x = lerp(c0.px, c0.x, a), y = lerp(c0.py, c0.y, a);
  const pulse = 0.5 + 0.5 * Math.sin(now * 7 + c0.id);
  glow(ctx, x, y, 1.25 + pulse * 0.25, '#ff5a1a', 0.55 + pulse * 0.3);
  const s = R.sp.get('capsule', 1.7, 1.2, (c) => {
    shadow(c, rr(-0.62, -0.36, 1.24, 0.72, 0.36), 0.3, 0, -0.04);
    // 芯の窓（発光）と金属の端
    const body = rr(-0.62, -0.36, 1.24, 0.72, 0.36);
    solid(c, body, '#ff5a1a', { hi: '#ffe8b0', lo: '#8a1400', d: 0.05, line: '#3a0a00' });
    c.save(); body(c); c.clip();
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5); g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = g; c.fillRect(-0.5, -0.5, 1, 1);
    for (const sx of [-1, 1]) { const cap = pg([[sx * 0.24, -0.4], [sx * 0.7, -0.4], [sx * 0.7, 0.4], [sx * 0.24, 0.4]]); solid(c, cap, '#c8d0e0', { g: 'cyl', d: 0.03, lw: 0.025 }); seam(c, [[sx * 0.34, -0.36], [sx * 0.34, 0.36]], 0.014); }
    c.restore();
    body(c); c.strokeStyle = '#1a1e2a'; c.lineWidth = 0.035; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(0, 0.2, 0.2, 0.05, 0, 0, TAU); c.fill();
  });
  const wob = Math.sin(now * 2 + c0.id) * 0.3;
  ctx.save(); ctx.translate(x, y); ctx.rotate(wob); put(ctx, s);
  // 回転して見える光の帯（殻の上を流れる）
  const u = ((now * 0.8 + c0.id * 0.3) % 1) * 1.6 - 0.8;
  glowE(ctx, u, 0.08, 0.1, 0.34, '#ffffff', 0.7 * (1 - Math.abs(u) / 0.8));
  glow(ctx, 0, 0, 0.3 + pulse * 0.1, '#ffe0a0', 0.8);
  ctx.restore();
  if (R.chance(5)) R.fx.glint(x + (R01() - 0.5) * 1.3, y + (R01() - 0.5) * 0.9, 0.3 + R01() * 0.3, 0.3);
}

// ---- 自機の弾（C7〜C9） -------------------------------------------------------------
export function drawShot(R, s) {
  const ctx = R.ctx, a = R.alpha, now = R.now;
  const x = lerp(s.px, s.x, a), y = lerp(s.py, s.y, a);
  if (s.kind === 'laser') {
    const len = s.len, x0 = x - len;
    streak(ctx, x0 - 0.2, y, len + 0.5, 0.62, '#2a7aff', 0.85, 'bar');           // 外光
    streak(ctx, x0, y, len + 0.1, 0.3, '#7ae0ff', 1, 'bar');                     // 芯
    // 螺旋のゆらぎ（2 本の波）
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.028;
    for (let k = 0; k < 2; k++) {
      ctx.strokeStyle = k ? 'rgba(160,220,255,0.75)' : 'rgba(255,255,255,0.8)'; ctx.beginPath();
      const n = Math.max(2, (len * 5) | 0);
      for (let i = 0; i <= n; i++) { const u = i / n, xx = x0 + u * len, yy = y + Math.sin(xx * 4.2 - now * 40 + k * Math.PI) * 0.1 * Math.sin(u * Math.PI); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    glow(ctx, x, y, 0.42, '#bfeaff', 1);                                          // 先端
    if (s.t < 6) { const k = s.t / 6; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(160,225,255,${1 - k})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(x0 + 0.1 + k * 0.3, y, 0.1 + k * 0.14, 0.24 + k * 0.42, 0, 0, TAU); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }   // 発射口の輪
  } else if (s.kind === 'missile') {
    const ang = s.ground ? 0 : Math.atan2(s.vy, s.vx + 0.0001);
    const m = R.sp.get('missile', 1.0, 0.5, (c) => {
      solid(c, rpg([[0.36, 0], [0.2, 0.085], [-0.28, 0.085], [-0.28, -0.085], [0.2, -0.085]], 0.03), '#e4e9f2', { g: 'cyl', d: 0.02, lw: 0.02 });
      fillP(c, pg([[0.36, 0], [0.22, 0.07], [0.22, -0.07]]), '#3a4254');
      for (const sy of [1, -1]) solid(c, pg([[-0.12, sy * 0.07], [-0.3, sy * 0.19], [-0.36, sy * 0.19], [-0.3, sy * 0.07]]), '#e8402a', { d: 0.015, lw: 0.018 });
      fillP(c, rr(-0.02, -0.085, 0.05, 0.17), '#2f6bff'); solid(c, rr(-0.34, -0.06, 0.07, 0.12, 0.01), '#4a5266', { g: 'cyl', d: 0, lw: 0.015 });
    });
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const fl = 0.5 + R01() * 0.25;
    streak(ctx, -0.34 - fl, 0, fl, 0.2, '#ff9a3a', 1, 'flame'); glow(ctx, -0.36, 0, 0.26, '#ffb050', 0.9);
    put(ctx, m); ctx.restore();
    // 噴煙の尾・地面を走る火花
    if (R.chance(55)) R.fx.smoke(x - Math.cos(ang) * 0.4, y - Math.sin(ang) * 0.4, -0.6, 0.3, 0.16, 0.45, 0.4, 'steam');
    if (s.ground && R.chance(50)) R.fx.spk(x - 0.2, y - 0.12, -3 - R01() * 5, 1 + R01() * 4, 0.12 + R01() * 0.12, 0, 9);
  } else {
    // 通常弾・ダブル: 白い芯と金色の尾
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(s.vy, s.vx));
    streak(ctx, -1.0, 0, 1.4, 0.44, '#ffb82a', 1, 'tail');
    glow(ctx, 0.22, 0, 0.24, '#fff2c0', 0.9);
    ctx.restore();
  }
}

// ---- 敵弾（C27）: 4 種を形と色で作り分け。どれも白い芯で読める（自機弾の金・青とは色相を分ける） -------
export function drawBullet(R, b) {
  const ctx = R.ctx, a = R.alpha, now = R.now;
  const x = lerp(b.px, b.x, a), y = lerp(b.py, b.y, a);
  if (b.kind === 'ring') {
    // リング弾: 紫の輪（壊せる）。白い輪の芯
    const s = R.sp.get('b_ring' + b.r.toFixed(2), b.r * 3.4, b.r * 3.4, (c) => {
      const g = c.createRadialGradient(0, 0, b.r * 0.4, 0, 0, b.r * 1.6); g.addColorStop(0, 'rgba(190,110,255,0)'); g.addColorStop(0.5, 'rgba(190,110,255,0.55)'); g.addColorStop(1, 'rgba(160,60,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, b.r * 1.6, 0, TAU); c.fill();
      c.strokeStyle = '#b060ff'; c.lineWidth = b.r * 0.42; c.beginPath(); c.arc(0, 0, b.r * 0.86, 0, TAU); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = b.r * 0.2; c.stroke();
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(Math.cos(an) * b.r * 0.86, Math.sin(an) * b.r * 0.86, b.r * 0.17, 0, TAU); c.fill(); }
    });
    ctx.save(); ctx.translate(x, y); ctx.rotate(now * 4 + b.id); ctx.scale(1, 0.82 + 0.12 * Math.sin(now * 9 + b.id)); put(ctx, s); ctx.restore(); return;
  }
  if (b.kind === 'beam') {
    // 光線弾: 赤い外光と白い芯の棒
    const len = b.len || 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(b.vy, b.vx));
    streak(ctx, -len - 0.25, 0, len + 0.6, 0.75, '#ff2a5a', 0.9, 'bar');
    streak(ctx, -len, 0, len + 0.2, 0.34, '#ff9ab0', 1, 'bar', false);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-len / 2 + 0.05, 0, len / 2, 0.055, 0, 0, TAU); ctx.fill();
    glow(ctx, 0.05, 0, 0.4, '#ffd0dc', 0.9);
    ctx.restore(); return;
  }
  if (b.kind === 'homing') {
    // 誘導弾: 橙の矢じり。明滅する尾
    const s = R.sp.get('b_homing', 1.5, 1.0, (c) => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5); g.addColorStop(0, 'rgba(255,120,40,0.6)'); g.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
      solid(c, pg([[0.44, 0], [-0.1, 0.22], [-0.32, 0.2], [-0.2, 0], [-0.32, -0.2], [-0.1, -0.22]]), '#ff8a2a', { hi: '#ffe8a0', lo: '#c0300a', d: 0.03, line: '#5a1000', lw: 0.03 });
      fillP(c, pg([[0.3, 0], [-0.06, 0.1], [-0.12, 0], [-0.06, -0.1]]), '#ffffff');
    });
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(b.vy, b.vx));
    const fl = 0.5 + 0.2 * Math.sin(now * 40 + b.id);
    streak(ctx, -0.25 - fl, 0, fl, 0.22, '#ff5a2a', 1, 'flame');
    put(ctx, s); ctx.restore();
    if (R.chance(20)) R.fx.ember(x, y, (R01() - 0.5), (R01() - 0.5), 0.07, 0.3, 5, 0);
    return;
  }
  // 通常弾: 赤紫の光輪・濃い桃色の殻・白い芯。わずかに脈打つ
  const r = b.r, s = R.sp.get('b_n' + r.toFixed(2), r * 5.2, r * 5.2, (c) => {
    const g = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.5); g.addColorStop(0, 'rgba(255,40,130,0.75)'); g.addColorStop(0.45, 'rgba(255,40,130,0.28)'); g.addColorStop(1, 'rgba(255,40,130,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.5, 0, TAU); c.fill();
    c.fillStyle = '#7a0a3c'; c.beginPath(); c.arc(0, 0, r * 1.32, 0, TAU); c.fill();
    const g2 = c.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.2); g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.55, '#ffb0d0'); g2.addColorStop(1, '#ff2a86');
    c.fillStyle = g2; c.beginPath(); c.arc(0, 0, r * 1.2, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r * 0.66, 0, TAU); c.fill();
  });
  const k = 1 + 0.08 * Math.sin(now * 16 + b.id * 1.7);
  ctx.drawImage(s.cv, x - s.w / 2 * k, y - s.h / 2 * k, s.w * k, s.h * k);
}

// =============================================================================
// 雑魚敵（C10〜C19）
const face = (ctx, ang) => { ctx.rotate(ang); if (Math.cos(ang) < 0) ctx.scale(1, -1); };   // 左向きでも絵の上下（光の向き）を保つ
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const isC = (e) => e.anchor === 'c';
// 発射の瞬間を拾う（e.lastFire が変わった時）
function fired(e, v) { if (e.lastFire !== undefined && e.lastFire !== v.lf) { const first = v.lf === undefined && false; v.lf = e.lastFire; return !first; } return false; }

// ---- 小型編隊機 dart（C10）: 動きの型ごとに 5＋1 色。旋回でバンク、エンジンの光 ----------------
const DART_PAL = { line: ['#2aa6c8', '#ffe24a'], wave: ['#4fc03a', '#fff27a'], swoop: ['#8a5ae8', '#ffd04a'], loop: ['#e89a2a', '#7af0ff'], chase: ['#8e9cba', '#ff6a4a'], dive: ['#d83a8a', '#ffe24a'], red: ['#e8402a', '#ffe24a'] };
function paintDart(c, col, eye, carrier) {
  for (const sy of [1, -1]) {
    const w = pg([[0.12, sy * 0.09], [0.54, sy * 0.33], [0.3, sy * 0.47], [-0.2, sy * 0.43], [-0.5, sy * 0.3], [-0.36, sy * 0.1]]);
    solid(c, w, col, { d: 0.035, lo: dark(col, 0.62) });
    c.save(); w(c); c.clip();
    fillP(c, pg([[0.5, sy * 0.3], [0.3, sy * 0.47], [0.1, sy * 0.46], [0.36, sy * 0.24]]), carrier ? '#ffd24a' : lite(col, 0.55));       // 爪の先
    line(c, [[-0.4, sy * 0.22], [0.2, sy * 0.3]], 'rgba(0,0,0,0.35)', 0.03);
    c.restore();
    seam(c, [[-0.25, sy * 0.14], [-0.1, sy * 0.42]], 0.012, 0.5);
  }
  solid(c, rr(-0.6, -0.075, 0.14, 0.15, 0.02), '#3a4254', { g: 'cyl', d: 0.012, lw: 0.018 });
  const fus = rpg([[0.5, 0], [0.2, 0.135], [-0.36, 0.15], [-0.52, 0.08], [-0.52, -0.08], [-0.36, -0.15], [0.2, -0.135]], 0.03);
  solid(c, fus, mix(col, '#e8ecf4', 0.55), { d: 0.03, g: 'cyl' });
  if (carrier) { c.save(); fus(c); c.clip(); fillP(c, rr(-0.3, -0.2, 0.09, 0.4), '#ffd24a'); fillP(c, rr(-0.16, -0.2, 0.05, 0.4), '#ffd24a'); c.restore(); }
  seam(c, [[-0.34, 0.14], [-0.34, -0.14]], 0.012, 0.5);
  glass(c, el(0.14, 0, 0.17, 0.075), eye);
}
function drawDart(R, e, f, v) {
  const ctx = R.ctx, key = e.carrier ? 'red' : (DART_PAL[e.pat] ? e.pat : 'line'), pal = DART_PAL[key];
  const s = R.sp.get('dart_' + key, 1.4, 1.2, (c) => paintDart(c, pal[0], pal[1], e.carrier));
  if (v.tk !== R.tickN) { const d = v.pa === undefined ? 0 : angDiff(e.ang, v.pa); v.pa = e.ang; v.tk = R.tickN; v.bank = lerp(v.bank || 0, clamp(d * 14, -1, 1), 0.2); }
  const bank = v.bank || 0, sp = Math.hypot(e.vx, e.vy) * 60;
  face(ctx, e.ang);
  // エンジンの光と尾
  const fl = 0.35 + sp * 0.05 + Math.sin(R.now * 50 + e.id) * 0.06;
  streak(ctx, -0.6 - fl, 0, fl, 0.2, e.carrier ? '#ffb040' : '#7ad8ff', 0.9, 'flame');
  glow(ctx, -0.62, 0, 0.26, e.carrier ? '#ff9a3a' : '#5ac8ff', 0.8);
  ctx.scale(1, 1 - Math.abs(bank) * 0.5);
  putF(ctx, R.sp, s, f);
  glow(ctx, 0.14, 0, 0.2 + 0.04 * Math.sin(R.now * 9 + e.id), pal[1], 0.6);
  if (Math.abs(bank) > 0.25) glowE(ctx, 0.2, bank > 0 ? 0.3 : -0.3, 0.3, 0.07, '#ffffff', Math.abs(bank) * 0.55);      // 傾いた翼の反射
}

// ---- 回転機 wheel（C11）: 外輪は固定の陰影、羽根だけ回す。回転の残像 -------------------------
function drawWheel(R, e, f, v) {
  const ctx = R.ctx, red = e.carrier, col = red ? '#d83a20' : '#8c98b6';
  const ring = R.sp.get('wheel_r' + (red ? 1 : 0), 1.4, 1.4, (c) => {
    solid(c, ci(0, 0, 0.6), col, { d: 0.045, tex: 'brush', texA: 0.25 });
    fillP(c, ci(0, 0, 0.43), '#0c0f18');
    c.save(); ci(0, 0, 0.43)(c); c.clip(); c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.03; c.beginPath(); c.arc(0, -0.03, 0.43, 0, TAU); c.stroke(); c.restore();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.39; rivet(c, Math.cos(a) * 0.515, Math.sin(a) * 0.515, 0.022); }
    c.strokeStyle = red ? '#ffd24a' : '#ff7a3a'; c.lineWidth = 0.035; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 0, 0.515, k * Math.PI / 2 - 0.2, k * Math.PI / 2 + 0.2); c.stroke(); }
  });
  const blades = R.sp.get('wheel_b', 1.0, 1.0, (c) => {
    for (let k = 0; k < 4; k++) { c.save(); c.rotate(k * Math.PI / 2); solid(c, pg([[0.05, 0.05], [0.4, 0.1], [0.44, -0.02], [0.3, -0.09], [0.05, -0.05]]), '#cdd6ea', { g: 'flat', d: 0.02, lw: 0.02, line: '#3a4254' }); c.restore(); }
  });
  const hub = R.sp.get('wheel_h', 0.6, 0.6, (c) => { ball(c, 0, 0, 0.17, '#4a5266', { lw: 0.02 }); lamp(c, 0, 0, 0.075, '#ff5a3a', 2.2); });
  const spin = e.spin || 0;
  putF(ctx, R.sp, ring, f);
  ctx.save(); ctx.rotate(spin); put(ctx, blades);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'butt';          // 残像（羽根の後ろに弧）
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.strokeStyle = 'rgba(190,215,255,0.22)'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.arc(0, 0, 0.3, a - 0.7, a); ctx.stroke(); ctx.strokeStyle = 'rgba(190,215,255,0.16)'; ctx.beginPath(); ctx.arc(0, 0, 0.3, a - 1.1, a - 0.7); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
  ctx.restore();
  put(ctx, hub);
  glow(ctx, 0, 0, 0.3 + Math.sin(R.now * 10 + e.id) * 0.04, '#ff5a3a', 0.55);
}

// ---- 砲台 turret・大砲 cannon（C12）: 装甲・砲身の後座・照準レーザー・発射炎・排熱 ----------------
function aimLaser(ctx, x0, y0, ang, len, a) {
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
  streak(ctx, 0, 0, len, 0.07, '#ff3050', a, 'bar');
  ctx.restore();
}
function drawTurret(R, e, f, v) {
  const ctx = R.ctx, g = R.g, c0 = isC(e);
  const base = R.sp.get('turret' + (c0 ? 'c' : 'f'), 1.8, 1.5, (c) => {
    const b = pg([[-0.74, -0.56], [0.74, -0.56], [0.58, -0.2], [-0.58, -0.2]]);
    solid(c, b, '#4a5468', { d: 0.04, tex: 'grit', texA: 0.3 });
    hazard(c, rr(-0.7, -0.56, 1.4, 0.1), 0.1);
    for (const x of [-0.5, -0.25, 0.25, 0.5]) rivet(c, x, -0.3, 0.022);
    fillP(c, rr(-0.14, -0.4, 0.28, 0.07, 0.02), '#12151e');                                         // 排熱口
    const dome = (cc) => { cc.beginPath(); cc.arc(0, -0.2, 0.5, 0, Math.PI); cc.closePath(); };
    dome.b = [-0.5, -0.2, 0.5, 0.3];
    solid(c, dome, '#7c88a0', { d: 0.045, hi: '#e8eef8', tex: 'brush', texA: 0.2 });
    seam(c, [[-0.3, -0.19], [-0.24, 0.2]], 0.014, 0.5); seam(c, [[0.3, -0.19], [0.24, 0.2]], 0.014, 0.5);
    ball(c, 0, 0.0, 0.17, '#2a3040', { lw: 0.025, spec: 0 }); lamp(c, 0, 0.0, 0.085, '#ff4a2a', 2.2);
  }, { flip: c0 });
  const barrel = R.sp.get('turret_b', 1.3, 0.5, (c) => {
    solid(c, rr(0.05, -0.085, 0.86, 0.17, 0.02), '#9aa6bc', { g: 'cyl', d: 0.015, lw: 0.022 });
    solid(c, rr(0.76, -0.115, 0.2, 0.23, 0.03), '#3a4254', { g: 'cyl', d: 0.015, lw: 0.022 });
    solid(c, rr(0.02, -0.13, 0.3, 0.26, 0.04), '#5a6478', { g: 'cyl', d: 0.02, lw: 0.022 });
    fillP(c, rr(0.5, -0.02, 0.2, 0.04), '#1a1e2a');
  }, { ox: 0.5 });
  const iv = g.fireInterval(e.rate ?? 120), ph = (e.t + e.id * 17) % iv, ttf = iv - ph;
  if (fired(e, v)) { v.rec = 1; v.heat = 1; R.fx.flashAt(R.ex + Math.cos(e.aim) * 1.0, R.ey + Math.sin(e.aim) * 1.0, 0.5, 0.08, 4); }
  v.rec = Math.max(0, (v.rec || 0) - R.dt * 5); v.heat = Math.max(0, (v.heat || 0) - R.dt * 0.9);
  const py = c0 ? 0.05 : -0.05;
  if (ttf < 34 && e.t > 36 && g.player.alive) aimLaser(ctx, Math.cos(e.aim) * 0.95, py + Math.sin(e.aim) * 0.95, e.aim, 7, (1 - ttf / 34) * 0.55 * (0.7 + 0.3 * Math.sin(R.now * 40)));
  ctx.save(); ctx.translate(0, py); ctx.rotate(e.aim); ctx.translate(-v.rec * 0.16, 0); putF(ctx, R.sp, barrel, f);
  if (v.rec > 0.5) { const k = (v.rec - 0.5) * 2; glowE(ctx, 1.2, 0, 0.5 * k, 0.16, '#ffe0a0', k); glow(ctx, 1.0, 0, 0.4 * k, '#ffb050', k); }
  if (ttf < 20) glow(ctx, 0.98, 0, 0.22 * (1 - ttf / 20) + 0.05, '#ff5a6a', 0.9);
  ctx.restore();
  putF(ctx, R.sp, base, f);
  const ey = 0;
  glow(ctx, 0, ey, 0.26, '#ff4a2a', 0.45 + 0.3 * Math.sin(R.now * 5 + e.id));
  if (v.heat > 0.05) { glowE(ctx, 0, c0 ? 0.37 : -0.37, 0.3, 0.1, '#ff8a3a', v.heat * 0.8); if (R.chance(14 * v.heat)) R.fx.smoke(R.ex + (R01() - 0.5) * 0.3, R.ey + (c0 ? 0.3 : -0.3), (R01() - 0.5) * 0.8, c0 ? -0.6 : 0.8, 0.22, 0.6, 0.4, 'steam'); }
}
function drawCannon(R, e, f, v) {
  const ctx = R.ctx, g = R.g, c0 = isC(e);
  const base = R.sp.get('cannon' + (c0 ? 'c' : 'f'), 2.8, 2.2, (c) => {
    const b = pg([[-1.28, -0.9], [1.28, -0.9], [1.08, -0.42], [-1.08, -0.42]]);
    solid(c, b, '#39445c', { d: 0.05, tex: 'grit', texA: 0.3 });
    for (let k = -4; k <= 4; k++) { if (k === 0) continue; fillP(c, rr(k * 0.24 - 0.05, -0.8, 0.1, 0.3, 0.02), '#161a26'); line(c, [[k * 0.24 - 0.05, -0.8], [k * 0.24 - 0.05, -0.5]], 'rgba(255,255,255,0.18)', 0.015); }      // 放熱板
    hazard(c, rr(-1.2, -0.9, 2.4, 0.09), 0.1);
    solid(c, ci(0, 0, 0.92), '#2c3548', { d: 0.05 });                                             // 旋回座
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; rivet(c, Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.022); }
  }, { flip: c0 });
  const head = R.sp.get('cannon_h', 1.7, 1.7, (c) => {
    ball(c, 0, 0, 0.72, '#5a6a8c', { hi: '#dfe8f8', tex: 'brush', texA: 0.2, lw: 0.035, spec: 0.5 });
    c.strokeStyle = 'rgba(10,14,24,0.6)'; c.lineWidth = 0.018; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.stroke();
    ball(c, 0, 0, 0.3, '#1a2030', { spec: 0, lw: 0.03 }); lamp(c, 0, 0, 0.16, '#4ab0ff', 2);
  });
  const barrel = R.sp.get('cannon_b', 1.9, 0.8, (c) => {
    solid(c, rr(0.1, -0.17, 1.3, 0.34, 0.03), '#8494b6', { g: 'cyl', d: 0.02, lw: 0.028 });
    for (const x of [0.62, 0.82, 1.02]) solid(c, rr(x, -0.21, 0.09, 0.42, 0.02), '#4a5670', { g: 'cyl', d: 0.012, lw: 0.02 });
    solid(c, rr(1.24, -0.24, 0.24, 0.48, 0.05), '#2a3346', { g: 'cyl', d: 0.02, lw: 0.028 });
    solid(c, rr(0.0, -0.27, 0.5, 0.54, 0.08), '#48546e', { g: 'cyl', d: 0.03, lw: 0.028 });
    fillP(c, rr(1.44, -0.12, 0.05, 0.24, 0.02), '#06080c');
  }, { ox: 0.75 });
  const iv = g.fireInterval(150), cyc = (e.t + e.id * 13) % iv;
  if (fired(e, v)) { v.rec = 1; v.heat = Math.min(1.4, (v.heat || 0) + 0.5); R.fx.flashAt(R.ex + Math.cos(e.aim) * 1.6, R.ey + Math.sin(e.aim) * 1.6, 0.8, 0.09, 4); R.fx.smoke(R.ex + Math.cos(e.aim) * 1.5, R.ey + Math.sin(e.aim) * 1.5, Math.cos(e.aim) * 1.5, Math.sin(e.aim) * 1.5 + 0.4, 0.35, 0.6, 0.45); }
  v.rec = Math.max(0, (v.rec || 0) - R.dt * 6); v.heat = Math.max(0, (v.heat || 0) - R.dt * 0.5);
  const ch = e.charge ? clamp((cyc - 100) / 20, 0, 1) : 0;
  putF(ctx, R.sp, base, f);
  if (ch > 0) aimLaser(ctx, Math.cos(e.aim) * 1.5, Math.sin(e.aim) * 1.5, e.aim, 9, 0.3 + ch * 0.4);
  ctx.save(); ctx.rotate(e.aim); ctx.translate(-v.rec * 0.26, 0); putF(ctx, R.sp, barrel, f);
  if (v.heat > 0.05) glowE(ctx, 1.2, 0, 0.5, 0.26, '#ff6a2a', Math.min(1, v.heat) * 0.75);       // 砲身の焼け
  if (ch > 0) { glow(ctx, 1.5, 0, 0.3 + ch * 0.5, '#ffd24a', 0.6 + ch * 0.4); glow(ctx, 1.5, 0, 0.15 + ch * 0.2, '#ffffff', 1); }
  if (v.rec > 0.5) { const k = (v.rec - 0.5) * 2; glowE(ctx, 2.0, 0, 0.9 * k, 0.26, '#fff0c0', k); }
  ctx.restore();
  putF(ctx, R.sp, head, f);
  glow(ctx, 0, 0, 0.4, ch > 0 ? '#ffd24a' : '#4ab0ff', 0.5 + 0.2 * Math.sin(R.now * 6));
  if (ch > 0 && R.chance(40)) { const a = R01() * TAU; R.fx.ember(R.ex + Math.cos(e.aim) * 1.5 + Math.cos(a) * 0.8, R.ey + Math.sin(e.aim) * 1.5 + Math.sin(a) * 0.8, -Math.cos(a) * 3, -Math.sin(a) * 3, 0.07, 0.25, 4, 0); }
  if (v.heat > 0.3 && R.chance(10 * v.heat)) R.fx.smoke(R.ex + (R01() - 0.5) * 1.6, R.ey + (c0 ? 0.6 : -0.6), (R01() - 0.5), c0 ? -0.8 : 1.0, 0.3, 0.8, 0.4, 'steam');
}

// ---- 歩行機 walker（C13）: 関節のある脚（2 関節の逆運動学）、しゃがみ・跳躍・着地 ------------------
function leg(ctx, hx, hy, fx, fy, bend) {
  const L1 = 0.44, L2 = 0.46;
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy); const m = L1 + L2 - 0.01; if (d > m) { fx = hx + dx / d * m; fy = hy + dy / d * m; d = m; dx = fx - hx; dy = fy - hy; }
  const a = Math.atan2(dy, dx), b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)) * bend;
  const kx = hx + Math.cos(a + b) * L1, ky = hy + Math.sin(a + b) * L1;
  ctx.lineCap = 'round';
  const seg = (x0, y0, x1, y1, w, c1, c2) => { ctx.strokeStyle = '#141820'; ctx.lineWidth = w + 0.05; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.strokeStyle = c1; ctx.lineWidth = w; ctx.stroke(); ctx.strokeStyle = c2; ctx.lineWidth = w * 0.35; ctx.beginPath(); ctx.moveTo(x0 - 0.02, y0 + 0.025); ctx.lineTo(x1 - 0.02, y1 + 0.025); ctx.stroke(); };
  seg(hx, hy, kx, ky, 0.15, '#6a7488', '#aab4c8'); seg(kx, ky, fx, fy + 0.05, 0.1, '#8a94a8', '#d8dce8');
  ctx.fillStyle = '#141820'; ctx.beginPath(); ctx.arc(kx, ky, 0.1, 0, TAU); ctx.fill(); ctx.fillStyle = '#c8962a'; ctx.beginPath(); ctx.arc(kx, ky, 0.06, 0, TAU); ctx.fill();
  ctx.fillStyle = '#141820'; ctx.beginPath(); ctx.moveTo(fx - 0.2, fy - 0.02); ctx.lineTo(fx + 0.16, fy - 0.02); ctx.lineTo(fx + 0.1, fy + 0.1); ctx.lineTo(fx - 0.12, fy + 0.1); ctx.fill();
  ctx.fillStyle = '#9aa4b8'; ctx.fillRect(fx - 0.15, fy + 0.01, 0.26, 0.04);
}
function drawWalker(R, e, f, v) {
  const ctx = R.ctx, c0 = isC(e), dir = c0 ? -1 : 1, fc = e.vx < 0 ? 1 : -1;
  const body = R.sp.get('walker' + (c0 ? 'c' : 'f'), 1.7, 1.2, (c) => {
    solid(c, rr(-0.82, -0.02, 0.5, 0.13, 0.03), '#3a4254', { g: 'cyl', d: 0.015, lw: 0.022 });         // 砲
    fillP(c, rr(-0.84, 0.0, 0.05, 0.09), '#08090c');
    const pod = rpg([[-0.5, 0.3], [0.1, 0.46], [0.5, 0.32], [0.56, 0.0], [0.34, -0.2], [-0.36, -0.2], [-0.56, 0.02]], 0.1);
    solid(c, pod, '#c8962a', { d: 0.045, hi: '#ffe9a8', lo: '#6a4410', tex: 'grit', texA: 0.25 });
    seam(c, [[0.14, 0.44], [0.1, -0.19]], 0.014, 0.55); seam(c, [[-0.5, 0.08], [0.54, 0.08]], 0.012, 0.4);
    glass(c, rpg([[-0.46, 0.26], [-0.1, 0.34], [-0.06, 0.14], [-0.5, 0.12]], 0.03), '#ff4a3a');     // 目（バイザー）
    hazard(c, rr(0.2, -0.2, 0.3, 0.08), 0.07);
    for (const [x, y] of [[0.26, 0.3], [0.42, 0.2], [0.3, -0.06]]) rivet(c, x, y, 0.02);
    solid(c, rr(0.3, 0.38, 0.06, 0.2, 0.02), '#5a6478', { g: 'cylx', d: 0, lw: 0.018 }); lamp(c, 0.33, 0.6, 0.03, '#ff5a3a', 2);   // アンテナ
  }, { flip: c0 });
  const ph = e.walk || 0, air = e.jump > 0, land = (e.land || 0) / 12;
  const cr = (e.crouch > 0 ? 0.22 * Math.min(1, (13 - e.crouch) / 5) : 0) + land * 0.16;
  if (land > 0 && !v.landed) { v.landed = true; for (let i = 0; i < 6; i++) R.fx.smoke(R.ex + (R01() - 0.5) * 1.2, R.ey - dir * 0.75, (R01() - 0.5) * 3, dir * (0.2 + R01() * 0.5), 0.3, 0.6, 0.5, 'dust'); R.fx.shake(0.06); }
  if (land === 0) v.landed = false;
  if (air && !v.air) { for (let i = 0; i < 4; i++) R.fx.smoke(R.ex + (R01() - 0.5) * 0.8, R.ey - dir * 0.75, (R01() - 0.5) * 2, dir * 0.3, 0.25, 0.5, 0.45, 'dust'); R.fx.flashAt(R.ex - fc * 0.8, R.ey, 0.45, 0.08, 4); }
  v.air = air;
  ctx.save(); ctx.scale(fc, dir);
  const by = 0.02 - cr;
  for (const [s, hx] of [[Math.PI, 0.16], [0, -0.14]]) {
    const k = Math.sin(ph + s), lift = Math.max(0, Math.cos(ph + s));
    const fxx = air ? hx - 0.1 : hx + k * 0.38, fyy = air ? by - 0.5 + Math.min(0.2, e.jump * 0.01) : -0.8 + 0.1 + lift * 0.13 * Math.min(1, Math.abs(e.vx) * 40);
    leg(ctx, hx, by - 0.1, fxx, fyy - 0.1, -1);
  }
  ctx.restore();
  ctx.save(); ctx.translate(0, by * dir); ctx.scale(fc * (1 + land * 0.1), 1 - land * 0.12 + (air ? 0.05 : 0));
  putF(ctx, R.sp, body, f);
  glow(ctx, -0.28, 0.23 * dir, 0.3, '#ff4a3a', (e.crouch > 0 ? 1 : 0.5) + 0.2 * Math.sin(R.now * 8));
  if (e.crouch > 0) glow(ctx, -0.84, 0.045 * dir, 0.3 * (1 - e.crouch / 12) + 0.05, '#ffb050', 0.9);
  ctx.restore();
}

// ---- ハッチ hatch（C14）: 機械（扉の機構・内部の光・発進の煙）／生体（肉の唇と粘液） -----------------
function drawHatch(R, e, f, v) {
  const ctx = R.ctx, c0 = isC(e), dir = c0 ? -1 : 1, o = e.open || 0, flesh = e.color === 'flesh';
  if (flesh) {
    const mound = R.sp.get('hatchF' + (c0 ? 'c' : 'f'), 3.0, 1.9, (c) => {
      const m = blobPath([[-1.3, -0.72], [-1.12, -0.2], [-0.8, 0.22], [-0.3, 0.36], [0.3, 0.36], [0.8, 0.22], [1.12, -0.2], [1.3, -0.72]]);
      solid(c, m, '#9a2a48', { d: 0.07, hi: '#ff9ab8', lo: '#3a0a1a', tex: 'blot', texA: 0.5, line: '#2a0610' });
      c.save(); m(c); c.clip();
      c.strokeStyle = 'rgba(70,8,30,0.7)'; c.lineWidth = 0.03;                                         // 血管
      for (const [x0, y0, x1, y1, x2, y2] of [[-1.1, -0.6, -0.8, -0.1, -0.5, 0.1], [1.1, -0.6, 0.9, -0.2, 0.5, 0.05], [-0.4, -0.7, -0.2, -0.3, -0.3, 0.0], [0.5, -0.7, 0.3, -0.35, 0.36, -0.05]]) { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x1, y1, x2, y2); c.stroke(); }
      for (const [x, y, r] of [[-0.86, -0.28, 0.1], [0.92, -0.36, 0.08], [0.6, -0.5, 0.06], [-0.5, -0.5, 0.07]]) ball(c, x, y, r, '#c84a6a', { lw: 0.015, spec: 0.8 });   // いぼ
      c.restore();
      fillP(c, el(0, 0.34, 0.72, 0.16), '#1a0208');                                                    // のどの奥
    }, { flip: c0 });
    const lip = R.sp.get('hatchLip' + (c0 ? 'c' : 'f'), 1.1, 0.6, (c) => {
      solid(c, blobPath([[-0.42, -0.08], [-0.3, 0.1], [0.0, 0.15], [0.34, 0.08], [0.42, -0.06], [0.1, -0.14], [-0.2, -0.14]]), '#d85a7a', { d: 0.04, hi: '#ffc0d0', lo: '#7a1030', line: '#3a0614', lw: 0.025 });
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(-0.08, 0.07 * K.ly, 0.16, 0.03, 0, 0, TAU); c.fill();
    }, { flip: c0 });
    const pu = 1 + Math.sin(R.now * 3 + e.id) * 0.025;
    ctx.save(); ctx.scale(pu, 1 / pu); putF(ctx, R.sp, mound, f); ctx.restore();
    if (o > 0.05) { glowE(ctx, 0, 0.36 * dir, 0.6 * o, 0.22 * o, '#ff5a8a', 0.9); glowE(ctx, 0, (0.5 + o * 0.3) * dir, 0.5 * o, 0.7 * o, '#ff2a6a', 0.35 * o); }
    // 粘液の糸（開きかけの時に唇の間に張る）
    if (o > 0.05 && o < 0.98) { ctx.strokeStyle = `rgba(255,190,210,${0.7 * (1 - o)})`; ctx.lineWidth = 0.025; for (const sx of [-0.2, 0.0, 0.18]) { ctx.beginPath(); ctx.moveTo(sx - o * 0.3, 0.38 * dir); ctx.quadraticCurveTo(sx, (0.3 - o * 0.1) * dir, sx + o * 0.3, 0.38 * dir); ctx.stroke(); } }
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * (0.36 + o * 0.3), (0.36 + o * 0.04) * dir); ctx.rotate(-s * o * 0.7 * dir); ctx.scale(s, 1); putF(ctx, R.sp, lip, f); ctx.restore(); }
    if (R.chance(1.5 + o * 8)) R.fx.debris(R.ex + (R01() - 0.5) * 0.8, R.ey + dir * 0.4, (R01() - 0.5) * 1.5, dir * (0.5 + o * 2), 0.07, 0.6, 'flesh');
    return;
  }
  const body = R.sp.get('hatchM' + (c0 ? 'c' : 'f'), 2.9, 1.7, (c) => {
    const b = pg([[-1.28, -0.7], [1.28, -0.7], [1.02, 0.3], [-1.02, 0.3]]);
    solid(c, b, '#56627a', { d: 0.06, hi: '#c8d2e6', tex: 'grit', texA: 0.35 });
    hazard(c, rr(-1.22, -0.7, 2.44, 0.11), 0.11);
    solid(c, pg([[-0.86, 0.3], [0.86, 0.3], [0.8, 0.02], [-0.8, 0.02]]), '#3a4458', { d: 0.03, rim: 0.3 });      // 扉の枠
    fillP(c, rr(-0.72, 0.16, 1.44, 0.14), '#06080c');                                                           // 開口の奥
    seam(c, [[-0.92, -0.58], [-0.84, 0.0]], 0.016); seam(c, [[0.92, -0.58], [0.84, 0.0]], 0.016); seam(c, [[-1.1, -0.26], [1.1, -0.26]], 0.014, 0.5);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) { rivet(c, x, -0.12, 0.022); rivet(c, x, -0.42, 0.022); }
    for (const sx of [-1, 1]) { solid(c, rr(sx * 1.0 - 0.07, -0.5, 0.14, 0.2, 0.03), '#20262f', { d: 0.015, lw: 0.02 }); }
  }, { flip: c0 });
  const door = R.sp.get('hatchD' + (c0 ? 'c' : 'f'), 0.9, 0.3, (c) => { solid(c, rr(-0.36, -0.07, 0.72, 0.14, 0.02), '#93a0ba', { g: 'cyl', d: 0.02, lw: 0.022 }); hazard(c, rr(0.2, -0.07, 0.16, 0.14), 0.05); seam(c, [[-0.1, -0.06], [-0.1, 0.06]], 0.012); }, { flip: c0 });
  putF(ctx, R.sp, body, f);
  if (o > 0.02) {       // 内部の光と立ちのぼる光の柱
    glowE(ctx, 0, 0.26 * dir, 0.75 * o, 0.2, '#ffb040', 0.95);
    glowE(ctx, 0, (0.3 + 0.7 * o) * dir, 0.55 * o, 0.9 * o, '#ff8a2a', 0.4 * o);
  }
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * (0.36 + o * 0.62), (0.23 + o * 0.03) * dir); ctx.rotate(s * o * 0.25 * dir); ctx.scale(s, 1); putF(ctx, R.sp, door, f); ctx.restore(); }
  // 警告灯（開く前に点滅）・発進の煙
  const cyc = (e.t + e.id * 11) % 170, warn = cyc > 80 && cyc < 150;
  for (const s of [-1, 1]) glow(ctx, s * 1.0, -0.4 * dir, warn ? 0.3 : 0.16, warn ? '#ff5a2a' : '#ffb040', warn ? 0.5 + 0.5 * Math.sin(R.now * 22) : 0.4);
  if (o > 0.5 && R.chance(16)) R.fx.smoke(R.ex + (R01() - 0.5) * 0.9, R.ey + dir * 0.4, (R01() - 0.5) * 1.2, dir * (1 + R01()), 0.3, 0.7, 0.4, 'steam');
}

// ---- ドローン drone（C11）: 紫の小型機。生体のハッチから出るものは幼体 ----------------------------
function drawDrone(R, e, f, v) {
  const ctx = R.ctx, flesh = e.color === 'flesh';
  const s = R.sp.get('drone' + (flesh ? 'F' : ''), 1.2, 1.0, (c) => {
    if (flesh) {
      for (const sy of [1, -1]) solid(c, blobPath([[-0.1, sy * 0.1], [-0.3, sy * 0.36], [-0.46, sy * 0.3], [-0.36, sy * 0.06]]), '#c84a6a', { d: 0.02, lw: 0.02, line: '#3a0614' });
      solid(c, blobPath([[0.46, 0], [0.2, 0.24], [-0.2, 0.2], [-0.42, 0], [-0.2, -0.2], [0.2, -0.24]]), '#e8607e', { d: 0.04, hi: '#ffd0dc', lo: '#7a1030', line: '#3a0614', tex: 'blot', texA: 0.4 });
      ball(c, 0.16, 0, 0.13, '#ffe890', { lo: '#c87a10', lw: 0.02 }); fillP(c, el(0.19, 0, 0.035, 0.09), '#1a0408');
    } else {
      for (const sy of [1, -1]) solid(c, pg([[0.0, sy * 0.12], [-0.22, sy * 0.4], [-0.46, sy * 0.36], [-0.34, sy * 0.1]]), '#7a3ab0', { d: 0.025, lw: 0.022 });
      solid(c, rpg([[0.47, 0], [0.08, 0.26], [-0.4, 0.14], [-0.44, -0.14], [0.08, -0.26]], 0.04), '#b45adc', { d: 0.035, hi: '#f0c8ff', lo: '#4a1a70' });
      seam(c, [[-0.14, 0.2], [-0.14, -0.2]], 0.012, 0.5);
      glass(c, el(0.14, 0, 0.13, 0.08), '#e8f4ff');
      solid(c, rr(-0.5, -0.06, 0.1, 0.12, 0.02), '#2a2038', { g: 'cyl', d: 0, lw: 0.016 });
    }
  });
  face(ctx, e.ang);
  const fl = 0.3 + Math.sin(R.now * 55 + e.id) * 0.07;
  if (!flesh) { streak(ctx, -0.48 - fl, 0, fl, 0.16, '#ff8aff', 0.9, 'flame'); glow(ctx, -0.5, 0, 0.2, '#ff8aff', 0.6 + 0.3 * Math.sin(R.now * 20 + e.id)); }
  else ctx.scale(1 + Math.sin(R.now * 14 + e.id) * 0.06, 1 - Math.sin(R.now * 14 + e.id) * 0.06);
  putF(ctx, R.sp, s, f);
  glow(ctx, 0.15, 0, 0.16, flesh ? '#ffe890' : '#ffffff', 0.5);
}

// ---- 岩 rock・小石 pebble（C11, C16）: 面ごとに光の向きで塗り分けた 16 方向の絵。ひびは損傷で進む ---------
const NROT = 16;
function facets(c, pts, base, hi, lo, cx, cy) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const nx = (b[1] - a[1]), ny = -(b[0] - a[0]), l = Math.hypot(nx, ny) || 1;
    const dot = (nx / l) * -0.35 + (ny / l) * 0.94 * K.ly, col = dot > 0 ? mix(base, hi, dot) : mix(base, lo, -dot);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cx, cy); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 0.015; c.stroke();
  }
}
function rockPts(seed, r, n = 10) { const q = rnd(seed), p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, rr2 = r * (0.8 + q() * 0.22); p.push([Math.cos(a) * rr2, Math.sin(a) * rr2]); } return p; }
function rockFrame(R, variant, big, stone, fr) {
  const r = big ? 1.25 : 0.7;
  return R.sp.get(`rock${variant}${big ? 'B' : 'S'}${stone ? 's' : 'l'}_${fr}`, r * 2.3, r * 2.3, (c) => {
    const a = fr / NROT * TAU, base0 = rockPts(variant * 7 + (big ? 3 : 1), r), pts = rot2(base0, a), sh = pg(pts);
    const col = stone ? '#8a8270' : '#4e342c', hi = stone ? '#d8d0b8' : '#a07a60', lo = stone ? '#2e2a24' : '#160c0a';
    const o = rot2([[r * 0.12, r * 0.1]], a)[0];
    facets(c, pts, col, hi, lo, o[0], o[1]);
    // 内側の小さな面（割れ肌）
    const inner = rot2(rockPts(variant * 13 + 5, r * 0.5, 6).map(([x, y]) => [x + r * 0.1, y + r * 0.08]), a);
    facets(c, inner, mix(col, hi, 0.15), hi, lo, o[0], o[1]);
    tex(c, sh, 'grit', 0.45, a);
    c.save(); c.rotate(a);
    if (!stone) { crack(c, -r * 0.55, r * 0.1, 0.3, r * 0.9, variant + 3, 0.035, '#ff8a2a'); crack(c, r * 0.2, -r * 0.5, 1.9, r * 0.6, variant + 9, 0.03, '#ff6a1a'); }
    else { crack(c, -r * 0.5, r * 0.3, -0.5, r * 0.7, variant + 3, 0.022); for (const [x, y, s] of [[0.3, 0.4, 0.09], [-0.2, -0.45, 0.07], [0.5, -0.2, 0.06]]) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(x * r, y * r, s * r, s * r * 0.7, 0, 0, TAU); c.fill(); } }
    c.restore();
    sh(c); c.strokeStyle = stone ? '#1a1814' : '#0c0606'; c.lineWidth = 0.04; c.stroke();
  });
}
const rotFrame = (spin) => { const t = ((spin / TAU * NROT) % NROT + NROT) % NROT, fr = Math.round(t) % NROT; return [fr, (t - Math.round(t)) / NROT * TAU]; };
function drawRock(R, e, f, v) {
  const ctx = R.ctx, stone = e.color === 'stone', big = !!e.big, variant = e.id % 3;
  const [fr, res] = rotFrame(e.spin || 0);
  ctx.save(); ctx.rotate(res); putF(ctx, R.sp, rockFrame(R, variant, big, stone, fr), f); ctx.restore();
  const dmg = 1 - e.hp / e.maxHp;
  if (dmg > 0.1) {       // ひび割れの進行（回転に合わせる）
    const lv = dmg > 0.55 ? 2 : 1, cr = R.sp.get(`rockcr${big ? 'B' : 'S'}${lv}${stone ? 's' : 'l'}`, e.r * 2.2, e.r * 2.2, (c) => { for (let k = 0; k < lv * 2 + 1; k++) crack(c, 0, 0, k * 2.3 + 0.4, e.r * 0.85, 30 + k, 0.03 + lv * 0.008, stone ? null : '#ffb040'); });
    ctx.save(); ctx.rotate(e.spin || 0); put(ctx, cr); ctx.restore();
  }
  if (!stone) { glow(ctx, 0, 0, e.r * 1.5, '#ff5a1a', 0.22 + 0.08 * Math.sin(R.now * 6 + e.id) + dmg * 0.3); if (R.chance(big ? 14 : 7)) R.fx.ember(R.ex + (R01() - 0.5) * e.r, R.ey + (R01() - 0.5) * e.r, (R01() - 0.5) * 1.5, R01() * 1.5, 0.06, 0.5, 5, 2); }
  else if (R.chance(4)) R.fx.smoke(R.ex, R.ey + e.r * 0.5, (R01() - 0.5) * 0.5, 0.6, 0.2, 0.4, 0.3, 'dust');
}
function drawPebble(R, e, f, v) {
  const ctx = R.ctx, [fr, res] = rotFrame(e.spin || 0);
  const s = R.sp.get('pebble_' + fr, 1.4, 1.4, (c) => {
    const a = fr / NROT * TAU, pts = rot2(rockPts(77, 0.62, 12), a), sh = pg(pts);
    const o = rot2([[0.06, 0.06]], a)[0];
    facets(c, pts, '#9a96a8', '#e8e4f4', '#34323e', o[0], o[1]);
    tex(c, sh, 'grit', 0.5, a);
    c.save(); c.rotate(a);
    // 彫った顔（眉・目・口）
    fillP(c, pg([[-0.42, 0.26], [-0.06, 0.2], [-0.06, 0.1], [-0.4, 0.12]]), '#24222c'); fillP(c, pg([[0.42, 0.26], [0.06, 0.2], [0.06, 0.1], [0.4, 0.12]]), '#24222c');
    lamp(c, -0.22, 0.14, 0.04, '#ff7ad0', 2.4); lamp(c, 0.22, 0.14, 0.04, '#ff7ad0', 2.4);
    fillP(c, rr(-0.06, -0.12, 0.12, 0.26, 0.03), 'rgba(0,0,0,0.3)');
    fillP(c, rpg([[-0.24, -0.2], [0.24, -0.2], [0.18, -0.36], [-0.18, -0.36]], 0.03), '#16141c');
    line(c, [[-0.18, -0.37], [0.18, -0.37]], 'rgba(255,255,255,0.35)', 0.02);
    crack(c, 0.3, 0.4, -1.2, 0.3, 5, 0.018);
    c.restore();
    sh(c); c.strokeStyle = '#16141c'; c.lineWidth = 0.035; c.stroke();
  });
  ctx.save(); ctx.rotate(res); putF(ctx, R.sp, s, f); ctx.restore();
  // 回転の残像と目の光
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(210,205,230,0.16)'; ctx.lineWidth = 0.06; const sp = e.spin || 0;
  for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(0, 0, 0.66, sp + k * Math.PI - 0.9, sp + k * Math.PI); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  for (const sx of [-0.22, 0.22]) { const p = [sx * Math.cos(sp) - 0.14 * Math.sin(sp), sx * Math.sin(sp) + 0.14 * Math.cos(sp)]; glow(ctx, p[0], p[1], 0.16, '#ff7ad0', 0.8); }
}

// ---- 中型機 heavy（C15）: 多層装甲・可動フラップ・砲口の予告光・損傷段階 ---------------------------
const HEAVY_COL = { n: '#6a7a9c', red: '#c8402a', flesh: '#a83a5a', cell: '#2f9a88' };
function drawHeavy(R, e, f, v) {
  const ctx = R.ctx, g = R.g, key = e.carrier ? 'red' : e.color === 'flesh' ? 'flesh' : e.color === 'cell' ? 'cell' : 'n', col = HEAVY_COL[key], org = key === 'flesh' || key === 'cell';
  const hull = R.sp.get('heavy_' + key, 3.1, 2.1, (c) => {
    // 後部の機関部
    solid(c, rr(0.72, -0.5, 0.56, 1.0, 0.08), '#2c3446', { d: 0.04, tex: 'grit', texA: 0.3 });
    for (const y of [0.25, -0.25]) { solid(c, rr(1.2, y - 0.15, 0.14, 0.3, 0.03), '#4a5266', { g: 'cyl', d: 0.015, lw: 0.02 }); fillP(c, rr(1.3, y - 0.09, 0.04, 0.18, 0.01), '#bfe8ff'); }
    // 砲（中央の主砲・上下の副砲）
    solid(c, rr(-1.46, -0.1, 0.56, 0.2, 0.03), '#3a4254', { g: 'cyl', d: 0.015, lw: 0.022 }); solid(c, rr(-1.5, -0.13, 0.12, 0.26, 0.03), '#232a38', { g: 'cyl', d: 0.01, lw: 0.02 });
    for (const y of [0.42, -0.42]) solid(c, rr(-1.2, y - 0.06, 0.42, 0.12, 0.02), '#3a4254', { g: 'cyl', d: 0.01, lw: 0.02 });
    // 主船体（楔形）
    const body = rpg([[-1.22, 0], [-0.55, 0.6], [0.95, 0.68], [1.16, 0.25], [1.16, -0.25], [0.95, -0.68], [-0.55, -0.6]], 0.06);
    solid(c, body, mix(col, '#20283a', 0.35), { d: 0.05, tex: org ? 'blot' : 'grit', texA: 0.35 });
    // 内側の装甲（フラップの下に見える機関の光の溝）
    for (const sy of [1, -1]) { fillP(c, pg([[-0.5, sy * 0.3], [0.7, sy * 0.36], [0.7, sy * 0.5], [-0.4, sy * 0.46]]), '#0c0e14'); for (let k = 0; k < 6; k++) fillP(c, rr(-0.36 + k * 0.18, sy * 0.4 - 0.045, 0.1, 0.09, 0.02), '#ff8a2a'); }
    // 中央の装甲帯と艦橋
    const mid = rpg([[-1.0, 0], [-0.5, 0.26], [0.86, 0.3], [0.96, 0], [0.86, -0.3], [-0.5, -0.26]], 0.05);
    solid(c, mid, col, { d: 0.045, hi: lite(col, 0.6), tex: org ? 'blot' : 'brush', texA: 0.25 });
    seam(c, [[-0.5, 0.25], [-0.5, -0.25]], 0.016); seam(c, [[0.3, 0.29], [0.3, -0.29]], 0.016); seam(c, [[0.3, 0], [0.9, 0]], 0.014, 0.5);
    for (const [x, y] of [[0.42, 0.2], [0.62, 0.2], [0.42, -0.2], [0.62, -0.2], [-0.62, 0.1], [-0.62, -0.1]]) rivet(c, x, y, 0.022);
    if (org) { c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.025; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(-0.4 + k * 0.28, 0.27); c.quadraticCurveTo(-0.3 + k * 0.28, 0, -0.4 + k * 0.28, -0.27); c.stroke(); } }
    ball(c, -0.12, 0, 0.2, '#1a2030', { spec: 0, lw: 0.03 }); lamp(c, -0.12, 0, 0.1, org ? '#7affd0' : '#ff5028', 2);
    glass(c, rpg([[0.02, 0.18], [0.24, 0.2], [0.24, 0.08], [0.06, 0.08]], 0.02), '#7ad0ff');
  });
  const flap = (flip) => R.sp.get('heavyfl_' + key + (flip ? 'b' : 't'), 2.3, 0.9, (c) => {
    const p = rpg([[-1.62, -0.26], [-1.3, 0.16], [-0.06, 0.26], [0.08, -0.04], [-0.1, -0.2], [-1.0, -0.26]], 0.05);
    shadow(c, p, 0.35, 0, -0.05);
    solid(c, p, col, { d: 0.05, hi: lite(col, 0.6), tex: org ? 'blot' : 'brush', texA: 0.25 });
    seam(c, [[-1.0, 0.18], [-0.9, -0.25]], 0.016); seam(c, [[-0.5, 0.22], [-0.44, -0.2]], 0.016);
    c.save(); p(c); c.clip(); fillP(c, pg([[-1.7, -0.3], [-1.36, 0.2], [-1.2, 0.2], [-1.5, -0.3]]), e.carrier ? '#ffd24a' : lite(col, 0.5)); c.restore();
    for (const x of [-1.15, -0.7, -0.25]) rivet(c, x, 0.02, 0.02);
  }, { ox: -0.75, flip });
  // 状態
  const dmg = 1 - e.hp / e.maxHp, lv = dmg > 0.66 ? 2 : dmg > 0.33 ? 1 : 0;
  if (v.lv !== undefined && lv > v.lv) { for (let i = 0; i < 6; i++) R.fx.debris(R.ex + (R01() - 0.5), R.ey + (R01() - 0.5) * 0.8, (R01() - 0.3) * 6, (R01() - 0.3) * 6, 0.16, 0.9); R.fx.explode(R.ex + (R01() - 0.5), R.ey + (R01() - 0.5) * 0.8, 's'); }
  v.lv = lv;
  v.flap = lerp(v.flap || 0, e.phase === 1 ? 1 : 0, 1 - Math.exp(-R.dt * 6));
  const iv = g.fireInterval(70), ttf = e.phase === 1 ? ((40 - (e.hold % iv)) + iv) % iv : 99, warn = ttf < 26 ? 1 - ttf / 26 : 0;
  if (fired(e, v)) { v.rec = 1; for (const y of [0, 0.42, -0.42]) R.fx.flashAt(R.ex - 1.5, R.ey + y, 0.5, 0.08, 4); }
  v.rec = Math.max(0, (v.rec || 0) - R.dt * 5);
  // 噴射（後ろ＝右）
  const fl = 0.5 + Math.hypot(e.vx, e.vy) * 60 * 0.08 + Math.sin(R.now * 47 + e.id) * 0.06;
  for (const y of [0.25, -0.25]) { ctx.save(); ctx.translate(1.3, y); ctx.scale(-1, 1); streak(ctx, -fl, 0, fl, 0.3, org ? '#7affd0' : '#6ab8ff', 0.9, 'flame'); ctx.restore(); }
  ctx.save(); ctx.translate(v.rec * 0.08, 0);
  putF(ctx, R.sp, hull, f);
  glowE(ctx, 0.1, 0.4, 0.7, 0.12, '#ff8a2a', 0.25 + v.flap * 0.6); glowE(ctx, 0.1, -0.4, 0.7, 0.12, '#ff8a2a', 0.25 + v.flap * 0.6);
  for (const s of [1, -1]) { ctx.save(); ctx.translate(0.9, s * 0.52); ctx.rotate(-s * v.flap * 0.26); putF(ctx, R.sp, flap(s < 0), f); ctx.restore(); }
  if (lv > 0) put(ctx, R.sp.get('heavyD' + lv, 2.8, 1.8, (c) => {
    crack(c, -0.6, 0.3, -0.6, 0.9, 11, 0.03); crack(c, 0.5, -0.2, 2.6, 0.7, 12, 0.028);
    fillP(c, el(-0.3, 0.35, 0.22, 0.12, 0.3), 'rgba(10,8,8,0.55)');
    if (lv > 1) { crack(c, 0.2, 0.5, -1.2, 1.0, 13, 0.035, '#ff8a2a'); crack(c, -0.8, -0.3, 0.3, 0.8, 14, 0.03, '#ff8a2a'); fillP(c, el(0.5, -0.4, 0.3, 0.14, -0.2), 'rgba(10,8,8,0.65)'); lamp(c, 0.5, -0.4, 0.06, '#ff8a2a', 3); }
  }));
  glow(ctx, -0.12, 0, 0.36 + warn * 0.2, org ? '#7affd0' : '#ff5028', 0.5 + 0.3 * Math.sin(R.now * 6) + warn * 0.5);
  if (warn > 0) { for (const y of [0, 0.42, -0.42]) glow(ctx, y === 0 ? -1.5 : -1.2, y, 0.16 + warn * 0.22, '#ff5a6a', warn); }       // 砲口の予告光
  ctx.restore();
  if (lv > 0 && R.chance(lv * 9)) R.fx.smoke(R.ex + (R01() - 0.3) * 1.2, R.ey + (R01() - 0.5) * 0.9, 1 + R01(), 0.5 + R01() * 0.6, 0.3 + lv * 0.08, 0.8, 0.55);
  if (lv > 1 && R.chance(10)) R.fx.spk(R.ex + (R01() - 0.5) * 1.4, R.ey + (R01() - 0.5) * 0.9, (R01() - 0.5) * 8, (R01() - 0.2) * 8, 0.2, 0);
  if (lv > 1 && R.chance(6)) R.fx.fire(R.ex + 0.5, R.ey - 0.4, 1, 0.5, 0.3, 0.35);
}

// ---- 石材 brick・シャッター shutter（C16）: 質感・ひびの進行 ---------------------------------------
function drawBrick(R, e, f, v) {
  const pal = R.pal, lv = e.hp >= e.maxHp ? 0 : e.hp / e.maxHp > 0.5 ? 1 : 2, base = mix(pal.ground[0], '#a09078', 0.45);
  const s = R.sp.get('brick' + lv + base, 1.9, 1.9, (c) => {
    const h = e.r * 0.98, sh = rr(-h, -h, h * 2, h * 2, 0.06);
    solid(c, sh, base, { d: 0.09, hi: lite(base, 0.5), lo: dark(base, 0.6), tex: 'grit', texA: 0.55, lw: 0.04 });
    const inner = rr(-h * 0.66, -h * 0.66, h * 1.32, h * 1.32, 0.04);
    c.save(); K.ly = -K.ly; solid(c, inner, dark(base, 0.22), { d: 0.05, tex: 'grit', texA: 0.6, lw: 0.02, ao: 0.5, rim: 0.4, hi: dark(base, 0.3), lo: dark(base, 0.12) }); K.ly = -K.ly; c.restore();   // くぼみ（上下逆の光）
    // 彫りの紋様（渦を巻く角線）
    seam(c, [[-0.36, 0.36], [0.36, 0.36], [0.36, -0.36], [-0.2, -0.36], [-0.2, 0.18], [0.18, 0.18], [0.18, -0.18], [-0.02, -0.18], [-0.02, 0.02]], 0.035, 0.75);
    c.fillStyle = rgba(pal.edge || '#6a8a4a', 0.0);
    for (const [x, y, r] of [[-0.7, 0.72, 0.1], [-0.52, 0.76, 0.07], [0.66, -0.74, 0.09]]) { c.fillStyle = 'rgba(70,110,60,0.55)'; c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0, 0, TAU); c.fill(); }   // 苔
    fillP(c, pg([[h, h], [h - 0.16, h], [h, h - 0.12]]), 'rgba(0,0,0,0.5)');                 // 欠け
    if (lv > 0) { crack(c, -h * 0.9, h * 0.8, -0.7, 1.1, 21, 0.035); fillP(c, pg([[-h, -h], [-h + 0.3, -h], [-h, -h + 0.22]]), 'rgba(0,0,0,0.6)'); }
    if (lv > 1) { crack(c, h * 0.8, h * 0.2, 3.6, 1.2, 22, 0.04); crack(c, 0, -h * 0.9, 1.4, 0.9, 23, 0.035); fillP(c, pg([[h, -h], [h - 0.36, -h], [h - 0.1, -h + 0.16], [h, -h + 0.34]]), 'rgba(0,0,0,0.7)'); }
  });
  if (v.lv !== undefined && lv > v.lv) for (let i = 0; i < 5; i++) R.fx.debris(R.ex + (R01() - 0.5) * 1.2, R.ey + (R01() - 0.5) * 1.2, -1 - R01() * 4, (R01() - 0.3) * 5, 0.12, 0.7, 'rock');
  v.lv = lv;
  putF(R.ctx, R.sp, s, f);
}
function drawShutter(R, e, f, v) {
  const ctx = R.ctx, r = e.hp / e.maxHp, lv = r > 0.7 ? 0 : r > 0.35 ? 1 : 2;
  const s = R.sp.get('shutter' + lv, 1.4, 1.8, (c) => {
    const h = e.r * 0.98, w = 0.58;
    solid(c, rr(-w, -h, w * 2, h * 2, 0.04), '#3a4458', { d: 0.05, lw: 0.035 });
    for (let k = 0; k < 5; k++) { const y = -h + 0.1 + k * (h * 2 - 0.2) / 5; solid(c, rr(-w + 0.08, y + 0.02, w * 2 - 0.16, (h * 2 - 0.2) / 5 - 0.04, 0.02), lv > 1 && k === 2 ? '#56607a' : '#7986a4', { g: 'cyl', d: 0.015, lw: 0.018, tex: 'brush', texA: 0.2 }); }
    for (const y of [-h + 0.05, h - 0.05]) for (const x of [-w + 0.05, w - 0.05]) rivet(c, x, y, 0.022);
    solid(c, rr(-0.13, -0.2, 0.26, 0.4, 0.04), '#232a38', { d: 0.03, lw: 0.025 }); fillP(c, rr(-0.045, -0.12, 0.09, 0.24, 0.02), '#0a0c12');
    if (lv > 0) { crack(c, -0.3, 0.5, -0.9, 0.7, 31, 0.028); fillP(c, el(0.26, -0.44, 0.14, 0.09, 0.4), 'rgba(0,0,0,0.45)'); line(c, [[0.14, -0.5], [0.36, -0.5]], 'rgba(255,255,255,0.3)', 0.015); }
    if (lv > 1) { crack(c, 0.3, 0.6, 3.9, 0.9, 32, 0.035); crack(c, -0.2, -0.6, 0.6, 0.6, 33, 0.03); fillP(c, el(-0.26, 0.2, 0.16, 0.1, -0.3), 'rgba(0,0,0,0.5)'); }
  });
  putF(ctx, R.sp, s, f);
  const col = lv === 0 ? '#4ab0ff' : lv === 1 ? '#ffc04a' : '#ff4a3a';
  glowE(ctx, 0, 0, 0.14, 0.26, col, 0.7 + (lv === 2 ? 0.3 * Math.sin(R.now * 20) : 0));
  if (v.lv !== undefined && lv > v.lv) for (let i = 0; i < 4; i++) R.fx.debris(R.ex - 0.4, R.ey + (R01() - 0.5), -2 - R01() * 4, (R01() - 0.3) * 5, 0.12, 0.7);
  v.lv = lv;
  if (lv > 1 && R.chance(6)) R.fx.spk(R.ex + (R01() - 0.5) * 0.8, R.ey + (R01() - 0.5) * 1.2, (R01() - 0.5) * 7, (R01() - 0.2) * 7, 0.2, 1);
}

// ---- 待ち伏せ popper（C17）: 地面から迫り出す石の頭。目の光・苔・風化 ------------------------------
function drawPopper(R, e, f, v) {
  const ctx = R.ctx, c0 = isC(e), dir = c0 ? -1 : 1, rise = e.rise || 0;
  const s = R.sp.get('popper' + (c0 ? 'c' : 'f'), 1.5, 1.3, (c) => {
    const pts = []; for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI; pts.push([Math.cos(a) * 0.62, 0.02 + Math.sin(a) * 0.6]); } pts.push([-0.62, -0.4], [0.62, -0.4]);
    const sh = pg(pts);
    solid(c, sh, '#8a8c7a', { d: 0.06, hi: '#e0e0cc', lo: '#34362c', tex: 'grit', texA: 0.55, lw: 0.035 });
    c.save(); sh(c); c.clip();
    fillP(c, rr(-0.7, 0.2, 1.4, 0.1), 'rgba(0,0,0,0.28)'); line(c, [[-0.7, 0.2], [0.7, 0.2]], 'rgba(255,255,255,0.3)', 0.02);             // 額の帯
    for (let k = -3; k <= 3; k++) fillP(c, rr(k * 0.17 - 0.04, 0.22, 0.08, 0.06), 'rgba(0,0,0,0.35)');
    fillP(c, pg([[-0.5, 0.16], [-0.1, 0.1], [-0.1, -0.04], [-0.48, 0.0]]), '#15160f'); fillP(c, pg([[0.5, 0.16], [0.1, 0.1], [0.1, -0.04], [0.48, 0.0]]), '#15160f');   // 目のくぼみ
    fillP(c, rr(-0.38, -0.3, 0.76, 0.16, 0.04), '#15160f'); for (const x of [-0.2, 0.2]) { solid(c, rr(x - 0.09, -0.3, 0.18, 0.14, 0.03), '#4a4c40', { g: 'cyl', d: 0.01, lw: 0.018 }); fillP(c, ci(x, -0.23, 0.04), '#050505'); }   // 口の砲
    for (const [x, y, r] of [[-0.3, 0.52, 0.14], [-0.12, 0.6, 0.1], [0.36, 0.44, 0.1], [0.5, 0.26, 0.06]]) { c.fillStyle = 'rgba(64,112,54,0.75)'; c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0, 0, TAU); c.fill(); }     // 苔
    crack(c, 0.2, 0.6, -1.9, 0.5, 41, 0.022);
    c.restore();
  }, { flip: c0 });
  if (rise > 0.02 && !v.up) { v.up = true; for (let i = 0; i < 5; i++) R.fx.smoke(R.ex + (R01() - 0.5) * 1.4, e.base, (R01() - 0.5) * 2.5, dir * (0.3 + R01() * 0.6), 0.28, 0.6, 0.5, 'dust'); }
  if (rise <= 0) v.up = false;
  // 地面より下は描かない
  ctx.save(); ctx.beginPath(); const gy = e.base - R.ey; if (c0) ctx.rect(-1, gy - 2, 2, 2); else ctx.rect(-1, gy, 2, 2); ctx.clip();
  putF(ctx, R.sp, s, f);
  ctx.restore();
  if (rise > 0.3) { const a = clamp((rise - 0.3) / 0.5, 0, 1); for (const x of [-0.3, 0.3]) glow(ctx, x, 0.06 * dir, 0.24, '#ffde4a', a * (0.75 + 0.25 * Math.sin(R.now * 12))); }
}

// ---- 石像 stonehead（C17）: 彫りの深い横顔。口（弱点）の開閉・目の光・苔と風化 ------------------------
function drawStoneHead(R, e, f, v) {
  const ctx = R.ctx, c0 = isC(e), dir = c0 ? -1 : 1, m = e.mouth || 0;
  const head = R.sp.get('shead' + (c0 ? 'c' : 'f'), 3.7, 4.7, (c) => {
    const lite0 = '#cfcadc', stone = '#8c8898', dk = '#33313d';
    // のどの奥（顎の後ろ）
    fillP(c, pg([[-1.3, -0.1], [-0.4, -0.1], [-0.4, -1.5], [-1.2, -1.5]]), '#0e0a12');
    const sh = pg([[1.5, -1.9], [1.56, 1.6], [1.2, 2.24], [0.2, 2.4], [-0.6, 2.24], [-1.02, 1.82], [-1.12, 1.4], [-1.02, 1.3], [-1.2, 1.12], [-1.3, 0.9], [-1.68, 0.42], [-1.42, 0.24], [-1.36, 0.02], [-1.45, -0.15], [-0.5, -0.08], [-0.46, -1.2], [-0.9, -1.9]]);
    solid(c, sh, stone, { d: 0.09, hi: lite0, lo: dk, mid: 0.45, tex: 'grit', texA: 0.6, lw: 0.045, line: '#18161e' });
    c.save(); sh(c); c.clip();
    // 眉の張り出しと目のくぼみ
    fillP(c, pg([[-1.14, 1.42], [0.2, 1.62], [0.3, 1.38], [-1.0, 1.2]]), lite(stone, 0.35)); 
    fillP(c, pg([[-1.2, 1.14], [0.25, 1.38], [0.28, 0.9], [-0.2, 0.74], [-1.16, 0.84]]), '#1b1922');
    line(c, [[-1.16, 0.84], [-0.2, 0.74], [0.28, 0.9]], 'rgba(255,255,255,0.28)', 0.03);
    // 頬・鼻筋・耳
    fillP(c, pg([[-1.5, 0.3], [-1.1, 0.72], [-0.92, 0.2], [-1.3, 0.06]]), 'rgba(255,255,255,0.14)');
    line(c, [[-0.9, 0.7], [-0.75, 0.2], [-0.9, -0.05]], 'rgba(0,0,0,0.35)', 0.05);
    const ear = rpg([[0.42, 1.2], [0.86, 1.3], [0.92, -0.3], [0.5, -0.5]], 0.1); shadow(c, ear, 0.35, -0.05, -0.05); solid(c, ear, mix(stone, lite0, 0.2), { d: 0.05, tex: 'grit', texA: 0.55, lw: 0.03 });
    fillP(c, rr(0.58, -0.1, 0.18, 1.0, 0.08), 'rgba(0,0,0,0.35)');
    // 額の帯の彫り
    for (let k = 0; k < 6; k++) { const x = -0.8 + k * 0.36; seam(c, [[x, 1.86], [x + 0.18, 2.04], [x + 0.36, 1.86]], 0.03, 0.6); }
    seam(c, [[-1.0, 1.76], [1.5, 1.86]], 0.03, 0.6);
    // 継ぎ目・雨だれ・ひび
    seam(c, [[1.1, 2.3], [1.12, -1.9]], 0.03, 0.5); seam(c, [[-0.5, -1.2], [1.5, -1.25]], 0.03, 0.5);
    c.strokeStyle = 'rgba(20,18,26,0.25)'; c.lineWidth = 0.05; for (const [x, y0, y1] of [[0.0, 1.5, 0.3], [0.3, 0.7, -0.6], [1.3, 1.6, 0.2], [-0.2, -0.3, -1.4]]) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 0.03, y1); c.stroke(); }
    crack(c, 0.9, 2.3, -1.8, 1.4, 51, 0.03); crack(c, -0.1, -0.5, -1.2, 0.9, 52, 0.028); crack(c, 1.5, 0.3, 2.9, 0.7, 53, 0.025);
    // 苔
    for (const [x, y, r] of [[-0.3, 2.3, 0.3], [0.3, 2.36, 0.26], [0.9, 2.2, 0.22], [1.4, 1.5, 0.14], [1.3, -1.6, 0.3], [0.7, -1.8, 0.24], [-0.6, 2.1, 0.12]]) { c.fillStyle = 'rgba(58,104,52,0.8)'; c.beginPath(); c.ellipse(x, y, r, r * 0.5, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(120,170,90,0.5)'; c.beginPath(); c.ellipse(x - r * 0.2, y + r * 0.12 * K.ly, r * 0.5, r * 0.2, 0, 0, TAU); c.fill(); }
    c.restore();
  }, { oy: 0.25, flip: c0 });
  const jaw = R.sp.get('sjaw' + (c0 ? 'c' : 'f'), 1.4, 1.5, (c) => {
    const j = pg([[-1.45, -0.17], [-0.5, -0.1], [-0.44, -0.8], [-0.8, -1.02], [-1.3, -0.94], [-1.42, -0.6]]);
    solid(c, j, '#8c8898', { d: 0.07, hi: '#cfcadc', lo: '#33313d', tex: 'grit', texA: 0.6, lw: 0.04, line: '#18161e' });
    for (let k = 0; k < 4; k++) fillP(c, pg([[-1.36 + k * 0.2, -0.16], [-1.26 + k * 0.2, -0.02], [-1.16 + k * 0.2, -0.15]]), '#d8d4e4');      // 歯
    seam(c, [[-1.3, -0.5], [-0.5, -0.44]], 0.025, 0.5);
  }, { ox: -0.95, oy: -0.55, flip: c0 });
  if (e.shake) { ctx.translate(Math.sin(R.now * 80) * 0.05, 0); if (R.chance(20)) R.fx.smoke(R.ex + (R01() - 0.5) * 2.4, R.ey + dir * (1.5 + R01()), (R01() - 0.5), -dir * 0.8, 0.2, 0.5, 0.4, 'dust'); }
  putF(ctx, R.sp, head, f * 0.5);
  // 口の奥の光（弱点）
  if (m > 0.05) { glowE(ctx, -1.05, (-0.25 - m * 0.22) * dir, 0.5, 0.16 + m * 0.3, '#ff3aa0', 0.5 + m * 0.5); glow(ctx, -1.0, (-0.25 - m * 0.22) * dir, 0.2 + m * 0.2, '#ffffff', m * 0.8 + f); }
  ctx.save(); ctx.translate(-m * 0.04, -m * 0.5 * dir); putF(ctx, R.sp, jaw, f * 0.5); ctx.restore();
  // 目の光（予告で強く）
  const ea = 0.35 + m * 0.5 + (e.shake ? 0.4 + 0.3 * Math.sin(R.now * 40) : 0);
  glowE(ctx, -0.55, 1.0 * dir, 0.5, 0.2, '#ff5ac8', ea); glow(ctx, -0.62, 0.98 * dir, 0.12, '#ffffff', ea);
}

// ---- 押しつぶし柱 piston・動く壁 slider・光線発生器 zapper（C18） -------------------------------------
function drawPiston(R, e, f, v) {           // ワールド座標で描く
  const ctx = R.ctx, dir = isC(e) ? -1 : 1, len = e.len || 1, hw = e.w * 0.95;
  const seg = R.sp.get('piston_s' + hw.toFixed(2), hw * 2 + 0.1, 1.2, (c) => {
    solid(c, rr(-hw, -0.55, hw * 2, 1.1), '#7a6a52', { g: 'cylx', d: 0, lw: 0.03, hi: '#d8c8a0', lo: '#3a2e20', tex: 'brush', texA: 0.2 });
    for (const sx of [-1, 1]) { solid(c, rr(sx * hw * 0.62 - 0.11, -0.55, 0.22, 1.1), '#b8bec8', { g: 'cylx', d: 0, lw: 0.018 }); }      // 油圧の磨いた棒
    fillP(c, rr(-hw, -0.55, hw * 2, 0.07), 'rgba(0,0,0,0.45)'); fillP(c, rr(-hw, 0.46, hw * 2, 0.05), 'rgba(255,255,255,0.22)');
    for (const x of [-hw + 0.1, hw - 0.1, 0]) rivet(c, x, 0.36, 0.026);
    fillP(c, rr(-0.22, -0.28, 0.44, 0.4, 0.04), 'rgba(0,0,0,0.35)');
  });
  const head = R.sp.get('piston_h' + hw.toFixed(2), hw * 2 + 0.4, 0.8, (c) => {
    solid(c, rr(-hw - 0.08, -0.3, hw * 2 + 0.16, 0.6, 0.05), '#4a3e30', { d: 0.05, lw: 0.035 });
    hazard(c, rr(-hw - 0.08, -0.02, hw * 2 + 0.16, 0.32, 0.03), 0.2);
    for (let k = -3; k <= 3; k++) fillP(c, pg([[k * hw * 0.3 - 0.1, 0.3], [k * hw * 0.3 + 0.1, 0.3], [k * hw * 0.3, 0.38]]), '#2a2218');   // 歯
  });
  const coll = R.sp.get('piston_c' + hw.toFixed(2), hw * 2 + 0.9, 1.0, (c) => {
    solid(c, rpg([[-hw - 0.36, -0.42], [hw + 0.36, -0.42], [hw + 0.24, 0.42], [-hw - 0.24, 0.42]], 0.05), '#3a332a', { d: 0.06, tex: 'grit', texA: 0.4, lw: 0.035 });
    for (const sx of [-1, 1]) { ball(c, sx * (hw + 0.08), 0.05, 0.11, '#20242c', { spec: 0, lw: 0.02 }); for (const x of [0.3, 0.6]) rivet(c, sx * (hw - x), -0.22, 0.026); }
  });
  const shake = e.warn ? Math.sin(R.now * 70) * 0.045 : 0;
  ctx.save(); ctx.translate(R.ex + shake, e.root); ctx.scale(1, dir);
  // 胴（先端から根元へ並べる。伸びると一緒に動く）
  ctx.save(); ctx.beginPath(); ctx.rect(-hw - 0.2, 0, hw * 2 + 0.4, len - 0.3); ctx.clip();
  for (let y = len - 0.3 - 0.55; y > -1.1; y -= 1.1) { ctx.save(); ctx.translate(0, y); put(ctx, seg); ctx.restore(); }
  ctx.restore();
  ctx.save(); ctx.translate(0, len - 0.32); put(ctx, head); ctx.restore();
  ctx.save(); ctx.translate(0, 0.1); put(ctx, coll); ctx.restore();
  const wl = e.warn ? 0.5 + 0.5 * Math.sin(R.now * 30) : 0.25;
  for (const sx of [-1, 1]) glow(ctx, sx * (hw + 0.08), 0.15, e.warn ? 0.4 : 0.2, e.warn ? '#ff4a2a' : '#ffb040', wl);
  if (e.warn) glowE(ctx, 0, len + 0.05, hw, 0.14, '#ff4a2a', wl * 0.8);
  ctx.restore();
  // 伸びる瞬間の蒸気・伸びきった時の火花
  const ext = e.ext || 0, de = ext - (v.ext ?? ext); v.ext = ext;
  if (de > 0.02 && R.chance(60)) R.fx.smoke(R.ex + (R01() < 0.5 ? -1 : 1) * (hw + 0.2), e.root + dir * 0.3, (R01() - 0.5) * 3, dir * R01(), 0.3, 0.5, 0.5, 'steam');
  if (ext >= 1 && !v.slam) { v.slam = true; if (Math.abs(R.ex - R.cam - 16) < 18) { for (let i = 0; i < 8; i++) R.fx.spk(R.ex + (R01() - 0.5) * hw * 2, e.root + dir * len, (R01() - 0.5) * 12, -dir * R01() * 5, 0.2, 0); R.fx.shake(0.1); } }
  if (ext < 0.5) v.slam = false;
}
drawPiston.world = true;
function drawSlider(R, e, f, v) {
  const ctx = R.ctx, h = e.h ?? 3, amp = e.amp ?? 3.5;
  // 案内レール（動く範囲）
  ctx.save(); ctx.translate(0, (e.y0 ?? R.ey) - R.ey);
  ctx.fillStyle = '#14161e'; ctx.fillRect(-0.16, -amp - h / 2 - 0.2, 0.32, amp * 2 + h + 0.4); ctx.fillStyle = 'rgba(160,180,210,0.35)'; ctx.fillRect(-0.16, -amp - h / 2 - 0.2, 0.05, amp * 2 + h + 0.4);
  for (let y = -amp - h / 2; y <= amp + h / 2; y += 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-0.1, y, 0.2, 0.06); }
  ctx.restore();
  const s = R.sp.get('slider' + h, 2.2, h + 0.2, (c) => {
    const b = rr(-0.98, -h / 2, 1.96, h, 0.06);
    solid(c, b, '#5c6a88', { d: 0.07, hi: '#c0cce4', lo: '#232a3a', tex: 'grit', texA: 0.35, lw: 0.04 });
    hazard(c, rr(-0.98, h / 2 - 0.32, 1.96, 0.32, 0.04), 0.2); hazard(c, rr(-0.98, -h / 2, 1.96, 0.32, 0.04), 0.2);
    solid(c, rr(-0.6, -h / 2 + 0.5, 1.2, h - 1.0, 0.06), '#39445c', { d: 0.04, lw: 0.025, rim: 0.25 });
    fillP(c, rr(-0.12, -h / 2 + 0.62, 0.24, h - 1.24, 0.06), '#1a1206'); fillP(c, rr(-0.07, -h / 2 + 0.68, 0.14, h - 1.36, 0.05), '#ffc04a');
    for (const x of [-0.8, 0.8]) for (let y = -h / 2 + 0.55; y < h / 2 - 0.5; y += 0.45) rivet(c, x, y, 0.026);
    seam(c, [[-0.98, 0], [-0.6, 0]], 0.016); seam(c, [[0.6, 0], [0.98, 0]], 0.016);
  });
  put(ctx, s);
  const sp = Math.abs(Math.cos((e.t + (e.phase0 ?? 0)) * (e.freq ?? 0.025)));
  glowE(ctx, 0, 0, 0.3, h / 2 - 0.5, '#ffb040', 0.4 + 0.4 * sp);
}
function drawZapper(R, e, f, v) {            // ワールド座標で描く
  const ctx = R.ctx, x = R.ex, now = R.now, hot = e.warn || e.beam;
  const node = (flip) => R.sp.get('zap' + (flip ? 'c' : 'f'), 1.9, 1.7, (c) => {
    solid(c, pg([[-0.8, -0.62], [0.8, -0.62], [0.56, -0.2], [-0.56, -0.2]]), '#3c465c', { d: 0.045, tex: 'grit', texA: 0.3 });
    hazard(c, rr(-0.76, -0.62, 1.52, 0.09), 0.09);
    for (const sx of [-1, 1]) { solid(c, pg([[sx * 0.5, -0.2], [sx * 0.66, 0.42], [sx * 0.5, 0.6], [sx * 0.34, 0.3], [sx * 0.3, -0.2]]), '#8a96b2', { d: 0.03, lw: 0.025 }); ball(c, sx * 0.5, 0.56, 0.08, '#d8e0f0', { lw: 0.018 }); }      // 電極の爪
    ball(c, 0, 0, 0.4, '#2a3244', { lw: 0.03, spec: 0.3 });
    c.strokeStyle = '#aab8d4'; c.lineWidth = 0.05; c.beginPath(); c.arc(0, 0, 0.3, 0, TAU); c.stroke();
    ball(c, 0, 0, 0.2, '#0c1018', { spec: 0, lw: 0 });
  }, { flip });
  const lens = hot ? '#ff3a6a' : '#4ab0ff';
  for (const [y, fl] of [[e.y0, false], [e.y1, true]]) {
    ctx.save(); ctx.translate(x, y); putF(ctx, R.sp, node(fl), f);
    glow(ctx, 0, 0, hot ? 0.5 + 0.1 * Math.sin(now * 40) : 0.32, lens, hot ? 1 : 0.7); glow(ctx, 0, 0, 0.14, '#ffffff', 0.9);
    ctx.restore();
  }
  const y0 = e.y0 + 0.2, y1 = e.y1 - 0.2, L = y1 - y0;
  if (e.warn) {
    // 予告: 細い点線と、両端に集まる光
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,70,110,${0.45 + 0.3 * Math.sin(now * 30)})`; ctx.lineWidth = 0.05; ctx.setLineDash([0.3, 0.22]); ctx.lineDashOffset = -now * 3;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.setLineDash([]); ctx.globalCompositeOperation = 'source-over';
    if (R.chance(30)) { const top = R01() < 0.5, a = R01() * TAU; R.fx.ember(x + Math.cos(a) * 0.9, (top ? e.y1 : e.y0) + Math.sin(a) * 0.9, -Math.cos(a) * 3.5, -Math.sin(a) * 3.5, 0.06, 0.25, 1, 0); }
  }
  if (e.beam) {
    // 光の柱: 外光・芯・稲妻・両端の火花
    ctx.save(); ctx.translate(x, y0); ctx.rotate(Math.PI / 2);
    const w = 1 + 0.12 * Math.sin(now * 50);
    streak(ctx, -0.2, 0, L + 0.4, 1.5 * w, '#ff2a6a', 0.9, 'bar'); streak(ctx, -0.1, 0, L + 0.2, 0.62 * w, '#ffb0c8', 1, 'bar');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -0.1 * w, L, 0.2 * w);
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,220,235,0.9)'; ctx.lineWidth = 0.04;
    for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(0, 0); const n = Math.max(3, (L * 1.6) | 0); for (let i = 1; i <= n; i++) ctx.lineTo(L * i / n, i === n ? 0 : (R01() - 0.5) * 0.7); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    for (const y of [e.y0, e.y1]) { glow(ctx, x, y, 1.0, '#ff5a8a', 0.8); if (R.chance(40)) R.fx.spk(x, y, (R01() - 0.5) * 10, (y === e.y0 ? 1 : -1) * R01() * 7, 0.2, 2); }
  }
}
drawZapper.world = true;

// ---- 触手 tentacle・胞子 spore・膜 membrane・細胞 blob（C19） -----------------------------------------
function fleshSeg(R, r) {
  return R.sp.get('tseg' + r.toFixed(2), r * 2.4, r * 2.4, (c) => {
    ball(c, 0, 0, r, '#a8324e', { hi: '#ff9ab0', lo: '#3c0a1a', bounce: '#ff7a9a', line: '#28040e', lw: 0.035, tex: 'blot', texA: 0.45, spec: 0.75 });
    c.save(); ci(0, 0, r)(c); c.clip();
    c.strokeStyle = 'rgba(40,4,14,0.5)'; c.lineWidth = 0.035; c.beginPath(); c.ellipse(0, 0, r * 0.35, r * 1.1, 0, 0, TAU); c.stroke();        // 節の筋
    for (const y of [-0.45, 0.45]) { ball(c, r * 0.12, y * r, r * 0.2, '#ffc0cc', { lo: '#b04a66', lw: 0.018, spec: 0 }); fillP(c, ci(r * 0.12, y * r, r * 0.08), '#5a1026'); }    // 吸盤
    c.restore();
  });
}
function eyeBulb(R, key, r, iris) {       // 生体の先端（弱点）: 花弁のような唇に囲まれた目
  return R.sp.get(key, r * 2.6, r * 2.6, (c) => {
    for (let k = 0; k < 5; k++) { c.save(); c.rotate(k / 5 * TAU + 0.3); solid(c, el(r * 0.62, 0, r * 0.48, r * 0.36), '#e0607e', { d: 0.03, hi: '#ffc8d4', lo: '#7a1030', line: '#28040e', lw: 0.025 }); c.restore(); }
    ball(c, 0, 0, r * 0.66, '#fff0c0', { hi: '#ffffff', lo: '#c08a30', line: '#28040e', lw: 0.03, spec: 0 });
    ball(c, 0, 0, r * 0.42, iris, { hi: lite(iris, 0.6), lo: dark(iris, 0.7), lw: 0.02, spec: 0 });
  });
}
function drawTentacle(R, e, f, v) {          // ワールド座標で描く
  const ctx = R.ctx, a = R.alpha, now = R.now, ps = e.parts, n = ps.length, c0 = isC(e);
  // 根元の肉のこぶ
  const root = R.sp.get('troot' + (c0 ? 'c' : 'f'), 2.2, 1.2, (c) => { solid(c, blobPath([[-0.95, -0.2], [-0.7, 0.2], [-0.2, 0.42], [0.3, 0.4], [0.75, 0.16], [0.95, -0.2]]), '#8a2440', { d: 0.06, hi: '#f08aa4', lo: '#30081a', line: '#28040e', tex: 'blot', texA: 0.5 }); }, { flip: c0 });
  ctx.save(); ctx.translate(e.root.x, e.root.y + (c0 ? -0.1 : 0.1)); put(ctx, root); ctx.restore();
  for (let i = 0; i < n - 1; i++) {
    const q = ps[i], x = lerp(q.px, q.x, a), y = lerp(q.py, q.y, a), r = 0.47 + 0.2 * (1 - i / n);
    const s = fleshSeg(R, Math.round(r * 20) / 20), pu = 1 + 0.06 * Math.sin(now * 5 - i * 0.7 + e.id);
    ctx.save(); ctx.translate(x, y); ctx.rotate((q.a ?? 0)); ctx.scale(pu, pu); put(ctx, s); ctx.restore();
  }
  // 先端: 自機を見る目
  const tip = ps[n - 1], x = lerp(tip.px, tip.x, a), y = lerp(tip.py, tip.y, a), p = R.g.player;
  const an = Math.atan2(p.y - y, p.x - x), pop = 1 + f * 0.1;
  ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
  ctx.save(); ctx.rotate(now * 0.6 + e.id); putF(ctx, R.sp, eyeBulb(R, 'tbulb', 0.7, '#ff9a2a'), f); ctx.restore();
  const pr = 0.13 + Math.sin(now * 6 + e.id) * 0.03;
  ctx.fillStyle = '#1a0408'; ctx.beginPath(); ctx.ellipse(Math.cos(an) * 0.14, Math.sin(an) * 0.14, pr, pr * 1.25, an, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(Math.cos(an) * 0.14 - 0.07, Math.sin(an) * 0.14 + 0.08, 0.05, 0, TAU); ctx.fill();
  glow(ctx, 0, 0, 0.6, '#ff9a2a', 0.3 + 0.15 * Math.sin(now * 6 + e.id));
  ctx.restore();
  if (R.chance(2)) R.fx.debris(x, y - 0.4, 0, -0.5, 0.06, 0.6, 'flesh');      // 粘液のしずく
}
drawTentacle.world = true;
function drawSpore(R, e, f, v) {
  const ctx = R.ctx, now = R.now, red = e.carrier, t = now * 5 + e.id;
  const s = R.sp.get('spore' + (red ? 'R' : ''), 1.3, 1.3, (c) => {
    const col = red ? '#ff5a2a' : '#ff9ac8';
    const g = c.createRadialGradient(-0.12, 0.14, 0.05, 0, 0, 0.5); g.addColorStop(0, rgba(lite(col, 0.6), 0.5)); g.addColorStop(0.7, rgba(col, 0.32)); g.addColorStop(0.93, rgba(lite(col, 0.4), 0.85)); g.addColorStop(1, rgba(col, 0.9));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill(); c.strokeStyle = rgba(dark(col, 0.5), 0.8); c.lineWidth = 0.025; c.stroke();
    for (const [x, y, r] of [[-0.2, -0.16, 0.07], [0.22, 0.2, 0.05], [-0.1, 0.28, 0.04], [0.26, -0.2, 0.06]]) { c.fillStyle = rgba(dark(col, 0.3), 0.6); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }     // 小器官
    ball(c, 0.06, 0.02, 0.19, red ? '#ffd24a' : '#e02a7a', { lw: 0.02, line: rgba('#3a0420', 0.8) });
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(-0.2, 0.3, 0.14, 0.05, -0.6, 0, TAU); c.fill();
  });
  // 繊毛（波打つ毛）
  ctx.strokeStyle = red ? 'rgba(255,150,100,0.8)' : 'rgba(255,180,215,0.8)'; ctx.lineWidth = 0.03; ctx.lineCap = 'round'; ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, w = Math.sin(t * 1.6 + k * 1.3) * 0.3; ctx.moveTo(Math.cos(a) * 0.47, Math.sin(a) * 0.47); ctx.quadraticCurveTo(Math.cos(a + w * 0.5) * 0.6, Math.sin(a + w * 0.5) * 0.6, Math.cos(a + w) * 0.7, Math.sin(a + w) * 0.7); }
  ctx.stroke();
  const pu = 1 + Math.sin(t) * 0.07;
  ctx.scale(pu, 2 - pu - (1 - pu) * 0.0); putF(ctx, R.sp, s, f);
  glow(ctx, 0.06, 0.02, 0.3, red ? '#ffd24a' : '#ff4a9a', 0.5 + 0.2 * Math.sin(t * 2));
}
function drawMembrane(R, e, f, v) {          // ワールド座標で描く
  const ctx = R.ctx, now = R.now, x0 = R.ex;
  const cell = (hurt) => R.sp.get('mcell' + (hurt ? 'h' : ''), 1.6, 1.6, (c) => {
    const col = hurt ? '#b8f0a0' : '#4ad8a0';
    const g = c.createRadialGradient(-0.15, 0.2, 0.05, 0, 0, 0.7); g.addColorStop(0, rgba(lite(col, 0.55), 0.55)); g.addColorStop(0.72, rgba(col, 0.42)); g.addColorStop(0.9, rgba(lite(col, 0.5), 0.9)); g.addColorStop(1, rgba(dark(col, 0.3), 0.95));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.7, 0, TAU); c.fill(); c.strokeStyle = rgba(dark(col, 0.6), 0.85); c.lineWidth = 0.03; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.025; c.beginPath(); c.arc(0, 0, 0.6, 0.4, 2.2); c.stroke();
    for (const [x, y, r] of [[-0.34, -0.2, 0.08], [0.3, 0.3, 0.06], [-0.2, 0.36, 0.05], [0.36, -0.26, 0.09], [0.0, -0.44, 0.05]]) { c.fillStyle = rgba(dark(col, 0.45), 0.55); c.beginPath(); c.ellipse(x, y, r, r * 0.7, x * 3, 0, TAU); c.fill(); }
    ball(c, 0.1, 0.04, 0.24, '#157a58', { hi: '#7af0c0', lo: '#06281e', lw: 0.02 }); fillP(c, ci(0.14, 0.02, 0.08), '#04140e');
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-0.3, 0.42, 0.2, 0.07, -0.6, 0, TAU); c.fill();
    if (hurt) { crack(c, -0.4, 0.3, -0.5, 0.7, 61, 0.025); crack(c, 0.3, -0.4, 2.2, 0.5, 62, 0.02); }
  });
  // 細胞どうしをつなぐ膜
  const cs = e.cells;
  ctx.strokeStyle = 'rgba(90,220,170,0.3)'; ctx.lineWidth = 0.5; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i + 1 < cs.length; i++) { const a = cs[i], b = cs[i + 1]; if (a.hp > 0 && b.hp > 0 && Math.abs(b.y - a.y) < 1.5 && a.z === b.z) { ctx.moveTo(x0 + Math.sin(a.y * 1.7 + e.t * 0.05) * 0.12, a.y); ctx.lineTo(x0 + Math.sin(b.y * 1.7 + e.t * 0.05) * 0.12, b.y); } }
  ctx.stroke();
  for (const c of cs) {
    if (c.z) continue;
    if (c.hp <= 0) {       // 再生中: 輪が育つ
      const k = c.regen / (e.regenT ?? 300);
      ctx.strokeStyle = `rgba(160,255,220,${0.12 + k * 0.4})`; ctx.lineWidth = 0.04; ctx.setLineDash([0.16, 0.12]); ctx.lineDashOffset = now; ctx.beginPath(); ctx.arc(x0, c.y, 0.7 * (0.2 + 0.8 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (k > 0.7) glow(ctx, x0, c.y, 0.5 * k, '#7af0c8', (k - 0.7) * 1.5);
      c._h = 0; continue;
    }
    const x = x0 + Math.sin(c.y * 1.7 + e.t * 0.05) * 0.12, gr = c.grow ?? 1;
    const hitNow = c._h !== undefined && c.hp < c._h; if (hitNow) { c._f = 1; R.fx.spark(x - 0.5, c.y, false, false, 3); }
    c._h = c.hp; c._f = Math.max(0, (c._f || 0) - R.dt * 6);
    const w = Math.sin(now * 3 + c.y * 2) * 0.05, s = gr * (1 + (c._f || 0) * 0.08);
    ctx.save(); ctx.translate(x, c.y); ctx.scale(s * (1 + w), s * (1 - w)); putF(ctx, R.sp, cell(c.hp < 2), c._f || 0); ctx.restore();
    if (gr < 1 && R.chance(10)) R.fx.bubbleP(x + (R01() - 0.5), c.y + (R01() - 0.5), 0, 0.3, 0.1, 0.5);
  }
}
drawMembrane.world = true;
function drawBlob(R, e, f, v) {
  const ctx = R.ctx, now = R.now, r = e.r, t = now * 4 + e.id;
  const s = R.sp.get('blob' + (e.small ? 's' : 'b'), r * 2.5, r * 2.5, (c) => {
    const col = '#5ae8b0', pts = []; for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr2 = r * (0.9 + (k % 3 === 0 ? 0.1 : k % 3 === 1 ? -0.04 : 0.03)); pts.push([Math.cos(a) * rr2, Math.sin(a) * rr2]); }
    const sh = blobPath(pts);
    const g = c.createRadialGradient(-r * 0.25, r * 0.3, r * 0.05, 0, 0, r * 1.05); g.addColorStop(0, rgba(lite(col, 0.6), 0.6)); g.addColorStop(0.7, rgba(col, 0.4)); g.addColorStop(0.92, rgba(lite(col, 0.45), 0.9)); g.addColorStop(1, rgba(dark(col, 0.3), 0.95));
    sh(c); c.fillStyle = g; c.fill(); c.strokeStyle = rgba(dark(col, 0.6), 0.9); c.lineWidth = 0.03; c.stroke();
    c.save(); sh(c); c.clip();
    for (const [x, y, q] of [[-0.4, -0.3, 0.1], [0.42, 0.34, 0.08], [-0.3, 0.44, 0.06], [0.5, -0.3, 0.1], [0.0, -0.56, 0.07]]) { c.fillStyle = rgba(dark(col, 0.5), 0.5); c.beginPath(); c.ellipse(x * r, y * r, q * r * 1.2, q * r, x * 3, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.03; c.beginPath(); c.arc(0, 0, r * 0.78, 0.5, 2.1); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-r * 0.4, r * 0.52, r * 0.24, r * 0.08, -0.6, 0, TAU); c.fill();
    c.restore();
  });
  const nuc = R.sp.get('blobn' + (e.small ? 's' : 'b'), r, r, (c) => { ball(c, 0, 0, r * 0.34, '#ff9a3a', { hi: '#fff0b0', lo: '#a03a08', line: 'rgba(80,20,0,0.7)', lw: 0.025 }); fillP(c, ci(r * 0.05, -r * 0.03, r * 0.12), '#7a2a04'); });
  // 分裂の演出: 生まれた直後は親の位置から糸を引いて伸びる
  if (e.small && v.born === undefined) { v.born = 0; v.ox = R.ex; v.oy = R.ey - Math.sign(e.vy || 1) * 0.6; }
  let st = 0; if (e.small && v.born < 0.3) { v.born += R.dt; st = 1 - v.born / 0.3; ctx.strokeStyle = `rgba(150,255,210,${st * 0.7})`; ctx.lineWidth = 0.3 * st; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(v.ox - R.ex, v.oy - R.ey); ctx.stroke(); }
  const w = Math.sin(t) * 0.09 + st * 0.3, ax = now * 0.7 + e.id;
  ctx.save(); ctx.rotate(ax); ctx.scale(1 + w, 1 - w); ctx.rotate(-ax + Math.sin(t * 0.3) * 0.3); putF(ctx, R.sp, s, f); ctx.restore();
  ctx.save(); ctx.translate(Math.cos(t * 0.6) * r * 0.18, Math.sin(t * 0.8) * r * 0.14); put(ctx, nuc); ctx.restore();
  glow(ctx, Math.cos(t * 0.6) * r * 0.18, Math.sin(t * 0.8) * r * 0.14, r * 0.6, '#ff9a3a', 0.35 + 0.15 * Math.sin(t * 2));
}

// ---- 振り分け -------------------------------------------------------------------------------
const DRAW = {
  dart: drawDart, wheel: drawWheel, turret: drawTurret, walker: drawWalker, hatch: drawHatch, drone: drawDrone, rock: drawRock, heavy: drawHeavy,
  brick: drawBrick, popper: drawPopper, stonehead: drawStoneHead, pebble: drawPebble, piston: drawPiston, tentacle: drawTentacle, spore: drawSpore,
  membrane: drawMembrane, blob: drawBlob, shutter: drawShutter, cannon: drawCannon, zapper: drawZapper, slider: drawSlider,
};
const SMOKY = { hatch: 1, cannon: 1, zapper: 1, turret: 1, walker: 1 };
const HITMAT = { tentacle: 2, spore: 2, blob: 3, membrane: 3, rock: 0, brick: 0, stonehead: 2, popper: 0, pebble: 0 };
// x, y: 補間済みの位置。戻り値 false = この型は知らない（ボス）
export function drawEnemy(R, e, x, y) {
  const d = DRAW[e.type];
  if (!d) return false;
  const ctx = R.ctx, v = V(e), f = e.flash || 0;
  R.ex = x; R.ey = y;
  // 被弾反応（C28）: 体力が減った瞬間に火花。白フラッシュと一瞬の拡大は各描画で f を使う
  if (v.hp !== undefined && e.hp < v.hp && !d.world) {
    const flesh = e.color === 'flesh' ? 2 : e.color === 'cell' ? 3 : HITMAT[e.type];
    if (e.type === 'stonehead') R.fx.spark(x - 1.3, y - (isC(e) ? -0.35 : 0.35), false, false, 2);
    else R.fx.spark(x - e.r * 0.75, y + (R01() - 0.5) * e.r, false, e.r > 1, flesh);
  }
  v.hp = e.hp;
  if (d.world) { d(R, e, f, v); return true; }
  ctx.save(); ctx.translate(x, y);
  if (f > 0.05) { const s = 1 + f * 0.07; ctx.scale(s, s); }
  d(R, e, f, v);
  ctx.restore();
  // 損傷に応じた煙（耐久のある機械）
  if (SMOKY[e.type] && e.maxHp > 1 && e.color !== 'flesh') { const dm = 1 - e.hp / e.maxHp; if (dm > 0.45 && R.chance(dm * 9)) R.fx.smoke(x + (R01() - 0.5) * e.r, y + (R01() - 0.5) * e.r * 0.6, (R01() - 0.5), isC(e) ? -0.8 : 0.9, 0.26, 0.8, 0.5); if (dm > 0.7 && R.chance(6)) R.fx.spk(x + (R01() - 0.5) * e.r, y, (R01() - 0.5) * 7, (R01() - 0.3) * 7, 0.2, 0); }
  return true;
}
