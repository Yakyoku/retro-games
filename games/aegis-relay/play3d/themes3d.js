// AEGIS RELAY — 地表のテクスチャ（8 テーマ）と崖のテクスチャ。すべてキャンバスに計算で描く（画像ファイルは使わない）
// 1 テーマ = 色（1024²）＋法線（512²。高さの絵から計算）＋材質（512²。R=発光 G=粗さ B=金属）。128 単位で継ぎ目なく繰り返す。
// 描くのに時間がかかるので generator にして、エリアの導入中に少しずつ進める（M10）。
import * as THREE from 'three';
import { THEMES } from '../shared/rules.js';
import { rng, fbm, canvasTexture, makeCanvas } from './util3d.js';

export const TILE = 128;                // テクスチャ 1 枚が覆う広さ（論理単位）
const SA = 1024, SB = 512;

// 継ぎ目のないノイズの絵（まだら・粒）。最初の 1 回だけ作る
let noiseCv = null;
function* buildNoise() {
  if (noiseCv) return;
  const N = 256, mk = (seed, sc, oct, per) => { const cv = makeCanvas(N), c = cv.getContext('2d'), im = c.createImageData(N, N); return { cv, c, im, seed, sc, oct, per }; };
  const L = [mk(1, 32, 5, 8), mk(7, 8, 3, 32)];
  for (const l of L) {
    for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) { const v = fbm(x / l.sc, y / l.sc, l.seed, l.oct, l.per) * 255; const i = (y * N + x) * 4; l.im.data[i] = l.im.data[i + 1] = l.im.data[i + 2] = v; l.im.data[i + 3] = 255; } if (y % 64 === 63) yield; }
    l.c.putImageData(l.im, 0, 0);
  }
  noiseCv = { big: L[0].cv, fine: L[1].cv };
}

