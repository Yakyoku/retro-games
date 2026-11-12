# CLAUDE.md — ORBITAL WINGS（games/orbital-wings/、識別名 GradiusInspired_Cloud）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。決定事項・判断ログ・現在地・次の作業をここに残す。

## 目的
初代アーケード版グラディウスに着想を得た非公式の横スクロールシューティングを、2D Web 版（デスクトップ・iPad）と
Quest 3 単体の WebXR 版（＋通常画面の 3D）で作り、本作専用の Netlify サイトで公開する。対象は大人。PROCESS.md §9 は適用しない。

## 構成
```
games/orbital-wings/
├── index.html            入口（2D / 3D、制作注記・非公式注記）
├── 2d/                   2D 版（index.html, main.js, render2d.js）
├── 3d/                   3D / WebXR 版
├── shared/               ルール（game.js, stages.js, enemies.js, bosses.js, terrain.js, config.js, loop.js, rng.js, bot.js）
│                         画面（app.js, input.js, save.js, ui.css, boot.js）、音（audio/）
├── tests/                node --test（rules・audio）、smoke.mjs（全面の自動操縦）
├── tools/                build.js（dist 作成）、check.js（公開前点検）、render-audio.js（音の書き出し）
├── audio-masters/        試聴用 .ogg（WAV は再生成可能なので git に入れない）
└── docs/logs/            Unity 試行のログ抜粋
```
資料: README・ENVIRONMENT・SPEC・ASSET_LICENSES・AUDIO_REFERENCE・MULTI_PROJECT_SETUP・TEST_REPORT（すべて .md）

## 公開
- Netlify `orbital-wings-gic`（siteId 7aaa0766-e75c-4dac-bdf8-35099eadd3ad）、環境変数 GAME=orbital-wings・VARIANT=all
- https://orbital-wings-gic.netlify.app/ ／ /2d/ ／ /3d/
- 同名で始まる orbital-wings-ow1・orbital-wings-giur は別の過去成果物。触らない

## 判断ログ
- 2026-11-12 依頼は Unity での制作。クラウドに Unity なし → 公式 CDN から Unity 6 LTS 6000.0.64f1 を導入しバッチモードで試行 →
  「No valid Unity Editor license found」（終了 198）。公式文書で Personal は Hub の GUI でしか有効化できないと確認。
  依頼者に 2 回確認（1 回目「ライセンスを用意する」→ Personal のみと判明 → 2 回目「Web 技術で完成」）。three.js ＋ WebXR に変更
- 2026-11-12 依頼文に作品フォルダ名が無かったので `games/orbital-wings/` とした。ルートの約束どおり main に直接 push（作業ブランチにも push）
- 2026-11-12 ルールは 1 つ（shared/game.js）にまとめ、2D と 3D で共有。3D 版は z を足すだけ（2D では z=0 固定）。判定は描画と同じ座標
- 2026-11-12 原作の曲の旋律は著作物なので再現・収録しない。音源の構成（AY8910×2＋K005289、モノラル）を MAME のドライバで確認し模擬、曲は全部新規
- 2026-11-12 ボスが速く倒れすぎた → 部位耐久 ×5、登場中は無敵。最終ボスのフェーズ移行の不具合を修正
- 2026-11-12 2D の描画で、被弾の白い光の関数の引数の誤りから色の代わりに数値が渡り、装甲板が中抜けに見える・石像の描画で例外 → 修正
- 2026-11-12 Playwright のリクエスト差し替えは AudioWorklet の読み込みを拾えない（ScriptProcessor に落ちる）。公開版の HTTPS では worklet で鳴ることを確認
- 2026-11-12 3D 版はフォーク（同じ文脈を持つ並行作業）で制作し、統合した

## 現在地（2026-11-12）
- 2D・3D/VR とも全 7 面が公開版で動作（ビルド 8caad0d7e05c）。自動テスト 34 件合格。詳細は TEST_REPORT.md
- 3D の「立体音響」設定は未実装のため外した（save.js の既定値 spatial は互換のため残っている）

## 次の作業（優先順）
1. 依頼者の実機確認の結果を反映: Quest 3（読みやすさ・72/90Hz・コントローラー）、iPad（タッチ・Safari の音）、50 インチ 4K
2. 人の耳での音の確認 → 音量比・音色の調整（shared/audio/songs.js・sfx.js）
3. 通常プレイでの難易度調整（shared/stages.js の出現、config.js の DIFFICULTY）
4. 3D モデルの造形の作り込み（3d/models.js）
