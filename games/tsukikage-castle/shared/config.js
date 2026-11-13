// 月影の魔城 — 調整値（すべてここに集める。原作の解析値ではなく、依頼書の「推奨初期値」を出発点にした調整値）
// 単位: 長さ = 論理タイル（1 u）、時間 = 秒。ロジックは 60Hz 固定。
export const TICK = 1 / 60;

export const PLAYER = {
  w: 0.62, hStand: 1.62, hCrouch: 1.0,       // 当たり判定（足元中央が基準）
  speed: 4.0, jumpV: 9.0, gravity: 24.0, maxFall: 16,
  ladderSpeed: 2.5,
  knockVX: 3.2, knockVY: 6.0,                // 被弾ノックバック
  hurtInvuln: 1.2, respawnInvuln: 2.0, deathTime: 1.0,
  landLag: 0.06,                             // 着地の小さな沈み（見た目のみ。操作は止めない）
  turnTime: 0.08,                            // 旋回の見た目
  airControl: { hard: 0.0, easy: 0.35 },     // 空中で速度を変えられる割合（高難度は踏み切りの方向・速度で固定）
  bufferTime: { hard: 0, easy: 0.08 },       // 入力の先行受付（易しいのみ）
  coyoteTime: { hard: 0, easy: 0.08 },       // 足場を離れた後のジャンプ猶予（易しいのみ）
};

export const DIFFICULTY = {
  hard: { id: 'hard', label: '高難度', lives: 3, time: 180, extraCheckpoints: false, enemyRank: 1.0 },
  easy: { id: 'easy', label: '易しい', lives: 5, time: 300, extraCheckpoints: true, enemyRank: 0.8 },
};

// 武器: speed u/s, range u, interval 秒, max 同時数, dmg, 軌道
export const WEAPONS = {
  lance:  { id: 'lance',  name: '槍',   speed: 14, range: 13, interval: 0.30, max: 3, dmg: 2,   path: 'line', w: 1.1, h: 0.22 },
  dagger: { id: 'dagger', name: '短剣', speed: 21, range: 11, interval: 0.20, max: 3, dmg: 1.4, path: 'line', w: 0.7, h: 0.2 },
  axe:    { id: 'axe',    name: '斧',   speed: 7.5, vy: 10, gravity: 26, range: 30, interval: 0.40, max: 2, dmg: 3, path: 'arc', w: 0.7, h: 0.7, pierce: true },
  torch:  { id: 'torch',  name: '火炎', speed: 7, vy: 5.5, gravity: 26, range: 30, interval: 0.50, max: 2, dmg: 1.5, path: 'lob', w: 0.5, h: 0.5,
            burnTime: 1.4, burnW: 1.6, burnH: 1.1, burnDmg: 1, burnTick: 0.25 },
};
export const WEAPON_ORDER = ['lance', 'dagger', 'axe', 'torch'];

export const SCORE = { enemy: 100, strong: 300, boss: 1000, treasure: 200, timeBonusPerSec: 10, weapon: 0, armor: 0 };

export const INPUT = { deadzone: 0.15, repeatDelay: 0.35, repeatRate: 0.11 };
export const AUDIO = { maxVoices: 24 };

// 敵の基本値（rank で弾速・待ち時間を補正）
export const ENEMIES = {
  ghoul:    { name: '亡者',     hp: 1, score: 'enemy',  w: 0.7, h: 1.5, speed: 1.5, emerge: 0.7 },
  skeleton: { name: '骸骨兵',   hp: 2, score: 'enemy',  w: 0.7, h: 1.6, speed: 1.8, keep: [3.5, 6], windup: 0.45, cool: 1.6, shotV: 7 },
  imp:      { name: '夜魔',     hp: 1, score: 'enemy',  w: 0.9, h: 0.8, speed: 3.0, warn: 0.5, dive: 9 },
  beast:    { name: '牙獣',     hp: 3, score: 'strong', w: 1.5, h: 1.0, speed: 9, windup: 0.75, recover: 0.9, sight: 9 },
  caster:   { name: '術者',     hp: 2, score: 'strong', w: 0.8, h: 1.6, cast: 0.85, cool: 2.2, shotV: 5.5 },
  hopper:   { name: '跳ね鬼',   hp: 2, score: 'enemy',  w: 0.9, h: 0.9, hopV: 9, hopX: 3.2, wait: 0.9 },
  brute:    { name: '鉄塊鬼',   hp: 9, score: 'strong', w: 1.3, h: 2.1, speed: 1.0, windup: 0.75, recover: 1.1, reach: 2.0 },
  turret:   { name: '呪い石像', hp: 6, score: 'strong', w: 1.0, h: 1.2, period: 2.2, warn: 0.6, shotV: 6 },
};

export const BOSSES = {
  gravekeeper: { name: '墓守ガルム',     hp: 34, w: 2.2, h: 3.2 },
  witch:       { name: '宵の魔女ヘクセ', hp: 34, w: 1.4, h: 2.0 },
  riverbeast:  { name: '沼獣ヌマヅチ',   hp: 38, w: 2.6, h: 2.0 },
  warden:      { name: '翼の守護者',     hp: 40, w: 2.2, h: 2.0 },
  flameknight: { name: '炎騎士ヴァルグ', hp: 46, w: 1.4, h: 2.6 },
  lord:        { name: '魔城の主ノクス', hp: 72, w: 2.4, h: 3.4 },
};

// 画質（2D: 内部解像度の倍率、3D: 描画倍率・影・MSAA）
export const QUALITY = {
  ultra:    { id: 'ultra',    label: '最高画質', scale: 1.0, maxPixels: 3840 * 2160, shadows: true, msaa: 4, xrScale: 1.3, foveation: 0.3 },
  standard: { id: 'standard', label: '標準',     scale: 1.0, maxPixels: 2560 * 1440, shadows: true, msaa: 4, xrScale: 1.1, foveation: 0.5 },
  lite:     { id: 'lite',     label: '軽量',     scale: 0.75, maxPixels: 1920 * 1080, shadows: false, msaa: 0, xrScale: 0.9, foveation: 0.8 },
};

export const VR = {
  unitMeters: 0.085,     // 1u の大きさ（表示スケール 1.0 のとき）
  distance: 1.6,         // 盤面の中心までの距離（m）
  sectionW: 24, sectionH: 13.5,
  fade: 0.2,
};

export const SAVE_KEY = 'tsukikage-castle.v1';
