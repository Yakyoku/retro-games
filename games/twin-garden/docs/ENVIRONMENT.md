# ENVIRONMENT — 実際の制作環境

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

## 依頼文の前提と、実際の環境の違い
依頼文は「Windows の N-100 上で OpenCode から Unity を操作する」前提だったが、実際のセッションは次の環境だった（2026-11-12 に確認）。
- Claude Code のクラウドセッション（Linux コンテナ、Ubuntu 24.04、4 コア、RAM 15GB）。PowerShell・OpenCode・Unity Hub・Unity Editor・.NET はない
- Remote Control で使える利用者の PC フォルダは 0 件（N-100 には接続できない）。Quest 3 も接続なし
- Unity の配布サーバーには届くが、Editor の起動には利用者の Unity アカウントでのライセンス認証が必要で、ここでは行えない
- このため利用者に選択肢を示し、**「three.js 版で公開」（Unity の条件を外す）を利用者が選択**した。Unity プロジェクト・C#・Unity WebXR 連携は作っていない
- 「Opas 5.5」（OpenCode 側のモデル）は、この環境には関係しない（OpenCode を使っていない）

## 実際に使ったもの
| 項目 | 版・内容 |
|---|---|
| 言語 | JavaScript（ES モジュール）。ビルドは複製のみ（バンドラーなし） |
| 3D | three.js r187（ルートの `node_modules/three`、npm）。WebXR は three の `WebXRManager`（`renderer.xr`）で、追加パッケージなし |
| 2D | Canvas 2D（three は使わない） |
| 音 | Web Audio API の標準ノード（OscillatorNode・PeriodicWave・BiquadFilter・Gain）。AudioWorklet は使わない |
| 保存 | localStorage（サイトごとに別キー `twin-garden.2d.v1` / `twin-garden.vr.v1`） |
| 試験 | Node 22 の `node --test`、Playwright＋Chromium（headless・SwiftShader）、WebXR エミュレーター IWER 2.8.0（Meta Quest 3 プロファイル。作業用フォルダにだけ入れ、リポジトリには入れていない） |
| 公開 | Netlify（リポジトリ共通の `netlify.toml` → `tools/build-game.js` → `games/twin-garden/tools/build.js`） |
| GitHub | Yakyoku/retro-games（`games/twin-garden/` のみ変更） |

## 対象環境
- 2D: Chrome・Edge・Safari（iPadOS を含む）・Firefox の最近の版（ES モジュール・Pointer Events・Gamepad API）
- VR: Meta Quest 3 の Meta Quest Browser（WebXR `immersive-vr`、`local-floor`）。PC では通常の 3D 表示（キーボード・ゲームパッド）
- 秘密情報は扱っていない（API キー・認証情報なし）
