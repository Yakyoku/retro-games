# 月影の魔城（作業名 Makaimura_Claude_Cloud_Rebuild）

本作は、Claude Codeのクラウドセッションで制作しました。参考作品：1985年アーケード版『魔界村』／非公式作品。
原作の名称・キャラクター・絵・楽曲・効果音は使っていない新規制作です。カプコン・Anthropic の公式制作・監修・公認ではありません。

鎧の騎士を操作し、移動・ジャンプ・しゃがみ・はしご・投げ武器で全 6 ステージの魔城を攻略する横スクロール・アクション。
鎧は 1 回だけ攻撃に耐え、次に当たると倒れる（体力ゲージなし）。

## 公開 URL

| 版 | URL | Netlify サイト |
|---|---|---|
| 2D 版（デスクトップ・タブレット・スマートフォン） | https://tsukikage-castle-2d-yk.netlify.app/ | tsukikage-castle-2d-yk（`GAME=tsukikage-castle` `VARIANT=2d`） |
| 3D / VR 版（通常ブラウザは三人称 3D、Quest 3 は WebXR） | https://tsukikage-castle-vr-yk.netlify.app/ | tsukikage-castle-vr-yk（`GAME=tsukikage-castle` `VARIANT=vr`） |

トップページに制作注記と相互リンクがあり、`play/` がゲーム本体です。サイト ID は `netlify-sites.json`。

## 操作

| 機器 | 移動・しゃがみ・はしご | ジャンプ | 攻撃（長押しで連射） | ポーズ |
|---|---|---|---|---|
| キーボード | ←→ / A D、↑↓ / W S | Space / X | Z / J | Esc / P |
| コントローラー（標準配置） | 十字キー / 左スティック | 下ボタン（A / ×） | 左ボタン（X / □） | Start |
| タッチ | 左の円 | 「跳」 | 「投」 | 右上 II |
| Meta Quest 3 | 左スティック | 右 A | 右トリガー | 右 B |

メニューは ↑↓ で選び、決定（Enter / A）、値の変更は ←→、戻るは Esc / B。マウス・タッチ・VR のレーザーでも選べます。
設定でキーとボタンの割り当て、左利き（タッチ・Quest の左右入れ替え）、振動、音量（曲・効果音・環境音を別々に）、画質を変えられます。

## 起動・ビルド・テスト

ローカルにサーバーは立てません（確認は Netlify の公開先、または headless Chromium のリクエスト差し替えで行います）。

```bash
npm ci
```

```bash
GAME=tsukikage-castle VARIANT=all node tools/build-game.js
```

（リポジトリのルートで実行。`dist/` に 2D 版 `play/` と 3D 版 `play3d/` ができる。`VARIANT=2d` / `vr` は公開用）

```bash
cd games/tsukikage-castle && node --test tests/*.test.js && node tools/check.js && node tools/reach.js
```

- `tests/core.test.js` 鎧・残機・時間・復活・武器・はしご・稼ぎ防止・全ステージ到達・全武器×全ボス撃破・遷移
- `tests/support.test.js` 保存・曲の小節とループ・音源の NaN/音量・効果音の対応表
- `tools/reach.js` 実際の物理で「歩く・跳ぶ・はしご・待つ」を幅優先探索し、無傷でボスの間まで行ける操作列を見つけて再生する

デバッグ: `play/?debug=1`（FPS・内部解像度・敵数。I 無敵 / N 次のステージ / G ボス前 / B ボス撃破 / 1〜4 武器）、`&inv` で最初から無敵。

## 公開手順（Netlify）

1. Netlify コネクタの `deploy-site`（siteId は `netlify-sites.json`）が返す `npx -y @netlify/mcp@latest --site-id … --proxy-path …` を**リポジトリのルートで**実行する
2. Netlify 側で `node tools/build-game.js` が動き、環境変数 `GAME`・`VARIANT` に応じて `dist/` を公開する
3. 公開先のトップページを開き、制作注記・相互リンク・`play/` の起動を確かめる

## 構成

```
games/tsukikage-castle/
├── index.template.html   トップページの雛形（制作注記・相互リンク。build.js が版ごとに書き出す）
├── play2d/               2D 版（index.html, main.js, render.js = Canvas 2D 描画, art.js = 手続き的な絵）
├── play3d/               3D / VR 版（index.html, main.js, render3d.js = three.js・WebXR, models.js = 立体モデル, themes.js）
├── shared/               共通: config.js（調整値）, stages.js（6 ステージ）, core.js（ゲームの中核）, anim.js（骨格ポーズ）,
│                         app.js（画面遷移）, ui.js（HUD・メニュー）, input.js, touch.js, save.js, audio/（音源・曲・効果音）
├── tests/  tools/        テスト・ビルド・点検・到達確認
├── docs/audio/           曲のスペクトログラムと測定値
└── *.md                  README / ENVIRONMENT / ASSUMPTIONS / ASSET_LICENSES / AUDIO_REFERENCE / AUDIO_COMPARISON_REPORT / TEST_REPORT / QUEST3_GUIDE / CLAUDE
```
