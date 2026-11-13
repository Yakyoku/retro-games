// ORBITAL WINGS 3D — 環境用の部品（雑音・形の結合と焼き込み照明・材質の差し替え・粒子）
// three 本体だけを使う（addons なし）。ここで作る材質はすべて「戦場の箱のローカル座標」で霧と切り落としを計算するので、
// 通常画面でも VR（箱を 1.8m に縮めたジオラマ）でも同じ見え方になる。
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH } from '../shared/config.js';

export const TAU = Math.PI * 2, HW = VIEW_W / 2, HH = VIEW_H / 2;
export const D = DEPTH + 1.3;       // 地形の奥行き（戦場の外まで）。render3d.js と同じ値
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// ---- 雑音（座標から決まる。px・py を与えるとその周期で繰り返す） ---------------------------
export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wrap = (i, p) => (p ? ((i % p) + p) % p : i);
export function vnoise2(x, y, s = 0, px = 0, py = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = wrap(ix, px), x1 = wrap(ix + 1, px), y0 = wrap(iy, py), y1 = wrap(iy + 1, py);
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
export function fbm2(x, y, s = 0, oct = 3, px = 0, py = 0) {
  let a = 0, amp = 0.5, fr = 1, tot = 0;
  for (let o = 0; o < oct; o++) { a += amp * vnoise2(x * fr, y * fr, s + o * 31, px * fr, py * fr); tot += amp; fr *= 2; amp *= 0.5; }
  return a / tot;
}

// ---- 形の結合（頂点色に照明を焼き込む。法線は持たない＝軽い） -------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _n = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color(), _nm = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cc = new THREE.Vector3();
export function mat4(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return _m.compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
}
const geoCache = new Map();
export function prim(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
export const P = {
  cyl24: () => prim('cyl24', () => new THREE.CylinderGeometry(0.17, 1, 1, 24, 3, true)),
  box: () => prim('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (n = 8, top = 1, open = false) => prim(`cyl${n}_${top}_${open}`, () => new THREE.CylinderGeometry(top, 1, 1, n, 1, open)),
  cone: (n = 6, hs = 1) => prim(`cone${n}_${hs}`, () => new THREE.ConeGeometry(1, 1, n, hs, true)),
  sph: (w = 10, h = 7) => prim(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  ico: (d = 1) => prim(`ico${d}`, () => new THREE.IcosahedronGeometry(1, d)),
  torus: (arc = TAU, rs = 6, ts = 16, tube = 0.1) => prim(`tor${arc.toFixed(3)}_${rs}_${ts}_${tube}`, () => new THREE.TorusGeometry(1, tube, rs, ts, arc)),
  circle: (n = 16) => prim(`cir${n}`, () => new THREE.CircleGeometry(1, n)),
  plane: () => prim('plane', () => new THREE.PlaneGeometry(1, 1)),
};

export class EnvGeo {
  // light: { dir: Vector3（光の来る方向）, key: Color, sky: Color, ground: Color, rim?: Color, rimDir?: Vector3 }
  constructor(light) { this.L = light; this.pos = []; this.col = []; this.glw = []; this.n = 0; }
  // geo を行列 m で置き、色 color（Color／16 進／fn(p, n, out) で頂点ごと）で焼く。
  // o: { glow: 0..1（自発光。照明と霧の影響を受けにくい）, phase: 明滅の位相, flat: 面ごとの陰影, unlit, jitter: 頂点の乱れ, seed, yGrad: [y0, y1, k0, k1] }
  add(geo, m, color, o = {}) {
    const mm = m.clone ? _mm.copy(m) : _mm.identity();
    let g = geo.index ? geo.toNonIndexed() : geo;
    const src = g.attributes.position.array, cnt = g.attributes.position.count;
    const srcN = g.attributes.normal ? g.attributes.normal.array : null;
    const flat = o.flat !== false, jit = o.jitter || 0, seed = o.seed || 0;
    const pos = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), glw = new Float32Array(cnt * 2);
    _nm.getNormalMatrix(mm);
    const flip = mm.determinant() < 0;
    for (let i = 0; i < cnt; i++) {
      _v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
      if (jit) { // 同じ位置の頂点は同じだけ動かす（割れ目を作らない）
        const kx = Math.round(_v.x * 997), ky = Math.round(_v.y * 991), kz = Math.round(_v.z * 983);
        const j = 1 + (hash2(kx + kz * 7, ky - kz * 3, seed) - 0.5) * 2 * jit;
        _v.x *= j; _v.z *= j; _v.y *= 1 + (hash2(kx - ky, kz, seed + 5) - 0.5) * jit;
      }
      _v.applyMatrix4(mm);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    }
    if (flip) for (let i = 0; i < cnt * 3; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    const L = this.L, fn = typeof color === 'function' ? color : null;
    if (!fn) _c2.set(color);
    for (let i = 0; i < cnt; i += 3) {
      if (flat || !srcN) {
        _a.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); _b.set(pos[i * 3 + 3], pos[i * 3 + 4], pos[i * 3 + 5]); _cc.set(pos[i * 3 + 6], pos[i * 3 + 7], pos[i * 3 + 8]);
        _n.subVectors(_b, _a).cross(_cc.sub(_a)).normalize();
      }
      for (let k = 0; k < 3; k++) {
        const j = i + k;
        if (!flat && srcN) { const jj = flip ? i + (k === 0 ? 0 : 3 - k) : j; _n.set(srcN[jj * 3], srcN[jj * 3 + 1], srcN[jj * 3 + 2]).applyMatrix3(_nm).normalize(); }
        _v.set(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
        let gl = o.glow || 0;
        if (fn) { _c2.setRGB(1, 1, 1); const r = fn(_v, _n, _c2); if (typeof r === 'number') gl = r; }
        if (o.unlit || gl >= 1) _c.copy(_c2);
        else {
          const d = Math.max(0, _n.dot(L.dir)), h = _n.y * 0.5 + 0.5;
          _c.setRGB(lerp(L.ground.r, L.sky.r, h) + L.key.r * d, lerp(L.ground.g, L.sky.g, h) + L.key.g * d, lerp(L.ground.b, L.sky.b, h) + L.key.b * d);
          if (L.rim) { const rr = Math.max(0, _n.dot(L.rimDir)); _c.r += L.rim.r * rr; _c.g += L.rim.g * rr; _c.b += L.rim.b * rr; }
          _c.multiply(_c2);
          if (gl > 0) _c.lerp(_c2, gl);
        }
        if (o.yGrad) { const t = clamp01((_v.y - o.yGrad[0]) / (o.yGrad[1] - o.yGrad[0])); _c.multiplyScalar(lerp(o.yGrad[2], o.yGrad[3], t)); }
        col[j * 3] = _c.r; col[j * 3 + 1] = _c.g; col[j * 3 + 2] = _c.b;
        glw[j * 2] = gl; glw[j * 2 + 1] = this.phaseAll !== undefined ? this.phaseAll : typeof o.phase === 'function' ? o.phase(_v) : (o.phase || 0);
      }
    }
    this.pos.push(pos); this.col.push(col); this.glw.push(glw); this.n += cnt;
    if (g !== geo) g.dispose();
    return this;
  }
  // 起伏のある面（x0..x1 × z0..z1 の格子。hfn(x, z) が高さ、cfn(p, n, out) が色）
  sheet(x0, x1, nx, z0, z1, nz, hfn, color, o = {}) {
    const pos = new Float32Array(nx * nz * 18);
    let k = 0;
    const put = (x, z) => { pos[k++] = x; pos[k++] = hfn(x, z); pos[k++] = z; };
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = lerp(x0, x1, i / nx), xb = lerp(x0, x1, (i + 1) / nx), za = lerp(z0, z1, j / nz), zb = lerp(z0, z1, (j + 1) / nz);
      if ((i + j) & 1) { put(xa, za); put(xb, za); put(xb, zb); put(xa, za); put(xb, zb); put(xa, zb); }
      else { put(xa, za); put(xb, za); put(xa, zb); put(xb, za); put(xb, zb); put(xa, zb); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // 面の向き: z0 > z1（手前 → 奥）で上向きになる並び。逆なら裏返す
    this.add(g, _id, color, { ...o, flat: true, _sheet: true });
    g.dispose();
    return this;
  }
  get tris() { return this.n / 3; }
  build() {
    const n = this.n, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), glw = new Float32Array(n * 2);
    let o = 0;
    for (let i = 0; i < this.pos.length; i++) { pos.set(this.pos[i], o * 3); col.set(this.col[i], o * 3); glw.set(this.glw[i], o * 2); o += this.pos[i].length / 3; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glw, 2));
    this.pos = this.col = this.glw = null;
    return g;
  }
}
const _mm = new THREE.Matrix4(), _id = new THREE.Matrix4();

// ---- 共有の uniform（面ごとに値だけ書き換える） ---------------------------------------------
export function makeUniforms() {
  return {
    uTime: { value: 0 }, uCamHW: { value: 0 },
    uFogCol: { value: new THREE.Color() }, uFog: { value: new THREE.Vector4(6, 120, 0.9, 0) },   // 近・遠・最大
    uTint: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: new THREE.Color(0, 0, 0) },
    uVista: { value: new THREE.Vector4(-1e4, 1e4, 0, 0) },                                       // 入口 x・出口 x・沈む量
    uHeat: { value: 0 }, uBlink: { value: new THREE.Vector2(2, 0.5) },
    uFore: { value: new THREE.Vector2(9.3, 9.3) },
    uPulseA: { value: new THREE.Vector4(1e5, 1e5, 0, 0) }, uPulseB: { value: new THREE.Vector4(1e5, 1e5, 0, 0) }, uPhase: { value: new THREE.Vector2() },
    uEmis: { value: new THREE.Vector4(0.7, 0.3, 0, 0.3) }, uEdge: { value: 1 }, uCap: { value: new THREE.Color() }, uClipW: { value: 1e5 },
    uPx: { value: 720 }, uStreak: { value: 0 }, uAmb: { value: 1 }, uEmit: { value: 1 }, uPar: { value: 1 },
    uBox: { value: new THREE.Vector3(64, 30, 34) }, uBoxC: { value: new THREE.Vector3(0, 0, -13) }, uSprX: { value: 0 },
    uStarRot: { value: 0 }, uStarK: { value: 1 },
  };
}
const share = (sh, U, names) => { for (const n of names) sh.uniforms[n] = U[n]; };

// ---- 遠景・前景・光の筋の材質（照明なし・頂点色・箱ローカルの霧） ------------------------------
// o: { fog, bend, fore, add（加算）, clip: Plane[] }
export function layerMaterial(U, o = {}) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, clippingPlanes: o.clip || null, side: o.side || THREE.FrontSide });
  if (o.add) { m.transparent = true; m.blending = THREE.AdditiveBlending; m.depthWrite = false; }
  m.defines = {};
  if (o.fog !== false && !o.add) m.defines.ENV_FOG = 1;
  if (o.bend) m.defines.ENV_BEND = 1;
  if (o.fore) m.defines.ENV_FORE = 1;
  m.onBeforeCompile = (sh) => {
    share(sh, U, ['uTime', 'uCamHW', 'uFogCol', 'uFog', 'uTint', 'uFlash', 'uVista', 'uHeat', 'uBlink', 'uFore']);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 aGlow;
uniform float uTime, uCamHW, uHeat; uniform vec4 uFog, uVista; uniform vec2 uBlink, uFore;
varying vec3 vEnv;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 envP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
envP = instanceMatrix * envP;
#endif
float envWx = envP.x + uCamHW;
#ifdef ENV_BEND
transformed.y -= uVista.z;      // 面の入口・出口: 景色全体が沈む（宇宙へ抜ける／地表へ降りる）
transformed.x += sin(position.y * 1.9 + uTime * 2.3 + envWx * 0.7) * uHeat * clamp(-envP.z * 0.02, 0.0, 1.0);
#endif
#ifdef ENV_FORE
transformed.y += aGlow.y < 0.0 ? -uFore.x : uFore.y;   // 前景は aGlow.y に上下の別（−1 下・+1 上）を入れてある
#endif
float envS = sin(uTime * uBlink.x + aGlow.y);
float envPulse = aGlow.y > 50.0 ? smoothstep(0.25, 0.6, envS) : mix(1.0, 0.5 + 0.5 * envS, uBlink.y);
vEnv = vec3(clamp((-envP.z - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0) * uFog.z, aGlow.x, envPulse);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uFogCol, uTint, uFlash; varying vec3 vEnv;`).replace('#include <opaque_fragment>', `outgoingLight *= mix(uTint, vec3(0.25 + 1.35 * vEnv.z), vEnv.y);
#ifdef ENV_FOG
outgoingLight = mix(outgoingLight, uFogCol * uTint, vEnv.x * (1.0 - 0.55 * vEnv.y));
outgoingLight += uFlash * (0.04 + 0.3 * vEnv.x);
#endif
#include <opaque_fragment>`);
  };
  return m;
}

