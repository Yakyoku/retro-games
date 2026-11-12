// 人物の姿勢（2D 版と VR 版で共通）。右向き（+x）の横から見た平面での関節位置を返す。
// 脚は 2 関節の IK で足先を地面に置く（足滑り・床への埋まりを防ぐ）。歩幅は移動速度と位相から決まり、踏んでいる足は地面に止まる。
// 単位はメートル。原点は足元の中心。
export const SKEL = { hip: 0.93, thigh: 0.46, shin: 0.44, torso: 0.50, neck: 0.08, headR: 0.125, upper: 0.29, fore: 0.27, foot: 0.2 };
export const STRIDE = 0.8; // 1 歩の長さ（game.js の歩行位相の進み方と合わせる: 位相 π ＝ 1 歩）

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 2 関節 IK。膝は前（+x）に曲がる
function ik(hx, hy, tx, ty, L1, L2) {
  let dx = tx - hx, dy = ty - hy;
  let d = Math.hypot(dx, dy);
  const maxD = L1 + L2 - 1e-4;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  const a = Math.atan2(dy, dx);
  const cosB = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const b = Math.acos(cosB);
  const ta = a + b; // 膝を前へ
  const kx = hx + Math.cos(ta) * L1, ky = hy + Math.sin(ta) * L1;
  return { knee: [kx, ky], ankle: [hx + dx, hy + dy] };
}

// 腕: 肩からの角度（0 = 真下、+ = 前へ）と肘の曲げ
function arm(sx, sy, a, e) {
  const ex = sx + Math.sin(a) * SKEL.upper, ey = sy - Math.cos(a) * SKEL.upper;
  const fa = a + e;
  return { elbow: [ex, ey], hand: [ex + Math.sin(fa) * SKEL.fore, ey - Math.cos(fa) * SKEL.fore], foreAngle: fa };
}

