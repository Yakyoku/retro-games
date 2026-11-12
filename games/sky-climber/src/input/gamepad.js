// Sky Climber VR — 通常ブラウザーのゲームパッド（Gamepad API・standard マッピング）。
// 決定=下側のフェイスボタン（standard の 0）、戻る=右側（1）、一時停止=Start 相当（9）。表記は機種で変える。
import { stickToDir, radial } from './dirs.js';

export function padLabels(id = '') {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return { ok: 'A', back: 'B', start: 'Start', kind: 'xbox' };
  if (/054c|playstation|dualshock|dualsense|wireless controller/.test(s)) return { ok: '×', back: '○', start: 'OPTIONS', kind: 'ps' };
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return { ok: 'B', back: 'A', start: '+', kind: 'nintendo' };
  return { ok: 'A', back: 'B', start: 'Start', kind: 'xbox' };
}

export class GamepadInput {
  constructor() {
    this.index = null; this.prev = {}; this.dirOn = { L: false, R: false }; this.connected = false; this.labels = padLabels();
    this.onDisconnect = null; this.onConnect = null;
    addEventListener('gamepadconnected', (e) => { if (this.index == null) this.index = e.gamepad.index; this.labels = padLabels(e.gamepad.id); this.connected = true; this.onConnect?.(e.gamepad); });
    addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === this.index) { this.index = null; this.connected = false; this.prev = {}; this.onDisconnect?.(e.gamepad); } });
  }
  pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index != null && list[this.index] && list[this.index].connected) return list[this.index];
    for (const g of list) if (g && g.connected && g.mapping === 'standard') { this.index = g.index; this.labels = padLabels(g.id); this.connected = true; return g; }
    return null;
  }
  // 毎フレーム 1 回。押した瞬間（edge）を返す
  poll() {
    const g = this.pad();
    const out = { connected: !!g, L: null, R: null, nav: { x: 0, y: 0 }, edge: {}, held: {} };
    if (!g) return out;
    const b = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
    const names = { ok: 0, back: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
    for (const [k, i] of Object.entries(names)) { const v = b(i); out.held[k] = v; out.edge[k] = v && !this.prev[k]; this.prev[k] = v; }
    // 左右スティック → 左右の手（Y は上が正）
    const lx = g.axes[0] || 0, ly = -(g.axes[1] || 0), rx = g.axes[2] || 0, ry = -(g.axes[3] || 0);
    out.L = stickToDir(lx, ly, this.dirOn.L); this.dirOn.L = !!out.L;
    out.R = stickToDir(rx, ry, this.dirOn.R); this.dirOn.R = !!out.R;
    // 十字キーは「両手を同じ向き」ではなく UI 移動と、左手の補助
    const dx = (out.held.right ? 1 : 0) - (out.held.left ? 1 : 0), dy = (out.held.up ? 1 : 0) - (out.held.down ? 1 : 0);
    const r = radial(lx, ly);
    out.nav = { x: dx || (Math.abs(r.x) > 0.5 ? Math.sign(r.x) : 0), y: dy || (Math.abs(r.y) > 0.5 ? Math.sign(r.y) : 0) };
    if (!out.L && (dx || dy)) out.L = { x: dx / Math.hypot(dx, dy || 0.0001) * (dx ? 1 : 0), y: dy ? dy / Math.hypot(dx, dy) : 0 };
    out.id = g.id;
    return out;
  }
  rumble(ms = 60, strong = 0.5) { const g = this.pad(); try { g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }); } catch (e) { /* 非対応 */ } }
}
