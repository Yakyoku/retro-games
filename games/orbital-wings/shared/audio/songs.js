// ORBITAL WINGS — 曲データ（すべてこの作品のための書き下ろし。既存のゲーム曲の旋律は使っていない）
//
// ■ 記法（MML 風。mml.js が読む）
//   曲 = { title, tempo: BPM, loop: true/false, tracks: { A0, A1, A2 または D, W0, W1 } }
//     A0 A1 A2 … PSG-A の矩形波 3 音   D … PSG-A の 3 音目をノイズ打楽器として使う（A2 と同時には書けない）
//     W0 W1    … 波形メモリ音源 2 音（32 サンプル × 4bit の波形は WAVES から音色で選ぶ）
//   4 分音符 = 24 tick、1 小節（4/4）= 96 tick。進行は 1/60 秒ごと（フレーム単位、当時のドライバと同じ）。
//   c d e f g a b   音名。+ か # で半音上げ、- で半音下げ。後ろに長さ（1 2 3 4 6 8 12 16 24 32 48）と付点 .
//                   例 c+8.  長さを書かなければ l の値。%n で tick 数を直接（例 c%10）
//   r               休符（長さの書き方は音と同じ）
//   ^               直前の音（休符）を延ばす  例 c4^16
//   &               音のすぐ後に書くと、次の音を弾き直さずつなぐ（レガート）
//   o4 < >          オクターブ（o4 の c が真ん中のド = MIDI 60）。< で下、> で上
//   l8              既定の長さ        v0〜15  音量         q1〜8  音を鳴らす割合（8 分の q）
//   @lead           音色（INSTRUMENTS の名前）
//   X0,4,7          以後の音を 1 フレームごとに 0,4,7 半音ずらしてアルペジオ（X0 か X だけで解除）
//   k-5             以後の音を半音単位で移調        D10  以後の音をセント単位でずらす
//   [ ... ]3        3 回くり返す（入れ子可）。[A:B]3 は A B A B A（最後の回は : で抜ける）
//   L               ループ点（ループする曲は全トラックの同じ小節の頭に置く）
//   |               小節線。ここで 1 小節がちょうど 96 tick か点検される
//   打楽器トラック D: k=バス s=スネア h=クローズドハット o=オープンハット x=クラッシュ t=高いタム u=低いタム j=リム
//
// ■ 決まり（tests/audio.test.js が確かめる）
//   - 1 曲のトラックはすべて同じ長さ、ループ点も同じ位置
//   - 小節線の間はちょうど 1 小節
//   - 音域は PSG・波形メモリの周期レジスタで表せる範囲
//
// ■ 曲を足すには: SONGS に 1 曲足して、node --test tests/audio.test.js と node tools/render-audio.js で確かめる。

const B = (...bars) => bars.join(' | ') + ' |';
const rep = (n, s) => Array(n).fill(s).join(' | ');

// ---------------------------------------------------------------- 波形メモリ（32 サンプル × 4bit）
function wave(fn) {
  const raw = Array.from({ length: 32 }, (_, i) => fn(i / 32));
  const lo = Math.min(...raw), hi = Math.max(...raw);
  return raw.map((v) => Math.max(0, Math.min(15, Math.round((v - lo) / (hi - lo || 1) * 15))));
}
const S = (k, p) => Math.sin(2 * Math.PI * k * p);
export const WAVES = {
  bass: wave((p) => 0.65 * (1 - 2 * p) + 0.35 * (p < 0.5 ? 1 : -1)),        // のこぎり + 矩形（太いベース）
  saw: wave((p) => 1 - 2 * p),
  tri: wave((p) => (p < 0.5 ? 4 * p - 1 : 3 - 4 * p)),
  organ: wave((p) => S(1, p) + 0.5 * S(2, p) + 0.3 * S(4, p)),
  bell: wave((p) => S(1, p) + 0.45 * S(3, p + 0.1) + 0.3 * S(5, p)),
  hollow: wave((p) => S(1, p) + 0.6 * S(3, p)),                              // 奇数倍音（うつろな音）
  sine: wave((p) => S(1, p)),
  pulse: wave((p) => (p < 0.25 ? 1 : 0)),
};

// ---------------------------------------------------------------- 音色
// env: キーオン中のフレームごとの音量（最後の値を保つ） rel: キーオフ後に 1 フレームで下げる量
// vib: [始まるまでのフレーム, 深さ(セント), 1 周のフレーム]  bend: [始めのずれ(セント), 戻るまでのフレーム]
// wave: 波形メモリの波形（W トラック用） arpRate: X アルペジオを何フレームごとに進めるか
export const INSTRUMENTS = {
  lead: { env: [13, 15, 15, 14, 14, 13, 13, 12], rel: 2, vib: [16, 22, 6] },
  lead_s: { env: [15, 14, 13, 12, 11, 10, 10, 9, 9, 8, 8, 7], rel: 3, vib: [20, 16, 6] },
  brass: { env: [10, 13, 15, 15, 14, 14, 13, 13, 12], rel: 2, vib: [14, 24, 6], bend: [-70, 4] },
  arp: { env: [12, 12, 11, 11, 10, 10, 9, 9, 8], rel: 3, arpRate: 1 },
  parp: { env: [6, 8, 9, 10, 10, 10, 9], rel: 1, arpRate: 1 },
  pluck: { env: [14, 12, 10, 9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0], rel: 3 },
  pad: { env: [6, 8, 9, 10, 11, 11, 11, 10], rel: 1, vib: [20, 12, 8] },
  bass: { wave: 'bass', env: [15, 15, 14, 14, 13, 13, 12, 12, 12, 11], rel: 4 },
  bassp: { wave: 'bass', env: [15, 14, 13, 12, 11, 10, 10, 9, 9, 8, 8, 7], rel: 4 },
  wsaw: { wave: 'saw', env: [10, 12, 13, 13, 12], rel: 2, vib: [20, 15, 7] },
  worgan: { wave: 'organ', env: [9, 11, 12, 12, 12, 11], rel: 2, vib: [22, 14, 7] },
  wbell: { wave: 'bell', env: [14, 13, 12, 11, 10, 9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0], rel: 3 },
  weerie: { wave: 'hollow', env: [8, 11, 13, 14, 14, 13], rel: 1, vib: [10, 45, 11] },
  wtri: { wave: 'tri', env: [15, 15, 14, 14, 13], rel: 3 },
};

