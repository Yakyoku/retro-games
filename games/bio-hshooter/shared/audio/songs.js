// VOIDBLOOM — 曲（すべてこの作品のために新しく書いた。旋律・和音進行・リズム型は既存曲の引用ではない）
// FM 0: ベース / 1: 旋律 / 2〜4: 和音 / 5: 分散和音・対旋律　PCM 0: 太鼓 / 1: 打楽器・効果
// 効果音は FM 6・7 と PCM 2・3 を使う（曲は FM 0〜5 と PCM 0〜1 だけ）
import { compileSong } from './mml.js';

const NN = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
const n = (m, l = '') => (m == null ? `r${l}` : `o${Math.floor(m / 12) - 1}${NN[((m % 12) + 12) % 12]}${l}`);
const rep = (s, k) => Array(k).fill(s).join(' ');
const rests = (bars) => rep('r1', bars);

// 和音: [ベースの根音(MIDI), [和音 3 声], [分散和音の音]]
// ベースの型
const BASS = {
  drive: (r) => [n(r, 8), n(r, 16), n(r, 16), 'r16', n(r, 16), n(r + 12, 16), n(r, 16), n(r, 8), n(r + 7, 16), n(r, 16), 'r16', n(r, 16), n(r + 10, 16), n(r + 12, 16)].join(' '),
  pulse: (r) => [r, r + 12, r, r, r + 12, r, r + 7, r + 12].map((m) => n(m, 8)).join(' '),
  heart: (r) => [n(r, 16), 'r16', n(r, 8), 'r4', n(r, 16), 'r16', n(r - 5, 8), 'r4'].join(' '),
  long: (r) => n(r, 1),
  half: (r) => `${n(r, 2)} ${n(r, '4.')} ${n(r + 7, 8)}`,
  march: (r) => [r, r, r + 12, r, r, r, r + 10, r + 12].map((m) => n(m, 8)).join(' '),
  gallop: (r) => [n(r, 8), n(r, 16), n(r, 16), n(r, 8), n(r, 16), n(r, 16), n(r + 12, 8), n(r, 16), n(r, 16), n(r + 10, 8), n(r + 7, 8)].join(' '),
};
// 分散和音の型
const ARP = {
  up16: (t) => Array.from({ length: 16 }, (_, k) => n(t[k % t.length], 16)).join(' '),
  wave16: (t) => { const o = [...t, ...t.slice(1, -1).reverse()]; return Array.from({ length: 16 }, (_, k) => n(o[k % o.length], 16)).join(' '); },
  eighth: (t) => Array.from({ length: 8 }, (_, k) => n(t[(k * 2) % t.length], 8)).join(' '),
  sparse: (t) => `${n(t[0], 8)} r8 ${n(t[2 % t.length], 8)} r8 r8 ${n(t[1 % t.length], 8)} r4`,
  none: () => 'r1',
};
const bassOf = (prog, style) => prog.map((c) => (c ? BASS[style](c[0]) : 'r1')).join(' ');
const arpOf = (prog, style) => prog.map((c) => (c ? ARP[style](c[2]) : 'r1')).join(' ');
const padOf = (prog, v, tie = false) => prog.map((c, k) => {
  if (!c) return 'r1';
  const prev = prog[k - 1];
  return (tie && prev && prev[1][v] === c[1][v] ? '^1' : ' ' + n(c[1][v], 1));
}).join(' ').replace(/\s+\^/g, '^');

function song(o) { return compileSong(o); }

// ================================================================ タイトル「VOIDBLOOM」
const T = { Dm9: [38, [53, 57, 64], [62, 65, 69, 76]], Bbm7: [34, [53, 56, 61], [58, 61, 65, 68]], Gm9: [43, [53, 58, 62], [57, 62, 65, 70]], A7s: [45, [52, 55, 62], [57, 62, 64, 67]] };
const tP = [T.Dm9, T.Dm9, T.Bbm7, T.Bbm7, T.Gm9, T.Gm9, T.A7s, T.A7s];
export const SONG_DEFS = {
  title: {
    id: 'title', title: 'VOIDBLOOM — 虚空の開花', tempo: 76, echoBeats: 0.75, echoFb: 0.48,
    fm: [
      `@12 v12 y2 L ${bassOf(tP, 'long')}`,
      `@2 v11 y8 L r2 o5 a4 f4 | e2. d4 | e2 r4 f8 e8 | d1 | r4 d4 f4 a4 | g2. b-8 a8 | g2 e4 c+4 | d1`,
      `@1 v10 y3 L ${padOf(tP, 0, true)}`,
      `@1 v10 y3 L ${padOf(tP, 1, true)}`,
      `@1 v9 y3 L ${padOf(tP, 2, true)}`,
      `@11 v7 y7 L ${arpOf(tP, 'sparse')}`,
    ],
    pcm: [`v9 L ${rep('r1', 3)} X1 ${rep('r1', 3)} X1`, null],
  },
};

