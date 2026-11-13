// AEGIS RELAY — 曲（モダン音源）。すべてこの作品のために新しく作曲したもの。既存の曲の採譜・編曲・模倣ではない。
// 書き方: 曲 = セクションの並び。セクション = 和音の並び（1 小節 1 つ。配列は半小節ずつ）＋ 主旋律（MML）＋ 各パートの型。
//   lead: 主旋律（MML。| は小節線で、長さが合わないとエラー）  bell: 対旋律  harm: 主旋律に和音の音でハモりを付ける
//   bass / arp / stab / drums / fill: arrange.js の型の名前   pad: パッド（'hi' は 1 オクターブ上）
//   crash: 頭にシンバル   rise: 終わりに向けて盛り上げのノイズ   once: 最初の 1 回だけ（イントロ）。ループはその後ろから
// 検査（tests/audio.test.js）: 全小節が 4 拍、主旋律の全音が「調の音階 か その時の和音の音」、長い音は和音の音、
//   ステージ曲はループ部分が 32 小節以上、パッドの各声の動きが小さいこと。
const L = 'l8 q7 v12 ';

// ── タイトル「FIRST LIGHT」ニ長調・128。イントロ 4 → 主題 A 8 → B 8 → A' 8（S16）──
const title = {
  name: 'title', key: 'D', tempo: 128,
  sections: [
    { name: 'intro', once: true, chords: ['D', 'D', 'G', 'A'], bell: L + 'r1 | r1 | o5 b4. g4. d4 | o5 a4. o6 c+4. e4', bass: 'long', pad: true, arp: 'up8', drums: 'intro', fill: 'roll2', rise: true, level: 0.85 },
    { name: 'A', chords: ['D', 'A/C#', 'Bm', 'G', 'D', 'A/C#', 'G', 'A'], crash: true,
      lead: L + 'o5 d4 f+4 a2 | o5 a4 g f+ e2 | o5 d4 f+4 b2 | o5 b4 a g d2 | o5 d4 f+4 a4 o6 d4 | o6 c+4 o5 a4 e4 a4 | o5 b4. a g4 b4 | o5 a2 o6 c+4 e4',
      bass: 'eighth', pad: true, arp: 'up16', drums: 'four', fill: 'fillA' },
    { name: 'B', chords: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'A', 'A'], crash: true, rise: true,
      lead: L + 'o6 d4. o5 b4. f+4 | o5 g4. b4. o6 d4 | o6 f+4. d4. o5 a4 | o5 a4 b o6 c+ e2 | o6 d4. o5 b4. f+4 | o5 g4. b4. o6 d4 | o6 e4 c+4 o5 a4 o6 c+4 | o6 e1',
      bass: 'synco', pad: true, arp: 'up8', stab: 'x..x..x...x..x..', drums: 'ride', fill: 'roll' },
    { name: 'A2', chords: ['D', 'A', 'Bm', 'G', 'Em', ['G', 'A'], 'D', 'A'], crash: true, harm: true,
      lead: L + 'o5 d4 f+4 a2 | o5 a4 g f+ e2 | o5 d4 f+4 b2 | o5 b4 a g d2 | o5 e4 g4 b4 o6 e4 | o6 d4 o5 b4 o6 c+4 e4 | o6 d2. o5 a4 | o5 a4 e4 a4 o6 c+4',
      bass: 'octave', pad: 'hi', arp: 'updown16', drums: 'four', fill: 'fillB' },
  ],
};

