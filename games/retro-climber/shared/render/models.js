// 鉄骨レスキュー — キャラクターと小道具の 3D モデル（すべて自作。プリミティブと回転体から組み立てる）。
// 造形の方針: 小さく映っても役割が分かる太い輪郭、少ない主役色、はっきりした明暗。写実やホラーにしない。
//   主人公「テツ」: 黄色い安全帽と作業灯、濃紺の作業着に橙の反射ベスト、口ひげ、厚手の手袋、茶色の安全靴
//   巨大な敵「ゴンザ」: 紫がかった灰色の毛の大きな類人猿。小さすぎる割れた橙の安全帽、太い眉、大きな前腕と拳
//   救出対象「ミナ」: 青緑のつなぎ、白い安全帽に緑の帯、赤茶のポニーテール、黄色のスカーフ
// モデルの正面は +z。描画側で向きを回す。足元が y=0。
import * as THREE from 'three';
import { getTextures } from './textures.js';

const mats = {};
function M(key, opts) {
  if (mats[key]) return mats[key];
  const T = getTextures();
  const o = { ...opts };
  if (o.cloth) { o.normalMap = T.clothN; o.normalScale = new THREE.Vector2(0.35, 0.35); delete o.cloth; }
  if (o.fur) { o.normalMap = T.furN; o.normalScale = new THREE.Vector2(0.8, 0.8); delete o.fur; }
  return (mats[key] = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o }));
}
export function sharedMaterial(key) { return mats[key]; }

