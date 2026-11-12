# AEGIS RELAY（イージス・リレー）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

浮遊大陸と宇宙の戦域を縦に進み、空の編隊と大地の標的を撃ち、支援機とのリレー（合体）で火力を上げ、隠されたボーナスを探してハイスコアを狙う縦スクロールシューティング。1980 年代のアーケード作品に影響を受けた**非公式のオリジナル作品**です（名称・機体・ステージ・曲・効果音はすべて新規）。

## 遊ぶ

- 2D 版（PC・タブレット）: https://aegis-relay-2d.netlify.app/
- 3D 版（通常画面）／ Meta Quest 3 の VR: https://aegis-relay-vr.netlify.app/

### Quest 3 で遊ぶ

1. Quest 3 のブラウザで https://aegis-relay-vr.netlify.app/ を開き、「VR で遊ぶ（Meta Quest 3）」を選ぶ
2. 金色の「VR を開始」を押す（PC との接続や Quest Link は不要）
3. 座ったまま、目の前に浮かぶ戦域を見下ろす。戦域の位置がずれていたら、メニューの「設定」→「正面に合わせ直す（再センタリング）」
4. 左スティックで移動、右トリガーで射撃、A で決定、B / Y でポーズ。メニューは右手のレーザーを向けてトリガーでも選べる

### 操作

| | キーボード | ゲームパッド | タッチ |
|---|---|---|---|
| 移動 | 矢印 / WASD | 左スティック / 十字キー | 左半分をなぞる（浮きスティック） |
| 射撃 | Space / Z（押し続けで連射） | A（南） | 右下の FIRE |
| ポーズ | Esc | Start | 右上の II |

## 構成

```
games/aegis-relay/
├── index.html          入口（サイトごとに 2D だけ / 3D だけを表示、相互リンク）
├── play2d/             2D 版（Canvas 2D。機体・地形はベクターで描き、表示倍率に合わせて描き直す）
├── play3d/             3D 版（three.js r187＋WebXR。通常画面と VR）
├── shared/             2D・3D 共通: ルール（rules.js・sim.js・area-gen.js）、画面の流れ（app.js）、入力、保存、音源・曲、HTML の HUD とメニュー
├── fonts/              M PLUS 1p（OFL）
├── tests/              node --test（ルール・音の予約）
├── tools/build.js      dist/ を作る（VARIANT=2d|vr|all）
├── tools/check.js      静的点検
└── docs/               仕様書・音の資料・素材の出典・テスト結果・検証の画像
```

## ビルドと確認

リポジトリのルートで:

```bash
npm ci
```

```bash
GAME=aegis-relay VARIANT=all node tools/build-game.js
```

作品フォルダで:

```bash
node --test tests/*.test.js
```

```bash
node tools/check.js
```

`dist/` は HTTP で配信して開く（file:// では ES モジュールが読めない）。デバッグは URL に `?debug=1`（FPS・内部解像度の表示、I 無敵 / N 次のエリア / C エリアコア前へ。記録は保存されない）。

## 再公開

Netlify の 2 サイト（netlify-sites.json）は、環境変数 `GAME=aegis-relay` と `VARIANT=2d` / `vr` でビルドが切り替わる。Netlify コネクタの deploy-site（サイト ID を指定）が返す `npx -y @netlify/mcp@latest --site-id … --proxy-path …` を、**リポジトリのルートで**実行する。Netlify 側でリポジトリをアップロードしてビルドする。

## 資料

- [docs/SPEC.md](docs/SPEC.md) 仕様書（採用値・独自調整・未確認事項）
- [docs/SOUND.md](docs/SOUND.md) 音イベント対応表・音源一覧・検証結果
- [docs/ASSETS.md](docs/ASSETS.md) 素材と音の出典・ライセンス
- [docs/TESTS.md](docs/TESTS.md) テスト結果・測定条件・修正記録・実機確認の有無
