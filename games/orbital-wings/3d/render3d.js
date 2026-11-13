// ORBITAL WINGS 3D — three.js の描画（通常画面と WebXR の両方）
// 座標: 戦場の箱（vol）の中心を原点に、ローカル x = ワールド x − カメラ − 16、y = y − 9、z = −（ゲームの z）（奥が −z）。
// 描画位置はゲームの当たり判定の位置そのもの（見た目と判定を一致させる）。
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH, SHIELD } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { fbm, hash1 } from '../shared/rng.js';
import { Batch, quatAlong, AXIS_Z, AXIS_X, KINDS, linR, linG, linB, hex } from './kit.js';
import { buildMaterials, spriteMaterial, shieldMaterial, exhaustMaterial, spiralMaterial, bubbleMaterial, SP } from './materials3d.js';
import { SpriteBatch, installFx } from './fx3d.js';
import { installChars } from './chars3d.js';
import { installBosses } from './bosses3d.js';
import { modelGeo } from './models.js';
import { XRSupport } from './xr.js';
import { install as installEnv } from './env3d.js';

const TAU = Math.PI * 2, HW = VIEW_W / 2, HH = VIEW_H / 2;
const D = DEPTH + 1.3;              // 地形の奥行き（戦場の外まで）
const lerp = (a, b, t) => a + (b - a) * t;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _c = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const CHUNK = 16, STEP = 0.5, NS = CHUNK / STEP;

