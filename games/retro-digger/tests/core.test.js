// 重要なルールの自動テスト（node --test）。描画・音・ブラウザには依存しない部分。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, DIFFICULTIES, rockScore, TUNE3D } from '../shared/config.js';
import { makeInflate, inflateAir, inflateUpdate, makePump, pumpTick, makeScore, scoreDig, makeRockState, rockLoosen, rockTick, rockLand, rockAddKill } from '../shared/rules.js';
import { STAGES_2D, STAGES_3D, parse2D, parse3D } from '../shared/stages.js';
import { createGame2D, step, edgeOpen } from '../shared/game2d.js';
import { createGame3D, step3d, tryStep, raycastCells, cellCenter, digCell } from '../shared/game3d.js';

const tick = RULES.tick;
const run = (fn, sec) => { for (let i = 0; i < Math.round(sec / tick); i++) fn(); };

test('推奨初期設定（難易度ごとの残機・送気回数・予兆）', () => {
  assert.deepEqual(['easy', 'normal', 'hard'].map((d) => DIFFICULTIES[d].lives), [5, 3, 2]);
  assert.deepEqual(['easy', 'normal', 'hard'].map((d) => DIFFICULTIES[d].pumpsToPop), [3, 4, 5]);
  assert.deepEqual(['easy', 'normal', 'hard'].map((d) => DIFFICULTIES[d].warn), [1.0, 0.8, 0.6]);
  assert.equal(RULES.pumpInterval, 0.30); assert.equal(RULES.respawnGuard, 1.5);
});

test('落石の得点は 300×n×n（0 体なら 0）', () => {
  assert.deepEqual([0, 1, 2, 3].map(rockScore), [0, 300, 1200, 2700]);
});

test('膨張: 最終送気から 1.0 秒後に収縮開始、その後 0.5 秒ごとに 1 段階', () => {
  const inf = makeInflate();
  inflateAir(inf, 4); inflateAir(inf, 4);
  assert.equal(inf.stage, 2);
  let t = 0, events = [];
  while (inf.stage > 0 && t < 5) { const r = inflateUpdate(inf, tick); t += tick; if (r) events.push([r, +t.toFixed(2)]); }
  assert.equal(events[0][0], 'deflate'); assert.ok(Math.abs(events[0][1] - 1.5) < 0.03, `1 段階目 ${events[0][1]}`);
  assert.equal(events[1][0], 'recovered'); assert.ok(Math.abs(events[1][1] - 2.0) < 0.03);
});
test('膨張: 接続中は縮まない', () => {
  const inf = makeInflate(); inflateAir(inf, 4); inf.attached = true;
  run(() => inflateUpdate(inf, tick), 3);
  assert.equal(inf.stage, 1);
});

test('ポンプ: 連打でも長押しでも、送気は 0.30 秒より速くならない（二重に加速しない）', () => {
  for (const style of ['hold', 'mash']) {
    const enemy = { inf: makeInflate() };
    const p = makePump();
    const hooks = { advance: () => ({ hit: enemy, blocked: false }), valid: () => true, inflate: (e) => e.inf };
    const airs = [];
    let t = 0;
    for (let i = 0; i < Math.round(3 / tick); i++) {
      // mash: 2 tick ごとに押す／離す（毎秒 15 回）。hold: 押しっぱなし
      const pump = style === 'hold' ? true : (i % 4 < 2);
      pumpTick(p, { pump, moving: false }, tick, { range: 3, speed: 100, interval: RULES.pumpInterval, max: 99 }, hooks, (type) => { if (type === 'pump-air' || type === 'pop') airs.push(t); });
      t += tick;
    }
    for (let i = 1; i < airs.length; i++) assert.ok(airs[i] - airs[i - 1] >= RULES.pumpInterval - 1e-6, `${style}: 間隔 ${airs[i] - airs[i - 1]}`);
    assert.ok(airs.length >= 8, `${style}: 3 秒で ${airs.length} 回`);
  }
});

test('掘削: 同じセルは 1 回だけ 10 点', () => {
  const sc = makeScore();
  assert.equal(scoreDig(sc, '0:1:1'), 10); assert.equal(scoreDig(sc, '0:1:1'), 0); assert.equal(sc.score, 10);
});

test('岩: 支え喪失 → 予兆 → 落下 → 着地。得点は 1 回だけ', () => {
  const r = makeRockState(); const ev = [];
  assert.ok(rockLoosen(r)); assert.ok(!rockLoosen(r));
  run(() => rockTick(r, tick, 0.8, (t) => ev.push(t)), 0.85);
  assert.equal(r.state, 'fall');
  rockAddKill(r, 'a'); rockAddKill(r, 'b'); rockAddKill(r, 'a');
  assert.equal(rockLand(r, () => {}), 1200);
  assert.equal(rockLand(r, () => {}), 0);
});

