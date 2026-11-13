// 2D 版の背景（v3）。階ごとの静止部分を高解像度で一度だけ描いて保存（最大 7 階ぶんの LRU）、動く部分は毎フレーム重ねる。
// 改善: 棟ごとの壁の質感（壁紙・木の腰板・タイル張りの研究棟・コンクリートと鋼板の警備棟）／奥行きのある床の帯（カーペット・タイル・鋼板）と反射／
// 天井の梁・埋め込み照明枠・スプリンクラー・換気口／建物の外壁（窓明かりのカーテンウォール）／棟ごとの家具・機材
// （オフィス: 机とモニター・椅子・書類棚・本棚・観葉植物・ウォーターサーバー・ホワイトボード・絵・時計・ブラインドの窓／
//   研究棟: サーバーラック・実験台とフラスコ・すりガラスの間仕切り・波形モニター・液体タンク・配管・注意標識／
//   警備棟: ロッカー・監視モニターの壁・機材ラック・警告の縞・監視カメラ・回転灯・木箱・金網／訓練棟: 射撃の的・マット・ベンチ）、
// 壁の汚れ・角の陰り（アンビエントオクルージョン）。
import { W, CAR_W, FLOOR_H, level } from '../../shared/core/const.js';
import { makeRng } from '../../shared/core/rng.js';

export const CX0 = -1.6, CX1 = W + 1.6; // 保存する範囲（外壁を含む）
export const FLOOR_BAND = 0.28;          // 床の奥行きの帯

const T = {
  training: { wall: ['#5d646e', '#4b525b'], low: '#3d434b', band: ['#2d3238', '#41474f'], ceil: '#30353c', accent: '#f2c230', light: 'cage', tint: 'rgba(255,240,200,0.0)' },
  office: { wall: ['#857360', '#6f5e4d'], low: '#4f3b2c', band: ['#3a2a24', '#5a4236'], ceil: '#3a3129', accent: '#e8c48a', light: 'pendant', tint: 'rgba(255,190,120,0.06)' },
  lab: { wall: ['#7a96a1', '#617d89'], low: '#3f5560', band: ['#5d7680', '#8fa8b1'], ceil: '#3f525a', accent: '#7fe0e6', light: 'tube', tint: 'rgba(120,220,255,0.07)' },
  security: { wall: ['#5d6458', '#4a5046'], low: '#33382f', band: ['#2b2f2a', '#454a43'], ceil: '#2c302a', accent: '#e05a4c', light: 'cage', tint: 'rgba(255,80,60,0.05)' },
};
export const themeOf = (name) => T[name] || T.office;

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [k, col] of stops) g.addColorStop(k, col); return g; }

export class FloorCache {
  constructor() { this.map = new Map(); this.s = 0; this.max = 7; }
  reset() { this.map.clear(); }
  get(game, f, s) {
    if (s !== this.s || this.game !== game) { this.map.clear(); this.s = s; this.game = game; }
    let e = this.map.get(f);
    if (e) { this.map.delete(f); this.map.set(f, e); return e; } // LRU
    e = buildFloor(game, f, s);
    this.map.set(f, e);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return e;
  }
}

function buildFloor(game, f, s) {
  const L = level(f); const th = themeOf(game.stage.theme);
  const y0 = L - 0.35, y1 = L + FLOOR_H;
  const w = Math.ceil((CX1 - CX0) * s), h = Math.ceil((y1 - y0) * s);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c = cv.getContext('2d');
  c.setTransform(s, 0, 0, -s, -CX0 * s, y1 * s);
  const dyn = { monitors: [], leds: [], cams: [], beacons: [], screens: [], clocks: [] };
  const r = makeRng(f * 7717 + game.stage.id.length * 131 + 5);
  exterior(c, game, f, L, r);
  wall(c, game, f, L, th, r);
  props(c, game, f, L, th, r, dyn);
  ceiling(c, game, f, L, th, r);
  floorBand(c, game, f, L, th);
  slab(c, game, f, L, th);
  return { cv, y0, y1, dyn };
}

