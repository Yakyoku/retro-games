// Sky Climber VR — 障害物と予告の表示（落下物・破片・ゴンドラ・クレーンの鉄骨・ネオンの火花・保持点の目印・予告の帯）。
import * as THREE from 'three';
import { bevelBox } from './building.js';
import { makeTextTexture } from './textures.js';

function lathe(pts, seg = 20) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

// 落下物（陶器の植木鉢・空き缶・ブリキのバケツ・ガラスびん）: 素材の違いが分かるように金属・陶器・ガラスで作る
export function makeItem(kind, envMap) {
  const g = new THREE.Group();
  if (kind === 'pot') {
    const pot = new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.075, 0.01], [0.1, 0.13], [0.115, 0.14], [0.115, 0.165], [0.1, 0.165], [0.09, 0.15], [0, 0.15]]), new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.75 }));
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.092, 16), new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.148;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 0.8, flatShading: true })); leaf.position.y = 0.24; leaf.scale.set(1, 1.3, 1);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff5a7a, roughness: 0.5 })); fl.position.set(0.04, 0.33, 0.03);
    g.add(pot, soil, leaf, fl); g.children.forEach((c) => (c.position.y -= 0.12));
  } else if (kind === 'can') {
    const tex = makeTextTexture((c, w, h) => { c.fillStyle = '#e23b2e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(0, h * 0.42, w, h * 0.16); c.fillStyle = '#e23b2e'; c.font = `900 ${h * 0.12}px sans-serif`; c.fillText('SODA', w * 0.1, h * 0.54); }, 256, 128).tex;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 20), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.85, roughness: 0.25, envMap }));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.008, 20), new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.95, roughness: 0.2, envMap })); lid.position.y = 0.064;
    g.add(can, lid);
  } else if (kind === 'bucket') {
    const b = new THREE.Mesh(lathe([[0, 0], [0.11, 0], [0.14, 0.2], [0.15, 0.205], [0.14, 0.21], [0.13, 0.205], [0.1, 0.01], [0, 0.01]], 24), new THREE.MeshStandardMaterial({ color: 0xa6b0b8, metalness: 0.9, roughness: 0.35, envMap, side: THREE.DoubleSide }));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.006, 6, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x777, metalness: 0.9, roughness: 0.3 })); handle.position.y = 0.2;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshStandardMaterial({ color: 0x5aa0d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, envMap })); water.rotation.x = -Math.PI / 2; water.position.y = 0.16;
    g.add(b, handle, water); g.children.forEach((c) => (c.position.y -= 0.1));
  } else {
    const glass = new THREE.MeshStandardMaterial({ color: 0x3f9a5a, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.7, envMap, envMapIntensity: 2 });
    const bt = new THREE.Mesh(lathe([[0, 0], [0.035, 0], [0.037, 0.015], [0.037, 0.13], [0.02, 0.17], [0.014, 0.2], [0.016, 0.21], [0, 0.21]], 18), glass);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.015, 12), new THREE.MeshStandardMaterial({ color: 0xd8b13a, metalness: 0.9, roughness: 0.3 })); cap.position.y = 0.215;
    g.add(bt, cap); g.children.forEach((c) => (c.position.y -= 0.1));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// 破片（割れたときに飛び散る小片）。InstancedMesh 1 つを使い回す
