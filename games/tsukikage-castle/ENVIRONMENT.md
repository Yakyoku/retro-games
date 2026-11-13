# ENVIRONMENT — 実際の制作環境と採用技術

本作は、Claude Codeのクラウドセッションで制作しました。以下はこのセッションで実際に確認した内容です（2026-11-12）。

## クラウド環境
| 項目 | 確認結果 |
|---|---|
| 実行場所 | Claude Code のクラウドセッション（Linux コンテナ、4 コア・メモリ 15GB） |
| 作業ディレクトリ | `/home/user/retro-games`（GitHub `Yakyoku/retro-games`）。作品フォルダ `games/tsukikage-castle/` だけを変更 |
| ブランチ | 開発 `claude/youthful-lamport-6s678k`（リポジトリの約束事に従い main にも反映） |
| Node.js / npm | v22.23.4 / 10.9.9 |
| ブラウザ検証 | Playwright 1.63.0 ＋ 同梱 Chromium（headless、GPU なし＝SwiftShader による CPU 描画） |
| WebXR 検証 | Meta の WebXR エミュレーター IWER 2.8.0（Quest 3 プロファイル）を scratchpad に npm で入れて使用（リポジトリには入れていない） |
| 公開 | Netlify コネクタ（MCP）で新規サイト 2 つを作成・環境変数設定・デプロイ（Netlify 側でビルド） |
| ネットワーク | エージェント用プロキシ経由。npm レジストリと Netlify に到達可能 |
| Unity | **このコンテナには Unity Editor もライセンスも無い**ため不採用（依頼書の切り替え条件に従い Web 構成へ） |
| GPU・実機 | GPU・50 インチ 4K ディスプレイ・Meta Quest 3 実機には接続していない |

## 採用技術と理由
| 部分 | 採用 | 理由 |
|---|---|---|
| 言語 | JavaScript（ES モジュール、型注釈なし） | リポジトリの共通構成（ビルド不要・CDN なし）に合わせた。TypeScript の型検査は導入していない（未実施事項として TEST_REPORT に記載） |
| ゲームの中核 | 自作（`shared/core.js`）、60Hz 固定・決定的 | 2D と 3D で同じロジックを共有し、リフレッシュレートで速さが変わらない。テストで再生できる |
| 2D 描画 | Canvas 2D（ブラウザの GPU 合成）＋手続き的なベクター描画 | 追加の依存なしで 4K の実画素で描ける。地形はタイル絵を 1 回焼いて並べ、空・霧・色味も焼いて全画面の塗りを減らした |
| 3D / VR | three.js r187（ルートの devDependencies、`vendor/three/` に複製して配信） | WebXR（immersive-vr・local-floor・フォビエーション・フレームレート指定）に対応。追加 addon は BufferGeometryUtils（形の結合）だけ |
| 音 | Web Audio の AudioWorklet で自作の FM（4 オペレータ）＋矩形波＋8bit PCM を合成 | 曲と効果音を差し替えやすいデータ（MML と手順表）で持てる。AudioWorklet が無い環境は ScriptProcessor で同じ音源を回す |
| 保存 | localStorage（1 つの JSON・版番号つき） | 失敗・破損・容量不足でも遊べるよう try/catch と検証つき |

## 依存バージョン（固定）
- three 0.187.0（`package-lock.json`。ルートの package.json は変更していない）
- 実行時の外部 CDN・Web フォント・外部画像は不使用（`tools/check.js` で点検）
- テスト用の IWER 2.8.0 はリポジトリ外（scratchpad）

## 分離
- 出力: `games/tsukikage-castle/dist/`（ルートの `dist/` は build-game.js が作る一時物、git 管理外）
- 保存データの識別子: localStorage キー `tsukikage-castle.v1`（サイトごとに別オリジンなので 2D と 3D の保存は共有されない）
- Netlify: 専用の新規サイト 2 つ（ID は `netlify-sites.json`）。既存の別作品のサイトは使っていない
- サーバー・ポート: 起動していない（ブラウザ確認は Playwright のリクエスト差し替え）