// ---------- 外壁（建物の外から見た面。窓明かり） ----------
function exterior(c, game, f, L, r) {
  for (const [x0, x1] of [[CX0, 0], [W, CX1]]) {
    c.fillStyle = lg(c, x0, 0, x1, 0, x0 < 0 ? [[0, '#10141c'], [1, '#1d232e']] : [[0, '#1d232e'], [1, '#10141c']]);
    c.fillRect(x0, L - 0.35, x1 - x0, FLOOR_H + 0.35);
    // 階の帯（スラブの見切り）
    c.fillStyle = '#2a313d'; c.fillRect(x0, L - 0.35, x1 - x0, 0.35);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x0, L - 0.02, x1 - x0, 0.02);
    // 窓（ガラスのカーテンウォール）
    const ww = 0.62;
    for (let x = x0 + 0.12; x + ww <= x1 - 0.05; x += ww + 0.1) {
      const lit = r() < 0.35;
      c.fillStyle = lit ? lg(c, 0, L + 0.3, 0, L + 2.6, [[0, '#6a5a3a'], [1, '#c9a86a']]) : lg(c, 0, L + 0.3, 0, L + 2.6, [[0, '#0b1220'], [1, '#1c2a40']]);
      c.fillRect(x, L + 0.35, ww, 2.25);
      c.fillStyle = 'rgba(160,200,255,0.10)'; c.beginPath(); c.moveTo(x, L + 2.6); c.lineTo(x + ww * 0.5, L + 2.6); c.lineTo(x, L + 1.6); c.fill();
    }
  }
}

// ---------- 壁 ----------
function wall(c, game, f, L, th, r) {
  const yw = L + FLOOR_BAND;
  c.fillStyle = lg(c, 0, yw, 0, L + FLOOR_H, [[0, th.wall[1]], [1, th.wall[0]]]);
  c.fillRect(0, yw, W, FLOOR_H - FLOOR_BAND);
  const theme = game.stage.theme;
  if (theme === 'office') {
    // 壁紙の細い縦縞と木の腰板（木目）
    c.fillStyle = 'rgba(255,255,255,0.035)'; for (let x = 0; x < W; x += 0.12) c.fillRect(x, yw + 1.0, 0.04, FLOOR_H - 1.3);
    c.fillStyle = lg(c, 0, yw, 0, yw + 0.95, [[0, '#3c2c20'], [1, '#5b4232']]); c.fillRect(0, yw, W, 0.95);
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.012;
    for (let x = 0; x < W; x += 0.8) { c.beginPath(); c.moveTo(x, yw); c.lineTo(x, yw + 0.95); c.stroke(); }
    c.strokeStyle = 'rgba(255,220,180,0.07)'; c.lineWidth = 0.008;
    for (let i = 0; i < 70; i++) { const x = r() * W, y = yw + 0.05 + r() * 0.85; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 0.2, y + 0.02, x + 0.4, y - 0.02, x + 0.6 + r() * 0.4, y); c.stroke(); }
    c.fillStyle = '#c7a77a'; c.fillRect(0, yw + 0.95, W, 0.035); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, yw + 0.93, W, 0.02);
  } else if (theme === 'lab') {
    // 白い化粧パネルの目地と光沢
    c.strokeStyle = 'rgba(20,40,50,0.35)'; c.lineWidth = 0.014;
    for (let x = 0; x < W; x += 1.2) { c.beginPath(); c.moveTo(x, yw); c.lineTo(x, L + FLOOR_H); c.stroke(); }
    for (const y of [yw + 0.9, yw + 1.8]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let x = 0; x < W; x += 1.2) { c.fillStyle = 'rgba(255,255,255,0.07)'; c.beginPath(); c.moveTo(x + 0.1, L + FLOOR_H - 0.3); c.lineTo(x + 0.55, L + FLOOR_H - 0.3); c.lineTo(x + 0.1, yw + 1.1); c.fill(); }
    c.fillStyle = 'rgba(127,224,230,0.55)'; c.fillRect(0, yw + 0.88, W, 0.03);
  } else if (theme === 'security') {
    // コンクリート（しみ）と鋼板の腰壁（リベット）
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; c.beginPath(); c.ellipse(r() * W, yw + 1 + r() * 1.6, 0.2 + r() * 0.6, 0.1 + r() * 0.4, 0, 0, 7); c.fill(); }
    c.fillStyle = lg(c, 0, yw, 0, yw + 1.0, [[0, '#2a2f29'], [1, '#41473f']]); c.fillRect(0, yw, W, 1.0);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0.2; x < W; x += 0.6) for (const y of [yw + 0.08, yw + 0.92]) { c.beginPath(); c.arc(x, y, 0.018, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.012; for (let x = 0; x < W; x += 1.2) { c.beginPath(); c.moveTo(x, yw); c.lineTo(x, yw + 1); c.stroke(); }
    for (let x = 0; x < W; x += 0.3) { c.fillStyle = (Math.round(x / 0.3) % 2) ? '#d9b23a' : '#1c1d1a'; c.beginPath(); c.moveTo(x, yw + 1.0); c.lineTo(x + 0.3, yw + 1.0); c.lineTo(x + 0.18, yw + 1.08); c.lineTo(x - 0.12, yw + 1.08); c.fill(); }
  } else {
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 0.012;
    for (let y = yw; y < L + FLOOR_H; y += 0.3) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let y = yw, row = 0; y < L + FLOOR_H; y += 0.3, row++) for (let x = (row % 2) * 0.3; x < W; x += 0.6) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 0.3); c.stroke(); }
    c.fillStyle = 'rgba(242,194,48,0.45)'; c.fillRect(0, yw + 0.95, W, 0.06);
  }
  // 角の陰り（床際と天井際）
  c.fillStyle = lg(c, 0, yw, 0, yw + 0.4, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, yw, W, 0.4);
  c.fillStyle = lg(c, 0, L + FLOOR_H - 0.6, 0, L + FLOOR_H, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]); c.fillRect(0, L + FLOOR_H - 0.6, W, 0.6);
  // 両端の壁の陰り
  c.fillStyle = lg(c, 0, 0, 0.8, 0, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, L, 0.8, FLOOR_H);
  c.fillStyle = lg(c, W - 0.8, 0, W, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]); c.fillRect(W - 0.8, L, 0.8, FLOOR_H);
}

