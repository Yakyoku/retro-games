// Skyward Ruins のドット絵（すべて独自デザイン）を生成する。
// 出力: unity/SkywardRuins/Assets/SkywardRuins/Art/Sprites/*.png と sprites.json（大きさ・枚数・テンポ）
// 実行: node tools/gen-sprites.mjs  → tools/preview/sprites-sheet.png（4 倍拡大の確認用）も出す
import { Canvas, ramp, hex } from './lib/raster.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Art', 'Sprites');
mkdirSync(OUT, { recursive: true });

// 配色（金属は銀〜灰、地上物はオリーブと石。強い発光色は弾と予兆だけに使う）
const SILVER = ['#3a404e', '#646c7e', '#9aa2b2', '#cfd5de', '#f4f6fa'];
const STEEL = ['#2e3444', '#4c5670', '#76829c', '#a8b2c6', '#d6dce8'];
const BRONZE = ['#3a2c1c', '#6a5030', '#9c7a48', '#c8a868', '#ecd8a0'];
const STONE = ['#2c2a26', '#4e4a42', '#767060', '#a09a86', '#c8c2ac'];
const OLIVE = ['#26301c', '#3e4c2c', '#5c6c40', '#80905a', '#a8b47c'];
const OBSID = ['#101018', '#1e1e2c', '#2e3044', '#46485e'];
const RED = '#e83c3c', CYAN = '#5cd8f0', GOLD = '#f0c040', AMBER = '#ffa030';

const sprites = {}; // name -> {frames, fps, w, h}
const cache = {};
function add(name, frames, fps = 0) { frames.forEach((c, i) => { c.save(join(OUT, `${name}_${i}.png`)); cache[`${name}_${i}`] = c; }); sprites[name] = { frames: frames.length, fps, w: frames[0].w, h: frames[0].h }; }

// 光源は左上。面の向き（法線の x,y）から明るさを出す
const lit = (nx, ny) => 0.55 + 0.35 * (-nx * 0.6 - ny * 0.8);

// ---- 自機「スカイワード」：細身のデルタ翼、背骨状の胴体、双垂直尾翼、青い風防 ----
function player(frame) {
  const c = new Canvas(17, 18);
  const cx = 8.5;
  // 主翼（後退角の強いデルタ）
  c.poly([[cx, 3], [16, 14], [13.5, 15.5], [cx, 12]], (x, y) => ramp(SILVER, lit(0.5, -0.2) - (y - 8) * 0.03, x, y));
  c.poly([[cx, 3], [1, 14], [3.5, 15.5], [cx, 12]], (x, y) => ramp(SILVER, lit(-0.6, -0.4) + 0.12 - (y - 8) * 0.03, x, y));
  // 胴体（中央の背骨）
  c.poly([[cx - 1.6, 1], [cx + 1.6, 1], [cx + 2.2, 15], [cx - 2.2, 15]], (x, y) => ramp(SILVER, x < cx ? 0.95 : 0.7, x, y));
  c.set(8, 0, SILVER[4]);
  // 双垂直尾翼
  c.rect(5, 13, 1, 4, SILVER[2]); c.rect(11, 13, 1, 4, SILVER[1]);
  // 風防
  c.rect(8, 4, 1, 3, CYAN); c.set(8, 4, '#c8f4ff'); c.set(7, 5, '#2a6c9c'); c.set(9, 5, '#1e4c74');
  // 翼端の識別灯と翼の溝
  c.set(2, 14, RED); c.set(14, 14, '#40d060');
  c.line(5, 11, 7, 9, SILVER[1]); c.line(12, 11, 10, 9, SILVER[1]);
  // 噴射（2 枚で揺らす）
  const fl = frame ? ['#fff0a0', AMBER] : [AMBER, '#c04010'];
  c.set(8, 16, fl[0]); c.set(8, 17, fl[1]); c.set(7, 16, fl[1]); c.set(9, 16, fl[1]);
  return c.outline();
}
add('player', [player(0), player(1)], 12);

