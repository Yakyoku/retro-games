// Sky Climber VR — 空と都市（第 2 版）。docs/BACKGROUND.md の項目番号に対応。
// 空: 大気散乱風の階調・太陽の円盤とにじみ・2 層の雲・星と月。都市: 窓ごとに灯りが違う遠景ビル（シェーダー）・航空障害灯・
// ランドマーク（塔と観覧車）・山の稜線・道路（車線・横断歩道・信号・街灯）・信号で止まる車・歩行者・飛行船・飛行機・鳥の群れ・高度の雲。
// 描画回数を抑えるため、ほぼすべて InstancedMesh か結合した 1 つのジオメトリ。
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { makeTextTexture } from './textures.js';

const C = (h) => new THREE.Color(h);
// 棟ごとの空・光・色調（grade はポストプロセスの色調整: 露出・コントラスト・彩度・影と光の色）
export const SKY = {
  practice: { top: 0x2f79d6, hor: 0xbfdcf2, ground: 0x8fa3b3, sun: 0xfff1d6, sunDir: [-0.4, 0.72, 0.6], fog: 0xb4d0e8, fogD: 0.0021, cloud: 0.45, cirrus: 0.5, stars: 0, glow: 0.25,
    hemi: 0.55, sunI: 3.0, env: 0.55, exposure: 1.0, grade: { contrast: 1.06, sat: 1.08, shadows: [0.96, 0.99, 1.04], highs: [1.03, 1.0, 0.96], bloom: 0.22, vignette: 0.22 } },
  day:      { top: 0x1f6fd8, hor: 0xc6e0f4, ground: 0x93a7b6, sun: 0xfff3dc, sunDir: [-0.45, 0.75, 0.55], fog: 0xb8d3ea, fogD: 0.0019, cloud: 0.5, cirrus: 0.6, stars: 0, glow: 0.3,
    hemi: 0.55, sunI: 3.2, env: 0.6, exposure: 1.0, grade: { contrast: 1.08, sat: 1.12, shadows: [0.95, 0.99, 1.06], highs: [1.04, 1.0, 0.95], bloom: 0.25, vignette: 0.24 } },
  dusk:     { top: 0x1b2466, hor: 0xff8a4a, ground: 0x6a4a52, sun: 0xff9a55, sunDir: [0.78, 0.13, 0.5], fog: 0xd98566, fogD: 0.0027, cloud: 0.55, cirrus: 0.8, stars: 0.25, glow: 0.9,
    hemi: 0.45, sunI: 2.9, env: 0.7, exposure: 1.05, grade: { contrast: 1.1, sat: 1.15, shadows: [0.92, 0.94, 1.12], highs: [1.1, 0.98, 0.88], bloom: 0.45, vignette: 0.3 } },
  night:    { top: 0x03050d, hor: 0x241d44, ground: 0x0c0c18, sun: 0x9fb4ff, sunDir: [0.3, 0.62, 0.55], fog: 0x191734, fogD: 0.0036, cloud: 0.5, cirrus: 0.2, stars: 1, glow: 0.2,
    hemi: 0.28, sunI: 0.5, env: 0.9, exposure: 1.15, grade: { contrast: 1.12, sat: 1.2, shadows: [0.9, 0.95, 1.2], highs: [1.06, 0.98, 1.04], bloom: 0.5, vignette: 0.36 } },
  tower:    { top: 0x0d4fbf, hor: 0xb4d6f4, ground: 0xa5bccd, sun: 0xffffff, sunDir: [-0.32, 0.8, 0.5], fog: 0xc2daf0, fogD: 0.0015, cloud: 0.62, cirrus: 0.7, stars: 0, glow: 0.35,
    hemi: 0.6, sunI: 3.4, env: 0.7, exposure: 0.98, grade: { contrast: 1.07, sat: 1.1, shadows: [0.94, 0.99, 1.08], highs: [1.03, 1.01, 0.97], bloom: 0.28, vignette: 0.22 } },
};

