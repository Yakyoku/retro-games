// 月影の魔城 — ゲームの中核（描画・音・入力の実装に依存しない純粋なロジック。Node でもブラウザでも動く）
// 60Hz 固定。乱数は状態に持つので、同じ入力列なら同じ結果になる（テストと到達確認に使う）。
import { TICK, PLAYER as P, DIFFICULTY, WEAPONS, SCORE, ENEMIES, BOSSES } from './config.js';
import { getStages, T } from './stages.js';

const VIEW_W = 24, VIEW_H = 13.5;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
function rng(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ================================================================ 生成
export function createGame(opts = {}) {
  const diff = DIFFICULTY[opts.difficulty || 'hard'];
  const g = {
    diff, loop: opts.loop || 1, seed: opts.seed || 12345, rand: rng(opts.seed || 12345),
    score: opts.score || 0, hi: opts.hi || 0, lives: opts.lives ?? diff.lives,
    noEnemies: !!opts.noEnemies, god: !!opts.god,
    tick: 0, events: [], mode: 'ready', modeT: 0, stageIndex: 0, stats: { kills: 0, deaths: 0, treasures: 0 },
    prevIn: {}, weapon: 'lance',
  };
  loadStage(g, opts.stage || 0, opts.checkpoint ?? -1);
  return g;
}

export function loadStage(g, index, cpIndex = -1) {
  const def = getStages()[index];
  g.stageIndex = index; g.def = def;
  g.cps = def.checkpoints.filter((c) => !c.easyOnly || g.diff.extraCheckpoints);
  g.cp = cpIndex; g.cpScore = g.score; g.stageStartScore = g.score;
  // 倒した敵・拾ったアイテムの記録。チェックポイントを通った時点の写しを残し、死亡で写しへ戻す（得点も同じ時点へ戻る）
  g.collected = new Set(); g.killed = new Set(); g.cpKilled = new Set(); g.cpCollected = new Set();
  g.weapon = 'lance';
  resetAttempt(g, true);
  emit(g, 'stageStart', { stage: index, name: def.name });
}

function spawnPoint(g) {
  if (g.cp >= 0) { const c = g.cps[g.cp]; return { x: c.x + 0.5, y: c.y }; }
  return { x: g.def.start.x, y: g.def.start.y };
}
function behindCp(g, x, y) {
  if (g.cp < 0) return false;
  const c = g.cps[g.cp];
  return g.def.vertical ? y < c.y - 1 : x < c.x - 1;
}

// 1 回の挑戦（ステージ開始・復活）の状態を作り直す。規則は「チェックポイントより手前のものは出さない、先のものは初期状態に戻す」
function resetAttempt(g, fresh) {
  const def = g.def;
  g.tiles = def.tiles.slice();
  const sp = spawnPoint(g);
  g.player = makePlayer(sp.x, sp.y);
  g.player.inv = fresh ? 0 : P.respawnInvuln;
  g.time = g.diff.time; g.tw = 0;
  g.shots = []; g.eshots = []; g.burns = []; g.fx = [];
  g.items = def.items.map((it, i) => ({ ...it, id: i, x: it.x, y: it.y, vy: 0, t: 0, ground: true })).filter((it) => !g.collected.has(it.id) && !behindCp(g, it.x, it.y));
  g.enemies = [];
  g.dormant = g.noEnemies ? [] : def.enemies.map((e, i) => ({ ...e, id: i })).filter((e) => !g.killed.has(e.id) && !behindCp(g, e.x, e.y)
    && Math.hypot(e.x - sp.x, e.y - sp.y) > 4.5);
  g.spawners = g.noEnemies ? [] : def.spawners.map((s) => ({ ...s, cd: 2.5, made: 0 }));
  g.movers = def.movers.map((m) => ({ ...m, cx: m.x, cy: m.y, dx: 0, dy: 0 }));
  g.jets = def.jets.map((j) => ({ ...j, on: false, warn: false }));
  g.boss = null; g.bossState = 'none'; g.lockCam = false;
  g.cam = { x: 0, y: 0 }; updateCamera(g, true); g.pcam = { ...g.cam };
  g.mode = 'ready'; g.modeT = fresh ? 2.4 : 1.0;
  g.spawnSafeT = 2.5;
  if (!fresh) emit(g, 'respawn', {});
}

function makePlayer(x, y) {
  return { x, y, px: x, py: y, vx: 0, vy: 0, face: 1, ground: true, onMover: -1, armor: true, inv: 0, crouch: false, climb: false, ladderX: 0,
    fireCD: 0, throwT: 0, hurtT: 0, deadT: 0, coyote: 0, buffer: 0, state: 'idle', st: 0, landT: 0, turnT: 0, drop: 0, cause: '', w: P.w, h: P.hStand,
    walkPhase: 0, climbPhase: 0, armorT: 0, dir: 0, safe: { x, y } };
}

export function emit(g, type, data = {}) { g.events.push({ type, ...data }); }

// ================================================================ 地形の問い合わせ
export function tile(g, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y), W = g.def.W;
  if (tx < 0 || tx >= W) return T.SOLID;
  if (ty < 0 || ty >= g.def.H) return T.EMPTY;
  return g.tiles[ty * W + tx];
}
const tileI = (g, tx, ty) => (tx < 0 || tx >= g.def.W ? T.SOLID : ty < 0 || ty >= g.def.H ? T.EMPTY : g.tiles[ty * g.def.W + tx]);
const isSolid = (g, tx, ty) => tileI(g, tx, ty) === T.SOLID;
function isTop(g, tx, ty, drop) {
  const v = tileI(g, tx, ty);
  if (v === T.SOLID) return tileI(g, tx, ty + 1) !== T.SOLID;
  if (drop) return false;
  if (v === T.PLAT) return true;
  if (v === T.LADDER) return tileI(g, tx, ty + 1) !== T.LADDER; // はしごの上端は上から乗れる
  return false;
}
// x の列で y 以下にある最初の立てる面（敵の出現位置探しなど）
export function surfaceBelow(g, x, y, depth = 12) {
  const tx = Math.floor(x);
  for (let ty = Math.floor(y) - 1; ty >= Math.floor(y) - depth && ty >= 0; ty--) {
    const v = tileI(g, tx, ty);
    if (v === T.LAVA || v === T.WATER) return null;
    if (isTop(g, tx, ty, false)) return ty + 1;
  }
  return null;
}
function moverPos(m, tw) {
  const k = 0.5 - 0.5 * Math.cos((tw * 2 * Math.PI) / m.period + m.phase);
  return { x: m.x + m.ax * k, y: m.y + m.ay * k };
}

// 体（足元中央 x,y、幅 w、高さ h）を動かす。地形は 1 tick 0.3u 未満しか動かないので抜けない
function moveBody(g, b, dt, opts = {}) {
  const hw = b.w / 2;
  b.hitWall = 0;
  if (b.vx) {
    let nx = b.x + b.vx * dt;
    const edge = b.vx > 0 ? nx + hw : nx - hw, tx = Math.floor(edge);
    for (let ty = Math.floor(b.y + 0.02); ty <= Math.floor(b.y + b.h - 0.02); ty++) {
      if (isSolid(g, tx, ty)) { nx = b.vx > 0 ? tx - hw - 1e-4 : tx + 1 + hw + 1e-4; b.hitWall = sign(b.vx); break; }
    }
    if (opts.gate != null && nx - hw < opts.gate) { nx = opts.gate + hw; b.hitWall = -1; }
    b.x = nx;
  }
  let ny = b.y + b.vy * dt;
  const wasGround = b.ground;
  b.ground = false; b.onMover = -1;
  const x0 = Math.floor(b.x - hw + 0.03), x1 = Math.floor(b.x + hw - 0.03);
  if (b.vy <= 0) {
    let land = null;
    for (let ty = Math.floor(b.y + 1e-4) - 1; ty + 1 >= ny - 1e-6 && ty >= -1; ty--) {
      const surf = ty + 1;
      if (surf > b.y + 1e-4) continue;
      for (let tx = x0; tx <= x1; tx++) if (isTop(g, tx, ty, b.drop > 0)) { land = surf; break; }
      if (land != null) break;
    }
    if (!opts.noMovers) for (let i = 0; i < g.movers.length; i++) {
      const m = g.movers[i];
      if (b.x + hw <= m.cx || b.x - hw >= m.cx + m.w) continue;
      if (b.y >= m.cy - 0.02 - Math.max(0, m.dy) && ny <= m.cy + 1e-4 && (land == null || m.cy > land)) { land = m.cy; b.onMover = i; }
    }
    if (land != null) { ny = land; b.vy = 0; b.ground = true; }
    else if (b.onMover >= 0) b.onMover = -1;
  } else {
    const head = ny + b.h, ty = Math.floor(head);
    if (ty > Math.floor(b.y + b.h - 1e-4)) for (let tx = x0; tx <= x1; tx++) if (isSolid(g, tx, ty)) { ny = ty - b.h - 1e-4; b.vy = 0; break; }
  }
  b.y = ny;
  b.landed = !wasGround && b.ground;
}
// 横へ押す（壁で止まる）。移動床に運ばれるときに使う
function pushX(g, b, dx) {
  if (!dx) return;
  const hw = b.w / 2; let nx = b.x + dx;
  const tx = Math.floor(dx > 0 ? nx + hw : nx - hw);
  for (let ty = Math.floor(b.y + 0.02); ty <= Math.floor(b.y + b.h - 0.02); ty++) if (isSolid(g, tx, ty)) { nx = dx > 0 ? tx - hw - 1e-4 : tx + 1 + hw + 1e-4; break; }
  b.x = nx;
}
function canStand(g, b) {
  const hw = b.w / 2;
  for (let ty = Math.floor(b.y + 1.0); ty <= Math.floor(b.y + P.hStand - 0.02); ty++)
    for (let tx = Math.floor(b.x - hw + 0.03); tx <= Math.floor(b.x + hw - 0.03); tx++) if (isSolid(g, tx, ty)) return false;
  return true;
}
function bodyTouches(g, b, kind, frac = 1) {
  const hw = b.w / 2 - 0.08;
  for (let ty = Math.floor(b.y + 0.05); ty <= Math.floor(b.y + b.h * frac); ty++)
    for (let tx = Math.floor(b.x - hw); tx <= Math.floor(b.x + hw); tx++) if (tileI(g, tx, ty) === kind) return true;
  return false;
}
const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ================================================================ 1 tick
// input: { left, right, up, down, jump, attack } （押している間 true）
export function step(g, input = {}) {
  g.events.length = 0;
  const pin = g.prevIn;
  const pressed = { jump: input.jump && !pin.jump, attack: input.attack && !pin.attack, up: input.up && !pin.up, down: input.down && !pin.down };
  g.prevIn = { ...input };
  g.tick++;
  const p = g.player;
  p.px = p.x; p.py = p.y;
  g.pcam.x = g.cam.x; g.pcam.y = g.cam.y;
  for (const m of g.movers) { m.pcx = m.cx; m.pcy = m.cy; }
  for (const e of g.enemies) { e.px = e.x; e.py = e.y; }
  for (const s of g.shots) { s.px = s.x; s.py = s.y; }
  for (const s of g.eshots) { s.px = s.x; s.py = s.y; }
  if (g.boss) { g.boss.px = g.boss.x; g.boss.py = g.boss.y; }
  g.modeT -= TICK;

  switch (g.mode) {
    case 'ready':
      updateCamera(g);
      if (g.modeT <= 0) { g.mode = 'play'; emit(g, 'go'); }
      return;
    case 'dying':
      p.deadT += TICK;
      if (p.vy || !p.ground) { p.vy = Math.max(-P.maxFall, p.vy - P.gravity * TICK); if (p.cause !== 'pit' && p.cause !== 'lava' && p.cause !== 'water') moveBody(g, p, TICK); else p.y += p.vy * TICK * 0.25; }
      updateWorld(g, true);
      if (g.modeT <= 0) afterDeath(g);
      return;
    case 'clear':
      clearTally(g);
      return;
    case 'bossIntro':
      updateCamera(g);
      updateBoss(g);
      if (g.modeT <= 0) { g.mode = 'play'; g.bossState = 'fight'; emit(g, 'bossFight', { boss: g.boss.type }); }
      return;
    case 'gameover': case 'ending': case 'next':
      return;
  }

  // ---- play
  g.time -= TICK; g.tw += TICK;
  if (g.spawnSafeT > 0) g.spawnSafeT -= TICK;
  updateMovers(g);
  updatePlayer(g, input, pressed);
  if (g.mode !== 'play') return;
  updateShots(g);
  updateWorld(g, false);
  checkPlayerHazards(g);
  if (g.mode !== 'play') return;
  if (g.time <= 0 && !g.god) { g.time = 0; killPlayer(g, 'time'); emit(g, 'timeUp'); }
  checkpoints(g);
  bossTrigger(g);
  updateCamera(g);
}

