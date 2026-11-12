// AEGIS RELAY — 3D モデル（すべてプリミティブから計算で組み立てる。外部のモデルファイルは使わない）
// 単位: 論理 1px = 1 単位（盤面は 240×320）。+Y が上、-Z が進行方向（盤面の上端）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = {}; // 材質の共有
export function materials() {
  if (M.hull) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.hull = std({ color: 0xd9e2f0, metalness: 0.55, roughness: 0.32 });
  M.hullDark = std({ color: 0x4a5874, metalness: 0.6, roughness: 0.45 });
  M.canopy = std({ color: 0x2ec5ff, metalness: 0.1, roughness: 0.08, emissive: 0x0a4a7a, emissiveIntensity: 0.8 });
  M.engine = new THREE.MeshBasicMaterial({ color: 0x9ff4ff });
  M.edgeGlow = new THREE.MeshBasicMaterial({ color: 0x2ec5ff });
  M.gold = std({ color: 0xffd166, metalness: 0.75, roughness: 0.28, emissive: 0x3a2400, emissiveIntensity: 0.6 });
  M.goldDark = std({ color: 0x8a5a10, metalness: 0.7, roughness: 0.4 });
  M.goldGlow = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  M.scout = std({ color: 0xa9b8d4, metalness: 0.5, roughness: 0.35 });
  M.red = new THREE.MeshBasicMaterial({ color: 0xff5a5a });
  M.weaver = std({ color: 0x2fa36b, metalness: 0.3, roughness: 0.4, emissive: 0x0b3a22, emissiveIntensity: 0.6 });
  M.mint = new THREE.MeshBasicMaterial({ color: 0xa7ffcf });
  M.slicer = std({ color: 0xff8a3d, metalness: 0.45, roughness: 0.35, emissive: 0x3a1000, emissiveIntensity: 0.5 });
  M.amber = new THREE.MeshBasicMaterial({ color: 0xffb070 });
  M.gunner = std({ color: 0x8a5cd6, metalness: 0.45, roughness: 0.35, emissive: 0x1c0a38, emissiveIntensity: 0.6 });
  M.violet = new THREE.MeshBasicMaterial({ color: 0xd2a8ff });
  M.spinner = std({ color: 0xe8f6ff, metalness: 0.6, roughness: 0.25 });
  M.cyan = new THREE.MeshBasicMaterial({ color: 0x5ad2ff });
  M.diver = std({ color: 0xe0405e, metalness: 0.45, roughness: 0.3 });
  M.lancer = std({ color: 0xd8cfa8, metalness: 0.65, roughness: 0.3 });
  M.lancerDark = std({ color: 0x4e4a3a, metalness: 0.6, roughness: 0.5 });
  M.twin = std({ color: 0x7a84d8, metalness: 0.55, roughness: 0.3 });
  M.pink = new THREE.MeshBasicMaterial({ color: 0xff4fa8 });
  M.metal = std({ color: 0x8a909c, metalness: 0.7, roughness: 0.38 });
  M.metalDark = std({ color: 0x30343c, metalness: 0.6, roughness: 0.55 });
  M.barrel = std({ color: 0xc6ccd6, metalness: 0.8, roughness: 0.25 });
  M.panel = std({ color: 0x1a2632, metalness: 0.4, roughness: 0.5, emissive: 0x0b4050, emissiveIntensity: 0.6 });
  M.panelLine = new THREE.MeshBasicMaterial({ color: 0x7ff3ff });
  M.white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return M;
}

