// AEGIS RELAY — 論理シミュレーション（2D 版・3D 版で同じものを使う）
// ・60Hz 固定の step()。描画は前 tick の位置（px, py）と補間する
// ・判定はすべて盤面の 2 次元座標（FIELD）。3D の高さや頭の位置は一切入らない
// ・乱数は状態に持つ（決定的）。同じ入力なら同じ結果
// ・音・演出は g.events に積むだけ。描画側・音側が読み出して消す
import { FIELD, HZ, TUNING as T, SCORE, AIR, GROUND, AREAS } from './rules.js';
import { buildArea } from './area-gen.js';

const DT = 1 / HZ;
const W = FIELD.W, H = FIELD.H;

export function createGame(opts = {}) {
  const g = {
    tick: 0, mode: 'play', phase: 'intro', phaseT: 0,
    area: opts.startArea || 0, loop: opts.startLoop || 0,
    score: 0, lives: T.lives, nextExtend: T.extend.first,
    seed: 12345, nextId: 1, scroll: 0,
    player: null, shots: [], enemies: [], bullets: [], ground: new Map(), groundDone: new Set(),
    pending: [], partner: null, chains: {}, twins: {}, waveIdx: 0, calm: 0,
    deathsThisArea: 0, events: [],
    flags: { autofire: !!opts.autofire, invincible: !!opts.invincible, tainted: !!opts.invincible },
    stats: { shots: 0, kills: 0, deaths: 0, sigils: 0, chainsFull: 0, twinBreaks: 0, docks: 0 },
  };
  g.player = newPlayer();
  loadArea(g, g.area);
  return g;
}

function newPlayer() {
  return { x: T.player.startX, y: T.player.startY + 40, px: T.player.startX, py: T.player.startY + 40,
    alive: true, invuln: T.respawnInvuln, deadT: 0, docked: false, dockAnim: 0, fireCd: 0, entering: 40, vx: 0, vy: 0 };
}

function rand(g) { g.seed = (g.seed * 1664525 + 1013904223) >>> 0; return g.seed / 4294967296; }
function ev(g, t, o = {}) { g.events.push({ t, tick: g.tick, ...o }); }

export function difficulty(g) {
  const L = g.loop;
  return {
    spd: Math.min(T.loop.speedCap, 1 + L * T.loop.speedStep),
    fire: Math.max(T.loop.fireCapMul, 1 - L * T.loop.fireStep),
    extra: L >= T.loop.extraWaveFrom - 1 ? Math.min(2, L) : 0,
  };
}

function loadArea(g, idx) {
  g.def = buildArea(idx);
  g.scroll = 0; g.waveIdx = 0; g.ground.clear(); g.groundDone.clear();
  g.enemies.length = 0; g.bullets.length = 0; g.pending.length = 0; g.partner = null;
  g.chains = {}; g.twins = {}; g.deathsThisArea = 0; g.coreBroken = false; g.coreHp = null;
  g.phase = 'intro'; g.phaseT = 0;
  ev(g, 'areaStart', { area: idx, loop: g.loop, name: AREAS[idx].name });
}

export function addScore(g, pts, x, y, label) {
  if (pts <= 0) return;
  g.score += pts;
  if (x != null) ev(g, 'score', { pts, x, y, label });
  while (g.score >= g.nextExtend) {
    g.nextExtend += T.extend.every;
    if (g.lives < T.maxLives) { g.lives++; ev(g, 'extend', { lives: g.lives }); }
  }
}

