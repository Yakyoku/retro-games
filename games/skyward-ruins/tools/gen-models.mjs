// Skyward Ruins の 3D モデル（ドット絵と同じ輪郭・配色を立体化した独自デザイン）を生成する。
// 出力: unity/SkywardRuins/Assets/SkywardRuins/Data/models.json
//   { name: { tris: [[x,y,z,...9], ...], cols: ["#rrggbb", ...] } } …面ごとに色（フラットシェーディング用）
// 単位は論理単位（自機の翼幅 ≒ 16）。+Z が進行方向、+Y が上。Unity 側のエディタ処理が Mesh アセットに変換する。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Data');
mkdirSync(OUT, { recursive: true });

class M {
  constructor() { this.t = []; this.c = []; }
  tri(a, b, c, col) { this.t.push([...a, ...b, ...c]); this.c.push(col); return this; }
  quad(a, b, c, d, col) { return this.tri(a, b, c, col).tri(a, c, d, col); }
  poly(pts, col) { for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], col); return this; }
  // 角柱（底面 pts は XZ 平面上・反時計回り）。y0..y1、上面だけ縮める（taper）ことで面取りした形も作れる
  prism(pts, y0, y1, col, topCol = col, taper = 1, cx = 0, cz = 0) {
    const top = pts.map(([x, z]) => [cx + (x - cx) * taper, y1, cz + (z - cz) * taper]); const bot = pts.map(([x, z]) => [x, y0, z]);
    this.poly([...top].reverse(), topCol); this.poly(bot, col);
    for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; this.quad(bot[i], bot[j], top[j], top[i], col); }
    return this;
  }
  ngon(n, r, rot = 0, rz = r) { return Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [Math.cos(a) * r, Math.sin(a) * rz]; }).reverse(); }
  cyl(n, r, y0, y1, col, topCol = col, taper = 1, ox = 0, oz = 0) { return this.prism(this.ngon(n, r).map(([x, z]) => [x + ox, z + oz]), y0, y1, col, topCol, taper, ox, oz); }
  sphere(r, col, cy = 0, seg = 8, ox = 0, oz = 0, sy = 1) {
    for (let i = 0; i < seg / 2; i++) for (let j = 0; j < seg; j++) {
      const p = (a, b) => { const th = a / (seg / 2) * Math.PI, ph = b / seg * 2 * Math.PI; return [ox + r * Math.sin(th) * Math.cos(ph), cy + r * Math.cos(th) * sy, oz + r * Math.sin(th) * Math.sin(ph)]; };
      const A = p(i, j), B = p(i, j + 1), C = p(i + 1, j + 1), D = p(i + 1, j);
      const cc = typeof col === 'function' ? col(i, j) : col;
      if (i === 0) this.tri(A, C, D, cc); else if (i === seg / 2 - 1) this.tri(A, B, D, cc); else this.quad(A, B, C, D, cc).t.length;
    }
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, col, topCol = col) { return this.prism([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].reverse(), y0, y1, col, topCol); }
  add(o, dx = 0, dy = 0, dz = 0) { o.t.forEach((t, i) => { this.t.push(t.map((v, k) => v + [dx, dy, dz][k % 3])); this.c.push(o.c[i]); }); return this; }
  json() { return { tris: this.t.map(t => t.map(v => +v.toFixed(3))), cols: this.c }; }
}
const S = { hi: '#eef1f6', mid: '#b9c0cc', lo: '#7d8596', dark: '#4a5060' };
const ST = { hi: '#c8d0e0', mid: '#8e9ab2', lo: '#5c6682', dark: '#363e54' };
const RED = '#e03838', CYAN = '#58d4ee', GOLD = '#e8b838', AMBER = '#ff9a28', OBS = '#22222f', STONE = '#8a8474', STONE_D = '#5a5548', OLIVE = '#6c7a48', OLIVE_D = '#46522e', BRONZE = '#a8844c', BRONZE_D = '#6a5030';

