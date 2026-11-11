// VOIDBLOOM — ルールとロジック（DOM なし・決定的・Node でテスト可能）
// 座標: 盤面は幅 FIELD_W × 高さ FIELD_H（単位 u）。x は右向き、y は上向き。
// 地形とブロックはワールド座標（wx = 盤面 x + scrollX）。敵・弾は盤面座標で持ち、
// 地形に固定された敵（anchored）はスクロール量だけ毎フレーム左へずらす。
// 1 tick = 1/60 秒（固定）。描画側は px/py（前 tick の位置）と補間して 120Hz/90Hz でも滑らかに見せる。
import { STAGES } from './stages.js';
import { ENEMY } from './enemies.js';
import { BOSS } from './bosses.js';

export const FIELD_W = 32, FIELD_H = 18, TICK_HZ = 60, DT = 1 / 60;
export const PLAYER_R = 0.22;          // 敵弾に対する当たり判定（小さめ）
export const PLAYER_BODY_R = 0.34;     // 地形・敵の体に対する当たり判定
export const SPEEDS = [6.5, 8.5, 10.5, 12.5];
export const POD_R = 0.75, BIT_R = 0.45, POD_OFFSET = 1.05;
export const CHARGE_TICKS = 66;        // 溜め 0 → 満タン（約 1.1 秒）
export const CHARGE_DELAY = 8;         // 押してから溜め始めるまで
export const BURST_POWER = [0, 5, 12, 22, 34, 50];
export const EXTENDS = [50000, 150000, 300000, 500000];
export const COLORS = { C: 'cyan', M: 'magenta', A: 'amber' };