// ---- 地形の材質（Phong＋法線マップ＋発光マップ。脈動は頂点シェーダーで terrain.pulseAt と同じ式） ----
export function terrainMaterial(U, tex, o = {}) {
  const m = new THREE.MeshPhongMaterial({
    map: tex.map, normalMap: tex.normalMap, emissiveMap: tex.emissiveMap, emissive: 0xffffff, vertexColors: true, side: THREE.DoubleSide,
    shininess: o.shininess ?? 24, specular: new THREE.Color(o.specular ?? 0x222222), fog: false,
  });
  m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
  m.onBeforeCompile = (sh) => {
    share(sh, U, ['uCamHW', 'uFogCol', 'uFog', 'uTint', 'uPulseA', 'uPulseB', 'uPhase', 'uEmis', 'uEdge', 'uCap', 'uClipW']);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 aFx;
uniform vec4 uPulseA, uPulseB; uniform vec2 uPhase; uniform float uCamHW;
varying vec4 vEnvT;
// terrain.js の pulseAt と同じ式（値と x 微分）
vec2 envPulse1(float x, vec4 p, float ph) {
  if (x <= p.x || x >= p.y) return vec2(0.0);
  float e = min(1.0, min((x - p.x) / 6.0, (p.y - x) / 6.0)), a = ph + x * p.w;
  return vec2(sin(a), cos(a) * p.w) * p.z * e;
}
vec2 envPulse(float x) { return envPulse1(x, uPulseA, uPhase.x) + envPulse1(x, uPulseB, uPhase.y); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec2 envPl = aFx.x == 0.0 ? vec2(0.0) : envPulse(position.x + (aFx.x < 0.0 ? 3.1 : 0.0));
objectNormal.x -= abs(aFx.x) * envPl.y * abs(objectNormal.y);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.y += aFx.x * envPl.x;
vEnvT = vec4(position.x - uCamHW, transformed.y, position.z, aFx.y);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uFogCol, uTint, uCap; uniform vec4 uFog, uEmis; uniform float uEdge, uClipW, uCamHW;
varying vec4 vEnvT;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vEnvT.z > ${(-D - 0.02).toFixed(3)}) { if (abs(vEnvT.x) > ${(HW + 0.4).toFixed(2)} || abs(vEnvT.y) > ${(HH + 0.05).toFixed(2)}) discard; }
else if (abs(vEnvT.x) > uClipW) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= uEmis.x + uEmis.y * sin(uEmis.z + (vEnvT.x + uCamHW) * uEmis.w);
totalEmissiveRadiance += vColor.rgb * vEnvT.w * uEdge;`)
      .replace('#include <opaque_fragment>', `if (!gl_FrontFacing) outgoingLight = uCap;
else {
  outgoingLight *= uTint;
  outgoingLight = mix(outgoingLight, uFogCol * uTint, clamp((-vEnvT.z - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0) * uFog.z);
}
#include <opaque_fragment>`);
  };
  return m;
}

// ---- 粒子（四角の板を画面に向ける。位置は頂点シェーダーで時刻から計算＝CPU の毎フレーム処理なし） ----
const SPRITE_VS = `
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec3 aCol;
uniform float uTime, uCamHW, uStreak, uAmb, uEmit, uPar, uSprX; uniform vec3 uBox, uBoxC; uniform vec4 uVista;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec3 p; float a; float sz = aC.x; float st = 0.0;
  if (aA.w < 0.5) {            // 漂う粒: 箱の中を流れて端で折り返す（明るさが負なら「宇宙の塵」: 面の外でも見える）
    vec3 q = fract(aA.xyz + (aB.xyz * uTime - vec3(uCamHW * uPar + uSprX, 0.0, 0.0)) / uBox);
    p = (q - 0.5) * uBox + uBoxC;
    p.y += sin(uTime * aC.z + aB.w) * 0.45; p.x += cos(uTime * aC.z * 0.7 + aB.w * 1.7) * 0.35;
    vec3 e = min(q, 1.0 - q) * uBox;
    a = smoothstep(0.0, 2.5, min(e.x, min(e.y, e.z))) * (aC.w < 0.0 ? clamp(0.25 + uStreak, 0.0, 1.0) : uAmb) * (0.7 + 0.3 * sin(uTime * 2.6 + aB.w * 7.0));
    if (p.z > ${(-DEPTH - 0.5).toFixed(2)}) a *= 0.55;   // 戦場の中と手前は控えめ（弾を隠さない）
    st = uStreak;
  } else {                     // 噴き上がる粒: 遠景の決まった場所から出て消える
    float t = fract(uTime * aC.z + aB.w);
    float pd = aA.w;
    float lx = mod(aA.x - uCamHW + pd, 3.0 * pd) - pd;
    p = vec3(lx, aA.y, aA.z) + aB.xyz * t + vec3(sin(t * 5.0 + aB.w * 9.0) * 0.6 * t, 0.0, 0.0);
    p.y -= uVista.z;
    sz *= 0.35 + 1.3 * t;
    a = smoothstep(0.0, 0.12, t) * (1.0 - t) * uEmit;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * sz * length(modelMatrix[0].xyz) * vec2(1.0 + st, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = (vec2(mod(aC.y, 4.0), 3.0 - floor(aC.y / 4.0)) + uv) * 0.25;
  vCol = vec4(aCol * abs(aC.w), a);
}`;
const SPRITE_FS = `
uniform sampler2D map; uniform vec3 uTint; varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  gl_FragColor = vec4(t.rgb * vCol.rgb * a * mix(vec3(1.0), uTint, 0.6), a);
  #include <colorspace_fragment>
}`;
export class EnvSprites {
  constructor(U, tex, cap, additive) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.A = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.B = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.C = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.K = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    g.setAttribute('aA', this.A); g.setAttribute('aB', this.B); g.setAttribute('aC', this.C); g.setAttribute('aCol', this.K);
    g.instanceCount = 0;
    const u = { map: { value: tex } };
    for (const n of ['uTime', 'uCamHW', 'uStreak', 'uAmb', 'uEmit', 'uPar', 'uSprX', 'uBox', 'uBoxC', 'uVista', 'uTint']) u[n] = U[n];
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, transparent: true, depthWrite: false, premultipliedAlpha: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.cap = cap; this.n = 0; this.geo = g;
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }
  // 漂う粒（s: 箱の中の種 0..1）
  ambient(sx, sy, sz, vx, vy, vz, size, cell, wob, bright, col, phase) { this.put(sx, sy, sz, 0, vx, vy, vz, phase, size, cell, wob, bright, col); }
  // 噴き上がる粒（x: レイヤー内の位置・周期で繰り返す）
  emit(x, y, z, vx, vy, vz, size, cell, rate, bright, col, phase, period = 96) { this.put(x, y, z, period, vx, vy, vz, phase, size, cell, rate, bright, col); }
  put(ax, ay, az, aw, bx, by, bz, bw, cx, cy, cz, cw, col) {
    const i = this.n; if (i >= this.cap) return;
    this.A.setXYZW(i, ax, ay, az, aw); this.B.setXYZW(i, bx, by, bz, bw); this.C.setXYZW(i, cx, cy, cz, cw);
    _c.set(col); this.K.setXYZ(i, _c.r, _c.g, _c.b); this.n++;
  }
  commit() { this.geo.instanceCount = this.n; this.mesh.visible = this.n > 0; this.A.needsUpdate = this.B.needsUpdate = this.C.needsUpdate = this.K.needsUpdate = true; }
}

