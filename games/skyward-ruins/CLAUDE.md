# games/skyward-ruins/CLAUDE.md — 作品の記録

## 判断ログ
- 2026-11-12 依頼は既存アーケード作品の再制作だったが、既存作品の名称・キャラクター・造形・音楽・面構成の再現はできないため、仕組みは依頼どおり・デザインはすべて独自に変更（SPEC.md 冒頭）。仮称 Skyward Ruins
- エンジンは依頼どおり Unity。Unity が無かったので 6000.0.64f1 LTS＋WebGL Support を /opt/unity に展開（4.5GB＋1.2GB）。ライセンス未認証でビルド不可 → 利用者の Unity ID が必要。別エンジンには切り替えていない
- ゲーム論理を UnityEngine 非依存の Core に分離 → .NET 8 でテスト（209 項目）。Unity 層は Editor 同梱 DLL＋パッケージのソースで dotnet コンパイルして検証（tools/compile-check）
- URP（WebXR Export 0.20 以降の推奨）、Linear（Unity 6 で WebXR Export の要件）、WebGL2 のみ、スレッドなし（クロスオリジン分離不要）、Brotli＋Netlify _headers
- URP アセットはリフレクションで生成（エディタ処理を URP のソースに依存させない）
- 頭部追跡は Input System の TrackedPoseDriver（<XRHMD>/centerEye*）。WebXR Export のサンプルは旧 TrackedPoseDriver なので、実機で動かなければ legacyinputhelpers の TrackedPoseDriver に切り替える
- フォントは Noto Sans JP Medium の 582 文字サブセット（GitHub raw が使えず Google Fonts の text= 配信で取得）
- Netlify：既存の `skyward-ruins-unity` は別物として触らず、新規 `skyward-ruins-cloud-yk` を作成
- ルートの package.json には依存を足していない。GitHub Actions のワークフローは作品フォルダ外（.github/）になるため ci/ に置き、配置は利用者の確認後
- 地形チャンク高 120 とエリア長 3240（=27 本）を合わせ、エリア切替で帯を描き直さない

## 調整値
SPEC.md の表（Tuning.cs と一致）。

## 未確認事項
TEST_REPORT.md §7 と HANDOFF.md を参照。