// ---- 空中敵 ----
// ダート：小型の矢じり（編隊直進）
function dart(f) {
  const c = new Canvas(13, 13);
  c.poly([[6.5, 12], [12, 2], [6.5, 5], [1, 2]], (x, y) => ramp(STEEL, x < 6.5 ? 0.85 : 0.55, x, y));
  c.rect(6, 6, 1, 3, f ? GOLD : '#a07020');
  return c.outline();
}
add('dart', [dart(0), dart(1)], 8);
// アーク：回転する輪（旋回）— 切り欠きが回る 4 枚
function arc(f) {
  const c = new Canvas(14, 14);
  c.ring(7, 7, 3.2, 6.4, (x, y, dx, dy) => ramp(STEEL, lit(dx / 6, dy / 6) + 0.1, x, y));
  const a = f * Math.PI / 4; // 切り欠き
  for (let k = 0; k < 2; k++) { const ang = a + k * Math.PI; for (let r = 3; r <= 6.5; r += 0.5) c.set(Math.floor(7 + Math.cos(ang) * r), Math.floor(7 + Math.sin(ang) * r), [0, 0, 0, 0]); }
  c.circle(7, 7, 1.6, f % 2 ? CYAN : '#2a8aa0');
  return c.outline();
}
add('arc', [0, 1, 2, 3].map(arc), 10);
// シーカー：赤い眼を持つ菱形（接近）
function seeker(f) {
  const c = new Canvas(13, 15);
  c.poly([[6.5, 0], [12.5, 7.5], [6.5, 15], [0.5, 7.5]], (x, y) => ramp(STEEL, lit((x - 6.5) / 6, (y - 7.5) / 7) + 0.05, x, y));
  c.poly([[6.5, 3], [9.5, 7.5], [6.5, 12], [3.5, 7.5]], (x, y) => ramp(OBSID, 0.5, x, y));
  c.circle(6.5, 8, f ? 1.8 : 1.2, RED); c.set(6, 7, '#ffb0a0');
  return c.outline();
}
add('seeker', [seeker(0), seeker(1)], 6);
// クロッサー：横長の六角カプセル（横切り）
function crosser(f) {
  const c = new Canvas(19, 11);
  c.poly([[0.5, 5.5], [3, 3], [16, 3], [18.5, 5.5], [16, 8], [3, 8]], (x, y) => ramp(STEEL, lit(0, (y - 5.5) / 3) + 0.1, x, y));   // 胴
  c.poly([[6, 3], [8, 0], [11, 0], [13, 3]], (x, y) => ramp(STEEL, 0.8, x, y));      // 上の翼
  c.poly([[6, 8], [8, 11], [11, 11], [13, 8]], (x, y) => ramp(STEEL, 0.35, x, y));   // 下の翼
  c.rect(2, 5, 15, 1, '#a02828');
  for (let i = 0; i < 3; i++) c.set(6 + i * 3, 5, f % 3 === i ? GOLD : '#601818');
  return c.outline();
}
add('crosser', [0, 1, 2].map(crosser), 8);
// スナイパー：十字の照準器を持つ機体（狙い撃ち）
function sniper(f) {
  const c = new Canvas(15, 15);
  c.rect(6, 0, 3, 15, STEEL[2]); c.rect(0, 6, 15, 3, STEEL[2]);
  c.rect(6, 0, 1, 15, STEEL[3]); c.rect(0, 6, 15, 1, STEEL[3]);
  c.circle(7.5, 7.5, 3.6, (x, y, dx, dy) => ramp(STEEL, lit(dx / 3, dy / 3) + 0.15, x, y));
  c.circle(7.5, 7.5, 1.8, f ? '#ffd0d0' : RED);
  return c.outline();
}
add('sniper', [sniper(0), sniper(1)], 4);
// ヘビー：装甲板の八角形（強化空中敵）
function heavy(f) {
  const c = new Canvas(21, 21);
  const oct = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; oct.push([10.5 + Math.cos(a) * 10, 10.5 + Math.sin(a) * 10]); }
  c.poly(oct, (x, y) => ramp(STEEL, lit((x - 10.5) / 10, (y - 10.5) / 10) + 0.05, x, y));
  const inner = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; inner.push([10.5 + Math.cos(a) * 6, 10.5 + Math.sin(a) * 6]); }
  c.poly(inner, (x, y) => ramp(STEEL, 0.35, x, y));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + f * 0.0; c.line(10.5 + Math.cos(a) * 6.5, 10.5 + Math.sin(a) * 6.5, 10.5 + Math.cos(a) * 9.5, 10.5 + Math.sin(a) * 9.5, STEEL[0]); }
  c.circle(10.5, 10.5, 2.4, f ? AMBER : '#a05010');
  return c.outline();
}
add('heavy', [heavy(0), heavy(1)], 4);
// シャード：破壊できない黒曜石の板（回転して縁が光る）。8 枚で回る
function shard(f) {
  const c = new Canvas(16, 16);
  const w = Math.abs(Math.cos(f * Math.PI / 8)) * 6.5 + 1.0;
  c.poly([[8 - w, 2], [8 + w, 2], [8 + w, 14], [8 - w, 14]], (x, y) => ramp(OBSID, 0.3 + (x - 8) / 20 + (f < 4 ? 0.2 : 0), x, y));
  for (let y = 2; y < 14; y++) { c.set(Math.round(8 - w), y, f % 2 ? GOLD : '#b08830'); }
  c.rect(Math.round(8 - w), 7, Math.max(1, Math.round(w * 2)), 1, '#6a5a90');
  return c.outline('#000000');
}
add('shard', [0, 1, 2, 3, 4, 5, 6, 7].map(shard), 10);

