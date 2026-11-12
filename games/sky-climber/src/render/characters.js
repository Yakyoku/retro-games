// Sky Climber VR — キャラクター（すべて手続きで組み立てたモデル。外部ファイルなし）。
// 方針（docs/CHARACTER.md）: 小さく映っても役割が分かるシルエット、少しコミカルな誇張（大きめの頭と手袋）、背景に埋もれない配色。
// 主人公「ソラ」: 赤いジャージに白の線、黄色のはちまき、白い大きな手袋。一人称の手（VR）と全身（通常 3D）で同じ部品・同じ素材を使う。
// 関節: 肩・肘・手首・指（3 節）・腰・膝・足首・首。腕と脚は 2 ボーン IK で、保持点にかけた手と足場に置いた足から姿勢を決める。
import * as THREE from 'three';
import { makeFabricNormal } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
// 太さの変わる手足（回転体）。0→len を +Y 方向に
function limbGeo(len, r0, r1, seg = 14) {
  const out = [];
  for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; out.push(new THREE.Vector2(Math.sin(a) * r0, -Math.cos(a) * r0 * 0.6)); } // 下の丸み
  const n = 8;
  for (let i = 1; i < n; i++) { const t = i / n; out.push(new THREE.Vector2((r0 + (r1 - r0) * t) * (1 + 0.07 * Math.sin(t * Math.PI)), t * len)); } // 中ほどを少しふくらませる（筋肉・布のたるみ）
  for (let k = 4; k >= 0; k--) { const a = (k / 4) * Math.PI / 2; out.push(new THREE.Vector2(Math.sin(a) * r1, len + Math.cos(a) * r1 * 0.6)); } // 上の丸み
  return new THREE.LatheGeometry(out, seg);
}
function ellipsoid(rx, ry, rz, ws = 24, hs = 16) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
// 複数の部品を 1 つのジオメトリにまとめる（頂点色で色分け → 描画 1 回）。part = [geo, 色, x,y,z, rx,ry,rz, sx,sy,sz]
export function mergeColored(parts) {
  const geos = parts.map(([g0, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    let g = g0.index ? g0.toNonIndexed() : g0.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    const c = new THREE.Color(color).convertSRGBToLinear(), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos);
}
const vc = (m) => { const k = m.clone(); k.vertexColors = true; k.color = new THREE.Color(0xffffff); return k; };
// 0→target 方向へ +Y を向ける
const tmpQ = new THREE.Quaternion();
function aim(obj, from, to) { const d = to.clone().sub(from); const len = d.length(); obj.position.copy(from); obj.quaternion.setFromUnitVectors(UP, d.normalize()); return len; }

// 2 ボーン IK。肘（膝）の向きは pole で決める。戻り値: 中間関節の位置
export function solveTwoBone(a, b, root, target, pole) {
  const d = target.clone().sub(root);
  let len = d.length();
  const minL = Math.abs(a - b) + 1e-3, maxL = a + b - 1e-3;
  const L = Math.min(maxL, Math.max(minL, len));
  const dir = len > 1e-6 ? d.multiplyScalar(1 / len) : V(0, -1, 0);
  const cosA = (a * a + L * L - b * b) / (2 * a * L);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pv = pole.clone().sub(root); pv.sub(dir.clone().multiplyScalar(pv.dot(dir)));
  if (pv.lengthSq() < 1e-8) pv.set(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z));
  pv.normalize();
  const mid = root.clone().add(dir.clone().multiplyScalar(a * cosA)).add(pv.multiplyScalar(a * sinA));
  const end = root.clone().add(dir.multiplyScalar(L));
  return { mid, end, reach: len <= maxL };
}

export function makeMaterials(quality) {
  const weave = makeFabricNormal(256, 'weave'), knit = makeFabricNormal(256, 'knit');
  weave.repeat.set(6, 6); knit.repeat.set(8, 8);
  const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#d8342c'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#f5f2ea'; x.fillRect(0, 0, 9, 256); x.fillRect(14, 0, 5, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const m = {
    jacket: new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.72, normalMap: weave, normalScale: new THREE.Vector2(0.5, 0.5) }),
    sleeve: new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.72, normalMap: weave, normalScale: new THREE.Vector2(0.5, 0.5) }),
    white: new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.7, normalMap: weave, normalScale: new THREE.Vector2(0.4, 0.4) }),
    pants: new THREE.MeshStandardMaterial({ color: 0x263553, roughness: 0.85, normalMap: weave, normalScale: new THREE.Vector2(0.7, 0.7) }),
    glove: new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.62, normalMap: knit, normalScale: new THREE.Vector2(0.35, 0.35) }),
    cuff: new THREE.MeshStandardMaterial({ color: 0xf6c33a, roughness: 0.6, normalMap: knit, normalScale: new THREE.Vector2(0.5, 0.5) }),
    skin: new THREE.MeshStandardMaterial({ color: 0xf0bd96, roughness: 0.55 }),
    cheek: new THREE.MeshStandardMaterial({ color: 0xf2988a, roughness: 0.6, transparent: true, opacity: 0.55 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.5, metalness: 0.05 }),
    band: new THREE.MeshStandardMaterial({ color: 0xf6c33a, roughness: 0.6, normalMap: weave, normalScale: new THREE.Vector2(0.4, 0.4) }),
    eyeW: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x3a2617, roughness: 0.1 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.6 }),
    tongue: new THREE.MeshStandardMaterial({ color: 0xd8615c, roughness: 0.5 }),
    teeth: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 }),
    brow: new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.7 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 }),
    shoeAccent: new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.5 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.9 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.25 }),
  };
  m.fabricV = vc(m.jacket); m.gloveV = vc(m.glove); m.skinV = vc(m.skin); m.hairV = vc(m.hair); m.eyeV = vc(m.eyeW); m.mouthV = vc(m.mouth); m.shoeV = vc(m.shoe); m.pantsV = vc(m.pants);
  return m;
}

