// AEGIS RELAY — 3D モデル（すべて計算で組み立てる。外部のモデルファイルは使わない。意匠はこの作品の独自のもの）
// 単位: 論理 1px = 1 単位（盤面は 240×320）。+Y が上。自機は -Z が前、敵は +Z（手前）が前。
// 1 つの形は「動かない胴」と「動く部品」に分け、部品ごとに InstancedMesh で描く（util3d.js の Kind）。
// 色・発光・金属感は頂点に持たせるので、材質は全モデルで 1 つ（描画回数と切り替えを減らす）。
import * as THREE from 'three';
import { part, merge, slab, mirrorPts, hullZ, lathe, box, cyl, cylZ, sphere, torus, octa, ico, mirrorX } from './util3d.js';

const PI = Math.PI, TAU = PI * 2;
// 色
const C = {
  hull: 0xe6ecf6, hullMid: 0x9fb0cc, hullDark: 0x3d4a66, accent: 0x2ec5ff, glass: 0x0b2a4a, dark: 0x1a1f2b, steel: 0x8f98a8, steelD: 0x3a404c, barrel: 0xcdd3dd,
  gold: 0xffc94a, goldD: 0x9a6a18, goldGlow: 0xffd98a,
  scout: 0x9fb2d6, scoutD: 0x4b5a7c, red: 0xff4a4a,
  weaver: 0x2f9f68, weaverD: 0x17503a, mint: 0x9dffc9,
  slicer: 0xf58a3c, slicerD: 0x7a3a12, amber: 0xffb45e,
  gunner: 0x8558d6, gunnerD: 0x3c2670, violet: 0xcfa4ff,
  crystal: 0xdff4ff, cyan: 0x58d0ff,
  diver: 0xe03a5a, diverD: 0x6e1428, hot: 0xffd9e0,
  lancer: 0xddd2a6, lancerD: 0x5a543e, lancerGold: 0xffcf6a,
  twin: 0x6f7ad8, twinD: 0x2e3470, pink: 0xff4fa8,
  panel: 0x16303c, trace: 0x6ff0ff, warn: 0xffa040,
};
const P = (geo, o, tf) => part(geo, o, tf);
const ngon = (n, r, a0 = 0) => { const p = []; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
const rect = (w, d) => [-w / 2, -d / 2, w / 2, -d / 2, w / 2, d / 2, -w / 2, d / 2];
// 輪の一部（扇形の板）。r0..r1、角度 a0..a1
function arcPts(r0, r1, a0, a1, n = 6) { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); p.push(Math.cos(a) * r1, Math.sin(a) * r1); } for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); p.push(Math.cos(a) * r0, Math.sin(a) * r0); } return p; }
const both = (fn) => [fn(1), fn(-1)].flat();

