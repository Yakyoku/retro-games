# CLAUDE.md（リポジトリ全体の約束事）

このリポジトリの作品は Claude（Claude Code のクラウドセッション）で制作しました。

7 作品が 1 つのリポジトリを共有している。**1 セッション = 1 作品**。セッションの依頼文に書かれた
作品フォルダ `games/<フォルダ>/` の中だけを変更し、その作品の `games/<フォルダ>/CLAUDE.md` を作品の記録として使う。

## 構成

```
retro-games/
├── netlify.toml            ← 全作品共通（変更しない）
├── package.json            ← 全作品共通。devDependencies: three（変更は依存追加のみ・要判断ログ）
├── tools/build-game.js     ← Netlify のビルド入口（変更しない）
├── PROCESS.md              ← 進め方（§9「子ども向け」はこのリポジトリには適用しない）
├── CLAUDE.md               ← このファイル（全体の約束事）
└── games/
    └── <フォルダ>/          ← 作品ごとに完結
        ├── index.html, experiments/, shared/, tests/, tools/build.js, tools/check.js
        ├── package.json（scripts のみ。依存はルートの node_modules を使う）
        ├── netlify-sites.json, CLAUDE.md, README.md
```

## 約束事

- 自分の作品フォルダ以外（他の `games/*`、ルートの netlify.toml・tools/build-game.js）は変更しない。
  ルートの package.json に依存を足すときは作品の CLAUDE.md の判断ログに理由を書く
- 別の作品のセッションが同時に push していることがある。push の前に必ず `git pull --rebase`
- 復帰点はタグではなく `checkpoint/<フォルダ>-<名前>` ブランチ（このプロキシはタグを push できない）
- PR は作らず main に直接 push。force push とブランチ削除はしない
- 公開: Netlify サイトの環境変数 `GAME=<フォルダ>`・`VARIANT=2d|vr|all` でビルドが切り替わる。
  Netlify コネクタの deploy-site が返す `npx -y @netlify/mcp@latest ...` は**リポジトリのルートで**実行する
- three は `node_modules/three`（ルート）。作品の build.js は環境変数 `THREE_DIR`（build-game.js が渡す。
  単体で動かすときは `../../node_modules/three` を既定値に）から `build/three.module.js` などを dist に複製する。
  three は exports で package.json を公開していないので `require.resolve('three/package.json')` は使えない
- 作品フォルダで単体確認するときは `GAME=<フォルダ> VARIANT=all node tools/build-game.js`（リポジトリのルートで）
