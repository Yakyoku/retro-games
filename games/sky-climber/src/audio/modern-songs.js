// Sky Climber VR — モダン音源の曲データ（すべて新規作曲。既成曲の引用なし）。
// 1 曲 = 和音進行（1 小節 1 和音）＋ドラムの 16 分パターン＋ベースの型＋リードの旋律（MML）＋質感の指定。
// 実際の音は modern.js が OfflineAudioContext でステム（drums / perc / bass / chords / lead / tension）ごとに合成する。
export const CHORD = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], maj: [0, 4, 7], m: [0, 3, 7], sus: [0, 5, 7, 10], add9: [0, 4, 7, 14] };
export const STEMS = ['drums', 'perc', 'bass', 'chords', 'lead', 'tension'];
const rep = (a, n) => Array.from({ length: n }, () => a).flat();

export const MODERN_SONGS = {
  // 昼の市街地: 明るいシティポップ／ファンク（112BPM・ヘ長調寄り）。エレピの刻みとスラップ風ベース
  climb1: { style: 'funk', bpm: 112, bars: 8, swing: 0.12,
    chords: [[53, 'maj7'], [52, 'm7'], [50, 'm7'], [55, '7'], [53, 'maj7'], [52, 'm7'], [50, 'm7'], [48, 'maj7']],
    drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.', clap: '....x.......x...', shaker: 'xxxxxxxxxxxxxxxx' },
    bass: [[0, 2, 0], [3, 1, 12], [6, 2, 0], [10, 2, 7], [12, 1, 10], [14, 2, 12]], bassInst: 'pluck',
    chordInst: 'epiano', chordRhythm: 'x..x..x...x.x...',
    leadInst: 'bell', lead: `o5 l8 a4. g e4 c4 | d e g4 r e d4 | f4. e d4 a4 | g2 r d g b | >c4. <a g4 e4 | g a b4 r g e4 | f e d f a4 >d4< | >c2< r4 g e` },
  // 夕方の商業地区: ハウス（124BPM・イ短調）。4 つ打ちとサイドチェインのかかったパッド、プラックのリフ
  climb2: { style: 'house', bpm: 124, bars: 8, swing: 0,
    chords: [[57, 'm7'], [53, 'maj7'], [48, 'add9'], [55, 'maj'], [57, 'm7'], [53, 'maj7'], [48, 'add9'], [55, 'sus']],
    drums: { kick: 'x...x...x...x...', snare: '', hat: '..x...x...x...x.', ohat: '..x...x...x...x.', clap: '....x.......x...', shaker: 'x.xxx.xxx.xxx.xx' },
    bass: [[2, 2, 0], [6, 2, 0], [10, 2, 12], [14, 2, 7]], bassInst: 'sub', sidechain: 0.3,
    chordInst: 'pad', chordRhythm: 'x...............',
    leadInst: 'pluck', lead: `o5 l8 e r e a r g e r | c r c f r e c r | e r e g r >c< g r | d r d g r b a g | a r >c< a r g e r | f r a >c< r a f r | g r >c e< r >d c< r | b4 a g r d g4` },
  // ネオンの夜景: シンセウェーブ（100BPM・ニ短調）。ゲートリバーブのスネア、8 分のベース、広いパッドと伸びるリード
  climb3: { style: 'synthwave', bpm: 100, bars: 8, swing: 0,
    chords: [[50, 'm'], [46, 'maj'], [53, 'maj'], [48, 'maj'], [50, 'm'], [46, 'maj'], [43, 'm'], [45, 'maj']],
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '', clap: '', shaker: '', tom: [null, null, null, '............x.xx', null, null, null, '..........x.x.xx'] },
    bass: [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 12], [14, 2, 0]], bassInst: 'saw', sidechain: 0.6,
    chordInst: 'pad', chordRhythm: 'x...............', arp: true,
    leadInst: 'lead', lead: `o5 l4 d2 f a | b-2. a8 g8 | a2 f c | e2. r | >d2< a f | g2. f8 g8 | b-2 >d< b- | a2 >c+2<` },
  // 超高層ビル: ドラムンベース（172BPM・ホ短調・16 小節）。ブレイクビーツ、うなるベース、ハーフタイムの大きな旋律
  climb4: { style: 'dnb', bpm: 172, bars: 16, swing: 0,
    chords: rep([[52, 'm'], [52, 'm'], [48, 'maj'], [48, 'maj'], [50, 'maj'], [50, 'maj'], [47, 'm'], [47, 'm']], 2),
    drums: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '', clap: '', shaker: 'xxxxxxxxxxxxxxxx', ghost: '.......x.x....x.' },
    bass: [[0, 6, 0], [10, 2, 0], [12, 3, -5]], bassInst: 'reese', sidechain: 0.5,
    chordInst: 'stab', chordRhythm: 'x.....x.........',
    leadInst: 'lead', lead: `o5 l4 e1 | g2 b2 | >c1< | e2 g2 | f+1 | a2 >d2< | b1 | f+2 d2 | >e1< | b2 g2 | >c2< g2 | e1 | a2 f+2 | >d1< | b2. a | b1` },
  // 練習壁: ローファイ（84BPM・ハ長調）。やわらかいエレピ、跳ねたビート、レコードのちりちり
  practice: { style: 'lofi', bpm: 84, bars: 8, swing: 0.2, vinyl: true,
    chords: [[48, 'maj7'], [45, 'm7'], [50, 'm7'], [43, '7'], [48, 'maj7'], [45, 'm7'], [50, 'm7'], [43, '7']],
    drums: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '', clap: '', shaker: '' },
    bass: [[0, 3, 0], [7, 1, 7], [10, 3, 0]], bassInst: 'sub',
    chordInst: 'epiano', chordRhythm: 'x.......x.......',
    leadInst: 'bell', lead: `o5 l8 e4 g b4 g e4 | c4 e g4 e c4 | f4 a >c4< a f4 | d4 f b4 g d4 | g4 e >c4< b g4 | a4 e g4 e c4 | f e d4 a4 f4 | g2 r2` },
};
export const MODERN_CLIMB = { practice: 'practice', day: 'climb1', dusk: 'climb2', night: 'climb3', tower: 'climb4' };
// 効果音の名前（app.js が play() で呼ぶ名前と一致させる。テストで照合）
export const MODERN_SFX_NAMES = ['reach', 'grab_stone', 'grab_metal', 'grab_steel', 'grab_concrete', 'windowWarn', 'windowClose', 'windowOpen', 'dropFall', 'break_pot', 'break_can', 'break_bucket', 'break_bottle',
  'birdCall', 'flap', 'buzz', 'zap', 'creak', 'motor', 'hit', 'fall', 'grace', 'combo', 'respawn', 'uiMove', 'uiOk', 'uiBack', 'floor', 'heart', 'horn', 'train', 'gust',
  'loop_motor', 'loop_creak', 'loop_hum', 'loop_heli'];
// 保持点の種類 → つかむ音の素材
export const GRAB_MATERIAL = { sill: 'stone', frame: 'metal', header: 'stone', cornice: 'stone', pipe: 'metal', relay: 'steel', roof: 'concrete' };
// コンボの音階（ペンタトニック。回数が増えるほど上がる）
export const COMBO_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
