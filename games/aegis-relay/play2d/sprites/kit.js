// AEGIS RELAY 2D — 絵を描く道具。光は全キャラクター共通で「左上からの主光＋右下からの青い縁光」
// plate() = 装甲板 1 枚: 面のグラデーション → 辺ごとの明暗（左上の辺は明るく、右下の辺は暗く＋青い縁光）→ 光沢の帯 → 輪郭
export const TAU = Math.PI * 2;
const LX = -0.63, LY = -0.78; // 光の来る向き（2D）
export const OUT = 'rgba(6,9,18,.92)';

export function path(c, pts, close = true) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); if (close) c.closePath(); }
// 左右対称の形: s=-1 で x を反転（頂点の順も逆にして、面の向きをそろえる）
export function mir(pts, s) { if (s > 0) return pts; const o = []; for (let i = pts.length - 2; i >= 0; i -= 2) o.push(-pts[i], pts[i + 1]); return o; }
export function circlePts(cx, cy, rx, ry = rx, n = 28, a0 = 0, a1 = TAU) { const o = []; const full = Math.abs(a1 - a0 - TAU) < 1e-6; for (let i = 0; i < (full ? n : n + 1); i++) { const a = a0 + ((a1 - a0) * i) / n; o.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); } return o; }
export function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i++) g.addColorStop(typeof stops[i] === 'string' ? i / (stops.length - 1) : stops[i][0], typeof stops[i] === 'string' ? stops[i] : stops[i][1]); return g; }
export function rad(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (let i = 0; i < stops.length; i++) g.addColorStop(typeof stops[i] === 'string' ? i / (stops.length - 1) : stops[i][0], typeof stops[i] === 'string' ? stops[i] : stops[i][1]); return g; }

// 装甲板。pal = [明, 中, 暗]。o: bev（面取りの幅）, rim（縁光の色 / false）, out（輪郭の太さ）, spec（光沢の帯 0..1 の位置）, flat
export function plate(c, pts, pal, o = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, area = 0; const n = pts.length;
  for (let i = 0; i < n; i += 2) { const x = pts[i], y = pts[i + 1], xn = pts[(i + 2) % n], yn = pts[(i + 3) % n]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; area += x * yn - xn * y; }
  const sg = area > 0 ? 1 : -1, bev = o.bev ?? 0.5;
  path(c, pts); c.fillStyle = lin(c, x0, y0, x0 + (x1 - x0) * 0.8, y1, [[0, pal[0]], [0.42, pal[1]], [1, pal[2]]]); c.fill();
  c.save(); c.clip();
  if (o.spec != null) { // 鋭い光沢の帯（斜め）
    const d = Math.max(x1 - x0, y1 - y0), t = o.spec, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, w = d * (o.specW ?? 0.16);
    c.fillStyle = lin(c, cx - w, cy - w * 0.8, cx + w, cy + w * 0.8, [[0, 'rgba(255,255,255,0)'], [0.45, `rgba(255,255,255,${o.specA ?? 0.5})`], [0.55, `rgba(255,255,255,${(o.specA ?? 0.5) * 0.9})`], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  if (bev > 0) {
    c.lineCap = 'butt';
    for (let i = 0; i < n; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[(i + 2) % n], by = pts[(i + 3) % n], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      const k = ((dy / l) * LX + (-dx / l) * LY) * sg; // 辺の外向きの法線と光の向き
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by);
      if (k > 0.12) { c.strokeStyle = `rgba(255,255,255,${0.12 + 0.5 * k})`; c.lineWidth = bev * 2; c.stroke(); }
      else if (k < -0.12) {
        c.strokeStyle = `rgba(0,4,16,${0.18 - 0.38 * k})`; c.lineWidth = bev * 2.6; c.stroke();
        if (o.rim !== false) { c.strokeStyle = o.rim || `rgba(80,160,255,${-0.62 * k})`; c.lineWidth = bev * 0.9; c.stroke(); }
      }
    }
    c.lineCap = 'round';
  }
  c.restore();
  if (o.out !== 0) { path(c, pts); c.lineWidth = o.out ?? 0.42; c.strokeStyle = OUT; c.stroke(); }
}
// パネルライン（暗い溝＋その右下の明るい返し）
export function seam(c, pts, w = 0.2, a = 0.6) {
  path(c, pts, false); c.lineWidth = w; c.strokeStyle = `rgba(0,6,18,${a})`; c.stroke();
  c.save(); c.translate(w * 0.8, w * 0.8); path(c, pts, false); c.strokeStyle = `rgba(255,255,255,${a * 0.4})`; c.lineWidth = w * 0.7; c.stroke(); c.restore();
}
// 小さな灯（芯は白、まわりに色）
export function lamp(c, x, y, r, col) {
  c.fillStyle = rad(c, x, y, 0, r * 2.6, [[0, col], [0.4, col.replace(/[\d.]+\)$/, '0.35)')], [1, col.replace(/[\d.]+\)$/, '0)')]]); c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill();
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(x - r * 0.2, y - r * 0.2, r * 0.45, 0, TAU); c.fill();
}
// ガラス（キャノピー・目）: 奥行きのある濃い色 → 明るい色、内側の暗い縁、左上の反射
export function glass(c, cx, cy, rx, ry, cols = ['#041c36', '#0e5a9a', '#38c8ff', '#d8fbff'], rot = 0) {
  c.save(); c.translate(cx, cy); if (rot) c.rotate(rot);
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fillStyle = lin(c, -rx, -ry, rx * 0.6, ry, [[0, cols[2]], [0.45, cols[1]], [1, cols[0]]]); c.fill();
  c.save(); c.clip();
  c.beginPath(); c.ellipse(rx * 0.25, ry * 0.3, rx * 0.8, ry * 0.75, 0, 0, TAU); c.fillStyle = 'rgba(0,8,24,.45)'; c.fill();          // 内部の奥行き
  c.beginPath(); c.ellipse(-rx * 0.38, -ry * 0.42, rx * 0.28, ry * 0.4, 0.5, 0, TAU); c.fillStyle = cols[3]; c.globalAlpha = 0.85; c.fill(); // 反射
  c.globalAlpha = 0.5; c.beginPath(); c.ellipse(rx * 0.3, ry * 0.55, rx * 0.5, ry * 0.16, -0.4, 0, TAU); c.fillStyle = cols[2]; c.fill();
  c.restore(); c.globalAlpha = 1;
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.lineWidth = Math.min(rx, ry) * 0.22; c.strokeStyle = OUT; c.stroke();
  c.restore();
}
// 噴射口（暗い筒＋明るい縁）
export function nozzle(c, x, y, w, h) {
  c.fillStyle = lin(c, x - w, y, x + w, y, ['#cfd6e4', '#5a6478', '#1a1f2a']); c.beginPath(); c.roundRect(x - w, y, w * 2, h, w * 0.3); c.fill();
  c.lineWidth = 0.3; c.strokeStyle = OUT; c.stroke();
  c.fillStyle = '#0a0d14'; c.fillRect(x - w * 0.6, y + h * 0.55, w * 1.2, h * 0.45);
}
// 金属の色見本
export const PAL = {
  steel: ['#f6f9ff', '#b4c2da', '#4c5a76'], steelDk: ['#aab6cc', '#66738c', '#2a3244'], gun: ['#8c96a8', '#454d5e', '#14181f'],
  gold: ['#fff6cf', '#f0bc4a', '#7a4f10'], goldDk: ['#e0b050', '#946820', '#3a2606'],
};
