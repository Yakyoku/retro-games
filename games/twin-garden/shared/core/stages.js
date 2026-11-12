// ツイン・ガーデン — ステージ定義（通常 12 面・ボーナス 3 種・練習 3 課）
// 盤面 24 × 18。y は下向き。回収対象は「群れ」（中心・数・広がり）から、面ごとに固定のシードで配置を決める（毎回同じ配置）。
import { C, BOARD } from './config.js';
import { makeRng } from './rng.js';

const P = (...xy) => { const a = []; for (let i = 0; i < xy.length; i += 2) a.push({ x: xy[i], y: xy[i + 1] }); return a; };

// テーマ: 1〜4 面 春の庭（meadow）・5〜8 面 夕暮れの池（dusk）・9〜12 面 月夜の花園（moon）
export const THEMES = {
  meadow: { name: '春の庭', ruby: 'はるのにわ' },
  dusk: { name: '夕暮れの池', ruby: 'ゆうぐれのいけ' },
  moon: { name: '月夜の花園', ruby: 'つきよのはなぞの' },
};

// patrol: 巡回型の経路（行き止まりで折り返す）／ chase: 追跡型の出現位置
const RAW = [
  { name: 'はじまりの庭', ruby: 'はじまりのにわ', theme: 'meadow', tip: '4本の杭の内側を、ラインで1周してみよう',
    pegs: P(8, 6, 16, 6, 8, 12, 16, 12),
    mush: [[12, 9, 8, 2.2], [4, 4, 4, 1.6], [20, 14, 4, 1.6], [12, 3, 4, 1.8]],
    plants: P(3, 9, 21, 9, 12, 15), treasure: { x: 20.5, y: 3.5 },
    patrol: [P(2, 2, 22, 2), P(22, 15.5, 2, 15.5)], chase: [] },
  { name: 'ならぶ杭', ruby: 'ならぶくい', theme: 'meadow', tip: '2列の杭を使って、細長い囲みを作ろう',
    pegs: P(6, 6, 12, 6, 18, 6, 6, 12, 12, 12, 18, 12),
    mush: [[9, 9, 6, 1.6], [15, 9, 6, 1.6], [3, 3, 4, 1.4], [21, 3, 4, 1.4]],
    plants: P(12, 3, 3, 15, 21, 15), treasure: { x: 12, y: 15 },
    patrol: [P(12, 1.5, 12, 4.5, 2, 4.5), P(2, 9, 22, 9)], chase: [] },
  { name: 'かどの庭', ruby: 'かどのにわ', theme: 'meadow', tip: '盤の端もラインの一部。角に追い込んで閉じよう',
    pegs: P(4.5, 4.5, 19.5, 4.5, 4.5, 13.5, 19.5, 13.5, 12, 9),
    mush: [[2, 2, 5, 1.2], [22, 2, 5, 1.2], [2, 16, 5, 1.2], [22, 16, 5, 1.2]],
    plants: P(12, 2.5, 6, 9, 18, 9), treasure: { x: 12, y: 13 },
    patrol: [P(8, 2, 16, 2, 16, 7, 8, 7), P(8, 11, 16, 11)], chase: [] },
  { name: 'ひし形', ruby: 'ひしがた', theme: 'meadow', tip: '真ん中の杭に掛けると、ラインが2つに分かれる',
    pegs: P(12, 3, 5, 9, 19, 9, 12, 15, 12, 9),
    mush: [[8.5, 6, 5, 1.3], [15.5, 6, 5, 1.3], [8.5, 12, 5, 1.3], [15.5, 12, 5, 1.3]],
    plants: P(2.5, 2.5, 21.5, 2.5, 12, 16.8), treasure: { x: 3, y: 15 },
    patrol: [P(12, 1, 22, 9, 12, 17), P(2, 6, 2, 12)], chase: [] },

  { name: 'コの字の池', ruby: 'コのじのいけ', theme: 'dusk', tip: 'へこんだ形の中は、口から入って閉じる',
    pegs: P(6, 3.5, 6, 9, 6, 14, 12, 14, 18, 14, 18, 9, 18, 3.5),
    mush: [[12, 7, 10, 2.4], [12, 11, 6, 1.8], [2.5, 9, 4, 1.4], [21.5, 9, 4, 1.4]],
    plants: P(12, 16.5, 3, 3, 21, 3), treasure: { x: 12, y: 4 },
    patrol: [P(3, 16.5, 21, 16.5), P(9, 1.5, 15, 1.5)], chase: [{ x: 21, y: 15 }] },
  { name: 'ふたつの島', ruby: 'ふたつのしま', theme: 'dusk', tip: '赤と青を別々の島へ。左右同時に回そう',
    pegs: P(5, 6, 8.5, 12, 3, 13, 19, 6, 15.5, 12, 21, 13),
    mush: [[5.5, 10, 7, 1.7], [18.5, 10, 7, 1.7], [12, 4, 5, 1.8], [12, 14, 5, 1.6]],
    plants: P(12, 9, 2, 2, 22, 2), treasure: { x: 18.5, y: 15.5 },
    patrol: [P(12, 1.5, 12, 16.5), P(2, 16.5, 9, 16.5)], chase: [{ x: 21, y: 3 }] },
  { name: '回り道', ruby: 'まわりみち', theme: 'dusk', tip: 'ジグザグの杭に順番に掛けると、長いラインになる',
    pegs: P(4, 5, 8, 13, 12, 5, 16, 13, 20, 5),
    mush: [[6, 9, 6, 1.5], [14, 9, 6, 1.5], [10, 15.5, 6, 1.6], [18, 2.5, 6, 1.6]],
    plants: P(2, 16, 22, 16, 12, 1.5), treasure: { x: 10, y: 9 },
    patrol: [P(2, 9, 22, 9), P(22, 1.5, 22, 12)], chase: [{ x: 2, y: 2 }] },
  { name: '杭の輪', ruby: 'くいのわ', theme: 'dusk', tip: '輪の中は宝の匂い。小さく囲んで絞りこもう',
    pegs: P(17, 9, 15.5, 12.5, 12, 14, 8.5, 12.5, 7, 9, 8.5, 5.5, 12, 4, 15.5, 5.5),
    mush: [[12, 9, 8, 2.0], [3, 3, 4, 1.4], [21, 3, 4, 1.4], [3, 15, 4, 1.4], [21, 15, 4, 1.4]],
    plants: P(12, 1.5, 12, 16.5, 2, 9), treasure: { x: 13.5, y: 10 },
    patrol: [P(4, 1.5, 20, 1.5), P(20, 16.5, 4, 16.5)], chase: [{ x: 22, y: 9 }] },

  { name: '月の格子', ruby: 'つきのこうし', theme: 'moon', tip: '格子の1マスずつ囲むと、まとめどりの倍率が上がる',
    pegs: P(6, 4.5, 12, 4.5, 18, 4.5, 6, 9, 12, 9, 18, 9, 6, 13.5, 12, 13.5, 18, 13.5),
    mush: [[9, 6.75, 7, 1.4], [15, 6.75, 7, 1.4], [9, 11.25, 7, 1.4], [15, 11.25, 7, 1.4]],
    plants: P(2.5, 2.5, 21.5, 2.5, 2.5, 15.5, 21.5, 15.5), treasure: { x: 21, y: 9 },
    patrol: [P(3, 1.5, 21, 1.5), P(3, 16.5, 21, 16.5)], chase: [{ x: 2, y: 9 }, { x: 22, y: 6 }] },
  { name: '十字の小道', ruby: 'じゅうじのこみち', theme: 'moon', tip: '十字で4つに分かれた庭。どの角から攻める？',
    pegs: P(12, 3, 12, 6, 12, 12, 12, 15, 5, 9, 8, 9, 16, 9, 19, 9),
    mush: [[6, 5, 7, 1.6], [18, 5, 7, 1.6], [6, 13, 7, 1.6], [18, 13, 7, 1.6]],
    plants: P(12, 9, 2, 2, 22, 16), treasure: { x: 3, y: 16 },
    patrol: [P(12, 1, 12, 17), P(1.5, 9, 22.5, 9)], chase: [{ x: 22, y: 2 }, { x: 2, y: 16.5 }] },
  { name: '散り星', ruby: 'ちりぼし', theme: 'moon', tip: 'ばらばらの杭。近い2本を組にして考えよう',
    pegs: P(4, 4, 9, 7, 15, 3.5, 20, 7.5, 6, 13.5, 13, 12, 19, 14.5),
    mush: [[6.5, 5.5, 6, 1.4], [17.5, 5.5, 6, 1.4], [9.5, 13, 8, 1.8], [16, 13.5, 4, 1.2], [12, 8.5, 4, 1.2]],
    plants: P(2, 9, 22, 11, 12, 16.5), treasure: { x: 16.5, y: 10 },
    patrol: [P(2, 1.5, 22, 1.5, 22, 4), P(2, 16.5, 9, 16.5)], chase: [{ x: 22, y: 16 }, { x: 2, y: 11 }] },
  { name: '迷い庭', ruby: 'まよいにわ', theme: 'moon', tip: '内と外、二重の杭。最後の庭を全部とりきろう',
    pegs: P(9, 6.5, 15, 6.5, 15, 11.5, 9, 11.5, 3.5, 3, 20.5, 3, 20.5, 15, 3.5, 15),
    mush: [[12, 9, 6, 1.4], [12, 3, 6, 1.6], [12, 15, 6, 1.6], [3.5, 9, 5, 1.6], [20.5, 9, 5, 1.6]],
    plants: P(6, 9, 18, 9, 1.5, 1.5, 22.5, 16.5), treasure: { x: 6.5, y: 13.5 },
    patrol: [P(2, 1.5, 22, 1.5, 22, 16.5, 2, 16.5, 2, 1.5), P(7, 4.5, 17, 4.5)], chase: [{ x: 21, y: 9 }, { x: 3, y: 9 }] },
];

