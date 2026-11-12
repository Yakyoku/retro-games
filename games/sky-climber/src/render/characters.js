// Sky Climber VR — キャラクター（第 2 版）: 1 枚の連続した皮膚を持つ骨格入りモデル（tools/build-characters.mjs で生成）と、
// ばね（減衰振動）で滑らかにつないだ動き。改善 30 項目の一覧と対応は docs/CHARACTER.md。
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

// ---- 材質（部位ごと: 肌は柔らかく、布は織り目と sheen、髪はつや、ゴムはつやなし） ----
// 細部の色（上着の白線・ファスナー・裾、ベルト、靴底、ほお紅など）は、結合姿勢の座標（vBind）からシェーダーで描く。
// 境目は fwidth で 1 画素ぶんぼかす（4K でも VR の近距離でもギザギザにならない）
const lin = (h) => { const c = new THREE.Color(h).convertSRGBToLinear(); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };
function withDetail(mat, key, code, uniforms = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    const decl = 'varying vec3 vBind;\n' + Object.entries(uniforms).map(([k, u]) => `uniform ${u.value.isVector3 ? 'vec3' : 'float'} ${k};`).join('\n');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + decl + '\nfloat edge(float d){ float w = fwidth(d) * 1.2 + 1e-5; return 1.0 - smoothstep(-w, w, d); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + code);
  };
  mat.customProgramCacheKey = () => 'detail-' + key;
  return mat;
}
let detailData = null;
export function makeMaterials() {
  const weave = makeFabricNormal(256, 'weave'), knit = makeFabricNormal(256, 'knit');
  weave.repeat.set(3, 3); knit.repeat.set(5, 5);
  const vc = (o) => new THREE.MeshPhysicalMaterial({ vertexColors: true, ...o });
  const cloth = (o = {}) => vc({ roughness: 0.8, normalMap: weave, normalScale: new THREE.Vector2(0.45, 0.45), sheen: 0.1, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), ...o });
  const d = detailData || { armL: [[-0.195, 1.405, 0], [-0.52, 0.99, 0]], armR: [[0.195, 1.405, 0], [0.52, 0.99, 0]], cheekL: [-0.07, 1.62, -0.12], cheekR: [0.07, 1.62, -0.12], lip: [0, 1.59, -0.13] };
  const v3 = (a) => ({ value: new THREE.Vector3(...a) });
  const W = lin(0xf5f2ea), G = lin(0xb8bcc0), BR = lin(0x3b2a1f), GO = lin(0xd8a53a), DK = lin(0x2e2e30), RD = lin(0xd8342c), PK = lin(0xf09a88), LP = lin(0xd9786a), Y = lin(0xf6c33a), GR = lin(0x8e98a6), BK = lin(0x1d1d22);
  return {
    skin: withDetail(vc({ roughness: 0.58, sheen: 0.12, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xff9a7a) }), 'skin', `
      { float c = max(0.0, 1.0 - min(distance(vBind, uCheekL), distance(vBind, uCheekR)) / 0.038); diffuseColor.rgb = mix(diffuseColor.rgb, ${PK}, c * c * 0.55);
        float l = max(0.0, 1.0 - length((vBind - uLip) * vec3(1.0, 2.4, 1.6)) / 0.045); diffuseColor.rgb = mix(diffuseColor.rgb, ${LP}, smoothstep(0.0, 0.35, l) * 0.6); }`,
      { uCheekL: v3(d.cheekL), uCheekR: v3(d.cheekR), uLip: v3(d.lip) }),
    hair: vc({ roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color(0x6a4a38) }),
    band: cloth({ roughness: 0.72 }),
    jacket: withDetail(cloth(), 'jacket', `
      { float wht = 0.0;
        wht = max(wht, edge(vBind.y - 1.012));                                                          // 裾のゴム
        if (vBind.z > 0.03 && vBind.y > 1.0 && vBind.y < 1.43) wht = max(wht, edge(abs(abs(vBind.x) - 0.085 - (vBind.y - 1.25) * 0.08) - 0.011)); // 背中の 2 本線
        for (int i = 0; i < 2; i++) {
          vec3 a = i == 0 ? uArmL0 : uArmR0, b = i == 0 ? uArmL1 : uArmR1; float sg = i == 0 ? -1.0 : 1.0;
          vec3 ax = normalize(b - a); float t = dot(vBind - a, ax), L = length(b - a);
          if (t > 0.01 && t < L + 0.02) {
            vec3 rd = normalize(vBind - a - ax * t); vec3 o = normalize(vec3(sg * cos(0.62), sin(0.62), 0.0));
            float c = dot(rd, o);
            wht = max(wht, edge(0.93 - c)); wht = max(wht, edge(abs(c - 0.83) - 0.03));                 // 袖の太線と細線
            wht = max(wht, edge((L - 0.03) - t));                                                         // 袖口のゴム
          }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, ${W}, wht);
        if (vBind.z < -0.05 && vBind.y > 1.01 && vBind.y < 1.44) diffuseColor.rgb = mix(diffuseColor.rgb, ${G}, edge(abs(vBind.x) - 0.0055)); }`,
      { uArmL0: v3(d.armL[0]), uArmL1: v3(d.armL[1]), uArmR0: v3(d.armR[0]), uArmR1: v3(d.armR[1]) }),
    pants: withDetail(cloth({ roughness: 0.86 }), 'pants', `
      { float belt = edge(0.966 - vBind.y) * edge(vBind.y - 1.03); diffuseColor.rgb = mix(diffuseColor.rgb, ${BR}, belt);
        float buckle = belt * edge(abs(vBind.x) - 0.022) * edge(vBind.z + 0.08); diffuseColor.rgb = mix(diffuseColor.rgb, ${GO}, buckle);
        diffuseColor.rgb *= mix(1.0, 0.82, edge(vBind.y - 0.14) * edge(0.115 - vBind.y)); }`),
    shoe: withDetail(vc({ roughness: 0.55, clearcoat: 0.25 }), 'shoe', `
      { diffuseColor.rgb = mix(diffuseColor.rgb, ${DK}, edge(vBind.y - 0.022));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${RD}, edge(abs(vBind.y - 0.052) - 0.008) * (1.0 - edge(vBind.y - 0.022)));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${RD}, edge(0.105 - vBind.y)); }`),
    glove: withDetail(vc({ roughness: 0.66, normalMap: knit, normalScale: new THREE.Vector2(0.3, 0.3), sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) }), 'glove', `
      { float st = edge(abs(abs(vBind.x) - 0.016) - 0.0022) * edge(0.012 - vBind.z) * edge(0.032 - vBind.y) * edge(vBind.y - 0.085); diffuseColor.rgb = mix(diffuseColor.rgb, ${Y}, st); }`),
    cuff: cloth({ roughness: 0.7, normalMap: knit }),
    cloth: cloth(),
    body: withDetail(vc({ roughness: 0.7, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) }), 'bird', `
      { float top = smoothstep(0.02, 0.07, vBind.y + abs(vBind.x) * 0.15) * step(0.11, abs(vBind.x)) + smoothstep(0.05, 0.09, vBind.y) * (1.0 - step(0.11, abs(vBind.x)));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${GR}, clamp(top, 0.0, 1.0) * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${BK}, edge(0.52 - abs(vBind.x))); }`),
    beak: vc({ roughness: 0.35, clearcoat: 0.4 }),
    eye: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, clearcoat: 1 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    brow: new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.7 }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.6 }),
    mouthV: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    bandTail: new THREE.MeshStandardMaterial({ color: 0xf6c33a, roughness: 0.7, side: THREE.DoubleSide }),
    sleeve: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#d8342c'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#f5f2ea'; x.fillRect(4, 0, 7, 256); x.fillRect(15, 0, 4, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.8, normalMap: weave, normalScale: new THREE.Vector2(0.45, 0.45), sheen: 0.25, sheenColor: new THREE.Color(0xffffff) }); })(),
    metal: new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.25 }),
  };
}
// モデルの読み込み後に、細部の色の位置（腕の軸・ほお・くちびる）をモデルの値に合わせる
export async function loadCharacterModelsAndDetail() { await loadModels(MODEL_NAMES); detailData = getModel('climber').json.detail; }
// 頂点色つきで部品をまとめる（顔の付属物用）
function colored(list) {
  const geos = list.map(([g0, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0]) => {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()); for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1)));
    const c = new THREE.Color(color).convertSRGBToLinear(), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
  });
  const pos = [], nor = [], col = []; for (const g of geos) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return out;
}

