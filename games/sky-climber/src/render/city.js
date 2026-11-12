// Sky Climber VR — 都市の遠景: 空（雲・太陽・星）、道路と歩道、周囲のビル、走る車、歩く人影、街路樹。
// すべて InstancedMesh か 1 枚の面で、描画回数を抑える（Quest の負荷対策）。密度は画質設定で変える。
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { makeTextTexture, makeFacadeTexture } from './textures.js';

export const SKY = {
  practice: { top: 0x4f8fd6, hor: 0xcfe3f2, sun: 0xfff1d6, sunDir: [-0.4, 0.7, 0.6], fog: 0xb9d3e8, fogD: 0.0035, cloud: 0.5, stars: 0 },
  day:      { top: 0x3f86d8, hor: 0xd6e8f4, sun: 0xfff3dc, sunDir: [-0.45, 0.75, 0.55], fog: 0xbcd5ea, fogD: 0.0032, cloud: 0.55, stars: 0 },
  dusk:     { top: 0x2b2f6b, hor: 0xff9a5a, sun: 0xffb070, sunDir: [0.8, 0.14, 0.45], fog: 0xd88a6a, fogD: 0.004, cloud: 0.6, stars: 0.15 },
  night:    { top: 0x060914, hor: 0x2a2346, sun: 0x8fa8ff, sunDir: [0.3, 0.6, 0.6], fog: 0x1a1830, fogD: 0.006, cloud: 0.25, stars: 1 },
  tower:    { top: 0x1d5fc4, hor: 0xbfdaf2, sun: 0xffffff, sunDir: [-0.3, 0.8, 0.5], fog: 0xc8dcef, fogD: 0.0022, cloud: 0.7, stars: 0 },
};

export function makeSky(theme) {
  const s = SKY[theme];
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(s.top) }, uHor: { value: new THREE.Color(s.hor) }, uSun: { value: new THREE.Color(s.sun) }, uSunDir: { value: new THREE.Vector3(...s.sunDir).normalize() },
      uCloud: { value: s.cloud }, uStars: { value: s.stars }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uSun, uSunDir; uniform float uCloud, uStars, uTime; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.0, w = 0.5; for (int i = 0; i < 5; i++){ a += w * n(p); p *= 2.03; w *= 0.5; } return a; }
      void main(){
        vec3 d = normalize(vDir); float y = max(d.y, 0.0);
        vec3 c = mix(uHor, uTop, pow(y, 0.55));
        if (d.y < 0.0) c = mix(uHor, uHor * 0.6, min(1.0, -d.y * 6.0));
        float sd = max(dot(d, uSunDir), 0.0);
        c += uSun * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25);
        // 雲: 上空の平面に投影したノイズ
        if (d.y > 0.02) { vec2 uv = d.xz / (d.y + 0.08) * 1.4 + vec2(uTime * 0.004, 0.0); float cl = smoothstep(0.55 - uCloud * 0.25, 0.85, fbm(uv));
          vec3 cc = mix(uHor * 1.05, vec3(1.0), 0.6) * (0.75 + 0.35 * sd); c = mix(c, cc, cl * smoothstep(0.02, 0.25, d.y) * 0.85); }
        // 星
        if (uStars > 0.0 && d.y > 0.0) { vec2 sp = d.xz / (d.y + 0.3) * 120.0; float st = step(0.997, h(floor(sp))) * smoothstep(0.1, 0.4, d.y); c += vec3(st) * uStars * (0.6 + 0.4 * sin(uTime * 3.0 + h(floor(sp)) * 40.0)); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10; m.name = 'sky';
  return m;
}

