// 3D 版の部品: 形の結合（頂点色つき）・押し出し・インスタンスのまとめ描き
// 描画回数を減らすため、同じ形の物（弾・火花・球・箱）は InstancedMesh で 1 回にまとめる。
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// 2D の多角形を押し出す（xy が横顔、z が厚み。中心を z=0 に）
export function extrude(pts, depth, bevel = 0.03) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// 形を集めて 1 つの BufferGeometry（位置・法線・頂点色）にまとめる
export class ModelBuilder {
  constructor() { this.items = { body: [], glow: [], add: [] }; }
  add(kind, geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
    this.items[kind].push({ geo, color, matrix: _m.clone() });
    return this;
  }
  body(...a) { return this.add('body', ...a); }
  glow(...a) { return this.add('glow', ...a); }
  addv(...a) { return this.add('add', ...a); }
  build() {
    const out = {};
    for (const k of ['body', 'glow', 'add']) out[k] = this.items[k].length ? merge(this.items[k]) : null;
    return out;
  }
}
function merge(list) {
  let n = 0;
  const gs = list.map(({ geo, color, matrix }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) { // 鏡像なら面の向きを戻す
      const p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      g.computeVertexNormals();
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    n += g.attributes.position.count;
    return { g, color };
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, color } of gs) {
    const c = _c.set(color);
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += g.attributes.position.count;
    g.dispose();
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  r.setAttribute('color', new THREE.BufferAttribute(col, 3));
  r.computeBoundingSphere();
  return r;
}

// 同じ形をまとめて描く（毎フレーム begin → put … → end）
export class Batch {
  constructor(geo, mat, cap, parent) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.cap = cap; this.n = 0;
    parent.add(this.mesh);
  }
  begin() { this.n = 0; }
  // 位置・大きさ（数値か [sx,sy,sz]）・色・回転（z 回転の角度か Quaternion）
  put(x, y, z, s, color, rot = 0, intensity = 1) {
    if (this.n >= this.cap) return;
    if (typeof rot === 'number') { _q.setFromAxisAngle(AXIS_Z, rot); } else _q.copy(rot);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _m.compose(_p.set(x, y, z), _q, _s);
    this.mesh.setMatrixAt(this.n, _m);
    _c.set(color); if (intensity !== 1) _c.multiplyScalar(intensity);
    this.mesh.setColorAt(this.n, _c);
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
export const AXIS_Z = new THREE.Vector3(0, 0, 1);
export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);

// 2 点を結ぶ円柱の回転（円柱は y 軸向き）
const _d = new THREE.Vector3();
export function quatAlong(dx, dy, dz, out) {
  _d.set(dx, dy, dz).normalize();
  return out.setFromUnitVectors(AXIS_Y, _d);
}