// ---- 手袋（指 3 節 × 5 本の骨）。全身と一人称（VR）で同じものを使う ----
export function makeGlove(side, M, scale = 1) {
  const r = makeRigged('glove' + side, { glove: M.glove, cuff: M.cuff });
  const g = new THREE.Group(); g.add(r.mesh); g.scale.setScalar(scale);
  const s = side === 'L' ? -1 : 1, B = r.bones;
  const fingers = ['index', 'middle', 'ring', 'pinky'].map((n) => [B[n + '1'], B[n + '2'], B[n + '3']]);
  const thumb = [B.thumb1, B.thumb2, B.thumb3];
  const curl = new Spring1(0.2), spread = new Spring1(0);
  const api = {
    group: g, mesh: r.mesh, target: 0.2, spreadTarget: 0,
    // 握り（ばねで少し行き過ぎて戻る）。指は掌（-Z）の側へ曲がり、窓枠の縁を包む
    update(dt) {
      const c = curl.step(this.target, dt, 7, 0.55), sp = spread.step(this.spreadTarget, dt, 5, 0.8);
      fingers.forEach((f, i) => { const fan = (i - 1.5) * (0.07 + sp * 0.12) * (1 - Math.min(1, c)); f[0].rotation.set(-c * 1.05 - 0.06, 0, -fan * s); f[1].rotation.set(-c * 1.35 - 0.05, 0, 0); f[2].rotation.set(-c * 0.95 - 0.04, 0, 0); });
      thumb[0].rotation.set(-0.15 - c * 0.45, 0, -c * 0.5 * s); thumb[1].rotation.set(-c * 0.55, 0, -c * 0.2 * s); thumb[2].rotation.set(-c * 0.6, 0, 0);
    },
    set(c, sp = 0) { this.target = c; this.spreadTarget = sp; },
  };
  api.update(1);
  return api;
}

