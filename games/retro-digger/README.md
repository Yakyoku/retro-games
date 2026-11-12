# 地底探検：ポンプ・パトロール（PUMP PATROL）— games/retro-digger

この作品は Claude（Claude Code のクラウドセッション）で制作しました。

地中を掘って道を作り、敵を誘い込み、ポンプで膨らませて止め、岩の支えを掘ってまとめて落とす掘削アクション。
1982 年のアーケードゲーム『ディグダグ』の遊びの仕組みに影響を受けたオリジナル作品です（キャラクター・曲・効果音・ステージは書き下ろし。公式製品・提携ではありません）。

- 公開 URL: https://retro-digger-pump-patrol.netlify.app/
  - 2D: `/experiments/01-arcade-2d/`　3D／VR: `/experiments/02-underground-3d/`（`?vr=1` で VR を案内）
  - キャラクター設定資料: `/gallery.html`　サウンドテスト: `/sound-test.html`
  - デバッグ: `?debug=1`（FPS・描画解像度・描画数。N 全滅、I 無敵。練習で全ステージを選べる）

## 遊べるもの

| モード | 対象 | 内容 |
|---|---|---|
| 2D アーケード | パソコン・iPad（横向き推奨） | 地下の断面を正面から見て、上下左右に掘る。6 面・3 地層 |
| 通常 3D | パソコンのブラウザ | 一人称で水平坑道を歩き、目の前の壁を掘る。6 面・3 地層 |
| VR | Meta Quest 3 のブラウザ（WebXR） | 通常 3D と同じ面を没入型 VR で。アプリのインストール・開発者モード不要 |

難易度 3 段階（やさしい／ふつう／むずかしい）、通しプレイと練習（ステージ選択）、チュートリアル（スキップ・再実行可）。
設定・進行・ハイスコアはブラウザ内（localStorage）に保存。2D／通常 3D／VR（移動方式別）・難易度・通し／練習で記録を分ける。

## 操作

**2D**　移動: 矢印／WASD・十字キー／左スティック・画面左のパッド　ポンプ: Space／J・A（RT も可）・右の大きなボタン　一時停止: Esc／P・メニューボタン・右上の II
**通常 3D**　移動: WASD／矢印・左スティック　視点: マウス（クリックで固定、解除で一時停止）・右スティック　掘る／ポンプ: 左クリック・Space・右トリガー　マップ: M・Y　一時停止: Esc／P・メニューボタン
**VR**　利き手トリガー: 土を狙えば掘る／敵を狙えばポンプ（押した瞬間に決まり、離すまで変わらない）　反対の手のスティック: 移動（快適＝1.2m のステップとフェード／スムーズ）　利き手スティック左右: 30°／45° のスナップターン　A／X: マップ　B／Y: 一時停止・設定　左利き設定あり。システム予約ボタン・ハンドトラッキングは使わない
メニューはマウス・タッチ・キーボード・ゲームパッド・VR コントローラー（レーザー／スティック＋A）のどれでも操作できる。

## 構成とビルド

- エンジン: three.js r0.187.0（ルートの `node_modules/three`、CDN 不使用）＋自作の JavaScript。Unity は使っていない（判断の経緯は CLAUDE.md・ENVIRONMENT.md）
- ビルド（リポジトリのルートで）: `GAME=retro-digger VARIANT=all node tools/build-game.js` → `dist/`
- 点検: `node tools/check.js`　テスト: `node --test tests/*.test.js`（作品フォルダで）
- 公開: Netlify サイト `retro-digger-pump-patrol`（環境変数 GAME=retro-digger・VARIANT=all）。詳しくは HANDOFF.md

## 文書

SPEC.md（確定仕様・採用値）／ENVIRONMENT.md（使った環境）／ART_GUIDE.md（美術）／SOUND_REPORT.md（音）／ASSET_LICENSES.md（素材）／TEST_REPORT.md（確認結果）／HANDOFF.md（引き継ぎ）／CLAUDE.md（判断ログ）
