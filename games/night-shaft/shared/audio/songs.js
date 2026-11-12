// NIGHT SHAFT のオリジナル曲（このセッションで作曲。既存曲の旋律・和声進行の引用はしていない）。
// 1 小節 = 4 拍。各行の先頭に o（オクターブ）を書いて、行ごとに独立して読めるようにしている。
const BAR = {
  bass: {
    Am: 'o2 a a o3 e o2 a o3 g o2 a o3 c d',
    F: 'o2 f f o3 c o2 f o3 e- o2 f o3 c o2 f',
    E: 'o2 e e b e o3 d o2 e g+ b',
    Dm: 'o2 d d a d o3 c o2 d f a',
    Bb: 'o1 b- b- o2 f o1 b- o2 a- o1 b- o2 d f',
  },
  harm: {
    Am: 'o4 r a r o5 c o4 r a r o5 e',
    F: 'o4 r a r o5 c o4 r a r o5 f',
    E: 'o4 r g+ r b r g+ r o5 e',
    Dm: 'o4 r a r o5 d o4 r a r o5 f',
    Bb: 'o4 r b- r o5 d o4 r b- r o5 f',
  },
};
const prog = (kind, chords) => chords.map((c) => BAR[kind][c]).join(' | ');

const STAGE_CHORDS = ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'F', 'E', 'Dm', 'Am', 'Bb', 'E', 'Am', 'F', 'E', 'E'];
const STAGE_LEAD = [
  'o5 r e e d e a4 g', 'o5 e4. d c o4 b a4', 'o5 r f f e f a4 g', 'o5 g+2 r4 o4 b o5 d',
  'o5 e e a e g e d c', 'o4 b4. a b o5 c d4', 'o5 c4 o4 a4 o5 c d e f', 'o5 e2 r2',
  'o5 r d d c d f4 e', 'o5 c4. o4 b a g a4', 'o5 r d d c d f4 g', 'o5 g+2 f e d o4 b',
  'o5 a4 e4 g e d c', 'o5 d4 c4 o4 a2', 'o4 b4 o5 d4 o4 g+4 b4', 'o5 e2 r8 o4 e g+ b',
].join(' | ');
const STAGE_DRUM = '[[k h s h k k s h]3 k h s h k s s x]4';

const LEAD = { voice: 'pulse', duty: 1, gain: 0.2, attack: 0.004, decay: 0.22, sustain: 0.55, release: 0.03, vib: 0.006, vibDelay: 0.18 };
const HARM = { voice: 'pulse', duty: 0, gain: 0.13, attack: 0.002, decay: 0.07, sustain: 0.3, release: 0.02 };
const BASS = { voice: 'tri', gain: 0.38 };
const DRUMS = { voice: 'noise' };

