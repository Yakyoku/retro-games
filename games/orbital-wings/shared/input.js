// 入力をまとめて共通の操作（移動・射撃・決定・一時停止・メニュー移動）に変換する
// キーボード / ゲームパッド（Gamepad API の standard 配列）/ タッチ（仮想スティックとボタン）。XR は 3D 版が addSource で足す。
const DEAD = 0.22;

export function deadzone(x, y, d = DEAD) {
  const m = Math.hypot(x, y);
  if (m < d) return [0, 0];
  const k = Math.min(1, (m - d) / (1 - d)) / m;
  return [x * k, y * k];
}

// コントローラーの名前から表示用の配列を決める（実際の id 文字列から推定。推定できなければ汎用表示）
export function padProfile(id = '') {
  const s = id.toLowerCase();
  if (/054c|playstation|dualshock|dualsense|wireless controller/.test(s)) return { kind: 'ps', a: '×', b: '○', start: 'OPTIONS', label: 'PlayStation 系' };
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return { kind: 'nin', a: 'B', b: 'A', start: '+', label: 'Nintendo 系' };
  if (/045e|xbox|xinput/.test(s)) return { kind: 'xbox', a: 'A', b: 'B', start: 'Menu', label: 'Xbox 系' };
  return { kind: 'generic', a: 'A(下)', b: 'B(右)', start: 'Start', label: '汎用' };
}

export class Input {
  constructor({ depth = false } = {}) {
    this.depth = depth;
    this.keys = new Set();
    this.prevMenu = {};
    this.touch = { mx: 0, my: 0, fire: false, power: false, pause: false };
    this.sources = [];               // 追加の入力源（XR など）: () => partial state
    this.lastDevice = 'keyboard';
    this.pad = null; this.padInfo = padProfile('');
    this.prevPadButtons = [];
    this.invertDepth = false;
    this.onDevice = null;
    this._bind();
  }
  _bind() {
    const codes = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight', 'Escape', 'Enter', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyP', 'Backspace']);
    addEventListener('keydown', (e) => {
      if (codes.has(e.code)) e.preventDefault();
      if (!e.repeat) this.keys.add(e.code);
      this._device('keyboard');
    }, { passive: false });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // フォーカスを失ったら押しっぱなしを解除（入力残りを防ぐ）
    const clear = () => this.releaseAll();
    addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    addEventListener('gamepadconnected', (e) => { this.padInfo = padProfile(e.gamepad.id); this._device('gamepad'); this.onPad?.('connected', e.gamepad); });
    addEventListener('gamepaddisconnected', (e) => { this.releaseAll(); this.onPad?.('disconnected', e.gamepad); });
  }
  _device(d) { if (this.lastDevice !== d) { this.lastDevice = d; this.onDevice?.(d); } }
  releaseAll() {
    this.keys.clear();
    Object.assign(this.touch, { mx: 0, my: 0, fire: false, power: false, pause: false });
    this.heldFire = false;
    this.prevPadButtons = [];
  }

  _readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    if (!pad) for (const p of pads) if (p && p.connected && !/xr|oculus|meta|openxr/i.test(p.id)) { pad = p; break; }
    this.pad = pad;
    if (!pad) return null;
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const [lx, ly] = deadzone(pad.axes[0] || 0, pad.axes[1] || 0);
    const ry = Math.abs(pad.axes[3] || 0) > DEAD ? pad.axes[3] : 0;
    const st = {
      mx: lx + (b(15) ? 1 : 0) - (b(14) ? 1 : 0),
      my: -ly + (b(12) ? 1 : 0) - (b(13) ? 1 : 0),
      mz: -ry,
      fire: b(0) || b(7) || b(5), power: b(1) || b(2), pause: b(9), back: b(1), confirm: b(0),
    };
    if (pad.buttons.some((x) => x.pressed) || Math.abs(lx) + Math.abs(ly) > 0) { this._device('gamepad'); this.padInfo = padProfile(pad.id); }
    return st;
  }

  // 毎 tick 呼ぶ。edge 系（power / pause / menu）は押した瞬間だけ true
  poll() {
    const k = this.keys;
    let mx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let my = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    let mz = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    let fire = k.has('KeyZ') || k.has('Space');
    let power = k.has('KeyX') || k.has('ShiftLeft') || k.has('ShiftRight');
    let pause = k.has('Escape') || k.has('KeyP');
    let confirm = k.has('Enter') || k.has('KeyZ') || k.has('Space');
    let back = k.has('Escape') || k.has('KeyX') || k.has('Backspace');
    const pad = this._readPad();
    if (pad) { mx += pad.mx; my += pad.my; mz += pad.mz; fire ||= pad.fire; power ||= pad.power; pause ||= pad.pause; confirm ||= pad.confirm; back ||= pad.back; }
    const t = this.touch;
    mx += t.mx; my += t.my; fire ||= t.fire; power ||= t.power; pause ||= t.pause;
    for (const src of this.sources) {
      const s = src(); if (!s) continue;
      mx += s.mx || 0; my += s.my || 0; mz += s.mz || 0; fire ||= !!s.fire; power ||= !!s.power; pause ||= !!s.pause; confirm ||= !!s.confirm; back ||= !!s.back;
    }
    if (this.invertDepth) mz = -mz;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const cur = { up: my > 0.5, down: my < -0.5, left: mx < -0.5, right: mx > 0.5, confirm, back, pause, power };
    const edge = {};
    for (const key in cur) edge[key] = cur[key] && !this.prevMenu[key];
    // メニューの上下は押し続けで繰り返す
    for (const key of ['up', 'down', 'left', 'right']) {
      if (cur[key]) { this.rep = this.rep || {}; this.rep[key] = (this.rep[key] || 0) + 1; if (this.rep[key] > 22 && this.rep[key] % 6 === 0) edge[key] = true; }
      else if (this.rep) this.rep[key] = 0;
    }
    this.prevMenu = cur;
    return { mx: clamp(mx), my: clamp(my), mz: this.depth ? clamp(mz) : 0, fire, power: edge.power, pause: edge.pause, menu: edge };
  }

  // 振動（設定で無効化できる）
  rumble(strength = 0.3, ms = 80) {
    if (!this.vibration) return;
    const p = this.pad;
    try { p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch {}
    try { if (this.lastDevice === 'touch' && navigator.vibrate) navigator.vibrate(Math.min(ms, 60)); } catch {}
  }
}

