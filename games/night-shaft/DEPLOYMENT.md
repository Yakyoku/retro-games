# DEPLOYMENT — Netlify 公開

| サイト | siteId | URL | 環境変数 |
|---|---|---|---|
| night-shaft-2d | 4a2ae0bc-970c-4490-93e9-6be635da3c17 | https://night-shaft-2d.netlify.app/ | GAME=night-shaft, VARIANT=2d |
| night-shaft-quest3 | d32245f6-7f34-4164-ab0f-03d791fc0e25 | https://night-shaft-quest3.netlify.app/ | GAME=night-shaft, VARIANT=vr |

チーム: fujita-takashi（Pro）。どちらもこのセッションで新規作成した（既存サイトは上書きしていない）。

## 仕組み

Netlify のビルドで `node tools/build-game.js`（ルートの netlify.toml）→ `games/night-shaft/tools/build.js` が VARIANT に応じて dist/ を作る。
Unity は使っていないので Netlify のビルド環境に特別な道具は要らない。外部 CDN は使わず three もサイトから配信する。
`_headers`: nosniff・HTML は毎回再検証（max-age=0, must-revalidate）・vendor は 1 日キャッシュ・`Permissions-Policy: xr-spatial-tracking=(self)`。
COOP/COEP は不要（SharedArrayBuffer を使わない）ので設定していない。

## 公開手順（Claude Code のセッションから）

1. コミットする（Netlify はリポジトリの作業ツリーをアップロードしてビルドする）
2. Netlify コネクタの deploy-site（siteId 指定）が返す `npx -y @netlify/mcp@latest --site-id ... --proxy-path ...` を**リポジトリのルートで**実行
3. 「Deploy is ready」を待つ。1 サイトずつ
4. 確認: `build-info.json` の variant・内容ハッシュ、トップの制作注記、Console 例外、404

## 公開後の確認結果（2026-11-12）

| 確認 | 2D | VR |
|---|---|---|
| トップ 200・MIME | text/html | text/html、three.module.js は application/javascript |
| build-info.json の variant | 2d | vr |
| Console 例外・4xx | なし（デスクトップ 1920×1080・iPhone 13 縦横・iPad Pro 11 の模擬） | なし（1440×900） |
| 制作注記が初期表示で見える | 見える（14px/13px/12px/14px、画面内） | 見える（15px） |
| 相互リンク | VR のトップから 2D 版へ。2D のタイトルに「VR 版は別サイト」 | — |

最新の再確認の値は TEST_REPORT.md。