// ---------------------------------------------------------------- 打楽器（フレームごとの [トーン周期, ノイズ周期, 音量]、0 = 使わない）
const tp = (hz) => Math.round(1789772 / (16 * hz));
function sweep(n, f0, f1, vols, noise0 = 0) {
  return Array.from({ length: n }, (_, i) => [tp(f0 * Math.pow(f1 / f0, i / (n - 1))), i === 0 ? noise0 : 0, vols[i] ?? 0]);
}
export const DRUMS = {
  k: sweep(8, 170, 48, [15, 15, 14, 12, 10, 7, 4, 2], 0),
  s: [[tp(210), 6, 15], [tp(180), 7, 14], [0, 8, 12], [0, 8, 11], [0, 9, 9], [0, 9, 8], [0, 9, 7], [0, 10, 5], [0, 10, 4], [0, 10, 3], [0, 10, 2], [0, 10, 1]],
  h: [[0, 1, 11], [0, 1, 8], [0, 1, 5], [0, 1, 2]],
  o: [[0, 1, 11], [0, 1, 10], [0, 1, 10], [0, 1, 9], [0, 1, 8], [0, 1, 7], [0, 1, 6], [0, 1, 5], [0, 1, 4], [0, 1, 3], [0, 1, 2], [0, 1, 1]],
  x: Array.from({ length: 48 }, (_, i) => [0, i < 3 ? 1 : 2, Math.max(0, Math.round(14 - i * 0.3))]),
  t: sweep(10, 240, 150, [14, 14, 13, 12, 11, 9, 7, 5, 3, 1]),
  u: sweep(11, 160, 95, [15, 14, 13, 12, 11, 9, 7, 5, 4, 2, 1]),
  j: [[tp(900), 3, 11], [0, 3, 8], [0, 3, 4], [0, 3, 1]],
};

// ---------------------------------------------------------------- 曲を書く手伝い
// X つき和音の打ち方: chord('X0,3,7', 'o3 f+', '8 8 8 8 8 8 8 8') → 指定の長さで和音の根音を打つ
const hits = (x, note, lens) => `${x} ` + lens.split(' ').map((l) => (l[0] === 'r' ? l : note + l)).join(' ');
// 低音: ルートとオクターブ上を交互に（8 分）
const octBass = (o, n) => `o${o} [${n}8 >${n}8<]4`;

// ================================================================ 曲
export const SONGS = {};

// ---------------- title: 待機画面の短い曲（D メジャー、1 回だけ）
SONGS.title = {
  title: 'ORBITAL WINGS', tempo: 140, loop: false,
  tracks: {
    A0: '@lead v14 o5 l8 ' + B('d4. e f+ a >d4<', '>c+4.< b a4 f+4', 'g4. a b4 >d4<', '>c+4.< b a4 e4',
      'f+4. g a4 b4', '>d4. c+< b4 g4', 'a2 >c+2<', '>e2 d4 c+4<', '>d1<'),
    A1: '@arp v9 l8 q6 ' + B(hits('X0,4,7', 'o4 d', '8 8 8 8 8 8 8 8'), hits('X0,4,7', 'o4 d', '8 8 8 8 8 8 8 8'),
      hits('X0,4,7', 'o3 g', '8 8 8 8 8 8 8 8'), hits('X0,4,7', 'o3 a', '8 8 8 8 8 8 8 8'),
      hits('X0,3,7', 'o3 b', '8 8 8 8 8 8 8 8'), hits('X0,4,7', 'o3 g', '8 8 8 8 8 8 8 8'),
      hits('X0,4,7', 'o3 a', '8 8 8 8 8 8 8 8'), hits('X0,4,7,10', 'o3 a', '8 8 8 8 8 8 8 8'), 'q8 X0,4,7 o4 d1'),
    W0: '@bass v15 ' + B(octBass(2, 'd'), octBass(2, 'd'), octBass(2, 'g'), octBass(2, 'a'), octBass(1, 'b'), octBass(2, 'g'), octBass(2, 'a'), octBass(2, 'a'), 'o2 d1'),
    W1: '@worgan v10 o4 l2 ' + B('f+ a', 'f+ a', 'g b', 'e a', 'f+ d', 'g b', 'e a', 'g a', 'f+1'),
    D: 'v12 l8 ' + B(...Array(7).fill('k h s h k k s h'), 'k h s h s16 s16 s16 s16 t16 t16 u16 u16', 'x1'),
  },
};

// ---------------- start: 出撃のファンファーレ（B♭ メジャー）
SONGS.start = {
  title: 'Launch', tempo: 160, loop: false,
  tracks: {
    A0: '@brass v15 o5 l8 ' + B('f f16 f16 b- >d4< b- >d f<', '>e-4. d c4 e-4<', '>d2.< r4'),
    A1: '@brass v11 o5 l8 ' + B('d d16 d16 f b-4 f b- >d<', '>c4.< b- a4 >c4<', 'b-2. r4'),
    W0: '@bass v15 l4 ' + B('o1 b- >b-< b- >b-<', 'o2 e- >e-< f >f<', 'o1 b-2. r4'),
    W1: '@worgan v10 o4 l2 ' + B('f f', 'g a', 'f2. r4'),
    D: 'v13 ' + B('s16 s16 s16 s16 s8 s8 s16 s16 s16 s16 s8 x8', 'k8 h8 s8 h8 k8 k8 s16 s16 s16 s16', 'x2. r4'),
  },
};