export const SONGS = {
  stage: { tempo: 138, loop: true, tracks: [
    { ...LEAD, mml: 'l8 v12 q7 ' + STAGE_LEAD },
    { ...HARM, mml: 'l8 v8 q3 ' + prog('harm', STAGE_CHORDS) },
    { ...BASS, mml: 'l8 v14 q6 ' + prog('bass', STAGE_CHORDS) },
    { ...DRUMS, mml: 'l8 v10 q8 ' + STAGE_DRUM },
  ] },
  title: { tempo: 112, loop: true, tracks: [
    { ...LEAD, vib: 0.009, vibDelay: 0.25, decay: 0.5, sustain: 0.6, mml: 'l4 v12 q8 o5 a2 g e | o5 f2. e8 d8 | o5 e2 o4 b2 | o4 g+2. r | o5 d2 f a | o5 g2 e2 | o5 f d o4 b- o5 d | o5 e1' },
    { ...HARM, gain: 0.1, mml: 'l8 v8 q4 ' + prog('harm', ['Am', 'F', 'E', 'E', 'Dm', 'Am', 'Bb', 'E']) },
    { ...BASS, mml: 'l4 v14 q6 o2 a o3 e o2 a o3 e | o2 f o3 c o2 f o3 c | o2 e b e b | o2 e b e g+ | o2 d a d a | o2 a o3 e o2 a o3 e | o1 b- o2 f o1 b- o2 f | o2 e b e o1 b' },
    { ...DRUMS, mml: 'l8 v9 q8 [k r h r s r h h]7 k r s s s x s x' },
  ] },
  start: { tempo: 150, loop: false, tracks: [
    { ...LEAD, mml: 'l8 v12 q7 o5 e a o6 c e4 r o5 b o6 c | o5 b4 a4 e4 a4' },
    { ...HARM, mml: 'l8 v8 q4 o4 a r o5 c r e r e r | o4 g+ r b r o5 c4 o4 a4' },
    { ...BASS, mml: 'l8 v14 q6 o2 a a o3 e o2 a o3 c o2 a o3 e o2 a | o2 e e b e a4 o1 a4' },
    { ...DRUMS, mml: 'l8 v10 q8 k h s h k k s h | k k s s k4 x4' },
  ] },
  doc: { tempo: 176, loop: false, tracks: [
    { ...LEAD, decay: 0.1, sustain: 0.4, mml: 'l16 v12 q7 o5 c e g o6 c8 o5 g o6 c4' },
    { ...HARM, mml: 'l16 v9 q6 o4 g o5 c e g8 e g4' },
    { ...BASS, mml: 'l8 v12 q6 o2 c o3 c o2 g o2 c4' },
  ] },
  clear: { tempo: 140, loop: false, tracks: [
    { ...LEAD, mml: 'l8 v12 q7 o5 a a a o6 c4 o5 b a g | o5 a2 r4 e g+ | o5 a1' },
    { ...HARM, mml: 'l8 v8 q5 o5 e e e a4 g f e | o5 c2 r4 o4 b o5 d | o5 c1' },
    { ...BASS, mml: 'l8 v14 q6 o2 a o3 e o2 a o3 e o2 f o3 c o2 e b | o2 a o3 e o2 a o3 e o2 e4 e4 | o2 a1' },
    { ...DRUMS, mml: 'l8 v10 q8 k h s h k k s h | k h s h k s s s | k2 x2' },
  ] },
  allclear: { tempo: 132, loop: false, tracks: [
    { ...LEAD, mml: 'l8 v12 q7 o5 e a o6 c e4 d c o5 b | o6 c4 o5 a4 e4 a4 | o5 f a o6 c f4 e d c | o5 b2 g+2 | o5 a a a o6 c4 o5 b a g | o5 a1' },
    { ...HARM, mml: 'l8 v8 q5 ' + prog('harm', ['Am', 'Am', 'F', 'E', 'Am', 'Am']) },
    { ...BASS, mml: 'l8 v14 q6 ' + prog('bass', ['Am', 'Am', 'F', 'E', 'Am']) + ' | o2 a1' },
    { ...DRUMS, mml: 'l8 v10 q8 [k h s h k k s h]5 k2 x2' },
  ] },
  miss: { tempo: 120, loop: false, tracks: [
    { ...LEAD, duty: 2, slide: 0, vib: 0, mml: 'l8 v12 q8 o5 e d+ d c+ c2' },
    { ...BASS, mml: 'l8 v12 q7 o2 a g+ g f+ f2' },
  ] },
  gameover: { tempo: 84, loop: false, tracks: [
    { ...LEAD, decay: 0.6, mml: 'l4 v11 q8 o5 a g f e | o5 d2 e2 | o4 a1' },
    { ...HARM, gain: 0.1, mml: 'l4 v7 q7 o5 c o4 b a g+ | o4 f2 g+2 | o4 e1' },
    { ...BASS, mml: 'l4 v13 q7 o2 a e f e | o2 d2 e2 | o1 a1' },
  ] },
};
