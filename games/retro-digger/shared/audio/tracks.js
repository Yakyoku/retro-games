// 曲データ（すべて今回の書き下ろし。既存のゲーム曲の旋律は使っていない）。
// 3 声（主旋律・副旋律・ベース）で書く。これは原作の基板（3 音）と同じ声部数。
// 各チャンネル: mml と初期値（w 波形, v 音量, q 発音の長さ, o 音域, l 既定音価）と
//   decay（音量の減り方 / 秒）, sus（減衰の下限）, vib（ビブラートの深さ・半音）, pan。
import { parseMML, nm, BAR, PPQ } from './mml.js';

const join = (a) => a.join(' | ') + ' |';
// 和音を 16 分で上下に転がす（半小節 = 8 音）
const arp = (r, iv) => [0, 1, 2, 3, 2, 1, 0, 1].map((k) => nm(r + [0, iv[0], iv[1], 12][k], 16)).join(' ');
// 8 分で 1 オクターブを跳ねるベース（半小節）
const hop = (r) => `${nm(r, 8)} ${nm(r + 12, 8)} ${nm(r, 8)} ${nm(r + 12, 8)}`;
// 8 分で押し込むベース（半小節）
const drive = (r) => `${nm(r, 8)} ${nm(r, 8)} ${nm(r + 12, 8)} ${nm(r, 8)}`;
// 裏拍の刻み（1 小節。前半と後半で和音を変えられる）
const stab = ([a, b], [c, d]) => `r8 ${nm(a, 8)} r8 ${nm(b, 8)} r16 ${nm(c, 16)} ${nm(d, 8)} r8 ${nm(c, 8)}`;
// 分散和音（半小節 = 8 分 4 つ）
const broken = (r, third) => `${nm(r, 8)} ${nm(r + 7, 8)} ${nm(r + 12 + third, 8)} ${nm(r + 7, 8)}`;

const MEL = { w: 0, v: 12, q: 5, decay: 9, sus: 7, vib: 0.12, pan: 0.12 };
const CTR = { w: 4, v: 8, q: 3, decay: 14, sus: 3, vib: 0, pan: -0.22 };
const BAS = { w: 6, v: 13, q: 5, decay: 10, sus: 8, vib: 0, pan: 0 };