// ---------------- stage1 火山: 勇ましく前へ進む（A メジャー、152）
{
  const lead = B(
    'a4 e8. a16 b >c+ d e<', '>e4 d c+< b4 g+4', 'f+4. d f+ a >d c+<', 'b2 r e f+ g+',
    'a4. g+ f+ e c+ e', 'f+4 a4 >d4 c+ <b', 'b4. a f+ d f+ a', 'g+2. e16 f+16 g+16 b16',
    'a4 e8. a16 b >c+ d e<', '>e4 d c+< b4 >c+4<', '>d4. c+< b a f+ a', 'g+4. f+ e4 g+4',
    'a4. g+ a b >c+ e<', '>f+4. e d c+ d e<', '>e4 d c+< b4 >c+< b', 'a2. r4',
    'a2 f+4 a4', 'b2. g+4', '>c+4.< b g+4 e4', 'f+2. r f+16 a16',
    '>d2< b4 >d4<', '>c+2.< g+ >c+<', '>d4 e4 f+4 a4<', '>g+2.< r16 e16 f+16 g+16');
  const p8 = '8 8 8 8 8 8 8 8', sy = 'r8 4 8 r8 4 8';
  const A = [['X0,4,7', 'o3 a'], ['X0,3,7', 'o4 c+'], ['X0,4,7', 'o4 d'], ['X0,4,7', 'o4 e'], ['X0,3,7', 'o3 f+'], ['X0,4,7', 'o4 d'], ['X0,3,7', 'o3 b'], ['X0,4,7', 'o4 e']];
  const A2 = [...A.slice(0, 6), ['X0,4,7', 'o4 e'], ['X0,4,7', 'o3 a']];
  const Bs = [['X0,4,7', 'o4 d'], ['X0,4,7', 'o4 e'], ['X0,3,7', 'o4 c+'], ['X0,3,7', 'o3 f+'], ['X0,3,7', 'o3 b'], ['X0,3,7', 'o4 c+'], ['X0,4,7', 'o4 d'], ['X0,4,7', 'o4 e']];
  const bassA = [octBass(2, 'a'), octBass(3, 'c+'), octBass(3, 'd'), octBass(3, 'e'), octBass(2, 'f+'), octBass(3, 'd'), octBass(2, 'b'), octBass(3, 'e')];
  const bassA2 = [...bassA.slice(0, 6), octBass(3, 'e'), octBass(2, 'a')];
  SONGS.stage1 = {
    title: 'Magma Run', tempo: 152, loop: true,
    tracks: {
      A0: '@lead v14 o5 l8 ' + B('r1', 'r2 <e16 f+16 g+16 a16 b16 >c+16 d16 e16') + ' L ' + lead,
      A1: '@arp v9 l8 q5 ' + B(hits('X0,4,7', 'o3 a', p8), hits('X0,4,7', 'o4 e', p8)) + ' L ' +
        B(...A.map(([x, n]) => hits(x, n, p8)), ...A2.map(([x, n]) => hits(x, n, p8)), ...Bs.map(([x, n]) => 'q4 ' + hits(x, n, sy) + ' q5')),
      W0: '@bass v15 l8 ' + B(octBass(2, 'a'), octBass(2, 'e')) + ' L ' + B(...bassA, ...bassA2,
        'o3 d d d d d d e f+', 'o3 e e e e e e f+ g+', 'o3 c+ c+ c+ c+ c+ c+ <b >c+', 'o2 f+ f+ f+ f+ f+ f+ e f+',
        'o2 b b b b b b a b', 'o3 c+ c+ c+ c+ c+ c+ d e', 'o3 d d d d e e e e', 'o3 e e e e e e d c+'),
      W1: '@worgan v10 o4 l2 ' + B('r1', 'r1') + ' L ' + B('c+ e', 'g+ e', 'f+ a', 'g+ b', 'a f+', 'f+ d', 'd f+', 'e g+',
        'c+ e', 'g+ e', 'f+ a', 'g+ b', 'a f+', 'f+ d', 'g+ b', 'a e',
        'l4 d f+ a f+', 'e g+ b g+', 'e g+ >c+< g+', 'f+ a >c+< a', 'f+ b >d< b', 'g+ >c+ e c+<', 'a f+ d f+', 'g+ b >e< b'),
      D: 'v13 l8 ' + B('k h s h k k s16 s16 s16 s16', 'k h s h k s16 s16 t16 t16 u16 u16') + ' L ' +
        '[x h s h k k s h | [k h s h k k s h |]2 k h s h k s16 s16 s16 t16 u16 u16 |]6',
    },
  };
}