// ================================================================ 第 1 面「硝子の礁」
const A1 = { Em: [40, [55, 62, 66], [64, 67, 71, 74]], C: [36, [55, 59, 66], [60, 64, 67, 71]], Am: [45, [55, 60, 64], [69, 72, 76, 79]], Bs: [47, [54, 57, 64], [59, 64, 66, 69]], B7: [47, [54, 57, 63], [59, 63, 66, 69]], F: [41, [57, 64, 71], [65, 69, 72, 76]] };
const p1a = [A1.Em, A1.C, A1.Am, A1.Bs, A1.Em, A1.C, A1.F, A1.B7];
const p1b = [A1.C, A1.C, A1.Am, A1.Em, A1.F, A1.F, A1.Bs, A1.B7];
const p1i = [A1.Em, A1.Em, A1.C, A1.Bs];
const mel1a = 'o5 e8. f+16 g4 b8 a8 g8 f+8 | e4. d8 e8 f+8 g8 a8 | b4 >c8< b8 a4 g8 e8 | f+2. r4 | e8. f+16 g4 b8 >d8 e8 d8< | >e4. d8< b8 a8 g8 a8 | a4 g8 f8 e4 f8 g8 | f+1';
const mel1b = 'o5 g2 a4 b4 | >c2< b4 a4 | g4. e8 d4 e4 | e1 | f4. g8 a4 >c4< | b2 a4 g4 | f+2 e4 f+4 | b1';
const dr1 = 'K8 H8 S8 H16 K16 K8 H8 S8 H16 H16';
const dr1f = 'K8 H8 S8 H16 K16 K8 S16 S16 S8 S16 S16';
SONG_DEFS.stage1 = {
  id: 'stage1', title: '硝子の礁 — GLASS REEF', tempo: 132, echoBeats: 0.75, echoFb: 0.32,
  fm: [
    `@0 v13 ${bassOf(p1i, 'pulse')} L ${bassOf(p1a, 'drive')} ${bassOf(p1a, 'drive')} ${bassOf(p1b, 'drive')}`,
    `@3 v13 y3 q7 ${rests(4)} L ${mel1a} ${mel1a.replace(/f\+1$/, 'f+2 r4 b8 >d8<')} @10 v12 ${mel1b} @3 v13`,
    `@1 v9 y2 ${padOf(p1i, 0)} L ${padOf(p1a, 0)} ${padOf(p1a, 0)} ${padOf(p1b, 0)}`,
    `@1 v9 y2 ${padOf(p1i, 1)} L ${padOf(p1a, 1)} ${padOf(p1a, 1)} ${padOf(p1b, 1)}`,
    `@9 v8 y3 ${padOf(p1i, 2)} L ${padOf(p1a, 2)} ${padOf(p1a, 2)} ${padOf(p1b, 2)}`,
    `@2 v7 y6 ${arpOf(p1i, 'up16')} L ${arpOf(p1a, 'wave16')} ${arpOf(p1a, 'up16')} ${arpOf(p1b, 'wave16')}`,
  ],
  pcm: [
    `v13 K4 r4 K4 r8 K8 | K4 r4 K4 r8 K8 | K4 r4 K4 r8 K8 | K4 H4 S4 S8 S8 L ${rep(dr1, 7)} ${dr1f} ${rep(dr1, 7)} ${dr1f} ${rep(dr1, 7)} ${dr1f}`,
    `v8 ${rests(3)} C1 L C1 ${rests(7)} C1 ${rests(7)} C1 ${rests(5)} r2 P4 P4 r1`,
  ],
};