// ---- 手（手袋）: 掌・指 4 本 × 3 節・親指 3 節・袖口。指の関節を THREE.Bone にした SkinnedMesh 1 つ（描画 1 回）。
// curl=0 開く → 1 握る（窓枠の縁を包む形）
export function makeHand(side, M, scale = 1) {
  const s = side === 'L' ? -1 : 1;
  const W = 0xf8f6f0, Y = 0xf6c33a;
  const root = new THREE.Group(); root.name = 'hand' + side;
  const rootBone = new THREE.Bone();
  const bones = [rootBone], parts = []; // parts: { geo(ボーン座標), bone }
  const addPart = (bone, list) => parts.push({ bone, list });
  addPart(0, [
    [ellipsoid(0.046, 0.052, 0.022), W, 0, 0.05, 0], [ellipsoid(0.044, 0.048, 0.016), W, 0, 0.05, 0.012],
    ...[-1, 0, 1].map((i) => [new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 6), Y, i * 0.016, 0.055, 0.027]),
    [new THREE.CylinderGeometry(0.044, 0.036, 0.05, 18, 1, true), Y, 0, -0.005, 0, 0, 0, 0, 1, 1, 0.75],
    [new THREE.TorusGeometry(0.044, 0.008, 8, 20), Y, 0, -0.03, 0, Math.PI / 2, 0, 0, 1, 1, 0.75],
  ]);
  const fingers = [];
  const defs = [[0.030 * s, [0.034, 0.024, 0.020], 0.0115], [0.011 * s, [0.040, 0.027, 0.021], 0.0125], [-0.010 * s, [0.038, 0.026, 0.020], 0.012], [-0.030 * s, [0.030, 0.021, 0.017], 0.0105]];
  for (const [x, lens, r] of defs) {
    const chain = []; let parent = rootBone;
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Bone(); j.position.set(k === 0 ? x : 0, k === 0 ? 0.098 : lens[k - 1], 0);
      parent.add(j); bones.push(j); chain.push(j); parent = j;
      addPart(bones.length - 1, [[limbGeo(lens[k], r * (1 - k * 0.06), r * (0.95 - k * 0.08), 10), W]]);
    }
    fingers.push(chain);
  }
  const thumb = []; {
    const base = new THREE.Bone(); base.position.set(0.042 * s, 0.035, -0.006); base.rotation.set(0, 0, -0.9 * s); rootBone.add(base); bones.push(base);
    let parent = base; const lens = [0.028, 0.024, 0.02];
    for (let k = 0; k < 3; k++) { const j = new THREE.Bone(); j.position.set(0, k === 0 ? 0 : lens[k - 1], 0); parent.add(j); bones.push(j); thumb.push(j); parent = j; addPart(bones.length - 1, [[limbGeo(lens[k], 0.0135 - k * 0.001, 0.0125 - k * 0.001, 10), W]]); }
  }
  // 結合の姿勢（指を伸ばした状態）で各部品をボーンの位置へ置き、頂点ごとにボーン番号を付ける
  rootBone.updateMatrixWorld(true);
  const geos = [];
  for (const p of parts) {
    const g = mergeColored(p.list); g.applyMatrix4(bones[p.bone].matrixWorld);
    const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = p.bone; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(g);
  }
  const mesh = new THREE.SkinnedMesh(mergeGeometries(geos), M.gloveV);
  mesh.add(rootBone); mesh.bind(new THREE.Skeleton(bones)); mesh.castShadow = true; mesh.frustumCulled = false;
  root.add(mesh);
  root.scale.setScalar(scale);
  let curl = 0;
  const api = {
    group: root, mesh, bones,
    setCurl(c, spr = 0) {
      curl = c;
      fingers.forEach((f, i) => { const fan = (i - 1.5) * 0.09 * (1 - c) + (i - 1.5) * spr * 0.12; f[0].rotation.set(-c * 1.05 - 0.08, 0, fan * s); f[1].rotation.x = -c * 1.3 - 0.06; f[2].rotation.x = -c * 0.95 - 0.04; });
      thumb[0].rotation.set(-0.3 - c * 0.5, 0, -c * 0.35 * s); thumb[1].rotation.x = -c * 0.7; thumb[2].rotation.x = -c * 0.6;
    },
    get curl() { return curl; },
  };
  api.setCurl(0.15);
  return api;
}

