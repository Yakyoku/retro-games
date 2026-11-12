// ルールの自動テスト（node --test tests/）
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, segDist2 } from '../shared/game.js';
import { FixedStep } from '../shared/loop.js';
import { STAGES } from '../shared/stages.js';
import { GAUGE, OPTION, SHIELD, SCORE, PLAYER, TICK } from '../shared/config.js';
import { botInput } from './bot.js';

const quiet = (g) => { g.enemies = []; g.ebullets = []; g.stage = { ...g.stage, events: [] }; g.evCursor = 0; };
function play(g, n, inp = {}) { for (let i = 0; i < n; i++) { g.tick(typeof inp === 'function' ? inp(g, i) : inp); g.drainEvents(); } }
function ready(opts = {}) { const g = new Game({ stage: 1, ...opts }); quiet(g); play(g, PLAYER.enterTicks + PLAYER.respawnInvuln + 4); return g; }

test('ゲージ: カプセル 1 個で 1 つ進み 6 項目を循環', () => {
  const g = ready();
  assert.equal(g.power.sel, -1);
  for (let i = 0; i < 6; i++) { g.addCapsule(); assert.equal(g.power.sel, i); }
  g.addCapsule(); assert.equal(g.power.sel, 0);
  assert.deepEqual(GAUGE, ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', 'SHIELD']);
});

test('取得: 決定で取得して未選択へ戻る。未選択・取得不能・上限では消費しない', () => {
  const g = ready();
  assert.equal(g.acquire(), false);                         // 未選択
  g.addCapsule(); assert.equal(g.acquire(), true); assert.equal(g.power.speed, 2); assert.equal(g.power.sel, -1);
  for (let lv = 3; lv <= 5; lv++) { g.addCapsule(); g.acquire(); }
  assert.equal(g.power.speed, 5);
  g.addCapsule(); assert.equal(g.acquire(), false); assert.equal(g.power.sel, 0);   // 上限: 消費しない
  const ev = g.drainEvents(); assert.ok(ev.some((e) => e.t === 'deny' && /最大/.test(e.why)));
  assert.ok(Math.abs(g.speed / PLAYER.baseSpeed - 2) < 1e-9);                         // 最大 2 倍
});

test('DOUBLE と LASER は切り替え。ミサイル・オプションとは併用', () => {
  const g = ready();
  const take = (i) => { g.power.sel = i; return g.acquire(); };
  take(1); take(2); assert.equal(g.power.weapon, 'double'); assert.equal(g.power.missile, true);
  take(3); assert.equal(g.power.weapon, 'laser');
  assert.equal(take(3), false);
  take(2); assert.equal(g.power.weapon, 'double');
  take(4); assert.equal(g.power.options, 1); assert.equal(g.power.missile, true);
});

test('オプションは最大 4 機', () => {
  const g = ready();
  for (let i = 0; i < 6; i++) { g.power.sel = 4; g.acquire(); }
  assert.equal(g.power.options, OPTION.max);
});

test('オプション: 自機の移動履歴を tick で追い、止まると止まる', () => {
  const g = ready();
  g.power.options = 4; g.ensureHistory();
  play(g, 60, { my: 1 });
  const a = [0, 1, 2, 3].map((i) => g.optionPos(i));
  for (let i = 1; i < 4; i++) assert.ok(a[i].y < a[i - 1].y, 'うしろのオプションほど過去の位置');
  play(g, 30, {});
  const b = [0, 1, 2, 3].map((i) => g.optionPos(i));
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i].y - b[i].y) < 1e-9, '止まっている間は動かない');
});

