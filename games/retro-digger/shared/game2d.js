// 2D アーケードモードのロジック（地下断面・4 方向グリッド移動）。描画・音・入力機器には依存しない。
// 1 tick = RULES.tick 秒の固定刻み。処理順は固定:
//   ① 主人公の移動と掘削 → ② ポンプ（命中・送気・破裂） → ③ 岩（支え・予兆・落下・押しつぶし）
//   → ④ 敵（移動・通り抜け・炎） → ⑤ 主人公への当たり（倒れた敵・膨張中の敵・通り抜け中の敵は当たらない）→ ⑥ クリア判定
import { RULES, TUNE2D, DIFFICULTIES } from './config.js';
import { parse2D, STAGES_2D } from './stages.js';
import { makeRng, makeInflate, inflateUpdate, inflateRecovering, makePump, pumpTick, pumpDetach, pumpReset,
  makeScore, makeRockState, rockLoosen, rockTick, rockLand, rockAddKill, scoreDig, scoreAdd, scoreExtra } from './rules.js';

const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const EPS = 1e-6;

export function createGame2D({ difficulty = 'normal', stageIndex = 0, lives, score, seed = 1, tutorial = false, stages = STAGES_2D } = {}) {
  const diff = DIFFICULTIES[difficulty];
  const g = {
    mode: '2d', diff, stageIndex, stages, tutorial,
    rng: makeRng(seed + stageIndex * 7919),
    lives: lives ?? diff.lives,
    score: score || makeScore(), time: 0, phase: 'ready', phaseT: 0, // ready → play → miss → (play) → clear | over
    events: [], popups: [], fx: [],
    board: null, player: null, enemies: [], rocks: [], fires: [], pump: makePump(),
    tut: tutorial ? { step: 0, done: false } : null,
  };
  loadStage(g);
  return g;
}

function loadStage(g) {
  const st = g.stages[g.stageIndex];
  const b = parse2D(st);
  b.stamps = []; b.stampSet = new Set(); b.version = 0;
  b.theme = st.theme; b.name = st.name; b.goal = st.goal;
  g.board = b;
  // 最初から掘られている通路を刻む
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    const i = r * b.cols + c;
    if (b.open[i] && r > 0) stampLine(b, c, r, c, r);
    if (b.h[i] && r > 0) stampLine(b, c, r, c + 1, r);
    if (b.v[i] && r > 0) stampLine(b, c, r, c, r + 1);
  }
  g.player = { x: b.start.c, y: b.start.r, px: b.start.c, py: b.start.r, face: 'right', moving: false, walk: 0, dead: false, guard: 0, anim: 0, digT: 0 };
  g.enemies = b.enemies.map((e, k) => makeEnemy(g, e, k));
  g.rocks = b.rocks.map((r) => ({ c: r.c, r: r.r, y: r.r, py: r.r, ...makeRockState(), wob: 0 }));
  g.fires = [];
  g.phase = 'ready'; g.phaseT = 0;
  pumpReset(g.pump);
  emit(g, 'stage-start', { stage: g.stageIndex });
}

function makeEnemy(g, e, k) {
  return { id: k, type: e.type, sx: e.c, sy: e.r, x: e.c, y: e.r, px: e.c, py: e.r, face: k % 2 ? 'left' : 'right',
    state: 'wait', t: 0, wake: RULES.enemyWakeDelay + k * 0.25, inf: makeInflate(), tx: e.c, ty: e.r,
    noPath: 0, ghostIn: g.rng.range(...TUNE2D.ghostEvery), fireCool: 1.5 + g.rng.next() * 2, fireDir: null, alive: true, anim: g.rng.next() * 10 };
}

const emit = (g, type, data = {}) => g.events.push({ type, ...data });
const idx = (b, c, r) => r * b.cols + c;
const inside = (b, c, r) => c >= 0 && r >= 0 && c < b.cols && r < b.rows;
export const isOpen = (b, c, r) => inside(b, c, r) && b.open[idx(b, c, r)] === 1;