// ---- 顔の付属物（目・まぶた・眉・口）: 頭の骨に付ける ----
function makeFace(M, headBone, face, opts = {}) {
  const eyes = [], g = new THREE.Group(); headBone.add(g);
  const iris = opts.iris ?? 0x3a2617, ew = opts.eyeW ?? 0.025, eh = opts.eyeH ?? 0.031;
  for (const [k, s] of [['eyeL', -1], ['eyeR', 1]]) {
    const p = face[k]; const e = new THREE.Group(); e.position.set(p[0], p[1], p[2]); g.add(e);
    // 白目＋瞳＋瞳孔（目は顔の曲面に沿って少し外へ向ける）
    e.rotation.y = (opts.front === 1 ? 1 : -1) * s * 0.18;
    const fz = opts.front === 1 ? 1 : -1;
    const ball = new THREE.Mesh(colored([[ellipsoid(ew, eh, 0.016, 24, 18), 0xffffff], [ellipsoid(ew * 0.58, eh * 0.6, 0.007, 20, 14), iris, 0, -0.002, fz * 0.0115], [ellipsoid(ew * 0.3, eh * 0.32, 0.005, 16, 12), 0x050505, 0, -0.002, fz * 0.0145]]), M.eye);
    e.add(ball);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(ew * 0.18, 12), M.shine); sh.position.set(ew * 0.25, eh * 0.28, fz * 0.0172); if (fz < 0) sh.rotation.y = Math.PI; e.add(sh);
    // まぶた（肌色の半球を上から下ろす）
    const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), opts.lidMat || M.skin); lid.scale.set(ew * 1.14, eh * 1.14, 0.0185); lid.visible = false; e.add(lid);
    const brow = new THREE.Mesh(lathe(ew * 1.9, 0.0065, 0.0045, 8), opts.browMat || M.brow); brow.rotation.z = Math.PI / 2 * s; brow.position.set(s * ew * 0.95, eh + 0.016, fz * 0.017); e.add(brow);
    eyes.push({ e, ball, lid, brow, s, sh, eh, blink: new Spring1(0), browY: new Spring1(0), browR: new Spring1(0) });
  }
  return { g, eyes };
}

