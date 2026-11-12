// 鉄骨レスキュー — 論理のテスト（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, startStage, miss, DT } from '../shared/core.js';
import { MOVE, SCORE, HAMMER, DIFFICULTY, LIFE } from '../shared/config.js';
import { STAGES, TUTORIAL, surfaceY } from '../shared/stages.js';
import { Bot, ROUTES } from '../shared/bot.js';

const idle = { x: 0, y: 0 };
function run(g, n, inp = idle) { for (let i = 0; i < n; i++) step(g, typeof inp === 'function' ? inp(g, i) : inp); return g; }
function toPlay(g) { while (g.phase === 'intro') step(g, idle); return g; }
// 危険を全部止める（地形だけで通れるかを調べる）
function calm(g) {
  g.boss = null; g.bots.forEach((b) => (b.alive = false)); g.barrels.length = 0; g.crates.length = 0;
  g.stage = { ...g.stage, dispensers: [], vents: [] }; g.dispT = [];
  return g;
}

test('ジャンプの頂点は約 1.1m、全速の水平距離は 2m 以上', () => {
  const g = toPlay(createGame({ stage: 0 }));
  g.player.invT = 99; calm(g);
  const y0 = g.player.y, x0 = g.player.x;
  let top = 0, first = true, air = 0;
  for (let i = 0; i < 120; i++) {
    step(g, { x: 1, jump: true, jumpPressed: first }); first = false;
    top = Math.max(top, g.player.y - surfaceY(g.stage.byId.L0, g.player.x));
    if (g.player.state === 'air') air++;
    if (g.player.state === 'ground' && i > 5) break;
  }
  assert.ok(Math.abs(top - MOVE.jumpApex) < 0.06, `頂点 ${top}`);
  assert.ok(g.player.x - x0 > 2.0, `距離 ${g.player.x - x0}`);
  assert.ok(air * DT > 0.7 && air * DT < 0.9, `滞空 ${air * DT}`);
  void y0;
});

test('二段ジャンプできない・コヨーテタイムと入力バッファ', () => {
  const g = toPlay(createGame({ stage: 0 })); calm(g); g.player.invT = 99;
  step(g, { jumpPressed: true });
  run(g, 10);
  const vy = g.player.vy;
  step(g, { jumpPressed: true });
  assert.ok(g.player.vy < vy, '空中で再ジャンプしていない');
  // 着地の直前（0.1 秒以内）に押したジャンプは着地で出る
  while (g.player.state === 'air' && g.player.vy > -4) step(g, idle);
  let pressed = false;
  for (let i = 0; i < 200 && g.player.state === 'air'; i++) {
    const p = g.player, s = surfaceY(g.stage.byId.L0, p.x);
    const press = !pressed && p.y - s < 0.25; if (press) pressed = true;
    step(g, { jumpPressed: press });
  }
  run(g, 2);
  assert.ok(g.player.state === 'air' && g.player.vy > 0, '入力バッファで着地後すぐ跳んだ');
});

for (const st of [TUTORIAL, ...STAGES]) {
  test(`通常操作だけで最後まで通れる: ${st.name}`, () => {
    const g = toPlay(createGame({ stage: st.index === -1 ? 'tutorial' : st.index, difficulty: 'normal' }));
    if (st.index === -1) startStage(g, 'tutorial');
    toPlay(g);
    if (!st.tutorial) calm(g);
    g.player.invT = 0;
    const bot = new Bot(ROUTES[st.id]);
    for (let i = 0; i < 60 * 200; i++) {
      step(g, bot.input(g));
      if (['clear', 'rescue', 'tutorialDone', 'stageDone', 'ending'].includes(g.phase)) break;
      assert.notEqual(g.phase, 'dying', `ミスした（${g.player.deathCause}）命令 ${bot.i}: ${JSON.stringify(bot.route[bot.i])} at x=${g.player.x.toFixed(2)} y=${g.player.y.toFixed(2)}`);
    }
    assert.ok(['clear', 'rescue', 'tutorialDone'].includes(g.phase), `到達できず: phase=${g.phase} 命令 ${bot.i}/${bot.route.length} ${JSON.stringify(bot.route[bot.i])} x=${g.player.x.toFixed(2)} y=${g.player.y.toFixed(2)} state=${g.player.state}`);
  });
}

