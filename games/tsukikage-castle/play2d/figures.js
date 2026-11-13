// 月影の魔城 — 2D の人物と魔物（作り直し版）
// 方針: 線の棒ではなく「先細りの丸い手足」と「曲面の鎧板」で形を作り、3 段の陰影＋月光の縁取り（リムライト）＋鏡面の光で立体感を出す。
// 座標: 1u = 1 タイル、原点は足元中央、y 上、x は向いている方向が +（呼ぶ側で変換済み）。
import { knightPose, knightJoints, BONES, enemyAnim } from '../shared/anim.js';

const TAU = Math.PI * 2;
// ---------------------------------------------------------------- 色の道具
const cache = new Map();
function rgb(hex) { let v = cache.get(hex); if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; cache.set(hex, v); } return v; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }
const lite = (c, t) => mix(c, '#ffffff', t), dark = (c, t) => mix(c, '#05060c', t);
export const OUT = '#0a0d18';                 // 輪郭
const RIM = 'rgba(170,205,255,0.85)';          // 月光の縁
let LW = 0.032;                                // 輪郭の太さ（u）。ドット表示では最低 1 ドット
export function setOutlinePx(u) { LW = Math.max(0.032, u || 0); }
// 明るい側（上・前）から暗い側への 3 段の塗り
function lit(ctx, x0, y0, x1, y1, base, hi = 0.5, lo = 0.55) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, lite(base, hi)); g.addColorStop(0.35, base); g.addColorStop(1, dark(base, lo));
  return g;
}
function finish(ctx, fill, lw = LW) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke(); }
function ell(ctx, x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
function glowDot(ctx, x, y, r, col) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3); g.addColorStop(0, col); g.addColorStop(0.3, col.replace(/[\d.]+\)$/, '0.5)')); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill(); ctx.restore();
  ell(ctx, x, y, r, r, '#fffbe6');
}
// 先細りの丸い手足（a から b へ、太さ ra → rb）。光は上前方から
function taper(ctx, a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.arc(a[0], a[1], ra, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b[0], b[1], rb, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
  return { nx: -dy / L, ny: dx / L, L };
}
function limb(ctx, a, b, ra, rb, base, opt = {}) {
  const t = taper(ctx, a, b, ra, rb);
  // 法線の向きで、上（+y）か前（+x）を向いた側を明るく
  const s = t.ny + t.nx * 0.4 >= 0 ? 1 : -1;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, r = Math.max(ra, rb);
  finish(ctx, lit(ctx, mx + t.nx * r * s, my + t.ny * r * s, mx - t.nx * r * s, my - t.ny * r * s, base, opt.hi ?? 0.55, opt.lo ?? 0.55), opt.lw ?? LW);
  if (opt.rim !== false) { // 縁取り（暗い側の端に細い月光）
    ctx.strokeStyle = opt.rimCol || RIM; ctx.lineWidth = r * 0.22; ctx.beginPath();
    ctx.moveTo(a[0] - t.nx * ra * 0.78 * s, a[1] - t.ny * ra * 0.78 * s); ctx.lineTo(b[0] - t.nx * rb * 0.78 * s, b[1] - t.ny * rb * 0.78 * s); ctx.stroke();
  }
  if (opt.spec) { // 鏡面の光（明るい側に短い白線）
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = r * 0.18; ctx.beginPath();
    const k0 = 0.25, k1 = 0.6; ctx.moveTo(a[0] + (b[0] - a[0]) * k0 + t.nx * ra * 0.45 * s, a[1] + (b[1] - a[1]) * k0 + t.ny * ra * 0.45 * s);
    ctx.lineTo(a[0] + (b[0] - a[0]) * k1 + t.nx * rb * 0.45 * s, a[1] + (b[1] - a[1]) * k1 + t.ny * rb * 0.45 * s); ctx.stroke();
  }
  return t;
}
// 鎧の丸い当て（膝・肘）
function cop(ctx, x, y, r, base) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); finish(ctx, lit(ctx, x - r * 0.5, y + r, x + r * 0.5, y - r, base, 0.7, 0.6));
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, Math.PI * 0.1, Math.PI * 0.9); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = r * 0.18; ctx.stroke();
  ell(ctx, x + r * 0.15, y + r * 0.3, r * 0.18, r * 0.12, 'rgba(255,255,255,0.9)');
}
// 胴の座標系（腰 H → 首 N）。P(a, b): a は胴に沿った割合、b は前方向の距離
function frame(H, N) {
  const ux = N[0] - H[0], uy = N[1] - H[1], L = Math.hypot(ux, uy) || 1; const fx = uy / L, fy = -ux / L;
  return (a, b) => [H[0] + ux * a + fx * b, H[1] + uy * a + fy * b];
}