const v2 = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); s.closePath(); return s; };
// 上から見た形（x, y=前方が負）を厚み d で押し出し、水平に寝かせる
function slab(pts, d, bevel = 0.6) {
  const g = new THREE.ExtrudeGeometry(v2(pts), { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, d / 2, 0); return g;
}
function mesh(geo, mat, o = {}) { const m = new THREE.Mesh(geo, mat); if (o.p) m.position.set(...o.p); if (o.r) m.rotation.set(...o.r); if (o.s) m.scale.set(...o.s); return m; }
function lathe(profile, seg = 16) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

export function makePlayer() {
  const m = materials(); const g = new THREE.Group();
  // 胴（回転体を前後に寝かせる）
  const body = lathe([[0, -14], [1.6, -10], [3.2, -5], [3.6, 2], [3.0, 8], [2.2, 11], [0, 11.5]], 18); body.rotateX(Math.PI / 2); body.scale(1, 0.75, 1);
  g.add(mesh(body, m.hull));
  g.add(mesh(slab([0, -4, 13, 6, 14, 10, 4, 9, 0, 11, -4, 9, -14, 10, -13, 6], 1.2), m.hull, { p: [0, -0.4, 0] }));
  // 主翼前縁の光
  for (const s of [-1, 1]) { const e = mesh(new THREE.BoxGeometry(0.5, 0.5, 14), m.edgeGlow); e.position.set(s * 6.6, 0.3, 1.8); e.rotation.y = s * 0.95; g.add(e); }
  for (const s of [-1, 1]) g.add(mesh(slab([0, 0, 4.2, 6.5, 3.2, 8.5, 0, 5.5], 0.7, 0.3), m.hullDark, { p: [s * 2.4, 2.5, 2], r: [0, 0, s * 0.5] }));
  g.add(mesh(new THREE.SphereGeometry(2, 16, 10), m.canopy, { p: [0, 2.2, -5.5], s: [0.85, 0.7, 2] }));
  for (const s of [-1.6, 1.6]) {
    g.add(mesh(new THREE.CylinderGeometry(1.1, 1.3, 4, 12), m.hullDark, { p: [s, 0, 10], r: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.CircleGeometry(1, 12), m.engine, { p: [s, 0, 12.05] }));
  }
  // 支援機の翼（合体時に表示）
  const wing = new THREE.Group(); wing.name = 'relay';
  for (const s of [-1, 1]) {
    wing.add(mesh(slab([s * 6, -2, s * 17, 3, s * 21, 9, s * 15, 10, s * 7, 6].map((v, i) => (i % 2 ? v : v)), 1.4), m.gold, { p: [0, 0.4, 0] }));
    wing.add(mesh(new THREE.CylinderGeometry(1.2, 1.5, 4, 10), m.goldDark, { p: [s * 17, 0.6, 9], r: [Math.PI / 2, 0, 0] }));
    wing.add(mesh(new THREE.CircleGeometry(1.1, 10), m.goldGlow, { p: [s * 17, 0.6, 11.05] }));
  }
  wing.visible = false; g.add(wing);
  return g;
}

export function makePartner() {
  const m = materials(); const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(mesh(slab([0, -6, s * 10, 2, s * 12, 7, s * 4, 5, 0, 8], 1.4), m.gold));
  g.add(mesh(new THREE.SphereGeometry(3, 14, 10), m.goldGlow, { p: [0, 1, 0] }));
  return g;
}

const AIR = {
  scout() { const m = materials(); const g = new THREE.Group();
    g.add(mesh(slab([0, 9, 8, -6, 3, -4, 0, -8, -3, -4, -8, -6], 2), m.scout));
    g.add(mesh(new THREE.SphereGeometry(1.6, 10, 8), m.red, { p: [0, 1.6, 2] })); return g; },
  weaver() { const m = materials(); const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(5.3, 1.8, 10, 24), m.weaver, { r: [Math.PI / 2, 0, 0] }));
    for (let k = 0; k < 3; k++) { const f = mesh(new THREE.ConeGeometry(1.6, 4, 6), m.mint); const a = (k / 3) * Math.PI * 2; f.position.set(Math.cos(a) * 8, 0, Math.sin(a) * 8); f.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2); f.rotation.order = 'YXZ'; g.add(f); }
    g.add(mesh(new THREE.SphereGeometry(2.4, 12, 8), m.mint)); return g; },
  slicer() { const m = materials(); const g = new THREE.Group();
    const s = new THREE.Shape(); s.absarc(0, 0, 8, -0.2, Math.PI + 0.2, false); s.absarc(0, 3, 6, Math.PI + 0.1, -0.1, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 }); geo.rotateX(Math.PI / 2); g.add(mesh(geo, m.slicer, { p: [0, 1, 0] }));
    g.add(mesh(new THREE.SphereGeometry(2, 10, 8), m.amber, { p: [0, 0.5, -2] })); return g; },
  gunner() { const m = materials(); const g = new THREE.Group();
    for (const s of [-1, 1]) { g.add(mesh(new THREE.CapsuleGeometry(3, 8, 4, 10), m.gunner, { p: [s * 6, 0, 0], r: [Math.PI / 2, 0, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 5, 8), m.metalDark, { p: [s * 6, 0, 6], r: [Math.PI / 2, 0, 0] })); }
    g.add(mesh(slab([-4, -6, 4, -6, 5, 4, 0, 8, -5, 4], 4), m.gunner));
    g.add(mesh(new THREE.SphereGeometry(2.2, 10, 8), m.violet, { p: [0, 2.4, 1] })); return g; },
  spinner() { const m = materials(); const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; const w = new THREE.Group(); w.rotation.y = -a; w.add(mesh(new THREE.ConeGeometry(2.2, 8, 4), m.spinner, { p: [0, 0, -4], r: [-Math.PI / 2, 0, 0] })); g.add(w); }
    g.add(mesh(new THREE.SphereGeometry(2.6, 12, 8), m.cyan)); return g; },
  diver() { const m = materials(); const g = new THREE.Group();
    g.add(mesh(slab([0, 10, 6, -2, 9, -8, 3, -5, 0, -9, -3, -5, -9, -8, -6, -2], 2.4), m.diver));
    g.add(mesh(new THREE.ConeGeometry(2, 7, 8), m.diver, { p: [0, 1.2, 4], r: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.SphereGeometry(1.5, 10, 8), m.white, { p: [0, 2, -4] })); return g; },
  lancer() { const m = materials(); const g = new THREE.Group();
    g.add(mesh(slab([0, 16, 3, 4, 11, -2, 12, -9, 4, -7, 2, -13, -2, -13, -4, -7, -12, -9, -11, -2, -3, 4], 3), m.lancer));
    g.add(mesh(new THREE.ConeGeometry(1.8, 14, 10), m.lancerDark, { p: [0, 1.5, 12], r: [Math.PI / 2, 0, 0] }));
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(2, 10, 8), m.goldGlow, { p: [s * 8, 1, -9] }));
    g.add(mesh(new THREE.BoxGeometry(4, 3, 7), m.lancerDark, { p: [0, 2.5, -2] })); return g; },
  twinL() { return twinHalf(-1); },
  twinR() { return twinHalf(1); },
  twinM() { const m = materials(); const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(15, 13, 5, 32), m.twin));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.add(mesh(new THREE.BoxGeometry(2, 3, 4), m.metal, { p: [Math.cos(a) * 14, 1, Math.sin(a) * 14], r: [0, -a, 0] })); }
    g.add(mesh(new THREE.SphereGeometry(5, 16, 12), m.pink, { p: [0, 2.5, 0] })); return g; },
};
function twinHalf(s) {
  const m = materials(); const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(10, 9, 5, 24, 1, false, s > 0 ? 0 : Math.PI, Math.PI);
  g.add(mesh(geo, m.twin));
  g.add(mesh(new THREE.BoxGeometry(1.4, 5.4, 18), m.pink, { p: [0, 0, 0] }));
  return g;
}
export function makeAir(type) { return AIR[type](); }

