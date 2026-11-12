// 固定ステップの駆動（描画 FPS に関係なく 1 秒 60 tick）。
// タブ復帰などの巨大な経過時間は maxCatchUp tick までしか処理しない（一気に進めない）。
import { TICK } from './config.js';

export class FixedStep {
  constructor({ maxCatchUp = 5 } = {}) { this.acc = 0; this.maxCatchUp = maxCatchUp; this.last = null; this.alpha = 0; }
  reset() { this.acc = 0; this.last = null; }
  // now: 秒。step() を必要な回数呼び、補間係数 alpha（0..1）を返す
  advance(now, step, paused = false) {
    if (this.last === null) { this.last = now; return this.alpha = 0; }
    let dt = now - this.last; this.last = now;
    if (dt < 0) dt = 0;
    if (paused) { this.acc = 0; return this.alpha = 0; }
    this.acc += Math.min(dt, TICK * this.maxCatchUp);
    let n = 0;
    while (this.acc >= TICK - 1e-9 && n < this.maxCatchUp) { step(); this.acc -= TICK; n++; }
    if (n >= this.maxCatchUp) this.acc = Math.min(this.acc, TICK);
    return this.alpha = Math.max(0, Math.min(1, this.acc / TICK));
  }
}
