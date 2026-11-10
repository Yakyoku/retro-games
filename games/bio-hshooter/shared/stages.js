// VOIDBLOOM — ステージ定義（ワールド座標。盤面は 32 × 18 u）
// top/bottom: 天井・床の折れ線、blocks: 固い障害物（hp があれば壊せる）、spawns: 出現（x に来たら右端から出る）
// checkpoints: やり直し地点の scrollX、bossStop: ボス戦でスクロールが止まる scrollX

const smooth = (t) => t * t * (3 - 2 * t);
function keyAt(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (x <= b[0]) return a[1] + (b[1] - a[1]) * smooth((x - a[0]) / (b[0] - a[0]));
  }
  return keys[keys.length - 1][1];
}
// 有機的な凹凸: 周期の違う正弦の重ね合わせ（決定的）
const bumps = (x, seed) => 0.55 * Math.sin(x * 0.21 + seed) + 0.32 * Math.sin(x * 0.57 + seed * 2.3) + 0.16 * Math.sin(x * 1.37 + seed * 0.7);
function profile(keys, ampKeys, seed, x0 = -12, x1 = 420, step = 0.75) {
  const pts = [];
  for (let x = x0; x <= x1; x += step) pts.push([+x.toFixed(2), +(keyAt(keys, x) + keyAt(ampKeys, x) * bumps(x, seed)).toFixed(3)]);
  return pts;
}
const sp = (x, type, o = {}) => ({ x, type, ...o });

// ---------------------------------------------------------------- 第 1 面
const s1 = {
  id: 1, name: 'GLASS REEF', ja: '硝子の礁', music: 'stage1', speed: 2.2, bossStop: 236, checkpoints: [0, 84, 150, 226],
  recover: ['C', 'S'],
  palette: { sky: 0x05080f, fog: 0x0a1624, metal: 0x5d6f82, flesh: 0x2a3a4a, glow: 0x4fe3ff, accent: 0x7dffb0, nebula: [0x0d3b5a, 0x2a0d44] },
  bottom: profile([[-12, -7], [30, -7], [36, 1.4], [110, 1.6], [122, 4.6], [138, 4.6], [150, 1.6], [200, 1.2], [420, 1.0]],
    [[-12, 0], [32, 0], [36, 1], [196, 1], [206, 0.35], [420, 0.35]], 1.3),
  top: profile([[-12, 25], [58, 25], [64, 15.6], [110, 15.4], [122, 12.6], [138, 12.6], [150, 15.8], [200, 16.8], [420, 17.0]],
    [[-12, 0], [60, 0], [64, 1], [196, 1], [206, 0.3], [420, 0.3]], 4.1),
  blocks: [
    { x: 127, y: 7.6, w: 1.4, h: 2.4, hp: 10, kind: 'cyst', score: 300 },
    { x: 167, y: -3, w: 1.6, h: 9, kind: 'crystal' },
    { x: 181, y: 10.5, w: 1.6, h: 9, kind: 'crystal' },
    { x: 193, y: -3, w: 1.2, h: 7.5, kind: 'crystal' },
  ],
  spawns: [
    sp(36, 'drifter', { y: 12, n: 6, gap: 12 }), sp(44, 'drifter', { y: 6, n: 6, gap: 12, ph: 3.1 }),
    sp(52, 'lantern', { y: 9, drop: 'P' }),
    sp(58, 'drifter', { y: 13, n: 5, amp: 1.4 }), sp(64, 'hookjaw', { fromLeft: true, n: 3, gap: 30 }),
    sp(68, 'nodule', { on: 'floor' }), sp(72, 'nodule', { on: 'floor' }), sp(76, 'nodule', { on: 'ceil' }),
    sp(80, 'lantern', { y: 10, drop: 'C' }),
    sp(86, 'drifter', { y: 9, n: 6, amp: 3 }),
    sp(92, 'stilter', { on: 'floor' }), sp(98, 'stilter', { on: 'floor' }),
    sp(100, 'nodule', { on: 'ceil' }), sp(104, 'nodule', { on: 'ceil' }),
    sp(106, 'lantern', { y: 8, drop: 'S' }),
    sp(114, 'drifter', { y: 10, n: 6, amp: 1.5 }),
    sp(118, 'hatcher', { on: 'floor' }), sp(131, 'hatcher', { on: 'ceil' }),
    sp(136, 'puff', { y: 9 }), sp(143, 'puff', { y: 10 }),
    sp(147, 'lantern', { y: 9, drop: 'B' }),
    sp(152, 'hookjaw', { fromLeft: true, n: 4, gap: 24 }),
    sp(158, 'thistle', { y: 5 }), sp(160, 'thistle', { y: 12 }), sp(164, 'thistle', { y: 8.5 }), sp(170, 'thistle', { y: 14 }), sp(172, 'thistle', { y: 4 }),
    sp(175, 'lantern', { y: 11, drop: 'M' }),
    sp(178, 'drifter', { y: 9, n: 6, amp: 2.5 }),
    sp(184, 'stilter', { on: 'floor' }), sp(186, 'nodule', { on: 'ceil' }),
    sp(190, 'bulwark', { y: 9, stopX: 24 }),
    sp(200, 'drifter', { y: 13, n: 6 }), sp(202, 'drifter', { y: 5, n: 6, ph: 3 }),
    sp(208, 'lantern', { y: 9, drop: 'A' }),
    sp(214, 'skimmer', { top: true, n: 3, gap: 20 }), sp(218, 'skimmer', { top: false, n: 3, gap: 20 }),
    sp(224, 'drifter', { y: 9, n: 8, amp: 4 }),
    sp(266, 'ossuary'),
  ],
};

