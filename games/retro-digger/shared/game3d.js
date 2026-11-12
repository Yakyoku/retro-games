// 3D（一人称の水平坑道）のロジック。通常 3D と VR で共通。描画・入力機器には依存しない。
// 座標: メートル。セル (gx, gz) の中心は ((gx+.5)*C, (gz+.5)*C)。床 y=0、天井 y=TUNE3D.height。
// 処理順（2D と同じ考え方）: ① 移動 → ② 掘削／ポンプ → ③ 岩 → ④ 敵・炎 → ⑤ 主人公への当たり → ⑥ クリア判定
import { RULES, TUNE3D as T, DIFFICULTIES } from './config.js';
import { parse3D, STAGES_3D } from './stages.js';
import { makeRng, makeInflate, inflateUpdate, inflateRecovering, makePump, pumpTick, pumpDetach, pumpReset,
  makeRockState, rockLoosen, rockTick, rockLand, rockAddKill, makeScore, scoreDig, scoreAdd, scoreExtra } from './rules.js';

const C = T.cell;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const cellCenter = (gx, gz) => [(gx + 0.5) * C, (gz + 0.5) * C];
export const toCell = (x, z) => [Math.floor(x / C), Math.floor(z / C)];

export function createGame3D({ difficulty = 'normal', stageIndex = 0, lives, score, seed = 1, stages = STAGES_3D, tutorial = null } = {}) {
  const diff = DIFFICULTIES[difficulty];
  const g = { mode: '3d', diff, stageIndex, stages, rng: makeRng(seed + stageIndex * 104729), lives: lives ?? diff.lives,
    score: score || makeScore(), time: 0, phase: 'ready', phaseT: 0, events: [], popups: [], fx: [],
    map: null, player: null, enemies: [], rocks: [], fires: [], pump: makePump(), act: null, dig: null, tut: tutorial ? { step: 0, done: false, def: tutorial } : null };
  loadStage(g);
  return g;
}

function loadStage(g) {
  const st = g.tut ? g.tut.def : g.stages[g.stageIndex];
  const m = parse3D(st);
  m.version = 0; m.theme = st.theme; m.name = st.name; m.goal = st.goal; m.changed = [];
  g.map = m;
  const [sx, sz] = cellCenter(m.start.x, m.start.z);
  // 開始時は、いちばん開けている方向を向く
  let yaw = 0, best = -1;
  for (const [dx, dz] of N4) { let n = 0; for (let k = 1; k < 5 && isOpen(m, m.start.x + dx * k, m.start.z + dz * k); k++) n++; if (n > best) { best = n; yaw = Math.atan2(-dx, -dz); } }
  g.player = { x: sx, z: sz, sx, sz, yaw, dead: false, guard: 0, moved: 0, locoT: 0, bx: sx, bz: sz };
  g.enemies = m.enemies.map((e, k) => {
    const [x, z] = cellCenter(e.x, e.z);
    return { id: k, type: e.type, sgx: e.x, sgz: e.z, x, z, px: x, pz: z, y: 0, gx: e.x, gz: e.z, tgx: e.x, tgz: e.z, face: [1, 0], yaw: 0,
      state: 'wait', t: 0, wake: RULES.enemyWakeDelay + k * 0.3, inf: makeInflate(), alive: true, noPath: 0,
      ghostIn: g.rng.range(...T.ghostEvery), fireCool: 2 + g.rng.next() * 2, fireDir: null, anim: g.rng.next() * 10 };
  });
  g.rocks = m.rocks.map((r, k) => { const [x, z] = cellCenter(r.x, r.z); return { id: k, gx: r.x, gz: r.z, x, z, y: T.height - 0.75, vy: 0, supports: r.supports, ...makeRockState() }; });
  g.fires = []; g.dig = null; g.act = null; pumpReset(g.pump);
  g.phase = 'ready'; g.phaseT = 0;
  emit(g, 'stage-start', { stage: g.stageIndex });
}

const emit = (g, type, data = {}) => g.events.push({ type, ...data });
export const inside = (m, gx, gz) => gx >= 0 && gz >= 0 && gx < m.w && gz < m.h;
export const isOpen = (m, gx, gz) => inside(m, gx, gz) && !m.solid[gz * m.w + gx];
export const isSolidAt = (m, x, z) => { const [gx, gz] = toCell(x, z); return !inside(m, gx, gz) || m.solid[gz * m.w + gx] === 1; };
const rockBlocks = (g, gx, gz) => g.rocks.some((r) => r.gx === gx && r.gz === gz && r.state === 'landed');

