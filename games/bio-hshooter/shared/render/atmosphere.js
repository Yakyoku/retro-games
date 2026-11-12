// VOIDBLOOM — 背景の空気（毒々しい暗黒）。world.setStage で build、world.sync で update。
// 奥から: 星雲（焼き込み）→ 蝕の死んだ惑星 → 巨大な花の影（目が光る）→ 毒の霧の層 → 胞子 → 地形 → 灰（手前）
// 画面の中: 天井からの毒の滴、床からの泡、床を這う霞、時々の毒の稲妻、第 4 面は全体が心臓のように脈打つ
import * as THREE from 'three';
import { FIELD_W, FIELD_H, ceilAt, floorAt, lineAt } from '../game-core.js';
import { U } from './materials.js';

const rnd = (a, b) => a + Math.random() * (b - a);
// 継ぎ目のない 256×256 のノイズ（霧の模様）。一度だけ作る
let NOISE = null;
function noiseTexture() {
  if (NOISE) return NOISE;
  const S = 256, data = new Uint8Array(S * S * 4);
  const grid = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; };
  const octs = [[8, 0.5], [16, 0.25], [32, 0.15], [64, 0.1]].map(([n, w]) => ({ n, w, g: grid(n) }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const o of octs) {
      const fx = x / S * o.n, fy = y / S * o.n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), g = o.g, n = o.n;
      const a = g[(iy % n) * n + ix % n], b = g[(iy % n) * n + (ix + 1) % n], c = g[((iy + 1) % n) * n + ix % n], d = g[((iy + 1) % n) * n + (ix + 1) % n];
      v += o.w * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    const k = (y * S + x) * 4; data[k] = data[k + 1] = data[k + 2] = Math.round(Math.min(1, v) * 255); data[k + 3] = 255;
  }
  NOISE = new THREE.DataTexture(data, S, S); NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping; NOISE.magFilter = THREE.LinearFilter; NOISE.minFilter = THREE.LinearMipmapLinearFilter; NOISE.generateMipmaps = true; NOISE.needsUpdate = true;
  return NOISE;
}
// 心臓の拍（どくん・どくん）0〜1
export function heartbeat(t, bpm = 58) { const p = (t * bpm / 60) % 1; return Math.exp(-Math.pow((p - 0.05) / 0.035, 2)) + 0.65 * Math.exp(-Math.pow((p - 0.2) / 0.04, 2)); }