const SONGS = {
  // 土の層: ハ長調。はずむ 8 分の主旋律と裏拍の刻み。
  'stage-soil': {
    bpm: 168, loop: true, gated: true,
    ch: [
      { ...MEL, o: 5, mml: join([
        'c e g e f a g r', 'e g >c< b a16 b16 a g r', 'a g f e d f e c', 'd e d <b> c4 r4',
        'c e g e a >c< b r', 'g b >d c< b16 >c16< b a r', 'f a g f e g f d', 'e d c <b> c4 r4']) },
      { ...CTR, o: 4, mml: join([
        'r e r g r a r g', 'r e r g r f r d', 'r f r a r g r e', 'r f r d r e r g',
        'r e r g r a r g', 'r d r g r e r a', 'r f r a r d r f', 'r f r d r e r g']) },
      { ...BAS, o: 3, mml: join([
        'c g >c< g f a >c< a', 'c g >c< g <g> d g d', 'f >c f c< c g >c< g', '<g> d g d c g >c< g',
        'c g >c< g <a> e a e', '<g> d g d <a> e a e', 'f >c f c< d a >d< a', '<g> d g b >c< c c4']) },
    ],
  },
  // 水晶の層: イ短調。長めの音の主旋律にきらきらした 16 分のアルペジオ。
  'stage-crystal': {
    bpm: 152, loop: true, gated: true,
    ch: [
      { ...MEL, w: 1, v: 11, q: 6, o: 5, vib: 0.18, mml: join([
        'e4. d8 c8 d8 e8 a8', 'g4 e8 d8 e4 r4', 'f4. e8 d8 e8 f8 >c8<', 'b4 a8 g+8 a4 r4',
        'e4. d8 c8 d8 e8 a8', '>c4< b8 a8 g4 e8 g8', 'f8 a8 >c8< b8 a8 g8 f8 e8', 'd8 c8 <b8 g+8> a4 r4']) },
      { ...CTR, w: 5, v: 6, q: 4, decay: 20, sus: 2, mml: join([
        [[57, [3, 7]], [57, [3, 7]]], [[60, [4, 7]], [60, [4, 7]]], [[62, [3, 7]], [62, [3, 7]]], [[64, [4, 7]], [57, [3, 7]]],
        [[57, [3, 7]], [57, [3, 7]]], [[57, [3, 7]], [60, [4, 7]]], [[65, [4, 7]], [65, [4, 7]]], [[64, [4, 7]], [57, [3, 7]]],
      ].map(([a, b]) => arp(...a) + ' ' + arp(...b))) },
      { ...BAS, q: 4, mml: join([[45, 45], [48, 48], [50, 50], [40, 45], [45, 45], [45, 48], [41, 41], [40, 45]]
        .map(([a, b]) => hop(a) + ' ' + hop(b))) },
    ],
  },
  // 火山の層: ニ短調。速く押し込むベースとのこぎり寄りの主旋律。
  'stage-volcano': {
    bpm: 176, loop: true, gated: true,
    ch: [
      { ...MEL, w: 2, v: 12, q: 6, o: 5, mml: join([
        'd8 f8 a8 >d8< c+8 d8 a4', 'g8 f8 e8 f8 d4 r4', 'b-8 a8 g8 f8 g8 a8 b-8 >d8<', 'c+4 e8 c+8 <a4> r4',
        'd8 f8 a8 >d8< c+8 d8 a4', '>f8 e8 d8 c8< b-8 a8 g4', 'f8 g8 a8 b-8 >c8 d8 c8< b-8', 'a8 g8 f8 e8 c+4 <a4>']) },
      { ...CTR, v: 7, mml: join([
        [[65, 69], [65, 69]], [[67, 70], [65, 69]], [[65, 70], [65, 70]], [[64, 69], [69, 73]],
        [[65, 69], [65, 69]], [[65, 69], [67, 70]], [[65, 70], [67, 72]], [[64, 69], [69, 73]],
      ].map(([a, b]) => stab(a, b))) },
      { ...BAS, q: 4, mml: join([[38, 38], [43, 38], [46, 46], [45, 45], [38, 38], [38, 43], [46, 48], [45, 45]]
        .map(([a, b]) => drive(a) + ' ' + drive(b))) },
    ],
  },
  // タイトル: ト長調。行進風の明るい 8 小節（歩きに連動しない）。
  title: {
    bpm: 138, loop: true, gated: false,
    ch: [
      { ...MEL, q: 6, o: 4, mml: join([
        'g4 b8 >d8 g4 d8 <b8', '>c4 e8 c8 <a4 r4', 'b8 >d8 g8 d8 e8 d8 c8 <b8', 'a8 b8 >c8< a8 f+4 d4',
        'g4 b8 >d8 g4 d8 <b8', '>c4 e8 g8 f+4 e8 d8 <', 'b8 >d8 c8 <a8 b8 g8 a8 f+8', 'g4 d4 g4 r4']) },
      { ...CTR, w: 3, v: 7, q: 7, decay: 3, sus: 4, o: 4, mml: join([
        'd2 d2', 'e2 e2', 'd2 e2', 'e2 d2', 'd2 d2', 'e2 d2', 'd2 c2', 'd4 <b4 g4> r4']) },
      { ...BAS, o: 3, l: 4, mml: join([
        'g d b d', 'c g a e', 'g d c e', 'a e d f+', 'g d b d', 'c e d f+', 'g b a d', 'g d g r']) },
    ],
  },
  // 練習面: ヘ長調。正弦寄りの穏やかな旋律（歩きに連動しない）。
  tutorial: {
    bpm: 104, loop: true, gated: false,
    ch: [
      { ...MEL, w: 7, v: 10, q: 7, decay: 3, sus: 6, vib: 0.15, o: 5, mml: join([
        'f4 a4 >c2<', 'b-4 a4 g2', 'a4 g4 f4 d4', 'e2. r4', 'f4 a4 >c4 d4', '<b-4 g4 >c2<', 'a4 g4 f4 e4', 'f2. r4']) },
      { ...CTR, w: 3, v: 6, q: 8, decay: 6, sus: 3, mml: join([
        [53, 4, 53, 4], [46, 4, 48, 4], [53, 4, 50, 3], [48, 4, 48, 4], [53, 4, 53, 4], [43, 3, 48, 4], [53, 4, 48, 4], [53, 4, 53, 4],
      ].map(([a, x, b, y]) => broken(a, x) + ' ' + broken(b, y))) },
      { ...BAS, v: 10, q: 7, decay: 4, o: 3, mml: join([
        'f2 f2', '<b-2> c2', 'f2 d2', 'c2 c2', 'f2 f2', '<g2> c2', 'f2 c2', 'f2. r4']) },
    ],
  },
};

