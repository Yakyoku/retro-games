// ルールの境界テスト（node --test tests/）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, addScore, debug } from '../shared/sim.js';
import { makeStepper } from '../shared/stepper.js';
import { buildArea, RECIPES } from '../shared/area-gen.js';
import { TUNING, SCORE, AREAS, FIELD } from '../shared/rules.js';

const idle = { mx: 0, my: 0, fire: false };
const run = (g, n, inp = idle) => { for (let i = 0; i < n; i++) step(g, typeof inp === 'function' ? inp(i) : inp); };
const drain = (g) => g.events.splice(0);

test('8 エリアすべて組み立てられ、エリアごとに地形と編隊が違う', () => {
  assert.equal(RECIPES.length, AREAS.length);
  const sigs = new Set();
  for (let i = 0; i < AREAS.length; i++) {
    const a = buildArea(i);
    assert.ok(a.islands.length >= 5 && a.waves.length >= 15, `area ${i}`);
    assert.ok(a.ground.some((o) => o.type === 'core'));
    assert.ok(a.ground.some((o) => o.type === 'dock'));
    assert.ok(a.ground.filter((o) => o.type === 'panel').length >= 8);
    assert.ok(a.ground.some((o) => o.type === 'sigil' && o.hidden));
    assert.ok(a.waves.some((w) => w.t === 'twin'));
    sigs.add(a.waves.map((w) => w.t).join() + a.islands.map((s) => Math.round(s.cx)).join());
  }
  assert.equal(sigs.size, AREAS.length);
});

test('決定的: 同じ入力なら同じ結果', () => {
  const inp = (i) => ({ mx: Math.sin(i / 40), my: Math.cos(i / 70) * 0.5, fire: i % 3 !== 0 });
  const a = createGame(), b = createGame();
  run(a, 3000, inp); run(b, 3000, inp);
  assert.equal(a.score, b.score); assert.equal(a.lives, b.lives); assert.equal(a.player.x, b.player.x);
});

test('描画レートが違っても同じゲーム時間・同じ連射数で進む', () => {
  const results = [60, 72, 90, 120, 144].map((hz) => {
    const g = createGame({ invincible: true });
    const st = makeStepper(() => step(g, { mx: 0, my: 0, fire: true }));
    for (let f = 0; f < hz * 10; f++) st.advance(1 / hz);
    return { ticks: g.tick, shots: g.stats.shots };
  });
  for (const r of results) { assert.ok(Math.abs(r.ticks - 600) <= 1, JSON.stringify(results)); assert.ok(Math.abs(r.shots - results[0].shots) <= 1); }
});

test('押し続けで連射。間隔は設定どおり', () => {
  const g = createGame({ invincible: true });
  run(g, 120, { mx: 0, my: 0, fire: true });
  const expect = Math.floor(120 / TUNING.shot.interval);
  assert.ok(Math.abs(g.stats.shots - expect) <= 2, `${g.stats.shots} vs ${expect}`);
});

test('自機は盤面の外へ出ない', () => {
  const g = createGame({ invincible: true });
  run(g, 400, { mx: -1, my: -1, fire: false });
  assert.equal(g.player.x, TUNING.player.minX); assert.equal(g.player.y, TUNING.player.minY);
  run(g, 600, { mx: 1, my: 1, fire: false });
  assert.equal(g.player.x, TUNING.player.maxX); assert.equal(g.player.y, TUNING.player.maxY);
});

test('被弾 1 回で 1 機。同じ tick に 2 発当たっても 1 機だけ減る', () => {
  const g = createGame(); run(g, 60);
  const p = g.player; p.invuln = 0; p.entering = 0; g.calm = 0;
  for (let k = 0; k < 3; k++) g.bullets.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: 0, vy: 0, r: 2.4, dead: false });
  step(g, idle);
  assert.equal(g.lives, TUNING.lives - 1); assert.equal(p.alive, false);
  run(g, TUNING.deathDelay + 2);
  assert.equal(g.player.alive, true); assert.ok(g.player.invuln > 0); assert.equal(g.bullets.length, 0);
});