// ───────── 1 tick ─────────
// inp = { mx, my（-1..1）, fire（bool） }
export function step(g, inp) {
  if (g.mode === 'over') return;
  g.tick++;
  const p = g.player;
  for (const e of g.enemies) { e.px = e.x; e.py = e.y; }
  for (const s of g.shots) { s.px = s.x; s.py = s.y; }
  for (const b of g.bullets) { b.px = b.x; b.py = b.y; }
  for (const o of g.ground.values()) { o.px = o.x; o.py = o.y; }
  if (g.partner) { g.partner.px = g.partner.x; g.partner.py = g.partner.y; }
  p.px = p.x; p.py = p.y;
  if (g.calm > 0) g.calm--;
  g.phaseT++;

  g.pscroll = g.scroll; g.scroll += T.scroll * DT;
  if (g.phase === 'intro' && g.phaseT > 110) { g.phase = 'play'; g.phaseT = 0; }

  spawnWaves(g);
  for (let i = g.pending.length - 1; i >= 0; i--) {
    if (g.pending[i].at <= g.tick) { g.enemies.push(g.pending[i].e); g.pending.splice(i, 1); }
  }
  updatePlayer(g, inp);
  updateShots(g);
  updateGround(g);
  updateEnemies(g);
  updatePartner(g);
  updateBullets(g);
  collidePlayer(g);
  updateTwins(g);
  checkArea(g);

  g.enemies = g.enemies.filter((e) => !e.dead);
  g.shots = g.shots.filter((s) => !s.dead);
  g.bullets = g.bullets.filter((b) => !b.dead);
}

function spawnWaves(g) {
  if (g.phase === 'clear') return;
  const ws = g.def.waves;
  while (g.waveIdx < ws.length && ws[g.waveIdx].at <= g.scroll) { spawnWave(g, ws[g.waveIdx]); g.waveIdx++; }
}

function mk(g, type, x, y, o = {}) {
  const d = AIR[type];
  return { id: g.nextId++, type, x, y, px: x, py: y, hp: d.hp, hp0: o.hp ?? d.hp, r: d.r, t: 0, vx: 0, vy: 0, dead: false, flash: 0, fireT: 0, ...o };
}
function later(g, delay, e) { g.pending.push({ at: g.tick + delay, e }); }

function spawnWave(g, w) {
  const D = difficulty(g), n = (base) => base + D.extra;
  ev(g, 'wave', { t2: w.t });
  switch (w.t) {
    case 'scoutLine': for (let i = 0; i < n(5); i++) later(g, i * 10, mk(g, 'scout', w.x, -12, { mv: 'straight', vy: 72, drift: w.side * 6 })); break;
    case 'scoutV': {
      const offs = [0, -18, 18, -36, 36, -54, 54].slice(0, n(5));
      offs.forEach((o, i) => later(g, Math.abs(o) / 3, mk(g, 'scout', 120 + o, -12, { mv: 'straight', vy: 64, drift: 0 })));
      break;
    }
    case 'weaverPair':
      for (let i = 0; i < n(4); i++) for (const cx of [72, 168]) later(g, i * 14, mk(g, 'weaver', cx, -12, { mv: 'sine', x0: cx, vy: 56, amp: 30, ph: cx > 120 ? Math.PI : 0 }));
      break;
    case 'slicerL': case 'slicerR': {
      const s = w.t === 'slicerL' ? 1 : -1;
      for (let i = 0; i < n(4); i++) later(g, i * 12, mk(g, 'slicer', s > 0 ? -12 : W + 12, 20 + i * 4, { mv: 'line', vx: 84 * s, vy: 46 }));
      break;
    }
    case 'gunnerTrio': {
      const xs = [60, 120, 180, 30, 210].slice(0, n(3));
      xs.forEach((x, i) => later(g, i * 18, mk(g, 'gunner', x, -14, { mv: 'hold', ty: 56 + i * 12, hold: 160, fireEvery: 56 })));
      break;
    }
    case 'spinnerRing':
      for (let i = 0; i < n(6); i++) later(g, i * 9, mk(g, 'spinner', 120, -12, { mv: 'orbit', cx: 120, cy: 112, R: 64, a0: -Math.PI / 2, dir: w.side }));
      break;
    case 'diverSquad': {
      const xs = [50, 120, 190, 85, 155].slice(0, n(3));
      xs.forEach((x, i) => later(g, i * 22, mk(g, 'diver', x, -12, { mv: 'dive', ty: 40, tele: T.safety.enterTelegraph })));
      break;
    }
    case 'lancerSolo':
      later(g, 0, mk(g, 'lancer', w.x, -16, { mv: 'lancer', ty: 78, x0: w.x, fireEvery: 70 }));
      if (D.extra) later(g, 60, mk(g, 'lancer', W - w.x, -16, { mv: 'lancer', ty: 64, x0: W - w.x, fireEvery: 80 }));
      break;
    case 'twin': {
      const key = g.nextId;
      g.twins[key] = { start: g.tick, merged: false, resolved: false };
      g.enemies.push(mk(g, 'twinL', -14, 70, { mv: 'twin', key, side: -1, x0: -14 }));
      g.enemies.push(mk(g, 'twinR', W + 14, 70, { mv: 'twin', key, side: 1, x0: W + 14 }));
      ev(g, 'twinAppear', { x: 120, y: 80 });
      break;
    }
  }
}

