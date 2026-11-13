// 月影の魔城 — 入力のまとめ役。キーボード・ゲームコントローラー（Gamepad API の標準配置）・タッチ・Quest（XR）を
// 同じ「動作」に変換する。動作: left right up down jump attack pause / メニュー用 ok back。
// フォーカス喪失・タブ切替・コントローラー切断・タッチの取り消し・VR 終了で、押しっぱなしの状態を必ず解放する。
import { INPUT } from './config.js';

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'pause'];
export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyX'], attack: ['KeyZ', 'KeyJ'], pause: ['Escape', 'KeyP'],
};
// 標準配置: 0 下（A/×）・1 右（B/○）・2 左（X/□）・3 上（Y/△）・9 Start・12〜15 十字キー。システム予約（16 ホーム等）は使わない
export const DEFAULT_PAD = { jump: 0, attack: 2, pause: 9, back: 1 };
const ALLOWED_PAD = [0, 1, 2, 3, 4, 5, 6, 7, 9];

export function padStyle(id = '') {
  if (/054c|playstation|dualshock|dualsense/i.test(id)) return 'ps';
  if (/057e|nintendo|switch|joy-con|pro controller/i.test(id)) return 'nin';
  if (/xbox|xinput|045e/i.test(id)) return 'xbox';
  return 'generic';
}
const LABELS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu'],
  ps: ['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options'],
  nin: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '＋'],
  generic: ['下ボタン', '右ボタン', '左ボタン', '上ボタン', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start'],
};
export function padLabel(style, idx) { return (LABELS[style] || LABELS.generic)[idx] ?? `ボタン${idx}`; }
export function keyLabel(code) {
  return { Space: 'Space', Escape: 'Esc', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter' }[code] || code.replace(/^Key|^Digit/, '');
}

export class Input {
  constructor(settings = {}) {
    this.keys = structuredClone(settings.keys || DEFAULT_KEYS);
    this.pad = { ...DEFAULT_PAD, ...(settings.pad || {}) };
    this.down = new Set(); this.tapped = new Set(); // tapped: 次のフレームまで「押された」ことを覚える（フレームの間に押して離した短い入力を落とさない）
    this.touch = {}; this.xr = {};
    this.padState = {}; this.padId = ''; this.padIndex = -1; this.lastDevice = 'keyboard';
    this.prevMenu = {}; this.repeat = {};
    this.rumbleOn = settings.rumble !== false;
    this.capture = null; // キー割り当て変更中のコールバック
    const kd = (e) => {
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c({ type: 'key', code: e.code }); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.down.add(e.code); this.tapped.add(e.code); this.lastDevice = 'keyboard';
    };
    const ku = (e) => this.down.delete(e.code);
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const release = () => this.releaseAll();
    addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === this.padIndex) { this.padState = {}; this.padIndex = -1; this.onDisconnect && this.onDisconnect(); } });
    addEventListener('gamepadconnected', (e) => { this.padId = e.gamepad.id; this.onConnect && this.onConnect(e.gamepad); });
  }
  // 押しっぱなしを解放する。メニューの「押した瞬間」の記憶は「全部押されていた」にして、
  // いま物理的に押されているボタン（ポーズを開いた Start など）が次のフレームで押し直し扱いにならないようにする
  releaseAll() { this.down.clear(); this.tapped.clear(); this.touch = {}; this.xr = {}; this.padState = {}; this.prevMenu = { up: true, down: true, left: true, right: true, ok: true, back: true, pause: true }; }
  setTouch(t) { this.touch = t; if (Object.values(t).some(Boolean)) this.lastDevice = 'touch'; }
  setXR(x) { this.xr = x; }
  // コントローラーを読む（毎フレーム 1 回）
  pollPad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    let gp = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    if (!gp) for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.padState = {}; return; }
    this.padIndex = gp.index; this.padId = gp.id; this.gp = gp;
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag < INPUT.deadzone) { ax = 0; ay = 0; } else { const k = (mag - INPUT.deadzone) / (1 - INPUT.deadzone) / mag; ax *= k; ay *= k; }
    const s = {
      left: b(14) || ax < -0.5, right: b(15) || ax > 0.5, up: b(12) || ay < -0.5, down: b(13) || ay > 0.5,
      jump: b(this.pad.jump), attack: b(this.pad.attack), pause: b(this.pad.pause), back: b(this.pad.back),
    };
    if (Object.values(s).some(Boolean)) this.lastDevice = 'pad';
    this.padState = s;
    this.padButtons = gp.buttons.map((x) => x.pressed);
  }
  key(action) { return (this.keys[action] || []).some((c) => this.down.has(c) || this.tapped.has(c)); }
  endFrame() { this.tapped.clear(); }
  // ゲーム用の状態
  state() {
    const s = {};
    for (const a of ACTIONS) s[a] = this.key(a) || !!this.padState[a] || !!this.touch[a] || !!this.xr[a];
    if (s.left && s.right) { s.left = s.right = false; }
    return s;
  }
  // メニュー用の押した瞬間（長押しは一定間隔で繰り返す）
  menu(dt) {
    const s = this.state();
    const cur = {
      up: s.up, down: s.down, left: s.left, right: s.right,
      ok: s.jump || this.down.has('Enter') || this.tapped.has('Enter') || this.down.has('NumpadEnter') || !!this.xr.ok || !!(this.padButtons && this.padButtons[this.pad.jump]),
      back: this.down.has('Escape') || this.tapped.has('Escape') || this.down.has('Backspace') || !!this.padState.back || !!this.xr.back,
      pause: s.pause,
    };
    const out = {};
    for (const k of Object.keys(cur)) {
      const was = this.prevMenu[k];
      if (cur[k] && !was) { out[k] = true; this.repeat[k] = INPUT.repeatDelay; }
      else if (cur[k] && ['up', 'down', 'left', 'right'].includes(k)) { this.repeat[k] -= dt; if (this.repeat[k] <= 0) { out[k] = true; this.repeat[k] = INPUT.repeatRate; } }
    }
    this.prevMenu = cur;
    return out;
  }
  // 割り当て変更: 次に押したキー／ボタンを action に割り当てる
  captureNext(cb) { this.capture = cb; }
  waitPadButton(cb) {
    const start = (this.padButtons || []).slice();
    const tick = () => {
      this.pollPad();
      const pb = this.padButtons || [];
      for (let i = 0; i < pb.length; i++) if (pb[i] && !start[i] && ALLOWED_PAD.includes(i)) return cb(i);
      for (let i = 0; i < pb.length; i++) if (!pb[i]) start[i] = false;
      if (this.capture === null && this._padWait) requestAnimationFrame(tick);
    };
    this._padWait = true; requestAnimationFrame(tick);
  }
  rumble(ms = 80, strong = 0.5) {
    if (!this.rumbleOn || !this.gp) return;
    const a = this.gp.vibrationActuator;
    try { if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch(() => {}); } catch (e) { /* 対応していない */ }
  }
  labels() {
    const st = padStyle(this.padId);
    return {
      device: this.lastDevice, style: st,
      jump: this.lastDevice === 'pad' ? padLabel(st, this.pad.jump) : this.lastDevice === 'touch' ? '跳' : keyLabel(this.keys.jump[0]),
      attack: this.lastDevice === 'pad' ? padLabel(st, this.pad.attack) : this.lastDevice === 'touch' ? '投' : keyLabel(this.keys.attack[0]),
      pause: this.lastDevice === 'pad' ? padLabel(st, this.pad.pause) : this.lastDevice === 'touch' ? 'II' : keyLabel(this.keys.pause[0]),
      ok: this.lastDevice === 'pad' ? padLabel(st, this.pad.jump) : 'Enter / ' + keyLabel(this.keys.jump[0]),
      back: this.lastDevice === 'pad' ? padLabel(st, this.pad.back) : 'Esc',
    };
  }
}
