// node --test tests/  （作品フォルダで）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, hurtPlayer, killPlayer, retryStage, nextStage, debugWarpBoss } from '../shared/core.js';
import { PLAYER, WEAPONS, DIFFICULTY, SCORE, TICK } from '../shared/config.js';
import { getStages } from '../shared/stages.js';
import { solveStage, replay } from '../tools/reach.js';

const run = (g, input, n) => { for (let i = 0; i < n; i++) step(g, input); };
const toPlay = (g) => { for (let i = 0; i < 400 && g.mode !== 'play'; i++) step(g, {}); return g; };
const play = (opts = {}) => { const g = toPlay(createGame({ noEnemies: true, ...opts })); assert.equal(g.mode, 'play'); return g; };

test('鎧あり → 被弾で鎧が壊れる → 次の被弾で死亡（体力ゲージではない）', () => {
  const g = play();
  assert.equal(g.player.armor, true);
  assert.equal(hurtPlayer(g, g.player.x + 1), true);
  assert.equal(g.player.armor, false);
  assert.ok(g.events.some((e) => e.type === 'armorBreak'));
  assert.ok(Math.abs(g.player.inv - PLAYER.hurtInvuln) < 1e-9);
  assert.ok(g.player.vx < 0, 'ノックバックは当たった向きの反対へ');
  // 無敵の間は同じ接触で多重にダメージを受けない
  assert.equal(hurtPlayer(g, g.player.x + 1), false);
  run(g, {}, Math.ceil(PLAYER.hurtInvuln / TICK) + 2);
  assert.equal(g.player.inv, 0);
  hurtPlayer(g, g.player.x + 1);
  assert.equal(g.mode, 'dying');
});

test('死亡は約 1 秒、残機は今の 1 人を含み、0 でゲームオーバー', () => {
  for (const d of ['hard', 'easy']) {
    const g = play({ difficulty: d });
    assert.equal(g.lives, DIFFICULTY[d].lives);
    for (let k = DIFFICULTY[d].lives; k >= 1; k--) {
      killPlayer(g, 'enemy');
      let n = 0; while (g.mode === 'dying') { step(g, {}); n++; }
      assert.ok(Math.abs(n * TICK - PLAYER.deathTime) < 0.05, `死亡演出 ${n * TICK}s`);
      if (k > 1) { assert.equal(g.mode, 'ready'); assert.equal(g.lives, k - 1); toPlay(g); }
    }
    assert.equal(g.mode, 'gameover');
    assert.equal(g.lives, 0);
  }
});

test('復活: 鎧と槍・時間は初期値・得点はチェックポイントの値・復活無敵 2 秒・周囲に敵と弾がない', () => {
  const g = createGame({ stage: 0 });
  toPlay(g);
  g.player.x = 101.5; g.player.y = 3; run(g, {}, 2); // チェックポイント（x=101）を通る
  assert.equal(g.cp >= 0, true);
  const cpScore = g.score;
  g.score += 1234; g.weapon = 'axe'; g.time = 12; g.player.armor = false;
  killPlayer(g, 'enemy'); while (g.mode === 'dying') step(g, {});
  assert.equal(g.score, cpScore);
  assert.equal(g.weapon, 'lance');
  assert.equal(g.player.armor, true);
  assert.equal(g.time, DIFFICULTY.hard.time);
  assert.equal(g.player.inv, PLAYER.respawnInvuln);
  assert.equal(g.eshots.length, 0);
  const sp = g.cps[g.cp];
  for (const e of [...g.enemies, ...g.dormant]) assert.ok(Math.hypot(e.x - sp.x, e.y - sp.y) > 4.5);
  // 準備中は時間が止まる
  const t0 = g.time; run(g, {}, 30); assert.equal(g.mode, 'ready'); assert.equal(g.time, t0);
});

test('時間切れは死亡', () => {
  const g = play();
  g.time = 0.05; run(g, {}, 5);
  assert.equal(g.mode, 'dying');
  assert.equal(g.player.cause, 'time');
});

test('穴・水・溶岩は即死（鎧があっても）', () => {
  for (const [stage, x, y] of [[0, 57.5, 3], [2, 25, 2.5], [4, 29, 2.5]]) {
    const g = play({ stage });
    g.player.x = x; g.player.y = y; g.player.vy = -1; g.player.ground = false;
    run(g, {}, 90);
    assert.equal(g.mode === 'dying' || g.mode === 'ready' || g.lives < 3, true, `stage ${stage + 1}`);
    assert.ok(['pit', 'water', 'lava'].includes(g.player.cause) || g.lives < 3);
  }
});

