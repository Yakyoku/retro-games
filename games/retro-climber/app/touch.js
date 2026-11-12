// 鉄骨レスキュー — タッチ操作。左のスティックで移動・昇降、右のボタンでジャンプと道具。複数の指を同時に扱う。
export class Touch {
  constructor() {
    this.root = document.getElementById('touch');
    this.stick = document.getElementById('t-stick');
    this.knob = this.stick.querySelector('.t-knob');
    this.x = 0; this.y = 0; this.btn = { jump: false, act: false, pause: false };
    this.stickId = null; this.btnIds = new Map(); this.enabled = false;
    const opt = { passive: false };
    this.stick.addEventListener('pointerdown', (e) => { e.preventDefault(); this.stickId = e.pointerId; this.stick.setPointerCapture(e.pointerId); this.moveStick(e); this.enable(); }, opt);
    this.stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) { e.preventDefault(); this.moveStick(e); } }, opt);
    const endStick = (e) => { if (e.pointerId === this.stickId) { this.stickId = null; this.x = this.y = 0; this.knob.style.transform = ''; } };
    this.stick.addEventListener('pointerup', endStick); this.stick.addEventListener('pointercancel', endStick); this.stick.addEventListener('lostpointercapture', endStick);
    for (const b of this.root.querySelectorAll('.t-btn')) {
      const a = b.dataset.act;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); this.btnIds.set(e.pointerId, a); this.btn[a] = true; b.classList.add('on'); this.enable(); }, opt);
      const up = (e) => { if (this.btnIds.get(e.pointerId) === a) { this.btnIds.delete(e.pointerId); this.btn[a] = false; b.classList.remove('on'); } };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    }
    // 最初のタッチでタッチ操作を出す（マウスだけの端末では出さない）
    addEventListener('touchstart', () => this.enable(), { passive: true, once: true });
  }
  enable() { if (!this.enabled) { this.enabled = true; document.body.classList.add('touch'); } }
  show(on) { this.root.classList.toggle('show', on && this.enabled); }
  moveStick(e) {
    const r = this.stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    this.knob.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
    // 8 方向に寄せる（はしごの昇降を斜め入力で取りこぼさない）
    const dz = 0.28;
    this.x = Math.abs(dx) > dz ? Math.sign(dx) * Math.min(1, (Math.abs(dx) - dz) / (0.7 - dz) ) : 0;
    this.y = Math.abs(dy) > dz + 0.05 ? -Math.sign(dy) : 0;
  }
  releaseAll() {
    this.x = this.y = 0; this.stickId = null; this.knob.style.transform = '';
    for (const k of Object.keys(this.btn)) this.btn[k] = false; this.btnIds.clear();
    for (const b of this.root.querySelectorAll('.t-btn')) b.classList.remove('on');
  }
  read() {
    const any = this.x !== 0 || this.y !== 0 || this.btn.jump || this.btn.act || this.btn.pause;
    return { x: this.x, y: this.y, jump: this.btn.jump, act: this.btn.act, pause: this.btn.pause, any };
  }
}
