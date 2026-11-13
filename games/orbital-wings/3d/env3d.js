// ORBITAL WINGS 3D — 環境（地形・遠景・空・照明・大気）。Render3D に混ぜ込んで使う（this は Render3D）
// render3d.js から呼ばれる入口: chunkMesh / fillChunk / drawTerrain / drawFar と、envInit（1 回）・envSetStage（面ごと）・envUpdate（毎フレーム）。
// 見た目と当たり判定の一致: 地形の上面（床）・下面（天井）は戦場の奥行き（z = −D..+D）の全域で floorAt / ceilAt と同じ高さの平面。
// 起伏（立体の凹凸・突起）は戦場の奥行きの外（|z| > DEPTH）だけに置き、戦場の中は法線マップと模様だけで質感を出す。
// 脈動（5・6 面）は頂点シェーダーが terrain.pulseAt と同じ式で動かす（頂点の作り直しなし）。
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH } from '../shared/config.js';
import { hash1 } from '../shared/rng.js';
import { NONE_FLOOR, NONE_CEIL } from '../shared/terrain.js';
import { makeUniforms, layerMaterial, terrainMaterial, EnvSprites, makeStars, causticMaterial, fbm2, smooth, clamp01 } from './envKit3d.js';
import { bakeTerrain, bakeSky, bakeBodies, spriteAtlas, causticTex } from './envTextures3d.js';
import { stageEnv, buildScenery, Z5, PM, PF, PFORE } from './envStages3d.js';

const TAU = Math.PI * 2, HW = VIEW_W / 2, HH = VIEW_H / 2;
const D = DEPTH + 1.3;              // 地形の奥行き（戦場の外まで）
const lerp = (a, b, t) => a + (b - a) * t;
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector2(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const AXZ = new THREE.Vector3(0, 0, 1);
const CHUNK = 32, STEP = 0.5, NS = CHUNK / STEP;
const TS = 6;                       // 地形のテクスチャ 1 枚が覆う幅（u）
const VMAX = 17000;                 // 塊 1 つの頂点数の上限（床・天井 8448 ＋ 突起）
const BACK = 15, AHEAD = VIEW_W + 15;   // 塊を用意する範囲（奥の起伏は箱より広く見えるため）

// 断面（奥 → 手前）: 0..4 奥の起伏 / 5 奥の付け根 / 6・7 上面 / 8 手前の縁 / 9..11 手前の面
const J = 12;
const PZ = [-D - Z5[4], -D - Z5[3], -D - Z5[2], -D - Z5[1], -D - Z5[0], -D, -D + 1.6, D - 0.3, D, D, D, D];
const GRP = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2];
const SHADE = [0.82, 1.0, 1.0, 0.9, 0.74, 0.46, 0.9, 1.12, 1, 0.4, 0.7, 0.2];   // 環境遮蔽とハイライト（8 は縁の色）
const PY = [new Float32Array((NS + 3) * J), new Float32Array((NS + 3) * J)];
const FN = new Float32Array((NS + 2) * (J - 1) * 3);
const EX = [new Uint8Array(NS + 3), new Uint8Array(NS + 3)];

