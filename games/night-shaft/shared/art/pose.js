// 人物の姿勢（2D 版と VR 版で共通）。右向き（+x）の横から見た平面での関節位置を返す。原点は足元の中心、単位 m、y は上向き。
// 改善（v2）: 脚の比率を見直して立ち姿で膝が伸びる／歩き↔走りの連続ブレンド／接地・沈み込み・通過・伸び上がり／
// かかと接地とつま先の蹴り出し／走りの滞空と後ろ脚の蹴り上げ／肩と腰の逆ひねり／腕振りの遅れ／ローレディ／両手の構え（腕の IK）／
// 反動／片膝立ちの射撃（銃の高さ＝当たり判定の高さ）／構えを上げていく予兆／ジャンプの上昇・頂点・下降／溜めてから伸ばす飛び蹴り／
// 着地の沈み込み／のけぞり／膝が崩れて倒れ、床に横たわる死亡／呼吸と重心移動／まばたき／ドアの取っ手・エスカレーターの段。
export const SKEL = { hip: 0.975, thigh: 0.46, shin: 0.45, ankleH: 0.075, toe: 0.17, heel: 0.06, torso: 0.5, neck: 0.09, headR: 0.12, upper: 0.3, fore: 0.28 };
export const STEP_WALK = 0.72, STEP_RUN = 1.05; // 1 歩の長さ（m）。位相 π で 1 歩

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const lp = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];

// 2 関節 IK。bend = +1 で関節が前（膝）、-1 で下側（肘）
function ik2(a, t, L1, L2, bend) {
  let dx = t[0] - a[0], dy = t[1] - a[1];
  let d = Math.hypot(dx, dy) || 1e-4;
  const maxD = L1 + L2 - 1e-4, minD = Math.abs(L1 - L2) + 1e-3;
  const dd = clamp(d, minD, maxD);
  dx *= dd / d; dy *= dd / d;
  const ang = Math.atan2(dy, dx);
  const b = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1));
  const ja = ang + bend * b;
  return { joint: [a[0] + Math.cos(ja) * L1, a[1] + Math.sin(ja) * L1], end: [a[0] + dx, a[1] + dy], clamped: d > maxD };
}

// 足: 足裏の原点 x0、角度 a（+ でつま先が上）、支点（heel / toe / none）、持ち上げ量
function foot(x0, a, pivot = 'none', lift = 0) {
  const c = Math.cos(a), s = Math.sin(a);
  const R = (lx, ly) => [lx * c - ly * s, lx * s + ly * c];
  const plx = pivot === 'heel' ? -SKEL.heel : pivot === 'toe' ? SKEL.toe : 0;
  const r = R(plx, 0);
  const O = [x0 + plx - r[0], lift - r[1]];
  return { ankle: add(O, R(0, SKEL.ankleH)), toe: add(O, R(SKEL.toe, 0)), heel: add(O, R(-SKEL.heel, 0)), footA: a };
}
function leg(hip, f, explicitKnee) {
  if (explicitKnee) return { hip, knee: explicitKnee, ankle: f.ankle, toe: f.toe, heel: f.heel, footA: f.footA };
  const r = ik2(hip, f.ankle, SKEL.thigh, SKEL.shin, 1);
  const dx = r.end[0] - f.ankle[0], dy = r.end[1] - f.ankle[1]; // 届かない時は足ごと寄せる
  return { hip, knee: r.joint, ankle: r.end, toe: [f.toe[0] + dx, f.toe[1] + dy], heel: [f.heel[0] + dx, f.heel[1] + dy], footA: f.footA };
}
// 腕（FK）: 肩からの角度 a（0 = 真下、+ = 前）と肘の曲げ e
function armFK(sh, a, e) {
  const el = [sh[0] + Math.sin(a) * SKEL.upper, sh[1] - Math.cos(a) * SKEL.upper];
  const fa = a + e;
  return { shoulder: sh, elbow: el, hand: [el[0] + Math.sin(fa) * SKEL.fore, el[1] - Math.cos(fa) * SKEL.fore], gunA: fa - Math.PI / 2 };
}
function armIK(sh, target, gunA) {
  const r = ik2(sh, target, SKEL.upper, SKEL.fore, -1);
  return { shoulder: sh, elbow: r.joint, hand: r.end, gunA };
}

