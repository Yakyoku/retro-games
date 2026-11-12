// Sky Climber VR — 建物の 3D（正面の外壁・窓・配管・看板・安全区画・屋上）。
// 外壁は区画ごとに窓の穴を開けた面を 1 つのジオメトリにまとめ、窓まわりの部品は InstancedMesh（描画回数を少なく）。
// 窓の開閉は「上から下りるガラス戸」。閉まりきると窓の縁（保持点）がガラスの裏になる＝つかめない、が見て分かる。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOOR_H, COL_W, WIN, colX, edgeX } from '../core/stages.js';
import { makeWallTextures, makeTextTexture } from './textures.js';
import { makeInteriorMaterial } from './interior.js';

const WIN_H = WIN.y1 - WIN.y0;
const REVEAL = 0.11; // 窓の奥行き（外壁の面から窓ガラスの面まで）

const THEME = {
  practice: { frame: 0xc9ccd0, sill: 0xd8d2c6, pipe: 0x6e7a82, trim: 0xe6e0d2 },
  day:      { frame: 0xdfe3e6, sill: 0xe8e1d2, pipe: 0x7c8a6e, trim: 0xf1eadb },
  dusk:     { frame: 0x3c3a3a, sill: 0xcfc2ad, pipe: 0x5b4f48, trim: 0xd9c6a8 },
  night:    { frame: 0x2f3338, sill: 0x9aa0a6, pipe: 0x404850, trim: 0x7d848c },
  tower:    { frame: 0xb8c2cc, sill: 0xd5dbe0, pipe: 0x8f9aa5, trim: 0xe9eef2 },
};

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// 面取りした箱（窓台・庇・エアコンなど）
export function bevelBox(w, h, d, r = 0.01) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * r, h - 2 * r, Math.min(w, h) * 0.08), { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * r) / 2); return g;
}
function place(g, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)); return g.clone().applyMatrix4(m); }
function setUVWorld(g, sx, sy) { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / sx; uv[i * 2 + 1] = p.getY(i) / sy; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }

// 窓枠（外枠＋奥への見込み＋金具）のジオメトリ
function makeFrameGeo() {
  const ow = WIN.w + 0.16, oh = WIN_H + 0.16;
  const s = roundedRect(ow, oh, 0.035); s.holes.push(roundedRect(WIN.w, WIN_H, 0.02));
  const ring = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
  const parts = [ring];
  // 見込み（窓の内側の 4 面）
  const t = 0.02;
  parts.push(place(new THREE.BoxGeometry(WIN.w, t, REVEAL), 0, -WIN_H / 2 + t / 2, -REVEAL / 2));
  parts.push(place(new THREE.BoxGeometry(WIN.w, t, REVEAL), 0, WIN_H / 2 - t / 2, -REVEAL / 2));
  parts.push(place(new THREE.BoxGeometry(t, WIN_H, REVEAL), -WIN.w / 2 + t / 2, 0, -REVEAL / 2));
  parts.push(place(new THREE.BoxGeometry(t, WIN_H, REVEAL), WIN.w / 2 - t / 2, 0, -REVEAL / 2));
  // ガラス戸のレール（上下）と、固定金具（ねじ頭）
  parts.push(place(new THREE.BoxGeometry(WIN.w, 0.018, 0.025), 0, WIN_H / 2 - 0.03, -0.015));
  for (const [x, y] of [[-ow / 2 + 0.035, oh / 2 - 0.035], [ow / 2 - 0.035, oh / 2 - 0.035], [-ow / 2 + 0.035, -oh / 2 + 0.035], [ow / 2 - 0.035, -oh / 2 + 0.035]])
    parts.push(place(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8), x, y, 0.047, Math.PI / 2));
  return mergeGeometries(parts.map((g) => g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g).map((g) => { g.deleteAttribute('uv'); return g; }));
}
function makeSillGeo() {
  const parts = [bevelBox(WIN.w + 0.30, 0.065, 0.17, 0.012)];
  // 水切りの溝と下の持ち送り（金具）
  parts.push(place(new THREE.BoxGeometry(WIN.w + 0.26, 0.012, 0.02), 0, -0.037, 0.06));
  for (const x of [-WIN.w / 2, WIN.w / 2]) parts.push(place(bevelBox(0.05, 0.09, 0.12, 0.006), x, -0.07, -0.01));
  return mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
}
function makeHeadGeo() {
  const parts = [bevelBox(WIN.w + 0.26, 0.075, 0.13, 0.01)];
  parts.push(place(new THREE.BoxGeometry(WIN.w + 0.22, 0.01, 0.015), 0, -0.04, 0.05));
  return mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
}
// 上から下りるガラス戸（枠付き）
function makeSashGeo() {
  const parts = [];
  const t = 0.035;
  parts.push(place(new THREE.BoxGeometry(WIN.w - 0.02, t, 0.03), 0, -WIN_H / 2 + t / 2, 0));
  parts.push(place(new THREE.BoxGeometry(WIN.w - 0.02, t, 0.03), 0, WIN_H / 2 - t / 2, 0));
  parts.push(place(new THREE.BoxGeometry(t, WIN_H, 0.03), -WIN.w / 2 + t / 2 + 0.01, 0, 0));
  parts.push(place(new THREE.BoxGeometry(t, WIN_H, 0.03), WIN.w / 2 - t / 2 - 0.01, 0, 0));
  parts.push(place(new THREE.BoxGeometry(0.12, 0.025, 0.03), 0, -WIN_H / 2 + 0.06, 0.02)); // 取っ手
  return mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
}