// ---------- 乱数（mulberry32、状態は s.rs に数値で持つ） ----------
export function rand(s) {
  let t = (s.rs = (s.rs + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- 地形 ----------
// 折れ線 pts=[[x,y],...]（x 昇順）の wx での y。範囲外は端の値、空なら null。
export function lineAt(pts, wx) {
  if (!pts || pts.length === 0) return null;
  if (wx <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (wx >= pts[n - 1][0]) return pts[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= wx) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  return a[1] + (b[1] - a[1]) * (wx - a[0]) / (b[0] - a[0]);
}
export const NO_CEIL = FIELD_H + 6, NO_FLOOR = -6;
export function ceilAt(stage, wx) { const v = lineAt(stage.top, wx); return v == null ? NO_CEIL : v; }
export function floorAt(stage, wx) { const v = lineAt(stage.bottom, wx); return v == null ? NO_FLOOR : v; }

function circleRect(cx, cy, r, b) {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
// 盤面座標の円が地形かブロックに触れているか。触れたブロックを返す（地形なら true）。
export function hitsTerrain(s, x, y, r) {
  const wx = x + s.scrollX, st = s.stage;
  for (const dx of [-r * 0.7, 0, r * 0.7]) {
    if (y + r * (dx === 0 ? 1 : 0.7) > ceilAt(st, wx + dx)) return true;
    if (y - r * (dx === 0 ? 1 : 0.7) < floorAt(st, wx + dx)) return true;
  }
  for (const b of s.blocks) {
    if (!b.alive) continue;
    if (b.x > wx + r || b.x + b.w < wx - r) continue;
    if (circleRect(wx, y, r, b)) return b;
  }
  return false;
}

// ---------- 状態 ----------
let nextId = 1;
export function createGame(opts = {}) {
  const s = {
    opts, mode: 'play', tick: 0, rs: (opts.seed ?? 20261110) >>> 0,
    score: 0, hi: opts.hi || 0, lives: opts.lives ?? 2, continues: 0, extendIdx: 0,
    stageIndex: 0, loop: opts.loop || 1, rank: 1,
    events: [], timer: 0, clearTimer: 0, flash: 0, shake: 0, warn: 0,
    player: null, pod: null, bits: [], shots: [], enemies: [], ebullets: [], items: [], blocks: [], pending: [],
    boss: null, stats: { kills: 0, deaths: 0, shots: 0 },
    prevFire: false, prevPod: false, rapidT: 0,
  };
  startStage(s, opts.stage || 0, opts.checkpoint || 0, false);
  return s;
}

export function emit(s, ev) { s.events.push(ev); if (s.events.length > 3000) s.events.splice(0, 1000); }
const sfx = (s, id, extra) => emit(s, Object.assign({ t: 'sfx', id }, extra));
const fx = (s, k, x, y, size = 1, color = 'w') => emit(s, { t: 'fx', k, x, y, s: size, c: color });

export function startStage(s, index, cp = 0, keepEquip = true) {
  s.stageIndex = index;
  s.stage = STAGES[index];
  s.rank = 1 + 0.3 * (s.loop - 1);
  if (!keepEquip) { s.pod = null; s.bits = []; }
  resetToCheckpoint(s, cp, keepEquip);
  emit(s, { t: 'stage', index, name: s.stage.name });
  emit(s, { t: 'music', id: s.stage.music });
}

function newPlayer(keep) {
  return { x: 4, y: FIELD_H / 2, px: 4, py: FIELD_H / 2, alive: true, inv: 120, speedLv: keep ? keep.speedLv : 0,
    charge: 0, hold: 0, tilt: 0, shotCool: 0 };
}

export function checkpointIndex(s) {
  const cps = s.stage.checkpoints; let i = 0;
  for (let k = 0; k < cps.length; k++) if (cps[k] <= s.scrollX + 0.01) i = k;
  return i;
}

export function resetToCheckpoint(s, cp, keepEquip) {
  const st = s.stage;
  s.cp = Math.min(cp, st.checkpoints.length - 1);
  s.scrollX = st.checkpoints[s.cp];
  s.pscroll = s.scrollX;
  s.scrollSpeed = st.speed;
  const startX = s.scrollX + (s.cp === 0 ? 0 : FIELD_W * 0.85);
  s.spawnIdx = 0;
  while (s.spawnIdx < st.spawns.length && st.spawns[s.spawnIdx].x < startX) s.spawnIdx++;
  s.shots = []; s.enemies = []; s.ebullets = []; s.items = []; s.pending = [];
  s.boss = null; s.warn = 0;
  s.blocks = st.blocks.map((b, i) => ({ ...b, id: i, alive: true, hp: b.hp ?? Infinity, maxHp: b.hp ?? Infinity, flash: 0 }));
  const old = s.player;
  s.player = newPlayer(keepEquip && old ? old : null);
  if (s.pod && keepEquip) { s.pod.state = 'front'; s.pod.x = s.player.x + POD_OFFSET; s.pod.y = s.player.y; }
  else if (!keepEquip) s.pod = null;
  for (const b of s.bits) { b.x = s.player.x; b.y = s.player.y + b.side * 1.7; }
  // やり直し直後の救済: 運び屋を 2 体（SEED の結晶とスピード）
  if (s.cp > 0 && !keepEquip && st.recover) {
    st.recover.forEach((drop, k) => s.pending.push({ at: s.tick + 90 + k * 110, sp: { type: 'lantern', sx: FIELD_W + 1, mid: k ? 1.6 : -1.6, drop, x: 0 }, i: 0 }));
  }
  s.mode = 'play';
}

export function continueGame(s) {
  if (s.mode !== 'gameover') return;
  s.continues++; s.score = 0; s.lives = 2; s.extendIdx = 0;
  s.pod = null; s.bits = [];
  resetToCheckpoint(s, s.cp, false);
  emit(s, { t: 'music', id: s.stage.music });
}

// ---------- 1 tick ----------
// input: { x, y（-1〜1）, fire（撃つ／溜め・押している間 true）, rapid（連射）, pod（SEED 切り離し／呼び戻し） }
export function step(s, input = {}) {
  s.tick++;
  if (s.mode === 'gameover' || s.mode === 'complete') { s.timer++; return; }
  const p = s.player;
  p.px = p.x; p.py = p.y;
  if (s.pod) { s.pod.px = s.pod.x; s.pod.py = s.pod.y; }
  for (const b of s.bits) { b.px = b.x; b.py = b.y; }
  for (const a of [s.shots, s.enemies, s.ebullets, s.items]) for (const e of a) { e.px = e.x; e.py = e.y; }
  // 描画の補間用: 部位（ボス・蟲の節）と砲の向きの前 tick の値
  for (const e of s.enemies) { if (e.parts) for (const q of e.parts) { q.pox = q.ox; q.poy = q.oy; } e.pang = e.ang; }
  if (s.flash > 0) s.flash--;
  if (s.shake > 0) s.shake *= 0.9;
  if (s.warn > 0) s.warn--;

  // スクロール
  s.pscroll = s.scrollX;
  let d = s.scrollSpeed * DT;
  if (s.scrollX + d >= s.stage.bossStop) d = Math.max(0, s.stage.bossStop - s.scrollX);
  s.scrollX += d;
  for (const e of s.enemies) if (e.anchored) e.x -= d;
  for (const it of s.items) it.x -= d;

  spawnTick(s);
  if (s.mode === 'play') playerTick(s, input); else { s.prevFire = !!input.fire; s.prevPod = !!input.pod; }
  podTick(s, input);
  shotsTick(s);
  enemiesTick(s);
  bulletsTick(s);
  itemsTick(s);
  collide(s);
  cleanup(s);
  modeTick(s);
  for (const b of s.blocks) if (b.flash > 0) b.flash--;
}

function spawnTick(s) {
  const st = s.stage;
  if (s.mode !== 'play' && s.mode !== 'dying') return;
  while (s.spawnIdx < st.spawns.length && st.spawns[s.spawnIdx].x <= s.scrollX + FIELD_W + 1.5) {
    const sp = st.spawns[s.spawnIdx++];
    const n = sp.n || 1;
    for (let i = 0; i < n; i++) s.pending.push({ at: s.tick + i * (sp.gap ?? 14), sp, i });
  }
  for (let k = s.pending.length - 1; k >= 0; k--) {
    const q = s.pending[k];
    if (q.at <= s.tick) { s.pending.splice(k, 1); spawnEnemy(s, q.sp, q.i); }
  }
}

export function spawnEnemy(s, sp, i = 0, at) {
  const isBoss = !!BOSS[sp.type];
  const def = isBoss ? BOSS[sp.type] : ENEMY[sp.type];
  if (!def) throw new Error('unknown enemy type: ' + sp.type);
  const e = {
    id: nextId++, type: sp.type, sp, i, t: 0, hp: def.hp * (isBoss ? 1 : 1), maxHp: def.hp, r: def.r, score: def.score,
    x: at ? at.x : (sp.sx ?? (sp.x - s.scrollX + (sp.dx || 0))), y: at ? at.y : (sp.y ?? FIELD_H / 2), vx: 0, vy: 0,
    anchored: !!def.anchored, flash: 0, dead: false, drop: sp.drop || null, boss: isBoss, parts: null, open: 1, armored: false,
  };
  if (sp.fromLeft) e.x = -1.2;
  if (sp.mid != null) {
    const wx = e.x + s.scrollX, f = Math.max(floorAt(s.stage, wx), 0.5), c = Math.min(ceilAt(s.stage, wx), FIELD_H - 0.5);
    e.y = (f + c) / 2 + sp.mid * Math.min(1, (c - f) / 7);
  }
  if (def.anchored && sp.on) {
    const wx = e.x + s.scrollX;
    e.y = sp.on === 'floor' ? floorAt(s.stage, wx) + def.r * 0.55 : ceilAt(s.stage, wx) - def.r * 0.55;
    e.flip = sp.on === 'ceil';
  }
  e.px = e.x; e.py = e.y;
  def.init && def.init(e, s, sp);
  s.enemies.push(e);
  if (isBoss) {
    s.boss = e;
    emit(s, { t: 'music', id: def.music || 'boss' });
    emit(s, { t: 'boss', name: def.name });
    s.warn = 150;
    sfx(s, 'warning');
  }
  return e;
}

// ---------- 自機 ----------
function playerTick(s, inp) {
  const p = s.player;
  let ix = +inp.x || 0, iy = +inp.y || 0;
  const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
  const v = SPEEDS[p.speedLv];
  p.x = Math.max(0.6, Math.min(FIELD_W - 0.9, p.x + ix * v * DT));
  p.y = Math.max(0.45, Math.min(FIELD_H - 0.45, p.y + iy * v * DT));
  p.tilt += (iy - p.tilt) * 0.18;
  if (p.inv > 0) p.inv--;
  if (p.shotCool > 0) p.shotCool--;

  const fire = !!inp.fire, rapid = !!inp.rapid;
  if (fire && !s.prevFire) { volley(s); p.hold = 0; }
  if (fire) {
    p.hold++;
    if (p.hold > CHARGE_DELAY) {
      const before = p.charge;
      p.charge = Math.min(1, p.charge + 1 / CHARGE_TICKS);
      if (before < 0.18 && p.charge >= 0.18) sfx(s, 'charge');
      if (before < 1 && p.charge >= 1) sfx(s, 'chargeFull');
    }
  } else if (s.prevFire) {
    if (p.charge >= 0.18) burst(s, Math.min(5, 1 + Math.floor(p.charge * 4.999)));
    p.charge = 0; p.hold = 0;
  }
  if (rapid && !fire) { if (s.rapidT <= 0) { volley(s); s.rapidT = 5; } s.rapidT--; } else s.rapidT = 0;
  s.prevFire = fire;
}

const countShots = (s, kind, owner) => { let n = 0; for (const o of s.shots) if (o.kind === kind && (!owner || o.owner === owner)) n++; return n; };
function addShot(s, o) { o.id = nextId++; o.px = o.x; o.py = o.y; o.t = 0; o.hits = o.hits || null; s.shots.push(o); return o; }

function volley(s) {
  const p = s.player, pod = s.pod;
  s.stats.shots++;
  if (countShots(s, 'pel', 'p') < 6) { addShot(s, { kind: 'pel', owner: 'p', x: p.x + 0.7, y: p.y, vx: 44, vy: 0, dmg: 1, r: 0.22 }); sfx(s, 'shot'); }
  if (pod) {
    const att = pod.state === 'front' || pod.state === 'back';
    if (att && pod.level > 0) laserVolley(s, pod.state === 'front' ? 1 : -1);
    else if (!att && pod.state !== 'enter') {
      if (countShots(s, 'pel', 'pod') < 6) {
        addShot(s, { kind: 'pel', owner: 'pod', x: pod.x + 0.6, y: pod.y, vx: 40, vy: 0, dmg: 1, r: 0.22 });
        if (pod.level >= 2) for (const a of [0.42, -0.42]) addShot(s, { kind: 'pel', owner: 'pod', x: pod.x, y: pod.y, vx: 36 * Math.cos(a), vy: 36 * Math.sin(a), dmg: 1, r: 0.2 });
        if (pod.level >= 3) addShot(s, { kind: 'pel', owner: 'pod', x: pod.x - 0.6, y: pod.y, vx: -36, vy: 0, dmg: 1, r: 0.2 });
      }
    }
  }
  for (const b of s.bits) if (countShots(s, 'pel', 'bit' + b.side) < 3) addShot(s, { kind: 'pel', owner: 'bit' + b.side, x: b.x + 0.4, y: b.y, vx: 40, vy: 0, dmg: 0.7, r: 0.18 });
}

function laserVolley(s, dir) {
  const pod = s.pod, lv = pod.level, x = pod.x + dir * 0.6, y = pod.y;
  if (pod.color === 'C') {
    if (countShots(s, 'lance') >= 3 * lv) return;
    const ys = lv === 1 ? [0] : lv === 2 ? [-0.32, 0.32] : [-0.6, 0, 0.6];
    for (const oy of ys) addShot(s, { kind: 'lance', x, y: y + oy, dir, len: 0, maxLen: 3.2 + lv * 1.3, w: 0.14 + lv * 0.06, stopped: false, dmg: 1.2 + 0.35 * lv, r: 0.2, hits: {} });
    sfx(s, 'laserC');
  } else if (pod.color === 'M') {
    if (countShots(s, 'rico') >= 4 * lv) return;
    const angs = lv === 1 ? [0.42, -0.42] : lv === 2 ? [0.42, 0, -0.42] : [0.66, 0.24, -0.24, -0.66];
    for (const a of angs) addShot(s, { kind: 'rico', x, y, vx: dir * 34 * Math.cos(a), vy: 34 * Math.sin(a), bounces: 2 + lv, dmg: 1.6 + 0.5 * lv, r: 0.24, trail: [], pierce: lv >= 3, hits: {} });
    sfx(s, 'laserM');
  } else {
    if (countShots(s, 'crawl') >= 2 * lv + 2) return;
    for (const vy of [1, -1]) addShot(s, { kind: 'crawl', x, y, dir, vy, phase: 'vert', dmg: 1.5 + 0.55 * lv, r: 0.3 + 0.06 * lv, lv, hits: {}, lastSurf: null, trail: [] });
    if (lv >= 2) addShot(s, { kind: 'pel', owner: 'pod', x, y, vx: dir * 40, vy: 0, dmg: 1.2, r: 0.24 });
    sfx(s, 'laserA');
  }
}

function burst(s, lv) {
  const p = s.player;
  addShot(s, { kind: 'burst', x: p.x + 0.9, y: p.y, vx: 38, vy: 0, lv, r: 0.32 + 0.22 * lv, power: BURST_POWER[lv], hits: {} });
  sfx(s, 'burst', { lv });
  s.shake = Math.max(s.shake, 0.05 * lv);
}

// ---------- SEED（着脱ユニット）と僚機 ----------
function podTick(s, inp) {
  const pod = s.pod, p = s.player;
  const press = !!inp.pod && !s.prevPod;
  s.prevPod = !!inp.pod;
  if (pod) {
    pod.t++;
    if (pod.cool > 0) pod.cool--;
    const alive = p.alive && s.mode === 'play';
    if (press && alive) {
      if (pod.state === 'front' || pod.state === 'back') { pod.dir = pod.state === 'front' ? 1 : -1; pod.state = 'launch'; pod.cool = 24; sfx(s, 'podLaunch'); }
      else if (pod.state === 'free' || pod.state === 'launch') { pod.state = 'return'; sfx(s, 'podRecall'); }
    }
    switch (pod.state) {
      case 'front': pod.x = p.x + POD_OFFSET; pod.y = p.y; break;
      case 'back': pod.x = p.x - POD_OFFSET; pod.y = p.y; break;
      case 'launch':
        pod.x += pod.dir * 28 * DT; pod.y += (p.y - pod.y) * 0.03;
        if (pod.x > FIELD_W - 1.4 || pod.x < 1.2) { pod.x = Math.max(1.2, Math.min(FIELD_W - 1.4, pod.x)); pod.state = 'free'; }
        break;
      case 'free':
        if (alive) pod.y += (p.y - pod.y) * 0.035;
        break;
      case 'enter': case 'return': {
        if (!alive) { pod.state = 'free'; break; }
        const side = pod.state === 'enter' ? 1 : (pod.x >= p.x ? 1 : -1);
        const tx = p.x + side * POD_OFFSET, ty = p.y;
        const dx = tx - pod.x, dy = ty - pod.y, dd = Math.hypot(dx, dy), sp = 24 * DT;
        if (dd <= sp + 0.05) { pod.x = tx; pod.y = ty; pod.state = side > 0 ? 'front' : 'back'; sfx(s, 'podAttach'); }
        else { pod.x += dx / dd * sp; pod.y += dy / dd * sp; }
        break;
      }
    }
    // 自由状態で自機が触れたら、触れた側にくっつく
    if ((pod.state === 'free' || pod.state === 'launch') && pod.cool <= 0 && alive) {
      if (Math.hypot(pod.x - p.x, pod.y - p.y) < 1.15) { pod.state = pod.x >= p.x ? 'front' : 'back'; sfx(s, 'podAttach'); }
    }
  }
  for (const b of s.bits) {
    b.t++;
    if (p.alive) { b.x += (p.x - 0.15 - b.x) * 0.22; b.y += (p.y + b.side * 1.7 - b.y) * 0.22; }
  }
}

function givePod(s, color) {
  const p = s.player;
  if (!s.pod) {
    s.pod = { x: -1.2, y: p.y, px: -1.2, py: p.y, state: 'enter', level: color ? 1 : 0, color: color || 'C', t: 0, cool: 0, dir: 1 };
    sfx(s, 'podGet');
    return;
  }
  if (color) {
    if (s.pod.color === color || s.pod.level === 0) s.pod.level = Math.min(3, s.pod.level + 1);
    else s.pod.level = Math.max(1, s.pod.level);
    s.pod.color = color;
    sfx(s, 'powerUp', { color });
  }
}

// ---------- 自機弾 ----------
function surfaceY(s, wx, up) { return up ? ceilAt(s.stage, wx) : floorAt(s.stage, wx); }
function lineSlope(pts, wx) { if (!pts || pts.length < 2) return 0; const a = lineAt(pts, wx - 0.2), b = lineAt(pts, wx + 0.2); return (b - a) / 0.4; }

function shotsTick(s) {
  for (const o of s.shots) {
    o.t++;
    switch (o.kind) {
      case 'pel':
        o.x += o.vx * DT; o.y += o.vy * DT;
        if (o.x > FIELD_W + 1 || o.x < -1 || o.y < -1 || o.y > FIELD_H + 1) o.dead = true;
        else if (hitBlockOrTerrain(s, o)) { o.dead = true; fx(s, 'spark', o.x, o.y, 0.6, 'w'); }
        break;
      case 'lance': {
        const sp = 56 * DT;
        if (!o.stopped) {
          o.x += o.dir * sp; o.len = Math.min(o.maxLen, o.len + sp);
          if (o.x > FIELD_W + 0.5 || o.x < -0.5) o.stopped = true;
          else if (hitBlockOrTerrain(s, o)) { o.stopped = true; fx(s, 'spark', o.x, o.y, 0.8, 'C'); }
        } else { o.len -= sp; if (o.len <= 0) o.dead = true; }
        break;
      }
      case 'rico': {
        o.trail.push(o.x, o.y); if (o.trail.length > 16) o.trail.splice(0, 2);
        const nx = o.x + o.vx * DT, ny = o.y + o.vy * DT;
        const wx = nx + s.scrollX;
        let bounced = false;
        if (ny > FIELD_H - 0.15 || ny > ceilAt(s.stage, wx) - 0.1) { reflect(o, s.stage.top, wx, -1); bounced = true; }
        else if (ny < 0.15 || ny < floorAt(s.stage, wx) + 0.1) { reflect(o, s.stage.bottom, wx, 1); bounced = true; }
        else {
          const b = blockAt(s, nx, ny, 0.12);
          if (b) {
            const bx = wx, by = ny;
            const inX = o.x + s.scrollX > b.x && o.x + s.scrollX < b.x + b.w;
            if (inX) o.vy = -o.vy; else o.vx = -o.vx;
            bounced = true; if (b.hp !== Infinity) damageBlock(s, b, o.dmg);
            void bx; void by;
          }
        }
        if (bounced) { o.bounces--; fx(s, 'spark', o.x, o.y, 0.5, 'M'); if (o.bounces < 0) o.dead = true; }
        else { o.x = nx; o.y = ny; }
        if (o.x > FIELD_W + 1 || o.x < -1) o.dead = true;
        break;
      }
      case 'crawl': {
        o.trail.push(o.x, o.y); if (o.trail.length > 20) o.trail.splice(0, 2);
        if (o.phase === 'vert') {
          o.y += o.vy * 30 * DT; o.x += o.dir * 4 * DT;
          const wx = o.x + s.scrollX;
          const surf = surfaceY(s, wx, o.vy > 0);
          const edge = o.vy > 0 ? Math.min(surf, FIELD_H) : Math.max(surf, 0);
          if ((o.vy > 0 && o.y + o.r >= edge) || (o.vy < 0 && o.y - o.r <= edge)) { o.phase = 'crawl'; o.y = edge - o.vy * o.r; o.lastSurf = edge; sfx(s, 'crawlHit'); }
          else if (blockAt(s, o.x, o.y, o.r)) o.dead = true;
        } else {
          o.x += o.dir * 22 * DT;
          const wx = o.x + s.scrollX;
          const surf = surfaceY(s, wx, o.vy > 0);
          const edge = o.vy > 0 ? Math.min(surf, FIELD_H) : Math.max(surf, 0);
          if (Math.abs(edge - o.lastSurf) > 1.1) o.dead = true; // 壁にぶつかった
          o.lastSurf = edge; o.y = edge - o.vy * o.r;
          if (blockAt(s, o.x, o.y, o.r * 0.8)) { o.dead = true; fx(s, 'spark', o.x, o.y, 0.8, 'A'); }
        }
        if (o.x > FIELD_W + 1 || o.x < -1 || o.t > 240) o.dead = true;
        break;
      }
      case 'burst':
        o.x += o.vx * DT;
        if (o.x > FIELD_W + o.r + 1) o.dead = true;
        else {
          const hb = hitsTerrain(s, o.x + o.r * 0.4, o.y, o.r * 0.55);
          if (hb) {
            if (hb !== true && hb.hp !== Infinity) { const d = Math.min(o.power, hb.hp); damageBlock(s, hb, d); o.power -= d; if (o.power <= 0) o.dead = true; }
            else { o.dead = true; fx(s, 'boom', o.x, o.y, 0.5 + o.lv * 0.25, 'C'); sfx(s, 'burstHit'); }
          }
        }
        break;
    }
  }
}
function reflect(o, pts, wx, ny) {
  const k = lineSlope(pts, wx);
  let nx = -k, nyy = 1; const l = Math.hypot(nx, nyy); nx /= l; nyy /= l;
  nyy *= ny; nx *= ny;
  const dot = o.vx * nx + o.vy * nyy;
  o.vx -= 2 * dot * nx; o.vy -= 2 * dot * nyy;
  if (ny < 0 && o.vy > 0) o.vy = -o.vy;
  if (ny > 0 && o.vy < 0) o.vy = -o.vy;
}
function blockAt(s, x, y, r) {
  const wx = x + s.scrollX;
  for (const b of s.blocks) if (b.alive && b.x <= wx + r && b.x + b.w >= wx - r && circleRect(wx, y, r, b)) return b;
  return null;
}
function hitBlockOrTerrain(s, o) {
  const h = hitsTerrain(s, o.x, o.y, o.r);
  if (h && h !== true && h.hp !== Infinity) damageBlock(s, h, o.dmg || 1);
  return !!h;
}
function damageBlock(s, b, dmg) {
  b.hp -= dmg; b.flash = 4;
  if (b.hp <= 0 && b.alive) {
    b.alive = false; s.score += b.score || 100;
    fx(s, 'boom', b.x + b.w / 2 - s.scrollX, b.y + b.h / 2, Math.max(b.w, b.h) * 0.5, b.kind === 'cyst' ? 'bio' : 'w');
    sfx(s, 'blockBreak');
  }
}

// ---------- 敵 ----------
export function fireBullet(s, x, y, ang, spd, kind = 'orb', r) {
  if (s.ebullets.length > 420) return null;
  const v = spd * (0.85 + 0.15 * s.rank);
  const b = { id: nextId++, x, y, px: x, py: y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: r ?? (kind === 'big' ? 0.5 : kind === 'needle' ? 0.16 : kind === 'flame' ? 0.36 : 0.22), kind, t: 0, life: kind === 'flame' ? 42 : 900 };
  s.ebullets.push(b);
  return b;
}
export function aimAngle(s, x, y) { const p = s.player; return Math.atan2(p.y - y, p.x - x); }
export function aim(s, e, spd, off = 0, kind = 'orb', ox = 0, oy = 0) {
  if (!s.player.alive || s.mode !== 'play') return null;
  const x = e.x + ox, y = e.y + oy;
  if (x < 1.5 || x > FIELD_W - 0.5) return null;
  return fireBullet(s, x, y, aimAngle(s, x, y) + off, spd, kind);
}

function enemiesTick(s) {
  for (const e of s.enemies) {
    if (e.dead) continue;
    e.t++;
    if (e.flash > 0) e.flash--;
    const def = e.boss ? BOSS[e.type] : ENEMY[e.type];
    def.update(e, s);
    if (!e.boss && !e.keep) {
      if (e.x < -4 || e.x > FIELD_W + 8 || e.y < -5 || e.y > FIELD_H + 5) e.dead = e.offscreenKill = true;
    }
  }
}

export function partPos(e, part) { return { x: e.x + part.ox, y: e.y + part.oy }; }

// 敵 e に dmg を与える。part を指定したときはその部位で判定。戻り値: 'hit' | 'block' | 'none'
export function damageEnemy(s, e, dmg, part) {
  if (e.dead) return 'none';
  if (e.inv > 0) return 'block';
  if (part) {
    if (part.kind === 'solid') { e.flashSolid = 2; return 'block'; }
    if (part.kind === 'petal') {
      part.hp -= dmg; part.flash = 4;
      if (part.hp <= 0 && !part.gone) { part.gone = true; s.score += 2000; const q = partPos(e, part); fx(s, 'boom', q.x, q.y, 1.4, 'bio'); sfx(s, 'explodeM'); }
      return 'hit';
    }
    if (part.kind === 'weak' && !part.active) return 'block';
  } else if (e.armored) { e.flashSolid = 2; return 'block'; }
  e.hp -= dmg; e.flash = 4;
  if (e.hp <= 0) killEnemy(s, e);
  return 'hit';
}

export function killEnemy(s, e) {
  if (e.dead) return;
  e.dead = true; e.killed = true;
  s.stats.kills++;
  addScore(s, e.score);
  const def = e.boss ? BOSS[e.type] : ENEMY[e.type];
  if (e.boss) { bossDown(s, e); return; }
  fx(s, 'boom', e.x, e.y, e.r * 1.4, def.color || 'w');
  sfx(s, e.r > 0.9 ? 'explodeM' : 'explodeS');
  if (e.drop) dropItem(s, e.x, e.y, e.drop);
  def.onDeath && def.onDeath(e, s);
}

function addScore(s, n) {
  s.score += n;
  if (s.score > s.hi) s.hi = s.score;
  while (s.extendIdx < EXTENDS.length && s.score >= EXTENDS[s.extendIdx]) { s.extendIdx++; s.lives++; sfx(s, 'extend'); emit(s, { t: 'extend' }); }
}

function dropItem(s, x, y, kind) { s.items.push({ id: nextId++, kind, x, y, px: x, py: y, t: 0 }); }

function bossDown(s, e) {
  s.mode = 'bossdown'; s.timer = 0;
  for (const b of s.ebullets) fx(s, 'spark', b.x, b.y, 0.4, 'w');
  s.ebullets = [];
  for (const o of s.enemies) if (o !== e && !o.dead) { o.dead = true; fx(s, 'boom', o.x, o.y, o.r * 1.2, 'w'); }
  e.dead = false; e.dying = true; // 崩れていく演出のために残す
  emit(s, { t: 'music', id: null });
  sfx(s, 'bossDown');
}

// ---------- 敵弾 ----------
function bulletsTick(s) {
  for (const b of s.ebullets) {
    b.t++;
    b.x += b.vx * DT; b.y += b.vy * DT;
    if (b.accel) { b.vx *= b.accel; b.vy *= b.accel; }
    if (b.t > b.life || b.x < -1.5 || b.x > FIELD_W + 1.5 || b.y < -1.5 || b.y > FIELD_H + 1.5) b.dead = true;
    else if (b.kind !== 'big' && b.kind !== 'flame' && b.t > 4 && (b.t & 1) === 0 && hitsTerrain(s, b.x, b.y, b.r * 0.6)) b.dead = true;
  }
}

function itemsTick(s) {
  for (const it of s.items) {
    it.t++;
    it.x -= 0.8 * DT; it.y += Math.sin(it.t * 0.06) * 0.012;
    if (it.x < -1.5) it.dead = true;
  }
}

// ---------- 当たり判定 ----------
function enemyCircles(e) {
  if (!e.parts) return null;
  return e.parts;
}
function circleHit(ax, ay, ar, bx, by, br) { const dx = ax - bx, dy = ay - by, r = ar + br; return dx * dx + dy * dy < r * r; }
// 線分（x0→x1, y 一定、幅 w）と円
function segHit(x0, x1, y, w, cx, cy, cr) {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  const nx = Math.max(lo, Math.min(cx, hi));
  const dx = cx - nx, dy = cy - y, r = cr + w;
  return dx * dx + dy * dy < r * r;
}

function shotTouches(o, x, y, r) {
  if (o.kind === 'lance') return segHit(o.x, o.x - o.dir * o.len, o.y, o.w, x, y, r);
  return circleHit(o.x, o.y, o.r, x, y, r);
}

function collide(s) {
  const p = s.player;
  // 自機弾 → 敵
  for (const o of s.shots) {
    if (o.dead) continue;
    for (const e of s.enemies) {
      if (e.dead || e.dying || e.ghost) continue;
      const parts = enemyCircles(e);
      if (parts) {
        // 部位ごと（ボスなど）: 弾は最初に当たった部位で止まる
        let done = false;
        for (const part of parts) {
          if (part.gone || part.off) continue;
          const q = partPos(e, part);
          if (!shotTouches(o, q.x, q.y, part.r)) continue;
          if (!canHit(s, o, e, part)) { done = o.kind !== 'lance' && o.kind !== 'crawl'; if (done) break; continue; }
          const res = applyShot(s, o, e, part);
          if (res !== 'pierce') { done = true; break; }
        }
        if (done || o.dead) break;
      } else if (shotTouches(o, e.x, e.y, e.r)) {
        if (!canHit(s, o, e)) continue;
        const res = applyShot(s, o, e, null);
        if (res !== 'pierce') break;
      }
    }
  }
  // SEED と僚機: 敵に体当たりダメージ、小さい敵弾を消す
  const guards = [];
  if (s.pod && p.alive) guards.push({ x: s.pod.x, y: s.pod.y, r: POD_R, dmg: 0.35, pod: true });
  for (const b of s.bits) if (p.alive) guards.push({ x: b.x, y: b.y, r: BIT_R, dmg: 0.12 });
  for (const g of guards) {
    for (const b of s.ebullets) {
      if (b.dead || b.r > 0.34 || b.kind === 'flame') continue;
      if (circleHit(g.x, g.y, g.r, b.x, b.y, b.r)) { b.dead = true; fx(s, 'spark', b.x, b.y, 0.35, g.pod ? 'C' : 'bio'); if ((s.tick & 3) === 0) sfx(s, 'block'); }
    }
    for (const e of s.enemies) {
      if (e.dead || e.dying || e.ghost) continue;
      if (e.parts) {
        for (const part of e.parts) {
          if (part.gone || part.off) continue;
          const q = partPos(e, part);
          if (circleHit(g.x, g.y, g.r, q.x, q.y, part.r)) { if (part.kind !== 'solid') damageEnemy(s, e, g.dmg, part); }
        }
      } else if (circleHit(g.x, g.y, g.r, e.x, e.y, e.r)) {
        if (!e.armored) { damageEnemy(s, e, g.dmg); if ((s.tick & 7) === 0) fx(s, 'spark', (g.x + e.x) / 2, (g.y + e.y) / 2, 0.5, 'C'); }
      }
    }
  }
  // 自機
  if (p.alive && s.mode === 'play' && p.inv <= 0 && !s.opts.invincible) {
    let dead = false;
    if (hitsTerrain(s, p.x, p.y, PLAYER_BODY_R)) dead = true;
    if (!dead) for (const b of s.ebullets) if (!b.dead && circleHit(p.x, p.y, PLAYER_R, b.x, b.y, b.r)) { dead = true; break; }
    if (!dead) for (const e of s.enemies) {
      if (e.dead || e.dying || e.noContact) continue;
      if (e.parts) { for (const part of e.parts) { if (part.gone || part.off || part.noContact) continue; const q = partPos(e, part); if (circleHit(p.x, p.y, PLAYER_BODY_R, q.x, q.y, part.r * 0.92)) { dead = true; break; } } }
      else if (circleHit(p.x, p.y, PLAYER_BODY_R, e.x, e.y, e.r * 0.85)) dead = true;
      if (dead) break;
    }
    if (dead) killPlayer(s);
  }
  // アイテム
  if (p.alive) for (const it of s.items) {
    if (!it.dead && circleHit(p.x, p.y, 0.95, it.x, it.y, 0.5)) { it.dead = true; pickup(s, it.kind); fx(s, 'pickup', it.x, it.y, 1, it.kind); }
  }
}

function canHit(s, o, e, part) {
  if (o.hits) { const last = o.hits[e.id + (part ? ':' + e.parts.indexOf(part) : '')]; if (last != null && s.tick - last < (o.kind === 'burst' ? 1e9 : 6)) return false; }
  return true;
}
function applyShot(s, o, e, part) {
  const key = e.id + (part ? ':' + e.parts.indexOf(part) : '');
  if (o.kind === 'burst') {
    const need = part ? (part.kind === 'petal' ? part.hp : e.hp) : (e.armored ? Infinity : e.hp);
    const res = damageEnemy(s, e, Math.min(o.power, Math.max(0.01, need)), part);
    o.hits[key] = s.tick;
    if (res === 'block') { o.dead = true; fx(s, 'boom', o.x, o.y, 0.4 + 0.2 * o.lv, 'C'); sfx(s, 'tink'); return 'stop'; }
    o.power -= Math.min(o.power, need);
    sfx(s, 'hit');
    if (o.power <= 0) { o.dead = true; fx(s, 'boom', o.x, o.y, 0.4 + 0.2 * o.lv, 'C'); return 'stop'; }
    return 'pierce';
  }
  const res = damageEnemy(s, e, o.dmg, part);
  if (o.hits) o.hits[key] = s.tick;
  if (res === 'block') {
    if (o.kind === 'lance' || o.kind === 'crawl') { fx(s, 'spark', o.x, o.y, 0.4, 'w'); o.stopped = true; if (o.kind === 'crawl') o.dead = true; return 'stop'; }
    o.dead = true; fx(s, 'spark', o.x, o.y, 0.5, 'w'); if ((s.tick & 1) === 0) sfx(s, 'tink'); return 'stop';
  }
  if ((s.tick & 1) === 0) sfx(s, 'hit');
  if (o.kind === 'lance' || o.kind === 'crawl') return 'pierce';
  if (o.kind === 'rico' && o.pierce && e.dead) return 'pierce';
  o.dead = true; fx(s, 'spark', o.x, o.y, 0.45, o.kind === 'rico' ? 'M' : 'w');
  return 'stop';
}

function pickup(s, kind) {
  const p = s.player;
  addScore(s, 500);
  if (kind === 'P') givePod(s, null);
  else if (kind === 'C' || kind === 'M' || kind === 'A') givePod(s, kind);
  else if (kind === 'S') { p.speedLv = Math.min(SPEEDS.length - 1, p.speedLv + 1); sfx(s, 'speedUp'); }
  else if (kind === 'B') {
    if (s.bits.length < 2) { const side = s.bits.some((b) => b.side === 1) ? -1 : 1; s.bits.push({ side, x: p.x, y: p.y, px: p.x, py: p.y, t: 0 }); sfx(s, 'bitGet'); }
    else { addScore(s, 2000); sfx(s, 'powerUp'); }
  }
  emit(s, { t: 'pickup', kind });
}

export function killPlayer(s) {
  const p = s.player;
  p.alive = false; s.mode = 'dying'; s.timer = 0;
  s.stats.deaths++;
  fx(s, 'boom', p.x, p.y, 2.2, 'C');
  sfx(s, 'death');
  s.shake = 0.6;
  if (s.pod) { fx(s, 'boom', s.pod.x, s.pod.y, 1.2, 'C'); }
  for (const b of s.bits) fx(s, 'boom', b.x, b.y, 0.8, 'bio');
  s.pod = null; s.bits = [];
  p.charge = 0;
}

function cleanup(s) {
  if (s.shots.some((o) => o.dead)) s.shots = s.shots.filter((o) => !o.dead);
  if (s.enemies.some((o) => o.dead)) s.enemies = s.enemies.filter((o) => !o.dead);
  if (s.ebullets.some((o) => o.dead)) s.ebullets = s.ebullets.filter((o) => !o.dead);
  if (s.items.some((o) => o.dead)) s.items = s.items.filter((o) => !o.dead);
}

function modeTick(s) {
  if (s.mode === 'dying') {
    s.timer++;
    if (s.timer >= 150) {
      if (s.lives > 0) {
        s.lives--;
        const cp = checkpointIndex(s);
        const wasBoss = !!s.boss;
        resetToCheckpoint(s, cp, false);
        emit(s, { t: 'respawn' });
        emit(s, { t: 'music', id: s.stage.music, restart: wasBoss });
      } else {
        s.cp = checkpointIndex(s);
        s.mode = 'gameover'; s.timer = 0;
        emit(s, { t: 'gameover' });
        emit(s, { t: 'music', id: 'gameover' });
      }
    }
  } else if (s.mode === 'bossdown') {
    s.timer++;
    const e = s.boss;
    if (e && s.timer % 6 === 0 && s.timer < 130) {
      const rr = e.r * 1.2;
      fx(s, 'boom', e.x + (rand(s) - 0.5) * rr * 2, e.y + (rand(s) - 0.5) * rr * 2, 0.8 + rand(s) * 1.4, BOSS[e.type].color || 'w');
      if (s.timer % 18 === 0) sfx(s, 'explodeM');
    }
    if (s.timer === 130 && e) { fx(s, 'boom', e.x, e.y, e.r * 2.2, 'big'); sfx(s, 'explodeL'); s.flash = 20; s.shake = 1; e.dead = true; s.enemies = s.enemies.filter((o) => o !== e); }
    if (s.timer === 170) { emit(s, { t: 'music', id: 'clear' }); emit(s, { t: 'clear', index: s.stageIndex }); }
    if (s.timer >= 470) {
      s.boss = null;
      if (s.stageIndex + 1 < STAGES.length) startStage(s, s.stageIndex + 1, 0, true);
      else { s.mode = 'complete'; s.timer = 0; emit(s, { t: 'complete' }); emit(s, { t: 'music', id: 'ending' }); }
    }
  }
}

// 2 周目へ（エンディング後）
export function nextLoop(s) {
  s.loop++;
  startStage(s, 0, 0, true);
}

// テスト・デバッグ用: 状態の要約
export function summary(s) {
  return { mode: s.mode, stage: s.stageIndex, scrollX: +s.scrollX.toFixed(2), score: s.score, lives: s.lives,
    enemies: s.enemies.length, bullets: s.ebullets.length, shots: s.shots.length, boss: s.boss ? { type: s.boss.type, hp: +s.boss.hp.toFixed(1) } : null };
}
