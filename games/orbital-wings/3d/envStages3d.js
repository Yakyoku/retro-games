// ORBITAL WINGS 3D — 面ごとの環境の定義（色設計・照明・空・粒子）と立体の遠景（火山・神殿・石像・機械の峡谷・肋骨・細胞・要塞の内壁）
// 遠景は「周期 P で繰り返す 1 枚の形」にまとめ、インスタンス 3 個で横に並べる（1 レイヤー = 描画 1 回）。
// 座標は戦場の箱のローカル（x: 0..P、y: 上が正・箱の中心が 0、z: 奥が負）。実際の奥行きに置くので視差は遠近法から自然に出る。
import * as THREE from 'three';
import { makeRng, hash1 } from '../shared/rng.js';
import { EnvGeo, P as PR, mat4, fbm2, hash2, TAU, HH, D, lerp, clamp01, smooth } from './envKit3d.js';

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
export const PM = 96, PF = 192, PFORE = 64;      // 中景・遠景・前景の周期

const prim24 = () => PR.cyl24();
// ---- 小さな道具 ------------------------------------------------------------------------
const box = (G, x, y, z, sx, sy, sz, col, o, rx = 0, ry = 0, rz = 0) => G.add(PR.box(), mat4(x, y, z, rx, ry, rz, sx, sy, sz), col, o);
// 底面の中心が (x, y, z)、高さ h の円柱（top: 上端の半径の比）
const cyl = (G, x, y, z, r, h, n, col, o = {}, top = 1) => G.add(PR.cyl(n, top, o.open || false), mat4(x, y + h / 2, z, 0, o.ry || 0, 0, r, h, r), col, { flat: n <= 6, ...o });
const cone = (G, x, y, z, r, h, n, col, o = {}) => G.add(PR.cone(n), mat4(x, y + h / 2, z, h < 0 ? Math.PI : 0, o.ry || 0, 0, r, Math.abs(h), r), col, o);
// x 軸に沿う管
const pipeX = (G, x0, x1, y, z, r, col, o = {}, n = 8) => G.add(PR.cyl(n, 1, true), mat4((x0 + x1) / 2, y, z, 0, 0, Math.PI / 2, r, x1 - x0, r), col, { flat: false, ...o });
// 2 点を結ぶ棒
const _up = new THREE.Vector3(0, 1, 0), _bd = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bm = new THREE.Matrix4(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3();
function beam(G, x0, y0, z0, x1, y1, z1, r, col, o = {}, n = 4, top = 1) {
  _bd.set(x1 - x0, y1 - y0, z1 - z0); const len = _bd.length(); _bd.normalize(); _bq.setFromUnitVectors(_up, _bd);
  _bm.compose(_bp.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _bq, _bs.set(r, len, r));
  G.add(PR.cyl(n, top), _bm, col, { flat: n <= 6, ...o });
}
// 光の筋（上が明るく、左右と下へ消える板）
function ray(G, x, yTop, z, w, len, ang, col, phase, k = 1) {
  const c = C(col, k), dx = Math.sin(ang) * len, dy = -Math.cos(ang) * len, hw = w / 2;
  const pos = [], colr = [], gl = [];
  const v = (px, py, b) => { pos.push(px, py, z); colr.push(c.r * b, c.g * b, c.b * b); gl.push(1, phase); };
  // 3 列（黒・色・黒）× 2 段（上・中・下）
  const X = [-hw, 0, hw], B = [[0, 0.55, 0], [0, 1, 0], [0, 0, 0]], T = [0, 0.3, 1];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const q = (ii, jj) => v(x + X[ii] * (1 + T[jj] * 0.8) + dx * T[jj], yTop + dy * T[jj], B[jj][ii]);
    q(i, j); q(i + 1, j); q(i + 1, j + 1); q(i, j); q(i + 1, j + 1); q(i, j + 1);
  }
  G.pos.push(new Float32Array(pos)); G.col.push(new Float32Array(colr)); G.glw.push(new Float32Array(gl)); G.n += pos.length / 3;
}
// 山並み（z から奥へ depth。尾根の高さは繰り返す雑音）
function ridge(G, Pd, z, depth, y0, h, seed, col, colTop, o = {}) {
  const n = o.n || 8, cT = C(colTop), cB = C(col);
  const hf = (x, zz) => {
    const t = (z - zz) / depth, prof = Math.sin(clamp01(t) * Math.PI) ** 0.8;
    let r = fbm2(x / Pd * n, t * 1.5, seed, 4, n, 0);
    if (o.sharp) r = 1 - Math.abs(r * 2 - 1);
    if (o.step) r = Math.round(r * o.step) / o.step;
    return y0 + prof * h * (0.25 + r * 1.1) + (o.extra ? o.extra(x, t) * prof : 0);
  };
  G.sheet(0, Pd, o.nx || 56, z, z - depth, o.nz || 4, hf, (p, nn, out) => { const t = clamp01((p.y - y0) / (h * 1.1)); out.copy(cB).lerp(cT, t * t); return o.glow ? o.glow(p, t) : 0; });
}
// 地面（中景の床）。y0 を中心に起伏
function ground(G, Pd, z0, z1, y0, amp, seed, colFn, o = {}) {
  const n = o.n || 10;
  G.sheet(0, Pd, o.nx || 40, z0, z1, o.nz || 9, (x, z) => y0 + (fbm2(x / Pd * n, z * 0.11, seed, 3, n, 0) - 0.5) * amp * 2 + (o.slope || 0) * (z0 - z), colFn, o);
}
function rocks(G, rng, n, Pd, z0, z1, yf, col, s0, s1, o = {}) {
  for (let i = 0; i < n; i++) {
    const x = rng() * Pd, z = lerp(z0, z1, rng()), s = lerp(s0, s1, rng() * rng());
    G.add(o.spire ? PR.cone(5) : PR.ico(0), mat4(x, yf(x, z) + s * (o.spire ? 0.9 : 0.25), z, rng() * 0.3, rng() * TAU, rng() * 0.3, s * (o.spire ? 0.5 : 1), s * (o.spire ? 2.2 + rng() * 2 : 0.7), s * (o.spire ? 0.5 : 1)), col, { jitter: 0.25, seed: i });
  }
}

// ---- 前景（画面の上下の縁を流れる暗い影。y<0 の物は下の縁、y>0 の物は上の縁に付く） ---------------
function foreBuild(G, kind, rng) {
  const Pd = PFORE, dark = (k) => C(kind.col, k);
  for (let side = -1; side <= 1; side += 2) {
    if (side > 0 && kind.top === false) continue;
    G.phaseAll = side;
    const n = kind.n || 16;
    for (let i = 0; i < n; i++) {
      const x = (i + rng() * 0.8) * Pd / n, z = 4.7 + rng() * 2.2, s = 0.7 + rng() * 1.5, t = kind.type;
      const y = (yy) => side * yy;
      if (t === 'rock') G.add(PR.ico(0), mat4(x, y(s * 0.8 + 0.1), z, rng(), rng() * 3, rng(), s * 1.5, s * 0.6, s), dark(0.6 + rng() * 0.5), { jitter: 0.3, seed: i });
      else if (t === 'spike') { G.add(PR.ico(0), mat4(x, y(0.75), z, rng(), rng() * 3, 0, s * 1.6, 0.45, s), dark(0.8), { jitter: 0.3, seed: i }); if (side > 0 || rng() < 0.4) G.add(PR.cone(5), mat4(x + 0.4, y(0.25 + s * 0.62), z, side > 0 ? Math.PI : 0, 0, 0, 0.35 * s, s * 1.2, 0.35 * s), dark(1), {}); }
      else if (t === 'column') { if (i % 3 === 0) cyl(G, x, side < 0 ? -1.5 * s - 0.1 : 0.1, z, 0.75, 1.5 * s, 10, dark(1), { flat: false }); else box(G, x, y(0.75 + s * 0.3), z, 1.4 * s, 0.5 + s * 0.4, 1.2, dark(0.7 + rng() * 0.4), {}, 0, rng() * 0.6, (rng() - 0.5) * 0.3); }
      else if (t === 'block') box(G, x, y(0.7 + s * 0.4), z, 1.6 * s, 0.5 + s * 0.6, 1.4, dark(0.6 + rng() * 0.5), {}, 0, rng() * 0.5, (rng() - 0.5) * 0.15);
      else if (t === 'pipe') { if (i % 4 === 0) box(G, x, y(1.1), z, 0.5, 2, 0.5, dark(0.9), {}); if (i % 4 === 2) cyl(G, x, side < 0 ? -1.2 : 0.1, z - 0.4, 0.5, 1.1, 8, dark(1.2), { flat: false }); }
      else if (t === 'blob') G.add(PR.sph(8, 6), mat4(x, y(s * 0.7 + 0.1), z, 0, 0, 0, s * 1.7, s * 0.65, s), dark(0.6 + rng() * 0.6), { flat: false });
    }
    if (kind.type === 'pipe') { pipeX(G, -1, Pd + 1, side * 0.55, 5.2, 0.4, dark(1.1)); pipeX(G, -1, Pd + 1, side * 1.35, 6.0, 0.22, dark(0.8)); box(G, Pd / 2, side * 2.1, 5.6, Pd + 2, 0.5, 1.6, dark(0.7), {}); }
    else box(G, Pd / 2, side * 2.9, 5.6, Pd + 2, 4, 2.4, dark(0.45), {});   // 縁の下（上）を埋める土台
  }
}

