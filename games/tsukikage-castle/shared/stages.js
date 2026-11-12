// 月影の魔城 — 全 6 ステージ（今回の推奨案。原作の面構成の再現ではない）
// 座標: x 右、y 上（y=0 が最下段）。タイル (x,y) は [x,x+1)×[y,y+1)。「面の高さ surf」は立つ面の y。
// タイル: 0 空 / 1 岩・土（固い）/ 2 片側足場（上からだけ乗れる）/ 3 はしご / 4 溶岩（即死）/ 5 水（即死）
export const T = { EMPTY: 0, SOLID: 1, PLAT: 2, LADDER: 3, LAVA: 4, WATER: 5 };

class Builder {
  constructor(id, name, W, H, theme) {
    this.def = { id, name, W, H, theme, tiles: new Uint8Array(W * H), deco: [], enemies: [], spawners: [], items: [], movers: [], jets: [],
      checkpoints: [], boss: null, music: id, start: { x: 2.5, y: 0 } };
  }
  set(x, y, v) { const d = this.def; if (x >= 0 && y >= 0 && x < d.W && y < d.H) d.tiles[y * d.W + x] = v; }
  get(x, y) { const d = this.def; return x < 0 || y < 0 || x >= d.W || y >= d.H ? 0 : d.tiles[y * d.W + x]; }
  fill(x0, y0, x1, y1, v = T.SOLID) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, v); return this; }
  ground(x0, x1, surf) { return this.fill(x0, 0, x1, surf, T.SOLID); }
  clear(x0, y0, x1, y1) { return this.fill(x0, y0, x1, y1, T.EMPTY); }
  plat(x0, x1, surf, deco) { this.fill(x0, surf - 1, x1, surf, T.PLAT); if (deco) this.deco.push({ type: deco, x: x0, y: surf - 1, w: x1 - x0 }); return this; }
  // はしご: 列 x、下端 y0（下の床の面）〜上端 y1（上の床の面）。上の床にはしごの穴をあける
  ladder(x, y0, y1) { for (let y = y0; y < y1; y++) this.set(x, y, T.LADDER); this.deco.push({ type: 'ladder', x, y: y0, h: y1 - y0 }); return this; }
  // 穴: 下から続く地面だけを消す（天井や上の階は残す）。water なら底に水（即死）
  pit(x0, x1, water = false) {
    for (let x = x0; x < x1; x++) for (let y = 0; y < this.def.H && this.get(x, y) === T.SOLID; y++) this.set(x, y, T.EMPTY);
    if (water) this.fill(x0, 0, x1, 2, T.WATER);
    this.def.deco.push({ type: water ? 'water' : 'pit', x: x0, y: 0, w: x1 - x0 });
    return this;
  }
  lava(x0, x1, surf) { this.pit(x0, x1); this.def.deco.pop(); this.fill(x0, 0, x1, surf, T.LAVA); this.def.deco.push({ type: 'lava', x: x0, y: surf, w: x1 - x0 }); return this; }
  hole(x0, x1, surf) { this.clear(x0, 0, x1, surf); this.def.deco.push({ type: 'pit', x: x0, y: 0, w: x1 - x0 }); return this; }
  grave(x, surf, h = 1) { this.fill(x, surf, x + 1, surf + h); this.deco.push({ type: 'grave', x, y: surf, h, v: (x * 7) % 3 }); return this; }
  get deco() { return this.def.deco; }
  d(type, x, y, extra = {}) { this.def.deco.push({ type, x, y, ...extra }); return this; }
  e(type, x, y, extra = {}) { this.def.enemies.push({ type, x, y, ...extra }); return this; }
  spawner(x0, x1, extra = {}) { this.def.spawners.push({ type: 'ghoul', x0, x1, interval: 2.4, alive: 3, cap: 7, ...extra }); return this; }
  item(kind, x, y, extra = {}) { this.def.items.push({ kind, x, y, ...extra }); return this; }
  mover(x, y, w, ax, ay, period, phase = 0) { this.def.movers.push({ x, y, w, ax, ay, period, phase }); return this; }
  jet(x, y, h, period = 3.0, phase = 0) { this.def.jets.push({ x, y, h, period, phase }); return this; }
  cp(x, y, easyOnly = false) { this.def.checkpoints.push({ x, y, easyOnly }); return this; }
  // ボスの間: 幅 24（画面 1 枚）。右端に壁を立てる。左は戦闘開始で閉じる（core の門）
  boss(type, x0, y0, extra = {}) { this.def.boss = { type, x0, y0, w: 24, h: 13.5, ...extra }; this.fill(x0 + 24, 0, x0 + 25, this.def.H); return this; }
  done() {
    const d = this.def;
    d.checkpoints.sort((a, b) => (d.vertical ? a.y - b.y : a.x - b.x));
    return d;
  }
}

