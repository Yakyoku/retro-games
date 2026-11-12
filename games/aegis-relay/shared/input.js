// AEGIS RELAY — 入力（キーボード・ゲームパッド・タッチ・XR を同じ形 { mx, my, fire } と「メニューの操作」にまとめる）
// ・フォーカスを失う・タブが隠れる・パッドが抜ける → 全部離したことにする（復帰後の押しっぱなしを防ぐ）
// ・メニュー用の操作は「押した瞬間」だけ届く（up/down/left/right/ok/back/pause）
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'fire', KeyZ: 'fire', Escape: 'pause', KeyP: 'pause', Enter: 'ok', KeyX: 'back', Backspace: 'back',
};
const DEAD = 0.22;

export function createInput() {
  const keys = new Set();
  const pressed = [];            // メニュー用の「押した瞬間」
  const pad = { mx: 0, my: 0, fire: false, prev: {} };
  const ext = { mx: 0, my: 0, fire: false }; // タッチ・XR が書き込む
  let lastDevice = 'keyboard';
  const listeners = [];

  const onKey = (e, down) => {
    const a = KEYMAP[e.code]; if (!a) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault();
    lastDevice = 'keyboard';
    if (down) {
      if (!keys.has(e.code)) {
        if (a === 'fire') pressed.push('ok');
        else pressed.push(a);
        if (a === 'fire' || a === 'ok') pressed.push('any');
      }
      keys.add(e.code);
    } else keys.delete(e.code);
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  const clear = () => { keys.clear(); ext.mx = ext.my = 0; ext.fire = false; pad.mx = pad.my = 0; pad.fire = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  addEventListener('gamepaddisconnected', clear);

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    if (!gp) for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { pad.mx = pad.my = 0; pad.fire = false; return; }
    let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m < DEAD) { ax = 0; ay = 0; } else { const k = (m - DEAD) / (1 - DEAD) / m; ax *= k; ay *= k; }
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    // 標準配置: 0=南 1=東 2=西 3=北 9=Start 12-15=十字
    const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    if (dx || dy) { ax = dx; ay = dy; }
    pad.mx = ax; pad.my = ay; pad.fire = b(0) || b(2) || b(7);
    const edge = (i, name) => { const now = b(i); if (now && !pad.prev[i]) { pressed.push(name); lastDevice = 'gamepad'; } pad.prev[i] = now; };
    edge(0, 'ok'); edge(1, 'back'); edge(9, 'pause'); edge(8, 'back'); edge(12, 'up'); edge(13, 'down'); edge(14, 'left'); edge(15, 'right');
    if (b(0) && !pad.prev.any) pressed.push('any'); pad.prev.any = b(0);
    // スティックでのメニュー移動（倒した瞬間だけ）
    const sy = gp.axes[1] || 0, sx = gp.axes[0] || 0;
    const dir = sy < -0.6 ? 'up' : sy > 0.6 ? 'down' : sx < -0.6 ? 'left' : sx > 0.6 ? 'right' : null;
    if (dir && dir !== pad.prev.stick) { pressed.push(dir); lastDevice = 'gamepad'; }
    pad.prev.stick = dir;
    if (m > 0.3 || gp.buttons.some((x) => x.pressed)) lastDevice = 'gamepad';
  }

  return {
    ext,
    poll() { pollPad(); },
    state() {
      let mx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      let my = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
      if (!mx && !my) { mx = pad.mx; my = pad.my; }
      if (!mx && !my) { mx = ext.mx; my = ext.my; }
      const fire = keys.has('Space') || keys.has('KeyZ') || pad.fire || ext.fire;
      return { mx, my, fire };
    },
    take() { return pressed.splice(0); },
    push(a) { pressed.push(a); },
    clear,
    get device() { return lastDevice; },
    set device(v) { lastDevice = v; },
    dispose() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); for (const f of listeners) f(); },
  };
}
