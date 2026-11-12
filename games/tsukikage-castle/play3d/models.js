// 月影の魔城 — 3D モデル（すべて計算で組み立てる。外部モデル・既存作品の造形は使わない）
// 2D 版と同じ造形の意図（兜の羽根・青いマント・角・翼・牙・骨）を立体にした。骨格は shared/anim.js のポーズで動かす。
// 座標: 1u = 1 タイル。足元が原点、+x が向いている方向、+y 上、+z 手前（カメラ側）。
import * as THREE from 'three';
import { knightPose, BONES, enemyAnim } from '../shared/anim.js';

const V = (x, y) => new THREE.Vector2(x, y);
const TAU = Math.PI * 2;
export const MAT = {};
export function makeMaterials(envMap) {
  const std = (o) => new THREE.MeshStandardMaterial({ envMap, envMapIntensity: 1, ...o });
  Object.assign(MAT, {
    steel: std({ color: 0xc8d4e4, metalness: 0.9, roughness: 0.28 }),
    steelDark: std({ color: 0x6b7a90, metalness: 0.85, roughness: 0.4 }),
    gold: std({ color: 0xd8b25a, metalness: 0.9, roughness: 0.3 }),
    cape: std({ color: 0x2f4fb8, roughness: 0.8, side: THREE.DoubleSide }),
    plume: std({ color: 0xe8442c, roughness: 0.7 }),
    tunic: std({ color: 0xb03434, roughness: 0.85 }),
    trousers: std({ color: 0x3a3242, roughness: 0.9 }),
    skin: std({ color: 0xf0c8a0, roughness: 0.7 }),
    hair: std({ color: 0x5a3a22, roughness: 0.9 }),
    leather: std({ color: 0x4a3322, roughness: 0.8 }),
    visor: std({ color: 0x0a0d14, roughness: 0.5 }),
    eyeGlow: new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    eyeRed: new THREE.MeshBasicMaterial({ color: 0xff4030 }),
    eyeGreen: new THREE.MeshBasicMaterial({ color: 0xd8ff6a }),
    eyeBlue: new THREE.MeshBasicMaterial({ color: 0xa8dcff }),
    ghoul: std({ color: 0x7f9a78, roughness: 0.9 }), ghoulDark: std({ color: 0x4a5f48, roughness: 0.9 }), rag: std({ color: 0x3d2f3a, roughness: 1, side: THREE.DoubleSide }),
    bone: std({ color: 0xe8e0c8, roughness: 0.6 }), boneDark: std({ color: 0xa89e84, roughness: 0.7 }), socket: std({ color: 0x1a1010, roughness: 1 }),
    imp: std({ color: 0xc8384a, roughness: 0.6 }), wing: std({ color: 0x4a1a3e, roughness: 0.8, side: THREE.DoubleSide }), horn: std({ color: 0xf0dcb0, roughness: 0.5 }),
    fur: std({ color: 0x3a2c34, roughness: 1 }), furDark: std({ color: 0x1e161a, roughness: 1 }), tusk: std({ color: 0xf4ecd6, roughness: 0.4 }),
    robe: std({ color: 0x5a3590, roughness: 0.85, side: THREE.DoubleSide }), mask: std({ color: 0xe8dcc0, roughness: 0.5 }),
    frog: std({ color: 0x6aaf3e, roughness: 0.55 }), belly: std({ color: 0xe8d27a, roughness: 0.6 }),
    brute: std({ color: 0x7a5a5a, roughness: 0.8 }), iron: std({ color: 0x8a949e, metalness: 0.8, roughness: 0.45 }),
    stone: std({ color: 0x8d8a96, roughness: 0.95 }), stoneDark: std({ color: 0x4c4a56, roughness: 1 }),
    wood: std({ color: 0x7a5a34, roughness: 0.85 }), straw: std({ color: 0xb89a50, roughness: 0.9 }),
    coat: std({ color: 0x5a4a3a, roughness: 0.95 }), witch: std({ color: 0x2a1d48, roughness: 0.85, side: THREE.DoubleSide }), hag: std({ color: 0x9ac08a, roughness: 0.7 }),
    swamp: std({ color: 0x3f7a74, roughness: 0.5 }), swampBelly: std({ color: 0xc8c890, roughness: 0.6 }),
    bronze: std({ color: 0xc88a3a, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
    blackIron: std({ color: 0x2a2228, metalness: 0.7, roughness: 0.45 }), ember: new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
    lordRobe: std({ color: 0x2a1a4a, roughness: 0.8, side: THREE.DoubleSide }), lordFace: std({ color: 0xd8d0e8, roughness: 0.5 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
  });
  return MAT;
}
// 被弾で白く光らせる（全メッシュの emissive を一時的に上げる）
export function setFlash(group, k) {
  if (group.userData.flashK === k) return;
  group.userData.flashK = k;
  group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.emissive) return;
    if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; }
    o.material.emissive.setRGB(k, k, k);
  });
}
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const pivot = (parent, x, y, z = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
const cap = (r, len, mat) => { const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10); g.translate(0, -len / 2, 0); return mesh(g, mat); };
const lathe = (pts, mat, seg = 18) => mesh(new THREE.LatheGeometry(pts.map(([x, y]) => V(x, y)), seg), mat);
const sph = (r, mat, sx = 1, sy = 1, sz = 1) => { const m = mesh(new THREE.SphereGeometry(r, 16, 12), mat); m.scale.set(sx, sy, sz); return m; };
const cone = (r, h, mat, seg = 10) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return mesh(g, mat); };
function extrude(shape, depth, mat, bevel = 0.02) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}
const shapeOf = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };

// ================================================================ 騎士
export function buildKnight() {
  const root = new THREE.Group(); root.name = 'knight';
  const body = pivot(root, 0, 0.78); // 腰
  const parts = { root, body };
  // 脚: 腿 → すね → 足
  const leg = (side) => {
    const hip = pivot(body, 0, 0, side * 0.1);
    const thighA = cap(0.1, BONES.thigh, MAT.steel), thighC = cap(0.085, BONES.thigh, MAT.trousers); hip.add(thighA, thighC);
    const knee = pivot(hip, 0, -BONES.thigh);
    const kneeCap = sph(0.085, MAT.steel, 1, 0.9, 1); kneeCap.position.x = 0.04; knee.add(kneeCap);
    const shinA = cap(0.09, BONES.shin, MAT.steel), shinC = cap(0.075, BONES.shin, MAT.trousers); knee.add(shinA, shinC);
    const foot = pivot(knee, 0, -BONES.shin);
    const s = shapeOf([[-0.08, 0.04], [0.12, 0.06], [0.2, 0.0], [0.19, -0.06], [-0.09, -0.06]]);
    const footA = extrude(s, 0.12, MAT.steelDark, 0.015), footC = extrude(s, 0.11, MAT.leather, 0.01); foot.add(footA, footC);
    return { hip, knee, foot, armor: [thighA, shinA, kneeCap, footA], cloth: [thighC, shinC, footC] };
  };
  parts.legF = leg(1); parts.legB = leg(-1);
  // 胴: 胸当て（回転体を前後につぶす）と草摺
  const torso = pivot(body, 0, 0);
  parts.torso = torso;
  const chest = lathe([[0.0, 0.0], [0.17, 0.02], [0.21, 0.12], [0.24, 0.3], [0.23, 0.42], [0.16, 0.5], [0.0, 0.52]], MAT.steel, 20); chest.scale.set(1, 1, 0.72); torso.add(chest);
  const ridge = mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), MAT.gold, 0.2, 0.25, 0); ridge.rotation.z = -0.15; torso.add(ridge);
  const faulds = [];
  for (let i = 0; i < 2; i++) { const f = mesh(new THREE.CylinderGeometry(0.21 + i * 0.02, 0.23 + i * 0.03, 0.09, 18, 1, true), MAT.steelDark, 0, -0.02 - i * 0.08, 0); f.scale.z = 0.75; f.material = MAT.steelDark; torso.add(f); faulds.push(f); }
  const belt = mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), MAT.leather, 0, 0.04, 0); belt.rotation.x = Math.PI / 2; belt.scale.y = 0.75; torso.add(belt);
  const tunic = lathe([[0.0, -0.12], [0.2, -0.12], [0.21, 0.2], [0.2, 0.45], [0.12, 0.5], [0, 0.5]], MAT.tunic, 16); tunic.scale.z = 0.7; torso.add(tunic);
  parts.armorTorso = [chest, ridge, ...faulds, belt]; parts.clothTorso = [tunic];
  // 肩と腕
  const neck = pivot(torso, 0, BONES.torso);
  parts.neck = neck;
  const arm = (side) => {
    const sh = pivot(torso, 0.0, BONES.torso * 0.88, side * 0.2);
    const pauldron = mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, TAU, 0, Math.PI * 0.55), MAT.steel); pauldron.scale.set(1.1, 0.9, 1); sh.add(pauldron);
    const upA = cap(0.075, BONES.upper, MAT.steel), upC = cap(0.07, BONES.upper, MAT.skin); sh.add(upA, upC);
    const el = pivot(sh, 0, -BONES.upper);
    const foA = cap(0.07, BONES.fore, MAT.steelDark), foC = cap(0.062, BONES.fore, MAT.skin); el.add(foA, foC);
    const hand = pivot(el, 0, -BONES.fore);
    const gA = sph(0.07, MAT.steelDark, 1, 1.1, 1), gC = sph(0.06, MAT.skin); hand.add(gA, gC);
    return { sh, el, hand, armor: [pauldron, upA, foA, gA], cloth: [upC, foC, gC] };
  };
  parts.armF = arm(1); parts.armB = arm(-1);
  // 頭: 兜（丸い鉢＋面頬＋のぞき穴＋羽根）と素顔
  const head = pivot(neck, 0, 0.17);
  parts.head = head;
  const helm = lathe([[0, -0.2], [0.17, -0.2], [0.22, -0.08], [0.23, 0.06], [0.19, 0.18], [0.1, 0.24], [0, 0.25]], MAT.steel, 22); head.add(helm);
  const visorPlate = lathe([[0, -0.19], [0.12, -0.18], [0.16, -0.06], [0.14, 0.04], [0.0, 0.06]], MAT.steel, 14); visorPlate.rotation.z = -Math.PI / 2; visorPlate.position.set(0.17, -0.02, 0); visorPlate.scale.set(1, 0.6, 1.4); head.add(visorPlate);
  const slit = mesh(new THREE.BoxGeometry(0.06, 0.035, 0.26), MAT.visor, 0.24, 0.0, 0); head.add(slit);
  const eye = mesh(new THREE.BoxGeometry(0.02, 0.012, 0.05), MAT.eyeBlue, 0.27, 0.0, 0.05); head.add(eye);
  const plumeG = new THREE.Group(); plumeG.position.set(-0.02, 0.22, 0); head.add(plumeG);
  for (let i = 0; i < 6; i++) { const p = sph(0.07 - i * 0.006, MAT.plume, 1.6, 0.8, 0.7); p.position.set(-0.07 * i, 0.04 + Math.sin(i * 0.6) * 0.06 - i * 0.012, 0); plumeG.add(p); }
  const face = sph(0.19, MAT.skin, 1, 1.05, 0.95); face.position.set(0.02, 0.0, 0); head.add(face);
  const hair = sph(0.2, MAT.hair, 1, 0.7, 0.98); hair.position.set(-0.03, 0.08, 0); head.add(hair);
  const eyeL = sph(0.03, MAT.visor); eyeL.position.set(0.18, 0.04, 0.07); head.add(eyeL);
  const nose = sph(0.04, MAT.skin); nose.position.set(0.21, -0.01, 0); head.add(nose);
  parts.armorHead = [helm, visorPlate, slit, eye, plumeG]; parts.clothHead = [face, hair, eyeL, nose];
  parts.plume = plumeG;
  // マント（頂点を毎フレーム曲げる 4×8 の板）
  const capeGeo = new THREE.PlaneGeometry(0.4, 0.85, 4, 8); capeGeo.translate(0, -0.425, 0);
  const capeM = mesh(capeGeo, MAT.cape); capeM.rotation.y = Math.PI / 2; capeM.position.set(-0.17, BONES.torso * 0.95, 0); torso.add(capeM);
  parts.cape = capeM; parts.capeBase = capeGeo.attributes.position.array.slice();
  // 手に持つ武器（投げの瞬間に見せる）
  parts.held = {};
  for (const w of ['lance', 'dagger', 'axe', 'torch']) { const g = buildWeapon(w); g.rotation.z = Math.PI; g.scale.setScalar(0.8); g.visible = false; parts.armF.hand.add(g); parts.held[w] = g; }
  root.userData.parts = parts;
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}
export function poseKnight(model, p, time, weapon) {
  const P = knightPose(p, time), q = model.userData.parts;
  const armor = p.armor;
  for (const l of [q.legF, q.legB, q.armF, q.armB]) { l.armor.forEach((m) => (m.visible = armor)); l.cloth.forEach((m) => (m.visible = !armor)); }
  q.armorTorso.forEach((m) => (m.visible = armor)); q.clothTorso.forEach((m) => (m.visible = !armor));
  q.armorHead.forEach((m) => (m.visible = armor)); q.clothHead.forEach((m) => (m.visible = !armor));
  q.cape.visible = armor;
  q.body.position.y = P.hipY + P.bob;
  q.torso.rotation.z = -P.lean;
  q.torso.scale.y = P.squash;
  q.head.rotation.z = -P.head * 0.6;
  // 脚・腕（角度は「真下 0・前 +」。three の z 回転は反時計回りが + なので、そのまま前へ振れる）
  q.legF.hip.rotation.z = P.legF[0] + P.lean * 0; q.legF.knee.rotation.z = -P.legF[1]; q.legF.foot.rotation.z = P.legF[1] - P.legF[0];
  q.legB.hip.rotation.z = P.legB[0]; q.legB.knee.rotation.z = -P.legB[1]; q.legB.foot.rotation.z = P.legB[1] - P.legB[0];
  // 腕は胴の中で付いているので、胴の傾きを打ち消して世界基準の角度にする
  q.armF.sh.rotation.z = P.armF[0] + P.lean; q.armF.el.rotation.z = -P.armF[1];
  q.armB.sh.rotation.z = P.armB[0] + P.lean; q.armB.el.rotation.z = -P.armB[1];
  q.legF.hip.rotation.z -= 0; // 腰は胴に付けていないので傾きの補正は不要
  if (P.climb) { q.armF.sh.position.z = 0.2; q.armB.sh.position.z = -0.2; }
  q.plume.rotation.z = P.plume;
  for (const k of Object.keys(q.held)) q.held[k].visible = P.throwK > 0.2 && k === weapon;
  // マント: 根元は固定、先ほど P.cape の角度で後ろへなびく
  const pos = q.cape.geometry.attributes.position, base = q.capeBase;
  for (let i = 0; i < pos.count; i++) {
    const y = base[i * 3 + 1], k = -y / 0.85; // 0（根元）〜1（裾）
    const a = P.cape * k * k * 1.2 + Math.sin(time * 6 + k * 3) * 0.05 * k;
    pos.array[i * 3 + 2] = base[i * 3 + 2] - Math.sin(a) * -y; // 板の法線方向（= 後ろ）へ
    pos.array[i * 3 + 1] = y * Math.cos(a);
  }
  pos.needsUpdate = true;
  return P;
}