function updateWorld(g, dying) {
  updateJets(g);
  updateEnemies(g, dying);
  updateEShots(g);
  updateBurns(g);
  updateItems(g);
  if (g.boss && g.bossState !== 'none') updateBoss(g);
  g.fx = g.fx.filter((f) => (f.t -= TICK) > 0);
}

// ================================================================ プレイヤー
function updatePlayer(g, inp, pr) {
  const p = g.player, dt = TICK, easy = g.diff.id === 'easy';
  p.st += dt; p.inv = Math.max(0, p.inv - dt); p.fireCD -= dt; p.throwT = Math.max(0, p.throwT - dt); p.landT = Math.max(0, p.landT - dt);
  p.turnT = Math.max(0, p.turnT - dt); p.drop = Math.max(0, p.drop - dt); p.armorT = Math.max(0, p.armorT - dt);
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  p.dir = dir;
  if (pr.jump) p.buffer = P.bufferTime[g.diff.id] + 1e-6;
  else p.buffer = Math.max(0, p.buffer - dt);
  const wantJump = pr.jump || (easy && p.buffer > 0 && inp.jump);

  // 移動床に乗っていれば一緒に動く
  if (p.ground && p.onMover >= 0) { const m = g.movers[p.onMover]; pushX(g, p, m.dx); p.y += m.dy; }

  // ---- 被弾ノックバック中
  if (p.state === 'hurt') {
    p.hurtT -= dt;
    p.vy = Math.max(-P.maxFall, p.vy - P.gravity * dt);
    moveBody(g, p, dt, { gate: gateX(g) });
    if (p.ground && p.hurtT <= 0) { p.vx = 0; setState(p, 'idle'); p.landT = 0.1; }
    return;
  }

  // ---- はしご
  if (p.climb) {
    const col = p.ladderX;
    p.x = col + 0.5; p.vx = 0;
    const v = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    p.vy = v * P.ladderSpeed;
    let ny = p.y + p.vy * dt;
    if (v !== 0) p.climbPhase += dt * P.ladderSpeed * 1.6;
    if (v > 0) {
      // 上端: 足がはしごの最上段を越えたら床に立つ
      let top = Math.floor(p.y + 1e-4);
      while (tileI(g, col, top) === T.LADDER) top++;
      if (ny >= top - 1e-4 && tileI(g, col, top - 1) === T.LADDER) { ny = top; endClimb(p, true); }
      else if (isSolid(g, col, Math.floor(ny + p.h))) ny = p.y; // 頭上が塞がっていれば止まる
    } else if (v < 0) {
      const below = Math.floor(ny);
      if (tileI(g, col, below) !== T.LADDER) {
        // はしごの下端: 床なら立つ、何もなければ手を離して落ちる
        if (isTop(g, col, below, false) && tileI(g, col, below) !== T.LADDER) { ny = below + 1; endClimb(p, true); }
        else if (tileI(g, col, Math.floor(ny + 0.6)) !== T.LADDER) { endClimb(p, false); }
      }
    }
    p.y = ny;
    if (pr.jump && !p.climb) {}
    setState(p, p.climb ? 'climb' : p.ground ? 'idle' : 'fall');
    return;
  }

  // はしごに取り付く
  const col = Math.floor(p.x), nearCol = Math.abs(p.x - (col + 0.5)) < 0.42;
  if (nearCol && inp.up && !inp.down && tileI(g, col, Math.floor(p.y + 0.6)) === T.LADDER && (p.ground || p.vy <= 2)) { startClimb(p, col); return; }
  if (nearCol && inp.down && p.ground && tileI(g, col, Math.floor(p.y - 0.5)) === T.LADDER && tileI(g, col, Math.floor(p.y + 0.5)) !== T.LADDER) {
    startClimb(p, col); p.y -= 0.12; return;
  }

  // ---- 地上
  if (p.ground) {
    p.coyote = P.coyoteTime[g.diff.id];
    const wantCrouch = inp.down && !inp.up;
    if (wantCrouch) p.crouch = true;
    else if (p.crouch && canStand(g, p)) p.crouch = false; // 頭上が低ければ立ち上がらない
    p.h = p.crouch ? P.hCrouch : P.hStand;
    if (p.crouch) p.vx = 0;
    else if (p.throwT > 0) p.vx = 0;          // 投げた瞬間は足を止める（当時の作品らしい重さ）
    else {
      if (dir && dir !== p.face) { p.face = dir; p.turnT = P.turnTime; }
      p.vx = dir * P.speed;
    }
    if (p.crouch && dir) { if (dir !== p.face) { p.face = dir; p.turnT = P.turnTime; } }
    if (wantJump && !p.crouch) doJump(g, p, dir);
  } else {
    p.coyote = Math.max(0, p.coyote - dt);
    if (wantJump && p.coyote > 0 && p.vy <= 0) doJump(g, p, dir);
    // 空中: 高難度は踏み切りの速度のまま。易しいは少しだけ寄せられる
    const ac = P.airControl[g.diff.id];
    if (ac > 0 && dir) p.vx += (dir * P.speed - p.vx) * Math.min(1, ac * 8 * dt);
  }

  // 攻撃（長押しで規定間隔の連射）
  if ((pr.attack || inp.attack) && p.fireCD <= 0) {
    if (dir && dir !== p.face && !p.ground) p.face = dir; // 空中で後ろへ投げられる（速度は変えない）
    if (fire(g, p)) { p.fireCD = WEAPONS[g.weapon].interval; p.throwT = 0.14; }
  }

  // 重力と移動
  p.vy = Math.max(-P.maxFall, p.vy - P.gravity * dt);
  const wasAir = !p.ground;
  moveBody(g, p, dt, { gate: gateX(g) });
  if (p.ground && wasAir) { p.landT = 0.12; emit(g, 'land'); if (!inp.left && !inp.right) p.vx = 0; }
  if (p.ground) p.walkPhase += Math.abs(p.vx) * dt;
  // 状態
  if (!p.ground) setState(p, p.vy > 0 ? 'jump' : 'fall');
  else if (p.crouch) setState(p, 'crouch');
  else if (Math.abs(p.vx) > 0.1) setState(p, 'run');
  else setState(p, 'idle');
}
function setState(p, s) { if (p.state !== s) { p.state = s; p.st = 0; } }
function startClimb(p, col) { p.climb = true; p.ladderX = col; p.x = col + 0.5; p.vx = 0; p.vy = 0; p.crouch = false; p.h = P.hStand; p.ground = false; setState(p, 'climb'); }
function endClimb(p, stand) { p.climb = false; p.ground = stand; p.vy = 0; if (!stand) setState(p, 'fall'); }
function doJump(g, p, dir) {
  p.vy = P.jumpV; p.vx = dir * P.speed; p.ground = false; p.coyote = 0; p.buffer = 0; p.onMover = -1;
  if (dir) p.face = dir;
  setState(p, 'jump');
}
function gateX(g) { return g.lockCam && !g.def.vertical ? g.def.boss.x0 + 0.05 : null; }

