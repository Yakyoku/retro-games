// 2D 版の入力: キーボード・ゲームパッド・タッチを 1 つの「操作」にまとめる。
// フォーカス喪失・タブ切替・タッチのキャンセル・ゲームパッド切断では、押しっぱなしを必ず解除する。
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'fire', KeyJ: 'fire', KeyX: 'jump', Space: 'jump', KeyK: 'jump', Escape: 'pause', KeyP: 'pause', Enter: 'ok', NumpadEnter: 'ok', Backspace: 'back',
};
const DEAD = 0.38;

export class Input2D {
  constructor() {
    this.keys = new Set(); this.touch = {}; this.prev = {}; this.device = 'kb'; this.pad = null; this.padName = ''; this.padStyle = 'xbox';
    this.listeners = [];
    this.onDevice = null; this.onPadChange = null;
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (!e.metaKey && !e.ctrlKey) e.preventDefault();
      this.keys.add(a); this.setDevice('kb');
    }, { passive: false });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.keys.delete(a); });
    const clear = () => this.releaseAll();
    addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    addEventListener('gamepadconnected', (e) => { this.padLabel(e.gamepad); this.onPadChange && this.onPadChange(true, e.gamepad.id); });
    addEventListener('gamepaddisconnected', (e) => { this.padHeld = {}; this.onPadChange && this.onPadChange(false, e.gamepad.id); });
  }
  releaseAll() { this.keys.clear(); this.touch = {}; this.padHeld = {}; this.resetTouchUi && this.resetTouchUi(); }
  setDevice(d) { if (this.device !== d) { this.device = d; this.onDevice && this.onDevice(d); } }
  padLabel(gp) {
    const id = (gp && gp.id || '').toLowerCase();
    this.padName = gp ? gp.id : '';
    this.padStyle = /054c|playstation|dualsense|dualshock/.test(id) ? 'ps' : /057e|nintendo|pro controller/.test(id) ? 'nin' : 'xbox';
  }

  // タッチ操作盤をつなぐ（index.html の #touch）
  bindTouch(root) {
    const pad = root.querySelector('[data-pad]');
    const btns = root.querySelectorAll('[data-btn]');
    const padState = new Map();
    const updPad = () => {
      let l = false, r = false, u = false, d = false;
      for (const v of padState.values()) { l ||= v.l; r ||= v.r; u ||= v.u; d ||= v.d; }
      Object.assign(this.touch, { left: l, right: r, up: u, down: d });
      pad.dataset.dir = (u ? 'u' : '') + (d ? 'd' : '') + (l ? 'l' : '') + (r ? 'r' : '');
    };
    const padMove = (e) => {
      const b = pad.getBoundingClientRect();
      const dx = (e.clientX - (b.left + b.width / 2)) / (b.width / 2), dy = (e.clientY - (b.top + b.height / 2)) / (b.height / 2);
      const mag = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const v = { l: false, r: false, u: false, d: false };
      if (mag > 0.22) {
        // 8 方向。左右は広め（移動を優先）、上下は斜めでも入るが ±35°
        const deg = a * 180 / Math.PI;
        v.r = deg > -60 && deg < 60; v.l = deg > 120 || deg < -120;
        v.u = deg < -35 && deg > -145; v.d = deg > 35 && deg < 145;
      }
      padState.set(e.pointerId, v); updPad();
    };
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); this.setDevice('touch'); padMove(e); });
    pad.addEventListener('pointermove', (e) => { if (padState.has(e.pointerId)) padMove(e); });
    const padEnd = (e) => { padState.delete(e.pointerId); updPad(); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, padEnd);
    for (const b of btns) {
      const name = b.dataset.btn;
      const ids = new Set();
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); ids.add(e.pointerId); this.touch[name] = true; b.classList.add('on'); this.setDevice('touch'); });
      const end = (e) => { ids.delete(e.pointerId); if (!ids.size) { this.touch[name] = false; b.classList.remove('on'); } };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, end);
    }
    this.resetTouchUi = () => { padState.clear(); updPad(); for (const b of btns) b.classList.remove('on'); };
  }

  pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads.find((p) => p.connected);
    const h = {};
    if (gp) {
      if (gp.id !== this.padName) this.padLabel(gp);
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      const sx = mag > DEAD ? ax : 0, sy = mag > DEAD ? ay : 0;
      h.left = b(14) || sx < -0.5; h.right = b(15) || sx > 0.5;
      h.up = b(12) || sy < -0.6; h.down = b(13) || sy > 0.6;
      h.jump = b(0); h.fire = b(2) || b(3) || b(7) || b(5); h.pause = b(9); h.back = b(1); h.ok = b(0);
      if (Object.values(h).some(Boolean)) this.setDevice('pad');
    }
    this.padHeld = h;
    return h;
  }

  poll() {
    const pad = this.pollPad();
    const k = (a) => this.keys.has(a) || !!pad[a] || !!this.touch[a];
    const cur = {
      left: k('left'), right: k('right'), up: k('up'), down: k('down'), fire: k('fire'), jump: k('jump'),
      pause: k('pause'), ok: this.keys.has('ok') || this.keys.has('jump') || !!pad.ok, back: this.keys.has('back') || !!pad.back || this.keys.has('pause'),
    };
    const edge = {};
    for (const [a, v] of Object.entries(cur)) edge[a] = v && !this.prev[a];
    this.prev = cur;
    return { held: cur, edge };
  }
}

export const PAD_GLYPH = {
  xbox: { jump: 'A', fire: 'X', back: 'B', pause: 'Menu' },
  ps: { jump: '×', fire: '□', back: '○', pause: 'OPTIONS' },
  nin: { jump: 'B', fire: 'Y', back: 'A', pause: '+' },
};
