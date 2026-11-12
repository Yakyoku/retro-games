// ORBITAL WINGS — ゲームのルール本体（2D 版・3D 版で共通、描画・音・入力から独立）
// 60Hz 固定ステップ・決定的。描画側は tick ごとの前の位置（px,py,pz）と補間して滑らかにする。
// 座標: x はワールド（右へ進む）、y は上が正（0＝盤面の下端、VIEW_H＝上端）、z は奥が正（2D 版は常に 0）。
import { TICK, VIEW_W, VIEW_H, DEPTH, PLAYER, WEAPON, OPTION, SHIELD, SCORE, DIFFICULTY, GAUGE, SPAWN_GRACE, ENEMY_BULLET_SPEED } from './config.js';
import { makeRng } from './rng.js';
import { STAGES } from './stages.js';
import { ENEMY } from './enemies.js';
import { BOSS } from './bosses.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 線分 (ax,ay,az)-(bx,by,bz) と点 c の最短距離の二乗（すり抜け防止の掃引判定）
export function segDist2(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = dx * dx + dy * dy + dz * dz;
  let t = L > 1e-9 ? ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - cx, ey = ay + dy * t - cy, ez = az + dz * t - cz;
  return ex * ex + ey * ey + ez * ez;
}

export class Game {
  constructor(opt = {}) {
    this.variant = opt.variant === '3d' ? '3d' : '2d';
    this.depth = this.variant === '3d';
    this.difficulty = DIFFICULTY[opt.difficulty] ? opt.difficulty : 'normal';
    this.diff = DIFFICULTY[this.difficulty];
    this.mode = opt.mode === 'practice' ? 'practice' : 'main';
    this.autoFire = !!opt.autoFire;
    this.debug = { invincible: !!opt.invincible };
    this.rng = makeRng(opt.seed ?? 12345);
    this.events = [];
    this.score = 0;
    this.lives = opt.lives ?? PLAYER.lives;
    this.tickN = 0;
    this.nextId = 1;
    this.stats = { kills: 0, deaths: 0, capsules: 0, startTick: 0 };
    this.over = false;          // ゲームオーバーまたは全面クリアで true（結果画面へ）
    this.cleared = false;
    this.resetLoadout();
    this.startStage(opt.stage ?? 1, true);
  }

  // ---- 装備 -----------------------------------------------------------------
  resetLoadout() {
    this.power = { sel: -1, speed: 1, missile: false, weapon: 'normal', options: 0, shield: 0 };
  }
  get speed() { return PLAYER.baseSpeed * (1 + PLAYER.speedStep * (this.power.speed - 1)); }

  // カプセル 1 個で選択位置が 1 つ進む（6 項目を循環）
  addCapsule() {
    this.power.sel = (this.power.sel + 1) % GAUGE.length;
    this.stats.capsules++;
    this.score += SCORE.capsule;
    this.emit({ t: 'sfx', n: 'capsule' });
    this.emit({ t: 'gauge', sel: this.power.sel });
  }
  // 取得できるか（理由つき）。取得不能なら消費しない
  canAcquire(i = this.power.sel) {
    const p = this.power;
    if (i < 0) return { ok: false, why: 'カプセルがありません' };
    switch (GAUGE[i]) {
      case 'SPEED': return p.speed >= PLAYER.maxSpeedLv ? { ok: false, why: 'スピードは最大です' } : { ok: true };
      case 'MISSILE': return p.missile ? { ok: false, why: 'ミサイルは装備済み' } : { ok: true };
      case 'DOUBLE': return p.weapon === 'double' ? { ok: false, why: 'ダブルは装備中' } : { ok: true };
      case 'LASER': return p.weapon === 'laser' ? { ok: false, why: 'レーザーは装備中' } : { ok: true };
      case 'OPTION': return p.options >= OPTION.max ? { ok: false, why: 'オプションは 4 機まで' } : { ok: true };
      case 'SHIELD': return p.shield > 0 ? { ok: false, why: 'シールドが残っています' } : { ok: true };
    }
    return { ok: false, why: '?' };
  }
  acquire() {
    const c = this.canAcquire();
    if (!c.ok) { this.emit({ t: 'deny', why: c.why }); this.emit({ t: 'sfx', n: 'deny' }); return false; }
    const p = this.power, name = GAUGE[p.sel];
    switch (name) {
      case 'SPEED': p.speed++; break;
      case 'MISSILE': p.missile = true; break;
      case 'DOUBLE': p.weapon = 'double'; break;
      case 'LASER': p.weapon = 'laser'; break;
      case 'OPTION': {
        // 新しいオプションは最後尾の位置から出す
        p.options++; this.ensureHistory(); break;
      }
      case 'SHIELD': p.shield = SHIELD.durability; this.emit({ t: 'sfx', n: 'shield_on' }); break;
    }
    p.sel = -1;
    this.emit({ t: 'powerup', item: name });
    if (name !== 'SHIELD') this.emit({ t: 'sfx', n: 'powerup' });
    return true;
  }

