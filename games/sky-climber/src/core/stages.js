// Sky Climber VR — ステージ（練習壁と 4 棟）のデータと、保持点・窓の生成。
// 単位はメートル。壁の表面が z=0、プレイヤーは +z 側。x は横、y は上（地面 y=0）。
import { makeRng, hashSeed } from './rng.js';

export const FLOOR_H = 2.6;     // 1 階の高さ
export const COL_W = 1.7;       // 窓の列の間隔
export const WIN = { w: 1.12, y0: 0.62, y1: 2.10 }; // 窓の幅・下端・上端（階の床から）
// 保持点の高さ（階の床から）: 0=蛇腹（帯）、0.72=窓台、1.38=窓枠の中段、2.04=窓の上枠 → 間隔 0.56〜0.72m
export const ROW = { cornice: 0.0, sill: 0.72, frame: 1.38, header: 2.04 };

export const STAGES = [
  { id: 'practice', ja: '練習壁', en: 'PRACTICE WALL', theme: 'practice', floors: 5, cols: 4, seed: 101,
    desc: '左右の手を交互に伸ばす練習。窓の開閉と落下物を 1 回ずつ体験できます。',
    pipes: [2], blocks: [], ledges: [2], hazards: { closers: 0.15, drops: 0.25, birds: 0, sweep: null } },
  { id: 'b1', ja: '昼の市街地', en: 'DOWNTOWN NOON', theme: 'day', floors: 12, cols: 6, seed: 2101,
    desc: '基本の登攀と、上の窓から落ちてくる植木鉢。影と声を見て横へよけよう。',
    pipes: [1, 5], blocks: [{ c0: 2, c1: 3, f0: 5, f1: 6, kind: 'billboard' }], ledges: [4, 8],
    hazards: { closers: 0.18, drops: 1.0, birds: 0, sweep: null } },
  { id: 'b2', ja: '夕方の商業地区', en: 'SUNSET ARCADE', theme: 'dusk', floors: 16, cols: 7, seed: 3307,
    desc: '窓がよく閉まる。看板の壁は横へ回りこみ、ゴンドラの通り道は待ってやり過ごそう。',
    pipes: [0, 4, 7], blocks: [{ c0: 1, c1: 3, f0: 4, f1: 6, kind: 'billboard' }, { c0: 4, c1: 6, f0: 10, f1: 12, kind: 'billboard' }], ledges: [4, 8, 12],
    hazards: { closers: 0.42, drops: 0.7, birds: 0, sweep: { kind: 'gondola', floors: [7, 13] } } },
  { id: 'b3', ja: 'ネオンの夜景', en: 'NEON NIGHT', theme: 'night', floors: 20, cols: 7, seed: 4441,
    desc: '雨にぬれた壁、横切る鳥、火花を散らすネオン看板。経路は左右に分かれる。',
    pipes: [1, 6], blocks: [{ c0: 3, c1: 3, f0: 3, f1: 17, kind: 'neon' }], ledges: [5, 10, 15],
    hazards: { closers: 0.32, drops: 0.8, birds: 1.0, sweep: { kind: 'neon', floors: [8, 14] } } },
  { id: 'b4', ja: '超高層ビル', en: 'SKY TOWER', theme: 'tower', floors: 26, cols: 6, seed: 5813,
    desc: '風のうなる超高層。鉄骨を吊ったクレーン、鳥、落下物、窓がすべて襲いかかる。',
    pipes: [0, 3, 6], blocks: [{ c0: 1, c1: 2, f0: 6, f1: 8, kind: 'glass' }, { c0: 3, c1: 4, f0: 15, f1: 17, kind: 'glass' }], ledges: [5, 10, 15, 20],
    hazards: { closers: 0.38, drops: 1.0, birds: 1.2, sweep: { kind: 'crane', floors: [11, 19, 23] } } },
];
export const BUILDINGS = STAGES.filter((s) => s.id !== 'practice');
export const stageById = (id) => STAGES.find((s) => s.id === id);

export const colX = (st, c) => (c - (st.cols - 1) / 2) * COL_W;   // 窓の中心 x
export const edgeX = (st, b) => (b - st.cols / 2) * COL_W;        // 列の境目（柱）の x、b=0..cols
export const roofY = (st) => st.floors * FLOOR_H;                 // 屋上の床（パラペットの上端は +0.0、縁を保持点にする）
export const halfWidth = (st) => (st.cols / 2) * COL_W;

function inBlock(st, c, f) { return st.blocks.find((b) => c >= b.c0 && c <= b.c1 && f >= b.f0 && f <= b.f1); }

