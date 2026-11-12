# CLAUDE.md — 地底探検：ポンプ・パトロール（games/retro-digger/）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。決定事項・判断ログ・未解決をここに残す。

## 目的
『ディグダグ』（1982・ナムコ）の遊びの仕組み（掘る・膨らませる・岩を落とす）に影響を受けたオリジナル作品を、
2D アーケード（ブラウザ・iPad）、通常 3D（デスクトップ）、Meta Quest 3 の WebXR 没入型 VR で、同じ Netlify サイトから遊べるように作る。対象は大人（PROCESS.md §9 は適用しない）。

## 構成
```
games/retro-digger/
├── index.html                    入口（タイトル・モード選択・制作注記）
├── gallery.html / sound-test.*   設定資料・サウンドテスト
├── experiments/01-arcade-2d/     2D（Canvas 2D）
├── experiments/02-underground-3d/通常 3D ＋ VR（three.js / WebXR）
├── shared/                       config・rules・stages・game2d・game3d・render2d・sprites2d・render3d・models3d・minimap・vrui・ui・input・touch・save・audio/
├── tests/                        node --test tests/*.test.js
└── tools/build.js, check.js, audio-render.js
```
- ビルド: ルートで `GAME=retro-digger VARIANT=all node tools/build-game.js`　点検: `node tools/check.js`　テスト: `node --test tests/*.test.js`
- 公開: Netlify `retro-digger-pump-patrol`（siteId 142a4957-ffb6-45ed-bf0b-b5b7d60e1304、GAME=retro-digger・VARIANT=all）https://retro-digger-pump-patrol.netlify.app/
- 復帰点: `checkpoint/retro-digger-<名前>` ブランチ

## 判断ログ
- 2026-11-12 依頼は「新規 Unity プロジェクト」。コンテナに Unity なし、公式 CI イメージ（unityci/editor 6000.3.28f1 webgl）は取得できたが Docker での起動は権限判定で拒否、ライセンスは利用者のアカウントが必要。
  利用者に 3 案（three.js+WebXR／Unity+GitHub Actions／Unity+Docker）を確認し、「three.js+WebXR に変更」の回答。Unity の成果物はない
- 2026-11-12 作品フォルダは README で予約済みの `games/retro-digger/`（GEO DIVER 枠）。タイトルは依頼の仮題「地底探検：ポンプ・パトロール」にした
- 2026-11-12 作業ブランチ `claude/confident-dirac-88tlfo` に commit し、ルートの約束に従って main にも push する
- 2026-11-12 既存の Netlify サイト pump-patrol-expedition / pumppatrol-unity-20261108 は別の制作物と判断し触れず、新規サイトを作った
- 2026-11-12 キャラクター・曲は原作に似せない（模写・採譜をしない）。原作から借りたのは仕組み（歩くと進む曲、ポンプ、落石、通り抜け、炎）だけ
- 2026-11-12 ロジックは 60Hz 固定刻み・決定的な乱数。描画は前 tick と補間。一時停止中はロジックを呼ばない
- 2026-11-12 2D の掘削跡は 1/8 セル単位の点として記録し、描画側は増えた分だけ足す（大きさが変わったら記録から描き直す）。経路は「セル＋隣とのつながり（辺）」で持つ（薄い壁を残せる）
- 2026-11-12 3D の土は 1 つの InstancedMesh。掘ったセルだけ行列を 0 にする。支えの木枠・結晶はセルごとの物で、掘ると消す
- 2026-11-12 VR は「頭の位置＝主人公の位置」。人工の移動（ステップ・スムーズ）だけロジックで当たりを解き、その差分だけ rig を動かす。当たり判定は頭の位置を 0.12 秒でならした体の位置で行う（頭の小さな揺れで判定が暴れない）。頭が土に入ると暗転
- 2026-11-12 VR の操作は「押した瞬間に掘る／ポンプを決め、離すまで変えない」。システム予約ボタンは使わない（A/X マップ、B/Y 一時停止）
- 2026-11-12 敵の「経路が無い」時間はセルの中心に着いたときだけ数えていたため通り抜けが遅れる不具合 → 毎 tick 数えるよう修正（tests/soak.test.js で全面確認）
- 2026-11-12 音は別エージェントが SOUND_REPORT.md のとおり実装（3 声＋効果音 4 声の自作 WSG 風音源）

## 未確認・残り（TEST_REPORT.md に詳細）
- Quest 3 実機、Safari／iPad 実機、50 インチ実機、音の聴感、VR の快適性
- 実 GPU でのフレーム時間（このコンテナは CPU 描画のため測れない）