// ---------------------------------------------------------------- 第 2 面
const c2 = (x) => {
  const w = smooth(Math.max(0, Math.min(1, (232 - x) / 14))) * smooth(Math.max(0, Math.min(1, (x - 8) / 20)));
  return 9 + w * (3.0 * Math.sin(x * 0.036) + 1.1 * Math.sin(x * 0.093 + 2));
};
const g2 = [[-12, 8.6], [24, 8.6], [34, 6.1], [100, 5.7], [116, 3.7], [133, 3.7], [146, 5.5], [200, 5.9], [234, 8.4], [420, 8.4]];
function tunnel(sign, seed) {
  const pts = [];
  for (let x = -12; x <= 420; x += 0.75) pts.push([+x.toFixed(2), +(c2(x) + sign * keyAt(g2, x) + keyAt([[-12, 0.2], [30, 0.9], [226, 0.9], [236, 0.35]], x) * bumps(x, seed)).toFixed(3)]);
  return pts;
}
const s2 = {
  id: 2, name: 'VEIN CATHEDRAL', ja: '脈の聖堂', music: 'stage2', speed: 2.0, bossStop: 250, checkpoints: [0, 86, 168, 238],
  recover: ['A', 'S'],
  palette: { sky: 0x0b0408, fog: 0x1a0710, metal: 0x6a5560, flesh: 0x4a1424, glow: 0xff4fb4, accent: 0xffb347, nebula: [0x3a0820, 0x1a0a30] },
  bottom: tunnel(-1, 2.2), top: tunnel(1, 5.7),
  blocks: [
    { x: 72, y: c2(72) - 1.2, w: 1.6, h: 2.4, hp: 10, kind: 'cyst', score: 300 },
    { x: 125, y: c2(125) - 1.0, w: 1.4, h: 2.0, hp: 8, kind: 'cyst', score: 300 },
    { x: 152, y: c2(152) + 0.4, w: 1.8, h: 2.6, hp: 12, kind: 'cyst', score: 300 },
    { x: 152, y: c2(152) - 3.0, w: 1.8, h: 2.6, hp: 12, kind: 'cyst', score: 300 },
    { x: 192, y: c2(192) - 1.3, w: 1.6, h: 2.6, hp: 14, kind: 'cyst', score: 300 },
  ],
  spawns: [
    sp(34, 'drifter', { y: c2(40) + 2, n: 6 }), sp(40, 'drifter', { y: c2(46) - 2, n: 6, ph: 3 }),
    sp(44, 'lantern', { y: c2(50), drop: 'P' }),
    sp(48, 'nodule', { on: 'floor' }), sp(50, 'nodule', { on: 'ceil' }), sp(56, 'nodule', { on: 'floor' }),
    sp(60, 'puff', { y: c2(66) }),
    sp(66, 'coilworm', { y: c2(72) }),
    sp(78, 'lantern', { y: c2(84), drop: 'B' }),
    sp(82, 'hatcher', { on: 'ceil' }), sp(90, 'hatcher', { on: 'floor' }),
    sp(98, 'drifter', { y: c2(104), n: 6, amp: 1.6 }),
    sp(106, 'lantern', { y: c2(112), drop: 'A' }),
    sp(110, 'hookjaw', { fromLeft: true, n: 3, gap: 30, y: 9 }),
    sp(120, 'nodule', { on: 'floor' }), sp(124, 'nodule', { on: 'ceil' }), sp(128, 'nodule', { on: 'floor' }), sp(132, 'nodule', { on: 'ceil' }),
    sp(140, 'puff', { y: c2(146) }), sp(148, 'coilworm', { y: c2(154) }),
    sp(158, 'lantern', { y: c2(164), drop: 'S' }),
    sp(162, 'stilter', { on: 'floor' }), sp(166, 'stilter', { on: 'ceil' }),
    sp(174, 'drifter', { y: c2(180), n: 6 }),
    sp(180, 'hatcher', { on: 'floor' }),
    sp(188, 'bulwark', { y: c2(196), stopX: 23 }),
    sp(198, 'lantern', { y: c2(204) + 1.5, drop: 'B' }),
    sp(204, 'puff', { y: c2(210) + 1.5 }), sp(208, 'puff', { y: c2(214) - 1.5 }),
    sp(214, 'thistle', { y: 6 }), sp(216, 'thistle', { y: 12 }), sp(220, 'thistle', { y: 9 }),
    sp(224, 'lantern', { y: 9, drop: 'C' }),
    sp(230, 'drifter', { y: 12, n: 6 }), sp(232, 'drifter', { y: 6, n: 6, ph: 3 }),
    sp(280, 'vesper'),
  ],
};