// ---- 地上物（真上から見た形。地表の色と区別できる石とオリーブ） ----
function turret(f) {
  const c = new Canvas(14, 14);
  c.circle(7, 7, 6.2, (x, y, dx, dy) => ramp(STONE, lit(dx / 6, dy / 6) + 0.1, x, y));
  c.ring(7, 7, 4, 5, STONE[1]);
  c.circle(7, 7, 3, (x, y, dx, dy) => ramp(OLIVE, lit(dx / 3, dy / 3) + 0.2, x, y));
  c.rect(6, 0, 2, 6, OLIVE[1]); c.rect(6, 0, 1, 6, OLIVE[3]);   // 砲身（描画時に自機方向へ回す）
  c.set(7, 7, f ? RED : '#601818');
  return c.outline();
}
add('turret', [turret(0), turret(1)], 0);
function tank(f) {
  const c = new Canvas(13, 14);
  c.rect(1, 1, 3, 12, f ? STONE[1] : STONE[0]); c.rect(9, 1, 3, 12, f ? STONE[0] : STONE[1]);
  for (let y = 1 + f; y < 13; y += 2) { c.set(1, y, STONE[2]); c.set(11, y, STONE[2]); }
  c.rect(3, 3, 7, 8, OLIVE[2]); c.rect(3, 3, 7, 1, OLIVE[4]);
  c.circle(6.5, 7, 2.4, OLIVE[3]); c.rect(6, 0, 1, 5, OLIVE[1]);
  return c.outline();
}
add('tank', [tank(0), tank(1)], 8);
function bunker(f) {
  const c = new Canvas(18, 18);
  c.poly([[3, 1], [15, 1], [17, 3], [17, 15], [15, 17], [3, 17], [1, 15], [1, 3]], (x, y) => ramp(STONE, lit((x - 9) / 8, (y - 9) / 8) + 0.15, x, y));
  c.rect(4, 4, 10, 10, STONE[1]); c.rect(5, 5, 8, 8, STONE[2]);
  c.rect(7, 7, 4, 4, f === 2 ? '#401010' : (f ? RED : '#8a2020'));
  for (const [x, y] of [[3, 3], [14, 3], [3, 14], [14, 14]]) c.set(x, y, STONE[4]);
  return c.outline();
}
add('bunker', [bunker(0), bunker(1), bunker(2)], 0);   // 2 = 損傷
function radar(f) {
  const c = new Canvas(15, 15);
  c.rect(3, 3, 9, 9, STONE[2]); c.rect(3, 3, 9, 1, STONE[4]);
  const a = f * Math.PI / 3;
  c.poly([[7.5 + Math.cos(a) * 7, 7.5 + Math.sin(a) * 7], [7.5 + Math.cos(a + 2.4) * 4, 7.5 + Math.sin(a + 2.4) * 4], [7.5 + Math.cos(a - 2.4) * 4, 7.5 + Math.sin(a - 2.4) * 4]], (x, y) => ramp(SILVER, 0.75, x, y));
  c.circle(7.5, 7.5, 1.5, CYAN);
  return c.outline();
}
add('radar', [0, 1, 2, 3, 4, 5].map(radar), 6);
// オベリスク（ソル相当の隠し対象）：地中から出る石柱。出現 5 枚＋通常＋損傷
function obelisk(stage) { // 0..4 出現途中, 5 通常, 6 損傷
  const c = new Canvas(14, 18);
  const h = stage >= 5 ? 1 : (stage + 1) / 5;
  c.circle(7, 14, 6.4 * Math.max(0.4, h), STONE[1]);      // 掘り返された土
  const top = 14 - 12 * h;
  c.poly([[3, 15], [11, 15], [9.5, top + 2], [7, top], [4.5, top + 2]], (x, y) => ramp(BRONZE, x < 7 ? 0.85 : 0.5, x, y));
  if (stage >= 5) { c.line(7, top + 3, 7, 13, BRONZE[1]); c.set(7, top + 4, stage === 6 ? '#401010' : GOLD); c.set(6, top + 7, CYAN); c.set(8, top + 7, CYAN); }
  if (stage === 6) { c.line(5, 8, 8, 11, '#202020'); c.line(9, 6, 7, 9, '#202020'); }
  return c.outline();
}
add('obelisk', [0, 1, 2, 3, 4, 5, 6].map(obelisk), 10);
// バナー（スペシャルフラッグ相当）：山形の紋章を持つ三角旗
function banner(f) {
  const c = new Canvas(14, 16);
  c.rect(3, 1, 1, 14, SILVER[3]); c.circle(3.5, 15, 1.4, STONE[2]);
  const wave = f % 2;
  c.poly([[4, 1], [13, 3.5 + wave], [4, 7]], (x, y) => ramp(['#801818', '#c02828', '#f04848', '#ff8080'], 0.6 + (y - 4) * -0.05, x, y));
  c.line(6, 2.5, 9, 4 + wave * 0.5, '#fff0d0'); c.line(9, 4 + wave * 0.5, 6, 5.5, '#fff0d0');
  return c.outline();
}
add('banner', [banner(0), banner(1)], 4);

