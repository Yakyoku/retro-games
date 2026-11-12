// ステージ定義。チュートリアルは手作業、本編 3 棟は「棟ごとの方針」から決定的に生成する（seed 固定＝毎回同じ配置）。
// 生成した配置は tests/reach.test.js で「全階・全書類・出口へ到達できる」ことを確かめている。
import { W, CAR_W } from './const.js';
import { makeRng } from './rng.js';

export const STAGES = [
  { id: 'tutorial', name: '訓練棟', sub: 'チュートリアル', floors: 6, theme: 'training', hand: true },
  { id: 'office', name: '第1ビル オフィス棟', sub: '基本の移動と回収', floors: 30, theme: 'office', seed: 1103,
    columns: [4, 9.5, 15, 20], shaftLen: [5, 9], escP: 0.22, autoP: 0, carAtTop: 1.0, extra: 3,
    lights: [3, 9, 12.25, 17.5, 22.5], covers: [0, 0], enemies: [0, 1], types: [0], doors: [1, 2] },
  { id: 'lab', name: '第2ビル 研究・通信棟', sub: '乗り換えと照明', floors: 30, theme: 'lab', seed: 2207,
    columns: [3.5, 8.5, 13.5, 18.5], shaftLen: [3, 6], escP: 0.38, autoP: 0.35, carAtTop: 0.6, extra: 5,
    lights: [1.6, 6, 11, 16, 21, 23], covers: [0, 1], enemies: [0, 2], types: [0, 0, 1], doors: [1, 3] },
  { id: 'security', name: '第3ビル 警備棟', sub: '遮蔽物と敵の配置', floors: 30, theme: 'security', seed: 3301,
    columns: [5, 10.5, 16, 21], shaftLen: [2, 6], escP: 0.3, autoP: 0.25, carAtTop: 0.5, extra: 6,
    lights: [2.5, 7.75, 13.25, 18.5, 23], covers: [1, 2], enemies: [1, 2], types: [0, 1, 2, 2], doors: [2, 3] },
];

const near = (a, b, d) => Math.abs(a - b) < d;

// 柱（昇降路の列）の間の空きの中心。エスカレーターの乗り口はここに置く
function segCenters(columns) {
  const edges = [0];
  for (const c of columns) edges.push(c - CAR_W / 2, c + CAR_W / 2);
  edges.push(W);
  const out = [];
  for (let i = 0; i < edges.length; i += 2) out.push((edges[i] + edges[i + 1]) / 2);
  return out;
}

export function servesFloor(shaft, f) { return f >= shaft.lo && f <= shaft.hi; }

// その階で昇降路の開口になる x 範囲の列（かごが居なければ穴）
export function pitColumns(stage, f) {
  return stage.shafts.filter((s) => servesFloor(s, f)).map((s) => s.x);
}

function emptyFloor() { return { doors: [], lights: [], covers: [], enemies: [] }; }

function finalize(st) {
  let id = 1;
  st.docTotal = 0;
  for (let f = 1; f <= st.floors; f++) {
    const fl = st.floor[f];
    for (const d of fl.doors) { d.id = id++; d.floor = f; if (d.kind === 'doc') st.docTotal++; }
    for (const l of fl.lights) { l.id = id++; l.floor = f; }
    for (const c of fl.covers) { c.id = id++; c.floor = f; }
    for (const e of fl.enemies) { e.floor = f; }
  }
  st.shafts.forEach((s, i) => { s.id = i; });
  st.escalators.forEach((e, i) => { e.id = i; });
  return st;
}