// 歩き・走りの 1 本の脚（u = 0..1 の周期の位置。0 で前に接地）
function gaitFoot(u, run) {
  const stance = lerp(0.6, 0.38, run);
  const C = 2 * lerp(STEP_WALK, STEP_RUN, run);
  const P = stance * C * lerp(0.62, 0.5, run); // 体の真下を中心に、前後へ（見た目の歩幅は IK で届く範囲に収める）
  if (u < stance) {
    const s = u / stance;
    const x = P / 2 - P * s;
    if (s < 0.14) return foot(x, lerp(0.28, 0, ease(s / 0.14)) * (1 - run * 0.6), 'heel'); // かかとから接地
    if (s > 0.68) return foot(x, -lerp(0, 0.75, ease((s - 0.68) / 0.32)), 'toe');          // つま先で蹴り出す
    return foot(x, 0, 'none');
  }
  const s = (u - stance) / (1 - stance);
  const x = -P / 2 + P * ease(s);
  const lift = Math.sin(Math.PI * s) * lerp(0.11, 0.2, run) + run * 0.22 * Math.sin(Math.PI * clamp(s * 1.7, 0, 1)) * (1 - s);
  return foot(x, lerp(-0.75, 0.22, ease(s)), 'none', lift);
}

// o: { phase, run, t, aimK, gunY, shootT, hitT, airT, vy, kickT, deadT, landT, landImpact, leanAcc, breath, escDir, carry }
export function computePose(kind, o = {}) {
  const S = SKEL;
  const t = o.t || 0;
  let hip = [0, S.hip], lean = 0.04, headTilt = 0, twist = 0;
  let feet = [foot(0.11, 0), foot(-0.1, 0)];
  let knees = [null, null];
  let armMode = 'ready'; // ready（ローレディ）| aim（両手で構え）| swing | custom
  let armDefs = null;
  let aimK = clamp(o.aimK || 0, 0, 1);
  let gunY = o.gunY ?? 1.3;
  const breath = Math.sin(t * 2.1);
  const run = clamp(o.run || 0, 0, 1);
  let swing = 0, elbowBend = 0.35;

  if (kind === 'move') {
    const ph = o.phase || 0;
    const u0 = ((ph / (2 * Math.PI)) % 1 + 1) % 1, u1 = (u0 + 0.5) % 1;
    feet = [gaitFoot(u0, run), gaitFoot(u1, run)];
    const stance = lerp(0.6, 0.38, run);
    const lowAt = lerp(0.08, stance / 2, run);
    const amp = lerp(0.045, 0.07, run);
    const bob = (u) => Math.cos(2 * Math.PI * (u - lowAt));
    hip = [0, S.hip - lerp(0.03, 0.065, run) - amp * 0.5 * (bob(u0) + bob(u1)) * 0.5 - amp * 0.25];
    lean = lerp(0.07, 0.2, run);
    twist = Math.cos(2 * Math.PI * u0) * lerp(0.03, 0.05, run);
    swing = -Math.cos(2 * Math.PI * (u0 - 0.06)) * lerp(0.42, 0.75, run);
    elbowBend = lerp(0.3, 1.45, run);
    armMode = aimK > 0.5 ? 'aim' : 'swing';
  } else if (kind === 'crouch' || kind === 'aimLow') {
    // 片膝立ち（手前の脚を立て、奥の膝を床につく）
    hip = [-0.03, 0.5];
    feet[0] = foot(0.27, 0);
    const kd = [-0.1, -1]; const kl = Math.hypot(kd[0], kd[1]);
    knees[1] = [hip[0] + kd[0] / kl * S.thigh, hip[1] + kd[1] / kl * S.thigh];
    feet[1] = { ankle: [-0.47, 0.16], toe: [-0.47 + Math.cos(-1.35) * S.toe, 0.16 + Math.sin(-1.35) * S.toe], heel: [-0.5, 0.2], footA: -1.35 };
    lean = 0.16 + breath * 0.008;
    armMode = kind === 'aimLow' || aimK > 0.5 ? 'aim' : 'ready';
  } else if (kind === 'jump') {
    const k = clamp((o.vy || 0) / 5.4, -1, 1);
    const up = clamp(k, 0, 1), down = clamp(-k, 0, 1), apex = 1 - Math.abs(k);
    feet = [
      foot(lerp(0.14, 0.16, apex) - down * 0.02, lerp(0.3, 0.1, down) * (1 - up) + up * 0.15, 'none', lerp(lerp(0.3, 0.4, apex), 0.08, down) + up * 0.12),
      foot(lerp(-0.26, -0.1, apex) + down * 0.02, -0.5 * up, 'none', lerp(lerp(0.12, 0.34, apex), 0.04, down)),
    ];
    hip = [0, S.hip + 0.02 + up * 0.03];
    lean = 0.12 - down * 0.05;
    armDefs = [null, { a: lerp(1.4, 2.2, up) - down * 0.6, e: 0.5 }];
    armMode = aimK > 0.5 ? 'aim' : 'readyAir';
  } else if (kind === 'kick') {
    const kt = o.kickT ?? 0.2;
    const ext = ease(clamp((kt - 0.05) / 0.08, 0, 1));
    feet = [foot(lerp(0.22, 0.72, ext), lerp(0.6, 1.1, ext), 'none', lerp(0.5, 0.66, ext)), foot(-0.1, -0.4, 'none', 0.34)];
    hip = [-0.04, S.hip + 0.06];
    lean = lerp(-0.05, -0.42, ext);
    armMode = 'custom';
    armDefs = [{ a: -0.9 * ext - 0.2, e: 0.4 }, { a: 1.55, e: 1.3 }];
    headTilt = 0.25 * ext;
  } else if (kind === 'door') {
    lean = 0.02; feet = [foot(0.06, 0), foot(-0.06, 0)];
    armMode = 'door';
  } else if (kind === 'ride') {
    const up = (o.escDir || 0) > 0;
    feet = [foot(0.15, 0, 'none', up ? 0.1 : 0), foot(-0.15, 0, 'none', up ? 0 : 0.1)];
    hip = [0, S.hip + 0.03];
    lean = up ? 0.1 : -0.02;
  } else if (kind === 'aim') {
    feet = [foot(0.2, 0), foot(-0.25, 0.0)];
    hip = [0.0, S.hip - 0.035 + breath * 0.004];
    lean = 0.05;
    armMode = 'aim';
  } else { // idle / spawn
    const sway = Math.sin(t * 0.9) * 0.018;
    hip = [sway, S.hip - 0.01 + breath * 0.006];
    feet = [foot(0.12 + sway * 0.2, 0), foot(-0.11 + sway * 0.2, 0)];
    lean = 0.04 + breath * 0.012;
    headTilt = Math.sin(t * 0.37 + (o.seed || 0)) * 0.06;
  }

  // 着地の沈み込み・のけぞり・加減速の傾き
  if (o.landT != null && o.landT < 0.22 && kind !== 'jump' && kind !== 'kick' && kind !== 'dead') {
    const k = 1 - o.landT / 0.22; const kk = Math.sin(Math.PI * Math.min(1, k * 1.2)) * (o.landImpact ?? 1);
    hip = [hip[0], hip[1] - 0.2 * kk]; lean += 0.18 * kk;
  }
  if (o.hitT != null && o.hitT < 0.25 && kind !== 'dead') { const k = 1 - o.hitT / 0.25; lean -= 0.35 * k * k; headTilt -= 0.3 * k; }
  lean += clamp(o.leanAcc || 0, -0.3, 0.3);

  // 胴・頭
  const dir = [Math.sin(lean), Math.cos(lean)];
  const sh = [hip[0] + dir[0] * S.torso, hip[1] + dir[1] * S.torso];
  const chest = [hip[0] + dir[0] * S.torso * 0.62, hip[1] + dir[1] * S.torso * 0.62];
  const hd = lean + headTilt;
  const neck = [sh[0] + Math.sin(hd) * S.neck, sh[1] + Math.cos(hd) * S.neck];
  const head = [neck[0] + Math.sin(hd) * S.headR * 0.95, neck[1] + Math.cos(hd) * S.headR * 0.95];

  const hips = [[hip[0] - twist * 0.6 + 0.025, hip[1]], [hip[0] + twist * 0.6 - 0.025, hip[1]]];
  const legs = feet.map((f, i) => leg(hips[i], f, knees[i]));
  const shs = [[sh[0] + twist + 0.02, sh[1] - 0.05], [sh[0] - twist - 0.03, sh[1] - 0.05]];

  // 腕
  let arms;
  const recoil = o.shootT != null && o.shootT < 0.11 ? 1 - o.shootT / 0.11 : 0;
  if (armMode === 'aim' || ((armMode === 'swing' || armMode === 'ready' || armMode === 'readyAir') && aimK > 0.02)) {
    // 両手で構える。aimK が 0→1 で、下げた銃を水平まで上げる（予兆）
    const k = ease(armMode === 'aim' ? clamp(o.aimK ?? 1, 0, 1) : aimK);
    const reach = 0.5 - recoil * 0.06;
    const aimT = [shs[0][0] + reach * lerp(0.62, 1, k), lerp(shs[0][1] - 0.42, gunY - 0.035, k)];
    const gA = lerp(-0.9, 0, k) + recoil * 0.28;
    const a0 = armIK(shs[0], aimT, gA);
    const sup = [a0.hand[0] - 0.05, a0.hand[1] - 0.045];
    arms = [a0, armIK(shs[1], sup, gA)];
    headTilt += -0.05 * recoil;
  } else if (armMode === 'swing') {
    // ローレディで走る（手前の手は銃を前下へ向けて保持、奥の腕を振る）
    const carry = armFK(shs[0], 0.4 + swing * 0.12, lerp(0.75, 1.25, run));
    arms = [carry, armFK(shs[1], swing, elbowBend + Math.max(0, swing) * 0.4)];
  } else if (armMode === 'door') {
    arms = [armIK(shs[0], [0.33, 1.02], -0.4), armFK(shs[1], 0.05, 0.25)];
  } else if (armMode === 'custom' || armMode === 'readyAir') {
    const d = armDefs || [];
    arms = [d[0] ? armFK(shs[0], d[0].a, d[0].e) : armFK(shs[0], 0.7, 1.0), d[1] ? armFK(shs[1], d[1].a, d[1].e) : armFK(shs[1], 0.1, 0.3)];
  } else {
    arms = [armFK(shs[0], 0.22 + breath * 0.02, 0.72), armFK(shs[1], 0.06 + breath * 0.015, 0.28)]; // ローレディ（銃口は前下）
  }

  let P = { hip, chest, shoulder: sh, neck, head, lean, headTilt: hd - lean, legs, arms, kind, twist };
  if (kind === 'dead') P = deadPose(o.deadT ?? 0, P);
  return P;
}

