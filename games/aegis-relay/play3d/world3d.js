// AEGIS RELAY — 3D の戦域（通常画面と VR で同じ）
// 盤面の論理座標 (x, y) → 戦域の (X = x-120, Z = y-160)。地上は Y=0、空の物体は Y=AIR_H。
// 判定は sim.js の 2 次元座標だけ。ここでの高さ・揺れ・傾き・押し戻しは見た目だけで、判定には入らない。
// 戦域は盤面の長方形で切り抜く（クリップ面）→「宇宙を覗く窓の中のジオラマ」。天球と枠は切らない。
// 構成: util3d（道具・材質）/ models3d（機体・標的）/ fx3d（爆発・光）/ sky3d（宇宙）/ terrain3d＋themes3d（大陸）/ frame3d（枠）
import * as THREE from 'three';
import { FIELD, THEMES, AREAS, TUNING, COLORS } from '../shared/rules.js';
import { buildArea as genArea } from '../shared/area-gen.js';
import { HW, HH, AIR_H, lerp, clamp, damp, smooth, Kind, makeHullMaterial, makeJobs, shared } from './util3d.js';
import { playerGeos, partnerGeos, airKinds, groundKinds, debrisGeo } from './models3d.js';
import { createFx } from './fx3d.js';
import { createSky } from './sky3d.js';
import { createTerrain } from './terrain3d.js';
import { createFrame } from './frame3d.js';

export { AIR_H };
const K = 1.2 / FIELD.W; // 1 単位 = 5mm（盤面の幅 1.2m）
const PI = Math.PI, TAU = PI * 2;
const angDamp = (cur, target, rate, dt) => { let d = target - cur; d -= Math.round(d / TAU) * TAU; return cur + d * (1 - Math.exp(-rate * dt)); };
// 敵の色（破片・爆発の色あい）と噴射口（機体の座標。+z が前なので噴射は -z へ）
const TINT = { scout: 0x9fb2d6, weaver: 0x2f9f68, slicer: 0xf58a3c, gunner: 0x8558d6, spinner: 0xdff4ff, diver: 0xe03a5a, lancer: 0xddd2a6, twinL: 0x6f7ad8, twinR: 0x6f7ad8, twinM: 0x6f7ad8, turret: 0x8f98a8, bunker: 0x8f98a8, dock: 0xffc94a, panel: 0x6ff0ff, core: 0xff4fa8 };
const JETS = { scout: [[0, 0, -9.3, 1.9, 9, 0xff9a50]], gunner: [[5.6, 0, -10.6, 2.0, 8, 0xb070ff], [-5.6, 0, -10.6, 2.0, 8, 0xb070ff]], diver: [[1.25, -0.1, -10.7, 1.8, 9, 0xff6a80], [-1.25, -0.1, -10.7, 1.8, 9, 0xff6a80]], lancer: [[1.9, 0, -15.2, 2.5, 12, 0xffc070], [-1.9, 0, -15.2, 2.5, 12, 0xffc070]] };
const _col = new THREE.Color();
const rgb = (hex) => { _col.set(hex); return _col; };

