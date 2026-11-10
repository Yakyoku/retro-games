// VOIDBLOOM — ゲームの状態を 3D の場面にする（大画面と VR で共通）
// root ┬ sky（はるか遠くの星雲。動かない）
//      ├ scroll（地形・壁・近い星。x = -scrollX で動く → 奥にあるものほど遅く見える＝本物の視差）
//      └ field（自機・敵・弾。盤面座標そのまま）
import * as THREE from 'three';
import { FIELD_W, FIELD_H, lineAt } from '../game-core.js';
import { materials, colorOf, U, makeEnvironment } from './materials.js';
import { buildPlayer, buildPod, buildBit, buildEnemy } from './models.js';
import { SpriteBatch, Particles } from './sprites.js';

const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const COL = Object.fromEntries(Object.entries(colorOf).map(([k, v]) => [k, rgb(v)]));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy); return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy); }

export class World {
  constructor(renderer, opts = {}) {
    this.renderer = renderer; this.vr = !!opts.vr; this.lite = !!opts.lite;
    this.root = new THREE.Group();
    this.scroll = new THREE.Group(); this.field = new THREE.Group(); this.skyG = new THREE.Group();
    this.root.add(this.skyG, this.scroll, this.field);
    this.M = materials();
    this.env = makeEnvironment(renderer);
    for (const m of Object.values(this.M)) if (m.isMeshStandardMaterial) { m.envMap = this.env; if (m.envMapIntensity === 1) m.envMapIntensity = 1.0; }
    // 光: 冷たい上からの主光、紫の逆光、暗い環境光
    this.key = new THREE.DirectionalLight(0xcfe6ff, 2.8); this.key.position.set(-6, 14, 12);
    this.rim = new THREE.DirectionalLight(0xff60c0, 1.1); this.rim.position.set(8, -4, -10);
    this.hemi = new THREE.HemisphereLight(0x3a5878, 0x120814, 0.9);
    this.root.add(this.key, this.rim, this.hemi, this.key.target);
    this.key.target.position.set(FIELD_W / 2, FIELD_H / 2, 0);
    // 弾・火花
    this.sprites = new SpriteBatch(4096); this.sprites.mesh.renderOrder = 10; this.field.add(this.sprites.mesh);
    this.parts = new Particles(this.lite ? 1500 : 3500);
    // 自機など
    this.player = buildPlayer(); this.field.add(this.player.obj);
    this.pod = buildPod(); this.field.add(this.pod.obj);
    this.bits = [buildBit(), buildBit()]; for (const b of this.bits) this.field.add(b.obj);
    this.enemyObjs = new Map(); this.itemObjs = new Map(); this.burstObjs = [];
    this.stageObjs = []; this.blockObjs = [];
    this.t = 0; this.stage = null;
  }

  // ---------------------------------------------------------------- 面の構築
  setStage(st) {
    if (this.stage === st) return;
    this.stage = st;
    for (const o of this.stageObjs) { o.parent && o.parent.remove(o); o.traverse((x) => { if (x.geometry && !x.geometry.userData.shared) x.geometry.dispose(); }); }
    this.stageObjs = []; this.blockObjs = [];
    const pal = st.palette;
    this.key.color.set(0xcfe6ff); this.rim.color.set(pal.glow).lerp(new THREE.Color(0xffffff), 0.3);
    this.hemi.color.set(pal.fog).multiplyScalar(4); this.hemi.groundColor.set(pal.flesh).multiplyScalar(0.4);
    this.buildSky(pal);
    this.buildStars(st, pal);
    if (st.bottom.length) this.buildTerrain(st, st.bottom, -1, pal);
    if (st.top.length) this.buildTerrain(st, st.top, 1, pal);
    this.buildBlocks(st, pal);
  }

  add(o, parent = this.scroll) { parent.add(o); this.stageObjs.push(o); return o; }