export function makeGround(type) {
  const m = materials(); const g = new THREE.Group();
  if (type === 'turret') {
    g.add(mesh(new THREE.CylinderGeometry(8, 9.5, 4, 8), m.metalDark, { p: [0, 2, 0] }));
    g.add(mesh(new THREE.TorusGeometry(6.2, 0.6, 6, 24), m.amber, { p: [0, 4.1, 0], r: [Math.PI / 2, 0, 0] }));
    const head = new THREE.Group(); head.name = 'head'; head.position.y = 5;
    head.add(mesh(new THREE.SphereGeometry(4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.metal));
    head.add(mesh(new THREE.CylinderGeometry(1, 1.1, 9, 10), m.barrel, { p: [0, 1, 5], r: [Math.PI / 2, 0, 0] }));
    g.add(head);
  } else if (type === 'bunker') {
    g.add(mesh(new THREE.CylinderGeometry(11, 12, 5, 6), m.metalDark, { p: [0, 2.5, 0] }));
    g.add(mesh(new THREE.TorusGeometry(8.6, 0.7, 6, 6), m.amber, { p: [0, 5.1, 0], r: [Math.PI / 2, 0, 0] }));
    const head = new THREE.Group(); head.name = 'head'; head.position.y = 5;
    head.add(mesh(new THREE.SphereGeometry(6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.metal));
    for (let k = -1; k <= 1; k++) head.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 8, 8), m.barrel, { p: [Math.sin(k * 0.5) * 5, 1.5, Math.cos(k * 0.5) * 6], r: [Math.PI / 2, 0, -k * 0.5] }));
    g.add(head);
  } else if (type === 'dock') {
    g.add(mesh(new THREE.CapsuleGeometry(7, 9, 6, 14), m.gold, { p: [0, 5, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.75] }));
    g.add(mesh(new THREE.BoxGeometry(24, 1.2, 1), m.goldDark, { p: [0, 10.5, 0] }));
    g.add(mesh(new THREE.TorusGeometry(12.5, 0.7, 6, 32), m.goldGlow, { p: [0, 0.8, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.8, 1] }));
  } else if (type === 'panel') {
    g.add(mesh(new THREE.BoxGeometry(13, 2.4, 13), m.panel, { p: [0, 1.2, 0] }));
    for (const [x, z, w, d] of [[-2, -4, 4, 0.8], [0, -2, 0.8, 4], [2, 0, 4, 0.8], [4, 2, 0.8, 4], [-3, 3, 3, 0.8]]) g.add(mesh(new THREE.BoxGeometry(w, 0.4, d), m.panelLine, { p: [x, 2.5, z] }));
  } else if (type === 'core') {
    g.add(mesh(new THREE.CylinderGeometry(22, 25, 8, 40), m.metalDark, { p: [0, 4, 0] }));
    const rot = new THREE.Group(); rot.name = 'spin'; rot.position.y = 8;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; rot.add(mesh(new THREE.BoxGeometry(10, 4, 4), m.metal, { p: [Math.cos(a) * 16, 2, Math.sin(a) * 16], r: [0, -a + Math.PI / 2, 0] })); }
    rot.add(mesh(new THREE.TorusGeometry(21, 1, 8, 48), m.amber, { r: [Math.PI / 2, 0, 0] }));
    g.add(rot);
    g.add(mesh(new THREE.SphereGeometry(8, 24, 16), m.pink, { p: [0, 10, 0] }));
  }
  return g;
}

// 遺跡（飾り）: 柱・石板・アーチ・輪。光らない材質
export function makeRuinGeometry(kind, s, color) {
  let geo;
  if (kind === 'pillar') { geo = mergeGeometries([new THREE.CylinderGeometry(2.6 * s, 3 * s, 14 * s, 8).translate(0, 7 * s, 0), new THREE.BoxGeometry(8 * s, 1.6 * s, 8 * s).translate(0, 0.8 * s, 0)]); }
  else if (kind === 'slab') geo = new THREE.BoxGeometry(18 * s, 3 * s, 6 * s).translate(0, 1.5 * s, 0);
  else if (kind === 'arch') { geo = new THREE.TorusGeometry(7 * s, 1.6 * s, 6, 12, Math.PI); }
  else geo = new THREE.TorusGeometry(5.8 * s, 1.3 * s, 6, 16).rotateX(Math.PI / 2).translate(0, 1.3 * s, 0);
  return geo;
}