// ── ステージ A「SKYLINE RUN」ホ短調・160。イントロ 4 → A 8 → A' 8 → B 8 → サビ 8（S17・S22）──
const stageA = {
  name: 'stageA', key: 'Em', tempo: 160,
  sections: [
    { name: 'intro', once: true, chords: ['Em', 'Em', 'C', 'D'], lead: L + 'r1 | r1 | o5 e4. g4. o6 c4 | o5 a4. f+4. o6 d4', bass: 'long', pad: true, arp: 'gate16', drums: 'intro', fill: 'roll', rise: true, level: 0.85 },
    { name: 'A', chords: ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'B'], crash: true,
      lead: L + 'o4 e g b4 a g e4 | o4 e g o5 c4 o4 b g e4 | o4 f+ a o5 d4 c o4 a f+4 | o4 b4. f+4. d4 | o4 e g b4 a g e4 | o4 e g o5 c4 d c o4 g4 | o5 d4. e4. f+4 | o5 f+2 d+4 o4 b4',
      bass: 'eighth', pad: true, stab: '..x...x...x..x..', drums: 'rock', fill: 'fillC' },
    { name: 'A2', chords: ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'B'], crash: true,
      lead: L + 'o5 e g b4 a g e4 | o5 e g o6 c4 o5 b g e4 | o5 f+ a o6 d4 c o5 a f+4 | o5 b4 f+16 g16 f+ d4 o4 b4 | o5 e g b4 a g e4 | o5 e g o6 c4 d c o5 g4 | o6 d4 o5 a4 o6 f+4 d4 | o5 b2 o6 d+4 f+4',
      bass: 'drive', pad: true, arp: 'updown16', drums: 'rockB', fill: 'fillA' },
    { name: 'B', chords: ['C', 'D', 'Bm', 'Em', 'C', 'D', 'Em', 'B'], crash: true, rise: true,
      lead: L + 'o4 g4. e4. g a | o4 a4. f+4. a b | o4 b4. f+4. b o5 d | o5 e2. o4 b4 | o5 e4. c4. e g | o5 f+4. d4. f+ a | o5 g4 f+ e b4 g4 | o5 f+2 b2',
      bass: 'synco', pad: true, arp: 'up8', drums: 'half', fill: 'roll' },
    { name: 'chorus', chords: ['Em', 'G', 'D', 'C', 'Em', 'G', ['Am', 'B'], 'Em'], crash: true, harm: true,
      lead: L + 'o5 e4. g4. b4 | o5 b4 a g4. d4 | o5 f+4. a4. o6 d4 | o6 e4 d c4. o5 g4 | o5 e4. g4. b4 | o6 d4 o5 b g4. b4 | o5 a4 o6 c4 o5 b4 f+4 | o6 e2. r4',
      bass: 'octave', pad: 'hi', arp: 'up16', drums: 'four', fill: 'fillB' },
  ],
};

// ── ステージ B「GILDED CIRCUIT」ニ短調・152。休符で跳ねる主題（S18）──
const stageB = {
  name: 'stageB', key: 'Dm', tempo: 152,
  sections: [
    { name: 'intro', once: true, chords: ['Dm', 'Dm', 'Bb', ['C', 'A']], bass: 'synco', pad: true, arp: 'skip16', drums: 'intro', fill: 'fillB', level: 0.85 },
    { name: 'A', chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A'], crash: true,
      lead: L + 'o5 a4. f r d f4 | o5 e f r a r o6 d4. | o6 d4. o5 b- r f b-4 | o5 g a r o6 c r e4. | o5 a4. f r d f4 | o5 e f r a r o6 d4. | o6 d4 o5 b- g r b- o6 d4 | o6 c+4. o5 a&a2',
      bass: 'synco', pad: true, stab: 'x..x....x..x..x.', drums: 'rockB', fill: 'fillC' },
    { name: 'A2', chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], crash: true,
      lead: L + 'o5 d f a o6 d c o5 a f a | o5 b- o6 d f d o5 b- f b- o6 d | o6 c o5 a f a o6 c f e c | o5 g o6 c e c o5 g e g o6 c | o6 d4. o5 a r f a4 | o5 b-4. o6 d r f d4 | o5 g b- o6 d g f d o5 b- g | o5 a o6 c+ e c+ o5 a4 r4',
      bass: 'walk', pad: true, arp: 'gate16', drums: 'rock', fill: 'fillA' },
    { name: 'B', chords: ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'A', 'A'], crash: true, rise: true,
      lead: L + 'o5 f2 d4 f4 | o5 g2 e4 g4 | o5 a2 e4 a4 | o6 d2 o5 a4 f4 | o5 f2 b-4 o6 d4 | o5 g2 o6 c4 e4 | o6 e4. c+4. o5 a4 | o5 a4 o6 c+4 e2',
      bass: 'eighth', pad: true, arp: 'up8', drums: 'half', fill: 'roll' },
    { name: 'chorus', chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', ['Gm', 'A'], 'Dm'], crash: true, harm: true,
      lead: L + 'o6 c4. o5 a4. f4 | o5 g4 o6 c e4. c4 | o6 d4. o5 a4. f4 | o5 f4 b- o6 d4. o5 b-4 | o6 c4. o5 a4. f4 | o6 e4 c o5 g4. o6 c4 | o5 b-4 o6 d4 c+4 e4 | o6 d2. r4',
      bass: 'octave', pad: 'hi', arp: 'up16', drums: 'four', fill: 'fillB' },
  ],
};

