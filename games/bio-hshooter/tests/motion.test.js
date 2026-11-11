// 動きのなめらかさのための仕組みの点検
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../shared/game-core.js';
import { makeFrameClock } from '../shared/frame-clock.js';

test('部位（ボスの節）と砲の向きは前 tick の値を持つ（描画で補間できる）', () => {
  const s = createGame({ stage: 1, invincible: true });
  let n = 0; while (!s.boss && n++ < 60 * 400) step(s, {});
  for (let k = 0; k < 120; k++) step(s, {});
  const b = s.boss;
  const moved = b.parts.filter((q) => q.pox != null && (q.pox !== q.ox || q.poy !== q.oy));
  assert.ok(b.parts.every((q) => q.pox != null), '全部位に pox がある');
  assert.ok(moved.length > 5, '動いている部位がある');
  // 1 tick の移動量は小さい（補間で十分になめらかになる量）
  for (const q of b.parts) assert.ok(Math.hypot(q.ox - q.pox, q.oy - q.poy) < 1.0, '1 tick で 1u 以上跳ぶ部位がない');
});

test('フレーム時計: ±1ms のゆれはならし、本当に遅れたフレームはそのまま返す', () => {
  const c = makeFrameClock();
  let t = 0; c(t);
  const out = [];
  for (let i = 0; i < 300; i++) { t += 1000 / 120 + (i % 2 ? 0.9 : -0.9); out.push(c(t)); }
  const tail = out.slice(100);
  const spread = Math.max(...tail) - Math.min(...tail);
  assert.ok(spread < 0.0006, 'ゆれが残っている: ' + spread);
  t += 50; assert.ok(Math.abs(c(t) - 0.05) < 1e-9, '遅れたフレームはそのまま');
});
