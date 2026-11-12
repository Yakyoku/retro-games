// ツイン・ガーデン — 共通ゲームコア（2D 版・VR 版で同じものを使う。描画・入力機器・時計に依存しない）
//
// 60Hz 固定 tick。step(input) を 1 回呼ぶと 1 tick 進む。乱数は this.rng（シード付き）だけを使う。
// 同じシード・同じ tick 入力列なら、どの描画フレームレートでも同じ結果になる（tests/replay.test.js）。
//
// 1 tick の処理順（GAME_DESIGN.md「イベント処理順」）:
//   ① 移動（自機・ライン・敵・回収対象・宝）と閉領域の成立
//   ② 捕獲と回復（得点・植物・宝・強化の開始）
//   ③ 残った敵との接触（掃引判定）とエネルギー減少
//   ④ ミス判定（③で起きたら、この tick はミスを優先してクリアへ進まない）
//   ⑤ クリア判定
import { C, BOARD, DT, DIFFICULTY, multiplier } from './config.js';
import { STAGES, BONUS, LESSONS } from './stages.js';
import { Rope } from './rope.js';
import { makeRng, fnv } from './rng.js';
import { area, properIntersect, closestOnSeg, pointInPoly, sweptMinDist, dist2 } from './geom.js';

const sec = (s) => Math.round(s * 60);
const R = C.playerRadius;

export class Game {
  /**
   * @param {object} o
   * @param {'practice'|'easy'|'normal'|'hard'} o.difficulty
   * @param {'arcade'|'lesson'|'stagePractice'} [o.mode]
   * @param {number} [o.seed]
   * @param {number} [o.startStage]  0 始まり
   */
  constructor(o = {}) {
    this.diffId = o.difficulty || 'normal';
    this.diff = DIFFICULTY[this.diffId];
    this.mode = o.mode || (this.diffId === 'practice' ? 'lesson' : 'arcade');
    this.seed = (o.seed ?? 20261112) >>> 0;
    this.rng = makeRng(this.seed);
    this.tick = 0;
    this.score = 0;
    this.lives = this.mode === 'arcade' ? this.diff.lives : Infinity;
    this.events = [];
    this.result = null;
    this.stats = { captures: 0, bestMult: 1, misses: 0, chests: 0, bonuses: 0, stagesCleared: 0 };
    this.startStage = o.startStage || 0;
    this.stageIndex = this.startStage;
    this.pendingBonus = false;
    this._pts = [];
    this.loadStage(this.stageIndex, true);
  }

  get stageCount() { return this.mode === 'lesson' ? LESSONS.length : STAGES.length; }
  get enemyMul() { return this.mode === 'arcade' ? this.diff.enemyMul : 1; }
  get drainMul() { return this.mode === 'arcade' ? this.diff.drainMul : 0; }
  get hasEnemies() { return this.mode !== 'lesson' && (this.mode === 'stagePractice' || this.diff.enemies); }

  // ───────────── 面の用意 ─────────────
  loadStage(i, fresh) {
    const def = this.mode === 'lesson' ? LESSONS[i] : STAGES[i];
    this.def = def;
    this.kind = 'stage';
    this.bonus = null;
    if (fresh) this.stageStartScore = this.score;
    this.pegs = def.pegs;
    this.rope = new Rope(this.pegs);
    this.red = mover(def.start.red);
    this.blue = mover(def.start.blue);
    this.mush = def.mush.map((p, id) => ({ id, kind: 'mush', hx: p.x, hy: p.y, ...mover(p), a: (id * 2.39996) % (Math.PI * 2), alive: true }));
    this.enemies = [];
    if (this.hasEnemies) {
      let id = 0;
      for (const path of def.patrol) this.enemies.push({ id: id++, kind: 'patrol', ...mover(path[0]), path, seg: 0, dir: 1, alive: true, h: 0 });
      for (const p of def.chase) this.enemies.push({ id: id++, kind: 'chaser', ...mover(p), h: Math.PI * 1.5, target: 0, alive: true });
    }
    this.plants = def.plants.map((p, id) => ({ id, x: p.x, y: p.y, grow: 2, t: 0 }));
    this.treasure = def.treasure ? { x: def.treasure.x, y: def.treasure.y, found: false } : null;
    this.chest = null;
    this.gems = [];
    this.gemsGot = 0;          // 6 ビット（取ったマーク）
    this.energy = def.energy ?? C.energyStart;
    this.powerT = 0;
    this.powerUsed = false; // 強化を一度でも始めたか（練習 2 の達成条件）
    this.invulnT = fresh ? 0 : sec(C.invulnSec);
    this.prevEdge = -1;
    this.latch = [true, true]; // 入力解除: 一度スティックを離すまで、その自機は動かない
    this.setPhase('intro', sec(C.introSec));
    this.emit('stage', { index: i, number: def.number, name: def.name, lesson: !!def.lesson, restart: !fresh });
  }