// 2 つの隣り合うセルの間がつながっているか
export function edgeOpen(b, c1, r1, c2, r2) {
  if (!inside(b, c1, r1) || !inside(b, c2, r2)) return false;
  if (r1 === r2) { const c = Math.min(c1, c2); return b.h[idx(b, c, r1)] === 1; }
  const r = Math.min(r1, r2); return b.v[idx(b, c1, r)] === 1;
}
function openEdge(b, c1, r1, c2, r2) {
  if (r1 === r2) b.h[idx(b, Math.min(c1, c2), r1)] = 1; else b.v[idx(b, c1, Math.min(r1, r2))] = 1;
  b.version++;
}
// 描画用の掘削跡（1/8 セル単位の点）。描画側は stamps を順に読む
function stamp(b, x, y) {
  if (y < 0.5) return; // 地表の上には跡を付けない
  const k = Math.round(x * 8) + ',' + Math.round(y * 8);
  if (b.stampSet.has(k)) return;
  b.stampSet.add(k); b.stamps.push([Math.round(x * 8) / 8, Math.round(y * 8) / 8]);
}
function stampLine(b, x1, y1, x2, y2) {
  const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 8));
  for (let i = 0; i <= n; i++) stamp(b, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n);
}

// そのセルをふさいでいる岩（支えあり・揺れ・落下・着地して崩れる途中）
const rockAt = (g, c, r) => g.rocks.find((k) => k.state !== 'gone' && k.c === c && Math.round(k.y) === r);

// ---------------------------------------------------------------
export function step(g, input) {
  g.events.length = 0;
  const dt = RULES.tick;
  g.time += dt; g.phaseT += dt;
  for (const p of g.popups) p.t += dt;
  g.popups = g.popups.filter((p) => p.t < 1.2);
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter((f) => f.t < f.life);
  const P = g.player; P.px = P.x; P.py = P.y;
  for (const e of g.enemies) { e.px = e.x; e.py = e.y; }
  for (const r of g.rocks) r.py = r.y;

  if (g.phase === 'ready') { if (g.phaseT >= 1.2) { g.phase = 'play'; g.phaseT = 0; } return g; }

  if (g.phase === 'miss') {
    // ミス演出中: 敵と炎は止める。落下中の岩だけは着地まで進める（着地前に復活させない）
    updateRocks(g, dt, true);
    if (g.phaseT >= RULES.missDuration && !g.rocks.some((r) => r.state === 'fall' || r.state === 'loose')) respawn(g);
    return g;
  }

  if (g.phase !== 'play') return g; // clear / over / done など
  // ---- play ----
  P.guard = Math.max(0, P.guard - dt);
  const dir = input.dir;
  const moving = !!dir && !(g.pump.state === 'attached' && input.pump);
  // ① 移動と掘削（ポンプを出している間は動かない）
  if (g.pump.state === 'idle' || (g.pump.state === 'attached' && moving)) {
    if (g.pump.state === 'attached') pumpDetach(g.pump, hooks(g), (t, d) => emit(g, t, d));
    if (dir) movePlayer(g, dir, dt); else P.moving = false;
  } else P.moving = false;
  // ② ポンプ
  pumpTick(g.pump, { pump: input.pump, moving: false }, dt,
    { range: TUNE2D.pumpRange, speed: TUNE2D.pumpSpeed, interval: RULES.pumpInterval, max: g.diff.pumpsToPop }, hooks(g),
    (t, d) => onPumpEvent(g, t, d));
  // 膨張の時間経過（収縮）
  for (const e of g.enemies) {
    if (!e.alive || e.state === 'pop') continue;
    const r = inflateUpdate(e.inf, dt);
    if (r === 'deflate') emit(g, 'deflate', { enemy: e });
    if (r === 'recovered') { e.state = 'walk'; e.t = 0; snapEnemy(e); }
    if (inflateRecovering(e.inf) && !e.warned) { e.warned = true; emit(g, 'recover-warn', { enemy: e }); }
    if (e.inf.stage > 1) e.warned = false;
  }
  // ③ 岩
  updateRocks(g, dt, false);
  // ④ 敵
  for (const e of g.enemies) updateEnemy(g, e, dt);
  updateFires(g, dt);
  // ⑤ 主人公への当たり
  if (!P.dead && P.guard <= 0) checkPlayerHit(g);
  // ⑥ クリア
  if (!P.dead && g.phase === 'play' && g.enemies.every((e) => !e.alive) && !g.rocks.some((r) => r.state === 'fall')) stageClear(g);
  if (scoreExtra(g.score)) { g.lives++; emit(g, 'extra'); }
  if (g.tut) tutorialTick(g);
  return g;
}

