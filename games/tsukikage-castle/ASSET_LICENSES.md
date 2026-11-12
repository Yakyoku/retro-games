# ASSET_LICENSES — 素材・音源・使用条件

本作は、Claude Codeのクラウドセッションで制作しました。

## 本作で新しく作ったもの（外部素材なし）
| 種類 | 作り方 | 場所 |
|---|---|---|
| 2D の絵（騎士・敵 8 種・ボス 6 体・武器・アイテム・地形・背景） | Canvas 2D のパスとグラデーションをコードで描く | `play2d/art.js`, `play2d/render.js` |
| 3D モデル | three.js の回転体・押し出し・カプセル等を組み合わせて計算で生成 | `play3d/models.js`, `play3d/render3d.js` |
| 地形・空のテクスチャ | 実行時にキャンバスへ描いて生成 | 同上 |
| 曲 14 曲 | 自作 MML で新規作曲 | `shared/audio/songs.js` |
| 効果音 45 種 | 音源の手順表として新規作成 | `shared/audio/sfx.js` |
| 打楽器・ノイズの PCM | 計算で合成し 8bit に量子化（録音なし） | `shared/audio/pcm.js` |
| アイコン | SVG を手書き | `icons/icon.svg` |
| 文章・UI | 新規 | 各ファイル |

既存作品（原作を含む）の画像・スプライト・ロゴ・楽曲・効果音・録音は一切取り込んでいない。原作の公式ロゴは使っていない。

## 同じリポジトリの別作品から複製したコード
| ファイル | 元 | 内容 |
|---|---|---|
| `shared/audio/synth.js` | `games/bio-hshooter/shared/audio/fm-core.js`（VOIDBLOOM、同じ制作者・Claude 制作） | FM 音源。本作で矩形波 3 声の追加・残響の削除・チャンネル構成の変更を行った |
| `shared/audio/mml.js`, `shared/audio/pcm.js` | 同上 | MML コンパイラ（psg トラック追加）・計算で作る PCM |
| `shared/no-zoom.js`, `shared/frame-clock.js`, `shared/error-overlay.js` | 同上 | タブレットの拡大防止・フレーム時間の平滑化・実行時エラー表示 |

## 第三者のソフトウェア
| 名前 | 版 | ライセンス | 用途 |
|---|---|---|---|
| three.js | 0.187.0 | MIT | 3D / WebXR 描画（`vendor/three/three.module.js`, `three.core.js`, `addons/utils/BufferGeometryUtils.js` を配信） |
| Playwright（Chromium） | 1.63.0 | Apache-2.0 | 検証のみ（配信物に含まない） |
| IWER | 2.8.0 | MIT | 検証のみ（WebXR エミュレーター、リポジトリにも含まない） |

## 名称
「月影の魔城」および登場する名前（墓守ガルム、宵の魔女ヘクセ、沼獣ヌマヅチ、翼の守護者、炎騎士ヴァルグ、魔城の主ノクス、夜魔、牙獣、跳ね鬼、鉄塊鬼、呪い石像 等）は本作のための仮称。
「魔界村」は参考作品の表示にのみ用い、本作の名称・ロゴには使っていない。
