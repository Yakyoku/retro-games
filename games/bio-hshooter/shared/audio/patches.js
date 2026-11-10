// VOIDBLOOM — FM 音色（4 オペレータ。並びは [M1, M2, C1, C2]。すべてこの作品のために新しく組んだ値）
// op(mul, tl, ar, d1r, d1l, d2r, rr, dt, ks): mul 0 = ×0.5、tl 0〜127（0.75dB 刻み）、ar/d1r/d2r 0〜31、d1l 0〜15、rr 0〜15
const op = (mul, tl, ar, d1r, d1l, d2r, rr, dt = 0, ks = 0) => ({ mul, tl, ar, d1r, d1l, d2r, rr, dt, ks });
const MUTE = op(1, 127, 31, 0, 0, 0, 15);

export const PATCHES = [
  // 0 GRIT BASS — 冷たい金属の芯を持つベース
  { name: 'GRIT BASS', alg: 3, fb: 5, ops: [op(1, 30, 31, 10, 5, 6, 8), op(3, 44, 31, 15, 7, 8, 8, 3), op(1, 36, 31, 9, 4, 5, 8, -3), op(1, 0, 31, 7, 2, 3, 9)] },
  // 1 VOID PAD — ゆっくり立ち上がる 2 系統の厚い和音
  { name: 'VOID PAD', alg: 4, fb: 3, vib: 6, ops: [op(1, 34, 13, 4, 2, 1, 6, 4), op(1, 6, 12, 3, 2, 1, 5, 4), op(2, 40, 14, 4, 3, 1, 6, -5), op(1, 8, 12, 3, 2, 1, 5, -5)] },
  // 2 GLASS BELL — 硝子の礁の鐘
  { name: 'GLASS BELL', alg: 4, fb: 0, ops: [op(7, 36, 31, 9, 6, 4, 6, 2), op(1, 4, 31, 6, 4, 3, 5), op(3, 38, 31, 11, 7, 5, 6, -3), op(1, 10, 31, 7, 5, 3, 5, -2)] },
  // 3 IRON HORN — 旋律用の金管
  { name: 'IRON HORN', alg: 5, fb: 6, vib: 9, ops: [op(1, 22, 20, 6, 3, 2, 7), op(1, 4, 22, 4, 2, 2, 7, 3), op(2, 10, 24, 5, 3, 2, 7, -3), op(1, 6, 21, 4, 2, 2, 7)] },
  // 4 HOLLOW ORGAN
  { name: 'HOLLOW ORGAN', alg: 7, fb: 2, vib: 4, ops: [op(1, 8, 26, 0, 0, 0, 7), op(2, 14, 26, 0, 0, 0, 7, 2), op(4, 22, 26, 0, 0, 0, 7, -2), op(8, 30, 26, 0, 0, 0, 7)] },
  // 5 THORN PLUCK — 短く刺さる撥弦
  { name: 'THORN PLUCK', alg: 4, fb: 4, ops: [op(3, 30, 31, 16, 9, 8, 8), op(1, 4, 31, 12, 8, 7, 8), op(1, 34, 31, 14, 9, 8, 8, 3), op(1, 10, 31, 11, 8, 7, 8, -3)] },
  // 6 CHOIR OF HUSKS — かすれた声
  { name: 'CHOIR OF HUSKS', alg: 5, fb: 4, vib: 12, ops: [op(1, 40, 14, 2, 1, 1, 6), op(2, 12, 13, 2, 1, 1, 5, 3), op(1, 10, 14, 2, 1, 1, 5, -4), op(4, 22, 15, 3, 2, 1, 5, 1)] },
  // 7 DEEP SINE — 床を鳴らすサブベース
  { name: 'DEEP SINE', alg: 7, fb: 0, ops: [MUTE, MUTE, op(2, 26, 31, 6, 4, 3, 8), op(1, 0, 31, 4, 3, 2, 8)] },
  // 8 CHITIN CLAV — 硬い殻を叩くような鍵盤
  { name: 'CHITIN CLAV', alg: 4, fb: 5, ops: [op(5, 32, 31, 18, 10, 9, 9), op(1, 6, 31, 14, 8, 8, 9), op(1, 30, 31, 18, 10, 9, 9), op(2, 14, 31, 13, 8, 7, 9)] },
  // 9 COLD STRINGS
  { name: 'COLD STRINGS', alg: 2, fb: 4, vib: 10, ops: [op(1, 36, 15, 3, 2, 1, 6, 3), op(3, 44, 15, 3, 2, 1, 6), op(1, 32, 15, 3, 2, 1, 6, -3), op(1, 6, 14, 2, 1, 1, 6)] },
  // 10 RUST LEAD — 歪んだ鋭い旋律（ボス戦）
  { name: 'RUST LEAD', alg: 0, fb: 7, vib: 14, ops: [op(1, 26, 28, 5, 3, 2, 7), op(2, 30, 28, 5, 3, 2, 7, 2), op(1, 24, 28, 6, 3, 2, 7), op(1, 4, 27, 4, 2, 2, 7)] },
  // 11 TINE PIANO
  { name: 'TINE PIANO', alg: 4, fb: 1, ops: [op(14, 44, 31, 14, 10, 8, 7), op(1, 6, 31, 8, 5, 4, 6), op(1, 32, 31, 10, 6, 5, 7), op(1, 12, 31, 7, 5, 4, 6, 3)] },
  // 12 ABYSS DRONE — 低いうなり
  { name: 'ABYSS DRONE', alg: 3, fb: 6, vib: 5, ops: [op(0, 30, 10, 0, 0, 0, 4), op(1, 36, 10, 0, 0, 0, 4, 6), op(0, 40, 10, 0, 0, 0, 4, -6), op(0, 6, 9, 0, 0, 0, 4)] },
  // 13 SPORE STAB — 短い和音の刺し
  { name: 'SPORE STAB', alg: 4, fb: 5, ops: [op(1, 22, 31, 12, 6, 7, 9), op(1, 4, 31, 10, 6, 7, 9, 3), op(2, 26, 31, 12, 6, 7, 9, -3), op(1, 8, 31, 10, 6, 7, 9)] },
  // ---- 効果音用 ----
  // 14 SFX ZAP
  { name: 'SFX ZAP', alg: 0, fb: 6, reset: true, ops: [op(1, 24, 31, 10, 4, 6, 12), op(3, 30, 31, 12, 6, 6, 12), op(1, 26, 31, 10, 5, 6, 12), op(1, 0, 31, 8, 3, 5, 12)] },
  // 15 SFX GRIND — 雑音に近い金属音
  { name: 'SFX GRIND', alg: 0, fb: 7, reset: true, ops: [op(15, 0, 31, 6, 2, 4, 12), op(11, 10, 31, 6, 2, 4, 12, 3), op(7, 14, 31, 6, 3, 4, 12, -2), op(1, 0, 31, 6, 2, 4, 12)] },
  // 16 SFX BLIP
  { name: 'SFX BLIP', alg: 4, fb: 0, reset: true, ops: [op(2, 30, 31, 14, 8, 8, 12), op(1, 2, 31, 10, 6, 6, 12), op(4, 40, 31, 14, 8, 8, 12), op(1, 14, 31, 10, 6, 6, 12)] },
  // 17 SFX THUD — 低い衝撃
  { name: 'SFX THUD', alg: 0, fb: 5, reset: true, ops: [op(0, 20, 31, 8, 4, 6, 10), op(1, 22, 31, 9, 5, 6, 10), op(0, 18, 31, 8, 4, 6, 10), op(0, 0, 31, 6, 3, 5, 10)] },
  // 18 SFX CHIME — 取得音
  { name: 'SFX CHIME', alg: 4, fb: 0, reset: true, ops: [op(5, 28, 31, 10, 6, 6, 8), op(2, 4, 31, 7, 4, 4, 8), op(7, 34, 31, 10, 6, 6, 8), op(3, 10, 31, 7, 4, 4, 8)] },
];