function hooks(g) {
  const P = g.player;
  return {
    advance(len) {
      // 主人公から向いている方向へ len セル伸ばす。土（つながっていない境目）で止まる
      const [dx, dy] = DV[P.face];
      let x = P.x, y = P.y;
      const tx = P.x + dx * len, ty = P.y + dy * len;
      // セル境界ごとに、つながりを確かめる
      const steps = Math.ceil(len * 4);
      for (let i = 1; i <= steps; i++) {
        const nx = P.x + dx * len * i / steps, ny = P.y + dy * len * i / steps;
        const c1 = Math.round(x), r1 = Math.round(y), c2 = Math.round(nx), r2 = Math.round(ny);
        if (c1 !== c2 || r1 !== r2) {
          if (!edgeOpen(g.board, c1, r1, c2, r2) || rockAt(g, c2, r2)) return { hit: null, blocked: true, tip: [x, y] };
        }
        for (const e of g.enemies) {
          if (!e.alive || e.state === 'ghost' || e.state === 'ghostWarn' || e.state === 'pop' || e.state === 'crushed') continue;
          if (Math.abs(e.x - nx) < 0.55 && Math.abs(e.y - ny) < 0.55) return { hit: e, blocked: false };
        }
        x = nx; y = ny;
      }
      return { hit: null, blocked: false, tip: [tx, ty] };
    },
    valid(e) { return e.alive && e.state !== 'pop' && e.state !== 'crushed' && Math.hypot(e.x - P.x, e.y - P.y) <= TUNE2D.pumpRange + 0.6; },
    inflate(e) { return e.inf; },
  };
}

function onPumpEvent(g, t, d) {
  const e = d && d.enemy;
  if (t === 'pump-hit' && e) { e.state = 'inflated'; e.fireDir = null; g.fires = g.fires.filter((f) => f.owner !== e); }
  if (t === 'pump-air' && e) e.state = 'inflated';
  if (t === 'pop' && e) {
    e.state = 'pop'; e.t = 0; e.alive = false;
    const pts = e.type === 'fire' ? RULES.score.fire : RULES.score.chaser;
    scoreAdd(g.score, pts); g.popups.push({ x: e.x, y: e.y, text: String(pts), t: 0 });
    g.fx.push({ kind: 'pop', x: e.x, y: e.y, t: 0, life: 0.6, type: e.type });
  }
  emit(g, t, { ...d, stage: e ? e.inf.stage : 0 });
}

