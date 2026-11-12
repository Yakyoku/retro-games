// 月影の魔城 — 効果音（すべてこの作品のために新しく作った音。録音や既存作品の音は使っていない）
// fm:  [tick(1/120 秒), 'on', MIDI, 音色番号, 音量, 音程の滑り(半音/秒)] / [tick, 'off'] / [tick, 'slide', 半音/秒]
// psg: [tick, 'on', MIDI, 矩形波音色, 音量, 滑り] / [tick, 'off']
// pcm: [tick, 'pcm', サンプル名, 音程(半音), 音量]
// prio: 高いほど優先（同じ枠が埋まっているとき、低い音を止めて鳴らす）
import { P } from './patches.js';
const fm = (prio, steps, len) => ({ ch: 'fm', prio, steps, len });
const sq = (prio, steps, len) => ({ ch: 'psg', prio, steps, len });
const pcm = (prio, steps, len) => ({ ch: 'pcm', prio, steps, len });

export const SFX = {
  // 武器
  throwLance: fm(2, [[0, 'on', 70, P.SFX_THROW, 0.42, -50], [7, 'off']], 14),
  throwDagger: fm(2, [[0, 'on', 82, P.SFX_THROW, 0.36, -70], [5, 'off']], 10),
  throwAxe: fm(2, [[0, 'on', 64, P.SFX_THROW, 0.4, 30], [5, 'on', 68, P.SFX_THROW, 0.34, -30], [12, 'off']], 18),
  throwTorch: fm(2, [[0, 'on', 52, P.SFX_THROW, 0.45, 20], [10, 'off']], 18),
  burn: pcm(1, [[0, 'pcm', 'noise', 4, 0.45]], 30),
  clink: fm(1, [[0, 'on', 96, P.SFX_CLANG, 0.25, 0], [3, 'off']], 8),
  // 命中・撃破
  hit: fm(3, [[0, 'on', 84, P.SFX_CLANG, 0.38, -40], [4, 'off']], 10),
  kill: pcm(4, [[0, 'pcm', 'crunch', 0, 0.75]], 30),
  killSq: sq(3, [[0, 'on', 76, 1, 0.5, -60], [16, 'off']], 24),
  bossHit: fm(3, [[0, 'on', 72, P.SFX_CLANG, 0.44, -30], [5, 'off']], 12),
  bossWeak: fm(4, [[0, 'on', 79, P.SFX_CLANG, 0.5, -20], [3, 'on', 86, P.SFX_CLANG, 0.42, -20], [8, 'off']], 16),
  bossBoom: pcm(9, [[0, 'pcm', 'boom', 0, 1.0], [40, 'pcm', 'boom', -3, 0.9], [90, 'pcm', 'rumble', 0, 0.9]], 220),
  // プレイヤー
  armorBreak: fm(8, [[0, 'on', 88, P.SFX_CLANG, 0.6, -24], [3, 'on', 76, P.SFX_CLANG, 0.6, -36], [9, 'on', 64, P.SFX_CLANG, 0.5, -40], [22, 'off']], 40),
  armorCrunch: pcm(8, [[0, 'pcm', 'crunch', 3, 0.8]], 30),
  hurtSq: sq(7, [[0, 'on', 88, 1, 0.6, -90], [14, 'off']], 20),
  land: pcm(0, [[0, 'pcm', 'tom', 10, 0.18]], 6),
  pitFall: sq(6, [[0, 'on', 84, 0, 0.5, -40], [60, 'off']], 70),
  // アイテム
  weaponGet: fm(6, [[0, 'on', 72, P.SFX_CHIME, 0.5, 0], [8, 'on', 79, P.SFX_CHIME, 0.5, 0], [16, 'on', 84, P.SFX_CHIME, 0.5, 0], [30, 'off']], 50),
  treasure: fm(5, [[0, 'on', 84, P.SFX_CHIME, 0.48, 0], [8, 'on', 91, P.SFX_CHIME, 0.45, 0], [22, 'off']], 40),
  armorGet: fm(6, [[0, 'on', 67, P.SFX_CHIME, 0.5, 0], [6, 'on', 72, P.SFX_CHIME, 0.5, 0], [12, 'on', 76, P.SFX_CHIME, 0.5, 0], [18, 'on', 79, P.SFX_CHIME, 0.5, 0], [36, 'off']], 60),
  checkpoint: sq(2, [[0, 'on', 79, 3, 0.35, 0], [6, 'on', 84, 3, 0.35, 0], [16, 'off']], 24),
  // 敵
  emerge: pcm(1, [[0, 'pcm', 'rumble', 6, 0.45]], 40),
  impDive: sq(3, [[0, 'on', 96, 4, 0.4, -50], [26, 'off']], 32),
  growl: fm(4, [[0, 'on', 40, P.SFX_ROAR, 0.55, -6], [40, 'off']], 60),
  growlDeep: fm(4, [[0, 'on', 33, P.SFX_ROAR, 0.6, -4], [50, 'off']], 70),
  appear: fm(3, [[0, 'on', 60, P.SFX_ZAP, 0.35, 60], [18, 'off']], 26),
  bone: sq(2, [[0, 'on', 81, 1, 0.38, 20], [8, 'off']], 12),
  orb: fm(3, [[0, 'on', 76, P.SFX_ZAP, 0.38, -40], [14, 'off']], 22),
  fireball: pcm(3, [[0, 'pcm', 'noise', 0, 0.55]], 20),
  water: pcm(3, [[0, 'pcm', 'swell', 6, 0.55]], 30),
  splash: pcm(2, [[0, 'pcm', 'noise', 7, 0.5]], 24),
  feather: fm(3, [[0, 'on', 90, P.SFX_THROW, 0.32, -40], [6, 'off']], 12),
  thud: fm(5, [[0, 'on', 36, P.SFX_THUD, 0.75, -10], [16, 'off']], 30),
  thudSoft: fm(1, [[0, 'on', 43, P.SFX_THUD, 0.4, -10], [8, 'off']], 16),
  jet: pcm(2, [[0, 'pcm', 'noise', -3, 0.5]], 40),
  // ボス
  warn: sq(6, [[0, 'on', 93, 2, 0.4, 0], [5, 'off'], [9, 'on', 93, 2, 0.4, 0], [14, 'off']], 20),
  roar: fm(7, [[0, 'on', 36, P.SFX_ROAR, 0.75, -3], [70, 'off']], 90),
  slash: fm(5, [[0, 'on', 60, P.SFX_THROW, 0.55, -60], [10, 'off']], 16),
  zapBig: fm(6, [[0, 'on', 55, P.SFX_ZAP, 0.5, 30], [30, 'off']], 40),
  gate: pcm(7, [[0, 'pcm', 'rumble', 0, 0.85]], 120),
  // 進行・画面
  tally: sq(2, [[0, 'on', 96, 3, 0.25, 0], [2, 'off']], 4),
  uiMove: sq(1, [[0, 'on', 84, 1, 0.3, 0], [3, 'off']], 6),
  uiSelect: fm(2, [[0, 'on', 79, P.SFX_CHIME, 0.4, 0], [5, 'on', 86, P.SFX_CHIME, 0.36, 0], [12, 'off']], 20),
  uiBack: sq(1, [[0, 'on', 72, 1, 0.3, 0], [4, 'on', 67, 1, 0.3, 0], [8, 'off']], 12),
  pause: sq(3, [[0, 'on', 88, 3, 0.35, 0], [6, 'on', 76, 3, 0.35, 0], [14, 'off']], 20),
};

