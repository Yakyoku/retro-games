# ENVIRONMENT.md — 制作環境（実際に調べた値）

調査日: 2026-11-12。Claude Code のクラウドセッション（Anthropic 管理のコンテナ）。値はすべてコマンドで確かめたもの。

## 計算機
| 項目 | 値 | 確かめ方 |
|---|---|---|
| OS | Ubuntu 24.04.5 LTS（Linux 6.18 x86_64） | `/etc/os-release`, `uname -a` |
| CPU | Intel Xeon @ 2.10GHz × 4 vCPU | `nproc`, `/proc/cpuinfo` |
| GPU | **なし**（`/dev/dri` 無し、`nvidia-smi` 無し）。ブラウザーは SwiftShader（CPU の WebGL） | `ls /dev/dri` |
| メモリ | 15 GiB（スワップなし） | `free -h` |
| 空き容量 | 約 31 GB（セッションの割り当て） | `df -h` |
| 作業ディレクトリ | `/home/user/retro-games`（作品は `games/orbital-wings/`） | |
| 永続化できる保存先 | GitHub リポジトリ `Yakyoku/retro-games`（push）と Netlify のデプロイ。コンテナ自体は使い終わると消える | |

## ツール
| ツール | 版 |
|---|---|
| Node.js / npm | v22.23.4 / 10.9.9 |
| Python | 3.13.18 |
| ffmpeg | 6.1.1（音源の .ogg 試聴版の書き出し） |
| Playwright / Chromium | 1.63.0 / chromium-1243（事前導入。自動ブラウザー検証に使用） |
| three.js | 0.187.0（ルートの `package.json` の devDependencies。CDN は使わない） |
| Docker | 29.9.2（使っていない） |
| git | 作業ブランチ `claude/nice-archimedes-k8svua`、リポジトリの約束により `main` にも push |

## 接続（コネクタ）と範囲
| 接続 | 状態 | 使い方 |
|---|---|---|
| GitHub | `Yakyoku/retro-games` のみに限定 | ソースの保存 |
| Netlify | 接続済み（チームの Pro プラン） | 本作専用の新規サイト `orbital-wings-gic` を作成・公開 |
| Google Drive | 接続済み | 「グラディウス / gradius / ORBITAL WINGS / GradiusInspired」で検索 → 該当資料 0 件 |
| Gmail・ConoHa VPS | 接続済み | 本作では使っていない |
| ネットワーク | エージェントプロキシ経由。Unity の配布 CDN・公式文書・npm には届いた | |

Netlify には同じ名前で始まる過去のサイト `orbital-wings-ow1`・`orbital-wings-giur` があったが、**別の成果物なので触っていない**（上書きしない）。

## Unity の確認（実施した内容と結果）
1. コンテナに Unity Editor・Unity Hub は無かった（`which unity`、`find / -iname "*unity*"` で 0 件）。
2. 公式のリリース一覧（`public-cdn.cloud.unity3d.com/hub/prod/releases-linux.json`）から **Unity 6 LTS 6000.0.64f1**（Linux Editor 4.47GB、WebGL モジュール 1.24GB）を確認し、Editor を公式 CDN から取得・展開した。
3. バッチモードで新規プロジェクト作成を試行:
   `Unity -batchmode -nographics -quit -createProject …/GradiusInspired_Cloud_probe`
   → **終了コード 198**。ログ: `Found 0 entitlement groups and 0 free entitlements`、`'com.unity.editor.headless' was not found`、
   **`No valid Unity Editor license found. Please activate your license.`**（抜粋は `docs/logs/unity-probe-2026-11-12.log`）
4. Unity 公式文書（6000.0 の Managing your Unity license / License activation methods）:
   コマンドラインでの有効化は `-serial … -username … -password …`（Pro 等）。**「For Unity Personal, the Unity Hub is the only method for activating and returning licences.」**
   手動有効化（.alf/.ulf）も Personal は対象外。つまり Personal は画面のないクラウドでは有効化できない。
5. 依頼者に確認 → 「Personal のみ → Web 技術で完成」を選択。**エンジンを Unity から three.js ＋ WebXR（ブラウザー）に変更した。**
   取得した Unity（約 8GB）は容量確保のため削除。ライセンスの迂回は一切していない。

Unity 連携（MCP 等）・Unity のクラウドビルドは接続されていなかった。

## 実機・表示の検証経路
| 対象 | 経路 | 結果 |
|---|---|---|
| デスクトップ（Chromium） | Playwright のヘッドレス Chromium（GPU なし） | 検証済み（TEST_REPORT.md） |
| iPad | Playwright の「iPad Pro 11」端末エミュレーション（タッチ・画面サイズ） | エミュレーションのみ。**実機は未検証** |
| Quest 3 | Meta の WebXR エミュレーター IWER（Quest 3 プロファイル）を Playwright に注入 | エミュレーションのみ。**実機は未検証** |
| 50 インチ 4K | 3840×2160 の実描画バッファを画像で確認 | 画像検証のみ。**50 インチ実画面は未検証** |
| 音 | 合成結果の数値解析（ピーク・RMS・ループ点・スペクトル） | **人の耳での試聴は未実施**（クラウドに音声出力なし） |

クラウド内の localhost は Quest から届かないため使わない。サーバーも立てず、ブラウザー検証は Playwright のリクエスト差し替えで dist を返した。
公開版の確認は Netlify の HTTPS URL で行う。
