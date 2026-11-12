// Sky Climber VR — 曲（すべて新規作曲）。当時のアーケードのように「場面ごとに短い曲」「面ごとに違うクリアのジングル」
// 「障害の登場を知らせる短い旋律」を用意する。既成曲の引用はしない（参考作品は既成曲を使っていたが、本作は旋律を自作）。
// 編成: a=旋律、b=裏打ちの和音・対旋律、c=ベース（ドラムが鳴る間は c を奪う）。
const climbDay = {
  id: 'climb1', bpm: 152, loop: true, gain: 0.30,
  tracks: [
    { ch: 'a', mml: `@lead v12 o5 l8
      c e g e a g e c | d f a f g4 r4 | e g >c< g a g e g | f e d c d4 r4 |
      c e g e a g e c | d f a f b4 a g | >c< b a g a g f e | d4 g4 c4 r4 |
      a4 a g f4 a4 | g4 g f e4 g4 | f4 f e d e f d | e2 r4 g4 |
      a4 a b >c4< a4 | g a g e c4 e4 | d e f d g f e d | c4 g4 c4 r4` },
    { ch: 'b', mml: `@stab v9 o4 l8
      r e r e r e r e | r f r f r d r d | r e r e r e r e | r a r a r b r b |
      r e r e r e r e | r f r f r d r d | r e r e r f r f | r f r d r e r e |
      r a r a r a r a | r g r g r g r g | r f r f r f r f | r e r e r e r e |
      r a r a r a r a | r g r g r g r g | r f r f r d r d | r e r d r e r r` },
    { ch: 'c', mml: `@bass v13 o3 l8
      c r g r c r g r | d r a r g r d r | c r g r c r g r | f r >c< r g r d r |
      c r g r c r g r | d r a r g r d r | c r g r f r >c< r | g r d r c r g r |
      f r >c< r f r >c< r | c r g r c r g r | d r a r d r a r | c r g r c r g r |
      f r >c< r f r >c< r | c r g r c r g r | d r a r g r d r | c r g r c4 r4` },
  ],
};
// 夕方: イ短調寄り、少し跳ねる
const climbDusk = {
  id: 'climb2', bpm: 138, loop: true, gain: 0.30,
  tracks: [
    { ch: 'a', mml: `@lead v12 o5 l8
      a4. e a >c< b a | g4. e g b a g | f4. d f a g f | e4 g+4 b4 r4 |
      a4. e a >c< b a | g4. e g b >d< b | c b a g f e d f | e4 e4 a4 r4 |
      >c4. < a >c e d c< | b4. g b >d c< b | a4. f a >c< b a | g+4 b4 e4 r4 |
      >c4. < a >c e d c< | b4. g b >d e d | c< b a g f e d c | < b4 >e4 a4 r4` },
    { ch: 'b', mml: `@stab v8 o4 l8
      r c r e r c r e | r d r e r d r e | r d r f r d r f | r d r e r d r e |
      r c r e r c r e | r d r e r d r g | r c r f r c r f | r d r e r c r e |
      r e r a r e r a | r d r g r d r g | r c r f r c r f | r d r e r d r e |
      r e r a r e r a | r d r g r d r g | r c r f r c r f | r d r e r c r r` },
    { ch: 'c', mml: `@bass v13 o3 l8
      a r e r a r e r | g r d r g r d r | f r >c< r f r >c< r | e r b r e r g+ r |
      a r e r a r e r | g r d r g r d r | f r >c< r d r a r | e r b r a r e r |
      a r e r a r e r | g r d r g r d r | f r >c< r f r >c< r | e r b r e r g+ r |
      a r e r a r e r | g r d r g r d r | f r >c< r d r a r | e r b r a4 r4` },
  ],
};
// 夜: ニ短調、低い旋律と鐘のような対旋律
const climbNight = {
  id: 'climb3', bpm: 128, loop: true, gain: 0.30,
  tracks: [
    { ch: 'a', mml: `@lead v11 o4 l8
      d4 f a >d4< c4 | b-4 a g a2 | g4 b- >d< c4 b-4 | a4 g f e2 |
      d4 f a >d4< c4 | b-4 a g a4 >d4 | c< b- a g f e d c+ | d2 r2 |
      f4 a >c f4 e4 | d4 c< b- >c2< | b-4 >d f e4 d4 | c+4 < b- a a2 |
      f4 a >c f4 e4 | d4 c< b- a4 >d4 | e d c+< b- a g f e | d2 r2` },
    { ch: 'b', mml: `@bell v8 o6 l4
      r a r f | r d r c+ | r d r e | r c+ r < a > |
      r a r f | r d r f | r e r c+ | r d r r |
      r c r f | r d r c | r d r f | r e r c+ |
      r c r f | r d r f | r e r c+ | r d r r` },
    { ch: 'c', mml: `@bass v13 o2 l8
      d r a r d r a r | g r >d< r a r >c+< r | g r >d< r g r >d< r | a r >e< r a r >c+< r |
      d r a r d r a r | g r >d< r a r >c+< r | b- r >f< r a r >e< r | d r a r d4 r4 |
      f r >c< r f r >c< r | b- r >f< r f r >c< r | g r >d< r g r >d< r | a r >e< r a r >c+< r |
      f r >c< r f r >c< r | b- r >f< r a r >d< r | g r >d< r a r >e< r | d r a r d4 r4` },
    { ch: 'c', drums: true, mml: `@hat v7 o4 l8 r c r c r c r c | r c r c r c r c | r c r c r c r c | r c r c r c r c |
      r c r c r c r c | r c r c r c r c | r c r c r c r c | r c r c r c r c |
      r c r c r c r c | r c r c r c r c | r c r c r c r c | r c r c r c r c |
      r c r c r c r c | r c r c r c r c | r c r c r c r c | r c r c r c r c` },
  ],
};
// 超高層: 速いホ短調、駆け上がる旋律
const climbTower = {
  id: 'climb4', bpm: 168, loop: true, gain: 0.30,
  tracks: [
    { ch: 'a', mml: `@lead v12 o5 l8
      e g b g e g b >e< | d f+ a f+ d f+ a >d< | c e g e c e g >c< | b4 >d+4 e4 r4< |
      e g b g e g b >e< | d f+ a f+ d f+ a >d< | c e g >c< b a g f+ | e4 b4 e4 r4 |
      g4 a b >c4 < b a | g4 f+ e f+4 d4 | e4 f+ g a4 g f+ | e4 d+4 e4 b4 |
      g4 a b >c4 < b a | g4 f+ e f+4 a4 | g f+ e d+ e f+ g a | b4 >d+4 e4 r4` },
    { ch: 'b', mml: `@stab v8 o4 l8
      r b r b r b r b | r a r a r a r a | r g r g r g r g | r f+ r f+ r g r g |
      r b r b r b r b | r a r a r a r a | r g r g r f+ r f+ | r g r f+ r g r r |
      r b r b r b r b | r a r a r a r a | r g r g r g r g | r f+ r f+ r g r g |
      r b r b r b r b | r a r a r a r a | r g r g r f+ r f+ | r f+ r f+ r g r r` },
    { ch: 'c', mml: `@bass v13 o3 l8
      e r b r e r b r | d r a r d r a r | c r g r c r g r | b r f+ r e r b r |
      e r b r e r b r | d r a r d r a r | c r g r a r b r | e r b r e r b r |
      c r g r c r g r | d r a r d r a r | e r b r a r >c< r | b r f+ r e r b r |
      c r g r c r g r | d r a r d r a r | e r b r c r d r | b r f+ r e4 r4` },
    { ch: 'c', drums: true, mml: `@kick v12 o3 l4 c r c r | c r c r | c r c r | c r c r | c r c r | c r c r | c r c r | c r c r |
      c r c r | c r c r | c r c r | c r c r | c r c r | c r c r | c r c r | c r c8 c8 c4` },
  ],
};
const jingle = (id, bpm, a, b, c, d) => ({ id, bpm, loop: false, tail: 40, gain: 0.32, tracks: [
  { ch: 'a', mml: a }, ...(b ? [{ ch: 'b', mml: b }] : []), ...(c ? [{ ch: 'c', mml: c }] : []), ...(d ? [{ ch: 'c', drums: true, mml: d }] : [])] });

