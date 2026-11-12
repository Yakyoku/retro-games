// Sky Climber VR — 描画の全体（renderer・照明・空・建物・都市・キャラクター・障害・予告・カメラ）。
// 通常 3D と WebXR で同じ World を使う。ロジック（core/）の状態を読み、補間した位置で描く。
import * as THREE from 'three';
import { BuildingView } from './building.js';
import { City, makeSky, SKY } from './city.js';
import { makeMaterials, ClimberModel, FirstPersonHands, ResidentModel, BirdModel, HelicopterModel, loadCharacterModels } from './characters.js';
export { loadCharacterModels };
import { makeItem, Shards, Warnings, HoldMarkers, makeGondola, makeBeam, Sparks } from './props.js';
import { WIN } from '../core/stages.js';

export const QUALITY = {
  pcHigh:    { id: 'pcHigh',    ja: '通常ブラウザー高画質', maxPR: 2.0,  shadow: 2048, wallTex: 2048, aniso: 16, city: 1.0, xrScale: 1.0, foveation: 0,   shadowEvery: 1 },
  questHigh: { id: 'questHigh', ja: 'Quest 高画質',        maxPR: 1.25, shadow: 1024, wallTex: 2048, aniso: 8,  city: 0.6, xrScale: 1.0, foveation: 0.3, shadowEvery: 2 },
  standard:  { id: 'standard',  ja: '標準',                maxPR: 1.5,  shadow: 1024, wallTex: 1024, aniso: 8,  city: 0.6, xrScale: 0.9, foveation: 0.5, shadowEvery: 2 },
  light:     { id: 'light',     ja: '軽量',                maxPR: 1.0,  shadow: 0,    wallTex: 1024, aniso: 4,  city: 0.3, xrScale: 0.8, foveation: 1.0, shadowEvery: 4 },
};
export const QUALITY_ORDER = ['pcHigh', 'questHigh', 'standard', 'light'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;
    r.xr.enabled = true; r.xr.setReferenceSpaceType('local-floor');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.03, 2000);
    this.rig = new THREE.Group(); this.rig.name = 'rig'; this.rig.add(this.camera); this.scene.add(this.rig);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.M = makeMaterials();
    this.quality = QUALITY.standard;
    this.frame = 0;
    this.camPos = V(0, 2, 4); this.camLook = V(0, 2, 0);
    this.fade = 0; // 0〜1（落下・復帰・壁への接近）
  }
  setQuality(q) {
    this.quality = QUALITY[q] || QUALITY.standard;
    this.resize();
    if (this.sun) { const s = this.quality.shadow; this.sun.castShadow = s > 0; if (s > 0) { this.sun.shadow.mapSize.set(s, s); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } }
    if (this.renderer.xr.isPresenting === false) this.renderer.xr.setFramebufferScaleFactor(this.quality.xrScale);
  }
  resize() {
    const r = this.renderer, c = r.domElement;
    const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    if (r.xr.isPresenting) return;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.maxPR));
    r.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  // 実際に描いている解像度（表示解像度と区別して記録するため）
  drawSize() { const v = new THREE.Vector2(); this.renderer.getDrawingBufferSize(v); return { w: v.x, h: v.y, css: { w: this.renderer.domElement.clientWidth, h: this.renderer.domElement.clientHeight }, dpr: window.devicePixelRatio || 1 }; }

  // 棟を読み込む（前の棟は捨てる）
  setStage(game) {
    this.clearStage();
    const theme = game.def.theme, sky = SKY[theme];
    this.theme = theme; this.game = game;
    const root = this.stageRoot = new THREE.Group(); this.scene.add(root);
    // 空と環境マップ（反射に使う）
    const skyMesh = makeSky(theme); this.skyMesh = skyMesh; root.add(skyMesh);
    const envScene = new THREE.Scene(); envScene.add(makeSky(theme));
    this.envRT = this.pmrem.fromScene(envScene, 0.02, 1, 2000); this.env = this.envRT.texture;
    this.scene.environment = null;
    this.scene.fog = new THREE.FogExp2(sky.fog, sky.fogD);
    // 照明
    this.hemi = new THREE.HemisphereLight(sky.top, theme === 'night' ? 0x1a1820 : 0x6a6258, theme === 'night' ? 0.35 : theme === 'dusk' ? 0.8 : 1.1); root.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(sky.sun, theme === 'night' ? 0.35 : theme === 'dusk' ? 2.6 : 3.0);
    this.sunDir = V(...sky.sunDir).normalize();
    sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5; sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    root.add(sun, sun.target);
    // 夜: ネオンと街灯の色の光（手元を照らす）
    this.accents = [];
    if (theme === 'night') { for (const [c, x] of [[0xff3fa4, -2.5], [0x3fe0ff, 2.5]]) { const p = new THREE.PointLight(c, 6, 9, 1.6); p.position.set(x, 2, 2.5); root.add(p); this.accents.push(p); } }
    if (theme === 'dusk') { const p = new THREE.PointLight(0xffa860, 2.5, 10, 1.5); p.position.set(0, 2, 3); root.add(p); this.accents.push(p); }
    // 建物と都市
    this.bv = new BuildingView(game.b, { theme, quality: this.quality, envMap: this.env }); root.add(this.bv.group);
    this.bv.setFog(new THREE.Color(sky.fog), sky.fogD);
    this.city = new City(theme, { density: this.quality.city, heroW: game.b.cols * 1.7, heroTop: game.b.top, envMap: this.env }); root.add(this.city.group);
    // キャラクター
    this.climber = new ClimberModel(this.M); root.add(this.climber.group);
    this.fpHands = new FirstPersonHands(this.M); root.add(this.fpHands.group);
    this.residents = [new ResidentModel(this.M, 'oyaji'), new ResidentModel(this.M, 'obachan'), new ResidentModel(this.M, 'oyaji')];
    for (const rm of this.residents) { rm.group.visible = false; rm.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(rm.group); }
    this.birds = [0, 1, 2].map(() => { const b = new BirdModel(this.M); b.group.visible = false; root.add(b.group); return b; });
    this.items = new Map(); this.itemPool = { pot: [], can: [], bucket: [], bottle: [] };
    this.shards = new Shards(); root.add(this.shards.mesh);
    this.sparks = new Sparks(); root.add(this.sparks.points);
    this.warn = new Warnings(); root.add(this.warn.group);
    this.markers = new HoldMarkers(); root.add(this.markers.mesh);
    this.zoneViews = new Map();
    for (const z of game.hz.zones) {
      if (z.kind === 'gondola') { const g = makeGondola(this.env); root.add(g); this.zoneViews.set(z.id, g); }
      if (z.kind === 'crane') { const g = makeBeam(this.env); root.add(g); this.zoneViews.set(z.id, g); }
    }
    this.heli = new HelicopterModel(this.M); this.heli.group.position.set(0, game.b.top + 1.0, -5.5); this.heli.group.rotation.y = 0.4; root.add(this.heli.group);
    this.heliLift = 0;
    // 雨（夜）と風の筋（超高層）: カメラの周りの線
    if (theme === 'night' || theme === 'tower') {
      const n = theme === 'night' ? 600 : 160, pos = new Float32Array(n * 6);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: theme === 'night' ? 0x9fb4d8 : 0xffffff, transparent: true, opacity: theme === 'night' ? 0.35 : 0.25, depthWrite: false }));
      this.streaks.frustumCulled = false; this.streakData = { n, seed: Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()]) }; root.add(this.streaks);
    }
    this.setQuality(this.quality.id);
    this.renderer.shadowMap.needsUpdate = true;
  }
  clearStage() {
    if (!this.stageRoot) return;
    this.scene.remove(this.stageRoot);
    this.bv?.dispose();
    this.stageRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.envRT?.dispose();
    this.stageRoot = null;
  }
  itemModel(it) {
    let m = this.items.get(it.id);
    if (!m) { m = this.itemPool[it.item].pop() || makeItem(it.item, this.env); this.stageRoot.add(m); this.items.set(it.id, m); m.userData.kind = it.item; }
    m.visible = true; return m;
  }

  // view: { mode:'flat'|'xr', interp: { body, hands }, targets:{L,R}, t, dt, headWorld?, xrHands? }
  update(dt, game, view) {
    this.frame++;
    const b = game.b, hz = game.hz, P = view.interp;
    const theme = this.theme;
    this.skyMesh.material.uniforms.uTime.value += dt;
    this.city.update(dt);
    // 窓のガラス戸
    this.bv.updateSashes((i) => hz.win[i].active ? hz.win[i].close : 0);
    // 夜のネオンの点滅（帯電の予告で激しく）
    if (this.bv.neonMat) { const zw = hz.zones.find((z) => z.kind === 'neon' && (z.state === 'warn' || z.on)); const fl = zw ? (Math.sin(performance.now() / 30) > 0 ? 3.2 : 0.6) : 2.0 + Math.sin(performance.now() / 700) * 0.2; this.bv.neonMat.emissiveIntensity = fl; }
    if (this.bv.beacon) this.bv.beacon.material.emissiveIntensity = (Math.sin(performance.now() / 300) > 0.6) ? 5 : 0.3;
    // 主人公
    const flat = view.mode === 'flat';
    this.climber.group.visible = flat;
    this.fpHands.group.visible = !flat;
    const st = game.state, since = view.sinceHit ?? 9;
    const hands = {};
    for (const s of ['L', 'R']) {
      const h = game.climber.hands[s], ip = P.hands[s];
      hands[s] = { x: ip.x, y: ip.y, z: 0.08, held: h.hold != null, reach: !!h.reach, curl: h.hold != null ? 0.9 : h.reach ? 0.05 : 0.35 };
    }
    let expr = 'calm', look = null, mode = 'climb';
    const anyReach = game.climber.hands.L.reach || game.climber.hands.R.reach;
    if (st === 'fall' || st === 'grace') { expr = 'fall'; mode = st === 'fall' ? 'fall' : 'climb'; look = this.camera.getWorldPosition(V()); }
    else if (since < 0.7) { expr = 'surprise'; look = this.camera.getWorldPosition(V()); }
    else if (st === 'mantle' || st === 'clear') { expr = 'joy'; mode = st === 'clear' ? 'joy' : 'climb'; look = this.camera.getWorldPosition(V()); }
    else if (anyReach) { expr = 'reach'; const r = game.climber.hands.L.reach || game.climber.hands.R.reach; const t = b.holds[r.to]; look = V(t.x, t.y + 0.2, 0); }
    else if (game.climber.heldCount() === 1) expr = 'strain';
    else if (view.idle > 4) { expr = 'calm'; look = this.camera.getWorldPosition(V()); } // しばらく止まると振り返る
    if (!look) look = V(P.body.x, P.body.y + 1.0, -0.5);
    if (flat) this.climber.update(dt, { body: P.body, hands, expr, look, mode, feet: this.footholds(game, P.body), floorY: game.top, wind: theme === 'tower' ? 2 : 1 });
    if (st === 'clear') { // 屋上: ヘリへ駆け寄ってつかまり、飛び立つ
      this.heliLift += dt;
      const t = this.heliLift;
      this.heli.group.position.y = game.top + 1.0 + Math.max(0, t - 1.2) * 1.6;
      this.heli.group.position.z = -5.5 + Math.min(t, 1.2) * 3.2;
    } else this.heliLift = 0;
    this.heli.update(dt, 1);
    // 住人: 窓を閉める人・物を落とす人
    let ri = 0;
    const useRes = (x, y, z, mode, k) => { const rm = this.residents[ri++]; if (!rm) return; rm.group.visible = true; rm.group.position.set(x, y, z); rm.group.rotation.y = 0; rm.update(dt, mode, k); };
    for (const it of hz.items) {
      const w = b.windows[it.win];
      if (it.phase === 'warn') { useRes(w.x, w.y + WIN.y0 - 0.25, 0.02, 'lean', 0); }
    }
    for (let i = 0; i < hz.win.length && ri < this.residents.length; i++) { const w = hz.win[i]; if (w.resident && w.state === 'closing' && Math.abs(b.windows[i].y - P.body.y) < 8) useRes(b.windows[i].x, b.windows[i].y + WIN.y0 - 0.2, -0.45, 'close', w.close); }
    for (; ri < this.residents.length; ri++) this.residents[ri].group.visible = false;
    // 落下物
    const live = new Set();
    for (const it of hz.items) {
      live.add(it.id); const m = this.itemModel(it);
      if (it.phase === 'warn') { const w = b.windows[it.win]; m.position.set(w.x, w.y + WIN.y0 + 0.75 + Math.sin(performance.now() / 90) * 0.02, 0.15); m.rotation.set(0, 0, 0); }
      else { m.position.set(it.x, it.y, it.z); m.rotation.set(it.rot, it.rot * 0.7, 0); }
    }
    for (const [id, m] of this.items) if (!live.has(id)) { m.visible = false; this.itemPool[m.userData.kind].push(m); this.items.delete(id); }
    // 鳥
    this.birds.forEach((bm, i) => {
      const bd = hz.birds[i]; bm.group.visible = !!bd; if (!bd) return;
      bm.group.position.set(bd.phase === 'warn' ? -bd.dir * (b.halfW + 2.5) : bd.x, bd.by ?? bd.y, bd.z + 0.25);
      bm.group.rotation.set(0, bd.dir > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(performance.now() / 200) * 0.1);
      bm.update(dt, bd.phase === 'warn' ? 0.5 : 1.2);
    });
    // 大型障害
    for (const z of hz.zones) {
      const v = this.zoneViews.get(z.id);
      if (v) { v.position.set(z.x, z.kind === 'gondola' ? z.y0 - 0.3 : z.y0 - 0.2, 0); if (z.kind === 'crane') v.rotation.z = Math.sin(hz.t * 2 * Math.PI / z.period + z.phase) * 0.05; }
      if (z.kind === 'neon' && z.on && Math.random() < 0.6) this.sparks.emit(z.x + (Math.random() - 0.5) * z.w, z.y0 + Math.random() * (z.y1 - z.y0), 0.3, 3, 0.4);
    }
    this.shards.update(dt); this.sparks.update(dt);
    // 予告の帯
    const W = [];
    for (const it of hz.items) { const top = it.phase === 'warn' ? b.windows[it.win].y + WIN.y0 : it.y; W.push({ x: it.x, y0: Math.max(0, P.body.y - 1.6), y1: top, w: 0.36, alpha: it.phase === 'warn' ? 0.35 + 0.25 * Math.sin(performance.now() / 80) : 0.5, color: 0xffd040, speed: -1.2 }); }
    for (const bd of hz.birds) if (bd.phase === 'warn') W.push({ x: 0, y0: bd.y - 0.25, y1: bd.y + 0.25, w: b.halfW * 2 + 2, alpha: 0.3 + 0.2 * Math.sin(performance.now() / 70), color: 0xff7a3a, speed: bd.dir * 1.5, z: 0.5 });
    for (const z of hz.zones) {
      if (z.kind === 'neon' && (z.state === 'warn' || z.on)) W.push({ x: z.x, y0: z.y0, y1: z.y1, w: z.w, alpha: z.on ? 0.55 : 0.3, color: 0x6fe7ff, speed: 2 });
      if ((z.kind === 'gondola' || z.kind === 'crane') && Math.abs((z.y0 + z.y1) / 2 - P.body.y) < 5) W.push({ x: 0, y0: z.y1 + 0.02, y1: z.y1 + 0.1, w: b.halfW * 2, alpha: 0.4, color: 0xffc040, speed: 0.4, z: 0.03 });
    }
    this.warn.set(W);
    // 保持点の目印
    this.markers.set(view.markers || []);
    // 雨・風の筋
    if (this.streaks) {
      const p = this.streaks.geometry.attributes.position.array, c = this.camera.getWorldPosition(V()), T = performance.now() / 1000;
      for (let i = 0; i < this.streakData.n; i++) {
        const [a, bb, cc] = this.streakData.seed[i];
        if (theme === 'night') { const x = c.x + (a - 0.5) * 12, z = c.z + (cc - 0.5) * 10 - 1, y = c.y + 6 - ((T * 9 + bb * 12) % 12); p.set([x, y, z, x + 0.02, y - 0.35, z], i * 6); }
        else { const y = c.y + (bb - 0.5) * 8, z = c.z + (cc - 0.5) * 8, x = c.x + 10 - ((T * 14 + a * 20) % 20); p.set([x, y, z, x - 0.9, y, z], i * 6); }
      }
      this.streaks.geometry.attributes.position.needsUpdate = true;
    }
    // 影: 太陽の光の範囲を主人公の周りに寄せ、画質設定の間隔で更新
    const focus = V(P.body.x, P.body.y, 0.4);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 20); this.sun.target.position.copy(focus); this.sun.target.updateMatrixWorld();
    for (const a of this.accents) a.position.y = P.body.y + 0.5;
    if (this.quality.shadow > 0 && this.frame % this.quality.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
  }
  // 足を置く場所（身体の下の帯・窓台・配管の留め金）
  footholds(game, body) {
    const out = {};
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1, x = body.x + sg * 0.16, y = body.y - 1.2;
      if (body.y - 1.45 < (game.climber.support()?.y ?? -9) + 0.06) { out[s] = { x: body.x + sg * 0.14, y: (game.climber.support()?.y ?? 0) + 0.03, ground: true }; continue; }
      let best = null, bd = 0.55;
      for (const h of game.climber.index.near(x, y, 0.55)) { if (h.y > body.y - 0.85) continue; const d = Math.hypot(h.x - x, (h.y - y) * 1.4); if (d < bd) { bd = d; best = h; } }
      out[s] = best ? { x: best.x, y: best.y + 0.03 } : null;
    }
    return out;
  }
  // 通常 3D のカメラ（後方斜め・上の保持点が見える高さ）
  updateFlatCamera(dt, body, opts = {}) {
    const k = 1 - Math.exp(-dt * 4);
    const off = opts.offset || V(0.95, 0.35, 3.7);
    const lo = opts.lookOffset || V(0, 0.85, 0);
    const want = V(body.x + off.x, body.y + off.y, off.z), look = V(body.x + lo.x, body.y + lo.y, lo.z);
    this.camPos.lerp(want, opts.snap ? 1 : k); this.camLook.lerp(look, opts.snap ? 1 : k);
    this.rig.position.set(0, 0, 0); this.rig.quaternion.identity();
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
  }
  burst(x, y, kind) { this.shards.burst(x, y, 0.3, kind); }
  render() { this.renderer.render(this.scene, this.camera); }
}