// ---------- 主人公の移動 ----------
function movePlayer(g, dir, dt) {
  const P = g.player, b = g.board;
  let dist = TUNE2D.playerSpeed * dt;
  const horiz = dir === 'left' || dir === 'right';
  // 曲がるとき: 今の軸で最寄りの格子点へ寄せてから曲がる（角への引っ掛かりを防ぐ）
  for (let guard = 0; guard < 3 && dist > EPS; guard++) {
    const offX = P.x - Math.round(P.x), offY = P.y - Math.round(P.y);
    if (horiz && Math.abs(offY) > EPS) {
      const toward = offY > 0 ? 'up' : 'down';
      const d = Math.min(dist, Math.abs(offY));
      if (!tryMove(g, toward, d)) break;
      dist -= d; continue;
    }
    if (!horiz && Math.abs(offX) > EPS) {
      const toward = offX > 0 ? 'left' : 'right';
      const d = Math.min(dist, Math.abs(offX));
      if (!tryMove(g, toward, d)) break;
      dist -= d; continue;
    }
    P.face = dir;
    tryMove(g, dir, dist); dist = 0;
  }
  P.moving = true; P.walk += dt;
}
// d セルだけ動く（壁・岩で止まる）。動けたら true
function tryMove(g, dir, d) {
  const P = g.player, b = g.board;
  const [dx, dy] = DV[dir];
  const nx = P.x + dx * d, ny = P.y + dy * d;
  // 盤の外
  if (nx < -EPS || ny < -EPS || nx > b.cols - 1 + EPS || ny > b.rows - 1 + EPS) {
    P.x = Math.max(0, Math.min(b.cols - 1, nx)); P.y = Math.max(0, Math.min(b.rows - 1, ny)); P.face = dir; return false;
  }
  // 行き先のセル（先端が 0.5 を超えたら隣のセル）。岩があれば入れない
  const lead = 0.5;
  const fc = Math.round(P.x + dx * (d + lead - EPS)), fr = Math.round(P.y + dy * (d + lead - EPS));
  const rk = rockAt(g, fc, fr);
  if (rk && !(fc === Math.round(P.x) && fr === Math.round(P.y))) {
    // 岩の手前（セルの中心）まで
    const cx = Math.round(P.x), cy = Math.round(P.y);
    P.x = dx ? (dx > 0 ? Math.min(nx, cx) : Math.max(nx, cx)) : P.x; P.y = dy ? (dy > 0 ? Math.min(ny, cy) : Math.max(ny, cy)) : P.y;
    P.face = dir; return false;
  }
  const oc = Math.round(P.x), orr = Math.round(P.y);
  P.x = nx; P.y = ny; P.face = dir;
  const c = Math.round(P.x), r = Math.round(P.y);
  // 掘削の跡と、セル・つながりの更新
  stamp(b, P.x, P.y);
  if (c !== oc || r !== orr) {
    if (!b.open[idx(b, c, r)]) {
      b.open[idx(b, c, r)] = 1; b.version++;
      if (r > 0) { const pts = scoreDig(g.score, `${g.stageIndex}:${c}:${r}`); if (pts) emit(g, 'dig', { c, r }); }
    }
    if (!edgeOpen(b, oc, orr, c, r)) openEdge(b, oc, orr, c, r);
  }
  // 掘っている最中（土の中を進む）の印（音・粉じん用）
  if (r > 0 && !edgeOpen(b, oc, orr, Math.round(P.x + dx * 0.6), Math.round(P.y + dy * 0.6))) P.digT += RULES.tick;
  return true;
}

// ---------- 岩 ----------
function updateRocks(g, dt, missPhase) {
  const P = g.player, b = g.board;
  for (const rk of g.rocks) {
    if (rk.state === 'gone') continue;
    if (rk.state === 'held' && !missPhase) {
      const below = isOpen(b, rk.c, rk.r + 1);
      // 主人公が真下にいる間は待つ（掘り上げた瞬間に落ちて逃げ場がない、を防ぐ）
      const under = Math.abs(P.x - rk.c) < 0.75 && P.y > rk.r + 0.2 && P.y < rk.r + 1.75;
      if (below && !under) { rockLoosen(rk); emit(g, 'rock-shake', { rock: rk }); }
    }
    rockTick(rk, dt, g.diff.warn, (t, d) => emit(g, t, d));
    if (rk.state === 'loose') rk.wob = rk.t;
    if (rk.state === 'fall') {
      const y0 = rk.y;
      const ny = rk.y + TUNE2D.rockFall * dt;
      // 次のセルが通路なら進む。土・底で止まる
      let y = ny; let landed = false;
      const nextRow = Math.floor(y0 + EPS) + 1;
      if (y >= nextRow - EPS) {
        if (nextRow < b.rows && isOpen(b, rk.c, nextRow) && !g.rocks.some((o) => o !== rk && o.state !== 'gone' && o.c === rk.c && Math.round(o.y) === nextRow)) {
          // 次のセルへ（さらに先が通路でなければ、そのセルの中心で止まる）
          const after = nextRow + 1;
          const canGo = after < b.rows && isOpen(b, rk.c, after);
          if (!canGo && y >= nextRow) { y = nextRow; landed = true; }
        } else { y = Math.floor(y0 + EPS); landed = true; }
      }
      rk.y = y;
      // 通った跡は掘られた扱い
      const rr = Math.round(rk.y);
      if (!b.open[idx(b, rk.c, rr)]) { b.open[idx(b, rk.c, rr)] = 1; b.version++; }
      for (let r = Math.round(y0); r < rr; r++) if (!edgeOpen(b, rk.c, r, rk.c, r + 1)) openEdge(b, rk.c, r, rk.c, r + 1);
      stampLine(b, rk.c, Math.max(0.5, y0), rk.c, rk.y);
      // 押しつぶし（通った範囲 y0..y 全体で判定し、速く落ちてもすり抜けない）
      const top = y0 - 0.55, bot = rk.y + 0.6;
      for (const e of g.enemies) {
        if (!e.alive && e.state !== 'crushed') continue;
        if (e.state === 'crushed' || e.state === 'pop') continue;
        if (Math.abs(e.x - rk.c) < 0.7 && e.y > top && e.y < bot) {
          e.alive = false; e.state = 'crushed'; e.rock = rk; e.t = 0; rockAddKill(rk, e);
          g.fires = g.fires.filter((f) => f.owner !== e);
          if (g.pump.target === e) pumpDetach(g.pump, hooks(g), () => {});
        }
      }
      if (!P.dead && P.guard <= 0 && Math.abs(P.x - rk.c) < 0.65 && P.y > top + 0.1 && P.y < bot - 0.05) { rk.hitPlayer = true; playerMiss(g, 'rock'); }
      for (const e of g.enemies) if (e.state === 'crushed' && e.rock === rk) e.y = rk.y + 0.35;
      if (landed) {
        const pts = rockLand(rk, (t, d) => emit(g, t, d));
        if (pts) { scoreAdd(g.score, pts); g.popups.push({ x: rk.c, y: rk.y, text: String(pts), t: 0, big: rk.kills.length > 1 }); }
        g.fx.push({ kind: 'dust', x: rk.c, y: rk.y + 0.4, t: 0, life: 0.8 });
      }
    }
  }
}