function fire(g, p) {
  const w = WEAPONS[g.weapon];
  const mine = g.shots.filter((s) => s.kind === w.id).length + (w.id === 'torch' ? g.burns.length : 0);
  if (mine >= w.max) return false;
  const y = p.y + (p.crouch ? 0.5 : 1.08), x = p.x + p.face * 0.45;
  const s = { kind: w.id, x, y, px: x, py: y, vx: p.face * w.speed, vy: 0, dist: 0, w: w.w, h: w.h, hits: new Set(), t: 0, face: p.face };
  if (w.path !== 'line') s.vy = w.vy;
  g.shots.push(s);
  emit(g, 'fire', { weapon: w.id });
  return true;
}

function updateShots(g) {
  const dt = TICK, bx = g.cam;
  for (const s of g.shots) {
    const w = WEAPONS[s.kind];
    s.t += dt;
    const n = 3; // すり抜け防止の細分
    for (let k = 0; k < n && !s.dead; k++) {
      if (w.path !== 'line') s.vy -= (w.gravity * dt) / n;
      s.x += (s.vx * dt) / n; s.y += (s.vy * dt) / n;
      s.dist += Math.abs(s.vx * dt) / n;
      const tv = tile(g, s.x, s.y);
      if (tv === T.SOLID || (w.path === 'lob' && (tv === T.PLAT) && s.vy < 0 && s.y - Math.floor(s.y) > 0.7)) {
        if (w.path === 'lob') { land(g, s); }
        else { s.dead = true; emit(g, 'clink', { x: s.x, y: s.y, weapon: s.kind }); }
        break;
      }
      if (w.path === 'lob' && (tv === T.LAVA || tv === T.WATER)) { s.dead = true; break; }
      if (w.path === 'lob' && s.vy < 0) { // 片側足場・移動床の上にも落ちる
        const ty = Math.floor(s.y);
        if (isTop(g, Math.floor(s.x), ty, false) && s.y - ty < 0.98 && s.y - ty > 0.6) { land(g, s); break; }
        for (const m of g.movers) if (s.x > m.cx && s.x < m.cx + m.w && Math.abs(s.y - m.cy) < 0.2) { s.y = m.cy + 1; land(g, s); break; }
      }
      hitTargets(g, s, w);
    }
    if (s.dist > w.range || s.y < -2 || Math.abs(s.x - bx.x) > VIEW_W / 2 + 3 || s.y > bx.y + VIEW_H / 2 + 6) s.dead = true;
  }
  g.shots = g.shots.filter((s) => !s.dead);
}
function land(g, s) {
  s.dead = true;
  const w = WEAPONS.torch;
  const sy = surfaceBelow(g, s.x, s.y + 0.5, 3);
  if (sy == null) return;
  g.burns.push({ x: s.x, y: sy, t: w.burnTime, life: w.burnTime, w: w.burnW, h: w.burnH, cd: new Map() });
  emit(g, 'burn', { x: s.x, y: sy });
}
function hitTargets(g, s, w) {
  const box = { x: s.x, y: s.y - s.h / 2, w: s.w, h: s.h };
  for (const e of g.enemies) {
    if (e.dead || !e.hittable || s.hits.has(e)) continue;
    if (overlap(box, e)) {
      s.hits.add(e);
      damageEnemy(g, e, w.dmg, s.face);
      if (!w.pierce) { s.dead = true; if (w.path === 'lob') land(g, s); return; }
    }
  }
  const b = g.boss;
  if (b && b.hittable && !b.dead && !s.hits.has(b) && overlap(box, b)) {
    s.hits.add(b);
    damageBoss(g, b, w.dmg, s.face);
    if (!w.pierce) { s.dead = true; if (w.path === 'lob') land(g, s); }
  }
}
function updateBurns(g) {
  const w = WEAPONS.torch;
  for (const f of g.burns) {
    f.t -= TICK;
    const box = { x: f.x, y: f.y, w: f.w, h: f.h };
    const targets = g.enemies.filter((e) => !e.dead && e.hittable);
    if (g.boss && g.boss.hittable && !g.boss.dead) targets.push(g.boss);
    for (const e of targets) {
      if (!overlap(box, e)) continue;
      const cd = f.cd.get(e) || 0;
      if (g.tick >= cd) { f.cd.set(e, g.tick + Math.round(w.burnTick / TICK)); if (e === g.boss) damageBoss(g, e, w.burnDmg, 0); else damageEnemy(g, e, w.burnDmg, 0); }
    }
  }
  g.burns = g.burns.filter((f) => f.t > 0);
}

// ================================================================ 被弾・死亡
export function hurtPlayer(g, fromX, cause = 'hit') {
  const p = g.player;
  if (g.mode !== 'play' || p.inv > 0 || g.god) return false;
  if (p.armor) {
    p.armor = false; p.armorT = 0.6;
    p.inv = P.hurtInvuln;
    const d = sign(p.x - fromX) || -p.face;
    p.climb = false; p.crouch = false; p.h = P.hStand;
    p.vx = d * P.knockVX; p.vy = P.knockVY; p.ground = false; p.hurtT = 0.25;
    setState(p, 'hurt');
    emit(g, 'armorBreak', { x: p.x, y: p.y + 1 });
    return true;
  }
  killPlayer(g, cause);
  return true;
}
export function killPlayer(g, cause) {
  const p = g.player;
  if (g.mode !== 'play') return;
  if (g.god && cause !== 'time') return;
  g.mode = 'dying'; g.modeT = P.deathTime; p.deadT = 0; p.cause = cause;
  p.climb = false; p.armor = false;
  if (cause === 'pit' || cause === 'lava' || cause === 'water') { p.vx = 0; p.vy = 0; }
  else { p.vy = 5; p.vx = -p.face * 1.5; p.ground = false; }
  setState(p, 'dead');
  g.stats.deaths++;
  emit(g, 'death', { cause, x: p.x, y: p.y });
}
function afterDeath(g) {
  g.lives--;
  if (g.lives <= 0) {
    g.lives = 0; g.mode = 'gameover'; g.modeT = 0;
    g.hi = Math.max(g.hi, g.score);
    emit(g, 'gameOver', { score: g.score });
    return;
  }
  g.score = g.cpScore; // 得点はチェックポイントを通った時の値へ戻す（繰り返しによる稼ぎを防ぐ）
  g.killed = new Set(g.cpKilled); g.collected = new Set(g.cpCollected);
  g.weapon = 'lance';
  resetAttempt(g, false);
}
function checkPlayerHazards(g) {
  const p = g.player;
  if (p.ground && p.onMover < 0) p.safe = { x: p.x, y: p.y };
  if (g.god) { if (p.y < -1.2 && p.safe) { p.x = p.safe.x; p.y = p.safe.y; p.vy = 0; p.vx = 0; } return; }
  if (p.y < -1.2) return killPlayer(g, 'pit');
  if (bodyTouches(g, p, T.LAVA, 0.4)) return killPlayer(g, 'lava');
  if (bodyTouches(g, p, T.WATER, 0.4)) return killPlayer(g, 'water');
  if (p.inv > 0) return;
  const pb = { x: p.x, y: p.y, w: p.w * 0.8, h: p.h * 0.92 };
  for (const e of g.enemies) if (!e.dead && e.harm && overlap(pb, e.hb || e)) { hurtPlayer(g, e.x, 'enemy'); return; }
  for (const s of g.eshots) if (!s.dead && !s.harmless && !(s.warn != null && !s.active) && circleBox(s, pb)) { s.dead = s.kind !== 'wave' && s.kind !== 'pillar' && s.kind !== 'beam'; hurtPlayer(g, s.x - s.vx, 'shot'); return; }
  for (const j of g.jets) if (j.on && overlap(pb, { x: j.x + 0.5, y: j.y, w: 0.8, h: j.h })) { hurtPlayer(g, j.x + 0.5, 'fire'); return; }
  const b = g.boss;
  if (b && !b.dead && b.harm && overlap(pb, b.hb || b)) { hurtPlayer(g, b.x, 'boss'); return; }
  if (b && b.extraHit) for (const h of b.extraHit) if (overlap(pb, h)) { hurtPlayer(g, b.x, 'boss'); return; }
}
function circleBox(s, b) {
  if (s.box) return overlap({ x: s.x, y: s.y, w: s.box.w, h: s.box.h }, b); // 箱の弾は y が下端
  if (s.r <= 0) return false;
  const cx = clamp(s.x, b.x - b.w / 2, b.x + b.w / 2), cy = clamp(s.y, b.y, b.y + b.h);
  return (s.x - cx) ** 2 + (s.y - cy) ** 2 < s.r * s.r;
}