// ---- 星（等級・色温度・またたき・十字の光条・4 層の視差） -----------------------------------
export function makeStars(U, n = 1500) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), s = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = hash2(i, 1, 11) * 2 - 1, a = hash2(i, 2, 11) * TAU, rr = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * rr * 120, u * 120, Math.sin(a) * rr * 120], i * 3);
    const mag = Math.pow(hash2(i, 3, 11), 5);             // 明るい星は少ない
    const t = hash2(i, 4, 11);
    _c.set(t > 0.86 ? '#ffb48a' : t > 0.72 ? '#ffe2b0' : t > 0.45 ? '#ffffff' : t > 0.2 ? '#cfe0ff' : '#9ab8ff').multiplyScalar(0.35 + 0.65 * mag + hash2(i, 5, 11) * 0.25);
    col.set([_c.r, _c.g, _c.b], i * 3);
    s.set([1.6 + mag * 7.5, hash2(i, 6, 11) * TAU, i & 3], i * 3);   // 大きさ・位相・層
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPx: U.uPx, uStarRot: U.uStarRot, uStarK: U.uStarK },
    vertexShader: `attribute vec3 aS; attribute vec3 color; uniform float uTime, uPx, uStarRot, uStarK; varying vec4 vC; varying float vBig;
void main() {
  float a = uStarRot * (0.4 + 0.3 * aS.z), c = cos(a), s = sin(a);
  vec3 p = vec3(position.x * c + position.z * s, position.y, -position.x * s + position.z * c);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  float tw = 0.78 + 0.22 * sin(uTime * (1.5 + aS.z) + aS.y);
  gl_PointSize = max(1.5, aS.x * uPx * projectionMatrix[1][1] / 1980.0);
  vBig = smoothstep(4.0, 7.0, aS.x);
  vC = vec4(color * tw, uStarK);
}`,
    fragmentShader: `varying vec4 vC; varying float vBig;
void main() {
  vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
  float core = pow(max(0.0, 1.0 - d), 2.5);
  float ray = max(0.0, 1.0 - abs(q.x) * 14.0) * max(0.0, 1.0 - abs(q.y) * 2.0) + max(0.0, 1.0 - abs(q.y) * 14.0) * max(0.0, 1.0 - abs(q.x) * 2.0);
  float a = (core * (1.0 + vBig) + ray * vBig * 0.6) * vC.a;
  gl_FragColor = vec4(vC.rgb * a, 1.0);
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -2;
  return pts;
}

// ---- コースティクス（光の網）: 同じ模様を 2 枚ずらして重ね、暗い方を取る ----------------------
export function causticMaterial(U, tex, color) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: U.uTime, uCamHW: U.uCamHW, uTint: U.uTint, uCol: { value: new THREE.Color(color) }, uK: { value: 1 } },
    vertexShader: `uniform float uCamHW; varying vec2 vUv; varying vec2 vQ;
void main() { vUv = (position.xy + vec2(uCamHW * 0.5, 0.0)) / 46.0; vQ = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime, uK; uniform vec3 uCol, uTint; varying vec2 vUv; varying vec2 vQ;
void main() {
  float a = texture2D(map, vUv + vec2(uTime * 0.013, uTime * 0.021)).r, b = texture2D(map, vUv * 1.31 - vec2(uTime * 0.017, uTime * 0.009)).r;
  float e = min(vQ.x, 1.0 - vQ.x) * min(vQ.y, 1.0 - vQ.y) * 16.0;
  gl_FragColor = vec4(uCol * uTint * pow(min(a, b), 1.5) * 2.2 * clamp(e, 0.0, 1.0) * uK, 1.0);
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
  });
}
