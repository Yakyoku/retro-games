// 数値はすべて「推奨初期設定／仮定」からの制作値。調整履歴は SPEC.md §4 に残す。単位はメートル・秒。
export const FLOOR_H = 3.0;        // 1 階の高さ
export const W = 24;               // ビル内部の幅（x: 0..W）
export const CAR_W = 1.8;          // かご（＝昇降路の開口）の幅
export const CAR_SPEED = 2.6;      // かごの速さ（m/s）。1 階ぶん約 1.15 秒
export const AUTO_WAIT = 1.8;      // 自動運転のかごが各階で止まる時間
export const AUTO_WARN = 0.7;      // 自動運転のかごが動き出す前の予告（チャイム）
export const ESC_SPEED = 3.0;      // エスカレーターの速さ（斜面に沿って m/s）

export const P = {
  w: 0.5, h: 1.75, hCrouch: 1.05,
  gunStand: 1.30, gunCrouch: 0.72,
  walk: 3.2, jumpV: 5.4, g: 16,
  fireInterval: 0.25, bulletSpeed: 16, maxBullets: 3,
  fallSafe: 3.6,                    // これ以上落ちたらミス（1 階ぶん＝3m の落下は無事）
  invuln: 2.0, deadTime: 1.7,
  kickReach: 0.55,
};
export const E = { w: 0.5, h: 1.75, hCrouch: 1.05, gunStand: 1.35, gunLow: 0.42 };

// 難易度。windup＝発見後の構え（予備動作）。難しいでも 0.6 秒の予兆を残す
export const DIFF = {
  easy:   { label: 'やさしい', lives: 5, windup: 1.25, bullet: 5.0, fireCd: 2.4, spawnTele: 0.9, spawnEvery: 8.0, maxEnemies: 4, detect: 10, walk: 1.35, dodge: 0.15 },
  normal: { label: 'ふつう',   lives: 3, windup: 0.80, bullet: 6.5, fireCd: 1.6, spawnTele: 0.6, spawnEvery: 5.5, maxEnemies: 6, detect: 11, walk: 1.6,  dodge: 0.30 },
  hard:   { label: 'むずかしい', lives: 3, windup: 0.60, bullet: 8.0, fireCd: 1.15, spawnTele: 0.6, spawnEvery: 3.8, maxEnemies: 6, detect: 12, walk: 1.9,  dodge: 0.45 },
};
export const DOOR_COOLDOWN = 12;   // 同じ通常ドアから次に出てくるまで最低 12 秒
export const SPAWN_MIN_DIST = 4;   // プレイヤーから 4m 以内のドアからは出さない
export const DARK_DETECT = 0.55;   // 暗がりでは発見距離が 55% に
export const DARK_WINDUP = 0.3;    // 暗がりでは構えが 0.3 秒長い
export const LIGHT_RADIUS = 4.2;

export const SCORE = { shot: 100, kick: 200, env: 300, doc: 500, clear: 1000 };
// 同一撃破は優先順位の最も高い 1 種類だけ加点: env > kick > shot
export const CAUSE_RANK = { shot: 1, kick: 2, env: 3 };

export const level = (floor) => (floor - 1) * FLOOR_H;               // 階 → 床の高さ
export const floorOf = (y) => Math.round(y / FLOOR_H) + 1;           // 高さ → 階（床の上に立っているとき）