// ---------------------------------------------------------------- 1. 月夜の墓地
// 平地の墓石を跳び越え、丘と地下納骨堂の屋根を越える。地中から亡者、墓の上を夜魔。
function stage1() {
  const b = new Builder(1, '月夜の墓地', 204, 20, 'graveyard');
  b.ground(0, 204, 3);
  b.fill(0, 3, 1, 20); // 左端の壁
  b.grave(10, 3); b.grave(17, 3); b.grave(25, 3, 1); b.grave(31, 3);
  b.d('tree', 6, 3, { s: 1.1 }); b.d('tree', 21, 3, { s: 1.4 }); b.d('fence', 12, 3, { w: 5 });
  b.spawner(8, 40, { cap: 7 });
  b.ground(36, 48, 4); b.ground(48, 56, 5); b.grave(44, 4); b.d('tree', 50, 5, { s: 1.6 });
  b.plat(52, 55, 6, 'branch'); b.item('treasure', 53.5, 6);
  b.pit(56, 59);
  b.ground(59, 82, 4);
  b.item('weapon', 63, 4, { weapon: 'dagger' }); b.grave(66, 4); b.e('skeleton', 70, 4);
  // 地下納骨堂の屋根（はしごで登って越える）
  b.ladder(73, 4, 8); b.fill(74, 4, 79, 8); b.d('crypt', 74, 4, { w: 5, h: 4 });
  b.e('imp', 80, 11);
  b.cp(60, 4, true);
  b.ground(82, 100, 3);
  b.grave(86, 3); b.grave(93, 3);
  b.e('imp', 90, 9); b.e('imp', 98, 10, { drop: 'axe' });
  b.d('tree', 88, 3, { s: 1.2 });
  b.cp(101, 3);
  b.pit(106, 108); b.pit(116, 119);
  b.spawner(100, 132, { cap: 7 });
  b.grave(111, 3); b.grave(124, 3); b.grave(127, 3);
  b.e('skeleton', 130, 3);
  // 枯れ木の丘
  b.ground(132, 150, 4); b.ladder(133, 4, 7); b.plat(134, 138, 7, 'branch'); b.plat(139, 143, 8, 'branch'); b.item('armor', 141, 8);
  b.d('tree', 137, 4, { s: 2.2, big: true });
  b.e('beast', 147, 4);
  b.ground(150, 204, 3);
  b.grave(153, 3); b.grave(161, 3);
  b.e('skeleton', 158, 3); b.e('skeleton', 168, 3, { drop: 'lance' }); b.e('imp', 164, 9);
  b.item('treasure', 162.5, 3);
  b.cp(151, 3, true);
  b.cp(173, 3);
  b.d('gate', 178, 3);
  b.boss('gravekeeper', 179, 0);
  b.def.start = { x: 3, y: 3 };
  return b.done();
}