function updatePlayer(g, inp) {
  const p = g.player;
  if (!p.alive) {
    p.deadT--;
    if (p.deadT <= 0) {
      if (g.lives <= 0) { g.mode = 'over'; ev(g, 'gameover', { score: g.score }); return; }
      Object.assign(p, newPlayer());
      g.bullets.length = 0; g.calm = T.respawnCalm;
      ev(g, 'respawn');
    }
    return;
  }
  if (p.invuln > 0) p.invuln--;
  if (p.dockAnim > 0) p.dockAnim--;
  let mx = inp.mx || 0, my = inp.my || 0;
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  if (p.entering > 0) { p.entering--; p.y += (T.player.startY - p.y) * 0.12; mx *= 0.3; my = 0; }
  const sp = T.player.speed * DT;
  p.vx = mx * T.player.speed; p.vy = my * T.player.speed;
  p.x = Math.min(T.player.maxX, Math.max(T.player.minX, p.x + mx * sp));
  p.y = Math.min(T.player.maxY + (p.entering > 0 ? 40 : 0), Math.max(T.player.minY, p.y + my * sp));
  const S = p.docked ? T.shotDocked : T.shot;
  if (p.fireCd > 0) p.fireCd--;
  const want = inp.fire || g.flags.autofire;
  if (want && p.fireCd <= 0 && g.shots.length < S.max) {
    p.fireCd = S.interval;
    const xs = p.docked ? [-S.spread, 0, S.spread] : [0];
    for (const dx of xs) g.shots.push({ x: p.x + dx, y: p.y - 9, px: p.x + dx, py: p.y - 9, vx: dx * 1.6, vy: -S.speed, r: S.r, dead: false });
    g.stats.shots++;
    ev(g, 'shot', { docked: p.docked, x: p.x, y: p.y });
  }
}

// 線分（a→b）と円の最短距離²
function segDist2(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t - cx, y = ay + dy * t - cy; return x * x + y * y;
}

function updateShots(g) {
  for (const s of g.shots) {
    const ax = s.x, ay = s.y;
    s.x += s.vx * DT; s.y += s.vy * DT;
    if (s.y < -10 || s.x < -10 || s.x > W + 10) { s.dead = true; continue; }
    // 空中 → 地上の順で、通過した区間全体で判定（高速弾のすり抜け防止）。1 発は 1 回だけ当たる
    for (const e of g.enemies) {
      if (e.dead || e.y < -8) continue;
      const rr = e.r + s.r;
      if (segDist2(ax, ay, s.x, s.y, e.x, e.y) <= rr * rr) { s.dead = true; hitAir(g, e); break; }
    }
    if (s.dead) continue;
    for (const o of g.ground.values()) {
      if (o.dead || o.y < -6 || o.y > H + 6) continue;
      const rr = o.r + s.r;
      if (segDist2(ax, ay, s.x, s.y, o.x, o.y) <= rr * rr) { s.dead = true; hitGround(g, o); break; }
    }
  }
}

function hitAir(g, e) {
  e.hp--; e.flash = 6;
  if (e.hp > 0) { ev(g, 'hit', { x: e.x, y: e.y, air: true, id: e.id }); return; }
  e.dead = true; g.stats.kills++;
  const pts = SCORE[AIR[e.type].score];
  addScore(g, pts, e.x, e.y);
  ev(g, 'kill', { x: e.x, y: e.y, type: e.type, big: e.r >= 11, r: e.r, vx: e.x - e.px, vy: e.y - e.py });
  if (e.mv === 'twin') onTwinHalfDown(g, e);
}

