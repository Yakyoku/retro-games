// AEGIS RELAY — 2D 版（PC・タブレットのブラウザ）
import { createApp } from '../shared/app.js';
import { createInput } from '../shared/input.js';
import { createAudio } from '../shared/audio/engine.js';
import { createDomUI, computeLayout } from '../shared/ui-dom.js';
import { installTouch } from '../shared/touch.js';
import { installNoZoom } from '../shared/no-zoom.js';
import { makeFrameClock } from '../shared/frame-clock.js';
import { otherUrl } from '../shared/sites.js';
import { createRenderer2D } from './render2d.js';

const canvas = document.getElementById('view');
const uiRoot = document.getElementById('ui');
const input = createInput();
const audio = createAudio();
let ui = null, renderer = null;
const app = createApp({
  input, audio, variant: '2d',
  hooks: {
    menuChanged: () => ui && ui.menu(),
    events: (evs, g) => renderer && renderer.onEvents(evs, g),
    gameStarted: () => ui && ui.menu(),
    settingsChanged: (k) => { if (['quality', 'renderScale', 'uiScale'].includes(k)) layout(); },
    otherVariant: { label: '3D / VR 版で遊ぶ', go: () => { location.href = otherUrl('2d'); } },
  },
});
window.__app = app; window.__input = input; // 自動検証用
ui = createDomUI(uiRoot, app, { titleHint: '↑↓ で選び Enter / Z / A ボタン / タップで決定' });
renderer = createRenderer2D(canvas, app);
const touch = installTouch(uiRoot, input, app);

function layout() { const lay = computeLayout(innerWidth, innerHeight); ui.place(lay); renderer.resize(lay); ui.menu(); }
installNoZoom(layout);

// 最初の操作で音を有効にする（自動再生の制限）。タイトルでは曲を流す
const unlock = () => { audio.unlock(); if (app.screen === 'title' && !audio.musicName) audio.playMusic('title'); };
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
addEventListener('gamepadconnected', () => {});
// フォーカスを失ったら一時停止（入力は input.js が離したことにする）
addEventListener('blur', () => app.pause('blur'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { app.pause('hidden'); audio.suspend(); }
  else if (app.screen !== 'pause' && app.screen !== 'settings') audio.resume();
});
if (app.debug) addEventListener('keydown', (e) => { const m = { KeyI: 'debugInv', KeyN: 'debugNext', KeyC: 'debugCore' }[e.code]; if (m) input.push(m); });

const clock = makeFrameClock();
let last = performance.now();
function loop(now) {
  const dt = clock(now); last = now;
  const alpha = app.update(dt);
  renderer.frame(alpha, dt);
  ui.frame(); touch.update();
  requestAnimationFrame(loop);
}
document.fonts.load("800 16px 'AR Sans'").finally(() => { layout(); requestAnimationFrame(loop); });