  // ---- 面の開始・チェックポイント -----------------------------------------
  startStage(n, fresh = false) {
    this.stageNo = n;
    this.stage = STAGES[n - 1];
    this.terrain = this.stage.terrain;
    this.cpIndex = 0;
    this.stageTick = 0;
    this.boss = null;
    this.bossDone = false;
    this.clearTimer = 0;
    this.respawnAt(0, fresh);
    this.emit({ t: 'stage', n });
  }
  checkpointX(i) { return this.stage.checkpoints[i]; }

  respawnAt(cpIndex, fresh) {
    this.cpIndex = cpIndex;
    this.camX = this.checkpointX(cpIndex);
    this.scrollV = this.stage.scroll;
    this.enemies = []; this.ebullets = []; this.shots = []; this.capsules = []; this.groups = new Map();
    this.boss = null; this.bossWarn = 0;
    // その位置より右にある出来事から再開（画面内の出来事は飛ばす＝出現直後の被弾を避ける）
    const ev = this.stage.events;
    let i = 0; while (i < ev.length && ev[i].x <= this.camX + VIEW_W + 1) i++;
    this.evCursor = i;
    const p = this.player = {
      x: this.camX - 2, y: VIEW_H * 0.55, z: 0, px: 0, py: 0, pz: 0,
      vx: 0, vy: 0, vz: 0, alive: true, invuln: PLAYER.respawnInvuln + PLAYER.enterTicks,
      enter: PLAYER.enterTicks, dead: 0, fireCd: 0, missileCd: 0, tilt: 0,
    };
    // 地形に埋まらない高さを探す
    p.y = this.safeY(this.camX + 4, VIEW_H * 0.55);
    p.px = p.x; p.py = p.y; p.pz = p.z;
    this.history = [];
    this.ensureHistory();
    this.state = 'enter';
    if (!fresh) this.emit({ t: 'respawn' });
    this.emit({ t: 'music', id: 'stage' + this.stageNo, restart: true });
  }
  // 安全な復帰（Easy）: スクロールはそのまま。敵弾は消し、近い敵は退かせ、再装備用カプセルを出す
  respawnSafe() {
    this.ebullets = [];
    for (const e of this.enemies) if (!e.boss && !e.anchor && Math.abs(e.x - (this.camX + 4)) < 8 && e.harm) this.kill(e, false);
    const p = this.player;
    Object.assign(p, { x: this.camX - 2, alive: true, invuln: PLAYER.respawnInvuln + PLAYER.enterTicks, enter: PLAYER.enterTicks, dead: 0, vx: 0, vy: 0, vz: 0, z: 0 });
    p.y = this.safeY(this.camX + 4, VIEW_H * 0.55);
    p.px = p.x; p.py = p.y; p.pz = 0;
    this.history = []; this.ensureHistory();
    for (let k = 0; k < 3; k++) this.capsules.push({ id: this.nextId++, x: this.camX + 11 + k * 3.2, y: p.y + (k - 1) * 1.2, z: 0, px: 0, py: 0, pz: 0, t: 0, drift: true });
    this.state = this.boss ? 'boss' : 'enter';
    this.emit({ t: 'respawn' });
  }
  safeY(wx, prefer) {
    let best = prefer, bestScore = -1e9;
    for (let y = 1; y < VIEW_H - 1; y += 0.25) {
      let clear = Infinity;
      for (let dx = -2; dx <= 6; dx += 0.5) {
        const f = this.floorAt(wx + dx), c = this.ceilAt(wx + dx);
        clear = Math.min(clear, y - f, c - y);
        for (const b of this.blocksNear(wx + dx)) if (wx + dx >= b.x0 && wx + dx <= b.x1) clear = Math.min(clear, Math.max(b.y0 - y, y - b.y1));
      }
      const s = clear - Math.abs(y - prefer) * 0.05;
      if (s > bestScore) { bestScore = s; best = y; }
    }
    return best;
  }

  // ---- 地形 -------------------------------------------------------------
  floorAt(x) { return this.terrain.floorAt(x, this.stageTick); }
  ceilAt(x) { return this.terrain.ceilAt(x, this.stageTick); }
  blocksNear(x) { return this.terrain.blocksNear(x); }
  solidAt(x, y, r = 0, z = 0) {
    if (y - r < this.floorAt(x) || y + r > this.ceilAt(x)) return true;
    for (const b of this.blocksNear(x)) {
      if (b.z0 !== undefined && (z < b.z0 - r || z > b.z1 + r)) continue;
      if (x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1) return true;
    }
    return false;
  }