// ---- 空（項目 1〜3） ----
export function makeSky(theme, { lite = false } = {}) {
  const s = SKY[theme];
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, defines: lite ? { LITE: 1 } : {},
    uniforms: { uTop: { value: C(s.top) }, uHor: { value: C(s.hor) }, uGround: { value: C(s.ground) }, uSun: { value: C(s.sun) }, uSunDir: { value: new THREE.Vector3(...s.sunDir).normalize() },
      uCloud: { value: s.cloud }, uCirrus: { value: s.cirrus }, uStars: { value: s.stars }, uGlow: { value: s.glow }, uNight: { value: theme === 'night' ? 1 : 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99995; }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uGround, uSun, uSunDir; uniform float uCloud, uCirrus, uStars, uGlow, uNight, uTime; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      #ifdef LITE
      float fbm(vec2 p){ float a = 0.0, w = 0.5; for (int i = 0; i < 3; i++){ a += w * n(p); p = p * 2.03 + 7.1; w *= 0.5; } return a / 0.875; }
      #else
      float fbm(vec2 p){ float a = 0.0, w = 0.5; for (int i = 0; i < 5; i++){ a += w * n(p); p = p * 2.03 + 7.1; w *= 0.5; } return a / 0.97; }
      #endif
      void main(){
        vec3 d = normalize(vDir); float y = max(d.y, 0.0);
        float sd = max(dot(d, uSunDir), 0.0);
        // 大気: 天頂は濃く、地平は明るく霞む。太陽の方角の地平は太陽色に染まる（夕方に強い）
        vec3 c = mix(uHor, uTop, 1.0 - exp(-y * 3.2));
        float az = max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz)), 0.0);
        c = mix(c, uSun * 1.15, uGlow * pow(1.0 - y, 5.0) * (0.25 + 0.75 * az * az));
        c += uTop * 0.25 * pow(1.0 - y, 12.0);
        // 太陽（夜は月）: 円盤・近いにじみ・広いにじみ
        float disc = smoothstep(0.99955, 0.99975, sd);
        c += uSun * (disc * mix(14.0, 2.2, uNight) + pow(sd, 350.0) * mix(2.2, 0.5, uNight) + pow(sd, 14.0) * mix(0.32, 0.12, uNight));
        // 星
        if (uStars > 0.0 && d.y > 0.0) { vec2 sp = d.xz / (d.y + 0.35) * 150.0; float r = h(floor(sp)); vec2 f = fract(sp) - 0.5;
          float st = step(0.994, r) * smoothstep(0.35, 0.0, length(f)) * smoothstep(0.05, 0.35, d.y); c += vec3(0.85, 0.9, 1.0) * st * uStars * (0.7 + 0.5 * sin(uTime * 2.5 + r * 60.0)); }
        if (d.y > 0.0) {
          // 高い薄雲（すじ雲）
          vec2 cu = d.xz / (d.y + 0.25) * vec2(0.55, 1.7) + vec2(uTime * 0.0015, 0.0);
          float ci = smoothstep(0.52, 0.95, fbm(cu * 2.2)) * uCirrus * smoothstep(0.03, 0.3, d.y);
          vec3 cloudLit = mix(uHor, vec3(1.0), 0.55) + uSun * 0.35 * pow(sd, 3.0);
          c = mix(c, cloudLit, ci * 0.42);
          // 低い積雲: 太陽側へずらした濃度との差で陰影
          vec2 uv = d.xz / (d.y + 0.07) * 0.85 + vec2(uTime * 0.0045, uTime * 0.001);
          float den = fbm(uv);
          float cov = smoothstep(0.66 - uCloud * 0.2, 0.92 - uCloud * 0.16, den);
          #ifndef LITE
          float den2 = fbm(uv + normalize(uSunDir.xz + 1e-4) * 0.12);
          float shade = clamp((den - den2) * 3.5 + 0.55, 0.0, 1.0);
          #else
          float shade = 0.6;
          #endif
          vec3 lit = (mix(vec3(1.0), uSun, 0.5) * 1.05 + uSun * pow(sd, 6.0) * 0.6) * mix(1.0, 0.16, uNight);
          vec3 dark = mix(uTop, uHor, 0.55) * mix(0.72, 0.45, uNight);
          vec3 cc = mix(dark, lit, shade);
          c = mix(c, cc, cov * smoothstep(0.015, 0.22, d.y) * 0.92);
        } else {
          c = mix(uHor, uGround, smoothstep(0.0, 0.12, -d.y));
        }
        // 夜: 地平の街明かり
        c += vec3(1.0, 0.55, 0.3) * uNight * 0.16 * pow(1.0 - abs(d.y), 14.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat); m.frustumCulled = false; m.renderOrder = 900; m.name = 'sky'; // 不透明物のあとに描く（隠れた画素は計算しない）
  return m;
}

function mergeSimple(geos, colors) {
  const pos = [], nor = [], col = [];
  geos.forEach((g0, k) => { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (colors) { const c = C(colors[k] ?? 0xffffff).convertSRGBToLinear(); for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b); } });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (colors) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return out;
}
const T = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const k = g.clone(); k.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return k; };
// 柔らかい光の玉（にじみ用）
let glowTex = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  glowTex = makeTextTexture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(0.6, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 128, 128).tex;
  return glowTex;
}

