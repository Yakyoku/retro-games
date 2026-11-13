// AEGIS RELAY — 3D 版の共通の道具（乱数・ノイズ・形の組み立て・機体用の材質・小分けの作業）
// 外部のモデルや画像は使わない。形はすべてここの関数から計算で作る。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD } from '../shared/rules.js';

export const HW = FIELD.W / 2, HH = FIELD.H / 2;
export const AIR_H = 20;                 // 空の物体の見た目の高さ（判定には入らない）
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 実時間のばね（何 Hz で描いても同じ速さで寄る）
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ── 値ノイズ（決定的）。period を渡すと継ぎ目なく繰り返す ──
function h2(ix, iy, seed) { let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; n ^= n >>> 16; return (n >>> 0) / 4294967296; }
export function vnoise(x, y, seed = 0, period = 0) {
  let ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
  let ix1 = ix + 1, iy1 = iy + 1;
  if (period) { ix = ((ix % period) + period) % period; iy = ((iy % period) + period) % period; ix1 = ((ix1 % period) + period) % period; iy1 = ((iy1 % period) + period) % period; }
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, seed), b = h2(ix1, iy, seed), c = h2(ix, iy1, seed), d = h2(ix1, iy1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, seed = 0, oct = 4, period = 0) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y, seed + i * 17, period); n += a; x *= 2; y *= 2; period *= 2; a *= 0.5; }
  return s / n;
}

// ── 継ぎ目のないノイズのテクスチャ（爆発・雲・滝のシェーダーが引く）──
let _noiseTex = null;
export function noiseTexture() {
  if (_noiseTex) return _noiseTex;
  const N = 128, data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    data[i] = fbm(x / 16, y / 16, 3, 4, 8) * 255;       // 大きなうねり
    data[i + 1] = fbm(x / 8, y / 8, 9, 3, 16) * 255;    // 細かい
    data[i + 2] = fbm(x / 32, y / 32, 5, 5, 4) * 255;   // ゆるい
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (_noiseTex = t);
}

// ── 形の組み立て ──
// part(geo, {c 色, e 発光, m 金属, r 粗さ, f 種類}) で頂点に色と材質の値を持たせ、merge() で 1 つの形にまとめる。
// f: 0=ふつう 1=パネルライン 2=流れる光 3=点滅 4=ゆっくり脈動
const _col = new THREE.Color();
export function part(geo, o = {}, tf = null) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (tf) { const m = new THREE.Matrix4(); const p = tf.p || [0, 0, 0], r = tf.r || [0, 0, 0], s = tf.s == null ? [1, 1, 1] : (typeof tf.s === 'number' ? [tf.s, tf.s, tf.s] : tf.s);
    m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], tf.o || 'XYZ')), new THREE.Vector3(...s)); g.applyMatrix4(m); }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), mat = new Float32Array(n * 4);
  _col.set(o.c ?? 0xffffff); // 線形色に変換される
  const e = o.e ?? 0, mt = o.m ?? 0.5, ro = o.r ?? 0.5, f = o.f ?? 0;
  for (let i = 0; i < n; i++) { col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; mat[i * 4] = e; mat[i * 4 + 1] = mt; mat[i * 4 + 2] = ro; mat[i * 4 + 3] = f; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aMat'].includes(k)) g.deleteAttribute(k);
  return g;
}
export function merge(parts) { const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g; }

