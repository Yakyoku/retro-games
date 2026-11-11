// VOIDBLOOM — キーボードとゲームパッド（大画面版）。毎フレーム poll() で { x, y, fire, rapid, pod, pause, start, up, down, left, right, back } を返す。
const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  fire: ['KeyZ', 'KeyJ', 'Space'], pod: ['KeyX', 'KeyK'], rapid: ['KeyC', 'KeyL'], pause: ['Escape', 'KeyP'], start: ['Enter', 'NumpadEnter'], back: ['Backspace'],
};
export class Input {
  constructor(touch = null) {
    this.touch = touch;
    this.down = new Set(); this.tapped = new Set(); this.prev = {}; this.lastPad = null; this.padName = '';
    addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); this.down.add(e.code); this.tapped.add(e.code); this.lastDevice = 'key'; });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  key(name) { return KEYS[name].some((k) => this.down.has(k) || this.tapped.has(k)); }
  poll() {
    const o = { x: 0, y: 0 };
    for (const n of Object.keys(KEYS)) o[n] = this.key(n);
    this.tapped.clear();
    if (o.left) o.x -= 1; if (o.right) o.x += 1; if (o.up) o.y += 1; if (o.down) o.y -= 1;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      this.padName = p.id;
      const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const m = Math.hypot(ax, ay); if (m < 0.2) { ax = 0; ay = 0; } else { const k = Math.min(1, (m - 0.2) / 0.7) / m; ax *= k; ay *= k; }
      if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
      if (Math.abs(ax) > Math.abs(o.x)) o.x = ax;
      if (Math.abs(ay) > Math.abs(o.y)) o.y = -ay;
      o.fire = o.fire || b(0); o.pod = o.pod || b(1) || b(4) || b(5); o.rapid = o.rapid || b(2) || b(7) || b(6);
      o.pause = o.pause || b(9); o.start = o.start || b(9) || b(0); o.back = o.back || b(8) || b(1);
      o.up = o.up || ay < -0.5; o.down = o.down || ay > 0.5; o.left = o.left || ax < -0.5; o.right = o.right || ax > 0.5;
      if (b(0) || b(1) || m > 0.3) this.lastDevice = 'pad';
    }
    // タッチ操作（スマートフォン）を混ぜる
    o.touchTap = false;
    if (this.touch) {
      const t = this.touch.read();
      if (Math.abs(t.x) + Math.abs(t.y) > Math.abs(o.x) + Math.abs(o.y)) { o.x = t.x; o.y = t.y; }
      o.fire = o.fire || t.fire; o.pod = o.pod || t.pod; o.rapid = o.rapid || t.rapid; o.pause = o.pause || t.pause;
      o.touchTap = t.start;
      if (t.fire || t.x || t.y || t.start) this.lastDevice = 'touch';
    }
    // 押した瞬間
    o.pressed = {};
    for (const k of ['fire', 'pod', 'rapid', 'pause', 'start', 'up', 'down', 'left', 'right', 'back']) { o.pressed[k] = o[k] && !this.prev[k]; this.prev[k] = o[k]; }
    return o;
  }
}