// ── ステージ C「ZENITH DRIVE」ハ短調・168。駆ける付点のリズム、サビは変ホ長調へ（S19）──
const stageC = {
  name: 'stageC', key: 'Cm', tempo: 168,
  sections: [
    { name: 'intro', once: true, chords: ['Cm', 'Cm', 'Ab', 'Bb'], bass: 'drive', pad: true, arp: 'up16', drums: 'pulse', fill: 'roll', rise: true, level: 0.85 },
    { name: 'A', chords: ['Cm', 'Ab', 'Eb', 'Bb', 'Cm', 'Ab', 'Bb', 'G'], crash: true,
      lead: L + 'o5 c4 e-16 d16 e- g4 e-4 | o5 a-4 g16 f16 g e-4 c4 | o5 b-4 g16 f16 g e-4 g4 | o5 f4. d4. o4 b-4 | o5 c4 e-16 d16 e- g4 o6 c4 | o6 c4 o5 b-16 a-16 b- o6 c4 e-4 | o6 d4. o5 b-4. f4 | o5 g2 b4 o6 d4',
      bass: 'drive', pad: true, stab: 'x.....x...x.....', drums: 'drive', fill: 'fillC' },
    { name: 'A2', chords: ['Cm', 'Ab', 'Eb', 'Bb', 'Fm', 'Ab', 'Bb', 'G'], crash: true,
      lead: L + 'o5 g c16 d16 e- g o6 c4 o5 g4 | o5 a- c16 d16 e- a- o6 c4 o5 a-4 | o5 b- e-16 f16 g b- o6 e-4 o5 b-4 | o5 b- d16 e-16 f b- o6 d4 o5 b-4 | o6 c4. o5 a-4. f4 | o6 e-4. c4. o5 a-4 | o6 d4 f4 d4 o5 b-4 | o6 d2 o5 b4 g4',
      bass: 'octave', pad: true, arp: 'skip16', drums: 'rockB', fill: 'fillA' },
    { name: 'B', chords: ['Ab', 'Bb', 'Gm', 'Cm', 'Ab', 'Bb', 'G', 'G'], crash: true, rise: true,
      lead: L + 'o5 e-2 c4 e-4 | o5 f2 d4 f4 | o5 g2 d4 g4 | o6 c2 o5 g4 e-4 | o5 a-4. o6 c4. e-4 | o5 b-4. o6 d4. f4 | o6 d2 o5 b2 | o5 g4 b4 o6 d4 g4',
      bass: 'synco', pad: true, arp: 'up8', drums: 'half', fill: 'roll' },
    { name: 'chorus', chords: ['Eb', 'Bb', 'Cm', 'Ab', 'Eb', 'Bb', ['Ab', 'Bb'], 'Cm'], crash: true, harm: true,
      lead: L + 'o6 e-2 o5 b-4 g4 | o5 b-4. o6 d4. f4 | o6 e-4 d c&c2 | o5 a-4 o6 c4 e-4 c4 | o6 e-2 g4 e-4 | o6 f4. d4. o5 b-4 | o6 c4 e-4 d4 f4 | o6 c2. r4',
      bass: 'drive', pad: 'hi', arp: 'up16', drums: 'four', fill: 'fillB' },
  ],
};