test('残機 0 でゲームオーバー、スコアが確定する', () => {
  const g = createGame(); g.lives = 1; run(g, 60);
  const p = g.player; p.invuln = 0; p.entering = 0;
  g.bullets.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: 0, vy: 0, r: 2.4, dead: false });
  run(g, TUNING.deathDelay + 5);
  assert.equal(g.mode, 'over');
  assert.ok(g.events.some((e) => e.t === 'gameover'));
});

test('エクステンドは各しきい値で 1 回だけ', () => {
  const g = createGame();
  addScore(g, TUNING.extend.first - 1);
  assert.equal(g.lives, TUNING.lives);
  addScore(g, 1); assert.equal(g.lives, TUNING.lives + 1);
  addScore(g, 10); assert.equal(g.lives, TUNING.lives + 1);
  addScore(g, TUNING.extend.every * 2); assert.equal(g.lives, TUNING.lives + 3);
  assert.equal(g.events.filter((e) => e.t === 'extend').length, 3);
});

test('支援機: 格納庫を壊す → 接触で合体 → 撃墜で解除', () => {
  const g = createGame({ invincible: false }); run(g, 30);
  const p = g.player; p.entering = 0;
  g.partner = { x: p.x, y: p.y - 5, px: p.x, py: p.y - 5, t: 30 };
  step(g, idle);
  assert.equal(p.docked, true);
  run(g, 10, { mx: 0, my: 0, fire: true });
  assert.ok(g.shots.length >= 3, '3 列の弾');
  p.invuln = 0; g.bullets.push({ x: p.x, y: p.y, px: p.x, py: p.y, vx: 0, vy: 0, r: 2.4, dead: false });
  step(g, idle);
  assert.equal(p.docked, false);
});

test('ジェミニ: 合体前に両方壊すと SPLIT BREAK、合体すると LOCKED', () => {
  const g = createGame({ invincible: true }); drain(g);
  step(g, idle);
  // 合体前に撃破
  const key = 999; g.twins[key] = { merged: false, resolved: false };
  const L = { id: 1, type: 'twinL', mv: 'twin', key, side: -1, x0: 0, x: 60, y: 70, px: 60, py: 70, hp: 1, r: 10, t: 10, dead: false, vx: 0, vy: 0 };
  const R = { ...L, id: 2, type: 'twinR', side: 1, x: 180, px: 180 };
  g.enemies.push(L, R);
  const s0 = g.score;
  g.shots.push({ x: 60, y: 80, px: 60, py: 80, vx: 0, vy: -400, r: 2.4 }, { x: 180, y: 80, px: 180, py: 80, vx: 0, vy: -400, r: 2.4 });
  step(g, idle);
  assert.ok(g.events.some((e) => e.t === 'twinBreak'));
  assert.ok(g.score - s0 >= SCORE.twinBreak);
  // 合体させる
  const g2 = createGame({ invincible: true }); step(g2, idle);
  g2.twins[5] = { merged: false, resolved: false };
  g2.enemies.push({ ...L, key: 5, hp: 6, t: TUNING.twin.mergeTicks + 1 }, { ...R, key: 5, hp: 6, t: TUNING.twin.mergeTicks + 1 });
  step(g2, idle);
  assert.ok(g2.events.some((e) => e.t === 'twinLocked'));
  assert.ok(g2.enemies.some((e) => e.type === 'twinM'));
  assert.ok(!g2.events.some((e) => e.t === 'twinBreak'));
});

function placeOnScreen(g, type, pred = () => true) {
  const d = g.def.ground.filter((o) => o.type === type && pred(o));
  return d;
}

