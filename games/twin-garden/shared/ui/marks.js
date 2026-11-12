// 宝の 6 つのマーク（星・月・ハート・葉・しずく・鈴）を、[-1,1] の範囲の点列で作る。
// 2D の Canvas・HUD の SVG・3D の押し出し形状で同じ形を使う（y は下向き）。
const TAU = Math.PI * 2;

function star() { const o = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * TAU) / 10, r = i % 2 ? 0.42 : 1; o.push([Math.cos(a) * r, Math.sin(a) * r]); } return o; }
function moon() {
  const o = [];
  for (let i = 0; i <= 28; i++) { const a = 0.55 + (i / 28) * (TAU - 1.1); o.push([Math.cos(a + Math.PI) * 0.95, Math.sin(a + Math.PI) * 0.95]); }
  for (let i = 28; i >= 0; i--) { const a = 0.95 + (i / 28) * (TAU - 1.9); o.push([Math.cos(a + Math.PI) * 0.72 + 0.32, Math.sin(a + Math.PI) * 0.72 - 0.05]); }
  return o.map(([x, y]) => [x * 0.95 - 0.05, y]);
}
function heart() { const o = []; for (let i = 0; i < 48; i++) { const t = (i / 48) * TAU; const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); o.push([x / 17, -y / 17 - 0.1]); } return o; }
function leaf() {
  const o = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, x = -1 + 2 * t, y = -Math.sin(t * Math.PI) * 0.55; o.push([x, y]); }
  for (let i = 19; i > 0; i--) { const t = i / 20, x = -1 + 2 * t, y = Math.sin(t * Math.PI) * 0.55; o.push([x, y]); }
  const c = Math.cos(-0.75), s = Math.sin(-0.75);
  return o.map(([x, y]) => [(x * c - y * s) * 0.95, (x * s + y * c) * 0.95]);
}
function drop() { const o = []; for (let i = 0; i < 40; i++) { const t = (i / 40) * TAU; const x = Math.sin(t) * Math.sin(t / 2) ** 1.2 * 0.78, y = -Math.cos(t); o.push([x, y * 0.98]); } return o; }
function bell() {
  const half = [[0, -1], [0.16, -0.92], [0.42, -0.72], [0.52, -0.3], [0.6, 0.25], [0.88, 0.56], [0.92, 0.7], [0.18, 0.72], [0.12, 0.92], [0, 0.98]];
  return [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
}

export const MARKS = {
  star: { pts: star(), color: '#ffd34d', name: '星' },
  moon: { pts: moon(), color: '#d6e6ff', name: '月' },
  heart: { pts: heart(), color: '#ff6f9a', name: 'ハート' },
  leaf: { pts: leaf(), color: '#86e57a', name: '葉' },
  drop: { pts: drop(), color: '#55d4ff', name: 'しずく' },
  bell: { pts: bell(), color: '#ffab52', name: '鈴' },
};
export const MARK_ORDER = ['star', 'moon', 'heart', 'leaf', 'drop', 'bell'];

export function markSVG(name, size = 22, filled = true) {
  const m = MARKS[name];
  const d = m.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 10 + 12).toFixed(2)} ${(y * 10 + 12).toFixed(2)}`).join('') + 'Z';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${d}" fill="${filled ? m.color : 'none'}" stroke="${filled ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.45)'}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}
