// VR 版の人物。2D 版と同じ姿勢関数（shared/art/pose.js）の関節位置に、立体の部位を毎フレーム合わせる。
// 部位: 頭（顔・髪／ヘルメット・バイザー）・首・上着（胴の回転体）・腕 2 本・脚 2 本・手・靴・銃・ベルト（主人公はマフラーとコートの裾）。
// 正面・側面・背面から破綻しないよう、すべて閉じた立体で作る。
import * as THREE from 'three';
import { computePose, SKEL } from '../../shared/art/pose.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

function lambert(hex, extra = {}) { return new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), ...extra }); }

export class Person3D {
  constructor(look) {
    this.look = look;
    const g = this.root = new THREE.Group();
    this.inner = new THREE.Group(); g.add(this.inner); // 向き（+x / -x）
    const L = look;
    this.mats = {
      coat: lambert(L.coat), coatDark: lambert(L.coatDark), pants: lambert(L.pants), pantsDark: lambert(L.pantsDark),
      skin: lambert(L.skin), shoe: lambert(L.shoe), gun: lambert(L.gun), gunDark: lambert(L.gunDark), glove: lambert(L.glove || L.skin),
      hair: lambert(L.hair || '#111'), helmet: lambert(L.helmet || '#999'), visor: new THREE.MeshBasicMaterial({ color: L.visor || '#cdf' }),
      scarf: lambert(L.scarf || '#f90'), band: lambert(L.band || '#fc3'), vest: lambert(L.vest || '#444'), belt: lambert('#15161b'), eye: new THREE.MeshBasicMaterial({ color: 0x141414 }),
    };
    this.base = Object.fromEntries(Object.entries(this.mats).map(([k, m]) => [k, m.color.clone()]));
    const cap = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); this.inner.add(m); return m; };
    // 脚（奥 = z-、手前 = z+）
    this.legs = [0, 1].map((i) => ({
      thigh: cap(0.085, SKEL.thigh - 0.08, i ? this.mats.pantsDark : this.mats.pants),
      shin: cap(0.07, SKEL.shin - 0.06, i ? this.mats.pantsDark : this.mats.pants),
      shoe: (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.09, 0.12), this.mats.shoe); m.geometry.translate(0.06, 0, 0); this.inner.add(m); return m; })(),
      z: i ? -0.1 : 0.1,
    }));
    this.arms = [0, 1].map((i) => ({
      upper: cap(0.062, SKEL.upper - 0.06, i ? this.mats.coatDark : this.mats.coat),
      fore: cap(0.055, SKEL.fore - 0.05, i ? this.mats.coatDark : this.mats.coat),
      hand: (() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), this.mats.glove); this.inner.add(m); return m; })(),
      z: i ? -0.2 : 0.2,
    }));
    // 胴: 回転体（肩→腰→裾）。主人公はコートで裾が長い
    const coatLen = L.kind === 'agent' ? 0.32 : 0.12;
    const prof = L.kind === 'agent'
      ? [[0.0, 0.6], [0.13, 0.58], [0.2, 0.52], [0.19, 0.3], [0.17, 0.08], [0.22, -coatLen], [0.0, -coatLen]]
      : [[0.0, 0.6], [0.13, 0.58], [0.2, 0.52], [0.19, 0.3], [0.17, 0.08], [0.165, -coatLen], [0.0, -coatLen]];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const torsoGeo = new THREE.LatheGeometry(pts, 20); torsoGeo.scale(1, 1, 0.72);
    this.torso = new THREE.Mesh(torsoGeo, this.mats.coat); this.inner.add(this.torso);
    if (L.vest) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.42, 16), this.mats.vest); v.scale.z = 0.78; v.position.y = 0.3; this.torso.add(v); }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.173, 0.173, 0.045, 18), this.mats.belt); belt.scale.z = 0.73; belt.position.y = 0.07; this.torso.add(belt);
    // 首と頭
    this.neck = cap(0.05, 0.05, this.mats.skin);
    this.head = new THREE.Group(); this.inner.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR, 20, 16), this.mats.skin); skull.scale.set(0.95, 1.05, 0.9); this.head.add(skull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), this.mats.skin); nose.rotation.z = -Math.PI / 2; nose.position.set(SKEL.headR * 0.95, -0.01, 0); this.head.add(nose);
    for (const z of [-0.045, 0.045]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), this.mats.skin); ear.position.set(-0.02, 0, z * 2.4); ear.scale.set(0.6, 1, 0.5); this.head.add(ear); }
    if (L.kind === 'agent') {
      // 横分けの短い黒髪（頭の上と後ろを覆う）
      const hair = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR * 1.07, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.hair);
      hair.scale.set(1.0, 1.0, 0.96); hair.position.set(-0.012, 0.015, 0); hair.rotation.z = 0.35; this.head.add(hair);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.2), this.mats.hair); fringe.position.set(0.075, 0.085, 0.01); fringe.rotation.z = -0.4; this.head.add(fringe);
      for (const z of [-0.045, 0.045]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), this.mats.eye); eye.position.set(SKEL.headR * 0.86, 0.018, z); this.head.add(eye); }
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.13), this.mats.hair); brow.position.set(SKEL.headR * 0.9, 0.05, 0); this.head.add(brow);
      // マフラー（首元＋後ろへたなびく 3 節）
      this.scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.035, 8, 16), this.mats.scarf); this.scarfRing.rotation.x = Math.PI / 2; this.inner.add(this.scarfRing);
      this.scarfTail = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.09), this.mats.scarf); this.inner.add(m); return m; });
    } else {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR * 1.12, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.44), this.mats.helmet);
      helmet.position.y = 0.03; this.head.add(helmet);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(SKEL.headR * 1.15, SKEL.headR * 1.15, 0.025, 20), this.mats.helmet); brim.position.y = 0.05; this.head.add(brim);
      this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.21), this.mats.visor); this.visor.position.set(SKEL.headR * 0.9, 0.012, 0); this.head.add(this.visor);
      if (L.band) { this.band = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), this.mats.band); this.inner.add(this.band); }
    }
    // 銃（手前の手に持つ）
    this.gun = new THREE.Group(); this.inner.add(this.gun);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.045), this.mats.gun); barrel.position.set(0.1, 0.02, 0); this.gun.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.04), this.mats.gunDark); grip.position.set(-0.01, -0.05, 0); grip.rotation.z = 0.25; this.gun.add(grip);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
    this.scarfState = null;
  }

  setBrightness(k) {
    for (const [n, m] of Object.entries(this.mats)) if (m.isMeshLambertMaterial) m.color.copy(this.base[n]).multiplyScalar(k);
  }
  setVisor(glow) { if (this.visor) this.visor.material.color.setRGB(1, 0.86 - glow * 0.6, 0.6 - glow * 0.5).lerp(new THREE.Color(this.look.visor), glow ? 0 : 1); }

  placeCapsule(mesh, a, b, z) {
    tmpV.set(b[0] - a[0], b[1] - a[1], 0);
    const len = tmpV.length() || 1e-4;
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
    tmpQ.setFromUnitVectors(UP, tmpV.divideScalar(len));
    mesh.quaternion.copy(tmpQ);
  }

  // kind / o は computePose と同じ。x,y,z は世界座標、face = ±1
  update(x, y, z, face, kind, o, dt) {
    const P = computePose(kind, o);
    this.root.position.set(x, y, z);
    this.inner.rotation.y = face > 0 ? 0 : Math.PI;
    P.legs.forEach((Lg, i) => {
      const m = this.legs[i];
      this.placeCapsule(m.thigh, Lg.hip, Lg.knee, m.z);
      this.placeCapsule(m.shin, Lg.knee, Lg.ankle, m.z);
      m.shoe.position.set(Lg.ankle[0], Math.max(0.045, Lg.ankle[1] - 0.03), m.z);
    });
    P.arms.forEach((A, i) => {
      const m = this.arms[i];
      this.placeCapsule(m.upper, A.shoulder, A.elbow, m.z);
      this.placeCapsule(m.fore, A.elbow, A.hand, m.z);
      m.hand.position.set(A.hand[0], A.hand[1], m.z);
    });
    const A0 = P.arms[0];
    this.gun.position.set(A0.hand[0], A0.hand[1], this.arms[0].z);
    this.gun.rotation.set(0, 0, A0.foreAngle - Math.PI / 2);
    this.torso.position.set(P.hip[0], P.hip[1], 0);
    this.torso.rotation.set(0, 0, -P.lean);
    this.placeCapsule(this.neck, P.shoulder, P.neck, 0);
    this.head.position.set(P.head[0], P.head[1], 0);
    this.head.rotation.set(0, 0, -(P.lean + P.headTilt) * 0.6);
    if (this.band) { const m = [(A0.shoulder[0] * 0.6 + A0.elbow[0] * 0.4), (A0.shoulder[1] * 0.6 + A0.elbow[1] * 0.4)]; this.band.position.set(m[0], m[1], this.arms[0].z); this.band.quaternion.copy(this.arms[0].upper.quaternion); }
    if (this.scarfRing) {
      this.scarfRing.position.set(P.neck[0], P.neck[1] - 0.03, 0);
      const s = (this.scarfState ||= { a: 0 });
      s.a += ((o.speed || 0) * 0.25 + 0.3 - s.a) * Math.min(1, dt * 4);
      let px = P.neck[0] - 0.06, py = P.neck[1] - 0.04;
      this.scarfTail.forEach((m, i) => {
        const ang = Math.PI + 0.6 - s.a * 0.5 + Math.sin((o.t || 0) * 6 + i) * 0.12 * (1 + s.a);
        const nx = px + Math.cos(ang) * 0.11, ny = py + Math.sin(ang) * 0.11 - i * 0.01;
        m.position.set((px + nx) / 2, (py + ny) / 2, -0.03);
        m.rotation.set(0, 0, ang);
        px = nx; py = ny;
      });
    }
    return P;
  }
}