// ================================================================ チェックポイント・カメラ・ボスの間
function checkpoints(g) {
  const p = g.player;
  if (!p.ground) return;
  for (let i = g.cp + 1; i < g.cps.length; i++) {
    const c = g.cps[i];
    const passed = g.def.vertical ? p.y >= c.y - 0.3 && Math.abs(p.x - c.x - 0.5) < 6 : p.x >= c.x && Math.abs(p.y - c.y) < 4;
    if (passed) { g.cp = i; g.cpScore = g.score; g.cpKilled = new Set(g.killed); g.cpCollected = new Set(g.collected); emit(g, 'checkpoint', { index: i }); }
  }
}
export function updateCamera(g, snap = false) {
  const p = g.player, d = g.def;
  let tx, ty;
  if (g.lockCam) { tx = d.boss.x0 + VIEW_W / 2; ty = d.boss.y0 + VIEW_H / 2; }
  else {
    tx = p.x + p.face * 1.2; ty = p.y + (d.vertical ? 2.2 : 2.6);
    tx = clamp(tx, VIEW_W / 2, d.W - VIEW_W / 2); ty = clamp(ty, VIEW_H / 2, d.H - VIEW_H / 2);
    if (d.W <= VIEW_W + 4) tx = d.W / 2;
  }
  if (snap) { g.cam.x = tx; g.cam.y = ty; return; }
  const k = 1 - Math.exp(-TICK * (g.lockCam ? 3 : 6));
  g.cam.x += (tx - g.cam.x) * k; g.cam.y += (ty - g.cam.y) * (1 - Math.exp(-TICK * 4));
  // プレイヤーが画面外に出ない
  g.cam.x = clamp(g.cam.x, p.x - VIEW_W / 2 + 3, p.x + VIEW_W / 2 - 3);
  g.cam.y = clamp(g.cam.y, p.y - VIEW_H / 2 + 2.5, p.y + VIEW_H / 2 - 2.5);
}
function bossTrigger(g) {
  const bd = g.def.boss, p = g.player;
  if (g.bossState !== 'none') return;
  const inside = g.def.vertical ? p.y >= bd.y0 + 0.4 && p.ground : p.x >= bd.x0 + 2.5;
  if (!inside) return;
  g.bossState = 'intro'; g.lockCam = true;
  for (const [x, y] of bd.seal || []) g.tiles[y * g.def.W + x] = T.SOLID;
  // ボスの間の雑魚と弾は消す（戦闘前のチェックポイントからやり直せる）
  g.enemies = g.enemies.filter((e) => Math.abs(e.x - (bd.x0 + 12)) > 16);
  g.dormant = g.dormant.filter((e) => !(e.x >= bd.x0 - 2 && e.y >= bd.y0 - 1));
  g.eshots = [];
  g.boss = makeBoss(g, bd);
  g.mode = 'bossIntro'; g.modeT = 1.8;
  emit(g, 'bossIntro', { boss: bd.type, name: BOSSES[bd.type].name });
}

// ================================================================ 移動床・炎の柱・アイテム
function updateMovers(g) {
  for (const m of g.movers) { const q = moverPos(m, g.tw); m.dx = q.x - m.cx; m.dy = q.y - m.cy; m.cx = q.x; m.cy = q.y; }
}
function updateJets(g) {
  for (const j of g.jets) {
    const ph = (g.tw + j.phase) % j.period;
    const on = ph > j.period - 1.0, warn = !on && ph > j.period - 1.7;
    if (on && !j.on) emit(g, 'jet', { x: j.x, y: j.y });
    j.on = on; j.warn = warn; j.ph = ph;
  }
}
function updateItems(g) {
  const p = g.player;
  for (const it of g.items) {
    it.t += TICK;
    if (!it.ground) {
      it.vy = Math.max(-10, it.vy - 20 * TICK); const ny = it.y + it.vy * TICK;
      const s = surfaceBelow(g, it.x, it.y + 0.01, 2);
      if (s != null && ny <= s) { it.y = s; it.ground = true; it.vy = 0; } else it.y = ny;
      if (it.y < -2) it.dead = true;
    }
    if (g.mode !== 'play' || it.t < 0.25) continue;
    if (overlap({ x: p.x, y: p.y, w: p.w, h: p.h }, { x: it.x, y: it.y, w: 0.9, h: 0.9 })) {
      it.dead = true;
      if (it.id != null) g.collected.add(it.id);
      if (it.kind === 'weapon') { g.weapon = it.weapon; emit(g, 'weaponGet', { weapon: it.weapon }); }
      else if (it.kind === 'treasure') { addScore(g, SCORE.treasure, it.x, it.y + 1); g.stats.treasures++; emit(g, 'treasure'); }
      else if (it.kind === 'armor') { if (!p.armor) { p.armor = true; p.armorT = -0.6; } addScore(g, 200, it.x, it.y + 1); emit(g, 'armorGet'); }
    }
  }
  g.items = g.items.filter((it) => !it.dead);
}
export function addScore(g, n, x, y) { g.score += n; if (x != null) g.fx.push({ kind: 'score', n, x, y, t: 0.9 }); }

// ================================================================ 敵
const ENEMY_CAP = 14;
function updateEnemies(g, frozen) {
  const cam = g.cam, rank = g.diff.enemyRank * (g.loop > 1 ? 1.25 : 1);
  // 出現（画面内に入ったら起きる。画面から大きく離れたら元の位置で眠る。倒した敵は生き返らない）
  if (!frozen) {
    for (let i = g.dormant.length - 1; i >= 0; i--) {
      const d = g.dormant[i];
      if (Math.abs(d.x - cam.x) < VIEW_W / 2 + 1.5 && Math.abs(d.y - cam.y) < VIEW_H / 2 + 2.5 && g.enemies.length < ENEMY_CAP) {
        g.dormant.splice(i, 1); g.enemies.push(makeEnemy(g, d));
      }
    }
    for (const e of g.enemies) if (e.home && !e.dead && (Math.abs(e.x - cam.x) > VIEW_W / 2 + 10 || Math.abs(e.y - cam.y) > VIEW_H + 4)) { e.sleep = true; }
    for (const e of g.enemies) if (e.sleep) g.dormant.push(e.home);
    g.enemies = g.enemies.filter((e) => !e.sleep);
    updateSpawners(g);
  }
  for (const e of g.enemies) {
    e.t += TICK; e.hitT = Math.max(0, e.hitT - TICK);
    if (e.dead) { e.deadT += TICK; continue; }
    if (frozen) continue;
    ENEMY_AI[e.type](g, e, rank);
    if (e.y < -3 || ((e.lethalFall ?? true) && e.walker && (bodyTouches(g, e, T.LAVA, 0.3) || bodyTouches(g, e, T.WATER, 0.3)))) { e.dead = true; e.deadT = 0; e.silent = true; }
  }
  g.enemies = g.enemies.filter((e) => !(e.dead && e.deadT > 0.6));
}
function makeEnemy(g, d) {
  const c = ENEMIES[d.type];
  const e = { type: d.type, home: d, id: d.id, x: d.x, y: d.y, px: d.x, py: d.y, vx: 0, vy: 0, w: c.w, h: c.h, hp: c.hp, max: c.hp, face: -1, st: 'idle', t: 0,
    ground: true, hittable: true, harm: true, hitT: 0, dead: false, deadT: 0, cd: 1 + g.rand() * 0.8, phase: g.rand() * 6.28, walker: false, onMover: -1, drop: d.drop };
  if (g.player.x > e.x) e.face = 1;
  INIT[d.type] && INIT[d.type](g, e, d);
  return e;
}
const setE = (e, st) => { e.st = st; e.t = 0; };
function damageEnemy(g, e, dmg, dir) {
  if (e.dead || !e.hittable) return;
  e.hp -= dmg * (e.st === 'recover' ? 1.5 : 1);
  e.hitT = 0.12; e.kick = dir;
  if (e.hp <= 0) {
    e.dead = true; e.deadT = 0; e.harm = false;
    const c = ENEMIES[e.type];
    addScore(g, SCORE[c.score], e.x, e.y + e.h);
    g.stats.kills++;
    if (e.id != null) g.killed.add(e.id);
    emit(g, 'enemyDie', { type: e.type, x: e.x, y: e.y + e.h / 2, strong: c.score === 'strong' });
    if (e.drop) g.items.push({ kind: 'weapon', weapon: e.drop, x: e.x, y: e.y + e.h / 2, vy: 4, t: 0, ground: false });
  } else emit(g, 'enemyHit', { type: e.type, x: e.x, y: e.y + e.h / 2 });
}
function shoot(g, e, x, y, vx, vy, kind = 'orb', extra = {}) {
  g.eshots.push({ kind, x, y, px: x, py: y, vx, vy, r: 0.26, t: 0, life: 6, ...extra });
}
function aimAt(g, x, y, speed) { const p = g.player; const dx = p.x - x, dy = p.y + 0.9 - y, d = Math.hypot(dx, dy) || 1; return [(dx / d) * speed, (dy / d) * speed]; }
function walkerPhys(g, e, edgeStop = true) {
  e.vy = Math.max(-16, e.vy - 24 * TICK);
  if (edgeStop && e.ground && e.vx) {
    const ax = e.x + sign(e.vx) * (e.w / 2 + 0.1);
    if (surfaceBelow(g, ax, e.y + 0.1, 1.2) == null) { e.vx = 0; e.edge = true; } else e.edge = false;
  }
  moveBody(g, e, TICK);
}
const dist = (g, e) => g.player.x - e.x;
const pAlive = (g) => g.mode === 'play';

const INIT = {
  ghoul(g, e, d) { e.walker = true; setE(e, 'emerge'); e.hittable = false; e.harm = false; },
  skeleton(g, e) { e.walker = true; },
  imp(g, e, d) { e.baseY = d.y; e.walker = false; setE(e, 'fly'); e.cd = 1.5; },
  beast(g, e) { e.walker = true; },
  caster(g, e) { e.walker = true; setE(e, 'hidden'); e.hittable = false; e.harm = false; e.cd = 0.3; },
  hopper(g, e, d) { e.walker = !d.water; e.water = !!d.water; if (e.water) { setE(e, 'under'); e.hittable = false; e.harm = false; e.baseY = d.y; e.cd = 1.2 + g.rand(); } else setE(e, 'wait'); e.lethalFall = !e.water; },
  brute(g, e) { e.walker = true; },
  turret(g, e, d) { e.dir = d.dir ?? -1; e.down = !!d.down; e.cd = 1.0 + g.rand(); if (e.down) { e.y = d.y - 1.2; } },
};

