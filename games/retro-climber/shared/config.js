// 鉄骨レスキュー — 調整値の一元管理（推奨初期設定。原作の数値ではない）。
// ここ以外にルールの数値を書かない。変更したら CLAUDE.md の「調整値」に最終値と理由を残す。
export const DT = 1 / 60;           // 論理の固定刻み（秒）。描画は補間する


export const DIFFICULTY = {
  easy:   { id: 'easy',   label: 'やさしい',   lives: 5, time: 240, barrelSpeed: 2.0, barrelInterval: 4.0, ladderChance: 0.22, midCheckpoint: true,  hazardScale: 1.25 },
  normal: { id: 'normal', label: '標準',       lives: 3, time: 180, barrelSpeed: 2.6, barrelInterval: 3.0, ladderChance: 0.32, midCheckpoint: false, hazardScale: 1.0 },
  hard:   { id: 'hard',   label: 'むずかしい', lives: 3, time: 150, barrelSpeed: 3.1, barrelInterval: 2.3, ladderChance: 0.42, midCheckpoint: false, hazardScale: 0.82 },
};
export const DIFF_ORDER = ['easy', 'normal', 'hard'];

const JUMP_APEX = 1.1;   // m
const GRAVITY = 14.0;    // m/s²（頂点 1.1m・滞空 約 0.79 秒・全速で約 2.4m 跳べる）

export const MOVE = {
  walk: 3.0,              // m/s
  airAccel: 14.0,         // 空中で目標速度へ近づく加速度（m/s²）。地上は即応
  climb: 1.4,             // m/s
  gravity: GRAVITY,
  jumpApex: JUMP_APEX,
  // 固定刻みの積分（速度→位置の順）で頂点がちょうど 1.1m になる初速
  jumpV: GRAVITY * DT / 2 + Math.sqrt((GRAVITY * DT / 2) ** 2 + 2 * GRAVITY * JUMP_APEX),
  maxFall: 16,
  coyote: 0.10,           // s
  jumpBuffer: 0.12,       // s
  width: 0.46,            // 当たりの幅（m）
  height: 0.95,           // 当たりの高さ（m）
  ladderSnap: 0.32,       // はしごをつかめる横の距離
  ladderEndSnap: 0.28,    // はしごの上端・下端で乗り降りできる高さの差
  stepUp: 0.14,           // 継ぎ目の段差を歩いて越えられる高さ
};

export const BARREL = { radius: 0.28, ladderSpeed: 1.5, fallVx: 0.9, removeBelow: -2.0 };
export const CRATE = { w: 0.6, h: 0.5 };
export const BOLT = { radius: 0.22, speed: 2.6, hopV: 3.6 };
export const BOT = { w: 0.5, h: 0.6, speed: 1.1 };

export const HAMMER = { duration: 8.0, cooldown: 0.45, swing: 0.22, activeFrom: 0.04, reach: 1.0, height: 1.25 };
export const DEVICE = { reachX: 0.8, reachY: 0.6 };

export const SCORE = { jumpOver: 100, smash: 200, device: 300, clear: 1000, perSecond: 10 };

export const LIFE = { invuln: 2.0, dyingTime: 2.0, safeRadius: 3.2, minRestoreTime: 45 };

export const TIMING = { introTime: 2.2, clearTime: 3.6, rescueTime: 6.0, throwLift: 0.7, throwRelease: 0.18 };

export const SAVE_KEY = 'retro-climber:save';      // ブラウザー保存キー（作品ごとに分ける）
export const SAVE_VERSION = 1;
