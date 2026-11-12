// 重要な不具合を見つけるためのテスト: 書類・得点・状態遷移、移動床（かご）・死亡と復帰、到達性
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../shared/core/game.js';
import { Autopilot } from '../shared/core/autopilot.js';
import { STAGES, getStage, servesFloor } from '../shared/core/stages.js';
import { level, CAR_W, SCORE, DIFF } from '../shared/core/const.js';

const run = (g, sec, inputFn = () => ({}), fps = 60) => { for (let t = 0; t < sec; t += 1 / fps) { g.step(1 / fps, inputFn(t)); g.drainEvents(); } };

test('全ステージ: 書類 6 件（チュートリアル 2 件）・上中下層に分散・全階が昇降路かエスカレーターでつながる', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const st = getStage(i);
    const docs = Object.values(st.floor).flatMap((f) => f.doors.filter((d) => d.kind === 'doc'));
    assert.equal(docs.length, i === 0 ? 2 : 6, st.id);
    if (i > 0) {
      for (const [hi, lo] of [[30, 21], [20, 11], [10, 1]]) assert.equal(docs.filter((d) => d.floor <= hi && d.floor >= lo).length, 2, `${st.id} band ${hi}`);
    }
    // 床どうしの連結（BFS）
    const seen = new Set([st.start.floor]); const q = [st.start.floor];
    while (q.length) {
      const f = q.shift();
      const nb = [];
      for (const s of st.shafts) if (servesFloor(s, f)) for (let k = s.lo; k <= s.hi; k++) nb.push(k);
      for (const e of st.escalators) { if (e.upper === f) nb.push(f - 1); if (e.upper - 1 === f) nb.push(f + 1); }
      for (const k of nb) if (!seen.has(k)) { seen.add(k); q.push(k); }
    }
    assert.equal(seen.size, st.floors, `${st.id} 全階に到達できる`);
    // ドア・書類が昇降路の穴の上に無い
    for (let f = 1; f <= st.floors; f++) for (const d of st.floor[f].doors) {
      for (const s of st.shafts) if (servesFloor(s, f)) assert.ok(Math.abs(s.x - d.x) > CAR_W / 2 + 0.5, `${st.id} ${f}F door on pit`);
    }
    // 同じ列の昇降路が重ならない
    for (const a of st.shafts) for (const b of st.shafts) if (a !== b && a.x === b.x) assert.ok(a.lo > b.hi + 1 || a.hi < b.lo - 1, `${st.id} shafts overlap`);
  }
});

test('3 棟は色違いではなく構造が違う（昇降路の列・本数・エスカレーター・書類の階）', () => {
  const sig = [1, 2, 3].map((i) => { const s = getStage(i); return JSON.stringify([s.shafts.map((x) => [x.x, x.lo, x.hi]), s.escalators.map((e) => [e.upper, e.xTop])]); });
  assert.equal(new Set(sig).size, 3);
});

for (let i = 0; i < STAGES.length; i++) {
  test(`通常の操作入力だけで攻略できる（敵なし）: ${STAGES[i].id}`, () => {
    const g = new Game({ stageIndex: i, noEnemies: true });
    const bot = new Autopilot(g);
    let t = 0;
    while (g.phase !== 'clear' && t < 600) { g.step(1 / 60, bot.input()); g.drainEvents(); t += 1 / 60; }
    assert.equal(g.phase, 'clear');
    assert.equal(g.docsGot, g.docTotal);
    assert.equal(g.score, g.docTotal * SCORE.doc + SCORE.clear, '書類と脱出だけの得点（二重加点が無い）');
  });
  test(`敵ありでも（無敵で）出口まで進行不能にならない・低フレームレート 20fps: ${STAGES[i].id}`, () => {
    const g = new Game({ stageIndex: i, invincible: true });
    const bot = new Autopilot(g, { shoot: true });
    let t = 0;
    while (g.phase !== 'clear' && t < 900) { g.step(1 / 20, bot.input()); g.drainEvents(); t += 1 / 20; }
    assert.equal(g.phase, 'clear');
  });
}

test('書類が足りないと出口でクリアにならず、残りの階を知らせる', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const p = g.player;
  p.x = g.stage.exit.x - 2; p.y = 0; p.lastSafe = { x: p.x, y: 0 };
  const evs = [];
  for (let t = 0; t < 2; t += 1 / 60) { g.step(1 / 60, { right: true }); evs.push(...g.drainEvents()); }
  assert.equal(g.phase, 'play');
  const need = evs.find((e) => e.type === 'needDocs');
  assert.ok(need); assert.equal(need.left, 2); assert.deepEqual(need.floors, [5, 2]);
});

