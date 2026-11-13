// 3D 版の部品: 形の結合（頂点色・発光・質感つき）・押し出し・回転体・管・インスタンスのまとめ描き
// 描画回数を減らすため、同じ形の物は InstancedMesh で 1 回にまとめる（Batch / モデルのまとめ描きは render3d.js）。
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const PI = Math.PI;

// ---- 形の素 -------------------------------------------------------------------
// 2D の多角形を押し出す（xy が横顔、z が厚み。中心を z=0 に）
export function extrude(pts, depth, bevel = 0.03, segs = 1) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const b = Math.min(bevel, depth * 0.45);
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: segs, curveSegments: 6 });
  g.translate(0, 0, -(depth - b * 2) / 2);
  return g;
}
// 面取りした箱
export function rbox(w, h, d, b = 0.04) {
  b = Math.min(b, w * 0.45, h * 0.45, d * 0.45);
  const x = w / 2, y = h / 2;
  return extrude([[-x + b, -y], [x - b, -y], [x, -y + b], [x, y - b], [x - b, y], [-x + b, y], [-x, y - b], [-x, -y + b]], d, b);
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const sph = (r = 1, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
export const hemi = (r = 1, w = 16, h = 8) => new THREE.SphereGeometry(r, w, h, 0, PI * 2, 0, PI / 2);
export const cyl = (r0, r1, h, n = 14, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);
export const cone = (r, h, n = 14) => new THREE.ConeGeometry(r, h, n);
export const torus = (R, r, n = 20, t = 8, arc = PI * 2) => new THREE.TorusGeometry(R, r, t, n, arc);
export const ico = (r = 1, d = 1) => new THREE.IcosahedronGeometry(r, d);
// 回転体（[半径, 高さ] の列を y 軸まわりに回す）
export function lathe(prof, n = 16) {
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), n);
}
// 点列に沿う管
export function tube(pts, r = 0.05, seg = 12, rad = 6, closed = false) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0)), closed);
  return new THREE.TubeGeometry(c, seg, r, rad, closed);
}
// 頂点を関数で動かす（岩・脳のしわ など）
export function displace(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _p.set(p.getX(i), p.getY(i), p.getZ(i)); const k = fn(_p.x, _p.y, _p.z, i); p.setXYZ(i, _p.x * k, _p.y * k, _p.z * k); }
  g.computeVertexNormals();
  return g;
}
// 同じ位置の頂点の法線をそろえる（非インデックスの形を滑らかに見せる）
export function smooth(g) {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position, map = new Map();
  src.computeVertexNormals();
  const n = src.attributes.normal;
  const key = (i) => `${Math.round(p.getX(i) * 1e3)},${Math.round(p.getY(i) * 1e3)},${Math.round(p.getZ(i) * 1e3)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i); let a = map.get(k); if (!a) { a = [0, 0, 0]; map.set(k, a); } a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); }
  for (let i = 0; i < p.count; i++) { const a = map.get(key(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  return src;
}

// ---- 形を集めて材質の種類ごとに 1 つの BufferGeometry にまとめる ----------------------
// 種類: metal（金属・塗装）/ stone（石）/ flesh（生体）/ decal（文字・標識。uv は元の形のもの）
// 頂点の属性: position, normal, uv（箱型の投影）, color（色）, emi（発光色）, pbr（粗さ, 金属度, 発光マスクの効き）
export const KINDS = ['metal', 'stone', 'flesh', 'decal'];
export class ModelBuilder {
  constructor(uv = 0.5) { this.items = { metal: [], stone: [], flesh: [], decal: [] }; this.uv = uv * 0.55; this.sockets = {}; }
  add(kind, geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], o = null) {
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e);
    if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
    this.items[kind].push({ geo, color, matrix: _m.clone(), o: o || NO });
    return this;
  }
  // 金属（o: { r 粗さ, m 金属度, e 発光色, ei 発光の強さ, k 発光マスク, uv 模様の細かさ }）
  m(geo, color, pos, rot, scl, o) { return this.add('metal', geo, color, pos, rot, scl, o); }
  s(geo, color, pos, rot, scl, o) { return this.add('stone', geo, color, pos, rot, scl, o); }
  f(geo, color, pos, rot, scl, o) { return this.add('flesh', geo, color, pos, rot, scl, o); }
  // 光る部品（色は黒、発光だけ）
  e(geo, color, pos, rot, scl, ei = 1.6) { return this.add('metal', geo, '#050505', pos, rot, scl, { e: color, ei, r: 0.4, m: 0 }); }
  // 文字・標識の板（uv0..uv1 はアトラスの範囲）
  d(w, h, uv, pos, rot, scl) {
    const g = new THREE.PlaneGeometry(w, h); const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
    return this.add('decal', g, '#ffffff', pos, rot, scl, { keepUv: true });
  }
  // z で鏡写しにした 2 つを足す（左右対称の部品）
  mirror(fn) { fn(1); fn(-1); return this; }
  build() {
    const out = { sockets: this.sockets };
    for (const k of KINDS) out[k] = this.items[k].length ? merge(this.items[k], this.uv, k) : null;
    return out;
  }
}
const NO = {};
const DEF = { metal: [0.55, 0.85], stone: [0.95, 0.0], flesh: [0.38, 0.0], decal: [0.6, 0.2] };
function merge(list, uvScale, kind) {
  let n = 0;
  const gs = list.map(({ geo, color, matrix, o }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) { // 鏡像なら面の向きを戻す（頂点 1 と 2 を入れ替える）
      for (const name of ['position', 'normal', 'uv']) {
        const a = g.attributes[name]; if (!a) continue;
        const p = a.array, it = a.itemSize;
        for (let i = 0; i < p.length; i += it * 3) for (let k = 0; k < it; k++) { const t = p[i + it + k]; p[i + it + k] = p[i + it * 2 + k]; p[i + it * 2 + k] = t; }
      }
    }
    n += g.attributes.position.count;
    return { g, color, o };
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), emi = new Float32Array(n * 3), pbr = new Float32Array(n * 3);
  let at = 0;
  for (const { g, color, o } of gs) {
    const c = _c.set(color), cr = c.r, cg = c.g, cb = c.b;
    let er = 0, eg = 0, eb = 0;
    if (o.e) { const ei = o.ei ?? 1.5; _c.set(o.e); er = _c.r * ei; eg = _c.g * ei; eb = _c.b * ei; }
    const rough = o.r ?? DEF[kind][0], metal = o.m ?? DEF[kind][1], mask = o.k ?? 0, us = (o.uv ?? 1) * uvScale;
    const P = g.attributes.position.array, cnt = g.attributes.position.count;
    pos.set(P, at * 3);
    nor.set(g.attributes.normal.array, at * 3);
    for (let i = 0; i < cnt; i++) {
      const k = (at + i) * 3;
      col[k] = cr; col[k + 1] = cg; col[k + 2] = cb; emi[k] = er; emi[k + 1] = eg; emi[k + 2] = eb; pbr[k] = rough; pbr[k + 1] = metal; pbr[k + 2] = mask;
    }
    if (o.keepUv && g.attributes.uv) uv.set(g.attributes.uv.array, at * 2);
    else for (let t = 0; t < cnt; t += 3) {   // 面の向きで箱型に投影（模様が形によらず同じ密度になる）
      const a = t * 3;
      const ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2], vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2];
      const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
      for (let i = 0; i < 3; i++) {
        const b = a + i * 3, x = P[b], y = P[b + 1], z = P[b + 2], w = (at + t + i) * 2;
        if (nz >= nx && nz >= ny) { uv[w] = x * us; uv[w + 1] = y * us; } else if (nx >= ny) { uv[w] = z * us + 0.37; uv[w + 1] = y * us; } else { uv[w] = x * us; uv[w + 1] = z * us + 0.61; }
      }
    }
    at += cnt;
    g.dispose();
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  r.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  r.setAttribute('color', new THREE.BufferAttribute(col, 3));
  r.setAttribute('emi', new THREE.BufferAttribute(emi, 3));
  r.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
  r.computeBoundingSphere();
  return r;
}

// 質感のプリセット
export const PAINT = { r: 0.46, m: 0.35 }, ARMOR = { r: 0.5, m: 0.7 }, CHROME = { r: 0.16, m: 1 }, DARK = { r: 0.85, m: 0.3 }, GLASS = { r: 0.07, m: 1 }, RUBBER = { r: 0.95, m: 0 }, BRONZE = { r: 0.38, m: 0.95 };

// 噴射口（−x 向き。dir=1 で +x 向き）
export function nozzle(m, x, y, z, r, len, col = '#30384a', glow = '#9fd8ff', dir = -1) {
  const PI = Math.PI;
  m.m(lathe([[r * 0.72, 0], [r, len * 0.25], [r * 0.95, len], [r * 0.8, len], [r * 0.6, len * 0.3], [r * 0.3, len * 0.1]], 12), col, [x, y, z], [0, 0, dir < 0 ? PI / 2 : -PI / 2], 1, { r: 0.35, m: 1 });
  if (glow) m.e(cyl(r * 0.62, r * 0.62, 0.02, 12), glow, [x + dir * len * 0.45, y, z], [0, 0, PI / 2], 1, 2.2);
}

// ---- 色（0xRRGGBB の数値 → 線形の rgb。毎フレームの文字列解析と割り当てを避ける） -------------
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export const linR = (h) => LIN[(h >> 16) & 255], linG = (h) => LIN[(h >> 8) & 255], linB = (h) => LIN[h & 255];
// '#rrggbb' → 数値（起動時・面の切り替え時だけ使う）
export const hex = (s) => (typeof s === 'number' ? s : parseInt(s.slice(1), 16));

// ---- 同じ形をまとめて描く（毎フレーム begin → put … → end） ---------------------------
export class Batch {
  constructor(geo, mat, cap, parent) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0; this.mesh.visible = false;
    this.cap = cap; this.n = 0;
    this.M = this.mesh.instanceMatrix.array; this.C = this.mesh.instanceColor.array;
    parent.add(this.mesh);
  }
  begin() { this.n = 0; }
  // 位置・大きさ（数値か [sx,sy,sz]）・色（'#rrggbb' か 0xRRGGBB）・回転（z 回転の角度か Quaternion）
  put(x, y, z, s, color, rot = 0, intensity = 1) {
    if (this.n >= this.cap) return;
    if (typeof rot === 'number') { _q.setFromAxisAngle(AXIS_Z, rot); } else _q.copy(rot);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _m.compose(_p.set(x, y, z), _q, _s);
    _m.toArray(this.M, this.n * 16);
    const k = this.n * 3, C = this.C;
    if (typeof color === 'number') { C[k] = LIN[(color >> 16) & 255] * intensity; C[k + 1] = LIN[(color >> 8) & 255] * intensity; C[k + 2] = LIN[color & 255] * intensity; }
    else { _c.set(color); C[k] = _c.r * intensity; C[k + 1] = _c.g * intensity; C[k + 2] = _c.b * intensity; }
    this.n++;
  }
  // 大きさ 3 軸・回転 Quaternion・色を数値で（割り当てなし）
  put3(x, y, z, sx, sy, sz, q, color, intensity = 1) {
    if (this.n >= this.cap) return;
    _m.compose(_p.set(x, y, z), q, _s.set(sx, sy, sz));
    _m.toArray(this.M, this.n * 16);
    const k = this.n * 3, C = this.C;
    C[k] = LIN[(color >> 16) & 255] * intensity; C[k + 1] = LIN[(color >> 8) & 255] * intensity; C[k + 2] = LIN[color & 255] * intensity;
    this.n++;
  }
  end() {
    const m = this.mesh;
    m.count = this.n; m.visible = this.n > 0;
    if (!this.n) return;
    m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, this.n * 16); m.instanceMatrix.needsUpdate = true;
    m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, this.n * 3); m.instanceColor.needsUpdate = true;
  }
}
export const AXIS_Z = new THREE.Vector3(0, 0, 1);
export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const Q_ID = new THREE.Quaternion();

// 2 点を結ぶ円柱の回転（円柱は y 軸向き）
const _d = new THREE.Vector3();
export function quatAlong(dx, dy, dz, out) {
  _d.set(dx, dy, dz).normalize();
  return out.setFromUnitVectors(AXIS_Y, _d);
}
