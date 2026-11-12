# DEPLOYMENT

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

| 版 | URL | Netlify サイト | siteId | 環境変数 |
|---|---|---|---|---|
| 2D | https://twin-garden-2d.netlify.app/ | twin-garden-2d | aa205250-1c49-4b55-92c6-fa9461228e34 | GAME=twin-garden, VARIANT=2d |
| VR | https://twin-garden-vr.netlify.app/ | twin-garden-vr | 7afaf38a-e64a-4cd5-8c61-e78e83200b85 | GAME=twin-garden, VARIANT=vr |

- 2 つは独立したサイト（1 サイトのパス違いではない）。互いのリンクはタイトルのメニュー「VR 版へ」「2D 版へ」（`shared/ui/menus.js` の `OTHER_SITE`）
- ビルド: リポジトリ共通の `netlify.toml`（`node tools/build-game.js`、公開ディレクトリ `dist`）→ `games/twin-garden/tools/build.js`
- 公開物の識別: 各サイトの `/build-info.json`（variant・commit・build）
- ヘッダー（`dist/_headers`）: `X-Content-Type-Options: nosniff`、HTML などは `max-age=0, must-revalidate`、`/vendor/*` は 1 週間。`Permissions-Policy: xr-spatial-tracking=(self), gamepad=(self), fullscreen=(self)`。事前圧縮ファイルは置かない（Netlify が Accept-Encoding に合わせて圧縮するので Content-Encoding が食い違わない）。COOP/COEP はスレッドを使わないので設定しない。404 を index.html に書き換えるリライトはない
- 更新方法: Netlify コネクタの deploy-site（siteId を指定）が返す `npx -y @netlify/mcp@latest ...` をリポジトリのルートで実行する

## 公開の記録
| 日時（UTC） | 版 | deployId | build-info の build | ソース |
|---|---|---|---|---|
| 2026-11-12 07:50 | 2D | 6af56f9cf55ffa9349ff3fcf | 2d-f244190-mwd8zigm | git 91497b6（作業ツリーをアップロードしてNetlifyでビルド。build-infoのcommitはNetlify側の値で、gitのハッシュとは一致しない） |
| 2026-11-12 07:51 | VR | 6af56fbd8feada19cf235d71 | vr-988d439-mwd90bmx | 同上 |

公開後の確認（headless Chromium で実 URL を開く）: 両サイトとも起動・タイトル・開始ができ、実行時エラー 0 件・HTTP 4xx/5xx 0 件。VR サイトは IWER（Quest 3 プロファイル）で VR 開始まで確認。`/vendor/three/three.module.js` は `application/javascript`。Permissions-Policy・nosniff のヘッダーを確認。