// ゲームの出来事 → 音。throttle: 同じ音を続けて鳴らさない最短間隔（ms）。
// origin: 'arcade' = 当時のアクションゲームでも鳴るのが普通の出来事 / 'added' = 本作で追加した出来事の音（AUDIO_REFERENCE.md に記録）
export const AUDIO_EVENTS = {
  fire: { by: (e) => ({ lance: 'throwLance', dagger: 'throwDagger', axe: 'throwAxe', torch: 'throwTorch' })[e.weapon], throttle: 40, origin: 'arcade' },
  burn: { sfx: ['burn'], throttle: 120, origin: 'arcade' },
  clink: { sfx: ['clink'], throttle: 60, origin: 'arcade' },
  enemyHit: { sfx: ['hit'], throttle: 50, origin: 'arcade' },
  enemyDie: { sfx: ['kill', 'killSq'], throttle: 40, origin: 'arcade' },
  bossHit: { by: (e) => (e.weak ? 'bossWeak' : 'bossHit'), throttle: 60, origin: 'arcade' },
  bossDie: { sfx: ['bossBoom'], origin: 'arcade' },
  armorBreak: { sfx: ['armorBreak', 'armorCrunch', 'hurtSq'], origin: 'arcade' },
  death: { by: (e) => (e.cause === 'pit' || e.cause === 'lava' || e.cause === 'water' ? 'pitFall' : null), origin: 'arcade' },
  weaponGet: { sfx: ['weaponGet'], origin: 'arcade' },
  treasure: { sfx: ['treasure'], origin: 'arcade' },
  armorGet: { sfx: ['armorGet'], origin: 'arcade' },
  checkpoint: { sfx: ['checkpoint'], origin: 'added' },
  ghoulEmerge: { sfx: ['emerge'], throttle: 200, origin: 'arcade' },
  impDive: { sfx: ['impDive'], throttle: 150, origin: 'added' },
  growl: { by: (e) => (e.deep ? 'growlDeep' : 'growl'), throttle: 300, origin: 'added' },
  casterAppear: { sfx: ['appear'], throttle: 150, origin: 'arcade' },
  eShot: { by: (e) => ({ bone: 'bone', orb: 'orb', fan: 'orb', ring: 'zapBig', fireball: 'fireball', flame: 'fireball', water: 'water', feather: 'feather', pillar: 'zapBig', beam: 'zapBig' })[e.kind], throttle: 70, origin: 'arcade' },
  splash: { sfx: ['splash'], throttle: 120, origin: 'added' },
  thud: { by: (e) => (e.soft ? 'thudSoft' : 'thud'), throttle: 80, origin: 'arcade' },
  jet: { sfx: ['jet'], throttle: 300, origin: 'added' },
  bossWarn: { sfx: ['warn'], throttle: 150, origin: 'added' },
  bossRoar: { sfx: ['roar'], throttle: 300, origin: 'arcade' },
  slash: { sfx: ['slash'], origin: 'arcade' },
  summon: { sfx: ['zapBig'], origin: 'arcade' },
  bossIntro: { sfx: ['gate'], origin: 'arcade' },
  tally: { sfx: ['tally'], throttle: 50, origin: 'arcade' },
  land: { sfx: [], origin: 'none' }, // 着地音は鳴らさない（当時の雰囲気を変えないため。音は用意してある）
};
// 曲の切り替え（出来事 → 曲）
export function songFor(evt, stageIndex) {
  switch (evt.type) {
    case 'go': return 'stage' + (stageIndex + 1);
    case 'bossFight': return stageIndex === 5 ? 'lastboss' : 'boss';
    case 'bossIntro': return null; // 門が閉じる音のあいだは無音
    case 'death': return 'death';
    case 'gameOver': return 'gameover';
    case 'stageClear': return 'clear';
    case 'ending': return 'ending';
    default: return undefined;
  }
}
