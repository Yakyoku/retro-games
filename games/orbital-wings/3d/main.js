// ORBITAL WINGS 3D / VR の入口
window.__owProgress?.(0.2, '読み込み中…');
const { App, startLoop } = await import('../shared/app.js');
window.__owProgress?.(0.5, '3D の準備…');
const { Render3D } = await import('./render3d.js');
window.__owProgress?.(0.8, 'モデルの準備…');
const app = new App({ variant: '3d', renderer: new Render3D(), root: document.getElementById('root') });
startLoop(app);
window.__owProgress?.(1);
window.__owReady?.();
document.querySelector('.rotate')?.addEventListener('pointerdown', (e) => e.currentTarget.remove());
