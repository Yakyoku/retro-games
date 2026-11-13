// ORBITAL WINGS 3D — 環境（地形・遠景・空・照明）。Render3D に混ぜ込んで使う（this は Render3D）
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH } from '../shared/config.js';
import { fbm, hash1 } from '../shared/rng.js';

const TAU = Math.PI * 2, HW = VIEW_W / 2, HH = VIEW_H / 2;
const D = DEPTH + 1.3;              // 地形の奥行き（戦場の外まで）
const lerp = (a, b, t) => a + (b - a) * t;
const _c = new THREE.Color(), _v = new THREE.Vector3();
const CHUNK = 16, STEP = 0.5, NS = CHUNK / STEP;

export class Env3D {
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
}
// Render3D に混ぜ込む
export function install(Target) { for (const k of Object.getOwnPropertyNames(Env3D.prototype)) if (k !== 'constructor') Target.prototype[k] = Env3D.prototype[k]; }
