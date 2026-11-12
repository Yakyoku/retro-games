# ORBITAL WINGS（仮称）— GradiusInspired_Cloud

このゲームは、Claude Codeのクラウドセッションで制作しました。
初代グラディウスに着想を得た非公式作品です。コナミの公式作品ではありません。

カプセルでゲージを進めて装備を選ぶ横スクロールシューティング。全 7 ステージ・7 ボス、最大 4 機のオプション、2D Web 版と Quest 3 の WebXR 版。

## 公開 URL
- 入口: https://orbital-wings-gic.netlify.app/
- 2D 版: https://orbital-wings-gic.netlify.app/2d/
- 3D / VR 版: https://orbital-wings-gic.netlify.app/3d/
- デバッグ表示: どちらも `?debug=1`（フレーム時間・描画バッファ・敵/弾の数。キー I 無敵 / N 次の面 / G ボス前へ / B ボス撃破 / F 全装備 / C カプセル）

## 使用技術
- ルール: `shared/game.js`（60Hz 固定ステップ・決定的。2D/3D 共通）、`stages.js`・`enemies.js`・`bosses.js`・`terrain.js`
- 2D: Canvas 2D のベクター描画（実解像度。4K で 3840×2160）
- 3D: three.js r187 ＋ WebXR Device API（`3d/`）
- 音: 自作の PSG ×2 ＋ 波形メモリ音源の模擬（AudioWorklet、非対応時は ScriptProcessor）。曲・効果音はすべて新規（AUDIO_REFERENCE.md）
- 当初の Unity 方針から変更した理由: ENVIRONMENT.md（クラウドで Unity Personal を有効化できないため。依頼者承認済み）

## 操作
| | キーボード | ゲームパッド | タッチ（iPad） | Quest 3 |
|---|---|---|---|---|
| 移動 | 矢印 / WASD | 左スティック / 十字 | 左半分をなぞる | 左スティック |
| 奥・手前（3D） | E / Q | 右スティック上下 | — | 右スティック上下（上で奥） |
| 射撃・ミサイル | Z / Space（押し続け） | A | SHOT | 右トリガー |
| パワーアップ | X / Shift | B | POWER | 右 A |
| 一時停止 | Esc | Start | Ⅱ | 右 B |
| メニュー | 矢印・Enter・Esc | 十字・A・B | タップ | レーザーで指してトリガー |

## ビルド・確認（リポジトリのルートで）
```bash
npm ci
```
```bash
GAME=orbital-wings VARIANT=all node tools/build-game.js
```
テスト（作品フォルダで）:
```bash
cd games/orbital-wings && node --test tests/*.test.js
```
音の書き出し（試聴用 .ogg / WAV を `audio-masters/` へ）:
```bash
cd games/orbital-wings && node tools/render-audio.js
```

## 公開
Netlify サイト `orbital-wings-gic`（netlify-sites.json）。環境変数 `GAME=orbital-wings`・`VARIANT=all`。
Netlify コネクタの deploy-site が返す `npx -y @netlify/mcp@latest --site-id … --proxy-path …` をリポジトリのルートで実行すると、
リポジトリを送って Netlify 側で `node tools/build-game.js` が走る（Unity などの Editor は不要）。公開物は `dist/` の静的ファイルだけ。

## 再開するには
`CLAUDE.md`（判断ログ・現在地・次の作業）を読む。仕様は SPEC.md、検証結果と未検証項目は TEST_REPORT.md。

## 資料
ENVIRONMENT.md・SPEC.md・ASSET_LICENSES.md・AUDIO_REFERENCE.md・MULTI_PROJECT_SETUP.md・TEST_REPORT.md