// ---- 各面の立体遠景 ----------------------------------------------------------------------
// ctx: { mid, far, fore, rays: EnvGeo, add / alpha: EnvSprites, spin: [], rng }
function buildVolcanic(c) {
  const { mid, far, rng } = c, lava = C('#d8401a'), hot = C('#ff9a3a');
  const gy = (x, z) => -9.2 + (fbm2(x / PM * 10, z * 0.11, 3, 3, 10, 0) - 0.5) * 5;
  // 溶岩の川が走る玄武岩の原野
  mid.sheet(0, PM, 48, -D - 9, -78, 12, gy, (p, n, out) => {
    const r = Math.abs(fbm2(p.x / PM * 6, p.z * 0.07, 9, 2, 6, 0) - 0.5);
    if (r < 0.03 && p.y < -8.6) { out.copy(lava).lerp(hot, 1 - r / 0.03); return 1; }
    out.set('#3a2424').multiplyScalar(0.6 + hash2(Math.round(p.x * 3), Math.round(p.z * 3), 1) * 0.6); return r < 0.07 ? 0.25 : 0;
  }, { phase: (p) => p.x * 0.5 + p.z * 0.3 });
  // 火山（火口が光り、溶岩の筋が垂れる）
  const vol = (G, x, z, R, h, y0, seed, plume) => {
    G.add(prim24(), mat4(x, y0 + h / 2, z, 0, seed, 0, R, h, R), (p, n, out) => {
      const t = clamp01((p.y - y0) / h), a = Math.atan2(p.z - z, p.x - x), s = hash2(Math.round(a * 24 / TAU * 2), seed, 3);
      out.set('#2c1616').lerp(C('#5a2a1e'), t * t).multiplyScalar(0.8 + 0.4 * hash2(Math.round(a * 12), Math.round(t * 3), seed));
      return t > 0.96 ? 0.6 : 0;
    }, { jitter: 0.1, seed, phase: (p) => p.y * 0.9 });
    for (let i = 0; i < 5; i++) {      // 溶岩の筋（火口から垂れる細い帯）
      const a = hash2(i, seed, 8) * TAU, f = 0.35 + hash2(i, seed, 9) * 0.5, ca = Math.cos(a), sa = Math.sin(a), rb = lerp(0.17, 1, f) * R * 1.02;
      if (sa < -0.3) continue;
      beam(G, x + ca * R * 0.18, y0 + h, z + sa * R * 0.18, x + ca * rb, y0 + h * (1 - f), z + sa * rb, R * 0.035, (p, n, out) => { const t = clamp01((p.y - y0) / h); out.copy(lava).lerp(hot, t * t * t); return 0.9; }, { phase: (p) => p.y * 0.9 + i }, 4, 2.2);
    }
    G.add(PR.cyl(12), mat4(x, y0 + h - 0.25, z, 0, 0, 0, R * 0.2, 0.5, R * 0.2), '#ffb44a', { glow: 1, phase: seed });
    if (!plume) return;
    for (let k = 0; k < 3; k++) {     // 3 周期ぶん
      const px = x + k * c.period;
      for (let i = 0; i < 7; i++) c.alpha.emit(px, y0 + h, z, -3 - rng() * 2, 7 + rng() * 5 + R * 0.3, (rng() - 0.5) * 2, R * 0.75, 4, 0.07 + rng() * 0.02, 1, i % 2 ? '#3a1a16' : '#6a2c1c', i / 7 + rng() * 0.1, c.period);
      for (let i = 0; i < 10; i++) c.add.emit(px + (rng() - 0.5) * R * 0.2, y0 + h, z, (rng() - 0.5) * 7, 6 + rng() * 9, (rng() - 0.5) * 4, 0.5 + rng() * 0.5, 1, 0.2 + rng() * 0.25, 1.6, '#ffa040', rng(), c.period);
      c.add.emit(px, y0 + h + 0.5, z, 0, 1.5, 0, R * 0.9, 0, 0.5, 0.5, '#ff5a1c', rng(), c.period);
    }
  };
  c.period = PM;
  vol(mid, 20, -24, 9, 12, -10, 1, true); vol(mid, 52, -46, 15, 19, -10.5, 2, true); vol(mid, 80, -17, 5.5, 7, -9.6, 3, true); vol(mid, 66, -66, 12, 13, -11, 4, false);
  rocks(mid, rng, 26, PM, -D - 10, -60, gy, '#3a211c', 1.2, 3.2, { spire: true });
  rocks(mid, rng, 30, PM, -D - 9, -50, gy, '#4a2a22', 0.8, 2.4);
  // 遠い山並みと巨大な火山
  ridge(far, PF, -84, 26, -12, 17, 5, '#2a1012', '#5a2418', { sharp: true, n: 10 });
  ridge(far, PF, -135, 40, -14, 30, 8, '#200c10', '#48201c', { sharp: true, n: 7, nx: 48 });
  c.period = PF;
  vol(far, 70, -150, 46, 44, -14, 7, true); vol(far, 160, -120, 24, 24, -13, 9, false);
  // 低い雲のような煙の帯
  for (let i = 0; i < 26; i++) c.alpha.ambient(rng(), 0.55 + rng() * 0.4, rng() * 0.6, -0.6 - rng(), 0, 0, 14 + rng() * 12, 7, 0.1, 0.5, '#4a1c14', rng() * TAU);
}

