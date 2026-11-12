// ツイン・ガーデン — 入力（キーボード・ゲームパッド）を共通コマンドへ変換する
// 出力: dir() → { r:{x,y}, b:{x,y} }（盤面の向き。y は下向き＝手前）、menu() → 'up'|'down'|'left'|'right'|'ok'|'back'|'pause' の列
// タッチ（2D）と WebXR コントローラー（VR）は、それぞれのページから extra として足し込む。

export const DEFAULT_KEYS = {
  rUp: 'KeyW', rDown: 'KeyS', rLeft: 'KeyA', rRight: 'KeyD',
  bUp: 'ArrowUp', bDown: 'ArrowDown', bLeft: 'ArrowLeft', bRight: 'ArrowRight',
};
export const KEY_LABELS = {
  rUp: '赤 上', rDown: '赤 下', rLeft: '赤 左', rRight: '赤 右',
  bUp: '青 上', bDown: '青 下', bLeft: '青 左', bRight: '青 右',
};
const DEAD = 0.2;

export function keyName(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Up', '↑').replace('Down', '↓').replace('Left', '←').replace('Right', '→');
}

/** 円形のデッドゾーン（中心付近を 0、外側を 0〜1 に引き伸ばす）と長さ 1 への正規化 */
export function deadzone(x, y, d = DEAD) {
  const l = Math.hypot(x, y);
  if (!(l > d)) return { x: 0, y: 0 };
  const k = Math.min(1, (l - d) / (1 - d)) / l;
  return { x: x * k, y: y * k };
}

export class Input {
  constructor(keys) {
    this.keys = { ...DEFAULT_KEYS, ...(keys || {}) };
    this.down = new Set();
    this.queue = [];
    this.padPrev = new Map();
    this.padRepeat = new Map();
    this.padLabel = 'xbox';
    this.capture = null; // キー変更中: (code) => void
    this.extra = [];     // 追加の方向入力源: () => ({r,b}) | null
    this.enabled = true;
    this._kd = (e) => this.onKey(e, true);
    this._ku = (e) => this.onKey(e, false);
    addEventListener('keydown', this._kd);
    addEventListener('keyup', this._ku);
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    addEventListener('gamepaddisconnected', () => { this.releaseAll(); this.padPrev.clear(); this.pad = null; });
  }

  // 押されているものをすべて離したことにする。ゲームパッドの「直前の状態」は消さない
  // （消すと、押したままのボタンが次のフレームでもう一度「押された」ことになり、一時停止がすぐ解除される）
  releaseAll() { this.down.clear(); this.padRepeat.clear(); }

  onKey(e, isDown) {
    if (this.capture && isDown) {
      e.preventDefault();
      const f = this.capture; this.capture = null;
      f(e.code === 'Escape' ? null : e.code);
      return;
    }
    const code = e.code;
    const bound = Object.values(this.keys).includes(code);
    if (bound || ['Enter', 'Space', 'Escape', 'KeyP', 'Tab'].includes(code)) {
      if (!(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) e.preventDefault();
    }
    if (isDown) {
      if (!e.repeat || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        if (code === 'Enter' || code === 'Space') this.queue.push('ok');
        else if (code === 'Escape' || code === 'Backspace') this.queue.push('back');
        else if (code === 'KeyP') this.queue.push('pause');
        else if (code === 'ArrowUp' || code === this.keys.rUp) this.queue.push('up');
        else if (code === 'ArrowDown' || code === this.keys.rDown) this.queue.push('down');
        else if (code === 'ArrowLeft' || code === this.keys.rLeft) this.queue.push('left');
        else if (code === 'ArrowRight' || code === this.keys.rRight) this.queue.push('right');
      }
      this.down.add(code);
    } else this.down.delete(code);
  }

  /** 1 回の描画ごとに呼ぶ。ゲームパッドの状態を読み、メニュー用のコマンドを積む */
  poll(now = performance.now()) {
    this.pad = { r: { x: 0, y: 0 }, b: { x: 0, y: 0 }, any: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      if (/054c|playstation|dualsense|dualshock/i.test(gp.id)) this.padLabel = 'ps';
      else if (/057e|nintendo|pro controller/i.test(gp.id)) this.padLabel = 'nintendo';
      else this.padLabel = 'xbox';
      const ax = gp.axes || [];
      const l = deadzone(ax[0] || 0, ax[1] || 0), r = deadzone(ax[2] || 0, ax[3] || 0);
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      // 十字キーは赤の補助（スティックの無いパッド用）
      const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      this.pad.r.x += l.x + dx; this.pad.r.y += l.y + dy;
      this.pad.b.x += r.x; this.pad.b.y += r.y;
      // メニュー: 押した瞬間だけ。上下左右は押し続けで繰り返し
      const prev = this.padPrev.get(gp.index) || {};
      const cur = { ok: b(0), back: b(1), pause: b(9), up: b(12) || l.y < -0.6, down: b(13) || l.y > 0.6, left: b(14) || l.x < -0.6, right: b(15) || l.x > 0.6 };
      for (const k of Object.keys(cur)) {
        if (cur[k] && !prev[k]) { this.queue.push(k); this.padRepeat.set(gp.index + k, now + 380); }
        else if (cur[k] && ['up', 'down', 'left', 'right'].includes(k) && now > (this.padRepeat.get(gp.index + k) || Infinity)) { this.queue.push(k); this.padRepeat.set(gp.index + k, now + 110); }
      }
      if (Object.values(cur).some(Boolean) || l.x || l.y || r.x || r.y) this.pad.any = true;
      this.padPrev.set(gp.index, cur);
    }
  }

  takeMenu() { const q = this.queue; this.queue = []; return q; }

  dir() {
    const k = this.keys, d = this.down;
    const v = (u, dn, lf, rt) => ({ x: (d.has(rt) ? 1 : 0) - (d.has(lf) ? 1 : 0), y: (d.has(dn) ? 1 : 0) - (d.has(u) ? 1 : 0) });
    const out = { r: v(k.rUp, k.rDown, k.rLeft, k.rRight), b: v(k.bUp, k.bDown, k.bLeft, k.bRight) };
    if (this.pad) { out.r.x += this.pad.r.x; out.r.y += this.pad.r.y; out.b.x += this.pad.b.x; out.b.y += this.pad.b.y; }
    for (const f of this.extra) {
      const e = f();
      if (!e) continue;
      if (e.r) { out.r.x += e.r.x; out.r.y += e.r.y; }
      if (e.b) { out.b.x += e.b.x; out.b.y += e.b.y; }
    }
    for (const s of [out.r, out.b]) { const l = Math.hypot(s.x, s.y); if (l > 1) { s.x /= l; s.y /= l; } }
    if (!this.enabled) return { r: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
    return out;
  }

  /** 画面に出すボタン名（実際のパッドに合わせる） */
  padNames() {
    if (this.padLabel === 'ps') return { ok: '×', back: '○', pause: 'OPTIONS' };
    if (this.padLabel === 'nintendo') return { ok: 'B', back: 'A', pause: '＋' };
    return { ok: 'A', back: 'B', pause: 'START' };
  }
}
