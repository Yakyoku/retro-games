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
  const ty = tgt ? tgt.y : 9, tz = tgt ? tgt.z : 0;
  const tx = g.camX + (g.boss ? 7 : 6);
  const k = (v) => Math.max(-1, Math.min(1, v * 0.8));
  return { mx: k(tx - p.x), my: k(ty - p.y), mz: k(tz - p.z), fire: true };
}