test('武器: 発射間隔と同時存在数', () => {
  for (const id of ['lance', 'dagger', 'axe']) {
    const g = play(); g.weapon = id;
    let shots = 0, maxAlive = 0;
    for (let i = 0; i < 120; i++) { step(g, { attack: true }); shots += g.events.filter((e) => e.type === 'fire').length; maxAlive = Math.max(maxAlive, g.shots.length); }
    assert.ok(maxAlive <= WEAPONS[id].max, `${id} 同時 ${maxAlive}`);
    assert.ok(shots >= 3, `${id} 長押しで連射 ${shots}`);
    // 間隔: 発射の tick 差が interval 未満にならない
    const g2 = play(); g2.weapon = id; const ticks = [];
    for (let i = 0; i < 200; i++) { step(g2, { attack: true }); if (g2.events.some((e) => e.type === 'fire')) ticks.push(i); g2.shots.length = 0; }
    for (let k = 1; k < ticks.length; k++) assert.ok((ticks[k] - ticks[k - 1]) * TICK >= WEAPONS[id].interval - 1e-6);
  }
  const g = play(); g.weapon = 'torch';
  for (let i = 0; i < 240; i++) { step(g, { attack: true }); assert.ok(g.shots.length + g.burns.length <= WEAPONS.torch.max); }
});

test('高速の短剣も 1 タイル幅の敵をすり抜けない', () => {
  const g = createGame({ stage: 0 }); toPlay(g);
  g.weapon = 'dagger';
  g.enemies.push({ type: 'turret', x: g.player.x + 5, y: g.player.y, w: 0.3, h: 2, hp: 99, max: 99, hittable: true, harm: false, dead: false, st: 'idle', t: 0, hitT: 0, cd: 99, deadT: 0, dir: -1, home: null });
  step(g, { attack: true }); run(g, {}, 30);
  assert.ok(g.enemies.at(-1).hp < 99);
});

test('はしご: 上端・下端で振動せず、昇降中は攻撃できない', () => {
  const g = play({ stage: 0 });
  g.player.x = 73.5; g.player.y = 4; run(g, {}, 1);
  const ys = [];
  for (let i = 0; i < 160; i++) { step(g, { up: true, attack: true }); ys.push(g.player.y); if (g.player.climb) assert.equal(g.shots.length, 0); }
  assert.equal(g.player.climb, false); assert.equal(g.player.y, 8);
  for (let k = 1; k < ys.length; k++) assert.ok(ys[k] >= ys[k - 1] - 1e-9, '上り中に下がらない');
  run(g, { up: true }, 30); assert.equal(g.player.y, 8); assert.equal(g.player.climb, false);
  run(g, { down: true }, 200); assert.equal(g.player.y, 4); assert.equal(g.player.climb, false);
});

test('高難度のジャンプは踏み切りの速度で固定、易しいは少しだけ寄せられる', () => {
  for (const d of ['hard', 'easy']) {
    const g = play({ difficulty: d });
    g.player.x = 4; run(g, { right: true, jump: true }, 1);
    const vx0 = g.player.vx;
    run(g, { left: true }, 20);
    if (d === 'hard') assert.equal(g.player.vx, vx0); else assert.ok(g.player.vx < vx0);
  }
});

test('しゃがむと当たり判定が低くなり、低い天井の下では立ち上がらない', () => {
  const g = play();
  run(g, { down: true }, 3);
  assert.equal(g.player.h, PLAYER.hCrouch);
  g.tiles[Math.floor(g.player.y + 1.2) * g.def.W + Math.floor(g.player.x)] = 1;
  run(g, {}, 5);
  assert.equal(g.player.crouch, true);
});

test('稼ぎ防止: 倒した敵はカメラを往復しても復活せず、亡者の発生には上限がある', () => {
  const g = createGame({ stage: 0, god: true });
  toPlay(g);
  const s = g.spawners[0];
  let emerged = 0;
  for (let i = 0; i < 60 * 120; i++) { step(g, { right: (i / 200 | 0) % 2 === 0, left: (i / 200 | 0) % 2 === 1, attack: true }); emerged += g.events.filter((e) => e.type === 'ghoulEmerge').length; if (g.player.x > 38) g.player.x = 38; }
  assert.ok(emerged <= s.cap, `発生 ${emerged} ≤ ${s.cap}`);
  // 画面外へ離れた敵は元の位置で眠る（倒した敵は戻らない）
  const g2 = createGame({ stage: 0, god: true }); toPlay(g2);
  g2.player.x = 66; g2.player.y = 4; run(g2, {}, 240);
  const sk = g2.enemies.find((e) => e.type === 'skeleton');
  assert.ok(sk); sk.hp = 0.1; g2.shots.push({ kind: 'lance', x: sk.x, y: sk.y + 0.8, px: sk.x, py: sk.y, vx: 0, vy: 0, dist: 0, w: 1, h: 1, hits: new Set(), t: 0, face: 1 });
  step(g2, {}); assert.ok(g2.killed.has(sk.id));
  const score = g2.score;
  g2.player.x = 20; g2.player.y = 3; run(g2, {}, 300); g2.player.x = 66; g2.player.y = 4; run(g2, {}, 300);
  assert.ok(!g2.enemies.some((e) => e.id === sk.id) && !g2.dormant.some((e) => e.id === sk.id));
  assert.ok(g2.score - score < SCORE.strong * 3);
});