// ───────── 自機 ─────────
export function playerGeos() {
  const g = [];
  const hullO = { c: C.hull, m: 0.75, r: 0.26, f: 1 }, midO = { c: C.hullMid, m: 0.8, r: 0.3, f: 1 }, darkO = { c: C.hullDark, m: 0.7, r: 0.4 };
  // 胴: 細い機首から太い後部へ
  g.push(P(hullZ([[0, -15.5], [0.8, -14], [1.7, -10.5], [2.7, -5.5], [3.2, 0], [3.0, 6.5], [2.5, 10.5], [2.0, 12]], 20, 1, 0.78), hullO));
  // 主翼（下層の大きな板）＋装甲（上層の小さな板）＋前縁の光
  g.push(P(slab(mirrorPts([2.4, -3.5, 5.2, -1.2, 13.6, 5.2, 14.4, 9.4, 9.2, 8.6, 6.4, 10.8, 2.4, 9.6]), 1.0, 0.4), hullO, { p: [0, -0.5, 0] }));
  g.push(P(slab(mirrorPts([2.8, -1.6, 5.4, 0.4, 11.2, 5.4, 11.4, 7.6, 6.6, 7.2, 2.8, 8.0]), 0.5, 0.2), midO, { p: [0, 0.15, 0] }));
  g.push(P(slab(mirrorPts([3.2, 1.6, 7.6, 4.6, 7.6, 6.2, 3.2, 6.6]), 0.4, 0.15), darkO, { p: [0, 0.5, 0] }));
  for (const s of [1, -1]) {
    g.push(P(box(0.45, 0.4, 11.4), { c: C.accent, e: 2.4 }, { p: [s * 9.3, -0.3, 1.9], r: [0, -s * 0.925, 0] }));           // 前縁の光
    g.push(P(sphere(0.55, 8, 6), { c: s > 0 ? 0x7dffb0 : 0xff6a6a, e: 4, f: 3 }, { p: [s * 14.1, -0.2, 8.2] }));              // 翼端灯
    g.push(P(box(2.4, 2.1, 7.5, 0.5), midO, { p: [s * 3.5, 0.3, 2.5] }));                                                      // 吸気口の覆い
    g.push(P(box(1.7, 1.3, 0.4), { c: 0x05080e, m: 0.2, r: 0.9 }, { p: [s * 3.5, 0.3, -1.3] }));                               // 吸気口の暗がり
    g.push(P(box(1.5, 0.25, 0.3), { c: C.accent, e: 1.6 }, { p: [s * 3.5, 1.0, -1.25] }));
    g.push(P(cylZ(1.25, 1.5, 4.2, 14), darkO, { p: [s * 2.5, 0.1, 11.2] }));                                                   // エンジン
    g.push(P(cylZ(1.0, 1.0, 0.5, 14), { c: 0x9ff4ff, e: 5 }, { p: [s * 2.5, 0.1, 13.2] }));                                    // 噴射口
    g.push(P(slab([0, 4.6, 4.6, 9.6, 4.6, 11.8, 0, 11.4], 0.45, 0.18), hullO, { p: [s * 3.9, 1.0, 0], r: [0, 0, s * (PI / 2 - 0.42)] })); // 垂直尾翼（外へ傾く）
    g.push(P(cylZ(0.28, 0.28, 6.5, 8), { c: C.barrel, m: 0.9, r: 0.25 }, { p: [s * 1.5, -0.9, -9.5] }));                       // 機銃
    g.push(P(box(0.9, 0.3, 3.4), { c: C.accent, e: 0.9 }, { p: [s * 1.25, 1.55, 3.6] }));                                      // 背の標識
  }
  // 操縦席の内側（奥行き）: 暗い槽・座席・計器の光
  g.push(P(box(2.3, 1.2, 6.4, 0.4), { c: 0x0a1018, m: 0.3, r: 0.8 }, { p: [0, 1.75, -5.4] }));
  g.push(P(box(1.1, 1.0, 1.4, 0.3), { c: 0x2a3344, m: 0.3, r: 0.7 }, { p: [0, 2.3, -4.2] }));
  g.push(P(box(1.4, 0.25, 0.5), { c: 0x7dffd0, e: 2.2, f: 4 }, { p: [0, 2.3, -7.4] }));
  g.push(P(hullZ([[0, -9.5], [1.5, -8], [1.75, -3], [1.5, -1], [0, -0.5]], 12, 1, 0.5), midO, { p: [0, 1.25, 0] })); // 操縦席の縁
  const body = merge(g);
  // キャノピー（半透明のガラス。別の材質）
  const glass = new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, PI * 0.55); glass.scale(1.45, 1.75, 3.9); glass.translate(0, 1.7, -5.3);
  // 合体の部品（右）: 外翼・砲・接合部の光。左は反転して使う
  const r = [];
  const goldO = { c: C.gold, m: 0.9, r: 0.24, f: 1 }, goldDO = { c: C.goldD, m: 0.8, r: 0.4 };
  r.push(P(slab([12.6, 3.6, 16.0, 2.6, 22.5, 8.6, 21.6, 11.6, 15.4, 10.4, 12.4, 10.2], 1.2, 0.45), goldO, { p: [0, -0.3, 0] }));
  r.push(P(slab([13.4, 5.0, 16.2, 4.4, 20.2, 8.6, 19.4, 10.2, 13.6, 9.2], 0.5, 0.2), goldDO, { p: [0, 0.45, 0] }));
  r.push(P(cylZ(1.25, 1.45, 9.5, 12), goldDO, { p: [17.6, -0.2, 4.6] }));
  r.push(P(cylZ(0.55, 0.55, 6, 10), { c: C.barrel, m: 0.9, r: 0.2 }, { p: [17.6, -0.2, -3.0] }));
  r.push(P(cylZ(0.8, 0.8, 0.8, 10), { c: C.goldGlow, e: 3.5 }, { p: [17.6, -0.2, -5.8] }));
  r.push(P(cylZ(1.0, 1.0, 0.5, 12), { c: 0xffd98a, e: 5 }, { p: [17.6, -0.2, 9.6] }));
  r.push(P(box(0.7, 0.6, 6.2), { c: 0xfff0b0, e: 3.2, f: 4 }, { p: [12.9, 0.1, 6.8] }));  // 接合部の光
  r.push(P(box(4.5, 0.3, 0.5), { c: 0xfff0b0, e: 2.2, f: 2 }, { p: [18.4, 0.5, 8.4], r: [0, -0.75, 0] }));
  const relayR = merge(r), relayL = mirrorX(relayR);
  return { body, glass, relayR, relayL };
}

// ───────── 支援機 ARC ─────────
export function partnerGeos() {
  const b = [];
  b.push(P(ico(2.5, 1), { c: 0xfff0b0, e: 3.5, f: 4 }));
  b.push(P(octa(3.5), { c: C.gold, m: 0.9, r: 0.2 }, { s: [1, 0.55, 1], r: [0, PI / 4, 0] }));
  for (const s of [1, -1]) b.push(P(slab([3.2, -1.2, 9.6, 2.4, 10.6, 6.4, 5.2, 4.2, 3.2, 3.2].map((v, i) => (i % 2 ? v : v * s)), 0.9, 0.3), { c: C.gold, m: 0.9, r: 0.25, f: 1 }));
  const mk = (R, n) => { const q = [P(torus(R, 0.42, 8, 36), { c: C.goldD, m: 0.9, r: 0.3 })]; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; q.push(P(sphere(0.75, 8, 6), { c: 0xfff0b0, e: 4 }, { p: [Math.cos(a) * R, 0, Math.sin(a) * R] })); } return merge(q); };
  return { body: merge(b), ring1: mk(6.4, 4), ring2: mk(4.9, 2) };
}

