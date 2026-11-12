# MULTI_PROJECT_SETUP

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

## 依頼文の「複数の Unity Editor での同時制作対策」について
Unity を使わなかったため（ENVIRONMENT.md）、Unity Editor の識別・接続先の照合・ロック・処理キューは**実装も試験もしていない**。

## この作品で実際にある分離
- 作品フォルダ `games/twin-garden/` の中だけを変更（7 作品が同じリポジトリを共有するため。ルートの CLAUDE.md の約束）
- ビルド出力は作品フォルダの `dist/`（ルートの `dist/` には Netlify のビルドのときだけ複製）
- 保存データのキーは版ごとに別（`twin-garden.2d.v1` / `twin-garden.vr.v1`）。2 つのサイトは別のオリジンなので保存は共有されない
- Netlify は 2 サイト（siteId は DEPLOYMENT.md）。同じチームにある別作品の `twin-garden-unity-2d`・`twin-garden-unity-vr`・`twin-garden-arcade`・`twin-garden-spatial` は触っていない
- push の前に `git pull --rebase`（別の作品のセッションが同時に push することがある）
- 開発サーバー・常駐プロセスは立てていない（ポートの割り当てなし）