const shapeOf = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); s.closePath(); return s; };
// 上から見た輪郭（x, z の並び。-z が前）を厚み d で押し出して水平に置く。面取りつき。上面が y = d/2
export function slab(pts, d, bevel = 0.5, seg = 2) {
  const flip = []; for (let i = 0; i < pts.length; i += 2) flip.push(pts[i], -pts[i + 1]);
  const b = Math.min(bevel, d * 0.45);
  const g = new THREE.ExtrudeGeometry(shapeOf(flip), { depth: d - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: seg, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); g.translate(0, -d / 2 + b, 0); return g;
}
// 左右対称の輪郭（右半分だけ渡す。x>=0 の点を前から後ろへ）
export function mirrorPts(half) { const out = [...half]; for (let i = half.length - 2; i >= 0; i -= 2) { if (Math.abs(half[i]) < 1e-6) continue; out.push(-half[i], half[i + 1]); } return out; }
export function lathe(profile, seg = 20) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
// 回転体を前後（z）に寝かせた胴。profile は [半径, z]（前が負）
export function hullZ(profile, seg = 16, sx = 1, sy = 1) { const g = lathe([...profile].sort((a, b) => b[1] - a[1]).map(([r, z]) => [r, -z]), seg); g.rotateX(-Math.PI / 2); g.scale(sx, sy, 1); return g; }
export function box(w, h, d, bevel = 0) {
  if (!bevel) return new THREE.BoxGeometry(w, h, d);
  return slab([-w / 2, -d / 2, w / 2, -d / 2, w / 2, d / 2, -w / 2, d / 2], h, bevel, 1);
}
export const cyl = (r0, r1, h, seg = 14, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
export const cylZ = (r0, r1, len, seg = 12) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg); g.rotateX(Math.PI / 2); return g; }; // r0 が後ろ（+z）側
export const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
export const torus = (R, r, a = 8, b = 28, arc = Math.PI * 2) => { const g = new THREE.TorusGeometry(R, r, a, b, arc); g.rotateX(Math.PI / 2); return g; }; // 水平の輪
export const octa = (r) => new THREE.OctahedronGeometry(r, 0);
export const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