// ---- 主人公「ソラ」 ----
export class ClimberModel {
  constructor(M) {
    this.M = M;
    const r = this.r = makeRigged('climber', { skin: M.skin, hair: M.hair, band: M.band, jacket: M.jacket, pants: M.pants, shoe: M.shoe });
    this.group = new THREE.Group(); this.group.name = 'climber'; this.group.add(r.mesh);
    const B = this.B = r.bones, P = r.bindPos, face = r.json.face;
    this.len = r.json.lengths;
    // 結合の姿勢の向き（骨の向きと、曲げの手がかり）
    this.bind = {};
    for (const S of ['L', 'R']) {
      this.bind['upper' + S] = P['fore' + S].clone().sub(P['upper' + S]); this.bind['fore' + S] = P['hand' + S].clone().sub(P['fore' + S]);
      this.bind['thigh' + S] = P['shin' + S].clone().sub(P['thigh' + S]); this.bind['shin' + S] = P['foot' + S].clone().sub(P['shin' + S]);
    }
    this.lenArm = [P.foreL.distanceTo(P.upperL), P.handL.distanceTo(P.foreL)];
    this.lenLeg = [P.shinL.distanceTo(P.thighL), P.footL.distanceTo(P.shinL)];
    this.shoulderOff = P.upperR.y - P.hips.y; // 腰から肩まで
    // 手袋（全身では漫画的に少し大きく 1.25 倍）
    this.gloves = {};
    for (const S of ['L', 'R']) { const gl = makeGlove(S, M, 1.25); B['hand' + S].add(gl.group); this.gloves[S] = gl; }
    // 顔・はちまきの端
    this.fs = face.scale || 1;
    this.face = makeFace(M, B.head, face, { lidMat: M.skin, eyeW: 0.025 * this.fs, eyeH: 0.031 * this.fs });
    this.mouths = {};
    const MO = 0x5a1a1a, TE = 0xfafafa, TO = 0xd8615c, m = face.mouth;
    const mk = (name, list) => { const o = new THREE.Mesh(colored(list), M.mouthV); o.position.set(m[0], m[1] + 0.004, m[2] - 0.013); o.visible = false; B.head.add(o); this.mouths[name] = o; };
    mk('smile', [[new THREE.TorusGeometry(0.026, 0.0055, 8, 24, Math.PI), MO, 0, 0.012, 0, 0, 0, Math.PI]]);
    mk('grin', [[new THREE.CircleGeometry(0.032, 24, Math.PI, Math.PI), MO, 0, 0.01, 0, 0, Math.PI, 0], [new THREE.PlaneGeometry(0.052, 0.011), TE, 0, 0.005, -0.001, 0, Math.PI, 0], [new THREE.CircleGeometry(0.014, 16, Math.PI, Math.PI), TO, 0, -0.014, -0.001, 0, Math.PI, 0]]);
    mk('grit', [[new THREE.PlaneGeometry(0.052, 0.016), TE, 0, 0.004, 0, 0, Math.PI, 0], ...[-2, -1, 0, 1, 2].map((i) => [new THREE.PlaneGeometry(0.0014, 0.016), MO, i * 0.01, 0.004, -0.0006, 0, Math.PI, 0]), [new THREE.PlaneGeometry(0.052, 0.0014), MO, 0, 0.004, -0.0006, 0, Math.PI, 0]]);
    mk('O', [[ellipsoid(0.016, 0.022, 0.006), MO, 0, 0.004], [ellipsoid(0.009, 0.006, 0.004), TO, 0, -0.008, -0.004]]);
    this.tails = [];
    for (const s of [-1, 1]) {
      const t = new THREE.Group(); const p = face.bandTail; t.position.set(p[0] + s * 0.01, p[1], p[2]);
      const seg1 = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.08, 1, 4), M.bandTail); seg1.position.y = -0.035; t.add(seg1);
      const j = new THREE.Group(); j.position.y = -0.07; t.add(j);
      const seg2 = new THREE.Mesh(new THREE.PlaneGeometry(0.033, 0.08, 1, 4), M.bandTail); seg2.position.y = -0.035; j.add(seg2);
      B.head.add(t); this.tails.push({ t, j, s, a: new Spring1(0.5), b: new Spring1(0.3) });
    }
    // ばね
    this.sp = {
      hips: new Spring3(P.hips), look: new Spring3(V(0, 1.6, -1)), roll: new Spring1(0), twist: new Spring1(0), lean: new Spring1(0.2),
      wrist: { L: new Spring3(P.handL), R: new Spring3(P.handR) }, dip: new Spring1(0), flinch: new Spring3(V()), squash: new Spring1(1), headTilt: new Spring1(0),
    };
    this.feet = { L: { pos: null, from: null, target: null, t: 1 }, R: { pos: null, from: null, target: null, t: 1 } };
    this.t = 0; this.blinkT = 2; this.saccade = V(); this.saccT = 1; this.expr = 'calm'; this.first = true;
  }
  // 出来事: 手を伸ばし始めた（予備動作）・つかんだ（反動）・命中（ひるみ）
  impulse(kind, side) {
    const sg = side === 'L' ? -1 : 1;
    if (kind === 'reach') { this.sp.dip.v -= 0.9; }
    if (kind === 'grab') { this.sp.dip.v += 0.6; this.sp.roll.v += sg * 0.8; this.gloves[side] && (this.gloves[side].set(1.15)); }
    if (kind === 'hit') { this.sp.flinch.v.add(V(sg * 0.6, 0.4, 1.2)); this.sp.headTilt.v += sg * 4; }
  }
  update(dt, st) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const B = this.B, sp = this.sp, bx = st.body.x, by = st.body.y, z0 = 0.36;
    const shoulderC = V(bx, by, z0);
    const mode = st.mode || 'climb';
    // 1. 胴の傾き・ひねり（両手の高さの差・伸ばす側へ）をばねで
    const L = st.hands.L, R = st.hands.R;
    const rollT = Math.max(-0.38, Math.min(0.38, -(R.y - L.y) * 0.4)) + (mode === 'fall' ? Math.sin(this.t * 9) * 0.3 : 0);
    const twistT = Math.max(-0.35, Math.min(0.35, (R.reach ? 0.22 : 0) - (L.reach ? 0.22 : 0) + (R.x - L.x) * 0));
    const roll = sp.roll.step(rollT, dt, 2.2, 0.55), twist = sp.twist.step(twistT, dt, 2.5, 0.7);
    const lean = sp.lean.step(mode === 'fall' ? -0.5 : mode === 'joy' ? -0.05 : 0.18, dt, 2, 0.8);
    const dip = sp.dip.step(0, dt, 3.5, 0.45);              // 予備動作・反動（体が沈んで戻る）
    const breath = Math.sin(this.t * 2 * Math.PI * 0.27);    // 呼吸
    const fl = sp.flinch.step(V(), dt, 3, 0.5);              // 命中のひるみ
    // 2. 腰: 肩の下にぶら下がる振り子（片手保持で大きく揺れる）
    const held = (L.held ? 1 : 0) + (R.held ? 1 : 0);
    const hipT = shoulderC.clone().add(V(0, -this.shoulderOff + dip * 0.04, 0.05)).add(fl.clone().multiplyScalar(0.08));
    if (mode === 'joy') hipT.y = Math.max(hipT.y, (st.floorY ?? -99) + 0.93 + Math.abs(Math.sin(this.t * 6)) * 0.12);
    if (this.first) { sp.hips.snap(hipT); this.first = false; }
    const hip = sp.hips.step(hipT, dt, held === 1 ? 1.4 : 2.6, held === 1 ? 0.35 : 0.7);
    // 3. 胴の向き: 腰から肩への向き＋ひねり・傾き・前傾
    const up = shoulderC.clone().sub(hip).normalize();
    const torsoQ = new THREE.Quaternion().setFromUnitVectors(UP, up)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lean + breath * 0.012 + fl.z * 0.3, twist + fl.x * 0.2, roll * 0.5, 'YXZ')));
    B.hips.position.copy(hip);
    const pelvisQ = new THREE.Quaternion().setFromUnitVectors(UP, up).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 0.4, -twist * 0.5, -roll * 0.2, 'YXZ')));
    setWorldQuat(B.hips, pelvisQ);
    setWorldQuat(B.spine, pelvisQ.clone().slerp(torsoQ, 0.5));
    setWorldQuat(B.chest, torsoQ);
    // 鎖骨: 腕を上げると肩が上がる
    for (const S of ['L', 'R']) { const h = st.hands[S], lift = Math.max(0, Math.min(1, (h.y - by + 0.1) / 0.6)); setWorldQuat(B['clav' + S], torsoQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (S === 'L' ? -1 : 1) * lift * 0.28)))); }
    // 4. 首と頭: 見る先をばね＋細かい視線の跳び（サッカード）。胴から 70° 以上はねじらない
    this.saccT -= dt; if (this.saccT < 0) { this.saccT = 0.4 + Math.random() * 1.2; this.saccade.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, 0); }
    const look = sp.look.step((st.look || V(bx, by + 1, -0.6)).clone().add(this.saccade), dt, 3.2, 0.85);
    const headP = worldPos(B.head);
    const fwd = look.clone().sub(headP).normalize();
    let headQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(headP, headP.clone().add(fwd), up));
    const tilt = sp.headTilt.step(0, dt, 3, 0.5);
    headQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt * 0.1)));
    const ang = torsoQ.angleTo(headQ); if (ang > 1.2) headQ = torsoQ.clone().slerp(headQ, 1.2 / ang);
    setWorldQuat(B.neck, torsoQ.clone().slerp(headQ, 0.4));
    setWorldQuat(B.head, headQ);
    // 5. 腕: 手首の目標をばねで追い、2 ボーン IK。肘は下・外・後ろ
    for (const S of ['L', 'R']) {
      const sg = S === 'L' ? -1 : 1, h = st.hands[S];
      const sh = worldPos(B['upper' + S]);
      let target = V(h.x, h.y - (h.held ? 0.085 : 0.03), (h.z ?? 0.08) + 0.05);
      if (mode === 'fall') target = sh.clone().add(V(sg * 0.35, 0.3 + Math.sin(this.t * 13 + sg) * 0.15, 0.25));
      if (mode === 'joy') target = sh.clone().add(V(sg * 0.22, 0.5, 0.05 + Math.sin(this.t * 8 + sg) * 0.06));
      const w = sp.wrist[S].step(target, dt, h.held ? 14 : 7, h.held ? 0.9 : 0.75);
      const pole = sh.clone().add(V(sg * 0.5, -0.6, 0.45));
      const ik = solveTwoBone(this.lenArm[0], this.lenArm[1], sh, w, pole);
      const ref0 = V(0, 0, 1);
      aimBone(B['upper' + S], this.bind['upper' + S], ref0, ik.mid.clone().sub(sh), ik.bend);
      aimBone(B['fore' + S], this.bind['fore' + S], ref0, ik.end.clone().sub(ik.mid), ik.bend);
      // 手: 保持中は指を上・掌を壁に、伸ばす間は前腕の向き（手首は少し反る）
      const fdir = ik.end.clone().sub(ik.mid).normalize();
      const fingersUp = h.held ? V(sg * 0.12, 1, -0.15).normalize() : fdir.clone().add(V(0, 0.2, -0.25)).normalize();
      const back = V(0, 0, 1);
      const x = new THREE.Vector3().crossVectors(fingersUp, back).normalize(), z = new THREE.Vector3().crossVectors(x, fingersUp).normalize();
      setWorldQuat(B['hand' + S], new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, fingersUp, z)));
      const gl = this.gloves[S]; if (gl.target > 1) gl.target = Math.max(h.curl ?? 0.9, gl.target - dt * 2); else gl.set(mode === 'fall' ? 0.1 + Math.abs(Math.sin(this.t * 12)) * 0.3 : h.curl ?? (h.held ? 0.92 : 0.2), h.held ? 0 : 0.6); gl.update(dt);
    }
    // 6. 脚: 足場（下の帯・窓台・留め金）につま先を置き、変わったら放物線で踏みかえる
    for (const S of ['L', 'R']) {
      const sg = S === 'L' ? -1 : 1, f = this.feet[S];
      const thigh = worldPos(B['thigh' + S]);
      let tgt = st.feet && st.feet[S] ? V(st.feet[S].x, st.feet[S].y + 0.085, 0.14) : V(thigh.x + sg * 0.1, thigh.y - 0.74, 0.22 + Math.sin(this.t * 2 + sg) * 0.03);
      if (mode === 'fall') tgt = thigh.clone().add(V(sg * 0.25, -0.55 + Math.sin(this.t * 14 + sg * 2) * 0.15, 0.4));
      if (mode === 'joy') tgt = V(thigh.x + sg * 0.12, Math.max(thigh.y - 0.8, (st.floorY ?? -9) + 0.085), 0.2);
      if (!f.pos) { f.pos = tgt.clone(); f.from = tgt.clone(); f.target = tgt.clone(); }
      if (f.target.distanceTo(tgt) > 0.06) { f.from = f.pos.clone(); f.target = tgt.clone(); f.t = 0; }
      else f.target.lerp(tgt, 0.2);
      f.t = Math.min(1, f.t + dt * 4.5);
      const e = f.t * f.t * (3 - 2 * f.t);
      f.pos.lerpVectors(f.from, f.target, e); f.pos.z += Math.sin(e * Math.PI) * 0.12; f.pos.y += Math.sin(e * Math.PI) * 0.05;
      const pole = thigh.clone().add(V(sg * 0.3, 0, -0.7));
      const ik = solveTwoBone(this.lenLeg[0], this.lenLeg[1], thigh, f.pos, pole);
      const ref0 = V(0, 0, -1);
      aimBone(B['thigh' + S], this.bind['thigh' + S], ref0, ik.mid.clone().sub(thigh), ik.bend);
      aimBone(B['shin' + S], this.bind['shin' + S], ref0, ik.end.clone().sub(ik.mid), ik.bend);
      // 足首: つま先を壁へ。踏みかえ中は下がり、置くと水平に戻る
      const toeTilt = mode === 'fall' ? 0.6 : (f.t < 1 ? -0.5 * Math.sin(e * Math.PI) : -0.12);
      setWorldQuat(B['foot' + S], new THREE.Quaternion().setFromEuler(new THREE.Euler(toeTilt, -twist * 0.3, 0)));
    }
    // 7. 表情（口の切替は小さく弾ませる）・まばたき（ばねで閉じて開く）・眉
    this.blinkT -= dt; let blinkT = 0; if (this.blinkT < 0.13) blinkT = 1; if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    const expr = st.expr || 'calm';
    const look2 = { calm: ['smile', 0, 0, 0], strain: ['grit', 0.3, -0.006, -0.35], reach: ['grit', 0.1, 0.004, -0.2], surprise: ['O', -0.15, 0.012, 0.25], fall: ['O', -0.2, 0.014, 0.3], joy: ['grin', 0.35, 0.008, 0.1] }[expr] || ['smile', 0, 0, 0];
    if (expr !== this.expr) { this.expr = expr; for (const [k, o] of Object.entries(this.mouths)) { o.visible = k === look2[0]; if (o.visible) o.scale.setScalar(0.6 * this.fs); } }
    for (const o of Object.values(this.mouths)) if (o.visible) o.scale.lerp(V(this.fs, this.fs, this.fs), 1 - Math.exp(-dt * 14));
    for (const e of this.face.eyes) {
      const b = e.blink.step(Math.max(blinkT, look2[1] > 0 ? look2[1] : 0), dt, blinkT ? 18 : 9, 1);
      const bb = Math.max(0, Math.min(1, b)); e.lid.scale.y = 0.0001 + bb * e.eh * 1.14; e.lid.position.y = e.eh * (1 - bb); // まぶたが上から下りる
      e.lid.visible = b > 0.03;
      e.ball.scale.setScalar(1 + Math.max(0, -look2[1]) * 0.9);
      const byv = e.browY.step(look2[2], dt, 6, 0.6), brv = e.browR.step(look2[3] * e.s, dt, 6, 0.6);
      e.brow.position.y = e.eh + 0.013 + byv; e.brow.rotation.z = Math.PI / 2 * e.s + brv;
    }
    // 8. はちまきの端（二次運動: 頭の動きと風で揺れる）
    for (const tl of this.tails) {
      const a = tl.a.step(0.7 + Math.sin(this.t * 6.5 + tl.s) * 0.22 * (st.wind || 1) + (mode === 'fall' ? -1.6 : 0), dt, 3, 0.4);
      const b2 = tl.b.step(0.35 + Math.sin(this.t * 7.3 + tl.s * 2) * 0.3 * (st.wind || 1), dt, 4, 0.4);
      tl.t.rotation.set(a, 0, tl.s * 0.35); tl.j.rotation.x = b2;
    }
    // 9. 喜び: 縦に伸び縮み（スクワッシュ＆ストレッチ）
    const sq = sp.squash.step(mode === 'joy' ? 1 + Math.sin(this.t * 12) * 0.05 : 1, dt, 6, 0.5);
    this.group.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (mode === 'joy') { const c = hip.clone(); this.group.position.set(c.x * (1 - 1 / Math.sqrt(sq)), c.y * (1 - sq), 0); } else this.group.position.set(0, 0, 0);
  }
}

