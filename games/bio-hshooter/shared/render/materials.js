// VOIDBLOOM — 材質（冷たい金属・甲殻・脈打つ肉・発光）。外部テクスチャは使わず、すべて計算で作る。
import * as THREE from 'three';

export const U = { time: { value: 0 } };
let lib = null;

// 輪郭光（フレネル）と、肉の脈動（頂点のゆれ＋血管の発光）を足す。暗い宇宙で敵の形が読めるように
function patch(mat, opt = {}) {
  const rim = new THREE.Color(opt.rim ?? 0x6fa8d8).multiplyScalar(opt.rimGain ?? 0.55);
  const flesh = !!opt.flesh;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uRim = { value: rim };
    sh.uniforms.uVein = { value: new THREE.Color(opt.vein ?? 0xff3a7a).multiplyScalar(opt.veinGain ?? 0.75) };
    sh.uniforms.uPulse = { value: flesh ? (opt.pulse ?? 0.05) : 0 };
    sh.vertexShader = 'uniform float uTime; uniform float uPulse; varying vec3 vFP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vFP = position; transformed += normal * sin(dot(position, vec3(3.1, 2.7, 1.9)) + uTime * 2.2) * uPulse;');
    let frag = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n float rimK = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 2.5);\n totalEmissiveRadiance += uRim * rimK;' +
      (flesh ? '\n vec3 vq = vFP * ' + (opt.freq ?? 1).toFixed(3) + ';\n float vv = abs(sin(vq.x * 5.3 + sin(vq.y * 4.1 + vq.z * 2.3) * 1.7 + uTime * 0.5));\n vv = smoothstep(0.965, 1.0, vv) * (0.55 + 0.45 * sin(uTime * 3.0 + vq.y * 1.7));\n totalEmissiveRadiance += uVein * vv;' : ''));
    sh.fragmentShader = 'uniform float uTime; uniform vec3 uRim; uniform vec3 uVein; varying vec3 vFP;\n' + frag;
  };
  mat.customProgramCacheKey = () => 'vb' + (flesh ? 'f' : 'm') + rim.getHexString() + (opt.vein ?? 0) + '_' + (opt.freq ?? 1);
  return mat;
}
// 肉: 濡れて光り（粗さ低め）、輪郭が皮膚の下から透けるように暖色に光る（簡易な表面下散乱）
const fleshPatch = (mat, opt = {}) => { mat.roughness = Math.min(mat.roughness, 0.32); return patch(mat, { ...opt, flesh: true, rim: opt.rim ?? 0xff5a7a, rimGain: opt.rimGain ?? 0.55 }); };

// 環境マップ: 暗い宇宙に冷たい青と紫の光の帯だけがある部屋（金属の映り込み用）
export function makeEnvironment(renderer) {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x020306);
  const add = (color, x, y, z, w, h, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); sc.add(m);
  };
  add(new THREE.Color(0x9fdcff).multiplyScalar(3), 0, 9, 0, 14, 2, 0, Math.PI / 2);
  add(new THREE.Color(0x4fe3ff).multiplyScalar(1.4), -9, 2, 0, 2, 10, Math.PI / 2);
  add(new THREE.Color(0xff4fb4).multiplyScalar(1.1), 9, -1, 2, 2, 8, -Math.PI / 2);
  add(new THREE.Color(0x203050).multiplyScalar(1), 0, -8, 0, 20, 20, 0, -Math.PI / 2);
  add(new THREE.Color(0xffd0a0).multiplyScalar(0.8), 0, 3, -9, 6, 3);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.03);
  pm.dispose();
  return rt.texture;
}