  loadBonus(type) {
    const b = BONUS[type];
    this.kind = 'bonus';
    this.bonus = { type, def: b, t: sec(C.bonusSec), points: 0, done: false, k: 0, showT: 0, spot: null, results: [] };
    this.pegs = b.pegs;
    this.rope = new Rope(this.pegs);
    this.red = mover({ x: 9, y: 16.6 });
    this.blue = mover({ x: 15, y: 16.6 });
    this.enemies = [];
    this.plants = [];
    this.treasure = null; this.chest = null; this.gems = []; this.gemsGot = 0;
    this.mush = [];
    if (type === 'memory') {
      this.bonus.spot = { ...b.spots[Math.floor(this.rng.next() * b.spots.length)] };
      this.bonus.showT = sec(b.showSec);
    } else if (type === 'harvest') {
      this.mush = b.mushPos.map((p, id) => ({ id, kind: 'mush', hx: p.x, hy: p.y, ...mover(p), a: id, alive: true }));
    }
    this.powerT = 0; this.invulnT = 0; this.prevEdge = -1;
    this.latch = [true, true];
    this.setPhase('bonusIntro', sec(C.bonusIntroSec));
    this.emit('bonusStart', { bonus: type, name: b.name }); // type はイベント名と重なるので bonus に入れる
  }

  setPhase(p, t = 0) { this.phase = p; this.phaseT = t; this.phaseLen = t; }
  emit(type, data = {}) { this.events.push({ type, tick: this.tick, ...data }); }

  // ───────────── 1 tick ─────────────
  /** @param {{r:{x:number,y:number}, b:{x:number,y:number}}} input  各自機の方向（長さ 1 以下に正規化される） */
  step(input) {
    this.events.length = 0;
    this.tick++;
    for (const o of this.movers()) { o.px = o.x; o.py = o.y; }
    switch (this.phase) {
      case 'intro': if (--this.phaseT <= 0) { this.setPhase('play'); this.emit('go'); } this.latchInput(input); break;
      case 'bonusIntro': if (--this.phaseT <= 0) { this.setPhase('bonus'); this.emit('go'); } this.latchInput(input); break;
      case 'play': this.simulate(input, false); break;
      case 'bonus': this.simulate(input, true); break;
      case 'miss':
        if (--this.phaseT <= 0) {
          if (this.lives > 0) { this.score = this.stageStartScore; this.loadStage(this.stageIndex, false); }
          else { this.setPhase('gameover'); this.finish(false); this.emit('gameover'); }
        }
        break;
      case 'clear':
        if (--this.phaseT <= 0) {
          if (this.pendingBonus) { this.pendingBonus = false; this.loadBonus(this.def.bonus); }
          else this.nextStage();
        }
        break;
      case 'bonusEnd': if (--this.phaseT <= 0) this.nextStage(); break;
      default: break; // gameover / complete
    }
  }

  nextStage() {
    this.stageIndex++;
    if (this.mode === 'stagePractice' || this.stageIndex >= this.stageCount) {
      this.setPhase('complete'); this.finish(true); this.emit('complete');
    } else this.loadStage(this.stageIndex, true);
  }

  finish(cleared) {
    this.result = { score: this.score, stage: Math.min(this.stageIndex, this.stageCount - 1) + 1, cleared, difficulty: this.diffId, mode: this.mode, stats: { ...this.stats } };
  }

  latchInput(input) {
    const v = [input?.r, input?.b];
    for (let i = 0; i < 2; i++) if (this.latch[i] && (!v[i] || Math.hypot(v[i].x, v[i].y) < 0.2)) this.latch[i] = false;
  }

  movers() { return [this.red, this.blue, ...this.mush, ...this.enemies, ...this.gems]; }