const ENEMY_AI = {
  ghoul(g, e) {
    const c = ENEMIES.ghoul;
    if (e.st === 'emerge') { // 土の盛り上がり → 這い出す（盛り上がりの間は当たらない）
      if (e.t > c.emerge * 0.55) { e.hittable = true; }
      if (e.t > c.emerge) { setE(e, 'walk'); e.harm = true; e.face = sign(dist(g, e)) || -1; }
      return;
    }
    if (e.st === 'sink') { e.harm = false; e.hittable = false; if (e.t > 0.6) { e.dead = true; e.silent = true; e.deadT = 0.6; } return; }
    e.vx = e.face * c.speed;
    walkerPhys(g, e, false);
    if (e.hitWall) e.face = -e.face;
    if (e.t > 9) setE(e, 'sink');
  },
  skeleton(g, e, rank) {
    const c = ENEMIES.skeleton, dx = dist(g, e), ad = Math.abs(dx);
    e.face = sign(dx) || e.face;
    if (e.st === 'idle' || e.st === 'walk') {
      let want = 0;
      if (ad < c.keep[0]) want = -sign(dx); else if (ad > c.keep[1] && ad < 14) want = sign(dx);
      e.vx = want * c.speed; e.st = want ? 'walk' : 'idle';
      e.cd -= TICK;
      if (e.cd <= 0 && ad < 11 && Math.abs(g.player.y - e.y) < 5 && pAlive(g)) { setE(e, 'windup'); e.vx = 0; }
    } else if (e.st === 'windup') {
      e.vx = 0;
      if (e.t > c.windup / rank) {
        const t = clamp(ad / 6, 0.5, 1.2); // 骨は山なり
        shoot(g, e, e.x + e.face * 0.4, e.y + 1.4, (dx / t) * 0.95, 7, 'bone', { grav: 14, r: 0.24 });
        emit(g, 'eShot', { kind: 'bone' }); setE(e, 'recover');
      }
    } else if (e.st === 'recover') { if (e.t > 0.5) { setE(e, 'idle'); e.cd = c.cool / rank + g.rand() * 0.8; } }
    walkerPhys(g, e, true);
  },
  imp(g, e, rank) {
    const c = ENEMIES.imp, p = g.player, dx = p.x - e.x;
    if (e.st === 'fly') {
      e.face = sign(dx) || e.face;
      e.vx = clamp(dx, -1, 1) * c.speed * 0.6;
      e.y = e.baseY + Math.sin(e.t * 2.4 + e.phase) * 1.1;
      e.x += e.vx * TICK;
      e.cd -= TICK;
      if (e.cd <= 0 && Math.abs(dx) < 6 && e.y > p.y + 1.5 && pAlive(g)) { setE(e, 'warn'); e.tx = p.x; e.ty = p.y + 0.8; }
    } else if (e.st === 'warn') { // 羽を広げて光る予告
      e.tx = g.player.x; e.ty = g.player.y + 0.8;
      if (e.t > c.warn / Math.sqrt(rank)) { setE(e, 'dive'); const d = Math.hypot(e.tx - e.x, e.ty - e.y) || 1; e.vx = ((e.tx - e.x) / d) * c.dive * rank; e.vy = ((e.ty - e.y) / d) * c.dive * rank; emit(g, 'impDive'); }
    } else if (e.st === 'dive') {
      e.x += e.vx * TICK; e.y += e.vy * TICK;
      if (e.t > 1.0 || e.y < e.ty - 1.5 || isSolid(g, Math.floor(e.x), Math.floor(e.y))) { setE(e, 'rise'); e.vx = sign(e.vx) * 2.5; }
    } else if (e.st === 'rise') {
      e.x += e.vx * TICK; e.y += (e.baseY - e.y) * (1 - Math.exp(-TICK * 2.5));
      if (Math.abs(e.y - e.baseY) < 0.3 || e.t > 2) { setE(e, 'fly'); e.cd = 2.2 + g.rand(); e.t = Math.asin(clamp((e.y - e.baseY) / 1.1, -1, 1)) / 2.4; e.phase = 0; }
    }
    e.face = sign(e.vx) || e.face;
  },
  beast(g, e, rank) {
    const c = ENEMIES.beast, dx = dist(g, e);
    if (e.st === 'idle') {
      e.vx = Math.sin(e.t * 1.3 + e.phase) * 0.8; e.face = sign(dx) || e.face;
      e.cd -= TICK;
      if (e.cd <= 0 && Math.abs(dx) < c.sight && Math.abs(g.player.y - e.y) < 2 && pAlive(g)) { setE(e, 'windup'); e.vx = 0; e.face = sign(dx) || -1; emit(g, 'growl'); }
    } else if (e.st === 'windup') { e.vx = 0; if (e.t > c.windup / rank) { setE(e, 'charge'); } }
    else if (e.st === 'charge') {
      e.vx = e.face * c.speed * Math.min(1, e.t * 4);
      if (e.t > 1.6 || e.hitWall || e.edge) { setE(e, 'recover'); }
    } else if (e.st === 'recover') { e.vx *= 0.85; if (e.t > c.recover) { setE(e, 'idle'); e.cd = 0.8 + g.rand(); } }
    walkerPhys(g, e, true);
  },
  caster(g, e, rank) {
    const c = ENEMIES.caster, dx = dist(g, e);
    e.face = sign(dx) || e.face;
    if (e.st === 'hidden') {
      e.cd -= TICK;
      if (e.cd <= 0 && Math.abs(dx) < 11 && pAlive(g)) {
        // 元の位置の近くで、プレイヤーから 4u 以上離れた場所に現れる
        let x = e.home.x + (g.rand() - 0.5) * 4;
        if (Math.abs(x - g.player.x) < 4) x = g.player.x + (x > g.player.x ? 4 : -4);
        const s = surfaceBelow(g, x, e.y + 1.5, 3);
        if (s != null && Math.abs(s - e.home.y) < 1.5) { e.x = x; e.y = s; }
        setE(e, 'appear'); e.hittable = true; emit(g, 'casterAppear');
      }
    } else if (e.st === 'appear') { if (e.t > 0.45) { setE(e, 'cast'); e.harm = true; } }
    else if (e.st === 'cast') {
      if (e.t > c.cast / rank) { const [vx, vy] = aimAt(g, e.x + e.face * 0.5, e.y + 1.2, c.shotV * rank); shoot(g, e, e.x + e.face * 0.5, e.y + 1.2, vx, vy, 'orb', { r: 0.3 }); emit(g, 'eShot', { kind: 'orb' }); setE(e, 'after'); }
    } else if (e.st === 'after') { if (e.t > 0.7) setE(e, 'vanish'); }
    else if (e.st === 'vanish') { e.harm = false; if (e.t > 0.4) { setE(e, 'hidden'); e.hittable = false; e.cd = c.cool / rank; } }
    if (e.st !== 'hidden') walkerPhys(g, e, true);
  },
  hopper(g, e, rank) {
    const c = ENEMIES.hopper, dx = dist(g, e);
    if (e.water) {
      if (e.st === 'under') { e.cd -= TICK; if (e.cd <= 0 && Math.abs(dx) < 9 && pAlive(g)) setE(e, 'bubble'); return; }
      if (e.st === 'bubble') { if (e.t > 0.75) { setE(e, 'leap'); e.vy = 12.5; e.vx = 0; e.hittable = true; e.harm = true; emit(g, 'splash', { x: e.x, y: 2 }); } return; }
      e.vy -= 24 * TICK; e.y += e.vy * TICK;
      if (e.vy < 0 && e.y <= e.baseY) { e.y = e.baseY; setE(e, 'under'); e.hittable = false; e.harm = false; e.cd = 1.6 + g.rand(); emit(g, 'splash', { x: e.x, y: 2 }); }
      return;
    }
    if (e.st === 'wait') {
      e.vx = 0; e.face = sign(dx) || e.face;
      if (e.t > c.wait / rank && Math.abs(dx) < 12 && pAlive(g)) {
        setE(e, 'hop'); e.vy = c.hopV; e.vx = e.face * Math.min(c.hopX / 0.75, Math.abs(dx) / 0.75 + 0.5);
        // 着地点（描画で影の印を出す）
        e.landX = e.x + e.vx * 0.75;
      }
    } else if (e.st === 'hop') { if (e.ground && e.t > 0.1) { setE(e, 'wait'); e.vx = 0; emit(g, 'thud', { soft: true }); } }
    walkerPhys(g, e, e.st !== 'hop');
  },
  brute(g, e, rank) {
    const c = ENEMIES.brute, dx = dist(g, e), ad = Math.abs(dx);
    if (e.st === 'idle' || e.st === 'walk') {
      e.face = sign(dx) || e.face;
      e.vx = ad > c.reach - 0.2 && ad < 12 ? e.face * c.speed : 0; e.st = e.vx ? 'walk' : 'idle';
      if (ad < c.reach + 0.4 && Math.abs(g.player.y - e.y) < 2 && pAlive(g)) { setE(e, 'windup'); e.vx = 0; emit(g, 'growl', { deep: true }); }
    } else if (e.st === 'windup') { if (e.t > c.windup / rank) { setE(e, 'smash'); emit(g, 'thud', {}); } }
    else if (e.st === 'smash') {
      e.hb = { x: e.x + e.face * 1.3, y: e.y, w: 2.2, h: 1.6 };
      if (e.t > 0.22) { e.hb = null; setE(e, 'recover'); }
    } else if (e.st === 'recover') { if (e.t > c.recover) setE(e, 'idle'); }
    walkerPhys(g, e, true);
    if (e.st === 'smash') { const h = e.hb; if (h && overlap({ x: g.player.x, y: g.player.y, w: g.player.w, h: g.player.h }, h)) hurtPlayer(g, e.x, 'enemy'); }
  },
  turret(g, e, rank) {
    const c = ENEMIES.turret, cam = g.cam;
    if (Math.abs(e.x - cam.x) > VIEW_W / 2 || Math.abs(e.y - cam.y) > VIEW_H / 2) { e.st = 'idle'; return; }
    if (e.st === 'idle') { e.cd -= TICK; if (e.cd <= 0 && pAlive(g)) setE(e, 'warn'); }
    else if (e.st === 'warn') {
      if (e.t > c.warn) {
        if (e.down) shoot(g, e, e.x, e.y, 0, -c.shotV * rank, 'fireball', { r: 0.28 });
        else { const d = e.dir || sign(dist(g, e)) || -1; e.face = d; shoot(g, e, e.x + d * 0.6, e.y + 1.25, d * c.shotV * rank, 0, 'fireball', { r: 0.2 }); }
        emit(g, 'eShot', { kind: 'fireball' }); setE(e, 'idle'); e.cd = c.period / rank;
      }
    }
    e.face = e.dir || e.face;
  },
};

