# CLAUDE.md — VOIDBLOOM（games/bio-hshooter/）

この作品は Claude（Claude Code のクラウドセッション）で制作しました。決定事項・調整値・判断ログ・設定資料・未解決をここに残す。

## 目的
1980 年代後半のアーケード横スクロールシューティングの「遊びの仕組み」に影響を受けたオリジナルのトリビュート作品を、
50 インチ 4K ディスプレイ（工程A）と Meta Quest 3 の立体視（工程B）で、高精細・滑らかに遊べる形で作る。
対象は制作者本人（大人）のみ。難易度はアーケード相当。PROCESS.md §9（子ども向け）は適用しない。

## 構成
```
games/bio-hshooter/
├── index.html                 入口（大画面 / Quest 3 の 2 枚のカード、フッターに MADE WITH CLAUDE）
├── gallery.html               設定資料ギャラリー（機体・敵・ボスの 3D モデルを回して見る）
├── sound-test.html            サウンドテスト（曲・効果音・音色）
├── experiments/01-bigscreen/  工程A（4K 大画面）
├── experiments/02-vr-quest3/  工程B（WebXR）
├── shared/                    両方で使う（ルール・ステージ・モデル・描画・音）
├── tests/                     node --test
└── tools/build.js, check.js
```
- ビルド: ルートで `GAME=bio-hshooter VARIANT=all node tools/build-game.js`（dist/ に出る）
- 点検: `node tools/check.js` ／ テスト: `node --test tests/`（作品フォルダで）

## 公開
- Netlify サイト voidbloom-yk（siteId e774d55f-e3e7-434b-b420-0db2c9cc7680、環境変数 GAME=bio-hshooter・VARIANT=all）
- 入口 https://voidbloom-yk.netlify.app/ ／ 大画面 /experiments/01-bigscreen/ ／ Quest 3 /experiments/02-vr-quest3/ ／ /gallery.html ／ /sound-test.html
- デバッグ: どちらも `?debug=1`（FPS・描画数・敵弾数。キー I 無敵 / N 次の面 / G ボス前へ / B ボス撃破 / E 装備一式）、`&inv` で最初から無敵
- 復帰点: checkpoint/bio-hshooter-setup（工程0）・-bigscreen（工程A）・-vr（工程B）

## 判断ログ
- 2026-11-10 依頼文が途中（shared/game-core.js の説明）で切れていた。工程A＝大画面版、工程B＝Quest 3 版と読み、残りの構成は自分で決めた
- 2026-11-10 セッション開始時の作業ディレクトリは別リポジトリ（yakyoku/claude・宇宙望遠鏡ギャラリー）だった。依頼の「複数作品共用の retro-games」に合う
  Yakyoku/retro-games を list_repos で見つけて追加し、そこで作業した。指定ブランチ claude/voidbloom-shooter-dev-si2gx4 は yakyoku/claude 用で、
  retro-games では依頼どおり main に直接 push した
- 2026-11-10 Netlify は 1 サイト（VARIANT=all）にした。入口ページの 2 枚のカードが同じサイト内の 2 つの実験を指すので、URL が 1 つで済む
- 2026-11-10 描画は大画面・VR とも three.js（ルートの node_modules/three r187）の同じ World（shared/render/world.js）。依存は追加していない
- 2026-11-10 3D モデルは外部ファイルを使わず、すべてプリミティブ（回転体・押し出し・ゆがめた二十面体など）から計算で組み立てた（shared/render/models.js）
- 2026-11-10 弾・光線・火花は「盤面と平行な光の板」を 1 回の描画（InstancedBufferGeometry）で出す。VR でもビルボードの向きずれが起きない
- 2026-11-10 ロジックは 60Hz 固定・決定的（乱数は状態に持つ）。描画側は前 tick の位置と補間するので 120Hz の大画面・72/90Hz の Quest でも滑らか
- 2026-11-10 地形はワールド座標、敵・弾は盤面座標。地形に付く敵は anchored でスクロール量だけずらす。視差は「奥にあるものを同じ量だけ動かす」だけで
  自然に生まれる（VR の立体視でも正しい奥行きになる）
