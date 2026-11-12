// ツイン・ガーデン VR — 3D モデル（外部ファイルなし。回転体・押し出し・球の変形で組み立てる）
// 単位は盤面の論理単位（1 = 盤の 1 マス）。ワールドへは庭のグループの縮尺で写す。
import * as THREE from 'three';
import { MARKS } from '/shared/ui/marks.js';
import { makeRng } from '/shared/core/rng.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
const std = (o) => new THREE.MeshStandardMaterial(o);

export const MAT = {
  stone: std({ color: 0xcbb393, roughness: 0.85, metalness: 0 }),
  stoneDark: std({ color: 0x6b5238, roughness: 0.9 }),
  red: std({ color: 0xff4f57, roughness: 0.38, metalness: 0.0 }),
  blue: std({ color: 0x3f9dff, roughness: 0.32, metalness: 0.05 }),
  white: std({ color: 0xffffff, roughness: 0.4 }),
  eye: std({ color: 0x15101c, roughness: 0.2 }),
  leaf: std({ color: 0x4fbf5a, roughness: 0.6, side: THREE.DoubleSide }),
  stem: std({ color: 0x2f7d32, roughness: 0.7 }),
  mushStem: std({ color: 0xfff0d2, roughness: 0.7 }),
  caps: [std({ color: 0xff5a3c, roughness: 0.45 }), std({ color: 0xffa040, roughness: 0.45 }), std({ color: 0xe8507f, roughness: 0.45 })],
  spot: std({ color: 0xfffbf2, roughness: 0.5 }),
  beetle: std({ color: 0x7a2fb0, roughness: 0.25, metalness: 0.35 }),
  beetleDark: std({ color: 0x2a1636, roughness: 0.6 }),
  spike: std({ color: 0xffd1f0, roughness: 0.4 }),
  burr: std({ color: 0xff5a2a, roughness: 0.4, emissive: 0x501000, emissiveIntensity: 1 }),
  burrSpike: std({ color: 0xff9a3c, roughness: 0.45 }),
  glowEye: std({ color: 0xfff15a, emissive: 0xffe030, emissiveIntensity: 1.6 }),
  soil: std({ color: 0x6b4a2e, roughness: 1 }),
  petal: std({ color: 0xff8fc8, roughness: 0.5, side: THREE.DoubleSide }),
  pollen: std({ color: 0xffe14d, roughness: 0.5, emissive: 0x403000 }),
  wood: std({ color: 0xa96a36, roughness: 0.7 }),
  woodDark: std({ color: 0x6a3d1a, roughness: 0.8 }),
  gold: std({ color: 0xffcf40, roughness: 0.25, metalness: 0.9 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
};

// 接地影（柔らかい円）。リアルタイムの影に加えて、小物の接地感を確実に出す
let shadowTex = null;
function blobTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c); shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function blob(r, op = 1) {
  const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: op }));
  m.scale.set(r * 2, 1, r * 2); m.position.y = 0.012; m.renderOrder = 1;
  return m;
}

const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), seg);
const sphere = (r, w = 32, h = 20) => new THREE.SphereGeometry(r, w, h);

