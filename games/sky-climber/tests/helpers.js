// テスト用: 登攀ボットは src/core/bot.js（トップページの代表映像と共用）
import { classicBot } from '../src/core/bot.js';
export { classicBot };
export function runBot(game, seconds) {
  const bot = classicBot(game);
  for (let i = 0; i < seconds * 60; i++) {
    game.step({ classic: bot() });
    if (game.state === 'clear' || game.state === 'over') break;
  }
  return game;
}
