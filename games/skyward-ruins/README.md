# Skyward Ruins（空の遺跡）

このゲームは Claude Code のクラウドセッションで制作しました。

対空射撃と対地爆撃を撃ち分けて進む縦スクロール・シューティング。**Unity 6000.0 LTS（URP・Input System・WebXR Export）**で作り、
同じトップページから **2D アーケード**（PC・タブレット・スマホのブラウザ）と **3D / VR**（通常ブラウザ・Meta Quest 3 の WebXR）を選べます。
自機・敵・要塞・地上絵・曲・効果音はすべて独自デザインです（既存作品の名称・造形・楽曲は使っていません）。

- 公開 URL: https://skyward-ruins-cloud-yk.netlify.app/
  - 2026-11-12 時点は **制作状況ページ**（Unity のライセンス設定待ちで WebGL 版は未公開）。Unity 版を公開するとトップがゲームになり、制作状況は `/status/` に移ります
- Quest 3 での始め方: `QUEST.md`

## 遊び方
| 操作 | キーボード | ゲームパッド | タッチ | Quest Touch Plus |
|---|---|---|---|---|
| 移動 | 矢印 / WASD | 左スティック・十字キー | 画面左をドラッグ | 左スティック |
| 対空（空の敵） | Z | South（A/×）・右トリガー | 右下の「対空」 | 右トリガー |
| 対地（照準の下を爆撃） | X | West（X/□）・左トリガー | 右下の「対地」 | 左トリガー |
| 一時停止 | Esc | Start | — | （メニューはレイ＋トリガー） |

キー・ボタンは設定で変更できます。照準が**金色に点滅**したら、その下に何かが埋まっています。大型要塞は**コアが開いた瞬間に対地攻撃**。
難易度：標準（3 機）／やさしい（5 機・敵弾 70%）／練習（エリア選択・記録なし）。ハイスコアは 2D/3D・難易度・支援設定ごとに端末へ保存。

## フォルダ
```
games/skyward-ruins/
├── unity/SkywardRuins/        Unity プロジェクト（Assets・Packages/manifest.json・ProjectSettings/ProjectVersion.txt）
│   └── Assets/SkywardRuins/
│       ├── Core/              ゲーム論理（UnityEngine 非依存。2D/3D 共通）
│       ├── Runtime/           Unity 層（サービス・2D/3D 表示・進行・UI・入力・音・XR）
│       ├── Editor/            ProjectBuilder（シーン・プレハブ・設定を生成）・BuildScript（WebGL）・XRSetup
│       ├── Tests/Editor/      Unity Test Framework（EditMode）
│       ├── Shaders/ Art/ Audio/ Data/ Fonts/
│   └── Assets/WebGLTemplates/SkywardRuins/   トップページ（制作注記・ロード・失敗案内・VR ボタン）
├── core-tests/                .NET 8 のテスト（Unity 不要）と確認画像の書き出し
├── tools/                     素材生成（gen-sprites / gen-audio / gen-models）・確認画像・compile-check・build.js・check.js
├── ci/                        unity-build.sh（認証→生成→テスト→ビルド）・unity-webgl.yml（GitHub Actions）
├── web/                       制作状況ページ
└── *.md                       ENVIRONMENT / SPEC / REFERENCE / ASSET_LICENSES / AUDIO_REVIEW / TEST_REPORT / HANDOFF / QUEST
```

## ビルドと公開
1. 素材の再生成（任意）: `npm run assets`（このフォルダで）
2. 論理テスト: `cd core-tests && dotnet run`
3. Unity（ライセンスが必要）:
   - クラウドの作業環境: `UNITY_EMAIL=… UNITY_PASSWORD=… UNITY_PATH=/opt/unity/Editor/Unity bash ci/unity-build.sh`
   - GitHub Actions: `ci/unity-webgl.yml` を `.github/workflows/` に置き、Secrets に `UNITY_EMAIL`・`UNITY_PASSWORD`（任意で `NETLIFY_AUTH_TOKEN`）
   - Unity エディタで開く場合: メニュー「Skyward Ruins > 1. プロジェクト一式を生成」→「2. WebGL ビルド」
4. 成果物 `unity/SkywardRuins/Builds/WebGL` を `webgl/` に置くと、`tools/build.js` がトップで配信（Brotli 用 `_headers` 付き）
5. Netlify: サイト `skyward-ruins-cloud-yk`（環境変数 `GAME=skyward-ruins`・`VARIANT=all`）。リポジトリのルートで `GAME=skyward-ruins VARIANT=all node tools/build-game.js` → `node games/skyward-ruins/tools/check.js dist` → デプロイ