  // ---- 共通 -------------------------------------------------------------
  emit(ev) { this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  onScreen(x, y, m = 0) { return x > this.camX - m && x < this.camX + VIEW_W + m && y > -m && y < VIEW_H + m; }

  spawn(type, props = {}) {
    const def = ENEMY[type] || BOSS[type];
    if (!def) throw new Error('unknown enemy ' + type);
    const e = {
      id: this.nextId++, type, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.6, hp: 1, maxHp: 1,
      score: SCORE.small, t: 0, dead: false, harm: true, armor: false, group: null, carrier: false,
      anchor: null, ang: Math.PI, flash: 0, fireT: 0, ...def.base, ...props,
    };
    e.px = e.x; e.py = e.y; e.pz = e.z;
    e.maxHp = e.hp;
    if (def.init) def.init(e, this);
    e.px = e.x; e.py = e.y; e.pz = e.z;
    this.enemies.push(e);
    if (e.group != null) {
      let g = this.groups.get(e.group);
      if (!g) { g = { total: 0, killed: 0, lost: 0, lx: 0, ly: 0, lz: 0 }; this.groups.set(e.group, g); }
      g.total++;
    }
    return e;
  }

  // 敵の弾。ang 省略で自機を狙う。速さは難易度で変わる
  fire(e, o = {}) {
    if (e.t < SPAWN_GRACE || !this.player.alive || this.player.enter > 0) return false;
    const ox = o.x ?? e.x, oy = o.y ?? e.y, oz = o.z ?? e.z;
    if (!this.onScreen(ox, oy, -0.3)) return false;
    const p = this.player;
    const dx = p.x - ox, dy = p.y - oy, dz = (p.z - oz);
    const dist = Math.hypot(dx, dy, dz);
    if (dist < (o.minDist ?? 3.2) && !o.force) return false;  // 至近距離では撃たない（避けようのない弾を出さない）
    const sp = (o.speed ?? ENEMY_BULLET_SPEED) * this.diff.bulletSpeed * TICK;
    const list = o.spread ?? [0];
    for (const a of list) {
      let vx, vy, vz;
      if (o.ang !== undefined) {
        vx = Math.cos(o.ang + a) * sp; vy = Math.sin(o.ang + a) * sp; vz = 0;
        if (this.depth && o.aimZ !== false) vz = clamp(dz / Math.max(dist, 1), -0.6, 0.6) * sp;
      } else {
        const c = Math.cos(a), s = Math.sin(a);
        const nx = dx / dist, ny = dy / dist;
        vx = (nx * c - ny * s) * sp; vy = (nx * s + ny * c) * sp; vz = this.depth ? (dz / dist) * sp : 0;
      }
      this.ebullets.push({ id: this.nextId++, kind: o.kind ?? 'b', x: ox, y: oy, z: oz, px: ox, py: oy, pz: oz, vx, vy, vz,
        r: o.r ?? 0.24, hp: o.hp ?? 0, t: 0, life: o.life ?? 600, grow: o.grow ?? 0, terrain: o.terrain !== false });
    }
    if (o.sfx) this.emit({ t: 'sfx', n: o.sfx });
    e.lastFire = this.tickN;
    return true;
  }
  fireInterval(n) { return Math.round(n * this.diff.fireInterval); }

  // 撃破（多重加点を防ぐ: dead を見て 1 回だけ）
  kill(e, byPlayer = true) {
    if (e.dead) return;
    e.dead = true;
    const def = ENEMY[e.type] || BOSS[e.type];
    if (byPlayer) { this.score += e.score; this.stats.kills++; }
    this.emit({ t: 'explode', x: e.x, y: e.y, z: e.z, size: e.boom ?? (e.r > 1.2 ? 'm' : 's'), kind: e.type, color: e.color });
    this.emit({ t: 'sfx', n: e.r > 1.2 ? 'explode_m' : 'explode_s' });
    if (def && def.onDeath) def.onDeath(e, this, byPlayer);
    if (e.carrier && byPlayer) this.dropCapsule(e.x, e.y, e.z);
    if (e.group != null) {
      const g = this.groups.get(e.group);
      if (g) {
        if (byPlayer) { g.killed++; g.lx = e.x; g.ly = e.y; g.lz = e.z; } else g.lost++;
        if (g.killed + g.lost === g.total && g.lost === 0 && !g.done) { g.done = true; this.dropCapsule(g.lx, g.ly, g.lz); }
      }
    }
  }
  // 画面外へ逃げた（編隊ボーナスを失う・得点なし）
  escape(e) {
    if (e.dead) return;
    e.dead = true; e.escaped = true;
    if (e.group != null) { const g = this.groups.get(e.group); if (g) g.lost++; }
  }
  dropCapsule(x, y, z) {
    y = clamp(y, 1, VIEW_H - 1);
    this.capsules.push({ id: this.nextId++, x, y, z: this.depth ? z : 0, px: x, py: y, pz: z, t: 0 });
  }

  damage(e, dmg, part, hx, hy, hz) {
    if (e.dead) return;
    const def = ENEMY[e.type] || BOSS[e.type];
    if (def && def.onHit) { def.onHit(e, this, dmg, part, hx, hy, hz); return; }
    if (e.armor || (e.vuln && !e.vuln(e, this))) { this.emit({ t: 'spark', x: hx, y: hy, z: hz, armor: true }); return; }
    e.hp -= dmg; e.flash = 1;
    if (e.hp <= 0) this.kill(e, true);
    else this.emit({ t: 'sfx', n: 'enemy_hit' });
  }

  // 敵の当たり形。既定は球 1 個。ボスなどは def.hitboxes で部位ごとに返す
  // 各要素: [x, y, z, r, part, flags]  flags: 1=弾を止める（装甲）, 2=自機に触れると被弾
  hitboxes(e) {
    const def = ENEMY[e.type] || BOSS[e.type];
    if (def && def.hitboxes) return def.hitboxes(e, this);
    return [[e.x, e.y, e.z, e.r, 0, (e.harm ? 2 : 0) | 1]];
  }

  // ---- オプション（自機の移動履歴を tick 単位で追う。描画 FPS と無関係） ----
  ensureHistory() {
    const p = this.player, need = OPTION.spacing * OPTION.max + 2;
    const sx = p.x - this.camX;
    while (this.history.length < need) this.history.push([sx, p.y, p.z]);
  }
  optionPos(i) {
    const h = this.history[Math.min(this.history.length - 1, (i + 1) * OPTION.spacing)];
    return { x: h[0] + this.camX, y: h[1], z: h[2] };
  }

  // ---- 1 tick 進める --------------------------------------------------------
  // input: { mx, my, mz (-1..1), fire (押している), power (押した瞬間) }
  tick(input = {}) {
    if (this.over) return;
    this.tickN++;
    this.stageTick++;
    const p = this.player;
    // 前の位置（描画の補間用）
    p.px = p.x; p.py = p.y; p.pz = p.z;
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; e.pz = e.z; if (e.parts) for (const q of e.parts) { q.px = q.x; q.py = q.y; q.pz = q.z; } }
    for (const b of this.ebullets) { b.px = b.x; b.py = b.y; b.pz = b.z; }
    for (const s of this.shots) { s.px = s.x; s.py = s.y; s.pz = s.z; }
    for (const c of this.capsules) { c.px = c.x; c.py = c.y; c.pz = c.z; }
    this.prevOpt = [];
    for (let i = 0; i < this.power.options; i++) this.prevOpt.push(this.optionPos(i));

    this.updateScroll();
    this.updatePlayer(input);
    this.spawnEvents();
    this.updateEnemies();
    this.updateShots();
    this.updateBullets();
    this.updateCapsules();
    this.collide();
    this.updateFlow();
  }