// ---- 要塞（アンドア・ジェネシス相当の大型要塞。独自デザイン：六角の浮遊基壇＋外周の砲座＋中央の虹彩コア） ----
function fortress(f) {
  const W = 112, H = 88, c = new Canvas(W, H), cx = W / 2, cy = H / 2;
  const hexP = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; hexP.push([cx + Math.cos(a) * 54, cy + Math.sin(a) * 42]); }
  c.poly(hexP, (x, y) => ramp(STEEL, lit((x - cx) / 54, (y - cy) / 42) * 0.75 - 0.1, x, y));
  const hex2 = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; hex2.push([cx + Math.cos(a) * 38, cy + Math.sin(a) * 31]); }
  c.poly(hex2, (x, y) => ramp(STEEL, lit((x - cx) / 38, (y - cy) / 31) * 0.5 + 0.38, x, y));
  for (let i = 0; i < 6; i++) { const a0 = i * Math.PI / 3 + Math.PI / 6, a1 = a0 + Math.PI / 3; c.line(cx + Math.cos(a0) * 38, cy + Math.sin(a0) * 31, cx + Math.cos(a1) * 38, cy + Math.sin(a1) * 31, STEEL[4]); }
  // 外周の装甲ブロック（砲座の受け皿）
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; c.circle(cx + Math.cos(a) * 40, cy + Math.sin(a) * 30, 5, (x, y) => ramp(STEEL, 0.15, x, y)); }
  c.circle(cx, cy, 13, (x, y, dx, dy) => ramp(STEEL, lit(dx / 13, dy / 13) * 0.5 + 0.2, x, y));
  // 放射状の溝と継ぎ目
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.line(cx + Math.cos(a) * 16, cy + Math.sin(a) * 13, cx + Math.cos(a) * 50, cy + Math.sin(a) * 39, STEEL[0]); }
  c.ring(cx, cy, 15, 17, STEEL[0]);
  // 外周の灯（予兆時に点く）
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.circle(cx + Math.cos(a) * 46, cy + Math.sin(a) * 36, 1.4, f % 2 ? GOLD : '#6a5020'); }
  return c.outline('#0a0c12');
}
add('fortress', [fortress(0), fortress(1)], 3);
// 要塞の砲座
function fortTurret(f) {
  const c = new Canvas(14, 14);
  c.circle(7, 7, 6, (x, y, dx, dy) => ramp(BRONZE, lit(dx / 6, dy / 6) + 0.1, x, y));
  c.circle(7, 7, 3, BRONZE[1]); c.rect(6, 0, 2, 5, BRONZE[0]);
  c.set(7, 7, f ? RED : '#702020');
  return c.outline();
}
add('fortturret', [fortTurret(0), fortTurret(1)], 0);
// 要塞のコア（虹彩が開閉する 4 枚：0 閉 → 3 全開）
function core(f) {
  const c = new Canvas(22, 22);
  c.circle(11, 11, 10, (x, y, dx, dy) => ramp(SILVER, lit(dx / 10, dy / 10) + 0.05, x, y));
  const open = f / 3 * 6.5;
  c.circle(11, 11, 7.5, OBSID[0]);
  if (open > 0) c.circle(11, 11, open, (x, y, dx, dy) => { const d = Math.sqrt(dx * dx + dy * dy) / open; return d < 0.45 ? '#ffffff' : d < 0.75 ? '#ff6060' : '#b01818'; });
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + f * 0.2; c.line(11 + Math.cos(a) * (open + 0.5), 11 + Math.sin(a) * (open + 0.5), 11 + Math.cos(a + 0.6) * 7.5, 11 + Math.sin(a + 0.6) * 7.5, SILVER[1]); }
  return c.outline();
}
add('core', [0, 1, 2, 3].map(core), 8);