export class BuildingView {
  constructor(b, { theme, quality, envMap }) {
    this.b = b; this.theme = theme; this.group = new THREE.Group(); this.group.name = 'building';
    const st = b.def, th = THEME[theme] || THEME.day, W = b.cols * COL_W, top = b.top;
    const texSize = quality.wallTex;
    const wt = makeWallTextures(theme, { size: texSize, colW: COL_W, floorH: FLOOR_H, win: WIN, seed: st.seed });
    for (const t of [wt.map, wt.normalMap, wt.roughnessMap]) t.anisotropy = quality.aniso;
    this.wallMat = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: wt.normalMap, roughnessMap: wt.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.2, 1.2), envMap, envMapIntensity: theme === 'night' ? 0.9 : 0.5 });
    const sideMat = this.wallMat.clone(); sideMat.color = new THREE.Color(0.82, 0.82, 0.84);
    // 1. 正面の外壁: 区画（窓 1 列 × 1 階）ごとの面。窓のある区画は穴あき
    const blockAt = (c, f) => st.blocks.find((k) => c >= k.c0 && c <= k.c1 && f >= k.f0 && f <= k.f1);
    const faces = [];
    const bayPlain = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-COL_W / 2, 0); s.lineTo(COL_W / 2, 0); s.lineTo(COL_W / 2, FLOOR_H); s.lineTo(-COL_W / 2, FLOOR_H); return s; })());
    const bayHole = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-COL_W / 2, 0); s.lineTo(COL_W / 2, 0); s.lineTo(COL_W / 2, FLOOR_H); s.lineTo(-COL_W / 2, FLOOR_H);
      const h = new THREE.Path(); h.moveTo(-WIN.w / 2, WIN.y0); h.lineTo(-WIN.w / 2, WIN.y1); h.lineTo(WIN.w / 2, WIN.y1); h.lineTo(WIN.w / 2, WIN.y0); s.holes.push(h); return s; })());
    for (let f = 0; f < b.floors; f++) for (let c = 0; c < b.cols; c++) {
      const g = (blockAt(c, f) ? bayPlain : bayHole).clone(); g.translate(colX(st, c), f * FLOOR_H, 0); faces.push(g);
    }
    // 左右の端の柱（少し厚い）
    const front = setUVWorld(mergeGeometries(faces), wt.repeatW, wt.repeatH);
    front.translate(0, 0, 0); front.computeVertexNormals();
    const wall = new THREE.Mesh(front, this.wallMat); wall.receiveShadow = true; wall.name = 'facade'; this.group.add(wall);
    // 奥の箱（窓の奥を塞ぐ・側面と屋上の床）
    const core = new THREE.Mesh(new THREE.BoxGeometry(W, top, 12), sideMat); core.position.set(0, top / 2, -6 - REVEAL - 0.02); core.receiveShadow = true; this.group.add(core);
    // 2. 蛇腹（階ごとの帯）と、列の境目の付け柱
    const bands = [], pil = [];
    const bandProfile = new THREE.Shape(); bandProfile.moveTo(0, 0); bandProfile.lineTo(0.09, 0); bandProfile.lineTo(0.11, 0.03); bandProfile.lineTo(0.11, 0.09); bandProfile.lineTo(0.07, 0.13); bandProfile.lineTo(0, 0.13);
    const bandGeo = new THREE.ExtrudeGeometry(bandProfile, { depth: W + 0.2, bevelEnabled: false, steps: 1 });
    bandGeo.rotateY(Math.PI / 2); bandGeo.translate(-(W + 0.2) / 2, 0, 0); bandGeo.deleteAttribute('uv');
    for (let f = 1; f < b.floors; f++) bands.push(place(bandGeo, 0, f * FLOOR_H - 0.08, 0, 0, 0, 0));
    for (let bi = 0; bi <= b.cols; bi++) pil.push(place(bevelBox(0.16, top, 0.05, 0.01), edgeX(st, bi), top / 2, 0.025));
    const trimMat = new THREE.MeshStandardMaterial({ color: th.trim, roughness: 0.75, metalness: 0, envMap, envMapIntensity: 0.4 });
    const bandMesh = new THREE.Mesh(mergeGeometries([...bands, ...pil.map((g) => { g.deleteAttribute('uv'); return g; })]), trimMat); bandMesh.castShadow = true; bandMesh.receiveShadow = true; this.group.add(bandMesh);
    // 3. 窓（InstancedMesh）
    const wins = b.windows, n = wins.length;
    const frameMat = new THREE.MeshStandardMaterial({ color: th.frame, metalness: 0.75, roughness: 0.32, envMap, envMapIntensity: 1.0 });
    const sillMat = new THREE.MeshStandardMaterial({ color: th.sill, metalness: 0.05, roughness: 0.6, envMap, envMapIntensity: 0.4 });
    const mk = (geo, mat, shadow) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = shadow; m.receiveShadow = true; this.group.add(m); return m; };
    this.frames = mk(makeFrameGeo(), frameMat, true);
    this.sills = mk(makeSillGeo(), sillMat, true);
    this.heads = mk(makeHeadGeo(), sillMat, true);
    this.interiorMat = makeInteriorMaterial({ winW: WIN.w, winH: WIN_H, sillH: WIN.y0, theme });
    const quad = new THREE.PlaneGeometry(WIN.w, WIN_H);
    const room = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const w = wins[i]; room.set([w.room, theme === 'night' ? (w.lit ? 1 : 0) : theme === 'dusk' ? (w.lit && w.room > 0.4 ? 1 : 0) : (w.lit && w.room > 0.8 ? 1 : 0), w.curtain / 3, w.style / 5], i * 4); }
    quad.setAttribute('aRoom', new THREE.InstancedBufferAttribute(room, 4));
    this.rooms = new THREE.InstancedMesh(quad, this.interiorMat, n); this.group.add(this.rooms);
    // 固定のガラス（開いている窓は上半分に引き上げた戸が重なる）と、動くガラス戸
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c4d8, metalness: 0.1, roughness: 0.04, transparent: true, opacity: theme === 'night' ? 0.22 : 0.32, envMap, envMapIntensity: 1.6, depthWrite: false });
    this.sashGlass = new THREE.InstancedMesh(new THREE.PlaneGeometry(WIN.w - 0.06, WIN_H - 0.06), this.glassMat, n); this.sashGlass.renderOrder = 2; this.group.add(this.sashGlass);
    this.sashes = mk(makeSashGeo(), frameMat, false);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const w = wins[i], cy = w.y + WIN.y0 + WIN_H / 2;
      this.frames.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, cy, 0), q, one));
      this.sills.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, w.y + WIN.y0 - 0.03, 0.06), q, one));
      this.heads.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, w.y + WIN.y1 + 0.1, 0.045), q, one));
      this.rooms.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, cy, -REVEAL), q, one));
    }
    this.sashState = new Float32Array(n).fill(-1);
    this.updateSashes(() => 0, true);
    // 4. 配管（雨どい）と留め金
    const pipes = [], clamps = [];
    for (const pb of st.pipes) {
      const x = edgeX(st, pb) + (pb === 0 ? 0.32 : pb === b.cols ? -0.32 : 0);
      const g = new THREE.CylinderGeometry(0.045, 0.045, top - 0.4, 16, 1); g.translate(x, (top - 0.4) / 2 + 0.2, 0.12); pipes.push(g);
      for (let y = 0.95; y < top - 0.2; y += 0.62) { clamps.push(place(new THREE.TorusGeometry(0.052, 0.012, 6, 16), x, y, 0.12, Math.PI / 2)); clamps.push(place(new THREE.BoxGeometry(0.03, 0.03, 0.12), x, y, 0.06)); }
      for (let y = FLOOR_H; y < top; y += FLOOR_H * 2) pipes.push(place(new THREE.CylinderGeometry(0.052, 0.052, 0.06, 16), x, y, 0.12)); // 継手
    }
    if (pipes.length) {
      const pipeMat = new THREE.MeshStandardMaterial({ color: th.pipe, metalness: 0.6, roughness: 0.45, envMap, envMapIntensity: 0.8 });
      const pm = new THREE.Mesh(mergeGeometries([...pipes, ...clamps].map((g) => { const k = g.index ? g.toNonIndexed() : g; k.deleteAttribute('uv'); return k; })), pipeMat);
      pm.castShadow = true; pm.receiveShadow = true; this.group.add(pm);
    }
    // 5. エアコンの室外機・植木（窓台の上）
    const acs = [], plants = [];
    for (const w of wins) {
      if (w.ac) { acs.push(place(bevelBox(0.62, 0.42, 0.26, 0.02), w.x + 0.55, w.y + 0.3, 0.16)); }
      if (w.plant) plants.push(w);
    }
    if (acs.length) {
      const acTex = makeTextTexture((ctx, cw, ch) => { ctx.fillStyle = '#d9d9d4'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#9a9c98'; for (let i = 0; i < 18; i++) ctx.fillRect(cw * 0.08, ch * (0.1 + i * 0.045), cw * 0.55, ch * 0.02);
        ctx.strokeStyle = '#7a7c78'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cw * 0.36, ch * 0.5, ch * 0.33, 0, 6.3); ctx.stroke(); }, 256, 256).tex;
      const acGeo = mergeGeometries(acs.map((g) => { const k = g.index ? g.toNonIndexed() : g; return k; }));
      setUVWorld(acGeo, 0.62, 0.42);
      const acm = new THREE.Mesh(acGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, map: acTex, roughness: 0.6, metalness: 0.2, envMap, envMapIntensity: 0.5 }));
      acm.castShadow = true; acm.receiveShadow = true; this.group.add(acm);
    }
    if (plants.length) {
      const potG = new THREE.CylinderGeometry(0.09, 0.07, 0.15, 14); const leafG = new THREE.IcosahedronGeometry(0.13, 1);
      const pots = new THREE.InstancedMesh(potG, new THREE.MeshStandardMaterial({ color: 0xb5562e, roughness: 0.8 }), plants.length);
      const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.9, flatShading: true }), plants.length);
      plants.forEach((w, i) => { pots.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x - 0.32, w.y + WIN.y0 + 0.08, 0.1), q, one)); leaves.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x - 0.32, w.y + WIN.y0 + 0.24, 0.1), q, new THREE.Vector3(1, 1.2, 1))); });
      pots.castShadow = leaves.castShadow = true; this.group.add(pots, leaves);
    }
    // 6. 看板・ネオン・ガラスの壁
    for (const blk of st.blocks) this.group.add(this.makeBlock(blk, st, envMap));
    // 7. 安全区画（バルコニー）
    for (const l of b.ledges) this.group.add(this.makeLedge(l, envMap, th));
    // 8. 屋上
    this.group.add(this.makeRoof(b, envMap, th));
    // 9. 地上の入口
    this.group.add(this.makeLobby(b, envMap));
  }
  // 窓の開閉（0=開・1=閉）。変化した窓だけ行列を書き換える
  updateSashes(closeOf, force = false) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    let dirty = false;
    for (let i = 0; i < this.b.windows.length; i++) {
      const c = closeOf(i); if (!force && Math.abs(c - this.sashState[i]) < 1e-3) continue;
      this.sashState[i] = c; dirty = true;
      const w = this.b.windows[i], cy = w.y + WIN.y0 + WIN_H / 2;
      // 開いているときは上の戸袋へ引き上げ（窓の上端の内側に隠れる）、閉じると下りてくる
      const y = cy + (1 - c) * (WIN_H - 0.08);
      const z = 0.045; // 窓枠の前面（保持点をふさぐ）
      const s = new THREE.Vector3(1, 1, 1);
      if (c < 0.02) { s.set(0.0001, 0.0001, 0.0001); }
      this.sashes.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, y, z), q, s));
      this.sashGlass.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, y, z), q, s));
    }
    if (dirty) { this.sashes.instanceMatrix.needsUpdate = true; this.sashGlass.instanceMatrix.needsUpdate = true; }
  }
  makeBlock(blk, st, envMap) {
    const g = new THREE.Group();
    const x0 = colX(st, blk.c0) - COL_W / 2, x1 = colX(st, blk.c1) + COL_W / 2, y0 = blk.f0 * FLOOR_H, y1 = (blk.f1 + 1) * FLOOR_H;
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (blk.kind === 'billboard') {
      // 架空の広告（実在の会社・商品は使わない）
      const ads = [['ソラミルク', 'まいにち、空まで元気。', '#e8f4ff', '#1d5fa8'], ['スカイ堂のどら焼き', 'ふんわり三代目', '#fff1d6', '#a8461d'], ['NICONICO TAXI', '高い所へもすぐ参上', '#ffe36b', '#222']];
      const ad = ads[(blk.c0 + blk.f0) % ads.length];
      const tex = makeTextTexture((ctx, cw, ch) => {
        const grd = ctx.createLinearGradient(0, 0, 0, ch); grd.addColorStop(0, ad[2]); grd.addColorStop(1, '#ffffff'); ctx.fillStyle = grd; ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = ad[3]; ctx.font = `900 ${Math.round(ch * 0.2)}px "Hiragino Sans","Noto Sans JP",sans-serif`; ctx.textAlign = 'center'; ctx.fillText(ad[0], cw / 2, ch * 0.45);
        ctx.font = `700 ${Math.round(ch * 0.1)}px "Hiragino Sans","Noto Sans JP",sans-serif`; ctx.fillText(ad[1], cw / 2, ch * 0.68);
        ctx.strokeStyle = ad[3]; ctx.lineWidth = ch * 0.02; ctx.strokeRect(ch * 0.04, ch * 0.04, cw - ch * 0.08, ch - ch * 0.08);
      }, 1024, Math.round(1024 * h / w)).tex;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, envMap, envMapIntensity: 0.3 }));
      panel.position.set(cx, cy, 0.10); panel.receiveShadow = true; g.add(panel);
      // 鉄の枠（縁は中継の保持点）
      const fm = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.8, roughness: 0.4, envMap });
      for (const [px, py, pw, ph] of [[cx, y0 + 0.08, w, 0.12], [cx, y1 - 0.08, w, 0.12], [x0 + 0.08, cy, 0.12, h], [x1 - 0.08, cy, 0.12, h]]) { const m = new THREE.Mesh(bevelBox(pw, ph, 0.12, 0.01), fm); m.position.set(px, py, 0.1); m.castShadow = true; g.add(m); }
      for (let y = y0 + 0.4; y < y1; y += 0.62) for (const px of [x0 + 0.12, x1 - 0.12]) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), fm); m.position.set(px, y, 0.18); g.add(m); }
    } else if (blk.kind === 'neon') {
      // 縦長のネオン看板（架空のホテル名）。文字は発光、点滅は描画側で
      const tex = makeTextTexture((ctx, cw, ch) => {
        ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, cw, ch);
        const chars = ['ホ', 'テ', 'ル', '★', '夜', '空'];
        ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(cw * 0.62)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
        chars.forEach((c, i) => { const y = ch * (i + 0.72) / chars.length; ctx.shadowColor = i % 2 ? '#ff3fa4' : '#3fe0ff'; ctx.shadowBlur = cw * 0.12; ctx.fillStyle = i % 2 ? '#ffb3dc' : '#b8f5ff'; ctx.fillText(c, cw / 2, y); });
      }, 256, 256 * 6).tex;
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 2.2, roughness: 0.4 });
      const p = new THREE.Mesh(bevelBox(w - 0.4, h - 0.6, 0.22, 0.03), mat); p.position.set(cx, cy, 0.14); g.add(p);
      this.neonMat = mat;
    } else if (blk.kind === 'glass') {
      // ガラスのカーテンウォール（保持点なし。縁で回り込む）
      const gm = new THREE.MeshStandardMaterial({ color: 0x5d7f9c, metalness: 0.9, roughness: 0.06, envMap, envMapIntensity: 1.8 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm); p.position.set(cx, cy, 0.02); g.add(p);
      const mm = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.85, roughness: 0.3, envMap });
      const bars = [];
      for (let x = x0; x <= x1 + 1e-6; x += COL_W / 2) bars.push(place(new THREE.BoxGeometry(0.05, h, 0.08), x, cy, 0.05));
      for (let y = y0; y <= y1 + 1e-6; y += FLOOR_H / 2) bars.push(place(new THREE.BoxGeometry(w, 0.05, 0.08), cx, y, 0.05));
      for (let y = y0 + 0.4; y < y1; y += 0.62) for (const px of [x0 + 0.12, x1 - 0.12]) bars.push(place(new THREE.BoxGeometry(0.06, 0.06, 0.16), px, y, 0.1));
      const mesh = new THREE.Mesh(mergeGeometries(bars), mm); mesh.castShadow = true; g.add(mesh);
    }
    return g;
  }
  makeLedge(l, envMap, th) {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(bevelBox(1.9, 0.16, 0.9, 0.02), new THREE.MeshStandardMaterial({ color: th.sill, roughness: 0.7, envMap, envMapIntensity: 0.3 }));
    slab.position.set(l.x, l.y - 0.08, 0.45); slab.castShadow = slab.receiveShadow = true; g.add(slab);
    const rm = new THREE.MeshStandardMaterial({ color: 0x6d757d, metalness: 0.8, roughness: 0.35, envMap });
    const parts = [place(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 10), l.x, l.y + 0.95, 0.88, 0, 0, Math.PI / 2)];
    for (let i = 0; i <= 6; i++) parts.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6), l.x - 0.93 + i * 0.31, l.y + 0.47, 0.88));
    for (const s of [-1, 1]) parts.push(place(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 8), l.x + s * 0.93, l.y + 0.95, 0.45, Math.PI / 2));
    const rail = new THREE.Mesh(mergeGeometries(parts), rm); rail.castShadow = true; g.add(rail);
    // 「安全区画」の旗
    const flag = makeTextTexture((ctx, w, h) => { ctx.fillStyle = '#2fbf71'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = `900 ${h * 0.42}px "Hiragino Sans","Noto Sans JP",sans-serif`; ctx.textAlign = 'center'; ctx.fillText('ひとやすみ', w / 2, h * 0.62); }, 256, 96).tex;
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshStandardMaterial({ map: flag, roughness: 0.8, side: THREE.DoubleSide }));
    fp.position.set(l.x, l.y + 0.72, 0.9); g.add(fp);
    return g;
  }
  makeRoof(b, envMap, th) {
    const g = new THREE.Group(), W = b.cols * COL_W, top = b.top;
    const cm = new THREE.MeshStandardMaterial({ color: th.trim, roughness: 0.6, envMap, envMapIntensity: 0.4 });
    const coping = new THREE.Mesh(bevelBox(W + 0.3, 0.14, 0.42, 0.02), cm); coping.position.set(0, top + 0.0, -0.05); coping.castShadow = coping.receiveShadow = true; g.add(coping);
    const par = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, 0.25), cm); par.position.set(0, top + 0.45, -0.3); g.add(par);
    // 屋上の床・ヘリポート
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 11.5), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, top + 0.01, -6.0); floor.receiveShadow = true; g.add(floor);
    const pad = makeTextTexture((ctx, w, h) => { ctx.fillStyle = '#3d4246'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f3d24a'; ctx.lineWidth = w * 0.03; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.42, 0, 6.3); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${w * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', w / 2, h / 2 + w * 0.02); }, 512, 512).tex;
    const pm = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ map: pad, roughness: 0.8 }));
    pm.rotation.x = -Math.PI / 2; pm.position.set(0, top + 0.02, -5.5); pm.receiveShadow = true; g.add(pm);
    // 給水塔・アンテナ・室外機
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 24), new THREE.MeshStandardMaterial({ color: 0x7b8a96, metalness: 0.6, roughness: 0.4, envMap }));
    tank.position.set(-W / 2 + 1.6, top + 2.4, -8.5); tank.castShadow = true; g.add(tank);
    const legs = []; for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) legs.push(place(new THREE.BoxGeometry(0.08, 1.5, 0.08), -W / 2 + 1.6 + x, top + 0.75, -8.5 + z));
    g.add(new THREE.Mesh(mergeGeometries(legs), new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.7, roughness: 0.5 })));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 5, 8), new THREE.MeshStandardMaterial({ color: 0xc9ced2, metalness: 0.8, roughness: 0.3 }));
    ant.position.set(W / 2 - 1.2, top + 2.5, -7); g.add(ant);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 3 }));
    beacon.position.set(W / 2 - 1.2, top + 5.05, -7); g.add(beacon); this.beacon = beacon;
    for (let i = 0; i < 3; i++) { const u = new THREE.Mesh(bevelBox(1.0, 0.8, 0.7, 0.03), new THREE.MeshStandardMaterial({ color: 0xd6d8d4, roughness: 0.6, metalness: 0.2 })); u.position.set(W / 2 - 2 - i * 1.2, top + 0.4, -9.5); u.castShadow = true; g.add(u); }
    return g;
  }
  makeLobby(b, envMap) {
    const g = new THREE.Group();
    const cx = colX(b.def, Math.floor(b.cols / 2));
    // 入口の庇（開始位置の 2 列横。登る視界をふさがない）
    const canopy = new THREE.Mesh(bevelBox(2.6, 0.1, 1.0, 0.02), new THREE.MeshStandardMaterial({ color: 0x2f3a44, metalness: 0.6, roughness: 0.4, envMap }));
    canopy.position.set(cx + 3.4, 2.5, 0.5); canopy.castShadow = true; g.add(canopy);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(b.cols * COL_W + 8, 0.15, 4), new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.85 }));
    sw.position.set(0, 0.075 - 0.15, 2); sw.receiveShadow = true; g.add(sw);
    return g;
  }
  setFog(color, density) { this.interiorMat.uniforms.uFogColor.value.copy(color); this.interiorMat.uniforms.uFogDensity.value = density; }
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) m[k]?.dispose(); m.dispose(); } } }); }
}
