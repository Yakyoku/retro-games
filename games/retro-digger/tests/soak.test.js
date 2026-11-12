// 連続プレイのシミュレーション（全 6 面 × 2D／3D）。主人公を無敵にしてでたらめに動かし、
// 例外・NaN・盤外が起きないこと、生きている敵が必ず主人公の近くまで来ること（到達不能な場所で止まらない）を確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../shared/config.js';
import { createGame2D, step } from '../shared/game2d.js';
import { createGame3D, step3d } from '../shared/game3d.js';
import { makeRng } from '../shared/rules.js';

const SECONDS = 150;
for (let si = 0; si < 6; si++) {
  test(`2D ${si + 1} 面: ${SECONDS} 秒の連続プレイで敵が止まらない`, () => {
    const g = createGame2D({ difficulty: 'normal', stageIndex: si, seed: 7 + si });
    const rng = makeRng(99 + si); const dirs = ['up', 'down', 'left', 'right', null];
    let dir = null; const reached = new Set();
    for (let i = 0; i < SECONDS / RULES.tick; i++) {
      if (i % 40 === 0) dir = dirs[rng.int(5)];
      g.player.guard = 99;
      step(g, { dir, pump: false });
      for (const e of g.enemies.filter((x) => x.alive)) {
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
        assert.ok(e.x >= -0.01 && e.y >= -0.01 && e.x <= 13.01 && e.y <= 15.01, `盤外 ${e.x},${e.y}`);
        if (Math.abs(e.x - g.player.x) < 1.2 && Math.abs(e.y - g.player.y) < 1.2) reached.add(e.id);
      }
      if (g.phase !== 'play' && g.phase !== 'ready') break;
    }
    const alive = g.enemies.filter((e) => e.alive);
    for (const e of alive) assert.ok(reached.has(e.id), `敵 ${e.id}（${e.type}）が一度も近づかなかった`);
  });
  test(`3D ${si + 1} 面: ${SECONDS} 秒の連続プレイで敵が止まらない`, () => {
    const g = createGame3D({ difficulty: 'normal', stageIndex: si, seed: 11 + si });
    const rng = makeRng(5 + si); let mv = [0, 0]; const reached = new Set();
    for (let i = 0; i < SECONDS / RULES.tick; i++) {
      if (i % 60 === 0) { const a = rng.next() * 6.283; mv = rng.next() < 0.3 ? [0, 0] : [Math.cos(a) * 0.04, Math.sin(a) * 0.04]; }
      g.player.guard = 99;
      step3d(g, { move: mv, trigger: false, locomoting: !!mv[0] });
      for (const e of g.enemies) {
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.z));
        if (Math.hypot(e.x - g.player.bx, e.z - g.player.bz) < 2.6) reached.add(e.id);
      }
      if (g.phase !== 'play' && g.phase !== 'ready') break;
    }
    for (const e of g.enemies.filter((x) => x.alive)) assert.ok(reached.has(e.id), `敵 ${e.id}（${e.type}）が一度も近づかなかった`);
  });
}