export class Atmosphere {
  constructor(world) {
    this.w = world; this.lite = world.lite; this.vr = world.vr; this.objs = [];
    this.flash = 0; this.nextBolt = rnd(5, 10); this.dark = 0; this.mistT = 0; this.wispT = 2;
  }
  add(o, parent) { parent.add(o); this.objs.push(o); return o; }
  clear() { for (const o of this.objs) { o.parent && o.parent.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); } this.objs = []; }

  build(st, pal) {
    this.clear(); this.st = st; this.pal = pal;
    const W = this.w, x0 = -160, x1 = (st.bossStop || 300) + 240;
    const fogC = new THREE.Color(pal.fog), tox = new THREE.Color(pal.toxic ?? pal.accent), glow = new THREE.Color(pal.glow);
    this.toxC = tox; this.fogC = fogC;
    // --- 毒の霧の層（ノイズを 2 回ずらして重ね、ふちだけ毒の色に光らせる。普通の合成なので奥の星を隠して暗くする）
    // 画面いっぱいの半透明の板は重いので、大画面 2 層、スマホと VR は 1 層
    const layers = this.vr || this.lite ? [[-60, 0.62]] : [[-34, 0.42], [-100, 0.6]];
    this.fogMats = [];
    for (const [z, dens] of layers) {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, toneMapped: false,
        uniforms: { tN: { value: noiseTexture() }, uTime: U.time, uCol: { value: fogC.clone().multiplyScalar(0.9) }, uTox: { value: tox.clone() }, uD: { value: dens }, uZ: { value: z }, uFlash: { value: 0 }, uBeat: { value: 0 } },
        vertexShader: 'varying vec2 vW; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vW = position.xy; gl_Position = projectionMatrix*viewMatrix*wp; }',
        fragmentShader: `uniform sampler2D tN; uniform float uTime, uD, uZ, uFlash, uBeat; uniform vec3 uCol, uTox; varying vec2 vW;
          void main(){ vec2 p = vW * 0.0045; p += 0.035 * vec2(sin(p.y * 9.0 + uTime * 0.05), cos(p.x * 7.0 - uTime * 0.04));
            float n = texture2D(tN, p + vec2(uTime * 0.003, uZ * 0.013), 2.0).r, m = texture2D(tN, p * 1.9 - vec2(uTime * 0.005, uTime * 0.002), 1.5).r;
            float v = n * 0.65 + m * 0.35;
            float f = smoothstep(0.38, 0.8, v);                       // 霧の濃さ（なめらかに）
            float rim = exp(-pow((v - 0.6) / 0.025, 2.0));            // 雲のふちの細い毒の光
            vec3 c = uCol * (0.5 + 0.5 * f) + uTox * (rim * 0.05 + uFlash * 0.18 * f + uBeat * 0.04 * f);
            gl_FragColor = vec4(c, f * uD); }`,
      });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 400, 260), m);
      pl.position.set((x0 + x1) / 2, FIELD_H / 2, z); pl.renderOrder = -4; pl.frustumCulled = false;
      this.add(pl, W.scroll); this.fogMats.push(m);
    }
    // --- 流れる光の筋（ゆるい曲線の細い帯。帯に沿って光が流れる）
    {
      const nF = this.vr || this.lite ? 6 : 12, pos = [], uvs = [], idx = []; let v = 0;
      for (let f = 0; f < nF; f++) {
        const z = rnd(-22, -70), y0 = rnd(-6, FIELD_H + 6), amp = rnd(2, 7), wl = rnd(30, 70), ph = rnd(0, 6.28), w = rnd(0.06, 0.16), seg = 260;
        for (let i = 0; i <= seg; i++) {
          const x = x0 + (x1 - x0) * i / seg, y = y0 + Math.sin(x / wl + ph) * amp + Math.sin(x / (wl * 0.37) + ph * 2) * amp * 0.25;
          const dy = Math.cos(x / wl + ph) * amp / wl, nl = Math.hypot(1, dy);
          pos.push(x + dy / nl * w, y - 1 / nl * w, z, x - dy / nl * w, y + 1 / nl * w, z); uvs.push(i / seg * 40 + f * 3.1, -1, i / seg * 40 + f * 3.1, 1);
          if (i < seg) { idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); } v += 2;
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide,
        uniforms: { uTime: U.time, uCol: { value: tox.clone().lerp(glow, 0.4) } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform float uTime; uniform vec3 uCol; varying vec2 vU; void main(){ float e = 1.0 - abs(vU.y); float flow = pow(0.5 + 0.5 * sin(vU.x * 1.3 - uTime * 0.9), 6.0); float a = e * e * (0.06 + 0.32 * flow); gl_FragColor = vec4(uCol * a, a); }' });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -3; this.add(mesh, W.scroll);
    }
    // --- 巨大な花の影（はるか奥に立つ茎と触手。霧に溶けて黒い影になる）
    const silMat = new THREE.MeshBasicMaterial({ color: fogC.clone().multiplyScalar(0.35) }); // 光を受けない黒い影（霧で奥ほど霧の色に溶ける）
    const eyesPos = [], eyesPh = [];
    for (let x = x0 + 40; x < x1; x += rnd(45, 75)) {
      const z = rnd(-75, -115), h = rnd(25, 55), top = Math.random() < 0.5;
      const pts = []; const sway = rnd(-12, 12), base = top ? FIELD_H + 40 : -40;
      const s2 = rnd(4, 9) * (Math.random() < 0.5 ? -1 : 1);
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(x + sway * Math.sin(t * 2.2) + s2 * Math.sin(t * Math.PI * 2), base + (top ? -1 : 1) * h * t, z + Math.sin(t * 3) * 6)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const R = rnd(3, 6.5), tub = 80, rad = 14, g = new THREE.TubeGeometry(curve, tub, R, rad, false);
      // 先へ行くほど細く（茎・触手らしく）
      const pos = g.attributes.position, tmp = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { const t = Math.floor(i / (rad + 1)) / tub; const c = curve.getPointAt(Math.min(1, t)); tmp.fromBufferAttribute(pos, i).sub(c).multiplyScalar(Math.max(0.08, 1 - t * 0.92)).add(c); pos.setXYZ(i, tmp.x, tmp.y, tmp.z); }
      g.computeVertexNormals();
      this.add(new THREE.Mesh(g, silMat), W.scroll);
      // 影に光る目（二つ一組）
      if (Math.random() < 0.7) { const c = curve.getPointAt(rnd(0.35, 0.7)); for (const dx of [-0.9, 0.9]) { eyesPos.push(c.x + dx, c.y, c.z + R * 0.8); eyesPh.push(x * 0.37); } }
    }
    if (eyesPos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(eyesPos, 3)); g.setAttribute('aPh', new THREE.Float32BufferAttribute(eyesPh, 1));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
        uniforms: { uTime: U.time, uCol: { value: tox.clone().lerp(new THREE.Color(0xffffff), 0.2) }, uVH: W.starMat ? W.starMat.uniforms.uVH : { value: 1080 } },
        vertexShader: 'attribute float aPh; uniform float uTime, uVH; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; float cyc = mod(uTime*0.13 + aPh, 1.0); float open = smoothstep(0.0,0.04,cyc)*(1.0-smoothstep(0.5,0.53,cyc)); float blink = step(0.02, abs(fract(uTime*0.4+aPh*3.1)-0.5)); vA = open*blink; gl_PointSize = max(2.0, 1.1 * projectionMatrix[1][1] * uVH * 0.5 / -mv.z); }',
        fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 d = gl_PointCoord*2.-1.; float a = smoothstep(1.,0.,length(d*vec2(1.,2.2))); gl_FragColor = vec4(uCol*a*vA*1.8, a*vA); }' });
      const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -3; this.add(p, W.scroll);
    }
    // --- 蝕の死んだ惑星（黒い本体のふちだけ毒の光）
    {
      const Rp = this.vr ? 40 : 60, d = this.vr ? 650 : 1100;
      const m = new THREE.ShaderMaterial({ fog: false, toneMapped: false, depthWrite: false, uniforms: { uTox: { value: tox.clone() }, uTime: U.time },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'uniform vec3 uTox; uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float r = 1.0 - max(dot(vN, vV), 0.0); float rim = pow(r, 5.0) * (0.75 + 0.25*sin(uTime*0.3)); float side = smoothstep(-0.2, 0.8, vN.x*0.7 + vN.y*0.7); vec3 c = uTox * rim * (0.3 + 1.8*side) + vec3(0.004); gl_FragColor = vec4(c, 1.0); }' });
      const pl = new THREE.Mesh(new THREE.SphereGeometry(Rp, 48, 32), m);
      pl.position.set(FIELD_W / 2 + d * 0.36, FIELD_H / 2 + d * 0.2, -d); pl.renderOrder = -9;
      this.add(pl, W.skyG);
      const halo = new THREE.Mesh(new THREE.RingGeometry(Rp * 1.0, Rp * 1.6, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, uniforms: { uTox: { value: tox.clone() }, uR: { value: Rp } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform vec3 uTox; uniform float uR; varying vec2 vP; void main(){ float d = (length(vP) - uR) / (uR*0.6); float a = exp(-d*5.0) * (0.6 + 0.4*smoothstep(-0.5, 0.8, normalize(vP).x*0.7+normalize(vP).y*0.7)); gl_FragColor = vec4(uTox*a*0.35, a*0.35); }' }));
      halo.position.copy(pl.position); halo.renderOrder = -9; halo.lookAt(FIELD_W / 2, FIELD_H / 2, 40); this.add(halo, W.skyG);
    }
    // --- 胞子（中くらいの奥行きを漂う毒の光の粒）と灰（手前を落ちる黒い薄片）
    const mkPts = (n, zr, color, add, size, fall) => {
      const pos = new Float32Array(n * 3), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i * 3] = rnd(x0, x1); pos[i * 3 + 1] = rnd(-12, FIELD_H + 12); pos[i * 3 + 2] = rnd(zr[0], zr[1]); ph[i] = Math.random() * 100; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uTime: U.time, uCol: { value: color }, uVH: W.starMat ? W.starMat.uniforms.uVH : { value: 1080 }, uSize: { value: size }, uFall: { value: fall } },
        vertexShader: `attribute float aPh; uniform float uTime, uVH, uSize, uFall; varying float vA;
          void main(){ vec3 p = position; p.x += sin(uTime*0.23 + aPh)*0.9; p.y += sin(uTime*0.17 + aPh*1.7)*1.1;
            p.y = mod(p.y - uTime*uFall + 12.0, ${(FIELD_H + 24).toFixed(1)}) - 12.0;
            vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
            gl_PointSize = max(1.5, uSize * projectionMatrix[1][1] * uVH * 0.5 / -mv.z); vA = 0.55 + 0.45*sin(uTime*1.3 + aPh*5.0); }`,
        fragmentShader: add ? 'uniform vec3 uCol; varying float vA; void main(){ vec2 d = gl_PointCoord*2.-1.; float a = smoothstep(1.,0.,length(d)); a*=a; gl_FragColor = vec4(uCol*a*vA, a*vA); }'
          : 'uniform vec3 uCol; varying float vA; void main(){ vec2 d = gl_PointCoord*2.-1.; float a = smoothstep(1.,0.4,length(d*vec2(1.,1.8))) * 0.75; gl_FragColor = vec4(uCol, a); }' });
      const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
    };
    const nS = this.lite ? 380 : 800, nA = this.vr ? 120 : this.lite ? 180 : 360;
    const spores = mkPts(nS, [-38, -2], tox.clone().multiplyScalar(1.2), true, 0.16, 0.05); spores.renderOrder = -2; this.add(spores, W.scroll);
    const ash = mkPts(nA, this.vr ? [-1, 1.2] : [-1, 5], new THREE.Color(0x0c0d0e), false, 0.09, 0.35); ash.renderOrder = 12; this.add(ash, W.scroll);
    // --- 床の割れ目から滲む毒の光（地形に沿って並べる）
    if (st.bottom.length) {
      const g = new THREE.PlaneGeometry(1, 1), n = 90;
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, uniforms: { uTime: U.time, uTox: { value: tox.clone() } },
        vertexShader: 'varying vec2 vU; varying float vPh; void main(){ vU = uv*2.-1.; vPh = instanceMatrix[3].x; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform float uTime; uniform vec3 uTox; varying vec2 vU; varying float vPh; void main(){ float a = exp(-dot(vU*vec2(1.,2.6), vU*vec2(1.,2.6))*2.2) * (0.55 + 0.45*sin(uTime*1.7 + vPh*0.9)); gl_FragColor = vec4(uTox*a*0.55, a*0.55); }' });
      const im = new THREE.InstancedMesh(g, m, n); const mm = new THREE.Matrix4(); let k = 0;
      for (let x = 6; x < (st.bossStop || 300) + 40 && k < n; x += rnd(3.5, 7)) { const y = lineAt(st.bottom, x); if (y < -1 || y > FIELD_H) continue; mm.makeScale(rnd(2.5, 5), rnd(0.8, 1.6), 1).setPosition(x, y + 0.15, rnd(0.6, 2.0)); im.setMatrixAt(k++, mm); }
      im.count = k; im.frustumCulled = false; im.renderOrder = 8; this.add(im, W.scroll);
    }
    this.sky = W.skyG.children.find((o) => o.material && o.material.map);
  }

  // 毎フレーム。s: ゲーム状態、scroll: 補間したスクロール量
  update(dt, s, scroll) {
    const W = this.w, t = W.t, st = this.st; if (!st) return;
    // 毒の稲妻（星雲の奥で光り、霧と照明が一瞬明るむ）
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) { this.flash = 1; this.flashT = 0; this.nextBolt = rnd(6, 14); }
    if (this.flash > 0) { this.flashT += dt; this.flash = Math.max(0, Math.exp(-this.flashT * 7) * (0.7 + 0.3 * Math.sin(this.flashT * 90))); }
    const beat = st.palette.quake ? heartbeat(t) : 0;
    // ボス戦は暗く沈み、赤黒く脈打つ
    this.dark += ((s.boss && !s.boss.dying ? 1 : 0) - this.dark) * (1 - Math.exp(-1.5 * dt));
    const pulse = this.dark * (0.5 + 0.5 * Math.sin(t * 2.4));
    for (const m of this.fogMats) { m.uniforms.uFlash.value = this.flash; m.uniforms.uBeat.value = beat; }
    if (this.sky) this.sky.material.color.setScalar((1 + this.flash * 1.8 + beat * 0.25) * (1 - this.dark * 0.35));
    // 照明: 薄暗いゆらぎ＋稲妻＋心拍＋ボスの赤
    const flick = 0.92 + 0.05 * Math.sin(t * 1.3) + 0.03 * Math.sin(t * 5.1 + 1.7);
    W.hemi.intensity = W.baseHemi * flick * (1 - this.dark * 0.35) + this.flash * 0.6 + beat * 0.25;
    W.under.intensity = 1.2 + beat * 0.8 + this.flash * 1.2 + pulse * 0.6;
    W.under.color.copy(this.toxC).lerp(new THREE.Color(0xff1030), this.dark * 0.6);
    W.rim.intensity = 1.0 + this.flash * 1.5;
    if (W.fog) W.fog.color.copy(this.fogC).lerp(new THREE.Color(0x120004), this.dark * 0.7).multiplyScalar(1 + beat * 0.6 + this.flash * 2);
    if (W.veinMul) W.veinMul.value = 1 + beat * 1.6 + this.flash * 0.8;
    // 画面の中の現象（盤面座標の粒子。スクロールと一緒に流れる）
    const P = W.parts, sp = s.scrollSpeed || 0, tox = [this.toxC.r * 1.6, this.toxC.g * 1.6, this.toxC.b * 1.6];
    // 天井からの毒の滴
    if (st.top.length && Math.random() < dt * (this.lite ? 2 : 4)) {
      const x = rnd(1, FIELD_W - 1), c = ceilAt(st, x + scroll);
      if (c < FIELD_H + 0.3 && c > 2) P.spawn({ x, y: c - 0.15, z: rnd(-0.5, 1), vx: -sp, vy: -0.2, vz: 0, grav: -9, life: 1.4, t: 0, w: 0.12, h: 0, r: tox[0], g: tox[1], b: tox[2], sh: 0, drag: 1 });
    }
    // 床からの泡（肉の面と花芯）
    if ((st.id === 2 || st.id === 4) && st.bottom.length && Math.random() < dt * (this.lite ? 2.5 : 5)) {
      const x = rnd(1, FIELD_W - 1), f = floorAt(st, x + scroll);
      if (f > -0.3 && f < FIELD_H - 2) P.spawn({ x, y: f + 0.1, z: rnd(-0.5, 1.2), vx: -sp + rnd(-0.2, 0.2), vy: rnd(0.6, 1.4), vz: 0, life: rnd(1.2, 2.2), t: 0, w: rnd(0.15, 0.32), h: 0, r: tox[0] * 0.6, g: tox[1] * 0.6, b: tox[2] * 0.6, sh: 2, drag: 0.99 });
    }
    // 床を這う毒の霞
    this.mistT -= dt;
    if (st.bottom.length && this.mistT <= 0) {
      this.mistT = this.lite ? 0.35 : 0.18;
      const x = rnd(0, FIELD_W + 4), f = floorAt(st, x + scroll);
      if (f > -1.5 && f < FIELD_H - 2) P.spawn({ x, y: f + rnd(0.2, 0.9), z: rnd(0.3, 1.5), vx: -sp * 0.95 + rnd(-0.3, 0.1), vy: rnd(0, 0.15), vz: 0, life: rnd(2.5, 4), t: 0, w: rnd(2.5, 4.5), h: 0, r: tox[0] * 0.12, g: tox[1] * 0.12, b: tox[2] * 0.12, sh: 3, drag: 1, grow: 0.6, fade: true });
    }
    // 手前を横切る黒い靄（大画面のみ。暗さと奥行きを強める）
    if (!this.vr && !this.lite) {
      this.wispT -= dt;
      if (this.wispT <= 0) { this.wispT = rnd(1.5, 4); W.smoke.spawn({ x: FIELD_W + 6, y: rnd(-2, FIELD_H + 2), z: 3.2, vx: -rnd(2.5, 4.5), vy: rnd(-0.2, 0.2), vz: 0, life: 14, t: 0, w: rnd(7, 13), h: 0, r: 0.0, g: 0.0, b: 0.0, a: 0.45, sh: 3, drag: 1, fade: true }); }
    }
  }
}
