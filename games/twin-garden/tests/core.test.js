// 共通コアの試験（node --test tests/）
import test from 'node:test';
import assert from 'node:assert/strict';
import { properIntersect, pointInPoly, area, sweptMinDist } from '../shared/core/geom.js';
import { Rope } from '../shared/core/rope.js';
import { Game, findClosure, sameEdge } from '../shared/core/game.js';
import { STAGES, BONUS, LESSONS } from '../shared/core/stages.js';
import { C, BOARD, multiplier } from '../shared/core/config.js';

const P = (x, y) => ({ x, y });
const toward = (p, t) => { if (!t) return { x: 0, y: 0 }; const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy); return d < 0.04 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d }; };
function drive(g, rt, bt, max = 900) {
  const ev = [];
  for (let i = 0; i < max; i++) {
    g.step({ r: toward(g.red, rt), b: toward(g.blue, bt) });
    ev.push(...g.events);
    const ok = (p, t) => !t || Math.hypot(p.x - t.x, p.y - t.y) < 0.05;
    if (ok(g.red, rt) && ok(g.blue, bt)) break;
  }
  return ev;
}
function idle(g, n) { const ev = []; for (let i = 0; i < n; i++) { g.step({ r: P(0, 0), b: P(0, 0) }); ev.push(...g.events); } return ev; }
function playing(opts) { const g = new Game(opts); idle(g, 80); assert.equal(g.phase, g.kind === 'bonus' ? 'bonus' : 'play'); return g; }

// ───────── 幾何 ─────────
test('交差: 端点で接するだけ・平行な重なりは不成立', () => {
  assert.ok(properIntersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0)));
  assert.equal(properIntersect(P(0, 0), P(1, 1), P(1, 1), P(2, 0)), null);  // 端点で接する
  assert.equal(properIntersect(P(0, 0), P(2, 0), P(1, 0), P(3, 0)), null);  // 重なり
  assert.equal(properIntersect(P(0, 0), P(2, 0), P(1, 0), P(1, 1)), null);  // T 字で触れるだけ
});
test('内外判定: 境界上は許容誤差内なら内側', () => {
  const sq = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];
  assert.ok(pointInPoly(P(2, 2), sq));
  assert.ok(!pointInPoly(P(5, 2), sq));
  assert.ok(pointInPoly(P(4.03, 2), sq, 0.05));
  assert.ok(!pointInPoly(P(4.2, 2), sq, 0.05));
  // 凹形（コの字）のへこみは外側
  const U = [P(0, 0), P(6, 0), P(6, 6), P(4, 6), P(4, 2), P(2, 2), P(2, 6), P(0, 6)];
  assert.ok(!pointInPoly(P(3, 4), U));
  assert.ok(pointInPoly(P(1, 4), U));
});
test('掃引判定: 1 tick ですれ違う高速の敵もすり抜けない', () => {
  // 自機は止まっている。敵が 1 tick で 3 単位動いて自機の上を通過
  assert.ok(sweptMinDist(P(5, 5), P(5, 5), P(3.5, 5), P(6.5, 5)) < 0.01);
  assert.ok(sweptMinDist(P(5, 5), P(5, 5), P(3.5, 7), P(6.5, 7)) > 1.9);
});