// ---- 弾・照準・爆発 ----
function shot() { const c = new Canvas(3, 8); c.rect(1, 0, 1, 8, '#ffffff'); c.rect(0, 2, 3, 4, '#a0f0ff'); c.rect(1, 2, 1, 4, '#ffffff'); return c; }
add('shot', [shot()]);
function bomb(f) { const c = new Canvas(7, 7); c.circle(3.5, 3.5, 2.6, (x, y, dx, dy) => ramp(SILVER, lit(dx / 2.6, dy / 2.6) + 0.1, x, y)); c.set(3, 3, f ? '#ffffff' : SILVER[2]); return c.outline(); }
add('bomb', [bomb(0), bomb(1)], 12);
// 敵弾：白い芯＋赤の縁＋暗い輪郭（炎や地表に埋もれないよう明暗差を最大に）
function bullet(f) { const c = new Canvas(7, 7); c.circle(3.5, 3.5, 3.0, f ? '#ff5050' : '#ff9060'); c.circle(3.5, 3.5, 1.6, '#ffffff'); return c.outline('#200808'); }
add('bullet', [bullet(0), bullet(1)], 15);
// 照準：通常（白）／目標あり（赤）／隠し対象の反応（点滅は描画側）
function sight(kind) {
  const c = new Canvas(15, 15), col = kind === 1 ? '#ff4040' : kind === 2 ? GOLD : '#e8f0ff';
  for (const [x, y, w, h] of [[0, 0, 4, 1], [0, 0, 1, 4], [11, 0, 4, 1], [14, 0, 1, 4], [0, 14, 4, 1], [0, 11, 1, 4], [11, 14, 4, 1], [14, 11, 1, 4]]) c.rect(x, y, w, h, col);
  c.rect(7, 5, 1, 2, col); c.rect(7, 8, 1, 2, col); c.rect(5, 7, 2, 1, col); c.rect(8, 7, 2, 1, col);
  return c.outline('#101010');
}
add('sight', [sight(0), sight(1), sight(2)], 0);
function boomAir(f) { // 空中爆発 6 枚：白い閃光 → 橙の火球 → 金属片
  const c = new Canvas(20, 20), t = f / 5;
  if (f < 2) c.circle(10, 10, 4 + f * 3, f ? '#ffe080' : '#ffffff');
  else { c.circle(10, 10, 8 - (f - 2) * 0.8, (x, y, dx, dy) => { const d = Math.sqrt(dx * dx + dy * dy); return d < 3 - t ? '#fff0a0' : d < 6 - t * 2 ? AMBER : '#a03010'; }); }
  for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.3, r = 3 + f * 1.6; c.set(10 + Math.cos(a) * r, 10 + Math.sin(a) * r, f > 3 ? STEEL[1] : STEEL[3]); }
  if (f >= 4) for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (((x + y + f) % 3) === 0) { const p = c.get(x, y); if (p[3] && p[0] > 150) c.set(x, y, '#7a3010'); }
  return c;
}
add('boomair', [0, 1, 2, 3, 4, 5].map(boomAir), 14);
function boomGround(f) { // 地上の爆発 6 枚：土煙と焦げ跡
  const c = new Canvas(24, 24);
  if (f < 4) c.circle(12, 12, 5 + f * 2, (x, y, dx, dy) => { const d = Math.sqrt(dx * dx + dy * dy) / (5 + f * 2); return d < 0.3 && f < 2 ? '#ffffff' : d < 0.55 ? (f < 2 ? '#ffd060' : '#c86020') : (f < 3 ? '#8a5a30' : '#5a4430'); });
  else c.circle(12, 12, 9 - (f - 4) * 2, (x, y) => ((x + y) % 2 ? '#4a3a28' : '#3a2c1e'));
  return c;
}
add('boomground', [0, 1, 2, 3, 4, 5].map(boomGround), 12);
function crater() { const c = new Canvas(16, 16); c.circle(8, 8, 6.5, (x, y, dx, dy) => (dx * dx + dy * dy < 12 ? '#1e1812' : ((x + y) % 2 ? '#3e3020' : '#30261a'))); return c; }
add('crater', [crater()]);
function bombBurst(f) { // 爆撃の着弾表示（判定半径 11 と同じ半径の輪）
  const c = new Canvas(23, 23); c.ring(11.5, 11.5, 9.5 - f, 11, f < 2 ? '#ffffff' : '#ffc060'); return c;
}
add('bombburst', [0, 1, 2, 3].map(bombBurst), 20);
function spark(f) { const c = new Canvas(7, 7); c.line(0, 3, 6, 3, f ? GOLD : '#ffffff'); c.line(3, 0, 3, 6, f ? GOLD : '#ffffff'); return c; }
add('spark', [spark(0), spark(1)], 20);

