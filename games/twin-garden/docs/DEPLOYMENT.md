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
（公開後に追記）
