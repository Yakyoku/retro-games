// AEGIS RELAY — 曲（すべてこの作品のために新しく作曲したもの。既存曲の採譜・編曲ではない）
// 声部: ch0 主旋律 / ch1 ベース / ch2 内声（効果音が鳴る間は効果音に譲る）/ ch3 ノイズ（打楽器。効果音のノイズに譲る）
// 1 小節 = 4 拍。全トラックの長さとループ位置がそろうことを tests/audio.test.js で確認する。
import { bassFrom, padFrom } from './mml.js';

const DRUM_A = 'k.h.s.h.k.k.s.h.'; // 16 分 × 16 = 1 小節（k=低いノイズ s=高いノイズ h=短い金属音 .=休み）
const DRUM_B = 'k.hhs.h.k.hks.hh';
const DRUM_C = 'k...s...k.k.s...';
const rep = (s, n) => Array(n).fill(s).join('');

// ── タイトル「RELAY DAWN」G 長調 ──
const titleChords = ['G', 'C', 'D', 'G', 'G', 'C', 'D', 'G'];
const title = {
  tempo: 116,
  tracks: [
    { ch: 0, mml: 'o5 l8 @1 v12 q7 L g4 b > d g4. f+ | e4 d c < b4 a g | a4 b > c d4 e f+ | g2 d2 < | g4 b > d g4 a b | > c4 < b a g4 f+ e | d4 c < b > c4 < b a | g1' },
    { ch: 1, mml: '@2 v11 q6 L ' + bassFrom(titleChords, 'walk') },
    { ch: 2, mml: '@0 v8 q5 L ' + padFrom(titleChords, 4, 'arp') },
  ],
  drums: { loop: rep(DRUM_C, 8) },
};

// ── 奇数エリア「SHOAL RUN」ホ短調 ──
const runA = ['Em', 'Am', 'D', ['C', 'B'], 'Em', 'Am', 'C', ['B', 'Em']];
const runB = ['C', 'D', 'Em', 'B', 'Em', 'D', ['Am', 'B'], 'Em'];
const run = {
  tempo: 150,
  tracks: [
    { ch: 0, mml: 'o5 l8 @1 v12 q6 L ' +
      'e4 g b > e4 d < b | a4 g a b4 g e | f+4 e f+ g4 a b | > c4 < b a b2 | e4 g b > e4 d < b | a4 g a b4 > c d | e4 d c < b4 a g | f+2 e2 |' +
      'c4 e g > c4 < b g | a4 f+ d a4 b > c | < b4 g e g4 f+ e | d+2 f+2 | e4 g b > e4 f+ g | f+4 e d e4 d < b | > c4 < b a b4 a f+ | e1' },
    { ch: 1, mml: '@2 v11 q5 L ' + bassFrom(runA, 'octave') + bassFrom(runB, 'octave') },
    { ch: 2, mml: '@0 v7 q4 L ' + padFrom(runA, 4, 'pulse') + padFrom(runB, 4, 'pulse') },
  ],
  drums: { loop: rep(DRUM_A, 15) + DRUM_B },
};

// ── 偶数エリア「NAVE PULSE」ニ短調 ──
const naveA = ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', ['Gm', 'A'], 'Dm'];
const naveB = ['F', 'C', 'Dm', 'A', 'Gm', 'Dm', 'E', 'A'];
const nave = {
  tempo: 158,
  tracks: [
    { ch: 0, mml: 'o5 l8 @2 v11 q6 L ' +
      'd4 f a > d4 c < a | b-4 a f d4 f b- | > c4 < b- a g4 e c | c+4 e a > c+2 < | d4 f a > d4 e f | d4 c < b- > c4 < b- a | g4 b- > d < c+4 e a | d2 r4 a4 |' +
      'a4 > c f e4 c < a | g4 e c g4 a b- | a4 f d a4 b- > c | c+2 < a2 | b-4 > d g f4 d < b- | a4 f d f4 e d | e4 g+ b > d4 c+ < b | a1' },
    { ch: 1, mml: '@2 v11 q5 L ' + bassFrom(naveA, 'walk') + bassFrom(naveB, 'walk') },
    { ch: 2, mml: '@1 v7 q4 L ' + padFrom(naveA, 4, 'pulse') + padFrom(naveB, 4, 'pulse') },
  ],
  drums: { loop: rep(DRUM_B, 15) + DRUM_A },
};

// ── エリアコア接近「CORE ALERT」イ短調（オスティナート）──
const coreCh = ['Am', 'F', 'G', 'E'];
const core = {
  tempo: 168,
  tracks: [
    { ch: 0, mml: 'o5 l8 @1 v12 q5 L a > a < a > g < a > f < a > e < | f > f < f > e < f > d < f > c < | g > g < g > f < g > e < g > d < | e > e < e > g+ < e > b < e > g+ <' },
    { ch: 1, mml: '@2 v12 q4 L ' + bassFrom(coreCh, 'pump') },
    { ch: 2, mml: '@0 v7 q3 L ' + padFrom(coreCh, 5, 'pulse') },
  ],
  drums: { loop: rep(DRUM_B, 4) },
};

// ── ジングル（ループしない）──
const start = { tempo: 150, once: true, tracks: [
  { ch: 0, mml: 'o5 l16 @1 v12 q7 e g b > e < b > e g b > e2 r8' },
  { ch: 1, mml: 'o2 l8 @2 v11 q6 e > e < e > e < e2' },
  { ch: 2, mml: 'o4 l8 @0 v8 q6 g b g b g+2' },
], drums: { loop: 'k...s...k.k.s...' } };
const clear = { tempo: 140, once: true, tracks: [
  { ch: 0, mml: 'o5 l8 @1 v12 q7 g b > d g4 d < b > d | g2. r4' },
  { ch: 1, mml: 'o2 l8 @2 v11 q6 g > g < g > g < d > d < d > d < | g2. r4' },
  { ch: 2, mml: 'o4 l8 @0 v8 q6 b > d < b > d < a > c+ < a > c+ | d2. r4' },
], drums: { loop: 'k.h.s.h.k.h.s.k.k...s...k.......' } };
const over = { tempo: 88, once: true, tracks: [
  { ch: 0, mml: 'o5 l4 @1 v11 q7 e d c < b | a2 e2 | a1' },
  { ch: 1, mml: 'o2 l2 @2 v10 q7 a f | d e | a1' },
  { ch: 2, mml: 'o4 l2 @0 v7 q7 c a | f g+ | e1' },
], drums: { loop: '' } };
export const SONGS = { title, run, nave, core, start, clear, over };
export const AREA_SONG = (area) => (area % 2 === 0 ? 'run' : 'nave');