function hitGround(g, o) {
  if (o.type === 'sigil' && o.hidden) {
    o.hp--; ev(g, 'sigilPing', { x: o.x, y: o.y });
    if (o.hp <= 0) {
      o.hidden = false; o.revealed = true; o.dead = true; g.groundDone.add(o.gid); g.stats.sigils++;
      addScore(g, SCORE.sigil, o.x, o.y, 'SIGIL');
      ev(g, 'sigil', { x: o.x, y: o.y, wy: o.wy });
    }
    return;
  }
  o.hp--; o.flash = 6;
  if (o.type === 'core') g.coreHp = o.hp; // 撃ち逃して巻き戻しても与えた損傷は残す
  if (o.hp > 0) { ev(g, 'hit', { x: o.x, y: o.y, air: false }); return; }
  o.dead = true; g.groundDone.add(o.gid); g.stats.kills++;
  ev(g, 'kill', { x: o.x, y: o.y, type: o.type, ground: true, big: o.type === 'core' || o.type === 'bunker', r: o.r, wy: o.wy });
  if (o.type === 'core') {
    addScore(g, SCORE.core * (g.area + 1), o.x, o.y, 'CORE');
    if (g.deathsThisArea === 0) addScore(g, SCORE.noMissArea, o.x, o.y + 16, 'NO MISS');
    g.coreBroken = true; g.phase = 'clear'; g.phaseT = 0;
    for (const e of g.enemies) e.leave = true;
    g.bullets.length = 0;
    ev(g, 'areaClear', { area: g.area });
    return;
  }
  if (o.type === 'panel') { onPanel(g, o); return; }
  addScore(g, SCORE[GROUND[o.type].score], o.x, o.y);
  if (o.type === 'dock') {
    g.partner = { x: o.x, y: o.y, px: o.x, py: o.y, t: 0, rise: 1 };
    ev(g, 'partnerFree', { x: o.x, y: o.y });
  }
}

function onPanel(g, o) {
  const c = g.chains[o.chainId] || (g.chains[o.chainId] = { count: 0, last: -9999, state: 'idle' });
  addScore(g, SCORE.panel, o.x, o.y);
  if (c.state === 'broken' || c.state === 'done') return;
  if (c.count > 0 && g.tick - c.last > T.chain.gapTicks) { breakChain(g, o.chainId, o.x, o.y, 'time'); return; }
  c.count++; c.last = g.tick; c.state = 'run';
  ev(g, 'chainStep', { n: c.count, x: o.x, y: o.y });
  if (c.count >= 8) {
    c.state = 'done'; g.stats.chainsFull++;
    addScore(g, SCORE.chain[8], o.x, o.y - 14, 'LATTICE');
    ev(g, 'chainBonus', { x: o.x, y: o.y, pts: SCORE.chain[8] });
  }
}
function breakChain(g, id, x, y, why) {
  const c = g.chains[id] || (g.chains[id] = { count: 0, last: 0, state: 'idle' });
  if (c.state === 'broken' || c.state === 'done') return;
  const part = SCORE.chain[Math.min(8, c.count)] || 0;
  c.state = 'broken';
  if (part) addScore(g, part, x, y - 12, 'CHAIN ' + c.count);
  ev(g, 'chainFail', { n: c.count, x, y, why });
}

function inPlay(y) { return y > 6 && y < H * 0.78; }

function enemyFire(g, x, y, ang, speed) {
  if (g.calm > 0 || !g.player.alive || g.phase !== 'play') return false;
  const p = g.player;
  if (Math.hypot(p.x - x, p.y - y) < T.safety.noFireNearPlayer) return false;
  const D = difficulty(g);
  const v = Math.min(T.loop.bulletCap, speed * D.spd);
  g.bullets.push({ x, y, px: x, py: y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: 2.4, dead: false, born: g.tick });
  g.lastEshot = { x, y, tick: g.tick };
  return true;
}
function aimAt(g, x, y) { const p = g.player; return Math.atan2(p.y - y, p.x - x); }

