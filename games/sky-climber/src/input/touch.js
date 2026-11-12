// Sky Climber VR — タッチ操作: 画面の左半分＝左手、右半分＝右手の操作パッド。指ごとに pointerId で追跡し、
// 片方の指を離してももう片方の入力は消えない。パッドは触れた位置に出る（浮きパッド）。指が大きく動いたら台座が追いかける。
// 2026-11-12 修正: 以前は「一度タッチされた端末」でだけ受け皿が反応する作りで、その最初のタッチ自体を受け取れず iPhone/iPad で操作できなかった。
//   → 受け皿はプレイ中つねに反応させ、タッチ端末の判定は文書全体の pointerdown と (pointer: coarse) で行う。
import { stickToDir } from './dirs.js';
const R = 56; // パッドの半径（px）
export class TouchInput {
  constructor(root) {
    this.root = root; this.pads = { L: null, R: null }; this.dirOn = { L: false, R: false }; this.active = false;
    this.el = {}; this.taps = 0;
    for (const s of ['L', 'R']) {
      const base = document.createElement('div'); base.className = 'tpad tpad-' + s; base.innerHTML = `<div class="knob"></div><span>${s === 'L' ? '左手' : '右手'}</span>`;
      root.appendChild(base); this.el[s] = base;
    }
    const markTouch = () => { if (!this.active) { this.active = true; document.body.classList.add('touch'); } };
    if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches) markTouch();
    document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') markTouch(); }, { capture: true, passive: true });
    const opt = { passive: false };
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // マウスはメニューと一時停止ボタンだけ
      markTouch(); root.classList.add('busy');
      const s = e.clientX < innerWidth / 2 ? 'L' : 'R';
      if (this.pads[s]) return;
      this.pads[s] = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      try { root.setPointerCapture(e.pointerId); } catch (er) { /* 無視 */ }
      this.show(s); e.preventDefault();
    }, opt);
    const move = (e) => {
      for (const s of ['L', 'R']) {
        const p = this.pads[s]; if (!p || p.id !== e.pointerId) continue;
        p.x = e.clientX; p.y = e.clientY;
        // 指が半径の 1.6 倍より外へ出たら、台座を指の方へ引き寄せる（向きを変えやすく）
        const dx = p.x - p.x0, dy = p.y - p.y0, d = Math.hypot(dx, dy), lim = R * 1.6;
        if (d > lim) { p.x0 += dx / d * (d - lim); p.y0 += dy / d * (d - lim); }
        this.show(s); e.preventDefault();
      }
    };
    const up = (e) => { for (const s of ['L', 'R']) { const p = this.pads[s]; if (p && p.id === e.pointerId) { this.pads[s] = null; this.show(s); } } };
    root.addEventListener('pointermove', move, opt); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    // iOS Safari の拡大ジェスチャー・ダブルタップ拡大・ページのずれを止める
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), opt);
    root.addEventListener('touchmove', (e) => e.preventDefault(), opt);
    let last = 0; document.addEventListener('touchend', (e) => { const n = performance.now(); if (n - last < 320 && e.target.closest && e.target.closest('#touch, canvas')) e.preventDefault(); last = n; }, opt);
  }
  show(s) {
    const el = this.el[s], p = this.pads[s];
    if (!p) { el.classList.remove('on'); return; }
    el.classList.add('on'); el.style.left = p.x0 + 'px'; el.style.top = p.y0 + 'px';
    const dx = Math.max(-R, Math.min(R, p.x - p.x0)), dy = Math.max(-R, Math.min(R, p.y - p.y0));
    el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  poll() {
    const out = {};
    for (const s of ['L', 'R']) {
      const p = this.pads[s];
      if (!p) { out[s] = null; this.dirOn[s] = false; continue; }
      const nx = (p.x - p.x0) / R, ny = -(p.y - p.y0) / R;
      out[s] = stickToDir(nx, ny, this.dirOn[s]); this.dirOn[s] = !!out[s];
    }
    return out;
  }
  setVisible(v) { this.root.classList.toggle('play', v); if (!v) { this.pads = { L: null, R: null }; this.show('L'); this.show('R'); } }
}