// ================================================================ 武器
export function buildWeapon(kind) {
  const g = new THREE.Group();
  if (kind === 'lance') {
    const shaft = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), MAT.wood); shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.15; g.add(shaft);
    const tip = cone(0.07, 0.32, MAT.steel, 8); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.35; g.add(tip);
  } else if (kind === 'dagger') {
    const blade = cone(0.05, 0.36, MAT.steel, 4); blade.rotation.z = -Math.PI / 2; blade.scale.z = 0.3; g.add(blade);
    const guard = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.05), MAT.gold, 0, 0, 0); g.add(guard);
    const grip = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), MAT.leather); grip.rotation.z = Math.PI / 2; grip.position.x = -0.12; g.add(grip);
  } else if (kind === 'axe') {
    const h = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6), MAT.wood); g.add(h);
    const head = extrude(shapeOf([[0, 0.3], [0.28, 0.4], [0.32, 0.05], [0, 0.14]]), 0.04, MAT.steel, 0.01); g.add(head);
  } else if (kind === 'torch') {
    const h = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.4, 6), MAT.wood); g.add(h);
    const f = sph(0.1, MAT.ember, 1, 1.4, 1); f.position.y = 0.25; g.add(f);
  }
  return g;
}

// ================================================================ 敵
const E = {};
E.ghoul = () => {
  const g = new THREE.Group(), q = {};
  q.legs = [-1, 1].map((s) => { const p = pivot(g, 0, 0.75, s * 0.12); p.add(cap(0.09, 0.75, s > 0 ? MAT.ghoul : MAT.ghoulDark)); return p; });
  q.body = pivot(g, 0, 0.72); q.body.rotation.z = -0.5;
  const t = lathe([[0, 0], [0.22, 0.02], [0.26, 0.3], [0.2, 0.62], [0, 0.66]], MAT.ghoul, 12); t.scale.z = 0.8; q.body.add(t);
  const rag = mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.36, 10, 1, true), MAT.rag, 0, -0.05, 0); q.body.add(rag);
  q.head = pivot(q.body, 0.05, 0.75); q.head.add(sph(0.2, MAT.ghoul, 1.05, 0.95, 0.9));
  const e1 = sph(0.035, MAT.eyeGreen); e1.position.set(0.17, 0.03, 0.08); q.head.add(e1); const e2 = sph(0.03, MAT.eyeGreen); e2.position.set(0.17, 0.03, -0.08); q.head.add(e2);
  const jaw = sph(0.08, MAT.socket, 1, 0.5, 1); jaw.position.set(0.16, -0.09, 0); q.head.add(jaw);
  q.arms = [-1, 1].map((s) => { const p = pivot(q.body, 0.05, 0.55, s * 0.2); p.add(cap(0.06, 0.55, MAT.ghoul)); p.rotation.z = 1.9; return p; });
  q.mound = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 6, 0, TAU, 0, Math.PI / 2), MAT.leather); q.mound.scale.y = 0.4; g.add(q.mound);
  g.userData.q = q; return g;
};
E.skeleton = () => {
  const g = new THREE.Group(), q = {};
  q.legs = [-1, 1].map((s) => { const p = pivot(g, 0, 0.8, s * 0.1); p.add(cap(0.035, 0.8, MAT.bone)); return p; });
  g.add(mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), MAT.bone, 0, 0.8, 0));
  const spine = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), MAT.boneDark, 0, 1.1, 0); g.add(spine);
  for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(0.16 - i * 0.012, 0.022, 5, 14, Math.PI * 1.4), MAT.bone, 0.02, 1.0 + i * 0.1, 0); r.rotation.set(Math.PI / 2, 0, Math.PI * 0.8); g.add(r); }
  q.arm = pivot(g, 0.04, 1.32, 0.15); q.arm.add(cap(0.03, 0.5, MAT.bone));
  q.held = buildBone(); q.held.position.y = -0.5; q.arm.add(q.held);
  const a2 = pivot(g, -0.04, 1.32, -0.15); a2.add(cap(0.03, 0.45, MAT.boneDark)); a2.rotation.z = -0.3;
  q.head = pivot(g, 0.05, 1.56); q.head.add(sph(0.19, MAT.bone, 1, 0.95, 0.9));
  for (const z of [0.07, -0.07]) { const s = sph(0.055, MAT.socket); s.position.set(0.14, 0.02, z); q.head.add(s); const e = sph(0.022, MAT.eyeRed); e.position.set(0.17, 0.02, z); q.head.add(e); }
  const jaw = mesh(new THREE.BoxGeometry(0.16, 0.07, 0.16), MAT.bone, 0.08, -0.17, 0); q.head.add(jaw);
  g.userData.q = q; return g;
};
export function buildBone() { const b = new THREE.Group(); b.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), MAT.bone)); for (const y of [-0.17, 0.17]) for (const x of [-0.035, 0.035]) b.add(sph(0.045, MAT.bone).translateX(x).translateY(y)); return b; }
const batWing = () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.45, 0.35); s.lineTo(0.95, 0.15); s.quadraticCurveTo(0.8, -0.05, 0.65, 0.02); s.quadraticCurveTo(0.48, -0.15, 0.32, 0.0); s.quadraticCurveTo(0.18, -0.08, 0, -0.08); s.closePath(); return new THREE.ShapeGeometry(s); };
E.imp = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0.4); q.body.add(sph(0.24, MAT.imp, 0.95, 1.1, 0.9));
  for (const s of [-1, 1]) { const h = cone(0.05, 0.28, MAT.horn, 6); h.position.set(0.04, 0.18, s * 0.1); h.rotation.set(s * 0.3, 0, -0.4); q.body.add(h); }
  for (const z of [0.08, -0.08]) { const e = sph(0.04, MAT.eyeGlow); e.position.set(0.19, 0.06, z); q.body.add(e); }
  const grin = mesh(new THREE.TorusGeometry(0.1, 0.018, 4, 12, Math.PI), MAT.horn, 0.18, -0.06, 0); grin.rotation.set(0, Math.PI / 2, Math.PI); q.body.add(grin);
  q.wings = [-1, 1].map((s) => { const p = pivot(q.body, -0.02, 0.05, s * 0.12); const w = mesh(batWing(), MAT.wing); w.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; p.add(w); return p; });
  const tail = cap(0.025, 0.4, MAT.imp); tail.position.set(-0.1, -0.15, 0); tail.rotation.z = -0.6; q.body.add(tail);
  g.userData.q = q; return g;
};
E.beast = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0.62);
  const torso = cap(0.36, 1.5, MAT.fur); torso.rotation.z = Math.PI / 2; torso.position.x = -0.75; torso.scale.set(1, 1, 0.8); q.body.add(torso);
  for (let i = 0; i < 7; i++) { const sp = cone(0.07, 0.25, MAT.furDark, 5); sp.position.set(-0.55 + i * 0.16, 0.3, 0); sp.rotation.z = 0.3; q.body.add(sp); }
  q.head = pivot(q.body, 0.72, 0.1);
  const skull = mesh(new THREE.ConeGeometry(0.26, 0.55, 8), MAT.fur); skull.rotation.z = -Math.PI / 2; skull.position.x = 0.15; skull.scale.z = 0.8; q.head.add(skull);
  for (const z of [0.1, -0.1]) { const t = cone(0.04, 0.22, MAT.tusk, 6); t.position.set(0.32, -0.12, z); t.rotation.z = 0.5; q.head.add(t); const e = sph(0.04, MAT.eyeGlow); e.position.set(0.18, 0.08, z * 1.2); q.head.add(e); q.eyes = (q.eyes || []).concat(e); }
  q.legs = [[-0.55, 1], [-0.55, -1], [0.45, 1], [0.45, -1]].map(([x, s]) => { const p = pivot(q.body, x, -0.15, s * 0.2); p.add(cap(0.09, 0.5, MAT.furDark)); return p; });
  g.userData.q = q; return g;
};
E.caster = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0);
  const robe = lathe([[0.42, 0.0], [0.34, 0.4], [0.24, 0.9], [0.2, 1.25], [0.18, 1.4], [0.0, 1.62]], MAT.robe, 14); robe.scale.z = 0.8; q.body.add(robe);
  const hood = sph(0.22, MAT.robe, 1, 1.15, 1); hood.position.set(0, 1.42, 0); q.body.add(hood);
  const m = sph(0.13, MAT.mask, 0.7, 1.1, 0.9); m.position.set(0.14, 1.35, 0); q.body.add(m);
  for (const z of [0.05, -0.05]) { const e = sph(0.02, MAT.eyeRed); e.position.set(0.23, 1.38, z); q.body.add(e); }
  q.arm = pivot(q.body, 0.12, 1.1, 0.12); q.arm.add(cap(0.07, 0.42, MAT.robe)); q.arm.rotation.z = 1.3;
  q.orb = sph(0.12, new THREE.MeshBasicMaterial({ color: 0xd8a0ff, transparent: true, opacity: 0.9 })); q.orb.position.y = -0.48; q.arm.add(q.orb);
  g.userData.q = q; return g;
};
E.hopper = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0);
  q.body.add(sph(0.46, MAT.frog, 1, 0.78, 0.95).translateY(0.42));
  q.body.add(sph(0.3, MAT.belly, 1, 0.65, 0.85).translateY(0.3).translateX(0.15));
  for (const z of [0.18, -0.18]) { const e = sph(0.11, MAT.mask); e.position.set(0.24, 0.7, z); q.body.add(e); const p = sph(0.05, MAT.socket); p.position.set(0.33, 0.7, z); q.body.add(p); const h = cone(0.05, 0.3, MAT.horn, 6); h.position.set(0.1, 0.78, z * 1.4); h.rotation.set(z * 1.5, 0, -0.2); q.body.add(h); }
  q.legs = [-1, 1].map((s) => { const p = pivot(q.body, -0.1, 0.25, s * 0.32); p.add(cap(0.09, 0.3, MAT.frog)); return p; });
  g.userData.q = q; return g;
};
E.brute = () => {
  const g = new THREE.Group(), q = {};
  q.legs = [-1, 1].map((s) => { const p = pivot(g, 0, 0.85, s * 0.24); p.add(cap(0.15, 0.85, MAT.brute)); return p; });
  q.body = pivot(g, 0, 0.85);
  const torso = lathe([[0, 0], [0.5, 0.05], [0.62, 0.5], [0.55, 0.95], [0.3, 1.05], [0, 1.05]], MAT.brute, 14); torso.scale.z = 0.75; q.body.add(torso);
  const plate = mesh(new THREE.BoxGeometry(0.2, 0.45, 0.85), MAT.iron, 0.48, 0.55, 0); q.body.add(plate);
  q.head = pivot(q.body, 0.12, 1.2);
  q.head.add(sph(0.3, MAT.iron, 1, 0.85, 0.95));
  for (const z of [0.2, -0.2]) { const h = cone(0.06, 0.4, MAT.horn, 6); h.position.set(0, 0.18, z); h.rotation.set(z * 2.2, 0, 0.2); q.head.add(h); const e = sph(0.035, MAT.eyeRed); e.position.set(0.27, 0.0, z * 0.5); q.head.add(e); }
  q.arm = pivot(q.body, 0.25, 0.85, 0.48); q.arm.add(cap(0.1, 0.55, MAT.brute));
  const club = new THREE.Group(); club.position.y = -0.5; q.arm.add(club);
  club.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), MAT.wood).translateY(-0.2));
  const head = mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.85, 10), MAT.iron); head.position.y = -0.85; club.add(head);
  for (let i = 0; i < 8; i++) { const s = cone(0.05, 0.16, MAT.horn, 5); const a = (i / 8) * TAU; s.position.set(Math.cos(a) * 0.2, -0.65 - (i % 2) * 0.35, Math.sin(a) * 0.2); s.rotation.set(Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57); club.add(s); }
  g.userData.q = q; return g;
};
E.turret = () => {
  const g = new THREE.Group(), q = {};
  q.root = pivot(g, 0, 0);
  q.root.add(lathe([[0.5, 0], [0.5, 0.12], [0.4, 0.16], [0.42, 0.3], [0, 0.3]], MAT.stoneDark, 10));
  const head = lathe([[0, 0.3], [0.42, 0.32], [0.48, 0.7], [0.42, 1.05], [0.2, 1.22], [0, 1.25]], MAT.stone, 12); head.scale.z = 0.85; q.root.add(head);
  for (const z of [0.18, -0.18]) { const e = sph(0.06, MAT.eyeGlow); e.position.set(0.38, 0.95, z); q.root.add(e); }
  for (const z of [0.25, -0.25]) { const h = cone(0.07, 0.35, MAT.stoneDark, 6); h.position.set(-0.1, 1.1, z); h.rotation.set(z * 1.6, 0, 0.5); q.root.add(h); }
  q.mouth = sph(0.13, new THREE.MeshBasicMaterial({ color: 0x401010 }), 0.6, 0.6, 1.2); q.mouth.position.set(0.42, 0.62, 0); q.root.add(q.mouth);
  g.userData.q = q; return g;
};
export function buildEnemy(type) { const g = E[type](); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; }