// ---------------------------------------------------------------- 2. 廃村と地下墓所
// 上段の村（面 12）→ はしごで地下墓所（面 3、天井 8）→ はしごで村へ戻る。狭い射線の砲台と術者。
function stage2() {
  const b = new Builder(2, '廃村と地下墓所', 236, 26, 'village');
  b.ground(0, 236, 12); b.fill(0, 12, 1, 26);
  b.clear(34, 3, 119, 8); // 地下墓所の通路
  b.d('catacomb', 34, 3, { w: 85, h: 5 });
  b.d('house', 4, 12, { w: 8, h: 7 }); b.ladder(4, 12, 16); b.plat(5, 11, 16, 'floor'); b.item('treasure', 8, 16);
  b.e('skeleton', 16, 12);
  b.d('house', 20, 12, { w: 9, h: 9, broken: true }); b.plat(21, 28, 17, 'floor'); b.ladder(28, 12, 17); b.e('caster', 24, 17);
  b.e('imp', 30, 18);
  // 地下へ降りる
  b.clear(33, 3, 34, 12); b.ladder(33, 3, 12);
  b.fill(35, 12, 38, 15); b.d('rubble', 35, 12, { w: 3, h: 3 });
  b.cp(36, 3);
  b.e('skeleton', 46, 3);
  b.e('turret', 54.5, 3, { dir: -1 }); b.e('hopper', 62, 3);
  b.item('weapon', 66, 3, { weapon: 'torch' });
  b.e('turret', 71.5, 3, { dir: -1 }); b.fill(74, 3, 75, 4);
  b.e('skeleton', 80, 3, { drop: 'axe' }); b.e('hopper', 88, 3);
  b.cp(77, 3, true);
  b.hole(92, 95, 3); b.e('caster', 100, 3); b.e('skeleton', 108, 3);
  b.item('armor', 112, 3);
  // 村へ上がる
  b.clear(118, 3, 119, 12); b.ladder(118, 3, 12);
  b.cp(121, 12);
  b.d('house', 124, 12, { w: 10, h: 8 }); b.ladder(124, 12, 16); b.plat(125, 133, 16, 'floor'); b.ladder(132, 16, 19); b.plat(126, 132, 19, 'roof');
  b.item('treasure', 128, 19);
  b.e('caster', 138, 12); b.e('imp', 142, 18); b.e('hopper', 146, 12);
  b.pit(150, 153); b.d('well', 150, 12, { w: 3 });
  b.e('skeleton', 158, 12); b.e('beast', 167, 12);
  b.d('house', 172, 12, { w: 9, h: 7, broken: true }); b.ladder(172, 12, 16); b.plat(173, 180, 16, 'floor');
  b.e('caster', 177, 16, { drop: 'dagger' });
  b.pit(184, 186);
  b.e('imp', 192, 18); b.e('imp', 198, 17);
  b.cp(170, 12, true);
  b.cp(204, 12);
  b.d('gate', 210, 12);
  b.boss('witch', 211, 9);
  b.def.start = { x: 3, y: 12 };
  return b.done();
}

// ---------------------------------------------------------------- 3. 洞窟と水路
// 水路を移動床で渡る。水から跳ね鬼、天井の砲台が真下へ撃つ。
function stage3() {
  const b = new Builder(3, '洞窟と水路', 236, 22, 'cave');
  b.ground(0, 236, 4); b.fill(0, 4, 1, 22); b.fill(0, 19, 236, 22);
  b.d('stalactites', 0, 19, { w: 236 });
  b.e('imp', 14, 11);
  b.pit(20, 34, true); b.mover(20.5, 4, 3, 10, 0, 6.0);
  b.ground(34, 52, 5); b.e('beast', 47, 5);
  b.item('treasure', 40, 5);
  b.pit(52, 55, true);
  b.ground(55, 60, 4);
  b.cp(57, 4, true);
  b.pit(60, 82, true);
  b.mover(61, 4, 3, 0, 2.5, 3.6);
  b.fill(66, 0, 68, 6);
  b.mover(69, 6, 3, 5, 0, 4.6);
  b.fill(79, 0, 80, 5);
  b.e('hopper', 74, 0.6, { water: true });
  b.ground(82, 122, 4);
  b.cp(84, 4);
  b.fill(88, 12, 120, 19); b.e('turret', 96, 12, { down: true }); b.e('turret', 110, 12, { down: true });
  b.e('hopper', 102, 4); b.e('skeleton', 114, 4, { drop: 'torch' });
  b.item('weapon', 92, 4, { weapon: 'axe' });
  b.e('caster', 119, 4);
  b.pit(122, 152, true);
  for (const [x, s] of [[124, 5], [128, 6], [132, 5], [136, 6], [140, 6], [144, 5], [148, 6]]) b.fill(x, 0, x + 2, s);
  b.e('hopper', 138.5, 0.6, { water: true }); b.e('imp', 134, 13); b.e('imp', 146, 14);
  b.ground(152, 160, 5); b.item('armor', 156, 5);
  b.cp(155, 5, true);
  b.pit(160, 178, true); b.mover(161, 5, 3, 3.5, 1.0, 4.0); b.mover(169, 5, 3, 4.5, 0, 4.0, 1.2);
  b.ground(178, 186, 4);
  b.e('beast', 182, 4);
  b.cp(181, 4);
  b.d('gate', 185, 4);
  b.boss('riverbeast', 186, 3);
  b.pit(193, 195, true); b.pit(201, 203, true); b.pit(206, 209, true);
  b.def.start = { x: 3, y: 4 };
  return b.done();
}