const DEFAULT_START = { red: { x: 9, y: 16.6 }, blue: { x: 15, y: 16.6 } };

/** 群れから回収対象の位置を決める（固定シード・棄却法）。杭・出発点・植物・宝・ほかの回収対象から離す */
function placeMush(raw, seed) {
  const rng = makeRng(seed);
  const out = [];
  const m = 0.9;
  const okAt = (x, y) => {
    if (x < m || x > BOARD.w - m || y < m || y > BOARD.h - m) return false;
    for (const p of raw.pegs) if ((p.x - x) ** 2 + (p.y - y) ** 2 < 0.65 ** 2) return false;
    for (const p of raw.plants) if ((p.x - x) ** 2 + (p.y - y) ** 2 < 0.9 ** 2) return false;
    for (const p of out) if ((p.x - x) ** 2 + (p.y - y) ** 2 < 0.8 ** 2) return false;
    const s = raw.start || DEFAULT_START;
    for (const p of [s.red, s.blue]) if ((p.x - x) ** 2 + (p.y - y) ** 2 < 1.6 ** 2) return false;
    return true;
  };
  for (const [cx, cy, n, spread] of raw.mush) {
    let placed = 0, tries = 0;
    while (placed < n && tries < 4000) {
      tries++;
      const r = spread * Math.sqrt(rng.next()) * (1 + tries / 800), a = rng.next() * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (okAt(x, y)) { out.push({ x: +x.toFixed(3), y: +y.toFixed(3) }); placed++; }
    }
    if (placed < n) throw new Error(`stage ${raw.name}: 回収対象を置けない（${cx},${cy}）`);
  }
  return out;
}