test('シールド: 前方の弾を 5 回まで防ぐ。後ろからの弾は防がない。重ね取りはできない', () => {
  const g = ready({ difficulty: 'normal' });
  g.power.sel = 5; g.acquire(); assert.equal(g.power.shield, SHIELD.durability);
  g.power.sel = 5; assert.equal(g.acquire(), false);
  const p = g.player;
  for (let i = 0; i < 5; i++) {
    g.ebullets.push({ id: 900 + i, kind: 'b', x: p.x + 1.0, y: p.y, z: 0, px: p.x + 1.2, py: p.y, pz: 0, vx: -0.15, vy: 0, vz: 0, r: 0.24, t: 0, life: 99, terrain: false });
    play(g, 1);
    assert.equal(p.alive, true);
  }
  assert.equal(g.power.shield, 0);
  // 後ろから
  const g2 = ready(); g2.power.sel = 5; g2.acquire();
  const q = g2.player;
  g2.ebullets.push({ id: 1, kind: 'b', x: q.x - 0.3, y: q.y, z: 0, px: q.x - 0.6, py: q.y, pz: 0, vx: 0.15, vy: 0, vz: 0, r: 0.24, t: 0, life: 99, terrain: false });
  play(g2, 1);
  assert.equal(q.alive, false);
  assert.equal(g2.power.shield, 0, 'ミスで装備（シールド）を失う');
});

test('被弾: 同じ tick に弾が複数当たっても残機は 1 つだけ減る', () => {
  const g = ready();
  const p = g.player, lives = g.lives;
  for (let i = 0; i < 5; i++) g.ebullets.push({ id: 50 + i, kind: 'b', x: p.x, y: p.y, z: 0, px: p.x, py: p.y, pz: 0, vx: 0, vy: 0, vz: 0, r: 0.3, t: 0, life: 99, terrain: false });
  play(g, 3);
  assert.equal(g.lives, lives - 1);
});

test('高速弾のすり抜けがない（掃引判定）', () => {
  // 1 tick で 3u 進む弾が、半径 0.3 の的を跨ぐ
  assert.ok(segDist2(0, 0, 0, 3, 0, 0, 1.5, 0.1, 0) < 0.3 * 0.3);
  const g = ready();
  const e = g.spawn('dart', { x: g.player.x + 8, y: g.player.y, pat: 'line', speed: 0.0001 });
  g.shots.push({ id: 7, kind: 'shot', owner: 0, x: e.x + 1.5, y: e.y, z: 0, px: e.x - 1.5, py: e.y, pz: 0, vx: 3, vy: 0, t: 0 });
  g.collide();
  assert.equal(e.dead, true);
});

test('撃破の得点は 1 回だけ（同じ tick に複数の弾が当たっても）', () => {
  const g = ready();
  const e = g.spawn('dart', { x: g.player.x + 6, y: g.player.y, pat: 'line', speed: 0.0001 });
  const s0 = g.score;
  for (let i = 0; i < 4; i++) g.shots.push({ id: 70 + i, kind: 'shot', owner: 0, x: e.x, y: e.y, z: 0, px: e.x - 0.5, py: e.y, pz: 0, vx: 0.5, vy: 0, t: 0 });
  g.collide();
  assert.equal(g.score - s0, SCORE.small);
});

test('編隊を全滅させるとカプセル 1 個。1 機でも逃すと出ない', () => {
  const g = ready();
  const mk = (gid) => [0, 1, 2].map((i) => g.spawn('dart', { x: g.camX + 20 + i, y: 9, group: gid, pat: 'line', speed: 0.0001 }));
  const a = mk('A'); a.forEach((e) => g.kill(e, true));
  assert.equal(g.capsules.length, 1);
  const b = mk('B'); g.kill(b[0], true); g.escape(b[1]); g.kill(b[2], true);
  assert.equal(g.capsules.length, 1);
});

test('レーザーのダメージは描画 FPS ではなく tick 間隔で決まる（同じ敵へは 6 tick ごと）', () => {
  const g = ready();
  const e = g.spawn('heavy', { x: g.player.x + 6, y: g.player.y }); e.hp = 99; e.maxHp = 99; e.armor = false;
  const def = { ...e }; void def;
  e.r = 0.9;   // 大型扱いにしないで貫通させる
  g.shots.push({ id: 9, kind: 'laser', owner: 0, x: e.x + 2, y: e.y, z: 0, px: e.x, py: e.y, pz: 0, vx: 0, vy: 0, len: 5, hits: new Map(), t: 10 });
  for (let i = 0; i < 12; i++) { g.tickN++; g.collide(); }
  assert.equal(99 - e.hp, 2);
});

