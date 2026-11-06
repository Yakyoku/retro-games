# retro-games

このリポジトリの作品は Claude（Claude Code のクラウドセッション）で制作しました。 — MADE WITH CLAUDE

1980 年代前半のアーケードゲームの「仕組みと質感」に影響を受けた**オリジナル作品** 7 本を、
2D ブラウザ版と Meta Quest 3 向け WebXR 版で作るリポジトリです。既存作品の名称・造形・楽曲・効果音は使っていません。

| フォルダ | 作品 | 公開先（Netlify） |
|---|---|---|
| `games/twin-loop/` | LOOPWEAVE | 2D / VR の 2 サイト |
| `games/retro-vshooter/` | NOVA FRONTIER | 2D / VR の 2 サイト |
| `games/retro-hshooter/` | IONFALL | 2D / VR の 2 サイト |
| `games/rapid-vshooter/` | AURORA STRIKE | 2D / VR の 2 サイト |
| `games/retro-digger/` | GEO DIVER | 2D / VR の 2 サイト |
| `games/gothic-platformer/` | ASHEN KNIGHT | 2D / VR の 2 サイト |
| `games/retro-climber/` | IRON SUMMIT | 1 サイト（2D ⇄ VR 相互切替） |

公開 URL は各フォルダの `README.md` と `netlify-sites.json` に記載されます。

## 仕組み

- 各作品は `games/<フォルダ>/` の中で完結する（`experiments/`・`shared/`・`tests/`・`tools/build.js`・`CLAUDE.md` など）
- Netlify サイトごとに環境変数 `GAME`（フォルダ名）と `VARIANT`（`2d` / `vr` / `all`）を設定し、
  ルートの `netlify.toml` → `tools/build-game.js` → `games/<GAME>/tools/build.js` の順にビルドする
- Three.js はルートの `package.json` の devDependencies（npm）。CDN は使わない