test('ステージ: 2D・3D とも 6 面、3 種類の地層、開始位置と敵がある', () => {
  assert.equal(STAGES_2D.length, 6); assert.equal(STAGES_3D.length, 6);
  for (const set of [STAGES_2D, STAGES_3D]) assert.deepEqual([...new Set(set.map((s) => s.theme))].sort(), ['crystal', 'soil', 'volcano']);
  for (const st of STAGES_2D) {
    assert.ok(st.map.every((r) => r.length === 14) && st.map.length === 16, st.name);
    const b = parse2D(st); assert.ok(b.start, st.name); assert.ok(b.enemies.length >= 3, st.name);
    for (const r of b.rocks) assert.ok(!b.open[r.r * b.cols + r.c], `${st.name}: 岩は土の中`);
    // 敵の初期位置は主人公から通路で 5 歩以上（または、つながっていない）
    const dist = bfs2d(b, b.start);
    for (const e of b.enemies) { const d = dist[e.r * b.cols + e.c]; assert.ok(d < 0 || d >= 5, `${st.name}: 敵が開始位置に近すぎる (${d})`); }
  }
  for (const st of STAGES_3D) {
    assert.ok(st.map.every((r) => r.length === 13) && st.map.length === 13, st.name);
    const m = parse3D(st); assert.ok(m.start, st.name); assert.ok(m.enemies.length >= 3, st.name);
    for (const r of m.rocks) assert.ok(r.supports.length >= 1, `${st.name}: 岩 (${r.x},${r.z}) に支えがない`);
    for (const e of m.enemies) assert.ok(Math.abs(e.x - m.start.x) + Math.abs(e.z - m.start.z) >= 3, `${st.name}: 敵が近すぎる`);
  }
  // 敵の数だけでなく、火炎型が 5・6 面で増える
  const fires = STAGES_2D.map((s) => parse2D(s).enemies.filter((e) => e.type === 'fire').length);
  assert.ok(fires[4] >= 2 && fires[5] >= 2 && fires[0] === 0);
});
function bfs2d(b, s) {
  const d = new Int16Array(b.rows * b.cols).fill(-1); const q = [[s.c, s.r]]; d[s.r * b.cols + s.c] = 0;
  for (let i = 0; i < q.length; i++) { const [c, r] = q[i]; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= b.cols || nr >= b.rows || d[nr * b.cols + nc] >= 0 || !edgeOpen(b, c, r, nc, nr)) continue; d[nr * b.cols + nc] = d[r * b.cols + c] + 1; q.push([nc, nr]); } }
  return d;
}

test('2D: 掘ると通路とつながりができ、得点が入る', () => {
  const g = createGame2D({ difficulty: 'easy' });
  run(() => step(g, { dir: 'left', pump: false }), 2.2);
  assert.ok(g.score.score >= 30, `得点 ${g.score.score}`);
  const P = g.player; const c = Math.round(P.x), r = Math.round(P.y);
  assert.ok(edgeOpen(g.board, c, r, c + 1, r));
});

test('2D: 曲がるときは格子に寄せてから曲がる（角に引っ掛からない）', () => {
  const g = createGame2D({ difficulty: 'easy' });
  run(() => step(g, { dir: 'left', pump: false }), 1.3); // 開始の待ち 1.2 秒＋少し
  const x0 = g.player.x;
  run(() => step(g, { dir: 'down', pump: false }), 0.5);
  assert.equal(g.player.x, Math.round(g.player.x), '列にそろってから下へ');
  assert.ok(g.player.y > 7.5); assert.ok(Math.abs(g.player.x - x0) <= 0.5);
});

test('2D: 膨らんで止まっている敵に触れてもミスにならない／動く敵に触れると 1 回だけミス', () => {
  const g = createGame2D({ difficulty: 'normal' });
  run(() => step(g, { dir: null, pump: false }), 1.3);
  const e = g.enemies[0]; e.state = 'inflated'; e.inf.stage = 2; e.inf.attached = true;
  e.x = g.player.x; e.y = g.player.y;
  run(() => step(g, { dir: null, pump: false }), 0.2);
  assert.equal(g.phase, 'play');
  e.inf.stage = 0; e.inf.attached = false; e.state = 'walk'; e.x = g.player.x; e.y = g.player.y; e.tx = e.x; e.ty = e.y;
  const lives = g.lives; let misses = 0;
  run(() => { step(g, { dir: null, pump: false }); misses += g.events.filter((x) => x.type === 'miss').length; }, RULES.missDuration + 0.5);
  assert.equal(misses, 1); assert.equal(g.lives, lives - 1);
  assert.ok(g.player.guard > 0, '復活直後は保護');
});