function updateSpawners(g) {
  const p = g.player;
  if (g.spawnSafeT > 0 || g.mode !== 'play') return;
  for (const s of g.spawners) {
    if (p.x < s.x0 || p.x > s.x1 || s.made >= s.cap || g.lockCam) continue;
    s.cd -= TICK;
    if (s.cd > 0) continue;
    const alive = g.enemies.filter((e) => e.type === 'ghoul' && !e.dead).length;
    if (alive >= s.alive) { s.cd = 0.5; continue; }
    // プレイヤーの前方 3〜6u、画面内の地面（穴や他の敵の上は避ける）
    for (let k = 0; k < 6; k++) {
      const side = g.rand() < 0.7 ? p.face : -p.face, x = p.x + side * (3 + g.rand() * 3.5);
      if (x < s.x0 || x > s.x1 || Math.abs(x - g.cam.x) > VIEW_W / 2 - 1) continue;
      const y = surfaceBelow(g, x, p.y + 2.5, 5);
      if (y == null || Math.abs(y - p.y) > 2.5 || tileI(g, Math.floor(x), y - 1) !== T.SOLID) continue;
      if (g.enemies.some((e) => Math.abs(e.x - x) < 1.2 && Math.abs(e.y - y) < 1.5)) continue;
      const e = makeEnemy(g, { type: 'ghoul', x, y }); e.home = null; e.id = null;
      g.enemies.push(e); s.made++; emit(g, 'ghoulEmerge', { x, y });
      break;
    }
    s.cd = s.interval * (0.7 + g.rand() * 0.6);
  }
}

function updateEShots(g) {
  for (const s of g.eshots) {
    s.t += TICK;
    if (s.grav) s.vy -= s.grav * TICK;
    if (s.kind === 'wave') { // 地面を這う衝撃波
      s.x += s.vx * TICK;
      const sy = surfaceBelow(g, s.x, s.y + 0.6, 2);
      if (sy == null || isSolid(g, Math.floor(s.x + sign(s.vx) * 0.3), Math.floor(s.y + 0.3))) s.dead = true; else s.y = sy;
    } else if (s.kind === 'pillar' || s.kind === 'mark') {
      // 位置は固定。予告（warn）の間は当たらない
      s.active = s.t >= (s.warn || 0) && s.t < (s.warn || 0) + (s.on || 0.6);
      if (s.t > (s.warn || 0) + (s.on || 0.6)) s.dead = true;
      continue;
    } else {
      s.x += s.vx * TICK; s.y += s.vy * TICK;
      if (!s.ghost && isSolid(g, Math.floor(s.x), Math.floor(s.y))) { s.dead = true; if (s.kind === 'clod') emit(g, 'thud', { soft: true }); }
    }
    if (s.t > s.life || s.y < -2 || Math.abs(s.x - g.cam.x) > VIEW_W) s.dead = true;
  }
  g.eshots = g.eshots.filter((s) => !s.dead);
}

// ================================================================ ボス
function makeBoss(g, bd) {
  const c = BOSSES[bd.type];
  const floorY = surfaceBelow(g, bd.x0 + 18.5, bd.y0 + 12, 13) ?? bd.y0 + 1;
  const b = { type: bd.type, x: bd.x0 + 18, y: floorY, px: 0, py: 0, vx: 0, vy: 0, w: c.w, h: c.h, hp: c.hp * (g.loop > 1 ? 1.25 : 1), max: 0, face: -1,
    st: 'intro', t: 0, hittable: false, harm: false, hitT: 0, dead: false, deadT: 0, phase: 1, x0: bd.x0, y0: bd.y0, floor: floorY, cd: 1.2, n: 0, ground: true, onMover: -1, mem: {} };
  b.max = b.hp; b.px = b.x; b.py = b.y;
  BOSS_INIT[b.type] && BOSS_INIT[b.type](g, b);
  return b;
}
function damageBoss(g, b, dmg, dir) {
  if (b.dead || !b.hittable) return;
  const weak = BOSS_WEAK.has(b.st);
  b.hp -= dmg * (weak ? 1.5 : 1);
  b.hitT = 0.1; b.kick = dir;
  if (b.hp <= 0) {
    b.hp = 0; b.dead = true; b.st = 'dying'; b.t = 0; b.harm = false; b.hittable = false; b.extraHit = null;
    g.eshots = []; g.enemies.forEach((e) => { if (!e.dead) { e.dead = true; e.deadT = 0; } });
    addScore(g, SCORE.boss, b.x, b.y + b.h);
    emit(g, 'bossDie', { boss: b.type, x: b.x, y: b.y + b.h / 2 });
  } else {
    emit(g, 'bossHit', { weak });
    const ph = b.hp / b.max;
    const np = ph < 0.34 ? 3 : ph < 0.67 ? 2 : 1;
    if (np !== b.phase) { b.phase = np; emit(g, 'bossPhase', { phase: np }); }
  }
}
// 攻撃の後の「隙」の状態（被ダメージ 1.5 倍）
const BOSS_WEAK = new Set(['stun', 'landed', 'onLand', 'perch', 'recover', 'tired']);
const bset = (b, st) => { b.st = st; b.t = 0; };
const arena = (b) => ({ l: b.x0 + 1.4, r: b.x0 + 22.6 });

function updateBoss(g) {
  const b = g.boss;
  if (!b) return;
  b.t += TICK; b.hitT = Math.max(0, b.hitT - TICK);
  if (b.st === 'dying') {
    b.deadT += TICK;
    if (b.deadT > 2.6 && g.mode === 'play') startClear(g);
    return;
  }
  if (g.mode === 'bossIntro') { b.hittable = false; b.harm = false; BOSS_AI[b.type](g, b, true); return; }
  if (g.mode !== 'play') return;
  b.hittable = true; b.harm = true; b.extraHit = null; b.hb = null;
  BOSS_AI[b.type](g, b, false);
}
const sp = (g, b) => (b.phase >= 2 ? 0.8 : 1) * (g.loop > 1 ? 0.85 : 1); // 予告時間の倍率（後半ほど短い。ただし 0.5 秒は切らない）
const warnT = (g, b, base) => Math.max(0.5, base * sp(g, b));

const BOSS_INIT = {
  witch(g, b) { b.y = b.floor + 5; b.ground = false; b.tx = b.x; b.ty = b.y; },
  riverbeast(g, b) { b.y = b.floor - 3; bset(b, 'submerged'); b.wells = [b.x0 + 8, b.x0 + 16, b.x0 + 21.5]; },
  warden(g, b) { b.y = b.floor + 7; b.ground = false; },
  lord(g, b) { b.y = b.floor + 1.5; b.ground = false; b.minions = 0; },
};

