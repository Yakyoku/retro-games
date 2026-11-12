// 鉄骨レスキュー — ステージ定義（自作の配置。座標はメートル、x 右・y 上、z は奥行き＝描画だけ）。
// platform: { id, x0, x1, y0, y1（x0・x1 での上面の高さ）, kind: girder|conveyor|floor|ledge, belt（m/s）, flow（樽の転がる向き ±1）, sink（端で樽を回収）, goal }
// ladder:   { x, lo（下の足場 id）, hi（上の足場 id）, broken（飾り。登れない） }
// 高さは足場の上面から計算する（tools なしで直せるよう、関数で組み立てる）。

const SLOPE = 0.03;

function zig(i, base, odd) {
  // 交互に傾く鉄骨。odd は [0, 14.6] で右が低い、even は [1.4, 16] で左が低い
  const len = 14.6, rise = len * SLOPE;
  return odd ? { id: 'L' + i, x0: 0.0, x1: 14.6, y0: base + rise, y1: base, kind: 'girder' }
             : { id: 'L' + i, x0: 1.4, x1: 16.0, y0: base, y1: base + rise, kind: 'girder' };
}

export function surfaceY(p, x) {
  const t = (x - p.x0) / (p.x1 - p.x0);
  return p.y0 + (p.y1 - p.y0) * Math.min(1, Math.max(0, t));
}

function finish(st) {
  const byId = {};
  for (const p of st.platforms) {
    byId[p.id] = p;
    if (p.flow == null) p.flow = p.belt ? Math.sign(p.belt) : (p.y1 < p.y0 ? 1 : p.y1 > p.y0 ? -1 : 1);
    p.thick = p.thick ?? (p.kind === 'floor' ? 0.4 : p.kind === 'conveyor' ? 0.34 : 0.4);
  }
  for (const l of st.ladders) {
    const lo = byId[l.lo], hi = byId[l.hi];
    if (!lo || !hi) throw new Error(`${st.id}: はしごの足場がない ${l.lo}/${l.hi}`);
    l.y0 = surfaceY(lo, l.x); l.y1 = surfaceY(hi, l.x);
  }
  st.byId = byId;
  return st;
}

// ------------------------------------------------------------ チュートリアル
const tutorial = finish({
  id: 'tutorial', index: -1, name: 'チュートリアル', sub: 'TRAINING YARD', width: 16, height: 8,
  tutorial: true, time: 999,
  spawn: { x: 1.5, plat: 'G' },
  platforms: [
    { id: 'G', x0: 0, x1: 16, y0: 0, y1: 0, kind: 'floor', flow: -1, sink: 6.2 },
    { id: 'U', x0: 6.5, x1: 16, y0: 2.6, y1: 2.6, kind: 'girder', flow: -1 },
  ],
  ladders: [
    { x: 9.0, lo: 'G', hi: 'U' },
    { x: 12.5, lo: 'G', hi: 'U', broken: true },
  ],
  hammers: [{ x: 11.0, plat: 'U' }],
  devices: [{ x: 15.0, plat: 'U', order: 1 }],
  steps: [
    { id: 'move', text: '←→（A・D）で歩こう。右の旗まで', zone: { x: 5.0 } },
    { id: 'jump', text: 'Space でジャンプ。木箱を跳び越えよう' },
    { id: 'ladder', text: '青いはしごの前で ↑（W）。赤い札のはしごは壊れていて登れない' },
    { id: 'danger', text: '樽が来る！ 赤く光ったら転がってくる合図。跳び越すと 100 点' },
    { id: 'hammer', text: 'ハンマーを取って F で振ろう（地上だけ・8 秒）。樽を壊すと 200 点' },
    { id: 'device', text: '右端の装置の前で F。最終面ではこれを順番に 4 つ解除する' },
  ],
  props: [{ type: 'crate', x: 6.2, plat: 'G' }],
  boss: null, captive: null,
});