// ── 機体・標的・遺跡に共通の材質 ──
// MeshStandardMaterial に、頂点ごとの「発光・金属・粗さ・種類」と、個体ごとの「被弾の白・損傷・点灯・位相」を足す。
export const shared = { time: { value: 0 }, glow: { value: 1 } }; // どの材質も同じ時計を見る
export function makeHullMaterial(clip, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: opts.env ?? 1.0, clippingPlanes: clip, side: opts.side ?? THREE.FrontSide, flatShading: !!opts.flat,
    polygonOffset: !!opts.offset, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time; sh.uniforms.uGlow = shared.glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aMat;
      #ifdef USE_INSTANCING
      attribute vec4 aFx;
      #endif
      varying vec4 vMat; varying vec4 vFx; varying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vMat = aMat; vObj = position;
      #ifdef USE_INSTANCING
      vFx = aFx;
      #else
      vFx = vec4(0.0);
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform float uGlow;
      varying vec4 vMat; varying vec4 vFx; varying vec3 vObj;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float kind = vMat.w;
      if (kind > 0.5 && kind < 1.5) { // パネルライン: 細い溝。遠くでは幅を保って薄くする（ちらつき防止）
        vec2 pq = vec2(vObj.x * 0.36 + vObj.z * 0.05, vObj.z * 0.21);
        vec2 fw = fwidth(pq) * 1.2 + 0.012;
        vec2 dl = abs(fract(pq) - 0.5);
        float ln = max(1.0 - smoothstep(0.0, fw.x, dl.x), 1.0 - smoothstep(0.0, fw.y, dl.y));
        ln *= 1.0 - smoothstep(0.08, 0.3, max(fw.x, fw.y));
        diffuseColor.rgb *= 1.0 - 0.5 * ln;
      }
      float dmg = vFx.y;
      float crack = 0.0;
      if (dmg > 0.01) { // 損傷: 煤けた色＋亀裂の光
        float cw = abs(sin(vObj.x * 1.3 + sin(vObj.z * 1.7 + vObj.y) * 1.6) + 0.35 * sin(vObj.z * 3.1 + vObj.x * 0.7));
        crack = (1.0 - smoothstep(0.0, 0.16, cw)) * dmg;
        diffuseColor.rgb *= 1.0 - 0.4 * dmg;
      }
      float em = vMat.x;
      diffuseColor.rgb *= 1.0 - 0.85 * min(1.0, em);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor *= vMat.z;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor *= vMat.y;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float md = 1.0; float ph = vFx.w * 6.2832;
        if (kind > 1.5 && kind < 2.5) md = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(vObj.z * 0.9 + vObj.x * 0.5 - uTime * 7.0 + ph), 3.0);
        else if (kind > 2.5 && kind < 3.5) md = 0.15 + 0.85 * step(0.5, fract(uTime * 1.3 + vFx.w + vObj.x * 0.071));
        else if (kind > 3.5) md = 0.6 + 0.4 * sin(uTime * 3.2 + ph);
        vec3 ec = vColor.rgb;
        ec = mix(ec, vec3(1.0, 0.82, 0.35), clamp(vFx.z - 1.0, 0.0, 1.0)); // 連鎖が進むと金色へ
        totalEmissiveRadiance += ec * em * md * uGlow * (1.0 + min(vFx.z, 1.0) * 1.6);
        totalEmissiveRadiance += vec3(1.0, 0.45, 0.12) * crack * (0.8 + 0.5 * sin(uTime * 9.0 + ph)) * uGlow;
        totalEmissiveRadiance += vec3(1.0) * vFx.x * 1.6;
      }`);
  };
  m.customProgramCacheKey = () => 'hull' + (opts.flat ? 'f' : '');
  return m;
}

// ── 小分けの作業（M10）: generator を並べ、1 フレームに数ミリ秒ずつ進める ──
export function makeJobs() {
  const q = [];
  return {
    add(gen, tag = '') { q.push({ gen, tag }); },
    clear(tag) { for (let i = q.length - 1; i >= 0; i--) if (!tag || q[i].tag === tag) q.splice(i, 1); },
    get pending() { return q.length; },
    // budget ミリ秒だけ進める。flush=true なら全部終わるまで
    run(budget, flush = false) {
      const t0 = performance.now();
      while (q.length) {
        const r = q[0].gen.next();
        if (r.done) q.shift();
        if (!flush && performance.now() - t0 > budget) break;
      }
    },
  };
}

// 左右を反転した形（面の向きも直す）
export function mirrorX(geo) {
  const g = geo.clone(); g.scale(-1, 1, 1);
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k], n = a.itemSize, arr = a.array; for (let i = 0; i < a.count; i += 3) for (let j = 0; j < n; j++) { const t = arr[(i + 1) * n + j]; arr[(i + 1) * n + j] = arr[(i + 2) * n + j]; arr[(i + 2) * n + j] = t; } }
  return g;
}

// ── 同じ形をまとめて描く（InstancedMesh）。部品ごとに 1 回の描画で、何体いても描画回数は増えない ──
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _l = new THREE.Matrix4();
export class Kind {
  constructor(geos, material, cap, parent, order = 2) {
    this.cap = cap; this.n = 0; this.B = new THREE.Matrix4(); this.i = -1;
    this.meshes = geos.map((g) => {
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); fx.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aFx', fx);
      const m = new THREE.InstancedMesh(g, material, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.renderOrder = order; m.count = 0; m.visible = false; parent.add(m); return m;
    });
  }
  begin() { this.n = 0; }
  // 個体の基準（位置・向き・大きさ）。戻り値 false = 上限
  add(x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
    if (this.n >= this.cap) { this.i = -1; return false; }
    this.i = this.n++;
    _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); this.B.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    return true;
  }
  // 部品 p を基準の中に置く
  part(p, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    if (this.i < 0) return;
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _l.compose(_v.set(px, py, pz), _q, _s.set(sx, sy, sz)); _l.premultiply(this.B);
    _l.toArray(this.meshes[p].instanceMatrix.array, this.i * 16);
  }
  hide(p) { if (this.i < 0) return; _l.makeScale(0, 0, 0); _l.toArray(this.meshes[p].instanceMatrix.array, this.i * 16); }
  fx(flash, dmg, lit, phase) {
    if (this.i < 0) return;
    for (const m of this.meshes) { const a = m.geometry.attributes.aFx.array, o = this.i * 4; a[o] = flash; a[o + 1] = dmg; a[o + 2] = lit; a[o + 3] = phase; }
  }
  end() {
    for (const m of this.meshes) {
      m.count = this.n; m.visible = this.n > 0;
      if (this.n) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aFx.needsUpdate = true; }
    }
  }
}

// キャンバスからテクスチャ（ミップマップ＋異方性。M24）
export function canvasTexture(cv, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
export function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
