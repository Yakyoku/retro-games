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

test('飛ぶ敵は速度が一瞬で変わらない（1 tick の速度変化 ≤ 1.2u/s）: 弧を描いて曲がる', async () => {
  const { spawnEnemy } = await import('../shared/game-core.js');
  for (const type of ['drifter', 'hookjaw', 'skimmer', 'nit', 'dart', 'bulwark', 'spore', 'lantern', 'coilworm']) {
    const s = createGame({ invincible: true, seed: 5 });
    s.spawnIdx = s.stage.spawns.length; s.scrollSpeed = 0;
    for (let k = 0; k < 60; k++) step(s, {});
    s.player.x = 6; s.player.y = 4;
    const e = spawnEnemy(s, { type, y: 12, top: true, x: 0, sx: type === 'hookjaw' ? undefined : 28, fromLeft: type === 'hookjaw' }, 0, type === 'nit' || type === 'dart' || type === 'spore' ? { x: 20, y: 12 } : undefined);
    let px = e.x, py = e.y, pvx = null, pvy = null, worst = 0;
    for (let k = 0; k < 240 && !e.dead; k++) {
      step(s, {}); if (e.dead) break;
      const vx = (e.x - px) * 60, vy = (e.y - py) * 60; px = e.x; py = e.y;
      if (pvx != null && k > 2) worst = Math.max(worst, Math.hypot(vx - pvx, vy - pvy));
      pvx = vx; pvy = vy;
    }
    assert.ok(worst <= 1.2, `${type}: 1 tick の速度変化 ${worst.toFixed(2)}u/s`);
  }
});

test('僚機はばねで自機の上下に付き従い、少し遅れて落ち着く（NaN にならない）', () => {
  const s = createGame({ invincible: true });
  for (let k = 0; k < 50; k++) step(s, {});
  s.items.push({ id: 1, kind: 'B', x: s.player.x, y: s.player.y, px: 0, py: 0, t: 0 });
  step(s, {});
  let maxLag = 0;
  for (let k = 0; k < 90; k++) { step(s, { y: k < 30 ? 1 : 0 }); const b = s.bits[0]; assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y)); maxLag = Math.max(maxLag, Math.abs(b.y - (s.player.y + 1.7))); }
  const b = s.bits[0];
  assert.ok(maxLag > 0.05, '遅れがない（硬すぎる）');
  assert.ok(Math.abs(b.y - (s.player.y + 1.7)) < 0.05 && Math.abs(b.x - (s.player.x - 0.15)) < 0.05, '落ち着かない');
});

test('自機は復帰・面の開始で左端から減速しながら所定位置へ入る', () => {
  const s = createGame({ invincible: true });
  const xs = []; for (let k = 0; k < 45; k++) { step(s, k < 40 ? { x: 1 } : {}); xs.push(s.player.x); }
  assert.ok(xs[0] < 0, '左端の外から'); assert.ok(Math.abs(xs[44] - 4) < 1e-6, '4u で止まる');
  const v0 = xs[1] - xs[0], v1 = xs[38] - xs[37]; assert.ok(v0 > v1 * 3, '減速している');
});