// ───────── 共有ジオメトリ ─────────
const G = {
  peg: lathe([[0, 0], [0.27, 0], [0.29, 0.06], [0.24, 0.12], [0.22, 0.62], [0.26, 0.68], [0.27, 0.78], [0.22, 0.86], [0.1, 0.9], [0, 0.91]], 36),
  pegRing: new THREE.TorusGeometry(0.235, 0.025, 10, 40).rotateX(Math.PI / 2),
  eyeW: sphere(0.075, 16, 12), eyeP: sphere(0.04, 12, 8),
  redBody: lathe(Array.from({ length: 21 }, (_, i) => { const t = i / 20, a = -Math.PI / 2 + t * Math.PI; return [Math.max(0, Math.cos(a) * 0.42 * (1 - 0.12 * t)), 0.42 + Math.sin(a) * 0.42 + t * 0.06]; }), 48),
  leaf: (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.12, 0.1, 0, 0.3); s.quadraticCurveTo(-0.12, 0.1, 0, 0); return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 }); })(),
  tri: (() => { const s = new THREE.Shape(); s.moveTo(0, 0.13); s.lineTo(0.12, -0.08); s.lineTo(-0.12, -0.08); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }); })(),
  ring: new THREE.TorusGeometry(0.075, 0.022, 10, 32),
  mushCap: lathe([[0, 0.5], [0.12, 0.49], [0.22, 0.44], [0.29, 0.36], [0.31, 0.3], [0.27, 0.27], [0.1, 0.28], [0, 0.28]], 32),
  mushStem: lathe([[0, 0], [0.13, 0], [0.15, 0.08], [0.13, 0.22], [0.1, 0.3], [0, 0.3]], 24),
  spot: sphere(0.05, 12, 8),
  beetle: sphere(0.33, 32, 20),
  spike: new THREE.ConeGeometry(0.06, 0.2, 10),
  leg: new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6),
  burr: sphere(0.26, 28, 18),
  burrSpike: new THREE.ConeGeometry(0.07, 0.3, 10),
  soil: sphere(0.32, 24, 12).scale(1, 0.35, 1),
  seed: sphere(0.06, 12, 8),
  stem: new THREE.CylinderGeometry(0.025, 0.035, 0.55, 8).translate(0, 0.275, 0),
  petal: sphere(0.12, 16, 10).scale(1, 0.35, 0.6),
  pollen: sphere(0.09, 16, 10),
  chestBody: (() => { const s = roundRectShape(0.9, 0.4, 0.06); return new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }).translate(0, 0.2, -0.3); })(),
  chestLid: new THREE.CylinderGeometry(0.31, 0.31, 0.92, 28, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.31),
  band: new THREE.BoxGeometry(0.94, 0.07, 0.64),
  lock: new THREE.BoxGeometry(0.12, 0.16, 0.06),
};

function roundRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function eyes(parent, y, z, spread, scale = 1) {
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(G.eyeW, MAT.white); w.position.set(s * spread, y, z); w.scale.setScalar(scale); parent.add(w);
    const p = new THREE.Mesh(G.eyeP, MAT.eye); p.position.set(s * spread, y, z + 0.055 * scale); p.scale.setScalar(scale); parent.add(p);
  }
}

export function makePeg() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(G.peg, MAT.stone); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const r = new THREE.Mesh(G.pegRing, MAT.stoneDark); r.position.y = 0.66; g.add(r);
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0 }));
  glow.position.y = 0.36; g.add(glow); g.userData.glow = glow;
  g.add(blob(0.42, 0.9));
  return g;
}

export function makeRed() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = new THREE.Mesh(G.redBody, MAT.red); m.castShadow = true; body.add(m);
  eyes(body, 0.5, 0.36, 0.13);
  const tri = new THREE.Mesh(G.tri, MAT.white); tri.position.set(0, 0.25, 0.36); tri.rotation.x = -0.25; body.add(tri);
  const triTop = new THREE.Mesh(G.tri, MAT.white); triTop.position.set(0, 0.905, 0.05); triTop.rotation.x = -Math.PI / 2; triTop.scale.setScalar(0.8); body.add(triTop);
  const lf = new THREE.Mesh(G.leaf, MAT.leaf); lf.position.set(0.03, 0.88, -0.08); lf.rotation.set(-0.3, 0, -0.5); body.add(lf);
  g.add(blob(0.45));
  g.userData.body = body;
  return g;
}

export function makeBlue() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const geo = new THREE.ExtrudeGeometry(roundRectShape(0.62, 0.62, 0.16), { depth: 0.56, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 5, curveSegments: 10 });
  geo.translate(0, 0.42, -0.28);
  const m = new THREE.Mesh(geo, MAT.blue); m.castShadow = true; body.add(m);
  eyes(body, 0.55, 0.39, 0.14);
  const ring = new THREE.Mesh(G.ring, MAT.white); ring.position.set(0, 0.26, 0.39); body.add(ring);
  const ringTop = new THREE.Mesh(G.ring, MAT.white); ringTop.position.set(0, 0.84, 0); ringTop.rotation.x = Math.PI / 2; body.add(ringTop);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), MAT.eye); ant.position.set(0, 0.9, -0.1); body.add(ant);
  const ball = new THREE.Mesh(sphere(0.06, 16, 10), std({ color: 0xffe48a, emissive: 0x806000, roughness: 0.3 })); ball.position.set(0, 0.99, -0.1); body.add(ball);
  g.add(blob(0.45));
  g.userData.body = body;
  return g;
}

