// NIGHT SHAFT のゲーム本体（描画・音・入力機器から独立した論理）。2D 版と VR 版で同じものを使う。
// 時間は 1/120 秒の固定刻みで進める（低フレームレートでも弾・足場をすり抜けない）。
// 座標: x = ビル内の左右（0..W）、y = 足元の高さ（1 階の床 = 0、n 階の床 = (n-1)*3）、z = VR の奥行き（2D では 0）。
import { FLOOR_H, W, CAR_W, CAR_SPEED, AUTO_WAIT, AUTO_WARN, ESC_SPEED, P, E, DIFF, DOOR_COOLDOWN, SPAWN_MIN_DIST,
  DARK_DETECT, DARK_WINDUP, LIGHT_RADIUS, SCORE, CAUSE_RANK, level, floorOf } from './const.js';
import { getStage, STAGES } from './stages.js';
import { makeRng } from './rng.js';

const TICK = 1 / 120;
const EPS = 0.02;
const near = (a, b, d) => Math.abs(a - b) < d;
const isLevel = (y) => Math.abs(y - Math.round(y / FLOOR_H) * FLOOR_H) < EPS;

export class Game {
  constructor(opts = {}) {
    this.opts = { stageIndex: 1, difficulty: 'normal', mode: '2d', noEnemies: false, invincible: false, ...opts };
    this.D = DIFF[this.opts.difficulty] || DIFF.normal;
    this.stageIndex = this.opts.stageIndex;
    this.stageDef = STAGES[this.stageIndex];
    this.stage = getStage(this.stageIndex);
    this.mode = this.opts.mode;
    this.score = this.opts.score ?? 0;
    this.lives = this.opts.lives ?? this.D.lives;
    this.init();
  }

  init() {
    const st = this.stage;
    this.rng = makeRng(((st.seed || 77) ^ 0xA5A5) + Object.keys(DIFF).indexOf(this.opts.difficulty) * 101);
    this.time = 0;
    this.events = [];
    this.phase = 'play'; // play | dead | clear | gameover
    this.phaseT = 0;
    this.prevInput = {};
    this.cars = st.shafts.map((s) => ({ ...s, y: level(s.start), target: level(s.start), dy: 0, state: 'stopped', stillT: 1, stopEmitted: true,
      dir: s.start >= s.hi ? -1 : 1, wait: AUTO_WAIT, warned: false, doors: 1, calls: 0 }));
    this.doors = []; this.lights = []; this.covers = [];
    this.byFloor = {};
    for (let f = 1; f <= st.floors; f++) {
      const fl = st.floor[f];
      const ds = fl.doors.map((d) => ({ ...d, collected: false, tele: 0, open: 0, cooldown: 0 }));
      const ls = fl.lights.map((l) => ({ ...l, state: 'on', fy: 0, vy: 0, swing: 0 }));
      const cs = fl.covers.map((c) => ({ ...c }));
      this.doors.push(...ds); this.lights.push(...ls); this.covers.push(...cs);
      this.byFloor[f] = { doors: ds, lights: ls, covers: cs, spawnT: this.D.spawnEvery * 0.6 };
    }
    this.enemies = [];
    this.nextEnemyId = 1;
    if (!this.opts.noEnemies) {
      for (let f = 1; f <= st.floors; f++) for (const e of st.floor[f].enemies) this.addEnemy(e.x, level(f), e.type, 'patrol', e.patrol);
    }
    this.pBullets = []; this.eBullets = [];
    this.docsGot = 0;
    this.docTotal = st.docTotal;
    this.kills = 0;
    this.msgT = 0;
    const y0 = level(st.start.floor);
    this.player = { x: st.start.x, y: y0, z: 0, vx: 0, vy: 0, face: 1, grounded: true, crouch: false, h: P.h,
      state: 'play', t: 0, inv: 1.0, support: { kind: 'floor' }, fallFrom: y0, fireCd: 0, shootT: 9, esc: null, escS: 0, escDir: 0,
      door: null, lastSafe: { x: st.start.x, y: y0 }, walkPhase: 0, dodge: 0, deadCause: null, airT: 0, kicked: false, hitT: 9 };
  }

  // ---- 参照用の小さな関数 ----
  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  get playerFloor() { return Math.max(1, Math.min(this.stage.floors, Math.floor((this.player.y + 0.6) / FLOOR_H) + 1)); }
  remainingDocFloors() { return this.doors.filter((d) => d.kind === 'doc' && !d.collected).map((d) => d.floor).sort((a, b) => b - a); }
  carAt(x) { return this.cars.filter((c) => near(c.x, x, CAR_W / 2)); }
  isLit(y, x) {
    const f = floorOf(y);
    const fl = this.byFloor[f];
    if (!fl) return true;
    return fl.lights.some((l) => l.state === 'on' && Math.abs(l.x - x) < LIGHT_RADIUS);
  }
  lightAmount(f, x) { // 0..1（描画用。消灯しても 0.35 は残す）
    const fl = this.byFloor[f];
    if (!fl) return 1;
    let a = 0;
    for (const l of fl.lights) if (l.state === 'on') a = Math.max(a, 1 - Math.abs(l.x - x) / (LIGHT_RADIUS * 1.4));
    return 0.35 + 0.65 * Math.max(0, Math.min(1, a * 1.25));
  }

