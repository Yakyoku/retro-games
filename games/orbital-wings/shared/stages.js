// 全 7 ステージ: 地形・敵の出現（スクロール距離で管理）・チェックポイント・色・曲
// 出来事は ev.x（ワールド x）で並べ、画面の右端がそこへ届いた時に起きる。チェックポイントから再開すると、
// その時点で画面より右にある出来事から順に起き直す（地形は x の関数なので常に同じ形）。
import { VIEW_W, VIEW_H, DEPTH } from './config.js';
import { buildTerrain, ramp, bump, cone, NONE_FLOOR, NONE_CEIL } from './terrain.js';
import { fbm, makeRng } from './rng.js';

const R = VIEW_W + 1.5;           // 画面の右外
let gid = 0;

function maker() {
  const ev = [];
  const add = (x, run) => ev.push({ x, run });
  const zOf = (g, z, i) => {
    if (!g.depth) return 0;
    if (z === 'p') return g.player.z;
    if (z === 'spread') return [-1.8, 0, 1.8, -0.9, 0.9][i % 5];
    if (z === 'alt') return i % 2 ? 1.6 : -1.6;
    return z ?? 0;
  };
  const api = {
    ev,
    // 編隊（全滅でカプセル 1 個）
    form(x, n, o = {}) {
      const id = ++gid;
      add(x, (g) => {
        const y0 = typeof o.y === 'function' ? o.y(g) : (o.y ?? VIEW_H / 2);
        for (let i = 0; i < n; i++) {
          const seq = o.pat === 'swoop' || o.pat === 'loop' || o.pat === 'wave' || o.pat === 'dive' || o.seq;
          g.spawn(o.type || 'dart', {
            x: o.from === 'left' ? g.camX - 2 - i * 1.4 : g.camX + R + (seq ? 0 : i * (o.gap ?? 1.5)),
            y: y0 + (o.dy ?? 0) * i, z: zOf(g, o.z, i),
            group: o.capsule === false ? null : id, pat: o.pat, delay: seq ? i * (o.delay ?? 9) : 0,
            carrier: o.carrier === i, ph: i * 6, ...o.props,
          });
        }
      });
    },
    // 単体（運搬役など）
    one(x, type, o = {}) {
      add(x, (g) => g.spawn(type, { x: o.wx ?? g.camX + R, y: o.y ?? VIEW_H / 2, z: zOf(g, o.z, 0), ...o.props }));
    },
    // 地形に付く敵（ワールド x に固定）
    gnd(x, type, side = 'f', o = {}) {
      add(x - VIEW_W - 0.5, (g) => g.spawn(type, { x, y: VIEW_H / 2, anchor: side, z: zOf(g, o.z, 0), ...o.props }));
    },
    // 壊せる石材・板の柱
    wall(x, y0, y1, type = 'brick', o = {}) {
      add(x - VIEW_W - 1, (g) => {
        for (let y = y0; y <= y1 + 1e-6; y += o.step ?? 1.6) {
          const zs = g.depth ? (o.zs ?? [-1.7, 0, 1.7]) : [0];
          for (const z of zs) g.spawn(type, { x, y, z, ...o.props });
        }
      });
    },
    at(x, fn) { add(x, fn); },
    done() { ev.sort((a, b) => a.x - b.x); return ev; },
  };
  return api;
}

