// AEGIS RELAY — ゲームの調整値・得点表・敵の定義（2D 版と 3D 版で共通）
// ここの値はすべて「この作品の独自設定」。1984 年の業務用作品の実測値ではない（docs/SPEC.md 参照）。
// 実行中にこのオブジェクトを書き換えないこと（sim.js は読むだけ。難度の倍率は状態側で持つ）。

export const FIELD = Object.freeze({ W: 240, H: 320 }); // 論理盤面（縦長 3:4）。判定はすべてこの 2 次元座標
export const HZ = 60;                                    // 論理更新は 60 回/秒で固定（描画は補間）

export const TUNING = Object.freeze({
  lives: 3,                // 初期残機（いま操作している機体を含む）
  maxLives: 9,
  scroll: 30,              // スクロール速度（u/秒）
  player: Object.freeze({ speed: 108, hitR: 2.6, bodyR: 8, minX: 10, maxX: 230, minY: 36, maxY: 306, startX: 120, startY: 286 }),
  shot: Object.freeze({ interval: 6, speed: 430, max: 10, r: 2.4 }),
  shotDocked: Object.freeze({ interval: 5, speed: 470, max: 16, r: 2.6, spread: 7 }),
  deathDelay: 96,          // 撃墜から復帰までの tick
  respawnInvuln: 120,      // 復帰後の無敵 tick（2 秒・点滅）
  respawnCalm: 72,         // 復帰直後に敵が撃たない tick
  extend: Object.freeze({ first: 30000, every: 80000 }),
  partner: Object.freeze({ life: 600, speed: 34, dockR: 13, dockTicks: 36 }),
  twin: Object.freeze({ mergeTicks: 270, halfHp: 6, mergedHp: 18 }),
  chain: Object.freeze({ gapTicks: 100 }),
  sigil: Object.freeze({ hits: 4, hintEvery: 180 }),
  // 周回ごとの難度。上限つき（反応できない弾速にしない）
  loop: Object.freeze({ speedStep: 0.08, speedCap: 1.4, fireStep: 0.12, fireCapMul: 0.6, bulletCap: 175, extraWaveFrom: 2 }),
  safety: Object.freeze({ noFireNearPlayer: 46, enterTelegraph: 40 }),
});

// 得点表（独自設定）
export const SCORE = Object.freeze({
  scout: 50, weaver: 80, slicer: 100, gunner: 150, spinner: 120, diver: 200, lancer: 300,
  twinHalf: 300, twinMerged: 1000, twinBreak: 5000,
  turret: 200, bunker: 400, dock: 500, panel: 100, ruin: 0,
  partnerDock: 1000, partnerExtra: 5000,
  chain: Object.freeze([0, 0, 200, 400, 800, 1600, 3200, 6400, 10000]), // 連続数 → 加点（全部壊すと最後の値）
  sigil: 10000,
  core: 3000,              // ×エリア番号
  noMissArea: 5000,
});

// 空中の敵。hp=耐久（自機弾 1 発 = 1）、r=当たり半径
export const AIR = Object.freeze({
  scout:   { hp: 1, r: 7,  score: 'scout',   name: 'スカウト' },
  weaver:  { hp: 1, r: 7,  score: 'weaver',  name: 'ウィーバー' },
  slicer:  { hp: 2, r: 8,  score: 'slicer',  name: 'スライサー' },
  gunner:  { hp: 3, r: 9,  score: 'gunner',  name: 'ガンナー' },
  spinner: { hp: 1, r: 7,  score: 'spinner', name: 'スピナー' },
  diver:   { hp: 2, r: 8,  score: 'diver',   name: 'ダイバー' },
  lancer:  { hp: 5, r: 11, score: 'lancer',  name: 'ランサー' },
  twinL:   { hp: TUNING.twin.halfHp, r: 10, score: 'twinHalf', name: 'ジェミニ（左）' },
  twinR:   { hp: TUNING.twin.halfHp, r: 10, score: 'twinHalf', name: 'ジェミニ（右）' },
  twinM:   { hp: TUNING.twin.mergedHp, r: 15, score: 'twinMerged', name: 'ジェミニ合体形' },
});

