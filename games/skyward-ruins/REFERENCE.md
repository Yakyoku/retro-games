# REFERENCE.md — 参照資料と原作との差分

## 参照した資料（このセッションで実際に開いたもの）
| 資料 | 用途 | 結果 |
|---|---|---|
| De-Panther/unity-webxr-export（GitHub、clone） | 対応 Unity 版、URP 要件、API（WebXRManager / WebXRController / WebXRSettings）、テンプレートの構造、サンプルのカメラリグ構成 | 0.25.0・Unity 6000.0.23f1 以上・URP 推奨・Unity 6 は Linear を確認。テンプレートは Apache-2.0 のものを元に独自化 |
| Unity 配布の releases-linux.json | Editor の版と WebGL モジュールの URL | 6000.0.64f1 LTS を採用 |
| Unity Editor 同梱の Licensing Client `--help` | 認証方法 | Personal は Unity ID が必要 |
| Editor 同梱パッケージ（URP 17.0.4・Input System 1.17.0・uGUI 2.0.0・XR Management 4.5.3・Test Framework 1.6.0） | API の確認とコンパイル検証 | |
| Docker Hub（unityci/editor） | CI イメージのタグ | `ubuntu-6000.0.64f1-webgl-3.2.2` |

## 参照しなかった・できなかったもの
- 依頼文に挙がっていたバンダイナムコの公式ページ、Meta Quest Browser の仕様ページ、Unity XR マニュアル、Claude Code クラウドの説明ページは、**このセッションでは開いていません**（作品を独自デザインにしたため原作資料に基づく再現は行わず、Quest の仕様は実機検証時に確認する項目として HANDOFF に残しました）。
- 原作のゲーム画面・音源・配置データは使っていません。

## 原作（依頼で基準とされた作品）との差分
- **名称・キャラクター・造形・曲・効果音・面構成・地上絵はすべて独自**です。共通なのは、縦スクロールで空中と地上の 2 層を別の武器で攻撃する、地上照準と隠し対象、大型要塞という**遊びの仕組み**だけです。
- 解像度 224×288・機数・得点・連射間隔などは**指示書の推奨初期値**で、原作の値として確認したものではありません（SPEC.md の表で区分）。
- 「1980 年代前半のアーケード基板の音」は、短い波形表を読む方式を一般的な技法として近似したもので、特定の基板・特定の作品の音の再現ではありません。
- 16 エリアの配置は独自構成であり、原作と一致するとは主張しません。
