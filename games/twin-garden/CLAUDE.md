# CLAUDE.md — ツイン・ガーデン（games/twin-garden/）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。決定事項・調整値・判断ログ・未解決をここに残す。

## 目的
リブルラブル（ナムコ）の「2 つの自機をつなぐラインを杭に掛けて囲む」遊びを再構成したファンメイド作品を、2D ブラウザー版と Meta Quest 3 の WebXR 版で作る。公式作品と誤認させない（公開名「ツイン・ガーデン」、タイトルに注記）。

## 構成
```
games/twin-garden/
├── index.html                  手元確認用の入口（VARIANT=all のときだけ）
├── experiments/01-2d/          2D 版（Canvas 2D・タッチ）
├── experiments/02-vr/          3D／VR 版（three.js・WebXR）
├── shared/core/                共通コア（盤面・ライン・囲み判定・敵・得点・進行・固定 tick。描画・機器に依存しない）
├── shared/ui/                  入力・保存・メニュー定義・DOM の HUD
├── shared/audio/               自作の音源と曲
├── tests/  tools/build.js  tools/check.js  docs/
```
- ビルド: ルートで `GAME=twin-garden VARIANT=2d|vr|all node tools/build-game.js`。VARIANT=2d/vr のときは各版の index.html がサイトの入口
- 試験: 作品フォルダで `node --test tests/*.test.js`、点検 `node tools/check.js`
- デバッグ: `?debug=1`（2D: 描画バッファと fps、VR: fps・p95/p99・フレームバッファ・更新レート）

## 公開
- 2D https://twin-garden-2d.netlify.app/ （siteId aa205250-1c49-4b55-92c6-fa9461228e34、GAME=twin-garden・VARIANT=2d）
- VR https://twin-garden-vr.netlify.app/ （siteId 7afaf38a-e64a-4cd5-8c61-e78e83200b85、GAME=twin-garden・VARIANT=vr）

## 判断ログ
- 2026-11-12 依頼文は Windows（N-100）＋OpenCode＋Unity 前提だったが、実際はクラウドの Linux（Unity・N-100 接続なし、Unity のライセンス認証も不可）。利用者に選択肢を示し「three.js 版で公開」を選んでもらった
- 2026-11-12 原作の曲・効果音の「原音に忠実な再現」は著作物の複製になるため行わず、自作の曲と効果音にした（利用者に伝えたうえで）
- 2026-11-12 作品フォルダは新規 `games/twin-garden/`。Netlify には別セッションの twin-garden-unity-2d/-vr・-arcade・-spatial が既にあったので触らず、twin-garden-2d / twin-garden-vr を新設
- 2026-11-12 数値は依頼文の推奨初期値のまま（GAME_DESIGN.md）。ラインは杭を点として扱う「端 → 杭の列 → 端」の折れ線。外れた杭を同じ tick に掛け直さない・掃いた三角形は半開区間、の 2 点は試験で見つけた不具合の修正
- 2026-11-12 捕獲後はラインを両端間の直線に張り直す（依頼文の「初期接続状態」）
- 2026-11-12 VR の台の高さは、入ったときの目の高さ − 0.58m（0.45〜1.35m）。測れないときは姿勢の設定（座位 0.72m・立位 0.95m）
- 2026-11-12 VR の「空間演出モード」は作らない（効果のない設定を置かない）
- 2026-11-12 試験は headless Chromium と IWER（作業用フォルダ）。サーバーは立てず Playwright のリクエスト差し替えで dist を返した

## 未解決・未確認
- Quest 3 実機・iPad 実機・50 インチ実物・人の耳での試聴（docs/TEST_REPORT.md）
