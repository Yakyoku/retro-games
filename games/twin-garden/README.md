# ツイン・ガーデン（TWIN GARDEN）

このリポジトリの作品は Claude（Claude Code のクラウドセッション）で制作しました。 — MADE WITH CLAUDE

赤と青の 2 つの自機を左右別々に動かし、2 つをつなぐラインを杭に掛けて囲み、まとめて捕まえるゲームです。
ナムコ「リブルラブル」の「ラインで囲む」遊びを参考にしたファンメイドの作品で、**公式作品ではありません**。原作の名称・キャラクター・曲・効果音は使っていません。

| 版 | 公開 URL |
|---|---|
| 2D（PC・タブレット） | https://twin-garden-2d.netlify.app/ |
| 3D／VR（Meta Quest 3 のブラウザー・PC の通常 3D） | https://twin-garden-vr.netlify.app/ |

## 操作
| | 赤 | 青 | 決定 | 戻る・一時停止 |
|---|---|---|---|---|
| キーボード | WASD | 矢印キー | Enter / Space | Esc / P |
| ゲームパッド | 左スティック（十字キーも可） | 右スティック | A（PS は ×） | B（PS は ○）・START で一時停止 |
| タブレット | 画面の左半分に指 | 右半分に指 | タップ | 右上の Ⅱ |
| Quest 3 | 左スティック | 右スティック | A / X・レーザー＋トリガー | B / Y |

- キーは「設定 → キー設定」で変えられる。VR は「設定 → VR 操作」で「直接（トリガーを握るとレーザーの先へ向かう）」に切り替えられる
- 遊び方: ラインを杭に掛けて自分のラインを横切る／両端が出会う／両端が同じ外周の辺に着くと、閉じた中が捕まる

## 手元での確認（サーバーは立てない）
```
# リポジトリのルートで
npm ci
GAME=twin-garden VARIANT=all node tools/build-game.js   # dist/ にできる
cd games/twin-garden && node --test tests/*.test.js && node tools/check.js
```
開発・確認の詳細は `docs/`（GAME_DESIGN, ENVIRONMENT, TEST_REPORT, DEPLOYMENT ほか）。