function busyRanges(game, f) {
  const out = [];
  for (const d of game.byFloor[f].doors) out.push([d.x - 0.95, d.x + 0.95]);
  for (const car of game.cars) if (f >= car.lo - 1 && f <= car.hi) out.push([car.x - CAR_W / 2 - 0.85, car.x + CAR_W / 2 + 0.85]);
  for (const e of game.stage.escalators) { if (e.upper - 1 === f) out.push([Math.min(e.xBot, e.xTop) - 0.6, Math.max(e.xBot, e.xTop) + 0.6]); if (e.upper === f) out.push([e.xTop - 1.2, e.xTop + 1.2]); }
  if (f === game.stage.start.floor) out.push([0, 2.4]);
  if (f === game.stage.exit.floor) out.push([game.stage.exit.x - 1.4, W]);
  return out;
}

// ---------- 家具・機材 ----------
const PROPS = {
  office: [['desk', 1.6, 4], ['cabinet', 0.6, 2], ['plant', 0.6, 2], ['shelf', 1.1, 2], ['cooler', 0.45, 1], ['board', 1.3, 1], ['art', 0.9, 2], ['blinds', 1.5, 2], ['clock', 0.4, 1], ['printer', 0.7, 1]],
  lab: [['rack', 0.75, 4], ['bench', 1.7, 3], ['glass', 1.4, 2], ['screen', 1.2, 2], ['tank', 0.6, 2], ['sign', 0.5, 1], ['plant', 0.5, 1]],
  security: [['locker', 1.3, 3], ['monitors', 1.6, 2], ['equip', 0.8, 2], ['crates', 1.0, 2], ['fence', 1.2, 2], ['cam', 0.4, 1], ['beacon', 0.3, 1], ['sign', 0.5, 1]],
  training: [['target', 0.7, 4], ['mat', 1.4, 1], ['bench', 1.4, 1], ['locker', 1.0, 1], ['board', 1.2, 1]],
};
function props(c, game, f, L, th, r, dyn) {
  const list = PROPS[game.stage.theme] || PROPS.office;
  const busy = busyRanges(game, f);
  const bag = list.flatMap(([k, w, n]) => Array(n).fill([k, w]));
  const yb = L + FLOOR_BAND * 0.6; // 床の帯の奥に置く
  let x = 0.5 + r() * 0.6;
  let guard = 0;
  while (x < W - 0.5 && guard++ < 60) {
    const [kind, w] = bag[Math.floor(r() * bag.length)];
    if (x + w > W - 0.3) break;
    if (busy.some(([a, b]) => x < b && x + w > a)) { x += 0.4; continue; }
    drawProp(c, kind, x, w, yb, L, th, r, dyn, game.stage.theme);
    x += w + 0.25 + r() * 0.9;
  }
  // 壁の階番号（大きなペイント）
  const m = c.getTransform(); const s = m.a;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = 'rgba(255,255,255,0.07)'; c.font = `900 ${Math.round(1.05 * s)}px "Inter","Helvetica Neue",Arial,sans-serif`; c.textBaseline = 'middle';
  c.fillText(String(f).padStart(2, '0'), (0.95 - CX0) * s, (L + FLOOR_H - (L + 2.0)) * s);
  c.restore();
}
function drawProp(c, kind, x, w, yb, L, th, r, dyn, theme) {
  const cx = x + w / 2;
  switch (kind) {
    case 'desk': {
      c.fillStyle = '#2a1d15'; c.fillRect(x + 0.05, yb, 0.06, 0.72); c.fillRect(x + w - 0.11, yb, 0.06, 0.72);
      c.fillStyle = lg(c, 0, yb + 0.7, 0, yb + 0.78, [[0, '#3e2b1f'], [1, '#6b4a34']]); c.fillRect(x, yb + 0.7, w, 0.08);
      c.fillStyle = '#33241a'; c.fillRect(x + w - 0.55, yb + 0.1, 0.45, 0.6);
      c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 3; i++) c.fillRect(x + w - 0.5, yb + 0.18 + i * 0.18, 0.35, 0.02);
      // モニター
      const mx = x + 0.3 + r() * 0.3; c.fillStyle = '#121418'; rr(c, mx, yb + 0.86, 0.55, 0.36, 0.02); c.fill(); c.fillRect(mx + 0.25, yb + 0.78, 0.05, 0.09);
      dyn.monitors.push({ x: mx + 0.03, y: yb + 0.89, w: 0.49, h: 0.3, hue: 200 + r() * 30, seed: r() });
      // 書類と椅子
      c.fillStyle = '#e8e2d4'; c.fillRect(x + w - 0.5, yb + 0.78, 0.25, 0.03); c.fillRect(x + w - 0.46, yb + 0.81, 0.22, 0.02);
      c.fillStyle = '#1b1d22'; c.fillRect(x + 0.35, yb + 0.42, 0.42, 0.06); c.fillRect(x + 0.37, yb + 0.48, 0.06, 0.45); c.fillRect(x + 0.5, yb, 0.04, 0.42);
      break;
    }
    case 'cabinet': {
      c.fillStyle = lg(c, x, 0, x + w, 0, [[0, '#5a616b'], [1, '#7c848f']]); c.fillRect(x, yb, w, 1.3);
      for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 0.04, yb + 0.05 + i * 0.31, w - 0.08, 0.28); c.fillStyle = '#c8d1dc'; c.fillRect(cx - 0.08, yb + 0.22 + i * 0.31, 0.16, 0.03); }
      break;
    }
    case 'plant': {
      c.fillStyle = lg(c, x + 0.1, 0, x + w - 0.1, 0, [[0, '#3a2c25'], [1, '#5a463c']]); c.beginPath(); c.moveTo(x + 0.12, yb + 0.5); c.lineTo(x + w - 0.12, yb + 0.5); c.lineTo(x + w - 0.18, yb); c.lineTo(x + 0.18, yb); c.fill();
      for (let i = 0; i < 11; i++) { const a = (i / 10 - 0.5) * 2.2; c.fillStyle = i % 2 ? '#2f5a3a' : '#3d7048'; c.save(); c.translate(cx, yb + 0.5); c.rotate(-a * 0.6); c.beginPath(); c.ellipse(0, 0.38, 0.07, 0.4, 0, 0, 7); c.fill(); c.restore(); }
      break;
    }
    case 'shelf': {
      c.fillStyle = '#3a2a1e'; c.fillRect(x, yb, w, 1.9); c.fillStyle = '#24190f';
      for (let i = 0; i < 4; i++) {
        const y = yb + 0.08 + i * 0.46; c.fillRect(x + 0.04, y, w - 0.08, 0.42);
        let bx = x + 0.07; while (bx < x + w - 0.12) { const bw = 0.04 + r() * 0.05, bh = 0.25 + r() * 0.13; c.fillStyle = `hsl(${r() * 360},${25 + r() * 25}%,${25 + r() * 20}%)`; c.fillRect(bx, y + 0.02, bw, bh); bx += bw + 0.01; } c.fillStyle = '#24190f';
      }
      break;
    }
    case 'cooler': {
      c.fillStyle = '#d9dde3'; c.fillRect(x + 0.05, yb, w - 0.1, 0.95); c.fillStyle = 'rgba(120,190,255,0.75)'; rr(c, x + 0.08, yb + 0.95, w - 0.16, 0.42, 0.06); c.fill();
      c.fillStyle = '#3a6fa8'; c.fillRect(cx - 0.05, yb + 0.6, 0.1, 0.06);
      break;
    }
    case 'board': {
      c.fillStyle = '#c8ccd2'; c.fillRect(x - 0.03, yb + 1.0, w + 0.06, 0.95); c.fillStyle = '#f2f4f7'; c.fillRect(x, yb + 1.03, w, 0.89);
      c.strokeStyle = theme === 'training' ? '#d33' : '#2f5fb3'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(x + 0.1, yb + 1.2); for (let i = 1; i < 8; i++) c.lineTo(x + 0.1 + i * (w - 0.2) / 7, yb + 1.2 + r() * 0.55); c.stroke();
      c.strokeStyle = '#555'; c.lineWidth = 0.012; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + 0.1, yb + 1.78 - i * 0.07); c.lineTo(x + 0.4 + r() * (w - 0.6), yb + 1.78 - i * 0.07); c.stroke(); }
      break;
    }
    case 'art': {
      c.fillStyle = '#16120e'; c.fillRect(x, yb + 1.15, w, 0.7);
      const g = lg(c, x, yb + 1.2, x + w, yb + 1.8, [[0, `hsl(${20 + r() * 30},45%,40%)`], [1, `hsl(${190 + r() * 40},35%,35%)`]]); c.fillStyle = g; c.fillRect(x + 0.05, yb + 1.2, w - 0.1, 0.6);
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(x + w * 0.7, yb + 1.62, 0.07, 0, 7); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.moveTo(x + 0.05, yb + 1.2); c.lineTo(x + w * 0.45, yb + 1.5); c.lineTo(x + w - 0.05, yb + 1.2); c.fill();
      break;
    }
    case 'blinds': {
      c.fillStyle = '#1b2230'; c.fillRect(x, yb + 0.85, w, 1.25);
      c.fillStyle = 'rgba(255,215,150,0.35)'; c.fillRect(x + 0.04, yb + 0.89, w - 0.08, 1.17);
      c.fillStyle = 'rgba(40,30,20,0.85)'; for (let y = yb + 0.9; y < yb + 2.05; y += 0.07) c.fillRect(x + 0.04, y, w - 0.08, 0.04);
      c.fillStyle = '#c7a77a'; c.fillRect(x - 0.03, yb + 0.83, w + 0.06, 0.04);
      break;
    }
    case 'clock': {
      c.fillStyle = '#e8e2d4'; c.beginPath(); c.arc(cx, yb + 1.9, 0.17, 0, 7); c.fill(); c.strokeStyle = '#2a2420'; c.lineWidth = 0.03; c.stroke();
      dyn.clocks.push({ x: cx, y: yb + 1.9, r: 0.17 });
      break;
    }
    case 'printer': {
      c.fillStyle = '#3a3f47'; c.fillRect(x, yb, w, 0.7); c.fillStyle = '#d6dae0'; c.fillRect(x + 0.03, yb + 0.7, w - 0.06, 0.3); c.fillStyle = '#f5f5f0'; c.fillRect(x + 0.12, yb + 1.0, w - 0.24, 0.04);
      dyn.leds.push({ x: x + w - 0.1, y: yb + 0.88, col: '#36f08a', rate: 0.6, seed: r() });
      break;
    }
    case 'rack': {
      c.fillStyle = lg(c, x, 0, x + w, 0, [[0, '#14181e'], [1, '#262c35']]); c.fillRect(x, yb, w, 2.15);
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.01;
      for (let y = yb + 0.08; y < yb + 2.1; y += 0.13) { c.strokeRect(x + 0.05, y, w - 0.1, 0.11); for (let k = 0; k < 4; k++) dyn.leds.push({ x: x + 0.1 + k * 0.05, y: y + 0.055, col: ['#36f08a', '#46c8e0', '#ffb347'][Math.floor(r() * 3)], rate: 0.5 + r() * 6, seed: r() }); }
      break;
    }
    case 'bench': {
      c.fillStyle = theme === 'training' ? '#4a3a2a' : '#c9d3d9'; c.fillRect(x, yb + 0.85, w, 0.06); c.fillStyle = theme === 'training' ? '#2a2018' : '#8796a0';
      c.fillRect(x + 0.06, yb, 0.06, 0.85); c.fillRect(x + w - 0.12, yb, 0.06, 0.85);
      if (theme !== 'training') {
        for (let i = 0; i < 4; i++) {
          const bx = x + 0.2 + i * (w - 0.4) / 4; const col = ['#7fe0e6', '#b07fff', '#7fff9f', '#ffd36b'][i % 4];
          c.fillStyle = 'rgba(220,240,255,0.35)'; c.beginPath(); c.moveTo(bx, yb + 1.12); c.lineTo(bx + 0.06, yb + 1.12); c.lineTo(bx + 0.12, yb + 0.92); c.lineTo(bx - 0.06, yb + 0.92); c.fill();
          c.fillStyle = col; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(bx - 0.04, yb + 0.96); c.lineTo(bx + 0.1, yb + 0.96); c.lineTo(bx + 0.12, yb + 0.92); c.lineTo(bx - 0.06, yb + 0.92); c.fill(); c.globalAlpha = 1;
          dyn.leds.push({ x: bx + 0.03, y: yb + 0.95, col, rate: 0.3, seed: r(), glow: 0.25 });
        }
      }
      break;
    }
    case 'glass': {
      c.fillStyle = 'rgba(200,230,240,0.16)'; c.fillRect(x, yb, w, 2.3); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x, yb + 1.0, w, 0.3);
      c.strokeStyle = 'rgba(200,220,230,0.5)'; c.lineWidth = 0.025; c.strokeRect(x, yb, w, 2.3);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(x + 0.1, yb + 2.2); c.lineTo(x + 0.45, yb + 2.2); c.lineTo(x + 0.1, yb + 1.5); c.fill();
      break;
    }
    case 'screen': {
      c.fillStyle = '#0d1116'; rr(c, x, yb + 1.15, w, 0.75, 0.03); c.fill();
      dyn.screens.push({ x: x + 0.04, y: yb + 1.19, w: w - 0.08, h: 0.67, kind: theme === 'security' ? 'cctv' : 'wave', seed: r() });
      break;
    }
    case 'monitors': {
      c.fillStyle = '#1b1e23'; c.fillRect(x, yb, w, 0.8); c.fillStyle = '#0d1116'; c.fillRect(x, yb + 0.85, w, 1.15);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) dyn.screens.push({ x: x + 0.05 + j * (w - 0.1) / 3, y: yb + 0.9 + i * 0.55, w: (w - 0.1) / 3 - 0.04, h: 0.5, kind: 'cctv', seed: r() });
      break;
    }
    case 'tank': {
      c.fillStyle = 'rgba(180,220,240,0.25)'; rr(c, x + 0.05, yb, w - 0.1, 1.7, 0.2); c.fill();
      c.fillStyle = 'rgba(80,220,200,0.45)'; rr(c, x + 0.08, yb + 0.03, w - 0.16, 1.1, 0.16); c.fill();
      c.fillStyle = '#5e6b74'; c.fillRect(x + 0.02, yb + 1.65, w - 0.04, 0.1); c.fillRect(x + 0.02, yb, w - 0.04, 0.08);
      dyn.leds.push({ x: cx, y: yb + 0.6, col: '#5fffe0', rate: 0.2, seed: r(), glow: 0.6, bubbles: true, w: w - 0.2, h: 1.0 });
      break;
    }
    case 'sign': {
      c.fillStyle = theme === 'security' ? '#d9b23a' : '#f2c230'; c.beginPath(); c.moveTo(cx, yb + 1.95); c.lineTo(cx + 0.24, yb + 1.55); c.lineTo(cx - 0.24, yb + 1.55); c.fill();
      c.fillStyle = '#111'; c.fillRect(cx - 0.015, yb + 1.65, 0.03, 0.17); c.fillRect(cx - 0.015, yb + 1.6, 0.03, 0.03);
      break;
    }
    case 'locker': {
      const n = Math.max(2, Math.round(w / 0.42)); const lw = w / n;
      for (let i = 0; i < n; i++) {
        c.fillStyle = lg(c, x + i * lw, 0, x + (i + 1) * lw, 0, [[0, '#45505a'], [1, '#5c6873']]); c.fillRect(x + i * lw + 0.01, yb, lw - 0.02, 1.9);
        c.fillStyle = 'rgba(0,0,0,0.4)'; for (let k = 0; k < 5; k++) c.fillRect(x + i * lw + 0.08, yb + 1.6 + k * 0.04, lw - 0.16, 0.015);
        c.fillStyle = '#c8d1dc'; c.fillRect(x + (i + 1) * lw - 0.09, yb + 0.95, 0.03, 0.12);
      }
      break;
    }
    case 'equip': {
      c.fillStyle = '#20252b'; c.fillRect(x, yb, w, 1.6);
      for (let i = 0; i < 5; i++) { c.fillStyle = '#2f363e'; c.fillRect(x + 0.05, yb + 0.1 + i * 0.3, w - 0.1, 0.24); dyn.leds.push({ x: x + w - 0.12, y: yb + 0.22 + i * 0.3, col: r() < 0.5 ? '#ff5040' : '#36f08a', rate: 1 + r() * 3, seed: r() }); }
      break;
    }
    case 'crates': {
      for (const [bx, by, bw, bh] of [[x, yb, w * 0.55, 0.6], [x + w * 0.5, yb, w * 0.5, 0.75], [x + w * 0.15, yb + 0.6, w * 0.45, 0.5]]) {
        c.fillStyle = '#6a5233'; c.fillRect(bx, by, bw, bh); c.strokeStyle = '#3d2d1a'; c.lineWidth = 0.03; c.strokeRect(bx + 0.02, by + 0.02, bw - 0.04, bh - 0.04);
        c.beginPath(); c.moveTo(bx + 0.03, by + 0.03); c.lineTo(bx + bw - 0.03, by + bh - 0.03); c.stroke();
      }
      break;
    }
    case 'fence': {
      c.strokeStyle = 'rgba(160,170,160,0.45)'; c.lineWidth = 0.012;
      for (let i = -10; i < 20; i++) { c.beginPath(); c.moveTo(x + i * 0.12, yb); c.lineTo(x + i * 0.12 + 2.1, yb + 2.1); c.stroke(); c.beginPath(); c.moveTo(x + i * 0.12 + 2.1, yb); c.lineTo(x + i * 0.12, yb + 2.1); c.stroke(); }
      c.clearRect && 0;
      c.fillStyle = '#3a3f37'; c.fillRect(x - 0.03, yb, 0.05, 2.15); c.fillRect(x + w - 0.02, yb, 0.05, 2.15); c.fillRect(x, yb + 2.1, w, 0.05);
      break;
    }
    case 'cam': { dyn.cams.push({ x: cx, y: L + FLOOR_H - 0.25, seed: r() }); break; }
    case 'beacon': { dyn.beacons.push({ x: cx, y: L + FLOOR_H - 0.22, seed: r() }); break; }
    case 'target': {
      c.fillStyle = '#3a3226'; c.fillRect(cx - 0.02, yb, 0.04, 0.9);
      c.fillStyle = '#e8e0cc'; c.beginPath(); c.ellipse(cx, yb + 1.55, 0.13, 0.15, 0, 0, 7); c.fill(); c.fillRect(cx - 0.24, yb + 0.9, 0.48, 0.55);
      c.strokeStyle = '#c33'; c.lineWidth = 0.02; for (const rr2 of [0.08, 0.16]) { c.beginPath(); c.arc(cx, yb + 1.2, rr2, 0, 7); c.stroke(); }
      c.fillStyle = '#222'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(cx + (r() - 0.5) * 0.3, yb + 1.0 + r() * 0.6, 0.015, 0, 7); c.fill(); }
      break;
    }
    case 'mat': { c.fillStyle = '#2f4a6a'; c.fillRect(x, yb - 0.02, w, 0.1); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, yb + 0.06, w, 0.02); break; }
    default: break;
  }
}