test('樽の跳び越しは 1 個につき 1 回だけ 100 点・横によけただけでは加点しない', () => {
  const g = toPlay(createGame({ stage: 0 })); calm(g);
  const p = g.player; p.invT = 0;
  const L0 = g.stage.byId.L0;
  // 樽を右から転がす
  g.barrels.push({ id: 'T', x: p.x + 1.6, y: surfaceY(L0, p.x + 1.6), plat: 'L0', state: 'roll', dir: -1, speed: 2.6, spin: 0, ladderSeen: {}, prevRel: 0, jumped: false });
  const s0 = g.score;
  let pressed = false, n = 0;
  for (let i = 0; i < 120; i++) {
    const b = g.barrels[0];
    const press = !pressed && b && b.x - p.x < 0.9; if (press) pressed = true;
    step(g, { jumpPressed: press });
    for (const e of g.events) if (e.type === 'jumpOver') n++;
    assert.notEqual(g.phase, 'dying');
  }
  assert.equal(n, 1);
  assert.equal(g.score - s0, SCORE.jumpOver);
  // 同じ樽をもう一度跳んでも加点しない（樽はもう後ろ）
  step(g, { jumpPressed: true }); run(g, 60);
  assert.equal(g.score - s0, SCORE.jumpOver);
});

test('樽に当たると残機は 1 だけ減り、復帰点の得点・時間に戻る（稼ぎ防止）', () => {
  const g = toPlay(createGame({ stage: 0, difficulty: 'normal' })); calm(g);
  const lives = g.lives, p = g.player; p.invT = 0;
  const snapScore = g.snapshot.score;
  g.score += 5000; // 未確定の得点
  const L0 = g.stage.byId.L0;
  for (let k = 0; k < 3; k++) g.barrels.push({ id: 'T' + k, x: p.x + 0.5 + k * 0.1, y: surfaceY(L0, p.x), plat: 'L0', state: 'roll', dir: -1, speed: 2.6, spin: 0, ladderSeen: {}, prevRel: 0, jumped: false });
  let misses = 0;
  for (let i = 0; i < 30; i++) { step(g, idle); for (const e of g.events) if (e.type === 'miss') misses++; }
  assert.equal(misses, 1);
  assert.equal(g.lives, lives - 1);
  assert.equal(miss(g, 'barrel'), false, 'ミス中にもう一度ミスしない');
  for (let i = 0; i < 400 && g.phase !== 'play'; i++) step(g, idle);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, snapScore);
  assert.equal(g.lives, lives - 1);
  assert.ok(g.player.invT > 1.9, '復帰後 2 秒無敵');
  assert.ok(g.barrels.every((b) => Math.hypot(b.x - g.player.x, b.y - g.player.y) >= LIFE.safeRadius), '出現余白');
});

test('時間切れでミス、残機 0 でゲームオーバー', () => {
  const g = toPlay(createGame({ stage: 0, difficulty: 'hard' })); calm(g);
  g.lives = 1; g.time = 0.05;
  run(g, 10);
  assert.equal(g.phase, 'dying'); assert.equal(g.player.deathCause, 'time'); assert.equal(g.lives, 0);
  run(g, 200);
  assert.equal(g.phase, 'gameover');
});

test('やさしいは中間地点から、標準は面の最初から復帰する', () => {
  for (const [d, expectMid] of [['easy', true], ['normal', false]]) {
    const g = toPlay(createGame({ stage: 0, difficulty: d })); calm(g);
    const bot = new Bot(ROUTES.girders);
    for (let i = 0; i < 60 * 60 && g.player.plat !== 'L3b'; i++) step(g, bot.input(g));
    run(g, 2);
    assert.equal(g.checkpoint === 'mid', expectMid, d);
    miss(g, 'barrel'); run(g, 140);
    assert.equal(g.player.plat, expectMid ? 'L3b' : 'L0', d);
  }
});