// ---------------------------------------------------------------------------
// ステージ 1: 火山帯
function stage1() {
  const L = 470;
  const fn = (x) => {
    let f = NONE_FLOOR, c = NONE_CEIL;
    if (x > 55 && x < 440) {
      f = ramp(x, 55, 75, NONE_FLOOR, 1.2) + fbm(x * 0.18, 11) * 1.4 * ramp(x, 60, 80, 0, 1);
      f += cone(x, 150, 24, 7.2, 0.12) + cone(x, 205, 10, 2.5) + cone(x, 385, 22, 6.6, 0.12) + bump(x, 330, 18, 1.8);
      f = Math.min(f, ramp(x, 420, 440, 99, NONE_FLOOR));
      c = ramp(x, 95, 115, NONE_CEIL, 16.6) - fbm(x * 0.21, 31) * 1.3 * ramp(x, 100, 120, 0, 1);
      c -= cone(x, 285, 22, 6.4, 0.12) + cone(x, 240, 9, 2.2);
      c = Math.max(c, ramp(x, 415, 435, -99, NONE_CEIL));
    }
    return [f, c];
  };
  const terrain = buildTerrain({ length: L, fn });
  const m = maker();
  // 序盤: 基本操作と装備判断（障害物なし）
  m.form(8, 5, { y: 13, pat: 'wave', amp: 2 });
  m.form(22, 5, { y: 5, pat: 'wave', z: 'alt' });
  m.form(36, 4, { y: 12, pat: 'swoop', turnX: 16 });
  m.form(46, 4, { y: 6, pat: 'swoop', turnX: 16, z: -1.5 });
  m.one(52, 'dart', { y: 9, props: { carrier: true, pat: 'line', speed: 6 } });
  m.form(62, 6, { y: 15, pat: 'loop', props: { dir: -1 } });
  // 地上の砲台と歩兵
  m.gnd(84, 'turret', 'f'); m.gnd(92, 'turret', 'f', { z: 1.5 }); m.gnd(100, 'walker', 'f');
  m.form(98, 5, { y: 12, pat: 'swoop', turnX: 18, z: 'spread' });
  m.gnd(112, 'hatch', 'f'); m.gnd(120, 'turret', 'c'); m.gnd(126, 'turret', 'f', { z: -1.5 });
  // 第 1 の火山（噴火）
  m.gnd(150, 'vent', 'f', { props: { rate: 36, max: 22 } });
  m.form(150, 5, { y: 15, pat: 'wave', z: 'p' });
  m.gnd(172, 'walker', 'f'); m.gnd(178, 'walker', 'f', { z: 1.6 });
  m.form(185, 4, { y: 12, pat: 'swoop', turnX: 14 });
  m.one(195, 'heavy', { y: 11, props: { carrier: true } });
  // 中間（チェックポイント 230）
  m.gnd(240, 'turret', 'c'); m.gnd(248, 'turret', 'c', { z: 1.6 }); m.gnd(256, 'hatch', 'c');
  m.form(250, 5, { y: 4, pat: 'swoop', turnX: 17 });
  // 第 2 の火山（天井から逆さに噴く）
  m.gnd(285, 'vent', 'c', { props: { rate: 38, max: 22 } });
  m.form(290, 6, { y: 9, pat: 'loop', z: 'alt' });
  m.gnd(310, 'turret', 'f'); m.gnd(318, 'walker', 'f'); m.gnd(326, 'turret', 'f', { z: -1.6 }); m.gnd(334, 'hatch', 'f');
  m.form(330, 5, { y: 14, pat: 'wave', z: 'spread' });
  m.one(350, 'heavy', { y: 9 });
  // 第 3 の火山（大噴火）
  m.gnd(385, 'vent', 'f', { props: { rate: 26, max: 32 } });
  m.form(370, 4, { y: 15, pat: 'swoop', turnX: 20 });
  m.form(400, 5, { y: 14, pat: 'chase', from: 'left' });
  m.one(420, 'dart', { y: 9, props: { carrier: true, pat: 'wave', speed: 6 } });
  return {
    id: 1, name: '火山帯', en: 'VOLCANIC BELT', length: L, scroll: 2.6, checkpoints: [0, 230, L - 30], boss: 'ignis', terrain,
    events: m.done(), music: 'stage1',
    pal: { sky: ['#05030c', '#2a0a10'], far: '#3b1414', ground: ['#5a2b1c', '#c8612a', '#241010'], edge: '#ffa24a', glow: '#ff5a1e', fog: '#2a0a10', stars: 0.8, haze: '#8a2a12', neb: ['#8a2030', '#4a1c58', '#c84a1e'], comp: '#5a86c8', mist: '#5a2018' },
  };
}