// ---------- 天井 ----------
function ceiling(c, game, f, L, th, r) {
  const yt = L + FLOOR_H;
  c.fillStyle = th.ceil; c.fillRect(0, yt - 0.22, W, 0.22);
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, yt - 0.22, W, 0.015);
  for (let x = 1.0; x < W; x += 3.2) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, yt - 0.34, 0.25, 0.12); } // 梁
  for (let x = 2.4; x < W; x += 4.4) { c.fillStyle = '#9aa3ad'; c.fillRect(x, yt - 0.26, 0.04, 0.05); c.beginPath(); c.arc(x + 0.02, yt - 0.27, 0.035, 0, 7); c.fill(); } // スプリンクラー
  for (let x = 3.6; x < W; x += 7.1) { c.fillStyle = '#2a2f36'; c.fillRect(x, yt - 0.21, 0.7, 0.14); c.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 5; i++) c.fillRect(x + 0.05 + i * 0.13, yt - 0.2, 0.07, 0.12); } // 換気口
  if (game.stage.theme === 'lab') { c.fillStyle = '#56656e'; c.fillRect(0, yt - 0.42, W, 0.06); c.fillStyle = '#c4a24a'; c.fillRect(0, yt - 0.5, W, 0.04); for (let x = 0.5; x < W; x += 2.0) { c.fillStyle = '#3a454c'; c.fillRect(x, yt - 0.52, 0.08, 0.3); } } // 配管
}