// 船体パネルの模様（キャンバスで生成）
function panelTexture() {
  const S = 512, c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.fillStyle = '#7d8590'; g.fillRect(0, 0, S, S);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) { const w = 32 + r() * 160, h = 16 + r() * 90, x = r() * S, y = r() * S; const v = 100 + r() * 60; g.fillStyle = `rgb(${v},${v + 6},${v + 14})`; g.fillRect(x, y, w, h); }
  g.strokeStyle = 'rgba(20,24,30,.9)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { const x = Math.floor(r() * 8) * 64, y = Math.floor(r() * 8) * 64; g.strokeRect(x + 1, y + 1, 64 * (1 + Math.floor(r() * 3)), 64 * (1 + Math.floor(r() * 2))); }
  g.fillStyle = 'rgba(15,18,24,.85)';
  for (let i = 0; i < 160; i++) g.fillRect(r() * S, r() * S, 2 + r() * 5, 2 + r() * 5);
  g.fillStyle = 'rgba(255,180,90,.9)';
  for (let i = 0; i < 18; i++) g.fillRect(r() * S, r() * S, 3, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function materials() {
  if (lib) return lib;
  const glow = (c, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const panel = typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined' ? panelTexture() : null;
  lib = {
    steel: patch(new THREE.MeshStandardMaterial({ color: 0xa8b4c2, metalness: 0.9, roughness: 0.28 }), { rimGain: 0.35 }),
    darkSteel: patch(new THREE.MeshStandardMaterial({ color: 0x3a434e, metalness: 0.85, roughness: 0.4 }), { rimGain: 0.45 }),
    gunmetal: patch(new THREE.MeshStandardMaterial({ color: 0x5c6672, metalness: 0.88, roughness: 0.34 }), { rimGain: 0.45 }),
    hull: new THREE.MeshStandardMaterial({ color: 0x6e6c66, metalness: 0.7, roughness: 0.62, map: panel, roughnessMap: panel }),  // 腐食して煤けた船体
    gHull: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2), toneMapped: false }),  // 船体の灯火（ちらつく）
    chitin: patch(new THREE.MeshStandardMaterial({ color: 0x34404c, metalness: 0.5, roughness: 0.2 }), { rim: 0x8fd0ff, rimGain: 0.75 }),
    bone: patch(new THREE.MeshStandardMaterial({ color: 0xcfc6b4, metalness: 0.15, roughness: 0.55 }), { rim: 0xffe8c8, rimGain: 0.25 }),
    flesh: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x4a1c2a, metalness: 0.08, roughness: 0.5, emissive: 0x12030a }), { vein: 0xff3a7a }),
    fleshBig: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x4a1c2a, metalness: 0.08, roughness: 0.48, emissive: 0x12030a }), { vein: 0xff3a7a, freq: 0.42, pulse: 0.08 }),
    fleshTealBig: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x163a3a, metalness: 0.1, roughness: 0.45, emissive: 0x021010 }), { vein: 0x40ffd0, freq: 0.5 }),
    trim: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fe3ff).multiplyScalar(1.6), toneMapped: false }),
    fleshTeal: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x163a3a, metalness: 0.1, roughness: 0.45, emissive: 0x021010 }), { vein: 0x40ffd0 }),
    fleshViolet: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x2c1640, metalness: 0.2, roughness: 0.4, emissive: 0x080210 }), { vein: 0xc080ff }),
    // 黒曜石のような毒の結晶（暗い本体の奥で毒の色がくすぶる）
    crystal: new THREE.MeshStandardMaterial({ color: 0x0e1a16, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.88, emissive: 0x0b3a16, envMapIntensity: 0.9 }),
    crystalViolet: new THREE.MeshStandardMaterial({ color: 0x1a0e26, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.9, emissive: 0x2a0844, envMapIntensity: 0.9 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0x0a2030, metalness: 0.9, roughness: 0.05, emissive: 0x0a4a6a }),
    gCyan: glow(0x4fe3ff), gMagenta: glow(0xff4fb4), gAmber: glow(0xffb347), gBio: glow(0x7dffb0), gRed: glow(0xff3048, 2.6), gWhite: glow(0xffffff, 1.6), gViolet: glow(0xc9a0ff),
    gEye: glow(0xff2a50, 3.2),
  };
  return lib;
}
export const colorOf = { C: 0x4fe3ff, M: 0xff4fb4, A: 0xffb347, S: 0x9fffef, B: 0x7dffb0, P: 0xffffff, w: 0xffe0c0, bio: 0x7dffb0, am: 0xffb347, big: 0xffffff };