  simulate(input, isBonus) {
    this.latchInput(input);
    // ① 移動と閉領域
    const before = this.rope.anchors.length;
    this.moveEnd(this.red, this.latch[0] ? null : input?.r, true);
    this.moveEnd(this.blue, this.latch[1] ? null : input?.b, false);
    const after = this.rope.anchors.length;
    if (after > before) this.emit('wrap', { n: after });
    else if (after < before) this.emit('unwrap', { n: after });
    this.moveMush();
    this.moveEnemies();
    this.moveGems();
    if (this.chest && !this.chest.spawned && ++this.chest.t >= sec(0.8)) this.spawnGems();
    const loops = this.detectLoops();

    // ② 捕獲と回復
    for (const poly of loops) this.captureIn(poly, isBonus);
    this.growPlants();
    if (!isBonus && this.energy >= C.energyMax && this.powerT === 0) {
      this.powerT = sec(C.powerSec); this.energy = C.energyMax; this.powerUsed = true; this.emit('power');
    }

    // ③ 接触とエネルギー
    let miss = null;
    if (!isBonus) {
      if (this.powerT > 0) {
        if (--this.powerT === 0) { this.energy = C.powerEndEnergy; this.emit('powerEnd'); }
      }
      if (this.invulnT > 0) this.invulnT--;
      if (this.powerT === 0 && this.invulnT === 0) {
        const hitR = C.playerRadius + C.enemyRadius;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          for (const [who, p] of [['red', this.red], ['blue', this.blue]]) {
            if (sweptMinDist({ x: p.px, y: p.py }, p, { x: e.px, y: e.py }, e) < hitR) { miss = miss || { who, cause: 'enemy', enemy: e.id }; }
          }
        }
      }
      if (this.powerT === 0 && this.drainMul > 0) {
        this.energy -= C.energyDrain * this.drainMul * DT;
        if (this.energy <= 0) { this.energy = 0; miss = miss || { who: 'both', cause: 'energy' }; }
      }
    } else {
      this.tickBonus();
    }

    // ④ ミス（同じ tick に 2 体が当たっても 1 回だけ）
    if (miss) {
      if (Number.isFinite(this.lives)) this.lives--;
      this.stats.misses++;
      this.rope.reset();
      this.setPhase('miss', sec(C.missSec));
      this.emit('miss', miss);
      return;
    }