function updateGround(g) {
  const D = difficulty(g);
  // 盤面に入る直前に実体化、出たら消す（壊したものは groundDone で二度と出さない）
  for (const d of g.def.ground) {
    const y = g.scroll - d.wy;
    if (y < -40 || y > H + 50) {
      const o = g.ground.get(d.gid);
      if (o) {
        if (o.type === 'panel' && !o.dead && y > H) breakChain(g, o.chainId, o.x, H - 10, 'miss');
        if (o.type === 'core' && !o.dead && y > H) { coreMissed(g); return; }
        g.ground.delete(d.gid);
      }
      continue;
    }
    if (g.groundDone.has(d.gid)) continue;
    let o = g.ground.get(d.gid);
    if (!o) {
      const gd = GROUND[d.type];
      const hp = d.type === 'core' ? (g.coreHp ?? (gd.hp + Math.min(24, g.loop * 8))) : gd.hp;
      o = { ...d, x: d.x, y, px: d.x, py: y, hp, hp0: d.type === 'core' ? gd.hp + Math.min(24, g.loop * 8) : gd.hp, r: gd.r, dead: false, flash: 0, fireT: 0 };
      g.ground.set(d.gid, o);
    }
    o.y = y; if (o.flash > 0) o.flash--;
    if (o.dead) continue;
    o.fireT++;
    if (o.type === 'turret' && o.fireT > 110 * D.fire && inPlay(o.y)) { o.fireT = 0; if (enemyFire(g, o.x, o.y, aimAt(g, o.x, o.y), 84)) ev(g, 'eshot'); }
    if (o.type === 'bunker' && o.fireT > 150 * D.fire && inPlay(o.y)) {
      o.fireT = 0; const a = aimAt(g, o.x, o.y);
      for (const da of [-0.28, 0, 0.28]) enemyFire(g, o.x, o.y, a + da, 78);
      ev(g, 'eshot');
    }
    if (o.type === 'core' && o.fireT > 96 * D.fire && o.y > 20 && o.y < H * 0.7) {
      o.fireT = 0;
      const base = g.tick * 0.07;
      for (let k = 0; k < 8; k++) enemyFire(g, o.x, o.y, base + (k * Math.PI) / 4, 62);
      ev(g, 'eshot');
    }
  }
  for (const o of g.ground.values()) if (o.dead) g.ground.delete(o.gid);
}

function coreMissed(g) {
  // エリアコアを撃ち逃した → 少し巻き戻して大陸の手前から再接近（進行不能にしない）
  g.scroll = g.def.coreWy - 300;
  g.ground.clear();
  g.waveIdx = g.def.waves.findIndex((w) => w.at > g.scroll); if (g.waveIdx < 0) g.waveIdx = g.def.waves.length;
  g.bullets.length = 0; g.calm = 60;
  for (const e of g.enemies) e.leave = true;
  ev(g, 'coreMiss');
}

function steer(e, tx, ty, maxV, acc) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
  const want = Math.min(maxV, d * 3);
  const wx = (dx / d) * want, wy = (dy / d) * want;
  const ax = wx - e.vx, ay = wy - e.vy, am = Math.hypot(ax, ay), lim = acc * DT;
  if (am > lim) { e.vx += (ax / am) * lim; e.vy += (ay / am) * lim; } else { e.vx = wx; e.vy = wy; }
}

