// ORBITAL WINGS 2D — 粒子と爆発。型付き配列の固定長プール（上限 MAXP）。
// 粒子の絵は事前に小さなキャンバスへ描いておき、毎フレームは drawImage と線分のまとめ描きだけにする。
// 爆発は 6 段（閃光 → 火球 → 衝撃波 → 破片 → 煙 → 残り火）。大きさ（s/m/l/p）と材質（machine/rock/flesh/cell/plasma）で作り分ける。
import { TAU, clamp, rgba, lite, dark, mix, rnd, rgb } from './kit2d.js';

const MAXP = 2600;
const T_SPR = 0, T_SPARK = 1, T_RING = 2;
const R = Math.random;

// ---- 粒子の絵 -----------------------------------------------------------------
const TAB = [];                 // { cv, add }
const IDX = {};                 // 名前 → 先頭の番号
function reg(name, list) { IDX[name] = TAB.length; for (const e of list) TAB.push(e); }
function cvs(n, paint) { const cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d'); c.translate(n / 2, n / 2); c.scale(n / 2, n / 2); paint(c); return cv; }
// もこもこした塊（火球・煙）。inner → outer の色で、いくつかの丸を重ねる
function puff(seed, inner, outer, a, lobes = 7) {
  const r = rnd(seed);
  return cvs(96, (c) => {
    for (let i = 0; i < lobes; i++) {
      const an = r() * TAU, d = i === 0 ? 0 : 0.18 + r() * 0.26, rad = i === 0 ? 0.62 : 0.3 + r() * 0.24, x = Math.cos(an) * d, y = Math.sin(an) * d;
      const g = c.createRadialGradient(x - rad * 0.2, y - rad * 0.2, 0, x, y, rad);
      g.addColorStop(0, rgba(inner, a)); g.addColorStop(0.55, rgba(mix(inner, outer, 0.6), a * 0.7)); g.addColorStop(1, rgba(outer, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
    }
  });
}
function dot(col, hot = 0.8) {
  return cvs(32, (c) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, rgba(lite(col, hot), 1)); g.addColorStop(0.3, rgba(col, 0.8)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(-1, -1, 2, 2); });
}
function shard(seed, col, kind) {
  const r = rnd(seed);
  return cvs(40, (c) => {
    const n = kind === 'rock' ? 6 : 4 + (r() * 2 | 0), pts = [];
    for (let i = 0; i < n; i++) { const an = i / n * TAU + r() * 0.5, rad = kind === 'rock' ? 0.55 + r() * 0.3 : (i % 2 ? 0.35 + r() * 0.3 : 0.7 + r() * 0.25); pts.push([Math.cos(an) * rad, Math.sin(an) * rad * (kind === 'rock' ? 1 : 0.6)]); }
    const path = () => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
    const g = c.createLinearGradient(-0.6, -0.8, 0.5, 0.8); g.addColorStop(0, lite(col, 0.55)); g.addColorStop(0.5, col); g.addColorStop(1, dark(col, 0.65));
    path(); c.fillStyle = g; c.fill(); c.strokeStyle = dark(col, 0.8); c.lineWidth = 0.09; c.lineJoin = 'round'; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(pts[0][0] * 0.8, pts[0][1] * 0.8); c.lineTo(pts[1][0] * 0.8, pts[1][1] * 0.8); c.stroke();
  });
}
function goo(seed, col) {       // 粘液のしずく（艶つき）
  const r = rnd(seed);
  return cvs(40, (c) => {
    const g = c.createRadialGradient(-0.2, -0.25, 0.05, 0, 0, 0.8); g.addColorStop(0, lite(col, 0.6)); g.addColorStop(0.5, col); g.addColorStop(1, dark(col, 0.6));
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 0.8, 0.5 + r() * 0.2, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(-0.25, -0.2, 0.2, 0.09, -0.4, 0, TAU); c.fill();
  });
}
function bubble(col) {          // 細胞の泡（半透明の膜と艶）
  return cvs(64, (c) => {
    const g = c.createRadialGradient(0, 0, 0.3, 0, 0, 0.92); g.addColorStop(0, rgba(col, 0.05)); g.addColorStop(0.8, rgba(col, 0.3)); g.addColorStop(0.95, rgba(lite(col, 0.6), 0.9)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.95, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-0.38, -0.42, 0.2, 0.1, -0.7, 0, TAU); c.fill();
  });
}
function star() {               // 4 方向のきらめき
  return cvs(64, (c) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
    c.fillStyle = '#ffffff';
    for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, -0.07); c.quadraticCurveTo(0.3, 0, 1, 0); c.quadraticCurveTo(0.3, 0, 0, 0.07); c.fill(); }
  });
}
const RAMPS = {
  machine: [['#ffffff', '#fff3b0'], ['#fff0a0', '#ff9a2a'], ['#ffb040', '#e0401a'], ['#d0481a', '#5a1608'], ['#5a4c4c', '#26222c']],
  plasma: [['#ffffff', '#d0f8ff'], ['#d0f8ff', '#5ac8ff'], ['#6ad0ff', '#2a6aff'], ['#3a70e0', '#1a2a80'], ['#4a5270', '#1e2234']],
  flesh: [['#ffffff', '#ffd8e0'], ['#ffd0dc', '#ff7a9a'], ['#ff7a9a', '#d02a5a'], ['#b02a50', '#4a0a20'], ['#6a2a3a', '#2a0e18']],
  cell: [['#ffffff', '#e0fff4'], ['#d8fff0', '#7af0c8'], ['#7af0c8', '#2ab890'], ['#2aa888', '#0a5a4a'], ['#3a7a6a', '#12332c']],
  rock: [['#fff6dc', '#e8d8b0'], ['#e0d0aa', '#b8a884'], ['#b8a884', '#8a7c64'], ['#8a7c64', '#5e5446'], ['#5e5446', '#34302a']],
};
let built = false;
function build() {
  if (built) return; built = true;
  for (const m of Object.keys(RAMPS)) {
    // 2 通りの形 × 5 段。先の 4 段は加算（岩の砂煙は通常合成）
    for (let v = 0; v < 2; v++) reg('fire_' + m + v, RAMPS[m].map(([a, b], i) => ({ cv: puff(11 + v * 7 + i * 3, a, b, i === 4 ? 0.7 : m === 'rock' ? 0.85 : 0.95), add: m !== 'rock' && i < 4 })));
  }
  reg('smoke', [0, 1, 2].map((v) => ({ cv: puff(40 + v, '#57505c', '#211e28', 0.6), add: false })));
  reg('dust', [0, 1].map((v) => ({ cv: puff(50 + v, '#b8a684', '#6a5e48', 0.55), add: false })));
  reg('steam', [0, 1].map((v) => ({ cv: puff(60 + v, '#f4f8ff', '#a8b4c8', 0.5), add: false })));
  reg('mistF', [0, 1].map((v) => ({ cv: puff(70 + v, '#c84a6a', '#4a0e20', 0.5), add: false })));
  reg('mistC', [0, 1].map((v) => ({ cv: puff(80 + v, '#7af0c8', '#1a6a58', 0.4), add: false })));
  reg('hot', [0, 1].map((v) => ({ cv: puff(90 + v, '#ffb060', '#c0300a', 0.5), add: true })));      // 噴煙の赤い照り返し・熱
  reg('heatB', [0, 1].map((v) => ({ cv: puff(95 + v, '#9fe0ff', '#2a5aff', 0.45), add: true })));   // 自機の噴射の熱
  reg('sh_machine', [0, 1, 2, 3].map((v) => ({ cv: shard(100 + v, ['#aab4c8', '#6a7488', '#d8dce8', '#4a5468'][v], 'metal'), add: false, rot: true })));
  reg('sh_rock', [0, 1, 2, 3].map((v) => ({ cv: shard(110 + v, ['#9a8e78', '#6e6454', '#b8ae98', '#54483c'][v], 'rock'), add: false, rot: true })));
  reg('sh_lava', [0, 1, 2, 3].map((v) => ({ cv: shard(120 + v, ['#5a3a30', '#3a2420', '#7a4a38', '#2e1c18'][v], 'rock'), add: false, rot: true })));
  reg('sh_plasma', [0, 1, 2, 3].map((v) => ({ cv: shard(130 + v, ['#e8eef8', '#9aa8c0', '#3f7bff', '#ffffff'][v], 'metal'), add: false, rot: true })));
  reg('sh_flesh', [0, 1, 2, 3].map((v) => ({ cv: goo(140 + v, ['#e83a6a', '#a81a44', '#ff7a9a', '#7a1030'][v]), add: false, rot: true })));
  reg('sh_cell', [0, 1, 2, 3].map((v) => ({ cv: v < 2 ? bubble(['#7af0c8', '#b0ffe0'][v]) : goo(150 + v, ['#3adca0', '#ffb04a'][v - 2]), add: false })));
  reg('ember', ['#ffb040', '#ff7a9a', '#7af0c8', '#7ad0ff', '#ffe890', '#ff5a3a'].map((c) => ({ cv: dot(c), add: true })));
  reg('flash', ['#fff6e0', '#e8f8ff', '#ffe0ea', '#e0fff4', '#ffd080'].map((c) => ({ cv: dot(c, 0.9), add: true })));
  reg('star', [{ cv: star(), add: true }]);      // 大きく描くことがあるので回さない（回転つきの拡大はソフトウェア描画で重い）
  reg('bubble', ['#7af0c8', '#b0ffe0'].map((c) => ({ cv: bubble(c), add: false })));
}
const MAT = { machine: 0, plasma: 1, flesh: 2, cell: 3, rock: 4 };
const EMB = { machine: 0, flesh: 1, cell: 2, plasma: 3, rock: 4 };
const FLA = { machine: 0, plasma: 1, flesh: 2, cell: 3, rock: 4 };
const SPK = ['#ffd870', '#9fd8ff', '#ff9ab8', '#9affd8', '#ffffff', '#ff7a3a'];
const RNG = ['#fff0c0', '#c8f0ff', '#ffc8d8', '#c8ffe8', '#ffffff', '#ff9a50'];
export function matOf(kind, color) {
  if (color === 'flesh' || kind === 'flesh' || kind === 'tentacle' || kind === 'spore' || kind === 'hydra') return 'flesh';
  if (color === 'cell' || kind === 'cell' || kind === 'blob' || kind === 'membrane' || kind === 'nucleus') return 'cell';
  if (kind === 'rock' || kind === 'brick' || kind === 'stonehead' || kind === 'pebble' || kind === 'popper' || kind === 'warden' || kind === 'colossus') return 'rock';
  if (kind === 'player') return 'plasma';
  return 'machine';
}