// ---------- 敵 ----------
// 主人公のいるセルから通路だけをたどる幅優先探索。dist[i] = 主人公までの歩数
function distanceField(g) {
  const b = g.board, P = g.player;
  if (g._df && g._dfv === b.version && g._dfc === Math.round(P.x) + ',' + Math.round(P.y)) return g._df;
  const n = b.rows * b.cols;
  const d = new Int16Array(n).fill(-1);
  const q = [];
  const sc = Math.round(P.x), sr = Math.round(P.y);
  d[idx(b, sc, sr)] = 0; q.push([sc, sr]);
  for (let qi = 0; qi < q.length; qi++) {
    const [c, r] = q[qi]; const dd = d[idx(b, c, r)];
    for (const k in DV) {
      const [dx, dy] = DV[k]; const nc = c + dx, nr = r + dy;
      if (!inside(b, nc, nr) || d[idx(b, nc, nr)] >= 0 || !edgeOpen(b, c, r, nc, nr) || rockAt(g, nc, nr)) continue;
      d[idx(b, nc, nr)] = dd + 1; q.push([nc, nr]);
    }
  }
  g._df = d; g._dfv = b.version; g._dfc = sc + ',' + sr;
  return d;
}
function snapEnemy(e) { e.x = Math.round(e.x); e.y = Math.round(e.y); e.tx = e.x; e.ty = e.y; }

