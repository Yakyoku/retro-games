// 鉄骨レスキュー — 面の 3D 表示（2D 版・VR 版で共通）。ゲームの状態を読んで表示するだけで、論理には書き込まない。
// root: 舞台（メートル）。env: 空と街の遠景（VR の模型表示では舞台と別の縮尺で置く）。
// 補間: 論理は 60Hz。capture(g) を tick ごとに呼び、update(g, alpha, dt) で前 tick との間を補間して描く。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceY, liftCars, ventState } from '../core.js';
import { BARREL, MOVE } from '../config.js';
import { getTextures, skylineTexture, THEMES } from './textures.js';
import { makeHero, poseHero, makeGiant, poseGiant, makeCaptive, poseCaptive, makeBarrel, makeCrate, makeBolt, makeBot, makeHammer } from './models.js';

export const DEPTH = 1.6;           // 足場の奥行き（m）
const BEAM_Z = DEPTH / 2 - 0.06;
const LADDER_Z = -0.28;

const mat = {};
function sm(key, o) { return mat[key] || (mat[key] = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2, ...o })); }

function placed(g, m4) { const c = g.clone(); c.applyMatrix4(m4); return c; }
const M4 = (x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));

export class World {
  constructor({ quality = 'high', vr = false } = {}) {
    this.quality = quality; this.vr = vr;
    this.root = new THREE.Group(); this.root.name = 'stage';
    this.env = new THREE.Group(); this.env.name = 'env';
    this.dyn = new THREE.Group(); this.root.add(this.dyn);
    this.T = getTextures();
    this.pool = new Map();
    this.prev = new Map();
    this.belts = []; this.vents = []; this.deviceMeshes = []; this.hammerItems = []; this.liftMeshes = []; this.glows = []; this.pops = [];
    this.hero = makeHero(); this.dyn.add(this.hero);
    this.firstPerson = false;
    this.lights();
  }

