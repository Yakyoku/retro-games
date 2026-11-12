// 再現試験: 同じシード・同じ tick 入力なら、描画フレームレート（30/60/72/90/120/144Hz）が違っても同じ結果
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../shared/core/game.js';
import { makeRng } from '../shared/core/rng.js';
import { FixedStepper } from '../shared/core/stepper.js';

// tick 番号から決まる入力（記録された入力列の代わり）
function inputAt(tick) {
  const r = makeRng(tick * 2654435761);
  const ang = (k) => (Math.floor(tick / 45) * 1.7 + k) % (Math.PI * 2);
  return { r: { x: Math.cos(ang(0)) * (r.next() > 0.1 ? 1 : 0), y: Math.sin(ang(0)) }, b: { x: Math.cos(ang(2.1)), y: Math.sin(ang(2.1)) * (r.next() > 0.1 ? 1 : 0) } };
}
function runAt(hz, seconds, difficulty = 'normal') {
  const g = new Game({ difficulty, seed: 777 });
  const st = new FixedStepper();
  const frames = Math.round(hz * seconds);
  const hashes = new Map();
  for (let f = 0; f < frames; f++) {
    st.advance(1 / hz, () => { g.step(inputAt(g.tick + 1)); if (g.tick % 300 === 0) hashes.set(g.tick, g.hash()); });
  }
  return { g, hashes };
}

test('再現: 30/60/72/90/120/144Hz の描画で、同じ tick の状態が一致する', () => {
  const base = runAt(60, 40);
  assert.ok(base.hashes.size >= 7);
  for (const hz of [30, 72, 90, 120, 144]) {
    const o = runAt(hz, 40);
    for (const [tick, h] of base.hashes) if (o.hashes.has(tick)) assert.equal(o.hashes.get(tick), h, `${hz}Hz tick ${tick}`);
  }
});
test('再現: 同じシード・同じ入力列を 2 回流すと完全一致、シードを変えると違う', () => {
  const a = new Game({ seed: 1 }), b = new Game({ seed: 1 }), c = new Game({ seed: 2 });
  for (let t = 1; t <= 2400; t++) { const i = inputAt(t); a.step(i); b.step(i); c.step(i); }
  assert.equal(a.hash(), b.hash());
  assert.notEqual(a.hash(), c.hash());
});
test('固定 tick: 復帰時に大量の未処理時間を一気に進めない', () => {
  const st = new FixedStepper();
  let n = 0;
  st.advance(30, () => n++); // 30 秒止まっていた
  assert.ok(n <= st.maxSteps);
});
