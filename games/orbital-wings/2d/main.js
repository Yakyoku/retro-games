// ORBITAL WINGS 2D の入口
window.__owProgress?.(0.3, '読み込み中…');
const { App, startLoop } = await import('../shared/app.js');
window.__owProgress?.(0.7, '描画の準備…');
const { Render2D } = await import('./render2d.js');
const app = new App({ variant: '2d', renderer: new Render2D(), root: document.getElementById('root') });
startLoop(app);
window.__owProgress?.(1);
window.__owReady?.();
document.querySelector('.rotate')?.addEventListener('pointerdown', (e) => e.currentTarget.remove());
