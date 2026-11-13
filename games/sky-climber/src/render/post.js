// Sky Climber VR — 通常 3D の画面効果（項目 5〜8）: HDR の中間バッファ（MSAA）→ ブルーム → 色調整（棟ごと）・周辺減光・ごく弱い粒子 → トーンマッピング。
// WebXR では使わない（両眼の負荷と遅延を避け、直接描く）。画質「軽量」でも使わない。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uContrast: { value: 1 }, uSat: { value: 1 }, uShadows: { value: new THREE.Vector3(1, 1, 1) }, uHighs: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.25 }, uGrain: { value: 0.012 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uContrast, uSat, uVignette, uGrain, uTime; uniform vec3 uShadows, uHighs; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);                                   // 彩度
      c = pow(max(c, 0.0) / 0.18, vec3(uContrast)) * 0.18;         // 中間灰を軸にしたコントラスト
      c *= mix(uShadows, uHighs, smoothstep(0.0, 0.6, l));         // 影と光で色を分ける（LUT 風）
      vec2 q = vUv - 0.5; c *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.2);  // 周辺減光
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uTime * 61.0, vec2(0.06711056, 0.00583715))));
      c *= 1.0 + (ign - 0.5) * uGrain * 2.0;                       // 粒子（規則的な模様が出ない雑音）
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, this.rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setTheme(g) {
    const u = this.grade.uniforms;
    u.uContrast.value = g.contrast; u.uSat.value = g.sat; u.uShadows.value.set(...g.shadows); u.uHighs.value.set(...g.highs); u.uVignette.value = g.vignette;
    this.bloom.strength = g.bloom; this.bloom.radius = 0.55; this.bloom.threshold = 1.15;
  }
  setSize(w, h, pr) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
  render(dt) { this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100; this.composer.render(dt); }
  dispose() { this.rt.dispose(); this.composer.dispose?.(); }
}
