// 3D の描画（three.js）。通常 3D と VR で同じ世界を使い、視点と入力だけを切り替える。
// 土のセルは 1 つの InstancedMesh（1 セル = 1 個）で描き、掘られたセルだけ行列を 0 にする（全体を作り直さない）。
// 照明は焼き込みを使わず、半球光＋ヘッドランプ＋足元の補助光（掘った後の壁でも照明が食い違わない）。
import * as THREE from 'three';
import { TUNE3D as T, RULES } from './config.js';
import { THEMES } from './stages.js';
import { cellCenter, isOpen } from './game3d.js';
import { inflateAmount, inflateRecovering } from './rules.js';
import { makeChaser, makeFire, poseEnemy, makeRock, makeNozzle } from './models3d.js';

const C = T.cell, H = T.height;

// ---------- 地層の質感（キャンバスで生成。表示面積に合わせた解像度） ----------
function makeTex(theme, size, kind) {
  const th = THEMES[theme];
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const h = document.createElement('canvas'); h.width = h.height = size; const y = h.getContext('2d'); // 高さ（凹凸用）
  let seed = (theme.length * 977 + (kind === 'floor' ? 31 : 7));
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bands = th.bands;
  if (kind === 'wall') {
    // 横縞の地層（壁の高さ 2.7m の中に 4 層）
    for (let i = 0; i < 4; i++) {
      const y0 = i * size / 4;
      const gr = x.createLinearGradient(0, y0, 0, y0 + size / 4); gr.addColorStop(0, shadeHex(bands[i], 0.1)); gr.addColorStop(1, shadeHex(bands[i], -0.08));
      x.fillStyle = gr; x.fillRect(0, y0, size, size / 4 + 1);
    }
  } else { x.fillStyle = shadeHex(bands[kind === 'floor' ? 2 : 3], kind === 'floor' ? -0.1 : -0.25); x.fillRect(0, 0, size, size); }
  y.fillStyle = '#808080'; y.fillRect(0, 0, size, size);
  // 粒
  const n = size * size / 90;
  for (let i = 0; i < n; i++) {
    const px = rnd() * size, py = rnd() * size, r = (0.5 + rnd() * 1.6) * size / 512;
    const lite = rnd() < 0.5;
    x.fillStyle = lite ? 'rgba(255,240,220,0.09)' : 'rgba(0,0,0,0.12)'; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    y.fillStyle = lite ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'; y.beginPath(); y.arc(px, py, r, 0, 7); y.fill();
  }
  // 小石・結晶・溶岩の筋
  const m = size / 40;
  for (let i = 0; i < m; i++) {
    const px = rnd() * size, py = rnd() * size, r = (2.5 + rnd() * 5) * size / 512;
    if (theme === 'volcano' && rnd() < 0.5) {
      x.strokeStyle = 'rgba(255,120,40,0.75)'; x.lineWidth = size / 400; x.beginPath(); x.moveTo(px, py);
      let qx = px, qy = py; for (let k = 0; k < 5; k++) { qx += (rnd() - 0.4) * r * 3; qy += (rnd() - 0.5) * r * 2; x.lineTo(qx, qy); } x.stroke();
      continue;
    }
    const gr = x.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
    gr.addColorStop(0, theme === 'crystal' ? '#a8b4ff' : '#b8ab98'); gr.addColorStop(1, theme === 'crystal' ? '#3a3a7a' : '#4a3e30');
    x.fillStyle = gr; x.beginPath(); x.ellipse(px, py, r, r * 0.75, rnd() * 3, 0, 7); x.fill();
    y.fillStyle = '#e0e0e0'; y.beginPath(); y.ellipse(px, py, r, r * 0.75, 0, 0, 7); y.fill();
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(h); bump.anisotropy = 8;
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  let emissiveMap = null;
  if (theme === 'volcano') { // 溶岩の筋だけ光らせる
    const e = document.createElement('canvas'); e.width = e.height = size; const ex = e.getContext('2d');
    ex.drawImage(c, 0, 0); const d = ex.getImageData(0, 0, size, size);
    for (let i = 0; i < d.data.length; i += 4) { const hot = d.data[i] > 200 && d.data[i + 1] < 160; d.data[i] = hot ? 255 : 0; d.data[i + 1] = hot ? 110 : 0; d.data[i + 2] = hot ? 30 : 0; }
    ex.putImageData(d, 0, 0); emissiveMap = new THREE.CanvasTexture(e); emissiveMap.colorSpace = THREE.SRGBColorSpace; emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  }
  return { map, bump, emissiveMap };
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); if (k >= 0) c.lerp(new THREE.Color(1, 1, 1), k); else c.multiplyScalar(1 + k); return '#' + c.getHexString(); }