export function poseEnemy(g, e, time) {
  const q = g.userData.q, A = enemyAnim(e, time);
  g.position.x += A.shake;
  const s = Math.sin(A.walk * 1.5);
  switch (e.type) {
    case 'ghoul': {
      let rise = 1; if (e.st === 'emerge') rise = Math.min(1, e.t / 0.7); if (e.st === 'sink') rise = 1 - Math.min(1, e.t / 0.6);
      q.body.position.y = 0.72 - 1.6 * (1 - rise); q.legs.forEach((l, i) => { l.position.y = 0.75 - 1.6 * (1 - rise); l.rotation.z = (i ? 1 : -1) * s * 0.4; });
      q.arms.forEach((a, i) => (a.rotation.z = 1.9 + Math.sin(time * 4 + e.phase + i) * 0.2));
      q.mound.visible = e.st === 'emerge' || e.st === 'sink'; q.mound.scale.set(rise < 1 ? 1 : 0.01, 0.4 * (rise < 1 ? 1 : 0.01), 1);
      break;
    }
    case 'skeleton': {
      const walk = e.st === 'walk' ? s : 0; q.legs.forEach((l, i) => (l.rotation.z = (i ? 1 : -1) * walk * 0.5));
      const raise = e.st === 'windup' ? Math.min(1, e.t / 0.4) : e.st === 'recover' ? Math.max(0, 1 - e.t * 4) : 0;
      q.arm.rotation.z = -0.3 + raise * 2.8; q.held.visible = raise > 0.2;
      q.head.rotation.z = Math.sin(time * 3 + e.phase) * 0.08;
      break;
    }
    case 'imp': {
      const warn = e.st === 'warn', dive = e.st === 'dive';
      const flap = Math.sin(time * (warn ? 30 : 14) + e.phase) * (dive ? 0.2 : 1);
      q.wings.forEach((w, i) => (w.rotation.x = (i ? -1 : 1) * (0.2 + flap * 0.7)));
      q.body.rotation.z = dive ? -0.6 : 0; q.body.scale.setScalar(warn ? 1 + Math.sin(time * 30) * 0.06 : 1);
      break;
    }
    case 'beast': {
      const ch = e.st === 'charge', wind = e.st === 'windup';
      q.body.position.y = 0.62 - (wind ? 0.16 * Math.min(1, e.t * 3) : 0);
      q.legs.forEach((l, i) => (l.rotation.z = ch ? Math.sin(time * 26 + i * 1.6) * 0.9 : wind && i >= 2 ? Math.sin(time * 18) * 0.5 : Math.sin(A.walk * 2 + i * 1.6) * 0.25));
      q.head.rotation.z = wind ? 0.25 : ch ? -0.15 : 0;
      q.eyes.forEach((m) => (m.material = wind || ch ? MAT.eyeRed : MAT.eyeGlow));
      break;
    }
    case 'caster': {
      let a = 1; if (e.st === 'appear') a = Math.min(1, e.t / 0.45); if (e.st === 'vanish') a = 1 - Math.min(1, e.t / 0.4); if (e.st === 'hidden') a = 0;
      g.visible = a > 0.02; q.body.scale.set(a, 1, a);
      q.body.position.y = Math.sin(time * 2.5) * 0.04;
      const cast = e.st === 'cast' ? Math.min(1, e.t / 0.85) : 0;
      q.arm.rotation.z = 1.3 + cast * 0.4; q.orb.scale.setScalar(0.6 + cast * 1.6 + Math.sin(time * 20) * 0.1);
      break;
    }
    case 'hopper': {
      g.visible = e.st !== 'under' && e.st !== 'bubble';
      const air = e.st === 'hop' || e.st === 'leap', sq = e.st === 'wait' ? 1 - 0.18 * Math.min(1, e.t / 0.6) : air ? 1.12 : 1;
      q.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      q.legs.forEach((l) => (l.rotation.z = air ? -0.6 : 0.3));
      break;
    }
    case 'brute': {
      const wind = e.st === 'windup' ? Math.min(1, e.t / 0.6) : 0, smash = e.st === 'smash', rec = e.st === 'recover';
      const walk = e.st === 'walk' ? s : 0; q.legs.forEach((l, i) => (l.rotation.z = (i ? 1 : -1) * walk * 0.3));
      q.arm.rotation.z = smash ? 2.2 : wind ? -2.0 * wind - 0.4 : rec ? 2.2 - Math.min(1, e.t) * 1.6 : 0.5;
      q.body.rotation.z = smash ? -0.25 : wind ? 0.15 * wind : 0;
      break;
    }
    case 'turret': {
      const warn = e.st === 'warn' ? Math.min(1, e.t / 0.6) : 0;
      q.mouth.material.color.setRGB(0.25 + warn * 0.75, 0.06 + warn * 0.3, 0.05);
      q.root.rotation.z = e.down ? Math.PI : 0; q.root.position.y = e.down ? 1.2 : 0;
      break;
    }
  }
  const dead = A.dead;
  if (dead > 0) { g.scale.set(1 + dead * 0.4, 1 - dead * 0.7, 1 + dead * 0.4); g.position.y += dead * 0.3; }
  setFlash(g, A.flash * 0.9);
}