    // ⑤ クリア
    if (isBonus) {
      if (this.bonus.done || this.bonus.t <= 0) {
        this.score += this.bonus.points;
        this.stats.bonuses++;
        this.setPhase('bonusEnd', sec(C.bonusEndSec));
        this.emit('bonusEnd', { points: this.bonus.points, success: this.bonus.points > 0 });
      }
      return;
    }
    const allMush = this.mush.every((m) => !m.alive);
    const allGems = this.gemsGot === (1 << C.gemCount) - 1;
    const goal = this.def.lesson ? ['mush', 'power', 'gems'][this.def.index] : 'any';
    let clear = false, bonus = false;
    if (goal === 'any') { clear = allMush || allGems; bonus = allGems && !!this.def.bonus; }
    else if (goal === 'mush') clear = allMush;
    else if (goal === 'power') clear = allMush && this.powerUsed;
    else if (goal === 'gems') clear = allGems;
    if (clear) {
      this.pendingBonus = bonus && this.mode !== 'stagePractice';
      this.stats.stagesCleared++;
      this.rope.reset();
      this.setPhase('clear', sec(C.clearSec));
      this.emit('clear', { bonus: this.pendingBonus, byGems: allGems });
    }
  }

  moveEnd(p, v, isRed) {
    let vx = v ? v.x : 0, vy = v ? v.y : 0;
    const l = Math.hypot(vx, vy);
    if (l > 1) { vx /= l; vy /= l; }
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) { vx = 0; vy = 0; }
    const s = C.playerSpeed * DT;
    const p0 = { x: p.x, y: p.y };
    p.x = clamp(p.x + vx * s, R, BOARD.w - R);
    p.y = clamp(p.y + vy * s, R, BOARD.h - R);
    if (p.x === p0.x && p.y === p0.y) return;
    if (isRed) this.rope.moveRed(p0, p, this.blue); else this.rope.moveBlue(p0, p, this.red);
  }

  moveMush() {
    const sp = C.mushWanderSpeed * DT;
    for (const m of this.mush) {
      if (!m.alive) continue;
      m.a += (this.rng.next() - 0.5) * 0.5;
      const dx = m.hx - m.x, dy = m.hy - m.y;
      if (dx * dx + dy * dy > C.mushWanderRadius ** 2) m.a = Math.atan2(dy, dx);
      m.x += Math.cos(m.a) * sp; m.y += Math.sin(m.a) * sp;
    }
  }

  moveEnemies() {
    const mul = this.enemyMul;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.kind === 'patrol') {
        let budget = C.patrolSpeed * mul * DT;
        for (let guard = 0; guard < 4 && budget > 1e-9; guard++) {
          const ni = e.seg + e.dir;
          if (ni < 0 || ni >= e.path.length) { e.dir = -e.dir; continue; }
          const t = e.path[ni], dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
          if (d <= budget) { e.x = t.x; e.y = t.y; e.seg = ni; budget -= d; }
          else { e.x += (dx / d) * budget; e.y += (dy / d) * budget; e.h = Math.atan2(dy, dx); budget = 0; }
        }
      } else {
        if ((this.tick - 1) % C.chaserRetargetTicks === 0) {
          const dr = dist2(e.x, e.y, this.red.x, this.red.y), db = dist2(e.x, e.y, this.blue.x, this.blue.y);
          e.target = db < dr ? 1 : 0; // 同距離なら ID 順（赤 = 0）
        }
        const t = e.target ? this.blue : this.red;
        const want = Math.atan2(t.y - e.y, t.x - e.x);
        let d = want - e.h;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const maxTurn = C.chaserTurnRate * DT;
        e.h += clamp(d, -maxTurn, maxTurn);
        const s = C.chaserSpeed * mul * DT;
        e.x = clamp(e.x + Math.cos(e.h) * s, 0.4, BOARD.w - 0.4);
        e.y = clamp(e.y + Math.sin(e.h) * s, 0.4, BOARD.h - 0.4);
      }
    }
  }

  spawnGems() {
    this.chest.spawned = true;
    const base = this.rng.next() * Math.PI * 2;
    for (let i = 0; i < C.gemCount; i++) {
      const a = base + (i / C.gemCount) * Math.PI * 2 + (this.rng.next() - 0.5) * 0.4;
      this.gems.push({ id: i, kind: 'gem', mark: C.gemMarks[i], ...mover(this.chest), vx: Math.cos(a), vy: Math.sin(a), alive: true });
    }
    this.emit('gemsOut');
  }

  moveGems() {
    const s = C.gemSpeed * DT, m = 0.4;
    for (const g of this.gems) {
      if (!g.alive) continue;
      g.x += g.vx * s; g.y += g.vy * s;
      if (g.x < m) { g.x = 2 * m - g.x; g.vx = Math.abs(g.vx); }
      if (g.x > BOARD.w - m) { g.x = 2 * (BOARD.w - m) - g.x; g.vx = -Math.abs(g.vx); }
      if (g.y < m) { g.y = 2 * m - g.y; g.vy = Math.abs(g.vy); }
      if (g.y > BOARD.h - m) { g.y = 2 * (BOARD.h - m) - g.y; g.vy = -Math.abs(g.vy); }
    }
  }

  growPlants() {
    for (const p of this.plants) {
      if (p.grow >= 2) continue;
      p.t++;
      const g = p.t >= sec(C.plantMatureSec) ? 2 : p.t >= sec(C.plantSproutSec) ? 1 : 0;
      if (g !== p.grow) { p.grow = g; this.emit('grow', { id: p.id, grow: g }); }
    }
  }

  // ───────────── 閉領域の成立 ─────────────
  /** その tick に新しく閉じた領域（単純多角形）の列。1 つでも成立したらラインを両端間の直線に張り直す */
  detectLoops() {
    const loops = [];
    const pts = this.rope.points(this.red, this.blue, this._pts);
    const nA = this.rope.anchors.length;
    const edge = sameEdge(this.red, this.blue);
    const risingEdge = edge >= 0 && edge !== this.prevEdge;
    this.prevEdge = edge;

    // (a) 両端が出会った: 折れ線全体が閉じる
    if (nA >= 2 && Math.hypot(this.red.x - this.blue.x, this.red.y - this.blue.y) < C.endMeetDist) {
      const poly = pts.map((p) => ({ x: p.x, y: p.y }));
      if (area(poly) >= C.minLoopArea) loops.push(poly);
    }
    // (b) 両端が外周の同じ辺に到達: 折れ線と、その辺の区間で閉じる
    if (!loops.length && risingEdge && nA >= 1) {
      const poly = pts.map((p) => ({ x: p.x, y: p.y }));
      poly.push(projEdge(this.blue, edge), projEdge(this.red, edge));
      if (area(poly) >= C.minLoopArea) loops.push(poly);
    }
    // (c) 自己交差と、端が既存ラインに触れる。小さい輪から順に切り出す（8 の字は 2 つの輪になり、盤面全体にはならない）
    if (!loops.length) {
      let work = pts.map((p) => ({ x: p.x, y: p.y }));
      for (let iter = 0; iter < 8 && work.length >= 4; iter++) {
        const hit = findClosure(work);
        if (!hit) break;
        if (area(hit.poly) >= C.minLoopArea) loops.push(hit.poly);
        work = hit.rest;
      }
    }
    if (loops.length) { this.rope.reset(); this.prevEdge = edge; }
    return loops;
  }

  // ───────────── 捕獲 ─────────────
  captureIn(poly, isBonus) {
    const a = area(poly);
    const tol = C.boundaryTol;
    const got = [];
    let base = 0, n = 0;
    for (const m of this.mush) if (m.alive && pointInPoly(m, poly, tol)) { m.alive = false; got.push({ kind: 'mush', id: m.id, x: m.x, y: m.y }); base += C.pts.mush; n++; }
    for (const e of this.enemies) if (e.alive && pointInPoly(e, poly, tol)) { e.alive = false; got.push({ kind: e.kind, id: e.id, x: e.x, y: e.y }); base += e.kind === 'chaser' ? C.pts.chaser : C.pts.patrol; n++; }
    const mult = multiplier(n);
    let points = Math.floor(base * mult);
    // 倍率の対象外: 植物・宝箱・宝
    for (const p of this.plants) {
      if (!pointInPoly(p, poly, tol)) continue;
      if (p.grow > 0) {
        const heal = p.grow === 2 ? C.plantHealMature : C.plantHealSprout;
        if (this.powerT === 0) this.energy = Math.min(C.energyMax, this.energy + heal);
        got.push({ kind: 'plant', id: p.id, x: p.x, y: p.y, heal, grow: p.grow });
        this.emit('plant', { id: p.id, heal, grow: p.grow });
        points += C.pts.plant;
      }
      p.grow = 0; p.t = 0; // 芽のない地点を囲み直しても回復しない
    }
    if (this.treasure && !this.treasure.found && pointInPoly(this.treasure, poly, tol)) {
      if (a <= C.treasureMaxArea) {
        this.treasure.found = true;
        this.chest = { x: this.treasure.x, y: this.treasure.y, t: 0, spawned: false };
        points += C.pts.chest; this.stats.chests++;
        got.push({ kind: 'chest', x: this.chest.x, y: this.chest.y });
        this.emit('chest', { x: this.chest.x, y: this.chest.y });
      } else this.emit('hint', { poly, area: a });
    }
    for (const g of this.gems) {
      if (g.alive && pointInPoly(g, poly, tol)) {
        g.alive = false; this.gemsGot |= 1 << g.id; points += C.pts.gem;
        got.push({ kind: 'gem', id: g.id, mark: g.mark, x: g.x, y: g.y });
        this.emit('gem', { id: g.id, mark: g.mark, count: popcount(this.gemsGot) });
      }
    }
    if (isBonus) points += this.bonusCapture(poly, a);
    if (isBonus && this.bonus.type === 'harvest') { this.bonus.points += points; points = 0; }
    this.score += isBonus ? 0 : points;
    this.stats.captures++;
    if (mult > this.stats.bestMult) this.stats.bestMult = mult;
    this.emit('capture', { poly, area: a, n, mult, points: isBonus && this.bonus.type === 'harvest' ? Math.floor(base * mult) : points, items: got });
  }

  bonusCapture(poly, a) {
    const b = this.bonus, d = b.def;
    if (b.done) return 0;
    if (b.type === 'memory' && pointInPoly(b.spot, poly, C.boundaryTol)) {
      if (a <= d.maxArea) { const p = a <= d.goodArea ? 3000 : 1500; b.points += p; b.done = true; this.emit('bonusHit', { points: p, x: b.spot.x, y: b.spot.y }); }
      else this.emit('hint', { poly, area: a, tooBig: true });
    } else if (b.type === 'precision') {
      const t = d.targets[b.k];
      if (pointInPoly(t, poly, C.boundaryTol)) {
        if (a <= d.maxArea) {
          const p = Math.floor(500 + 2000 * (1 - a / d.maxArea));
          b.points += p; b.results.push(p); b.k++;
          this.emit('bonusHit', { points: p, x: t.x, y: t.y });
          if (b.k >= d.targets.length) b.done = true;
        } else this.emit('hint', { poly, area: a, tooBig: true });
      }
    }
    return 0;
  }

  tickBonus() {
    const b = this.bonus;
    if (b.showT > 0) b.showT--;
    if (b.t > 0) b.t--;
    if (b.type === 'harvest' && this.mush.every((m) => !m.alive)) b.done = true;
  }

  // ───────────── 再現試験・保存用 ─────────────
  hash() {
    const r = (v) => Math.round(v * 1e6);
    const parts = [this.tick, this.phase, this.phaseT, this.score, this.lives, r(this.energy), this.powerT, this.invulnT, this.rng.s, this.stageIndex, this.kind,
      r(this.red.x), r(this.red.y), r(this.blue.x), r(this.blue.y), this.rope.snapshot().join('.'), this.gemsGot];
    for (const o of [...this.mush, ...this.enemies, ...this.gems]) parts.push(o.alive ? 1 : 0, r(o.x), r(o.y));
    for (const p of this.plants) parts.push(p.grow, p.t);
    return fnv(parts.join(','));
  }

}