// ---------------- stage2 遺跡: 神秘的（D マイナー、138）
{
  const ch = { Dm: '[dfa>d<]4', C: '[ceg>c<]4', Bb: '[<b->dfb-]4', A: '[<a>c+ea]4', F: '[cfa>c<]4', G: '[<gb>dg]4', Gm: '[<gb->dg]4' };
  const prog = ['Dm', 'Dm', 'C', 'C', 'Bb', 'Bb', 'A', 'A', 'Dm', 'F', 'G', 'Dm', 'Gm', 'Bb', 'C', 'A', 'Bb', 'C', 'Dm', 'A'];
  const bp = (o, n) => `o${o} ${n}4. ${n} >${n}< ${n} ${n}4`;
  SONGS.stage2 = {
    title: 'Sunken Ruins', tempo: 138, loop: true,
    tracks: {
      A0: '@lead v13 o5 l8 ' + B('r1', 'r1') + ' L ' + B('a2. g f', 'e4. f d2', 'e2. d c', '<b4. >c <g2>', 'd2. c <b->', 'f4. g d2',
        'e2 c+4 e4', 'a2 r4 a b', '>c4< a f a4 >d4<', '>c2.< a >c<', 'b4 g d g4 b4', 'a2. r4',
        'b-4 g d g4 b-4', '>d2.< b- >d<', '>e4 d4 c4< b-4', '>c+2.< r4', 'f4 g4 a4 b-4', '>c4 d4 e4 g4<', '>f2 e4 d4<', '>c+2 e2<'),
      A1: '@pluck v8 o4 l16 ' + B(ch.Dm, ch.Dm) + ' L ' + B(...prog.map((c) => ch[c])),
      W0: '@bassp v15 l8 ' + B(bp(2, 'd'), bp(2, 'd')) + ' L ' + B(bp(2, 'd'), 'o2 d4. d >d< d c4', bp(2, 'c'), bp(2, 'c'), bp(1, 'b-'), bp(1, 'b-'),
        bp(1, 'a'), 'o1 a4. a >a< a >e4', bp(2, 'd'), bp(2, 'f'), bp(2, 'g'), bp(2, 'd'), bp(2, 'g'), bp(1, 'b-'), bp(2, 'c'), bp(1, 'a'),
        bp(1, 'b-'), bp(2, 'c'), bp(2, 'd'), 'o1 a4. a >a< a >c+4'),
      W1: '@worgan v9 o4 l2 ' + B('r1', 'r1') + ' L ' + B('f1', 'f1', 'e1', 'e1', 'd1', 'd1', 'c+1', 'e1',
        'f a', 'a f', 'g b', 'f d', 'd g', 'f b-', 'g e', 'e c+', 'd1', 'e1', 'f a', 'e c+'),
      D: 'v11 l8 ' + B('r1', 'r2 h h h h') + ' L ' + '[[k4 h h j h k h |]3 k4 h h j j16 j16 t16 t16 u16 u16 |]5',
    },
  };
}

// ---------------- stage3 巨大石像: 厳かだが速い（C マイナー、160）
{
  // [和音, 旋律] 旋律の下に 4 度下（G 和音の小節は 1 オクターブ下）を重ねて、古い聖歌のような厳かさを出す
  const bars = [
    ['Cm', 'c2 g2'], ['Ab', 'a-2. g8 f8'], ['Bb', 'f2 d2'], ['Gm', 'g1'],
    ['Cm', '>c2< b-4 g4'], ['Ab', 'a-2. >c4<'], ['Fm', 'b-2 a-4 f4'], ['G', 'g2 <b4 >d4'],
    ['Ab', 'e-2. c8 e-8'], ['Bb', 'f2. d8 f8'], ['Gm', 'g2 b-2'], ['Cm', '>c1<'],
    ['Fm', '>c2< a-4 f4'], ['Bb', 'b-2 >d2<'], ['Eb', '>e-2. d8 c8<'], ['G', 'b2 >d2<'],
    ['Cm', '>g2. f8 e-8<'], ['Bb', '>d2 f2<'], ['Ab', '>e-2. d8 c8<'], ['G', 'b2 g2'],
    ['Cm', '>c2. d8 e-8<'], ['Bb', '>f2 d2<'], ['Ab', '>e-2 c2<'], ['G', 'd2 <b2>'],
  ];
  const root = { Cm: 'o2 c', Ab: 'o1 a-', Bb: 'o1 b-', Gm: 'o1 g', Fm: 'o1 f', G: 'o1 g', Eb: 'o2 e-' };
  const trip = { Cm: '[ce-g]4', Ab: '[ce-a-]4', Bb: '[dfb-]4', Gm: '[dgb-]4', Fm: '[cfa-]4', G: '[dgb]4', Eb: '[e-gb-]4' };
  const gal = (c) => { const [o, n] = root[c].split(' '); return `${o} [${n}16 ${n}16 >${n}8<]4`; };
  SONGS.stage3 = {
    title: 'Colossus', tempo: 160, loop: true,
    tracks: {
      A0: '@brass v14 o5 l4 ' + B('r1', 'r1') + ' L ' + B(...bars.map(([, m]) => m)),
      A1: '@pad v11 o5 l4 ' + B('r1', 'r1') + ' L ' + B(...bars.map(([c, m]) => `${c === 'G' ? 'k-12' : 'k-5'} ${m}`)),
      W0: '@bassp v15 ' + B(gal('Cm'), gal('Cm')) + ' L ' + B(...bars.map(([c]) => gal(c))),
      W1: '@wbell v8 o4 l12 ' + B('r1', 'r1') + ' L ' + B(...bars.map(([c]) => trip[c])),
      D: 'v12 l16 ' + B('k8 r8 k8 r8 k8 r8 k k k k', 's s s s s s s s t t t t u u u u') + ' L ' +
        '[x h h h s h k h k h h k s h h h | [k h h h s h k h k h h k s h h h |]2 k h h h s h k h s s s s t t u u |]6',
    },
  };
}