function build(raw, i) {
  const s = raw.start || DEFAULT_START;
  return {
    index: i, number: i + 1, name: raw.name, ruby: raw.ruby, theme: raw.theme, tip: raw.tip,
    pegs: raw.pegs, plants: raw.plants, treasure: raw.treasure,
    start: { red: { ...s.red }, blue: { ...s.blue } },
    mush: placeMush(raw, 0x51a9e + i * 7919),
    patrol: raw.patrol, chase: raw.chase,
    bonus: ['memory', 'precision', 'harvest'][i % 3],
  };
}

export const STAGES = RAW.map(build);

// ボーナス 3 種（各 20 秒・危険な敵なし・残機は減らない）
export const BONUS = {
  memory: { id: 'memory', name: '記憶の宝', ruby: 'きおくのたから', tip: '光った場所を覚えて、小さく囲もう',
    pegs: P(6, 5, 12, 5, 18, 5, 6, 13, 12, 13, 18, 13), showSec: 3.0, maxArea: 0.08 * BOARD.area, goodArea: 0.03 * BOARD.area,
    spots: P(9, 9, 15, 9, 4, 9, 20, 9, 12, 2.5, 9, 15.5, 15, 15.5) },
  precision: { id: 'precision', name: 'ぴったり囲み', ruby: 'ぴったりかこみ', tip: '花を、できるだけ小さく囲もう',
    pegs: P(8, 6, 16, 6, 8, 12, 16, 12, 12, 9, 4, 9, 20, 9), maxArea: 0.03 * BOARD.area,
    targets: P(10, 7.5, 14, 10.5, 6, 10.5, 18, 7.5, 12, 14) },
  harvest: { id: 'harvest', name: 'まとめどり', ruby: 'まとめどり', tip: '時間内に、なるべくまとめて捕まえよう',
    pegs: P(6, 6, 12, 4, 18, 6, 18, 12, 12, 14, 6, 12),
    mush: [[9, 9, 9, 1.5], [15, 9, 9, 1.5], [12, 6.5, 6, 1.3], [12, 11.5, 6, 1.3]], plants: [] },
};
BONUS.harvest.mushPos = placeMush({ ...BONUS.harvest, start: DEFAULT_START }, 0xb0b0);

