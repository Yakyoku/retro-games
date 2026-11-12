// VR 版の人物（v2）。2D 版と同じ動きエンジン（shared/art/pose.js の Animator）で関節位置を作り、立体の部位を合わせる。
// 改善: トゥーン陰影（3 段）／太さの変わる手足と関節球／足首の角度に合わせた靴（靴底・かかと）／親指つきの手袋／
// スライド・用心金のある拳銃／振り向きで体が実際に回る／両手で構えると左右の手が銃の位置で合う／
// 主人公: 襟とラペル・揺れるコートの裾・ボタン・髪の前髪・まばたきする目・眉・口・なびくマフラー／
// 敵: 正しい向きのヘルメット（つば・耳当て・回り込むバイザー・あご紐）・肩章・ブーツ・腕章・防弾ベスト・ポーチ・無線機・体格差。
import * as THREE from 'three';
import { SKEL, Animator, enemyAnimState } from '../../shared/art/pose.js';

const UP = new THREE.Vector3(0, 1, 0);
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vD = new THREE.Vector3(), q = new THREE.Quaternion();

let gradTex = null;
function toon(hex, extra = {}) {
  if (!gradTex) {
    const d = new Uint8Array([70, 150, 255]);
    gradTex = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: gradTex, ...extra });
}

export class Person3D {
  constructor(look, seed = 0) {
    this.look = look; this.anim = new Animator(seed);
    const L = look; const guard = L.kind === 'guard';
    const bulk = this.bulk = L.vest ? 1.12 : guard ? 1.05 : 1;
    this.root = new THREE.Group();
    this.inner = new THREE.Group(); this.root.add(this.inner);
    const M = this.mats = {
      coat: toon(L.coat), coatDark: toon(L.coatDark), coatLight: toon(L.coatLight), pants: toon(L.pants), pantsDark: toon(L.pantsDark),
      skin: toon(L.skin), shoe: toon(L.shoe), sole: toon('#050506'), gun: toon(L.gun), gunDark: toon(L.gunDark), glove: toon(L.glove || L.skin),
      hair: toon(L.hair || '#111'), helmet: toon(L.helmet || '#999'), helmetDark: toon(L.helmetDark || '#666'), visor: new THREE.MeshBasicMaterial({ color: L.visor || '#cdf' }),
      scarf: toon(L.scarf || '#f90'), band: toon(L.band || '#fc3'), vest: toon(L.vest || '#444'), vestDark: toon(L.vestDark || '#333'), belt: toon('#121318'),
      brass: toon('#c9b48a'), eyeW: new THREE.MeshBasicMaterial({ color: 0xf6f2ea }), eye: new THREE.MeshBasicMaterial({ color: 0x141010 }), radio: toon('#1b1d22'),
    };
    this.base = Object.fromEntries(Object.entries(M).map(([k, m]) => [k, m.color.clone()]));
    const add = (m, parent = this.inner) => { parent.add(m); return m; };
    // 手足: 根元から先へ細くなる円柱（長さ 1 の形を伸縮）と関節球
    const limb = (r0, r1, mat) => { const g = new THREE.CylinderGeometry(r1, r0, 1, 12, 1); g.translate(0, 0.5, 0); return add(new THREE.Mesh(g, mat)); };
    const ball = (r, mat) => add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat));
    this.legs = [0, 1].map((i) => {
      const mat = i ? M.pantsDark : M.pants;
      const lg = { thigh: limb(0.088 * bulk, 0.064 * bulk, mat), shin: limb(0.064 * bulk, 0.046, mat), knee: ball(0.064 * bulk, mat), hipB: ball(0.088 * bulk, mat), z: i ? -0.095 : 0.095 };
      if (guard) lg.boot = limb(0.056, 0.05, M.shoe);
      // 靴: 足首を原点に、足の角度で回す
      const sh = new THREE.Group(); add(sh);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.085, 0.105), M.shoe); upper.position.set(0.06, -0.035, 0); sh.add(upper);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.shoe); toe.scale.set(1, 0.75, 1); toe.position.set(0.17, -0.045, 0); sh.add(toe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.022, 0.11), M.sole); sole.position.set(0.065, -0.075, 0); sh.add(sole);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.1), M.sole); heel.position.set(-0.05, -0.065, 0); sh.add(heel);
      lg.shoe = sh;
      return lg;
    });
    this.arms = [0, 1].map((i) => {
      const mat = i ? M.coatDark : M.coat;
      const a = { upper: limb(0.064 * bulk, 0.05, mat), fore: limb(0.05, 0.042, mat), elbow: ball(0.05, mat), sh: ball(0.07 * bulk, mat), z: i ? -0.2 * bulk : 0.2 * bulk };
      a.hand = new THREE.Group(); add(a.hand);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), M.glove); palm.scale.set(1.05, 0.9, 0.85); a.hand.add(palm);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.035, 3, 6), M.glove); thumb.position.set(0.02, 0.03, 0.035); thumb.rotation.z = -0.8; a.hand.add(thumb);
      if (!i && L.band) { a.bandM = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.07, 14), M.band); a.upper.add(a.bandM); a.bandM.position.y = 0.45; }
      return a;
    });
    // 胴（肩・胸・腰の形）。主人公は長い裾、敵は短い上着
    const prof = [[0.0, 0.56], [0.1, 0.555], [0.19, 0.5], [0.205, 0.42], [0.19, 0.3], [0.165, 0.15], [0.17, 0.02], [0.175, -0.04], [0, -0.04]];
    const tg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * bulk, y)), 24); tg.scale(1, 1, 0.68);
    this.torso = add(new THREE.Mesh(tg, M.coat));
    const longCoat = !guard;
    const skirtLen = longCoat ? 0.4 : 0.1;
    const sg = new THREE.CylinderGeometry(0.17 * bulk, (longCoat ? 0.24 : 0.18) * bulk, skirtLen, 20, 1, true); sg.translate(0, -skirtLen / 2, 0); sg.scale(1, 1, 0.72);
    this.skirt = new THREE.Mesh(sg, new THREE.MeshToonMaterial({ color: M.coat.color, gradientMap: gradTex, side: THREE.DoubleSide })); this.mats.skirt = this.skirt.material; this.base.skirt = this.base.coat.clone();
    this.skirt.position.y = 0.02; this.torso.add(this.skirt);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172 * bulk, 0.172 * bulk, 0.045, 20), M.belt); belt.scale.z = 0.7; belt.position.y = 0.06; this.torso.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.05), longCoat ? M.brass : M.gunDark); buckle.position.set(0.17 * bulk, 0.06, 0); this.torso.add(buckle);
    if (longCoat) {
      for (const z of [-0.045, 0.045]) { const lap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.07), M.coatLight); lap.position.set(0.185, 0.42, z); lap.rotation.set(z > 0 ? -0.35 : 0.35, 0, -0.12); this.torso.add(lap); }
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 16, 1, true), new THREE.MeshToonMaterial({ color: M.coatDark.color, gradientMap: gradTex, side: THREE.DoubleSide })); collar.position.y = 0.57; this.torso.add(collar);
      for (const y of [0.25, 0.14]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), M.brass); b.position.set(0.19, y, 0.02); this.torso.add(b); }
    } else {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.08), M.coatDark); pocket.position.set(0.19 * bulk, 0.33, 0.06); this.torso.add(pocket);
      const radio = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), M.radio); radio.position.set(0.18 * bulk, 0.38, -0.07); this.torso.add(radio);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08), M.radio); ant.position.set(0.18 * bulk, 0.47, -0.08); this.torso.add(ant);
      for (const z of [-0.12, 0.12]) { const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), M.radio); pouch.position.set(-0.08, 0.02, z * bulk); this.torso.add(pouch); }
      for (const z of [-1, 1]) { const pad = new THREE.Mesh(new THREE.SphereGeometry(0.085 * bulk, 12, 8), L.vest ? M.vestDark : M.coatDark); pad.scale.set(1.1, 0.55, 1.0); pad.position.set(0, 0.52, z * 0.17 * bulk); this.torso.add(pad); }
      if (L.vest) {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.21 * bulk, 0.195 * bulk, 0.4, 20), M.vest); v.scale.z = 0.74; v.position.y = 0.28; this.torso.add(v);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.2), M.vestDark); plate.position.set(0.2 * bulk, 0.33, 0); this.torso.add(plate);
      }
    }
    // 首と頭
    this.neck = limb(0.052, 0.048, M.skin);
    this.head = new THREE.Group(); add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR, 20, 16), M.skin); skull.scale.set(0.96, 1.05, 0.88); this.head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), M.skin); jaw.scale.set(1.0, 0.75, 0.85); jaw.position.set(0.035, -0.07, 0); this.head.add(jaw);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8), M.skin); nose.rotation.z = -Math.PI / 2; nose.position.set(0.12, -0.015, 0); this.head.add(nose);
    for (const z of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), M.skin); ear.scale.set(0.7, 1, 0.45); ear.position.set(-0.025, 0, z * 0.105); this.head.add(ear); }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.045), M.eye); mouth.position.set(0.105, -0.07, 0); this.head.add(mouth);
    this.eyes = [];
    if (!guard) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR * 1.08, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hair); hair.scale.set(1.0, 1.05, 0.95); hair.position.set(-0.012, 0.012, 0); hair.rotation.z = 0.3; this.head.add(hair);
      const back = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR * 1.04, 16, 10), M.hair); back.scale.set(0.7, 0.9, 0.95); back.position.set(-0.04, 0.0, 0); this.head.add(back);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.21), M.hair); fringe.position.set(0.07, 0.09, 0.015); fringe.rotation.set(0.15, 0, -0.45); this.head.add(fringe);
      for (const z of [-0.045, 0.045]) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.eyeW); w.scale.set(0.5, 0.75, 1); w.position.set(0.105, 0.018, z); this.head.add(w);
        const pu = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 6), M.eye); pu.position.set(0.112, 0.017, z); this.head.add(pu);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 0.04), M.hair); brow.position.set(0.11, 0.05, z); brow.rotation.x = z > 0 ? -0.1 : 0.1; this.head.add(brow);
        this.eyes.push(w, pu);
      }
      this.scarfRing = add(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.038, 8, 18), M.scarf)); this.scarfRing.rotation.x = Math.PI / 2;
      this.scarfTail = [0, 1, 2, 3].map(() => add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.09), M.scarf)));
    } else {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(SKEL.headR * 1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), M.helmet); helmet.position.y = 0.025; this.head.add(helmet);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(SKEL.headR * 1.12, 0.012, 6, 24), M.helmetDark); rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; this.head.add(rim);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.2), M.helmetDark); brim.position.set(0.15, 0.04, 0); brim.rotation.z = -0.25; this.head.add(brim);
      for (const z of [-1, 1]) { const flap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.02), M.helmet); flap.position.set(-0.02, 0.0, z * 0.13); this.head.add(flap); }
      // 回り込むバイザー（前と両側）
      const vg = new THREE.CylinderGeometry(SKEL.headR * 1.02, SKEL.headR * 1.02, 0.05, 20, 1, true, Math.PI / 2 - 1.15, 2.3);
      this.visor = new THREE.Mesh(vg, new THREE.MeshBasicMaterial({ color: L.visor, side: THREE.DoubleSide })); this.visor.position.y = 0.012; this.visor.scale.z = 0.92; this.head.add(this.visor);
      this.mats.visorM = this.visor.material;
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 16, Math.PI), M.radio); strap.rotation.set(0, Math.PI / 2, Math.PI); strap.position.set(0.0, -0.02, 0); this.head.add(strap);
    }
    // 銃（手前の手）
    this.gun = new THREE.Group(); add(this.gun);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.042, 0.04), M.gun); slide.position.set(0.085, 0.048, 0); this.gun.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.036), M.gunDark); frame.position.set(0.07, 0.015, 0); this.gun.add(frame);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.034), M.gunDark); grip.position.set(-0.035, -0.045, 0); grip.rotation.z = 0.28; this.gun.add(grip);
    const guardT = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 4, 10, Math.PI), M.gunDark); guardT.rotation.z = Math.PI; guardT.position.set(0.035, 0.0, 0); this.gun.add(guardT);
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  }

  setBrightness(k) { for (const [n, m] of Object.entries(this.mats)) if (m.isMeshToonMaterial && this.base[n]) m.color.copy(this.base[n]).multiplyScalar(k); }
  setVisor(glow) { if (this.mats.visorM) { if (glow > 0) this.mats.visorM.color.setRGB(1, 0.88 - glow * 0.65, 0.62 - glow * 0.52); else this.mats.visorM.color.set(this.look.visor); } }

  placeLimb(mesh, a, b) { // a, b: THREE.Vector3（inner の座標）
    vD.subVectors(b, a); const len = vD.length() || 1e-4;
    mesh.position.copy(a); q.setFromUnitVectors(UP, vD.divideScalar(len)); mesh.quaternion.copy(q); mesh.scale.y = len;
  }

  // s は enemyAnimState / playerAnimState の結果。x,y,z は世界座標
  update(x, y, z, s, dt) {
    const A = this.anim.update(dt, s);
    const P = A.pose;
    this.root.position.set(x, y, z);
    this.inner.rotation.y = (1 - Math.max(-1, Math.min(1, A.faceV))) * Math.PI / 2; // 振り向きで実際に回る
    P.legs.forEach((Lg, i) => {
      const m = this.legs[i];
      vA.set(Lg.hip[0], Lg.hip[1], m.z); vB.set(Lg.knee[0], Lg.knee[1], m.z * 0.9);
      this.placeLimb(m.thigh, vA, vB); m.knee.position.copy(vB); m.hipB.position.copy(vA);
      vA.copy(vB); vB.set(Lg.ankle[0], Lg.ankle[1], m.z * 0.85);
      this.placeLimb(m.shin, vA, vB);
      if (m.boot) { const k = vA.clone().lerp(vB, 0.5); this.placeLimb(m.boot, k, vB); }
      m.shoe.position.copy(vB); m.shoe.rotation.set(0, 0, Lg.footA);
    });
    // 両手で構えているときは、手の z を銃の位置へ寄せる
    const two = Math.hypot(P.arms[0].hand[0] - P.arms[1].hand[0], P.arms[0].hand[1] - P.arms[1].hand[1]) < 0.12;
    P.arms.forEach((Ar, i) => {
      const m = this.arms[i];
      const hz = two ? (i ? 0.03 : 0.08) : m.z * 0.95;
      vA.set(Ar.shoulder[0], Ar.shoulder[1], m.z); vB.set(Ar.elbow[0], Ar.elbow[1], (m.z + hz) / 2 + m.z * 0.1);
      this.placeLimb(m.upper, vA, vB); m.sh.position.copy(vA); m.elbow.position.copy(vB);
      vA.copy(vB); vB.set(Ar.hand[0], Ar.hand[1], hz);
      this.placeLimb(m.fore, vA, vB);
      m.hand.position.copy(vB); m.hand.rotation.set(0, 0, Ar.gunA);
      if (!i) { this.gun.position.copy(vB); this.gun.rotation.set(0, 0, Ar.gunA); }
    });
    this.torso.position.set(P.hip[0], P.hip[1], 0);
    this.torso.rotation.set(0, 0, -P.lean);
    this.skirt.rotation.set(0, 0, -(A.hem || 0) * 0.7);
    vA.set(P.shoulder[0], P.shoulder[1], 0); vB.set(P.neck[0], P.neck[1], 0); this.placeLimb(this.neck, vA, vB);
    this.head.position.set(P.head[0], P.head[1], 0);
    this.head.rotation.set(0, 0, -(P.lean + P.headTilt) * 0.55);
    for (const e of this.eyes) e.scale.y = A.blink ? 0.12 : e === this.eyes[0] || e === this.eyes[2] ? 0.75 : 1;
    if (this.scarfRing) {
      this.scarfRing.position.set(P.neck[0], P.neck[1] - 0.04, 0);
      let px = P.neck[0] - 0.07, py = P.neck[1] - 0.05;
      const sp = A.speed || 0;
      this.scarfTail.forEach((m, i) => {
        const ang = Math.PI + 0.9 - Math.min(0.9, sp * 0.3) + Math.sin(s.t * 7 + i * 0.9) * (0.12 + sp * 0.05);
        const nx = px + Math.cos(ang) * 0.1, ny = py + Math.sin(ang) * 0.1;
        m.position.set((px + nx) / 2, (py + ny) / 2, -0.04); m.rotation.set(0, 0, ang);
        px = nx; py = ny;
      });
    }
    return A;
  }
}

export { enemyAnimState };

// 一人称の手: 右手の銃と左手（指し示すレイ）
export function makeGunModel() {
  const g = new THREE.Group();
  const metal = toon('#c8d1dc'), dark = toon('#59636f'), glove = toon('#2a2a2e'), sleeve = toon('#27385a');
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
  const glove = toon('#2a2a2e'), sleeve = toon('#27385a');
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), glove); palm.position.set(0, -0.01, -0.02); g.add(palm);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.045, 3, 6), glove); f.rotation.x = Math.PI / 2 - 0.3; f.position.set(-0.027 + i * 0.018, -0.015, -0.085); g.add(f); }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), glove); thumb.rotation.set(Math.PI / 2, 0, 0.8); thumb.position.set(0.045, -0.005, -0.03); g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12), sleeve); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.01, 0.07); g.add(cuff);
  return g;
}