function buildRuins(c) {
  const { mid, far, rng, rays } = c, st = '#8a9aa8', glow = '#58d2ff';
  const gy = (x, z) => -9.4 + (fbm2(x / PM * 8, z * 0.1, 4, 3, 8, 0) - 0.5) * 2.4;
  ground(mid, PM, -D - 9, -76, -9.4, 1.2, 4, (p, n, out) => { out.set('#5a6a78').multiplyScalar(0.7 + hash2(Math.round(p.x), Math.round(p.z), 2) * 0.5); }, { n: 8 });
  // 柱（溝は色の縞で、柱頭と台座つき）。broken なら途中で折れる
  const column = (x, z, h, r, broken) => {
    const hh = broken ? h * (0.3 + rng() * 0.4) : h, y0 = gy(x, z) - 0.3;
    box(mid, x, y0 + 0.3, z, r * 3, 0.6, r * 3, st, {});
    mid.add(PR.cyl(12, 0.86), mat4(x, y0 + 0.6 + hh / 2, z, 0, 0, 0, r, hh, r), (p, n, out) => { const a = Math.atan2(p.z - z, p.x - x); out.set(st).multiplyScalar(0.8 + 0.2 * Math.sin(a * 12)); }, { flat: false });
    if (!broken) { box(mid, x, y0 + 0.6 + hh + 0.2, z, r * 2.5, 0.4, r * 2.5, st, {}); box(mid, x, y0 + 0.6 + hh + 0.6, z, r * 3.1, 0.4, r * 3.1, st, {}); }
    else mid.add(PR.ico(0), mat4(x + r * 2, y0 + 0.6, z + 0.5, rng(), rng(), 0, r * 1.2, r * 0.8, r * 1.2), st, { jitter: 0.2 });
    return y0 + 0.6 + hh + 0.8;
  };
  // 列柱＋梁（ところどころ崩れている）
  for (const [z, h, r, sp] of [[-12, 12, 0.9, 8], [-22, 15, 1.2, 12]]) {
    let run = 0, x0 = 0, top = 0;
    for (let x = 2; x < PM; x += sp) {
      const broken = rng() < 0.3;
      const t = column(x, z, h, r, broken);
      if (!broken) { if (!run) x0 = x; run++; top = t; }
      if ((broken || x + sp >= PM) && run > 1) { const x1 = x - (broken ? sp : 0); box(mid, (x0 + x1) / 2, top + 0.6, z, x1 - x0 + r * 3.4, 1.2, r * 3, st, {}); box(mid, (x0 + x1) / 2, top + 1.5, z, x1 - x0 + r * 4, 0.5, r * 3.6, st, {}); for (let gx = x0; gx <= x1; gx += sp / 2) box(mid, gx, top + 0.6, z + r * 1.52, 0.5, 0.5, 0.1, glow, { glow: 1, phase: gx * 0.4 }); }
      if (broken) run = 0;
    }
  }
  // 神殿の正面（階段・柱・破風）
  const temple = (x, z, w, s) => {
    const y0 = gy(x, z) - 0.5;
    for (let k = 0; k < 4; k++) box(mid, x, y0 + (k + 0.5) * 0.9 * s, z - k * s, w + (4 - k) * 2 * s, 0.9 * s, 10 * s, '#7a8896', {});
    const yb = y0 + 3.6 * s;
    for (let i = 0; i <= 5; i++) cyl(mid, x - w / 2 + i * w / 5, yb, z + 1, 0.7 * s, 9 * s, 10, st, { flat: false }, 0.85);
    box(mid, x, yb + 9.6 * s, z, w + 2.4 * s, 1.3 * s, 9 * s, st, {});
    mid.add(PR.cyl(3), mat4(x, yb + 11.6 * s, z + 1, Math.PI / 2, 0, 0, (w + 2.4 * s) * 0.5774, 5 * s, 4.6 * s), '#93a2b0', {});
    box(mid, x, yb + 4 * s, z - 3 * s, w - 2, 8 * s, 0.5, '#1c2a3a', {});
    box(mid, x, yb + 4.2 * s, z - 2.7 * s, 1.6 * s, 6.4 * s, 0.2, glow, { glow: 1, phase: x });     // 奥の光る扉
    for (let i = 0; i < 5; i++) box(mid, x - w / 2 + (i + 0.5) * w / 5, yb + 9.6 * s, z + 4.52 * s, 0.6 * s, 0.6 * s, 0.1, glow, { glow: 1, phase: i * 1.3 });
  };
  temple(30, -40, 18, 1.15); temple(76, -58, 22, 1.4);
  // アーチ（半円の輪を柱に載せる）
  for (const [x, z, R] of [[58, -16, 5], [12, -30, 7], [90, -34, 6]]) {
    const y0 = gy(x, z);
    box(mid, x - R, y0 + R * 0.7, z, 1.6, R * 1.4, 1.8, st, {}); box(mid, x + R, y0 + R * 0.7, z, 1.6, R * 1.4, 1.8, st, {});
    mid.add(PR.torus(Math.PI, 5, 12, 0.16), mat4(x, y0 + R * 1.4, z, 0, 0, 0, R, R, R * 1.1), st, { flat: true });
    box(mid, x, y0 + R * 2.4 + 0.1, z + 0.95, 0.9, 0.9, 0.1, glow, { glow: 1, phase: x });
  }
  // オベリスクと瓦礫
  for (let i = 0; i < 7; i++) { const x = rng() * PM, z = -15 - rng() * 40, h = 6 + rng() * 7, y0 = gy(x, z); cyl(mid, x, y0, z, 0.9, h, 4, st, { ry: 0.78 }, 0.55); cone(mid, x, y0 + h, z, 0.5, 1.2, 4, '#a8b8c4', { ry: 0.78 }); box(mid, x, y0 + h * 0.6, z + 0.75, 0.25, h * 0.5, 0.06, glow, { glow: 0.9, phase: i * 2 }); }
  rocks(mid, rng, 40, PM, -D - 9, -60, gy, '#6a7886', 0.7, 2.2);
  // 遠景: 階段状の塔と山
  ridge(far, PF, -88, 30, -12, 13, 12, '#16283a', '#2c4660', { n: 9 });
  for (let i = 0; i < 9; i++) { const x = (i + rng() * 0.6) * PF / 9, z = -80 - rng() * 50, w = 10 + rng() * 14, n = 3 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) box(far, x, -10 + (k + 0.5) * 5, z, w * (1 - k / (n + 0.6)), 5, w * (1 - k / (n + 0.6)), '#2a4058', {}); box(far, x, -10 + n * 5 + 0.6, z, 1.2, 1.2, 1.2, glow, { glow: 1, phase: i }); }
  ridge(far, PF, -150, 40, -14, 26, 14, '#0e1c2c', '#20384e', { sharp: true, n: 6, nx: 44 });
  // 上から差す青白い光の筋と、立ちのぼる光の粒
  for (let k = 0; k < 9; k++) ray(rays, k * PM / 9 + rng() * 5, 24, -7 - rng() * 22, 2.5 + rng() * 4, 38, 0.38 + rng() * 0.08, '#6ac8ff', rng() * TAU, 0.09 + rng() * 0.07);
  for (let i = 0; i < 130; i++) c.add.ambient(rng(), rng(), rng(), (rng() - 0.5) * 0.3, 0.35 + rng() * 0.5, 0, 0.16 + rng() * 0.22, 0, 0.6 + rng(), 0.9, i % 4 ? '#7ad8ff' : '#e8f6ff', rng() * TAU);
}

function buildColossi(c) {
  const { mid, far, rng, rays } = c, st = '#9a94ac', eye = c.cfg.accent;
  const gy = (x, z) => -9.5 + (fbm2(x / PM * 8, z * 0.1, 6, 3, 8, 0) - 0.5) * 2;
  ground(mid, PM, -D - 9, -80, -9.5, 1, 6, (p, n, out) => { out.set('#6a6478').multiplyScalar(0.7 + hash2(Math.round(p.x), Math.round(p.z), 2) * 0.5); }, { n: 8 });
  // 座した巨像（台座・脚・胴・肩・腕・頭・冠。目が光る）。s が大きさ、ruin で頭が欠ける
  const statue = (G, x, z, s, y0, ruin, ph) => {
    const b = (dx, dy, dz, sx, sy, sz, col = st, o = {}) => box(G, x + dx * s, y0 + dy * s, z + dz * s, sx * s, sy * s, sz * s, col, o);
    b(0, 0.6, 0, 7.4, 1.2, 6.4, '#7a7488'); b(0, 1.5, 0.2, 6.6, 0.6, 5.8);
    for (const sx of [-1.7, 1.7]) { b(sx, 3.3, 2.0, 1.9, 3.0, 1.9); b(sx, 5.2, 0.8, 2.0, 1.4, 4.4); b(sx * 1.5, 7.2, -0.6, 1.3, 4.2, 1.5); b(sx * 1.5, 5.6, 1.2, 1.2, 1.0, 3.2); }
    G.add(PR.cyl(4, 1.25), mat4(x, y0 + 7.6 * s, z - 0.9 * s, 0, Math.PI / 4, 0, 2.7 * s, 5.2 * s, 1.7 * s), st, {}); b(0, 10.3, -0.9, 6.6, 1.3, 2.9); b(0, 8.4, 0.45, 2.2, 2.4, 0.3, '#a59fb8');
    if (ruin) { G.add(PR.ico(0), mat4(x + 4.5 * s, y0 + 1.2 * s, z + 3 * s, 0.4, 0.3, 0.2, 1.6 * s, 1.4 * s, 1.5 * s), st, { jitter: 0.2 }); return; }
    b(0, 11.4, -0.7, 1.6, 1.0, 1.6); b(0, 12.9, -0.6, 2.5, 2.6, 2.5); G.add(PR.cyl(4, 0.55), mat4(x, y0 + 14.9 * s, z - 0.7 * s, 0, Math.PI / 4, 0, 2.6 * s, 1.8 * s, 2.3 * s), '#b4aec8', {});
    for (const sx of [-1.7, 1.7]) G.add(PR.cyl(4, 0.6), mat4(x + sx * s, y0 + 12.4 * s, z - 0.9 * s, Math.PI, Math.PI / 4, 0, 0.75 * s, 3.6 * s, 1.5 * s), '#b4aec8', {});
    b(0, 12.3, 0.75, 0.5, 1.2, 0.3);
    for (const sx of [-0.6, 0.6]) b(sx, 13.25, 0.68, 0.6, 0.16, 0.12, eye, { glow: 1, phase: ph });
    b(0, 8.4, 0.62, 0.9, 0.9, 0.1, eye, { glow: 0.9, phase: ph + 1 });
  };
  for (let i = 0; i < 6; i++) { const x = 8 + i * 16, z = -15 - (i & 1) * 2; statue(mid, x, z, 1.0, gy(x, z) - 0.4, i === 2, i * 1.7); }
  for (let i = 0; i < 3; i++) { const x = 16 + i * 32, z = -40; statue(mid, x, z, 1.9, gy(x, z) - 0.6, false, i * 2.3 + 1); }
  // 参道の石柱と崩れた石
  for (let x = 0; x < PM; x += 8) { const z = -9.5, y0 = gy(x, z); box(mid, x, y0 + 1.6, z, 1.2, 3.2, 1.2, '#7a7488', {}); box(mid, x, y0 + 3.4, z, 1.6, 0.5, 1.6, '#a59fb8', {}); box(mid, x, y0 + 3.9, z, 0.5, 0.5, 0.5, eye, { glow: 0.8, phase: x * 0.3 }); }
  rocks(mid, rng, 36, PM, -D - 9, -70, gy, '#6c6680', 0.8, 2.6);
  // 遠景: 台地と、霞の向こうの巨像
  ridge(far, PF, -85, 30, -12, 12, 21, '#2a2040', '#54406a', { step: 4, n: 8 });
  for (let i = 0; i < 4; i++) statue(far, 24 + i * 48, -112, 4.2, -15, false, i);
  ridge(far, PF, -160, 40, -14, 24, 23, '#1c1630', '#44305a', { step: 5, n: 6, nx: 44 });
  // 夕日の光の筋と流れる雲
  for (let k = 0; k < 7; k++) ray(rays, k * PM / 7 + rng() * 6, 22, -10 - rng() * 30, 3 + rng() * 5, 36, -0.5 - rng() * 0.1, '#ffb070', rng() * TAU, 0.06 + rng() * 0.05);
  for (let i = 0; i < 46; i++) c.alpha.ambient(rng(), 0.62 + rng() * 0.36, rng() * 0.7, -0.9 - rng() * 0.8, 0, 0, 12 + rng() * 14, 7, 0.08, 0.75, i % 3 ? '#4a3868' : '#b87a4a', rng() * TAU);
  for (let i = 0; i < 90; i++) c.add.ambient(rng(), rng(), rng(), -0.8 - rng(), -0.1 + rng() * 0.2, 0, 0.1 + rng() * 0.12, 6, 0.5 + rng(), 0.7, '#ffd8b0', rng() * TAU);
}