// 練習（必須の敵なし・エネルギーは減らない）
export const LESSONS = [
  { name: '[練習|れんしゅう]1 [杭|くい]に[掛|か]ける', ruby: 'れんしゅう1 くいにかける', theme: 'meadow',
    steps: ['赤（WASD・左スティック）と青（矢印・右スティック）を動かそう', 'ラインを杭に引っ掛けてから、自分のラインを横切ると囲めます', '6ぴき全部を囲んでみよう'],
    pegs: P(8, 8, 16, 8), mush: [[12, 6, 6, 1.6]], plants: [], treasure: null, energy: 100 },
  { name: '[練習|れんしゅう]2 [植物|しょくぶつ]で[回復|かいふく]', ruby: 'れんしゅう2 しょくぶつでかいふく', theme: 'dusk',
    steps: ['エネルギーが0になるとミス（本番では少しずつ減ります）', '植物を囲むと回復。150まで貯めると8秒間むてき', '植物は囲んだあと10秒で芽、20秒で育ちます'],
    pegs: P(6, 6, 18, 6, 12, 12), mush: [[12, 4, 4, 1.4]], plants: P(6, 10, 18, 10, 12, 8, 12, 15.5), treasure: null, energy: 70 },
  { name: '[練習|れんしゅう]3 [宝|たから]さがし', ruby: 'れんしゅう3 たからさがし', theme: 'moon',
    steps: ['どこかに宝が1つ隠れています。大きく囲むと「？」で教えてくれます', '小さく（盤の8%以下）囲むと宝箱が見つかります', '飛び出した6つの宝を囲んで集めよう'],
    pegs: P(6, 5, 12, 5, 18, 5, 6, 13, 12, 13, 18, 13), mush: [[3, 9, 3, 1.2]], plants: P(21, 9), treasure: { x: 15, y: 9 }, energy: 100 },
].map((raw, i) => ({
  index: i, number: i + 1, lesson: true, name: raw.name, ruby: raw.ruby, theme: raw.theme, tip: raw.steps[0], steps: raw.steps,
  pegs: raw.pegs, plants: raw.plants, treasure: raw.treasure, energy: raw.energy,
  start: { red: { ...DEFAULT_START.red }, blue: { ...DEFAULT_START.blue } },
  mush: placeMush({ ...raw, start: DEFAULT_START }, 0x1e55 + i), patrol: [], chase: [], bonus: null,
}));

export { C };
