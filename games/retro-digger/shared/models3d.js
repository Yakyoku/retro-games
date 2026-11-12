// 3D のキャラクター・道具・岩。外部モデルファイルは使わず、プリミティブから組み立てる（2D と同じ美術設定）。
// 単位はメートル。原点は足元の中心。+Z が正面（敵の yaw = atan2(dx, dz) で向きを合わせる）。
import * as THREE from 'three';
import { PAL } from './sprites2d.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
const geoCache = new Map();
const G = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const sphere = (r, w = 32, h = 24) => G('s' + r + w, () => new THREE.SphereGeometry(r, w, h));
const INK = 0x1a1020;

// ---------- 追跡型「プクモ」 ----------
export function makeChaser() {
  const root = new THREE.Group(); root.name = 'chaser';
  const body = new THREE.Group(); root.add(body); body.position.y = 0.6;
  const skin = std(PAL.chaser, { roughness: 0.42, emissive: new THREE.Color(PAL.chaser), emissiveIntensity: 0.12 });
  const dark = std(PAL.chaserDark, { roughness: 0.5 });
  const ball = new THREE.Mesh(sphere(0.5, 40, 30), skin); ball.scale.set(1, 0.94, 1); body.add(ball);
  const belly = new THREE.Mesh(sphere(0.36, 32, 20), std('#d8fff0', { roughness: 0.5 })); belly.position.set(0, -0.12, 0.2); belly.scale.set(1, 0.8, 0.55); body.add(belly);
  const eyes = []; const white = std('#ffffff', { roughness: 0.25 }); const ink = std(INK, { roughness: 0.2 });
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.2, 0.12, 0.4); body.add(eg);
    const w = new THREE.Mesh(sphere(0.15, 24, 18), white); w.scale.set(0.85, 1, 0.55); eg.add(w);
    const p = new THREE.Mesh(sphere(0.065, 16, 12), ink); p.position.set(0, 0, 0.07); eg.add(p);
    const hl = new THREE.Mesh(sphere(0.02, 8, 6), white); hl.position.set(0.025, 0.035, 0.11); eg.add(hl);
    eyes.push({ g: eg, w, p });
  }
  const cheekM = std(PAL.blush, { roughness: 0.6, transparent: true, opacity: 0.7 });
  const cheeks = [-1, 1].map((s) => { const c = new THREE.Mesh(sphere(0.08, 16, 10), cheekM); c.position.set(s * 0.33, -0.08, 0.36); c.scale.set(1, 0.6, 0.3); body.add(c); return c; });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 16, Math.PI), ink); mouth.position.set(0, -0.08, 0.47); mouth.rotation.z = Math.PI; body.add(mouth);
  const mouthO = new THREE.Mesh(sphere(0.06, 12, 8), std('#5a1a2a')); mouthO.position.set(0, -0.12, 0.46); mouthO.scale.set(1, 1.2, 0.4); mouthO.visible = false; body.add(mouthO);
  // 双葉の触角
  const leafM = std(PAL.leaf, { roughness: 0.5, side: THREE.DoubleSide });
  const ants = [-1, 1].map((s) => {
    const a = new THREE.Group(); a.position.set(s * 0.12, 0.42, 0); body.add(a);
    const stem = new THREE.Mesh(G('stem', () => new THREE.CylinderGeometry(0.018, 0.022, 0.26, 8)), ink); stem.position.y = 0.13; stem.rotation.z = -s * 0.35; a.add(stem);
    const leaf = new THREE.Mesh(sphere(0.1, 16, 10), leafM); leaf.scale.set(1, 0.32, 0.55); leaf.position.set(s * 0.12, 0.26, 0); leaf.rotation.z = s * 0.5; a.add(leaf);
    return a;
  });
  const feet = [-1, 1].map((s) => { const f = new THREE.Mesh(sphere(0.13, 16, 12), dark); f.scale.set(1, 0.6, 1.3); f.position.set(s * 0.22, 0.07, 0.05); root.add(f); return f; });
  const hands = [-1, 1].map((s) => { const h = new THREE.Mesh(sphere(0.09, 12, 10), dark); h.position.set(s * 0.52, 0, 0); h.visible = false; body.add(h); return h; });
  // 通り抜け中の砂の殻（輪郭）
  const sand = new THREE.Mesh(sphere(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe1a0, wireframe: true, transparent: true, opacity: 0.55 }));
  sand.visible = false; body.add(sand);
  root.userData = { body, ball, skin, eyes, cheeks, cheekM, mouth, mouthO, ants, feet, hands, sand, kind: 'chaser' };
  root.add(blobShadow());
  return root;
}

