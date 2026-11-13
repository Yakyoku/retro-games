// AEGIS RELAY — 3D の演出（光の板・爆発・破片・影・焦げ跡・爆発の照り返し）
// ・「光の板」= カメラを向く四角（または地面に寝た四角）をまとめて 1 回で描く。種類は小さなシェーダーで描き分ける
// ・粒はすべて配列の使い回し（M07）。動きは実時間 dt（M15）。速いものは進行方向に伸ばして残像にする（M14）
// ・層は 3 つ: ground（影・焦げ跡。地形の上にだけ出る）/ fx（爆発・炎・光。奥行きあり）/ top（敵弾・自機弾。必ずいちばん上）
import * as THREE from 'three';
import { noiseTexture, shared, clamp } from './util3d.js';

const VERT = /* glsl */`
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar;
#include <common>
#include <clipping_planes_pars_vertex>
void main() {
  vUv = uv; vCol = iB; vPar = iC;
  vec2 c = position.xy;
  float sc = length(modelViewMatrix[0].xyz);
  vec4 mvPosition = modelViewMatrix * vec4(iA.xyz, 1.0);
  float cs = cos(iC.z), sn = sin(iC.z);
  if (iD.w > 0.0) {            // 進行方向に伸ばす（残像・炎・光線）
    vec3 dv = normalize((modelViewMatrix * vec4(iD.xyz, 0.0)).xyz);
    vec3 side = cross(dv, normalize(mvPosition.xyz)); float sl = length(side); side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
    mvPosition.xyz += (side * c.x * iA.w + dv * (c.y + 0.5) * iA.w * iD.w) * sc;
  } else if (iD.w < 0.0) {     // 地面に寝かせる
    vec3 off = vec3(c.x * cs - c.y * sn, 0.0, c.x * sn + c.y * cs) * iA.w;
    mvPosition = modelViewMatrix * vec4(iA.xyz + off, 1.0);
  } else {                     // カメラを向く
    mvPosition.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * iA.w * sc;
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const FRAG = /* glsl */`
uniform sampler2D tNoise; uniform float uTime; uniform float uHalo;
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar;
#include <common>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec2 p = vUv - 0.5; float d = length(p) * 2.0;
  float kind = vPar.x, t = vPar.y, seed = vPar.z, add = vPar.w;
  vec3 col = vCol.rgb; float a = 0.0;
  if (kind < 0.5) {                 // 0: やわらかい光（発光のにじみの代わり）
    float g = max(0.0, 1.0 - d); a = g * g * (0.55 + 0.45 * g) * uHalo;
  } else if (kind < 1.5) {          // 1: 火球（ノイズで縁が崩れていく）
    vec2 q = vUv * 0.5 + vec2(seed * 0.37, seed * 0.61);
    float n = texture2D(tNoise, q + vec2(0.0, -t * 0.16)).r * 0.65 + texture2D(tNoise, q * 2.3 + vec2(t * 0.1, 0.0)).g * 0.35;
    float v = (1.0 - d) * 1.5 + n * 1.15 - (0.55 + t * 1.5);
    a = smoothstep(0.0, 0.3, v);
    float heat = clamp(v * 1.3 + (1.0 - t) * 0.55 - 0.15, 0.0, 1.0);
    vec3 ramp = mix(vec3(0.45, 0.05, 0.01), vec3(1.0, 0.36, 0.05), smoothstep(0.0, 0.4, heat));
    ramp = mix(ramp, vec3(1.0, 0.8, 0.32), smoothstep(0.35, 0.75, heat)); ramp = mix(ramp, vec3(1.0), smoothstep(0.75, 1.0, heat));
    col = ramp * col * (1.0 + 0.7 * heat);
  } else if (kind < 2.5) {          // 2: 煙
    vec2 q = vUv * 0.45 + vec2(seed * 0.53, seed * 0.29);
    float n = texture2D(tNoise, q + vec2(0.0, -t * 0.08)).r;
    float v = (1.0 - d) * 1.3 + n * 0.9 - (0.55 + t * 0.5);
    a = smoothstep(0.0, 0.5, v) * (1.0 - t * t);
    col *= 0.55 + 0.7 * n;
  } else if (kind < 3.5) {          // 3: 火花（伸ばして使う。頭が明るい）
    float w = max(0.0, 1.0 - abs(p.x) * 2.0), l = 1.0 - vUv.y;
    a = w * w * l * (1.0 - smoothstep(0.8, 1.0, l)) * 1.4;
    col = mix(col, vec3(1.0), w * w * l * 0.7);
  } else if (kind < 4.5) {          // 4: 衝撃波の輪（t で細くなる）
    float w = mix(0.26, 0.05, t), r0 = 1.0 - w, x = (d - r0) / w;
    a = smoothstep(-1.0, -0.15, x) * (1.0 - smoothstep(0.25, 1.0, x)) + 0.14 * (1.0 - t) * d * step(d, r0);
    a *= 1.0 - smoothstep(0.97, 1.0, d);
  } else if (kind < 5.5) {          // 5: 敵弾（暗い縁 → 桃色 → 白い芯。脈動）
    float pulse = 0.5 + 0.5 * sin(uTime * 13.0 + seed);
    float rim = 1.0 - smoothstep(0.52, 0.60, d);
    float body = 1.0 - smoothstep(0.40, 0.47, d);
    float core = 1.0 - smoothstep(0.15 + 0.05 * pulse, 0.27 + 0.05 * pulse, d);
    col = mix(vec3(0.04, 0.0, 0.03), vCol.rgb * (1.15 + 0.6 * pulse), body); col = mix(col, vec3(1.25), core);
    float halo = pow(max(0.0, 1.0 - d), 2.0) * (0.35 + 0.2 * pulse);
    col = mix(vCol.rgb * 1.3, col, step(d, 0.6));
    a = max(rim, halo);
  } else if (kind < 6.5) {          // 6: 推進炎（y=0 が噴射口。白い芯＋色の外炎、ゆらぐ）
    float y = vUv.y, x = abs(p.x) * 2.0;
    float n = texture2D(tNoise, vec2(p.x * 0.5 + seed, y * 0.45 - uTime * 2.4 + seed)).g;
    float w = (1.0 - y) * (0.5 + 0.4 * n) * smoothstep(0.0, 0.07, y) + 0.015;
    float f = 1.0 - smoothstep(w * 0.25, w, x);
    a = f * (1.0 - y * y);
    float corev = (1.0 - smoothstep(0.0, w * 0.5, x)) * (1.0 - y);
    col = mix(col * 1.5, vec3(1.6), corev);
  } else if (kind < 7.5) {          // 7: 自機弾（白い芯＋光の縁＋尾）
    float x = abs(p.x) * 2.0, y = vUv.y;
    float body = smoothstep(0.0, 0.7, y) * (1.0 - smoothstep(0.9, 1.0, y));
    float edge = (1.0 - smoothstep(0.3, 1.0, x)) * body;
    float corev = (1.0 - smoothstep(0.08, 0.38, x)) * smoothstep(0.5, 0.8, y) * (1.0 - smoothstep(0.93, 1.0, y));
    a = edge * 0.9; col = mix(col * 1.05, vec3(1.25), corev);
  } else if (kind < 8.5) {          // 8: 細い輪（t=太さの割合。最小 1.5 画素を保つ）
    float w = max(t, fwidth(d) * 1.5), x = abs(d - (1.0 - w)) / w;
    a = 1.0 - smoothstep(0.45, 1.0, x);
  } else if (kind < 9.5) {          // 9: 回転体の残像
    float ang = atan(p.y, p.x);
    a = smoothstep(0.3, 0.6, d) * (1.0 - smoothstep(0.82, 1.0, d)) * (0.5 + 0.5 * sin(ang * 3.0 + seed));
  } else if (kind < 10.5) {         // 10: 光の糸（伸ばして使う）
    float x = abs(p.x) * 2.0;
    float n = texture2D(tNoise, vec2(vUv.y * 0.7 + seed, uTime * 1.7)).g;
    a = (1.0 - smoothstep(0.0, 0.45 + 0.55 * n, x)) * (0.55 + 0.7 * n) * smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.94, 1.0, vUv.y));
    col = mix(col, vec3(1.3), (1.0 - smoothstep(0.0, 0.22, x)) * 0.8);
  } else if (kind < 11.5) {         // 11: 十字の光条
    vec2 q = abs(p) * 2.0;
    a = max(0.0, 1.0 - q.x) * exp(-q.y * 20.0) + max(0.0, 1.0 - q.y) * exp(-q.x * 20.0) + pow(max(0.0, 1.0 - d), 3.0);
  } else if (kind < 12.5) {         // 12: 焦げ跡
    float n = texture2D(tNoise, vUv * 0.8 + seed).r;
    a = smoothstep(0.0, 0.5, (1.0 - d) * 1.25 + n * 0.8 - 0.8);
  } else {                          // 13: やわらかい影
    float g = max(0.0, 1.0 - d); a = g * g * (3.0 - 2.0 * g);
  }
  a = clamp(a * vCol.a, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - add));
}`;

// 1 層ぶんの「光の板」
function makeLayer(cap, clip, parent, o) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const arr = {};
  for (const n of ['iA', 'iB', 'iC', 'iD']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); arr[n] = a.array; }
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { tNoise: { value: noiseTexture() }, uTime: shared.time, uHalo: o.halo || { value: 1 } },
    clipping: true, clippingPlanes: clip, transparent: o.transparent !== false, depthWrite: false, depthTest: o.depthTest !== false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: o.blendSrc ?? THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  if (o.depthFunc != null) mat.depthFunc = o.depthFunc;
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = o.order; parent.add(mesh);
  const L = { n: 0, cap, mesh, mat,
    begin() { L.n = 0; },
    // kind: 上のシェーダーの番号。stretch>0 = (dx,dy,dz) へ伸ばす / <0 = 地面に寝かせる / 0 = カメラを向く
    put(x, y, z, size, r, g, b, a, kind, t = 0, seed = 0, add = 1, dx = 0, dy = 0, dz = 0, stretch = 0) {
      if (L.n >= cap) return; const o4 = L.n++ * 4;
      const A = arr.iA, B = arr.iB, C = arr.iC, D = arr.iD;
      A[o4] = x; A[o4 + 1] = y; A[o4 + 2] = z; A[o4 + 3] = size;
      B[o4] = r; B[o4 + 1] = g; B[o4 + 2] = b; B[o4 + 3] = a;
      C[o4] = kind; C[o4 + 1] = t; C[o4 + 2] = seed; C[o4 + 3] = add;
      D[o4] = dx; D[o4 + 1] = dy; D[o4 + 2] = dz; D[o4 + 3] = stretch;
    },
    end() { geo.instanceCount = L.n; mesh.visible = L.n > 0; if (L.n) for (const n of ['iA', 'iB', 'iC', 'iD']) { const at = geo.attributes[n]; at.clearUpdateRanges(); at.addUpdateRange(0, L.n * 4); at.needsUpdate = true; } },
  };
  return L;
}

const _c = new THREE.Color();
const rgbOf = (hex, out) => { _c.set(hex); out[0] = _c.r; out[1] = _c.g; out[2] = _c.b; return out; };
const tmp3 = [0, 0, 0];

export function createFx(board, clip, debrisGeo, hullMat, getOpts) {
  const halo = { value: 1 };
  const ground = makeLayer(160, clip, board, { order: 1, transparent: false, depthFunc: THREE.GreaterDepth, blendSrc: THREE.ZeroFactor });
  const fx = makeLayer(1100, clip, board, { order: 14, halo });
  const top = makeLayer(520, clip, board, { order: 22, depthTest: false, halo });

  // ── 粒（配列の使い回し）──
  const N = 760;
  const F = (n = N) => new Float32Array(n);
  const P = { x: F(), y: F(), z: F(), vx: F(), vy: F(), vz: F(), age: F(), life: F(), s0: F(), s1: F(), r: F(), g: F(), b: F(), a: F(), kind: F(), seed: F(), add: F(), drag: F(), grav: F(), st: F(), on: new Uint8Array(N) };
  let head = 0, live = 0;
  function spawn(kind, x, y, z, vx, vy, vz, life, s0, s1, hex, a = 1, add = 1, drag = 2, grav = 0, st = 0, delay = 0) {
    let i = -1;
    for (let k = 0; k < N; k++) { const j = (head + k) % N; if (!P.on[j]) { i = j; break; } }
    if (i < 0) { i = head; }          // 満杯ならいちばん古い場所を上書き
    head = (i + 1) % N;
    rgbOf(hex, tmp3);
    P.on[i] = 1; P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.age[i] = -delay; P.life[i] = life; P.s0[i] = s0; P.s1[i] = s1;
    P.r[i] = tmp3[0]; P.g[i] = tmp3[1]; P.b[i] = tmp3[2]; P.a[i] = a; P.kind[i] = kind; P.seed[i] = Math.random() * 6.283; P.add[i] = add; P.drag[i] = drag; P.grav[i] = grav; P.st[i] = st;
  }
  // ── 破片（小さな金属片。回りながら散って落ちる）──
  const DN = 72;
  const deb = new THREE.InstancedMesh(debrisGeo, hullMat, DN); deb.frustumCulled = false; deb.renderOrder = 3; deb.count = 0; deb.visible = false; board.add(deb);
  deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  deb.geometry.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(DN * 4), 4));
  deb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DN * 3).fill(1), 3);
  const D = { x: F(DN), y: F(DN), z: F(DN), vx: F(DN), vy: F(DN), vz: F(DN), rx: F(DN), ry: F(DN), wx: F(DN), wy: F(DN), age: F(DN), life: F(DN), s: F(DN), on: new Uint8Array(DN) };
  let dHead = 0;
  function debris(x, y, z, n, speed, size, hex) {
    rgbOf(hex, tmp3);
    for (let k = 0; k < n; k++) {
      const i = dHead; dHead = (dHead + 1) % DN;
      const a = Math.random() * 6.283, v = speed * (0.35 + Math.random() * 0.65);
      D.on[i] = 1; D.x[i] = x; D.y[i] = y; D.z[i] = z; D.vx[i] = Math.cos(a) * v; D.vz[i] = Math.sin(a) * v; D.vy[i] = 20 + Math.random() * 50;
      D.rx[i] = Math.random() * 6; D.ry[i] = Math.random() * 6; D.wx[i] = (Math.random() - 0.5) * 22; D.wy[i] = (Math.random() - 0.5) * 22; D.age[i] = 0; D.life[i] = 0.7 + Math.random() * 0.7; D.s[i] = size * (0.6 + Math.random() * 0.9);
      deb.instanceColor.array[i * 3] = tmp3[0]; deb.instanceColor.array[i * 3 + 1] = tmp3[1]; deb.instanceColor.array[i * 3 + 2] = tmp3[2];
    }
    deb.instanceColor.needsUpdate = true;
  }
  // ── 爆発の照り返し（地形の材質が読む）と焦げ跡 ──
  const lights = []; for (let i = 0; i < 4; i++) lights.push({ pos: new THREE.Vector3(0, -999, 0), col: new THREE.Color(0, 0, 0), k: 0, r: 40, base: new THREE.Color() });
  let lHead = 0;
  function light(x, y, z, hex, power, radius) { const L = lights[lHead]; lHead = (lHead + 1) % 4; L.pos.set(x, y, z); L.base.set(hex); L.k = power * getOpts().flash; L.r = radius; }
  const SC = 20; const scorch = []; for (let i = 0; i < SC; i++) scorch.push({ on: false, x: 0, wy: 0, s: 0, seed: 0, age: 0 }); let sHead = 0;
  function addScorch(x, wy, size) { const s = scorch[sHead]; sHead = (sHead + 1) % SC; s.on = true; s.x = x; s.wy = wy; s.s = size; s.seed = Math.random() * 6; s.age = 0; }

  const R = Math.random;
  const api = {
    ground, fx, top, halo, lights, spawn, debris, light, addScorch,
    clearScorch() { for (const s of scorch) s.on = false; },
    // 火花の束
    sparks(x, y, z, n, speed, hex, life = 0.4, size = 1.6) {
      for (let i = 0; i < n; i++) { const a = R() * 6.283, e = (R() - 0.25) * 1.3, v = speed * (0.35 + R() * 0.65); spawn(3, x, y, z, Math.cos(a) * v, e * v * 0.7, Math.sin(a) * v, life * (0.6 + R() * 0.7), size, size * 0.4, hex, 1, 1, 2.6, -70, 1); }
    },
    // 多段の爆発（C21）: 閃光 → 火球 → 破片 → 煙 → 衝撃波。big は連鎖
    explode(x, y, z, r, big, tint, o = {}) {
      const q = getOpts(), lite = q.lite, n = (k) => (lite ? Math.ceil(k * 0.5) : k);
      const sz = r * (big ? 1.35 : 1.1);
      spawn(0, x, y + 1, z, 0, 0, 0, big ? 0.16 : 0.11, sz * 3.2, sz * 4.6, 0xfff0d0, 0.55 * (0.25 + 0.75 * q.flash), 1, 0);                                 // 閃光
      for (let i = 0; i < n(big ? 7 : 3); i++) { const a = R() * 6.283, d = R() * sz * 0.5; spawn(1, x + Math.cos(a) * d, y + R() * 3, z + Math.sin(a) * d, Math.cos(a) * 12, 8 + R() * 12, Math.sin(a) * 12, 0.42 + R() * 0.38, sz * 1.0, sz * 2.1, 0xffffff, 0.95, 0.45, 1.6, 0, 0, i * 0.025); } // 火球
      if (big) for (let i = 0; i < n(6); i++) { const a = R() * 6.283, d = sz * (0.5 + R() * 1.0), dl = 0.12 + i * 0.085; // 連鎖
        spawn(0, x + Math.cos(a) * d, y + 2, z + Math.sin(a) * d, 0, 0, 0, 0.09, sz * 1.6, sz * 2.4, 0xffe8c0, 0.45 * q.flash, 1, 0, 0, 0, dl);
        spawn(1, x + Math.cos(a) * d, y + R() * 4, z + Math.sin(a) * d, 0, 10, 0, 0.4 + R() * 0.3, sz * 0.7, sz * 1.5, 0xffffff, 0.95, 0.45, 1.5, 0, 0, dl); }
      for (let i = 0; i < n(big ? 5 : 2); i++) { const a = R() * 6.283, d = R() * sz * 0.5; spawn(2, x + Math.cos(a) * d, y + 2, z + Math.sin(a) * d, Math.cos(a) * 8, 10 + R() * 10, Math.sin(a) * 8, 0.9 + R() * 0.7, sz * 1.2, sz * 2.6, 0x3a3038, 0.5, 0, 1.2, 0, 0, 0.12 + R() * 0.2); } // 煙
      api.sparks(x, y, z, n(big ? 26 : 12), big ? 150 : 100, 0xffc880, big ? 0.6 : 0.42, big ? 2.0 : 1.5);
      spawn(4, x, y, z, 0, 0, 0, big ? 0.55 : 0.34, sz * 1.5, sz * (big ? 9 : 6), 0xffb070, 0.45, 1, 0, 0, -1);                                                // 衝撃波
      debris(x, y, z, n(big ? 12 : 5), big ? 85 : 60, big ? 1.5 : 1.0, tint ?? 0xb8c0cc);
      light(x, y, z, 0xffa050, big ? 1.0 : 0.55, sz * (big ? 8 : 6));
      if (o.scorchWy != null) addScorch(x, o.scorchWy, sz * (big ? 3.4 : 2.6));
    },
    // 1 フレームぶん進めて、fx 層へ書き出す（begin 済みの fx に追記する）
    update(dt, run, scroll) {
      const k = run ? dt : 0;
      for (let i = 0; i < N; i++) {
        if (!P.on[i]) continue;
        P.age[i] += k;
        const age = P.age[i]; if (age < 0) continue;
        if (age >= P.life[i]) { P.on[i] = 0; continue; }
        const dr = Math.exp(-P.drag[i] * k);
        P.vx[i] *= dr; P.vy[i] = P.vy[i] * dr + P.grav[i] * k; P.vz[i] *= dr;
        P.x[i] += P.vx[i] * k; P.y[i] += P.vy[i] * k; P.z[i] += P.vz[i] * k;
        const t = age / P.life[i], kind = P.kind[i];
        const size = P.s0[i] + (P.s1[i] - P.s0[i]) * (kind === 4 ? 1 - (1 - t) * (1 - t) : t);
        let al = P.a[i];
        if (kind === 0 || kind === 3) al *= 1 - t; else if (kind === 4) al *= (1 - t) * (1 - t);
        const st = P.st[i];
        if (st > 0) { const sp = Math.hypot(P.vx[i], P.vy[i], P.vz[i]) + 1e-3; fx.put(P.x[i], P.y[i], P.z[i], size, P.r[i], P.g[i], P.b[i], al, kind, t, P.seed[i], P.add[i], -P.vx[i] / sp, -P.vy[i] / sp, -P.vz[i] / sp, clamp(sp * 0.05, 1, 9) * st); }
        else fx.put(P.x[i], P.y[i], P.z[i], size, P.r[i], P.g[i], P.b[i], al, kind, t, P.seed[i], P.add[i], 0, 0, 0, st);
      }
      // 破片
      let dn = 0; const m = deb.instanceMatrix.array;
      for (let i = 0; i < DN; i++) {
        let s = 0;
        if (D.on[i]) {
          D.age[i] += k; if (D.age[i] >= D.life[i]) D.on[i] = 0;
          else { D.vy[i] -= 120 * k; D.x[i] += D.vx[i] * k; D.y[i] += D.vy[i] * k; D.z[i] += D.vz[i] * k; D.rx[i] += D.wx[i] * k; D.ry[i] += D.wy[i] * k; s = D.s[i] * Math.min(1, (1 - D.age[i] / D.life[i]) * 3); dn = i + 1; }
        }
        const o = i * 16, cx = Math.cos(D.rx[i]), sx = Math.sin(D.rx[i]), cy = Math.cos(D.ry[i]), sy = Math.sin(D.ry[i]);
        m[o] = cy * s; m[o + 1] = 0; m[o + 2] = -sy * s; m[o + 3] = 0;
        m[o + 4] = sy * sx * s; m[o + 5] = cx * s; m[o + 6] = cy * sx * s; m[o + 7] = 0;
        m[o + 8] = sy * cx * s; m[o + 9] = -sx * s; m[o + 10] = cy * cx * s; m[o + 11] = 0;
        m[o + 12] = D.x[i]; m[o + 13] = D.y[i]; m[o + 14] = D.z[i]; m[o + 15] = 1;
      }
      deb.count = dn; deb.visible = dn > 0; if (dn) deb.instanceMatrix.needsUpdate = true;
      // 照り返し: すばやく消える
      for (const L of lights) { L.k *= Math.exp(-7 * k); if (L.k < 0.01) L.k = 0; L.col.copy(L.base).multiplyScalar(L.k); }
      // 焦げ跡: 地形と一緒に流れる
      for (const s of scorch) { if (!s.on) continue; s.age += k; const z = scroll - s.wy - 160; if (z > 190) { s.on = false; continue; } ground.put(s.x - 120, -1.2, z, s.s, 0, 0, 0, 0.62 * Math.min(1, s.age * 4), 12, 0, s.seed, 0, 0, 0, 0, -1); }
    },
    reset() { P.on.fill(0); D.on.fill(0); for (const L of lights) L.k = 0; api.clearScorch(); },
  };
  return api;
}
