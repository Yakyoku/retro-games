// VOIDBLOOM — 光の板（弾・光線・火花）を 1 回の描画でまとめて出す。盤面と平行な板なので VR でも位置がずれない。
// shape: 0 = 丸い光（芯が白い）/ 1 = 細長い光線 / 2 = 輪 / 3 = 柔らかい煙
import * as THREE from 'three';

export class SpriteBatch {
  constructor(max = 2048, blending = THREE.AdditiveBlending) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3); this.sz = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.shp = new Float32Array(max);
    const ia = (arr, k) => { const a = new THREE.InstancedBufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('iPos', this.aPos = ia(this.pos, 3));
    g.setAttribute('iSz', this.aSz = ia(this.sz, 3));   // 幅, 高さ, 回転
    g.setAttribute('iCol', this.aCol = ia(this.col, 4)); // rgb（1 を超えてよい）, 不透明度
    g.setAttribute('iShp', this.aShp = ia(this.shp, 1));
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending, toneMapped: false,
      vertexShader: `attribute vec3 iPos; attribute vec3 iSz; attribute vec4 iCol; attribute float iShp;
        varying vec2 vUv; varying vec4 vCol; varying float vShp;
        void main() { vUv = position.xy * 2.0; vCol = iCol; vShp = iShp;
          float c = cos(iSz.z), s = sin(iSz.z); vec2 p = position.xy * iSz.xy; p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + vec3(p, 0.0), 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vCol; varying float vShp;
        void main() { float d = length(vUv); float a; vec3 c = vCol.rgb;
          if (vShp < 0.5) { a = smoothstep(1.0, 0.0, d); a = a * a; float core = smoothstep(0.42, 0.12, d); c = mix(c, vec3(1.0) * max(1.4, dot(c, vec3(0.4))), core); a = max(a, core); }
          else if (vShp < 1.5) { float y = abs(vUv.y), x = abs(vUv.x); a = smoothstep(1.0, 0.0, y) * smoothstep(1.0, 0.82, x); a *= a; float core = smoothstep(0.35, 0.05, y) * smoothstep(1.0, 0.85, x); c = mix(c, vec3(1.6), core); a = max(a, core); }
          else if (vShp < 2.5) { a = smoothstep(0.16, 0.0, abs(d - 0.8)) ; }
          else { a = smoothstep(1.0, 0.0, d); a = a * a * 0.6; }
          if (a < 0.003) discard; gl_FragColor = vec4(c * a * vCol.a, a * vCol.a); }`,
    });
    this.mat.blending = THREE.CustomBlending; this.mat.blendSrc = THREE.OneFactor;
    // 加算（光）か、暗くする合成（煙・靄。前乗算アルファの普通の重ね）
    this.mat.blendDst = blending === 'dark' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.geo = g;
  }
  begin() { this.n = 0; }
  // x, y, z, 幅, 高さ, 回転, r, g, b, a, 形
  add(x, y, z, w, h, rot, r, g, b, a, shape = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.sz[i * 3] = w; this.sz[i * 3 + 1] = h; this.sz[i * 3 + 2] = rot;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.shp[i] = shape;
  }
  end() {
    const n = this.n;
    this.geo.instanceCount = n;
    for (const [a, k] of [[this.aPos, 3], [this.aSz, 3], [this.aCol, 4], [this.aShp, 1]]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * k); a.needsUpdate = true; }
  }
}

// 火花・煙・閃光（CPU で動かし、SpriteBatch に書き込む）
export class Particles {
  constructor(max = 3000) { this.max = max; this.p = []; }
  spawn(o) { if (this.p.length < this.max) this.p.push(o); }
  // 爆発: 大きさ s、色 rgb
  boom(x, y, s, col, lite) {
    const n = Math.round((lite ? 8 : 14) + s * (lite ? 10 : 22));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 9) * (0.5 + s * 0.5), z = (Math.random() - 0.5) * s * 2;
      this.spawn({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: (Math.random() - 0.5) * v * 0.6, life: 0.25 + Math.random() * 0.5, t: 0, w: 0.08 + Math.random() * 0.1, h: 0.5 + Math.random() * 0.6, r: col[0] * 2, g: col[1] * 2, b: col[2] * 2, sh: 1, drag: 0.9, streak: true });
    }
    for (let k = 0; k < (lite ? 3 : 6) + s * 3; k++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * 2.5 * s;
      this.spawn({ x: x + Math.cos(a) * s * 0.3, y: y + Math.sin(a) * s * 0.3, z: (Math.random() - 0.5) * s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 0, life: 0.6 + Math.random() * 0.7, t: 0, w: s * (0.9 + Math.random()), h: 0, r: col[0] * 0.9, g: col[1] * 0.7, b: col[2] * 0.6, sh: 3, drag: 0.94, grow: 1.8 });
    }
    this.spawn({ x, y, z: 0.1, vx: 0, vy: 0, vz: 0, life: 0.18 + s * 0.05, t: 0, w: s * 3.2, h: 0, r: 2.5, g: 2.3, b: 2.1, sh: 0, drag: 1 });
    this.spawn({ x, y, z: 0.05, vx: 0, vy: 0, vz: 0, life: 0.35 + s * 0.08, t: 0, w: s * 1.2, h: 0, r: col[0] * 1.5, g: col[1] * 1.5, b: col[2] * 1.5, sh: 2, drag: 1, grow: 5 });
  }
  spark(x, y, s, col) {
    for (let k = 0; k < 5; k++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 6; this.spawn({ x, y, z: 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 0, life: 0.12 + Math.random() * 0.15, t: 0, w: 0.06, h: 0.32 * s, r: col[0] * 2, g: col[1] * 2, b: col[2] * 2, sh: 1, drag: 0.85, streak: true }); }
    this.spawn({ x, y, z: 0.2, vx: 0, vy: 0, vz: 0, life: 0.1, t: 0, w: s * 0.9, h: 0, r: col[0] * 2, g: col[1] * 2, b: col[2] * 2, sh: 0, drag: 1 });
  }
  trail(x, y, w, col, life = 0.22) { this.spawn({ x, y, z: -0.05, vx: 0, vy: 0, vz: 0, life, t: 0, w, h: 0, r: col[0], g: col[1], b: col[2], sh: 0, drag: 1, shrink: true }); }
  update(dt, batch) {
    const arr = this.p;
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      o.t += dt;
      if (o.t >= o.life) continue;
      const d = Math.pow(o.drag, dt * 60);
      o.vx *= d; o.vy *= d; o.vz *= d;
      if (o.grav) o.vy += o.grav * dt;   // 重さ（滴・飛び散る体液）
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      const k = o.t / o.life, a = (o.fade ? Math.sin(Math.PI * Math.min(1, k)) : (1 - k) * (1 - k)) * (o.a ?? 1); // fade: ふわっと現れて消える
      let w = o.w, h = o.h || o.w;
      if (o.grow) { w *= 1 + k * o.grow; h = w; }
      if (o.shrink) { w *= 1 - k; h = w; }
      const rot = o.streak ? Math.atan2(o.vy, o.vx) : 0;
      if (o.streak) { w = o.h * (0.3 + Math.min(1, Math.hypot(o.vx, o.vy) / 8)); h = o.w * 2; }
      batch.add(o.x, o.y, o.z, w, h, rot, o.r, o.g, o.b, a, o.sh);
      arr[j++] = o;
    }
    arr.length = j;
  }
}
