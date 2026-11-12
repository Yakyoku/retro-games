// Sky Climber VR — 登攀の状態（両手・身体）と、クラシック操作（左右の方向入力で隣の保持点へ手を伸ばす）。
// 入力の手（追跡/スティック）・表示の手・保持点（ワールド座標）・身体・カメラは分けて持つ。
// ここは「身体と保持の論理」だけを扱い、描画やカメラには触れない。
import { BODY } from './config.js';

const SIDES = ['L', 'R'];
const sgn = (s) => (s === 'L' ? -1 : 1);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// 保持点の空間索引（1m 格子）
export function makeHoldIndex(holds) {
  const cell = 1.0, map = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const h of holds) {
    const k = key(Math.floor(h.x / cell), Math.floor(h.y / cell));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(h);
  }
  return {
    near(x, y, r) {
      const out = [];
      const i0 = Math.floor((x - r) / cell), i1 = Math.floor((x + r) / cell);
      const j0 = Math.floor((y - r) / cell), j1 = Math.floor((y + r) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = map.get(key(i, j)); if (!a) continue;
        for (const h of a) if (dist(h.x, h.y, x, y) <= r) out.push(h);
      }
      return out;
    },
  };
}

export class Climber {
  constructor(building, pose, opts = {}) {
    this.b = building;
    this.holds = building.holds;
    this.index = makeHoldIndex(building.holds);
    this.reachMul = opts.reachMul ?? 1;
    this.speedMul = opts.speedMul ?? 1;
    this.autoGrab = !!opts.autoGrab; // 到達したら中立に戻さなくてもつかむ（タッチの既定）
    this.available = opts.available || (() => true); // 窓が閉じた保持点は false
    this.supports = opts.supports || [{ y: 0, x0: -1e9, x1: 1e9 }]; // 立てる床（地面・安全区画）
    this.events = [];
    this.reset(pose);
  }
  reset(pose) {
    this.body = { x: pose.x, y: pose.y };
    this.hands = {};
    for (const s of SIDES) this.hands[s] = { hold: null, x: pose.x + sgn(s) * 0.3, y: pose.y - 0.55, reach: null, idle: 0 };
    this.lastDir = { L: null, R: null };
    this.mantle = false;
  }
  get reach() { return BODY.reach * this.reachMul; }
  shoulder(s) { return { x: this.body.x + sgn(s) * BODY.shoulderHalf, y: this.body.y }; }
  heldCount() { return SIDES.reduce((n, s) => n + (this.hands[s].hold != null ? 1 : 0), 0); }
  // 足が床（地面・安全区画）にあるか。肩の高さ 1.45m＝立った姿勢
  support() {
    let best = null;
    for (const sp of this.supports) {
      if (this.body.x < sp.x0 || this.body.x > sp.x1) continue;
      const feet = this.body.y - 1.45;
      if (feet >= sp.y - 0.06 && (!best || sp.y > best.y)) best = sp;
    }
    return best;
  }
  grounded() { const sp = this.support(); return !!sp && this.body.y - 1.45 - sp.y < 0.05; }

