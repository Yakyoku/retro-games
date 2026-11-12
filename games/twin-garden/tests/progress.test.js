// 通し試験: 12 面とボーナスを順に進めて最終結果まで行く・ランダム操作の長時間耐久（例外・NaN・進行不能がない）
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../shared/core/game.js';
import { makeRng } from '../shared/core/rng.js';
import { BOARD } from '../shared/core/config.js';

const Z = { r: { x: 0, y: 0 }, b: { x: 0, y: 0 } };

test('進行: 12 面すべてを順に通り、宝のある面はボーナスを経て最終結果へ（遷移は各 1 回）', () => {
  const g = new Game({ difficulty: 'normal', seed: 5 });
  const seen = g.events.filter((e) => e.type === 'stage').map((e) => `S${e.number}`); // 1 面の開始は作った時点で出る
  let guard = 0;
  while (g.phase !== 'complete' && guard++ < 200000) {
    g.step(Z);
    for (const e of g.events) if (['stage', 'bonusStart', 'complete', 'clear', 'gameover'].includes(e.type)) seen.push(e.type === 'stage' ? `S${e.number}` : e.type === 'bonusStart' ? `B:${e.type && g.bonus.type}` : e.type);
    if (g.phase === 'play') {
      g.enemies.forEach((e) => { e.alive = false; });
      // 偶数面は宝を集めて（ボーナスへ）、奇数面は回収対象を全部とってクリア
      if (g.def.number % 2 === 0) g.gemsGot = 63; else g.mush.forEach((m) => { m.alive = false; });
    }
  }
  assert.equal(g.phase, 'complete');
  const stages = seen.filter((s) => s.startsWith('S'));
  assert.deepEqual(stages, Array.from({ length: 12 }, (_, i) => `S${i + 1}`));
  assert.equal(seen.filter((s) => s.startsWith('B:')).length, 6);
  assert.equal(seen.filter((s) => s === 'clear').length, 12);
  assert.equal(seen.filter((s) => s === 'complete').length, 1);
  assert.ok(!seen.includes('gameover'));
});

test('耐久: ランダム操作で各難易度 20 分ずつ（72000 tick）— 例外・NaN・盤外・不正なラインがない', () => {
  for (const diff of ['practice', 'easy', 'normal', 'hard']) {
    const g = new Game({ difficulty: diff, seed: 99 });
    const r = makeRng(1234);
    let restarts = 0, held = Z;
    for (let t = 0; t < 72000; t++) {
      if (t % 20 === 0) held = { r: { x: r.range(-1, 1), y: r.range(-1, 1) }, b: { x: r.range(-1, 1), y: r.range(-1, 1) } };
      g.step(held);
      if (g.phase === 'gameover' || g.phase === 'complete') { restarts++; Object.assign(g, new Game({ difficulty: diff, seed: 99 + restarts })); }
      for (const p of [g.red, g.blue]) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert.ok(p.x >= 0 && p.x <= BOARD.w && p.y >= 0 && p.y <= BOARD.h);
      }
      assert.ok(Number.isFinite(g.energy) && Number.isFinite(g.score));
      assert.ok(g.rope.anchors.length < 200, 'ラインの杭の列が増え続けている');
      for (const a of g.rope.anchors) assert.ok(a.peg >= 0 && a.peg < g.pegs.length);
    }
  }
});