export class Fx {
  constructor() {
    build();
    const F = () => new Float32Array(MAXP);
    this.n = 0; this.k = 1;       // k: 揺れ・閃光の強さ（設定 fx: full=1, weak=0.4, off=0）
    this.ty = new Uint8Array(MAXP); this.sp = new Uint16Array(MAXP); this.nf = new Uint8Array(MAXP); this.fm = new Uint8Array(MAXP); this.col = new Uint8Array(MAXP);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.g = F(); this.dr = F(); this.life = F(); this.max = F();
    this.s0 = F(); this.s1 = F(); this.rot = F(); this.vr = F(); this.a = F();
    this.shakeA = 0; this.flashA = 0; this.flashC = '#ffffff'; this.sx = 0; this.sy = 0;
  }
  clear() { this.n = 0; this.shakeA = 0; this.flashA = 0; }
  // ty, 絵の先頭番号, 段数, 位置, 速度, 寿命, 大きさ（始・終）, 重力, 抵抗（1 秒で残る速度の割合）, 回転, 回転速度, 濃さ, 消え方（0 直線・1 終盤だけ・2 出て消える）, 遅れ, 色番号
  add(ty, sp, nf, x, y, vx, vy, max, s0, s1, g = 0, dr = 1, rot = 0, vr = 0, a = 1, fm = 0, delay = 0, col = 0) {
    let i = this.n;
    if (i >= MAXP) return;
    this.n++;
    this.ty[i] = ty; this.sp[i] = sp; this.nf[i] = nf; this.fm[i] = fm; this.col[i] = col;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.g[i] = g; this.dr[i] = dr; this.life[i] = -delay; this.max[i] = max;
    this.s0[i] = s0; this.s1[i] = s1; this.rot[i] = rot; this.vr[i] = vr; this.a[i] = a;
  }
  shake(a) { this.shakeA = Math.max(this.shakeA, a * this.k); }
  flash(a, col = '#ffffff') { a *= this.k; if (a > this.flashA) { this.flashA = a; this.flashC = col; } }