// ---------- 当たり（円と格子） ----------
// 半径 rad の円が、土・岩盤・着地した岩と重ならないか
export function circleFree(g, x, z, rad) {
  const m = g.map;
  const x0 = Math.floor((x - rad) / C), x1 = Math.floor((x + rad) / C), z0 = Math.floor((z - rad) / C), z1 = Math.floor((z + rad) / C);
  for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
    if (isOpen(m, gx, gz) && !rockBlocks(g, gx, gz)) continue;
    const cx = Math.max(gx * C, Math.min(x, (gx + 1) * C)), cz = Math.max(gz * C, Math.min(z, (gz + 1) * C));
    if ((cx - x) ** 2 + (cz - z) ** 2 < rad * rad) return false;
  }
  return true;
}
// スムーズ移動: 壁に沿って滑る。実際に動いた量を返す
export function slideMove(g, dx, dz) {
  const P = g.player, r = T.playerRadius;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
  let mx = 0, mz = 0;
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sz = dz / n;
    if (circleFree(g, P.x + sx, P.z, r) && !enemyBlocks(g, P.x + sx, P.z)) { P.x += sx; mx += sx; }
    if (circleFree(g, P.x, P.z + sz, r) && !enemyBlocks(g, P.x, P.z + sz)) { P.z += sz; mz += sz; }
  }
  return Math.hypot(mx, mz);
}
// 快適移動の 1 歩: 途中経路を細かく調べ、壁・敵・落下中の岩の手前で止まる。短すぎる歩みは行わない
export function tryStep(g, dirX, dirZ, dist = T.stepDist) {
  const P = g.player, r = T.playerRadius;
  const L = Math.hypot(dirX, dirZ) || 1; const ux = dirX / L, uz = dirZ / L;
  let d = 0; const inc = 0.05;
  while (d + inc <= dist + 1e-6) {
    const nx = P.x + ux * (d + inc), nz = P.z + uz * (d + inc);
    if (!circleFree(g, nx, nz, r) || enemyBlocks(g, nx, nz) || fallingRockAt(g, nx, nz)) break;
    d += inc;
  }
  if (d < 0.3) return null;
  return { x: P.x + ux * d, z: P.z + uz * d, d };
}
function enemyBlocks(g, x, z) {
  // 動いている敵の中へは入れない（膨らんで止まっている敵も通り抜けない）
  for (const e of g.enemies) {
    if (!e.alive || e.state === 'ghost' || e.state === 'ghostWarn' || e.state === 'pop') continue;
    const rad = T.enemyRadius * (1 + inflateAmountSimple(e) * 0.8) + T.playerRadius * 0.6;
    if ((e.x - x) ** 2 + (e.z - z) ** 2 < rad * rad) return true;
  }
  return false;
}
const inflateAmountSimple = (e) => e.inf.stage / 5;
function fallingRockAt(g, x, z) {
  return g.rocks.some((r) => (r.state === 'fall' || r.state === 'loose') && Math.abs(r.x - x) < C * 0.5 && Math.abs(r.z - z) < C * 0.5);
}

