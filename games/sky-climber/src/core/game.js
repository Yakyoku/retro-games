// Sky Climber VR — 1 棟ぶんの進行（登攀・障害・命中・残機・得点・復帰・屋上到達）と、4 棟を通す Run。
// 60Hz 固定で step() を呼ぶ。一時停止・タブ非表示・追跡喪失のときは呼ばない（残機は減らない）。
import { BODY, RULES, DIFFICULTY, TICK } from './config.js';
import { buildStage, stageById, startPose, ledgePose, BUILDINGS } from './stages.js';
import { Climber } from './climb.js';
import { Hazards } from './hazards.js';
import { DirectSolver } from './direct.js';

const SIDES = ['L', 'R'];

export class Game {
  constructor(opts) {
    this.opts = opts;
    this.def = stageById(opts.stageId);
    if (opts.noHazards) this.def = { ...this.def, hazards: { closers: 0, drops: 0, birds: 0, sweep: null } };
    this.practice = this.def.id === 'practice';
    this.diff = DIFFICULTY[opts.difficulty || 'standard'];
    this.control = opts.control || 'classic';      // 'classic' | 'direct'
    this.b = buildStage(this.def);
    this.hz = new Hazards(this.b, this.diff, (opts.seed ?? this.def.seed));
    this.supports = [{ y: 0, x0: -1e9, x1: 1e9 }, ...this.b.ledges.map((l) => ({ y: l.y, x0: l.x - 0.85, x1: l.x + 0.85, ledge: l }))];
    this.climber = new Climber(this.b, startPose(this.b), {
      reachMul: opts.reachMul ?? 1, speedMul: opts.speedMul ?? 1, autoGrab: opts.autoGrab,
      available: (id) => this.hz.holdAvailable(this.b.holds[id]), supports: this.supports,
    });
    this.run = opts.run || { score: 0, lives: RULES.lives };
    this.state = 'play'; this.stateT = 0; this.time = 0;
    this.maxMeters = 0; this.maxBodyY = this.climber.body.y;
    this.combo = 0; this.comboSide = null; this.highestGrab = -1;
    this.invuln = 0; this.seenHits = new Set();
    this.events = [];
    this.falls = 0; this.hits = 0;
    if (this.control === 'direct') {
      this.solver = new DirectSolver({ x: startPose(this.b).x, y: 0, z: 0.45 });
      this.solver.pull = opts.pull ?? 1;
      this.grabR = 0.13 * (opts.grabAssist ?? 1);
      this.gripMode = opts.gripMode || 'hold';     // 'hold' 握り続ける | 'toggle' 押すたびに切替
      this.gripPrev = { L: false, R: false }; this.toggled = { L: false, R: false };
    }
  }
  emit(e) { this.events.push(e); }
  takeEvents() { this.drainClimber(); const e = this.events.concat(this.hz.takeEvents()); this.events = []; return e; }
  // 登攀の出来事を取り出して得点に使い、外へ渡す列に移す（同じ出来事を 2 回数えない）
  drainClimber() { const ce = this.climber.takeEvents(); this.scoreGrabs(ce); this.events.push(...ce); }
  get top() { return this.b.top; }
  // 障害・得点が見る「プレイヤー」
  player() {
    const c = this.climber;
    return { body: c.body, hands: { L: { x: c.hands.L.x, y: c.hands.L.y, held: c.hands.L.hold != null, hold: c.hands.L.hold },
      R: { x: c.hands.R.x, y: c.hands.R.y, held: c.hands.R.hold != null, hold: c.hands.R.hold } } };
  }
  setState(s) { this.state = s; this.stateT = 0; }

  // input: classic → { L:{x,y}|null, R:{x,y}|null }、direct → { head:{x,y,z}, ctrl:{L:{x,y,z,valid,grip},R:...} }
  step(input = {}) {
    const dt = TICK;
    this.time += dt; this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    const c = this.climber;
    if (this.state === 'play' || this.state === 'grace') {
      if (this.control === 'direct') this.stepDirect(dt, input);
      else c.stepClassic(dt, input.classic || {}, true);
      this.hz.step(dt, this.player());
      // 窓が閉じきった瞬間、その窓の保持点を持つ手を外す
      for (const s of SIDES) { const h = c.hands[s]; if (h.hold != null && !this.hz.holdAvailable(this.b.holds[h.hold])) { this.releaseHand(s, 'window'); } }
      this.handleHits();
      this.scoreFromEvents();
      this.checkSupport(dt);
      this.checkClear();
    } else if (this.state === 'mantle') {
      // 屋上へ身体を引き上げる短い演出（自動）
      c.body.y = Math.min(this.top + 1.45, c.body.y + dt * 1.8);
      if (this.stateT > 1.0) this.finishClear();
    } else if (this.state === 'fall') {
      c.body.y -= dt * 2.2 * Math.min(1, this.stateT * 2); // 短い落下（長い自由落下はしない）
      if (this.solver) this.solver.shift(0, -dt * 2.2 * Math.min(1, this.stateT * 2));
      if (this.stateT >= RULES.fallAnim) {
        if (!this.practice && this.run.lives <= 0) { this.setState('over'); this.emit({ type: 'gameover' }); }
        else this.setState('respawn');
      }
    } else if (this.state === 'respawn') {
      if (this.stateT >= RULES.fadeTime) this.respawn();
    }
    // 落下・復帰・屋上演出の間も障害の時間は進める（終了後は止める）
    if (this.state === 'fall' || this.state === 'respawn' || this.state === 'mantle') this.hz.step(dt, this.player());
  }

