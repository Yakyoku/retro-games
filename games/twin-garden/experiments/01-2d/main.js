// ツイン・ガーデン 2D — PC・タブレット版の入口
import { App } from '/shared/app.js';
import { DomUI } from '/shared/ui/dom-ui.js';
import { Renderer2D } from './render2d.js';
import { TouchSticks } from './touch.js';

const root = document.getElementById('app');
const canvas = document.getElementById('view');
const r2d = new Renderer2D(canvas);
const ui = new DomUI(root);

// 自動画質: 描画が重いときだけ内部解像度を下げる（最高画質では下げない）
const perf = { frames: 0, t0: 0, fps: 60, ms: [], lowSince: 0 };

const view = {
  setGame: (g) => r2d.setGame(g),
  onEvents: (ev, g) => r2d.onEvents(ev, g),
  render: (g, alpha, dt, now) => {
    const t0 = performance.now();
    r2d.render(g, alpha, dt);
    const ms = performance.now() - t0;
    perf.ms.push(ms); if (perf.ms.length > 240) perf.ms.shift();
    perf.frames++;
    if (now - perf.t0 > 1000) { perf.fps = (perf.frames * 1000) / (now - perf.t0); perf.frames = 0; perf.t0 = now; autoQuality(now); }
    if (debug) debugBox.textContent = `${r2d.stats.w}×${r2d.stats.h}px（CSS ${r2d.stats.cssW}×${r2d.stats.cssH}・倍率 ${r2d.stats.scale.toFixed(2)}）${perf.fps.toFixed(0)}fps 描画 ${ms.toFixed(1)}ms 画質 ${app.store.data.settings.quality}`;
  },
};

const app = new App({ variant: '2d', view, ui });
window.__app = app;
const touch = new TouchSticks(root, { onPause: () => (app.screen === 'play' ? app.pause() : null) });
app.input.extra.push(() => touch.dir());

function autoQuality() {
  if (app.store.data.settings.quality !== 'auto') { if (r2d.scaleMul !== 1) { r2d.scaleMul = 1; layout(); } return; }
  if (perf.fps < 50 && r2d.scaleMul > 0.5) { r2d.scaleMul = Math.max(0.5, r2d.scaleMul - 0.1); layout(); }
  else if (perf.fps > 58 && r2d.scaleMul < 1) { r2d.scaleMul = Math.min(1, r2d.scaleMul + 0.05); layout(); }
}

function wantTouch() {
  const m = app.store.data.settings.showTouch;
  if (m === 'on') return true;
  if (m === 'off') return false;
  return matchMedia('(pointer: coarse)').matches || touch.used;
}

function layout() {
  const W = root.clientWidth, H = root.clientHeight;
  const hudH = ui.hudEl.getBoundingClientRect().height || Math.max(44, Math.min(W, H) * 0.072);
  ui.hudEl.style.left = '0'; ui.hudEl.style.right = '0'; ui.hudEl.style.top = '0';
  const portrait = H > W * 1.15;
  // 縦画面のタブレットでは、盤の下を指の置き場にする
  const bottom = portrait && wantTouch() ? Math.min(H * 0.26, H - hudH - W * 0.8) : 0;
  const area = { x: 4, y: hudH + 4, w: W - 8, h: Math.max(100, H - hudH - 8 - Math.max(0, bottom)) };
  r2d.layout(area, Math.max(1, window.devicePixelRatio || 1));
  touch.setVisible(wantTouch() && app.screen === 'play');
}

app.on((what) => { if (what === 'start' || what === 'resume' || what === 'pause' || what === 'title' || what === 'end' || what.startsWith('setting')) layout(); });
const debug = new URLSearchParams(location.search).has('debug');
const debugBox = document.createElement('div');
if (debug) { debugBox.className = 'debug'; root.appendChild(debugBox); }

// 拡大・スクロールを止め、見えている大きさが変わったら合わせ直す
const stop = (e) => { if (e.cancelable) e.preventDefault(); };
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(ev, stop, { passive: false });
document.addEventListener('touchmove', stop, { passive: false });
addEventListener('resize', layout);
if (window.visualViewport) visualViewport.addEventListener('resize', layout);
new ResizeObserver(layout).observe(root);
matchMedia('(pointer: coarse)').addEventListener?.('change', layout);
// ブラウザーの倍率・モニターの移動で devicePixelRatio が変わったとき
(function watchDpr() { const m = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`); m.addEventListener?.('change', () => { layout(); watchDpr(); }, { once: true }); })();

layout();
app.boot();
// 最初の操作で音を開ける（Safari・iOS）
const unlock = () => app.audio.unlock();
addEventListener('pointerdown', unlock, { once: false, passive: true });
addEventListener('keydown', unlock, { passive: true });