  // その位置・高さで足場になるもの（床・かごの床・かごの屋根）。昇降路の開口でかごが無ければ null（穴）
  supportAt(x, y) {
    if (x < 0 || x > W) return null;
    for (const c of this.cars) {
      if (!near(c.x, x, CAR_W / 2)) continue;
      if (near(c.y, y, EPS)) return { kind: 'car', car: c };
      if (near(c.y + FLOOR_H, y, EPS)) return { kind: 'roof', car: c };
    }
    if (!isLevel(y)) return null;
    const f = floorOf(y);
    if (f < 1 || f > this.stage.floors) return null;
    for (const c of this.cars) if (near(c.x, x, CAR_W / 2) && f >= c.lo && f <= c.hi) return null;
    return { kind: 'floor' };
  }
  inColumn(x) { return this.cars.find((c) => near(c.x, x, CAR_W / 2)); }
  carAligned(c) { return c.state === 'stopped' && isLevel(c.y); }

  addEnemy(x, y, type, state = 'patrol', patrol = null) {
    const e = { id: this.nextEnemyId++, x, y, z: 0, vy: 0, dir: this.rng.chance(0.5) ? 1 : -1, type, state, t: 0, stance: 'stand',
      alive: true, grounded: true, fireCd: 1.0 + this.rng() * 1.5, walkPhase: this.rng() * 6, patrol, lowShot: false, pending: null,
      lostT: 0, pref: 3.5 + type * 1.2 + this.rng() * 2.5, turnT: 2 + this.rng() * 4, dodgeT: 0, deadT: 0, cause: null, spawnT: 0, hitT: 9, shootT: 9 };
    this.enemies.push(e);
    return e;
  }

  // ---- 1 フレームぶん進める ----
  step(dt, input = {}) {
    const prev = this.prevInput;
    const edges = {};
    for (const k of ['up', 'down', 'jump', 'fire', 'left', 'right']) edges[k] = !!input[k] && !prev[k];
    this.prevInput = { ...input };
    let acc = Math.min(Math.max(dt, 0), 0.25);
    let first = true;
    while (acc > 1e-6) {
      const h = Math.min(acc, TICK);
      this.tick(h, input, first ? edges : {});
      first = false;
      acc -= h;
    }
  }

