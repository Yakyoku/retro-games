// 固定 tick の時計。描画の経過時間を貯めて 1/60 秒ずつ step を呼ぶ。alpha は描画の補間係数（前 tick → 今 tick）。
// タブ復帰などで大きな経過時間が来ても、一度に進めるのは maxSteps tick まで（残りは捨てる）。
import { DT } from './config.js';

export class FixedStepper {
  constructor(maxSteps = 6) { this.acc = 0; this.maxSteps = maxSteps; this.alpha = 0; }
  reset() { this.acc = 0; this.alpha = 0; }
  advance(dtSec, stepFn) {
    if (!(dtSec > 0)) dtSec = 0;
    this.acc += Math.min(dtSec, this.maxSteps * DT);
    let n = 0;
    // 浮動小数の誤差で 1 tick 落とさないよう、わずかな余裕を見る
    while (this.acc >= DT - 1e-9 && n < this.maxSteps) { stepFn(); this.acc -= DT; n++; }
    if (this.acc < 0) this.acc = 0;
    if (n === this.maxSteps && this.acc > DT) this.acc = 0;
    this.alpha = Math.min(1, this.acc / DT);
    return n;
  }
}
