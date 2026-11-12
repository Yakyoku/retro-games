// ツイン・ガーデン VR — 3D の描画（通常の 3D 画面と WebXR の両方）。ゲームの判定は共通コアの 2D 座標で行い、ここは写すだけ。
// 庭のグループ garden: 盤面の (x, y) → ローカル (x-12, 0, y-9)。縮尺 s（m/単位）は卓上・没入スケールで変える。
import * as THREE from 'three';
import * as M from './models.js';
import { MARKS } from '/shared/ui/marks.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const MAX_SEG = 220; // 線分を細かく分けた数の上限（色のグラデーション用）
const ROPE_Y = 0.34;

export class Renderer3D {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.03, 200);
    this.scene.add(this.camera);
    this.garden = new THREE.Group();
    this.scene.add(this.garden);
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.t = 0;
    this.mode = { scale: 'table', posture: 'seated', h: 0, d: 0, size: 1, inXR: false };

    // 光
    this.hemi = new THREE.HemisphereLight(0xdff4ff, 0x4a6a3a, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0xcfe9f5, 20, 70);

    // 庭の地面・枠・台
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }));
    this.ground.receiveShadow = true;
    this.frame = M.makeFrame();
    this.table = M.makeTable();
    this.garden.add(this.ground, this.frame, this.table);
    this.sceneries = {};
    this.scenery = null;

    // 動くもの
    this.layer = new THREE.Group(); this.garden.add(this.layer);
    this.red = M.makeRed(); this.blue = M.makeBlue();
    this.layer.add(this.red, this.blue);
    this.auras = [0xffd36b, 0xffd36b].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.8, toneMapped: false })); m.visible = false; this.layer.add(m); return m; });
    this.pegs = []; this.mush = []; this.enemies = []; this.plants = []; this.gems = {}; this.chest = null;

    // ライン（円柱と関節の球をインスタンス描画）
    const ropeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.ropeSeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12, 1, true), ropeMat, MAX_SEG);
    this.ropeJoint = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 12, 8), ropeMat, MAX_SEG + 2);
    this.ropeSeg.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.ropeJoint.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ropeSeg.frustumCulled = false; this.ropeJoint.frustumCulled = false;
    this.ropeSeg.setColorAt(0, new THREE.Color()); this.ropeJoint.setColorAt(0, new THREE.Color());
    this.ropeGlow = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff4ff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }), MAX_SEG);
    this.ropeGlow.frustumCulled = false;
    this.garden.add(this.ropeSeg, this.ropeJoint, this.ropeGlow);

    // 演出
    this.fx = [];
    this.parts = { n: 700, i: 0, pos: new Float32Array(700 * 3), col: new Float32Array(700 * 3), vel: new Float32Array(700 * 3), life: new Float32Array(700), max: new Float32Array(700) };
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.parts.pos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.parts.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, map: dotTexture() }));
    this.points.frustumCulled = false;
    this.garden.add(this.points);
    this.popPool = Array.from({ length: 10 }, () => makeTextSprite());
    for (const p of this.popPool) { p.visible = false; this.garden.add(p); }
    this.memoryMark = M.makeChest(); this.memoryMark.visible = false; this.garden.add(this.memoryMark);
    this.precision = M.makePlant(); this.precision.visible = false; this.garden.add(this.precision);
    this.precisionRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }));
    this.precisionRing.visible = false; this.garden.add(this.precisionRing);

    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), d: new THREE.Vector3(), c: new THREE.Color(), cr: new THREE.Color(0xff5a62), cw: new THREE.Color(0xf6eaff), cb: new THREE.Color(0x58b0ff) };
    this.game = null; this.stageKey = '';
    this.setTheme('meadow');
    this.place();
  }

  // ───────── 配置 ─────────
  setMode(m) { Object.assign(this.mode, m); this.place(); }
  get s() { return this.mode.scale === 'immersive' && this.mode.inXR ? 0.2 * this.mode.size : 0.04 * this.mode.size; }
  place() {
    const s = this.s, m = this.mode;
    const g = this.garden;
    g.scale.setScalar(s);
    if (m.scale === 'immersive' && m.inXR) {
      g.position.set(0, 0.03 + m.h, -(0.6 + 9 * s + m.d)); // 床の芝と同じ高さにしない（ちらつき防止）
      this.table.visible = false;
    } else {
      // VR 中は実際の目の高さから決める（座っても立っても、庭を少し見下ろす高さ）。測れないときは姿勢の設定
      const baseH = m.inXR && m.eye ? Math.min(1.35, Math.max(0.45, m.eye - 0.58)) : m.posture === 'standing' ? 0.95 : 0.72;
      g.position.set(0, baseH + m.h, -(0.4 + 9 * s + m.d));
      this.table.visible = true;
    }
    // 影のカメラを庭に合わせる
    const c = g.position, sh = this.sun.shadow.camera, R = 15 * s;
    this.sun.position.set(c.x - 8 * s, c.y + 22 * s, c.z + 10 * s);
    this.sun.target.position.copy(c);
    sh.left = -R; sh.right = R; sh.top = R; sh.bottom = -R; sh.near = 0.1 * s; sh.far = 60 * s; sh.updateProjectionMatrix();
    this.points.material.size = 0.14 * s;
    if (this.scenery) this.scenery.position.y = 0;
  }

  /** 通常の 3D 画面のカメラ（盤面全体が収まる位置。前上方から見下ろす） */
  fitCamera(aspect) {
    const cam = this.camera, s = this.s, c = this.garden.position;
    cam.aspect = aspect; cam.fov = 38; cam.updateProjectionMatrix();
    const el = 0.98; // 見下ろす角度（rad）
    const corners = [[-12.8, -9.8], [12.8, -9.8], [-12.8, 9.8], [12.8, 9.8]].map(([x, z]) => new THREE.Vector3(c.x + x * s, c.y, c.z + z * s));
    const v = new THREE.Vector3();
    const fits = (d) => {
      cam.position.set(c.x, c.y + Math.sin(el) * d, c.z + Math.cos(el) * d);
      cam.lookAt(c.x, c.y, c.z);
      cam.updateMatrixWorld(true);
      let minY = 1, maxY = -1;
      for (const p of corners) { v.copy(p).project(cam); if (Math.abs(v.x) > 0.97) return false; minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
      return minY > -0.97 && maxY < 0.97;
    };
    // 二分探索で、盤の四隅が画面に収まる最短の距離
    let lo = 5 * s, hi = 200 * s;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    fits(hi);
    // 上下の余りを均等に（盤の中心を画面の中心へ）
    let minY = 1, maxY = -1;
    for (const p of corners) { v.copy(p).project(cam); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const off = (minY + maxY) / 2;
    cam.lookAt(c.x, c.y, c.z - off * 9 * s * 0.9);
    cam.updateProjectionMatrix();
  }

  setTheme(theme) {
    if (this.theme === theme) return;
    this.theme = theme;
    const th = M.THEME3[theme];
    this.ground.material.map = M.grassTexture(theme, this.maxAniso, this.quality === 'low' ? 1024 : 2048);
    this.ground.material.needsUpdate = true;
    this.frame.material.color.set(th.frame);
    this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]); this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.sun); this.sun.intensity = th.sunI;
    this.scene.fog.color.set(th.fog);
    if (this.scenery) this.scene.remove(this.scenery);
    if (!this.sceneries[theme]) this.sceneries[theme] = M.makeScenery(theme);
    this.scenery = this.sceneries[theme];
    this.scene.add(this.scenery);
    this.scene.background = new THREE.Color(th.fog);
  }

  setShadowSize(n) { if (this.sun.shadow.mapSize.x !== n) { this.sun.shadow.mapSize.set(n, n); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } }

  // ───────── ゲームとの対応 ─────────
  setGame(g) {
    this.game = g; this.stageKey = '';
    for (const f of this.fx) this.garden.remove(f.obj);
    this.fx.length = 0;
    this.parts.life.fill(0); this.parts.max.fill(0);
    if (!g) this.syncStage(null);
  }

  syncStage(g) {
    const key = g ? `${g.kind}:${g.def.number}:${g.mode}:${g.bonus ? g.bonus.type : ''}` : 'none';
    if (key === this.stageKey) return;
    this.stageKey = key;
    if (g) this.setTheme(g.def.theme);
    const pegs = g ? g.pegs : [{ x: 12, y: 9 }];
    while (this.pegs.length < pegs.length) { const p = M.makePeg(); this.pegs.push(p); this.layer.add(p); }
    this.pegs.forEach((p, i) => { p.visible = i < pegs.length; if (p.visible) p.position.set(pegs[i].x - 12, 0, pegs[i].y - 9); });
    const nm = g ? g.mush.length : 0;
    while (this.mush.length < nm) { const m = M.makeMush(this.mush.length); this.mush.push(m); this.layer.add(m); }
    const ne = g ? g.enemies : [];
    for (const e of this.enemies) this.layer.remove(e);
    this.enemies = ne.map((e) => { const o = e.kind === 'patrol' ? M.makeBeetle() : M.makeBurr(); this.layer.add(o); return o; });
    const np = g ? g.plants.length : 0;
    while (this.plants.length < np) { const p = M.makePlant(); this.plants.push(p); this.layer.add(p); }
    this.plants.forEach((p, i) => { p.visible = i < np; if (p.visible) p.position.set(g.plants[i].x - 12, 0, g.plants[i].y - 9); });
    if (this.chest) { this.layer.remove(this.chest); this.chest = null; }
    for (const k of Object.keys(this.gems)) { this.layer.remove(this.gems[k]); delete this.gems[k]; }
  }

  onEvents(ev, g) {
    for (const e of ev) {
      if (e.type === 'capture') {
        this.fillFx(e.poly, e.items.length ? 0xfff2b0 : 0xffffff, e.items.length ? 0.6 : 0.3, 0.8);
        for (const it of e.items) {
          const col = it.kind === 'mush' ? 0xffcf6b : it.kind === 'plant' ? 0x9cff8a : it.kind === 'gem' ? new THREE.Color(MARKS[it.mark].color).getHex() : it.kind === 'chest' ? 0xffe28a : 0xff8a8a;
          this.burst(it.x, it.y, col, it.kind === 'chest' ? 50 : 18);
        }
        if (e.points > 0) { const c = centroid(e.poly); this.pop(c.x, c.y, `+${e.points}`, e.mult > 1 ? `×${e.mult.toFixed(2)}` : ''); }
      } else if (e.type === 'hint') this.fillFx(e.poly, e.tooBig ? 0xffaa5a : 0x5adcff, 0.45, 1.4, true);
      else if (e.type === 'miss') { const p = e.who === 'blue' ? g.blue : g.red; this.burst(p.x, p.y, 0xff5050, 50); }
      else if (e.type === 'plant') { const p = g.plants[e.id]; this.pop(p.x, p.y, `+${e.heal}`, 'エネルギー', '#aaffaa'); }
      else if (e.type === 'gemsOut' && g.chest) this.burst(g.chest.x, g.chest.y, 0xfff6b0, 60);
      else if (e.type === 'bonusHit') { this.burst(e.x, e.y, 0xfff6b0, 50); this.pop(e.x, e.y, `+${e.points}`, ''); }
    }
  }

  fillFx(poly, color, op, life, pulse = false) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x - 12, -(p.y - 9))));
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.05; mesh.renderOrder = 2;
    const edgePts = poly.map((p) => new THREE.Vector3(p.x - 12, 0.08, p.y - 9)); edgePts.push(edgePts[0].clone());
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, toneMapped: false }));
    const obj = new THREE.Group(); obj.add(mesh, edge);
    this.garden.add(obj);
    this.fx.push({ obj, mat, emat: edge.material, op, life, t: 0, pulse });
  }

  burst(x, y, color, n) {
    const P = this.parts, c = this.tmp.c.set(color);
    for (let k = 0; k < n; k++) {
      const i = P.i; P.i = (P.i + 1) % P.n;
      const a = Math.random() * TAU, sp = 1.5 + Math.random() * 4, up = 2 + Math.random() * 4;
      P.pos[i * 3] = x - 12; P.pos[i * 3 + 1] = 0.4; P.pos[i * 3 + 2] = y - 9;
      P.vel[i * 3] = Math.cos(a) * sp; P.vel[i * 3 + 1] = up; P.vel[i * 3 + 2] = Math.sin(a) * sp;
      P.col[i * 3] = c.r; P.col[i * 3 + 1] = c.g; P.col[i * 3 + 2] = c.b;
      P.life[i] = 0; P.max[i] = 0.6 + Math.random() * 0.6;
    }
  }

  pop(x, y, text, sub, color) {
    const sp = this.popPool.find((p) => !p.visible) || this.popPool[0];
    drawTextSprite(sp, text, sub, color);
    sp.visible = true; sp.userData.t = 0; sp.userData.x = x - 12; sp.userData.z = y - 9;
  }

  // ───────── 描画 ─────────
  render(g, alpha, dt, camera) {
    this.t += dt;
    const t = this.t;
    this.syncStage(g);
    const ip = (o, out) => { out.x = lerp(o.px, o.x, alpha); out.y = lerp(o.py, o.y, alpha); return out; };
    const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
    if (!g) {
      a.x = 12 + Math.cos(t * 0.6) * 5; a.y = 9 + Math.sin(t * 0.6) * 3.5; b.x = 24 - a.x; b.y = 18 - a.y;
      this.placeActor(this.red, a, a, t, false); this.placeActor(this.blue, b, b, t + 1, false);
      for (const m of this.mush) m.visible = false;
      this.updateRope([a, b], t);
    } else {
      ip(g.red, a); ip(g.blue, b);
      const show = g.phase !== 'miss' || Math.floor(t * 8) % 2 === 1;
      const blink = g.invulnT > 0 && Math.floor(t * 12) % 2 === 0;
      this.red.visible = show && !blink; this.blue.visible = show && !blink;
      this.placeActor(this.red, a, { x: g.red.x - g.red.px, y: g.red.y - g.red.py }, t, true);
      this.placeActor(this.blue, b, { x: g.blue.x - g.blue.px, y: g.blue.y - g.blue.py }, t + 1.3, true);
      const pw = g.powerT > 0;
      this.auras[0].visible = this.auras[1].visible = pw;
      if (pw) { this.auras[0].position.set(a.x - 12, 0.3, a.y - 9); this.auras[1].position.set(b.x - 12, 0.3, b.y - 9); const s = 1 + 0.1 * Math.sin(t * 12); this.auras[0].scale.setScalar(s); this.auras[1].scale.setScalar(s); }
      // 杭（掛かっている杭は光る）
      const on = new Set(g.rope.anchors.map((x) => x.peg));
      this.pegs.forEach((p, i) => { p.userData.glow.material.opacity = on.has(i) ? 0.5 + 0.3 * Math.sin(t * 8) : 0; });
      // 回収対象
      const tmp = { x: 0, y: 0 };
      this.mush.forEach((o, i) => {
        const m = g.mush[i];
        o.visible = !!m && m.alive;
        if (!o.visible) return;
        ip(m, tmp);
        o.position.set(tmp.x - 12, 0, tmp.y - 9);
        const hop = Math.abs(Math.sin(t * 3.2 + i * 1.7));
        o.userData.body.position.y = hop * 0.12;
        o.userData.body.scale.set(1 + (0.12 - hop * 0.12), 1 - (0.12 - hop * 0.12), 1 + (0.12 - hop * 0.12));
        o.rotation.y = Math.sin(t * 0.7 + i) * 0.6;
      });
      // 敵
      this.enemies.forEach((o, i) => {
        const e = g.enemies[i];
        o.visible = e.alive;
        if (!e.alive) return;
        ip(e, tmp);
        o.position.set(tmp.x - 12, 0, tmp.y - 9);
        o.rotation.y = -e.h + Math.PI / 2;
        if (e.kind === 'patrol') o.userData.body.position.y = Math.abs(Math.sin(t * 14 + i)) * 0.03;
        else { o.userData.spikes.rotation.y = t * 2.4; o.userData.spikes.rotation.x = t * 1.3; o.userData.body.position.y = Math.sin(t * 6 + i) * 0.05; }
      });
      // 植物
      this.plants.forEach((o, i) => {
        const p = g.plants[i]; if (!p) return;
        const u = o.userData;
        u.seed.visible = p.grow === 0; u.sprout.visible = p.grow > 0;
        u.sprout.scale.setScalar(p.grow === 1 ? 0.6 : 1);
        u.flower.visible = p.grow === 2; u.bud.visible = p.grow === 1;
        u.sprout.rotation.z = Math.sin(t * 2 + i) * 0.06;
        if (p.grow === 2) u.flower.rotation.y = t * 0.3;
      });
      // 宝箱・宝
      if (g.chest && !this.chest) { this.chest = M.makeChest(); this.chest.position.set(g.chest.x - 12, 0, g.chest.y - 9); this.layer.add(this.chest); }
      if (this.chest && g.chest) {
        const open = Math.min(1, g.chest.t / 48);
        this.chest.userData.hinge.rotation.x = -open * 1.9;
        this.chest.userData.light.intensity = open * 3;
      }
      for (const gm of g.gems) {
        if (!this.gems[gm.id]) { this.gems[gm.id] = M.makeGem(gm.mark); this.layer.add(this.gems[gm.id]); }
        const o = this.gems[gm.id];
        o.visible = gm.alive;
        if (!gm.alive) continue;
        ip(gm, tmp);
        o.position.set(tmp.x - 12, 0, tmp.y - 9);
        o.userData.mesh.rotation.y = t * 2 + gm.id;
        o.userData.mesh.position.y = 0.45 + Math.sin(t * 4 + gm.id) * 0.06;
      }
      // ボーナスの目印
      const bn = g.kind === 'bonus' ? g.bonus : null;
      this.memoryMark.visible = !!(bn && bn.type === 'memory' && bn.showT > 0);
      if (this.memoryMark.visible) { this.memoryMark.position.set(bn.spot.x - 12, 0, bn.spot.y - 9); this.memoryMark.userData.light.intensity = 2; }
      const pr = bn && bn.type === 'precision' && bn.k < bn.def.targets.length;
      this.precision.visible = this.precisionRing.visible = !!pr;
      if (pr) {
        const tg = bn.def.targets[bn.k], rr = Math.sqrt(bn.def.maxArea / Math.PI);
        this.precision.position.set(tg.x - 12, 0, tg.y - 9);
        Object.assign(this.precision.userData, {}); this.precision.userData.seed.visible = false; this.precision.userData.bud.visible = false;
        this.precisionRing.position.set(tg.x - 12, 0.04, tg.y - 9); this.precisionRing.scale.setScalar(rr);
      }
      this.updateRope([a, ...g.rope.anchors.map((x) => g.pegs[x.peg]), b], t);
    }
    // 演出
    for (const f of this.fx) {
      f.t += dt;
      const u = f.t / f.life;
      f.mat.opacity = f.op * (1 - u) * (f.pulse ? 0.6 + 0.4 * Math.sin(f.t * 18) : 1);
      f.emat.opacity = 1 - u;
      f.obj.position.y = u * 0.3;
    }
    for (let i = this.fx.length - 1; i >= 0; i--) if (this.fx[i].t >= this.fx[i].life) { const f = this.fx[i]; this.garden.remove(f.obj); f.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.fx.splice(i, 1); }
    const P = this.parts;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] >= P.max[i]) { P.pos[i * 3 + 1] = -100; continue; }
      P.life[i] += dt;
      P.vel[i * 3 + 1] -= 9 * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] = Math.max(0.05, P.pos[i * 3 + 1] + P.vel[i * 3 + 1] * dt); P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const sp of this.popPool) {
      if (!sp.visible) continue;
      sp.userData.t += dt;
      const u = sp.userData.t / 1.3;
      sp.position.set(sp.userData.x, 1.2 + u * 1.2, sp.userData.z);
      sp.material.opacity = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      if (u >= 1) sp.visible = false;
    }
    this.r.render(this.scene, camera || this.camera);
  }

  placeActor(o, p, v, t, live) {
    o.position.set(p.x - 12, 0, p.y - 9);
    const moving = Math.hypot(v.x, v.y) > 1e-4;
    if (moving) { const want = Math.atan2(v.x, v.y); let d = want - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += d * 0.25; }
    else if (!live) o.rotation.y = 0;
    const body = o.userData.body;
    const bob = Math.sin(t * (moving ? 14 : 4)) * (moving ? 0.04 : 0.025);
    body.position.y = bob + 0.02;
    const sq = moving ? 0.05 : 0;
    body.scale.set(1 + sq, 1 - sq, 1 + sq);
  }

  updateRope(pts, t) {
    const T = this.tmp;
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    const colAt = (u) => (u < 0.5 ? T.c.copy(T.cr).lerp(T.cw, u * 2) : T.c.copy(T.cw).lerp(T.cb, (u - 0.5) * 2));
    // 線分を長さ 0.6 単位以下の小片に分け、赤→白→青のグラデーションにする
    let k = 0, acc = 0, j = 0;
    for (let i = 0; i + 1 < pts.length && k < MAX_SEG; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const dx = p1.x - p0.x, dz = p1.y - p0.y, len = Math.hypot(dx, dz);
      if (len < 1e-5) continue;
      const n = Math.max(1, Math.ceil(len / 0.6));
      T.d.set(dx / len, 0, dz / len); T.q.setFromUnitVectors(T.up, T.d);
      for (let m = 0; m < n && k < MAX_SEG; m++) {
        const u0 = m / n, u1 = (m + 1) / n;
        T.p.set(p0.x + dx * (u0 + u1) / 2 - 12, ROPE_Y, p0.y + dz * (u0 + u1) / 2 - 9);
        T.s.set(1, len / n + 0.002, 1);
        T.m.compose(T.p, T.q, T.s);
        this.ropeSeg.setMatrixAt(k, T.m); this.ropeGlow.setMatrixAt(k, T.m);
        this.ropeSeg.setColorAt(k, colAt(total > 0 ? (acc + len * (u0 + u1) / 2) / total : 0.5));
        k++;
      }
      acc += len;
    }
    acc = 0;
    for (let i = 0; i < pts.length && j < MAX_SEG + 2; i++) {
      T.p.set(pts[i].x - 12, ROPE_Y, pts[i].y - 9); T.q.identity(); T.s.setScalar(1);
      T.m.compose(T.p, T.q, T.s); this.ropeJoint.setMatrixAt(j, T.m);
      this.ropeJoint.setColorAt(j, colAt(total > 0 ? acc / total : 0)); j++;
      if (i + 1 < pts.length) acc += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    this.ropeSeg.count = k; this.ropeGlow.count = k; this.ropeJoint.count = j;
    this.ropeSeg.instanceMatrix.needsUpdate = true; this.ropeJoint.instanceMatrix.needsUpdate = true; this.ropeGlow.instanceMatrix.needsUpdate = true;
    if (this.ropeSeg.instanceColor) this.ropeSeg.instanceColor.needsUpdate = true;
    if (this.ropeJoint.instanceColor) this.ropeJoint.instanceColor.needsUpdate = true;
    this.ropeGlow.material.opacity = 0.14 + 0.06 * Math.sin(t * 5);
  }
}

function centroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length }; }

let dotTex = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c); return dotTex;
}

function makeTextSprite() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  sp.scale.set(3.2, 1.6, 1); sp.renderOrder = 10;
  sp.userData = { c, tex, t: 0 };
  return sp;
}
function drawTextSprite(sp, text, sub, color = '#ffe27a') {
  const { c, tex } = sp.userData, g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 120px system-ui, sans-serif'; g.lineWidth = 16; g.strokeStyle = 'rgba(20,10,0,0.8)'; g.strokeText(text, 256, 100); g.fillStyle = color; g.fillText(text, 256, 100);
  if (sub) { g.font = '800 56px system-ui, sans-serif'; g.lineWidth = 10; g.strokeText(sub, 256, 200); g.fillStyle = '#fff'; g.fillText(sub, 256, 200); }
  tex.needsUpdate = true;
}