// 地上の標的（スクロールと一緒に流れる）
export const GROUND = Object.freeze({
  turret: { hp: 3,  r: 8,  score: 'turret', name: '砲台' },
  bunker: { hp: 6,  r: 11, score: 'bunker', name: 'トーチカ' },
  dock:   { hp: 4,  r: 11, score: 'dock',   name: '格納庫（支援機）' },
  panel:  { hp: 1,  r: 7,  score: 'panel',  name: 'ラティス・パネル' },
  sigil:  { hp: TUNING.sigil.hits, r: 9, score: 'sigil', name: '隠しシジル' },
  core:   { hp: 40, r: 22, score: 'core',   name: 'エリアコア' },
});

// エリア（8 つ＋周回）。地形・敵・ボーナス配置の違いは area-gen.js のレシピで作る
export const AREAS = Object.freeze([
  { name: 'ASHEN SHOAL',   kana: 'アッシェン・ショール', jp: '灰の浅瀬',   theme: 'ash' },
  { name: 'RIME ATOLL',    kana: 'ライム・アトール',     jp: '霜の環礁',   theme: 'ice' },
  { name: 'CINDER STEPS',  kana: 'シンダー・ステップス', jp: '燠の段丘',   theme: 'ember' },
  { name: 'GEARWRACK',     kana: 'ギアラック',           jp: '歯車の残骸', theme: 'mech' },
  { name: 'MOSS VAULT',    kana: 'モス・ヴォールト',     jp: '苔の穹窿',   theme: 'moss' },
  { name: 'AURIC NAVE',    kana: 'オーリック・ネイヴ',   jp: '黄金の身廊', theme: 'gold' },
  { name: 'OBSIDIAN KEEP', kana: 'オブシディアン・キープ', jp: '黒曜の砦', theme: 'obsid' },
  { name: 'ZENITH THRONE', kana: 'ゼニス・スローン',     jp: '天頂の玉座', theme: 'zenith' },
]);

// 見た目の色（2D・3D 共通）。敵弾は背景のどの色とも違う明るい桃色＋白い芯にそろえる
export const THEMES = Object.freeze({
  ash:    { sky: ['#05070f', '#141b33', '#2b2050'], land: '#5b6170', landHi: '#8c93a3', side: '#2a2d36', ruin: '#757b8a', glow: '#7fd8ff' },
  ice:    { sky: ['#020a14', '#0b2a44', '#1d4b6e'], land: '#7aa7bf', landHi: '#cfeaf5', side: '#33566a', ruin: '#9ec4d6', glow: '#a8f0ff' },
  ember:  { sky: ['#0d0406', '#2c0d14', '#4c1d1d'], land: '#7a4a3a', landHi: '#c58a62', side: '#3a2018', ruin: '#9a6248', glow: '#ffb070' },
  mech:   { sky: ['#04060a', '#121a20', '#24323a'], land: '#4f5a5c', landHi: '#8fa2a0', side: '#252b2c', ruin: '#6c7a78', glow: '#9cffd0' },
  moss:   { sky: ['#030806', '#0d2218', '#183a2a'], land: '#4f6e45', landHi: '#9fc08a', side: '#263620', ruin: '#6f8c62', glow: '#d6ff8a' },
  gold:   { sky: ['#0a0703', '#2a1d08', '#4a3410'], land: '#8a7442', landHi: '#e5c97a', side: '#40331b', ruin: '#b39a5c', glow: '#ffe08a' },
  obsid:  { sky: ['#040306', '#140f1f', '#2a1838'], land: '#3a3446', landHi: '#7c6f96', side: '#1a1622', ruin: '#594f6c', glow: '#c99cff' },
  zenith: { sky: ['#02030a', '#0e1238', '#2a1460'], land: '#5a5f8a', landHi: '#c3c8ff', side: '#262a46', ruin: '#7c82b8', glow: '#ffffff' },
});

export const COLORS = Object.freeze({
  enemyBullet: '#ff4fa8', enemyBulletCore: '#ffffff', playerShot: '#9ff4ff', playerShotCore: '#ffffff',
  player: '#e9eef7', playerAccent: '#2ec5ff', partner: '#ffd166', hit: '#ffffff',
});