// ================================================================ ボス
const B = {};
B.gravekeeper = () => {
  const g = new THREE.Group(), q = {};
  q.legs = [-1, 1].map((s) => { const p = pivot(g, 0, 1.2, s * 0.4); p.add(cap(0.22, 1.2, MAT.coat)); return p; });
  q.body = pivot(g, 0, 1.0);
  const coat = lathe([[0, 0], [1.05, 0.05], [1.15, 0.8], [1.0, 1.6], [0.6, 2.05], [0, 2.1]], MAT.coat, 16); coat.scale.z = 0.7; coat.rotation.z = -0.25; q.body.add(coat);
  q.head = pivot(q.body, 0.7, 1.9);
  q.head.add(sph(0.55, MAT.coat, 1, 0.9, 0.95));
  const face = sph(0.34, MAT.mask, 0.8, 0.9, 1); face.position.set(0.3, -0.08, 0); q.head.add(face);
  q.eyes = [0.14, -0.14].map((z) => { const e = sph(0.07, MAT.eyeGlow); e.position.set(0.55, 0, z); q.head.add(e); return e; });
  q.arm = pivot(q.body, 0.85, 1.2, 0.6); q.arm.add(cap(0.15, 0.8, MAT.coat));
  const shovel = new THREE.Group(); shovel.position.y = -0.8; q.arm.add(shovel);
  shovel.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), MAT.wood).translateY(-0.6));
  const blade = extrude(shapeOf([[-0.4, 0], [0.4, 0], [0.34, -0.8], [0, -1.0], [-0.34, -0.8]]), 0.06, MAT.iron, 0.02); blade.position.y = -1.7; shovel.add(blade);
  q.lantern = new THREE.Group(); q.lantern.position.set(-0.9, 0.5, 0.6); q.body.add(q.lantern);
  q.lantern.add(mesh(new THREE.BoxGeometry(0.3, 0.45, 0.3), MAT.blackIron));
  q.lantern.add(sph(0.14, new THREE.MeshBasicMaterial({ color: 0x9cff9c })));
  g.userData.q = q; return g;
};
B.witch = () => {
  const g = new THREE.Group(), q = {};
  q.root = pivot(g, 0, 0);
  q.broom = new THREE.Group(); q.root.add(q.broom);
  const stick = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), MAT.wood); stick.rotation.z = Math.PI / 2 - 0.1; stick.position.y = 0.65; q.broom.add(stick);
  const brush = cone(0.25, 0.7, MAT.straw, 10); brush.rotation.z = Math.PI / 2; brush.position.set(-0.95, 0.55, 0); q.broom.add(brush);
  const dress = lathe([[0.5, 0.4], [0.42, 0.8], [0.3, 1.3], [0.2, 1.5], [0, 1.55]], MAT.witch, 14); q.root.add(dress);
  q.head = pivot(q.root, 0.1, 1.72); q.head.add(sph(0.24, MAT.hag));
  const nose = cone(0.06, 0.32, MAT.hag, 6); nose.rotation.z = -1.7; nose.position.set(0.18, 0.0, 0); q.head.add(nose);
  for (const z of [0.09, -0.09]) { const e = sph(0.04, MAT.eyeGlow); e.position.set(0.19, 0.08, z); q.head.add(e); }
  const brim = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 18), MAT.witch, 0, 0.14, 0); q.head.add(brim);
  const hat = cone(0.25, 0.75, MAT.witch, 12); hat.position.y = 0.14; hat.rotation.z = 0.35; q.head.add(hat);
  q.arm = pivot(q.root, 0.15, 1.35, 0.25); q.arm.add(cap(0.06, 0.5, MAT.hag)); q.arm.rotation.z = 1.2;
  q.orb = sph(0.14, new THREE.MeshBasicMaterial({ color: 0xe0a0ff, transparent: true, opacity: 0.9 })); q.orb.position.y = -0.55; q.arm.add(q.orb);
  g.userData.q = q; return g;
};
B.riverbeast = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0);
  const b = sph(1.3, MAT.swamp, 1.15, 0.8, 0.85); b.position.set(0, 0.95, 0); q.body.add(b);
  const belly = sph(1.0, MAT.swampBelly, 1.1, 0.4, 0.8); belly.position.set(0.25, 0.45, 0); q.body.add(belly);
  for (let i = 0; i < 4; i++) { const f = cone(0.18, 0.55, MAT.swamp, 4); f.position.set(-0.9 + i * 0.45, 1.6 + i * 0.05, 0); f.scale.z = 0.25; q.body.add(f); }
  q.eyes = [0.5, -0.5].map((z) => { const e = sph(0.18, MAT.mask); e.position.set(0.85, 1.3, z); q.body.add(e); const p = sph(0.09, MAT.socket); p.position.set(1.0, 1.3, z); q.body.add(p); return e; });
  q.jaw = pivot(q.body, 0.4, 0.6); const j = sph(0.7, MAT.swamp, 1.3, 0.35, 1.0); j.position.x = 0.5; q.jaw.add(j);
  for (const z of [0.6, -0.6]) { const w = cap(0.03, 1.1, MAT.swamp); w.position.set(1.3, 0.8, z); w.rotation.set(z * 0.5, 0, 2.0); q.body.add(w); }
  g.userData.q = q; return g;
};
B.warden = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0);
  const torso = lathe([[0.45, 0.4], [0.56, 1.0], [0.5, 1.6], [0.3, 1.95], [0, 2.0]], MAT.bronze, 14); torso.scale.z = 0.8; q.body.add(torso);
  q.head = pivot(q.body, 0, 2.1); q.head.add(sph(0.45, MAT.bronze, 1, 0.85, 0.9));
  q.eyes = [0.17, -0.17].map((z) => { const r = sph(0.15, MAT.mask); r.position.set(0.32, 0.03, z); q.head.add(r); const e = sph(0.07, MAT.socket); e.position.set(0.44, 0.03, z); q.head.add(e); return e; });
  const beak = cone(0.08, 0.25, MAT.blackIron, 4); beak.rotation.z = Math.PI; beak.position.set(0.42, -0.08, 0); q.head.add(beak);
  for (const z of [0.3, -0.3]) { const t = cone(0.08, 0.35, MAT.bronze, 4); t.position.set(-0.05, 0.25, z); t.rotation.x = z * 1.2; q.head.add(t); }
  q.wings = [-1, 1].map((s) => {
    const p = pivot(q.body, -0.1, 1.5, s * 0.35);
    for (let i = 0; i < 6; i++) { const f = extrude(shapeOf([[0, 0], [0.5 + i * 0.25, 0.25], [0.6 + i * 0.28, -0.35], [0.25, -0.25]]), 0.03, MAT.bronze, 0.01); f.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; f.position.y = -i * 0.05; p.add(f); }
    return p;
  });
  q.legs = [-1, 1].map((s) => { const p = pivot(q.body, 0, 0.45, s * 0.22); p.add(cap(0.08, 0.45, MAT.blackIron)); return p; });
  g.userData.q = q; return g;
};
B.flameknight = () => {
  const g = new THREE.Group(), q = {};
  q.legs = [-1, 1].map((s) => { const p = pivot(g, 0, 1.1, s * 0.22); p.add(cap(0.14, 1.1, MAT.blackIron)); return p; });
  q.body = pivot(g, 0, 1.0);
  const torso = lathe([[0, 0], [0.48, 0.05], [0.58, 0.6], [0.52, 1.1], [0.3, 1.25], [0, 1.25]], MAT.blackIron, 16); torso.scale.z = 0.75; q.body.add(torso);
  const vein = mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), MAT.ember, 0.45, 0.6, 0); vein.rotation.z = 0.5; q.body.add(vein);
  q.head = pivot(q.body, 0.1, 1.5); q.head.add(lathe([[0, -0.25], [0.28, -0.25], [0.32, 0.05], [0.22, 0.28], [0, 0.32]], MAT.blackIron, 14));
  q.head.add(mesh(new THREE.BoxGeometry(0.12, 0.06, 0.4), MAT.ember, 0.24, 0, 0));
  for (const z of [0.25, -0.25]) { const h = cone(0.06, 0.45, MAT.blackIron, 6); h.position.set(-0.05, 0.2, z); h.rotation.x = z * 1.8; q.head.add(h); }
  q.arm = pivot(q.body, 0.35, 0.95, 0.5); q.arm.add(cap(0.11, 0.5, MAT.blackIron));
  const sword = new THREE.Group(); sword.position.y = -0.5; q.arm.add(sword);
  sword.add(mesh(new THREE.BoxGeometry(0.36, 0.07, 0.08), MAT.gold));
  const bl = mesh(new THREE.BoxGeometry(0.1, 1.5, 0.04), MAT.ember); bl.position.y = -0.8; sword.add(bl);
  q.sword = sword;
  g.userData.q = q; return g;
};
B.lord = () => {
  const g = new THREE.Group(), q = {};
  q.body = pivot(g, 0, 0);
  q.cloak = lathe([[1.9, 0.1], [1.5, 0.8], [1.0, 1.8], [0.55, 2.7], [0.3, 3.1], [0, 3.15]], MAT.lordRobe, 20); q.cloak.scale.z = 0.6; q.body.add(q.cloak);
  q.head = pivot(q.body, 0, 3.3); q.head.add(sph(0.5, MAT.lordFace, 1, 1.1, 0.95));
  for (const s of [-1, 1]) { const h = cone(0.1, 0.9, MAT.blackIron, 6); h.position.set(0, 0.35, s * 0.3); h.rotation.x = s * 0.8; q.head.add(h); }
  for (let i = 0; i < 5; i++) { const c = cone(0.06, 0.28 + (i === 2 ? 0.2 : 0), MAT.gold, 4); c.position.set(0, 0.42, -0.36 + i * 0.18); q.head.add(c); }
  q.eyes = [[0.4, 0.05, 0.18], [0.4, 0.05, -0.18], [0.45, 0.25, 0], [0.38, 0.22, 0.32], [0.38, 0.22, -0.32]].map(([x, y, z]) => { const e = sph(0.06, MAT.eyeGlow); e.position.set(x, y, z); q.head.add(e); return e; });
  q.orb = sph(0.3, new THREE.MeshBasicMaterial({ color: 0xb080ff, transparent: true, opacity: 0.9 })); q.orb.position.set(0.6, 1.7, 0); q.body.add(q.orb);
  g.userData.q = q; return g;
};
export function buildBoss(type) { const g = B[type](); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; }
export function poseBoss(g, b, time) {
  const q = g.userData.q, st = b.st, t = b.t;
  const k = (s, d) => (st === s ? Math.min(1, t / d) : 0);
  g.visible = true;
  switch (b.type) {
    case 'gravekeeper': {
      const wind = k('chargeWind', 0.8), slamW = k('slamWind', 0.7), charge = st === 'charge';
      q.body.position.y = 1.0 - wind * 0.25;
      q.legs.forEach((l, i) => (l.rotation.z = charge ? Math.sin(time * 20 + i * 3) * 0.6 : Math.sin(time * 5 + i * 3) * 0.15));
      q.arm.rotation.z = slamW ? 2.4 * slamW : st === 'slam' || st === 'recover' ? -0.9 : charge ? -1.2 : -0.3;
      q.eyes.forEach((e) => (e.material = wind || charge ? MAT.eyeRed : MAT.eyeGlow));
      q.head.rotation.z = st === 'stun' ? Math.sin(time * 8) * 0.3 : wind * 0.3;
      q.lantern.position.y = 0.5 + Math.sin(time * 3) * 0.05;
      break;
    }
    case 'witch': {
      const fan = k('fanWind', 0.8), land = st === 'landed';
      q.broom.visible = !land; q.root.position.y = Math.sin(time * 4) * 0.05;
      q.arm.rotation.z = 1.2 + fan * 0.6; q.orb.scale.setScalar(0.7 + fan * 1.5);
      q.head.rotation.z = land ? Math.sin(time * 6) * 0.2 : 0;
      break;
    }
    case 'riverbeast': {
      g.visible = st !== 'submerged' && st !== 'ripple';
      const open = st === 'onLand' && t > 0.75 && t < 1.3 ? 1 : 0;
      q.jaw.rotation.z = -open * 0.5; q.body.rotation.z = st === 'leap' ? Math.atan2(b.vy, Math.abs(b.vx) + 1) * 0.5 : 0;
      break;
    }
    case 'warden': {
      const dw = k('diveWind', 0.8), perch = st === 'perch', dive = st === 'dive' || st === 'impact';
      const flap = perch ? 0.1 : dive ? -0.6 : Math.sin(time * 9) * 0.6 + dw * 0.8;
      q.wings.forEach((w, i) => (w.rotation.x = (i ? -1 : 1) * (0.3 + flap * 0.5)));
      q.eyes.forEach((e) => (e.material = dw ? MAT.eyeRed : MAT.socket));
      q.body.rotation.z = dive ? -0.5 : 0;
      break;
    }
    case 'flameknight': {
      const ww = k('waveWind', 0.7), bw = k('ballWind', 0.6), sw = k('slashWind', 0.5), slash = st === 'slash', rec = st === 'recover';
      q.arm.rotation.z = slash ? -1.6 : sw ? 1.2 * sw : ww ? 2.8 * ww : bw ? 2.0 * bw : rec ? -1.3 : -0.5;
      q.legs.forEach((l, i) => (l.rotation.z = st === 'walk' ? Math.sin(time * 7 + i * 3) * 0.3 : 0));
      break;
    }
    case 'lord': {
      let a = 1; if (st === 'warpOut') a = 1 - Math.min(1, t / 0.45); if (st === 'warpIn') a = Math.min(1, t / 0.4);
      g.visible = a > 0.05; g.scale.set(a, 1, a);
      const ring = k('ringWind', 0.8);
      q.cloak.scale.set(1 + Math.sin(time * 2) * 0.05 + ring * 0.2, 1, 0.6);
      q.eyes.forEach((e, i) => { e.visible = i < (b.phase >= 3 ? 5 : b.phase >= 2 ? 3 : 2); e.material = st === 'sweepWind' ? MAT.eyeRed : MAT.eyeGlow; });
      q.orb.scale.setScalar(1 + ring + Math.sin(time * 6) * 0.1); q.orb.material.color.set(b.phase >= 3 ? 0xff5060 : 0xb080ff);
      break;
    }
  }
  if (st === 'dying') { const d = Math.min(1, b.deadT / 2.4); g.scale.multiplyScalar(1 - d * 0.3); g.position.y -= d * 0.6; g.rotation.z = d * 0.4; g.position.x += Math.sin(time * 50) * 0.08 * d; }
  setFlash(g, b.hitT > 0 ? (b.hitT / 0.1) * 0.7 : 0);
}
