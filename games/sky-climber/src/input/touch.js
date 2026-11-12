// Sky Climber VR — タッチ操作: 画面の左半分＝左手、右半分＝右手の操作パッド。指ごとに pointerId で追跡し、
// 片方の指を離してももう片方の入力は消えない。パッドは触れた位置に出る（浮きパッド）。
import { stickToDir } from './dirs.js';
export class TouchInput {
  constructor(root) {
    this.root = root; this.pads = { L: null, R: null }; this.dirOn = { L: false, R: false }; this.active = false;
    this.el = {};
    for (const s of ['L', 'R']) {
      const base = document.createElement('div'); base.className = 'tpad tpad-' + s; base.innerHTML = `<div class="knob"></div><span>${s === 'L' ? '左手' : '右手'}</span>`;
      root.appendChild(base); this.el[s] = base;
    }
    const opt = { passive: false };
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.active = true; document.body.classList.add('touch');
      const s = e.clientX < innerWidth / 2 ? 'L' : 'R';
      if (this.pads[s]) return;
      this.pads[s] = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      try { root.setPointerCapture(e.pointerId); } catch (er) { /* 無視 */ }
      this.show(s); e.preventDefault();
    }, opt);
    const move = (e) => { for (const s of ['L', 'R']) { const p = this.pads[s]; if (p && p.id === e.pointerId) { p.x = e.clientX; p.y = e.clientY; this.show(s); e.preventDefault(); } } };
    const up = (e) => { for (const s of ['L', 'R']) { const p = this.pads[s]; if (p && p.id === e.pointerId) { this.pads[s] = null; this.show(s); } } };
    root.addEventListener('pointermove', move, opt); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  }
  show(s) {
    const el = this.el[s], p = this.pads[s];
    if (!p) { el.classList.remove('on'); return; }
    el.classList.add('on'); el.style.left = p.x0 + 'px'; el.style.top = p.y0 + 'px';
    const r = 56, dx = Math.max(-r, Math.min(r, p.x - p.x0)), dy = Math.max(-r, Math.min(r, p.y - p.y0));
    el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  poll() {
    const out = {};
    for (const s of ['L', 'R']) {
      const p = this.pads[s];
      if (!p) { out[s] = null; this.dirOn[s] = false; continue; }
      const nx = (p.x - p.x0) / 56, ny = -(p.y - p.y0) / 56;
      out[s] = stickToDir(nx, ny, this.dirOn[s]); this.dirOn[s] = !!out[s];
    }
    return out;
  }
  setVisible(v) { this.root.classList.toggle('play', v); }
}
