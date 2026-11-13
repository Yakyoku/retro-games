// VOIDBLOOM — 機体・敵・ボスの 3D モデル（すべてプリミティブから計算で組み立てる。外部モデルなし）
// build(type, e) → { obj, anim(e, t, a, dt, ctx) }。obj の原点は当たり判定の中心、+x が前（自機）、敵は -x を向く。
//   t: 経過秒、a: 補間（0〜1。前 tick と今 tick の間）、dt: 前フレームからの実時間、ctx: { vx, vy（描画上の速度 u/s）, hit（被弾の光 0〜1） }
// 動きはすべて「実時間の指数減衰／ばね」で書き、72・90・120・144Hz のどれでも同じ速さ・同じ滑らかさになるようにする。
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { materials, colorOf, U } from './materials.js';
import { heartbeat } from './atmosphere.js';

const G = {}; // ジオメトリのキャッシュ
const geo = (key, fn) => G[key] || (G[key] = fn());
const mesh = (g, m) => new THREE.Mesh(g, m);

// ---- 動きの道具 ----
export const damp = (cur, target, k, dt) => target + (cur - target) * Math.exp(-k * dt);
export function dampAngle(cur, target, k, dt) { const d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur)); return cur + d * (1 - Math.exp(-k * dt)); }
// ばね（少しだけ行き過ぎて戻る。ζ=0.75）
export function spring(st, target, w, dt, zeta = 0.75) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
  for (let i = 0; i < steps; i++) { const acc = w * w * (target - st.x) - 2 * zeta * w * st.v; st.v += acc * h; st.x += st.v * h; }
  return st.x;
}
// 部位の補間（ボスや蟲の節は tick ごとにしか動かないので、前 tick の位置 pox/poy と補間する）
const lx = (p, a) => (p.pox == null ? p.ox : p.pox + (p.ox - p.pox) * a);
const ly = (p, a) => (p.poy == null ? p.oy : p.poy + (p.oy - p.poy) * a);
const lang = (e, a) => { if (e.pang == null) return e.ang; const d = Math.atan2(Math.sin(e.ang - e.pang), Math.cos(e.ang - e.pang)); return e.pang + d * a; };