// ================================================================ 第 2 面「脈の聖堂」
const A2 = { Cm: [37, [56, 61, 64], [61, 64, 68, 73]], D: [38, [57, 61, 66], [62, 66, 69, 73]], B6: [35, [56, 59, 63], [59, 63, 66, 68]], A: [33, [56, 61, 64], [57, 61, 64, 68]], Gs: [44, [56, 61, 63], [56, 61, 63, 66]], G7: [44, [54, 60, 63], [56, 60, 63, 66]], Fm: [42, [57, 61, 64], [66, 69, 73, 76]] };
const p2 = [A2.Cm, A2.D, A2.Cm, A2.B6, A2.A, A2.Fm, A2.Gs, A2.G7];
const mel2 = 'o4 g+2. a8 g+8 | f+2 a2 | g+2. e8 f+8 | d+1 | e2. f+8 e8 | c+2 f+2 | e2 d+4 c+4 | c1';
const mel2b = 'o5 c+2 d4 c+4 | <b2 >d2 | c+4. <b8 a4 g+4 | f+1 | e4. f+8 g+4 a4 | b2 >c+2 | <b2 a4 g+4 | g+1';
const dr2 = 'K8 r16 K16 r4 K8 r8 S4';
SONG_DEFS.stage2 = {
  id: 'stage2', title: '脈の聖堂 — VEIN CATHEDRAL', tempo: 108, echoBeats: 1.5, echoFb: 0.42,
  fm: [
    `@7 v14 ${bassOf([A2.Cm, A2.Cm, A2.Cm, A2.Cm], 'heart')} L ${bassOf(p2, 'heart')} ${bassOf(p2, 'heart')} ${bassOf(p2, 'half')}`,
    `@6 v12 y5 ${rests(4)} L ${mel2} ${mel2b} @4 v11 ${mel2}`,
    `@4 v8 y2 ${padOf([A2.Cm, A2.Cm, A2.Cm, A2.Cm], 0, true)} L ${padOf(p2, 0)} ${padOf(p2, 0)} ${padOf(p2, 0)}`,
    `@4 v8 y2 ${padOf([A2.Cm, A2.Cm, A2.Cm, A2.Cm], 1, true)} L ${padOf(p2, 1)} ${padOf(p2, 1)} ${padOf(p2, 1)}`,
    `@9 v8 y3 ${padOf([A2.Cm, A2.Cm, A2.Cm, A2.Cm], 2, true)} L ${padOf(p2, 2)} ${padOf(p2, 2)} ${padOf(p2, 2)}`,
    `@8 v8 y5 ${rests(4)} L ${arpOf(p2, 'eighth')} ${arpOf(p2, 'wave16')} ${arpOf(p2, 'eighth')}`,
  ],
  pcm: [`v12 K4 r2. | K4 r2. | K4 r2. | K4 r4 T8 T8 T4 L ${rep(dr2, 16)} ${rep('K8 H16 H16 S8 H8 K8 K8 S8 O8', 8)}`, `v7 r1 r1 r1 r1 L ${rep('r2 H8 r8 H8 H8', 24)}`],
};