function gearGeo(L, teeth, col) {
  const G = new EnvGeo(L), c = C(col);
  G.add(PR.cyl(teeth * 2, 1, false), mat4(0, 0, 0, Math.PI / 2, 0, 0, 0.86, 0.22, 0.86), (p, n, out) => { out.copy(c).multiplyScalar(Math.hypot(p.x, p.y) < 0.6 ? 0.55 : 1); });
  for (let i = 0; i < teeth; i++) { const a = i / teeth * TAU; box(G, Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0, 0.2, 0.17, 0.22, c, {}, 0, 0, a); }
  for (let i = 0; i < 3; i++) box(G, 0, 0, 0.13, 1.5, 0.16, 0.06, C(col, 1.3), {}, 0, 0, i / 3 * Math.PI);
  G.add(PR.cyl(8), mat4(0, 0, 0.1, Math.PI / 2, 0, 0, 0.2, 0.3, 0.2), C(col, 1.5), {});
  return G.build();
}
function fanGeo(L, col) {
  const G = new EnvGeo(L);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; box(G, Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0, 0.9, 0.3, 0.05, col, {}, 0.5, 0, a); }
  G.add(PR.cyl(10), mat4(0, 0, 0, Math.PI / 2, 0, 0, 0.2, 0.2, 0.2), C(col, 1.4), {});
  return G.build();
}

function buildGauntlet(c) {
  const { mid, far, rng, rays } = c, ir = '#54463c', dk = '#283236', lamp = '#ffb02a', hot = '#ff7a1a';
  // 峡谷の奥の壁（板の凹凸）と床
  for (let i = 0; i < 16; i++) for (let j = 0; j < 6; j++) { const dz = rng() * 2.5; box(mid, (i + 0.5) * 6, -15 + (j + 0.5) * 7, -30 - dz / 2, 5.8, 6.8, 2 + dz, C(dk, 0.7 + rng() * 0.6), {}); if (rng() < 0.2) box(mid, (i + 0.5) * 6, -15 + (j + 0.5) * 7, -28.9 + 0, 2.4, 0.4, 0.1, hot, { glow: 1, phase: i + j * 3 }); }
  box(mid, PM / 2, -12.5, -18, PM, 3, 24, '#2c2826', {});
  // 梁（横・縦・筋交い）。警告灯が明滅する
  for (const [y, z, t] of [[-6.5, -9, 0.7], [1.5, -13, 0.9], [9.5, -9.5, 0.7], [15, -16, 1.2]]) { box(mid, PM / 2, y, z, PM, t, t, ir, {}); box(mid, PM / 2, y + t * 0.55, z, PM, 0.12, t * 1.5, C(ir, 1.3), {}); box(mid, PM / 2, y - t * 0.55, z, PM, 0.12, t * 1.5, C(ir, 0.8), {}); }
  for (let x = 4; x < PM; x += 12) {
    box(mid, x, 2, -9.2, 0.9, 28, 0.9, ir, {}); box(mid, x + 6, 4, -14, 1.2, 32, 1.2, C(ir, 0.8), {});
    for (const [y0, y1] of [[-6.5, 1.5], [1.5, 9.5]]) box(mid, x + 3, (y0 + y1) / 2, -11, 0.35, Math.hypot(6, y1 - y0), 0.35, C(ir, 1.1), {}, 0, 0, (x / 12 & 1 ? 1 : -1) * Math.atan2(6, y1 - y0));
    box(mid, x, 9.5, -8.6, 0.5, 0.5, 0.3, lamp, { glow: 1, phase: 60 + x * 0.26 }); box(mid, x, -6.5, -8.6, 0.5, 0.5, 0.3, lamp, { glow: 1, phase: 60 + x * 0.26 + 3 });
  }
  // 配管（太い管に継ぎ目の輪、蒸気）
  for (const [y, z, r] of [[-3.5, -10.5, 0.7], [5.5, -12, 0.5], [-8.6, -8.4, 0.45], [12, -11, 0.9]]) { pipeX(mid, 0, PM, y, z, r, '#5e6a66'); for (let x = 3; x < PM; x += 8) mid.add(PR.cyl(8, 1, true), mat4(x, y, z, 0, 0, Math.PI / 2, r * 1.3, 0.5, r * 1.3), '#8a7a5c', { flat: false }); }
  // 回る歯車（インスタンス）と軸受け
  for (const [x, y, z, r, sp] of [[14, -1, -22, 7, 0.25], [25.2, 3.4, -22, 4.2, -0.4167], [50, 6, -26, 9, 0.16], [62.5, -2, -26, 5, -0.288], [80, 2, -20, 6, 0.3], [88.6, -3.5, -20, 3.4, -0.53], [38, -6, -12, 2.6, 0.7], [70, 10, -13.5, 3, -0.6]]) { c.spin.push({ x, y, z, r, sp }); mid.add(PR.cyl(8), mat4(x, y, z - 1.2, Math.PI / 2, 0, 0, r * 0.28, 2.4, r * 0.28), dk, {}); }
  // 溶けた金属の溜まり（床の光）と火花
  for (let i = 0; i < 6; i++) { const x = 8 + i * 16; box(mid, x, -10.95, -16 - (i & 1) * 6, 7, 0.1, 3, hot, { glow: 1, phase: i * 1.1 }); for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) c.add.emit(x + k * PM, -10.5, -16 - (i & 1) * 6, (rng() - 0.5) * 5, 5 + rng() * 6, (rng() - 0.5) * 3, 0.3, 5, 0.5 + rng() * 0.4, 1.4, '#ffc060', rng()); }
  for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) c.alpha.emit(22 + k * PM + (i % 2) * 40, -3.5, -10.5, 1, 3.5, 0, 2.2, 4, 0.22, 0.6, '#8a8478', i / 5);
  // 遠景: 煙突と塔（窓の灯）
  box(far, PF / 2, -16, -90, PF, 8, 60, '#141a1c', {});
  for (let i = 0; i < 22; i++) {
    const x = (i + rng() * 0.7) * PF / 22, z = -70 - rng() * 70, w = 5 + rng() * 9, h = 14 + rng() * 34;
    box(far, x, -12 + h / 2, z, w, h, w, C('#1c2628', 0.7 + rng() * 0.6), {});
    if (rng() < 0.5) cyl(far, x + w * 0.2, -12 + h, z, 1.2, 8 + rng() * 8, 6, '#20282a', {});
    for (let k = 0; k < 4; k++) box(far, x + (rng() - 0.5) * w * 0.7, -12 + h * (0.2 + rng() * 0.75), z + w / 2 + 0.1, 0.9, 0.5, 0.1, k % 2 ? lamp : '#ffe2a0', { glow: 1, phase: k % 2 ? 60 + i : i });
  }
  for (let k = 0; k < 6; k++) ray(rays, k * PM / 6 + rng() * 6, 22, -9 - rng() * 12, 2 + rng() * 3, 30, 0.2 + rng() * 0.1, '#ffb060', rng() * TAU, 0.07 + rng() * 0.05);
  for (let i = 0; i < 90; i++) c.add.ambient(rng(), rng(), rng(), -0.5 - rng() * 1.5, -0.8 - rng() * 1.2, 0, 0.1 + rng() * 0.1, 5, 1 + rng() * 2, 1.2, i % 3 ? '#ffb050' : '#fff0c0', rng() * TAU);
  for (let i = 0; i < 20; i++) c.alpha.ambient(rng(), rng(), rng() * 0.6, -0.4, 0.2, 0, 8 + rng() * 8, 4, 0.1, 0.35, '#3a3a36', rng() * TAU);
}

