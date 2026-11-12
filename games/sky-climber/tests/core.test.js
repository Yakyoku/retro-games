import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.js';
import { STAGES, buildStage, FLOOR_H } from '../src/core/stages.js';
import { Game, Run } from '../src/core/game.js';
import { Hazards } from '../src/core/hazards.js';
import { DIFFICULTY, RULES } from '../src/core/config.js';
import { runBot, classicBot as classicBotFor } from './helpers.js';

test('乱数は seed で再現できる', () => {
  const a = makeRng(42), b = makeRng(42), c = makeRng(43);
  const sa = Array.from({ length: 5 }, a.next), sb = Array.from({ length: 5 }, b.next), sc = Array.from({ length: 5 }, c.next);
  assert.deepEqual(sa, sb); assert.notDeepEqual(sa, sc);
});

function connected(b, ok = () => true, step = 0.95) {
  const holds = b.holds.filter(ok);
  const start = holds.filter((h) => h.y < 2.3);
  const seen = new Set(start.map((h) => h.id)), q = [...start];
  while (q.length) {
    const h = q.pop();
    if (h.kind === 'roof') return true;
    for (const o of holds) if (!seen.has(o.id) && Math.hypot(o.x - h.x, o.y - h.y) <= step) { seen.add(o.id); q.push(o); }
  }
  return false;
}

for (const st of STAGES) {
  test(`${st.id}: 地上から屋上まで保持点がつながっている（間隔 0.95m 以内）`, () => {
    const b = buildStage(st);
    assert.ok(b.holds.length > 50);
    assert.ok(connected(b));
    // 窓の保持点を全部除いても（配管・帯・看板の縁だけで）つながる＝窓が閉じても必ず経路がある
    assert.ok(connected(b, (h) => h.win < 0), '窓以外の中継保持点だけでも屋上へ行ける');
  });
  test(`${st.id}: 障害の時間帯を 3 分ぶん進めても、各時刻で経路が残り、予告時間は難易度以上`, () => {
    for (const dk of Object.keys(DIFFICULTY)) {
      const d = DIFFICULTY[dk], b = buildStage(st), hz = new Hazards(b, d, st.seed);
      const player = { body: { x: 0, y: 1.45 }, hands: { L: { x: -0.3, y: 2, held: false }, R: { x: 0.3, y: 2, held: false } } };
      let warnStart = {}, minWarn = Infinity;
      for (let i = 0; i < 180 * 60; i++) {
        player.body.y = Math.min(b.top, 1.45 + i / 60 * 0.3);
        hz.step(1 / 60, player);
        for (const e of hz.takeEvents()) {
          if (e.type === 'windowWarn') warnStart[e.win] = hz.t;
          if (e.type === 'windowClose' && warnStart[e.win] != null) minWarn = Math.min(minWarn, hz.t - warnStart[e.win]);
          if (e.type === 'dropWarn') warnStart['d' + e.id] = hz.t;
          if (e.type === 'dropFall') minWarn = Math.min(minWarn, hz.t - warnStart['d' + e.id]);
        }
        if (i % 120 === 0) assert.ok(connected(b, (h) => hz.holdAvailable(h)), `t=${hz.t.toFixed(1)} で経路が切れた`);
      }
      if (minWarn !== Infinity) assert.ok(minWarn >= d.warn - 1 / 60 - 1e-9, `${dk}: 予告 ${minWarn} < ${d.warn}`);
    }
  });
}

test('同じ seed・同じ入力なら障害の展開は同じ', () => {
  const st = STAGES[3];
  const run = () => { const hz = new Hazards(buildStage(st), DIFFICULTY.standard, 7); const p = { body: { x: 0, y: 10 }, hands: { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } } };
    const ev = []; for (let i = 0; i < 3000; i++) { hz.step(1 / 60, p); ev.push(...hz.takeEvents().map((e) => e.type + e.id + (e.win ?? ''))); } return ev.join(','); };
  assert.equal(run(), run());
});

for (const id of ['practice', 'b1', 'b2', 'b3', 'b4']) {
  test(`${id}: クラシック操作のボットが障害なしで屋上へ着く`, () => {
    const g = runBot(new Game({ stageId: id, noHazards: true }), 900);
    assert.equal(g.state, 'clear', `state=${g.state} y=${g.climber.body.y.toFixed(2)} top=${g.top}`);
    assert.equal(g.falls, 0);
  });
}