// ---------------------------------------------------------------- 4. 魔物の塔（縦に登る）
// 階の間は「はしご → 梁 → 跳んで隣の梁 → はしご」。左右を交互に入れ替える。
function stage4() {
  const W = 28, H = 118;
  const b = new Builder(4, '魔物の塔', W, H, 'tower');
  b.def.vertical = true;
  b.fill(0, 0, 2, H); b.fill(W - 2, 0, W, H); b.ground(0, W, 2);
  const mx = (side, x) => (side ? W - 1 - x : x);
  const span = (side, x0, x1) => (side ? [W - x1, W - x0] : [x0, x1]);
  let prev = 2;
  for (let i = 0; i < 10; i++) {
    const y = prev + 10, side = i & 1;
    b.fill(2, y - 1, W - 2, y);
    const l1 = mx(side, 4), l2 = mx(side, 13);
    b.ladder(l1, prev, prev + 5);
    const [a0, a1] = span(side, 5, 9); b.plat(a0, a1, prev + 5, 'beam');
    const [c0, c1] = span(side, 11, 15); b.plat(c0, c1, prev + 6, 'beam');
    b.clear(l2, y - 1, l2 + 1, y); b.ladder(l2, prev + 6, y);
    const [d0, d1] = span(side, 18, 23); b.plat(d0, d1, prev + 4, 'beam');
    prev = y;
  }
  b.e('skeleton', 20, 2); b.e('imp', 12, 9);
  b.e('caster', 20, 12); b.e('imp', 8, 20);
  b.e('turret', 2.6, 22, { dir: 1 }); b.e('hopper', 15, 22);
  b.e('imp', 18, 30, { drop: 'axe' }); b.e('skeleton', 10, 32);
  b.e('imp', 9, 40); b.e('caster', 6, 42); b.e('turret', 25.4, 52, { dir: -1 });
  b.e('brute', 14, 62); b.e('imp', 20, 68);
  b.e('hopper', 10, 72); b.e('imp', 7, 80, { drop: 'dagger' });
  b.e('skeleton', 18, 82); b.e('caster', 9, 92); b.e('imp', 15, 98);
  b.item('treasure', 7, 16); b.item('weapon', 12, 32, { weapon: 'lance' }); b.item('armor', 5, 56); b.item('treasure', 7, 76);
  b.cp(8, 22, true); b.cp(8, 42); b.cp(8, 62, true); b.cp(8, 82);
  b.def.start = { x: 8, y: 2 };
  // 最上階（面 102）がボスの間
  b.fill(2, 116, W - 2, H);
  b.def.boss = { type: 'warden', x0: 2, y0: 101.5, w: 24, h: 13.5, seal: [[14, 101]] };
  return b.done();
}

// ---------------------------------------------------------------- 5. 炎の城塞
// 溶岩（即死）、周期的に噴く炎の柱、重装の鉄塊鬼、石像の砲台。
function stage5() {
  const b = new Builder(5, '炎の城塞', 236, 22, 'fortress');
  b.ground(0, 236, 4); b.fill(0, 4, 1, 22);
  b.d('battlement', 0, 4, { w: 236 });
  b.jet(12, 4, 4, 3.0, 0); b.jet(17, 4, 4, 3.0, 1.5);
  b.fill(24, 4, 26, 5); b.e('turret', 25, 5, { dir: -1 });
  b.lava(28, 30, 2);
  b.ground(30, 44, 5); b.e('brute', 38, 5);
  b.lava(44, 58, 2); b.mover(45, 5, 3, 9, 0, 5.0);
  b.ground(58, 70, 5); b.jet(62, 5, 4, 2.6, 0.6); b.jet(66, 5, 4, 2.6, 1.9);
  b.item('weapon', 60, 5, { weapon: 'torch' });
  b.cp(59, 5, true);
  b.ladder(70, 5, 10); b.fill(71, 0, 90, 10); b.e('skeleton', 82, 10); b.e('imp', 86, 15);
  b.item('treasure', 88, 10);
  b.lava(90, 94, 2); b.ground(94, 120, 4);
  b.cp(97, 4);
  b.e('brute', 106, 4, { drop: 'axe' }); b.jet(112, 4, 4, 2.4, 0); b.e('caster', 118, 4);
  b.lava(120, 140, 2); b.mover(121, 5, 3, 0, 2.5, 3.4); b.mover(126, 6, 3, 4, 0, 4.4, 1); b.mover(135, 5, 3, 0, 2.0, 3.0, 2);
  b.e('imp', 130, 13);
  b.ground(140, 170, 5); b.fill(160, 5, 162, 6); b.e('turret', 161, 6, { dir: -1 });
  b.jet(146, 5, 4, 2.8, 0); b.jet(150, 5, 4, 2.8, 1.4); b.e('brute', 154, 5); b.item('armor', 143, 5);
  b.cp(141, 5, true);
  b.lava(170, 173, 2); b.ground(173, 236, 4);
  b.e('beast', 182, 4); b.e('hopper', 188, 4);
  b.cp(192, 4);
  b.d('gate', 197, 4);
  b.boss('flameknight', 198, 3);
  b.def.start = { x: 3, y: 4 };
  return b.done();
}

