// VOIDBLOOM — 光の帯（リボン）。動くものの通った跡を、なめらかな曲線の帯として残す（流線形の見え方の中心）。
// 点の履歴を Catmull-Rom で細かく補ってから帯にするので、折れ線にならない。全部の帯を 1 回の描画で出す。
import * as THREE from 'three';

export class Ribbons {
  constructor(maxVerts = 6000) {
    this.max = maxVerts; this.list = new Map(); this.now = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxVerts * 3); this.col = new Float32Array(maxVerts * 4); this.uv = new Float32Array(maxVerts);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', new THREE.BufferAttribute(this.uv, 1).setUsage(THREE.DynamicDrawUsage));
    this.idx = new Uint32Array(maxVerts * 3); g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide,
      vertexShader: 'attribute vec4 aCol; attribute float aV; varying vec4 vC; varying float vV; void main(){ vC = aCol; vV = aV; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      // 帯の幅方向はふちへ柔らかく消え、中心は少し白く
      fragmentShader: 'varying vec4 vC; varying float vV; void main(){ float e = 1.0 - abs(vV); float a = e * e * vC.a; vec3 c = mix(vC.rgb, vec3(1.4), smoothstep(0.75, 1.0, e) * 0.35); gl_FragColor = vec4(c * a, a); }',
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 11;
  }
  // key ごとに点を足す。w: 太さ、col: [r,g,b]（1 を超えてよい）、life: 消えるまでの秒、a: 不透明度
  touch(key, x, y, z, w, col, life = 0.4, a = 1) {
    let r = this.list.get(key);
    if (!r) { r = { pts: [], w, col, life, a }; this.list.set(key, r); }
    r.w = w; r.col = col; r.life = life; r.a = a; r.seen = this.now;
    const last = r.pts[r.pts.length - 1];
    if (last && Math.abs(last.x - x) > 4) r.pts.length = 0; // 瞬間移動は切る
    if (!last || Math.hypot(last.x - x, last.y - y) > 0.06 || this.now - last.t > 0.05) r.pts.push({ x, y, z, t: this.now });
    else { last.x = x; last.y = y; last.t = this.now; }
    if (r.pts.length > 40) r.pts.shift();
  }
  update(dt) {
    this.now += dt;
    let v = 0, ii = 0;
    const P = this.pos, C = this.col, V = this.uv, I = this.idx;
    for (const [key, r] of this.list) {
      while (r.pts.length && this.now - r.pts[0].t > r.life) r.pts.shift();
      if (!r.pts.length && this.now - r.seen > 0.1) { this.list.delete(key); continue; }
      const src = r.pts; if (src.length < 2) continue;
      // Catmull-Rom で 1 区間を 3 分割して、なめらかな曲線にする
      const pts = [];
      for (let i = 0; i < src.length - 1; i++) {
        const p0 = src[Math.max(0, i - 1)], p1 = src[i], p2 = src[i + 1], p3 = src[Math.min(src.length - 1, i + 2)];
        for (let k = 0; k < 3; k++) { const t = k / 3, t2 = t * t, t3 = t2 * t;
          const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          pts.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), z: p1.z + (p2.z - p1.z) * t, t: p1.t + (p2.t - p1.t) * t }); }
      }
      pts.push(src[src.length - 1]);
      if (v + pts.length * 2 >= this.max) break;
      const base = v, n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const age = Math.min(1, (this.now - p.t) / r.life), head = i / (n - 1);
        // 太さ: 新しいほど太く、古いほど細く消える（先端だけ少し絞る）
        const w = r.w * Math.pow(1 - age, 1.2) * Math.min(1, (1 - head) * 6 + 0.35);
        const a = r.a * Math.pow(1 - age, 1.6) * Math.min(1, head * 3 + 0.15);
        for (const sgn of [-1, 1]) {
          P[v * 3] = p.x - ty * w * sgn; P[v * 3 + 1] = p.y + tx * w * sgn; P[v * 3 + 2] = p.z;
          C[v * 4] = r.col[0]; C[v * 4 + 1] = r.col[1]; C[v * 4 + 2] = r.col[2]; C[v * 4 + 3] = a; V[v] = sgn; v++;
        }
        if (i < n - 1) { const a0 = base + i * 2; I[ii++] = a0; I[ii++] = a0 + 1; I[ii++] = a0 + 2; I[ii++] = a0 + 1; I[ii++] = a0 + 3; I[ii++] = a0 + 2; }
      }
    }
    const g = this.geo;
    for (const k of ['position', 'aCol', 'aV']) { const at = g.attributes[k]; at.clearUpdateRanges(); at.addUpdateRange(0, v * at.itemSize); at.needsUpdate = true; }
    g.index.clearUpdateRanges(); g.index.addUpdateRange(0, ii); g.index.needsUpdate = true;
    g.setDrawRange(0, ii);
  }
}
