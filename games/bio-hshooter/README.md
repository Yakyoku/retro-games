# VOIDBLOOM（games/bio-hshooter/）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。 — MADE WITH CLAUDE

1980 年代後半のアーケード横スクロールシューティングの遊びの仕組み（敵弾を防ぐ着脱式の無敵ユニット・溜め撃ち・
色で性質が変わる 3 種のレーザー・覚えて抜けるステージ）に影響を受けたオリジナル作品です。
既存作品の名称・造形・楽曲・効果音は使っていません。

- 大画面（4K）版: `experiments/01-bigscreen/`
- Meta Quest 3（WebXR）版: `experiments/02-vr-quest3/`
- 設定資料ギャラリー: `gallery.html` ／ サウンドテスト: `sound-test.html`

## 公開 URL
- 入口: https://voidbloom-yk.netlify.app/
- 大画面: https://voidbloom-yk.netlify.app/experiments/01-bigscreen/
- Quest 3: https://voidbloom-yk.netlify.app/experiments/02-vr-quest3/
- 設定資料: https://voidbloom-yk.netlify.app/gallery.html ／ サウンドテスト: https://voidbloom-yk.netlify.app/sound-test.html

## 開発
- 単体ビルド（リポジトリのルートで）: `GAME=bio-hshooter VARIANT=all node tools/build-game.js`
- 点検・テスト（作品フォルダで）: `node tools/check.js` ／ `node --test tests/*.test.js`