// ---------------- stage4 地形の難所: 緊張・シンコペーション（F♯ マイナー、146）
{
  const lead = B(
    'f+8 r f+ a8 f+8 r >c+8. <b8 a8', 'g+8 a8 r g+ f+8 e4 r8 c+8', 'f+8 r f+ a8 f+8 r >d8. c+8 <a8', 'b8 g+8 r e g+8 b4 r8 >c+8<',
    '>c+8 r c+ e8 c+8 r <a8. b8 >c+8<', 'a8 g+8 r f+ e8 f+4 r8 c+8', 'd8 f+8 b8 >d8 c+8 <b8 a8 f+8', 'e+4. g+8 >c+4 <b8 g+8',
    'a4. f+8 a8 >d4< c+8', 'b4. g+8 b8 >e4 d8<', '>c+2^8 <b8 a8 g+8', 'a2 f+4 e8 f+8',
    'a4. f+8 a8 >d4 e8<', '>f+4. e8 d8 c+4 <b8', '>c+4 <b8 g+8 e+4 g+8 b8', '>c+2 r4< g+8 >c+8<',
    'b8 r b >d8 <b8 a8 f+8 a8 b8', '>c+8 r c+ e8 c+8< b8 g+8 b8 >c+8<', '>d8 r d f+8 d8 c+8 <a8 >c+8 d8<', '>e8 r e g+8 e8 d8 <b8 >d8 e8<',
    '>f+4. e8 d4 c+8 <b8', '>c+4. <b8 g+4 e+4', 'f+8 r f+ a8 >c+8 r f+8. e8 c+8<', 'e+4 g+4 >c+4 <g+4');
  const C = { 'F#m': ['X0,3,7', 'o3 f+', 'f+'], D: ['X0,4,7', 'o4 d', 'd'], E: ['X0,4,7', 'o4 e', 'e'], Bm: ['X0,3,7', 'o3 b', 'b'],
    'C#': ['X0,4,7', 'o4 c+', 'c+'], 'C#7': ['X0,4,7,10', 'o4 c+', 'c+'], 'C#m': ['X0,3,7', 'o4 c+', 'c+'] };
  const prog = ['F#m', 'F#m', 'D', 'E', 'F#m', 'F#m', 'Bm', 'C#', 'D', 'E', 'F#m', 'F#m', 'D', 'E', 'C#7', 'C#7',
    'Bm', 'C#m', 'D', 'E', 'Bm', 'C#', 'F#m', 'C#'];
  const broot = { f: 'o2', d: 'o2', e: 'o2', b: 'o1', c: 'o2' };
  const sbass = (c) => { const n = C[c][2]; return `${broot[n[0]]} ${n}8. ${n}8. >${n}8< ${n}8. ${n}8. >${n}8<`; };
  const stab = (c, i) => (i >= 8 && i < 16 ? hits(C[c][0], C[c][1], '8. 8. 8 8. 8. 8') : hits(C[c][0], C[c][1], '4. 4. 4'));
  SONGS.stage4 = {
    title: 'Gauntlet', tempo: 146, loop: true,
    tracks: {
      A0: '@lead_s v14 o5 l16 ' + B('r1', 'r1') + ' L ' + lead,
      A1: '@arp v9 q3 ' + B(stab('F#m', 0), stab('F#m', 0)) + ' L ' + B(...prog.map(stab)),
      W0: '@bassp v15 ' + B(sbass('F#m'), sbass('F#m')) + ' L ' + B(...prog.map(sbass)),
      W1: '@wsaw v9 o4 l2 ' + B('r1', 'r1') + ' L ' + B('c+1', 'c+ d', 'd f+', 'e g+', 'a1', 'a g+', 'f+1', 'e+1',
        'f+1', 'g+1', 'a g+', 'f+ e', 'f+1', 'g+1', 'e+1', 'g+1',
        'f+ d', 'e g+', 'a f+', 'g+ b', 'f+ d', 'e+ g+', 'a c+', '<b >e+'),
      D: 'v12 l16 ' + B('h8 h8 h8 h8 h8 h8 h8 h8', 'h8 h8 h8 h8 s s s s t t u u') + ' L ' +
        '[x8. k s8 h8 k k8 h s8 h8 | [k8. k s8 h8 k k8 h s8 h8 |]2 k8. k s8 h8 k k8 s s s t u |]6',
    },
  };
}

// ---------------- stage5 生体要塞: 不気味な半音階（B♭ マイナー、132）
{
  // [A1 の和音(X, 根音), 低音の根音(オクターブ, 音), A0 のしずく 2 音]
  const bars = [
    ['X0,3,7', 'o3 b-', 1, 'b-', 'f', 'f'], ['X0,3,8', 'o3 a', 1, 'a', 'e', 'c'], ['X0,2,5,9', 'o3 a-', 1, 'a-', 'f', 'd-'], ['X0,3,6', 'o3 g', 1, 'g', 'e', 'd-'],
    ['X0,4,7', 'o3 g-', 1, 'g-', 'd-', 'g-'], ['X0,4,7', 'o3 f', 1, 'f', 'c', 'a'], ['X0,3,7', 'o3 b-', 1, 'b-', 'd-', 'f'], ['X0,4,7', 'o3 f', 1, 'f', 'c', 'e'],
    ['X0,3,7', 'o3 e-', 2, 'e-', 'g-', 'b-'], ['X0,4,8', 'o3 d', 2, 'd', 'f+', 'a'], ['X0,4,7', 'o3 d-', 2, 'd-', 'f', 'a-'], ['X0,3,6', 'o3 c', 2, 'c', 'g-', 'e-'],
    ['X0,4,7', 'o3 b', 1, 'b', 'f+', 'd+'], ['X0,3,7', 'o3 b-', 1, 'b-', 'f', 'd-'], ['X0,4,7', 'o3 g-', 1, 'g-', 'g-', 'd-'], ['X0,4,7', 'o3 f', 1, 'f', 'a', 'c'],
    ['X0,3,7', 'o3 b-', 1, 'b-', 'f', 'd-'], ['X0,4,7', 'o3 b', 1, 'b', 'f+', 'd+'], ['X0,3,7', 'o3 b-', 1, 'b-', 'f', 'e'], ['X0,3,6', 'o3 a', 1, 'a', 'e-', 'c'],
  ];
  const beat = (o, n) => `o${o} ${n}8 >${n}8< r4 ${n}8 >${n}8< r4`;
  SONGS.stage5 = {
    title: 'Biomass', tempo: 132, loop: true,
    tracks: {
      A0: '@pluck v9 l8 ' + B('r1', 'r1') + ' L ' + B(...bars.map((b) => `o6 r4 ${b[4]} r r4 ${b[5]} r`)),
      A1: '@parp v10 ' + B('X0,3,7 o3 b-1', 'X0,3,7 o3 b-1') + ' L ' + B(...bars.map((b) => `${b[0]} ${b[1]}1`)),
      W0: '@bass v14 ' + B(beat(1, 'b-'), beat(1, 'b-')) + ' L ' + B(...bars.map((b) => beat(b[2], b[3]))),
      W1: '@weerie v13 o5 l8 ' + B('r1', 'r1') + ' L ' + B('f2 g-4 f4', 'e2. r4', 'f4 a-4 d-4 c4', 'd-2. c <b>', '<b-2 >d-2', 'c2. <a b>', 'c4 d-4 <b4 b-4>', '<a2. r4>',
        'g-2 b-4 a4', 'a2. f+4', 'a-2 f4 a-4', 'g-2. e-4', 'f+2 d+4 f+4', 'f2. d-4', 'd-4 e-4 g-4 b-4', 'a1',
        'b-2 a2', 'b2 a+2', 'b-4 a4 a-4 g4', 'e-2 <a2>'),
      D: 'v11 l8 ' + B('r1', 'k k r4 r2') + ' L ' + '[[k k r4 j r h h |]3 k k r4 t16 t16 t16 t16 u16 u16 u16 u16 |]5',
    },
  };
}

