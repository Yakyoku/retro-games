// AEGIS RELAY — 戦域の外側（B28）: 盤面を囲む計器風の枠（「宇宙を覗く窓」の縁）と、VR で足もとに見える薄い床の目盛り
// 枠は盤面の外にあるのでクリップしない。ゆっくり流れる光・点滅する灯は機体と同じ材質の仕組み（頂点の種類）で動かす。
import * as THREE from 'three';
import { HW, HH, part, merge, box, slab, cyl, octa, shared } from './util3d.js';

export function createFrame(board, scene, frameMat) {
  const q = [];
  const metal = { c: 0x2a3140, m: 0.85, r: 0.38, f: 1 }, dark = { c: 0x12161e, m: 0.7, r: 0.55 }, cyanFlow = { c: 0x2ec5ff, e: 1.6, f: 2 }, cyan = { c: 0x2ec5ff, e: 1.2, f: 4 }, amber = { c: 0xffb45e, e: 2.4, f: 3 };
  const G = 4, Wd = 7, yTop = -0.6; // 盤面の縁からのすき間、枠の幅、枠の上面
  // 4 辺の梁（面取りつき）＋上面の細い光の筋
  for (const s of [-1, 1]) {
    q.push(part(box(Wd, 7, HH * 2 + 2 * (G + Wd), 1.2), metal, { p: [s * (HW + G + Wd / 2), yTop - 3.5, 0] }));
    q.push(part(box(0.5, 0.3, HH * 2 + 6), cyanFlow, { p: [s * (HW + G + 1.4), yTop + 0.1, 0] }));
    q.push(part(box(HW * 2 + 2 * G, 7, Wd, 1.2), metal, { p: [0, yTop - 3.5, s * (HH + G + Wd / 2)] }));
    q.push(part(box(HW * 2 + 6, 0.3, 0.5), cyanFlow, { p: [0, yTop + 0.1, s * (HH + G + 1.4)] }));
    // 目盛り（計器風）: 左右の梁に 20 単位ごとの短い線、80 単位ごとに長い線
    for (let z = -HH; z <= HH + 0.1; z += 20) { const long = Math.round(z + HH) % 80 === 0; q.push(part(box(long ? 3.2 : 1.6, 0.25, 0.45), long ? { c: 0xcfeaff, e: 1.4 } : { c: 0x6f8aa8, e: 0.6 }, { p: [s * (HW + G + Wd - (long ? 2.0 : 1.4)), yTop + 0.1, z] })); }
    for (let x = -HW; x <= HW + 0.1; x += 20) { const long = Math.round(x + HW) % 80 === 0; q.push(part(box(0.45, 0.25, long ? 3.2 : 1.6), long ? { c: 0xcfeaff, e: 1.4 } : { c: 0x6f8aa8, e: 0.6 }, { p: [x, yTop + 0.1, s * (HH + G + Wd - (long ? 2.0 : 1.4))] })); }
  }
  // 四隅の柱（上に灯、下は窓の奥へ伸びる細い支柱）と、底の細い枠
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (HW + G + Wd / 2), z = sz * (HH + G + Wd / 2);
    q.push(part(slab([-4.6, -4.6, 4.6, -4.6, 4.6, 4.6, -4.6, 4.6], 9, 1.4), dark, { p: [x, yTop - 3.2, z] }));
    q.push(part(cyl(1.5, 2.2, 12, 8), metal, { p: [x, yTop + 6.5, z] }));
    q.push(part(octa(1.7), cyan, { p: [x, yTop + 14.6, z], s: [1, 1.5, 1] }));
    q.push(part(box(1.6, 0.5, 1.6), amber, { p: [x, yTop + 1.6, z + sz * -3.2] }));
    q.push(part(box(1.3, 70, 1.3), dark, { p: [x, yTop - 42, z] }));
    q.push(part(box(0.35, 66, 0.35), { c: 0x2ec5ff, e: 0.7, f: 2 }, { p: [x - sx * 0.9, yTop - 42, z - sz * 0.9] }));
  }
  for (const s of [-1, 1]) { q.push(part(box(1.0, 1.0, HH * 2 + 2 * (G + Wd)), dark, { p: [s * (HW + G + Wd / 2), yTop - 77, 0] })); q.push(part(box(HW * 2 + 2 * (G + Wd), 1.0, 1.0), dark, { p: [0, yTop - 77, s * (HH + G + Wd / 2)] })); }
  const mesh = new THREE.Mesh(merge(q), frameMat); mesh.frustumCulled = false; mesh.renderOrder = 0; board.add(mesh);

  // VR の足もと: うっすら光る同心円と放射線（座っている位置の手がかり。通常画面では出さない）
  const deckMat = new THREE.ShaderMaterial({ uniforms: { uTime: shared.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vP; uniform float uTime;
      void main(){ float r = length(vP), a = atan(vP.y, vP.x);
        float fr = fwidth(r) * 1.5 + 0.002, fa = fwidth(a) * 1.5 + 0.002;
        float rings = 1.0 - smoothstep(0.0, fr, abs(fract(r / 0.5 + 0.5) - 0.5) * 0.5);
        float rays = (1.0 - smoothstep(0.0, fa, abs(fract(a / 0.5236 + 0.5) - 0.5) * 0.5236)) * step(0.5, r);
        float fade = (1.0 - smoothstep(0.6, 2.6, r)) * smoothstep(0.15, 0.5, r);
        float sweep = 0.6 + 0.4 * sin(r * 3.0 - uTime * 0.8);
        gl_FragColor = vec4(vec3(0.18, 0.62, 1.0) * max(rings, rays * 0.6) * fade * 0.22 * sweep, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const dg = new THREE.CircleGeometry(2.7, 48); dg.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(dg, deckMat); deck.position.y = 0.002; deck.renderOrder = -2; deck.visible = false; scene.add(deck);
  return { mesh, deck };
}
