// 音の一覧（ゲームの音確認ページと SOUND_REPORT.md の表のもと）。
// origin: 'original' = 原作で存在を確認できた種類の音（同じ「種類」の音があったことを文字の資料で確かめたもの。
//         音そのものは今回の自作で、原作の音は写していない） / 'extra' = 今回の補助音。
// 根拠の記号: [W] ja.wikipedia「ディグダグ」 [B] basementarcade.com の Dig Dug 音声一覧（曲名・効果音名の一覧）
export const ORIGIN_LABEL = { original: '原作で存在を確認できた種類の音', extra: '今回の補助音' };

const E = (name, kind, origin, ja, trigger, basis = '') => ({ name, kind, origin, originLabel: ORIGIN_LABEL[origin], ja, trigger, basis });

export const events = [
  // 曲
  E('stage-soil', 'music', 'original', '土の層の曲（歩いている間だけ進む）', '面の開始ジングルのあと。プレイヤーが歩くと進み、止まると止まる', '[W]「移動しているときだけ音楽が流れる」[B] DigDug Walking'),
  E('stage-crystal', 'music', 'original', '水晶の層の曲（歩いている間だけ進む）', '同上（水晶の層）', '[W][B] 同上'),
  E('stage-volcano', 'music', 'original', '火山の層の曲（歩いている間だけ進む）', '同上（火山の層）', '[W][B] 同上'),
  E('title', 'music', 'extra', 'タイトル画面の曲', 'タイトル画面を表示している間（歩きに連動しない）'),
  E('tutorial', 'music', 'extra', '練習面の穏やかな曲', '練習面の間（歩きに連動しない）'),
  // ジングル
  E('start', 'jingle', 'original', '面の開始', '面の開始時（約 2.9 秒。終わってから操作開始）', '[B] Game Start'),
  E('clear', 'jingle', 'original', '面クリア', '最後の敵を倒したあと', '[B] Round Clear Music'),
  E('miss', 'jingle', 'original', 'ミス', 'プレイヤーがやられたとき', '[B] DigDug Pre Death / DigDug Death'),
  E('gameover', 'jingle', 'original', 'ゲームオーバー', '残りがなくなったとき', '[B] Game Over Music'),
  E('allclear', 'jingle', 'extra', '全面クリア', '最後の面（火山の層）をクリアしたとき'),
  E('highscore', 'jingle', 'original', 'ハイスコア', '最高得点を更新して名前を入れる前', '[B] High Score Music'),
  // 効果音
  E('ui-move', 'sfx', 'extra', 'メニューの選択移動', 'メニューで項目を移したとき'),
  E('ui-select', 'sfx', 'extra', 'メニューの決定', '決定したとき'),
  E('ui-back', 'sfx', 'extra', 'メニューの戻る', '取り消し・戻るとき'),
  E('ui-pause', 'sfx', 'extra', '一時停止', '一時停止したとき・解除したとき'),
  E('dig', 'sfx', 'extra', '土を掘る小さな音', '新しい土を掘ったとき（内部で 0.09 秒に 1 回までに間引く）'),
  E('pump-shot', 'sfx', 'original', 'ポンプのもりを撃つ', '攻撃ボタンでもりが伸び始めたとき', '[B] Harpoon'),
  E('pump-hit', 'sfx', 'extra', 'もりが敵に刺さる', 'もりが敵に当たった瞬間'),
  E('pump-miss', 'sfx', 'extra', 'もりが空振りで戻る', 'もりが何にも当たらず戻るとき'),
  E('pump-air', 'sfx', 'original', '空気を入れる（段階ごとに高くなる）', 'ポンプを押して敵が 1 段ふくらむごと。opts.stage = 1〜5', '[B] Pumping'),
  E('detach', 'sfx', 'extra', 'もりが外れる', '敵から離れた・方向を変えてもりが外れたとき'),
  E('deflate', 'sfx', 'extra', '1 段しぼむ', 'ふくらんだ敵が 1 段しぼむごと'),
  E('recover-warn', 'sfx', 'extra', '敵が元に戻りそう（ゆらゆら）', '最後の段がしぼむ少し前'),
  E('pop', 'sfx', 'original', '敵が破裂する（かわいい「ポンッ」）', '最大までふくらんで破裂したとき', '[B] Popped Monster'),
  E('ghost-warn', 'sfx', 'extra', 'プクモが砂の幽霊になる予告', '幽霊になる約 1 秒前'),
  E('ghost-on', 'sfx', 'extra', '幽霊になる', 'プクモが土を通り抜け始めたとき'),
  E('ghost-off', 'sfx', 'extra', '幽霊から戻る', 'トンネルに出て元の姿に戻ったとき'),
  E('fire-charge', 'sfx', 'extra', 'ボイランの火のため（予告）', '火を吐く直前（約 0.8 秒）'),
  E('fire-breath', 'sfx', 'original', 'ボイランの火の息', '火を吐いたとき（約 0.8 秒）', '[W] 火を吐く音は「極端に低い音と高い音を組み合わせ」[B] Figer Firing'),
  E('rock-shake', 'sfx', 'extra', '岩がぐらつく', '下を掘られた岩が落ちる前に揺れ始めたとき'),
  E('rock-fall', 'sfx', 'original', '岩が落ちる（下がる音）', '岩が落ち始めたとき', '[B] Rock Fall'),
  E('rock-land', 'sfx', 'extra', '岩が着地する', '岩が止まったとき'),
  E('rock-crush', 'sfx', 'original', '岩で敵をつぶす', '岩が敵をつぶしたとき。opts.stage = つぶした数', '[B] Squashed Monster'),
  E('score-pop', 'sfx', 'extra', '得点表示の小さな鈴', '得点の数字が出たとき'),
  E('extra', 'sfx', 'original', '1UP（残りが増える）', '残りが 1 増えたとき', '[B] Extra Life'),
  E('step', 'sfx', 'extra', 'VR の移動補助（控えめな風）', 'VR で一歩ずつ視点が移るとき'),
  E('tutorial-ok', 'sfx', 'extra', '練習の課題ができた', '練習面で課題を 1 つ達成したとき'),
  // 環境音
  E('amb:soil', 'amb', 'extra', '土の洞窟の環境音（しずく・低い空気）', '土の層の間、曲とは別の系統で小さく'),
  E('amb:crystal', 'amb', 'extra', '水晶の洞窟の環境音（ガラスのようなしずく）', '水晶の層の間'),
  E('amb:volcano', 'amb', 'extra', '火山の洞窟の環境音（地鳴り・溶岩の泡・はぜる音）', '火山の層の間'),
];
export const EVENTS = Object.fromEntries(events.map((e) => [e.name, e]));
