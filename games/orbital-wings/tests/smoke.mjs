import { Game } from '../shared/game.js';
import { botInput } from './bot.js';
for (const variant of ['2d','3d']) for (let st=1; st<=7; st++) {
  const g = new Game({ variant, stage: st, invincible: true, difficulty:'normal' });
  g.debugFullPower();
  let ticks=0, maxE=0, maxB=0, bossStart=0;
  while (!g.bossDone && ticks < 60*60*10) { if (g.boss && !bossStart) bossStart=ticks; g.tick(botInput(g)); g.drainEvents(); ticks++; maxE=Math.max(maxE,g.enemies.length); maxB=Math.max(maxB,g.ebullets.length); }
  const left = g.boss && !g.bossDone ? g.boss.parts.filter(q=>q.alive&&q.maxHp>0).map(q=>q.name+':'+q.hp).join(',') : '';
  console.log(variant, st, 'done', g.bossDone, 'road', (bossStart/60).toFixed(0)+'s', 'boss', ((ticks-bossStart)/60).toFixed(0)+'s', 'score', g.score, 'maxE', maxE, 'maxB', maxB, left);
}
