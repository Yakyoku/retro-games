// VOIDBLOOM — 材質（冷たい金属・甲殻・脈打つ肉・発光）。外部テクスチャは使わず、すべて計算で作る。
import * as THREE from 'three';

export const U = { time: { value: 0 } };
let lib = null;

// 面の場の色（面ごとの毒の色。world.setStage が書き換える）
export const LOOK = { rimTint: { value: new THREE.Color(0x7dff4a) } };
// 光と陰影の仕上げ（すべての機体・敵・ボスの材質に入る）:
//  ・二色の輪郭光: 上側は材質の色、下側は面の毒の色（立体感が出る）＋背後からの縁取り光（上側の輪郭に細い光の線）
//  ・鋭い光沢（クリアコートのような小さく強いハイライト）・面の折れ目だけが光るエッジの光（fwidth で法線の変化を拾う）
//  ・下向きの面と凹みを暗く（簡易な環境遮蔽）
//  ・金属: 削り出しの筋（粗さの縞で光沢が線状に流れる）と刻まれたパネルの線 ・甲殻と結晶: 見る角度で色が変わる薄膜の虹色
//  ・肉: 下から透ける暖色の光（表面下散乱）＋脈打つ血管
function patch(mat, opt = {}) {
  const rim = new THREE.Color(opt.rim ?? 0x6fa8d8).multiplyScalar(opt.rimGain ?? 0.55);
  const flesh = !!opt.flesh, mech = !!opt.mech, irid = !!opt.irid;
  const glint = opt.glint ?? (flesh ? 0.35 : 0.8), crease = opt.crease ?? 1;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uRim = { value: rim }; sh.uniforms.uRimTint = LOOK.rimTint;
    sh.uniforms.uVein = { value: new THREE.Color(opt.vein ?? 0xff3a7a).multiplyScalar(opt.veinGain ?? 0.75) };
    sh.uniforms.uPulse = { value: flesh ? (opt.pulse ?? 0.05) : 0 };
    sh.vertexShader = 'uniform float uTime; uniform float uPulse; varying vec3 vFP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vFP = position; transformed += normal * sin(dot(position, vec3(3.1, 2.7, 1.9)) + uTime * 2.2) * uPulse;');
    let frag = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float aoN = normalize(vNormal).y;
      diffuseColor.rgb *= mix(0.48, 1.0, smoothstep(-0.9, 0.45, aoN));` + (mech ? `
      float pnl = max(smoothstep(0.988, 1.0, abs(sin(vFP.x * 4.2))), smoothstep(0.996, 1.0, abs(sin(vFP.z * 6.0 + 1.0))));
      diffuseColor.rgb *= 1.0 - pnl * 0.6;` : ''));
    if (mech) frag = frag.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= 0.62 + 0.75 * pow(abs(sin(vFP.y * 55.0 + sin(vFP.x * 2.0) * 3.0)), 6.0);');
    frag = frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 Nv = normalize(vNormal), Vv = normalize(vViewPosition);
      float fr = 1.0 - clamp(abs(dot(Nv, Vv)), 0.0, 1.0);
      vec3 rimC = mix(uRimTint * 0.7, uRim, smoothstep(-0.45, 0.5, Nv.y));
      totalEmissiveRadiance += rimC * pow(fr, 2.5);
      // 背後からの縁取り光: 上・奥から当たる冷たい光が、輪郭の上側に細い光の線を引く（キャラクターだけ）
      totalEmissiveRadiance += vec3(0.75, 0.9, 1.0) * pow(fr, 4.5) * smoothstep(-0.1, 0.7, Nv.y) * 1.3;
      vec3 Hv = normalize(normalize(vec3(-0.45, 0.75, 0.5)) + Vv);
      totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * pow(max(dot(Nv, Hv), 0.0), 220.0) * ${glint.toFixed(2)};
      // 折れ目の光: 法線の変化を「画面の 1 画素」ではなく「長さ 1u あたり」で測る（遠く小さいものが全体に光らない）
      float curv = length(fwidth(Nv)) / max(length(fwidth(vViewPosition)), 1e-4);
      float crs = smoothstep(5.0, 14.0, curv);
      totalEmissiveRadiance += uRim * crs * ${(crease * 0.9).toFixed(2)};` + (irid ? `
      vec3 ird = 0.5 + 0.5 * cos(6.2831 * (fr * 1.3 + vec3(0.0, 0.33, 0.67)) + uTime * 0.2);
      totalEmissiveRadiance += ird * pow(fr, 1.6) * 0.14;` : '') + (flesh ? `
      totalEmissiveRadiance += diffuseColor.rgb * 0.7 * pow(fr, 1.3) * (0.5 + 0.5 * clamp(-Nv.y, 0.0, 1.0));
      vec3 vq = vFP * ${(opt.freq ?? 1).toFixed(3)};
      float vv = abs(sin(vq.x * 5.3 + sin(vq.y * 4.1 + vq.z * 2.3) * 1.7 + uTime * 0.5));
      vv = smoothstep(0.965, 1.0, vv) * (0.55 + 0.45 * sin(uTime * 3.0 + vq.y * 1.7));
      totalEmissiveRadiance += uVein * vv;` : ''));
    sh.fragmentShader = 'uniform float uTime; uniform vec3 uRim; uniform vec3 uRimTint; uniform vec3 uVein; varying vec3 vFP;\n' + frag;
  };
  mat.customProgramCacheKey = () => ['vb2', flesh, mech, irid, glint, crease, rim.getHexString(), opt.vein ?? 0, opt.freq ?? 1].join('_');
  return mat;
}
// 肉: 濡れて光り（粗さ低め）、輪郭が皮膚の下から透けるように暖色に光る（簡易な表面下散乱）
const fleshPatch = (mat, opt = {}) => { mat.roughness = Math.min(mat.roughness, 0.32); return patch(mat, { ...opt, flesh: true, rim: opt.rim ?? 0xff5a7a, rimGain: opt.rimGain ?? 0.55 }); };