// ---- 遠景ビルの外壁（項目 18・19）: 窓の格子と灯りをシェーダーで。窓 1 つずつ点いたり消えたりする ----
function makeFacadeMaterial(theme, s) {
  const night = theme === 'night', dusk = theme === 'dusk';
  return new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: new THREE.Vector3(...s.sunDir).normalize() }, uSun: { value: C(s.sun).multiplyScalar(night ? 0.12 : dusk ? 0.9 : 1.0) }, uAmb: { value: C(s.hor).multiplyScalar(night ? 0.05 : dusk ? 0.32 : 0.5) },
      uSky: { value: C(s.top).lerp(C(s.hor), 0.5) }, uFogColor: { value: C(s.fog) }, uFogD: { value: s.fogD }, uLit: { value: night ? 0.5 : dusk ? 0.34 : 0.0 }, uTime: { value: 0 } },
    vertexShader: `
      attribute vec4 aInfo; // x=種 y=様式(0-1) z=色相 w=明るさ
      varying vec3 vL; varying vec3 vNl; varying vec3 vN; varying vec3 vSize; varying vec4 vInfo; varying float vDist; varying vec3 vW;
      void main(){
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0); vW = wp.xyz;
        vSize = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
        vL = position; vNl = normal; vN = normalize(mat3(m) * normal); vInfo = aInfo;
        vec4 mv = viewMatrix * wp; vDist = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uSunDir, uSun, uAmb, uSky, uFogColor; uniform float uFogD, uLit, uTime;
      varying vec3 vL; varying vec3 vNl; varying vec3 vN; varying vec3 vSize; varying vec4 vInfo; varying float vDist; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN); float seed = floor(vInfo.x * 255.0 + 0.5) / 255.0;   // 補間のわずかな誤差で乱数が画素ごとに変わらないよう丸める
        vec3 wall = mix(vec3(0.62, 0.64, 0.68), vec3(0.78, 0.7, 0.6), vInfo.z) * vInfo.w;
        vec3 col; vec3 em = vec3(0.0);
        float diff = max(dot(n, uSunDir), 0.0);
        if (vNl.y > 0.5) { // 屋上: 暗い防水面と設備の影
          vec2 r = vL.xz * vSize.xz; float eq = step(0.86, h(floor(r / 3.0) + seed));
          col = mix(vec3(0.26, 0.27, 0.29), vec3(0.5), eq * 0.5) * (uAmb + uSun * diff);
        } else {
          float u = (abs(vNl.x) > 0.5 ? vL.z * vSize.z : vL.x * vSize.x), v = vL.y * vSize.y;
          float style = vInfo.y;
          vec2 cell = vec2(mix(2.6, 3.6, fract(seed * 7.3)), mix(3.1, 3.6, fract(seed * 3.1)));
          vec2 g = vec2(u, v) / cell; vec2 id = floor(g), f = fract(g);
          vec2 aa = fwidth(g) * 1.5;
          float wx = smoothstep(0.12 - aa.x, 0.12 + aa.x, f.x) * (1.0 - smoothstep(0.88 - aa.x, 0.88 + aa.x, f.x));
          float wy = smoothstep(0.24 - aa.y, 0.24 + aa.y, f.y) * (1.0 - smoothstep(0.82 - aa.y, 0.82 + aa.y, f.y));
          float win = style < 0.33 ? wx * wy : style < 0.66 ? wy : max(wx * wy, 0.9) * step(0.04, f.x) * step(0.05, f.y); // 個別窓／横連窓／ガラス張り
          float lod = clamp(max(aa.x, aa.y) * 1.3, 0.0, 1.0);        // 遠くは平均にとかす（ちらつき防止）
          win = mix(win, 0.45, lod);
          float r1 = h(id + seed * 57.0), r2 = h(id * 1.7 + seed * 13.0);
          // 窓ガラス: 空の反射（上の階ほど明るい）＋太陽のきらめき
          float fres = 0.35 + 0.65 * pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
          vec3 glass = mix(vec3(0.07, 0.1, 0.14), uSky * (0.55 + 0.5 * r2), fres) + uSun * pow(max(dot(reflect(-uSunDir, n), normalize(cameraPosition - vW)), 0.0), 40.0) * 0.8;
          col = mix(wall * (uAmb + uSun * diff), glass, win);
          // 灯り: 窓ごとに点灯・色温度が違い、ゆっくり点いたり消えたりする
          float on = step(r1, uLit + 0.08 * sin(uTime * 0.07 + r2 * 40.0)) * step(0.01, uLit);
          vec3 lc = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.9, 1.0), step(0.78, r2)) * (0.5 + 1.1 * r2);
          float tv = step(0.93, r2) * (0.5 + 0.5 * sin(uTime * 9.0 + r1 * 30.0));
          em = lc * on * win * (1.0 - lod * 0.55) * 0.75 + vec3(0.3, 0.45, 1.0) * tv * on * win * 0.3;
          // 最上部の帯と地上階の店の灯り
          col *= 1.0 - 0.25 * step(vSize.y - 1.2, v);
          em += vec3(1.0, 0.8, 0.55) * step(v, 3.5) * uLit * 0.8 * (0.4 + 0.6 * h(vec2(floor(u / 5.0), seed)));
        }
        col += em;
        float fog = 1.0 - exp(-uFogD * uFogD * vDist * vDist);
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class City {
  constructor(theme, { density = 1, heroW = 12, heroTop = 40, envMap, lite = false } = {}) {
    this.group = new THREE.Group(); this.group.name = 'city';
    const s = SKY[theme], night = theme === 'night', dusk = theme === 'dusk', dark = night || dusk, r = makeRng(77 + theme.length * 13);
    this.theme = theme; this.t = 0; this.night = night; this.dark = dark;
    const m4 = this.m4 = new THREE.Matrix4(), q = this.q = new THREE.Quaternion(), one = this.one = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), S = new THREE.Vector3();
    const glow = getGlowTexture();
    // ---- 地面と道路（項目 22）: 車線・中央線・歩道のタイル・縁石・マンホール。夜は濡れて映りこむ ----
    const road = makeTextTexture((c, w, h) => {
      c.fillStyle = night ? '#17181c' : '#45474b'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() * 0.035})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (let i = 0; i < 14; i++) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1 + Math.random() * 2; c.beginPath(); let x = Math.random() * w, y = h * (0.15 + Math.random() * 0.7); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += 20 + Math.random() * 40; y += (Math.random() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); } // ひび・補修跡
      const sw = h * 0.125; // 歩道 3m
      for (const y0 of [0, h - sw]) { c.fillStyle = night ? '#4a4a48' : '#a9a69b'; c.fillRect(0, y0, w, sw); c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1; for (let x = 0; x < w; x += w / 40) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + sw); c.stroke(); } for (let y = y0; y < y0 + sw; y += sw / 5) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }
      c.fillStyle = '#d8d4c4'; c.fillRect(0, sw - 4, w, 6); c.fillRect(0, h - sw - 2, w, 6); // 縁石
      c.fillStyle = '#e9c93a'; c.fillRect(0, h * 0.495, w, 3); c.fillRect(0, h * 0.505, w, 3); // 中央線（黄 2 本）
      c.fillStyle = '#e8e6da'; for (const ly of [0.31, 0.69]) for (let x = 0; x < w; x += w / 4) c.fillRect(x, h * ly, w / 10, 4); // 車線の破線
      c.fillRect(0, sw + 10, w, 3); c.fillRect(0, h - sw - 13, w, 3); // 路側線
      c.fillStyle = '#2a2b2e'; c.beginPath(); c.arc(w * 0.62, h * 0.4, 12, 0, 6.3); c.fill(); c.strokeStyle = '#555'; c.stroke(); // マンホール
    }, 1024, 1024).tex;
    road.wrapS = road.wrapT = THREE.RepeatWrapping; road.repeat.set(50, 1); road.anisotropy = 8;
    const street = new THREE.Mesh(new THREE.PlaneGeometry(1200, 24), new THREE.MeshStandardMaterial({ map: road, roughness: night ? 0.22 : 0.85, metalness: night ? 0.25 : 0, envMap, envMapIntensity: night ? 1.6 : 0.4 }));
    street.rotation.x = -Math.PI / 2; street.position.set(0, -0.14, 14); street.receiveShadow = true; this.group.add(street);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: night ? 0x121318 : dusk ? 0x54464a : 0x6a6e6c, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.17; this.group.add(ground);
    // 横断歩道と停止線（主役のビルの両脇）
    const cw = makeTextTexture((c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(236,234,222,0.92)'; for (let i = 0; i < 9; i++) c.fillRect(0, h * (0.06 + i * 0.1), w, h * 0.055); }, 64, 512).tex;
    this.stops = [-(heroW / 2 + 5), heroW / 2 + 5];
    for (const x of this.stops) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 18), new THREE.MeshBasicMaterial({ map: cw, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.13, 14); m.renderOrder = 1; this.group.add(m); }

    // ---- 遠景ビル（項目 18・19）: 段々のビル・塔屋つき。1 回の描画 ----
    const boxes = [];
    const push = (x, y, z, w, h, d, ry, info) => boxes.push({ x, y, z, w, h, d, ry, info });
    const nB = Math.round(260 * density);
    this.beaconPos = [];
    let tries = 0;
    while (boxes.length < nB * 1.6 && tries++ < nB * 30) {
      const x = r.range(-520, 520), z = r.range(-560, 110);
      if (Math.abs(x) < heroW / 2 + 9 && z > -34 && z < 2) continue;      // 主役のビルの敷地
      if (z > -1 && z < 29) continue;                                       // 前の大通り
      const dd = Math.hypot(x, z);
      const tall = r.next() < (dd < 260 ? 0.3 : 0.12);
      const w = r.range(12, 26), d = r.range(12, 26);
      let h = tall ? r.range(55, theme === 'tower' ? 170 : 120) : r.range(10, 42);
      if (z > 29 && z < 60) h = Math.min(h, 60);
      const ry = r.chance(0.25) ? r.range(-0.25, 0.25) : 0;
      const info = [r.next(), r.next(), r.next(), r.range(0.7, 1.1)];
      push(x, -0.17, z, w, h, d, ry, info);
      if (tall && r.chance(0.6)) { const h2 = h * r.range(0.15, 0.35); push(x, h - 0.17, z, w * 0.68, h2, d * 0.68, ry, info); if (r.chance(0.5)) push(x, h + h2 - 0.17, z, w * 0.4, h2 * 0.6, d * 0.4, ry, info); h += h2; } // 段々
      else if (r.chance(0.5)) push(x + r.range(-3, 3), h - 0.17, z + r.range(-3, 3), w * 0.3, r.range(2, 5), d * 0.3, ry, [info[0], 0.1, info[2], info[3] * 0.8]); // 塔屋
      if (h > 60) this.beaconPos.push(x, h + 1.5, z);
    }
    // 両隣のビル（近景）
    for (const sgn of [-1, 1]) { const h = heroTop * (sgn < 0 ? 0.74 : 0.56); push(sgn * (heroW / 2 + 14.5), -0.17, -9, 18, h, 20, 0, [0.3 + sgn * 0.2, sgn < 0 ? 0.1 : 0.5, 0.6, 0.95]); push(sgn * (heroW / 2 + 14.5), h - 0.17, -11, 8, 4, 8, 0, [0.5, 0.1, 0.5, 0.8]); }
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    const info = new Float32Array(boxes.length * 4);
    this.facadeMat = makeFacadeMaterial(theme, s);
    const im = new THREE.InstancedMesh(bg, this.facadeMat, boxes.length);
    boxes.forEach((b, i) => { im.setMatrixAt(i, m4.compose(P.set(b.x, b.y, b.z), q.setFromEuler(new THREE.Euler(0, b.ry, 0)), S.set(b.w, b.h, b.d))); info.set(b.info, i * 4); });
    bg.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    im.frustumCulled = false; this.group.add(im);
    // 航空障害灯（高いビルの屋上で赤く明滅）
    if (this.beaconPos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.beaconPos, 3));
      this.beacons = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff3020, size: dark ? 7 : 3.5, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false, fog: false }));
      this.beacons.frustumCulled = false; this.group.add(this.beacons);
    }
    // ---- ランドマーク（項目 20）: 架空の電波塔と観覧車 ----
    {
      const parts = [], cols = [];
      const tx = -150, tz = -260, H = 190;
      const prof = [[9, 0], [5.5, 30], [3.2, 70], [2.2, 105], [4.8, 110], [5.2, 118], [2.0, 124], [1.2, 160], [0.25, H]].map(([rr, y]) => new THREE.Vector2(rr, y));
      parts.push(T(new THREE.LatheGeometry(prof, 10), tx, 0, tz)); cols.push(dark ? 0x7a3a2a : 0xe8e4dc);
      for (const y of [30, 70, 105]) { parts.push(T(new THREE.TorusGeometry(y === 30 ? 5.7 : y === 70 ? 3.4 : 2.4, 0.5, 6, 16), tx, y, tz, Math.PI / 2)); cols.push(0xd8442c); }
      const tower = new THREE.Mesh(mergeSimple(parts, cols), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, emissive: dark ? 0xff7a3a : 0x000000, emissiveIntensity: dark ? 0.55 : 0 }));
      this.group.add(tower);
      if (dark) { const ring = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.35, 6, 24), new THREE.MeshBasicMaterial({ color: 0x8fe8ff, toneMapped: false, fog: true })); ring.rotation.x = Math.PI / 2; ring.position.set(tx, 114, tz); this.group.add(ring); this.towerRing = ring; }
      this.beaconPos.push(tx, H + 2, tz);
      // 観覧車
      const wx = 170, wz = -200, R = 34;
      const wheel = this.wheel = new THREE.Group(); wheel.position.set(wx, R + 8, wz); wheel.rotation.y = 0.5;
      const wp = [new THREE.TorusGeometry(R, 0.5, 6, 48), new THREE.TorusGeometry(R * 0.82, 0.25, 5, 40)]; const wc = [0xf2f2f2, 0xf2f2f2];
      for (let i = 0; i < 16; i++) { wp.push(T(new THREE.CylinderGeometry(0.16, 0.16, R * 2, 5), 0, 0, 0, 0, 0, (i / 16) * Math.PI)); wc.push(0xdddddd); }
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; wp.push(T(new THREE.SphereGeometry(2.1, 8, 6), Math.cos(a) * R, Math.sin(a) * R, 0)); wc.push([0xff5a6a, 0xffd34a, 0x5ad0ff, 0x7dffb0][i % 4]); }
      wheel.add(new THREE.Mesh(mergeSimple(wp, wc), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: dark ? 0.5 : 0.0 })));
      this.group.add(wheel);
      const legs = new THREE.Mesh(mergeSimple([T(new THREE.CylinderGeometry(0.6, 0.9, R + 12, 6), -9, (R + 8) / 2, 0, 0, 0, -0.25), T(new THREE.CylinderGeometry(0.6, 0.9, R + 12, 6), 9, (R + 8) / 2, 0, 0, 0, 0.25)]), new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.6 }));
      legs.position.set(wx, 0, wz); legs.rotation.y = 0.5; this.group.add(legs);
    }
    // ---- 山の稜線（項目 21）: 霞の向こうの 2 重のシルエット ----
    for (const [rad, hgt, mix, seed] of [[860, 150, 0.72, 3], [800, 95, 0.52, 9]]) {
      const N = 96, pos = [], idx = [], rr = makeRng(seed);
      const ph = [rr.range(0, 6), rr.range(0, 6), rr.range(0, 6)];
      for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; const hh = hgt * (0.35 + 0.3 * Math.sin(a * 3 + ph[0]) + 0.2 * Math.sin(a * 7 + ph[1]) + 0.12 * Math.sin(a * 17 + ph[2]) + 0.25);
        pos.push(Math.cos(a) * rad, -5, Math.sin(a) * rad, Math.cos(a) * rad, Math.max(8, hh), Math.sin(a) * rad); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const mt = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: C(s.hor).lerp(C(night ? 0x0a0c18 : dusk ? 0x3a2a4a : 0x5f7f9a), 1 - mix), fog: false, side: THREE.DoubleSide })); mt.frustumCulled = false; this.group.add(mt);
    }
    // ---- 街灯・信号・街路樹・バス停（項目 22） ----
    const lampX = []; for (let x = -96; x <= 96; x += 16) lampX.push(x);
    const poleGeo = mergeSimple([T(new THREE.CylinderGeometry(0.07, 0.1, 6.4, 8), 0, 3.2, 0), T(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), 0, 6.3, 0.8, Math.PI / 2), T(new THREE.BoxGeometry(0.3, 0.1, 0.7), 0, 6.25, 1.6)]);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.6 }), lampX.length * 2);
    const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.04, 0.6), new THREE.MeshBasicMaterial({ color: dark ? 0xfff0c8 : 0xdddddd, toneMapped: !dark }), lampX.length * 2);
    let li = 0; const lampPts = [];
    for (const x of lampX) for (const side of [0, 1]) { const z = side ? 24.5 : 3.5, ry = side ? Math.PI : 0; m4.compose(P.set(x, -0.14, z), q.setFromEuler(new THREE.Euler(0, ry, 0)), one); poles.setMatrixAt(li, m4);
      const bz = z + (side ? -1.6 : 1.6); bulbs.setMatrixAt(li, m4.compose(P.set(x, 6.04, bz), q.identity(), one)); lampPts.push([x, 6.0, bz]); li++; }
    poles.castShadow = false; this.group.add(poles, bulbs);
    if (dark) { // 夜の街灯: にじみと、路面の光の円
      const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.Float32BufferAttribute(lampPts.flat(), 3));
      const halos = new THREE.Points(gp, new THREE.PointsMaterial({ color: 0xffd9a0, size: 5.5, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); halos.frustumCulled = false; this.group.add(halos);
      const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffc070, map: glow, transparent: true, opacity: night ? 0.5 : 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), lampPts.length);
      lampPts.forEach((p, i) => pools.setMatrixAt(i, m4.compose(P.set(p[0], -0.12, p[2]), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), S.set(13, 13, 1)))); pools.renderOrder = 2; this.group.add(pools);
    }
    // 信号機（柱＋灯器。色は update で切替）
    this.signals = [];
    const sigGeo = mergeSimple([T(new THREE.CylinderGeometry(0.09, 0.11, 5.6, 8), 0, 2.8, 0), T(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 6), 0, 5.4, 2.2, Math.PI / 2), T(new THREE.BoxGeometry(0.4, 0.45, 1.3), 0, 5.4, 4.0)]);
    for (const [i, x] of this.stops.entries()) for (const side of [0, 1]) {
      const z = side ? 26.2 : 1.8, ry = side ? Math.PI : 0;
      const pole = new THREE.Mesh(sigGeo, new THREE.MeshStandardMaterial({ color: 0x30353c, roughness: 0.5, metalness: 0.5 })); pole.position.set(x + (side ? 2.5 : -2.5), -0.14, z); pole.rotation.y = ry; this.group.add(pole);
      const lamps = [0xff3020, 0xffc020, 0x20e070].map((c, k) => { const mm = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); mm.position.set(side ? 0.21 : -0.21, 5.4, 4.0 + (k - 1) * 0.4 * (side ? -1 : 1)); mm.rotation.y = side ? Math.PI / 2 : -Math.PI / 2; pole.add(mm); return mm; });
      // 進行方向の車から見える向き: side 0 は +x へ走る車線（z=11 側）の正面 = -x を向く
      this.signals.push({ lamps, base: [0xff3020, 0xffc020, 0x20e070] });
    }
    // 街路樹（幹＋葉のかたまり 3 つ）
    const treeX = []; for (let x = -88; x <= 88; x += 16) if (Math.abs(x) > heroW / 2 + 2) treeX.push(x);
    const leafC = dusk ? 0x7a6a2a : night ? 0x1c3a2a : 0x4a8a3a;
    const treeGeo = mergeSimple([T(new THREE.CylinderGeometry(0.11, 0.17, 2.6, 7), 0, 1.3, 0), T(new THREE.IcosahedronGeometry(1.25, 1), 0, 3.4, 0), T(new THREE.IcosahedronGeometry(0.9, 1), 0.7, 2.9, 0.3), T(new THREE.IcosahedronGeometry(0.85, 1), -0.6, 3.0, -0.4), T(new THREE.IcosahedronGeometry(0.7, 1), 0.1, 4.2, 0.1)], [0x5a3f2a, leafC, leafC, leafC, leafC]);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), treeX.length * 2);
    treeX.forEach((x, i) => { for (const side of [0, 1]) { const sc = 0.85 + ((i * 37 + side * 11) % 10) / 22; trees.setMatrixAt(i * 2 + side, m4.compose(P.set(x + 8, -0.14, side ? 24.2 : 3.8), q.setFromEuler(new THREE.Euler(0, i * 1.7, 0)), S.set(sc, sc, sc))); } });
    trees.castShadow = true; this.group.add(trees);
    // バス停（屋根と風よけ）
    { const g = mergeSimple([T(new THREE.BoxGeometry(4, 0.1, 1.6), 0, 2.6, 0), T(new THREE.BoxGeometry(4, 2.3, 0.06), 0, 1.4, -0.75), T(new THREE.BoxGeometry(0.08, 2.6, 0.08), -1.9, 1.3, 0.7), T(new THREE.BoxGeometry(0.08, 2.6, 0.08), 1.9, 1.3, 0.7), T(new THREE.BoxGeometry(3, 0.08, 0.4), 0, 0.5, -0.4)], [0x2f3a44, 0x9fc4d8, 0x2f3a44, 0x2f3a44, 0x8a6a4a]);
      const bs = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, envMap })); bs.position.set(-(heroW / 2 + 14), -0.14, 25); bs.rotation.y = Math.PI; this.group.add(bs); }

    // ---- 車（項目 23）: セダン形（車体色）＋窓とタイヤ（暗色）。赤信号で止まり、前の車と間隔を保つ ----
    const prof = new THREE.Shape(); prof.moveTo(-2.1, 0.32); prof.lineTo(-2.15, 0.75); prof.lineTo(-1.5, 0.95); prof.lineTo(-0.95, 1.42); prof.lineTo(0.55, 1.42); prof.lineTo(1.2, 0.98); prof.lineTo(2.05, 0.85); prof.lineTo(2.15, 0.35); prof.closePath();
    const bodyG = new THREE.ExtrudeGeometry(prof, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }); bodyG.translate(0, 0, -0.85);
    const darkParts = [T(new THREE.BoxGeometry(1.5, 0.36, 1.78), -0.2, 1.17, 0)];
    for (const x of [-1.35, 1.35]) for (const z of [-0.88, 0.88]) darkParts.push(T(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), x, 0.34, z, Math.PI / 2));
    this.nCars = Math.round(22 * Math.max(0.45, density));
    this.cars = new THREE.InstancedMesh(bodyG, new THREE.MeshPhysicalMaterial({ roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.15, envMap, envMapIntensity: 1.3 }), this.nCars);
    this.carDark = new THREE.InstancedMesh(mergeSimple(darkParts), new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.25, metalness: 0.5, envMap, envMapIntensity: 1.5 }), this.nCars);
    this.carState = [];
    const palette = [0xd8342c, 0xf2f2f2, 0x1f2f4f, 0xf2c230, 0x2b2b2e, 0x2f8f5a, 0x9aa3ad, 0xe8e8e8, 0x8a1f2a];
    for (let i = 0; i < this.nCars; i++) { const lane = i % 4, dir = lane < 2 ? 1 : -1; this.carState.push({ x: -300 + (i / this.nCars) * 600 + r.range(-8, 8), z: [8.0, 11.6, 16.4, 20.0][lane], dir, v0: r.range(9, 13), v: 10, lane }); this.cars.setColorAt(i, C(r.pick(palette))); }
    this.cars.castShadow = true; this.group.add(this.cars, this.carDark);
    // ライト: 昼は小さく、夜はにじんで路面を照らす
    this.carLights = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: dark ? 1 : 0.5 }), this.nCars * 2);
    this.carLights.frustumCulled = false; this.group.add(this.carLights);
    if (dark) { this.carPools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xfff0c0, map: glow, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), this.nCars); this.carPools.frustumCulled = false; this.carPools.renderOrder = 2; this.group.add(this.carPools); }
    // ---- 歩行者（項目 24）: 胴・頭・脚の形。夜の雨の棟では傘をさす ----
    this.nPeople = Math.round(36 * Math.max(0.3, density));
    const pg = mergeSimple([T(new THREE.CapsuleGeometry(0.19, 0.5, 3, 8), 0, 1.15, 0), T(new THREE.SphereGeometry(0.13, 10, 8), 0, 1.68, 0), T(new THREE.CapsuleGeometry(0.085, 0.6, 2, 6), -0.1, 0.45, 0), T(new THREE.CapsuleGeometry(0.085, 0.6, 2, 6), 0.1, 0.45, 0)], [0xffffff, 0xf0c8a8, 0x30343c, 0x30343c]);
    this.people = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), this.nPeople);
    this.peopleState = [];
    const cloth = [0x2f4f7f, 0x9f3f3f, 0xe0d8c8, 0x4a4a4a, 0xc89a3a, 0x5a7f4a, 0xd87fa0, 0x6a5acd];
    for (let i = 0; i < this.nPeople; i++) { this.peopleState.push({ x: r.range(-70, 70), z: i % 3 === 0 ? r.range(2.4, 3.2) : r.range(23.6, 25.6), v: r.range(0.9, 1.5) * (r.chance(0.5) ? 1 : -1), ph: r.range(0, 6) }); this.people.setColorAt(i, C(r.pick(cloth))); }
    // 手前の歩道の人は主役のビルの正面を避ける（カメラの直前に来ない）
    for (const p of this.peopleState) if (p.z < 5 && Math.abs(p.x) < heroW / 2 + 6) p.x = (heroW / 2 + 8 + Math.abs(p.x)) * (p.x < 0 ? -1 : 1);
    this.heroW = heroW;
    this.people.castShadow = true; this.group.add(this.people);
    if (night) { this.umbrellas = new THREE.InstancedMesh(mergeSimple([T(new THREE.ConeGeometry(0.62, 0.26, 10, 1, true), 0, 2.12, 0), T(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), 0, 1.7, 0)]), new THREE.MeshStandardMaterial({ roughness: 0.4, side: THREE.DoubleSide }), this.nPeople);
      const uc = [0xff5a6a, 0xffffff, 0x5ad0ff, 0xffd34a, 0x222222, 0xddffee]; for (let i = 0; i < this.nPeople; i++) this.umbrellas.setColorAt(i, C(r.pick(uc))); this.group.add(this.umbrellas); }

    // ---- 空のにぎわい（項目 25）: 飛行船・飛行機と飛行機雲・鳥の群れ ----
    if (!lite) {
      const blimp = this.blimp = new THREE.Group();
      const hull = new THREE.SphereGeometry(1, 24, 14); hull.scale(16, 4.6, 4.6);
      const ad = makeTextTexture((c, w, h) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8342c'; c.fillRect(0, h * 0.42, w, h * 0.16); c.fillStyle = '#1d3f7a'; c.font = `900 ${h * 0.1}px sans-serif`; c.textAlign = 'center'; for (const x of [0.25, 0.75]) c.fillText('SKY CLIMBER', w * x, h * 0.535); }, 1024, 512).tex;
      blimp.add(new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ map: ad, roughness: 0.5, emissive: 0xffffff, emissiveMap: ad, emissiveIntensity: dark ? 0.5 : 0 })));
      blimp.add(new THREE.Mesh(mergeSimple([T(new THREE.BoxGeometry(4, 1.3, 1.6), 0, -4.9, 0), T(new THREE.BoxGeometry(4, 5, 0.3), -14, 2.4, 0), T(new THREE.BoxGeometry(4, 0.3, 5), -14, 0, 2.4), T(new THREE.BoxGeometry(4, 0.3, 5), -14, 0, -2.4), T(new THREE.BoxGeometry(4, 5, 0.3), -14, -2.4, 0)]), new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.5 })));
      this.group.add(blimp);
      const plane = this.plane = new THREE.Group();
      plane.add(new THREE.Mesh(mergeSimple([T(new THREE.CapsuleGeometry(1.2, 12, 4, 10), 0, 0, 0, 0, 0, Math.PI / 2), T(new THREE.BoxGeometry(3, 0.25, 16), 0.5, 0, 0), T(new THREE.BoxGeometry(1.6, 0.2, 6), -6.5, 0.3, 0), T(new THREE.BoxGeometry(2, 2.6, 0.2), -6.6, 1.4, 0)]), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.3 })));
      const trail = new THREE.Mesh(new THREE.PlaneGeometry(260, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: dark ? 0.12 : 0.55, depthWrite: false, fog: false, side: THREE.DoubleSide,
        map: makeTextTexture((c, w, h) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = g; c.fillRect(0, h * 0.2, w, h * 0.6); }, 256, 16).tex }));
      trail.position.x = -138; trail.rotation.x = -Math.PI / 2; plane.add(trail);
      this.planeLight = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false, fog: false })); this.planeLight.position.set(0, -1.3, 0); plane.add(this.planeLight);
      this.group.add(plane);
      // 鳥の群れ（遠くを V 字で渡る）
      const bgq = new THREE.BufferGeometry(); bgq.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, 0.25, -0.5, -0.2, 0, 0.3, 0, 0, 0, -0.2, 0, -0.3, -1, 0.25, 0.5], 3)); bgq.computeVertexNormals();
      this.flock = new THREE.InstancedMesh(bgq, new THREE.MeshBasicMaterial({ color: dark ? 0x101018 : 0x2a2f38, side: THREE.DoubleSide }), 13); this.flock.frustumCulled = false; this.group.add(this.flock);
    }
    // ---- 高度の雲（項目 27）: 登るにつれて横を流れていく薄い雲 ----
    const cloudTex = makeTextTexture((c, w, h) => { c.clearRect(0, 0, w, h); const rr = makeRng(5); for (let i = 0; i < 60; i++) { const x = w * (0.2 + rr.next() * 0.6), y = h * (0.35 + rr.next() * 0.3), rad = w * (0.08 + rr.next() * 0.16); const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); } }, 256, 128).tex;
    const nC = theme === 'tower' ? 16 : theme === 'night' ? 6 : 8;
    this.wisps = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cloudTex, color: C(night ? 0x3a3a5a : dusk ? 0xffb090 : 0xffffff), transparent: true, opacity: night ? 0.35 : 0.6, depthWrite: false, fog: false }), nC);
    this.wispState = []; for (let i = 0; i < nC; i++) this.wispState.push({ x: r.range(-90, 90), y: (theme === 'tower' ? 28 : 22) + (i / nC) * Math.max(20, heroTop - 10) + r.range(-3, 3), z: r.range(-30, 50), v: r.range(0.6, 2.0), s: r.range(28, 60) });
    for (const w of this.wispState) if (Math.abs(w.z) < 12) w.z = 14 + Math.abs(w.z) * 2;   // ビルの面とカメラの間には置かない
    this.wisps.frustumCulled = false; this.wisps.renderOrder = 5; this.group.add(this.wisps);
    this.signalT = r.range(0, 10);
  }
  // cam: カメラのワールド位置（雲を正対させる）
  update(dt, cam) {
    this.t += dt; const t = this.t;
    const m4 = this.m4, q = this.q, one = this.one, P = new THREE.Vector3(), S = new THREE.Vector3();
    this.facadeMat.uniforms.uTime.value = t;
    if (this.beacons) this.beacons.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6)) ** 4;
    if (this.towerRing) this.towerRing.material.color.setHSL((t * 0.05) % 1, 0.8, 0.65);
    this.wheel.rotation.z = t * 0.05;
    // 信号: 緑 9 秒 → 黄 2 秒 → 赤 6 秒
    const ph = (t + this.signalT) % 17, state = ph < 9 ? 2 : ph < 11 ? 1 : 0;
    for (const sg of this.signals) sg.lamps.forEach((l, k) => l.material.color.setHex(k === state ? sg.base[k] : 0x1a1c20));
    // 車
    const cs = this.carState;
    for (let i = 0; i < this.nCars; i++) {
      const c = cs[i]; let target = c.v0;
      if (state !== 2) for (const sx of this.stops) { const stop = sx - c.dir * 3.2, ahead = (stop - c.x) * c.dir; if (ahead > 0 && ahead < 16) target = Math.min(target, Math.max(0, (ahead - 1) * 0.9)); }
      for (let j = 0; j < this.nCars; j++) { const o = cs[j]; if (o === c || o.lane !== c.lane) continue; const gap = (o.x - c.x) * c.dir; if (gap > 0 && gap < 11) target = Math.min(target, Math.max(0, (gap - 6) * 1.5)); }
      c.v += Math.max(-9 * dt, Math.min(4 * dt, target - c.v)); c.x += c.v * c.dir * dt;
      if (c.x > 320) c.x = -320; if (c.x < -320) c.x = 320;
      q.setFromEuler(new THREE.Euler(0, c.dir > 0 ? 0 : Math.PI, 0));
      m4.compose(P.set(c.x, -0.14, c.z), q, one); this.cars.setMatrixAt(i, m4); this.carDark.setMatrixAt(i, m4);
      const braking = target < c.v0 - 1;
      const col = new THREE.Color();
      this.carLights.setMatrixAt(i * 2, m4.compose(P.set(c.x + c.dir * 2.2, 0.62, c.z), q.setFromEuler(new THREE.Euler(0, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)), S.set(this.dark ? 4.2 : 1.6, this.dark ? 1.6 : 0.6, 1)));
      this.carLights.setColorAt(i * 2, col.setHex(0xfff2d0));
      this.carLights.setMatrixAt(i * 2 + 1, m4.compose(P.set(c.x - c.dir * 2.2, 0.72, c.z), q.setFromEuler(new THREE.Euler(0, c.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0)), S.set(braking ? 3.6 : 2.2, braking ? 1.3 : 0.8, 1)));
      this.carLights.setColorAt(i * 2 + 1, col.setHex(braking ? 0xff2010 : 0xb01008));
      if (this.carPools) this.carPools.setMatrixAt(i, m4.compose(P.set(c.x + c.dir * 7, -0.115, c.z), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), S.set(13, 4.5, 1)));
    }
    this.cars.instanceMatrix.needsUpdate = true; this.carDark.instanceMatrix.needsUpdate = true; this.carLights.instanceMatrix.needsUpdate = true; if (this.carLights.instanceColor) this.carLights.instanceColor.needsUpdate = true;
    if (this.carPools) this.carPools.instanceMatrix.needsUpdate = true;
    // 歩行者: 歩く上下動と左右のゆれ。進行方向を向く
    for (let i = 0; i < this.nPeople; i++) {
      const p = this.peopleState[i]; p.x += p.v * dt; if (Math.abs(p.x) > 70) p.v *= -1; p.ph += dt * 7 * Math.abs(p.v);
      if (p.z < 5 && Math.abs(p.x) < this.heroW / 2 + 5) p.v = Math.abs(p.v) * (p.x < 0 ? -1 : 1); // ビルの正面の手前で引き返す
      const bob = Math.abs(Math.sin(p.ph)) * 0.045;
      q.setFromEuler(new THREE.Euler(0, p.v > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(p.ph) * 0.05));
      m4.compose(P.set(p.x, -0.14 + bob, p.z), q, one); this.people.setMatrixAt(i, m4);
      if (this.umbrellas) this.umbrellas.setMatrixAt(i, m4);
    }
    this.people.instanceMatrix.needsUpdate = true; if (this.umbrellas) this.umbrellas.instanceMatrix.needsUpdate = true;
    // 飛行船・飛行機・鳥の群れ
    if (this.blimp) {
      const a = t * 0.012 + 1.2; this.blimp.position.set(Math.cos(a) * 210, 95 + Math.sin(t * 0.2) * 3, 120 + Math.sin(a) * 160 - 200); this.blimp.rotation.y = -a - Math.PI / 2 + Math.PI;
      const px = ((t * 28) % 1600) - 800; this.plane.position.set(px, 330, -420); this.planeLight.visible = Math.sin(t * 6) > 0.6;
      const fx = ((t * 7 + 300) % 700) - 350;
      for (let i = 0; i < 13; i++) { const k = Math.ceil(i / 2), sgn = i % 2 ? 1 : -1; const flap = Math.sin(t * 7 + i * 1.3);
        this.flock.setMatrixAt(i, m4.compose(P.set(fx - k * 3.2, 62 + Math.sin(t * 0.5 + i) * 1.5 + k * 0.4, -120 + sgn * k * 3.0), q.identity(), S.set(2.4, 2.4 * (0.3 + flap), 2.4))); }
      this.flock.instanceMatrix.needsUpdate = true;
    }
    // 高度の雲: 風で横へ流れ、カメラの方を向く
    for (let i = 0; i < this.wispState.length; i++) {
      const w = this.wispState[i]; w.x += w.v * dt; if (w.x > 110) w.x = -110;
      P.set(w.x, w.y, w.z); if (cam) { m4.lookAt(cam, P, new THREE.Vector3(0, 1, 0)); q.setFromRotationMatrix(m4); } else q.identity();
      this.wisps.setMatrixAt(i, m4.compose(P, q, S.set(w.s, w.s * 0.5, 1)));
    }
    this.wisps.instanceMatrix.needsUpdate = true;
  }
}