  buildSky(pal) {
    const [c1, c2] = pal.nebula.map((h) => new THREE.Color(h));
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      uniforms: { c1: { value: c1 }, c2: { value: c2 }, sky: { value: new THREE.Color(pal.sky) }, uTime: U.time },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 c1; uniform vec3 c2; uniform vec3 sky; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float a=0.5, s=0.; for(int k=0;k<5;k++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){ vec3 d = vD; float a = fbm(d*2.2+vec3(3.1)); float b = fbm(d*3.7-vec3(1.7));
          float band = exp(-pow(d.y*2.2 - 0.25*sin(d.x*3.), 2.));
          vec3 col = sky + c1 * smoothstep(0.5, 0.95, a) * 0.55 * (0.35+band) + c2 * smoothstep(0.55, 0.97, b) * 0.5;
          float st = step(0.9985, h(floor(d*900.))); col += st * vec3(0.7,0.8,1.0) * (0.4 + h(floor(d*900.)+1.));
          gl_FragColor = vec4(col, 1.); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(this.vr ? 900 : 1500, 48, 24), mat);
    sky.position.set(FIELD_W / 2, FIELD_H / 2, 0); sky.renderOrder = -10; sky.frustumCulled = false;
    this.add(sky, this.skyG);
  }

  buildStars(st, pal) {
    const N = this.lite ? 2600 : 5200, pos = new Float32Array(N * 3), sz = new Float32Array(N), col = new Float32Array(N * 3);
    const x0 = -150, x1 = (st.bossStop || 300) + 220;
    const tint = [new THREE.Color(0xcfe6ff), new THREE.Color(0xffe2c0), new THREE.Color(pal.glow), new THREE.Color(0xffffff)];
    for (let i = 0; i < N; i++) {
      const z = -12 - Math.pow(Math.random(), 0.6) * 190;
      const spread = (33 - z) * 0.32;
      pos[i * 3] = lerp(x0, x1, Math.random()); pos[i * 3 + 1] = FIELD_H / 2 + (Math.random() - 0.5) * spread * 2.4; pos[i * 3 + 2] = z;
      sz[i] = 0.6 + Math.pow(Math.random(), 6) * 3.2;
      const c = tint[Math.floor(Math.random() * tint.length)]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uVH: { value: 1080 }, uTime: U.time, uDpr: { value: 1 } },
      vertexShader: `attribute float aSize; attribute vec3 aCol; uniform float uVH; uniform float uTime; uniform float uDpr; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
          float px = aSize * 0.05 * projectionMatrix[1][1] * uVH * 0.5 / -mv.z; float tw = 0.75 + 0.25*sin(uTime*2.3 + position.x*12.7);
          gl_PointSize = max(1.5 * uDpr, px + uDpr * aSize * 0.9); vA = tw * clamp(px*3., 0.35, 1.); vC = aCol; }`,
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord*2.-1.; float a = smoothstep(1.,0.,length(d)); a*=a; gl_FragColor = vec4(vC*a*vA*1.6, a*vA); }',
    });
    const pts = new THREE.Points(g, this.starMat); pts.frustumCulled = false; pts.renderOrder = -5;
    this.add(pts);
  }

  buildTerrain(st, pts, sign, pal) {
    // 断面（境界からの dy, z）: z=0 が遊ぶ面。手前は崖、奥へ盛り上がる
    const sec = [[-14, 2.4], [-1.6, 2.4], [-0.45, 1.85], [-0.05, 1.0], [0.0, 0.0], [-0.05, -1.3], [-0.55, -2.9], [-0.2, -5.0], [1.0, -7.5], [2.6, -11]];
    const R = sec.length, C = pts.length;
    const pos = new Float32Array(R * C * 3), metal = new Float32Array(R * C), col = new Float32Array(R * C * 3);
    const cm = new THREE.Color(pal.metal), cf = new THREE.Color(pal.flesh), tmp = new THREE.Color();
    for (let i = 0; i < C; i++) {
      const [x, y] = pts[i];
      for (let r = 0; r < R; r++) {
        const [dy, z] = sec[r];
        const amp = r <= 1 ? 0.6 : r >= 3 && r <= 5 ? 0.0 : 0.9;
        const nz = (vnoise(x * 0.35, r * 1.7 + (sign > 0 ? 40 : 0)) - 0.5) * 2 * amp;
        const k = (i * R + r) * 3;
        pos[k] = x + (r > 5 ? (vnoise(x * 0.2, r) - 0.5) * 1.5 : 0); pos[k + 1] = y - sign * dy + sign * nz; pos[k + 2] = z;
        const mw = smooth(Math.min(1, Math.max(0, (vnoise(x * 0.09 + 7, r * 0.6 + sign * 3) - 0.38) * 3.2)));
        metal[i * R + r] = mw;
        tmp.copy(cf).lerp(cm, mw).multiplyScalar(0.85 + vnoise(x * 1.3, r * 3.1) * 0.3);
        col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
      }
    }
    const idx = [];
    for (let i = 0; i < C - 1; i++) for (let r = 0; r < R - 1; r++) {
      const a = i * R + r, b = (i + 1) * R + r, c = (i + 1) * R + r + 1, d = i * R + r + 1;
      if (sign < 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMetal', new THREE.BufferAttribute(metal, 1)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.42, envMap: this.env });
    const vein = new THREE.Color(pal.glow).multiplyScalar(1.2);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.time; sh.uniforms.uVein = { value: vein };
      sh.vertexShader = 'attribute float aMetal; varying float vMetal; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMetal = aMetal; vWP = position;');
      sh.fragmentShader = 'uniform float uTime; uniform vec3 uVein; varying float vMetal; varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(0.05, 0.95, vMetal);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.55, 0.24, vMetal);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float mask = smoothstep(0.55, 0.8, sin(vWP.x * 0.13 + vWP.z * 0.4) * 0.5 + 0.5 + sin(vWP.x * 0.31 - vWP.y * 0.2) * 0.25);
          float vv = abs(sin(vWP.x * 2.3 + sin(vWP.z * 1.1 + vWP.x * 0.37) * 2.4 + uTime * 0.35));
          vv = smoothstep(0.985, 1.0, vv) * (1.0 - vMetal) * mask * (0.5 + 0.5 * sin(uTime * 2.0 + vWP.x * 0.5)) * 0.4;
          float seam = smoothstep(0.985, 1.0, abs(sin(vWP.x * 3.14159 * 0.25))) * vMetal * 0.12;
          totalEmissiveRadiance += uVein * (vv + seam);`);
    };
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
    this.add(m);
    // 金属の肋（地形に食い込む骨組み）
    const ribG = new THREE.TorusGeometry(1.5, 0.13, 6, 14, Math.PI); ribG.rotateY(Math.PI / 2);
    const xs = []; for (let x = pts[0][0] + 2; x < pts[C - 1][0]; x += 7 + hash(x, sign) * 6) xs.push(x);
    const ribs = new THREE.InstancedMesh(ribG, this.M.steel, xs.length);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
    xs.forEach((x, k) => {
      const y = lineAt(pts, x);
      q.setFromEuler(new THREE.Euler(sign > 0 ? Math.PI : 0, 0, (hash(x, 3) - 0.5) * 0.4));
      sc.setScalar(0.7 + hash(x, 9) * 0.6); v.set(x, y - sign * 0.7, -2.6);
      mm.compose(v, q, sc); ribs.setMatrixAt(k, mm);
    });
    ribs.frustumCulled = false; this.add(ribs);
    // 面ごとの飾り: 1・4 面は結晶、2 面は垂れ下がる触手
    const deco = st.id === 2 ? 'tendril' : st.id === 3 ? null : 'crystal';
    if (deco) {
      const n = this.lite ? 140 : 300;
      const dg = deco === 'crystal' ? (() => { const o = new THREE.OctahedronGeometry(0.5, 0); o.scale(0.45, 2.2, 0.45); return o; })() : (() => { const c = new THREE.ConeGeometry(0.28, 2.6, 6); return c; })();
      const dm = deco === 'crystal' ? (st.id === 4 ? this.M.crystalViolet : this.M.crystal) : this.M.flesh;
      const im = new THREE.InstancedMesh(dg, dm, n);
      for (let k = 0; k < n; k++) {
        const x = lerp(pts[0][0], pts[C - 1][0], hash(k, 1.3 + sign)), z = -0.6 - hash(k, 7.7) * 5.5;
        const y = lineAt(pts, x) + (z < -3 ? sign * -0.6 : 0);
        const tilt = (hash(k, 2.2) - 0.5) * 0.9;
        q.setFromEuler(new THREE.Euler((hash(k, 5) - 0.5) * 0.6, 0, (sign > 0 ? Math.PI : 0) + tilt));
        sc.setScalar(0.4 + Math.pow(hash(k, 4.4), 2) * 1.6); v.set(x, y - sign * 0.2, z);
        mm.compose(v, q, sc); im.setMatrixAt(k, mm);
      }
      im.frustumCulled = false; this.add(im);
    }
  }

  buildBlocks(st, pal) {
    const M = this.M;
    st.blocks.forEach((b, bi) => {
      let o;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.kind === 'crystal') {
        o = new THREE.Group();
        const core = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, 2.2), st.id === 4 ? M.crystalViolet : M.crystal); o.add(core);
        for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), st.id === 4 ? M.crystalViolet : M.crystal); s.scale.set(b.w * 0.5, b.h * 0.42, 0.8); s.position.set((k - 1) * 0.2, (k - 1) * b.h * 0.25, -0.8 - k * 0.6); s.rotation.y = k; o.add(s); }
      } else if (b.kind === 'cyst') {
        const g = new THREE.IcosahedronGeometry(1, 2);
        o = new THREE.Mesh(g, M.fleshTeal); o.scale.set(b.w * 0.62, b.h * 0.6, 1.1);
      } else {
        const depth = b.kind === 'hull' || b.kind === 'bow' ? 11 : b.kind === 'plate' ? 1.6 : 3;
        const g = new THREE.BoxGeometry(b.w, b.h, depth);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, b.w / 4), uv.getY(i) * Math.max(1, b.h / 4));
        const mat = b.kind === 'plate' ? M.darkSteel : b.kind === 'mast' ? M.gunmetal : M.hull;
        o = new THREE.Mesh(g, mat);
        if (b.kind === 'hull' || b.kind === 'bow') {
          o.position.z = -depth / 2 + 1.4;
          // 灯火の帯
          const strip = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.96, 0.06, 0.06), M.gAmber);
          strip.position.set(0, (b.y > 9 ? -1 : 1) * (b.h / 2 - 0.25), depth / 2 + 0.02); o.add(strip);
        }
        if (b.kind === 'plate') { const e = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.02, 0.08, 1.7), M.gAmber); e.position.y = b.h / 2 - 0.05; o.add(e); }
        if (b.kind === 'nozzle') { o.geometry.dispose(); o.geometry = new THREE.CylinderGeometry(0.75, 0.6, b.w, 14); o.rotation.z = Math.PI / 2; }
      }
      const holder = new THREE.Group(); holder.position.set(cx, cy, 0); holder.add(o);
      if (o.position.z === 0 && b.kind !== 'hull' && b.kind !== 'bow') o.position.z = -0.2;
      this.add(holder);
      this.blockObjs.push({ b, i: bi, o: holder });
    });
  }

  // ---------------------------------------------------------------- 毎フレーム
  // s: ゲーム状態、alpha: 補間（0〜1）、dt: 実時間の経過秒
  sync(s, alpha, dt) {
    this.t += dt; U.time.value = this.t;
    if (s.stage !== this.stage) this.setStage(s.stage);
    const scroll = lerp(s.pscroll ?? s.scrollX, s.scrollX, alpha);
    this.scroll.position.x = -scroll;
    const L = (e) => [lerp(e.px ?? e.x, e.x, alpha), lerp(e.py ?? e.y, e.y, alpha)];
    // 壁
    for (const bo of this.blockObjs) {
      const blk = s.blocks[bo.i];
      const alive = blk ? blk.alive : true;
      bo.o.visible = alive && bo.b.x + bo.b.w > scroll - 12 && bo.b.x < scroll + FIELD_W + 40;
      if (blk && blk.flash > 0) bo.o.scale.setScalar(1.04); else bo.o.scale.setScalar(1);
    }
    // 自機
    const p = s.player, [px, py] = L(p);
    this.player.obj.position.set(px, py, 0);
    this.player.anim(p, this.t);
    if (s.pod) { const [x, y] = L(s.pod); this.pod.obj.visible = true; this.pod.obj.position.set(x, y, 0); this.pod.anim(s.pod, this.t); } else this.pod.obj.visible = false;
    this.bits.forEach((bo, k) => { const b = s.bits[k]; bo.obj.visible = !!b; if (b) { const [x, y] = L(b); bo.obj.position.set(x, y, 0); bo.anim(b, this.t); } });
    // 敵
    const seen = new Set();
    for (const e of s.enemies) {
      seen.add(e.id);
      let m = this.enemyObjs.get(e.id);
      if (!m) { m = buildEnemy(e); this.enemyObjs.set(e.id, m); this.field.add(m.obj); }
      const [x, y] = L(e);
      let jx = 0, jy = 0;
      if (e.dying) { jx = (Math.random() - 0.5) * 0.3; jy = (Math.random() - 0.5) * 0.3; }
      m.obj.position.set(x + jx, y + jy, e.boss ? -0.4 : 0);
      m.anim(e, this.t);
    }
    for (const [id, m] of this.enemyObjs) if (!seen.has(id)) { this.field.remove(m.obj); this.enemyObjs.delete(id); }
    // アイテム
    const seenI = new Set();
    for (const it of s.items) {
      seenI.add(it.id);
      let m = this.itemObjs.get(it.id);
      if (!m) { m = this.makeItem(it.kind); this.itemObjs.set(it.id, m); this.field.add(m); }
      const [x, y] = L(it); m.position.set(x, y, 0.3); m.rotation.y = this.t * 2.4; m.rotation.x = Math.sin(this.t * 1.3) * 0.4;
    }
    for (const [id, m] of this.itemObjs) if (!seenI.has(id)) { this.field.remove(m); this.itemObjs.delete(id); }
    // 光の板
    const sb = this.sprites; sb.begin();
    this.drawShots(s, sb, L);
    this.drawBullets(s, sb, L);
    for (const it of s.items) { const [x, y] = L(it); const c = COL[it.kind] || COL.w; sb.add(x, y, 0.1, 2.4, 2.4, 0, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.6 + 0.3 * Math.sin(this.t * 6), 0); }
    if (s.pod) { const [x, y] = L(s.pod); const c = COL[s.pod.level ? s.pod.color : 'P']; sb.add(x, y, -0.2, 2.6, 2.6, 0, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.8, 0); }
    if (p.alive && p.charge > 0.05) { const k = p.charge; const c = k >= 1 ? [1.2, 1.6, 2] : COL.C; sb.add(px + 1.05, py, 0.2, 1 + k * 2.6, 1 + k * 2.6, this.t * 4, c[0], c[1], c[2], 0.5 + 0.4 * k, 2); }
    if (s.boss && s.boss.beamWarn > 0) { const b = s.boss; const a = (b.beamWarn % 10 < 5 ? 0.9 : 0.4); sb.add(FIELD_W / 2 - 2, b.beamY, 0.1, FIELD_W + 4, 0.12, 0, 2.2, 0.3, 0.4, a, 1); }
    this.parts.update(dt, sb);
    sb.end();
    this.drawBursts(s, L);
  }

  makeItem(kind) {
    const M = this.M, g = new THREE.Group();
    const c = new THREE.Color(colorOf[kind] || 0xffffff);
    const mat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.2), toneMapped: false });
    if (kind === 'S') { const a = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 4), mat); a.rotation.z = -Math.PI / 2; g.add(a); }
    else if (kind === 'B') { for (const y of [0.25, -0.25]) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat); o.position.y = y; g.add(o); } }
    else if (kind === 'P') { g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), mat)); }
    else { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat); o.scale.set(0.8, 1.2, 0.8); g.add(o); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 30), M.steel); g.add(ring);
    return g;
  }

  drawShots(s, sb, L) {
    for (const o of s.shots) {
      const [x, y] = L(o);
      switch (o.kind) {
        case 'pel': { const c = o.owner === 'p' ? [1.2, 1.8, 2.2] : o.owner === 'pod' ? [1.8, 1.2, 2.4] : [0.9, 2.2, 1.3]; sb.add(x, y, 0.2, 0.95, 0.3, Math.atan2(o.vy, o.vx), c[0], c[1], c[2], 1, 1); break; }
        case 'lance': { const len = Math.max(0.2, o.len), cxl = x - o.dir * len / 2; sb.add(cxl, o.y, 0.25, len + 0.3, o.w * 2.6, 0, 0.25, 1.3, 1.9, 1, 1); sb.add(cxl, o.y, 0.2, len + 0.8, o.w * 6, 0, 0.05, 0.3, 0.5, 0.35, 1); break; }
        case 'rico': { sb.add(x, y, 0.25, 1.5, 0.36, Math.atan2(o.vy, o.vx), 2.6, 0.5, 1.6, 1, 1); if (Math.random() < 0.8) this.parts.trail(x, y, 0.5, [1.4, 0.2, 0.8], 0.18); break; }
        case 'crawl': { sb.add(x, y, 0.25, o.r * 3, o.r * 3, 0, 2.6, 1.5, 0.4, 1, 0); this.parts.trail(x, y, o.r * 2.2, [1.5, 0.7, 0.1], 0.3); break; }
      }
    }
  }

  drawBursts(s, L) {
    const bursts = s.shots.filter((o) => o.kind === 'burst');
    while (this.burstObjs.length < bursts.length) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uTime: U.time, uLv: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform float uTime; uniform float uLv; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.-abs(vN.z), 1.5); float w = 0.5+0.5*sin(vP.x*9.-uTime*30.+vP.y*4.); vec3 c = mix(vec3(0.15,0.8,1.5), vec3(0.9,0.45,1.6), w*0.7) * (0.25 + f*1.3) * (0.7+uLv*0.1); gl_FragColor = vec4(c, 0.8); }',
      });
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); m.scale.set(1.4, 0.9, 0.9); g.add(m);
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 32), this.M.gCyan); r.rotation.y = Math.PI / 2; g.add(r);
      this.field.add(g); this.burstObjs.push({ g, m, r, mat });
    }
    this.burstObjs.forEach((bo, k) => {
      const o = bursts[k]; bo.g.visible = !!o;
      if (!o) return;
      const [x, y] = L(o); bo.g.position.set(x, y, 0.2); bo.g.scale.setScalar(o.r); bo.mat.uniforms.uLv.value = o.lv;
      bo.r.rotation.x = this.t * 12; bo.r.scale.setScalar(1 + 0.15 * Math.sin(this.t * 30));
      if (Math.random() < 0.7) this.parts.trail(x - o.r, y + (Math.random() - 0.5) * o.r, o.r * 0.9, [0.3, 1.0, 1.6], 0.25);
    });
  }

  drawBullets(s, sb, L) {
    for (const b of s.ebullets) {
      const [x, y] = L(b);
      switch (b.kind) {
        case 'needle': sb.add(x, y, 0.3, 0.75, 0.3, Math.atan2(b.vy, b.vx), 2.6, 0.9, 1.6, 1, 1); break;
        case 'big': if (b.beam) sb.add(x, y, 0.3, 2.2, b.r * 3.2, 0, 2.8, 1.6, 0.5, 1, 1); else { sb.add(x, y, 0.3, b.r * 3.4, b.r * 3.4, 0, 2.4, 0.4, 0.9, 1, 0); sb.add(x, y, 0.28, b.r * 4.6, b.r * 4.6, this.t * 3, 1.4, 0.2, 0.6, 0.8, 2); } break;
        case 'flame': { const k = b.t / b.life; sb.add(x, y, 0.2, 1.2 + k * 1.6, 1.2 + k * 1.6, 0, 2.4 * (1 - k * 0.5), 1.1 * (1 - k), 0.3 * (1 - k), 1 - k * 0.7, 0); break; }
        default: sb.add(x, y, 0.3, b.r * 3.6, b.r * 3.6, 0, 2.6, 0.55, 0.75, 1, 0);
      }
    }
  }

  // ゲームのイベント（爆発・火花など）
  handle(events) {
    for (const ev of events) {
      if (ev.t !== 'fx') continue;
      const c = COL[ev.c] || COL.w;
      if (ev.k === 'boom') this.parts.boom(ev.x, ev.y, ev.s, ev.c === 'big' ? [1.4, 1.2, 1.6] : c, this.lite);
      else if (ev.k === 'spark') this.parts.spark(ev.x, ev.y, ev.s, c);
      else if (ev.k === 'pickup') { for (let k = 0; k < 3; k++) this.parts.spawn({ x: ev.x, y: ev.y, z: 0.2, vx: 0, vy: 0, vz: 0, life: 0.4 + k * 0.12, t: 0, w: 1 + k, h: 0, r: c[0] * 2, g: c[1] * 2, b: c[2] * 2, sh: 2, drag: 1, grow: 2.5 }); }
    }
  }

  setViewportHeight(h, dpr = 1) { if (this.starMat) { this.starMat.uniforms.uVH.value = h; this.starMat.uniforms.uDpr.value = dpr; } }
}