- 2026-11-10 音源は AudioWorklet で 1 サンプルずつ合成する自作の 4 オペレータ FM（アルゴリズム 8 種・FB・ADSR）× 8 ＋ 8bit/8kHz 補間なし PCM × 4。
  曲は FM 0〜5・PCM 0〜1、効果音は FM 6・7・PCM 2・3（当時のように効果音が曲の声を奪わないよう分けた）。宇宙の静けさのため薄いエコーだけ足した（当時の基板には無い）
  AudioWorklet が使えない環境は ScriptProcessor で同じ音源を回す
- 2026-11-10 PCM の音（太鼓・爆発）は録音を使わず、計算で作って 8bit に落とした（shared/audio/pcm.js）
- 2026-11-10 曲は自作の MML（shared/audio/mml.js）で書いた。全曲・全トラックの前奏とループ長が小節単位でそろうことをテストで確認
- 2026-11-10 撃つボタンは当時どおり「押すたびに 1 発・押し続けると溜め」。連射は別ボタン（C / X・RT / B・Y）に分けた
- 2026-11-10 ミスで装備（SEED・僚機・速度）をすべて失い、その面の復帰点（各面 4 か所）からやり直す。やり直し直後だけ救済の運び屋が 2 体出る（結晶と加速）
- 2026-11-10 ボスの体力バーを出した（当時の作品には無いことが多いが、覚えて抜ける遊びの手がかりとして）
- 2026-11-10 大画面: 盤面は常に 16:9、HUD は DOM（4K でも文字がにじまない）。描画は devicePixelRatio そのまま＋ HalfFloat・MSAA4 の合成先＋ブルーム（半解像度）。
  FPS が 50 未満の状態が 2 秒続くと描画倍率を 0.85 倍ずつ下げる（オプションで固定も可）
- 2026-11-10 VR: 1u = 5.5cm、盤面 1.76m × 0.99m を目の前 1.55m に固定（頭を動かしても盤面は動かない。画面揺れは使わない）。
  地形・壁・敵は盤面の長方形＋1.6u の外で切り落とす（切り抜き面を毎フレーム計算）。星と星雲は切らない → 「宇宙を覗く窓の中のジオラマ」
- 2026-11-10 VR の文字（HUD・メニュー・バナー）はキャンバスを板に貼る。奥行きテストを切って地形に隠れないようにした。実行時エラーも HUD に赤字で出す
- 2026-11-10 星雲の空は毎フレームのノイズ計算をやめ、面ごとに 1 回 2048×1024（大画面は 4096×2048）のテクスチャに焼く（Quest の GPU 負荷対策）
- 2026-11-10 自己検証: ブラウザを人が開けないため、コンテナ内の headless Chromium（SwiftShader）で公開サイトと dist を開き、例外・画面を確認した。
  VR は Meta の WebXR エミュレーター IWER（Quest 3 プロファイル）で VR 入場・90Hz 指定・トリガー開始・スティック移動・溜め・一時停止を確認。
  サーバーは立てず、Playwright のリクエスト差し替えで dist のファイルを返した（IWER は scratchpad に npm で入れ、リポジトリには入れていない）

