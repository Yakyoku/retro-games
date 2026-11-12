// ツイン・ガーデン 2D — タブレットの左右同時タッチ（浮きスティック）
// 画面の左半分に置いた指が赤、右半分が青。指 ID ごとに追跡し、片方を離してももう片方の入力は奪わない。
// pointercancel・回転・フォーカス喪失・タブ非表示では、すべての指を離したことにする。
import { deadzone } from '/shared/ui/input.js';

export class TouchSticks {
  constructor(root, opts = {}) {
    this.root = root;
    this.sides = { r: null, b: null }; // { id, ox, oy, x, y }
    this.enabled = true;
    this.used = false;
    this.onPause = opts.onPause || (() => {});
    root.insertAdjacentHTML('beforeend', `
      <div class="tstick r" id="ts-r"><div class="knob"></div></div>
      <div class="tstick b" id="ts-b"><div class="knob"></div></div>
      <button class="tpause" id="ts-pause" aria-label="一時停止">Ⅱ</button>
      <div class="thint" id="ts-hint"><span>左手で赤</span><span>右手で青</span></div>`);
    this.el = { r: root.querySelector('#ts-r'), b: root.querySelector('#ts-b') };
    this.pauseBtn = root.querySelector('#ts-pause');
    this.hint = root.querySelector('#ts-hint');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.onPause(); });
    const opt = { passive: false };
    root.addEventListener('pointerdown', (e) => this.down(e), opt);
    addEventListener('pointermove', (e) => this.move(e), opt);
    addEventListener('pointerup', (e) => this.up(e), opt);
    addEventListener('pointercancel', (e) => this.up(e), opt);
    addEventListener('blur', () => this.releaseAll());
    addEventListener('orientationchange', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => this.releaseAll());
  }

  get radius() { return Math.max(44, Math.min(innerWidth, innerHeight) * 0.11); }

  down(e) {
    if (!this.enabled || e.pointerType === 'mouse') return;
    if (e.target.closest && e.target.closest('.menu:not([hidden]), button')) return;
    const side = e.clientX < innerWidth / 2 ? 'r' : 'b';
    if (this.sides[side]) return; // その側にはもう指がある
    e.preventDefault();
    this.used = true;
    this.sides[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) { /* 取れなくてもよい */ }
    this.draw();
  }
  find(id) { return this.sides.r && this.sides.r.id === id ? 'r' : this.sides.b && this.sides.b.id === id ? 'b' : null; }
  move(e) {
    const s = this.find(e.pointerId);
    if (!s) return;
    e.preventDefault();
    const t = this.sides[s];
    t.x = e.clientX; t.y = e.clientY;
    // 指が遠くへ行ったら、スティックの中心を引きずる（長い移動でも入力が切れない）
    const R = this.radius, dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy);
    if (l > R * 1.25) { t.ox = t.x - (dx / l) * R * 1.25; t.oy = t.y - (dy / l) * R * 1.25; }
    this.draw();
  }
  up(e) { const s = this.find(e.pointerId); if (s) { this.sides[s] = null; this.draw(); } }
  releaseAll() { this.sides.r = this.sides.b = null; this.draw(); }

  vec(s) {
    const t = this.sides[s];
    if (!t) return { x: 0, y: 0 };
    const R = this.radius;
    return deadzone((t.x - t.ox) / R, (t.y - t.oy) / R, 0.12);
  }
  dir() { return this.enabled ? { r: this.vec('r'), b: this.vec('b') } : null; }

  setVisible(show) {
    this.enabled = show;
    this.root.classList.toggle('touch-on', show);
    if (!show) this.releaseAll();
  }

  draw() {
    const R = this.radius;
    for (const s of ['r', 'b']) {
      const t = this.sides[s], el = this.el[s];
      if (!t) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.width = el.style.height = R * 2 + 'px';
      el.style.left = t.ox - R + 'px'; el.style.top = t.oy - R + 'px';
      const v = this.vec(s);
      el.firstElementChild.style.transform = `translate(${v.x * R * 0.7}px, ${v.y * R * 0.7}px)`;
    }
    if (this.used) this.hint.style.opacity = '0';
  }
}
