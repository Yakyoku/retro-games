// Sky Climber VR — 骨格入りモデルの読み込み（tools/build-characters.mjs が作った .json + .bin）と、骨の姿勢づけ。
// 骨は結合の姿勢で回転なし（ワールドの向きのまま）に作るので、「骨の向き＝結合のときの向きからの回転」をワールドで指定できる。
import * as THREE from 'three';

const cache = new Map();
const base = new URL('./models/', import.meta.url);

export async function loadModels(names) {
  await Promise.all(names.map(async (n) => {
    if (cache.has(n)) return;
    const [json, bin] = await Promise.all([fetch(new URL(n + '.json', base)).then((r) => { if (!r.ok) throw new Error(n + '.json ' + r.status); return r.json(); }),
      fetch(new URL(n + '.bin', base)).then((r) => { if (!r.ok) throw new Error(n + '.bin ' + r.status); return r.arrayBuffer(); })]);
    const L = json.layout, T = { Float32Array, Int8Array, Uint8Array, Uint16Array, Uint32Array };
    const arr = (k) => new T[L[k].type](bin, L[k].offset, L[k].length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr('position').slice(), 3));
    const n8 = arr('normal'), nv = json.vertices, N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), c8 = arr('color');
    const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; // 頂点色は sRGB → 線形
    for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) { N[i * 3 + k] = n8[i * 4 + k] / 127; C[i * 3 + k] = lin(c8[i * 4 + k]); } }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(arr('uv').slice(), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(arr('skinIndex')), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(arr('skinWeight'), (w) => w / 255), 4));
    g.setIndex(new THREE.BufferAttribute(arr('index').slice(), 1));
    json.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
    g.computeBoundingSphere();
    cache.set(n, { json, geometry: g });
  }));
}
export const getModel = (n) => { const m = cache.get(n); if (!m) throw new Error('モデル未読込: ' + n); return m; };

// 骨格つきメッシュを作る。materials = { グループ名: 材質 }
export function makeRigged(name, materials) {
  const { json, geometry } = getModel(name);
  const bones = json.bones.map((b) => { const bo = new THREE.Bone(); bo.name = b.name; return bo; });
  json.bones.forEach((b, i) => {
    const p = b.parent >= 0 ? json.bones[b.parent].pos : [0, 0, 0];
    bones[i].position.set(b.pos[0] - p[0], b.pos[1] - p[1], b.pos[2] - p[2]);
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  const mats = json.groups.map((g) => materials[g.name] || materials.default);
  const mesh = new THREE.SkinnedMesh(geometry, mats);
  for (const [i, b] of json.bones.entries()) if (b.parent < 0) mesh.add(bones[i]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  const bindPos = Object.fromEntries(json.bones.map((b) => [b.name, new THREE.Vector3(...b.pos)]));
  return { mesh, bones: byName, bindPos, json };
}

// ---- 姿勢づけの道具 ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
// dir（骨の向き）と ref（曲げる方向の手がかり）から正規直交の向きを作る
export function frameQuat(dir, ref, out = new THREE.Quaternion()) {
  const a = dir.clone().normalize();
  const b = ref.clone().sub(a.clone().multiplyScalar(ref.dot(a)));
  if (b.lengthSq() < 1e-8) b.set(0, 0, 1).sub(a.clone().multiplyScalar(a.z));
  b.normalize();
  const c = new THREE.Vector3().crossVectors(a, b);
  _m.makeBasis(a, b, c); return out.setFromRotationMatrix(_m);
}
// 骨のワールドの回転を指定（親のワールド回転を差し引いて局所回転に）
export function setWorldQuat(bone, worldQ) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(worldQ));
}
// 結合のとき dir0/ref0 だった骨を、今の dir1/ref1 へ向ける
export function aimBone(bone, dir0, ref0, dir1, ref1) {
  const f0 = frameQuat(dir0, ref0), f1 = frameQuat(dir1, ref1);
  setWorldQuat(bone, f1.multiply(f0.invert()));
}
export function worldPos(bone, out = new THREE.Vector3()) { bone.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bone.matrixWorld); }

// 臨界減衰に近いばね（ベクトル）。freq=Hz、zeta=減衰比（1 未満で少し行き過ぎて戻る）
export class Spring3 {
  constructor(x = new THREE.Vector3()) { this.x = x.clone(); this.v = new THREE.Vector3(); }
  step(target, dt, freq = 6, zeta = 1) {
    const w = 2 * Math.PI * freq, n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) { const a = target.clone().sub(this.x).multiplyScalar(w * w).sub(this.v.clone().multiplyScalar(2 * zeta * w)); this.v.addScaledVector(a, h); this.x.addScaledVector(this.v, h); }
    return this.x;
  }
  snap(x) { this.x.copy(x); this.v.set(0, 0, 0); }
}
export class Spring1 {
  constructor(x = 0) { this.x = x; this.v = 0; }
  step(target, dt, freq = 6, zeta = 1) {
    const w = 2 * Math.PI * freq, n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) { const a = (target - this.x) * w * w - this.v * 2 * zeta * w; this.v += a * h; this.x += this.v * h; }
    return this.x;
  }
}
