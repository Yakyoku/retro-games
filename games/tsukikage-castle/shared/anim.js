// 月影の魔城 — 動きの計算（2D と 3D で同じ骨格・同じポーズを使う）
// 角度はラジアン。脚・腕は「真下 = 0、向いている方向（前）へ振ると +」。胴の傾きは前傾が +。
// 骨の長さ（u）: 腿 0.36・すね 0.36・足 0.06（腰の高さ 0.78）・胴 0.5・頭 0.36 → 立ち姿 1.64u（当たり判定 1.62）
export const BONES = { thigh: 0.36, shin: 0.36, foot: 0.06, torso: 0.5, head: 0.36, upper: 0.3, fore: 0.28, hipW: 0.12, shW: 0.17 };
const RUN_A = 0.62;                                          // 腿の振り幅
export const STRIDE = 4 * (BONES.thigh + BONES.shin) * Math.sin(RUN_A); // 1 周期で進む距離（足が地面を滑らない歩幅）
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function knightPose(p, time) {
  const P = { lean: 0, head: 0, bob: 0, hipY: BONES.thigh + BONES.shin + BONES.foot, armF: [0.1, -0.3], armB: [-0.1, -0.3], legF: [0, 0], legB: [0, 0],
    cape: 0.25, crouch: 0, climb: false, back: false, dead: 0, hurt: 0, throwK: 0, plume: 0, squash: 1 };
  const st = p.state;
  const throwK = p.throwT > 0 ? ease(p.throwT / 0.14) : 0;
  P.throwK = throwK;
  if (st === 'run') {
    const ph = (p.walkPhase / STRIDE) * Math.PI * 2;
    const s = Math.sin(ph), c = Math.cos(ph);
    P.legF = [RUN_A * s, 0.15 + 1.0 * Math.max(0, -Math.cos(ph + 0.4))];
    P.legB = [-RUN_A * s, 0.15 + 1.0 * Math.max(0, Math.cos(ph + 0.4))];
    P.armF = [-0.55 * s, -0.7]; P.armB = [0.55 * s, -0.7];
    P.bob = 0.045 * Math.abs(c) - 0.03; P.lean = 0.12; P.cape = 0.6 + 0.1 * s;
  } else if (st === 'jump' || st === 'fall') {
    const up = st === 'jump';
    P.legF = [up ? 0.9 : 0.4, up ? 1.5 : 0.6]; P.legB = [up ? -0.2 : -0.35, up ? 0.9 : 0.4];
    P.armF = [up ? 1.0 : 0.6, -0.6]; P.armB = [up ? -0.6 : -0.9, -0.4];
    P.lean = up ? 0.15 : -0.05; P.cape = up ? -0.3 : 1.1;
  } else if (st === 'crouch') {
    P.crouch = 1; P.hipY = 0.42; P.legF = [1.45, 2.3]; P.legB = [0.55, 2.2]; P.lean = 0.35; P.armF = [0.6, -0.9]; P.armB = [0.2, -1.2]; P.cape = 0.9;
  } else if (st === 'climb') {
    const ph = p.climbPhase * Math.PI;
    P.climb = true; P.back = true;
    P.armF = [2.7 + 0.35 * Math.sin(ph), -0.6]; P.armB = [2.7 - 0.35 * Math.sin(ph), -0.6];
    P.legF = [0.5 + 0.4 * Math.max(0, Math.sin(ph)), 0.9 * Math.max(0, Math.sin(ph))];
    P.legB = [0.5 + 0.4 * Math.max(0, -Math.sin(ph)), 0.9 * Math.max(0, -Math.sin(ph))];
    P.cape = 0.1;
  } else if (st === 'hurt') {
    P.hurt = 1; P.lean = -0.5; P.armF = [1.6, -0.3]; P.armB = [-1.2, -0.3]; P.legF = [0.7, 0.8]; P.legB = [-0.3, 0.3]; P.cape = 1.3; P.head = -0.3;
  } else if (st === 'dead') {
    const k = ease(Math.min(1, p.deadT / 0.6));
    P.dead = k; P.lean = lerp(-0.4, -1.45, k); P.hipY = lerp(0.6, 0.18, k); P.legF = [lerp(0.6, 1.5, k), lerp(0.5, 0.2, k)]; P.legB = [lerp(0.2, 1.4, k), 0.3];
    P.armF = [lerp(1.4, 2.6, k), -0.2]; P.armB = [lerp(-1, 2.2, k), -0.2]; P.head = lerp(-0.3, -0.6, k); P.cape = 1.6;
  } else {
    const br = Math.sin(time * 2.2);
    P.bob = 0.012 * br;
    // 待機: 数秒ごとに辺りを見回し、鎧がないときは寒さに震える
    const look = Math.sin(time * 0.45); P.head = look > 0.85 ? -(look - 0.85) * 2.2 : look < -0.9 ? (look + 0.9) * 2.5 : 0;
    if (!p.armor) { P.bob += Math.sin(time * 38) * 0.006; P.legF[1] += 0.12 + Math.sin(time * 38) * 0.04; P.legB[1] += 0.12 - Math.sin(time * 38) * 0.04; P.armF = [0.5, -1.6]; P.armB = [0.4, -1.5]; } P.armF = [0.15 + 0.03 * br, -0.35]; P.armB = [-0.08, -0.25]; P.legF = [0.08, 0.05]; P.legB = [-0.08, 0.05]; P.cape = 0.25 + 0.05 * br;
  }
  if (p.landT > 0 && st !== 'crouch') { const k = p.landT / 0.12; P.hipY -= 0.08 * k; P.legF[1] += 0.5 * k; P.legB[1] += 0.5 * k; P.squash = 1 - 0.05 * k; }
  if (throwK > 0 && !P.climb) {
    // 投げ: 前の腕を後ろから前へ振り抜く（0.14 秒）。発射の瞬間が振り抜きの頂点
    const k = 1 - throwK;
    P.armF = [lerp(2.9, 1.35, ease(k * 2)), lerp(-1.9, -0.05, ease(k * 1.6))]; // 大きく振りかぶってから振り抜く
    P.lean += 0.18 * (1 - k) - 0.06 * k;
  }
  if (p.turnT > 0) P.lean -= 0.15 * (p.turnT / 0.08);
  P.plume = Math.sin(time * 5) * 0.08 + (st === 'run' ? 0.3 : 0) + (st === 'jump' ? -0.3 : 0);
  return P;
}

