// 鉄骨レスキュー — 入力アダプター。キーボード・ゲームパッド・タッチ・WebXR コントローラーを
// 同じ「行動」{ x, y, jump, act, grab, pause, confirm, back, up, down, left, right } にまとめる。
// 押した瞬間（pressed）は「全系統を合わせた状態」の立ち上がりで 1 回だけ立てるので、
// キーとパッドを同時に押しても 2 回ジャンプ・2 回決定にならない。
// フォーカス喪失・非表示・XR の入力切断では releaseAll() で押しっぱなしを解除する。

const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space'], act: ['KeyF'], pause: ['Escape', 'KeyP'], confirm: ['Enter', 'NumpadEnter', 'Space'], back: ['Backspace', 'Escape'],
};
export const ACTIONS = ['jump', 'act', 'grab', 'pause', 'confirm', 'back', 'up', 'down', 'left', 'right', 'snapL', 'snapR', 'recenter', 'view'];

// ゲームパッドの種類からボタンの名前を決める（A/X に固定しない）
export function padLabels(id = '') {
  const s = id.toLowerCase();
  if (/054c|playstation|dualshock|dualsense|ps4|ps5/.test(s)) return { family: 'PlayStation', south: '×', west: '□', east: '○', start: 'OPTIONS' };
  if (/057e|nintendo|switch|pro controller|joy-con/.test(s)) return { family: 'Nintendo', south: 'B', west: 'Y', east: 'A', start: '＋' };
  if (/045e|xbox|xinput/.test(s)) return { family: 'Xbox', south: 'A', west: 'X', east: 'B', start: '≡' };
  return { family: 'Gamepad', south: '下ボタン', west: '左ボタン', east: '右ボタン', start: 'START' };
}

export function deadzone(ax, ay, dz = 0.22) {
  const m = Math.hypot(ax, ay);
  if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz - 0.1)) / m;
  return [ax * k, ay * k];
}

export class Input {
  constructor(target = typeof window !== 'undefined' ? window : null) {
    this.keys = new Set(); this.tapped = new Set();
    this.prev = {}; this.state = {}; this.pressed = {};
    this.touch = null; this.xr = null;        // 外から差し込む（read() で同じ形を返すもの）
    this.padId = ''; this.padConnected = false; this.lastDevice = 'key';
    this.suppressPads = false;                // XR 中は通常のゲームパッドを読まない（二重入力を防ぐ）
    this.onPadChange = null;
    if (target) {
      target.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (e.repeat) return;
        this.keys.add(e.code); this.tapped.add(e.code); this.lastDevice = 'key';
      });
      target.addEventListener('keyup', (e) => this.keys.delete(e.code));
      target.addEventListener('blur', () => this.releaseAll());
      target.addEventListener('gamepadconnected', (e) => { this.padId = e.gamepad.id; this.padConnected = true; this.onPadChange && this.onPadChange(true, e.gamepad.id); });
      target.addEventListener('gamepaddisconnected', () => { this.padConnected = false; this.releaseAll(); this.onPadChange && this.onPadChange(false, ''); });
    }
  }
  releaseAll() {
    this.keys.clear(); this.tapped.clear();
    // 押しっぱなしのまま復帰しても「押した瞬間」にならないよう、prev を立てたままにして次の離しを待つ
    for (const k of ACTIONS) { if (this.state[k]) this.prev[k] = true; this.state[k] = false; }
    this.blockUntilRelease = true;
    if (this.touch && this.touch.releaseAll) this.touch.releaseAll();
  }
  key(name) { return (KEYMAP[name] || []).some((k) => this.keys.has(k) || this.tapped.has(k)); }
  readPads() {
    const o = { x: 0, y: 0 };
    if (this.suppressPads || typeof navigator === 'undefined' || !navigator.getGamepads) return o;
    for (const p of navigator.getGamepads()) {
      if (!p || !p.connected || p.mapping === 'xr-standard') continue;
      this.padId = p.id; this.padConnected = true;
      const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      let [ax, ay] = deadzone(p.axes[0] || 0, p.axes[1] || 0);
      if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
      if (Math.abs(ax) > Math.abs(o.x)) o.x = ax;
      if (Math.abs(ay) > Math.abs(o.y)) o.y = -ay;
      o.jump = o.jump || b(0); o.act = o.act || b(2); o.pause = o.pause || b(9);
      o.confirm = o.confirm || b(0); o.back = o.back || b(1);
      if (b(0) || b(1) || b(2) || b(9) || Math.hypot(ax, ay) > 0.3) this.lastDevice = 'pad';
    }
    return o;
  }
  poll() {
    const o = { x: 0, y: 0 };
    if (this.key('left')) o.x -= 1; if (this.key('right')) o.x += 1;
    if (this.key('up')) o.y += 1; if (this.key('down')) o.y -= 1;
    for (const a of ['jump', 'act', 'pause', 'confirm', 'back']) o[a] = this.key(a);
    this.tapped.clear();
    const merge = (src) => {
      if (!src) return;
      if (Math.abs(src.x || 0) > Math.abs(o.x)) o.x = src.x;
      if (Math.abs(src.y || 0) > Math.abs(o.y)) o.y = src.y;
      for (const a of ACTIONS) if (src[a]) o[a] = true;
    };
    merge(this.readPads());
    if (this.touch) { const t = this.touch.read(); if (t.any) this.lastDevice = 'touch'; merge(t); }
    if (this.xr) { const x = this.xr.read(); if (x.any) this.lastDevice = 'xr'; merge(x); }
    o.up = o.up || o.y > 0.5; o.down = o.down || o.y < -0.5; o.left = o.left || o.x < -0.5; o.right = o.right || o.x > 0.5;
    // 押した瞬間（全系統を合わせた状態の立ち上がり）
    const pressed = {};
    let anyHeld = false;
    for (const a of ACTIONS) {
      const now = !!o[a];
      if (now) anyHeld = true;
      pressed[a] = now && !this.prev[a] && !this.blockUntilRelease;
      if (!now) this.prev[a] = false; else this.prev[a] = true;
      this.state[a] = now;
    }
    if (this.blockUntilRelease && !anyHeld) this.blockUntilRelease = false;
    if (this.blockUntilRelease) { o.x = 0; o.y = 0; for (const a of ACTIONS) o[a] = false; }
    o.pressed = pressed;
    return o;
  }
  // ゲームの論理へ渡す形
  static toGame(o) {
    return { x: o.x, y: o.y, jump: o.jump, act: o.act, grab: o.grab, jumpPressed: o.pressed.jump, actPressed: o.pressed.act, grabPressed: o.pressed.grab };
  }
}