// ---------- 視線（レイ）と格子 ----------
// 原点 o・向き d（正規化）から maxD まで。最初に当たる土のセル（外周の岩盤は掘れない）と距離。床・天井に先に当たれば null
export function raycastCells(g, o, d, maxD) {
  const m = g.map;
  // 床・天井
  let lim = maxD;
  if (d[1] < -1e-6) lim = Math.min(lim, (0 - o[1]) / d[1]);
  if (d[1] > 1e-6) lim = Math.min(lim, (T.height - o[1]) / d[1]);
  let gx = Math.floor(o[0] / C), gz = Math.floor(o[2] / C);
  const sx = Math.sign(d[0]), sz = Math.sign(d[2]);
  const tdx = sx ? Math.abs(C / d[0]) : Infinity, tdz = sz ? Math.abs(C / d[2]) : Infinity;
  let tmx = sx ? ((sx > 0 ? (gx + 1) * C : gx * C) - o[0]) / d[0] : Infinity;
  let tmz = sz ? ((sz > 0 ? (gz + 1) * C : gz * C) - o[2]) / d[2] : Infinity;
  let t = 0, face = null;
  for (let i = 0; i < 64; i++) {
    if (!isOpen(m, gx, gz)) {
      if (t > lim) return null;
      const diggable = inside(m, gx, gz);
      return { gx, gz, t, face, diggable, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
    }
    if (tmx < tmz) { t = tmx; tmx += tdx; gx += sx; face = [-sx, 0]; } else { t = tmz; tmz += tdz; gz += sz; face = [0, -sz]; }
    if (t > lim) return null;
  }
  return null;
}
// 2 点の間に土がないか（敵への見通し・ポンプの遮蔽）
export function lineClear(g, ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(L / 0.2));
  for (let i = 1; i < n; i++) { const k = i / n; if (isSolidAt(g.map, ax + (bx - ax) * k, az + (bz - az) * k)) return false; }
  return true;
}
// レイと敵（球）
function rayEnemy(g, o, d, maxD) {
  let best = null;
  for (const e of g.enemies) {
    if (!e.alive || e.state === 'ghost' || e.state === 'ghostWarn' || e.state === 'pop') continue;
    const c = [e.x, 0.75 + e.y, e.z]; const rad = 0.75 * (1 + e.inf.stage / g.diff.pumpsToPop * 0.6);
    const oc = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
    const tca = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2]; if (tca < 0) continue;
    const d2 = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - tca * tca; if (d2 > rad * rad) continue;
    const t = tca - Math.sqrt(rad * rad - d2);
    if (t <= maxD && (!best || t < best.t)) best = { e, t };
  }
  return best;
}

// 狙っているもの（描画の照準・レーザーにも使う）
export function aimInfo(g, o, d) {
  const cell = raycastCells(g, o, d, 12);
  const en = rayEnemy(g, o, d, T.pumpRange);
  const enemyOk = en && (!cell || en.t < cell.t) && lineClear(g, o[0], o[2], en.e.x, en.e.z);
  const dirtOk = cell && cell.diggable && cell.t <= T.reach;
  return { cell, enemy: enemyOk ? en.e : null, enemyT: en ? en.t : null, dig: dirtOk ? cell : null, kind: enemyOk ? 'pump' : dirtOk ? 'dig' : (cell && cell.t <= T.reach ? 'hard' : 'none') };
}

// ---------------------------------------------------------------
// input: { move: [dx, dz]（このtickに動かしたい量。スムーズ移動）, step: [dx, dz] | null（快適移動の要求）, locomoting: bool,
//          aim: { o: [x,y,z], d: [x,y,z] }, trigger: bool（押している）, body: [x, z] | null（VR の頭の位置。指定時はそれを主人公位置に） }
export function step3d(g, input) {
  g.events.length = 0;
  const dt = RULES.tick;
  g.time += dt; g.phaseT += dt;
  for (const p of g.popups) p.t += dt; g.popups = g.popups.filter((p) => p.t < 1.4);
  for (const f of g.fx) f.t += dt; g.fx = g.fx.filter((f) => f.t < f.life);
  for (const e of g.enemies) { e.px = e.x; e.pz = e.z; }
  const P = g.player;
  if (g.phase === 'ready') { if (g.phaseT >= 1.0) { g.phase = 'play'; g.phaseT = 0; } applyBody(g, input); return g; }
  if (g.phase === 'miss') {
    updateRocks(g, dt, true);
    if (g.phaseT >= RULES.missDuration && !g.rocks.some((r) => r.state === 'fall' || r.state === 'loose')) respawn(g);
    return g;
  }
  if (g.phase !== 'play') return g;
  P.guard = Math.max(0, P.guard - dt);
  // ① 移動
  applyBody(g, input);
  let moved = 0;
  if (input.move && (input.move[0] || input.move[1])) moved = slideMove(g, input.move[0], input.move[1]);
  if (input.step) { const s = tryStep(g, input.step[0], input.step[1], input.step[2]); if (s) { P.x = s.x; P.z = s.z; moved = s.d; emit(g, 'step'); } else emit(g, 'step-blocked'); }
  P.locoT = input.locomoting ? P.locoT + dt : 0;
  P.moved = moved;
  // 体の位置（当たり判定用）は頭の細かな揺れを均す
  const k = 1 - Math.exp(-dt / 0.12);
  P.bx += (P.x - P.bx) * k; P.bz += (P.z - P.bz) * k;
  if (Math.hypot(P.x - P.bx, P.z - P.bz) > 1.5) { P.bx = P.x; P.bz = P.z; }
  // ② 掘削・ポンプ
  actions(g, input, dt);
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const r = inflateUpdate(e.inf, dt);
    if (r === 'deflate') emit(g, 'deflate', { enemy: e });
    if (r === 'recovered') { e.state = 'walk'; e.t = 0; snap(e); }
    if (inflateRecovering(e.inf) && !e.warned) { e.warned = true; emit(g, 'recover-warn', { enemy: e }); }
    if (e.inf.stage > 1) e.warned = false;
  }
  // ③ 岩
  updateRocks(g, dt, false);
  // ④ 敵・炎
  const df = distanceField(g);
  for (const e of g.enemies) updateEnemy(g, e, dt, df);
  updateFires(g, dt);
  // ⑤ 当たり
  if (!P.dead && P.guard <= 0) checkPlayerHit(g);
  // ⑥ クリア
  if (!P.dead && g.enemies.every((e) => !e.alive) && !g.rocks.some((r) => r.state === 'fall')) stageClear(g);
  if (scoreExtra(g.score)) { g.lives++; emit(g, 'extra'); }
  if (g.tut) tutorialTick(g);
  return g;
}
function applyBody(g, input) {
  if (!input.body) return;
  const P = g.player;
  P.x = input.body[0]; P.z = input.body[1];
}