// 建物を組み立てる: windows（窓）, holds（保持点）, ledges（安全区画）, pipes, blocks
export function buildStage(st) {
  const rng = makeRng(st.seed ^ hashSeed(st.id));
  const windows = [], holds = [];
  const addHold = (h) => { h.id = holds.length; holds.push(h); return h; };
  const top = roofY(st);
  for (let f = 0; f < st.floors; f++) {
    const y0 = f * FLOOR_H;
    for (let c = 0; c < st.cols; c++) {
      const x = colX(st, c);
      const blk = inBlock(st, c, f);
      // 蛇腹（階の帯）: 窓の中心の下。看板の下でも帯は続く（地上階 f=0 は帯なし）
      if (f > 0 && !(blk && blk.kind !== 'neon' && f > blk.f0)) addHold({ x, y: y0 + ROW.cornice, kind: 'cornice', win: -1, col: c, floor: f });
      if (blk) continue;
      const w = { id: windows.length, col: c, floor: f, x, y: y0, style: rng.int(0, 5), room: rng.next(),
        lit: rng.chance(0.55), curtain: rng.int(0, 3), ac: rng.chance(0.12) && f > 0, plant: rng.chance(0.15) };
      windows.push(w);
      for (const s of [-1, 1]) {
        addHold({ x: x + s * 0.40, y: y0 + ROW.sill, kind: 'sill', win: w.id, col: c, floor: f });
        addHold({ x: x + s * 0.52, y: y0 + ROW.frame, kind: 'frame', win: w.id, col: c, floor: f });
        addHold({ x: x + s * 0.40, y: y0 + ROW.header, kind: 'header', win: w.id, col: c, floor: f });
      }
    }
    // 柱の帯（列の境目）も帯の一部として持てる
    if (f > 0) for (let b = 1; b < st.cols; b++) {
      const c0 = b - 1, c1 = b;
      const blkL = inBlock(st, c0, f), blkR = inBlock(st, c1, f);
      if ((blkL && blkL.kind !== 'neon' && f > blkL.f0) && (blkR && blkR.kind !== 'neon' && f > blkR.f0)) continue;
      addHold({ x: edgeX(st, b), y: y0 + ROW.cornice, kind: 'cornice', win: -1, col: -1, floor: f });
    }
  }
  // 配管（雨どい）: 0.62m ごとの留め金を保持点に。窓の間隔が広い所の中継
  for (const b of st.pipes) {
    const x = edgeX(st, b) + (b === 0 ? 0.32 : b === st.cols ? -0.32 : 0);
    for (let y = 0.95; y < top - 0.2; y += 0.62) addHold({ x, y, kind: 'pipe', win: -1, col: -1, floor: Math.floor(y / FLOOR_H), pipe: b });
  }
  // 看板の縁（左右の縦の枠）は中継の保持点
  for (const blk of st.blocks) {
    if (blk.kind === 'neon') continue;
    for (const side of [-1, 1]) {
      const x = (side < 0 ? colX(st, blk.c0) - COL_W / 2 + 0.12 : colX(st, blk.c1) + COL_W / 2 - 0.12);
      for (let y = blk.f0 * FLOOR_H + 0.4; y < (blk.f1 + 1) * FLOOR_H; y += 0.62) addHold({ x, y, kind: 'relay', win: -1, col: -1, floor: Math.floor(y / FLOOR_H) });
    }
  }
  // 屋上の縁（パラペット）: 全幅に 0.45m ごと
  const hw = halfWidth(st);
  for (let x = -hw + 0.3; x <= hw - 0.3 + 1e-6; x += 0.45) addHold({ x, y: top + 0.05, kind: 'roof', win: -1, col: -1, floor: st.floors });
  // 安全区画（バルコニー）: 指定階の、中央に近い列
  const ledges = st.ledges.map((f) => {
    let c = Math.floor(st.cols / 2);
    for (let k = 0; k < st.cols; k++) { const cc = (c + (k % 2 ? -1 : 1) * Math.ceil(k / 2) + st.cols) % st.cols; if (!inBlock(st, cc, f)) { c = cc; break; } }
    return { floor: f, col: c, x: colX(st, c), y: f * FLOOR_H };
  });
  // 地上の窓は少し低い開口（ショーウィンドウ）なので住人は出ない
  return { def: st, windows, holds, ledges, top, halfW: hw, floors: st.floors, cols: st.cols };
}

// 開始位置（地上に立つ）。肩の高さ 1.45m・中央の列
// 開始は中央の列の窓の正面（列の境目の雨どいの真正面を避ける）
export function startPose(b) { return { x: colX(b.def, Math.floor(b.cols / 2)), y: 1.45 }; }
// 安全区画から復帰する位置
export function ledgePose(b, ledge) { return { x: ledge.x, y: ledge.y + 1.45 }; }
