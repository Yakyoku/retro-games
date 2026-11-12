import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectSolver } from '../src/core/direct.js';
import { Game } from '../src/core/game.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const run = (sv, frames, f) => { for (let i = 0; i < frames; i++) sv.update(1 / 72, f(i)); };

test('片手で 0.3m 引くと rig は 0.3m 上がる', () => {
  const sv = new DirectSolver({ x: 0, y: 0, z: 0.45 });
  sv.grab('R', 1, { x: 0.2, y: 1.8, z: -0.3 });
  run(sv, 30, (i) => ({ R: { x: 0.2, y: 1.8 - 0.3 * (i + 1) / 30, z: -0.3, valid: true } }));
  assert.ok(near(sv.offset.y, 0.3, 1e-6), String(sv.offset.y));
});

test('両手で同時に 0.3m 引いても移動は 0.3m（2 倍にならない）', () => {
  const sv = new DirectSolver({ x: 0, y: 0, z: 0.45 });
  sv.grab('L', 1, { x: -0.2, y: 1.8, z: -0.3 }); sv.grab('R', 2, { x: 0.2, y: 1.8, z: -0.3 });
  run(sv, 30, (i) => { const y = 1.8 - 0.3 * (i + 1) / 30; return { L: { x: -0.2, y, z: -0.3, valid: true }, R: { x: 0.2, y, z: -0.3, valid: true } }; });
  assert.ok(near(sv.offset.y, 0.3, 1e-6));
});

test('つかむ・離す瞬間に身体が跳ばない（1 フレームの変化が小さい）', () => {
  const sv = new DirectSolver({ x: 0, y: 0, z: 0.45 });
  sv.grab('L', 1, { x: -0.2, y: 1.8, z: -0.3 });
  run(sv, 30, (i) => ({ L: { x: -0.2, y: 1.8 - 0.4 * (i + 1) / 30, z: -0.3, valid: true }, R: { x: 0.2, y: 1.9, z: -0.3, valid: true } }));
  sv.grab('R', 2, { x: 0.2, y: 1.9, z: -0.3 });
  // 左手はさらに引き、右手は止める → 両手の項が食い違う
  run(sv, 20, (i) => ({ L: { x: -0.2, y: 1.4 - 0.2 * (i + 1) / 20, z: -0.3, valid: true }, R: { x: 0.2, y: 1.9, z: -0.3, valid: true } }));
  const before = sv.offset.y;
  sv.release('L');
  sv.update(1 / 72, { R: { x: 0.2, y: 1.9, z: -0.3, valid: true } });
  assert.ok(Math.abs(sv.offset.y - before) < 0.02, `jump ${sv.offset.y - before}`);
});

test('追跡の跳び（1 フレーム 1m）と追跡喪失からの復帰は移動量に使わない', () => {
  const sv = new DirectSolver({ x: 0, y: 0, z: 0.45 });
  sv.grab('R', 1, { x: 0.2, y: 1.8, z: -0.3 });
  sv.update(1 / 72, { R: { x: 0.2, y: 0.8, z: -0.3, valid: true } });
  assert.ok(near(sv.offset.y, 0), '跳びは無視');
  sv.update(1 / 72, { R: { valid: false } });
  sv.update(1 / 72, { R: { x: 0.9, y: 0.2, z: -0.3, valid: true } });
  assert.ok(near(sv.offset.y, 0) && near(sv.offset.x, 0), '復帰も無視');
  // 復帰後の普通の引きは効く
  run(sv, 10, (i) => ({ R: { x: 0.9, y: 0.2 - 0.1 * (i + 1) / 10, z: -0.3, valid: true } }));
  assert.ok(near(sv.offset.y, 0.1, 1e-6));
});

test('rig の移動が手の移動へ再加算されない（静止した手では rig も静止）', () => {
  const sv = new DirectSolver({ x: 0, y: 0, z: 0.45 });
  sv.grab('L', 1, { x: -0.2, y: 1.5, z: -0.3 });
  run(sv, 200, () => ({ L: { x: -0.2, y: 1.5, z: -0.3, valid: true } }));
  assert.ok(near(sv.offset.y, 0) && near(sv.offset.x, 0));
});

test('壁の裏や遠くの保持点にはつかまれない', () => {
  const g = new Game({ stageId: 'practice', control: 'direct', noHazards: true });
  const h = g.b.holds.find((k) => k.y > 0.6 && k.y < 0.8);
  const ox = g.solver.offset.x;
  assert.ok(g.findGrab({ x: h.x, y: h.y, z: 0.05 }), '表面ならつかめる');
  assert.equal(g.findGrab({ x: h.x, y: h.y, z: -0.2 }), null, '壁の裏');
  assert.equal(g.findGrab({ x: h.x + 0.4, y: h.y, z: 0.05 }), null, '遠い');
  assert.equal(g.findGrab({ x: h.x, y: h.y, z: 0.6 }), null, '手前すぎ');
  assert.ok(Number.isFinite(ox));
});

test('Game(direct): 握って引くと登り、離すと低い所では地面に降りるだけ', () => {
  const g = new Game({ stageId: 'practice', control: 'direct', noHazards: true });
  const h = g.b.holds.filter((k) => k.kind === 'sill' && k.floor === 0).sort((a, b) => Math.abs(a.x - g.solver.offset.x) - Math.abs(b.x - g.solver.offset.x))[0];
  const local = { x: h.x - g.solver.offset.x, y: h.y - g.solver.offset.y, z: 0.05 - g.solver.offset.z, valid: true };
  const head = { x: 0, y: 1.65, z: 0 };
  g.step({ head, ctrl: { R: { ...local, grip: true } } });
  assert.notEqual(g.climber.hands.R.hold, null);
  for (let i = 0; i < 30; i++) g.step({ head, ctrl: { R: { ...local, y: local.y - 0.5 * (i + 1) / 30, grip: true } } });
  assert.ok(g.solver.offset.y > 0.45, String(g.solver.offset.y));
  for (let i = 0; i < 90; i++) g.step({ head, ctrl: { R: { ...local, y: local.y - 0.5, grip: false } } });
  assert.equal(g.falls, 0);
  assert.ok(g.solver.offset.y < 0.05);
});