// ステージ 2: 古代遺跡（狭い通路・遮蔽物・待ち伏せ）
function stage2() {
  const L = 480;
  const q = (v, s = 0.9) => Math.round(v / s) * s;          // 石を積んだ段の形
  const fn = (x) => {
    let f = q(1.6 + fbm(x * 0.08, 5) * 2.4 + bump(x, 120, 30, 2.6) + bump(x, 330, 26, 3.4));
    let c = q(16.4 - fbm(x * 0.09, 9) * 2.2 - bump(x, 175, 30, 2.6) - bump(x, 390, 24, 2.8));
    // 狭い通路 200〜265
    f += ramp(x, 196, 206, 0, 2.7) - ramp(x, 258, 268, 0, 2.7);
    c -= ramp(x, 196, 206, 0, 2.4) - ramp(x, 258, 268, 0, 2.4);
    if (x < 20) { f = ramp(x, 0, 20, NONE_FLOOR, f); c = ramp(x, 0, 20, NONE_CEIL, c); }
    if (x > 440) { f = ramp(x, 440, 452, f, 1.0); c = ramp(x, 440, 452, c, 17.0); }
    return [f, c];
  };
  const blocks = [];
  // 壊れない遺跡の柱（遮蔽物）
  for (const [x, y0, y1] of [[96, 0, 5.2], [142, 12.2, 18], [228, 6.2, 7.6], [300, 0, 6.0], [356, 11.4, 18], [410, 0, 4.6]]) blocks.push({ x0: x - 1.0, x1: x + 1.0, y0, y1, kind: 'pillar' });
  const terrain = buildTerrain({ length: L, fn, blocks });
  const m = maker();
  m.form(10, 5, { y: 11, pat: 'swoop', turnX: 16 });
  m.form(24, 5, { y: 7, pat: 'wave', z: 'alt' });
  m.gnd(44, 'popper', 'f'); m.gnd(50, 'popper', 'c', { z: 1.5 }); m.gnd(58, 'turret', 'f');
  m.wall(70, 6.2, 12.6, 'brick');
  m.form(72, 4, { y: 9, pat: 'line', speed: 9 });
  m.gnd(86, 'popper', 'f', { z: -1.5 }); m.gnd(104, 'popper', 'f'); m.gnd(110, 'turret', 'c');
  m.wall(130, 5.8, 10.6, 'brick'); m.gnd(134, 'hatch', 'c');
  m.form(140, 5, { y: 8, pat: 'wave', z: 'spread' });
  m.one(160, 'heavy', { y: 9, props: { carrier: true, stopX: 24 } });
  m.gnd(170, 'popper', 'c'); m.gnd(178, 'popper', 'f'); m.gnd(186, 'turret', 'f', { z: 1.6 });
  // 狭い通路
  m.form(204, 5, { y: 9, pat: 'line', speed: 7 });
  m.gnd(214, 'popper', 'f'); m.gnd(222, 'popper', 'c'); m.wall(238, 7.8, 10.2, 'brick', { step: 1.2 });
  m.gnd(246, 'turret', 'f'); m.gnd(252, 'turret', 'c', { z: -1.6 });
  m.form(262, 4, { y: 10, pat: 'swoop', turnX: 18 });
  m.wall(280, 4.8, 12, 'brick'); m.gnd(290, 'walker', 'f');
  m.form(300, 6, { y: 13, pat: 'loop', z: 'alt' });
  m.gnd(316, 'popper', 'f'); m.gnd(322, 'popper', 'f', { z: 1.6 }); m.gnd(330, 'hatch', 'f');
  m.wall(344, 7.2, 11, 'brick');
  m.form(352, 5, { y: 6, pat: 'swoop', turnX: 15 });
  m.gnd(372, 'turret', 'c'); m.gnd(380, 'popper', 'c'); m.gnd(388, 'walker', 'f');
  m.one(400, 'heavy', { y: 10 });
  m.form(420, 5, { y: 11, pat: 'wave', props: { carrier: false } });
  m.one(430, 'dart', { y: 8, props: { carrier: true, pat: 'line', speed: 6 } });
  return {
    id: 2, name: '古代遺跡', en: 'SUNKEN RUINS', length: L, scroll: 2.5, checkpoints: [0, 195, L - 30], boss: 'warden', terrain,
    events: m.done(), music: 'stage2',
    pal: { sky: ['#02060e', '#0c1a2a'], far: '#18283a', ground: ['#6e6650', '#b9ae86', '#2c2a22'], edge: '#e8dcae', glow: '#58d2ff', fog: '#0c1a2a', stars: 0.6, haze: '#1f5a78', neb: ['#1c5a88', '#2a2c78', '#3ac0c8'], comp: '#e8c88a', mist: '#6ac4e8' },
  };
}