// ---- 頭（顔・髪・はちまき・表情） ----
function makeHead(M) {
  const g = new THREE.Group(); g.name = 'head';
  const SK = 0xf0bd96, HR = 0x2a1d17, BD = 0xf6c33a;
  // 肌（頭・あご・耳・鼻）をまとめて 1 回
  const skin = new THREE.Mesh(mergeColored([
    [ellipsoid(0.118, 0.13, 0.12, 32, 24), SK], [ellipsoid(0.1, 0.07, 0.1, 24, 12), SK, 0, -0.06, -0.01],
    [ellipsoid(0.022, 0.034, 0.014), SK, -0.118, -0.005, 0], [ellipsoid(0.022, 0.034, 0.014), SK, 0.118, -0.005, 0],
    [ellipsoid(0.022, 0.02, 0.022), SK, 0, -0.015, -0.123],
  ]), M.skinV); skin.castShadow = true; g.add(skin);
  const cheeks = new THREE.Mesh(mergeColored([-1, 1].map((s) => [new THREE.CircleGeometry(0.022, 16), 0xf2988a, s * 0.068, -0.04, -0.103, 0, Math.PI + s * 0.5, 0])), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.55 }));
  g.add(cheeks);
  // 目（白目・瞳・瞳孔を 1 つに）・光・眉。まぶたは白目の縦の大きさで
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.044, 0.022, -0.105); g.add(e);
    const w = new THREE.Mesh(mergeColored([[ellipsoid(0.026, 0.033, 0.014), 0xffffff], [ellipsoid(0.015, 0.019, 0.006), 0x3a2617, 0, 0, -0.011], [ellipsoid(0.008, 0.01, 0.004), 0x050505, 0, 0, -0.015]]), M.eyeV); e.add(w);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 10), M.shine); sh.position.set(0.006, 0.008, -0.0185); sh.rotation.y = Math.PI; e.add(sh);
    const brow = new THREE.Mesh(limbGeo(0.042, 0.0065, 0.005, 8), M.brow); brow.rotation.z = Math.PI / 2 * s; brow.position.set(s * 0.021, 0.05, -0.006); e.add(brow);
    eyes.push({ e, w, iris: w, pupil: w, sh, brow, s });
  }
  // 口: 表情ごとに形を 1 つずつ（切り替えて使う）
  const mouths = {}, MO = 0x5a1a1a, TE = 0xfafafa, TO = 0xd8615c;
  const mk = (name, list) => { const o = new THREE.Mesh(mergeColored(list), M.mouthV); o.position.set(0, -0.067, -0.112); o.visible = false; g.add(o); mouths[name] = o; };
  mk('smile', [[new THREE.TorusGeometry(0.03, 0.006, 8, 20, Math.PI), MO, 0, 0, 0, 0, 0, Math.PI]]);
  mk('grin', [[new THREE.CircleGeometry(0.036, 24, Math.PI, Math.PI), MO, 0, 0, 0, 0, Math.PI, 0], [new THREE.PlaneGeometry(0.06, 0.012), TE, 0, -0.005, -0.001, 0, Math.PI, 0], [new THREE.CircleGeometry(0.016, 16, Math.PI, Math.PI), TO, 0, -0.022, -0.001, 0, Math.PI, 0]]);
  mk('grit', [[new THREE.PlaneGeometry(0.06, 0.018), TE, 0, 0, 0, 0, Math.PI, 0], ...[-2, -1, 0, 1, 2].map((i) => [new THREE.PlaneGeometry(0.0015, 0.018), MO, i * 0.011, 0, -0.0005, 0, Math.PI, 0]), [new THREE.PlaneGeometry(0.06, 0.0015), MO, 0, 0, -0.0005, 0, Math.PI, 0]]);
  mk('O', [[ellipsoid(0.018, 0.024, 0.006), MO], [ellipsoid(0.01, 0.007, 0.004), TO, 0, -0.012, -0.004]]);
  // 髪: とがった房（後ろ・上・横）と前髪をまとめて 1 回
  const spikes = [[0, 0.14, 0.02, -0.3, 0], [0.06, 0.13, 0.03, -0.2, -0.5], [-0.06, 0.13, 0.03, -0.2, 0.5], [0.0, 0.11, 0.09, 0.6, 0], [0.07, 0.1, 0.07, 0.5, -0.6], [-0.07, 0.1, 0.07, 0.5, 0.6],
    [0.03, 0.13, -0.06, -0.9, -0.2], [-0.03, 0.13, -0.06, -0.9, 0.2], [0.1, 0.05, 0.05, 0.3, -1.2], [-0.1, 0.05, 0.05, 0.3, 1.2], [0.0, 0.03, 0.12, 1.3, 0]];
  const hairParts = [[ellipsoid(0.124, 0.12, 0.126, 28, 16), HR, 0, 0.03, 0.006, 0, 0, 0, 1, 0.95, 1], ...spikes.map(([x, y, z, rx, rz]) => [new THREE.ConeGeometry(0.035, 0.09, 10), HR, x, y, z, rx, 0, rz]),
    ...[[-0.035, 0.4], [0.0, 0.0], [0.035, -0.4]].map(([x, rz]) => [new THREE.ConeGeometry(0.026, 0.06, 8), HR, x, 0.085, -0.105, -2.3, 0, rz])];
  const hair = new THREE.Mesh(mergeColored(hairParts), M.hairV); hair.castShadow = true; g.add(hair);
  // はちまき（輪と結び目を 1 回）と、風になびく 2 本の端
  const band = new THREE.Mesh(mergeColored([[new THREE.TorusGeometry(0.123, 0.016, 8, 40), BD, 0, 0.075, 0, Math.PI / 2 + 0.12, 0, 0, 1, 1.02, 0.9], [ellipsoid(0.024, 0.02, 0.02), BD, 0, 0.066, 0.118]]), vc(M.band)); g.add(band);
  const tails = [];
  for (const s of [-1, 1]) { const t = new THREE.Group(); t.position.set(s * 0.01, 0.062, 0.125); const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.006), M.band); m.position.y = -0.06; t.add(m); t.rotation.set(0.5, 0, s * 0.35); g.add(t); tails.push(t); }
  const api = {
    group: g, eyes, mouths, tails,
    expr: null,
    // 表情: calm（ふつう）/ strain（耐える）/ reach（伸ばす）/ surprise（驚く）/ fall（落下）/ joy（喜ぶ）
    setExpr(name, blink = 0) {
      const look = { calm: ['smile', 1, 0], strain: ['grit', 0.75, -0.25], reach: ['grit', 0.9, 0.15], surprise: ['O', 1.25, 0.5], fall: ['O', 1.3, 0.6], joy: ['grin', 0.55, 0.35] }[name] || ['smile', 1, 0];
      for (const [k, o] of Object.entries(mouths)) o.visible = k === look[0];
      for (const e of eyes) {
        const open = Math.max(0.08, look[1] * (1 - blink));
        e.w.scale.set(1, open, 1); e.sh.visible = open > 0.3;
        e.brow.position.y = 0.05 + look[2] * 0.012; e.brow.rotation.z = Math.PI / 2 * e.s + (name === 'strain' || name === 'reach' ? -0.35 * e.s : name === 'surprise' ? 0.2 * e.s : 0);
      }
      this.expr = name;
    },
  };
  api.setExpr('calm');
  return api;
}