test('2D: 全滅でクリア＋1000 点、倒した敵からは当たらない', () => {
  const g = createGame2D({ difficulty: 'normal' });
  run(() => step(g, { dir: null, pump: false }), 1.3);
  const s0 = g.score.score;
  for (const e of g.enemies) { e.alive = false; e.state = 'pop'; e.x = g.player.x; e.y = g.player.y; }
  step(g, { dir: null, pump: false });
  assert.equal(g.phase, 'clear'); assert.equal(g.score.score, s0 + 1000);
});

test('2D: 岩の下を掘って離れると、予兆の後に落ちて下の敵を倒す（300 点）', () => {
  const g = createGame2D({ difficulty: 'normal', stageIndex: 0 });
  const b = g.board; const rk = g.rocks.find((r) => r.c === 2 && r.r === 3);
  // 岩の真下を通路にし、敵を 1 体その下に置く
  for (const r of [4, 5]) b.open[r * b.cols + 2] = 1;
  const e = g.enemies[0]; e.x = 2; e.y = 5; e.tx = 2; e.ty = 5; e.state = 'inflated'; e.inf.stage = 1; e.inf.attached = true;
  g.phase = 'play';
  const s0 = g.score.score;
  run(() => step(g, { dir: null, pump: false }), 2.5);
  assert.notEqual(rk.state, 'held'); assert.equal(e.alive, false); assert.equal(e.state, 'crushed');
  assert.equal(g.score.score - s0 >= 300, true);
});

test('3D: 1 歩の移動は壁と敵を通り抜けない', () => {
  const g = createGame3D({ difficulty: 'normal' });
  const P = g.player;
  // 北（-z）は 2 セル先まで坑道、その先は岩の位置。西（-x）は土
  const w = tryStep(g, -1, 0, 1.2);
  assert.ok(!w || w.x - TUNE3D.playerRadius >= Math.floor(P.x / TUNE3D.cell) * TUNE3D.cell - 1e-6, '土の壁の中へは入らない');
  const e = g.enemies[0]; e.x = P.x; e.z = P.z - 1.0; e.state = 'walk';
  const s = tryStep(g, 0, -1, 1.2);
  assert.ok(!s || s.z > e.z + 0.5, '敵の手前で止まる');
});

test('3D: 視線は土のセルで止まり、外周の岩盤は掘れない', () => {
  const g = createGame3D({ difficulty: 'normal' });
  const P = g.player;
  const hit = raycastCells(g, [P.x, 1.5, P.z], [-1, 0, 0], 10);
  assert.ok(hit && hit.diggable && hit.t < 1.3);
  assert.ok(digCell(g, hit.gx, hit.gz)); assert.ok(!digCell(g, hit.gx, hit.gz), '同じセルは二度掘れない');
  // 1 面の 5 行目、東端の坑道 (11,5) から東へ: (12,5) は掘れる土、その先 (13,5) は外周の岩盤
  const [ex, ez] = cellCenter(11, 5);
  const h1 = raycastCells(g, [ex, 1.5, ez], [1, 0, 0], 10); assert.ok(h1 && h1.diggable && h1.gx === 12);
  digCell(g, 12, 5);
  const h2 = raycastCells(g, [ex, 1.5, ez], [1, 0, 0], 10); assert.ok(h2 && !h2.diggable && h2.gx === 13);
});

test('3D: 支えを掘ると岩が落ち、同じセルの敵 2 体で 1200 点（重複なし）', () => {
  const g = createGame3D({ difficulty: 'easy' });
  const rk = g.rocks[0];
  const [cx, cz] = cellCenter(rk.gx, rk.gz);
  g.phase = 'play';
  for (const e of g.enemies.slice(0, 2)) { e.x = cx + 0.3; e.z = cz; e.state = 'inflated'; e.inf.stage = 1; e.inf.attached = true; }
  const P = g.player; P.x = P.bx = cellCenter(rk.gx + 3, rk.gz)[0]; P.z = P.bz = cz; // 岩から離れた場所
  for (const i of rk.supports) digCell(g, i % g.map.w, (i / g.map.w) | 0);
  const s0 = g.score.score; let crush = 0;
  run(() => { step3d(g, { move: null, step: null, aim: null, trigger: false }); crush += g.events.filter((x) => x.type === 'rock-crush').length; }, 2.5);
  assert.equal(crush, 1); assert.equal(g.score.score - s0, 1200);
});

test('3D: ミス中・クリア後に二重のミスが起きない', () => {
  const g = createGame3D({ difficulty: 'normal' });
  run(() => step3d(g, { trigger: false }), 1.1);
  const P = g.player; let misses = 0;
  for (const e of g.enemies) { e.x = P.bx; e.z = P.bz; e.state = 'walk'; }
  run(() => { step3d(g, { trigger: false }); misses += g.events.filter((x) => x.type === 'miss').length; }, 1.0);
  assert.equal(misses, 1);
});

test('3D の縮尺はメートル基準（1 セル 2.4m・天井 2.7m）', () => { assert.equal(TUNE3D.cell, 2.4); assert.equal(TUNE3D.height, 2.7); });