  updateScroll() {
    const st = this.stage;
    if (this.state === 'clear' || this.state === 'stageclear') return;
    // スクロール速度は区間ごとに変えられる（stage.scrollAt）
    let v = st.scrollAt ? st.scrollAt(this.camX) : st.scroll;
    if (this.camX >= st.length) v = 0;
    this.scrollV = v;
    const d = v * TICK;
    this.camX = Math.min(this.camX + d, Math.max(this.camX, st.length));
    this.scrollD = d;
    // チェックポイントの通過
    const cps = st.checkpoints;
    while (this.cpIndex + 1 < cps.length && this.camX >= cps[this.cpIndex + 1]) { this.cpIndex++; this.emit({ t: 'checkpoint', i: this.cpIndex }); }
    // ボスの出現
    if (!this.boss && !this.bossDone && this.camX >= st.length) {
      if (this.bossWarn === 0) { this.bossWarn = 1; this.emit({ t: 'sfx', n: 'warning' }); this.emit({ t: 'music', id: null }); this.emit({ t: 'bosswarn', name: BOSS[st.boss].name }); }
      this.bossWarn++;
      if (this.bossWarn > 120) {
        this.boss = this.spawn(st.boss, { x: this.camX + VIEW_W + 6, y: VIEW_H / 2, boss: true });
        this.state = this.state === 'dead' ? 'dead' : 'boss';
        this.emit({ t: 'music', id: this.stageNo === 7 ? 'final' : 'boss' });
      }
    }
  }