function actions(g, input, dt) {
  const P = g.player;
  const pressed = input.trigger && !g._trig; g._trig = input.trigger;
  const aim = input.aim ? aimInfo(g, input.aim.o, input.aim.d) : null;
  g.aim = aim;
  if (pressed) {
    // 押した瞬間に「掘る」か「ポンプ」かを決め、離すまで変えない（不安定な切り替えを防ぐ）
    if (g.pump.state === 'attached' || g.pump.state === 'shoot') g.act = 'pump';
    else if (aim && aim.kind === 'pump') g.act = 'pump';
    else if (aim && aim.kind === 'dig') g.act = 'dig';
    else g.act = 'pump'; // 何もない方向へは空撃ち
    if (g.act === 'pump' && g.pump.state === 'idle' && input.aim) g.pumpRay = { o: [...input.aim.o], d: [...input.aim.d] };
  }
  if (!input.trigger && g.act === 'dig') { g.act = null; g.dig = null; }
  // 掘削
  if (g.act === 'dig' && input.trigger) {
    const c = aim && aim.dig;
    if (c) {
      const key = c.gz * g.map.w + c.gx;
      if (!g.dig || g.dig.key !== key) g.dig = { key, gx: c.gx, gz: c.gz, p: 0, face: c.face, point: c.point };
      g.dig.p += dt / T.digTime; g.dig.point = c.point; g.dig.face = c.face;
      if (Math.random() < 0.25) emit(g, 'digging', { gx: c.gx, gz: c.gz });
      if (g.dig.p >= 1) { digCell(g, c.gx, c.gz); g.dig = null; }
    } else g.dig = null;
  }
  // ポンプ
  const locomoting = P.locoT > 0.2;
  const pumpInput = { pump: g.act === 'pump' && input.trigger, moving: false };
  if (g.pump.state === 'attached' && locomoting) pumpDetach(g.pump, hooks(g), (t, d) => emit(g, t, d));
  if (!input.trigger && g.act === 'pump' && g.pump.state === 'idle') g.act = null;
  pumpTick(g.pump, pumpInput, dt, { range: T.pumpRange, speed: 22, interval: RULES.pumpInterval, max: g.diff.pumpsToPop }, hooks(g), (t, d) => onPump(g, t, d));
}
function hooks(g) {
  const P = g.player;
  return {
    advance(len) {
      const r = g.pumpRay; if (!r) return { hit: null, blocked: true };
      const tip = [r.o[0] + r.d[0] * len, r.o[1] + r.d[1] * len, r.o[2] + r.d[2] * len];
      g.pumpTip = tip;
      if (tip[1] < 0 || tip[1] > T.height || isSolidAt(g.map, tip[0], tip[2])) return { hit: null, blocked: true };
      const en = rayEnemy(g, r.o, r.d, len);
      if (en) return { hit: en.e, blocked: false };
      return { hit: null, blocked: false };
    },
    valid(e) { return e.alive && Math.hypot(e.x - P.x, e.z - P.z) <= T.pumpBreak && lineClear(g, P.x, P.z, e.x, e.z); },
    inflate(e) { return e.inf; },
  };
}
function onPump(g, t, d) {
  const e = d && d.enemy;
  if ((t === 'pump-hit' || t === 'pump-air') && e) { e.state = 'inflated'; g.fires = g.fires.filter((f) => f.owner !== e); }
  if (t === 'pop' && e) {
    e.state = 'pop'; e.t = 0; e.alive = false;
    const pts = e.type === 'fire' ? RULES.score.fire : RULES.score.chaser;
    scoreAdd(g.score, pts); g.popups.push({ x: e.x, y: 1.6, z: e.z, text: String(pts), t: 0 });
    g.fx.push({ kind: 'pop', x: e.x, y: 0.9, z: e.z, t: 0, life: 0.8, type: e.type });
  }
  if (t === 'pump-miss' || t === 'pop' || t === 'detach') { /* 先端は戻る */ }
  emit(g, t, { ...d, stage: e ? e.inf.stage : 0 });
}