// ------------------------------------------------------------ 第1面 鉄骨
const girders = finish({
  id: 'girders', index: 0, name: '第1面 鉄骨', sub: 'GIRDER CLIMB', width: 16, height: 16,
  spawn: { x: 2.4, plat: 'L0' }, mid: { x: 12.6, plat: 'L3b' },
  platforms: [
    { id: 'L0', x0: 0, x1: 16, y0: 0, y1: 16 * SLOPE * 0.6, kind: 'girder', sink: 0.9 },
    zig(1, 2.4, true),
    zig(2, 4.8, false),
    // 第3段は中央に 1m の切れ目（樽はここから下段へ抜ける分岐。人は跳び越す）
    { id: 'L3a', x0: 0.0, x1: 7.0, y0: 7.2 + 14.6 * SLOPE, y1: 7.2 + 7.6 * SLOPE, kind: 'girder' },
    { id: 'L3b', x0: 8.0, x1: 14.6, y0: 7.2 + 6.6 * SLOPE, y1: 7.2, kind: 'girder' },
    zig(4, 9.6, false),
    zig(5, 12.0, true),
    { id: 'TOP', x0: 5.4, x1: 9.0, y0: 14.5, y1: 14.5, kind: 'ledge', goal: true },
  ],
  ladders: [
    { x: 13.0, lo: 'L0', hi: 'L1' }, { x: 6.0, lo: 'L0', hi: 'L1', broken: true },
    { x: 3.6, lo: 'L1', hi: 'L2' }, { x: 9.4, lo: 'L1', hi: 'L2' },
    { x: 11.8, lo: 'L2', hi: 'L3b' }, { x: 5.0, lo: 'L2', hi: 'L3a', broken: true },
    { x: 2.6, lo: 'L3a', hi: 'L4' }, { x: 10.0, lo: 'L3b', hi: 'L4', broken: true },
    { x: 11.2, lo: 'L4', hi: 'L5' }, { x: 6.2, lo: 'L4', hi: 'L5' },
    { x: 8.4, lo: 'L5', hi: 'TOP' },
  ],
  hammers: [{ x: 2.6, plat: 'L2' }, { x: 13.4, plat: 'L4' }],
  boss: { x: 2.2, plat: 'L5', throwDir: 1, kind: 'barrel' },
  captive: { x: 6.4, plat: 'TOP' },
  decor: { brokenTags: true, drum: { x: 0.9, plat: 'L0' } },
});