test('クラシック: 両手が同時に離れない（片手で支えているときだけ伸ばせる）', () => {
  const g = new Game({ stageId: 'b1', noHazards: true });
  runBot(g, 6);
  const c = g.climber;
  // 上へ伸ばし続けても、両手が同時に保持を失うことはない
  let minHeld = 2;
  for (let i = 0; i < 300; i++) { g.step({ classic: { L: { x: 0, y: 1 }, R: { x: 0, y: 1 } } }); if (c.body.y > 3) minHeld = Math.min(minHeld, c.heldCount() + (c.hands.L.reach || c.hands.R.reach ? 1 : 0)); }
  assert.ok(minHeld >= 1);
  assert.notEqual(g.state, 'fall');
});

test('クラシック: 保持点のない方向に倒しても保持は維持される', () => {
  const g = new Game({ stageId: 'practice', noHazards: true });
  runBot(g, 4);
  const c = g.climber;
  for (let i = 0; i < 120 && c.heldCount() < 2; i++) g.step({ classic: {} });
  // 保持点の無い方向（真下の地面方向へ大きく）を探し、無ければ保持が残ることを確かめる
  const before = c.hands.L.hold;
  const orig = c.available; c.available = () => false; // すべての保持点が使えない状況
  g.step({ classic: { L: { x: -1, y: 0 }, R: null } });
  c.available = orig;
  assert.equal(c.hands.L.hold, before);
});

test('身体の移動は両手保持でも 2 倍にならず、跳ばない（1 tick の移動は速度上限以内）', () => {
  const g = new Game({ stageId: 'b2', noHazards: true });
  let maxStep = 0, prev = { ...g.climber.body };
  const b = classicBotFor(g);
  for (let i = 0; i < 60 * 120 && g.state === 'play'; i++) {
    g.step({ classic: b() });
    const c = g.climber.body; maxStep = Math.max(maxStep, Math.hypot(c.x - prev.x, c.y - prev.y)); prev = { ...c };
  }
  assert.ok(maxStep <= 1.35 / 60 + 1e-6, `max ${maxStep}`);
});

test('得点: 往復で高さ得点は増えない・コンボは左右交互の未到達の保持点だけ', () => {
  const g = new Game({ stageId: 'b1', noHazards: true });
  const c = g.climber, H = g.b.holds;
  const col = []; for (const h of H.filter((h) => Math.abs(h.x - c.body.x) < 0.6).sort((a, b) => a.y - b.y)) if (!col.length || h.y > col[col.length - 1].y + 0.2) col.push(h);
  const grab = (s, h) => { c.grab(s, h.id); g.scoreFromEvents(); };
  const s0 = g.run.score;
  grab('L', col[0]); grab('R', col[1]); assert.equal(g.combo, 2); assert.equal(g.run.score, s0);
  grab('L', col[2]); assert.equal(g.run.score - s0, 50);
  grab('R', col[3]); assert.equal(g.run.score - s0, 150);
  const s1 = g.run.score;
  grab('R', col[3]); assert.equal(g.run.score, s1, '同じ保持点の握り直しは対象外');
  grab('L', col[1]); assert.equal(g.run.score, s1, '下の保持点は対象外');
  // 高さ: 一度登ってから降りて登り直しても増えない
  c.body.y = 6; g.scoreFromEvents(); const s2 = g.run.score;
  c.body.y = 3; g.scoreFromEvents(); c.body.y = 6; g.scoreFromEvents();
  assert.equal(g.run.score, s2);
  c.body.y = 7.2; g.scoreFromEvents(); assert.equal(g.run.score - s2, 100);
  // 上限 200
  for (let i = 0; i < 6; i++) grab(i % 2 ? 'L' : 'R', col[5 + i]);
  assert.ok(g.combo >= 6);
});

test('命中: 同じ衝突は 1 回、命中後 1 秒は追加で外れない、両手保持なら命中側', () => {
  const g = new Game({ stageId: 'b1', noHazards: true });
  runBot(g, 6);
  const c = g.climber;
  for (let i = 0; i < 120 && c.heldCount() < 2; i++) g.step({ classic: {} });
  assert.equal(c.heldCount(), 2);
  const hz = g.hz;
  // 身体の右側に落下物を置く
  hz.items.push({ id: 999, kind: 'drop', item: 'pot', x: c.body.x + 0.2, y: c.body.y - 0.3, z: 0.3, phase: 'fall', vy: 0, spin: 0, rot: 0 });
  g.handleHits();
  assert.equal(c.hands.R.hold, null); assert.notEqual(c.hands.L.hold, null);
  const hits = g.hits;
  hz.items.push({ id: 1000, kind: 'drop', item: 'pot', x: c.hands.L.x, y: c.hands.L.y, z: 0.3, phase: 'fall', vy: 0, spin: 0, rot: 0 });
  g.handleHits();
  assert.equal(g.hits, hits, '無敵時間中は外れない');
  assert.notEqual(c.hands.L.hold, null);
});

