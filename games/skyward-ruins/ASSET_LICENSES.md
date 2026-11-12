# ASSET_LICENSES.md — 素材の出典・制作方法・利用条件

| 素材 | 場所 | 出典・制作方法 | 利用条件 |
|---|---|---|---|
| ドット絵 26 種 82 枚 | `unity/.../Art/Sprites/*.png`, `Art/sprites.json` | `tools/gen-sprites.mjs` が図形とベイヤー陰影で生成（この作品の独自デザイン） | このリポジトリの作品として利用 |
| 3D モデル 27 点 | `unity/.../Data/models.json` → Unity の Mesh | `tools/gen-models.mjs` が多面体を組み立てて生成（独自デザイン） | 同上 |
| 地表のドット絵 | 実行時に生成 | `Core/TerrainPainter.cs`（独自の描画規則） | 同上 |
| 地上絵 8 図案 | `Core/Stage.cs` の `StampGlyph` | 渦巻・太陽・蛇・格子・眼・鷺・迷路・車輪を線で描く独自図案 | 同上 |
| 曲 2 曲・ジングル 3・効果音 19 | `unity/.../Audio/*.wav`, `Data/audio.json` | `tools/gen-audio.mjs` の独自シンセ（32 サンプル×4bit 波形表 3 声＋LFSR ノイズ）で作曲・合成。**原曲・原音・サンプリング素材なし** | 同上 |
| 日本語フォント（サブセット） | `unity/.../Fonts/SkywardUI.ttf` | Noto Sans JP Medium（Google Fonts の `text=` サブセット配信で、作品で使う 582 文字のみ） | SIL Open Font License 1.1（`Fonts/OFL-NotoSansJP.txt`） |
| WebGL テンプレート | `unity/.../Assets/WebGLTemplates/SkywardRuins/` | WebXR Export の WebXRFullView2020 テンプレートの読み込み処理を参考に独自に書き直し | WebXR Export は Apache License 2.0（`LICENSE-WebXR-Export-Apache-2.0.txt`） |
| WebXR Export パッケージ | Packages/manifest.json（OpenUPM から取得） | De-Panther | Apache License 2.0 |
| Unity と Unity 公式パッケージ | Packages/manifest.json | Unity Technologies | Unity の利用規約（ビルドには利用者の Unity ライセンスが必要） |

AI による画像・音声の生成サービスは使っていません（素材はすべてこのリポジトリのスクリプトで再生成できます：`npm run assets`）。
