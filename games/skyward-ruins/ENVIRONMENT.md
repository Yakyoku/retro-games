# ENVIRONMENT.md — 実際に確認した制作環境（2026-11-12）

すべてこのセッション内でコマンドを実行して確かめた内容です。推測で書いた項目はありません（未確認のものは「未確認」と書きます）。

## リポジトリ・指示
| 項目 | 結果 |
|---|---|
| 作業リポジトリ | `yakyoku/retro-games`（7 作品の共有リポジトリ。既存作品は `games/bio-hshooter` のみが中身あり） |
| 作業ブランチ | `claude/determined-hawking-lxnxb5`（セッション指定）。リポジトリの CLAUDE.md は「main に直接 push」→ 両方へ push |
| 既存の変更 | 開始時は作業ツリーに変更なし |
| 適用される指示 | ルートの `CLAUDE.md`（1 セッション = 1 作品、`games/<フォルダ>/` の中だけ変更、checkpoint ブランチ、netlify.toml/build-game.js は変更しない）、`PROCESS.md`（§9 は対象外） |
| この作品のフォルダ | `games/skyward-ruins/`（新規） |

## クラウドランタイム
| 項目 | 結果 |
|---|---|
| OS | Ubuntu 24.04.5 LTS（Linux 6.18, x86_64） |
| CPU / メモリ | 4 コア / 15 GiB（スワップなし） |
| 容量 | 開始時 空き 31 GB（Unity 展開後 16 GB） |
| 主なコマンド | node 22.23.4, npm, python3, ffmpeg, git, git-lfs, docker CLI（**デーモンは停止・起動不可**） |
| 追加導入 | .NET SDK 8.0.134（apt）, fonttools（pip） |
| 描画 | GPU なし。Playwright 同梱 Chromium（SwiftShader のソフトウェア描画）で静止画を撮影可能 |
| 音 | 音声デバイスなし（ALSA エラー）。**試聴はできない**。波形の数値検査と周波数分布の画像化のみ |
| ブラウザ検証 | ヘッドレス Chromium（Playwright）。実機 Safari・Quest Browser は無し |

## ネットワーク
- エージェントプロキシ経由で HTTPS 可。npm / PyPI / apt は既定で許可。
- `download.unity3d.com`・`public-cdn.cloud.unity3d.com`（Unity 配布）: 到達可。Editor 4.5GB を取得できた（途中切断 1 回 → 再開で完了、MD5 一致）。
- `packages.unity.com`・`package.openupm.com`: 到達可。
- `hub.docker.com` API: 到達可（GameCI イメージのタグ確認）。
- `github.com` の git clone（公開リポジトリ）: 可。`raw.githubusercontent` 経由の未接続リポジトリ: **不可**（フォント取得は Google Fonts の `text=` サブセット配信で代替）。

## Unity
| 項目 | 結果 |
|---|---|
| 事前インストール | **なし**（`which unity` 等すべて該当なし） |
| 取得したもの | Unity **6000.0.64f1 LTS**（Linux Editor・`/opt/unity/Editor/Unity`）＋ **WebGL Support** |
| 起動 | `-batchmode -nographics -createProject` で起動・Licensing Client 接続まで動作 |
| ライセンス | **未認証**。ログ: `No valid Unity Editor license found. Please activate your license.`（終了コード 198）。`Found 0 entitlement groups` |
| 認証手段（同梱 Licensing Client 1.17.4） | `--activate-all --include-personal --username --password`、`--activate-ulf --serial`、ULF 配置。いずれも**利用者の Unity アカウントが必要** |
| ユーザースクリプトのコンパイル | ライセンス無しでは到達しない（ログで確認） |
| テストランナー | `com.unity.test-framework` 1.6.0（Editor 同梱）。ライセンス後に `-runTests` で実行可能 |
| 代替の検証 | Editor 同梱の `UnityEngine.*.dll` / `UnityEditor.*.dll` とパッケージのソース（uGUI 2.0.0, Input System 1.17.0, XR Management 4.5.3, WebXR Export 0.25.0）を参照して **dotnet でコンパイル**（`tools/compile-check/`） |

## パッケージと互換性（採用）
| パッケージ | 版 | 根拠 |
|---|---|---|
| Universal RP | 17.0.4 | Editor 同梱版 |
| Input System | 1.17.0 | Editor 同梱版 |
| uGUI | 2.0.0 | Editor 同梱版 |
| XR Plug-in Management | 4.5.3 | Editor 同梱版（WebXR Export の依存 3.2.13 以上を満たす） |
| WebXR Export（De-Panther） | 0.25.0（OpenUPM） | 作者 README: Unity `6000.0.23f1` 以上対応、0.20 以降は URP 推奨（XR Display Subsystem）。Unity 6 では Linear 色空間が必要（WebXRBuildProcessor の警告条件で確認） |
| Test Framework | 1.6.0 | Editor 同梱版 |

## クラウド CI・公開
| 項目 | 結果 |
|---|---|
| GitHub | 接続済み（このリポジトリのみ）。Actions のワークフローはリポジトリに未設置。Secrets はこのセッションから設定・確認できない |
| GameCI Unity イメージ | `unityci/editor:ubuntu-6000.0.64f1-webgl-3.2.2` が存在（Docker Hub API で確認） |
| Unity Build Automation | Unity 組織・認証が必要なため未使用 |
| Netlify | コネクタ接続済み。同名系の既存サイト `skyward-ruins-unity` を確認（**上書きしない**）。新規サイト `skyward-ruins-cloud-yk` を作成 |
| Google Drive | 接続済み（今回は未使用。成果物の保存先はリポジトリと Netlify） |
| 実機（Quest 3・iPhone 等） | **アクセスなし** |