  lights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a3a2a, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
    this.sun.castShadow = true;
    const sz = this.quality === 'ultra' ? 4096 : this.quality === 'standard' ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sz, sz);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    this.fill = new THREE.DirectionalLight(0xbfd6ff, 0.55);
    this.root.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
  }
  setShadowFrame(scale = 1) {
    const c = this.sun.shadow.camera, W = this.stage.width, H = this.stage.height;
    c.left = -W * 0.62 * scale; c.right = W * 0.62 * scale; c.top = H * 0.7 * scale; c.bottom = -H * 0.7 * scale; c.near = 0.5 * scale; c.far = 60 * scale;
    c.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ 面の組み立て
  build(stage) {
    this.clearStatic();
    this.stage = stage;
    const W = stage.width, H = stage.height;
    const theme = THEMES[stage.id] || THEMES.girders;
    this.theme = theme;
    this.static = new THREE.Group(); this.root.add(this.static);
    this.sun.position.set(W * 0.5 - 6, H + 10, 14); this.sun.target.position.set(W / 2, H / 2, 0);
    this.fill.position.set(W + 6, H * 0.6, 10); this.fill.target.position.set(W / 2, H / 2, 0);
    this.hemi.color.set(theme.sky[1][1]); this.hemi.intensity = stage.id === 'summit' ? 1.5 : stage.id === 'elevators' ? 1.35 : 1.15;
    this.sun.intensity = stage.id === 'summit' ? 2.6 : stage.id === 'elevators' ? 2.5 : 2.6;
    if (stage.id === 'summit' || stage.id === 'elevators') this.sun.color.set(0xdfe6ff); else this.sun.color.set(0xfff2dc);
    this.setShadowFrame(1);
    const T = this.T;
    const paintCol = stage.id === 'conveyors' ? 0x2f7fd6 : stage.id === 'elevators' ? 0x7a52c8 : stage.id === 'summit' ? 0xd23c3c : stage.id === 'tutorial' ? 0x3aa36a : 0xe0472d;
    const girderM = sm('girder' + paintCol, { color: paintCol, map: T.paint, normalMap: T.paintN, roughness: 0.52, metalness: 0.35 });
    const deckM = sm('deck', { color: 0x8d949c, map: T.tread, normalMap: T.treadN, roughness: 0.45, metalness: 0.75 });
    const boltM = sm('rivet', { color: 0xd8d8d8, roughness: 0.3, metalness: 0.9 });
    const concreteM = sm('concrete', { color: 0x9a968e, map: T.paint, normalMap: T.paintN, roughness: 0.9, metalness: 0 });
    const hazardM = sm('hazard', { map: T.hazard, roughness: 0.6, metalness: 0.1 });

    const beamParts = [], deckParts = [], concreteParts = [], hazardParts = [];
    const rivets = [];
    const flange = new THREE.BoxGeometry(1, 0.05, 0.16), web = new THREE.BoxGeometry(1, 1, 0.04), strut = new THREE.BoxGeometry(0.05, 1, 0.05);
    for (const p of stage.platforms) {
      const L = p.x1 - p.x0, ang = Math.atan2(p.y1 - p.y0, L), len = L / Math.cos(ang);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(p.x0, p.y0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)), new THREE.Vector3(1, 1, 1));
      const th = p.thick;
      const at = (x, y, z, sx, sy, sz, rz = 0) => base.clone().multiply(M4(x, y, z, rz, sx, sy, sz));
      if (p.kind === 'floor') {
        concreteParts.push(placed(new THREE.BoxGeometry(1, 1, 1), at(len / 2, -th / 2, 0, len, th, DEPTH + 0.6)));
        continue;
      }
      if (p.kind === 'conveyor') {
        // ベルト: 上面はベルト（向きを示す矢印が流れる）、両側は警告縞の枠、端にローラー
        const beltG = new THREE.BoxGeometry(len, 0.08, DEPTH - 0.3);
        const uv = beltG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 1.2);
        const beltTex = T.belt.clone(); beltTex.needsUpdate = true; beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
        const bm = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8, metalness: 0.1 });
        const belt = new THREE.Mesh(beltG, bm); belt.applyMatrix4(at(len / 2, -0.04, 0, 1, 1, 1)); belt.receiveShadow = true; this.static.add(belt);
        if (p.belt < 0) beltTex.repeat.x = -1;
        this.belts.push({ tex: beltTex, speed: p.belt });
        for (const z of [-1, 1]) hazardParts.push(placed(new THREE.BoxGeometry(1, 1, 1), at(len / 2, -0.12, z * (DEPTH / 2 - 0.07), len, 0.26, 0.12)));
        for (const x of [0.12, len - 0.12]) { const r = new THREE.CylinderGeometry(0.14, 0.14, DEPTH - 0.32, 18); r.rotateX(Math.PI / 2); beamParts.push(placed(r, at(x, -0.15, 0, 1, 1, 1))); }
        for (let x = 0.6; x < len - 0.3; x += 1.2) for (const z of [-1, 1]) beamParts.push(placed(strut, at(x, -0.32 - 0.15, z * (DEPTH / 2 - 0.12), 1, 0.4, 1)));
        continue;
      }
      // 鉄骨: 手前と奥の I 形梁（上下のフランジ・ウェブ・斜めの補強）＋間の縞鋼板
      for (const z of [-BEAM_Z, BEAM_Z]) {
        beamParts.push(placed(flange, at(len / 2, -0.025, z, len, 1, 1)));
        beamParts.push(placed(flange, at(len / 2, -th + 0.025, z, len, 1, 1)));
        const webH = th - 0.1;
        // ウェブは三角の格子（見る角度で抜けて見える）
        const n = Math.max(1, Math.round(len / (th * 1.6)));
        const step = len / n;
        const yb = -th + 0.05, yt = -0.05;
        const diag = (xa, ya, xb, yb2) => { const dx = xb - xa, dy = yb2 - ya; beamParts.push(placed(strut, at((xa + xb) / 2, (ya + yb2) / 2, z, 1, Math.hypot(dx, dy), 1, -Math.atan2(dx, dy)))); };
        for (let i = 0; i < n; i++) { const xa = i * step, xm = xa + step / 2, xb = xa + step; diag(xa, yb, xm, yt); diag(xm, yt, xb, yb); }
        beamParts.push(placed(web, at(0.03, -th / 2, z, 0.06, webH, 1))); beamParts.push(placed(web, at(len - 0.03, -th / 2, z, 0.06, webH, 1)));
        for (let x = 0.15; x < len; x += 0.4) for (const dz of [-0.05, 0.05]) rivets.push(at(x, 0.002, z + dz, 1, 1, 1));
      }
      deckParts.push(placed(new THREE.BoxGeometry(1, 1, 1), at(len / 2, -0.02, 0, len, 0.04, DEPTH - 0.2)));
      for (let x = 0.5; x < len; x += 1.5) beamParts.push(placed(new THREE.BoxGeometry(1, 1, 1), at(x, -th + 0.03, 0, 0.06, 0.06, DEPTH - 0.1)));
    }
    const add = (parts, m) => { if (!parts.length) return; const g = mergeGeometries(parts.map((q) => (q.index ? q.toNonIndexed() : q)), false); const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; this.static.add(o); };
    add(beamParts, girderM); add(deckParts, deckM); add(concreteParts, concreteM); add(hazardParts, hazardM);
    if (rivets.length) {
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), boltM, rivets.length);
      rivets.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = false; im.receiveShadow = true; this.static.add(im);
    }
    this.buildLadders(stage);
    this.buildProps(stage, girderM, hazardM);
    this.buildEnv(stage, theme);
    // キャラクター
    if (this.giant) this.dyn.remove(this.giant); this.giant = null;
    if (this.captive) this.dyn.remove(this.captive); this.captive = null;
    if (stage.boss) { this.giant = makeGiant(); this.dyn.add(this.giant); }
    if (stage.captive) { this.captive = makeCaptive(); this.dyn.add(this.captive); }
    for (const [, o] of this.pool) this.dyn.remove(o.obj);
    this.pool.clear(); this.prev.clear();
  }

  clearStatic() {
    if (this.static) { this.root.remove(this.static); this.static.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); }
    if (this.envStatic) { this.env.remove(this.envStatic); this.envStatic.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && o.material.userData.own) o.material.map.dispose(); }); }
    this.belts = []; this.vents = []; this.deviceMeshes = []; this.hammerItems = []; this.liftMeshes = []; this.glows = [];
  }

  buildLadders(stage) {
    const ok = sm('ladder', { color: 0x27b4c4, roughness: 0.4, metalness: 0.5 });
    const bad = sm('ladderBad', { color: 0x6f747b, roughness: 0.7, metalness: 0.4 });
    const tagM = new THREE.MeshStandardMaterial({ map: this.T.tag, roughness: 0.6 });
    const okParts = [], badParts = [];
    const rail = (h) => new THREE.CylinderGeometry(0.032, 0.032, h, 10);
    const rung = new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8); rung.rotateZ(Math.PI / 2);
    for (const l of stage.ladders) {
      const h = l.y1 - l.y0 + (l.broken ? -0.1 : 0.6);
      const parts = l.broken ? badParts : okParts;
      for (const s of [-1, 1]) parts.push(placed(rail(h), M4(l.x + s * 0.21, l.y0 + h / 2, LADDER_Z)));
      let k = 0;
      for (let y = l.y0 + 0.25; y < l.y1 - 0.05 + (l.broken ? 0 : 0.3); y += 0.3, k++) {
        if (l.broken && (k % 3 === 1 || k === 3 || k === 4)) continue; // 抜けた横木
        parts.push(placed(rung, M4(l.x, y, LADDER_Z, l.broken && k % 4 === 2 ? 0.25 : 0)));
      }
      if (l.broken) {
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), tagM); tag.position.set(l.x, l.y0 + 1.1, LADDER_Z + 0.06); tag.rotation.z = 0.08; this.static.add(tag);
      }
    }
    for (const [parts, m] of [[okParts, ok], [badParts, bad]]) {
      if (!parts.length) continue;
      const o = new THREE.Mesh(mergeGeometries(parts.map((q) => q.toNonIndexed())), m); o.castShadow = true; o.receiveShadow = true; this.static.add(o);
    }
  }

  buildProps(stage, girderM, hazardM) {
    const T = this.T, W = stage.width, H = stage.height;
    // 両端の柱と筋交い
    const colM = sm('column', { color: 0x59606a, map: T.paint, normalMap: T.paintN, roughness: 0.55, metalness: 0.5 });
    const parts = [];
    for (const x of [-0.55, W + 0.55]) for (const z of [-0.85, 0.85]) {
      parts.push(placed(new THREE.BoxGeometry(0.3, H + 2, 0.3), M4(x, H / 2 - 0.5, z)));
    }
    for (let y = 1; y < H; y += 3) for (const x of [-0.55, W + 0.55]) parts.push(placed(new THREE.BoxGeometry(0.06, 2.4, 0.06), M4(x, y + 1.2, -0.85, 0.9)));
    const cols = new THREE.Mesh(mergeGeometries(parts.map((q) => q.toNonIndexed())), colM); cols.castShadow = cols.receiveShadow = true; this.static.add(cols);
    // 地面（舞台の下へ広い土台）
    const ground = new THREE.Mesh(new THREE.BoxGeometry(W + 40, 0.6, 30), sm('earth', { color: 0x6d6457, map: T.paint, normalMap: T.paintN, roughness: 0.95, metalness: 0 }));
    ground.position.set(W / 2, (stage.pitY ?? 0) - 1.9, -8); ground.receiveShadow = true; this.static.add(ground);
    // 作業灯（柱の上）
    const lampM = sm('lampHead', { color: 0xfff7d6, emissive: 0xffe6a0, emissiveIntensity: 2.5, roughness: 0.3 });
    for (const [x, y] of [[-0.55, H * 0.55], [W + 0.55, H * 0.35], [-0.55, H * 0.15], [W + 0.55, H * 0.8]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.14), lampM); l.position.set(x, y, 1.0); this.static.add(l);
      this.addGlow(x, y, 1.12, 1.4, 0xffe2a0);
    }
    // 配管（背面を這う）
    const pipeM = sm('pipe', { color: 0x9aa6ae, roughness: 0.35, metalness: 0.85 });
    const pp = [];
    for (const [y, x0, x1] of [[H * 0.32, -0.4, W * 0.45], [H * 0.68, W * 0.4, W + 0.4]]) { const c = new THREE.CylinderGeometry(0.07, 0.07, x1 - x0, 12); c.rotateZ(Math.PI / 2); pp.push(placed(c, M4((x0 + x1) / 2, y, -1.5))); }
    const v = new THREE.CylinderGeometry(0.07, 0.07, H, 12); pp.push(placed(v, M4(-0.2, H * 0.5, -1.5)));
    const pipes = new THREE.Mesh(mergeGeometries(pp.map((q) => q.toNonIndexed())), pipeM); pipes.receiveShadow = true; this.static.add(pipes);

    // 樽を回収する炉（第1面・第2面・第4面の左下）
    for (const p of stage.platforms) if (p.sink != null && !stage.tutorial) {
      const g = new THREE.Group();
      const drumM = sm('furnace', { color: 0x30558a, roughness: 0.45, metalness: 0.6 });
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.9, 24), drumM); d.position.y = 0.45; d.castShadow = true; g.add(d);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 8, 24), sm('iron2', { color: 0x222, metalness: 0.8, roughness: 0.4 })); band.rotation.x = Math.PI / 2; band.position.y = 0.7; g.add(band);
      const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 20), sm('fire', { color: 0xff8a2a, emissive: 0xff5a10, emissiveIntensity: 3 })); fire.position.y = 0.9; g.add(fire);
      g.position.set(Math.max(0.5, p.sink - 0.2), surfaceY(p, p.sink), 0.2); this.static.add(g);
      this.addGlow(g.position.x, g.position.y + 1.1, 0.4, 1.4, 0xff7a30);
    }
    // ゴールの足場の旗
    for (const p of stage.platforms) if (p.goal) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8), sm('pole', { color: 0xdddddd, metalness: 0.8, roughness: 0.3 }));
      pole.position.set(p.x1 - 0.2, p.y0 + 0.8, -0.5); this.static.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), sm('flag', { color: 0x2fae4e, side: THREE.DoubleSide, roughness: 0.7 })); flag.position.set(p.x1 + 0.1, p.y0 + 1.42, -0.5); this.static.add(flag);
    }
    // 第2面: ホッパー（木箱の行き先）
    for (const d of stage.dispensers || []) {
      const p = stage.byId[d.plat];
      const end = p.belt > 0 ? p.x1 : p.x0;
      const hop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.25, 0.7, 4, 1, true), sm('hopper', { color: 0x5b6168, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }));
      hop.rotation.y = Math.PI / 4; hop.position.set(end + Math.sign(p.belt) * 0.45, p.y0 - 0.85, 0); this.static.add(hop);
      const disp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 1.0), hazardM); disp.position.set(d.x, p.y0 + 1.6, 0); disp.castShadow = true; this.static.add(disp);
      const chute = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.8), sm('chute', { color: 0x3a3f46, metalness: 0.6, roughness: 0.5 })); chute.position.set(d.x, p.y0 + 0.95, 0); this.static.add(chute);
    }
    // 第2面: 蒸気口
    for (const v of stage.vents || []) {
      const p = stage.byId[v.plat], y = surfaceY(p, v.x);
      const g = new THREE.Group(); g.position.set(v.x, y, 0); this.static.add(g);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 20), sm('vent', { color: 0x777f88, metalness: 0.8, roughness: 0.35 })); pipe.position.y = 0.08; g.add(pipe);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 24), new THREE.MeshStandardMaterial({ color: 0x552200, emissive: 0xff5a00, emissiveIntensity: 0 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.17; g.add(ring);
      const pipeUp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 12), sm('pipe2', { color: 0x9aa6ae, roughness: 0.35, metalness: 0.85 })); pipeUp.position.set(0, -1.0, -0.6); g.add(pipeUp);
      const puffs = [];
      const pm = new THREE.SpriteMaterial({ map: this.T.puff, transparent: true, depthWrite: false, opacity: 0 });
      for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(pm.clone()); s.scale.setScalar(0.6); g.add(s); puffs.push(s); }
      this.vents.push({ v, ring, puffs, g });
    }
    // 第3面: 昇降機の軸・上の機械（天井＝危険の縞）
    for (const l of stage.lifts || []) {
      const railM = sm('liftRail', { color: 0x4f5660, metalness: 0.8, roughness: 0.35 });
      const rp = [];
      for (const s of [-1, 1]) for (const z of [-0.65, 0.65]) rp.push(placed(new THREE.BoxGeometry(0.08, l.crushY - l.yMin + 1.4, 0.08), M4(l.x + s * (l.w / 2 + 0.08), (l.crushY + l.yMin) / 2 + 0.3, z)));
      const rails = new THREE.Mesh(mergeGeometries(rp.map((q) => q.toNonIndexed())), railM); rails.castShadow = true; this.static.add(rails);
      const house = new THREE.Mesh(new THREE.BoxGeometry(l.w + 0.5, 0.9, DEPTH), hazardM); house.position.set(l.x, l.crushY + 0.45, 0); house.castShadow = true; this.static.add(house);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 20), sm('motor', { color: 0x2c6e3e, metalness: 0.5, roughness: 0.4 })); motor.rotation.x = Math.PI / 2; motor.position.set(l.x, l.crushY + 1.2, 0); this.static.add(motor);
      const dir = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), sm('arrow' + l.dir, { color: 0xffffff, emissive: l.dir > 0 ? 0x30ff70 : 0xff5040, emissiveIntensity: 1.6 }));
      dir.rotation.z = l.dir > 0 ? 0 : Math.PI; dir.position.set(l.x, l.crushY + 0.45, DEPTH / 2 + 0.02); this.static.add(dir);
      const cars = [];
      const carM = sm('car', { color: 0xf2b705, metalness: 0.4, roughness: 0.45 });
      for (const c of [0, 1, 2, 3, 4, 5]) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(l.w, 0.22, DEPTH - 0.2), carM); top.position.y = -0.11; top.castShadow = top.receiveShadow = true; g.add(top);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(l.w, 0.06, 0.06), hazardM); edge.position.set(0, -0.03, (DEPTH - 0.2) / 2); g.add(edge);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), railM); cable.position.y = 0.5; cable.scale.y = 1; g.add(cable);
        g.visible = false; this.static.add(g); cars.push({ g, cable });
      }
      this.liftMeshes.push({ l, cars });
      // 落ちたら戻れない穴（暗い縁と赤い灯）
      this.addGlow(l.x, (stage.pitY ?? 0) - 0.6, 0.6, 1.2, 0xff2a20);
    }
    // 装置（最終面・チュートリアル）
    for (const d of stage.devices || []) {
      const p = stage.byId[d.plat], y = surfaceY(p, d.x);
      const g = new THREE.Group(); g.position.set(d.x, y, -0.45); this.static.add(g);
      const boxM = sm('panel', { color: 0x3b4450, metalness: 0.6, roughness: 0.4 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), boxM); b.position.y = 0.5; b.castShadow = true; g.add(b);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: this.T.num[d.order - 1], toneMapped: false })); face.position.set(0, 0.75, 0.185); g.add(face);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 })); lamp.position.set(0, 1.05, 0); g.add(lamp);
      const lever = new THREE.Group(); lever.position.set(0.22, 0.4, 0.2); g.add(lever);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8), sm('steelL', { color: 0xbfc5cc, metalness: 0.9, roughness: 0.3 })); stick.position.y = 0.16; lever.add(stick);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), sm('knob', { color: 0xd8262f, roughness: 0.4 })); knob.position.y = 0.33; lever.add(knob);
      lever.rotation.z = 0.6;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0xfff15a, emissive: 0xffd000, emissiveIntensity: 1.8 })); arrow.rotation.x = Math.PI; arrow.position.set(0, 1.55, 0.2); g.add(arrow);
      this.deviceMeshes.push({ order: d.order, g, lamp, lever, arrow });
    }
    // ハンマー
    stage.hammers && stage.hammers.forEach((h, i) => {
      const m = makeHammer(); m.scale.setScalar(1.25); const g = new THREE.Group(); g.add(m); m.rotation.z = 0.5;
      const p = stage.byId[h.plat]; g.position.set(h.x, surfaceY(p, h.x) + 0.9, 0.1);
      this.static.add(g); this.hammerItems.push({ g, i, glow: this.addGlow(h.x, g.position.y - 0.25, 0.1, 0.9, 0xfff0a0) });
    });
  }

  addGlow(x, y, z, s, color) {
    const m = new THREE.SpriteMaterial({ map: this.T.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.setScalar(s); (this.static || this.root).add(sp); this.glows.push(sp);
    return sp;
  }

  // 遠景: 2D は舞台の後ろの大きな板、VR は周囲の円筒と立体のビル
  buildEnv(stage, theme) {
    this.envStatic = new THREE.Group(); this.env.add(this.envStatic);
    const W = stage.width, H = stage.height;
    const tex = skylineTexture(theme, this.quality === 'standard' ? 2048 : 4096, this.quality === 'standard' ? 512 : 1024);
    if (!this.vr) {
      const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }); m.userData.own = true;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(W * 4.2, H * 1.6), m); plane.position.set(W / 2, H * 0.55, -24); this.envStatic.add(plane);
    } else {
      const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false }); m.userData.own = true;
      tex.repeat.set(2, 1);
      const cylG = new THREE.CylinderGeometry(160, 160, 120, 64, 1, true);
      const c = new THREE.Mesh(cylG, m); c.position.y = 30; this.envStatic.add(c);
      const top = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: theme.sky[0][1], side: THREE.BackSide, toneMapped: false }));
      top.position.y = 89; this.envStatic.add(top);
    }
    // 立体のビル（窓の明かり）: 舞台の奥と左右。描画をまとめるため 1 つの InstancedMesh
    const n = this.vr ? 90 : 0;   // 2D は背景の板に街が描いてあるので立体のビルは置かない
    const night = stage.id === 'summit' || stage.id === 'elevators';
    const bm = new THREE.MeshStandardMaterial({ map: this.T.windows, color: night ? 0xffffff : 0xc9d6e8, emissive: 0xffffff, emissiveMap: this.T.windows, emissiveIntensity: night ? 0.9 : 0.05, roughness: 0.8, metalness: 0.1 });
    if (!n) { this.fogColor = new THREE.Color(theme.sky[2][1]); return; }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bm, n);
    const m4 = new THREE.Matrix4(); let k = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = this.vr ? 45 + ((i * 37) % 40) : 0;
      const x = this.vr ? W / 2 + Math.cos(a) * r : -30 + (i / n) * (W + 60), z = this.vr ? Math.sin(a) * r : -14 - ((i * 13) % 9);
      if (this.vr && Math.abs(z) < 12 && Math.abs(x - W / 2) < 20) continue;
      const w = 4 + ((i * 7) % 6), h = 10 + ((i * 29) % 34), d = 4 + ((i * 11) % 5);
      m4.compose(new THREE.Vector3(x, h / 2 - 2.5, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)); im.setMatrixAt(k++, m4);
    }
    im.count = k; this.envStatic.add(im);
    // 霧（遠景を空になじませる）
    this.fogColor = new THREE.Color(theme.sky[2][1]);
  }

  // ------------------------------------------------------------ 動くもの
  entity(id, make) {
    let e = this.pool.get(id);
    if (!e) { e = { obj: make(), seen: 0 }; this.dyn.add(e.obj); this.pool.set(id, e); }
    e.seen = this.frame;
    return e;
  }
  capture(g) {
    // 論理の tick ごとに、前の位置を覚えておく
    const keep = (id, x, y) => { const p = this.prev.get(id); if (p) { p.px = p.x; p.py = p.y; p.x = x; p.y = y; } else this.prev.set(id, { px: x, py: y, x, y }); };
    for (const b of g.barrels) keep(b.id, b.x, b.y);
    for (const c of g.crates) keep(c.id, c.x, c.y);
    for (const b of g.bolts) keep(b.id, b.x, b.y);
    for (const b of g.bots) keep(b.id, b.x, b.y);
    keep('hero', g.player.x, g.player.y);
    for (const l of g.lifts) for (const c of l.cars) keep(c.id, l.x, c.y);
  }
  lerp(id, alpha, x, y) {
    const p = this.prev.get(id);
    if (!p) return [x, y];
    if (Math.abs(p.x - p.px) > 2 || Math.abs(p.y - p.py) > 2) return [p.x, p.y]; // 復帰などの跳びは補間しない
    return [p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha];
  }

  update(g, alpha, dt, t) {
    this.frame = (this.frame || 0) + 1;
    const st = g.stage;
    // ---- 主人公
    const p = g.player;
    const [hx, hy] = this.lerp('hero', alpha, p.x, p.y);
    this.hero.position.set(hx, hy, 0);
    const climbing = p.state === 'climb';
    const targetYaw = climbing ? Math.PI : p.facing > 0 ? Math.PI / 2 - 0.5 : -(Math.PI / 2 - 0.5);
    let dy = targetYaw - this.hero.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.hero.rotation.y += dy * (1 - Math.exp(-18 * dt));
    if (climbing) this.hero.position.z = LADDER_Z + 0.24;
    const blink = p.invT > 0 && g.phase === 'play' && Math.floor(t * 12) % 2 === 0;
    this.hero.visible = !this.firstPerson && !blink;
    poseHero(this.hero, { state: p.state, vy: p.vy, moving: p.moving, walkPhase: p.walkPhase, climbPhase: p.y * 4.5, hammer: p.hammerT, swingT: p.swingT, landT: p.landT,
      deadT: p.deadT, deathCause: p.deathCause, facing: p.facing, victory: g.phase === 'clear' || g.phase === 'rescue' || g.phase === 'ending', scared: false }, dt);
    // ---- 巨大な敵
    if (this.giant && g.boss) {
      const b = g.boss;
      this.giant.position.set(b.x, b.y - (b.fallY || 0), -0.15);
      if (b.state === 'flee') this.giant.position.y = b.y + Math.min(6, b.t * b.t * 2.5);
      this.giant.rotation.y = 0.35 * (st.boss.throwDir || 1);
      if (b.state === 'defeat') this.giant.rotation.z = Math.min(Math.PI * 0.8, (b.t > 1.2 ? (b.t - 1.2) * 2 : 0));
      else this.giant.rotation.z = 0;
      poseGiant(this.giant, { state: b.state, t: b.t, mood: b.mood, kind: st.boss.kind }, dt);
      this.giant.visible = this.giant.position.y > -6;
    }
    if (this.captive && g.captive) {
      const c = g.captive;
      this.captive.position.set(c.x, c.y, -0.2);
      const look = (p.x - c.x) > 0 ? 0.6 : -0.6;
      this.captive.rotation.y += (look - this.captive.rotation.y) * (1 - Math.exp(-4 * dt));
      poseCaptive(this.captive, { state: g.phase === 'clear' || g.phase === 'rescue' || g.phase === 'ending' ? 'happy' : c.state }, dt);
    }
    // ---- 樽
    for (const b of g.barrels) {
      const e = this.entity(b.id, makeBarrel);
      const [x, y] = this.lerp(b.id, alpha, b.x, b.y);
      e.obj.position.set(x, y, 0);
      const u = e.obj.userData;
      u.spin.rotation.z = -b.spin;
      if (b.state === 'ladder') { u.spin.rotation.y = Math.PI / 2; } else u.spin.rotation.y = 0;
      const w = Math.max(b.warn || 0, 0);
      u.warn.opacity = w > 0 ? 0.35 * (0.5 + 0.5 * Math.sin(t * 30)) : 0; u.warn.emissiveIntensity = w > 0 ? 2 : 0;
    }
    for (const c of g.crates) {
      const e = this.entity(c.id, makeCrate);
      const [x, y] = this.lerp(c.id, alpha, c.x, c.y);
      e.obj.position.set(x, y, 0); e.obj.rotation.z = -c.spin;
    }
    for (const b of g.bolts) {
      const e = this.entity(b.id, makeBolt);
      const [x, y] = this.lerp(b.id, alpha, b.x, b.y);
      e.obj.position.set(x, y, 0); e.obj.userData.spin.rotation.z = -b.spin;
    }
    for (const b of g.bots) {
      const e = this.entity(b.id, makeBot);
      e.obj.visible = b.alive;
      const [x, y] = this.lerp(b.id, alpha, b.x, b.y);
      e.obj.position.set(x, y, 0); e.obj.rotation.y = b.dir > 0 ? 0.9 : -0.9;
      const u = e.obj.userData; u.body.position.y = Math.abs(Math.sin(t * 9 + x)) * 0.04;
      u.sparks.forEach((s, i) => { const a = t * 13 + i * 1.7; s.position.set(Math.cos(a) * 0.12, 0.6 + Math.abs(Math.sin(a * 1.3)) * 0.12, Math.sin(a) * 0.12); s.visible = Math.sin(a * 3) > -0.3; });
    }
    // 使われなくなった物を片付ける
    for (const [id, e] of this.pool) if (e.seen !== this.frame) { this.dyn.remove(e.obj); this.pool.delete(id); this.prev.delete(id); }
    // ---- 昇降機
    const cars = liftCars(g);
    for (const lm of this.liftMeshes) {
      const mine = cars.filter((c) => c.lift.x === lm.l.x);
      lm.cars.forEach((cm, i) => {
        const c = mine[i];
        cm.g.visible = !!c;
        if (c) { const [, y] = this.lerp(c.id, alpha, lm.l.x, c.y0); cm.g.position.set(lm.l.x, y, 0); const len = lm.l.crushY - y; cm.cable.scale.y = Math.max(0.01, len); cm.cable.position.y = len / 2; }
      });
    }
    // ---- ベルト
    for (const b of this.belts) b.tex.offset.x -= (b.speed / 1.2) * dt * Math.sign(b.tex.repeat.x || 1) * (g.phase === 'play' || g.phase === 'intro' ? 1 : 0);
    // ---- 蒸気
    for (const v of this.vents) {
      const s = ventState(g, v.v);
      v.ring.material.emissiveIntensity = s.state === 'warn' ? 1.5 + Math.sin(t * 40) * 1.2 : s.state === 'on' ? 2.5 : 0;
      v.puffs.forEach((pf, i) => {
        if (s.state === 'on') {
          const k = ((t * 1.6 + i / v.puffs.length) % 1);
          pf.position.set(Math.sin(i * 2.1 + t) * 0.12 * k, 0.2 + k * v.v.h, 0.05);
          pf.scale.setScalar(0.4 + k * 0.9); pf.material.opacity = 0.75 * (1 - k * 0.7);
        } else if (s.state === 'warn') {
          const k = ((t * 1.2 + i / v.puffs.length) % 1);
          pf.position.set(Math.sin(i * 2.1) * 0.08, 0.2 + k * 0.35, 0.05); pf.scale.setScalar(0.25); pf.material.opacity = i % 3 === 0 ? 0.4 * (1 - k) : 0;
        } else pf.material.opacity = 0;
      });
    }
    // ---- 装置
    for (const dm of this.deviceMeshes) {
      const d = g.devices.find((q) => q.order === dm.order); if (!d) continue;
      dm.lamp.material.color.set(d.done ? 0x30ff70 : 0xff3020); dm.lamp.material.emissive.set(d.done ? 0x20e050 : 0xff2010);
      dm.lever.rotation.z += ((d.done ? -0.6 : 0.6) - dm.lever.rotation.z) * (1 - Math.exp(-10 * dt));
      const next = !d.done && d.order === g.nextDevice;
      dm.arrow.visible = next; dm.arrow.position.y = 1.55 + Math.sin(t * 5) * 0.08; dm.arrow.rotation.y = t * 2;
    }
    // ---- ハンマー
    for (const hi of this.hammerItems) {
      const h = g.hammers[hi.i]; const show = h && !h.taken && !h.locked;
      hi.g.visible = show; hi.glow.visible = show;
      hi.g.rotation.y = t * 2.2; hi.g.position.y += (Math.sin(t * 3) * 0.002);
    }
    // ---- 作業灯のちらつき（ごく弱く）
    for (const gl of this.glows) gl.material.opacity = 0.7 + Math.sin(t * 7 + gl.position.x) * 0.04;
  }
}
