// Sky Climber VR — キャラクター（第 3 版・写実寄り）: 人体の比率と顔の造作を持つ骨格入りモデル（tools/build-characters.mjs で生成）、
// 手続きの材質（しわ・縫い目・毛の流れ・毛穴・焼き込みの陰）、眼球と表情の変形、ばねでつないだ動き。改善項目の一覧は docs/CHARACTER.md。
import * as THREE from 'three';
import { makeFabricNormal } from './textures.js';
import { makeRigged, aimBone, setWorldQuat, worldPos, Spring3, Spring1, loadModels, getModel } from './rig.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
export const MODEL_NAMES = ['climber', 'gloveL', 'gloveR', 'resident-oyaji', 'resident-obachan', 'bird'];
export const loadCharacterModels = () => loadCharacterModelsAndDetail();

function ellipsoid(rx, ry, rz, ws = 24, hs = 16) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
function lathe(len, r0, r1, seg = 20) {
  const out = []; for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; out.push(new THREE.Vector2(Math.sin(a) * r0, -Math.cos(a) * r0 * 0.6)); }
  for (let i = 1; i < 10; i++) { const t = i / 10; out.push(new THREE.Vector2((r0 + (r1 - r0) * t) * (1 + 0.05 * Math.sin(t * Math.PI)), t * len)); }
  for (let k = 4; k >= 0; k--) { const a = (k / 4) * Math.PI / 2; out.push(new THREE.Vector2(Math.sin(a) * r1, len + Math.cos(a) * r1 * 0.6)); }
  return new THREE.LatheGeometry(out, seg);
}
// 2 ボーン IK。中間関節（肘・膝）の位置を返す
export function solveTwoBone(a, b, root, target, pole) {
  const d = target.clone().sub(root); const len = d.length();
  const L = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, len));
  const dir = len > 1e-6 ? d.multiplyScalar(1 / len) : V(0, -1, 0);
  const cosA = (a * a + L * L - b * b) / (2 * a * L), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pv = pole.clone().sub(root); pv.sub(dir.clone().multiplyScalar(pv.dot(dir))); if (pv.lengthSq() < 1e-8) pv.set(0, 0, 1); pv.normalize();
  return { mid: root.clone().add(dir.clone().multiplyScalar(a * cosA)).add(pv.clone().multiplyScalar(a * sinA)), end: root.clone().add(dir.multiplyScalar(L)), bend: pv };
}

