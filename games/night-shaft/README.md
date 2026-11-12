# NIGHT SHAFT（ナイトシャフト）

このゲームは、Claude Codeのクラウドセッションで制作しました。

夜のビルに屋上から潜入し、エレベーターとエスカレーターを乗り継いで、赤いドアの部屋から機密書類をすべて回収し、1 階の出口から脱出するスパイアクション。
開発上の仮称は「Elevator Mission」。公開タイトルは独自の「NIGHT SHAFT」にした。

> 本作は独自に制作したオリジナル作品です。エレベーターで階を移動しながら書類を集める 1980 年代のアーケード・アクションゲームの遊び方に着想を得ていますが、
> 特定の作品の公式版・移植・再制作ではなく、キャラクター・音楽・効果音・画像はすべてこのセッションで新たに制作したものです。ゲーム会社・Anthropic による制作・監修・認定は受けていません。

## 公開 URL

| 版 | URL | Netlify サイト |
|---|---|---|
| 2D ブラウザ版（デスクトップ・iPad・スマートフォン） | https://night-shaft-2d.netlify.app/ | night-shaft-2d（`GAME=night-shaft` `VARIANT=2d`） |
| Meta Quest 3 WebXR 版（＋画面で遊ぶ 3D） | https://night-shaft-quest3.netlify.app/ | night-shaft-quest3（`GAME=night-shaft` `VARIANT=vr`） |
| WebXR 最小検証シーン | https://night-shaft-quest3.netlify.app/probe/ | 同上 |

Quest 3 では、ヘッドセットのブラウザで上の URL を開き「VR で遊ぶ」を押す（有線接続・アプリ導入は不要）。

## 遊び方

- 全 4 ステージ: 訓練棟（チュートリアル・6 階・書類 2）→ 第1ビル オフィス棟 → 第2ビル 研究・通信棟 → 第3ビル 警備棟（各 30 階・書類 6）
- 書類をすべて持って 1 階の出口へ。敵の全滅は不要。書類が足りないと出口で残り件数と階を知らせる
- 得点: 射撃 100／キック・VR キック 200／照明・昇降機 300／書類 500／脱出 1000

### 2D 版の操作

| 操作 | キーボード | ゲームパッド | タッチ |
|---|---|---|---|
| 移動 | ←→ / A D | 十字キー・左スティック | 左の方向パッド |
| ドア・呼び出し・上り口／乗車中は上昇 | ↑ / W | 上 | 方向パッド上・「操作」 |
| しゃがむ・下り口／乗車中は下降 | ↓ / S | 下 | 方向パッド下 |
| 射撃 | Z | X（PS: □） | 「射撃」 |
| ジャンプ（跳んで当たるとキック） | X / Space | A（PS: ×） | 「ジャンプ」 |
| 一時停止 | Esc | Menu / Start | 右上の II |

### VR 版の操作（右利き。設定で左右入れ替え）

右トリガー 射撃／左トリガー レイでドア・書類・ボタン・メニュー／左スティック テレポート（設定で連続移動）／右スティック左右 30° スナップターン・上下 かごの上昇下降／A しゃがみ切替／B 一時停止／X 仮想キック／Y 横よけ。本当にしゃがむ・横へ動くでも回避できる。

画面で遊ぶ（3D）: WASD 移動・マウス視点・左クリック射撃・E 操作・C しゃがみ・F キック・Q 横よけ・↑↓ かご・Esc メニュー。ゲームパッド: 左スティック移動・右スティック視点・RT 射撃・A 操作・B しゃがみ・X キック・十字上下 かご・Start メニュー。

## 構成

```
games/night-shaft/
├── shared/core/      ゲーム論理（game.js）・ステージ生成（stages.js）・数値（const.js）・保存（save.js）・自動操縦（autopilot.js）
├── shared/audio/     チップ音源風シンセ（synth.js）・オリジナル曲（songs.js）・再生（engine.js）
├── shared/art/       人物の姿勢（pose.js, 2D/3D 共通の IK）・配色（palette.js）
├── experiments/01-2d/       2D 版（Canvas 2D のベクター描画）
├── experiments/02-vr/       VR 版（three.js r187・WebXR）
├── experiments/00-xr-probe/ WebXR 最小検証シーン
├── audio-master/     音源マスター（16bit/44.1kHz WAV、tools/render-audio.js で再生成）
├── tests/            node --test（論理・到達性・音）
└── tools/            build.js / check.js / render-audio.js / pw-serve.cjs / e2e/
```

## ビルド・確認・公開

```bash
npm ci
```

```bash
GAME=night-shaft VARIANT=2d node tools/build-game.js
```

```bash
cd games/night-shaft && node --test tests/*.test.js && node tools/check.js
```

ローカルにサーバーは立てない。ブラウザ確認は Playwright の要求横取り（`tools/pw-serve.cjs`）か、Netlify の公開 URL で行う。公開手順は DEPLOYMENT.md。

## 関連文書

ENVIRONMENT.md・SPEC.md・ART_REFERENCE.md・AUDIO_REFERENCE.md・AUDIO_VERIFICATION.md・QUALITY_REPORT.md・MULTI_PROJECT_SETUP.md・TEST_REPORT.md・ASSET_LICENSES.md・DEPLOYMENT.md・HANDOFF.md・CLAUDE.md（判断ログ）