// ================================================================ 騎士
const STEEL = '#aebdd2', STEEL_D = '#6c7d96', GOLD = '#d9b35c', CAPE = '#2f52c4', CAPE_IN = '#1a2a6a', PLUME = '#e8432c';
// opt: { weapon, pose（補間済みのポーズ）, cape: [[x,y]…]（足元基準の局所座標・向き補正済み）, plume: 角度, time }
export function drawKnight(ctx, p, time, opt) {
  const P = (opt && opt.pose) || knightPose(p, time), J = knightJoints(P, 1), armor = p.armor; opt = opt || {};
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (P.back) return knightBack(ctx, P, J, armor, opt);
  // マント（体の後ろ）
  if (armor && opt.cape) drawCape(ctx, opt.cape, J);
  // 後ろの脚・腕（少し暗く）
  leg(ctx, J.hip, J.legB, armor, true, P);
  arm(ctx, J.sh, J.armB, armor, true);
  // 胴
  const F = frame(J.hip, J.neck);
  if (armor) {
    // 草摺（腰の板 3 枚）
    for (let i = 2; i >= 0; i--) {
      const y0 = -0.02 - i * 0.075;
      ctx.beginPath(); const a = F(y0 * 2 + 0.05, -0.22), b = F(y0 * 2 + 0.05, 0.25), c = F(y0 * 2 - 0.17, 0.27), d = F(y0 * 2 - 0.15, -0.23);
      ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(...F(y0 * 2 + 0.1, 0.02), b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.quadraticCurveTo(...F(y0 * 2 - 0.12, 0.02), d[0], d[1]); ctx.closePath();
      finish(ctx, lit(ctx, b[0], b[1] + 0.1, d[0], d[1] - 0.1, i ? STEEL_D : STEEL, 0.5, 0.6));
    }
    // 胸当て（前へふくらむ曲面）
    ctx.beginPath();
    const q = [F(0.08, -0.21), F(0.5, -0.25), F(1.0, -0.2), F(1.02, 0.12), F(0.62, 0.3), F(0.25, 0.24), F(0.06, 0.2)];
    ctx.moveTo(...q[0]); ctx.quadraticCurveTo(...q[1], ...q[2]); ctx.quadraticCurveTo(...F(1.08, -0.02), ...q[3]); ctx.quadraticCurveTo(...F(0.85, 0.34), ...q[4]); ctx.quadraticCurveTo(...F(0.4, 0.27), ...q[5]); ctx.lineTo(...q[6]); ctx.closePath();
    const hi = F(0.8, 0.3), lo = F(0.2, -0.3);
    finish(ctx, lit(ctx, hi[0], hi[1], lo[0], lo[1], STEEL, 0.75, 0.6));
    // 稜線・腹当ての境目・鏡面の光・鋲
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.028; ctx.beginPath(); ctx.moveTo(...F(0.42, 0.25)); ctx.quadraticCurveTo(...F(0.7, 0.31), ...F(0.95, 0.15)); ctx.stroke();
    ctx.strokeStyle = 'rgba(10,13,24,0.55)'; ctx.lineWidth = 0.022; ctx.beginPath(); ctx.moveTo(...F(0.36, -0.22)); ctx.quadraticCurveTo(...F(0.42, 0.05), ...F(0.36, 0.26)); ctx.stroke();
    ctx.strokeStyle = RIM; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(...F(0.12, -0.2)); ctx.quadraticCurveTo(...F(0.5, -0.245), ...F(0.95, -0.19)); ctx.stroke();
    for (const [a, b] of [[0.86, -0.12], [0.86, 0.08], [0.3, -0.15]]) ell(ctx, ...F(a, b), 0.022, 0.022, '#e9eef6');
    // ベルトと金の留め金
    ctx.beginPath(); ctx.moveTo(...F(0.1, -0.22)); ctx.lineTo(...F(0.1, 0.22)); ctx.lineTo(...F(0.02, 0.22)); ctx.lineTo(...F(0.02, -0.22)); ctx.closePath(); finish(ctx, '#4a3322', 0.02);
    const bk = F(0.06, 0.2); ctx.beginPath(); ctx.rect(bk[0] - 0.04, bk[1] - 0.035, 0.08, 0.07); finish(ctx, lit(ctx, bk[0], bk[1] + 0.05, bk[0], bk[1] - 0.05, GOLD, 0.6, 0.4), 0.015);
    // 喉当て
    ctx.beginPath(); ctx.ellipse(...F(1.0, 0.02), 0.15, 0.07, Math.atan2(J.neck[1] - J.hip[1], J.neck[0] - J.hip[0]) - Math.PI / 2, 0, TAU); finish(ctx, lit(ctx, J.neck[0], J.neck[1] + 0.1, J.neck[0], J.neck[1] - 0.1, STEEL_D, 0.6, 0.5));
  } else {
    // 上着（鎧なし）: 赤い胴着としわ、革のベルト
    ctx.beginPath(); ctx.moveTo(...F(-0.05, -0.21)); ctx.quadraticCurveTo(...F(0.5, -0.25), ...F(0.98, -0.18)); ctx.quadraticCurveTo(...F(1.05, 0.05), ...F(0.95, 0.2)); ctx.quadraticCurveTo(...F(0.5, 0.27), ...F(-0.05, 0.22)); ctx.closePath();
    const hi = F(0.8, 0.25), lo = F(0.1, -0.25); finish(ctx, lit(ctx, hi[0], hi[1], lo[0], lo[1], '#c63b3b', 0.35, 0.55));
    ctx.strokeStyle = 'rgba(60,10,14,0.55)'; ctx.lineWidth = 0.02;
    for (const k of [0.3, 0.55]) { ctx.beginPath(); ctx.moveTo(...F(k, -0.1)); ctx.quadraticCurveTo(...F(k + 0.08, 0.02), ...F(k - 0.02, 0.15)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(...F(0.12, -0.22)); ctx.lineTo(...F(0.12, 0.23)); ctx.lineTo(...F(0.03, 0.23)); ctx.lineTo(...F(0.03, -0.22)); ctx.closePath(); finish(ctx, '#5a3a22', 0.02);
  }
  // 前の脚
  leg(ctx, J.hip, J.legF, armor, false, P);
  // 肩当て（前）
  if (armor) pauldron(ctx, J.sh, P);
  // 頭
  head(ctx, J, P, armor, opt);
  // 前の腕と持っている武器
  arm(ctx, J.sh, J.armF, armor, false);
  if (P.throwK > 0.2 && opt.weapon) {
    const [el, hand] = J.armF;
    ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(Math.atan2(hand[1] - el[1], hand[0] - el[0]) - Math.PI / 2 + 0.6); heldWeapon(ctx, opt.weapon); ctx.restore();
  }
  if (P.dead > 0.3) { ctx.globalAlpha = (P.dead - 0.3) * 0.7; ell(ctx, J.neck[0], J.neck[1] + P.dead * 0.7, 0.2, 0.3, 'rgba(190,220,255,0.55)'); ctx.globalAlpha = 1; }
}
function leg(ctx, hip, L, armor, back, P) {
  const [knee, foot] = L;
  const base = armor ? (back ? STEEL_D : STEEL) : (back ? '#2a2432' : '#3e3448');
  limb(ctx, hip, knee, armor ? 0.125 : 0.105, armor ? 0.095 : 0.085, base, { spec: armor && !back });
  limb(ctx, knee, foot, armor ? 0.1 : 0.085, armor ? 0.075 : 0.07, base, { spec: armor && !back });
  if (armor) cop(ctx, knee[0] + 0.035, knee[1] + 0.01, back ? 0.07 : 0.085, back ? STEEL_D : STEEL);
  // 足（鎧は 3 枚の板の靴、鎧なしは革の長靴）
  const fx = foot[0], fy = foot[1];
  ctx.beginPath(); ctx.moveTo(fx - 0.1, fy + 0.07); ctx.quadraticCurveTo(fx + 0.05, fy + 0.1, fx + 0.14, fy + 0.04); ctx.quadraticCurveTo(fx + 0.23, fy + 0.0, fx + 0.22, fy - 0.045); ctx.lineTo(fx - 0.11, fy - 0.05); ctx.closePath();
  finish(ctx, lit(ctx, fx, fy + 0.1, fx, fy - 0.05, armor ? (back ? STEEL_D : STEEL) : '#4a2e1a', 0.5, 0.6));
  if (armor) { ctx.strokeStyle = 'rgba(10,13,24,0.5)'; ctx.lineWidth = 0.015; for (const d of [0.03, 0.1]) { ctx.beginPath(); ctx.moveTo(fx + d, fy + 0.07); ctx.lineTo(fx + d + 0.03, fy - 0.04); ctx.stroke(); } }
}
function arm(ctx, sh, A, armor, back) {
  const [el, hand] = A;
  const base = armor ? (back ? STEEL_D : STEEL) : (back ? '#c08a64' : '#f0c8a0');
  limb(ctx, sh, el, armor ? 0.085 : 0.07, armor ? 0.072 : 0.062, armor ? base : (back ? '#8a2a2a' : '#c63b3b'), { spec: armor && !back });
  limb(ctx, el, hand, armor ? 0.075 : 0.06, armor ? 0.062 : 0.05, base, { spec: armor && !back });
  if (armor) cop(ctx, el[0], el[1], back ? 0.055 : 0.065, back ? STEEL_D : STEEL);
  // 籠手・手
  const ang = Math.atan2(hand[1] - el[1], hand[0] - el[0]);
  ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(-0.04, -0.07); ctx.quadraticCurveTo(0.1, -0.08, 0.11, 0); ctx.quadraticCurveTo(0.1, 0.08, -0.04, 0.07); ctx.closePath();
  finish(ctx, lit(ctx, 0, 0.08, 0, -0.08, armor ? (back ? '#4f5d74' : '#7f90aa') : (back ? '#c08a64' : '#f0c8a0'), 0.5, 0.5), 0.022);
  if (armor) { ctx.strokeStyle = 'rgba(10,13,24,0.45)'; ctx.lineWidth = 0.012; for (const x of [0.03, 0.065]) { ctx.beginPath(); ctx.moveTo(x, -0.06); ctx.lineTo(x, 0.06); ctx.stroke(); } }
  ctx.restore();
}
function pauldron(ctx, sh, P) {
  // 3 枚重ねの肩当て（上の板ほど大きい）
  for (let i = 2; i >= 0; i--) {
    const r = 0.195 - i * 0.028, y = sh[1] - 0.02 - i * 0.06;
    ctx.beginPath(); ctx.ellipse(sh[0] + 0.02, y, r, r * 0.62, -0.25 - P.lean * 0.5, Math.PI * 1.02, Math.PI * 2.05, true); ctx.closePath();
    finish(ctx, lit(ctx, sh[0], y + r, sh[0], y - r * 0.6, i ? STEEL_D : STEEL, 0.7, 0.5), 0.025);
  }
  ell(ctx, sh[0] + 0.07, sh[1] + 0.06, 0.03, 0.015, 'rgba(255,255,255,0.9)', -0.3);
}
function head(ctx, J, P, armor, opt) {
  const [hx, hy] = J.head;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-(P.lean + P.head) * 0.6); ctx.scale(1.27, 1.27); // アーケードらしく頭を大きめに（小さな表示でも兜と向きが読める）
  if (armor) {
    // 羽根（3 本、ばねで揺れる）
    const pl = opt.plume ?? 0;
    for (let i = 2; i >= 0; i--) {
      const sw = pl * (1 + i * 0.35), len = 0.44 - i * 0.06, base = -0.04 - i * 0.05;
      ctx.beginPath(); ctx.moveTo(base, 0.2);
      ctx.bezierCurveTo(base - 0.12, 0.38 + i * 0.03, base - len * 0.7 + sw * 0.1, 0.42 - sw * 0.2, base - len + sw * 0.05, 0.26 - sw * 0.35);
      ctx.bezierCurveTo(base - len * 0.55, 0.3, base - 0.12, 0.24, base + 0.05, 0.16); ctx.closePath();
      finish(ctx, lit(ctx, base, 0.45, base - len, 0.15, i ? '#b12a1c' : PLUME, 0.4, 0.5), 0.02);
    }
    // 兜の鉢
    ctx.beginPath(); ctx.moveTo(-0.2, -0.1); ctx.bezierCurveTo(-0.25, 0.14, -0.1, 0.27, 0.04, 0.26); ctx.bezierCurveTo(0.18, 0.25, 0.25, 0.14, 0.255, 0.02); ctx.lineTo(0.2, -0.04); ctx.quadraticCurveTo(0.0, -0.08, -0.2, -0.1); ctx.closePath();
    finish(ctx, lit(ctx, 0.05, 0.28, -0.1, -0.1, STEEL, 0.8, 0.6));
    // 鶏冠（頭頂の稜）
    ctx.beginPath(); ctx.moveTo(-0.16, 0.16); ctx.quadraticCurveTo(0.0, 0.33, 0.15, 0.2); ctx.lineTo(0.13, 0.17); ctx.quadraticCurveTo(0.0, 0.28, -0.14, 0.13); ctx.closePath(); finish(ctx, lit(ctx, 0, 0.3, 0, 0.15, STEEL, 0.8, 0.3), 0.018);
    // 面頬（前へ突き出たくちばし形）
    ctx.beginPath(); ctx.moveTo(0.06, 0.06); ctx.quadraticCurveTo(0.3, 0.07, 0.33, -0.03); ctx.quadraticCurveTo(0.28, -0.15, 0.08, -0.17); ctx.quadraticCurveTo(0.0, -0.05, 0.06, 0.06); ctx.closePath();
    finish(ctx, lit(ctx, 0.25, 0.07, 0.1, -0.17, STEEL, 0.65, 0.65));
    // のぞき穴（2 本）と中の青い光
    ctx.fillStyle = '#05070d';
    for (const y of [0.02, -0.035]) { ctx.beginPath(); ctx.moveTo(0.1, y + 0.012); ctx.lineTo(0.31, y + 0.004); ctx.lineTo(0.3, y - 0.012); ctx.lineTo(0.1, y - 0.008); ctx.closePath(); ctx.fill(); }
    const eg = 0.6 + 0.4 * Math.sin((opt.time ?? performance.now() / 1000) * 3); // のぞき穴の奥の光がゆっくり脈打つ
    glowDot(ctx, 0.235, 0.018, 0.012 + eg * 0.008, `rgba(140,210,255,${0.6 + eg * 0.4})`);
    // 鋲・縁取り・鏡面
    for (const [x, y] of [[-0.12, -0.02], [-0.03, -0.05], [0.07, -0.11]]) ell(ctx, x, y, 0.018, 0.018, '#e8eef8');
    ctx.strokeStyle = RIM; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-0.2, -0.08); ctx.bezierCurveTo(-0.24, 0.12, -0.12, 0.25, 0.0, 0.26); ctx.stroke();
    ell(ctx, 0.08, 0.2, 0.06, 0.025, 'rgba(255,255,255,0.95)', -0.4);
  } else {
    // 素顔: 驚いて目を見開き、髪が揺れる
    ctx.beginPath(); ctx.ellipse(0.04, 0.0, 0.18, 0.2, 0, 0, TAU); finish(ctx, lit(ctx, 0.15, 0.15, -0.1, -0.15, '#f0c8a0', 0.35, 0.4));
    ell(ctx, 0.21, -0.02, 0.05, 0.045, '#e0aa80');
    const sway = (opt.plume ?? 0) * 0.5;
    ctx.beginPath(); ctx.moveTo(-0.2, 0.0); ctx.quadraticCurveTo(-0.22, 0.22, 0.0, 0.25);
    for (let i = 0; i < 4; i++) ctx.lineTo(0.02 + i * 0.05, 0.3 + (i % 2) * 0.05 + sway * 0.1); ctx.lineTo(0.17, 0.12);
    ctx.quadraticCurveTo(0.0, 0.17, -0.12, 0.06); ctx.closePath(); finish(ctx, lit(ctx, 0, 0.3, 0, 0.0, '#6a4426', 0.35, 0.5), 0.02);
    ell(ctx, 0.13, 0.04, 0.045, 0.055, '#fff'); ell(ctx, 0.145, 0.035, 0.022, 0.03, '#141018');
    ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(0.09, 0.11); ctx.lineTo(0.18, 0.13); ctx.stroke();
    ell(ctx, 0.16, -0.11, 0.035, 0.03, '#6a1e1e');
  }
  ctx.restore();
}
function drawCape(ctx, pts, J) {
  // 肩から下がる布（物理で揺れる点列 pts）。左右の幅を持たせた帯にして、裏地を暗く
  if (pts.length < 3) return;
  const w0 = 0.2, w1 = 0.3, n = pts.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const w = w0 + (w1 - w0) * (i / (n - 1)), nx = -dy / d * w * 0.5, ny = dx / d * w * 0.5;
    L.push([pts[i][0] + nx, pts[i][1] + ny]); R.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  ctx.beginPath(); ctx.moveTo(...L[0]); for (let i = 1; i < n; i++) ctx.lineTo(...L[i]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0] + (i === n - 1 ? 0 : 0), R[i][1]); ctx.closePath();
  const top = pts[0], bot = pts[n - 1];
  finish(ctx, lit(ctx, top[0], top[1], bot[0], bot[1], CAPE, 0.25, 0.65), 0.025);
  // 裾の切れ込みと折り目
  ctx.strokeStyle = 'rgba(8,12,40,0.55)'; ctx.lineWidth = 0.02;
  for (let k = 1; k < 3; k++) { ctx.beginPath(); const i0 = 1, i1 = n - 1; const t = k / 3; ctx.moveTo(L[i0][0] + (R[i0][0] - L[i0][0]) * t, L[i0][1] + (R[i0][1] - L[i0][1]) * t); ctx.lineTo(L[i1][0] + (R[i1][0] - L[i1][0]) * t, L[i1][1] + (R[i1][1] - L[i1][1]) * t); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(216,178,90,0.9)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(...L[n - 1]); ctx.lineTo(...R[n - 1]); ctx.stroke();
  void CAPE_IN; void J;
}
function knightBack(ctx, P, J, armor, opt) {
  // はしごを登る後ろ姿（背中の板・マント・兜の後ろ）
  for (const L of [J.legB, J.legF]) leg(ctx, J.hip, L, armor, true, P);
  const F = frame(J.hip, J.neck);
  ctx.beginPath(); ctx.moveTo(...F(0.0, -0.24)); ctx.lineTo(...F(0.0, 0.24)); ctx.quadraticCurveTo(...F(0.6, 0.3), ...F(1.0, 0.26)); ctx.lineTo(...F(1.0, -0.26)); ctx.quadraticCurveTo(...F(0.6, -0.3), ...F(0.0, -0.24)); ctx.closePath();
  finish(ctx, armor ? lit(ctx, J.neck[0] - 0.25, J.neck[1], J.neck[0] + 0.25, J.hip[1], STEEL, 0.6, 0.6) : '#c63b3b');
  if (armor) { ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.moveTo(...F(1.0, -0.24)); ctx.lineTo(...F(1.0, 0.24)); ctx.lineTo(...F(-0.15, 0.3)); ctx.lineTo(...F(-0.12, -0.3)); ctx.closePath(); finish(ctx, lit(ctx, ...F(1, 0), ...F(-0.1, 0), CAPE, 0.25, 0.6)); ctx.globalAlpha = 1; }
  for (const side of [1, -1]) {
    const A = side > 0 ? J.armF : J.armB, sh = [J.sh[0] + side * 0.17, J.sh[1]];
    const el = [sh[0] + side * 0.06, A[0][1]], hand = [sh[0] + side * 0.05, A[1][1]];
    arm(ctx, sh, [el, hand], armor, false);
  }
  ctx.save(); ctx.translate(J.head[0], J.head[1]); ctx.scale(1.18, 1.18);
  ctx.beginPath(); ctx.ellipse(0, 0.02, 0.2, 0.22, 0, 0, TAU); finish(ctx, armor ? lit(ctx, -0.2, 0.2, 0.2, -0.2, STEEL, 0.7, 0.6) : '#6a4426');
  if (armor) { ctx.beginPath(); ctx.ellipse(0, 0.22, 0.05, 0.14, 0, 0, TAU); finish(ctx, PLUME, 0.02); }
  ctx.restore();
  void opt;
}
export function heldWeapon(ctx, w) {
  ctx.save(); ctx.scale(0.85, 0.85);
  if (w === 'lance') { limb(ctx, [0, -0.5], [0, 0.6], 0.035, 0.035, '#8a6a3c', { rim: false }); ctx.beginPath(); ctx.moveTo(0, 0.98); ctx.lineTo(-0.08, 0.6); ctx.lineTo(0.08, 0.6); ctx.closePath(); finish(ctx, lit(ctx, -0.08, 0.8, 0.08, 0.8, '#d8e4f0', 0.8, 0.5), 0.02); }
  else if (w === 'dagger') { ctx.beginPath(); ctx.moveTo(0, 0.48); ctx.lineTo(-0.05, 0.08); ctx.lineTo(0.05, 0.08); ctx.closePath(); finish(ctx, lit(ctx, -0.05, 0.3, 0.05, 0.3, '#e8f0fa', 0.8, 0.5), 0.018); limb(ctx, [-0.1, 0.06], [0.1, 0.06], 0.025, 0.025, GOLD, { rim: false }); }
  else if (w === 'axe') { limb(ctx, [0, -0.2], [0, 0.5], 0.03, 0.03, '#7a4e26', { rim: false }); ctx.beginPath(); ctx.moveTo(0, 0.47); ctx.quadraticCurveTo(0.32, 0.58, 0.32, 0.18); ctx.lineTo(0, 0.28); ctx.closePath(); finish(ctx, lit(ctx, 0.3, 0.5, 0, 0.2, '#cfd8e2', 0.8, 0.5), 0.02); }
  else if (w === 'torch') { limb(ctx, [0, -0.2], [0, 0.3], 0.035, 0.03, '#6b4320', { rim: false }); glowDot(ctx, 0, 0.42, 0.08, 'rgba(255,170,60,0.9)'); }
  ctx.restore();
}

// ================================================================ 魔物（8 種）
const EYE = (ctx, x, y, r, col = 'rgba(255,225,77,1)') => glowDot(ctx, x, y, r, col);
export function drawEnemy(ctx, e, time) {
  const A = enemyAnim(e, time);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (A.dead > 0) { ctx.globalAlpha = 1 - A.dead; ctx.translate(0, A.dead * 0.3); ctx.rotate(A.dead * 0.6 * (e.kick || 1)); ctx.scale(1 + A.dead * 0.3, 1 - A.dead * 0.5); }
  ctx.translate(A.shake, 0);
  if (A.flash > 0 && !e.dead) { const h = Math.min(e.h || 1, 1.5) * 0.5; ctx.translate(0, h); ctx.rotate(-0.22 * A.flash); ctx.translate(-0.08 * A.flash, -h); } // 当たった瞬間にのけぞる
  const fn = ENEMY[e.type];
  fn && fn(ctx, e, A, time);
  if (A.flash > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = A.flash > 0.5 ? `rgba(255,255,255,${A.flash * 0.9})` : `rgba(255,90,70,${A.flash * 1.2})`; ctx.fillRect(-3, -2, 6, 6); ctx.globalCompositeOperation = 'source-over'; } // 白く光ってから赤く引く
  ctx.globalAlpha = 1;
  if (!e.dead) enemyExtras(ctx, e, A, time);
}
// 種類ごとの細かな生気: 牙獣の鼻息・術者の魔法陣・跳ね鬼の喉袋・鉄塊鬼の呼吸の湯気・石像の煙・夜魔のまばたき
function enemyExtras(ctx, e, A, time) {
  if (e.type === 'beast' && (e.st === 'idle' || e.st === 'windup')) { for (let i = 0; i < 2; i++) { const q = ((time * (e.st === 'windup' ? 2.5 : 0.9) + i * 0.5 + e.phase) % 1); ell(ctx, 1.25 + q * 0.5, 0.72 + q * 0.12, 0.05 + q * 0.12, 0.04 + q * 0.08, `rgba(220,225,235,${0.45 * (1 - q)})`); } }
  if (e.type === 'caster' && e.st === 'cast') { const k = Math.min(1, e.t / 0.85); ctx.save(); ctx.translate(0, 0.02); ctx.scale(1, 0.28); ctx.rotate(time * 1.5); ctx.strokeStyle = `rgba(200,140,255,${0.8 * k})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 0.7, 0, TAU); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.7, Math.sin(a) * 0.7); ctx.lineTo(Math.cos(a + 2.09) * 0.7, Math.sin(a + 2.09) * 0.7); ctx.stroke(); } ctx.restore(); }
  if (e.type === 'hopper' && e.st === 'wait') { const k = 0.5 + 0.5 * Math.sin(time * 7 + e.phase); ctx.beginPath(); ctx.ellipse(0.28, 0.22, 0.14 + k * 0.08, 0.1 + k * 0.06, 0, 0, TAU); finish(ctx, lit(ctx, 0.3, 0.35, 0.3, 0.1, '#f0dc90', 0.3, 0.4), 0.02); }
  if (e.type === 'brute' && e.st !== 'smash') { const q = (time * 0.6 + e.phase) % 1; ell(ctx, 0.62 + q * 0.3, 2.0 + q * 0.4, 0.06 + q * 0.12, 0.05 + q * 0.09, `rgba(220,220,230,${0.35 * (1 - q)})`); }
  if (e.type === 'turret' && !e.down) { for (let i = 0; i < 2; i++) { const q = (time * 0.5 + i * 0.5 + e.phase) % 1; ell(ctx, 0.36 + Math.sin(time + i) * 0.05, 1.0 + q * 0.8, 0.05 + q * 0.1, 0.05 + q * 0.1, `rgba(120,110,120,${0.4 * (1 - q)})`); } }
  if (e.type === 'imp' && (time * 0.7 + e.phase) % 3 < 0.1) ell(ctx, 0.11, 0.47, 0.05, 0.012, '#d24458');
  if (e.type === 'ghoul' && e.st === 'walk' && Math.sin(time * 13 + e.phase * 5) > 0.95) ell(ctx, 0.4, 1.55, 0.05, 0.012, '#98b38c');
  // 魔物の呼吸（ゆっくり膨らむ。鎧の騎士と同じ拍子にならないよう個体ごとにずらす）
  void A;
}
const ENEMY = {
  // 亡者: 前かがみ・腐った緑の肌・浮いたあばら・ぼろ布・顎が動く。土の盛り上がりから這い出す
  ghoul(ctx, e, A, time) {
    let rise = 1;
    if (e.st === 'emerge') rise = Math.min(1, e.t / 0.7);
    if (e.st === 'sink') rise = 1 - Math.min(1, e.t / 0.6);
    if (rise < 1) { ctx.save(); ctx.beginPath(); ctx.rect(-2, 0, 4, 4); ctx.clip(); ctx.translate(0, -1.6 * (1 - rise)); }
    const w = A.walk * 1.6, s = Math.sin(w), SK = '#7e9a72';
    const hip = [0, 0.74];
    limb(ctx, hip, [-0.12 + 0.18 * s, 0.38], 0.09, 0.075, dark(SK, 0.3)); limb(ctx, [-0.12 + 0.18 * s, 0.38], [-0.15 + 0.2 * s, 0.03], 0.075, 0.06, dark(SK, 0.3));
    const reach = 0.15 * Math.sin(time * 4 + e.phase);
    limb(ctx, [0.0, 1.22], [0.35, 1.05], 0.07, 0.06, dark(SK, 0.25)); limb(ctx, [0.35, 1.05], [0.62 - reach, 0.98], 0.06, 0.05, dark(SK, 0.25));
    // 胴（前かがみ）
    ctx.beginPath(); ctx.moveTo(-0.24, 0.7); ctx.quadraticCurveTo(-0.34, 1.15, -0.05, 1.42); ctx.quadraticCurveTo(0.28, 1.5, 0.34, 1.2); ctx.quadraticCurveTo(0.3, 0.86, 0.22, 0.72); ctx.closePath();
    finish(ctx, lit(ctx, 0.3, 1.45, -0.25, 0.7, SK, 0.35, 0.6));
    ctx.strokeStyle = 'rgba(30,40,28,0.6)'; ctx.lineWidth = 0.025; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0.08, 1.02 + i * 0.1, 0.17, -0.4, 0.7); ctx.stroke(); }
    // ぼろ布の腰巻き
    ctx.beginPath(); ctx.moveTo(-0.28, 0.82); ctx.lineTo(0.27, 0.86); for (let i = 0; i <= 5; i++) ctx.lineTo(0.27 - i * 0.11, 0.5 + ((i * 3) % 2) * 0.12 + Math.sin(time * 5 + i) * 0.02); ctx.closePath();
    finish(ctx, lit(ctx, 0, 0.86, 0, 0.5, '#4a3848', 0.25, 0.5), 0.022);
    limb(ctx, hip, [0.12 - 0.18 * s, 0.38], 0.095, 0.08, SK); limb(ctx, [0.12 - 0.18 * s, 0.38], [0.14 - 0.2 * s, 0.03], 0.08, 0.065, SK);
    // 頭
    ctx.save(); ctx.translate(0.28, 1.5); ctx.rotate(-0.15 + Math.sin(time * 2 + e.phase) * 0.06);
    ctx.beginPath(); ctx.moveTo(-0.16, -0.05); ctx.quadraticCurveTo(-0.2, 0.2, 0.02, 0.22); ctx.quadraticCurveTo(0.22, 0.2, 0.22, 0.02); ctx.quadraticCurveTo(0.2, -0.12, 0.05, -0.14); ctx.closePath();
    finish(ctx, lit(ctx, 0.1, 0.22, -0.1, -0.12, '#98b38c', 0.3, 0.5));
    ell(ctx, 0.11, 0.05, 0.06, 0.055, '#18140f'); EYE(ctx, 0.12, 0.05, 0.022, 'rgba(216,255,106,1)');
    const jaw = 0.04 + 0.04 * Math.max(0, Math.sin(time * 6 + e.phase));
    ctx.beginPath(); ctx.moveTo(0.02, -0.1); ctx.lineTo(0.2, -0.06); ctx.lineTo(0.18, -0.06 - jaw); ctx.lineTo(0.03, -0.1 - jaw); ctx.closePath(); finish(ctx, '#2a1a1a', 0.015);
    ctx.fillStyle = '#e8e0c0'; for (let i = 0; i < 3; i++) ctx.fillRect(0.06 + i * 0.045, -0.085, 0.022, 0.03);
    ctx.restore();
    if (rise < 1) ctx.restore();
    if (e.st === 'emerge' || e.st === 'sink') {
      const k = e.st === 'emerge' ? Math.min(1, e.t / 0.35) : 1 - Math.min(1, e.t / 0.6);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.62 * k, 0.3 * k, 0, Math.PI, 0, true); finish(ctx, lit(ctx, 0, 0.3, 0, 0, '#5a4430', 0.3, 0.5), 0.02);
      for (let i = 0; i < 5; i++) ell(ctx, (i - 2) * 0.22 * k, 0.12 * k + Math.sin(time * 20 + i) * 0.04, 0.06, 0.05, '#7a5c3c');
    }
  },
  // 骸骨兵: 形を持った骨（骨盤・背骨・あばら・頭蓋）、顎が鳴る。骨を掲げて投げる
  skeleton(ctx, e, A, time) {
    const w = A.walk * 1.4, s = e.st === 'walk' ? Math.sin(w) : 0, B = '#ece4cc', BD = '#b0a68a';
    const bone = (a, b, r, c) => { limb(ctx, a, b, r, r * 0.8, c, { rimCol: 'rgba(255,240,200,0.5)' }); ell(ctx, b[0], b[1], r * 1.15, r * 1.15, c); };
    bone([0.02, 0.8], [-0.1 + 0.2 * s, 0.42], 0.045, BD); bone([-0.1 + 0.2 * s, 0.42], [-0.12 + 0.22 * s, 0.04], 0.04, BD);
    // 骨盤
    ctx.beginPath(); ctx.moveTo(-0.16, 0.86); ctx.quadraticCurveTo(0.0, 0.7, 0.16, 0.86); ctx.quadraticCurveTo(0.0, 0.78, -0.16, 0.86); finish(ctx, B, 0.02);
    // 背骨（椎骨の粒）
    for (let i = 0; i < 6; i++) ell(ctx, 0.0 + i * 0.008, 0.88 + i * 0.085, 0.035, 0.03, i % 2 ? BD : B);
    // あばら
    for (let i = 0; i < 4; i++) { const y = 1.02 + i * 0.09; ctx.beginPath(); ctx.ellipse(0.06, y, 0.17 - i * 0.012, 0.055, 0.1, Math.PI * 1.05, Math.PI * 1.95); ctx.strokeStyle = OUT; ctx.lineWidth = 0.05; ctx.stroke(); ctx.strokeStyle = B; ctx.lineWidth = 0.028; ctx.stroke(); }
    bone([0.02, 0.8], [0.12 - 0.2 * s, 0.42], 0.05, B); bone([0.12 - 0.2 * s, 0.42], [0.13 - 0.22 * s, 0.04], 0.045, B);
    // 腕（後ろ・前）
    bone([-0.04, 1.33], [-0.18, 1.0], 0.035, BD); bone([-0.18, 1.0], [-0.12, 0.72], 0.03, BD);
    const raise = e.st === 'windup' ? Math.min(1, e.t / 0.4) : e.st === 'recover' ? Math.max(0, 1 - e.t * 4) : 0;
    const ha = -0.4 + raise * 2.7, ex = 0.06 + Math.sin(ha) * 0.28, ey = 1.33 - Math.cos(ha) * 0.28, hx = ex + Math.sin(ha + 0.3) * 0.26, hy = ey - Math.cos(ha + 0.3) * 0.26;
    bone([0.06, 1.33], [ex, ey], 0.04, B); bone([ex, ey], [hx, hy], 0.035, B);
    if (raise > 0.2) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(time * 3); boneShape(ctx); ctx.restore(); }
    // 頭蓋と顎
    ctx.save(); ctx.translate(0.07, 1.58); ctx.rotate(Math.sin(time * 3 + e.phase) * 0.06);
    ctx.beginPath(); ctx.moveTo(-0.17, -0.02); ctx.bezierCurveTo(-0.2, 0.22, 0.18, 0.25, 0.2, 0.02); ctx.quadraticCurveTo(0.2, -0.08, 0.12, -0.1); ctx.lineTo(-0.1, -0.08); ctx.closePath();
    finish(ctx, lit(ctx, 0.1, 0.2, -0.1, -0.1, '#fff8e4', 0.2, 0.45));
    ell(ctx, 0.08, 0.02, 0.06, 0.065, '#130c0c'); ell(ctx, -0.05, 0.03, 0.045, 0.055, '#130c0c'); EYE(ctx, 0.09, 0.02, 0.018, 'rgba(255,64,48,1)');
    ell(ctx, 0.15, -0.04, 0.02, 0.025, '#130c0c');
    const jaw = 0.03 + 0.04 * Math.max(0, Math.sin(time * 9 + e.phase));
    ctx.beginPath(); ctx.moveTo(-0.08, -0.1 - jaw); ctx.lineTo(0.16, -0.1 - jaw); ctx.lineTo(0.15, -0.17 - jaw); ctx.lineTo(-0.06, -0.16 - jaw); ctx.closePath(); finish(ctx, B, 0.02);
    ctx.fillStyle = '#3a2a20'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.04 + i * 0.045, -0.115, 0.012, 0.04);
    ctx.restore();
  },
  // 夜魔: 骨の通った膜の翼・角・牙の笑い・ばねで揺れる尾。急降下の前に翼を広げて光る
  imp(ctx, e, A, time) {
    const warn = e.st === 'warn', dive = e.st === 'dive';
    const flap = Math.sin(time * (warn ? 30 : 14) + e.phase) * (dive ? 0.2 : 1);
    if (warn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ell(ctx, 0, 0.42, 0.95, 0.75, `rgba(255,70,120,${0.18 + 0.15 * Math.sin(time * 30)})`); ctx.restore(); }
    for (const side of [-1, 1]) {
      const span = dive ? 0.6 : 1.0, up = 0.32 + flap * 0.42;
      const root = [0, 0.48], tip = [side * span, 0.32 + up * 0.7], elbow = [side * span * 0.45, 0.5 + up];
      ctx.beginPath(); ctx.moveTo(...root); ctx.lineTo(...elbow); ctx.lineTo(...tip);
      const fingers = [[0.8, 0.12], [0.6, 0.06], [0.4, 0.12]];
      for (const [k, d] of fingers) ctx.quadraticCurveTo(side * span * (k + 0.1), 0.25 + up * 0.3 - d, side * span * k * 0.85, 0.24 + up * 0.25);
      ctx.quadraticCurveTo(side * 0.15, 0.25, 0, 0.36); ctx.closePath();
      finish(ctx, lit(ctx, 0, 0.9, 0, 0.2, side > 0 ? '#6a2758' : '#4a1a40', 0.25, 0.5), 0.025);
      ctx.strokeStyle = '#2a0a22'; ctx.lineWidth = 0.025; for (const [k] of fingers) { ctx.beginPath(); ctx.moveTo(...elbow); ctx.lineTo(side * span * k * 0.85, 0.24 + up * 0.25); ctx.stroke(); }
    }
    // 尾（ばね）
    const tw = Math.sin(time * 5 + e.phase) * 0.15;
    ctx.beginPath(); ctx.moveTo(-0.08, 0.2); ctx.quadraticCurveTo(-0.3, 0.05 + tw, -0.42, -0.1 - tw); ctx.strokeStyle = OUT; ctx.lineWidth = 0.06; ctx.stroke(); ctx.strokeStyle = '#9a2a44'; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.42, -0.1 - tw); ctx.lineTo(-0.52, -0.05 - tw); ctx.lineTo(-0.46, -0.2 - tw); ctx.closePath(); finish(ctx, '#9a2a44', 0.015);
    // 体と頭
    ctx.beginPath(); ctx.ellipse(0, 0.4, 0.22, 0.27, 0, 0, TAU); finish(ctx, lit(ctx, 0.1, 0.65, -0.1, 0.15, '#d24458', 0.35, 0.6));
    for (const [x, h] of [[0.09, 0.3], [-0.1, 0.26]]) { ctx.beginPath(); ctx.moveTo(x - 0.04, 0.6); ctx.quadraticCurveTo(x + 0.02, 0.6 + h, x + 0.1, 0.62 + h * 1.1); ctx.quadraticCurveTo(x + 0.04, 0.62, x + 0.05, 0.57); ctx.closePath(); finish(ctx, lit(ctx, x, 0.9, x, 0.6, '#f0dcb0', 0.3, 0.4), 0.018); }
    EYE(ctx, 0.11, 0.47, 0.035);
    ctx.beginPath(); ctx.arc(0.06, 0.34, 0.12, Math.PI * 0.05, Math.PI * 0.9); ctx.strokeStyle = '#1a0610'; ctx.lineWidth = 0.035; ctx.stroke();
    for (const x of [0.0, 0.1]) { ctx.beginPath(); ctx.moveTo(x, 0.3); ctx.lineTo(x + 0.02, 0.24); ctx.lineTo(x + 0.04, 0.3); ctx.fillStyle = '#fff6dc'; ctx.fill(); }
  },
  // 牙獣: 筋肉の盛り上がった黒い獣・たてがみ・牙・光る目。溜めで身を沈め、突進で前のめり
  beast(ctx, e, A, time) {
    const wind = e.st === 'windup', ch = e.st === 'charge', rec = e.st === 'recover';
    const crouch = wind ? 0.18 * Math.min(1, e.t * 3) : 0, run = ch ? 26 : 4, FUR = '#4a3a44';
    ctx.translate(0, -crouch);
    const legs = [[-0.55, 0, true], [0.45, Math.PI, true], [-0.4, Math.PI * 0.5, false], [0.6, Math.PI * 1.5, false]];
    for (const [x, ph, back] of legs) {
      const a = ch ? Math.sin(time * run + ph) * 0.8 : wind && x > 0 ? Math.sin(time * 18) * 0.35 : Math.sin(A.walk * 2 + ph) * 0.25;
      const knee = [x + Math.sin(a) * 0.18, 0.28 + crouch * 0.5], paw = [x + Math.sin(a) * 0.3, 0.03 + crouch];
      limb(ctx, [x, 0.55], knee, 0.11, 0.07, back ? dark(FUR, 0.35) : FUR); limb(ctx, knee, paw, 0.07, 0.06, back ? dark(FUR, 0.35) : FUR);
      if (!back) { ctx.beginPath(); ctx.ellipse(paw[0] + 0.05, paw[1], 0.09, 0.05, 0, 0, TAU); finish(ctx, dark(FUR, 0.2), 0.02); }
    }
    ctx.beginPath(); ctx.moveTo(-0.8, 0.5); ctx.bezierCurveTo(-0.8, 0.95, -0.2, 1.05, 0.2, 0.98); ctx.bezierCurveTo(0.6, 1.05, 0.78, 0.9, 0.74, 0.62); ctx.quadraticCurveTo(0.6, 0.35, 0.0, 0.4); ctx.quadraticCurveTo(-0.6, 0.35, -0.8, 0.5); ctx.closePath();
    finish(ctx, lit(ctx, 0.2, 1.05, 0.0, 0.35, FUR, 0.3, 0.65));
    for (let i = 0; i < 8; i++) { const x = -0.55 + i * 0.15, h = 0.16 + (i % 3) * 0.05 + Math.sin(time * 6 + i) * 0.015; ctx.beginPath(); ctx.moveTo(x - 0.07, 0.97); ctx.quadraticCurveTo(x - 0.03, 0.97 + h, x + 0.06, 0.98 + h * 0.9); ctx.lineTo(x + 0.06, 0.96); ctx.closePath(); finish(ctx, '#201820', 0.015); }
    ctx.strokeStyle = 'rgba(160,190,255,0.45)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-0.7, 0.85); ctx.quadraticCurveTo(-0.2, 1.02, 0.5, 0.98); ctx.stroke();
    ctx.save(); ctx.translate(0.75, 0.74); ctx.rotate(wind ? 0.22 : ch ? -0.18 : Math.sin(time * 2) * 0.04);
    ctx.beginPath(); ctx.moveTo(-0.18, 0.18); ctx.quadraticCurveTo(0.2, 0.22, 0.44, 0.06); ctx.lineTo(0.46, -0.06); ctx.quadraticCurveTo(0.2, -0.2, -0.12, -0.18); ctx.closePath();
    finish(ctx, lit(ctx, 0.2, 0.2, 0.1, -0.2, '#5a4652', 0.3, 0.6));
    for (const [x, l] of [[0.32, 0.2], [0.12, 0.16]]) { ctx.beginPath(); ctx.moveTo(x, -0.1); ctx.quadraticCurveTo(x + 0.08, 0.02, x + 0.03, 0.08 + l * 0.3); ctx.lineTo(x - 0.03, -0.08); ctx.closePath(); finish(ctx, '#f4ecd6', 0.015); }
    EYE(ctx, 0.17, 0.07, 0.03, wind || ch ? 'rgba(255,80,48,1)' : 'rgba(255,225,77,1)');
    ctx.beginPath(); ctx.moveTo(-0.08, 0.16); ctx.lineTo(0.0, 0.36); ctx.lineTo(0.06, 0.15); ctx.closePath(); finish(ctx, '#2a2026', 0.015);
    ctx.restore();
    if (rec) for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; glowDot(ctx, 0.75 + Math.cos(a) * 0.3, 1.25 + Math.sin(a) * 0.08, 0.035, 'rgba(255,225,77,1)'); }
    if (ch) { ctx.globalAlpha = 0.45; for (let i = 0; i < 3; i++) { ctx.strokeStyle = '#d8c8b0'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(-0.95 - i * 0.25, 0.35 + i * 0.22); ctx.lineTo(-1.45 - i * 0.25, 0.35 + i * 0.22); ctx.stroke(); } ctx.globalAlpha = 1; }
  },
  // 術者: 頭巾と裾の割れた長衣・白い仮面・袖から伸びる手。詠唱で光の輪が縮む
  caster(ctx, e, A, time) {
    let a = 1; if (e.st === 'appear') a = Math.min(1, e.t / 0.45); if (e.st === 'vanish') a = 1 - Math.min(1, e.t / 0.4); if (e.st === 'hidden') a = 0;
    ctx.globalAlpha *= a;
    ctx.translate(0, Math.sin(time * 2.5) * 0.04);
    const R = '#6b3fa0';
    ctx.beginPath(); ctx.moveTo(-0.38, 0.02); ctx.bezierCurveTo(-0.34, 0.6, -0.26, 1.1, -0.18, 1.32); ctx.bezierCurveTo(-0.1, 1.72, 0.26, 1.7, 0.28, 1.35); ctx.bezierCurveTo(0.34, 0.9, 0.38, 0.4, 0.44, 0.02);
    for (let i = 0; i < 6; i++) ctx.lineTo(0.44 - i * 0.165, 0.02 + (i % 2) * 0.1 + Math.sin(time * 4 + i) * 0.02);
    ctx.closePath(); finish(ctx, lit(ctx, 0.2, 1.6, -0.2, 0.0, R, 0.3, 0.65));
    ctx.strokeStyle = 'rgba(30,10,50,0.6)'; ctx.lineWidth = 0.025; for (const x of [-0.12, 0.08]) { ctx.beginPath(); ctx.moveTo(x, 1.2); ctx.quadraticCurveTo(x + 0.04, 0.6, x - 0.04, 0.1); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(216,178,90,0.8)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-0.36, 0.12); ctx.lineTo(0.42, 0.12); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.12, 1.32, 0.12, 0.15, 0.1, 0, TAU); finish(ctx, lit(ctx, 0.2, 1.45, 0.0, 1.2, '#efe4c8', 0.3, 0.4), 0.02);
    ctx.fillStyle = '#140818'; ctx.beginPath(); ctx.ellipse(0.17, 1.35, 0.03, 0.018, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0.06, 1.35, 0.025, 0.016, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#140818'; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.moveTo(0.08, 1.24); ctx.quadraticCurveTo(0.13, 1.22, 0.19, 1.25); ctx.stroke();
    const cast = e.st === 'cast' ? Math.min(1, e.t / 0.85) : 0;
    const hx = 0.47 + cast * 0.1, hy = 1.02 + cast * 0.15;
    limb(ctx, [0.14, 1.08], [hx, hy], 0.07, 0.09, dark(R, 0.15));
    ell(ctx, hx + 0.05, hy, 0.045, 0.04, '#d8c8e8');
    const r = 0.08 + cast * 0.18 + 0.02 * Math.sin(time * 20);
    glowDot(ctx, hx + 0.12, hy, r, 'rgba(200,120,255,0.95)');
    if (cast > 0) { ctx.strokeStyle = `rgba(220,160,255,${0.8 * cast})`; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(hx + 0.12, hy, 0.9 - cast * 0.7, 0, TAU); ctx.stroke(); }
  },
  // 跳ね鬼: ずんぐりした角の蛙の鬼。跳ぶ前に身を縮め、空中で手足を伸ばす
  hopper(ctx, e, A, time) {
    if (e.st === 'under') return;
    if (e.st === 'bubble') { for (let i = 0; i < 5; i++) { const t = (time * 2 + i * 0.2) % 1; ctx.beginPath(); ctx.arc((i - 2) * 0.22, 1.4 + t * 0.5, 0.07 * (1 - t) + 0.01, 0, TAU); ctx.strokeStyle = 'rgba(210,245,255,0.85)'; ctx.lineWidth = 0.02; ctx.stroke(); } return; }
    const air = e.st === 'hop' || e.st === 'leap', G = '#6fb646';
    const sq = e.st === 'wait' ? 1 - 0.2 * Math.min(1, e.t / 0.6) : air ? 1.12 : 1;
    ctx.scale(1 / Math.sqrt(sq), sq);
    for (const s of [-1, 1]) { const k = [s * 0.28, air ? 0.18 : 0.12], f = [s * (air ? 0.36 : 0.5), air ? -0.08 : 0.03]; limb(ctx, [s * 0.18, 0.3], k, 0.1, 0.07, s > 0 ? G : dark(G, 0.3)); limb(ctx, k, f, 0.07, 0.05, s > 0 ? G : dark(G, 0.3)); ctx.beginPath(); ctx.ellipse(f[0] + 0.05 * s, f[1], 0.1, 0.04, 0, 0, TAU); finish(ctx, dark(G, 0.2), 0.02); }
    ctx.beginPath(); ctx.ellipse(0, 0.42, 0.46, 0.37, 0, 0, TAU); finish(ctx, lit(ctx, 0.15, 0.8, -0.15, 0.05, G, 0.35, 0.6));
    for (let i = 0; i < 6; i++) ell(ctx, -0.25 + (i % 3) * 0.18, 0.55 + Math.floor(i / 3) * 0.12, 0.035, 0.03, 'rgba(30,70,20,0.6)');
    ctx.beginPath(); ctx.ellipse(0.08, 0.3, 0.3, 0.2, 0.1, 0, TAU); finish(ctx, lit(ctx, 0.1, 0.5, 0.1, 0.1, '#ecd47c', 0.3, 0.4), 0.02);
    for (const [x, s] of [[0.18, 1], [-0.16, -1]]) { ctx.beginPath(); ctx.moveTo(x - 0.05, 0.72); ctx.quadraticCurveTo(x + 0.04 * s, 0.95, x + 0.14 * s, 1.05); ctx.quadraticCurveTo(x + 0.06 * s, 0.8, x + 0.07, 0.68); ctx.closePath(); finish(ctx, lit(ctx, x, 1.0, x, 0.7, '#ece4c4', 0.3, 0.4), 0.018); }
    ctx.beginPath(); ctx.arc(0.24, 0.67, 0.12, 0, TAU); finish(ctx, '#fffae0', 0.02); ell(ctx, 0.28, 0.67, 0.055, 0.08, '#141408'); ell(ctx, 0.3, 0.7, 0.02, 0.02, '#fff');
    ctx.beginPath(); ctx.moveTo(-0.02, 0.43); ctx.quadraticCurveTo(0.24, 0.3, 0.46, 0.46); ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 0.035; ctx.stroke();
  },
  // 鉄塊鬼: 角の兜・牙・胸の鉄板・棘の金棒。振りかぶり → 叩きつけ → 長い硬直
  brute(ctx, e, A, time) {
    const wind = e.st === 'windup' ? Math.min(1, e.t / 0.6) : 0, smash = e.st === 'smash', rec = e.st === 'recover';
    const s = e.st === 'walk' ? Math.sin(A.walk) : 0, SK = '#8a6464', IR = '#8a949e';
    limb(ctx, [-0.22, 0.88], [-0.26 + s * 0.12, 0.44], 0.17, 0.14, dark(SK, 0.35)); limb(ctx, [-0.26 + s * 0.12, 0.44], [-0.28 + s * 0.15, 0.06], 0.14, 0.12, dark(IR, 0.3));
    ctx.beginPath(); ctx.ellipse(-0.25 + s * 0.15, 0.04, 0.2, 0.08, 0, 0, TAU); finish(ctx, dark(IR, 0.4), 0.025);
    ctx.save(); ctx.translate(0, 0.85); ctx.rotate(smash ? -0.25 : wind ? 0.12 * wind : 0);
    ctx.beginPath(); ctx.moveTo(-0.6, 0.0); ctx.bezierCurveTo(-0.75, 0.6, -0.5, 1.05, 0.0, 1.08); ctx.bezierCurveTo(0.55, 1.08, 0.72, 0.6, 0.6, 0.0); ctx.closePath();
    finish(ctx, lit(ctx, 0.3, 1.1, -0.3, 0.0, SK, 0.3, 0.6));
    ctx.beginPath(); ctx.moveTo(-0.45, 0.3); ctx.lineTo(0.5, 0.3); ctx.lineTo(0.46, 0.8); ctx.quadraticCurveTo(0.0, 0.88, -0.42, 0.8); ctx.closePath(); finish(ctx, lit(ctx, 0.4, 0.85, -0.4, 0.3, IR, 0.7, 0.55));
    for (const [x, y] of [[-0.3, 0.42], [0.0, 0.42], [0.3, 0.42], [-0.3, 0.68], [0.3, 0.68]]) ell(ctx, x, y, 0.035, 0.035, '#e0e6ec');
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-0.35, 0.76); ctx.lineTo(0.35, 0.76); ctx.stroke();
    // 兜
    ctx.save(); ctx.translate(0.18, 1.15);
    for (const [s2, x] of [[-1, -0.2], [1, 0.18]]) { ctx.beginPath(); ctx.moveTo(x, 0.12); ctx.quadraticCurveTo(x + s2 * 0.3, 0.3, x + s2 * 0.25, 0.55); ctx.quadraticCurveTo(x + s2 * 0.15, 0.3, x - s2 * 0.06, 0.18); ctx.closePath(); finish(ctx, lit(ctx, x, 0.5, x, 0.1, '#ece0c4', 0.3, 0.4), 0.02); }
    ctx.beginPath(); ctx.ellipse(0, 0.04, 0.3, 0.27, 0, 0, TAU); finish(ctx, lit(ctx, 0.15, 0.3, -0.15, -0.2, IR, 0.8, 0.6));
    ctx.fillStyle = '#0c0808'; ctx.beginPath(); ctx.moveTo(0.02, 0.02); ctx.lineTo(0.3, 0.0); ctx.lineTo(0.29, -0.06); ctx.lineTo(0.03, -0.05); ctx.closePath(); ctx.fill();
    EYE(ctx, 0.2, -0.02, 0.025, rec ? 'rgba(150,150,150,1)' : 'rgba(255,80,48,1)');
    for (const x of [0.1, 0.22]) { ctx.beginPath(); ctx.moveTo(x, -0.2); ctx.lineTo(x + 0.03, -0.07); ctx.lineTo(x + 0.06, -0.2); ctx.closePath(); finish(ctx, '#fff8e8', 0.012); }
    ctx.restore(); ctx.restore();
    limb(ctx, [0.22, 0.88], [0.24 - s * 0.12, 0.44], 0.18, 0.15, SK); limb(ctx, [0.24 - s * 0.12, 0.44], [0.26 - s * 0.15, 0.06], 0.15, 0.13, IR, { spec: true });
    ctx.beginPath(); ctx.ellipse(0.3 - s * 0.15, 0.04, 0.22, 0.08, 0, 0, TAU); finish(ctx, IR, 0.025);
    // 金棒
    const ang = smash ? 1.9 : wind ? -1.2 - wind * 1.0 + Math.sin(time * 40) * 0.05 * wind : rec ? 1.9 - Math.min(1, e.t) * 1.4 : 0.4;
    ctx.save(); ctx.translate(0.48, 1.58); ctx.rotate(-ang);
    limb(ctx, [0, 0], [0, 0.45], 0.1, 0.08, SK);
    limb(ctx, [0, 0.45], [0, 1.28], 0.17, 0.22, IR, { spec: true });
    for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { const y = 0.65 + i * 0.25; ctx.beginPath(); ctx.moveTo(sd * 0.18, y - 0.05); ctx.lineTo(sd * 0.34, y); ctx.lineTo(sd * 0.18, y + 0.05); ctx.closePath(); finish(ctx, '#d8dee4', 0.015); }
    ctx.restore();
    if (smash) { ctx.globalAlpha = 0.6; ell(ctx, 1.4, 0.05, 0.95, 0.13, '#d8c8a8'); ctx.globalAlpha = 1; }
  },
  // 呪い石像: 台座の上の角の生えた石の顔。目と口が赤く光ってから火を吐く
  turret(ctx, e, A, time) {
    const warn = e.st === 'warn' ? Math.min(1, e.t / 0.6) : 0;
    if (e.down) { ctx.scale(1, -1); ctx.translate(0, -1.2); }
    const ST = '#8e8a98';
    ctx.beginPath(); ctx.moveTo(-0.52, 0); ctx.lineTo(0.52, 0); ctx.lineTo(0.46, 0.12); ctx.lineTo(0.4, 0.3); ctx.lineTo(-0.4, 0.3); ctx.lineTo(-0.46, 0.12); ctx.closePath(); finish(ctx, lit(ctx, 0, 0.3, 0, 0, dark(ST, 0.2), 0.4, 0.5));
    ctx.beginPath(); ctx.moveTo(-0.42, 0.3); ctx.bezierCurveTo(-0.6, 0.8, -0.35, 1.28, 0.0, 1.27); ctx.bezierCurveTo(0.42, 1.26, 0.55, 1.0, 0.56, 0.78); ctx.lineTo(0.58, 0.5); ctx.quadraticCurveTo(0.42, 0.3, 0.42, 0.3); ctx.closePath();
    finish(ctx, lit(ctx, 0.3, 1.25, -0.3, 0.3, ST, 0.45, 0.6));
    ctx.strokeStyle = 'rgba(30,26,40,0.5)'; ctx.lineWidth = 0.02; for (const [a, b] of [[[-0.3, 0.5], [-0.1, 0.9]], [[0.1, 1.15], [0.25, 0.95]]]) { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    for (const [x, s] of [[-0.22, -1], [0.1, 1]]) { ctx.beginPath(); ctx.moveTo(x, 1.15); ctx.quadraticCurveTo(x + s * 0.1, 1.45, x - 0.15, 1.6); ctx.quadraticCurveTo(x - 0.05, 1.35, x - 0.12, 1.12); ctx.closePath(); finish(ctx, lit(ctx, x, 1.6, x, 1.1, dark(ST, 0.15), 0.4, 0.5), 0.02); }
    ctx.beginPath(); ctx.moveTo(0.2, 1.05); ctx.lineTo(0.42, 0.98); ctx.stroke();
    ell(ctx, 0.31, 0.92, 0.08, 0.06, '#130c14'); EYE(ctx, 0.32, 0.92, 0.025 + warn * 0.015, warn ? 'rgba(255,96,48,1)' : 'rgba(255,176,64,1)');
    ctx.beginPath(); ctx.ellipse(0.44, 0.6, 0.13, 0.07 + warn * 0.07, 0, 0, TAU); finish(ctx, `rgb(${40 + warn * 200},${18 + warn * 50},18)`, 0.02);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0.36 + i * 0.06, 0.66 + warn * 0.04); ctx.lineTo(0.38 + i * 0.06, 0.6); ctx.lineTo(0.4 + i * 0.06, 0.66 + warn * 0.04); ctx.fillStyle = '#d8d4dc'; ctx.fill(); }
    if (warn > 0) glowDot(ctx, 0.52, 0.6, 0.06 + warn * 0.08, 'rgba(255,150,50,0.95)');
  },
};
export function boneShape(ctx) {
  limb(ctx, [-0.16, 0], [0.16, 0], 0.035, 0.035, '#efe6cc', { rim: false });
  for (const x of [-0.18, 0.18]) for (const y of [-0.04, 0.04]) { ctx.beginPath(); ctx.arc(x, y, 0.045, 0, TAU); finish(ctx, '#efe6cc', 0.015); }
}
export { lit, limb, finish, glowDot, mix, lite, dark };
