// Sky Climber VR — キーボード: 左手 WASD・右手 矢印キー・Esc 一時停止・Enter/Space 決定・Backspace 戻る
export class KeyboardInput {
  constructor() {
    this.down = new Set(); this.edges = new Set();
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code); this.edges.add(e.code);
      if (/^Arrow|^Space$/.test(e.code) && !(e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  dir(up, left, down, right) {
    const x = (this.down.has(right) ? 1 : 0) - (this.down.has(left) ? 1 : 0), y = (this.down.has(up) ? 1 : 0) - (this.down.has(down) ? 1 : 0);
    if (!x && !y) return null; const m = Math.hypot(x, y); return { x: x / m, y: y / m };
  }
  poll() {
    const e = this.edges; this.edges = new Set();
    return {
      L: this.dir('KeyW', 'KeyA', 'KeyS', 'KeyD'), R: this.dir('ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'),
      edge: { pause: e.has('Escape') || e.has('KeyP'), ok: e.has('Enter') || e.has('Space'), back: e.has('Backspace'), debug: e.has('F2') },
      any: this.down.size > 0,
    };
  }
}