test('両手を失う → 0.35 秒の猶予 → 落下で残機 -1 → 0 でゲームオーバー', () => {
  const run = { score: 0, lives: 1 };
  const g = new Game({ stageId: 'b1', noHazards: true, run });
  runBot(g, 12);
  assert.ok(g.climber.body.y > 3);
  g.releaseHand('L', 'hit'); g.releaseHand('R', 'hit');
  g.step({ classic: {} });
  assert.equal(g.state, 'grace');
  for (let i = 0; i < Math.ceil(RULES.regrabGrace * 60) + 1; i++) g.step({ classic: {} });
  assert.equal(g.state, 'fall'); assert.equal(run.lives, 0);
  for (let i = 0; i < 80; i++) g.step({ classic: {} });
  assert.equal(g.state, 'over');
});

test('練習は残機が減らない・低い所で両手を離しても地面に降りるだけ', () => {
  const g = new Game({ stageId: 'practice', noHazards: true });
  const lives = g.run.lives;
  // 地上で手を伸ばして低い窓台をつかみ、離す → 落下にならない
  for (let i = 0; i < 30; i++) g.step({ classic: { L: { x: 0, y: -1 }, R: null } });
  for (let i = 0; i < 30; i++) g.step({ classic: {} });
  g.releaseHand('L'); g.releaseHand('R');
  for (let i = 0; i < 120; i++) g.step({ classic: {} });
  assert.equal(g.falls, 0);
  runBot(g, 15); g.releaseHand('L'); g.releaseHand('R');
  for (let i = 0; i < 200; i++) g.step({ classic: {} });
  assert.equal(g.run.lives, lives);
});

test('窓が閉じきった瞬間に、その窓を持つ手が外れる', () => {
  const g = new Game({ stageId: 'b2', noHazards: true });
  const c = g.climber;
  for (let i = 0; i < 400 && !['L', 'R'].some((k) => c.hands[k].hold != null && g.b.holds[c.hands[k].hold].win >= 0); i++) runBot(g, 0.05);
  const s = ['L', 'R'].find((k) => c.hands[k].hold != null && g.b.holds[c.hands[k].hold].win >= 0);
  assert.ok(s, '窓の保持点を持っている');
  const w = g.hz.win[g.b.holds[c.hands[s].hold].win];
  w.active = true; w.state = 'closing'; w.t = 0.01; w.close = 0.9;
  g.step({ classic: {} });
  assert.equal(c.hands[s].hold, null);
});

test('復帰: 標準は安全区画から、挑戦は開始位置から', () => {
  for (const [d, expectLedge] of [['standard', true], ['challenge', false]]) {
    const g = new Game({ stageId: 'b1', difficulty: d, noHazards: true });
    runBot(g, 1);
    for (let i = 0; i < 60 * 60 && g.climber.body.y < g.b.ledges[0].y + 3; i++) runBot(g, 0.1);
    assert.ok(g.maxBodyY > g.b.ledges[0].y + 1.45);
    g.releaseHand('L'); g.releaseHand('R');
    for (let i = 0; i < 120; i++) g.step({ classic: {} });
    assert.equal(g.state, 'play');
    if (expectLedge) assert.ok(g.climber.body.y > FLOOR_H * 3); else assert.ok(g.climber.body.y < 2);
  }
});

test('Run: 4 棟を通して得点と残機を引き継ぐ', () => {
  const run = new Run();
  while (!run.done) {
    const g = runBot(run.makeGame({ noHazards: true }), 900);
    assert.equal(g.state, 'clear');
    run.finishBuilding(g);
  }
  assert.equal(run.results.length, 4);
  assert.ok(run.score > 4 * RULES.clearBonus);
});

test('障害あり（標準）: ボットで 1 棟目を進めても例外がなく、状態が正しく遷移する', () => {
  const g = runBot(new Game({ stageId: 'b1' }), 400);
  assert.ok(['clear', 'over', 'play', 'grace', 'fall', 'respawn', 'mantle'].includes(g.state));
  assert.ok(g.run.lives >= 0);
});
