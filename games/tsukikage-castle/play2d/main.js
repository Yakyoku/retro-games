// 月影の魔城 — 2D 版の起動
import { GameApp } from '../shared/app.js';
import { Renderer2D } from './render.js';
import { installTouch } from '../shared/touch.js';
import { installNoZoom } from '../shared/no-zoom.js';
import { makeFrameClock } from '../shared/frame-clock.js';

export async function start() {
  let info = {};
  try { info = await (await fetch('../build-info.json', { cache: 'no-store' })).json(); } catch (e) { /* 単体で開いたとき */ }
  const app = new GameApp({ variant: '2d', otherUrl: info.otherUrl || null });
  const cv = document.getElementById('game');
  const r = new Renderer2D(cv, app);
  app.renderer = r;
  app.openTitle();
  const touch = installTouch(app, document.body);
  installNoZoom(() => r.resize());
  app.renderer.onControls = () => touch.lefty();
  // タッチ操作が出ているときは、HUD とメニューの下側をその分あける
  // ポインター（マウス・タッチ）でメニューを選ぶ
  cv.addEventListener('pointerdown', (e) => {
    app.unlock();
    if (!app.menu || app.screen === 'play') return;
    const s = r.pxScale, hit = r.ui.pick(e.clientX * s, e.clientY * s);
    if (hit) app.pointerPick(hit.i, hit.side);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!app.menu || app.screen === 'play' || e.pointerType !== 'mouse') return;
    const s = r.pxScale, hit = r.ui.pick(e.clientX * s, e.clientY * s);
    cv.style.cursor = hit ? 'pointer' : 'default';
    if (hit && app.menu.sel !== hit.i) app.menu.sel = hit.i;
  });
  const clock = makeFrameClock();
  let fpsN = 0, fpsT = 0, slow = 0;
  const QS = ['ultra', 'standard', 'lite'];
  function frame(now) {
    const dt = clock(now);
    app.frame(dt);
    touch.root.classList.toggle('menu', app.screen !== 'play');
    r.reserve.bottom = touch.visible() && app.screen === 'title' ? 120 : 0;
    r.render(app.g, app.alpha(), dt);
    // FPS と自動画質（50fps 未満が 3 秒続いたら 1 段下げる）
    fpsN++; fpsT += dt;
    if (fpsT >= 1) { r.fps = fpsN / fpsT; if (app.save.quality === 'auto' && r.fps < 50 && app.screen === 'play') { if (++slow >= 3) { const i = QS.indexOf(r.autoQ || 'ultra'); if (i < 2) { r.autoQ = QS[i + 1]; r.resize(); app.say(`画質を自動で下げました（${r.autoQ}）`); } slow = 0; } } else slow = 0; fpsN = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__app = app; window.__r = r; // 自動テスト用
}