const BOSS_AI = {
  // ---- 1. 墓守: 溜め→突進→壁で目を回す（隙）／シャベルを振り上げ→地を這う衝撃波＋土くれの雨
  gravekeeper(g, b, intro) {
    const p = g.player, A = arena(b);
    if (intro) { b.face = -1; return; }
    b.vy -= 24 * TICK;
    if (b.st === 'intro' || b.st === 'walk') {
      b.face = sign(p.x - b.x) || b.face;
      b.vx = b.face * 1.2;
      b.cd -= TICK;
      if (b.cd <= 0) { bset(b, b.n % 2 === 0 ? 'chargeWind' : 'slamWind'); b.vx = 0; b.n++; emit(g, 'bossWarn', { kind: b.st }); }
    } else if (b.st === 'chargeWind') { b.vx = 0; if (b.t > warnT(g, b, 0.9)) { bset(b, 'charge'); emit(g, 'bossRoar'); } }
    else if (b.st === 'charge') {
      b.vx = b.face * 10 * Math.min(1, b.t * 3);
      if (b.x < A.l + b.w / 2 + 0.05 || b.x > A.r - b.w / 2 - 0.05) { bset(b, 'stun'); b.vx = 0; emit(g, 'thud', {}); g.fx.push({ kind: 'shake', t: 0.4 }); }
    } else if (b.st === 'stun') { b.vx = 0; if (b.t > 1.5) { bset(b, 'walk'); b.cd = 0.6; } }
    else if (b.st === 'slamWind') { b.vx = 0; if (b.t > warnT(g, b, 0.8)) {
      bset(b, 'slam'); emit(g, 'thud', {}); g.fx.push({ kind: 'shake', t: 0.3 });
      for (const d of [-1, 1]) g.eshots.push({ kind: 'wave', x: b.x + d * 1.2, y: b.floor, px: b.x, py: b.floor, vx: d * 6.5, vy: 0, r: 0.4, box: { w: 0.7, h: 0.7 }, t: 0, life: 4 });
      const n = b.phase >= 2 ? 3 : 2;
      for (let i = 0; i < n; i++) { const x = clamp(p.x + (i - (n - 1) / 2) * 3.2, A.l, A.r); g.eshots.push({ kind: 'mark', harmless: true, x, y: b.floor, px: x, py: b.floor, vx: 0, vy: 0, r: 0, t: 0, warn: 0, on: 1.0, life: 2 });
        g.eshots.push({ kind: 'clod', x, y: b.y0 + 14 + i * 0.8, px: x, py: b.y0 + 14, vx: 0, vy: -1, grav: 18, r: 0.42, t: 0, life: 4 }); }
    } }
    else if (b.st === 'slam') { if (b.t > 0.3) { bset(b, 'recover'); } }
    else if (b.st === 'recover') { if (b.t > 0.9) { bset(b, 'walk'); b.cd = 1.2; } }
    moveBody(g, b, TICK);
    b.x = clamp(b.x, A.l + b.w / 2, A.r - b.w / 2);
  },
  // ---- 2. 魔女: 高さを変えて飛び、光の輪→扇状の斉射。急降下→着地で立ち尽くす（隙）
  witch(g, b, intro) {
    const p = g.player, A = arena(b);
    const lowY = b.floor + 2.2, highY = b.floor + 6.5;
    if (intro) { b.y = b.floor + 6 + Math.sin(b.t * 2) * 0.4; return; }
    const fly = () => { b.x += (b.tx - b.x) * (1 - Math.exp(-TICK * 2.2)); b.y += (b.ty - b.y) * (1 - Math.exp(-TICK * 2.2)); };
    if (b.st === 'intro' || b.st === 'hover') {
      if (b.st === 'intro' || b.t === TICK) { b.tx = clamp(p.x + (g.rand() < 0.5 ? -6 : 6), A.l + 1, A.r - 1); b.ty = b.n % 3 === 1 ? lowY : highY; if (b.st === 'intro') bset(b, 'hover'); }
      fly(); b.face = sign(p.x - b.x) || b.face;
      if (b.t > 1.4) { b.n++; bset(b, b.n % 3 === 0 ? 'diveWind' : 'fanWind'); emit(g, 'bossWarn', { kind: b.st }); }
    } else if (b.st === 'fanWind') { fly(); if (b.t > warnT(g, b, 0.8)) {
      const n = b.phase >= 2 ? 7 : 5, base = Math.atan2(p.y + 0.8 - (b.y + 1), p.x - b.x);
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.24; g.eshots.push({ kind: 'orb', x: b.x, y: b.y + 1, px: b.x, py: b.y + 1, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, r: 0.26, t: 0, life: 5, ghost: true }); }
      emit(g, 'eShot', { kind: 'fan' }); bset(b, 'hover'); } }
    else if (b.st === 'diveWind') { b.tx = clamp(p.x, A.l + 1, A.r - 1); b.ty = highY + 0.5; fly(); if (b.t > warnT(g, b, 0.75)) { bset(b, 'dive'); b.dx = b.x; b.vx = (clamp(p.x, A.l + 1, A.r - 1) - b.x) / 0.55; emit(g, 'bossRoar'); } }
    else if (b.st === 'dive') { b.x += b.vx * TICK; b.y -= 14 * TICK; if (b.y <= b.floor) { b.y = b.floor; bset(b, 'landed'); emit(g, 'thud', {}); g.fx.push({ kind: 'shake', t: 0.25 });
      for (const d of [-1, 1]) g.eshots.push({ kind: 'wave', x: b.x + d * 0.8, y: b.floor, px: b.x, py: b.floor, vx: d * 5, vy: 0, r: 0.35, box: { w: 0.6, h: 0.5 }, t: 0, life: 1.4 }); } }
    else if (b.st === 'landed') { if (b.t > 1.4) { bset(b, 'hover'); } }
    b.x = clamp(b.x, A.l + 0.7, A.r - 0.7);
  },
  // ---- 3. 沼獣: 潜る（無敵）→ 出てくる井戸に泡と波紋の予告 → 跳び出す → 岸で這う（隙）→ 水弾 → 井戸へ戻る
  riverbeast(g, b, intro) {
    const p = g.player;
    if (intro) { b.hittable = false; return; }
    if (b.st === 'submerged') {
      b.hittable = false; b.harm = false;
      if (b.t > 0.9) { // 予告の場所を決める（プレイヤーに一番近い井戸と、それ以外を交互）
        const ws = b.wells.slice().sort((a, c) => Math.abs(a - p.x) - Math.abs(c - p.x));
        b.wx = b.n % 2 === 0 ? ws[0] : ws[1]; b.n++;
        b.x = b.wx; bset(b, 'ripple'); emit(g, 'bossWarn', { kind: 'ripple', x: b.wx });
      }
    } else if (b.st === 'ripple') { b.hittable = false; b.harm = false; if (b.t > warnT(g, b, 0.95)) {
      bset(b, 'leap'); b.y = b.floor - 1.5; b.vy = 13; const tx = clamp(p.x, b.x0 + 2, b.x0 + 22); b.vx = clamp((tx - b.x) / 1.0, -7, 7); b.face = sign(b.vx) || -1; emit(g, 'splash', { x: b.x, y: b.floor }); } }
    else if (b.st === 'leap') {
      b.vy -= 24 * TICK; b.x += b.vx * TICK; b.y += b.vy * TICK;
      if (b.vy < 0 && b.y <= b.floor) {
        const ground = surfaceBelow(g, b.x, b.floor + 0.5, 1);
        if (ground != null) { b.y = b.floor; bset(b, 'onLand'); emit(g, 'thud', {}); g.fx.push({ kind: 'shake', t: 0.3 }); }
        else if (b.y < b.floor - 2.5) { bset(b, 'submerged'); }
      }
    } else if (b.st === 'onLand') {
      b.face = sign(p.x - b.x) || b.face;
      if (b.t > 1.1 && !b.spat) { b.spat = true; const n = b.phase >= 2 ? 4 : 3;
        for (let i = 0; i < n; i++) g.eshots.push({ kind: 'water', x: b.x + b.face, y: b.y + 1.4, px: b.x, py: b.y + 1, vx: b.face * (3 + i * 1.6), vy: 6 + i * 0.6, grav: 14, r: 0.28, t: 0, life: 4 });
        emit(g, 'eShot', { kind: 'water' }); }
      if (b.t > 1.9) { b.spat = false; bset(b, 'back'); const w = b.wells.slice().sort((a, c) => Math.abs(a - b.x) - Math.abs(c - b.x))[0]; b.vx = (w - b.x) / 0.8; b.vy = 7; }
    } else if (b.st === 'back') { b.vy -= 24 * TICK; b.x += b.vx * TICK; b.y += b.vy * TICK; if (b.y < b.floor - 2.4) { bset(b, 'submerged'); b.vx = 0; } }
    if (b.st === 'submerged' || b.st === 'ripple') b.y = b.floor - 3;
  },
  // ---- 4. 翼の守護者: 上空で狙いを定め（狙いの線）→ 急降下 → 着地の衝撃波 → 止まり木で息を整える（隙）／羽根の三連射
  warden(g, b, intro) {
    const p = g.player, A = arena(b), hy = b.floor + 7.5;
    if (intro) { b.y = hy + Math.sin(b.t * 3) * 0.3; return; }
    if (b.st === 'intro' || b.st === 'hover') {
      if (b.st === 'intro') bset(b, 'hover');
      const tx = clamp(p.x + Math.sin(b.t * 1.2) * 4, A.l + 1, A.r - 1);
      b.x += (tx - b.x) * (1 - Math.exp(-TICK * 1.6)); b.y += (hy + Math.sin(b.t * 3) * 0.5 - b.y) * (1 - Math.exp(-TICK * 3));
      b.face = sign(p.x - b.x) || b.face;
      if (b.t > 1.5) { b.n++; bset(b, b.n % 2 ? 'diveWind' : 'featherWind'); emit(g, 'bossWarn', { kind: b.st }); b.combo = b.phase >= 2 ? 2 : 1; }
    } else if (b.st === 'featherWind') { if (b.t > warnT(g, b, 0.65)) {
      for (const da of [-0.22, 0, 0.22]) { const a = Math.atan2(p.y + 0.8 - b.y, p.x - b.x) + da; g.eshots.push({ kind: 'feather', x: b.x, y: b.y + 0.5, px: b.x, py: b.y, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, r: 0.24, t: 0, life: 4, ghost: true }); }
      emit(g, 'eShot', { kind: 'feather' }); bset(b, 'hover'); } }
    else if (b.st === 'diveWind') { if (b.t < 0.3) { b.tx = clamp(p.x, A.l + 1, A.r - 1); } if (b.t > warnT(g, b, 0.85)) { bset(b, 'dive'); const d = Math.hypot(b.tx - b.x, b.floor - b.y); b.vx = ((b.tx - b.x) / d) * 16; b.vy = ((b.floor - b.y) / d) * 16; emit(g, 'bossRoar'); } }
    else if (b.st === 'dive') { b.x += b.vx * TICK; b.y += b.vy * TICK; if (b.y <= b.floor) { b.y = b.floor; bset(b, 'impact'); emit(g, 'thud', {}); g.fx.push({ kind: 'shake', t: 0.35 });
      for (const d of [-1, 1]) g.eshots.push({ kind: 'wave', x: b.x + d, y: b.floor, px: b.x, py: b.floor, vx: d * 7, vy: 0, r: 0.4, box: { w: 0.7, h: 0.6 }, t: 0, life: 3 }); } }
    else if (b.st === 'impact') { if (b.t > 0.25) { b.combo--; if (b.combo > 0) { bset(b, 'rise2'); } else bset(b, 'perch'); } }
    else if (b.st === 'rise2') { b.y += 12 * TICK; if (b.y > hy) { bset(b, 'diveWind'); } }
    else if (b.st === 'perch') { if (b.t > 1.5) bset(b, 'rise'); }
    else if (b.st === 'rise') { b.y += 8 * TICK; if (b.y >= hy) bset(b, 'hover'); }
    b.x = clamp(b.x, A.l + 1, A.r - 1);
  },
  // ---- 5. 炎の騎士: 離れると剣を掲げ→地を這う炎／火球の山なり三連。近いと引いて構え→横薙ぎ（上下とも当たる）→ 振り終わりの隙
  flameknight(g, b, intro) {
    const p = g.player, A = arena(b), dx = p.x - b.x, ad = Math.abs(dx);
    if (intro) return;
    b.vy -= 24 * TICK;
    if (b.st === 'intro' || b.st === 'walk') {
      if (b.st === 'intro') bset(b, 'walk');
      b.face = sign(dx) || b.face;
      b.vx = ad > 5 ? b.face * 1.6 : ad < 3 ? -b.face * 0.8 : 0;
      b.cd -= TICK;
      if (b.cd <= 0) {
        if (ad < 3.6) bset(b, 'slashWind'); else { b.n++; bset(b, b.n % 2 ? 'waveWind' : 'ballWind'); }
        b.vx = 0; emit(g, 'bossWarn', { kind: b.st });
      }
    } else if (b.st === 'waveWind') { b.vx = 0; if (b.t > warnT(g, b, 0.75)) {
      g.eshots.push({ kind: 'wave', fire: true, x: b.x + b.face, y: b.floor, px: b.x, py: b.floor, vx: b.face * 7.5, vy: 0, r: 0.5, box: { w: 0.8, h: 1.0 }, t: 0, life: 4 });
      emit(g, 'eShot', { kind: 'flame' }); bset(b, 'recover'); } }
    else if (b.st === 'ballWind') { b.vx = 0; if (b.t > warnT(g, b, 0.6)) {
      const n = b.phase >= 3 ? 4 : 3;
      for (let i = 0; i < n; i++) g.eshots.push({ kind: 'fireball', x: b.x + b.face * 0.6, y: b.y + 2.4, px: b.x, py: b.y + 2, vx: b.face * (2.8 + i * 1.9), vy: 8, grav: 16, r: 0.3, t: 0, life: 4 });
      emit(g, 'eShot', { kind: 'fireball' }); bset(b, 'recover'); } }
    else if (b.st === 'slashWind') { b.vx = -b.face * 0.6; if (b.t > warnT(g, b, 0.55)) { bset(b, 'slash'); emit(g, 'slash'); } }
    else if (b.st === 'slash') { b.vx = b.face * 4; b.extraHit = [{ x: b.x + b.face * 1.6, y: b.y, w: 2.4, h: 2.4 }]; if (b.t > 0.25) { bset(b, 'recover'); b.extraHit = null; } }
    else if (b.st === 'recover') { b.vx = 0; if (b.t > 1.0) { bset(b, 'walk'); b.cd = 0.9 + g.rand() * 0.5; } }
    moveBody(g, b, TICK);
    b.x = clamp(b.x, A.l + 0.7, A.r - 0.7);
  },
  // ---- 6. 魔城の主: 第 1 形態 光弾の環＋夜魔の召喚 / 第 2 形態 瞬間移動＋落雷の柱（印の予告）/ 第 3 形態 なぎ払う光線（低い→跳ぶ、高い→しゃがむ）
  lord(g, b, intro) {
    const p = g.player, A = arena(b);
    if (intro) { b.y = b.floor + 1.5 + Math.sin(b.t * 1.5) * 0.3; return; }
    if (b.st === 'intro') bset(b, 'float');
    if (b.st === 'float') {
      const tx = clamp(p.x + (b.x > p.x ? 6 : -6), A.l + 2, A.r - 2);
      b.x += (tx - b.x) * (1 - Math.exp(-TICK * 1.2)); b.y = b.floor + 1.5 + Math.sin(b.t * 1.5) * 0.3; b.face = sign(p.x - b.x) || b.face;
      if (b.t > (b.phase === 3 ? 1.1 : 1.6)) {
        b.n++;
        const pick = b.phase === 1 ? (b.n % 3 === 0 ? 'summon' : 'ringWind')
          : b.phase === 2 ? (b.n % 2 ? 'warpOut' : 'ringWind')
          : (b.n % 3 === 0 ? 'ringWind' : b.n % 3 === 1 ? 'sweepWind' : 'warpOut');
        bset(b, pick); emit(g, 'bossWarn', { kind: pick });
        if (pick === 'sweepWind') { b.low = g.rand() < 0.5; b.dir = p.x > b.x ? 1 : -1; }
      }
    } else if (b.st === 'ringWind') { if (b.t > warnT(g, b, 0.8)) {
      const n = b.phase >= 3 ? 12 : 9, off = g.rand() * 6.28;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; g.eshots.push({ kind: 'orb', x: b.x, y: b.y + 1.7, px: b.x, py: b.y + 1.7, vx: Math.cos(a) * 4.6, vy: Math.sin(a) * 4.6, r: 0.27, t: 0, life: 5, ghost: true }); }
      emit(g, 'eShot', { kind: 'ring' }); bset(b, 'tired'); } }
    else if (b.st === 'summon') { if (b.t > 0.9) {
      const alive = g.enemies.filter((e) => e.type === 'imp' && !e.dead).length;
      for (let i = alive; i < 2; i++) { const e = makeEnemy(g, { type: 'imp', x: b.x + (i ? 3 : -3), y: b.floor + 7 }); e.home = null; e.id = null; e.cd = 1.5; g.enemies.push(e); }
      emit(g, 'summon'); bset(b, 'tired'); } }
    else if (b.st === 'warpOut') { b.hittable = b.t < 0.25; b.harm = false; if (b.t > 0.5) {
      // 落雷の柱: プレイヤーの位置と左右 4u に印 → 0.8 秒後に落ちる
      for (const d of [0, -4.5, 4.5]) { const x = clamp(p.x + d, A.l + 0.5, A.r - 0.5); g.eshots.push({ kind: 'pillar', x, y: b.floor, px: x, py: b.floor, vx: 0, vy: 0, r: 0, box: { w: 1.0, h: 12 }, t: 0, warn: warnT(g, b, 0.85), on: 0.45, life: 2 }); }
      emit(g, 'eShot', { kind: 'pillar' });
      b.x = p.x > (A.l + A.r) / 2 ? A.l + 3 : A.r - 3; bset(b, 'warpIn'); } }
    else if (b.st === 'warpIn') { b.hittable = b.t > 0.3; b.harm = b.t > 0.5; if (b.t > 1.4) bset(b, 'tired'); }
    else if (b.st === 'sweepWind') { if (b.t > warnT(g, b, 1.0)) {
      const y = b.low ? b.floor + 0.25 : b.floor + 1.12; // 低い光線（足元 0.25〜0.67）は跳び越え、高い光線（1.12〜1.54）はしゃがんでかわす
      g.eshots.push({ kind: 'beam', x: b.x + b.dir * 1.5, dir: b.dir, y, px: b.x, py: y, vx: b.dir * 18, vy: 0, r: 0, box: { w: 3, h: 0.42 }, t: 0, life: 2, ghost: true });
      emit(g, 'eShot', { kind: 'beam' }); bset(b, 'sweep'); } }
    else if (b.st === 'sweep') { if (b.t > 0.8) bset(b, 'tired'); }
    else if (b.st === 'tired') { b.y = b.floor + 1.0; if (b.t > (b.phase === 3 ? 0.9 : 1.2)) bset(b, 'float'); }
    if (b.st !== 'warpOut' && b.st !== 'warpIn') b.harm = true;
  },
};