// ---- 材質（第 3 版・写実寄り） ----
// 細部の色と凹凸（しわ・縫い目・毛の流れ・毛穴）は、結合姿勢の座標（vBind）からシェーダーで作る。境目は fwidth で 1 画素ぶんぼかす。
// 陰（AO）はモデル生成時に距離場から焼き込んだ値（aAO）。肌は視線のふちに赤みの回り込み（皮下散乱の近似）を足す。
const lin = (h) => { const c = new THREE.Color(h).convertSRGBToLinear(); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };
const GLSL_LIB = `
float edge(float d){ float w = fwidth(d) * 1.2 + 1e-5; return 1.0 - smoothstep(-w, w, d); }
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ return vn(p) * 0.5 + vn(p * 2.03) * 0.25 + vn(p * 4.01) * 0.125; }
vec3 bumpN(vec3 n, vec3 vp, float h){ vec3 dpx = dFdx(vp), dpy = dFdy(vp); float hx = dFdx(h), hy = dFdy(h); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); vec3 g = sign(det) * (hx * r1 + hy * r2); return normalize(abs(det) * n - g); }
`;
// opts: { color: 色のコード, bump: 高さ bumpH(m) を決めるコード, rim: ふちの光 [色, 強さ, 鋭さ], uniforms, ao: AO の効き }
function withDetail(mat, key, opts = {}) {
  const uniforms = opts.uniforms || {};
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    const decl = 'varying vec3 vBind; varying float vAO;\n' + Object.entries(uniforms).map(([k, u]) => `uniform ${u.value.isVector3 ? 'vec3' : 'float'} ${k};`).join('\n');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAO; varying vec3 vBind; varying float vAO;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position; vAO = aAO;');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + decl + GLSL_LIB)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (opts.color || '') + `\n diffuseColor.rgb *= mix(1.0, vAO, ${(opts.ao ?? 0.8).toFixed(2)});`);
    if (opts.bump) f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ float bumpH = 0.0; ' + opts.bump + ' normal = bumpN(normal, -vViewPosition, bumpH); }');
    if (opts.rim) f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n{ float rimV = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), ${opts.rim[2].toFixed(1)}); totalEmissiveRadiance += diffuseColor.rgb * ${opts.rim[0]} * rimV * ${opts.rim[1].toFixed(3)} * vAO; }`);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'detail3-' + key;
  return mat;
}
let detailData = null;
const v3 = (a) => ({ value: new THREE.Vector3(...a) });
// 頭の基準座標 h（顔が -z、首の上端が原点）を作るコード
const HEADC = 'vec3 h = vBind - uHead; h.z *= -uFront;';
function skinMaterial(key, headPos, front, o = {}) {
  const LIP = lin(o.lip ?? 0xb36a5c), IN = lin(0x3a1512), RED = lin(0xd9705c), SH = lin(o.shadow ?? 0x7d6a66), SOCK = lin(0x8a4f44);
  return withDetail(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.18, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffb199), specularIntensity: 0.6 }), 'skin-' + key, {
    uniforms: { uHead: v3(headPos), uFront: { value: front } }, ao: 0.9,
    rim: ['vec3(1.0, 0.28, 0.18)', 0.28, 2.6],
    color: `{ ${HEADC}
      float tone = fbm3(vBind * 60.0); diffuseColor.rgb *= 0.94 + 0.12 * tone;                                   // 肌のむら
      float inHead = step(length(h - vec3(0.0, 0.08, 0.0)), 0.16); float face = step(h.z, -0.02) * inHead;
      float lips = (1.0 - smoothstep(0.75, 1.0, length(vec2(h.x / 0.0235, (h.y - 0.0378) / 0.0115)))) * step(h.z, -0.078) * face;
      diffuseColor.rgb = mix(diffuseColor.rgb, ${LIP}, lips * 0.62);
      float inside = step(-0.0865, h.z) * step(h.z, -0.05) * step(abs(h.x), 0.0225) * step(abs(h.y - 0.0378), 0.0075) * inHead;
      diffuseColor.rgb = mix(diffuseColor.rgb, ${IN}, inside);
      float red = 0.0; red += 0.5 * exp(-dot(h - vec3(0.0, 0.068, -0.108), h - vec3(0.0, 0.068, -0.108)) / 0.00035);  // 鼻先
      red += 0.42 * exp(-pow(length(vec3(abs(h.x) - 0.046, h.y - 0.074, h.z + 0.068)), 2.0) / 0.0007);               // ほお
      red += 0.45 * exp(-pow(length(vec3(abs(h.x) - 0.079, h.y - 0.085, h.z - 0.012)), 2.0) / 0.0006);               // 耳
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * ${RED} * 1.9, clamp(red, 0.0, 1.0) * inHead * ${(o.blush ?? 0.32).toFixed(2)});
      float sock = (1.0 - smoothstep(0.6, 1.05, length(vec2((abs(h.x) - 0.0318) / 0.0175, (h.y - 0.103) / 0.0095)))) * step(-0.1, h.z) * step(h.z, -0.06) * (1.0 - vAO * vAO) * inHead;
      diffuseColor.rgb = mix(diffuseColor.rgb, ${SOCK}, clamp(sock * 1.4, 0.0, 0.8));                               // まぶたの裏・目頭
      float beard = smoothstep(0.075, 0.05, h.y) * smoothstep(-0.03, -0.06, h.z) * smoothstep(-0.04, -0.01, h.y) * (1.0 - lips) * face;
      beard = max(beard, (1.0 - smoothstep(0.6, 1.0, length(vec2(h.x / 0.03, (h.y - 0.054) / 0.011)))) * step(h.z, -0.08) * inHead);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${SH}, beard * ${(o.beard ?? 0.16).toFixed(2)} * (0.6 + 0.8 * vn(vBind * 900.0)));  // ひげの剃りあと
    }`,
    bump: `{ ${HEADC} bumpH += (vn(vBind * 1400.0) - 0.5) * 0.00012;                                                // 毛穴
      bumpH -= step(length(h - vec3(0.0, 0.08, 0.0)), 0.16) * ${(o.age ?? 0).toFixed(2)} * 0.0009 * (smoothstep(0.35, 0.0, abs(fract(h.y * 95.0 + vn(vBind * 40.0) * 1.5) - 0.5)) * step(0.13, h.y) * step(h.z, -0.06)    // 額のしわ
        + smoothstep(0.004, 0.0, abs(length(vec2(abs(h.x) - 0.018, h.y - 0.05)) - 0.022)) * step(h.z, -0.07) * step(h.y, 0.066));                                          // ほうれい線
    }`,
  });
}
export function makeMaterials() {
  const weave = makeFabricNormal(256, 'weave'), knit = makeFabricNormal(256, 'knit');
  weave.repeat.set(6, 6); knit.repeat.set(9, 9);
  const P = (o) => new THREE.MeshPhysicalMaterial({ vertexColors: true, ...o });
  const d = detailData || { armL: [[-0.186, 1.425, 0], [-0.5, 0.99, 0]], armR: [[0.186, 1.425, 0], [0.5, 0.99, 0]], head: [0, 1.535, 0], kneeL: [-0.098, 0.508, -0.012], kneeR: [0.098, 0.508, -0.012], elbowL: [-0.35, 1.19, 0], elbowR: [0.35, 1.19, 0] };
  const W = lin(0xf2f0ea), CH = lin(0x2d3138), CH2 = lin(0x1f2227), YE = lin(0xf2b61c), OR = lin(0xe8622a), MET = lin(0xaab0b6), BK = lin(0x16171a), RD = lin(0xc8281f), GRY = lin(0x8c96a2), DG = lin(0x3a3d42), PINK = lin(0xf4c4d6);
  const ARM = `float armT = -1.0, armC = 0.0, armL = 1.0;
        for (int i = 0; i < 2; i++) { vec3 a = i == 0 ? uArmL0 : uArmR0, b = i == 0 ? uArmL1 : uArmR1; float sg = i == 0 ? -1.0 : 1.0; vec3 ax = normalize(b - a); float t = dot(vBind - a, ax), L = length(b - a);
          vec3 rdv = vBind - a - ax * t; if (t > 0.03 && t < L + 0.03 && length(rdv) < 0.085 && abs(vBind.x) > 0.17) { armT = t; armL = L; armC = dot(normalize(rdv), normalize(vec3(sg * cos(0.62), sin(0.62), 0.0))); } }`;
  const armU = { uArmL0: v3(d.armL[0]), uArmL1: v3(d.armL[1]), uArmR0: v3(d.armR[0]), uArmR1: v3(d.armR[1]) };
  return {
    skin: skinMaterial('climber', d.head, -1, { beard: 0.14 }),
    skinOyaji: skinMaterial('oyaji', [0, 0.5, 0], 1, { beard: 0.42, age: 1, blush: 0.85, lip: 0x9c5a4e }),
    skinObachan: skinMaterial('obachan', [0, 0.5, 0], 1, { beard: 0.0, age: 0.6, blush: 0.6, lip: 0xc2485a }),
    hair: withDetail(P({ roughness: 0.42, sheen: 0.5, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x8a6a55), clearcoat: 0.15, clearcoatRoughness: 0.5 }), 'hair', { ao: 0.75,
      color: `{ float st = vn(vec3(vBind.x * 420.0, vBind.y * 60.0 - vBind.z * 30.0, vBind.z * 60.0)); diffuseColor.rgb *= 0.75 + 0.6 * st; }`,
      bump: `bumpH += vn(vec3(vBind.x * 520.0, vBind.y * 70.0 - vBind.z * 35.0, vBind.z * 70.0)) * 0.0011 + vn(vBind * 90.0) * 0.0012;` }),
    band: withDetail(P({ roughness: 0.75, normalMap: knit, normalScale: new THREE.Vector2(0.5, 0.5), sheen: 0.3, sheenColor: new THREE.Color(0xffffff) }), 'band', { ao: 0.6 }),
    jacket: withDetail(P({ roughness: 0.62, normalMap: weave, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffd9d0), clearcoat: 0.08, clearcoatRoughness: 0.6 }), 'jacket', { uniforms: armU, rim: ['vec3(1.0,0.9,0.85)', 0.06, 3.0],
      color: `{ ${ARM}
        float torso = step(armT, -0.5);
        float yoke = torso * edge(1.432 - abs(vBind.x) * 0.06 - vBind.y);                                   // 肩のヨーク（白）
        diffuseColor.rgb = mix(diffuseColor.rgb, ${W}, yoke);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${CH}, torso * edge(abs(1.428 - abs(vBind.x) * 0.06 - vBind.y) - 0.0035));   // ヨークの切替の線
        float side = torso * edge(0.118 - abs(vBind.x)) * edge(vBind.y - 1.33) * edge(1.02 - vBind.y);     // 脇のパネル
        diffuseColor.rgb = mix(diffuseColor.rgb, ${CH}, side);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${CH}, edge(vBind.y - 1.022) * torso);                     // 裾
        if (vBind.y > 1.445 && abs(vBind.x) < 0.09) diffuseColor.rgb = mix(diffuseColor.rgb, ${CH}, edge(1.475 - vBind.y) * 0.0 + edge(abs(vBind.y - 1.5) - 0.006) * 0.0);
        if (armT > 0.0) {
          diffuseColor.rgb = mix(diffuseColor.rgb, ${W}, edge(0.955 - armC) * edge(armT - armL * 0.86));       // 袖の白い線
          diffuseColor.rgb = mix(diffuseColor.rgb, ${CH}, edge(armL * 0.86 - armT));                           // 袖口
          diffuseColor.rgb = mix(diffuseColor.rgb, ${YE}, edge(abs(armT - armL * 0.845) - 0.006));            // 反射テープ
          diffuseColor.rgb = mix(diffuseColor.rgb, ${CH}, edge(armC + 0.6) * edge(armT - armL * 0.86));     // 腕の内側
        }
        if (vBind.z < -0.04 && vBind.y > 1.022 && vBind.y < 1.5) {                                           // ファスナー
          diffuseColor.rgb = mix(diffuseColor.rgb, ${CH2}, edge(abs(vBind.x) - 0.008));
          diffuseColor.rgb = mix(diffuseColor.rgb, ${MET}, edge(abs(vBind.x) - 0.0026) * step(0.45, fract(vBind.y * 260.0)));
        }
        float logo = length(vec2(vBind.x - 0.078, vBind.y - 1.335)); if (vBind.z < -0.03) diffuseColor.rgb = mix(diffuseColor.rgb, ${YE}, edge(abs(logo - 0.016) - 0.0035) + edge(logo - 0.006)); // 胸のマーク
      }`,
      bump: `{ ${ARM}
        float n1 = fbm3(vBind * 28.0);
        bumpH += (fbm3(vBind * 55.0) - 0.5) * 0.0022;                                                         // 布のたるみ
        bumpH += sin(vBind.y * 150.0 + n1 * 9.0) * 0.0014 * smoothstep(1.2, 1.08, vBind.y) * step(armT, -0.5); // 腰まわりの横じわ
        if (armT > 0.0) { float el = armT - armL * 0.53; bumpH += sin(armT * 260.0 + n1 * 7.0 + armC * 2.0) * 0.0016 * exp(-el * el / 0.004);   // 肘のしわ
          bumpH += sin(armT * 180.0 + n1 * 6.0) * 0.001 * smoothstep(0.1, 0.0, armT); }                         // 脇・肩のしわ
        bumpH -= 0.0012 * edge(abs(abs(vBind.x) - 0.008) - 0.0012) * step(vBind.z, -0.04);                      // ファスナーの溝
      }` }),
    pants: withDetail(P({ roughness: 0.82, normalMap: weave, normalScale: new THREE.Vector2(0.5, 0.5), sheen: 0.15, sheenColor: new THREE.Color(0xa0a8b8) }), 'pants', { uniforms: { uKneeL: v3(d.kneeL), uKneeR: v3(d.kneeR) },
      color: `{ float kd = min(length((vBind - uKneeL) * vec3(1.0, 0.75, 1.0)), length((vBind - uKneeR) * vec3(1.0, 0.75, 1.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${CH2}, edge(kd - 0.075) * step(vBind.z, 0.012));               // 膝の補強
        diffuseColor.rgb = mix(diffuseColor.rgb, ${CH2}, edge(abs(length(vec2(abs(vBind.x) - 0.155, vBind.y - 0.985)) - 0.075) - 0.0018) * step(vBind.z, -0.02) * step(vBind.y, 0.96)); // ポケット口
        diffuseColor.rgb = mix(diffuseColor.rgb, ${RD}, edge(abs(abs(vBind.x) - 0.168 + (0.9 - vBind.y) * 0.075) - 0.0022) * step(abs(vBind.z), 0.03) * step(0.2, vBind.y) * step(vBind.y, 0.9) * 0.9); // 脇の細い線
        diffuseColor.rgb *= 0.9 + 0.2 * fbm3(vBind * 40.0); }`,
      bump: `{ float n1 = fbm3(vBind * 24.0); bumpH += (fbm3(vBind * 48.0) - 0.5) * 0.0024;
        float kd = min(abs(vBind.y - uKneeL.y), 9.0); bumpH += sin(vBind.y * 210.0 + n1 * 8.0) * 0.0016 * exp(-kd * kd / 0.006) * step(0.0, vBind.z + 0.02);     // 膝裏のしわ
        bumpH += sin(vBind.y * 240.0 + n1 * 9.0) * 0.0016 * smoothstep(0.22, 0.13, vBind.y);                       // 裾のたまり
        bumpH += sin((vBind.y + abs(vBind.x) * 0.5) * 170.0 + n1 * 7.0) * 0.0013 * smoothstep(0.8, 0.9, vBind.y) * step(vBind.z, 0.0); }` }),
    harness: withDetail(P({ roughness: 0.7, normalMap: knit, normalScale: new THREE.Vector2(0.8, 0.8) }), 'harness', {
      color: `{ float buckle = edge(abs(vBind.x) - 0.022) * edge(abs(vBind.y - 1.025) - 0.02) * step(vBind.z, -0.09);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${MET}, buckle);
        float st = edge(abs(abs(vBind.y - 1.025) - 0.019) - 0.0022) * step(buckle, 0.5) * step(0.5, fract(atan(vBind.z, vBind.x) * 38.0)); diffuseColor.rgb = mix(diffuseColor.rgb, ${YE}, st * step(dot(diffuseColor.rgb, vec3(1.0)), 0.3)); }` }),
    bag: withDetail(P({ roughness: 0.85, normalMap: weave, normalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.3, sheenColor: new THREE.Color(0xffffff) }), 'bag', { bump: 'bumpH += (fbm3(vBind * 70.0) - 0.5) * 0.002;' }),
    shoe: withDetail(P({ roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.5 }), 'shoe', {
      color: `{ float fx = abs(vBind.x) - 0.102;
        vec3 c = ${OR};
        c = mix(c, ${CH2}, edge(vBind.z + 0.118) * edge(vBind.y - 0.07));                                       // つま先のラバー
        c = mix(c, ${CH2}, edge(0.03 - vBind.z) * edge(vBind.y - 0.085));                                       // かかと
        c = mix(c, ${CH}, edge(abs(fx) - 0.017) * edge(0.052 - vBind.y) * step(-0.1, vBind.z) * step(vBind.z, -0.01));   // ベロ
        c = mix(c, ${W}, edge(abs(fx) - 0.02) * edge(0.056 - vBind.y) * step(-0.095, vBind.z) * step(vBind.z, -0.012) * step(0.55, fract(vBind.z * 62.0))); // 靴ひも
        c = mix(c, ${CH}, edge(0.1 - vBind.y));                                                                   // 履き口
        c = mix(c, ${W}, edge(vBind.y - 0.034));                                                                  // ミッドソール
        c = mix(c, ${BK}, edge(vBind.y - 0.019));                                                                 // アウトソール
        c = mix(c, ${YE}, edge(abs(vBind.y - 0.0265) - 0.0022) * step(0.0, vBind.z + 0.02));
        diffuseColor.rgb = c; }`,
      bump: `bumpH += (fbm3(vBind * 160.0) - 0.5) * 0.0006; bumpH -= 0.0012 * step(vBind.y, 0.019) * step(0.5, fract(vBind.z * 55.0 + abs(vBind.x) * 30.0));` }),
    glove: withDetail(P({ roughness: 0.6, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) }), 'glove', {
      color: `{ vec3 c = diffuseColor.rgb;
        float back = edge(-vBind.z + 0.003);                                                                      // 甲の側
        c = mix(${DG}, c, back);                                                                                  // 掌側は濃い合皮
        c = mix(c, ${YE}, back * edge(abs(vBind.x) - 0.03) * edge(0.022 - vBind.y) * edge(vBind.y - 0.082));     // 甲のパネル
        c = mix(c, ${BK}, back * edge(abs(vBind.y - 0.1) - 0.011) * edge(abs(vBind.x) - 0.041));                 // ナックルガード
        c = mix(c, ${BK}, edge(abs(abs(vBind.x) - 0.031) - 0.0012) * back * edge(0.022 - vBind.y) * edge(vBind.y - 0.082));
        c = mix(c, ${OR}, (1.0 - back) * edge(0.16 - vBind.y) * 0.0);
        diffuseColor.rgb = c; }`,
      bump: `bumpH += (vn(vBind * 700.0) - 0.5) * 0.00035 + (fbm3(vBind * 120.0) - 0.5) * 0.0008;
        bumpH += 0.0012 * edge(abs(vBind.y - 0.1) - 0.011) * step(0.003, vBind.z);
        bumpH -= 0.0006 * smoothstep(0.35, 0.5, abs(fract(vBind.y * 80.0) - 0.5)) * step(0.125, vBind.y) * step(vBind.z, -0.002);` }),
    strap: withDetail(P({ roughness: 0.8, normalMap: knit, normalScale: new THREE.Vector2(0.7, 0.7) }), 'strap', { color: `diffuseColor.rgb = mix(diffuseColor.rgb, ${YE}, edge(abs(vBind.x) - 0.012) * edge(abs(vBind.y + 0.012) - 0.007) * step(0.0, vBind.z));` }),
    clothTank: withDetail(P({ roughness: 0.85, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) }), 'tank', { bump: 'bumpH += sin(vBind.x * 520.0) * 0.0004 + (fbm3(vBind * 30.0) - 0.5) * 0.004;', color: 'diffuseColor.rgb *= 0.92 + 0.1 * fbm3(vBind * 25.0);' }),
    clothBlouse: withDetail(P({ roughness: 0.8, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) }), 'blouse', { bump: 'bumpH += (fbm3(vBind * 30.0) - 0.5) * 0.004;',
      color: `{ vec3 q = vBind * 22.0; vec3 cell = fract(q) - 0.5; float dot1 = edge(length(cell) - 0.2); diffuseColor.rgb = mix(diffuseColor.rgb, ${PINK}, dot1 * 0.8); }` }),
    apron: withDetail(P({ roughness: 0.85, normalMap: weave, normalScale: new THREE.Vector2(0.6, 0.6) }), 'apron', { bump: 'bumpH += (fbm3(vBind * 26.0) - 0.5) * 0.004 + sin(vBind.x * 90.0) * 0.0012 * smoothstep(0.1, 0.0, vBind.y);' }),
    body: withDetail(P({ roughness: 0.72, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) }), 'bird', { ao: 0.7,
      color: `{ float wing = step(0.085, abs(vBind.x));
        float top = wing * smoothstep(0.03, 0.045, vBind.y) + (1.0 - wing) * smoothstep(0.04, 0.075, vBind.y) * step(vBind.z, 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${GRY}, clamp(top, 0.0, 1.0) * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${BK}, edge(0.6 - abs(vBind.x)) * wing);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${W}, edge(abs(abs(vBind.x) - 0.7) - 0.012) * step(vBind.z, -0.06));
        diffuseColor.rgb *= 0.86 + 0.2 * vn(vec3(vBind.x * 60.0, vBind.y * 20.0, vBind.z * 400.0)); }`,
      bump: 'bumpH += vn(vec3(vBind.x * 70.0, 0.0, vBind.z * 500.0)) * 0.0009 * step(0.085, abs(vBind.x)) + (vn(vBind * 300.0) - 0.5) * 0.0005;' }),
    beak: withDetail(P({ roughness: 0.35, clearcoat: 0.5 }), 'beak', { color: `diffuseColor.rgb = mix(diffuseColor.rgb, ${RD}, edge(0.305 - vBind.z) * edge(vBind.y - 0.074) * step(0.2, vBind.z));` }),
    teeth: new THREE.MeshPhysicalMaterial({ color: 0xf1ece2, roughness: 0.25, clearcoat: 0.6 }),
    tongue: new THREE.MeshStandardMaterial({ color: 0xb4514d, roughness: 0.45 }),
    bandTail: new THREE.MeshStandardMaterial({ color: 0xf2b61c, roughness: 0.75, side: THREE.DoubleSide }),
    sleeve: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#c8281f'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#f2f0ea'; x.fillRect(2, 0, 7, 256); x.fillStyle = '#2d3138'; x.fillRect(28, 0, 12, 256); x.fillStyle = '#2d3138'; x.fillRect(0, 228, 64, 28); x.fillStyle = '#f2b61c'; x.fillRect(0, 222, 64, 6);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.62, normalMap: weave, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.25, sheenColor: new THREE.Color(0xffd9d0) }); })(),
    metal: new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.95, roughness: 0.22 }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.6 }),
    eyeTex: makeEyeTexture(0x4a3120), eyeTexGrey: makeEyeTexture(0x4d5a63), eyeTexBird: makeEyeTexture(0xd8c890, true),
  };
}
// 眼球のテクスチャ（極が瞳。白目・虹彩の放射状の筋・ふちの濃い輪・瞳孔）
function makeEyeTexture(irisHex, bird = false) {
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const ic = new THREE.Color(irisHex), irisA = bird ? 0.95 : 0.5, pupA = bird ? 0.5 : 0.2;
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const fib = Array.from({ length: W }, () => rnd());
  for (let y = 0; y < H; y++) { const th = (y / (H - 1)) * Math.PI; // 0 = 瞳の中心
    for (let u = 0; u < W; u++) { let r, g, b;
      if (th < pupA) { r = g = b = 0.02; }
      else if (th < irisA) { const t = (th - pupA) / (irisA - pupA); const f = 0.65 + 0.5 * (fib[u] * 0.6 + fib[(u * 3) % W] * 0.4); const ring = t > 0.86 ? 0.35 : 1; const inner = 1.15 - t * 0.35;
        r = ic.r * f * ring * inner + (1 - t) * 0.08; g = ic.g * f * ring * inner + (1 - t) * 0.05; b = ic.b * f * ring * inner; }
      else { const t = Math.min(1, (th - irisA) / 1.2); r = 0.95 - t * 0.12; g = 0.93 - t * 0.3; b = 0.9 - t * 0.3; if (fib[u] > 0.93 && th > irisA + 0.25) { r *= 1.0; g *= 0.72; b *= 0.72; } }
      const i = (y * W + u) * 4; d[i] = Math.pow(r, 1 / 2.2) * 255; d[i + 1] = Math.pow(g, 1 / 2.2) * 255; d[i + 2] = Math.pow(b, 1 / 2.2) * 255; d[i + 3] = 255; } }
  x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
// モデルの読み込み後に、細部の位置（腕の軸・頭・膝）をモデルの値に合わせる
export async function loadCharacterModelsAndDetail() { await loadModels(MODEL_NAMES); detailData = getModel('climber').json.detail; }

// ---- 手袋（指 3 節 × 5 本の骨）。全身と一人称（VR）で同じものを使う。指ごとに少しずつ違う速さ・深さで握る ----
export function makeGlove(side, M, scale = 1) {
  const r = makeRigged('glove' + side, { glove: M.glove, strap: M.strap });
  const g = new THREE.Group(); g.add(r.mesh); g.scale.setScalar(scale);
  const s = side === 'L' ? -1 : 1, B = r.bones;
  const fingers = ['index', 'middle', 'ring', 'pinky'].map((n, i) => ({ b: [B[n + '1'], B[n + '2'], B[n + '3']], sp: new Spring1(0.2), k: [0.92, 1.0, 1.04, 1.1][i], f: [7.5, 7, 6.5, 6][i] }));
  const thumb = [B.thumb1, B.thumb2, B.thumb3], tsp = new Spring1(0.2), spread = new Spring1(0);
  const api = {
    group: g, mesh: r.mesh, target: 0.2, spreadTarget: 0, point: 0,
    update(dt) {
      const sp = spread.step(this.spreadTarget, dt, 5, 0.8);
      fingers.forEach((f, i) => { const tgt = this.target * f.k * (i === 0 ? 1 - this.point * 0.6 : 1); const c = f.sp.step(tgt, dt, f.f, 0.55);
        const fan = (i - 1.5) * (0.06 + sp * 0.13) * (1 - Math.min(1, c));
        f.b[0].rotation.set(-c * 1.15 - 0.1, 0, -fan * s); f.b[1].rotation.set(-c * 1.45 - 0.12, 0, 0); f.b[2].rotation.set(-c * 0.9 - 0.08, 0, 0); });
      const c = tsp.step(this.target, dt, 8, 0.6);
      thumb[0].rotation.set(-0.1 - c * 0.5, c * 0.25 * s, -c * 0.55 * s + 0.15 * s); thumb[1].rotation.set(-c * 0.5, 0, -c * 0.25 * s); thumb[2].rotation.set(-c * 0.55, 0, 0);
    },
    set(c, sp = 0, point = 0) { this.target = c; this.spreadTarget = sp; this.point = point; },
  };
  api.update(1);
  return api;
}

// ---- 顔の付属: 眼球（虹彩のテクスチャ・角膜のつや・視線で回る）と、口の中（歯・舌） ----
function makeFace(M, headBone, face, opts = {}) {
  const fz = face.front ?? -1, R = (face.eyeRadius || 0.0128), eyes = [];
  for (const [k, s] of [['eyeL', -1], ['eyeR', 1]]) {
    const p = face[k]; const piv = new THREE.Group(); piv.position.set(p[0], p[1], p[2]); headBone.add(piv);
    const geo = new THREE.SphereGeometry(R, 32, 24); geo.rotateX(fz < 0 ? -Math.PI / 2 : Math.PI / 2); // 極（瞳）を顔の前へ
    const ball = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: opts.tex || M.eyeTex, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }));
    piv.add(ball); eyes.push({ piv, ball, s, yaw: new Spring1(0), pitch: new Spring1(0) });
  }
  let teethU = null, teethL = null;
  if (face.mouthIn && !opts.noTeeth) {
    const m = face.mouthIn; const mk = (yOff, mat, h) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 20, 1, true, fz < 0 ? Math.PI * 0.62 : -Math.PI * 0.38, Math.PI * 0.76), mat); g.position.set(m[0], m[1] + yOff, m[2] - fz * 0.012); g.material.side = THREE.DoubleSide; headBone.add(g); return g; };
    teethU = mk(0.0045, M.teeth, 0.0085); teethL = mk(-0.0045, M.teeth, 0.0075);
    const tongue = new THREE.Mesh(ellipsoid(0.013, 0.005, 0.014), M.tongue); tongue.position.set(0, -0.004, -fz * 0.004); teethL.add(tongue);
  }
  return { eyes, teethU, teethL, fz,
    // 視線: 頭の座標での向き（dirLocal）へ、眼球を上下左右の限度つきで回す
    look(dirLocal, dt) { const yaw = Math.max(-0.6, Math.min(0.6, Math.atan2(dirLocal.x, fz * dirLocal.z) * (fz < 0 ? -1 : 1))), pitch = Math.max(-0.45, Math.min(0.45, Math.asin(Math.max(-1, Math.min(1, dirLocal.y)))));
      for (const e of eyes) { e.piv.rotation.set(-e.pitch.step(pitch, dt, 9, 0.9) * (fz < 0 ? -1 : 1) * -1, e.yaw.step(yaw, dt, 9, 0.9), 0, 'YXZ'); } },
    jaw(v) { if (teethL) { teethL.position.y = face.mouthIn[1] - 0.0045 - v * 0.013; teethL.position.z = face.mouthIn[2] - fz * 0.012 + fz * v * 0.003; } } };
}
// 表情（変形ターゲットの重みをばねで動かす）
class Expression {
  constructor(rig) { this.rig = rig; this.sp = {}; for (const n of ['blinkL', 'blinkR', 'jaw', 'smile', 'browUp', 'browDown']) this.sp[n] = new Spring1(0); this.blinkT = 1 + Math.random() * 2; this.talk = 0; this.t = 0; }
  say(dur) { this.talk = Math.max(this.talk, dur); }
  update(dt, target, face) {
    this.t += dt; this.blinkT -= dt; const closing = this.blinkT < 0.11; if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3.5;
    let jaw = target.jaw || 0; if (this.talk > 0) { this.talk -= dt; jaw = Math.max(jaw, 0.25 + 0.55 * Math.abs(Math.sin(this.t * 17))); }
    const set = (n, v, f, z) => this.rig.setMorph(n, Math.max(-0.2, this.sp[n].step(v, dt, f, z)));
    const bl = Math.max(closing ? 1 : 0, target.blink || 0);
    set('blinkL', bl, closing ? 16 : 8, 1); set('blinkR', bl, closing ? 16 : 8, 1);
    set('jaw', jaw, 9, 0.6); set('smile', target.smile || 0, 5, 0.7); set('browUp', target.browUp || 0, 6, 0.55); set('browDown', target.browDown || 0, 6, 0.6);
    face.jaw(Math.max(0, this.sp.jaw.x));
  }
}
const EXPR = {
  calm: { smile: 0.3, blink: 0.2 }, strain: { browDown: 1, jaw: 0.14, blink: 0.25 }, reach: { browDown: 0.45, jaw: 0.2, blink: 0.15 }, surprise: { browUp: 1, jaw: 0.7 }, fall: { browUp: 1, jaw: 1 }, joy: { smile: 1, jaw: 0.42, browUp: 0.35, blink: 0.3 },
  angry: { browDown: 1, jaw: 0.6 }, shout: { browDown: 0.8, jaw: 0.9 }, idle: { smile: 0.1, blink: 0.2 },
};

// ---- 主人公「ソラ」 ----
export class ClimberModel {
  constructor(M) {
    this.M = M;
    const r = this.r = makeRigged('climber', { skin: M.skin, hair: M.hair, band: M.band, jacket: M.jacket, harness: M.harness, pants: M.pants, shoe: M.shoe, bag: M.bag });
    this.group = new THREE.Group(); this.group.name = 'climber'; this.group.add(r.mesh);
    const B = this.B = r.bones, P = r.bindPos, face = r.json.face;
    this.bind = {};
    for (const S of ['L', 'R']) {
      this.bind['upper' + S] = P['fore' + S].clone().sub(P['upper' + S]); this.bind['fore' + S] = P['hand' + S].clone().sub(P['fore' + S]);
      this.bind['thigh' + S] = P['shin' + S].clone().sub(P['thigh' + S]); this.bind['shin' + S] = P['foot' + S].clone().sub(P['shin' + S]);
    }
    this.lenArm = [P.foreL.distanceTo(P.upperL), P.handL.distanceTo(P.foreL)];
    this.lenLeg = [P.shinL.distanceTo(P.thighL), P.footL.distanceTo(P.shinL)];
    this.shoulderOff = P.upperR.y - P.hips.y;
    this.gloves = {};
    for (const S of ['L', 'R']) { const gl = makeGlove(S, M, 1.06); B['hand' + S].add(gl.group); this.gloves[S] = gl; }
    this.face = makeFace(M, B.head, face);
    this.expr = new Expression(r);
    // はちまきの端（2 節の布）
    this.tails = [];
    for (const s of [-1, 1]) {
      const t = new THREE.Group(); const p = face.bandTail; t.position.set(p[0] + s * 0.008, p[1], p[2]);
      const seg1 = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.075, 1, 4), M.bandTail); seg1.position.y = -0.0375; t.add(seg1);
      const j = new THREE.Group(); j.position.y = -0.075; t.add(j);
      const seg2 = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.075, 1, 4), M.bandTail); seg2.position.y = -0.0375; j.add(seg2);
      B.head.add(t); this.tails.push({ t, j, s, a: new Spring1(0.5), b: new Spring1(0.3) });
    }
    // カラビナ（ギアループに下がって揺れる）
    this.biners = [];
    for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * 0.137, 0.01, 0.03); const m = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 8, 20), M.metal); m.scale.set(0.62, 1, 1); m.position.y = -0.03; m.castShadow = true; piv.add(m); B.hips.add(piv); this.biners.push({ piv, s, a: new Spring1(0), b: new Spring1(0) }); }
    this.sp = {
      hips: new Spring3(P.hips), look: new Spring3(V(0, 1.6, -1)), roll: new Spring1(0), twist: new Spring1(0), lean: new Spring1(0.2),
      wrist: { L: new Spring3(P.handL), R: new Spring3(P.handR) }, dip: new Spring1(0), flinch: new Spring3(V()), headTilt: new Spring1(0), bag: new Spring3(V()), shrug: new Spring1(0),
    };
    this.feet = { L: { pos: null, from: null, target: null, t: 1 }, R: { pos: null, from: null, target: null, t: 1 } };
    this.t = 0; this.saccade = V(); this.saccT = 1; this.first = true; this.oneHandT = 0; this.prevHip = P.hips.clone(); this.idleT = 0; this.idleLook = null;
  }
  impulse(kind, side) {
    const sg = side === 'L' ? -1 : 1;
    if (kind === 'reach') { this.sp.dip.v -= 0.9; }
    if (kind === 'grab') { this.sp.dip.v += 0.6; this.sp.roll.v += sg * 0.8; if (this.gloves[side]) this.gloves[side].target = 1.2; }
    if (kind === 'hit') { this.sp.flinch.v.add(V(sg * 0.6, 0.4, 1.2)); this.sp.headTilt.v += sg * 4; this.expr.say(0.3); }
  }
  say(dur = 0.5) { this.expr.say(dur); } // 掛け声に合わせて口を動かす
  update(dt, st) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const B = this.B, sp = this.sp, bx = st.body.x, by = st.body.y, z0 = 0.34;
    const shoulderC = V(bx, by, z0);
    const mode = st.mode || 'climb';
    const L = st.hands.L, R = st.hands.R;
    const held = (L.held ? 1 : 0) + (R.held ? 1 : 0);
    // 片手が続くと疲れて震える・肩がすくむ
    this.oneHandT = held === 1 && mode === 'climb' ? this.oneHandT + dt : Math.max(0, this.oneHandT - dt * 3);
    const tremor = Math.min(1, this.oneHandT / 2.5), shake = Math.sin(this.t * 41) * 0.004 * tremor;
    const rollT = Math.max(-0.38, Math.min(0.38, -(R.y - L.y) * 0.4)) + (mode === 'fall' ? Math.sin(this.t * 9) * 0.3 : 0);
    const twistT = Math.max(-0.35, Math.min(0.35, (R.reach ? 0.24 : 0) - (L.reach ? 0.24 : 0)));
    const roll = sp.roll.step(rollT, dt, 2.2, 0.55), twist = sp.twist.step(twistT, dt, 2.5, 0.7);
    const lean = sp.lean.step(mode === 'fall' ? -0.5 : mode === 'joy' ? -0.05 : 0.16, dt, 2, 0.8);
    const dip = sp.dip.step(0, dt, 3.5, 0.45);
    const breath = Math.sin(this.t * 2 * Math.PI * (0.27 + tremor * 0.25));
    const fl = sp.flinch.step(V(), dt, 3, 0.5);
    const shrug = sp.shrug.step(tremor * 0.6 + (mode === 'fall' ? 1 : 0), dt, 3, 0.7);
    // 腰: 肩の下にぶら下がる振り子
    const hipT = shoulderC.clone().add(V(shake, -this.shoulderOff + dip * 0.04, 0.05)).add(fl.clone().multiplyScalar(0.08));
    if (mode === 'joy') hipT.y = Math.max(hipT.y, (st.floorY ?? -99) + 0.95 + Math.abs(Math.sin(this.t * 6)) * 0.1);
    if (this.first) { sp.hips.snap(hipT); this.prevHip.copy(hipT); this.first = false; }
    const hip = sp.hips.step(hipT, dt, held === 1 ? 1.4 : 2.6, held === 1 ? 0.35 : 0.7);
    const up = shoulderC.clone().sub(hip).normalize();
    const torsoQ = new THREE.Quaternion().setFromUnitVectors(UP, up).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lean + breath * 0.012 + fl.z * 0.3, twist + fl.x * 0.2, roll * 0.5, 'YXZ')));
    B.hips.position.copy(hip);
    const pelvisQ = new THREE.Quaternion().setFromUnitVectors(UP, up).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 0.4, -twist * 0.5, -roll * 0.2, 'YXZ')));
    setWorldQuat(B.hips, pelvisQ); setWorldQuat(B.spine, pelvisQ.clone().slerp(torsoQ, 0.5)); setWorldQuat(B.chest, torsoQ);
    B.chest.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.02);                                         // 呼吸で胸がふくらむ
    for (const S of ['L', 'R']) { const h = st.hands[S], lift = Math.max(0, Math.min(1, (h.y - by + 0.1) / 0.6)); setWorldQuat(B['clav' + S], torsoQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (S === 'L' ? -1 : 1) * (lift * 0.3 + shrug * 0.18))))); }
    // チョークバッグとカラビナ（腰の加速度で揺れる）
    const hv = hip.clone().sub(this.prevHip).multiplyScalar(1 / Math.max(dt, 1e-3)); this.prevHip.copy(hip);
    const bg = sp.bag.step(V(-hv.y * 0.12, 0, hv.x * 0.25), dt, 2.2, 0.25); B.bag.rotation.set(Math.max(-0.6, Math.min(0.6, bg.x)), 0, Math.max(-0.6, Math.min(0.6, bg.z)));
    for (const bn of this.biners) bn.piv.rotation.set(bn.a.step(-hv.y * 0.2, dt, 2.6, 0.15), 0, bn.b.step(hv.x * 0.4 + bn.s * 0.15, dt, 2.9, 0.15));
    // 首と頭・視線（止まっているときは時々あたりを見回す／下を見る）
    this.saccT -= dt; if (this.saccT < 0) { this.saccT = 0.4 + Math.random() * 1.2; this.saccade.set((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.09, 0); }
    let lookT = st.look || V(bx, by + 1, -0.6);
    if ((st.idle || 0) > 3 && mode === 'climb') { this.idleT -= dt; if (this.idleT < 0) { this.idleT = 1.5 + Math.random() * 2; const k = Math.random(); this.idleLook = k < 0.35 ? V(bx + 0.5, by - 6, 2) : k < 0.6 ? V(bx - 3, by + 0.5, 1.5) : k < 0.8 ? V(bx + 3, by + 1, 1.5) : null; } if (this.idleLook) lookT = this.idleLook; }
    const look = sp.look.step(lookT.clone().add(this.saccade), dt, 3.2, 0.85);
    const headP = worldPos(B.head);
    const fwd = look.clone().sub(headP).normalize();
    let headQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(headP, headP.clone().add(fwd), up));
    const tilt = sp.headTilt.step(0, dt, 3, 0.5);
    headQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt * 0.1 + shake * 2)));
    const ang = torsoQ.angleTo(headQ); if (ang > 1.15) headQ = torsoQ.clone().slerp(headQ, 1.15 / ang);
    setWorldQuat(B.neck, torsoQ.clone().slerp(headQ, 0.4)); setWorldQuat(B.head, headQ);
    // 眼球は頭より先に、目標（視線の跳びを含む）へ向く
    const eyeDir = lookT.clone().add(this.saccade).sub(headP).normalize().applyQuaternion(headQ.clone().invert());
    this.face.look(eyeDir, dt);
    // 腕
    for (const S of ['L', 'R']) {
      const sg = S === 'L' ? -1 : 1, h = st.hands[S];
      const sh = worldPos(B['upper' + S]);
      let target = V(h.x, h.y - (h.held ? 0.092 : 0.04), (h.z ?? 0.08) + 0.045);
      if (h.held && held === 1) target.x += shake * 1.5;
      if (mode === 'fall') target = sh.clone().add(V(sg * 0.35, 0.3 + Math.sin(this.t * 13 + sg) * 0.15, 0.25));
      if (mode === 'joy') target = sh.clone().add(V(sg * (0.18 + (S === 'R' ? 0.06 : 0)), S === 'R' ? 0.52 + Math.sin(this.t * 9) * 0.05 : 0.3, 0.05));
      const w = sp.wrist[S].step(target, dt, h.held ? 14 : 7, h.held ? 0.9 : 0.75);
      const pole = sh.clone().add(V(sg * 0.5, -0.6, 0.45));
      const ik = solveTwoBone(this.lenArm[0], this.lenArm[1], sh, w, pole);
      const ref0 = V(0, 0, 1);
      aimBone(B['upper' + S], this.bind['upper' + S], ref0, ik.mid.clone().sub(sh), ik.bend);
      aimBone(B['fore' + S], this.bind['fore' + S], ref0, ik.end.clone().sub(ik.mid), ik.bend);
      const fdir = ik.end.clone().sub(ik.mid).normalize();
      const fingersUp = h.held ? V(sg * 0.1, 1, -0.18).normalize() : fdir.clone().add(V(0, 0.2, -0.3)).normalize();
      const x = new THREE.Vector3().crossVectors(fingersUp, V(0, 0, 1)).normalize(), z = new THREE.Vector3().crossVectors(x, fingersUp).normalize();
      setWorldQuat(B['hand' + S], new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, fingersUp, z)));
      const gl = this.gloves[S];
      if (gl.target > 1) gl.target = Math.max(h.curl ?? 0.9, gl.target - dt * 2);
      else gl.set(mode === 'fall' ? 0.1 + Math.abs(Math.sin(this.t * 12 + sg)) * 0.3 : mode === 'joy' ? (S === 'R' ? 1 : 0.4) : h.curl ?? (h.held ? 0.95 : 0.2), h.held ? 0 : 0.6, h.reach ? 0.4 : 0);
      gl.update(dt);
    }
    // 脚
    for (const S of ['L', 'R']) {
      const sg = S === 'L' ? -1 : 1, f = this.feet[S];
      const thigh = worldPos(B['thigh' + S]);
      let tgt = st.feet && st.feet[S] ? V(st.feet[S].x, st.feet[S].y + 0.088, 0.13) : V(thigh.x + sg * 0.1, thigh.y - 0.76, 0.2 + Math.sin(this.t * 2 + sg) * 0.03);
      if (mode === 'fall') tgt = thigh.clone().add(V(sg * 0.25, -0.55 + Math.sin(this.t * 14 + sg * 2) * 0.15, 0.4));
      if (mode === 'joy') tgt = V(thigh.x + sg * 0.11, Math.max(thigh.y - 0.84, (st.floorY ?? -9) + 0.088), 0.2);
      if (!f.pos) { f.pos = tgt.clone(); f.from = tgt.clone(); f.target = tgt.clone(); }
      if (f.target.distanceTo(tgt) > 0.06) { f.from = f.pos.clone(); f.target = tgt.clone(); f.t = 0; } else f.target.lerp(tgt, 0.2);
      f.t = Math.min(1, f.t + dt * 4.5);
      const e = f.t * f.t * (3 - 2 * f.t);
      f.pos.lerpVectors(f.from, f.target, e); f.pos.z += Math.sin(e * Math.PI) * 0.12; f.pos.y += Math.sin(e * Math.PI) * 0.05;
      const pole = thigh.clone().add(V(sg * 0.3, 0, -0.7));
      const ik = solveTwoBone(this.lenLeg[0], this.lenLeg[1], thigh, f.pos, pole);
      const ref0 = V(0, 0, -1);
      aimBone(B['thigh' + S], this.bind['thigh' + S], ref0, ik.mid.clone().sub(thigh), ik.bend);
      aimBone(B['shin' + S], this.bind['shin' + S], ref0, ik.end.clone().sub(ik.mid), ik.bend);
      const onWall = !!(st.feet && st.feet[S] && !st.feet[S].ground);
      const toeTilt = mode === 'fall' ? 0.6 : (f.t < 1 ? -0.5 * Math.sin(e * Math.PI) : onWall ? 0.25 : -0.02);
      setWorldQuat(B['foot' + S], new THREE.Quaternion().setFromEuler(new THREE.Euler(toeTilt, -twist * 0.3 - sg * 0.12, 0)));
      B['toe' + S].rotation.set(onWall && f.t >= 1 ? -0.45 : 0, 0, 0);                                    // つま先で立つと指の付け根が曲がる
    }
    // 表情
    const ex = { ...(EXPR[st.expr] || EXPR.calm) }; if (tremor > 0.5 && st.expr === 'strain') ex.jaw = 0.22;
    this.expr.update(dt, ex, this.face);
    for (const tl of this.tails) {
      const a = tl.a.step(0.7 + Math.sin(this.t * 6.5 + tl.s) * 0.22 * (st.wind || 1) + (mode === 'fall' ? -1.6 : 0), dt, 3, 0.4);
      const b2 = tl.b.step(0.35 + Math.sin(this.t * 7.3 + tl.s * 2) * 0.3 * (st.wind || 1), dt, 4, 0.4);
      tl.t.rotation.set(a, 0, tl.s * 0.3); tl.j.rotation.x = b2;
    }
  }
}

// ---- 一人称の手（VR）: 主人公と同じ手袋（骨入り）と、同じ赤い袖 ----
export class FirstPersonHands {
  constructor(M) {
    this.group = new THREE.Group(); this.hands = {};
    for (const s of ['L', 'R']) {
      const g = new THREE.Group();
      const glove = makeGlove(s, M, 1.0);
      const fore = new THREE.Mesh(lathe(0.24, 0.043, 0.034, 28), M.sleeve); fore.castShadow = true;
      g.add(glove.group, fore); this.group.add(g);
      this.hands[s] = { g, glove, hand: { group: glove.group }, fore, pos: new Spring3(), q: new THREE.Quaternion(), first: true };
    }
  }
  set(s, pos, quat, curl, heldAt, dt = 1 / 72) {
    const h = this.hands[s], gg = h.glove.group;
    const p = heldAt || pos;
    if (h.first || !heldAt) { h.pos.snap(p); h.first = false; } else h.pos.step(p, dt, 22, 0.9);
    gg.position.copy(h.pos.x);
    let q;
    if (heldAt) { const sg = s === 'L' ? -1 : 1; q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0), V(sg * 0.1, 1, 0).normalize(), V(0, 0, 1))); }
    else q = quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.25, 0, 0)));
    h.q.slerp(q, heldAt ? 0.35 : 1); gg.quaternion.copy(h.q);
    h.glove.set(curl, curl < 0.3 ? 0.4 : 0); h.glove.update(dt);
    const back = V(0, -1, 0).applyQuaternion(gg.quaternion);
    const elbow = gg.position.clone().add(back.clone().multiplyScalar(0.262));
    const wristIn = gg.position.clone().add(V(0, -0.022, 0).applyQuaternion(gg.quaternion));
    h.fore.position.copy(elbow); h.fore.quaternion.setFromUnitVectors(UP, wristIn.clone().sub(elbow).normalize());
  }
}

// ---- 窓の住人: 'oyaji'（はげ頭・口ひげ・肌着）/ 'obachan'（パーマ・めがね・割烹着）。前は +z（窓の外） ----
export class ResidentModel {
  constructor(M, kind = 'oyaji') {
    this.kind = kind; const oy = kind === 'oyaji';
    const r = this.r = makeRigged('resident-' + kind, { skin: oy ? M.skinOyaji : M.skinObachan, hair: M.hair, cloth: oy ? M.clothTank : M.clothBlouse, band: M.apron });
    this.group = new THREE.Group(); this.group.name = 'resident'; this.group.add(r.mesh);
    const B = this.B = r.bones;
    this.face = makeFace(M, B.head, r.json.face, { tex: oy ? M.eyeTex : M.eyeTexGrey });
    this.expr = new Expression(r);
    if (!oy) { const gm = new THREE.MeshStandardMaterial({ color: 0x7a4a22, metalness: 0.7, roughness: 0.3 }); const f = r.json.face;
      for (const k of ['eyeL', 'eyeR']) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.002, 8, 28), gm); ring.position.set(f[k][0], f[k][1], f[k][2] + 0.017); ring.scale.y = 0.82; B.head.add(ring); }
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.02, 6), gm); br.rotation.z = Math.PI / 2; br.position.set(0, f.eyeL[1] + 0.004, f.eyeL[2] + 0.022); B.head.add(br); }
    this.sp = { chest: new Spring1(0), head: new Spring1(0), armL: new Spring3(V(-0.15, 0, 0)), armR: new Spring3(V(-0.15, 0, 0)), elL: new Spring1(-0.2), elR: new Spring1(-0.2) };
    this.t = Math.random() * 10;
  }
  update(dt, mode, k = 0) {
    dt = Math.min(dt, 0.05); this.t += dt;
    const B = this.B, sp = this.sp, shake = Math.sin(this.t * 17);
    let chest = 0, head = 0, arm = V(-0.15, 0, 0.1), el = -0.25, ex = EXPR.idle;
    if (mode === 'close') { chest = 0.05; head = 0.15; arm = V(-2.7 + k * 1.3, 0, 0.15); el = -0.5; ex = EXPR.angry; }
    else if (mode === 'lean') { chest = 0.45; head = 0.3 + shake * 0.03; arm = V(-2.5, 0, 0.25); el = -0.7; ex = EXPR.shout; if (Math.random() < dt * 2) this.expr.say(0.4); }
    else if (mode === 'throw') { chest = 0.55; head = 0.25; arm = V(-1.0, 0, 0.2); el = -0.1; ex = EXPR.shout; }
    else if (mode === 'angry') { chest = 0.15; head = 0.1; arm = V(-2.4 + shake * 0.2, 0, 0.3); el = -1.3; ex = EXPR.angry; }
    else { head = Math.sin(this.t * 1.3) * 0.12; }
    const c = sp.chest.step(chest, dt, 3, 0.6), hd = sp.head.step(head, dt, 4, 0.5);
    B.chest.rotation.set(c + Math.sin(this.t * 1.7) * 0.012, 0, 0); B.head.rotation.set(hd, Math.sin(this.t * 1.7) * 0.2 * (mode === 'idle' ? 1 : 0.3), 0);
    for (const [S, sg] of [['L', -1], ['R', 1]]) {
      const a = sp['arm' + S].step(V(arm.x, arm.y, arm.z * -sg), dt, 4, 0.55);
      B['upper' + S].rotation.set(a.x, 0, a.z); B['fore' + S].rotation.x = sp['el' + S].step(el, dt, 5, 0.6);
    }
    this.expr.update(dt, ex, this.face);
    this.face.look(V(Math.sin(this.t * 0.9) * 0.15, mode === 'idle' ? 0 : -0.45, 1).normalize(), dt); // 下の主人公をにらむ
  }
}

// ---- 鳥（カモメ）: 翼は 3 節＋風切羽。羽ばたきは付け根→先へ位相が遅れ、打ち下ろしは速く・打ち上げは翼を折る ----
export class BirdModel {
  constructor(M) {
    const r = this.r = makeRigged('bird', { body: M.body, beak: M.beak });
    this.group = new THREE.Group(); this.group.name = 'bird'; this.group.add(r.mesh);
    this.B = r.bones;
    this.face = makeFace(M, r.bones.head, { ...r.json.face, eyeL: [-0.037, 0.012, 0.03], eyeR: [0.037, 0.012, 0.03] }, { tex: M.eyeTexBird, noTeeth: true });
    for (const e of this.face.eyes) e.piv.rotation.y = e.s * 1.25;
    this.t = Math.random() * 10; this.glide = new Spring1(0);
  }
  update(dt, speed = 1) {
    dt = Math.min(dt, 0.05); this.t += dt * speed;
    const gl = this.glide.step(((this.t % 5) > 3.6) ? 1 : 0, dt, 2, 1);
    const ph = this.t * 9.5, w = Math.sin(ph), down = Math.cos(ph) < 0 ? 1 : 0;   // 打ち下ろし中か
    const a1 = (w * 0.75 + 0.1) * (1 - gl) + gl * 0.1, a2 = (Math.sin(ph - 0.9) * 0.6 - (1 - down) * 0.35) * (1 - gl) - gl * 0.06, a3 = (Math.sin(ph - 1.6) * 0.5 - (1 - down) * 0.3) * (1 - gl) - gl * 0.05;
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      this.B['wing1' + S].rotation.set(0, (1 - down) * 0.15 * s * (1 - gl), s * a1); this.B['wing2' + S].rotation.set(0, (1 - down) * 0.12 * s * (1 - gl), s * a2); this.B['wing3' + S].rotation.set(0, (1 - down) * 0.15 * s * (1 - gl), s * a3);
    }
    this.B.tail.rotation.x = Math.sin(ph + 0.5) * 0.1 + gl * 0.1;
    this.B.neck.rotation.x = -Math.cos(ph) * 0.05 * (1 - gl); this.B.head.rotation.set(Math.sin(this.t * 3) * 0.06 + Math.cos(ph) * 0.05 * (1 - gl), Math.sin(this.t * 1.7) * 0.2, 0);
    this.B.root.position.y = -Math.cos(ph) * 0.035 * (1 - gl);
  }
}

// ---- ヘリコプターとパイロット（機体は少し揺れ、パイロットは手を振る） ----
export class HelicopterModel {
  constructor(M) {
    const g = this.group = new THREE.Group(); g.name = 'heli';
    const body = this.body = new THREE.Group(); g.add(body);
    const bodyM = new THREE.MeshPhysicalMaterial({ color: 0xf2c230, metalness: 0.3, roughness: 0.3, clearcoat: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9cc8e6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.4 });
    const hull = new THREE.Mesh(ellipsoid(0.78, 0.72, 1.25, 40, 28), bodyM); hull.position.z = -0.25; hull.castShadow = true; body.add(hull);
    const bubble = new THREE.Mesh(ellipsoid(0.72, 0.64, 0.78, 32, 20), glass); bubble.position.set(0, 0.1, 0.5); body.add(bubble);
    const boom = new THREE.Mesh(lathe(2.6, 0.22, 0.08, 24), bodyM); boom.rotation.x = -Math.PI / 2; boom.position.set(0, 0.2, -1.0); body.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.4), bodyM); fin.position.set(0, 0.5, -3.5); body.add(fin);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.08), dark); this.tailRotor.position.set(0.1, 0.45, -3.5); body.add(this.tailRotor);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 12), dark); mast.position.set(0, 0.85, 0); body.add(mast);
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.05, 0); body.add(this.rotor);
    for (let i = 0; i < 2; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.03, 0.22), dark); bl.rotation.y = i * Math.PI / 2; this.rotor.add(bl); }
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 12), dark); sk.rotation.x = Math.PI / 2; sk.position.set(s * 0.7, -0.95, 0); body.add(sk);
      for (const z of [-0.6, 0.6]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), dark); st.position.set(s * 0.62, -0.78, z); st.rotation.z = s * 0.4; body.add(st); } }
    { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.735, 0.735, 0.12, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0xc8281f, roughness: 0.4 })); band.rotation.x = Math.PI / 2; band.scale.y = 1; band.position.set(0, 0, -0.5); body.add(band); }
    const pilot = new THREE.Group(); pilot.position.set(0.25, 0.05, 0.75); body.add(pilot);
    pilot.add(new THREE.Mesh(ellipsoid(0.17, 0.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 0.8 })));
    const ph = new THREE.Mesh(ellipsoid(0.11, 0.12, 0.11), new THREE.MeshStandardMaterial({ color: 0xf0bd96, roughness: 0.5 })); ph.position.y = 0.3; pilot.add(ph);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 })); helm.position.y = 0.32; pilot.add(helm);
    const gog = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 8, 18), dark); gog.position.set(0, 0.35, 0.1); pilot.add(gog);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 18, Math.PI), M.mouth); smile.rotation.z = Math.PI; smile.position.set(0, 0.26, 0.105); pilot.add(smile);
    this.wave = new THREE.Group(); this.wave.position.set(0.17, 0.12, 0); pilot.add(this.wave);
    const arm = new THREE.Mesh(lathe(0.3, 0.04, 0.035), new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 0.8 })); this.wave.add(arm);
    const gl = makeGlove('R', M, 0.9); gl.group.position.y = 0.3; gl.set(0.1, 0.8); this.wave.add(gl.group); this.glove = gl;
    // 回転翼のぶれ（半透明の円盤）・航行灯（赤/緑/白の点滅）・着陸灯
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0x222428, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); this.disc.rotation.x = -Math.PI / 2; this.disc.position.y = 1.06; body.add(this.disc);
    this.lamps = [[0xff2020, -0.9, 0, 0.2], [0x20ff40, 0.9, 0, 0.2], [0xffffff, 0, 0.75, -3.6]].map(([c, x, y, z]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); m.position.set(x, y, z); body.add(m); return m; });
    const land = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false })); land.position.set(0, -0.55, 1.05); body.add(land);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 12, -0.9, 1.8, 1.05, 0.75), new THREE.MeshPhysicalMaterial({ color: 0x20262e, roughness: 0.05, metalness: 0.6, clearcoat: 1 })); visor.position.set(0, 0.32, 0.012); pilot.add(visor);
    this.t = 0; this.waveSp = new Spring1(0);
  }
  update(dt, spin = 1) {
    this.t += dt; this.rotor.rotation.y += dt * 28 * spin; this.tailRotor.rotation.x += dt * 40 * spin;
    this.wave.rotation.z = this.waveSp.step(-0.6 + Math.sin(this.t * 7) * 0.55, dt, 5, 0.5);
    this.body.rotation.set(Math.sin(this.t * 1.3) * 0.02, 0, Math.sin(this.t * 1.7) * 0.025); this.body.position.y = Math.sin(this.t * 2.1) * 0.04;
    this.glove.update(dt);
    const bl = (this.t % 1.2) < 0.12; this.lamps[2].visible = bl; this.lamps[0].material.opacity = 1; this.disc.material.opacity = 0.1 + 0.08 * Math.min(1, spin);
  }
}