export function digCell(g, gx, gz) {
  const m = g.map; const i = gz * m.w + gx;
  if (!inside(m, gx, gz) || !m.solid[i]) return false;
  m.solid[i] = 0; m.version++; m.changed.push(i);
  const wasSupport = m.support[i]; m.support[i] = 0;
  const pts = scoreDig(g.score, `${g.stageIndex}:${gx}:${gz}`);
  const [x, z] = cellCenter(gx, gz);
  g.fx.push({ kind: 'debris', x, y: 1.2, z, t: 0, life: 0.9 });
  emit(g, 'dig', { gx, gz, pts, support: wasSupport });
  return true;
}

// ---------- 岩 ----------
function updateRocks(g, dt, missPhase) {
  const P = g.player, m = g.map;
  for (const r of g.rocks) {
    if (r.state === 'gone') continue;
    if (r.state === 'held' && !missPhase && r.supports.length && r.supports.every((i) => !m.solid[i])) { rockLoosen(r); emit(g, 'rock-shake', { rock: r }); }
    rockTick(r, dt, g.diff.warn, (t, d) => emit(g, t, d));
    if (r.state === 'fall') {
      const y0 = r.y;
      r.vy = Math.min(T.rockFall, r.vy + 22 * dt);
      r.y = Math.max(0.78, r.y - r.vy * dt);
      const bottom = r.y - 0.78; // 岩の下端
      // 通った高さ全体（y0..y）で判定する（速く落ちてもすり抜けない）
      for (const e of g.enemies) {
        if (!e.alive || e.state === 'pop') continue;
        if (Math.abs(e.x - r.x) < C * 0.5 && Math.abs(e.z - r.z) < C * 0.5 && bottom < 1.3 + e.y) {
          e.alive = false; e.state = 'crushed'; e.t = 0; e.rock = r; rockAddKill(r, e);
          g.fires = g.fires.filter((f) => f.owner !== e);
          if (g.pump.target === e) pumpDetach(g.pump, hooks(g), () => {});
        }
      }
      if (!P.dead && P.guard <= 0 && Math.abs(P.bx - r.x) < C * 0.5 - 0.1 && Math.abs(P.bz - r.z) < C * 0.5 - 0.1 && bottom < 1.5) { r.hitPlayer = true; playerMiss(g, 'rock'); }
      void y0;
      if (r.y <= 0.78) {
        const pts = rockLand(r, (t, d) => emit(g, t, d));
        if (pts) { scoreAdd(g.score, pts); g.popups.push({ x: r.x, y: 2.0, z: r.z, text: String(pts), t: 0, big: r.kills.length > 1 }); }
        g.fx.push({ kind: 'dust', x: r.x, y: 0.2, z: r.z, t: 0, life: 1.0 });
      }
    }
  }
}