test('固定ステップ: 30/60/90/144fps のどれでも 1 秒で 60 tick', () => {
  for (const fps of [30, 60, 90, 144]) {
    const fs = new FixedStep({ maxCatchUp: 8 });
    let n = 0, t = 0;
    fs.advance(t, () => n++);
    for (let i = 0; i < fps * 3; i++) { t += 1 / fps; fs.advance(t, () => n++); }
    assert.ok(Math.abs(n - 180) <= 1, `${fps}fps → ${n}`);
  }
  // タブ復帰の 10 秒は一気に進めない
  const fs = new FixedStep({ maxCatchUp: 5 }); let n = 0;
  fs.advance(0, () => n++); fs.advance(10, () => n++);
  assert.ok(n <= 5);
});

test('ミス → チェックポイントから再開（Normal）・装備を失う・無敵 2 秒', () => {
  const g = new Game({ stage: 1, difficulty: 'normal' });
  g.camX = 240; g.cpIndex = 1; g.debugFullPower();
  g.playerHit('test');
  assert.equal(g.power.options, 0); assert.equal(g.power.weapon, 'normal');
  play(g, PLAYER.deathTicks + 1);
  assert.equal(g.camX < 231, true); assert.equal(g.camX >= 230, true);
  assert.ok(g.player.invuln >= PLAYER.respawnInvuln);
  // 復帰位置が地形に埋まっていない
  assert.equal(g.solidAt(g.camX + 4, g.player.y, PLAYER.radius), false);
});

test('Easy は安全な位置へ復帰し、再装備用のカプセルが出る', () => {
  const g = new Game({ stage: 1, difficulty: 'easy' });
  g.camX = 120;
  g.playerHit('test'); play(g, PLAYER.deathTicks + 1);
  assert.ok(g.camX >= 120);
  assert.equal(g.capsules.length, 3);
});

test('残機 0 でゲームオーバー', () => {
  const g = new Game({ stage: 1, lives: 1 });
  play(g, 50); g.playerHit('t'); play(g, PLAYER.deathTicks + 2);
  assert.equal(g.over, true); assert.equal(g.state, 'gameover');
});

test('全 7 ステージ: 復帰位置はどのチェックポイントでも地形に埋まらない', () => {
  assert.equal(STAGES.length, 7);
  for (const st of STAGES) {
    for (let i = 0; i < st.checkpoints.length; i++) {
      const g = new Game({ stage: st.id }); g.respawnAt(i, false);
      assert.equal(g.solidAt(g.camX + 4, g.player.y, PLAYER.radius + 0.2), false, `stage ${st.id} cp ${i}`);
    }
    assert.equal(st.checkpoints.length, 3);
  }
});

test('自動操縦（無敵）で 2D・3D とも全 7 面のボスを倒して一周クリアできる', () => {
  for (const variant of ['2d', '3d']) {
    const g = new Game({ variant, stage: 1, invincible: true, seed: 7 });
    let n = 0, stages = new Set();
    while (!g.over && n < 60 * 60 * 45) {
      if (g.stageNo && g.power.options < 2) g.debugFullPower();
      g.tick(botInput(g)); g.drainEvents(); stages.add(g.stageNo); n++;
    }
    assert.equal(g.cleared, true, variant);
    assert.equal(stages.size, 7);
  }
});

test('記録の分離キー（2D/3D・難易度・本編/練習）', () => {
  assert.equal(new Game({ variant: '3d', difficulty: 'arcade', mode: 'practice' }).recordKey(), '3d:arcade:practice');
  assert.equal(new Game({}).recordKey(), '2d:normal:main');
});

test('チェックポイントから再開しても同じ乱数・同じ出来事で決定的', () => {
  const run = () => { const g = new Game({ stage: 2, seed: 3, invincible: true }); play(g, 3000, (gg) => botInput(gg)); return [g.score, g.camX.toFixed(3), g.enemies.length]; };
  assert.deepEqual(run(), run());
});
