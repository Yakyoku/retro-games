# ASSET_LICENSES — 素材と取得元

| 素材 | 種類 | 取得元・作者 | 条件 |
|---|---|---|---|
| キャラクター（2D 描画・3D モデル） | 制作 | このセッションでコードから生成（shared/art, experiments/*/render2d.js, chars3d.js） | リポジトリに同じ |
| 建物・背景・夜景・アイコン | 制作 | 同上（Canvas の手続き的生成、icons/icon.svg） | 同上 |
| BGM・ジングル・効果音・音源マスター | 制作 | 同上（shared/audio, audio-master） | 同上 |
| three.js r187 | 外部ライブラリ | npm `three`（ルートの devDependencies）。build で vendor/three に複製 | MIT |
| IWER 2.8.0 | 検証用ツール | npm `iwer`（Meta）。scratchpad に導入。**配布物・リポジトリには含めない** | MIT |
| Playwright / Chromium | 検証用ツール | 環境に事前導入 | Apache-2.0 等 |
| フォント | 端末のシステムフォント（ヒラギノ・Noto Sans JP 等）を指定するだけ。配布していない | — |

参照専用の資料: なし（原作の画像・映像・音源は参照・使用していない）。外部の画像・音声ファイルは 1 つも同梱していない。