// ================================================================ クリア・ステージ遷移
function startClear(g) {
  g.mode = 'clear'; g.modeT = 0; g.tally = { time: Math.ceil(g.time), bonus: 0, phase: 0 };
  emit(g, 'stageClear', { stage: g.stageIndex });
}
function clearTally(g) {
  const t = g.tally;
  t.phase += TICK;
  if (t.phase > 1.2 && t.time > 0) {
    const k = Math.min(t.time, 3); t.time -= k; t.bonus += k * SCORE.timeBonusPerSec; g.score += k * SCORE.timeBonusPerSec;
    if (g.tick % 4 === 0) emit(g, 'tally');
  }
  if (t.time <= 0 && !t.doneT) t.doneT = t.phase;
  if (t.doneT && t.phase > t.doneT + 2.2) {
    g.hi = Math.max(g.hi, g.score);
    if (g.stageIndex >= 5) { g.mode = 'ending'; emit(g, 'ending', { score: g.score }); }
    else { g.mode = 'next'; emit(g, 'stageDone', { stage: g.stageIndex }); }
  }
}
// 次のステージへ（鎧は着直し、武器は持ち越す）
export function nextStage(g) {
  const w = g.weapon;
  loadStage(g, g.stageIndex + 1);
  g.weapon = w;
}
// ゲームオーバー後の再挑戦: 現在ステージの先頭から、初期残機・得点 0
export function retryStage(g) {
  g.lives = g.diff.lives; g.score = 0;
  loadStage(g, g.stageIndex, -1);
}
// 2 周目
export function startLoop2(g) { g.loop = 2; g.lives = Math.max(g.lives, g.diff.lives); loadStage(g, 0); }

// デバッグ・テスト用
export function debugWarpBoss(g) {
  const bd = g.def.boss;
  const i = g.cps.length - 1; g.cp = i; g.cpScore = g.score;
  resetAttempt(g, true);
  void bd;
}
export const VIEW = { w: VIEW_W, h: VIEW_H };