  stepDirect(dt, input) {
    const c = this.climber, sv = this.solver, ctrl = input.ctrl || {};
    for (const s of SIDES) {
      const k = ctrl[s];
      if (!k || !k.valid) { this.gripPrev[s] = false; continue; }
      const pressed = !!k.grip, edge = pressed && !this.gripPrev[s], up = !pressed && this.gripPrev[s];
      this.gripPrev[s] = pressed;
      let want;
      if (this.gripMode === 'toggle') { if (edge) this.toggled[s] = !this.toggled[s]; want = this.toggled[s]; } else want = pressed;
      if (this.gripMode === 'toggle' && !edge && !up) { /* 状態はそのまま */ }
      const held = sv.hands[s].held;
      if (want && !held && (edge || this.state === 'grace')) {
        const w = sv.world(k);
        const hold = this.findGrab(w);
        if (hold) { sv.grab(s, hold.id, k); c.grab(s, hold.id); }
        else if (this.gripMode === 'toggle' && edge) this.toggled[s] = false;
      } else if (!want && held) { sv.release(s); c.release(s, 'user'); }
    }
    sv.update(dt, ctrl);
    // 手の論理位置: 保持中は保持点、そうでなければコントローラーのワールド位置
    for (const s of SIDES) {
      const h = c.hands[s];
      if (h.hold != null) { const hd = this.b.holds[h.hold]; h.x = hd.x; h.y = hd.y; }
      else if (ctrl[s] && ctrl[s].valid) { const w = sv.world(ctrl[s]); h.x = w.x; h.y = w.y; }
    }
    const head = input.head || { x: 0, y: 1.6, z: 0 };
    c.body.x = sv.offset.x + head.x; c.body.y = sv.offset.y + head.y - 0.2;
    c.mantle = false;
  }
  // VR: 手の近くの保持点（壁の表面にあるものだけ。壁の裏や遠方へは吸着しない）
  findGrab(w) {
    if (w.z < -0.06 || w.z > 0.38) return null;
    let best = null, bd = this.grabR;
    for (const h of this.climber.index.near(w.x, w.y, this.grabR)) {
      if (!this.hz.holdAvailable(h)) continue;
      const d = Math.hypot(h.x - w.x, h.y - w.y);
      if (d <= bd) { bd = d; best = h; }
    }
    return best;
  }
  releaseHand(s, reason) {
    const ok = this.climber.release(s, reason);
    if (ok && this.solver) this.solver.release(s);
    return ok;
  }
  handleHits() {
    const hits = this.hz.collide(this.player());
    for (const h of hits) {
      const key = `${h.hz}`;
      if (this.seenHits.has(key)) continue;       // 同じ衝突は 1 回だけ
      if (this.invuln > 0) continue;               // 命中後 1 秒は追加の保持解除なし
      this.seenHits.add(key);
      if (h.kind === 'gondola' || h.kind === 'crane' || h.kind === 'neon') setTimeoutKey(this, key, 2.0);
      let side = h.target;
      if (side === 'body') {
        const c = this.climber, hl = c.hands.L.hold != null, hr = c.hands.R.hold != null;
        if (hl && hr) side = h.x < c.body.x ? 'L' : 'R';  // 両手保持なら命中側
        else side = hl ? 'L' : hr ? 'R' : null;
      }
      this.invuln = RULES.hitInvuln;
      this.hits++;
      this.combo = 0; this.comboSide = null;
      this.emit({ type: 'hit', target: h.target, side, kind: h.kind, x: h.x, y: h.y });
      if (side) this.releaseHand(side, 'hit');
    }
    // 大型障害は通り過ぎたら再び当たるようにする
    for (const [k, t] of this.rearm || []) { if (this.time >= t) { this.seenHits.delete(k); this.rearm.delete(k); } }
  }
  scoreFromEvents() { this.drainClimber(); this.scoreHeight(); }
  scoreGrabs(list) {
    for (const e of list) {
      if (e.type !== 'grab') continue;
      const hd = this.b.holds[e.hold];
      if (hd.y <= this.highestGrab + 0.1) continue;           // 握り直し・同じ高さの往復は対象外
      if (this.comboSide && this.comboSide !== e.side) this.combo++;
      else this.combo = 1;
      this.comboSide = e.side; this.highestGrab = hd.y;
      if (this.combo >= RULES.comboStart) {
        const pts = Math.min(RULES.comboMax, RULES.comboStep * (this.combo - RULES.comboStart + 1));
        this.run.score += pts; this.emit({ type: 'combo', n: this.combo, pts });
      }
    }
  }
  scoreHeight() {
    const c = this.climber;
    // 最高到達高度（ラン内で初めて更新した 1m ごとに 100 点）
    const m = Math.floor(Math.max(0, c.body.y - 1.45));
    if (m > this.maxMeters) { this.run.score += (m - this.maxMeters) * RULES.pointsPerMeter; this.maxMeters = m; this.emit({ type: 'meter', m }); }
    this.maxBodyY = Math.max(this.maxBodyY, c.body.y);
  }
  // 支えの確認: 両手を失ったら猶予 → 落下。低い所なら床へ降りるだけ
  checkSupport(dt) {
    const c = this.climber;
    const held = c.heldCount();
    if (held > 0) { if (this.state === 'grace') this.setState('play'); if (this.solver) this.clampDirectFloor(); return; }
    const sp = this.highestSupportBelow();
    const feet = this.control === 'direct' ? this.solver.offset.y : c.body.y - 1.45;
    const drop = feet - sp.y;
    if (drop <= 0.03) { if (this.state === 'grace') this.setState('play'); if (this.solver) this.clampDirectFloor(); return; }
    if (drop <= BODY.safeDrop) {
      // 低い所: 床へ降りるだけ（残機は減らない）
      const v = Math.min(drop, dt * 3.0);
      c.body.y -= v; if (this.solver) this.solver.shift(0, -v);
      if (this.state === 'grace') this.setState('play');
      return;
    }
    if (this.state === 'play') { this.setState('grace'); this.emit({ type: 'grace' }); return; }
    if (this.state === 'grace' && this.stateT >= RULES.regrabGrace) this.startFall();
  }
  highestSupportBelow() {
    const c = this.climber;
    const feet = this.control === 'direct' ? this.solver.offset.y : c.body.y - 1.45;
    let best = this.supports[0];
    for (const sp of this.supports) if (c.body.x >= sp.x0 && c.body.x <= sp.x1 && sp.y <= feet + 0.05 && sp.y > best.y) best = sp;
    return best;
  }
  clampDirectFloor() {
    const sp = this.highestSupportBelow();
    if (this.solver.offset.y < sp.y) { const d = sp.y - this.solver.offset.y; this.solver.shift(0, d); this.climber.body.y += d; }
  }
  startFall() {
    this.setState('fall'); this.falls++;
    this.combo = 0; this.comboSide = null;
    if (!this.practice) this.run.lives--;
    this.emit({ type: 'fall', lives: this.run.lives });
  }
  respawn() {
    let pose = startPose(this.b), ledge = null;
    if (this.diff.respawn === 'safe' || this.practice) {
      for (const l of this.b.ledges) if (l.y + 1.45 <= this.maxBodyY + 0.3 && (!ledge || l.y > ledge.y)) ledge = l;
      if (ledge) pose = ledgePose(this.b, ledge);
    }
    this.climber.reset(pose);
    if (this.solver) { this.solver.teleport(pose.x - (this.lastHeadX || 0), pose.y - 1.45); this.gripPrev = { L: true, R: true }; this.toggled = { L: false, R: false }; }
    this.hz.clearNear(pose.x, pose.y);
    this.invuln = 1.5; this.seenHits.clear();
    this.setState('play');
    this.emit({ type: 'respawn', ledge: !!ledge });
  }
  checkClear() {
    const c = this.climber;
    if (this.control === 'classic' && c.mantle) { this.setState('mantle'); this.emit({ type: 'mantle' }); return; }
    if (this.control === 'direct' && c.body.y >= this.top + RULES.roofMargin) { this.finishClear(); }
  }
  finishClear() {
    this.setState('clear');
    this.run.score += RULES.clearBonus;
    this.emit({ type: 'clear', score: this.run.score });
  }
  // 復帰の位置が rig 内の頭の x とずれないよう、描画側から頭の x を教えてもらう
  setHeadX(x) { this.lastHeadX = x; }
}
function setTimeoutKey(g, key, after) { if (!g.rearm) g.rearm = new Map(); g.rearm.set(key, g.time + after); }

// 4 棟を順に登る 1 回の挑戦（得点・残機を引き継ぐ）
export class Run {
  constructor({ difficulty = 'standard', control = 'classic', startIndex = 0, score = 0, lives = RULES.lives } = {}) {
    this.difficulty = difficulty; this.control = control;
    this.index = startIndex; this.score = score; this.lives = lives;
    this.results = [];
  }
  get stageId() { return BUILDINGS[this.index]?.id; }
  get done() { return this.index >= BUILDINGS.length; }
  makeGame(extra = {}) { return new Game({ stageId: this.stageId, difficulty: this.difficulty, control: this.control, run: this, ...extra }); }
  finishBuilding(game) {
    this.results.push({ id: game.def.id, meters: game.maxMeters, falls: game.falls, hits: game.hits, time: game.time });
    this.index++;
  }
}