function tutorial() {
  const st = { id: 'tutorial', name: '訓練棟', theme: 'training', floors: 6, width: W, floor: {}, shafts: [], escalators: [],
    start: { floor: 6, x: 1.2 }, exit: { floor: 1, x: W - 1.2 } };
  for (let f = 1; f <= 6; f++) st.floor[f] = emptyFloor();
  st.shafts.push({ x: 9, lo: 4, hi: 6, start: 6, auto: false });
  st.shafts.push({ x: 6, lo: 1, hi: 3, start: 1, auto: false });
  st.escalators.push({ upper: 4, xTop: 15, xBot: 20.5 });
  st.floor[6].lights.push({ x: 15.5 }, { x: 21 });
  st.floor[6].enemies.push({ x: 20.5, type: 0, patrol: [17, 23] });
  st.floor[5].doors.push({ x: 15, kind: 'doc' }, { x: 21, kind: 'normal', noSpawn: true });
  st.floor[5].lights.push({ x: 4 }, { x: 16 });
  st.floor[4].lights.push({ x: 4 }, { x: 15.5 });
  st.floor[4].covers.push({ x: 12.5, w: 0.9, h: 1.0 });
  st.floor[3].lights.push({ x: 11 }, { x: 17 });
  st.floor[3].enemies.push({ x: 12, type: 0, patrol: [10.5, 14] });
  st.floor[2].doors.push({ x: 14, kind: 'doc' }, { x: 19, kind: 'normal' });
  st.floor[2].lights.push({ x: 12 }, { x: 20 });
  st.floor[1].lights.push({ x: 12 }, { x: 19 });
  st.floor[1].enemies.push({ x: 16, type: 1, patrol: [13, 19] });
  st.hints = [
    { floor: 6, x0: 0, x1: 6, text: '←→ で移動。右の昇降路まで歩こう' },
    { floor: 6, x0: 6, x1: 10.5, text: 'かごに乗ったら ↓ で下降、↑ で上昇。離すと次の階で止まる' },
    { floor: 6, x0: 10.5, x1: 24, text: '敵は構えてから撃つ。Z で射撃、↓ でしゃがむと高い弾をよけられる' },
    { floor: 5, x0: 10.5, x1: 24, text: '赤いドア（書類マーク）の前で ↑。書類を回収しよう' },
    { floor: 5, x0: 0, x1: 10.5, text: 'かごに戻って 4 階へ' },
    { floor: 4, x0: 10.5, x1: 13.8, text: '低い木箱は弾を止める。しゃがんで隠れられる' },
    { floor: 4, x0: 13.8, x1: 24, text: 'エスカレーターの上り口で ↓ を押すと下の階へ' },
    { floor: 3, x0: 14, x1: 24, text: '天井の照明は、ジャンプ中に撃つと落とせる。下の敵を倒せる' },
    { floor: 3, x0: 0, x1: 14, text: 'かごが居ない昇降路は穴。手前で ↑ を押すとかごを呼べる' },
    { floor: 2, x0: 0, x1: 24, text: '低い弾はジャンプ（X）でよける。跳んで敵に当たるとキック' },
    { floor: 1, x0: 0, x1: 24, text: '書類をすべて持って右端の出口へ' },
  ];
  return finalize(st);
}

function generate(def) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const st = tryGenerate(def, def.seed + attempt * 7919);
    if (st) { st.genAttempt = attempt; return st; }
  }
  throw new Error('stage generation failed: ' + def.id);
}