export const SONGS = {
  climb1: climbDay, climb2: climbDusk, climb3: climbNight, climb4: climbTower,
  // 練習壁: 昼の曲を少し遅く・低く
  practice: { ...climbDay, id: 'practice', bpm: 132, transpose: -5 },
  title: jingle('title', 140, '@lead v13 o5 l8 g >c e g4 e c< g | a >c f a4 g f e | d4 g4 >c4 r4',
    '@stab v9 o4 l8 r e r e r e r e | r f r f r f r f | r d r d r e r r', '@bass v13 o3 l8 c r g r c r g r | f r >c< r f r >c< r | g r d r c4 r4'),
  start: jingle('start', 150, '@lead v13 o5 l16 c e g >c< r8 g8 >c4. r8', '@stab v10 o4 l16 e g >c e< r8 e8 g4. r8', '@bass v13 o3 l8 c4 g c4. r8',
    '@snare v12 o4 l32 c c c c c c c c r8 c8 c4. r8'),
  clear1: jingle('clear1', 160, '@lead v13 o5 l8 c e g >c4< g >c e4 c< g e >c2', '@stab v9 o4 l8 e g >c e4 c e g4 e c< g >e2<', '@bass v13 o3 l4 c g c g c g c2'),
  clear2: jingle('clear2', 150, '@lead v13 o5 l8 a >c e a4 g+ a b4 a e c+ a2', '@stab v9 o4 l8 c+ e a >c+4 < b >c+ d4 c+ < a e >c+2', '@bass v13 o3 l4 a e a e a e a2'),
  clear3: jingle('clear3', 132, '@bell v13 o5 l8 d f a >d4 c< b- a4 f d4 >d2', '@lead v9 o4 l8 a >d f a4 g f e4 d < a4 >f2', '@bass v13 o2 l4 d a b- f g a d2'),
  clear4: jingle('clear4', 170, '@lead v13 o5 l16 e g b >e8 < b >e g b8 g e < b >e4 e g b >e2', '@stab v9 o4 l8 g b >e g4 e g4 e < b >g2', '@bass v13 o3 l8 e b e b e b e b e2',
    '@snare v11 o4 l16 c c r c c c r c c c r c c c c c c2'),
  allclear: jingle('allclear', 144, `@lead v13 o5 l8 c e g >c4< b a g4 e c e g4 a b >c4 e d c< b >c2 c4 r4`,
    `@stab v9 o4 l8 e g >c e4 d c< b4 g e g b4 >c d e4 g f e d e2 e4 r4`, '@bass v13 o3 l4 c g c g e b f >c< g d c g c2',
    '@snare v10 o4 l8 r c r c r c r c r c r c r c r c r c r c r c r c c c c c c4'),
  gameover: jingle('gameover', 96, '@lead v12 o5 l8 e d c < b a4 g+4 a2 r4', '@stab v8 o4 l4 c < b a e c2', '@bass v12 o3 l4 a e f e a2'),
  // 障害の登場を知らせる短い旋律（当時のように、出来事を曲で予告する仕組みを踏襲。旋律は新規）
  bird: jingle('bird', 180, '@bell v12 o6 l32 e g e g e g e g r16 c e c e c e c e r8', null, null),
  crane: jingle('crane', 120, '@lead v11 o3 l16 c c+ d d+ e r e d+ d c+ c r8', null, null),
};
export const CLIMB_SONG = { practice: 'practice', day: 'climb1', dusk: 'climb2', night: 'climb3', tower: 'climb4' };
export const CLEAR_SONG = { b1: 'clear1', b2: 'clear2', b3: 'clear3', b4: 'clear4', practice: 'clear1' };