test('ハンマー: 8 秒・地上だけ・0.45 秒間隔・壊すと 200 点', () => {
  const g = toPlay(createGame({ stage: 0 })); calm(g);
  const p = g.player; p.hammerT = HAMMER.duration; p.invT = 0;
  let swings = 0;
  for (let i = 0; i < 30; i++) { step(g, { act: true, actPressed: true }); for (const e of g.events) if (e.type === 'swing') swings++; }
  assert.equal(swings, 2, '0.5 秒で 2 回（0 と 0.45 秒）');
  step(g, { jumpPressed: true }); run(g, 3);
  let air = 0; step(g, { actPressed: true }); for (const e of g.events) if (e.type === 'swing') air++;
  assert.equal(air, 0, '空中では振れない');
  run(g, 60);
  const L0 = g.stage.byId.L0, x = p.x + 0.6 * p.facing;
  g.barrels.push({ id: 'H', x, y: surfaceY(L0, x), plat: 'L0', state: 'roll', dir: 0, speed: 0, spin: 0, ladderSeen: {}, prevRel: 0, jumped: false });
  const s0 = g.score;
  run(g, 30, (gg, i) => ({ actPressed: i === 0 }));
  assert.equal(g.barrels.length, 0); assert.equal(g.score - s0, SCORE.smash);
  assert.notEqual(g.phase, 'dying');
  // 有効時間は空中・昇降中も進み、8 秒で切れる
  run(g, 60 * 9);
  assert.equal(p.hammerT, 0);
});

test('装置: 順番どおりだけ解除・離れた所からは操作できない・再接触で加点しない', () => {
  const g = toPlay(createGame({ stage: 3 })); calm(g);
  const p = g.player;
  const s0 = g.score;
  step(g, { actPressed: true });
  assert.equal(g.devices.filter((d) => d.done).length, 0, '遠くからは解除できない');
  // ②の前（S2）へ行って押しても解除されない
  const d2 = g.devices.find((d) => d.order === 2);
  p.x = d2.x; p.y = d2.y; p.plat = 'S2';
  step(g, { actPressed: true });
  assert.equal(d2.done, false);
  assert.ok(g.events.some((e) => e.type === 'deviceWrong'));
  const d1 = g.devices.find((d) => d.order === 1);
  p.x = d1.x; p.y = d1.y; p.plat = 'S1';
  step(g, { actPressed: true }); run(g, 2);
  assert.equal(d1.done, true); assert.equal(g.score - s0, SCORE.device);
  step(g, { actPressed: true });
  assert.equal(g.score - s0, SCORE.device, '解除済みに再接触しても加点しない');
});

test('面クリアで 1000 点 + 残秒 × 10 点、4 面の装置 4 個で救出へ', () => {
  const g = toPlay(createGame({ stage: 3 })); calm(g);
  const bot = new Bot(ROUTES.summit);
  let ev = null;
  for (let i = 0; i < 60 * 120 && g.phase === 'play'; i++) { const t = g.time; step(g, bot.input(g)); const e = g.events.find((q) => q.type === 'rescue'); if (e) ev = { e, t }; }
  assert.equal(g.phase, 'rescue');
  assert.equal(ev.e.bonus, SCORE.clear + Math.ceil(g.time) * SCORE.perSecond);
  run(g, 60 * 7);
  assert.equal(g.phase, 'ending');
});

test('速い樽が上から落ちても足場をすり抜けない', () => {
  const g = toPlay(createGame({ stage: 0 })); calm(g);
  g.player.x = 15; g.player.invT = 99;
  g.barrels.push({ id: 'F', x: 5, y: 11, plat: null, state: 'fall', vx: 0, vy: -11.9, dir: 1, speed: 3.1, spin: 0, ladderSeen: {}, prevRel: 0, jumped: false });
  run(g, 14);
  const b = g.barrels[0];
  assert.ok(b && b.state === 'roll' && b.plat === 'L4', `着地 ${b && b.plat}`);
});