function tryGenerate(def, seed) {
  const rng = makeRng(seed);
  const N = def.floors;
  const st = { id: def.id, name: def.name, theme: def.theme, floors: N, width: W, floor: {}, shafts: [], escalators: [],
    start: { floor: N, x: 1.2 }, exit: { floor: 1, x: W - 1.2 }, seed };
  for (let f = 1; f <= N; f++) st.floor[f] = emptyFloor();
  const centers = segCenters(def.columns);
  const colFree = (x, lo, hi) => st.shafts.every((s) => s.x !== x || lo > s.hi + 1 || hi < s.lo - 1);
  const escAt = (f) => st.escalators.flatMap((e) => (e.upper === f ? [e.xTop] : e.upper - 1 === f ? [e.xBot] : []));

  // 背骨（屋上→1 階の 1 本道）。昇降路とエスカレーターを交互に乗り換える
  let f = N, x = st.start.x, lastCol = null, spineShafts = 0, guard = 0;
  while (f > 1) {
    if (guard++ > 500) return null;
    const useEsc = rng.chance(def.escP);
    if (useEsc) {
      // 今いる位置から近い空き区画を上り口に、隣の区画を降り口に
      const i = centers.reduce((bi, c, ci) => (Math.abs(c - x) < Math.abs(centers[bi] - x) ? ci : bi), 0);
      const dir = i === 0 ? 1 : i === centers.length - 1 ? -1 : (rng.chance(0.5) ? 1 : -1);
      const xTop = centers[i], xBot = centers[i + dir];
      if (escAt(f).some((e) => near(e, xTop, 2)) || escAt(f - 1).some((e) => near(e, xBot, 2))) continue;
      st.escalators.push({ upper: f, xTop, xBot, spine: true });
      f -= 1; x = xBot; lastCol = null;
      continue;
    }
    const cols = def.columns.filter((c) => c !== lastCol);
    // 乗り換えのために歩かせる: 今の位置から 4m 以上離れた列を優先
    const far = cols.filter((c) => Math.abs(c - x) >= 4);
    const col = rng.pick(far.length ? far : cols);
    const len = rng.int(def.shaftLen[0], def.shaftLen[1]);
    const lo = Math.max(1, f - len);
    if (!colFree(col, lo, f)) { lastCol = col; continue; }
    const auto = def.autoP > 0 && f - lo <= 4 && f < N && rng.chance(def.autoP);
    const start = auto ? rng.int(lo, f) : (rng.chance(def.carAtTop) ? f : lo);
    st.shafts.push({ x: col, lo, hi: f, start, auto, spine: true });
    spineShafts++;
    f = lo; x = col; lastCol = col;
  }
  if (spineShafts < 4) return null;

  // 別ルート（寄り道・近道）の昇降路
  let tries = 0, added = 0;
  while (added < def.extra && tries++ < 200) {
    const col = rng.pick(def.columns);
    const len = rng.int(2, 6);
    const hi = rng.int(2 + len, N - 1);
    const lo = hi - len;
    if (lo < 1 || !colFree(col, lo, hi)) continue;
    // エスカレーターの乗り口と重ならない
    let bad = false;
    for (let g = lo; g <= hi; g++) if (escAt(g).some((e) => near(e, col, CAR_W / 2 + 1.2))) bad = true;
    if (bad) continue;
    const auto = rng.chance(def.autoP);
    st.shafts.push({ x: col, lo, hi, start: rng.int(lo, hi), auto, spine: false });
    added++;
  }
  // 背骨のエスカレーターの乗り口が、後から足した昇降路の穴に重なっていないか
  for (const e of st.escalators) {
    for (const s of st.shafts) {
      if (servesFloor(s, e.upper) && near(s.x, e.xTop, CAR_W / 2 + 1.0)) return null;
      if (servesFloor(s, e.upper - 1) && near(s.x, e.xBot, CAR_W / 2 + 1.0)) return null;
    }
  }

  // 各階の置き場所の候補（0.5m 刻み）
  const slots = (g, avoid) => {
    const pits = pitColumns(st, g);
    const esc = escAt(g);
    const out = [];
    for (let xx = 1.0; xx <= W - 1.0; xx += 0.5) {
      if (pits.some((c) => near(c, xx, CAR_W / 2 + 0.8))) continue;
      if (esc.some((e) => near(e, xx, 1.5))) continue;
      if (avoid.some((a) => near(a, xx, 1.6))) continue;
      out.push(xx);
    }
    return out;
  };

  // 書類 6 件: 上層（30-21）・中層（20-11）・下層（10-1）に 2 件ずつ
  const bands = [[N - 1, 21], [20, 11], [10, 2]];
  for (const [hiB, loB] of bands) {
    const picked = new Set();
    let guard = 0;
    while (picked.size < 2 && guard++ < 100) {
      const g = rng.int(loB, hiB);
      if (picked.has(g) || picked.has(g + 1) || picked.has(g - 1)) continue;
      const avoid = [...(g === N ? [st.start.x] : []), ...(g === 1 ? [st.exit.x] : [])];
      const s = slots(g, avoid);
      if (!s.length) continue;
      st.floor[g].doors.push({ x: rng.pick(s), kind: 'doc' });
      picked.add(g);
    }
    if (picked.size < 2) return null;
  }

  // 通常ドア・照明・遮蔽物・敵
  for (let g = 1; g <= N; g++) {
    const fl = st.floor[g];
    const nd = rng.int(def.doors[0], def.doors[1]);
    for (let k = 0; k < nd; k++) {
      const avoid = [...fl.doors.map((d) => d.x), ...(g === N ? [st.start.x, 3] : []), ...(g === 1 ? [st.exit.x] : [])];
      const s = slots(g, avoid);
      if (s.length) fl.doors.push({ x: rng.pick(s), kind: 'normal' });
    }
    const pits = pitColumns(st, g);
    for (const lx of def.lights) if (!pits.some((c) => near(c, lx, CAR_W / 2 + 0.3))) fl.lights.push({ x: lx });
    const nc = rng.int(def.covers[0], def.covers[1]);
    for (let k = 0; k < nc; k++) {
      const s = slots(g, [...fl.doors.map((d) => d.x), ...fl.covers.map((c) => c.x), st.start.x, st.exit.x]);
      if (s.length) fl.covers.push({ x: rng.pick(s), w: 0.9, h: 1.0 });
    }
    if (g === N) continue; // 屋上直下の最初の階は、入ってすぐ撃たれないよう初期配置の敵を置かない
    const ne = rng.int(def.enemies[0], def.enemies[1]);
    const arrivals = [...pits, ...escAt(g)];
    for (let k = 0; k < ne; k++) {
      const s = slots(g, fl.covers.map((c) => c.x)).filter((xx) => arrivals.every((a) => Math.abs(a - xx) >= 4));
      if (!s.length) break;
      fl.enemies.push({ x: rng.pick(s), type: rng.pick(def.types) });
    }
  }
  return finalize(st);
}

const cache = new Map();
export function getStage(index) {
  if (!cache.has(index)) {
    const def = STAGES[index];
    if (!def) throw new Error('no stage ' + index);
    cache.set(index, def.hand ? tutorial() : generate(def));
  }
  // 呼ぶ側が書き換えても良いよう、毎回複製を返す
  return JSON.parse(JSON.stringify(cache.get(index)));
}
