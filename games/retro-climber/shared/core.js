// 鉄骨レスキュー — ゲームの論理（2D と VR で共通。描画・音・入力の実装を知らない）。
// 60Hz 固定刻みの決定的シミュレーション。乱数は状態に持つ。座標はメートル（x 右・y 上）。
// 入力は 1 tick ごとに { x, y, jump, act, grab, jumpPressed, actPressed, grabPressed } を受け取る（押した瞬間は呼び出し側で 1 回だけ立てる）。
// 起きたことは g.events に { type, ... } で積む（音・演出は呼び出し側が 1 回だけ鳴らす）。
import { DT, DIFFICULTY, MOVE, BARREL, CRATE, BOLT, BOT, HAMMER, DEVICE, SCORE, LIFE, TIMING } from './config.js';
import { STAGES, TUTORIAL, surfaceY, stageById } from './stages.js';

export { DT };
const EPS = 1e-6;

function rng(state) {
  // mulberry32（状態は g.seed に保存する）
  let t = (state.seed = (state.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------ 生成
export function createGame({ difficulty = 'normal', stage = 0, seed = 12345, practice = false, mode = '2d', lives = null, score = 0, ladderNeedsGrab = false } = {}) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const g = {
    difficulty: diff.id, diff, mode, practice, seed: seed >>> 0, tick: 0,
    score, lives: lives ?? diff.lives, events: [], ladderNeedsGrab,
    stageIdx: stage, stage: null, phase: 'intro', phaseT: 0,
    nextId: 1, snapshot: null, stats: { misses: 0, jumps: 0, smashes: 0 },
    runFromStart: !practice && stage === 0,
  };
  startStage(g, stage);
  return g;
}

export function startStage(g, index) {
  const st = index === 'tutorial' || index === -1 ? TUTORIAL : STAGES[index];
  g.stageIdx = st.index; g.stage = st;
  g.time = st.tutorial ? 999 : g.diff.time;
  g.phase = 'intro'; g.phaseT = 0; g.elapsed = 0;
  g.barrels = []; g.crates = []; g.bolts = []; g.pops = [];
  g.hammers = (st.hammers || []).map((h, i) => ({ id: 'h' + i, x: h.x, y: surfaceY(st.byId[h.plat], h.x) + 0.55, taken: false }));
  g.devices = (st.devices || []).map((d) => ({ order: d.order, x: d.x, y: surfaceY(st.byId[d.plat], d.x), done: false, plat: d.plat }));
  g.nextDevice = 1;
  g.bots = (st.bots || []).map((b, i) => ({ id: 'bot' + i, plat: b.plat, a: b.a, b: b.b, x: b.x, y: surfaceY(st.byId[b.plat], b.x), dir: b.dir, alive: true, pause: 0, prevRel: 0, jumped: false }));
  g.boss = st.boss ? { x: st.boss.x, y: surfaceY(st.byId[st.boss.plat], st.boss.x), state: 'idle', t: 0, timer: 1.6, mood: 0, defeated: false, fallY: 0 } : null;
  g.captive = st.captive ? { x: st.captive.x, y: surfaceY(st.byId[st.captive.plat], st.captive.x), state: 'idle', t: 0 } : null;
  g.lifts = (st.lifts || []).map((l, li) => {
    const n = Math.ceil((l.yMax - l.yMin) / l.gap) + 1, cars = [];
    for (let i = 0; i < n; i++) cars.push({ id: `lift${li}_${i}`, y: l.yMin + i * l.gap, prevY: 0 });
    return { ...l, cars, spawnT: 0 };
  });
  for (const l of g.lifts) for (const c of l.cars) c.prevY = c.y;
  g.dispT = (st.dispensers || []).map((d) => d.phase);
  g.boltT = st.bolts ? 1.0 : 0;
  g.tut = st.tutorial ? { step: 0, flags: {}, spawned: 0 } : null;
  const sp = st.byId[st.spawn.plat];
  g.player = makePlayer(st.spawn.x, surfaceY(sp, st.spawn.x), sp.id);
  g.checkpoint = 'start';
  if (st.tutorial) for (const p of st.props || []) if (p.type === 'crate') g.crates.push(makeCrate(g, p.x, st.byId[p.plat], true));
  takeSnapshot(g);
  g.events.push({ type: 'stageStart', stage: st.id });
}

function makePlayer(x, y, plat) {
  return { x, y, vx: 0, vy: 0, facing: 1, state: 'ground', plat, coyote: 0, jumpBuf: 0, ladder: null,
    hammerT: 0, swingCd: 0, swingT: 0, invT: LIFE.invuln, airStartY: y, airHit: false, landT: 0, walkPhase: 0,
    prevX: x, prevY: y, moving: false, climbDir: 0, deadT: 0, deathCause: null };
}
function makeCrate(g, x, p, still = false) {
  return { id: 'c' + g.nextId++, x, y: surfaceY(p, x), vx: 0, vy: 0, plat: p.id, state: 'ride', still, prevRel: 0, jumped: false, spin: 0 };
}

// ------------------------------------------------------------ 復帰点（スナップショット）
const SNAP_KEYS = ['time', 'score', 'barrels', 'crates', 'bolts', 'hammers', 'devices', 'nextDevice', 'bots', 'boss', 'captive', 'lifts', 'dispT', 'boltT', 'seed', 'elapsed', 'checkpoint'];
function takeSnapshot(g, spawn = null) {
  const s = {};
  for (const k of SNAP_KEYS) s[k] = structuredClone(g[k]);
  const st = g.stage;
  const sp = spawn || st.spawn;
  s.spawn = { x: sp.x, plat: sp.plat };
  g.snapshot = s;
}
function restoreSnapshot(g) {
  const s = g.snapshot;
  for (const k of SNAP_KEYS) g[k] = structuredClone(s[k]);
  g.time = Math.max(g.time, Math.min(LIFE.minRestoreTime, g.stage.tutorial ? 999 : g.diff.time));
  const p0 = g.stage.byId[s.spawn.plat];
  const p = makePlayer(s.spawn.x, surfaceY(p0, s.spawn.x), p0.id);
  g.player = p;
  // 安全な出現余白: 復帰地点の近くにある危険を片付ける
  const near = (o) => Math.hypot(o.x - p.x, o.y - p.y) < LIFE.safeRadius;
  g.barrels = g.barrels.filter((b) => !near(b));
  g.crates = g.crates.filter((c) => c.still || !near(c));
  g.bolts = g.bolts.filter((b) => !near(b));
  for (const b of g.bots) if (b.alive && near(b)) { b.x = Math.abs(b.a - p.x) > Math.abs(b.b - p.x) ? b.a : b.b; b.dir = b.x === b.a ? 1 : -1; }
  if (g.boss) g.boss.timer = Math.max(g.boss.timer, 1.5);
  g.phase = 'play'; g.phaseT = 0;
  g.events.push({ type: 'respawn' });
}

// ------------------------------------------------------------ 足場の問い合わせ
function staticPlatforms(g) { return g.stage.platforms; }
function liftPlatforms(g) {
  const out = [];
  for (const l of g.lifts) for (const c of l.cars) {
    if (c.y < l.yMin - 0.01 || c.y > l.yMax + 0.01) continue;
    out.push({ id: c.id, x0: l.x - l.w / 2, x1: l.x + l.w / 2, y0: c.y, y1: c.y, kind: 'lift', thick: 0.22, flow: 1, dy: c.y - c.prevY, lift: l });
  }
  return out;
}
function allPlatforms(g) { return staticPlatforms(g).concat(liftPlatforms(g)); }
function platById(g, id) { return g.stage.byId[id] || liftPlatforms(g).find((p) => p.id === id); }
const inX = (p, x, pad = 0) => x >= p.x0 - pad && x <= p.x1 + pad;

// 落下中に着地する足場（上から通り抜けたか）
function landing(plats, x, prevFeet, feet, pad = 0) {
  let best = null, bestY = -Infinity;
  for (const p of plats) {
    if (!inX(p, x, pad)) continue;
    const s = surfaceY(p, x);
    const prevS = p.dy != null ? s - p.dy : s;
    if (prevFeet >= prevS - 0.02 - EPS && feet <= s + EPS && s > bestY) { best = p; bestY = s; }
  }
  return best ? { p: best, y: bestY } : null;
}

// ------------------------------------------------------------ 1 tick
export function step(g, inp = {}) {
  g.events.length = 0;
  g.tick++;
  g.phaseT += DT;
  const st = g.stage;
  if (g.phase === 'intro') {
    tickWorld(g, true);
    if (g.phaseT >= (st.tutorial ? 0.6 : TIMING.introTime)) { g.phase = 'play'; g.phaseT = 0; g.events.push({ type: 'go' }); }
    return g;
  }
  if (g.phase === 'gameover' || g.phase === 'ending' || g.phase === 'tutorialDone') return g;
  if (g.phase === 'clear') {
    animatePlayerIdle(g);
    if (g.phaseT >= TIMING.clearTime) { g.phase = 'stageDone'; g.events.push({ type: 'stageDone' }); }
    return g;
  }
  if (g.phase === 'stageDone') return g;
  if (g.phase === 'rescue') {
    tickRescue(g);
    if (g.phaseT >= TIMING.rescueTime) { g.phase = 'ending'; g.events.push({ type: 'ending' }); }
    return g;
  }
  if (g.phase === 'dying') {
    const p = g.player; p.deadT += DT;
    if (p.deathCause === 'fall' || p.deathCause === 'crush') { p.vy = Math.max(p.vy - MOVE.gravity * DT, -8); p.y += p.vy * DT; }
    if (g.phaseT >= LIFE.dyingTime) {
      if (g.lives <= 0) { g.phase = 'gameover'; g.phaseT = 0; g.events.push({ type: 'gameover' }); }
      else restoreSnapshot(g);
    }
    return g;
  }
  // play
  g.elapsed += DT;
  if (!st.tutorial) {
    const before = Math.ceil(g.time);
    g.time = Math.max(0, g.time - DT);
    if (Math.ceil(g.time) !== before && g.time <= 30 && g.time > 0) g.events.push({ type: 'timeWarn', sec: Math.ceil(g.time) });
  }
  tickWorld(g, false);
  tickPlayer(g, inp);
  if (g.phase === 'play') collide(g);
  if (g.phase === 'play' && !st.tutorial && g.time <= 0) miss(g, 'time');
  if (g.phase === 'play') checkProgress(g);
  return g;
}

// ------------------------------------------------------------ 主人公
function tickPlayer(g, inp) {
  const p = g.player, st = g.stage;
  p.prevX = p.x; p.prevY = p.y;
  const ix = Math.abs(inp.x || 0) > 0.25 ? Math.sign(inp.x) * Math.min(1, Math.abs(inp.x)) : 0;
  const iy = Math.abs(inp.y || 0) > 0.35 ? Math.sign(inp.y) : 0;
  if (p.invT > 0) p.invT = Math.max(0, p.invT - DT);
  if (p.hammerT > 0) { p.hammerT = Math.max(0, p.hammerT - DT); if (p.hammerT === 0) g.events.push({ type: 'hammerEnd' }); }
  if (p.swingCd > 0) p.swingCd = Math.max(0, p.swingCd - DT);
  if (p.swingT > 0) p.swingT = Math.max(0, p.swingT - DT);
  if (p.landT > 0) p.landT = Math.max(0, p.landT - DT);
  if (inp.jumpPressed) p.jumpBuf = MOVE.jumpBuffer; else p.jumpBuf = Math.max(0, p.jumpBuf - DT);
  const plats = allPlatforms(g);

  // --- 道具・装置（明示入力。地上だけ）
  if (inp.actPressed) {
    const dev = p.state === 'ground' ? nearDevice(g) : null;
    if (dev) operateDevice(g, dev);
    else if (p.hammerT > 0 && p.state === 'ground' && p.swingCd <= 0) {
      p.swingT = HAMMER.swing; p.swingCd = HAMMER.cooldown; g.events.push({ type: 'swing' });
    } else if (p.hammerT > 0 && p.state !== 'ground') g.events.push({ type: 'swingDenied' });
  }

  // --- はしご
  if (p.state === 'climb') {
    const l = p.ladder;
    let dy = iy;
    if (g.ladderNeedsGrab && inp.grabPressed) { // VR: もう一度つかむボタンで手を離す
      p.state = 'air'; p.ladder = null; p.vy = 0; p.coyote = 0; p.airStartY = p.y; p.airHit = false; g.events.push({ type: 'release' });
      return;
    }
    p.climbDir = dy;
    p.y += dy * MOVE.climb * DT;
    if (dy) { p.walkPhase += DT * 6; if (Math.floor(p.walkPhase / Math.PI) !== Math.floor((p.walkPhase - DT * 6) / Math.PI)) g.events.push({ type: 'climbStep' }); }
    if (p.y >= l.y1) { p.y = l.y1; if (dy > 0) { p.state = 'ground'; p.plat = l.hi; p.ladder = null; g.events.push({ type: 'ladderOff' }); } }
    if (p.y <= l.y0) { p.y = l.y0; if (dy < 0) { p.state = 'ground'; p.plat = l.lo; p.ladder = null; g.events.push({ type: 'ladderOff' }); } }
    p.vx = 0;
    return;
  }

  if (p.state === 'ground') {
    const wantLadder = g.ladderNeedsGrab ? inp.grabPressed : iy !== 0;
    if (wantLadder) {
      const l = findLadder(g, p, g.ladderNeedsGrab ? 0 : iy);
      if (l) {
        p.state = 'climb'; p.ladder = l; p.x = l.x; p.vx = 0; p.climbDir = 0;
        if (Math.abs(p.y - l.y1) < Math.abs(p.y - l.y0)) p.y = l.y1 - 0.02; else p.y = l.y0 + 0.02;
        g.events.push({ type: 'ladderOn' });
        return;
      } else if (g.ladderNeedsGrab && inp.grabPressed) g.events.push({ type: 'grabMiss' });
    }
  }

  // --- 横移動
  const target = ix * MOVE.walk;
  if (p.state === 'ground') p.vx = target;
  else { const dv = target - p.vx, m = MOVE.airAccel * DT; p.vx += Math.max(-m, Math.min(m, dv)); }
  if (ix) p.facing = ix > 0 ? 1 : -1;
  p.moving = p.state === 'ground' && ix !== 0;

  // --- ジャンプ（地上から 1 回。コヨーテタイムと入力バッファ）
  const canJump = p.state === 'ground' || (p.state === 'air' && p.coyote > 0 && p.vy <= 0);
  if (p.jumpBuf > 0 && canJump) {
    p.state = 'air'; p.vy = MOVE.jumpV; p.jumpBuf = 0; p.coyote = 0; p.airStartY = p.y; p.airHit = false; p.jumping = true;
    g.stats.jumps++;
    g.events.push({ type: 'jump' });
  }

  // --- ベルト・昇降機に運ばれる
  if (p.state === 'ground') {
    const cur = platById(g, p.plat);
    if (cur && cur.belt) p.x += cur.belt * DT;
    if (cur && cur.kind === 'lift') p.y += cur.dy;
  }

  p.x += p.vx * DT;
  const half = MOVE.width / 2;
  p.x = Math.max(half, Math.min(st.width - half, p.x));
  if (p.moving) {
    const before = p.walkPhase; p.walkPhase += DT * Math.abs(p.vx) * 3.4;
    if (Math.floor(before / Math.PI) !== Math.floor(p.walkPhase / Math.PI)) g.events.push({ type: 'step' });
  }

  if (p.state === 'ground') {
    const cur = platById(g, p.plat);
    if (cur && inX(cur, p.x, 0.04)) {
      p.y = surfaceY(cur, p.x);
    } else {
      // 継ぎ目: 隣の足場へ歩いて移れるか
      let next = null;
      for (const q of plats) if (q !== cur && inX(q, p.x) && Math.abs(surfaceY(q, p.x) - p.y) <= MOVE.stepUp) next = q;
      if (next) { p.plat = next.id; p.y = surfaceY(next, p.x); }
      else { p.state = 'air'; p.vy = 0; p.coyote = MOVE.coyote; p.airStartY = p.y; p.airHit = false; p.jumping = false; }
    }
  } else if (p.state === 'air') {
    if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - DT);
    const prevFeet = p.y, prevHead = p.y + MOVE.height;
    p.vy = Math.max(-MOVE.maxFall, p.vy - MOVE.gravity * DT);
    p.y += p.vy * DT;
    // 頭上の衝突（足場の下面）
    if (p.vy > 0) {
      for (const q of plats) {
        if (!inX(q, p.x, -0.05)) continue;
        const under = surfaceY(q, p.x) - q.thick;
        if (prevHead <= under + EPS && p.y + MOVE.height > under) { p.y = under - MOVE.height; p.vy = 0; g.events.push({ type: 'bonk' }); break; }
      }
    }
    if (p.vy <= 0) {
      const hit = landing(plats, p.x, prevFeet, p.y, 0.02);
      if (hit) {
        p.y = hit.y; p.vy = 0; p.state = 'ground'; p.plat = hit.p.id; p.landT = 0.16; p.jumping = false;
        g.events.push({ type: 'land', drop: p.airStartY - p.y });
      }
    }
    if (p.y < (st.pitY ?? -1.2) - 0.4) miss(g, 'fall');
  }
}

function findLadder(g, p, dir) {
  let best = null, bd = 1e9;
  for (const l of g.stage.ladders) {
    if (l.broken) continue;
    const dx = Math.abs(l.x - p.x);
    if (dx > MOVE.ladderSnap) continue;
    const atBottom = Math.abs(p.y - l.y0) < MOVE.ladderEndSnap;
    const atTop = Math.abs(p.y - l.y1) < MOVE.ladderEndSnap;
    if (dir > 0 && !atBottom) continue;
    if (dir < 0 && !atTop) continue;
    if (dir === 0 && !atBottom && !atTop) continue;
    if (dx < bd) { bd = dx; best = l; }
  }
  return best;
}

export function nearDevice(g) {
  const p = g.player;
  let best = null, bd = 1e9;
  for (const d of g.devices) {
    const dx = Math.abs(d.x - p.x), dy = Math.abs(d.y - p.y);
    if (dx <= DEVICE.reachX && dy <= DEVICE.reachY && dx < bd) { best = d; bd = dx; }
  }
  return best;
}
function operateDevice(g, d) {
  if (d.done) { g.events.push({ type: 'deviceAlready', order: d.order }); return; }
  if (d.order !== g.nextDevice) { g.events.push({ type: 'deviceWrong', order: d.order, need: g.nextDevice }); return; }
  d.done = true; g.nextDevice++;
  addScore(g, SCORE.device, d.x, d.y + 1.2);
  g.events.push({ type: 'device', order: d.order, x: d.x, y: d.y });
  if (g.tut) g.tut.flags.device = true;
  if (g.devices.length && g.devices.every((q) => q.done) && !g.stage.tutorial) {
    g.phase = 'rescue'; g.phaseT = 0;
    if (g.boss) { g.boss.state = 'defeat'; g.boss.t = 0; g.boss.defeated = true; }
    const bonus = SCORE.clear + Math.ceil(g.time) * SCORE.perSecond;
    g.clearBonus = bonus; g.score += bonus;
    g.events.push({ type: 'rescue', bonus });
  }
}

function addScore(g, n, x, y) {
  g.score += n;
  g.pops.push({ x, y, n, t: 0 });
  if (g.pops.length > 16) g.pops.shift();
}

// ------------------------------------------------------------ 世界（樽・木箱・ボルト・ロボ・昇降機・巨大な敵）
function tickWorld(g, frozen) {
  const st = g.stage;
  for (const pp of g.pops) pp.t += DT;
  g.pops = g.pops.filter((pp) => pp.t < 1.0);
  // 昇降機
  for (const l of g.lifts) {
    for (const c of l.cars) { c.prevY = c.y; c.y += l.dir * l.speed * DT; }
    const span = l.gap * l.cars.length;
    for (const c of l.cars) {
      if (l.dir > 0 && c.y > l.yMax + 0.6) { c.y -= span; c.prevY = c.y; }
      if (l.dir < 0 && c.y < l.yMin - 0.6) { c.y += span; c.prevY = c.y; }
    }
  }
  if (frozen) return;
  tickBoss(g);
  // 木箱の払い出し
  (st.dispensers || []).forEach((d, i) => {
    g.dispT[i] -= DT;
    if (g.dispT[i] <= 0) { g.dispT[i] += d.period * g.diff.hazardScale; g.crates.push(makeCrate(g, d.x, st.byId[d.plat])); g.events.push({ type: 'crateOut', x: d.x }); }
  });
  for (const b of g.barrels) tickBarrel(g, b);
  g.barrels = g.barrels.filter((b) => !b.gone);
  for (const c of g.crates) tickCrate(g, c);
  g.crates = g.crates.filter((c) => !c.gone);
  for (const b of g.bolts) tickBolt(g, b);
  g.bolts = g.bolts.filter((b) => !b.gone);
  for (const b of g.bots) tickBot(g, b);
  if (g.tut) tickTutorialWorld(g);
}

function tickBoss(g) {
  const b = g.boss; if (!b || b.defeated) return;
  const st = g.stage, def = st.boss;
  b.t += DT;
  const p = g.player;
  b.mood += ((p.y > b.y - 3 ? 1 : 0) - b.mood) * Math.min(1, DT * 2);
  if (b.state === 'idle') {
    b.timer -= DT;
    if (b.timer <= 0 && g.phase === 'play') { b.state = 'lift'; b.t = 0; g.events.push({ type: 'lift', x: b.x, y: b.y }); if (g.captive) { g.captive.state = 'scared'; g.captive.t = 0; } }
  } else if (b.state === 'lift') {
    if (b.t >= TIMING.throwLift) { b.state = 'throw'; b.t = 0; spawnThrown(g); g.events.push({ type: 'throw', x: b.x, y: b.y, kind: def.kind }); }
  } else if (b.state === 'throw') {
    if (b.t >= 0.45) {
      b.state = 'idle'; b.t = 0;
      const base = def.kind === 'bolt' ? st.bolts.period * g.diff.hazardScale : g.diff.barrelInterval * (def.slow || 1);
      b.timer = base * (0.85 + rng(g) * 0.3);
    }
  }
  if (g.captive && g.captive.state === 'scared') { g.captive.t += DT; if (g.captive.t > 1.6) g.captive.state = 'idle'; }
}

function spawnThrown(g) {
  const st = g.stage, def = st.boss, b = g.boss;
  if (def.kind === 'bolt') {
    g.bolts.push({ id: 'b' + g.nextId++, x: st.bolts.x, y: st.bolts.y, vx: BOLT.speed, vy: BOLT.hopV, state: 'hop', prevRel: 0, jumped: false, spin: 0 });
    return;
  }
  const plat = st.byId[def.plat];
  const x = b.x + def.throwDir * 0.9;
  g.barrels.push({ id: 'r' + g.nextId++, x, y: surfaceY(plat, x), vx: 0, vy: 0, plat: plat.id, state: 'roll', dir: def.throwDir,
    speed: g.diff.barrelSpeed, spin: 0, ladderSeen: {}, ladder: null, prevRel: 0, jumped: false, warn: 0.5 });
}

function tickBarrel(g, b) {
  const st = g.stage, r = BARREL.radius;
  b.warn = Math.max(0, (b.warn || 0) - DT);
  if (b.state === 'roll') {
    const p = st.byId[b.plat];
    const v = p.belt ? b.speed * 0.85 + Math.abs(p.belt) * 0.3 : b.speed;
    b.dir = p.flow;
    b.x += b.dir * v * DT;
    b.spin += b.dir * v * DT / r;
    // はしごを下りるか（はしごの上端ごとに 1 回だけ判定。主人公が下にいると少し下りやすい）
    for (const l of st.ladders) {
      if (l.hi !== p.id || b.ladderSeen[l.x]) continue;
      if (Math.abs(b.x - l.x) < 0.06) {
        b.ladderSeen[l.x] = true;
        const below = g.player.y < l.y1 - 0.5 && Math.abs(g.player.x - l.x) < 4 ? 0.12 : 0;
        if (rng(g) < g.diff.ladderChance + below) { b.state = 'ladder'; b.ladder = l; b.x = l.x; g.events.push({ type: 'barrelLadder', x: l.x, y: l.y1 }); return; }
      }
    }
    if (p.sink != null && b.x <= p.sink) { b.gone = true; g.events.push({ type: 'sink', x: b.x, y: b.y }); return; }
    if (!inX(p, b.x)) { b.state = 'fall'; b.vx = b.dir * BARREL.fallVx; b.vy = 0; b.plat = null; return; }
    b.y = surfaceY(p, b.x);
  } else if (b.state === 'ladder') {
    const l = b.ladder;
    b.y -= BARREL.ladderSpeed * DT;
    if (b.y <= l.y0) { b.y = l.y0; b.state = 'roll'; b.plat = l.lo; b.ladder = null; b.ladderSeen = {}; g.events.push({ type: 'barrelBounce', x: b.x, y: b.y }); }
  } else if (b.state === 'fall') {
    const prev = b.y;
    b.vy = Math.max(-12, b.vy - MOVE.gravity * DT);
    b.x += b.vx * DT; b.y += b.vy * DT;
    b.spin += b.vx * DT / r;
    const hit = landing(st.platforms, b.x, prev, b.y);
    if (hit) { b.y = hit.y; b.state = 'roll'; b.plat = hit.p.id; b.ladderSeen = {}; g.events.push({ type: 'barrelBounce', x: b.x, y: b.y }); }
    if (b.y < BARREL.removeBelow + (st.pitY ?? 0)) b.gone = true;
  }
}

function tickCrate(g, c) {
  const st = g.stage;
  if (c.still) return;
  if (c.state === 'ride') {
    const p = st.byId[c.plat];
    c.x += (p.belt || 0) * DT;
    if (!inX(p, c.x, 0.1)) { c.state = 'fall'; c.vx = Math.sign(p.belt || 1) * 0.6; c.vy = 0; g.events.push({ type: 'crateDrop', x: c.x, y: c.y }); }
    else c.y = surfaceY(p, c.x);
  } else {
    c.vy -= MOVE.gravity * DT; c.x += c.vx * DT; c.y += c.vy * DT; c.spin += c.vx * DT * 2;
    // 木箱はベルト端のホッパー（足場の下 1.2m）へ落ちて消える
    if (c.y < surfaceY(st.byId[c.plat], c.x) - 1.4) c.gone = true;
  }
}

function tickBolt(g, b) {
  const st = g.stage, cfg = st.bolts;
  b.spin += DT * 10;
  if (b.state === 'hop') {
    b.vy -= MOVE.gravity * DT; b.x += b.vx * DT; b.y += b.vy * DT;
    if (b.y <= cfg.y && b.vy < 0) { b.y = cfg.y; b.vy = BOLT.hopV; g.events.push({ type: 'boltHop', x: b.x, y: b.y }); }
    if (b.x >= cfg.endX) { b.state = 'drop'; b.vx = 0; b.vy = 0; }
  } else {
    b.vy -= MOVE.gravity * DT; b.y += b.vy * DT;
    if (b.y < -2) b.gone = true;
  }
}

function tickBot(g, b) {
  if (!b.alive) return;
  if (b.pause > 0) { b.pause -= DT; return; }
  b.x += b.dir * BOT.speed * DT;
  if (b.x <= b.a) { b.x = b.a; b.dir = 1; b.pause = 0.5; }
  if (b.x >= b.b) { b.x = b.b; b.dir = -1; b.pause = 0.5; }
  b.y = surfaceY(g.stage.byId[b.plat], b.x);
  b.spark = (b.spark || 0) + DT;
}

function tickRescue(g) {
  const b = g.boss, c = g.captive, p = g.player;
  if (b) { b.t += DT; b.fallY = b.t > 1.2 ? Math.min(14, (b.t - 1.2) ** 2 * 5) : 0; }
  if (c) { c.state = 'happy'; c.t += DT; }
  p.prevX = p.x; p.prevY = p.y;
  for (const l of g.lifts) for (const car of l.cars) car.prevY = car.y;
}

function animatePlayerIdle(g) {
  const p = g.player; p.prevX = p.x; p.prevY = p.y; p.vx = 0; p.moving = false;
  if (g.captive) { g.captive.state = 'happy'; g.captive.t += DT; }
}

// ------------------------------------------------------------ 当たり
function overlapCircle(px, py, w, h, cx, cy, r) {
  const nx = Math.max(px - w / 2, Math.min(cx, px + w / 2));
  const ny = Math.max(py, Math.min(cy, py + h));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
}
function overlapBox(px, py, w, h, bx, by, bw, bh) {
  return Math.abs(px - bx) * 2 < w + bw && py < by + bh && py + h > by;
}

function collide(g) {
  const p = g.player;
  // 当たりは見た目より少し小さく（理不尽な接触を減らす）
  const w = MOVE.width * 0.8, h = MOVE.height * 0.88, py = p.y + 0.04;
  const swingActive = p.swingT > 0 && p.swingT <= HAMMER.swing - HAMMER.activeFrom;
  const hx0 = p.x + p.facing * 0.1, hx1 = p.x + p.facing * HAMMER.reach;
  const inSwing = (x, y, r) => swingActive && x + r >= Math.min(hx0, hx1) && x - r <= Math.max(hx0, hx1) && y + r >= p.y - 0.1 && y - r <= p.y + HAMMER.height;

  const obstacles = [];
  for (const b of g.barrels) obstacles.push({ o: b, kind: 'barrel', cx: b.x, cy: b.y + BARREL.radius, r: BARREL.radius, top: b.y + 2 * BARREL.radius, ground: b.y });
  for (const c of g.crates) obstacles.push({ o: c, kind: 'crate', box: true, cx: c.x, cy: c.y + CRATE.h / 2, r: CRATE.w / 2, top: c.y + CRATE.h, ground: c.y });
  for (const b of g.bolts) obstacles.push({ o: b, kind: 'bolt', cx: b.x, cy: b.y + BOLT.radius, r: BOLT.radius, top: b.y + 2 * BOLT.radius, ground: b.state === 'hop' ? g.stage.bolts.y : b.y });
  for (const b of g.bots) if (b.alive) obstacles.push({ o: b, kind: 'bot', box: true, cx: b.x, cy: b.y + BOT.h / 2, r: BOT.w / 2, top: b.y + BOT.h, ground: b.y });

  for (const ob of obstacles) {
    const o = ob.o;
    // ハンマー
    if (ob.kind !== 'bolt' && inSwing(ob.cx, ob.cy, ob.r)) {
      if (ob.kind === 'bot') o.alive = false; else o.gone = true;
      if (ob.kind === 'crate' && o.still && g.tut) o.gone = true;
      addScore(g, SCORE.smash, ob.cx, ob.cy + 0.6);
      g.stats.smashes++;
      g.events.push({ type: 'smash', kind: ob.kind, x: ob.cx, y: ob.cy });
      if (g.tut && ob.kind === 'barrel') g.tut.flags.smash = true;
      continue;
    }
    // 接触
    const hit = ob.box ? overlapBox(p.x, py, w, h, ob.cx, ob.cy - (ob.top - ob.ground) / 2, ob.r * 2 * 0.9, (ob.top - ob.ground) * 0.9)
                       : overlapCircle(p.x, py, w, h, ob.cx, ob.cy, ob.r * 0.92);
    if (hit) {
      if (ob.kind === 'crate' && o.still) {
        // 練習用の木箱は壁として扱う
        p.x = p.prevX; continue;
      }
      if (p.invT > 0) { p.airHit = true; continue; }
      miss(g, ob.kind); return;
    }
    // 跳び越し: 空中で、その障害物の上を横切り、この跳躍で何にも触れていないとき 1 回だけ
    const rel = Math.sign(ob.cx - p.x) || o.prevRel;
    if (p.state === 'air' && !o.jumped && o.prevRel && rel !== o.prevRel && !p.airHit
        && p.y >= ob.top - 0.05 && p.y <= ob.top + 2.2 && ob.ground >= p.airStartY - 0.6 && ob.ground <= p.airStartY + 0.35) {
      o.jumped = true;
      addScore(g, SCORE.jumpOver, ob.cx, ob.top + 0.8);
      g.events.push({ type: 'jumpOver', kind: ob.kind, x: ob.cx, y: ob.top });
      if (g.tut && (ob.kind === 'barrel')) g.tut.flags.jumpBarrel = true;
      if (g.tut && ob.kind === 'crate') g.tut.flags.jumpCrate = true;
    }
    o.prevRel = rel;
  }
  g.barrels = g.barrels.filter((b) => !b.gone);
  g.crates = g.crates.filter((c) => !c.gone);

  // 蒸気
  for (const v of g.stage.vents || []) {
    const s = ventState(g, v);
    if (s.state !== 'on') continue;
    const vy = surfaceY(g.stage.byId[v.plat], v.x);
    if (overlapBox(p.x, py, w, h, v.x, vy, v.w * 0.8, v.h)) { if (p.invT <= 0) { miss(g, 'steam'); return; } }
  }
  // 昇降機の天井
  if (p.state === 'ground') {
    const cur = platById(g, p.plat);
    if (cur && cur.kind === 'lift' && cur.lift.dir > 0 && p.y + MOVE.height >= cur.lift.crushY) { miss(g, 'crush'); return; }
  }
  // ハンマーを拾う
  for (const hm of g.hammers) {
    if (!hm.taken && !hm.locked && Math.abs(hm.x - p.x) < 0.45 && hm.y > p.y - 0.2 && hm.y < p.y + MOVE.height + 0.5) {
      hm.taken = true; p.hammerT = HAMMER.duration; g.events.push({ type: 'hammer', x: hm.x, y: hm.y });
      if (g.tut) g.tut.flags.hammer = true;
    }
  }
}

export function ventState(g, v) {
  const per = v.period * g.diff.hazardScale;
  const t = ((g.elapsed + v.phase * g.diff.hazardScale) % per + per) % per;
  const off = per - v.warn - v.on;
  if (t < off) return { state: 'off', k: t / off };
  if (t < off + v.warn) return { state: 'warn', k: (t - off) / v.warn };
  return { state: 'on', k: (t - off - v.warn) / v.on };
}

// ------------------------------------------------------------ ミス（同じ事故で 1 回だけ）
export function miss(g, cause) {
  if (g.phase !== 'play') return false;
  const p = g.player;
  g.phase = 'dying'; g.phaseT = 0;
  p.state = 'dead'; p.deathCause = cause; p.deadT = 0; p.vx = 0;
  p.vy = cause === 'fall' ? Math.min(p.vy, 0) : cause === 'crush' ? 0 : 0;
  p.hammerT = 0; p.swingT = 0;
  if (!g.stage.tutorial) { g.lives = Math.max(0, g.lives - 1); g.stats.misses++; }
  g.events.push({ type: 'miss', cause, lives: g.lives });
  return true;
}

// ------------------------------------------------------------ 進行
function checkProgress(g) {
  const p = g.player, st = g.stage;
  if (st.tutorial) { tutorialProgress(g); return; }
  // やさしい: 中間地点
  if (g.diff.midCheckpoint && st.mid && g.checkpoint === 'start' && p.state === 'ground' && p.plat === st.mid.plat) {
    g.checkpoint = 'mid';
    takeSnapshot(g, st.mid);
    g.events.push({ type: 'checkpoint' });
  }
  // 1〜3 面: ゴールの足場に立つ
  if (p.state === 'ground' && st.byId[p.plat] && st.byId[p.plat].goal) {
    g.phase = 'clear'; g.phaseT = 0;
    const bonus = SCORE.clear + Math.ceil(g.time) * SCORE.perSecond;
    g.clearBonus = bonus; g.score += bonus;
    g.barrels.length = 0; g.bolts.length = 0;
    if (g.boss) { g.boss.state = 'flee'; g.boss.t = 0; }
    g.events.push({ type: 'clear', bonus });
  }
}

// ------------------------------------------------------------ チュートリアル
function tickTutorialWorld(g) {
  const t = g.tut, st = g.stage;
  const id = st.steps[t.step]?.id;
  // ハンマーは「道具」の課題になってから置く。切れたら置き直す
  for (const hm of g.hammers) { hm.locked = id !== 'hammer'; if (id === 'hammer' && hm.taken && g.player.hammerT <= 0) hm.taken = false; }
  // 危険の見分け: 上段の右から、予告つきの遅い樽を転がす
  if ((id === 'danger' || id === 'hammer') && g.barrels.length === 0 && g.phase === 'play') {
    t.spawnT = (t.spawnT ?? 0.6) - DT;
    if (t.spawnT <= 0) {
      t.spawnT = id === 'hammer' ? 0.8 : 1.6;
      const plat = st.byId.U;
      const sx = id === 'hammer' ? 14.4 : 15.6;
      g.barrels.push({ id: 'r' + g.nextId++, x: sx, y: surfaceY(plat, sx), vx: 0, vy: 0, plat: 'U', state: 'roll', dir: -1,
        speed: 1.3, spin: 0, ladderSeen: { 9: true, 12.5: true }, ladder: null, prevRel: 0, jumped: false, warn: 1.2 });
      g.events.push({ type: 'throw', x: sx, y: plat.y0, kind: 'barrel' });
    }
  }
}
function tutorialProgress(g) {
  const t = g.tut, st = g.stage, p = g.player, step = st.steps[t.step];
  if (!step) return;
  let ok = false;
  if (step.id === 'move') ok = p.x >= step.zone.x;
  else if (step.id === 'jump') ok = t.flags.jumpCrate || p.x > 6.9;
  else if (step.id === 'ladder') ok = p.plat === 'U' && p.state === 'ground';
  else if (step.id === 'danger') ok = t.flags.jumpBarrel;
  else if (step.id === 'hammer') ok = t.flags.smash;
  else if (step.id === 'device') ok = t.flags.device;
  if (ok) {
    t.step++;
    g.events.push({ type: 'tutorialStep', step: t.step });
    // 復帰点を進める（ミスしても今の課題からやり直す）
    takeSnapshot(g, { x: p.x, plat: p.state === 'ground' ? p.plat : (p.y > 2 ? 'U' : 'G') });
    if (t.step >= st.steps.length) { g.phase = 'tutorialDone'; g.events.push({ type: 'tutorialDone' }); }
  }
}

// ------------------------------------------------------------ 補助（描画・HUD 用）
export function hudInfo(g) {
  return {
    score: g.score, lives: g.lives, time: Math.ceil(g.time), stage: g.stage, hammer: g.player.hammerT,
    nextDevice: g.devices.length ? g.nextDevice : null, devices: g.devices, phase: g.phase, practice: g.practice,
    tutorialStep: g.tut ? g.stage.steps[g.tut.step] : null, tutorialIndex: g.tut ? g.tut.step : 0,
  };
}
export function liftCars(g) { return liftPlatforms(g); }
export { stageById, surfaceY };