// ------------------------------------------------------------ 第2面 搬送設備
const conveyors = finish({
  id: 'conveyors', index: 1, name: '第2面 搬送設備', sub: 'CONVEYOR WORKS', width: 16, height: 16,
  spawn: { x: 1.4, plat: 'F0' }, mid: { x: 14.0, plat: 'B2' },
  platforms: [
    { id: 'F0', x0: 0, x1: 16, y0: 0, y1: 0, kind: 'floor', flow: -1, sink: 0.4 },
    { id: 'B1a', x0: 0.6, x1: 7.2, y0: 2.6, y1: 2.6, kind: 'conveyor', belt: 1.0 },
    { id: 'B1b', x0: 8.8, x1: 15.4, y0: 2.6, y1: 2.6, kind: 'conveyor', belt: -1.0 },
    { id: 'B2', x0: 1.0, x1: 15.0, y0: 5.2, y1: 5.2, kind: 'conveyor', belt: -0.8 },
    { id: 'B3a', x0: 0.6, x1: 7.2, y0: 7.8, y1: 7.8, kind: 'conveyor', belt: -1.1 },
    { id: 'P3', x0: 7.6, x1: 8.4, y0: 7.8, y1: 7.8, kind: 'ledge', flow: 1 },
    { id: 'B3b', x0: 8.8, x1: 15.4, y0: 7.8, y1: 7.8, kind: 'conveyor', belt: 1.1 },
    { id: 'F4', x0: 1.6, x1: 14.4, y0: 10.4, y1: 10.4, kind: 'girder', flow: 1 },
    { id: 'TOP', x0: 6.4, x1: 9.6, y0: 13.0, y1: 13.0, kind: 'ledge', goal: true },
  ],
  ladders: [
    { x: 2.2, lo: 'F0', hi: 'B1a' }, { x: 14.0, lo: 'F0', hi: 'B1b' }, { x: 5.5, lo: 'F0', hi: 'B1a', broken: true },
    { x: 6.2, lo: 'B1a', hi: 'B2' }, { x: 10.0, lo: 'B1b', hi: 'B2' },
    { x: 2.0, lo: 'B2', hi: 'B3a' }, { x: 14.0, lo: 'B2', hi: 'B3b' }, { x: 8.0, lo: 'B2', hi: 'P3', broken: true },
    { x: 5.0, lo: 'B3a', hi: 'F4' }, { x: 11.0, lo: 'B3b', hi: 'F4' },
    { x: 8.0, lo: 'F4', hi: 'TOP' },
  ],
  hammers: [{ x: 12.6, plat: 'B1b' }, { x: 3.4, plat: 'F4' }],
  // 資材の木箱: ベルトの始点から周期で流れ、端のホッパーへ落ちる
  dispensers: [
    { plat: 'B1a', x: 0.9, period: 5.0, phase: 0.5 },
    { plat: 'B1b', x: 15.1, period: 5.6, phase: 2.6 },
    { plat: 'B3a', x: 6.9, period: 4.6, phase: 1.2 },
    { plat: 'B3b', x: 9.1, period: 4.8, phase: 3.4 },
  ],
  // 蒸気の噴き出し口（予告 → 噴出 → 休み。位相をずらし、待てば必ず通れる）
  vents: [
    { x: 4.6, plat: 'B2', w: 1.0, h: 1.9, period: 4.6, warn: 0.9, on: 1.3, phase: 0.0 },
    { x: 8.6, plat: 'B2', w: 1.0, h: 1.9, period: 4.6, warn: 0.9, on: 1.3, phase: 2.3 },
    { x: 11.8, plat: 'B2', w: 1.0, h: 1.9, period: 4.6, warn: 0.9, on: 1.3, phase: 1.1 },
  ],
  boss: { x: 2.4, plat: 'F4', throwDir: 1, kind: 'barrel', slow: 1.5 },
  captive: { x: 7.2, plat: 'TOP' },
});

// ------------------------------------------------------------ 第3面 昇降機
const elevators = finish({
  id: 'elevators', index: 2, name: '第3面 昇降機', sub: 'LIFT SHAFT', width: 16, height: 16,
  spawn: { x: 1.4, plat: 'G0' }, mid: { x: 14.6, plat: 'R1' },
  platforms: [
    { id: 'G0', x0: 0, x1: 3.5, y0: 0, y1: 0, kind: 'floor' },
    { id: 'G1', x0: 12.6, x1: 16, y0: 0, y1: 0, kind: 'floor' },
    { id: 'I1', x0: 6.6, x1: 8.4, y0: 7.0, y1: 7.0, kind: 'ledge' },
    { id: 'R1', x0: 11.3, x1: 15.4, y0: 3.2, y1: 3.2, kind: 'girder' },
    { id: 'R2', x0: 11.3, x1: 15.4, y0: 6.6, y1: 6.6, kind: 'girder' },
    { id: 'R3', x0: 11.3, x1: 15.4, y0: 9.6, y1: 9.6, kind: 'girder' },
    { id: 'T1', x0: 0.0, x1: 4.0, y0: 12.4, y1: 12.4, kind: 'girder' },
    { id: 'T2', x0: 6.0, x1: 9.2, y0: 12.4, y1: 12.4, kind: 'girder' },
    { id: 'T3', x0: 10.9, x1: 15.4, y0: 12.4, y1: 12.4, kind: 'girder' },
    { id: 'TOP', x0: 6.2, x1: 9.0, y0: 14.8, y1: 14.8, kind: 'ledge', goal: true },
  ],
  ladders: [
    { x: 14.6, lo: 'G1', hi: 'R1' },
    { x: 14.2, lo: 'R1', hi: 'R2' }, { x: 12.2, lo: 'R1', hi: 'R2', broken: true },
    { x: 12.4, lo: 'R2', hi: 'R3' },
    { x: 14.4, lo: 'R3', hi: 'T3' },
    { x: 7.0, lo: 'T2', hi: 'TOP' },
  ],
  hammers: [],
  // 昇降機: 縦の軸に並ぶ足場が一定速度で動き、端で生まれて端で消える
  lifts: [
    { x: 5.0, w: 1.4, dir: 1, speed: 0.9, yMin: -0.6, yMax: 11.4, gap: 3.4, crushY: 11.6 },
    { x: 10.0, w: 1.4, dir: -1, speed: 0.9, yMin: -0.6, yMax: 11.4, gap: 3.4, crushY: 11.6 },
  ],
  // 跳ねるボルト: 上段を左から右へ跳ねて渡り、右端の投入口へ落ちる
  bolts: { x: 3.2, y: 12.4, endX: 15.6, period: 4.2 },
  boss: { x: 2.0, plat: 'T1', throwDir: 1, kind: 'bolt' },
  captive: { x: 8.2, plat: 'TOP' },
  pitY: -1.2,
});