// 不規則な呼吸（周期の違う正弦の和。一定の拍子にならない）-1〜1
export const breath = (t, seed = 0) => 0.6 * Math.sin(t * 1.9 + seed) + 0.3 * Math.sin(t * 3.1 + seed * 1.7) + 0.1 * Math.sin(t * 7.3 + seed * 2.9);
// まばたき: 1.5〜5 秒おきに 0.16 秒で閉じて開く。alert（撃つ前・撃った直後）は瞳が開く（大きく）
function makeBlink(seed = 0) {
  let t = 0, next = 0.5 + (Math.abs(Math.sin(seed * 12.9898)) * 3), ph = -1;
  return (dt, alert = 0) => {
    t += dt;
    if (ph < 0 && t > next) ph = 0;
    let lid = 1;
    if (ph >= 0) { ph += dt; lid = Math.min(1, Math.abs(ph - 0.08) / 0.08); if (ph > 0.16) { ph = -1; t = 0; next = 1.5 + Math.random() * 3.5; } }
    return { lid: Math.max(0.06, lid), pupil: 1 + 0.35 * alert };
  };
}
function blinkEye(eye, b, base = 1) { eye.scale.set(base * b.pupil, base * b.pupil * b.lid, base * b.pupil); }
// 2 点をつなぐ膜（円柱を伸ばして向ける）
const LINK_G = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
function linkMesh(mat) { const m = new THREE.Mesh(LINK_G, mat); return m; }
function setLink(m, ax, ay, az, bx, by, bz, r) { const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1e-4; m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); m.scale.set(r, len, r); m.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(dx / len, dy / len, dz / len)); }
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// 目が自機を見る: 元の位置から look 方向へ最大 r だけずらす（減衰で追う）
function lookAt(eye, base, ctx, r, flip = false, dt = 1 / 60) {
  const lx2 = ctx.lookX ?? -1, ly2 = (ctx.lookY ?? 0) * (flip ? -1 : 1), d = Math.hypot(lx2, ly2) || 1;
  eye.position.x = damp(eye.position.x, base.x + lx2 / d * r, 10, dt);
  eye.position.y = damp(eye.position.y, base.y + ly2 / d * r, 10, dt);
}
// 節の位置を通るなめらかな 1 本の胴（Catmull-Rom 曲線に沿って輪を並べ、毎フレーム頂点だけ書き換える）
class SplineBody {
  constructor(rings, radial, mat, off = 0, rs = 1) {
    this.R = rings; this.N = radial; this.off = off; this.rs = rs;
    const pos = new Float32Array(rings * (radial + 1) * 3), idx = [];
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); } // 表を外向きに（法線が外を向く巻き方）
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false;
    this.v = new THREE.Vector3(); this.tg = new THREE.Vector3();
  }
  update(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z || 0)), false, 'centripetal');
    const pos = this.geo.attributes.position.array, R = this.R, N = this.N;
    for (let i = 0; i < R; i++) {
      const t = i / (R - 1), c = curve.getPointAt(t, this.v), tg = curve.getTangentAt(t, this.tg);
      const fi = t * (pts.length - 1), i0 = Math.floor(fi), i1 = Math.min(pts.length - 1, i0 + 1), r0 = pts[i0].r + (pts[i1].r - pts[i0].r) * (fi - i0), r = r0 * this.rs * (this.off ? Math.pow(Math.sin(Math.PI * t), 0.4) : 1), cz = c.z + r0 * this.off;
      const nx = -tg.y, ny = tg.x, nl = Math.hypot(nx, ny) || 1;
      for (let j = 0; j <= N; j++) { const a = (j / N) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r, k = (i * (N + 1) + j) * 3; pos[k] = c.x + nx / nl * ca; pos[k + 1] = c.y + ny / nl * ca; pos[k + 2] = cz + sa; }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals();
  }
}
// 有機的な塊: 二十面体をゆがめる
function blob(r, detail, amp, seed, sx = 1, sy = 1, sz = 1) {
  // 二十面体は面ごとに頂点が分かれていて角ばって見える → 頂点を共有させ（mergeVertices）、一段細かくして、なめらかな曲面にする
  let g = new THREE.IcosahedronGeometry(r, Math.min(5, detail + 1));
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amp * (Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.3) + 0.5 * Math.sin(z * 4.3 + seed * 2.1));
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}
// なめらかな輪郭: 点を通る曲線（Catmull-Rom）で回転体の断面を作る
function spline2(pts, n = 40) { const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))); return c.getPoints(n).map((v) => [v.x, Math.max(0, v.y)]); }
// 先細りの管（曲線に沿って、太さを taper(t) で変える）
function taperTube(curve, segs, radial, r, taper) {
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false), pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { const t = Math.floor(i / (radial + 1)) / segs; const c = curve.getPointAt(Math.min(1, t)); v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(Math.max(0.02, taper(t))).add(c); pos.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
// 曲がった角（円錐の代わり。+y 向き・中心が原点・少し反る）
function hornGeo(len, w, bend = 0.28) {
  const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(len * bend * 0.2, 0, 0), new THREE.Vector3(len * bend, len / 2, 0));
  return taperTube(c, 12, 6, w, (t) => 1 - t * 0.94);
}
// 葉の形の刃（花弁・結晶）: 長さ L（+y）、幅 W、厚み D、ふちに丸み
function bladeGeo(L, W, D) {
  const s = new THREE.Shape(); s.moveTo(0, -L / 2);
  s.bezierCurveTo(W * 0.62, -L * 0.3, W * 0.5, L * 0.2, 0, L / 2);
  s.bezierCurveTo(-W * 0.5, L * 0.2, -W * 0.62, -L * 0.3, 0, -L / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelSize: D * 0.45, bevelThickness: D * 0.45, bevelSegments: 3, curveSegments: 24 });
  g.translate(0, 0, -D / 2); g.computeVertexNormals(); return g;
}
// x 軸まわりの回転体（profile: [[x, 半径], ...]）
function latheX(profile, seg = 16) {
  const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
function spikeRing(n, r, len, w, mat, axis = 'z') {
  const grp = new THREE.Group();
  const cg = geo('horn' + len + w, () => hornGeo(len, w)); // まっすぐな円錐をやめ、反った角に
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, m = mesh(cg, mat);
    if (axis === 'z') { m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); m.rotation.z = a - Math.PI / 2; }
    else { m.position.set(0, Math.cos(a) * r, Math.sin(a) * r); m.rotation.x = a; }
    grp.add(m);
  }
  return grp;
}
// 被弾の光（白い殻）。不透明度で 0〜1 を表す（以前は出る／出ないの 2 値だった）
function flashShell(r) {
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uO: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float uO; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float a = (f * 1.3 + 0.12) * uO; gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a, a); }' });
  const m = mesh(geo('flash', () => new THREE.SphereGeometry(1, 24, 16)), mat);
  m.scale.setScalar(r); m.visible = false;
  m.userData.set = (h) => { m.visible = h > 0.02; mat.uniforms.uO.value = h; };
  return m;
}
// ---- 線と光の道具 ----
// 輪郭線: 裏返しにして法線方向へ少し太らせた同じ形を、暗い色で後ろに描く（シルエットに細い線が入る）
let OUTLINE_LEVEL = 2; // 2 = すべて、1 = 自機・SEED・ボス・大きめの敵だけ（VR・スマホ）
export function setOutlineLevel(n) { OUTLINE_LEVEL = n; }
const OL = {};
function outlineMat(w, c) {
  const k = w + '_' + c; if (OL[k]) return OL[k];
  return (OL[k] = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uW: { value: w }, uC: { value: new THREE.Color(c) } },
    vertexShader: 'uniform float uW; void main(){ vec3 p = position + normal * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }' }));
}
export function addOutline(root, w, level = 2, color = 0x010407) {
  if (level > OUTLINE_LEVEL) return root;
  const list = []; root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && o.material && (o.material.isMeshStandardMaterial) && !o.material.transparent) list.push(o); });
  for (const o of list) { const ol = new THREE.Mesh(o.geometry, outlineMat(w, color)); ol.userData.noOutline = true; ol.renderOrder = -1; o.add(ol); }
  return root;
}
// 発光の線の材質（色ごとに 1 つ）
const GL = {};
function glowMat(hex, k = 2) { const key = hex + '_' + k; return GL[key] || (GL[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false })); }
// 流れる光の線: 管の長さ方向（uv.x）に沿って光の粒が流れる
function flowMat(hex, speed = 0.7) {
  return new THREE.ShaderMaterial({ toneMapped: false, uniforms: { uTime: U.time, uC: { value: new THREE.Color(hex) }, uS: { value: speed } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uTime, uS; uniform vec3 uC; varying vec2 vU; void main(){ float p = exp(-pow((fract(vU.x - uTime * uS) - 0.5) * 7.0, 2.0)); gl_FragColor = vec4(uC * (0.9 + p * 2.2), 1.0); }' });
}
// 曲線に沿った細い光の線（両端を細く）
function glowLine(curve, r, mat, segs = 48) { const m = mesh(taperTube(curve, segs, 5, r, (t) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.35)), mat); m.userData.noOutline = true; return m; }
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
// 押し出しの板（x-y の形を厚み d で）
function plateGeo(pts, d, bevel = 0.015) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.translate(0, 0, -d / 2); return g;
}
// 2 点を結ぶ細い棒（光の縁取りに使う）
function strut(a, b, w, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = mesh(geo('strut', () => new THREE.BoxGeometry(1, 1, 1)), mat);
  m.scale.set(len, w, w); m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
  return m;
}

// ---------------------------------------------------------------- 自機 SABLE WREN
// 設計: 細い黒鉄の胴（矢じり形の断面）・前翼（カナード）・奥行きへ後退した主翼・二基の推進器。
// 発光は「翼の前縁の細い線」と「推進器の輪」だけに絞り、輪郭の美しさを光が邪魔しないようにした。
export function buildPlayer() {
  const M = materials(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  // 胴: 点を通る曲線で断面を作った回転体（機首へ細く長く絞る）
  const fus = mesh(geo('pl-fus2', () => { const x = latheX(spline2([[-0.95, 0], [-0.88, 0.1], [-0.55, 0.2], [-0.05, 0.245], [0.45, 0.17], [0.88, 0.06], [1.12, 0.004]], 48), 36); x.scale(1, 0.6, 1); return x; }), M.steel);
  body.add(fus);
  const belly = mesh(geo('pl-belly2', () => { const x = latheX(spline2([[-0.75, 0.02], [-0.3, 0.19], [0.3, 0.15], [0.75, 0.02]], 30), 24); x.scale(1, 0.42, 0.9); return x; }), M.gunmetal); belly.position.y = -0.07; body.add(belly);
  // 風防: 涙のしずく形
  const can = mesh(geo('pl-can2', () => { const x = latheX(spline2([[-0.22, 0], [-0.05, 0.11], [0.25, 0.09], [0.5, 0]], 24), 24); x.scale(1, 0.85, 1.05); return x; }), M.canopy); can.position.set(0.12, 0.1, 0); body.add(can);
  // 主翼: ベジェ曲線の後退翼（前縁は弧を描き、翼端は丸い）
  const wingShape = new THREE.Shape(); wingShape.moveTo(0.42, 0);
  wingShape.bezierCurveTo(0.12, 0.32, -0.3, 0.78, -0.6, 1.0); wingShape.quadraticCurveTo(-0.71, 1.04, -0.74, 0.93);
  wingShape.bezierCurveTo(-0.66, 0.55, -0.6, 0.22, -0.78, 0); wingShape.closePath();
  const wingG = geo('pl-wing2', () => { const e = new THREE.ExtrudeGeometry(wingShape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.018, bevelSegments: 2, curveSegments: 32 }); e.translate(0, 0, -0.0175); e.rotateX(Math.PI / 2); return e; });
  const w1 = mesh(wingG, M.darkSteel), w2 = mesh(wingG, M.darkSteel); w2.scale.z = -1; w1.position.y = w2.position.y = -0.03; body.add(w1, w2);
  // 前縁の光も同じ曲線に沿わせる
  const edgeG = geo('pl-edge2', () => { const c = new THREE.CubicBezierCurve3(new THREE.Vector3(0.4, 0, 0.02), new THREE.Vector3(0.12, 0, 0.32), new THREE.Vector3(-0.3, 0, 0.78), new THREE.Vector3(-0.6, 0, 0.99)); return taperTube(c, 32, 5, 0.014, (t) => 1 - t * 0.5); });
  const flowC = flowMat(0x4fe3ff, 0.6);
  for (const zs of [1, -1]) { const e2 = mesh(edgeG, flowC); e2.userData.noOutline = true; e2.scale.z = zs; e2.position.y = -0.012; body.add(e2); }
  // 後縁の細い光（主翼の後ろの曲線に沿う）と、胴の背骨の光の線（機首へ流れる）
  const trailG = geo('pl-trail', () => taperTube(new THREE.CubicBezierCurve3(V3(-0.74, 0, 0.92), V3(-0.66, 0, 0.55), V3(-0.6, 0, 0.22), V3(-0.78, 0, 0.02)), 32, 5, 0.008, (t) => Math.pow(Math.sin(Math.PI * t), 0.3)));
  for (const zs of [1, -1]) { const tl = mesh(trailG, glowMat(0x7a6bff, 1.6)); tl.userData.noOutline = true; tl.scale.z = zs; tl.position.y = -0.012; body.add(tl); }
  body.add(glowLine(new THREE.CatmullRomCurve3([V3(-0.82, 0.075), V3(-0.5, 0.128), V3(0.0, 0.152), V3(0.45, 0.108), V3(0.92, 0.035)]), 0.009, flowMat(0x9ff6ff, 0.9), 64));
  // 前翼（曲線）と、外へ開く二枚の曲線の背びれ
  const canS = new THREE.Shape(); canS.moveTo(0.2, 0); canS.quadraticCurveTo(0.02, 0.18, -0.14, 0.34); canS.quadraticCurveTo(-0.2, 0.3, -0.12, 0); canS.closePath();
  const canG = geo('pl-canard2', () => { const e = new THREE.ExtrudeGeometry(canS, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 16 }); e.rotateX(Math.PI / 2); return e; });
  const c1 = mesh(canG, M.darkSteel), c2 = mesh(canG, M.darkSteel); c2.scale.z = -1; c1.position.set(0.52, 0, 0); c2.position.set(0.52, 0, 0); body.add(c1, c2);
  const finS = new THREE.Shape(); finS.moveTo(-0.15, 0); finS.bezierCurveTo(-0.32, 0.12, -0.55, 0.36, -0.8, 0.42); finS.quadraticCurveTo(-0.72, 0.2, -0.7, 0); finS.closePath();
  const finG = geo('pl-fin2', () => { const e = new THREE.ExtrudeGeometry(finS, { depth: 0.022, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 20 }); e.translate(0, 0, -0.011); return e; });
  for (const zs of [1, -1]) { const f = mesh(finG, M.gunmetal); f.position.set(0, 0.08, 0.12 * zs); f.rotation.x = -0.32 * zs; body.add(f); }
  // 推進器: 曲線の断面のナセル＋光の輪
  const engG = geo('pl-eng2', () => latheX(spline2([[-0.44, 0.1], [-0.36, 0.135], [0.0, 0.125], [0.3, 0.05], [0.4, 0.0]], 24), 20));
  const ringG = geo('pl-ring', () => new THREE.TorusGeometry(0.105, 0.022, 8, 28));
  const flameG = geo('pl-flame', () => { const c = new THREE.ConeGeometry(0.085, 0.8, 12, 1, true); c.rotateZ(Math.PI / 2); c.translate(-0.4, 0, 0); return c; });
  const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fe8ff).multiplyScalar(2), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fe8ff).multiplyScalar(2.2), toneMapped: false });
  const flames = [];
  for (const z of [0.29, -0.29]) {
    const e = mesh(engG, M.gunmetal); e.position.set(-0.52, -0.04, z); body.add(e);
    const r = mesh(ringG, ringM); r.rotation.y = Math.PI / 2; r.position.set(-0.96, -0.04, z); body.add(r);
    const f = mesh(flameG, flameM); f.position.set(-0.96, -0.04, z); body.add(f); flames.push(f);
  }
  const chargeOrb = mesh(geo('pl-charge', () => new THREE.SphereGeometry(1, 20, 14)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(2.5), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  chargeOrb.position.set(1.15, 0, 0); chargeOrb.visible = false; g.add(chargeOrb);
  addOutline(body, 0.016, 1);
  // ばね: 上下の速度で機体を傾け（ロール）、機首を少し上げ下げ（ピッチ）、前後の速度で炎の長さ
  const roll = { x: 0, v: 0 }, pitch = { x: 0, v: 0 }, thrust = { x: 0.5, v: 0 };
  let chargeVis = 0;
  return {
    obj: g,
    anim(p, t, a = 1, dt = 1 / 60, ctx = {}) {
      const vx = ctx.vx || 0, vy = ctx.vy || 0;
      body.rotation.x = spring(roll, Math.max(-0.8, Math.min(0.8, -vy * 0.075)), 16, dt);
      body.rotation.z = spring(pitch, Math.max(-0.16, Math.min(0.16, vy * 0.014)), 12, dt);
      const th = spring(thrust, 0.55 + Math.max(-0.35, Math.min(0.6, vx * 0.05)), 18, dt, 0.9);
      for (let k = 0; k < 2; k++) { const f = flames[k]; f.scale.set(Math.max(0.15, th) * (0.92 + 0.08 * Math.sin(t * 70 + k * 2.1)), 1, 1); f.material.opacity = 0.45 + 0.35 * th; }
      chargeVis = damp(chargeVis, p.charge, 20, dt);
      chargeOrb.visible = chargeVis > 0.04;
      if (chargeOrb.visible) { const k = 0.12 + chargeVis * 0.42 + Math.sin(t * 40) * 0.025 * chargeVis; chargeOrb.scale.setScalar(k); chargeOrb.material.opacity = 0.3 + chargeVis * 0.5; }
      g.visible = p.alive && !(p.inv > 0 && Math.floor(t * 20) % 2 === 0);
    },
  };
}

// ---------------------------------------------------------------- SEED（着脱ユニット）
export function buildPod() {
  const M = materials(), g = new THREE.Group(), sway = new THREE.Group(); g.add(sway);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const core = mesh(geo('pod-core', () => new THREE.IcosahedronGeometry(0.3, 2)), coreMat); sway.add(core);
  const inner = mesh(geo('pod-inner', () => blob(0.42, 2, 0.12, 2.3)), M.fleshViolet); sway.add(inner);
  const cage = new THREE.Group(); sway.add(cage);
  const petalG = geo('pod-petal', () => { const s = new THREE.SphereGeometry(0.72, 12, 12, 0, Math.PI / 3 * 0.72, Math.PI * 0.12, Math.PI * 0.76); s.rotateZ(Math.PI / 2); return s; });
  const petalMat = M.steel.clone(); petalMat.side = THREE.DoubleSide; petalMat.onBeforeCompile = M.steel.onBeforeCompile; petalMat.customProgramCacheKey = M.steel.customProgramCacheKey;
  for (let k = 0; k < 6; k++) { const p = mesh(petalG, petalMat); p.rotation.x = (k / 6) * Math.PI * 2; cage.add(p); }
  const spikes = spikeRing(6, 0.7, 0.26, 0.06, M.darkSteel, 'x'); spikes.rotation.z = -Math.PI / 2; cage.add(spikes);
  const edgeM = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  for (let k = 0; k < 6; k++) for (const ph of [0, Math.PI / 3 * 0.72]) {
    const phi = (k / 6) * Math.PI * 2 + ph, pts = [];
    for (let i = 0; i <= 16; i++) { const th = Math.PI * (0.12 + 0.76 * i / 16); pts.push(V3(-Math.cos(th) * 0.735, Math.sin(th) * 0.735 * Math.cos(phi), Math.sin(th) * 0.735 * Math.sin(phi))); }
    cage.add(glowLine(new THREE.CatmullRomCurve3(pts), 0.012, edgeM, 24));
  }
  addOutline(cage, 0.018, 1);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = mesh(geo('pod-ring', () => new THREE.TorusGeometry(0.86, 0.025, 6, 48)), ringM); ring.rotation.y = Math.PI / 2; sway.add(ring);
  const col = new THREE.Color(), tcol = new THREE.Color();
  let yaw = 0, spin = 2.2, cageA = 0, prevState = null, punch = 0, punchT = 1;
  return {
    obj: g,
    anim(pod, t, a = 1, dt = 1 / 60, ctx = {}) {
      // 色はなめらかに移る（結晶の色が変わった瞬間に飛ばない）
      tcol.set(colorOf[pod.level > 0 ? pod.color : 'P']); col.lerp(tcol, 1 - Math.exp(-10 * dt));
      coreMat.color.copy(col).multiplyScalar(2.2 + Math.sin(t * 9) * 0.5);
      ringM.color.copy(col).multiplyScalar(1.5); edgeM.color.copy(col).multiplyScalar(1.3 + 0.4 * Math.sin(t * 4));
      // 殻の回転速度も減衰で追う（切り離した瞬間に急に回り出さない）
      const fast = pod.state === 'launch' || pod.state === 'return' || pod.state === 'enter';
      spin = damp(spin, fast ? 16 : 2.2, 6, dt); cageA += spin * dt; cage.rotation.x = cageA;
      // 前⇔後ろの付け替えは弧を描いて振り向く
      const facing = pod.state === 'back' ? Math.PI : 0;
      yaw = dampAngle(yaw, facing, 9, dt); g.rotation.y = yaw;
      // 装着した瞬間に「カチッ」と弾む
      if ((pod.state === 'front' || pod.state === 'back') && prevState && prevState !== 'front' && prevState !== 'back') { punch = 1; punchT = 0; }
      prevState = pod.state;
      punchT += dt; punch = Math.exp(-7 * punchT);
      const sq = 1 + 0.2 * punch * Math.cos(punchT * 28);
      sway.scale.set(sq, 2 - sq, 2 - sq);
      // 移動方向へわずかに傾く
      sway.rotation.z = damp(sway.rotation.z, Math.max(-0.4, Math.min(0.4, (ctx.vy || 0) * 0.03)), 10, dt);
      ring.scale.setScalar(1 + 0.08 * Math.sin(t * 5) + pod.level * 0.06);
      inner.rotation.y = t * 0.7;
    },
  };
}

export function buildBit() {
  const M = materials(), g = new THREE.Group();
  g.add(mesh(geo('bit-b', () => blob(0.26, 2, 0.1, 5.1)), M.chitin));
  const eye = mesh(geo('bit-e', () => new THREE.SphereGeometry(0.11, 12, 8)), M.gBio); eye.position.x = 0.18; g.add(eye);
  const r = mesh(geo('bit-r', () => new THREE.TorusGeometry(0.4, 0.028, 6, 32)), M.gBio); g.add(r);
  const r2 = mesh(geo('bit-r2', () => new THREE.TorusGeometry(0.32, 0.018, 6, 28)), M.steel); g.add(r2);
  const r3 = mesh(geo('bit-r3', () => new THREE.TorusGeometry(0.47, 0.012, 6, 40)), glowMat(0xb6ffd8, 1.4)); g.add(r3);
  const tilt = { x: 0, v: 0 };
  return { obj: g, anim(b, t, a = 1, dt = 1 / 60, ctx = {}) { r.rotation.x = t * 3; r.rotation.y = t * 2; r2.rotation.y = -t * 2.6; r2.rotation.x = 0.6; r3.rotation.x = -t * 2.2; r3.rotation.z = t * 1.4; g.rotation.z = spring(tilt, Math.max(-0.6, Math.min(0.6, (ctx.vy || 0) * 0.05)), 10, dt) + Math.sin(t * 2 + b.side) * 0.12; } };
}

// ---------------------------------------------------------------- 雑魚敵
// face: true の敵は、world 側が「描画上の進行方向」へなめらかに向ける（model は -x 向きで作る）
const B = {};
B.drifter = () => {
  const M = materials(), g = new THREE.Group();
  const b = mesh(geo('dr-b2', () => { const x = latheX(spline2([[-0.52, 0], [-0.44, 0.2], [-0.15, 0.33], [0.25, 0.24], [0.6, 0.07], [0.78, 0]], 36), 24); x.scale(1, 0.85, 0.85); return x; }), M.chitin); g.add(b);
  b.add(glowLine(new THREE.CatmullRomCurve3([V3(-0.44, 0.175), V3(-0.15, 0.285), V3(0.25, 0.21), V3(0.6, 0.065), V3(0.76, 0.01)]), 0.014, glowMat(0x7dffb0, 1.5), 32));
  const collar = mesh(geo('dr-c', () => new THREE.TorusGeometry(0.33, 0.045, 6, 20)), M.bone); collar.rotation.y = Math.PI / 2; collar.position.x = 0.12; g.add(collar);
  const sp = spikeRing(5, 0.3, 0.42, 0.06, M.bone, 'x'); sp.position.x = 0.38; sp.rotation.z = -Math.PI / 2; g.add(sp);
  const eye = mesh(geo('dr-e', () => new THREE.SphereGeometry(0.12, 12, 8)), M.gEye); eye.position.x = -0.42; g.add(eye);
  const blink = makeBlink(Math.random() * 9);
  return { face: true, organic: true, chains: [{ ax: 0.42, ay: 0.12, n: 5, seg: 0.2, r: 0.05, mat: 'teal' }, { ax: 0.42, ay: -0.12, n: 5, seg: 0.2, r: 0.05, mat: 'teal' }],
    obj: g, anim(e, t, a = 1, dt = 1 / 60, ctx = {}) { const v = Math.hypot(ctx.vx || 0, ctx.vy || 0); blinkEye(eye, blink(dt, ctx.recoil || 0)); const br = 1 + breath(t, e.id) * 0.04; b.scale.set(br, 2 - br, br); b.rotation.x = t * 3 + e.i; collar.rotation.x = t * 3 + e.i; sp.rotation.x = Math.sin(t * (5 + v * 0.8) + e.i) * (0.2 + v * 0.03); sp.scale.setScalar(1 - Math.min(0.25, v * 0.02)); } };
};
B.hookjaw = () => {
  const M = materials(), g = new THREE.Group();
  const hook = mesh(geo('hj-h2', () => { const pts = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 1.3; pts.push(new THREE.Vector3(Math.cos(a) * 0.44, Math.sin(a) * 0.44 * (1 - k / 60), 0)); } return taperTube(new THREE.CatmullRomCurve3(pts), 40, 10, 0.12, (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.7)); }), M.steel); hook.rotation.z = Math.PI * 0.4; g.add(hook);
  { const pts = []; for (let k = 0; k <= 16; k++) { const a2 = k / 16 * Math.PI * 1.3; pts.push(V3(Math.cos(a2) * 0.335, Math.sin(a2) * 0.335 * (1 - k / 60), 0.03)); } hook.add(glowLine(new THREE.CatmullRomCurve3(pts), 0.012, glowMat(0xff3a5a, 1.7), 40)); }
  const head = mesh(geo('hj-head', () => blob(0.26, 2, 0.12, 3.3)), M.flesh); head.position.x = -0.15; g.add(head);
  const jawG = geo('hj-j', () => { const c = new THREE.ConeGeometry(0.07, 0.42, 6); c.rotateZ(Math.PI / 2); return c; });
  const j1 = mesh(jawG, M.bone), j2 = mesh(jawG, M.bone); j1.position.set(-0.45, 0.1, 0); j2.position.set(-0.45, -0.1, 0); g.add(j1, j2);
  const eye = mesh(geo('hj-e', () => new THREE.SphereGeometry(0.07, 8, 6)), M.gEye); eye.position.set(-0.3, 0.12, 0.15); g.add(eye);
  const blink = makeBlink(Math.random() * 9); let gape = 0.2;
  return { face: true, organic: true, obj: g, anim(e, t, a = 1, dt = 1 / 60, ctx = {}) { const d = Math.hypot(ctx.lookX ?? 9, ctx.lookY ?? 0); gape = damp(gape, e.turn ? 0.35 + Math.max(0, 1 - d / 7) * 0.6 : 0.2, 8, dt); const bite = gape + Math.sin(t * (e.turn ? 22 : 9)) * (e.turn ? 0.2 : 0.06); j1.rotation.z = bite; j2.rotation.z = -bite; blinkEye(eye, blink(dt, e.turn ? 1 : 0)); } };
};
B.lantern = (e) => {
  const M = materials(), g = new THREE.Group();
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorOf[e.drop] || 0xffffff).multiplyScalar(2.5), toneMapped: false });
  const core = mesh(geo('ln-c', () => new THREE.OctahedronGeometry(0.3, 0)), coreM); g.add(core);
  const ringG = geo('ln-r', () => new THREE.TorusGeometry(0.58, 0.05, 8, 32));
  const rings = [0, 1, 2].map((k) => { const r = mesh(ringG, M.bone); r.rotation.y = k * Math.PI / 3; g.add(r); return r; });
  const cap = mesh(geo('ln-cap', () => new THREE.ConeGeometry(0.3, 0.3, 10)), M.gunmetal); cap.position.y = 0.62; g.add(cap);
  const cap2 = cap.clone(); cap2.rotation.z = Math.PI; cap2.position.y = -0.62; g.add(cap2);
  const c0 = coreM.color.clone();
  return { chains: [-0.25, 0, 0.25].map((ax) => ({ ax, ay: -0.62, n: 6, seg: 0.22, r: 0.045, mat: 'bone', bx: 0, by: -5 })),
    obj: g, anim(e2, t) { core.rotation.y = t * 3; core.rotation.x = t * 2; g.rotation.y = t * 0.8; for (const r of rings) r.rotation.x = Math.sin(t) * 0.2; const fl = 0.85 + 0.15 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1); coreM.color.copy(c0).multiplyScalar(fl); } };
};
B.nodule = () => {
  const M = materials(), g = new THREE.Group();
  const dome = mesh(geo('nd-d', () => new THREE.SphereGeometry(0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.chitin); dome.position.y = -0.3; g.add(dome);
  const base = mesh(geo('nd-b', () => blob(0.5, 2, 0.2, 4.4, 1.4, 0.5, 1.3)), M.flesh); base.position.y = -0.45; g.add(base);
  const barrel = new THREE.Group(); barrel.position.y = -0.05; g.add(barrel);
  barrel.add(mesh(geo('nd-bar', () => { const c = new THREE.CylinderGeometry(0.08, 0.11, 0.7, 10); c.rotateZ(Math.PI / 2); c.translate(0.35, 0, 0); return c; }), M.gunmetal));
  const eye = mesh(geo('nd-e', () => new THREE.SphereGeometry(0.13, 12, 8)), M.gEye); eye.position.y = 0.12; g.add(eye);
  let ang = null; const eyeBase = eye.position.clone(); const blink = makeBlink(Math.random() * 9);
  return { chains: [{ ax: -0.3, ay: 0.15, n: 4, seg: 0.2, r: 0.035, mat: 'flesh', bx: 0, by: 3 }, { ax: 0.3, ay: 0.15, n: 4, seg: 0.2, r: 0.035, mat: 'flesh', bx: 0, by: 3 }], obj: g, anim(e, t, a = 1, dt = 1 / 60, ctx = {}) { g.rotation.z = e.flip ? Math.PI : 0; const target = lang(e, a); ang = ang == null ? target : dampAngle(ang, target, 14, dt); barrel.rotation.z = e.flip ? ang + Math.PI : ang;
    const tell = e.cd < 24 ? 1 - e.cd / 24 : 0; blinkEye(eye, blink(dt, tell), 1 + Math.sin(t * 6) * 0.05 + tell * 0.45 + Math.sin(t * 40) * 0.08 * tell); lookAt(eye, eyeBase, ctx, 0.08, e.flip, dt); } };
};
B.stilter = () => {
  const M = materials(), g = new THREE.Group();
  const body = mesh(geo('st-b', () => blob(0.5, 2, 0.1, 6.1, 1.3, 0.7, 0.9)), M.gunmetal); body.position.y = 0.15; g.add(body);
  const eye = mesh(geo('st-e', () => new THREE.SphereGeometry(0.12, 12, 8)), M.gEye); eye.position.set(-0.45, 0.25, 0); g.add(eye);
  const segG = geo('st-seg', () => { const c = new THREE.CylinderGeometry(1, 0.8, 1, 8); return c; });
  const joints = geo('st-j', () => new THREE.SphereGeometry(0.07, 8, 6));
  const A = 0.5, Bn = 0.55, FLOOR = -0.88;   // 腿・すねの長さ、足の高さ（ローカル）
  const legs = [-0.38, 0, 0.38].map((hx, k) => {
    const thigh = mesh(segG, M.steel), shin = mesh(segG, M.steel), knee = mesh(joints, M.darkSteel);
    const z = k === 1 ? 0.28 : -0.2; g.add(thigh, shin, knee);
    return { hx, z, thigh, shin, knee, rest: hx * 1.7, fw: null, lift: 0, from: 0, to: 0, t: 1 };
  });
  let sq = { x: 1, v: 0 }; const eyeBase = eye.position.clone(); const blink = makeBlink(Math.random() * 9);
  return { obj: g, anim(e, t, a = 1, dt = 1 / 60, ctx = {}) {
    g.rotation.z = e.flip ? Math.PI : 0;
    const sgn = e.flip ? -1 : 1, bx = ctx.x ?? 0;
    const crouch = e.crouch > 0 ? 1 - e.crouch / 12 : 0, land = e.land > 0 ? e.land / 12 : 0;
    const k = spring(sq, 1 - crouch * 0.35 - land * 0.3 + (e.air ? 0.12 : 0), 22, dt, 0.45);
    body.scale.set(1 + (1 - k) * 0.5, k, 1 + (1 - k) * 0.3);
    const hy = 0.12 - (1 - k) * 0.35;
    body.position.y = hy + 0.05;
    const walkDir = Math.sign(e.wv || 0) * sgn;
    legs.forEach((L, i) => {
      // 足の位置は盤面座標で覚えておく（体が動いても足は地面に残る）
      if (L.fw == null) L.fw = bx + L.rest * sgn;
      let fx = (L.fw - bx) * sgn, fy = FLOOR;
      if (e.air) { L.fw = bx + (L.rest * 0.6) * sgn; fx = L.rest * 0.6; fy = FLOOR + 0.35; L.t = 1; }
      else {
        // 離れすぎたら踏み出す（隣の脚と同時には上げない）
        const busy = legs.some((o) => o !== L && o.t < 1);
        if (L.t >= 1 && !busy && Math.abs(fx - L.rest) > 0.3) { L.from = L.fw; L.to = bx + (L.rest + walkDir * 0.22) * sgn; L.t = 0; }
        if (L.t < 1) { L.t = Math.min(1, L.t + dt / 0.13); const u = L.t * L.t * (3 - 2 * L.t); L.fw = L.from + (L.to - L.from) * u; fx = (L.fw - bx) * sgn; fy = FLOOR + Math.sin(L.t * Math.PI) * 0.22; }
      }
      // 2 関節の逆運動学（膝は上へ曲がる）
      const dx = fx - L.hx, dy = fy - hy; let d = Math.hypot(dx, dy); d = Math.min(d, A + Bn - 0.01);
      const th = Math.atan2(dy, dx), cosA = (A * A + d * d - Bn * Bn) / (2 * A * d), phi = Math.acos(Math.max(-1, Math.min(1, cosA)));
      const bend = L.hx < 0 ? -1 : 1, ta = th + phi * bend;   // 膝は上・外側へ
      const kx = L.hx + Math.cos(ta) * A, ky = hy + Math.sin(ta) * A;
      setLink(L.thigh, L.hx, hy, L.z, kx, ky, L.z, 0.05);
      setLink(L.shin, kx, ky, L.z, fx, fy, L.z, 0.04);
      L.knee.position.set(kx, ky, L.z);
    });
    blinkEye(eye, blink(dt, crouch)); lookAt(eye, eyeBase, ctx, 0.06, e.flip, dt);
  } };
};
B.puff = () => {
  const M = materials(), g = new THREE.Group();
  const b = mesh(geo('pf-b', () => blob(0.85, 3, 0.14, 8.8)), M.fleshTeal); g.add(b);
  const pores = spikeRing(8, 0.82, 0.18, 0.09, M.gBio); g.add(pores);
  return { organic: true, obj: g, anim(e, t) { const k = 1 + breath(t * 1.6, e.id) * 0.07; b.scale.set(k, 2 - k, k); g.rotation.z = t * 0.4; pores.scale.setScalar(1 + breath(t * 2.3, e.id + 3) * 0.12); } };
};
B.spore = () => { const M = materials(), g = new THREE.Group(); const b = mesh(geo('sp-b', () => blob(0.26, 2, 0.2, 2.2, 1.3, 0.85, 0.85)), M.fleshTeal); g.add(b); const c = mesh(geo('sp-c', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gBio); c.position.x = -0.18; g.add(c); return { face: true, organic: true, obj: g, anim(e, t) { b.rotation.x = t * 6; } }; };
B.nit = () => { const M = materials(), g = new THREE.Group(); const b = mesh(geo('nt-b', () => { const x = new THREE.TetrahedronGeometry(0.3, 0); x.scale(1.3, 0.8, 0.8); return x; }), M.chitin); g.add(b); const c = mesh(geo('nt-c', () => new THREE.SphereGeometry(0.09, 8, 6)), M.gEye); c.position.x = -0.22; g.add(c); const wm = new THREE.MeshBasicMaterial({ color: 0x9dffd0, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); const wingG = geo('nt-w', () => { const x = new THREE.PlaneGeometry(0.42, 0.16); x.translate(0.06, 0, 0.1); x.rotateX(Math.PI / 2); return x; }); const wings = [1, -1].map((sg) => { const w = mesh(wingG, wm); w.scale.z = sg; w.position.y = 0.08; g.add(w); return w; }); return { face: true, organic: true, obj: g, anim(e, t) { const fl = Math.sin(t * 70) * 0.9; wings[0].rotation.x = fl; wings[1].rotation.x = -fl; const w = e.windup || 0; b.rotation.x = t * (8 + w * 30); b.position.y = Math.sin(t * 90) * 0.04 * w; c.scale.setScalar(1 + w * 1.2); } }; };
B.dart = () => { const M = materials(), g = new THREE.Group(); g.add(mesh(geo('dt-b2', () => { const x = latheX(spline2([[-0.4, 0], [-0.25, 0.1], [0.1, 0.15], [0.3, 0.08], [0.36, 0]], 24), 16); return x; }), M.steel)); const stripe = mesh(geo('dt-st', () => { const x = new THREE.TorusGeometry(0.152, 0.012, 6, 28); x.rotateY(Math.PI / 2); return x; }), glowMat(0xffb347, 1.8)); stripe.position.x = 0.02; g.add(stripe); const fins = spikeRing(3, 0.12, 0.25, 0.05, M.darkSteel, 'x'); fins.position.x = 0.25; fins.rotation.z = -Math.PI / 2; g.add(fins); const f = mesh(geo('dt-f', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gAmber); f.position.x = 0.38; g.add(f); return { face: true, obj: g, anim(e, t) { fins.rotation.x = t * 10; const k = Math.min(1, (e.spd || 3) / 10); f.scale.set(1 + k * 2.5, 1 + k * 0.3, 1 + k * 0.3); f.position.x = 0.38 + k * 0.15; } }; };
B.coilworm = (e) => {
  const M = materials(), g = new THREE.Group();
  const head = new THREE.Group(); g.add(head);
  head.add(mesh(geo('cw-h', () => blob(0.7, 3, 0.1, 3.9, 1.3, 0.9, 0.9)), M.flesh));
  const jaw = spikeRing(4, 0.45, 0.5, 0.09, M.bone, 'x'); jaw.position.x = -0.7; jaw.rotation.z = Math.PI / 2; head.add(jaw);
  const eye = mesh(geo('cw-e', () => new THREE.SphereGeometry(0.16, 12, 8)), M.gEye); eye.position.set(-0.55, 0.25, 0.3); head.add(eye);
  const eye2 = eye.clone(); eye2.position.z = -0.3; head.add(eye2);
  const segG = geo('cw-s', () => blob(0.58, 2, 0.08, 1.1)), bandG = geo('cw-band', () => new THREE.TorusGeometry(0.5, 0.08, 8, 24));
  const segs = [], links = [];
  for (let k = 1; k < e.parts.length; k++) { const l = linkMesh(M.flesh); g.add(l); links.push(l); }
  for (let k = 1; k < e.parts.length; k++) {
    const s = new THREE.Group(); const band = mesh(bandG, M.steel); band.rotation.y = Math.PI / 2; s.add(band);
    s.scale.setScalar(e.parts[k].r / 0.6); g.add(s); segs.push(s);
  }
  const cwBody = new SplineBody(48, 14, M.fleshTeal); g.add(cwBody.mesh);
  const cwLine = new SplineBody(48, 5, flowMat(0x5cffc8, 0.5), 0.92, 0.07); cwLine.mesh.userData.noOutline = true; g.add(cwLine.mesh);
  for (const l of links) l.visible = false;
  return {
    obj: g, anim(e2, t, a = 1) {
      // 節は補間した位置に置き、前の節の方向へ向ける（帯が胴の流れに沿う）
      for (let k = 1; k < e2.parts.length; k++) {
        const p = e2.parts[k], q = e2.parts[k - 1], s = segs[k - 1];
        const x = lx(p, a), y = ly(p, a);
        s.position.set(x, y, 0);
        s.rotation.set(t * 2 + k, 0, Math.atan2(ly(q, a) - y, lx(q, a) - x));
        const pulse = 1 + 0.07 * Math.sin(t * 7 - k * 0.8); s.scale.setScalar((e2.parts[k].r / 0.6) * pulse);
        setLink(links[k - 1], x, y, 0, lx(q, a), ly(q, a), 0, e2.parts[k].r * 0.55);
      }
      { const x1 = lx(e2.parts[1], a), y1 = ly(e2.parts[1], a); if (x1 * x1 + y1 * y1 > 1e-4) head.rotation.z = Math.atan2(-y1, -x1) - Math.PI; }
      jaw.rotation.x = Math.sin(t * 6) * 0.4;
      { const pts = [{ x: -0.2, y: 0, r: 0.5 }, ...segs.map((q, k) => ({ x: q.position.x, y: q.position.y, r: e2.parts[k + 1].r * 0.86 * (1 + 0.06 * Math.sin(t * 7 - k * 0.8)) }))]; cwBody.update(pts); cwLine.update(pts); }
    },
  };
};
B.hatcher = () => {
  const M = materials(), g = new THREE.Group();
  const sac = mesh(geo('ht-s', () => blob(1.05, 3, 0.12, 5.5, 1.2, 0.9, 1)), M.fleshBig); sac.position.y = -0.3; g.add(sac);
  const lips = spikeRing(7, 0.4, 0.5, 0.11, M.bone, 'x'); lips.position.y = 0.55; lips.rotation.z = Math.PI / 2; lips.rotation.y = Math.PI / 2; g.add(lips);
  const mouth = mesh(geo('ht-m', () => new THREE.SphereGeometry(0.3, 14, 10)), M.gBio); mouth.position.y = 0.5; g.add(mouth);
  let contract = 0, lastCd = 99;
  return { obj: g, anim(e, t, a = 1, dt = 1 / 60) {
    g.rotation.z = e.flip ? Math.PI : 0;
    if (e.cd > lastCd) contract = 1; lastCd = e.cd;           // 産んだ瞬間に袋が縮む
    contract = damp(contract, 0, 5, dt);
    const swell = e.cd < 18 ? 1 - e.cd / 18 : 0;              // 産む前に口がふくらむ
    const k = 1 + breath(t * 1.4, 7) * 0.05 + swell * 0.08 - contract * 0.12 + (swell > 0.6 ? Math.sin(t * 47) * 0.025 : 0);
    sac.scale.set(k, 2 - k, k);
    mouth.scale.setScalar(0.6 + swell * 0.7 + Math.sin(t * 6) * 0.08);
    lips.scale.setScalar(1 + swell * 0.35);
  } };
};
// バルワーク: 二枚貝の装甲殻。殻に補強の肋、合わせ目に赤い光（開くほど強く）
B.bulwark = () => {
  const M = materials(), g = new THREE.Group();
  const core = mesh(geo('bw-c', () => new THREE.IcosahedronGeometry(0.55, 2)), M.gRed); g.add(core);
  const shellG = geo('bw-s', () => new THREE.SphereGeometry(1.08, 28, 16, 0, Math.PI));
  const shellM = M.gunmetal.clone(); shellM.side = THREE.DoubleSide; shellM.onBeforeCompile = M.gunmetal.onBeforeCompile; shellM.customProgramCacheKey = M.gunmetal.customProgramCacheKey;
  const ribG = geo('bw-rib', () => new THREE.TorusGeometry(1.1, 0.045, 6, 28, Math.PI));
  const halves = [1, -1].map((sg) => {
    const pv = new THREE.Group(), sh = mesh(shellG, shellM); sh.rotation.x = -sg * Math.PI / 2; pv.add(sh);
    for (const k of [0.35, 1.05, 1.75, 2.45]) { const r = mesh(ribG, M.steel); r.rotation.set(sg > 0 ? 0 : Math.PI, k, 0); pv.add(r); }
    g.add(pv); return pv;
  });
  const seamM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3048).multiplyScalar(2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const seam = mesh(geo('bw-seam', () => new THREE.TorusGeometry(1.0, 0.05, 6, 40)), seamM); seam.rotation.x = Math.PI / 2; g.add(seam);
  const spikes = spikeRing(10, 1.08, 0.3, 0.07, M.darkSteel); g.add(spikes);
  let open = 0, wasOpen = 0;
  return { obj: g, anim(e, t, a = 1, dt = 1 / 60, ctx = {}) { const step = Math.round(e.open * 5) / 5; open = damp(open, step, 26, dt); const o = open * 0.85; if (e.open > 0.12 && wasOpen <= 0.12 && ctx.emit) { ctx.emit('steam', -0.9, 0.2); ctx.emit('steam', -0.9, -0.2); } wasOpen = e.open; halves[0].rotation.z = o; halves[1].rotation.z = -o; core.rotation.y = t * 2; core.scale.setScalar(0.8 + open * 0.4); seamM.opacity = Math.min(1, 0.25 + open * 1.5); const c = e.t % 170, tr = c > 96 && c < 112 ? 1 : 0; spikes.rotation.z = t * 0.3 + Math.sin(t * 60) * 0.04 * tr; spikes.scale.setScalar(1 + tr * 0.08); } };
};
// シスル: 金属の芯から針。針の付け根だけが琥珀に光る（以前の黄一色の芯は強すぎた）
B.thistle = () => {
  const M = materials(), g = new THREE.Group();
  g.add(mesh(geo('th-b', () => new THREE.IcosahedronGeometry(0.3, 1)), M.gunmetal));
  const glowC = mesh(geo('th-g', () => new THREE.SphereGeometry(0.17, 12, 8)), M.gAmber); g.add(glowC);
  g.add(spikeRing(8, 0.34, 0.5, 0.05, M.steel));
  g.add(spikeRing(8, 0.34, 0.5, 0.05, M.steel, 'x'));
  const tipG = geo('th-t', () => new THREE.SphereGeometry(0.045, 6, 4));
  for (let k = 0; k < 8; k++) { const a2 = k / 8 * Math.PI * 2; const m = mesh(tipG, M.gAmber); m.position.set(Math.cos(a2) * 0.3, Math.sin(a2) * 0.3, 0); g.add(m); }
  const spk = g.children.filter((c) => c.isGroup); return { obj: g, anim(e, t) { const arm = e.arm ? 1 - e.arm / 24 : 0; for (const q of spk) q.scale.setScalar(0.85 + 0.15 * breath(t * 1.3, e.id) + arm * 0.5); g.rotation.z = t * (1.5 + arm * 10); g.rotation.y = t; glowC.scale.setScalar(0.85 + 0.25 * Math.max(0, Math.sin(t * 8)) + arm * (1.2 + Math.sin(t * 50) * 0.4)); g.scale.setScalar(1 + arm * 0.35); } };
};
B.skimmer = () => {
  const M = materials(), g = new THREE.Group();
  g.add(mesh(geo('sk-b2', () => { const c = latheX(spline2([[-0.62, 0], [-0.4, 0.1], [0.05, 0.15], [0.42, 0.1], [0.55, 0]], 30), 20); c.scale(1, 0.5, 1); c.rotateY(Math.PI); return c; }), M.steel));
  const w = mesh(geo('sk-w2', () => { const sh = new THREE.Shape(); sh.moveTo(-0.32, 0); sh.bezierCurveTo(-0.1, 0.15, 0.15, 0.45, 0.4, 0.58); sh.quadraticCurveTo(0.42, 0.4, 0.32, 0); sh.closePath(); const e = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 20 }); e.rotateX(Math.PI / 2); return e; }), M.darkSteel);
  const w2 = mesh(w.geometry, M.darkSteel); w2.scale.z = -1; g.add(w, w2);
  const skE = geo('sk-edge', () => taperTube(new THREE.CubicBezierCurve3(V3(-0.32, 0, 0), V3(-0.1, 0, 0.15), V3(0.15, 0, 0.45), V3(0.4, 0, 0.58)), 24, 5, 0.012, (t) => Math.pow(Math.sin(Math.PI * t), 0.3)));
  for (const zs of [1, -1]) { const e = mesh(skE, glowMat(0xff6ac8, 1.6)); e.userData.noOutline = true; e.scale.z = zs; e.position.y = 0.02; g.add(e); }
  const f = mesh(geo('sk-f', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gMagenta); f.position.x = 0.55; g.add(f);
  return { face: true, obj: g, anim() {} };
};
B.cannon = () => {
  const M = materials(), g = new THREE.Group();
  const base = mesh(geo('cn-b', () => new THREE.CylinderGeometry(0.85, 1.0, 0.4, 16)), M.hull); base.position.y = -0.4; g.add(base);
  const tur = mesh(geo('cn-t', () => new THREE.SphereGeometry(0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.gunmetal); tur.position.y = -0.25; g.add(tur);
  const bar = new THREE.Group(); bar.position.y = 0.05; g.add(bar);
  const bg = geo('cn-bar', () => { const c = new THREE.CylinderGeometry(0.09, 0.12, 1.1, 10); c.rotateZ(Math.PI / 2); c.translate(0.55, 0, 0); return c; });
  const barrels = [0.16, -0.16].map((z) => { const b = mesh(bg, M.steel); b.position.z = z; bar.add(b); return b; });
  const lamp = mesh(geo('cn-l', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gAmber); lamp.position.set(0, 0.25, 0.4); g.add(lamp);
  const heatM = new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const heats = barrels.map((b) => { const h = mesh(geo('cn-h', () => new THREE.SphereGeometry(0.13, 10, 8)), heatM); h.position.x = 1.08; b.add(h); return h; });
  let ang = null, recoil = 0, lastBurst = 0, heat = 0, smokeT = 0;
  return { obj: g, anim(e, t, a = 1, dt = 1 / 60, ctx = {}) {
    g.rotation.z = e.flip ? Math.PI : 0;
    const target = lang(e, a); ang = ang == null ? target : dampAngle(ang, target, 16, dt);
    bar.rotation.z = e.flip ? ang + Math.PI : ang;
    // 撃つたびに砲身が後ろへ下がって戻る
    if (e.burst !== lastBurst && e.burst < lastBurst) { recoil = 1; heat = Math.min(1.2, heat + 0.45); } lastBurst = e.burst;
    heat = Math.max(0, heat - dt * 0.6); heatM.opacity = Math.min(1, heat) * (0.7 + 0.3 * Math.sin(t * 30));
    smokeT -= dt; if (heat > 0.25 && smokeT <= 0 && ctx.emit) { smokeT = 0.12; const fx = Math.cos(bar.rotation.z) * 1.1, fy = 0.05 + Math.sin(bar.rotation.z) * 1.1; ctx.emit('smoke', e.flip ? -fx : fx, e.flip ? -fy : fy); }
    recoil = damp(recoil, 0, 9, dt); for (const b of barrels) b.position.x = -0.18 * recoil;
    lamp.visible = e.cd < 30 || Math.floor(t * 3) % 2 === 0; lamp.scale.setScalar(e.cd < 30 ? 1.6 + Math.sin(t * 40) * 0.3 : 1);
  } };
};
B.engine = () => {
  const M = materials(), g = new THREE.Group();
  const nozM = M.gunmetal.clone(); nozM.side = THREE.DoubleSide;
  g.add(mesh(geo('en-n', () => latheX([[0.9, 0.7], [0.2, 1.05], [-0.6, 1.25], [-0.9, 1.3]], 24)), nozM));
  const innerM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(2), toneMapped: false });
  const inner = mesh(geo('en-i', () => { const c = new THREE.CircleGeometry(1.05, 28); c.rotateY(-Math.PI / 2); return c; }), innerM); inner.position.x = -0.2; g.add(inner);
  const ribs = spikeRing(8, 1.25, 0.3, 0.1, M.darkSteel, 'x'); ribs.position.x = 0.4; g.add(ribs);
  let heat = 0;
  return { obj: g, anim(e, t, a = 1, dt = 1 / 60) { heat = damp(heat, e.burning ? 1 : 0, e.burning ? 10 : 3, dt); const k = 0.35 + heat * (2.0 + Math.sin(t * 50) * 0.5); innerM.color.setRGB(1.0 * k, 0.6 * k, 0.25 * k); } };
};
B.vent = () => {
  const M = materials(), g = new THREE.Group();
  const box = mesh(geo('vn-b', () => new THREE.BoxGeometry(1.5, 0.5, 1.4)), M.hull); box.position.y = -0.3; g.add(box);
  const hg = geo('vn-h', () => new THREE.BoxGeometry(0.7, 0.08, 1.2));
  const h1 = mesh(hg, M.darkSteel), h2 = mesh(hg, M.darkSteel); h1.position.set(-0.36, 0, 0); h2.position.set(0.36, 0, 0); g.add(h1, h2);
  const glow = mesh(geo('vn-g', () => new THREE.BoxGeometry(1.1, 0.05, 1.0)), M.gAmber); glow.position.y = -0.05; g.add(glow);
  let o = 0, lastCd = 99, after = 0;
  return { obj: g, anim(e, t, a = 1, dt = 1 / 60) { g.rotation.z = e.flip ? Math.PI : 0; if (e.cd > lastCd) after = 0.35; lastCd = e.cd; after = Math.max(0, after - dt); const want = e.cd < 20 || after > 0 ? 1 : 0; o = damp(o, want, want ? 14 : 5, dt); h1.rotation.z = o * 1.1; h2.rotation.z = -o * 1.1; glow.scale.set(1, 1 + o * 2, 1); } };
};

// ---------------------------------------------------------------- ボス（部位はすべて補間して置く）
B.ossuary = (e) => {
  const M = materials(), g = new THREE.Group();
  const body = mesh(geo('os-body', () => blob(2.3, 4, 0.09, 1.9, 1.05, 1.15, 1.1)), M.fleshBig); g.add(body);
  const lobes = [2, 3].map(() => { const m = mesh(geo('os-lobe', () => blob(1.5, 3, 0.12, 4.2)), M.fleshBig); g.add(m); return m; });
  const ribG = geo('os-rib2', () => { const pts = []; for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI * 0.9; pts.push(new THREE.Vector3(Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0)); } return taperTube(new THREE.CatmullRomCurve3(pts), 48, 10, 0.17, (t) => 0.35 + 0.65 * Math.sin(Math.PI * t)); });
  const ribLine = geo('os-ribl', () => { const pts = []; for (let k = 0; k <= 20; k++) { const a2 = k / 20 * Math.PI * 0.9; pts.push(V3(Math.cos(a2) * 2.4, Math.sin(a2) * 2.4, 0.16)); } return taperTube(new THREE.CatmullRomCurve3(pts), 40, 5, 0.03, (t) => Math.pow(Math.sin(Math.PI * t), 0.6)); });
  for (let k = 0; k < 5; k++) { const r = mesh(ribG, M.bone); { const l = mesh(ribLine, glowMat(0x9dff6a, 1.2)); l.userData.noOutline = true; r.add(l); } r.rotation.y = Math.PI / 2; r.rotation.x = -Math.PI * 0.45; r.position.set(1.2 + k * 0.55, 0, 0); r.scale.setScalar(1 - Math.abs(k - 2) * 0.12); g.add(r); }
  const coreM = new THREE.MeshBasicMaterial({ color: 0xff4fb4, toneMapped: false });
  const core = mesh(geo('os-core', () => new THREE.IcosahedronGeometry(0.95, 3)), coreM); g.add(core);
  const petalG = geo('os-petal2', () => bladeGeo(2.5, 1.35, 0.16));
  const midG = geo('os-mid', () => taperTube(new THREE.CatmullRomCurve3([V3(0, -1.15, 0.2), V3(0.04, 0, 0.22), V3(0, 1.18, 0.16)]), 32, 5, 0.035, (t) => Math.pow(Math.sin(Math.PI * t), 0.5)));
  const petals = e.petals.map(() => { const m = mesh(petalG, M.bone); const l = mesh(midG, glowMat(0xff4fb4, 1.5)); l.userData.noOutline = true; m.add(l); g.add(m); return m; });
  const tailG = geo('os-tail', () => blob(0.55, 2, 0.15, 6.6));
  const tail = e.tail.map((p) => { const m = mesh(tailG, M.bone); m.scale.setScalar(p.r / 0.55); g.add(m); return m; });
  const eyes = [];
  for (let k = 0; k < 6; k++) { const m = mesh(geo('os-eye', () => new THREE.SphereGeometry(0.16, 12, 8)), M.gEye); m.position.set(1.3 + (k % 3) * 0.7, (k < 3 ? 1 : -1) * (1.6 + (k % 3) * 0.2), 1.6); m.userData.bx = m.position.x; m.userData.by = m.position.y; g.add(m); eyes.push(m); }
  const flash = flashShell(1.1); g.add(flash);
  let glow = 0.9; const plag = e.petals.map(() => ({ x: 0, v: 0 })); const blinks = eyes.map((m, k) => makeBlink(k * 3.7 + 1));
  return {
    obj: g, anim(b, t, a = 1, dt = 1 / 60, ctx = {}) {
      const br = 1 + 0.025 * Math.sin(t * 1.7), out = 1 + (ctx.dying || 0) * 0.35; // 呼吸と、撃破時に部位が外へずれる
      body.scale.setScalar(br); for (const l of lobes) l.scale.setScalar(2 - br);
      body.position.set(lx(b.parts[1], a) * out, ly(b.parts[1], a) * out, 0);
      lobes[0].position.set(lx(b.parts[2], a), ly(b.parts[2], a), -0.3); lobes[1].position.set(lx(b.parts[3], a), ly(b.parts[3], a), -0.3);
      core.position.set(lx(b.parts[0], a), ly(b.parts[0], a), 0.4);
      glow = damp(glow, b.parts[0].active ? 2.8 + Math.sin(t * 18) * 0.8 : 0.9, 10, dt);
      coreM.color.setRGB(1.0 * glow, 0.31 * glow, 0.7 * glow);
      core.scale.setScalar((0.75 + b.open * 0.35) * (1 + heartbeat(t, 66) * 0.12));
      // 斉射の直前（閉じているときの 46 tick 周期の 8〜20 tick）は花弁が震える
      const c = b.t % 330, cc = c % 46, tell = c < 170 && cc >= 8 && cc < 20 ? 1 : 0;
      b.petals.forEach((p, k) => { const m = petals[k], x = lx(p, a) * out, y = ly(p, a) * out, tr = tell * Math.sin(t * 55 + k) * 0.08; m.position.set(x + tr, y, 0.6);
        const want = Math.atan2(y, x - 0.3) - Math.PI / 2; if (plag[k].init == null) { plag[k].x = want; plag[k].init = 1; } const r2 = spring(plag[k], want, 9, dt, 0.5); m.rotation.z = r2 + tr; m.scale.set(1, 1 + (want - r2) * 0.4, 1); });
      b.tail.forEach((p, k) => { tail[k].position.set(lx(p, a), ly(p, a), 0); tail[k].rotation.z = t + k; });
      eyes.forEach((m, k) => { const bl = blinks[k](dt, tell); const base = 0.8 + 0.3 * Math.sin(t * 4 + m.userData.bx); m.scale.set(base * bl.pupil, base * bl.pupil * bl.lid, base * bl.pupil); });
      for (const m of eyes) { const lxx = ctx.lookX ?? -1, lyy = ctx.lookY ?? 0, d = Math.hypot(lxx, lyy) || 1; m.position.x = damp(m.position.x, m.userData.bx + lxx / d * 0.08, 8, dt); m.position.y = damp(m.position.y, m.userData.by + lyy / d * 0.08, 8, dt); }
      flash.position.copy(core.position); flash.userData.set(ctx.hit || 0);
    },
  };
};
B.vesper = (e) => {
  const M = materials(), g = new THREE.Group();
  const head = new THREE.Group(); g.add(head);
  head.add(mesh(geo('vs-h', () => blob(1.0, 3, 0.08, 2.9, 1.5, 0.85, 0.95)), M.chitin));
  const crest = spikeRing(5, 0.7, 0.9, 0.12, M.bone, 'x'); crest.position.x = 0.7; crest.rotation.z = -Math.PI / 2; head.add(crest);
  const jawG = geo('vs-j', () => { const c = new THREE.ConeGeometry(0.28, 1.4, 8); c.rotateZ(Math.PI / 2); c.translate(-0.7, 0, 0); return c; });
  const jt = mesh(jawG, M.bone), jb = mesh(jawG, M.bone); jt.position.set(-0.6, 0.25, 0); jb.position.set(-0.6, -0.25, 0); head.add(jt, jb);
  const coreM = new THREE.MeshBasicMaterial({ color: 0xff4fb4, toneMapped: false });
  const core = mesh(geo('vs-core', () => new THREE.SphereGeometry(0.55, 20, 14)), coreM); core.position.x = -0.6; head.add(core);
  for (const z of [0.55, -0.55]) { const m = mesh(geo('vs-eye', () => new THREE.SphereGeometry(0.15, 10, 8)), M.gEye); m.position.set(-0.3, 0.42, z); head.add(m); }
  const segG = geo('vs-s', () => blob(0.8, 2, 0.07, 3.3)), bandG = geo('vs-b', () => new THREE.TorusGeometry(0.72, 0.12, 8, 28));
  const segs = [];
  for (let k = 0; k < 18; k++) {
    const s = new THREE.Group(), spin = new THREE.Group(); s.add(spin);
    const b = mesh(bandG, M.steel); b.rotation.y = Math.PI / 2; s.add(b);
    spin.add(spikeRing(3, 0.75, 0.4, 0.08, M.bone));
    s.scale.setScalar(e.parts[k + 2].r / 0.8); g.add(s); segs.push({ s, spin });
  }
  const vsBody = new SplineBody(72, 16, M.fleshBig); g.add(vsBody.mesh);
  const vsLine = new SplineBody(72, 5, flowMat(0xff5a8a, 0.4), 0.93, 0.06); vsLine.mesh.userData.noOutline = true; g.add(vsLine.mesh);
  const flash = flashShell(0.9); head.add(flash); flash.position.x = -0.6;
  let dir = Math.PI, mouth = 0, glow = 0.5;
  return {
    obj: g, anim(b, t, a = 1, dt = 1 / 60, ctx = {}) {
      dir = dampAngle(dir, b.dir ?? Math.PI, 10, dt);
      const aimA = Math.atan2(ctx.lookY ?? 0, ctx.lookX ?? -1); let hz = dir - Math.PI;
      if (b.mouth > 0.25) hz += Math.atan2(Math.sin(aimA - dir), Math.cos(aimA - dir)) * Math.min(1, (b.mouth - 0.25) * 2) * 0.6;
      head.rotation.z = dampAngle(head.rotation.z, hz, 10, dt);
      const c = b.t % 240, shiver = c > 132 && c < 150 ? Math.sin(t * 70) * 0.06 : 0;
      mouth = damp(mouth, b.mouth, 14, dt); jt.rotation.z = mouth * 0.5 + shiver; jb.rotation.z = -mouth * 0.5 - shiver;
      head.position.y = Math.sin(t * 2.1) * 0.08;
      glow = damp(glow, b.parts[0].active ? 2.8 + Math.sin(t * 18) * 0.8 : 0.5, 10, dt);
      coreM.color.setRGB(glow, 0.3 * glow, 0.7 * glow);
      // 胴の節: 補間した位置に置き、帯を前の節の方向へ向ける
      for (let k = 0; k < 18; k++) {
        const p = b.parts[k + 2], q = k ? b.parts[k + 1] : { ox: 0, oy: 0 };
        const x = lx(p, a), y = ly(p, a), qx = k ? lx(q, a) : 0, qy = k ? ly(q, a) : 0;
        const ang2 = Math.atan2(qy - y, qx - x), wave = Math.sin(t * 3.2 - k * 0.55) * 0.14 * Math.min(1, k / 3);
        segs[k].s.position.set(x - Math.sin(ang2) * wave, y + Math.cos(ang2) * wave, Math.cos(t * 2.4 - k * 0.5) * 0.25); segs[k].s.rotation.z = ang2;
        segs[k].spin.rotation.x = t * 1.5 + k * 0.4;
      }
      // 頭から尾まで 1 本の流れる胴
      { const pts = [{ x: 0.6, y: head.position.y, z: 0, r: 0.72 }, ...segs.map((q, k) => ({ x: q.s.position.x, y: q.s.position.y, z: q.s.position.z, r: b.parts[k + 2].r * 0.9 }))]; vsBody.update(pts); vsLine.update(pts); }
      flash.userData.set(ctx.hit || 0);
    },
  };
};
B.keelheart = (e) => {
  const M = materials(), g = new THREE.Group();
  const coreM = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
  const core = mesh(geo('kh-c', () => new THREE.IcosahedronGeometry(1.2, 4)), coreM); g.add(core);
  const ringG = geo('kh-r', () => new THREE.TorusGeometry(1.6, 0.1, 10, 56));
  const ringEdge = geo('kh-re', () => new THREE.TorusGeometry(1.6, 0.022, 6, 64));
  const rings = [0, 1, 2].map((k) => { const r = mesh(ringG, M.steel); const e2 = mesh(ringEdge, glowMat(0xffb347, 1.5)); e2.userData.noOutline = true; e2.scale.setScalar(1.075); e2.position.z = 0.04; r.add(e2); r.scale.setScalar(1 + k * 0.12); g.add(r); return r; });
  const frame = mesh(geo('kh-f', () => new THREE.TorusGeometry(3.6, 0.35, 10, 56)), M.hull); frame.position.z = -1.2; g.add(frame);
  const plateG = geo('kh-p', () => { const x = new THREE.CylinderGeometry(2.25, 2.25, 1.3, 16, 1, true, -0.42, 0.84); x.rotateX(Math.PI / 2); return x; });
  const plate2G = geo('kh-p2', () => new THREE.BoxGeometry(0.45, 1.1, 1.0));
  const plateM = M.hull.clone(); plateM.side = THREE.DoubleSide;
  // 遮蔽板は「円弧の装甲」にした（以前の箱より、回る盾として読みやすい）
  const plates = e.parts.filter((p) => p.plate != null || p.plate2 != null).map((p) => { const m = mesh(p.plate != null ? plateG : plate2G, p.plate != null ? plateM : M.hull); m.userData.arc = p.plate != null; g.add(m); return { m, p }; });
  const flash = flashShell(1.3); g.add(flash);
  const muz = mesh(geo('kh-m', () => new THREE.SphereGeometry(0.5, 16, 12)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd080).multiplyScalar(3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  muz.position.set(-1.5, 0, 0.6); g.add(muz);
  return {
    obj: g, anim(b, t, a = 1, dt = 1 / 60, ctx = {}) {
      const w = b.beamWarn > 0 ? 1 - b.beamWarn / 60 : 0; muz.material.opacity = w > 0 ? 0.4 + w * 0.6 : damp(muz.material.opacity, 0, 6, dt); muz.scale.setScalar(0.3 + w * 1.4 + Math.sin(t * 60) * 0.1 * w);
      muz.position.y = (b.beamY != null && w > 0) ? damp(muz.position.y, b.beamY - b.y, 12, dt) : damp(muz.position.y, 0, 4, dt);
      const pulse = 2.2 + Math.sin(t * 7) * 0.5 + (ctx.hit || 0) * 1.5;
      coreM.color.setRGB(pulse, 0.65 * pulse, 0.25 * pulse);
      const hp = b.hp / b.maxHp, guns = (b.guns || []).filter((q) => !q.dead).length;
      rings.forEach((r, k) => { const want = (0.6 + k * 0.3) * (1 + (1 - hp) * 1.5) * (guns ? 1.3 : 0.8); r.userData.w = damp(r.userData.w ?? want, want, 0.8, dt); r.rotation.x += r.userData.w * dt; r.rotation.y += r.userData.w * (0.65 - k * 0.4) * dt; });
      if (ctx.emit) { if ((b.t % 180) < 2) { for (const sx of [-2.8, 2.8]) ctx.emit('steam', sx * 0.7, sx); } if (ctx.blocked && Math.random() < 0.6) ctx.emit('spark', -1.6 + Math.random() * 0.4, (Math.random() - 0.5) * 3); }
      for (const { m, p } of plates) {
        const x = lx(p, a), y = ly(p, a), ang = Math.atan2(y, x);
        if (m.userData.arc) { m.position.set(0, 0, 0.2); m.rotation.set(0, 0, ang + Math.PI / 2); }
        else { m.position.set(x, y, 0.2); m.rotation.z = ang; }
      }
      flash.userData.set(ctx.hit || 0);
    },
  };
};
B.heart = (e) => {
  const M = materials(), g = new THREE.Group();
  const coreM = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uOpen: { value: 0 }, uFlash: { value: 0 } }, toneMapped: false,
    vertexShader: 'uniform float uTime; uniform float uOpen; varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vP = position; vec3 p = position + normal * (sin(position.y * 5.0 + uTime * 3.1) * sin(position.x * 4.0 - uTime * 2.3) * 0.06 * (0.6 + uOpen)); gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }',
    fragmentShader: 'uniform float uTime; uniform float uOpen; uniform float uFlash; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.-abs(vN.z), 2.); float b = 0.5+0.5*sin(vP.x*6.+uTime*3.)*sin(vP.y*5.-uTime*2.); vec3 c = mix(vec3(0.5,0.2,1.2), vec3(1.8,0.9,2.4), b) * (0.6+uOpen*1.6) + f*vec3(0.4,1.2,1.0) + uFlash; gl_FragColor = vec4(c,1.); }',
  });
  const core = mesh(geo('hr-c', () => new THREE.IcosahedronGeometry(1.35, 4)), coreM); g.add(core);
  const shellG = geo('hr-s', () => new THREE.SphereGeometry(1.8, 32, 20, 0, Math.PI));
  const shellM = M.chitin.clone(); shellM.side = THREE.DoubleSide; shellM.onBeforeCompile = M.chitin.onBeforeCompile; shellM.customProgramCacheKey = M.chitin.customProgramCacheKey;
  const shell = mesh(shellG, shellM); shell.rotation.y = -Math.PI / 2; g.add(shell);
  const petalG = geo('hr-p2', () => { const b = bladeGeo(2.9, 1.15, 0.18); b.rotateZ(-Math.PI / 2); return b; });
  const hmid = geo('hr-mid', () => taperTube(new THREE.CatmullRomCurve3([V3(-1.35, 0, 0.22), V3(0, 0.05, 0.26), V3(1.4, 0, 0.2)]), 32, 5, 0.03, (t) => Math.pow(Math.sin(Math.PI * t), 0.5)));
  const petals = e.petals.map(() => { const pm = M.crystalIrid.clone(); pm.onBeforeCompile = M.crystalIrid.onBeforeCompile; pm.customProgramCacheKey = M.crystalIrid.customProgramCacheKey; const m = mesh(petalG, pm); const l = mesh(hmid, glowMat(0xe0a8ff, 1.6)); l.userData.noOutline = true; m.add(l); g.add(m); return { m, hit: 0, gone: 0 }; });
  const halo = mesh(geo('hr-h', () => new THREE.TorusGeometry(3.3, 0.04, 6, 96)), M.gViolet); g.add(halo);
  let open = 0;
  return {
    obj: g, anim(b, t, a = 1, dt = 1 / 60, ctx = {}) {
      open = damp(open, b.open, 12, dt);
      coreM.uniforms.uOpen.value = open; coreM.uniforms.uFlash.value = (ctx.hit || 0) * 0.8;
      core.rotation.y = t * 0.5; core.rotation.x = t * 0.3;
      const pre = open > 0.6 && (b.t % 40) > 28 ? ((b.t % 40) - 28) / 12 : 0; core.scale.setScalar(1 + pre * 0.18 + Math.sin(t * 3) * 0.02);
      const sp = b.parts[1]; shell.position.set(lx(sp, a) - 1.1, ly(sp, a), 0); shell.rotation.z = open * 1.2; shell.visible = !sp.off || open < 0.95;
      b.petals.forEach((p, k) => {
        const P = petals[k], m = P.m;
        if (p.flash > 0) { P.hit = 1; p.flash--; }
        P.hit = damp(P.hit, 0, 12, dt);
        // 割れた花弁はすぐ消さず、外へ回りながら縮む
        P.gone = p.gone ? Math.min(1, P.gone + dt * 3) : 0;
        m.visible = P.gone < 1;
        const x = lx(p, a), y = ly(p, a), out = (1 + P.gone * 0.8) * (1 + 0.05 * Math.sin(t * 2.2 - k * 0.9)) * (1 + (ctx.dying || 0) * 0.4);
        m.position.set(x * out, y * out, 0); m.rotation.z = Math.atan2(y, x) + P.gone * 6 + Math.sin(t * 2.6 + k) * 0.08; const fx = 1 + Math.sin(t * 3.1 - k * 0.7) * 0.07; m.scale.set((1 - P.gone) * fx, (1 - P.gone) / fx, 1 - P.gone);
        m.material.emissive.setRGB(0.14 + P.hit * 0.86, 0.04 + P.hit * 0.96, 0.25 + P.hit * 0.75);
      });
      halo.rotation.z = -t * 0.2; halo.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
    },
  };
};

export const ENEMY_BUILDERS = B;
// 敵を組み立てる。返り値の obj は「外側の入れ物」（位置・向き・被弾の弾み・出現と消滅の拡大縮小は world が入れ物にかける）
export function buildEnemy(e) {
  const f = B[e.type];
  const r = f ? f(e) : { obj: new THREE.Mesh(new THREE.SphereGeometry(e.r), materials().gRed), anim() {} };
  const holder = new THREE.Group(); holder.add(r.obj);
  addOutline(r.obj, e.boss ? 0.045 : Math.max(0.012, e.r * 0.035), e.boss || e.r >= 0.8 ? 1 : 2);
  let flash = null;
  if (!e.boss) { flash = flashShell(e.r * 1.05); holder.add(flash); }
  return { obj: holder, inner: r.obj, anim: r.anim, face: !!r.face, organic: !!r.organic, chains: r.chains || null, flash, boss: !!e.boss };
}