  updatePlayer(input) {
    const p = this.player, pw = this.power;
    p.x += this.scrollD || 0;   // 画面と一緒に進む
    if (p.invuln > 0) p.invuln--;
    if (!p.alive) {
      p.dead++;
      if (p.dead >= PLAYER.deathTicks) {
        if (this.lives <= 0) { this.state = 'gameover'; this.over = true; this.emit({ t: 'gameover' }); this.emit({ t: 'music', id: 'gameover' }); return; }
        if (this.diff.respawn === 'safe') this.respawnSafe();
        else this.respawnAt(this.cpIndex, false);
      }
      return;
    }
    if (this.state === 'stageclear') { p.x += 0.35 * (this.clearTimer > 120 ? 1 : 0); return; }
    let mx = clamp(input.mx || 0, -1, 1), my = clamp(input.my || 0, -1, 1), mz = this.depth ? clamp(input.mz || 0, -1, 1) : 0;
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    if (p.enter > 0) {
      // 左の外から減速しながら滑り込む（操作は入場後）
      p.enter--;
      const k = 1 - p.enter / PLAYER.enterTicks;
      const target = this.camX + 4;
      p.x = (this.camX - 2) + (target - (this.camX - 2)) * (1 - (1 - k) * (1 - k));
      if (p.enter === 0 && this.state === 'enter') this.state = this.boss ? 'boss' : 'play';
      mx = 0; my = 0; mz = 0;
    }
    const sp = this.speed * TICK;
    const ox = p.x, oy = p.y, oz = p.z;
    p.x += mx * sp; p.y += my * sp; p.z += mz * sp * PLAYER.depthSpeedRatio;
    p.x = clamp(p.x, this.camX + 0.9, this.camX + VIEW_W - 1.3);
    p.y = clamp(p.y, 0.5, VIEW_H - 0.6);
    p.z = clamp(p.z, -DEPTH, DEPTH);
    p.vx = mx; p.vy = my; p.vz = mz;
    // 動いた tick だけ履歴に積む（止まっているとオプションも止まる）
    const moved = Math.abs(p.x - ox - (0)) > 1e-6 || Math.abs(p.y - oy) > 1e-6 || Math.abs(p.z - oz) > 1e-6;
    if (moved && p.enter === 0) {
      this.history.unshift([p.x - this.camX, p.y, p.z]);
      if (this.history.length > OPTION.spacing * OPTION.max + 2) this.history.pop();
    }
    // 射撃（押し続けで発射。オート射撃は設定）
    const fire = this.autoFire ? true : !!input.fire;
    if (p.fireCd > 0) p.fireCd--;
    if (p.missileCd > 0) p.missileCd--;
    if (fire && this.state !== 'clear' && this.state !== 'stageclear') {
      if (p.fireCd <= 0) this.fireVolley();
      if (pw.missile && p.missileCd <= 0) this.fireMissiles();
    }
    if (input.power) this.acquire();
  }

  shooters() {
    const p = this.player, list = [{ x: p.x + 0.9, y: p.y, z: p.z, owner: 0 }];
    for (let i = 0; i < this.power.options; i++) { const o = this.optionPos(i); list.push({ x: o.x + 0.4, y: o.y, z: o.z, owner: i + 1 }); }
    return list;
  }
  countShots(owner, kind) { let n = 0; for (const s of this.shots) if (s.owner === owner && s.kind === kind) n++; return n; }

  fireVolley() {
    const p = this.player, w = this.power.weapon;
    let fired = false;
    for (const s of this.shooters()) {
      if (w === 'laser') {
        if (this.countShots(s.owner, 'laser') >= WEAPON.laserMaxPerShooter) continue;
        this.shots.push({ id: this.nextId++, kind: 'laser', owner: s.owner, x: s.x, y: s.y, z: s.z, px: s.x, py: s.y, pz: s.z,
          vx: WEAPON.laserSpeed * TICK, vy: 0, len: 0.4, hits: new Map(), t: 0 });
        fired = true;
      } else {
        if (this.countShots(s.owner, 'shot') >= WEAPON.shotMaxPerShooter) continue;
        const v = WEAPON.shotSpeed * TICK;
        this.shots.push({ id: this.nextId++, kind: 'shot', owner: s.owner, x: s.x, y: s.y, z: s.z, px: s.x, py: s.y, pz: s.z, vx: v, vy: 0, t: 0 });
        if (w === 'double') {
          const a = WEAPON.doubleAngle;
          this.shots.push({ id: this.nextId++, kind: 'shot', diag: true, owner: s.owner, x: s.x - 0.2, y: s.y + 0.2, z: s.z, px: s.x, py: s.y, pz: s.z,
            vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0 });
        }
        fired = true;
      }
    }
    if (fired) {
      p.fireCd = w === 'laser' ? WEAPON.laserInterval : WEAPON.shotInterval;
      // 効果音は 1 斉射に 1 回（オプションの数だけ重ねない）
      this.emit({ t: 'sfx', n: w === 'laser' ? 'laser' : w === 'double' ? 'double' : 'shot' });
      this.emit({ t: 'fire', w });
    }
  }
  fireMissiles() {
    let fired = false;
    for (const s of this.shooters()) {
      if (this.countShots(s.owner, 'missile') >= 1) continue;
      this.shots.push({ id: this.nextId++, kind: 'missile', owner: s.owner, x: s.x - 0.3, y: s.y - 0.3, z: s.z, px: s.x, py: s.y, pz: s.z,
        vx: WEAPON.missileSpeed * 0.55 * TICK, vy: -WEAPON.missileSpeed * 0.85 * TICK, ground: false, t: 0 });
      fired = true;
    }
    if (fired) { this.player.missileCd = WEAPON.missileInterval; this.emit({ t: 'sfx', n: 'missile' }); }
  }

