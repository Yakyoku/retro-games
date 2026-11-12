// ORBITAL WINGS — 調整値（すべて「推奨する初期設定」から始めた値。原作の実測値ではない）
// 変更した値と理由は SPEC.md の「調整ログ」に書く。
export const TICK = 1 / 60;            // 固定ステップ（秒）
export const VIEW_W = 32;              // 盤面の幅（単位 u）。16:9
export const VIEW_H = 18;              // 盤面の高さ
export const DEPTH = 2.6;              // 3D 版の奥行きの片側（z は -DEPTH..+DEPTH）。2D 版は z=0 固定

export const PLAYER = {
  radius: 0.32,                        // 当たり判定（機体の見た目 1.9u×0.7u より小さい）
  baseSpeed: 8.0,                      // u/s（速度段階 1）
  speedStep: 0.25,                     // 1 段階で初期速度の 25% を加える
  maxSpeedLv: 5,                       // 5 段階で 2 倍
  depthSpeedRatio: 0.7,                // 奥行き移動は横の 0.7 倍（見えにくい方向なので遅め）
  respawnInvuln: 120,                  // 復帰後 2 秒無敵（tick）
  deathTicks: 100,                     // 爆発から復帰まで
  enterTicks: 40,                      // 面の開始・復帰で左から滑り込む時間
  lives: 3,
};

export const WEAPON = {
  shotInterval: 6,                     // 押し続けて毎秒 10 発
  shotSpeed: 40,                       // u/s
  shotMaxPerShooter: 4,                // 1 機（自機・各オプション）あたり画面内の通常弾の上限
  doubleAngle: Math.PI / 4,            // DOUBLE の斜め上 45°
  missileInterval: 24,                 // ミサイルの発射間隔（tick）。1 機あたり同時 1 発
  missileSpeed: 10,
  missileDamage: 2,
  laserInterval: 9,
  laserSpeed: 56,
  laserLength: 5.5,
  laserHitInterval: 6,                 // 同じ敵へのダメージ間隔（tick）。描画 FPS と無関係
  laserDamage: 1,
  laserMaxPerShooter: 2,
  shotDamage: 1,
};

export const OPTION = {
  max: 4,
  spacing: 14,                         // 自機の移動履歴で何 tick 分ずつ離れるか（距離ではなく「動いた tick」）
};

export const SHIELD = { durability: 5, radius: 1.15, frontMin: -0.15 };

export const SCORE = { small: 100, turret: 200, medium: 500, boss: 5000, capsule: 50, block: 50, tiny: 10 };

export const DIFFICULTY = {
  easy:   { label: 'EASY',   bulletSpeed: 0.75, fireInterval: 1.25, respawn: 'safe' },
  normal: { label: 'NORMAL', bulletSpeed: 1.0,  fireInterval: 1.0,  respawn: 'checkpoint' },
  arcade: { label: 'ARCADE', bulletSpeed: 1.2,  fireInterval: 0.85, respawn: 'checkpoint' },
};

export const GAUGE = ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', 'SHIELD'];
export const GAUGE_JA = ['スピード', 'ミサイル', 'ダブル', 'レーザー', 'オプション', 'シールド'];

export const SPAWN_GRACE = 36;         // 出現直後は撃たない（不可避な被弾を防ぐ）
export const ENEMY_BULLET_SPEED = 9;   // u/s（Normal）