// ---------------------------------------------------------------- 第 3 面（巨大艦 GRAVEN ARK を 1 面まるごと）
const hull = (x, y, w, h, kind = 'hull') => ({ x, y, w, h, kind });
const plate = (x, y, w, h) => ({ x, y, w, h, kind: 'plate', hp: 12, score: 500 });
const s3 = {
  id: 3, name: 'GRAVEN ARK', ja: '墓標の方舟', music: 'stage3', speed: 2.6, bossStop: 300, checkpoints: [0, 104, 188, 286],
  recover: ['C', 'S'],
  palette: { sky: 0x03050a, fog: 0x0b0d14, metal: 0x7b8794, flesh: 0x30262a, glow: 0xffb347, accent: 0x4fe3ff, nebula: [0x10203a, 0x2a1a08] },
  bottom: [], top: [],
  blocks: [
    // 艦尾（エンジン区画）
    hull(46, -2, 10, 12), hull(56, -2, 6, 9), hull(44.6, 3.2, 1.4, 1.6, 'nozzle'), hull(44.6, 6.7, 1.4, 1.6, 'nozzle'),
    // 主船体（下）
    hull(62, -2, 270, 6),
    // 艦橋と塔
    hull(82, 4, 7, 5), hull(84.5, 9, 2, 3, 'mast'), hull(104, 4, 4, 3),
    // 上部船体（天井側）
    hull(118, 13.5, 82, 6), hull(140, 11.5, 6, 2, 'fin'),
    // 装甲板の壁（壊して抜ける）
    plate(150, 4, 1.5, 3.2), plate(150, 7.2, 1.5, 3.2), plate(150, 10.4, 1.5, 3.1),
    hull(200, 12.8, 40, 7), hull(206, 4, 5, 5.0), hull(214, 4, 2, 5, 'mast'),
    plate(244, 4, 1.4, 3.0), plate(244, 12.6, 1.4, 3.2),
    // 艦首（炉心区画）
    hull(262, 14.5, 80, 5), hull(262, -2, 80, 6.5), hull(330, -2, 12, 22, 'bow'),
  ],
  spawns: [
    sp(34, 'drifter', { y: 12, n: 6 }), sp(38, 'drifter', { y: 15, n: 6, ph: 2 }),
    sp(45.2, 'engine', { y: 4 }), sp(45.2, 'engine', { y: 7.5, ph: 80 }),
    sp(52, 'lantern', { y: 14, drop: 'P' }),
    sp(59, 'cannon', { y: 10.5 }), sp(64, 'lantern', { y: 13, drop: 'C' }),
    sp(70, 'cannon', { y: 4.5 }), sp(78, 'vent', { y: 4.4 }), sp(85.5, 'cannon', { y: 12.4 }), sp(96, 'cannon', { y: 4.5 }),
    sp(100, 'hookjaw', { fromLeft: true, n: 3, gap: 30 }),
    sp(108, 'lantern', { y: 10, drop: 'S' }),
    sp(116, 'drifter', { y: 9, n: 6, amp: 2 }),
    sp(122, 'cannon', { y: 13.0, flip: true }), sp(130, 'vent', { y: 13.1, flip: true }), sp(134, 'cannon', { y: 4.5 }),
    sp(143, 'lantern', { y: 8, drop: 'B' }),
    sp(158, 'cannon', { y: 13, flip: true }), sp(162, 'cannon', { y: 4.5 }), sp(170, 'vent', { y: 4.4 }), sp(176, 'cannon', { y: 13, flip: true }),
    sp(184, 'lantern', { y: 9, drop: 'M' }),
    sp(192, 'bulwark', { y: 8.5, stopX: 22 }),
    sp(208.5, 'cannon', { y: 9.4 }), sp(218, 'skimmer', { top: false, n: 3, gap: 20 }),
    sp(224, 'cannon', { y: 4.5 }), sp(228, 'cannon', { y: 12.3, flip: true }), sp(234, 'vent', { y: 4.4 }), sp(238, 'vent', { y: 12.4, flip: true }),
    sp(250, 'lantern', { y: 9, drop: 'A' }),
    sp(254, 'drifter', { y: 9, n: 8, amp: 3 }),
    sp(264, 'cannon', { y: 5 }), sp(268, 'cannon', { y: 14, flip: true }), sp(272, 'hookjaw', { fromLeft: true, n: 4, gap: 24 }),
    sp(282, 'lantern', { y: 10, drop: 'S' }),
    sp(290, 'drifter', { y: 12, n: 6 }), sp(292, 'drifter', { y: 7, n: 6, ph: 3 }),
    sp(332, 'keelheart'),
  ],
};

