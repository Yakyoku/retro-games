// 難易度の目安: 無敵なしの自動操縦（避ける工夫なし）が各面で何回ミスするか。復帰直後 3 秒以内のミス（理不尽な復帰）も数える
import { Game } from '../shared/game.js';
import { botInput } from '../shared/bot.js';
for (const diff of ['easy', 'normal', 'arcade']) {
  const row = [];
  for (let st = 1; st <= 7; st++) {
    const g = new Game({ stage: st, difficulty: diff, lives: 99, mode: 'practice', seed: 11 });
    let n = 0, quick = 0, lastResp = -999;
    const causes = {};
    while (!g.bossDone && n < 60 * 60 * 8) {
      if (g.power.options < 2 && g.player.alive && g.player.enter === 0) { g.power.speed = 2; g.power.options = 2; g.power.missile = true; g.ensureHistory(); }
      g.tick(botInput(g));
      for (const e of g.drainEvents()) { if (e.t === 'respawn') lastResp = n; if (e.t === 'die') { causes[e.why] = (causes[e.why] || 0) + 1; if (n - lastResp < 180 + 40) quick++; } }
      n++;
    }
    row.push(`${st}:${g.stats.deaths}${quick ? `(即${quick})` : ''}${g.bossDone ? '' : '未'} ${JSON.stringify(causes)}`);
  }
  console.log(diff.padEnd(7), row.join('  '));
}