test('書類は 1 回だけ取れる（同じドアで ↑ を連打しても二重取得しない）', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const d = g.doors.find((q) => q.kind === 'doc');
  const p = g.player; p.x = d.x; p.y = level(d.floor);
  let on = false;
  for (let t = 0; t < 5; t += 1 / 60) { on = !on; g.step(1 / 60, { up: on }); g.drainEvents(); }
  assert.equal(g.docsGot, 1); assert.equal(g.score, SCORE.doc); assert.ok(d.collected);
});

test('かごに普通に乗って上下しても死なない・目的階でぴったり止まる・乗客が床に埋まらない', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const c = g.cars[0]; // 9m 列、4..6 階、6 階に待機
  const p = g.player; p.x = c.x; p.y = level(6);
  run(g, 0.2);
  run(g, 0.5, () => ({ down: true }));
  run(g, 4);
  assert.equal(p.state, 'play'); assert.equal(g.phase, 'play');
  assert.ok(Math.abs(c.y - level(5)) < 1e-6 || Math.abs(c.y - level(4)) < 1e-6, 'かごが階にそろって止まる');
  assert.ok(Math.abs(p.y - c.y) < 1e-6, '乗客はかごの床の上');
  const before = c.y;
  run(g, 0.4, () => ({ up: true }));
  run(g, 3);
  assert.ok(c.y > before); assert.equal(p.state, 'play');
});

test('走行中のかごから歩いて出られない（かごの壁）', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const c = g.cars[0]; const p = g.player; p.x = c.x; p.y = level(6);
  run(g, 0.1);
  run(g, 0.6, () => ({ down: true, right: true }));
  assert.ok(Math.abs(p.x - c.x) <= CAR_W / 2, 'かごの中にとどまる');
});

test('呼び出し: 穴の手前で ↑ を押すとかごが来て、渡れる', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const c = g.cars[1]; // 6m 列、1..3 階、1 階に待機
  const p = g.player; p.y = level(3); p.x = c.x + CAR_W / 2 + 0.5; p.lastSafe = { x: p.x, y: p.y };
  run(g, 0.1); run(g, 0.05, () => ({ up: true })); run(g, 4);
  assert.ok(Math.abs(c.y - level(3)) < 1e-6, 'かごが 3 階に来た');
  run(g, 2.5, () => ({ left: true }));
  assert.ok(p.x < c.x - CAR_W / 2, '穴を渡れた'); assert.equal(p.state, 'play');
});

test('穴に落ちる: 1 階ぶん下のかごの屋根なら無事、深い穴はミス', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const c = g.cars[0]; c.y = c.target = level(4); // かごは 4 階 → 屋根は 5 階の床の高さ
  const p = g.player; p.y = level(6); p.x = c.x - CAR_W / 2 - 0.4; p.lastSafe = { x: p.x, y: p.y };
  run(g, 0.3, () => ({ right: true })); run(g, 1);
  // 6 階 → 5 階の高さ（かごの屋根）へ 3m 落下 → 無事
  assert.equal(g.phase, 'play'); assert.ok(Math.abs(p.y - level(5)) < 1e-6); assert.equal(p.support.kind, 'roof');
  // 屋根に乗ったまま上昇すると挟まれる
  const g2 = new Game({ stageIndex: 0, noEnemies: true });
  const c2 = g2.cars[0]; c2.y = c2.target = level(4); const p2 = g2.player;
  p2.inv = 0; p2.y = level(5); p2.x = c2.x; p2.support = { kind: 'roof', car: c2 }; p2.grounded = true;
  c2.target = level(5);
  run(g2, 0.2);
  assert.equal(g2.phase, 'dead', 'かごの屋根に乗ったまま上昇すると挟まれる');
  assert.equal(g2.player.deadCause, 'crush');
  // 深い穴: 4 階ぶん以上ある昇降路で、かごが一番下にいるとき最上階から落ちる（9m 以上）
  const g3 = new Game({ stageIndex: 1, noEnemies: true });
  const c3 = g3.cars.find((c) => c.hi - c.lo >= 4); c3.y = c3.target = level(c3.lo);
  const p3 = g3.player; p3.y = level(c3.hi); p3.x = c3.x + CAR_W / 2 + 0.3; p3.lastSafe = { x: p3.x + 1, y: p3.y };
  run(g3, 0.3, () => ({ left: true })); run(g3, 2);
  assert.equal(g3.player.deadCause, 'fall');
});