// ステージ 3: 巨大石像（リング攻撃と射線の見極め）
function stage3() {
  const L = 480;
  const fn = (x) => {
    let f = 2.2 + fbm(x * 0.1, 3) * 1.2, c = 15.8 - fbm(x * 0.1, 7) * 1.2;
    if (x < 30) { f = ramp(x, 10, 30, NONE_FLOOR, f); c = ramp(x, 10, 30, NONE_CEIL, c); }
    // 中盤は天井が開ける
    c = Math.max(c, ramp(x, 215, 225, 0, NONE_CEIL) - ramp(x, 275, 285, 0, NONE_CEIL - 15.6) - 0);
    if (x > 440) { f = ramp(x, 440, 452, f, NONE_FLOOR); c = ramp(x, 440, 452, c, NONE_CEIL); }
    return [f, c];
  };
  const terrain = buildTerrain({ length: L, fn });
  const m = maker();
  m.form(6, 5, { y: 9, pat: 'wave' });
  m.form(18, 5, { y: 12, pat: 'swoop', turnX: 17, z: 'alt' });
  // 石像の顔が床と天井に交互に並ぶ
  const heads = [[56, 'f'], [70, 'c'], [88, 'f'], [104, 'c'], [122, 'f'], [138, 'c'], [158, 'f'], [176, 'c'], [196, 'f'],
    [300, 'c'], [316, 'f'], [334, 'c'], [352, 'f'], [370, 'c'], [388, 'f'], [404, 'c'], [420, 'f']];
  heads.forEach(([x, s], i) => m.gnd(x, 'stonehead', s, { z: (i % 3 - 1) * 1.4 }));
  m.form(64, 4, { y: 9, pat: 'line', speed: 8, type: 'wheel' });
  m.form(110, 5, { y: 9, pat: 'swoop', turnX: 16 });
  m.one(130, 'dart', { y: 9, props: { carrier: true, pat: 'wave', speed: 6 } });
  m.form(166, 5, { y: 8, type: 'wheel', z: 'spread' });
  // 開けた中盤: 転がる小さな顔の群れ
  m.form(218, 6, { y: 14, type: 'pebble', gap: 1.8, z: 'spread' });
  m.form(232, 6, { y: 4, type: 'pebble', gap: 1.8, z: 'spread' });
  m.one(246, 'heavy', { y: 9, props: { carrier: true } });
  m.form(262, 5, { y: 12, pat: 'loop' });
  m.form(278, 5, { y: 6, pat: 'loop', props: { dir: -1 } });
  m.form(340, 5, { y: 9, pat: 'wave', type: 'wheel' });
  m.form(376, 4, { y: 9, pat: 'swoop', turnX: 15 });
  m.one(410, 'dart', { y: 9, props: { carrier: true, pat: 'line', speed: 6 } });
  return {
    id: 3, name: '巨大石像', en: 'STONE COLOSSI', length: L, scroll: 2.5, checkpoints: [0, 210, L - 30], boss: 'colossus', terrain,
    events: m.done(), music: 'stage3',
    pal: { sky: ['#06040e', '#1c1430'], far: '#2a2240', ground: ['#5c5a66', '#a8a4b4', '#22202a'], edge: '#d8d2ea', glow: '#ffd27a', fog: '#1c1430', stars: 1.0, haze: '#a85040', neb: ['#5a2a80', '#2a2a70', '#b04a60'], comp: '#ffb060', mist: '#7a4a78' },
  };
}

