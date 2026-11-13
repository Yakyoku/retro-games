// VR 版のビル内部。ゲーム座標 (x, y) をそのまま世界座標に使い、奥行き z は廊下（奥の壁 z=-2 にドア、手前 z=+2 に窓）。
// 照明は頂点色に焼き込む（Quest で重い動的ライトを使わない）。照明が撃ち落とされたら、その階だけ焼き直す。
// 近くの階（±2）だけ表示し、遠い階は状態を保ったまま非表示にする。
import * as THREE from 'three';
import { W, CAR_W, FLOOR_H, level, LIGHT_RADIUS } from '../../shared/core/const.js';
import { THEME } from '../../shared/art/palette.js';
import { makeRng } from '../../shared/core/rng.js';

export const ZB = -2.0, ZF = 2.0;       // 奥の壁・手前の壁
export const ESC_Z0 = 0.95, ESC_Z1 = 1.9; // エスカレーターの帯（窓側）
const col = (hex) => new THREE.Color(hex);

export function lampLight(game, f, x, y, z) {
  const L = level(f);
  let a = 0.2;
  for (const l of game.byFloor[f].lights) {
    if (l.state !== 'on') continue;
    const dx = x - l.x, dy = (L + 2.25) - y, dz = z;
    const d = Math.hypot(dx, dy, dz);
    const k = Math.max(0, 1 - d / (LIGHT_RADIUS * 1.45));
    a += 1.05 * k * k * (dy > -0.05 ? 1 : 0.4);
  }
  a += 0.07 * Math.max(0, z / 2); // 窓からの月明かり
  return Math.min(1.3, Math.max(0.34, a));
}

// 頂点色つきの面を組み立てる小さな道具
class Builder {
  constructor() { this.pos = []; this.base = []; this.idx = []; this.uv = []; }
  quad(a, b, c, d, color) { // 反時計回り。UV は面の向きから世界座標で投影（1.2m で 1 枚）
    const i = this.pos.length / 3;
    const nx = Math.abs((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])), ny = Math.abs((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]));
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]); this.base.push(color.r, color.g, color.b);
      if (ny > nx && ny > 1e-9) this.uv.push(p[0] / 1.2, p[2] / 1.2); else if (nx > 1e-9) this.uv.push(p[2] / 1.2, p[1] / 1.2); else this.uv.push(p[0] / 1.2, p[1] / 1.2);
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  box(x0, x1, y0, y1, z0, z1, color, faces = 'all') { // 手前・上・両側（奥は壁に付くので省く）
    const c2 = color.clone ? color : col(color);
    const top = c2.clone().multiplyScalar(1.15), side = c2.clone().multiplyScalar(0.8);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c2);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    if (faces === 'all') { this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side); this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side); }
  }
  // 細かく分割した長方形（照明の焼き込みを滑らかにする）
  gridX(x0, x1, y0, y1, z, color, nrm, step = 0.5, ystep = 0.5) {
    const xs = splits(x0, x1, step), ys = splits(y0, y1, ystep);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const [a, b] = [xs[i], xs[i + 1]], [c, d] = [ys[j], ys[j + 1]];
      if (nrm > 0) this.quad([a, c, z], [b, c, z], [b, d, z], [a, d, z], color);
      else this.quad([b, c, z], [a, c, z], [a, d, z], [b, d, z], color);
    }
  }
  gridZ(z0, z1, y0, y1, x, color, nrm, step = 0.5) {
    const zs = splits(z0, z1, step), ys = splits(y0, y1, 0.5);
    for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const [a, b] = [zs[i], zs[i + 1]], [c, d] = [ys[j], ys[j + 1]];
      if (nrm > 0) this.quad([x, c, b], [x, c, a], [x, d, a], [x, d, b], color);
      else this.quad([x, c, a], [x, c, b], [x, d, b], [x, d, a], color);
    }
  }
  // 水平面（床は上向き、天井は下向き）。holes は [x0,x1,z0,z1]
  plane(y, color, up, holes, xs, zs) {
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const a = xs[i], b = xs[i + 1], c = zs[j], d = zs[j + 1];
      const cx = (a + b) / 2, cz = (c + d) / 2;
      if (holes.some((h) => cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3])) continue;
      if (up) this.quad([a, y, d], [b, y, d], [b, y, c], [a, y, c], color);
      else this.quad([a, y, c], [b, y, c], [b, y, d], [a, y, d], color);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.base.slice(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.userData.base = Float32Array.from(this.base);
    return g;
  }
}
function splits(a, b, step) { const out = [a]; for (let v = Math.ceil(a / step + 1e-6) * step; v < b - 1e-6; v += step) out.push(v); out.push(b); return out; }
function breakpoints(lo, hi, step, extra) {
  const s = new Set();
  for (let v = lo; v <= hi + 1e-6; v += step) s.add(+v.toFixed(3));
  for (const e of extra) if (e >= lo && e <= hi) s.add(+e.toFixed(3));
  return [...s].sort((a, b) => a - b);
}