test('ベルトは主人公を運ぶ・昇降機は乗った主人公を運ぶ', () => {
  const g = toPlay(createGame({ stage: 1 })); calm(g);
  const p = g.player; const B = g.stage.byId.B1a;
  p.x = 3; p.y = B.y0; p.plat = 'B1a'; p.state = 'ground';
  const x0 = p.x; run(g, 60);
  assert.ok(Math.abs(p.x - x0 - 1.0) < 0.05, `ベルトで ${p.x - x0}`);
  const g3 = toPlay(createGame({ stage: 2 })); calm(g3);
  const car = g3.lifts[0].cars[1];
  const q = g3.player; q.x = 5; q.y = car.y; q.plat = car.id; q.state = 'ground'; q.invT = 99;
  const y0 = q.y; run(g3, 60);
  assert.ok(Math.abs(q.y - y0 - 0.9) < 0.05, `昇降機で ${q.y - y0}`);
});

test('昇降機で天井まで運ばれるとミス（1 回だけ）', () => {
  const g = toPlay(createGame({ stage: 2 })); calm(g);
  const car = g.lifts[0].cars.reduce((a, c) => (c.y > a.y ? c : a));
  car.y = 10.3;
  const q = g.player; q.x = 5; q.y = car.y; q.plat = car.id; q.state = 'ground'; q.invT = 0;
  let n = 0; for (let i = 0; i < 120; i++) { step(g, idle); n += g.events.filter((e) => e.type === 'miss').length; }
  assert.equal(n, 1); assert.equal(g.player.deathCause, 'crush');
});

test('蒸気は予告のあとに噴き、待てば通れる', async () => {
  const { ventState } = await import('../shared/core.js');
  const g = toPlay(createGame({ stage: 1 }));
  const v = g.stage.vents[0];
  const seen = new Set();
  let lastOn = false, warnBeforeOn = true, prev = 'off';
  for (let i = 0; i < 60 * 10; i++) { g.elapsed += DT; const s = ventState(g, v).state; seen.add(s); if (s === 'on' && prev === 'off') warnBeforeOn = false; prev = s; lastOn = s === 'on'; }
  assert.deepEqual([...seen].sort(), ['off', 'on', 'warn']);
  assert.ok(warnBeforeOn); void lastOn;
});

test('難易度の推奨初期設定', () => {
  assert.deepEqual([DIFFICULTY.easy.lives, DIFFICULTY.normal.lives, DIFFICULTY.hard.lives], [5, 3, 3]);
  assert.deepEqual([DIFFICULTY.easy.time, DIFFICULTY.normal.time, DIFFICULTY.hard.time], [240, 180, 150]);
  assert.equal(MOVE.walk, 3.0); assert.equal(MOVE.climb, 1.4);
});

test('すべてのはしごが上下の足場をつなぎ、必須の跳躍は能力の範囲', () => {
  for (const st of [TUTORIAL, ...STAGES]) {
    for (const l of st.ladders) {
      assert.ok(l.y1 - l.y0 > 1.5 && l.y1 - l.y0 < 3.5, `${st.id} はしご ${l.x}: ${l.y1 - l.y0}`);
      for (const id of [l.lo, l.hi]) { const p = st.byId[id]; assert.ok(l.x >= p.x0 && l.x <= p.x1, `${st.id} はしご ${l.x} が ${id} の外`); }
    }
    for (const p of st.platforms) for (const q of st.platforms) {
      if (p === q) continue;
      // 同じ高さの足場どうしの切れ目は 2m 以下（全速で跳べる）
      if (Math.abs(surfaceY(p, p.x1) - surfaceY(q, q.x0)) < 0.2 && q.x0 > p.x1) assert.ok(q.x0 - p.x1 <= 2.0 || q.x0 - p.x1 > 3, `${st.id} ${p.id}→${q.id} 切れ目 ${q.x0 - p.x1}`);
    }
  }
});