// ステージ 4: 地形の難所（天井・床から迫る構造物と複合攻撃）
function stage4() {
  const L = 500;
  const fn = (x) => {
    const zig = Math.sin(x * 0.045) * 2.2 + Math.sin(x * 0.11) * 0.8;
    let f = 3.2 + zig + fbm(x * 0.25, 13) * 0.7, c = 14.6 + zig + fbm(x * 0.25, 17) * 0.7 - 0.7;
    // 段々（下り階段）
    if (x > 290 && x < 360) { const st = Math.floor((x - 290) / 10); f = 6 - st * 0.75; c = f + 9.5; }
    if (x < 25) { f = ramp(x, 5, 25, NONE_FLOOR, f); c = ramp(x, 5, 25, NONE_CEIL, c); }
    if (x > 455) { f = ramp(x, 455, 468, f, 1.0); c = ramp(x, 455, 468, c, 17); }
    return [f, c];
  };
  const terrain = buildTerrain({ length: L, fn });
  const m = maker();
  m.form(8, 5, { y: 10, pat: 'swoop', turnX: 17 });
  m.form(20, 5, { y: 8, pat: 'wave', z: 'alt' });
  const pistons = [[50, 'c', 0], [60, 'f', 40], [74, 'c', 75], [88, 'f', 10], [96, 'c', 60], [150, 'f', 0], [158, 'c', 75], [166, 'f', 30],
    [230, 'c', 0], [240, 'f', 50], [250, 'c', 100], [380, 'f', 0], [390, 'c', 50], [400, 'f', 100], [410, 'c', 25], [430, 'f', 70]];
  for (const [x, s, ph] of pistons) m.gnd(x, 'piston', s, { props: { phase0: ph, maxExt: 6.2, period: 150 } });
  m.gnd(66, 'turret', 'f'); m.gnd(80, 'turret', 'c');
  m.form(104, 5, { y: 9, pat: 'line', speed: 9, z: 'spread' });
  m.gnd(116, 'hatch', 'f'); m.gnd(124, 'hatch', 'c');
  m.one(136, 'heavy', { y: 9, props: { carrier: true } });
  m.gnd(176, 'walker', 'f'); m.gnd(182, 'walker', 'c'); m.gnd(188, 'turret', 'f', { z: 1.6 });
  m.form(196, 5, { y: 9, pat: 'swoop', turnX: 16 });
  m.form(210, 5, { y: 9, pat: 'chase', from: 'left' });
  // 中間（チェックポイント 220）
  m.gnd(262, 'turret', 'c'); m.gnd(268, 'turret', 'f'); m.gnd(274, 'turret', 'c', { z: -1.6 });
  m.form(276, 5, { y: 9, pat: 'wave', z: 'p' });
  // 上下に動く壁の区間
  for (const [x, ph] of [[300, 0], [312, 60], [324, 120], [336, 30], [348, 90]]) m.gnd(x, 'slider', 'f', { props: { y: 9 - (x - 300) * 0.07, phase0: ph, amp: 2.2, h: 3, freq: 0.03 } });
  m.form(318, 4, { y: 9, pat: 'line', speed: 6 });
  m.one(362, 'heavy', { y: 9 });
  m.gnd(372, 'hatch', 'c'); m.gnd(418, 'turret', 'f'); m.gnd(422, 'turret', 'c');
  m.form(440, 5, { y: 9, pat: 'swoop', turnX: 18 });
  m.one(448, 'dart', { y: 9, props: { carrier: true, pat: 'line', speed: 6 } });
  return {
    id: 4, name: '地形の難所', en: 'IRON GAUNTLET', length: L, scroll: 2.6, checkpoints: [0, 220, L - 30], boss: 'crusher', terrain,
    events: m.done(), music: 'stage4',
    pal: { sky: ['#030508', '#121a1e'], far: '#1f2a2c', ground: ['#3e4846', '#8a9a8e', '#141a1a'], edge: '#ffd890', glow: '#ff8a1e', fog: '#121a1e', stars: 0.5, haze: '#3a5a50', neb: ['#1c4a44', '#2a3a30', '#6a5a20'], comp: '#ff8a1e', mist: '#5a7a6a' },
  };
}