// ---------------------------------------------------------------- 6. 魔城中枢
// これまでの仕組みの総まとめ: 亡者の湧く広間、溶岩と移動床、上下 2 段の回廊、炎の柱、全種の敵。
function stage6() {
  const b = new Builder(6, '魔城中枢', 252, 28, 'citadel');
  b.ground(0, 252, 4); b.fill(0, 4, 1, 28);
  b.d('pillars', 0, 4, { w: 252 });
  b.spawner(6, 28, { cap: 5 });
  b.e('skeleton', 22, 4); b.pit(28, 30);
  b.ground(30, 40, 5); b.fill(38, 5, 40, 6); b.e('turret', 39, 6, { dir: -1 });
  b.lava(40, 56, 2); b.mover(41, 5, 3, 0, 2.5, 3.2); b.mover(46, 6, 3, 4.5, 0, 4.0);
  b.ground(56, 71, 5); b.jet(60, 5, 4, 2.6, 0); b.e('brute', 66, 5);
  b.cp(57, 5, true);
  b.ladder(70, 5, 14); b.ground(71, 104, 5); b.plat(71, 104, 14, 'floor');
  b.e('caster', 80, 5); b.e('hopper', 88, 5); b.e('imp', 84, 18); b.e('skeleton', 94, 14);
  b.item('weapon', 90, 14, { weapon: 'dagger' });
  b.ladder(103, 5, 14);
  b.cp(73, 14);
  b.pit(104, 107); b.ground(107, 140, 5);
  b.e('beast', 120, 5); b.e('caster', 132, 5, { drop: 'lance' }); b.jet(126, 5, 4, 2.4, 0.4);
  b.item('treasure', 114, 5);
  b.cp(110, 5);
  b.lava(140, 160, 2); b.mover(141, 5, 3, 4.5, 0, 4.2); b.mover(150, 6, 3, 0, 2.5, 3.0, 1); b.mover(154, 5, 3, 2.5, 0, 3.0);
  b.e('imp', 150, 14); b.e('imp', 156, 15);
  b.ground(160, 200, 5); b.fill(184, 5, 186, 6); b.e('turret', 185, 6, { dir: -1 });
  b.e('brute', 170, 5); b.jet(176, 5, 4, 2.6, 0); b.e('skeleton', 192, 5); b.item('armor', 163, 5);
  b.cp(161, 5, true);
  b.pit(200, 203); b.ground(203, 252, 4);
  b.e('hopper', 208, 4); b.e('beast', 214, 4);
  b.cp(218, 4);
  b.d('gate', 222, 4);
  b.boss('lord', 223, 3);
  b.def.start = { x: 3, y: 4 };
  return b.done();
}

let cache = null;
export function getStages() { return cache || (cache = [stage1(), stage2(), stage3(), stage4(), stage5(), stage6()]); }
export const STAGE_COUNT = 6;

export function tileAt(def, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || tx >= def.W) return T.SOLID;
  if (ty < 0) return T.EMPTY;
  if (ty >= def.H) return T.EMPTY;
  return def.tiles[ty * def.W + tx];
}