// ------------------------------------------------------------ 第4面 最上階
const summit = finish({
  id: 'summit', index: 3, name: '第4面 最上階', sub: 'THE SUMMIT', width: 16, height: 16,
  spawn: { x: 1.4, plat: 'S0' }, mid: { x: 2.0, plat: 'S2' },
  platforms: [
    { id: 'S0', x0: 0, x1: 16, y0: 0, y1: 0, kind: 'floor', flow: -1, sink: 0.4 },
    // 段ごとに端をずらし、樽が 1 段ずつ折り返して落ちるようにする
    { id: 'S1', x0: 1.4, x1: 15.4, y0: 2.6, y1: 2.6, kind: 'girder', flow: -1 },
    { id: 'S2', x0: 0.8, x1: 14.6, y0: 5.2, y1: 5.2, kind: 'girder', flow: 1 },
    { id: 'S3', x0: 1.6, x1: 15.2, y0: 7.8, y1: 7.8, kind: 'girder', flow: -1 },
    { id: 'S4', x0: 1.2, x1: 14.4, y0: 10.4, y1: 10.4, kind: 'girder', flow: 1 },
    { id: 'TOP', x0: 6.0, x1: 10.0, y0: 13.0, y1: 13.0, kind: 'ledge' },
  ],
  ladders: [
    { x: 3.0, lo: 'S0', hi: 'S1' }, { x: 13.0, lo: 'S0', hi: 'S1' },
    { x: 14.2, lo: 'S1', hi: 'S2' }, { x: 8.0, lo: 'S1', hi: 'S2' }, { x: 5.0, lo: 'S1', hi: 'S2', broken: true },
    { x: 1.8, lo: 'S2', hi: 'S3' }, { x: 9.6, lo: 'S2', hi: 'S3' },
    { x: 13.6, lo: 'S3', hi: 'S4' }, { x: 6.4, lo: 'S3', hi: 'S4' }, { x: 11.0, lo: 'S3', hi: 'S4', broken: true },
  ],
  hammers: [{ x: 6.0, plat: 'S1' }, { x: 12.0, plat: 'S3' }],
  // 装置（固定ボルトの制御盤）: ①→④ の順で解除する
  devices: [
    { x: 11.0, plat: 'S1', order: 1 },
    { x: 3.6, plat: 'S2', order: 2 },
    { x: 12.0, plat: 'S3', order: 3 },
    { x: 11.6, plat: 'S4', order: 4 },
  ],
  // 火花ロボ（足場を往復する。ハンマーで壊せる）
  bots: [
    { plat: 'S1', a: 1.9, b: 14.9, x: 9.0, dir: -1 },
    { plat: 'S2', a: 1.3, b: 14.1, x: 6.0, dir: 1 },
    { plat: 'S3', a: 2.1, b: 14.7, x: 4.0, dir: 1 },
  ],
  boss: { x: 3.0, plat: 'S4', throwDir: 1, kind: 'barrel', slow: 1.6 },
  captive: { x: 8.0, plat: 'TOP' },
});

export const TUTORIAL = tutorial;
export const STAGES = [girders, conveyors, elevators, summit];
export function stageById(id) { return id === 'tutorial' ? TUTORIAL : STAGES.find((s) => s.id === id); }