function updateEnemy(g, e, dt) {
  e.anim += dt;
  if (!e.alive) { e.t += dt; return; }
  if (e.inf.stage > 0) { e.state = 'inflated'; return; } // 膨張中は止まる
  if (e.state === 'inflated') { e.state = 'walk'; snapEnemy(e); }
  const b = g.board, P = g.player;
  const spd = TUNE2D.enemySpeed * g.diff.enemySpeed * (e.type === 'fire' ? 0.85 : 1);
  e.t += dt;
  if (g.tut && !g.tut.enemiesMove) return;
  switch (e.state) {
    case 'wait': if (e.t >= e.wake) { e.state = 'walk'; e.t = 0; } return;
    case 'charge': // 火炎の溜め（向きは固定）
      if (e.t >= g.diff.warn) { e.state = 'breath'; e.t = 0; g.fires.push({ owner: e, x: e.x, y: e.y, dir: e.fireDir, len: 0, t: 0 }); emit(g, 'fire-breath', { enemy: e }); }
      return;
    case 'breath':
      if (e.t >= TUNE2D.fireTime) { e.state = 'walk'; e.t = 0; e.fireCool = g.diff.fireCooldown; e.fireDir = null; }
      return;
    case 'ghostWarn':
      if (e.t >= Math.max(0.6, g.diff.warn)) { e.state = 'ghost'; e.t = 0; emit(g, 'ghost-on', { enemy: e }); }
      return;
    case 'ghost': {
      // 土を通り抜けて主人公の方へ。実体に戻るのは「通路のセルの中心」に限る
      const df = distanceField(g);
      const tx = e.t > TUNE2D.ghostMax ? nearestReachable(g, e, df) : [P.x, P.y];
      const dx = tx[0] - e.x, dy = tx[1] - e.y, L = Math.hypot(dx, dy) || 1;
      const s = Math.min(L, TUNE2D.ghostSpeed * g.diff.enemySpeed * dt);
      e.x += dx / L * s; e.y += dy / L * s;
      e.x = Math.max(0, Math.min(b.cols - 1, e.x)); e.y = Math.max(1, Math.min(b.rows - 1, e.y));
      if (Math.abs(dx) > Math.abs(dy)) e.face = dx < 0 ? 'left' : 'right';
      const c = Math.round(e.x), r = Math.round(e.y);
      if (e.t > 1.0 && Math.abs(e.x - c) < 0.12 && Math.abs(e.y - r) < 0.12 && isOpen(b, c, r) && df[idx(b, c, r)] >= 0 && !rockAt(g, c, r)) {
        e.x = c; e.y = r; snapEnemy(e); e.state = 'land'; e.t = 0; e.noPath = 0; e.ghostIn = g.rng.range(...TUNE2D.ghostEvery);
        emit(g, 'ghost-off', { enemy: e });
      }
      return;
    }
    case 'land': if (e.t >= RULES.ghostLandGuard) { e.state = 'walk'; e.t = 0; } return;
  }
  // walk: セルの中心から中心へ
  const df = distanceField(g);
  const atCenter = Math.abs(e.x - e.tx) < EPS && Math.abs(e.y - e.ty) < EPS;
  if (atCenter) {
    const c = e.tx, r = e.ty;
    const here = df[idx(b, c, r)];
    if (here < 0) e.noPath += dt; else e.noPath = 0;
    e.ghostIn -= dt;
    // 通り抜けの判断（追跡型は経路がないとき・ときどき。火炎型は経路がないまま長いときだけ）
    const ghostWanted = e.type === 'chaser' ? (e.noPath > TUNE2D.ghostAfterNoPath || (e.ghostIn <= 0 && here > 6))
      : e.noPath > TUNE2D.ghostAfterNoPath * 2;
    if (ghostWanted) { e.state = 'ghostWarn'; e.t = 0; emit(g, 'ghost-warn', { enemy: e }); return; }
    // 火炎型: 同じ行で射程内（+1）なら、向きを決めて溜める
    if (e.type === 'fire') {
      e.fireCool -= dt;
      if (e.fireCool <= 0 && Math.abs(P.y - r) < 0.5 && Math.abs(P.x - c) <= TUNE2D.fireRange + 1 && r > 0) {
        e.fireDir = P.x < c ? 'left' : 'right'; e.face = e.fireDir;
        e.state = 'charge'; e.t = 0; emit(g, 'fire-charge', { enemy: e }); return;
      }
    }
    // 次のセル
    const opts = [];
    for (const k in DV) {
      const [dx, dy] = DV[k]; const nc = c + dx, nr = r + dy;
      if (!edgeOpen(b, c, r, nc, nr) || rockAt(g, nc, nr) || nr < 1 && e.type === 'fire') continue;
      opts.push({ k, nc, nr, d: df[idx(b, nc, nr)] });
    }
    if (!opts.length) { e.tx = c; e.ty = r; return; }
    let pick;
    if (here > 0 && (e.type === 'chaser' || g.rng.next() < 0.75)) {
      const best = opts.filter((o) => o.d >= 0).sort((a, b2) => a.d - b2.d)[0];
      pick = best || opts[0];
    } else {
      // 経路がない（または火炎型の気まぐれ）: 引き返さない方向から選ぶ
      const fwd = opts.filter((o) => o.k !== OPP[e.face]);
      pick = (fwd.length ? fwd : opts)[g.rng.int(fwd.length ? fwd.length : opts.length)];
    }
    e.tx = pick.nc; e.ty = pick.nr; e.face = pick.k;
  }
  const dx = e.tx - e.x, dy = e.ty - e.y, L = Math.abs(dx) + Math.abs(dy);
  const s = Math.min(L, spd * dt);
  if (L > EPS) { e.x += Math.sign(dx) * Math.min(Math.abs(dx), s); e.y += Math.sign(dy) * Math.min(Math.abs(dy), s); }
  if (Math.abs(e.x - e.tx) < EPS) e.x = e.tx; if (Math.abs(e.y - e.ty) < EPS) e.y = e.ty;
}
function nearestReachable(g, e, df) {
  const b = g.board; let best = null, bd = 1e9;
  for (let r = 1; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    if (df[idx(b, c, r)] < 0) continue;
    const d = Math.hypot(c - e.x, r - e.y);
    if (d < bd) { bd = d; best = [c, r]; }
  }
  return best || [g.player.x, g.player.y];
}