// ───────── 空の敵 ─────────
// 各種類 { parts: [形...], cap, pose(K, e, st, T) }。pose は Kind.add() のあとで部品を置く
export function airKinds() {
  const K = {};
  { // スカウト: 矢じり形の小型戦闘機
    const b = [], o = { c: C.scout, m: 0.75, r: 0.3, f: 1 }, d = { c: C.scoutD, m: 0.7, r: 0.42 };
    b.push(P(slab(mirrorPts([0, 9.5, 2.0, 3.5, 7.8, -5.2, 7.0, -7.6, 3.2, -5.0, 1.7, -7.8]), 1.3, 0.5), o, { p: [0, -0.2, 0] }));
    b.push(P(slab(mirrorPts([0, 6.5, 1.6, 2.5, 5.2, -3.6, 2.4, -3.4, 1.2, -5.6]), 0.5, 0.2), d, { p: [0, 0.55, 0] }));
    b.push(P(hullZ([[0, 10.5], [1.1, 7], [1.75, 1], [1.5, -5.5], [1.0, -8]], 12, 1, 0.8), o));
    b.push(P(sphere(1.05, 10, 8), { c: C.red, e: 4, f: 4 }, { p: [0, 1.25, 3.2], s: [1, 0.7, 1.6] }));
    b.push(P(cylZ(1.0, 1.25, 2, 10), d, { p: [0, 0, -8] }));
    b.push(P(cylZ(0.8, 0.8, 0.4, 10), { c: 0xffb070, e: 5 }, { p: [0, 0, -9.1] }));
    for (const s of [1, -1]) { b.push(P(slab([0, -4, 2.6, -7.4, 2.6, -8.4, 0, -7.6], 0.35, 0.12), d, { p: [s * 5.6, 0.2, 0], r: [0, 0, s * (PI / 2 - 0.3)] })); b.push(P(box(0.3, 0.3, 5.5), { c: C.red, e: 1.6 }, { p: [s * 4.6, 0.0, -0.4], r: [0, s * 0.59, 0] })); }
    K.scout = { parts: [merge(b)], cap: 20, pose(k) { k.part(0); } };
  }
  { // ウィーバー: 三枚羽のドローン
    const h = [], o = { c: C.weaver, m: 0.6, r: 0.35, f: 1 }, d = { c: C.weaverD, m: 0.6, r: 0.5 };
    h.push(P(torus(3.5, 1.15, 10, 28), o));
    h.push(P(ico(2.0, 1), { c: C.mint, e: 3.2, f: 4 }, { s: [1, 0.8, 1] }));
    h.push(P(cyl(2.6, 3.1, 1.0, 16), d, { p: [0, -1.0, 0] }));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; h.push(P(box(0.7, 0.6, 2.4), d, { p: [Math.sin(a) * 2.4, 0.5, Math.cos(a) * 2.4], r: [0, a, 0] })); }
    const r = [];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU;
      r.push(P(slab([-1.0, 3.6, 0.9, 3.4, 2.2, 7.6, 1.2, 9.6, -0.9, 8.4], 0.7, 0.28), o, { r: [0.12, a, 0] }));
      r.push(P(slab([1.0, 4.2, 2.3, 7.6, 1.3, 9.4, 1.3, 7.4], 0.5, 0.1), { c: C.mint, e: 2.2 }, { p: [0, 0.2, 0], r: [0.12, a, 0] })); }
    r.push(P(torus(3.0, 0.3, 6, 24), { c: C.mint, e: 1.2 }, { p: [0, 0.9, 0] }));
    K.weaver = { parts: [merge(h), merge(r)], cap: 20, pose(k, e, st) { k.part(0); k.part(1, 0, 0.2, 0, 0, st.spin * 1.0, 0); } };
  }
  { // スライサー: 回転刃の円盤
    const r = [], o = { c: C.slicer, m: 0.85, r: 0.25 }, d = { c: C.slicerD, m: 0.7, r: 0.45 };
    r.push(P(cyl(5.2, 5.6, 0.9, 28), o));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU;
      r.push(P(slab([-1.9, 4.6, 1.7, 4.8, 3.4, 8.9, -0.4, 6.6], 0.55, 0.22), { c: 0xffe1bf, m: 0.95, r: 0.15 }, { r: [0, a, 0] }));
      r.push(P(box(0.35, 0.25, 2.2), { c: C.amber, e: 2.4 }, { p: [Math.sin(a + 0.25) * 6.6, 0.3, Math.cos(a + 0.25) * 6.6], r: [0, a + 0.75, 0] })); }
    r.push(P(torus(4.2, 0.35, 6, 28), d, { p: [0, 0.55, 0] }));
    const h = [];
    h.push(P(lathe([[0, -1.3], [2.4, -0.9], [3.2, 0], [2.8, 0.9], [1.6, 1.5], [0, 1.7]], 18), d));
    h.push(P(sphere(1.25, 10, 8), { c: C.amber, e: 4, f: 4 }, { p: [0, 1.3, 0.8], s: [1, 0.6, 1.2] }));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; h.push(P(box(0.5, 0.4, 1.2), { c: C.amber, e: 1.5 }, { p: [Math.sin(a) * 2.6, 0.7, Math.cos(a) * 2.6], r: [0, a, 0] })); }
    K.slicer = { parts: [merge(r), merge(h)], cap: 16, pose(k, e, st) { k.part(0, 0, 0, 0, 0, st.spin * 1.6, 0); k.part(1); } };
  }
  { // ガンナー: 双胴の砲艦
    const b = [], o = { c: C.gunner, m: 0.7, r: 0.3, f: 1 }, d = { c: C.gunnerD, m: 0.7, r: 0.45 };
    for (const s of [1, -1]) {
      b.push(P(hullZ([[0, 9.5], [1.7, 6.5], [2.5, 1], [2.3, -6], [1.5, -9.5]], 12, 1, 0.85), o, { p: [s * 5.6, 0, 0] }));
      b.push(P(box(2.2, 0.8, 9, 0.3), d, { p: [s * 5.6, 1.7, -1.5] }));
      b.push(P(cylZ(1.1, 1.3, 1.4, 10), d, { p: [s * 5.6, 0, -9.6] }));
      b.push(P(cylZ(0.85, 0.85, 0.4, 10), { c: 0xd0a0ff, e: 4.5 }, { p: [s * 5.6, 0, -10.4] }));
      b.push(P(box(3.4, 0.7, 1.6), d, { p: [s * 2.9, 0.1, 3.4] })); b.push(P(box(3.4, 0.7, 1.6), d, { p: [s * 2.9, 0.1, -4.6] }));
      b.push(P(box(0.4, 0.3, 4), { c: C.violet, e: 1.8, f: 2 }, { p: [s * 5.6, 2.15, -1.5] }));
    }
    b.push(P(slab(mirrorPts([0, 6.4, 2.6, 3.4, 3.0, -4.4, 1.6, -7.2]), 2.6, 0.7), o));
    b.push(P(sphere(1.7, 12, 8), { c: C.violet, e: 3.2, f: 4 }, { p: [0, 1.5, 1.2], s: [1, 0.6, 1.5] }));
    const g = [];
    for (const s of [1, -1]) { g.push(P(cylZ(0.7, 0.9, 7.5, 10), { c: C.barrel, m: 0.9, r: 0.22 }, { p: [s * 5.6, -0.3, 10.5] })); g.push(P(cylZ(1.1, 1.1, 1.2, 10), d, { p: [s * 5.6, -0.3, 13.6] })); g.push(P(cylZ(0.6, 0.6, 0.3, 8), { c: C.violet, e: 3 }, { p: [s * 5.6, -0.3, 14.3] })); }
    K.gunner = { parts: [merge(b), merge(g)], cap: 10, pose(k, e, st) { k.part(0); k.part(1, 0, 0, -3.2 * st.recoil); } };
  }
  { // スピナー: 四枚の水晶の刃
    const r = [];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU;
      r.push(P(octa(1), { c: C.crystal, m: 0.35, r: 0.06, e: 0.22 }, { p: [Math.sin(a) * 5.4, 0, Math.cos(a) * 5.4], r: [0, a, 0], s: [1.7, 1.0, 4.4] }));
      r.push(P(octa(1), { c: C.cyan, e: 2.2 }, { p: [Math.sin(a) * 5.4, 0, Math.cos(a) * 5.4], r: [0, a, 0], s: [0.5, 0.45, 3.2] })); }
    const c = [];
    c.push(P(ico(2.3, 1), { c: C.cyan, e: 3.6, f: 4 }));
    c.push(P(torus(3.0, 0.35, 6, 24), { c: 0x9fb2c8, m: 0.9, r: 0.25 }));
    c.push(P(torus(3.0, 0.35, 6, 24), { c: 0x9fb2c8, m: 0.9, r: 0.25 }, { r: [0, 0, PI / 2] }));
    K.spinner = { parts: [merge(r), merge(c)], cap: 16, pose(k, e, st, T) { k.part(0, 0, 0, 0, 0, st.spin * 1.1, 0); const p = 1 + 0.14 * Math.sin(T * 6 + st.phase * TAU); k.part(1, 0, 0, 0, T * 0.9 + st.phase * 6, 0, T * 0.6, p); } };
  }
  { // ダイバー: 可変翼の突撃機
    const b = [], o = { c: C.diver, m: 0.7, r: 0.28, f: 1 }, d = { c: C.diverD, m: 0.7, r: 0.45 };
    b.push(P(hullZ([[0, 11.5], [1.3, 7], [2.3, 1], [2.1, -5.5], [1.4, -9]], 14, 1, 0.82), o));
    b.push(P(slab(mirrorPts([0, 7, 1.9, 2, 3.4, -6, 1.4, -8.4]), 0.7, 0.3), d, { p: [0, 0.9, 0] }));
    b.push(P(sphere(1.2, 10, 8), { c: C.hot, e: 3.6, f: 4 }, { p: [0, 1.5, 4.2], s: [0.9, 0.6, 2.0] }));
    b.push(P(slab([0, -3, 3.4, -8, 3.4, -9.6, 0, -8.6], 0.4, 0.15), o, { p: [0, 1.0, 0], r: [0, 0, PI / 2] }));
    for (const s of [1, -1]) { b.push(P(cylZ(0.95, 1.15, 2.4, 10), d, { p: [s * 1.25, -0.1, -9.2] })); b.push(P(cylZ(0.75, 0.75, 0.4, 10), { c: 0xffc0a0, e: 5 }, { p: [s * 1.25, -0.1, -10.5] })); }
    const w = [];
    w.push(P(slab([0, 3.4, 8.6, -3.6, 8.4, -7.4, 0.4, -3.4], 0.8, 0.3), o));
    w.push(P(slab([0.6, 2.0, 6.6, -3.0, 6.4, -5.2, 0.8, -2.4], 0.4, 0.15), d, { p: [0, 0.5, 0] }));
    w.push(P(box(0.35, 0.3, 9.2), { c: 0xff8fa8, e: 2.0 }, { p: [4.4, 0.0, 0.2], r: [0, 0.887, 0] }));
    const wr = merge(w), wl = mirrorX(wr);
    K.diver = { parts: [merge(b), wr, wl], cap: 12, pose(k, e, st) { k.part(0); const f = st.fold; k.part(1, 1.6, 0, 0.5, 0, -1.05 * f, -0.25 * f); k.part(2, -1.6, 0, 0.5, 0, 1.05 * f, 0.25 * f); } };
  }
  { // ランサー: 大型の槍形艦
    const b = [], o = { c: C.lancer, m: 0.75, r: 0.3, f: 1 }, d = { c: C.lancerD, m: 0.7, r: 0.5 };
    b.push(P(slab(mirrorPts([0, 16, 1.5, 9.5, 3.5, 3.5, 4.4, -6, 3.2, -12.5, 1.2, -13.5]), 2.6, 0.9), o));
    b.push(P(slab(mirrorPts([0, 10, 1.1, 5, 2.4, -2, 2.4, -9.5]), 1.0, 0.4), d, { p: [0, 1.6, 0] }));
    b.push(P(hullZ([[0, 21], [0.55, 17], [1.3, 12], [1.6, 6]], 10), { c: 0x30343c, m: 0.9, r: 0.25 }, { p: [0, -0.2, 0] }));
    b.push(P(box(3.4, 2.2, 5.2, 0.6), o, { p: [0, 2.9, -5.2] }));
    b.push(P(box(3.0, 0.5, 0.3), { c: C.lancerGold, e: 3.2, f: 3 }, { p: [0, 3.2, -2.55] }));
    b.push(P(box(0.3, 0.5, 3.6), { c: C.lancerGold, e: 2.2 }, { p: [1.75, 3.2, -5.2] })); b.push(P(box(0.3, 0.5, 3.6), { c: C.lancerGold, e: 2.2 }, { p: [-1.75, 3.2, -5.2] }));
    b.push(P(cyl(0.25, 0.25, 3.4, 6), d, { p: [0.9, 5.2, -6.6] })); b.push(P(sphere(0.4, 6, 5), { c: C.red, e: 4, f: 3 }, { p: [0.9, 7.0, -6.6] }));
    for (const s of [1, -1]) { b.push(P(cylZ(1.3, 1.5, 2.6, 12), d, { p: [s * 1.9, 0, -13.6] })); b.push(P(cylZ(1.05, 1.05, 0.4, 12), { c: 0xffd9a0, e: 5 }, { p: [s * 1.9, 0, -15] })); b.push(P(box(0.3, 0.3, 9), { c: C.lancerGold, e: 1.5, f: 2 }, { p: [s * 3.3, 1.35, -3] })); }
    const pd = [];
    for (const s of [1, -1]) {
      const pts = [4.6, 3.2, 10.6, -1.2, 11.8, -9.2, 5.2, -7.6].map((v, i) => (i % 2 ? v : v * s));
      pd.push(P(slab(pts, 1.8, 0.6), o, { p: [0, -0.2, 0] }));
      pd.push(P(box(2.6, 1.3, 5.5, 0.4), d, { p: [s * 8.3, 0.9, -4.2] }));
      pd.push(P(cylZ(0.7, 0.85, 6.5, 10), { c: C.barrel, m: 0.9, r: 0.22 }, { p: [s * 8.3, 0.3, 1.5] }));
      pd.push(P(cylZ(0.5, 0.5, 0.3, 8), { c: C.lancerGold, e: 3.5 }, { p: [s * 8.3, 0.3, 4.9] }));
      pd.push(P(sphere(0.55, 8, 6), { c: C.red, e: 4, f: 3 }, { p: [s * 10.6, 0.9, -8.2] }));
    }
    K.lancer = { parts: [merge(b), merge(pd)], cap: 6, pose(k, e, st) { k.part(0); const dp = st.deploy; k.part(1, 0, -0.6 * (1 - dp), -2.5 * (1 - dp), 0, 0, 0, 0.5 + 0.5 * dp, 1, 1); } };
  }
  // ジェミニ（半身）: 噛み合う歯を持つ半円の装甲
  const half = (s) => {
    const b = [], o = { c: C.twin, m: 0.75, r: 0.3, f: 1 }, d = { c: C.twinD, m: 0.7, r: 0.45 };
    const X = (v) => -s * v; // 相手側（中心側）を + とした横座標
    const pts = [];
    for (let i = 0; i <= 14; i++) { const a = -PI / 2 + (i / 14) * PI; pts.push(X(9 - 19 * Math.cos(a)), Math.sin(a) * 10); }           // 外側の弧
    for (let i = 7; i >= 1; i--) { const out = (i % 2) === (s < 0 ? 1 : 0); pts.push(X(9 + (out ? 1.7 : -0.6)), -10 + i * 2.5); }         // 噛み合う歯（左右で互い違い）
    b.push(P(slab(pts, 3.2, 0.8), o));
    const top = []; for (let i = 0; i <= 12; i++) { const a = -PI / 2 + (i / 12) * PI; top.push(X(6.2 - 13 * Math.cos(a)), Math.sin(a) * 7.4); }
    b.push(P(slab(top, 0.8, 0.3), d, { p: [0, 1.9, 0] }));
    b.push(P(box(0.7, 0.7, 13.6), { c: C.pink, e: 3.2, f: 4 }, { p: [X(7.4), 1.5, 0] }));                                                  // 継ぎ目の光
    b.push(P(lathe([[0, 0], [2.6, 0.2], [2.2, 1.6], [0, 2.2]], 14), o, { p: [X(0.5), 2.2, 0] }));
    b.push(P(sphere(0.9, 8, 6), { c: C.pink, e: 4, f: 4 }, { p: [X(0.5), 4.3, 0] }));
    for (const gx of [-3.5, 3.5]) { b.push(P(cylZ(0.5, 0.65, 4.2, 8), { c: C.barrel, m: 0.9, r: 0.25 }, { p: [X(gx), 0.2, gx < 0 ? 8.0 : 9.6] })); }
    for (let i = 0; i < 4; i++) { const a = -1.1 + i * 0.73; b.push(P(box(0.5, 0.4, 1.6), { c: C.pink, e: 1.8, f: 2 }, { p: [X(8.2 - 17.2 * Math.cos(a)), 1.4, Math.sin(a) * 9.0], r: [0, -s * a, 0] })); }
    return merge(b);
  };
  K.twinL = { parts: [half(-1)], cap: 4, pose(k) { k.part(0); } };
  K.twinR = { parts: [half(1)], cap: 4, pose(k) { k.part(0); } };
  { // ジェミニ合体形: 核＋逆回転する 2 重の装甲
    const c = [], o = { c: C.twin, m: 0.75, r: 0.3, f: 1 }, d = { c: C.twinD, m: 0.7, r: 0.45 };
    c.push(P(cyl(6.6, 7.6, 3.4, 28), d));
    c.push(P(lathe([[5.8, 1.6], [5.0, 2.8], [3.0, 3.4], [0, 3.6]], 24), o));
    c.push(P(sphere(3.6, 18, 12), { c: C.pink, e: 3.6, f: 4 }, { p: [0, 3.2, 0], s: [1, 0.7, 1] }));
    const r1 = [], r2 = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; r1.push(P(slab(arcPts(8.0, 11.0, a + 0.07, a + TAU / 6 - 0.07, 5), 2.6, 0.6), o)); r1.push(P(slab(arcPts(8.8, 10.2, a + 0.25, a + TAU / 6 - 0.25, 4), 0.5, 0.2), { c: C.pink, e: 1.4, f: 2 }, { p: [0, 1.45, 0] })); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; r2.push(P(slab(arcPts(11.9, 15.0, a + 0.06, a + TAU / 8 - 0.14, 4), 2.0, 0.6), i % 2 ? o : d, { p: [0, -0.3, 0] })); r2.push(P(sphere(0.7, 8, 6), { c: C.pink, e: 4, f: 3 }, { p: [Math.cos(a + 0.3) * 13.5, 1.0, Math.sin(a + 0.3) * 13.5] }));
      if (i % 2 === 0) r2.push(P(cyl(0.55, 0.7, 3, 8), { c: C.barrel, m: 0.9, r: 0.25 }, { p: [Math.cos(a + 0.3) * 15.6, 0, Math.sin(a + 0.3) * 15.6], r: [0, -a - 0.3, PI / 2] })); }
    K.twinM = { parts: [merge(c), merge(r1), merge(r2)], cap: 3, pose(k, e, st, T) { k.part(0); k.part(1, 0, 0.4, 0, 0, T * 1.7 + st.phase, 0); k.part(2, 0, 0, 0, 0, -T * 0.9, 0); } };
  }
  return K;
}

