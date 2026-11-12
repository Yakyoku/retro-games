// 鉄骨レスキュー — 効果音（すべて自作の合成音）。
// 各音は「区間」の列: { w: 波形 0:12.5% 1:25% 2:50% 3:三角 4:ノイズ, f: 開始周波数, to: 終了周波数, d: 秒, v: 音量 0-1, curve: 'exp'|'lin'|'step', steps: 段数 }
// ch: 系統（同じ系統では優先度 pri の高い音が割り込む。当時の基板のように「声」を取り合う）
//   main = 主人公の動作、hit = 衝突・得点、enemy = 敵・危険、ui = メニュー、move = 足音・昇降（最も低い）
// 音程は固定（ランダムピッチは付けない）。pos: true は VR で位置音響にする音
export const SFX = {
  jump:        { ch: 'main', pri: 5, seg: [{ w: 1, f: 330, to: 990, d: 0.16, v: 0.55, curve: 'step', steps: 8 }] },
  land:        { ch: 'move', pri: 2, seg: [{ w: 4, f: 900, to: 300, d: 0.06, v: 0.35 }] },
  step:        { ch: 'move', pri: 1, seg: [{ w: 4, f: 2400, to: 1600, d: 0.025, v: 0.18 }] },
  climb:       { ch: 'move', pri: 1, seg: [{ w: 0, f: 1320, to: 1320, d: 0.03, v: 0.18 }] },
  ladderOn:    { ch: 'move', pri: 1, seg: [{ w: 0, f: 1100, to: 1480, d: 0.05, v: 0.2, curve: 'step', steps: 2 }] },
  bonk:        { ch: 'main', pri: 4, seg: [{ w: 2, f: 220, to: 110, d: 0.08, v: 0.45 }] },
  jumpOver:    { ch: 'hit', pri: 6, seg: [{ w: 1, f: 1568, to: 1568, d: 0.06, v: 0.45 }, { w: 1, f: 2093, to: 2093, d: 0.12, v: 0.45 }] },
  smash:       { ch: 'hit', pri: 7, seg: [{ w: 4, f: 6000, to: 400, d: 0.22, v: 0.75 }, { w: 2, f: 440, to: 110, d: 0.16, v: 0.35, par: true }] },
  hammer:      { ch: 'hit', pri: 8, seg: [{ w: 1, f: 523, to: 523, d: 0.05, v: 0.45 }, { w: 1, f: 659, to: 659, d: 0.05, v: 0.45 }, { w: 1, f: 784, to: 784, d: 0.05, v: 0.45 }, { w: 1, f: 1047, to: 1047, d: 0.14, v: 0.45 }] },
  swing:       { ch: 'main', pri: 3, seg: [{ w: 4, f: 1200, to: 4200, d: 0.09, v: 0.28 }] },
  swingDenied: { ch: 'ui', pri: 1, seg: [{ w: 0, f: 180, to: 180, d: 0.05, v: 0.2 }] },
  hammerEnd:   { ch: 'hit', pri: 3, seg: [{ w: 1, f: 784, to: 392, d: 0.18, v: 0.3, curve: 'step', steps: 3 }] },
  lift:        { ch: 'enemy', pri: 4, pos: true, seg: [{ w: 2, f: 98, to: 147, d: 0.32, v: 0.5, vib: 18 }] },
  throw:       { ch: 'enemy', pri: 5, pos: true, seg: [{ w: 4, f: 600, to: 2400, d: 0.12, v: 0.35 }, { w: 2, f: 147, to: 82, d: 0.14, v: 0.45 }] },
  barrelBounce:{ ch: 'enemy', pri: 2, pos: true, seg: [{ w: 3, f: 160, to: 60, d: 0.1, v: 0.6 }] },
  barrelLadder:{ ch: 'enemy', pri: 3, pos: true, seg: [{ w: 3, f: 220, to: 220, d: 0.05, v: 0.45 }, { w: 3, f: 196, to: 196, d: 0.05, v: 0.45 }] },
  device:      { ch: 'hit', pri: 9, pos: true, seg: [{ w: 4, f: 3000, to: 200, d: 0.08, v: 0.5 }, { w: 2, f: 784, to: 784, d: 0.09, v: 0.45 }, { w: 2, f: 1175, to: 1175, d: 0.24, v: 0.45 }] },
  deviceWrong: { ch: 'ui', pri: 6, seg: [{ w: 2, f: 155, to: 155, d: 0.12, v: 0.4 }, { w: 2, f: 116, to: 116, d: 0.18, v: 0.4 }] },
  deviceAlready:{ ch: 'ui', pri: 1, seg: [{ w: 0, f: 880, to: 880, d: 0.04, v: 0.2 }] },
  ventWarn:    { ch: 'enemy', pri: 6, pos: true, danger: true, seg: [{ w: 0, f: 1760, to: 1760, d: 0.05, v: 0.3 }, { w: 0, f: 0, to: 0, d: 0.05, v: 0 }, { w: 0, f: 1760, to: 1760, d: 0.05, v: 0.3 }] },
  steam:       { ch: 'enemy', pri: 5, pos: true, danger: true, seg: [{ w: 4, f: 8000, to: 5000, d: 0.5, v: 0.32 }] },
  boltHop:     { ch: 'enemy', pri: 3, pos: true, danger: true, seg: [{ w: 1, f: 392, to: 784, d: 0.07, v: 0.3, curve: 'exp' }] },
  crateOut:    { ch: 'enemy', pri: 2, pos: true, seg: [{ w: 3, f: 130, to: 90, d: 0.07, v: 0.4 }] },
  crateDrop:   { ch: 'enemy', pri: 1, pos: true, seg: [{ w: 4, f: 700, to: 200, d: 0.12, v: 0.3 }] },
  timeWarn:    { ch: 'ui', pri: 5, seg: [{ w: 2, f: 1047, to: 1047, d: 0.07, v: 0.3 }] },
  checkpoint:  { ch: 'hit', pri: 6, seg: [{ w: 1, f: 784, to: 784, d: 0.07, v: 0.4 }, { w: 1, f: 988, to: 988, d: 0.07, v: 0.4 }, { w: 1, f: 1319, to: 1319, d: 0.16, v: 0.4 }] },
  crush:       { ch: 'main', pri: 9, seg: [{ w: 4, f: 400, to: 80, d: 0.3, v: 0.7 }] },
  release:     { ch: 'move', pri: 2, seg: [{ w: 0, f: 1480, to: 990, d: 0.06, v: 0.22 }] },
  grabMiss:    { ch: 'ui', pri: 1, seg: [{ w: 0, f: 300, to: 300, d: 0.04, v: 0.16 }] },
  tutorialStep:{ ch: 'hit', pri: 6, seg: [{ w: 1, f: 1319, to: 1319, d: 0.06, v: 0.35 }, { w: 1, f: 1760, to: 1760, d: 0.14, v: 0.35 }] },
  menuMove:    { ch: 'ui', pri: 2, seg: [{ w: 0, f: 1760, to: 1760, d: 0.03, v: 0.25 }] },
  menuOk:      { ch: 'ui', pri: 4, seg: [{ w: 1, f: 1047, to: 1047, d: 0.05, v: 0.35 }, { w: 1, f: 1568, to: 1568, d: 0.1, v: 0.35 }] },
  menuBack:    { ch: 'ui', pri: 3, seg: [{ w: 1, f: 784, to: 523, d: 0.09, v: 0.3, curve: 'step', steps: 2 }] },
  pause:       { ch: 'ui', pri: 5, seg: [{ w: 1, f: 1319, to: 1319, d: 0.05, v: 0.3 }, { w: 1, f: 0, to: 0, d: 0.04, v: 0 }, { w: 1, f: 1319, to: 1319, d: 0.05, v: 0.3 }] },
};

// ゲームのイベント名 → 効果音名（1 イベント 1 回）
export const EVENT_SFX = {
  jump: 'jump', land: 'land', step: 'step', climbStep: 'climb', ladderOn: 'ladderOn', ladderOff: 'ladderOn', bonk: 'bonk',
  jumpOver: 'jumpOver', smash: 'smash', hammer: 'hammer', swing: 'swing', swingDenied: 'swingDenied', hammerEnd: 'hammerEnd',
  lift: 'lift', throw: 'throw', barrelBounce: 'barrelBounce', barrelLadder: 'barrelLadder',
  device: 'device', deviceWrong: 'deviceWrong', deviceAlready: 'deviceAlready', boltHop: 'boltHop', crateOut: 'crateOut', crateDrop: 'crateDrop',
  timeWarn: 'timeWarn', checkpoint: 'checkpoint', release: 'release', grabMiss: 'grabMiss', tutorialStep: 'tutorialStep',
};
