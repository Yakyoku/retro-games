// AEGIS RELAY — 浮遊大陸（高さのある地表・地層の崖・垂れ下がる岩と結晶・遺跡・導線・滝・コアの島の基壇）
// ・島 1 つ = 地表 / 崖 / 飾り（遺跡・結晶・導線）/ 滝 の 4 つの形にまとめる（描画 4 回）。盤面に入っている島だけ表示する
// ・地形は area-gen.js の輪郭（判定と同じデータ）から作る。高さは見た目だけで、判定には入らない
// ・作るのに時間がかかるので generator で島ごと・部位ごとに区切り、エリアの導入中に少しずつ進める（M10）
import * as THREE from 'three';
import { THEMES, AREAS, GROUND } from '../shared/rules.js';
import { HW, HH, rng, fbm, lerp, clamp, smooth, part, merge, slab, box, cyl, octa, torus, shared, noiseTexture } from './util3d.js';
import { bakeTheme, bakeCliff, TILE } from './themes3d.js';

const PI = Math.PI, TAU = PI * 2;
// テーマごとの地形のくせ: amp=起伏、terrace=段の高さ（0 でなし）、fall=縁から落ちるもの [色, 太さ, 速さ, 不透明]
const SHAPE = {
  ash: { amp: 1.0, terrace: 0, fall: [0xb8b4a8, 0.5, 0.55, 0.5] }, ice: { amp: 0.55, terrace: 0, fall: [0xcff4ff, 0.6, 0.35, 0.55] },
  ember: { amp: 1.15, terrace: 1.7, fall: [0xff7a28, 0.35, 0.5, 0.95] }, mech: { amp: 0.5, terrace: 1.1, fall: [0x9cffd0, 0.3, 0.9, 0.5] },
  moss: { amp: 1.1, terrace: 0, fall: [0xbfe8ff, 0.8, 0.8, 0.6] }, gold: { amp: 0.4, terrace: 0.9, fall: [0xffe08a, 0.4, 0.4, 0.6] },
  obsid: { amp: 1.3, terrace: 0, fall: [0xc99cff, 0.3, 0.6, 0.7] }, zenith: { amp: 0.45, terrace: 1.0, fall: [0xffffff, 0.4, 0.5, 0.7] },
};