// ================================================================ 第 3 面「墓標の方舟」
const A3 = { Am: [33, [57, 60, 64], [69, 72, 76, 81]], F: [29, [57, 60, 65], [65, 69, 72, 77]], G: [31, [55, 59, 62], [67, 71, 74, 79]], Bb: [34, [58, 62, 65], [70, 74, 77, 82]], E7: [28, [56, 59, 62], [64, 68, 71, 74]], Dm: [38, [57, 62, 65], [62, 65, 69, 74]] };
const p3 = [A3.Am, A3.Am, A3.F, A3.G, A3.Am, A3.Am, A3.Bb, A3.E7];
const p3b = [A3.Dm, A3.Dm, A3.Am, A3.Am, A3.F, A3.G, A3.Bb, A3.E7];
const mel3 = 'o5 e4 e8. d16 c4 <a4> | e8 f8 e8 d8 c2 | f4 f8. e16 d4 <a4> | g2 b2 | >c4 <b8. a16 g4 e4 | a8 b8 >c8 d8 e2 | f4 e4 d4 c+4 | <b2 g+2';
const mel3b = 'o5 d2 f4 a4 | g2. f8 e8 | e2 c4 <a4> | e1 | f4. g8 a4 >c4 | <b4. a8 g4 d4 | f2 e2 | e1';
const dr3 = 'K8 H8 S8 K8 K8 H8 S8 H8';
SONG_DEFS.stage3 = {
  id: 'stage3', title: '墓標の方舟 — GRAVEN ARK', tempo: 146, echoBeats: 0.5, echoFb: 0.28,
  fm: [
    `@0 v14 ${bassOf([A3.Am, A3.Am], 'pulse')} L ${bassOf(p3, 'march')} ${bassOf(p3, 'gallop')} ${bassOf(p3b, 'march')}`,
    `@3 v13 y3 ${rests(2)} L ${mel3} ${mel3} @10 v12 ${mel3b}`,
    `@13 v9 y2 ${padOf([A3.Am, A3.Am], 0)} L ${padOf(p3, 0)} ${padOf(p3, 0)} ${padOf(p3b, 0)}`,
    `@13 v9 y2 ${padOf([A3.Am, A3.Am], 1)} L ${padOf(p3, 1)} ${padOf(p3, 1)} ${padOf(p3b, 1)}`,
    `@9 v9 y2 ${padOf([A3.Am, A3.Am], 2)} L ${padOf(p3, 2)} ${padOf(p3, 2)} ${padOf(p3b, 2)}`,
    `@5 v7 y5 ${arpOf([A3.Am, A3.Am], 'up16')} L ${arpOf(p3, 'up16')} ${arpOf(p3, 'wave16')} ${arpOf(p3b, 'up16')}`,
  ],
  pcm: [`v13 K8 K8 S8 K8 K8 K8 S8 S8 | K8 K8 S8 K8 S16 S16 S8 S8 S8 L ${rep(dr3, 24)}`, `v7 r1 r1 L ${rep('r4 P8 r8 r4 P8 P8', 24)}`],
};

// ================================================================ 第 4 面「花芯」
const A4 = { Fm9: [42, [57, 61, 68], [66, 69, 73, 80]], D: [38, [57, 61, 66], [62, 66, 69, 73]], Bm9: [35, [57, 62, 61 + 12], [59, 62, 66, 73]], Cs: [37, [54, 59, 61], [61, 66, 68, 71]], C7: [37, [53, 59, 61], [61, 65, 68, 71]], E: [40, [56, 59, 64], [64, 68, 71, 76]] };
const p4 = [A4.Fm9, A4.D, A4.Bm9, A4.Cs, A4.Fm9, A4.E, A4.D, A4.C7];
const mel4 = 'o5 c+2 <a4 b4 | >c+4. e8 d2 | c+4 <b4 a4 f+4 | g+1 | a2 >c+4 e4 | d+4. e8 <b2 | >d4 c+4 <b4 a4 | g+2 e+2';
const dr4 = 'K4 r8 H8 S4 r8 H8';
SONG_DEFS.stage4 = {
  id: 'stage4', title: '花芯 — HEART OF THE BLOOM', tempo: 118, echoBeats: 0.75, echoFb: 0.45,
  fm: [
    `@7 v13 ${bassOf([A4.Fm9, A4.Fm9], 'long')} L ${bassOf(p4, 'half')} ${bassOf(p4, 'pulse')}`,
    `@6 v11 y6 ${rests(2)} L ${mel4} @2 v12 ${mel4}`,
    `@1 v9 y4 ${padOf([A4.Fm9, A4.Fm9], 0, true)} L ${padOf(p4, 0)} ${padOf(p4, 0)}`,
    `@1 v9 y4 ${padOf([A4.Fm9, A4.Fm9], 1, true)} L ${padOf(p4, 1)} ${padOf(p4, 1)}`,
    `@1 v8 y4 ${padOf([A4.Fm9, A4.Fm9], 2, true)} L ${padOf(p4, 2)} ${padOf(p4, 2)}`,
    `@2 v7 y7 ${arpOf([A4.Fm9, A4.Fm9], 'wave16')} L ${arpOf(p4, 'wave16')} ${arpOf(p4, 'up16')}`,
  ],
  pcm: [`v12 X1 X1 L ${rep(dr4, 8)} ${rep('K8 H8 S8 H8 K8 K8 S8 H8', 8)}`, `v6 r1 r1 L ${rep('r8 H8 r8 H8 r8 H8 r8 O8', 16)}`],
};