// ---- 主人公の全身 ----
export const DIM = { shoulderW: 0.2, upper: 0.29, fore: 0.27, hand: 0.1, hipW: 0.095, thigh: 0.42, shin: 0.41, shoulderY: 1.40, hipY: 0.9, headY: 1.63 };

export class ClimberModel {
  constructor(M) {
    this.M = M; const g = this.group = new THREE.Group(); g.name = 'climber';
    // 胴（上着）: 胸が厚く腰が細い回転体を、前後に少しつぶす
    const prof = [[0.0, 0.0], [0.13, 0.0], [0.145, 0.05], [0.14, 0.16], [0.16, 0.28], [0.185, 0.4], [0.17, 0.48], [0.12, 0.53], [0.06, 0.56], [0.0, 0.57]].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoG = new THREE.LatheGeometry(prof, 28); torsoG.scale(1, 1, 0.72);
    this.torso = new THREE.Group(); g.add(this.torso);
    // 上着・背中の白線・ファスナー・襟・裾・ベルトを 1 回で
    const torso = new THREE.Mesh(mergeColored([
      [torsoG, 0xd8342c],
      ...[-1, 1].map((s) => [new THREE.BoxGeometry(0.018, 0.34, 0.01), 0xf5f2ea, s * 0.09, 0.3, 0.125, 0, 0, s * 0.12]),
      [new THREE.BoxGeometry(0.012, 0.42, 0.008), 0xb8bcc0, 0, 0.28, -0.128],
      [new THREE.TorusGeometry(0.075, 0.022, 8, 24), 0xd8342c, 0, 0.53, 0, Math.PI / 2],
      [new THREE.TorusGeometry(0.135, 0.016, 8, 28), 0xf5f2ea, 0, 0.02, 0, Math.PI / 2, 0, 0, 1, 0.72, 1],
      [new THREE.TorusGeometry(0.128, 0.018, 8, 28), 0x3b2a1f, 0, -0.03, 0, Math.PI / 2, 0, 0, 1, 0.72, 1],
    ]), M.fabricV); torso.castShadow = true; this.torso.add(torso);
    // 腰（ズボン）
    this.pelvis = new THREE.Mesh(ellipsoid(0.135, 0.09, 0.1), M.pants); this.pelvis.castShadow = true; g.add(this.pelvis);
    // 首と頭
    this.neck = new THREE.Mesh(limbGeo(0.07, 0.045, 0.042), M.skin); g.add(this.neck);
    this.head = makeHead(M); g.add(this.head.group);
    // 腕: 上腕（袖）・肘（袖のふくらみ）・前腕（袖）・手袋
    this.arms = {};
    for (const s of ['L', 'R']) {
      const up = new THREE.Mesh(limbGeo(DIM.upper, 0.052, 0.044), M.sleeve); up.castShadow = true;
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.047, 16, 12), M.jacket);
      const fore = new THREE.Mesh(limbGeo(DIM.fore, 0.045, 0.037), M.sleeve); fore.castShadow = true;
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 12), M.jacket); shoulder.castShadow = true;
      const hand = makeHand(s, M, 1.3); // 全身では手袋を少し大きく（漫画的な誇張・小さく映っても手の形が分かる）
      g.add(up, elbow, fore, shoulder, hand.group);
      this.arms[s] = { up, elbow, fore, shoulder, hand };
    }
    // 脚: もも・ひざ・すね・靴
    this.legs = {};
    for (const s of ['L', 'R']) {
      const th = new THREE.Mesh(limbGeo(DIM.thigh, 0.07, 0.055), M.pants); th.castShadow = true;
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), M.pants);
      const sh = new THREE.Mesh(limbGeo(DIM.shin, 0.055, 0.045), M.pants); sh.castShadow = true;
      const foot = this.makeShoe(s); g.add(th, knee, sh, foot);
      this.legs[s] = { th, knee, sh, foot, pos: null, target: null, lift: 0 };
    }
    this.t = 0; this.blinkT = 2;
    this.pose = { lean: 0, twist: 0, roll: 0 };
  }
  makeShoe() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(mergeColored([
      [ellipsoid(0.055, 0.045, 0.11), 0xf2f0ea, 0, 0.03, -0.04], [bevelSole(), 0x3b3b3b, 0, -0.012, -0.04],
      [new THREE.TorusGeometry(0.05, 0.009, 6, 18, Math.PI), 0xd8342c, 0, 0.03, -0.04, 0, Math.PI / 2, 0], [new THREE.CylinderGeometry(0.048, 0.05, 0.05, 14), 0xd8342c, 0, 0.06, 0],
    ]), this.M.shoeV); m.castShadow = true; g.add(m);
    return g;
  }
  // 状態から全身の姿勢を作る。st = { body:{x,y}, hands:{L:{x,y,z,curl,held}, R}, feet?, expr, mode, t, wallZ }
  update(dt, st) {
    this.t += dt;
    const bx = st.body.x, by = st.body.y, z0 = 0.36; // 胸の位置は壁から 0.36m
    const L = st.hands.L, R = st.hands.R;
    // 胴の傾き: 両手の高さの差でひねり・傾け、伸ばす側へ身体を寄せる
    const dy = (R.y - L.y);
    const rollT = Math.max(-0.35, Math.min(0.35, -dy * 0.35));
    const twistT = Math.max(-0.3, Math.min(0.3, (R.reach ? 0.18 : 0) - (L.reach ? 0.18 : 0)));
    const leanT = st.mode === 'fall' ? -0.4 : st.mode === 'joy' ? -0.15 : 0.22; // 壁へ少し前傾
    const k = 1 - Math.exp(-dt * 8);
    this.pose.roll += (rollT - this.pose.roll) * k; this.pose.twist += (twistT - this.pose.twist) * k; this.pose.lean += (leanT - this.pose.lean) * k;
    const shoulderC = V(bx, by, z0);
    const torsoQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pose.lean, this.pose.twist, this.pose.roll, 'YXZ'));
    const torsoBase = shoulderC.clone().add(V(0, -0.5, 0).applyQuaternion(torsoQ));
    this.torso.position.copy(torsoBase); this.torso.quaternion.copy(torsoQ); // モデルの前（ファスナー側）は -z＝壁の側。背中の白線がカメラ側
    const hipC = torsoBase.clone().add(V(0, -0.06, 0.0));
    this.pelvis.position.copy(hipC); this.pelvis.quaternion.copy(torsoQ);
    // 首と頭: 見る先（伸ばしている手の先・カメラ・上）へ
    const neckBase = shoulderC.clone().add(V(0, 0.07, 0).applyQuaternion(torsoQ));
    aim(this.neck, neckBase.clone().add(V(0, -0.02, 0)), neckBase.clone().add(V(0, 0.09, 0)));
    const headC = neckBase.clone().add(V(0, 0.2, 0));
    this.head.group.position.copy(headC);
    let look = st.look || V(bx, by + 1.2, -1);
    const fwd = look.clone().sub(headC).normalize();
    const m = new THREE.Matrix4().lookAt(headC, headC.clone().add(fwd), UP); // lookAt は +z を (eye - target) に向ける → 顔（-z 側）が look を向く
    const hq = new THREE.Quaternion().setFromRotationMatrix(m);
    this.head.group.quaternion.slerp(hq, 1 - Math.exp(-dt * 10));
    // まばたきと表情
    this.blinkT -= dt; let blink = 0; if (this.blinkT < 0.12) blink = 1 - Math.abs(this.blinkT - 0.06) / 0.06; if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.head.setExpr(st.expr || 'calm', st.expr === 'joy' ? 0 : Math.max(0, blink));
    for (const t of this.head.tails) t.rotation.x = 0.6 + Math.sin(this.t * 7 + t.position.x * 50) * 0.18 * (st.wind || 1);
    // 腕: 肩から手首まで IK。肘は下・外・やや後ろ
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1, a = this.arms[s], h = st.hands[s];
      const sh = shoulderC.clone().add(V(sg * DIM.shoulderW, -0.02, 0).applyQuaternion(torsoQ));
      const wrist = V(h.x, h.y - 0.075 * (h.held ? 1 : 0.6), (h.z ?? 0.08) + 0.04);
      const pole = sh.clone().add(V(sg * 0.45, -0.5, 0.3));
      const ik = solveTwoBone(DIM.upper, DIM.fore, sh, wrist, pole);
      a.shoulder.position.copy(sh);
      aim(a.up, sh, ik.mid); a.elbow.position.copy(ik.mid); aim(a.fore, ik.mid, ik.end);
      // 手: 保持中は指を上へ・掌を壁へ（縁を包む）、そうでなければ前腕の向き
      const hg = a.hand.group; hg.position.copy(ik.end);
      const fdir = ik.end.clone().sub(ik.mid).normalize();
      const upDir = h.held ? V(sg * 0.12, 1, 0).normalize() : fdir;
      const palmN = V(0, 0, -1);
      const xAxis = new THREE.Vector3().crossVectors(upDir, palmN.clone().negate()).normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, upDir).normalize();
      hg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, upDir, zAxis));
      a.hand.setCurl(h.curl ?? (h.held ? 0.85 : 0.2), h.held ? 0 : 0.6);
    }
    // 脚: 足場（下の保持点・帯）に足先を置く。目標が変わったら弧を描いて踏みかえる
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1, lg = this.legs[s];
      const hip = hipC.clone().add(V(sg * DIM.hipW, -0.04, 0).applyQuaternion(torsoQ));
      let tgt = st.feet && st.feet[s] ? V(st.feet[s].x, st.feet[s].y, 0.13) : V(hip.x + sg * 0.12, hip.y - 0.78, 0.18);
      if (st.mode === 'fall') tgt = V(hip.x + sg * 0.25, hip.y - 0.6 + Math.sin(this.t * 14 + sg) * 0.15, 0.6);
      if (st.mode === 'joy') tgt = V(hip.x + sg * 0.14, Math.max(hip.y - 0.82, st.floorY ?? -99), 0.25);
      if (!lg.pos) lg.pos = tgt.clone();
      if (!lg.target || lg.target.distanceTo(tgt) > 0.05) { lg.from = lg.pos.clone(); lg.target = tgt.clone(); lg.lift = 0; }
      lg.lift = Math.min(1, lg.lift + dt * 5);
      const e = lg.lift * lg.lift * (3 - 2 * lg.lift);
      lg.pos.lerpVectors(lg.from, lg.target, e); lg.pos.z += Math.sin(e * Math.PI) * 0.12; // 足を壁から少し離して運ぶ
      const pole = hip.clone().add(V(sg * 0.25, 0, -0.6));
      const ik = solveTwoBone(DIM.thigh, DIM.shin, hip, lg.pos, pole);
      aim(lg.th, hip, ik.mid); lg.knee.position.copy(ik.mid); aim(lg.sh, ik.mid, ik.end);
      lg.foot.position.copy(ik.end);
      lg.foot.rotation.set(st.mode === 'fall' ? 0.6 : -0.15, 0, 0); // つま先を壁へ
    }
  }
}
function bevelSole() { const g = new THREE.CylinderGeometry(1, 1, 0.022, 20); g.scale(0.058, 1, 0.12); return g; }