// ステージ 5: 生体要塞（触手・可動する障害物・生物的な攻撃）
function stage5() {
  const L = 480;
  const fn = (x) => {
    let f = 2.4 + fbm(x * 0.14, 21) * 2.6 + bump(x, 160, 26, 3) + bump(x, 360, 30, 2.5);
    let c = 15.4 - fbm(x * 0.14, 23) * 2.6 - bump(x, 250, 28, 3.2) - bump(x, 420, 20, 2);
    if (x < 25) { f = ramp(x, 5, 25, NONE_FLOOR, f); c = ramp(x, 5, 25, NONE_CEIL, c); }
    if (x > 448) { f = ramp(x, 448, 460, f, 1.2); c = ramp(x, 448, 460, c, 16.8); }
    return [f, c];
  };
  const terrain = buildTerrain({ length: L, fn, pulse: [{ x0: 30, x1: 445, amp: 0.35, freq: 0.6, speed: 0.05 }] });
  const m = maker();
  m.form(8, 6, { y: 11, type: 'spore', gap: 1.6, z: 'spread' });
  m.form(22, 5, { y: 7, pat: 'swoop', turnX: 16 });
  const tents = [[52, 'f'], [64, 'c'], [80, 'f'], [96, 'c'], [130, 'f'], [138, 'c'], [196, 'f'], [210, 'c'], [292, 'f'], [300, 'c'], [340, 'f'], [386, 'c'], [400, 'f'], [432, 'c']];
  tents.forEach(([x, s], i) => m.gnd(x, 'tentacle', s, { z: (i % 3 - 1) * 1.5 }));
  m.gnd(72, 'hatch', 'f', { props: { color: 'flesh' } }); m.gnd(110, 'hatch', 'c', { props: { color: 'flesh' } });
  m.form(88, 6, { y: 9, type: 'spore', gap: 1.5 });
  m.one(118, 'heavy', { y: 9, props: { carrier: true, color: 'flesh' } });
  m.form(150, 5, { y: 12, pat: 'wave', z: 'alt' });
  m.form(172, 6, { y: 9, type: 'spore', gap: 1.4, z: 'spread' });
  m.gnd(226, 'hatch', 'f', { props: { color: 'flesh' } });
  m.form(232, 5, { y: 10, pat: 'swoop', turnX: 17 });
  m.form(262, 6, { y: 6, type: 'spore', gap: 1.5 });
  m.gnd(276, 'hatch', 'c', { props: { color: 'flesh' } });
  m.one(316, 'heavy', { y: 9, props: { color: 'flesh' } });
  m.form(352, 5, { y: 9, pat: 'loop', z: 'alt' });
  m.form(372, 6, { y: 12, type: 'spore', gap: 1.4 });
  m.gnd(414, 'hatch', 'f', { props: { color: 'flesh' } });
  m.one(424, 'dart', { y: 9, props: { carrier: true, pat: 'wave', speed: 6 } });
  return {
    id: 5, name: '生体要塞', en: 'FLESH BASTION', length: L, scroll: 2.4, checkpoints: [0, 220, L - 30], boss: 'hydra', terrain,
    events: m.done(), music: 'stage5',
    pal: { sky: ['#0a0206', '#2a0818'], far: '#3a0e20', ground: ['#6a2430', '#b85a58', '#240a10'], edge: '#f0b49a', glow: '#ffb040', fog: '#2a0818', stars: 0.3, haze: '#5a1830', neb: ['#6a1838', '#3a1450', '#a03020'], comp: '#ffb040', mist: '#7a2a40', organic: true },
  };
}

