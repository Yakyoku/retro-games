# Sky Climber VR（games/sky-climber）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

左右の手で窓枠をつかみ、片手で体を支えながらもう片手を伸ばして、高層ビルの屋上を目指す 3D クライミングゲーム。
『クレイジー・クライマー』（日本物産・1980）の遊びに着想を得た新規制作で、キャラクター・曲・音はすべて新しく作っています。

- 公開: https://sky-climber-rg-yk.netlify.app/
- Meta Quest 3: Quest Browser で開き「VRで遊ぶ」。左右のグリップで窓枠をつかみ、引いて登る（クラシック操作も選べる）
- 通常ブラウザー: 「通常3Dで遊ぶ」。ゲームパッド（左右スティック＝左右の手）・キーボード（WASD／矢印）・タッチ（左右の指）
- サウンドテスト: /sound-test.html、WebXR 検証シーン: /experiments/01-webxr-probe/、クレジット: /credits.html
- デバッグ: `?debug=1`（FPS・描画回数・描画バッファの解像度・全ビル解放）。IWER などのエミュレーターで確かめるときは `&xremu=1`

## ビルドと確認
```
npm ci                                           # リポジトリのルートで（three r187）
GAME=sky-climber VARIANT=all node tools/build-game.js   # ルートの dist/ に出る
cd games/sky-climber && node --test tests/*.test.js && node tools/check.js
```
フォントを作り直すとき（文言を変えたとき）は tools/make-font.py の冒頭の手順に従う。