export function createWorld3D(renderer, app) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);
  const stage = new THREE.Group(); scene.add(stage);          // 再センタリングで動かす
  const board = new THREE.Group(); stage.add(board);          // 戦域（拡大縮小・傾き）
  const scrollG = new THREE.Group(); board.add(scrollG);      // 地形（スクロール）
  renderer.localClippingEnabled = true;
  const clip = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  const opts = { lite: false, flash: 1 };
  const getOpts = () => { opts.lite = app.settings.quality === 'light'; opts.flash = app.settings.flash; return opts; };
  getOpts();
  const jobs = makeJobs();
  const stats = { warmMs: 0, buildMs: 0, bakeMs: 0 };

  // ── 光（C01）: 左上からの主光＋右下からの青い縁光＋空の色の環境光。stage の下に置き、再センタリングしても盤面との向きを保つ ──
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x1a1626, 0.7); stage.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dd, 2.3); key.position.set(-1.1, 1.9, -0.7); stage.add(key); stage.add(key.target);
  const rim = new THREE.DirectionalLight(0x58b8ff, 1.1); rim.position.set(1.2, 0.5, 1.3); stage.add(rim); stage.add(rim.target);
  // 環境の映り込み（C03）: 星雲色の空に帯状の光を置いた小さな部屋を作り、PMREM に焼く（金属に鋭いハイライトの帯が入る）
  {
    const env = new THREE.Scene();
    const skyM = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y * 0.5 + 0.5; vec3 c = mix(vec3(0.02, 0.025, 0.06), vec3(0.16, 0.2, 0.36), pow(h, 1.5)); c += vec3(0.25, 0.1, 0.32) * pow(max(0.0, dot(d, normalize(vec3(0.6, 0.2, -0.7)))), 3.0); gl_FragColor = vec4(c, 1.0); }' });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), skyM));
    const strip = (x, y, z, w, h, d, c, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
    strip(-8, 9, -5, 9, 1.2, 0.2, 0xfff2dc, 7); strip(-3, 11, 4, 1.0, 7, 0.2, 0xffffff, 4.5); strip(9, 3, 7, 7, 1.0, 0.2, 0x58b8ff, 6); strip(6, 8, -8, 5, 0.7, 0.2, 0xcfe4ff, 4); strip(0, -9, 0, 9, 9, 0.2, 0x1a2440, 2);
    const pm = new THREE.PMREMGenerator(renderer); const rtEnv = pm.fromScene(env, 0.035); scene.environment = rtEnv.texture; pm.dispose();
    env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }

  // ── 材質（全部で 4 つ: 機体・標的 / 飾り（遺跡など）/ 枠 / キャノピー）──
  const hullMat = makeHullMaterial(clip), decorMat = makeHullMaterial(clip, { side: THREE.DoubleSide, env: 0.6 }), frameMat = makeHullMaterial(null, { env: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.34, envMapIntensity: 2.4, clippingPlanes: clip, depthWrite: false });

  const fx = createFx(board, clip, debrisGeo(), hullMat, getOpts);
  const sky = createSky(renderer, stage, board, clip, getOpts);
  const terrain = createTerrain(scrollG, clip, fx.lights, decorMat, jobs, getOpts);
  const bezel = createFrame(board, scene, frameMat);
  terrain.onFirstTheme = () => { warmN = 3; }; // 地表のテクスチャが初めてそろったら、その組み合わせのシェーダーも先に用意する

  // ── 物体 ──
  const airDef = airKinds(), gndDef = groundKinds();
  const air = {}, gnd = {};
  for (const t in airDef) air[t] = new Kind(airDef[t].parts, hullMat, airDef[t].cap, board, 4);
  for (const t in gndDef) gnd[t] = new Kind(gndDef[t].parts, hullMat, gndDef[t].cap, board, 0);
  const PG = playerGeos();
  const player = new THREE.Group(); board.add(player);
  const pBody = new THREE.Mesh(PG.body, hullMat), pGlass = new THREE.Mesh(PG.glass, glassMat), relayR = new THREE.Mesh(PG.relayR, hullMat), relayL = new THREE.Mesh(PG.relayL, hullMat);
  for (const m of [pBody, relayR, relayL]) { m.renderOrder = 5; m.frustumCulled = false; player.add(m); } pGlass.renderOrder = 6; pGlass.frustumCulled = false; player.add(pGlass);
  const QG = partnerGeos();
  const partner = new THREE.Group(); board.add(partner);
  const qBody = new THREE.Mesh(QG.body, hullMat), qRing1 = new THREE.Mesh(QG.ring1, hullMat), qRing2 = new THREE.Mesh(QG.ring2, hullMat);
  for (const m of [qBody, qRing1, qRing2]) { m.renderOrder = 5; m.frustumCulled = false; partner.add(m); }

  // 点数の文字（板。同じ文字のテクスチャは使い回し、古いものは捨てる）
  const popTex = new Map(); const popPool = []; const pops = []; const POPMAX = 8;
  for (let i = 0; i < POPMAX; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, clippingPlanes: clip })); s.renderOrder = 30; s.visible = false; board.add(s); popPool.push(s); pops.push({ on: false, x: 0, z: 0, t: 0, big: false, tex: null }); }
  function textTexture(text, color) {
    const k = text + color; const hit = popTex.get(k); if (hit) { popTex.delete(k); popTex.set(k, hit); return hit; }
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c = cv.getContext('2d');
    c.font = "800 72px 'AR Sans', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(text, 256, 64); c.fillStyle = color; c.fillText(text, 256, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    popTex.set(k, t);
    if (popTex.size > 40) { const old = popTex.keys().next().value; const ot = popTex.get(old); if (!pops.some((p) => p.on && p.tex === ot)) { ot.dispose(); popTex.delete(old); } }
    return t;
  }
  let popHead = 0;
  function pop(x, z, text, color, big) { const p = pops[popHead]; popHead = (popHead + 1) % POPMAX; p.on = true; p.x = x; p.z = z; p.t = 0; p.big = big; p.tex = textTexture(text, color); }

  // ── 個体ごとの描画用の状態（向きのばね・回転・損傷の煙など）。使い回す ──
  const eState = new Map(), gState = new Map(), freeE = [], freeG = [];
  const newE = () => ({ stamp: 0, age: 0, vis: 0, yaw: 0, roll: 0, spin: 0, phase: 0, kick: 0, fold: 0, deploy: 0, recoil: 0, pf: 0, smoke: 0, x: 0, z: 0 });
  const newG = () => ({ stamp: 0, aim: 0, recoil: 0, open: 0, shell1: 1, shell2: 1, s1: 1, s2: 1, hurt: 0, pf: 0, phase: 0, smoke: 0, x: 0, z: 0 });
  const dummyE = newE(), dummyG = newG(), dummyObj = { hp: 1, hp0: 1, t: 0 };
  let stamp = 0;
  const bState = new Map(), freeB = [];

  // ── できごと → 演出 ──
  const sh = { amp: 0, t: 0 };                                  // 画面の揺れ（通常画面だけ。main.js が読む）
  const shake = (a) => { sh.amp = Math.max(sh.amp, a); sh.t = 0; };
  const dockFx = { t: 9 }, muzzle = { t: 9 }, warp = { k: 0, flash: 0 }, respawnFx = { t: 9 };
  let overLandFn = () => false;
  function onEvents(evs, g) {
    for (const e of evs) {
      const x = e.x - HW, z = e.y - HH;
      switch (e.t) {
        case 'shot': muzzle.t = 0; break;
        case 'hit': { const h = e.air ? AIR_H : 6; fx.sparks(x, h, z + 3, opts.lite ? 3 : 6, 70, 0xfff2c0, 0.28, 1.4); fx.spawn(0, x, h + 1, z + 3, 0, 0, 0, 0.1, 9, 4, 0xffffff, 0.8, 1, 0); if (e.id != null) { const st = eState.get(e.id); if (st) st.kick = 1; } break; }
        case 'kill': {
          const h = e.ground ? 5 : AIR_H, big = !!e.big, core = e.type === 'core';
          const wy = e.ground ? e.wy : (overLandFn(g, e.x, e.y) ? g.scroll - e.y : null);
          fx.explode(x, h, z, e.r || 8, big, TINT[e.type], { scorchWy: wy });
          if (core) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, d = 14 + (i % 3) * 9; fx.spawn(1, x + Math.cos(a) * d, 8 + i, z + Math.sin(a) * d, 0, 14, 0, 0.7, 16, 40, 0xffffff, 1, 0.45, 1.2, 0, 0, 0.15 + i * 0.12); fx.spawn(0, x + Math.cos(a) * d, 10, z + Math.sin(a) * d, 0, 0, 0, 0.12, 40, 60, 0xfff0d0, 0.45 * opts.flash, 1, 0, 0, 0, 0.15 + i * 0.12); }
            fx.spawn(4, x, 6, z, 0, 0, 0, 1.1, 20, 420, 0xffc8e6, 0.9, 1, 0, 0, -1); fx.spawn(4, x, 6, z, 0, 0, 0, 1.5, 10, 300, 0xffffff, 0.7, 1, 0, 0, -1, 0.25); fx.debris(x, 10, z, 30, 130, 2.2, 0x8f98a8); fx.light(x, 10, z, 0xff9ad0, 1.6, 240); shake(1); }
          else if (big) shake(0.5);
          break;
        }
        case 'die': fx.explode(x, AIR_H, z, 10, true, 0xe6ecf6, {}); fx.sparks(x, AIR_H, z, opts.lite ? 16 : 34, 170, 0x9ff4ff, 0.8, 2.2); fx.spawn(4, x, AIR_H, z, 0, 0, 0, 0.7, 6, 150, 0x9ff4ff, 0.9, 1, 0, 0, -1); fx.debris(x, AIR_H, z, 8, 90, 1.6, 0xffc94a); shake(0.8); break;
        case 'respawn': respawnFx.t = 0; break;
        case 'dock': dockFx.t = 0; break;
        case 'partnerFree': fx.sparks(x, 8, z, opts.lite ? 10 : 22, 80, 0xffd98a, 0.6, 1.8); fx.spawn(0, x, 8, z, 0, 0, 0, 0.4, 20, 46, 0xffd98a, 0.8, 1, 0); fx.spawn(4, x, 4, z, 0, 0, 0, 0.5, 6, 60, 0xffd98a, 0.8, 1, 0, 0, -1); break;
        case 'twinAppear': for (let s = -1; s <= 1; s += 2) fx.spawn(4, s * (HW - 6), AIR_H, 70 - HH, 0, 0, 0, 0.7, 4, 46, 0xff4fa8, 0.8, 1, 0, 0, 0); break;
        case 'twinLocked': fx.spawn(0, x, AIR_H, z, 0, 0, 0, 0.3, 50, 90, 0xff9fd2, 0.6 * opts.flash, 1, 0); fx.spawn(4, x, AIR_H, z, 0, 0, 0, 0.6, 8, 120, 0xff4fa8, 0.9, 1, 0, 0, -1); fx.sparks(x, AIR_H, z, 16, 110, 0xff9fd2, 0.5, 1.8); shake(0.35); break;
        case 'twinBreak': fx.sparks(x, AIR_H, z, opts.lite ? 20 : 44, 170, 0xff9fd2, 0.9, 2.2); fx.spawn(4, x, AIR_H, z, 0, 0, 0, 0.8, 8, 190, 0xffd0ea, 0.9, 1, 0, 0, -1); fx.spawn(4, x, AIR_H, z, 0, 0, 0, 0.8, 4, 120, 0xff4fa8, 0.9, 1, 0, 0, -1, 0.12); break;
        case 'chainStep': fx.sparks(x, 5, z, 8, 60, 0x7ff3ff, 0.4, 1.5); fx.spawn(4, x, 3, z, 0, 0, 0, 0.35, 4, 30 + e.n * 4, e.n >= 5 ? 0xffe08a : 0x7ff3ff, 0.8, 1, 0, 0, -1); break;
        case 'chainBonus': fx.sparks(x, 6, z, opts.lite ? 20 : 46, 150, 0xffe08a, 0.9, 2.2); for (let i = 0; i < 3; i++) fx.spawn(4, x, 4, z, 0, 0, 0, 0.8, 6, 110 + i * 60, i ? 0x7ff3ff : 0xffe08a, 0.85, 1, 0, 0, -1, i * 0.12); fx.light(x, 6, z, 0x7ff3ff, 1.0, 160); break;
        case 'chainFail': fx.spawn(2, x, 6, z, 0, 8, 0, 0.7, 10, 22, 0x70303c, 0.6, 0, 1); break;
        case 'sigilPing': fx.sparks(x, 4, z, 6, 40, 0xffffff, 0.35, 1.3); fx.spawn(4, x, 2.5, z, 0, 0, 0, 0.35, 3, 26, 0xffffff, 0.7, 1, 0, 0, -1); break;
        case 'sigil': fx.sparks(x, 5, z, opts.lite ? 24 : 50, 130, 0xffffff, 1.0, 2.2); for (let i = 0; i < 3; i++) fx.spawn(4, x, 3, z, 0, 0, 0, 0.9, 5, 90 + i * 70, 0xffffff, 0.85, 1, 0, 0, -1, i * 0.14); fx.spawn(0, x, 14, z, 0, 30, 0, 0.9, 30, 70, 0xdde8ff, 0.8 * opts.flash, 1, 0.5); fx.light(x, 6, z, 0xffffff, 1.1, 150); break;
        case 'dive': fx.spawn(0, x, AIR_H, z, 0, 0, 0, 0.18, 26, 12, 0xff5070, 0.8, 1, 0); break;
        case 'score': pop(x, z, (e.label ? e.label + ' ' : '') + e.pts, e.pts >= 1000 ? '#ffd166' : '#e8eefc', e.pts >= 1000); break;
        case 'extend': pop(g.player.x - HW, g.player.y - HH - 20, 'EXTEND +1', '#8affc1', true); fx.spawn(4, g.player.x - HW, AIR_H, g.player.y - HH, 0, 0, 0, 0.7, 6, 80, 0x8affc1, 0.9, 1, 0, 0, -1); break;
        case 'areaStart': if (g.tick > 5) warp.flash = 1; break;
      }
    }
  }

  // ── 戦域の置き場所 ──
  const recenter = { x: 0, y: 0, z: 0, yaw: 0 };
  function placeBoard(xr) {
    const s = app.settings;
    stage.position.set(recenter.x, recenter.y, recenter.z); stage.rotation.set(0, recenter.yaw, 0);
    // VR: 幅 0.82m の戦域を、座った目の高さ（1.2m 基準）より 0.5m 下・1.2m 先に置く。通常画面は幅 1.2m（カメラが合わせる）
    board.position.set(0, 0.72 + s.vrHeight, -(xr ? 1.2 : 1.05) * s.vrDist);
    board.rotation.set(s.vrTilt + (xr ? 0.2 : 0.12), 0, 0); // 奥を少し持ち上げて見やすく
    board.scale.setScalar(K * s.vrScale * (xr ? 0.68 : 1));
    bezel.deck.visible = !!xr; bezel.deck.position.set(recenter.x, 0.002, recenter.z);
  }
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _n = new THREE.Vector3();
  function doRecenter(xrCamera) {
    if (!xrCamera) { recenter.x = recenter.z = recenter.y = recenter.yaw = 0; return; }
    xrCamera.getWorldPosition(_p); xrCamera.getWorldQuaternion(_q);
    _e.setFromQuaternion(_q, 'YXZ');
    recenter.yaw = _e.y; recenter.x = _p.x; recenter.z = _p.z; recenter.y = _p.y - 1.2; // 目の高さ 1.2m を基準に
  }
  const clipDefs = [[1, 0, 0, HW + 0.5], [-1, 0, 0, HW + 0.5], [0, 0, 1, HH + 0.5], [0, 0, -1, HH + 0.5]];
  function updateClip() {
    board.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) { const d = clipDefs[i]; clip[i].normal.set(d[0], d[1], d[2]); clip[i].constant = d[3]; clip[i].applyMatrix4(board.matrixWorld); }
  }

  // ── エリアの切り替え（空・光・地形）──
  let curDef = null, curKey = '', attractDef = null;
  const tA = new THREE.Color(), tB = new THREE.Color();
  function setArea(def, area, loop, near) {
    curDef = def;
    const t0 = performance.now();
    if (sky.setArea(area, loop)) stats.bakeMs = performance.now() - t0;
    const th = THEMES[AREAS[area].theme];
    // エリアごとの色調（B23）: 空の色と光の色を替える
    hemi.color.set(th.sky[2]).lerp(tA.set(0xdfe8ff), 0.55); hemi.groundColor.set(th.sky[1]).multiplyScalar(0.8);
    key.color.set(0xfff0dd).lerp(tA.set(th.landHi), 0.22); rim.color.set(0x7cc4ff).lerp(tA.set(th.glow), 0.3);
    terrain.request(def, area, near);
    fx.clearScorch();
  }

  // ── 1 フレーム ──
  let T = 0, warmN = 3, warmT0 = 0, trailAcc = 0, sigT = 0;
  const twinA = { key: -1, x: 0, z: 0 };
  const lostBullet = (rec, b) => { if (rec.stamp !== stamp) { if (Math.abs(rec.x) < HW - 3 && Math.abs(rec.z) < HH - 3 && gameRun) { fx.spawn(0, rec.x, AIR_H, rec.z, 0, 0, 0, 0.16, 9, 3, 0xff8fc8, 0.9, 1, 0); fx.spawn(4, rec.x, AIR_H, rec.z, 0, 0, 0, 0.18, 3, 10, 0xff4fa8, 0.7, 1, 0, 0, 0); } bState.delete(b); freeB.push(rec); } };
  let gameRun = false;
  const jetPut = (x, y, z, yaw, lx, ly, lz, w, len, hex, a) => { const c = Math.cos(yaw), s = Math.sin(yaw); const X = x + lx * c + lz * s, Z = z - lx * s + lz * c; rgb(hex); fx.fx.put(X, y + ly, Z, w, _col.r, _col.g, _col.b, a, 6, 0, X * 0.13 + Z * 0.07, 1, -s, 0, -c, len / w); fx.fx.put(X, y + ly, Z, w * 3.2, _col.r, _col.g, _col.b, 0.5 * a, 0, 0, 0, 1); };

  function frame(alpha, dt, xr) {
    getOpts();
    const g = app.game, title = !g;
    const running = app.screen === 'play';
    gameRun = running;
    const k = running || title ? dt : 0;   // ポーズ中は演出も止める
    T += k; shared.time.value = T;
    shared.glow.value = xr ? 1.15 : 1.0;   // XR はにじみ（ブルーム）がないので発光を少し上げ、光の板で補う
    fx.halo.value = xr ? 1.0 : 0.6;
    placeBoard(xr); updateClip();
    stamp++;
    fx.ground.begin(); fx.fx.begin(); fx.top.begin();
    for (const t in air) air[t].begin(); for (const t in gnd) gnd[t].begin();

    // 最初の数フレームは全種類を 1 体ずつ（見えない大きさで）描き、シェーダーを先に用意させる（M08・M10）
    const warming = warmN > 0;
    terrain.warmG.visible = warming;
    if (warming) { if (warmN === 3) warmT0 = performance.now(); warmN--; if (warmN === 0) stats.warmMs = Math.max(stats.warmMs, performance.now() - warmT0);
      for (const t in air) { air[t].add(0, -9000, 0, 0, 0, 0, 0.001); airDef[t].pose(air[t], dummyObj, dummyE, T); air[t].fx(0, 0, 0, 0); }
      for (const t in gnd) { gnd[t].add(0, -9000, 0, 0, 0, 0, 0.001); gndDef[t].pose(gnd[t], dummyObj, dummyG, T); gnd[t].fx(0, 0, 0, 0); }
      fx.ground.put(0, -9000, 0, 1, 0, 0, 0, 0, 13, 0, 0, 0, 0, 0, 0, -1); fx.fx.put(0, -9000, 0, 1, 0, 0, 0, 0, 0); fx.top.put(0, -9000, 0, 1, 0, 0, 0, 0, 0); fx.debris(0, -9000, 0, 1, 0, 0.001, 0xffffff);
      if (!pops[0].on) { const s0 = popPool[0]; if (!s0.material.map) s0.material.map = textTexture('0', '#e8eefc'); s0.position.set(0, -9000, 0); s0.visible = true; } }

    // 何を描くか: ゲーム中はその状態、タイトルではエリア 1 の大陸をゆっくり流す
    let def, area, loop, sc;
    if (g) { def = g.def; area = g.area; loop = g.loop; sc = lerp(g.pscroll ?? g.scroll - TUNING.scroll / 60, g.scroll, alpha); if (g.scroll < (g.pscroll ?? 0)) sc = g.scroll; }
    else { if (!attractDef) attractDef = genArea(0); def = attractDef; area = 0; loop = 0; sc = 430 + ((T * 14) % (def.len - 1000)); } // 最初から島が見える位置で始める
    const key2 = area + ':' + loop;
    if (curDef !== def || curKey !== key2) { curKey = key2; setArea(def, area, loop, sc); }
    scrollG.position.z = sc;
    const need = terrain.update(sc, def);
    jobs.run(need ? 14 : warming ? 30 : (title ? 6 : 3.5));
    if (terrain.building && terrain.building.done && terrain.building.ms) { stats.buildMs = terrain.building.ms; }

    // ワープ（B26）: エリアを抜ける前後に光の筋が流れる
    const wantWarp = g && ((g.phase === 'clear' && g.phaseT > 70) || (g.phase === 'intro' && g.phaseT < 45 && g.tick > 60)) ? 1 : 0;
    warp.k = damp(warp.k, wantWarp, wantWarp ? 2.5 : 4, dt); warp.flash *= Math.exp(-3.5 * k);
    if (warp.k > 0.02) { const n = opts.lite ? 30 : 64; for (let i = 0; i < n; i++) { const hx = Math.sin(i * 12.9898) * 43758.5453, hy = Math.sin(i * 78.233) * 12543.123, fx1 = hx - Math.floor(hx), fy1 = hy - Math.floor(hy); const zz = ((fx1 * 977 + T * (700 + fy1 * 600)) % (HH * 2.6)) - HH * 1.3; fx.fx.put((fy1 * 2 - 1) * HW, -30 + fx1 * 70, zz, 1.2 + fy1, 0.6, 0.85, 1.0, warp.k * (0.35 + 0.5 * fx1), 3, 0, 0, 1, 0, 0, -1, 40 + fy1 * 50); } }
    if (warp.flash > 0.02) fx.fx.put(0, 10, 0, 620, 0.8, 0.9, 1.0, warp.flash * 0.5 * (0.3 + 0.7 * opts.flash), 0, 0, 0, 1);
    sky.frame(dt, sc, 1 + warp.k * 0.5 + warp.flash * 0.8, running || title, xr);
    fx.update(dt, running || title, sc);

    if (!g) { attract(xr); finish(); return; }
    const p = g.player, ppx = lerp(p.px, p.x, alpha) - HW, ppz = lerp(p.py, p.y, alpha) - HH;
    const fireMul = Math.max(TUNING.loop.fireCapMul, 1 - g.loop * TUNING.loop.fireStep);

    // ── 地上の標的 ──
    for (const o of g.ground.values()) {
      const x = o.x - HW, z = lerp(o.py, o.y, alpha) - HH;
      if (o.type === 'sigil') { // 隠しシジル: ときどきかすかに光る
        if (o.hidden) { const ph = (g.tick + o.gid * 37) % TUNING.sigil.hintEvery; if (ph < 30) { const kk = Math.sin((ph / 30) * PI); fx.fx.put(x, 3, z, 9 + 6 * kk, 1, 1, 1, 0.42 * kk, 0, 0, 0, 1); fx.fx.put(x, 2, z, 7 * kk + 1, 0.8, 0.9, 1, 0.5 * kk, 8, 0.08, 0, 1, 0, 0, 0, -1); } }
        continue;
      }
      let st = gState.get(o.gid); if (!st) { st = freeG.pop() || newG(); Object.assign(st, dummyG); st.phase = (o.gid * 0.618) % 1; st.aim = Math.atan2(ppx - x, ppz - z); st.pf = o.fireT; gState.set(o.gid, st); }
      st.stamp = stamp; st.x = x; st.z = z;
      const fired = o.fireT < st.pf; st.pf = o.fireT; st.recoil = fired ? 1 : st.recoil * Math.exp(-9 * k);
      const hpK = o.hp / o.hp0, dmg = o.hp0 > 1 && hpK <= 0.5 ? 1 : 0, flash = clamp(o.flash / 6, 0, 1);
      const K2 = gnd[o.type]; if (!K2) continue;
      if (o.type === 'turret' || o.type === 'bunker') st.aim = angDamp(st.aim, Math.atan2(ppx - x, ppz - z), 6, k || 0);
      let lit = 0, hgt = 6;
      if (o.type === 'bunker') { const thr = 150 * fireMul; st.open = damp(st.open, o.fireT > thr - 50 || st.recoil > 0.3 ? 1 : 0, 7, k); hgt = 9; }
      else if (o.type === 'dock') { st.open = damp(st.open, 0.12 + 0.88 * (1 - hpK) + 0.06 * Math.sin(T * 2 + st.phase * 6), 6, k); fx.fx.put(x, 6, z, 30, 1, 0.82, 0.4, 0.22 + 0.2 * st.open, 0, 0, 0, 1); }
      else if (o.type === 'panel') { const ch = g.chains[o.chainId]; lit = ch && ch.state === 'run' ? 1 + ch.count / 8 : 0; if (lit) fx.fx.put(x, 4, z, 15, 0.45, 0.95, 1, 0.3, 0, 0, 0, 1); }
      else if (o.type === 'core') {
        const t1 = hpK > 0.66 ? 1 : 0, t2 = hpK > 0.33 ? 1 : 0;  // 装甲が段階的に剥がれる（C26）
        if (t1 < st.s1) { fx.debris(x, 12, z, 14, 110, 2.4, 0x8f98a8); fx.sparks(x, 12, z, 26, 150, 0xffd9a0, 0.7, 2.2); fx.spawn(4, x, 10, z, 0, 0, 0, 0.5, 14, 110, 0xffe2b8, 0.8, 1, 0, 0, -1); shake(0.4); }
        if (t2 < st.s2) { fx.debris(x, 14, z, 12, 110, 2.0, 0x6a7282); fx.sparks(x, 14, z, 26, 150, 0xff9fd2, 0.7, 2.2); fx.spawn(4, x, 12, z, 0, 0, 0, 0.5, 10, 90, 0xff9fd2, 0.8, 1, 0, 0, -1); shake(0.4); }
        st.s1 = t1; st.s2 = t2; st.shell1 = damp(st.shell1, t1, 7, k); st.shell2 = damp(st.shell2, t2, 7, k); st.hurt = flash; hgt = 14;
        fx.top.put(x, 9, z, 58, 1, 0.31, 0.66, 0.25 + 0.6 * hpK, 8, 0.012, 0, 1, 0, 0, 0, -1);   // 耐久の輪
        fx.fx.put(x, 13, z, 34 + 6 * Math.sin(T * 5), 1, 0.35, 0.7, 0.55, 0, 0, 0, 1);
      }
      if (K2.add(x, 0, z)) { gndDef[o.type].pose(K2, o, st, T); K2.fx(flash, dmg, lit, st.phase); }
      if (fired && (o.type === 'turret' || o.type === 'bunker')) fx.spawn(0, x + Math.sin(st.aim) * 13, hgt, z + Math.cos(st.aim) * 13, 0, 0, 0, 0.09, 12, 5, 0xffd0a0, 0.9, 1, 0);
      if (dmg) { st.smoke -= k; if (st.smoke <= 0) { st.smoke = 0.13 + Math.random() * 0.12; const rr = o.r * 0.5; fx.spawn(2, x + (Math.random() - 0.5) * rr, hgt, z + (Math.random() - 0.5) * rr, (Math.random() - 0.5) * 6, 16, 6, 0.9, 4, 10, 0x2c2830, 0.45, 0, 0.8); if (Math.random() < 0.3) fx.sparks(x, hgt, z, 3, 50, 0xffc070, 0.3, 1.2); } }
    }
    gState.forEach(sweepG);

    // ── 空の敵 ──
    twinA.key = -1;
    for (const e of g.enemies) {
      let st = eState.get(e.id); if (!st) { st = freeE.pop() || newE(); Object.assign(st, dummyE); st.phase = (e.id * 0.618) % 1; st.pf = e.fireT; eState.set(e.id, st); }
      st.stamp = stamp;
      const x = lerp(e.px, e.x, alpha) - HW, z = lerp(e.py, e.y, alpha) - HH, vx = (e.x - e.px) * 60, vz = (e.y - e.py) * 60, ty = e.type;
      st.x = x; st.z = z; st.age += k; st.spin += k * 9;
      const inside = Math.abs(x) < HW && Math.abs(z) < HH; if (inside) st.vis += k;
      const fired = e.fireT < st.pf; st.pf = e.fireT; st.recoil = fired ? 1 : st.recoil * Math.exp(-8 * k); st.kick *= Math.exp(-11 * k);
      // 向き: 進む方向へ実時間のばねで寄せる（M02）。大きな艦は自機のほうを少し向く
      let yawT = 0, rollT = 0;
      if (ty === 'scout' || ty === 'diver') { yawT = clamp(Math.atan2(vx, Math.max(8, vz)), -1.0, 1.0); rollT = clamp(-vx * 0.01, -0.7, 0.7); if (e.leave) yawT = PI; }
      else if (ty === 'gunner' || ty === 'lancer') { yawT = clamp(Math.atan2(ppx - x, Math.max(20, ppz - z)), -0.5, 0.5); rollT = clamp(-vx * 0.006, -0.3, 0.3); }
      else rollT = clamp(-vx * 0.004, -0.25, 0.25);
      st.yaw = angDamp(st.yaw, yawT, 7, k); st.roll = damp(st.roll, rollT, 7, k);
      if (ty === 'diver') st.fold = damp(st.fold, e.telegraph ? 1 : (e.t > (e.tele || 0) ? 0.55 : 0), 9, k);
      if (ty === 'lancer') st.deploy = damp(st.deploy, e.t > 36 ? 1 : 0, 3, k);
      // 出現（C30・M28）: 盤面に入った直後は進行方向に引き伸ばされ、収束する
      const wk = clamp(st.vis / 0.32, 0, 1), we = 1 - (1 - wk) * (1 - wk), sx = 0.35 + 0.65 * we, sz2 = 1 + (1 - we) * 1.9;
      const bob = Math.sin(T * 2.1 + st.phase * TAU) * 1.0, y = AIR_H + bob + (ty === 'twinM' ? 1 : 0);
      const flash = clamp(e.flash / 6, 0, 1) + (1 - wk) * 0.55, dmg = e.hp0 > 1 && e.hp <= e.hp0 / 2 ? 1 : 0;
      const kz = -st.kick * 1.4;
      const K1 = air[ty];
      if (K1.add(x + Math.sin(st.yaw) * kz, y, z + Math.cos(st.yaw) * kz, st.yaw, -st.kick * 0.12, st.roll, sx, 1, sz2)) { airDef[ty].pose(K1, e, st, T); K1.fx(flash, dmg, 0, st.phase); }
      if (wk < 1 && inside) fx.fx.put(x, y, z, 26 * (1 - wk) + 6, 0.7, 0.85, 1, 0.5 * (1 - wk), 8, 0.1, 0, 1);
      // 影（地面にだけ落ちる。高さの手がかり）
      fx.ground.put(x + 6, -1.2, z + 7, e.r * 2.7, 0, 0, 0, 0.42, 13, 0, 0, 0, 0, 0, 0, -1);
      // 噴射炎・回転の残像・発光のにじみ
      const J = JETS[ty];
      if (J) { const boost = ty === 'diver' && !e.telegraph && e.t > (e.tele || 0) ? 2.4 : e.leave ? 2 : 1; for (let j = 0; j < J.length; j++) { const q = J[j]; jetPut(x, y, z, st.yaw, q[0], q[1], q[2], q[3] * (boost > 1 ? 1.3 : 1), q[4] * boost, q[5], 0.95); } }
      if (ty === 'weaver') fx.fx.put(x, y + 0.4, z, 20, 0.62, 1, 0.79, 0.14, 9, 0, st.spin, 1, 0, 0, 0, -1);
      else if (ty === 'slicer') fx.fx.put(x, y + 0.2, z, 19, 1, 0.7, 0.37, 0.2, 9, 0, st.spin * 1.6, 1, 0, 0, 0, -1);
      else if (ty === 'spinner') fx.fx.put(x, y, z, 14, 0.35, 0.82, 1, 0.35, 0, 0, 0, 1);
      else if (ty === 'twinM') fx.fx.put(x, y + 3, z, 26, 1, 0.31, 0.66, 0.5, 0, 0, 0, 1);
      if (fired && (ty === 'gunner' || ty === 'lancer')) { fx.spawn(0, x + Math.sin(st.yaw) * 14, y, z + Math.cos(st.yaw) * 14, 0, 0, 0, 0.09, 13, 5, ty === 'gunner' ? 0xd0a0ff : 0xffd98a, 0.9, 1, 0); }
      if (e.telegraph) { const bl = 0.5 + 0.5 * Math.sin(T * 30); fx.top.put(x, y, z, 30, 1, 0.31, 0.44, 0.45 + 0.5 * bl, 8, 0.06, 0, 1); fx.fx.put(x, y, z, 30, 1, 0.2, 0.3, 0.3 * bl, 0, 0, 0, 1); }
      if (e.mv === 'twin') { // ジェミニ: 半身どうしを結ぶ光の糸と、合体までの輪
        fx.top.put(x, y, z, 30 - 14 * (e.mergeK || 0), 1, 0.31, 0.66, 0.8, 8, 0.05, 0, 1);
        if (twinA.key === e.key) { const dx = x - twinA.x, dz = z - twinA.z, L = Math.hypot(dx, dz) + 1e-3, w = 2.2 + 3.5 * (e.mergeK || 0); fx.fx.put(twinA.x, y, twinA.z, w, 1, 0.4, 0.75, 0.55 + 0.4 * (e.mergeK || 0), 10, 0, e.key * 0.37, 1, dx / L, 0, dz / L, L / w); } else { twinA.key = e.key; twinA.x = x; twinA.z = z; }
      }
      if (dmg) { st.smoke -= k; if (st.smoke <= 0) { st.smoke = 0.09 + Math.random() * 0.1; fx.spawn(2, x + (Math.random() - 0.5) * e.r, y + 2, z + (Math.random() - 0.5) * e.r, -vx * 0.2, 6, -vz * 0.2 - 14, 0.7, 3.5, 9, 0x2c2830, 0.45, 0, 1); if (Math.random() < 0.35) fx.sparks(x, y, z, 2, 60, 0xffc070, 0.3, 1.2); } }
    }
    eState.forEach(sweepE);

    // ── 自機 ──
    const blink = p.invuln > 0 && (g.tick >> 2) % 2 === 0;
    player.visible = p.alive && !blink;
    const pvx = p.alive ? p.vx || 0 : 0, pvy = p.alive ? p.vy || 0 : 0;
    // 傾き（C04・M03）: 入力による速度から、描画側の実時間のばねで
    pState.roll = damp(pState.roll, -pvx / TUNING.player.speed * 0.62, 11, dt); pState.pitch = damp(pState.pitch, pvy / TUNING.player.speed * 0.14, 9, dt); pState.thr = damp(pState.thr, clamp(-pvy / TUNING.player.speed, -1, 1) + (p.entering > 0 ? 1.4 : 0), 8, dt);
    const py = AIR_H + Math.sin(T * 2.6) * 0.5;
    player.position.set(ppx, py, ppz); player.rotation.set(pState.pitch, 0, pState.roll); player.scale.setScalar(1);
    // 合体（C08・C09）: 引き寄せ → 閃光 → 装着 → 衝撃波の輪 → 金色の粒
    if (dockFx.t < 2) {
      const before = dockFx.t; dockFx.t += k;
      if (before < 0.22 && dockFx.t >= 0.22) { fx.spawn(0, ppx, py, ppz, 0, 0, 0, 0.2, 50, 80, 0xfff0c0, 0.6 * (0.3 + 0.7 * opts.flash), 1, 0); fx.spawn(4, ppx, py, ppz, 0, 0, 0, 0.55, 8, 120, 0xffd166, 0.9, 1, 0, 0, -1); fx.spawn(4, ppx, py, ppz, 0, 0, 0, 0.7, 4, 70, 0xffffff, 0.7, 1, 0, 0, -1, 0.08); fx.sparks(ppx, py, ppz, opts.lite ? 14 : 30, 120, 0xffd98a, 0.8, 2.0); fx.light(ppx, py, ppz, 0xffd166, 0.9, 120); }
    }
    const dk = p.docked ? clamp(dockFx.t / 0.22, 0, 1) : 0, de = 1 - (1 - dk) * (1 - dk) * (1 - dk);
    relayR.visible = relayL.visible = p.docked;
    relayR.position.set((1 - de) * 26, (1 - de) * 3, (1 - de) * 16); relayL.position.set(-(1 - de) * 26, (1 - de) * 3, (1 - de) * 16);
    if (p.alive) {
      const cr = Math.cos(pState.roll), sr = Math.sin(pState.roll), vis = blink ? 0.35 : 1;
      const flameLen = 10 + pState.thr * 6.5;
      for (let s = -1; s <= 1; s += 2) { // 推進炎（C05）: 前進で伸び、後退で縮む
        const X = ppx + s * 2.5 * cr, Y = py + s * 2.5 * sr + 0.1, Z = ppz + 13.3;
        fx.fx.put(X, Y, Z, 3.4, 0.25, 0.62, 1, 0.95 * vis, 6, 0, s * 1.7, 1, 0, 0, 1, Math.max(1.2, flameLen / 3.4)); fx.fx.put(X, Y, Z + 1, 9, 0.3, 0.7, 1, 0.6 * vis, 0, 0, 0, 1);
        const tx = ppx + s * 14.1 * cr, tyy = py + s * 14.1 * sr, sl = 12 + Math.abs(pvx) * 0.16 + Math.max(0, -pvy) * 0.1;
        fx.fx.put(tx, tyy, ppz + 8.6, 0.8, 0.6, 0.9, 1, 0.42 * vis, 3, 0, 0, 1, 0, 0, 1, sl / 0.8);   // 翼端の細い筋（C06）: 板の先が後ろへ伸びる
        if (p.docked && dk >= 1) { const gx = ppx + s * 17.6 * cr, gy = py + s * 17.6 * sr - 0.2; fx.fx.put(gx, gy, ppz + 9.8, 2.8, 1, 0.75, 0.3, 0.9 * vis, 6, 0, s * 3.1, 1, 0, 0, 1, Math.max(1.2, flameLen * 0.8 / 2.8)); fx.fx.put(gx, gy, ppz + 10.5, 7, 1, 0.8, 0.4, 0.5 * vis, 0, 0, 0, 1); }
      }
      fx.fx.put(ppx, py - 1, ppz + 1, 34, 0.18, 0.62, 1, 0.16, 0, 0, 0, 1);       // 自機を背景から浮かせる淡い光
      // 推進の軌跡（C06）: 実時間で一定の間隔に粒を置く
      trailAcc += k; while (trailAcc > 1 / 110) { trailAcc -= 1 / 110; const s = (stamp + (trailAcc * 1000 | 0)) & 1 ? 1 : -1; fx.spawn(0, ppx + s * 2.5 * cr, py + s * 2.5 * sr, ppz + 15 + Math.random() * 3, 0, 0, 95 + pState.thr * 40, 0.24, 3.4, 0.6, p.docked ? 0x9fd8ff : 0x58b8ff, 0.5, 1, 0.5); }
      if (muzzle.t < 0.07) { muzzle.t += k; const mk = 1 - muzzle.t / 0.07; fx.fx.put(ppx, py - 0.6, ppz - 15, 6 * mk + 2, 0.7, 0.95, 1, 0.7 * mk, 0, 0, 0, 1); if (p.docked) for (let s = -1; s <= 1; s += 2) fx.fx.put(ppx + s * 17.6, py, ppz - 6.5, 8 * mk + 2, 1, 0.85, 0.5, 0.9 * mk, 0, 0, 0, 1); }
      fx.ground.put(ppx + 6, -1.2, ppz + 7, 30, 0, 0, 0, 0.45, 13, 0, 0, 0, 0, 0, 0, -1);
      if (app.settings.hitbox) { fx.top.put(ppx, py + 2, ppz, TUNING.player.hitR * 2.4, 0, 1, 0.53, 1, 8, 0.2, 0, 1, 0, 0, 0, -1); fx.top.put(ppx, py + 2, ppz, 1.6, 1, 1, 1, 1, 0, 0, 0, 1); }
    }
    if (respawnFx.t < 0.6) { respawnFx.t += k; const rk = respawnFx.t / 0.6; fx.fx.put(ppx, py, ppz, 60 * (1 - rk) + 8, 0.6, 0.9, 1, 0.8 * (1 - rk), 8, 0.06, 0, 1); fx.fx.put(ppx, py, ppz, 40, 0.6, 0.9, 1, 0.5 * (1 - rk), 0, 0, 0, 1); }

    // ── 支援機 ARC（C10）──
    partner.visible = !!g.partner;
    if (g.partner) {
      const q = g.partner, qx = lerp(q.px, q.x, alpha) - HW, qz = lerp(q.py, q.y, alpha) - HH, rise = clamp(q.t / 40, 0, 1), qy = lerp(5, AIR_H, rise * rise * (3 - 2 * rise)) + Math.sin(T * 4) * 1.0;
      partner.position.set(qx, qy, qz); partner.scale.setScalar(0.6 + 0.4 * rise);
      qBody.rotation.y = T * 1.2; qRing1.rotation.set(T * 2.1, T * 0.7, 0.4); qRing2.rotation.set(0.6, -T * 1.6, T * 2.6);
      const pl = 0.75 + 0.25 * Math.sin(T * 7);
      fx.fx.put(qx, qy, qz, 24, 1, 0.82, 0.4, 0.55 * pl, 0, 0, 0, 1);
      fx.top.put(qx, qy, qz, TUNING.partner.dockR * 2, 1, 0.82, 0.4, 0.45 + 0.25 * pl, 8, 0.05, 0, 1, 0, 0, 0, -1);
      if (p.alive && q.t >= 40 && q.t < TUNING.partner.life) { const dx = ppx - qx, dz = ppz - qz, L = Math.hypot(dx, dz) + 1e-3; fx.fx.put(qx, qy, qz, 1.6, 1, 0.85, 0.5, 0.3, 10, 0, 1.3, 1, dx / L, (py - qy) / L, dz / L, L / 1.6); } // 誘導の光の筋
      fx.ground.put(qx + 6 * rise, -1.2, qz + 7 * rise, 20, 0, 0, 0, 0.4, 13, 0, 0, 0, 0, 0, 0, -1);
    }

    // ── 弾（必ずいちばん上に描く。C27・C28・M29）──
    for (const s of g.shots) { const x = lerp(s.px, s.x, alpha) - HW, z = lerp(s.py, s.y, alpha) - HH; if (p.docked) fx.top.put(x, AIR_H, z + 8, 4.0, 1, 0.8, 0.42, 1, 7, 0, 0, 1, 0, 0, -1, 4.4); else fx.top.put(x, AIR_H, z + 7, 3.0, 0.42, 0.85, 1, 1, 7, 0, 0, 1, 0, 0, -1, 5.0); }
    rgb(COLORS.enemyBullet); const br = _col.r, bg = _col.g, bb = _col.b;
    for (const b of g.bullets) {
      const x = lerp(b.px, b.x, alpha) - HW, z = lerp(b.py, b.y, alpha) - HH, age = (g.tick - (b.born || 0) + alpha) / 9;
      const sw = age >= 1 ? 1 : (age < 0.6 ? 0.45 + (age / 0.6) * 0.8 : 1.25 - (age - 0.6) / 0.4 * 0.25); // 出現時にふくらむ
      fx.top.put(x, AIR_H, z, (b.r + 1.3) / 0.6 * 2 * sw, br, bg, bb, 1, 5, 0, x * 0.3 + z * 0.2, 0);
      let rec = bState.get(b); if (!rec) { rec = freeB.pop() || { x: 0, z: 0, stamp: 0 }; bState.set(b, rec); } rec.x = x; rec.z = z; rec.stamp = stamp;
    }
    bState.forEach(lostBullet);

    // ── 点数の文字（拡大しながら出て、浮かんで消える。M28）──
    for (let i = 0; i < POPMAX; i++) { const q = pops[i], s = popPool[i]; if (!q.on) { s.visible = warming && i === 0; continue; } q.t += k; if (q.t > 1) { q.on = false; s.visible = false; continue; }
      if (s.material.map !== q.tex) { s.material.map = q.tex; s.material.needsUpdate = true; }
      const inK = clamp(q.t / 0.12, 0, 1), sc2 = (q.big ? 64 : 44) * (0.6 + 0.4 * (1 - (1 - inK) * (1 - inK)) + 0.12 * Math.sin(inK * PI));
      s.visible = true; s.material.opacity = q.t < 0.66 ? 1 : 1 - (q.t - 0.66) / 0.34; s.scale.set(sc2, sc2 / 4, 1); s.position.set(q.x, AIR_H + 14 + q.t * 16, q.z); }
    finish();
  }
  const pState = { roll: 0, pitch: 0, thr: 0 };
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const dropB = (rec) => { freeB.push(rec); };
  const sweepE = (st, id) => { if (st.stamp !== stamp) { eState.delete(id); freeE.push(st); } };
  const sweepG = (st, id) => { if (st.stamp !== stamp) { gState.delete(id); freeG.push(st); } };
  function finish() {
    for (const t in air) air[t].end(); for (const t in gnd) gnd[t].end();
    fx.ground.end(); fx.fx.end(); fx.top.end();
  }
  overLandFn = (g, x, y) => { const wy = g.scroll - y; for (const isl of g.def.islands) { if (wy < isl.wy0 || wy > isl.wy1) continue; const f = (wy - isl.wy0) / isl.step, i = Math.min(isl.left.length - 2, Math.floor(f)), t = f - i; if (x > lerp(isl.left[i], isl.left[i + 1], t) && x < lerp(isl.right[i], isl.right[i + 1], t)) return true; } return false; };

  function attract(xr) {
    // タイトル: エリア 1 の大陸の上を、自機がゆっくり飛ぶ
    const px = Math.sin(T * 0.5) * 46, pz = 78 + Math.sin(T * 0.37) * 14, py = AIR_H + Math.sin(T * 1.3) * 1.5, roll = -Math.cos(T * 0.5) * 0.42;
    player.visible = true; player.position.set(px, py, pz); player.rotation.set(0, 0, roll); player.scale.setScalar(1);
    const dockShow = Math.floor(T / 6) % 2 === 1; relayR.visible = relayL.visible = dockShow; relayR.position.set(0, 0, 0); relayL.position.set(0, 0, 0);
    partner.visible = false;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (let s = -1; s <= 1; s += 2) { const X = px + s * 2.5 * cr, Y = py + s * 2.5 * sr; fx.fx.put(X, Y, pz + 13.3, 3.4, 0.25, 0.62, 1, 0.95, 6, 0, s * 1.7, 1, 0, 0, 1, 3.6); fx.fx.put(X, Y, pz + 14, 9, 0.3, 0.7, 1, 0.6, 0, 0, 0, 1); fx.fx.put(px + s * 14.1 * cr, py + s * 14.1 * sr, pz + 8.6, 0.8, 0.6, 0.9, 1, 0.42, 3, 0, 0, 1, 0, 0, 1, 22); }
    fx.ground.put(px + 6, -1.2, pz + 7, 30, 0, 0, 0, 0.45, 13, 0, 0, 0, 0, 0, 0, -1);
    for (let i = 0; i < POPMAX; i++) popPool[i].visible = warmN > 0 && i === 0 && !!popPool[0].material.map;
    if (bState.size) { bState.forEach(dropB); bState.clear(); }
    eState.forEach(sweepE); gState.forEach(sweepG);
  }

  return {
    scene, stage, board, frame, bezel, onEvents, recenter: doRecenter, placeBoard, K, stats, jobs, kinds: { air, gnd },
    // 画質や XR の切り替えのあとに呼ぶ: 次の数フレームで全シェーダーを用意し直す
    warm() { warmN = 3; },
    // 通常画面の揺れ（m 単位の小さなずれ）。VR では使わない
    shakeOffset(out, dt) { sh.amp *= Math.exp(-6.5 * dt); sh.t += dt; const a = sh.amp * app.settings.shake * 0.012; out.set(a * (Math.sin(sh.t * 61) * 0.6 + Math.sin(sh.t * 37 + 1.3) * 0.4), a * (Math.sin(sh.t * 53 + 0.7) * 0.6 + Math.sin(sh.t * 29 + 2.1) * 0.4), 0); return out; },
    playerX() { const g = app.game; return g && g.player.alive ? (g.player.x - HW) / HW : 0; },
    memory() { return { ...renderer.info.memory, pops: popTex.size, eStates: eState.size, gStates: gState.size, bStates: bState.size }; },
    // 盤面の四隅（世界座標）。同じ 4 つの Vector3 を使い回す（呼び出し側は書き換えないこと）
    boardCorners() { board.updateMatrixWorld(true); corners[0].set(-HW, 0, -HH); corners[1].set(HW, 0, -HH); corners[2].set(-HW, 0, HH); corners[3].set(HW, 0, HH); for (const c of corners) c.applyMatrix4(board.matrixWorld); return corners; },
  };
}