// ---- 一人称の手（VR）: 主人公と同じ手袋と袖。前腕の一部まで ----
export class FirstPersonHands {
  constructor(M) {
    this.group = new THREE.Group(); this.hands = {};
    for (const s of ['L', 'R']) {
      const g = new THREE.Group();
      const hand = makeHand(s, M, 1.0);
      const fore = new THREE.Mesh(limbGeo(0.2, 0.04, 0.034), M.sleeve); fore.castShadow = true;
      const cuffSleeve = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.01, 8, 18), M.white); cuffSleeve.rotation.x = Math.PI / 2;
      g.add(hand.group, fore, cuffSleeve);
      this.group.add(g);
      this.hands[s] = { g, hand, fore, cuffSleeve };
    }
  }
  // 手首の位置と向き（コントローラーのグリップ姿勢）、保持中なら保持点に固定
  set(s, pos, quat, curl, heldAt) {
    const h = this.hands[s];
    const p = heldAt || pos;
    h.hand.group.position.copy(p);
    if (heldAt) {
      // 保持中: 指を上に、掌を壁へ（コントローラーの向きに少しだけ追従）
      const sg = s === 'L' ? -1 : 1;
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0), V(sg * 0.1, 1, 0).normalize(), V(0, 0, 1)));
      h.hand.group.quaternion.copy(q);
    } else {
      // コントローラーのグリップ姿勢: -Z が前方。手袋の指（+Y）を前方へ、掌を下へ回す
      const fix = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.25, 0, 0));
      h.hand.group.quaternion.copy(quat).multiply(fix);
    }
    h.hand.setCurl(curl);
    // 前腕は手首から後ろへ（手袋の -Y 方向）
    const back = V(0, -1, 0).applyQuaternion(h.hand.group.quaternion);
    const elbow = h.hand.group.position.clone().add(back.multiplyScalar(0.22));
    aim(h.fore, elbow, h.hand.group.position.clone().add(V(0, -0.025, 0).applyQuaternion(h.hand.group.quaternion)));
    h.cuffSleeve.position.copy(h.hand.group.position.clone().add(V(0, -0.03, 0).applyQuaternion(h.hand.group.quaternion)));
    h.cuffSleeve.quaternion.copy(h.hand.group.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
  }
}