// ---- 一人称の手（VR）: 主人公と同じ手袋（骨入り）と、同じ赤白の袖 ----
export class FirstPersonHands {
  constructor(M) {
    this.group = new THREE.Group(); this.hands = {};
    for (const s of ['L', 'R']) {
      const g = new THREE.Group();
      const glove = makeGlove(s, M, 1.0);
      const fore = new THREE.Mesh(lathe(0.22, 0.04, 0.034, 24), M.sleeve); fore.castShadow = true;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 10, 24), new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.8 })); cuff.rotation.x = Math.PI / 2;
      g.add(glove.group, fore, cuff); this.group.add(g);
      this.hands[s] = { g, glove, hand: { group: glove.group }, fore, cuffSleeve: cuff, pos: new Spring3(), q: new THREE.Quaternion(), first: true };
    }
  }
  set(s, pos, quat, curl, heldAt, dt = 1 / 72) {
    const h = this.hands[s], gg = h.glove.group;
    const p = heldAt || pos;
    // 保持中は保持点へ短いばねで吸い付く（瞬間移動しない）、そうでなければコントローラーにそのまま追従（遅延させない）
    if (h.first || !heldAt) { h.pos.snap(p); h.first = false; } else h.pos.step(p, dt, 22, 0.9);
    gg.position.copy(h.pos.x);
    let q;
    if (heldAt) { const sg = s === 'L' ? -1 : 1; q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0), V(sg * 0.1, 1, 0).normalize(), V(0, 0, 1))); }
    else q = quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.25, 0, 0)));
    h.q.slerp(q, heldAt ? 0.35 : 1); gg.quaternion.copy(h.q);
    h.glove.set(curl); h.glove.update(dt);
    const back = V(0, -1, 0).applyQuaternion(gg.quaternion);
    const elbow = gg.position.clone().add(back.clone().multiplyScalar(0.23));
    const wristIn = gg.position.clone().add(V(0, -0.02, 0).applyQuaternion(gg.quaternion));
    h.fore.position.copy(elbow); h.fore.quaternion.setFromUnitVectors(UP, wristIn.clone().sub(elbow).normalize());
    h.cuffSleeve.position.copy(gg.position.clone().add(V(0, -0.035, 0).applyQuaternion(gg.quaternion)));
    h.cuffSleeve.quaternion.copy(gg.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
  }
}