writeFileSync(join(OUT, '..', 'sprites.json'), JSON.stringify(sprites, null, 1));

// ---- 確認用のシート（4 倍） ----
const prevDir = join(here, 'preview'); mkdirSync(prevDir, { recursive: true });
const entries = Object.entries(sprites); const K = 4;
let sheetW = 0, rowsH = [];
const lines = []; let line = [], lw = 0;
for (const [name, s] of entries) { const w = s.frames * (s.w + 2); if (lw + w > 240 && line.length) { lines.push(line); line = []; lw = 0; } line.push(name); lw += w; }
lines.push(line);
const LH = lines.map(l => Math.max(...l.map(n => sprites[n].h)) + 4);
sheetW = 260; const sheetH = LH.reduce((a, b) => a + b, 0);
const sheet = new Canvas(sheetW, sheetH);
sheet.rect(0, 0, sheetW, sheetH, '#4a6a3a');
let yy = 0;
lines.forEach((l, li) => { let xx = 2; for (const n of l) { const s = sprites[n]; for (let f = 0; f < s.frames; f++) { const img = loadPng(n, f); sheet.blit(img, xx, yy + 2); xx += s.w + 2; } xx += 4; } yy += LH[li]; });
function loadPng(n, f) { return cache[`${n}_${f}`]; }
// 生成時の Canvas を保持し直して描く（PNG のデコードを避ける）
sheet.scaled(K).save(join(prevDir, 'sprites-sheet.png'));
console.log('sprites:', Object.keys(sprites).length, 'kinds');