const geo = {};
function G(key, make) { return geo[key] || (geo[key] = make()); }
const sph = (r, ws = 24, hs = 18) => G(`s${r}_${ws}`, () => new THREE.SphereGeometry(r, ws, hs));
const cap = (r, l) => G(`c${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const cyl = (r0, r1, h, s = 20, open = false) => G(`y${r0}_${r1}_${h}_${s}_${open}`, () => new THREE.CylinderGeometry(r0, r1, h, s, 1, open));
const box = (w, h, d) => G(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const tor = (r, t, s = 24) => G(`t${r}_${t}`, () => new THREE.TorusGeometry(r, t, 10, s));
const hemi = (r) => G(`h${r}`, () => new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));

function mesh(g, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; return o;
}
function joint(parent, x, y, z) { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; }
// 関節から下へ伸びる手足（capsule の中心を下にずらす）
function limb(parent, x, y, z, r, len, m) {
  const j = joint(parent, x, y, z);
  const s = mesh(cap(r, len), m, 0, -len / 2 - r * 0.4, 0); j.add(s);
  return j;
}
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ================================================================ 主人公 テツ
export function makeHero() {
  const skin = M('skin', { color: 0xf3b98d, roughness: 0.55 });
  const jacket = M('jacket', { color: 0x1f3a6b, roughness: 0.82, cloth: true });
  const vest = M('vest', { color: 0xff7a1a, roughness: 0.7, cloth: true });
  const stripe = M('stripe', { color: 0xe8edf2, roughness: 0.25, metalness: 0.2, emissive: 0x2a2a2a });
  const pants = M('pants', { color: 0x2b3442, roughness: 0.85, cloth: true });
  const boot = M('boot', { color: 0x6b3f22, roughness: 0.6 });
  const sole = M('sole', { color: 0x1c1c1c, roughness: 0.9 });
  const glove = M('glove', { color: 0xead9b5, roughness: 0.8, cloth: true });
  const hat = M('hat', { color: 0xffc51a, roughness: 0.32, metalness: 0.0 });
  const hair = M('hair', { color: 0x3a2416, roughness: 0.75 });
  const white = M('eyeW', { color: 0xffffff, roughness: 0.3 });
  const black = M('eyeB', { color: 0x111111, roughness: 0.2 });
  const belt = M('belt', { color: 0x4a2c17, roughness: 0.7 });
  const metal = M('buckle', { color: 0xc9c9c9, roughness: 0.3, metalness: 0.9 });
  const lamp = M('lamp', { color: 0xfff6cf, emissive: 0xffe9a0, emissiveIntensity: 2.2 });

  const root = new THREE.Group(); root.name = 'hero';
  const body = joint(root, 0, 0, 0);           // 全体の上下（しゃがみ・伸び）
  const hips = joint(body, 0, 0.42, 0);
  const torso = joint(hips, 0, 0, 0);
  torso.add(mesh(sph(0.2), jacket, 0, 0.18, 0, 1.0, 1.12, 0.86));
  torso.add(mesh(cyl(0.207, 0.218, 0.22, 24, true), vest, 0, 0.19, 0, 1, 1, 0.89));
  torso.add(mesh(cyl(0.212, 0.22, 0.022, 24, true), stripe, 0, 0.13, 0, 1, 1, 0.9));
  torso.add(mesh(cyl(0.21, 0.214, 0.022, 24, true), stripe, 0, 0.22, 0, 1, 1, 0.9));
  torso.add(mesh(cyl(0.192, 0.195, 0.05, 24), belt, 0, 0.04, 0, 1, 1, 0.9));
  torso.add(mesh(box(0.06, 0.045, 0.02), metal, 0, 0.04, 0.17));
  torso.add(mesh(box(0.08, 0.09, 0.06), belt, 0.15, 0.02, 0.07)); // 工具袋
  // 頭
  const neck = joint(torso, 0, 0.36, 0.01);
  const head = joint(neck, 0, 0, 0);
  head.add(mesh(sph(0.17), skin, 0, 0, 0, 1, 0.98, 0.96));
  head.add(mesh(sph(0.058), skin, 0, -0.012, 0.162, 1, 0.92, 1));         // 鼻
  const mous = M('moustache', { color: 0x3a2416, roughness: 0.85 });
  for (const s of [-1, 1]) {
    const m = mesh(sph(0.05), mous, s * 0.052, -0.066, 0.142, 1.5, 0.62, 0.7); m.rotation.z = s * -0.35; head.add(m);
    head.add(mesh(sph(0.026), skin, s * 0.168, 0, 0, 0.6, 1, 1));          // 耳
  }
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = joint(head, s * 0.06, 0.042, 0.138);
    e.add(mesh(sph(0.036, 16, 12), white, 0, 0, 0, 0.85, 1.15, 0.5));
    const pupil = mesh(sph(0.018, 12, 10), black, 0, 0, 0.014, 1, 1.2, 0.6); e.add(pupil);
    const brow = mesh(box(0.06, 0.016, 0.02), hair, 0, 0.055, 0.008); brow.rotation.z = s * 0.12; e.add(brow);
    eyes.push({ e, pupil, brow, s });
  }
  head.add(mesh(sph(0.15), hair, 0, 0.0, -0.05, 1.08, 0.75, 0.9));          // 後ろ髪
  // 安全帽
  const helm = joint(head, 0, 0.035, -0.005);
  helm.add(mesh(hemi(0.188), hat, 0, 0, 0, 1, 0.9, 1.02));
  helm.add(mesh(cyl(0.215, 0.215, 0.022, 32), hat, 0, 0.003, 0.025, 1, 1, 1.12));
  helm.add(mesh(box(0.035, 0.03, 0.3), hat, 0, 0.165, 0, 1, 1, 1));
  const lampM = mesh(cyl(0.03, 0.034, 0.04, 16), lamp, 0, 0.085, 0.178); lampM.rotation.x = Math.PI / 2; helm.add(lampM);
  helm.add(mesh(cyl(0.04, 0.04, 0.02, 16), metal, 0, 0.085, 0.16, 1, 1, 1).rotateX(Math.PI / 2));
  // 腕
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = limb(torso, s * 0.215, 0.29, 0, 0.056, 0.12, jacket);
    sh.rotation.z = s * 0.12;
    const el = limb(sh, 0, -0.17, 0, 0.05, 0.1, jacket);
    const hand = joint(el, 0, -0.15, 0);
    hand.add(mesh(sph(0.068, 16, 12), glove, 0, -0.03, 0.005, 1, 1.12, 0.85));
    hand.add(mesh(cyl(0.058, 0.06, 0.04, 14), glove, 0, 0.02, 0));
    const th = mesh(cap(0.024, 0.04), glove, s * -0.05, -0.02, 0.035); th.rotation.z = s * 0.7; hand.add(th);
    arms.push({ sh, el, hand, s });
  }
  // 脚
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = limb(hips, s * 0.095, 0.01, 0, 0.072, 0.1, pants);
    const kn = limb(hp, 0, -0.18, 0, 0.066, 0.08, pants);
    const ft = joint(kn, 0, -0.16, 0);
    ft.add(mesh(sph(0.075, 16, 12), boot, 0, -0.035, 0.035, 1.0, 0.72, 1.55));
    ft.add(mesh(box(0.13, 0.025, 0.22), sole, 0, -0.078, 0.035));
    legs.push({ hp, kn, ft, s });
  }
  // 手に持つハンマー
  const hammer = makeHammer(); hammer.visible = false; arms[1].hand.add(hammer); hammer.position.set(0, -0.04, 0.02);

  root.userData = { body, hips, torso, neck, head, helm, eyes, arms, legs, hammer, t: 0, squash: 0, lean: 0, blink: 0 };
  return root;
}

// 主人公の姿勢（状態ごとに手続きで動かす。予備動作と誇張を入れる）
export function poseHero(h, s, dt) {
  const u = h.userData; u.t += dt;
  const t = u.t, A = u.arms, L = u.legs;
  const set = (j, x, y, z, k = 18) => { j.rotation.x = damp(j.rotation.x, x, k, dt); j.rotation.y = damp(j.rotation.y, y, k, dt); j.rotation.z = damp(j.rotation.z, z, k, dt); };
  let bodyY = 0, squashT = 1, leanT = 0;
  u.hammer.visible = s.hammer > 0;
  const hammerFlash = s.hammer > 0 && s.hammer < 2 ? (Math.sin(t * 30) > 0) : true;
  u.hammer.visible = s.hammer > 0 && hammerFlash;
  if (s.state === 'climb') {
    const c = s.climbPhase;
    for (const a of A) { const ph = c + (a.s > 0 ? 0 : Math.PI); set(a.sh, -2.6 + Math.sin(ph) * 0.35, 0, a.s * 0.2); set(a.el, -0.5 - Math.cos(ph) * 0.3, 0, 0); }
    for (const l of L) { const ph = c + (l.s > 0 ? Math.PI : 0); set(l.hp, -0.6 - Math.sin(ph) * 0.45, 0, 0); set(l.kn, 1.0 + Math.sin(ph) * 0.4, 0, 0); }
    set(u.torso, 0.05, 0, 0); set(u.head, -0.15, 0, 0);
  } else if (s.state === 'dead') {
    const k = Math.min(1, s.deadT / 0.5);
    // 目を回してくるっと回り、ぺたんと倒れる
    set(u.torso, 0, 0, 0); set(u.head, 0.3, Math.sin(t * 14) * 0.5, 0);
    for (const a of A) { set(a.sh, -1.6 * k, 0, a.s * (1.2 + Math.sin(t * 20) * 0.2)); set(a.el, -0.4, 0, 0); }
    for (const l of L) { set(l.hp, -0.3 * k, 0, l.s * 0.35); set(l.kn, 0.5, 0, 0); }
    bodyY = s.deathCause === 'fall' ? 0 : Math.max(0, Math.sin(Math.min(1, s.deadT * 1.6) * Math.PI) * 0.35);
    h.rotation.z = damp(h.rotation.z, s.deadT > 0.7 ? Math.PI / 2 * (s.facing > 0 ? 1 : -1) : 0, 8, dt);
  } else if (s.state === 'air') {
    const up = s.vy > 0;
    for (const a of A) { set(a.sh, up ? -2.4 : -1.4, 0, a.s * (up ? 0.25 : 0.7)); set(a.el, -0.3, 0, 0); }
    L[0].hp.rotation.x = damp(L[0].hp.rotation.x, -0.9, 16, dt); L[0].kn.rotation.x = damp(L[0].kn.rotation.x, 1.2, 16, dt);
    L[1].hp.rotation.x = damp(L[1].hp.rotation.x, 0.25, 16, dt); L[1].kn.rotation.x = damp(L[1].kn.rotation.x, 0.5, 16, dt);
    set(u.torso, up ? -0.08 : 0.1, 0, 0); set(u.head, up ? -0.15 : 0.05, 0, 0);
    squashT = up ? 1.08 : 1.0;
  } else {
    const run = s.moving ? 1 : 0;
    const ph = s.walkPhase;
    for (const a of A) {
      const sw = Math.sin(ph + (a.s > 0 ? 0 : Math.PI)) * 0.9 * run;
      set(a.sh, sw, 0, a.s * 0.12); set(a.el, -0.35 - Math.abs(sw) * 0.4 * run, 0, 0);
    }
    for (const l of L) {
      const sw = Math.sin(ph + (l.s > 0 ? Math.PI : 0)) * 0.75 * run;
      set(l.hp, sw, 0, 0); set(l.kn, run ? Math.max(0, -Math.cos(ph + (l.s > 0 ? Math.PI : 0))) * 1.1 : 0.05, 0, 0);
      set(l.ft, run ? -sw * 0.3 : 0, 0, 0);
    }
    bodyY = run ? Math.abs(Math.sin(ph)) * 0.035 : Math.sin(t * 2.2) * 0.006;
    leanT = run ? 0.14 : 0;
    set(u.torso, leanT, 0, 0); set(u.head, run ? -0.1 : Math.sin(t * 0.7) * 0.05, run ? 0 : Math.sin(t * 0.45) * 0.25, 0);
    if (s.landT > 0) { squashT = 1 - s.landT * 1.1; bodyY -= s.landT * 0.12; }
    // ハンマーを振る: 振りかぶり（予備動作）→ 振り下ろし
    if (s.swingT > 0) {
      const k = 1 - s.swingT / 0.22; const R = A[1];
      const x = k < 0.25 ? -3.0 : -3.0 + (k - 0.25) / 0.75 * 3.6;
      R.sh.rotation.x = x; R.el.rotation.x = k < 0.25 ? -0.8 : -0.1;
      u.torso.rotation.x = k < 0.25 ? -0.15 : 0.25;
    } else if (s.hammer > 0) { set(A[1].sh, -2.2 + Math.sin(t * 9) * 0.25, 0, 0.1); set(A[1].el, -0.6, 0, 0); }
    if (s.victory) {
      for (const a of A) { set(a.sh, -2.9, 0, a.s * (0.4 + Math.sin(t * 8) * 0.15)); set(a.el, -0.2, 0, 0); }
      bodyY = Math.abs(Math.sin(t * 6)) * 0.12;
    }
  }
  if (s.state !== 'dead') h.rotation.z = damp(h.rotation.z, 0, 10, dt);
  u.squash = damp(u.squash || 1, squashT, 22, dt);
  u.body.position.y = bodyY;
  u.body.scale.set(1 / Math.sqrt(u.squash), u.squash, 1 / Math.sqrt(u.squash));
  // まばたき・目の向き
  u.blink -= dt; const closed = u.blink < 0.1 && u.blink > 0;
  if (u.blink < 0) u.blink = 2.5 + Math.random() * 2.5;
  for (const e of u.eyes) {
    e.e.scale.y = s.state === 'dead' ? 0.25 : closed ? 0.12 : s.scared ? 1.3 : 1;
    e.brow.position.y = s.scared || s.state === 'dead' ? 0.07 : 0.055;
  }
}

// ================================================================ ハンマー
export function makeHammer() {
  const wood = M('handle', { color: 0xc58a4a, roughness: 0.6 });
  const steel = M('steel', { color: 0x9aa3ad, roughness: 0.28, metalness: 0.95 });
  const band = M('band', { color: 0xd8262f, roughness: 0.5 });
  const g = new THREE.Group();
  const handle = mesh(cyl(0.022, 0.026, 0.42, 12), wood, 0, -0.2, 0); g.add(handle);
  g.add(mesh(cyl(0.03, 0.03, 0.06, 12), band, 0, -0.06, 0));
  const hd = mesh(box(0.11, 0.11, 0.24), steel, 0, -0.43, 0); g.add(hd);
  for (const z of [-0.125, 0.125]) g.add(mesh(cyl(0.064, 0.064, 0.02, 16).clone().rotateX(Math.PI / 2), steel, 0, -0.43, z));
  g.rotation.x = Math.PI;
  return g;
}

// ================================================================ 巨大な敵 ゴンザ
export function makeGiant() {
  const fur = M('fur', { color: 0x4d3f5c, roughness: 0.9, fur: true });
  const furD = M('furD', { color: 0x372c43, roughness: 0.9, fur: true });
  const face = M('gface', { color: 0xe7b088, roughness: 0.6 });
  const hand = M('ghand', { color: 0xd49c74, roughness: 0.65 });
  const hat = M('ghat', { color: 0xff7a1a, roughness: 0.35 });
  const dark = M('gmouth', { color: 0x4a1418, roughness: 0.6 });
  const tooth = M('tooth', { color: 0xfffbea, roughness: 0.3 });
  const white = M('eyeW', { color: 0xffffff, roughness: 0.3 });
  const black = M('eyeB', { color: 0x111111, roughness: 0.2 });
  const belt = M('belt', { color: 0x4a2c17, roughness: 0.7 });
  const metal = M('buckle', { color: 0xc9c9c9, roughness: 0.3, metalness: 0.9 });

  const root = new THREE.Group(); root.name = 'giant';
  const body = joint(root, 0, 0, 0);
  const hips = joint(body, 0, 0.82, 0);
  const torso = joint(hips, 0, 0, 0);
  torso.add(mesh(sph(0.86, 32, 24), fur, 0, 0.64, 0, 1.16, 1.0, 0.86));
  torso.add(mesh(sph(0.6, 28, 20), face, 0, 0.56, 0.42, 1.02, 0.95, 0.48));       // 胸
  torso.add(mesh(tor(0.78, 0.07, 32), belt, 0, 0.1, 0, 1, 1, 0.78).rotateX(Math.PI / 2));
  torso.add(mesh(box(0.18, 0.14, 0.06), metal, 0, 0.1, 0.62));
  torso.add(mesh(box(0.24, 0.26, 0.16), belt, -0.55, 0.0, 0.4));                    // ちぎれた工具袋
  // 頭
  const neck = joint(torso, 0, 1.3, 0.22);
  const head = joint(neck, 0, 0.1, 0);
  head.add(mesh(sph(0.5, 32, 24), fur, 0, 0.05, -0.02, 1.12, 0.95, 0.95));
  head.add(mesh(sph(0.38, 28, 20), face, 0, -0.12, 0.3, 1.28, 0.82, 0.76));         // 口もと
  head.add(mesh(sph(0.3, 24, 18), face, 0, 0.12, 0.25, 1.15, 0.72, 0.7));           // 目のまわり
  const brows = [];
  for (const s of [-1, 1]) {
    const b = joint(head, s * 0.17, 0.27, 0.43);
    const m = mesh(cap(0.075, 0.18), furD, 0, 0, 0); m.rotation.z = Math.PI / 2; b.add(m);
    brows.push({ b, s });
    head.add(mesh(sph(0.11, 16, 12), face, s * 0.53, 0.05, 0, 0.55, 1, 0.9));       // 耳
    head.add(mesh(sph(0.03, 10, 8), dark, s * 0.07, 0.03, 0.62));                    // 鼻の穴
  }
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = joint(head, s * 0.16, 0.15, 0.46);
    e.add(mesh(sph(0.085, 18, 14), white, 0, 0, 0, 0.9, 1.1, 0.6));
    const p = mesh(sph(0.042, 14, 10), black, 0, 0, 0.035, 1, 1.15, 0.6); e.add(p);
    eyes.push({ e, p, s });
  }
  const jaw = joint(head, 0, -0.18, 0.35);
  jaw.add(mesh(sph(0.24, 24, 16), dark, 0, -0.04, 0.2, 1.25, 0.48, 0.5));
  jaw.add(mesh(box(0.42, 0.06, 0.06), tooth, 0, 0.02, 0.34));
  jaw.add(mesh(box(0.34, 0.05, 0.06), tooth, 0, -0.12, 0.31));
  jaw.add(mesh(sph(0.3, 24, 16), face, 0, -0.16, 0.18, 1.2, 0.45, 0.7));
  // 小さすぎる安全帽（割れている）
  const helm = joint(head, 0.06, 0.46, 0.02); helm.rotation.z = -0.22;
  helm.add(mesh(hemi(0.3), hat, 0, 0, 0, 1, 0.8, 1.05));
  helm.add(mesh(cyl(0.34, 0.34, 0.03, 28), hat, 0, 0.0, 0.03));
  helm.add(mesh(box(0.025, 0.2, 0.02), dark, 0.08, 0.12, 0.28).rotateZ(0.5));
  // 腕（大きな前腕と拳）
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = limb(torso, s * 0.95, 1.12, 0.05, 0.24, 0.42, fur);
    const el = limb(sh, 0, -0.62, 0, 0.3, 0.42, fur);
    const fist = joint(el, 0, -0.68, 0);
    fist.add(mesh(sph(0.31, 22, 16), hand, 0, -0.06, 0.02, 1.05, 0.95, 1.1));
    for (let k = 0; k < 4; k++) fist.add(mesh(sph(0.075, 12, 10), hand, (k - 1.5) * 0.12, -0.25, 0.2));
    arms.push({ sh, el, fist, s });
  }
  // 脚（短い）
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = limb(hips, s * 0.42, 0.05, 0, 0.27, 0.25, fur);
    const ft = joint(hp, 0, -0.66, 0.05);
    ft.add(mesh(sph(0.26, 20, 14), hand, 0, 0.04, 0.12, 1.15, 0.55, 1.5));
    legs.push({ hp, ft, s });
  }
  // 持ち上げる樽／ボルト
  const held = makeBarrel(); held.visible = false; root.add(held);
  const heldBolt = makeBolt(); heldBolt.visible = false; heldBolt.scale.setScalar(1.4); root.add(heldBolt);
  root.userData = { body, hips, torso, head, neck, jaw, brows, eyes, arms, legs, held, heldBolt, t: 0 };
  return root;
}

export function poseGiant(m, s, dt) {
  const u = m.userData; u.t += dt; const t = u.t, A = u.arms;
  const set = (j, x, y, z, k = 10) => { j.rotation.x = damp(j.rotation.x, x, k, dt); j.rotation.y = damp(j.rotation.y, y, k, dt); j.rotation.z = damp(j.rotation.z, z, k, dt); };
  let bodyY = 0, crouch = 0, jaw = 0.05, brow = 0;
  u.held.visible = false; u.heldBolt.visible = false;
  const holdItem = s.kind === 'bolt' ? u.heldBolt : u.held;
  if (s.state === 'lift') {
    // 予備動作: 一度しゃがんでから、両腕で頭上へ持ち上げる
    const k = Math.min(1, s.t / 0.7);
    crouch = k < 0.35 ? k / 0.35 * 0.18 : 0.18 * (1 - (k - 0.35) / 0.65);
    for (const a of A) { set(a.sh, k < 0.35 ? -0.6 : -2.8, 0, a.s * (k < 0.35 ? 0.3 : 0.25), 14); set(a.el, k < 0.35 ? -0.6 : -0.5, 0, 0, 14); }
    holdItem.visible = true; holdItem.position.set(0, k < 0.35 ? 1.2 : 3.35, 0.6 + (k < 0.35 ? 0.4 : 0));
    jaw = 0.25; brow = 1;
  } else if (s.state === 'throw') {
    const k = Math.min(1, s.t / 0.45);
    for (const a of A) { set(a.sh, -2.8 + k * 2.4, 0, a.s * 0.35, 20); set(a.el, -0.2, 0, 0, 20); }
    set(u.torso, 0.35 * Math.sin(k * Math.PI), 0, 0, 20);
    jaw = 0.45 * (1 - k); brow = 1;
  } else if (s.state === 'defeat') {
    // 目を回し、足場ごと落ちていく
    for (const a of A) { set(a.sh, -2.6, 0, a.s * (1.0 + Math.sin(t * 9 + a.s) * 0.4), 8); set(a.el, -0.3, 0, 0); }
    set(u.head, 0, Math.sin(t * 7) * 0.4, Math.sin(t * 5) * 0.2);
    jaw = 0.5; brow = -1;
  } else if (s.state === 'flee') {
    for (const a of A) { set(a.sh, -2.9, 0, a.s * 0.2, 8); set(a.el, -0.4, 0, 0); }
    bodyY = Math.abs(Math.sin(t * 6)) * 0.15; jaw = 0.3; brow = 1;
  } else {
    // 待機: 体をゆすり、片足で床を踏み鳴らす。主人公が近づくと怒って腕を振り上げる
    const angry = s.mood > 0.5;
    const stomp = Math.max(0, Math.sin(t * (angry ? 5 : 2.6)));
    set(u.legs[0].hp, -stomp * 0.35, 0, 0); set(u.legs[1].hp, 0, 0, 0);
    for (const a of A) {
      if (angry) { set(a.sh, -2.2 + Math.sin(t * 10 + a.s) * 0.4, 0, a.s * 0.5); set(a.el, -1.0, 0, 0); }
      else { set(a.sh, 0.15 + Math.sin(t * 2.6 + a.s) * 0.12, 0, a.s * 0.28); set(a.el, -0.5, 0, 0); }
    }
    set(u.torso, Math.sin(t * 2.6) * 0.05, Math.sin(t * 1.3) * 0.12, 0);
    set(u.head, angry ? -0.1 : 0, Math.sin(t * 0.9) * 0.3, 0);
    bodyY = stomp * 0.05; jaw = angry ? 0.25 + Math.sin(t * 12) * 0.1 : 0.05; brow = angry ? 1 : 0;
  }
  u.body.position.y = bodyY - crouch;
  u.jaw.rotation.x = damp(u.jaw.rotation.x, jaw, 14, dt);
  for (const b of u.brows) { b.b.rotation.z = damp(b.b.rotation.z, b.s * -0.35 * brow, 10, dt); b.b.position.y = damp(b.b.position.y, 0.27 - brow * 0.03, 10, dt); }
  for (const e of u.eyes) e.e.scale.y = s.state === 'defeat' ? 0.35 + Math.abs(Math.sin(t * 8)) * 0.6 : 1;
}

// ================================================================ 救出対象 ミナ
export function makeCaptive() {
  const skin = M('skin', { color: 0xf3b98d, roughness: 0.55 });
  const suit = M('suit', { color: 0x1fa6a0, roughness: 0.78, cloth: true });
  const scarf = M('scarf', { color: 0xffd23f, roughness: 0.7, cloth: true });
  const hatW = M('hatW', { color: 0xf4f6f8, roughness: 0.3 });
  const green = M('green', { color: 0x2fae4e, roughness: 0.5 });
  const hair = M('mhair', { color: 0x9a3f1f, roughness: 0.65 });
  const boot = M('mboot', { color: 0x2c2f38, roughness: 0.6 });
  const white = M('eyeW', { color: 0xffffff, roughness: 0.3 });
  const black = M('eyeB', { color: 0x111111, roughness: 0.2 });
  const cheek = M('cheek', { color: 0xff8c8c, roughness: 0.6, transparent: true, opacity: 0.6 });

  const root = new THREE.Group(); root.name = 'captive';
  const body = joint(root, 0, 0, 0);
  const hips = joint(body, 0, 0.42, 0);
  const torso = joint(hips, 0, 0, 0);
  torso.add(mesh(sph(0.17), suit, 0, 0.17, 0, 1, 1.18, 0.82));
  torso.add(mesh(tor(0.1, 0.035, 20), scarf, 0, 0.33, 0.02, 1, 1, 1).rotateX(Math.PI / 2));
  const tail = mesh(cap(0.05, 0.08), scarf, 0.07, 0.27, 0.11); tail.rotation.z = -0.6; torso.add(tail);
  const head = joint(torso, 0, 0.5, 0.01);
  head.add(mesh(sph(0.16), skin, 0, 0, 0));
  head.add(mesh(sph(0.165), hair, 0, 0.02, -0.03, 1.02, 0.95, 0.95));
  const pony = joint(head, 0, 0.02, -0.15);
  const pm = mesh(cap(0.06, 0.16), hair, 0, -0.1, -0.05); pm.rotation.x = 0.5; pony.add(pm);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = joint(head, s * 0.058, 0.02, 0.135);
    e.add(mesh(sph(0.036, 16, 12), white, 0, 0, 0, 0.85, 1.2, 0.5));
    e.add(mesh(sph(0.021, 12, 10), black, 0, -0.004, 0.014, 1, 1.25, 0.6));
    eyes.push(e);
    head.add(mesh(sph(0.03, 12, 10), cheek, s * 0.095, -0.045, 0.12, 1, 0.6, 0.5));
  }
  const mouth = mesh(box(0.05, 0.012, 0.01), black, 0, -0.07, 0.152); head.add(mouth);
  const helm = joint(head, 0, 0.04, 0);
  helm.add(mesh(hemi(0.178), hatW, 0, 0, 0, 1, 0.88, 1.02));
  helm.add(mesh(cyl(0.2, 0.2, 0.018, 28), hatW, 0, 0.004, 0.02, 1, 1, 1.1));
  helm.add(mesh(cyl(0.18, 0.18, 0.03, 28, true), green, 0, 0.04, 0, 1, 1, 1.02));
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = limb(torso, s * 0.18, 0.28, 0, 0.045, 0.11, suit);
    const el = limb(sh, 0, -0.15, 0, 0.04, 0.09, suit);
    const hd = joint(el, 0, -0.13, 0); hd.add(mesh(sph(0.045, 14, 10), skin, 0, -0.02, 0));
    arms.push({ sh, el, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = limb(hips, s * 0.08, 0.02, 0, 0.06, 0.12, suit);
    const kn = limb(hp, 0, -0.19, 0, 0.055, 0.08, suit);
    const ft = joint(kn, 0, -0.15, 0); ft.add(mesh(sph(0.06, 14, 10), boot, 0, -0.04, 0.03, 1, 0.75, 1.5));
    legs.push({ hp, kn, s });
  }
  // 「たすけて！」の吹き出し
  const bub = makeSpeech('たすけて！'); bub.position.set(0.5, 1.25, 0); bub.visible = false; root.add(bub);
  root.userData = { body, torso, head, pony, eyes, mouth, arms, legs, bub, t: 0 };
  return root;
}

export function poseCaptive(m, s, dt) {
  const u = m.userData; u.t += dt; const t = u.t;
  const set = (j, x, y, z, k = 12) => { j.rotation.x = damp(j.rotation.x, x, k, dt); j.rotation.y = damp(j.rotation.y, y, k, dt); j.rotation.z = damp(j.rotation.z, z, k, dt); };
  let y = 0;
  u.bub.visible = s.state === 'scared' || (s.state === 'idle' && Math.sin(t * 0.8) > 0.6);
  if (s.state === 'scared') {
    for (const a of u.arms) { set(a.sh, -2.7, 0, a.s * (0.5 + Math.sin(t * 22) * 0.15), 20); set(a.el, -0.3, 0, 0); }
    set(u.head, 0, Math.sin(t * 18) * 0.15, 0); y = Math.abs(Math.sin(t * 14)) * 0.02;
    u.mouth.scale.set(0.8, 4, 1);
  } else if (s.state === 'happy') {
    for (const a of u.arms) { set(a.sh, -2.8 + Math.sin(t * 10 + a.s) * 0.3, 0, a.s * 0.6); set(a.el, -0.2, 0, 0); }
    y = Math.abs(Math.sin(t * 7)) * 0.16; set(u.head, -0.1, 0, Math.sin(t * 7) * 0.1);
    u.mouth.scale.set(1.3, 3, 1);
  } else {
    // 待機: きょろきょろ、時々手を振る
    const wave = Math.sin(t * 0.8) > 0.6;
    set(u.arms[0].sh, 0.1, 0, -0.15); set(u.arms[0].el, -0.3, 0, 0);
    set(u.arms[1].sh, wave ? -2.6 : 0.1, 0, wave ? 0.4 + Math.sin(t * 12) * 0.4 : 0.15); set(u.arms[1].el, wave ? -0.3 : -0.3, 0, 0);
    set(u.head, 0, Math.sin(t * 1.1) * 0.5, 0); u.mouth.scale.set(1, 1, 1);
    y = Math.sin(t * 2) * 0.006;
  }
  u.pony.rotation.x = damp(u.pony.rotation.x, 0.3 + Math.sin(t * 6) * 0.15 + y * 2, 8, dt);
  u.body.position.y = y;
}

// ================================================================ 吹き出し（日本語。キャンバスに描いて板に貼る）
export function makeSpeech(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 10;
  g.beginPath(); g.roundRect(10, 10, 492, 130, 40); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(120, 136); g.lineTo(80, 186); g.lineTo(180, 136); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#d8262f'; g.font = 'bold 84px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.renderOrder = 5;
  return m;
}

// ================================================================ 樽（板・鉄の帯・ふた）
export function makeBarrel() {
  const T = getTextures();
  const wood = M('wood', { map: T.wood, normalMap: T.woodN, roughness: 0.62, normalScale: new THREE.Vector2(0.9, 0.9) });
  const iron = M('iron', { color: 0x3b4048, roughness: 0.38, metalness: 0.85 });
  const capM = M('bcap', { map: T.barrelCap, roughness: 0.65 });
  const warn = M('bwarn', { color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 0, transparent: true, opacity: 0, depthWrite: false });
  const g = new THREE.Group(); g.name = 'barrel';
  const spin = new THREE.Group(); g.add(spin);
  const body = G('barrelBody', () => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const k = i / 16, y = (k - 0.5) * 0.6; pts.push(new THREE.Vector2(0.245 + 0.04 * Math.sin(k * Math.PI), y)); }
    const lg = new THREE.LatheGeometry(pts, 32); lg.rotateX(Math.PI / 2); return lg;
  });
  spin.add(mesh(body, wood));
  for (const z of [-0.22, -0.1, 0.1, 0.22]) spin.add(mesh(G('hoop' + z, () => new THREE.TorusGeometry(0.247 + 0.04 * Math.sin((z / 0.6 + 0.5) * Math.PI) + 0.004, 0.012, 8, 40)), iron, 0, 0, z));
  for (const z of [-0.3, 0.3]) { const c = mesh(G('bcapG', () => new THREE.CircleGeometry(0.246, 32)), capM, 0, 0, z); if (z < 0) c.rotation.y = Math.PI; spin.add(c); }
  const glow = mesh(G('bglow', () => new THREE.SphereGeometry(0.36, 16, 12)), warn); glow.castShadow = false; g.add(glow);
  g.position.y = 0.28;
  const wrap = new THREE.Group(); wrap.add(g);
  wrap.userData = { spin, glow, warn };
  return wrap;
}

// ================================================================ 木箱・ボルト・火花ロボ
export function makeCrate() {
  const T = getTextures();
  const m = M('crate', { map: T.crate, roughness: 0.75 });
  const g = new THREE.Group();
  const b = mesh(box(0.6, 0.5, 0.6), m, 0, 0.25, 0); g.add(b);
  g.userData = { b };
  return g;
}
export function makeBolt() {
  const steel = M('bolt', { color: 0xb8c0c8, roughness: 0.25, metalness: 1 });
  const dark = M('boltD', { color: 0x5a6068, roughness: 0.35, metalness: 0.9 });
  const g = new THREE.Group(); const spin = new THREE.Group(); g.add(spin);
  const hex = mesh(cyl(0.2, 0.2, 0.18, 6), steel, 0, 0, 0); hex.rotation.x = Math.PI / 2; spin.add(hex);
  const shank = mesh(cyl(0.08, 0.08, 0.5, 14), dark, 0, 0, -0.3); shank.rotation.x = Math.PI / 2; spin.add(shank);
  for (let i = 0; i < 6; i++) spin.add(mesh(tor(0.085, 0.012, 14), dark, 0, 0, -0.12 - i * 0.07));
  spin.position.y = 0.22;
  g.userData = { spin };
  return g;
}
export function makeBot() {
  const shell = M('botShell', { color: 0xd94b3a, roughness: 0.35, metalness: 0.3 });
  const dark = M('botDark', { color: 0x2a2d33, roughness: 0.4, metalness: 0.6 });
  const eye = M('botEye', { color: 0xffffff, emissive: 0x7ff3ff, emissiveIntensity: 2 });
  const spark = M('spark', { color: 0xfff1a0, emissive: 0xffd040, emissiveIntensity: 3, transparent: true, opacity: 0.9, depthWrite: false });
  const g = new THREE.Group();
  const body = joint(g, 0, 0, 0);
  body.add(mesh(hemi(0.26), shell, 0, 0.18, 0, 1, 1.1, 1));
  body.add(mesh(cyl(0.27, 0.24, 0.1, 24), dark, 0, 0.14, 0));
  const e = mesh(sph(0.07, 14, 10), eye, 0, 0.32, 0.2, 1.4, 0.8, 0.6); body.add(e);
  for (const s of [-1, 1]) body.add(mesh(cyl(0.07, 0.07, 0.06, 14).clone().rotateZ(Math.PI / 2), dark, s * 0.2, 0.07, 0));
  const ant = mesh(cyl(0.01, 0.01, 0.16, 6), dark, 0, 0.5, 0); body.add(ant);
  const tip = mesh(sph(0.04, 10, 8), spark, 0, 0.6, 0); tip.castShadow = false; body.add(tip);
  const sparks = [];
  for (let i = 0; i < 4; i++) { const s = mesh(G('sparkG', () => new THREE.OctahedronGeometry(0.035)), spark, 0, 0.6, 0); s.castShadow = false; body.add(s); sparks.push(s); }
  g.userData = { body, e, tip, sparks };
  return g;
}