// 死亡: のけぞり（0〜0.12s）→ 膝が崩れて後ろへ倒れる（〜0.55s）→ 床に横たわり小さく弾む
const LYING = (() => {
  const y = 0.12;
  return { hip: [-0.55, y], chest: [-0.86, y + 0.01], shoulder: [-1.05, y + 0.02], neck: [-1.14, y + 0.02], head: [-1.27, 0.13], lean: -Math.PI / 2, headTilt: 0,
    legs: [{ hip: [-0.53, y], knee: [-0.12, 0.17], ankle: [0.3, 0.075], toe: [0.32, 0.25], heel: [0.26, 0.02], footA: 1.5 },
      { hip: [-0.57, y], knee: [-0.15, 0.1], ankle: [0.27, 0.07], toe: [0.4, 0.2], heel: [0.22, 0.03], footA: 1.0 }],
    arms: [{ shoulder: [-1.03, 0.1], elbow: [-0.8, 0.06], hand: [-0.53, 0.06], gunA: 0.3 }, { shoulder: [-1.07, 0.1], elbow: [-1.32, 0.09], hand: [-1.58, 0.07], gunA: Math.PI }] };
})();
function deadPose(t, standing) {
  if (t < 0.12) { // のけぞり（腕が上がる）
    const k = t / 0.12;
    const P = { ...standing, lean: standing.lean - 0.35 * k };
    return rebuildUpper(P, -0.35 * k, k);
  }
  const e = Math.min(1, ((t - 0.12) / 0.43) ** 2);
  const from = rebuildUpper({ ...standing, lean: standing.lean - 0.35 }, -0.35, 1);
  const P = lerpPose(from, LYING, e);
  // 倒れる途中は膝が前へ崩れる
  const buckle = Math.sin(Math.PI * e) * 0.18;
  P.legs = P.legs.map((L) => ({ ...L, knee: [L.knee[0] + buckle, L.knee[1] + buckle * 0.4] }));
  if (t > 0.55) { const b = Math.exp(-(t - 0.55) * 10) * Math.abs(Math.sin((t - 0.55) * 22)) * 0.05; for (const k of ['hip', 'chest', 'shoulder', 'neck', 'head']) P[k] = [P[k][0], P[k][1] + b]; }
  return P;
}
function rebuildUpper(P, dl, armUp) {
  const lean = P.lean;
  const dir = [Math.sin(lean), Math.cos(lean)];
  const sh = [P.hip[0] + dir[0] * SKEL.torso, P.hip[1] + dir[1] * SKEL.torso];
  const neck = [sh[0] + dir[0] * SKEL.neck, sh[1] + dir[1] * SKEL.neck];
  const head = [neck[0] + Math.sin(lean - 0.3 * armUp) * SKEL.headR, neck[1] + Math.cos(lean - 0.3 * armUp) * SKEL.headR];
  const arms = [armFK([sh[0] + 0.02, sh[1] - 0.05], 0.5 + 1.8 * armUp, 0.3), armFK([sh[0] - 0.03, sh[1] - 0.05], 0.2 + 2.3 * armUp, 0.4)];
  return { ...P, shoulder: sh, chest: [P.hip[0] + dir[0] * 0.31, P.hip[1] + dir[1] * 0.31], neck, head, arms };
}

