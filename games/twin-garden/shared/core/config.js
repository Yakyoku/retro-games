// ツイン・ガーデン — 調整値（推奨する初期設定。原作の再現値ではない）
// 変更したら GAME_DESIGN.md の「最終値と変更理由」に記録すること。

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const BOARD = { w: 24, h: 18 };
BOARD.area = BOARD.w * BOARD.h;               // 432
BOARD.diag = Math.hypot(BOARD.w, BOARD.h);    // 30

export const C = {
  playerSpeed: 5.0,          // 単位/秒
  playerRadius: 0.25,
  enemyRadius: 0.36,
  mushRadius: 0.3,
  patrolSpeed: 2.0,
  chaserSpeed: 2.6,
  chaserRetargetTicks: 30,   // 0.5 秒
  chaserTurnRate: 2.4,       // rad/秒
  enemyMinStartDist: 3.0,

  energyStart: 100, energyMax: 150, energyDrain: 1.5,
  plantSproutSec: 10, plantMatureSec: 20,
  plantHealSprout: 15, plantHealMature: 25,
  powerSec: 8, powerEndEnergy: 100,

  invulnSec: 2,
  introSec: 1.2, missSec: 1.6, clearSec: 2.0, bonusIntroSec: 2.2, bonusEndSec: 2.6,

  pts: { mush: 100, patrol: 200, chaser: 300, plant: 10, chest: 500, gem: 100 },
  multStep: 0.25, multMax: 2.0,

  // 囲み判定の許容誤差（盤面に対する相対値）
  minLoopArea: 0.001 * BOARD.area,     // 0.432 単位²未満の囲みは不成立
  boundaryTol: 0.0017 * BOARD.diag,    // 0.05 単位以内の境界上は「内側」
  touchTol: 0.004 * BOARD.diag,        // 0.12 単位以内に端が既存ラインへ触れたら閉じる
  endMeetDist: 0.5,                    // 赤と青の端がこの距離まで近づいたら両端が出会った
  edgeTol: 0.3,                        // 外周の辺からこの距離以内で「辺に到達」

  treasureMaxArea: 0.08 * BOARD.area,  // 34.56 単位² 以下の囲みで宝箱を発見
  gemCount: 6, gemSpeed: 2.0,
  gemMarks: ['star', 'moon', 'heart', 'leaf', 'drop', 'bell'],

  mushWanderSpeed: 0.35, mushWanderRadius: 0.6,

  bonusSec: 20,
};

export const DIFFICULTY = {
  practice: { id: 'practice', label: '練習', ruby: 'れんしゅう', enemyMul: 1.0, drainMul: 0, lives: Infinity, enemies: false, record: 'practice' },
  easy:     { id: 'easy', label: 'やさしい', ruby: '', enemyMul: 0.7, drainMul: 0.7, lives: 5, enemies: true, record: 'easy' },
  normal:   { id: 'normal', label: '標準', ruby: 'ひょうじゅん', enemyMul: 1.0, drainMul: 1.0, lives: 3, enemies: true, record: 'normal' },
  hard:     { id: 'hard', label: '難しい', ruby: 'むずかしい', enemyMul: 1.25, drainMul: 1.25, lives: 3, enemies: true, record: 'hard' },
};

/** 同じ囲みで捕まえた回収対象と敵の合計 n に対する倍率 */
export function multiplier(n) { return n <= 1 ? 1 : Math.min(C.multMax, 1 + C.multStep * (n - 1)); }