// タッチ操作: 左半分は触れた場所が中心になる浮きスティック、右に射撃・パワーアップ、右上に一時停止
export function attachTouch(input, root) {
  const ui = document.createElement('div');
  ui.className = 'touch-ui';
  ui.innerHTML = `<div class="tstick"><div class="tknob"></div></div>
    <button class="tbtn tfire" aria-label="射撃">SHOT</button>
    <button class="tbtn tpow" aria-label="パワーアップ">POWER</button>
    <button class="tbtn tpause" aria-label="一時停止">II</button>`;
  root.appendChild(ui);
  const stick = ui.querySelector('.tstick'), knob = ui.querySelector('.tknob');
  let stickId = null, cx = 0, cy = 0;
  const R = () => Math.max(46, Math.min(innerWidth, innerHeight) * 0.11);
  const show = (on) => { ui.classList.toggle('on', on); };
  const zone = (x) => x < innerWidth * 0.5;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    input._device('touch'); show(true);
    if (zone(e.clientX) && stickId === null && !e.target.closest('.tbtn')) {
      stickId = e.pointerId; cx = e.clientX; cy = e.clientY;
      stick.style.left = cx + 'px'; stick.style.top = cy + 'px'; stick.classList.add('act');
      knob.style.transform = 'translate(-50%,-50%)';
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const r = R(), m = Math.hypot(dx, dy);
    if (m > r) { cx += dx / m * (m - r); cy += dy / m * (m - r); dx = e.clientX - cx; dy = e.clientY - cy; stick.style.left = cx + 'px'; stick.style.top = cy + 'px'; }
    const [x, y] = deadzone(dx / r, -dy / r, 0.12);
    input.touch.mx = x; input.touch.my = y;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const end = (e) => {
    if (e.pointerId === stickId) { stickId = null; input.touch.mx = 0; input.touch.my = 0; stick.classList.remove('act'); knob.style.transform = 'translate(-50%,-50%)'; }
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  const hold = (sel, key) => {
    const b = ui.querySelector(sel);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); input.touch[key] = true; b.classList.add('down'); });
    const up = (e) => { input.touch[key] = false; b.classList.remove('down'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  };
  hold('.tfire', 'fire'); hold('.tpow', 'power'); hold('.tpause', 'pause');
  addEventListener('keydown', () => show(false));
  input.onTouchShow = show;
  return ui;
}