// ───────── 閉領域 ─────────
test('閉領域: 単純な自己交差で輪を 1 つ切り出す', () => {
  // 赤(2,8) → 杭(6,2) → 杭(10,8)... 青(2,4) が赤の線分を横切る
  const w = [P(2, 8), P(6, 2), P(10, 8), P(1, 4)];
  const h = findClosure(w);
  assert.ok(h);
  assert.ok(area(h.poly) > 5);
  assert.equal(h.rest.length, 3);
});
test('閉領域: 8 の字は 2 つの小さい輪になり、盤面全体を捕まえない', () => {
  const w = [P(1, 1), P(5, 5), P(9, 1), P(13, 5), P(13, 1), P(9, 5), P(5, 1), P(1, 5)];
  const polys = [];
  let work = w;
  for (let i = 0; i < 8; i++) { const h = findClosure(work); if (!h) break; polys.push(h.poly); work = h.rest; }
  assert.ok(polys.length >= 2);
  for (const p of polys) assert.ok(area(p) < 0.1 * BOARD.area, `輪が大きすぎる: ${area(p)}`);
  // どの輪にも (20,15) は入らない
  for (const p of polys) assert.ok(!pointInPoly(P(20, 15), p));
});
test('閉領域: 接するだけ・重なるだけ・重複点は不成立', () => {
  assert.equal(findClosure([P(0, 0), P(4, 0), P(4, 4), P(4, 0.5)]), null);         // 折り返して重なる
  assert.equal(findClosure([P(0, 0), P(2, 0), P(2, 0), P(4, 0)]), null);            // 重複点
  assert.equal(findClosure([P(0, 0), P(3, 3), P(6, 0), P(9, 3)]), null);            // 交差なし
});
test('閉領域: 端が既存ラインに触れたら閉じる', () => {
  const h = findClosure([P(4, 4.05), P(2, 8), P(8, 8), P(8, 4), P(0, 4)]);
  assert.ok(h);
  assert.ok(pointInPoly(P(5, 6), h.poly));
});

// ───────── ライン ─────────
function line(a, b, step = 0.08) { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step); const o = []; for (let i = 1; i <= n; i++) o.push(P(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)); return o; }
const AROUND = [...line(P(8, 16), P(8, 4)), ...line(P(8, 4), P(16, 4)), ...line(P(16, 4), P(16, 16))];
test('ライン: 杭に掛かり、逆に動くと最後に掛かった杭から外れる', () => {
  const rope = new Rope([P(12, 9), P(14, 12)]);
  let r = P(8, 16); const b = P(12, 16);
  const seq = [];
  for (const p of AROUND) { rope.moveRed(r, p, b); r = p; const k = rope.anchors.map((a) => a.peg).join(','); if (seq[seq.length - 1] !== k) seq.push(k); }
  assert.deepEqual(seq, ['', '0', '1,0']);
  for (const p of [...AROUND].reverse().slice(1).concat([P(8, 16)])) { rope.moveRed(r, p, b); r = p; const k = rope.anchors.map((a) => a.peg).join(','); if (seq[seq.length - 1] !== k) seq.push(k); }
  assert.deepEqual(seq, ['', '0', '1,0', '0', ''], '最後に掛かった杭から外れていない');
});
test('ライン: 青の端からも同じ規則で掛かり・外れる', () => {
  const rope = new Rope([P(12, 9), P(14, 12)]);
  const r = P(12, 16); let b = P(8, 16);
  for (const p of AROUND) { rope.moveBlue(b, p, r); b = p; }
  assert.deepEqual(rope.anchors.map((a) => a.peg), [0, 1]);
  for (const p of [...AROUND].reverse().slice(1).concat([P(8, 16)])) { rope.moveBlue(b, p, r); b = p; }
  assert.equal(rope.anchors.length, 0);
});
test('ライン: 赤と青を同時に動かしても掛かり方が壊れない', () => {
  const g = playing({ difficulty: 'practice' }); // 練習 1: 杭(8,8)(16,8)
  drive(g, P(6, 3), P(18, 3));
  assert.equal(g.rope.anchors.length, 2);
  drive(g, P(9, 16.6), P(15, 16.6));
  assert.equal(g.rope.anchors.length, 0);
});

