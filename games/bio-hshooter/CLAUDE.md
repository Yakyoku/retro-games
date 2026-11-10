# CLAUDE.md — VOIDBLOOM（games/bio-hshooter/）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。決定事項・調整値・判断ログ・設定資料・未解決をここに残す。

## 目的
1980 年代後半のアーケード横スクロールシューティングの「遊びの仕組み」に影響を受けたオリジナルのトリビュート作品を、
50 インチ 4K ディスプレイ（工程A）と Meta Quest 3 の立体視（工程B）で、高精細・滑らかに遊べる形で作る。
対象は制作者本人（大人）のみ。難易度はアーケード相当。PROCESS.md §9（子ども向け）は適用しない。

## 構成
```
games/bio-hshooter/
├── index.html                 入口（大画面 / Quest 3 の 2 枚のカード、フッターに MADE WITH CLAUDE）
├── gallery.html               設定資料ギャラリー（機体・敵・ボスの 3D モデルを回して見る）
├── sound-test.html            サウンドテスト（曲・効果音・音色）
├── experiments/01-bigscreen/  工程A（4K 大画面）
├── experiments/02-vr-quest3/  工程B（WebXR）
├── shared/                    両方で使う（ルール・ステージ・モデル・描画・音）
├── tests/                     node --test
└── tools/build.js, check.js
```
- ビルド: ルートで `GAME=bio-hshooter VARIANT=all node tools/build-game.js`（dist/ に出る）
- 点検: `node tools/check.js` ／ テスト: `node --test tests/`（作品フォルダで）

## 判断ログ
（日付つきで追記）

## 設定資料
（工程A で記入）

## 調整値
（工程A で記入）

## 未解決
（なし）