  // ---- 爆発（6 段） -----------------------------------------------------------
  explode(x, y, size = 's', mat = 'machine', lava = false) {
    const big = size === 'l', mid = size === 'm' || size === 'p';
    const Rr = { s: 0.62, m: 1.25, l: 2.5, p: 1.1 }[size] || 0.62;
    const nF = { s: 4, m: 7, l: 14, p: 8 }[size] || 4;
    const free = MAXP - this.n, lean = free < 500;          // 混んでいる時は軽くする
    const fire0 = IDX['fire_' + mat + '0'], fire1 = IDX['fire_' + mat + '1'];
    const mi = MAT[mat], cOrg = mat === 'cell' || mat === 'flesh';
    // 1) 閃光
    const fS = big ? 0.75 : 1;          // 大爆発の閃光は面積を抑える
    this.add(T_SPR, IDX.flash + FLA[mat], 1, x, y, 0, 0, big ? 0.16 : 0.11, Rr * 1.7 * fS, Rr * 2.3 * fS, 0, 1, 0, 0, mat === 'rock' ? 0.5 : 0.9, 0, 0);
    if (mat !== 'rock') this.add(T_SPR, IDX.star, 1, x, y, 0, 0, big ? 0.22 : 0.15, Rr * 2.2 * fS, Rr * 0.8, 0, 1, 0, 0, 0.8, 0, 0);
    // 2) 火球（中心の大きな塊＋外へ転がる塊。大は時間差で二次爆発）
    this.add(T_SPR, fire0, 5, x, y, 0, 0, 0.42 + Rr * 0.12, Rr * 0.6, Rr * (big ? 1.15 : 1.4), 0, 1, R() * TAU, (R() - 0.5), 1, 0, 0);
    for (let i = 0; i < nF; i++) {
      const an = R() * TAU, sp = (0.8 + R() * 2.4) * Rr * 1.7, late = big && i > nF * 0.45 ? 0.08 + R() * 0.3 : R() * 0.05;
      const ox = late > 0.07 ? (R() - 0.5) * Rr * 1.2 : 0, oy = late > 0.07 ? (R() - 0.5) * Rr * 1.2 : 0;
      this.add(T_SPR, i & 1 ? fire1 : fire0, 5, x + ox, y + oy, Math.cos(an) * sp, Math.sin(an) * sp + (mat === 'rock' ? 0 : 0.5), 0.45 + R() * 0.4 + Rr * 0.06, Rr * (0.3 + R() * 0.25), Rr * (big ? 0.5 + R() * 0.35 : 0.7 + R() * 0.5), mat === 'rock' ? 1.5 : -0.6, 0.06, R() * TAU, (R() - 0.5) * 2, 1, 0, late);
    }
    // 3) 衝撃波
    this.add(T_RING, 0, 0, x, y, 0, 0, big ? 0.45 : 0.3, Rr * 0.5, Rr * (big ? 2.1 : 1.9), 0, 1, 0, 0, mat === 'rock' ? 0.4 : 0.7, 0, 0.02, mi === 0 ? 0 : mi);
    if (big) this.add(T_RING, 0, 0, x, y, 0, 0, 0.65, Rr * 0.3, Rr * 2.9, 0, 1, 0, 0, 0.3, 0, 0.08, 4);
    if (lean) return;
    // 4) 破片（材質ごとの絵。重力で落ちる）
    const sh = IDX[mat === 'rock' && lava ? 'sh_lava' : 'sh_' + mat];
    const nD = { s: 5, m: 9, l: 20, p: 14 }[size] || 5;
    for (let i = 0; i < nD; i++) {
      const an = R() * TAU, sp = (2.5 + R() * 6.5) * (big ? 1.5 : mid ? 1.15 : 1);
      this.add(T_SPR, sh + (i & 3), 1, x, y, Math.cos(an) * sp, Math.sin(an) * sp + 1.5, 0.6 + R() * 0.7, (0.1 + R() * 0.13) * (big ? 1.5 : 1) * (mat === 'rock' ? 1.3 : 1), 0.06, cOrg ? 5 : 9, 0.35, R() * TAU, (R() - 0.5) * 22, 1, 1, R() * 0.04);
    }
    if (mat === 'cell') for (let i = 0; i < nF; i++) { const an = R() * TAU, sp = 0.6 + R() * 2.4; this.add(T_SPR, IDX.bubble + (i & 1), 1, x, y, Math.cos(an) * sp * Rr, Math.sin(an) * sp * Rr, 0.6 + R() * 0.7, 0.08 + R() * 0.2, 0.2 + R() * 0.3, -1.2, 0.2, 0, 0, 0.9, 1, R() * 0.1); }
    // 5) 煙（遅れて立ちのぼる）
    const sm = mat === 'rock' ? IDX.dust : mat === 'flesh' ? IDX.mistF : mat === 'cell' ? IDX.mistC : IDX.smoke;
    const nS = { s: 2, m: 4, l: 5, p: 4 }[size] || 2, sS = big ? 0.7 : 1;
    for (let i = 0; i < nS; i++) this.add(T_SPR, sm + (i % 2), 1, x + (R() - 0.5) * Rr, y + (R() - 0.5) * Rr, (R() - 0.5) * 1.2 - 0.6, 0.4 + R() * 0.7, 0.8 + R() * 0.7, Rr * (0.4 + R() * 0.25) * sS, Rr * (0.75 + R() * 0.4) * sS, -0.3, 0.4, 0, 0, mat === 'cell' ? 0.5 : 0.8, 2, 0.12 + R() * 0.25);
    // 6) 残り火・飛沫（長く残る小さな光）と火花の筋
    const nE = { s: 5, m: 9, l: 20, p: 16 }[size] || 5;
    for (let i = 0; i < nE; i++) {
      const an = R() * TAU, sp = (1.5 + R() * 5) * (big ? 1.4 : 1);
      this.add(T_SPR, IDX.ember + (lava ? 5 : EMB[mat]), 1, x, y, Math.cos(an) * sp, Math.sin(an) * sp + 1, 0.7 + R() * 1.0, 0.07 + R() * 0.07, 0.02, 3.5, 0.3, 0, 0, 1, 1, R() * 0.1);
    }
    if (mat !== 'rock' || lava) for (let i = 0; i < nE; i++) {
      const an = R() * TAU, sp = (6 + R() * 10) * (big ? 1.4 : 1);
      this.add(T_SPARK, 0, 0, x, y, Math.cos(an) * sp, Math.sin(an) * sp, 0.18 + R() * 0.25, 0.05, 0, 4, 0.08, 0, 0, 1, 0, 0, lava ? 5 : mi === 4 ? 0 : mi);
    }
    if (big) { this.shake(0.5); } else if (size === 'p') { this.shake(0.55); this.flash(0.22, '#bfe8ff'); } else if (mid) this.shake(0.16);
  }
  // 着弾の火花（装甲に弾かれた時は青白く、通った時は金色）
  spark(x, y, armor, big, col) {
    const n = big ? 10 : 5, ci = col ?? (armor ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const an = Math.PI + (R() - 0.5) * (big ? 5 : 2.6), sp = 4 + R() * 9;
      this.add(T_SPARK, 0, 0, x, y, Math.cos(an) * sp, Math.sin(an) * sp, 0.12 + R() * 0.16, 0.045, 0, 6, 0.1, 0, 0, 1, 0, 0, ci);
    }
    this.add(T_SPR, IDX.flash + (armor ? 1 : 4), 1, x, y, 0, 0, 0.09, big ? 0.9 : 0.42, big ? 1.3 : 0.6, 0, 1, 0, 0, 0.9);
    this.add(T_SPR, IDX.star, 1, x, y, 0, 0, 0.1, big ? 1.1 : 0.55, 0.2, 0, 1, R(), 0, 0.9);
    if (big) { this.add(T_RING, 0, 0, x, y, 0, 0, 0.22, 0.2, 1.1, 0, 1, 0, 0, 0.7, 0, 0, 0); for (let i = 0; i < 3; i++) this.add(T_SPR, IDX.fire_machine0 + (i & 1 ? 5 : 0), 5, x, y, (R() - 0.5) * 2, (R() - 0.5) * 2, 0.3 + R() * 0.15, 0.25, 0.5, 0, 0.1, R() * TAU, 0, 1); }
  }
  // 汎用の小物
  smoke(x, y, vx, vy, s, life = 1.2, a = 0.6, kind = 'smoke') { this.add(T_SPR, IDX[kind] + ((R() * 2) | 0), 1, x, y, vx, vy, life, s * 0.5, s * 1.4, -0.2, 0.5, R() * TAU, (R() - 0.5) * 1.5, a, 2); }
  ember(x, y, vx, vy, s, life, ci = 0, g = 3) { this.add(T_SPR, IDX.ember + ci, 1, x, y, vx, vy, life, s, s * 0.2, g, 0.4, 0, 0, 1, 1); }
  spk(x, y, vx, vy, life, ci = 0, g = 6) { this.add(T_SPARK, 0, 0, x, y, vx, vy, life, 0.045, 0, g, 0.15, 0, 0, 1, 0, 0, ci); }
  ring(x, y, r0, r1, life, ci = 4, a = 0.8) { this.add(T_RING, 0, 0, x, y, 0, 0, life, r0, r1, 0, 1, 0, 0, a, 0, 0, ci); }
  glint(x, y, s, life = 0.25, rot = 0) { this.add(T_SPR, IDX.star, 1, x, y, 0, 0, life, s * 0.3, s, 0, 1, rot, 1.5, 1, 2); }
  flashAt(x, y, s, life = 0.1, ci = 0) { this.add(T_SPR, IDX.flash + ci, 1, x, y, 0, 0, life, s, s * 1.3, 0, 1, 0, 0, 1); }
  hot(x, y, vx, vy, s, life, blue) { this.add(T_SPR, (blue ? IDX.heatB : IDX.hot) + ((R() * 2) | 0), 1, x, y, vx, vy, life, s, s * 0.3, 0, 0.5, R() * TAU, 0, 0.6, 0); }
  fire(x, y, vx, vy, s, life, mat = 'machine') { this.add(T_SPR, IDX['fire_' + mat + ((R() * 2) | 0)], 5, x, y, vx, vy, life, s * 0.5, s, -0.5, 0.2, R() * TAU, 0, 1); }
  debris(x, y, vx, vy, s, life, mat = 'machine') { this.add(T_SPR, IDX['sh_' + mat] + ((R() * 4) | 0), 1, x, y, vx, vy, life, s, s * 0.6, 9, 0.5, R() * TAU, (R() - 0.5) * 18, 1, 1); }
  bubbleP(x, y, vx, vy, s, life) { this.add(T_SPR, IDX.bubble + ((R() * 2) | 0), 1, x, y, vx, vy, life, s * 0.5, s, -0.8, 0.4, 0, 0, 0.8, 2); }

