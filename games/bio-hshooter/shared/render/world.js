// VOIDBLOOM — ゲームの状態を 3D の場面にする（大画面と VR で共通）
// root ┬ sky（はるか遠くの星雲。動かない）
//      ├ scroll（地形・壁・近い星。x = -scrollX で動く → 奥にあるものほど遅く見える＝本物の視差）
//      └ field（自機・敵・弾。盤面座標そのまま）
import * as THREE from 'three';
import { FIELD_W, FIELD_H, lineAt } from '../game-core.js';
import { materials, colorOf, U, makeEnvironment } from './materials.js';
import { buildPlayer, buildPod, buildBit, buildEnemy, damp, dampAngle } from './models.js';
import { ENEMY } from '../enemies.js';
const rnd = (a, b) => a + Math.random() * (b - a);
const ENEMY_COLOR = Object.fromEntries(Object.entries(ENEMY).map(([k, v]) => [k, v.color || 'w']));
// 生き物（体液が飛ぶ）と機械（火花と煙）
const ORGANIC = new Set(['drifter', 'hookjaw', 'lantern', 'nodule', 'puff', 'spore', 'coilworm', 'hatcher', 'nit', 'ossuary', 'vesper', 'heart']);
const easeOutBack = (t) => { const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
import { SpriteBatch, Particles } from './sprites.js';
import { Atmosphere } from './atmosphere.js';
import { Ribbons } from './ribbons.js';

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
    this.key = new THREE.DirectionalLight(0xb8c8d8, 1.7); this.key.position.set(-6, 14, 12);
    this.under = new THREE.DirectionalLight(0x7dff4a, 1.4); this.under.position.set(4, -14, 8); // 下からの毒の照り返し
    this.rim = new THREE.DirectionalLight(0xff60c0, 1.1); this.rim.position.set(8, -4, -10);
    this.hemi = new THREE.HemisphereLight(0x3a5878, 0x120814, 0.9);
    this.root.add(this.key, this.rim, this.hemi, this.under, this.key.target, this.under.target);
    this.under.target.position.set(FIELD_W / 2, FIELD_H / 2, 0);
    this.key.target.position.set(FIELD_W / 2, FIELD_H / 2, 0);
    // 弾・火花
    this.sprites = new SpriteBatch(4096); this.sprites.mesh.renderOrder = 10; this.field.add(this.sprites.mesh);
    this.parts = new Particles(this.lite ? 1500 : 3500);
    // 煙・靄・湯気（暗くする合成）。光の板より先に描く
    this.darkSB = new SpriteBatch(this.lite ? 700 : 1400, 'dark'); this.darkSB.mesh.renderOrder = 9; this.field.add(this.darkSB.mesh);
    this.smoke = new Particles(this.lite ? 600 : 1300);
    // 奥ほど毒の色の闇に沈む霧（app が scene.fog に入れる）。VR は 1u=5.5cm なので m で指定
    this.fog = this.vr ? new THREE.Fog(0x000000, 1.9, 9) : new THREE.Fog(0x000000, 40, 175);
    this.veinMul = { value: 1 };
    this.atmos = new Atmosphere(this);
    // 光の帯（流線）: 機体・SEED・跳ねる光・這う光・速い敵・溜め撃ちの通った跡
    this.ribbons = new Ribbons(this.lite ? 4000 : 8000); this.field.add(this.ribbons.mesh);
    // 触手・鞭毛（鎖の節を伸ばした球で描く。材質ごとに 1 回の描画）
    const tg = new THREE.SphereGeometry(1, 8, 6);
    this.tendrils = {};
    for (const [k, mat] of [['flesh', this.M.flesh], ['teal', this.M.fleshTeal], ['bone', this.M.bone]]) { const im = new THREE.InstancedMesh(tg, mat, 600); im.count = 0; im.frustumCulled = false; this.field.add(im); this.tendrils[k] = im; }
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3(); this._X = new THREE.Vector3(1, 0, 0);
    // 自機など
    this.player = buildPlayer(); this.field.add(this.player.obj);
    this.pod = buildPod(); this.field.add(this.pod.obj);
    this.bits = [buildBit(), buildBit()]; for (const b of this.bits) this.field.add(b.obj);
    this.enemyObjs = new Map(); this.itemObjs = new Map(); this.burstObjs = []; this.ghosts = []; this.muzzles = []; this.lastAlive = true;
    this.stageObjs = []; this.blockObjs = [];
    this.t = 0; this.stage = null;
    this.clipPlanes = opts.clip ? [0, 1, 2, 3].map(() => new THREE.Plane()) : null;
    if (this.clipPlanes) for (const m of Object.values(this.M)) if (m.isMaterial) m.clippingPlanes = this.clipPlanes;
  }

  // VR: 盤面の長方形（＋余白 margin u）の外の地形・壁・敵を切り落とす。root の世界行列から毎フレーム計算
  updateClip(margin = 1.6) {
    if (!this.clipPlanes) return;
    this.root.updateWorldMatrix(true, false);
    const M = this.root.matrixWorld, n = new THREE.Vector3(), p = new THREE.Vector3();
    const defs = [[1, 0, -margin, 0], [-1, 0, FIELD_W + margin, 0], [0, 1, 0, -margin], [0, -1, 0, FIELD_H + margin]];
    defs.forEach(([nx, ny, px, py], k) => {
      p.set(nx ? px : FIELD_W / 2, ny ? py : FIELD_H / 2, 0).applyMatrix4(M);
      n.set(nx, ny, 0).transformDirection(M);
      this.clipPlanes[k].setFromNormalAndCoplanarPoint(n, p);
    });
  }

  // ---------------------------------------------------------------- 面の構築
  setStage(st) {
    if (this.stage === st) return;
    this.stage = st;
    for (const o of this.stageObjs) { o.parent && o.parent.remove(o); o.traverse((x) => { if (x.geometry && !x.geometry.userData.shared) x.geometry.dispose(); }); }
    this.stageObjs = []; this.blockObjs = [];
    const pal = st.palette;
    this.key.color.set(0xb8c8d8); this.rim.color.set(pal.glow).lerp(new THREE.Color(0xffffff), 0.15);
    this.under.color.set(pal.toxic ?? pal.accent);
    this.hemi.color.set(pal.fog).multiplyScalar(3); this.hemi.groundColor.set(pal.toxic ?? pal.flesh).multiplyScalar(0.12);
    this.pal = pal; this.baseHemi = 0.55; this.hemi.intensity = this.baseHemi;
    this.buildSky(pal);
    this.buildStars(st, pal);
    if (st.bottom.length) this.buildTerrain(st, st.bottom, -1, pal);
    if (st.top.length) this.buildTerrain(st, st.top, 1, pal);
    this.buildBlocks(st, pal);
    this.atmos.build(st, pal); // 空と星のあとで（星の画面倍率を共有するため）
  }

  add(o, parent = this.scroll) { parent.add(o); this.stageObjs.push(o); return o; }

  // 星雲は面ごとに 1 回だけテクスチャへ焼く（毎フレームのノイズ計算をやめて Quest の GPU を節約）
  buildSky(pal) {
    const [c1, c2] = pal.nebula.map((h) => new THREE.Color(h));
    const W = this.lite ? 2048 : 4096, H = W / 2;
    if (!this.skyRT) {
      this.skyRT = new THREE.WebGLRenderTarget(W, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      this.bakeMat = new THREE.ShaderMaterial({
        uniforms: { c1: { value: c1 }, c2: { value: c2 }, sky: { value: new THREE.Color() } }, depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
        fragmentShader: `uniform vec3 c1; uniform vec3 c2; uniform vec3 sky; varying vec2 vUv;
          float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
          float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
          float fbm(vec3 p){ float a=0.5, s=0.; for(int k=0;k<6;k++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
          void main(){ float phi = vUv.x * 6.2831853, th = (1.0 - vUv.y) * 3.1415927;
            vec3 d = vec3(-cos(phi)*sin(th), cos(th), sin(phi)*sin(th));
            // ドメインワープ: ノイズで座標をねじって、渦を巻く毒の雲にする
            vec3 q = vec3(fbm(d*1.6+vec3(1.7)), fbm(d*1.6+vec3(9.2)), fbm(d*1.6+vec3(4.4)));
            float a = fbm(d*2.4 + q*2.2 + vec3(3.1)); float b = fbm(d*3.9 - q*1.6 - vec3(1.7));
            float band = exp(-pow(d.y*2.4 - 0.3*sin(d.x*3.), 2.));
            vec3 col = sky + c1 * pow(smoothstep(0.48, 0.92, a), 1.8) * 0.5 * (0.3+band) + c2 * pow(smoothstep(0.52, 0.95, b), 2.0) * 0.4;
            // 細い毒の筋（雲のふちだけ明るく）
            float edge = smoothstep(0.015, 0.0, abs(a - 0.62)) * 0.3; col += c1 * edge * 1.2;
            // 光を呑む暗黒の穴
            float hole = smoothstep(0.42, 0.62, fbm(d*1.2 + q - vec3(5.0))); col *= mix(1.0, 0.06, hole);
            gl_FragColor = vec4(col, 1.); }`,
      });
      this.bakeScene = new THREE.Scene();
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat); q.frustumCulled = false; this.bakeScene.add(q);
      this.bakeCam = new THREE.Camera();
    }
    this.bakeMat.uniforms.c1.value.copy(c1); this.bakeMat.uniforms.c2.value.copy(c2); this.bakeMat.uniforms.sky.value.set(pal.sky);
    const r = this.renderer, xr = r.xr.enabled, prevRT = r.getRenderTarget(), tm = r.toneMapping;
    r.xr.enabled = false; r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.skyRT); r.render(this.bakeScene, this.bakeCam);
    r.setRenderTarget(prevRT); r.xr.enabled = xr; r.toneMapping = tm;
    const geo = new THREE.SphereGeometry(this.vr ? 900 : 1500, 64, 32); geo.userData.shared = false;
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.skyRT.texture, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }));
    sky.position.set(FIELD_W / 2, FIELD_H / 2, 0); sky.renderOrder = -10; sky.frustumCulled = false;
    this.add(sky, this.skyG);
  }

  buildStars(st, pal) {
    const N = this.lite ? 1500 : 3000, pos = new Float32Array(N * 3), sz = new Float32Array(N), col = new Float32Array(N * 3);
    const x0 = -150, x1 = (st.bossStop || 300) + 220;
    const tint = [new THREE.Color(0x8fa0b0), new THREE.Color(0x9a8f80), new THREE.Color(pal.toxic ?? pal.glow).multiplyScalar(0.8), new THREE.Color(0x707a84)];
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
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord*2.-1.; float a = smoothstep(1.,0.,length(d)); a*=a; gl_FragColor = vec4(vC*a*vA*1.0, a*vA); }',
    });
    const pts = new THREE.Points(g, this.starMat); pts.frustumCulled = false; pts.renderOrder = -5;
    this.add(pts);
  }

  buildTerrain(st, pts, sign, pal) {
    // 輪郭を Catmull-Rom で 3 倍に細かく補う（当たり判定の点はそのまま通るので、見た目だけが折れ線からなめらかな曲線になる）
    { const out = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let k = 0; k < 3; k++) { const t = k / 3, t2 = t * t, t3 = t2 * t; out.push([p1[0] + (p2[0] - p1[0]) * t, 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); } }
      out.push(pts[pts.length - 1]); pts = out; }
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
        tmp.copy(cf).lerp(cm, mw).multiplyScalar((0.85 + vnoise(x * 1.3, r * 3.1) * 0.3) * 0.62);
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.42, envMap: this.env, clippingPlanes: this.clipPlanes });
    const vein = new THREE.Color(pal.toxic ?? pal.glow).multiplyScalar(1.15), ooze = new THREE.Color(pal.glow).multiplyScalar(0.9);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.time; sh.uniforms.uVein = { value: vein }; sh.uniforms.uOoze = { value: ooze }; sh.uniforms.uVeinMul = this.veinMul;
      sh.vertexShader = 'attribute float aMetal; varying float vMetal; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMetal = aMetal; vWP = position;');
      sh.fragmentShader = 'uniform float uTime; uniform vec3 uVein; uniform vec3 uOoze; uniform float uVeinMul; varying float vMetal; varying vec3 vWP;\n' + sh.fragmentShader
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(0.05, 0.95, vMetal);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.22, 0.5, vMetal);')   // 肉は濡れて光り、金属は錆びて鈍い
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float mask = smoothstep(0.55, 0.8, sin(vWP.x * 0.13 + vWP.z * 0.4) * 0.5 + 0.5 + sin(vWP.x * 0.31 - vWP.y * 0.2) * 0.25);
          float vv = abs(sin(vWP.x * 2.3 + sin(vWP.z * 1.1 + vWP.y * 1.3 + vWP.x * 0.37) * 2.4 + uTime * 0.35));
          vv = smoothstep(0.985, 1.0, vv) * (1.0 - vMetal) * mask * (0.5 + 0.5 * sin(uTime * 2.0 + vWP.x * 0.5)) * 0.4;
          // 流れる膿: 地形に沿って筋がゆっくり流れ下る
          float flow = smoothstep(0.993, 1.0, sin(vWP.x * 1.9 - uTime * 1.1 + sin(vWP.z * 1.3 + vWP.y * 0.9) * 2.5)) * (1.0 - vMetal) * mask * 0.35;
          // 金属の腐食の継ぎ目にかすかな毒の光
          float rust = smoothstep(0.92, 1.0, abs(sin(vWP.x * 1.9 + vWP.y * 0.7))) * vMetal * 0.06;
          totalEmissiveRadiance += (uVein * (vv * 1.6 + rust) + uOoze * flow) * uVeinMul;`);
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
          const strip = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.96, 0.06, 0.06), M.gHull);
          strip.position.set(0, (b.y > 9 ? -1 : 1) * (b.h / 2 - 0.25), depth / 2 + 0.02); o.add(strip);
        }
        if (b.kind === 'plate') { const e = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.02, 0.08, 1.7), M.gAmber); e.position.y = b.h / 2 - 0.05; o.add(e); }
        if (b.kind === 'nozzle') { o.geometry.dispose(); o.geometry = new THREE.CylinderGeometry(0.75, 0.6, b.w, 14); o.rotation.z = Math.PI / 2; }
      }
      if (this.clipPlanes) o.traverse((x) => { if (x.material && !x.material.clippingPlanes) x.material.clippingPlanes = this.clipPlanes; });
      const holder = new THREE.Group(); holder.position.set(cx, cy, 0); holder.add(o);
      if (o.position.z === 0 && b.kind !== 'hull' && b.kind !== 'bow') o.position.z = -0.2;
      this.add(holder);
      this.blockObjs.push({ b, i: bi, o: holder });
    });
  }

  // ---------------------------------------------------------------- 毎フレーム
  // s: ゲーム状態、alpha: 補間（0〜1）、dt: 実時間の経過秒
  sync(s, alpha, dt) {
    dt = Math.max(1e-4, dt);
    this.t += dt; U.time.value = this.t;
    if (s.stage !== this.stage) this.setStage(s.stage);
    const scroll = lerp(s.pscroll ?? s.scrollX, s.scrollX, alpha);
    this.scrollSpeed = s.scrollSpeed || 0;
    this.scroll.position.x = -scroll;
    this.updateClip();
    // 補間。復帰点への巻き戻しなどで 3u 以上跳んだものは補間せずに置く（画面を横切る残像を出さない）
    const L = (e) => { const px0 = e.px ?? e.x, py0 = e.py ?? e.y; if (Math.abs(e.x - px0) > 3 || Math.abs(e.y - py0) > 3) return [e.x, e.y]; return [lerp(px0, e.x, alpha), lerp(py0, e.y, alpha)]; };
    // 描画上の速度（u/s、なめらかにならした値）
    const vel = (o, x, y) => {
      if (o.lx == null || Math.abs(x - o.lx) > 3 || Math.abs(y - o.ly) > 3) { o.lx = x; o.ly = y; o.vx = o.vx || 0; o.vy = o.vy || 0; return o; }
      o.vx = damp(o.vx || 0, (x - o.lx) / dt, 18, dt); o.vy = damp(o.vy || 0, (y - o.ly) / dt, 18, dt); o.lx = x; o.ly = y; return o;
    };
    // 壁（壊せる壁は被弾で弾む）
    for (const bo of this.blockObjs) {
      const blk = s.blocks[bo.i];
      const alive = blk ? blk.alive : true;
      bo.o.visible = alive && bo.b.x + bo.b.w > scroll - 12 && bo.b.x < scroll + FIELD_W + 40;
      bo.hit = damp(bo.hit || 0, blk && blk.flash >= 3 ? 1 : 0, blk && blk.flash >= 3 ? 40 : 14, dt);
      bo.o.scale.setScalar(1 + 0.05 * bo.hit);
    }
    // 自機・SEED・僚機
    const p = s.player, [px, py] = L(p);
    this.player.obj.position.set(px, py, 0);
    this.player.anim(p, this.t, alpha, dt, vel(this.player, px, py));
    if (s.pod) {
      const [x, y] = L(s.pod); const pv = vel(this.pod, x, y);
      this.pod.obj.visible = true; this.pod.obj.position.set(x, y, 0); this.pod.anim(s.pod, this.t, alpha, dt, pv);
      // 速く飛んでいるときは軌跡を残す
      const sp = Math.hypot(pv.vx, pv.vy);
      if (sp > 4) { const c = COL[s.pod.level ? s.pod.color : 'P']; this.ribbons.touch('pod', x, y, -0.1, 0.32, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], 0.38, Math.min(1, (sp - 4) / 10)); }
    } else { this.pod.obj.visible = false; this.pod.lx = null; }
    this.bits.forEach((bo, k) => { const b = s.bits[k]; bo.obj.visible = !!b; if (b) { const [x, y] = L(b); bo.obj.position.set(x, y, 0); bo.anim(b, this.t, alpha, dt, vel(bo, x, y)); } else bo.lx = null; });
    // 敵
    const seen = new Set();
    this.muzzles.length = 0;
    for (const im of Object.values(this.tendrils)) im.count = 0;
    const dying = s.mode === 'bossdown' ? Math.min(1, s.timer / 130) : 0;
    for (const e of s.enemies) {
      seen.add(e.id);
      let m = this.enemyObjs.get(e.id);
      const [x, y] = L(e);
      if (!m) {
        m = buildEnemy(e); this.enemyObjs.set(e.id, m); this.field.add(m.obj);
        if (this.clipPlanes) m.obj.traverse((o) => { if (o.material && o.material.clippingPlanes) o.material.clippingPlanes = this.clipPlanes; });
        m.age = 0; m.hit = 0; m.lastFlash = 0; m.head = Math.PI; m.turn = 0; m.obj.userData.anchored = !!e.anchored;
        m.kx = 0; m.kv = 0; m.recoil = 0; m.lastFire = e.fireT ?? -1; m.lastVx = 0; m.lastVy = 0; m.acc = 0;
        m.phase = ((e.id * 0.6180339) % 1) * 20;   // 個体ごとに動きの位相をずらす（群れが一斉に同じ動きをしない）
        m.popIn = !e.boss && x > 0.5 && x < FIELD_W - 0.5;
        m.r = e.r; m.color = e.boss ? 'w' : (ENEMY_COLOR[e.type] || 'w');
        m.type = e.type; m.org = ORGANIC.has(e.type); m.jig = { x: 0, v: 0 }; m.emitT = 0; m.dmgT = 0; m.lastAccN = 0;
        m.emit = (type, lx2, ly2) => this.emitLocal(m, type, lx2, ly2);
      }
      m.age += dt;
      vel(m, x, y);
      // 加速度（向きの変わり方と伸び縮みに使う）
      const ax = (m.vx - m.lastVx) / dt, ay = (m.vy - m.lastVy) / dt; m.lastVx = m.vx; m.lastVy = m.vy;
      m.acc = damp(m.acc, Math.hypot(ax, ay), 10, dt);
      // 被弾: 光と弾みはすぐ立ち上がって減衰。弾が来た向き（ほぼ右向き）へ押されて、ばねで戻る
      const newHit = e.flash > m.lastFlash;
      if (newHit || (e.flashSolid > 0 && e.flashSolid >= 2)) { m.hit = newHit ? 1 : Math.max(m.hit, 0.35); m.kv += (m.boss ? 1.2 : 7) * (newHit ? 1 : 0.4); }
      const blocked = e.flashSolid > 0;
      if (newHit && !m.boss) this.hitFx(m, x, y);
      if (m.org) {
        // 柔らかい体: ばね（減衰が弱い）で、撃たれたり急に曲がったりするとぶるんと揺れて収まる
        if (newHit) m.jig.v += 10;
        const accN = m.acc; if (accN - m.lastAccN > 25) m.jig.v += Math.min(4, (accN - m.lastAccN) * 0.03); m.lastAccN = accN;
        const K = 420, Cd = 7, h = 1 / 240; for (let t2 = 0; t2 < dt - 1e-6; t2 += h) { m.jig.v += (-K * m.jig.x - Cd * m.jig.v) * h; m.jig.x += m.jig.v * h; }
        const j = Math.max(-0.6, Math.min(0.6, m.jig.x)) * (m.boss ? 0.25 : 1);
        m.inner.scale.set(1 + j * 0.13, 1 - j * 0.11, 1 + j * 0.07);
      }
      m.lastFlash = e.flash; if (e.flashSolid > 0) e.flashSolid--;
      m.hit = damp(m.hit, 0, 11, dt);
      { const K = 260, C = 22, h = Math.min(dt, 1 / 60); for (let t2 = 0; t2 < dt - 1e-6; t2 += h) { m.kv += (-K * m.kx - C * m.kv) * h; m.kx += m.kv * h; } }
      // 撃った反動（撃った向きと逆へ下がって戻る）と発射炎
      if (e.fireT != null && e.fireT !== m.lastFire) { m.lastFire = e.fireT; m.recoil = 1; m.fireAng = e.fireAng ?? Math.PI; m.fireOx = e.fireOx || 0; m.fireOy = e.fireOy || 0; }
      m.recoil = damp(m.recoil, 0, 9, dt);
      if (m.recoil > 0.35) this.muzzles.push([x + (m.fireOx || Math.cos(m.fireAng) * m.r * 0.9), y + (m.fireOy || Math.sin(m.fireAng) * m.r * 0.9), m.recoil, m.boss]);
      const pop = m.popIn ? easeOutBack(Math.min(1, m.age / 0.2)) : 1;
      const k = m.boss ? 0.025 : 0.16;
      let sx = pop * (1 + k * m.hit), sy = pop * (1 - k * 0.6 * m.hit), sz = pop * (1 + k * 0.5 * m.hit);
      // 進行方向へ向ける＋曲がるときは内側へ傾く（バンク）＋生き物は速さ・加速に応じて伸び縮み
      m.inner.rotation.x = 0;
      if (m.face) {
        const sp = Math.hypot(m.vx, m.vy), prev = m.head;
        if (sp > 0.6) m.head = dampAngle(m.head, Math.atan2(m.vy, m.vx), 9, dt);
        const w = Math.atan2(Math.sin(m.head - prev), Math.cos(m.head - prev)) / dt;
        m.turn = damp(m.turn, w, 8, dt);
        m.inner.rotation.x = Math.max(-1.0, Math.min(1.0, -m.turn * 0.35));
        const right = Math.cos(m.head) > 0;
        m.obj.rotation.z = m.head - Math.PI;
        if (m.organic) { const st = 1 + Math.min(0.22, sp * 0.012 + m.acc * 0.004); sx *= st; sy /= Math.sqrt(st); sz /= Math.sqrt(st); }
        if (right) sy = -sy;
      }
      m.obj.scale.set(sx, sy, sz);
      let jx = 0, jy = 0, rz = m.face ? m.obj.rotation.z : 0;
      // 撃破直前のボス: 揺れが強まりながら沈み、傾いていく
      if (e.dying) { const q = this.t * 40, A = 0.1 + dying * 0.35; jx = (Math.sin(q) + 0.5 * Math.sin(q * 1.7)) * A; jy = Math.cos(q * 1.3) * A - dying * dying * 1.2; rz = dying * 0.35 * (e.id % 2 ? 1 : -1); }
      if (!m.face) m.obj.rotation.z = rz;
      const rc = m.recoil * (m.boss ? 0.12 : 0.22);
      m.obj.position.set(x + jx + m.kx * (m.boss ? 0.05 : 0.08) - Math.cos(m.fireAng || 0) * rc, y + jy - Math.sin(m.fireAng || 0) * rc, e.boss ? -0.4 : 0);
      if (m.flash) m.flash.userData.set(m.hit);
      m.anim(e, this.t + m.phase, alpha, dt, { vx: m.vx, vy: m.vy, vxRel: m.vx + (e.anchored ? s.scrollSpeed : 0), hit: m.hit, recoil: m.recoil,
        lookX: p.alive ? p.x - x : -1, lookY: p.alive ? p.y - y : 0, tick: s.tick, alpha, dying, x, y, emit: m.emit, blocked });
      m.cx = m.obj.position.x; m.cy = m.obj.position.y; m.anchored = !!e.anchored; m.flip = !!e.flip;
      if (m.chains) this.updateChains(m, e, dt);
      this.typeFx(m, e, x, y, dt, s);
    }
    // 消えた敵: 画面内なら、撃たれた向きへ弾かれて回りながら縮み、破片が飛ぶ
    for (const [id, m] of this.enemyObjs) if (!seen.has(id)) {
      this.enemyObjs.delete(id);
      const x = m.obj.position.x, y = m.obj.position.y;
      if (x > -1.5 && x < FIELD_W + 1.5) {
        this.ghosts.push({ m, t: 0, life: m.boss ? 0.6 : 0.34, s0: m.obj.scale.clone(), spin: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6),
          vx: m.vx * 0.4 + (m.boss ? 0 : 5), vy: m.vy * 0.4 + (Math.random() - 0.5) * 3 });
        if (m.r >= 0.4) this.debris(x, y, Math.round(3 + m.r * 5), m.r, m.color);
        this.deathFx(m, x, y);
      } else this.field.remove(m.obj);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.t += dt;
      const k = g.t / g.life;
      if (k >= 1) { this.field.remove(g.m.obj); this.ghosts.splice(i, 1); continue; }
      const sc = (1 - k) * (1 - k) * (1 + 0.25 * Math.sin(k * Math.PI));
      g.m.obj.scale.set(g.s0.x * sc, g.s0.y * sc, g.s0.z * sc);
      g.m.inner.rotation.z += g.spin * dt * (1 - k);
      g.vx *= Math.exp(-3 * dt); g.vy *= Math.exp(-3 * dt);
      g.m.obj.position.x += g.vx * dt - s.scrollSpeed * dt * (g.m.obj.userData.anchored ? 1 : 0);
      g.m.obj.position.y += g.vy * dt;
      if (g.m.flash) g.m.flash.userData.set(1 - k);
    }
    this.updateDebris(dt, s);
    for (const im of Object.values(this.tendrils)) { im.instanceMatrix.needsUpdate = true; }
    // 自機: やられた瞬間に機体が破片になって散る。入場中は噴射の軌跡
    if (this.lastAlive && !p.alive) { this.debris(px, py, 10, 0.9, 'C', true); }
    this.lastAlive = p.alive;
    if (p.alive) { const v = Math.hypot(this.player.vx || 0, this.player.vy || 0), a = 0.35 + Math.min(0.65, v * 0.06) + (p.enter > 0 ? 0.4 : 0);
      for (const [k, dy] of [['pe0', 0.07], ['pe1', -0.13]]) this.ribbons.touch(k, px - 0.98, py + dy, -0.2, 0.07, [0.35, 1.2, 1.7], 0.5, Math.min(1, a)); }
    // アイテム（現れるときにふくらむ・ゆっくり浮き沈み）
    const seenI = new Set();
    for (const it of s.items) {
      seenI.add(it.id);
      let m = this.itemObjs.get(it.id);
      if (!m) { m = this.makeItem(it.kind); m.userData.age = 0; this.itemObjs.set(it.id, m); this.field.add(m); }
      m.userData.age += dt;
      const [x, y] = L(it), sp = Math.hypot(it.vx || 0, it.vy || 0);
      // 吸い寄せられるほど速く回り、進む向きへ少し伸びる
      m.userData.spin = (m.userData.spin || 0) + dt * (2.4 + sp * 0.9);
      m.position.set(x, y, 0.3); m.rotation.y = m.userData.spin; m.rotation.x = Math.sin(this.t * 1.3 + it.id) * 0.4;
      const pop = easeOutBack(Math.min(1, m.userData.age / 0.25)), st = 1 + Math.min(0.3, sp * 0.02);
      m.scale.set(pop * st, pop / st, pop);
    }
    for (const [id, m] of this.itemObjs) if (!seenI.has(id)) { this.field.remove(m); this.itemObjs.delete(id); }
    // 光の板
    const sb = this.sprites; sb.begin();
    this.drawShots(s, sb, L);
    this.drawBullets(s, sb, L);
    for (const it of s.items) { const [x, y] = L(it); const c = COL[it.kind] || COL.w; sb.add(x, y, 0.1, 2.4, 2.4, 0, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.6 + 0.3 * Math.sin(this.t * 6), 0); }
    if (s.pod) { const [x, y] = L(s.pod); const c = COL[s.pod.level ? s.pod.color : 'P']; sb.add(x, y, -0.2, 2.6, 2.6, 0, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.8, 0); }
    this.chargeVis = damp(this.chargeVis || 0, p.alive ? p.charge : 0, 20, dt);
    if (this.chargeVis > 0.05) { const k = this.chargeVis; const c = p.charge >= 1 ? [1.2, 1.6, 2] : COL.C; sb.add(px + 1.15, py, 0.2, 1 + k * 2.6, 1 + k * 2.6, this.t * 4, c[0], c[1], c[2], 0.5 + 0.4 * k, 2); }
    if (s.boss && s.boss.beamWarn > 0) { const b = s.boss; const a = 0.45 + 0.45 * Math.sin(this.t * 30); sb.add(FIELD_W / 2 - 2, b.beamY, 0.1, FIELD_W + 4, 0.12, 0, 2.2, 0.3, 0.4, a, 1); }
    for (const [mx, my, k, boss] of this.muzzles) { const w = (boss ? 1.6 : 1.0) * (0.6 + k); sb.add(mx, my, 0.35, w, w, 0, 2.6 * k, 1.4 * k, 0.8 * k, k, 0); }
    this.parts.update(dt, sb);
    this.ribbons.update(dt);
    // 煙・靄（暗くする合成）
    const ds = this.darkSB; ds.begin(); this.smoke.update(dt, ds); ds.end();
    // 背景の空気（霧・稲妻・心拍・滴・泡・霞）
    this.atmos.update(dt, s, scroll);
    // 船体の灯火のちらつき（壊れかけた電気）
    { const f = Math.sin(this.t * 13) * Math.sin(this.t * 7.3 + 1) > 0.82 ? 0.25 : 1; this.M.gHull.color.setRGB(2 * f, 1.25 * f, 0.5 * f); }
    sb.end();
    this.drawBursts(s, L);
  }

  // 模型のローカル座標 → 盤面座標（入れ物の位置・向き・鏡、天井の敵の上下反転を考える）
  toField(m, lx2, ly2) {
    if (m.flip) { lx2 = -lx2; ly2 = -ly2; }
    const o = m.obj, sx = Math.sign(o.scale.x) || 1, sy = Math.sign(o.scale.y) || 1, c = Math.cos(o.rotation.z), sn = Math.sin(o.rotation.z);
    const px = lx2 * sx, py = ly2 * sy; return [o.position.x + px * c - py * sn, o.position.y + px * sn + py * c];
  }
  emitLocal(m, type, lx2, ly2) { const [x, y] = this.toField(m, lx2, ly2); this.emitAt(type, x, y, m.anchored ? (this.scrollSpeed || 0) : 0); }
  // 噴出: 蒸気（明るい）・煙（暗い）・火花・体液（毒の色、重さあり）・胞子
  emitAt(type, x, y, drift = 0, vx = 0, vy = 0) {
    const tox = this.pal ? new THREE.Color(this.pal.toxic ?? this.pal.accent) : new THREE.Color(0x7dff4a);
    if (type === 'steam') this.parts.spawn({ x, y, z: 0.4, vx: -drift + rnd(-0.4, 0.4) + vx, vy: rnd(0.8, 1.6) + vy, vz: 0, life: rnd(0.9, 1.4), t: 0, w: 0.6, h: 0, r: 0.22, g: 0.24, b: 0.26, sh: 3, drag: 0.98, grow: 2.6, fade: true });
    else if (type === 'smoke') this.smoke.spawn({ x, y, z: 0.35, vx: -drift + rnd(-0.3, 0.3) + vx, vy: rnd(0.6, 1.3) + vy, vz: 0, life: rnd(1.1, 1.8), t: 0, w: rnd(0.4, 0.7), h: 0, r: 0.015, g: 0.016, b: 0.014, a: 0.7, sh: 3, drag: 0.985, grow: 3, fade: true, curl: rnd(-1.2, 1.2) });
    else if (type === 'spark') this.parts.spark(x, y, 0.5, [1.7, 1.15, 0.55]);
    else if (type === 'ichor') this.parts.spawn({ x, y, z: 0.3, vx: -drift + vx, vy, vz: 0, grav: -4.5, life: rnd(0.6, 1.0), t: 0, w: rnd(0.09, 0.16), h: 0, r: tox.r * 1.5, g: tox.g * 1.5, b: tox.b * 1.5, sh: 0, drag: 0.96 });
    else if (type === 'spore') this.parts.spawn({ x, y, z: 0.2, vx: -drift + rnd(-0.4, 0.4) + vx, vy: rnd(-0.2, 0.5) + vy, vz: 0, life: rnd(1.2, 2.0), t: 0, w: 0.12, h: 0, r: tox.r * 1.2, g: tox.g * 1.2, b: tox.b * 1.2, sh: 0, drag: 0.98, fade: true });
  }
  // 素材ごとの被弾: 生き物は傷口から毒の体液が撃った側へ飛び、機械は火花
  hitFx(m, x, y) {
    if (m.org) for (let k = 0; k < 3; k++) this.emitAt('ichor', x - m.r * 0.6, y + rnd(-0.3, 0.3) * m.r, 0, -rnd(2.5, 6), rnd(-2.5, 2.5));
    else { this.parts.spark(x - m.r * 0.6, y + rnd(-0.4, 0.4) * m.r, 0.55, [1.8, 1.2, 0.6]); }
  }
  // 素材ごとの撃破: 生き物は毒の体液が四方へはじけて霞が残り、機械は火花と立ちのぼる黒煙
  deathFx(m, x, y) {
    const tox = this.pal ? new THREE.Color(this.pal.toxic ?? this.pal.accent) : new THREE.Color(0x7dff4a);
    if (m.org) {
      const n = Math.round(10 + m.r * 14) * (this.lite ? 0.6 : 1);
      for (let k = 0; k < n; k++) { const a2 = Math.random() * Math.PI * 2, v = rnd(2.5, 8) * (0.6 + m.r * 0.4); this.emitAt('ichor', x, y, 0, Math.cos(a2) * v, Math.sin(a2) * v); }
      this.parts.spawn({ x, y, z: 0.1, vx: -0.5, vy: 0.2, vz: 0, life: 1.6, t: 0, w: m.r * 2.4, h: 0, r: tox.r * 0.35, g: tox.g * 0.35, b: tox.b * 0.35, sh: 3, drag: 1, grow: 1.6, fade: true });
      for (let k = 0; k < 2; k++) this.emitAt('smoke', x + rnd(-0.3, 0.3), y + rnd(-0.3, 0.3));
    } else {
      for (let k = 0; k < 3; k++) this.parts.spark(x + rnd(-0.4, 0.4) * m.r, y + rnd(-0.4, 0.4) * m.r, 0.8, [1.9, 1.2, 0.5]);
      for (let k = 0; k < 4; k++) this.emitAt('smoke', x + rnd(-0.4, 0.4) * m.r, y + k * 0.25 * m.r, 0, 0, k * 0.3);
    }
  }
  // 種類ごとの常時の噴出と、損傷した見た目（体力が半分を切ると煙・火花・体液がしたたる）
  typeFx(m, e, x, y, dt, s) {
    m.emitT -= dt;
    const t = m.type, drift = e.anchored ? s.scrollSpeed : 0;
    if (t === 'skimmer') this.ribbons.touch('e' + e.id, x - Math.cos(m.head) * 0.55, y - Math.sin(m.head) * 0.55, -0.05, 0.12, [0.55, 0.5, 0.75], 0.55, 0.8);
    else if (t === 'hookjaw' && Math.hypot(m.vx, m.vy) > 5) this.ribbons.touch('e' + e.id, x - Math.cos(m.head) * 0.45, y - Math.sin(m.head) * 0.45, -0.05, 0.1, [0.6, 0.65, 0.8], 0.4, 0.6);
    else if (t === 'dart' && m.emitT <= 0) { m.emitT = 0.045; const bx = x - Math.cos(m.head) * 0.4, by = y - Math.sin(m.head) * 0.4; this.emitAt('smoke', bx, by, 0, 0, -0.5); }
    if (t === 'dart') this.ribbons.touch('e' + e.id, x - Math.cos(m.head) * 0.4, y - Math.sin(m.head) * 0.4, 0, 0.1, [1.9, 1.0, 0.3], 0.3);
    else if (t === 'spore' && Math.random() < 0.5) this.parts.trail(x, y, 0.16, [0.4, 1.2, 0.8], 0.25);
    else if (t === 'puff' && m.emitT <= 0) { m.emitT = 0.28; this.emitAt('spore', x + rnd(-0.6, 0.6), y + rnd(-0.6, 0.6), drift); }
    const hp = e.hp / (e.maxHp || 1);
    m.dmgT -= dt;
    if (!e.boss && (e.maxHp || 0) >= 4 && hp < 0.5 && m.dmgT <= 0) {
      if (m.org) { m.dmgT = 0.25; this.emitAt('ichor', x + rnd(-0.3, 0.3) * m.r, y - m.r * 0.5, drift, rnd(-0.3, 0.3), -0.5); }
      else { m.dmgT = 0.12; this.emitAt('smoke', x + rnd(-0.3, 0.3) * m.r, y + m.r * 0.3, drift); if (Math.random() < 0.18) this.parts.spark(x + rnd(-0.5, 0.5) * m.r, y + rnd(-0.5, 0.5) * m.r, 0.4, [1.8, 1.2, 0.6]); }
    }
    if (e.boss && hp < 0.4 && m.dmgT <= 0 && e.parts) {
      m.dmgT = 0.14; const q = e.parts[Math.floor(Math.random() * e.parts.length)];
      this.emitAt(m.org ? 'ichor' : 'smoke', x + q.ox, y + q.oy, drift, rnd(-1, 1), m.org ? -1 : 0.5);
      if (!m.org && Math.random() < 0.3) this.parts.spark(x + q.ox, y + q.oy, 0.6, [1.8, 1.2, 0.6]);
    }
  }
  // 触手（ベルレ積分の鎖）: 根元は模型に付き、先は慣性と抵抗で遅れて付いてくる
  updateChains(m, e, dt) {
    if (!m.cs) m.cs = m.chains.map((c) => { const [x, y] = this.toField(m, c.ax, c.ay); return { c, n: Array.from({ length: c.n }, (_, i) => ({ x: x + i * c.seg * 0.5, y, px: x + i * c.seg * 0.5, py: y })) }; });
    const h = 1 / 120, steps = Math.max(1, Math.min(4, Math.round(dt / h)));
    const scrollV = m.anchored ? -(this.scrollSpeed || 0) : 0;
    for (const ch of m.cs) {
      const c = ch.c, nodes = ch.n, [ax, ay] = this.toField(m, c.ax, c.ay);
      let bx = c.bx || 0, by = c.by || 0; if (m.flip) { bx = -bx; by = -by; }
      for (let st = 0; st < steps; st++) {
        nodes[0].x = ax; nodes[0].y = ay;
        for (let i = 1; i < nodes.length; i++) {
          const nd = nodes[i], vx = (nd.x - nd.px) * 0.9, vy = (nd.y - nd.py) * 0.9;
          nd.px = nd.x; nd.py = nd.y; nd.x += vx + (bx + Math.sin(this.t * 3 + i + m.phase) * 0.8) * h * h * 60 + scrollV * h; nd.y += vy + by * h * h * 60 + Math.cos(this.t * 2.3 + i * 1.7 + m.phase) * 0.0015;
        }
        for (let it = 0; it < 2; it++) for (let i = 1; i < nodes.length; i++) {
          const a2 = nodes[i - 1], b2 = nodes[i], dx = b2.x - a2.x, dy = b2.y - a2.y, d = Math.hypot(dx, dy) || 1e-4, k = (d - c.seg) / d;
          b2.x -= dx * k; b2.y -= dy * k;
        }
      }
      const im = this.tendrils[c.mat] || this.tendrils.flesh;
      for (let i = 1; i < nodes.length && im.count < 600; i++) {
        const a2 = nodes[i - 1], b2 = nodes[i], dx = b2.x - a2.x, dy = b2.y - a2.y, len = Math.hypot(dx, dy) || 1e-4;
        const r = c.r * (1 - (i - 1) / nodes.length * 0.7);
        this._v.set((a2.x + b2.x) / 2, (a2.y + b2.y) / 2, 0.05); this._d.set(dx / len, dy / len, 0); this._q.setFromUnitVectors(this._X, this._d); this._s.set(len * 0.6 + r, r, r);
        this._m4.compose(this._v, this._q, this._s); im.setMatrixAt(im.count++, this._m4);
      }
    }
  }

  // 破片: 小さな金属・殻のかけら。回りながら散り、縮んで消える（数は上限つきで使い回す）
  debris(x, y, n, r, color, player = false) {
    if (!this.debrisPool) { this.debrisPool = []; this.debrisGeo = [new THREE.TetrahedronGeometry(0.22, 0), new THREE.BoxGeometry(0.34, 0.08, 0.2), new THREE.OctahedronGeometry(0.16, 0)]; }
    const mats = player ? [this.M.steel, this.M.darkSteel, this.M.trim] : [this.M.darkSteel, this.M.bone, this.M.chitin];
    for (let k = 0; k < n; k++) {
      let d = this.debrisPool.find((q) => !q.alive);
      if (!d) { if (this.debrisPool.length >= 140) break; d = { mesh: new THREE.Mesh(this.debrisGeo[0], mats[0]) }; this.field.add(d.mesh); this.debrisPool.push(d); }
      d.mesh.geometry = this.debrisGeo[k % 3]; d.mesh.material = mats[k % mats.length];
      if (this.clipPlanes && d.mesh.material.clippingPlanes == null) d.mesh.material.clippingPlanes = this.clipPlanes;
      const a = Math.random() * Math.PI * 2, v = (2.5 + Math.random() * 6) * (0.6 + r * 0.5);
      Object.assign(d, { alive: true, t: 0, life: 0.5 + Math.random() * 0.5, x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5, z: (Math.random() - 0.5) * r,
        vx: Math.cos(a) * v + (player ? 0 : 1.5), vy: Math.sin(a) * v, vz: (Math.random() - 0.5) * 4, rx: (Math.random() - 0.5) * 20, ry: (Math.random() - 0.5) * 20, s: (0.6 + Math.random() * 0.8) * Math.max(0.7, r) });
      d.mesh.visible = true;
    }
  }
  updateDebris(dt, s) {
    if (!this.debrisPool) return;
    for (const d of this.debrisPool) {
      if (!d.alive) continue;
      d.t += dt; const k = d.t / d.life;
      if (k >= 1) { d.alive = false; d.mesh.visible = false; continue; }
      const dr = Math.exp(-2.2 * dt); d.vx *= dr; d.vy *= dr; d.vz *= dr;
      d.x += d.vx * dt - s.scrollSpeed * dt * 0.5; d.y += d.vy * dt; d.z += d.vz * dt;
      d.mesh.position.set(d.x, d.y, d.z); d.mesh.rotation.x += d.rx * dt; d.mesh.rotation.y += d.ry * dt;
      d.mesh.scale.setScalar(d.s * (1 - k * k));
      if (Math.random() < 0.25) this.parts.trail(d.x, d.y, 0.25, [1.2, 0.7, 0.4], 0.2);
    }
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
        case 'pel': {
          // 速さに沿った残像 2 枚＋撃った直後の小さな閃光
          const c = o.owner === 'p' ? [1.2, 1.8, 2.2] : o.owner === 'pod' ? [1.8, 1.2, 2.4] : [0.9, 2.2, 1.3], r = Math.atan2(o.vy, o.vx);
          for (let k = 2; k >= 1; k--) sb.add(x - o.vx * 0.011 * k, y - o.vy * 0.011 * k, 0.18, 0.95, 0.26, r, c[0], c[1], c[2], 0.5 / k, 1);
          sb.add(x, y, 0.2, 0.95, 0.3, r, c[0], c[1], c[2], 1, 1);
          if (o.t <= 2) sb.add(x - o.vx * 0.02, y, 0.22, 0.9, 0.9, 0, c[0], c[1], c[2], 0.6 * (1 - o.t / 3), 0);
          break; }
        case 'lance': { const len = Math.max(0.2, o.len), cxl = x - o.dir * len / 2; sb.add(cxl, o.y, 0.25, len + 0.3, o.w * 1.5, 0, 0.18, 0.95, 1.5, 1, 1); sb.add(cxl, o.y, 0.2, len + 0.8, o.w * 3.4, 0, 0.03, 0.22, 0.42, 0.28, 1); if (!o.stopped) sb.add(x, o.y, 0.26, o.w * 4, o.w * 4, 0, 0.4, 1.4, 2.0, 0.8, 0); break; }
        case 'rico': { sb.add(x, y, 0.25, 1.1, 0.3, Math.atan2(o.vy, o.vx), 2.6, 0.5, 1.6, 1, 1); this.ribbons.touch('r' + o.id, x, y, 0.2, 0.13, [2.2, 0.35, 1.3], 0.22); break; }
        case 'crawl': { sb.add(x, y, 0.25, o.r * 3, o.r * 3, 0, 2.6, 1.5, 0.4, 1, 0); this.ribbons.touch('c' + o.id, x, y, 0.2, o.r * 0.7, [2.2, 1.1, 0.25], 0.32); break; }
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
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat); m.scale.set(1.9, 0.78, 0.78); m.position.x = -0.35; g.add(m); // 溜め撃ちは前へ伸びた涙形
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 32), this.M.gCyan); r.rotation.y = Math.PI / 2; g.add(r);
      this.field.add(g); this.burstObjs.push({ g, m, r, mat });
    }
    this.burstObjs.forEach((bo, k) => {
      const o = bursts[k]; bo.g.visible = !!o;
      if (!o) return;
      const [x, y] = L(o); bo.g.position.set(x, y, 0.2); bo.g.scale.setScalar(o.r); bo.mat.uniforms.uLv.value = o.lv;
      bo.r.rotation.x = this.t * 12; bo.r.scale.setScalar(1 + 0.15 * Math.sin(this.t * 30));
      for (let k = 0; k < 2; k++) { const ph = this.t * 22 + k * Math.PI; this.ribbons.touch('bs' + o.id + k, x - o.r * 0.6, y + Math.sin(ph) * o.r * 0.75, Math.cos(ph) * o.r * 0.5, o.r * 0.12, k ? [1.2, 0.6, 2.0] : [0.3, 1.3, 2.0], 0.3); }
      this.ribbons.touch('bc' + o.id, x - o.r * 0.4, y, 0, o.r * 0.45, [0.2, 0.8, 1.4], 0.22, 0.6);
    });
  }

  drawBullets(s, sb, L) {
    for (const b of s.ebullets) {
      const [x, y] = L(b);
      switch (b.kind) {
        case 'needle': { const r = Math.atan2(b.vy, b.vx); sb.add(x - b.vx * 0.03, y - b.vy * 0.03, 0.29, 0.75, 0.22, r, 1.6, 0.5, 1.0, 0.35, 1); sb.add(x, y, 0.3, 0.75, 0.3, r, 2.6, 0.9, 1.6, 1, 1); break; }
        case 'big': if (b.beam) sb.add(x, y, 0.3, 2.2, b.r * 3.2, 0, 2.8, 1.6, 0.5, 1, 1); else { sb.add(x, y, 0.3, b.r * 3.4, b.r * 3.4, 0, 2.4, 0.4, 0.9, 1, 0); sb.add(x, y, 0.28, b.r * 4.6, b.r * 4.6, this.t * 3, 1.4, 0.2, 0.6, 0.8, 2); } break;
        case 'flame': { const k = b.t / b.life; sb.add(x, y, 0.2, 1.2 + k * 1.6, 1.2 + k * 1.6, 0, 2.4 * (1 - k * 0.5), 1.1 * (1 - k), 0.3 * (1 - k), 1 - k * 0.7, 0); break; }
        default: {
          // 撃ち出した瞬間にふくらんで縮む（どこから撃たれたかが一瞬で分かる）＋進行方向の後ろに淡い残像
          const pop = 1 + 0.9 * Math.max(0, 1 - b.t / 7), w = b.r * 3.6 * pop;
          sb.add(x - b.vx * 0.035, y - b.vy * 0.035, 0.29, b.r * 2.6, b.r * 2.6, 0, 1.6, 0.3, 0.45, 0.35, 0);
          sb.add(x, y, 0.3, w, w, 0, 2.6, 0.55, 0.75, 1, 0);
        }
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