// ---- 窓の住人（上半身）: 'oyaji' はげ頭・口ひげ・肌着、'obachan' カーラー・めがね・割烹着 ----
export class ResidentModel {
  constructor(M, kind = 'oyaji') {
    this.kind = kind; const g = this.group = new THREE.Group(); g.name = 'resident';
    const SK = kind === 'oyaji' ? 0xe9b48c : 0xf2c6a2, CL = kind === 'oyaji' ? 0xf4f1e8 : 0xf6e7f0;
    const skin = new THREE.MeshStandardMaterial({ color: SK, roughness: 0.5 });
    const bodyG = new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.22, 0.2], [0.2, 0.36], [0.12, 0.44], [0, 0.46]].map(([r, y]) => new THREE.Vector2(r, y)), 24); bodyG.scale(1, 1, 0.75);
    const bodyParts = [[bodyG, CL]];
    if (kind === 'oyaji') for (const s of [-1, 1]) bodyParts.push([new THREE.BoxGeometry(0.04, 0.2, 0.01), CL, s * 0.09, 0.4, 0.15]);
    else bodyParts.push([new THREE.PlaneGeometry(0.3, 0.3), 0xffffff, 0, 0.2, 0.17]);
    g.add(new THREE.Mesh(mergeColored(bodyParts), M.fabricV));
    const head = new THREE.Group(); head.position.set(0, 0.6, 0.02); g.add(head); this.head = head;
    // 頭の動かない部品（肌・目・眉・髪・ひげ・カーラー・めがね）を 1 回で
    const hp = [[ellipsoid(0.12, 0.13, 0.115, 28, 20), SK], [ellipsoid(0.11, 0.07, 0.1), SK, 0, -0.06, 0.01], [ellipsoid(0.03, 0.028, 0.03), SK, 0, -0.01, 0.12]];
    for (const s of [-1, 1]) {
      hp.push([ellipsoid(0.025, 0.036, 0.014), SK, s * 0.12, 0, 0], [ellipsoid(0.022, 0.014, 0.01), 0xffffff, s * 0.045, 0.025, 0.105], [ellipsoid(0.009, 0.009, 0.004), 0x050505, s * 0.045, 0.024, 0.115]);
      hp.push([new THREE.BoxGeometry(0.055, 0.016, 0.014), kind === 'oyaji' ? 0x5a5a5a : 0x2a1d17, s * 0.045, 0.055, 0.108, 0, 0, -s * 0.4]); // 怒った眉
    }
    if (kind === 'oyaji') {
      for (const s of [-1, 1]) hp.push([ellipsoid(0.03, 0.045, 0.06), 0x8a8580, s * 0.11, 0.02, -0.02]); // 横に残った髪
      hp.push([ellipsoid(0.055, 0.016, 0.02), 0x4a4540, 0, -0.035, 0.118]); // 口ひげ
    } else {
      hp.push([ellipsoid(0.13, 0.12, 0.125), 0x5b4636, 0, 0.04, -0.015]);
      for (let i = 0; i < 6; i++) { const a = -1.2 + i * 0.48; hp.push([new THREE.CylinderGeometry(0.022, 0.022, 0.07, 12), 0xff8fc0, Math.sin(a) * 0.12, 0.12 - Math.abs(a) * 0.03, Math.cos(a) * 0.05, 0, 0, Math.PI / 2]); }
      for (const s of [-1, 1]) hp.push([new THREE.TorusGeometry(0.028, 0.004, 6, 18), 0x8a5a2b, s * 0.045, 0.025, 0.118]);
    }
    head.add(new THREE.Mesh(mergeColored(hp), M.skinV));
    if (kind === 'oyaji') { const shine = new THREE.Mesh(ellipsoid(0.035, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })); shine.position.set(0.04, 0.11, 0.05); shine.rotation.x = -0.6; head.add(shine); }
    this.mouth = new THREE.Mesh(ellipsoid(0.03, 0.012, 0.01), M.mouth); this.mouth.position.set(0, -0.06, 0.11); head.add(this.mouth);
    // 腕（物を持つ・窓を閉める）
    this.arms = [];
    for (const s of [-1, 1]) {
      const up = new THREE.Group(); up.position.set(s * 0.2, 0.38, 0); g.add(up);
      const u = new THREE.Mesh(limbGeo(0.24, 0.05, 0.045), skin); u.rotation.x = Math.PI; up.add(u);
      const el = new THREE.Group(); el.position.y = -0.24; up.add(el);
      const f = new THREE.Mesh(mergeColored([[limbGeo(0.22, 0.044, 0.038), SK, 0, 0, 0, Math.PI], [ellipsoid(0.045, 0.05, 0.04), SK, 0, -0.25, 0]]), M.skinV); el.add(f);
      this.arms.push({ up, el });
    }
    this.t = 0;
  }
  // mode: 'idle' | 'lean'（身を乗り出して物を構える）| 'throw' | 'close'（窓を引き下ろす）| 'angry'
  update(dt, mode, k = 0) {
    this.t += dt;
    const [l, r] = this.arms;
    const shake = Math.sin(this.t * 18) * 0.15;
    if (mode === 'close') { for (const a of this.arms) { a.up.rotation.set(-2.6 + k * 1.2, 0, 0); a.el.rotation.x = -0.4; } this.head.rotation.set(0.15, 0, 0); }
    else if (mode === 'lean' || mode === 'throw') { const lift = mode === 'throw' ? -0.8 * (1 - k) - 1.4 : -2.4; l.up.rotation.set(lift, 0, 0.2); r.up.rotation.set(lift, 0, -0.2); l.el.rotation.x = r.el.rotation.x = -0.6; this.head.rotation.set(0.35 + shake * 0.2, 0, 0); }
    else if (mode === 'angry') { r.up.rotation.set(-2.5 + shake, 0, -0.2); r.el.rotation.x = -1.2; l.up.rotation.set(-0.2, 0, 0.1); l.el.rotation.x = -0.3; this.head.rotation.set(0.1, shake * 0.5, 0); }
    else { for (const a of this.arms) { a.up.rotation.set(-0.15, 0, 0); a.el.rotation.x = -0.2; } this.head.rotation.set(0, Math.sin(this.t * 1.5) * 0.25, 0); }
    this.mouth.scale.set(1, mode === 'angry' || mode === 'lean' ? 2.4 + Math.abs(shake) * 4 : 1, 1);
  }
}

