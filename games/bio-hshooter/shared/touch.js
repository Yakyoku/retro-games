// VOIDBLOOM — スマートフォン・タブレット用のタッチ操作（大画面版で使う）
// ・指で触れたときだけ表示する（PC のマウス・キーボードでは出ない。キーやゲームパッドを使うと自動で隠れる）
// ・左半分: 触れた場所が中心になる「浮きスティック」。右側: 撃つ（長押しで溜め）・SEED・連射。右上: 一時停止
// ・pointerType が 'touch' のポインターだけを扱うので、マウスのクリック操作（メニュー）には影響しない
export const isTouchDevice = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

export class TouchControls {
  constructor(root) {
    this.state = { x: 0, y: 0, fire: false, pod: false, rapid: false, pause: false, start: false };
    this.taps = { start: false, pause: false };
    this.visible = false; this.active = false;
    this.stick = null; this.btn = new Map();
    const el = this.el = document.createElement('div');
    el.id = 'touch'; el.hidden = true;
    el.innerHTML = `
      <div class="t-zone" data-z="stick"><div class="t-base"><div class="t-knob"></div></div><span class="t-hint">指を置いた場所が中心</span></div>
      <button class="t-btn t-fire" data-b="fire"><i class="t-charge"></i><b>撃つ</b><small>長押しで溜め</small></button>
      <button class="t-btn t-pod" data-b="pod"><b>SEED</b></button>
      <button class="t-btn t-rapid" data-b="rapid"><b>連射</b></button>
      <button class="t-btn t-pause" data-b="pause" aria-label="一時停止">Ⅱ</button>`;
    root.appendChild(el);
    this.base = el.querySelector('.t-base'); this.knob = el.querySelector('.t-knob'); this.chargeEl = el.querySelector('.t-charge');
    const zone = el.querySelector('.t-zone');
    const opt = { passive: false };
    zone.addEventListener('pointerdown', (e) => this.stickDown(e), opt);
    for (const b of el.querySelectorAll('.t-btn')) {
      b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return; e.preventDefault(); b.setPointerCapture(e.pointerId); this.btn.set(e.pointerId, b.dataset.b); this.setBtn(b.dataset.b, true); b.classList.add('on'); this.vibrate(8); }, opt);
      const up = (e) => { if (!this.btn.has(e.pointerId)) return; const n = this.btn.get(e.pointerId); this.btn.delete(e.pointerId); if (![...this.btn.values()].includes(n)) { this.setBtn(n, false); b.classList.remove('on'); } };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    addEventListener('pointermove', (e) => this.stickMove(e), opt);
    addEventListener('pointerup', (e) => this.stickUp(e));
    addEventListener('pointercancel', (e) => this.stickUp(e));
    // 指で触れたら表示（画面のどこでも）。キーボード・ゲームパッドを使ったら隠す
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { this.active = true; this.taps.start = true; } }, true);
    addEventListener('keydown', () => { this.active = false; });
  }
  setBtn(name, on) {
    if (name === 'pause') { if (on) this.taps.pause = true; return; }
    this.state[name] = on;
    if (name === 'fire' && on) this.taps.start = true;
  }
  stickDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    e.preventDefault();
    if (this.stick) return;
    const r = this.el.getBoundingClientRect();
    this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    this.base.style.left = (e.clientX - r.left) + 'px'; this.base.style.top = (e.clientY - r.top) + 'px';
    this.base.classList.add('on'); this.knob.style.transform = 'translate(-50%,-50%)';
  }
  stickMove(e) {
    const st = this.stick; if (!st || e.pointerId !== st.id) return;
    e.preventDefault();
    const R = this.base.offsetWidth * 0.5 || 60;
    let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
    const m = Math.hypot(dx, dy);
    // 指が輪の外へ出たら中心が付いてくる（大きく動かしても操作が途切れない）
    if (m > R) { const k = (m - R) / m; st.ox += dx * k; st.oy += dy * k; dx -= dx * k; dy -= dy * k; const r = this.el.getBoundingClientRect(); this.base.style.left = (st.ox - r.left) + 'px'; this.base.style.top = (st.oy - r.top) + 'px'; }
    let x = dx / R, y = -dy / R;
    const n = Math.hypot(x, y), dead = 0.12;
    if (n < dead) { x = 0; y = 0; } else { const k = Math.min(1, (n - dead) / (1 - dead)) / n; x *= k; y *= k; }
    this.state.x = x; this.state.y = y;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  stickUp(e) {
    const st = this.stick; if (!st || e.pointerId !== st.id) return;
    this.stick = null; this.state.x = 0; this.state.y = 0;
    this.base.classList.remove('on'); this.knob.style.transform = 'translate(-50%,-50%)';
  }
  vibrate(ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch {} }
  // 毎フレーム: 表示するか（タッチで遊んでいて、ゲーム中か）、溜めの表示
  update(show, charge = 0) {
    const v = show && this.active;
    if (v !== this.visible) { this.visible = v; this.el.hidden = !v; if (!v) { for (const k of ['fire', 'pod', 'rapid']) this.state[k] = false; this.stick = null; this.state.x = this.state.y = 0; } }
    if (v) this.chargeEl.style.setProperty('--c', Math.round(charge * 100) + '%');
  }
  // Input.poll に混ぜる値（押した瞬間の合図は 1 回だけ返す）
  read() {
    const o = { ...this.state, start: this.taps.start, pause: this.taps.pause };
    this.taps.start = false; this.taps.pause = false;
    return o;
  }
}