// ---------------- stage6 細胞空間: 脈打つ・催眠的（E マイナー、128）
{
  const cell = { Em: '[eb>e<]5 b', C: '[eg>c<]5 g', Am: '[ea>c<]5 a', B7s: '[ef+a]5 f+', B: '[d+f+b]5 f+', G: '[dgb]5 g', D_F: '[df+a]5 f+', Bm: '[df+b]5 f+', D: '[df+a]5 f+' };
  const bell = { Em: 'g b', C: 'e g', Am: 'e a', B7s: 'e f+', B: 'd+ f+', G: 'd g', D_F: 'd f+', Bm: 'd f+', D: 'd a' };
  const root = { Em: 'o2 e', C: 'o2 c', Am: 'o1 a', B7s: 'o1 b', B: 'o1 b', G: 'o2 g', D_F: 'o2 f+', Bm: 'o1 b', D: 'o2 d' };
  const prog = ['Em', 'Em', 'C', 'C', 'Am', 'Am', 'B7s', 'B', 'G', 'D_F', 'Em', 'C', 'Am', 'Bm', 'C', 'D', 'Em', 'Em', 'C', 'C', 'Am', 'B', 'C', 'B'];
  const pulse = (c) => { const [o, n] = root[c].split(' '); return `${o} [${n}8 >${n}16< ${n}16]4`; };
  SONGS.stage6 = {
    title: 'Cell Space', tempo: 128, loop: true,
    tracks: {
      A0: '@lead v13 o5 l4 ' + B('r1', 'r1') + ' L ' + B('e b2 a', 'g f+2 g', 'e b2 a', 'g2. r', 'a >e2 d<', '>c <b2 a', 'b2 a2', '>d+1<',
        '>d4. <b8 g2', 'a4. f+8 d2', 'g4. b8 >e2<', '>e d c <b', '>c2 <a2', 'b2 f+2', 'g a b >c<', '>d2. <a',
        'b2. >c8 <b8', 'g1', 'e2. f+8 g8', 'g2 e2', 'a2. b8 >c8<', 'b1', '>c2 e2<', 'd+2 f+2'),
      A1: '@pluck v9 o4 l16 ' + B(cell.Em, cell.Em) + ' L ' + B(...prog.map((c) => cell[c])),
      W0: '@bassp v15 ' + B(pulse('Em'), pulse('Em')) + ' L ' + B(...prog.map(pulse)),
      W1: '@wbell v9 o5 l2 ' + B('r1', 'r1') + ' L ' + B(...prog.map((c) => bell[c])),
      D: 'v11 l8 ' + B('r1', 'k4 k4 k4 k4') + ' L ' + '[[k o k o k o k o |]3 k o k o k o k16 k16 o |]6',
    },
  };
}

// ---------------- stage7 機械要塞: 切迫・機械的（G マイナー、168）
{
  const A = ['g8 d8 g8 a8 b-8. a16 g8 b-8', '>d4 c8 <b-8 a4 g8 a8', 'b-8 g8 b-8 >c8 d8. c16 <b-8 >e-8<', '>d4 c8 <a8 f4 a8 >c8<',
    '>d8 <b-8 >d8 e-8 f8. e-16 d8 f8<', '>g4 f8 d8 e-4 d8 c8<'];
  const lead = B(...A, 'b-8 >c8 d8 e-8 d8 c8 <b-8 g8', 'f+2 a4 >c4<',
    '>c16 <b-16 >c16 d16 e-8 c8 <g8 >c8 e-8 g8<', '>f4 e-8 d8 e-4 c4<', 'b-16 a16 b-16 >c16 d8 <b-8 g8 b-8 >d8 g8<', '>f4 e-8 d8 d2<',
    '>c4 e-4 a-4. g8<', '>f4 d4 <b-4. >d8<', '>e-4 g4 c4 e-4<', '>d2 <a4 f+4',
    ...A, 'b-8 >c8 d8 e-8 f8 e-8 d8 c8<', '>d2. r4<',
    'g8 b-8 >e-8 <b-8 g8 b-8 >e-8 g8<', 'a8 >c8 f8 c8 <a8 >c8 f8 a8<', '>b-4 a8 g8 f4 d4<', '>g2 d2<',
    'g8 b-8 >e-8 <b-8 g8 b-8 >e-8 g8<', 'a8 >c8 f8 c8 <a8 >c8 f8 a8<', '>f+4 a4 f+4 d4<', '>c4 <a4 f+4 d4');
  const prog = ['Gm', 'Gm', 'Eb', 'F', 'Gm', 'Gm', 'Eb', 'D', 'Cm', 'Cm', 'Gm', 'Gm', 'Ab', 'Bb', 'Cm', 'D',
    'Gm', 'Gm', 'Eb', 'F', 'Gm', 'Gm', 'Eb', 'D', 'Eb', 'F', 'Gm', 'Gm', 'Eb', 'F', 'D', 'D'];
  const R = { Gm: ['g', 'd'], Eb: ['e-', 'b-'], F: ['f', 'c'], D: ['d', 'a'], Cm: ['c', 'g'], Ab: ['a-', 'e-'], Bb: ['b-', 'f'] };
  const W = { Gm: 'b- >d<', Eb: 'g b-', F: 'a >c<', D: 'f+ a', Cm: 'e- g', Ab: 'e- a-', Bb: 'f b-' };
  const mech = (c) => { const [r, f] = R[c]; return `o4 [${r} >${r}< ${f} ${r}]4`; };
  const bass = (c) => { const r = R[c][0]; return `o2 [${r} ${r} >${r}< ${r}]2`; };
  SONGS.stage7 = {
    title: 'Iron Citadel', tempo: 168, loop: true,
    tracks: {
      A0: '@lead v14 o5 ' + B('r1', 'r1') + ' L ' + lead,
      A1: '@pluck v8 l16 q6 ' + B(mech('Gm'), mech('Gm')) + ' L ' + B(...prog.map(mech)),
      W0: '@bass v15 l8 ' + B(bass('Gm'), bass('Gm')) + ' L ' + B(...prog.map(bass)),
      W1: '@wsaw v10 o4 l2 ' + B('r1', 'r1') + ' L ' + B(...prog.map((c) => W[c])),
      D: 'v12 l16 ' + B('k8 h8 k8 h8 k8 h8 k8 h8', 's s s s s s s s t t t t u u u u') + ' L ' +
        '[x k h h s h k h k k h h s h h h | [k k h h s h k h k k h h s h h h |]2 k k h h s h k h s s s s t t u u |]8',
    },
  };
}

