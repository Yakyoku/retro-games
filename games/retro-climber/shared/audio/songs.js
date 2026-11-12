// 鉄骨レスキュー — 曲（すべて自作。既存作品の旋律は使っていない）。
// 当時のアーケードの作法: 短く覚えやすいフレーズ、2〜3 声、四角波と三角波、残響なし。
// loop: true の曲はループ（全トラックの拍数をそろえる。tests/audio.test.js で確認）。
export const SONGS = {
  // 開始の合図（約 2.6 秒）: 跳ね上がる分散和音で「さあ登るぞ」
  start: { loop: false, tracks: [
    't168 @1 v13 q6 o5 l16 c e g >c< g >c e8 r16 d16 c8 r8 g8 >c4',
    't168 @3 v14 q7 o3 l8 c g c g e g <g >g c4 r4',
    't168 @4 v6 q2 l16 o4 c r c r c c c r c r c c c8 r8 c8 c4',
  ] },
  // 面の背景（ループ・4 小節）: 低音の歩くような反復に、まばらな合いの手
  stage: { loop: true, tracks: [
    't132 @3 v12 q5 o3 l8 c r g r a r g r f r c r d r g r c r g r a r g r f r e r d r g4',
    't132 @0 v7 q4 o5 l8 r2 e g r4 r2 f a r4 r2 e g r4 r2 d f e d',
  ] },
  // チュートリアル（ループ・やわらかい）
  training: { loop: true, tracks: [
    't112 @3 v11 q6 o3 l4 c g a g f c d g',
    't112 @1 v6 q5 o5 l8 r4 e g r4 c e r4 f a g f e d',
  ] },
  // ハンマー（ループ・速い）: 道具を持っている間だけ流れる
  hammer: { loop: true, tracks: [
    't176 @2 v10 q4 o5 l16 c c >c< c a- a- >a-< a- b- b- >b-< b- g g >g< g c c >c< c a- a- >a-< a- b- b- >b-< b- >c< b- a- g',
    't176 @3 v13 q5 o3 l8 c c a- a- b- b- g g c c a- a- b- b- >c< g',
  ] },
  // ミス（約 2 秒）: くるくる落ちて「しょんぼり」
  miss: { loop: false, tracks: [
    't150 @1 v13 q7 o5 l16 b a+ b a+ b a+ b a+ q8 g8 e8 c8 <g8 q7 e4 c4',
    't150 @3 v12 q6 o3 l8 r2 c <g e c4',
  ] },
  // 面クリア（約 3 秒）
  clear: { loop: false, tracks: [
    't160 @1 v13 q6 o5 l8 g >c e d c< g >c4 e d e g >c4',
    't160 @3 v13 q6 o3 l8 c g e g f a g b >c4< g4 >c4',
    't160 @4 v5 q2 l8 o4 c r c r c r c r c c c r c4',
  ] },
  // 救出・エンディング（約 9 秒）
  rescue: { loop: false, tracks: [
    't126 @1 v12 q7 o5 l8 e g >c4< b a g4 e f g4 a b >c2< g a b >c d e4 d c2.',
    't126 @0 v8 q6 o4 l8 c e g e c f a f <b >d g d c e g e f a >c< a <b >d g b >c4 <g4 >c2.',
    't126 @3 v12 q6 o3 l4 c c f f g g c c f f g g c g >c2.',
  ] },
  // ゲームオーバー（約 3 秒）
  gameover: { loop: false, tracks: [
    't96 @1 v11 q7 o4 l8 g f e d e4 c4 <b4 >c2',
    't96 @3 v12 q7 o3 l4 c <a f g >c2',
  ] },
  // タイトル（ループ・控えめ）
  title: { loop: true, tracks: [
    't120 @1 v8 q6 o5 l8 c4 e g >c4< b a g4 e f g2 a4 g f e4 d e c2',
    't120 @3 v11 q6 o3 l4 c g c g f >c< g d c g f g c2',
  ] },
};
