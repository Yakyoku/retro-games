# ASSET_LICENSES — 素材の出典と利用条件

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

| 素材 | 出典 | 利用条件 |
|---|---|---|
| キャラクター（2D・3D）、岩、道具、UI | このセッションで書いたコード（`shared/sprites2d.js`・`models3d.js`・`ui.css` ほか）。画像ファイルは使っていない | この作品のための自作 |
| 地層・ひび・影などのテクスチャ | 実行時にキャンバスで計算して生成（`shared/render2d.js`・`render3d.js`） | 自作 |
| 曲・ジングル・効果音・環境音 | 自作の波形メモリ音源で実行時に合成（`shared/audio/`）。録音・既存曲は使っていない。詳細は SOUND_REPORT.md | 自作 |
| ステージ | `shared/stages.js`（書き下ろし） | 自作 |
| three.js r0.187.0 | npm `three`（https://github.com/mrdoob/three.js ） | MIT License。`vendor/three/` に本体と `BufferGeometryUtils.js` を同梱 |
| フォント | 端末のシステムフォント（system-ui 等）を指定。フォントファイルは同梱していない | — |
| IWER（WebXR エミュレーター） | npm `iwer`（Meta）。確認作業にだけ使い、公開物・リポジトリには含めない | MIT License |

原作『ディグダグ』（ナムコ）の画像・音・名称・ロゴは使っていません。入口ページの説明で、影響を受けた作品として名前を挙げているだけです。