// ================================================================ ボス戦
const AB = { Bm: [35, [54, 59, 62], [59, 62, 66, 71]], C: [36, [55, 60, 64], [60, 64, 67, 72]], G: [31, [55, 59, 62], [55, 59, 62, 67]], F7: [42, [54, 58, 61], [54, 58, 61, 64]], Em: [40, [55, 59, 64], [64, 67, 71, 76]], A: [33, [57, 61, 64], [57, 61, 64, 69]] };
const pb = [AB.Bm, AB.Bm, AB.C, AB.Bm, AB.G, AB.Em, AB.F7, AB.F7];
const melb = 'o5 b8 f+8 b8 >d8 c+8 <b8 a+8 b8 | f+4. g8 f+4 e4 | g8 e8 g8 >c8 <b8 a8 g8 e8 | f+2 b2 | d8 e8 f+8 g8 a4 g8 f+8 | e4. d8 e4 g4 | f+4 e+4 f+4 a+4 | f+1';
SONG_DEFS.boss = {
  id: 'boss', title: '開く花弁 — PETALS OPEN', tempo: 156, echoBeats: 0.5, echoFb: 0.25,
  fm: [
    `@0 v14 ${bassOf([AB.Bm], 'pulse')} L ${bassOf(pb, 'gallop')} ${bassOf(pb, 'drive')}`,
    `@10 v13 y2 r1 L ${melb} ${melb.replace(/f\+1$/, 'f+2 >c+4 <a+4')}`,
    `@13 v9 ${padOf([AB.Bm], 0)} L ${padOf(pb, 0)} ${padOf(pb, 0)}`,
    `@13 v9 ${padOf([AB.Bm], 1)} L ${padOf(pb, 1)} ${padOf(pb, 1)}`,
    `@8 v8 ${padOf([AB.Bm], 2)} L ${padOf(pb, 2)} ${padOf(pb, 2)}`,
    `@5 v7 y4 ${arpOf([AB.Bm], 'up16')} L ${arpOf(pb, 'up16')} ${arpOf(pb, 'wave16')}`,
  ],
  pcm: [`v13 K16 K16 K16 K16 S8 S8 S16 S16 S16 S16 S8 C8 L ${rep('K8 H16 K16 S8 H8 K16 K16 H8 S8 H8', 16)}`, `v8 r1 L ${rep('C1 r1 r1 r1', 4)}`],
};

// ================================================================ 最終ボス
const AF = { Dm: [38, [57, 62, 65], [62, 65, 69, 74]], Eb: [39, [58, 63, 67], [63, 67, 70, 75]], Bdim: [35, [53, 59, 62], [59, 62, 65, 71]], Bb: [34, [58, 62, 65], [58, 62, 65, 70]], A7: [33, [55, 61, 64], [57, 61, 64, 67]], Gm: [43, [58, 62, 67], [67, 70, 74, 79]] };
const pf = [AF.Dm, AF.Eb, AF.Dm, AF.Bdim, AF.Bb, AF.Gm, AF.A7, AF.A7];
const melf = 'o5 d4 a4 g8 f8 e8 f8 | e-2. d8 e-8 | f4 a4 >d4 c4 | <b2 g+2 | b-4. a8 g4 f4 | g4. a8 b-4 >d4 | c+4 <b-4 a4 g4 | a1';
SONG_DEFS.final = {
  id: 'final', title: '虚空の花芯 — THE LAST BLOOM', tempo: 142, echoBeats: 0.75, echoFb: 0.35,
  fm: [
    `@12 v13 ${bassOf([AF.Dm, AF.Dm], 'long')} @0 L ${bassOf(pf, 'drive')} ${bassOf(pf, 'gallop')}`,
    `@6 v12 y4 ${rests(2)} L ${melf} @10 v13 ${melf}`,
    `@6 v9 y3 ${padOf([AF.Dm, AF.Dm], 0, true)} L ${padOf(pf, 0)} ${padOf(pf, 0)}`,
    `@6 v9 y3 ${padOf([AF.Dm, AF.Dm], 1, true)} L ${padOf(pf, 1)} ${padOf(pf, 1)}`,
    `@9 v9 y3 ${padOf([AF.Dm, AF.Dm], 2, true)} L ${padOf(pf, 2)} ${padOf(pf, 2)}`,
    `@2 v7 y7 ${arpOf([AF.Dm, AF.Dm], 'sparse')} L ${arpOf(pf, 'wave16')} ${arpOf(pf, 'up16')}`,
  ],
  pcm: [`v12 X1 X2 S8 S8 S8 S8 L ${rep('K8 H8 S8 K8 r8 K8 S8 H8', 16)}`, `v7 r1 r1 L ${rep('C1 r1 r1 r1', 4)}`],
};

