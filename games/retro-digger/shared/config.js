// 地底探検：ポンプ・パトロール — 調整値（推奨初期設定）。原作の数値ではなく、今回の調整案。
// 変更したら SPEC.md の「採用値」も更新する。

export const DIFFICULTIES = {
  easy:   { id: 'easy',   label: 'やさしい',   lives: 5, pumpsToPop: 3, warn: 1.0, enemySpeed: 0.85, fireCooldown: 5.0 },
  normal: { id: 'normal', label: 'ふつう',     lives: 3, pumpsToPop: 4, warn: 0.8, enemySpeed: 1.0,  fireCooldown: 4.0 },
  hard:   { id: 'hard',   label: 'むずかしい', lives: 2, pumpsToPop: 5, warn: 0.6, enemySpeed: 1.15, fireCooldown: 3.2 },
};
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard'];

export const RULES = {
  tick: 1 / 60,               // 論理の固定時間刻み
  pumpInterval: 0.30,         // 送気の共通間隔（連打でも長押しでも、この間隔より速くならない）
  deflateDelay: 1.0,          // 最終送気からこの時間で収縮が始まる
  deflateStep: 0.50,          // 収縮は 0.5 秒ごとに 1 段階
  recoverWarnStages: 1,       // 残り 1 段階で「復帰直前」の見た目と音
  respawnGuard: 1.5,          // 復活時の保護
  enemyWakeDelay: 1.5,        // 面開始・復活直後、敵が動き出すまで（出現直後の接触死を防ぐ）
  ghostLandGuard: 0.4,        // 通り抜け状態から実体に戻った直後、接触しても安全な時間
  missDuration: 2.2,          // ミス演出
  clearDuration: 2.6,         // クリア演出
  score: { dig: 10, chaser: 100, fire: 150, rockBase: 300, clear: 1000 },
  extraLifeAt: [20000, 60000],// 残機追加（得点で 1 機ずつ。上限 2 回）
};

// 落石 1 回で n 体を倒したときの合計点（通常の撃破点とは二重に加算しない）
export const rockScore = (n) => (n > 0 ? RULES.score.rockBase * n * n : 0);

// 2D の調整値（単位: セル／秒、セル）
export const TUNE2D = {
  cols: 14, rows: 16, surfaceRows: 1,
  playerSpeed: 4.2,           // セル/秒
  enemySpeed: 2.6,
  ghostSpeed: 1.6,
  pumpRange: 3.0,             // ポンプの射程（セル）
  pumpSpeed: 16,              // 発射の伸びる速さ（セル/秒）
  fireRange: 3.0,
  fireTime: 0.9,              // 炎の継続
  rockFall: 9,                // 落下速度（セル/秒）
  ghostAfterNoPath: 4.0,      // 経路が無い状態が続いたら通り抜けを試す
  ghostEvery: [11, 16],       // 経路があっても時々通り抜け（秒、乱数の範囲）
  ghostMax: 5.0,
};

// 3D の調整値（メートル基準）
export const TUNE3D = {
  cell: 2.4,                  // 1 セル = 2.4m 四方
  height: 2.7,                // 坑道の高さ
  eye: 1.55,                  // デスクトップ・座位の目の高さ
  playerRadius: 0.32,
  moveSpeed: 2.6,             // m/s（スムーズ移動の既定。設定で 0.7〜1.3 倍）
  stepDist: 1.2,              // 快適移動の 1 歩（m）
  stepCooldown: 0.32,
  stepFade: 0.16,
  reach: 2.6,                 // 掘れる距離
  digTime: 0.32,              // 1 セルを掘りきる時間
  pumpRange: 7.5,
  pumpBreak: 9.5,             // 接続中、この距離を超えたら外れる
  enemySpeed: 1.7,            // m/s
  ghostSpeed: 1.05,
  fireRange: 3,               // セル
  fireTime: 1.0,
  rockFall: 9.0,              // m/s（最大）
  enemyRadius: 0.55,
  ghostAfterNoPath: 4.5,
  ghostEvery: [13, 19],
  ghostMax: 6.0,
};