  spawnEvents() {
    const ev = this.stage.events;
    const edge = this.camX + VIEW_W + 1;
    while (this.evCursor < ev.length && ev[this.evCursor].x <= edge) {
      const e = ev[this.evCursor++];
      e.run(this, e);
    }
  }

  updateEnemies() {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t++;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - 0.12);
      const def = ENEMY[e.type] || BOSS[e.type];
      def.update(e, this);
      if (!e.dead && !e.boss && !e.keep) {
        // 画面の左外へ出たら逃げた扱い。右・上下の遠くへ出ても同じ
        if (e.x < this.camX - 4 - (e.r || 0) || e.y < -8 || e.y > VIEW_H + 8 || e.x > this.camX + VIEW_W + 40) this.escape(e);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead || (e.linger && e.linger-- > 0));
  }

  updateShots() {
    const keep = [];
    for (const s of this.shots) {
      s.t++;
      if (s.kind === 'laser') {
        // 発射元に付いたまま伸び、その後は離れて進む
        s.len = Math.min(WEAPON.laserLength, s.len + WEAPON.laserSpeed * TICK);
        s.x += s.vx; s.x += this.scrollD || 0;
        if (s.t < 4) { const src = s.owner === 0 ? this.player : this.optionPos(s.owner - 1); s.y = src.y; s.z = src.z; }
      } else if (s.kind === 'missile') {
        this.moveMissile(s);
      } else {
        s.x += s.vx + (this.scrollD || 0); s.y += s.vy;
      }
      if (s.dead) continue;
      if (s.x > this.camX + VIEW_W + 2 + (s.len || 0) || s.y > VIEW_H + 1 || s.y < -2 || s.t > 240) continue;
      // 地形に当たると消える（レーザーは先端が当たったら止まる）
      if (s.kind !== 'missile' && this.solidAt(s.x, s.y, 0.05, s.z)) { this.emit({ t: 'spark', x: s.x, y: s.y, z: s.z }); continue; }
      keep.push(s);
    }
    this.shots = keep;
  }
  moveMissile(s) {
    const sp = WEAPON.missileSpeed * TICK;
    if (!s.ground) {
      s.x += s.vx + (this.scrollD || 0); s.y += s.vy;
      const f = this.floorAt(s.x);
      if (s.y <= f + 0.3 && f > -1) { s.ground = true; s.y = f + 0.3; }
      // ブロックに当たったら爆発
      if (this.blockHit(s.x, s.y, s.z)) return this.missileBoom(s);
    } else {
      const nx = s.x + sp + (this.scrollD || 0);
      const nf = this.floorAt(nx);
      // 段差が大きい（壁）なら爆発。下り坂は沿って降りる。足場が無くなったら落ちる
      if (nf - (s.y - 0.3) > 0.55) return this.missileBoom(s);
      s.x = nx;
      if (nf < s.y - 0.3 - 0.6) { s.ground = false; s.vx = sp * 0.5; s.vy = -sp; }
      else s.y = nf + 0.3;
      if (this.blockHit(s.x, s.y, s.z)) return this.missileBoom(s);
    }
    if (s.y < -1) s.dead = true;
  }
  blockHit(x, y, z) {
    for (const b of this.blocksNear(x)) {
      if (b.z0 !== undefined && (z < b.z0 || z > b.z1)) continue;
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
    }
    return false;
  }
  missileBoom(s) { s.dead = true; this.emit({ t: 'spark', x: s.x, y: s.y, z: s.z, big: true }); }

  updateBullets() {
    const keep = [];
    for (const b of this.ebullets) {
      b.t++;
      if (b.kind === 'homing' && b.t < 100 && this.player.alive) {
        // 誘導弾: 1 tick に曲がれる角度に上限（避けられる速さ）
        const p = this.player, sp = Math.hypot(b.vx, b.vy, b.vz);
        const want = Math.atan2(p.y - b.y, p.x - b.x), cur = Math.atan2(b.vy, b.vx);
        let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const a = cur + clamp(d, -0.035, 0.035);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        if (this.depth) b.vz += clamp((p.z - b.z) * 0.002, -0.002, 0.002);
      }
      b.x += b.vx; b.y += b.vy; b.z += b.vz;
      if (b.grow) b.r = Math.min(b.grow, b.r + 0.02);
      if (this.depth) b.z = clamp(b.z, -DEPTH - 0.5, DEPTH + 0.5);
      if (b.dead || b.t > b.life) continue;
      if (!this.onScreen(b.x, b.y, 1.5)) continue;
      if (b.terrain && b.t > 2 && this.solidAt(b.x, b.y, 0, b.z)) continue;
      keep.push(b);
    }
    this.ebullets = keep;
  }

  updateCapsules() {
    const p = this.player;
    const keep = [];
    for (const c of this.capsules) {
      c.t++;
      if (c.drift) c.x += (this.scrollD || 0) * 0.6;
      // 近づくと吸い寄せる（取りこぼしを減らす）
      if (p.alive) {
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz);
        if (d < 2.2) { const k = (2.2 - d) * 0.06; c.x += dx * k; c.y += dy * k; c.z += dz * k; }
        if (d < 0.95) { this.addCapsule(); continue; }
      }
      if (c.x < this.camX - 2) continue;
      keep.push(c);
    }
    this.capsules = keep;
  }

  // ---- 当たり判定 -----------------------------------------------------------
  collide() {
    // 1) 自機の弾 → 敵
    const boxes = [];
    for (const e of this.enemies) if (!e.dead && !e.ghost) for (const h of this.hitboxes(e)) boxes.push([e, h]);
    for (const s of this.shots) {
      if (s.dead) continue;
      for (const [e, h] of boxes) {
        if (e.dead) continue;
        const [hx, hy, hz, hr, part, flags] = h;
        if (s.kind === 'laser') {
          // レーザー: 線分。同じ敵には laserHitInterval tick ごとにだけダメージ
          const d2 = segDist2(s.x - s.len, s.y, s.z, s.x, s.y, s.z, hx, hy, hz);
          if (d2 > (hr + 0.22) ** 2) continue;
          const key = e.id * 16 + (part | 0);
          const last = s.hits.get(key);
          if (last !== undefined && this.tickN - last < WEAPON.laserHitInterval) { if (flags & 1 && (e.armor || e.boss)) {} continue; }
          s.hits.set(key, this.tickN);
          this.damage(e, WEAPON.laserDamage, part, hx, hy, hz);
          // 装甲・大型の部位では止まる（貫通しない）
          if ((flags & 1) && (e.armor || e.r >= 1.2 || e.boss || e.solid)) { s.x = hx - hr; s.len = Math.min(s.len, Math.max(0.2, s.len)); s.dead = true; this.emit({ t: 'spark', x: hx - hr, y: s.y, z: s.z }); break; }
        } else {
          const r = hr + (s.kind === 'missile' ? 0.3 : 0.18);
          const d2 = segDist2(s.px, s.py, s.pz, s.x, s.y, s.z, hx, hy, hz);
          if (d2 > r * r) continue;
          this.damage(e, s.kind === 'missile' ? WEAPON.missileDamage : WEAPON.shotDamage, part, hx, hy, hz);
          s.dead = true;
          if (s.kind === 'missile') this.emit({ t: 'spark', x: s.x, y: s.y, z: s.z, big: true });
          break;
        }
      }
    }
    // 自機の弾 → 壊せる敵弾（石像のリングなど）
    for (const s of this.shots) {
      if (s.dead) continue;
      for (const b of this.ebullets) {
        if (b.dead || !b.hp) continue;
        const d2 = s.kind === 'laser' ? segDist2(s.x - s.len, s.y, s.z, s.x, s.y, s.z, b.x, b.y, b.z) : segDist2(s.px, s.py, s.pz, s.x, s.y, s.z, b.x, b.y, b.z);
        if (d2 > (b.r + 0.2) ** 2) continue;
        b.hp--; if (b.hp <= 0) { b.dead = true; this.score += SCORE.tiny; this.emit({ t: 'spark', x: b.x, y: b.y, z: b.z }); }
        if (s.kind !== 'laser') { s.dead = true; break; }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);

    // 2) 自機への被弾（シールド → 本体。1 回の被弾で 1 ミスだけ）
    const p = this.player;
    if (!p.alive) return;
    const vulnerable = p.invuln <= 0 && p.enter <= 0 && !this.debug.invincible && this.state !== 'stageclear';
    const pw = this.power;
    for (const b of this.ebullets) {
      if (b.dead) continue;
      if (pw.shield > 0 && this.shieldBlocks(b.x, b.y, b.z, b.r)) {
        b.dead = true; pw.shield--; this.emit({ t: 'shieldhit', left: pw.shield }); this.emit({ t: 'sfx', n: 'shield_hit' });
        continue;
      }
      const r = PLAYER.radius + b.r;
      let tx = b.px, ty = b.py, tz = b.pz;
      if (b.len) { const v = Math.hypot(b.vx, b.vy, b.vz) || 1; tx = b.x - b.vx / v * b.len; ty = b.y - b.vy / v * b.len; tz = b.z - b.vz / v * b.len; }
      if (segDist2(tx, ty, tz, b.x, b.y, b.z, p.x, p.y, p.z) < r * r && vulnerable) { b.dead = true; return this.playerHit('bullet'); }
    }
    for (const [e, h] of boxes) {
      if (e.dead) continue;
      const [hx, hy, hz, hr, part, flags] = h;
      if (!(flags & 2)) continue;
      // シールドは前方からぶつかる敵も耐久分だけ防ぐ（地形・ボス本体・壁は防げない）
      if (pw.shield > 0 && !e.boss && !e.solid && hr < 1.4 && this.shieldBlocks(hx, hy, hz, hr)) {
        if ((e.shieldCd || 0) <= this.tickN) {
          e.shieldCd = this.tickN + 20; pw.shield--; this.emit({ t: 'shieldhit', left: pw.shield }); this.emit({ t: 'sfx', n: 'shield_hit' });
          this.damage(e, 3, part, hx, hy, hz);
        }
        continue;
      }
      const dx = hx - p.x, dy = hy - p.y, dz = hz - p.z, r = hr + PLAYER.radius * 0.9;
      if (dx * dx + dy * dy + dz * dz < r * r && vulnerable) return this.playerHit('enemy');
    }
    if (vulnerable) {
      // 地形（機体の前後の端も見る）
      for (const ox of [-0.55, 0, 0.6]) if (this.solidAt(p.x + ox, p.y, PLAYER.radius * (ox ? 0.55 : 0.9), p.z)) return this.playerHit('terrain');
    }
  }
  shieldBlocks(x, y, z, r) {
    const p = this.player;
    const dx = x - p.x, dy = y - p.y, dz = z - p.z;
    if (dx < SHIELD.frontMin) return false;           // 前方だけ
    const R = SHIELD.radius + r;
    return dx * dx + dy * dy + dz * dz < R * R;
  }
  playerHit(why) {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false; p.dead = 0;
    this.lives--;                  // 1 回の被弾で 1 機だけ減る（alive=false で以後の判定を止める）
    this.stats.deaths++;
    this.emit({ t: 'die', why, x: p.x, y: p.y, z: p.z });
    this.emit({ t: 'sfx', n: 'player_die' });
    this.emit({ t: 'explode', x: p.x, y: p.y, z: p.z, size: 'p' });
    this.state = 'dead';
    // 装備は失う（全難易度。Easy は復帰時に再装備用カプセル）
    this.resetLoadout();
    if (this.mode === 'practice' && this.lives <= 0) this.lives = 0;
  }

  // ---- 進行 ---------------------------------------------------------------
  bossDefeated() {
    if (this.bossDone) return;
    this.bossDone = true;
    this.state = 'clear';
    this.clearTimer = 0;
    // 残った敵弾は安全に消す。雑魚も爆発させる（得点なし）
    for (const b of this.ebullets) this.emit({ t: 'spark', x: b.x, y: b.y, z: b.z });
    this.ebullets = [];
    for (const e of this.enemies) if (!e.boss) this.kill(e, false);
    this.emit({ t: 'music', id: null });
    this.emit({ t: 'bossdown' });
  }
  updateFlow() {
    if (this.state === 'clear') {
      this.clearTimer++;
      this.ebullets = [];
      if (this.clearTimer === 150) { this.state = 'stageclear'; this.clearTimer = 0; this.emit({ t: 'music', id: this.stageNo === 7 ? 'ending' : 'clear' }); this.emit({ t: 'stageclear', n: this.stageNo }); }
    } else if (this.state === 'stageclear') {
      this.clearTimer++;
      if (this.clearTimer >= 300) {
        if (this.stageNo >= STAGES.length || this.mode === 'practice') { this.over = true; this.cleared = this.stageNo >= STAGES.length || this.mode === 'practice'; this.emit({ t: this.stageNo >= STAGES.length ? 'allclear' : 'practiceclear' }); return; }
        this.startStage(this.stageNo + 1);
      }
    }
  }

  // 結果（記録の分離キー: 版・難易度・本編/練習）
  recordKey() { return `${this.variant}:${this.difficulty}:${this.mode}`; }

  // ---- デバッグ（?debug=1 の時だけ UI から呼ぶ。テストでも使う） ----
  debugSkipToBoss() { this.respawnAt(this.stage.checkpoints.length - 1, false); this.camX = this.stage.length - 0.1; this.player.x = this.camX + 4; }
  debugKillBoss() { if (this.boss && !this.boss.dead) { const def = BOSS[this.boss.type]; if (def.forceKill) def.forceKill(this.boss, this); else this.kill(this.boss); } }
  debugNextStage() { if (this.stageNo < STAGES.length) this.startStage(this.stageNo + 1); }
  debugFullPower() { Object.assign(this.power, { speed: 3, missile: true, weapon: 'laser', options: 4, shield: 5, sel: -1 }); this.ensureHistory(); }
}