// なめらかな曲線に沿う管（血管）。色 fn へ長さ方向の位置を渡す
function tube(G, pts, r, col, o = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, o.seg || pts.length * 5, r, o.rs || 6, false);
  G.add(g, mat4(), col, { flat: false, ...o }); g.dispose();
}

function buildFlesh(c) {
  const { mid, far, rng } = c, bone = '#7a6860', fl = '#5a1a28', glow = c.cfg.accent;
  // 奥の肉壁（うねる面）と血管
  const wz = (x, y) => -29 - fbm2(x / PM * 8, y * 0.09, 5, 3, 8, 0) * 7;
  {
    const nx = 40, ny = 12, pos = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const xa = i * PM / nx, xb = (i + 1) * PM / nx, ya = -22 + j * 46 / ny, yb = -22 + (j + 1) * 46 / ny; for (const [u, v] of [[xa, ya], [xb, ya], [xb, yb], [xa, ya], [xb, yb], [xa, yb]]) pos.push(u, v, wz(u, v)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mid.add(g, mat4(), (p, n, out) => { const t = fbm2(p.x / PM * 16, p.y * 0.3, 8, 2, 16, 0); out.set('#34101c').lerp(C('#6a2434'), t); }); g.dispose();
  }
  for (let i = 0; i < 9; i++) {
    const pts = []; let y = -14 + rng() * 26; const x0 = rng() * PM;
    for (let k = 0; k <= 7; k++) { const x = x0 + k * 7; y += (rng() - 0.5) * 9; pts.push([x, y, wz(((x % PM) + PM) % PM, y) + 1.2 + rng()]); }
    tube(mid, pts, 0.35 + rng() * 0.5, (p, n, out) => { out.set(i % 3 ? '#8a2038' : glow); return i % 3 ? 0.5 : 0.9; }, { phase: (p) => -p.x * 0.45 + i });
  }
  // 肋骨（奥へ回り込む半円）と背骨
  for (let x = 6; x < PM; x += 12) {
    const R = 15 + ((x / 12) & 1) * 1.5;
    mid.add(PR.torus(Math.PI, 5, 14, 0.036), mat4(x, 0, -9.5, 0, Math.PI / 2, Math.PI / 2, R, R, R), (p, n, out) => { out.set(bone).multiplyScalar(0.6 + 0.4 * clamp01(1 - Math.abs(p.y) / 16)); }, { flat: false });
    mid.add(PR.sph(8, 6), mat4(x, 0, -9.5 - R, 0, 0, 0, 1.7, 1.3, 1.2), bone, { flat: false });
  }
  pipeX(mid, 0, PM, 0, -25.0, 0.8, '#6a5850');
  // 垂れる腱と脈打つ瘤
  for (let i = 0; i < 12; i++) { const x = rng() * PM, z = -9 - rng() * 12; cone(mid, x, 15, z, 0.5 + rng() * 0.5, -(6 + rng() * 10), 6, fl, {}); cone(mid, x + 3, -15, z, 0.6 + rng() * 0.6, 5 + rng() * 8, 6, fl, {}); }
  for (let i = 0; i < 10; i++) { const x = rng() * PM, y = -12 + rng() * 24, s = 1.5 + rng() * 2.5; mid.add(PR.sph(10, 8), mat4(x, y, wz(x, y) + s * 0.4, 0, 0, 0, s, s, s * 0.7), (p, n, out) => { out.set('#8a2a40'); return 0.4; }, { flat: false, phase: i * 0.9 }); }
  // 遠景: さらに奥の襞
  ridge(far, PF, -46, 30, -24, 20, 31, '#280814', '#521624', { n: 8 });
  far.sheet(0, PF, 40, -76, -46, 4, (x, z) => 24 - Math.sin(clamp01((-46 - z) / 30) * Math.PI) * 18 * (0.3 + fbm2(x / PF * 8, 0, 33, 3, 8, 0)), '#4a1020', {});
  box(far, PF / 2, 0, -80, PF, 60, 2, '#2a0814', {});
  // 胞子
  for (let i = 0; i < 150; i++) c.add.ambient(rng(), rng(), rng(), -0.3 + rng() * 0.2, 0.15 + rng() * 0.4, 0, 0.3 + rng() * 0.5, 3, 0.4 + rng(), 0.8, i % 3 ? '#ffb070' : '#ffe0b0', rng() * TAU);
  for (let i = 0; i < 16; i++) c.alpha.ambient(rng(), rng(), rng() * 0.5, -0.3, 0.1, 0, 9 + rng() * 9, 4, 0.1, 0.3, '#5a1422', rng() * TAU);
}

function buildCells(c) {
  const { mid, far, rng, rays } = c, glow = c.cfg.accent;
  // 浮かぶ細胞（縁が明るい＝透けて見える膜。核が光り、繊毛が生える）
  const cell = (G, x, y, z, s, i) => {
    const ry = 0.75 + rng() * 0.3, hue = i % 3;
    G.add(PR.ico(2), mat4(x, y, z, rng(), rng(), rng(), s, s * ry, s), (p, n, out) => { const f = 1 - Math.abs(n.z); out.set(hue ? '#145a58' : '#1c4a7a').multiplyScalar(0.3 + 1.1 * f * f); return 0.12 + 0.25 * f * f; }, { flat: false, jitter: 0.1, seed: i, phase: i * 0.7 });
    G.add(PR.sph(8, 6), mat4(x + s * 0.2, y + s * 0.1, z + s * 0.72, 0, 0, 0, s * 0.34, s * 0.3, s * 0.2), glow, { glow: 0.85, phase: i * 1.3, flat: false });
    if (s > 2.4 && G === mid) for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; G.add(PR.cone(4), mat4(x + Math.cos(a) * s * 1.2, y + Math.sin(a) * s * ry * 1.2, z, 0, 0, a - Math.PI / 2, 0.12 * s, s * 0.5, 0.12 * s), '#7adcae', { glow: 0.4, phase: i }); }
  };
  for (let i = 0; i < 26; i++) cell(mid, rng() * PM, -13 + rng() * 26, -9 - rng() * rng() * 46, 1.4 + rng() * rng() * 5.5, i);
  // 細胞をつなぐ糸
  for (let i = 0; i < 7; i++) { const pts = []; let y = -10 + rng() * 20, z = -12 - rng() * 20; const x0 = rng() * PM; for (let k = 0; k <= 5; k++) { y += (rng() - 0.5) * 10; z += (rng() - 0.5) * 6; pts.push([x0 + k * 9, y, Math.min(-8, z)]); } tube(mid, pts, 0.14, (p, n, out) => { out.set('#9affd8'); return 0.6; }, { rs: 4, phase: (p) => p.x * 0.6 + i }); }
  // 上下の膜（遠景へ続く）
  ground(mid, PM, -D - 10, -70, -13.5, 2.4, 8, (p, n, out) => { out.set('#123e3c').multiplyScalar(0.6 + fbm2(p.x / PM * 12, p.z * 0.2, 2, 2, 12, 0)); }, { n: 8, slope: -0.06 });
  mid.sheet(0, PM, 36, -70, -D - 10, 8, (x, z) => 15 - (fbm2(x / PM * 8, z * 0.11, 12, 3, 8, 0) - 0.5) * 5, (p, n, out) => { out.set('#0e3836').multiplyScalar(0.6 + fbm2(p.x / PM * 12, p.z * 0.2, 4, 2, 12, 0)); });
  for (let i = 0; i < 12; i++) cell(far, rng() * PF, -22 + rng() * 44, -70 - rng() * 60, 8 + rng() * 14, i + 40);
  box(far, PF / 2, 0, -150, PF, 120, 2, '#04202a', {});
  for (let k = 0; k < 8; k++) ray(rays, k * PM / 8 + rng() * 6, 24, -8 - rng() * 26, 3 + rng() * 5, 40, 0.25 + rng() * 0.12, '#5ae0d8', rng() * TAU, 0.045 + rng() * 0.04);
  // 泡と微粒子
  for (let i = 0; i < 80; i++) c.add.ambient(rng(), rng(), rng(), (rng() - 0.5) * 0.2, 0.6 + rng() * 0.9, 0, 0.3 + rng() * rng() * 1.3, 2, 0.8 + rng(), 0.55, '#b8ffe8', rng() * TAU);
  for (let i = 0; i < 90; i++) c.add.ambient(rng(), rng(), rng(), -0.2, 0.1, 0, 0.12 + rng() * 0.14, 0, 0.5 + rng(), 0.8, '#7affd0', rng() * TAU);
}

