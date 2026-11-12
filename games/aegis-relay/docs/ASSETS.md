# 素材・音の出典とライセンス

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

| 素材 | 出典 | ライセンス・条件 |
|---|---|---|
| 2D の機体・敵・地上物・遺跡・浮遊大陸・星雲・爆発 | この作品のために新規制作（play2d/sprites.js・render2d.js のコードで描く。画像ファイルなし） | このリポジトリの作品の一部 |
| 3D のモデル・地形・材質・地面の模様 | 新規制作（play3d/models3d.js・world3d.js のコードでプリミティブから組み立て、模様はキャンバスで生成。モデルファイルなし） | 同上 |
| 曲 7 曲・効果音 27 種類 | 新規作曲・新規設計（shared/audio/）。録音・サンプリング・既存曲の採譜なし | 同上 |
| 日本語フォント M PLUS 1p（Regular / ExtraBold、japanese・latin） | Coji Morishita / M+ FONTS PROJECT。npm の @fontsource/m-plus-1p 5.3.0 から woff2 を複製 | SIL Open Font License 1.1（fonts/OFL-M-PLUS-1p.txt を同梱） |
| three.js r187 | npm の three 0.187.0（リポジトリ共通の依存）。ビルド時に vendor/three/ へ複製 | MIT License |
| shared/frame-clock.js・no-zoom.js・error-overlay.js | 同じリポジトリの games/bio-hshooter（VOIDBLOOM、同じ制作者・Claude 制作）から複製 | 同上 |

名称（AEGIS RELAY、ARC、ジェミニ、ラティス、シジル、エリア名）はすべてこの作品のために考えた。既存の作品・会社の名前、キャラクター、画像、曲は使っていない。

検証用に使った道具（作品には含めない）: Playwright＋Chromium（コンテナに入っていたもの）、Meta の WebXR エミュレーター IWER 2.x（scratchpad に npm で導入、MIT License）。