// ---- 窓の住人: 'oyaji'（はげ頭・口ひげ・肌着）/ 'obachan'（カーラー・おだんご・割烹着）。前は +z（窓の外） ----
export class ResidentModel {
  constructor(M, kind = 'oyaji') {
    this.kind = kind;
    const r = this.r = makeRigged('resident-' + kind, { skin: M.skin, hair: M.hair, cloth: M.cloth });
    this.group = new THREE.Group(); this.group.name = 'resident'; this.group.add(r.mesh);
    const B = this.B = r.bones;
    this.face = makeFace(M, B.head, Object.fromEntries(Object.entries(r.json.face).map(([k, p]) => [k, [p[0], p[1] + 0.0, p[2]]])), { front: 1, iris: 0x2a2a2a, eyeW: 0.02, eyeH: 0.017, lidMat: M.skin });
    for (const e of this.face.eyes) { e.brow.scale.set(1.4, 1.6, 1.6); }
    this.mouth = new THREE.Mesh(ellipsoid(0.028, 0.012, 0.01), M.mouth); const m = r.json.face.mouth; this.mouth.position.set(m[0], m[1], m[2]); B.head.add(this.mouth);
    if (kind === 'oyaji') { const sh = new THREE.Mesh(ellipsoid(0.035, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })); sh.position.set(0.04, 0.18, 0.06); sh.rotation.x = -0.6; B.head.add(sh); }
    if (kind === 'obachan') { const gm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, metalness: 0.6, roughness: 0.3 }); for (const e of this.face.eyes) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0035, 8, 24), gm); ring.position.z = 0.012; e.e.add(ring); } }
    this.sp = { chest: new Spring1(0), head: new Spring1(0), shake: new Spring1(0), armL: new Spring3(V(-0.15, 0, 0)), armR: new Spring3(V(-0.15, 0, 0)), elL: new Spring1(-0.2), elR: new Spring1(-0.2), mouth: new Spring1(1) };
    this.t = Math.random() * 10;
  }
  // mode: 'idle' | 'lean'（身を乗り出して物を構える）| 'throw' | 'close'（窓を引き下ろす）| 'angry'
  update(dt, mode, k = 0) {
    dt = Math.min(dt, 0.05); this.t += dt;
    const B = this.B, sp = this.sp, shake = Math.sin(this.t * 17);
    let chest = 0, head = 0, arm = V(-0.15, 0, 0.1), el = -0.25, mouth = 1;
    if (mode === 'close') { chest = 0.05; head = 0.15; arm = V(-2.7 + k * 1.3, 0, 0.15); el = -0.5; mouth = 1.6; }
    else if (mode === 'lean') { chest = 0.45; head = 0.25 + shake * 0.04; arm = V(-2.5, 0, 0.25); el = -0.7; mouth = 2.4 + Math.abs(shake) * 1.5; }
    else if (mode === 'throw') { chest = 0.55; head = 0.2; arm = V(-1.0, 0, 0.2); el = -0.1; mouth = 2.8; }
    else if (mode === 'angry') { chest = 0.15; head = 0.1; arm = V(-2.4 + shake * 0.2, 0, 0.3); el = -1.3; mouth = 2.2; }
    else { head = Math.sin(this.t * 1.3) * 0.15; }
    const c = sp.chest.step(chest, dt, 3, 0.6), hd = sp.head.step(head, dt, 4, 0.5);
    B.chest.rotation.set(c, 0, 0); B.head.rotation.set(hd, Math.sin(this.t * 1.7) * 0.2 * (mode === 'idle' ? 1 : 0.3), 0);
    for (const [S, sg] of [['L', -1], ['R', 1]]) {
      const a = sp['arm' + S].step(V(arm.x, arm.y, arm.z * -sg), dt, 4, 0.55);
      B['upper' + S].rotation.set(a.x, 0, a.z); B['fore' + S].rotation.x = sp['el' + S].step(el, dt, 5, 0.6);
    }
    this.mouth.scale.y = sp.mouth.step(mouth, dt, 8, 0.4);
    for (const e of this.face.eyes) { e.brow.rotation.z = Math.PI / 2 * e.s - e.s * 0.45; e.brow.position.y = 0.03; }
  }
}

