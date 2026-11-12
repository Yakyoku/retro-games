// キーボード・ゲームパッド・タッチ（仮想ボタン）をまとめる入力。
// ・方向は「最後に押した方向」を優先（斜め入力で速くならない／曲がりたい方向が取りこぼされない）
// ・フォーカス喪失・タブ非表示・切断で全入力を初期化（押しっぱなしの残りを防ぐ）
// ・プレイ中は矢印・Space によるページスクロールを止める
const DIRS = ['up', 'down', 'left', 'right'];
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'pump', KeyJ: 'pump', KeyZ: 'pump', Enter: 'confirm', NumpadEnter: 'confirm',
  Escape: 'pause', KeyP: 'pause', KeyM: 'map', Backspace: 'back', KeyX: 'back', Tab: 'map',
};
export const DEADZONE = 0.35;

export function createInput({ target = window } = {}) {
  const keys = new Set();          // 押されている論理ボタン（キーボード）
  const dirStack = [];             // 押された順の方向（キーボード + タッチ + パッド）
  const touch = { dir: null, pump: false, pause: false };
  const pads = { connected: 0, last: null, prev: {}, dirs: new Set(), btn: {} };
  const edges = new Set();         // このフレームで押された論理ボタン
  let device = 'keyboard';         // 'keyboard' | 'gamepad' | 'touch'（案内表示の切り替え用）
  let blockScroll = true;
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };

  function pushDir(d) { const i = dirStack.indexOf(d); if (i >= 0) dirStack.splice(i, 1); dirStack.push(d); }
  function popDir(d) { const i = dirStack.indexOf(d); if (i >= 0) dirStack.splice(i, 1); }
  function press(b) { if (DIRS.includes(b)) pushDir(b); edges.add(b); }

  on(target, 'keydown', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    if (blockScroll && (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab' || e.code === 'Backspace')) e.preventDefault();
    device = 'keyboard';
    if (e.repeat) return;
    keys.add(b + ':' + e.code); press(b);
  });
  on(target, 'keyup', (e) => {
    const b = KEYMAP[e.code]; if (!b) return;
    keys.delete(b + ':' + e.code);
    if (DIRS.includes(b) && !isKey(b)) popDir(b);
  });
  const isKey = (b) => { for (const k of keys) if (k.startsWith(b + ':')) return true; return false; };

  function reset() { keys.clear(); dirStack.length = 0; edges.clear(); touch.dir = null; touch.pump = false; pads.dirs.clear(); pads.btn = {}; pads.prev = {}; pads.hold = true; }
  on(window, 'blur', reset);
  on(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  on(window, 'gamepadconnected', () => { device = 'gamepad'; });
  on(window, 'gamepaddisconnected', () => { reset(); });

  // ゲームパッド: 毎フレーム poll() で読む。標準配置（A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Back=8, Start=9, 十字=12..15）
  function pollPads() {
    const list = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    let gp = null; let n = 0;
    for (const g of list) if (g && g.connected) { n++; if (!gp || g.timestamp > gp.timestamp) gp = g; }
    pads.connected = n;
    const btn = {};
    const dirs = new Set();
    const axes = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
    if (gp) {
      const B = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      axes.lx = dz(gp.axes[0] || 0); axes.ly = dz(gp.axes[1] || 0); axes.rx = dz(gp.axes[2] || 0); axes.ry = dz(gp.axes[3] || 0);
      axes.lt = gp.buttons[6] ? gp.buttons[6].value : 0; axes.rt = gp.buttons[7] ? gp.buttons[7].value : 0;
      if (B(12) || axes.ly < -DEADZONE) dirs.add('up');
      if (B(13) || axes.ly > DEADZONE) dirs.add('down');
      if (B(14) || axes.lx < -DEADZONE) dirs.add('left');
      if (B(15) || axes.lx > DEADZONE) dirs.add('right');
      btn.pump = B(0) || B(2) || B(7);
      btn.confirm = B(0);
      btn.back = B(1);
      btn.map = B(3);
      btn.pause = B(9);
      btn.select = B(8);
      // スティックが斜めのときは、強い軸だけ残す（2D の 4 方向）
      if (dirs.size > 1 && !(B(12) || B(13) || B(14) || B(15))) {
        if (Math.abs(axes.lx) > Math.abs(axes.ly)) { dirs.delete('up'); dirs.delete('down'); } else { dirs.delete('left'); dirs.delete('right'); }
      }
      const any = dirs.size || Object.values(btn).some(Boolean) || Math.abs(axes.rx) > 0.3 || Math.abs(axes.ry) > 0.3;
      if (any && !pads.hold) device = 'gamepad';
    }
    // 復帰直後（reset 後）に押されっぱなしのボタンは、いったん離すまで無視する
    if (pads.hold) { if (!dirs.size && !Object.values(btn).some(Boolean)) pads.hold = false; else { dirs.clear(); for (const k in btn) btn[k] = false; } }
    for (const d of DIRS) { if (dirs.has(d) && !pads.dirs.has(d)) press(d); if (!dirs.has(d) && pads.dirs.has(d) && !isKey(d) && touch.dir !== d) popDir(d); }
    for (const k of Object.keys(btn)) if (btn[k] && !pads.btn[k]) edges.add(k);
    pads.dirs = dirs; pads.btn = btn; pads.axes = axes; pads.last = gp;
  }

  return {
    poll() { pollPads(); },
    // 1 フレームの読み取り。呼んだあと edges は消える
    read() {
      const held = (b) => isKey(b) || !!pads.btn[b] || (b === 'pump' && touch.pump);
      let dir = null;
      for (let i = dirStack.length - 1; i >= 0; i--) {
        const d = dirStack[i];
        if (isKey(d) || pads.dirs.has(d) || touch.dir === d) { dir = d; break; }
      }
      const out = {
        dir, pump: held('pump'), confirmHeld: held('confirm'),
        pressed: new Set(edges), axes: pads.axes || { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 },
        heldDirs: new Set([...dirStack.filter((d) => isKey(d) || pads.dirs.has(d) || touch.dir === d)]),
        device,
      };
      edges.clear();
      return out;
    },
    // タッチ（仮想スティック・ボタン）から
    setTouchDir(d) { device = 'touch'; if (d !== touch.dir) { if (touch.dir && !isKey(touch.dir) && !pads.dirs.has(touch.dir)) popDir(touch.dir); touch.dir = d; if (d) press(d); } },
    setTouchPump(v) { device = 'touch'; if (v && !touch.pump) edges.add('pump'); touch.pump = v; },
    tap(b) { edges.add(b); },
    reset,
    setBlockScroll(v) { blockScroll = v; },
    get device() { return device; },
    get padCount() { return pads.connected; },
    dispose() { for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o); },
  };
}