// 土のセル: 側面を少し波打たせた箱（辺は動かさないので隣のセルと隙間ができない）
function wallGeometry() {
  const g = new THREE.BoxGeometry(C, H, C, 6, 6, 6);
  const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ex = Math.abs(Math.abs(v.x) - C / 2) < 1e-3, ez = Math.abs(Math.abs(v.z) - C / 2) < 1e-3;
    const edge = (ex && ez) || Math.abs(Math.abs(v.y) - H / 2) < 1e-3;
    if (edge) continue;
    const n = Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7 - v.y * 1.9) * 0.09 + Math.sin(v.y * 7 + v.x * 5 + v.z * 3) * 0.03;
    if (ex) v.x += Math.sign(v.x) * n; if (ez) v.z += Math.sign(v.z) * n;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // UV を実寸に合わせる（1 枚 = 2.4m 幅 × 2.7m 高）
  g.computeVertexNormals();
  return g;
}

export function createWorld3D(renderer, { quality = 'high' } = {}) {
  const scene = new THREE.Scene();
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  rig.add(camera);
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x3a2414, 0.75); scene.add(hemi);
  const lamp = new THREE.SpotLight(0xfff4d6, 26, 22, 0.75, 0.55, 1.6); camera.add(lamp); lamp.position.set(0.1, 0.05, 0); lamp.target.position.set(0, -0.15, -1); camera.add(lamp.target);
  const fill = new THREE.PointLight(0xffd9a0, 6, 9, 1.6); camera.add(fill); fill.position.set(0, -0.6, 0.2);
  const texSize = quality === 'high' ? 2048 : 1024;

  let built = null; // 面ごとの物
  const enemyObjs = new Map();
  const rockObjs = new Map();
  const nozzle = makeNozzle();
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0xff6b4a, roughness: 0.5, emissive: 0x401008 });
  let hose = null;
  // 照準: 点（掘る=琥珀、ポンプ=ミント）とひび割れ
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 32), new THREE.MeshBasicMaterial({ color: 0xffc93c, depthTest: false, transparent: true }));
  reticle.renderOrder = 10; scene.add(reticle);
  const crackTex = makeCrackTex();
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(C * 0.9, H * 0.85), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  crack.visible = false; scene.add(crack);
  const highlight = new THREE.Mesh(new THREE.BoxGeometry(C * 1.01, H * 1.002, C * 1.01), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.18, depthWrite: false }));
  highlight.visible = false; scene.add(highlight);
  // 破片・粉じん（使い回しの小さな板）
  const PN = 260;
  const partGeo = new THREE.TetrahedronGeometry(0.06, 0);
  const parts = new THREE.InstancedMesh(partGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), PN);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parts.frustumCulled = false; scene.add(parts);
  const PART = []; for (let i = 0; i < PN; i++) PART.push({ life: 0, t: 0, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, s: 1, c: new THREE.Color() });
  let pHead = 0;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler();
  function spawn(x, y, z, n, color, speed = 2.5, up = 2.5, size = 1, life = 0.9) {
    for (let i = 0; i < n; i++) {
      const p = PART[pHead]; pHead = (pHead + 1) % PN;
      p.x = x; p.y = y; p.z = z; p.vx = (Math.random() - 0.5) * speed; p.vz = (Math.random() - 0.5) * speed; p.vy = Math.random() * up;
      p.t = 0; p.life = life * (0.6 + Math.random() * 0.6); p.s = size * (0.5 + Math.random()); p.c.set(color);
      parts.setColorAt(PART.indexOf(p), p.c);
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }
  // 床の警告の輪（岩の落ちる場所）
  const warnRings = new Map();
  const ringGeo = new THREE.RingGeometry(0.75, 1.05, 48);
  // 得点の表示
  const popups = new Map();
  // 炎
  const flameObjs = new Map();
  const flameGeo = new THREE.ConeGeometry(0.42, 1, 20, 1, true); flameGeo.translate(0, -0.5, 0); flameGeo.rotateX(-Math.PI / 2);
  // 目印（チュートリアル）
  const target = new THREE.Mesh(new THREE.BoxGeometry(C * 1.02, H * 1.0, C * 1.02), new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.3, depthWrite: false }));
  target.visible = false; scene.add(target);
  // 頭が壁に入ったときの暗転・快適移動のフェード
  const fade = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  fade.renderOrder = 100; camera.add(fade);
  const vignette = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.3, 48), new THREE.MeshBasicMaterial({ map: makeVignetteTex(), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  vignette.position.z = -0.1; vignette.renderOrder = 99; camera.add(vignette);

  function build(g) {
    if (built) disposeBuilt();
    const m = g.map, th = THEMES[m.theme];
    const wallT = makeTex(m.theme, texSize, 'wall'), floorT = makeTex(m.theme, texSize / 2, 'floor'), ceilT = makeTex(m.theme, texSize / 2, 'ceil');
    scene.background = new THREE.Color(shadeHex(th.bands[3], -0.85));
    scene.fog = new THREE.FogExp2(scene.background.getHex(), 0.045);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallT.map, bumpMap: wallT.bump, bumpScale: 2.5, roughness: 0.92, emissiveMap: wallT.emissiveMap, emissive: wallT.emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: wallT.emissiveMap ? 0.9 : 0 });
    const geo = wallGeometry();
    const cells = m.w * m.h;
    const walls = new THREE.InstancedMesh(geo, wallMat, cells);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const i = z * m.w + x; const [cx, cz] = cellCenter(x, z);
      if (!m.solid[i]) { walls.setMatrixAt(i, zero); continue; }
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((x * 7 + z * 13) % 4) * Math.PI / 2);
      walls.setMatrixAt(i, tmpM.compose(tmpV.set(cx, H / 2, cz), tmpQ, tmpS.set(1, 1, 1)));
    }
    walls.instanceMatrix.needsUpdate = true; walls.computeBoundingSphere(); scene.add(walls);
    // 外周の岩盤（掘れない。少し暗い色）
    const border = new THREE.Group();
    const bmat = new THREE.MeshStandardMaterial({ map: wallT.map, bumpMap: wallT.bump, bumpScale: 2, roughness: 0.95, color: 0x777777 });
    for (const [bx, bz, bw, bd] of [[-1, -1, m.w + 2, 1], [-1, m.h, m.w + 2, 1], [-1, 0, 1, m.h], [m.w, 0, 1, m.h]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(bw * C, H, bd * C), bmat); box.position.set((bx + bw / 2) * C, H / 2, (bz + bd / 2) * C); border.add(box);
    }
    scene.add(border);
    // 床と天井
    for (const t of [floorT, ceilT]) { t.map.repeat.set(m.w * C / 3, m.h * C / 3); t.bump.repeat.copy(t.map.repeat); }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(m.w * C, m.h * C), new THREE.MeshStandardMaterial({ map: floorT.map, bumpMap: floorT.bump, bumpScale: 1.5, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(m.w * C / 2, 0, m.h * C / 2); scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(m.w * C, m.h * C), new THREE.MeshStandardMaterial({ map: ceilT.map, bumpMap: ceilT.bump, bumpScale: 1.5, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(m.w * C / 2, H, m.h * C / 2); scene.add(ceil);
    // 支え（木の枠）と結晶の飾り: セルごとの物にして、掘られたら消す
    const perCell = new Map();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.85 });
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9ff4ff, emissive: 0x4fc8ff, emissiveIntensity: 0.7, roughness: 0.15, transparent: true, opacity: 0.92 });
    const crystalMat2 = new THREE.MeshStandardMaterial({ color: 0xd6b8ff, emissive: 0xa070ff, emissiveIntensity: 0.6, roughness: 0.15 });
    const octGeo = new THREE.OctahedronGeometry(0.16, 0);
    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const i = z * m.w + x; if (!m.solid[i]) continue;
      const grp = new THREE.Group(); const [cx, cz] = cellCenter(x, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isOpen(m, x + dx, z + dz)) continue;
        const fx = cx + dx * C / 2, fz = cz + dz * C / 2; const rotY = Math.atan2(dx, dz);
        if (m.support[i]) {
          // 木の支え: 2 本の柱と梁（開いている面ごと）
          const f = new THREE.Group(); f.position.set(fx + dx * 0.12, 0, fz + dz * 0.12); f.rotation.y = rotY;
          for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), wood); post.position.set(s * 0.85, H / 2, 0); f.add(post); }
          const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.26), woodDark); beam.position.y = H - 0.2; f.add(beam);
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), woodDark); brace.position.set(0, H / 2, 0.02); brace.rotation.z = 0.62; f.add(brace);
          grp.add(f);
        } else if (m.theme === 'crystal' && ((x * 31 + z * 17 + dx * 5 + dz * 3) % 3 === 0)) {
          for (let k = 0; k < 3; k++) {
            const c = new THREE.Mesh(octGeo, k % 2 ? crystalMat2 : crystalMat);
            const off = ((k - 1) * 0.35); const hy = 0.5 + ((x + z + k) % 4) * 0.45;
            c.position.set(fx + dz * off + dx * 0.02, hy, fz + dx * off + dz * 0.02);
            c.scale.set(0.7, 1.6 + k * 0.3, 0.7); c.rotation.set(dz * 0.6, 0, -dx * 0.6 + (k - 1) * 0.3);
            grp.add(c);
          }
        }
      }
      if (grp.children.length) { scene.add(grp); perCell.set(i, grp); }
    }
    // 結晶の地層は光が足りないので、坑道に淡い色の光を少し
    hemi.color.set(m.theme === 'crystal' ? 0xdfe6ff : m.theme === 'volcano' ? 0xffe0c8 : 0xfff1dc);
    built = { walls, floor, ceil, border, perCell, wallMat, version: m.version, changedN: 0, mats: [wallMat], texs: [wallT, floorT, ceilT] };
    // 敵・岩
    for (const o of enemyObjs.values()) scene.remove(o); enemyObjs.clear();
    for (const o of rockObjs.values()) scene.remove(o); rockObjs.clear();
    for (const o of warnRings.values()) scene.remove(o); warnRings.clear();
    for (const e of g.enemies) { const o = e.type === 'chaser' ? makeChaser() : makeFire(); scene.add(o); enemyObjs.set(e, o); }
    for (const r of g.rocks) { const o = makeRock(m.theme); scene.add(o); rockObjs.set(r, o); }
  }
  function disposeBuilt() {
    scene.remove(built.walls, built.floor, built.ceil, built.border);
    for (const grp of built.perCell.values()) scene.remove(grp);
    for (const t of built.texs) for (const k of ['map', 'bump', 'emissiveMap']) if (t[k]) t[k].dispose();
    built.walls.geometry.dispose();
    built = null;
  }
  function syncTerrain(g) {
    const m = g.map;
    if (built.changedN === m.changed.length) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (; built.changedN < m.changed.length; built.changedN++) {
      const i = m.changed[built.changedN];
      built.walls.setMatrixAt(i, zero);
      const grp = built.perCell.get(i); if (grp) { scene.remove(grp); built.perCell.delete(i); }
      // 隣のセルに新しく見える面ができたら、支えの枠・結晶を作り直す（そのセルだけ）
      const x = i % m.w, z = (i / m.w) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (z + dz) * m.w + (x + dx);
        if (x + dx < 0 || z + dz < 0 || x + dx >= m.w || z + dz >= m.h || !m.solid[j] || !m.support[j]) continue;
        const old = built.perCell.get(j); if (old) scene.remove(old);
        const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
        const f = new THREE.Group(); const [cx, cz] = cellCenter(x + dx, z + dz);
        const ox = -dx, oz = -dz; f.position.set(cx + ox * (C / 2 + 0.12), 0, cz + oz * (C / 2 + 0.12)); f.rotation.y = Math.atan2(ox, oz);
        for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), wood); post.position.set(s * 0.85, H / 2, 0); f.add(post); }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.26), wood); beam.position.y = H - 0.2; f.add(beam);
        const grp2 = old || new THREE.Group(); grp2.add(f); scene.add(grp2); built.perCell.set(j, grp2);
      }
    }
    built.walls.instanceMatrix.needsUpdate = true;
  }

  // ---------- 毎フレーム ----------
  // view: { aimO: Vector3, aimD: Vector3, handPos?: Vector3（ホースの根元）, vr: bool }
  function update(g, alpha, t, dt, view) {
    if (!built || built.mapRef !== g.map) { build(g); built.mapRef = g.map; }
    syncTerrain(g);
    const L = (a, b) => a + (b - a) * alpha;
    // 敵
    const P = g.player;
    for (const e of g.enemies) {
      const o = enemyObjs.get(e); if (!o) continue;
      const amt = inflateAmount(e.inf, g.diff.pumpsToPop), rec = inflateRecovering(e.inf);
      const popT = e.state === 'pop' ? e.t : 0;
      o.visible = !(e.state === 'pop' && popT > 0.08);
      if (e.state === 'crushed') { o.visible = e.t < 1.2; o.scale.set(1.3, 0.2, 1.3); o.position.set(e.x, 0, e.z); continue; }
      o.scale.set(1, 1, 1);
      const gy = e.state === 'ghost' ? 0.35 + Math.sin(t * 3 + e.id) * 0.15 : 0;
      o.position.set(L(e.px, e.x), gy, L(e.pz, e.z));
      // 体は主人公の方を見る（歩くときは進行方向）
      const toP = Math.atan2(P.x - e.x, P.z - e.z);
      const want = e.state === 'walk' ? e.yaw : e.state === 'charge' || e.state === 'breath' ? e.yaw : toP;
      let d = want - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += d * Math.min(1, dt * 8);
      const local = Math.atan2(Math.sin(toP - o.rotation.y), Math.cos(toP - o.rotation.y));
      poseEnemy(o, e, amt, rec, t, [Math.max(-1, Math.min(1, local)), 0]);
      // 目立たせる: 膨張中は白く光る縁
    }
    // 岩
    for (const r of g.rocks) {
      const o = rockObjs.get(r); if (!o) continue;
      o.visible = r.state !== 'gone';
      const shake = r.state === 'loose' ? Math.sin(t * 45) * 0.06 * Math.min(1, r.t * 3) : 0;
      o.position.set(r.x + shake, r.y, r.z + shake * 0.5);
      if (r.state === 'landed') { const k = r.t / 0.9; o.scale.setScalar(1 - k * 0.5); o.position.y = r.y - k * 0.5; o.rotation.z = k; }
      else o.scale.setScalar(1);
      // 床の警告の輪
      let ring = warnRings.get(r);
      const show = r.state === 'loose' || r.state === 'fall';
      if (show && !ring) { ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.8, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(r.x, 0.03, r.z); scene.add(ring); warnRings.set(r, ring); }
      if (ring) { ring.visible = show; ring.material.opacity = 0.5 + 0.4 * Math.sin(t * 18); ring.scale.setScalar(1 + 0.08 * Math.sin(t * 18)); }
      if (r.state === 'loose' && Math.random() < 0.5) spawn(r.x + (Math.random() - 0.5) * 1.2, H - 0.3, r.z + (Math.random() - 0.5) * 1.2, 1, THEMES[g.map.theme].bands[0], 0.2, 0, 0.6, 1.2);
    }
    // 炎
    const live = new Set();
    for (const f of g.fires) {
      live.add(f);
      let o = flameObjs.get(f);
      if (!o) {
        o = new THREE.Group();
        for (const [col, s] of [[0xff5a1e, 1], [0xffaa28, 0.7], [0xfff0b4, 0.4]]) { const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.scale.set(s, s, 1); o.add(m); }
        const light = new THREE.PointLight(0xff8a3a, 12, 8, 1.5); o.add(light);
        scene.add(o); flameObjs.set(f, o);
      }
      const [ox, oz] = cellCenter(f.gx, f.gz);
      o.position.set(ox + f.dir[0] * 0.6, 0.5, oz + f.dir[1] * 0.6);
      o.rotation.y = Math.atan2(f.dir[0], f.dir[1]) + Math.PI;
      const len = Math.max(0.05, f.reach * C - 0.4);
      o.children.forEach((m, i) => { if (m.isMesh) { m.scale.z = len * (1 + 0.06 * Math.sin(t * 40 + i)); m.scale.x = m.scale.y = (i ? 0.7 / i : 1) * (1 + 0.1 * Math.sin(t * 33 + i * 2)); } });
      o.children[3].position.set(0, 0, -len / 2);
    }
    for (const [f, o] of flameObjs) if (!live.has(f)) { scene.remove(o); flameObjs.delete(f); }
    // 効果（破裂・掘削の破片・着地の粉じん）
    for (const f of g.fx) if (!f.spawned) {
      f.spawned = true;
      if (f.kind === 'pop') { spawn(f.x, f.y, f.z, 40, f.type === 'fire' ? 0xffb347 : 0x7dffd0, 5, 4, 1.4, 0.9); spawn(f.x, f.y, f.z, 20, 0xffffff, 4, 3, 1, 0.6); }
      if (f.kind === 'debris') spawn(f.x, f.y, f.z, 30, THEMES[g.map.theme].bands[1], 3, 2.5, 1.6, 1.1);
      if (f.kind === 'dust') spawn(f.x, f.y + 0.2, f.z, 40, THEMES[g.map.theme].bands[0], 4, 1.2, 1.2, 1.2);
    }
    if (g.dig && Math.random() < 0.5) { const p = g.dig.point; spawn(p[0], p[1], p[2], 1, THEMES[g.map.theme].bands[0], 1.5, 1.5, 0.8, 0.5); }
    for (let i = 0; i < PN; i++) {
      const p = PART[i];
      if (p.t >= p.life) { tmpM.makeScale(0, 0, 0); parts.setMatrixAt(i, tmpM); continue; }
      p.t += dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y = Math.max(0.02, p.y + p.vy * dt); p.z += p.vz * dt;
      if (p.y <= 0.02) { p.vx *= 0.8; p.vz *= 0.8; p.vy = 0; }
      const s = p.s * (1 - p.t / p.life);
      tmpE.set(p.t * 7 + i, p.t * 5, 0); tmpQ.setFromEuler(tmpE);
      parts.setMatrixAt(i, tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s)));
    }
    parts.instanceMatrix.needsUpdate = true;
    // 得点の表示（板の文字。カメラの方を向く）
    const liveP = new Set();
    for (const p of g.popups) {
      liveP.add(p);
      let s = popups.get(p);
      if (!s) { s = textSprite(p.text, p.big ? '#ffe66b' : '#ffffff'); scene.add(s); popups.set(p, s); }
      s.position.set(p.x, p.y + p.t * 0.6, p.z); s.material.opacity = Math.min(1, (1.4 - p.t) * 2);
      const sc = p.big ? 1.2 : 0.8; s.scale.set(sc * s.userData.aspect, sc, 1);
    }
    for (const [p, s] of popups) if (!liveP.has(p)) { scene.remove(s); s.material.map.dispose(); popups.delete(p); }
    // 照準
    const aim = g.aim;
    reticle.visible = false; crack.visible = false; highlight.visible = false;
    if (aim && g.phase === 'play') {
      const kind = g.act === 'dig' ? 'dig' : g.act === 'pump' ? 'pump' : aim.kind;
      let pt = null;
      if (aim.enemy && kind !== 'dig') pt = new THREE.Vector3(aim.enemy.x, 0.75, aim.enemy.z);
      else if (aim.cell && aim.cell.t <= 6) pt = new THREE.Vector3(...aim.cell.point);
      if (pt) {
        reticle.visible = true; reticle.position.copy(pt);
        reticle.material.color.set(kind === 'pump' ? 0x5fe0b5 : kind === 'dig' ? 0xffc93c : 0x9a9a9a);
        reticle.lookAt(view.aimO); const dd = view.aimO.distanceTo(pt); reticle.scale.setScalar(Math.max(0.6, dd * 0.35));
      }
      if (aim.dig && kind !== 'pump') {
        const [cx, cz] = cellCenter(aim.dig.gx, aim.dig.gz);
        highlight.visible = true; highlight.position.set(cx, H / 2, cz); highlight.material.opacity = 0.08 + 0.06 * Math.sin(t * 6);
      }
      if (g.dig) {
        const f = g.dig.face || [0, 1]; const [cx, cz] = cellCenter(g.dig.gx, g.dig.gz);
        crack.visible = true; crack.position.set(cx + f[0] * (C / 2 + 0.12), H / 2, cz + f[1] * (C / 2 + 0.12)); crack.rotation.set(0, Math.atan2(f[0], f[1]), 0);
        crack.material.opacity = Math.min(1, g.dig.p * 1.3);
      }
    }
    // チュートリアルの目印
    const tg = g.tut && !g.tut.done && g.tutTargets ? g.tutTargets[g.tut.step] : null;
    target.visible = !!tg && g.map.solid[tg[1] * g.map.w + tg[0]] === 1;
    if (target.visible) { const [cx, cz] = cellCenter(tg[0], tg[1]); target.position.set(cx, H / 2, cz); target.material.opacity = 0.18 + 0.15 * Math.sin(t * 5); }
    // ホース（ノズル → 先端／敵）。たるみのある曲線
    if (hose) { scene.remove(hose); hose.geometry.dispose(); hose = null; }
    const hand = view.handPos;
    if (hand && g.pump.state !== 'idle') {
      let end = null;
      if (g.pump.state === 'attached' && g.pump.target) end = new THREE.Vector3(g.pump.target.x, 0.75 + g.pump.target.y, g.pump.target.z);
      else if (g.pumpRay) { const r = g.pumpRay; end = new THREE.Vector3(r.o[0] + r.d[0] * g.pump.len, r.o[1] + r.d[1] * g.pump.len, r.o[2] + r.d[2] * g.pump.len); }
      if (end && end.distanceTo(hand) > 0.05) {
        const mid = hand.clone().lerp(end, 0.5); mid.y -= Math.min(0.6, hand.distanceTo(end) * 0.08);
        const curve = new THREE.QuadraticBezierCurve3(hand.clone(), mid, end);
        hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 6, false), hoseMat);
        scene.add(hose);
        hoseMat.emissiveIntensity = g.pump.state === 'attached' ? 0.6 + 0.6 * Math.max(0, 1 - g.pump.cool / RULES.pumpInterval) : 0.2;
      }
    }
    // ノズルの目盛り（送気の進み）
    nozzle.userData.gauge.material.emissiveIntensity = g.pump.state === 'attached' ? 0.4 + 1.2 * (1 - g.pump.cool / RULES.pumpInterval) : 0.3;
  }

  function setFade(a) { fade.material.opacity = a; fade.visible = a > 0.001; }
  function setVignette(a) { vignette.material.opacity = a; vignette.visible = a > 0.001; }
  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  return { scene, rig, camera, nozzle, update, build, setFade, setVignette, resize, spawn, get built() { return built; } };
}

function makeCrackTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(20,10,5,0.9)'; x.lineCap = 'round';
  let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 9; k++) {
    x.lineWidth = 6 - k * 0.4; x.beginPath(); let px = 256, py = 256; x.moveTo(px, py);
    const a = k / 9 * Math.PI * 2 + r() * 0.5;
    for (let i = 0; i < 7; i++) { px += Math.cos(a + (r() - 0.5) * 1.2) * 34; py += Math.sin(a + (r() - 0.5) * 1.2) * 34; x.lineTo(px, py); }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeVignetteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 30, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
}
export function textSprite(text, color = '#fff') {
  const c = document.createElement('canvas'); const x = c.getContext('2d');
  const fs = 96; x.font = `900 ${fs}px ui-monospace, Consolas, monospace`;
  const w = Math.ceil(x.measureText(text).width) + 40; c.width = w; c.height = fs + 40;
  x.font = `900 ${fs}px ui-monospace, Consolas, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 14; x.strokeStyle = '#1a0d05'; x.strokeText(text, w / 2, c.height / 2); x.fillStyle = color; x.fillText(text, w / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.renderOrder = 20;
  s.userData.aspect = w / c.height; return s;
}