// ---------- 火炎型「ボイラン」 ----------
export function makeFire() {
  const root = new THREE.Group(); root.name = 'fire';
  const body = new THREE.Group(); root.add(body); body.position.y = 0.05;
  const skin = std(PAL.fire, { roughness: 0.45, emissive: new THREE.Color(PAL.fire), emissiveIntensity: 0.12 });
  const dark = std(PAL.fireDark, { roughness: 0.55 });
  // 釜の胴（回転体）
  const prof = [[0, 0], [0.42, 0.04], [0.6, 0.25], [0.64, 0.5], [0.58, 0.78], [0.42, 0.92], [0.0, 0.95]].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(G('pot', () => new THREE.LatheGeometry(prof, 40)), skin); body.add(pot);
  const rim = new THREE.Mesh(G('rim', () => new THREE.TorusGeometry(0.6, 0.045, 10, 40)), dark); rim.rotation.x = Math.PI / 2; rim.position.y = 0.62; body.add(rim);
  // 煙突
  const chim = new THREE.Group(); chim.position.set(-0.18, 0.9, -0.05); body.add(chim);
  chim.add(new THREE.Mesh(G('chim', () => new THREE.CylinderGeometry(0.1, 0.12, 0.32, 16)), std(PAL.chimney, { roughness: 0.7 })));
  const cap = new THREE.Mesh(G('chimcap', () => new THREE.CylinderGeometry(0.15, 0.15, 0.07, 16)), std('#3a2e2c', { roughness: 0.7 })); cap.position.y = 0.17; chim.add(cap);
  const white = std('#ffffff', { roughness: 0.25 }); const ink = std(INK);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.2, 0.68, 0.48); body.add(eg);
    const w = new THREE.Mesh(sphere(0.12, 20, 14), white); w.scale.set(0.9, 1, 0.5); eg.add(w);
    const p = new THREE.Mesh(sphere(0.055, 12, 10), ink); p.position.z = 0.055; eg.add(p);
    const lid = new THREE.Mesh(G('lid', () => new THREE.SphereGeometry(0.125, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), dark); lid.rotation.x = -0.5; eg.add(lid);
    eyes.push({ g: eg, w, p, lid });
  }
  const mouthM = std('#4a1408', { emissive: new THREE.Color('#ffcf5a'), emissiveIntensity: 0 });
  const mouth = new THREE.Mesh(G('fmouth', () => new THREE.BoxGeometry(0.46, 0.08, 0.1)), mouthM); mouth.position.set(0, 0.42, 0.6); body.add(mouth);
  const cheekM = std('#ff9a7a', { emissive: new THREE.Color('#ffd35a'), emissiveIntensity: 0, transparent: true, opacity: 0.8 });
  const cheeks = [-1, 1].map((s) => { const c = new THREE.Mesh(sphere(0.08, 12, 8), cheekM); c.position.set(s * 0.4, 0.5, 0.45); c.scale.set(1, 0.6, 0.3); body.add(c); return c; });
  const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(sphere(0.1, 12, 10), dark); a.position.set(s * 0.66, 0.4, 0.05); a.scale.set(0.8, 1.1, 0.8); body.add(a); return a; });
  const feet = [-1, 1].map((s) => { const f = new THREE.Mesh(sphere(0.13, 14, 10), dark); f.scale.set(1, 0.55, 1.3); f.position.set(s * 0.26, 0.05, 0.08); root.add(f); return f; });
  const sand = new THREE.Mesh(sphere(0.65, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffc88c, wireframe: true, transparent: true, opacity: 0.5 }));
  sand.position.y = 0.5; sand.visible = false; body.add(sand);
  // 煙（溜めで速くなる）
  const smokeM = new THREE.MeshBasicMaterial({ color: 0xdcd2c8, transparent: true, opacity: 0.5, depthWrite: false });
  const smoke = [0, 1, 2].map(() => { const m = new THREE.Mesh(sphere(0.08, 10, 8), smokeM.clone()); body.add(m); return m; });
  root.userData = { body, pot, skin, eyes, mouth, mouthM, cheeks, cheekM, arms, feet, sand, chim, smoke, kind: 'fire' };
  root.add(blobShadow());
  return root;
}

// 接地影（丸い影の板）
let shadowTex = null;
function blobShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(G('shadowPlane', () => new THREE.PlaneGeometry(1.3, 1.3)), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.name = 'shadow';
  return m;
}