// ---------------------------------------------------------------- 第 4 面
const shard = (x, y, w, h) => ({ x, y, w, h, kind: 'crystal' });
const s4 = {
  id: 4, name: 'HEART OF THE BLOOM', ja: '花芯', music: 'stage4', speed: 2.2, bossStop: 244, checkpoints: [0, 82, 164, 232],
  recover: ['M', 'S'],
  palette: { sky: 0x07030c, fog: 0x140820, metal: 0x8a7fa0, flesh: 0x3a1a4a, glow: 0xc9a0ff, accent: 0x7dffb0, nebula: [0x2a0a4a, 0x08303a] },
  bottom: profile([[-12, -7], [20, -7], [27, 1.8], [80, 2.4], [90, 5], [110, 5], [120, 2], [160, 2.2], [232, 0.8], [420, 0.8]],
    [[-12, 0], [22, 0], [27, 1.15], [222, 1.15], [234, 0.35], [420, 0.35]], 7.7),
  top: profile([[-12, 25], [20, 25], [27, 16], [80, 15.6], [90, 13], [110, 13], [120, 16], [160, 15.8], [232, 17.2], [420, 17.2]],
    [[-12, 0], [22, 0], [27, 1.15], [222, 1.15], [234, 0.35], [420, 0.35]], 3.3),
  blocks: [
    shard(126, 5.4, 1.2, 4.6), shard(134, 10.2, 1.2, 8), shard(142, -2, 1.2, 9.6), shard(150, 9.4, 1.2, 9),
    { x: 157, y: 4, w: 1.5, h: 2.6, hp: 12, kind: 'cyst', score: 300 }, { x: 157, y: 6.6, w: 1.5, h: 2.6, hp: 12, kind: 'cyst', score: 300 },
    shard(186, 11.5, 1.4, 8), shard(196, -2, 1.4, 7.5), shard(206, 11, 1.4, 8),
  ],
  spawns: [
    sp(32, 'drifter', { y: 12, n: 6 }), sp(36, 'drifter', { y: 6, n: 6, ph: 3 }),
    sp(42, 'lantern', { y: 9, drop: 'P' }),
    sp(46, 'bulwark', { y: 11, stopX: 25 }), sp(50, 'nodule', { on: 'floor' }), sp(54, 'nodule', { on: 'floor' }),
    sp(58, 'thistle', { y: 6 }), sp(60, 'thistle', { y: 13 }), sp(63, 'thistle', { y: 9.5 }),
    sp(66, 'lantern', { y: 9, drop: 'B' }),
    sp(70, 'coilworm', { y: 9 }),
    sp(78, 'hookjaw', { fromLeft: true, n: 4, gap: 22 }),
    sp(88, 'hatcher', { on: 'floor' }), sp(96, 'hatcher', { on: 'ceil' }), sp(104, 'hatcher', { on: 'floor' }),
    sp(100, 'lantern', { y: 9, drop: 'S' }),
    sp(112, 'puff', { y: 9 }), sp(116, 'drifter', { y: 9, n: 6, amp: 2 }),
    sp(122, 'lantern', { y: 12, drop: 'C' }),
    sp(130, 'nodule', { on: 'floor' }), sp(138, 'nodule', { on: 'floor' }), sp(146, 'nodule', { on: 'ceil' }),
    sp(152, 'skimmer', { top: true, n: 3, gap: 18 }),
    sp(162, 'lantern', { y: 9, drop: 'M' }),
    sp(168, 'bulwark', { y: 6, stopX: 24 }), sp(170, 'bulwark', { y: 12, stopX: 26 }),
    sp(178, 'coilworm', { y: 9 }),
    sp(188, 'stilter', { on: 'floor' }), sp(194, 'nodule', { on: 'ceil' }), sp(200, 'stilter', { on: 'floor' }),
    sp(204, 'lantern', { y: 9, drop: 'A' }),
    sp(210, 'thistle', { y: 4 }), sp(212, 'thistle', { y: 9 }), sp(214, 'thistle', { y: 14 }), sp(218, 'thistle', { y: 6.5 }), sp(220, 'thistle', { y: 11.5 }),
    sp(224, 'puff', { y: 7 }), sp(226, 'puff', { y: 12 }),
    sp(232, 'drifter', { y: 9, n: 10, amp: 5, gap: 10 }),
    sp(274, 'heart'),
  ],
};

export const STAGES = [s1, s2, s3, s4];
for (const st of STAGES) st.spawns.sort((a, b) => a.x - b.x);