export function makeMush(id) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const st = new THREE.Mesh(G.mushStem, MAT.mushStem); st.castShadow = true; body.add(st);
  const cap = new THREE.Mesh(G.mushCap, MAT.caps[id % 3]); cap.castShadow = true; body.add(cap);
  const r = makeRng(id * 97 + 3);
  for (let i = 0; i < 5; i++) {
    const a = r.next() * TAU, el = 0.35 + r.next() * 0.5;
    const s = new THREE.Mesh(G.spot, MAT.spot);
    s.position.set(Math.cos(a) * 0.29 * Math.cos(el * 0.9), 0.3 + Math.sin(el) * 0.17, Math.sin(a) * 0.29 * Math.cos(el * 0.9)).multiplyScalar(1);
    s.scale.set(1, 0.4, 1); s.lookAt(0, -0.5, 0); body.add(s);
  }
  eyes(body, 0.17, 0.12, 0.055, 0.45);
  g.add(blob(0.3, 0.8));
  g.userData.body = body;
  return g;
}

export function makeBeetle() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shell = new THREE.Mesh(G.beetle, MAT.beetle); shell.scale.set(0.9, 0.55, 1.1); shell.position.y = 0.22; shell.castShadow = true; body.add(shell);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, s = new THREE.Mesh(G.spike, MAT.spike);
    s.position.set(Math.cos(a) * 0.28, 0.25, Math.sin(a) * 0.34); s.lookAt(Math.cos(a) * 2, 0.5, Math.sin(a) * 2); s.rotateX(Math.PI / 2); body.add(s);
  }
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { const l = new THREE.Mesh(G.leg, MAT.beetleDark); l.position.set(sd * 0.32, 0.08, -0.15 + i * 0.15); l.rotation.z = sd * 1.1; body.add(l); }
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(G.eyeP, MAT.glowEye); e.position.set(sd * 0.1, 0.3, 0.33); e.scale.setScalar(1.3); body.add(e); }
  g.add(blob(0.48));
  g.userData.body = body;
  return g;
}

export function makeBurr() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const core = new THREE.Mesh(G.burr, MAT.burr); core.position.y = 0.45; core.castShadow = true; body.add(core);
  const spikes = new THREE.Group(); spikes.position.y = 0.45; body.add(spikes);
  const n = 18, gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * gold;
    const s = new THREE.Mesh(G.burrSpike, MAT.burrSpike);
    const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    s.position.copy(d).multiplyScalar(0.3); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); spikes.add(s);
  }
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(G.eyeW, MAT.white); e.position.set(sd * 0.1, 0.5, 0.23); e.scale.set(0.9, 0.7, 0.6); body.add(e); const p = new THREE.Mesh(G.eyeP, MAT.eye); p.position.set(sd * 0.1, 0.5, 0.28); body.add(p); }
  g.add(blob(0.42));
  g.userData.body = body; g.userData.spikes = spikes;
  return g;
}

export function makePlant() {
  const g = new THREE.Group();
  const soil = new THREE.Mesh(G.soil, MAT.soil); soil.receiveShadow = true; g.add(soil);
  const seed = new THREE.Mesh(G.seed, std({ color: 0xc9a06a, roughness: 0.8 })); seed.position.y = 0.1; g.add(seed);
  const sprout = new THREE.Group(); g.add(sprout);
  const stem = new THREE.Mesh(G.stem, MAT.stem); stem.castShadow = true; sprout.add(stem);
  for (const sd of [-1, 1]) { const l = new THREE.Mesh(G.leaf, MAT.leaf); l.position.set(0, 0.18, 0); l.rotation.set(0.2, sd > 0 ? 0 : Math.PI, -1.0); l.scale.setScalar(1.1); l.castShadow = true; sprout.add(l); }
  const bud = new THREE.Mesh(sphere(0.07, 12, 8), std({ color: 0xa6f58a, roughness: 0.6 })); bud.position.y = 0.58; sprout.add(bud);
  const flower = new THREE.Group(); flower.position.y = 0.58; sprout.add(flower);
  for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(G.petal, MAT.petal); const a = (i / 6) * TAU; p.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14); p.rotation.y = -a; p.rotation.z = 0.25; flower.add(p); }
  const pc = new THREE.Mesh(G.pollen, MAT.pollen); flower.add(pc);
  g.add(blob(0.4, 0.6));
  g.userData = { seed, sprout, bud, flower };
  return g;
}

