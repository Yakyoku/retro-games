// 自動操縦。テストでは「通常の操作入力だけ」で全書類を集めて出口まで行けるかを確かめる（ワープやクリア状態への書き換えはしない）。
// タイトル画面のデモ演技にも使う。
import { CAR_W, FLOOR_H, level, floorOf } from './const.js';

export class Autopilot {
  constructor(game, { shoot = false } = {}) {
    this.g = game; this.shoot = shoot;
    this.tap = {}; this.engage = new Map(); this.wait = 0; this.stuck = 0; this.lastX = 0; this.log = [];
  }

  // 階どうしのつながり（昇降路・エスカレーター）で最短経路
  route(from, to) {
    const g = this.g;
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const f = q.shift();
      if (f === to) break;
      const nb = [];
      for (const c of g.cars) if (f >= c.lo && f <= c.hi) for (let k = c.lo; k <= c.hi; k++) if (k !== f) nb.push([k, { kind: 'car', car: c, to: k }]);
      for (const e of g.stage.escalators) {
        if (e.upper === f) nb.push([f - 1, { kind: 'esc', esc: e, dir: -1, to: f - 1 }]);
        if (e.upper - 1 === f) nb.push([f + 1, { kind: 'esc', esc: e, dir: 1, to: f + 1 }]);
      }
      for (const [k, edge] of nb) if (!prev.has(k)) { prev.set(k, { f, edge }); q.push(k); }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let f = to; prev.get(f); f = prev.get(f).f) path.unshift(prev.get(f).edge);
    return path;
  }

  goal() {
    const g = this.g, p = g.player;
    const pf = floorOf(p.y);
    const docs = g.doors.filter((d) => d.kind === 'doc' && !d.collected);
    if (!docs.length) return { floor: g.stage.exit.floor, x: g.stage.exit.x, kind: 'exit' };
    let best = null;
    for (const d of docs) {
      const r = this.route(pf, d.floor);
      const cost = r ? r.length * 10 + Math.abs(d.floor - pf) : 1e9;
      if (!best || cost < best.cost) best = { cost, d };
    }
    return { floor: best.d.floor, x: best.d.x, kind: 'doc', door: best.d };
  }

  press(k) { this.tap[k] = 2; }

  // 床の上で x まで歩く。間に「かごの居ない穴」があれば、呼んでから渡る
  walkTo(inp, x) {
    const g = this.g, p = g.player;
    const f = floorOf(p.y);
    const dir = Math.sign(x - p.x);
    if (Math.abs(x - p.x) < 0.12) return true;
    for (const c of g.cars) {
      if (f < c.lo || f > c.hi) continue;
      const between = (c.x - p.x) * dir > 0 && (x - c.x) * dir > -CAR_W / 2;
      if (!between) continue;
      const present = Math.abs(c.y - level(f)) < 0.02 && c.state === 'stopped';
      if (present) continue;
      const edgeX = c.x - dir * (CAR_W / 2 + 0.45);
      if (Math.abs(p.x - edgeX) > 0.15 && (edgeX - p.x) * dir > 0) { this.hold(inp, Math.sign(edgeX - p.x)); return false; }
      if (!c.auto && Math.abs(c.target - level(f)) > 0.02) this.press('up');
      return false; // かご待ち
    }
    this.hold(inp, dir);
    return false;
  }
  hold(inp, dir) { if (dir > 0) inp.right = true; else if (dir < 0) inp.left = true; }

  input() {
    const g = this.g, p = g.player;
    const inp = {};
    for (const k of Object.keys(this.tap)) { if (this.tap[k] === 2) inp[k] = true; this.tap[k]--; if (this.tap[k] <= 0) delete this.tap[k]; }
    if (p.state !== 'play' || g.phase !== 'play' || !p.grounded) return inp;
    if (this.shoot) {
      const e = g.enemies.find((q) => q.alive && Math.abs(q.y - p.y) < 0.6 && Math.abs(q.x - p.x) < 9 && q.state !== 'spawn'
        && !g.coverBlocks(p.x, q.x, p.y + 0.72) && (this.engage.get(q.id) || 0) < 3);
      if (e) {
        this.engage.set(e.id, (this.engage.get(e.id) || 0) + 1 / 60);
        if (Math.sign(e.x - p.x) !== p.face) { this.hold(inp, Math.sign(e.x - p.x)); return inp; }
        inp.fire = true;
        if (e.stance === 'crouch' && !(p.support && p.support.kind === 'car')) inp.down = true;
        if (e.state === 'windup' && !e.lowShot) inp.down = true;
        return inp;
      }
    }
    const goal = this.goal();
    const pf = floorOf(p.y);
    const inCar = p.support && p.support.kind === 'car';
    if (pf === goal.floor && !inCar) {
      if (this.walkTo(inp, goal.x)) {
        if (goal.kind === 'doc') this.press('up');
      }
      return inp;
    }
    const r = this.route(pf, goal.floor);
    if (!r || !r.length) {
      // 乗ったまま目的階に着いた
      if (inCar && pf === goal.floor) this.walkTo(inp, goal.x);
      return inp;
    }
    const e = r[0];
    if (e.kind === 'esc') {
      const ex = e.dir < 0 ? e.esc.xTop : e.esc.xBot;
      if (this.walkTo(inp, ex)) this.press(e.dir < 0 ? 'down' : 'up');
      return inp;
    }
    const c = e.car;
    // 目的のかごの中にいる → 上下を押し続け、目標階が決まったら離す
    if (inCar && p.support.car === c) {
      const tf = this.lastLegTo(r, c);
      if (Math.abs(c.target - level(tf)) > 0.02) { if (c.auto) return inp; if (c.y < level(tf)) inp.up = true; else inp.down = true; }
      if (Math.abs(p.x - c.x) > 0.3) this.hold(inp, Math.sign(c.x - p.x));
      return inp;
    }
    if (inCar && !this.carAligned(p.support.car)) return inp;
    // かごへ向かう
    const present = Math.abs(c.y - level(pf)) < 0.02 && c.state === 'stopped';
    if (present) { this.walkTo(inp, c.x); return inp; }
    const side = Math.sign(p.x - c.x) || -1;
    const edgeX = c.x + side * (CAR_W / 2 + 0.45);
    if (this.walkTo(inp, edgeX) && !c.auto && Math.abs(c.target - level(pf)) > 0.02) this.press('up');
    return inp;
  }
  carAligned(c) { return c.state === 'stopped' && Math.abs(c.y / FLOOR_H - Math.round(c.y / FLOOR_H)) < 0.01; }
  // 同じかごで続けて進める区間はまとめる
  lastLegTo(r, c) { let t = r[0].to; for (const e of r) { if (e.kind === 'car' && e.car === c) t = e.to; else break; } return t; }
}