export class Shards {
  constructor(max = 96) {
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.03), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.p = Array.from({ length: max }, () => ({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), color: new THREE.Color() }));
    this.i = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3();
    for (let k = 0; k < max; k++) { this.mesh.setMatrixAt(k, this.m4.makeScale(0, 0, 0)); this.mesh.setColorAt(k, new THREE.Color(1, 1, 1)); }
  }
  burst(x, y, z, kind) {
    const col = { pot: 0xb4532a, can: 0xcfd3d6, bucket: 0xa6b0b8, bottle: 0x3f9a5a, spark: 0xfff3a0, glass: 0xbfe4ff }[kind] || 0xffffff;
    for (let k = 0; k < 14; k++) {
      const p = this.p[this.i]; this.i = (this.i + 1) % this.p.length;
      p.life = 0.9; p.pos.set(x, y, z); p.vel.set((Math.random() - 0.5) * 2.4, Math.random() * 2.2, Math.random() * 1.4);
      p.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10); p.color.set(col).multiplyScalar(0.8 + Math.random() * 0.4);
      this.mesh.setColorAt(this.p.indexOf(p), p.color);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    this.p.forEach((p, k) => {
      if (p.life <= 0) return; any = true;
      p.life -= dt; p.vel.y -= 9.8 * dt; p.pos.addScaledVector(p.vel, dt); p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt;
      const sc = Math.max(0, Math.min(1, p.life * 3));
      this.mesh.setMatrixAt(k, this.m4.compose(p.pos, this.q.setFromEuler(p.rot), this.s.set(sc, sc, sc)));
    });
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// 予告の表示: 落下物の真下へ伸びる帯（壁に落ちる影）・鳥の進路の点線・大型障害の範囲
export class Warnings {
  constructor() {
    this.group = new THREE.Group();
    // 山形（シェブロン）の帯。上下の縁は透明へぼかし、流れる向きで「来る方向」が分かる（項目 29）
    const stripe = makeTextTexture((c, w, h) => { c.clearRect(0, 0, w, h);
      for (let i = -64; i < w + 64; i += 64) { c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 22, 0); c.lineTo(i + 22 + h / 2, h / 2); c.lineTo(i + 22, h); c.lineTo(i, h); c.lineTo(i + h / 2, h / 2); c.fill(); }
      c.globalCompositeOperation = 'destination-in'; const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(0,0,0,1)'); g.addColorStop(0.75, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 256, 64).tex;
    stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping;
    this.stripe = stripe;
    this.pool = [];
  }
  // 毎フレーム、必要な数だけ板を出す。items: [{x, y0, y1, w, color, kind}]
  set(items) {
    while (this.pool.length < items.length) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.stripe.clone(), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      m.material.map.needsUpdate = true; m.renderOrder = 3; this.group.add(m); this.pool.push(m);
    }
    this.pool.forEach((m, i) => {
      const it = items[i]; m.visible = !!it; if (!it) return;
      const h = Math.max(0.05, it.y1 - it.y0);
      // 縦長の帯（落下物）は板を 90° 回して、山形が進む向きへ流れるようにする
      const vertical = h > it.w * 1.5;
      m.position.set(it.x, (it.y0 + it.y1) / 2, it.z ?? 0.07); m.rotation.z = vertical ? -Math.PI / 2 : 0;
      if (vertical) m.scale.set(h, it.w, 1); else m.scale.set(it.w, h, 1);
      m.material.opacity = (it.alpha ?? 0.45) * 1.3; m.material.color.set(it.color ?? 0xffffff);
      const long = vertical ? h : it.w, short = vertical ? it.w : h;
      m.material.map.repeat.set(Math.max(1, long / Math.max(0.3, short) / 2.5), 1); m.material.map.offset.x = -(performance.now() / 1000) * (it.speed ?? 0.6);
    });
  }
}

// 保持点の目印: 手の近くの保持点だけ、小さな光の輪を控えめに出す（つかめる＝白、伸ばす先＝黄、閉じかけ＝赤）
export class HoldMarkers {
  constructor(max = 64) {
    // 柔らかく光る輪＋中心の点（項目 29）。加算合成なので壁の色になじみ、明るい所でも読める縁どりつき
    const tex = makeTextTexture((c, w, h) => { c.clearRect(0, 0, w, h); const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.1, 'rgba(255,255,255,0.9)'); g.addColorStop(0.16, 'rgba(255,255,255,0.0)'); g.addColorStop(0.52, 'rgba(255,255,255,0.0)'); g.addColorStop(0.62, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 128, 128).tex;
    const geo = new THREE.PlaneGeometry(0.15, 0.15);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), max);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.max = max;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.c = new THREE.Color();
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); this.mesh.setColorAt(i, this.c.set(0xffffff)); }
  }
  // list: [{x,y,state:'ok'|'target'|'closing'|'grab', a}]
  set(list) {
    const t = performance.now() / 1000;
    for (let i = 0; i < this.max; i++) {
      const h = list[i];
      if (!h) { this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); continue; }
      const s = (h.state === 'target' || h.state === 'grab' ? 1.35 + Math.sin(t * 8) * 0.12 : 1) * (h.a ?? 1);
      this.mesh.setMatrixAt(i, this.m4.compose(new THREE.Vector3(h.x, h.y, 0.075), this.q, new THREE.Vector3(s, s, s)));
      this.mesh.setColorAt(i, this.c.set(h.state === 'target' ? 0xffd34a : h.state === 'grab' ? 0x7dffb0 : h.state === 'closing' ? 0xff5a4a : 0xffffff).multiplyScalar(h.a ?? 1));
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

// ゴンドラ（窓ふき用）: 吊り索・手すり・作業員の道具
export function makeGondola(envMap) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xe0e4e8, metalness: 0.7, roughness: 0.35, envMap });
  const y = new THREE.MeshStandardMaterial({ color: 0xf2b630, roughness: 0.5 });
  const deck = new THREE.Mesh(bevelBox(2.3, 0.12, 0.7, 0.02), m); deck.position.set(0, 0.3, 0.45); g.add(deck);
  const front = new THREE.Mesh(bevelBox(2.3, 0.55, 0.04, 0.01), y); front.position.set(0, 0.62, 0.8); g.add(front);
  for (const s of [-1, 1]) { const side = new THREE.Mesh(bevelBox(0.04, 0.55, 0.7, 0.01), y); side.position.set(s * 1.13, 0.62, 0.45); g.add(side); }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 10), m); rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.0, 0.8); g.add(rail);
  for (const s of [-1, 1]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 60, 6), new THREE.MeshStandardMaterial({ color: 0x333333 })); rope.position.set(s * 1.0, 30.3, 0.45); g.add(rope); }
  const bucket = makeItem('bucket', envMap); bucket.position.set(0.6, 0.48, 0.5); g.add(bucket);
  // 黄黒のしま（危険表示）と、点滅する警告灯・巻上げ機（項目 28）
  const haz = makeTextTexture((c, w, h) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1a1a'; for (let i = -h; i < w; i += 48) { c.beginPath(); c.moveTo(i, h); c.lineTo(i + 24, h); c.lineTo(i + 24 + h, 0); c.lineTo(i + h, 0); c.fill(); } }, 512, 64).tex;
  const band = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.16), new THREE.MeshStandardMaterial({ map: haz, roughness: 0.6 })); band.position.set(0, 0.42, 0.823); g.add(band);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(bevelBox(0.22, 0.26, 0.3, 0.02), m); w.position.set(s * 1.0, 1.02, 0.45); g.add(w); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false })); lamp.position.set(0, 1.12, 0.8); g.add(lamp);
  g.userData.lamp = lamp;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