// ───────── ゲーム ─────────
test('捕獲: 両端が同じ辺に届くと、ラインと外周で閉じた中を捕まえる（倍率つき）', () => {
  const g = playing({ difficulty: 'practice' });
  drive(g, P(6, 0.4), null);
  const ev = drive(g, null, P(18, 0.4));
  const cap = ev.find((e) => e.type === 'capture');
  assert.ok(cap, '囲みが成立しない');
  assert.equal(cap.n, 6);
  assert.equal(cap.mult, 2);
  assert.equal(cap.points, 1200);
  assert.equal(g.rope.anchors.length, 0, '捕獲後にラインが張り直されていない');
  assert.ok(ev.some((e) => e.type === 'clear'));
});
test('倍率: min(2.0, 1+0.25(n-1))・端数切り捨て', () => {
  assert.equal(multiplier(1), 1); assert.equal(multiplier(2), 1.25); assert.equal(multiplier(5), 2); assert.equal(multiplier(9), 2);
});
test('捕獲と加点は 1 回だけ（同じ tick に 2 つの輪に入っても）', () => {
  const g = playing({ difficulty: 'normal' });
  const m = g.mush[0];
  const sq = (c, s) => [P(c.x - s, c.y - s), P(c.x + s, c.y - s), P(c.x + s, c.y + s), P(c.x - s, c.y + s)];
  g.detectLoops = () => [sq(m, 0.5), sq(m, 0.8)];
  g.step({ r: P(0, 0), b: P(0, 0) });
  const caps = g.events.filter((e) => e.type === 'capture');
  const total = caps.reduce((s, e) => s + e.items.filter((i) => i.kind === 'mush' && i.id === m.id).length, 0);
  assert.equal(total, 1);
});
test('処理順: 強化の成立と被弾が同じ tick → 被弾しない', () => {
  const g = playing({ difficulty: 'normal' });
  g.energy = 140;
  const pl = g.plants[0]; pl.grow = 2;
  const e = g.enemies[0]; e.x = g.red.x; e.y = g.red.y;
  g.detectLoops = () => [[P(pl.x - 0.5, pl.y - 0.5), P(pl.x + 0.5, pl.y - 0.5), P(pl.x + 0.5, pl.y + 0.5), P(pl.x - 0.5, pl.y + 0.5)]];
  g.moveEnemies = () => { e.x = g.red.x; e.y = g.red.y; };
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(g.events.some((x) => x.type === 'power'));
  assert.ok(!g.events.some((x) => x.type === 'miss'));
  assert.equal(g.phase, 'play');
});
test('処理順: 最後の 1 匹の捕獲と被弾が同じ tick → ミスを優先し、クリアしない', () => {
  const g = playing({ difficulty: 'normal' });
  for (const m of g.mush.slice(1)) m.alive = false;
  const m = g.mush[0];
  const e = g.enemies[0];
  g.moveEnemies = () => { e.x = g.blue.x; e.y = g.blue.y; };
  g.detectLoops = () => [[P(m.x - 0.6, m.y - 0.6), P(m.x + 0.6, m.y - 0.6), P(m.x + 0.6, m.y + 0.6), P(m.x - 0.6, m.y + 0.6)]];
  const lives = g.lives;
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(g.events.some((x) => x.type === 'miss'));
  assert.ok(!g.events.some((x) => x.type === 'clear'));
  assert.equal(g.lives, lives - 1);
});
test('ミス: 赤と青が同時に当たっても残機は 1 だけ減る・面の開始時の得点へ戻る・2 秒無敵', () => {
  const g = playing({ difficulty: 'normal' });
  const s0 = g.score;
  g.score += 999;
  const [e1, e2] = g.enemies;
  g.moveEnemies = () => { e1.x = g.red.x; e1.y = g.red.y; e2.x = g.blue.x; e2.y = g.blue.y; };
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.equal(g.lives, 2);
  assert.equal(g.events.filter((x) => x.type === 'miss').length, 1);
  delete g.moveEnemies;
  idle(g, 100);
  assert.equal(g.score, s0);
  assert.equal(g.energy, 100);
  assert.ok(g.mush.every((m) => m.alive));
  assert.ok(g.invulnT > 0);
});
test('ミス: エネルギー 0 でミス、残機 0 でゲームオーバー', () => {
  const g = playing({ difficulty: 'hard' });
  for (let k = 0; k < 3; k++) {
    g.enemies.forEach((e) => { e.alive = false; });
    g.energy = 0.01;
    g.step({ r: P(0, 0), b: P(0, 0) });
    assert.ok(g.events.some((x) => x.type === 'miss' && x.cause === 'energy'));
    idle(g, 200);
  }
  assert.equal(g.phase, 'gameover');
  assert.equal(g.lives, 0);
  assert.ok(g.result && !g.result.cleared);
});
test('植物: 芽のない地点を囲み直しても回復しない・10 秒で芽・20 秒で成熟', () => {
  const g = playing({ difficulty: 'normal' });
  g.enemies.forEach((e) => { e.alive = false; });
  const pl = g.plants[0];
  const sq = [P(pl.x - 0.5, pl.y - 0.5), P(pl.x + 0.5, pl.y - 0.5), P(pl.x + 0.5, pl.y + 0.5), P(pl.x - 0.5, pl.y + 0.5)];
  g.energy = 50;
  g.detectLoops = () => [sq]; g.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(Math.abs(g.energy - (50 + 25 - C.energyDrain / 60)) < 1e-6);
  const e1 = g.energy;
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(g.energy < e1, '芽がないのに回復した');
  g.detectLoops = () => [];
  idle(g, 600); assert.equal(pl.grow, 1);
  idle(g, 600); assert.equal(pl.grow, 2);
});
test('強化: 8 秒間は接触とエネルギー減少が止まり、終わるとエネルギー 100', () => {
  const g = playing({ difficulty: 'normal' });
  g.energy = 149; g.plants[0].grow = 2;
  const pl = g.plants[0];
  g.detectLoops = () => [[P(pl.x - 0.5, pl.y - 0.5), P(pl.x + 0.5, pl.y - 0.5), P(pl.x + 0.5, pl.y + 0.5), P(pl.x - 0.5, pl.y + 0.5)]];
  g.step({ r: P(0, 0), b: P(0, 0) });
  delete g.detectLoops;
  assert.equal(g.powerT, 480 - 1);
  const e = g.enemies[0];
  g.moveEnemies = () => { e.x = g.red.x; e.y = g.red.y; };
  const ev = idle(g, 478);
  assert.ok(!ev.some((x) => x.type === 'miss'));
  assert.equal(g.energy, 150);
  const ev2 = idle(g, 2);
  assert.ok(ev2.some((x) => x.type === 'powerEnd'));
});
test('宝: 大きい囲みはヒント、8% 以下で宝箱 → 6 つ集めるとボーナスへ', () => {
  const g = playing({ difficulty: 'normal' });
  g.enemies.forEach((e) => { e.alive = false; });
  const t = g.treasure;
  const sq = (s) => [P(t.x - s, t.y - s), P(t.x + s, t.y - s), P(t.x + s, t.y + s), P(t.x - s, t.y + s)];
  g.detectLoops = () => [sq(3.5)]; g.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(g.events.some((e) => e.type === 'hint'));
  assert.ok(!t.found);
  g.detectLoops = () => [sq(1)]; g.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(t.found && g.chest);
  g.detectLoops = () => [];
  idle(g, 60);
  assert.equal(g.gems.length, 6);
  // 6 つを順に囲む（敵なし）
  for (const gem of g.gems) {
    g.detectLoops = () => [[P(gem.x - 0.4, gem.y - 0.4), P(gem.x + 0.4, gem.y - 0.4), P(gem.x + 0.4, gem.y + 0.4), P(gem.x - 0.4, gem.y + 0.4)]];
    g.step({ r: P(0, 0), b: P(0, 0) });
    if (g.phase === 'clear') break;
  }
  assert.equal(g.phase, 'clear');
  assert.equal(g.pendingBonus, true);
  delete g.detectLoops;
  idle(g, 150);
  assert.equal(g.kind, 'bonus');
  assert.equal(g.bonus.type, STAGES[0].bonus);
});
test('クリア: 回収対象の全捕獲と宝の収集が同じ tick → ボーナスを優先し、遷移は 1 回', () => {
  const g = playing({ difficulty: 'normal' });
  g.enemies.forEach((e) => { e.alive = false; });
  g.mush.forEach((m) => { m.alive = false; });
  g.mush[0].alive = true;
  g.treasure.found = true; g.chest = { x: 5, y: 5, t: 99, spawned: true };
  g.gemsGot = 0b011111;
  g.gems = [{ id: 5, mark: 'bell', x: g.mush[0].x + 0.2, y: g.mush[0].y, px: 0, py: 0, vx: 0, vy: 0, alive: true }];
  const m = g.mush[0];
  g.detectLoops = () => [[P(m.x - 0.8, m.y - 0.8), P(m.x + 0.8, m.y - 0.8), P(m.x + 0.8, m.y + 0.8), P(m.x - 0.8, m.y + 0.8)]];
  g.moveGems = () => {};
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.equal(g.events.filter((e) => e.type === 'clear').length, 1);
  assert.equal(g.pendingBonus, true);
  delete g.detectLoops;
  const ev = idle(g, 400);
  assert.equal(ev.filter((e) => e.type === 'stage').length, 0, 'ボーナスを飛ばして次の面へ進んだ');
  assert.equal(g.kind, 'bonus');
});
test('ボーナス: 危険な敵なし・残機は減らない・20 秒で終わって次の面へ', () => {
  const g = new Game({ difficulty: 'normal' });
  g.loadBonus('harvest');
  const lives = g.lives;
  idle(g, 300);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.phase, 'bonus');
  g.drainMul; g.energy = 0.01; idle(g, 5);
  assert.equal(g.phase, 'bonus', 'ボーナス中にミスになった');
  const ev = idle(g, 60 * 22);
  assert.ok(ev.some((e) => e.type === 'bonusEnd'));
  assert.ok(ev.some((e) => e.type === 'stage' && e.number === 2));
  assert.equal(g.lives, lives);
});
test('ボーナス: 記憶・精密は小さく囲むと得点、大きいとヒントだけ', () => {
  const g = new Game({ difficulty: 'normal' });
  g.loadBonus('memory'); idle(g, 140);
  const s = g.bonus.spot;
  g.detectLoops = () => [[P(s.x - 4, s.y - 4), P(s.x + 4, s.y - 4), P(s.x + 4, s.y + 4), P(s.x - 4, s.y + 4)]];
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.equal(g.bonus.points, 0);
  g.detectLoops = () => [[P(s.x - 1, s.y - 1), P(s.x + 1, s.y - 1), P(s.x + 1, s.y + 1), P(s.x - 1, s.y + 1)]];
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.equal(g.bonus.points, 3000);
  assert.equal(g.phase, 'bonusEnd');
  const h = new Game({ difficulty: 'normal' });
  h.loadBonus('precision'); idle(h, 140);
  const t = BONUS.precision.targets[0];
  h.detectLoops = () => [[P(t.x - 1, t.y - 1), P(t.x + 1, t.y - 1), P(t.x + 1, t.y + 1), P(t.x - 1, t.y + 1)]];
  h.step({ r: P(0, 0), b: P(0, 0) });
  assert.ok(h.bonus.points > 500 && h.bonus.k === 1);
});
test('最終面: 12 面のあとは最終結果（ボーナスがあればボーナスのあと）', () => {
  const g = new Game({ difficulty: 'normal', startStage: 11 });
  idle(g, 80);
  g.enemies.forEach((e) => { e.alive = false; });
  g.mush.forEach((m) => { m.alive = false; });
  g.gemsGot = 63;
  g.step({ r: P(0, 0), b: P(0, 0) });
  assert.equal(g.pendingBonus, true);
  idle(g, 60 * 30);
  assert.equal(g.phase, 'complete');
  assert.ok(g.result.cleared);
});
test('入力解除: 再開直後に押しっぱなしの入力では動かず、一度離すと動く', () => {
  const g = new Game({ difficulty: 'normal' });
  for (let i = 0; i < 100; i++) g.step({ r: P(1, 0), b: P(0, 0) });
  const x0 = g.red.x;
  for (let i = 0; i < 10; i++) g.step({ r: P(1, 0), b: P(0, 0) });
  assert.equal(g.red.x, x0);
  g.step({ r: P(0, 0), b: P(0, 0) });
  for (let i = 0; i < 10; i++) g.step({ r: P(1, 0), b: P(0, 0) });
  assert.ok(g.red.x > x0);
});
test('斜め入力は正規化（斜めだけ速くならない）・盤外へは出ない', () => {
  const g = playing({ difficulty: 'practice' });
  const x0 = g.red.x, y0 = g.red.y;
  for (let i = 0; i < 30; i++) g.step({ r: P(1, -1), b: P(0, 0) });
  assert.ok(Math.abs(Math.hypot(g.red.x - x0, g.red.y - y0) - 2.5) < 1e-6);
  for (let i = 0; i < 600; i++) g.step({ r: P(-1, 1), b: P(0, 0) });
  assert.equal(g.red.x, C.playerRadius); assert.equal(g.red.y, BOARD.h - C.playerRadius);
});
test('外周: 線が張っていない（杭なし）両端が辺に並んでも囲みにならない', () => {
  const g = playing({ difficulty: 'practice' });
  const ev = drive(g, P(9, 17.9), P(15, 17.9));
  assert.ok(sameEdge(g.red, g.blue) === 2);
  assert.ok(!ev.some((e) => e.type === 'capture'));
});

