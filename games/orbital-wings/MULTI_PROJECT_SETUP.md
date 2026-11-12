# MULTI_PROJECT_SETUP.md — 複数作品との分離と競合防止

## このリポジトリの前提
`Yakyoku/retro-games` は 7 作品が共有する（ルートの CLAUDE.md）。1 セッション = 1 作品で、本作の変更は `games/orbital-wings/` の中だけ。
ルートの `netlify.toml`・`tools/build-game.js`・`package.json` は変更していない（依存の追加もなし。three はルートの既存の devDependencies）。

## 分離の方法
| 対象 | 分け方 |
|---|---|
| ソース | `games/orbital-wings/` に完結（experiments 方式ではなく `2d/`・`3d/`・`shared/`） |
| ビルド出力 | `games/orbital-wings/dist/`（作品ごと）→ build-game.js がルート `dist/` に複製。どちらも .gitignore |
| ビルドの識別 | `dist/build-info.json` に作品 ID・プロジェクト名・公開物のハッシュ（build ID）を書く。トップページの下に表示し、公開版と手元のビルドを照合 |
| 公開先 | 本作専用の Netlify サイト `orbital-wings-gic`（siteId は netlify-sites.json）。環境変数 `GAME=orbital-wings`・`VARIANT=all` |
| 保存データ | localStorage のキーを `orbital-wings-gic:v1` に限定（他作品・同名の過去サイトと混ざらない。オリジンもサイトごとに別） |
| 音源マスター | `games/orbital-wings/audio-masters/`（WAV は再生成できるので git に入れない） |
| 検証用の一時物 | セッションの scratchpad（リポジトリの外）。IWER もそこにだけ導入 |
| サーバー・ポート | 立てていない（Playwright のリクエスト差し替えで検証）。ポートの競合は起きない |

## 排他・照合
- push の前に必ず `git pull --rebase`（他作品のセッションが同時に push することがある）。force push とブランチ削除はしない。
- 公開直前に、netlify-sites.json の siteId・サイト名・ビルド ID とデプロイ結果を照合する。
- 同名の過去サイト（orbital-wings-ow1 / orbital-wings-giur）は別成果物として扱い、変更しない。

## Unity 関連（未検証）
依頼では複数の Unity プロジェクト・Editor の分離（Library/Temp/Logs の共有禁止、Editor PID・プロジェクトパスの照合、バッチビルドの直列化など）を求めていたが、
クラウドで Unity のライセンスを有効化できず、Unity 版は作っていない（ENVIRONMENT.md）。
そのため **2 つの Unity プロジェクトでの同時編集・片側ビルド・接続切り替えの試験は未実施**。
Unity に戻す場合は、プロジェクトごとに別チェックアウト・別 `-projectPath`・別 `-logFile`、バッチビルドの待ち行列化、`Library/` を共有しない構成から始めること。