test('ラティス: 8 枚を間を空けずに壊すとボーナス、時間切れで途切れる', () => {
  const g = createGame({ invincible: true });
  const panels = placeOnScreen(g, 'panel', (o) => o.chainId === 0).sort((a, b) => a.chainIdx - b.chainIdx);
  g.scroll = Math.max(...panels.map((o) => o.wy)) + 120;
  step(g, idle); drain(g);
  for (const d of panels) { const o = g.ground.get(d.gid); assert.ok(o, 'panel active'); g.shots.push({ x: o.x, y: o.y + 4, px: o.x, py: o.y + 4, vx: 0, vy: -10, r: 2.4 }); step(g, idle); }
  const evs = drain(g);
  assert.ok(evs.some((e) => e.t === 'chainBonus'), evs.map((e) => e.t).join());
  // 途切れる
  const g2 = createGame({ invincible: true });
  g2.scroll = g.scroll; step(g2, idle); drain(g2);
  const hit = (d) => { const o = g2.ground.get(d.gid); g2.shots.push({ x: o.x, y: o.y + 4, px: o.x, py: o.y + 4, vx: 0, vy: -10, r: 2.4 }); step(g2, idle); };
  hit(panels[0]); hit(panels[1]);
  for (let i = 0; i < TUNING.chain.gapTicks + 5; i++) { g2.scroll -= TUNING.scroll / 60; step(g2, idle); }
  hit(panels[2]);
  const e2 = drain(g2);
  assert.ok(e2.some((e) => e.t === 'chainFail'));
  assert.ok(!e2.some((e) => e.t === 'chainBonus'));
});

test('隠しシジル: 見えない場所へ規定回数撃ち込むと現れる', () => {
  const g = createGame({ invincible: true });
  const d = g.def.ground.find((o) => o.type === 'sigil');
  g.scroll = d.wy + 150; step(g, idle); drain(g);
  for (let k = 0; k < TUNING.sigil.hits; k++) { const o = g.ground.get(d.gid); g.shots.push({ x: o.x, y: o.y + 4, px: o.x, py: o.y + 4, vx: 0, vy: -10, r: 2.4 }); step(g, idle); }
  const evs = drain(g);
  assert.equal(evs.filter((e) => e.t === 'sigilPing').length, TUNING.sigil.hits);
  assert.ok(evs.some((e) => e.t === 'sigil'));
  assert.equal(g.stats.sigils, 1);
});

test('エリアコアを撃ち逃しても巻き戻して再挑戦でき、壊すと次のエリア → 8 の次は周回', () => {
  const g = createGame({ invincible: true });
  debug.skipToCore(g);
  run(g, 60 * 30);
  assert.ok(g.events.some((e) => e.t === 'coreMiss'), '撃ち逃し');
  assert.equal(g.area, 0);
  // 壊す
  const coreDef = g.def.ground.find((o) => o.type === 'core');
  for (let i = 0; i < 60 * 20 && g.area === 0; i++) {
    const o = g.ground.get(coreDef.gid);
    if (o && o.y > 10) g.shots.push({ x: o.x, y: o.y + 4, px: o.x, py: o.y + 4, vx: 0, vy: -10, r: 2.4 });
    step(g, idle);
  }
  assert.equal(g.area, 1);
  g.area = AREAS.length - 1; debug.nextArea(g);
  assert.equal(g.area, 0); assert.equal(g.loop, 1);
});

test('周回で難度が上がるが上限がある', async () => {
  const { difficulty } = await import('../shared/sim.js');
  const g = createGame();
  const d0 = difficulty(g); g.loop = 50; const d50 = difficulty(g);
  assert.ok(d50.spd > d0.spd && d50.spd <= TUNING.loop.speedCap);
  assert.ok(d50.fire < d0.fire && d50.fire >= TUNING.loop.fireCapMul);
});

test('無敵（デバッグ）を使った記録は汚れ扱い', () => {
  assert.equal(createGame({ invincible: true }).flags.tainted, true);
  assert.equal(createGame().flags.tainted, false);
});

test('長時間（30 分ぶん）回しても例外なく進み、配列が膨らまない', () => {
  const g = createGame({ invincible: true, autofire: true });
  let maxB = 0, maxE = 0;
  for (let i = 0; i < 60 * 60 * 30; i++) {
    const core = [...g.ground.values()].find((o) => o.type === 'core');
    const mx = core && core.y > 0 ? Math.max(-1, Math.min(1, (core.x - g.player.x) / 10)) : Math.sin(i / 50);
    step(g, { mx, my: Math.sin(i / 90) * 0.4, fire: true }); g.events.length = 0; maxB = Math.max(maxB, g.bullets.length); maxE = Math.max(maxE, g.enemies.length); }
  assert.ok(maxB < 300 && maxE < 80, `${maxB} ${maxE}`);
  assert.ok(g.area > 0 || g.loop > 0, '進んでいる');
  assert.ok(g.player.x >= 0 && g.player.x <= FIELD.W);
});