// 敵の姿勢を状態に合わせる（膨張は胴・頬・目・手足を連動させ、均等拡大だけにしない）
export function poseEnemy(o, e, amt, recovering, t, look) {
  const u = o.userData;
  const ghost = e.state === 'ghost', warn = e.state === 'ghostWarn';
  const wob = amt > 0 ? Math.sin(t * (recovering ? 26 : 9)) * 0.04 * (recovering ? 2 : 1) : 0;
  const s = 1 + amt * 1.0;
  if (u.kind === 'chaser') {
    const hop = !amt && (e.state === 'walk' || e.state === 'land') ? Math.abs(Math.sin(e.anim * 8)) * 0.08 : 0;
    u.body.position.y = 0.6 * (1 + amt * 0.9) + hop;
    u.ball.scale.set(s * (1 + wob), s * (amt ? 1 - wob : 0.94), s * (1 + wob * 0.5));
    u.skin.color.set(recovering && Math.floor(t * 10) % 2 ? '#a8ffe4' : PAL.chaser);
    for (const ey of u.eyes) {
      const k = 1 + amt * 0.6; ey.g.scale.set(k, k, k);
      ey.g.position.set(Math.sign(ey.g.position.x) * 0.2 * s, 0.12 * s, 0.42 * s);
      const blink = e.state === 'wait' && Math.floor(t * 4) % 2 === 0;
      ey.w.scale.y = blink ? 0.12 : 1;
      ey.p.scale.setScalar(amt > 0.5 ? 0.55 : 1);
      ey.p.position.set(look[0] * 0.04, look[1] * 0.04, 0.07);
    }
    u.cheeks.forEach((c, i) => { c.position.set((i ? 1 : -1) * 0.33 * s, -0.08 * s, 0.38 * s); c.scale.set(1 + amt * 1.2, (1 + amt * 1.2) * 0.6, 0.3); });
    u.cheekM.opacity = 0.55 + amt * 0.4;
    u.mouth.visible = !amt; u.mouthO.visible = !!amt; u.mouthO.position.set(0, -0.14 * s, 0.47 * s); u.mouthO.scale.set(1 + amt, (1 + amt) * 1.2, 0.4);
    u.mouth.position.z = 0.47;
    u.ants.forEach((a, i) => { a.position.set((i ? 1 : -1) * 0.12 * s, 0.42 * s, 0); a.rotation.z = Math.sin(t * 3 + e.anim + i) * 0.15 + (i ? -1 : 1) * amt * 0.5; });
    const step = !amt && e.state === 'walk' ? Math.sin(e.anim * 8) * 0.12 : 0;
    u.feet.forEach((f, i) => { const sp = 1 + amt * 0.8; f.position.set((i ? 1 : -1) * 0.22 * sp, 0.07, 0.05 + (i ? step : -step)); f.scale.set(1 - amt * 0.4, (1 - amt * 0.4) * 0.6, (1 - amt * 0.4) * 1.3); });
    u.hands.forEach((h, i) => { h.visible = amt > 0; h.position.set((i ? 1 : -1) * 0.52 * s, 0, 0); });
    u.sand.visible = ghost || warn; u.sand.material.opacity = ghost ? 0.6 : 0.3 + 0.3 * Math.sin(t * 30);
    u.ball.visible = !ghost && !(warn && Math.floor(t * 20) % 2);
    u.sand.rotation.y = t * 2;
  } else {
    const waddle = !amt && e.state === 'walk' ? Math.sin(e.anim * 7) * 0.08 : 0;
    const charging = e.state === 'charge', breath = e.state === 'breath';
    u.body.rotation.z = waddle;
    u.body.position.x = charging ? Math.sin(t * 60) * 0.025 : 0;
    u.pot.scale.set(s * (1 + wob), (1 + amt * 1.1) * (1 - wob), s * (1 + wob));
    const hs = 1 + amt * 1.1;
    u.chim.position.set(-0.18 * s, 0.9 * hs, -0.05);
    u.skin.color.set(recovering && Math.floor(t * 10) % 2 ? '#ffb080' : PAL.fire);
    for (const ey of u.eyes) {
      ey.g.position.set(Math.sign(ey.g.position.x) * 0.2 * s, 0.68 * hs, 0.48 * s + 0.04 * amt);
      ey.g.scale.setScalar(1 + amt * 0.5);
      ey.lid.visible = !amt; ey.lid.rotation.x = charging ? -1.0 : -0.4;
      ey.p.scale.setScalar(amt > 0.5 ? 0.5 : 1);
    }
    u.mouth.position.set(0, 0.42 * hs, 0.6 * s);
    u.mouth.scale.set(1 + amt * 0.5, breath ? 2.4 : charging ? 1 + Math.min(1, e.t * 2) : amt ? 1.5 : 0.6, 1);
    u.mouthM.emissiveIntensity = breath ? 2.2 : charging ? 0.8 + 0.8 * Math.sin(t * 30) : 0;
    u.cheekM.emissiveIntensity = charging || breath ? 0.8 + 0.6 * Math.sin(t * 30) : 0;
    u.cheeks.forEach((c, i) => { c.position.set((i ? 1 : -1) * 0.4 * s, 0.5 * hs, 0.47 * s); });
    u.arms.forEach((a, i) => { a.position.set((i ? 1 : -1) * 0.66 * s, 0.4 * hs + (charging ? 0.1 : 0), 0.05); a.scale.setScalar(1 - amt * 0.4); });
    u.feet.forEach((f, i) => { f.position.x = (i ? 1 : -1) * 0.26 * (1 + amt * 0.8); f.scale.setScalar(1 - amt * 0.4); f.scale.y *= 0.55; });
    const rate = charging ? 6 : breath ? 4 : 1.2;
    u.smoke.forEach((m, i) => { const k = (t * rate * 0.5 + i / 3) % 1; m.position.set(u.chim.position.x - k * 0.15, u.chim.position.y + 0.25 + k * 0.6, -0.05); m.scale.setScalar(1 + k * 1.6); m.material.opacity = (charging ? 0.8 : 0.45) * (1 - k); m.material.color.set(charging ? 0xffc878 : 0xdcd2c8); });
    u.sand.visible = ghost || warn; u.sand.material.opacity = ghost ? 0.6 : 0.3 + 0.3 * Math.sin(t * 30);
    u.pot.visible = !ghost && !(warn && Math.floor(t * 20) % 2);
  }
}

