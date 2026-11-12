// Sky Climber VR — 効果音（PSG のレジスターを 60Hz ごとに書き換える「ドライバー」方式で作る）。
// 立上りが速く短い音、ノイズの破裂音、音程の素早い上下という当時の効果音の作り方を踏襲（音そのものは新規）。
import { renderFrames, tonePeriod } from './psg.js';
const fr = (a, np = 16) => ({ a, b: null, c: null, np });
const T = (f, v) => ({ p: tonePeriod(f), v, t: true, n: false });
const N = (v) => ({ p: 100, v, t: false, n: true });
const TN = (f, v) => ({ p: tonePeriod(f), v, t: true, n: true });
const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

export const SFX = {
  // 手を伸ばす: 短く上がる「ピッ」
  reach: () => seq(4, (i) => fr(T(700 * Math.pow(1.25, i), 11 - i * 2))),
  // つかむ: 破裂音と低い音で「カッ」
  grab: () => [fr(N(13), 3), fr(TN(220, 11), 6), fr(T(180, 8)), fr(T(160, 4))],
  // 窓がガタガタ動きだす予告（間隔の短い 2 音の往復）
  windowWarn: () => seq(24, (i) => fr(i % 4 < 2 ? T(330, 10 - Math.floor(i / 8)) : T(277, 9 - Math.floor(i / 8)))),
  // 窓が閉まる「バタン」
  windowClose: () => seq(14, (i) => fr(i < 2 ? TN(90, 15) : N(Math.max(0, 14 - i)), 24)),
  windowOpen: () => seq(6, (i) => fr(T(400 + i * 60, 7 - i))),
  // 落下物の口笛のような下降音
  dropFall: () => seq(54, (i) => fr(T(1800 * Math.pow(0.975, i), i < 6 ? 9 : Math.max(4, 9 - Math.floor((i - 6) / 10))))),
  // 割れる「ガシャン」
  dropBreak: () => seq(22, (i) => fr(i < 3 ? TN(160 - i * 20, 15) : N(Math.max(0, 15 - Math.floor(i * 0.7))), i < 6 ? 6 : 12)),
  // 鳥の鳴き声（さえずり 2 回）
  birdCall: () => seq(30, (i) => fr(i % 15 < 7 ? T(2200 + 600 * Math.sin(i * 1.6), 11 - (i % 15)) : null)),
  flap: () => seq(5, (i) => fr(N(8 - i * 2), 2)),
  // ネオンの帯電の予告（ブーンという低いうなり）と放電
  buzz: () => seq(40, (i) => fr(TN(i % 2 ? 100 : 120, 8 + (i % 3)), 28)),
  zap: () => seq(24, (i) => fr(TN(1600 * (1 - (i % 6) / 7), 14 - Math.floor(i / 3)), (i * 7) % 31 + 1)),
  // 鉄骨・ゴンドラのきしみ
  creak: () => seq(30, (i) => fr(T(140 + 30 * Math.sin(i * 0.5), i < 20 ? 8 : 8 - (i - 20)))),
  motor: () => seq(30, (i) => fr(TN(70 + (i % 2) * 6, 7), 30)),
  // 命中: 速い下降
  hit: () => seq(14, (i) => fr(i % 2 ? T(1200 - i * 70, 14) : TN(900 - i * 50, 12), 4)),
  // 落下: 長い下降（演出は短い）
  fall: () => seq(70, (i) => fr(T(900 * Math.pow(0.97, i), Math.max(0, 13 - Math.floor(i / 6))))),
  // 両手を失った警告（再保持の猶予）
  grace: () => seq(18, (i) => fr(i % 6 < 3 ? T(1760, 12) : null)),
  // コンボ: 段階が上がるほど高い
  combo1: () => seq(5, (i) => fr(T([1047, 1319, 1568][Math.min(2, i >> 1)], 11 - i))),
  combo2: () => seq(6, (i) => fr(T([1319, 1568, 2093][Math.min(2, i >> 1)], 12 - i))),
  combo3: () => seq(8, (i) => fr(T([1568, 2093, 2637, 3136][Math.min(3, i >> 1)], 13 - i))),
  respawn: () => seq(16, (i) => fr(T([523, 659, 784, 1047][i >> 2], 11 - (i & 3)))),
  // UI
  uiMove: () => [fr(T(1400, 8)), fr(T(1400, 4))],
  uiOk: () => seq(6, (i) => fr(T(i < 3 ? 988 : 1319, 11 - i))),
  uiBack: () => seq(5, (i) => fr(T(659 - i * 40, 10 - i))),
  floor: () => seq(3, (i) => fr(T(2093, 6 - i * 2))),
};
export function renderSfx(name, sampleRate = 44100) { return renderFrames(SFX[name](), sampleRate, 0.36); }
