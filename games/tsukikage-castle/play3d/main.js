// 月影の魔城 — 3D / VR 版の起動。描画ループは WebXR のために renderer.setAnimationLoop を使う
import { GameApp } from '../shared/app.js';
import { Renderer3D } from './render3d.js';
import { installTouch } from '../shared/touch.js';
import { installNoZoom } from '../shared/no-zoom.js';
import { makeFrameClock } from '../shared/frame-clock.js';

export async function start() {
  let info = {};
  try { info = await (await fetch('../build-info.json', { cache: 'no-store' })).json(); } catch (e) { /* 単体 */ }
  const app = new GameApp({ variant: '3d', otherUrl: info.otherUrl || null });
  const host = document.getElementById('host');
  const r = new Renderer3D(host, app);
  app.renderer = r;
  app.openTitle();
  const touch = installTouch(app, document.body);
  installNoZoom(() => r.resize());
  r.onControls = () => touch.lefty();
  const ui = r.uiCanvas;
  ui.addEventListener('pointerdown', (e) => {
    app.unlock();
    if (!app.menu || app.screen === 'play') return;
    const hit = r.ui.pick(e.clientX * r.uiScale, e.clientY * r.uiScale);
    if (hit) app.pointerPick(hit.i, hit.side);
  });
  ui.addEventListener('pointermove', (e) => {
    if (!app.menu || app.screen === 'play' || e.pointerType !== 'mouse') return;
    const hit = r.ui.pick(e.clientX * r.uiScale, e.clientY * r.uiScale);
    ui.style.cursor = hit ? 'pointer' : 'default';
    if (hit && app.menu.sel !== hit.i) app.menu.sel = hit.i;
  });
  const clock = makeFrameClock();
  let fpsN = 0, fpsT = 0, slow = 0, last = null;
  const QS = ['ultra', 'standard', 'lite'];
  r.r.setAnimationLoop((now) => {
    let dt = clock(now);
    const pnow = performance.now();
    if (r.r.xr.isPresenting) { dt = last == null ? 1 / 72 : Math.min(0.1, Math.max(0, (pnow - last) / 1000)); } // VR 中は実時間で測る（ヘッドセットの周期 72/90Hz に合わせて補間）
    last = pnow;
    app.frame(dt);
    touch.root.classList.toggle('menu', app.screen !== 'play');
    r.reserveBottom = touch.visible() && app.screen === 'title' ? 120 * r.uiScale : 0;
    r.render(app.g, app.alpha(), dt);
    fpsN++; fpsT += dt;
    if (fpsT >= 1) {
      r.fps = fpsN / fpsT;
      if (!r.r.xr.isPresenting && app.save.quality === 'auto' && r.fps < 50 && app.screen === 'play') { if (++slow >= 3) { const i = QS.indexOf(r.autoQ || 'ultra'); if (i < 2) { r.autoQ = QS[i + 1]; r.resize(); app.say(`画質を自動で下げました（${r.autoQ}）`); } slow = 0; } } else slow = 0;
      fpsN = 0; fpsT = 0;
    }
  });
  window.__app = app; window.__r = r;
}