// 地表・崖の材質: 標準の PBR に「テーマの発光（溶岩の脈動・灯の点滅など）」と「爆発の照り返し」を足す
function makeGroundMaterial(clip, lights, uScroll, top) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: top ? 1 : 0.95, metalness: top ? 1 : 0.04, clippingPlanes: clip, envMapIntensity: top ? 0.9 : 0.45, side: top ? THREE.FrontSide : THREE.DoubleSide });
  const U = { uEm: { value: 0 }, uEmCol: { value: new THREE.Color() }, uEmMode: { value: 0 }, uTime: shared.time, uGlow: shared.glow, uScroll,
    uLP: { value: lights.map((l) => l.pos) }, uLC: { value: lights.map((l) => l.col) }, uLR: { value: new Float32Array(4) } };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; uniform float uScroll;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLoc; uniform float uEm, uEmMode, uTime, uGlow, uScroll; uniform vec3 uEmCol; uniform vec3 uLP[4]; uniform vec3 uLC[4]; uniform float uLR[4];`)
      .replace('#include <emissivemap_fragment>', `
      {
        float emk = 0.0;
        #ifdef USE_ROUGHNESSMAP
          emk = texelRoughness.r;
        #endif
        float md = 0.75 + 0.25 * sin(uTime * 1.7 + vLoc.z * 0.03 + vLoc.x * 0.02);
        if (uEmMode > 0.5 && uEmMode < 1.5) md = 0.5 + 0.5 * sin(uTime * 2.1 + vLoc.x * 0.07 + sin(vLoc.z * 0.05) * 2.0);                      // 脈動（溶岩・脈）
        else if (uEmMode > 1.5 && uEmMode < 2.5) { vec2 cell = floor(vLoc.xz / 5.3333); md = 0.25 + 0.75 * step(0.4, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.55)); } // 灯の点滅
        else if (uEmMode > 2.5) md = 0.35 + 0.65 * abs(sin(uTime * 2.6 + vLoc.x * 0.9 + vLoc.z * 1.3));                                        // きらめき
        totalEmissiveRadiance = uEmCol * emk * uEm * md * uGlow;
        vec3 bp = vec3(vLoc.x, vLoc.y, vLoc.z + uScroll);
        for (int i = 0; i < 4; i++) { float at = max(0.0, 1.0 - distance(bp, uLP[i]) / max(uLR[i], 1.0)); totalEmissiveRadiance += diffuseColor.rgb * uLC[i] * at * at; } // 爆発の照り返し
      }`);
  };
  m.customProgramCacheKey = () => 'ground' + (top ? 't' : 'c');
  return m;
}

// 縁から落ちる滝・砂・光の粒（下へ流れる縞。下端でぼかす）
function makeFallMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: noiseTexture() }, uTime: shared.time, uCol: { value: new THREE.Color() }, uP: { value: new THREE.Vector3(0.5, 0.5, 0.6) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, clipping: true, clippingPlanes: clip, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute float aSeed; varying vec2 vUv; varying float vSeed;
      #include <common>
      #include <clipping_planes_pars_vertex>
      void main(){ vUv = uv; vSeed = aSeed; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `uniform sampler2D tNoise; uniform float uTime; uniform vec3 uCol; uniform vec3 uP; varying vec2 vUv; varying float vSeed;
      #include <common>
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float n = texture2D(tNoise, vec2(vUv.x * 0.35 + vSeed, vUv.y * 0.6 - uTime * uP.y)).g;
        float n2 = texture2D(tNoise, vec2(vUv.x * 0.9 + vSeed * 3.0, vUv.y * 1.7 - uTime * uP.y * 1.9)).r;
        float streak = smoothstep(1.0 - uP.x, 1.0 - uP.x + 0.25, n * 0.6 + n2 * 0.4 + 0.25);
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x - 0.5) * 2.0);
        float a = streak * edge * (1.0 - smoothstep(0.35, 1.0, vUv.y)) * smoothstep(0.0, 0.04, vUv.y) * uP.z;
        gl_FragColor = vec4(uCol * (0.7 + 0.8 * n2), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * a, a * 0.55);
      }` });
}

export function createTerrain(scrollG, clip, lights, decorMat, jobs, getOpts) {
  const uScroll = { value: 0 };
  const topMat = makeGroundMaterial(clip, lights, uScroll, true), cliffMat = makeGroundMaterial(clip, lights, uScroll, false), fallMat = makeFallMaterial(clip);
  let themeTex = null, themeName = '', cur = null, gen = 0;
  const _c = new THREE.Color(), _c2 = new THREE.Color();

  // ── 島の輪郭（なめらかにした左右の縁）──
  function makeSpan(isl, seed) {
    const n = isl.left.length, cr = (a, f) => { const i = clamp(Math.floor(f), 0, n - 2), t = f - i, p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(n - 1, i + 2)]; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); };
    const raw = (wy) => { const f = clamp((wy - isl.wy0) / isl.step, 0, (isl.wy1 - isl.wy0) / isl.step); return [cr(isl.left, f), cr(isl.right, f)]; };
    const e0 = raw(isl.wy0), e1 = raw(isl.wy1), c0 = Math.min(18, (e0[1] - e0[0]) * 0.42), c1 = Math.min(18, (e1[1] - e1[0]) * 0.42);
    const span = (wy) => {
      let L, R;
      if (wy < isl.wy0) { const t = Math.min(0.985, (isl.wy0 - wy) / c0), k = Math.sqrt(1 - t * t), c = (e0[0] + e0[1]) / 2, h = (e0[1] - e0[0]) / 2 * k; L = c - h; R = c + h; }
      else if (wy > isl.wy1) { const t = Math.min(0.985, (wy - isl.wy1) / c1), k = Math.sqrt(1 - t * t), c = (e1[0] + e1[1]) / 2, h = (e1[1] - e1[0]) / 2 * k; L = c - h; R = c + h; }
      else [L, R] = raw(wy);
      L -= (fbm(wy / 11, 3.3, seed, 3) - 0.5) * 7; R += (fbm(wy / 11, 8.8, seed + 4, 3) - 0.5) * 7; // 海岸線の細かい出入り
      return [L, R];
    };
    return { span, wyA: isl.wy0 - c0 * 0.97, wyB: isl.wy1 + c1 * 0.97 };
  }

  // ── 高さ（見た目だけ）。標的のまわりは平らな台にする ──
  function makeHeight(isl, sp, pads, shape, seed) {
    return (x, wy, L, R) => {
      const n = fbm(x / 40, wy / 40, seed, 4), rg = 1 - Math.abs(fbm(x / 23 + 9, wy / 23, seed + 5, 3) * 2 - 1);
      let h = ((n - 0.42) * 10 + rg * rg * 2.4 - 0.5) * shape.amp;
      if (h < -0.5) h = -0.5 + (h + 0.5) * 0.25;
      if (shape.terrace) { const s = shape.terrace, q = h / s, f = q - Math.floor(q); h = (Math.floor(q) + smooth(0.72, 1, f)) * s; }
      const d = Math.min(x - L, R - x, (wy - sp.wyA) * 1.2, (sp.wyB - wy) * 1.2);
      h = h * smooth(0, 11, d) + 0.7 * smooth(0, 2.5, d) * (1 - smooth(2.5, 7, d)) - 0.6 * (1 - smooth(0, 1.6, d));
      for (const p of pads) { const dd = Math.hypot(x - p.x, wy - p.wy); if (dd < p.r1) h *= smooth(p.r0, p.r1, dd); }
      return h;
    };
  }

  // ── 遺跡（壊れない飾り。くすんだ石。小さな紋様だけがテーマ色で光る）──
  function ruinParts(kind, s, r, th) {
    const stone = (k = 1) => ({ c: _c.set(th.ruin).multiplyScalar(k * (0.85 + r() * 0.25)).getHex(), m: 0.04, r: 0.88 });
    const glyph = { c: th.glow, e: 1.5, f: 4 };
    const q = [];
    if (kind === 'pillar') { // 柱列: 溝のある柱 3 本＋梁（1 本は折れている）
      for (let i = 0; i < 3; i++) { const x = (i - 1) * 6.4, broken = i === 2 && r() < 0.7, hgt = broken ? 4.5 + r() * 3 : 11.5;
        q.push(part(box(3.6, 1.0, 3.6, 0.3), stone(0.9), { p: [x, 0.5, 0] })); q.push(part(cyl(1.25, 1.45, hgt, 10), stone(), { p: [x, 1 + hgt / 2, 0] }));
        for (let k = 0; k < 5; k++) { const a = (k / 5) * PI; q.push(part(box(0.25, hgt * 0.9, 2.95), stone(0.6), { p: [x, 1 + hgt / 2, 0], r: [0, a, 0] })); }
        if (!broken) q.push(part(box(3.4, 0.9, 3.4, 0.3), stone(1.05), { p: [x, 12.9, 0] })); else q.push(part(cyl(1.3, 1.3, 2.6, 10), stone(0.9), { p: [x + 3.2, 0.9, 2.6 + r() * 2], r: [PI / 2, r() * 3, 0] })); }
      q.push(part(box(10.6, 1.6, 3.2, 0.4), stone(1.1), { p: [-3.2, 14.1, 0] })); q.push(part(box(6.4, 0.35, 0.3), glyph, { p: [-3.2, 14.1, 1.62] }));
    } else if (kind === 'slab') { // 階段と祭壇
      for (let i = 0; i < 4; i++) q.push(part(box(15 - i * 3.2, 1.2, 9 - i * 1.6, 0.25), stone(0.9 + i * 0.05), { p: [0, 0.6 + i * 1.2, -i * 0.8] }));
      q.push(part(box(3.4, 2.6, 2.6, 0.4), stone(1.1), { p: [0, 6.0, -2.4] })); q.push(part(box(2.2, 0.3, 1.6), glyph, { p: [0, 7.36, -2.4] }));
      for (const sx of [-1, 1]) q.push(part(box(1.4, 3.4, 1.4, 0.3), stone(), { p: [sx * 6.6, 1.7, 3.4] }));
    } else if (kind === 'arch') { // 石のアーチ
      const sh = new THREE.Shape(); const r0 = 4.2, r1 = 6.4; for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI; i ? sh.lineTo(Math.cos(a) * r1, Math.sin(a) * r1) : sh.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); } for (let i = 12; i >= 0; i--) { const a = (i / 12) * PI; sh.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
      const ag = new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1, curveSegments: 4 }); ag.translate(0, 7, -1.3); q.push(part(ag, stone()));
      for (const sx of [-1, 1]) { q.push(part(box(2.8, 7, 3.2, 0.35), stone(0.95), { p: [sx * 5.3, 3.5, 0] })); q.push(part(box(3.6, 1.0, 4.0, 0.3), stone(0.85), { p: [sx * 5.3, 0.5, 0] })); q.push(part(box(3.4, 0.8, 3.8, 0.3), stone(1.1), { p: [sx * 5.3, 7.1, 0] })); }
      q.push(part(box(1.5, 1.9, 3.0, 0.3), stone(1.15), { p: [0, 12.6, 0] })); q.push(part(box(0.8, 1.0, 0.3), glyph, { p: [0, 12.6, 1.55] }));
    } else { // 環状の列石
      q.push(part(cyl(6.6, 7.2, 0.9, 20), stone(0.9), { p: [0, 0.45, 0] })); q.push(part(cyl(4.6, 4.9, 0.6, 18), stone(1.0), { p: [0, 1.1, 0] })); q.push(part(torus(3.4, 0.22, 4, 20), glyph, { p: [0, 1.45, 0] }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, fallen = r() < 0.25, hh = 3.5 + r() * 3; q.push(part(box(1.5, hh, 1.1, 0.3), stone(), fallen ? { p: [Math.cos(a) * 7.6, 0.7, Math.sin(a) * 7.6], r: [PI / 2, a, 0] } : { p: [Math.cos(a) * 5.8, 0.9 + hh / 2, Math.sin(a) * 5.8], r: [0, -a, (r() - 0.5) * 0.2] })); }
    }
    const g = merge(q); if (s !== 1) g.scale(s, s, s); return g;
  }

  // ── 島 1 つを組み立てる（generator。途中で yield して次のフレームへ）──
  function* buildIsland(isl, idx, def, theme, group, areaSeed, isCore) {
    const th = THEMES[theme], shape = SHAPE[theme], seed = areaSeed * 31 + idx * 7 + 1, r = rng(seed * 977 + 13);
    const sp = makeSpan(isl, seed);
    const inIsl = (x, wy, m = 0) => { if (wy < sp.wyA || wy > sp.wyB) return false; const [L, R] = sp.span(wy); return x > L + m && x < R - m; };
    // 島の上にある標的 → 平らな台
    const tg = def.ground.filter((o) => o.type !== 'sigil' && inIsl(o.x, o.wy));
    const pads = tg.map((o) => ({ x: o.x, wy: o.wy, r0: GROUND[o.type].r + (o.type === 'core' ? 26 : 3), r1: GROUND[o.type].r + (o.type === 'core' ? 46 : 13), type: o.type }));
    const H = makeHeight(isl, sp, pads, shape, seed);
    const hAt = (x, wy) => { const [L, R] = sp.span(wy); return H(x, wy, L, R); };

    // 地表: 行ごとに左右の縁の間を等分した格子
    const dv = 3.4, nR = Math.max(4, Math.ceil((sp.wyB - sp.wyA) / dv)) + 1;
    let maxW = 0; for (let j = 0; j < nR; j++) { const [L, R] = sp.span(lerp(sp.wyA, sp.wyB, j / (nR - 1))); maxW = Math.max(maxW, R - L); }
    const M = clamp(Math.round(maxW / 3.6), 10, getOpts().lite ? 44 : 66), cols = M + 1;
    const pos = new Float32Array(nR * cols * 3), col = new Float32Array(nR * cols * 3), uv = new Float32Array(nR * cols * 2);
    const hi = _c.set(th.landHi), lo = _c2.set(th.land), hr = clamp(hi.r / lo.r, 0.6, 1.9), hg = clamp(hi.g / lo.g, 0.6, 1.9), hb = clamp(hi.b / lo.b, 0.6, 1.9);
    const rims = []; // 崖の上端（輪郭の点）
    for (let j = 0; j < nR; j++) {
      const wy = lerp(sp.wyA, sp.wyB, j / (nR - 1)), [L, R] = sp.span(wy);
      for (let i = 0; i < cols; i++) {
        const x = lerp(L, R, i / M), h = H(x, wy, L, R), o = (j * cols + i) * 3;
        pos[o] = x - 120; pos[o + 1] = h; pos[o + 2] = -wy - HH;
        uv[(j * cols + i) * 2] = x / TILE; uv[(j * cols + i) * 2 + 1] = wy / TILE;
        // 頂点の色: 高いところは明るい色へ、低いところ・遺跡の陰・台のまわりは暗く
        let sh = 0.8 + 0.05 * clamp(h, -1, 5);
        const d = Math.min(x - L, R - x, wy - sp.wyA, sp.wyB - wy); sh *= 0.8 + 0.2 * smooth(0, 5, d);
        for (const ru of isl.ruins) { const dx = x - (ru.x + 4.5 * ru.s), dy = wy - (ru.wy - 5 * ru.s), dd = dx * dx + dy * dy, rr = 64 * ru.s * ru.s; if (dd < rr * 2.2) sh *= 1 - 0.42 * Math.exp(-dd / rr * 1.6); } // 遺跡の落とす陰（光は左上から）
        for (const p of pads) { const dd = Math.hypot(x - p.x, wy - p.wy); if (dd < p.r1) sh *= 0.74 + 0.26 * smooth(p.r0 - 2, p.r1 - 3, dd); }
        const t = smooth(1.2, 4.6, h);
        col[o] = sh * lerp(1, hr, t); col[o + 1] = sh * lerp(1, hg, t); col[o + 2] = sh * lerp(1, hb, t);
      }
      rims.push(j);
    }
    const idxA = new Uint32Array((nR - 1) * M * 6); let q = 0;
    for (let j = 0; j < nR - 1; j++) for (let i = 0; i < M; i++) { const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; idxA[q++] = a; idxA[q++] = b; idxA[q++] = c; idxA[q++] = b; idxA[q++] = d; idxA[q++] = c; }
    const top = new THREE.BufferGeometry(); top.setAttribute('position', new THREE.BufferAttribute(pos, 3)); top.setAttribute('color', new THREE.BufferAttribute(col, 3)); top.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); top.setIndex(new THREE.BufferAttribute(idxA, 1)); top.computeVertexNormals();
    const topMesh = new THREE.Mesh(top, topMat); topMesh.frustumCulled = false; group.add(topMesh);
    yield;

    // 崖: 輪郭をひと回りして、地層の帯を重ねながら下へ細くしていく
    const loop = [];
    for (let j = 0; j < nR; j++) loop.push([pos[(j * cols) * 3] + 120, -pos[(j * cols) * 3 + 2] - HH, pos[(j * cols) * 3 + 1]]);
    for (let j = nR - 1; j >= 0; j--) loop.push([pos[(j * cols + M) * 3] + 120, -pos[(j * cols + M) * 3 + 2] - HH, pos[(j * cols + M) * 3 + 1]]);
    const DEP = [0, 2.6, 7.5, 15, 26, 39, 53, 66], SHR = [1, 1.012, 0.955, 0.87, 0.72, 0.5, 0.24, 0.02], STR = [1.35, 1.1, 1.3, 0.9, 1.08, 0.74, 0.58, 0.42];
    const NP = loop.length, NK = DEP.length, len = isl.wy1 - isl.wy0, a0 = isl.wy0 + len * 0.3, a1 = isl.wy1 - len * 0.3, cxs = (wy) => { const [L, R] = sp.span(clamp(wy, isl.wy0, isl.wy1)); return lerp((L + R) / 2, isl.cx, 0.4); };
    const cp = new Float32Array((NP + 1) * NK * 3), cc = new Float32Array((NP + 1) * NK * 3), cu = new Float32Array((NP + 1) * NK * 2);
    const side = _c.set(th.side).lerp(_c2.set(th.land), 0.5).multiplyScalar(1.7), sr = side.r, sg = side.g, sb = side.b; const soil = _c2.set(th.landHi).lerp(_c.set(th.land), 0.5), lr = soil.r * 1.6, lg = soil.g * 1.6, lb = soil.b * 1.6;
    let per = 0;
    for (let p = 0; p <= NP; p++) {
      const P = loop[p % NP], Pp = loop[(p + NP - 1) % NP]; if (p) per += Math.hypot(P[0] - Pp[0], P[1] - Pp[1]);
      const ty = clamp(P[1], a0, a1), tx = cxs(ty);
      for (let k = 0; k < NK; k++) {
        const o = (p * NK + k) * 3, s = SHR[k], jit = k < 1 ? 0 : (fbm((p % NP) * 0.31, k * 1.7, seed + 9, 3) - 0.5) * (k < 2 ? 1.2 : 7) * Math.min(1, s * 2.2 + 0.25);
        const dx = P[0] - tx, dy = P[1] - ty, dl = Math.hypot(dx, dy) || 1;
        cp[o] = tx + dx * s + (dx / dl) * jit - 120; cp[o + 1] = P[2] - DEP[k] - (k > 1 ? (fbm((p % NP) * 0.2, k * 3.1, seed + 2, 2) - 0.5) * 6 : 0); cp[o + 2] = -(ty + dy * s + (dy / dl) * jit) - HH;
        const st = STR[k] * (0.9 + 0.2 * fbm((p % NP) * 0.15, k, seed + 6, 2)), t = k === 0 ? 1 : k === 1 ? 0.55 : 0;
        cc[o] = lerp(sr * st, lr, t); cc[o + 1] = lerp(sg * st, lg, t); cc[o + 2] = lerp(sb * st, lb, t);
        cu[(p * NK + k) * 2] = per / 70; cu[(p * NK + k) * 2 + 1] = DEP[k] / 70;
      }
    }
    const ci = new Uint32Array(NP * (NK - 1) * 6); q = 0;
    for (let p = 0; p < NP; p++) for (let k = 0; k < NK - 1; k++) { const a = p * NK + k, b = a + NK, c = a + 1, d = b + 1; ci[q++] = a; ci[q++] = b; ci[q++] = c; ci[q++] = b; ci[q++] = d; ci[q++] = c; }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); cg.setAttribute('uv', new THREE.BufferAttribute(cu, 2)); cg.setIndex(new THREE.BufferAttribute(ci, 1)); cg.computeVertexNormals();
    // 輪郭の継ぎ目（最初と最後の列）は同じ位置なので、法線をそろえる
    { const nn = cg.attributes.normal; for (let k = 0; k < NK; k++) { const a = k, b = NP * NK + k; const x = nn.getX(a) + nn.getX(b), y = nn.getY(a) + nn.getY(b), z = nn.getZ(a) + nn.getZ(b), l = Math.hypot(x, y, z) || 1; nn.setXYZ(a, x / l, y / l, z / l); nn.setXYZ(b, x / l, y / l, z / l); } }
    const cliffMesh = new THREE.Mesh(cg, cliffMat); cliffMesh.frustumCulled = false; group.add(cliffMesh);
    yield;

    // 飾り: 遺跡・崖の結晶と垂れる岩・導線・台・コアの島の基壇
    const D = [], m4 = new THREE.Matrix4(), e3 = new THREE.Euler(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const place = (g, x, wy, y, ry = 0, rx = 0, rz = 0) => { m4.compose(v3.set(x - 120, y, -wy - HH), q4.setFromEuler(e3.set(rx, ry, rz, 'YXZ')), one); g.applyMatrix4(m4); D.push(g); };
    for (const ru of isl.ruins) {
      if (!inIsl(ru.x, ru.wy, 6)) continue;
      if (tg.some((o) => Math.hypot(o.x - ru.x, o.wy - ru.wy) < GROUND[o.type].r + (o.type === 'core' ? 50 : 15))) continue; // 標的の近くには置かない（見分けやすさ）
      place(ruinParts(ru.kind, ru.s * 0.9, r, th), ru.x, ru.wy, hAt(ru.x, ru.wy) - 0.4, ru.rot);
    }
    yield;
    const rockO = () => ({ c: _c.set(th.side).lerp(_c2.set(th.land), 0.3).multiplyScalar(0.9 + r() * 0.5).getHex(), m: 0.05, r: 0.95 });
    const nCry = getOpts().lite ? 7 : 14;
    for (let i = 0; i < nCry; i++) { // 崖の結晶（テーマ色で光る）と垂れる岩
      const p = Math.floor(r() * NP), k = 2 + Math.floor(r() * 3), o = (p * NK + k) * 3, x = cp[o] + 120, y = cp[o + 1], wy = -cp[o + 2] - HH, ty = clamp(loop[p][1], a0, a1), tx = cxs(ty), ang = Math.atan2(x - tx, -(wy - ty));
      const n = 2 + Math.floor(r() * 3);
      for (let c = 0; c < n; c++) { const s = 0.9 + r() * 1.4; const g = part(octa(1), { c: th.glow, e: 1.5 + r(), f: 4, m: 0.2, r: 0.15 }, { s: [s * 0.8, s * 3.2, s * 0.8] }); place(g, x + (r() - 0.5) * 3, wy + (r() - 0.5) * 3, y - 1, ang, 1.9 + r() * 0.7, (r() - 0.5) * 0.6); }
    }
    const nSt = getOpts().lite ? 4 : 9;
    for (let i = 0; i < nSt; i++) { const wy = lerp(a0, a1, r()), [L, R] = sp.span(wy), x = lerp(L, R, 0.25 + r() * 0.5), hh = 12 + r() * 26, rr = 3 + r() * 5; const g = part(new THREE.ConeGeometry(rr, hh, 5, 2), rockO(), { r: [PI, r() * 3, 0] }); place(g, x, wy, -42 - r() * 22 - hh / 2, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3); }
    if (theme === 'moss') for (let i = 0; i < 10; i++) { const p = Math.floor(r() * NP), o = (p * NK + 1) * 3, l = 8 + r() * 16; place(part(cyl(0.22, 0.1, l, 5), { c: 0x3a5a2a, m: 0, r: 1 }), cp[o] + 120, -cp[o + 2] - HH, cp[o + 1] - l / 2, 0, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25); } // 垂れる根
    // 標的の台と、それをつなぐ導線（配置に意味を持たせる）
    const roadO = { c: _c.set(th.side).lerp(_c2.set(th.ruin), 0.5).getHex(), m: 0.5, r: 0.55 }, lineO = { c: th.glow, e: 1.3, f: 2 };
    const ribbon = (ax, awy, bx, bwy, w, bend) => {
      const L = Math.hypot(bx - ax, bwy - awy), n = Math.max(2, Math.ceil(L / 3.2)), nx = -(bwy - awy) / L, ny = (bx - ax) / L, P = new Float32Array(n * 18), P2 = new Float32Array(n * 18);
      const pt = (t, off, lift, out, o) => { const bx2 = lerp(ax, bx, t) + nx * (off + Math.sin(t * PI) * bend), by2 = lerp(awy, bwy, t) + ny * (off + Math.sin(t * PI) * bend); out[o] = bx2 - 120; out[o + 1] = (inIsl(bx2, by2) ? hAt(bx2, by2) : 0) + lift; out[o + 2] = -by2 - HH; };
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; let o = i * 18;
        for (const [arr, hw, lift] of [[P, w / 2, 0.32], [P2, w * 0.11, 0.42]]) { pt(t0, -hw, lift, arr, o); pt(t1, -hw, lift, arr, o + 3); pt(t0, hw, lift, arr, o + 6); pt(t1, -hw, lift, arr, o + 9); pt(t1, hw, lift, arr, o + 12); pt(t0, hw, lift, arr, o + 15); } }
      for (const [arr, oo] of [[P, roadO], [P2, lineO]]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.computeVertexNormals(); D.push(part(g, oo)); }
    };
    const nodes = tg.filter((o) => o.type !== 'panel').sort((a, b) => a.wy - b.wy);
    for (let i = 0; i + 1 < nodes.length; i++) { const a = nodes[i], b = nodes[i + 1]; if (Math.hypot(a.x - b.x, a.wy - b.wy) < 190 && !isCore) ribbon(a.x, a.wy, b.x, b.wy, 4.6, (i % 2 ? 1 : -1) * 6); }
    for (const o of nodes) { if (o.type === 'core') continue; const rr = GROUND[o.type].r + 4.5; place(part(slab(Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * TAU) * rr, Math.sin(k / 16 * TAU) * rr]).flat(), 0.9, 0.3), roadO), o.x, o.wy, -0.1); place(part(torus(rr - 0.9, 0.22, 4, 28), lineO), o.x, o.wy, 0.42); }
    if (isCore) { // コアの島: 同心円の基壇と放射状の導線、周囲の光る柱
      const core = tg.find((o) => o.type === 'core');
      if (core) {
        const st = { c: _c.set(th.ruin).multiplyScalar(1.1).getHex(), m: 0.3, r: 0.6, f: 1 }, st2 = { c: _c.set(th.side).lerp(_c2.set(th.ruin), 0.4).getHex(), m: 0.4, r: 0.6 };
        const ringSlab = (r0, r1, hgt, o) => { const sh = new THREE.Shape(); sh.absarc(0, 0, r1, 0, TAU, false); const hole = new THREE.Path(); hole.absarc(0, 0, r0, 0, TAU, true); sh.holes.push(hole); const g = new THREE.ExtrudeGeometry(sh, { depth: hgt, bevelEnabled: false, curveSegments: 40 }); g.rotateX(-PI / 2); return part(g, o); };
        place(ringSlab(27, 35, 1.5, st), core.x, core.wy, -0.2); place(ringSlab(41, 46, 1.0, st2), core.x, core.wy, -0.2); place(ringSlab(53, 57, 0.7, st), core.x, core.wy, -0.2);
        place(part(torus(31, 0.3, 4, 64), lineO), core.x, core.wy, 1.5); place(part(torus(43.5, 0.3, 4, 64), { c: 0xff4fa8, e: 1.5, f: 2 }), core.x, core.wy, 1.0); place(part(torus(55, 0.3, 4, 72), lineO), core.x, core.wy, 0.7);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + PI / 8, c = Math.cos(a), s = Math.sin(a);
          place(part(box(2.6, 0.9, 30, 0.25), st2), core.x + s * 42, core.wy - c * 42, 0.25, -a); place(part(box(0.5, 0.3, 29), lineO), core.x + s * 42, core.wy - c * 42, 0.85, -a);
          const px = core.x + s * 60, pwy = core.wy - c * 60; if (inIsl(px, pwy, 4)) { place(part(slab([-1.6, -1.6, 1.6, -1.6, 1.6, 1.6, -1.6, 1.6], 12, 0.4), st), px, pwy, 5.6, -a); place(part(octa(1.5), { c: th.glow, e: 2.6, f: 4 }, { s: [1, 1.7, 1] }), px, pwy, 14.2, -a); } }
      }
    }
    if (D.length) { const dg = merge(D); const dm = new THREE.Mesh(dg, decorMat); dm.frustumCulled = false; group.add(dm); }
    yield;

    // 縁から落ちる滝・砂・光の粒
    const nF = getOpts().lite ? 2 : 4, fp = [], fu = [], fs = [];
    for (let i = 0; i < nF; i++) {
      const p = Math.floor((0.12 + 0.76 * r()) * NP), w = 3 + Math.floor(r() * 4), sd = r() * 10, lenF = 46 + r() * 30;
      for (let k = 0; k < w; k++) { const A = loop[(p + k) % NP], B = loop[(p + k + 1) % NP];
        const ty = clamp(A[1], a0, a1), tx = cxs(ty), dx = A[0] - tx, dy = A[1] - ty, dl = Math.hypot(dx, dy) || 1, ox = dx / dl * 0.8, oy = dy / dl * 0.8;
        const ax = A[0] + ox - 120, az = -(A[1] + oy) - HH, bx = B[0] + ox - 120, bz = -(B[1] + oy) - HH, y0 = Math.min(A[2], B[2]) - 0.4;
        fp.push(ax, y0, az, bx, y0, bz, ax, y0 - lenF, az, bx, y0, bz, bx, y0 - lenF, bz, ax, y0 - lenF, az);
        const u0 = k / w, u1 = (k + 1) / w; fu.push(u0, 0, u1, 0, u0, 1, u1, 0, u1, 1, u0, 1); for (let v = 0; v < 6; v++) fs.push(sd); }
    }
    if (fp.length) { const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setAttribute('aSeed', new THREE.Float32BufferAttribute(fs, 1)); const fm = new THREE.Mesh(fg, fallMat); fm.frustumCulled = false; fm.renderOrder = 10; group.add(fm); }
    group.userData.ready = true;
  }

  function disposeArea(a) { if (!a) return; for (const g of a.groups) { scrollG.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } }
  function applyTheme(t, theme) {
    const old = themeTex; themeTex = t;
    topMat.map = t.map; topMat.normalMap = t.normalMap; topMat.roughnessMap = t.mask; topMat.metalnessMap = t.mask; topMat.normalScale.set(t.params.normal, t.params.normal);
    const U = topMat.userData.U; U.uEm.value = t.params.em; U.uEmCol.value.set(t.params.emColor); U.uEmMode.value = t.params.emMode;
    const first = !old; topMat.needsUpdate = first;
    if (old) { old.map.dispose(); old.normalMap.dispose(); old.mask.dispose(); }
    const sh = SHAPE[theme]; fallMat.uniforms.uCol.value.set(sh.fall[0]); fallMat.uniforms.uP.value.set(sh.fall[1], sh.fall[2], sh.fall[3]);
  }
  function* buildAll(def, areaIdx, my, st) {
    const theme = AREAS[areaIdx].theme;
    const cl = yield* bakeCliff(); if (my !== gen) return;
    if (!cliffMat.map) { cliffMat.map = cl.map; cliffMat.normalMap = cl.normalMap; cliffMat.normalScale.set(1.4, 1.4); cliffMat.needsUpdate = true; }
    let t = null;
    if (themeName !== theme) { t = yield* bakeTheme(theme); if (my !== gen) { t.map.dispose(); t.normalMap.dispose(); t.mask.dispose(); return; } }
    const old = cur; cur = st; disposeArea(old); if (t) { applyTheme(t, theme); themeName = theme; }
    yield;
    const order = def.islands.map((isl, i) => i).sort((a, b) => Math.abs(def.islands[a].wy0 - st.near) - Math.abs(def.islands[b].wy0 - st.near)); // 近い島から
    for (const i of order) {
      const g = new THREE.Group(); g.visible = false; g.userData.isl = def.islands[i]; scrollG.add(g); st.groups.push(g);
      const it = buildIsland(def.islands[i], i, def, theme, g, areaIdx + 1, i === def.islands.length - 1);
      while (true) { const s = it.next(); if (my !== gen) { disposeArea(st); return; } if (s.done) break; yield; }
    }
    st.done = true; st.ms = performance.now() - st.t0;
  }

  const api = {
    uScroll, topMat, cliffMat,
    // エリアの地形を作り始める（前のエリアは、新しいテクスチャができた時点で入れ替える）
    request(def, areaIdx, near = 0) {
      gen++; jobs.clear('terrain');
      const st = { def, groups: [], done: false, near, t0: performance.now(), ms: 0 };
      api.building = st;
      jobs.add(buildAll(def, areaIdx, gen, st), 'terrain');
      return st;
    },
    get current() { return cur; }, building: null,
    clear() { gen++; jobs.clear('terrain'); disposeArea(cur); cur = null; },
    // 盤面に入っている島だけ表示する。まだできていない島が見える位置に来ていたら true（呼び出し側が作業を急がせる）
    update(scroll, def) {
      uScroll.value = scroll;
      for (let i = 0; i < 4; i++) topMat.userData.U.uLR.value[i] = lights[i].r;
      let need = false;
      const vis = (isl) => { const y0 = scroll - isl.wy1, y1 = scroll - isl.wy0; return y1 > -60 && y0 < 2 * HH + 60; };
      if (cur && cur.def === def) { for (const g of cur.groups) { g.visible = !!g.userData.ready && vis(g.userData.isl); } }
      else if (cur) for (const g of cur.groups) g.visible = false;
      const st = api.building;
      if (st && st.def === def && !st.done) for (const isl of def.islands) if (vis(isl)) { const g = st.groups.find((q) => q.userData.isl === isl); if (!g || !g.userData.ready) need = true; }
      return need;
    },
  };
  cliffMat.userData.U.uLR = topMat.userData.U.uLR;
  return api;
}