// ---- 頂点の書き込み（塊・箱で共通。毎回の確保なし） ---------------------------------------------
const W = { P: null, N: null, U: null, C: null, F: null, o: 0, pw: 0, max: 0 };
function vtx(x, y, z, nx, ny, nz, u, v, r, g, b, e) {
  const o = W.o; if (o >= W.max) return;
  W.P[o * 3] = x; W.P[o * 3 + 1] = y; W.P[o * 3 + 2] = z; W.N[o * 3] = nx; W.N[o * 3 + 1] = ny; W.N[o * 3 + 2] = nz;
  W.U[o * 2] = u; W.U[o * 2 + 1] = v; W.C[o * 3] = r; W.C[o * 3 + 1] = g; W.C[o * 3 + 2] = b; W.F[o * 2] = W.pw; W.F[o * 2 + 1] = e; W.o = o + 1;
}
// 軸に沿った箱。c: 明るさ（上）、cb: 明るさ（下）、col: 色（null なら白）、e: 発光。faces: 1=+x 2=−x 4=+y 8=−y 16=+z 32=−z
function wbox(x0, x1, y0, y1, z0, z1, c, cb, col, e = 0, faces = 63) {
  const r = col ? col.r : 1, g = col ? col.g : 1, b = col ? col.b : 1;
  const q = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, ua, va, ub, vb, uc, vc, ud, vd) => {
    const ka = ay > (y0 + y1) / 2 ? c : cb, kb = by > (y0 + y1) / 2 ? c : cb, kc = cy > (y0 + y1) / 2 ? c : cb, kd = dy > (y0 + y1) / 2 ? c : cb;
    vtx(ax, ay, az, nx, ny, nz, ua, va, r * ka, g * ka, b * ka, e); vtx(bx, by, bz, nx, ny, nz, ub, vb, r * kb, g * kb, b * kb, e); vtx(cx, cy, cz, nx, ny, nz, uc, vc, r * kc, g * kc, b * kc, e);
    vtx(ax, ay, az, nx, ny, nz, ua, va, r * ka, g * ka, b * ka, e); vtx(cx, cy, cz, nx, ny, nz, uc, vc, r * kc, g * kc, b * kc, e); vtx(dx, dy, dz, nx, ny, nz, ud, vd, r * kd, g * kd, b * kd, e);
  };
  const T = 1 / TS;
  if (faces & 16) q(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, x0 * T, y0 * T, x1 * T, y0 * T, x1 * T, y1 * T, x0 * T, y1 * T);
  if (faces & 32) q(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, x1 * T, y0 * T, x0 * T, y0 * T, x0 * T, y1 * T, x1 * T, y1 * T);
  if (faces & 1) q(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, z1 * T, y0 * T, z0 * T, y0 * T, z0 * T, y1 * T, z1 * T, y1 * T);
  if (faces & 2) q(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, z0 * T, y0 * T, z1 * T, y0 * T, z1 * T, y1 * T, z0 * T, y1 * T);
  if (faces & 4) q(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, x0 * T, z1 * T, x1 * T, z1 * T, x1 * T, z0 * T, x0 * T, z0 * T);
  if (faces & 8) q(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, x0 * T, z0 * T, x1 * T, z0 * T, x1 * T, z1 * T, x0 * T, z1 * T);
}
// 円錐台（軸は y。h が負なら下向き）。r0: 根元、r1: 先。c0・c1: 明るさ、col: 色、e1: 先の発光
function wfrus(cx, y0, cz, r0, r1, h, n, c0, c1, col, e1 = 0, colTip = null) {
  const r = col ? col.r : 1, g = col ? col.g : 1, b = col ? col.b : 1, tr = colTip ? colTip.r : r, tg = colTip ? colTip.g : g, tb = colTip ? colTip.b : b;
  const sgn = h < 0 ? -1 : 1, sl = (r0 - r1) / Math.abs(h), T = 1 / TS;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, ca = Math.cos(a0), sa = Math.sin(a0), cb = Math.cos(a1), sb = Math.sin(a1);
    const il = 1 / Math.hypot(1, sl), na = [ca * il, sl * il * sgn, sa * il], nb = [cb * il, sl * il * sgn, sb * il];
    const A = [cx + ca * r0, y0, cz + sa * r0], B = [cx + cb * r0, y0, cz + sb * r0], Cc = [cx + cb * r1, y0 + h, cz + sb * r1], Dd = [cx + ca * r1, y0 + h, cz + sa * r1];
    const put = (p, nn, tip) => vtx(p[0], p[1], p[2], nn[0], nn[1], nn[2], (p[0] + p[2]) * T, p[1] * T, (tip ? tr : r) * (tip ? c1 : c0), (tip ? tg : g) * (tip ? c1 : c0), (tip ? tb : b) * (tip ? c1 : c0), tip ? e1 : 0);
    if (sgn > 0) { put(A, na, 0); put(Cc, nb, 1); put(B, nb, 0); put(A, na, 0); put(Dd, na, 1); put(Cc, nb, 1); }
    else { put(A, na, 0); put(B, nb, 0); put(Cc, nb, 1); put(A, na, 0); put(Cc, nb, 1); put(Dd, na, 1); }
  }
}
function newBuffers(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
function bindWriter(g, max) {
  const a = g.attributes;
  W.P = a.position.array; W.N = a.normal.array; W.U = a.uv.array; W.C = a.color.array; W.F = a.aFx.array; W.o = 0; W.pw = 0; W.max = max;
}
function endWriter(g) {
  const a = g.attributes;
  a.position.needsUpdate = a.normal.needsUpdate = a.uv.needsUpdate = a.color.needsUpdate = a.aFx.needsUpdate = true;
  g.setDrawRange(0, W.o);
}

export class Env3D {
  // ==== 地形の塊（32u ごと。ワールド x で作り、メッシュの位置でカメラぶんずらす） ====================
  chunkMesh(k, terrain) {
    let m = this.chunks.get(k);
    if (m) return m;
    const E = this.env;
    m = E.chunkPool.pop();
    if (!m) { m = new THREE.Mesh(newBuffers(VMAX), E.terrainMat); m.frustumCulled = false; }
    m.material = E.terrainMat;
    this.vol.add(m); this.chunks.set(k, m); m.userData.k = k;
    this.fillChunk(m, k * CHUNK, terrain);
    return m;
  }
  // 断面の高さ（side 0: 床、1: 天井）を列ごとに求める
  envProfile(side, terrain, wx, out, o) {
    const t = this.env.cfg.terr, seed = this.stage.id * 7 + side * 3;
    const nxq = t.cell ? (Math.floor(wx / t.cell) + 0.5) * t.cell : wx;
    if (side === 0) {
      const f = terrain.floorBase(wx), y = Math.max(f, -3) - HH;
      for (let r = 0; r < 5; r++) {
        const n = fbm2(nxq * t.freq, Z5[r] * t.freq * 1.3 + 9, seed, 3) - 0.5;
        let yy = y + t.rise[r] + n * 2 * t.amp[r];
        if (t.quant) yy = y + Math.round((yy - y) / t.quant) * t.quant;
        if (r === 3) yy = lerp(yy, Math.max(t.baseY + n * t.amp[r], y - 4), 0.4);
        if (r === 4) yy = t.baseY + n * 2 * t.amp[r];
        out[o + 4 - r] = yy;
      }
      out[o + 5] = out[o + 6] = out[o + 7] = out[o + 8] = y; out[o + 9] = y - 0.5; out[o + 10] = y - 2.2; out[o + 11] = -HH - 3;
      return f;
    }
    const c = terrain.ceilBase(wx), y = Math.min(c, VIEW_H + 3) - HH;
    for (let r = 0; r < 5; r++) {
      const n = fbm2(nxq * t.freq, Z5[r] * t.freq * 1.3 + 4, seed, 3) - 0.5;
      let yy = y + t.cRise[r] + n * 2 * t.cAmp[r];
      if (t.quant) yy = y + Math.round((yy - y) / t.quant) * t.quant;
      out[o + 4 - r] = yy;
    }
    out[o + 5] = out[o + 6] = out[o + 7] = out[o + 8] = y; out[o + 9] = y + 0.5; out[o + 10] = y + 2.2; out[o + 11] = HH + 3;
    return c;
  }
  fillChunk(m, x0, terrain) {
    const E = this.env, g = m.geometry, edge = E.edgeCol;
    bindWriter(g, VMAX);
    for (let side = 0; side < 2; side++) {
      const py = PY[side], ex = EX[side], sg = side ? -1 : 1;
      for (let ci = 0; ci < NS + 3; ci++) {
        const h = this.envProfile(side, terrain, x0 + (ci - 1) * STEP, py, ci * J);
        ex[ci] = side ? (h > VIEW_H + 1 ? 0 : h >= NONE_CEIL - 0.01 ? 1 : 2) : (h < -1 ? 0 : h <= NONE_FLOOR + 0.01 ? 1 : 2);   // 0 なし / 1 あるが脈動しない / 2 あり
      }
      // 面の法線（列の間 fi = −1..NS、断面の区間 j）
      for (let fi = 0; fi < NS + 2; fi++) for (let j = 0; j < J - 1; j++) {
        const a = fi * J + j, by = py[a + 1] - py[a], bz = PZ[j + 1] - PZ[j], dy = py[a + J] - py[a];
        let nx = -bz * dy * sg, ny = bz * STEP * sg, nz = -by * STEP * sg;
        const l = Math.hypot(nx, ny, nz) || 1, o = (fi * (J - 1) + j) * 3;
        FN[o] = nx / l; FN[o + 1] = ny / l; FN[o + 2] = nz / l;
      }
      const put = (ci, pj, fj, wx) => {   // 列 ci（0..NS+2 の添字）・断面の点 pj・属する区間 fj
        let nx = 0, ny = 0, nz = 0;
        for (let a = ci - 1; a <= ci; a++) for (let b = pj - 1; b <= pj; b++) {
          if (a < 0 || a > NS + 1 || b < 0 || b > J - 2 || GRP[b] !== GRP[fj]) continue;
          const o = (a * (J - 1) + b) * 3; nx += FN[o]; ny += FN[o + 1]; nz += FN[o + 2];
        }
        const l = Math.hypot(nx, ny, nz) || 1, y = py[ci * J + pj], yTop = py[ci * J + 8];
        const v = pj <= 8 ? (D - PZ[pj]) / TS : -Math.abs(yTop - y) / TS;
        const e = pj === 8 ? 1 : 0, k = SHADE[pj];
        W.pw = ex[ci] === 2 ? sg : 0;
        if (e) vtx(wx, y, PZ[pj], nx / l, ny / l, nz / l, wx / TS, v, edge.r, edge.g, edge.b, fj >= 8 ? 0.6 : 1);
        else vtx(wx, y, PZ[pj], nx / l, ny / l, nz / l, wx / TS, v, k, k, k, 0);
      };
      for (let i = 0; i < NS; i++) {
        if (!ex[i + 1] && !ex[i + 2]) continue;
        const xa = x0 + i * STEP, xb = xa + STEP, a = i + 1, b = i + 2;
        for (let j = 0; j < J - 1; j++) {
          if (side === 0) { put(a, j, j, xa); put(a, j + 1, j, xa); put(b, j + 1, j, xb); put(a, j, j, xa); put(b, j + 1, j, xb); put(b, j, j, xb); }
          else { put(a, j + 1, j, xa); put(a, j, j, xa); put(b, j, j, xb); put(a, j + 1, j, xa); put(b, j, j, xb); put(b, j + 1, j, xb); }
        }
      }
      // 縁に沿う突起（x から決まる。戦場の奥行きの外にだけ置く）
      for (let i = 0; i < NS; i++) {
        if (!ex[i + 1] || !ex[i + 2]) continue;
        W.pw = ex[i + 1] === 2 ? sg : 0;
        this.envProps(side, x0 + i * STEP, py[(i + 1) * J + 5], sg);
      }
    }
    endWriter(g);
  }
  // 突起・鍾乳石・配管・リベットなど（side: 0 床 / 1 天井。y は面の高さ、sg は床 +1・天井 −1）
  envProps(side, wx, y, sg) {
    const E = this.env, kind = E.cfg.terr.prop, xi = Math.round(wx * 2), sd = this.stage.id * 13 + side * 5;
    const h = hash1(xi, sd), h2 = hash1(xi, sd + 1), h3 = hash1(xi, sd + 2), acc = E.accCol, zb = -DEPTH - 0.45 - h2 * 0.7, zf = DEPTH + 0.45 + h3 * 0.6;
    const y0 = y - sg * 0.12;
    if (kind === 'spike') {
      if (h < 0.2) wfrus(wx, y0, zb, 0.16 + h2 * 0.26, 0.02, sg * (0.5 + h3 * (side ? 2.2 : 1.4)), 5, 0.75, 1.15, null);
      else if (h < 0.235) wfrus(wx, y0, zb, 0.2, 0.05, sg * (0.5 + h3 * 0.6), 4, 0.5, 1, acc, 0.9);
      if (h3 > 0.86) wfrus(wx, y0, zf, 0.14, 0.02, sg * (0.2 + h2 * 0.18), 4, 0.8, 1.1, null);
    } else if (kind === 'ruin') {
      if (h < 0.1) { const hh = 0.5 + h3 * 1.3; wfrus(wx, y0, zb, 0.3, 0.26, sg * hh, 7, 0.8, 1.1, null); wbox(wx - 0.36, wx + 0.36, y0 + sg * hh - 0.07, y0 + sg * hh + 0.07, zb - 0.36, zb + 0.36, 1.15, 0.9, null); }
      else if (h < 0.2) wbox(wx - 0.3 - h3 * 0.3, wx + 0.3, Math.min(y0, y0 + sg * (0.3 + h2 * 0.4)), Math.max(y0, y0 + sg * (0.3 + h2 * 0.4)), zb - 0.3, zb + 0.3, 1.05, 0.7, null);
      else if (h < 0.225) wbox(wx - 0.14, wx + 0.14, Math.min(y0, y0 + sg * 0.7), Math.max(y0, y0 + sg * 0.7), zb - 0.14, zb + 0.14, 1, 1, acc, 0.9);
      if (h3 > 0.9) wbox(wx - 0.2, wx + 0.2, Math.min(y0, y0 + sg * 0.22), Math.max(y0, y0 + sg * 0.22), zf - 0.2, zf + 0.2, 1.1, 0.8, null);
    } else if (kind === 'block') {
      if (h < 0.13) { const s = 0.3 + h3 * 0.35, hh = 0.4 + h2 * 0.8; wbox(wx - s, wx + s, Math.min(y0, y0 + sg * hh), Math.max(y0, y0 + sg * hh), zb - s, zb + s, 1.1, 0.7, null); wbox(wx - s * 0.6, wx + s * 0.6, Math.min(y0 + sg * hh, y0 + sg * (hh + 0.3)), Math.max(y0 + sg * hh, y0 + sg * (hh + 0.3)), zb - s * 0.6, zb + s * 0.6, 1.2, 0.9, null); }
      else if (h < 0.16) wfrus(wx, y0, zb, 0.22, 0.1, sg * (1 + h3), 4, 0.7, 1.1, null, 0.8, acc);
      if (h3 > 0.9) wbox(wx - 0.22, wx + 0.22, Math.min(y0, y0 + sg * 0.2), Math.max(y0, y0 + sg * 0.2), zf - 0.2, zf + 0.2, 1.1, 0.8, null);
    } else if (kind === 'pipe' || kind === 'tech') {
      const tech = kind === 'tech', ya = Math.min(y + sg * 0.1, y + sg * 0.42), yb = Math.max(y + sg * 0.1, y + sg * 0.42);
      wbox(wx - 0.02, wx + STEP + 0.02, ya, yb, -3.55, -3.2, 1.25, 0.7, null, 0, tech ? 60 : 62);                // 連なる配管（奥）
      if (xi % 4 === 0) wbox(wx - 0.09, wx + 0.09, Math.min(y0, y + sg * 0.5), Math.max(y0, y + sg * 0.5), -3.62, -3.13, 1.4, 1.0, null);   // 継ぎ手
      if (xi % 2 === 0) wbox(wx - 0.07, wx + 0.07, Math.min(y0, y + sg * 0.07), Math.max(y0, y + sg * 0.07), D - 0.24, D - 0.1, 1.5, 1.2, null);  // リベット
      if (xi % 16 === 0) { const hh = tech ? 1.3 : 0.9; wbox(wx - 0.08, wx + 0.08, Math.min(y0, y + sg * hh), Math.max(y0, y + sg * hh), -3.0, -2.84, 1.2, 0.8, null); wbox(wx - 0.13, wx + 0.13, Math.min(y + sg * hh, y + sg * (hh + 0.2)), Math.max(y + sg * hh, y + sg * (hh + 0.2)), -3.05, -2.79, 1, 1, acc, 1); }
      if (tech && xi % 4 === 2) wbox(wx - 0.2, wx + 0.2, Math.min(y0, y + sg * 0.16), Math.max(y0, y + sg * 0.16), DEPTH + 0.35, D - 0.3, 1.2, 0.9, null);
      if (!tech && h < 0.07) wbox(wx - 0.3, wx + 0.3, Math.min(y0, y + sg * (0.5 + h3 * 0.5)), Math.max(y0, y + sg * (0.5 + h3 * 0.5)), zb - 0.4, zb + 0.1, 1.1, 0.75, null);
    } else if (kind === 'polyp') {
      if (h < 0.17) { const hh = 0.35 + h3 * 0.9; wfrus(wx, y0, zb, 0.2 + h2 * 0.16, 0.11, sg * hh, 6, 0.75, 1.2, null); if (h < 0.07) wfrus(wx, y0 + sg * hh, zb, 0.15, 0.02, sg * 0.2, 6, 1, 1, acc, 1, acc); }
      if (h3 > 0.88) wfrus(wx, y0, zf, 0.18, 0.08, sg * 0.2, 5, 0.9, 1.2, null);
    } else if (kind === 'cilia') {
      if (h < 0.3) { wfrus(wx, y0, zb, 0.07, 0.015, sg * (0.6 + h3 * 1.1), 4, 0.8, 1.3, null, h < 0.1 ? 0.9 : 0, h < 0.1 ? acc : null); wfrus(wx + 0.2, y0, zb + 0.25, 0.06, 0.015, sg * (0.4 + h2 * 0.8), 4, 0.8, 1.3, null); }
      if (h3 > 0.9) wfrus(wx, y0, zf, 0.2, 0.1, sg * 0.16, 6, 0.9, 1.2, null);
    }
  }

  // ==== 壊れない箱（柱・金属塊・細胞塊）: 当たり判定の箱そのものに、戦場の外（手前の面・両端）へ装飾を足す ====
  envBlock(b) {
    const E = this.env, acc = E.accCol, n = 2600, g = newBuffers(n);
    bindWriter(g, n);
    const x0 = b.x0, x1 = b.x1, y0 = b.y0 - HH, y1 = b.y1 - HH, z0 = b.z0 !== undefined ? -b.z1 : -D, z1 = b.z0 !== undefined ? -b.z0 : D, full = b.z0 === undefined;
    wbox(x0, x1, y0, y1, z0, z1, 1.05, 0.72, null);
    const zf = z1, free0 = b.y0 > 0.05, free1 = b.y1 < VIEW_H - 0.05;
    if (b.kind === 'pillar') {
      for (const [on, ya, dir] of [[free1 || !free0, y1, -1], [free0 || !free1, y0, 1]]) {   // 柱頭・台座
        if (!on) continue;
        wbox(x0 - 0.12, x1 + 0.12, Math.min(ya, ya + dir * 0.32), Math.max(ya, ya + dir * 0.32), z0, zf + 0.22, 1.25, 1.0, null);
        wbox(x0 - 0.06, x1 + 0.06, Math.min(ya + dir * 0.32, ya + dir * 0.56), Math.max(ya + dir * 0.32, ya + dir * 0.56), z0, zf + 0.12, 1.1, 0.9, null);
        wbox(x0 + 0.3, x1 - 0.3, Math.min(ya + dir * 0.72, ya + dir * 0.86), Math.max(ya + dir * 0.72, ya + dir * 0.86), zf, zf + 0.05, 1, 1, acc, 0.9, 16);
      }
      const w = (x1 - x0) / 9;
      if (y1 - y0 > 2.4) for (let i = 0; i < 4; i++) wbox(x0 + w * (1 + i * 2), x0 + w * (2 + i * 2), y0 + 0.95, y1 - 0.95, zf, zf + 0.09, 1.15, 0.85, null, 0, 19);   // 溝
    } else if (b.kind === 'metal') {
      const t = 0.16;
      wbox(x0, x1, y1 - t, y1, zf, zf + 0.1, 1.3, 1.3, null); wbox(x0, x1, y0, y0 + t, zf, zf + 0.1, 0.9, 0.9, null); wbox(x0, x0 + t, y0, y1, zf, zf + 0.1, 1.2, 0.8, null); wbox(x1 - t, x1, y0, y1, zf, zf + 0.1, 1.2, 0.8, null);
      for (const bx of [x0 + 0.34, x1 - 0.34]) for (let by = y0 + 0.34; by < y1 - 0.2; by += 1.1) wbox(bx - 0.09, bx + 0.09, by - 0.09, by + 0.09, zf, zf + 0.16, 1.5, 1.2, null);
      const cx = (x0 + x1) / 2;
      wbox(cx - 0.5, cx + 0.5, y0 + 0.5, y1 - 0.5, zf, zf + 0.06, 0.6, 0.5, null, 0, 16);
      wbox(cx - 0.1, cx + 0.1, y0 + 0.7, y1 - 0.7, zf + 0.06, zf + 0.1, 1, 1, acc, 1, 19);
      for (const ya of [y0, y1]) wbox(x0 - 0.05, x1 + 0.05, ya - 0.1, ya + 0.1, z0, zf + 0.14, 1.3, 1.0, null);
    } else if (b.kind === 'cellmass') {
      for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.4) {
        const h = hash1(Math.round(x * 10), 5), h2 = hash1(Math.round(x * 10), 6);
        if (full) { wfrus(x + h, y1 - 0.05, DEPTH + 0.5 + h2 * 0.6, 0.4, 0.14, 0.3 + h * 0.3, 6, 0.8, 1.2, null, h > 0.6 ? 0.8 : 0, h > 0.6 ? acc : null); wfrus(x + h2, y0 + 0.05, -DEPTH - 0.5 - h * 0.6, 0.4, 0.14, -(0.3 + h2 * 0.3), 6, 0.8, 1.2, null); }
      }
    }
    endWriter(g);
    const m = new THREE.Mesh(g, E.terrainMat); m.frustumCulled = false; m.userData.b = b;
    return m;
  }

  drawTerrain(g) {
    const t = g.terrain, cam = this.cam, E = this.env;
    const k0 = Math.floor((cam - BACK) / CHUNK), k1 = Math.floor((cam + AHEAD) / CHUNK);
    for (let k = k0; k <= k1; k++) { const m = this.chunkMesh(k, t); m.position.set(-cam - HW, 0, 0); m.visible = true; }
    for (const [k, m] of this.chunks) if (k < k0 || k > k1) { this.vol.remove(m); this.chunks.delete(k); E.chunkPool.push(m); }
    for (const m of this.blockMeshes) { const b = m.userData.b; m.position.set(-cam - HW, 0, 0); m.visible = b.x1 > cam - 2 && b.x0 < cam + VIEW_W + 2; }
  }
  // 遠景は envUpdate でまとめて動かす（render3d.js から呼ばれるので入口だけ残す）
  drawFar() {}

  // ==== 初期化（1 回） ============================================================================
  envInit() {
    const U = makeUniforms();
    const E = this.env = { U, chunkPool: [], cfg: null, t0: 0, layers: [], flash: 0, flashCol: new THREE.Color(1, 0.7, 0.4), flashPos: new THREE.Vector3(), bossK: 0, warnK: 0, inK: 0, warp: 0, sprX: 0, lastCam: 0, speed: 0, seen: new WeakSet(), edgeCol: new THREE.Color(), accCol: new THREE.Color(), tint: new THREE.Color(1, 1, 1), skyTint: new THREE.Color(1, 1, 1), stats: {} };
    // 既存の空・星・稜線は使わない（空は焼いたドーム、星は 4 層、稜線は立体の遠景に置き換える）
    if (this.sky) this.sky.visible = false;
    if (this.far) this.far.visible = false;
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry?.dispose(); this.stars.material?.dispose(); }
    E.skyGroup = new THREE.Group(); (this.rig || this.scene).add(E.skyGroup);
    this.stars = makeStars(U); E.skyGroup.add(this.stars);
    // 空のドーム（横は鏡映しで 4 回、縦は ±24° に焼いた絵を貼る）
    const dg = new THREE.SphereGeometry(150, 40, 20), uv = dg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4 + 0.5, 0.5 + (uv.getY(i) - 0.5) * 180 / 48);
    E.dome = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x05060c, side: THREE.BackSide, depthWrite: false, fog: false }));
    E.dome.renderOrder = -3; E.dome.frustumCulled = false; E.skyGroup.add(E.dome);
    E.bodies = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false }));
    E.bodies.renderOrder = -1; E.bodies.frustumCulled = false; E.bodies.visible = false; E.skyGroup.add(E.bodies);
    // 遠景・前景・光の筋の材質（面をまたいで使い回す）
    E.matFar = layerMaterial(U, { bend: true });
    E.matSpin = layerMaterial(U, {});
    E.matFore = layerMaterial(U, { fore: true, fog: false });
    E.matRays = layerMaterial(U, { add: true, bend: true, side: THREE.DoubleSide });
    // 粒子（加算と通常の 2 回の描画）
    const atlas = spriteAtlas();
    E.add = new EnvSprites(U, atlas, 760, true); E.alpha = new EnvSprites(U, atlas, 260, false);
    this.vol.add(E.alpha.mesh); this.vol.add(E.add.mesh);
    // 光の網（6 面）
    E.caustic = new THREE.Mesh(new THREE.PlaneGeometry(190, 80), causticMaterial(U, causticTex(), '#5affc8'));
    E.caustic.position.set(0, 0, -58); E.caustic.frustumCulled = false; E.caustic.visible = false; E.caustic.renderOrder = 1; this.vol.add(E.caustic);
    // 照明: 主光は箱に付ける（VR で箱を回しても向きが合う）。縁の光と、溶岩・爆発の点光を足す
    if (this.sun) { this.vol.add(this.sun); this.vol.add(this.sun.target); this.sun.target.position.set(0, 0, 0); }
    E.rim = new THREE.DirectionalLight(0xffffff, 1); this.vol.add(E.rim); this.vol.add(E.rim.target);
    E.pt = new THREE.PointLight(0xffffff, 0, 40, 2); this.vol.add(E.pt);
    // 戦場の箱の手がかり: 枠は細く、奥の壁は格子の代わりに十字の印、床と天井に奥行きの目盛り
    if (this.grid) {
      const gp = [];
      for (let x = -HW + 4; x < HW; x += 4) for (let y = -HH + 3; y < HH; y += 3) gp.push(x - 0.22, y, -DEPTH, x + 0.22, y, -DEPTH, x, y - 0.22, -DEPTH, x, y + 0.22, -DEPTH);
      for (const y of [-HH, HH]) for (let z = -DEPTH; z <= DEPTH + 0.01; z += DEPTH / 2) { gp.push(-HW, y, z, -HW + 1.2, y, z, HW - 1.2, y, z, HW, y, z); }
      for (const x of [-HW, HW]) for (const y of [-HH, HH]) gp.push(x, y, -DEPTH, x, y, DEPTH);
      this.grid.geometry.dispose(); this.grid.geometry = new THREE.BufferGeometry();
      this.grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    }
    // 画面の仕上げ（通常画面のみ）: 周辺減光と微かな粒子。DOM の重ね（描画の負荷なし。HUD より下）
    try {
      const v = document.createElement('div'); v.className = 'env-vignette';
      v.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 58%,rgba(0,0,0,.2) 82%,rgba(0,0,0,.5) 100%)';
      const gr = document.createElement('div');
      gr.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:.07;mix-blend-mode:overlay;background-image:url(${noiseGrain()});background-size:192px 192px`;
      v.appendChild(gr);
      const cvs = this.renderer.domElement; cvs.parentNode?.insertBefore(v, cvs.nextSibling);
      E.vignette = v; E.grain = gr;
    } catch (e) { /* DOM がなくても動く */ }
    // 出来事（爆発など）を受け取る。render3d.js が envOnEvent を呼ぶようになっても二重には処理しない
    const orig = this.onEvent;
    if (typeof orig === 'function') this.onEvent = function (ev, g, demo) { orig.call(this, ev, g, demo); this.envOnEvent(ev, g); };
  }

  // ==== 面ごとの作り直し ==========================================================================
  envSetStage(stage, game) {
    const E = this.env, U = E.U, cfg = E.cfg = stageEnv(stage.id), pal = stage.pal || {}, t0 = performance.now();
    E.t0 = this.now || 0; E.bossK = 0; E.warnK = 0; E.flash = 0; E.warp = 0; E.sprX = 0; E.lastCam = game?.camX || 0;
    // 前の面の物を捨てる
    for (const L of E.layers) { L.mesh.parent?.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.dispose?.(); }
    E.layers = []; E.spin = null;
    for (const m of E.chunkPool) m.geometry.dispose();
    E.chunkPool = [];
    for (const k of ['map', 'normalMap', 'emissiveMap']) E.tex?.[k]?.dispose();
    E.skyTex?.dispose(); E.bodyTex?.dispose();
    // 地形の材質
    const aniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy?.() || 1);
    const tb = performance.now();
    E.tex = bakeTerrain(cfg.tex, pal, aniso);
    if (!E.terrainMat) E.terrainMat = terrainMaterial(U, E.tex, cfg.mat);
    else { const m = E.terrainMat; m.map = E.tex.map; m.normalMap = E.tex.normalMap; m.emissiveMap = E.tex.emissiveMap; }
    { const m = E.terrainMat, mc = cfg.mat || {}; m.shininess = mc.shininess ?? 24; m.specular.set(mc.specular ?? 0x222222); m.normalScale.setScalar(mc.normalScale ?? 1); }
    E.edgeCol.set(cfg.terr.edge || pal.edge || '#ffffff'); E.accCol.set(cfg.accent);
    U.uEdge.value = cfg.terr.edgeK ?? 0.4; U.uCap.value.set(cfg.terr.cap || '#080808');
    // 空と天体
    E.skyTex = bakeSky(cfg.sky);
    E.dome.material.map = E.skyTex; E.dome.material.color.set(0xffffff); E.dome.material.needsUpdate = true;
    this.envBodies(cfg);
    const tTex = performance.now() - tb;
    // 立体の遠景・前景・光の筋・粒子
    E.add.clear(); E.alpha.clear();
    const bk = cfg.light.bake, sc = buildScenery(cfg, E.add, E.alpha, bk);
    // 宇宙の塵（面の外でも流れる。速いときは線になる）
    for (let i = 0; i < 70; i++) E.add.ambient(hash1(i, 1), hash1(i, 2), hash1(i, 3), 0, 0, 0, 0.07 + hash1(i, 4) * 0.08, 6, 0.3, -0.9, '#cfe0ff', hash1(i, 5) * TAU);
    E.add.commit(); E.alpha.commit();
    const layer = (geo, mat, period, n, f, order) => {
      const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.frustumCulled = false; mesh.renderOrder = order || 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.vol.add(mesh);
      const L = { mesh, period, n, f }; E.layers.push(L); return L;
    };
    layer(sc.far, E.matFar, PF, 3, 1); layer(sc.mid, E.matFar, PM, 3, 1);
    E.fore = layer(sc.fore, E.matFore, PFORE, 3, 1.22);
    E.rays = sc.rays ? layer(sc.rays, E.matRays, PM, 3, 1, 1) : null;
    if (sc.spinGeo && sc.spin.length) { E.spin = layer(sc.spinGeo, E.matSpin, PM, sc.spin.length * 3, 1); E.spin.list = sc.spin; E.spin.isSpin = true; }
    E.caustic.visible = !!cfg.caustic; if (cfg.caustic) E.caustic.material.uniforms.uCol.value.set(cfg.caustic);
    // 壊れない箱を専用の造形に差し替える
    for (const m of this.blockMeshes) { this.vol.remove(m); m.geometry.dispose(); }
    this.blockMeshes = [];
    for (const b of stage.terrain.blocks) { const m = this.envBlock(b); this.vol.add(m); this.blockMeshes.push(m); }
    // 面の入口・出口（地形が始まる x・終わる x）
    const T = stage.terrain; let xin = 1e9, xout = -1e9;
    for (let i = 0; i < T.n; i++) if (T.floor[i] > NONE_FLOOR + 0.5 || T.ceil[i] < NONE_CEIL - 0.5) { const x = T.x0 + i * T.step; if (x < xin) xin = x; if (x > xout) xout = x; }
    if (xin > xout) { xin = -1e4; xout = 1e4; }
    E.xin = xin; E.xout = xout;
    U.uVista.value.set(xin, xout, 0, 0);
    // 脈動（terrain.pulse と同じ値を渡す。2 区間まで）
    const pu = T.pulse || [];
    U.uPulseA.value.set(1e5, 1e5, 0, 0); U.uPulseB.value.set(1e5, 1e5, 0, 0);
    if (pu[0]) U.uPulseA.value.set(pu[0].x0, pu[0].x1, pu[0].amp, pu[0].freq);
    if (pu[1]) U.uPulseB.value.set(pu[1].x0, pu[1].x1, pu[1].amp, pu[1].freq);
    E.pulse = pu;
    // 霧・明滅・熱
    U.uFogCol.value.set(cfg.fog.col); U.uFog.value.set(cfg.fog.near, cfg.fog.far, cfg.fog.max, 0);
    U.uBlink.value.set(cfg.blink?.[0] ?? 2, cfg.blink?.[1] ?? 0.5); U.uHeat.value = cfg.heat || 0;
    // 照明（主光・縁・点光）
    const Lc = cfg.light;
    if (this.sun) { this.sun.color.set(Lc.key[0]); this.sun.position.set(Lc.key[2], Lc.key[3], Lc.key[4]); }
    E.rim.color.set(Lc.rim[0]); E.rim.position.set(Lc.rim[2], Lc.rim[3], Lc.rim[4]);
    E.col = { hemiS: new THREE.Color(Lc.hemi[0]), hemiG: new THREE.Color(Lc.hemi[1]), rim: new THREE.Color(Lc.rim[0]), pt: new THREE.Color(Lc.pt[0]), red: new THREE.Color('#ff2a2a') };   // 毎フレームの色の解釈を避ける
    if (this.frame?.material) { this.frame.material.color.set(cfg.frame); this.frame.material.opacity = 0.2; }
    if (this.grid?.material) { this.grid.material.color.set(cfg.frame); this.grid.material.opacity = 0.2; }
    E.stats = { texMs: tTex, sceneryMs: performance.now() - t0 - tTex, tris: sc.tris };
    if (typeof location !== 'undefined' && /debug=1/.test(location.search)) console.log(`ENV stage ${stage.id} bake: textures ${tTex.toFixed(0)}ms (terrain ${E.tex.ms.toFixed(0)}ms) scenery ${E.stats.sceneryMs.toFixed(0)}ms tris ${JSON.stringify(sc.tris)}`);
  }
  // 天体の板（空のドームと一緒に回る）
  envBodies(cfg) {
    const E = this.env, list = (cfg.bodies || []).slice(0, 2), R = 138, pos = [], uv = [];
    E.bodies.visible = list.length > 0;
    if (!list.length) return;
    E.bodyTex = bakeBodies(list);
    list.forEach((b, i) => {
      const frac = b.type === 'sun' ? 140 / 512 : b.ring ? 240 / 512 : 380 / 512, half = R * Math.tan(THREE.MathUtils.degToRad(b.size / frac) / 2);
      const yaw = THREE.MathUtils.degToRad(b.yaw), pit = THREE.MathUtils.degToRad(b.pitch);
      const c = new THREE.Vector3(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)).multiplyScalar(R);
      const rt = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), up = new THREE.Vector3().crossVectors(rt, c).normalize().negate();
      if (up.y < 0) up.negate();
      const p = (sx, sy) => { const q = c.clone().addScaledVector(rt, sx * half).addScaledVector(up, sy * half); pos.push(q.x, q.y, q.z); };
      p(-1, -1); p(1, -1); p(1, 1); p(-1, -1); p(1, 1); p(-1, 1);
      const u0 = i * 0.5, u1 = u0 + 0.5; uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    });
    E.bodies.geometry.dispose();
    const g = E.bodies.geometry = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    E.bodies.material.map = E.bodyTex; E.bodies.material.needsUpdate = true;
  }

  // ==== 出来事（爆発・被弾の照り返し） ==============================================================
  envOnEvent(ev, g) {
    const E = this.env; if (!E || !ev || typeof ev !== 'object') return;
    if (E.seen.has(ev)) return; E.seen.add(ev);
    const hit = (k, col, x, y, z) => {
      if (k < E.flash * 0.8) return;
      E.flash = Math.max(E.flash, k); E.flashCol.set(col);
      if (x !== undefined) E.flashPos.set(x - (this.cam || 0) - HW, y - HH, -(z || 0));
    };
    switch (ev.t) {
      case 'explode': { const k = { s: 0.16, m: 0.4, l: 1, p: 0.6 }[ev.size] || 0.16; hit(k, ev.kind === 'flesh' || ev.kind === 'cell' ? '#ff8a9a' : '#ffb060', ev.x, ev.y, ev.z); break; }
      case 'bossdown': hit(1.5, '#fff0d0', g?.boss?.x, g?.boss?.y, g?.boss?.z); break;
      case 'phase': hit(0.9, '#ffffff'); break;
      case 'die': hit(0.8, '#ff6a5a', g?.player?.x, g?.player?.y, g?.player?.z); break;
      case 'shieldhit': hit(0.2, '#7ad8ff', g?.player?.x, g?.player?.y, g?.player?.z); break;
      case 'stageclear': E.warp = Math.max(E.warp, 0.01); break;
    }
  }

  // ==== 毎フレーム ================================================================================
  envUpdate(g, cam, now, dt) {
    const E = this.env, U = E.U, cfg = E.cfg; if (!cfg) return;
    const xr = !!this.renderer.xr.isPresenting, t = now - E.t0, camHW = cam + HW;
    U.uTime.value = t; U.uCamHW.value = camHW;
    // 面の中にいる度合い（入口・出口の外は宇宙）
    const kin = smooth((camHW - (E.xin - 34)) / 40) * (1 - smooth((camHW - (E.xout - 4)) / 30));
    E.inK = kin;
    // 入口の手前・出口の先では景色全体を沈める（面の始まりは地表へ降りていく眺め、終わりは宇宙へ抜ける眺め）
    const drop = Math.min(80, 0.9 * Math.max(0, E.xin - 6 - camHW, camHW - (E.xout - 14)));
    U.uVista.value.z = drop;
    // ボス戦の空気（警告で暗転して赤く脈打ち、戦闘中は面ごとの色に沈める）
    const st = g.state, boss = !!g.boss, warn = g.bossWarn > 0 && !boss;
    E.bossK += ((boss ? 1 : 0) - E.bossK) * Math.min(1, dt * 1.5);
    E.warnK += ((warn ? 1 : 0) - E.warnK) * Math.min(1, dt * 4);
    const wp = E.warnK * (0.55 + 0.45 * Math.sin(now * 9));
    const bt = cfg.boss.tint, bs = cfg.boss.sky;
    E.tint.setRGB(lerp(1, bt[0], E.bossK), lerp(1, bt[1], E.bossK), lerp(1, bt[2], E.bossK));
    E.tint.r *= 1 - wp * 0.25; E.tint.g *= 1 - wp * 0.55; E.tint.b *= 1 - wp * 0.5;
    U.uTint.value.copy(E.tint);
    // 爆発の照り返し（render3d.js の閃光 flashT も拾う）
    E.flash = Math.max(0, E.flash - dt * (1.6 + E.flash * 2.5));
    const fl = Math.min(1.6, Math.max(E.flash, (this.flashT || 0) * 1.6));
    U.uFlash.value.copy(E.flashCol).multiplyScalar(fl * 0.55);
    E.skyTint.setRGB(lerp(1, bs[0], E.bossK), lerp(1, bs[1], E.bossK), lerp(1, bs[2], E.bossK));
    E.skyTint.r = E.skyTint.r * (1 - wp * 0.2) + wp * 0.12; E.skyTint.g *= 1 - wp * 0.6; E.skyTint.b *= 1 - wp * 0.55;
    _c.copy(E.flashCol).multiplyScalar(fl * 0.45);
    E.dome.material.color.copy(E.skyTint).add(_c);
    E.bodies.material.color.copy(E.skyTint);
    // 速度（スピード線）: スクロールの速さ＋面クリア後の加速
    const sp = dt > 0 ? Math.abs(cam - E.lastCam) / dt : 0; E.lastCam = cam;
    if (sp < 60) E.speed += (sp - E.speed) * Math.min(1, dt * 3);
    const clear = st === 'stageclear' || st === 'clear';
    E.warp = clear ? Math.min(1, E.warp + dt * 0.45) : Math.max(0, E.warp - dt * 1.5);
    const enter = st === 'enter' && g.stageTick < 90 ? 1 - g.stageTick / 90 : 0;
    const boost = E.warp * E.warp * 60 + enter * 26;
    E.sprX += boost * dt;
    const streak = Math.min(6, E.speed * 0.14 + boost * 0.22);     // 速いほど塵が線に伸びる
    U.uStreak.value = streak;
    U.uAmb.value = kin * (1 - 0.35 * E.bossK); U.uEmit.value = 1;
    U.uSprX.value = E.sprX % 6400;     // 漂う粒だけ「加速ぶん」を足して流す（遠景に固定の噴煙は本当のカメラ位置のまま）
    // 星: 面の中では控えめ、宇宙とボス戦でははっきり。面クリアで流れる
    U.uStarK.value = lerp(1, Math.min(1, (cfg.stars ?? 0.6) + 0.25 * E.bossK), kin) * (1 + fl * 0.5);
    U.uStarRot.value = -cam * 0.0012 - E.sprX * 0.004;
    E.skyGroup.rotation.y = -cam * 0.00035;
    // 脈動の位相（terrain.pulseAt の t * speed。ゲームの tick そのまま＝当たり判定と同じ形）
    const pu = E.pulse, tick = g.stageTick;
    U.uPhase.value.set(pu[0] ? (tick * pu[0].speed) % TAU : 0, pu[1] ? (tick * pu[1].speed) % TAU : 0);
    // 地形の発光の脈動（5・6 面は壁のうねりと同じ位相）
    const em = cfg.terr.emis;
    if (pu[0]) U.uEmis.value.set(em[0], em[1], U.uPhase.value.x, pu[0].freq);
    else U.uEmis.value.set(em[0], em[1], t * em[2], em[3]);
    // 箱の外へはみ出す奥の起伏: VR では箱の少し外で切る（部屋の中に広がりすぎない）
    U.uClipW.value = xr ? HW + 12 : 1e5;
    // 画面の大きさ（星の点の大きさ用）
    if (xr) { const c0 = this.renderer.xr.getCamera()?.cameras?.[0]; U.uPx.value = c0?.viewport?.w || 1700; }
    else U.uPx.value = this.renderer.getDrawingBufferSize(_v2).y;
    // 前景の位置: 通常画面はカメラから見て戦場の箱に重ならない高さ、VR は箱の床より下・天井より上
    const cp = this.camera.position;
    if (xr || cp.z < 6) U.uFore.value.set(9.35 + (1 - kin) * 9, 9.35 + (1 - kin) * 9);
    else { const k = (cp.z - 4.6) / (cp.z - DEPTH); U.uFore.value.set(-(cp.y + (-HH - cp.y) * k) + 0.12 + (1 - kin) * 9, cp.y + (HH - cp.y) * k + 0.12 + (1 - kin) * 9); }
    // 遠景・前景を周期で並べる
    for (const L of E.layers) {
      if (L.isSpin) continue;
      const base = -((camHW * L.f) % L.period);
      for (let i = 0; i < L.n; i++) { _m.makeTranslation(base + (i - 1) * L.period, 0, 0); L.mesh.setMatrixAt(i, _m); }
      L.mesh.instanceMatrix.needsUpdate = true;
    }
    if (E.rays) E.rays.mesh.visible = kin > 0.01;
    if (E.fore) E.fore.mesh.visible = !xr;     // 前景は通常画面の縁取り。VR では出さない（ジオラマの手前を何も遮らない）
    if (E.spin) {     // 歯車・換気扇（回転は時刻から）
      const L = E.spin, base = -(camHW % L.period), vs = U.uVista.value; let n = 0;
      for (let k = 0; k < 3; k++) for (const s of L.list) {
        _q.setFromAxisAngle(AXZ, t * s.sp + s.x);
        _m.compose(_v.set(base + (k - 1) * L.period + s.x, s.y - vs.z, s.z), _q, _s.set(s.r, s.r, s.r));
        L.mesh.setMatrixAt(n++, _m);
      }
      L.mesh.instanceMatrix.needsUpdate = true;
    }
    if (E.caustic.visible) E.caustic.material.uniforms.uK.value = kin * (cfg.causticK ?? 1);
    // 照明: 面ごとの主光・縁の光。点光は溶岩などのゆらぎ、爆発のときはその場所へ
    const Lc = cfg.light, sc = this.vol.scale.x || 1, mood = 1 - 0.22 * E.bossK - 0.3 * wp;
    if (this.hemi) { this.hemi.color.copy(E.col.hemiS).multiplyScalar(mood); this.hemi.groundColor.copy(E.col.hemiG).multiplyScalar(mood + fl * 0.6); }
    if (this.sun) this.sun.intensity = Lc.key[1] * (1 - 0.2 * E.bossK - 0.3 * wp) + fl * 0.5;
    E.rim.intensity = Lc.rim[1] * (0.85 + 0.15 * Math.sin(t * 1.3)) * (1 + 0.7 * E.bossK) + wp * 1.2;
    E.rim.color.copy(E.col.rim); if (wp > 0) E.rim.color.lerp(E.col.red, wp);
    const fk = Math.min(1, fl * 1.6), flick = 0.75 + 0.15 * Math.sin(t * 3.1) + 0.1 * Math.sin(t * 7.7 + 1);
    E.pt.color.copy(E.col.pt).lerp(E.flashCol, fk);
    E.pt.position.set(lerp(Math.sin(t * 0.23) * 11, E.flashPos.x, fk), lerp(Lc.pt[2], E.flashPos.y, fk), lerp(Lc.pt[3], E.flashPos.z + 1.5, fk));
    E.pt.intensity = (Lc.pt[1] * flick * kin + fl * 160) * sc * sc; E.pt.distance = 44 * sc;
    // 箱の手がかり（ボス戦では少しはっきり）
    if (this.frame?.material) this.frame.material.opacity = 0.2 + 0.08 * E.bossK;
    // 画面の粒子（DOM）: 数フレームごとに位置をずらす
    if (E.grain && !xr) { E.gn = (E.gn || 0) + 1; if (E.gn % 3 === 0) E.grain.style.backgroundPosition = `${(E.gn * 37) % 192}px ${(E.gn * 91) % 192}px`; }
  }
}
// 画面の粒子用の小さな雑音の絵（1 回だけ作る）
let _grain;
function noiseGrain() {
  if (_grain) return _grain;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d'), im = x.createImageData(96, 96);
  for (let i = 0; i < 96 * 96; i++) { const v = hash1(i, 77) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0); _grain = c.toDataURL();
  return _grain;
}
// Render3D に混ぜ込む
export function install(Target) { for (const k of Object.getOwnPropertyNames(Env3D.prototype)) if (k !== 'constructor') Target.prototype[k] = Env3D.prototype[k]; }