  // 方向 (dx,dy) に、手 s が伸ばせる最も自然な保持点を探す
  findTarget(s, dx, dy) {
    const h = this.hands[s], other = this.hands[s === 'L' ? 'R' : 'L'];
    const len = Math.hypot(dx, dy); if (len < 1e-6) return null;
    const ux = dx / len, uy = dy / len;
    const sh = this.shoulder(s);
    // 空いている手は肩の少し上から探す（だらりと下がった手の位置に左右されない）
    const from = h.reach ? h.reach.cur : h.hold == null ? { x: sh.x, y: sh.y + 0.25 } : { x: h.x, y: h.y };
    const otherHold = other.hold != null ? this.holds[other.hold] : null;
    let best = null, bestScore = Infinity;
    for (const c of this.index.near(from.x, from.y, 1.5)) {
      if (c.id === h.hold || (otherHold && c.id === otherHold.id) || !this.available(c.id)) continue;
      const vx = c.x - from.x, vy = c.y - from.y, d = Math.hypot(vx, vy);
      if (d < 0.18) continue;
      const cos = (vx * ux + vy * uy) / d;
      if (cos < 0.58) continue;                                    // ±55° 以内
      if (dist(c.x, c.y, sh.x, sh.y) > this.reach + 0.35) continue; // 肩から届く（身体が寄る分の余裕 0.35）
      if (otherHold && dist(c.x, c.y, otherHold.x, otherHold.y) > BODY.maxSpan) continue;
      const score = d * (1 + 1.6 * (1 - cos));
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // 手を保持点へ伸ばし始める（今の保持は離す）
  startReach(s, target) {
    const h = this.hands[s];
    if (h.hold != null) { this.events.push({ type: 'leave', side: s, hold: h.hold }); h.hold = null; }
    h.reach = { from: { x: h.x, y: h.y }, cur: { x: h.x, y: h.y }, to: target.id, t: 0 };
    this.events.push({ type: 'reach', side: s, hold: target.id });
  }
  grab(s, holdId) {
    const h = this.hands[s], hd = this.holds[holdId];
    h.hold = holdId; h.reach = null; h.x = hd.x; h.y = hd.y; h.idle = 0;
    this.events.push({ type: 'grab', side: s, hold: holdId });
  }
  // 外から解除（窓閉鎖・命中・自分で離す）。理由を残す
  release(s, reason) {
    const h = this.hands[s];
    if (h.hold == null && !h.reach) return false;
    const had = h.hold;
    h.hold = null; h.reach = null;
    this.events.push({ type: 'release', side: s, hold: had, reason });
    return true;
  }

  // クラシック操作の 1 tick。input = { L: {x,y}|null, R: {x,y}|null }（中立は null）
  stepClassic(dt, input, allowGrab = true) {
    for (const s of SIDES) {
      const h = this.hands[s], other = this.hands[s === 'L' ? 'R' : 'L'];
      const d = input[s];
      const supported = other.hold != null || this.grounded();
      if (d) {
        const dirKey = `${Math.round(d.x * 2)},${Math.round(d.y * 2)}`;
        const changed = this.lastDir[s] !== dirKey;
        this.lastDir[s] = dirKey;
        if (h.reach) {
          if (changed) { const t = this.findTarget(s, d.x, d.y); if (t) { h.reach.from = { ...h.reach.cur }; h.reach.to = t.id; h.reach.t = 0; } }
        } else if (h.hold != null) {
          // 片手で支えているときだけ、保持中の手を離して伸ばせる（両手が同時に離れない）
          if (changed && supported) { const t = this.findTarget(s, d.x, d.y); if (t) this.startReach(s, t); }
        } else {
          // 空いている手は倒している間ずっと探す（届く保持点が現れたら伸ばす）
          const t = this.findTarget(s, d.x, d.y); if (t) this.startReach(s, t);
        }
      } else {
        this.lastDir[s] = null;
      }
      // 伸ばしている手を動かす。中立に戻した時点で到達していれば保持（到達前に中立なら到達時に保持）
      if (h.reach) {
        const r = h.reach, tgt = this.holds[r.to];
        r.t = Math.min(1, r.t + dt / BODY.reachTime);
        const e = 1 - (1 - r.t) * (1 - r.t);
        r.cur = { x: r.from.x + (tgt.x - r.from.x) * e, y: r.from.y + (tgt.y - r.from.y) * e };
        h.x = r.cur.x; h.y = r.cur.y;
        if (r.t >= 1 && (!d || this.autoGrab) && allowGrab) {
          const sh = this.shoulder(s);
          if (this.available(tgt.id) && dist(tgt.x, tgt.y, sh.x, sh.y) <= this.reach + 0.45) this.grab(s, tgt.id);
          else { h.reach = null; this.events.push({ type: 'miss', side: s }); }
        }
      }
      if (h.hold != null) h.idle += dt;
      else if (!h.reach) {
        // 空いた手は肩の下へゆっくり戻る（腕を下ろして構える）
        const sh = this.shoulder(s), k = 1 - Math.exp(-dt * 6);
        h.x += (sh.x + sgn(s) * 0.08 - h.x) * k; h.y += (sh.y - 0.5 - h.y) * k;
      }
    }
    this.moveBody(dt);
  }

  // 身体の目標位置（両手保持なら 1 つの解）。両手でも移動量は 2 倍にならない（平均を目標にして速度で近づく）
  bodyTarget() {
    const L = this.hands.L, R = this.hands.R;
    const hl = L.hold != null, hr = R.hold != null;
    let tx = this.body.x, ty = this.body.y;
    if (hl && hr) { tx = (L.x + R.x) / 2; ty = Math.min((L.y + R.y) / 2, Math.min(L.y, R.y) + 0.25) - BODY.hangBelow; }
    else if (hl || hr) {
      const s = hl ? 'L' : 'R', h = this.hands[s], o = this.hands[hl ? 'R' : 'L'];
      tx = h.x - sgn(s) * BODY.shoulderHalf * 0.6; ty = h.y - BODY.hangOne;
      if (o.reach) { const t = this.holds[o.reach.to]; tx = tx * 0.65 + t.x * 0.35; ty = Math.max(ty, Math.min(h.y, t.y) - BODY.hangOne); }
    } else return null;
    const sp = this.support();
    if (sp) ty = Math.max(ty, sp.y + 1.45); // 床より下には沈まない
    return { x: tx, y: ty };
  }
  moveBody(dt) {
    let t = this.bodyTarget();
    if (t) {
      // 保持している手から肩が離れすぎていれば、それを解消する位置を目標にする（瞬間移動はせず、同じ速度上限で寄る）
      for (const s of SIDES) {
        const h = this.hands[s]; if (h.hold == null) continue;
        const sx = t.x + sgn(s) * BODY.shoulderHalf, ex = sx - h.x, ey = t.y - h.y, e = Math.hypot(ex, ey), lim = this.reach + 0.05;
        if (e > lim) t = { x: t.x - ex / e * (e - lim), y: t.y - ey / e * (e - lim) };
      }
      const v = BODY.climbSpeed * this.speedMul;
      const dx = t.x - this.body.x, dy = t.y - this.body.y, d = Math.hypot(dx, dy);
      const step = Math.min(d, v * dt);
      if (d > 1e-6) { this.body.x += dx / d * step; this.body.y += dy / d * step; }
    }
    this.mantle = this.hands.L.hold != null && this.hands.R.hold != null &&
      this.holds[this.hands.L.hold].kind === 'roof' && this.holds[this.hands.R.hold].kind === 'roof';
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
}
