# HANDOFF.md — 再開のための引き継ぎ

## 位置
- ブランチ: `claude/determined-hawking-lxnxb5`（セッション指定）と `main`（リポジトリの CLAUDE.md に従い直接 push）。復帰点: `checkpoint/skyward-ruins-unity-source`
- 作品フォルダ: `games/skyward-ruins/`
- Unity: 6000.0.64f1 LTS（`ProjectSettings/ProjectVersion.txt`）。パッケージは `Packages/manifest.json` に版を固定（packages-lock.json は Unity の初回起動で生成されるので、初回ビルド後にコミットする）

## 公開記録
| 日時 | サイト | サイト ID | デプロイ ID | 内容 | 対応するソース |
|---|---|---|---|---|---|
| 2026-11-12 07:51Z | https://skyward-ruins-cloud-yk.netlify.app/ | 63cf70d2-76cb-470f-be03-a99a0e46dfed | 6af56fd617d5d6efb3797c8d | 制作状況ページ（Unity WebGL 版なし） | 初回コミット（デプロイ時は未コミットの作業ツリー。内容は同一） |

公開後の確認：トップの制作注記が指定の文面と一致、画像 9 枚すべて読み込み、音 24 本、`build-info.json`（unityBuild=false）、コンソールエラー 0（ヘッドレス Chromium・390×844）。

## 完成している箇所（実装済み）
- ゲーム論理（2D/3D 共通）：自機・対空/対地・空中敵 7 種・地上物 4 種・隠し対象 2 種・大型要塞・16 エリア・周回・難易度 3・得点/残機追加・死亡と復帰・ID による重複防止（**.NET で動作確認済み**）
- Unity 層：Boot/Title/Game2D/Game3D、永続サービス（音・入力・XR・カメラリグ・UI）、2D 表示（224×288 RT・点補間）、3D 表示（地形チャンク・木のインスタンシング・モデル・影・照準の輪・爆発）、VR（卓上盤面・コックピット・周辺減光・視点リセット・レイ操作メニュー・補助レーダー）、HUD・タッチ UI、設定（音量・ミュート・支援・点滅抑制・振動・利き手・視点・VR 大きさ・キー再割当・音のプレビュー）、ハイスコア、操作練習（**コンパイルのみ確認。Unity 上では未実行**）
- エディタ処理：プレイヤー設定・取り込み設定・マテリアル・メッシュ・DB・URP・XR・プレハブ・シーン生成と検証（**コンパイルのみ確認**）
- 素材：ドット絵 82 枚・3D モデル 27 点・音 24 本・フォント（**画像で確認。音は未試聴**）
- WebGL テンプレート（注記・ロード・失敗案内・再試行・二重起動防止・safe-area・VR ボタン）、Netlify 配信設定（_headers）、CI スクリプト

## 未完了・未確認
1. **Unity のライセンス認証**（利用者の Unity ID が必要）→ 生成・EditMode テスト・WebGL ビルド
2. Unity 上での表示と動作の確認・修正（初回は不具合が出る前提で、ログを見て直す）
3. 実機確認：PC ブラウザ、iPhone Safari、Android、Quest 3（`QUEST.md`）。試聴・性能計測
4. `.github/workflows/` へのワークフロー配置（作品フォルダ外のため利用者の確認待ち）

## 次に実行する操作
### A. このクラウド環境で直接ビルドする場合
Unity は `/opt/unity/Editor/Unity` に展開済み（コンテナが作り直されたら再取得：ENVIRONMENT.md の URL）。認証情報は環境変数で渡し、チャット・コード・ログに書かない。
```bash
cd games/skyward-ruins && UNITY_PATH=/opt/unity/Editor/Unity bash ci/unity-build.sh   # UNITY_EMAIL / UNITY_PASSWORD が必要
rm -rf webgl && cp -r unity/SkywardRuins/Builds/WebGL webgl
cd ../.. && GAME=skyward-ruins VARIANT=all node tools/build-game.js && node games/skyward-ruins/tools/check.js dist
```
その後、Netlify コネクタの deploy-site（サイト ID は上表）で同じサイトへ公開し、公開記録に追記。

### B. GitHub Actions でビルドする場合（推奨：認証情報がセッションを通らない）
1. GitHub のリポジトリ Settings → Secrets and variables → Actions に `UNITY_EMAIL`・`UNITY_PASSWORD`（Unity Personal で可。2 段階認証が有効なら `UNITY_LICENSE` に .ulf の中身）と、任意で `NETLIFY_AUTH_TOKEN`
2. `games/skyward-ruins/ci/unity-webgl.yml` を `.github/workflows/skyward-ruins-unity.yml` にコピーして push（または Actions から手動実行）
3. 成功すると成果物 `skyward-ruins-webgl` が保存され、`NETLIFY_AUTH_TOKEN` があれば同じサイトへ公開

### 確認の手順（公開後）
トップの注記 → 「はじめる」→ タイトル（注記・モード・難易度）→ 2D で 10 分・3D で 10 分 → 練習でエリア 16 と周回 → 再読込で設定とハイスコアが残るか → Quest で VR 開始・両トリガー・メニュー・見下ろし/コックピット。