// kind: idle | walk | crouch | jump | kick | ride | dead | door | aim | aimLow | spawn
// o: { phase, speed, t, shootT, hitT, airT, vy, aim(0..1), breathe }
export function computePose(kind, o = {}) {
  const S = SKEL;
  const t = o.t || 0;
  let hipY = S.hip, hipX = 0, lean = 0.04, headTilt = 0;
  let feet = [[0.12, 0], [-0.1, 0]]; // [手前の足, 奥の足]
  let footLift = [0, 0];
  let arms = null;
  const breathe = Math.sin(t * 2.2) * 0.006;
  const aiming = kind === 'aim' || kind === 'aimLow' || (o.shootT != null && o.shootT < 0.35) || o.aim;

  if (kind === 'walk') {
    const ph = o.phase || 0;
    const legs = [ph, ph + Math.PI].map((p) => {
      const u = ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / Math.PI; // 0..2
      if (u < 1) return { x: STRIDE / 2 - STRIDE * u, lift: 0 }; // 踏み（地面に固定）
      const s = u - 1; // 振り出し
      const e = 0.5 - 0.5 * Math.cos(Math.PI * s);
      return { x: -STRIDE / 2 + STRIDE * e, lift: Math.sin(Math.PI * s) * 0.13 };
    });
    feet = legs.map((l) => [l.x * 0.62, l.lift]);
    hipY = S.hip - 0.035 + Math.cos(ph * 2) * 0.025;
    lean = 0.12;
    const sw = Math.sin(ph) * 0.5;
    if (!aiming) arms = [{ a: -sw, e: 0.35 + Math.max(0, -sw) * 0.4 }, { a: sw, e: 0.35 + Math.max(0, sw) * 0.4 }];
  } else if (kind === 'crouch' || kind === 'aimLow') {
    hipY = 0.52; hipX = -0.08; lean = 0.32;
    feet = [[0.26, 0], [-0.2, 0]];
    headTilt = -0.12;
  } else if (kind === 'jump') {
    const k = clamp(o.airT / 0.6, 0, 1);
    hipY = S.hip + 0.04; lean = 0.08;
    feet = [[0.22, 0.38 - 0.1 * k], [-0.12, 0.3]];
    if (!aiming) arms = [{ a: 1.6, e: 0.5 }, { a: -0.9, e: 0.7 }];
  } else if (kind === 'kick') {
    hipY = S.hip + 0.06; lean = -0.18;
    feet = [[0.62, 0.62], [-0.14, 0.28]];
    arms = [{ a: -0.7, e: 0.5 }, { a: 1.0, e: 0.9 }];
  } else if (kind === 'dead') {
    const k = clamp(t / 0.55, 0, 1);
    const kk = k * k;
    hipY = S.hip - (S.hip - 0.18) * kk; hipX = -0.25 * kk; lean = -0.25 - 1.15 * kk;
    feet = [[0.3 * kk, 0], [0.05, 0]];
    headTilt = -0.4 * k;
    arms = [{ a: -0.4 - 1.4 * kk, e: 0.4 }, { a: 0.6 - 1.8 * kk, e: 0.2 }];
  } else if (kind === 'door') {
    lean = 0; feet = [[0.05, 0], [-0.05, 0]];
    arms = [{ a: 0.15, e: 0.2 }, { a: 0.6, e: 1.6 }];
  } else if (kind === 'ride') {
    lean = 0.02; feet = [[0.12, 0], [-0.12, 0]];
  } else if (kind === 'spawn') {
    lean = 0.1; feet = [[0.18, 0], [-0.15, 0]];
  } else { // idle / aim
    hipY = S.hip + breathe; lean = 0.05 + breathe;
    feet = [[0.16, 0], [-0.12, 0]];
  }
  if (o.hitT != null && o.hitT < 0.18 && kind !== 'dead') lean -= 0.25 * (1 - o.hitT / 0.18);

  const hip = [hipX, hipY];
  const sh = [hipX + Math.sin(lean) * S.torso, hipY + Math.cos(lean) * S.torso];
  const neck = [sh[0] + Math.sin(lean + headTilt) * S.neck, sh[1] + Math.cos(lean + headTilt) * S.neck];
  const head = [neck[0] + Math.sin(lean + headTilt) * S.headR * 0.95, neck[1] + Math.cos(lean + headTilt) * S.headR * 0.95];
  const legs = feet.map(([fx, fy], i) => {
    const hx = hip[0] + (i === 0 ? 0.03 : -0.03);
    const r = ik(hx, hip[1], fx, fy + 0.08, S.thigh, S.shin);
    return { hip: [hx, hip[1]], knee: r.knee, ankle: r.ankle, toe: [r.ankle[0] + S.foot, Math.max(fy, r.ankle[1] - 0.06)] };
  });

  // 腕: 構え（手前の腕で銃を水平に）と、かまえていない時の腕振り
  let armDefs = arms;
  if (aiming && kind !== 'dead' && kind !== 'kick') {
    const recoil = o.shootT != null && o.shootT < 0.08 ? 0.12 * (1 - o.shootT / 0.08) : 0;
    const gunA = Math.PI / 2 - lean * 0.15 + recoil;
    armDefs = [{ a: gunA, e: -0.05 - recoil * 0.5 }, { a: gunA - 0.25, e: 0.35 }];
  }
  if (!armDefs) armDefs = [{ a: 0.12, e: 0.25 }, { a: -0.08, e: 0.3 }];
  const armsOut = armDefs.map((d, i) => {
    const sx = sh[0] + (i === 0 ? 0.02 : -0.03), sy = sh[1] - 0.04;
    return { shoulder: [sx, sy], ...arm(sx, sy, d.a + lean * 0.3, d.e) };
  });
  return { hip, shoulder: sh, neck, head, lean, headTilt, legs, arms: armsOut, aiming, kind };
}

// ゲームの状態 → 姿勢の種類
export function playerPoseKind(p) {
  if (p.state === 'dead') return 'dead';
  if (p.state === 'door') return 'door';
  if (p.state === 'esc') return 'ride';
  if (!p.grounded) return p.kicked && p.kickT != null ? 'kick' : 'jump';
  if (p.crouch) return 'crouch';
  if (Math.abs(p.vx) > 0.1 || (p.walkSpeed || 0) > 0.3) return 'walk';
  return 'idle';
}
export function enemyPoseKind(e) {
  if (!e.alive) return 'dead';
  if (e.state === 'spawn') return 'spawn';
  if (e.stance === 'crouch') return 'aimLow';
  if (e.state === 'windup') return 'aim';
  if (e.moving) return 'walk';
  return e.state === 'alert' || e.state === 'cool' ? 'aim' : 'idle';
}