// ---------- 岩 ----------
export function makeRock(theme) {
  const geo = new THREE.IcosahedronGeometry(0.8, 3);
  const p = geo.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 4.1 + 1.3) * Math.sin(v.y * 3.7) * Math.sin(v.z * 4.4 + 0.7) * 0.12 + Math.sin(v.x * 9 + v.z * 7) * 0.03;
    v.multiplyScalar(1 + n); v.y *= 0.85; p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const col = theme === 'crystal' ? '#7a7fa8' : theme === 'volcano' ? '#3e3236' : '#9a8f80';
  const mat = std(col, { roughness: 0.85, flatShading: true });
  if (theme === 'volcano') { mat.emissive = new THREE.Color('#ff5a1a'); mat.emissiveIntensity = 0.08; }
  const m = new THREE.Mesh(geo, mat);
  const root = new THREE.Group(); root.add(m);
  if (theme === 'crystal') {
    const cm = std('#9ff4ff', { emissive: new THREE.Color('#5fd8ff'), emissiveIntensity: 0.6, roughness: 0.15, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(G('oct', () => new THREE.OctahedronGeometry(0.18, 0)), cm); c.position.set(Math.cos(i * 1.7) * 0.6, -0.2 + i * 0.1, Math.sin(i * 1.7) * 0.6); c.scale.set(0.6, 1.4, 0.6); c.lookAt(0, 0, 0); root.add(c); }
  }
  root.userData = { mesh: m, mat };
  return root;
}

// ---------- ポンプの道具（ノズル）。手元（VR はコントローラー、通常 3D は画面右下）に持つ ----------
export function makeNozzle() {
  const root = new THREE.Group(); root.name = 'nozzle';
  const metal = std(PAL.metal, { metalness: 0.6, roughness: 0.3 });
  const red = std(PAL.tank, { roughness: 0.4 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.11, 16), std('#3a2a22', { roughness: 0.8 })); grip.position.set(0, -0.035, 0.03); grip.rotation.x = 0.35; root.add(grip);
  const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.16, 20), red); bodyM.rotation.x = Math.PI / 2; bodyM.position.z = -0.04; root.add(bodyM);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.14, 16), metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.17; root.add(barrel);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.04, 16), metal); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.25; root.add(tip);
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 20), std('#fffbe0', { emissive: new THREE.Color('#ffd35a'), emissiveIntensity: 0.3 })); gauge.position.set(0, 0.035, -0.02); root.add(gauge);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 24), std(PAL.helmet, { emissive: new THREE.Color(PAL.helmet), emissiveIntensity: 0.3 })); ring.position.z = -0.115; root.add(ring);
  root.userData = { gauge, ring, muzzle: new THREE.Vector3(0, 0, -0.27) };
  return root;
}