export class World3D {
  constructor(scene, game) {
    this.scene = scene; this.game = game;
    this.root = new THREE.Group(); scene.add(this.root);
    this.floors = {}; this.interact = []; this.cars = []; this.lampMeshes = [];
    this.th = THEME[game.stage.theme] || THEME.office;
    this.mats = {
      baked: new THREE.MeshBasicMaterial({ vertexColors: true, map: this.surfaceTexture(game.stage.theme) }),
      emit: new THREE.MeshBasicMaterial({ vertexColors: true }),
      cone: new THREE.MeshBasicMaterial({ map: this.coneTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.55 }),
      glass: new THREE.MeshBasicMaterial({ color: 0x9cc8e8, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
      lampOn: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
      lampOff: new THREE.MeshBasicMaterial({ color: 0x555a60 }),
      lampShade: new THREE.MeshLambertMaterial({ color: 0x2b313b }),
      laser: new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      hazard: new THREE.MeshBasicMaterial({ color: 0xf2c230 }),
    };
    this.buildSky();
    for (let f = 1; f <= game.stage.floors; f++) this.buildFloor(f);
    for (const c of game.cars) this.buildCar(c);
    this.buildRoof();
    this.visibleAround(game.playerFloor, true);
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.root);
  }

  buildSky() {
    // 夜空と街（遠景）。BGM 同様、遠景は動かない
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 1024);
    gr.addColorStop(0, '#04060f'); gr.addColorStop(0.5, '#0e1530'); gr.addColorStop(0.62, '#2a2350'); gr.addColorStop(0.66, '#151529'); gr.addColorStop(1, '#05060b');
    g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
    const r = makeRng(9);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`; g.fillRect(r() * 2048, r() * 560, 1.5, 1.5); }
    for (let i = 0; i < 2600; i++) { // 地上の街の灯り（地平線より下）
      const y = 680 + Math.pow(r(), 1.6) * 340; g.fillStyle = r() < 0.8 ? `rgba(255,${190 + r() * 50},${110 + r() * 60},${0.4 + r() * 0.5})` : `rgba(130,200,255,${0.4 + r() * 0.5})`;
      g.fillRect(r() * 2048, y, 1 + r() * 2, 1 + r());
    }
    g.fillStyle = 'rgba(255,246,220,0.9)'; g.beginPath(); g.arc(1500, 220, 22, 0, 7); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.mapping = THREE.EquirectangularReflectionMapping;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.renderOrder = -10;
    this.sky = sky; this.scene.add(sky);
    // 近くのビル群（窓の外に見える）
    const n = 140; const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const wc = document.createElement('canvas'); wc.width = 64; wc.height = 256; const wg = wc.getContext('2d');
    wg.fillStyle = '#0b0f1e'; wg.fillRect(0, 0, 64, 256);
    for (let y = 4; y < 256; y += 10) for (let x = 4; x < 64; x += 10) if (r() < 0.45) { wg.fillStyle = r() < 0.8 ? '#e8c27a' : '#8fc8ff'; wg.fillRect(x, y, 6, 6); }
    const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(2, 6);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: wt, color: 0xa0a8c0 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2; const d = 45 + r() * 150;
      const x = W / 2 + Math.cos(a) * d, z = Math.sin(a) * d;
      if (z < 25 && z > -25 && x > -20 && x < 44) continue;
      const h = 15 + r() * 110, w = 8 + r() * 16;
      m.compose(new THREE.Vector3(x, -1, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w * (0.6 + r())));
      im.setMatrixAt(i, m);
    }
    this.scene.add(im); this.city = im;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: 0x07080d }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -1.05, 0); this.scene.add(ground);
  }

  holesAt(f) {
    const g = this.game;
    const h = [];
    for (const c of g.cars) if (f >= c.lo && f <= c.hi) h.push([c.x - CAR_W / 2, c.x + CAR_W / 2, ZB - 0.01, ZF + 0.01]);
    for (const e of g.stage.escalators) if (e.upper === f) { const xa = e.xBot + (e.xTop - e.xBot) * 0.3; h.push([Math.min(xa, e.xTop) - 0.05, Math.max(xa, e.xTop) + 0.05, ESC_Z0, ESC_Z1]); }
    return h;
  }

  buildFloor(f) {
    const g = this.game; const L = level(f); const th = this.th;
    const grp = new THREE.Group(); grp.name = 'floor' + f; this.root.add(grp);
    const b = new Builder();
    const holesF = this.holesAt(f), holesC = this.holesAt(f + 1);
    const extraX = [...holesF, ...holesC].flatMap((h) => [h[0], h[1]]);
    const xs = breakpoints(0, W, 0.5, extraX);
    const zs = breakpoints(ZB, ZF, 0.5, [ESC_Z0, ESC_Z1]);
    const cFloor = col(th.floor).lerp(col(th.floorTop), 0.35);
    b.plane(L, cFloor, true, holesF, xs, zs);
    if (f < g.stage.floors) b.plane(L + FLOOR_H - 0.001, col(th.wallTop).multiplyScalar(0.7), false, holesC, xs, zs);
    else b.plane(L + FLOOR_H - 0.001, col(th.wallTop).multiplyScalar(0.7), false, [], xs, zs);
    // 奥の壁（腰壁＋上壁）・手前の壁（窓）・両端
    b.gridX(0, W, L, L + 1.0, ZB, col(th.wallLow), 1);
    b.gridX(0, W, L + 1.0, L + FLOOR_H, ZB, col(th.wall), 1);
    b.gridX(0, W, L, L + 0.9, ZF, col(th.wallLow), -1);
    b.gridX(0, W, L + 2.45, L + FLOOR_H, ZF, col(th.wall), -1);
    for (let x = 0; x < W; x += 2) b.gridX(x, x + 0.18, L + 0.9, L + 2.45, ZF - 0.01, col('#20252e'), -1, 0.5); // 窓の桟
    b.gridZ(ZB, ZF, L, L + FLOOR_H, 0, col(th.wall), 1);
    b.gridZ(ZB, ZF, L, L + FLOOR_H, W, col(th.wall), -1);
    // 腰の見切り・幅木（帯）
    b.gridX(0, W, L + 0.98, L + 1.04, ZB + 0.005, col(th.trim).multiplyScalar(0.8), 1, 0.5, 0.06);
    b.gridX(0, W, L, L + 0.12, ZB + 0.006, col('#15171b'), 1, 0.5, 0.12);
    // 床の縁（穴の警告）
    for (const c of g.cars) if (f >= c.lo && f <= c.hi) for (const ex of [c.x - CAR_W / 2 - 0.25, c.x + CAR_W / 2]) b.plane(L + 0.004, col('#d9a72a'), true, [], [ex, ex + 0.25], zs);
    const em = new Builder();
    this.props3d(b, em, f, L);
    const geo = b.geometry();
    const mesh = new THREE.Mesh(geo, this.mats.baked); grp.add(mesh);
    if (em.pos.length) grp.add(new THREE.Mesh(em.geometry(), this.mats.emit));
    // 窓ガラス
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.55), this.mats.glass); glass.position.set(W / 2, L + 1.675, ZF - 0.02); glass.rotation.y = Math.PI; grp.add(glass);
    // 階の表示（奥の壁）
    const sign = this.textPlane(`${f}F`, 0.9, 0.42, { bg: '#0d1018', fg: '#e9eef5', size: 150 });
    sign.position.set(0.85, L + 2.25, ZB + 0.02); grp.add(sign);
    const sign2 = sign.clone(); sign2.position.set(W - 0.85, L + 2.25, ZB + 0.02); grp.add(sign2);
    const fd = { f, grp, mesh, geo, doors: [], lamps: [], lasers: [], covers: [] };
    this.floors[f] = fd;
    for (const d of g.byFloor[f].doors) this.buildDoor(fd, d);
    for (const l of g.byFloor[f].lights) this.buildLamp(fd, l);
    for (const c of g.byFloor[f].covers) this.buildCover(fd, c);
    for (const e of g.stage.escalators) if (e.upper - 1 === f) this.buildEscalator(fd, e);
    for (const c of g.cars) if (f >= c.lo && f <= c.hi) this.buildLanding(fd, c);
    if (f === g.stage.start.floor) { const sd = this.box(1.0, 2.2, 0.05, '#39414e'); sd.position.set(g.stage.start.x, L + 1.1, ZB + 0.03); grp.add(sd); }
    if (f === g.stage.exit.floor) {
      const ex = this.box(1.4, 2.4, 0.05, '#0c3a22'); ex.position.set(g.stage.exit.x, L + 1.2, ZB + 0.03); grp.add(ex);
      const s = this.textPlane('EXIT 出口', 1.3, 0.34, { bg: '#0e5a32', fg: '#eafff2', size: 120 }); s.position.set(g.stage.exit.x, L + 2.6, ZB + 0.04); grp.add(s);
      fd.exitSign = s;
    }
    this.bake(f);
  }

  surfaceTexture(theme) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = makeRng(theme.length * 31);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); } // 細かなざらつき
    if (theme === 'office') { g.fillStyle = 'rgba(0,0,0,0.06)'; for (let x = 0; x < 256; x += 12) g.fillRect(x, 0, 4, 256); }
    else if (theme === 'lab') { g.strokeStyle = 'rgba(0,30,40,0.35)'; g.lineWidth = 3; g.strokeRect(1, 1, 254, 254); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(20, 20); g.lineTo(110, 20); g.lineTo(20, 110); g.fill(); }
    else if (theme === 'security') { for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 10 + r() * 40, 6 + r() * 30, 0, 0, 7); g.fill(); } g.fillStyle = 'rgba(255,255,255,0.25)'; for (const [x, y] of [[12, 12], [244, 12], [12, 244], [244, 244]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }
    else { g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 3; for (let y = 0; y < 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 64) % 2 ? 64 : 0; x < 256; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  coneTexture() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,230,180,0.0)'); gr.addColorStop(0.05, 'rgba(255,230,180,0.35)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // 家具・機材（照明を焼き込む面は b、発光する面は em に結合。描画呼び出しを増やさない）
  props3d(b, em, f, L) {
    const g = this.game; const theme = g.stage.theme; const r = makeRng(f * 7717 + g.stage.id.length * 131 + 9);
    const busy = [];
    for (const d of g.byFloor[f].doors) busy.push([d.x - 0.95, d.x + 0.95]);
    for (const c of g.cars) if (f >= c.lo - 1 && f <= c.hi) busy.push([c.x - CAR_W / 2 - 0.85, c.x + CAR_W / 2 + 0.85]);
    for (const e of g.stage.escalators) if (e.upper - 1 === f || e.upper === f) busy.push([Math.min(e.xBot, e.xTop) - 0.6, Math.max(e.xBot, e.xTop) + 0.6]);
    if (f === g.stage.start.floor) busy.push([0, 2.4]); if (f === g.stage.exit.floor) busy.push([g.stage.exit.x - 1.4, W]);
    const kinds = { office: ['desk', 'desk', 'cabinet', 'shelf', 'plant', 'cooler'], lab: ['rack', 'rack', 'bench', 'tank', 'plant'], security: ['locker', 'locker', 'monitors', 'crates', 'equip'], training: ['target', 'target', 'bench', 'locker'] }[theme] || ['desk'];
    const z1 = ZB + 0.55, z0 = ZB + 0.02;
    let x = 0.5 + r() * 0.6, guard = 0;
    const E = (x0, x1, y0, y1, color) => em.quad([x0, y0, z1 + 0.003], [x1, y0, z1 + 0.003], [x1, y1, z1 + 0.003], [x0, y1, z1 + 0.003], col(color));
    while (x < W - 0.6 && guard++ < 60) {
      const k = kinds[Math.floor(r() * kinds.length)];
      const w = { desk: 1.6, cabinet: 0.6, shelf: 1.1, plant: 0.6, cooler: 0.45, rack: 0.75, bench: 1.6, tank: 0.6, locker: 1.3, monitors: 1.6, crates: 1.0, equip: 0.8, target: 0.7 }[k];
      if (x + w > W - 0.3) break;
      if (busy.some(([a, bb]) => x < bb && x + w > a)) { x += 0.4; continue; }
      const Y = L;
      switch (k) {
        case 'desk': b.box(x, x + w, Y + 0.7, Y + 0.78, z0, z1, '#5b4232'); b.box(x + 0.05, x + 0.11, Y, Y + 0.7, z0, z1 - 0.05, '#2a1d15'); b.box(x + w - 0.6, x + w - 0.1, Y, Y + 0.7, z0, z1 - 0.05, '#3a2a1e'); b.box(x + 0.3, x + 0.85, Y + 0.85, Y + 1.22, z0 + 0.1, z0 + 0.16, '#121418'); em.quad([x + 0.33, Y + 0.88, z0 + 0.165], [x + 0.82, Y + 0.88, z0 + 0.165], [x + 0.82, Y + 1.19, z0 + 0.165], [x + 0.33, Y + 1.19, z0 + 0.165], col('#3a7cc8')); break;
        case 'cabinet': b.box(x, x + w, Y, Y + 1.3, z0, z1 - 0.1, '#6b737e'); break;
        case 'shelf': b.box(x, x + w, Y, Y + 1.9, z0, z1 - 0.15, '#3a2a1e'); for (let i = 0; i < 4; i++) { let bx = x + 0.06; while (bx < x + w - 0.1) { const bw = 0.05 + r() * 0.05; b.box(bx, bx + bw, Y + 0.1 + i * 0.46, Y + 0.38 + i * 0.46 + r() * 0.08, z0, z1 - 0.12, `hsl(${r() * 360},30%,35%)`, 'front'); bx += bw + 0.01; } } break;
        case 'plant': b.box(x + 0.15, x + w - 0.15, Y, Y + 0.45, z0 + 0.1, z1 - 0.1, '#4a3a30'); b.box(x + 0.05, x + w - 0.05, Y + 0.45, Y + 1.25, z0 + 0.05, z1, '#2f5a3a'); break;
        case 'cooler': b.box(x, x + w, Y, Y + 0.95, z0, z1 - 0.15, '#d9dde3'); b.box(x + 0.05, x + w - 0.05, Y + 0.95, Y + 1.35, z0 + 0.05, z1 - 0.2, '#78b8f0'); break;
        case 'rack': b.box(x, x + w, Y, Y + 2.15, z0, z1, '#1a1f26'); for (let yy = Y + 0.15; yy < Y + 2.1; yy += 0.13) for (let i = 0; i < 4; i++) { const cc = ['#36f08a', '#46c8e0', '#ffb347'][Math.floor(r() * 3)]; E(x + 0.1 + i * 0.05, x + 0.125 + i * 0.05, yy, yy + 0.025, cc); } break;
        case 'bench': b.box(x, x + w, Y + 0.85, Y + 0.91, z0, z1, '#c9d3d9'); b.box(x + 0.06, x + 0.12, Y, Y + 0.85, z0, z1 - 0.05, '#8796a0'); b.box(x + w - 0.12, x + w - 0.06, Y, Y + 0.85, z0, z1 - 0.05, '#8796a0'); for (let i = 0; i < 4; i++) { const bx = x + 0.2 + i * 0.35; em.quad([bx, Y + 0.91, z1 - 0.15], [bx + 0.1, Y + 0.91, z1 - 0.15], [bx + 0.1, Y + 1.08, z1 - 0.15], [bx, Y + 1.08, z1 - 0.15], col(['#7fe0e6', '#b07fff', '#7fff9f', '#ffd36b'][i])); } break;
        case 'tank': b.box(x + 0.05, x + w - 0.05, Y, Y + 0.08, z0, z1, '#5e6b74'); b.box(x + 0.05, x + w - 0.05, Y + 1.65, Y + 1.75, z0, z1, '#5e6b74'); E(x + 0.1, x + w - 0.1, Y + 0.1, Y + 1.15, '#2fbfa8'); break;
        case 'locker': { const n = 3, lw = w / n; for (let i = 0; i < n; i++) b.box(x + i * lw + 0.01, x + (i + 1) * lw - 0.01, Y, Y + 1.9, z0, z1 - 0.12, '#4f5a64'); break; }
        case 'monitors': b.box(x, x + w, Y, Y + 0.8, z0, z1, '#1b1e23'); b.box(x, x + w, Y + 0.85, Y + 2.0, z0, z0 + 0.15, '#0d1116'); for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) em.quad([x + 0.05 + j * 0.52, Y + 0.9 + i * 0.55, z0 + 0.155], [x + 0.53 + j * 0.52, Y + 0.9 + i * 0.55, z0 + 0.155], [x + 0.53 + j * 0.52, Y + 1.38 + i * 0.55, z0 + 0.155], [x + 0.05 + j * 0.52, Y + 1.38 + i * 0.55, z0 + 0.155], col('#3d6a4f')); break;
        case 'crates': b.box(x, x + w * 0.55, Y, Y + 0.6, z0, z1, '#6a5233'); b.box(x + w * 0.5, x + w, Y, Y + 0.75, z0, z1 - 0.05, '#5e4a2e'); b.box(x + w * 0.15, x + w * 0.6, Y + 0.6, Y + 1.1, z0, z1 - 0.1, '#755b38'); break;
        case 'equip': b.box(x, x + w, Y, Y + 1.6, z0, z1, '#20252b'); for (let i = 0; i < 5; i++) E(x + w - 0.14, x + w - 0.1, Y + 0.2 + i * 0.3, Y + 0.24 + i * 0.3, r() < 0.5 ? '#ff5040' : '#36f08a'); break;
        case 'target': b.box(x + 0.33, x + 0.37, Y, Y + 0.9, z0, z0 + 0.05, '#3a3226'); b.box(x + 0.1, x + w - 0.1, Y + 0.9, Y + 1.5, z0, z0 + 0.03, '#e8e0cc'); b.box(x + 0.22, x + w - 0.22, Y + 1.5, Y + 1.75, z0, z0 + 0.03, '#e8e0cc'); break;
        default: break;
      }
      x += w + 0.25 + r() * 0.9;
    }
  }

  bake(f) {
    const fd = this.floors[f]; if (!fd) return;
    const pos = fd.geo.attributes.position.array, colr = fd.geo.attributes.color.array, base = fd.geo.userData.base;
    for (let i = 0; i < pos.length; i += 3) {
      const k = lampLight(this.game, f, pos[i], pos[i + 1], pos[i + 2]);
      colr[i] = base[i] * k; colr[i + 1] = base[i + 1] * k; colr[i + 2] = base[i + 2] * k;
    }
    fd.geo.attributes.color.needsUpdate = true;
  }

  box(w, h, d, color, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || new THREE.MeshLambertMaterial({ color }));
    return m;
  }
  textPlane(text, w, h, { bg = '#000', fg = '#fff', size = 120, font = '800' } = {}) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = `${font} ${size}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  }