// ---- 鳥（大きなカモメ風）: 胴・頭・くちばし・翼 2 節 × 2・尾。羽ばたきは翼の付け根と先の位相をずらす ----
export class BirdModel {
  constructor() {
    const g = this.group = new THREE.Group(); g.name = 'bird';
    const wm = new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.7 }), gm = new THREE.MeshStandardMaterial({ color: 0x8e98a6, roughness: 0.7 }),
      bm = new THREE.MeshStandardMaterial({ color: 0xf6b21c, roughness: 0.4 }), km = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.6 });
    const body = new THREE.Mesh(ellipsoid(0.13, 0.11, 0.22), wm); body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(ellipsoid(0.09, 0.085, 0.09), wm); head.position.set(0, 0.09, 0.2); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 10), bm); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.07, 0.31); g.add(beak);
    const spot = new THREE.Mesh(ellipsoid(0.01, 0.012, 0.012), new THREE.MeshStandardMaterial({ color: 0xd2301e })); spot.position.set(0, 0.055, 0.31); g.add(spot);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(ellipsoid(0.022, 0.026, 0.012), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })); e.position.set(s * 0.06, 0.12, 0.25); g.add(e);
      const p = new THREE.Mesh(ellipsoid(0.011, 0.014, 0.006), km); p.position.set(s * 0.068, 0.12, 0.26); g.add(p);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), km); br.position.set(s * 0.06, 0.15, 0.25); br.rotation.z = s * 0.4; g.add(br); // 怒り眉
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), gm); tail.rotation.x = -Math.PI / 2; tail.scale.set(1.4, 1, 0.3); tail.position.set(0, 0.0, -0.26); g.add(tail);
    this.wings = [];
    for (const s of [-1, 1]) {
      const root = new THREE.Group(); root.position.set(s * 0.1, 0.04, 0.02); g.add(root);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), gm); inner.position.x = s * 0.15; root.add(inner);
      const tip = new THREE.Group(); tip.position.x = s * 0.3; root.add(tip);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.14), gm); outer.position.x = s * 0.14; tip.add(outer);
      const black = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.12), km); black.position.x = s * 0.25; tip.add(black);
      inner.castShadow = outer.castShadow = true;
      this.wings.push({ root, tip, s });
    }
    this.t = Math.random() * 10;
  }
  update(dt, speed = 1) {
    this.t += dt * speed;
    const a = Math.sin(this.t * 11), b = Math.sin(this.t * 11 - 0.9);
    for (const w of this.wings) { w.root.rotation.z = w.s * a * 0.75; w.tip.rotation.z = w.s * b * 0.6; }
    this.group.position.y += Math.cos(this.t * 11) * 0.002;
  }
}

