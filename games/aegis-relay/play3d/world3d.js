// AEGIS RELAY — 3D の戦域（通常画面と VR で同じ）
// 盤面の論理座標 (x, y) → 戦域の (X = x-120, Z = y-160)。地上は Y=0、空の物体は Y=AIR_H。
// 判定は sim.js の 2 次元座標だけ。ここでの高さ・揺れ・傾きは見た目だけで、判定には入らない。
// 戦域は盤面の長方形で切り抜く（クリップ面）→「宇宙を覗く窓の中のジオラマ」。星空と奈落は切らない。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD, THEMES, AREAS, TUNING, COLORS } from '../shared/rules.js';
import { islandSpanAt } from '../shared/area-gen.js';
import { makePlayer, makePartner, makeAir, makeGround, makeRuinGeometry, materials } from './models3d.js';

export const AIR_H = 20;
const HW = FIELD.W / 2, HH = FIELD.H / 2;
const K = 1.2 / FIELD.W; // 1 単位 = 5mm（盤面の幅 1.2m）
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function createWorld3D(renderer, app) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  const stage = new THREE.Group(); scene.add(stage);          // 再センタリングで動かす
  const board = new THREE.Group(); stage.add(board);          // 戦域（拡大縮小・傾き）
  const scrollG = new THREE.Group(); board.add(scrollG);      // 地形（スクロール）
  renderer.localClippingEnabled = true;
  const clip = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  const M = materials();
  for (const m of Object.values(M)) m.clippingPlanes = clip;

  // 光
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1626, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.2); sun.position.set(-1, 2, 0.6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6fc8ff, 0.8); rim.position.set(1, 0.5, -1.5); scene.add(rim);

  // 星空（切らない）
  {
    const r = rng(3), n = 2500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, rad = 60 + r() * 20, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad], i * 3);
      const b = 0.4 + r() * 0.6; col.set([b * (0.8 + r() * 0.2), b * 0.9, b], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, sizeAttenuation: true })));
  }
  // 奈落の星雲（盤面の下。遅くスクロールして奥行きを出す）
  const abyssTex = new THREE.CanvasTexture(document.createElement('canvas'));
  abyssTex.wrapS = abyssTex.wrapT = THREE.RepeatWrapping; abyssTex.colorSpace = THREE.SRGBColorSpace;
  const abyss = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.W * 1.0, FIELD.H * 1.0), new THREE.MeshBasicMaterial({ map: abyssTex, clippingPlanes: clip }));
  abyss.rotation.x = -Math.PI / 2; abyss.position.y = -90; board.add(abyss);
  function paintAbyss(area) {
    const th = THEMES[AREAS[area].theme]; const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1024; const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.5, th.sky[1]); gr.addColorStop(1, th.sky[0]); c.fillStyle = gr; c.fillRect(0, 0, 512, 1024);
    const r = rng(area * 31 + 1);
    for (let i = 0; i < 40; i++) { const x = r() * 512, y = r() * 1024, rad = 60 + r() * 200; for (const oy of [0, -1024, 1024]) { const g2 = c.createRadialGradient(x, y + oy, 0, x, y + oy, rad); g2.addColorStop(0, th.sky[2] + '66'); g2.addColorStop(1, '#00000000'); c.fillStyle = g2; c.fillRect(x - rad, y + oy - rad, rad * 2, rad * 2); } }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; c.fillRect(r() * 512, r() * 1024, 1.2, 1.2); }
    abyssTex.image = cv; abyssTex.needsUpdate = true;
  }

  // 戦域の枠（光る細い線）
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2ec5ff, transparent: true, opacity: 0.55 });
    const t = 0.8, y = 0;
    for (const [x, z, w, d] of [[0, -HH, FIELD.W, t], [0, HH, FIELD.W, t], [-HW, 0, t, FIELD.H], [HW, 0, t, FIELD.H]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), mat); m.position.set(x, y - 30, z); board.add(m); }
    for (const [x, z] of [[-HW, -HH], [HW, -HH], [-HW, HH], [HW, HH]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(t, 60, t), mat); m.position.set(x, 0, z); board.add(m); }
  }

  // ── 地形 ──
  let builtArea = -1;
  const islandMats = {};
  function topTexture(th) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
    c.fillStyle = th.land; c.fillRect(0, 0, 512, 512);
    const r = rng(th.land.length * 97);
    for (let i = 0; i < 900; i++) { const x = r() * 512, y = r() * 512, s = 2 + r() * 14; c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.07)'; c.beginPath(); c.arc(x, y, s, 0, 7); c.fill(); }
    for (let i = 0; i < 90; i++) { const x = r() * 512, y = r() * 512, s = 6 + r() * 20; c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, s, 0, 7); c.stroke(); c.fillStyle = 'rgba(0,0,0,.15)'; c.fill(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(1 / 150, 1 / 150);
    return t;
  }
  function matsFor(theme) {
    if (islandMats[theme]) return islandMats[theme];
    const th = THEMES[theme];
    return (islandMats[theme] = {
      top: new THREE.MeshStandardMaterial({ map: topTexture(th), color: 0xffffff, roughness: 0.92, metalness: 0.05, clippingPlanes: clip }),
      side: new THREE.MeshStandardMaterial({ color: th.side, roughness: 0.95, metalness: 0.05, clippingPlanes: clip }),
      under: new THREE.MeshStandardMaterial({ color: new THREE.Color(th.side).multiplyScalar(0.6), roughness: 1, flatShading: true, clippingPlanes: clip }),
      ruin: new THREE.MeshStandardMaterial({ color: th.ruin, roughness: 0.85, metalness: 0.1, clippingPlanes: clip }),
    });
  }
  function islandShape(isl, shrink = 1) {
    const s = new THREE.Shape(); const n = isl.left.length;
    const cxs = (x) => (x - 120 - (isl.cx - 120)) * shrink + (isl.cx - 120);
    const midWy = (isl.wy0 + isl.wy1) / 2; const wys = (wy) => (wy - midWy) * (0.92 + 0.08 * shrink) + midWy;
    for (let i = 0; i < n; i++) { const wy = wys(isl.wy0 + i * isl.step); const x = cxs(isl.left[i]); i ? s.lineTo(x, -wy - HH) : s.moveTo(x, -wy - HH); }
    for (let i = n - 1; i >= 0; i--) { const wy = wys(isl.wy0 + i * isl.step); s.lineTo(cxs(isl.right[i]), -wy - HH); }
    return s;
  }
  function buildArea(g) {
    while (scrollG.children.length) { const c = scrollG.children.pop(); c.geometry?.dispose(); }
    const theme = AREAS[g.area].theme, mt = matsFor(theme);
    for (const isl of g.def.islands) {
      const top = new THREE.ExtrudeGeometry(islandShape(isl), { depth: 12, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2, curveSegments: 2 });
      top.rotateX(Math.PI / 2); top.translate(0, -1.5, 0); // 上面が Y≈0
      scrollG.add(new THREE.Mesh(top, [mt.top, mt.side]));
      for (const [sh, y, d] of [[0.78, -13.5, 16], [0.5, -29, 18], [0.22, -46, 14]]) {
        const u = new THREE.ExtrudeGeometry(islandShape(isl, sh), { depth: d, bevelEnabled: false, curveSegments: 2 });
        u.rotateX(Math.PI / 2); u.translate(0, y, 0); scrollG.add(new THREE.Mesh(u, mt.under));
      }
      if (isl.ruins.length) {
        const geos = isl.ruins.map((r) => { const ge = makeRuinGeometry(r.kind, r.s); ge.rotateY(r.rot); ge.translate(r.x - 120, 0, -r.wy - HH); return ge.index ? ge.toNonIndexed() : ge; });
        scrollG.add(new THREE.Mesh(mergeGeometries(geos), mt.ruin));
      }
    }
    paintAbyss(g.area);
    builtArea = g.area;
    for (const m of groundMeshes.values()) board.remove(m); groundMeshes.clear();
  }

  // ── 物体のプール ──
  const player = makePlayer(); board.add(player);
  const partner = makePartner(); board.add(partner);
  const airPools = {}; const groundMeshes = new Map();
  function airFrom(type, i) {
    const pool = airPools[type] || (airPools[type] = []);
    while (pool.length <= i) { const m = makeAir(type); board.add(m); pool.push(m); }
    return pool[i];
  }
  // 弾（暗い縁 → 桃色 → 白い芯。奥行きテストを切り、地形や敵に隠れない）
  const MAXB = 420;
  const sph = new THREE.SphereGeometry(1, 10, 8);
  const mk = (color, opacity, depth = false) => { const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: depth, depthWrite: false }); m.clippingPlanes = clip; return m; };
  const bOuter = new THREE.InstancedMesh(sph, mk(0x14000c, 0.8), MAXB), bMid = new THREE.InstancedMesh(sph, mk(COLORS.enemyBullet, 1), MAXB), bCore = new THREE.InstancedMesh(sph, mk(0xffffff, 1), MAXB);
  [bOuter, bMid, bCore].forEach((m, i) => { m.renderOrder = 20 + i; m.frustumCulled = false; board.add(m); });
  const shotGeo = new THREE.CylinderGeometry(1, 1, 12, 8); shotGeo.rotateX(Math.PI / 2);
  const shotMat = new THREE.MeshBasicMaterial({ color: COLORS.playerShot, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }); shotMat.clippingPlanes = clip;
  const shots = new THREE.InstancedMesh(shotGeo, shotMat, 40); shots.frustumCulled = false; shots.renderOrder = 15; board.add(shots);
  const shadowGeo = new THREE.CircleGeometry(1, 20); shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }); shadowMat.clippingPlanes = clip;
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, 120); shadows.frustumCulled = false; board.add(shadows);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }); flashMat.clippingPlanes = clip;
  const flashes = new THREE.InstancedMesh(sph, flashMat, 80); flashes.frustumCulled = false; flashes.renderOrder = 12; board.add(flashes);
  // 予告の輪（ダイバー・ジェミニ・支援機・コアの耐久）
  const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 40); ringGeo.rotateX(Math.PI / 2);
  const ringPool = []; function ringAt(i, color) { while (ringPool.length <= i) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, clippingPlanes: clip })); m.renderOrder = 11; board.add(m); ringPool.push(m); } const r = ringPool[i]; r.material.color.set(color); r.visible = true; return r; }
  // 光の粒（爆発・火花）: 1 回の描画で最大 1600 個
  const PMAX = 1600;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX), pAlpha = new Float32Array(PMAX);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1)); pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { pxScale: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float pxScale;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * pxScale / -mv.z, 1.0, 96.0); vC = color; vA = alpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * vA, a * vA); }`,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 14; board.add(points);
  const vp = new THREE.Vector4();
  points.onBeforeRender = (r, s, cam) => { r.getCurrentViewport(vp); pMat.uniforms.pxScale.value = vp.w * 0.5 * cam.projectionMatrix.elements[5] * board.scale.x; };
  const parts = [];
  // 点数の文字（板）
  const popTex = new Map(); const popPool = []; const pops = [];
  function textTexture(text, color) {
    const key = text + color; if (popTex.has(key)) return popTex.get(key);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c = cv.getContext('2d');
    c.font = "800 72px 'AR Sans', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(text, 256, 64); c.fillStyle = color; c.fillText(text, 256, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (popTex.size > 120) popTex.clear(); popTex.set(key, t); return t;
  }

  // ── できごと → 演出 ──
  const C = (hex) => new THREE.Color(hex);
  function burst(x, y, h, n, color, spd, life, size) {
    const col = C(color);
    for (let i = 0; i < n && parts.length < PMAX; i++) { const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.4, v = spd * (0.3 + Math.random() * 0.7); parts.push({ x, y: h, z: y, vx: Math.cos(a) * v, vy: e * v * 0.6, vz: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), c: col }); }
  }
  const rings = [];
  function onEvents(evs, g) {
    const lite = app.settings.quality === 'light';
    const n = (k) => (lite ? Math.ceil(k / 2) : k);
    for (const e of evs) {
      const x = e.x - HW, z = e.y - HH, h = e.ground ? 4 : AIR_H;
      switch (e.t) {
        case 'hit': burst(x, z, e.air ? AIR_H : 4, n(5), 0xfff6c0, 50, 12, 2.5); break;
        case 'kill': burst(x, z, h, n(e.big ? 60 : 24), e.big ? 0xffa060 : 0xffe0a0, e.big ? 110 : 70, e.big ? 46 : 28, e.big ? 9 : 5); burst(x, z, h, n(e.big ? 20 : 8), 0xff6030, 25, 40, e.big ? 22 : 12); rings.push({ x, z, h, r: 2, max: e.big ? 40 : 18, t: 0, life: e.big ? 30 : 18, c: 0xffd0a0 }); break;
        case 'die': burst(x, z, AIR_H, n(90), 0xbfefff, 130, 60, 6); burst(x, z, AIR_H, n(20), 0x2ec5ff, 30, 60, 22); rings.push({ x, z, h: AIR_H, r: 2, max: 56, t: 0, life: 40, c: 0x9ff4ff }); break;
        case 'dock': rings.push({ x: e.x - HW, z: e.y - HH, h: AIR_H, r: 24, max: 2, t: 0, life: 26, c: 0xffd166 }); burst(x, z, AIR_H, n(30), 0xffd166, 60, 30, 4); break;
        case 'partnerFree': burst(x, z, 6, n(24), 0xffd166, 45, 30, 4); break;
        case 'twinBreak': burst(x, z, AIR_H, n(60), 0xff9fd2, 120, 50, 6); break;
        case 'twinLocked': rings.push({ x: 0, z: 70 - HH, h: AIR_H, r: 4, max: 42, t: 0, life: 30, c: 0xff4fa8 }); break;
        case 'chainStep': burst(x, z, 4, n(10), 0x7ff3ff, 40, 20, 3.5); break;
        case 'chainBonus': burst(x, z, 4, n(70), 0x7ff3ff, 110, 50, 5); break;
        case 'sigilPing': burst(x, z, 3, n(6), 0xffffff, 25, 16, 3); break;
        case 'sigil': burst(x, z, 4, n(80), 0xffffff, 100, 70, 5); rings.push({ x, z, h: 3, r: 2, max: 60, t: 0, life: 50, c: 0xffffff }); break;
        case 'score': pops.push({ x, z, text: (e.label ? e.label + ' ' : '') + e.pts, color: e.pts >= 1000 ? '#ffd166' : '#e8eefc', t: 0, big: e.pts >= 1000 }); break;
        case 'extend': pops.push({ x: g.player.x - HW, z: g.player.y - HH - 20, text: 'EXTEND +1', color: '#8affc1', t: 0, big: true }); break;
        case 'chainFail': pops.push({ x, z, text: 'CHAIN BREAK', color: '#ff8fa3', t: 0 }); break;
      }
    }
    if (pops.length > 12) pops.splice(0, pops.length - 12);
  }

  // ── 戦域の置き場所 ──
  const recenter = { x: 0, y: 0, z: 0, yaw: 0 };
  function placeBoard(xr) {
    const s = app.settings;
    const baseY = xr ? 0.72 : 0.72;
    stage.position.set(recenter.x, recenter.y, recenter.z); stage.rotation.set(0, recenter.yaw, 0);
    // VR: 幅 0.82m の戦域を、座った目の高さ（1.2m 基準）より 0.5m 下・1.2m 先に置く。通常画面は幅 1.2m（カメラが合わせる）
    board.position.set(0, baseY + s.vrHeight, -(xr ? 1.2 : 1.05) * s.vrDist);
    board.rotation.set(s.vrTilt + (xr ? 0.2 : 0.12), 0, 0); // 奥を少し持ち上げて見やすく
    board.scale.setScalar(K * s.vrScale * (xr ? 0.68 : 1));
  }
  function doRecenter(xrCamera) {
    if (!xrCamera) { recenter.x = recenter.z = recenter.y = recenter.yaw = 0; return; }
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); xrCamera.getWorldPosition(p); xrCamera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    recenter.yaw = e.y; recenter.x = p.x; recenter.z = p.z; recenter.y = p.y - 1.2; // 目の高さ 1.2m を基準に
  }
  const _m = new THREE.Matrix4();
  function updateClip() {
    board.updateMatrixWorld(true);
    const defs = [[1, 0, 0, HW + 0.5], [-1, 0, 0, HW + 0.5], [0, 0, 1, HH + 0.5], [0, 0, -1, HH + 0.5]];
    defs.forEach(([x, y, z, c], i) => { clip[i].set(new THREE.Vector3(x, y, z), c); clip[i].applyMatrix4(board.matrixWorld); });
  }

  // ── 1 フレーム ──
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  let time = 0;
  function frame(alpha, dt, xr) {
    time += dt;
    placeBoard(xr); updateClip();
    const g = app.game;
    // 光の粒・輪・文字は実時間で進む（ポーズ中は止める）
    const running = app.screen === 'play';
    const k = running ? dt * 60 : 0;
    for (const p of parts) { p.x += p.vx * dt * (k ? 1 : 0); p.y += p.vy * dt * (k ? 1 : 0); p.z += p.vz * dt * (k ? 1 : 0); p.vx *= 0.96 ** k; p.vy *= 0.96 ** k; p.vz *= 0.96 ** k; p.life -= k; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    for (let i = 0; i < PMAX; i++) {
      const p = parts[i];
      if (p) { pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z; const a = p.life / p.max; pCol[i * 3] = p.c.r; pCol[i * 3 + 1] = p.c.g; pCol[i * 3 + 2] = p.c.b; pSize[i] = p.size * (0.5 + a); pAlpha[i] = a; }
      else if (pAlpha[i] !== 0) { pAlpha[i] = 0; pSize[i] = 0; } else if (i > parts.length + 4) break;
    }
    for (const n of ['position', 'color', 'size', 'alpha']) pGeo.attributes[n].needsUpdate = true;
    pGeo.setDrawRange(0, Math.min(PMAX, parts.length + 4));

    let ri = 0;
    for (const r of rings) r.t += k;
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t >= rings[i].life) rings.splice(i, 1);
    for (const r of rings) { const m = ringAt(ri++, r.c); const q = r.t / r.life; const rad = lerp(r.r, r.max, 1 - (1 - q) ** 2); m.position.set(r.x, r.h, r.z); m.scale.setScalar(rad); m.material.opacity = 1 - q; }

    if (!g) { for (let i = ri; i < ringPool.length; i++) ringPool[i].visible = false; attract(dt, xr); return; }
    if (builtArea !== g.area || g.def !== lastDef) { lastDef = g.def; buildArea(g); }
    const sc = g.scroll - (1 - alpha) * TUNING.scroll / 60;
    scrollG.position.z = sc;
    abyss.material.map.offset.y = (sc * 0.0012) % 1;

    // 地上の標的
    const seen = new Set();
    const p = g.player, ppx = lerp(p.px, p.x, alpha) - HW, ppz = lerp(p.py, p.y, alpha) - HH;
    let fi = 0, si = 0;
    for (const o of g.ground.values()) {
      if (o.type === 'sigil') {
        if (o.hidden) { const ph = (g.tick + o.gid * 37) % TUNING.sigil.hintEvery; if (ph < 26) { const kk = Math.sin((ph / 26) * Math.PI); dummy.position.set(o.x - HW, 2, lerp(o.py, o.y, alpha) - HH); dummy.scale.setScalar(4 * kk + 0.5); dummy.updateMatrix(); flashes.setMatrixAt(fi++, dummy.matrix); } }
        continue;
      }
      seen.add(o.gid);
      let m = groundMeshes.get(o.gid);
      if (!m) { m = makeGround(o.type); board.add(m); groundMeshes.set(o.gid, m); }
      const x = o.x - HW, z = lerp(o.py, o.y, alpha) - HH;
      m.position.set(x, 0, z);
      const head = m.getObjectByName('head'); if (head) head.rotation.y = Math.atan2(ppx - x, ppz - z);
      const spin = m.getObjectByName('spin'); if (spin) spin.rotation.y = time * 0.6;
      if (o.type === 'dock') m.position.y = Math.sin(time * 3) * 0.6;
      if (o.flash > 0 && fi < 80) { dummy.position.set(x, 5, z); dummy.scale.setScalar(o.r * 0.8 * (o.flash / 6)); dummy.updateMatrix(); flashes.setMatrixAt(fi++, dummy.matrix); }
      if (o.type === 'core') { const hpMax = 40 + Math.min(24, g.loop * 8); const r = ringAt(ri++, 0xff4fa8); r.position.set(x, 9, z); r.scale.setScalar(27); r.material.opacity = 0.35 + 0.65 * (o.hp / hpMax); }
      if (o.type === 'panel') { const ch = g.chains[o.chainId]; m.children[0].material = ch && ch.state === 'run' && o.chainIdx < ch.count ? M.panelLine : M.panel; }
    }
    for (const [gid, m] of groundMeshes) if (!seen.has(gid)) { board.remove(m); groundMeshes.delete(gid); }

    // 空の敵
    const used = {};
    for (const e of g.enemies) {
      const i = used[e.type] = (used[e.type] ?? -1) + 1;
      const m = airFrom(e.type, i); m.visible = true;
      const x = lerp(e.px, e.x, alpha) - HW, z = lerp(e.py, e.y, alpha) - HH;
      const bob = Math.sin(time * 2 + e.id) * 1.2;
      m.position.set(x, AIR_H + bob, z);
      const dx = e.x - e.px, dz = e.y - e.py;
      if (e.type === 'spinner' || e.type === 'slicer') m.rotation.set(0, time * (e.type === 'slicer' ? 8 : 5), 0);
      else if (e.type === 'weaver') m.rotation.set(0, time * 2, 0);
      else if (e.type === 'scout' || e.type === 'diver') { const yaw = Math.max(-0.8, Math.min(0.8, Math.atan2(dx, dz || 0.001))); m.rotation.set(0, yaw, -dx * 0.08); }
      else m.rotation.set(0, 0, Math.max(-0.4, Math.min(0.4, -dx * 0.1)));
      if (e.flash > 0 && fi < 80) { dummy.position.copy(m.position); dummy.scale.setScalar(e.r * 0.9 * (e.flash / 6)); dummy.updateMatrix(); flashes.setMatrixAt(fi++, dummy.matrix); }
      if (e.telegraph) { const r = ringAt(ri++, 0xff5070); r.position.copy(m.position); r.scale.setScalar(14); r.material.opacity = 0.5 + 0.5 * Math.sin(time * 36); }
      if (e.mv === 'twin') { const r = ringAt(ri++, 0xff4fa8); r.position.copy(m.position); r.scale.setScalar(14 - 8 * (e.mergeK || 0)); r.material.opacity = 0.9; }
      if (si < 120 && overLand(g, e.x, e.y)) { dummy.position.set(x + 4, 0.3, z + 6); dummy.scale.set(e.r * 0.9, 1, e.r * 0.9); dummy.updateMatrix(); shadows.setMatrixAt(si++, dummy.matrix); }
    }
    for (const t in airPools) airPools[t].forEach((m, i) => { if (i > (used[t] ?? -1)) m.visible = false; });
    for (let i = ri; i < ringPool.length; i++) ringPool[i].visible = false;

    // 自機・支援機
    const blink = p.invuln > 0 && (g.tick >> 2) % 2 === 0;
    player.visible = p.alive && !blink;
    player.position.set(ppx, AIR_H, ppz);
    const bank = Math.max(-0.5, Math.min(0.5, -(p.x - p.px) * 0.25));
    player.rotation.z = lerp(player.rotation.z, bank, 0.2); player.rotation.x = Math.max(-0.2, Math.min(0.2, (p.y - p.py) * 0.06));
    player.getObjectByName('relay').visible = p.docked;
    const pulse = p.dockAnim > 0 ? 1 + 0.25 * Math.sin((p.dockAnim / TUNING.partner.dockTicks) * Math.PI) : 1; player.scale.setScalar(pulse);
    if (p.alive && si < 120 && overLand(g, p.x, p.y)) { dummy.position.set(ppx + 4, 0.3, ppz + 7); dummy.scale.set(10, 1, 10); dummy.updateMatrix(); shadows.setMatrixAt(si++, dummy.matrix); }
    partner.visible = !!g.partner;
    if (g.partner) { const q = g.partner; partner.position.set(lerp(q.px, q.x, alpha) - HW, AIR_H + Math.sin(time * 4) * 1.5, lerp(q.py, q.y, alpha) - HH); partner.rotation.y = time * 1.5; const r = ringAt(ri++, 0xffd166); r.position.copy(partner.position); r.scale.setScalar(TUNING.partner.dockR); r.material.opacity = 0.6; }
    if (app.settings.hitbox && p.alive) { const r = ringAt(ri++, 0x00ff88); r.position.set(ppx, AIR_H + 2, ppz); r.scale.setScalar(TUNING.player.hitR); r.material.opacity = 1; }

    // 弾
    let bi = 0;
    for (const b of g.bullets) {
      if (bi >= MAXB) break;
      const x = lerp(b.px, b.x, alpha) - HW, z = lerp(b.py, b.y, alpha) - HH, born = Math.min(1, (g.tick - (b.born || 0)) / 6), r = b.r * (0.6 + 0.4 * born);
      dummy.position.set(x, AIR_H, z);
      dummy.scale.setScalar(r + 1.2); dummy.updateMatrix(); bOuter.setMatrixAt(bi, dummy.matrix);
      dummy.scale.setScalar(r + 0.4); dummy.updateMatrix(); bMid.setMatrixAt(bi, dummy.matrix);
      dummy.scale.setScalar(r * 0.55); dummy.updateMatrix(); bCore.setMatrixAt(bi, dummy.matrix);
      bi++;
    }
    for (const m of [bOuter, bMid, bCore]) { m.count = bi; m.instanceMatrix.needsUpdate = true; }
    let shI = 0;
    for (const s of g.shots) { if (shI >= 40) break; dummy.position.set(lerp(s.px, s.x, alpha) - HW, AIR_H, lerp(s.py, s.y, alpha) - HH); dummy.scale.set(1.3, 1.3, 1); dummy.updateMatrix(); shots.setMatrixAt(shI++, dummy.matrix); }
    shots.count = shI; shots.instanceMatrix.needsUpdate = true;
    shadows.count = si; shadows.instanceMatrix.needsUpdate = true;
    flashes.count = fi; flashes.instanceMatrix.needsUpdate = true;

    // 点数の文字
    for (const q of pops) q.t += k;
    for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 60) pops.splice(i, 1);
    pops.forEach((q, i) => {
      if (!popPool[i]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); s.renderOrder = 30; board.add(s); popPool[i] = s; }
      const s = popPool[i]; s.visible = true; s.material.map = textTexture(q.text, q.color); s.material.needsUpdate = true;
      s.material.opacity = q.t < 40 ? 1 : 1 - (q.t - 40) / 20; const w = q.big ? 64 : 44; s.scale.set(w, w / 4, 1); s.position.set(q.x, AIR_H + 14 + q.t * 0.3, q.z);
    });
    for (let i = pops.length; i < popPool.length; i++) popPool[i].visible = false;
  }
  let lastDef = null;
  function overLand(g, x, y) { const wy = g.scroll - y; for (const isl of g.def.islands) { const sp = islandSpanAt(isl, wy); if (sp && x > sp[0] && x < sp[1]) return true; } return false; }
  function attract(dt, xr) {
    // タイトル: 自機をゆっくり回して見せる
    player.visible = !!xr; player.position.set(0, AIR_H + 40, 30); player.rotation.set(0.25, time * 0.5, 0); player.scale.setScalar(1.4);
    player.getObjectByName('relay').visible = Math.floor(time / 4) % 2 === 1;
    partner.visible = false;
    for (const t in airPools) airPools[t].forEach((m) => { m.visible = false; });
    for (const m of [bOuter, bMid, bCore, shots, shadows, flashes]) m.count = 0;
    for (const s of popPool) s.visible = false;
    if (builtArea !== 0 || lastDef !== 'title') { lastDef = 'title'; const def = { area: 0, def: { islands: [] } }; while (scrollG.children.length) scrollG.children.pop(); paintAbyss(0); builtArea = 0; for (const m of groundMeshes.values()) board.remove(m); groundMeshes.clear(); }
    abyss.material.map.offset.y = (time * 0.01) % 1;
  }
  return { scene, stage, board, frame, onEvents, recenter: doRecenter, placeBoard, K, boardCorners() {
    board.updateMatrixWorld(true); return [[-HW, -HH], [HW, -HH], [-HW, HH], [HW, HH]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(board.matrixWorld));
  } };
}