const g255 = (v) => { const k = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${k},${k},${k})`; };
const ga = (v, a) => { const k = Math.round(v * 255); return `rgba(${k},${k},${k},${a})`; };

// 描く道具: 色 a / 高さ h / 発光 e / 粗さ r / 金属 m の 5 枚に、同じ形を継ぎ目をまたいで描く
function makeTile() {
  const cv = { a: makeCanvas(SA), h: makeCanvas(SB), e: makeCanvas(SB), r: makeCanvas(SB), m: makeCanvas(SB) };
  const cx = {}; for (const k in cv) cx[k] = cv[k].getContext('2d');
  const T = {
    cv, cx,
    fill(v) { for (const k in v) { cx[k].globalCompositeOperation = 'source-over'; cx[k].globalAlpha = 1; cx[k].fillStyle = k === 'a' ? v[k] : g255(v[k]); cx[k].fillRect(0, 0, cv[k].width, cv[k].height); } },
    // ノイズを重ねる。mode: multiply / overlay / soft-light / screen …。rep = 繰り返す回数
    noise(k, which, rep, alpha, mode = 'overlay') {
      const c = cx[k], S = cv[k].width; c.save(); c.globalCompositeOperation = mode; c.globalAlpha = alpha; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      const s = S / rep; for (let i = 0; i < rep; i++) for (let j = 0; j < rep; j++) c.drawImage(noiseCv[which], i * s, j * s, s + 0.5, s + 0.5);
      c.restore();
    },
    // (x, y) は 0..1。rad（0..1）までの範囲に fn(c, px) で描く。px = 1 単位（タイル全幅）の画素数
    at(k, x, y, rad, fn) {
      const c = cx[k], S = cv[k].width;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const X = x + ox, Y = y + oy; if (X < -rad || X > 1 + rad || Y < -rad || Y > 1 + rad) continue;
        c.save(); c.translate(X * S, Y * S); fn(c, S); c.restore();
      }
    },
    // 折れ線（pts は 0..1 の [x, y] の並び）。w は 0..1 の幅
    line(k, pts, w, style, alpha = 1, blur = 0) {
      let minx = 9, maxx = -9, miny = 9, maxy = -9; for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
      const c = cx[k], S = cv[k].width;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        if (maxx + ox < -0.05 || minx + ox > 1.05 || maxy + oy < -0.05 || miny + oy > 1.05) continue;
        c.save(); c.translate(ox * S, oy * S); c.globalAlpha = alpha; c.strokeStyle = typeof style === 'number' ? g255(style) : style; c.lineWidth = Math.max(0.6, w * S); c.lineCap = 'round'; c.lineJoin = 'round';
        if (blur) { c.shadowColor = c.strokeStyle; c.shadowBlur = blur * S; }
        c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0] * S, p[1] * S) : c.moveTo(p[0] * S, p[1] * S))); c.stroke(); c.restore();
      }
    },
    disc(k, x, y, r, style, alpha = 1) { T.at(k, x, y, r, (c, S) => { c.globalAlpha = alpha; c.fillStyle = typeof style === 'number' ? g255(style) : style; c.beginPath(); c.arc(0, 0, r * S, 0, 7); c.fill(); }); },
    // 中心 v0 → 縁 v1 のぼかした円（高さ・発光など灰色の層に）。色を文字列で渡すときは (中心の色, 縁の色)
    soft(k, x, y, r, v0, a0, v1 = v0, a1 = 0) { T.at(k, x, y, r, (c, S) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, r * S); if (typeof v0 === 'number') { g.addColorStop(0, ga(v0, a0)); g.addColorStop(1, ga(v1, a1)); } else { g.addColorStop(0, v0); g.addColorStop(1, a0); } c.fillStyle = g; c.fillRect(-r * S, -r * S, 2 * r * S, 2 * r * S); }); },
    rect(k, x, y, w, h, style, alpha = 1) { T.at(k, x + w / 2, y + h / 2, Math.max(w, h), (c, S) => { c.globalAlpha = alpha; c.fillStyle = typeof style === 'number' ? g255(style) : style; c.fillRect(-w / 2 * S, -h / 2 * S, w * S, h * S); }); },
  };
  return T;
}
// ひび・脈: ランダムに折れ曲がって伸び、ときどき枝分かれする線
function crack(r, x, y, ang, len, seg, out, depth = 0) {
  const pts = [[x, y]];
  for (let i = 0; i < seg; i++) { ang += (r() - 0.5) * 1.1; x += Math.cos(ang) * len / seg; y += Math.sin(ang) * len / seg; pts.push([x, y]); if (depth < 2 && r() < 0.22) crack(r, x, y, ang + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.7), len * 0.55, Math.max(3, seg >> 1), out, depth + 1); }
  out.push(pts);
}

// テーマごとの描き方。戻り値は材質の調整値
const PAINT = {
  ash(T, r, th) { // 灰の浅瀬: クレーターと灰の砂紋
    T.fill({ a: '#5a5c64', h: 0.5, e: 0, r: 0.93, m: 0.02 });
    T.noise('a', 'big', 1, 0.75, 'soft-light'); T.noise('a', 'fine', 4, 0.5, 'overlay'); T.noise('h', 'big', 1, 0.5, 'overlay'); T.noise('h', 'fine', 4, 0.3, 'overlay');
    for (let i = 0; i < 26; i++) { const y = r(), amp = 0.004 + r() * 0.008, f = 2 + Math.floor(r() * 3), ph = r() * 6; const pts = []; for (let k = 0; k <= 32; k++) pts.push([k / 32, y + Math.sin((k / 32) * Math.PI * 2 * f + ph) * amp]); // 砂紋（横にひと回りして継ぎ目なし）
      T.line('a', pts, 0.004, 'rgba(255,255,255,.10)'); T.line('a', pts.map((p) => [p[0], p[1] + 0.006]), 0.004, 'rgba(0,0,0,.14)'); T.line('h', pts, 0.006, 0.62, 0.5); }
    for (let i = 0; i < 20; i++) { const x = r(), y = r(), rad = 0.018 + r() * r() * 0.075; // クレーター
      T.disc('a', x, y, rad * 1.12, 'rgba(210,215,228,.30)'); T.disc('a', x, y, rad, 'rgba(34,36,46,.55)'); T.soft('a', x + rad * 0.2, y + rad * 0.2, rad * 0.9, 'rgba(150,156,172,.45)', 'rgba(150,156,172,0)');
      T.disc('h', x, y, rad * 1.15, 0.8, 0.9); T.soft('h', x, y, rad, 0.08, 1, 0.42, 1); T.disc('r', x, y, rad, 0.98); }
    for (let i = 0; i < 160; i++) { const x = r(), y = r(), s = 0.002 + r() * 0.005; T.disc('a', x, y, s, r() < 0.5 ? 'rgba(20,22,30,.5)' : 'rgba(200,205,220,.4)'); T.disc('h', x, y, s, 0.75, 0.8); }
    return { rough: 1, metal: 1, normal: 1.3, em: 0, emMode: 0, emColor: th.glow };
  },
  ice(T, r, th) { // 霜の環礁: 氷の亀裂、なめらかな氷面（映り込み）、霜
    T.fill({ a: '#5f93b0', h: 0.5, e: 0, r: 0.3, m: 0.0 });
    T.noise('a', 'big', 1, 0.8, 'soft-light'); T.noise('h', 'big', 1, 0.35, 'overlay');
    for (let i = 0; i < 16; i++) { const x = r(), y = r(), rad = 0.05 + r() * 0.12; T.soft('a', x, y, rad, 'rgba(200,228,240,.5)', 'rgba(200,228,240,0)'); T.soft('r', x, y, rad, 0.85, 0.9, 0.85, 0); T.soft('h', x, y, rad, 0.62, 0.7, 0.62, 0); } // 霜の積もったところ（ざらつく）
    for (let i = 0; i < 9; i++) { const x = r(), y = r(), rad = 0.04 + r() * 0.08; T.soft('a', x, y, rad, 'rgba(20,70,110,.5)', 'rgba(20,70,110,0)'); T.soft('r', x, y, rad, 0.12, 1, 0.12, 0); }                                              // 深く澄んだ氷
    const cr = []; for (let i = 0; i < 11; i++) crack(r, r(), r(), r() * 6.28, 0.3 + r() * 0.35, 9, cr);
    for (const p of cr) { T.line('a', p, 0.006, 'rgba(240,252,255,.55)'); T.line('a', p, 0.0022, 'rgba(18,52,84,.9)'); T.line('h', p, 0.006, 0.18, 0.9); T.line('e', p, 0.004, 0.5, 0.6, 0.01); T.line('r', p, 0.007, 0.7); }
    T.noise('a', 'fine', 4, 0.25, 'overlay');
    for (let i = 0; i < 260; i++) T.disc('a', r(), r(), 0.0012 + r() * 0.002, 'rgba(255,255,255,.6)');
    return { rough: 1, metal: 1, normal: 1.6, em: 0.55, emMode: 0, emColor: '#7fe0ff' };
  },
  ember(T, r, th) { // 燠の段丘: 焦げた岩、脈動して光る溶岩の筋
    T.fill({ a: '#3d2a26', h: 0.55, e: 0, r: 0.9, m: 0.03 });
    T.noise('a', 'big', 1, 0.9, 'overlay'); T.noise('a', 'fine', 4, 0.6, 'overlay'); T.noise('h', 'big', 1, 0.7, 'overlay'); T.noise('h', 'fine', 4, 0.5, 'overlay');
    for (let i = 0; i < 28; i++) { const x = r(), y = r(), rad = 0.03 + r() * 0.08; T.soft('a', x, y, rad, 'rgba(150,84,52,.4)', 'rgba(150,84,52,0)'); T.soft('h', x, y, rad, 0.8, 0.5, 0.8, 0); }
    const cr = []; for (let i = 0; i < 6; i++) crack(r, r(), r(), r() * 6.28, 0.3 + r() * 0.35, 9, cr);
    for (const p of cr) { T.line('a', p, 0.026, 'rgba(10,4,4,.6)'); T.line('h', p, 0.02, 0.15, 0.8); T.line('e', p, 0.014, 0.22, 0.5, 0.012); T.line('e', p, 0.0045, 1.0, 1); T.line('a', p, 0.006, '#e8601c'); T.line('a', p, 0.002, '#ffd070'); T.line('r', p, 0.01, 0.3); }
    for (let i = 0; i < 12; i++) { const x = r(), y = r(), rad = 0.008 + r() * 0.016; T.soft('e', x, y, rad * 2.4, 1, 0.9, 1, 0); T.disc('a', x, y, rad, '#ff8a30'); T.disc('h', x, y, rad * 1.5, 0.2); } // 溶岩だまり
    return { rough: 1, metal: 1, normal: 2.4, em: 1.7, emMode: 1, emColor: '#ff6a20' };
  },
  mech(T, r, th) { // 歯車の残骸: 金属板、配管、排気口、点滅する灯
    T.fill({ a: '#525e60', h: 0.5, e: 0, r: 0.5, m: 0.85 });
    const N = 6, cs = 1 / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { // 金属板（大きさを 1〜2 マスでまぜる）
      if (r() < 0.25) continue; const w = cs * (r() < 0.25 && i < N - 1 ? 2 : 1), h = cs * (r() < 0.25 && j < N - 1 ? 2 : 1), x = i * cs, y = j * cs, tone = 60 + Math.floor(r() * 50);
      T.rect('a', x + 0.004, y + 0.004, w - 0.008, h - 0.008, `rgb(${tone},${tone + 12},${tone + 12})`); T.rect('h', x + 0.004, y + 0.004, w - 0.008, h - 0.008, 0.52 + r() * 0.12); T.rect('r', x + 0.004, y + 0.004, w - 0.008, h - 0.008, 0.32 + r() * 0.3);
      T.rect('a', x + 0.004, y + 0.004, w - 0.008, 0.004, 'rgba(255,255,255,.22)'); T.rect('a', x + 0.004, y + h - 0.008, w - 0.008, 0.004, 'rgba(0,0,0,.35)');
      for (const [bx, by] of [[0.014, 0.014], [w - 0.014, 0.014], [0.014, h - 0.014], [w - 0.014, h - 0.014]]) { T.disc('a', x + bx, y + by, 0.0042, 'rgba(20,24,26,.8)'); T.disc('h', x + bx, y + by, 0.004, 0.8); } }
    for (let i = 0; i <= N; i++) { T.rect('a', i * cs - 0.003, 0, 0.006, 1, 'rgba(8,10,12,.85)'); T.rect('a', 0, i * cs - 0.003, 1, 0.006, 'rgba(8,10,12,.85)'); T.rect('h', i * cs - 0.004, 0, 0.008, 1, 0.2); T.rect('h', 0, i * cs - 0.004, 1, 0.008, 0.2); }
    for (let i = 0; i < 5; i++) { const horiz = r() < 0.5, p = (Math.floor(r() * N) + 0.5) * cs, w = 0.014 + r() * 0.012; const pts = horiz ? [[0, p], [1, p]] : [[p, 0], [p, 1]]; // 配管
      T.line('a', pts, w * 1.5, 'rgba(0,0,0,.45)'); T.line('a', pts, w, '#7c8a86'); T.line('a', pts.map((q) => [q[0] - (horiz ? 0 : w * 0.25), q[1] - (horiz ? w * 0.25 : 0)]), w * 0.3, 'rgba(230,245,240,.6)'); T.line('h', pts, w, 0.95); T.line('r', pts, w, 0.25); T.line('m', pts, w, 1);
      for (let k = 0; k < 4; k++) { const q = (k + 0.5) / 4; const a = horiz ? [[q, p - w * 0.7], [q, p + w * 0.7]] : [[p - w * 0.7, q], [p + w * 0.7, q]]; T.line('a', a, 0.007, '#39403f'); T.line('h', a, 0.007, 1); } }
    for (let i = 0; i < 6; i++) { const x = (Math.floor(r() * N) + 0.5) * cs, y = (Math.floor(r() * N) + 0.5) * cs; // 排気口
      T.disc('a', x, y, 0.036, '#22282a'); T.disc('h', x, y, 0.036, 0.25); for (let k = -2; k <= 2; k++) { T.rect('a', x - 0.026, y + k * 0.012 - 0.003, 0.052, 0.006, '#58635f'); T.rect('h', x - 0.026, y + k * 0.012 - 0.003, 0.052, 0.006, 0.6); } T.soft('e', x, y, 0.03, 0.25, 0.8, 0.25, 0); }
    for (let i = 0; i < 22; i++) { const x = (Math.floor(r() * N * 4) + 0.5) * cs / 4, y = (Math.floor(r() * N * 4) + 0.5) * cs / 4; T.disc('a', x, y, 0.005, '#c8ffe6'); T.soft('e', x, y, 0.013, 0.7, 1, 0.7, 0); T.disc('e', x, y, 0.005, 1); } // 灯
    T.noise('a', 'big', 1, 0.5, 'soft-light'); T.noise('a', 'fine', 4, 0.3, 'overlay'); T.noise('r', 'fine', 2, 0.4, 'overlay');
    return { rough: 1, metal: 1, normal: 2.4, em: 1.8, emMode: 2, emColor: '#7dffc8' };
  },
  moss(T, r, th) { // 苔の穹窿: 苔と草、水面のきらめき
    T.fill({ a: '#3f5a36', h: 0.5, e: 0, r: 0.95, m: 0.0 });
    T.noise('a', 'big', 1, 0.8, 'soft-light'); T.noise('h', 'big', 1, 0.6, 'overlay');
    for (let i = 0; i < 150; i++) { const x = r(), y = r(), rad = 0.012 + r() * 0.04, t = r(); const col = t < 0.4 ? '104,150,74' : t < 0.75 ? '62,104,52' : '150,178,96'; // 苔のかたまり
      T.soft('a', x, y, rad, `rgba(${col},.75)`, `rgba(${col},0)`); T.soft('h', x, y, rad, 0.85, 0.5, 0.6, 0); }
    for (let i = 0; i < 7; i++) { const x = r(), y = r(), rad = 0.035 + r() * 0.06; // 水たまり（暗く、なめらか、きらめく）
      for (let k = 0; k < 4; k++) { const ox = (r() - 0.5) * rad, oy = (r() - 0.5) * rad, rr = rad * (0.6 + r() * 0.5); T.disc('a', x + ox, y + oy, rr * 1.12, 'rgba(120,140,92,.5)'); T.disc('a', x + ox, y + oy, rr, '#123a40'); T.disc('h', x + ox, y + oy, rr * 1.1, 0.22); T.disc('r', x + ox, y + oy, rr, 0.05); T.disc('e', x + ox, y + oy, rr, 0.22); }
      for (let k = 0; k < 14; k++) { const a = r() * 6.28, d = r() * rad * 0.9; T.disc('e', x + Math.cos(a) * d, y + Math.sin(a) * d, 0.0035, 1); T.disc('a', x + Math.cos(a) * d, y + Math.sin(a) * d, 0.0025, 'rgba(210,255,240,.8)'); } }
    for (let i = 0; i < 900; i++) { const x = r(), y = r(), a = r() * 6.28, l = 0.004 + r() * 0.008; T.line('a', [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 0.0016, r() < 0.5 ? 'rgba(190,225,130,.55)' : 'rgba(30,60,30,.5)'); } // 草
    for (let i = 0; i < 40; i++) { const x = r(), y = r(); T.disc('a', x, y, 0.004, r() < 0.5 ? '#f4f0c0' : '#ffd0e8'); T.soft('e', x, y, 0.008, 0.6, 1, 0.6, 0); } // 小さな花
    T.noise('a', 'fine', 4, 0.45, 'overlay'); T.noise('h', 'fine', 4, 0.4, 'overlay');
    return { rough: 1, metal: 1, normal: 2.0, em: 1.1, emMode: 3, emColor: '#c8ffe0' };
  },
  gold(T, r, th) { // 黄金の身廊: 石畳、金の象嵌
    T.fill({ a: '#7c6a48', h: 0.5, e: 0, r: 0.8, m: 0.05 });
    const rows = 8, rh = 1 / rows;
    for (let j = 0; j < rows; j++) { const off = (j % 2) * 0.0625; for (let i = 0; i < 8; i++) { const x = i * 0.125 + off, y = j * rh, t = 96 + Math.floor(r() * 50); // 石畳（互い違い）
      T.rect('a', x + 0.004, y + 0.004, 0.117, rh - 0.008, `rgb(${t + 28},${t + 6},${t - 30})`); T.rect('h', x + 0.004, y + 0.004, 0.117, rh - 0.008, 0.55 + r() * 0.14); T.rect('a', x + 0.004, y + 0.004, 0.117, 0.004, 'rgba(255,240,200,.2)'); T.rect('a', x + 0.004, y + rh - 0.008, 0.117, 0.004, 'rgba(0,0,0,.3)'); }
      T.rect('h', 0, j * rh - 0.004, 1, 0.008, 0.15); for (let i = 0; i < 8; i++) T.rect('h', i * 0.125 + off - 0.004, j * rh, 0.008, rh, 0.15); }
    const inlay = (pts, w) => { T.line('a', pts, w * 1.5, 'rgba(40,26,6,.7)'); T.line('a', pts, w, '#f2c452'); T.line('a', pts, w * 0.3, '#fff0b8'); T.line('m', pts, w, 1); T.line('r', pts, w, 0.2); T.line('h', pts, w, 0.72); T.line('e', pts, w, 0.5); };
    for (const c of [0.25, 0.75]) { inlay([[c, 0], [c, 1]], 0.012); inlay([[0, c], [1, c]], 0.012); }   // 金の象嵌: 格子と菱形と円
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.75], [0.25, 0.75], [0.75, 0.25]]) { const d = 0.11; inlay([[x - d, y], [x, y - d], [x + d, y], [x, y + d], [x - d, y]], 0.008); const c2 = []; for (let k = 0; k <= 24; k++) c2.push([x + Math.cos(k / 24 * 6.2832) * 0.05, y + Math.sin(k / 24 * 6.2832) * 0.05]); inlay(c2, 0.006); T.disc('a', x, y, 0.016, '#ffe9a0'); T.disc('m', x, y, 0.016, 1); T.disc('e', x, y, 0.016, 1); T.disc('r', x, y, 0.016, 0.15); }
    T.noise('a', 'big', 1, 0.55, 'soft-light'); T.noise('a', 'fine', 4, 0.35, 'overlay'); T.noise('h', 'fine', 4, 0.25, 'overlay'); T.noise('r', 'big', 1, 0.3, 'overlay');
    return { rough: 1, metal: 1, normal: 2.2, em: 0.5, emMode: 0, emColor: '#ffd060' };
  },
  obsid(T, r, th) { // 黒曜の砦: ガラス質の岩、紫に光る脈
    T.fill({ a: '#1c1826', h: 0.5, e: 0, r: 0.16, m: 0.1 });
    for (let i = 0; i < 46; i++) { const x = r(), y = r(), n = 3 + Math.floor(r() * 3), rad = 0.04 + r() * 0.1, a0 = r() * 6.28, t = Math.floor(r() * 26), hv = 0.3 + r() * 0.5, rv = 0.06 + r() * 0.3; // 割れ面
      const poly = (c, S, k = 1) => { c.beginPath(); for (let q = 0; q < n; q++) { const a = a0 + (q / n) * 6.2832; const rr = rad * k * S; q ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); };
      T.at('a', x, y, rad, (c, S) => { poly(c, S); const g = c.createLinearGradient(-rad * S, -rad * S, rad * S, rad * S); g.addColorStop(0, `rgb(${52 + t},${46 + t},${74 + t})`); g.addColorStop(1, `rgb(${14 + t / 3},${12 + t / 3},${22 + t / 3})`); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(180,160,230,.22)'; c.lineWidth = 1.2; c.stroke(); });
      T.at('h', x, y, rad, (c, S) => { poly(c, S); const g = c.createLinearGradient(-rad * S, 0, rad * S, 0); g.addColorStop(0, g255(hv)); g.addColorStop(1, g255(hv - 0.25)); c.fillStyle = g; c.fill(); });
      T.at('r', x, y, rad, (c, S) => { poly(c, S); c.fillStyle = g255(rv); c.fill(); }); }
    const cr = []; for (let i = 0; i < 5; i++) crack(r, r(), r(), r() * 6.28, 0.3 + r() * 0.35, 8, cr);
    for (const p of cr) { T.line('a', p, 0.01, 'rgba(60,20,110,.6)'); T.line('a', p, 0.003, '#b78cf0'); T.line('e', p, 0.012, 0.2, 0.5, 0.01); T.line('e', p, 0.0035, 1); T.line('h', p, 0.01, 0.15, 0.8); }
    T.noise('a', 'fine', 4, 0.25, 'overlay'); T.noise('h', 'big', 1, 0.3, 'overlay');
    return { rough: 1, metal: 1, normal: 2.6, em: 1.6, emMode: 1, emColor: '#a060ff' };
  },
  zenith(T, r, th) { // 天頂の玉座: 白い大理石、光の紋章
    T.fill({ a: '#9a9fbe', h: 0.5, e: 0, r: 0.36, m: 0.0 });
    T.noise('a', 'big', 1, 0.5, 'soft-light');
    const cr = []; for (let i = 0; i < 14; i++) crack(r, r(), r(), r() * 6.28, 0.4 + r() * 0.5, 12, cr);
    for (const p of cr) { T.line('a', p, 0.012, 'rgba(110,120,180,.16)'); T.line('a', p, 0.003, 'rgba(70,80,140,.45)'); }                    // 大理石の筋
    for (let i = 0; i <= 2; i++) { const p = i * 0.5; for (const pts of [[[p, 0], [p, 1]], [[0, p], [1, p]]]) { T.line('a', pts, 0.008, 'rgba(40,46,90,.7)'); T.line('h', pts, 0.01, 0.12); T.line('a', pts.map((q) => [q[0] + 0.006, q[1] + 0.006]), 0.003, 'rgba(255,255,255,.5)'); } } // 大きな敷石
    const circ = (x, y, rad, w, dash = 0) => { const n = 48; for (let k = 0; k < n; k++) { if (dash && k % dash === 0) continue; const a0 = (k / n) * 6.2832, a1 = ((k + 1.02) / n) * 6.2832; const p = [[x + Math.cos(a0) * rad, y + Math.sin(a0) * rad], [x + Math.cos(a1) * rad, y + Math.sin(a1) * rad]]; T.line('a', p, w, '#eef4ff'); T.line('e', p, w * 3, 0.3, 0.6, 0.01); T.line('e', p, w, 1); } };
    for (const [x, y, s] of [[0.25, 0.25, 1], [0.75, 0.75, 1], [0.75, 0.25, 0.6], [0.25, 0.75, 0.6]]) { // 光の紋章
      circ(x, y, 0.16 * s, 0.005); circ(x, y, 0.12 * s, 0.004, 4); circ(x, y, 0.045 * s, 0.004);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.2832; const p = [[x + Math.cos(a) * 0.05 * s, y + Math.sin(a) * 0.05 * s], [x + Math.cos(a) * 0.115 * s, y + Math.sin(a) * 0.115 * s]]; T.line('a', p, 0.004, '#eef4ff'); T.line('e', p, 0.004, 1); }
      const st = []; for (let k = 0; k <= 4; k++) { const a = -1.5708 + (k * 2 / 4) * 6.2832 * 0.8; st.push([x + Math.cos(a) * 0.1 * s, y + Math.sin(a) * 0.1 * s]); } }
    T.noise('a', 'fine', 4, 0.18, 'overlay'); T.noise('h', 'fine', 4, 0.18, 'overlay'); T.noise('r', 'big', 1, 0.35, 'overlay');
    return { rough: 1, metal: 1, normal: 1.5, em: 1.1, emMode: 0, emColor: '#bcd0ff' };
  },
};

// 高さの絵 → 法線の絵
function* normalFromHeight(hcv, strength) {
  const S = hcv.width, src = hcv.getContext('2d').getImageData(0, 0, S, S).data, out = makeCanvas(S), oc = out.getContext('2d'), im = oc.createImageData(S, S), d = im.data;
  const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) / 255 * strength, dy = (H(x, y + 1) - H(x, y - 1)) / 255 * strength, l = 1 / Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
      d[i] = (-dx * l * 0.5 + 0.5) * 255; d[i + 1] = (dy * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    if (y % 128 === 127) yield;
  }
  oc.putImageData(im, 0, 0); return out;
}

// 1 テーマぶん焼く。戻り値 { map, normalMap, mask, params }
export function* bakeTheme(theme) {
  yield* buildNoise();
  const th = THEMES[theme], T = makeTile(), r = rng(theme.length * 131 + theme.charCodeAt(0) * 17);
  const params = PAINT[theme](T, r, th);
  yield;
  const ncv = yield* normalFromHeight(T.cv.h, 3.0);
  yield;
  // 発光・粗さ・金属を 1 枚にまとめる
  const S = SB, mcv = makeCanvas(S), mc = mcv.getContext('2d'), im = mc.createImageData(S, S);
  const e = T.cx.e.getImageData(0, 0, S, S).data, ro = T.cx.r.getImageData(0, 0, S, S).data, me = T.cx.m.getImageData(0, 0, S, S).data;
  for (let i = 0; i < S * S * 4; i += 4) { im.data[i] = e[i]; im.data[i + 1] = ro[i]; im.data[i + 2] = me[i]; im.data[i + 3] = 255; }
  mc.putImageData(im, 0, 0);
  yield;
  return { map: canvasTexture(T.cv.a), normalMap: canvasTexture(ncv, { srgb: false }), mask: canvasTexture(mcv, { srgb: false }), params };
}

// 崖のテクスチャ（全テーマ共通の濃淡。色は頂点色でつける）: 地層の横縞＋岩肌の縦筋
let cliffTex = null;
export function* bakeCliff() {
  if (cliffTex) return cliffTex;
  yield* buildNoise();
  const S = 512, a = makeCanvas(S), c = a.getContext('2d'), h = makeCanvas(S), hc = h.getContext('2d'), r = rng(4242);
  c.fillStyle = '#b4b4b4'; c.fillRect(0, 0, S, S); hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);
  let y = 0; while (y < S) { const hh = 6 + r() * 30, t = 120 + Math.floor(r() * 120), hv = 80 + Math.floor(r() * 120); c.fillStyle = `rgb(${t},${t},${t})`; c.fillRect(0, y, S, hh); hc.fillStyle = `rgb(${hv},${hv},${hv})`; hc.fillRect(0, y, S, hh); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, y + hh - 2, S, 2); hc.fillStyle = '#202020'; hc.fillRect(0, y + hh - 3, S, 3); y += hh; }
  for (let i = 0; i < 150; i++) { const x = r() * S, y0 = r() * S, l = 30 + r() * 160, w = 1 + r() * 3; for (const oy of [0, -S]) { c.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.2})`; c.fillRect(x, y0 + oy, w, l); hc.fillStyle = 'rgba(0,0,0,.45)'; hc.fillRect(x, y0 + oy, w + 1, l); } }
  for (const [cx2, al] of [[c, 0.6], [hc, 0.5]]) { cx2.globalCompositeOperation = 'overlay'; cx2.globalAlpha = al; cx2.drawImage(noiseCv.big, 0, 0, S, S); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cx2.drawImage(noiseCv.fine, i * S / 2, j * S / 2, S / 2, S / 2); cx2.globalCompositeOperation = 'source-over'; cx2.globalAlpha = 1; }
  yield;
  const n = yield* normalFromHeight(h, 4.0);
  return (cliffTex = { map: canvasTexture(a), normalMap: canvasTexture(n, { srgb: false }) });
}
