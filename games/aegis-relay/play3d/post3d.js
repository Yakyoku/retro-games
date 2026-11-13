// AEGIS RELAY — 通常画面の仕上げ（B29・M11）: マルチサンプルの描画先 → 発光のにじみ（ブルーム）→ 階調の変換・弱い周辺減光・ディザー
// WebXR の中では使えない（XR は直接描画し、光の板でにじみを代用する）。軽量画質でも使わない。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  name: 'AegisFinal',
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.85);
      c *= 1.0 - uVig * smoothstep(0.32, 0.86, length(q));          // 弱い周辺減光
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor.rgb += (n - 0.5) / 255.0;                         // ディザー（暗い空の色の段を消す）
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = new THREE.Vector2(); renderer.getSize(size);
  const samples = Math.min(4, renderer.capabilities.maxSamples || 4);
  const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples }); // MSAA（輪郭のぎざぎざを消す）
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.5, 1.05);
  composer.addPass(bloom);
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  return {
    composer, bloom, final,
    setSize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); },
    render(dt) { composer.render(dt); },
  };
}