export function makeChest() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(G.chestBody, MAT.wood); body.castShadow = true; body.receiveShadow = true; g.add(body);
  for (const x of [-0.3, 0.3]) { const b = new THREE.Mesh(G.band, MAT.gold); b.scale.set(0.12, 6.3, 1); b.position.set(x, 0.2, 0); g.add(b); }
  const hinge = new THREE.Group(); hinge.position.set(0, 0.42, -0.31); g.add(hinge);
  const lid = new THREE.Mesh(G.chestLid, MAT.woodDark); lid.castShadow = true; hinge.add(lid);
  for (const x of [-0.3, 0.3]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.31), MAT.gold); b.position.x = x; hinge.add(b); }
  const lock = new THREE.Mesh(G.lock, MAT.gold); lock.position.set(0, 0.38, 0.33); g.add(lock);
  const light = new THREE.PointLight(0xfff0a0, 0, 4, 2); light.position.set(0, 0.8, 0); g.add(light);
  g.add(blob(0.65));
  g.userData = { hinge, light };
  return g;
}

const gemGeo = {};
export function makeGem(mark) {
  const m = MARKS[mark];
  if (!gemGeo[mark]) {
    const s = new THREE.Shape(m.pts.map(([x, y]) => V2(x, -y)));
    gemGeo[mark] = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 8 }).center();
  }
  const g = new THREE.Group();
  const mat = std({ color: m.color, emissive: m.color, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.3 });
  const mesh = new THREE.Mesh(gemGeo[mark], mat); mesh.scale.setScalar(0.3); mesh.position.y = 0.45; mesh.castShadow = true; g.add(mesh);
  g.add(blob(0.3, 0.7));
  g.userData.mesh = mesh;
  return g;
}

// ───────── 庭（芝のテクスチャ・枠・台・遠景） ─────────
const THEME3 = {
  meadow: { g1: '#6dbb55', g2: '#4f9c42', g3: '#3c7f34', blade: ['#7fcf62', '#5daa48', '#94dc75'], flowers: ['#ffffff', '#ffd3ea', '#ffe27a', '#c9e7ff'], sky: [0x8fd3ff, 0xe6f6ff], fog: 0xcfe9f5, sun: 0xfff2d6, sunI: 2.6, hemi: [0xdff4ff, 0x4a6a3a, 1.1], frame: 0x8a5a34 },
  dusk: { g1: '#5c9a6c', g2: '#457f58', g3: '#356748', blade: ['#6fae7b', '#4f8d60', '#86c08c'], flowers: ['#ffd9a8', '#ffb3c1', '#fff2c2', '#d8c2ff'], sky: [0x5a4a8a, 0xffb07a], fog: 0xd8a890, sun: 0xffc08a, sunI: 2.0, hemi: [0xffd0b0, 0x3a3048, 0.9], frame: 0x6a4f6e },
  moon: { g1: '#3d6b62', g2: '#2f574f', g3: '#23443f', blade: ['#4d8277', '#3a6a60', '#5f9488'], flowers: ['#e6f0ff', '#bfe3ff', '#fff6c8', '#d7c8ff'], sky: [0x08102a, 0x2a3a6a], fog: 0x1a2440, sun: 0xb8ccff, sunI: 1.4, hemi: [0x8aa4ff, 0x10182a, 0.7], frame: 0x36405e },
};
export { THEME3 };