// 姿勢どうしの補間（状態の切り替えを 0.12 秒でなめらかにつなぐ）
export function lerpPose(a, b, k) {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, k);
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerpPose(v, b[i], k));
  if (a && b && typeof a === 'object') { const o = {}; for (const key of Object.keys(b)) o[key] = key in a ? lerpPose(a[key], b[key], k) : b[key]; return o; }
  return k < 0.5 ? a : b;
}

// ---- 動きの状態（1 人に 1 つ）: 位相・歩き↔走り・振り向き・ブレンド・着地・加減速の傾き・コートの揺れ・まばたき ----
export class Animator {
  constructor(seed = 0) {
    this.seed = seed; this.phase = 0; this.speed = 0; this.faceV = null; this.lastX = null; this.lastKind = null;
    this.prev = null; this.blend = 1; this.landT = 9; this.landImpact = 1; this.wasAir = false; this.leanAcc = 0; this.hem = 0; this.hemV = 0;
    this.blinkT = 2 + (seed % 7) * 0.4; this.blink = 0; this.aimK = 0; this.lastPose = null; this.vyMin = 0;
  }
  // s: { x, y, face, kind, air, vy, aimTarget(0..1), gunY, shootT, hitT, airT, kickT, deadT, escDir, t }
  update(dt, s) {
    dt = Math.min(dt, 0.1);
    if (this.lastX == null) this.lastX = s.x;
    const dx = s.x - this.lastX; this.lastX = s.x;
    const v = dt > 0 ? Math.abs(dx) / dt : 0;
    const prevSpeed = this.speed;
    this.speed += (Math.min(v, 6) - this.speed) * Math.min(1, dt * 12);
    const run = clamp((this.speed - 1.5) / 1.4, 0, 1);
    this.run = run;
    if (s.kind === 'move' || s.kind === 'ride') this.phase += Math.abs(dx) * Math.PI / lerp(STEP_WALK, STEP_RUN, run);
    // 足が着いた瞬間（位相 π ごと）＝足音
    const si = Math.floor(this.phase / Math.PI); this.step = s.kind === 'move' && si !== this.lastStep; this.lastStep = si;
    // 加減速で前後に傾く（ばね）
    const acc = dt > 0 ? (this.speed - prevSpeed) / dt : 0;
    this.leanAcc += (clamp(acc * 0.025, -0.22, 0.22) - this.leanAcc) * Math.min(1, dt * 8);
    // 振り向き
    if (this.faceV == null) this.faceV = s.face;
    this.faceV += clamp(s.face - this.faceV, -dt / 0.07, dt / 0.07);
    // 着地
    if (this.wasAir && !s.air) { this.landT = 0; this.landImpact = clamp(-this.vyMin / 7, 0.35, 1); }
    if (s.air) this.vyMin = Math.min(this.vyMin, s.vy || 0); else this.vyMin = 0;
    this.wasAir = !!s.air; this.landT += dt;
    // 構えの上げ下げ
    this.aimK += clamp((s.aimTarget ?? 0) - this.aimK, -dt / 0.18, dt / 0.12);
    if (s.aimForce != null) this.aimK = s.aimForce;
    // コートの裾（速度と縦の動きで揺れる）
    const target = clamp(-this.speed * 0.09 - (s.vy || 0) * 0.04, -0.45, 0.35);
    this.hemV += ((target - this.hem) * 60 - this.hemV * 9) * dt; this.hem += this.hemV * dt;
    // まばたき
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2.4 + ((this.seed * 9301 + Math.floor(s.t * 3)) % 23) * 0.15; }
    this.blink = Math.max(0, this.blink - dt);
    this.deadT = s.kind === 'dead' ? (this.deadT || 0) + dt : 0;
    // 姿勢（状態が変わったら 0.12 秒で補間）
    if (s.kind !== this.lastKind) { this.prev = this.lastPose; this.blend = s.kind === 'dead' ? 1 : 0; this.lastKind = s.kind; }
    this.blend = Math.min(1, this.blend + dt / 0.12);
    const P = computePose(s.kind, { phase: this.phase, run, t: s.t, aimK: this.aimK, gunY: s.gunY, shootT: s.shootT, hitT: s.hitT, airT: s.airT, vy: s.vy,
      kickT: s.kickT, deadT: s.deadT ?? this.deadT, landT: this.landT, landImpact: this.landImpact, leanAcc: s.kind === 'move' ? this.leanAcc : this.leanAcc * 0.5, escDir: s.escDir, seed: this.seed });
    const out = this.prev && this.blend < 1 ? lerpPose(this.prev, P, ease(this.blend)) : P;
    out.kind = s.kind;
    this.lastPose = out;
    return { pose: out, faceV: this.faceV, hem: this.hem, blink: this.blink > 0, run, speed: this.speed, step: this.step };
  }
}