function buildCitadel(c) {
  const { mid, far, rng } = c, ar = '#5a6684', dk = '#232a3c', lit = c.cfg.accent, warm = '#ffd27a';
  const WZ = -17;
  // 内壁（板の凹凸）。ところどころ大きな窓が開いて星空が見える
  for (let i = 0; i < 16; i++) for (let j = 0; j < 7; j++) {
    const x = (i + 0.5) * 6, y = -19 + (j + 0.5) * 6;
    if ((i === 6 || i === 7 || i === 8) && (j === 3 || j === 4)) continue;       // 窓
    const dz = Math.floor(rng() * 4) * 0.5;
    box(mid, x, y, WZ - 1.5 + dz / 2, 5.85, 5.85, 3 + dz, C(dk, 0.8 + rng() * 0.7), {});
    const k = rng();
    if (k < 0.18) { box(mid, x, y, WZ + dz + 0.06, 3.6, 2.2, 0.12, C(ar, 0.6), {}); for (let s = 0; s < 5; s++) box(mid, x - 1.4 + s * 0.7, y, WZ + dz + 0.16, 0.3, 1.8, 0.1, '#10141c', {}); }
    else if (k < 0.3) box(mid, x + 1.6, y + 1.8, WZ + dz + 0.08, 0.9, 0.35, 0.12, k < 0.24 ? lit : warm, { glow: 1, phase: i * 2 + j });
  }
  // 窓枠
  box(mid, 45, -1 + 6.2, WZ + 0.6, 18.6, 0.6, 2.4, ar, {}); box(mid, 45, -1 - 6.2, WZ + 0.6, 18.6, 0.6, 2.4, ar, {}); for (const dx of [-9.2, -3, 3, 9.2]) box(mid, 45 + dx, -1, WZ + 0.6, 0.5, 12, 2.2, ar, {});
  // 配線と走る光（位相が x に比例＝光が流れる）
  for (const [y, r] of [[-8.2, 0.5], [4.6, 0.35], [10.4, 0.6], [-13, 0.4]]) {
    pipeX(mid, 0, PM, y, WZ + 2.4, r, '#6a7696');
    for (let x = 0; x < PM; x += 2) box(mid, x + 0.8, y, WZ + 2.4 + r + 0.03, 1.2, r * 0.5, 0.06, lit, { glow: 1, phase: -x * 0.5 + y });
    for (let x = 3; x < PM; x += 12) box(mid, x, y, WZ + 1.4, 0.7, r * 3.2, 2.4, ar, {});
  }
  // 巨大な換気扇（枠＋回る羽根）
  for (const [x, y, r] of [[18, 3, 5.2], [72, -2.5, 6], [90, 8, 3.2]]) {
    mid.add(PR.torus(TAU, 6, 20, 0.12), mat4(x, y, WZ + 2.6, 0, 0, 0, r * 1.08, r * 1.08, 4), ar, { flat: false });
    mid.add(PR.circle(20), mat4(x, y, WZ + 2.1, 0, 0, 0, r, r, 1), (p, n, out) => { const d = Math.hypot(p.x - x, p.y - y) / r; out.set('#060810').lerp(C(lit, 0.5), clamp01(1 - d) * 0.6); return 0.5; }, { phase: x });
    for (let k = 0; k < 4; k++) box(mid, x, y, WZ + 2.9, r * 2.1, 0.22, 0.22, C(ar, 1.2), {}, 0, 0, k * Math.PI / 4);
    c.spin.push({ x, y, z: WZ + 2.55, r: r * 0.96, sp: 1.6 - r * 0.15 });
  }
  // 砲列の棚（壁の下と上）
  for (const [y, s] of [[-11.6, 1], [13.4, -1]]) {
    box(mid, PM / 2, y - s * 0.4, WZ + 4.2, PM, 0.8, 5, ar, {});
    for (let x = 5; x < PM; x += 9) {
      box(mid, x, y + s * 0.9, WZ + 4.6, 2.6, 1.8, 2.6, '#4a5672', {}); box(mid, x, y + s * 2.0, WZ + 4.6, 1.8, 0.6, 1.8, ar, {});
      for (const dz of [-0.45, 0.45]) mid.add(PR.cyl(6), mat4(x - 1.9, y + s * 1.2, WZ + 4.6 + dz, 0, 0, Math.PI / 2 - 0.2 * s, 0.2, 3.2, 0.2), '#8a98b8', { flat: false });
      box(mid, x + 0.9, y + s * 1.2, WZ + 5.95, 0.4, 0.4, 0.1, x % 2 ? '#ff5a3a' : lit, { glow: 1, phase: 60 + x });
    }
  }
  // 床と天井の奥（要塞の中）
  box(mid, PM / 2, -14.5, -9 - D, PM, 1, 18, '#1c2232', {}); box(mid, PM / 2, 17.5, -9 - D, PM, 1, 18, '#161b28', {});
  // 遠景: 窓の向こうの塔・アンテナ・艦隊の灯
  for (let i = 0; i < 20; i++) {
    const x = (i + rng() * 0.7) * PF / 20, z = -60 - rng() * 80, w = 4 + rng() * 8, h = 20 + rng() * 40;
    box(far, x, -24 + h / 2, z, w, h, w, C('#101830', 0.7 + rng() * 0.7), {});
    box(far, x, -24 + h + 3, z, 0.4, 6, 0.4, '#2a3454', {});
    box(far, x, -24 + h + 6.2, z, 0.7, 0.7, 0.7, '#ff5a3a', { glow: 1, phase: 60 + i * 1.7 });
    for (let k = 0; k < 5; k++) box(far, x + (rng() - 0.5) * w * 0.6, -24 + h * (0.3 + rng() * 0.65), z + w / 2 + 0.1, 0.8, 0.4, 0.1, k % 2 ? lit : warm, { glow: 1, phase: k + i });
  }
  for (let i = 0; i < 110; i++) c.add.ambient(rng(), rng(), rng(), -1.2 - rng() * 1.5, (rng() - 0.5) * 0.2, 0, 0.09 + rng() * 0.1, 6, 0.4 + rng(), 0.8, i % 4 ? '#9ad0ff' : '#ffffff', rng() * TAU);
}