  // ---- 更新と描画（ワールド変換のまま呼ぶ） ------------------------------------------
  update(dt) {
    const n = this.n; let j = 0;
    const { ty, sp, nf, fm, col, x, y, vx, vy, g, dr, life, max, s0, s1, rot, vr, a } = this;
    for (let i = 0; i < n; i++) {
      const l = life[i] + dt;
      if (l >= max[i]) continue;
      if (l >= 0) {
        const d = dr[i] === 1 ? 1 : Math.pow(dr[i], dt);
        vy[i] -= g[i] * dt; vx[i] *= d; vy[i] *= d;
        x[i] += vx[i] * dt; y[i] += vy[i] * dt; rot[i] += vr[i] * dt;
      }
      if (j !== i) { ty[j] = ty[i]; sp[j] = sp[i]; nf[j] = nf[i]; fm[j] = fm[i]; col[j] = col[i]; x[j] = x[i]; y[j] = y[i]; vx[j] = vx[i]; vy[j] = vy[i]; g[j] = g[i]; dr[j] = dr[i]; max[j] = max[i]; s0[j] = s0[i]; s1[j] = s1[i]; rot[j] = rot[i]; vr[j] = vr[i]; a[j] = a[i]; }
      life[j] = l; j++;
    }
    this.n = j;
    this.shakeA *= Math.pow(0.004, dt); if (this.shakeA < 0.005) this.shakeA = 0;
    this.flashA *= Math.pow(0.002, dt); if (this.flashA < 0.004) this.flashA = 0;
  }
  // pass 0: 通常合成（煙・破片）、pass 1: 加算（火・火花・輪）
  draw(ctx, pass, x0, x1, S, tx, ty) {
    const n = this.n;
    const { ty: tyA, sp, nf, fm, col, x, y, vx, vy, life, max, s0, s1, rot, a } = this;
    const ty_ = tyA;
    if (pass === 1) ctx.globalCompositeOperation = 'lighter';
    let dirty = true;
    for (let i = 0; i < n; i++) {
      if (ty_[i] !== T_SPR || life[i] < 0) continue;
      const px = x[i]; if (px < x0 || px > x1) continue;
      const k = life[i] / max[i];
      let idx = sp[i];
      if (nf[i] > 1) idx += Math.min(nf[i] - 1, (Math.pow(k, 0.75) * nf[i]) | 0);
      const e = TAB[idx];
      if ((e.add ? 1 : 0) !== pass) continue;
      const m = fm[i];
      let al = a[i] * (nf[i] > 1 ? (idx - sp[i] === nf[i] - 1 ? (1 - k) * 4 : 1) : m === 0 ? 1 - k : m === 1 ? (k > 0.7 ? (1 - k) / 0.3 : 1) : (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85));
      if (al <= 0.03) continue;
      if (al > 1) al = 1;
      const s = (s0[i] + (s1[i] - s0[i]) * (nf[i] > 1 ? Math.sqrt(k) : k)) * S;
      ctx.globalAlpha = al;
      const r = rot[i];
      if (e.rot) { const co = Math.cos(r) * s, si = Math.sin(r) * s; ctx.setTransform(co, -si, -si, -co, S * px + tx, -S * y[i] + ty); ctx.drawImage(e.cv, -1, -1, 2, 2); dirty = true; }
      else { if (dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); dirty = false; } ctx.drawImage(e.cv, S * px + tx - s, -S * y[i] + ty - s, s * 2, s * 2); }      // もこもこの塊は回さない（軸に沿った拡大だけ＝速い）
    }
    ctx.setTransform(S, 0, 0, -S, tx, ty);
    ctx.globalAlpha = 1;
    if (pass === 1) {
      // 火花: 色ごとにまとめて 1 本の経路で描く（外光＋白い芯）
      ctx.lineCap = 'round';
      for (let c = 0; c < SPK.length; c++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (ty_[i] !== T_SPARK || col[i] !== c || life[i] < 0) continue;
          const k = 1 - life[i] / max[i], L = 0.035 * k + 0.008;
          ctx.moveTo(x[i], y[i]); ctx.lineTo(x[i] - vx[i] * L, y[i] - vy[i] * L); any = true;
        }
        if (!any) continue;
        ctx.strokeStyle = SPK[c]; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.1; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.lineWidth = 0.035; ctx.stroke();
      }
      // 衝撃波の輪
      for (let i = 0; i < n; i++) {
        if (ty_[i] !== T_RING || life[i] < 0) continue;
        const k = life[i] / max[i], e = 1 - (1 - k) * (1 - k), r = s0[i] + (s1[i] - s0[i]) * e;
        ctx.globalAlpha = a[i] * (1 - k);
        ctx.strokeStyle = RNG[col[i]]; ctx.lineWidth = 0.03 + 0.2 * (1 - k) * (1 - k) * Math.min(1, s1[i] * 0.35);
        ctx.beginPath(); ctx.arc(x[i], y[i], r, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
}
