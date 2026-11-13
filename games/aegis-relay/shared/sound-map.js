// AEGIS RELAY — ゲームのできごと → 音（2D 版・3D 版で同じ表を使う）
// docs/SOUND.md の「音イベント対応表」と同じ内容。ここに無いできごと（wave・score など）は無音。
// できごとの x（盤面の横位置 0〜240）は効果音の左右の定位に使う。
import { AREA_SONG, START_SONG } from './audio/songs.js';
import { store, modeOf } from './store.js';

export const EVENT_SE = {
  shot: (e) => (e.docked ? 'shotDocked' : 'shot'),
  hit: () => 'hit',
  // 爆発は大きさで 3 種類（半径 7 以下 = 小 / 8〜10 = 中 / 大型・地上の大物 = 大）。エリアコアは専用
  kill: (e) => (e.type === 'core' ? 'killCore' : e.big ? 'killBig' : e.r >= 8 ? 'killMid' : 'kill'),
  eshot: () => 'eshot',
  die: () => 'die',
  respawn: () => 'respawn',
  partnerFree: () => 'partnerFree',
  dock: () => 'dock',
  partnerLost: () => 'partnerLost',
  twinAppear: () => 'twinAppear',
  twinBreak: () => 'twinBreak',
  twinLocked: () => 'twinLocked',
  chainStep: () => 'chainStep',
  chainBonus: () => 'chainBonus',
  chainFail: () => 'chainFail',
  sigilPing: () => 'sigilPing',
  sigil: () => 'sigil',
  dive: () => 'dive',
  extend: () => 'extend',
  coreMiss: () => 'coreMiss',
};

// 効果音と曲の切り替え。g は sim の状態。毎フレーム呼んでよい（events が空でも呼ぶ。同じ曲は二重に始めない）
export function routeSound(audio, events, g) {
  for (const e of events) {
    const f = EVENT_SE[e.t];
    if (f) audio.se(f(e), { n: e.n, x: e.x });
    // エリア開始: 開始ジングル → （ジングルの終わりにぴったり続けて）ステージ曲
    if (e.t === 'areaStart') audio.playMusic(START_SONG(g.area), () => { if (g.mode !== 'over' && g.phase !== 'clear') audio.playMusic(coreNear(g) ? 'core' : AREA_SONG(g.area)); });
    if (e.t === 'areaClear') audio.playMusic('clear');
    if (e.t === 'die') audio.stopMusic(0.25);
    if (e.t === 'respawn') audio.playMusic(coreNear(g) ? 'core' : AREA_SONG(g.area), null, { skipIntro: true });
    if (e.t === 'coreMiss') audio.playMusic(AREA_SONG(g.area), null, { skipIntro: true, sync: 'bar' });
    // ゲームオーバー: 記録を更新していればハイスコアのジングル
    if (e.t === 'gameover') audio.playMusic(isRecord(g) ? 'hiscore' : 'over');
  }
  // 状況で変わる層: 合体中は上の層、残り 1 機は緊張の層（どちらも次の小節の頭から）
  audio.setLayers?.({ dock: !!g.player.docked, danger: g.mode === 'play' && g.player.alive && g.lives <= 1 });
  // エリアコアが近づいたら、小節の頭でコアの曲へ
  if (g.mode === 'play' && g.phase === 'play' && g.player.alive && audio.musicName === AREA_SONG(g.area) && coreNear(g)) {
    audio.se('coreAlert'); audio.playMusic('core', null, { sync: 'bar' });
  }
}
function coreNear(g) { return g.scroll > g.def.coreWy - 40 && !g.coreBroken; }
function isRecord(g) {
  try { return !g.flags?.tainted && g.score > 0 && g.score > store.best(modeOf(store.settings)); } catch { return false; }
}
