# HANDOFF — 引き継ぎ

## どこに何があるか

- ソース: GitHub `Yakyoku/retro-games` ブランチ `claude/tender-gauss-8y9bq1` の `games/night-shaft/`
- 公開: https://night-shaft-2d.netlify.app/ ・ https://night-shaft-quest3.netlify.app/ （siteId は netlify-sites.json）
- 音源マスター: `games/night-shaft/audio-master/*.wav`（`node tools/render-audio.js` で再生成）

## 状態

| 項目 | 実装 | ビルド | 公開 | 実機確認 |
|---|---|---|---|---|
| 2D 版（4 ステージ・キーボード・ゲームパッド・タッチ・保存） | 済 | 済 | 済 | 未（端末模擬まで） |
| VR 版（一人称・テレポート/連続移動・スナップターン・VR メニュー・手首 HUD・左利き・座位） | 済 | 済 | 済 | 未（IWER 模擬まで） |
| 画面で遊ぶ 3D | 済 | 済 | 済 | 未（ヘッドレスのみ） |
| WebXR 最小検証シーン /probe/ | 済 | 済 | 済 | 未 |
| オリジナル BGM・効果音 | 済 | 済 | 済 | 聴取は未 |
| Unity プロジェクト | **無し** | — | — | — |
| 原作キャラクター・原音の再現と比較 | **行っていない**（方針上） | — | — | — |

## 未確認項目の再開手順

1. **Quest 3 実機**: ヘッドセットのブラウザで `/probe/` → 入力・描画バッファ・再入場を確認 → 本編。気になる点は CLAUDE.md の「未確認事項」へ
2. **iPhone/iPad 実機**: 2D 版をホーム画面に追加して縦横を回す。タッチの同時押し（移動しながら射撃）
3. **50 インチ・4K**: 設定 → 画質 →「大画面 4K・高画質」。`?debug=1` で fps と描画バッファ
4. **Unity 化したい場合**: Unity Editor・ライセンス・WebGL モジュールのある環境（利用者の Unity ID と承認が必要）で、`shared/core/game.js` の論理を C# に移すのが近道（論理は描画から独立し、テストもある）。WebXR は De-Panther の WebXR Export を公式資料で確認してから

## 気をつけること

- ゲーム論理（shared/core）は 2D・VR 共通。変えたら `node --test tests/*.test.js`（自動操縦による攻略テストが通ること）
- ステージは seed から生成。生成方法を変えると配置が変わるので、テストと SPEC.md §5 の表を更新
- VR の頭の位置は `camera.getWorldPosition`（リグの子）。`renderer.xr.getCamera()` はリグを含まない
- 公開はコミット後にルートで（DEPLOYMENT.md）