// ---- 鳥（カモメ風）: 翼は付け根と先の 2 節。羽ばたきと滑空を切り替え、体は羽ばたきに合わせて上下 ----
export class BirdModel {
  constructor(M) {
    const r = this.r = makeRigged('bird', { body: M.body, beak: M.beak });
    this.group = new THREE.Group(); this.group.name = 'bird'; this.group.add(r.mesh);
    this.B = r.bones;
    this.face = makeFace(M, r.bones.head, r.json.face, { front: 1, iris: 0x1d1d22, eyeW: 0.018, eyeH: 0.021, lidMat: M.body });
    for (const e of this.face.eyes) { e.e.rotation.y = e.s * 1.1; e.brow.rotation.z = Math.PI / 2 * e.s - e.s * 0.5; e.brow.scale.setScalar(1.3); }
    this.t = Math.random() * 10; this.glide = new Spring1(0); this.bob = 0;
  }
  update(dt, speed = 1) {
    dt = Math.min(dt, 0.05); this.t += dt * speed;
    // 4 秒のうち 1 秒は滑空（翼を広げて止める）
    const gl = this.glide.step(((this.t % 4) > 3) ? 1 : 0, dt, 2, 1);
    const ph = this.t * 10.5;
    const a = Math.sin(ph) * 0.8 * (1 - gl), b = Math.sin(ph - 1.1) * 0.7 * (1 - gl);
    for (const [S, s] of [['L', -1], ['R', 1]]) { this.B['wing1' + S].rotation.set(0, 0, s * (a + gl * 0.08)); this.B['wing2' + S].rotation.set(0, 0, s * (b - gl * 0.05)); }
    this.B.tail.rotation.x = Math.sin(ph + 0.5) * 0.12;
    this.B.head.rotation.set(Math.sin(this.t * 3) * 0.08, Math.sin(this.t * 1.7) * 0.15, 0);
    this.B.root.position.y = -Math.cos(ph) * 0.03 * (1 - gl);
  }
}