// 風防: 映り込みの光の帯が前から後ろへゆっくり流れる
function canopyPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = 'varying vec3 vCP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCP = position;');
    sh.fragmentShader = 'uniform float uTime; varying vec3 vCP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float sw = fract(uTime * 0.35); float band = exp(-pow((vCP.x - mix(0.6, -0.35, sw)) * 9.0, 2.0)) * smoothstep(0.0, 0.06, vCP.y);
      totalEmissiveRadiance += vec3(0.7, 0.95, 1.0) * band * 1.4;`);
  };
  mat.customProgramCacheKey = () => 'vb-canopy';
  return mat;
}
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
    steel: patch(new THREE.MeshStandardMaterial({ color: 0xa8b4c2, metalness: 0.9, roughness: 0.24 }), { rimGain: 0.35, mech: true, glint: 1.0 }),
    darkSteel: patch(new THREE.MeshStandardMaterial({ color: 0x3a434e, metalness: 0.85, roughness: 0.36 }), { rimGain: 0.45, mech: true }),
    gunmetal: patch(new THREE.MeshStandardMaterial({ color: 0x5c6672, metalness: 0.88, roughness: 0.3 }), { rimGain: 0.45, mech: true }),
    hull: new THREE.MeshStandardMaterial({ color: 0x6e6c66, metalness: 0.7, roughness: 0.62, map: panel, roughnessMap: panel }),  // 腐食して煤けた船体
    gHull: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2), toneMapped: false }),  // 船体の灯火（ちらつく）
    chitin: patch(new THREE.MeshStandardMaterial({ color: 0x34404c, metalness: 0.5, roughness: 0.18 }), { rim: 0x8fd0ff, rimGain: 0.7, irid: true, glint: 1.1 }),
    bone: patch(new THREE.MeshStandardMaterial({ color: 0xcfc6b4, metalness: 0.15, roughness: 0.5 }), { rim: 0xffe8c8, rimGain: 0.25, glint: 0.4 }),
    flesh: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x4a1c2a, metalness: 0.08, roughness: 0.5, emissive: 0x12030a }), { vein: 0xff3a7a }),
    fleshBig: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x4a1c2a, metalness: 0.08, roughness: 0.48, emissive: 0x12030a }), { vein: 0xff3a7a, freq: 0.42, pulse: 0.08 }),
    fleshTealBig: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x163a3a, metalness: 0.1, roughness: 0.45, emissive: 0x021010 }), { vein: 0x40ffd0, freq: 0.5 }),
    trim: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fe3ff).multiplyScalar(1.6), toneMapped: false }),
    fleshTeal: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x163a3a, metalness: 0.1, roughness: 0.45, emissive: 0x021010 }), { vein: 0x40ffd0 }),
    fleshViolet: fleshPatch(new THREE.MeshStandardMaterial({ color: 0x2c1640, metalness: 0.2, roughness: 0.4, emissive: 0x080210 }), { vein: 0xc080ff }),
    // 黒曜石のような毒の結晶（暗い本体の奥で毒の色がくすぶる）
    crystal: new THREE.MeshStandardMaterial({ color: 0x0e1a16, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.88, emissive: 0x0b3a16, envMapIntensity: 0.9 }),
    crystalViolet: new THREE.MeshStandardMaterial({ color: 0x1a0e26, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.9, emissive: 0x2a0844, envMapIntensity: 0.9 }),
    crystalIrid: patch(new THREE.MeshStandardMaterial({ color: 0x241038, metalness: 0.5, roughness: 0.08, transparent: true, opacity: 0.92, emissive: 0x2a0844 }), { rim: 0xd0a0ff, rimGain: 0.6, irid: true, glint: 1.4 }),
    canopy: canopyPatch(new THREE.MeshStandardMaterial({ color: 0x0a2030, metalness: 0.9, roughness: 0.05, emissive: 0x0a4a6a })),
    gCyan: glow(0x4fe3ff), gMagenta: glow(0xff4fb4), gAmber: glow(0xffb347), gBio: glow(0x7dffb0), gRed: glow(0xff3048, 2.6), gWhite: glow(0xffffff, 1.6), gViolet: glow(0xc9a0ff),
    gEye: glow(0xff2a50, 3.2),
  };
  return lib;
}
export const colorOf = { C: 0x4fe3ff, M: 0xff4fb4, A: 0xffb347, S: 0x9fffef, B: 0x7dffb0, P: 0xffffff, w: 0xffe0c0, bio: 0x7dffb0, am: 0xffb347, big: 0xffffff };
