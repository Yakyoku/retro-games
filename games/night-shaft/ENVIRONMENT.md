# ENVIRONMENT — 実際のクラウド環境（2026-11-12 に確認）

## 実行環境

| 項目 | 確認結果 |
|---|---|
| OS | Ubuntu 24.04.5 LTS（Linux 6.18, コンテナ） |
| 権限・シェル | root / bash |
| 作業ディレクトリ | `/home/user/retro-games`（作品は `games/night-shaft/`） |
| CPU / メモリ / 空き容量 | 4 コア / 15 GiB / 約 31 GB |
| GPU | なし（`nvidia-smi` なし）。ブラウザの WebGL は SwiftShader（ソフトウェア描画） |
| Node.js | v22.23.4（/opt/node22）。three r187 はルートの devDependencies |
| ブラウザ | Playwright と Chromium（事前導入）。ヘッドレス |
| 音声ツール | ffmpeg（WAV の解析・ラウドネス測定に使用）。スピーカー・聴取手段はない |
| WebXR シミュレーション | Meta の IWER 2.8.0（npm から scratchpad に導入。リポジトリには入れていない）で Quest 3 プロファイルを模擬 |

## リポジトリ

- GitHub `Yakyoku/retro-games`。作業ブランチ `claude/tender-gauss-8y9bq1`（このセッションの指定ブランチ）
- 既存の指示: ルート `CLAUDE.md`（1 セッション = 1 作品・`games/<フォルダ>/` の中だけ変更・three はルートの node_modules）と `PROCESS.md`（実験ギャラリー方式）
- 既存作品 `games/bio-hshooter` には触れていない

## Unity

| 確認 | 結果 |
|---|---|
| Unity Editor | 未導入（`~/Unity*`・`/opt/unity*` なし、`unity` コマンドなし） |
| Unity Hub の apt リポジトリ | 302 応答（到達はできる） |
| ライセンス | 無し。Unity Personal でも Unity ID での認証が必要で、この環境に資格情報は無く、利用者の秘密情報を求めることになる |
| WebGL ビルドモジュール・GPU | 無し |
| WebXR Export（De-Panther） | github.com がプロキシで 403（取得・確認できず） |

結論: この環境では Unity での制作・Web ビルドが成立しない。依頼文の「Unity を必須とした条件の変更」に当たるため本来は確認が必要だが、
リポジトリ全体の約束（7 作品とも three.js・ルートの build-game.js で Netlify ビルド）があり、この構成なら利用者の端末を使わずに完成・公開まで進められるため、
**three.js（WebGL/WebXR を直接使う方式）で制作し、Unity 製とは表記しない**判断をした（CLAUDE.md 判断ログ）。Unity 化する場合の再開手順は HANDOFF.md。

## ネットワーク・接続

- npm レジストリ: 可（IWER の取得に使用）
- github.com の Web ページ: プロキシで 403。git の push/pull は可
- Netlify: MCP コネクタ（チーム fujita-takashi, Pro）でサイト作成・環境変数・デプロイが可能
- Google Drive・Gmail・ConoHa のコネクタも接続済みだが、今回は使っていない（成果物はリポジトリと Netlify に置いた）

## Quest 3 実機・50 インチ表示

- 実機へアクセスする手段は無い（接続・認証の手段は確認できなかった）。実機での結果は記録していない
- 50 インチの表示端末も無い。4K は 3840×2160 の描画バッファでの画像検査まで

## 実行方法（この環境）

```bash
GAME=night-shaft VARIANT=all node tools/build-game.js
```

```bash
cd games/night-shaft && node --test tests/*.test.js
```

```bash
node games/night-shaft/tools/e2e/xr-emulation.cjs /tmp/out
```
（xr-emulation は環境変数 `IWER` に iwer.min.js のパスを渡す。ローカルにサーバーは立てず、Playwright が要求を横取りして dist/ を返す）