/**
 * 折れ線 work（赤 → … → 青）から、いちばん小さい閉じた輪を 1 つ探す。
 * 戻り値: { poly, rest }（rest は輪を取り除いた残りの折れ線。続けて探すのに使う）
 */
export function findClosure(work) {
  const m = work.length - 1; // 線分の数
  let best = null;
  const consider = (span, make) => { if (!best || span < best.span) best = { span, make }; };
  // 非隣接線分の真の交差
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      const X = properIntersect(work[i], work[i + 1], work[j], work[j + 1]);
      if (X) consider(j - i, () => ({ poly: [{ x: X.x, y: X.y }, ...work.slice(i + 1, j + 1)], rest: [...work.slice(0, i + 1), { x: X.x, y: X.y }, ...work.slice(j + 1)] }));
    }
  }
  // 赤の端（work[0]）が線分 k（k ≥ 2）に触れた
  const tt = C.touchTol * C.touchTol;
  for (let k = 2; k < m; k++) {
    const c = closestOnSeg(work[0], work[k], work[k + 1]);
    if (c.d2 <= tt) consider(k, () => ({ poly: [{ x: c.x, y: c.y }, ...work.slice(1, k + 1)], rest: [work[0], ...work.slice(k + 1)] }));
  }
  // 青の端（work[m]）が線分 k（k ≤ m-3）に触れた
  for (let k = 0; k <= m - 3; k++) {
    const c = closestOnSeg(work[m], work[k], work[k + 1]);
    if (c.d2 <= tt) consider(m - 1 - k, () => ({ poly: [{ x: c.x, y: c.y }, ...work.slice(k + 1, m)], rest: [...work.slice(0, k + 1), work[m]] }));
  }
  return best ? best.make() : null;
}

function mover(p) { return { x: p.x, y: p.y, px: p.x, py: p.y }; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function popcount(v) { let n = 0; while (v) { n += v & 1; v >>= 1; } return n; }

/** 両端が同じ外周の辺にいれば辺の番号（0 上・1 右・2 下・3 左）、いなければ -1 */
export function sameEdge(a, b) {
  const t = C.edgeTol + R;
  const on = (p) => [p.y <= t, p.x >= BOARD.w - t, p.y >= BOARD.h - t, p.x <= t];
  const ea = on(a), eb = on(b);
  for (let i = 0; i < 4; i++) if (ea[i] && eb[i]) return i;
  return -1;
}
function projEdge(p, e) {
  if (e === 0) return { x: p.x, y: 0 };
  if (e === 1) return { x: BOARD.w, y: p.y };
  if (e === 2) return { x: p.x, y: BOARD.h };
  return { x: 0, y: p.y };
}

export { STAGES, BONUS, LESSONS, C, BOARD, DIFFICULTY };