// ---- ヘリコプターとパイロット（機体は少し揺れ、パイロットは手を振る） ----
export class HelicopterModel {
  constructor(M) {
    const g = this.group = new THREE.Group(); g.name = 'heli';
    const body = this.body = new THREE.Group(); g.add(body);
    const bodyM = new THREE.MeshPhysicalMaterial({ color: 0xf2c230, metalness: 0.3, roughness: 0.3, clearcoat: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9cc8e6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.4 });
    const hull = new THREE.Mesh(ellipsoid(0.9, 0.75, 1.3, 40, 28), bodyM); hull.castShadow = true; body.add(hull);
    const bubble = new THREE.Mesh(ellipsoid(0.78, 0.62, 0.7, 32, 20), glass); bubble.position.set(0, 0.15, 0.75); body.add(bubble);
    const boom = new THREE.Mesh(lathe(2.6, 0.22, 0.08, 24), bodyM); boom.rotation.x = -Math.PI / 2; boom.position.set(0, 0.2, -1.0); body.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.4), bodyM); fin.position.set(0, 0.5, -3.5); body.add(fin);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.08), dark); this.tailRotor.position.set(0.1, 0.45, -3.5); body.add(this.tailRotor);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 12), dark); mast.position.set(0, 0.85, 0); body.add(mast);
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.05, 0); body.add(this.rotor);
    for (let i = 0; i < 2; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.03, 0.22), dark); bl.rotation.y = i * Math.PI / 2; this.rotor.add(bl); }
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 12), dark); sk.rotation.x = Math.PI / 2; sk.position.set(s * 0.7, -0.95, 0); body.add(sk);
      for (const z of [-0.6, 0.6]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), dark); st.position.set(s * 0.62, -0.78, z); st.rotation.z = s * 0.4; body.add(st); } }
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 10, 48), new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.4 })); stripe.rotation.y = Math.PI / 2; stripe.scale.set(1, 0.85, 1.45); body.add(stripe);
    const pilot = new THREE.Group(); pilot.position.set(0.25, 0.05, 0.75); body.add(pilot);
    pilot.add(new THREE.Mesh(ellipsoid(0.17, 0.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 0.8 })));
    const ph = new THREE.Mesh(ellipsoid(0.11, 0.12, 0.11), new THREE.MeshStandardMaterial({ color: 0xf0bd96, roughness: 0.5 })); ph.position.y = 0.3; pilot.add(ph);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 })); helm.position.y = 0.32; pilot.add(helm);
    const gog = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 8, 18), dark); gog.position.set(0, 0.35, 0.1); pilot.add(gog);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 18, Math.PI), M.mouth); smile.rotation.z = Math.PI; smile.position.set(0, 0.26, 0.105); pilot.add(smile);
    this.wave = new THREE.Group(); this.wave.position.set(0.17, 0.12, 0); pilot.add(this.wave);
    const arm = new THREE.Mesh(lathe(0.3, 0.04, 0.035), new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 0.8 })); this.wave.add(arm);
    const gl = makeGlove('R', M, 0.9); gl.group.position.y = 0.3; gl.set(0.1, 0.8); this.wave.add(gl.group); this.glove = gl;
    this.t = 0; this.waveSp = new Spring1(0);
  }
  update(dt, spin = 1) {
    this.t += dt; this.rotor.rotation.y += dt * 28 * spin; this.tailRotor.rotation.x += dt * 40 * spin;
    this.wave.rotation.z = this.waveSp.step(-0.6 + Math.sin(this.t * 7) * 0.55, dt, 5, 0.5);
    this.body.rotation.set(Math.sin(this.t * 1.3) * 0.02, 0, Math.sin(this.t * 1.7) * 0.025); this.body.position.y = Math.sin(this.t * 2.1) * 0.04;
    this.glove.update(dt);
  }
}
