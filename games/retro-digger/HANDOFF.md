# HANDOFF — 引き継ぎ

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

## 現在地（2026-11-12）

- 実装済み: 2D（6 面）・通常 3D（6 面）・Quest 3 VR（3D と同じ面）、3 難易度、通しプレイ／練習、チュートリアル、一時停止・設定・結果・ゲームオーバー、保存、自作音源（曲 5・ジングル 6・効果音 26・環境音 3）、入口ページの制作注記、設定資料、サウンドテスト
- 公開済み: https://retro-digger-pump-patrol.netlify.app/（Netlify `retro-digger-pump-patrol`）
- リポジトリ: `Yakyoku/retro-games` の `games/retro-digger/`。ブランチ `claude/confident-dirac-88tlfo` と `main`
- 未検証: TEST_REPORT.md の「未検証」の節（Quest 3 実機・Safari／iPad 実機・聴感など）

## 再開の手順

```bash
git clone https://github.com/Yakyoku/retro-games && cd retro-games && npm ci
```
```bash
GAME=retro-digger VARIANT=all node tools/build-game.js
```
```bash
cd games/retro-digger && node tools/check.js && node --test tests/*.test.js
```
- 公開: Netlify コネクタの deploy-site（siteId `142a4957-ffb6-45ed-bf0b-b5b7d60e1304`）が返す `npx -y @netlify/mcp@latest ...` を**リポジトリのルートで**実行する（ルートの `dist/` は消してから）
- 確認: ブラウザでは `?debug=1`。サーバーは立てず、Playwright のリクエスト差し替えで `dist/` を返す方法を使った（ENVIRONMENT.md）

## 構成の要点

- ロジックは描画と分離（`shared/game2d.js`・`shared/game3d.js`、共通の状態遷移は `shared/rules.js`、調整値は `shared/config.js`、面は `shared/stages.js`）。node だけでテストできる
- 2D 描画 `shared/render2d.js`＋`sprites2d.js`、3D 描画 `shared/render3d.js`＋`models3d.js`、VR UI `shared/vrui.js`、地図 `shared/minimap.js`
- 画面遷移は `experiments/*/app.js`。3D の app は DOM と VR に同じ項目の画面を出す（`show()`）

## 既知の問題・改善の候補

- 実 GPU での性能が未測定。Quest で重い場合は `quality`（設定の画質「標準」）でテクスチャ 1024²・フレームバッファ倍率 1.0・フォビエーション 0.6 になる
- 2D の 3 面以降の火炎型は横方向だけに吐く（仕様どおり）。3D は行・列の両方向
- 最後の敵の逃走・3D の複数階層は採用していない（任意項目）
- 原作にある「停止中の敵の足音」「時間経過で速くなる曲」は未実装（SOUND_REPORT.md）
- Unity 版は作っていない。Unity で作り直す場合は、利用者の Unity ライセンス（GitHub Secrets など）が必要