// ================================================================ ジングル（ループしない）
SONG_DEFS.clear = {
  id: 'clear', title: '面クリア — WILT', tempo: 120, echoBeats: 0.75, echoFb: 0.4,
  fm: [
    'v13 @0 o2 e2 c2 | d2 e2 | e1',
    '@3 v13 y4 o5 b4 >e4 d4 <b4 | >c4 d4 e4 f+4 | g+1',
    '@1 v10 o4 g2 g2 | a2 b2 | b1', '@1 v10 o4 b2 >c2 | <f+2 g+2 | >e1', '@1 v9 o4 e2 e2 | d2 e2 | g+1',
    '@2 v8 y6 o6 e8 g8 b8 >e8< b8 g8 e8 g8 | d8 f+8 a8 >d8 e8 g+8 b8 >e8 | r1',
  ],
  pcm: ['v12 K4 r4 K4 r4 | K4 S4 K8 S8 S8 S8 | C1'],
};
SONG_DEFS.gameover = {
  id: 'gameover', title: '沈黙 — SILENCE', tempo: 70, echoBeats: 1, echoFb: 0.5,
  fm: ['@12 v12 o2 d1 | c+1 | c1 | <b1', '@2 v10 y8 o5 a4 f4 d4 <a4 | >g4 e4 c+4 <a4 | >f2 e2 | d1', '@1 v9 o4 f1 | e1 | e-1 | d1', '@1 v9 o4 a1 | a1 | g1 | f+1'],
  pcm: [],
};
const AE = { D: [38, [57, 62, 66], [62, 66, 69, 74]], G: [43, [59, 62, 66], [67, 71, 74, 78]], Bm: [35, [57, 62, 66], [59, 62, 66, 71]], A: [45, [57, 61, 64], [64, 69, 73, 76]], Em: [40, [59, 62, 67], [64, 67, 71, 74]] };
const pe = [AE.D, AE.G, AE.Bm, AE.A, AE.G, AE.Em, AE.A, AE.A];
SONG_DEFS.ending = {
  id: 'ending', title: '灰の朝 — ASH DAWN', tempo: 88, echoBeats: 0.75, echoFb: 0.45,
  fm: [
    `@7 v12 L ${bassOf(pe, 'long')} ${bassOf(pe, 'half')}`,
    `@2 v11 y7 L o5 f+4. e8 d4 a4 | b2 a4 g4 | f+2 d4 e4 | e1 | d4. e8 f+4 b4 | a2 g4 f+4 | e2 f+4 g4 | a1 @3 v12 o5 a4. g8 f+4 >d4 | <b2 >c+4 d4 | c+2 <b4 a4 | f+1 | g4. a8 b4 >d4 | e2 d4 c+4 | d2 e2 | e1`,
    `@1 v9 y3 L ${padOf(pe, 0)} ${padOf(pe, 0)}`,
    `@1 v9 y3 L ${padOf(pe, 1)} ${padOf(pe, 1)}`,
    `@9 v8 y3 L ${padOf(pe, 2)} ${padOf(pe, 2)}`,
    `@11 v7 y7 L ${arpOf(pe, 'sparse')} ${arpOf(pe, 'eighth')}`,
  ],
  pcm: [`v8 L ${rests(8)} ${rep('K4 r8 H8 S4 r8 H8', 8)}`],
};

let cache = null;
export function getSongs() {
  if (cache) return cache;
  cache = {};
  for (const [id, def] of Object.entries(SONG_DEFS)) cache[id] = song(def);
  return cache;
}
export const SONG_ORDER = ['title', 'stage1', 'stage2', 'stage3', 'stage4', 'boss', 'final', 'clear', 'gameover', 'ending'];
