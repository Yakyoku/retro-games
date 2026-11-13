// AEGIS RELAY — 旧チップ音源の効果音（設定「サウンド: クラシック」で使う。モダン音源の効果音は sfx.js）
// lane: 使う声（tone=矩形波 / noise=ノイズ / both）、pri: 優先度（高いほど割り込める）、len: 声を占有する秒数、minGap: 同じ音の最短間隔(ms)
// ui: true はこの作品で追加したメニューの音（ゲーム中のできごとの音ではない）
export const SFX = {
  shot:       { lane: 'tone', pri: 1, len: 0.05, minGap: 45, play: (a) => a.tone(0, 0.05, 1500, 0.55, 0, { sweepTo: 620 }) },
  shotDocked: { lane: 'tone', pri: 1, len: 0.06, minGap: 45, play: (a) => { a.tone(0, 0.06, 1100, 0.6, 1, { sweepTo: 380 }); } },
  hit:        { lane: 'noise', pri: 2, len: 0.04, minGap: 30, play: (a) => a.noise(0, 0.04, 2.4, 0.5, true, { decay: 0.012 }) },
  kill:       { lane: 'noise', pri: 3, len: 0.22, minGap: 40, play: (a) => a.noise(0, 0.22, 1.2, 0.8, false, { rateTo: 0.25, decay: 0.07 }) },
  killBig:    { lane: 'both', pri: 5, len: 0.5, minGap: 80, play: (a) => { a.noise(0, 0.5, 0.6, 1, false, { rateTo: 0.08, decay: 0.16 }); a.tone(0, 0.35, 220, 0.5, 2, { sweepTo: 40, decay: 0.1, sustain: 0.2 }); } },
  eshot:      { lane: 'tone', pri: 0, len: 0.06, minGap: 120, play: (a) => a.tone(0, 0.06, 520, 0.35, 2, { sweepTo: 900 }) },
  die:        { lane: 'both', pri: 9, len: 1.1, minGap: 500, play: (a) => { a.noise(0, 1.1, 0.9, 1, false, { rateTo: 0.05, decay: 0.38 }); a.tone(0, 0.9, 1200, 0.55, 1, { sweepTo: 70, decay: 0.3, sustain: 0.3 }); } },
  respawn:    { lane: 'tone', pri: 6, len: 0.36, minGap: 300, play: (a) => { [523, 659, 784, 1047].forEach((f, i) => a.tone(i * 0.08, 0.08, f, 0.5, 1)); } },
  partnerFree:{ lane: 'tone', pri: 6, len: 0.5, minGap: 300, play: (a) => a.tone(0, 0.5, 660, 0.5, 2, { vib: [14, 0.06] }) },
  dock:       { lane: 'tone', pri: 8, len: 0.62, minGap: 300, play: (a) => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(i * 0.07, 0.12, f, 0.55, i % 2 ? 2 : 1)); } },
  partnerLost:{ lane: 'tone', pri: 4, len: 0.4, minGap: 300, play: (a) => a.tone(0, 0.4, 700, 0.4, 2, { sweepTo: 200 }) },
  twinAppear: { lane: 'tone', pri: 7, len: 0.9, minGap: 500, play: (a) => { for (let i = 0; i < 3; i++) a.tone(i * 0.3, 0.28, 440, 0.45, 2, { sweepTo: 880 }); } },
  twinBreak:  { lane: 'tone', pri: 8, len: 0.8, minGap: 300, play: (a) => { [659, 784, 988, 1319, 988, 1319].forEach((f, i) => a.tone(i * 0.1, 0.12, f, 0.55, 1)); } },
  twinLocked: { lane: 'tone', pri: 7, len: 0.6, minGap: 300, play: (a) => a.tone(0, 0.6, 110, 0.6, 0, { vib: [9, 0.15], decay: 0.3, sustain: 0.5 }) },
  chainStep:  { lane: 'tone', pri: 4, len: 0.07, minGap: 20, play: (a, n = 1) => a.tone(0, 0.07, 440 * 2 ** (n / 12 * 2), 0.5, 1) },
  chainBonus: { lane: 'tone', pri: 8, len: 0.7, minGap: 300, play: (a) => { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => a.tone(i * 0.08, 0.14, f, 0.5, 1)); } },
  chainFail:  { lane: 'tone', pri: 5, len: 0.3, minGap: 300, play: (a) => { a.tone(0, 0.12, 330, 0.5, 2); a.tone(0.14, 0.16, 247, 0.5, 2); } },
  sigilPing:  { lane: 'tone', pri: 3, len: 0.08, minGap: 40, play: (a) => a.tone(0, 0.08, 2637, 0.25, 0) },
  sigil:      { lane: 'tone', pri: 9, len: 1.0, minGap: 500, play: (a) => { [1047, 1319, 1568, 2093, 1568, 2093, 2637].forEach((f, i) => a.tone(i * 0.12, 0.2, f, 0.45, i % 2)); } },
  dive:       { lane: 'tone', pri: 2, len: 0.3, minGap: 200, play: (a) => a.tone(0, 0.3, 1800, 0.3, 0, { sweepTo: 400 }) },
  extend:     { lane: 'tone', pri: 9, len: 0.75, minGap: 500, play: (a) => { [1047, 1319, 1568, 2093].forEach((f, i) => a.tone(i * 0.06, 0.06, f, 0.5, 1)); a.tone(0.3, 0.45, 2093, 0.5, 1, { vib: [12, 0.02] }); } },
  coreMiss:   { lane: 'tone', pri: 8, len: 0.9, minGap: 800, play: (a) => { for (let i = 0; i < 3; i++) a.tone(i * 0.3, 0.2, 880, 0.5, 2); } },
  // メニュー（この作品で追加した UI の音）
  uiMove:     { ui: true, lane: 'tone', pri: 2, len: 0.03, minGap: 30, play: (a) => a.tone(0, 0.03, 990, 0.35, 1) },
  uiOk:       { ui: true, lane: 'tone', pri: 3, len: 0.1, minGap: 60, play: (a) => { a.tone(0, 0.05, 784, 0.4, 1); a.tone(0.05, 0.06, 1175, 0.4, 1); } },
  uiBack:     { ui: true, lane: 'tone', pri: 3, len: 0.08, minGap: 60, play: (a) => a.tone(0, 0.08, 600, 0.35, 1, { sweepTo: 380 }) },
  pause:      { ui: true, lane: 'tone', pri: 3, len: 0.12, minGap: 100, play: (a) => { a.tone(0, 0.05, 1175, 0.4, 1); a.tone(0.06, 0.06, 784, 0.4, 1); } },
};