// ── エリアコア「CORE BREAKER」イ短調・174。主音のベースを踏み続ける前半 → 伸びる旋律の後半（S20）──
const core = {
  name: 'core', key: 'Am', tempo: 174,
  sections: [
    { name: 'P1', chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Bb', 'E'], crash: true,
      lead: L + 'o5 a e16 e16 a e o6 c o5 b a e | o5 a e16 e16 a e o6 e d c o5 b | o5 a f16 f16 a f o6 c o5 a f a | o5 b g16 g16 b g o6 d o5 b g b | o5 a e16 e16 a e o6 c o5 b a e | o5 a e16 e16 a e o6 e d c o5 b | o5 b- f16 f16 b- f o6 d o5 b- f b- | o5 b g+16 g+16 b g+ o6 e o5 b g+ b',
      bass: 'drive', pad: true, stab: 'x.....x.....x...', drums: 'tribal', fill: 'fillA' },
    { name: 'P2', chords: ['Dm', 'Am', 'Bb', 'E', 'Dm', 'F', 'E', 'E'], crash: true, harm: true, rise: true,
      lead: L + 'o6 d2 o5 a4 f4 | o5 e2 a4 o6 c4 | o6 d2 o5 b-4 f4 | o5 g+2 b4 o6 e4 | o6 f2 d4 o5 a4 | o6 c2 o5 a4 o6 c4 | o5 b4. g+4. e4 | o5 e g+ b o6 e o5 g+ b o6 e g+',
      bass: 'drive', pad: 'hi', arp: 'up16', drums: 'drive', fill: 'roll' },
  ],
};

// ── ジングル（1 回だけ。S21）──
// 開始: ♭VI → ♭VII と上がって、続くステージ曲の主和音へつなぐ。ステージ曲の調に合わせて移調して使う
const mkStart = (name, transpose) => ({
  name, key: 'Em', tempo: 160, once: true, layers: false, transpose,
  sections: [{ name: 'fanfare', chords: ['C', 'D'], crash: true, rise: true,
    lead: L + 'o5 g16 o6 c16 e c16 e16 g e4 r4 | o5 a16 o6 d16 f+ d16 f+16 a f+2',
    bass: 'eighth', pad: true, arp: 'up16', drums: 'pulse', fill: 'roll' }],
});
const clear = {
  name: 'clear', key: 'E', tempo: 150, once: true, layers: false,
  sections: [{ name: 'fanfare', chords: ['C', 'D', 'E', 'E'], crash: true, harm: true,
    lead: L + 'o4 g g16 g16 o5 c4 e4 c4 | o4 a a16 a16 o5 d4 f+4 d4 | o4 b b16 b16 o5 e4 g+4 b4 | o6 e2. r4',
    bell: L + 'r1 | r1 | r1 | o5 b16 o6 e16 g+16 b16 o7 e2 r4',
    bass: 'eighth', pad: 'hi', arp: 'up16', drums: 'four', fill: 'stop' }],
};
const over = {
  name: 'over', key: 'Am', tempo: 90, once: true, layers: false,
  sections: [{ name: 'elegy', chords: ['Am', 'F', ['Dm', 'E'], 'Am'], leadInst: 'bell',
    lead: 'l8 q8 v12 o5 e4 c4 o4 a2 | o5 f4 c4 o4 a2 | o5 d4 o4 a4 b4 g+4 | o4 a1',
    bass: 'long', pad: true, drums: 'slow' }],
};
const hiscore = {
  name: 'hiscore', key: 'D', tempo: 140, once: true, layers: false,
  sections: [{ name: 'fanfare', chords: ['D', 'G', ['Em', 'A'], 'D'], crash: true, harm: true,
    lead: L + 'o5 d f+ a o6 d4. o5 a4 | o5 g b o6 d g4. d4 | o6 e4 o5 b4 o6 c+4 e4 | o6 d2. r4',
    bell: L + 'o6 f+4 a4 o7 d2 | o6 g4 b4 o7 d2 | o6 b4 g4 a4 o7 c+4 | o7 d16 o6 a16 f+16 a16 o7 d2 r4',
    bass: 'octave', pad: 'hi', arp: 'up16', drums: 'four', fill: 'stop' }],
};

export const SONGS = { title, stageA, stageB, stageC, core, startA: mkStart('startA', 0), startB: mkStart('startB', -2), startC: mkStart('startC', -4), clear, over, hiscore };
// エリアごとのステージ曲（3 曲を順に回す）と、その前に鳴らす開始ジングル
const ROT = ['stageA', 'stageB', 'stageC'];
export const AREA_SONG = (area) => ROT[((area % 3) + 3) % 3];
export const START_SONG = (area) => 'start' + AREA_SONG(area).slice(-1);
// 旧チップ音源での曲名（S30）
export const CHIP_SONG = { title: 'title', stageA: 'run', stageB: 'nave', stageC: 'run', core: 'core', startA: 'start', startB: 'start', startC: 'start', clear: 'clear', over: 'over', hiscore: 'clear' };
