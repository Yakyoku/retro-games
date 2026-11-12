// WebXR 最小検証: 床・手・ボタン・表示板。トリガーでボタンを押す、B/Y で VR 終了。表示板に入力と描画バッファの実値を出す。
import * as THREE from 'three';
const st = document.getElementById('st'), out = document.getElementById('out'), go = document.getElementById('go');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1020);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 100); camera.position.set(0, 1.6, 2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
const grid = new THREE.GridHelper(10, 20, 0x7fe0ff, 0x2a3550); scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshLambertMaterial({ color: 0x1a2236 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; scene.add(floor);
const button = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.4), new THREE.MeshLambertMaterial({ color: 0xc4313d })); button.position.set(0, 1.0, -1.2); scene.add(button);
let presses = 0;
const c = document.createElement('canvas'); c.width = 1024; c.height = 640; const g = c.getContext('2d');
const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: tex })); board.position.set(0, 1.7, -2); scene.add(board);
const ctrls = [0, 1].map((i) => {
  const r = renderer.xr.getController(i); scene.add(r);
  const grip = renderer.xr.getControllerGrip(i); scene.add(grip);
  grip.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), new THREE.MeshLambertMaterial({ color: i ? 0xff9b3a : 0x7fe0ff })));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -3)]), new THREE.LineBasicMaterial({ color: 0xffffff })); r.add(line);
  const o = { r, src: null, prev: false };
  r.addEventListener('connected', (e) => (o.src = e.data)); r.addEventListener('disconnected', () => (o.src = null));
  return o;
});
const ray = new THREE.Raycaster(); const m4 = new THREE.Matrix4();
let entered = 0;
(async () => {
  if (!navigator.xr) { st.textContent = 'navigator.xr がありません（WebXR 非対応のブラウザ）'; return; }
  const ok = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  st.textContent = ok ? 'immersive-vr に対応しています' : 'immersive-vr に対応していません'; go.disabled = !ok;
})();
go.onclick = async () => {
  const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
  await renderer.xr.setSession(s); entered++;
  s.addEventListener('end', () => { st.textContent = `VR を終了しました（入場 ${entered} 回）。もう一度押すと再入場します`; });
};
function draw(frame) {
  const s = renderer.xr.getSession();
  const L = [];
  L.push(`入場回数 ${entered}  ボタン押下 ${presses}`);
  if (s) {
    const bl = s.renderState.baseLayer;
    L.push(`描画バッファ ${bl ? bl.framebufferWidth + '×' + bl.framebufferHeight : '?'}  拡大率 ${renderer.xr.getFramebufferScaleFactor ? '' : ''}`);
    L.push(`フレームレート ${s.frameRate || '?'}  対応 ${s.supportedFrameRates ? [...s.supportedFrameRates].join('/') : '?'}  表示 ${s.visibilityState}`);
    const cam = renderer.xr.getCamera(); L.push(`眼の数 ${cam.cameras.length}  頭 ${cam.position.toArray().map((v) => v.toFixed(2)).join(', ')}`);
    for (const src of s.inputSources) {
      const gp = src.gamepad;
      L.push(`${src.handedness} ${src.profiles.join(',')}`);
      if (gp) L.push(`  axes [${gp.axes.map((a) => a.toFixed(2)).join(', ')}]  buttons [${gp.buttons.map((b) => (b.pressed ? 1 : b.touched ? 't' : 0)).join('')}]`);
    }
  } else L.push('（VR 外）');
  g.fillStyle = '#0d1220'; g.fillRect(0, 0, 1024, 640); g.fillStyle = '#e9eef7'; g.font = '26px ui-monospace,monospace';
  L.forEach((l, i) => g.fillText(l.slice(0, 70), 24, 50 + i * 36)); tex.needsUpdate = true;
  out.textContent = L.join('\n');
}
let t = 0;
renderer.setAnimationLoop((time, frame) => {
  for (const o of ctrls) {
    const gp = o.src && o.src.gamepad; if (!gp) continue;
    const trig = gp.buttons[0] && gp.buttons[0].pressed;
    if (trig && !o.prev) {
      m4.identity().extractRotation(o.r.matrixWorld); ray.ray.origin.setFromMatrixPosition(o.r.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(m4);
      if (ray.intersectObject(button).length) { presses++; button.material.color.setHex(presses % 2 ? 0x36f08a : 0xc4313d); }
    }
    o.prev = trig;
    if (gp.buttons[5] && gp.buttons[5].pressed) renderer.xr.getSession() && renderer.xr.getSession().end();
  }
  if ((t++ % 10) === 0) draw(frame);
  renderer.render(scene, camera);
});
