// 月影の魔城 — 3D / VR 描画（three.js r187・WebXR）
// 通常のブラウザ: 横から見る三人称の立体ジオラマ（カメラは緩やかに追従）。
// VR（Quest 3）: 目の前に「区画ごとの箱庭」を固定して置く。頭の動きはそのまま（追跡を上書きしない）、
//   キャラクターのジャンプや被弾をカメラに伝えない。区画の切り替えは 0.2 秒の暗転、その間ゲームは止まる。
// 論理座標（1u）と表示の大きさ（VR は 1u = 8.5cm × 表示スケール）は分けている。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T as TT } from '../shared/stages.js';
import { QUALITY, VR } from '../shared/config.js';
import { UI } from '../shared/ui.js';
import { THEMES3 } from './themes.js';
import { makeMaterials, MAT, buildKnight, poseKnight, buildEnemy, poseEnemy, buildBoss, poseBoss, buildWeapon, buildBone } from './models.js';

const VW = 24, VH = 13.5;
const TAU = Math.PI * 2;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

export class Renderer3D {
  constructor(host, app) {
    this.app = app; this.host = host; this.ui = new UI(); this.time = 0; this.quality = app.save.quality;
    const r = this.r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.xr.enabled = true; r.localClippingEnabled = true;
    r.domElement.id = 'gl';
    // 箱庭の切り抜き面（VR のときだけ近づける。通常は遠くに置いて何も切らない）。ステージ・キャラクターの材質だけが参照する
    this.clip = [0, 1, 2, 3].map(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6));
    host.appendChild(r.domElement);
    // HUD・メニューを描く 2D キャンバス（通常は画面に重ね、VR では板に貼る）
    this.uiCanvas = document.createElement('canvas'); this.uiCanvas.id = 'ui';
    host.appendChild(this.uiCanvas);
    this.uiCtx = this.uiCanvas.getContext('2d');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 400);
    this.scene.add(this.camera);
    // 光: 月光（影を落とす）・空と地面の環境光・弱い補助光
    this.hemi = new THREE.HemisphereLight(0x8aa0e0, 0x201820, 1.1); this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xcfe0ff, 2.2); this.moon.position.set(-8, 14, 12); this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048); this.moon.shadow.bias = -0.0008; this.moon.shadow.normalBias = 0.03;
    const sc = this.moon.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 60;
    this.scene.add(this.moon, this.moon.target);
    this.fill = new THREE.DirectionalLight(0xffc8a0, 0.35); this.fill.position.set(10, 4, 8); this.scene.add(this.fill);
    // 金属の映り込み用の環境マップ（空のグラデーションから作る。外部画像なし）
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(10, 32, 16);
    const cols = []; const pos = envGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = new THREE.Color().setHSL(0.62, 0.45, y > 0 ? 0.25 + y * 0.55 : 0.08); cols.push(c.r, c.g, c.b); }
    envGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); lamp.position.set(-5, 6, 5); envScene.add(lamp);
    this.env = pm.fromScene(envScene, 0.04).texture;
    makeMaterials(this.env);
    // ステージを入れる箱庭
    this.vrRoot = new THREE.Group(); this.scene.add(this.vrRoot);
    this.world = new THREE.Group(); this.vrRoot.add(this.world);
    this.stageGroup = new THREE.Group(); this.world.add(this.stageGroup);
    this.entGroup = new THREE.Group(); this.world.add(this.entGroup);
    this.knight = buildKnight(); this.entGroup.add(this.knight);
    this.models = new Map(); // ゲームの物体 → 3D モデル
    this.pools = {};
    this.parts = this.makeParticles();
    this.world.add(this.parts.points);
    // VR 用: HUD の板・暗転・コントローラー
    this.makeVR();
    this.titleScene();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.xrSupported = false;
    if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported('immersive-vr').then((ok) => { this.xrSupported = ok; if (this.app.screen === 'title') this.app.openTitle(); }).catch(() => {});
  }
  setQuality(q) { this.quality = q; this.resize(); }
  resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    const q = QUALITY[this.quality === 'auto' ? this.autoQ || 'ultra' : this.quality] || QUALITY.ultra;
    const dpr = window.devicePixelRatio || 1;
    let pr = dpr * q.scale; if (w * h * pr * pr > q.maxPixels) pr = Math.sqrt(q.maxPixels / (w * h));
    if (!this.r.xr.isPresenting) { this.r.setPixelRatio(pr); this.r.setSize(w, h, false); }
    this.r.domElement.style.width = this.uiCanvas.style.width = w + 'px'; this.r.domElement.style.height = this.uiCanvas.style.height = h + 'px';
    this.r.shadowMap.enabled = q.shadows; this.moon.castShadow = q.shadows;
    const us = Math.min(2, dpr); this.uiCanvas.width = Math.round(w * us); this.uiCanvas.height = Math.round(h * us); this.uiScale = us;
    this.camera.aspect = w / h;
    // 盤面 24u がちょうど収まる距離（横長でも縦長でも、16:9 の範囲が必ず見える）
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const needH = Math.max(VH * 0.86, (VW * 0.84) / this.camera.aspect); // 3D は少し寄る（横 20u）。進行方向の先は追従のずらしで見せる
    this.camDist = needH / 2 / Math.tan(vfov / 2);
    this.camera.updateProjectionMatrix();
    this.info = { css: `${w}×${h}`, dpr, internal: `${Math.round(w * pr)}×${Math.round(h * pr)}`, quality: this.quality === 'auto' ? `自動(${this.autoQ || 'ultra'})` : this.quality };
  }
  // ---------------------------------------------------------------- ステージの組み立て
  setStage(g) {
    if (this.def === g.def && this.built) return;
    this.def = g.def; this.built = true;
    for (const m of this.models.values()) this.entGroup.remove(m);
    this.models.clear();
    this.disposeGroup(this.stageGroup);
    const th = THEMES3[g.def.theme];
    this.th = th;
    this.scene.fog = new THREE.Fog(th.fog, 28, 90);
    this.scene.background = new THREE.Color(th.sky[0]);
    this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]);
    this.moon.color.set(th.moonLight);
    this.lightAnchors = [];
    this.buildTerrain(g);
    this.buildBackdrop(g);
    this.buildDeco(g);
    this.mergeStatic(this.stageGroup);
    this.applyClip(this.stageGroup); this.applyClip(this.knight); this.applyClip(this.parts.points);
    this.vrSection = null;
  }
  // 動かない飾りを「材質ごとに 1 つ」へまとめて描画の回数を減らす（Quest の負荷対策）
  mergeStatic(group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const byMat = new Map(), victims = [];
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic || Array.isArray(o.material) || o === this.sky || o === this.moonMesh) return;
      if (this.moverMeshes && this.moverMeshes.includes(o)) return;
      if (this.jetMeshes && this.jetMeshes.includes(o)) return;
      if (this.liquids && this.liquids.some((l) => l.m === o)) return;
      if (this.gate && (o.parent === this.gate)) return;
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const key = o.material;
      if (!byMat.has(key)) byMat.set(key, { geos: [], cast: false, recv: false });
      const e = byMat.get(key); e.geos.push(geo); e.cast ||= o.castShadow; e.recv ||= o.receiveShadow;
      victims.push(o);
    });
    for (const o of victims) o.parent.remove(o);
    for (const [mat, e] of byMat) {
      const merged = mergeGeometries(e.geos, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat); m.castShadow = e.cast; m.receiveShadow = e.recv; group.add(m);
    }
  }
  // 点光源は 3 つだけ用意し、画面の中心に近い光の場所（溶岩・松明）へ毎フレーム割り当てる
  updateLights(cx, cy) {
    if (!this.lights) { this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 6, 1.7); this.world.add(l); return l; }); }
    const list = (this.lightAnchors || []).slice().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    this.lights.forEach((l, i) => { const a = list[i]; if (!a || Math.hypot(a.x - cx, a.y - cy) > 20) { l.intensity = 0; return; } l.position.set(a.x, a.y, a.z); l.color.set(a.color); l.intensity = a.i * (0.9 + 0.1 * Math.sin(this.time * 9 + i)); l.distance = a.d; });
  }
  applyClip(obj) { obj.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) m.clippingPlanes = this.clip; }); }
  disposeGroup(grp) { for (const c of [...grp.children]) { grp.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } }
  stoneTexture(th, kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const r = rng(th.seed + (kind === 'top' ? 3 : 1));
    x.fillStyle = kind === 'top' ? th.top : th.rock[0]; x.fillRect(0, 0, 256, 256);
    if (th.brick && kind !== 'top') {
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 6;
      x.beginPath(); x.moveTo(0, 128); x.lineTo(256, 128); x.moveTo(128, 0); x.lineTo(128, 128); x.moveTo(40, 128); x.lineTo(40, 256); x.stroke();
    }
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + r() * 0.07})`; x.beginPath(); x.ellipse(r() * 256, r() * 256, 8 + r() * 30, 5 + r() * 16, r() * 3, 0, TAU); x.fill(); }
    if (kind === 'top') for (let i = 0; i < 90; i++) { x.fillStyle = r() < 0.5 ? 'rgba(20,40,30,0.5)' : 'rgba(120,160,130,0.35)'; x.fillRect(r() * 256, r() * 256, 3, 10); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  buildTerrain(g) {
    const def = g.def, th = this.th, W = def.W, H = def.H;
    const rockMat = new THREE.MeshStandardMaterial({ map: this.stoneTexture(th, 'side'), roughness: 0.95, color: 0xffffff });
    const topMat = new THREE.MeshStandardMaterial({ map: this.stoneTexture(th, 'top'), roughness: 1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: th.rock[1], roughness: 1 });
    // 箱の奥行き: 手前 +0.9 〜 奥 −1.7（キャラクターは z=0 の上を歩く）
    const box = new THREE.BoxGeometry(1, 1, 2.6); box.translate(0.5, 0.5, -0.4);
    const solids = [], tops = [], plats = [], ladders = [];
    const skip = new Set();
    for (const d of def.deco) if (d.type === 'grave') for (let k = 0; k < (d.h || 1); k++) skip.add((d.y + k) * W + d.x);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = def.tiles[y * W + x];
      if (t === TT.SOLID && !skip.has(y * W + x)) {
        const up = y + 1 < H ? def.tiles[(y + 1) * W + x] : 0;
        // 四方を固い地形に囲まれ、手前からしか見えない内側は浅い箱でよい（描画量を減らす）
        (up === TT.SOLID ? solids : tops).push([x, y]);
      } else if (t === TT.PLAT) plats.push([x, y]);
      else if (t === TT.LADDER) ladders.push([x, y]);
    }
    const inst = (geo, mat, list) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      const o = new THREE.Object3D();
      list.forEach(([x, y], i) => { o.position.set(x, y, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.count = list.length; m.receiveShadow = true; m.castShadow = true; m.frustumCulled = false;
      this.stageGroup.add(m); return m;
    };
    inst(box, [rockMat, rockMat, rockMat, darkMat, rockMat, darkMat], solids);
    inst(box, [rockMat, rockMat, topMat, darkMat, rockMat, darkMat], tops);
    const plat = new THREE.BoxGeometry(1, 0.3, 1.8); plat.translate(0.5, 0.85, -0.3);
    inst(plat, new THREE.MeshStandardMaterial({ color: th.plat, roughness: 0.85 }), plats);
    // はしご（キャラクターの少し奥）
    const lg = new THREE.Group();
    const rail = new THREE.BoxGeometry(0.1, 1, 0.1), rung = new THREE.BoxGeometry(0.72, 0.07, 0.07);
    const wood = MAT.wood;
    const rails = new THREE.InstancedMesh(rail, wood, ladders.length * 2 || 1), rungs = new THREE.InstancedMesh(rung, wood, ladders.length * 2 || 1);
    const o = new THREE.Object3D();
    ladders.forEach(([x, y], i) => {
      for (const k of [0, 1]) { o.position.set(x + 0.2 + k * 0.6, y + 0.5, -0.3); o.updateMatrix(); rails.setMatrixAt(i * 2 + k, o.matrix); o.position.set(x + 0.5, y + 0.25 + k * 0.5, -0.3); o.updateMatrix(); rungs.setMatrixAt(i * 2 + k, o.matrix); }
    });
    rails.count = rungs.count = ladders.length * 2; rails.castShadow = rungs.castShadow = true; rails.frustumCulled = rungs.frustumCulled = false;
    lg.add(rails, rungs); this.stageGroup.add(lg);
    // 水と溶岩（光る面。溶岩は自分で光るので照明を足さない）
    this.liquids = [];
    for (const d of def.deco) {
      if (d.type !== 'lava' && d.type !== 'water') continue;
      const lava = d.type === 'lava', surf = lava ? d.y : 2;
      const mat = lava ? new THREE.MeshStandardMaterial({ color: 0x7a1004, emissive: 0xff5a1a, emissiveIntensity: 1.6, roughness: 0.6 })
        : new THREE.MeshStandardMaterial({ color: 0x1a5a70, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85, envMap: this.env });
      const geo = new THREE.BoxGeometry(d.w, surf + 1, 2.6, Math.max(1, d.w * 2), 1, 4); geo.translate(d.w / 2, (surf + 1) / 2 - 1, -0.4);
      const m = new THREE.Mesh(geo, mat); m.position.x = d.x; m.receiveShadow = !lava; this.stageGroup.add(m);
      this.liquids.push({ m, lava, base: geo.attributes.position.array.slice(), surf });
      if (lava) for (let x = d.x + 2; x < d.x + d.w; x += 6) this.lightAnchors.push({ x, y: surf + 1.2, z: 1, color: 0xff6a20, i: 6, d: 7 });
    }
    // 炎の柱の口
    for (const j of def.jets) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.2, 10), MAT.blackIron); m.position.set(j.x + 0.5, j.y + 0.05, 0); this.stageGroup.add(m); }
  }
  buildBackdrop(g) {
    const def = g.def, th = this.th, W = def.W, H = def.H;
    // 空: 大きな球の内側にグラデーション
    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { c0: { value: new THREE.Color(th.sky[0]) }, c1: { value: new THREE.Color(th.sky[1]) }, c2: { value: new THREE.Color(th.sky[2]) } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 c0,c1,c2; varying vec3 vp; void main(){ float y = vp.y; vec3 c = y > 0.1 ? mix(c1, c0, smoothstep(0.1, 0.7, y)) : mix(c2, c1, smoothstep(-0.2, 0.1, y)); gl_FragColor = vec4(c,1.0); }',
    }));
    sky.renderOrder = -10; this.sky = sky;
    this.stageGroup.add(sky);
    // 箱庭の奥の幕（空のグラデーション）。VR では窓の中にだけ見える
    { const c = document.createElement('canvas'); c.width = 8; c.height = 256; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 256); th.sky.forEach((col, i) => gr.addColorStop(i / (th.sky.length - 1), col)); x.fillStyle = gr; x.fillRect(0, 0, 8, 256);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false })); this.backdrop.renderOrder = -8; this.stageGroup.add(this.backdrop); }
    if (th.moon) {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      const gr = x.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, th.moon); gr.addColorStop(0.45, th.moon); gr.addColorStop(0.47, 'rgba(200,220,255,0.35)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
      x.fillStyle = 'rgba(120,130,170,0.35)'; for (const [a, b, rr] of [[150, 110, 14], [100, 140, 10], [130, 160, 7]]) { x.beginPath(); x.arc(a, b, rr, 0, TAU); x.fill(); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const moon = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      moon.position.set(0, 30, -120); moon.renderOrder = -9; this.moonMesh = moon; this.stageGroup.add(moon);
    } else this.moonMesh = null;
    // 遠景（丘と魔城の影）: 奥 z=−48 に押し出した板
    const r = rng(def.id * 131 + 7);
    const farShape = new THREE.Shape(); const span = W + 120;
    farShape.moveTo(-60, -10);
    for (let i = 0; i <= 60; i++) farShape.lineTo(-60 + (i / 60) * span, (def.vertical ? 0 : 6) + Math.sin(i * 0.9 + def.id) * 3 + (i % 7 === 3 ? 3 : 0));
    farShape.lineTo(W + 60, -10); farShape.closePath();
    const farMat = new THREE.MeshBasicMaterial({ color: th.far, fog: true });
    const far = new THREE.Mesh(new THREE.ShapeGeometry(farShape), farMat); far.position.z = -48; this.stageGroup.add(far);
    if (!def.vertical && def.theme !== 'cave') {
      const castle = new THREE.Group();
      for (const [dx, w, h] of [[-5, 2.4, 10], [-2, 2, 14], [0, 3, 18], [2.6, 2, 12], [5, 2.4, 9]]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), farMat); t.position.set(dx, h / 2 + 6, 0); castle.add(t);
        const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.7, 4, 4), farMat); sp.position.set(dx, h + 8, 0); castle.add(sp);
      }
      castle.position.set(W * 0.75, 0, -60); this.stageGroup.add(castle);
    }
    // 中景（奥行き z=−14〜−22）: 枯れ木・十字架・家・石筍・柱など
    const midMat = new THREE.MeshStandardMaterial({ color: th.mid, roughness: 1 });
    const n = Math.floor((def.vertical ? H : W) / 5);
    for (let i = 0; i < n; i++) {
      const z = -14 - r() * 8;
      const x = def.vertical ? 2 + r() * (W - 4) : i * 5 + r() * 4, y = def.vertical ? i * 5 : (th.groundY ?? 3) - 0.5;
      const o = this.midProp(def.theme, midMat, r);
      if (o) { o.position.set(x, y, z); this.stageGroup.add(o); }
    }
  }
  midProp(theme, mat, r) {
    const g = new THREE.Group();
    if (theme === 'graveyard') {
      if (r() < 0.5) g.add(this.deadTree(mat, 3 + r() * 3, r));
      else { const c = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), mat); c.position.y = 0.7; g.add(c); const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.25), mat); b.position.y = 1.0; g.add(b); }
    } else if (theme === 'village') {
      const w = 3 + r() * 3, h = 3 + r() * 3; const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), mat); b.position.y = h / 2; g.add(b);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.75, 2, 4, 1), mat); roof.rotation.y = Math.PI / 4; roof.position.y = h + 1; roof.scale.z = 0.6; g.add(roof);
      if (r() < 0.6) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), new THREE.MeshBasicMaterial({ color: 0xffb060 })); win.position.set(0, h * 0.55, 1.51); g.add(win); }
    } else if (theme === 'cave') {
      const h = 2 + r() * 5; const s = new THREE.Mesh(new THREE.ConeGeometry(0.8 + r(), h, 6), mat); s.position.y = h / 2; g.add(s);
      const s2 = new THREE.Mesh(new THREE.ConeGeometry(0.6 + r() * 0.6, h * 0.8, 6), mat); s2.rotation.x = Math.PI; s2.position.y = 17 - h * 0.4; g.add(s2);
      if (r() < 0.4) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0x6ad8ff })); cr.position.set(0.8, 0.4, 0.5); g.add(cr); }
    } else if (theme === 'tower') {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 5, 8), mat); p.position.y = 2.5; g.add(p);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), new THREE.MeshBasicMaterial({ color: 0x3a4a90 })); win.position.set(2.5, 2.6, 0); g.add(win);
    } else if (theme === 'fortress') {
      const w = 3 + r() * 3, h = 4 + r() * 4; const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), mat); b.position.y = h / 2; g.add(b);
      for (let k = 0; k < w - 0.5; k += 1.2) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 3), mat); m.position.set(-w / 2 + 0.3 + k, h + 0.3, 0); g.add(m); }
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), new THREE.MeshBasicMaterial({ color: 0xff8030 })); f.position.set(0, h * 0.5, 1.51); g.add(f);
    } else if (theme === 'citadel') {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 14, 10), mat); p.position.y = 7; g.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.4), MAT.gold); cap.position.y = 14; g.add(cap);
    } else return null;
    return g;
  }
  deadTree(mat, h, r) {
    const g = new THREE.Group();
    const br = (parent, len, rad, depth) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 5), mat); m.position.y = len / 2; parent.add(m);
      if (depth <= 0) return;
      const n = 2 + (r() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) { const p = new THREE.Object3D(); p.position.y = len * (0.7 + r() * 0.3); p.rotation.z = (r() - 0.5) * 1.8; p.rotation.y = r() * TAU; parent.add(p); br(p, len * (0.55 + r() * 0.2), rad * 0.55, depth - 1); }
    };
    br(g, h * 0.45, h * 0.06, 3);
    return g;
  }
  buildDeco(g) {
    const def = g.def, r = rng(def.id * 17);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8698, roughness: 0.9, envMap: this.env, envMapIntensity: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x241e2a, roughness: 1 });
    this.gate = null;
    for (const d of def.deco) {
      const o = new THREE.Group(); o.position.set(d.x, d.y, 0);
      switch (d.type) {
        case 'grave': {
          const h = d.h || 1;
          if (d.v === 0) { const s = new THREE.Shape(); s.moveTo(0.08, 0); s.lineTo(0.08, h * 0.75); s.absarc(0.5, h * 0.75, 0.42, Math.PI, 0, true); s.lineTo(0.92, 0); s.closePath(); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), stoneMat); m.position.z = -0.15; o.add(m); }
          else if (d.v === 1) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, h + 0.35, 0.22), stoneMat); a.position.set(0.5, (h + 0.35) / 2, 0); const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.22), stoneMat); b.position.set(0.5, h * 0.8, 0); o.add(a, b); const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), stoneMat); base.position.set(0.5, 0.12, 0); o.add(base); }
          else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, h + 0.1, 0.35), stoneMat); m.position.set(0.5, (h + 0.1) / 2, 0); m.rotation.z = 0.06; o.add(m); }
          break;
        }
        case 'tree': { const t = this.deadTree(dark, 4 * (d.s || 1), rng(d.x * 31 + 5)); t.position.set(0, 0, -1.4); o.add(t); break; }
        case 'fence': for (let x = 0; x < d.w; x += 0.5) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), MAT.blackIron); p.position.set(x, 0.6, -1.2); o.add(p); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), MAT.blackIron); tip.position.set(x, 1.3, -1.2); o.add(tip); } { const bar = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.06, 0.06), MAT.blackIron); bar.position.set(d.w / 2, 0.85, -1.2); o.add(bar); } break;
        case 'crypt': { const m = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.4, 0.3, 2.9), stoneMat); m.position.set(d.w / 2, d.h + 0.1, -0.4); o.add(m); const cr = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.15), stoneMat); cr.position.set(d.w / 2, d.h + 0.8, -0.6); o.add(cr); const crb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.15), stoneMat); crb.position.set(d.w / 2, d.h + 1.0, -0.6); o.add(crb); break; }
        case 'house': {
          const back = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a2e34, roughness: 0.95 })); back.position.set(d.w / 2, d.h / 2, -1.8); o.add(back);
          const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, d.w * 0.72, 2.4, 4, 1), new THREE.MeshStandardMaterial({ color: 0x20141a, roughness: 1 })); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.5; roof.position.set(d.w / 2, d.h + 1.2, -1.2); o.add(roof);
          for (let i = 1; i < d.w - 1; i += 3) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshBasicMaterial({ color: 0xffb060 })); w.position.set(i + 0.4, 1.7, -1.64); o.add(w); }
          break;
        }
        case 'catacomb': {
          const back = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1620, roughness: 1 })); back.position.set(d.w / 2, d.h / 2, -1.6); o.add(back);
          for (let x = 1; x < d.w; x += 3) { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.bone); sk.position.set(x + 0.6, 1.75, -1.4); o.add(sk); }
          for (let x = 2; x < d.w; x += 9) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), MAT.ember); f.position.set(x, 3.3, -1.3); o.add(f); this.lightAnchors.push({ x: d.x + x, y: d.y + 3.3, z: -0.8, color: 0xff9a40, i: 2.5, d: 5 }); }
          break;
        }
        case 'gate': {
          const posts = [-0.35, 1.35].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 2.8), stoneMat); p.position.set(x, 3, -0.4); return p; });
          o.add(...posts); const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 2.8), stoneMat); lintel.position.set(0.5, 5.9, -0.4); o.add(lintel);
          const bars = new THREE.Group(); for (let x = -0.05; x < 1.1; x += 0.28) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.6, 0.08), MAT.blackIron); b.position.set(x, 2.8, 0.6); bars.add(b); } for (let y = 0.5; y < 5.6; y += 0.9) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), MAT.blackIron); b.position.set(0.5, y, 0.6); bars.add(b); }
          o.add(bars); this.gate = bars; this.gateK = 0;
          break;
        }
        case 'stalactites': for (let x = 0; x < d.w; x += 1.3) { const h = 0.5 + r() * 1.2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, h, 6), dark); c.rotation.x = Math.PI; c.position.set(x, -h / 2, -0.4 + (r() - 0.5)); o.add(c); } break;
        case 'battlement': case 'pillars': {
          for (let x = 0; x < d.w; x += 6) {
            if (d.type === 'battlement') { const w = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a1410, roughness: 1 })); w.position.set(x + 2, 3, -2.2); o.add(w); }
            else { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.8, envMap: this.env, envMapIntensity: 0.4 })); p.position.set(x + 1.6, 6, -2.4); o.add(p); }
          }
          break;
        }
        case 'well': { const ring = new THREE.Mesh(new THREE.TorusGeometry(d.w / 2 + 0.2, 0.2, 6, 16, Math.PI), stoneMat); ring.rotation.x = -Math.PI / 2; ring.position.set(d.w / 2, 0.1, -0.4); o.add(ring); break; }
        case 'rubble': for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + r() * 0.2), stoneMat); s.position.set(0.5 + (i % 3), 0.4 + Math.floor(i / 3) * 0.9, -0.3); o.add(s); } break;
        default: continue;
      }
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.stageGroup.add(o);
    }
    // 移動床
    this.moverMeshes = g.movers.map((m) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(m.w, 0.45, 1.6), new THREE.MeshStandardMaterial({ color: this.th.plat, roughness: 0.8 })); mm.geometry.translate(m.w / 2, -0.225, -0.2); mm.castShadow = mm.receiveShadow = true; this.stageGroup.add(mm); return mm; });
    // 炎の柱（光る円柱）
    this.jetMeshes = g.jets.map((j) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, j.h, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); m.geometry.translate(0, j.h / 2, 0); m.position.set(j.x + 0.5, j.y, 0); this.stageGroup.add(m); return m; });
  }
  titleScene() {
    // タイトル画面: 第 1 ステージの景色をゆっくり流す
    this.titleMode = true;
  }

  // ---------------------------------------------------------------- 毎フレーム
  render(g, alpha, dt) {
    this.time += dt;
    const t = this.time;
    if (!g) { this.renderTitle(dt); return; }
    if (!this.def || this.def !== g.def) this.setStage(g);
    const L = (o) => [o.px + (o.x - o.px) * alpha, o.py + (o.y - o.py) * alpha];
    // 移動床・炎・液体
    g.movers.forEach((m, i) => { const mm = this.moverMeshes[i]; if (mm) mm.position.set(m.pcx + (m.cx - m.pcx) * alpha, m.pcy + (m.cy - m.pcy) * alpha, 0); });
    g.jets.forEach((j, i) => { const m = this.jetMeshes[i]; if (!m) return; m.visible = j.on || j.warn; m.scale.set(j.on ? 1 + Math.sin(t * 30) * 0.1 : 0.3, j.on ? 1 : 0.15, j.on ? 1 + Math.cos(t * 27) * 0.1 : 0.3); m.material.opacity = j.on ? 0.85 : 0.5; });
    for (const lq of this.liquids) {
      const p = lq.m.geometry.attributes.position, b = lq.base;
      for (let i = 0; i < p.count; i++) { const y0 = b[i * 3 + 1]; if (y0 > lq.surf - 1.01 - 1e-3 + 0.99) p.array[i * 3 + 1] = y0 + Math.sin(b[i * 3] * 2.4 + t * (lq.lava ? 2 : 3)) * 0.05; }
      p.needsUpdate = true;
    }
    if (this.gate) { this.gateK += ((g.lockCam ? 1 : 0) - this.gateK) * 0.1; this.gate.position.y = (1 - this.gateK) * 5.4; }
    // 騎士
    const p = g.player, [px, py] = L(p);
    this.knight.position.set(px, py, 0);
    this.knight.rotation.y = p.state === 'climb' ? Math.PI / 2 + 0.0 : p.face > 0 ? -0.45 : Math.PI + 0.45;
    poseKnight(this.knight, p, t, g.weapon);
    this.knight.visible = !(p.inv > 0 && g.mode === 'play' && Math.floor(t * 20) % 2 === 0);
    // 敵・ボス・弾・アイテム（ゲームの物体ごとにモデルを 1 つ。消えた物体のモデルは片付ける）
    const seen = new Set();
    const sync = (obj, make, place) => { let m = this.models.get(obj); if (!m) { m = make(); this.applyClip(m); this.models.set(obj, m); this.entGroup.add(m); } seen.add(obj); place(m); };
    for (const e of g.enemies) sync(e, () => buildEnemy(e.type), (m) => {
      const [x, y] = L(e); m.position.set(x, y, 0); m.scale.set(1, 1, 1); m.visible = true;
      m.rotation.y = (e.face || 1) > 0 ? -0.3 : Math.PI + 0.3; poseEnemy(m, e, t);
    });
    if (g.boss) sync(g.boss, () => buildBoss(g.boss.type), (m) => {
      const b = g.boss, [x, y] = L(b); m.position.set(x, y, b.type === 'lord' ? -0.4 : 0); m.scale.set(1, 1, 1); m.rotation.set(0, (b.face || -1) > 0 ? -0.25 : Math.PI + 0.25, 0); poseBoss(m, b, t);
    });
    for (const s of g.shots) sync(s, () => buildWeapon(s.kind), (m) => {
      const [x, y] = L(s); m.position.set(x, y, 0.1);
      m.rotation.set(0, s.face > 0 ? 0 : Math.PI, s.kind === 'axe' || s.kind === 'torch' ? -s.t * 14 : 0);
    });
    for (const s of g.eshots) sync(s, () => this.eshotModel(s), (m) => {
      const [x, y] = L(s); m.position.set(x, y, 0.05);
      if (s.kind === 'bone' || s.kind === 'clod') m.rotation.z = s.t * 10;
      if (s.kind === 'feather') m.rotation.z = Math.atan2(s.vy, s.vx);
      if (s.kind === 'pillar') { m.children[0].visible = !s.active; m.children[1].visible = !!s.active; }
      if (s.kind === 'mark') m.scale.setScalar(0.8 + 0.2 * Math.sin(t * 20));
      if (s.kind === 'orb' || s.kind === 'fireball') m.scale.setScalar(1 + 0.15 * Math.sin(t * 30));
    });
    for (const it of g.items) sync(it, () => this.itemModel(it), (m) => { m.position.set(it.x, it.y + 0.15 + Math.sin(t * 3) * 0.06, 0); m.rotation.y = t * 2; });
    for (const f of g.burns) sync(f, () => this.burnModel(), (m) => { m.position.set(f.x, f.y, 0); const k = Math.min(1, f.t / 0.3); m.scale.set(1, (0.7 + 0.3 * Math.sin(t * 20)) * k, 1); });
    for (const [obj, m] of this.models) if (!seen.has(obj)) { this.entGroup.remove(m); this.models.delete(obj); }
    // 得点の表示は HUD 側。粒子
    this.updateParticles(dt);
    // カメラ
    const cx = g.pcam.x + (g.cam.x - g.pcam.x) * alpha, cy = g.pcam.y + (g.cam.y - g.pcam.y) * alpha;
    if (this.r.xr.isPresenting) this.updateVR(g, dt, px, py);
    else {
      const shake = g.fx.some((f) => f.kind === 'shake') ? 0.08 : 0;
      this.camera.position.set(cx + Math.sin(t * 70) * shake, cy + 1.6, this.camDist);
      this.camera.lookAt(cx, cy - 0.2, 0);
      this.vrRoot.position.set(0, 0, 0); this.vrRoot.scale.setScalar(1); this.vrRoot.quaternion.identity(); this.world.position.set(0, 0, 0);
      for (const pl of this.clip) pl.constant = 1e6;
    }
    // 影を落とす範囲をカメラに合わせて動かす
    const fx = this.r.xr.isPresenting && this.vrSection ? this.vrSection.x : cx, fy = this.r.xr.isPresenting && this.vrSection ? this.vrSection.y : cy;
    this.moon.position.set(fx - 8, fy + 14, 12); this.moon.target.position.set(fx, fy, 0);
    this.updateLights(fx, fy);
    const vrOn = this.r.xr.isPresenting && this.vrSection;
    const bx = vrOn ? this.vrSection.x : cx, by = vrOn ? this.vrSection.y : cy;
    if (this.sky) { this.sky.position.set(cx, cy, 0); if (this.moonMesh) this.moonMesh.position.set(bx + (vrOn ? 7 : 30), by + (vrOn ? 3 : 26), vrOn ? -40 : -110); if (this.moonMesh) this.moonMesh.scale.setScalar(vrOn ? 0.45 : 1); }
    if (this.backdrop) { this.backdrop.position.set(bx, by, vrOn ? -50 : -130); this.backdrop.scale.set(vrOn ? 200 : 600, vrOn ? 110 : 330, 1); }
    this.r.toneMappingExposure = this.r.xr.isPresenting ? 1.3 : 1.05;
    this.drawUI(g);
    this.r.render(this.scene, this.camera);
  }
  renderTitle(dt) {
    if (!this.def) {
      // タイトルの背景: 第 1 ステージを読み込んで、騎士なしでゆっくり流す
      import('../shared/core.js').then(({ createGame }) => { if (!this.def) { const g = createGame({ stage: 0, noEnemies: true }); this.titleG = g; this.setStage(g); } });
      this.drawUI(null); this.r.render(this.scene, this.camera); return;
    }
    const x = 14 + ((this.time * 1.2) % 150);
    this.knight.visible = false;
    for (const [obj, m] of this.models) { this.entGroup.remove(m); this.models.delete(obj); }
    if (!this.r.xr.isPresenting) { this.camera.position.set(x, 8.4, this.camDist * 0.9); this.camera.lookAt(x + 2, 7.5, 0); for (const pl of this.clip) pl.constant = 1e6; }
    else this.updateVR({ def: this.def, player: { x, y: 3, face: 1 }, cam: { x, y: 6.75 }, lockCam: false, mode: 'title' }, dt, x, 3);
    if (this.sky) this.sky.position.set(x, 7, 0);
    this.drawUI(null);
    this.r.render(this.scene, this.camera);
  }
  eshotModel(s) {
    const g = new THREE.Group(); const k = s.kind;
    const glow = (col, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: col })); const h = new THREE.Mesh(new THREE.SphereGeometry(r * 2.1, 12, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(m, h); };
    if (k === 'bone') g.add(buildBone());
    else if (k === 'orb') glow(0xc070ff, 0.22);
    else if (k === 'fireball') glow(0xff8030, s.r || 0.25);
    else if (k === 'water') glow(0x70c8ff, 0.24);
    else if (k === 'feather') { const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 4), MAT.bronze); f.rotation.z = -Math.PI / 2; g.add(f); }
    else if (k === 'clod') { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42), MAT.leather); g.add(c); }
    else if (k === 'wave') { for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, s.box.h * (0.7 + (i % 2) * 0.3), 5), s.fire ? new THREE.MeshBasicMaterial({ color: 0xff8030, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }) : MAT.leather); c.position.set(-s.box.w / 2 + 0.1 + i * s.box.w / 4, (s.box.h * (0.7 + (i % 2) * 0.3)) / 2, 0); g.add(c); } }
    else if (k === 'mark') { const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff5a3c })); r.rotation.x = Math.PI / 2; r.position.y = 0.05; g.add(r); }
    else if (k === 'pillar') {
      const warn = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), new THREE.MeshBasicMaterial({ color: 0xc8a0ff, transparent: true, opacity: 0.18, depthWrite: false })); warn.position.y = 6;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 10), new THREE.MeshBasicMaterial({ color: 0xf0e8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })); bolt.position.y = 6;
      g.add(warn, bolt);
    } else if (k === 'beam') { const b = new THREE.Mesh(new THREE.BoxGeometry(s.box.w, s.box.h, 0.4), new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })); b.position.y = s.box.h / 2; g.add(b); }
    else glow(0xff6050, 0.22);
    return g;
  }
  itemModel(it) {
    const g = new THREE.Group();
    if (it.kind === 'weapon') { const w = buildWeapon(it.weapon); w.position.y = 0.45; w.rotation.z = 0.6; g.add(w); const h = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd880, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); h.position.y = 0.45; g.add(h); }
    else if (it.kind === 'treasure') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.36, 0.45), MAT.wood); b.position.y = 0.18; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.64, 10, 1, false, 0, Math.PI), MAT.gold); l.rotation.z = Math.PI / 2; l.position.y = 0.36; l.scale.z = 1.0; g.add(b, l); }
    else if (it.kind === 'armor') { const a = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.22, 0.05], [0.28, 0.3], [0.24, 0.55], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 14), MAT.steel); a.scale.z = 0.7; a.position.y = 0.15; g.add(a); }
    return g;
  }
  burnModel() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffa040 : 0xffe080, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); c.position.set((i - 2) * 0.3, 0.55, (i % 2) * 0.2 - 0.1); g.add(c); }
    return g;
  }
  // ---------------------------------------------------------------- 粒子（点。VR でも左右の目で同じに見える）
  makeParticles() {
    const N = 600, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat); points.frustumCulled = false;
    return { points, list: [], N };
  }
  onEvents(evs, g) {
    const add = (x, y, n, c, sp, grav) => { for (let i = 0; i < n && this.parts.list.length < this.parts.N; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); this.parts.list.push({ x, y, z: (Math.random() - 0.5) * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v + grav * 0.15, vz: (Math.random() - 0.5) * 2, t: 0, life: 0.5 + Math.random() * 0.5, c: new THREE.Color(c[i % c.length]), grav }); } };
    for (const e of evs) {
      if (e.type === 'enemyDie') add(e.x, e.y, 24, ['#d8d0ff', '#ffe9a0', '#a090c0'], 5, 2);
      else if (e.type === 'enemyHit' || e.type === 'bossHit') add(e.x ?? g.boss.x, e.y ?? g.boss.y + 1, 8, ['#fff6d0', '#ffcf6a'], 6, 6);
      else if (e.type === 'armorBreak') add(e.x, e.y, 30, ['#eef4ff', '#9fb2c8'], 8, 18);
      else if (e.type === 'bossDie') add(e.x, e.y, 120, ['#fff6d0', '#ff9a40', '#ff4020'], 10, 3);
      else if (e.type === 'ghoulEmerge') add(e.x, e.y + 0.1, 14, ['#8a6a48', '#6a5238'], 4, 18);
      else if (e.type === 'splash') add(e.x, e.y, 20, ['#cfefff', '#7ac8ff'], 6, 18);
      else if (e.type === 'burn' || e.type === 'jet') add(e.x + 0.5, e.y + 0.3, 10, ['#ffcf6a', '#ff6a20'], 3, -2);
    }
  }
  updateParticles(dt) {
    const L = this.parts.list, pos = this.parts.points.geometry.attributes.position, col = this.parts.points.geometry.attributes.color;
    let n = 0;
    for (const q of L) { q.t += dt; q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; }
    this.parts.list = L.filter((q) => q.t < q.life);
    for (const q of this.parts.list) { const k = 1 - q.t / q.life; pos.array[n * 3] = q.x; pos.array[n * 3 + 1] = q.y; pos.array[n * 3 + 2] = q.z; col.array[n * 3] = q.c.r * k; col.array[n * 3 + 1] = q.c.g * k; col.array[n * 3 + 2] = q.c.b * k; n++; }
    this.parts.points.geometry.setDrawRange(0, n); pos.needsUpdate = true; col.needsUpdate = true;
  }
  // ---------------------------------------------------------------- HUD・メニュー
  drawUI(g) {
    const c = this.uiCanvas, ctx = this.uiCtx, vr = this.r.xr.isPresenting;
    if (vr) {
      // VR: 板に貼る絵は 15〜30Hz で更新（毎フレームの転送を避ける）
      this.uiAcc = (this.uiAcc || 0) + 1;
      const fast = !!this.app.menu && this.app.screen !== 'play';
      if (this.uiAcc % (fast ? 3 : 5) !== 0) return;
      const tc = this.vr.uiTexCanvas, tx = tc.getContext('2d');
      tx.clearRect(0, 0, tc.width, tc.height);
      this.ui.draw(tx, this.app, { x: 0, y: 0, w: tc.width, h: tc.height }, {});
      this.vr.uiTex.needsUpdate = true;
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    if (!g && this.app.screen !== 'title') { /* なし */ }
    // 16:9 の範囲に HUD を描く
    let fw = c.width, fh = (c.width * 9) / 16; if (fh > c.height) { fh = c.height; fw = (c.height * 16) / 9; }
    const rect = this.app.screen === 'play' || this.app.screen === 'paused' || this.app.screen === 'gameover' ? { x: (c.width - fw) / 2, y: (c.height - fh) / 2, w: fw, h: fh } : { x: 0, y: 0, w: c.width, h: c.height };
    if (this.app.screen === 'title' || this.app.screen === 'settings' || this.app.screen === 'howto') { ctx.fillStyle = 'rgba(4,6,16,0.35)'; ctx.fillRect(0, 0, c.width, c.height); }
    this.ui.draw(ctx, this.app, rect, { reserveBottom: this.reserveBottom || 0, debugText: this.debugText(g) });
  }
  debugText(g) {
    if (!this.app.debug) return '';
    const ri = this.r.info;
    return `FPS ${(this.fps || 0).toFixed(0)}  描画 ${ri.render.calls} 回 ${ri.render.triangles} 三角形  ${this.info.css} dpr ${this.info.dpr} → ${this.info.internal} ${this.info.quality}` + (g ? `\n敵 ${g.enemies.length} 弾 ${g.eshots.length} 粒子 ${this.parts.list.length}` : '') + (this.r.xr.isPresenting ? `\nVR 区画 ${this.vrSection && this.vrSection.i}` : '');
  }

  // ---------------------------------------------------------------- VR
  makeVR() {
    const vr = this.vr = {};
    // HUD・メニューの板（盤面のすぐ手前。奥行きテストなしで地形に隠れない）
    vr.uiTexCanvas = document.createElement('canvas'); vr.uiTexCanvas.width = 2048; vr.uiTexCanvas.height = 1152;
    vr.uiTex = new THREE.CanvasTexture(vr.uiTexCanvas); vr.uiTex.colorSpace = THREE.SRGBColorSpace; vr.uiTex.anisotropy = 8; vr.uiTex.generateMipmaps = true; vr.uiTex.minFilter = THREE.LinearMipmapLinearFilter;
    vr.uiPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 9 / 16), new THREE.MeshBasicMaterial({ map: vr.uiTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    vr.uiPlane.renderOrder = 100; vr.uiPlane.visible = false; this.vrRoot.add(vr.uiPlane);
    // 箱庭の台座と額縁
    vr.frame = new THREE.Group(); vr.frame.visible = false; this.vrRoot.add(vr.frame);
    // 暗転（頭に付ける小さな球）
    vr.fade = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
    vr.fade.renderOrder = 200; vr.fade.visible = false; this.camera.add(vr.fade);
    vr.fadeK = 0; vr.fading = null;
    // コントローラー（簡易な形とレーザー。外部の型データは読み込まない）
    vr.ctrl = [0, 1].map((i) => {
      const c = this.r.xr.getController(i);
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1, 6), new THREE.MeshBasicMaterial({ color: 0xf3c86a, transparent: true, opacity: 0.8 }));
      ray.geometry.translate(0, -0.5, 0); ray.rotation.x = Math.PI / 2; ray.visible = false; c.add(ray);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.visible = false; this.scene.add(dot);
      c.addEventListener('connected', (e) => { c.userData.src = e.data; c.userData.hand = e.data.handedness; });
      c.addEventListener('disconnected', () => { c.userData.src = null; });
      c.addEventListener('selectstart', () => this.vrSelect(c));
      this.scene.add(c);
      const grip = this.r.xr.getControllerGrip(i);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.08, 4, 8), new THREE.MeshStandardMaterial({ color: 0x30344a, roughness: 0.6 })); body.rotation.x = Math.PI / 2; grip.add(body); this.scene.add(grip);
      return { c, ray, dot };
    });
    this.r.xr.addEventListener('sessionstart', () => this.onSessionStart());
    this.r.xr.addEventListener('sessionend', () => this.onSessionEnd());
  }
  async enterVR() {
    if (!navigator.xr) { this.app.say('このブラウザは WebXR に対応していません'); return; }
    const vq = this.app.save.vr.quality;
    const prof = { quality: { fb: 1.3, fov: 0.3, hz: 90 }, balanced: { fb: 1.1, fov: 0.5, hz: 90 }, stable: { fb: 0.9, fov: 0.8, hz: 72 } }[vq] || { fb: 1.1, fov: 0.5, hz: 90 };
    this.vrProfile = prof;
    try {
      this.app.unlock();
      this.r.xr.setFramebufferScaleFactor(prof.fb);
      this.r.xr.setReferenceSpaceType('local-floor');
      const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] });
      await this.r.xr.setSession(session);
    } catch (err) { this.app.say('VR を開始できませんでした: ' + (err && err.message || err), 4); }
  }
  onSessionStart() {
    const s = this.r.xr.getSession(), prof = this.vrProfile || { fov: 0.5, hz: 90 };
    try { this.r.xr.setFoveation(prof.fov); } catch (e) { /* 対応なし */ }
    this.vrHz = null;
    if (s.supportedFrameRates && s.updateTargetFrameRate) {
      const rates = Array.from(s.supportedFrameRates); const want = rates.includes(prof.hz) ? prof.hz : rates.includes(72) ? 72 : rates[0];
      s.updateTargetFrameRate(want).then(() => { this.vrHz = want; }).catch(() => {});
    }
    this.vr.uiPlane.visible = true; this.vr.frame.visible = true; this.vr.fade.visible = true; if (this.vr.floor) this.vr.floor.visible = true;
    this.uiCanvas.style.display = 'none';
    this.r.shadowMap.enabled = this.app.save.vr.quality !== 'stable';
    this.needPlace = true; this.vrSection = null;
    this.app.input.releaseAll(); this.app.audio.resume();
    this.app.say('VR: 左スティック 移動・右 A ジャンプ・右トリガー 攻撃・右 B ポーズ', 4);
    if (this.app.screen === 'title') this.app.openTitle();
  }
  onSessionEnd() {
    this.vr.uiPlane.visible = false; this.vr.frame.visible = false; this.vr.fade.visible = false; if (this.vr.floor) this.vr.floor.visible = false;
    this.uiCanvas.style.display = '';
    this.app.input.releaseAll(); this.app.hold = false; this.vr.fading = null;
    if (this.app.screen === 'play') this.app.pause();
    this.app.audio.resume();
    for (const pl of this.clip) pl.constant = 1e6;
    this.resize();
    if (this.app.screen === 'title') this.app.openTitle();
  }
  // 箱庭を、いま見ている方向の正面に置く（頭の追跡は上書きしない。置き場所を動かすだけ）
  placeVR() {
    const cam = this.r.xr.getCamera(), vr = this.app.save.vr;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); cam.matrixWorld.decompose(p, q, new THREE.Vector3());
    if (p.lengthSq() === 0 && cam.position) p.copy(cam.position);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const yaw = e.y;
    const d = vr.distance;
    const baseH = vr.seated ? Math.max(0.9, p.y) : Math.max(1.2, p.y);
    this.vrRoot.position.set(p.x - Math.sin(yaw) * d, baseH - 0.08 + vr.height, p.z - Math.cos(yaw) * d);
    this.vrRoot.rotation.set(0, yaw, 0);
    this.needPlace = false;
  }
  recenter() { if (this.r.xr.isPresenting) { this.needPlace = true; this.app.say('正面を合わせ直しました'); } else this.app.say('VR 中に使えます'); }
  applyVR() { if (this.r.xr.isPresenting) this.needPlace = true; }
  // 区画: 横長のステージは 16u ごと、縦のステージは 9u ごとに観察位置を変える。端に近づいたら暗転して切り替える
  sectionFor(def, x, y, cur) {
    const vert = def.vertical;
    if (vert) {
      const i = Math.round((y - 4) / 9); const c = cur && Math.abs(y - cur.y) < VH / 2 - 2.5 ? cur : null; if (c) return c;
      return { i, x: def.W / 2, y: Math.min(def.H - VH / 2, Math.max(VH / 2, 4 + i * 9 + 1.5)) };
    }
    const c = cur && x > cur.x - VW / 2 + 2.5 && x < cur.x + VW / 2 - 2.5 ? cur : null; if (c) return c;
    const i = Math.round((x - 12) / 16);
    return { i, x: Math.min(def.W - VW / 2, Math.max(VW / 2, 12 + i * 16)), y: VH / 2 };
  }
  updateVR(g, dt, px, py) {
    const vr = this.vr, s = VR.unitMeters * this.app.save.vr.scale;
    if (this.needPlace) this.placeVR();
    // 区画の決定（ボス戦はボスの間に固定）
    let want;
    if (g.lockCam && g.def.boss) want = { i: 'boss', x: g.def.boss.x0 + VW / 2, y: g.def.boss.y0 + VH / 2 };
    else {
      want = this.sectionFor(g.def, px, py, this.vrSection);
      if (!g.def.vertical) want = { ...want, y: Math.min(g.def.H - VH / 2, Math.max(VH / 2, g.cam.y)) };
    }
    if (!this.vrSection) { this.vrSection = want; }
    else if (want.i !== this.vrSection.i && !vr.fading) { vr.fading = { t: 0, to: want }; this.app.hold = true; }
    if (!g.def.vertical && this.vrSection && want.i === this.vrSection.i) this.vrSection.y += (want.y - this.vrSection.y) * Math.min(1, dt * 1.5); // 縦の小さな追従はゆっくり
    if (vr.fading) {
      const f = vr.fading; f.t += dt;
      const half = VR.fade / 2;
      vr.fade.material.opacity = f.t < half ? f.t / half : Math.max(0, 1 - (f.t - half) / half);
      if (f.t >= half && !f.done) { this.vrSection = f.to; f.done = true; }
      if (f.t >= VR.fade) { vr.fading = null; vr.fade.material.opacity = 0; this.app.hold = false; }
    }
    const sec = this.vrSection;
    this.world.scale.setScalar(s);
    this.world.position.set(-sec.x * s, -sec.y * s, 0);
    // HUD の板（盤面と同じ大きさ、少し手前）
    vr.uiPlane.scale.set(VW * s, VW * s, 1); vr.uiPlane.position.set(0, 0, 0.9 * s);
    this.buildFrame(s);
    // 箱庭の外を切り落とす（左右・上下）。奥の背景は窓の中だけに見える
    this.vrRoot.updateMatrixWorld(true);
    const m = this.vrRoot.matrixWorld;
    const mk = (nx, ny, d) => { const n = new THREE.Vector3(nx, ny, 0).transformDirection(m); const pt = new THREE.Vector3(-nx * d, -ny * d, 0).applyMatrix4(m); return new THREE.Plane().setFromNormalAndCoplanarPoint(n, pt); };
    const hw = (VW / 2 + 0.6) * s, hh = (VH / 2 + 0.6) * s;
    [mk(1, 0, hw), mk(-1, 0, hw), mk(0, 1, hh), mk(0, -1, hh)].forEach((pl, i) => this.clip[i].copy(pl));
    this.readXRInput();
    this.updateRays();
  }
  buildFrame(s) {
    if (this.frameScale === s) return;
    this.frameScale = s;
    const f = this.vr.frame; this.disposeGroup(f);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.6, metalness: 0.3, envMap: this.env });
    const gold = MAT.gold.clone();
    const w = (VW + 1.4) * s, h = (VH + 1.4) * s, t = 0.5 * s, d = 4 * s;
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); f.add(o); };
    add(new THREE.BoxGeometry(w + t, t, d), mat, 0, -h / 2, -0.8 * s);
    add(new THREE.BoxGeometry(w + t, t * 0.6, d * 0.6), mat, 0, h / 2, -1.2 * s);
    add(new THREE.BoxGeometry(t, h, d * 0.6), mat, -w / 2, 0, -1.2 * s); add(new THREE.BoxGeometry(t, h, d * 0.6), mat, w / 2, 0, -1.2 * s);
    add(new THREE.BoxGeometry(w + t, 0.06 * s, 0.06 * s), gold, 0, -h / 2 + t / 2, 1.2 * s);
    // 足元の床（VR のときだけ。宙に浮いた感じを避ける）
    if (!this.vr.floor) { const fl = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 1 })); fl.rotation.x = -Math.PI / 2; this.scene.add(fl); this.vr.floor = fl; }
  }
  readXRInput() {
    const s = this.r.xr.getSession(); if (!s) return;
    const lefty = this.app.save.controls.leftHanded;
    const moveHand = lefty ? 'right' : 'left', actHand = lefty ? 'left' : 'right';
    const out = { left: false, right: false, up: false, down: false, jump: false, attack: false, pause: false, ok: false, back: false };
    for (const src of s.inputSources) {
      const gp = src.gamepad; if (!gp) continue;
      // xr-standard: axes[2],[3] がスティック、buttons 0 トリガー・1 グリップ・3 スティック押し込み・4 A/X・5 B/Y
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0, ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (src.handedness === moveHand) {
        const dz = 0.15, mag = Math.hypot(ax, ay);
        if (mag > dz) { out.left = ax < -0.5; out.right = ax > 0.5; out.up = ay < -0.55; out.down = ay > 0.55; }
      }
      if (src.handedness === actHand) { out.jump = b(4); out.attack = b(0) && !this.rayOnMenu; out.pause = b(5); out.back = b(5); out.ok = b(4); }
    }
    this.app.input.setXR(out);
    if (Object.values(out).some(Boolean)) this.app.input.lastDevice = 'xr';
  }
  updateRays() {
    const menuOpen = !!this.app.menu && this.app.screen !== 'play';
    this.rayOnMenu = false;
    for (const k of this.vr.ctrl) {
      const vis = menuOpen && !!k.c.userData.src;
      k.ray.visible = vis; k.dot.visible = false;
      if (!vis) continue;
      const hit = this.rayHit(k.c);
      if (hit) {
        k.ray.scale.y = hit.distance; k.dot.position.copy(hit.point); k.dot.visible = true; this.rayOnMenu = true;
        const pick = this.ui.pick(hit.uv.x * 2048, (1 - hit.uv.y) * 1152);
        // レーザーが別の項目へ移ったときだけ選択を動かす（スティックで選んだ項目を上書きし続けない）
        const hi = pick ? pick.i : -1;
        if (hi !== k.hover) { k.hover = hi; if (pick && this.app.menu) { this.app.menu.sel = pick.i; this.app.audio.sfx('uiMove'); } }
      } else { k.ray.scale.y = 3; k.hover = -1; }
    }
  }
  rayHit(c) {
    const ray = new THREE.Raycaster(); const m = new THREE.Matrix4().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
    const hits = ray.intersectObject(this.vr.uiPlane);
    return hits[0] || null;
  }
  vrSelect(c) {
    if (!this.app.menu || this.app.screen === 'play') return;
    const hit = this.rayHit(c); if (!hit) return;
    const pick = this.ui.pick(hit.uv.x * 2048, (1 - hit.uv.y) * 1152);
    if (pick) this.app.pointerPick(pick.i, pick.side);
  }
}