export class City {
  constructor(theme, { density = 1, heroW = 12, heroTop = 40, envMap } = {}) {
    this.group = new THREE.Group(); this.group.name = 'city';
    const night = theme === 'night', dusk = theme === 'dusk', r = makeRng(77 + theme.length);
    // 地面: 道路（建物の前を東西に走る 2 車線の通り＋格子）と歩道
    const road = makeTextTexture((c, w, h) => {
      c.fillStyle = night ? '#1c1d21' : '#4a4c50'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = night ? '#55554a' : '#a7a497'; c.fillRect(0, 0, w, h * 0.12); c.fillRect(0, h * 0.88, w, h * 0.12); // 歩道
      c.fillStyle = '#e8e2c8'; for (let x = 0; x < w; x += 64) c.fillRect(x, h * 0.495, 36, h * 0.01); // 中央線
    }, 512, 512).tex;
    road.wrapS = road.wrapT = THREE.RepeatWrapping; road.repeat.set(60, 1); road.anisotropy = 8;
    const street = new THREE.Mesh(new THREE.PlaneGeometry(1200, 24), new THREE.MeshStandardMaterial({ map: road, roughness: night ? 0.35 : 0.9, metalness: 0 }));
    street.rotation.x = -Math.PI / 2; street.position.set(0, -0.14, 14); street.receiveShadow = true; this.group.add(street);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: night ? 0x15161a : dusk ? 0x5a4a44 : 0x6c6f6a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.16; this.group.add(ground);
    // 周囲のビル（3 つの高さの組。窓の模様は夜に発光）
    const facade = makeFacadeTexture(5, { lit: night ? 0.55 : dusk ? 0.35 : 0.15, night: night || dusk, tint: night ? [30, 34, 44] : dusk ? [150, 110, 100] : [190, 196, 204] });
    facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
    const classes = [{ h: [12, 30], n: 120 }, { h: [30, 70], n: 80 }, { h: [70, theme === 'tower' ? 160 : 110], n: 30 }];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const [ci, cl] of classes.entries()) {
      const n = Math.round(cl.n * density);
      const tex = facade.clone(); tex.needsUpdate = true; tex.repeat.set(2, (cl.h[0] + cl.h[1]) / 2 / 30);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2, emissive: night || dusk ? 0xffffff : 0x000000, emissiveMap: night || dusk ? tex : null, emissiveIntensity: night ? 0.9 : 0.35, envMap, envMapIntensity: 0.6 });
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, mat, n);
      let k = 0, tries = 0;
      while (k < n && tries++ < n * 20) {
        const x = r.range(-700, 700), z = r.range(-700, 60);
        // 主役のビルの周りと、前の通りは空ける
        if (Math.abs(x) < heroW / 2 + 10 && z > -40) continue;
        if (z > -14 && z < 30) continue;
        const d = Math.hypot(x, z); if (d < 30 && ci === 0) continue;
        const w = r.range(12, 28), dpt = r.range(12, 28), h = r.range(cl.h[0], cl.h[1]) * (d < 120 ? 1 : 0.8);
        im.setMatrixAt(k++, m4.compose(new THREE.Vector3(x, -0.16, z), q.setFromEuler(new THREE.Euler(0, r.chance(0.3) ? r.range(-0.3, 0.3) : 0, 0)), new THREE.Vector3(w, h, dpt)));
      }
      im.count = k; this.group.add(im);
    }
    // 両隣のビル（近景）: 主役のビルの横に並ぶ、窓のある壁
    const sideTex = facade.clone(); sideTex.needsUpdate = true; sideTex.repeat.set(3, 4);
    const neighborMat = new THREE.MeshStandardMaterial({ map: sideTex, color: 0xdddddd, roughness: 0.7, emissive: night ? 0xffffff : 0, emissiveMap: night ? sideTex : null, emissiveIntensity: 0.7, envMap });
    for (const s of [-1, 1]) { const h = heroTop * (s < 0 ? 0.72 : 0.55); const nb = new THREE.Mesh(new THREE.BoxGeometry(18, h, 20), neighborMat); nb.position.set(s * (heroW / 2 + 15), h / 2 - 0.16, -9); nb.castShadow = nb.receiveShadow = true; this.group.add(nb); }
    // 車（前の通りを左右に。夜はライトが光る）
    const carGeo = (() => { const b = new THREE.BoxGeometry(4.2, 0.9, 1.8); b.translate(0, 0.65, 0); const c = new THREE.BoxGeometry(2.2, 0.65, 1.6); c.translate(-0.2, 1.4, 0); const parts = [b, c];
      for (const x of [-1.4, 1.4]) for (const z of [-0.85, 0.85]) { const w = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14); w.rotateX(Math.PI / 2); w.translate(x, 0.36, z); parts.push(w); }
      return mergeSimple(parts); })();
    this.nCars = Math.round(26 * Math.max(0.4, density));
    this.cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6, envMap, envMapIntensity: 1.2 }), this.nCars);
    this.carState = [];
    const palette = [0xd8342c, 0xf2f2f2, 0x1f2f4f, 0xf2c230, 0x3a3a3a, 0x2f8f5a, 0x8f9aa5];
    for (let i = 0; i < this.nCars; i++) { const lane = i % 2; this.carState.push({ x: r.range(-300, 300), z: lane ? 11 : 17, v: (lane ? 1 : -1) * r.range(8, 14) }); this.cars.setColorAt(i, new THREE.Color(r.pick(palette))); }
    this.cars.castShadow = true; this.group.add(this.cars);
    if (night || dusk) {
      this.lights = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95 }), this.nCars * 2);
      this.group.add(this.lights);
    }
    // 歩く人影（歩道）
    this.nPeople = Math.round(40 * Math.max(0.3, density));
    const pg = mergeSimple([(() => { const g = new THREE.CapsuleGeometry(0.2, 0.9, 4, 8); g.translate(0, 0.75, 0); return g; })(), (() => { const g = new THREE.SphereGeometry(0.15, 10, 8); g.translate(0, 1.55, 0); return g; })()]);
    this.people = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.nPeople);
    this.peopleState = [];
    const cloth = [0x2f4f7f, 0x7f2f2f, 0xe0d8c8, 0x3a3a3a, 0xc89a3a, 0x5a7f4a, 0xd87fa0];
    for (let i = 0; i < this.nPeople; i++) { this.peopleState.push({ x: r.range(-60, 60), z: r.range(23.5, 25.5), v: r.range(0.8, 1.5) * (r.chance(0.5) ? 1 : -1), ph: r.range(0, 6) }); /* 向かいの歩道（カメラの直前に来ない） */ this.people.setColorAt(i, new THREE.Color(r.pick(cloth))); }
    this.people.castShadow = true; this.group.add(this.people);
    // 街路樹と街灯
    const trees = [], lamps = [];
    for (let x = -80; x <= 80; x += 12) { if (Math.abs(x) < heroW / 2 + 1) continue; trees.push(x); }
    const tg = mergeSimple([(() => { const g = new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8); g.translate(0, 1.1, 0); return g; })()]);
    const cg = new THREE.IcosahedronGeometry(1.4, 1); cg.translate(0, 3.2, 0);
    const trunks = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.9 }), trees.length);
    const crowns = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: dusk ? 0x6a6a2a : night ? 0x1f3a2a : 0x4f8a3a, roughness: 0.9, flatShading: true }), trees.length);
    trees.forEach((x, i) => { const s = 0.8 + ((i * 37) % 10) / 25; trunks.setMatrixAt(i, m4.compose(new THREE.Vector3(x, -0.14, 6), q.identity(), new THREE.Vector3(1, s, 1))); crowns.setMatrixAt(i, m4.compose(new THREE.Vector3(x, -0.14, 6), q.identity(), new THREE.Vector3(s, s, s))); });
    trunks.castShadow = crowns.castShadow = true; this.group.add(trunks, crowns);
    this.m4 = m4; this.q = q; this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const m4 = this.m4, q = this.q, one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.nCars; i++) {
      const c = this.carState[i]; c.x += c.v * dt; if (c.x > 320) c.x = -320; if (c.x < -320) c.x = 320;
      q.setFromEuler(new THREE.Euler(0, c.v > 0 ? 0 : Math.PI, 0));
      this.cars.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, -0.14, c.z), q, one));
      if (this.lights) {
        const dir = Math.sign(c.v);
        this.lights.setMatrixAt(i * 2, m4.compose(new THREE.Vector3(c.x + dir * 2.12, 0.6, c.z), q.setFromEuler(new THREE.Euler(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)), new THREE.Vector3(3, 1, 1)));
        this.lights.setColorAt(i * 2, new THREE.Color(0xfff4d0));
        this.lights.setMatrixAt(i * 2 + 1, m4.compose(new THREE.Vector3(c.x - dir * 2.12, 0.7, c.z), q.setFromEuler(new THREE.Euler(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0)), new THREE.Vector3(3, 1, 1)));
        this.lights.setColorAt(i * 2 + 1, new THREE.Color(0xff2a1a));
      }
    }
    this.cars.instanceMatrix.needsUpdate = true;
    if (this.lights) { this.lights.instanceMatrix.needsUpdate = true; this.lights.instanceColor.needsUpdate = true; }
    for (let i = 0; i < this.nPeople; i++) {
      const p = this.peopleState[i]; p.x += p.v * dt; if (Math.abs(p.x) > 60) p.v *= -1; p.ph += dt * 7;
      const bob = Math.abs(Math.sin(p.ph)) * 0.05;
      this.people.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, -0.14 + bob, p.z), q.identity(), one));
    }
    this.people.instanceMatrix.needsUpdate = true;
  }
}
function mergeSimple(geos) {
  // 非インデックス化して位置・法線だけ結合（uv が無い形状も混ぜられる）
  const pos = [], nor = [];
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