const grassCache = {};
export function grassTexture(theme, maxAniso, size = 2048) {
  const key = theme + size;
  if (grassCache[key]) return grassCache[key];
  const th = THEME3[theme];
  const W = size, H = Math.round(size * 0.75), k = W / 24;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const gg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.66);
  gg.addColorStop(0, th.g1); gg.addColorStop(0.7, th.g2); gg.addColorStop(1, th.g3);
  g.fillStyle = gg; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.07; g.fillStyle = '#fff';
  for (let x = 0; x < 24; x += 2) g.fillRect(x * k, 0, k, H);
  g.globalAlpha = 1;
  const r = makeRng(theme.length * 999);
  g.lineCap = 'round';
  const n = Math.round(W * H / 90);
  for (let i = 0; i < n; i++) {
    const x = r.next() * W, y = r.next() * H, l = (0.08 + r.next() * 0.16) * k, a = -Math.PI / 2 + r.range(-0.6, 0.6);
    g.strokeStyle = th.blade[i % 3]; g.globalAlpha = 0.3 + r.next() * 0.45; g.lineWidth = (0.018 + r.next() * 0.02) * k;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 0.8;
  for (let i = 0; i < 90; i++) {
    const x = r.next() * W, y = r.next() * H; g.fillStyle = th.flowers[i % 4];
    for (let j = 0; j < 5; j++) { const a = (j / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 0.06 * k, y + Math.sin(a) * 0.06 * k, 0.045 * k, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(x, y, 0.035 * k, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  grassCache[key] = t;
  return t;
}

export function makeFrame() {
  const outer = roundRectShape(24 + 1.4, 18 + 1.4, 0.6);
  const hole = new THREE.Path(); hole.moveTo(-12, -9); hole.lineTo(12, -9); hole.lineTo(12, 9); hole.lineTo(-12, 9); hole.lineTo(-12, -9);
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -0.45, 0);
  const m = new THREE.Mesh(geo, std({ color: 0x8a5a34, roughness: 0.65 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function makeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRectShape(29, 23, 1.2), { depth: 0.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4 }).rotateX(-Math.PI / 2).translate(0, -1.3, 0), std({ color: 0x5a3a24, roughness: 0.55 }));
  top.receiveShadow = true; g.add(top);
  const legGeo = new THREE.CylinderGeometry(0.55, 0.45, 18, 16);
  for (const [x, z] of [[-12.5, -9.5], [12.5, -9.5], [-12.5, 9.5], [12.5, 9.5]]) { const l = new THREE.Mesh(legGeo, std({ color: 0x4a2e1c, roughness: 0.6 })); l.position.set(x, -10.4, z); g.add(l); }
  return g;
}

/** 遠景（空・丘・木）。ワールドの単位（m）で作る */
export function makeScenery(theme) {
  const th = THEME3[theme];
  const g = new THREE.Group();
  const skyGeo = new THREE.SphereGeometry(60, 32, 16);
  const cols = [], pos = skyGeo.attributes.position, top = new THREE.Color(th.sky[0]), bot = new THREE.Color(th.sky[1]);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 60; const c = bot.clone().lerp(top, Math.max(0, y) ** 0.6); cols.push(c.r, c.g, c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), std({ color: new THREE.Color(th.g3).multiplyScalar(0.85), roughness: 1 }));
  lawn.position.y = -0.01; lawn.receiveShadow = true; g.add(lawn);
  // 木（低い多面体を並べる。GPU インスタンシング）
  const r = makeRng(theme.length * 31);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6).translate(0, 0.6, 0), std({ color: 0x5a3a24, roughness: 1 }), 48);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 1).translate(0, 1.8, 0), std({ color: new THREE.Color(th.g2).multiplyScalar(0.8), roughness: 0.9, flatShading: true }), 48);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + r.range(-0.05, 0.05), d = 12 + r.next() * 14, sc = 0.8 + r.next() * 1.4;
    p.set(Math.cos(a) * d, 0, Math.sin(a) * d); s.setScalar(sc); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.next() * TAU);
    m4.compose(p, q, s); trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4);
  }
  g.add(trunk, crown);
  if (theme === 'moon') {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false }));
    moon.position.set(18, 22, -40); g.add(moon);
  }
  return g;
}

export { G, roundRectShape };
