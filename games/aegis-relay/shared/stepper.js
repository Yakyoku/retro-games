// AEGIS RELAY — 固定 60Hz の論理と可変の描画レートをつなぐ（60/72/90/120/144Hz で同じゲーム時間）
// advance(dt) は実時間 dt 秒ぶん step を呼び、補間係数 alpha（0..1）を返す。
// 大きな dt（タブ復帰など）は 0.25 秒で頭打ちにし、一度に何十 tick も進めない。
import { HZ } from './rules.js';
export function makeStepper(stepFn, hz = HZ) {
  const dtStep = 1 / hz;
  let acc = 0;
  return {
    advance(dt) {
      acc += Math.min(0.25, Math.max(0, dt));
      let n = 0;
      while (acc >= dtStep && n < 15) { stepFn(); acc -= dtStep; n++; }
      if (n >= 15) acc = 0;
      return acc / dtStep;
    },
    reset() { acc = 0; },
  };
}