// ───────── ステージ ─────────
test('ステージ: 12 面・配分・敵の初期距離・配置の妥当性・ボーナス 3 種', () => {
  assert.equal(STAGES.length, 12);
  const want = (i) => i < 4 ? [20, 2, 0] : i < 8 ? [24, 2, 1] : [28, 2, 2];
  const layouts = new Set();
  for (const s of STAGES) {
    const [m, p, c] = want(s.index);
    assert.equal(s.mush.length, m, `${s.number}面 回収対象`);
    assert.equal(s.patrol.length, p, `${s.number}面 巡回`);
    assert.equal(s.chase.length, c, `${s.number}面 追跡`);
    assert.ok(s.pegs.length >= 4, `${s.number}面 杭が少ない`);
    assert.ok(s.plants.length >= 3, `${s.number}面 植物が少ない`);
    const starts = [s.start.red, s.start.blue];
    const spawns = [...s.patrol.map((pa) => pa[0]), ...s.chase];
    for (const e of spawns) for (const st of starts) assert.ok(Math.hypot(e.x - st.x, e.y - st.y) >= C.enemyMinStartDist, `${s.number}面 敵が出発点に近い`);
    for (const path of s.patrol) for (const q of path) assert.ok(q.x >= 0.4 && q.x <= 23.6 && q.y >= 0.4 && q.y <= 17.6);
    const inside = (q, m2) => q.x >= m2 && q.x <= BOARD.w - m2 && q.y >= m2 && q.y <= BOARD.h - m2;
    for (const q of [...s.mush, ...s.plants, s.treasure]) {
      assert.ok(inside(q, 0.8), `${s.number}面 盤の端に近すぎる ${JSON.stringify(q)}`);
      for (const pg of s.pegs) assert.ok(Math.hypot(q.x - pg.x, q.y - pg.y) >= 0.6, `${s.number}面 杭と重なる`);
    }
    layouts.add(JSON.stringify(s.pegs));
  }
  assert.equal(layouts.size, 12, '杭の配置が重複している面がある');
  assert.deepEqual(new Set(STAGES.map((s) => s.bonus)), new Set(['memory', 'precision', 'harvest']));
  assert.equal(LESSONS.length, 3);
});
test('ステージ: どの面も、出発点からの操作で最初の囲みが成立する（上辺へ回り込む）', () => {
  for (let i = 0; i < 12; i++) {
    const g = new Game({ difficulty: 'normal', startStage: i });
    idle(g, 80);
    g.enemies.forEach((e) => { e.alive = false; });
    drive(g, P(1, 0.3), null, 1200);
    const ev = drive(g, null, P(23, 0.3), 1200);
    assert.ok(ev.some((e) => e.type === 'capture' && e.items.length > 0), `${i + 1}面: 囲めない`);
  }
});
