// AEGIS RELAY — 宇宙（星雲の天球・星・惑星）と、戦域の窓の奥を流れる層（星・雲・遠い岩・環境の粒）
// ・星雲はフラクタルノイズをエリアごとに 1 回だけ GPU でテクスチャに焼く（毎フレームは計算しない）。ディザーを入れて色の段を消す
// ・天球・惑星は動かさない（VR で周囲が流れると酔いやすい）。視差で流れるのは「窓の中」の層だけ
// ・窓の中の層は盤面の 4 つのクリップ面で切り抜く
import * as THREE from 'three';
import { THEMES, AREAS } from '../shared/rules.js';
import { HW, HH, rng, noiseTexture, shared } from './util3d.js';

const NEB_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uC0, uC1, uC2, uC3; uniform vec3 uSeed; uniform float uScale;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 q = d * uScale + uSeed;
  vec3 w = vec3(fbm(q + 1.3), fbm(q + vec3(5.2, 1.3, 2.8)), fbm(q + vec3(2.1, 7.7, 4.4)));
  float n = fbm(q + 1.7 * w);
  float n2 = fbm(q * 2.4 + 2.0 * w + 11.0);
  float n3 = fbm(q * 0.7 + 23.0);
  float gas = smoothstep(0.36, 0.78, n);
  float core = pow(gas, 3.0);
  vec3 col = mix(uC0, uC1, gas);
  col = mix(col, uC3, smoothstep(0.5, 0.8, n3) * 0.55 * gas);       // 別の色のガス
  col += uC2 * core * 0.9;                                            // 明るい芯
  float dust = smoothstep(0.46, 0.72, n2) * (1.0 - core);             // 暗い塵の筋
  col *= 1.0 - 0.72 * dust;
  col += uC2 * 0.05 * pow(noise(q * 9.0), 6.0);
  float h = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (h - 0.5) / 255.0 * 2.2 * pow(max(col, vec3(1e-4)), vec3(0.545)); // ディザー（色の段を消す）
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

// エリアごとの天体（位置は天球上の方位・仰角。通常画面では左右の上の隅、VR では戦域の横に見える）
const BODIES = [
  { az: -33, el: -15, r: 9.0, a: 0x8b93a8, b: 0x3c4050, atm: 0x9fd0ff, band: 0.0, ring: 0, glow: 0x000000 },   // 灰: 荒れた月
  { az: 34, el: -13, r: 11.0, a: 0xcdeeff, b: 0x4f90b8, atm: 0xaef0ff, band: 0.5, ring: 1, glow: 0x000000 },   // 霜: 輪を持つ氷の巨星
  { az: -36, el: -16, r: 10.0, a: 0x3a1410, b: 0x120606, atm: 0xff7a40, band: 0.0, ring: 0, glow: 0xff5a1a },  // 燠: 溶岩の星
  { az: 32, el: -12, r: 8.0, a: 0x6f8a86, b: 0x2a3838, atm: 0x9cffd0, band: 0.2, ring: 0, glow: 0x7dffc8 },    // 歯車: 人工の星（格子の灯）
  { az: -30, el: -14, r: 10.5, a: 0x4f8a50, b: 0x1d4a6a, atm: 0xc8ffb0, band: 0.15, ring: 0, glow: 0x000000 }, // 苔: 緑と海の星
  { az: 36, el: -13, r: 10.0, a: 0xe8c070, b: 0x8a5a20, atm: 0xffe6a0, band: 1.0, ring: 1, glow: 0x000000 },   // 黄金: 縞の巨星
  { az: -34, el: -13, r: 9.5, a: 0x2a2038, b: 0x0c0814, atm: 0xc090ff, band: 0.0, ring: 0, glow: 0xa060ff },   // 黒曜: 紫の裂け目
  { az: 0, el: 24, r: 13.0, a: 0xe8ecff, b: 0x8088c8, atm: 0xffffff, band: 0.6, ring: 1, glow: 0x000000 },     // 天頂: 正面上の白い星
];