function updateEnemies(g) {
  const D = difficulty(g), sp = D.spd, p = g.player;
  for (const e of g.enemies) {
    e.t++; if (e.flash > 0) e.flash--;
    if (e.leave && e.mv !== 'twin') { e.vy = Math.min(e.vy - 4, -60); e.y += e.vy * DT; e.x += e.vx * DT; }
    else switch (e.mv) {
      case 'straight':
        e.y += e.vy * sp * DT; e.x += e.drift * DT;
        if (e.t === 50 && rand(g) < 0.35) enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 88);
        break;
      case 'sine':
        e.y += e.vy * sp * DT; e.x = e.x0 + Math.sin(e.t * 0.05 * sp + e.ph) * e.amp;
        if (e.t === 70 && rand(g) < 0.4) enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 86);
        break;
      case 'line':
        e.x += e.vx * sp * DT; e.y += e.vy * sp * DT;
        if (e.t === 36) enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 90);
        break;
      case 'hold':
        if (e.t < e.hold) {
          steer(e, e.x, e.ty, 70 * sp, 90);
          e.fireT++;
          if (e.y > 30 && e.fireT > e.fireEvery * D.fire) { e.fireT = 0; if (enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 96)) ev(g, 'eshot'); }
        } else { steer(e, e.x < 120 ? -40 : W + 40, e.ty - 20, 90 * sp, 70); }
        e.x += e.vx * DT; e.y += e.vy * DT;
        break;
      case 'orbit': {
        const enter = 40;
        e.ang = e.a0 + e.dir * Math.max(0, e.t - enter) * 0.026 * sp;
        const tx = e.cx + Math.cos(e.ang) * e.R, ty = e.cy + Math.sin(e.ang) * e.R * 0.8;
        if (e.t < enter) { const k = e.t / enter; e.x += (tx - e.x) * k * 0.3; e.y += (ty - e.y) * k * 0.3; }
        else if (e.t < enter + 300) { e.x = tx; e.y = ty; if ((e.t - enter) % 120 === 60) enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 82); }
        else { e.vy = Math.min(140, (e.vy || 0) + 3); e.y += e.vy * DT; }
        break;
      }
      case 'dive':
        if (e.t < e.tele) { e.y += (e.ty - e.y) * 0.08; e.telegraph = true; }
        else {
          if (e.t === e.tele) { e.telegraph = false; e.tx = p.x; ev(g, 'dive', { x: e.x, y: e.y }); }
          steer(e, e.tx, H + 60, 175 * sp, 230);
          e.x += e.vx * DT; e.y += e.vy * DT;
          if (e.t === e.tele + 18) enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 92);
        }
        break;
      case 'lancer':
        e.y += (e.ty - e.y) * 0.03; e.x = e.x0 + Math.sin(e.t * 0.018) * 34;
        e.fireT++;
        if (e.t > 40 && e.fireT > e.fireEvery * D.fire) {
          e.fireT = 0; const a = aimAt(g, e.x, e.y);
          for (const da of [-0.22, 0, 0.22]) enemyFire(g, e.x, e.y + 8, a + da, 90);
          ev(g, 'eshot');
        }
        if (e.t > 420) e.leave = true;
        break;
      case 'twin': {
        const tw = g.twins[e.key]; const k = Math.min(1, e.t / T.twin.mergeTicks);
        const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        e.x = e.x0 + (120 + e.side * 11 - e.x0) * ease;
        e.y = 70 + Math.sin(k * Math.PI) * 26;
        e.mergeK = k;
        if (e.t % 90 === 45) enemyFire(g, e.x, e.y, aimAt(g, e.x, e.y), 80);
        if (k >= 1 && tw && !tw.merged) mergeTwin(g, e.key);
        break;
      }
      case 'merged':
        e.y += 16 * DT; e.x = 120 + Math.sin(e.t * 0.02) * 50;
        e.fireT++;
        if (e.fireT > 80 * D.fire) { e.fireT = 0; for (let k2 = 0; k2 < 6; k2++) enemyFire(g, e.x, e.y, e.t * 0.05 + (k2 * Math.PI) / 3, 70); ev(g, 'eshot'); }
        if (e.t > 600) e.leave = true;
        break;
    }
    if (e.y > H + 30 || e.y < -60 || e.x < -60 || e.x > W + 60) e.dead = true;
  }
}