const models = {};
// 自機：細身のデルタ翼＋背骨状の胴＋双垂直尾翼＋青い風防
{
  const m = new M();
  // 主翼（上面は左右で明暗を変えて立体感を出す。下面は暗く）
  m.tri([0, 1.2, 9], [8, 0.4, -5.5], [0, 1.0, -3.5], S.hi).tri([0, 1.2, 9], [0, 1.0, -3.5], [-8, 0.4, -5.5], S.mid);
  m.tri([0, 0.2, 9], [0, 0.2, -3.5], [8, 0.2, -5.5], S.dark).tri([0, 0.2, 9], [-8, 0.2, -5.5], [0, 0.2, -3.5], S.dark);
  m.quad([8, 0.4, -5.5], [8, 0.2, -5.5], [0, 0.2, -3.5], [0, 1.0, -3.5], S.lo).quad([-8, 0.2, -5.5], [-8, 0.4, -5.5], [0, 1.0, -3.5], [0, 0.2, -3.5], S.lo);
  m.tri([0, 1.2, 9], [0, 0.2, 9], [8, 0.2, -5.5], S.lo).tri([8, 0.2, -5.5], [8, 0.4, -5.5], [0, 1.2, 9], S.lo);
  m.tri([0, 0.2, 9], [0, 1.2, 9], [-8, 0.2, -5.5], S.lo).tri([-8, 0.4, -5.5], [-8, 0.2, -5.5], [0, 1.2, 9], S.lo);
  // 胴（背骨）
  m.prism([[-1.4, -6.5], [1.4, -6.5], [1.2, 8.5], [0, 10.5], [-1.2, 8.5]].reverse(), 0.0, 2.2, S.mid, S.hi, 0.75, 0, 1);
  // 風防
  m.prism([[-0.7, 2.5], [0.7, 2.5], [0.6, 6.5], [0, 7.5], [-0.6, 6.5]].reverse(), 2.0, 2.9, '#2a6c9c', CYAN, 0.6, 0, 4.5);
  // 双垂直尾翼
  for (const sx of [-3, 3]) m.prism([[sx - 0.25, -6.5], [sx + 0.25, -6.5], [sx + 0.25, -3.5], [sx - 0.25, -3.5]].reverse(), 0.6, 4.0, S.lo, S.mid, 0.6, sx, -5.5);
  // 噴射口と翼端灯
  m.cyl(6, 0.9, 0.6, 1.8, AMBER, AMBER, 1, 0, -6.7);
  m.box(-7.6, 0.3, -5.6, -6.8, 0.8, -4.8, RED).box(6.8, 0.3, -5.6, 7.6, 0.8, -4.8, '#40d060');
  models.player = m.json();
}
// ダート：平たい矢じり
{ const m = new M(); m.prism([[0, -6], [6, 4.5], [0, 1.5], [-6, 4.5]].reverse(), 0, 1.5, ST.lo, ST.hi, 0.8, 0, 0.5).cyl(5, 0.8, 1.2, 2.0, GOLD, GOLD, 0.6, 0, -1); models.dart = m.json(); }
// アーク：切り欠きのある輪＋中心の青い核
{
  const m = new M(); const n = 16;
  for (let i = 0; i < n; i++) {
    if (i % 8 === 0) continue; // 切り欠き 2 か所
    const a0 = i * 2 * Math.PI / n, a1 = (i + 1) * 2 * Math.PI / n; const r0 = 3.4, r1 = 6.6;
    const p = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    m.quad(p(r0, a0, 1.2), p(r0, a1, 1.2), p(r1, a1, 1.2), p(r1, a0, 1.2), i % 2 ? ST.hi : ST.mid);
    m.quad(p(r1, a0, -1.2), p(r1, a1, -1.2), p(r0, a1, -1.2), p(r0, a0, -1.2), ST.dark);
    m.quad(p(r1, a0, 1.2), p(r1, a1, 1.2), p(r1, a1, -1.2), p(r1, a0, -1.2), ST.lo);
    m.quad(p(r0, a0, -1.2), p(r0, a1, -1.2), p(r0, a1, 1.2), p(r0, a0, 1.2), ST.lo);
  }
  m.sphere(1.8, CYAN, 0, 8); models.arc = m.json();
}
// シーカー：菱形の双角錐＋赤い眼
{ const m = new M(); const top = [0, 2.6, 0], bot = [0, -1.2, 0]; const r = [[0, 0, 7.5], [6, 0, 0], [0, 0, -7.5], [-6, 0, 0]];
  for (let i = 0; i < 4; i++) { const a = r[i], b = r[(i + 1) % 4]; m.tri(top, b, a, i % 2 ? ST.hi : ST.mid).tri(bot, a, b, ST.dark); }
  m.sphere(1.4, RED, 1.9, 6, 0, 1.5); models.seeker = m.json(); }
// クロッサー：横長の六角カプセル＋上下の翼
{ const m = new M(); const hex = [[-9, 0], [-6.5, 2.5], [6.5, 2.5], [9, 0], [6.5, -2.5], [-6.5, -2.5]];
  m.prism(hex.slice().reverse(), -0.5, 2.0, ST.lo, ST.hi, 0.85); m.box(-7, 2.0, -0.4, 7, 2.3, 0.4, RED);
  m.prism([[-3, 2.5], [3, 2.5], [1.5, 5.5], [-1.5, 5.5]].reverse(), 0.2, 1.0, ST.mid, ST.hi).prism([[-3, -5.5], [3, -5.5], [1.5, -2.5], [-1.5, -2.5]].reverse(), 0.2, 1.0, ST.lo, ST.mid);
  models.crosser = m.json(); }