// ---------- 床の奥行きの帯・スラブ ----------
function floorBand(c, game, f, L, th) {
  const theme = game.stage.theme;
  c.fillStyle = lg(c, 0, L, 0, L + FLOOR_BAND, [[0, th.band[1]], [1, th.band[0]]]); c.fillRect(0, L, W, FLOOR_BAND);
  if (theme === 'office') { c.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < W; x += 0.5) for (let y = L; y < L + FLOOR_BAND; y += 0.07) if ((Math.round(x / 0.5) + Math.round((y - L) / 0.07)) % 2) c.fillRect(x, y, 0.5, 0.035); }
  else if (theme === 'lab') { c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 0.008; for (let x = 0; x < W; x += 0.6) { c.beginPath(); c.moveTo(x, L); c.lineTo(x + 0.18, L + FLOOR_BAND); c.stroke(); } c.beginPath(); c.moveTo(0, L + FLOOR_BAND * 0.5); c.lineTo(W, L + FLOOR_BAND * 0.5); c.stroke(); }
  else if (theme === 'security') { c.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < W; x += 0.15) for (let y = L + 0.02; y < L + FLOOR_BAND; y += 0.08) c.fillRect(x + ((y * 10) % 2) * 0.07, y, 0.05, 0.015); }
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, L + FLOOR_BAND - 0.03, W, 0.03); // 幅木
}
function slab(c, game, f, L, th) {
  const pits = game.cars.filter((q) => f >= q.lo && f <= q.hi).map((q) => q.x).sort((a, b) => a - b);
  let x = CX0; const segs = [];
  for (const px of pits) { segs.push([x, px - CAR_W / 2]); x = px + CAR_W / 2; }
  segs.push([x, CX1]);
  for (const [a, b] of segs) {
    c.fillStyle = lg(c, 0, L - 0.35, 0, L, [[0, '#0e0f12'], [0.6, '#1c1e23'], [1, '#2d3036']]); c.fillRect(a, L - 0.35, b - a, 0.35);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(a, L - 0.02, b - a, 0.02);
  }
}