// 炎: 向いている方向へ伸びる。つながっていない境目（土）で止まる
function updateFires(g, dt) {
  const b = g.board;
  for (const f of g.fires) {
    f.t += dt;
    const max = TUNE2D.fireRange;
    f.len = Math.min(max, f.len + 12 * dt);
    // 土で切る
    const [dx] = DV[f.dir];
    let reach = 0;
    for (let i = 1; i <= Math.ceil(f.len); i++) {
      const c1 = Math.round(f.x) + dx * (i - 1), c2 = Math.round(f.x) + dx * i;
      if (!edgeOpen(b, c1, Math.round(f.y), c2, Math.round(f.y)) || rockAt(g, c2, Math.round(f.y))) { reach = Math.min(f.len, i - 1 + 0.35); break; }
      reach = Math.min(f.len, i);
    }
    f.reach = reach;
  }
  g.fires = g.fires.filter((f) => f.owner.alive && f.owner.state === 'breath');
}

function checkPlayerHit(g) {
  const P = g.player;
  for (const f of g.fires) {
    const [dx] = DV[f.dir];
    const a = f.x + dx * 0.4, z = f.x + dx * (f.reach + 0.2);
    const lo = Math.min(a, z), hi = Math.max(a, z);
    if (Math.abs(P.y - f.y) < 0.45 && P.x > lo - 0.3 && P.x < hi + 0.3 && f.reach > 0.1) { playerMiss(g, 'fire'); return; }
  }
  for (const e of g.enemies) {
    if (!e.alive || e.state === 'wait' || e.state === 'ghost' || e.state === 'ghostWarn' || e.state === 'land' || e.inf.stage > 0) continue;
    if (Math.abs(e.x - P.x) < 0.62 && Math.abs(e.y - P.y) < 0.62) { playerMiss(g, 'enemy'); return; }
  }
}
function playerMiss(g, cause) {
  const P = g.player;
  if (P.dead || g.phase !== 'play') return; // 多重ミスを防ぐ
  if (g.tut) { // チュートリアルでは残機を減らさず、開始位置へ戻すだけ
    pumpDetach(g.pump, hooks(g), () => {}); pumpReset(g.pump);
    P.x = P.px = g.board.start.c; P.y = P.py = g.board.start.r; P.guard = RULES.respawnGuard;
    emit(g, 'miss-soft', { cause }); return;
  }
  P.dead = true; P.cause = cause; g.phase = 'miss'; g.phaseT = 0;
  pumpDetach(g.pump, hooks(g), () => {}); pumpReset(g.pump);
  g.fires = [];
  for (const e of g.enemies) if (e.state === 'charge' || e.state === 'breath') { e.state = 'walk'; e.fireDir = null; e.fireCool = g.diff.fireCooldown; snapEnemy(e); }
  emit(g, 'miss', { cause });
}
function respawn(g) {
  const P = g.player, b = g.board;
  g.lives--;
  if (g.lives < 0) { g.lives = 0; g.phase = 'over'; g.phaseT = 0; emit(g, 'gameover'); return; }
  if (g.enemies.every((e) => !e.alive)) { P.dead = false; stageClear(g); return; }
  P.dead = false; P.x = P.px = b.start.c; P.y = P.py = b.start.r; P.face = 'right'; P.guard = RULES.respawnGuard;
  // 敵は初期位置へ戻し、膨張を解く（掘削地形・倒した敵・得点はそのまま）
  for (const e of g.enemies) if (e.alive) {
    e.x = e.px = e.sx; e.y = e.py = e.sy; snapEnemy(e); e.inf = makeInflate(); e.state = 'wait'; e.t = 0; e.wake = RULES.enemyWakeDelay; e.noPath = 0;
    e.ghostIn = g.rng.range(...TUNE2D.ghostEvery);
    // 初期位置が岩でふさがれていたら、近くの通路へ
    if (rockAt(g, e.x, e.y)) { const n = nearestOpen(g, e.x, e.y); e.x = e.px = n[0]; e.y = e.py = n[1]; snapEnemy(e); }
  }
  g.phase = 'play'; g.phaseT = 0;
  emit(g, 'respawn');
}
function nearestOpen(g, x, y) {
  const b = g.board; let best = [x, y], bd = 1e9;
  for (let r = 1; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (b.open[idx(b, c, r)] && !rockAt(g, c, r)) { const d = Math.hypot(c - x, r - y); if (d < bd && d > 0) { bd = d; best = [c, r]; } }
  return best;
}
function stageClear(g) {
  if (g.phase === 'clear') return;
  g.phase = 'clear'; g.phaseT = 0;
  if (!g.tut) { scoreAdd(g.score, RULES.score.clear); g.popups.push({ x: g.player.x, y: g.player.y - 1, text: 'CLEAR +1000', t: 0, big: true }); }
  pumpReset(g.pump);
  emit(g, 'clear');
}

// ---------- チュートリアル ----------
// 0: 光る印まで掘る → 1: 敵にポンプを当てて破裂させる → 2: 岩の下を掘って、落ちる岩で敵を倒す → 完了
export const TUTORIAL_2D = {
  name: 'れんしゅう', theme: 'soil', goal: '', map: [
    '==============',
    '######|#######',
    '######|#######',
    '######|#######',
    '######P#######',
    '##############',
    '##############',
    '##############',
    '#######-c--###',
    '##############',
    '##R###########',
    '##############',
    '#-c--#########',
    '##############',
    '##############',
    '##############',
  ],
};
export const TUTORIAL_STEPS_2D = [
  { text: '方向キーで掘り進もう。光る印まで掘ってみて', target: [6, 7] },
  { text: '敵の正面でポンプ（Space）。何回か押すと膨らんで破裂する', target: null },
  { text: '岩の真下を掘ると、少しして岩が落ちる。下の敵をつぶそう（岩の下にいると自分も危ない）', target: null },
  { text: 'よくできました！ 本番では、敵は道をたどって追いかけてくる', target: null },
];
function tutorialTick(g) {
  const t = g.tut, P = g.player;
  if (t.done) return;
  const e1 = g.enemies[0], e2 = g.enemies[1];
  if (t.step === 0) {
    const [c, r] = TUTORIAL_STEPS_2D[0].target;
    if (Math.round(P.x) === c && Math.round(P.y) === r) { t.step = 1; emit(g, 'tutorial-ok'); }
  } else if (t.step === 1) { if (!e1.alive) { t.step = 2; t.t = 0; emit(g, 'tutorial-ok'); } }
  else if (t.step === 2) { if (!e2.alive && e2.state === 'crushed') { t.step = 3; t.done = true; emit(g, 'tutorial-ok'); } }
}
export function createTutorial2D(opts = {}) {
  const g = createGame2D({ ...opts, stageIndex: 0, stages: [TUTORIAL_2D], tutorial: true });
  g.tutTargets = TUTORIAL_STEPS_2D.map((s) => s.target);
  return g;
}

// 次のステージへ（得点・残機は引き継ぐ）
export function nextStage(g) {
  if (g.stageIndex + 1 >= g.stages.length) { g.phase = 'done'; emit(g, 'allclear'); return false; }
  g.stageIndex++; g.rng = makeRng(77 + g.stageIndex * 7919);
  loadStage(g);
  return true;
}
