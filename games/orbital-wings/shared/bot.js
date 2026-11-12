// 自動操縦（タイトル画面のデモ・テスト用（狙うべき部位の高さ・奥行きへ寄せて撃ち続ける）。本編では使わない
import { BOSS } from './bosses.js';
export function botInput(g) {
  const p = g.player;
  let tgt = null, best = 1e9;
  if (g.boss && !g.boss.dead) {
    for (const q of g.boss.parts) {
      if (!q.alive || q.armor || q.maxHp <= 0 || q.vis === false) continue;
      if (q.guard && q.guard(g.boss)) continue;
      const d = Math.abs(q.y - p.y) + (q.isOpen && !q.isOpen(g.boss) ? 3 : 0);
      if (d < best) { best = d; tgt = q; }
    }
  }
  if (!tgt) for (const e of g.enemies) { if (e.dead || e.ghost || e.armor) continue; const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y); if (d < best && e.x > p.x) { best = d; tgt = e; } }
  let ty = tgt ? tgt.y : 9; const tz = tgt ? tgt.z : 0;
  // 地形を避ける: 少し先までの床の最高点・天井の最低点の間に収める（箱も見る）
  let lo = 0.6, hi = 17.4;
  for (let dx = -1; dx <= 5; dx += 0.5) {
    const x = p.x + dx;
    lo = Math.max(lo, g.floorAt(x) + 1.0); hi = Math.min(hi, g.ceilAt(x) - 1.0);
    for (const b of g.blocksNear(x)) if (x > b.x0 - 1 && x < b.x1 + 1) { if (p.y > b.y1) lo = Math.max(lo, b.y1 + 1.0); else if (p.y < b.y0) hi = Math.min(hi, b.y0 - 1.0); }
  }
  // 壁のような敵（押しつぶし柱・動く壁・石材）を前に見たら、隙間の側へ
  for (const e of g.enemies) {
    if (e.dead || !(e.solid || e.armor) || e.x < p.x - 1 || e.x > p.x + 6) continue;
    for (const h of g.hitboxes(e)) { if (Math.abs(h[0] - p.x) > 5) continue; if (h[1] > p.y) hi = Math.min(hi, h[1] - h[3] - 0.8); else lo = Math.max(lo, h[1] + h[3] + 0.8); }
  }
  if (lo < hi) ty = Math.max(lo, Math.min(hi, ty)); else ty = (lo + hi) / 2;
  // 近い敵弾から離れる
  for (const b of g.ebullets) { const dx = b.x - p.x, dy = b.y - p.y; if (dx > -0.5 && dx < 3 && Math.abs(dy) < 1.2) ty = p.y + (dy > 0 ? -2 : 2); }
  const tx = g.camX + (g.boss ? 7 : 6);
  const k = (v) => Math.max(-1, Math.min(1, v * 0.8));
  return { mx: k(tx - p.x), my: k(ty - p.y), mz: k(tz - p.z), fire: true };
}