// ステージ 6: 細胞空間（膜・脈動する壁・移動経路の判断）
function stage6() {
  const L = 480;
  const fn = (x) => {
    let f = 2.6 + Math.sin(x * 0.07) * 1.6 + fbm(x * 0.2, 41) * 1.2, c = 15.4 + Math.sin(x * 0.07 + 2) * 1.6 - fbm(x * 0.2, 43) * 1.2;
    // 中央に柱（上下の道を選ぶ）
    if (x > 150 && x < 200) { const k = bump(x, 175, 50, 1); f += 0; c -= 0; }
    if (x < 25) { f = ramp(x, 5, 25, NONE_FLOOR, f); c = ramp(x, 5, 25, NONE_CEIL, c); }
    if (x > 446) { f = ramp(x, 446, 458, f, NONE_FLOOR); c = ramp(x, 446, 458, c, NONE_CEIL); }
    return [f, c];
  };
  const blocks = [{ x0: 158, x1: 196, y0: 7.6, y1: 10.4, kind: 'cellmass' }, { x0: 330, x1: 360, y0: 7.8, y1: 10.2, kind: 'cellmass' }];
  const terrain = buildTerrain({ length: L, fn, blocks, pulse: [{ x0: 30, x1: 440, amp: 1.1, freq: 0.25, speed: 0.045 }] });
  const m = maker();
  m.form(8, 5, { y: 10, type: 'blob', gap: 2.2 });
  m.form(20, 5, { y: 8, pat: 'wave', z: 'alt' });
  for (const x of [60, 96, 128, 220, 262, 300, 384, 420]) m.gnd(x, 'membrane', 'f', { props: { regenT: 320 } });
  m.form(72, 4, { y: 12, type: 'blob', gap: 2.6, z: 'spread' });
  m.form(106, 5, { y: 6, pat: 'swoop', turnX: 16 });
  m.one(140, 'dart', { y: 13, props: { carrier: true, pat: 'line', speed: 6 } });
  m.form(160, 5, { y: 13, pat: 'line', speed: 7 });
  m.form(170, 5, { y: 5, pat: 'line', speed: 7 });
  m.form(232, 4, { y: 9, type: 'blob', gap: 2.4 });
  m.one(246, 'heavy', { y: 10, props: { carrier: true, color: 'cell' } });
  m.form(274, 5, { y: 9, pat: 'loop', z: 'alt' });
  m.form(312, 5, { y: 11, type: 'spore', gap: 1.5 });
  m.form(340, 5, { y: 13, pat: 'line', speed: 7 });
  m.form(350, 5, { y: 5, pat: 'line', speed: 7 });
  m.form(396, 4, { y: 9, type: 'blob', gap: 2.4, z: 'spread' });
  m.one(430, 'dart', { y: 9, props: { carrier: true, pat: 'wave', speed: 6 } });
  return {
    id: 6, name: '細胞空間', en: 'CELL SEA', length: L, scroll: 2.4, checkpoints: [0, 210, L - 30], boss: 'nucleus', terrain,
    events: m.done(), music: 'stage6',
    pal: { sky: ['#020a08', '#06261e'], far: '#0a3a2c', ground: ['#2a6a4a', '#7adcae', '#0a2216'], edge: '#c8ffe8', glow: '#5affc0', fog: '#06261e', stars: 0.2, haze: '#0e5a48', neb: ['#0e5a4a', '#1a3a60', '#3ac8a0'], comp: '#ffe08a', mist: '#3ab090', organic: true },
  };
}