test('得点: 通常敵 100・強敵 300・ボス 1000・宝 200・残り時間 1 秒 10 点', () => {
  assert.deepEqual([SCORE.enemy, SCORE.strong, SCORE.boss, SCORE.treasure, SCORE.timeBonusPerSec], [100, 300, 1000, 200, 10]);
});

test('全 6 ステージ: 通常の操作だけで無傷のままボスの間に着ける（実際の物理で探索・再生）', () => {
  for (let i = 0; i < 6; i++) {
    const r = solveStage(i);
    assert.ok(r.ok, `ステージ ${i + 1} 到達不可 最遠 ${JSON.stringify(r.best)}`);
    assert.ok(r.seconds < DIFFICULTY.hard.time * 0.6, `ステージ ${i + 1} ${r.seconds}s`);
    assert.ok(replay(i, r.inputs).ok, `ステージ ${i + 1} 再生`);
    assert.ok(replay(i, r.inputs, { enemies: true, god: true }).ok, `ステージ ${i + 1} 敵ありの再生（無敵）`);
  }
});

// ボス戦の自動操作: ボスに向き、武器に合った距離を保ち、攻撃を押し続ける。高い所の相手には跳ぶ
function bossBot(g, weapon) {
  const p = g.player, b = g.boss;
  if (!b) return {};
  const dx = b.x - p.x, ad = Math.abs(dx);
  const [lo, hi] = weapon === 'torch' ? [1.8, 3.6] : weapon === 'axe' ? [2.5, 5] : [3, 7];
  const inp = { attack: g.tick % 2 === 0 };
  const dir = dx > 0 ? 1 : -1;
  if (p.face !== dir) inp[dir > 0 ? 'right' : 'left'] = true;
  else if (ad > hi) inp[dir > 0 ? 'right' : 'left'] = true;
  else if (ad < lo) inp[dir > 0 ? 'left' : 'right'] = true;
  const high = b.y + b.h * 0.4 > p.y + 1.6;
  if (high && g.tick % 50 === 0) inp.jump = true;
  return inp;
}
test('全ボス: どの武器でも撃破できる（予告と隙がある）', () => {
  for (let i = 0; i < 6; i++) for (const w of Object.keys(WEAPONS)) {
    const g = createGame({ stage: i, god: true, noEnemies: true });
    debugWarpBoss(g); toPlay(g);
    const bd = getStages()[i].boss;
    g.player.x = bd.x0 + 4; g.player.y = (g.def.vertical ? 102 : g.player.y);
    let t = 0;
    while (g.mode !== 'next' && g.mode !== 'ending' && t < 60 * 150) { g.weapon = w; g.time = 999; step(g, bossBot(g, w)); t++; }
    assert.ok(g.mode === 'next' || g.mode === 'ending', `ステージ ${i + 1} ${w}: 撃破できない（残り ${g.boss && g.boss.hp.toFixed(1)}）`);
  }
});

test('ステージ遷移: クリアで次へ、最終ステージでエンディング、再挑戦は先頭から初期残機・得点 0', () => {
  const g = createGame({ stage: 5, god: true, noEnemies: true });
  debugWarpBoss(g); toPlay(g); g.player.x = g.def.boss.x0 + 4; run(g, { right: true }, 10); run(g, {}, 200);
  g.boss.hp = 0.5; g.boss.hittable = true;
  g.shots.push({ kind: 'lance', x: g.boss.x, y: g.boss.y + 1, px: 0, py: 0, vx: 0, vy: 0, dist: 0, w: 3, h: 3, hits: new Set(), t: 0, face: 1 });
  let t = 0; while (g.mode !== 'ending' && t++ < 60 * 30) { g.boss && (g.boss.hittable = true); step(g, {}); }
  assert.equal(g.mode, 'ending');
  const g2 = createGame({ stage: 2 }); g2.score = 999; g2.lives = 0; retryStage(g2);
  assert.equal(g2.score, 0); assert.equal(g2.lives, DIFFICULTY.hard.lives); assert.equal(g2.stageIndex, 2); assert.equal(g2.cp, -1);
  const g3 = createGame({ stage: 0 }); g3.weapon = 'axe'; nextStage(g3); assert.equal(g3.stageIndex, 1); assert.equal(g3.weapon, 'axe');
});