function onTwinHalfDown(g, e) {
  const tw = g.twins[e.key]; if (!tw || tw.resolved) return;
  const other = g.enemies.find((o) => o.mv === 'twin' && o.key === e.key && !o.dead && o !== e);
  if (!other) {
    tw.resolved = true; g.stats.twinBreaks++;
    addScore(g, SCORE.twinBreak, 120, 70, 'SPLIT BREAK');
    ev(g, 'twinBreak', { x: e.x, y: e.y, pts: SCORE.twinBreak });
  }
}
function mergeTwin(g, key) {
  const tw = g.twins[key]; if (!tw || tw.merged || tw.resolved) return;
  tw.merged = true; tw.resolved = true;
  const halves = g.enemies.filter((o) => o.mv === 'twin' && o.key === key && !o.dead);
  for (const h of halves) h.dead = true;
  const hp = Math.round(T.twin.mergedHp * (halves.length === 2 ? 1 : 0.5));
  const m = mk(g, 'twinM', 120, 70, { mv: 'merged', hp });
  g.enemies.push(m);
  ev(g, 'twinLocked', { x: 120, y: 70 });
}
function updateTwins() { /* 状態は onTwinHalfDown / mergeTwin で確定する */ }

function updatePartner(g) {
  const q = g.partner; if (!q) return;
  const p = g.player;
  q.t++;
  if (q.t < 40) { q.y -= 30 * DT; }  // 格納庫から浮上
  else if (q.t < T.partner.life) {
    const ty = Math.max(150, Math.min(220, p.y - 40));
    q.x += Math.sign(p.x - q.x) * Math.min(Math.abs(p.x - q.x), T.partner.speed * DT);
    q.y += Math.sign(ty - q.y) * Math.min(Math.abs(ty - q.y), 20 * DT);
  } else { q.y -= 90 * DT; if (q.y < -20) { g.partner = null; ev(g, 'partnerLost'); return; } }
  if (p.alive && q.t > 24 && Math.hypot(p.x - q.x, p.y - q.y) < T.partner.dockR) {
    g.partner = null;
    if (p.docked) { addScore(g, SCORE.partnerExtra, p.x, p.y - 14, 'RELAY+'); }
    else { p.docked = true; addScore(g, SCORE.partnerDock, p.x, p.y - 14, 'RELAY'); }
    p.dockAnim = T.partner.dockTicks; g.stats.docks++;
    ev(g, 'dock', { x: p.x, y: p.y });
  }
}

function updateBullets(g) {
  for (const b of g.bullets) {
    b.x += b.vx * DT; b.y += b.vy * DT;
    if (b.x < -8 || b.x > W + 8 || b.y < -8 || b.y > H + 8) b.dead = true;
  }
}

function collidePlayer(g) {
  const p = g.player;
  if (!p.alive || p.invuln > 0 || p.entering > 0 || g.flags.invincible) return;
  const hr = T.player.hitR;
  for (const b of g.bullets) {
    if (segDist2(b.px, b.py, b.x, b.y, p.x, p.y) <= (hr + b.r) ** 2) { b.dead = true; killPlayer(g); return; }
  }
  for (const e of g.enemies) {
    if (e.dead) continue;
    const rr = e.r * 0.75 + hr + 1.5;
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= rr * rr) { killPlayer(g); hitAir(g, e); return; }
  }
}

function killPlayer(g) {
  const p = g.player;
  if (!p.alive) return; // 同じ tick の追加の接触で残機を二重に減らさない
  p.alive = false; p.deadT = T.deathDelay; p.docked = false;
  g.lives--; g.deathsThisArea++; g.stats.deaths++;
  if (g.partner) { g.partner.t = Math.max(g.partner.t, T.partner.life); }
  ev(g, 'die', { x: p.x, y: p.y, lives: g.lives });
}

function checkArea(g) {
  if (g.phase === 'clear' && g.phaseT > 200) {
    let next = g.area + 1;
    if (next >= AREAS.length) { next = 0; g.loop++; ev(g, 'loop', { loop: g.loop }); }
    g.area = next;
    loadArea(g, next);
    g.player.invuln = Math.max(g.player.invuln, 60);
  }
}

// テスト・デバッグ用（通常記録には使われない: tainted を立てる）
export const debug = {
  skipToCore(g) { g.flags.tainted = true; g.scroll = g.def.coreWy - 330; g.waveIdx = g.def.waves.findIndex((w) => w.at > g.scroll); if (g.waveIdx < 0) g.waveIdx = g.def.waves.length; },
  nextArea(g) { g.flags.tainted = true; g.phase = 'clear'; g.phaseT = 999; checkArea(g); },
};
export { W as FIELD_W, H as FIELD_H };