// 一人称の手: 右手の銃と左手（指し示すレイ）
export function makeGunModel() {
  const g = new THREE.Group();
  const metal = lambert('#c8d1dc'), dark = lambert('#59636f'), glove = lambert('#2a2a2e'), sleeve = lambert('#27385a');
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.2), metal); slide.position.set(0, 0.03, -0.07); g.add(slide);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.17), dark); frame.position.set(0, 0.0, -0.06); g.add(frame);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.11, 0.045), dark); grip.position.set(0, -0.05, 0.0); grip.rotation.x = -0.25; g.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.006), new THREE.MeshBasicMaterial({ color: 0xff9b3a })); sight.position.set(0, 0.058, -0.16); g.add(sight);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), glove); hand.scale.set(1, 1.1, 1.3); hand.position.set(0, -0.03, 0.02); g.add(hand);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12), sleeve); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.03, 0.1); g.add(cuff);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.18); g.add(muzzle);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })); flash.position.copy(muzzle.position); flash.visible = false; g.add(flash);
  g.userData = { muzzle, flash };
  return g;
}
export function makeHandModel() {
  const g = new THREE.Group();
  const glove = lambert('#2a2a2e'), sleeve = lambert('#27385a');
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), glove); palm.position.set(0, -0.01, -0.02); g.add(palm);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.045, 3, 6), glove); f.rotation.x = Math.PI / 2 - 0.3; f.position.set(-0.027 + i * 0.018, -0.015, -0.085); g.add(f); }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), glove); thumb.rotation.set(Math.PI / 2, 0, 0.8); thumb.position.set(0.045, -0.005, -0.03); g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12), sleeve); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.01, 0.07); g.add(cuff);
  return g;
}
