// VOIDBLOOM — 機体・敵・ボスの 3D モデル（すべてプリミティブから計算で組み立てる。外部モデルなし）
// build(type, e) → { obj, anim(e, t) }。obj の原点は当たり判定の中心、+x が前（自機）、敵は -x を向く。
import * as THREE from 'three';
import { materials, colorOf, U } from './materials.js';

const G = {}; // ジオメトリのキャッシュ
const geo = (key, fn) => G[key] || (G[key] = fn());
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); return o; };

// 有機的な塊: 二十面体をゆがめる
function blob(r, detail, amp, seed, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amp * (Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.3) + 0.5 * Math.sin(z * 4.3 + seed * 2.1));
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}
// x 軸まわりの回転体（profile: [[x, 半径], ...]）
function latheX(profile, seg = 16) {
  const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
function spikeRing(n, r, len, w, mat, axis = 'z') {
  const grp = new THREE.Group();
  const cg = geo('spike' + len + w, () => new THREE.ConeGeometry(w, len, 5));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, m = mesh(cg, mat);
    if (axis === 'z') { m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); m.rotation.z = a - Math.PI / 2; }
    else { m.position.set(0, Math.cos(a) * r, Math.sin(a) * r); m.rotation.x = a; }
    grp.add(m);
  }
  return grp;
}
function flashShell(r) {
  const m = mesh(geo('flash', () => new THREE.SphereGeometry(1, 12, 8)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.scale.setScalar(r); m.visible = false; return m;
}

// ---------------------------------------------------------------- 自機 SABLE WREN
export function buildPlayer() {
  const M = materials(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const fus = mesh(geo('pl-fus', () => { const x = latheX([[-0.85, 0], [-0.82, 0.13], [-0.5, 0.22], [0.05, 0.26], [0.5, 0.18], [0.85, 0.06], [0.98, 0]], 20); x.scale(1, 0.72, 1); return x; }), M.steel);
  body.add(fus);
  const can = mesh(geo('pl-can', () => new THREE.SphereGeometry(1, 16, 10)), M.canopy); can.scale.set(0.34, 0.12, 0.13); can.position.set(0.28, 0.13, 0); body.add(can);
  // 主翼（奥行き方向へ後退角つき）
  const wingG = geo('pl-wing', () => { const s = new THREE.Shape(); s.moveTo(0.35, 0); s.lineTo(-0.55, 0.95); s.lineTo(-0.78, 0.92); s.lineTo(-0.6, 0); s.closePath(); const e = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); e.rotateX(Math.PI / 2); return e; });
  const w1 = mesh(wingG, M.darkSteel); w1.position.y = -0.02; body.add(w1);
  const w2 = mesh(wingG, M.darkSteel); w2.scale.z = -1; w2.position.y = -0.02; body.add(w2);
  // 背びれ
  const fin = mesh(geo('pl-fin', () => { const s = new THREE.Shape(); s.moveTo(-0.15, 0); s.lineTo(-0.62, 0.42); s.lineTo(-0.76, 0.4); s.lineTo(-0.62, 0); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); }), M.gunmetal);
  fin.position.set(0, 0.12, -0.015); body.add(fin);
  // 翼端の光とエンジン
  const tipG = geo('pl-tip', () => new THREE.BoxGeometry(0.22, 0.03, 0.03));
  for (const z of [0.93, -0.93]) { const t = mesh(tipG, M.gCyan); t.position.set(-0.66, -0.02, z); body.add(t); }
  const engG = geo('pl-eng', () => latheX([[-0.38, 0.1], [-0.3, 0.13], [0.2, 0.11], [0.3, 0]], 12));
  const flameG = geo('pl-flame', () => { const c = new THREE.ConeGeometry(0.09, 0.7, 10, 1, true); c.rotateZ(Math.PI / 2); c.translate(-0.35, 0, 0); return c; });
  const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fe8ff).multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = [];
  for (const z of [0.3, -0.3]) {
    const e = mesh(engG, M.gunmetal); e.position.set(-0.55, -0.04, z); body.add(e);
    const f = mesh(flameG, flameM); f.position.set(-0.92, -0.04, z); body.add(f); flames.push(f);
  }
  const chargeOrb = mesh(geo('pl-charge', () => new THREE.SphereGeometry(1, 16, 12)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(2.5), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  chargeOrb.position.set(1.05, 0, 0); chargeOrb.visible = false; g.add(chargeOrb);
  return {
    obj: g,
    anim(p, t) {
      body.rotation.x = -p.tilt * 0.55;
      body.rotation.z = p.tilt * 0.08;
      for (const f of flames) { f.scale.x = 0.8 + Math.sin(t * 60 + f.position.z * 9) * 0.25; }
      chargeOrb.visible = p.charge > 0.05;
      if (chargeOrb.visible) { const k = 0.12 + p.charge * 0.42 + Math.sin(t * 40) * 0.03; chargeOrb.scale.setScalar(k); chargeOrb.material.opacity = 0.35 + p.charge * 0.5; }
      g.visible = p.alive && !(p.inv > 0 && Math.floor(t * 20) % 2 === 0);
    },
  };
}

// ---------------------------------------------------------------- SEED（着脱ユニット）
export function buildPod() {
  const M = materials(), g = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const core = mesh(geo('pod-core', () => new THREE.IcosahedronGeometry(0.3, 1)), coreMat); g.add(core);
  const inner = mesh(geo('pod-inner', () => blob(0.42, 2, 0.12, 2.3)), M.fleshViolet); g.add(inner);
  const cage = new THREE.Group(); g.add(cage);
  const petalG = geo('pod-petal', () => { const s = new THREE.SphereGeometry(0.72, 10, 10, 0, Math.PI / 3 * 0.72, Math.PI * 0.12, Math.PI * 0.76); s.rotateZ(Math.PI / 2); return s; });
  const petalMat = M.steel.clone(); petalMat.side = THREE.DoubleSide;
  for (let k = 0; k < 6; k++) { const p = mesh(petalG, petalMat); p.rotation.x = (k / 6) * Math.PI * 2; cage.add(p); }
  const spikes = spikeRing(6, 0.7, 0.26, 0.06, M.darkSteel, 'x'); spikes.rotation.z = -Math.PI / 2; cage.add(spikes);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = mesh(geo('pod-ring', () => new THREE.TorusGeometry(0.86, 0.025, 6, 40)), ringM); ring.rotation.y = Math.PI / 2; g.add(ring);
  return {
    obj: g,
    anim(pod, t) {
      const c = new THREE.Color(colorOf[pod.level > 0 ? pod.color : 'P']);
      coreMat.color.copy(c).multiplyScalar(2.2 + Math.sin(t * 9) * 0.5);
      ringM.color.copy(c).multiplyScalar(1.5);
      cage.rotation.x = t * (pod.state === 'launch' || pod.state === 'return' ? 14 : 2.2);
      const facing = pod.state === 'back' ? Math.PI : 0;
      g.rotation.y += (facing - g.rotation.y) * 0.2;
      ring.scale.setScalar(1 + 0.08 * Math.sin(t * 5) + (pod.level * 0.06));
      inner.rotation.y = t * 0.7;
    },
  };
}

export function buildBit() {
  const M = materials(), g = new THREE.Group();
  g.add(mesh(geo('bit-b', () => blob(0.26, 1, 0.1, 5.1)), M.chitin));
  const eye = mesh(geo('bit-e', () => new THREE.SphereGeometry(0.11, 10, 8)), M.gBio); eye.position.x = 0.18; g.add(eye);
  const r = mesh(geo('bit-r', () => new THREE.TorusGeometry(0.4, 0.03, 6, 24)), M.gBio); g.add(r);
  return { obj: g, anim(b, t) { r.rotation.x = t * 3; r.rotation.y = t * 2; g.rotation.z = Math.sin(t * 2 + b.side) * 0.2; } };
}

// ---------------------------------------------------------------- 雑魚敵
const B = {};
B.drifter = () => {
  const M = materials(), g = new THREE.Group();
  const b = mesh(geo('dr-b', () => blob(0.42, 1, 0.16, 1.7, 1.25, 0.8, 0.8)), M.chitin); g.add(b);
  const sp = spikeRing(5, 0.3, 0.42, 0.06, M.bone, 'x'); sp.position.x = 0.38; sp.rotation.z = -Math.PI / 2; g.add(sp);
  const eye = mesh(geo('dr-e', () => new THREE.SphereGeometry(0.12, 10, 8)), M.gEye); eye.position.x = -0.42; g.add(eye);
  return { obj: g, anim(e, t) { g.rotation.x = t * 3 + e.i; sp.rotation.x = Math.sin(t * 5) * 0.3; } };
};
B.hookjaw = () => {
  const M = materials(), g = new THREE.Group();
  const hook = mesh(geo('hj-h', () => new THREE.TorusGeometry(0.42, 0.1, 8, 18, Math.PI * 1.25)), M.steel); hook.rotation.z = Math.PI * 0.4; g.add(hook);
  const head = mesh(geo('hj-head', () => blob(0.26, 1, 0.12, 3.3)), M.flesh); head.position.x = -0.15; g.add(head);
  const jawG = geo('hj-j', () => { const c = new THREE.ConeGeometry(0.07, 0.42, 6); c.rotateZ(Math.PI / 2); return c; });
  const j1 = mesh(jawG, M.bone), j2 = mesh(jawG, M.bone); j1.position.set(-0.45, 0.1, 0); j2.position.set(-0.45, -0.1, 0); g.add(j1, j2);
  const eye = mesh(geo('hj-e', () => new THREE.SphereGeometry(0.07, 8, 6)), M.gEye); eye.position.set(-0.3, 0.12, 0.15); g.add(eye);
  return { obj: g, anim(e, t) { const a = 0.25 + Math.sin(t * 14) * 0.2; j1.rotation.z = a; j2.rotation.z = -a; g.rotation.z = Math.atan2(e.vy || 0, Math.abs(e.vx || 1)) * (e.vx > 0 ? -1 : 1); g.scale.x = e.vx > 0 ? -1 : 1; } };
};
B.lantern = (e) => {
  const M = materials(), g = new THREE.Group();
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorOf[e.drop] || 0xffffff).multiplyScalar(2.5), toneMapped: false });
  const core = mesh(geo('ln-c', () => new THREE.OctahedronGeometry(0.3, 0)), coreM); g.add(core);
  const ringG = geo('ln-r', () => new THREE.TorusGeometry(0.58, 0.05, 6, 20));
  const rings = [0, 1, 2].map((k) => { const r = mesh(ringG, M.bone); r.rotation.y = k * Math.PI / 3; g.add(r); return r; });
  const cap = mesh(geo('ln-cap', () => new THREE.ConeGeometry(0.3, 0.3, 8)), M.gunmetal); cap.position.y = 0.62; g.add(cap);
  const cap2 = cap.clone(); cap2.rotation.z = Math.PI; cap2.position.y = -0.62; g.add(cap2);
  return { obj: g, anim(e2, t) { core.rotation.y = t * 3; core.rotation.x = t * 2; g.rotation.y = t * 0.8; for (const r of rings) r.rotation.x = Math.sin(t) * 0.2; } };
};
B.nodule = () => {
  const M = materials(), g = new THREE.Group();
  const dome = mesh(geo('nd-d', () => new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.chitin); dome.position.y = -0.3; g.add(dome);
  const base = mesh(geo('nd-b', () => blob(0.5, 1, 0.2, 4.4, 1.4, 0.5, 1.3)), M.flesh); base.position.y = -0.45; g.add(base);
  const barrel = new THREE.Group(); barrel.position.y = -0.05; g.add(barrel);
  const bm = mesh(geo('nd-bar', () => { const c = new THREE.CylinderGeometry(0.08, 0.11, 0.7, 8); c.rotateZ(Math.PI / 2); c.translate(0.35, 0, 0); return c; }), M.gunmetal); barrel.add(bm);
  const eye = mesh(geo('nd-e', () => new THREE.SphereGeometry(0.13, 10, 8)), M.gEye); eye.position.y = 0.12; g.add(eye);
  return { obj: g, anim(e, t) { g.rotation.z = e.flip ? Math.PI : 0; barrel.rotation.z = (e.flip ? e.ang + Math.PI : e.ang); eye.scale.setScalar(1 + Math.sin(t * 6) * 0.15); } };
};
B.stilter = () => {
  const M = materials(), g = new THREE.Group();
  const body = mesh(geo('st-b', () => blob(0.5, 1, 0.1, 6.1, 1.3, 0.7, 0.9)), M.gunmetal); body.position.y = 0.15; g.add(body);
  const eye = mesh(geo('st-e', () => new THREE.SphereGeometry(0.12, 10, 8)), M.gEye); eye.position.set(-0.45, 0.25, 0); g.add(eye);
  const legG = geo('st-l', () => { const c = new THREE.CylinderGeometry(0.04, 0.06, 0.9, 6); c.translate(0, -0.45, 0); return c; });
  const legs = [-0.4, 0, 0.4].map((x, k) => { const l = mesh(legG, M.steel); l.position.set(x, 0, k === 1 ? 0.3 : -0.2); g.add(l); return l; });
  return { obj: g, anim(e, t) { g.rotation.z = e.flip ? Math.PI : 0; legs.forEach((l, k) => { l.rotation.z = Math.sin(t * 9 + k * 2) * 0.45; }); body.position.y = 0.15 + Math.abs(Math.sin(t * 9)) * 0.06; } };
};
B.puff = () => {
  const M = materials(), g = new THREE.Group();
  const b = mesh(geo('pf-b', () => blob(0.85, 2, 0.14, 8.8)), M.fleshTeal); g.add(b);
  const pores = spikeRing(8, 0.82, 0.18, 0.09, M.gBio); g.add(pores);
  return { obj: g, anim(e, t) { const k = 1 + Math.sin(t * 4 + e.id) * 0.06; b.scale.setScalar(k); g.rotation.z = t * 0.4; } };
};
B.spore = () => { const M = materials(), g = new THREE.Group(); g.add(mesh(geo('sp-b', () => blob(0.26, 1, 0.2, 2.2)), M.fleshTeal)); const c = mesh(geo('sp-c', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gBio); g.add(c); return { obj: g, anim(e, t) { g.rotation.z = t * 6; } }; };
B.nit = () => { const M = materials(), g = new THREE.Group(); g.add(mesh(geo('nt-b', () => new THREE.TetrahedronGeometry(0.3, 0)), M.chitin)); const c = mesh(geo('nt-c', () => new THREE.SphereGeometry(0.09, 8, 6)), M.gEye); c.position.x = -0.15; g.add(c); return { obj: g, anim(e, t) { g.rotation.x = t * 8; g.rotation.y = t * 5; } }; };
B.dart = () => { const M = materials(), g = new THREE.Group(); const c = mesh(geo('dt-b', () => { const x = new THREE.ConeGeometry(0.16, 0.7, 6); x.rotateZ(Math.PI / 2); return x; }), M.steel); g.add(c); const f = mesh(geo('dt-f', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gAmber); f.position.x = 0.35; g.add(f); return { obj: g, anim(e) { if (e.vx || e.vy) g.rotation.z = Math.atan2(e.vy, e.vx) + Math.PI; } }; };
B.coilworm = (e) => {
  const M = materials(), g = new THREE.Group();
  const head = new THREE.Group(); g.add(head);
  head.add(mesh(geo('cw-h', () => blob(0.7, 2, 0.1, 3.9, 1.3, 0.9, 0.9)), M.flesh));
  const jaw = spikeRing(4, 0.45, 0.5, 0.09, M.bone, 'x'); jaw.position.x = -0.7; jaw.rotation.z = Math.PI / 2; head.add(jaw);
  const eye = mesh(geo('cw-e', () => new THREE.SphereGeometry(0.16, 10, 8)), M.gEye); eye.position.set(-0.55, 0.25, 0.3); head.add(eye);
  const eye2 = eye.clone(); eye2.position.z = -0.3; head.add(eye2);
  const segG = geo('cw-s', () => blob(0.58, 1, 0.08, 1.1)), bandG = geo('cw-band', () => new THREE.TorusGeometry(0.5, 0.08, 6, 18));
  const segs = [];
  for (let k = 1; k < e.parts.length; k++) {
    const s = new THREE.Group(); s.add(mesh(segG, M.fleshTeal)); const band = mesh(bandG, M.steel); band.rotation.y = Math.PI / 2; s.add(band);
    const sc = e.parts[k].r / 0.6; s.scale.setScalar(sc); g.add(s); segs.push(s);
  }
  return { obj: g, anim(e2, t) { e2.parts.forEach((p, k) => { if (k) { segs[k - 1].position.set(p.ox, p.oy, 0); segs[k - 1].rotation.x = t * 2 + k; } }); jaw.rotation.x = Math.sin(t * 6) * 0.4; } };
};
B.hatcher = () => {
  const M = materials(), g = new THREE.Group();
  const sac = mesh(geo('ht-s', () => blob(1.05, 2, 0.12, 5.5, 1.2, 0.9, 1)), M.flesh); sac.position.y = -0.3; g.add(sac);
  const lips = spikeRing(7, 0.4, 0.5, 0.11, M.bone, 'x'); lips.position.y = 0.55; lips.rotation.z = Math.PI / 2; lips.rotation.y = Math.PI / 2; g.add(lips);
  const mouth = mesh(geo('ht-m', () => new THREE.SphereGeometry(0.3, 12, 8)), M.gBio); mouth.position.y = 0.5; g.add(mouth);
  return { obj: g, anim(e, t) { g.rotation.z = e.flip ? Math.PI : 0; const k = 1 + Math.sin(t * 3) * 0.05; sac.scale.set(k, 2 - k, k); mouth.scale.setScalar(0.7 + 0.3 * Math.sin(t * 6)); } };
};
B.bulwark = () => {
  const M = materials(), g = new THREE.Group();
  const core = mesh(geo('bw-c', () => new THREE.IcosahedronGeometry(0.55, 1)), M.gRed); g.add(core);
  const shellG = geo('bw-s', () => new THREE.SphereGeometry(1.08, 20, 14, 0, Math.PI));
  const shellM = M.gunmetal.clone(); shellM.side = THREE.DoubleSide;
  const top = mesh(shellG, shellM), bot = mesh(shellG, shellM);
  const pt = new THREE.Group(), pb = new THREE.Group(); pt.add(top); pb.add(bot); top.rotation.x = -Math.PI / 2; bot.rotation.x = Math.PI / 2; g.add(pt, pb);
  const spikes = spikeRing(10, 1.08, 0.3, 0.07, M.darkSteel); g.add(spikes);
  return { obj: g, anim(e, t) { const o = e.open * 0.85; pt.rotation.z = o; pb.rotation.z = -o; core.rotation.y = t * 2; core.scale.setScalar(0.8 + e.open * 0.4); spikes.rotation.z = t * 0.3; } };
};
B.thistle = () => {
  const M = materials(), g = new THREE.Group();
  g.add(mesh(geo('th-b', () => new THREE.OctahedronGeometry(0.34, 0)), M.gAmber));
  g.add(spikeRing(8, 0.34, 0.5, 0.05, M.steel));
  const s2 = spikeRing(8, 0.34, 0.5, 0.05, M.steel, 'x'); g.add(s2);
  return { obj: g, anim(e, t) { g.rotation.z = t * 1.5; g.rotation.y = t; } };
};
B.skimmer = () => {
  const M = materials(), g = new THREE.Group();
  g.add(mesh(geo('sk-b', () => { const c = latheX([[-0.55, 0], [-0.3, 0.14], [0.4, 0.12], [0.5, 0]], 8); c.scale(1, 0.5, 1); c.rotateY(Math.PI); return c; }), M.steel));
  const w = mesh(geo('sk-w', () => new THREE.BoxGeometry(0.4, 0.03, 1.0)), M.darkSteel); w.position.x = 0.15; g.add(w);
  const f = mesh(geo('sk-f', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gMagenta); f.position.x = 0.55; g.add(f);
  return { obj: g, anim(e) { g.rotation.z = Math.atan2(e.vy || 0, -(e.vx || -1)) * -1; } };
};
B.cannon = () => {
  const M = materials(), g = new THREE.Group();
  const base = mesh(geo('cn-b', () => new THREE.CylinderGeometry(0.85, 1.0, 0.4, 12)), M.hull); base.position.y = -0.4; g.add(base);
  const tur = mesh(geo('cn-t', () => new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.gunmetal); tur.position.y = -0.25; g.add(tur);
  const bar = new THREE.Group(); bar.position.y = 0.05; g.add(bar);
  const bg = geo('cn-bar', () => { const c = new THREE.CylinderGeometry(0.09, 0.12, 1.1, 8); c.rotateZ(Math.PI / 2); c.translate(0.55, 0, 0); return c; });
  for (const z of [0.16, -0.16]) { const b = mesh(bg, M.steel); b.position.z = z; bar.add(b); }
  const lamp = mesh(geo('cn-l', () => new THREE.SphereGeometry(0.1, 8, 6)), M.gAmber); lamp.position.set(0, 0.25, 0.4); g.add(lamp);
  return { obj: g, anim(e, t) { g.rotation.z = e.flip ? Math.PI : 0; bar.rotation.z = e.flip ? e.ang + Math.PI : e.ang; lamp.visible = Math.floor(t * 3) % 2 === 0; } };
};
B.engine = () => {
  const M = materials(), g = new THREE.Group();
  const noz = mesh(geo('en-n', () => { const c = latheX([[0.9, 0.7], [0.2, 1.05], [-0.6, 1.25], [-0.9, 1.3]], 20); return c; }), M.gunmetal);
  noz.material = M.gunmetal.clone(); noz.material.side = THREE.DoubleSide; g.add(noz);
  const innerM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(2), toneMapped: false });
  const inner = mesh(geo('en-i', () => { const c = new THREE.CircleGeometry(1.05, 24); c.rotateY(-Math.PI / 2); return c; }), innerM); inner.position.x = -0.2; g.add(inner);
  const ribs = spikeRing(8, 1.25, 0.3, 0.1, M.darkSteel, 'x'); ribs.position.x = 0.4; g.add(ribs);
  return { obj: g, anim(e, t) { const k = e.burning ? 2.4 + Math.sin(t * 50) * 0.6 : 0.35; innerM.color.setRGB(1.0 * k, 0.6 * k, 0.25 * k); } };
};
B.vent = () => {
  const M = materials(), g = new THREE.Group();
  const box = mesh(geo('vn-b', () => new THREE.BoxGeometry(1.5, 0.5, 1.4)), M.hull); box.position.y = -0.3; g.add(box);
  const hg = geo('vn-h', () => new THREE.BoxGeometry(0.7, 0.08, 1.2));
  const h1 = mesh(hg, M.darkSteel), h2 = mesh(hg, M.darkSteel); h1.position.set(-0.36, 0, 0); h2.position.set(0.36, 0, 0); g.add(h1, h2);
  const glow = mesh(geo('vn-g', () => new THREE.BoxGeometry(1.1, 0.05, 1.0)), M.gAmber); glow.position.y = -0.05; g.add(glow);
  return { obj: g, anim(e, t) { g.rotation.z = e.flip ? Math.PI : 0; const o = Math.max(0, Math.sin(e.t * 0.07)) * 0.9; h1.rotation.z = o; h2.rotation.z = -o; } };
};

// ---------------------------------------------------------------- ボス
B.ossuary = (e) => {
  const M = materials(), g = new THREE.Group();
  const parts = {};
  const body = mesh(geo('os-body', () => blob(2.3, 3, 0.09, 1.9, 1.05, 1.15, 1.1)), M.flesh); g.add(body);
  const lobes = [2, 3].map((k) => { const m = mesh(geo('os-lobe', () => blob(1.5, 2, 0.12, 4.2)), M.flesh); g.add(m); return m; });
  // 肋骨
  const ribG = geo('os-rib', () => new THREE.TorusGeometry(2.4, 0.13, 8, 30, Math.PI * 0.9));
  for (let k = 0; k < 5; k++) { const r = mesh(ribG, M.bone); r.rotation.y = Math.PI / 2; r.rotation.x = -Math.PI * 0.45; r.position.set(1.2 + k * 0.55, 0, 0); r.scale.setScalar(1 - Math.abs(k - 2) * 0.12); g.add(r); }
  const coreM = new THREE.MeshBasicMaterial({ color: 0xff4fb4, toneMapped: false });
  const core = mesh(geo('os-core', () => new THREE.IcosahedronGeometry(0.95, 2)), coreM); g.add(core);
  const petalG = geo('os-petal', () => { const c = new THREE.ConeGeometry(0.75, 2.4, 6, 1); c.scale(1, 1, 0.45); return c; });
  const petals = e.petals.map(() => { const m = mesh(petalG, M.bone); g.add(m); return m; });
  const tailG = geo('os-tail', () => blob(0.55, 1, 0.15, 6.6));
  const tail = e.tail.map((p) => { const m = mesh(tailG, M.bone); m.scale.setScalar(p.r / 0.55); g.add(m); return m; });
  const eyes = [];
  for (let k = 0; k < 6; k++) { const m = mesh(geo('os-eye', () => new THREE.SphereGeometry(0.16, 10, 8)), M.gEye); m.position.set(1.3 + (k % 3) * 0.7, (k < 3 ? 1 : -1) * (1.6 + (k % 3) * 0.2), 1.6); g.add(m); eyes.push(m); }
  const flash = flashShell(1.1); g.add(flash);
  parts.update = (b, t) => {
    body.position.set(b.parts[1].ox, b.parts[1].oy, 0);
    lobes[0].position.set(b.parts[2].ox, b.parts[2].oy, -0.3); lobes[1].position.set(b.parts[3].ox, b.parts[3].oy, -0.3);
    core.position.set(b.parts[0].ox, b.parts[0].oy, 0.4);
    const pulse = b.parts[0].active ? 2.8 + Math.sin(t * 18) * 0.8 : 0.9;
    coreM.color.setRGB(1.0 * pulse, 0.31 * pulse, 0.7 * pulse);
    core.scale.setScalar(0.75 + b.open * 0.35);
    b.petals.forEach((p, k) => { const m = petals[k]; m.position.set(p.ox, p.oy, 0.6); m.rotation.z = Math.atan2(p.oy, p.ox - 0.3) - Math.PI / 2; });
    b.tail.forEach((p, k) => { tail[k].position.set(p.ox, p.oy, 0); tail[k].rotation.z = t + k; });
    for (const m of eyes) m.scale.setScalar(0.8 + 0.3 * Math.sin(t * 4 + m.position.x));
    flash.position.copy(core.position); flash.visible = b.flash > 0; flash.scale.setScalar(1.05);
  };
  return { obj: g, anim: parts.update };
};
B.vesper = (e) => {
  const M = materials(), g = new THREE.Group();
  const head = new THREE.Group(); g.add(head);
  head.add(mesh(geo('vs-h', () => blob(1.0, 2, 0.08, 2.9, 1.5, 0.85, 0.95)), M.chitin));
  const crest = spikeRing(5, 0.7, 0.9, 0.12, M.bone, 'x'); crest.position.x = 0.7; crest.rotation.z = -Math.PI / 2; head.add(crest);
  const jawG = geo('vs-j', () => { const c = new THREE.ConeGeometry(0.28, 1.4, 6); c.rotateZ(Math.PI / 2); c.translate(-0.7, 0, 0); return c; });
  const jt = mesh(jawG, M.bone), jb = mesh(jawG, M.bone); jt.position.set(-0.6, 0.25, 0); jb.position.set(-0.6, -0.25, 0); head.add(jt, jb);
  const coreM = new THREE.MeshBasicMaterial({ color: 0xff4fb4, toneMapped: false });
  const core = mesh(geo('vs-core', () => new THREE.SphereGeometry(0.55, 16, 12)), coreM); core.position.x = -0.6; head.add(core);
  for (const z of [0.55, -0.55]) { const m = mesh(geo('vs-eye', () => new THREE.SphereGeometry(0.15, 10, 8)), M.gEye); m.position.set(-0.3, 0.42, z); head.add(m); }
  const segG = geo('vs-s', () => blob(0.8, 1, 0.07, 3.3)), bandG = geo('vs-b', () => new THREE.TorusGeometry(0.72, 0.12, 6, 20));
  const segs = [];
  for (let k = 0; k < 18; k++) {
    const s = new THREE.Group(); s.add(mesh(segG, M.flesh)); const b = mesh(bandG, M.steel); b.rotation.y = Math.PI / 2; s.add(b);
    const sp = spikeRing(3, 0.75, 0.4, 0.08, M.bone); s.add(sp);
    s.scale.setScalar(e.parts[k + 2].r / 0.8); g.add(s); segs.push(s);
  }
  const flash = flashShell(0.9); head.add(flash); flash.position.x = -0.6;
  return {
    obj: g, anim(b, t) {
      head.rotation.z = (b.dir ?? Math.PI) - Math.PI; head.position.set(0, 0, 0);
      const o = b.mouth * 0.5; jt.rotation.z = o; jb.rotation.z = -o;
      const pulse = b.parts[0].active ? 2.8 + Math.sin(t * 18) * 0.8 : 0.5;
      coreM.color.setRGB(pulse, 0.3 * pulse, 0.7 * pulse);
      for (let k = 0; k < 18; k++) { const p = b.parts[k + 2]; segs[k].position.set(p.ox, p.oy, 0); segs[k].rotation.x = t * 1.5 + k * 0.4; }
      flash.visible = b.flash > 0;
    },
  };
};
B.keelheart = (e) => {
  const M = materials(), g = new THREE.Group();
  const coreM = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
  const core = mesh(geo('kh-c', () => new THREE.IcosahedronGeometry(1.2, 3)), coreM); g.add(core);
  const ringG = geo('kh-r', () => new THREE.TorusGeometry(1.6, 0.1, 8, 40));
  const rings = [0, 1, 2].map((k) => { const r = mesh(ringG, M.steel); r.scale.setScalar(1 + k * 0.12); g.add(r); return r; });
  const frame = mesh(geo('kh-f', () => new THREE.TorusGeometry(3.6, 0.35, 8, 40)), M.hull); frame.position.z = -1.2; g.add(frame);
  const plateG = geo('kh-p', () => new THREE.BoxGeometry(0.6, 2.0, 1.3)), plate2G = geo('kh-p2', () => new THREE.BoxGeometry(0.45, 1.1, 1.0));
  const plates = e.parts.filter((p) => p.plate != null || p.plate2 != null).map((p) => { const m = mesh(p.plate != null ? plateG : plate2G, M.hull); g.add(m); return { m, p }; });
  const flash = flashShell(1.3); g.add(flash);
  return {
    obj: g, anim(b, t) {
      const pulse = 2.2 + Math.sin(t * 7) * 0.5 + (b.flash > 0 ? 1.5 : 0);
      coreM.color.setRGB(pulse, 0.65 * pulse, 0.25 * pulse);
      rings.forEach((r, k) => { r.rotation.x = t * (0.6 + k * 0.3); r.rotation.y = t * (0.4 - k * 0.25); });
      for (const { m, p } of plates) { m.position.set(p.ox, p.oy, 0.2); m.rotation.z = Math.atan2(p.oy, p.ox); }
      flash.visible = b.flash > 0;
    },
  };
};
B.heart = (e) => {
  const M = materials(), g = new THREE.Group();
  const coreM = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uOpen: { value: 0 }, uFlash: { value: 0 } }, toneMapped: false,
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uTime; uniform float uOpen; uniform float uFlash; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.-abs(vN.z), 2.); float b = 0.5+0.5*sin(vP.x*6.+uTime*3.)*sin(vP.y*5.-uTime*2.); vec3 c = mix(vec3(0.5,0.2,1.2), vec3(1.8,0.9,2.4), b) * (0.6+uOpen*1.6) + f*vec3(0.4,1.2,1.0) + uFlash; gl_FragColor = vec4(c,1.); }',
  });
  const core = mesh(geo('hr-c', () => new THREE.IcosahedronGeometry(1.35, 3)), coreM); g.add(core);
  const shellG = geo('hr-s', () => new THREE.SphereGeometry(1.8, 24, 16, 0, Math.PI));
  const shellM = M.chitin.clone(); shellM.side = THREE.DoubleSide;
  const shell = mesh(shellG, shellM); shell.rotation.y = -Math.PI / 2; g.add(shell);
  const petalG = geo('hr-p', () => { const o = new THREE.OctahedronGeometry(0.9, 0); o.scale(1.6, 0.7, 0.5); return o; });
  const petals = e.petals.map(() => { const m = mesh(petalG, M.crystalViolet.clone()); g.add(m); return m; });
  const halo = mesh(geo('hr-h', () => new THREE.TorusGeometry(3.3, 0.04, 6, 64)), M.gViolet); g.add(halo);
  return {
    obj: g, anim(b, t) {
      coreM.uniforms.uOpen.value = b.open; coreM.uniforms.uFlash.value = b.flash > 0 ? 0.8 : 0;
      core.rotation.y = t * 0.5; core.rotation.x = t * 0.3;
      const sp = b.parts[1]; shell.position.set(sp.ox - 1.1, sp.oy, 0); shell.rotation.z = b.open * 1.2; shell.visible = !sp.off || b.open < 0.95;
      b.petals.forEach((p, k) => { const m = petals[k]; m.visible = !p.gone; m.position.set(p.ox, p.oy, 0); m.rotation.z = Math.atan2(p.oy, p.ox); m.material.emissive.setHex(p.flash > 0 ? 0xffffff : 0x240a40); if (p.flash > 0) p.flash--; });
      halo.rotation.z = -t * 0.2; halo.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
    },
  };
};

export const ENEMY_BUILDERS = B;
export function buildEnemy(e) {
  const f = B[e.type];
  const r = f ? f(e) : { obj: new THREE.Mesh(new THREE.SphereGeometry(e.r), materials().gRed), anim() {} };
  if (!e.boss) { const fl = flashShell(e.r * 1.05); r.obj.add(fl); const a = r.anim; r.anim = (x, t) => { a(x, t); fl.visible = x.flash > 0; }; }
  return r;
}