// スナイパー：十字の腕＋中央のドーム（赤いレンズ）
{ const m = new M(); m.box(-7.5, 0, -1.4, 7.5, 1.6, 1.4, ST.lo, ST.mid).box(-1.4, 0, -7.5, 1.4, 1.6, 7.5, ST.lo, ST.hi);
  m.cyl(8, 3.6, 0, 2.2, ST.mid, ST.hi, 0.7); m.sphere(1.6, RED, 2.4, 8); models.sniper = m.json(); }
// ヘビー：面取りした八角の装甲＋橙の核
{ const m = new M(); m.prism(m.ngon(8, 10.2, Math.PI / 8), 0, 2.4, ST.lo, ST.mid, 0.82); m.prism(m.ngon(8, 6, Math.PI / 8), 2.4, 3.6, ST.dark, ST.lo, 0.8);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; m.box(Math.cos(a) * 7 - 0.8, 2.2, Math.sin(a) * 7 - 0.8, Math.cos(a) * 7 + 0.8, 3.2, Math.sin(a) * 7 + 0.8, ST.dark); }
  m.sphere(2.4, AMBER, 3.8, 8); models.heavy = m.json(); }
// シャード：立った黒曜石の板（Y 軸で回転）。金色の縁
{ const m = new M(); m.box(-6, -7, -0.8, 6, 7, 0.8, OBS, '#3a3a52'); m.box(-6.3, -7, -1, -5.7, 7, 1, GOLD).box(5.7, -7, -1, 6.3, 7, 1, GOLD); m.box(-6, -0.3, -0.9, 6, 0.3, 0.9, '#6a5a90'); models.shard = m.json(); }
// 地上：砲台（台座＋ドーム＋砲身。砲身は +Z。描画側で自機の方へ回す）
{ const m = new M(); m.cyl(10, 6.2, 0, 1.2, STONE_D, STONE, 0.95); m.cyl(10, 3.2, 1.2, 3.0, OLIVE_D, OLIVE, 0.75); m.box(-0.5, 2.0, 0, 0.5, 2.8, 6.5, OLIVE_D, OLIVE); m.sphere(0.8, RED, 3.0, 6); models.turret = m.json(); }
{ const m = new M(); m.box(-6, 0, -6.5, -3.5, 2.0, 6.5, '#3c3a34', '#55524a').box(3.5, 0, -6.5, 6, 2.0, 6.5, '#3c3a34', '#55524a'); m.box(-3.6, 0.5, -4.5, 3.6, 2.8, 4.5, OLIVE_D, OLIVE); m.cyl(8, 2.4, 2.8, 4.0, OLIVE_D, '#8a9a5a', 0.85); m.box(-0.4, 3.2, 0, 0.4, 3.8, 7, OLIVE_D); models.tank = m.json(); }
{ const m = new M(); m.prism([[-8, -6], [-6, -8], [6, -8], [8, -6], [8, 6], [6, 8], [-6, 8], [-8, 6]].reverse(), 0, 4.0, STONE_D, STONE, 0.78); m.box(-2.2, 4.0, -2.2, 2.2, 4.6, 2.2, '#5a1818', RED); models.bunker = m.json(); }
{ const m = new M(); m.box(-4.5, 0, -4.5, 4.5, 2.4, 4.5, STONE_D, STONE); m.cyl(6, 0.6, 2.4, 5.0, S.lo); models.radar = m.json();
  const d = new M(); d.prism([[0, 6.5], [3.6, -3], [-3.6, -3]].reverse(), 0, 0.5, S.lo, S.hi); d.sphere(1.0, CYAN, 0.6, 6); models.radar_dish = d.json(); }
// オベリスク：細い角錐台の石柱＋金の印。地中から y 方向に上がる
{ const m = new M(); m.prism([[-3.6, -3.6], [3.6, -3.6], [3.6, 3.6], [-3.6, 3.6]].reverse(), 0, 13, BRONZE_D, BRONZE, 0.55); m.prism([[-2, -2], [2, -2], [2, 2], [-2, 2]].reverse(), 13, 16, BRONZE, '#e8cc88', 0.05); m.box(-0.5, 8, -2.2, 0.5, 10, -1.9, GOLD).box(-1.4, 5, -2.5, -0.6, 5.8, -1.8, CYAN).box(0.6, 5, -2.5, 1.4, 5.8, -1.8, CYAN); models.obelisk = m.json();
  const mound = new M(); mound.cyl(10, 6.5, -0.4, 0.6, '#3e3020', '#5a4630', 0.7); models.mound = mound.json(); }