// ---- 面ごとの設定 -------------------------------------------------------------------------
// tex: 地形の材質 / terr: 奥の起伏（rise・amp は z = −D から奥へ 1.2, 3, 6, 10, 16u の 5 段）/ light: 照明 / sky: 空 / bodies: 天体
const Z5 = [1.2, 3, 6, 10, 16];
const STAGES = {
  1: {
    name: 'volcanic', accent: '#ff6a1c', frame: '#ffb07a',
    tex: { kind: 'rock', seed: 11, emis: '#ff5a14', pal: ['#6a3526', '#c0683a', '#1c0c0a'] }, mat: { shininess: 18, specular: 0x33221a, normalScale: 1.3 },
    terr: { rise: [0.5, 1.4, 2.4, 2.6, 0.5], amp: [0.5, 1.2, 2.0, 2.4, 1.5], freq: 0.22, baseY: -9.2, cRise: [0.6, 2.2, 5, 9.5, 16], cAmp: [0.5, 1.2, 1.8, 2, 2], emis: [0.75, 0.35, 1.7, 0.35], edge: '#ff9a3c', edgeK: 0.55, cap: '#140606', prop: 'spike' },
    light: { hemi: ['#ffc8a0', '#4a1408'], key: ['#ffd8b0', 2.1, -7, 13, 12], rim: ['#ff5a1e', 1.5, 5, -9, -4], pt: ['#ff7a2a', 60, -6.5, 1.5], bake: { dir: V(-0.5, 0.75, 0.45), key: C('#ffb890', 0.9), sky: C('#5a3040', 0.8), ground: C('#c8401e', 0.4) } },
    fog: { col: '#2c1016', near: 8, far: 150, max: 0.92 }, heat: 0.07, blink: [1.6, 0.55],
    sky: { seed: 3, stops: [[0, '#05030c'], [0.28, '#0e0512'], [0.44, '#260a16'], [0.5, '#4a1412'], [0.56, '#2c1016'], [1, '#160810']], blooms: [[430, 262, 300, '#ff5a1e', 0.28], [820, 250, 240, '#ff8a3a', 0.14]], neb: [{ x: 300, y: 130, w: 700, slope: -0.12, spread: 150, r: 110, count: 60, a: 0.12, cols: ['#a02a1a', '#6a1a3a', '#ff7a3a'] }], haze: ['#2c1016', 240, 300, 0.6] },
    bodies: [{ type: 'planet', yaw: -15, pitch: 10.5, size: 15, base: '#3a1612', blots: ['#1c0a0a', '#5a2418'], craters: 24, lava: '#ff6a2a', atmo: '#ff5a2a', light: [0.5, 0.55] }, { type: 'planet', yaw: 21, pitch: 13, size: 4.5, base: '#b8a090', craters: 30, blots: ['#8a7466'], light: [-0.6, 0.5] }],
    stars: 0.8, fore: { type: 'spike', col: '#120606', n: 15 }, build: buildVolcanic,
    amb: (c, rng) => { for (let i = 0; i < 170; i++) c.add.ambient(rng(), rng(), rng(), -0.6 + rng() * 0.5, 0.9 + rng() * 1.6, 0, 0.14 + rng() * 0.2, 1, 1 + rng() * 2, 1.3, i % 3 ? '#ff9a40' : '#ffd080', rng() * TAU); },
    boss: { tint: [0.74, 0.62, 0.72], sky: [0.7, 0.5, 0.7] },
  },
  2: {
    name: 'ruins', accent: '#58d2ff', frame: '#a8e0ff',
    tex: { kind: 'masonry', seed: 22, emis: '#58d2ff', pal: ['#7c7660', '#c9c09a', '#2a2a26'] }, mat: { shininess: 14, specular: 0x202428, normalScale: 1.2 },
    terr: { rise: [0.4, 1.0, 2.0, 2.0, 0.4], amp: [0.2, 0.5, 1.0, 1.2, 1], freq: 0.16, quant: 1.0, baseY: -9.4, cRise: [0.5, 2, 5, 9.5, 16], cAmp: [0.3, 0.8, 1.2, 1.5, 1.5], emis: [0.7, 0.4, 1.3, 0.25], edge: '#e8dcae', edgeK: 0.32, cap: '#0c1016', prop: 'ruin' },
    light: { hemi: ['#a8d0ff', '#10283a'], key: ['#e4f0ff', 2.0, -8, 14, 10], rim: ['#3ab0ff', 1.3, 6, 4, -10], pt: ['#58d2ff', 26, 2, -3], bake: { dir: V(-0.55, 0.7, 0.45), key: C('#cfe6ff', 0.95), sky: C('#3a6088', 0.8), ground: C('#12384a', 0.6) } },
    fog: { col: '#0e2c44', near: 7, far: 120, max: 0.95 }, blink: [1.2, 0.6],
    sky: { seed: 8, stops: [[0, '#01040c'], [0.3, '#041226'], [0.46, '#0a2a46'], [0.52, '#124060'], [0.6, '#0c2a44'], [1, '#04101c']], blooms: [[600, 250, 320, '#2a8ac8', 0.3]], neb: [{ x: 250, y: 120, w: 800, slope: 0.1, spread: 160, r: 120, count: 60, a: 0.11, cols: ['#1a6a9a', '#2ab0a8', '#4a5ac8'] }], haze: ['#124060', 236, 300, 0.55] },
    bodies: [{ type: 'planet', yaw: 17, pitch: 11, size: 17, base: '#b8c8d8', bands: ['#8aa0c0', '#e0e8f0', '#6a88a8'], ring: { col: '#cfe4ff', tilt: -0.4, k: 0.26 }, atmo: '#8ad0ff', light: [-0.55, 0.45] }, { type: 'planet', yaw: -20, pitch: 12, size: 5, base: '#7a9ab0', craters: 26, light: [0.5, 0.5] }],
    stars: 0.6, fore: { type: 'column', col: '#06101a', n: 14 }, build: buildRuins,
    boss: { tint: [0.66, 0.7, 0.86], sky: [0.6, 0.6, 0.9] },
  },
  3: {
    name: 'colossi', accent: '#ffc46a', frame: '#d8ccff',       // 発光は琥珀色（面の基調色のピンクは敵弾と紛れるので環境では使わない）
    tex: { kind: 'carved', seed: 33, emis: '#ffb44a', pal: ['#66627a', '#b4aec8', '#201c2c'] }, mat: { shininess: 20, specular: 0x2a2630, normalScale: 1.2 },
    terr: { rise: [0.5, 1.0, 2.0, 2.4, 0.4], amp: [0.3, 0.6, 1.0, 1.2, 1], freq: 0.14, quant: 0.8, baseY: -9.5, cRise: [0.5, 2, 5, 9.5, 16], cAmp: [0.3, 0.8, 1.2, 1.5, 1.5], emis: [0.7, 0.4, 1.1, 0.2], edge: '#e2d8ff', edgeK: 0.32, cap: '#0e0b16', prop: 'block' },
    light: { hemi: ['#c8b8ff', '#3a1c30'], key: ['#ffd2b0', 2.0, 9, 9, 10], rim: ['#ff8a5a', 1.6, -8, 3, -10], pt: ['#ffb060', 22, 0, -3], bake: { dir: V(-0.45, 0.5, 0.74), key: C('#ffc8a0', 0.8), sky: C('#5a4a88', 0.7), ground: C('#3a2440', 0.7), rim: C('#ff9a4a', 0.9), rimDir: V(0.85, 0.3, -0.2) } },
    fog: { col: '#33264a', near: 8, far: 150, max: 0.93 }, blink: [1.0, 0.5],
    sky: { seed: 5, stops: [[0, '#06041a'], [0.26, '#140e36'], [0.4, '#2c1e56'], [0.47, '#5a3a5a'], [0.505, '#d8843a'], [0.54, '#5a3848'], [0.62, '#33264a'], [1, '#120e1e']], blooms: [[410, 250, 300, '#ff9a3a', 0.35], [410, 250, 110, '#ffd08a', 0.35]], neb: [{ x: 80, y: 205, w: 1000, slope: 0.02, spread: 60, r: 80, count: 90, a: 0.16, cols: ['#e09050', '#7a5a9a', '#ffc070'], scale: 3.2, sy: 0.3 }, { x: 200, y: 110, w: 800, slope: -0.08, spread: 120, r: 100, count: 40, a: 0.09, cols: ['#6a3ab0', '#3a2a8a'] }] },
    bodies: [{ type: 'sun', yaw: -9, pitch: 1.6, size: 13, glow: '#ff9a3a', core: '#ffe0a0', bars: '#7a4a5a' }, { type: 'planet', yaw: 18, pitch: 12.5, size: 9, base: '#c8b8d8', craters: 30, blots: ['#9a88b0'], atmo: '#d0b0ff', light: [-0.75, -0.3] }],
    stars: 1.0, fore: { type: 'block', col: '#0c0814', n: 14 }, build: buildColossi,
    boss: { tint: [0.66, 0.6, 0.82], sky: [0.55, 0.5, 0.85] },
  },
  4: {
    name: 'gauntlet', accent: '#ffb02a', frame: '#ffd9a0',
    tex: { kind: 'plates', seed: 44, emis: '#ffa62a', emis2: '#ff5a2a', pal: ['#5a4c40', '#a88a62', '#16110e'] }, mat: { shininess: 46, specular: 0x554838, normalScale: 1.1 },
    terr: { rise: [0.0, 0.0, 1.5, 3.0, 0.3], amp: [0, 0.4, 1.5, 2.5, 1], freq: 0.5, quant: 1.5, cell: 3, baseY: -11, cRise: [0, 0.5, 4, 9.5, 16], cAmp: [0, 0.4, 1.5, 2, 1], emis: [0.6, 0.5, 2.6, 0.5], edge: '#ffcf7a', edgeK: 0.4, cap: '#0c0a08', prop: 'pipe' },
    light: { hemi: ['#ffe2b8', '#1c2426'], key: ['#fff0d8', 2.0, -5, 13, 12], rim: ['#ff8a2a', 1.4, 6, -6, -8], pt: ['#ffa040', 34, -5, -2], bake: { dir: V(-0.4, 0.7, 0.6), key: C('#ffd8a8', 0.8), sky: C('#3a5a60', 0.75), ground: C('#4a3424', 0.5), rim: C('#ff8a2a', 0.45), rimDir: V(0.5, -0.8, 0.3) } },
    fog: { col: '#14262a', near: 10, far: 130, max: 0.9 }, blink: [3.2, 0.5],
    sky: { seed: 9, stops: [[0, '#020407'], [0.34, '#081014'], [0.48, '#1a2a2a'], [0.54, '#34382c'], [0.62, '#1c2a2a'], [1, '#080c0c']], blooms: [[520, 270, 340, '#ff9a3a', 0.2]], neb: [{ x: 200, y: 170, w: 900, slope: 0.05, spread: 120, r: 110, count: 50, a: 0.09, cols: ['#8a5a2a', '#3a5a5a', '#5a4a3a'], sy: 0.45 }], haze: ['#2a3430', 240, 300, 0.5] },
    bodies: [{ type: 'planet', yaw: 19, pitch: 12, size: 24, base: '#a8743a', bands: ['#d8a05a', '#6a4426', '#e8c890', '#8a5a30'], atmo: '#ffb46a', light: [-0.5, 0.5] }],
    stars: 0.5, fore: { type: 'pipe', col: '#0a0806', n: 16 }, build: buildGauntlet, spin: 'gear',
    boss: { tint: [0.68, 0.66, 0.78], sky: [0.6, 0.6, 0.8] },
  },
  5: {
    name: 'flesh', accent: '#ffb05a', frame: '#ffc0c8',         // 発光は橙（赤紫の敵弾と区別する）
    tex: { kind: 'flesh', seed: 55, emis: '#ffb05a', emis2: '#ff5a3a', pal: ['#742838', '#b85a6a', '#220810'] }, mat: { shininess: 60, specular: 0x70404a, normalScale: 1.4 },
    terr: { rise: [0.7, 1.6, 2.4, 2.8, 1], amp: [0.5, 0.9, 1.4, 1.6, 1.2], freq: 0.3, baseY: -11, cRise: [0.8, 2.4, 5, 9.5, 16], cAmp: [0.5, 1, 1.4, 1.6, 1.6], emis: [0.55, 0.55, 0, 0], edge: '#ffb0c0', edgeK: 0.3, cap: '#1c060c', prop: 'polyp' },
    light: { hemi: ['#ffc0c8', '#3a0a18'], key: ['#ffe0d8', 2.0, -6, 12, 13], rim: ['#ff7a4a', 1.4, 6, -7, -6], pt: ['#ff9a5a', 30, -2, -2.5], bake: { dir: V(-0.3, 0.6, 0.75), key: C('#ffc0b0', 0.8), sky: C('#5a2a3a', 0.7), ground: C('#3a0c1c', 0.7) } },
    fog: { col: '#1c0812', near: 4, far: 60, max: 0.92 }, blink: [2.2, 0.75],
    sky: { seed: 2, stops: [[0, '#0a0206'], [0.4, '#16060e'], [0.5, '#1c0812'], [0.6, '#16060e'], [1, '#0a0206']], blooms: [[512, 256, 420, '#6a1428', 0.3], [200, 200, 200, '#8a3030', 0.12]], neb: [{ x: 100, y: 256, w: 1000, slope: 0, spread: 300, r: 90, count: 70, a: 0.1, cols: ['#7a1a2a', '#a8323a', '#4a0c2a'] }] },
    bodies: [], stars: 0.12, fore: { type: 'blob', col: '#16040a', n: 16 }, build: buildFlesh,
    boss: { tint: [0.7, 0.62, 0.74], sky: [0.7, 0.5, 0.7] },
  },
  6: {
    name: 'cells', accent: '#5affc0', frame: '#c8ffe8',
    tex: { kind: 'membrane', seed: 66, emis: '#7affc8', emis2: '#2ad0a0', pal: ['#1e5e44', '#4aa882', '#061a12'] }, mat: { shininess: 70, specular: 0x406a5a, normalScale: 1.3 },
    terr: { rise: [0.8, 1.8, 2.4, 2.2, 0.6], amp: [0.6, 1.2, 1.6, 1.8, 1.4], freq: 0.26, baseY: -12, cRise: [0.8, 2.4, 5, 9.5, 16], cAmp: [0.6, 1.2, 1.6, 1.8, 1.8], emis: [0.4, 0.4, 0, 0], edge: '#c8ffe8', edgeK: 0.3, cap: '#04140e', prop: 'cilia' },
    light: { hemi: ['#b8ffe0', '#06281e'], key: ['#e8fff4', 1.9, -4, 14, 10], rim: ['#3affc0', 1.3, 5, -8, -6], pt: ['#5affc0', 26, 0, -3], bake: { dir: V(-0.3, 0.8, 0.5), key: C('#b8ffe0', 0.8), sky: C('#2a7a66', 0.8), ground: C('#0a3a2c', 0.7) } },
    fog: { col: '#052a30', near: 6, far: 110, max: 0.92 }, blink: [1.7, 0.7], caustic: '#3ad0c8', causticK: 0.4,
    sky: { seed: 4, stops: [[0, '#020a0a'], [0.4, '#041c20'], [0.5, '#052a30'], [0.6, '#041c20'], [1, '#020a0a']], blooms: [[512, 200, 420, '#147a72', 0.3], [800, 300, 240, '#2a5a9a', 0.2]], neb: [{ x: 100, y: 256, w: 1000, slope: 0, spread: 300, r: 90, count: 70, a: 0.1, cols: ['#1a7a5a', '#2a9a8a', '#1a4a6a'] }] },
    bodies: [], stars: 0.08, fore: { type: 'blob', col: '#041610', n: 16 }, build: buildCells,
    boss: { tint: [0.62, 0.7, 0.8], sky: [0.5, 0.6, 0.8] },
  },
  7: {
    name: 'citadel', accent: '#4ab0ff', frame: '#bfe0ff',
    tex: { kind: 'armor', seed: 77, emis: '#4ab0ff', emis2: '#ffd27a', pal: ['#465068', '#93a4c6', '#10141e'] }, mat: { shininess: 70, specular: 0x5a6a88, normalScale: 1.0 },
    terr: { rise: [0.0, 0.8, 0.8, 2.4, 0.4], amp: [0, 0.3, 0.8, 1.6, 1], freq: 0.5, quant: 0.8, cell: 2, baseY: -12, cRise: [0, 1, 4, 9.5, 16], cAmp: [0, 0.3, 1, 1.5, 1], emis: [0.5, 0.6, 3.4, 0.6], edge: '#bfe0ff', edgeK: 0.4, cap: '#080a10', prop: 'tech' },
    light: { hemi: ['#c8e0ff', '#141c30'], key: ['#f0f6ff', 2.0, -6, 12, 13], rim: ['#3a9aff', 1.5, 7, 4, -9], pt: ['#4ab0ff', 30, 0, -3], bake: { dir: V(-0.45, 0.6, 0.65), key: C('#d8e8ff', 0.95), sky: C('#3a4a78', 0.8), ground: C('#141c3a', 0.7) } },
    fog: { col: '#0c1630', near: 12, far: 150, max: 0.9 }, blink: [3.0, 0.8],
    sky: { seed: 6, stops: [[0, '#010206'], [0.36, '#040818'], [0.5, '#0c1630'], [0.62, '#070c1e'], [1, '#02040a']], blooms: [[512, 240, 300, '#2a4aa8', 0.25]], neb: [{ x: 150, y: 190, w: 900, slope: 0.1, spread: 150, r: 110, count: 60, a: 0.11, cols: ['#2a3aa8', '#6a3ac8', '#1a7ab8'] }] },
    bodies: [{ type: 'planet', yaw: 1, pitch: -1.5, size: 20, base: '#2a5a9a', blots: ['#e8f0ff', '#1a3a6a', '#3a8a8a'], atmo: '#6ab8ff', light: [-0.5, 0.5] }, { type: 'sun', yaw: -22, pitch: 12, size: 10, glow: '#8ab8ff', core: '#e8f2ff' }],
    stars: 0.7, fore: { type: 'pipe', col: '#05070c', n: 16 }, build: buildCitadel, spin: 'fan',
    boss: { tint: [0.62, 0.64, 0.82], sky: [0.6, 0.6, 0.9] },
  },
};
export function stageEnv(id) { return STAGES[id] || STAGES[1]; }
export { Z5 };

// 面の立体遠景を作る。戻り値: { mid, far, fore, rays（BufferGeometry か null）, spin: [...], spinGeo, tris }
export function buildScenery(cfg, add, alpha, light) {
  const rng = makeRng(cfg.tex.seed * 7 + 1);
  const c = { cfg, rng, add, alpha, spin: [], mid: new EnvGeo(light), far: new EnvGeo(light), fore: new EnvGeo({ ...light, key: light.key.clone().multiplyScalar(0.25), sky: light.sky.clone().multiplyScalar(0.5), ground: light.ground.clone().multiplyScalar(0.4) }), rays: new EnvGeo(light), period: PM };
  cfg.build(c);
  cfg.amb?.(c, rng);
  foreBuild(c.fore, cfg.fore, rng);
  const out = { spin: c.spin, tris: { mid: c.mid.tris, far: c.far.tris, fore: c.fore.tris, rays: c.rays.tris } };
  out.rays = c.rays.n ? c.rays.build() : null;
  out.mid = c.mid.build(); out.far = c.far.build(); out.fore = c.fore.build();
  if (cfg.spin) out.spinGeo = cfg.spin === 'gear' ? gearGeo(light, 14, '#8a7458') : fanGeo(light, '#6a7898');
  return out;
}
