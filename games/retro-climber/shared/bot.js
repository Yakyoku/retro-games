// 鉄骨レスキュー — 入力だけで操作する自動プレイ（テストとデモ用）。座標を書き換えない＝通常操作で通れることの確認になる。
// ルートは命令の列: ['walk', x] ['climb', ±1] ['runJump', dir, edgeX] ['act'] ['waitLift', liftIndex, yLo, yHi] ['walkOff', dir]
import { liftCars } from './core.js';

export const ROUTES = {
  girders: [['walk', 13.0], ['climb', 1], ['walk', 9.4], ['climb', 1], ['walk', 11.8], ['climb', 1], ['runJump', -1, 8.0],
    ['walk', 2.6], ['climb', 1], ['walk', 6.2], ['climb', 1], ['walk', 8.4], ['climb', 1]],
  conveyors: [['walk', 2.2], ['climb', 1], ['walk', 6.2], ['climb', 1], ['walk', 2.0], ['climb', 1], ['walk', 5.0], ['climb', 1], ['walk', 8.0], ['climb', 1]],
  elevators: [['walk', 3.3], ['waitLift', 0, -0.25, 0.15], ['jumpTo', 5.0], ['walk', 5.4], ['waitLift', 0, 7.25, 7.6, 'ride'], ['jumpTo', 7.4],
    ['walk', 8.25], ['waitLift', 1, 6.2, 6.6], ['jumpTo', 10.0], ['waitLift', 1, 3.45, 3.75, 'ride'], ['jumpTo', 12.0], ['walk', 14.2], ['climb', 1],
    ['walk', 12.4], ['climb', 1], ['walk', 14.4], ['climb', 1], ['runJump', -1, 10.9], ['walk', 7.0], ['climb', 1]],
  summit: [['walk', 3.0], ['climb', 1], ['walk', 11.0], ['act'], ['walk', 8.0], ['climb', 1], ['walk', 3.6], ['act'], ['walk', 9.6], ['climb', 1],
    ['walk', 12.0], ['act'], ['walk', 13.6], ['climb', 1], ['walk', 11.6], ['act']],
  tutorial: [['walk', 5.4], ['runJump', 1, 5.75], ['walk', 9.0], ['climb', 1], ['walk', 9.4], ['jumpBarrel'], ['walk', 11.0], ['walk', 11.2], ['smash'], ['walk', 15.0], ['act']],
};

export class Bot {
  constructor(route) { this.route = route.map((c) => c.slice()); this.i = 0; this.t = 0; this.prevJump = false; this.prevAct = false; this.phase = 0; }
  get done() { return this.i >= this.route.length; }
  next() { this.i++; this.t = 0; this.phase = 0; }
  input(g) {
    const p = g.player, o = { x: 0, y: 0, jump: false, act: false, grab: false };
    const c = this.route[this.i];
    this.t += 1 / 60;
    if (!c || g.phase !== 'play') return this.edge(o);
    const [cmd, a, b, d, e] = c;
    if (cmd === 'walk') {
      if (p.state !== 'ground') { return this.edge(o); }
      const dx = a - p.x;
      if (Math.abs(dx) < 0.06) this.next(); else o.x = Math.sign(dx) * Math.min(1, Math.abs(dx) * 4 + 0.3);
    } else if (cmd === 'climb') {
      if (this.phase === 0) { o.y = a; if (p.state === 'climb') this.phase = 1; else if (this.t > 0.5) { o.y = a; } }
      else { o.y = a; if (p.state === 'ground') this.next(); }
    } else if (cmd === 'runJump') {
      if (this.phase === 0) {
        if (p.state !== 'ground') return this.edge(o);
        o.x = a;
        if ((a > 0 && p.x >= b - 0.2) || (a < 0 && p.x <= b + 0.2)) { o.jump = true; this.phase = 1; }
      } else { o.x = a; if (p.state === 'ground' && this.t > 0.2) this.next(); }
    } else if (cmd === 'jumpNow') {
      if (this.phase === 0) { o.x = a; o.jump = true; this.phase = 1; }
      else { o.x = a; if (p.state === 'ground' && this.t > 0.2) this.next(); }
    } else if (cmd === 'jumpTo') {
      // 目標 x の上へ跳ぶ（近づいたら方向入力を離して空中で減速する）
      const dx = a - p.x;
      if (this.phase === 0) { o.x = Math.sign(dx); o.jump = true; this.phase = 1; }
      else { o.x = Math.abs(dx) > 0.35 ? Math.sign(dx) : 0; if (p.state === 'ground' && this.t > 0.2) this.next(); }
    } else if (cmd === 'jumpBarrel') {
      // 近づいてくる樽を待って跳び越す
      if (this.phase === 0) {
        const b = g.barrels.find((q) => Math.abs(q.y - p.y) < 0.5 && Math.sign(q.x - p.x) === Math.sign(q.dir * -1) && Math.abs(q.x - p.x) < 1.3);
        if (b && p.state === 'ground') { o.jump = true; this.phase = 1; this.dir = Math.sign(b.x - p.x); }
      } else { o.x = this.dir; if (p.state === 'ground' && this.t > 0.3) this.next(); }
    } else if (cmd === 'smash') {
      const b = g.barrels.find((q) => Math.abs(q.y - p.y) < 0.5 && (q.x - p.x) * p.facing > 0 && Math.abs(q.x - p.x) < 0.85);
      if (this.phase === 0 && b) { o.act = true; this.phase = 1; this.t = 0; this.target = b; }
      else if (this.phase === 1 && !g.barrels.includes(this.target)) this.next();
      else if (this.phase === 1 && this.t > 0.6) { this.phase = 0; }
    } else if (cmd === 'walkOff') {
      o.x = a; if (p.state === 'air') this.phase = 1; if (this.phase === 1 && p.state === 'ground') this.next();
    } else if (cmd === 'waitLift') {
      // ['waitLift', idx, yLo, yHi, 'ride']: 指定の昇降機の、自分に近い籠の上面が範囲に入るまで待つ
      const cars = liftCars(g).filter((q) => q.lift === g.lifts[a]);
      const ys = cars.map((q) => q.y0);
      if (e === 'ride') { if (p.state === 'ground' && p.y >= b && p.y <= c[3]) this.next(); }
      else if (ys.some((y) => y >= b && y <= c[3])) this.next();
    } else if (cmd === 'act') {
      if (this.phase === 0) { o.act = true; this.phase = 1; } else if (this.t > 0.2) this.next();
    } else if (cmd === 'wait') {
      if (this.t >= a) this.next();
    }
    return this.edge(o);
  }
  edge(o) {
    o.jumpPressed = o.jump && !this.prevJump; o.actPressed = o.act && !this.prevAct; o.grabPressed = false;
    this.prevJump = o.jump; this.prevAct = o.act;
    return o;
  }
}