// ジングル（1 回だけ鳴る短い曲）
const JINGLE_SRC = {
  start: { bpm: 168, ch: [
    { ...MEL, w: 0, q: 6, o: 5, mml: 'c8 e8 g8 >c8< g8 >c8 e4 | d8 c8 d8 e8 c4. r8 |' },
    { ...CTR, w: 3, q: 6, o: 4, l: 4, mml: 'e g e g | f g e r |' },
    { ...BAS, o: 3, l: 4, mml: 'c g c g | <g b >c r |' }] },
  clear: { bpm: 160, ch: [
    { ...MEL, w: 1, q: 6, o: 5, mml: 'g8 a8 g8 e8 >c4< b8 >d8 | c4. r8' },
    { ...CTR, w: 3, q: 7, o: 4, mml: 'e4 e4 g4 f4 | e4. r8' },
    { ...BAS, o: 3, mml: 'c4 c4 e4 g4 | c4. r8' }] },
  miss: { bpm: 150, ch: [
    { ...MEL, w: 0, q: 5, o: 5, vib: 0, mml: 'b8 g8 a+8 f+8 a8 f8 g+8 e8 | <b8 >e8 r4' },
    { ...CTR, mml: 'r1 | r2' },
    { ...BAS, o: 3, l: 4, mml: 'e d+ d c+ | <b8 >e8 r4' }] },
  gameover: { bpm: 150, ch: [
    { ...MEL, w: 4, q: 7, o: 5, decay: 4, vib: 0.2, mml: '>c4< b4 a4 g+4 | f8 e8 d8 <b8 a2> |' },
    { ...CTR, w: 3, q: 7, o: 4, decay: 4, mml: 'e2 e2 | f4 d4 c2 |' },
    { ...BAS, o: 3, q: 7, decay: 4, mml: 'a2 e2 | d2 <a2> |' }] },
  allclear: { bpm: 160, ch: [
    { ...MEL, w: 0, q: 6, o: 5, mml: 'g8 g8 g8 >c4< g8 >c8 e8 | d4 c8 d8 e4 g4 | c2 r2 |' },
    { ...CTR, w: 3, q: 7, o: 4, l: 4, mml: 'e e e g | f f g b | >c2< r2 |' },
    { ...BAS, o: 3, l: 4, mml: 'c g c e | f a g <g> | c2 r2 |' }] },
  highscore: { bpm: 144, ch: [
    { ...MEL, w: 1, q: 5, o: 5, mml: 'e8 g8 a8 g8 >c8< a8 g8 e8 | f8 a8 g8 f8 e4 c4 |' },
    { ...CTR, q: 4, o: 4, l: 4, mml: 'e e f e | c c e e |' },
    { ...BAS, o: 3, l: 4, mml: 'c g f g | f a c <c> |' }] },
};

function compile(src, loop) {
  const ch = src.ch.map(({ mml, ...p }) => ({ ...p, ...parseMML(mml, p) }));
  const ticks = Math.max(...ch.map((c) => c.ticks));
  return { bpm: src.bpm, loop, gated: !!src.gated, ch, ticks, seconds: (ticks * 60) / (src.bpm * PPQ) };
}
export const TRACKS = Object.fromEntries(Object.entries(SONGS).map(([k, v]) => [k, compile(v, true)]));
export const JINGLES = Object.fromEntries(Object.entries(JINGLE_SRC).map(([k, v]) => [k, compile(v, false)]));
export const JINGLE_TAIL = 0.12; // 最後の音が消えるまでの余白（秒）
export { BAR, PPQ };