// ---------------- boss: 切迫（C♯ マイナー、170）
{
  const prog = [['X0,3,7', 'o4 c+', 'o2 c+'], ['X0,3,7', 'o4 c+', 'o2 c+'], ['X0,4,7', 'o3 a', 'o1 a'], ['X0,4,7', 'o3 b', 'o1 b'],
    ['X0,3,7', 'o4 c+', 'o2 c+'], ['X0,3,7', 'o4 c+', 'o2 c+'], ['X0,4,7', 'o4 d', 'o2 d'], ['X0,4,7,10', 'o3 g+', 'o1 g+']];
  const b16 = (r) => { const [o, n] = r.split(' '); return `${o} [${n}16 ${n}16 >${n}16< ${n}16]4`; };
  SONGS.boss = {
    title: 'Core Alert', tempo: 170, loop: true,
    tracks: {
      A0: '@lead_s v14 o5 l16 ' + B('r1') + ' L ' + B('c+8 c+ c+ e8 c+ c+ g+8 c+ c+ e8 d+8', 'c+8 c+ c+ e8 c+ c+ >c+8< b a g+8 e8',
        'a8 a a >c+8< a a >e8< a a >c+8< b8', 'b8 b b >d+8< b b >f+8 e d+ c+8 <b8',
        '>e4 d+8 c+8 d+4 <b8 g+8', '>c+4 <b8 a8 g+4 e8 g+8', 'a4 >d8 c+8 d4 f+8 a8<', '>g+8 f+ e d+8 c+8 <b+8 >d+8 g+8 f+8<'),
      A1: '@arp v9 q4 ' + B(hits('X0,3,7', 'o4 c+', 'r8 8 r8 8 r8 8 r8 8')) + ' L ' + B(...prog.map(([x, n]) => hits(x, n, 'r8 8 r8 8 r8 8 r8 8'))),
      W0: '@bass v15 ' + B(b16('o2 c+')) + ' L ' + B(...prog.map((p) => b16(p[2]))),
      W1: '@wsaw v10 o4 l2 ' + B('r1') + ' L ' + B('e d+', 'e f+', 'e c+', 'd+ f+', 'g+ a', 'g+ e', 'f+ a', 'g+ >c<'),
      D: 'v13 l16 ' + B('s s s s s s s s t t t t u u u u') + ' L ' + '[[k h s h k k s h k h s h k k s s |]3 k h s h k k s h s s s s t t u u |]2',
    },
  };
}

// ---------------- final: 最後の敵（F マイナー、156）
{
  const prog = ['Fm', 'Db', 'Bbm', 'C', 'Fm', 'Db', 'Eb', 'C', 'Db', 'Eb', 'Cm', 'Fm', 'Bbm', 'Gb', 'Db', 'C'];
  const C = { Fm: ['X0,3,7', 'o4 f', 'f', 'a- >c<'], Db: ['X0,4,7', 'o4 d-', 'd-', 'a- f'], Bbm: ['X0,3,7', 'o3 b-', 'b-', 'f d-'], C: ['X0,4,7', 'o4 c', 'c', 'e g'],
    Eb: ['X0,4,7', 'o4 e-', 'e-', 'g b-'], Cm: ['X0,3,7', 'o4 c', 'c', 'g e-'], Gb: ['X0,4,7', 'o3 g-', 'g-', 'g- b-'] };
  const bo = { f: 2, d: 2, b: 1, c: 2, e: 2, g: 1 };
  const bass = (c) => { const n = C[c][2]; return `o${bo[n[0]]} [${n} ${n} >${n}< ${n}]2`; };
  SONGS.final = {
    title: 'Last Signal', tempo: 156, loop: true,
    tracks: {
      A0: '@brass v14 o5 l8 ' + B('r1', 'r1') + ' L ' + B('f4 c4 f4 a-4', 'a-4. g f4 d-4', 'b-4. a- f4 b-4', '>c2< b2',
        '>c4 <a- f >c4 f4<', '>e-4. d- c4 <a-4', 'b-4. a- g4 e-4', 'e2 g2',
        'a-4. g f4 a-4', 'b-4. a- g4 b-4', '>c4. d e-4 g4<', '>f2 c2<', '>d-4. c <b-4 f4', '>e-4. d- <b-4 g-4', 'a-4. g- f4 d-4', '>c4 <b-4 g4 e4'),
      A1: '@arp v9 l8 q6 ' + B(hits('X0,3,7', 'o4 f', '8 8 8 8 8 8 8 8'), hits('X0,3,7', 'o4 f', '8 8 8 8 8 8 8 8')) + ' L ' +
        B(...prog.map((c) => hits(C[c][0], C[c][1], '8 8 8 8 8 8 8 8'))),
      W0: '@bass v15 l8 ' + B(bass('Fm'), bass('Fm')) + ' L ' + B(...prog.map(bass)),
      W1: '@worgan v10 o4 l2 ' + B('r1', 'r1') + ' L ' + B(...prog.map((c) => C[c][3])),
      D: 'v12 l16 ' + B('s s s s s s s s s s s s s s s s', 's s s s s s s s t t t t u u u u') + ' L ' +
        '[x8 h h s8 h h k8 k h s8 h h | [k8 h h s8 h h k8 k h s8 h h |]2 k8 h h s8 h h s s s s t t u u |]4',
    },
  };
}

