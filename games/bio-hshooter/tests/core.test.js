// ルールの点検（node --test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, summary, FIELD_W, FIELD_H, ceilAt, floorAt, hitsTerrain, killPlayer, continueGame, damageEnemy, CHARGE_TICKS, BURST_POWER } from '../shared/game-core.js';
import { STAGES } from '../shared/stages.js';
import { ENEMY } from '../shared/enemies.js';
import { BOSS } from '../shared/bosses.js';

const idle = { x: 0, y: 0 };
function run(s, n, inp = idle) { for (let i = 0; i < n; i++) step(s, typeof inp === 'function' ? inp(s, i) : inp); s.events.length = 0; }

test('4 面すべて: 無敵で最初からボス停止点まで例外なく進み、ボスが出る', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const s = createGame({ stage: i, invincible: true, seed: 7 + i });
    const st = STAGES[i];
    let guard = 0;
    while (s.scrollX < st.bossStop && guard++ < 60 * 400) step(s, { x: 0, y: Math.sin(guard * 0.01) * 0.3, fire: (guard % 10) < 5 });
    run(s, 600, (ss, k) => ({ x: 0, y: 0, fire: (k % 10) < 5 }));
    assert.ok(Math.abs(s.scrollX - st.bossStop) < 1e-6, `stage ${i + 1} scroll ${s.scrollX}`);
    assert.ok(s.boss, `stage ${i + 1}: ボスが出ていない`);
    assert.ok(BOSS[s.boss.type]);
  }
});

test('ボスは弱点が開いた時だけ削れ、倒すと次の面へ（最終面のあとは complete）', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const s = createGame({ stage: i, invincible: true, seed: 3 });
    let guard = 0;
    while (!s.boss && guard++ < 60 * 400) step(s, idle);
    assert.ok(s.boss, `stage ${i + 1}`);
    const b = s.boss;
    run(s, 200);
    const weak = b.parts.find((p) => p.core);
    let blocked = 0, hits = 0;
    for (let k = 0; k < 60 * 120 && !b.dying && !b.dead; k++) {
      step(s, idle);
      if (b.petals) for (const p of b.petals) if (p.kind === 'petal' && !p.gone) damageEnemy(s, b, 2, p);
      const r = damageEnemy(s, b, 0.25, weak);
      if (r === 'block') blocked++; else if (r === 'hit') hits++;
    }
    assert.ok(hits > 0, `stage ${i + 1}: 弱点に一度も当たらない`);
    if (b.type !== 'keelheart') assert.ok(blocked > 0, `stage ${i + 1}: 弱点が閉じる時間がない`);
    assert.equal(s.mode, 'bossdown');
    run(s, 480);
    if (i + 1 < STAGES.length) { assert.equal(s.stageIndex, i + 1); assert.equal(s.mode, 'play'); }
    else assert.equal(s.mode, 'complete');
  }
});

test('SEED: 取る→前に付く→切り離し→自由→呼び戻し→付く。付いている向きでレーザーが出る', () => {
  const s = createGame({ invincible: true });
  s.items.push({ id: 999, kind: 'C', x: s.player.x, y: s.player.y, px: 0, py: 0, t: 0 });
  step(s, idle);
  assert.ok(s.pod); assert.equal(s.pod.level, 1); assert.equal(s.pod.color, 'C');
  run(s, 120);
  assert.equal(s.pod.state, 'front');
  step(s, { fire: true }); step(s, idle);
  assert.ok(s.shots.some((o) => o.kind === 'lance' && o.dir === 1));
  step(s, { pod: true });
  assert.equal(s.pod.state, 'launch');
  run(s, 120);
  assert.equal(s.pod.state, 'free');
  assert.ok(s.pod.x > FIELD_W - 2);
  step(s, idle); step(s, { pod: true });
  assert.equal(s.pod.state, 'return');
  run(s, 200);
  assert.ok(['front', 'back'].includes(s.pod.state));
  // 後ろに付ける: 自機を SEED の右へ
  s.pod.state = 'free'; s.pod.x = 3; s.pod.y = s.player.y; s.player.x = 4.0; s.pod.cool = 0;
  step(s, idle);
  assert.equal(s.pod.state, 'back');
  run(s, 20); step(s, { fire: true }); step(s, idle);
  assert.ok(s.shots.some((o) => o.kind === 'lance' && o.dir === -1));
});

