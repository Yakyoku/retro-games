# ENVIRONMENT — 実際に使った環境

この作品は Claude（Claude Code のクラウドセッション）で制作しました。以下は 2026-11-12 のセッションで実際に確認した内容です。

## クラウドセッション

- 作業リポジトリ: `Yakyoku/retro-games`（7 作品で共用）。作品フォルダ `games/retro-digger/`。開始時の未コミット変更なし
- ブランチ: 作業ブランチ `claude/confident-dirac-88tlfo`。リポジトリの約束（ルートの CLAUDE.md）に従い main にも push
- 実行環境: Linux（4 CPU、メモリ 15GB、GPU なし（`nvidia-smi` なし）、空き容量 約 31GB）。Node.js 22.23.4、npm
- ネットワーク: エージェント用プロキシ経由。Docker Hub・GitHub・npm・Netlify API に到達できた
- ブラウザ: 事前導入の Chromium＋Playwright（headless。WebGL は SwiftShader＝CPU 描画）。サーバーは立てず、Playwright のリクエスト差し替えで `dist/` を返して確認
- WebXR の確認: Meta の WebXR エミュレーター IWER（npm `iwer@2`、Quest 3 設定）を scratchpad に入れて使用（リポジトリには入れていない）

## Unity について（試したことと結果）

| 項目 | 結果 |
|---|---|
| Unity Editor | コンテナに無し |
| Unity 公式 CI イメージ | `unityci/editor:ubuntu-6000.3.28f1-webgl-3.2.2`（約 7.2GB）を Docker で取得できた |
| Editor の起動（ライセンスなしの試行） | Docker での起動操作が権限判定（外部コードの実行）で止められ、実行していない |
| ライセンス | 利用者の Unity アカウントでの有効化が必要。セッションからは用意できない |
| Netlify でのビルド | Unity は動かない（Node のビルドのみ） |

→ 利用者に「three.js+WebXR に変更／Unity+GitHub Actions（Secrets 登録）／Unity+Docker（.ulf を Drive 経由）」を確認し、three.js+WebXR を選択してもらった。

## 採用した構成

- three.js r0.187.0（ルート package.json の devDependencies、`npm ci`）。依存の追加なし
- WebXR は three.js の `WebXRManager`（`renderer.xr`）。参照空間 `local-floor`。VR の入場ボタン・コントローラーの見た目・VR 内 UI は自作（CDN からコントローラーモデルを読む `XRControllerModelFactory` は使わない）
- 描画: WebGLRenderer（MSAA、ACES トーンマップ、sRGB）。焼き込みなしの動的照明
- 音: 自作の AudioWorklet 音源（使えないときは ScriptProcessor）
- 公開: Netlify サイト `retro-digger-pump-patrol`（siteId `142a4957-ffb6-45ed-bf0b-b5b7d60e1304`、環境変数 GAME=retro-digger・VARIANT=all）。
  ルートの `netlify.toml` → `tools/build-game.js` → `games/retro-digger/tools/build.js` で `dist/` を作る
- 素材保管: GitHub（ソース・文書・ステージ・生成手順。テクスチャと音はすべて実行時に計算で作るのでファイルは無い）

## 干渉防止（複数作品・複数セッション）

- 作品 ID `retro-digger`。変更は `games/retro-digger/` の中だけ。ビルド出力は `games/retro-digger/dist/`（git 管理外）→ ルート `dist/`
- 保存キー `retro-digger:save`（他作品と別）。Netlify サイトも専用（同名系の既存サイト `pump-patrol-expedition`・`pumppatrol-unity-20261108` には触れていない）
- push の前に `git pull --rebase`。他のセッションのプロセスは止めない。Unity を使わないので Editor のロック・同時起動の問題は生じない
- 同時実行の検証（2 つのプロジェクトを並行して動かす試験）は行っていない
