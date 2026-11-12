// 3D のマップ（簡潔な見取り図）。方角（北が上）・自分の位置と向き・近くの敵・岩の状態を示す。
// DOM のキャンバスにも、VR のパネル（キャンバスのテクスチャ）にも同じ絵を描く。
import { THEMES } from './stages.js';
import { TUNE3D as T } from './config.js';

export function drawMinimap(ctx, g, x0, y0, size, { full = false, yaw = 0, t = 0 } = {}) {
  const m = g.map; const th = THEMES[m.theme];
  const cs = size / Math.max(m.w, m.h);
  const ox = x0 + (size - m.w * cs) / 2, oy = y0 + (size - m.h * cs) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(10,6,4,0.85)'; rr(ctx, x0 - 8, y0 - 8, size + 16, size + 16, 14); ctx.fill();
  for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
    const i = z * m.w + x;
    ctx.fillStyle = m.solid[i] ? (m.support[i] ? '#a0703a' : th.bands[1]) : '#1a120c';
    ctx.fillRect(ox + x * cs, oy + z * cs, cs + 0.5, cs + 0.5);
  }
  const C = T.cell; const P = g.player;
  const near = (e) => full || Math.hypot(e.x - P.x, e.z - P.z) < C * 5;
  // 岩（落ちそうな岩は赤く点滅）
  for (const r of g.rocks) {
    if (r.state === 'gone') continue;
    const hot = r.state === 'loose' || r.state === 'fall';
    ctx.fillStyle = hot ? (Math.floor(t * 8) % 2 ? '#ff4a2a' : '#ffd35a') : '#c9c0b0';
    ctx.beginPath(); ctx.arc(ox + r.x / C * cs, oy + r.z / C * cs, cs * 0.32, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1a1020'; ctx.lineWidth = Math.max(1, cs * 0.06); ctx.stroke();
  }
  // 敵（近くだけ。全体表示ではすべて）
  for (const e of g.enemies) {
    if (!e.alive || !near(e)) continue;
    const ghost = e.state === 'ghost' || e.state === 'ghostWarn';
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.fillStyle = e.type === 'chaser' ? '#5fe0b5' : '#ff7a3a';
    ctx.beginPath(); ctx.arc(ox + e.x / C * cs, oy + e.z / C * cs, cs * (e.inf.stage ? 0.4 : 0.3), 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 炎
  for (const f of g.fires) {
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = cs * 0.35; ctx.lineCap = 'round';
    const sx = ox + (f.gx + 0.5) * cs, sy = oy + (f.gz + 0.5) * cs;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + f.dir[0] * f.reach * cs, sy + f.dir[1] * f.reach * cs); ctx.stroke();
  }
  // 自分（向きの三角）
  const px = ox + P.x / C * cs, py = oy + P.z / C * cs;
  ctx.save(); ctx.translate(px, py); ctx.rotate(-yaw);
  ctx.fillStyle = '#ffc93c'; ctx.strokeStyle = '#1a1020'; ctx.lineWidth = Math.max(1, cs * 0.08);
  ctx.beginPath(); ctx.moveTo(0, -cs * 0.55); ctx.lineTo(cs * 0.38, cs * 0.35); ctx.lineTo(-cs * 0.38, cs * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 方角
  ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(Math.max(12, size * 0.07))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('北', x0 + size / 2, y0 - 4 + 0);
  ctx.restore();
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