// ゲームの状態 → 動きの入力
export function playerAnimState(p, t) {
  const air = !p.grounded && p.state === 'play';
  let kind = 'idle', aimTarget = 0, gunY = 1.3;
  const shooting = p.shootT != null && p.shootT < 0.45;
  if (p.state === 'dead') kind = 'dead';
  else if (p.state === 'door') kind = 'door';
  else if (p.state === 'esc') kind = 'ride';
  else if (air) kind = p.kicked && p.kickT != null ? 'kick' : 'jump';
  else if (p.crouch) { kind = shooting ? 'aimLow' : 'crouch'; gunY = 0.72; }
  else if (Math.abs(p.vx || 0) > 0.1 || (p.walkSpeed || 0) > 0.3) kind = 'move';
  else kind = shooting ? 'aim' : 'idle';
  if (shooting) aimTarget = 1;
  return { x: p.x, face: p.face, kind, air, vy: p.vy, aimTarget, gunY, shootT: p.shootT, hitT: p.hitT, airT: p.airT, kickT: p.kickT, deadT: p.t, escDir: p.escDir, t };
}
export function enemyAnimState(e, game, t) {
  let kind = 'idle', aimTarget = 0, gunY = 1.35, aimForce;
  if (!e.alive) kind = 'dead';
  else if (e.state === 'spawn') kind = 'move';
  else if (e.stance === 'crouch') {
    const low = e.lowShot && (e.state === 'windup' || e.state === 'cool');
    kind = low || e.state === 'windup' ? 'aimLow' : 'crouch';
    gunY = low ? 0.42 : 0.72;
    aimTarget = kind === 'aimLow' ? 1 : 0;
    if (e.state === 'windup') aimForce = clamp(1 - Math.max(0, e.t) / game.D.windup, 0, 1);
  } else if (e.moving) { kind = 'move'; aimTarget = e.state === 'alert' ? 0.0 : 0; }
  else if (e.state === 'windup') { kind = 'aim'; aimForce = clamp(1 - Math.max(0, e.t) / game.D.windup, 0, 1); }
  else if (e.state === 'cool') { kind = 'aim'; aimTarget = 1; }
  else if (e.state === 'alert') { kind = 'idle'; aimTarget = 0; }
  return { x: e.x, face: e.dir, kind, air: !e.grounded, vy: e.vy, aimTarget, aimForce, gunY, shootT: e.shootT, hitT: e.hitT, deadT: e.deadT, t: t + e.id * 1.7 };
}