// ---------- 敵 ----------
function distanceField(g) {
  const m = g.map, P = g.player;
  const [pgx, pgz] = toCell(P.bx, P.bz);
  const key = m.version + ':' + pgx + ',' + pgz + ':' + g.rocks.map((r) => r.state[0]).join('');
  if (g._dfk === key) return g._df;
  const d = new Int16Array(m.w * m.h).fill(-1);
  if (isOpen(m, pgx, pgz)) {
    const q = [[pgx, pgz]]; d[pgz * m.w + pgx] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const [x, z] = q[qi];
      for (const [dx, dz] of N4) {
        const nx = x + dx, nz = z + dz;
        if (!isOpen(m, nx, nz) || d[nz * m.w + nx] >= 0 || rockBlocks(g, nx, nz)) continue;
        d[nz * m.w + nx] = d[z * m.w + x] + 1; q.push([nx, nz]);
      }
    }
  }
  g._df = d; g._dfk = key; return d;
}
function snap(e) { e.gx = Math.round((e.x / C) - 0.5); e.gz = Math.round((e.z / C) - 0.5); const [x, z] = cellCenter(e.gx, e.gz); e.x = x; e.z = z; e.tgx = e.gx; e.tgz = e.gz; }

function updateEnemy(g, e, dt, df) {
  e.anim += dt;
  if (!e.alive) { e.t += dt; if (e.state === 'crushed' && e.rock) e.y = Math.max(0, e.rock.y - 1.4); return; }
  if (e.inf.stage > 0) { e.state = 'inflated'; return; }
  if (e.state === 'inflated') { e.state = 'walk'; snap(e); }
  if (g.tut && !g.tut.enemiesMove) return;
  const m = g.map, P = g.player;
  e.t += dt;
  const spd = T.enemySpeed * g.diff.enemySpeed * (e.type === 'fire' ? 0.85 : 1);
  switch (e.state) {
    case 'wait': if (e.t >= e.wake) { e.state = 'walk'; e.t = 0; } return;
    case 'charge':
      if (e.t >= g.diff.warn) { e.state = 'breath'; e.t = 0; g.fires.push({ owner: e, gx: e.gx, gz: e.gz, dir: e.fireDir, len: 0, reach: 0, t: 0 }); emit(g, 'fire-breath', { enemy: e }); }
      return;
    case 'breath': if (e.t >= T.fireTime) { e.state = 'walk'; e.t = 0; e.fireCool = g.diff.fireCooldown; e.fireDir = null; } return;
    case 'ghostWarn': if (e.t >= Math.max(0.6, g.diff.warn)) { e.state = 'ghost'; e.t = 0; emit(g, 'ghost-on', { enemy: e }); } return;
    case 'ghost': {
      let tx = P.bx, tz = P.bz;
      if (e.t > T.ghostMax) { const n = nearestReachable(g, e, df); tx = n[0]; tz = n[1]; }
      const dx = tx - e.x, dz = tz - e.z, L = Math.hypot(dx, dz) || 1, s = Math.min(L, T.ghostSpeed * g.diff.enemySpeed * dt);
      e.x += dx / L * s; e.z += dz / L * s; e.yaw = Math.atan2(dx, dz);
      e.x = Math.max(C * 0.5, Math.min((m.w - 0.5) * C, e.x)); e.z = Math.max(C * 0.5, Math.min((m.h - 0.5) * C, e.z));
      const [gx, gz] = toCell(e.x, e.z); const [cx, cz] = cellCenter(gx, gz);
      if (e.t > 1.2 && Math.hypot(e.x - cx, e.z - cz) < 0.3 && isOpen(m, gx, gz) && df[gz * m.w + gx] >= 0 && !rockBlocks(g, gx, gz)
        && Math.hypot(cx - P.bx, cz - P.bz) > 1.6) { // 主人公の目の前で実体化しない
        e.x = cx; e.z = cz; snap(e); e.state = 'land'; e.t = 0; e.noPath = 0; e.ghostIn = g.rng.range(...T.ghostEvery); emit(g, 'ghost-off', { enemy: e });
      }
      return;
    }
    case 'land': if (e.t >= RULES.ghostLandGuard) { e.state = 'walk'; e.t = 0; } return;
  }
  // walk: セルの中心から隣のセルの中心へ。経路の有無は毎 tick 数える
  { const [cgx, cgz] = toCell(e.x, e.z); if (df[cgz * m.w + cgx] < 0) e.noPath += dt; else e.noPath = 0; e.ghostIn -= dt; }
  const [tx, tz] = cellCenter(e.tgx, e.tgz);
  const dx = tx - e.x, dz = tz - e.z, L = Math.hypot(dx, dz);
  if (L < 1e-4) {
    e.gx = e.tgx; e.gz = e.tgz;
    const here = df[e.gz * m.w + e.gx];
    const want = e.type === 'chaser' ? (e.noPath > T.ghostAfterNoPath || (e.ghostIn <= 0 && here > 5)) : e.noPath > T.ghostAfterNoPath * 2;
    if (want) { e.state = 'ghostWarn'; e.t = 0; emit(g, 'ghost-warn', { enemy: e }); return; }
    if (e.type === 'fire') {
      e.fireCool -= dt;
      const [pgx, pgz] = toCell(P.bx, P.bz);
      const sameRow = pgz === e.gz && Math.abs(pgx - e.gx) <= T.fireRange + 1, sameCol = pgx === e.gx && Math.abs(pgz - e.gz) <= T.fireRange + 1;
      if (e.fireCool <= 0 && (sameRow || sameCol) && (pgx !== e.gx || pgz !== e.gz) && lineClear(g, e.x, e.z, P.bx, P.bz)) {
        e.fireDir = sameRow ? [Math.sign(pgx - e.gx), 0] : [0, Math.sign(pgz - e.gz)];
        e.face = e.fireDir; e.yaw = Math.atan2(e.fireDir[0], e.fireDir[1]);
        e.state = 'charge'; e.t = 0; emit(g, 'fire-charge', { enemy: e }); return;
      }
    }
    const opts = [];
    for (const [ddx, ddz] of N4) { const nx = e.gx + ddx, nz = e.gz + ddz; if (isOpen(m, nx, nz) && !rockBlocks(g, nx, nz)) opts.push({ nx, nz, ddx, ddz, d: df[nz * m.w + nx] }); }
    if (!opts.length) return;
    let pick;
    if (here > 0 && (e.type === 'chaser' || g.rng.next() < 0.75)) pick = opts.filter((o) => o.d >= 0).sort((a, b) => a.d - b.d)[0] || opts[0];
    else { const fwd = opts.filter((o) => !(o.ddx === -e.face[0] && o.ddz === -e.face[1])); const pool = fwd.length ? fwd : opts; pick = pool[g.rng.int(pool.length)]; }
    e.tgx = pick.nx; e.tgz = pick.nz; e.face = [pick.ddx, pick.ddz];
    return;
  }
  const s = Math.min(L, spd * dt);
  e.x += dx / L * s; e.z += dz / L * s;
  const want = Math.atan2(dx, dz); let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 10);
}
function nearestReachable(g, e, df) {
  const m = g.map; let best = [g.player.bx, g.player.bz], bd = 1e9;
  for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
    if (df[z * m.w + x] < 0) continue; const [cx, cz] = cellCenter(x, z); const d = Math.hypot(cx - e.x, cz - e.z);
    if (d < bd && Math.hypot(cx - g.player.bx, cz - g.player.bz) > 1.6) { bd = d; best = [cx, cz]; }
  }
  return best;
}
function updateFires(g, dt) {
  const m = g.map;
  for (const f of g.fires) {
    f.t += dt; f.len = Math.min(T.fireRange, f.len + 10 * dt);
    let reach = 0;
    for (let i = 1; i <= Math.ceil(f.len); i++) {
      const nx = f.gx + f.dir[0] * i, nz = f.gz + f.dir[1] * i;
      if (!isOpen(m, nx, nz) || rockBlocks(g, nx, nz)) { reach = Math.min(f.len, i - 0.5); break; }
      reach = Math.min(f.len, i);
    }
    f.reach = reach;
  }
  g.fires = g.fires.filter((f) => f.owner.alive && f.owner.state === 'breath');
}
function checkPlayerHit(g) {
  const P = g.player;
  for (const f of g.fires) {
    const [ox, oz] = cellCenter(f.gx, f.gz);
    // 炎の帯: 敵の位置から dir 方向へ reach セル、幅 1.0m
    const rx = P.bx - ox, rz = P.bz - oz;
    const along = rx * f.dir[0] + rz * f.dir[1], side = Math.abs(rx * f.dir[1] - rz * f.dir[0]);
    if (along > 0.3 && along < f.reach * C + 0.2 && side < 0.75 && f.reach > 0.1) { playerMiss(g, 'fire'); return; }
  }
  for (const e of g.enemies) {
    if (!e.alive || e.state === 'wait' || e.state === 'ghost' || e.state === 'ghostWarn' || e.state === 'land' || e.inf.stage > 0) continue;
    if (Math.hypot(e.x - P.bx, e.z - P.bz) < T.enemyRadius + T.playerRadius) { playerMiss(g, 'enemy'); return; }
  }
}
function playerMiss(g, cause) {
  const P = g.player;
  if (P.dead || g.phase !== 'play') return;
  if (g.tut) { pumpDetach(g.pump, hooks(g), () => {}); pumpReset(g.pump); P.guard = RULES.respawnGuard; P.x = P.bx = P.sx; P.z = P.bz = P.sz; emit(g, 'miss-soft', { cause }); return; }
  P.dead = true; P.cause = cause; g.phase = 'miss'; g.phaseT = 0;
  pumpDetach(g.pump, hooks(g), () => {}); pumpReset(g.pump); g.act = null; g.dig = null; g.fires = [];
  for (const e of g.enemies) if (e.state === 'charge' || e.state === 'breath') { e.state = 'walk'; e.fireDir = null; e.fireCool = g.diff.fireCooldown; snap(e); }
  emit(g, 'miss', { cause });
}
function respawn(g) {
  const P = g.player;
  g.lives--;
  if (g.lives < 0) { g.lives = 0; g.phase = 'over'; g.phaseT = 0; emit(g, 'gameover'); return; }
  P.dead = false;
  if (g.enemies.every((e) => !e.alive)) { stageClear(g); return; }
  g.resetTo = [P.sx, P.sz]; P.x = P.bx = P.sx; P.z = P.bz = P.sz; P.guard = RULES.respawnGuard;
  for (const e of g.enemies) if (e.alive) {
    const [x, z] = cellCenter(e.sgx, e.sgz); e.x = e.px = x; e.z = e.pz = z; snap(e); e.inf = makeInflate(); e.state = 'wait'; e.t = 0; e.wake = RULES.enemyWakeDelay; e.noPath = 0;
  }
  g.phase = 'play'; g.phaseT = 0; emit(g, 'respawn');
}
function stageClear(g) {
  if (g.phase === 'clear') return;
  g.phase = 'clear'; g.phaseT = 0; pumpReset(g.pump); g.act = null;
  if (!g.tut) { scoreAdd(g.score, RULES.score.clear); g.popups.push({ x: g.player.x, y: 2.2, z: g.player.z, text: 'CLEAR +1000', t: 0, big: true }); }
  emit(g, 'clear');
}
export function nextStage3D(g) {
  if (g.stageIndex + 1 >= g.stages.length) { g.phase = 'done'; emit(g, 'allclear'); return false; }
  g.stageIndex++; g.rng = makeRng(31 + g.stageIndex * 104729); loadStage(g); return true;
}