test('屋根の上にいる敵は、かごを上げると挟まれて 300 点（昇降機による撃破）', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const c = g.cars[0]; c.y = c.target = level(4);
  const e = g.addEnemy(c.x, level(5), 0, 'patrol');
  e.stance = 'stand';
  const p = g.player; p.x = c.x; p.y = level(4); p.support = { kind: 'car', car: c };
  run(g, 0.05);
  run(g, 0.3, () => ({ up: true }));
  run(g, 0.5);
  assert.equal(e.alive, false); assert.equal(e.cause, 'env'); assert.equal(g.score, SCORE.env);
  assert.equal(g.phase, 'play', '乗っているプレイヤーは無事');
});

test('ミス → 残機が減り、安全な地点に無敵つきで復帰。書類とスコアは保持。残機 0 でゲームオーバー', () => {
  const g = new Game({ stageIndex: 0, difficulty: 'normal', noEnemies: true });
  g.docsGot = 1; g.score = 777;
  const p = g.player;
  g.eBullets.push({ x: p.x + 2, y: p.y + 1.35, z: 0, dir: -1, speed: 6.5, life: 5 });
  p.inv = 0;
  run(g, 1);
  assert.equal(g.phase, 'dead');
  run(g, 2);
  assert.equal(g.phase, 'play'); assert.equal(g.lives, DIFF.normal.lives - 1);
  assert.ok(p.inv > 0); assert.equal(g.eBullets.length, 0); assert.equal(g.docsGot, 1); assert.equal(g.score, 777);
  for (let k = 0; k < 2; k++) { p.inv = 0; g.die('shot'); run(g, 2); }
  assert.equal(g.phase, 'gameover');
});

test('しゃがむと高い弾をよけ、低い弾はジャンプでよけられる', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const p = g.player; p.inv = 0; p.x = 3;
  g.eBullets.push({ x: 7, y: p.y + 1.35, z: 0, dir: -1, speed: 6.5, life: 5 });
  run(g, 1.5, () => ({ down: true }));
  assert.equal(g.phase, 'play', 'しゃがみで回避');
  g.eBullets.push({ x: 5.6, y: p.y + 0.42, z: 0, dir: -1, speed: 6.5, life: 5 });
  run(g, 0.2); run(g, 0.05, () => ({ jump: true })); run(g, 1);
  assert.equal(g.phase, 'play', 'ジャンプで回避');
});

test('同一撃破は最も高い 1 種類だけ加点（キックと射撃が同時なら 200 点）', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const e = g.addEnemy(5, g.player.y, 0); e.state = 'alert';
  g.hit(e, 'shot'); g.hit(e, 'kick'); g.hit(e, 'shot');
  g.resolveKills();
  assert.equal(g.score, SCORE.kick); assert.equal(g.kills, 1);
  g.hit(e, 'shot'); g.resolveKills();
  assert.equal(g.score, SCORE.kick, '倒れた敵には加点しない');
});

test('照明を撃つと落ちて下の敵を倒す（300 点）', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const l = g.byFloor[6].lights[0];
  const e = g.addEnemy(l.x, level(6), 0); e.state = 'patrol'; e.dir = 1; e.turnT = 99; e.stance = 'stand';
  g.vrHitLight(l.id);
  run(g, 1);
  assert.equal(l.state, 'broken'); assert.equal(e.alive, false); assert.equal(e.cause, 'env'); assert.equal(g.score, SCORE.env);
});

test('壁越し・別の階への射撃は起きない（弾は同じ階の高さのまま飛び、外壁で消える）', () => {
  const g = new Game({ stageIndex: 0, noEnemies: true });
  const p = g.player; p.inv = 0;
  const e = g.addEnemy(p.x + 6, level(5), 0); e.state = 'alert'; e.fireCd = 0;
  run(g, 3);
  assert.equal(g.eBullets.length, 0); assert.equal(g.phase, 'play');
});

test('出現と同時に撃たない（出現から最初の弾まで 1 秒以上）', () => {
  const g = new Game({ stageIndex: 1, difficulty: 'hard' });
  const p = g.player; p.inv = 99;
  const d = { x: p.x + 6, floor: 30, kind: 'normal', tele: 0.01, cooldown: 0, open: 0 };
  g.doors.push(d);
  let spawnAt = null, shotAt = null;
  for (let t = 0; t < 4; t += 1 / 60) {
    g.step(1 / 60, {});
    for (const ev of g.drainEvents()) { if (ev.type === 'spawn' && spawnAt == null) spawnAt = t; if (ev.type === 'eshot' && shotAt == null && spawnAt != null) shotAt = t; }
  }
  assert.ok(spawnAt != null);
  if (shotAt != null) assert.ok(shotAt - spawnAt >= 1.0, `${shotAt - spawnAt}`);
});