// ステージ 7: 機械要塞（複合砲台・装備を活かす難所・最終中枢）
function stage7() {
  const L = 520;
  const q = (v) => Math.round(v / 1.2) * 1.2;
  const fn = (x) => {
    let f = q(2.4 + (Math.floor(x / 14) % 3) * 1.2 + bump(x, 140, 20, 2.4) + bump(x, 380, 24, 2.4));
    let c = q(15.6 - (Math.floor(x / 18 + 1) % 3) * 1.2 - bump(x, 200, 22, 2.4) - bump(x, 430, 20, 1.2));
    if (x < 20) { f = ramp(x, 0, 20, NONE_FLOOR, f); c = ramp(x, 0, 20, NONE_CEIL, c); }
    if (x > 476) { f = ramp(x, 476, 486, f, 1.2); c = ramp(x, 476, 486, c, 16.8); }
    return [f, c];
  };
  const blocks = [];
  for (const [x, y0, y1] of [[120, 7.2, 10.8], [260, 0, 6.6], [268, 11.4, 18], [446, 6.8, 11.2]]) blocks.push({ x0: x - 1.4, x1: x + 1.4, y0, y1, kind: 'metal' });
  const terrain = buildTerrain({ length: L, fn, blocks });
  const m = maker();
  m.form(8, 5, { y: 11, pat: 'swoop', turnX: 17 });
  m.form(20, 5, { y: 7, pat: 'loop', z: 'alt' });
  m.gnd(40, 'cannon', 'f'); m.gnd(48, 'cannon', 'c', { z: 1.6 });
  m.wall(60, 4.2, 14, 'shutter', { step: 1.5 });
  m.gnd(70, 'zapper', 'f', { props: { phase0: 0 } }); m.gnd(78, 'zapper', 'f', { z: 1.6, props: { phase0: 90 } });
  m.form(84, 5, { y: 9, pat: 'wave', z: 'spread' });
  m.gnd(96, 'hatch', 'f'); m.gnd(102, 'turret', 'c'); m.gnd(108, 'turret', 'c', { z: -1.6 });
  m.one(130, 'heavy', { y: 13, props: { carrier: true } });
  for (const [x, ph] of [[150, 0], [160, 50], [170, 100]]) m.gnd(x, 'slider', 'f', { props: { y: 9, phase0: ph, amp: 3.4, h: 3 } });
  m.gnd(186, 'cannon', 'f'); m.gnd(194, 'cannon', 'c');
  m.form(198, 6, { y: 9, pat: 'chase', from: 'left' });
  m.wall(214, 4.8, 13.6, 'shutter', { step: 1.5 });
  // 中間（チェックポイント 230）
  m.gnd(240, 'zapper', 'f', { props: { phase0: 0 } }); m.gnd(248, 'zapper', 'f', { props: { phase0: 60 } }); m.gnd(256, 'zapper', 'f', { z: -1.6, props: { phase0: 120 } });
  m.form(262, 5, { y: 9, pat: 'line', speed: 8 });
  m.gnd(284, 'cannon', 'f'); m.gnd(292, 'hatch', 'c'); m.gnd(300, 'cannon', 'f', { z: 1.6 });
  m.form(306, 5, { y: 12, pat: 'swoop', turnX: 17, z: 'spread' });
  m.wall(320, 4.0, 14, 'shutter', { step: 1.5 }); m.wall(326, 4.0, 14, 'shutter', { step: 1.5 });
  m.one(340, 'heavy', { y: 9 });
  for (const [x, ph] of [[354, 0], [364, 70], [374, 140]]) m.gnd(x, 'slider', 'f', { props: { y: 9.5, phase0: ph, amp: 3.2, h: 3.4 } });
  m.gnd(392, 'cannon', 'c'); m.gnd(400, 'zapper', 'f', { props: { phase0: 30 } }); m.gnd(410, 'turret', 'f'); m.gnd(416, 'turret', 'c');
  m.form(420, 5, { y: 9, pat: 'wave' });
  m.gnd(430, 'hatch', 'f'); m.gnd(436, 'hatch', 'c');
  m.one(460, 'dart', { y: 9, props: { carrier: true, pat: 'line', speed: 6 } });
  return {
    id: 7, name: '機械要塞', en: 'IRON CITADEL', length: L, scroll: 2.5, checkpoints: [0, 230, L - 30], boss: 'omega', terrain,
    events: m.done(), music: 'stage7',
    pal: { sky: ['#020308', '#0a1020'], far: '#141c34', ground: ['#3a4256', '#8898ba', '#141822'], edge: '#bfe0ff', glow: '#4ab0ff', fog: '#0a1020', stars: 0.7, haze: '#1c3264', neb: ['#1c3a80', '#3a2a78', '#3a90c8'], comp: '#ffb040', mist: '#3a5a98', metal: true },
  };
}

export const STAGES = [stage1(), stage2(), stage3(), stage4(), stage5(), stage6(), stage7()];