// ---------- チュートリアル ----------
export const TUTORIAL_3D = { name: 'れんしゅう', theme: 'soil', goal: '', map: [
  '#############',
  '#############',
  '#############',
  '####.c..#####',
  '####.####S###',
  '####.###.R.c#',
  '####.###.####',
  '####P###.####',
  '#############',
  '#############',
  '#############',
  '#############',
  '#############',
] };
export const TUTORIAL_STEPS_3D = [
  { text: '光っている壁を狙って、トリガー（クリック）を押し続けて掘ろう', target: [5, 7] },
  { text: '奥の敵を狙ってトリガー。押すたびに（長押しでも）膨らみ、最後に破裂する', target: null },
  { text: '右の通路の先、木の支えを掘ると天井の岩が揺れて落ちる。下の敵をつぶそう', target: null },
  { text: 'よくできました！ 本番の敵は道をたどって追ってくる。マップ（M／A ボタン）で位置を確かめよう', target: null },
];
function tutorialTick(g) {
  const t = g.tut; if (t.done) return;
  const m = g.map; const e1 = g.enemies[0], e2 = g.enemies[1];
  if (t.step === 0) { const [x, z] = TUTORIAL_STEPS_3D[0].target; if (!m.solid[z * m.w + x]) { t.step = 1; emit(g, 'tutorial-ok'); } }
  else if (t.step === 1) { if (!e1.alive) { t.step = 2; emit(g, 'tutorial-ok'); } }
  else if (t.step === 2) { if (!e2.alive) { t.step = 3; t.done = true; emit(g, 'tutorial-ok'); } }
}
export function createTutorial3D(opts = {}) { return createGame3D({ ...opts, tutorial: TUTORIAL_3D }); }