// バナー：ポール＋山形紋の三角旗
{ const m = new M(); m.cyl(6, 0.35, 0, 14, S.mid, S.hi); m.sphere(0.7, GOLD, 14.3, 6); m.cyl(8, 1.6, 0, 0.6, STONE_D, STONE);
  m.tri([0, 13.5, 0], [0, 8.5, 0], [8, 11, 0.4], RED).tri([0, 13.5, 0], [8, 11, 0.4], [0, 8.5, 0], '#a02020'); m.tri([1.2, 12.4, 0.12], [1.2, 9.6, 0.12], [4.5, 11, 0.3], '#fff0d0'); models.banner = m.json(); }
// 要塞：六角の浮遊基壇（3 段）＋外周の装甲ブロック＋中央の受け台
{
  const m = new M();
  m.prism(m.ngon(6, 54, 0, 42), -6, 0, ST.dark, ST.lo, 0.95);
  m.prism(m.ngon(6, 50, 0, 39), 0, 3, ST.lo, ST.mid, 0.8);
  m.prism(m.ngon(6, 38, Math.PI / 6, 31), 3, 6, ST.mid, ST.hi, 0.9);
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; m.box(Math.cos(a) * 20 - 0.6, 5.9, Math.sin(a) * 16 - 0.6, Math.cos(a) * 33 + 0.6, 6.3, Math.sin(a) * 26 + 0.6, ST.lo); }
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; m.box(Math.cos(a) * 46 - 1.5, 2.6, Math.sin(a) * 36 - 1.5, Math.cos(a) * 46 + 1.5, 3.8, Math.sin(a) * 36 + 1.5, GOLD); }
  m.cyl(12, 15, 6, 8, ST.lo, ST.mid, 0.92);
  models.fortress = m.json();
  const t = new M(); t.cyl(10, 6, 0, 2.2, BRONZE_D, BRONZE, 0.85); t.cyl(8, 3, 2.2, 3.6, BRONZE_D, '#c8a060', 0.8); t.box(-0.7, 2.6, 0, 0.7, 3.4, 7, BRONZE_D); models.fortturret = t.json();
  const c = new M(); c.cyl(12, 10, 0, 3, S.lo, S.mid, 0.9); c.cyl(12, 7.5, 3, 3.6, OBS, OBS, 1); models.core = c.json();
  const iris = new M(); iris.sphere(6.5, (i) => (i < 1 ? '#ffffff' : i < 2 ? '#ff6060' : '#b01818'), 0, 10, 0, 0, 0.5); models.core_eye = iris.json();
}
// 弾・爆弾・木など
{ const m = new M(); m.sphere(2.4, (i) => (i === 0 ? '#ffffff' : '#ff5a4a'), 0, 6); models.bullet = m.json(); }
{ const m = new M(); m.box(-0.6, -0.6, -4, 0.6, 0.6, 4, '#a0f0ff', '#ffffff'); models.shot = m.json(); }
{ const m = new M(); m.sphere(2.2, S.mid, 0, 6); m.cyl(4, 1.2, -0.2, 0.2, S.dark, S.dark, 1, 0, -2.4); models.bomb = m.json(); }
{ const m = new M(); m.cyl(5, 0.5, 0, 1.6, '#4a3420'); m.prism(m.ngon(6, 3.6), 1.2, 6.5, '#2c5a26', '#4a7e36', 0.15); m.prism(m.ngon(6, 2.6), 4.0, 8.5, '#3a6a2e', '#5a8e40', 0.1); models.tree = m.json(); }
{ const m = new M(); m.prism(m.ngon(5, 3.2, 0.4), 0, 2.4, '#6e6a62', '#a6a29a', 0.5); models.rock = m.json(); }
{ const m = new M(); m.box(-6, 0, -6, 6, 6, 6, '#7a7a74', '#a8a8a0'); m.box(-4, 6, -4, 4, 7, 4, '#5a5a56'); models.building = m.json(); }
// 爆発用の破片（小さな四面体）
{ const m = new M(); m.tri([0, 2, 0], [-1.5, 0, 1], [1.5, 0, 1], AMBER).tri([0, 2, 0], [1.5, 0, 1], [0, 0, -1.6], '#ffe080').tri([0, 2, 0], [0, 0, -1.6], [-1.5, 0, 1], '#c04010').tri([-1.5, 0, 1], [0, 0, -1.6], [1.5, 0, 1], '#601808'); models.debris = m.json(); }

let tris = 0; for (const [k, v] of Object.entries(models)) tris += v.tris.length;
writeFileSync(join(OUT, 'models.json'), JSON.stringify(models));
console.log('models:', Object.keys(models).length, 'triangles total', tris);
