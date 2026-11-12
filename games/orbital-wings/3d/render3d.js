// ORBITAL WINGS 3D — three.js の描画（通常画面と WebXR の両方）
// 座標: 戦場の箱（vol）の中心を原点に、ローカル x = ワールド x − カメラ − 16、y = y − 9、z = −（ゲームの z）（奥が −z）。
// 描画位置はゲームの当たり判定の位置そのもの（見た目と判定を一致させる）。
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH, SHIELD } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { fbm, hash1 } from '../shared/rng.js';
import { Batch, quatAlong, AXIS_Z, AXIS_X } from './kit.js';
import { modelGeo } from './models.js';
import { XRSupport } from './xr.js';

const TAU = Math.PI * 2, HW = VIEW_W / 2, HH = VIEW_H / 2;
const D = DEPTH + 1.3;              // 地形の奥行き（戦場の外まで）
const lerp = (a, b, t) => a + (b - a) * t;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _c = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const CHUNK = 16, STEP = 0.5, NS = CHUNK / STEP;

export class Render3D {
  constructor() {
    this.threeVersion = THREE.REVISION;
    this.parts = []; this.flashT = 0; this.ft = []; this.pr = 1; this.lastNow = 0; this.bossBoom = null;
  }

  init(app) {
    this.app = app;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setClearColor(0x000000, 1);
    r.localClippingEnabled = true;
    r.xr.enabled = true;
    r.domElement.className = 'game-canvas';
    r.domElement.style.left = '0'; r.domElement.style.top = '0';
    app.root.prepend(r.domElement);
    r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); app.toast('描画が中断されました（復帰を待っています）', 4000); if (app.screen === 'play') app.pause(true); });
    r.domElement.addEventListener('webglcontextrestored', () => { app.toast('描画が復帰しました'); this.stageKey = null; });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
    this.rig = new THREE.Group(); this.scene.add(this.rig);
    this.vol = new THREE.Group(); this.rig.add(this.vol);
    this.clip = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
    this.buildCommon();
    this.xr = new XRSupport(this);
    this.addDepthGauge();
    this.applySettings(app.settings);
    const ro = new ResizeObserver(() => this.resize()); ro.observe(app.root);
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    setInterval(() => this.resize(), 1000);
    this.resize();
  }

  // ---- 材質・まとめ描き・背景 --------------------------------------------------
  buildCommon() {
    const clip = this.clip;
    const std = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5, clippingPlanes: clip, ...o });
    this.mat = {
      body: std(),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, clippingPlanes: clip }),
      add: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: clip }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, clippingPlanes: clip }),
      instStd: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.25, roughness: 0.55, clippingPlanes: clip }),
      instBasic: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, clippingPlanes: clip }),
      instAdd: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: clip }),
      instSmoke: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, clippingPlanes: clip }),
      shadow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, clippingPlanes: clip }),
      terrain: std({ metalness: 0.1, roughness: 0.85 }),
      far: new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip }),
    };
    const v = this.vol, M = this.mat;
    this.b = {
      sph: new Batch(new THREE.SphereGeometry(1, 14, 10), M.instStd, 700, v),
      box: new Batch(new THREE.BoxGeometry(1, 1, 1), M.instStd, 500, v),
      cyl: new Batch(new THREE.CylinderGeometry(1, 1, 1, 12), M.instStd, 300, v),
      core: new Batch(new THREE.SphereGeometry(1, 12, 8), M.instBasic, 700, v),
      ring: new Batch(new THREE.TorusGeometry(1, 0.17, 8, 24), M.instBasic, 160, v),
      beam: new Batch(new THREE.CylinderGeometry(1, 1, 1, 8), M.instBasic, 260, v),
      smoke: new Batch(new THREE.SphereGeometry(1, 10, 8), M.instSmoke, 400, v),
      shadow: new Batch(new THREE.CircleGeometry(1, 18), M.shadow, 400, v),
      glow: new Batch(new THREE.SphereGeometry(1, 12, 8), M.instAdd, 1200, v),
      beamG: new Batch(new THREE.CylinderGeometry(1, 1, 1, 8), M.instAdd, 260, v),
      ringA: new Batch(new THREE.TorusGeometry(1, 0.08, 6, 28), M.instAdd, 160, v),
    };
    // 透明物は不透明物の後に
    for (const k of ['smoke', 'shadow', 'glow', 'beamG', 'ringA']) this.b[k].mesh.renderOrder = 2;
    this.pools = new Map();
    // 光
    this.hemi = new THREE.HemisphereLight(0xbcd0ff, 0x302020, 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.0); this.sun.position.set(-6, 12, 14); this.scene.add(this.sun);
    // 空（大きな球の内側に縦のグラデーション）と星
    const skyG = new THREE.SphereGeometry(150, 32, 16);
    skyG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyG.attributes.position.count * 3), 3));
    this.sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false }));
    this.sky.renderOrder = -2; this.scene.add(this.sky);
    const n = 1800, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = hash1(i, 1) * 2 - 1, a = hash1(i, 2) * TAU, rr = Math.sqrt(1 - u * u);
      sp.set([Math.cos(a) * rr * 120, u * 120, Math.sin(a) * rr * 120], i * 3);
      const t = hash1(i, 3); _c.set(t > 0.85 ? '#ffc8b0' : t > 0.7 ? '#b8ccff' : '#ffffff').multiplyScalar(0.4 + hash1(i, 4) * 0.6);
      sc.set([_c.r, _c.g, _c.b], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    this.stars.renderOrder = -1; this.scene.add(this.stars);
    // 戦場の箱の枠（移動範囲）と奥の壁の格子
    const box = new THREE.BoxGeometry(VIEW_W, VIEW_H, DEPTH * 2);
    this.frame = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x6aa0ff, transparent: true, opacity: 0.35 }));
    v.add(this.frame);
    const gp = [];
    for (let x = -HW; x <= HW; x += 2) gp.push(x, -HH, -DEPTH, x, HH, -DEPTH);
    for (let y = -HH; y <= HH; y += 2) gp.push(-HW, y, -DEPTH, HW, y, -DEPTH);
    for (let z = -DEPTH; z <= DEPTH + 0.01; z += DEPTH / 2) gp.push(-HW, -HH, z, HW, -HH, z);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x4a70c0, transparent: true, opacity: 0.12, depthWrite: false }));
    this.grid.renderOrder = 1; v.add(this.grid);
    // 遠景の稜線（毎フレーム視差で更新）
    const FN = 140;
    this.farN = FN;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FN * 2 * 6 * 3), 3));
    fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FN * 2 * 6 * 3), 3));
    this.far = new THREE.Mesh(fg, this.mat.far); this.far.frustumCulled = false; v.add(this.far);
    // 地形の塊（16u ごと）
    this.chunks = new Map(); this.chunkFree = [];
    this.blockMeshes = [];
  }

  applySettings(s) {
    this.quality = s.quality || 'auto';
    const fixed = { high: 1, medium: 0.8, low: 0.6 }[this.quality];
    if (fixed) this.pr = fixed;
    this.xr?.applySettings(s);
    this.resize(true);
  }
  resize(force) {
    const r = this.app.root.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pr = dpr * this.pr;
    if (!force && this.w === w && this.h === h && this.prApplied === pr) return;
    this.w = w; this.h = h; this.prApplied = pr;
    if (this.renderer.xr.isPresenting) return;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    // 戦場（32×18 の箱）が収まるようにカメラの距離を決める。少し右上手前から見下ろして奥行きを見せる
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const dH = (HH + 1.6) / Math.tan(vf / 2), dW = (HW + 1.2) / (Math.tan(vf / 2) * this.camera.aspect);
    const dist = Math.max(dH, dW) + DEPTH;
    this.camera.position.set(2.2, 3.4, dist);
    this.camera.lookAt(0, -0.4, 0);
    this.camera.updateProjectionMatrix();
    // HUD（DOM）の範囲: 16:9 で画面に収まる箱
    let cw = w, ch = w * 9 / 16; if (ch > h) { ch = h; cw = h * 16 / 9; }
    const st = this.app.root.style;
    st.setProperty('--pw', cw + 'px'); st.setProperty('--ph', ch + 'px'); st.setProperty('--px', (w - cw) / 2 + 'px'); st.setProperty('--py', (h - ch) / 2 + 'px');
  }
  // 自動画質（通常画面）: 2 秒の窓で平均が 50fps を下回れば 0.85 倍（下限 0.6）、6 秒余裕が続けば戻す
  autoQuality(dt) {
    if (this.quality !== 'auto' || this.renderer.xr.isPresenting || !dt || dt > 0.25) return;
    this.ft.push(dt); if (this.ft.length > 120) this.ft.shift();
    this.qT = (this.qT || 0) + dt;
    if (this.qT < 2 || this.ft.length < 60) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length;
    if (avg > 1 / 50 && this.pr > 0.6) { this.pr = Math.max(0.6, this.pr * 0.85); this.qT = 0; this.ft = []; this.good = 0; this.resize(true); }
    else if (avg < 1 / 58) { this.good = (this.good || 0) + this.qT; this.qT = 0; if (this.good > 6 && this.pr < 1) { this.pr = Math.min(1, this.pr + 0.1); this.good = 0; this.resize(true); } }
    else { this.qT = 0; this.good = 0; }
  }
  debugText() {
    const r = this.renderer, info = r.info.render;
    const s = r.getDrawingBufferSize(_v2);
    return `three r${THREE.REVISION} draw ${info.calls} tri ${info.triangles} buf ${s.x}×${s.y} pr ${this.pr.toFixed(2)} ${this.xr.debugText()}`;
  }
  loop(cb) { this.renderer.setAnimationLoop((t, frame) => { this.xrFrame = frame; cb(t); }); }
  titleItems(app) { return this.xr.titleItems(app); }
  onPause(on) { this.xr.onPause?.(on); }

  addDepthGauge() {
    const el = document.createElement('div');
    el.className = 'depth-gauge';
    el.innerHTML = '<span class="dl">奥</span><div class="dt"><i></i></div><span class="dl">手前</span>';
    el.style.cssText = 'position:absolute;right:calc(var(--px) + 1.2%);top:calc(var(--py) + var(--ph) * 0.3);height:calc(var(--ph) * 0.36);width:2.2em;display:flex;flex-direction:column;align-items:center;gap:4px;font:12px var(--font);color:#9ad8ff;pointer-events:none;text-shadow:0 0 4px #000';
    el.querySelector('.dt').style.cssText = 'position:relative;flex:1;width:8px;border:1px solid rgba(120,180,255,.6);background:linear-gradient(#0a2a6a,#5ad8ff);border-radius:4px';
    el.querySelector('i').style.cssText = 'position:absolute;left:-7px;width:20px;height:6px;margin-top:-3px;background:#ffcf3a;border-radius:3px;box-shadow:0 0 6px #ffcf3a';
    this.app.root.appendChild(el);
    this.gauge = el; this.gaugeI = el.querySelector('i');
  }

  // ---- ステージ ----------------------------------------------------------------
  setStage(stage, game) {
    if (this.stageKey === stage.id && this.terrainRef === stage.terrain) return;
    this.stageKey = stage.id; this.terrainRef = stage.terrain; this.stage = stage;
    const pal = stage.pal;
    // 空の色
    const pos = this.sky.geometry.attributes.position, col = this.sky.geometry.attributes.color;
    const top = new THREE.Color(pal.sky[0]), mid = new THREE.Color(pal.sky[1]);
    for (let i = 0; i < pos.count; i++) { const k = Math.abs(pos.getY(i) / 150); _c.copy(mid).lerp(top, Math.min(1, k * 1.6)); col.setXYZ(i, _c.r, _c.g, _c.b); }
    col.needsUpdate = true;
    this.hemi.color.set(pal.edge).lerp(new THREE.Color('#ffffff'), 0.5); this.hemi.groundColor.set(pal.fog);
    this.frame.material.color.set(pal.edge).lerp(new THREE.Color('#6aa0ff'), 0.5);
    this.stars.material.opacity = 1;
    // 地形の塊を捨てて作り直す
    for (const m of this.chunks.values()) { this.vol.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
    for (const m of this.blockMeshes) { this.vol.remove(m); m.geometry.dispose(); }
    this.blockMeshes = [];
    const ground = new THREE.Color(pal.ground[0]), light = new THREE.Color(pal.ground[1]);
    for (const b of stage.terrain.blocks) {
      const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, (b.z0 !== undefined ? b.z1 - b.z0 : D * 2));
      const cnt = g.attributes.position.count, c = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) { _c.copy(ground).lerp(light, g.attributes.position.getY(i) > 0 ? 0.35 : 0); if (b.kind === 'metal') _c.lerp(new THREE.Color(pal.glow), 0.12); c.set([_c.r, _c.g, _c.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const m = new THREE.Mesh(g, this.mat.terrain); m.userData.b = b; this.vol.add(m); this.blockMeshes.push(m);
    }
    this.parts = []; this.bossBoom = null;
  }

  chunkMesh(k, terrain, tick) {
    let m = this.chunks.get(k);
    const dynamic = !!terrain.pulse;
    if (m && !dynamic) return m;
    if (!m) {
      const nv = NS * 10 * 6;   // 区間あたり 10 枚の四角形
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      m = new THREE.Mesh(g, this.mat.terrain); m.frustumCulled = false;
      this.vol.add(m); this.chunks.set(k, m);
      m.userData.k = k;
    }
    this.fillChunk(m, k * CHUNK, terrain, tick);
    return m;
  }
  fillChunk(m, x0, terrain, tick) {
    const pal = this.stage.pal;
    const P = m.geometry.attributes.position.array, C = m.geometry.attributes.color.array;
    const cG = new THREE.Color(pal.ground[0]), cL = new THREE.Color(pal.ground[1]), cD = new THREE.Color(pal.ground[2]), cE = new THREE.Color(pal.edge);
    let o = 0;
    const quad = (a, b, c, d, ca, cb) => {   // a b c d は時計回りでない順（a-b-c, a-c-d）。色は上辺 ca・下辺 cb
      const v = [a, b, c, a, c, d], cs = [ca, ca, cb, ca, cb, cb];
      for (let i = 0; i < 6; i++) { P[o * 3] = v[i][0]; P[o * 3 + 1] = v[i][1]; P[o * 3 + 2] = v[i][2]; C[o * 3] = cs[i].r; C[o * 3 + 1] = cs[i].g; C[o * 3 + 2] = cs[i].b; o++; }
    };
    const zero = (nq) => { for (let i = 0; i < nq * 6; i++) { P[o * 3] = P[o * 3 + 1] = P[o * 3 + 2] = 0; o++; } };
    const ca = new THREE.Color(), cb = new THREE.Color(), cc = new THREE.Color();
    for (let i = 0; i < NS; i++) {
      const xa = x0 + i * STEP, xb = xa + STEP, la = i * STEP, lb = la + STEP;
      const n1 = hash1(Math.round(xa * 2), this.stage.id) * 0.25;
      // 床
      const fa = terrain.floorAt(xa, tick), fb = terrain.floorAt(xb, tick);
      if (fa < -1 && fb < -1) zero(5);
      else {
        const ya = Math.max(fa, -3) - HH, yb = Math.max(fb, -3) - HH, bot = -HH - 3;
        ca.copy(cL).lerp(cG, 0.45 + n1); cb.copy(cG).lerp(cD, 0.3 + n1);
        quad([la, ya, -D], [la, ya, D - 0.3], [lb, yb, D - 0.3], [lb, yb, -D], cb, ca);           // 上面（奥 → 手前）
        quad([la, ya, D - 0.3], [la, ya, D], [lb, yb, D], [lb, yb, D - 0.3], cE, cE);             // 手前の縁
        cc.copy(cG).lerp(cD, 0.2 + n1);
        quad([la, ya, D], [la, ya - 0.9, D], [lb, yb - 0.9, D], [lb, yb, D], ca, cc);             // 手前の面
        quad([la, ya - 0.9, D], [la, ya - 3.2, D], [lb, yb - 3.2, D], [lb, yb - 0.9, D], cc, cD);
        quad([la, ya - 3.2, D], [la, bot, D], [lb, bot, D], [lb, yb - 3.2, D], cD, cD);
      }
      // 天井
      const ka = terrain.ceilAt(xa, tick), kb = terrain.ceilAt(xb, tick);
      if (ka > VIEW_H + 1 && kb > VIEW_H + 1) zero(5);
      else {
        const ya = Math.min(ka, VIEW_H + 3) - HH, yb = Math.min(kb, VIEW_H + 3) - HH, top = HH + 3;
        ca.copy(cL).lerp(cG, 0.6 + n1); cb.copy(cG).lerp(cD, 0.4 + n1);
        quad([la, ya, D - 0.3], [la, ya, -D], [lb, yb, -D], [lb, yb, D - 0.3], ca, cb);           // 下面
        quad([la, ya, D], [la, ya, D - 0.3], [lb, yb, D - 0.3], [lb, yb, D], cE, cE);
        cc.copy(cG).lerp(cD, 0.2 + n1);
        quad([la, ya + 0.9, D], [la, ya, D], [lb, yb, D], [lb, yb + 0.9, D], cc, ca);
        quad([la, ya + 3.2, D], [la, ya + 0.9, D], [lb, yb + 0.9, D], [lb, yb + 3.2, D], cD, cc);
        quad([la, top, D], [la, ya + 3.2, D], [lb, yb + 3.2, D], [lb, top, D], cD, cD);
      }
    }
    const g = m.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.computeVertexNormals();
  }

  // ---- 出来事（爆発など） --------------------------------------------------------
  onEvent(ev, g, demo) {
    switch (ev.t) {
      case 'explode': this.explode(ev.x, ev.y, ev.z || 0, ev.size, ev.kind); break;
      case 'spark': this.spark(ev.x, ev.y, ev.z || 0, ev.armor, ev.big); break;
      case 'bossdown': this.bossBoom = { t: 0, e: g.boss }; break;
      case 'vent': if (Math.random() < 0.25) this.parts.push({ k: 'smoke', x: ev.x + (Math.random() - 0.5), y: ev.y, z: (Math.random() - 0.5) * 4, vx: -0.3, vy: ev.up * (1 + Math.random()), vz: 0, life: 0, max: 1.6, s: 0.5 + Math.random() * 0.6, c: '#ff7a2a' }); break;
      case 'dust': for (let i = 0; i < 6; i++) this.parts.push({ k: 'smoke', x: ev.x + (Math.random() - 0.5) * 1.5, y: ev.y, z: (Math.random() - 0.5) * 3, vx: 0, vy: -1, vz: 0, life: 0, max: 0.8, s: 0.4, c: '#9a8a6a' }); break;
      case 'phase': this.flashT = 0.4; break;
    }
    if (!demo) this.xr.onGameEvent(ev);
  }
  explode(x, y, z, size = 's', kind) {
    const n = { s: 10, m: 18, l: 32, p: 24 }[size] || 10;
    const R = { s: 0.6, m: 1.2, l: 2.4, p: 1.0 }[size] || 0.6;
    const flesh = kind === 'flesh' || kind === 'cell';
    const hot = flesh ? ['#ffd0e0', '#ff4a7a', '#8a1030'] : ['#fff6d0', '#ffae3a', '#d8401a'];
    this.parts.push({ k: 'ring', x, y, z, life: 0, max: 0.35, s: R * 2.2, c: hot[0] });
    this.parts.push({ k: 'flash', x, y, z, life: 0, max: 0.12, s: R * 2.2, c: '#ffffff' });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, b = Math.acos(Math.random() * 2 - 1), sp = (0.6 + Math.random() * 2.2) * R * 2.4;
      this.parts.push({ k: 'fire', x, y, z, vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.sin(a) * Math.sin(b) * sp, vz: Math.cos(b) * sp * 0.6, life: -Math.random() * 0.12 * (size === 'l' ? 3 : 1), max: 0.45 + Math.random() * 0.35, s: R * (0.5 + Math.random() * 0.6), c: hot[1], c2: hot[2] });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = Math.random() * TAU, sp = 3 + Math.random() * 7;
      this.parts.push({ k: 'debris', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (Math.random() - 0.5) * 4, life: 0, max: 0.5 + Math.random() * 0.5, s: 0.1 + Math.random() * 0.14, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20, c: kind === 'stonehead' || kind === 'rock' || kind === 'brick' ? '#b8ae98' : '#c8ccd8' });
    }
    for (let i = 0; i < n / 3; i++) this.parts.push({ k: 'smoke', x: x + (Math.random() - 0.5) * R, y: y + (Math.random() - 0.5) * R, z: z + (Math.random() - 0.5) * R, vx: (Math.random() - 0.5), vy: 0.3 + Math.random() * 0.4, vz: 0, life: -0.1, max: 1.0 + Math.random() * 0.6, s: R * (0.6 + Math.random() * 0.5), c: '#40384a' });
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  }
  spark(x, y, z, armor, big) {
    const n = big ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.random() - 0.5) * 2.4, sp = 4 + Math.random() * 6;
      this.parts.push({ k: 'spark', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (Math.random() - 0.5) * 3, life: 0, max: 0.15 + Math.random() * 0.15, s: 0.06, c: armor ? '#bfe6ff' : '#fff0a0' });
    }
    if (big) this.parts.push({ k: 'flash', x, y, z, life: 0, max: 0.1, s: 0.8, c: '#ffd080' });
  }

  // ---- 物体の置き場（同じモデルを使い回す） ----------------------------------------
  obj(name) {
    let p = this.pools.get(name);
    if (!p) { p = { list: [], n: 0 }; this.pools.set(name, p); }
    if (p.n < p.list.length) { const o = p.list[p.n++]; o.visible = true; return o; }
    const geo = modelGeo(name), grp = new THREE.Group();
    if (geo.body) { const m = new THREE.Mesh(geo.body, this.mat.body); grp.add(m); grp.userData.body = m; }
    if (geo.glow) grp.add(new THREE.Mesh(geo.glow, this.mat.glow));
    if (geo.add) { const m = new THREE.Mesh(geo.add, this.mat.add); m.renderOrder = 2; grp.add(m); }
    this.vol.add(grp); p.list.push(grp); p.n++;
    return grp;
  }
  place(o, x, y, z, rz = 0, s = 1, flash = 0) {
    o.position.set(x - this.cam - HW, y - HH, -z);
    o.rotation.set(0, 0, rz);
    o.scale.setScalar(s);
    const b = o.userData.body; if (b) b.material = flash > 0.3 ? this.mat.flash : this.mat.body;
    return o;
  }
  // ワールド → ローカル
  X(x) { return x - this.cam - HW; }

  // ---- 1 フレーム ---------------------------------------------------------------
  render(g, alpha, now) {
    const dt = this.lastNow ? Math.min(0.1, now - this.lastNow) : 1 / 60; this.lastNow = now;
    this.autoQuality(dt);
    this.now = now; this.dt = dt;
    this.xr.update(this.xrFrame, dt);
    this.updateClip();
    for (const p of this.pools.values()) p.n = 0;
    for (const k in this.b) this.b[k].begin();
    if (g) {
      if (g.stage !== this.stage || this.terrainRef !== g.stage.terrain) this.setStage(g.stage, g);
      const cam = this.cam = g.camX - (g.scrollD || 0) * (1 - alpha);
      this.g = g; this.alpha = alpha;
      this.drawTerrain(g);
      this.drawFar(cam);
      for (const e of g.enemies) this.drawEnemy(e, g, alpha);
      for (const c of g.capsules) this.drawCapsule(c, alpha);
      this.drawPlayer(g, alpha);
      for (const s of g.shots) this.drawShot(s, alpha);
      for (const b of g.ebullets) this.drawBullet(b, alpha);
      this.drawParticles(dt);
      this.drawBossBoom(dt);
      this.stars.rotation.y = -cam * 0.0012;
      // 奥行きの目盛り（通常画面の DOM）
      const p = g.player;
      const k = (lerp(p.pz, p.z, alpha) + DEPTH) / (2 * DEPTH);
      if (this.gaugeK !== k) { this.gaugeK = k; this.gaugeI.style.top = `${(1 - k) * 100}%`; }
    }
    this.gauge.style.display = g && (this.app.screen === 'play' || this.app.screen === 'pause') && !this.renderer.xr.isPresenting ? 'flex' : 'none';
    for (const p of this.pools.values()) for (let i = p.n; i < p.list.length; i++) p.list[i].visible = false;
    for (const k in this.b) this.b[k].end();
    // 画面の閃光（フェーズ移行）: 空を一瞬明るく
    if (this.flashT > 0) { this.flashT -= dt; this.hemi.intensity = 1.1 + this.flashT * 5; } else this.hemi.intensity = 1.1;
    this.xr.drawPanels(g, now);
    this.renderer.render(this.scene, this.camera);
  }
  updateClip() {
    // 戦場の箱の左右・上下で切り落とす（箱の外に地形や敵がはみ出さない「窓の中のジオラマ」）
    this.vol.updateMatrixWorld(true);
    const mw = this.vol.matrixWorld;
    const set = (pl, nx, ny, px, py) => {
      _v.set(nx, ny, 0).transformDirection(mw);
      _v2.set(px, py, 0).applyMatrix4(mw);
      pl.setFromNormalAndCoplanarPoint(_v, _v2);
    };
    set(this.clip[0], 1, 0, -HW - 0.4, 0); set(this.clip[1], -1, 0, HW + 0.4, 0);
    set(this.clip[2], 0, 1, 0, -HH - 0.05); set(this.clip[3], 0, -1, 0, HH + 0.05);
  }

  drawTerrain(g) {
    const t = g.terrain, cam = this.cam;
    const k0 = Math.floor((cam - 2) / CHUNK), k1 = Math.floor((cam + VIEW_W + 2) / CHUNK);
    const keep = new Set();
    for (let k = k0; k <= k1; k++) { const m = this.chunkMesh(k, t, g.stageTick); m.position.set(k * CHUNK - cam - HW, 0, 0); m.visible = true; keep.add(k); }
    for (const [k, m] of this.chunks) if (!keep.has(k)) { if (k < k0 - 1 || k > k1 + 1) { this.vol.remove(m); m.geometry.dispose(); this.chunks.delete(k); } else m.visible = false; }
    for (const m of this.blockMeshes) { const b = m.userData.b; m.position.set((b.x0 + b.x1) / 2 - cam - HW, (b.y0 + b.y1) / 2 - HH, b.z0 !== undefined ? -(b.z0 + b.z1) / 2 : 0); m.visible = b.x1 > cam - 2 && b.x0 < cam + VIEW_W + 2; }
  }
  drawFar(cam) {
    const id = this.stage.id, pal = this.stage.pal, off = cam * 0.3, N = this.farN;
    const P = this.far.geometry.attributes.position.array, C = this.far.geometry.attributes.color.array;
    const cF = _c.set(pal.far); const cT = new THREE.Color(pal.far).lerp(new THREE.Color(pal.glow), 0.15);
    const Z = -DEPTH - 0.35, x0 = -HW - 2, w = (VIEW_W + 4) / N;
    let o = 0;
    const h = (wx, side) => {
      if (id === 1) return 2.5 + fbm(wx * 0.05, 101 + side) * 6 + Math.max(0, 4 - Math.abs(((wx % 60) + 60) % 60 - 30) * 0.4) * 1.2;
      if (id === 2 || id === 3) return 1.5 + fbm(wx * 0.04, 202 + side) * 3 + (hash1(Math.floor(wx / 7), id + side) > 0.7 ? 3 + hash1(Math.floor(wx / 7), 9) * 3 : 0);
      if (id === 4 || id === 7) return 2 + hash1(Math.floor(wx / 3), id + side * 5) * 6;
      return 1.5 + fbm(wx * 0.08, 303 + side) * 4;
    };
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < N; i++) {
        const la = x0 + i * w, lb = la + w;
        const ha = h(la + HW + off + 400, side) * (side ? 0.45 : 0.65), hb = h(lb + HW + off + 400, side) * (side ? 0.45 : 0.65);
        const base = side ? HH : -HH, ya = side ? HH - ha * 0.8 : -HH + ha, yb = side ? HH - hb * 0.8 : -HH + hb;
        const tri = [[la, base], [lb, base], [lb, yb], [la, base], [lb, yb], [la, ya]];
        for (let k = 0; k < 6; k++) {
          P[o * 3] = tri[k][0]; P[o * 3 + 1] = tri[k][1]; P[o * 3 + 2] = Z;
          const c = (k === 2 || k === 4 || k === 5) ? cT : cF;
          C[o * 3] = c.r; C[o * 3 + 1] = c.g; C[o * 3 + 2] = c.b; o++;
        }
      }
    }
    this.far.geometry.attributes.position.needsUpdate = true; this.far.geometry.attributes.color.needsUpdate = true;
    // 生体・細胞の面: 漂う大きな影
    if (pal.organic) for (let k = 0; k < 8; k++) { const wx = Math.floor(off / 8) * 8 + k * 8; const lx = wx - off - HW + ((k * 13) % 7); this.b.smoke.put(lx, (hash1(wx, 6) - 0.5) * 14, Z - 0.5, [1.5 + hash1(wx, 4) * 3, 1.5 + hash1(wx, 4) * 3, 0.2], pal.far); }
  }

  // ---- 自機・オプション・シールド ---------------------------------------------------
  drawPlayer(g, a) {
    const p = g.player, b = this.b, now = this.now;
    for (let i = 0; i < g.power.options; i++) {
      const o = g.optionPos(i), po = g.prevOpt?.[i] || o;
      const x = this.X(lerp(po.x, o.x, a)), y = lerp(po.y, o.y, a) - HH, z = -lerp(po.z, o.z, a);
      const t = now * 11 + i * 2.3, r = 0.36 + Math.sin(t) * 0.03;
      b.core.put(x, y, z, r * 0.5, '#fff8e0');
      b.glow.put(x, y, z, r * 1.25, '#ff9a30', 0, 0.9);
      b.glow.put(x, y, z, r * 2.3, '#ff3a10', 0, 0.45);
      b.shadow.put(x, y, -DEPTH + 0.02, 0.35, '#000000');
    }
    if (!p.alive) return;
    const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a), z = lerp(p.pz, p.z, a);
    this.tilt = lerp(this.tilt || 0, (p.vy || 0) * 0.28, 0.2);
    this.roll = lerp(this.roll || 0, (p.vz || 0) * 0.5, 0.15);
    const blink = p.invuln > 0 && p.enter <= 0;
    const o = this.obj('ship');
    this.place(o, x, y, z, this.tilt * 0.35);
    o.rotation.x = -this.roll;
    o.visible = !blink || Math.sin(now * 30) > -0.6;
    const lx = this.X(x), ly = y - HH, lz = -z;
    // 噴射炎（前進で長く）
    const fl = 0.55 + ((p.vx || 0) > 0 ? 0.35 : (p.vx || 0) < 0 ? -0.2 : 0) + Math.sin(now * 60) * 0.08 + (p.enter > 0 ? 0.4 : 0);
    for (const zz of [0.13, -0.13]) { b.glow.put(lx - 1.0 - fl / 2, ly, lz + zz, [fl / 2, 0.08, 0.08], '#5aa8ff', 0, 1); b.glow.put(lx - 1.0 - fl / 4, ly, lz + zz, [fl / 4, 0.045, 0.045], '#ffffff', 0, 1); }
    if (blink) b.ringA.put(lx, ly, lz, [1.3, 0.65, 1], '#7ff0ff', 0, 0.6 + 0.4 * Math.sin(now * 30));
    // 奥行きの手がかり: 奥の壁に影、そこまでの細い線と目印、床に投影
    b.shadow.put(lx, ly, -DEPTH + 0.02, [0.9, 0.35, 1], '#000000');
    b.ringA.put(lx, ly, -DEPTH + 0.03, 0.42, '#5ad8ff', 0, 0.7);
    const len = DEPTH + lz;
    if (len > 0.05) { _q.setFromAxisAngle(AXIS_X, Math.PI / 2); b.beamG.put(lx, ly, lz - len / 2, [0.025, len, 0.025], '#3a90ff', _q, 0.8); }
    if (g.power.shield > 0) {
      for (let i = 0; i < 5; i++) {
        const an = -0.9 + i * 0.36 + 0.16;
        const on = i < g.power.shield;
        b.core.put(lx + Math.cos(an) * SHIELD.radius, ly + Math.sin(an) * SHIELD.radius, lz, [0.06, 0.2, 0.55], on ? '#8ad8ff' : '#14304a', an);
        if (on) b.glow.put(lx + Math.cos(an) * SHIELD.radius, ly + Math.sin(an) * SHIELD.radius, lz, [0.14, 0.24, 0.6], '#4aa0ff', an, 0.5);
      }
    }
  }
  drawCapsule(c, a) {
    const x = lerp(c.px, c.x, a), y = lerp(c.py, c.y, a), z = lerp(c.pz, c.z, a), now = this.now;
    const o = this.obj('capsule');
    this.place(o, x, y, z, Math.sin(now * 2 + c.id) * 0.25);
    o.rotation.y = now * 1.5;
    this.b.glow.put(this.X(x), y - HH, -z, 1.1 + Math.sin(now * 7 + c.id) * 0.15, '#ff5020', 0, 0.35);
    this.b.shadow.put(this.X(x), y - HH, -DEPTH + 0.02, 0.5, '#000000');
  }

  // ---- 弾 --------------------------------------------------------------------
  drawShot(s, a) {
    const b = this.b;
    const x = this.X(lerp(s.px, s.x, a)), y = lerp(s.py, s.y, a) - HH, z = -lerp(s.pz, s.z, a);
    if (s.kind === 'laser') {
      const len = s.len;
      _q.setFromAxisAngle(AXIS_Z, -Math.PI / 2);
      b.beam.put(x - len / 2, y, z, [0.07, len, 0.07], '#ffffff', _q);
      b.beamG.put(x - len / 2, y, z, [0.2, len, 0.2], '#3ab0ff', _q, 0.9);
    } else if (s.kind === 'missile') {
      const ang = s.ground ? 0 : Math.atan2(s.vy, s.vx + 1e-4);
      _q.setFromAxisAngle(AXIS_Z, ang - Math.PI / 2);
      b.cyl.put(x, y, z, [0.1, 0.6, 0.1], '#e8ecf4', _q);
      b.glow.put(x - Math.cos(ang) * 0.5, y - Math.sin(ang) * 0.5, z, [0.25, 0.1, 0.1], '#ff9a3a', ang, 1);
    } else {
      const ang = Math.atan2(s.vy, s.vx);
      b.core.put(x, y, z, [0.38, 0.08, 0.08], '#fff8d0', ang);
      b.glow.put(x - 0.1, y, z, [0.6, 0.17, 0.17], '#ffd060', ang, 0.5);
    }
  }
  drawBullet(bl, a) {
    const b = this.b, now = this.now;
    const x = this.X(lerp(bl.px, bl.x, a)), y = lerp(bl.py, bl.y, a) - HH, z = -lerp(bl.pz, bl.z, a);
    const vx = bl.vx, vy = bl.vy, vz = -bl.vz, sp = Math.hypot(vx, vy, vz) || 1;
    b.shadow.put(x, y, -DEPTH + 0.02, bl.r * 1.1, '#000000');
    b.core.put(x, y, -DEPTH + 0.025, bl.r * 0.35, '#ff5a96');
    if (bl.kind === 'ring') {
      _q.setFromAxisAngle(AXIS_Z, now * 5 + bl.id);
      b.ring.put(x, y, z, [bl.r, bl.r * 0.8, bl.r], '#e8fbff', _q);
      b.ringA.put(x, y, z, bl.r * 1.15, '#40c8ff', now * 5, 0.8);
      return;
    }
    if (bl.kind === 'beam') {
      const len = bl.len || 2;
      quatAlong(vx, vy, vz, _q);
      const cx = x - vx / sp * len / 2, cy = y - vy / sp * len / 2, cz = z - vz / sp * len / 2;
      b.beam.put(cx, cy, cz, [0.11, len, 0.11], '#fff0f4', _q);
      b.beamG.put(cx, cy, cz, [0.34, len, 0.34], '#ff3a70', _q, 0.8);
      return;
    }
    if (bl.kind === 'homing') {
      quatAlong(vx, vy, vz, _q);
      b.sph.put(x, y, z, [0.18, 0.4, 0.18], '#ffcf6a', _q);
      b.glow.put(x - vx / sp * 0.4, y - vy / sp * 0.4, z - vz / sp * 0.4, 0.16, '#ff5a28', 0, 0.6 + 0.4 * Math.sin(now * 40));
      return;
    }
    // 通常の敵弾: 白い芯＋赤紫の光（速度の向きに伸びて軌跡になる）
    const r = bl.r;
    b.core.put(x, y, z, r * 0.7, '#ffffff');
    quatAlong(vx, vy, vz, _q);
    const tl = Math.min(1.2, sp * 6);
    b.glow.put(x - vx / sp * tl * 0.3, y - vy / sp * tl * 0.3, z - vz / sp * tl * 0.3, [r * 1.5, r * 1.6 + tl * 0.6, r * 1.5], '#ff3a8a', _q, 0.85);
  }

  drawParticles(dt) {
    const b = this.b;
    const keep = [];
    for (const q of this.parts) {
      q.life += dt;
      if (q.life >= q.max) continue;
      keep.push(q);
      if (q.life < 0) continue;
      const k = q.life / q.max;
      if (q.vx !== undefined) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += (q.vz || 0) * dt; const d = Math.pow(0.12, dt); q.vx *= d; q.vy *= d; if (q.vz) q.vz *= d; }
      const x = this.X(q.x), y = q.y - HH, z = -q.z;
      switch (q.k) {
        case 'fire': b.glow.put(x, y, z, q.s * (0.6 + k * 0.9), k < 0.3 ? '#fff6d0' : q.c, 0, (1 - k) * 0.9); break;
        case 'ring': b.ringA.put(x, y, z, Math.max(0.01, q.s * k), q.c, 0, 1 - k); break;
        case 'flash': b.glow.put(x, y, z, q.s * (0.5 + k * 0.5), '#ffffff', 0, (1 - k)); break;
        case 'debris': q.rot += q.vr * dt; q.vy -= 6 * dt; _q.setFromAxisAngle(_v.set(1, 1, 0.3).normalize(), q.rot); b.box.put(x, y, z, [q.s * 2, q.s, q.s], q.c, _q); break;
        case 'smoke': b.smoke.put(x, y, z, q.s * (0.6 + k), q.c); break;
        case 'spark': b.glow.put(x, y, z, [0.18, 0.04, 0.04], q.c, Math.atan2(q.vy, q.vx), 1 - k); break;
      }
    }
    this.parts = keep;
  }
  drawBossBoom(dt) {
    const bb = this.bossBoom; if (!bb) return;
    bb.t += dt;
    const e = bb.e;
    if (e && bb.t < 2.4 && Math.random() < 0.35) {
      const ps = e.parts?.length ? e.parts : [{ x: e.x, y: e.y, z: e.z }];
      const q = ps[(Math.random() * ps.length) | 0];
      this.explode(q.x + (Math.random() - 0.5) * 2, q.y + (Math.random() - 0.5) * 2, (q.z || 0) + (Math.random() - 0.5) * 2, Math.random() < 0.3 ? 'm' : 's');
    }
    if (bb.t > 2.4 && !bb.final) { bb.final = true; if (e) this.explode(e.x, e.y, e.z, 'l'); this.flashT = 0.5; }
    if (bb.t > 3) this.bossBoom = null;
  }

  // ---- 敵 --------------------------------------------------------------------
  drawEnemy(e, g, a) {
    if (e.dead && !e.boss) return;
    if (e.delay > 0 || (e.ghost && e.type !== 'popper' && e.type !== 'drone' && e.type !== 'vent')) return;
    if (e.type === 'vent') return;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a), z = lerp(e.pz, e.z, a);
    if (x < this.cam - 10 || x > this.cam + VIEW_W + 12) return;
    const b = this.b, f = e.flash || 0, now = this.now, pal = this.stage.pal;
    const lx = this.X(x), ly = y - HH, lz = -z;
    const ceil = e.anchor === 'c';
    if (!BOSS[e.type] && e.type !== 'membrane' && e.type !== 'tentacle') b.shadow.put(lx, ly, -DEPTH + 0.02, Math.min(1.6, e.r * 0.8), '#000000');
    const flashCol = (c) => (f > 0.3 ? '#ffffff' : c);
    switch (e.type) {
      case 'dart': { const o = this.place(this.obj(e.carrier ? 'dartRed' : 'dart'), x, y, z, e.ang + Math.PI, 1, f); o.rotation.x = Math.sin(now * 3 + e.id) * 0.35; break; }
      case 'wheel': this.place(this.obj(e.carrier ? 'wheelRed' : 'wheel'), x, y, z, e.spin || 0, 1, f); break;
      case 'turret': {
        const o = this.place(this.obj('turretBase'), x, y, z, 0, 1, f); if (ceil) o.rotation.x = Math.PI;
        this.place(this.obj('barrel'), x, y, z, e.aim, 1, f);
        break;
      }
      case 'walker': {
        const o = this.place(this.obj('walker'), x, y, z, 0, 1, f); o.rotation.y = e.vx < 0 ? 0 : Math.PI; if (ceil) o.rotation.x = Math.PI;
        const dir = ceil ? -1 : 1, ph = e.walk || 0, cr = (e.crouch > 0 ? 0.2 : 0) + (e.land > 0 ? e.land / 60 : 0);
        for (const [s, zz] of [[0, 0.22], [Math.PI, -0.22]]) {
          const k = Math.sin(ph + s), fx = lx + k * 0.4, fy = ly - dir * (0.78 - cr * 0.4);
          quatAlong(fx - lx, fy - ly, 0, _q);
          b.cyl.put((fx + lx) / 2, (fy + ly) / 2, lz + zz, [0.07, Math.hypot(fx - lx, fy - ly), 0.07], '#4a5468', _q);
        }
        break;
      }
      case 'hatch': {
        const o = this.place(this.obj(e.color === 'flesh' ? 'hatchFlesh' : 'hatch'), x, y, z, 0, 1, f); if (ceil) o.rotation.x = Math.PI;
        const dir = ceil ? -1 : 1, op = e.open || 0;
        for (const s of [-1, 1]) {
          _q.setFromAxisAngle(AXIS_Z, -s * op * 1.2 * dir);
          b.box.put(lx + s * (0.35 + Math.cos(op * 1.2) * 0) - s * Math.sin(op * 1.2) * 0, ly + dir * (0.42 + Math.sin(op * 1.2) * 0.35), lz, [0.7, 0.12, 1.3], e.color === 'flesh' ? '#c84a66' : '#8a96ae', _q);
        }
        if (op > 0.2) b.glow.put(lx, ly + dir * 0.45, lz, 0.5 * op, '#ff7a3c', 0, op * 0.7);
        break;
      }
      case 'drone': if (!e.ghost) { this.place(this.obj('drone'), x, y, z, e.ang, 1, f); b.glow.put(lx - Math.cos(e.ang) * 0.42, ly - Math.sin(e.ang) * 0.42, lz, 0.12, '#ff96ff', 0, 0.5 + 0.5 * Math.sin(now * 20)); } break;
      case 'rock': { const o = this.place(this.obj(e.color === 'stone' ? 'stone0' : (e.id % 2 ? 'rock0' : 'rock1')), x, y, z, e.spin, e.r, f); o.rotation.x = e.spin * 0.7; break; }
      case 'heavy': this.place(this.obj(e.carrier ? 'heavyRed' : 'heavy'), x, y, z, 0, 1, f); break;
      case 'brick': b.box.put(lx, ly, lz, e.r * 1.95, flashCol(pal.ground[0])); b.box.put(lx, ly, lz + e.r * 0.98, [e.r * 1.6, e.r * 1.6, 0.04], flashCol(pal.ground[1])); break;
      case 'popper': if (e.rise > 0.03) { const o = this.place(this.obj('popper'), x, y, z, 0, 1, f); if (ceil) o.rotation.x = Math.PI; } break;
      case 'stonehead': {
        const sh = e.shake ? Math.sin(now * 80) * 0.06 : 0;
        const o = this.place(this.obj('stonehead'), x + sh, y, z, 0, 1, f); if (ceil) o.rotation.x = Math.PI;
        const m = e.mouth || 0, dir = ceil ? -1 : 1;
        const j = this.place(this.obj('stonejaw'), x + sh, y - dir * (0.5 + m * 0.45), z, 0, 1, f); if (ceil) j.rotation.x = Math.PI;
        const mp = [x - 1.15, y - dir * 0.35];
        if (m > 0.05) { b.glow.put(this.X(mp[0]), mp[1] - HH - dir * m * 0.25, lz, [0.4, 0.15 + m * 0.2, 1.0], '#ff4ab0', 0, m); }
        break;
      }
      case 'pebble': this.place(this.obj('pebble'), x, y, z, e.spin || 0, 1, f); break;
      case 'piston': {
        const dir = ceil ? -1 : 1, len = e.len || 1, w = e.w * 2;
        const shk = e.warn ? Math.sin(now * 70) * 0.05 : 0;
        const ry = e.root - HH;
        b.box.put(lx + shk, ry + dir * (len / 2 - 0.4), lz, [w - 0.2, len + 0.8, 2.2], '#8a6e4a');
        b.box.put(lx + shk, ry + dir * (len - 0.28), lz, [w, 0.55, 2.3], '#ffcf2a');
        for (let k = -w / 2 + 0.25; k < w / 2; k += 0.5) b.box.put(lx + shk + k, ry + dir * (len - 0.28), lz + 1.16, [0.18, 0.56, 0.02], '#1a1410');
        if (e.warn) b.glow.put(lx, ry + dir * len, lz, [w * 0.6, 0.18, 1.2], '#ff5028', 0, 0.5 + 0.5 * Math.sin(now * 30));
        break;
      }
      case 'tentacle': {
        for (let i = 0; i < e.parts.length; i++) {
          const q = e.parts[i], r = 0.48 + 0.2 * (1 - i / e.parts.length);
          _c.set('#7a2a3a').lerp(new THREE.Color('#d86a7a'), (Math.sin(now * 4 - i * 0.6) + 1) * 0.25);
          b.sph.put(this.X(lerp(q.px, q.x, a)), lerp(q.py, q.y, a) - HH, -lerp(q.pz, q.z, a), r, _c.getHex());
        }
        b.sph.put(lx, ly, lz, 0.7, flashCol('#ff6a8a'));
        b.core.put(lx, ly, lz + 0.45, 0.32 + Math.sin(now * 6 + e.id) * 0.06, '#3a0a18');
        b.core.put(lx, ly, lz + 0.62, 0.11, '#ffe0a0');
        break;
      }
      case 'spore': { const r = 0.5 + Math.sin(now * 5 + e.id) * 0.04; b.smoke.put(lx, ly, lz, r, e.carrier ? '#ff6a3a' : '#ff8cc0'); b.core.put(lx + 0.08, ly + 0.05, lz, 0.18, e.carrier ? '#ffcf6a' : '#ff4a8a'); b.ringA.put(lx, ly, lz, r, flashCol(e.carrier ? '#ff5a2a' : '#ffb0d0'), 0, 0.6); break; }
      case 'membrane': {
        for (const c of e.cells) {
          if (c.hp <= 0) { const k = c.regen / (e.regenT ?? 300); b.ringA.put(lx, c.y - HH, -c.z, Math.max(0.01, 0.7 * k), '#a0ffdc', 0, 0.1 + k * 0.3); continue; }
          const cx = this.X(e.x + Math.sin(c.y * 1.7 + e.t * 0.05) * 0.12), r = 0.7 * (c.grow ?? 1);
          b.sph.put(cx, c.y - HH, -c.z, r, f > 0.3 ? '#ffffff' : c.hp < 2 ? '#b8f0a0' : '#5adca0');
          b.core.put(cx + 0.12, c.y - HH + 0.05, -c.z + r * 0.75, r * 0.3, '#1a6a4a');
        }
        break;
      }
      case 'blob': { const r = e.r * (1 + Math.sin(now * 4 + e.id) * 0.06); b.smoke.put(lx, ly, lz, r, '#78ffc8'); b.ringA.put(lx, ly, lz, r, flashCol('#c8ffe8'), now + e.id, 0.5); b.core.put(lx + r * 0.15, ly, lz, r * 0.35, '#ff9a3a'); break; }
      case 'shutter': b.box.put(lx, ly, lz, [e.r * 1.4, e.r * 1.96, e.r * 1.9], flashCol('#5a6680')); b.core.put(lx, ly, lz + e.r * 0.96, [0.12, e.r * 0.8, 0.04], '#50b4ff', 0, 0.3 + 0.7 * (1 - e.hp / e.maxHp)); break;
      case 'cannon': {
        const o = this.place(this.obj('cannonBase'), x, y, z, 0, 1, f); if (ceil) o.rotation.x = Math.PI;
        this.place(this.obj('cannonBarrel'), x, y, z, e.aim, 1, f);
        if (e.charge) b.glow.put(lx + Math.cos(e.aim) * 1.4, ly + Math.sin(e.aim) * 1.4, lz, 0.3, '#ffde6a', 0, 1);
        break;
      }
      case 'zapper': {
        for (const [yy, top] of [[e.y0, false], [e.y1, true]]) {
          const o = this.place(this.obj('zapperEmitter'), x, yy, z, 0, 1, f); if (top) o.rotation.x = Math.PI;
          b.core.put(lx, yy - HH, lz + 0.62, 0.3, e.warn || e.beam ? '#ff4a6a' : '#4ab0ff');
        }
        const mid = (e.y0 + e.y1) / 2 - HH, len = e.y1 - e.y0;
        if (e.warn) b.beamG.put(lx, mid, lz, [0.05, len, 0.05], '#ff5070', 0, 0.4 + 0.3 * Math.sin(now * 30));
        if (e.beam) { b.beam.put(lx, mid, lz, [0.14 + Math.sin(now * 50) * 0.03, len, 0.14], '#ffe8ee'); b.beamG.put(lx, mid, lz, [0.45, len, 0.45], '#ff3c6e', 0, 0.8); }
        break;
      }
      case 'slider': { const h = e.h ?? 3; b.box.put(lx, ly, lz, [2, h, 2.2], '#6a7898'); b.core.put(lx, ly, lz + 1.11, [0.3, h - 0.6, 0.02], '#ffcf6a'); break; }
      default: if (BOSS[e.type]) this.drawBoss(e, a, g);
    }
  }

  // ---- ボス --------------------------------------------------------------------
  drawBoss(e, a, g) {
    const b = this.b, now = this.now;
    let x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a); const z = lerp(e.pz, e.z, a);
    let dy = 0, dx = 0;
    if (e.dead) { const k = Math.min(1, (160 - (e.linger || 0)) / 160); dx = Math.sin(now * 60) * 0.1 * k; dy = -k * 2; }
    if (e.shake) dx += Math.sin(now * 70) * 0.08;
    x += dx; y += dy;
    const lx = this.X(x), ly = y - HH, lz = -z;
    const P = (q) => [this.X(lerp(q.px, q.x, a)) + dx, lerp(q.py, q.y, a) - HH + dy, -lerp(q.pz, q.z, a)];
    const fl = (q) => { q.flash = Math.max(0, (q.flash || 0) - 0.08); return q.flash > 0.3; };
    const parts = (name) => e.parts.filter((q) => q.name === name);
    switch (e.type) {
      case 'ignis': {
        this.place(this.obj('ignisHull'), x, y, z);
        for (const s of [1, -1]) for (const oy of [1.3, 2.6]) b.glow.put(lx - 1.4, ly + s * oy, lz + 1.0, 0.28 + (e.charge || 0) * 0.25, '#ff8cd0', 0, 0.2 + (e.charge || 0) * 0.9);
        for (const q of parts('plate')) if (q.alive) { const [px, py, pz] = P(q); b.box.put(px, py, pz, [0.36, 1.5, 1.6], fl(q) ? '#ffffff' : '#8a96b0'); }
        const c = parts('core')[0]; const [cx, cy, cz] = P(c); const open = c.isOpen(e);
        b.core.put(cx, cy, cz, 0.62, fl(c) ? '#ffffff' : '#3ab0ff');
        b.glow.put(cx, cy, cz, 0.95 + Math.sin(now * 8) * 0.06, open ? '#5ad8ff' : '#2a6a9a', 0, open ? 1 : 0.5);
        break;
      }
      case 'warden': {
        this.place(this.obj('wardenPillar'), x, y, z);
        const o = e.open;
        this.place(this.obj('wardenJawT'), x, y + 1.0 + o * 2.2, z);
        this.place(this.obj('wardenJawB'), x, y - 1.0 - o * 2.2, z);
        const eye = parts('eye')[0];
        if (o > 0.1) { b.core.put(lx, ly, lz + 1.0, 0.9 * o, fl(eye) ? '#ffffff' : '#58d2ff'); b.core.put(lx - 0.25, ly, lz + 1.7, 0.3 * o, '#ffffff'); b.glow.put(lx, ly, lz + 1.0, 1.3 * o, '#58d2ff', 0, 0.5); }
        break;
      }
      case 'colossus': {
        const m = e.mouth;
        this.place(this.obj('colossusHead'), x, y, z);
        this.place(this.obj('colossusJaw'), x, y - 0.6 - m * 0.9, z);
        b.glow.put(lx - 0.9, ly + 1.3, lz + 3.0, [0.6 + e.eyes * 0.2, 0.22 + e.eyes * 0.1, 0.2], e.eyes > 0.3 ? '#ff3a3a' : '#ff78c8', 0, 0.5 + e.eyes * 0.5);
        const mo = parts('mouth')[0];
        if (m > 0.05) { const [mx, my, mz] = P(mo); b.glow.put(mx, my, mz + 1.2, [0.7, 0.25 + m * 0.35, 1.4], fl(mo) ? '#ffffff' : '#ff4ab0', 0, 0.4 + m * 0.6); }
        break;
      }
      case 'crusher': {
        this.place(this.obj('crusherBody'), x, y, z);
        const c = parts('core')[0], s = e.shutter;
        b.core.put(lx - 0.4, ly, lz + 0.6, 0.75, fl(c) ? '#ffffff' : '#ff8a3a');
        b.core.put(lx - 0.4, ly, lz + 1.2, 0.3, '#fff0c0');
        b.box.put(lx - 0.4, ly + 0.52 + s * 0.8, lz + 1.1, [1.8, 0.8 - s * 0.3, 0.3], '#4a3a2a');
        b.box.put(lx - 0.4, ly - 0.52 - s * 0.8, lz + 1.1, [1.8, 0.8 - s * 0.3, 0.3], '#4a3a2a');
        if (e.warn) {
          const ax = this.X(g.camX + e.armX);
          b.beamG.put(ax, 0, 0, [1.1, VIEW_H, 1.1], '#ff5028', 0, 0.25 + 0.2 * Math.sin(now * 25));
          _q.setFromAxisAngle(AXIS_Z, Math.PI / 2); b.beam.put(ax, e.clampY - HH, DEPTH, [0.04, 2.8, 0.04], '#ffde6a', _q);
        }
        for (const arm of ['armT', 'armB']) {
          const qs = parts(arm), head = qs[0]; const [hx, hy] = P(head);
          const s2 = arm === 'armT' ? 1 : -1, H = 16;
          b.box.put(hx, hy - s2 * 1.05 + s2 * H / 2, 0, [2.1, H, DEPTH * 2 + 0.6], '#b08a54');
          b.box.put(hx, hy - s2 * 0.8, 0, [2.4, 0.5, DEPTH * 2 + 0.7], '#ffcf2a');
          for (let k = -1.0; k < 1.2; k += 0.4) b.box.put(hx + k, hy - s2 * 0.8, DEPTH + 0.36, [0.18, 0.52, 0.02], '#1a1410');
        }
        break;
      }
      case 'hydra': {
        for (const arm of e.arms) {
          for (const q of arm.segs) { if (!q.alive) continue; const [qx, qy, qz] = P(q); _c.set('#7a2a3a').lerp(new THREE.Color('#c85a6a'), 0.5 + 0.5 * Math.sin(now * 3 + qx)); b.sph.put(qx, qy, qz, q.r + 0.1, _c.getHex()); }
          if (arm.tip.alive) { const [tx, ty, tz] = P(arm.tip); b.sph.put(tx, ty, tz, 0.68, fl(arm.tip) ? '#ffffff' : '#ff6a8a'); b.core.put(tx - 0.3, ty, tz + 0.4, 0.3, '#2a0610'); }
        }
        const o = this.place(this.obj('hydraBrain'), x, y, z);
        o.scale.setScalar(1 + (e.pulse || 0) * 0.12 + Math.sin(now * 2) * 0.03);
        const eye = parts('eye')[0], op = e.eye;
        if (op > 0.1) { b.core.put(lx - 1.45, ly, lz + 1.6, [0.6 * op, 0.6 * op, 0.3], fl(eye) ? '#ffffff' : '#ffe24a'); b.core.put(lx - 1.5, ly, lz + 1.85, [0.14, 0.45 * op, 0.1], '#1a0408'); }
        break;
      }
      case 'nucleus': {
        for (const q of e.parts) if (q.free) {
          const [qx, qy, qz] = P(q);
          if (!q.alive) { b.ringA.put(qx, qy, qz, Math.max(0.01, 0.72 * Math.min(1, q.regen / 380)), '#a0ffdc', 0, 0.2); continue; }
          b.sph.put(qx, qy, qz, 0.74, fl(q) ? '#ffffff' : '#5adca0');
        }
        const gl = e.glow || 0;
        b.smoke.put(lx, ly, lz, 3.3, '#3affb0');
        b.glow.put(lx, ly, lz, 3.4, '#20a070', 0, 0.12 + gl * 0.3);
        const c = parts('core')[0];
        b.core.put(lx, ly, lz, 1.15 + Math.sin(now * 5) * 0.05, fl(c) ? '#ffffff' : '#ff9a3a');
        b.glow.put(lx, ly, lz, 1.6, '#ff8a2a', 0, 0.5);
        break;
      }
      case 'omega': {
        if (e.phase < 3) {
          this.place(this.obj('omegaWall'), x, y, z);
          for (const oy of [-3.9, 0, 3.9]) b.glow.put(lx + 0.3, ly + oy, lz, 0.45 + (e.charge || 0) * 0.25, '#ffc878', 0, 0.15 + (e.charge || 0));
        }
        for (const q of parts('gun')) if (q.alive) { const [qx, qy, qz] = P(q); _q.setFromAxisAngle(AXIS_Z, Math.PI / 2); b.cyl.put(qx - 0.7, qy, qz, [0.22, 1.4, 0.22], '#20283a', _q); b.sph.put(qx, qy, qz, 0.85, fl(q) ? '#ffffff' : '#8898ba'); b.core.put(qx - 0.5, qy, qz + 0.5, 0.28, '#4ab0ff'); }
        const core = parts('core')[0];
        if (core.alive) {
          const [cx, cy, cz] = P(core), ph2 = e.phase >= 2;
          b.core.put(cx, cy, cz, 0.8, fl(core) ? '#ffffff' : ph2 ? '#bfe0ff' : '#6a7a9a');
          b.glow.put(cx, cy, cz, 1.6, ph2 ? '#4ab0ff' : '#2a4a7a', 0, 0.8);
          if (!ph2) b.ring.put(cx, cy, cz, 1.0, '#8898ba');
        }
        for (const q of parts('bar')) if (q.vis) { const [qx, qy, qz] = P(q); b.sph.put(qx, qy, qz, 0.5, '#ffcf6a'); }
        const h = parts('heart')[0];
        if (h.vis && h.alive) {
          const [hx, hy, hz] = P(h), beat = 1 + Math.max(0, Math.sin(now * 7)) * 0.12;
          b.core.put(hx, hy, hz, 0.85 * beat, fl(h) ? '#ffffff' : '#ff3a6a');
          b.glow.put(hx, hy, hz, 1.6 * beat, '#ff3c6e', 0, 0.5);
          for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + now; b.core.put(hx + Math.cos(an) * 1.15, hy + Math.sin(an) * 1.15, hz, [0.25, 0.05, 0.05], '#ffd0dc', an); }
        }
        break;
      }
    }
    // ボスの影（奥の壁）
    b.shadow.put(lx, ly, -DEPTH + 0.02, 2.4, '#000000');
  }
}