// ---------------- clear: 面クリア（G メジャー、144）
SONGS.clear = {
  title: 'Sector Clear', tempo: 144, loop: false,
  tracks: {
    A0: '@lead v14 o5 l8 ' + B('g b >d g f+ d e f+<', '>e4 g e f+4 a f+<', '>g2.< r4'),
    A1: '@lead v10 o5 l8 ' + B('d g b >d d <b >c d<', '>c4 e c d4 f+ d<', '>d2.< r4'),
    W0: '@bass v15 l8 ' + B(octBass(2, 'g'), 'o2 c >c< c >c< d >d< d >d<', 'o2 g2. r4'),
    W1: '@worgan v10 o4 l2 ' + B('b b', 'g a', 'b2. r4'),
    D: 'v13 l8 ' + B('k h s h k k s h', 'k h s h s16 s16 s16 s16 t16 t16 u16 u16', 'x2. r4'),
  },
};

// ---------------- gameover（A マイナー、138）
SONGS.gameover = {
  title: 'Signal Lost', tempo: 138, loop: false,
  tracks: {
    A0: '@lead v12 o5 l8 ' + B('e4. d c4 e4', 'd4. c <b4 g+4>', '<a1>'),
    A1: '@pad v10 o4 l8 ' + B('>c4.< b a4 >c4<', 'a4. a g+4 e4', 'e1'),
    W0: '@bass v14 o2 ' + B('a1', 'f2 e2', 'a1'),
  },
};

// ---------------- ending: 全面クリア（C メジャー、144、約 30 秒で止まる）
{
  const C = [['X0,4,7', 'o4 c', 'o2 c', 'e g'], ['X0,3,8', 'o3 b', 'o1 b', 'd g'], ['X0,3,7', 'o3 a', 'o1 a', 'c e'], ['X0,4,9', 'o3 g', 'o1 g', '<b> e'],
    ['X0,4,7', 'o3 f', 'o1 f', 'c a'], ['X0,3,8', 'o3 e', 'o2 e', 'c g'], ['X0,3,7', 'o4 d', 'o2 d', 'd f'], ['X0,4,7', 'o3 g', 'o1 g', 'd g'],
    ['X0,4,7', 'o4 c', 'o2 c', 'e g'], ['X0,4,7,10', 'o3 e', 'o2 e', 'd g+'], ['X0,3,7', 'o3 a', 'o1 a', 'c e'], ['X0,4,7,10', 'o4 c', 'o2 c', 'e b-'],
    ['X0,4,7', 'o3 f', 'o1 f', 'c a'], ['X0,4,7', 'o3 g', 'o1 g', 'd g'], ['X0,3,7', 'o3 e', 'o2 e', 'e g'], ['X0,3,7', 'o3 a', 'o1 a', 'e a']];
  const wb = (r) => { const [o, n] = r.split(' '); return `${o} ${n}4 >${n}4< ${n}4 >${n}4<`; };
  SONGS.ending = {
    title: 'Homeward', tempo: 144, loop: false,
    tracks: {
      A0: '@lead v13 o5 l8 ' + B('g4 e4 >c4.< b', '>d4 <b4 g4. a', '>c4 <a4 e4. g', 'b2 g4 r4',
        'a4 f4 >c4. d<', '>e4 c4 <g4. a', 'f4 a4 >d4. c<', 'b2. r4',
        '>c4 <g4 e4 g4', 'g+4 b4 >d4 e4<', '>c2 <a4 >c4<', 'b-2 g4 e4',
        'a4. g f4 a4', 'b4. a g4 b4', '>e4 d c <b4 g4', 'a4 >c4 e4 a4<', '>g4 f4 d4< b4', '>c1<'),
      A1: '@parp v10 ' + B(...C.map(([x, n]) => `${x} ${n}2 ${n}2`), 'X0,3,7,10 o4 d2 X0,4,7,10 o3 g2', 'X0,4,7 o4 c1'),
      W0: '@bassp v14 ' + B(...C.map(([, , r]) => wb(r)), 'o2 d4 >d4< o1 g4 >g4<', 'o2 c1'),
      W1: '@worgan v9 o4 l2 ' + B(...C.map((c) => c[3]), 'f f', 'e1'),
      D: 'v10 l8 ' + B(...Array(15).fill('k4 h h s4 h h'), 'k4 h h s s16 s16 t16 t16 u16 u16', 'k4 h h s4 s16 s16 s16 s16', 'x1'),
    },
  };
}

export const SONG_IDS = Object.keys(SONGS);