## 設定資料（名前・造形・曲・効果音はすべて新規考案）
| 区分 | 名前 | 内容 |
|---|---|---|
| 作品名 | VOIDBLOOM | 虚空に咲いた金属の花（敵勢力の総称でもある） |
| 自機 | SABLE WREN | 黒鉄の細い胴・奥行き方向へ後退した主翼・二基の推進器 |
| 着脱ユニット | SEED | 六枚の鋼の殻に包まれた種子。無敵・小さい敵弾を防ぐ・前後に付く・切り離すと独りで撃つ |
| 僚機 | SPORELET | 上下に付く胞子。敵弾を防ぎ同時に撃つ（最大 2） |
| レーザー | LANCE（青）/ RICOCHET（紅）/ CRAWLER（琥珀） | 貫く槍 / 壁で跳ねる光 / 地形を這う光。同じ色の結晶で Lv3 まで |
| 溜め撃ち | BLOOM BURST | 5 段階。耐久を削りながら貫く |
| 雑魚 | DRIFTLING, HOOKJAW, LANTERN（運び屋）, NODULE, STILTER, PUFF→SPORE, COILWORM, HATCHER→NIT, BULWARK, THISTLE, SKIMMER | 第 1・2・4 面 |
| 艦の部品 | HULL CANNON, STERN ENGINE, LAUNCH VENT→DART | 第 3 面 |
| ボス | OSSUARY BLOSSOM（1 面）/ VESPER COIL（2 面）/ KEEL HEART（3 面）/ HEART OF THE BLOOM（4 面） | 弱点が開く瞬間・顎が開く瞬間・遮蔽板の隙間・花弁を割ってから芯 |
| 面 | GLASS REEF / VEIN CATHEDRAL / GRAVEN ARK（巨大艦 1 隻で 1 面）/ HEART OF THE BLOOM | 硝子の礁 / 脈の聖堂 / 墓標の方舟 / 花芯 |
| 曲 | 虚空の開花（タイトル）, 硝子の礁, 脈の聖堂, 墓標の方舟, 花芯, 開く花弁（ボス）, 虚空の花芯（最終）, WILT（面クリア）, SILENCE（ゲームオーバー）, ASH DAWN（エンディング） | すべて新規作曲（shared/audio/songs.js） |
| 音色 | GRIT BASS, VOID PAD, GLASS BELL, IRON HORN, HOLLOW ORGAN, THORN PLUCK, CHOIR OF HUSKS, DEEP SINE, CHITIN CLAV, COLD STRINGS, RUST LEAD, TINE PIANO, ABYSS DRONE, SPORE STAB ＋効果音用 5 | shared/audio/patches.js |
| 効果音 | 32 種（sound-test.html で一覧） | shared/audio/sfx.js |
詳しい説明文は shared/lore.js（ギャラリーに表示）。

## 調整値
| 項目 | 値 | 場所 |
|---|---|---|
| 盤面 | 32 × 18 u、1 tick = 1/60 秒 | game-core.js |
| 自機の速さ | 6.5 / 8.5 / 10.5 / 12.5 u/s（加速アイテムで段階） | SPEEDS |
| 当たり判定 | 敵弾に対して半径 0.22u、地形・敵の体に対して 0.34u | PLAYER_R / PLAYER_BODY_R |
| 溜め | 押して 8 tick 後から溜まり、66 tick で満タン。0.18 以上で発射、Lv1〜5 の威力 5/12/22/34/50 | CHARGE_* / BURST_POWER |
| SEED | 半径 0.75u、自機から 1.05u、切り離し 28u/s、呼び戻し 24u/s、体当たり 0.35/tick | POD_* |
| 通常弾 | 画面内 6 発まで、44u/s | volley |
| 敵弾の速さ | 種類ごと 4.2〜11u/s × (0.85 + 0.15 × rank)。2 周目は rank 1.3 | fireBullet |
| 残機 | 開始 2（＋表示中の 1 機）、エクステンド 5 万・15 万・30 万・50 万 | EXTENDS |
| スクロール | 1 面 2.2 / 2 面 2.0 / 3 面 2.6 / 4 面 2.2 u/s（各面 約 110〜115 秒＋ボス） | stages.js |
| 大画面カメラ | 縦 30°、盤面がちょうど収まる距離（33.6u）、自機の高さを 5% 追う | 01-bigscreen/app.js |
| ブルーム | 強さ 0.7・半径 0.45・しきい値 0.86（半解像度） | 同上 |
| VR | 1u=5.5cm、距離 1.55m（?dist=）、解像度倍率 1.15（?fb=）、固定フォービエーション 0.35（?fov=）、90Hz を要求 | 02-vr-quest3/app.js |
| VR 再配置 | 両手のグリップを約 1 秒（50 フレーム）、または一時停止メニューの RECENTER | 同上 |

## 未解決・未確認
- 実機（50 インチ 4K と Quest 3）での体感 FPS・見え方・音は未確認（確認はすべて headless Chromium と IWER エミュレーター上）
- 難易度の調整は机上（テストは「各面を最後まで進める・ボスが弱点の開閉で削れる・地形に必ず通れる隙間がある」まで）。実際に通しで遊んだ手応えは未確認
- ハンドトラッキングでの操作は未対応（コントローラー前提）