// ---------- 夜空と街（画面の座標で描く遠景） ----------
export function makeSkyLayers(w, h) {
  const mk = (ww, hh) => { const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ww, hh) : Object.assign(document.createElement('canvas'), { width: ww, height: hh }); return [cv, cv.getContext('2d')]; };
  const r = makeRng(42);
  const [sky, s] = mk(w, h);
  const g = s.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#03050d'); g.addColorStop(0.45, '#0b1230'); g.addColorStop(0.78, '#2a2150'); g.addColorStop(1, '#4a2a4a');
  s.fillStyle = g; s.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const z = r() * 1.6 + 0.3; s.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.65})`; s.fillRect(r() * w, r() * h * 0.6, z, z); }
  s.fillStyle = 'rgba(255,246,220,0.95)'; s.beginPath(); s.arc(w * 0.8, h * 0.14, h * 0.035, 0, 7); s.fill();
  const halo = s.createRadialGradient(w * 0.8, h * 0.14, h * 0.03, w * 0.8, h * 0.14, h * 0.2); halo.addColorStop(0, 'rgba(255,240,210,0.22)'); halo.addColorStop(1, 'rgba(255,240,210,0)'); s.fillStyle = halo; s.fillRect(0, 0, w, h * 0.5);
  for (let i = 0; i < 7; i++) { const cg = s.createRadialGradient(0, 0, 0, 0, 0, 1); cg.addColorStop(0, 'rgba(90,80,140,0.18)'); cg.addColorStop(1, 'rgba(90,80,140,0)'); s.save(); s.translate(r() * w, h * (0.2 + r() * 0.35)); s.scale(w * (0.15 + r() * 0.2), h * 0.05); s.fillStyle = cg; s.beginPath(); s.arc(0, 0, 1, 0, 7); s.fill(); s.restore(); }
  const layers = [];
  for (const [li, col, win, hMul] of [[0, '#0d1226', 0.22, 0.55], [1, '#0a0e1d', 0.35, 0.7], [2, '#070a15', 0.5, 0.85]]) {
    const lw = Math.round(w * 1.5); const [cv, c] = mk(lw, h);
    let x = 0;
    while (x < lw) {
      const bw = (30 + r() * 80) * (w / 1400) * (1 + li * 0.35); const bh = h * (0.18 + r() * 0.42) * hMul;
      c.fillStyle = col; c.fillRect(x, h - bh, bw, bh);
      if (r() < 0.3) { c.fillRect(x + bw * 0.4, h - bh - bh * 0.15, bw * 0.15, bh * 0.15); c.fillStyle = '#ff3b30'; c.fillRect(x + bw * 0.47, h - bh - bh * 0.16, 2, 2); c.fillStyle = col; }
      const cs = Math.max(2, bw / (10 - li * 2));
      for (let yy = h - bh + cs; yy < h - cs; yy += cs * 1.5) for (let xx = x + cs * 0.5; xx < x + bw - cs; xx += cs * 1.4) if (r() < win) { c.fillStyle = r() < 0.75 ? `rgba(255,${200 + r() * 40},${130 + r() * 50},${0.3 + r() * 0.5})` : `rgba(140,200,255,${0.3 + r() * 0.5})`; c.fillRect(xx, yy, cs * 0.65, cs * 0.75); }
      x += bw + r() * 10;
    }
    layers.push({ cv, depth: [0.06, 0.14, 0.26][li], w: lw });
  }
  return { sky, layers };
}