// ---- ヘリコプターとパイロット（屋上で待つ。クリアでつかまって飛び立つ） ----
export class HelicopterModel {
  constructor(M) {
    const g = this.group = new THREE.Group(); g.name = 'heli';
    const bodyM = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.3, roughness: 0.35 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9cc8e6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.45 });
    const body = new THREE.Mesh(ellipsoid(0.9, 0.75, 1.3), bodyM); body.castShadow = true; g.add(body);
    const bubble = new THREE.Mesh(ellipsoid(0.78, 0.62, 0.7, 24, 16), glass); bubble.position.set(0, 0.15, 0.75); g.add(bubble);
    const boom = new THREE.Mesh(limbGeo(2.6, 0.22, 0.08), bodyM); boom.rotation.x = -Math.PI / 2; boom.position.set(0, 0.2, -1.0); g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.4), bodyM); fin.position.set(0, 0.5, -3.5); g.add(fin);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.08), dark); this.tailRotor.position.set(0.1, 0.45, -3.5); g.add(this.tailRotor);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 10), dark); mast.position.set(0, 0.85, 0); g.add(mast);
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.05, 0); g.add(this.rotor);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.03, 0.22), dark); b.rotation.y = i * Math.PI / 2; this.rotor.add(b); }
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 10), dark); sk.rotation.x = Math.PI / 2; sk.position.set(s * 0.7, -0.95, 0); g.add(sk);
      for (const z of [-0.6, 0.6]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), dark); st.position.set(s * 0.62, -0.78, z); st.rotation.z = s * 0.4; g.add(st); } }
    // 「SKY」のロゴは文字ではなく帯で
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 8, 40), new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.4 })); stripe.rotation.y = Math.PI / 2; stripe.scale.set(1, 0.85, 1.45); g.add(stripe);
    // パイロット（ヘルメットとゴーグル、手を振る）
    const pilot = new THREE.Group(); pilot.position.set(0.25, 0.05, 0.75); g.add(pilot);
    pilot.add(new THREE.Mesh(ellipsoid(0.17, 0.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 0.8 })));
    const ph = new THREE.Mesh(ellipsoid(0.11, 0.12, 0.11), M.skin); ph.position.y = 0.3; pilot.add(ph);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); helm.position.y = 0.32; pilot.add(helm);
    const gog = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 14), dark); gog.position.set(0, 0.35, 0.1); pilot.add(gog);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14, Math.PI), M.mouth); smile.rotation.z = Math.PI; smile.position.set(0, 0.26, 0.105); pilot.add(smile);
    this.wave = new THREE.Group(); this.wave.position.set(0.17, 0.12, 0); pilot.add(this.wave);
    const arm = new THREE.Mesh(limbGeo(0.3, 0.04, 0.035), new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 0.8 })); this.wave.add(arm);
    const gl = new THREE.Mesh(ellipsoid(0.045, 0.05, 0.035), M.glove); gl.position.y = 0.32; this.wave.add(gl);
    this.t = 0;
  }
  update(dt, spin = 1) { this.t += dt; this.rotor.rotation.y += dt * 28 * spin; this.tailRotor.rotation.x += dt * 40 * spin; this.wave.rotation.z = -0.6 + Math.sin(this.t * 8) * 0.5; }
}