export class Render3D {
  constructor() {
    this.threeVersion = THREE.REVISION;
    this.ft = []; this.pr = 1; this.lastNow = 0; this.bossBoom = null; this.flashA = 0; this.shakeA = 0; this.shakeT = 0;
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
    // 金属・石・生体の材質（模様・法線・粗さ・映り込みは materials3d.js で計算して作る）
    const { tex, M: PBR } = buildMaterials(this.renderer, clip);
    this.tex = tex; this.pbr = PBR;
    const std = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5, clippingPlanes: clip, ...o });
    this.mat = {
      body: PBR.metal,
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, clippingPlanes: clip }),
      add: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: clip }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, clippingPlanes: clip }),
      instStd: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.42, clippingPlanes: clip, envMap: tex.env, envMapIntensity: 0.9 }),
      instBasic: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, clippingPlanes: clip }),
      instAdd: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: clip }),
      instSmoke: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, clippingPlanes: clip }),
      shadow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, clippingPlanes: clip }),
      terrain: std({ metalness: 0.1, roughness: 0.85 }),
      far: new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip }),
      sprite: spriteMaterial(tex.sprites), shield: shieldMaterial(clip), exhaust: exhaustMaterial(clip), spiral: spiralMaterial(clip), bubble: bubbleMaterial(clip),
    };
    const v = this.vol, M = this.mat;
    // 噴射炎の形（原点が噴射口、−x へ長さ 1。uv.y は噴射口で 1）
    const exG = new THREE.LatheGeometry([[0.1, 1.0], [0.42, 0.62], [0.78, 0.26], [1.0, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 10); exG.rotateZ(Math.PI / 2);
    this.b = {
      sph: new Batch(new THREE.SphereGeometry(1, 14, 10), M.instStd, 300, v),
      box: new Batch(new THREE.BoxGeometry(1, 1, 1), M.instStd, 200, v),
      cyl: new Batch(new THREE.CylinderGeometry(1, 1, 1, 12), M.instStd, 200, v),
      core: new Batch(new THREE.SphereGeometry(1, 12, 8), M.instBasic, 200, v),
      ring: new Batch(new THREE.TorusGeometry(1, 0.17, 8, 24), M.instBasic, 80, v),
      beam: new Batch(new THREE.CylinderGeometry(1, 1, 1, 8), M.instBasic, 200, v),
      smoke: new Batch(new THREE.SphereGeometry(1, 10, 8), M.instSmoke, 200, v),
      shadow: new Batch(new THREE.CircleGeometry(1, 18), M.shadow, 100, v),
      glow: new Batch(new THREE.SphereGeometry(1, 12, 8), M.instAdd, 300, v),
      beamG: new Batch(new THREE.CylinderGeometry(1, 1, 1, 8), M.instAdd, 100, v),
      ringA: new Batch(new THREE.TorusGeometry(1, 0.08, 6, 28), M.instAdd, 100, v),
      // 追加: 脚・油圧の棒、破片、半透明の膜、噴射炎、光線の螺旋
      limb: new Batch(modelGeo('limb').metal, PBR.metal, 160, v),
      shard: new Batch(modelGeo('shard').metal, PBR.metal, 500, v),
      bubble: new Batch(new THREE.SphereGeometry(1, 20, 14), M.bubble, 160, v),
      exh: new Batch(exG, M.exhaust, 96, v),
      spiral: new Batch(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), M.spiral, 96, v),
    };
    // 透明物は不透明物の後に
    for (const k of ['smoke', 'shadow', 'glow', 'beamG', 'ringA', 'bubble', 'exh', 'spiral']) this.b[k].mesh.renderOrder = 2;
    this.b.bubble.mesh.renderOrder = 4;
    // 光の粒: 奥（煙・影）→ 手前（光）→ 最前面（敵弾。どの効果にも隠れない）
    this.spB = new SpriteBatch(M.sprite, 900, v, 3);
    this.sp = new SpriteBatch(M.sprite, 3000, v, 5);
    this.spT = new SpriteBatch(M.sprite, 1400, v, 7);
    // シールド（1 枚の球。六角格子はシェーダーで描く）
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), M.shield); this.shield.renderOrder = 6; this.shield.visible = false; v.add(this.shield);
    this.pools = new Map();
    this.models = new Map();      // モデル名 → まとめ描き（InstancedMesh）
    this.fxInit();
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
    this.envInit?.();                           // 環境の初期化（env3d.js）
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
    this.camBase = (this.camBase || new THREE.Vector3()).copy(this.camera.position);
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
    this.pn = 0; this.bossBoom = null;
    this.stoneTint = hex('#' + _c.set(pal.ground[1]).lerp(new THREE.Color('#ffffff'), 0.3).getHexString());   // 壊せる石材に掛ける面の色
    this.envSetStage?.(stage, game);            // 環境の面ごとの作り直し（env3d.js）
  }

  onEvent(ev, g, demo) {
    this.fxEvent(ev, g);
    if (!demo) this.xr.onGameEvent(ev);
  }

  // ---- モデルのまとめ描き（同じモデルは何体いても描画 1 回） ---------------------------------
  newModel(name, cap) {
    const geo = modelGeo(name), mi = { name, meshes: [], n: 0, cap: cap || MODEL_CAP[name] || 12, want: 0 };
    for (const k of KINDS) {
      if (!geo[k]) continue;
      const m = new THREE.InstancedMesh(geo[k], this.pbr[k], mi.cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mi.cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; m.visible = false;
      this.vol.add(m); mi.meshes.push(m);
    }
    this.models.set(name, mi);
    return mi;
  }
  // 置く（戦場のローカル座標）: 回転は x（自分の軸まわりのロール）→ y → z の順。flash は被弾の白い光（0..1）、tint は色の掛け算
  M3(name, x, y, z, rx, ry, rz, sx, sy, sz, flash = 0, tint = 0xffffff) {
    _e.set(rx, ry, rz, 'ZYX'); _q.setFromEuler(_e);
    this.MQ(name, x, y, z, _q, sx, sy, sz, flash, tint);
  }
  M(name, x, y, z, rz = 0, s = 1, flash = 0, tint = 0xffffff) {
    _q.setFromAxisAngle(AXIS_Z, rz);
    this.MQ(name, x, y, z, _q, s, s, s, flash, tint);
  }
  MQ(name, x, y, z, q, sx, sy, sz, flash = 0, tint = 0xffffff) {
    const mi = this.models.get(name) || this.newModel(name);
    mi.want++;
    if (mi.n >= mi.cap) return;
    _m.compose(_v.set(x, y, z), q, _v2.set(sx, sy, sz));
    const k = mi.n * 3, f = 1 + flash * 1.6, r = Math.min(linR(tint), 0.999) * f, g = linG(tint) * f, b = linB(tint) * f;
    for (const m of mi.meshes) { _m.toArray(m.instanceMatrix.array, mi.n * 16); const C = m.instanceColor.array; C[k] = r; C[k + 1] = g; C[k + 2] = b; }
    mi.n++;
  }
  endModels() {
    for (const mi of this.models.values()) {
      for (const m of mi.meshes) {
        m.count = mi.n; m.visible = mi.n > 0;
        if (!mi.n) continue;
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, mi.n * 16); m.instanceMatrix.needsUpdate = true;
        m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, mi.n * 3); m.instanceColor.needsUpdate = true;
      }
      if (mi.want > mi.cap) {   // 足りなければ次のフレームから枠を広げる
        for (const m of mi.meshes) { this.vol.remove(m); m.dispose(); }
        this.models.delete(mi.name); this.newModel(mi.name, Math.ceil(mi.want * 1.5));
      }
    }
  }
  // ワールド → ローカル
  X(x) { return x - this.cam - HW; }
  // 噴射炎（噴射口の位置、長さ、太さ、色、向き: 0 で −x へ伸びる）
  exh(x, y, z, len, rad, col, rot = 0, I = 1) { _q.setFromAxisAngle(AXIS_Z, rot); this.b.exh.put3(x, y, z, len, rad, rad, _q, col, I); }
  // 奥の壁に落とす影（奥行きの手がかり）
  wallShadow(x, y, w, h, a = 0.45) { this.spB.flat(SP.shadow, x, y, -DEPTH + 0.03, w, h, 0, 0x000000, 0, a); }
  // 1 秒あたり rate 回の確率で true（煙・火花の発生に使う。描画の間隔によらない）
  every(rate) { return Math.random() < rate * this.dt; }

  // ---- 1 フレーム ---------------------------------------------------------------
  render(g, alpha, now) {
    const dt = this.lastNow ? Math.min(0.1, now - this.lastNow) : 1 / 60; this.lastNow = now;
    this.autoQuality(dt);
    this.now = now; this.dt = dt;
    const xrOn = this.renderer.xr.isPresenting;
    if (xrOn !== this.xrMode) this.setXRMode(xrOn);
    this.xr.update(this.xrFrame, dt);
    this.updateClip();
    for (const k in this.b) this.b[k].begin();
    for (const mi of this.models.values()) { mi.n = 0; mi.want = 0; }
    this.sp.begin(); this.spB.begin(); this.spT.begin();
    this.shield.visible = false;
    const U = this.mat;
    U.shield.uniforms.uTime.value = U.exhaust.uniforms.uTime.value = U.spiral.uniforms.uTime.value = U.bubble.uniforms.uTime.value = now % 1000;
    if (g) {
      if (g.stage !== this.stage || this.terrainRef !== g.stage.terrain) this.setStage(g.stage, g);
      const cam = this.cam = g.camX - (g.scrollD || 0) * (1 - alpha);
      this.g = g; this.alpha = alpha;
      this.flashT = this.flashA * 0.5;            // 環境（env3d.js）が読む閃光の強さ
      this.drawTerrain(g);
      this.drawFar(cam);
      this.envUpdate?.(g, cam, now, dt);          // 環境の毎フレーム更新（env3d.js）
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
    // 画面の閃光（フェーズ移行・大爆発）: 空を一瞬明るく＋薄い白。揺れは通常画面だけ（VR では酔うので揺らさない）
    const fx = this.fxScale();
    if (this.flashA > 0 && g) this.sp.put(SP.glow, 0, 0, 0, 70, 44, 0, 0xfff4e0, this.flashA * 0.3 * fx);
    this.hemi.intensity = (this.hemiBase ?? 1.1) + this.flashA * 1.5 * fx;
    if (!xrOn && this.camBase) {
      const a = this.shakeT > 0 ? this.shakeA * Math.min(1, this.shakeT * 4) * fx : 0;
      this.camera.position.set(this.camBase.x + (a ? Math.sin(now * 97) * a : 0), this.camBase.y + (a ? Math.cos(now * 83) * a : 0), this.camBase.z);
    }
    for (const k in this.b) this.b[k].end();
    this.endModels();
    this.sp.end(); this.spB.end(); this.spT.end();
    this.xr.drawPanels(g, now);
    this.renderer.render(this.scene, this.camera);
  }
  // 演出の強さ（揺れ・閃光）。設定 fx（full/weak/off）に従い、画質「低」では半分
  fxScale() { const s = this.app.settings || {}; return (s.fx === 'off' ? 0 : s.fx === 'weak' ? 0.4 : 1) * (s.quality === 'low' ? 0.5 : 1); }
  // VR では法線マップを外して画素あたりの計算を軽くする（模様・粗さ・映り込みは残す）
  setXRMode(on) {
    this.xrMode = on;
    for (const k of ['metal', 'stone', 'flesh']) { const m = this.pbr[k]; m.normalMap = on ? null : this.tex[k].normal; m.needsUpdate = true; }
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
}
// モデルごとの同時に描ける数の初期値（足りなければ自動で広がる）
const MODEL_CAP = { brick0: 64, brick1: 32, brick2: 32, tentSeg: 96, cellCore: 64, pistonSeg: 48, crusherSeg: 16, rock0: 16, rock1: 16, stone0: 16, drone: 16, dart_line: 16, dart_wave: 16, ship: 2, optionCore: 4, optionRing: 8, capsule: 8 };
const _e = new THREE.Euler(), _m = new THREE.Matrix4();
installEnv(Render3D);
installFx(Render3D);
installChars(Render3D);
installBosses(Render3D);