  tick(dt, inp, edge) {
    this.time += dt;
    if (this.msgT > 0) this.msgT -= dt;
    const p = this.player;
    if (this.phase === 'clear' || this.phase === 'gameover') { this.phaseT += dt; this.updateEnemiesIdle(dt); return; }
    this.updateCars(dt, inp, edge);
    this.followSupport(p);
    for (const e of this.enemies) this.followSupport(e);
    this.updatePlayer(dt, inp, edge);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateLights(dt);
    this.updateSpawns(dt);
    this.resolveKills();
    if (this.phase === 'dead') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.afterDeath();
    }
  }

  // ---- かご ----
  updateCars(dt, inp, edge) {
    const p = this.player;
    for (const c of this.cars) {
      const prevY = c.y;
      const ridden = p.state === 'play' && p.support && p.support.kind === 'car' && p.support.car === c;
      if (c.auto) {
        if (c.state === 'stopped') {
          c.wait -= dt;
          if (c.wait <= AUTO_WARN && !c.warned) { c.warned = true; this.emit('carWarn', { car: c.id }); }
          if (c.wait <= 0) {
            let nf = floorOf(c.y) + c.dir;
            if (nf > c.hi || nf < c.lo) { c.dir = -c.dir; nf = floorOf(c.y) + c.dir; }
            c.target = level(nf);
          }
        }
      } else if (ridden && this.phase === 'play') {
        const want = inp.up ? 1 : inp.down ? -1 : (this.vrCarDir || 0);
        if (want && Math.abs(c.y - c.target) < 1e-6) {
          const nf = floorOf(c.target) + want;
          if (nf >= c.lo && nf <= c.hi) c.target = level(nf);
          else if (edge.up || edge.down) this.emit('carLimit', { car: c.id });
        }
      }
      if (Math.abs(c.y - c.target) > 1e-6) {
        if (c.state === 'stopped') {
          if (c.stillT > 0.06) this.emit('carStart', { car: c.id });
          c.state = 'moving';
        }
        const d = Math.sign(c.target - c.y);
        c.y += d * CAR_SPEED * dt;
        if ((d > 0 && c.y >= c.target) || (d < 0 && c.y <= c.target)) {
          c.y = c.target; c.state = 'stopped'; c.stillT = 0; c.stopEmitted = false;
          if (c.auto) { c.wait = AUTO_WAIT; c.warned = false; }
          this.emit('carPass', { car: c.id, floor: floorOf(c.y) });
        }
      } else if (c.state === 'stopped') {
        c.stillT += dt;
        if (c.stillT > 0.06 && !c.stopEmitted) { c.stopEmitted = true; this.emit('carStop', { car: c.id, floor: floorOf(c.y) }); }
      }
      c.doors = c.state === 'stopped' && c.stillT > 0.15 ? Math.min(1, c.doors + dt * 4) : Math.max(0, c.doors - dt * 6);
      c.dy = c.y - prevY;
    }
  }

  // かごの床・屋根に立っているものは、かごと一緒に動く。屋根の上で上昇したら挟まれる
  followSupport(o) {
    if (!o.grounded || !o.support || !o.support.car) return;
    const c = o.support.car;
    if (o === this.player && o.state !== 'play') return;
    if (o.support.kind === 'car') o.y = c.y;
    else if (o.support.kind === 'roof') {
      if (c.dy > 1e-7) {
        if (o === this.player) this.die('crush');
        else this.hit(o, 'env');
      }
      o.y = c.y + FLOOR_H;
    }
  }

  // ---- プレイヤー ----
  updatePlayer(dt, inp, edge) {
    const p = this.player;
    p.inv = Math.max(0, p.inv - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.shootT += dt; p.hitT += dt; if (p.kickT != null) p.kickT += dt;
    p.dodge = Math.max(0, p.dodge - dt);
    if (p.state === 'dead') return;
    if (p.state === 'door') {
      p.t -= dt;
      if (!p.door.collected && p.t < 0.6) {
        p.door.collected = true; this.docsGot++; this.addScore(SCORE.doc);
        this.emit('doc', { floor: p.door.floor, x: p.door.x, got: this.docsGot, total: this.docTotal, pts: SCORE.doc });
      }
      if (p.t <= 0) { p.state = 'play'; this.emit('doorExit', { door: p.door.id }); p.door = null; }
      return;
    }
    if (p.state === 'esc') {
      const e = p.esc;
      const len = Math.hypot(e.xTop - e.xBot, FLOOR_H);
      p.escS = Math.min(1, p.escS + ESC_SPEED * dt / len);
      const a = p.escDir < 0 ? { x: e.xTop, y: level(e.upper) } : { x: e.xBot, y: level(e.upper - 1) };
      const b = p.escDir < 0 ? { x: e.xBot, y: level(e.upper - 1) } : { x: e.xTop, y: level(e.upper) };
      p.x = a.x + (b.x - a.x) * p.escS; p.y = a.y + (b.y - a.y) * p.escS;
      p.face = Math.sign(b.x - a.x) || p.face;
      if (inp.fire && p.fireCd <= 0) this.playerFire(p.y + P.gunStand);
      if (p.escS >= 1) { p.state = 'play'; p.grounded = true; p.support = { kind: 'floor' }; p.vy = 0; p.fallFrom = p.y; this.emit('escEnd'); }
      return;
    }

    const vr = this.mode === 'vr';
    if (p.grounded) {
      const s = this.supportAt(p.x, p.y);
      // 縁から歩いて落ちたときは、ほぼ真下へ落ちる（昇降路の穴に落ちたら穴の中に着く）
      if (!s) { p.grounded = false; p.vy = 0; p.fallFrom = p.y; p.support = null; p.vx *= 0.2; p.airT = 0; }
      else p.support = s;
    }
    const inCar = p.grounded && p.support && p.support.kind === 'car';
    const car = inCar ? p.support.car : null;
    const f = floorOf(p.y);
    const onFloor = p.grounded && p.support && p.support.kind === 'floor' && isLevel(p.y);

    // 文脈入力の優先順位: 乗車中 → ドア前 → エスカレーター → 呼び出し → 通常
    const ctx = this.context();
    p.ctx = ctx;
    if (!inCar && edge.up && ctx) {
      if (ctx.kind === 'door') return this.enterDoor(ctx.door);
      if (ctx.kind === 'escUp') return this.startEsc(ctx.esc, +1);
      if (ctx.kind === 'call') this.callCar(ctx.car, f);
    }
    if (!inCar && edge.down && ctx && ctx.kind === 'escDown') return this.startEsc(ctx.esc, -1);

    // しゃがみ（かごの中では ↓ はかごの操作）
    const wantCrouch = vr ? !!this.vrCrouch : (!!inp.down && !inCar && p.grounded && !(ctx && ctx.kind === 'escDown'));
    if (wantCrouch !== p.crouch) {
      p.crouch = wantCrouch;
      p.h = p.crouch ? P.hCrouch : P.h;
    }

    // 横移動
    if (vr) {
      // VR はアプリが希望位置を渡す。壁・穴・屋根・走行中のかごの壁で止める
      const tx = this.vrTargetX ?? p.x;
      const maxStep = 8 * dt;
      const nx = p.x + Math.max(-maxStep, Math.min(maxStep, tx - p.x));
      p.walkSpeed = Math.abs(nx - p.x) / dt;
      p.walkPhase += Math.abs(nx - p.x) * 3.93;
      if (nx !== p.x) p.face = nx > p.x ? 1 : -1;
      p.x = this.constrainX(p, nx, true);
      if (this.vrFace) p.face = this.vrFace;
    } else if (p.grounded) {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      p.vx = p.crouch ? 0 : dir * P.walk;
      if (dir) p.face = dir;
      p.walkPhase += dt * Math.abs(p.vx) * 3.93; // 位相 π で 0.8m（pose.js の STRIDE）
      if (edge.jump && !p.crouch && !(car && car.state === 'moving')) {
        p.vy = P.jumpV; p.grounded = false; p.support = null; p.fallFrom = p.y; p.airT = 0; p.kicked = false;
        this.emit('jump');
      }
      p.x = this.constrainX(p, p.x + p.vx * dt, false);
    } else {
      p.x = this.constrainX(p, p.x + p.vx * dt, false);
    }

    // 縦（落下・着地）
    if (!p.grounded) {
      p.airT += dt;
      p.vy -= P.g * dt;
      const ny = p.y + p.vy * dt;
      if (p.vy <= 0) {
        const L = this.landing(p.x, p.y, ny);
        if (L) {
          p.y = L.y; p.grounded = true; p.vy = 0; p.vx = 0; p.support = L.s; p.kicked = false; p.kickT = null;
          const drop = p.fallFrom - L.y;
          this.emit('land', { drop });
          if (drop > P.fallSafe) this.die('fall');
        } else p.y = ny;
      } else p.y = ny;
      const col = this.inColumn(p.x);
      if (col && p.y < level(col.lo) - 1.2) this.die('fall');
      if (p.y < -2) this.die('fall');
      // 跳んで敵に当たるとキック
      if (!p.grounded && p.state === 'play') {
        for (const e of this.enemies) {
          if (!e.alive || e.state === 'spawn') continue;
          const eh = e.stance === 'crouch' ? E.hCrouch : E.h;
          if (Math.abs(e.x - p.x) < (P.w + E.w) / 2 + 0.12 && p.y < e.y + eh && p.y + 1.0 > e.y + 0.2) {
            this.hit(e, 'kick'); p.kicked = true; p.kickT = 0;
          }
        }
      }
    }

    // かごの下敷き（穴の中にいて、上からかごが降りてきた）
    const col = this.inColumn(p.x);
    if (col && p.state === 'play') {
      for (const c of this.cars) {
        if (c === (p.support && p.support.car) || !near(c.x, p.x, CAR_W / 2)) continue;
        if (c.dy < 0 && p.y < c.y && p.y + p.h > c.y + 0.05) this.die('crush');
      }
    }

    // 射撃
    if (inp.fire && p.fireCd <= 0 && !vr) this.playerFire(p.y + (p.crouch ? P.gunCrouch : P.gunStand));

    // 安全な復帰点
    if (onFloor && p.state === 'play') {
      const pits = this.cars.filter((c) => f >= c.lo && f <= c.hi).map((c) => c.x);
      if (pits.every((cx) => Math.abs(cx - p.x) > CAR_W / 2 + 0.6)) p.lastSafe = { x: p.x, y: p.y };
    }

    // 出口
    const ex = this.stage.exit;
    if (p.grounded && floorOf(p.y) === ex.floor && isLevel(p.y) && Math.abs(p.x - ex.x) < 0.8 && p.state === 'play') {
      if (this.docsGot >= this.docTotal) this.clearStage();
      else if (this.msgT <= 0) {
        this.msgT = 2.5;
        this.emit('needDocs', { left: this.docTotal - this.docsGot, floors: this.remainingDocFloors() });
      }
    }

    // チュートリアルのヒント
    if (this.stage.hints) {
      const h = this.stage.hints.find((hh) => hh.floor === f && p.x >= hh.x0 && p.x < hh.x1);
      this.hint = h ? h.text : null;
    }
  }

  // 位置の制約: 外壁、走行中のかごの中、VR では穴と屋根に踏み込めない
  constrainX(o, nx, vrBlock) {
    nx = Math.max(0.3, Math.min(W - 0.3, nx));
    const s = o.support;
    if (o.grounded && s && s.kind === 'car' && !this.carAligned(s.car)) {
      nx = Math.max(s.car.x - CAR_W / 2 + 0.3, Math.min(s.car.x + CAR_W / 2 - 0.3, nx));
    }
    if (vrBlock && o.grounded) {
      const ns = this.supportAt(nx, o.y);
      const blocked = !ns || (ns.kind === 'roof');
      if (blocked) {
        // 穴の縁で止める
        const c = this.inColumn(nx);
        if (c) nx = nx > c.x ? Math.max(nx, c.x + CAR_W / 2 + 0.01) : Math.min(nx, c.x - CAR_W / 2 - 0.01);
        const ns2 = this.supportAt(nx, o.y);
        if (!ns2 || ns2.kind === 'roof') nx = o.x;
      }
    }
    return nx;
  }

  landing(x, y0, y1) {
    let best = null;
    const lo = Math.min(y0, y1) - 0.05, hi = Math.max(y0, y1) + 0.001;
    for (let k = Math.ceil(lo / FLOOR_H); k * FLOOR_H <= hi; k++) {
      const y = k * FLOOR_H;
      if (y < lo || y > hi) continue;
      const s = this.supportAt(x, y);
      if (s && (!best || y > best.y)) best = { y, s };
    }
    for (const c of this.cars) {
      if (!near(c.x, x, CAR_W / 2)) continue;
      for (const [yy, kind] of [[c.y, 'car'], [c.y + FLOOR_H, 'roof']]) {
        if (yy >= lo - Math.abs(c.dy) && yy <= hi + Math.max(0, c.dy) && (!best || yy > best.y)) best = { y: yy, s: { kind, car: c } };
      }
    }
    return best;
  }

  // 今の位置で ↑／↓ が何をするか（HUD の案内とタッチの文脈ボタンにも使う）
  context() {
    const p = this.player;
    if (p.state !== 'play' || !p.grounded) return null;
    if (p.support && p.support.kind === 'car') return { kind: 'car', car: p.support.car };
    if (!isLevel(p.y)) return null;
    const f = floorOf(p.y);
    const fl = this.byFloor[f];
    if (!fl) return null;
    const door = fl.doors.find((d) => d.kind === 'doc' && !d.collected && Math.abs(d.x - p.x) < 0.55);
    if (door) return { kind: 'door', door };
    for (const e of this.stage.escalators) {
      if (e.upper === f && Math.abs(e.xTop - p.x) < 0.6) return { kind: 'escDown', esc: e };
      if (e.upper - 1 === f && Math.abs(e.xBot - p.x) < 0.6) return { kind: 'escUp', esc: e };
    }
    for (const c of this.cars) {
      const d = Math.abs(c.x - p.x);
      if (d > CAR_W / 2 && d < CAR_W / 2 + 1.0 && f >= c.lo && f <= c.hi && !c.auto && !(near(c.target, p.y, EPS) && near(c.y, p.y, EPS))) {
        return { kind: 'call', car: c };
      }
    }
    return null;
  }

  callCar(c, f) {
    if (c.auto) return;
    c.target = level(f); c.calls++;
    this.emit('call', { car: c.id, floor: f });
  }
  enterDoor(d) {
    const p = this.player;
    p.state = 'door'; p.door = d; p.t = 1.1; p.crouch = false; p.h = P.h; p.x = d.x;
    this.emit('doorEnter', { door: d.id, floor: d.floor });
  }
  startEsc(e, dir) {
    const p = this.player;
    p.state = 'esc'; p.esc = e; p.escDir = dir; p.escS = 0; p.crouch = false; p.h = P.h; p.grounded = true; p.support = null;
    this.emit('escStart', { esc: e.id, dir });
  }

  playerFire(y) {
    const p = this.player;
    if (this.pBullets.length >= P.maxBullets) return;
    p.fireCd = P.fireInterval; p.shootT = 0;
    this.pBullets.push({ x: p.x + p.face * 0.4, y, dir: p.face, life: 2 });
    this.emit('shot', { x: p.x, y, dir: p.face });
    this.notifyPlayerShot(y, p.face);
  }
  // 撃たれそうになった敵は（難易度に応じて）しゃがんでかわす
  notifyPlayerShot(y, dir) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive || e.type < 1 || e.state === 'windup' || e.state === 'spawn') continue;
      if (Math.abs(e.y - p.y) > 0.6 || Math.sign(e.x - p.x) !== dir) continue;
      if (y - e.y > E.hCrouch && this.rng.chance(this.D.dodge)) { e.stance = 'crouch'; e.dodgeT = 0.7; }
    }
  }

  addScore(n) { this.score += n; }

  // 撃破は 1 フレームの終わりにまとめて確定する（同時に当たったら優先順位の高い 1 種類だけ加点）
  hit(e, cause) {
    if (!e.alive) return;
    if (!e.pending || CAUSE_RANK[cause] > CAUSE_RANK[e.pending]) e.pending = cause;
  }
  resolveKills() {
    for (const e of this.enemies) {
      if (!e.pending || !e.alive) continue;
      const cause = e.pending;
      e.pending = null; e.alive = false; e.state = 'dying'; e.deadT = 0; e.cause = cause; e.vy = 0;
      const pts = SCORE[cause];
      this.addScore(pts); this.kills++;
      this.emit('kill', { id: e.id, cause, x: e.x, y: e.y, pts });
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.deadT < 1.4);
  }

  die(cause) {
    const p = this.player;
    if (p.state === 'dead' || this.phase !== 'play') return;
    if ((p.inv > 0 || p.state === 'door') && cause !== 'fall') return;
    if (this.opts.invincible) {
      if (cause === 'fall' || cause === 'crush') this.respawn();
      return;
    }
    p.state = 'dead'; p.deadCause = cause; p.t = 0; p.crouch = false;
    this.phase = 'dead'; this.phaseT = P.deadTime;
    this.emit('miss', { cause });
  }
  afterDeath() {
    this.lives--;
    if (this.lives <= 0) { this.phase = 'gameover'; this.phaseT = 0; this.emit('gameover', { score: this.score }); return; }
    this.phase = 'play';
    this.respawn();
  }
  respawn() {
    const p = this.player;
    p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0; p.grounded = true; p.support = { kind: 'floor' };
    p.state = 'play'; p.inv = P.invuln; p.crouch = false; p.h = P.h; p.esc = null; p.door = null; p.fallFrom = p.y;
    this.eBullets = [];
    for (const e of this.enemies) {
      if (!e.alive || Math.abs(e.y - p.y) > 0.6) continue;
      e.fireCd = Math.max(e.fireCd, 1.5);
      if (e.state === 'windup') { e.state = 'alert'; e.stance = 'stand'; }
    }
    this.emit('respawn', { x: p.x, y: p.y });
  }
  clearStage() {
    this.phase = 'clear'; this.phaseT = 0;
    this.addScore(SCORE.clear);
    this.emit('clear', { score: this.score, pts: SCORE.clear });
  }

  // ---- 敵 ----
  updateEnemiesIdle(dt) { for (const e of this.enemies) if (!e.alive) e.deadT += dt; }

  updateEnemies(dt) {
    const p = this.player;
    const D = this.D;
    const pf = this.playerFloor;
    for (const e of this.enemies) {
      e.shootT += dt; e.hitT += dt; e.moving = false;
      if (!e.alive) { e.deadT += dt; continue; }
      const ef = Math.floor((e.y + 0.6) / FLOOR_H) + 1;
      if (Math.abs(ef - pf) > 3) continue; // 遠い階は状態を保ったまま止めておく
      // 足場
      if (e.grounded) {
        const s = this.supportAt(e.x, e.y);
        if (!s) { e.grounded = false; e.vy = 0; e.fallFrom = e.y; e.support = null; } else e.support = s;
      }
      if (!e.grounded) {
        e.vy -= P.g * dt;
        const ny = e.y + e.vy * dt;
        const L = this.landing(e.x, e.y, ny);
        if (L) { e.y = L.y; e.grounded = true; e.vy = 0; e.support = L.s; if (e.fallFrom - L.y > P.fallSafe) this.hit(e, 'env'); }
        else e.y = ny;
        if (e.y < -2) this.hit(e, 'env');
        continue;
      }
      if (e.state === 'spawn') { e.spawnT -= dt; if (e.spawnT <= 0) { e.state = 'alert'; } continue; }
      if (e.dodgeT > 0) { e.dodgeT -= dt; if (e.dodgeT <= 0 && e.state !== 'windup') e.stance = 'stand'; }

      const same = Math.abs(e.y - p.y) < 0.6 && (p.state === 'play' || p.state === 'esc') && this.phase === 'play';
      const dist = Math.abs(p.x - e.x);
      const lit = this.isLit(p.y, p.x);
      const range = D.detect * (lit ? 1 : DARK_DETECT);
      const sees = same && dist < range;
      const toward = Math.sign(p.x - e.x) || 1;

      if (e.state === 'patrol') {
        e.turnT -= dt;
        if (e.turnT <= 0) { e.dir = -e.dir; e.turnT = 2.5 + this.rng() * 4; }
        if (e.patrol && (e.x < e.patrol[0] && e.dir < 0 || e.x > e.patrol[1] && e.dir > 0)) e.dir = -e.dir;
        this.enemyWalk(e, e.dir, D.walk * 0.55, dt, true);
        if (sees) { e.state = 'alert'; e.t = 0; e.dir = toward; this.emit('spot', { id: e.id }); }
      } else if (e.state === 'alert') {
        e.dir = toward;
        e.fireCd -= dt;
        if (!sees) { e.lostT += dt; if (e.lostT > 2.5) { e.state = 'patrol'; e.lostT = 0; } }
        else e.lostT = 0;
        // 好みの間合いまで寄る（遮蔽物を使う敵は、近くの遮蔽物の陰へ）
        let goal = null;
        if (e.type === 2) {
          const cv = (this.byFloor[ef] ? this.byFloor[ef].covers : []).filter((c) => Math.abs(c.x - e.x) < 6 && Math.sign(p.x - c.x) === Math.sign(p.x - e.x));
          if (cv.length) { const c = cv[0]; goal = c.x - toward * 0.75; }
        }
        if (goal == null && sees) goal = dist > e.pref + 1 ? p.x - toward * e.pref : dist < 2.2 ? e.x - toward * 0.8 : null;
        if (goal != null && Math.abs(goal - e.x) > 0.15 && e.stance === 'stand') this.enemyWalk(e, Math.sign(goal - e.x), D.walk, dt, false);
        if (e.type === 2 && goal != null && Math.abs(goal - e.x) < 0.3 && e.fireCd > 0.4) e.stance = 'crouch';
        if (sees && e.fireCd <= 0 && e.dodgeT <= 0) {
          e.state = 'windup';
          e.t = D.windup + (lit ? 0 : DARK_WINDUP);
          e.lowShot = e.type === 1 ? this.rng.chance(0.5) : false;
          e.stance = e.lowShot ? 'crouch' : 'stand';
          e.aimZ = p.z;
          this.emit('windup', { id: e.id, low: e.lowShot });
        }
      } else if (e.state === 'windup') {
        e.dir = toward;
        e.t -= dt;
        if (e.t <= 0) {
          if (same) {
            const y = e.y + (e.lowShot ? E.gunLow : E.gunStand);
            this.eBullets.push({ x: e.x + e.dir * 0.4, y, z: this.mode === 'vr' ? (e.aimZ ?? 0) : 0, dir: e.dir, speed: D.bullet, low: e.lowShot, life: 6, from: e.id });
            e.shootT = 0;
            this.emit('eshot', { id: e.id, x: e.x, y, low: e.lowShot });
          }
          e.state = 'cool'; e.t = 0.4; e.fireCd = D.fireCd * (0.8 + 0.4 * this.rng());
        }
      } else if (e.state === 'cool') {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'alert'; if (e.type !== 2 && e.dodgeT <= 0) e.stance = 'stand'; }
      }
    }
  }

  enemyWalk(e, dir, speed, dt, turnAtEdge) {
    if (e.stance === 'crouch') return;
    const nx = e.x + dir * speed * dt;
    const ahead = nx + dir * 0.4;
    const s = this.supportAt(ahead, e.y);
    const inMovingCar = e.support && e.support.kind === 'car' && !this.carAligned(e.support.car);
    if (!s || ahead < 0.4 || ahead > W - 0.4 || inMovingCar) { if (turnAtEdge) e.dir = -e.dir; return; }
    e.x = nx; e.walkPhase += dt * speed * 3.93; e.moving = true;
  }

  // ---- 通常ドアからの出現（予兆つき） ----
  updateSpawns(dt) {
    for (const d of this.doors) {
      d.cooldown = Math.max(0, d.cooldown - dt);
      d.open = Math.max(0, d.open - dt);
      if (d.tele > 0) {
        d.tele -= dt;
        if (d.tele <= 0) {
          const types = this.stageDef.types || [0];
          const e = this.addEnemy(d.x, level(d.floor), this.rng.pick(types), 'spawn');
          e.spawnT = 0.35; e.dir = Math.sign(this.player.x - d.x) || 1;
          e.fireCd = Math.max(1.0, this.D.fireCd * 0.7);
          d.open = 0.9;
          this.emit('spawn', { id: e.id, door: d.id });
        }
      }
    }
    if (this.opts.noEnemies || this.phase !== 'play') return;
    const p = this.player;
    if (p.state !== 'play' || !p.grounded) return;
    const f = this.playerFloor;
    const fl = this.byFloor[f];
    if (!fl) return;
    fl.spawnT -= dt;
    if (fl.spawnT > 0) return;
    fl.spawnT = this.D.spawnEvery * (0.7 + 0.6 * this.rng());
    const active = this.enemies.filter((e) => e.alive && Math.abs(e.y - p.y) <= 2 * FLOOR_H + 0.1).length
      + this.doors.filter((d) => d.tele > 0).length;
    if (active >= this.D.maxEnemies) return;
    const cand = fl.doors.filter((d) => d.kind === 'normal' && !d.noSpawn && d.cooldown <= 0 && d.tele <= 0
      && Math.abs(d.x - p.x) >= SPAWN_MIN_DIST && Math.abs(d.x - p.x) <= 14);
    if (!cand.length) return;
    const d = this.rng.pick(cand);
    d.tele = this.D.spawnTele; d.cooldown = DOOR_COOLDOWN;
    this.emit('doorWarn', { door: d.id, floor: d.floor });
  }

  // ---- 弾 ----
  coverBlocks(x0, x1, y) {
    const f = Math.floor((y + 0.01) / FLOOR_H) + 1;
    const fl = this.byFloor[f];
    if (!fl) return null;
    const L = level(f);
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    return fl.covers.find((c) => y < L + c.h && y > L && b > c.x - c.w / 2 && a < c.x + c.w / 2) || null;
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.pBullets) {
      const x0 = b.x;
      b.x += b.dir * P.bulletSpeed * dt; b.life -= dt;
      const a = Math.min(x0, b.x), c = Math.max(x0, b.x);
      if (b.x < 0 || b.x > W || b.life <= 0) { b.dead = true; this.emit('bulletWall', { x: Math.max(0, Math.min(W, b.x)), y: b.y }); continue; }
      const f = Math.floor((b.y + 0.01) / FLOOR_H) + 1;
      const L = level(f);
      const fl = this.byFloor[f];
      if (fl) {
        const lt = fl.lights.find((l) => l.state === 'on' && c > l.x - 0.3 && a < l.x + 0.3 && b.y > L + 2.0 && b.y < L + 2.65);
        if (lt) { this.hitLight(lt); b.dead = true; continue; }
      }
      const cv = this.coverBlocks(x0, b.x, b.y);
      if (cv) { b.dead = true; this.emit('bulletCover', { x: cv.x, y: b.y }); continue; }
      for (const e of this.enemies) {
        if (!e.alive || e.state === 'spawn') continue;
        const eh = e.stance === 'crouch' ? E.hCrouch : E.h;
        if (b.y > e.y && b.y < e.y + eh && c > e.x - E.w / 2 && a < e.x + E.w / 2) { this.hit(e, 'shot'); e.hitT = 0; b.dead = true; break; }
      }
    }
    this.pBullets = this.pBullets.filter((b) => !b.dead);

    for (const b of this.eBullets) {
      const x0 = b.x;
      b.x += b.dir * b.speed * dt; b.life -= dt;
      if (b.x < 0 || b.x > W || b.life <= 0) { b.dead = true; continue; }
      const cv = this.coverBlocks(x0, b.x, b.y);
      if (cv) { b.dead = true; this.emit('bulletCover', { x: cv.x, y: b.y }); continue; }
      const a = Math.min(x0, b.x), c = Math.max(x0, b.x);
      if ((p.state === 'play' || p.state === 'esc') && b.y > p.y && b.y < p.y + p.h && c > p.x - P.w / 2 && a < p.x + P.w / 2
        && Math.abs((b.z || 0) - p.z) < 0.42 && p.dodge <= 0) {
        b.dead = true;
        if (p.inv <= 0) { p.hitT = 0; this.die('shot'); }
      }
    }
    this.eBullets = this.eBullets.filter((b) => !b.dead);
  }

  hitLight(l) {
    if (l.state !== 'on') return;
    l.state = 'falling'; l.fy = 2.3; l.vy = 0;
    this.emit('lightHit', { id: l.id, floor: l.floor, x: l.x });
  }
  updateLights(dt) {
    const p = this.player;
    for (const l of this.lights) {
      if (l.state !== 'falling') continue;
      l.vy -= P.g * dt; l.fy += l.vy * dt;
      const L = level(l.floor);
      for (const e of this.enemies) {
        if (!e.alive || Math.abs(e.y - L) > 0.3) continue;
        const eh = e.stance === 'crouch' ? E.hCrouch : E.h;
        if (Math.abs(e.x - l.x) < 0.75 && l.fy < eh + 0.1) this.hit(e, 'env');
      }
      if (Math.abs(p.y - L) < 0.3 && Math.abs(p.x - l.x) < 0.6 && l.fy < p.h && p.state === 'play') this.die('light');
      if (l.fy <= 0) { l.fy = 0; l.state = 'broken'; this.emit('lightCrash', { id: l.id, floor: l.floor, x: l.x }); }
    }
  }

  // ---- VR 版から使う入口 ----
  setVrControl({ x, z = 0, crouch = false, face = 0, carDir = 0 }) {
    this.vrTargetX = x; this.player.z = z; this.vrCrouch = crouch; this.vrFace = face; this.vrCarDir = carDir;
  }
  vrInteract() { // 左手のレイ・A 相当の「操作」
    const p = this.player;
    const ctx = this.context();
    if (!ctx) return false;
    const f = floorOf(p.y);
    if (ctx.kind === 'door') { this.enterDoor(ctx.door); return true; }
    if (ctx.kind === 'escUp') { this.startEsc(ctx.esc, 1); return true; }
    if (ctx.kind === 'escDown') { this.startEsc(ctx.esc, -1); return true; }
    if (ctx.kind === 'call') { this.callCar(ctx.car, f); return true; }
    return false;
  }
  vrCall(carId) { // 操作盤（呼び出しボタン）をレイで押した
    const c = this.cars[carId];
    const p = this.player;
    if (!c || c.auto || p.state !== 'play') return false;
    const f = floorOf(p.y);
    if (f < c.lo || f > c.hi || Math.abs(c.x - p.x) > CAR_W / 2 + 2.5) return false;
    this.callCar(c, f);
    return true;
  }
  vrShot(y, dir) { this.player.shootT = 0; this.emit('shot', { x: this.player.x, y, dir, vr: true }); this.notifyPlayerShot(y, dir); }
  vrHitEnemy(id) { const e = this.enemies.find((q) => q.id === id); if (e && e.alive && e.state !== 'spawn') { e.hitT = 0; this.hit(e, 'shot'); } }
  vrHitLight(id) { const l = this.lights.find((q) => q.id === id); if (l) this.hitLight(l); }
  vrKick() { // 短距離の仮想キック（正面 1.3m 以内の敵 1 体）
    const p = this.player;
    if (p.state !== 'play') return false;
    let best = null;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'spawn' || Math.abs(e.y - p.y) > 0.6) continue;
      const d = (e.x - p.x) * p.face;
      if (d > -0.2 && d < 1.3 && (!best || d < best.d)) best = { e, d };
    }
    this.emit('kickSwing');
    if (best) { this.hit(best.e, 'kick'); p.kicked = true; return true; }
    return false;
  }
  vrDodge() { if (this.player.state === 'play') { this.player.dodge = 0.45; this.emit('dodge'); } }
}

export { STAGES };