test('結晶: 同じ色で Lv が上がる（最大 3）、違う色は色だけ変わる。3 色それぞれの弾が出る', () => {
  const s = createGame({ invincible: true });
  const give = (k) => { s.items.push({ id: Math.random(), kind: k, x: s.player.x, y: s.player.y, px: 0, py: 0, t: 0 }); step(s, idle); };
  give('M'); run(s, 120); give('M'); give('M'); give('M');
  assert.equal(s.pod.level, 3); assert.equal(s.pod.color, 'M');
  step(s, { fire: true }); step(s, idle);
  assert.ok(s.shots.filter((o) => o.kind === 'rico').length >= 4);
  give('A'); assert.equal(s.pod.color, 'A'); assert.equal(s.pod.level, 3);
  run(s, 30); step(s, { fire: true }); step(s, idle);
  assert.ok(s.shots.some((o) => o.kind === 'crawl'));
  give('B'); give('B'); give('B');
  assert.equal(s.bits.length, 2);
  give('S'); give('S'); give('S'); give('S');
  assert.equal(s.player.speedLv, 3);
});

test('溜め撃ち: 押し続けると満タンで Lv5、短押しは溜まらない', () => {
  const s = createGame({ invincible: true });
  run(s, 5);
  for (let i = 0; i < CHARGE_TICKS + 20; i++) step(s, { fire: true });
  assert.equal(s.player.charge, 1);
  step(s, idle);
  const b = s.shots.find((o) => o.kind === 'burst');
  assert.ok(b); assert.equal(b.lv, 5); assert.equal(b.power, BURST_POWER[5]);
  const s2 = createGame({ invincible: true });
  step(s2, { fire: true }); step(s2, { fire: true }); step(s2, idle);
  assert.ok(!s2.shots.some((o) => o.kind === 'burst'));
});

test('ミス: 装備を失って復帰点から。残機が尽きたらゲームオーバー → コンティニュー', () => {
  const s = createGame({ seed: 1 });
  s.items.push({ id: 1, kind: 'C', x: s.player.x, y: s.player.y, px: 0, py: 0, t: 0 });
  step(s, idle);
  while (s.scrollX < 100) step(s, idle), s.player.inv = 5;
  s.events.length = 0;
  const lives = s.lives;
  killPlayer(s);
  run(s, 160);
  assert.equal(s.mode, 'play'); assert.equal(s.lives, lives - 1);
  assert.equal(s.pod, null); assert.equal(s.bits.length, 0);
  assert.equal(s.scrollX >= 84 && s.scrollX < 90, true, 'scroll ' + s.scrollX);
  while (s.mode !== 'gameover') { if (s.mode === 'play') killPlayer(s); step(s, idle); }
  continueGame(s);
  assert.equal(s.mode, 'play'); assert.equal(s.continues, 1);
});

test('同じ種と入力なら同じ結果（決定的）', () => {
  const inp = (ss, k) => ({ x: Math.sin(k * 0.013), y: Math.cos(k * 0.007), fire: (k % 12) < 6, pod: k % 400 === 0 });
  const a = createGame({ seed: 99, invincible: true }), b = createGame({ seed: 99, invincible: true });
  run(a, 3000, inp); run(b, 3000, inp);
  assert.deepEqual(summary(a), summary(b));
});

test('地形: どの地点にも（壊せる壁を除けば）自機が通れる隙間がある・復帰点の出現位置は安全', () => {
  for (const st of STAGES) {
    const s = createGame({ stage: STAGES.indexOf(st) });
    s.blocks = s.blocks.filter((b) => b.hp === Infinity);
    for (let wx = 0; wx < st.bossStop + FIELD_W - 3; wx += 0.5) {
      s.scrollX = wx; // 盤面 x=0 を wx に
      let run0 = 0, best = 0;
      for (let y = 0.4; y < FIELD_H - 0.4; y += 0.1) { if (hitsTerrain(s, 0, y, 0.36)) run0 = 0; else { run0 += 0.1; best = Math.max(best, run0); } }
      assert.ok(best >= 1.2, `${st.name} wx=${wx}: 隙間 ${best.toFixed(2)}`);
    }
    for (const cp of st.checkpoints) { s.scrollX = cp; assert.ok(!hitsTerrain(s, 4, FIELD_H / 2, 0.6), `${st.name} cp ${cp}: 出現位置が地形の中`); }
  }
});

test('出現データ: 種類がすべて定義済み、地形に付く敵は画面内の高さ', () => {
  for (const st of STAGES) for (const sp of st.spawns) {
    assert.ok(ENEMY[sp.type] || BOSS[sp.type], `${st.name}: 未定義 ${sp.type}`);
    if (sp.on) { const y = sp.on === 'floor' ? floorAt(st, sp.x) : ceilAt(st, sp.x); assert.ok(y > -0.5 && y < FIELD_H + 0.5, `${st.name} x=${sp.x} ${sp.type} on ${sp.on}: y=${y.toFixed(2)}`); }
  }
});