  buildDoor(fd, d) {
    const L = level(fd.f);
    const grp = new THREE.Group(); grp.position.set(d.x, L, ZB + 0.02); fd.grp.add(grp);
    const frame = this.box(1.28, 2.5, 0.08, '#1a1d23'); frame.position.y = 1.25; grp.add(frame);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.38), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })); glow.position.set(0, 1.19, 0.045); glow.visible = false; grp.add(glow);
    const doc = d.kind === 'doc';
    const panelMat = new THREE.MeshLambertMaterial({ color: doc ? 0xc4313d : 0x3d4b5e, emissive: doc ? 0x3a0508 : 0x000000 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.38, 0.06), panelMat); panel.position.set(0, 1.19, 0.07); grp.add(panel);
    const knob = this.box(0.12, 0.05, 0.06, '#d7dde6'); knob.position.set(0.38, 1.05, 0.12); panel.add(knob); knob.position.set(0.38, -0.14, 0.05);
    let icon = null;
    if (doc) {
      icon = this.textPlane('書類', 0.5, 0.5, { bg: '#fff4e6', fg: '#c4313d', size: 170 }); icon.position.set(0, 0.45, 0.035); panel.add(icon);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 3), new THREE.MeshBasicMaterial({ color: 0xff5a5a })); flag.rotation.z = Math.PI; flag.position.set(0, 2.72, 0.05); grp.add(flag);
      d._flag = flag;
    }
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xffcc33 })); warn.position.set(0, 2.75, 0.06); warn.visible = false; grp.add(warn);
    const o = { d, grp, panel, panelMat, glow, icon, warn };
    fd.doors.push(o);
    if (doc) this.interact.push({ mesh: panel, kind: 'door', door: d, floor: fd.f });
  }

  buildLamp(fd, l) {
    const L = level(fd.f);
    const grp = new THREE.Group(); grp.position.set(l.x, L + 2.3, 0); fd.grp.add(grp);
    const wire = this.box(0.02, 0.7, 0.02, '#333a44'); wire.position.y = 0.35 + 0.25; grp.add(wire);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.25, 16, 1, true), this.mats.lampShade); shade.position.y = 0.12; grp.add(shade);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), this.mats.lampOn); bulb.rotation.x = Math.PI / 2; bulb.position.y = 0.005; grp.add(bulb);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.2, 24, 1, true), this.mats.cone); cone.position.y = -1.1; grp.add(cone);
    const o = { l, grp, bulb, wire, shade, cone, hitR: 0.32 };
    fd.lamps.push(o); this.lampMeshes.push(o);
  }

  buildCover(fd, c) {
    const L = level(fd.f); const th = this.th;
    const color = th.cover === 'desk' ? '#4a3222' : th.cover === 'cabinet' ? '#7f8d97' : th.cover === 'barricade' ? '#3b3f37' : '#7a5a36';
    const m = this.box(c.w, c.h, 2.2, color); m.position.set(c.x, L + c.h / 2, 0.6); fd.grp.add(m);
    if (th.cover === 'barricade') { const s = this.box(c.w + 0.01, 0.12, 2.21, '#d9b23a'); s.position.set(c.x, L + c.h - 0.08, 0.6); fd.grp.add(s); }
    fd.covers.push({ c, mesh: m, box: new THREE.Box3(new THREE.Vector3(c.x - c.w / 2, L, -0.5), new THREE.Vector3(c.x + c.w / 2, L + c.h, 1.7)) });
  }

  buildEscalator(fd, e) {
    const L = level(fd.f);
    const ax = e.xBot, bx = e.xTop;
    const len = Math.hypot(bx - ax, FLOOR_H);
    const ang = Math.atan2(FLOOR_H, bx - ax);
    const grp = new THREE.Group(); grp.position.set((ax + bx) / 2, L + FLOOR_H / 2, (ESC_Z0 + ESC_Z1) / 2); fd.grp.add(grp);
    const ramp = this.box(len, 0.35, ESC_Z1 - ESC_Z0, '#3a404a'); ramp.rotation.z = ang; ramp.position.y = -0.18; grp.add(ramp);
    const stepsTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#6f7886'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#3d434d'; for (let i = 0; i < 256; i += 16) g.fillRect(i, 0, 3, 32); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 2, 1); return t; })();
    const top = new THREE.Mesh(new THREE.PlaneGeometry(len, ESC_Z1 - ESC_Z0), new THREE.MeshBasicMaterial({ map: stepsTex, color: 0xb0b8c4 }));
    top.rotation.set(-Math.PI / 2, 0, 0); const holder = new THREE.Group(); holder.rotation.z = ang; holder.add(top); top.position.y = 0.001; grp.add(holder);
    for (const z of [-(ESC_Z1 - ESC_Z0) / 2, (ESC_Z1 - ESC_Z0) / 2]) {
      const rail = this.box(len, 0.06, 0.06, '#15171c'); rail.position.set(0, 0.95, z); holder.add(rail);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), this.mats.glass); glass.position.set(0, 0.47, z); holder.add(glass);
    }
    fd.escTex = fd.escTex || []; fd.escTex.push({ tex: stepsTex, dir: Math.sign(bx - ax) });
    // 乗り口の目印（光る床）と、上の階の穴を囲む手すり
    for (const [x, y, dir] of [[ax, L, 1], [bx, L + FLOOR_H, -1]]) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.9, ESC_Z1 - ESC_Z0), new THREE.MeshBasicMaterial({ color: 0x46c8e0, transparent: true, opacity: 0.55 }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(x + (dir > 0 ? -0.45 : 0.45) * Math.sign(bx - ax), y + 0.01, (ESC_Z0 + ESC_Z1) / 2); this.root.add(pad);
      const sign = this.textPlane(y === L ? '上り ▲' : '下り ▼', 0.7, 0.24, { bg: '#0c2e38', fg: '#bff4ff', size: 110 });
      sign.position.set(x, y + 1.7, ESC_Z0 - 0.03); sign.rotation.y = Math.PI; this.root.add(sign);
      this.interact.push({ mesh: sign, kind: 'esc', esc: e, floor: y === L ? fd.f : fd.f + 1, dir: y === L ? 1 : -1 });
      this.interact.push({ mesh: pad, kind: 'esc', esc: e, floor: y === L ? fd.f : fd.f + 1, dir: y === L ? 1 : -1 });
    }
    const xa = ax + (bx - ax) * 0.3;
    const guard = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(bx - xa), 1.0), this.mats.glass);
    guard.position.set((xa + bx) / 2, L + FLOOR_H + 0.5, ESC_Z0 - 0.02); this.root.add(guard);
    const guardRail = this.box(Math.abs(bx - xa), 0.05, 0.05, '#15171c'); guardRail.position.set((xa + bx) / 2, L + FLOOR_H + 1.0, ESC_Z0 - 0.02); this.root.add(guardRail);
  }

  buildLanding(fd, c) {
    const L = level(fd.f);
    // 乗り場の枠と呼び出しボタン（両側）、穴の縁のレーザー柵（VR だけ。かごが居ない時に表示）
    for (const side of [-1, 1]) {
      const post = this.box(0.14, 2.6, 0.2, '#3a4250'); post.position.set(c.x + side * (CAR_W / 2 + 0.07), L + 1.3, ZB + 0.1); fd.grp.add(post);
      const btnBase = this.box(0.16, 0.26, 0.04, '#1b1f27'); btnBase.position.set(c.x + side * (CAR_W / 2 + 0.45), L + 1.2, ZB + 0.03); fd.grp.add(btnBase);
      const btn = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: c.auto ? 0x46c8e0 : 0xffd36b }));
      btn.position.set(c.x + side * (CAR_W / 2 + 0.45), L + 1.2, ZB + 0.055); fd.grp.add(btn);
      if (!c.auto) this.interact.push({ mesh: btnBase, kind: 'call', car: c.id, floor: fd.f });
      const laser = new THREE.Group();
      for (const h of [0.35, 0.75, 1.15]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, ZF - ZB), this.mats.laser); beam.position.set(0, h, 0); laser.add(beam); }
      laser.position.set(c.x + side * (CAR_W / 2 + 0.01), L, 0);
      fd.grp.add(laser); fd.lasers.push({ car: c, laser });
    }
    const header = this.box(CAR_W + 0.3, 0.14, 0.2, '#3a4250'); header.position.set(c.x, L + 2.55, ZB + 0.1); fd.grp.add(header);
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.13), new THREE.MeshBasicMaterial({ color: 0xff6a5a })); ind.position.set(c.x, L + 2.75, ZB + 0.03); fd.grp.add(ind);
    fd.lasers[fd.lasers.length - 1].ind = ind;
  }

  buildCar(c) {
    const grp = new THREE.Group(); this.root.add(grp);
    const metal = new THREE.MeshLambertMaterial({ color: 0x7d8696 });
    const inner = new THREE.MeshLambertMaterial({ color: 0xa79c80, emissive: 0x2a2416 });
    const w = CAR_W - 0.04, d = ZF - ZB - 0.1;
    const floor = this.box(w, 0.1, d, null, metal); floor.position.y = -0.05; grp.add(floor);
    const roof = this.box(w, 0.12, d, null, metal); roof.position.y = FLOOR_H - 0.06; grp.add(roof);
    const ceilingLight = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff0d0 })); ceilingLight.rotation.x = Math.PI / 2; ceilingLight.position.y = 2.55; grp.add(ceilingLight);
    for (const z of [ZB + 0.06, ZF - 0.06]) { const wall = this.box(w, 2.6, 0.06, null, inner); wall.position.set(0, 1.3, z); grp.add(wall); }
    const rail = this.box(w - 0.1, 0.04, 0.04, '#c7ced8'); rail.position.set(0, 0.95, ZB + 0.15); grp.add(rail);
    // 操作盤（奥の壁）
    const panel = this.box(0.3, 0.55, 0.04, '#20242c'); panel.position.set(0.45, 1.3, ZB + 0.12); grp.add(panel);
    const up = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: 0xffd36b })); up.position.set(0.45, 1.44, ZB + 0.145); grp.add(up);
    const dn = up.clone(); dn.material = up.material.clone(); dn.position.y = 1.16; grp.add(dn);
    const upL = this.textPlane('▲', 0.1, 0.1, { bg: '#ffd36b', fg: '#222', size: 300 }); upL.position.set(0.45, 1.44, ZB + 0.15); grp.add(upL);
    const dnL = this.textPlane('▼', 0.1, 0.1, { bg: '#ffd36b', fg: '#222', size: 300 }); dnL.position.set(0.45, 1.16, ZB + 0.15); grp.add(dnL);
    this.interact.push({ mesh: upL, kind: 'carBtn', car: c.id, dir: 1 }, { mesh: dnL, kind: 'carBtn', car: c.id, dir: -1 });
    const disp = this.textPlane('--', 0.3, 0.16, { bg: '#0a0c10', fg: '#7fffb0', size: 200 }); disp.position.set(0.45, 1.68, ZB + 0.15); grp.add(disp);
    // 扉（左右）。開くと z 方向へ引き込む
    const doors = [];
    for (const side of [-1, 1]) for (const zs of [-1, 1]) {
      const leaf = this.box(0.05, 2.5, d / 2, null, metal); leaf.userData = { side, zs };
      grp.add(leaf); doors.push(leaf);
    }
    const autoLamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0x46c8e0 })); autoLamp.position.set(0, FLOOR_H + 0.02, 0); autoLamp.visible = !!c.auto; grp.add(autoLamp);
    this.cars.push({ c, grp, doors, disp, autoLamp, lastFloor: null, d });
  }

  buildRoof() {
    const g = this.game; const top = level(g.stage.floors) + FLOOR_H;
    const roof = this.box(W + 1.2, 0.4, ZF - ZB + 1.2, '#2a2f38'); roof.position.set(W / 2, top + 0.2, 0); this.root.add(roof);
    // 外壁（ビルの外から見たとき用。中からは見えない）
    const shell = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, top + 1, ZF - ZB + 0.6), new THREE.MeshBasicMaterial({ color: 0x14171d, side: THREE.BackSide }));
    shell.position.set(W / 2, (top - 1) / 2, 0); shell.visible = false; this.root.add(shell);
  }

  visibleAround(f, force) {
    if (this.visFloor === f && !force) return;
    this.visFloor = f;
    for (const [k, fd] of Object.entries(this.floors)) fd.grp.visible = Math.abs(Number(k) - f) <= 2;
  }

  // 毎フレーム: かご・ドア・照明・レーザー柵の見た目をゲームの状態に合わせる
  update(dt, t) {
    const g = this.game;
    this.visibleAround(g.playerFloor);
    for (const k of Object.keys(this.floors)) {
      const fd = this.floors[k];
      if (!fd.grp.visible) continue;
      for (const o of fd.doors) {
        const d = o.d;
        if (d.kind === 'doc') {
          o.panelMat.color.set(d.collected ? 0x1f4650 : 0xc4313d); o.panelMat.emissive.set(d.collected ? 0x000000 : 0x3a0508);
          if (o.icon) o.icon.visible = !d.collected;
          if (d._flag) { d._flag.visible = !d.collected; d._flag.material.color.setHSL(0, 0.9, 0.55 + 0.15 * Math.sin(t * 4)); }
        } else {
          const tele = d.tele > 0 ? 1 - d.tele / g.D.spawnTele : 0;
          const open = Math.max(tele * 0.3, d.open > 0 ? Math.min(1, d.open * 2) * 0.95 : 0);
          o.panel.position.x = -open * 1.1; o.glow.visible = open > 0.01;
          o.warn.visible = d.tele > 0 && Math.sin(t * 24) > 0;
        }
      }
      for (const o of fd.lamps) {
        const l = o.l;
        o.cone.visible = l.state === 'on';
        if (l.state === 'on') { o.grp.position.y = level(fd.f) + 2.3; o.bulb.material = this.mats.lampOn; o.grp.visible = true; o.wire.visible = true; }
        else if (l.state === 'falling') { o.grp.position.y = level(fd.f) + l.fy; o.wire.visible = false; o.bulb.material = this.mats.lampOff; }
        else { o.grp.position.y = level(fd.f) + 0.02; o.grp.rotation.z = 1.2; o.wire.visible = false; o.bulb.material = this.mats.lampOff; }
        if (l._baked !== l.state) { const changed = l._baked != null; l._baked = l.state; if (changed && l.state !== 'on') this.bake(fd.f); }
      }
      for (const o of fd.lasers) {
        const L = level(fd.f);
        const here = Math.abs(o.car.y - L) < 0.02 && o.car.state === 'stopped';
        o.laser.visible = !here;
        if (o.ind) o.ind.material.color.set(here ? 0x7fffb0 : 0xff6a5a);
      }
      if (fd.escTex) for (const e of fd.escTex) e.tex.offset.x = (t * 0.5 * e.dir) % 1;
      if (fd.exitSign) fd.exitSign.material.color.set(g.docsGot >= g.docTotal ? 0xffffff : 0x556055);
    }
    for (const o of this.cars) {
      const c = o.c;
      o.grp.position.set(c.x, c.y, 0);
      o.grp.visible = Math.abs(c.y - g.player.y) < 3 * FLOOR_H;
      for (const leaf of o.doors) {
        const { side, zs } = leaf.userData;
        const open = c.doors;
        leaf.position.set(side * (CAR_W / 2 - 0.03), 1.25, zs * (o.d / 4 + open * o.d / 4 * 0.9));
        leaf.scale.z = 1 - open * 0.85;
      }
      const fl = Math.round(c.y / FLOOR_H) + 1;
      if (fl !== o.lastFloor) { o.lastFloor = fl; this.setText(o.disp, String(fl)); }
    }
  }
  setText(mesh, text) {
    const t = mesh.material.map; const c = t.image; const g = c.getContext('2d');
    g.fillStyle = '#0a0c10'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#7fffb0'; g.font = '800 200px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 6); t.needsUpdate = true;
  }
}