// ───────── 地上の標的 ─────────
// pose(K, o, st, T): st.aim=自機への向き、st.recoil、st.open（0..1）、st.stage（コアの装甲の段階）
export function groundKinds() {
  const K = {};
  const steel = { c: C.steel, m: 0.85, r: 0.32, f: 1 }, steelD = { c: C.steelD, m: 0.75, r: 0.5 }, brl = { c: C.barrel, m: 0.92, r: 0.2 };
  { // 砲台
    const b = [];
    b.push(P(slab(ngon(8, 9.2, PI / 8), 4.4, 0.9), steelD, { p: [0, 0.4, 0] }));
    b.push(P(slab(ngon(8, 7.2, PI / 8), 1.2, 0.4), steel, { p: [0, 3.0, 0] }));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; b.push(P(box(4.6, 2.4, 2.2, 0.5), steel, { p: [Math.sin(a) * 8.2, 1.2, Math.cos(a) * 8.2], r: [0.35, a, 0] })); b.push(P(box(1.4, 0.5, 0.5), { c: C.warn, e: 3.4, f: 3 }, { p: [Math.sin(a) * 8.9, 2.6, Math.cos(a) * 8.9], r: [0, a, 0] })); }
    b.push(P(torus(5.6, 0.35, 6, 28), { c: C.warn, e: 1.6 }, { p: [0, 3.7, 0] }));
    const h = [];
    h.push(P(lathe([[4.3, 0], [4.5, 1.2], [3.6, 3.0], [1.8, 3.9], [0, 4.1]], 18), steel));
    for (const s of [1, -1]) h.push(P(box(1.4, 2.6, 4.6, 0.4), steelD, { p: [s * 3.9, 1.6, 0.6] }));
    h.push(P(box(2.6, 2.0, 2.2, 0.4), steelD, { p: [0, 1.8, 3.6] }));
    h.push(P(sphere(0.7, 8, 6), { c: C.red, e: 4, f: 4 }, { p: [1.6, 3.5, 1.6] }));
    const g = [];
    g.push(P(cylZ(0.85, 1.05, 8.5, 12), brl, { p: [0, 1.8, 8.4] }));
    g.push(P(cylZ(1.3, 1.3, 1.6, 12), steelD, { p: [0, 1.8, 12.4] }));
    g.push(P(cylZ(0.6, 0.6, 0.3, 10), { c: C.warn, e: 3 }, { p: [0, 1.8, 13.3] }));
    K.turret = { parts: [merge(b), merge(h), merge(g)], cap: 10, pose(k, o, st) { k.part(0); k.part(1, 0, 3.6, 0, 0, st.aim, 0); k.part(2, 0, 3.6, 0, 0, st.aim, 0, 1, 1, 1 - 0.35 * st.recoil); } };
  }
  { // トーチカ: 六角の装甲、三連装砲、撃つ前に装甲が開く
    const b = [];
    b.push(P(slab(ngon(6, 12.4, PI / 6), 5.0, 1.0), steelD, { p: [0, 0.5, 0] }));
    b.push(P(slab(ngon(6, 9.6, PI / 6), 1.2, 0.4), { c: 0x2a2f38, m: 0.6, r: 0.6 }, { p: [0, 3.4, 0] }));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.push(P(box(1.6, 0.5, 0.5), { c: C.warn, e: 3.4, f: 3 }, { p: [Math.sin(a) * 11.6, 3.2, Math.cos(a) * 11.6], r: [0, a, 0] })); }
    b.push(P(cyl(5.5, 5.5, 0.6, 20), { c: 0xff7a3a, e: 1.8, f: 4 }, { p: [0, 3.9, 0] })); // 開いたときに見える内側の光
    const pt = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + PI / 6; pt.push(P(slab(arcPts(3.2, 9.4, a - 0.47, a + 0.47, 3), 1.6, 0.55), steel, { p: [0, 0, 0] })); pt.push(P(slab(arcPts(5.0, 8.0, a - 0.3, a + 0.3, 2), 0.5, 0.2), steelD, { p: [0, 1.0, 0] })); }
    const h = [];
    h.push(P(lathe([[3.4, 0], [3.4, 1.6], [2.4, 3.0], [0, 3.4]], 16), steel));
    for (let j = -1; j <= 1; j++) { h.push(P(cylZ(0.7, 0.85, 8, 10), brl, { p: [j * 2.2, 1.4, 5.6], r: [0, j * 0.22, 0] })); h.push(P(cylZ(0.5, 0.5, 0.3, 8), { c: C.warn, e: 3 }, { p: [j * 2.2 + Math.sin(j * 0.22) * 4.1, 1.4, 9.7] })); }
    h.push(P(box(6.6, 1.6, 2.2, 0.4), steelD, { p: [0, 1.4, 2.2] }));
    K.bunker = { parts: [merge(b), merge(pt), merge(h)], cap: 6, pose(k, o, st) { k.part(0); const op = st.open; k.part(1, 0, 4.4 - 0.9 * op, 0, 0, op * 0.5, 0, 1 + 0.42 * op, 1, 1 + 0.42 * op); k.part(2, 0, 3.2 + 1.6 * op, 0, 0, st.aim, 0, 1, 1, 1 - 0.25 * st.recoil); } };
  }
  { // 格納庫: 金色の基部、開閉するハッチ、流れる誘導灯
    const b = [], gd = { c: C.gold, m: 0.9, r: 0.26, f: 1 }, gdd = { c: C.goldD, m: 0.8, r: 0.42 };
    b.push(P(slab(ngon(12, 12.6).map((v, i) => (i % 2 ? v * 0.82 : v)), 3.6, 0.9), gdd, { p: [0, 0.3, 0] }));
    b.push(P(slab(arcPts(8.6, 11.2, 0, PI, 10), 1.4, 0.4), gd, { p: [0, 2.6, 0] })); b.push(P(slab(arcPts(8.6, 11.2, PI, TAU, 10), 1.4, 0.4), gd, { p: [0, 2.6, 0] }));
    b.push(P(cyl(8.2, 8.2, 0.5, 24), { c: 0xffe0a0, e: 2.2, f: 4 }, { p: [0, 1.6, 0], s: [1, 1, 0.78] }));  // ハッチの奥の光
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; b.push(P(sphere(0.6, 6, 5), { c: 0xfff0b0, e: 4, f: 2 }, { p: [Math.cos(a) * 11.6, 3.0, Math.sin(a) * 9.4] })); }
    for (const s of [1, -1]) { b.push(P(box(1.2, 2.4, 9, 0.4), gd, { p: [s * 13.2, 1.6, 0] })); for (let j = -2; j <= 2; j++) b.push(P(box(0.6, 0.4, 1.0), { c: 0xfff0b0, e: 3.4, f: 2 }, { p: [s * 13.2, 3.0, j * 1.9] })); }
    const dr = [];
    dr.push(P(slab([0, -6.4, 5.6, -5.6, 7.9, -2.4, 7.9, 2.4, 5.6, 5.6, 0, 6.4], 1.3, 0.45), gd));
    dr.push(P(slab([0.8, -4.6, 4.8, -4.0, 6.2, -1.6, 6.2, 1.6, 4.8, 4.0, 0.8, 4.6], 0.5, 0.2), gdd, { p: [0, 0.75, 0] }));
    dr.push(P(box(0.35, 0.4, 11.4), { c: 0xfff0b0, e: 2.6, f: 4 }, { p: [0.25, 0.5, 0] }));
    const dR = merge(dr), dL = mirrorX(dR);
    K.dock = { parts: [merge(b), dR, dL], cap: 4, pose(k, o, st) { k.part(0); const op = st.open * 5.4; k.part(1, op, 2.9, 0); k.part(2, -op, 2.9, 0); } };
  }
  { // ラティス・パネル: 回路を光が流れる
    const b = [];
    b.push(P(slab(rect(12.6, 12.6), 2.6, 0.7), { c: C.panel, m: 0.7, r: 0.4 }, { p: [0, 0.6, 0] }));
    b.push(P(slab(rect(10.2, 10.2), 0.5, 0.2), { c: 0x0c1c24, m: 0.5, r: 0.5 }, { p: [0, 2.0, 0] }));
    const tr = { c: C.trace, e: 2.0, f: 2 };
    for (const [x, z, w, d] of [[-2.4, -3.4, 4.6, 0.6], [-0.2, -1.6, 0.6, 4.2], [1.8, 0.2, 4.6, 0.6], [3.8, 1.9, 0.6, 4.0], [-2.8, 2.6, 3.4, 0.6], [-4.2, 0.4, 0.6, 4.8], [2.2, -3.6, 0.6, 2.2]]) b.push(P(box(w, 0.35, d), tr, { p: [x, 2.4, z] }));
    for (const [x, z] of [[-4.2, -3.4], [3.8, 3.8], [2.2, -4.6], [-1.2, 2.6]]) b.push(P(cyl(0.7, 0.7, 0.5, 8), { c: 0xcffaff, e: 2.6, f: 4 }, { p: [x, 2.45, z] }));
    for (const sx of [1, -1]) for (const sz of [1, -1]) b.push(P(cyl(0.6, 0.6, 0.5, 6), { c: C.steel, m: 0.9, r: 0.3 }, { p: [sx * 5.2, 2.0, sz * 5.2] }));
    K.panel = { parts: [merge(b)], cap: 18, pose(k) { k.part(0); } };
  }
  { // エリアコア: 基壇、3 重の回転リング、2 段の装甲殻、脈動する核
    const b = [];
    b.push(P(cyl(24.5, 26, 4.5, 40), steelD, { p: [0, 0.6, 0] }));
    b.push(P(cyl(20, 22, 3, 40), { c: 0x505866, m: 0.8, r: 0.4, f: 1 }, { p: [0, 4.0, 0] }));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; b.push(P(box(3.6, 5, 7, 0.8), steel, { p: [Math.sin(a) * 22.5, 2.4, Math.cos(a) * 22.5], r: [0, a, 0] })); b.push(P(box(2.0, 0.6, 0.6), { c: C.warn, e: 3.6, f: 3 }, { p: [Math.sin(a) * 25.3, 4.4, Math.cos(a) * 25.3], r: [0, a, 0] })); b.push(P(box(0.6, 0.3, 8), { c: C.pink, e: 1.8, f: 2 }, { p: [Math.sin(a + 0.39) * 16, 5.6, Math.cos(a + 0.39) * 16], r: [0, a + 0.39, 0] })); }
    b.push(P(cyl(9, 11, 3, 28), steelD, { p: [0, 6.5, 0] }));
    const ring = (R, n, col) => { const q = [P(torus(R, 0.9, 8, 48), steel)]; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; q.push(P(box(4.2, 2.6, 2.6, 0.6), steelD, { p: [Math.cos(a) * R, 0, Math.sin(a) * R], r: [0, -a + PI / 2, 0] })); q.push(P(box(2.4, 0.5, 0.5), { c: col, e: 3.2, f: 2 }, { p: [Math.cos(a) * (R + 1.5), 0.3, Math.sin(a) * (R + 1.5)], r: [0, -a + PI / 2, 0] })); } return merge(q); };
    const sh1 = [], sh2 = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; sh1.push(P(slab(arcPts(8.4, 14.6, a + 0.06, a + TAU / 6 - 0.06, 5), 2.4, 0.8), steel, { p: [0, 0, 0] })); sh1.push(P(slab(arcPts(10, 13, a + 0.2, a + TAU / 6 - 0.2, 4), 0.6, 0.2), steelD, { p: [0, 1.4, 0] })); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; sh2.push(P(slab(arcPts(4.6, 8.8, a + 0.08, a + TAU / 4 - 0.08, 5), 3.0, 0.9), { c: 0x6a7282, m: 0.85, r: 0.3, f: 1 })); sh2.push(P(box(0.5, 0.4, 3.4), { c: C.pink, e: 2.4, f: 4 }, { p: [Math.cos(a + TAU / 8) * 6.8, 1.7, Math.sin(a + TAU / 8) * 6.8], r: [0, -a - TAU / 8 + PI / 2, 0] })); }
    const orb = merge([P(sphere(6.2, 24, 16), { c: C.pink, e: 3.4, f: 4 }), P(ico(7.0, 0), { c: 0xffffff, m: 0.9, r: 0.1, e: 0.2 }, { s: 0.55 })]);
    K.core = { parts: [merge(b), ring(19.5, 6, C.warn), ring(15.2, 4, C.pink), ring(11.6, 3, 0xffffff), merge(sh1), merge(sh2), orb], cap: 1,
      pose(k, o, st, T) {
        k.part(0);
        k.part(1, 0, 9.5, 0, 0.12 * Math.sin(T * 0.7), T * 0.55, 0.1 * Math.cos(T * 0.6));
        k.part(2, 0, 11.5, 0, 0.5 * Math.sin(T * 0.9), -T * 0.9, 0.5 * Math.cos(T * 0.9));
        k.part(3, 0, 12.5, 0, T * 1.3, T * 0.7, 0.9);
        if (st.shell1 > 0.01) k.part(4, 0, 9.4 + (1 - st.shell1) * 5, 0, 0, T * 0.2, 0, 1 + (1 - st.shell1) * 0.7, st.shell1, 1 + (1 - st.shell1) * 0.7); else k.hide(4);
        if (st.shell2 > 0.01) k.part(5, 0, 11.4 + (1 - st.shell2) * 5, 0, 0, -T * 0.35, 0, 1 + (1 - st.shell2) * 0.7, st.shell2, 1 + (1 - st.shell2) * 0.7); else k.hide(5);
        const p = 1 + 0.07 * Math.sin(T * 5) + 0.25 * st.hurt; k.part(6, 0, 12.5, 0, T * 0.4, T * 0.6, 0, p);
      } };
  }
  return K;
}

// ───────── 破片（爆発で飛ぶ小さな板と角材）─────────
export function debrisGeo() {
  return merge([
    part(slab([-1, -0.7, 1.1, -0.4, 0.6, 0.9, -0.8, 0.6], 0.35, 0.1), { c: 0xb8c0cc, m: 0.85, r: 0.35 }),
  ]);
}
