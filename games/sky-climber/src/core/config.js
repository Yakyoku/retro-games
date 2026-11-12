// Sky Climber VR — 調整値（推奨初期設定。原作の数値ではない）。CLAUDE.md の「調整値」と対応。
export const TICK = 1 / 60;               // ロジックは 60Hz 固定

export const BODY = {
  shoulderHalf: 0.21,     // 肩幅の半分（m）
  reach: 0.92,            // 肩から手が届く距離（クラシック操作）
  maxSpan: 1.30,          // 両手の間の最大距離
  hangBelow: 0.42,        // 両手保持時、肩が手の平均より下がる量
  hangOne: 0.62,          // 片手保持時、肩が手より下がる量
  climbSpeed: 1.35,       // 身体の移動速度（m/s・設定で 0.6〜1.6 倍）
  reachTime: 0.20,        // 手を伸ばす時間（秒）
  chestBelowShoulder: 0.25,
  safeDrop: 1.1,          // この高さ以下で両手を離しても地面に降りるだけ（残機は減らない）
};

export const RULES = {
  lives: 3,               // 初期残機（現在の挑戦分を含む）
  regrabGrace: 0.35,      // 両手を失った後の再保持猶予
  hitInvuln: 1.0,         // 命中後、追加の保持解除を抑える時間
  fallAnim: 0.9,          // 短い落下演出（秒）
  fadeTime: 0.45,
  pointsPerMeter: 100,
  comboStart: 3,          // 3 回目から加点
  comboStep: 50,
  comboMax: 200,
  clearBonus: 1000,
  roofMargin: 0.15,       // 屋上の縁より身体（肩）がこれだけ上でクリア
};

export const DIFFICULTY = {
  beginner:  { id: 'beginner',  ja: '初心者', interval: 1.5, warn: 2.0, respawn: 'safe' },
  standard:  { id: 'standard',  ja: '標準',   interval: 1.0, warn: 1.5, respawn: 'safe' },
  challenge: { id: 'challenge', ja: '挑戦',   interval: 0.8, warn: 1.0, respawn: 'start' },
};

export const HAND_SIDES = ['L', 'R'];