// クレーンで吊った鉄骨（H 形鋼）
export function makeBeam(envMap) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xc8452a, metalness: 0.6, roughness: 0.5, envMap });
  const s = new THREE.Shape(); const W = 0.3, H = 0.4, t = 0.04;
  s.moveTo(-W / 2, -H / 2); s.lineTo(W / 2, -H / 2); s.lineTo(W / 2, -H / 2 + t); s.lineTo(t / 2, -H / 2 + t); s.lineTo(t / 2, H / 2 - t); s.lineTo(W / 2, H / 2 - t); s.lineTo(W / 2, H / 2);
  s.lineTo(-W / 2, H / 2); s.lineTo(-W / 2, H / 2 - t); s.lineTo(-t / 2, H / 2 - t); s.lineTo(-t / 2, -H / 2 + t); s.lineTo(-W / 2, -H / 2 + t);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.8, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
  geo.rotateY(Math.PI / 2); geo.translate(-1.4, 0, 0);
  const beam = new THREE.Mesh(geo, m); beam.position.z = 0.55; beam.castShadow = true; g.add(beam);
  for (const x of [-1.0, 1.0]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.8 })); c.position.set(x * 0.6, 0.85, 0.55); c.rotation.z = x * 0.42; g.add(c); }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.7, roughness: 0.3 })); hook.position.set(0, 1.55, 0.55); g.add(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 40, 6), new THREE.MeshStandardMaterial({ color: 0x222222 })); cable.position.set(0, 21.6, 0.55); g.add(cable);
  // 両端の赤い旗（揺れる）と警告灯
  const flags = [];
  for (const x of [-1.38, 1.38]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), new THREE.MeshStandardMaterial({ color: 0xff2a1a, roughness: 0.8, side: THREE.DoubleSide })); f.position.set(x, -0.3, 0.55); g.add(f); flags.push(f); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false })); lamp.position.set(0, 0.26, 0.72); g.add(lamp);
  g.userData.lamp = lamp; g.userData.flags = flags;
  return g;
}
// 火花（ネオンの放電）: 小さな光の粒
export class Sparks {
  constructor(max = 80) {
    this.geo = new THREE.BufferGeometry(); this.pos = new Float32Array(max * 3); this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: 0xbff4ff, size: 0.14, map: softDot(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.max = max; this.v = new Float32Array(max * 3); this.life = new Float32Array(max);
  }
  emit(x, y, z, n = 6, spread = 1) {
    for (let k = 0; k < n; k++) { const i = Math.floor(Math.random() * this.max); this.pos.set([x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 2, z], i * 3);
      this.v.set([(Math.random() - 0.5) * 3, Math.random() * 2, Math.random() * 1.5], i * 3); this.life[i] = 0.4 + Math.random() * 0.3; }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) { if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1e4; continue; } this.life[i] -= dt; this.v[i * 3 + 1] -= 6 * dt; for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.v[i * 3 + k] * dt; }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// 柔らかい点（火花・煙・雨のしぶき用）
let _dot = null;
export function softDot() {
  if (_dot) return _dot;
  _dot = makeTextTexture((c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 64, 64).tex;
  return _dot;
}
// 煙・粉じん（割れた瞬間にふくらんで消える）と、落下物の光の尾（項目 28）
export class Puffs {
  constructor(max = 14) {
    this.tex = softDot(); this.group = new THREE.Group(); this.pool = [];
    for (let i = 0; i < max; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false })); sp.visible = false; this.group.add(sp); this.pool.push({ sp, life: 0, max: 1, vx: 0, vy: 0, s0: 0.2, s1: 0.8 }); }
    this.i = 0;
    this.trailTex = makeTextTexture((c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.8)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'destination-in'; const g2 = c.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.fillRect(0, 0, w, h); }, 32, 128).tex;
  }
  burst(x, y, z, kind) {
    const col = { pot: 0xb89a80, bucket: 0xbfe0ff, bottle: 0xd8ffe0, can: 0xdddddd, spark: 0xbff4ff, glass: 0xffffff }[kind] ?? 0xdddddd;
    for (let k = 0; k < 4; k++) { const p = this.pool[this.i]; this.i = (this.i + 1) % this.pool.length;
      p.life = p.max = 0.55 + Math.random() * 0.35; p.vx = (Math.random() - 0.5) * 0.9; p.vy = 0.2 + Math.random() * 0.5; p.s0 = 0.18; p.s1 = 0.7 + Math.random() * 0.5;
      p.sp.position.set(x + (Math.random() - 0.5) * 0.15, y, z + 0.05); p.sp.material.color.setHex(col); p.sp.visible = true; }
  }
  update(dt) {
    for (const p of this.pool) { if (p.life <= 0) { p.sp.visible = false; continue; } p.life -= dt; const k = 1 - p.life / p.max;
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k)); p.sp.scale.set(s, s, 1); p.sp.material.opacity = 0.5 * (1 - k); }
  }
  makeTrail() { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.trailTex, color: 0xffe9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); m.renderOrder = 3; return m; }
}
// 天気の粒子（項目 26）: 夜＝雨の筋（奥行きで濃さが違う 2 層）と窓台のしぶき、超高層＝風の筋、昼・夕方・超高層＝舞う葉や紙
export class Weather {
  constructor(theme) {
    this.theme = theme; this.group = new THREE.Group(); this.t = 0;
    const rain = theme === 'night', wind = theme === 'tower';
    if (rain || wind) {
      const n = this.n = rain ? 900 : 180; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
      const col = new Float32Array(n * 6); for (let i = 0; i < n; i++) { const a = rain ? 0.25 + Math.random() * 0.75 : 0.5 + Math.random() * 0.5; col.set([0, 0, 0, a, a, a], i * 6); } // 尾は透明へ（頂点色で）
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: rain ? 0xa8bce0 : 0xffffff, vertexColors: true, transparent: true, opacity: rain ? 0.55 : 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.streaks.frustumCulled = false; this.seed = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random(), 0.7 + Math.random() * 0.6]); this.group.add(this.streaks);
    }
    if (rain) { // 窓台や帯ではねるしぶき
      const n = 60, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      this.splash = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.07, map: softDot(), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); this.splash.frustumCulled = false; this.splashN = n; this.group.add(this.splash);
    }
    if (theme !== 'night' && theme !== 'practice') {
      const n = this.leafN = wind ? 26 : 12;
      this.leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
      const c = new THREE.Color(), pal = wind ? [0xffffff, 0xf2f2e8, 0xe8e0c8] : theme === 'dusk' ? [0xd88a3a, 0xc8642a, 0xe8b84a] : [0x6aa84a, 0x8ac85a, 0xf2f2e8];
      for (let i = 0; i < n; i++) this.leaves.setColorAt(i, c.setHex(pal[i % pal.length]));
      this.leafSeed = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random(), Math.random()]); this.leaves.frustumCulled = false; this.group.add(this.leaves);
    }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion();
  }
  update(dt, c) {
    this.t += dt; const T = this.t;
    if (this.streaks) {
      const p = this.streaks.geometry.attributes.position.array;
      for (let i = 0; i < this.n; i++) {
        const [a, b, cc, sp] = this.seed[i];
        if (this.theme === 'night') { const x = c.x + (a - 0.5) * 14, z = c.z + (cc - 0.5) * 11 - 1.5, y = c.y + 6 - ((T * 10 * sp + b * 12) % 12); p.set([x + 0.05, y + 0.4 * sp, z, x, y, z], i * 6); }
        else { const y = c.y + (b - 0.5) * 9, z = c.z + (cc - 0.5) * 9, x = c.x + 11 - ((T * 15 * sp + a * 22) % 22); p.set([x + 1.1 * sp, y + 0.03, z, x, y, z], i * 6); }
      }
      this.streaks.geometry.attributes.position.needsUpdate = true;
    }
    if (this.splash) {
      const p = this.splash.geometry.attributes.position.array;
      for (let i = 0; i < this.splashN; i++) { const k = Math.floor(T * 6 + i * 0.37), r1 = Math.abs(Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1, r2 = Math.abs(Math.sin(k * 39.346 + i * 11.135) * 43758.5453) % 1, f = (T * 6 + i * 0.37) % 1;
        // 階の帯（2.6m ごと）と窓台（+0.72m）の高さに出す
        const row = Math.floor((c.y + (r2 - 0.5) * 6) / 2.6) * 2.6 + (i % 2 ? 0.72 : 0.06);
        p.set([c.x + (r1 - 0.5) * 9, row + f * 0.1 * (1 - f) * 4, 0.12 + (i % 2 ? 0.06 : 0)], i * 3); }
      this.splash.geometry.attributes.position.needsUpdate = true;
    }
    if (this.leaves) {
      const s = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), e = new THREE.Euler();
      for (let i = 0; i < this.leafN; i++) { const [a, b, cc, d] = this.leafSeed[i]; const sp = this.theme === 'tower' ? 5 : 1.6;
        const x = c.x + 9 - ((T * sp * (0.6 + d) + a * 18) % 18), y = c.y + (b - 0.5) * 7 + Math.sin(T * (1 + d) + a * 9) * 0.5, z = 0.6 + cc * 5 + Math.sin(T * 0.7 + b * 7) * 0.4;
        this.leaves.setMatrixAt(i, this.m4.compose(P.set(x, y, z), this.q.setFromEuler(e.set(T * (2 + d * 3), T * (1.3 + a * 2), T * 2.1 + b)), s)); }
      this.leaves.instanceMatrix.needsUpdate = true;
    }
  }
}