// 2 関節の連鎖を計算: 付け根 (x,y)、角度（真下 0・前 +）、向き face → [[x,y] 関節, [x,y] 先端]
export function limb(x, y, a1, a2, l1, l2, face) {
  const kx = x + Math.sin(a1) * l1 * face, ky = y - Math.cos(a1) * l1;
  const b = a1 + a2;
  return [[kx, ky], [kx + Math.sin(b) * l2 * face, ky - Math.cos(b) * l2]];
}
// 骨格の各点（足元を原点、y 上）
export function knightJoints(P, face) {
  const hip = [Math.sin(P.lean) * 0.0, P.hipY + P.bob];
  const neck = [hip[0] + Math.sin(P.lean) * BONES.torso * face, hip[1] + Math.cos(P.lean) * BONES.torso * P.squash];
  const sh = [lerp(hip[0], neck[0], 0.9), lerp(hip[1], neck[1], 0.9)];
  const legF = limb(hip[0] + 0.04 * face, hip[1], P.legF[0], -P.legF[1], BONES.thigh, BONES.shin, face);
  const legB = limb(hip[0] - 0.04 * face, hip[1], P.legB[0], -P.legB[1], BONES.thigh, BONES.shin, face);
  const armF = limb(sh[0] + 0.05 * face, sh[1], P.armF[0], -P.armF[1], BONES.upper, BONES.fore, face);
  const armB = limb(sh[0] - 0.05 * face, sh[1], P.armB[0], -P.armB[1], BONES.upper, BONES.fore, face);
  const head = [neck[0] + Math.sin(P.lean + P.head) * 0.2 * face, neck[1] + Math.cos(P.lean + P.head) * 0.2];
  return { hip, neck, sh, legF, legB, armF, armB, head };
}

// 敵の共通の動きの値（予備動作の強さ・攻撃の瞬間・被弾の揺れ・歩調）
export function enemyAnim(e, time) {
  const wind = e.st === 'windup' || e.st === 'warn' || e.st === 'cast' || e.st === 'bubble' || e.st === 'chargeWind' || e.st === 'slamWind';
  return {
    wind: wind ? Math.min(1, e.t / 0.5) : 0,
    shake: wind ? Math.sin(time * 60) * 0.03 * Math.min(1, e.t / 0.3) : 0,
    flash: e.hitT > 0 ? e.hitT / 0.12 : 0,
    walk: (e.x * 2.2) + (e.phase || 0),
    bob: Math.sin(time * 3 + (e.phase || 0)),
    dead: e.dead ? Math.min(1, e.deadT / 0.6) : 0,
  };
}