export function createSky(renderer, stage, board, clip, getOpts) {
  const noise = noiseTexture();
  // ── 天球（星雲）──
  const skyG = new THREE.Group(); stage.add(skyG);
  let rt = null;
  const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), bakeScene = new THREE.Scene();
  const bakeMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: NEB_FRAG,
    uniforms: { uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uSeed: { value: new THREE.Vector3() }, uScale: { value: 1.6 } }, depthTest: false, depthWrite: false });
  bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat));
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { tSky: { value: null }, uGain: { value: 1 } }, side: THREE.BackSide, depthWrite: false, depthTest: false, dithering: true,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tSky; uniform float uGain; varying vec3 vDir;
      #include <common>
      #include <dithering_pars_fragment>
      void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        gl_FragColor = vec4(texture2D(tSky, uv).rgb * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }` });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20), domeMat); dome.renderOrder = -20; dome.frustumCulled = false; skyG.add(dome);
  const hueShift = (hex, loop, mul = 1) => { const c = new THREE.Color(hex); if (loop) c.offsetHSL((loop * 0.11) % 1, 0, 0); return c.multiplyScalar(mul); };
  function bake(area, loop) {
    const lite = getOpts().lite, W = lite ? 1024 : 2048;
    if (!rt || rt.width !== W) { rt?.dispose(); rt = new THREE.WebGLRenderTarget(W, W / 2, { depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.RepeatWrapping }); rt.texture.colorSpace = THREE.SRGBColorSpace; }
    const th = THEMES[AREAS[area].theme], u = bakeMat.uniforms;
    u.uC0.value.copy(hueShift(th.sky[0], loop, 0.9)); u.uC1.value.copy(hueShift(th.sky[1], loop, 1.5)); u.uC2.value.copy(hueShift(th.sky[2], loop, 1.9));
    u.uC3.value.copy(hueShift(th.glow, loop, 0.16)); u.uSeed.value.set(area * 7.3 + 1.1 + loop * 3.7, area * 3.1 + 4.2, area * 5.7 + 9.3);
    const prev = renderer.getRenderTarget(), xr = renderer.xr.enabled; renderer.xr.enabled = false;
    renderer.setRenderTarget(rt); renderer.render(bakeScene, bakeCam); renderer.setRenderTarget(prev); renderer.xr.enabled = xr;
    domeMat.uniforms.tSky.value = rt.texture;
  }

  // ── 天球の星（動かない。瞬きだけ）。明るい星には十字の光条 ──
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uPx: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aS; attribute vec3 color; varying vec3 vC; varying float vBig; uniform float uTime, uPx;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float tw = 0.72 + 0.28 * sin(uTime * aS.y + aS.z); vBig = aS.w;
        gl_PointSize = max(1.5, aS.x * uPx / -mv.z * (0.85 + 0.15 * tw)); vC = color * tw * min(1.0, aS.x * uPx / -mv.z / 1.5); }`,
    fragmentShader: `varying vec3 vC; varying float vBig;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a;
        if (vBig > 0.5) { vec2 q = abs(p) * 2.0; a = pow(max(0.0, 1.0 - d * 2.6), 2.0) * 1.6 + max(0.0, 1.0 - q.x) * exp(-q.y * 26.0) * 0.6 + max(0.0, 1.0 - q.y) * exp(-q.x * 26.0) * 0.6; }
        else a = pow(max(0.0, 1.0 - d), 1.6);
        gl_FragColor = vec4(vC * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  {
    const r = rng(77), n = getOpts().lite ? 1400 : 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), aS = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), rad = 80;
      pos[i * 3] = Math.cos(a) * s * rad; pos[i * 3 + 1] = u * rad; pos[i * 3 + 2] = Math.sin(a) * s * rad;
      const big = r() < 0.02, tcol = r(), b = big ? 1.4 : 0.35 + r() * r() * 0.9; // 色温度: 青白 〜 白 〜 橙
      col[i * 3] = b * (tcol < 0.25 ? 0.72 : tcol > 0.8 ? 1.0 : 0.95); col[i * 3 + 1] = b * (tcol < 0.25 ? 0.84 : tcol > 0.8 ? 0.8 : 0.95); col[i * 3 + 2] = b * (tcol < 0.25 ? 1.0 : tcol > 0.8 ? 0.6 : 0.95);
      aS[i * 4] = big ? 1.5 + r() * 0.9 : 0.16 + r() * r() * 0.3; aS[i * 4 + 1] = 0.6 + r() * 3.2; aS[i * 4 + 2] = r() * 6.28; aS[i * 4 + 3] = big ? 1 : 0;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
    const pts = new THREE.Points(g, starMat); pts.frustumCulled = false; pts.renderOrder = -19; skyG.add(pts);
    const vp = new THREE.Vector4();
    pts.onBeforeRender = (rn, sc, cam) => { rn.getCurrentViewport(vp); starMat.uniforms.uPx.value = vp.w * 0.5 * cam.projectionMatrix.elements[5]; };
  }

  // ── 惑星・月（大気の縁光、昼夜の境）──
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: noise }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uAtm: { value: new THREE.Color() }, uGlowC: { value: new THREE.Color() }, uBand: { value: 0 }, uL: { value: new THREE.Vector3(-0.55, 0.6, 0.58).normalize() }, uSeed: { value: 0 }, uTime: shared.time, uGain: { value: 1 } },
    depthWrite: false, depthTest: false,
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D tNoise; uniform vec3 uA, uB, uAtm, uGlowC, uL; uniform float uBand, uSeed, uTime, uGain; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vec3 n = normalize(vN); vec3 p = normalize(vP);
        vec2 uv = vec2(atan(p.z, p.x) / 6.2831853, p.y * 0.5) ;
        float n1 = texture2D(tNoise, uv * vec2(2.0, 1.4) + uSeed).r, n2 = texture2D(tNoise, uv * vec2(6.0, 4.0) + uSeed * 1.7).g;
        float bands = 0.5 + 0.5 * sin(p.y * 17.0 + n1 * 5.0);
        float m = mix(smoothstep(0.35, 0.65, n1 * 0.7 + n2 * 0.3), bands * 0.7 + n2 * 0.3, uBand);
        vec3 alb = mix(uB, uA, m);
        float ndl = dot(n, uL); float day = smoothstep(-0.12, 0.3, ndl);
        vec3 col = alb * (0.03 + 1.15 * day * max(ndl, 0.0) + 0.1 * day);
        float veins = smoothstep(0.52, 0.5, abs(n2 - 0.5) + 0.48) ;
        col += uGlowC * veins * (0.5 + 0.5 * (1.0 - day)) * (0.8 + 0.2 * sin(uTime * 0.8 + n1 * 20.0));   // 夜の側で光る筋（溶岩・灯）
        float rim = pow(1.0 - max(dot(n, vV), 0.0), 2.6);
        col += uAtm * rim * (0.12 + 0.95 * smoothstep(-0.25, 0.5, ndl));                                    // 大気の縁光
        gl_FragColor = vec4(col * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), planetMat); planet.renderOrder = -18; planet.frustumCulled = false; skyG.add(planet);
  const haloMat = new THREE.ShaderMaterial({ uniforms: { uAtm: planetMat.uniforms.uAtm, uL: planetMat.uniforms.uL, uGain: planetMat.uniforms.uGain }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: planetMat.vertexShader,
    fragmentShader: `uniform vec3 uAtm, uL; uniform float uGain; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec3 n = normalize(vN); float f = pow(max(dot(-n, vV), 0.0), 3.5); float lit = smoothstep(-0.4, 0.5, dot(n, uL));
        gl_FragColor = vec4(uAtm * f * (0.1 + 0.6 * lit) * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const halo = new THREE.Mesh(planet.geometry, haloMat); halo.renderOrder = -17; halo.frustumCulled = false; skyG.add(halo);
  const ringMat = new THREE.ShaderMaterial({ uniforms: { uA: planetMat.uniforms.uA, uGain: planetMat.uniforms.uGain }, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uA; uniform float uGain; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.56, 0.6, r) * (1.0 - smoothstep(0.96, 1.0, r)); a *= 0.3 + 0.16 * sin(r * 140.0) + 0.12 * sin(r * 53.0 + 1.0); a *= 1.0 - 0.75 * smoothstep(0.73, 0.745, r) * (1.0 - smoothstep(0.765, 0.78, r));
        gl_FragColor = vec4(uA * 0.55 * uGain, clamp(a * 0.75, 0.0, 0.45));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const ringGeo = new THREE.PlaneGeometry(2, 2); ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.renderOrder = -16; ring.frustumCulled = false; skyG.add(ring);
  // 月（小さい 2 つ目の天体）
  const moon = new THREE.Mesh(planet.geometry, planetMat); moon.renderOrder = -18; moon.frustumCulled = false; skyG.add(moon);
  function setBody(area, loop) {
    const B = BODIES[area % BODIES.length], u = planetMat.uniforms;
    const az = THREE.MathUtils.degToRad(B.az), el = THREE.MathUtils.degToRad(B.el), D = 60;
    planet.position.set(Math.sin(az) * Math.cos(el) * D, 1.2 + Math.sin(el) * D, -Math.cos(az) * Math.cos(el) * D); planet.scale.setScalar(B.r);
    planet.rotation.set(0.3, area * 1.3, 0.2);
    halo.position.copy(planet.position); halo.scale.setScalar(B.r * 1.16);
    ring.visible = !!B.ring; ring.position.copy(planet.position); ring.scale.setScalar(B.r * 1.95); ring.rotation.set(0.42, 0, 0.3 * Math.sign(B.az || 1));
    moon.position.copy(planet.position).add(new THREE.Vector3(-Math.sign(B.az || 1) * B.r * 1.5, B.r * 1.0, 6)); moon.scale.setScalar(B.r * 0.17);
    u.uA.value.copy(hueShift(B.a, loop)); u.uB.value.copy(hueShift(B.b, loop)); u.uAtm.value.copy(hueShift(B.atm, loop)); u.uGlowC.value.set(B.glow); u.uBand.value = B.band; u.uSeed.value = area * 0.37 + 0.11;
  }

  // ── 遠くの出来事（流れ星・遠方の閃光）──
  const evMat = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 }, uMode: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK, uMode; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; float a;
        if (uMode < 0.5) { a = (1.0 - smoothstep(0.0, 0.5, abs(p.y) * 12.0 / (0.2 + vUv.x))) * vUv.x * vUv.x; }
        else { float d = length(p) * 2.0; a = pow(max(0.0, 1.0 - d), 3.0); }
        gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * a * uK, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const evMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), evMat); evMesh.renderOrder = -15; evMesh.frustumCulled = false; evMesh.visible = false; skyG.add(evMesh);
  const ev = { t: 0, life: 0, next: 3, mode: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
  const evR = rng(1234);
  function farEvents(dt) {
    ev.next -= dt;
    if (ev.life <= 0 && ev.next <= 0) {
      ev.mode = evR() < 0.6 ? 0 : 1; ev.t = 0; ev.life = ev.mode ? 0.9 : 0.7; ev.next = 5 + evR() * 7;
      const az = (evR() - 0.5) * 1.9, el = -0.75 + evR() * 0.95, D = 70;
      ev.from.set(Math.sin(az) * Math.cos(el) * D, 1.2 + Math.sin(el) * D, -Math.cos(az) * Math.cos(el) * D);
      ev.to.copy(ev.from).add(new THREE.Vector3((evR() - 0.5) * 30, -6 - evR() * 10, (evR() - 0.5) * 8));
    }
    if (ev.life > 0) {
      ev.t += dt; const k = ev.t / ev.life; if (k >= 1) { ev.life = 0; evMesh.visible = false; return; }
      evMesh.visible = true; evMat.uniforms.uMode.value = ev.mode; evMat.uniforms.uK.value = Math.sin(k * Math.PI) * (ev.mode ? 0.9 : 1.6);
      if (ev.mode === 0) { evMesh.position.lerpVectors(ev.from, ev.to, k); evMesh.scale.set(9, 1.2, 1); evMesh.lookAt(0, 1.2, 0); const d = ev.to.clone().sub(ev.from); evMesh.rotateZ(Math.atan2(d.y, d.x * Math.sign(-evMesh.position.z || 1))); }
      else { evMesh.position.copy(ev.from); evMesh.scale.setScalar(3 + 5 * k); evMesh.lookAt(0, 1.2, 0); }
    }
  }

  // ═════════ 窓の中の層（クリップあり・スクロールに合わせて流れる）═════════
  const win = new THREE.Group(); board.add(win);
  const uScroll = { value: 0 };
  // 奥の星雲（縁をぼかした板。段がつかないようディザー）
  const deepMat = new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: noise }, uScroll, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uTime: shared.time }, transparent: true, depthWrite: false, clipping: true, clippingPlanes: clip, dithering: true,
    vertexShader: `varying vec2 vUv; varying vec3 vW;
      #include <common>
      #include <clipping_planes_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vW = position; gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `uniform sampler2D tNoise; uniform float uScroll, uTime; uniform vec3 uC1, uC2; varying vec2 vUv; varying vec3 vW;
      #include <common>
      #include <dithering_pars_fragment>
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        vec2 q = vec2(vW.x, vW.z - uScroll * 0.18) / 520.0;
        float n = texture2D(tNoise, q).b * 0.6 + texture2D(tNoise, q * 2.7 + 0.3).r * 0.4;
        float n2 = texture2D(tNoise, q * 1.3 + vec2(0.5, uTime * 0.002)).r;
        float gas = smoothstep(0.38, 0.75, n);
        vec3 col = mix(uC1 * 0.5, uC1, gas) + uC2 * pow(gas, 3.0) * 0.8; col *= 1.0 - 0.6 * smoothstep(0.5, 0.75, n2);
        vec2 e = abs(vUv - 0.5) * 2.0; float fade = (1.0 - smoothstep(0.55, 1.0, e.x)) * (1.0 - smoothstep(0.6, 1.0, e.y));
        gl_FragColor = vec4(col, fade * (0.35 + 0.65 * gas));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }` });
  const deepGeo = new THREE.PlaneGeometry(HW * 2.6, HH * 2.6); deepGeo.rotateX(-Math.PI / 2);
  const deep = new THREE.Mesh(deepGeo, deepMat); deep.position.y = -170; deep.renderOrder = -6; deep.frustumCulled = false; win.add(deep);

  // 雲・霧（下の層と上の薄い層）
  const cloudMat = (speed, alpha, y, scale) => new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: noise }, uScroll, uTime: shared.time, uCol: { value: new THREE.Color() }, uSpeed: { value: speed }, uAlpha: { value: alpha }, uScale: { value: scale } }, transparent: true, depthWrite: false, clipping: true, clippingPlanes: clip, side: THREE.DoubleSide,
    vertexShader: deepMat.vertexShader,
    fragmentShader: `uniform sampler2D tNoise; uniform float uScroll, uTime, uSpeed, uAlpha, uScale; uniform vec3 uCol; varying vec2 vUv; varying vec3 vW;
      #include <common>
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        vec2 q = vec2(vW.x + uTime * 1.5, vW.z - uScroll * uSpeed) / uScale;
        float n = texture2D(tNoise, q).r * 0.65 + texture2D(tNoise, q * 2.1 + vec2(uTime * 0.004, 0.0)).g * 0.35;
        float a = smoothstep(0.5, 0.82, n);
        vec2 e = abs(vUv - 0.5) * 2.0; a *= (1.0 - smoothstep(0.7, 1.0, e.x)) * (1.0 - smoothstep(0.7, 1.0, e.y));
        gl_FragColor = vec4(uCol * (0.55 + 0.6 * n), a * uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const cgeo = new THREE.PlaneGeometry(HW * 2.3, HH * 2.3); cgeo.rotateX(-Math.PI / 2);
  const cloudLo = new THREE.Mesh(cgeo, cloudMat(0.62, 0.62, -58, 330)); cloudLo.position.y = -58; cloudLo.renderOrder = -4; cloudLo.frustumCulled = false; win.add(cloudLo);
  const cloudHi = new THREE.Mesh(cgeo, cloudMat(1.35, 0.16, 33, 420)); cloudHi.position.y = 33; cloudHi.renderOrder = 12; cloudHi.frustumCulled = false; win.add(cloudHi);

  // 星の層（3 層の視差。位置の折り返しはシェーダーで行うので CPU は何もしない）
  const wsMat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uScroll, uPx: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clipping: true, clippingPlanes: clip,
    vertexShader: `attribute vec4 aS; attribute vec3 color; varying vec3 vC; varying float vBig; uniform float uTime, uScroll, uPx;
      #include <common>
      #include <clipping_planes_pars_vertex>
      void main(){ vec3 p = position; float range = ${(HH * 2.6).toFixed(1)}; p.z = mod(p.z + uScroll * aS.w + range * 0.5, range) - range * 0.5;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        float tw = 0.7 + 0.3 * sin(uTime * aS.y + aS.z); float px = aS.x * uPx / -mvPosition.z; vBig = step(2.2, aS.x);
        gl_PointSize = max(1.5, px); vC = color * tw * min(1.0, px / 1.5);
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `varying vec3 vC; varying float vBig;
      #include <common>
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a;
        if (vBig > 0.5) { vec2 q = abs(p) * 2.0; a = pow(max(0.0, 1.0 - d * 2.4), 2.0) * 1.5 + max(0.0, 1.0 - q.x) * exp(-q.y * 24.0) * 0.55 + max(0.0, 1.0 - q.y) * exp(-q.x * 24.0) * 0.55; }
        else a = pow(max(0.0, 1.0 - d), 1.5);
        gl_FragColor = vec4(vC * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const scaleOf = () => board.scale.x;
  const vp = new THREE.Vector4();
  const setPx = (mat) => (rn, sc, cam) => { rn.getCurrentViewport(vp); mat.uniforms.uPx.value = vp.w * 0.5 * cam.projectionMatrix.elements[5] * scaleOf(); };
  {
    const r = rng(5), n = getOpts().lite ? 420 : 800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), aS = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const layer = i % 3, y = [-70, -115, -165][layer], sp = [0.42, 0.24, 0.1][layer];
      pos[i * 3] = (r() * 2 - 1) * HW * 1.3; pos[i * 3 + 1] = y + (r() - 0.5) * 24; pos[i * 3 + 2] = (r() * 2 - 1) * HH * 1.3;
      const big = r() < 0.035, tcol = r(), b = big ? 1.3 : 0.4 + r() * 0.8;
      col[i * 3] = b * (tcol < 0.3 ? 0.7 : tcol > 0.8 ? 1.0 : 0.95); col[i * 3 + 1] = b * (tcol < 0.3 ? 0.85 : tcol > 0.8 ? 0.82 : 0.95); col[i * 3 + 2] = b * (tcol < 0.3 ? 1.0 : tcol > 0.8 ? 0.62 : 0.95);
      aS[i * 4] = big ? 2.6 + r() * 1.6 : [0.9, 0.7, 0.55][layer] * (0.6 + r() * 0.8); aS[i * 4 + 1] = 0.8 + r() * 3.5; aS[i * 4 + 2] = r() * 6.28; aS[i * 4 + 3] = sp;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
    const pts = new THREE.Points(g, wsMat); pts.frustumCulled = false; pts.renderOrder = -5; pts.onBeforeRender = setPx(wsMat); win.add(pts);
  }

  // 遠くの浮遊岩（暗いシルエット。遅い視差）
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  { const p = rockGeo.attributes.position, r = rng(9); const seen = new Map();
    for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let k = seen.get(key); if (k == null) { k = 0.72 + r() * 0.5; seen.set(key, k); } p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    rockGeo.computeVertexNormals(); }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2c38, roughness: 1, metalness: 0, flatShading: true, clippingPlanes: clip, envMapIntensity: 0.25 });
  const RN = getOpts().lite ? 12 : 22;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, RN); rocks.frustumCulled = false; rocks.renderOrder = -3; win.add(rocks);
  const rockD = []; { const r = rng(21); for (let i = 0; i < RN; i++) rockD.push({ x: (r() * 2 - 1) * HW * 1.15, y: -52 - r() * 85, z: r(), s: 4 + r() * r() * 16, rx: r() * 6, ry: r() * 6, w: (r() - 0.5) * 0.3 }); }
  const dm = new THREE.Object3D();

  // 環境の粒（テーマ別: 灰・雪・火の粉・蒸気・胞子・金粉・紫の光・白い光）
  const AMB = { // vy=上下の速さ, vz=手前への流れ, sway=ゆらぎ, size, twinkle
    ash: { c: 0xb8bcc8, vy: -3, vz: 10, sway: 3, size: 1.0, tw: 0.2, a: 0.5 }, ice: { c: 0xffffff, vy: -7, vz: 6, sway: 5, size: 1.1, tw: 0.3, a: 0.75 },
    ember: { c: 0xff9a40, vy: 9, vz: 4, sway: 4, size: 1.1, tw: 0.9, a: 1.0 }, mech: { c: 0x9cffd0, vy: 5, vz: 2, sway: 1.5, size: 0.8, tw: 0.9, a: 0.6 },
    moss: { c: 0xd6ff8a, vy: 1.5, vz: 3, sway: 6, size: 1.2, tw: 0.5, a: 0.7 }, gold: { c: 0xffe08a, vy: -1.5, vz: 5, sway: 3, size: 1.0, tw: 1.0, a: 0.9 },
    obsid: { c: 0xc99cff, vy: 4, vz: 2, sway: 3, size: 1.1, tw: 0.7, a: 0.8 }, zenith: { c: 0xffffff, vy: 6, vz: 1, sway: 2, size: 1.0, tw: 0.8, a: 0.8 },
  };
  const ambMat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uScroll, uPx: { value: 600 }, uCol: { value: new THREE.Color() }, uV: { value: new THREE.Vector4() }, uP: { value: new THREE.Vector3() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clipping: true, clippingPlanes: clip,
    vertexShader: `attribute vec4 aS; varying float vA; uniform float uTime, uScroll, uPx; uniform vec4 uV; uniform vec3 uP;
      #include <common>
      #include <clipping_planes_pars_vertex>
      void main(){ vec3 p = position;
        p.y = mod(p.y + uTime * uV.x * (0.6 + aS.x * 0.8), 46.0) - 4.0;
        p.z = mod(p.z + uTime * uV.y * (0.6 + aS.y * 0.8) + uScroll * 0.35 + ${HH.toFixed(1)}, ${(HH * 2).toFixed(1)}) - ${HH.toFixed(1)};
        p.x += sin(uTime * (0.4 + aS.x) + aS.z) * uV.z;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        float px = uP.x * (0.6 + aS.y * 0.8) * uPx / -mvPosition.z; gl_PointSize = max(1.5, px);
        vA = uP.z * min(1.0, px / 1.5) * (1.0 - uP.y + uP.y * (0.5 + 0.5 * sin(uTime * (2.0 + aS.x * 5.0) + aS.z)));
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `varying float vA; uniform vec3 uCol;
      #include <common>
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.7) * vA;
        gl_FragColor = vec4(uCol * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  {
    const r = rng(31), n = getOpts().lite ? 110 : 240, pos = new Float32Array(n * 3), aS = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { pos[i * 3] = (r() * 2 - 1) * HW; pos[i * 3 + 1] = r() * 46; pos[i * 3 + 2] = (r() * 2 - 1) * HH; aS[i * 4] = r(); aS[i * 4 + 1] = r(); aS[i * 4 + 2] = r() * 6.28; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
    const pts = new THREE.Points(g, ambMat); pts.frustumCulled = false; pts.renderOrder = 13; pts.onBeforeRender = setPx(ambMat); win.add(pts);
  }

  let curKey = '';
  const api = {
    skyG, win,
    // エリア（と周回）が変わったら、空を焼き直し、色と天体を替える
    setArea(area, loop) {
      const key = area + ':' + loop + ':' + (getOpts().lite ? 'l' : 'h'); if (key === curKey) return false; curKey = key;
      bake(area, loop); setBody(area, loop);
      const th = THEMES[AREAS[area].theme];
      deepMat.uniforms.uC1.value.copy(hueShift(th.sky[1], loop, 1.5)); deepMat.uniforms.uC2.value.copy(hueShift(th.sky[2], loop, 1.6));
      cloudLo.material.uniforms.uCol.value.copy(hueShift(th.sky[2], loop, 1.5)).lerp(new THREE.Color(th.landHi), 0.25);
      cloudHi.material.uniforms.uCol.value.copy(hueShift(th.landHi, loop, 0.9));
      rockMat.color.set(th.side).multiplyScalar(0.8);
      const A = AMB[AREAS[area].theme]; ambMat.uniforms.uCol.value.set(A.c); ambMat.uniforms.uV.value.set(A.vy, A.vz, A.sway, 0); ambMat.uniforms.uP.value.set(A.size, A.tw, A.a);
      return true;
    },
    frame(dt, scroll, gain, run) {
      uScroll.value = scroll;
      domeMat.uniforms.uGain.value = gain; planetMat.uniforms.uGain.value = gain;
      cloudHi.visible = !getOpts().lite;
      for (let i = 0; i < RN; i++) { const d = rockD[i]; const sp = 0.25 + (d.y + 140) / 90 * 0.3; const range = HH * 2.5; const z = ((d.z * range + scroll * sp) % range) - range / 2;
        dm.position.set(d.x, d.y, z); dm.rotation.set(d.rx + shared.time.value * d.w, d.ry, 0); dm.scale.setScalar(d.s); dm.updateMatrix(); rocks.setMatrixAt(i, dm.matrix); }
      rocks.instanceMatrix.needsUpdate = true;
      farEvents(run ? dt : 0);
    },
    dispose() { rt?.dispose(); },
  };
  return api;
}
