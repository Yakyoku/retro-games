# MULTI_PROJECT_SETUP — 並行制作の分離

Unity を使っていないため、Unity Editor の多重起動・Library/Temp の分離・Editor 連携ポートの問題はこの作品には存在しない。
代わりに、同じリポジトリを 7 作品のセッションが共有する構成での分離を行った。

## 分離しているもの

| 資源 | 分離のしかた |
|---|---|
| 作業場所 | `games/night-shaft/` だけを変更（ルートの netlify.toml・tools/build-game.js・他作品は不変） |
| ブランチ | このセッションの指定ブランチ `claude/tender-gauss-8y9bq1`。force push・ブランチ削除はしない |
| 生成物 | `games/night-shaft/dist/` → ルート `dist/`（どちらも .gitignore）。ビルドは VARIANT ごとに作り直す |
| ビルド ID | `dist/build-info.json`（game・variant・commit・内容ハッシュ・時刻・ファイル数）。公開後に URL から読み、配信中の版を照合する |
| 公開先 | Netlify サイト ID と VARIANT を `netlify-sites.json` に固定。night-shaft-2d = 2d、night-shaft-quest3 = vr |
| ブラウザ保存 | キー `night-shaft:<2d|vr>:v1`（アプリ名・版・データ版） |
| 検証用の要求 | Playwright は架空のオリジン `https://ns.test/` を要求横取りで返す。ポートを開かない（他セッションのポートと衝突しない） |
| 一時ファイル | セッションの scratchpad に置く（スクリーンショット・IWER・WAV の解析） |

## 直列化

- 同じサイトへのデプロイは 1 回ずつ、完了（Deploy is ready）を待ってから次へ。デプロイ後に build-info.json の内容ハッシュを確認
- Netlify は「リポジトリの作業ツリーをアップロードしてビルド」する方式なので、デプロイ前にコミットしておき、ルートで実行する

## 未検証

- 別の作品のセッションと同時に push・デプロイした状況は試していない（「設定済み」であって「検証済み」ではない）
- 他セッションのプロセスや資源は操作していない
